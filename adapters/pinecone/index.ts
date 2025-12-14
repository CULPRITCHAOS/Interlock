/**
 * Pinecone Adapter for Interlock
 * ===============================
 * 
 * Adapter for Pinecone vector database providing:
 * - Latency observation
 * - Failure signal detection
 * - Confidence tracking
 * - Controlled degradation hooks
 * - Refusal signaling
 * 
 * NOT in scope:
 * - Pinecone client implementation
 * - Performance optimization
 * - Vendor API abstraction
 */

export type { LatencyStats, LatencyObservation } from './latency_probe';
export { LatencyProbe, wrapWithLatencyProbe } from './latency_probe';
export type { FailureSignal, FailureStats } from './failure_injector';
export { FailureInjector, wrapWithFailureDetection } from './failure_injector';
export type { ConfidenceMetrics, DegradationHook } from './confidence_monitor';
export { ConfidenceMonitor, wrapWithConfidenceMonitoring } from './confidence_monitor';

import { LatencyProbe, wrapWithLatencyProbe } from './latency_probe';
import { FailureInjector, wrapWithFailureDetection } from './failure_injector';
import { ConfidenceMonitor, wrapWithConfidenceMonitoring } from './confidence_monitor';

/**
 * Adapter interface for Interlock.
 */
export interface InterlockAdapter {
  observe(): AdapterMetrics;
  injectFailure?(): void;
  getConfidence(): number;
}

/**
 * Metrics from the Pinecone adapter.
 */
export interface AdapterMetrics {
  latencyP95Ms: number;
  failureRate: number;
  confidenceScore: number;
  operationCount: number;
  lastObservedAt: number;
}

/**
 * Complete Pinecone adapter with all monitoring capabilities.
 */
export class PineconeAdapter implements InterlockAdapter {
  private latencyProbe: LatencyProbe;
  private failureInjector: FailureInjector;
  private confidenceMonitor: ConfidenceMonitor;
  private operationCount: number = 0;

  constructor(qualityFloor: number = 0.5) {
    this.latencyProbe = new LatencyProbe();
    this.failureInjector = new FailureInjector();
    this.confidenceMonitor = new ConfidenceMonitor(
      this.latencyProbe,
      this.failureInjector,
      qualityFloor
    );
  }

  /**
   * Wraps a Pinecone query function with full monitoring.
   */
  wrapQuery<T>(
    queryFn: (...args: any[]) => Promise<T>,
    dryRun: boolean = false
  ): (...args: any[]) => Promise<T> {
    return async (...args: any[]): Promise<T> => {
      this.operationCount++;

      // Apply all wrappers in order
      const withLatency = wrapWithLatencyProbe(queryFn, this.latencyProbe, 'query');
      const withFailureDetection = wrapWithFailureDetection(withLatency, this.failureInjector);
      const withConfidence = wrapWithConfidenceMonitoring(
        withFailureDetection,
        this.confidenceMonitor,
        dryRun
      );

      return await withConfidence(...args);
    };
  }

  /**
   * Observes current adapter state.
   */
  observe(): AdapterMetrics {
    const latencyStats = this.latencyProbe.getStats();
    const failureStats = this.failureInjector.getStats();
    this.confidenceMonitor.update();

    return {
      latencyP95Ms: latencyStats.p95Ms,
      failureRate: failureStats.recentFailureRate,
      confidenceScore: this.confidenceMonitor.getConfidence(),
      operationCount: this.operationCount,
      lastObservedAt: Date.now()
    };
  }

  /**
   * Enables controlled failure injection (for testing).
   */
  injectFailure(rate: number = 0.1): void {
    this.failureInjector.enableInjection(rate);
  }

  /**
   * Disables failure injection.
   */
  disableFailureInjection(): void {
    this.failureInjector.disableInjection();
  }

  /**
   * Gets current confidence score.
   */
  getConfidence(): number {
    this.confidenceMonitor.update();
    return this.confidenceMonitor.getConfidence();
  }

  /**
   * Checks if adapter should refuse operations.
   */
  shouldRefuse(): boolean {
    this.confidenceMonitor.update();
    return this.confidenceMonitor.shouldRefuse();
  }

  /**
   * Registers a degradation hook.
   */
  onDegradation(threshold: number, action: 'log' | 'warn' | 'degrade' | 'refuse', callback?: () => void): void {
    this.confidenceMonitor.registerHook({ threshold, action, callback });
  }

  /**
   * Resets adapter state.
   */
  reset(): void {
    this.latencyProbe.clear();
    this.failureInjector.clear();
    this.confidenceMonitor.reset();
    this.operationCount = 0;
  }
}

/**
 * Creates a Pinecone adapter instance.
 */
export function createPineconeAdapter(qualityFloor: number = 0.5): PineconeAdapter {
  return new PineconeAdapter(qualityFloor);
}
