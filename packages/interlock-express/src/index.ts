import { Request, Response, NextFunction } from 'express';
// Relative imports to reuse Core Logic (Monorepo style)
// In a real published package, these would be in @interlock/core
import { ConfidenceMonitor } from '../../../adapters/pinecone/confidence_monitor';
import { LatencyProbe } from '../../../adapters/pinecone/latency_probe';
import { FailureInjector } from '../../../adapters/pinecone/failure_injector';
import { FileIncidentSink, IncidentSink, InterlockEvent } from './sink';
import { startHealthWindowEmitter, recordRequest, MetricsCollector } from './health-window';
import { emitInterventionEvent } from './intervention-emitter';
import { loadLaw, mapLawToHysteresisConfig } from '../../../services/law-loader';
import { Domain } from '../../../services/events.types';
import * as path from 'path';

export interface InterlockOptions {
    dry_run?: boolean;
    quality_floor?: number;
    failure_class?: string;
    incident_file?: string;
    /** SDE integration: domain for telemetry */
    domain?: Domain;
    /** SDE integration: enable JSONL telemetry */
    enable_sde_telemetry?: boolean;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            interlock?: {
                monitor: ConfidenceMonitor;
                failureInjector: FailureInjector;
            }
        }
    }
}

// Global state for Hysteresis/Incident Tracking (Per process)
// Ideally this should be per-instance, but middleware is usually singleton-ish per app.
let incidentId = 0;
let activeIncident: { start: number, events: any[] } | null = null;
let recoveryWindowStart: number | null = null;
const RECOVERY_HYSTERESIS_MS = 5000;

// SDE telemetry state
let metricsCollector: MetricsCollector | null = null;
let healthWindowStopper: (() => void) | null = null;

