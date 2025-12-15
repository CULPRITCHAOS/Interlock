/**
 * Interlock v2.x: Metrics Service
 * ================================
 * 
 * Problem: Shadow Mode can generate massive "shadow block" logs during spikes,
 * causing observability cost explosion in enterprise environments (Splunk/Datadog bills).
 * 
 * Solution: Counters/metrics for high-volume events instead of per-event logging.
 * 
 * Metrics exported:
 * - interlock_shadow_blocks_total
 * - interlock_reflex_trips_total
 * - interlock_quality_refusals_total
 * - interlock_state_transitions_total
 * 
 * Export formats:
 * - Prometheus-style text (if supported)
 * - JSON snapshot (lightweight, always available)
 * 
 * Guiding Principle:
 * Prefer metrics/counters over high-volume logs to minimize observability costs.
 */

// ============= Counter Types =============

export interface Counter {
  name: string;
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export interface Histogram {
  name: string;
  help: string;
  sum: number;
  count: number;
  buckets: Map<number, number>;  // bucket upper bound -> count
}

export interface MetricsSnapshot {
  timestamp: string;
  uptimeMs: number;
  counters: Record<string, number>;
  histograms: Record<string, { sum: number; count: number; mean: number }>;
  gauges: Record<string, number>;
}

// ============= Default Histogram Buckets =============

const DEFAULT_LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const DEFAULT_HAZARD_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

// ============= Metrics Registry =============

export class MetricsRegistry {
  private startTime: number = Date.now();
  
  // Counters
  private shadowBlocksTotal: number = 0;
  private shadowBlocksByType: Record<string, number> = {};
  private reflexTripsTotal: number = 0;
  private qualityRefusalsTotal: number = 0;
  private stateTransitionsTotal: number = 0;
  private stateTransitionsByType: Record<string, number> = {};
  private intervalsProcessedTotal: number = 0;
  
  // Histograms
  private latencySum: number = 0;
  private latencyCount: number = 0;
  private latencyBuckets: Map<number, number> = new Map();
  
  private hazardSum: number = 0;
  private hazardCount: number = 0;
  private hazardBuckets: Map<number, number> = new Map();
  
  // Gauges (current values)
  private currentState: string = 'closed';
  private currentHazardScore: number = 0;
  private currentRecall: number = 1.0;
  private currentConfidence: number = 1.0;
  private inReflexCooldown: boolean = false;
  
  // Summary aggregation for periodic logging
  private lastSummaryTime: number = Date.now();
  private summaryIntervalMs: number = 60000;  // 1 minute default
  private pendingShadowBlocks: number = 0;
  private pendingRefusals: number = 0;
  
  constructor() {
    // Initialize histogram buckets
    for (const bucket of DEFAULT_LATENCY_BUCKETS) {
      this.latencyBuckets.set(bucket, 0);
    }
    for (const bucket of DEFAULT_HAZARD_BUCKETS) {
      this.hazardBuckets.set(bucket, 0);
    }
  }

  // ============= Counter Increments =============

  /**
   * Increment shadow blocks counter
   * @param blockType - Type of shadow block (e.g., 'reflex_trip', 'hazard_threshold', 'quality_floor')
   */
  public incShadowBlocks(blockType?: string): void {
    this.shadowBlocksTotal++;
    this.pendingShadowBlocks++;
    if (blockType) {
      this.shadowBlocksByType[blockType] = (this.shadowBlocksByType[blockType] || 0) + 1;
    }
  }

  /**
   * Increment reflex trips counter
   */
  public incReflexTrips(): void {
    this.reflexTripsTotal++;
  }

  /**
   * Increment quality refusals counter
   */
  public incQualityRefusals(): void {
    this.qualityRefusalsTotal++;
    this.pendingRefusals++;
  }

