import { Request, Response, NextFunction } from 'express';
import { ConfidenceMonitor } from '../../../adapters/pinecone/confidence_monitor';
import { LatencyProbe } from '../../../adapters/pinecone/latency_probe';
import { FailureInjector } from '../../../adapters/pinecone/failure_injector';
import { FileIncidentSink, IncidentSink } from './sink';
import { startHealthWindowEmitter, recordRequest, MetricsCollector } from './health-window';
import { emitInterventionEvent } from './intervention-emitter';
import { loadLaw } from '../../../services/law-loader';
import { Domain } from '../../../services/events.types';
import { initKernelStamp } from '../../../services/kernel/eventStamp';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type EnforcementMode = 'ENFORCE' | 'SHADOW_ONLY';
export type EnforcementAction = 'ALLOW' | 'DEGRADE' | 'REFUSE' | 'BLOCK';
export interface EnforcementDecision {
    mode: EnforcementMode;
    action: EnforcementAction;
    reason: string;
    law_hash: string;
    request_id?: string;
    stream_id?: string;
    action_taken: string;
    status_code: number;
    timestamp: string;
}

export interface InterlockOptions {
    dry_run?: boolean;
    quality_floor?: number;
    failure_class?: string;
    incident_file?: string;
    domain?: Domain;
    enable_sde_telemetry?: boolean;
    workload?: { model_id: string; provider: string };
    /**
     * Explicit local/demo control-plane paths that must remain reachable even
     * when data-plane traffic is being refused. Defaults to no bypass.
     */
    control_plane_paths?: string[];
}

declare global { namespace Express { interface Request { interlock?: { monitor: ConfidenceMonitor; failureInjector: FailureInjector; } } } }
let incidentId = 0;
let activeIncident: { start: number, events: any[] } | null = null;
let recoveryWindowStart: number | null = null;
const RECOVERY_HYSTERESIS_MS = 5000;
let metricsCollector: MetricsCollector | null = null;
let healthWindowStopper: (() => void) | null = null;

function emitEnforcementTelemetry(decision: EnforcementDecision): void {
    console.log('[Interlock Enforcement]', JSON.stringify(decision));
}

