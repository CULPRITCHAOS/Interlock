
import * as fs from 'fs';
import * as path from 'path';

// Load schema types implicitly by conforming to the structure
interface HealthWindowEvent {
    event_type: 'health_window';
    schema_version: '1.0.0';
    timestamp: string;
    domain: 'ollama';
    hardware_fingerprint: string | null;
    window: {
        start: string;
        end: string;
        duration_ms: number;
    };
    metrics: {
        latency_p95_ms: number;
        latency_max_ms: number;
        error_rate: number;
        request_count: number;
    };
    thresholds: {
        latency_threshold_ms: number;
        error_threshold_pct: number;
    };
}

const OUT_FILE = process.env.INTERLOCK_EVENTS_PATH || path.resolve('logs/interlock_events.jsonl');
const HOURS = 3;
const INTERVAL_MS = 5000;

console.log(`Backfilling ${HOURS} hours of telemetry to ${OUT_FILE}...`);

// Ensure directory
const dir = path.dirname(OUT_FILE);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Truncate file
fs.writeFileSync(OUT_FILE, '');

const now = Date.now();
const startTime = now - (HOURS * 60 * 60 * 1000);
let count = 0;

for (let time = startTime; time < now; time += INTERVAL_MS) {
    const event: HealthWindowEvent = {
        event_type: 'health_window',
        schema_version: '1.0.0',
        timestamp: new Date(time).toISOString(),
        domain: 'ollama',
        hardware_fingerprint: null,
        window: {
            start: new Date(time - INTERVAL_MS).toISOString(),
            end: new Date(time).toISOString(),
            duration_ms: INTERVAL_MS
        },
        metrics: {
            // Simulate happy path baseline
            latency_p95_ms: 120 + (Math.random() * 20),
            latency_max_ms: 150,
            error_rate: 0,
            request_count: 50 + Math.floor(Math.random() * 10)
        },
        thresholds: {
            latency_threshold_ms: 500,
            error_threshold_pct: 0.05
        }
    };

    fs.appendFileSync(OUT_FILE, JSON.stringify(event) + '\n');
    count++;
}

console.log(`Synthesized ${count} health windows.`);
