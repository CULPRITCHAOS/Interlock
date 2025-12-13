/**
 * Interlock Phase V: Evidence-Driven Hysteresis Lock (Anti-Flapping Core)
 * =======================================================================
 * 
 * Problem: Circuit breakers without hysteresis flap under noisy recovery
 * conditions, destroying trust.
 * 
 * Solution: Forecast-based hysteresis that:
 * - Requires K consecutive safe intervals before allowing OPEN → HALF_OPEN
 * - Requires X% safety margin recovery (derived from calibration, not constants)
 * - Requires minimum forecast confidence threshold
 * - Uses probe traffic (1-5%) in HALF_OPEN state
 * - Promotes to CLOSED only after N safe windows
 * 
 * Guiding Principle:
 * Interlock does not prevent failure. It makes failure visible early — and survivable.
 */

import { CircuitState, CircuitBreakerConfig, Intervention } from './phaseIV.types';

// ============= Hysteresis Configuration =============

export interface HysteresisConfig {
  // Consecutive intervals required for state transitions
  consecutiveIntervalsForHalfOpen: number;  // K consecutive safe intervals before OPEN → HALF_OPEN
  consecutiveWindowsForClose: number;       // N windows in HALF_OPEN before → CLOSED
  
  // Recovery thresholds (derived from calibration, not magic constants)
  safetyMarginRecoveryPercent: number;      // X% recovery relative to trigger point
  minimumConfidenceThreshold: number;       // Minimum forecast confidence to trust
  
  // Probe traffic settings for HALF_OPEN
  probeTrafficFraction: number;             // Fraction of traffic to route (1-5%)
  probeObservationWindows: number;          // Windows to observe probe before promoting
  
  // Flapping prevention
  minimumOpenDurationMs: number;            // Minimum time in OPEN state before considering recovery
  flappingCountThreshold: number;           // Transitions before marking as flapping
  flappingWindowMs: number;                 // Window to count transitions
}

export const DEFAULT_HYSTERESIS_CONFIG: HysteresisConfig = {
  consecutiveIntervalsForHalfOpen: 3,       // K = 3 consecutive safe intervals
  consecutiveWindowsForClose: 5,            // N = 5 windows of safe probe traffic
  safetyMarginRecoveryPercent: 0.20,        // 20% recovery relative to trigger point
  minimumConfidenceThreshold: 0.6,          // 60% minimum confidence
  probeTrafficFraction: 0.05,               // 5% probe traffic
  probeObservationWindows: 5,               // 5 observation windows
  minimumOpenDurationMs: 10000,             // 10 second minimum OPEN duration
  flappingCountThreshold: 4,                // 4 transitions = flapping
  flappingWindowMs: 60000                   // 60 second window for flapping detection
};

// ============= Hysteresis State =============

export interface HysteresisMetrics {
  hazardScore: number;
  recall: number;
  latencyMs: number;
  confidence: number;
  timestamp: number;
}

export interface TransitionRecord {
  timestamp: number;
  fromState: CircuitState;
  toState: CircuitState;
  trigger: string;
}

export interface HysteresisState {
  // Current circuit state
  currentState: CircuitState;
  
  // Transition tracking for hysteresis
  consecutiveSafeIntervals: number;         // Counter for K consecutive safe intervals
  consecutiveProbeSuccesses: number;        // Counter for N successful probe windows
  
  // Trigger point tracking (for relative recovery calculation)
  triggerHazardScore: number;               // Hazard score when breaker opened
  triggerSafetyMargin: number;              // Safety margin when breaker opened
  
  // Flapping detection
  recentTransitions: TransitionRecord[];
  isFlapping: boolean;
  
  // Timing
  lastStateChangeTimestamp: number;
  lastMetricsTimestamp: number;
  
  // Metrics history for recovery tracking
  recentMetrics: HysteresisMetrics[];
  
  // Probe traffic tracking
  probeAttempts: number;
  probeSuccesses: number;
  probeFailures: number;
}

// ============= Hysteresis Lock Implementation =============

export class HysteresisLock {
  private config: HysteresisConfig;
  private circuitConfig: CircuitBreakerConfig;
  private state: HysteresisState;
  private interventions: Intervention[] = [];

  constructor(
    config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
    circuitConfig: CircuitBreakerConfig
  ) {
    this.config = config;
    this.circuitConfig = circuitConfig;
    this.state = this.createInitialState();
  }