  /**
   * Increment state transitions counter
   * @param transition - Transition type (e.g., 'closed_to_open', 'open_to_half_open')
   */
  public incStateTransitions(transition?: string): void {
    this.stateTransitionsTotal++;
    if (transition) {
      this.stateTransitionsByType[transition] = (this.stateTransitionsByType[transition] || 0) + 1;
    }
  }

  /**
   * Increment intervals processed counter
   */
  public incIntervalsProcessed(): void {
    this.intervalsProcessedTotal++;
  }

  // ============= Histogram Observations =============

  /**
   * Observe latency value
   * @param latencyMs - Latency in milliseconds
   */
  public observeLatency(latencyMs: number): void {
    this.latencySum += latencyMs;
    this.latencyCount++;
    
    for (const [bucket, count] of this.latencyBuckets) {
      if (latencyMs <= bucket) {
        this.latencyBuckets.set(bucket, count + 1);
      }
    }
  }

  /**
   * Observe hazard score
   * @param hazard - Hazard score (0-1)
   */
  public observeHazard(hazard: number): void {
    this.hazardSum += hazard;
    this.hazardCount++;
    
    for (const [bucket, count] of this.hazardBuckets) {
      if (hazard <= bucket) {
        this.hazardBuckets.set(bucket, count + 1);
      }
    }
  }

  // ============= Gauge Updates =============

  /**
   * Update current circuit state gauge
   */
  public setCurrentState(state: string): void {
    this.currentState = state;
  }

  /**
   * Update current hazard score gauge
   */
  public setCurrentHazard(hazard: number): void {
    this.currentHazardScore = hazard;
  }

  /**
   * Update current recall gauge
   */
  public setCurrentRecall(recall: number): void {
    this.currentRecall = recall;
  }

  /**
   * Update current confidence gauge
   */
  public setCurrentConfidence(confidence: number): void {
    this.currentConfidence = confidence;
  }

  /**
   * Update reflex cooldown gauge
   */
  public setInReflexCooldown(inCooldown: boolean): void {
    this.inReflexCooldown = inCooldown;
  }

  // ============= Summary Logging (Enterprise-Friendly) =============

  /**
   * Check if it's time for a summary log and return summary if so.
   * This replaces per-event logging with periodic aggregated summaries.
   * 
   * Returns null if not time for summary yet, or a summary object if interval elapsed.
   */
  public checkSummary(): { shadowBlocks: number; refusals: number; elapsedMs: number } | null {
    const now = Date.now();
    const elapsed = now - this.lastSummaryTime;
    
    if (elapsed >= this.summaryIntervalMs) {
      const summary = {
        shadowBlocks: this.pendingShadowBlocks,
        refusals: this.pendingRefusals,
        elapsedMs: elapsed
      };
      
      // Reset pending counters
      this.pendingShadowBlocks = 0;
      this.pendingRefusals = 0;
      this.lastSummaryTime = now;
      
      return summary;
    }
    
    return null;
  }

  /**
   * Set summary interval
   * @param intervalMs - Interval in milliseconds
   */
  public setSummaryInterval(intervalMs: number): void {
    this.summaryIntervalMs = intervalMs;
  }

  // ============= Export Functions =============

