/**
 * LangChain Adapter for Interlock
 * ================================
 * 
 * Lightweight adapter providing safety guardrails for LangChain chains and retrievers.
 * 
 * Scope:
 * - Pre-execution safety checks
 * - Post-execution validation
 * - Refusal enforcement
 * - Trust decay / confidence tracking hooks
 * 
 * NOT in scope:
 * - Chain optimization
 * - Performance tuning
 * - Deep LangChain internals
 * 
 * Design: Observation + hooks only, no orchestration logic.
 */

import { MetricsRegistry } from '../../services/metrics';
import { HysteresisConfig } from '../../services/hysteresis';

// ============= Adapter Interface =============

/**
 * Standard Interlock adapter interface.
 * All adapters should implement this for consistency.
 */
export interface InterlockAdapter {
  observe(): AdapterMetrics;
  injectFailure?(): void;
  getConfidence(): number;
}

/**
 * Standard adapter metrics.
 */
export interface AdapterMetrics {
  latencyMs: number;
  confidenceScore: number;
  refusalCount: number;
  safetyChecksPassed: number;
  safetyChecksFailed: number;
  lastCheckedAt: number;
}

// ============= Chain Wrapper State =============

interface ChainWrapperState {
  executionCount: number;
  refusalCount: number;
  safetyViolations: number;
  totalLatencyMs: number;
  confidenceScore: number;
  lastExecutionAt: number;
  registry: MetricsRegistry;
}

// ============= Wrapped Chain Interface =============

export interface WrappedChain<TInput = any, TOutput = any> {
  execute(input: TInput): Promise<TOutput>;
  getMetrics(): AdapterMetrics;
  getConfidence(): number;
}

// ============= Safety Check Result =============

interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  confidence: number;
}

// ============= Pre-Execution Safety Checks =============

function preExecutionCheck(
  input: any,
  config: HysteresisConfig,
  state: ChainWrapperState
): SafetyCheckResult {
  // Trust decay check - confidence degrades over time
  const timeSinceLastExecution = Date.now() - state.lastExecutionAt;
  const trustDecayFactor = Math.exp(-timeSinceLastExecution / 300000); // 5min half-life
  const decayedConfidence = state.confidenceScore * trustDecayFactor;

  // Check minimum confidence threshold
  if (decayedConfidence < config.minimumConfidenceThreshold) {
    return {
      safe: false,
      reason: 'Trust decay below minimum threshold',
      confidence: decayedConfidence
    };
  }

  // Quality floor check - refuse if we can't meet quality standards
  if (config.qualityFloorEnabled && decayedConfidence < config.qualityFloor) {
    return {
      safe: false,
      reason: 'Confidence below quality floor',
      confidence: decayedConfidence
    };
  }

  return { safe: true, confidence: decayedConfidence };
}

// ============= Post-Execution Validation =============

function postExecutionValidation(
  output: any,
  config: HysteresisConfig,
  executionTimeMs: number
): SafetyCheckResult {
  // Validate output is not null/undefined
  if (output === null || output === undefined) {
    return {
      safe: false,
      reason: 'Null or undefined output',
      confidence: 0
    };
  }

  // Latency-based confidence degradation
  const latencyConfidence = executionTimeMs < 1000 ? 1.0 : Math.max(0.5, 1000 / executionTimeMs);

  return { safe: true, confidence: latencyConfidence };
}

// ============= Wrap Chain Function =============

/**
 * Wraps a LangChain chain with Interlock safety guardrails.
 * 
 * @param chainFn - The chain execution function
 * @param config - Hysteresis configuration for safety thresholds
 * @returns Wrapped chain with safety checks
 */
