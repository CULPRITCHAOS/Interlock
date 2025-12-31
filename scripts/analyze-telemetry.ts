/**
 * Telemetry Analysis Script
 * Analyzes the interlock_events.jsonl from the autonomous run
 */

import * as fs from 'fs';
import * as path from 'path';

interface HealthWindowEvent {
    event_type: 'health_window';
    timestamp: string;
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

interface InterventionEvent {
    event_type: 'intervention';
    timestamp: string;
    trigger: string;
    action: string;
    previous_state: string;
    new_state: string;
}

type TelemetryEvent = HealthWindowEvent | InterventionEvent;

const JSONL_PATH = process.env.INTERLOCK_EVENTS_PATH || path.resolve('logs/interlock_events.jsonl');

console.log(`\n=== Analyzing Telemetry from ${JSONL_PATH} ===\n`);

// Read and parse JSONL
const lines = fs.readFileSync(JSONL_PATH, 'utf-8').split('\n').filter(l => l.trim());
const events: TelemetryEvent[] = lines.map(line => JSON.parse(line));

const healthWindows = events.filter(e => e.event_type === 'health_window') as HealthWindowEvent[];
const interventions = events.filter(e => e.event_type === 'intervention') as InterventionEvent[];

console.log(`📊 Total Events: ${events.length.toLocaleString()}`);
console.log(`   - Health Windows: ${healthWindows.length.toLocaleString()}`);
console.log(`   - Interventions: ${interventions.length.toLocaleString()}`);

// Time range
if (healthWindows.length > 0) {
    const startTime = new Date(healthWindows[0].timestamp);
    const endTime = new Date(healthWindows[healthWindows.length - 1].timestamp);
    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

    console.log(`\n⏱️  Time Range:`);
    console.log(`   Start: ${startTime.toLocaleString()}`);
    console.log(`   End:   ${endTime.toLocaleString()}`);
    console.log(`   Duration: ${durationHours.toFixed(2)} hours`);
}

// Latency analysis
const latencies = healthWindows.map(hw => hw.metrics.latency_p95_ms);
const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const maxLatency = Math.max(...latencies);
const minLatency = Math.min(...latencies);

console.log(`\n📈 Latency (P95):`);
console.log(`   Average: ${avgLatency.toFixed(1)}ms`);
console.log(`   Min: ${minLatency.toFixed(1)}ms`);
console.log(`   Max: ${maxLatency.toFixed(1)}ms`);

// Threshold breaches
const thresholdBreaches = healthWindows.filter(hw =>
    hw.metrics.latency_p95_ms > hw.thresholds.latency_threshold_ms
);
const breachRate = (thresholdBreaches.length / healthWindows.length) * 100;

console.log(`\n⚠️  Latency Threshold Breaches:`);
console.log(`   Count: ${thresholdBreaches.length.toLocaleString()} / ${healthWindows.length.toLocaleString()}`);
console.log(`   Rate: ${breachRate.toFixed(1)}%`);

// Request volume
const totalRequests = healthWindows.reduce((sum, hw) => sum + hw.metrics.request_count, 0);
const avgRequestsPerWindow = totalRequests / healthWindows.length;

console.log(`\n📦 Request Volume:`);
console.log(`   Total: ${totalRequests.toLocaleString()}`);
console.log(`   Avg per window: ${avgRequestsPerWindow.toFixed(1)}`);

// Error analysis
const errorRates = healthWindows.map(hw => hw.metrics.error_rate);
const avgErrorRate = errorRates.reduce((a, b) => a + b, 0) / errorRates.length;
const maxErrorRate = Math.max(...errorRates);

console.log(`\n❌ Error Rates:`);
console.log(`   Average: ${(avgErrorRate * 100).toFixed(2)}%`);
console.log(`   Max: ${(maxErrorRate * 100).toFixed(2)}%`);

// Intervention analysis
if (interventions.length > 0) {
    console.log(`\n🔧 Interventions (${interventions.length}):`);

    const triggerCounts: Record<string, number> = {};
    interventions.forEach(i => {
        triggerCounts[i.trigger] = (triggerCounts[i.trigger] || 0) + 1;
    });

    console.log(`   Triggers:`);
    Object.entries(triggerCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([trigger, count]) => {
            console.log(`      - ${trigger}: ${count}`);
        });

    // State transitions
    const transitions: Record<string, number> = {};
    interventions.forEach(i => {
        const key = `${i.previous_state} → ${i.new_state}`;
        transitions[key] = (transitions[key] || 0) + 1;
    });

    console.log(`\n   State Transitions:`);
    Object.entries(transitions)
        .sort((a, b) => b[1] - a[1])
        .forEach(([transition, count]) => {
            console.log(`      - ${transition}: ${count}`);
        });
}

// Latency distribution (buckets)
const buckets = {
    '0-100ms': 0,
    '100-500ms': 0,
    '500-1000ms': 0,
    '1000-2000ms': 0,
    '2000-5000ms': 0,
    '5000ms+': 0
};

latencies.forEach(lat => {
    if (lat < 100) buckets['0-100ms']++;
    else if (lat < 500) buckets['100-500ms']++;
    else if (lat < 1000) buckets['500-1000ms']++;
    else if (lat < 2000) buckets['1000-2000ms']++;
    else if (lat < 5000) buckets['2000-5000ms']++;
    else buckets['5000ms+']++;
});

console.log(`\n📊 Latency Distribution:`);
Object.entries(buckets).forEach(([range, count]) => {
    const pct = (count / latencies.length) * 100;
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`   ${range.padEnd(15)} ${bar} ${pct.toFixed(1)}% (${count})`);
});

console.log('\n');