export function interlockExpress(options: InterlockOptions = {}) {
    const domain: Domain = options.domain || 'ollama';
    const enableSdeTelemetry = options.enable_sde_telemetry ?? true;
    const lawResult = loadLaw(domain);
    const qualityFloor = options.quality_floor ?? lawResult.parameters.confidence_floor ?? 0.5;
    const latencyThresholdMs = lawResult.parameters.latency_threshold_ms || 500;
    const errorThresholdPct = lawResult.parameters.error_threshold_pct || 0.05;
    const failureClass = options.failure_class || 'Forced application error (non-user, non-network)';
    const logFile = options.incident_file || path.resolve(process.cwd(), 'docs/LIVE_INCIDENTS.md');
    const dryRun = options.dry_run || false;
    const latencyProbe = new LatencyProbe();
    const failureInjector = new FailureInjector();
    const monitor = new ConfidenceMonitor(latencyProbe, failureInjector, qualityFloor, latencyThresholdMs);
    const sink: IncidentSink = new FileIncidentSink(logFile);
    const controlPlanePaths = new Set(options.control_plane_paths ?? []);

    if (enableSdeTelemetry) {
        initKernelStamp(options.workload ?? { model_id: 'gemma3:1b', provider: domain });
        const emitter = startHealthWindowEmitter({ domain, thresholds: { latency_threshold_ms: latencyThresholdMs, error_threshold_pct: errorThresholdPct } });
        metricsCollector = emitter.collector;
        healthWindowStopper = emitter.stop;
    }

    return (req: Request, res: Response, next: NextFunction) => {
        if (req.path === '/dashboard') {
            const dashboardPath = path.resolve(__dirname, 'dashboard.html');
            if (fs.existsSync(dashboardPath)) {
                res.setHeader('Content-Type', 'text/html');
                return res.sendFile(dashboardPath);
            }
            return res.status(404).send('Dashboard not found (build issue?)');
        }

        if (req.path === '/interlock/events') {
            const startLine = parseInt(req.query.start as string) || 0;
            const eventsPath = process.env.INTERLOCK_EVENTS_PATH || path.resolve(process.cwd(), 'logs/interlock_events.jsonl');
            if (!fs.existsSync(eventsPath)) return res.json({ status: 'ok', events: [], nextIndex: 0 });
            try {
                const content = fs.readFileSync(eventsPath, 'utf-8');
                const lines = content.trim().split('\n');
                const newEvents = lines.slice(startLine).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
                return res.json({ status: 'ok', events: newEvents, nextIndex: lines.length });
            } catch (e) {
                return res.status(500).json({ error: String(e) });
            }
        }

        if (req.path.includes('/stream')) {
            return res.status(501).json({
                error: 'Streaming enforcement unsupported without protocol adapter',
                enforcement_todo: ['SSE/NDJSON fatal event then close', 'WebSocket close code 1008', 'raw/unknown transport abort']
            });
        }

        if (controlPlanePaths.has(req.path)) {
            req.interlock = { monitor, failureInjector };
            return next();
        }

        const startTime = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            latencyProbe.record({ timestamp: Date.now(), latencyMs: duration, operation: 'query' });
            if (metricsCollector) {
                const isError = res.statusCode >= 500 && res.statusCode !== 503;
                if (!(dryRun && (res.statusCode === 503 || res.statusCode === 429))) recordRequest(metricsCollector, duration, isError);
            }
            if (res.statusCode >= 500 && res.statusCode !== 503) {
                failureInjector.recordSignal({ timestamp: Date.now(), type: 'error', severity: 'high', message: `HTTP ${res.statusCode}` });
            }
        });

        monitor.update();
        req.interlock = { monitor, failureInjector };

        const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}`;
        const decision: EnforcementDecision = monitor.shouldRefuse() ? {
            mode: dryRun ? 'SHADOW_ONLY' : 'ENFORCE', action: 'REFUSE', reason: 'Interlock refusal: Confidence below quality floor',
            law_hash: lawResult.lawHash, request_id: requestId,
            action_taken: dryRun ? 'WOULD_REFUSE' : 'REFUSED', status_code: 503, timestamp: new Date().toISOString()
        } : {
            mode: dryRun ? 'SHADOW_ONLY' : 'ENFORCE', action: 'ALLOW', reason: 'Policy allows request', law_hash: lawResult.lawHash,
            request_id: requestId, action_taken: dryRun ? 'WOULD_ALLOW' : 'ALLOWED', status_code: 200, timestamp: new Date().toISOString()
        };
        emitEnforcementTelemetry(decision);

        if (decision.action === 'REFUSE' || decision.action === 'BLOCK' || decision.action === 'DEGRADE') {
            if (!activeIncident) {
                incidentId++;
                activeIncident = { start: Date.now(), events: [] };
                sink.logEvent({ incidentId: String(incidentId).padStart(3, '0'), trigger: 'Confidence < Quality Floor', action: 'Traffic Refusal', details: 'Initial refusal triggered', recoveryTime: 0, confidence: monitor.getConfidence(), failureClass });
                if (enableSdeTelemetry) {
                    emitInterventionEvent({ domain, trigger: { interlockTrigger: 'confidence_floor_breach', thresholdMs: latencyThresholdMs, observedMs: latencyProbe.getStats().meanMs || 0, confidence: monitor.getConfidence() }, action: { interlockAction: 'refuse', priorState: 'closed', newState: 'open' }, recovery: { timeMs: 0, probeAttempts: 0, finalState: 'open' }, context: { qualityFloorHit: true } });
                }
            }
            recoveryWindowStart = null;
            if (decision.mode === 'ENFORCE') return res.status(decision.status_code).json({ refused: true, incident_id: incidentId, reason: decision.reason, retry_after_ms: 5000, decision });
        } else if (activeIncident) {
            if (!recoveryWindowStart) recoveryWindowStart = Date.now();
            if (Date.now() - recoveryWindowStart > RECOVERY_HYSTERESIS_MS) {
                const duration = (Date.now() - activeIncident.start) / 1000;
                const recoveryTimeMs = Date.now() - activeIncident.start;
                sink.logEvent({ incidentId: `${String(incidentId).padStart(3, '0')}-A`, trigger: 'Recovery', action: 'Traffic Refusal / Degraded Mode', details: 'System refused traffic to prevent collapse', recoveryTime: duration, confidence: monitor.getConfidence(), failureClass });
                if (enableSdeTelemetry) emitInterventionEvent({ domain, trigger: { interlockTrigger: 'recovery', thresholdMs: latencyThresholdMs, observedMs: latencyProbe.getStats().meanMs || 0, confidence: monitor.getConfidence() }, action: { interlockAction: 'circuit_close', priorState: 'open', newState: 'closed' }, recovery: { timeMs: recoveryTimeMs, probeAttempts: 1, finalState: 'closed' } });
                activeIncident = null; recoveryWindowStart = null;
            }
        }

        if (failureInjector.shouldInjectFailure()) return res.status(500).json({ error: 'Interlock Simulated Failure (Chaos)' });
        next();
    };
}

export function stopSdeTelemetry(): void {
    if (healthWindowStopper) {
        healthWindowStopper();
        healthWindowStopper = null;
    }
    metricsCollector = null;
}
