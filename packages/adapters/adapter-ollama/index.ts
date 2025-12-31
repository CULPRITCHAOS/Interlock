/**
 * Ollama Adapter
 * ===============
 * Reference adapter for the ollama domain.
 * 
 * Demonstrates the adapter pattern by:
 * 1. Translating ollama/inference metrics → UniversalMetrics
 * 2. Mapping kernel physics → ollama-specific config
 * 3. Providing domain-specific defaults
 */

import {
    InterlockAdapter,
    UniversalMetrics,
    KernelPhysics,
    DomainConfig,
    WorkloadIdentity
} from '../../interlock-core/src/adapters';

export interface OllamaConfig extends DomainConfig {
    // Connection
    host: string;
    port: number;

    // Thresholds (from kernel physics)
    latencyThresholdMs: number;
    errorThresholdRate: number;

    // Timing
    probeIntervalMs: number;
    recoveryTimeoutMs: number;

    // Model settings
    defaultModel: string;
    maxConcurrentRequests: number;

    // Circuit breaker
    confidenceFloor: number;
}

export interface OllamaEvent {
    type: 'inference' | 'health' | 'error';
    timestamp: string;
    model?: string;
    latency_ms?: number;
    tokens_generated?: number;
    error?: string;
    error_rate?: number;
    request_count?: number;
    cpu_percent?: number;
    memory_mb?: number;
}

const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
    host: 'localhost',
    port: 11434,
    latencyThresholdMs: 500,
    errorThresholdRate: 0.05,
    probeIntervalMs: 15000,
    recoveryTimeoutMs: 60000,
    defaultModel: 'gemma3:12b',  // Model identity for provenance stamping
    maxConcurrentRequests: 4,
    confidenceFloor: 0.5
};

export const OllamaAdapter: InterlockAdapter = {
    adapter_id: 'ollama/v1',
    domain: 'ollama',
    version: '1.0.0',

    translateMetrics(domainEvent: unknown): UniversalMetrics | null {
        const event = domainEvent as OllamaEvent;

        // Validate required fields
        if (!event || !event.timestamp) {
            return null;
        }

        // Skip non-metric events
        if (event.type !== 'inference' && event.type !== 'health') {
            return null;
        }

        // Determine model identity: prefer event.model (per-request), fallback to config default
        const modelId = event.model || DEFAULT_OLLAMA_CONFIG.defaultModel;

        const metrics: UniversalMetrics = {
            timestamp: event.timestamp,
            error_rate: event.error_rate ?? 0,
            adapter_id: 'ollama/v1',

            // Workload identity (model provenance)
            workload: {
                model_id: modelId,
                provider: 'ollama'
            }
        };

        // Latency from inference or health events
        if (event.latency_ms !== undefined) {
            metrics.latency_ms = event.latency_ms;
            metrics.latency_p95_ms = event.latency_ms;  // Single sample approx
        }

        // Optional fields
        if (event.request_count !== undefined) {
            metrics.request_count = event.request_count;
        }
        if (event.cpu_percent !== undefined) {
            metrics.cpu_percent = event.cpu_percent;
        }
        if (event.memory_mb !== undefined) {
            metrics.memory_mb = event.memory_mb;
        }

        return metrics;
    },

    applyPhysics(physics: KernelPhysics, currentConfig: DomainConfig): DomainConfig {
        const config = currentConfig as OllamaConfig;

        return {
            ...config,
            // Directly map physics to config
            latencyThresholdMs: physics.max_safe_latency_ms,
            errorThresholdRate: physics.error_threshold_rate,
            probeIntervalMs: physics.probe_interval_ms,
            recoveryTimeoutMs: physics.recovery_timeout_ms,
            confidenceFloor: physics.min_confidence_floor
        };
    },

    getDefaultConfig(): DomainConfig {
        return { ...DEFAULT_OLLAMA_CONFIG };
    },

    validateEvent(domainEvent: unknown): boolean {
        const event = domainEvent as OllamaEvent;
        return (
            event !== null &&
            typeof event === 'object' &&
            typeof event.type === 'string' &&
            typeof event.timestamp === 'string'
        );
    }
};

export default OllamaAdapter;
