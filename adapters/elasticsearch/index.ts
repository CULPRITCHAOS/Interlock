/**
 * Elasticsearch Vector Search Adapter for Interlock (EXPERIMENTAL)
 * =================================================================
 * 
 * Lightweight adapter for Elasticsearch vector/hybrid search providing:
 * - Latency cliff detection
 * - Silent degradation detection
 * - Refusal before corruption
 * 
 * Status: EXPERIMENTAL
 * 
 * Purpose: Demonstrate Interlock's relevance to enterprise AI + legacy infrastructure.
 * 
 * NOT in scope:
 * - Elasticsearch client implementation
 * - Query optimization
 * - Index management
 */

export interface ElasticsearchMetrics {
  queryLatencyMs: number;
  degradationDetected: boolean;
  confidenceScore: number;
  operationCount: number;
  lastQueryAt: number;
}

export interface LatencyCliff {
  timestamp: number;
  previousLatencyMs: number;
  currentLatencyMs: number;
  cliffMagnitude: number; // Multiplier (e.g., 5x = 5.0)
}

/**
 * EXPERIMENTAL: Elasticsearch adapter with latency cliff and degradation detection.
 */
export class ElasticsearchAdapter {
  private operationCount: number = 0;
  private latencies: number[] = [];
  private maxLatencyHistory: number = 100;
  private confidenceScore: number = 1.0;
  private lastQueryAt: number = Date.now();
  private latencyCliffs: LatencyCliff[] = [];
  private degradationThresholdMs: number = 200; // Default threshold

  constructor(degradationThresholdMs: number = 200) {
    this.degradationThresholdMs = degradationThresholdMs;
  }

  /**
   * Wraps an Elasticsearch query with monitoring.
   */
  wrapQuery<T>(
    queryFn: (...args: any[]) => Promise<T>,
    dryRun: boolean = false
  ): (...args: any[]) => Promise<T> {
    return async (...args: any[]): Promise<T> => {
      const startTime = Date.now();
      this.operationCount++;

      // Check for latency cliff before execution
      if (this.detectLatencyCliff()) {
        this.confidenceScore *= 0.7; // Degrade confidence
        
        if (dryRun) {
          console.warn('[Interlock Shadow Mode] Latency cliff detected');
        } else if (this.confidenceScore < 0.5) {
          throw new Error('Interlock refusal: Latency cliff detected, confidence too low');
        }
      }

      // Execute query
      let result: T;
      try {
        result = await queryFn(...args);
      } catch (error) {
        this.confidenceScore *= 0.8; // Degrade on error
        throw error;
      }

      // Record latency
      const latencyMs = Date.now() - startTime;
      this.recordLatency(latencyMs);
      this.lastQueryAt = Date.now();

      // Detect silent degradation
      if (this.detectSilentDegradation(latencyMs)) {
        if (dryRun) {
          console.warn('[Interlock Shadow Mode] Silent degradation detected');
        } else {
          console.warn('[Interlock] Silent degradation detected, reducing confidence');
          this.confidenceScore *= 0.9;
        }
      }

      return result;
    };
  }

  /**
   * Records a query latency observation.
   */
  private recordLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);

    // Keep history bounded
    if (this.latencies.length > this.maxLatencyHistory) {
      this.latencies.shift();
    }

    // Detect cliff
    if (this.latencies.length >= 2) {
      const previous = this.latencies[this.latencies.length - 2];
      const current = latencyMs;
      
      // Cliff if current latency is 3x or more than previous
      if (current > previous * 3 && current > 100) {
        this.latencyCliffs.push({
          timestamp: Date.now(),
          previousLatencyMs: previous,
          currentLatencyMs: current,
          cliffMagnitude: current / previous
        });

        // Keep cliffs bounded
        if (this.latencyCliffs.length > 10) {
          this.latencyCliffs.shift();
        }
      }
    }
  }

  /**
   * Detects latency cliff (sudden spike).
   */
  private detectLatencyCliff(): boolean {
    if (this.latencyCliffs.length === 0) {
      return false;
    }

    // Recent cliff if within last 60 seconds
    const recentCliff = this.latencyCliffs[this.latencyCliffs.length - 1];
    return (Date.now() - recentCliff.timestamp) < 60000;
  }

  /**
   * Detects silent degradation (gradual increase).
   */
  private detectSilentDegradation(currentLatencyMs: number): boolean {
    if (this.latencies.length < 10) {
      return false;
    }

    // Compare recent average to older average
    const recent = this.latencies.slice(-5);
    const older = this.latencies.slice(-10, -5);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    // Degradation if recent avg is 50% higher than older avg
    return recentAvg > olderAvg * 1.5 && recentAvg > this.degradationThresholdMs;
  }

  /**
   * Gets current metrics.
   */
  getMetrics(): ElasticsearchMetrics {
    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    return {
      queryLatencyMs: avgLatency,
      degradationDetected: this.detectLatencyCliff() || this.detectSilentDegradation(avgLatency),
      confidenceScore: this.confidenceScore,
      operationCount: this.operationCount,
      lastQueryAt: this.lastQueryAt
    };
  }

  /**
   * Gets current confidence score.
   */
  getConfidence(): number {
    return this.confidenceScore;
  }

  /**
   * Observes current state.
   */
  observe(): ElasticsearchMetrics {
    return this.getMetrics();
  }

  /**
   * Resets adapter state.
   */
  reset(): void {
    this.operationCount = 0;
    this.latencies = [];
    this.confidenceScore = 1.0;
    this.latencyCliffs = [];
    this.lastQueryAt = Date.now();
  }
}

/**
 * Creates an Elasticsearch adapter instance.
 */
export function createElasticsearchAdapter(degradationThresholdMs: number = 200): ElasticsearchAdapter {
  return new ElasticsearchAdapter(degradationThresholdMs);
}

/**
 * Adapter interface implementation.
 */
export interface InterlockAdapter {
  observe(): ElasticsearchMetrics;
  getConfidence(): number;
}
