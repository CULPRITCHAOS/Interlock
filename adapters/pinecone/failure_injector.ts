/**
 * Pinecone Failure Injector
 * ==========================
 * 
 * Detects failure signals from Pinecone operations and provides controlled failure injection
 * for testing resilience.
 * 
 * Purpose: Make failures visible before they cascade.
 */

export interface FailureSignal {
  timestamp: number;
  type: 'timeout' | 'error' | 'degraded_quality' | 'rate_limit';
  severity: 'low' | 'medium' | 'high';
  message: string;
  metadata?: Record<string, any>;
}

export interface FailureStats {
  totalFailures: number;
  failuresByType: Record<string, number>;
  recentFailureRate: number; // Failures per minute
  lastFailureAt?: number;
}

/**
 * Failure signal detector and controlled injector for Pinecone.
 */
export class FailureInjector {
  private signals: FailureSignal[] = [];
  private readonly maxSignals: number = 500;
  private readonly windowMs: number = 300000; // 5 minutes
  private injectionEnabled: boolean = false;
  private injectionRate: number = 0.0; // 0.0 to 1.0

  /**
   * Records a failure signal.
   */
  recordSignal(signal: FailureSignal): void {
    this.signals.push(signal);

    // Trim old signals
    const cutoff = Date.now() - this.windowMs;
    this.signals = this.signals.filter(s => s.timestamp > cutoff);

    // Keep max size bounded
    if (this.signals.length > this.maxSignals) {
      this.signals = this.signals.slice(-this.maxSignals);
    }
  }

  /**
   * Gets failure statistics.
   */
  getStats(): FailureStats {
    if (this.signals.length === 0) {
      return {
        totalFailures: 0,
        failuresByType: {},
        recentFailureRate: 0
      };
    }

    const failuresByType: Record<string, number> = {};
    for (const signal of this.signals) {
      failuresByType[signal.type] = (failuresByType[signal.type] || 0) + 1;
    }

    // Calculate recent failure rate (per minute)
    const now = Date.now();
    const recentWindow = 60000; // 1 minute
    const recentSignals = this.signals.filter(s => now - s.timestamp < recentWindow);
    const recentFailureRate = recentSignals.length;

    const lastFailure = this.signals[this.signals.length - 1];

    return {
      totalFailures: this.signals.length,
      failuresByType,
      recentFailureRate,
      lastFailureAt: lastFailure?.timestamp
    };
  }

  /**
   * Detects if system is in failure state.
   */
  isInFailureState(threshold: number = 5): boolean {
    const stats = this.getStats();
    return stats.recentFailureRate > threshold;
  }

  /**
   * Enables controlled failure injection for testing.
   * 
   * @param rate - Failure injection rate (0.0 to 1.0)
   */
  enableInjection(rate: number = 0.1): void {
    this.injectionEnabled = true;
    this.injectionRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Disables failure injection.
   */
  disableInjection(): void {
    this.injectionEnabled = false;
    this.injectionRate = 0.0;
  }

  /**
   * Determines if a failure should be injected (for testing).
   */
  shouldInjectFailure(): boolean {
    if (!this.injectionEnabled) {
      return false;
    }
    return Math.random() < this.injectionRate;
  }

  /**
   * Clears all recorded signals.
   */
  clear(): void {
    this.signals = [];
  }
}

/**
 * Wraps a Pinecone function with failure detection.
 */
export function wrapWithFailureDetection<T>(
  fn: (...args: any[]) => Promise<T>,
  injector: FailureInjector
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    // Check for controlled failure injection (testing only)
    if (injector.shouldInjectFailure()) {
      const signal: FailureSignal = {
        timestamp: Date.now(),
        type: 'error',
        severity: 'medium',
        message: 'Controlled failure injection (testing mode)'
      };
      injector.recordSignal(signal);
      throw new Error('Interlock: Controlled failure injection');
    }

    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      // Detect and record failure signal
      const signal: FailureSignal = {
        timestamp: Date.now(),
        type: determineFailureType(error),
        severity: determineFailureSeverity(error),
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: { error: String(error) }
      };
      
      injector.recordSignal(signal);
      throw error;
    }
  };
}

/**
 * Determines failure type from error.
 */
function determineFailureType(error: any): FailureSignal['type'] {
  const message = String(error).toLowerCase();
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('rate limit') || message.includes('quota')) {
    return 'rate_limit';
  }
  if (message.includes('quality') || message.includes('recall')) {
    return 'degraded_quality';
  }
  
  return 'error';
}

/**
 * Determines failure severity from error.
 */
function determineFailureSeverity(error: any): FailureSignal['severity'] {
  const message = String(error).toLowerCase();
  
  if (message.includes('critical') || message.includes('fatal')) {
    return 'high';
  }
  if (message.includes('timeout') || message.includes('rate limit')) {
    return 'medium';
  }
  
  return 'low';
}
