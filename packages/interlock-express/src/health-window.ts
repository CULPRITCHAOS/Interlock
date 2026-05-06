/**
 * Health Window Emitter
 * ======================
 * Emits periodic health_window events for SDE consumption.
 * This provides negative evidence (liveness) even with low traffic.
 */

import {
    HealthWindowEvent,
    Domain,
    getHardwareFingerprint
} from '../../../services/events.types.ts';
import { stampEvent } from '../../../services/kernel/eventStamp.ts';
import { getJsonlSink } from './jsonl-sink.ts';

const DEFAULT_HEALTH_WINDOW_MS = 5000; // 5 seconds

export interface HealthWindowOptions {
    domain: Domain;
    intervalMs?: number;
    thresholds: {
        latency_threshold_ms: number;
        error_threshold_pct: number;
    };
}

export interface MetricsCollector {
    latencies: number[];
    errorCount: number;
    requestCount: number;
    windowStart: Date;
}

/**
 * Create a new metrics collector for the current window
 */
export function createMetricsCollector(): MetricsCollector {
    return {
        latencies: [],
        errorCount: 0,
        requestCount: 0,
        windowStart: new Date()
    };
}

/**
 * Record a request in the metrics collector
 */
export function recordRequest(collector: MetricsCollector, latencyMs: number, isError: boolean): void {
    collector.latencies.push(latencyMs);
    collector.requestCount++;
    if (isError) collector.errorCount++;
}

/**
 * Reset a collector in place so references held by middleware remain valid.
 */
export function resetMetricsCollector(collector: MetricsCollector): void {
    collector.latencies.length = 0;
    collector.errorCount = 0;
    collector.requestCount = 0;
    collector.windowStart = new Date();
}

/**
 * Calculate P95 latency from array of latencies
 */
function calculateP95(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || sorted[sorted.length - 1];
}

/**
 * Calculate max latency from array
 */
function calculateMax(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    return Math.max(...latencies);
}

/**
 * Build a health window event from collected metrics
 */
export function buildHealthWindowEvent(
    collector: MetricsCollector,
    domain: Domain,
    thresholds: { latency_threshold_ms: number; error_threshold_pct: number }
): HealthWindowEvent {
    const now = new Date();
    const durationMs = now.getTime() - collector.windowStart.getTime();

    const latencyP95 = calculateP95(collector.latencies);
    const latencyMax = calculateMax(collector.latencies);
    const errorRate = collector.requestCount > 0
        ? collector.errorCount / collector.requestCount
        : 0;

    const event = {
        event_type: 'health_window',
        schema_version: '1.0.0',
        timestamp: now.toISOString(),
        domain,
        hardware_fingerprint: getHardwareFingerprint(),
        window: {
            start: collector.windowStart.toISOString(),
            end: now.toISOString(),
            duration_ms: durationMs
        },
        metrics: {
            latency_p95_ms: latencyP95,
            latency_max_ms: latencyMax,
            error_rate: errorRate,
            request_count: collector.requestCount
        },
        thresholds: {
            latency_threshold_ms: thresholds.latency_threshold_ms,
            error_threshold_pct: thresholds.error_threshold_pct
        },
        margin: latencyP95 > 0 ? {
            latency_headroom_ms: thresholds.latency_threshold_ms - latencyP95,
            description: latencyP95 < thresholds.latency_threshold_ms
                ? 'Within threshold'
                : 'Threshold exceeded'
        } : undefined
    };

    return stampEvent(event) as HealthWindowEvent;
}

/**
 * Start the health window emission loop
 */
export function startHealthWindowEmitter(options: HealthWindowOptions): {
    collector: MetricsCollector;
    stop: () => void;
} {
    const intervalMs = options.intervalMs ||
        parseInt(process.env.INTERLOCK_HEALTH_WINDOW_MS || '', 10) ||
        DEFAULT_HEALTH_WINDOW_MS;

    const collector = createMetricsCollector();
    const sink = getJsonlSink();

    const interval = setInterval(() => {
        // Build and emit the health window event
        const event = buildHealthWindowEvent(collector, options.domain, options.thresholds);
        sink.emit(event);

        // Reset collector for next window without invalidating middleware references
        resetMetricsCollector(collector);
    }, intervalMs);

    console.log(`[Interlock] Health window emitter started (interval: ${intervalMs}ms)`);

    return {
        collector,
        stop: () => {
            clearInterval(interval);
            console.log('[Interlock] Health window emitter stopped');
        }
    };
}
