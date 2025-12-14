/**
 * Reference Service Monitor
 * =========================
 * 
 * Traffic generator and incident logger.
 * Implements Standard Incident Log Format (Incident > Events).
 * 
 * Features:
 * - Generates steady background traffic
 * - Buffers events during degraded windows
 * - Debounces recovery (Hysteresis) to prevent chattering
 * - Writes standardized log entries to docs/LIVE_INCIDENTS.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const TARGET_URL = 'http://localhost:3000';
const MONITOR_INTERVAL_MS = 1000;
const TRAFFIC_RATE_MS = 500; // 2 req/sec background load
const LOG_FILE = path.resolve(__dirname, '../../docs/LIVE_INCIDENTS.md');
const RECOVERY_HYSTERESIS_MS = 5000; // 5s stable traffic required to close incident

// --- State ---
let totalRequests = 0;
let totalInterventions = 0;
let lastUptime = 0;

// Incident State
let incidentId = 0;
let activeIncident: { start: number, events: any[] } | null = null;
let recoveryWindowStart: number | null = null;

// --- Utils ---
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchJson(method: string, endpoint: string, body?: any) {
    try {
        const res = await fetch(`${TARGET_URL}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: res.status, data: await res.json() };
    } catch (e: any) {
        return { status: 0, error: e.message };
    }
}

// --- Logging ---
function ensureLogFile() {
    if (!fs.existsSync(LOG_FILE)) {
        const header = `# Live Incident Log: Interlock Reference Service

> **Status**: ACTIVE MONITORING
> **Service**: Reference Service (Express + Pinecone)
> **Location**: apps/live-monitor

---

## Confidence Interpretation
- **≥0.8**: High certainty (Normal operation)
- **0.5–0.79**: Moderate certainty (Protective mode preferred)
- **<0.5**: Low certainty (Refusal required)

## Incident History

`;
        fs.writeFileSync(LOG_FILE, header);
    } else {
        // If file exists, try to detect last incident ID?
        // For now, we start from 002 if 001 exists?
        // We'll just define that incidents in this session increment relative to start.
        // In a real DB, we'd query last ID.
        // We'll start at 2 to avoid collision with the manual 001.
        if (incidentId === 0) incidentId = 1;
    }
}

function flushIncident() {
    if (!activeIncident || activeIncident.events.length === 0) return;

    incidentId++;
    const paddedId = String(incidentId).padStart(3, '0');
    const startTime = new Date(activeIncident.start).toISOString();
    const endTime = new Date().toISOString();

    // Header
    let entry = `
### Incident #${paddedId}: Circuit Breaker Activation
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: ${startTime} → ${endTime}
- **Trigger**: Latency/Failure Threshold Exceeded

`;

    // Events
    activeIncident.events.forEach((evt, idx) => {
        const evtId = `${paddedId}-${String.fromCharCode(65 + idx)}`; // 001-A, 001-B
        entry += `#### Event ${evtId}
- **Timestamp**: ${evt.timestamp}
- **Action**: ${evt.action}
- **Outcome**: ${evt.details}
- **Recovery time**: ${evt.recoveryTime}s
- **Confidence**: ${evt.confidence.toFixed(2)} (Moderate)

`;
    });

    fs.appendFileSync(LOG_FILE, entry);
    console.log(`📝 Incident #${paddedId} logged with ${activeIncident.events.length} events`);

    activeIncident = null; // Reset
    recoveryWindowStart = null;
}

// --- Traffic Generator ---
async function startTraffic() {
    console.log('🚦 Traffic Generator: STARTED');
    while (true) {
        const { status, data } = await fetchJson('POST', '/search', { vector: [] });
        totalRequests++;

        // Detection Logic
        if (status === 503) {
            // Degraded / Intervention
            recoveryWindowStart = null; // Reset recovery timer

            if (!activeIncident) {
                // New Incident
                activeIncident = { start: Date.now(), events: [] };
                console.log('🛡️ INTERLOCK INTERVENTION DETECTED (Start of Incident)');
            }

            // We log the 503 if it's the FIRST of the batch, or if it's a recurrence within the incident?
            // To prevent flooding, we only log "Event" when we have a new distinctive outcome?
            // Or we log an event when we RECOVER from a burst?
            // Actually, standard usually logs "State Change".
            // 200 -> 503 (Start Incident or New Event)
            // 503 -> 200 (End Event)

            // Since we are polling at 2Hz, logging every 503 is bad.
            // We will log ONE event for the continuous block of 503s upon recovery?

            // Let's assume the "Action" is continuous refusal.
            // This implementation buffers the "Outcome" to be written upon recovery.

        } else if (status === 200) {
            // Healthy
            if (activeIncident) {
                if (!recoveryWindowStart) {
                    recoveryWindowStart = Date.now();
                    // We just finished a burst of 503s.
                    // Record an event for this burst?
                    // Yes.
                    const duration = (Date.now() - activeIncident.start) / 1000; // Approx logic
                    // Better logic: track last 503 timestamp?

                    // Simple logic for now: One Incident = One massive event usually.
                    // If multiple bursts happen inside one incident logic (because hysteresis keeps it open), we'll see multiple events.

                    activeIncident.events.push({
                        timestamp: new Date().toISOString(),
                        action: 'Traffic Refusal / Degraded Mode',
                        details: 'System refused traffic to prevent collapse during injected failure',
                        recoveryTime: duration.toFixed(1),
                        confidence: data.meta?.confidence || 0
                    });
                }

                if (Date.now() - recoveryWindowStart > RECOVERY_HYSTERESIS_MS) {
                    // Confirm Resolution (Close Incident)
                    totalInterventions++;
                    flushIncident();
                    console.log('✅ System Recovered (Incident Closed)');
                }
            }
        }

        await sleep(TRAFFIC_RATE_MS);
    }
}

// --- Status Monitor ---
async function startMonitor() {
    console.log('❤️ Health Monitor: STARTED');
    ensureLogFile();

    while (true) {
        const { status, data } = await fetchJson('GET', '/health');
        if (status === 200) {
            process.stdout.write(`\r[Monitor] Uptime: ${(process.uptime()).toFixed(0)}s | Reqs: ${totalRequests} | Interventions: ${totalInterventions} | Conf: ${(data.metrics.confidenceScore * 100).toFixed(0)}%   `);
            lastUptime = Date.now();
        } else {
            process.stdout.write(`\r[Monitor] ⚠️ Service Unreachable or Error`);
        }
        await sleep(MONITOR_INTERVAL_MS);
    }
}

// --- Main ---
async function main() {
    await sleep(2000);
    startMonitor();
    startTraffic();
}

main();
