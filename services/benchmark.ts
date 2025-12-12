/**
 * Benchmark Service for SOS Tournament
 * =====================================
 * Provides deterministic benchmark harness with:
 * - Fixed seeds for reproducibility
 * - Run-to-run variance measurement
 * - FAISS-like metrics (recall@k, latency, memory)
 */

import { 
  BenchmarkConfig, 
  BenchmarkRunResult, 
  WorkloadFingerprint,
  Law,
  LawTrialResult,
  LawCounterexample,
  TransferABTestResult,
  SOSGenome
} from '../types';
import { DEFAULT_BENCHMARK_CONFIG, DEFAULT_FAISS_FINGERPRINT } from '../constants';

// Configuration constants for law validation
const LAW_CONFIDENCE_WEIGHTS = {
  ORIGINAL_WEIGHT: 0.3,
  TRIAL_WEIGHT: 0.7,
  COUNTEREXAMPLE_PENALTY: 0.05
};

const LAW_STATUS_THRESHOLDS = {
  COUNTEREXAMPLE_FALSIFICATION_COUNT: 3,
  DEPRECATED_CONFIDENCE: 0.5,
  VALIDATED_CONFIDENCE: 0.8
};

const SEVERITY_THRESHOLDS = {
  CRITICAL_MULTIPLIER: 0.8,
  MAJOR_MULTIPLIER: 0.9
};

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Linear congruential generator
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // Reset to original seed
  reset(seed: number): void {
    this.seed = seed;
  }

  // Generate normal distribution (Box-Muller)
  nextGaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
}

// Global seeded RNG instance
let rng = new SeededRandom(DEFAULT_BENCHMARK_CONFIG.seed);