  private createInitialState(): HysteresisState {
    return {
      currentState: 'closed',
      consecutiveSafeIntervals: 0,
      consecutiveProbeSuccesses: 0,
      triggerHazardScore: 0,
      triggerSafetyMargin: 1.0,
      recentTransitions: [],
      isFlapping: false,
      lastStateChangeTimestamp: Date.now(),
      lastMetricsTimestamp: Date.now(),
      recentMetrics: [],
      probeAttempts: 0,
      probeSuccesses: 0,
      probeFailures: 0
    };
  }

  /**
   * Update hysteresis state based on new metrics.
   * Returns the new circuit state and any intervention that occurred.
   */
  public update(metrics: HysteresisMetrics): {
    newState: CircuitState;
    intervention: Intervention | null;
    shouldProbe: boolean;
    probeTrafficFraction: number;
  } {
    const now = Date.now();
    this.state.lastMetricsTimestamp = now;
    
    // Track metrics history
    this.state.recentMetrics.push(metrics);
    if (this.state.recentMetrics.length > 20) {
      this.state.recentMetrics = this.state.recentMetrics.slice(-20);
    }

    // Calculate derived metrics
    const isSafe = this.isMetricsSafe(metrics);
    const recoveryPercent = this.calculateRecoveryPercent(metrics);
    const timeSinceStateChange = now - this.state.lastStateChangeTimestamp;

    let intervention: Intervention | null = null;
    let shouldProbe = false;
    let probeTrafficFraction = 0;

    // State machine with hysteresis
    switch (this.state.currentState) {
      case 'closed':
        if (this.shouldOpenCircuit(metrics)) {
          intervention = this.transitionTo('open', metrics, 
            `Hazard ${metrics.hazardScore.toFixed(3)} exceeded threshold ${this.circuitConfig.hazardThreshold}`);
          // Record trigger point for recovery calculation
          this.state.triggerHazardScore = metrics.hazardScore;
          this.state.triggerSafetyMargin = this.calculateSafetyMargin(metrics);
        } else if (metrics.confidence < this.config.minimumConfidenceThreshold) {
          // TRUST ENFORCEMENT: Escalate conservatively when confidence degrades
          // This ensures we don't claim false certainty
          intervention = this.transitionTo('open', metrics,
            `Confidence dropped to ${(metrics.confidence * 100).toFixed(1)}% (below ${(this.config.minimumConfidenceThreshold * 100).toFixed(0)}% threshold) - escalating conservatively`);
          this.state.triggerHazardScore = metrics.hazardScore;
          this.state.triggerSafetyMargin = this.calculateSafetyMargin(metrics);
        }
        break;

      case 'open':
        // HYSTERESIS CHECK: Must meet ALL conditions for OPEN → HALF_OPEN
        const canConsiderRecovery = timeSinceStateChange >= this.config.minimumOpenDurationMs;
        
        if (canConsiderRecovery) {
          if (isSafe) {
            this.state.consecutiveSafeIntervals++;
          } else {
            // Reset counter on any unsafe interval
            this.state.consecutiveSafeIntervals = 0;
          }

          // Check all three conditions for HALF_OPEN transition
          const hasConsecutiveIntervals = this.state.consecutiveSafeIntervals >= this.config.consecutiveIntervalsForHalfOpen;
          const hasSufficientRecovery = recoveryPercent >= this.config.safetyMarginRecoveryPercent;
          const hasMinimumConfidence = metrics.confidence >= this.config.minimumConfidenceThreshold;

          if (hasConsecutiveIntervals && hasSufficientRecovery && hasMinimumConfidence) {
            // All conditions met - transition to HALF_OPEN
            if (!this.state.isFlapping) {
              intervention = this.transitionTo('half_open', metrics,
                `Recovery conditions met: ${this.state.consecutiveSafeIntervals} consecutive safe intervals, ` +
                `${(recoveryPercent * 100).toFixed(1)}% recovery, ${(metrics.confidence * 100).toFixed(1)}% confidence`);
              this.state.consecutiveSafeIntervals = 0;
              this.state.probeAttempts = 0;
              this.state.probeSuccesses = 0;
              this.state.probeFailures = 0;
            }
          }
        }
        break;

      case 'half_open':
        // In HALF_OPEN, we route probe traffic and observe
        shouldProbe = true;
        probeTrafficFraction = this.config.probeTrafficFraction;
        
        this.state.probeAttempts++;
        
        if (isSafe && metrics.confidence >= this.config.minimumConfidenceThreshold) {
          this.state.probeSuccesses++;
          this.state.consecutiveProbeSuccesses++;
          
          // Check if we've had N successful probe windows
          if (this.state.consecutiveProbeSuccesses >= this.config.consecutiveWindowsForClose) {
            intervention = this.transitionTo('closed', metrics,
              `Probe traffic successful: ${this.state.consecutiveProbeSuccesses} consecutive safe windows`);
            this.state.consecutiveProbeSuccesses = 0;
          }
        } else {
          // Probe failed - revert to OPEN
          this.state.probeFailures++;
          this.state.consecutiveProbeSuccesses = 0;
          
          intervention = this.transitionTo('open', metrics,
            `Probe failed: hazard=${metrics.hazardScore.toFixed(3)}, confidence=${(metrics.confidence * 100).toFixed(1)}%`);
        }
        break;
    }

    // Update flapping detection
    this.updateFlappingDetection();

    return {
      newState: this.state.currentState,
      intervention,
      shouldProbe,
      probeTrafficFraction
    };
  }

