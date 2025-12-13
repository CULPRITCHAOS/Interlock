/**
 * LawForge Self-Defending FAISS Client
 * =====================================
 * Auto-generated circuit breaker for FAISS index operations.
 * 
 * Configuration (from Phase IV certification):
 * - Recall Threshold: 0.7
 * - Latency Threshold: 50ms
 * - Hazard Threshold: 0.6
 * 
 * Behavior:
 * - Automatically reduces nprobe when hazard exceeds threshold
 * - Switches to lower-accuracy mode under stress
 * - Logs all interventions
 * - Resumes optimal mode when safe
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  recallThreshold: number;
  latencyThresholdMs: number;
  hazardThreshold: number;
  recoveryCheckIntervalS: number;
  consecutiveSuccessesForClose: number;
  degradedNprobe: number;
  optimalNprobe: number;
}

export interface Intervention {
  timestamp: number;
  previousState: CircuitState;
  newState: CircuitState;
  trigger: string;
  metrics: { recall: number; latencyMs: number; hazard: number };
  actionTaken: string;
}

export class SelfDefendingFAISSClient {
  private config: CircuitBreakerConfig = {
    recallThreshold: 0.7,
    latencyThresholdMs: 50,
    hazardThreshold: 0.6,
    recoveryCheckIntervalS: 30.0,
    consecutiveSuccessesForClose: 3,
    degradedNprobe: 1,
    optimalNprobe: 10
  };
  
  private state: CircuitState = 'closed';
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private lastStateChange: number = Date.now();
  private interventions: Intervention[] = [];
  private recentRecalls: number[] = [];
  private recentLatencies: number[] = [];
  
  constructor(private index: any) {
    console.log('Initialized SelfDefendingFAISSClient in closed state');
  }
  
  private logIntervention(
    previousState: CircuitState,
    newState: CircuitState,
    trigger: string,
    metrics: { recall: number; latencyMs: number; hazard: number },
    action: string
  ): void {
    const intervention: Intervention = {
      timestamp: Date.now(),
      previousState,
      newState,
      trigger,
      metrics,
      actionTaken: action
    };
    this.interventions.push(intervention);
    console.warn(`CIRCUIT BREAKER: ${previousState} -> ${newState} | ${trigger} | ${action}`);
  }
  
  private calculateHazardScore(): number {
    if (this.recentRecalls.length < 2) return 0;
    
    const avgRecall = this.recentRecalls.slice(-5).reduce((a, b) => a + b, 0) / 
                      Math.min(5, this.recentRecalls.length);
    const recallMargin = avgRecall - this.config.recallThreshold;
    const recallHazard = Math.max(0, 1 - (recallMargin / 0.3));
    
    const avgLatency = this.recentLatencies.slice(-5).reduce((a, b) => a + b, 0) /
                       Math.min(5, this.recentLatencies.length);
    const latencyMargin = this.config.latencyThresholdMs - avgLatency;
    const latencyHazard = Math.max(0, 1 - (latencyMargin / 20));
    
    return Math.min(1.0, 0.6 * recallHazard + 0.4 * latencyHazard);
  }
  
  private applyDegradedMode(): string {
    if (this.index.nprobe !== undefined) {
      this.index.nprobe = this.config.degradedNprobe;
    }
    return `nprobe=${this.config.degradedNprobe}`;
  }
  
  private applyOptimalMode(): string {
    if (this.index.nprobe !== undefined) {
      this.index.nprobe = this.config.optimalNprobe;
    }
    return `nprobe=${this.config.optimalNprobe}`;
  }
  
  /**
   * Search the index with circuit breaker protection.
   * 
   * @param queries - Query vectors
   * @param k - Number of neighbors to return
   * @returns Search results (distances and indices)
   */
  search(queries: Float32Array, k: number): { distances: Float32Array; indices: Int32Array } {
    const start = performance.now();
    const result = this.index.search(queries, k);
    const latencyMs = performance.now() - start;
    
    // Note: In production, compute recall against ground truth
    const recall = 0.85; // Placeholder - implement actual recall measurement
    
    this.recentRecalls.push(recall);
    this.recentLatencies.push(latencyMs);
    
    if (this.recentRecalls.length > 10) {
      this.recentRecalls = this.recentRecalls.slice(-10);
      this.recentLatencies = this.recentLatencies.slice(-10);
    }
    
    this.checkAndUpdateState(recall, latencyMs);
    
    return result;
  }
  
  private checkAndUpdateState(recall: number, latencyMs: number): void {
    const hazard = this.calculateHazardScore();
    const metrics = { recall, latencyMs, hazard };
    const success = recall >= this.config.recallThreshold && 
                    latencyMs <= this.config.latencyThresholdMs;
    
    if (this.state === 'closed') {
      if (hazard >= this.config.hazardThreshold) {
        const action = this.applyDegradedMode();
        this.logIntervention('closed', 'open', 
          `Hazard ${hazard.toFixed(3)} exceeded threshold`, metrics, action);
        this.state = 'open';
        this.lastStateChange = Date.now();
        this.consecutiveSuccesses = 0;
      } else if (!success) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 3) {
          const action = this.applyDegradedMode();
          this.logIntervention('closed', 'open',
            `${this.consecutiveFailures} consecutive failures`, metrics, action);
          this.state = 'open';
          this.lastStateChange = Date.now();
          this.consecutiveFailures = 0;
        }
      } else {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
      }
    } else if (this.state === 'open') {
      const timeSinceChange = Date.now() - this.lastStateChange;
      if (timeSinceChange >= this.config.recoveryCheckIntervalS * 1000) {
        if (hazard < this.config.hazardThreshold * 0.7) {
          this.logIntervention('open', 'half_open',
            `Hazard reduced to ${hazard.toFixed(3)}`, metrics, 'Testing recovery');
          this.state = 'half_open';
          this.lastStateChange = Date.now();
          this.consecutiveSuccesses = 0;
        }
      }
    } else if (this.state === 'half_open') {
      if (success && hazard < this.config.hazardThreshold * 0.7) {
        this.consecutiveSuccesses++;
        if (this.consecutiveSuccesses >= this.config.consecutiveSuccessesForClose) {
          const action = this.applyOptimalMode();
          this.logIntervention('half_open', 'closed',
            `Recovery successful after ${this.consecutiveSuccesses} successes`, metrics, action);
          this.state = 'closed';
          this.lastStateChange = Date.now();
          this.consecutiveSuccesses = 0;
        }
      } else {
        const action = this.applyDegradedMode();
        this.logIntervention('half_open', 'open',
          'Recovery failed', metrics, action);
        this.state = 'open';
        this.lastStateChange = Date.now();
        this.consecutiveFailures = 0;
      }
    }
  }
  
  /**
   * Get current circuit breaker state.
   */
  getState(): { state: CircuitState; hazard: number; interventions: number } {
    return {
      state: this.state,
      hazard: this.calculateHazardScore(),
      interventions: this.interventions.length
    };
  }
  
  /**
   * Get log of all circuit breaker interventions.
   */
  getInterventionLog(): Intervention[] {
    return this.interventions;
  }
  
  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    this.state = 'closed';
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
    this.interventions = [];
    this.recentRecalls = [];
    this.recentLatencies = [];
    this.applyOptimalMode();
    console.log('Circuit breaker reset to closed state');
  }
}

// Usage example:
// const client = new SelfDefendingFAISSClient(faissIndex);
// const { distances, indices } = client.search(queries, 10);
// console.log(client.getState());
