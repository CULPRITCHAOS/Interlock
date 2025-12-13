/**
 * LlamaIndex Adapter for Interlock
 * =================================
 * 
 * Lightweight adapter providing safety guardrails for LlamaIndex query engines and retrievers.
 * 
 * Scope:
 * - Pre-execution safety checks
 * - Post-execution validation
 * - Refusal enforcement
 * - Trust decay / confidence tracking hooks
 * 
 * NOT in scope:
 * - Index optimization
 * - Performance tuning
 * - Deep LlamaIndex internals
 * 
 * Design: Observation + hooks only, no orchestration logic.
 */

import { MetricsRegistry } from '../../services/metrics';
import { HysteresisConfig } from '../../services/hysteresis';

// ============= Adapter Interface =============

export interface InterlockAdapter {
  observe(): AdapterMetrics;
  injectFailure?(): void;
  getConfidence(): number;
}

export interface AdapterMetrics {
  latencyMs: number;
  confidenceScore: number;
  refusalCount: number;
  safetyChecksPassed: number;
  safetyChecksFailed: number;
  lastCheckedAt: number;
}

// ============= Query Engine Wrapper State =============

interface QueryEngineState {
  queryCount: number;
  refusalCount: number;
  safetyViolations: number;
  totalLatencyMs: number;
  confidenceScore: number;
  lastQueryAt: number;
  registry: MetricsRegistry;
}

// ============= Wrapped Query Engine Interface =============

export interface WrappedQueryEngine<TQuery = any, TResponse = any> {
  query(input: TQuery): Promise<TResponse>;
  getMetrics(): AdapterMetrics;
  getConfidence(): number;
}

// ============= Safety Check Result =============

interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
  confidence: number;
}

// ============= Pre-Query Safety Checks =============

