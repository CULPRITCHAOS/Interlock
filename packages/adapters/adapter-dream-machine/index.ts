/**
 * Dream Machine Adapter
 * =====================
 * Adapter for the Dream Machine LLM router domain.
 * 
 * Dream Machine is an LLM router that:
 * 1. Routes requests between local and cloud LLM providers
 * 2. Manages context window and concurrency limits
 * 3. Provides fallback and backoff mechanisms
 * 
 * Interventions for this domain:
 * - cloud_fallback: Switched to cloud provider
 * - context_reduction: Reduced context window
 * - concurrency_limit: Reduced concurrent generations
 * - cooldown: Forced backoff
 * - model_downgrade: Switched to lighter model
 * - request_reject: Rejected request for safety
 */

import {
    InterlockAdapter,
    UniversalMetrics,
    KernelPhysics,
    DomainConfig
} from '../../interlock-core/src/adapters';

export interface DreamMachineConfig extends DomainConfig {
    // LLM routing
    preferLocal: boolean;
    cloudProvider: string;
    cloudApiKey?: string;

    // Thresholds (from kernel physics)
    latencyThresholdMs: number;
    errorThresholdRate: number;
    confidenceFloor: number;

    // LLM-specific limits
    maxContextTokens: number;
    maxConcurrentGenerations: number;

    // Timing
    probeIntervalMs: number;
    recoveryTimeoutMs: number;
    cooldownMs: number;
}

export interface DreamMachineEvent {
    type: 'dm_request' | 'dm_response' | 'dm_health' | 'intervention';
    timestamp: string;

    // Request/response metrics
    latency_ms?: number;
    context_tokens?: number;
    output_tokens?: number;
    model?: string;
    provider?: 'local' | 'cloud';

    // Health metrics
    latency_p95_ms?: number;
    error_rate?: number;
    concurrent_generations?: number;

    // Intervention
    intervention_type?: string;
    intervention_reason?: string;

    // Resource metrics
    cpu_percent?: number;
    memory_mb?: number;
    gpu_memory_mb?: number;
}

const DEFAULT_DREAM_MACHINE_CONFIG: DreamMachineConfig = {
    preferLocal: true,
    cloudProvider: 'openai',
    latencyThresholdMs: 1200,      // Tighter than ollama
    errorThresholdRate: 0.03,      // 3% vs ollama's 5%
    confidenceFloor: 0.6,          // Higher than ollama
    maxContextTokens: 8192,
    maxConcurrentGenerations: 2,
    probeIntervalMs: 10000,        // More frequent probing
    recoveryTimeoutMs: 30000,      // Faster recovery
    cooldownMs: 5000
};

export const DreamMachineAdapter: InterlockAdapter = {
    adapter_id: 'dream_machine/v1',
    domain: 'dream_machine',
    version: '1.0.0',

    translateMetrics(domainEvent: unknown): UniversalMetrics | null {
        const event = domainEvent as DreamMachineEvent;

        // Validate required fields
        if (!event || !event.timestamp) {
            return null;
        }

        // Skip non-metric events (interventions are handled separately)
        if (event.type === 'intervention') {
            return null;
        }

        const metrics: UniversalMetrics = {
            timestamp: event.timestamp,
            error_rate: event.error_rate ?? 0,
            adapter_id: 'dream_machine/v1'
        };

        // Latency from request/response or health events
        if (event.latency_ms !== undefined) {
            metrics.latency_ms = event.latency_ms;
        }
        if (event.latency_p95_ms !== undefined) {
            metrics.latency_p95_ms = event.latency_p95_ms;
        }

        // LLM-specific metrics
        if (event.concurrent_generations !== undefined) {
            metrics.concurrent_operations = event.concurrent_generations;
        }
        if (event.context_tokens !== undefined) {
            metrics.context_tokens = event.context_tokens;
        }

        // Resource metrics
        if (event.cpu_percent !== undefined) {
            metrics.cpu_percent = event.cpu_percent;
        }
        if (event.memory_mb !== undefined) {
            metrics.memory_mb = event.memory_mb;
        }
        if (event.gpu_memory_mb !== undefined) {
            metrics.gpu_memory_mb = event.gpu_memory_mb;
        }

        return metrics;
    },

    applyPhysics(physics: KernelPhysics, currentConfig: DomainConfig): DomainConfig {
        const config = currentConfig as DreamMachineConfig;

        return {
            ...config,
            // Directly map physics to config
            latencyThresholdMs: physics.max_safe_latency_ms,
            errorThresholdRate: physics.error_threshold_rate,
            probeIntervalMs: physics.probe_interval_ms,
            recoveryTimeoutMs: physics.recovery_timeout_ms,
            confidenceFloor: physics.min_confidence_floor,
            // Dream Machine specific
            maxContextTokens: (physics as any).max_context_tokens ?? config.maxContextTokens,
            maxConcurrentGenerations: (physics as any).max_concurrent_generations ?? config.maxConcurrentGenerations
        };
    },

    getDefaultConfig(): DomainConfig {
        return { ...DEFAULT_DREAM_MACHINE_CONFIG };
    },

    validateEvent(domainEvent: unknown): boolean {
        const event = domainEvent as DreamMachineEvent;
        return (
            event !== null &&
            typeof event === 'object' &&
            typeof event.type === 'string' &&
            typeof event.timestamp === 'string' &&
            ['dm_request', 'dm_response', 'dm_health', 'intervention'].includes(event.type)
        );
    }
};

// Export intervention types for reference
export const INTERVENTION_TYPES = [
    'cloud_fallback',
    'context_reduction',
    'concurrency_limit',
    'cooldown',
    'model_downgrade',
    'request_reject'
] as const;

export type DreamMachineInterventionType = typeof INTERVENTION_TYPES[number];

export default DreamMachineAdapter;