  /**
   * Check if metrics indicate safe operating conditions
   */
  private isMetricsSafe(metrics: HysteresisMetrics): boolean {
    const hazardBelowThreshold = metrics.hazardScore < this.circuitConfig.hazardThreshold * 0.7; // Hysteresis margin
    const recallAboveThreshold = metrics.recall >= this.circuitConfig.recallThreshold;
    const latencyBelowThreshold = metrics.latencyMs <= this.circuitConfig.latencyThresholdMs;
    
    return hazardBelowThreshold && recallAboveThreshold && latencyBelowThreshold;
  }

  /**
   * Calculate safety margin for current metrics
   */
  private calculateSafetyMargin(metrics: HysteresisMetrics): number {
    const recallMargin = (metrics.recall - this.circuitConfig.recallThreshold) / (1 - this.circuitConfig.recallThreshold);
    const latencyMargin = (this.circuitConfig.latencyThresholdMs - metrics.latencyMs) / this.circuitConfig.latencyThresholdMs;
    const hazardMargin = 1 - (metrics.hazardScore / this.circuitConfig.hazardThreshold);
    
    return Math.min(recallMargin, latencyMargin, hazardMargin);
  }

  /**
   * Calculate recovery percentage relative to trigger point
   * This is NOT a magic constant - it's derived from comparing current state to trigger state
   */
  private calculateRecoveryPercent(metrics: HysteresisMetrics): number {
    if (this.state.triggerHazardScore === 0) {
      return 1.0; // No trigger point recorded
    }

    const currentSafetyMargin = this.calculateSafetyMargin(metrics);
    const triggerSafetyMargin = this.state.triggerSafetyMargin;
    
    // Recovery = how much we've improved from the trigger point
    // 1.0 = fully recovered to safe operating point
    // 0.0 = still at trigger point
    // Negative = worse than trigger point
    const recovery = currentSafetyMargin - triggerSafetyMargin;
    
    return Math.max(0, Math.min(1, recovery));
  }

  /**
   * Check if circuit should open based on hazard
   */
  private shouldOpenCircuit(metrics: HysteresisMetrics): boolean {
    return metrics.hazardScore >= this.circuitConfig.hazardThreshold;
  }

  /**
   * Transition to a new state and log the intervention
   */
  private transitionTo(
    newState: CircuitState,
    metrics: HysteresisMetrics,
    trigger: string
  ): Intervention {
    const now = Date.now();
    const previousState = this.state.currentState;
    
    // Record transition for flapping detection
    this.state.recentTransitions.push({
      timestamp: now,
      fromState: previousState,
      toState: newState,
      trigger
    });
    
    // Keep only recent transitions
    const cutoff = now - this.config.flappingWindowMs;
    this.state.recentTransitions = this.state.recentTransitions.filter(t => t.timestamp > cutoff);

    // Create intervention record
    const intervention: Intervention = {
      timestamp: now,
      previousState,
      newState,
      trigger,
      metrics: {
        recall: metrics.recall,
        latencyMs: metrics.latencyMs,
        hazard: metrics.hazardScore
      },
      actionTaken: this.getActionForTransition(previousState, newState)
    };
    
    this.interventions.push(intervention);
    
    // Update state
    this.state.currentState = newState;
    this.state.lastStateChangeTimestamp = now;
    
    return intervention;
  }

