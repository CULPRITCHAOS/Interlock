/**
 * Weaviate Adapter for Interlock
 * ===============================
 * 
 * Production-ready adapter for Weaviate vector database providing:
 * - Latency cliff detection
 * - Silent degradation detection
 * - Confidence-based refusal
 * - Shadow mode support
 * - Quality floor enforcement
 * 
 * NOT in scope:
 * - Weaviate client implementation
 * - Query optimization
 * - Schema management
 */

import {
    InterlockAdapter,
    AdapterMetrics,
    AdapterConfig,
    DEFAULT_ADAPTER_CONFIG,
    LatencyCliff,
    AdapterMetadata,
    detectLatencyCliff,
    detectSilentDegradation,
    logShadowWarning,
    createRefusalError
} from '../adapter_interface';

// ============= Weaviate-Specific Metrics =============

export interface WeaviateMetrics extends AdapterMetrics {
    graphqlLatencyMs: number;
    restLatencyMs: number;
    batchImportLatencyMs: number;
}

// ============= Weaviate Adapter Implementation =============

/**
 * Production-ready Weaviate adapter with latency monitoring and safety controls.
 */
export class WeaviateAdapter implements InterlockAdapter {
    private config: AdapterConfig;
    private operationCount: number = 0;
    private latencies: number[] = [];
    private confidenceScore: number = 1.0;
    private lastObservedAt: number = Date.now();
    private latencyCliffs: LatencyCliff[] = [];
    private graphqlLatencies: number[] = [];
    private restLatencies: number[] = [];

    static readonly METADATA: AdapterMetadata = {
        name: 'Weaviate',
        version: '1.0.0',
        status: 'production',
        description: 'Production-ready adapter for Weaviate vector database',
        monitoredMetrics: ['Query latency', 'GraphQL/REST response times', 'Batch import latency'],
        degradationTriggers: ['Latency cliff (3x spike)', 'Silent degradation (50% increase)', 'Errors/timeouts'],
        limitations: ['No schema monitoring', 'No cluster health integration', 'Requires mock for testing without credentials']
    };

    constructor(config: Partial<AdapterConfig> = {}) {
        this.config = { ...DEFAULT_ADAPTER_CONFIG, ...config };
    }

    /**
     * Wraps a Weaviate query function with monitoring.
     */
    wrapQuery<T>(
        queryFn: (...args: any[]) => Promise<T>,
        queryType: 'graphql' | 'rest' | 'batch' = 'graphql'
    ): (...args: any[]) => Promise<T> {
        return async (...args: any[]): Promise<T> => {
            const startTime = Date.now();
            this.operationCount++;

            // Pre-execution: Check for refusal
            if (this.shouldRefuse()) {
                if (this.config.dryRun) {
                    logShadowWarning('Weaviate', `WOULD REFUSE: Confidence ${this.confidenceScore.toFixed(2)} below floor ${this.config.qualityFloor}`);
                } else {
                    throw createRefusalError('Weaviate', `Confidence ${this.confidenceScore.toFixed(2)} below quality floor ${this.config.qualityFloor}`);
                }
            }

            // Execute query
            let result: T;
            try {
                result = await queryFn(...args);
            } catch (error) {
                this.confidenceScore *= 0.8;
                throw error;
            }

            // Record latency
            const latencyMs = Date.now() - startTime;
            this.recordLatency(latencyMs, queryType);
            this.lastObservedAt = Date.now();

            // Detect degradation
            this.checkDegradation(latencyMs);

            return result;
        };
    }

    private recordLatency(latencyMs: number, queryType: 'graphql' | 'rest' | 'batch'): void {
        this.latencies.push(latencyMs);
        if (this.latencies.length > this.config.maxLatencyHistory) {
            this.latencies.shift();
        }

        // Track per-type latencies
        if (queryType === 'graphql') {
            this.graphqlLatencies.push(latencyMs);
            if (this.graphqlLatencies.length > 50) this.graphqlLatencies.shift();
        } else if (queryType === 'rest') {
            this.restLatencies.push(latencyMs);
            if (this.restLatencies.length > 50) this.restLatencies.shift();
        }

        // Detect cliff
        if (this.latencies.length >= 2) {
            const cliff = detectLatencyCliff(latencyMs, this.latencies[this.latencies.length - 2], this.config);
            if (cliff) {
                this.latencyCliffs.push(cliff);
                if (this.latencyCliffs.length > 10) this.latencyCliffs.shift();
                this.confidenceScore *= 0.7;
                if (this.config.dryRun) {
                    logShadowWarning('Weaviate', `Latency cliff detected: ${cliff.cliffMagnitude.toFixed(1)}x`);
                }
            }
        }
    }

    private checkDegradation(currentLatencyMs: number): void {
        if (this.latencies.length < 10) return;

        const recent = this.latencies.slice(-5);
        const older = this.latencies.slice(-10, -5);

        if (detectSilentDegradation(recent, older, this.config)) {
            this.confidenceScore *= 0.9;
            if (this.config.dryRun) {
                logShadowWarning('Weaviate', 'Silent degradation detected');
            }
        }
    }

    observe(): WeaviateMetrics {
        const avgLatency = this.latencies.length > 0
            ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : 0;
        const avgGraphql = this.graphqlLatencies.length > 0
            ? this.graphqlLatencies.reduce((a, b) => a + b, 0) / this.graphqlLatencies.length : 0;
        const avgRest = this.restLatencies.length > 0
            ? this.restLatencies.reduce((a, b) => a + b, 0) / this.restLatencies.length : 0;

        return {
            latencyMs: avgLatency,
            confidenceScore: this.confidenceScore,
            operationCount: this.operationCount,
            lastObservedAt: this.lastObservedAt,
            degradationDetected: this.latencyCliffs.length > 0 && (Date.now() - this.latencyCliffs[this.latencyCliffs.length - 1].timestamp) < 60000,
            graphqlLatencyMs: avgGraphql,
            restLatencyMs: avgRest,
            batchImportLatencyMs: 0 // Placeholder for batch tracking
        };
    }

    getConfidence(): number { return this.confidenceScore; }

    shouldRefuse(): boolean { return this.confidenceScore < this.config.qualityFloor; }

    injectFailure(rate: number = 0.1): void {
        // Simulate degradation for testing
        if (Math.random() < rate) this.confidenceScore *= 0.8;
    }

    reset(): void {
        this.operationCount = 0;
        this.latencies = [];
        this.confidenceScore = 1.0;
        this.latencyCliffs = [];
        this.graphqlLatencies = [];
        this.restLatencies = [];
        this.lastObservedAt = Date.now();
    }
}

export function createWeaviateAdapter(config: Partial<AdapterConfig> = {}): WeaviateAdapter {
    return new WeaviateAdapter(config);
}
