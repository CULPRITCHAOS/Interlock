import { Request, Response, NextFunction } from 'express';
// Relative imports to reuse Core Logic (Monorepo style)
// In a real published package, these would be in @interlock/core
import { ConfidenceMonitor } from '../../../adapters/pinecone/confidence_monitor';
import { LatencyProbe } from '../../../adapters/pinecone/latency_probe';
import { FailureInjector } from '../../../adapters/pinecone/failure_injector';
import { FileIncidentSink, IncidentSink, InterlockEvent } from './sink';
import * as path from 'path';

export interface InterlockOptions {
    dry_run?: boolean;
    quality_floor?: number;
    failure_class?: string;
    incident_file?: string;
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

export function interlockExpress(options: InterlockOptions = {}) {
    const qualityFloor = options.quality_floor || 0.5;
    const failureClass = options.failure_class || 'Forced application error (non-user, non-network)';
    const logFile = options.incident_file || path.resolve(process.cwd(), 'docs/LIVE_INCIDENTS.md');
    const dryRun = options.dry_run || false;

    // Initialize Core Logic
    const latencyProbe = new LatencyProbe();
    const failureInjector = new FailureInjector();
    const monitor = new ConfidenceMonitor(latencyProbe, failureInjector, qualityFloor);
    const sink: IncidentSink = new FileIncidentSink(logFile);

    console.log(`[Interlock] Middleware initialized. Quality Floor: ${qualityFloor}, Dry Run: ${dryRun}`);

    return (req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();

        // 3. Response Interception (Metrics) - Attached early to capture all outcomes
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            latencyProbe.record({
                timestamp: Date.now(),
                latencyMs: duration,
                operation: 'query'
            });

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

                    sink.logEvent({
                        incidentId: `${String(incidentId).padStart(3, '0')}-A`, // Event A (Resolution)
                        trigger: 'Recovery',
                        action: 'Traffic Refusal / Degraded Mode',
                        details: 'System refused traffic to prevent collapse',
                        recoveryTime: duration,
                        confidence: monitor.getConfidence(),
                        failureClass
                    });

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