  /**
   * Get metrics as JSON snapshot (lightweight, always available)
   */
  public getSnapshot(): MetricsSnapshot {
    return {
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - this.startTime,
      counters: {
        interlock_shadow_blocks_total: this.shadowBlocksTotal,
        interlock_reflex_trips_total: this.reflexTripsTotal,
        interlock_quality_refusals_total: this.qualityRefusalsTotal,
        interlock_state_transitions_total: this.stateTransitionsTotal,
        interlock_intervals_processed_total: this.intervalsProcessedTotal,
        ...Object.fromEntries(
          Object.entries(this.shadowBlocksByType).map(([k, v]) => 
            [`interlock_shadow_blocks_by_type{type="${k}"}`, v]
          )
        ),
        ...Object.fromEntries(
          Object.entries(this.stateTransitionsByType).map(([k, v]) => 
            [`interlock_state_transitions_by_type{transition="${k}"}`, v]
          )
        )
      },
      histograms: {
        interlock_latency_ms: {
          sum: this.latencySum,
          count: this.latencyCount,
          mean: this.latencyCount > 0 ? this.latencySum / this.latencyCount : 0
        },
        interlock_hazard_score: {
          sum: this.hazardSum,
          count: this.hazardCount,
          mean: this.hazardCount > 0 ? this.hazardSum / this.hazardCount : 0
        }
      },
      gauges: {
        interlock_current_state_closed: this.currentState === 'closed' ? 1 : 0,
        interlock_current_state_open: this.currentState === 'open' ? 1 : 0,
        interlock_current_state_half_open: this.currentState === 'half_open' ? 1 : 0,
        interlock_current_hazard_score: this.currentHazardScore,
        interlock_current_recall: this.currentRecall,
        interlock_current_confidence: this.currentConfidence,
        interlock_in_reflex_cooldown: this.inReflexCooldown ? 1 : 0
      }
    };
  }

  /**
   * Get metrics in Prometheus text format
   */
  public getPrometheusText(): string {
    const lines: string[] = [];
    const snapshot = this.getSnapshot();
    
    // Counters
    lines.push('# HELP interlock_shadow_blocks_total Total number of shadow blocks recorded');
    lines.push('# TYPE interlock_shadow_blocks_total counter');
    lines.push(`interlock_shadow_blocks_total ${this.shadowBlocksTotal}`);
    
    lines.push('# HELP interlock_reflex_trips_total Total number of reflex trips triggered');
    lines.push('# TYPE interlock_reflex_trips_total counter');
    lines.push(`interlock_reflex_trips_total ${this.reflexTripsTotal}`);
    
    lines.push('# HELP interlock_quality_refusals_total Total number of quality floor refusals');
    lines.push('# TYPE interlock_quality_refusals_total counter');
    lines.push(`interlock_quality_refusals_total ${this.qualityRefusalsTotal}`);
    
    lines.push('# HELP interlock_state_transitions_total Total number of state transitions');
    lines.push('# TYPE interlock_state_transitions_total counter');
    lines.push(`interlock_state_transitions_total ${this.stateTransitionsTotal}`);
    
    // Shadow blocks by type
    if (Object.keys(this.shadowBlocksByType).length > 0) {
      lines.push('# HELP interlock_shadow_blocks_by_type Shadow blocks by type');
      lines.push('# TYPE interlock_shadow_blocks_by_type counter');
      for (const [type, count] of Object.entries(this.shadowBlocksByType)) {
        lines.push(`interlock_shadow_blocks_by_type{type="${type}"} ${count}`);
      }
    }
    
    // State transitions by type
    if (Object.keys(this.stateTransitionsByType).length > 0) {
      lines.push('# HELP interlock_state_transitions_by_type State transitions by type');
      lines.push('# TYPE interlock_state_transitions_by_type counter');
      for (const [transition, count] of Object.entries(this.stateTransitionsByType)) {
        lines.push(`interlock_state_transitions_by_type{transition="${transition}"} ${count}`);
      }
    }
    
    // Histograms - Latency
    lines.push('# HELP interlock_latency_ms_bucket Latency histogram in milliseconds');
    lines.push('# TYPE interlock_latency_ms histogram');
    for (const [bucket, count] of this.latencyBuckets) {
      lines.push(`interlock_latency_ms_bucket{le="${bucket}"} ${count}`);
    }
    lines.push(`interlock_latency_ms_bucket{le="+Inf"} ${this.latencyCount}`);
    lines.push(`interlock_latency_ms_sum ${this.latencySum}`);
    lines.push(`interlock_latency_ms_count ${this.latencyCount}`);
    
    // Histograms - Hazard
    lines.push('# HELP interlock_hazard_score_bucket Hazard score histogram');
    lines.push('# TYPE interlock_hazard_score histogram');
    for (const [bucket, count] of this.hazardBuckets) {
      lines.push(`interlock_hazard_score_bucket{le="${bucket}"} ${count}`);
    }
    lines.push(`interlock_hazard_score_bucket{le="+Inf"} ${this.hazardCount}`);
    lines.push(`interlock_hazard_score_sum ${this.hazardSum}`);
    lines.push(`interlock_hazard_score_count ${this.hazardCount}`);
    
    // Gauges
    lines.push('# HELP interlock_current_state Current circuit breaker state');
    lines.push('# TYPE interlock_current_state gauge');
    lines.push(`interlock_current_state{state="closed"} ${this.currentState === 'closed' ? 1 : 0}`);
    lines.push(`interlock_current_state{state="open"} ${this.currentState === 'open' ? 1 : 0}`);
    lines.push(`interlock_current_state{state="half_open"} ${this.currentState === 'half_open' ? 1 : 0}`);
    
    lines.push('# HELP interlock_current_hazard_score Current hazard score');
    lines.push('# TYPE interlock_current_hazard_score gauge');
    lines.push(`interlock_current_hazard_score ${this.currentHazardScore.toFixed(4)}`);
    
    lines.push('# HELP interlock_current_recall Current recall value');
    lines.push('# TYPE interlock_current_recall gauge');
    lines.push(`interlock_current_recall ${this.currentRecall.toFixed(4)}`);
    
    lines.push('# HELP interlock_current_confidence Current confidence value');
    lines.push('# TYPE interlock_current_confidence gauge');
    lines.push(`interlock_current_confidence ${this.currentConfidence.toFixed(4)}`);
    
    lines.push('# HELP interlock_in_reflex_cooldown Whether in reflex cooldown');
    lines.push('# TYPE interlock_in_reflex_cooldown gauge');
    lines.push(`interlock_in_reflex_cooldown ${this.inReflexCooldown ? 1 : 0}`);
    
    return lines.join('\n');
  }