// Utility to generate benchmark IDs
const generateBenchmarkId = () => `bench-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

/**
 * Initialize benchmark with a specific seed for reproducibility
 */
export function initBenchmark(seed: number): void {
  rng = new SeededRandom(seed);
  console.log(`[Benchmark] Initialized with seed: ${seed}`);
}

/**
 * Simulate FAISS-like metrics based on genome parameters
 * This simulates recall@k, latency, and memory based on alpha and strategy
 */
export function simulateFAISSMetrics(
  genome: SOSGenome, 
  fingerprint: WorkloadFingerprint = DEFAULT_FAISS_FINGERPRINT
): { recall: number; latencyMs: number; memoryMb: number } {
  // Recall is influenced by alpha and strategy
  // Higher alpha with gaussian strategy tends to yield better recall
  const baseRecall = 0.7;
  const alphaBonus = (genome.alpha - 2.0) * 0.05;
  const strategyBonus = genome.sampleStrategy === 'gaussian' ? 0.1 : 
                        genome.sampleStrategy === 'adaptive' ? 0.08 : 0.02;
  const dimensionPenalty = (fingerprint.dimensions / 1000) * 0.05;
  const noise = (rng.next() - 0.5) * 0.05;
  
  const recall = Math.min(0.99, Math.max(0.5, baseRecall + alphaBonus + strategyBonus - dimensionPenalty + noise));
  
  // Latency is influenced by dataset size and strategy
  // Exploit strategy has lower latency, uniform has higher
  const baseLatency = 5.0; // 5ms base
  const sizeMultiplier = Math.log10(fingerprint.datasetSize) / 4;
  const strategyLatency = genome.sampleStrategy === 'exploit' ? 0.8 : 
                          genome.sampleStrategy === 'gaussian' ? 1.2 : 1.5;
  const latencyNoise = (rng.next() - 0.5) * 2;
  
  const latencyMs = Math.max(0.5, baseLatency * sizeMultiplier * strategyLatency + latencyNoise);
  
  // Memory is influenced by alpha and dataset size
  const baseMemory = (fingerprint.datasetSize * fingerprint.dimensions * 4) / (1024 * 1024); // bytes to MB
  const alphaMemoryFactor = 1 + (genome.alpha - 2) * 0.1;
  const memoryNoise = (rng.next() - 0.5) * baseMemory * 0.1;
  
  const memoryMb = Math.max(1, baseMemory * alphaMemoryFactor + memoryNoise);
  
  return { recall, latencyMs, memoryMb };
}

/**
 * Run a single benchmark iteration with variance tracking
 */
export function runBenchmarkIteration(
  genome: SOSGenome,
  config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG,
  runIndex: number = 0
): BenchmarkRunResult {
  // Use combined seed for this specific run (base seed + run index)
  const runSeed = config.seed + runIndex;
  rng.reset(runSeed);
  
  const results: Array<{ recall: number; latencyMs: number; memoryMb: number }> = [];
  
  // Run multiple queries to get variance
  for (let i = 0; i < config.queryCount; i++) {
    results.push(simulateFAISSMetrics(genome, config.workloadFingerprint));
  }
  
  // Calculate mean metrics
  const meanRecall = results.reduce((s, r) => s + r.recall, 0) / results.length;
  const meanLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;
  const meanMemory = results.reduce((s, r) => s + r.memoryMb, 0) / results.length;
  
  // Calculate variance
  const varianceRecall = results.reduce((s, r) => s + Math.pow(r.recall - meanRecall, 2), 0) / results.length;
  const varianceLatency = results.reduce((s, r) => s + Math.pow(r.latencyMs - meanLatency, 2), 0) / results.length;
  const varianceMemory = results.reduce((s, r) => s + Math.pow(r.memoryMb - meanMemory, 2), 0) / results.length;
  
  return {
    runId: generateBenchmarkId(),
    seed: runSeed,
    generation: genome.generation,
    metrics: {
      recall: meanRecall,
      latencyMs: meanLatency,
      memoryMb: meanMemory
    },
    variance: {
      recall: varianceRecall,
      latency: varianceLatency,
      memory: varianceMemory
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Run full benchmark suite with multiple runs for variance measurement
 */
export function runFullBenchmark(
  genome: SOSGenome,
  config: BenchmarkConfig = DEFAULT_BENCHMARK_CONFIG
): BenchmarkRunResult[] {
  const results: BenchmarkRunResult[] = [];
  
  for (let i = 0; i < config.runs; i++) {
    results.push(runBenchmarkIteration(genome, config, i));
  }
  
  return results;
}

/**
 * Validate a law against current benchmark results
 * Returns a trial result indicating success/failure
 */
export function validateLaw(
  law: Law,
  genome: SOSGenome,
  benchmarkResult: BenchmarkRunResult
): LawTrialResult {
  // Determine expected outcome based on law description
  // This is a simplified validation - in production, laws would have structured predicates
  const trialId = `trial-${Date.now().toString(36)}`;
  
  // Example validation logic based on law patterns
  let success = true;
  let observedValue = 0;
  let expectedRange: [number, number] = [0, 1];
  
  if (law.domain === 'faiss') {
    // For FAISS laws, validate against recall
    observedValue = benchmarkResult.metrics.recall;
    expectedRange = [0.7, 0.99];
    
    // Check if alpha is in expected range based on law
    if (law.description.includes('alpha') || law.description.includes('M >')) {
      success = genome.alpha > 2.5 ? observedValue > 0.8 : observedValue > 0.6;
    } else {
      success = observedValue >= expectedRange[0] && observedValue <= expectedRange[1];
    }
  } else if (law.domain === 'postgres') {
    // For Postgres laws, validate against latency
    observedValue = benchmarkResult.metrics.latencyMs;
    expectedRange = [1, 20];
    success = observedValue >= expectedRange[0] && observedValue <= expectedRange[1];
  } else {
    // Generic validation
    observedValue = benchmarkResult.metrics.recall;
    expectedRange = [0.5, 1.0];
    success = observedValue >= expectedRange[0];
  }
  
  return {
    trialId,
    generation: genome.generation,
    success,
    observedValue,
    expectedRange
  };
}

/**
 * Create a counterexample when a law validation fails
 */
export function createCounterexample(
  law: Law,
  genome: SOSGenome,
  trialResult: LawTrialResult,
  fingerprint: WorkloadFingerprint
): LawCounterexample {
  return {
    id: `cx-${Date.now().toString(36)}`,
    observedAt: genome.generation,
    workloadFingerprint: fingerprint,
    expectedOutcome: `Value in range [${trialResult.expectedRange[0]}, ${trialResult.expectedRange[1]}]`,
    actualOutcome: `Observed: ${trialResult.observedValue.toFixed(4)}`,
    severity: trialResult.observedValue < trialResult.expectedRange[0] * SEVERITY_THRESHOLDS.CRITICAL_MULTIPLIER ? 'critical' :
              trialResult.observedValue < trialResult.expectedRange[0] * SEVERITY_THRESHOLDS.MAJOR_MULTIPLIER ? 'major' : 'minor'
  };
}

/**
 * Update law confidence based on trial results
 */
export function updateLawConfidence(law: Law): number {
  if (!law.trialResults || law.trialResults.length === 0) {
    return law.confidence;
  }
  
  const successCount = law.trialResults.filter(t => t.success).length;
  const totalTrials = law.trialResults.length;
  
  // Weighted confidence: original confidence * ORIGINAL_WEIGHT + trial success rate * TRIAL_WEIGHT
  const trialConfidence = successCount / totalTrials;
  const newConfidence = law.confidence * LAW_CONFIDENCE_WEIGHTS.ORIGINAL_WEIGHT + 
                        trialConfidence * LAW_CONFIDENCE_WEIGHTS.TRIAL_WEIGHT;
  
  // Apply penalty for counterexamples
  const counterexamplePenalty = (law.counterexamples?.length || 0) * LAW_CONFIDENCE_WEIGHTS.COUNTEREXAMPLE_PENALTY;
  
  return Math.max(0, Math.min(1, newConfidence - counterexamplePenalty));
}

/**
 * Determine law status based on confidence and counterexamples
 */
export function determineLawStatus(law: Law): Law['status'] {
  const confidence = updateLawConfidence(law);
  const counterexampleCount = law.counterexamples?.length || 0;
  
  if (counterexampleCount >= LAW_STATUS_THRESHOLDS.COUNTEREXAMPLE_FALSIFICATION_COUNT) {
    return 'falsified';
  }
  
  if (confidence < LAW_STATUS_THRESHOLDS.DEPRECATED_CONFIDENCE) {
    return 'deprecated';
  }
  
  if (confidence >= LAW_STATUS_THRESHOLDS.VALIDATED_CONFIDENCE && counterexampleCount === 0) {
    return 'validated';
  }
  
  return 'hypothesis';
}

/**
 * Run A/B test comparing baseline optimizer vs transfer-enabled optimizer
 */
export function runTransferABTest(
  sourceGenome: SOSGenome,
  targetGenome: SOSGenome,
  generations: number = 50,
  fitnessThreshold: number = 0.7
): TransferABTestResult {
  const config = DEFAULT_BENCHMARK_CONFIG;
  
  // Track baseline metrics (no transfer)
  let baselineTimeToThreshold = generations;
  let baselineBestAchieved = targetGenome.fitness;
  let baselineCumulativeRegret = 0;
  
  // Track transfer metrics
  let transferTimeToThreshold = generations;
  let transferBestAchieved = targetGenome.fitness;
  let transferCumulativeRegret = 0;
  
  // Simulate baseline evolution (no strategy transfer)
  let baselineFitness = targetGenome.fitness;
  for (let gen = 0; gen < generations; gen++) {
    // Slow evolution without transfer
    const improvement = (rng.next() - 0.3) * 0.02;
    baselineFitness = Math.min(0.95, Math.max(0.1, baselineFitness + improvement));
    baselineBestAchieved = Math.max(baselineBestAchieved, baselineFitness);
    
    if (baselineFitness >= fitnessThreshold && baselineTimeToThreshold === generations) {
      baselineTimeToThreshold = gen;
    }
    
    // Regret = optimal - actual
    baselineCumulativeRegret += (0.95 - baselineFitness);
  }
  
  // Simulate transfer-enabled evolution
  let transferFitness = targetGenome.fitness;
  // Apply initial boost from strategy transfer
  const transferBoost = sourceGenome.fitness > targetGenome.fitness ? 
    (sourceGenome.fitness - targetGenome.fitness) * 0.3 : 0;
  transferFitness += transferBoost;
  
  for (let gen = 0; gen < generations; gen++) {
    // Faster evolution with transfer knowledge
    const improvement = (rng.next() - 0.2) * 0.03;
    transferFitness = Math.min(0.95, Math.max(0.1, transferFitness + improvement));
    transferBestAchieved = Math.max(transferBestAchieved, transferFitness);
    
    if (transferFitness >= fitnessThreshold && transferTimeToThreshold === generations) {
      transferTimeToThreshold = gen;
    }
    
    transferCumulativeRegret += (0.95 - transferFitness);
  }
  
  // Helper function to safely calculate percentage improvement
  const safePercentageImprovement = (baseline: number, transfer: number, baselineDenom: number): number => {
    if (baselineDenom === 0) return 0;
    return ((baseline - transfer) / baselineDenom) * 100;
  };
  
  // Calculate improvements (positive = transfer is better)
  // For time and regret: lower is better, so (baseline - transfer) / baseline
  // For best achieved: higher is better, so (transfer - baseline) / baseline
  const timeImprovement = safePercentageImprovement(baselineTimeToThreshold, transferTimeToThreshold, baselineTimeToThreshold);
  const bestImprovement = baselineBestAchieved === 0 ? 0 : 
    ((transferBestAchieved - baselineBestAchieved) / baselineBestAchieved) * 100;
  const regretImprovement = safePercentageImprovement(baselineCumulativeRegret, transferCumulativeRegret, baselineCumulativeRegret);
  
  // Determine if transfer is net positive (majority of metrics improved)
  const improvements = [timeImprovement, bestImprovement, regretImprovement];
  const positiveCount = improvements.filter(i => i > 0).length;
  const isNetPositive = positiveCount >= 2;
  
  // Calculate confidence based on improvement magnitude
  const avgImprovement = improvements.reduce((a, b) => a + b, 0) / 3;
  const confidence = Math.min(0.99, Math.max(0.5, 0.5 + avgImprovement / 100));
  
  return {
    id: `abtest-${Date.now().toString(36)}`,
    sourceDomain: sourceGenome.domain,
    targetDomain: targetGenome.domain,
    baselineMetrics: {
      timeToThreshold: baselineTimeToThreshold,
      bestAchieved: baselineBestAchieved,
      regret: baselineCumulativeRegret
    },
    transferMetrics: {
      timeToThreshold: transferTimeToThreshold,
      bestAchieved: transferBestAchieved,
      regret: transferCumulativeRegret
    },
    improvement: {
      timeToThreshold: timeImprovement,
      bestAchieved: bestImprovement,
      regret: regretImprovement
    },
    isNetPositive,
    confidence,
    completedAt: generations
  };
}

/**
 * Format workload fingerprint as a short string signature
 */
export function formatFingerprint(fp: WorkloadFingerprint): string {
  return `${fp.datasetSize}x${fp.dimensions}:${fp.queryPattern}:${fp.targetMetric}@${fp.k}`;
}

/**
 * Get variance summary across multiple benchmark runs
 */
export function getVarianceSummary(results: BenchmarkRunResult[]): {
  meanVariance: { recall: number; latency: number; memory: number };
  runToRunVariance: { recall: number; latency: number; memory: number };
} {
  if (results.length === 0) {
    return {
      meanVariance: { recall: 0, latency: 0, memory: 0 },
      runToRunVariance: { recall: 0, latency: 0, memory: 0 }
    };
  }
  
  // Mean of within-run variances
  const meanVariance = {
    recall: results.reduce((s, r) => s + r.variance.recall, 0) / results.length,
    latency: results.reduce((s, r) => s + r.variance.latency, 0) / results.length,
    memory: results.reduce((s, r) => s + r.variance.memory, 0) / results.length
  };
  
  // Variance across runs (run-to-run variance)
  const meanRecall = results.reduce((s, r) => s + r.metrics.recall, 0) / results.length;
  const meanLatency = results.reduce((s, r) => s + r.metrics.latencyMs, 0) / results.length;
  const meanMemory = results.reduce((s, r) => s + r.metrics.memoryMb, 0) / results.length;
  
  const runToRunVariance = {
    recall: results.reduce((s, r) => s + Math.pow(r.metrics.recall - meanRecall, 2), 0) / results.length,
    latency: results.reduce((s, r) => s + Math.pow(r.metrics.latencyMs - meanLatency, 2), 0) / results.length,
    memory: results.reduce((s, r) => s + Math.pow(r.metrics.memoryMb - meanMemory, 2), 0) / results.length
  };
  
  return { meanVariance, runToRunVariance };
}
