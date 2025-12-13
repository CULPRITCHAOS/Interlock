/**
 * Pinecone Latency Probe
 * ======================
 * 
 * Observes and tracks Pinecone query latency for degradation detection.
 * 
 * Purpose: Detect latency cliffs before they cause user-visible failures.
 */

export interface LatencyObservation {
  timestamp: number;
  latencyMs: number;
  operation: 'query' | 'upsert' | 'delete' | 'fetch';
  recordCount?: number;
}

export interface LatencyStats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  recentTrendMs: number; // Positive = getting slower
}

/**
 * Latency probe for Pinecone operations.
 */
export class LatencyProbe {
  private observations: LatencyObservation[] = [];
  private readonly maxObservations: number = 1000;
  private readonly windowMs: number = 300000; // 5 minutes

  /**
   * Records a latency observation.
   */
  record(observation: LatencyObservation): void {
    this.observations.push(observation);

    // Trim old observations
    const cutoff = Date.now() - this.windowMs;
    this.observations = this.observations.filter(o => o.timestamp > cutoff);

    // Keep max size bounded
    if (this.observations.length > this.maxObservations) {
      this.observations = this.observations.slice(-this.maxObservations);
    }
  }

  /**
   * Gets current latency statistics.
   */
  getStats(): LatencyStats {
    if (this.observations.length === 0) {
      return {
        count: 0,
        meanMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
        recentTrendMs: 0
      };
    }

    const latencies = this.observations.map(o => o.latencyMs).sort((a, b) => a - b);
    const sum = latencies.reduce((acc, val) => acc + val, 0);
    const mean = sum / latencies.length;

    // Calculate percentiles
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const max = latencies[latencies.length - 1];

    // Calculate recent trend (last 10% vs previous 10%)
    const recentCount = Math.max(1, Math.floor(latencies.length * 0.1));
    
    // Only calculate trend if we have enough data (at least 20 data points)
    let trend = 0;
    if (latencies.length >= 20) {
      const recent = latencies.slice(-recentCount);
      const previous = latencies.slice(-recentCount * 2, -recentCount);
      
      const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const previousMean = previous.reduce((a, b) => a + b, 0) / previous.length;
      trend = recentMean - previousMean;
    }

    return {
      count: latencies.length,
      meanMs: mean,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      maxMs: max,
      recentTrendMs: trend
    };
  }

  /**
   * Detects latency degradation (cliff detection).
   */
  detectDegradation(thresholdMs: number): boolean {
    const stats = this.getStats();
    
    // Degraded if p95 exceeds threshold or recent trend is significantly positive
    return stats.p95Ms > thresholdMs || stats.recentTrendMs > thresholdMs * 0.5;
  }

  /**
   * Clears all observations.
   */
  clear(): void {
    this.observations = [];
  }
}

/**
 * Wraps a Pinecone query function with latency tracking.
 */
export function wrapWithLatencyProbe<T>(
  queryFn: (...args: any[]) => Promise<T>,
  probe: LatencyProbe,
  operation: LatencyObservation['operation'] = 'query'
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    const startTime = Date.now();
    try {
      const result = await queryFn(...args);
      const latencyMs = Date.now() - startTime;
      
      probe.record({
        timestamp: Date.now(),
        latencyMs,
        operation
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      probe.record({
        timestamp: Date.now(),
        latencyMs,
        operation
      });
      throw error;
    }
  };
}