  /**
   * Reset all metrics (for testing)
   */
  public reset(): void {
    this.startTime = Date.now();
    this.shadowBlocksTotal = 0;
    this.shadowBlocksByType = {};
    this.reflexTripsTotal = 0;
    this.qualityRefusalsTotal = 0;
    this.stateTransitionsTotal = 0;
    this.stateTransitionsByType = {};
    this.intervalsProcessedTotal = 0;
    
    this.latencySum = 0;
    this.latencyCount = 0;
    for (const bucket of DEFAULT_LATENCY_BUCKETS) {
      this.latencyBuckets.set(bucket, 0);
    }
    
    this.hazardSum = 0;
    this.hazardCount = 0;
    for (const bucket of DEFAULT_HAZARD_BUCKETS) {
      this.hazardBuckets.set(bucket, 0);
    }
    
    this.currentState = 'closed';
    this.currentHazardScore = 0;
    this.currentRecall = 1.0;
    this.currentConfidence = 1.0;
    this.inReflexCooldown = false;
    
    this.lastSummaryTime = Date.now();
    this.pendingShadowBlocks = 0;
    this.pendingRefusals = 0;
  }

  // ============= Getters for direct access =============

  public getShadowBlocksTotal(): number {
    return this.shadowBlocksTotal;
  }

  public getReflexTripsTotal(): number {
    return this.reflexTripsTotal;
  }

  public getQualityRefusalsTotal(): number {
    return this.qualityRefusalsTotal;
  }

  public getStateTransitionsTotal(): number {
    return this.stateTransitionsTotal;
  }
}

// ============= Global Metrics Instance =============

/**
 * Global metrics registry instance
 * Use this for production metrics collection
 */
export const globalMetrics = new MetricsRegistry();

// ============= Factory Function =============

/**
 * Create a new isolated metrics registry (for testing)
 */
export function createMetricsRegistry(): MetricsRegistry {
  return new MetricsRegistry();
}

// ============= Exports =============

export default MetricsRegistry;
