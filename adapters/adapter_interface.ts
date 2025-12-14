/**
 * Interlock Adapter Interface
 * ============================
 * 
 * Shared interface that all Interlock adapters must implement.
 * This ensures consistency across adapters for vector databases
 * and AI frameworks.
 * 
 * Design principles:
 * - Observation + hooks only, no orchestration
 * - ≤200 LOC per adapter file
 * - Zero dependencies beyond Interlock core + target framework SDK
 * - Shadow mode support everywhere
 * - Quality floor enforcement available everywhere
 */

// ============= Core Adapter Interface =============

/**
 * Standard Interlock adapter interface.
 * All adapters MUST implement this for consistency and certification.
 */
export interface InterlockAdapter {
  /** Collect current metrics snapshot */
  observe(): AdapterMetrics;
  
  /** Optional: Inject controlled failures for testing */
  injectFailure?(rate?: number): void;
  
  /** Get current confidence score (0.0 to 1.0) */
  getConfidence(): number;
  
  /** Reset adapter state to initial values */
  reset(): void;
}

// ============= Adapter Metrics =============

/**
 * Standard adapter metrics structure.
 * Adapters may extend this with framework-specific fields.
 */
export interface AdapterMetrics {
  /** Average or P50 latency in milliseconds */
  latencyMs: number;
  
  /** Current confidence score (0.0 to 1.0) */
  confidenceScore: number;
  
  /** Total operations performed */
  operationCount: number;
  
  /** Timestamp of last observation */
  lastObservedAt: number;
  
  /** Whether degradation has been detected */
  degradationDetected: boolean;
}

// ============= Adapter Configuration =============

/**
 * Base configuration for all adapters.
 */
export interface AdapterConfig {
  /** Quality floor - refuse if confidence drops below this */
  qualityFloor: number;
  
  /** Enable shadow/dry-run mode - log but don't refuse */
  dryRun: boolean;
  
  /** Latency cliff multiplier (e.g., 3 = 3x spike triggers cliff) */
  latencyCliffMultiplier: number;
  
  /** Degradation increase factor (e.g., 1.5 = 50% increase triggers degradation) */
  degradationIncreaseFactor: number;
  
  /** Minimum latency to consider as cliff */
  latencyCliffMinimumMs: number;
  
  /** Maximum latency history to keep */
  maxLatencyHistory: number;
}

/**
 * Default adapter configuration.
 */
export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  qualityFloor: 0.5,
  dryRun: false,
  latencyCliffMultiplier: 3,
  degradationIncreaseFactor: 1.5,
  latencyCliffMinimumMs: 100,
  maxLatencyHistory: 100
};

// ============= Latency Cliff Detection =============

/**
 * Latency cliff record for tracking sudden spikes.
 */
export interface LatencyCliff {
  timestamp: number;
  previousLatencyMs: number;
  currentLatencyMs: number;
  cliffMagnitude: number; // Multiplier (e.g., 5x = 5.0)
}

// ============= Adapter Status =============

/**
 * Adapter production readiness status.
 */
export type AdapterStatus = 
  | 'production'      // Production-grade, fully tested
  | 'experimental'    // Experimental, shadow mode recommended
  | 'mock-only';      // Mock implementation only

/**
 * Adapter metadata for certification and documentation.
 */
export interface AdapterMetadata {
  name: string;
  version: string;
  status: AdapterStatus;
  description: string;
  monitoredMetrics: string[];
  degradationTriggers: string[];
  limitations: string[];
}

// ============= Helper Functions =============

/**
 * Check if a latency observation constitutes a cliff.
 */
export function detectLatencyCliff(
  currentLatencyMs: number,
  previousLatencyMs: number,
  config: AdapterConfig = DEFAULT_ADAPTER_CONFIG
): LatencyCliff | null {
  if (
    previousLatencyMs > 0 &&
    currentLatencyMs > previousLatencyMs * config.latencyCliffMultiplier &&
    currentLatencyMs > config.latencyCliffMinimumMs
  ) {
    return {
      timestamp: Date.now(),
      previousLatencyMs,
      currentLatencyMs,
      cliffMagnitude: currentLatencyMs / previousLatencyMs
    };
  }
  return null;
}

/**
 * Check if recent latency indicates silent degradation.
 */
export function detectSilentDegradation(
  recentLatencies: number[],
  olderLatencies: number[],
  config: AdapterConfig = DEFAULT_ADAPTER_CONFIG
): boolean {
  if (recentLatencies.length < 5 || olderLatencies.length < 5) {
    return false;
  }
  
  const recentAvg = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
  const olderAvg = olderLatencies.reduce((a, b) => a + b, 0) / olderLatencies.length;
  
  return recentAvg > olderAvg * config.degradationIncreaseFactor;
}

/**
 * Calculate P95 latency from a list of observations.
 */
export function calculateP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * Log shadow mode warning with consistent formatting.
 */
export function logShadowWarning(adapterName: string, message: string): void {
  console.warn(`[Interlock Shadow Mode] [${adapterName}] ${message}`);
}

/**
 * Create refusal error with consistent formatting.
 */
export function createRefusalError(adapterName: string, reason: string): Error {
  return new Error(`Interlock refusal [${adapterName}]: ${reason}`);
}