export function wrapChain<TInput = any, TOutput = any>(
  chainFn: (input: TInput) => Promise<TOutput>,
  config: HysteresisConfig
): WrappedChain<TInput, TOutput> {
  const state: ChainWrapperState = {
    executionCount: 0,
    refusalCount: 0,
    safetyViolations: 0,
    totalLatencyMs: 0,
    confidenceScore: 1.0,
    lastExecutionAt: Date.now(),
    registry: new MetricsRegistry()
  };

  return {
    async execute(input: TInput): Promise<TOutput> {
      const startTime = Date.now();

      // Pre-execution safety check
      const preCheck = preExecutionCheck(input, config, state);
      if (!preCheck.safe) {
        state.refusalCount++;
        state.registry.incQualityRefusals();
        
        if (config.dryRun) {
          console.log(`[Interlock Shadow Mode] WOULD REFUSE: ${preCheck.reason}`);
        } else {
          throw new Error(`Interlock safety refusal: ${preCheck.reason}`);
        }
      }

      state.confidenceScore = preCheck.confidence;

      // Execute chain
      let result: TOutput;
      try {
        result = await chainFn(input);
      } catch (error) {
        state.safetyViolations++;
        state.confidenceScore *= 0.8; // Degrade confidence on failure
        throw error;
      }

      const executionTime = Date.now() - startTime;
      state.totalLatencyMs += executionTime;
      state.registry.observeLatency(executionTime);

      // Post-execution validation
      const postCheck = postExecutionValidation(result, config, executionTime);
      if (!postCheck.safe) {
        state.safetyViolations++;
        state.confidenceScore *= 0.9;
        
        if (config.dryRun) {
          console.log(`[Interlock Shadow Mode] VALIDATION FAILED: ${postCheck.reason}`);
        } else {
          throw new Error(`Interlock validation failed: ${postCheck.reason}`);
        }
      }

      // Update confidence with post-check result
      state.confidenceScore = Math.min(state.confidenceScore, postCheck.confidence);
      state.executionCount++;
      state.lastExecutionAt = Date.now();

      return result;
    },

    getMetrics(): AdapterMetrics {
      return {
        latencyMs: state.executionCount > 0 ? state.totalLatencyMs / state.executionCount : 0,
        confidenceScore: state.confidenceScore,
        refusalCount: state.refusalCount,
        safetyChecksPassed: state.executionCount - state.safetyViolations,
        safetyChecksFailed: state.safetyViolations,
        lastCheckedAt: state.lastExecutionAt
      };
    },

    getConfidence(): number {
      return state.confidenceScore;
    }
  };
}

// ============= Wrap Retriever Function =============

export interface WrappedRetriever<TQuery = any, TDoc = any> {
  retrieve(query: TQuery): Promise<TDoc[]>;
  getMetrics(): AdapterMetrics;
  getConfidence(): number;
}

/**
 * Wraps a LangChain retriever with Interlock safety guardrails.
 * 
 * @param retrieverFn - The retriever function
 * @param config - Hysteresis configuration
 * @returns Wrapped retriever with safety checks
 */
export function wrapRetriever<TQuery = any, TDoc = any>(
  retrieverFn: (query: TQuery) => Promise<TDoc[]>,
  config: HysteresisConfig
): WrappedRetriever<TQuery, TDoc> {
  const state: ChainWrapperState = {
    executionCount: 0,
    refusalCount: 0,
    safetyViolations: 0,
    totalLatencyMs: 0,
    confidenceScore: 1.0,
    lastExecutionAt: Date.now(),
    registry: new MetricsRegistry()
  };

  return {
    async retrieve(query: TQuery): Promise<TDoc[]> {
      const startTime = Date.now();

      // Pre-execution check
      const preCheck = preExecutionCheck(query, config, state);
      if (!preCheck.safe) {
        state.refusalCount++;
        state.registry.incQualityRefusals();
        
        if (config.dryRun) {
          console.log(`[Interlock Shadow Mode] WOULD REFUSE RETRIEVAL: ${preCheck.reason}`);
          return await retrieverFn(query); // Shadow mode: allow but log
        } else {
          throw new Error(`Interlock retrieval refusal: ${preCheck.reason}`);
        }
      }

      state.confidenceScore = preCheck.confidence;

      // Execute retrieval
      let docs: TDoc[];
      try {
        docs = await retrieverFn(query);
      } catch (error) {
        state.safetyViolations++;
        state.confidenceScore *= 0.8;
        throw error;
      }

      const executionTime = Date.now() - startTime;
      state.totalLatencyMs += executionTime;
      state.registry.observeLatency(executionTime);

      // Validate retrieval results
      if (!docs || docs.length === 0) {
        state.confidenceScore *= 0.95; // Slight degradation for empty results
      }

      state.executionCount++;
      state.lastExecutionAt = Date.now();

      return docs;
    },

    getMetrics(): AdapterMetrics {
      return {
        latencyMs: state.executionCount > 0 ? state.totalLatencyMs / state.executionCount : 0,
        confidenceScore: state.confidenceScore,
        refusalCount: state.refusalCount,
        safetyChecksPassed: state.executionCount - state.safetyViolations,
        safetyChecksFailed: state.safetyViolations,
        lastCheckedAt: state.lastExecutionAt
      };
    },

    getConfidence(): number {
      return state.confidenceScore;
    }
  };
}

// ============= Get Metrics Function =============

/**
 * Retrieves current metrics from wrapped chain or retriever.
 * 
 * @param wrapped - Wrapped chain or retriever
 * @returns Current metrics snapshot
 */
export function getMetrics(wrapped: WrappedChain | WrappedRetriever): AdapterMetrics {
  return wrapped.getMetrics();
}