function preQueryCheck(
  query: any,
  config: HysteresisConfig,
  state: QueryEngineState
): SafetyCheckResult {
  // Trust decay check - confidence degrades over time
  const timeSinceLastQuery = Date.now() - state.lastQueryAt;
  const trustDecayFactor = Math.exp(-timeSinceLastQuery / 300000); // 5min half-life
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

// ============= Post-Query Validation =============

function postQueryValidation(
  response: any,
  config: HysteresisConfig,
  executionTimeMs: number
): SafetyCheckResult {
  // Validate response is not null/undefined
  if (response === null || response === undefined) {
    return {
      safe: false,
      reason: 'Null or undefined response',
      confidence: 0
    };
  }

  // Latency-based confidence degradation
  const latencyConfidence = executionTimeMs < 1000 ? 1.0 : Math.max(0.5, 1000 / executionTimeMs);

  return { safe: true, confidence: latencyConfidence };
}

// ============= Wrap Chain Function (Query Engine Wrapper) =============

/**
 * Wraps a LlamaIndex query engine with Interlock safety guardrails.
 * 
 * @param queryFn - The query engine function
 * @param config - Hysteresis configuration for safety thresholds
 * @returns Wrapped query engine with safety checks
 */
export function wrapChain<TQuery = any, TResponse = any>(
  queryFn: (query: TQuery) => Promise<TResponse>,
  config: HysteresisConfig
): WrappedQueryEngine<TQuery, TResponse> {
  const state: QueryEngineState = {
    queryCount: 0,
    refusalCount: 0,
    safetyViolations: 0,
    totalLatencyMs: 0,
    confidenceScore: 1.0,
    lastQueryAt: Date.now(),
    registry: new MetricsRegistry()
  };

  return {
    async query(input: TQuery): Promise<TResponse> {
      const startTime = Date.now();

      // Pre-query safety check
      const preCheck = preQueryCheck(input, config, state);
      if (!preCheck.safe) {
        state.refusalCount++;
        state.registry.incQualityRefusals();
        
        if (config.dryRun) {
          console.log(`[Interlock Shadow Mode] WOULD REFUSE QUERY: ${preCheck.reason}`);
        } else {
          throw new Error(`Interlock safety refusal: ${preCheck.reason}`);
        }
      }

      state.confidenceScore = preCheck.confidence;

      // Execute query
      let result: TResponse;
      try {
        result = await queryFn(input);
      } catch (error) {
        state.safetyViolations++;
        state.confidenceScore *= 0.8; // Degrade confidence on failure
        throw error;
      }

      const executionTime = Date.now() - startTime;
      state.totalLatencyMs += executionTime;
      state.registry.observeLatency(executionTime);

      // Post-query validation
      const postCheck = postQueryValidation(result, config, executionTime);
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
      state.queryCount++;
      state.lastQueryAt = Date.now();

      return result;
    },

    getMetrics(): AdapterMetrics {
      return {
        latencyMs: state.queryCount > 0 ? state.totalLatencyMs / state.queryCount : 0,
        confidenceScore: state.confidenceScore,
        refusalCount: state.refusalCount,
        safetyChecksPassed: state.queryCount - state.safetyViolations,
        safetyChecksFailed: state.safetyViolations,
        lastCheckedAt: state.lastQueryAt
      };
    },

    getConfidence(): number {
      return state.confidenceScore;
    }
  };
}

// ============= Wrap Retriever Function =============

export interface WrappedRetriever<TQuery = any, TNode = any> {
  retrieve(query: TQuery): Promise<TNode[]>;
  getMetrics(): AdapterMetrics;
  getConfidence(): number;
}

/**
 * Wraps a LlamaIndex retriever with Interlock safety guardrails.
 * 
 * @param retrieverFn - The retriever function
 * @param config - Hysteresis configuration
 * @returns Wrapped retriever with safety checks
 */
export function wrapRetriever<TQuery = any, TNode = any>(
  retrieverFn: (query: TQuery) => Promise<TNode[]>,
  config: HysteresisConfig
): WrappedRetriever<TQuery, TNode> {
  const state: QueryEngineState = {
    queryCount: 0,
    refusalCount: 0,
    safetyViolations: 0,
    totalLatencyMs: 0,
    confidenceScore: 1.0,
    lastQueryAt: Date.now(),
    registry: new MetricsRegistry()
  };

  return {
    async retrieve(query: TQuery): Promise<TNode[]> {
      const startTime = Date.now();

      // Pre-retrieval check
      const preCheck = preQueryCheck(query, config, state);
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
      let nodes: TNode[];
      try {
        nodes = await retrieverFn(query);
      } catch (error) {
        state.safetyViolations++;
        state.confidenceScore *= 0.8;
        throw error;
      }

      const executionTime = Date.now() - startTime;
      state.totalLatencyMs += executionTime;
      state.registry.observeLatency(executionTime);

      // Validate retrieval results
      if (!nodes || nodes.length === 0) {
        state.confidenceScore *= 0.95; // Slight degradation for empty results
      }

      state.queryCount++;
      state.lastQueryAt = Date.now();

      return nodes;
    },

    getMetrics(): AdapterMetrics {
      return {
        latencyMs: state.queryCount > 0 ? state.totalLatencyMs / state.queryCount : 0,
        confidenceScore: state.confidenceScore,
        refusalCount: state.refusalCount,
        safetyChecksPassed: state.queryCount - state.safetyViolations,
        safetyChecksFailed: state.safetyViolations,
        lastCheckedAt: state.lastQueryAt
      };
    },

    getConfidence(): number {
      return state.confidenceScore;
    }
  };
}

// ============= Get Metrics Function =============

/**
 * Retrieves current metrics from wrapped query engine or retriever.
 * 
 * @param wrapped - Wrapped query engine or retriever
 * @returns Current metrics snapshot
 */
export function getMetrics(wrapped: WrappedQueryEngine | WrappedRetriever): AdapterMetrics {
  return wrapped.getMetrics();
}
