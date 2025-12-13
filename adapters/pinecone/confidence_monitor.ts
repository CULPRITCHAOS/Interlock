/**
 * Pinecone Confidence Monitor
 * ============================
 * 
 * Tracks confidence levels and implements controlled degradation hooks for Pinecone operations.
 * 
 * Purpose: Enable graceful degradation before complete failure.
 */

import { LatencyProbe, LatencyStats } from './latency_probe';
import { FailureInjector, FailureStats } from './failure_injector';

export interface ConfidenceMetrics {
  overall: number; // 0.0 to 1.0
  latencyConfidence: number;
  reliabilityConfidence: number;
  qualityConfidence: number;
  lastUpdatedAt: number;
}

export interface DegradationHook {
  threshold: number; // Confidence level that triggers this hook
  action: 'log' | 'warn' | 'degrade' | 'refuse';
  callback?: () => void;
}

// Constants for trust decay
const TRUST_DECAY_HALF_LIFE_MS = 600000; // 10 minutes (aligns with longer-lived database connections)

/**
 * Monitors confidence levels and triggers controlled degradation.
 */
export class ConfidenceMonitor {
  private confidenceScore: number = 1.0;
  private latencyProbe: LatencyProbe;
  private failureInjector: FailureInjector;
  private degradationHooks: DegradationHook[] = [];
  private qualityFloor: number = 0.5; // Minimum acceptable confidence
  private lastUpdateAt: number = Date.now();

  constructor(
    latencyProbe?: LatencyProbe,
    failureInjector?: FailureInjector,
    qualityFloor: number = 0.5
  ) {
    this.latencyProbe = latencyProbe || new LatencyProbe();
    this.failureInjector = failureInjector || new FailureInjector();
    this.qualityFloor = qualityFloor;
  }

  /**
   * Updates confidence based on current system state.
   */
  update(): void {
    const latencyStats = this.latencyProbe.getStats();
    const failureStats = this.failureInjector.getStats();

    // Calculate latency-based confidence
    const latencyConfidence = this.calculateLatencyConfidence(latencyStats);

    // Calculate reliability-based confidence (inverse of failure rate)
    const reliabilityConfidence = this.calculateReliabilityConfidence(failureStats);

    // Combined confidence (weighted average)
    this.confidenceScore = (latencyConfidence * 0.4 + reliabilityConfidence * 0.6);

    // Time-based confidence decay (trust degrades over time without updates)
    const timeSinceLastUpdate = Date.now() - this.lastUpdateAt;
    const decayFactor = Math.exp(-timeSinceLastUpdate / TRUST_DECAY_HALF_LIFE_MS);
    this.confidenceScore *= decayFactor;

    this.lastUpdateAt = Date.now();

    // Trigger degradation hooks
    this.triggerHooks();
  }

  /**
   * Calculates confidence based on latency statistics.
   */
  private calculateLatencyConfidence(stats: LatencyStats): number {
    if (stats.count === 0) {
      return 1.0; // No data, assume good
    }

    // Degrade confidence based on p95 latency
    // Assume good latency is < 50ms, unacceptable is > 500ms
    const p95 = stats.p95Ms;
    let confidence = 1.0;

    if (p95 > 500) {
      confidence = 0.3;
    } else if (p95 > 200) {
      confidence = 0.6;
    } else if (p95 > 100) {
      confidence = 0.8;
    } else if (p95 > 50) {
      confidence = 0.9;
    }

    // Further degrade if trend is negative (getting slower)
    if (stats.recentTrendMs > 50) {
      confidence *= 0.8;
    }

    return confidence;
  }

  /**
   * Calculates confidence based on failure statistics.
   */
  private calculateReliabilityConfidence(stats: FailureStats): number {
    if (stats.totalFailures === 0) {
      return 1.0; // No failures, assume good
    }

    // Degrade confidence based on recent failure rate
    const failureRate = stats.recentFailureRate;
    
    if (failureRate > 10) {
      return 0.2; // Very high failure rate
    } else if (failureRate > 5) {
      return 0.5;
    } else if (failureRate > 2) {
      return 0.7;
    } else if (failureRate > 0) {
      return 0.9;
    }

    return 1.0;
  }

  /**
   * Gets current confidence metrics.
   */
  getConfidence(): number {
    return this.confidenceScore;
  }

  /**
   * Gets detailed confidence metrics.
   */
  getMetrics(): ConfidenceMetrics {
    const latencyStats = this.latencyProbe.getStats();
    const failureStats = this.failureInjector.getStats();

    return {
      overall: this.confidenceScore,
      latencyConfidence: this.calculateLatencyConfidence(latencyStats),
      reliabilityConfidence: this.calculateReliabilityConfidence(failureStats),
      qualityConfidence: this.confidenceScore >= this.qualityFloor ? 1.0 : this.confidenceScore / this.qualityFloor,
      lastUpdatedAt: this.lastUpdateAt
    };
  }

  /**
   * Registers a degradation hook.
   */
  registerHook(hook: DegradationHook): void {
    this.degradationHooks.push(hook);
    // Sort hooks by threshold (highest first)
    this.degradationHooks.sort((a, b) => b.threshold - a.threshold);
  }

  /**
   * Triggers degradation hooks based on current confidence.
   */
  private triggerHooks(): void {
    for (const hook of this.degradationHooks) {
      if (this.confidenceScore <= hook.threshold) {
        if (hook.callback) {
          hook.callback();
        }
      }
    }
  }

  /**
   * Checks if confidence is below quality floor (should refuse).
   */
  shouldRefuse(): boolean {
    return this.confidenceScore < this.qualityFloor;
  }

  /**
   * Checks if system should degrade gracefully.
   */
  shouldDegrade(): boolean {
    return this.confidenceScore < 0.7; // Degrade if confidence below 70%
  }

  /**
   * Resets confidence to initial state.
   */
  reset(): void {
    this.confidenceScore = 1.0;
    this.lastUpdateAt = Date.now();
  }
}

/**
 * Wraps a Pinecone function with confidence monitoring and refusal logic.
 */
export function wrapWithConfidenceMonitoring<T>(
  fn: (...args: any[]) => Promise<T>,
  monitor: ConfidenceMonitor,
  dryRun: boolean = false
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    // Update confidence before execution
    monitor.update();

    // Check if should refuse
    if (monitor.shouldRefuse()) {
      if (dryRun) {
        console.log('[Interlock Shadow Mode] WOULD REFUSE: Confidence below quality floor');
        return await fn(...args); // Allow in dry run
      } else {
        throw new Error('Interlock refusal: Confidence below quality floor');
      }
    }

    // Check if should degrade
    if (monitor.shouldDegrade()) {
      console.warn('[Interlock] Operating in degraded mode: Confidence below 70%');
    }

    // Execute function
    return await fn(...args);
  };
}