export function interlockExpress(options: InterlockOptions = {}) {
    const domain: Domain = options.domain || 'ollama';
    const enableSdeTelemetry = options.enable_sde_telemetry ?? true;

    // Load law from disk (SDE integration)
    const lawResult = loadLaw(domain);
    if (lawResult.warnings.length > 0) {
        console.log(`[Interlock] Law warnings: ${lawResult.warnings.join(', ')}`);
    }

    // Use law parameters or options
    const qualityFloor = lawResult.parameters.confidence_floor || options.quality_floor || 0.5;
    const latencyThresholdMs = lawResult.parameters.latency_threshold_ms || 500;
    const errorThresholdPct = lawResult.parameters.error_threshold_pct || 0.05;

    const failureClass = options.failure_class || 'Forced application error (non-user, non-network)';
    const logFile = options.incident_file || path.resolve(process.cwd(), 'docs/LIVE_INCIDENTS.md');
    const dryRun = options.dry_run || false;

    // Initialize Core Logic
    const latencyProbe = new LatencyProbe();
    const failureInjector = new FailureInjector();
    const monitor = new ConfidenceMonitor(latencyProbe, failureInjector, qualityFloor, latencyThresholdMs);
    const sink: IncidentSink = new FileIncidentSink(logFile);

    // Start SDE telemetry (health window emitter)
    if (enableSdeTelemetry) {
        const emitter = startHealthWindowEmitter({
            domain,
            thresholds: {
                latency_threshold_ms: latencyThresholdMs,
                error_threshold_pct: errorThresholdPct
            }
        });
        metricsCollector = emitter.collector;
        healthWindowStopper = emitter.stop;
    }

    console.log(`[Interlock] Middleware initialized. Domain: ${domain}, Quality Floor: ${qualityFloor}, Dry Run: ${dryRun}`);
    console.log(`[Interlock] Law: ${lawResult.law?.law_id || 'defaults'} (hash: ${lawResult.lawHash})`);

    return (req: Request, res: Response, next: NextFunction) => {
        // --- Dashboard Routes ---
        if (req.path === '/dashboard') {
            const dashboardPath = path.resolve(__dirname, 'dashboard.html');
            if (fs.existsSync(dashboardPath)) {
                res.setHeader('Content-Type', 'text/html');
                return res.sendFile(dashboardPath);
            } else {
                return res.status(404).send('Dashboard not found (build issue?)');
            }
        }

        if (req.path === '/interlock/events') {
            const startLine = parseInt(req.query.start as string) || 0;
            const eventsPath = process.env.INTERLOCK_EVENTS_PATH || path.resolve(process.cwd(), 'logs/interlock_events.jsonl');

            if (!fs.existsSync(eventsPath)) {
                return res.json({ status: 'ok', events: [], nextIndex: 0 });
            }

            try {
                // Read file slightly inefficiently but safe for demo
                // Ideally this would use a proper log tailer or keep file handle open
                const content = fs.readFileSync(eventsPath, 'utf-8');
                const lines = content.trim().split('\n');
                const newEvents = lines.slice(startLine).map(line => {
                    try { return JSON.parse(line); } catch (e) { return null; }
                }).filter(Boolean);

                return res.json({
                    status: 'ok',
                    events: newEvents,
                    nextIndex: lines.length
                });
            } catch (e) {
                return res.status(500).json({ error: String(e) });
            }
        }

        const startTime = Date.now();
        // ... rest of middleware ...

        // 3. Response Interception (Metrics) - Attached early to capture all outcomes
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            latencyProbe.record({
                timestamp: Date.now(),
                latencyMs: duration,
                operation: 'query'
            });

            // Record to SDE metrics collector
            if (metricsCollector) {
                const isError = res.statusCode >= 500 && res.statusCode !== 503;
                recordRequest(metricsCollector, duration, isError);
            }

            // Record Failure (500s)
            if (res.statusCode >= 500 && res.statusCode !== 503) {
                // 503 is our intentional refusal, not a crash.
                // 500 is a crash.
                failureInjector.recordSignal({
                    timestamp: Date.now(),
                    type: 'error',
                    severity: 'high',
                    message: `HTTP ${res.statusCode}`
                });
            }
        });

        // 1. Update Monitor
        monitor.update();


        // Attach internals for admin/debug (allow app to trigger failures)
        req.interlock = { monitor, failureInjector };

        // 2. Check Refusal
        if (monitor.shouldRefuse()) {
            // Hysteresis / Incident Logic
            if (!activeIncident) {
                incidentId++;
                activeIncident = { start: Date.now(), events: [] };
                console.log(`[Interlock] 🛡️ Incident #${incidentId} Started`);

                sink.logEvent({
                    incidentId: String(incidentId).padStart(3, '0'), // Header
                    trigger: 'Confidence < Quality Floor',
                    action: 'Traffic Refusal',
                    details: 'Initial refusal triggered',
                    recoveryTime: 0,
                    confidence: monitor.getConfidence(),
                    failureClass
                });

                // Emit SDE intervention event
                if (enableSdeTelemetry) {
                    emitInterventionEvent({
                        domain,
                        trigger: {
                            interlockTrigger: 'confidence_floor_breach',
                            thresholdMs: latencyThresholdMs,
                            observedMs: latencyProbe.getStats().meanMs || 0,
                            confidence: monitor.getConfidence()
                        },
                        action: {
                            interlockAction: 'refuse',
                            priorState: 'closed',
                            newState: 'open'
                        },
                        recovery: {
                            timeMs: 0,
                            probeAttempts: 0,
                            finalState: 'open'
                        },
                        context: {
                            qualityFloorHit: true
                        }
                    });
                }
            }

            // Reset recovery window if we are still refusing
            recoveryWindowStart = null;

            if (!dryRun) {
                res.status(503).json({
                    refused: true,
                    incident_id: incidentId,
                    reason: "Interlock refusal: Confidence below quality floor",
                    retry_after_ms: 5000
                });

                // Record Failure (Refusal is a form of protection, but implies system stress)
                // We don't necessarily count refusal as a "failure" of the system, but the cause was failure.
                return;
            } else {
                console.log('[Interlock Shadow Mode] Would refuse request');
            }
        } else {
            // Healthy / Recovering
            if (activeIncident) {
                if (!recoveryWindowStart) recoveryWindowStart = Date.now();

                if (Date.now() - recoveryWindowStart > RECOVERY_HYSTERESIS_MS) {
                    // Confirm Recovery
                    const duration = (Date.now() - activeIncident.start) / 1000;
                    const recoveryTimeMs = Date.now() - activeIncident.start;

                    sink.logEvent({
                        incidentId: `${String(incidentId).padStart(3, '0')}-A`, // Event A (Resolution)
                        trigger: 'Recovery',
                        action: 'Traffic Refusal / Degraded Mode',
                        details: 'System refused traffic to prevent collapse',
                        recoveryTime: duration,
                        confidence: monitor.getConfidence(),
                        failureClass
                    });

                    // Emit SDE intervention event for recovery
                    if (enableSdeTelemetry) {
                        emitInterventionEvent({
                            domain,
                            trigger: {
                                interlockTrigger: 'recovery',
                                thresholdMs: latencyThresholdMs,
                                observedMs: latencyProbe.getStats().meanMs || 0,
                                confidence: monitor.getConfidence()
                            },
                            action: {
                                interlockAction: 'circuit_close',
                                priorState: 'open',
                                newState: 'closed'
                            },
                            recovery: {
                                timeMs: recoveryTimeMs,
                                probeAttempts: 1,
                                finalState: 'closed'
                            }
                        });
                    }

                    console.log(`[Interlock] ✅ Incident #${incidentId} Resolved`);
                    activeIncident = null;
                    recoveryWindowStart = null;
                }
            }
        }

        // Chaos Injection Check (Testing Mode)
        // This runs ONLY if Refusal check passed (i.e. Confidence is OK or Dry Run)
        if (failureInjector.shouldInjectFailure()) {
            return res.status(500).json({ error: 'Interlock Simulated Failure (Chaos)' });
        }


        next();
    };
}

/**
 * Stop SDE telemetry (cleanup for tests/shutdown)
 */
export function stopSdeTelemetry(): void {
    if (healthWindowStopper) {
        healthWindowStopper();
        healthWindowStopper = null;
    }
    metricsCollector = null;
}