  /**
   * Get action description for a state transition
   */
  private getActionForTransition(from: CircuitState, to: CircuitState): string {
    if (from === 'closed' && to === 'open') {
      return `Entering degraded mode: nprobe=${this.circuitConfig.degradedNprobe}`;
    } else if (from === 'open' && to === 'half_open') {
      return `Testing recovery with ${(this.config.probeTrafficFraction * 100).toFixed(0)}% probe traffic`;
    } else if (from === 'half_open' && to === 'closed') {
      return `Resuming optimal mode: nprobe=${this.circuitConfig.optimalNprobe}`;
    } else if (from === 'half_open' && to === 'open') {
      return `Reverting to degraded mode: nprobe=${this.circuitConfig.degradedNprobe}`;
    }
    return `State transition: ${from} → ${to}`;
  }

  /**
   * Update flapping detection based on recent transitions
   */
  private updateFlappingDetection(): void {
    const now = Date.now();
    const cutoff = now - this.config.flappingWindowMs;
    
    // Count transitions in the flapping window
    const recentTransitions = this.state.recentTransitions.filter(t => t.timestamp > cutoff);
    
    // Mark as flapping if too many transitions
    this.state.isFlapping = recentTransitions.length >= this.config.flappingCountThreshold;
  }

  /**
   * Derive hysteresis configuration from calibration data
   * This ensures values are evidence-based, not magic constants
   */
  public static deriveConfigFromCalibration(
    calibrationData: {
      meanRecoveryTime: number;      // Mean recovery time in intervals
      varianceRecoveryTime: number;  // Variance of recovery time
      falsePositiveRate: number;     // Historical FP rate
      falseNegativeRate: number;     // Historical FN rate
      meanHazardAtFailure: number;   // Mean hazard when failure occurred
    }
  ): Partial<HysteresisConfig> {
    // Derive K (consecutive safe intervals) from recovery time variance
    // Higher variance = more conservative K
    const k = Math.ceil(2 + calibrationData.varianceRecoveryTime);
    
    // Derive safety margin recovery % from false negative rate
    // Higher FN rate = require more recovery before trusting
    const safetyMarginRecovery = Math.min(0.5, 0.15 + calibrationData.falseNegativeRate * 0.5);
    
    // Derive minimum confidence from false positive rate
    // Higher FP rate = require higher confidence
    const minConfidence = Math.min(0.9, 0.5 + calibrationData.falsePositiveRate * 0.3);
    
    // Derive probe windows from recovery time
    // Longer recovery = more observation windows
    const probeWindows = Math.ceil(3 + calibrationData.meanRecoveryTime / 5);

    return {
      consecutiveIntervalsForHalfOpen: k,
      safetyMarginRecoveryPercent: safetyMarginRecovery,
      minimumConfidenceThreshold: minConfidence,
      consecutiveWindowsForClose: probeWindows
    };
  }

  // ============= Getters =============

  public getState(): HysteresisState {
    return { ...this.state };
  }

  public getInterventions(): Intervention[] {
    return [...this.interventions];
  }

  public isFlapping(): boolean {
    return this.state.isFlapping;
  }

  public getCurrentCircuitState(): CircuitState {
    return this.state.currentState;
  }

  public getStatistics(): {
    totalTransitions: number;
    timeInCurrentState: number;
    probeSuccessRate: number;
    isFlapping: boolean;
  } {
    const now = Date.now();
    const probeTotal = this.state.probeSuccesses + this.state.probeFailures;
    
    return {
      totalTransitions: this.state.recentTransitions.length,
      timeInCurrentState: now - this.state.lastStateChangeTimestamp,
      probeSuccessRate: probeTotal > 0 ? this.state.probeSuccesses / probeTotal : 1.0,
      isFlapping: this.state.isFlapping
    };
  }

  /**
   * Reset the hysteresis lock to initial state
   */
  public reset(): void {
    this.state = this.createInitialState();
    this.interventions = [];
  }
}

// ============= Hysteresis-Enhanced Circuit Breaker =============

export interface HysteresisCircuitBreakerConfig {
  circuitConfig: CircuitBreakerConfig;
  hysteresisConfig: HysteresisConfig;
}

/**
 * Create a hysteresis-enhanced circuit breaker that prevents flapping
 */
export function createHysteresisBreaker(
  config: HysteresisCircuitBreakerConfig
): HysteresisLock {
  return new HysteresisLock(config.hysteresisConfig, config.circuitConfig);
}

// ============= Exports =============

// All types are already exported inline with their definitions
