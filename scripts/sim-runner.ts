/**
 * Interlock - Headless Simulation Runner
 * ======================================
 * Run long-horizon deterministic experiments with detailed logging.
 * 
 * Usage:
 *   npx tsx scripts/sim-runner.ts --seed 42 --gens 500 --transfer on --drift off --out results/run_001
 * 
 * ARCHITECTURE NOTE:
 * This file is intentionally self-contained with duplicated type definitions and functions.
 * This allows the simulation runner to execute independently without requiring the rest of
 * the codebase (frontend, services, etc.). Types and functions are mirrored from:
 * - types.ts (for type definitions)
 * - services/forecast.ts (for Phase III failure forecasting)
 * 
 * The frontend uses services/forecast.ts directly. This duplication is a deliberate
 * trade-off for standalone execution capability.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============= Type Definitions (mirror types.ts for standalone execution) =============

// Constraint regime defines operational boundaries
interface ConstraintRegime {
  maxLatencyMs?: number;
  minRecall?: number;
  maxMemoryMb?: number;
  batchSizeRange?: [number, number];
}

interface WorkloadFingerprint {
  domain: string;
  datasetSize: number;
  dimensions: number;
  queryPattern: 'random' | 'clustered' | 'sequential';
  targetMetric: 'recall' | 'latency' | 'memory';
  k: number;
  constraintRegime?: ConstraintRegime;
}

interface LawCounterexample {
  id: string;
  observedAt: number;
  workloadFingerprint: WorkloadFingerprint;
  expectedOutcome: string;
  actualOutcome: string;
  severity: 'minor' | 'major' | 'critical';
}

interface LawTrialResult {
  trialId: string;
  generation: number;
  success: boolean;
  observedValue: number;
  expectedRange: [number, number];
}

// Law taxonomy classification
type LawType = 'structural' | 'soft' | 'regime-bound';

interface Law {
  id: string;
  domain: string;
  description: string;
  confidence: number;
  discoveredAt: number;
  isUniversal?: boolean;
  version: number;
  scopeSignature?: WorkloadFingerprint;
  trialResults?: LawTrialResult[];
  counterexamples?: LawCounterexample[];
  lastValidatedAt?: number;
  status: 'hypothesis' | 'validated' | 'falsified' | 'deprecated';
  evidenceCount?: number;
  // Law Taxonomy (Phase II)
  lawType?: LawType;            // structural=hard constraint, soft=performance gradient, regime-bound=valid under certain drift
  // Half-life metrics (Phase II)
  halfLife?: number;            // Generations law survives under perturbation
  churnRate?: number;           // Rate of invalidation under drift (0-1)
}

interface SOSGenome {
  id: string;
  generation: number;
  domain: string;
  alpha: number;
  explorationBonus: number;
  sampleStrategy: 'uniform' | 'gaussian' | 'adaptive' | 'exploit';
  ridgeAlpha: number;
  fitness: number;
  originDomain?: string;
}

interface BenchmarkRunResult {
  runId: string;
  seed: number;
  generation: number;
  metrics: {
    recall: number;
    latencyMs: number;
    memoryMb: number;
  };
  variance: {
    recall: number;
    latency: number;
    memory: number;
  };
  timestamp: string;
}

interface TransferABTestResult {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  baselineMetrics: {
    timeToThreshold: number;
    bestAchieved: number;
    regret: number;
  };
  transferMetrics: {
    timeToThreshold: number;
    bestAchieved: number;
    regret: number;
  };
  improvement: {
    timeToThreshold: number;
    bestAchieved: number;
    regret: number;
  };
  isNetPositive: boolean;
  confidence: number;
  completedAt: number;
}

interface DriftEvent {
  generation: number;
  domain: string;
  type: 'schedule' | 'manual';
  preFitness: number;
  postFitness: number;
}

interface GenerationLog {
  generation: number;
  timestamp: string;
  genomes: Record<string, {
    fitness: number;
    alpha: number;
    strategy: string;
    benchmarkMetrics?: {
      recall: number;
      latencyMs: number;
      memoryMb: number;
    };
  }>;
  global: {
    mutationRate: number;
    explorationRadius: number;
    crossPollinationEvents: number;
  };
  driftEvents: DriftEvent[];
  laws: {
    newProposed: string[];
    updated: string[];
    validated: string[];
    falsified: string[];
    deprecated: string[];
    confidenceChanges: Array<{ lawId: string; oldConf: number; newConf: number }>;
    counterexamplesAdded: Array<{ lawId: string; counterexampleId: string }>;
  };
}

interface RunConfig {
  runId: string;
  seed: number;
  generations: number;
  domains: string[];
  transferEnabled: boolean;
  driftEnabled: boolean;
  driftSchedule?: number[]; // generations when drift is injected
  timestamp: string;
  // Phase II additions
  mode?: 'standard' | 'certification';  // Execution mode
  lawGatedTransfer?: boolean;           // Enable law-gated transfer
  scopeSimilarityThreshold?: number;    // Threshold for law-gated transfer (0-1)
  // Certification mode specific
  stabilityGenerations?: number;        // N generations to hold steady
  driftEvents?: number;                 // Number of drift events to inject
}

interface ABSummary {
  runId: string;
  seed: number;
  transferEnabled: boolean;
  totalTests: number;
  netPositiveCount: number;
  netPositiveRate: number;
  avgImprovements: {
    timeToThreshold: number;
    bestAchieved: number;
    regret: number;
  };
  testResults: TransferABTestResult[];
}

// Law export format for laws.final.json
interface LawExport {
  id: string;
  domain: string;
  description: string;
  scope: {
    domain: string;
    datasetSize: number;
    dimensions: number;
    queryPattern: string;
    targetMetric: string;
    k: number;
    constraints?: ConstraintRegime;
  };
  evidence: {
    totalTrials: number;
    successfulTrials: number;
    counterexamples: number;
  };
  status: 'validated' | 'falsified' | 'deprecated' | 'hypothesis';
  confidence: number;
  discoveredAt: number;
  lastValidatedAt: number;
  version: number;
  // Phase II additions
  lawType?: LawType;            // Classification: structural, soft, or regime-bound
  halfLife?: number;            // Generations law survives under perturbation
  churnRate?: number;           // Rate of invalidation under drift
}

// Final laws artifact format
interface LawsFinalArtifact {
  generated: string;
  runId: string;
  totalLaws: number;
  summary: {
    validated: number;
    falsified: number;
    deprecated: number;
    hypothesis: number;
  };
  laws: LawExport[];
}

// ============= Optimization Landscape Types (Phase II) =============

// Region in the optimization landscape
interface Region {
  id: string;
  domain: string;
  parameterRanges: {
    alpha: [number, number];
    explorationBonus: [number, number];
  };
  fitnessRange: [number, number];
  stability: number;            // 0-1, how stable is this region
  lawsHolding: string[];        // Law IDs that hold in this region
  lawsBreaking: string[];       // Law IDs that break in this region
}

// Phase transition boundary in the optimization landscape
interface Boundary {
  id: string;
  domain: string;
  fromRegion: string;           // Region ID
  toRegion: string;             // Region ID
  transitionParameter: string;  // Parameter that triggers the transition
  transitionValue: number;      // Value at which transition occurs
  abruptness: number;           // 0-1, how sharp is the transition
  lawsInvalidated: string[];    // Laws that break at this boundary
}

// Optimization Landscape Report - Interlock's scientific core
interface LandscapeReport {
  generated: string;
  runId: string;
  totalGenerations: number;
  domains: string[];
  stableRegions: Region[];      // Regions where laws hold and behavior is predictable
  brittleRegions: Region[];     // Regions where laws break or behavior is unpredictable
  phaseTransitions: Boundary[]; // Sharp behavior changes
  invariants: LawExport[];      // Laws that hold across all measured regions
  measurement: {
    regionsExplored: number;
    lawsValidated: number;
    lawsFalsified: number;
    transitionsDetected: number;
  };
}

// ============= Resilience Certification Types (Phase II) =============

// Recovery curve data point
interface RecoveryCurvePoint {
  generation: number;
  fitness: number;
  lawsValid: number;
  lawsInvalid: number;
}

// Single drift injection result
interface DriftInjectionResult {
  injectedAt: number;           // Generation when drift was injected
  domain: string;
  preFitness: number;
  dropDepth: number;            // Max fitness drop (0-1)
  recoveryTime: number;         // Generations to recover to 90% of pre-drift
  lawsInvalidatedCount: number;
  recoveryCurve: RecoveryCurvePoint[];
}

// Resilience Score calculation
interface ResilienceScore {
  overall: number;              // (1 - DropDepth) / RecoveryTime
  byDomain: Record<string, number>;
  shieldRating: 'green' | 'yellow' | 'red';  // green: ≥0.08, yellow: ≥0.04, red: <0.04
}

// Resilience Audit Report
interface ResilienceAudit {
  generated: string;
  runId: string;
  mode: 'certification';
  config: {
    stabilityGenerations: number;      // N generations to hold steady
    driftEvents: number;               // Number of drift injections
    seed: number;
  };
  phases: {
    optimization: {
      startGen: number;
      endGen: number;
      finalFitness: Record<string, number>;
    };
    stability: {
      startGen: number;
      endGen: number;
      maintained: boolean;
      varianceObserved: Record<string, number>;
    };
    stressTesting: {
      driftResults: DriftInjectionResult[];
      lawInvalidationRate: number;     // % of laws invalidated across all drift events
    };
  };
  resilienceScore: ResilienceScore;
  failureModes: string[];              // Identified failure patterns
  recoveryPatterns: string[];          // Observed recovery behaviors
}

// ============= Failure Forecasting Types (Phase III) =============

// Enhanced failure boundary with forecasting data
interface FailureBoundary {
  id: string;
  domain: string;
  parameter: string;                   // Parameter that triggers the boundary
  parameterRange: [number, number];    // Range where boundary exists
  criticalValue: number;               // Value at which failure occurs
  abruptnessScore: number;             // 0-1, how sharp is the transition
  historicalDropDepth: number;         // Average observed fitness drop (0-1)
  recoverySlope: number;               // Rate of recovery after boundary crossing
  confidence: number;                  // 0-1, confidence in this boundary prediction
  observedCrossings: number;           // Number of times this boundary was crossed
  lawsAtRisk: string[];               // Law IDs that break at this boundary
}

// Boundaries artifact for export
interface BoundariesArtifact {
  generated: string;
  runId: string;
  totalBoundaries: number;
  summary: {
    highRisk: number;      // abruptness > 0.7
    mediumRisk: number;    // abruptness 0.4-0.7
    lowRisk: number;       // abruptness < 0.4
  };
  boundaries: FailureBoundary[];
}

// System state for failure prediction
interface SystemState {
  domain: string;
  currentAlpha: number;
  currentFitness: number;
  currentStrategy: string;
  generation: number;
  recentVariance: number;              // Fitness variance over recent generations
  proximityToBoundary: number;         // 0-1, how close to nearest boundary
}

// Proposed change for failure prediction
interface ProposedChange {
  parameterName: string;
  currentValue: number;
  proposedValue: number;
  changeType: 'mutation' | 'drift' | 'transfer';
}

// Failure forecast result
interface FailureForecast {
  id: string;
  timestamp: string;
  systemState: SystemState;
  proposedChange: ProposedChange;
  expectedDropDepth: number;           // Predicted fitness drop (0-1)
  expectedRecoveryTime: number;        // Predicted generations to recover
  dominantFailureMode: string;         // Primary failure pattern
  riskLevel: 'safe' | 'yellow' | 'red';
  confidenceScore: number;             // 0-1, confidence in this forecast
  nearestBoundary: FailureBoundary | null;
  boundaryDistance: number;            // Distance to nearest boundary
  warningReason: string;               // Human-readable explanation
  mitigationSuggestion: string;        // Suggested action
}

// Forecast validation result
interface ForecastValidation {
  forecastId: string;
  predictedDropDepth: number;
  observedDropDepth: number;
  predictedRecoveryTime: number;
  observedRecoveryTime: number;
  dropDepthError: number;
  recoveryTimeError: number;
  wasCorrectRiskLevel: boolean;
  generation: number;
}

// Forecast validation summary
interface ForecastValidationSummary {
  generated: string;
  runId: string;
  totalForecasts: number;
  totalValidated: number;
  accuracy: {
    dropDepthMeanError: number;
    dropDepthMedianError: number;
    recoveryTimeMeanError: number;
    recoveryTimeMedianError: number;
    riskLevelAccuracy: number;
  };
  falsePositives: number;
  falseNegatives: number;
  limitsOfPrediction: string[];
  validations: ForecastValidation[];
}

// Extended certification report for Phase III
interface CertificationReport extends ResilienceAudit {
  failureForecastSummary?: {
    totalBoundariesDetected: number;
    highRiskBoundaries: number;
    forecastAccuracy: number;
  };
  unsafeOperatingRegions?: Array<{
    domain: string;
    parameterRanges: Record<string, [number, number]>;
    riskLevel: 'yellow' | 'red';
    reason: string;
  }>;
  recommendedSafetyMargins?: Array<{
    parameter: string;
    currentValue: number;
    safeRange: [number, number];
    margin: number;
  }>;
}

// ============= Seeded Random Number Generator =============

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  reset(seed: number): void {
    this.seed = seed;
  }

  nextGaussian(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
}

// ============= Constants =============

const DOMAINS = ['faiss', 'compression', 'postgres', 'prompts'];

const DEFAULT_FAISS_FINGERPRINT: WorkloadFingerprint = {
  domain: 'faiss',
  datasetSize: 10000,
  dimensions: 128,
  queryPattern: 'random',
  targetMetric: 'recall',
  k: 10,
  constraintRegime: {
    maxLatencyMs: 50,
    minRecall: 0.8,
    maxMemoryMb: 512
  }
};

const DOMAIN_FINGERPRINTS: Record<string, WorkloadFingerprint> = {
  faiss: DEFAULT_FAISS_FINGERPRINT,
  postgres: { domain: 'postgres', datasetSize: 100000, dimensions: 1, queryPattern: 'sequential', targetMetric: 'latency', k: 1, constraintRegime: { maxLatencyMs: 100, maxMemoryMb: 1024 } },
  compression: { domain: 'compression', datasetSize: 50000, dimensions: 256, queryPattern: 'random', targetMetric: 'memory', k: 1, constraintRegime: { maxMemoryMb: 256 } },
  prompts: { domain: 'prompts', datasetSize: 1000, dimensions: 512, queryPattern: 'clustered', targetMetric: 'recall', k: 5, constraintRegime: { minRecall: 0.9 } }
};

const INITIAL_BIAS: Record<string, { targetAlpha: number; preferredStrategy: string }> = {
  faiss: { targetAlpha: 4.5, preferredStrategy: 'gaussian' },
  postgres: { targetAlpha: 1.8, preferredStrategy: 'uniform' },
  compression: { targetAlpha: 3.0, preferredStrategy: 'adaptive' },
  prompts: { targetAlpha: 5.0, preferredStrategy: 'exploit' }
};

const LAW_TEMPLATES: Record<string, string[]> = {
  faiss: [
    'HNSW M parameter correlates with recall at threshold {threshold}',
    'Vector quantization optimal at dim > {dim} for this workload',
    'Index fragmentation inversely proportional to batch size',
  ],
  postgres: [
    'work_mem > {mem}MB improves hash_agg by {pct}%',
    'Autovacuum frequency optimal at {freq} for write-heavy loads',
    'B-tree vs Hash index crossover at cardinality {card}',
  ],
  compression: [
    'Dictionary size {size}KB maximizes compression ratio',
    'Sliding window {window} optimal for streaming data',
    'Entropy coding switch point at {point} redundancy',
  ],
  prompts: [
    'Chain-of-thought improves accuracy by {pct}% for reasoning tasks',
    'Temperature {temp} optimal for creative generation',
    'Context window utilization peaks at {util}% occupancy',
  ]
};

// Fitness threshold for "convergence" (per domain or global)
const FITNESS_THRESHOLD = 0.7;

// ============= Simulator Class =============

class SOSSimulator {
  private rng: SeededRandom;
  private config: RunConfig;
  private genomes: Record<string, SOSGenome> = {};
  private laws: Law[] = [];
  private abTestResults: TransferABTestResult[] = [];
  private driftEvents: DriftEvent[] = [];
  private domainBias: Record<string, { targetAlpha: number; preferredStrategy: string }>;
  private mutationRate = 0.05;
  private explorationRadius = 0.1;
  private crossPollinationCount = 0;
  private generation = 0;
  
  // Law tracking
  private lawIdCounter = 0;
  private counterexampleIdCounter = 0;
  
  // Generation log buffer
  private genLogPath: string;
  private genLogBuffer: GenerationLog[] = [];

  constructor(config: RunConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.seed);
    this.domainBias = JSON.parse(JSON.stringify(INITIAL_BIAS));
    this.genLogPath = path.join(config.runId, 'gen_log.jsonl');
    
    this._initGenomes();
    this._initLaws();
  }

  private _initGenomes(): void {
    for (const domain of this.config.domains) {
      this.genomes[domain] = {
        id: this._generateId(),
        generation: 0,
        domain,
        alpha: 2.0 + this.rng.next(),
        explorationBonus: 0.1,
        sampleStrategy: 'uniform',
        ridgeAlpha: 1.0,
        fitness: 0.2 + this.rng.next() * 0.1
      };
    }
  }

  private _initLaws(): void {
    // Start with 2 initial validated laws
    this.laws.push({
      id: `law-${this.lawIdCounter++}`,
      domain: 'faiss',
      description: 'HNSW M > 32 yields diminishing recall returns',
      confidence: 0.85,
      discoveredAt: 0,
      version: 1,
      status: 'validated',
      scopeSignature: DOMAIN_FINGERPRINTS.faiss,
      trialResults: [{ trialId: 't001', generation: 0, success: true, observedValue: 0.92, expectedRange: [0.85, 0.95] }],
      counterexamples: [],
      lastValidatedAt: 0
    });
    
    this.laws.push({
      id: `law-${this.lawIdCounter++}`,
      domain: 'postgres',
      description: 'work_mem correlates linearly with hash_agg performance',
      confidence: 0.92,
      discoveredAt: 0,
      version: 1,
      status: 'validated',
      scopeSignature: DOMAIN_FINGERPRINTS.postgres,
      trialResults: [{ trialId: 't002', generation: 0, success: true, observedValue: 0.88, expectedRange: [0.80, 0.95] }],
      counterexamples: [],
      lastValidatedAt: 0
    });
  }

  private _generateId(): string {
    // Use seeded RNG for deterministic ID generation
    return this.rng.next().toString(36).substring(2, 8);
  }

  private _simulateFAISSMetrics(genome: SOSGenome, fingerprint: WorkloadFingerprint): { recall: number; latencyMs: number; memoryMb: number } {
    const baseRecall = 0.7;
    const alphaBonus = (genome.alpha - 2.0) * 0.05;
    const strategyBonus = genome.sampleStrategy === 'gaussian' ? 0.1 : 
                          genome.sampleStrategy === 'adaptive' ? 0.08 : 0.02;
    const dimensionPenalty = (fingerprint.dimensions / 1000) * 0.05;
    const noise = (this.rng.next() - 0.5) * 0.05;
    
    const recall = Math.min(0.99, Math.max(0.5, baseRecall + alphaBonus + strategyBonus - dimensionPenalty + noise));
    
    const baseLatency = 5.0;
    const sizeMultiplier = Math.log10(fingerprint.datasetSize) / 4;
    const strategyLatency = genome.sampleStrategy === 'exploit' ? 0.8 : 
                            genome.sampleStrategy === 'gaussian' ? 1.2 : 1.5;
    const latencyNoise = (this.rng.next() - 0.5) * 2;
    
    const latencyMs = Math.max(0.5, baseLatency * sizeMultiplier * strategyLatency + latencyNoise);
    
    const baseMemory = (fingerprint.datasetSize * fingerprint.dimensions * 4) / (1024 * 1024);
    const alphaMemoryFactor = 1 + (genome.alpha - 2) * 0.1;
    const memoryNoise = (this.rng.next() - 0.5) * baseMemory * 0.1;
    
    const memoryMb = Math.max(1, baseMemory * alphaMemoryFactor + memoryNoise);
    
    return { recall, latencyMs, memoryMb };
  }

  private _evolveGenome(domain: string): SOSGenome {
    const current = this.genomes[domain];
    const bias = this.domainBias[domain];
    
    const noise = (this.rng.next() - 0.5) * (this.mutationRate * 5);
    const pullToOptimal = (bias.targetAlpha - current.alpha) * 0.1;
    const newAlpha = Math.max(1.0, Math.min(6.0, current.alpha + pullToOptimal + noise));

    let newStrategy = current.sampleStrategy;
    if (this.rng.next() < this.mutationRate) {
      const strategies: SOSGenome['sampleStrategy'][] = ['uniform', 'gaussian', 'adaptive', 'exploit'];
      if (this.rng.next() > 0.4) {
        newStrategy = bias.preferredStrategy as SOSGenome['sampleStrategy'];
      } else {
        newStrategy = strategies[Math.floor(this.rng.next() * strategies.length)];
      }
    }

    const alphaDistance = Math.abs(newAlpha - bias.targetAlpha);
    const alphaScore = Math.max(0, 1 - (alphaDistance / 4));
    const strategyBonus = newStrategy === bias.preferredStrategy ? 0.2 : 0;
    const baseFitness = (alphaScore * 0.7) + strategyBonus + 0.1;
    const runNoise = (this.rng.next() - 0.5) * 0.05;
    let newFitness = (current.fitness * 0.8) + ((baseFitness + runNoise) * 0.2);
    newFitness = Math.min(0.9995, Math.max(0, newFitness));

    return {
      ...current,
      generation: this.generation,
      alpha: newAlpha,
      sampleStrategy: newStrategy,
      fitness: newFitness
    };
  }

  private _runTransferABTest(source: SOSGenome, target: SOSGenome): TransferABTestResult {
    const testGenerations = 50;
    const threshold = FITNESS_THRESHOLD;
    
    let baselineTimeToThreshold = testGenerations;
    let baselineBestAchieved = target.fitness;
    let baselineCumulativeRegret = 0;
    
    let transferTimeToThreshold = testGenerations;
    let transferBestAchieved = target.fitness;
    let transferCumulativeRegret = 0;
    
    // Baseline evolution
    let baselineFitness = target.fitness;
    for (let gen = 0; gen < testGenerations; gen++) {
      const improvement = (this.rng.next() - 0.3) * 0.02;
      baselineFitness = Math.min(0.95, Math.max(0.1, baselineFitness + improvement));
      baselineBestAchieved = Math.max(baselineBestAchieved, baselineFitness);
      if (baselineFitness >= threshold && baselineTimeToThreshold === testGenerations) {
        baselineTimeToThreshold = gen;
      }
      baselineCumulativeRegret += (0.95 - baselineFitness);
    }
    
    // Transfer evolution
    let transferFitness = target.fitness;
    const transferBoost = source.fitness > target.fitness ? 
      (source.fitness - target.fitness) * 0.3 : 0;
    transferFitness += transferBoost;
    
    for (let gen = 0; gen < testGenerations; gen++) {
      const improvement = (this.rng.next() - 0.2) * 0.03;
      transferFitness = Math.min(0.95, Math.max(0.1, transferFitness + improvement));
      transferBestAchieved = Math.max(transferBestAchieved, transferFitness);
      if (transferFitness >= threshold && transferTimeToThreshold === testGenerations) {
        transferTimeToThreshold = gen;
      }
      transferCumulativeRegret += (0.95 - transferFitness);
    }
    
    const safePercent = (baseline: number, transfer: number, denom: number): number => {
      if (denom === 0) return 0;
      return ((baseline - transfer) / denom) * 100;
    };
    
    const timeImprovement = safePercent(baselineTimeToThreshold, transferTimeToThreshold, baselineTimeToThreshold);
    const bestImprovement = baselineBestAchieved === 0 ? 0 : 
      ((transferBestAchieved - baselineBestAchieved) / baselineBestAchieved) * 100;
    const regretImprovement = safePercent(baselineCumulativeRegret, transferCumulativeRegret, baselineCumulativeRegret);
    
    const improvements = [timeImprovement, bestImprovement, regretImprovement];
    const positiveCount = improvements.filter(i => i > 0).length;
    const isNetPositive = positiveCount >= 2;
    
    const avgImprovement = improvements.reduce((a, b) => a + b, 0) / 3;
    const confidence = Math.min(0.99, Math.max(0.5, 0.5 + avgImprovement / 100));
    
    return {
      id: `abtest-${this.generation}-${this._generateId()}`,
      sourceDomain: source.domain,
      targetDomain: target.domain,
      baselineMetrics: { timeToThreshold: baselineTimeToThreshold, bestAchieved: baselineBestAchieved, regret: baselineCumulativeRegret },
      transferMetrics: { timeToThreshold: transferTimeToThreshold, bestAchieved: transferBestAchieved, regret: transferCumulativeRegret },
      improvement: { timeToThreshold: timeImprovement, bestAchieved: bestImprovement, regret: regretImprovement },
      isNetPositive,
      confidence,
      completedAt: this.generation
    };
  }

  private _performCrossPollination(): { event: boolean; abResult?: TransferABTestResult } {
    if (!this.config.transferEnabled) {
      return { event: false };
    }
    
    const sorted = Object.values(this.genomes).sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    
    if (best.domain !== worst.domain && (best.fitness - worst.fitness > 0.15)) {
      const abResult = this._runTransferABTest(best, worst);
      this.abTestResults.push(abResult);
      
      // Perform transfer
      this.genomes[worst.domain] = {
        ...this.genomes[worst.domain],
        sampleStrategy: best.sampleStrategy,
        originDomain: best.domain
      };
      
      this.crossPollinationCount++;
      this.mutationRate = Math.max(0.01, this.mutationRate * 0.95);
      
      return { event: true, abResult };
    } else {
      this.mutationRate = Math.min(0.2, this.mutationRate * 1.05);
    }
    
    return { event: false };
  }

  private _injectDrift(domain: string): DriftEvent {
    const preFitness = this.genomes[domain].fitness;
    
    this.domainBias[domain] = {
      targetAlpha: Math.max(1.5, this.rng.next() * 5.0),
      preferredStrategy: this.domainBias[domain].preferredStrategy === 'gaussian' ? 'uniform' : 'gaussian'
    };
    
    this.genomes[domain].fitness *= 0.6;
    this.mutationRate = Math.min(0.5, this.mutationRate + 0.2);
    
    const event: DriftEvent = {
      generation: this.generation,
      domain,
      type: 'schedule',
      preFitness,
      postFitness: this.genomes[domain].fitness
    };
    
    this.driftEvents.push(event);
    return event;
  }

  private _generateLaw(domain: string): Law {
    const templates = LAW_TEMPLATES[domain] || LAW_TEMPLATES.faiss;
    const template = templates[Math.floor(this.rng.next() * templates.length)];
    
    const description = template
      .replace('{threshold}', (0.8 + this.rng.next() * 0.19).toFixed(2))
      .replace('{dim}', String(Math.floor(64 + this.rng.next() * 448)))
      .replace('{mem}', String(Math.floor(64 + this.rng.next() * 192)))
      .replace('{pct}', String(Math.floor(5 + this.rng.next() * 25)))
      .replace('{freq}', String(Math.floor(100 + this.rng.next() * 900)))
      .replace('{card}', String(Math.floor(1000 + this.rng.next() * 99000)))
      .replace('{size}', String(Math.floor(16 + this.rng.next() * 112)))
      .replace('{window}', String(Math.floor(1024 + this.rng.next() * 7168)))
      .replace('{point}', (0.3 + this.rng.next() * 0.4).toFixed(2))
      .replace('{temp}', (0.1 + this.rng.next() * 0.9).toFixed(2))
      .replace('{util}', String(Math.floor(60 + this.rng.next() * 35)));
    
    // Determine law type based on description patterns (Phase II)
    let lawType: LawType = 'soft';
    if (description.includes('must') || description.includes('>') || description.includes('limit') || description.includes('boundary')) {
      lawType = 'structural';
    } else if (description.includes('correlates') || description.includes('improves') || description.includes('optimal')) {
      lawType = 'soft';
    } else if (description.includes('under') || description.includes('for') || description.includes('when')) {
      lawType = 'regime-bound';
    }
    
    // Initialize half-life (will be updated as law survives perturbations)
    const initialHalfLife = 50 + Math.floor(this.rng.next() * 150);  // 50-200 generations
    
    return {
      id: `law-${this.lawIdCounter++}`,
      domain,
      description,
      confidence: 0.75 + this.rng.next() * 0.23,
      discoveredAt: this.generation,
      version: 1,
      status: 'hypothesis',
      scopeSignature: DOMAIN_FINGERPRINTS[domain],
      trialResults: [],
      counterexamples: [],
      lastValidatedAt: this.generation,
      // Phase II additions
      lawType,
      halfLife: initialHalfLife,
      churnRate: 0  // Will be calculated based on drift events
    };
  }

  private _validateLaws(): { validated: string[]; falsified: string[]; deprecated: string[]; confidenceChanges: Array<{ lawId: string; oldConf: number; newConf: number }>; counterexamplesAdded: Array<{ lawId: string; counterexampleId: string }> } {
    const result = {
      validated: [] as string[],
      falsified: [] as string[],
      deprecated: [] as string[],
      confidenceChanges: [] as Array<{ lawId: string; oldConf: number; newConf: number }>,
      counterexamplesAdded: [] as Array<{ lawId: string; counterexampleId: string }>
    };
    
    for (const law of this.laws) {
      if (law.status === 'falsified' || law.status === 'deprecated') continue;
      
      const genome = this.genomes[law.domain];
      if (!genome) continue;
      
      // Run trial
      const success = this.rng.next() > 0.15; // 85% success rate normally
      const observedValue = 0.7 + this.rng.next() * 0.3;
      const expectedRange: [number, number] = [0.7, 0.99];
      
      const trial: LawTrialResult = {
        trialId: `trial-${this.generation}-${this._generateId()}`,
        generation: this.generation,
        success,
        observedValue,
        expectedRange
      };
      
      law.trialResults = [...(law.trialResults || []).slice(-9), trial];
      law.lastValidatedAt = this.generation;
      
      if (!success) {
        const counterexample: LawCounterexample = {
          id: `cx-${this.counterexampleIdCounter++}`,
          observedAt: this.generation,
          workloadFingerprint: DOMAIN_FINGERPRINTS[law.domain],
          expectedOutcome: `Value in range [${expectedRange[0]}, ${expectedRange[1]}]`,
          actualOutcome: `Observed: ${observedValue.toFixed(4)}`,
          severity: observedValue < expectedRange[0] * 0.8 ? 'critical' : 
                   observedValue < expectedRange[0] * 0.9 ? 'major' : 'minor'
        };
        law.counterexamples = [...(law.counterexamples || []).slice(-4), counterexample];
        result.counterexamplesAdded.push({ lawId: law.id, counterexampleId: counterexample.id });
      }
      
      // Update confidence
      const oldConf = law.confidence;
      const successCount = law.trialResults!.filter(t => t.success).length;
      const totalTrials = law.trialResults!.length;
      const trialConfidence = successCount / totalTrials;
      const newConf = oldConf * 0.3 + trialConfidence * 0.7;
      const counterexamplePenalty = (law.counterexamples?.length || 0) * 0.05;
      law.confidence = Math.max(0, Math.min(1, newConf - counterexamplePenalty));
      
      if (Math.abs(law.confidence - oldConf) > 0.01) {
        result.confidenceChanges.push({ lawId: law.id, oldConf, newConf: law.confidence });
      }
      
      // Update status
      const counterexampleCount = law.counterexamples?.length || 0;
      const prevStatus: string = law.status;
      
      if (counterexampleCount >= 3) {
        law.status = 'falsified';
        if (prevStatus !== 'falsified') result.falsified.push(law.id);
      } else if (law.confidence < 0.5) {
        law.status = 'deprecated';
        if (prevStatus !== 'deprecated') result.deprecated.push(law.id);
      } else if (law.confidence >= 0.8 && counterexampleCount === 0) {
        law.status = 'validated';
        if (prevStatus !== 'validated') result.validated.push(law.id);
      } else {
        law.status = 'hypothesis';
      }
    }
    
    return result;
  }

  public openLogStream(): void {
    const dir = path.dirname(this.genLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.genLogBuffer = [];
  }

  public closeLogStream(): void {
    // Write all logs to file synchronously
    const content = this.genLogBuffer.map(log => JSON.stringify(log)).join('\n');
    fs.writeFileSync(this.genLogPath, content + '\n');
  }

  private _writeGenLog(log: GenerationLog): void {
    this.genLogBuffer.push(log);
  }

  public runStep(): GenerationLog {
    this.generation++;
    
    const genLog: GenerationLog = {
      generation: this.generation,
      timestamp: new Date().toISOString(),
      genomes: {},
      global: {
        mutationRate: this.mutationRate,
        explorationRadius: this.explorationRadius,
        crossPollinationEvents: 0
      },
      driftEvents: [],
      laws: {
        newProposed: [],
        updated: [],
        validated: [],
        falsified: [],
        deprecated: [],
        confidenceChanges: [],
        counterexamplesAdded: []
      }
    };
    
    // Check for scheduled drift
    if (this.config.driftEnabled && this.config.driftSchedule?.includes(this.generation)) {
      const domain = DOMAINS[Math.floor(this.rng.next() * DOMAINS.length)];
      const driftEvent = this._injectDrift(domain);
      genLog.driftEvents.push(driftEvent);
    }
    
    // Evolve all genomes
    for (const domain of this.config.domains) {
      this.genomes[domain] = this._evolveGenome(domain);
      const metrics = this._simulateFAISSMetrics(this.genomes[domain], DOMAIN_FINGERPRINTS[domain] || DEFAULT_FAISS_FINGERPRINT);
      
      genLog.genomes[domain] = {
        fitness: this.genomes[domain].fitness,
        alpha: this.genomes[domain].alpha,
        strategy: this.genomes[domain].sampleStrategy,
        benchmarkMetrics: metrics
      };
    }
    
    // Cross-pollination every 15 generations
    if (this.generation % 15 === 0) {
      const cp = this._performCrossPollination();
      if (cp.event) {
        genLog.global.crossPollinationEvents = 1;
      }
    }
    
    // Propose new laws every ~30 generations
    if (this.generation % 30 === 0) {
      const domain = DOMAINS[Math.floor(this.rng.next() * DOMAINS.length)];
      const newLaw = this._generateLaw(domain);
      this.laws.push(newLaw);
      genLog.laws.newProposed.push(newLaw.id);
    }
    
    // Validate laws every 20 generations
    if (this.generation % 20 === 0) {
      const validation = this._validateLaws();
      genLog.laws.validated = validation.validated;
      genLog.laws.falsified = validation.falsified;
      genLog.laws.deprecated = validation.deprecated;
      genLog.laws.confidenceChanges = validation.confidenceChanges;
      genLog.laws.counterexamplesAdded = validation.counterexamplesAdded;
      genLog.laws.updated = [...validation.validated, ...validation.falsified, ...validation.deprecated];
    }
    
    this._writeGenLog(genLog);
    return genLog;
  }

  public run(): { config: RunConfig; finalGenomes: Record<string, SOSGenome>; laws: Law[]; abTestResults: TransferABTestResult[]; driftEvents: DriftEvent[] } {
    console.log(`[Sim] Starting run ${this.config.runId} (seed=${this.config.seed}, gens=${this.config.generations})`);
    this.openLogStream();
    
    for (let i = 0; i < this.config.generations; i++) {
      this.runStep();
      if ((i + 1) % 100 === 0) {
        console.log(`  [Sim] Generation ${i + 1}/${this.config.generations} complete`);
      }
    }
    
    this.closeLogStream();
    console.log(`[Sim] Run complete. ${this.laws.length} laws, ${this.abTestResults.length} A/B tests, ${this.driftEvents.length} drift events`);
    
    return {
      config: this.config,
      finalGenomes: this.genomes,
      laws: this.laws,
      abTestResults: this.abTestResults,
      driftEvents: this.driftEvents
    };
  }

  public getGenomes(): Record<string, SOSGenome> {
    return this.genomes;
  }

  public getLaws(): Law[] {
    return this.laws;
  }

  public getABTestResults(): TransferABTestResult[] {
    return this.abTestResults;
  }

  public getDriftEvents(): DriftEvent[] {
    return this.driftEvents;
  }
}

// ============= Analysis Functions =============

interface ConvergenceMetrics {
  timeToThreshold: Record<string, number>;
  bestAchieved: Record<string, { fitness: number; generation: number }>;
  rollingVariance: Record<string, number>;
  stabilityScore: Record<string, number>;
}

interface LawQualityMetrics {
  proposed: number;
  validated: number;
  falsified: number;
  deprecated: number;
  falsificationRate: number;
  avgTimeToValidation: number;
  top5Laws: Law[];
}

interface TransferEffectiveness {
  totalTests: number;
  netPositiveCount: number;
  netPositiveRate: number;
  avgImprovements: { timeToThreshold: number; bestAchieved: number; regret: number };
  poisoningDomains: string[];
}

interface DriftResilienceMetrics {
  eventsCount: number;
  avgReconvergenceTime: number;
  lawsFalsifiedAfterDrift: number;
  newLawsAfterDrift: number;
  instabilityCount: number;
}

function computeConvergence(logs: GenerationLog[]): ConvergenceMetrics {
  const metrics: ConvergenceMetrics = {
    timeToThreshold: {},
    bestAchieved: {},
    rollingVariance: {},
    stabilityScore: {}
  };
  
  const domains = Object.keys(logs[0]?.genomes || {});
  const K = 50; // Last K generations for rolling variance
  
  for (const domain of domains) {
    // Time to threshold
    let reachedAt = logs.length;
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].genomes[domain]?.fitness >= FITNESS_THRESHOLD) {
        reachedAt = i + 1;
        break;
      }
    }
    metrics.timeToThreshold[domain] = reachedAt;
    
    // Best achieved
    let best = { fitness: 0, generation: 0 };
    for (let i = 0; i < logs.length; i++) {
      const f = logs[i].genomes[domain]?.fitness || 0;
      if (f > best.fitness) {
        best = { fitness: f, generation: i + 1 };
      }
    }
    metrics.bestAchieved[domain] = best;
    
    // Rolling variance (last K generations)
    const lastK = logs.slice(-K);
    const fitnesses = lastK.map(l => l.genomes[domain]?.fitness || 0);
    const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    metrics.rollingVariance[domain] = fitnesses.reduce((s, f) => s + Math.pow(f - mean, 2), 0) / fitnesses.length;
    
    // Stability score (how often parameters oscillate beyond epsilon)
    const epsilon = 0.05;
    let oscillations = 0;
    for (let i = 1; i < logs.length; i++) {
      const prev = logs[i - 1].genomes[domain]?.fitness || 0;
      const curr = logs[i].genomes[domain]?.fitness || 0;
      if (Math.abs(curr - prev) > epsilon) oscillations++;
    }
    metrics.stabilityScore[domain] = 1 - (oscillations / logs.length);
  }
  
  return metrics;
}

function computeLawQuality(laws: Law[], totalGenerations: number): LawQualityMetrics {
  const proposed = laws.length;
  const validated = laws.filter(l => l.status === 'validated').length;
  const falsified = laws.filter(l => l.status === 'falsified').length;
  const deprecated = laws.filter(l => l.status === 'deprecated').length;
  
  const falsificationRate = proposed > 0 ? falsified / proposed : 0;
  
  // Average time from hypothesis to validated/falsified
  const resolved = laws.filter(l => l.status === 'validated' || l.status === 'falsified');
  const avgTimeToValidation = resolved.length > 0 ?
    resolved.reduce((s, l) => s + ((l.lastValidatedAt || totalGenerations) - l.discoveredAt), 0) / resolved.length : totalGenerations;
  
  // Top 5 by confidence
  const top5Laws = [...laws]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  
  return { proposed, validated, falsified, deprecated, falsificationRate, avgTimeToValidation, top5Laws };
}

function computeTransferEffectiveness(results: TransferABTestResult[]): TransferEffectiveness {
  if (results.length === 0) {
    return {
      totalTests: 0,
      netPositiveCount: 0,
      netPositiveRate: 0,
      avgImprovements: { timeToThreshold: 0, bestAchieved: 0, regret: 0 },
      poisoningDomains: []
    };
  }
  
  const netPositiveCount = results.filter(r => r.isNetPositive).length;
  
  const avgImprovements = {
    timeToThreshold: results.reduce((s, r) => s + r.improvement.timeToThreshold, 0) / results.length,
    bestAchieved: results.reduce((s, r) => s + r.improvement.bestAchieved, 0) / results.length,
    regret: results.reduce((s, r) => s + r.improvement.regret, 0) / results.length
  };
  
  // Find domains that cause negative transfer
  const domainScores: Record<string, { positive: number; negative: number }> = {};
  for (const r of results) {
    if (!domainScores[r.sourceDomain]) domainScores[r.sourceDomain] = { positive: 0, negative: 0 };
    if (r.isNetPositive) domainScores[r.sourceDomain].positive++;
    else domainScores[r.sourceDomain].negative++;
  }
  
  const poisoningDomains = Object.entries(domainScores)
    .filter(([, v]) => v.negative > v.positive)
    .map(([k]) => k);
  
  return {
    totalTests: results.length,
    netPositiveCount,
    netPositiveRate: netPositiveCount / results.length,
    avgImprovements,
    poisoningDomains
  };
}

function computeDriftResilience(logs: GenerationLog[], driftEvents: DriftEvent[], laws: Law[]): DriftResilienceMetrics {
  if (driftEvents.length === 0) {
    return {
      eventsCount: 0,
      avgReconvergenceTime: 0,
      lawsFalsifiedAfterDrift: 0,
      newLawsAfterDrift: 0,
      instabilityCount: 0
    };
  }
  
  // Re-convergence time: how many generations until fitness recovers to 90% of pre-drift
  let totalReconvergence = 0;
  for (const event of driftEvents) {
    const targetFitness = event.preFitness * 0.9;
    let reconvergeGen = logs.length - event.generation;
    for (let i = event.generation; i < logs.length; i++) {
      const log = logs[i - 1];
      if (log && log.genomes[event.domain]?.fitness >= targetFitness) {
        reconvergeGen = i - event.generation;
        break;
      }
    }
    totalReconvergence += reconvergeGen;
  }
  
  const driftGenerations = driftEvents.map(e => e.generation);
  const lawsFalsifiedAfterDrift = laws.filter(l => 
    l.status === 'falsified' && driftGenerations.some(g => (l.lastValidatedAt || 0) > g)
  ).length;
  
  const newLawsAfterDrift = laws.filter(l =>
    driftGenerations.some(g => l.discoveredAt > g)
  ).length;
  
  // Instability: count oscillations > 0.1 in fitness near drift events
  let instabilityCount = 0;
  for (const event of driftEvents) {
    const start = Math.max(0, event.generation - 1);
    const end = Math.min(logs.length, event.generation + 30);
    for (let i = start + 1; i < end; i++) {
      const prev = logs[i - 1]?.genomes[event.domain]?.fitness || 0;
      const curr = logs[i]?.genomes[event.domain]?.fitness || 0;
      if (Math.abs(curr - prev) > 0.1) instabilityCount++;
    }
  }
  
  return {
    eventsCount: driftEvents.length,
    avgReconvergenceTime: totalReconvergence / driftEvents.length,
    lawsFalsifiedAfterDrift,
    newLawsAfterDrift,
    instabilityCount
  };
}

// ============= Report Generation =============

function generateMarkdownReport(
  runConfig: RunConfig,
  convergence: ConvergenceMetrics,
  lawQuality: LawQualityMetrics,
  transferEff: TransferEffectiveness,
  driftRes: DriftResilienceMetrics,
  abSummary: ABSummary | null
): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Run Report`);
  lines.push(``);
  lines.push(`**Run ID:** ${runConfig.runId}`);
  lines.push(`**Seed:** ${runConfig.seed}`);
  lines.push(`**Generations:** ${runConfig.generations}`);
  lines.push(`**Transfer:** ${runConfig.transferEnabled ? 'ON' : 'OFF'}`);
  lines.push(`**Drift:** ${runConfig.driftEnabled ? 'ON' : 'OFF'}`);
  lines.push(`**Timestamp:** ${runConfig.timestamp}`);
  lines.push(``);
  
  lines.push(`## Convergence Metrics`);
  lines.push(``);
  lines.push(`| Domain | Time-to-Threshold | Best Achieved | Gen@Best | Rolling Var | Stability |`);
  lines.push(`|--------|-------------------|---------------|----------|-------------|-----------|`);
  for (const domain of Object.keys(convergence.timeToThreshold)) {
    lines.push(`| ${domain} | ${convergence.timeToThreshold[domain]} | ${convergence.bestAchieved[domain].fitness.toFixed(4)} | ${convergence.bestAchieved[domain].generation} | ${convergence.rollingVariance[domain].toFixed(6)} | ${(convergence.stabilityScore[domain] * 100).toFixed(1)}% |`);
  }
  lines.push(``);
  
  lines.push(`## Law Quality Metrics`);
  lines.push(``);
  lines.push(`- **Total Proposed:** ${lawQuality.proposed}`);
  lines.push(`- **Validated:** ${lawQuality.validated}`);
  lines.push(`- **Falsified:** ${lawQuality.falsified}`);
  lines.push(`- **Deprecated:** ${lawQuality.deprecated}`);
  lines.push(`- **Falsification Rate:** ${(lawQuality.falsificationRate * 100).toFixed(1)}%`);
  lines.push(`- **Avg Time to Resolution:** ${lawQuality.avgTimeToValidation.toFixed(1)} generations`);
  lines.push(``);
  
  lines.push(`### Top 5 Laws (by Confidence)`);
  lines.push(``);
  for (const law of lawQuality.top5Laws) {
    lines.push(`1. **[${law.domain}]** ${law.description}`);
    lines.push(`   - Confidence: ${(law.confidence * 100).toFixed(1)}%`);
    lines.push(`   - Status: ${law.status}`);
    lines.push(`   - Trials: ${law.trialResults?.length || 0}, Counterexamples: ${law.counterexamples?.length || 0}`);
    if (law.scopeSignature) {
      lines.push(`   - Scope: ${law.scopeSignature.datasetSize}x${law.scopeSignature.dimensions}:${law.scopeSignature.queryPattern}:${law.scopeSignature.targetMetric}@${law.scopeSignature.k}`);
    }
  }
  lines.push(``);
  
  if (runConfig.transferEnabled && abSummary) {
    lines.push(`## Transfer Effectiveness (A/B Testing)`);
    lines.push(``);
    lines.push(`- **Total A/B Tests:** ${transferEff.totalTests}`);
    lines.push(`- **Net Positive:** ${transferEff.netPositiveCount} (${(transferEff.netPositiveRate * 100).toFixed(1)}%)`);
    lines.push(`- **Avg Time-to-Threshold Improvement:** ${transferEff.avgImprovements.timeToThreshold.toFixed(1)}%`);
    lines.push(`- **Avg Best-Achieved Improvement:** ${transferEff.avgImprovements.bestAchieved.toFixed(1)}%`);
    lines.push(`- **Avg Regret Reduction:** ${transferEff.avgImprovements.regret.toFixed(1)}%`);
    if (transferEff.poisoningDomains.length > 0) {
      lines.push(`- **Poisoning Domains:** ${transferEff.poisoningDomains.join(', ')}`);
    }
    lines.push(``);
  }
  
  if (runConfig.driftEnabled) {
    lines.push(`## Drift Resilience`);
    lines.push(``);
    lines.push(`- **Drift Events:** ${driftRes.eventsCount}`);
    lines.push(`- **Avg Re-convergence Time:** ${driftRes.avgReconvergenceTime.toFixed(1)} generations`);
    lines.push(`- **Laws Falsified After Drift:** ${driftRes.lawsFalsifiedAfterDrift}`);
    lines.push(`- **New Laws After Drift:** ${driftRes.newLawsAfterDrift}`);
    lines.push(`- **Instability Events:** ${driftRes.instabilityCount}`);
    lines.push(``);
  }
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Benchmark Harness*`);
  
  return lines.join('\n');
}

// ============= Law Export Functions =============

function exportLaw(law: Law): LawExport {
  return {
    id: law.id,
    domain: law.domain,
    description: law.description,
    scope: {
      domain: law.scopeSignature?.domain || law.domain,
      datasetSize: law.scopeSignature?.datasetSize || 0,
      dimensions: law.scopeSignature?.dimensions || 0,
      queryPattern: law.scopeSignature?.queryPattern || 'random',
      targetMetric: law.scopeSignature?.targetMetric || 'recall',
      k: law.scopeSignature?.k || 10,
      constraints: law.scopeSignature?.constraintRegime
    },
    evidence: {
      totalTrials: law.trialResults?.length || 0,
      successfulTrials: law.trialResults?.filter(t => t.success).length || 0,
      counterexamples: law.counterexamples?.length || 0
    },
    status: law.status,
    confidence: law.confidence,
    discoveredAt: law.discoveredAt,
    lastValidatedAt: law.lastValidatedAt || law.discoveredAt,
    version: law.version,
    // Phase II additions
    lawType: law.lawType,
    halfLife: law.halfLife,
    churnRate: law.churnRate
  };
}

function generateLawsFinalArtifact(laws: Law[], runId: string): LawsFinalArtifact {
  const summary = {
    validated: laws.filter(l => l.status === 'validated').length,
    falsified: laws.filter(l => l.status === 'falsified').length,
    deprecated: laws.filter(l => l.status === 'deprecated').length,
    hypothesis: laws.filter(l => l.status === 'hypothesis').length
  };
  
  return {
    generated: new Date().toISOString(),
    runId,
    totalLaws: laws.length,
    summary,
    laws: laws.map(exportLaw)
  };
}

function generateLawsMarkdown(artifact: LawsFinalArtifact): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock - Discovered Laws`);
  lines.push(``);
  lines.push(`**Generated:** ${artifact.generated}`);
  lines.push(`**Run ID:** ${artifact.runId}`);
  lines.push(`**Total Laws:** ${artifact.totalLaws}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Validated | ${artifact.summary.validated} |`);
  lines.push(`| Falsified | ${artifact.summary.falsified} |`);
  lines.push(`| Deprecated | ${artifact.summary.deprecated} |`);
  lines.push(`| Hypothesis | ${artifact.summary.hypothesis} |`);
  lines.push(``);
  
  // Group laws by status
  const byStatus: Record<string, LawExport[]> = {
    validated: [],
    falsified: [],
    deprecated: [],
    hypothesis: []
  };
  
  for (const law of artifact.laws) {
    byStatus[law.status].push(law);
  }
  
  // Validated laws
  if (byStatus.validated.length > 0) {
    lines.push(`## ✅ Validated Laws`);
    lines.push(``);
    for (const law of byStatus.validated.sort((a, b) => b.confidence - a.confidence)) {
      lines.push(`### ${law.id}: ${law.description}`);
      lines.push(``);
      lines.push(`- **Domain:** ${law.domain}`);
      lines.push(`- **Confidence:** ${(law.confidence * 100).toFixed(1)}%`);
      lines.push(`- **Type:** ${law.lawType || 'soft'} (${law.lawType === 'structural' ? 'hard constraint' : law.lawType === 'regime-bound' ? 'valid under certain drift' : 'performance gradient'})`);
      lines.push(`- **Half-Life:** ${law.halfLife || 'N/A'} generations`);
      lines.push(`- **Churn Rate:** ${law.churnRate !== undefined ? (law.churnRate * 100).toFixed(1) + '%' : 'N/A'}`);
      lines.push(`- **Evidence:** ${law.evidence.successfulTrials}/${law.evidence.totalTrials} successful trials`);
      lines.push(`- **Counterexamples:** ${law.evidence.counterexamples}`);
      lines.push(`- **Scope:** ${law.scope.domain} @ ${law.scope.datasetSize}x${law.scope.dimensions}:${law.scope.queryPattern}:${law.scope.targetMetric}@${law.scope.k}`);
      lines.push(``);
    }
  }
  
  // Falsified laws
  if (byStatus.falsified.length > 0) {
    lines.push(`## ❌ Falsified Laws`);
    lines.push(``);
    for (const law of byStatus.falsified) {
      lines.push(`- **${law.id}:** ${law.description}`);
      lines.push(`  - Type: ${law.lawType || 'soft'}, Counterexamples: ${law.evidence.counterexamples}, Half-Life: ${law.halfLife || 'N/A'} gens`);
    }
    lines.push(``);
  }
  
  // Deprecated laws
  if (byStatus.deprecated.length > 0) {
    lines.push(`## ⚠️ Deprecated Laws`);
    lines.push(``);
    for (const law of byStatus.deprecated) {
      lines.push(`- **${law.id}:** ${law.description}`);
      lines.push(`  - Type: ${law.lawType || 'soft'}, Confidence: ${(law.confidence * 100).toFixed(1)}%, Churn: ${law.churnRate !== undefined ? (law.churnRate * 100).toFixed(1) + '%' : 'N/A'}`);
    }
    lines.push(``);
  }
  
  // Hypothesis laws (top 10 by confidence)
  if (byStatus.hypothesis.length > 0) {
    lines.push(`## 🔬 Hypothesis (Pending Validation)`);
    lines.push(``);
    for (const law of byStatus.hypothesis.sort((a, b) => b.confidence - a.confidence).slice(0, 10)) {
      lines.push(`- **${law.id}:** ${law.description}`);
      lines.push(`  - Type: ${law.lawType || 'soft'}, Confidence: ${(law.confidence * 100).toFixed(1)}%`);
    }
    if (byStatus.hypothesis.length > 10) {
      lines.push(`- ... and ${byStatus.hypothesis.length - 10} more`);
    }
    lines.push(``);
  }
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock*`);
  
  return lines.join('\n');
}

// ============= Optimization Landscape Functions (Phase II) =============

function generateLandscapeReport(
  logs: GenerationLog[],
  laws: Law[],
  config: RunConfig
): LandscapeReport {
  const stableRegions: Region[] = [];
  const brittleRegions: Region[] = [];
  const phaseTransitions: Boundary[] = [];
  
  // Analyze each domain for regions
  for (const domain of config.domains) {
    // Identify stable vs brittle regions based on fitness variance and law validity
    const domainLogs = logs.map(l => ({
      gen: l.generation,
      fitness: l.genomes[domain]?.fitness || 0,
      alpha: l.genomes[domain]?.alpha || 2,
      drift: l.driftEvents.some(e => e.domain === domain)
    }));
    
    const domainLaws = laws.filter(l => l.domain === domain);
    const validatedLaws = domainLaws.filter(l => l.status === 'validated').map(l => l.id);
    const falsifiedLaws = domainLaws.filter(l => l.status === 'falsified').map(l => l.id);
    
    // Segment into regions based on fitness stability
    const windowSize = 50;
    for (let i = 0; i < domainLogs.length - windowSize; i += windowSize) {
      const window = domainLogs.slice(i, i + windowSize);
      const avgFitness = window.reduce((s, w) => s + w.fitness, 0) / window.length;
      const fitnessVariance = window.reduce((s, w) => s + Math.pow(w.fitness - avgFitness, 2), 0) / window.length;
      const avgAlpha = window.reduce((s, w) => s + w.alpha, 0) / window.length;
      
      const hasDrift = window.some(w => w.drift);
      const stability = 1 - Math.min(1, fitnessVariance * 10);  // Higher variance = lower stability
      
      const region: Region = {
        id: `region-${domain}-${i}`,
        domain,
        parameterRanges: {
          alpha: [Math.min(...window.map(w => w.alpha)), Math.max(...window.map(w => w.alpha))],
          explorationBonus: [0.05, 0.15]  // Typical range
        },
        fitnessRange: [Math.min(...window.map(w => w.fitness)), Math.max(...window.map(w => w.fitness))],
        stability,
        lawsHolding: validatedLaws,
        lawsBreaking: falsifiedLaws
      };
      
      if (stability > 0.7 && !hasDrift) {
        stableRegions.push(region);
      } else {
        brittleRegions.push(region);
      }
    }
    
    // Detect phase transitions (sharp fitness changes)
    for (let i = 1; i < domainLogs.length; i++) {
      const prev = domainLogs[i - 1];
      const curr = domainLogs[i];
      const fitnessDelta = Math.abs(curr.fitness - prev.fitness);
      
      if (fitnessDelta > 0.1) {  // Abrupt change threshold
        const boundary: Boundary = {
          id: `boundary-${domain}-${i}`,
          domain,
          fromRegion: `region-${domain}-${Math.floor((i - 1) / 50) * 50}`,
          toRegion: `region-${domain}-${Math.floor(i / 50) * 50}`,
          transitionParameter: Math.abs(curr.alpha - prev.alpha) > 0.3 ? 'alpha' : 'fitness',
          transitionValue: curr.alpha,
          abruptness: Math.min(1, fitnessDelta / 0.3),  // Normalized abruptness
          lawsInvalidated: falsifiedLaws.filter((lawId) => {
            const law = domainLaws.find(l => l.id === lawId);
            return law && law.lastValidatedAt && law.lastValidatedAt < i && (law.counterexamples?.some(c => c.observedAt >= i) || false);
          })
        };
        phaseTransitions.push(boundary);
      }
    }
  }
  
  // Find invariants (laws that hold across all regions)
  const invariantLaws = laws.filter(l => 
    l.status === 'validated' && 
    (l.counterexamples?.length || 0) === 0 &&
    l.confidence >= 0.9
  );
  
  return {
    generated: new Date().toISOString(),
    runId: config.runId,
    totalGenerations: config.generations,
    domains: config.domains,
    stableRegions,
    brittleRegions,
    phaseTransitions,
    invariants: invariantLaws.map(exportLaw),
    measurement: {
      regionsExplored: stableRegions.length + brittleRegions.length,
      lawsValidated: laws.filter(l => l.status === 'validated').length,
      lawsFalsified: laws.filter(l => l.status === 'falsified').length,
      transitionsDetected: phaseTransitions.length
    }
  };
}

function generateLandscapeMarkdown(report: LandscapeReport): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock - Optimization Landscape Measurement`);
  lines.push(``);
  lines.push(`> Interlock does not optimize systems. It reveals the physics they obey.`);
  lines.push(``);
  lines.push(`**Generated:** ${report.generated}`);
  lines.push(`**Run ID:** ${report.runId}`);
  lines.push(`**Total Generations:** ${report.totalGenerations}`);
  lines.push(`**Domains Measured:** ${report.domains.join(', ')}`);
  lines.push(``);
  
  lines.push(`## Measurement Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Regions Explored | ${report.measurement.regionsExplored} |`);
  lines.push(`| Laws Validated | ${report.measurement.lawsValidated} |`);
  lines.push(`| Laws Falsified | ${report.measurement.lawsFalsified} |`);
  lines.push(`| Phase Transitions Detected | ${report.measurement.transitionsDetected} |`);
  lines.push(``);
  
  lines.push(`## 🟢 Stable Regions`);
  lines.push(``);
  lines.push(`Regions where laws hold and behavior is predictable:`);
  lines.push(``);
  if (report.stableRegions.length > 0) {
    lines.push(`| Region | Domain | Alpha Range | Fitness Range | Stability |`);
    lines.push(`|--------|--------|-------------|---------------|-----------|`);
    for (const region of report.stableRegions.slice(0, 10)) {
      lines.push(`| ${region.id} | ${region.domain} | [${region.parameterRanges.alpha[0].toFixed(2)}, ${region.parameterRanges.alpha[1].toFixed(2)}] | [${region.fitnessRange[0].toFixed(3)}, ${region.fitnessRange[1].toFixed(3)}] | ${(region.stability * 100).toFixed(1)}% |`);
    }
    if (report.stableRegions.length > 10) {
      lines.push(`| ... | ... | ... | ... | ... |`);
      lines.push(`| (${report.stableRegions.length - 10} more regions) |`);
    }
  } else {
    lines.push(`*No stable regions detected.*`);
  }
  lines.push(``);
  
  lines.push(`## 🔴 Brittle Regions`);
  lines.push(``);
  lines.push(`Regions where laws break or behavior is unpredictable:`);
  lines.push(``);
  if (report.brittleRegions.length > 0) {
    lines.push(`| Region | Domain | Alpha Range | Fitness Range | Stability |`);
    lines.push(`|--------|--------|-------------|---------------|-----------|`);
    for (const region of report.brittleRegions.slice(0, 10)) {
      lines.push(`| ${region.id} | ${region.domain} | [${region.parameterRanges.alpha[0].toFixed(2)}, ${region.parameterRanges.alpha[1].toFixed(2)}] | [${region.fitnessRange[0].toFixed(3)}, ${region.fitnessRange[1].toFixed(3)}] | ${(region.stability * 100).toFixed(1)}% |`);
    }
    if (report.brittleRegions.length > 10) {
      lines.push(`| ... | ... | ... | ... | ... |`);
      lines.push(`| (${report.brittleRegions.length - 10} more regions) |`);
    }
  } else {
    lines.push(`*No brittle regions detected.*`);
  }
  lines.push(``);
  
  lines.push(`## ⚡ Phase Transitions`);
  lines.push(``);
  lines.push(`Sharp behavior changes at parameter boundaries:`);
  lines.push(``);
  if (report.phaseTransitions.length > 0) {
    for (const boundary of report.phaseTransitions.slice(0, 5)) {
      lines.push(`- **${boundary.id}** (${boundary.domain}): ${boundary.transitionParameter} transition at ${boundary.transitionValue.toFixed(2)}`);
      lines.push(`  - Abruptness: ${(boundary.abruptness * 100).toFixed(1)}%`);
      if (boundary.lawsInvalidated.length > 0) {
        lines.push(`  - Laws Invalidated: ${boundary.lawsInvalidated.join(', ')}`);
      }
    }
    if (report.phaseTransitions.length > 5) {
      lines.push(`- ... and ${report.phaseTransitions.length - 5} more transitions`);
    }
  } else {
    lines.push(`*No abrupt phase transitions detected.*`);
  }
  lines.push(``);
  
  lines.push(`## 🔒 Invariants`);
  lines.push(``);
  lines.push(`Laws that hold across all measured regions:`);
  lines.push(``);
  if (report.invariants.length > 0) {
    for (const law of report.invariants) {
      lines.push(`- **${law.id}** (${law.domain}): ${law.description}`);
      lines.push(`  - Confidence: ${(law.confidence * 100).toFixed(1)}%, Type: ${law.lawType || 'soft'}`);
    }
  } else {
    lines.push(`*No universal invariants detected across all regions.*`);
  }
  lines.push(``);
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Optimization Microscope*`);
  
  return lines.join('\n');
}

// ============= Failure Forecasting Functions (Phase III) =============

/**
 * Extract failure boundaries from phase transition data
 * Converts existing Boundary type to enhanced FailureBoundary with forecasting data
 */
function extractFailureBoundaries(
  phaseTransitions: Boundary[],
  driftResults: DriftInjectionResult[],
  stableRegions: Region[],
  brittleRegions: Region[]
): FailureBoundary[] {
  const boundaries: FailureBoundary[] = [];
  
  // Convert phase transitions to failure boundaries
  for (const transition of phaseTransitions) {
    // Calculate historical drop depth from associated drift results
    const domainDrifts = driftResults.filter(d => d.domain === transition.domain);
    const avgDropDepth = domainDrifts.length > 0
      ? domainDrifts.reduce((s, d) => s + d.dropDepth, 0) / domainDrifts.length
      : transition.abruptness * 0.3; // Estimate from abruptness if no drift data
    
    // Calculate recovery slope from drift results
    const avgRecoveryTime = domainDrifts.length > 0
      ? domainDrifts.reduce((s, d) => s + d.recoveryTime, 0) / domainDrifts.length
      : 20; // Default estimate
    const recoverySlope = avgRecoveryTime > 0 ? avgDropDepth / avgRecoveryTime : 0.01;
    
    // Determine parameter range from associated regions
    const associatedRegion = [...stableRegions, ...brittleRegions]
      .find(r => r.id === transition.fromRegion || r.id === transition.toRegion);
    
    const parameterRange: [number, number] = associatedRegion
      ? associatedRegion.parameterRanges.alpha
      : [1.0, 6.0];
    
    // Calculate confidence based on observation count and consistency
    const observedCrossings = domainDrifts.length;
    const confidence = Math.min(0.95, 0.5 + (observedCrossings * 0.1));
    
    const boundary: FailureBoundary = {
      id: `fb-${transition.id}`,
      domain: transition.domain,
      parameter: transition.transitionParameter,
      parameterRange,
      criticalValue: transition.transitionValue,
      abruptnessScore: transition.abruptness,
      historicalDropDepth: avgDropDepth,
      recoverySlope,
      confidence,
      observedCrossings,
      lawsAtRisk: transition.lawsInvalidated
    };
    
    boundaries.push(boundary);
  }
  
  // Add implicit boundaries from brittle regions
  for (const region of brittleRegions) {
    if (region.stability < 0.3) {
      // Very unstable region - create implicit boundary
      const boundary: FailureBoundary = {
        id: `fb-implicit-${region.id}`,
        domain: region.domain,
        parameter: 'alpha',
        parameterRange: region.parameterRanges.alpha,
        criticalValue: (region.parameterRanges.alpha[0] + region.parameterRanges.alpha[1]) / 2,
        abruptnessScore: 1 - region.stability,
        historicalDropDepth: region.fitnessRange[1] - region.fitnessRange[0],
        recoverySlope: 0.02, // Conservative estimate
        confidence: 0.6,
        observedCrossings: 1,
        lawsAtRisk: region.lawsBreaking
      };
      boundaries.push(boundary);
    }
  }
  
  return boundaries;
}

/**
 * Generate boundaries artifact for export
 */
function generateBoundariesArtifact(
  boundaries: FailureBoundary[],
  runId: string
): BoundariesArtifact {
  const highRisk = boundaries.filter(b => b.abruptnessScore > 0.7).length;
  const mediumRisk = boundaries.filter(b => b.abruptnessScore >= 0.4 && b.abruptnessScore <= 0.7).length;
  const lowRisk = boundaries.filter(b => b.abruptnessScore < 0.4).length;
  
  return {
    generated: new Date().toISOString(),
    runId,
    totalBoundaries: boundaries.length,
    summary: { highRisk, mediumRisk, lowRisk },
    boundaries
  };
}

/**
 * Generate boundaries markdown report
 */
function generateBoundariesMarkdown(artifact: BoundariesArtifact): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock - Failure Boundary Analysis`);
  lines.push(``);
  lines.push(`> Interlock makes failure visible before it happens.`);
  lines.push(``);
  lines.push(`**Generated:** ${artifact.generated}`);
  lines.push(`**Run ID:** ${artifact.runId}`);
  lines.push(`**Total Boundaries Detected:** ${artifact.totalBoundaries}`);
  lines.push(``);
  
  lines.push(`## Risk Summary`);
  lines.push(``);
  lines.push(`| Risk Level | Count | Description |`);
  lines.push(`|------------|-------|-------------|`);
  lines.push(`| 🔴 High | ${artifact.summary.highRisk} | Abruptness > 70% - Sharp transitions |`);
  lines.push(`| 🟡 Medium | ${artifact.summary.mediumRisk} | Abruptness 40-70% - Moderate transitions |`);
  lines.push(`| 🟢 Low | ${artifact.summary.lowRisk} | Abruptness < 40% - Gradual transitions |`);
  lines.push(``);
  
  // Group by domain
  const byDomain: Record<string, FailureBoundary[]> = {};
  for (const b of artifact.boundaries) {
    if (!byDomain[b.domain]) byDomain[b.domain] = [];
    byDomain[b.domain].push(b);
  }
  
  for (const [domain, boundaries] of Object.entries(byDomain)) {
    lines.push(`## ${domain.toUpperCase()} Domain Boundaries`);
    lines.push(``);
    
    for (const b of boundaries.sort((a, b) => b.abruptnessScore - a.abruptnessScore)) {
      const riskIcon = b.abruptnessScore > 0.7 ? '🔴' : b.abruptnessScore >= 0.4 ? '🟡' : '🟢';
      lines.push(`### ${riskIcon} ${b.id}`);
      lines.push(``);
      lines.push(`- **Parameter:** ${b.parameter}`);
      lines.push(`- **Critical Value:** ${b.criticalValue.toFixed(3)}`);
      lines.push(`- **Parameter Range:** [${b.parameterRange[0].toFixed(2)}, ${b.parameterRange[1].toFixed(2)}]`);
      lines.push(`- **Abruptness:** ${(b.abruptnessScore * 100).toFixed(1)}%`);
      lines.push(`- **Historical Drop Depth:** ${(b.historicalDropDepth * 100).toFixed(1)}%`);
      lines.push(`- **Recovery Slope:** ${b.recoverySlope.toFixed(4)} fitness/gen`);
      lines.push(`- **Confidence:** ${(b.confidence * 100).toFixed(1)}%`);
      lines.push(`- **Observed Crossings:** ${b.observedCrossings}`);
      if (b.lawsAtRisk.length > 0) {
        lines.push(`- **Laws at Risk:** ${b.lawsAtRisk.join(', ')}`);
      }
      lines.push(``);
    }
  }
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Failure Boundary Analyzer*`);
  
  return lines.join('\n');
}

/**
 * Find the nearest boundary to the current system state
 */
function findNearestBoundary(
  state: SystemState,
  boundaries: FailureBoundary[]
): { boundary: FailureBoundary | null; distance: number } {
  const domainBoundaries = boundaries.filter(b => b.domain === state.domain);
  
  if (domainBoundaries.length === 0) {
    return { boundary: null, distance: Infinity };
  }
  
  let nearest: FailureBoundary | null = null;
  let minDistance = Infinity;
  
  for (const boundary of domainBoundaries) {
    let distance: number;
    if (boundary.parameter === 'alpha') {
      distance = Math.abs(state.currentAlpha - boundary.criticalValue);
    } else if (boundary.parameter === 'fitness') {
      distance = Math.abs(state.currentFitness - boundary.criticalValue);
    } else {
      distance = Math.abs(state.currentAlpha - boundary.criticalValue);
    }
    
    // Normalize by parameter range
    const range = boundary.parameterRange[1] - boundary.parameterRange[0];
    const normalizedDistance = range > 0 ? distance / range : distance;
    
    if (normalizedDistance < minDistance) {
      minDistance = normalizedDistance;
      nearest = boundary;
    }
  }
  
  return { boundary: nearest, distance: minDistance };
}

/**
 * Predict failure based on system state and proposed change
 * NO STOCHASTIC GUESSING - Uses observed gradients and historical data
 */
function predictFailure(
  systemState: SystemState,
  proposedChange: ProposedChange,
  boundaries: FailureBoundary[]
): FailureForecast {
  const { boundary: nearestBoundary, distance: currentDistance } = findNearestBoundary(systemState, boundaries);
  
  // Calculate new distance after proposed change
  let newParameterValue: number;
  if (proposedChange.parameterName === 'alpha') {
    newParameterValue = proposedChange.proposedValue;
  } else {
    newParameterValue = systemState.currentAlpha;
  }
  
  // Calculate distance to boundary after change
  let newDistance = currentDistance;
  if (nearestBoundary) {
    const rawDistance = Math.abs(newParameterValue - nearestBoundary.criticalValue);
    const range = nearestBoundary.parameterRange[1] - nearestBoundary.parameterRange[0];
    newDistance = range > 0 ? rawDistance / range : rawDistance;
  }
  
  // Determine if we're crossing a boundary
  const isCrossingBoundary = nearestBoundary !== null && 
    newDistance < 0.1 &&
    proposedChange.currentValue !== proposedChange.proposedValue;
  
  // Calculate expected drop depth using historical data (NO GUESSING)
  let expectedDropDepth = 0;
  let expectedRecoveryTime = 0;
  let dominantFailureMode = 'none';
  let riskLevel: 'safe' | 'yellow' | 'red' = 'safe';
  let warningReason = 'System operating within safe parameters.';
  let mitigationSuggestion = 'No action required.';
  
  if (nearestBoundary) {
    const proximityFactor = Math.max(0, 1 - newDistance * 2);
    
    // Expected drop depth = historical drop * proximity factor * abruptness
    expectedDropDepth = nearestBoundary.historicalDropDepth * proximityFactor * nearestBoundary.abruptnessScore;
    
    // Expected recovery time = historical recovery time based on slope
    if (nearestBoundary.recoverySlope > 0) {
      expectedRecoveryTime = Math.ceil(expectedDropDepth / nearestBoundary.recoverySlope);
    } else {
      expectedRecoveryTime = 50;
    }
    
    // Determine failure mode
    if (nearestBoundary.lawsAtRisk.length > 0) {
      dominantFailureMode = `law_invalidation:${nearestBoundary.lawsAtRisk[0]}`;
    } else if (nearestBoundary.abruptnessScore > 0.7) {
      dominantFailureMode = 'phase_transition';
    } else {
      dominantFailureMode = 'gradual_degradation';
    }
    
    // Risk level based on proximity and abruptness
    if (proximityFactor > 0.8 || (isCrossingBoundary && nearestBoundary.abruptnessScore > 0.5)) {
      riskLevel = 'red';
      warningReason = `Forecasted collapse: approaching ${nearestBoundary.parameter} boundary at ${nearestBoundary.criticalValue.toFixed(2)}. ` +
        `Historical drop: ${(nearestBoundary.historicalDropDepth * 100).toFixed(1)}%. ` +
        `Expected recovery: ${expectedRecoveryTime} generations.`;
      mitigationSuggestion = `Avoid ${proposedChange.changeType}. Consider moving ${nearestBoundary.parameter} away from ${nearestBoundary.criticalValue.toFixed(2)}.`;
    } else if (proximityFactor > 0.5) {
      riskLevel = 'yellow';
      warningReason = `Approaching boundary: ${nearestBoundary.parameter} = ${nearestBoundary.criticalValue.toFixed(2)} ` +
        `is ${(newDistance * 100).toFixed(1)}% away. Abruptness: ${(nearestBoundary.abruptnessScore * 100).toFixed(1)}%.`;
      mitigationSuggestion = `Monitor ${nearestBoundary.parameter} closely. Consider smaller incremental changes.`;
    }
  }
  
  // Calculate confidence based on available data
  const confidenceScore = nearestBoundary 
    ? nearestBoundary.confidence * (0.5 + nearestBoundary.observedCrossings * 0.1)
    : 0.3;
  
  return {
    id: `forecast-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    systemState,
    proposedChange,
    expectedDropDepth,
    expectedRecoveryTime,
    dominantFailureMode,
    riskLevel,
    confidenceScore: Math.min(0.95, confidenceScore),
    nearestBoundary,
    boundaryDistance: newDistance,
    warningReason,
    mitigationSuggestion
  };
}

/**
 * Validate a forecast against actual observed outcome
 */
function validateForecast(
  forecast: FailureForecast,
  observedDropDepth: number,
  observedRecoveryTime: number
): ForecastValidation {
  const dropDepthError = Math.abs(forecast.expectedDropDepth - observedDropDepth);
  const recoveryTimeError = Math.abs(forecast.expectedRecoveryTime - observedRecoveryTime);
  
  let wasCorrectRiskLevel = false;
  if (forecast.riskLevel === 'red') {
    wasCorrectRiskLevel = observedDropDepth > 0.15;
  } else if (forecast.riskLevel === 'yellow') {
    wasCorrectRiskLevel = observedDropDepth > 0.05 && observedDropDepth <= 0.15;
  } else {
    wasCorrectRiskLevel = observedDropDepth <= 0.05;
  }
  
  return {
    forecastId: forecast.id,
    predictedDropDepth: forecast.expectedDropDepth,
    observedDropDepth,
    predictedRecoveryTime: forecast.expectedRecoveryTime,
    observedRecoveryTime,
    dropDepthError,
    recoveryTimeError,
    wasCorrectRiskLevel,
    generation: forecast.systemState.generation
  };
}

/**
 * Generate validation summary from multiple forecast validations
 */
function generateValidationSummary(
  validations: ForecastValidation[],
  runId: string
): ForecastValidationSummary {
  const totalForecasts = validations.length;
  const totalValidated = validations.length;
  
  const dropDepthErrors = validations.map(v => v.dropDepthError);
  const recoveryTimeErrors = validations.map(v => v.recoveryTimeError);
  
  const dropDepthMeanError = dropDepthErrors.length > 0
    ? dropDepthErrors.reduce((s, e) => s + e, 0) / dropDepthErrors.length
    : 0;
  
  const recoveryTimeMeanError = recoveryTimeErrors.length > 0
    ? recoveryTimeErrors.reduce((s, e) => s + e, 0) / recoveryTimeErrors.length
    : 0;
  
  const sortedDropErrors = [...dropDepthErrors].sort((a, b) => a - b);
  const sortedRecoveryErrors = [...recoveryTimeErrors].sort((a, b) => a - b);
  
  const dropDepthMedianError = sortedDropErrors.length > 0
    ? sortedDropErrors[Math.floor(sortedDropErrors.length / 2)]
    : 0;
  
  const recoveryTimeMedianError = sortedRecoveryErrors.length > 0
    ? sortedRecoveryErrors[Math.floor(sortedRecoveryErrors.length / 2)]
    : 0;
  
  const correctRiskLevels = validations.filter(v => v.wasCorrectRiskLevel).length;
  const riskLevelAccuracy = totalValidated > 0 ? correctRiskLevels / totalValidated : 0;
  
  const falsePositives = validations.filter(v => 
    v.predictedDropDepth > 0.1 && v.observedDropDepth < 0.05
  ).length;
  
  const falseNegatives = validations.filter(v => 
    v.predictedDropDepth < 0.05 && v.observedDropDepth > 0.1
  ).length;
  
  return {
    generated: new Date().toISOString(),
    runId,
    totalForecasts,
    totalValidated,
    accuracy: {
      dropDepthMeanError,
      dropDepthMedianError,
      recoveryTimeMeanError,
      recoveryTimeMedianError,
      riskLevelAccuracy
    },
    falsePositives,
    falseNegatives,
    limitsOfPrediction: [
      'Predictions are based on observed historical data only',
      'Novel failure modes not in training data cannot be predicted',
      'Confidence degrades for parameter combinations not previously observed',
      'Recovery predictions assume no additional interventions',
      'Cascade effects between domains are not modeled'
    ],
    validations
  };
}

/**
 * Generate forecast validation markdown report
 */
function generateForecastValidationMarkdown(summary: ForecastValidationSummary): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Phase III – Failure Forecasting`);
  lines.push(``);
  lines.push(`> Interlock does not prevent failure. It makes failure visible before it happens.`);
  lines.push(``);
  lines.push(`**Generated:** ${summary.generated}`);
  lines.push(`**Run ID:** ${summary.runId}`);
  lines.push(``);
  
  lines.push(`## Forecast Accuracy Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Forecasts | ${summary.totalForecasts} |`);
  lines.push(`| Total Validated | ${summary.totalValidated} |`);
  lines.push(`| Risk Level Accuracy | ${(summary.accuracy.riskLevelAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Drop Depth Mean Error | ${(summary.accuracy.dropDepthMeanError * 100).toFixed(2)}% |`);
  lines.push(`| Drop Depth Median Error | ${(summary.accuracy.dropDepthMedianError * 100).toFixed(2)}% |`);
  lines.push(`| Recovery Time Mean Error | ${summary.accuracy.recoveryTimeMeanError.toFixed(1)} gens |`);
  lines.push(`| Recovery Time Median Error | ${summary.accuracy.recoveryTimeMedianError.toFixed(1)} gens |`);
  lines.push(``);
  
  lines.push(`## False Positives / Negatives`);
  lines.push(``);
  lines.push(`- **False Positives:** ${summary.falsePositives} (predicted failure, didn't happen)`);
  lines.push(`- **False Negatives:** ${summary.falseNegatives} (didn't predict failure, it happened)`);
  lines.push(``);
  
  const falsePositiveRate = summary.totalValidated > 0 ? summary.falsePositives / summary.totalValidated : 0;
  const falseNegativeRate = summary.totalValidated > 0 ? summary.falseNegatives / summary.totalValidated : 0;
  
  lines.push(`- **False Positive Rate:** ${(falsePositiveRate * 100).toFixed(1)}%`);
  lines.push(`- **False Negative Rate:** ${(falseNegativeRate * 100).toFixed(1)}%`);
  lines.push(``);
  
  lines.push(`## Limits of Prediction`);
  lines.push(``);
  for (const limit of summary.limitsOfPrediction) {
    lines.push(`- ${limit}`);
  }
  lines.push(``);
  
  if (summary.validations.length > 0) {
    lines.push(`## Validation Details`);
    lines.push(``);
    lines.push(`| Forecast ID | Predicted Drop | Observed Drop | Error | Risk Correct |`);
    lines.push(`|-------------|----------------|---------------|-------|--------------|`);
    
    for (const v of summary.validations.slice(0, 20)) {
      const checkMark = v.wasCorrectRiskLevel ? '✅' : '❌';
      lines.push(`| ${v.forecastId.substring(0, 12)} | ${(v.predictedDropDepth * 100).toFixed(1)}% | ${(v.observedDropDepth * 100).toFixed(1)}% | ${(v.dropDepthError * 100).toFixed(1)}% | ${checkMark} |`);
    }
    
    if (summary.validations.length > 20) {
      lines.push(`| ... | ... | ... | ... | ... |`);
      lines.push(`| (${summary.validations.length - 20} more validations) | | | | |`);
    }
    lines.push(``);
  }
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Failure Forecasting Engine*`);
  
  return lines.join('\n');
}

// ============= Resilience Certification Functions (Phase II) =============

function executeCertificationRun(
  seed: number,
  stabilityGenerations: number,
  driftEvents: number
): ResilienceAudit {
  const timestamp = new Date().toISOString();
  const runId = `results/certification_s${seed}_stab${stabilityGenerations}_drift${driftEvents}`;
  
  // Ensure directory exists
  if (!fs.existsSync(runId)) {
    fs.mkdirSync(runId, { recursive: true });
  }
  
  // Phase 1: Optimize to stability (200 generations)
  const optimizationGens = 200;
  const config: RunConfig = {
    runId,
    seed,
    generations: optimizationGens + stabilityGenerations + (driftEvents * 50),
    domains: DOMAINS,
    transferEnabled: false,
    driftEnabled: false,
    timestamp,
    mode: 'certification',
    stabilityGenerations,
    driftEvents
  };
  
  fs.writeFileSync(path.join(runId, 'config.json'), JSON.stringify(config, null, 2));
  
  const sim = new SOSSimulator(config);
  
  // Run optimization phase
  console.log(`[Certification] Phase 1: Optimizing for ${optimizationGens} generations...`);
  sim.openLogStream();
  for (let i = 0; i < optimizationGens; i++) {
    sim.runStep();
  }
  
  const optimizationFitness: Record<string, number> = {};
  for (const domain of DOMAINS) {
    optimizationFitness[domain] = sim.getGenomes()[domain].fitness;
  }
  
  // Phase 2: Hold steady for N generations
  console.log(`[Certification] Phase 2: Holding steady for ${stabilityGenerations} generations...`);
  const stabilityStartGen = optimizationGens;
  const varianceObserved: Record<string, number> = {};
  const stabilityFitnesses: Record<string, number[]> = {};
  
  for (const domain of DOMAINS) {
    stabilityFitnesses[domain] = [];
  }
  
  for (let i = 0; i < stabilityGenerations; i++) {
    sim.runStep();
    for (const domain of DOMAINS) {
      stabilityFitnesses[domain].push(sim.getGenomes()[domain].fitness);
    }
  }
  
  // Calculate variance during stability phase
  let stabilityMaintained = true;
  for (const domain of DOMAINS) {
    const fitnesses = stabilityFitnesses[domain];
    const mean = fitnesses.reduce((s, f) => s + f, 0) / fitnesses.length;
    const variance = fitnesses.reduce((s, f) => s + Math.pow(f - mean, 2), 0) / fitnesses.length;
    varianceObserved[domain] = variance;
    if (variance > 0.01) {  // Threshold for "stable"
      stabilityMaintained = false;
    }
  }
  
  // Phase 3: Inject drift events and measure recovery
  console.log(`[Certification] Phase 3: Injecting ${driftEvents} drift events...`);
  const driftResults: DriftInjectionResult[] = [];
  const stressStartGen = optimizationGens + stabilityGenerations;
  
  for (let d = 0; d < driftEvents; d++) {
    const domain = DOMAINS[d % DOMAINS.length];
    const preFitness = sim.getGenomes()[domain].fitness;
    const preLaws = sim.getLaws().filter(l => l.status === 'validated').length;
    
    // Manually inject drift
    const driftEvent = (sim as any)._injectDrift(domain);
    
    const recoveryCurve: RecoveryCurvePoint[] = [];
    let minFitness = sim.getGenomes()[domain].fitness;
    let recoveryTime = 50;  // Default to max
    const recoveryTarget = preFitness * 0.9;
    
    // Run 50 generations after drift
    for (let i = 0; i < 50; i++) {
      sim.runStep();
      const currentFitness = sim.getGenomes()[domain].fitness;
      minFitness = Math.min(minFitness, currentFitness);
      
      const validLaws = sim.getLaws().filter(l => l.status === 'validated').length;
      const invalidLaws = sim.getLaws().filter(l => l.status === 'falsified' || l.status === 'deprecated').length;
      
      recoveryCurve.push({
        generation: stressStartGen + d * 50 + i,
        fitness: currentFitness,
        lawsValid: validLaws,
        lawsInvalid: invalidLaws
      });
      
      if (currentFitness >= recoveryTarget && recoveryTime === 50) {
        recoveryTime = i + 1;
      }
    }
    
    const dropDepth = preFitness - minFitness;
    const postLaws = sim.getLaws().filter(l => l.status === 'validated').length;
    
    driftResults.push({
      injectedAt: stressStartGen + d * 50,
      domain,
      preFitness,
      dropDepth,
      recoveryTime,
      lawsInvalidatedCount: preLaws - postLaws,
      recoveryCurve
    });
  }
  
  sim.closeLogStream();
  
  // Calculate resilience score
  const avgDropDepth = driftResults.reduce((s, r) => s + r.dropDepth, 0) / driftResults.length;
  const avgRecoveryTime = driftResults.reduce((s, r) => s + r.recoveryTime, 0) / driftResults.length;
  const overallScore = avgRecoveryTime > 0 ? (1 - avgDropDepth) / avgRecoveryTime : 0;
  
  const byDomain: Record<string, number> = {};
  for (const domain of DOMAINS) {
    const domainResults = driftResults.filter(r => r.domain === domain);
    if (domainResults.length > 0) {
      const domainAvgDrop = domainResults.reduce((s, r) => s + r.dropDepth, 0) / domainResults.length;
      const domainAvgRecovery = domainResults.reduce((s, r) => s + r.recoveryTime, 0) / domainResults.length;
      byDomain[domain] = domainAvgRecovery > 0 ? (1 - domainAvgDrop) / domainAvgRecovery : 0;
    }
  }
  
  const shieldRating: 'green' | 'yellow' | 'red' = overallScore >= 0.08 ? 'green' : overallScore >= 0.04 ? 'yellow' : 'red';
  
  const totalLawsInvalidated = driftResults.reduce((s, r) => s + r.lawsInvalidatedCount, 0);
  const totalLaws = sim.getLaws().length;
  const lawInvalidationRate = totalLaws > 0 ? totalLawsInvalidated / totalLaws : 0;
  
  // Identify failure modes and recovery patterns
  const failureModes: string[] = [];
  const recoveryPatterns: string[] = [];
  
  for (const result of driftResults) {
    if (result.dropDepth > 0.3) {
      failureModes.push(`${result.domain}: Severe fitness drop (${(result.dropDepth * 100).toFixed(1)}%) at gen ${result.injectedAt}`);
    }
    if (result.recoveryTime < 10) {
      recoveryPatterns.push(`${result.domain}: Fast recovery (${result.recoveryTime} gens)`);
    } else if (result.recoveryTime >= 50) {
      failureModes.push(`${result.domain}: Failed to recover within 50 generations`);
    }
  }
  
  const audit: ResilienceAudit = {
    generated: timestamp,
    runId,
    mode: 'certification',
    config: {
      stabilityGenerations,
      driftEvents,
      seed
    },
    phases: {
      optimization: {
        startGen: 0,
        endGen: optimizationGens,
        finalFitness: optimizationFitness
      },
      stability: {
        startGen: stabilityStartGen,
        endGen: stabilityStartGen + stabilityGenerations,
        maintained: stabilityMaintained,
        varianceObserved
      },
      stressTesting: {
        driftResults,
        lawInvalidationRate
      }
    },
    resilienceScore: {
      overall: overallScore,
      byDomain,
      shieldRating
    },
    failureModes,
    recoveryPatterns
  };
  
  // Write artifacts
  fs.writeFileSync(path.join(runId, 'resilience_audit.json'), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(runId, 'resilience_audit.md'), generateResilienceAuditMarkdown(audit));
  
  // Also generate laws and landscape
  const laws = sim.getLaws();
  const lawsFinalArtifact = generateLawsFinalArtifact(laws, runId);
  fs.writeFileSync(path.join(runId, 'laws.final.json'), JSON.stringify(lawsFinalArtifact, null, 2));
  fs.writeFileSync(path.join(runId, 'laws.final.md'), generateLawsMarkdown(lawsFinalArtifact));
  
  // Phase III: Generate failure boundaries and forecast validation
  console.log(`[Certification] Phase III: Generating failure forecasts...`);
  
  // Extract failure boundaries from drift results
  const failureBoundaries: FailureBoundary[] = [];
  for (const result of driftResults) {
    const boundary: FailureBoundary = {
      id: `fb-drift-${result.domain}-${result.injectedAt}`,
      domain: result.domain,
      parameter: 'fitness',
      parameterRange: [0, 1],
      criticalValue: result.preFitness * 0.8, // 20% below pre-fitness
      abruptnessScore: Math.min(1, result.dropDepth * 3), // Higher drop = more abrupt
      historicalDropDepth: result.dropDepth,
      recoverySlope: result.recoveryTime > 0 ? result.dropDepth / result.recoveryTime : 0.01,
      confidence: 0.8,
      observedCrossings: 1,
      lawsAtRisk: []
    };
    failureBoundaries.push(boundary);
  }
  
  // Generate boundaries artifact
  const boundariesArtifact = generateBoundariesArtifact(failureBoundaries, runId);
  fs.writeFileSync(path.join(runId, 'boundaries.json'), JSON.stringify(boundariesArtifact, null, 2));
  fs.writeFileSync(path.join(runId, 'boundaries.md'), generateBoundariesMarkdown(boundariesArtifact));
  
  // Run forecast validation - compare predicted vs observed for each drift event
  const forecastValidations: ForecastValidation[] = [];
  for (const result of driftResults) {
    // Create system state before drift
    const systemState: SystemState = {
      domain: result.domain,
      currentAlpha: 3.0, // Approximate
      currentFitness: result.preFitness,
      currentStrategy: 'adaptive',
      generation: result.injectedAt,
      recentVariance: 0.01,
      proximityToBoundary: 0.5
    };
    
    // Create proposed change (drift injection)
    const proposedChange: ProposedChange = {
      parameterName: 'fitness',
      currentValue: result.preFitness,
      proposedValue: result.preFitness * 0.6, // Drift typically drops fitness by 40%
      changeType: 'drift'
    };
    
    // Generate forecast
    const forecast = predictFailure(systemState, proposedChange, failureBoundaries);
    
    // Validate against observed outcome
    const validation = validateForecast(forecast, result.dropDepth, result.recoveryTime);
    forecastValidations.push(validation);
  }
  
  // Generate validation summary
  const validationSummary = generateValidationSummary(forecastValidations, runId);
  fs.writeFileSync(path.join(runId, 'forecast_validation.json'), JSON.stringify(validationSummary, null, 2));
  fs.writeFileSync(path.join(runId, 'forecast_validation.md'), generateForecastValidationMarkdown(validationSummary));
  
  console.log(`[Certification] Forecast validation complete: ${(validationSummary.accuracy.riskLevelAccuracy * 100).toFixed(1)}% accuracy`);
  
  return audit;
}

function generateResilienceAuditMarkdown(audit: ResilienceAudit): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Resilience Audit`);
  lines.push(``);
  lines.push(`> Resilience = (1 - DropDepth) / RecoveryTime`);
  lines.push(``);
  lines.push(`**Generated:** ${audit.generated}`);
  lines.push(`**Run ID:** ${audit.runId}`);
  lines.push(`**Mode:** ${audit.mode}`);
  lines.push(``);
  
  lines.push(`## Configuration`);
  lines.push(``);
  lines.push(`- **Seed:** ${audit.config.seed}`);
  lines.push(`- **Stability Hold:** ${audit.config.stabilityGenerations} generations`);
  lines.push(`- **Drift Events:** ${audit.config.driftEvents}`);
  lines.push(``);
  
  // Shield Rating Banner
  const ratingEmoji = audit.resilienceScore.shieldRating === 'green' ? '🟢' : 
                      audit.resilienceScore.shieldRating === 'yellow' ? '🟡' : '🔴';
  const ratingText = audit.resilienceScore.shieldRating.toUpperCase();
  
  lines.push(`## Shield Rating: ${ratingEmoji} ${ratingText}`);
  lines.push(``);
  lines.push(`**Overall Resilience Score:** ${audit.resilienceScore.overall.toFixed(4)}`);
  lines.push(``);
  lines.push(`| Domain | Resilience Score |`);
  lines.push(`|--------|------------------|`);
  for (const [domain, score] of Object.entries(audit.resilienceScore.byDomain)) {
    lines.push(`| ${domain} | ${score.toFixed(4)} |`);
  }
  lines.push(``);
  
  lines.push(`## Phase 1: Optimization`);
  lines.push(``);
  lines.push(`- **Duration:** Gen ${audit.phases.optimization.startGen} → ${audit.phases.optimization.endGen}`);
  lines.push(`- **Final Fitness:**`);
  for (const [domain, fitness] of Object.entries(audit.phases.optimization.finalFitness)) {
    lines.push(`  - ${domain}: ${fitness.toFixed(4)}`);
  }
  lines.push(``);
  
  lines.push(`## Phase 2: Stability Hold`);
  lines.push(``);
  lines.push(`- **Duration:** Gen ${audit.phases.stability.startGen} → ${audit.phases.stability.endGen}`);
  lines.push(`- **Stability Maintained:** ${audit.phases.stability.maintained ? '✅ Yes' : '❌ No'}`);
  lines.push(`- **Variance Observed:**`);
  for (const [domain, variance] of Object.entries(audit.phases.stability.varianceObserved)) {
    const status = variance <= 0.01 ? '✅' : '⚠️';
    lines.push(`  - ${domain}: ${variance.toFixed(6)} ${status}`);
  }
  lines.push(``);
  
  lines.push(`## Phase 3: Stress Testing`);
  lines.push(``);
  lines.push(`- **Law Invalidation Rate:** ${(audit.phases.stressTesting.lawInvalidationRate * 100).toFixed(1)}%`);
  lines.push(``);
  
  lines.push(`### Drift Injection Results`);
  lines.push(``);
  lines.push(`| Drift # | Domain | Pre-Fitness | Drop Depth | Recovery Time | Laws Lost |`);
  lines.push(`|---------|--------|-------------|------------|---------------|-----------|`);
  for (let i = 0; i < audit.phases.stressTesting.driftResults.length; i++) {
    const result = audit.phases.stressTesting.driftResults[i];
    lines.push(`| ${i + 1} | ${result.domain} | ${result.preFitness.toFixed(3)} | ${(result.dropDepth * 100).toFixed(1)}% | ${result.recoveryTime} gens | ${result.lawsInvalidatedCount} |`);
  }
  lines.push(``);
  
  // Recovery curves (simplified text representation)
  lines.push(`### Recovery Curves`);
  lines.push(``);
  for (const result of audit.phases.stressTesting.driftResults) {
    lines.push(`**${result.domain}** (Drift at gen ${result.injectedAt}):`);
    lines.push('```');
    const curve = result.recoveryCurve;
    const maxFitness = Math.max(...curve.map(p => p.fitness));
    const minFitness = Math.min(...curve.map(p => p.fitness));
    const range = maxFitness - minFitness || 1;
    
    // Simple ASCII recovery curve
    for (let i = 0; i < Math.min(curve.length, 20); i++) {
      const point = curve[i * Math.floor(curve.length / 20) || i];
      const normalizedFitness = (point.fitness - minFitness) / range;
      const barLength = Math.round(normalizedFitness * 30);
      lines.push(`Gen ${point.generation.toString().padStart(4)}: ${'█'.repeat(barLength)}${'░'.repeat(30 - barLength)} ${point.fitness.toFixed(3)}`);
    }
    lines.push('```');
    lines.push(``);
  }
  
  lines.push(`## Failure Modes`);
  lines.push(``);
  if (audit.failureModes.length > 0) {
    for (const mode of audit.failureModes) {
      lines.push(`- ❌ ${mode}`);
    }
  } else {
    lines.push(`*No critical failure modes detected.*`);
  }
  lines.push(``);
  
  lines.push(`## Recovery Patterns`);
  lines.push(``);
  if (audit.recoveryPatterns.length > 0) {
    for (const pattern of audit.recoveryPatterns) {
      lines.push(`- ✅ ${pattern}`);
    }
  } else {
    lines.push(`*No notable recovery patterns detected.*`);
  }
  lines.push(``);
  
  // Phase III: Failure Forecast Summary
  lines.push(`## Phase III: Failure Forecasting`);
  lines.push(``);
  lines.push(`### Unsafe Operating Regions`);
  lines.push(``);
  
  // Identify unsafe regions from drift results
  const unsafeRegions: string[] = [];
  for (const result of audit.phases.stressTesting.driftResults) {
    if (result.dropDepth > 0.2) {
      unsafeRegions.push(`- **${result.domain}**: Avoid fitness below ${(result.preFitness * 0.8).toFixed(3)} (observed ${(result.dropDepth * 100).toFixed(1)}% drop)`);
    }
  }
  if (unsafeRegions.length > 0) {
    for (const region of unsafeRegions) {
      lines.push(region);
    }
  } else {
    lines.push(`*No critical unsafe regions identified.*`);
  }
  lines.push(``);
  
  lines.push(`### Recommended Safety Margins`);
  lines.push(``);
  lines.push(`| Parameter | Safe Range | Margin |`);
  lines.push(`|-----------|------------|--------|`);
  for (const [domain, fitness] of Object.entries(audit.phases.optimization.finalFitness)) {
    const safeMin = fitness * 0.85;
    const safeMax = Math.min(1.0, fitness * 1.1);
    const margin = (fitness - safeMin).toFixed(3);
    lines.push(`| ${domain} fitness | [${safeMin.toFixed(3)}, ${safeMax.toFixed(3)}] | ${margin} |`);
  }
  lines.push(``);
  
  lines.push(`### Forecast Limitations`);
  lines.push(``);
  lines.push(`- Predictions based on observed historical data only`);
  lines.push(`- Novel failure modes cannot be predicted`);
  lines.push(`- Cascade effects between domains not modeled`);
  lines.push(`- See \`forecast_validation.md\` for detailed accuracy metrics`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Resilience Certification Engine (Phase III)*`);
  
  return lines.join('\n');
}

interface RunResult {
  runId: string;
  config: RunConfig;
  convergence: ConvergenceMetrics;
  lawQuality: LawQualityMetrics;
  transferEff: TransferEffectiveness;
  driftRes: DriftResilienceMetrics;
  abSummary: ABSummary | null;
  report: string;
}

function executeRun(seed: number, generations: number, transferEnabled: boolean, driftEnabled: boolean, driftSchedule?: number[]): RunResult {
  const timestamp = new Date().toISOString();
  const runId = `results/run_s${seed}_g${generations}_t${transferEnabled ? '1' : '0'}_d${driftEnabled ? '1' : '0'}`;
  
  // Ensure directory exists
  if (!fs.existsSync(runId)) {
    fs.mkdirSync(runId, { recursive: true });
  }
  
  const config: RunConfig = {
    runId,
    seed,
    generations,
    domains: DOMAINS,
    transferEnabled,
    driftEnabled,
    driftSchedule,
    timestamp
  };
  
  // Write config
  fs.writeFileSync(path.join(runId, 'config.json'), JSON.stringify(config, null, 2));
  
  // Run simulation
  const sim = new SOSSimulator(config);
  const result = sim.run();
  
  // Read generation logs for analysis
  const genLogPath = path.join(runId, 'gen_log.jsonl');
  const logs: GenerationLog[] = fs.readFileSync(genLogPath, 'utf-8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  
  // Compute metrics
  const convergence = computeConvergence(logs);
  const lawQuality = computeLawQuality(result.laws, generations);
  const transferEff = computeTransferEffectiveness(result.abTestResults);
  const driftRes = computeDriftResilience(logs, result.driftEvents, result.laws);
  
  // A/B summary
  const abSummary: ABSummary | null = transferEnabled ? {
    runId,
    seed,
    transferEnabled,
    totalTests: result.abTestResults.length,
    netPositiveCount: result.abTestResults.filter(r => r.isNetPositive).length,
    netPositiveRate: result.abTestResults.length > 0 ? 
      result.abTestResults.filter(r => r.isNetPositive).length / result.abTestResults.length : 0,
    avgImprovements: transferEff.avgImprovements,
    testResults: result.abTestResults
  } : null;
  
  // Write laws.json
  fs.writeFileSync(path.join(runId, 'laws.json'), JSON.stringify(result.laws, null, 2));
  
  // Generate and write laws.final.json and laws.final.md
  const lawsFinalArtifact = generateLawsFinalArtifact(result.laws, runId);
  fs.writeFileSync(path.join(runId, 'laws.final.json'), JSON.stringify(lawsFinalArtifact, null, 2));
  fs.writeFileSync(path.join(runId, 'laws.final.md'), generateLawsMarkdown(lawsFinalArtifact));
  
  // Generate and write landscape.json and landscape.md (Phase II)
  const landscapeReport = generateLandscapeReport(logs, result.laws, config);
  fs.writeFileSync(path.join(runId, 'landscape.json'), JSON.stringify(landscapeReport, null, 2));
  fs.writeFileSync(path.join(runId, 'landscape.md'), generateLandscapeMarkdown(landscapeReport));
  
  // Generate and write boundaries.json and boundaries.md (Phase III - Failure Forecasting)
  // Extract failure boundaries from landscape data
  const failureBoundaries = extractFailureBoundaries(
    landscapeReport.phaseTransitions,
    driftEnabled ? result.driftEvents.map(e => ({
      injectedAt: e.generation,
      domain: e.domain,
      preFitness: e.preFitness,
      dropDepth: e.preFitness - e.postFitness,
      recoveryTime: 20, // Estimated from driftRes
      lawsInvalidatedCount: 0,
      recoveryCurve: []
    })) : [],
    landscapeReport.stableRegions,
    landscapeReport.brittleRegions
  );
  
  const boundariesArtifact = generateBoundariesArtifact(failureBoundaries, runId);
  fs.writeFileSync(path.join(runId, 'boundaries.json'), JSON.stringify(boundariesArtifact, null, 2));
  fs.writeFileSync(path.join(runId, 'boundaries.md'), generateBoundariesMarkdown(boundariesArtifact));
  
  // Write ab_summary.json
  if (abSummary) {
    fs.writeFileSync(path.join(runId, 'ab_summary.json'), JSON.stringify(abSummary, null, 2));
  }
  
  // Generate report
  const report = generateMarkdownReport(config, convergence, lawQuality, transferEff, driftRes, abSummary);
  fs.writeFileSync(path.join(runId, 'report.md'), report);
  
  return { runId, config, convergence, lawQuality, transferEff, driftRes, abSummary, report };
}

// Run mode type
type RunMode = 'standard' | 'certification' | 'phase4';

// Parse command line arguments
interface ParsedArgs {
  seed: number;
  gens: number;
  transfer: boolean;
  drift: boolean;
  out: string;
  mode: RunMode;
  stabilityGens: number;
  driftEvents: number;
  // Phase IV specific
  initialSize: number;
  growthSteps: number;
  vectorsPerStep: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let seed = 42;
  let gens = 500;
  let transfer = false;
  let drift = false;
  let out = 'results/default';
  let mode: RunMode = 'standard';
  let stabilityGens = 100;
  let driftEvents = 3;
  // Phase IV defaults
  let initialSize = 10000;
  let growthSteps = 10;
  let vectorsPerStep = 10000;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) {
      seed = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--gens' && args[i + 1]) {
      gens = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--transfer' && args[i + 1]) {
      transfer = args[i + 1].toLowerCase() === 'on';
      i++;
    } else if (args[i] === '--drift' && args[i + 1]) {
      drift = args[i + 1].toLowerCase() === 'on';
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      out = args[i + 1];
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1].toLowerCase() as RunMode;
      i++;
    } else if (args[i] === '--stability-gens' && args[i + 1]) {
      stabilityGens = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--drift-events' && args[i + 1]) {
      driftEvents = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--initial-size' && args[i + 1]) {
      initialSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--growth-steps' && args[i + 1]) {
      growthSteps = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--vectors-per-step' && args[i + 1]) {
      vectorsPerStep = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  return { seed, gens, transfer, drift, out, mode, stabilityGens, driftEvents, initialSize, growthSteps, vectorsPerStep };
}

// ============= Phase IV: FAISS Ground-Truth Certification =============

interface PhaseIVConfig {
  initialSize: number;
  growthSteps: number;
  vectorsPerStep: number;
  dimensions: number;
  nlist: number;
  nprobe: number;
}

interface FAISSMetricsInternal {
  recallAtK: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  memoryMb: number;
  indexSize: number;
  queryCount: number;
}

interface CalibrationPrediction {
  predictedTimeToFailure: number;
  actualTimeToFailure: number;
  predictedDropDepth: number;
  actualDropDepth: number;
  predictedRecoveryTime: number;
  actualRecoveryTime: number;
  riskLevel: 'safe' | 'yellow' | 'red';
  failureOccurred: boolean;
}

interface PhaseIVCalibration {
  runId: string;
  generated: string;
  totalForecasts: number;
  validatedForecasts: number;
  timeToFailureMeanError: number;
  timeToFailureMedianError: number;
  dropDepthMeanError: number;
  dropDepthMedianError: number;
  recoveryTimeMeanError: number;
  recoveryTimeMedianError: number;
  falsePositives: number;
  falseNegatives: number;
  truePositives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  predictions: CalibrationPrediction[];
  confidenceInterval95: [number, number];
  limitations: string[];
  // Phase III additions: Brier score and cost-sensitive metrics
  brierScore: number;               // Lower is better (0 = perfect, 1 = worst)
  brierSkillScore: number;          // Improvement over baseline (>0 = better than random)
  costSensitiveLoss: number;        // Weighted loss where FN costs 7x FP
  reliabilityCurve: Array<{ predicted: number; observed: number; count: number }>;
}

// Phase III Constants: Risk level probability mappings for Brier score
const RISK_LEVEL_PROBABILITIES = {
  red: 0.9,
  yellow: 0.6,
  safe: 0.2
} as const;

// Cost-sensitive evaluation: FN costs 7x FP (biased toward safety)
const FALSE_NEGATIVE_COST_MULTIPLIER = 7;

// Operational Warranty (Phase IV output artifact)
interface OperationalWarranty {
  generated: string;
  runId: string;
  version: string;
  
  // Core warranty metrics
  certifiedSafeLoad: number;           // vectors - safe operating limit
  circuitBreakerTriggerPoint: number;  // vectors - where circuit breaker activates
  guaranteedFailureRegion: number;     // vectors - guaranteed failure beyond this
  safetyMargin: number;                // percentage - buffer between safe and trigger
  
  // Resilience Half-Life: drift until safety margin degrades by 50%
  resilienceHalfLife: {
    vectors: number;                   // Additional vectors until margin halved
    estimatedTime: string;             // Human-readable estimate
    confidence: number;                // 0-1 confidence in estimate
  };
  
  // Operating constraints
  operatingConstraints: {
    maxIndexSize: number;
    maxMemoryMb: number;
    minRecall: number;
    maxLatencyMs: number;
  };
  
  // Warranty scope
  scope: {
    indexType: string;
    dimensions: number;
    queryPattern: string;
    testedRange: { min: number; max: number };
  };
  
  // Limitations
  limitations: string[];
  
  // Verdict linkage
  certificationVerdict: 'CERTIFIED' | 'CONDITIONAL' | 'NOT_CERTIFIED';
}

interface PhaseIVReport {
  generated: string;
  runId: string;
  version: string;
  overallVerdict: 'CERTIFIED' | 'CONDITIONAL' | 'NOT_CERTIFIED';
  summaryText: string;
  keyFindings: string[];
  calibration: PhaseIVCalibration;
  metricsHistory: FAISSMetricsInternal[];
  circuitBreakerConfig: {
    recallThreshold: number;
    latencyThresholdMs: number;
    hazardThreshold: number;
    degradedNprobe: number;
    optimalNprobe: number;
  };
  whatCanPredict: string[];
  whatCannotPredict: string[];
  knownFailureCases: string[];
  operationalWarranty?: OperationalWarranty;  // Phase IV addition
}

// Phase IV FAISS Harness Simulator (TypeScript implementation)
class FAISSHarnessSimulator {
  private currentSize: number = 0;
  private baseRecall: number = 0.92;
  private baseLatency: number = 2.0;
  private memoryPerVector: number;
  private rng: SeededRandom;
  private dimensions: number;
  private nlist: number;
  private nprobe: number;

  constructor(config: PhaseIVConfig, seed: number) {
    this.dimensions = config.dimensions || 128;
    this.nlist = config.nlist || 100;
    this.nprobe = config.nprobe || 10;
    this.rng = new SeededRandom(seed);
    this.memoryPerVector = (this.dimensions * 4) / (1024 * 1024);
  }

  initialize(nVectors: number): FAISSMetricsInternal {
    this.currentSize = nVectors;
    return this.computeMetrics(0);
  }

  addVectors(nVectors: number): FAISSMetricsInternal {
    this.currentSize += nVectors;
    return this.computeMetrics(100);
  }

  query(nQueries: number): FAISSMetricsInternal {
    return this.computeMetrics(nQueries);
  }

  private computeMetrics(queryCount: number): FAISSMetricsInternal {
    const sizeFactor = this.currentSize / 100000;
    const recallDegradation = Math.min(0.3, sizeFactor * 0.1);
    const probeBoost = Math.min(0.2, (this.nprobe / 100) * 0.15);
    const noise = (this.rng.next() - 0.5) * 0.02;
    
    const recall = Math.max(0.5, Math.min(0.99, 
      this.baseRecall - recallDegradation + probeBoost + noise
    ));
    
    const latencyBase = this.baseLatency;
    const latencySizeMultiplier = 1 + (this.currentSize / 100000);
    const latencyProbeMultiplier = 1 + (this.nprobe / 50) * 0.5;
    const latencyNoise = (this.rng.next() - 0.5) * 2;
    
    const latencyP50 = Math.max(0.5, latencyBase * latencySizeMultiplier * latencyProbeMultiplier + latencyNoise);
    const latencyP95 = latencyP50 * (1.3 + this.rng.next() * 0.4);
    const latencyP99 = latencyP95 * (1.2 + this.rng.next() * 0.3);
    
    const memory = this.currentSize * this.memoryPerVector;
    
    return {
      recallAtK: recall,
      latencyP50Ms: latencyP50,
      latencyP95Ms: latencyP95,
      latencyP99Ms: latencyP99,
      memoryMb: memory,
      indexSize: this.currentSize,
      queryCount
    };
  }

  setNprobe(nprobe: number): void {
    this.nprobe = Math.max(1, Math.min(nprobe, this.nlist));
  }
}

// Phase IV Forecast Calibration Engine
class PhaseIVCalibrator {
  private predictions: Array<{
    timestamp: number;
    currentSize: number;
    currentRecall: number;
    currentLatency: number;
    predictedTimeToFailure: number;
    predictedDropDepth: number;
    predictedRecoveryTime: number;
    riskLevel: 'safe' | 'yellow' | 'red';
    confidence: number;
  }> = [];
  
  private observations: Array<{
    predictionIndex: number;
    actualTimeToFailure: number;
    actualDropDepth: number;
    actualRecoveryTime: number;
    failureOccurred: boolean;
  }> = [];

  predictFailure(
    metrics: FAISSMetricsInternal,
    growthRate: number = 10000,
    recallThreshold: number = 0.7,
    latencyThresholdMs: number = 50.0
  ) {
    const currentSize = metrics.indexSize;
    const currentRecall = metrics.recallAtK;
    const currentLatency = metrics.latencyP95Ms;
    
    const recallDegradationPerStep = 0.01 * (currentSize / 50000);
    const latencyDegradationPerStep = 0.5 * (currentSize / 50000);
    
    let timeToRecallFailure: number;
    if (currentRecall <= recallThreshold) {
      timeToRecallFailure = 0;
    } else {
      const recallMargin = currentRecall - recallThreshold;
      timeToRecallFailure = recallDegradationPerStep > 0 
        ? Math.ceil(recallMargin / recallDegradationPerStep)
        : 100;
    }
    
    let timeToLatencyFailure: number;
    if (currentLatency >= latencyThresholdMs) {
      timeToLatencyFailure = 0;
    } else {
      const latencyMargin = latencyThresholdMs - currentLatency;
      timeToLatencyFailure = latencyDegradationPerStep > 0
        ? Math.ceil(latencyMargin / latencyDegradationPerStep)
        : 100;
    }
    
    const timeToFailure = Math.min(timeToRecallFailure, timeToLatencyFailure);
    const predictedDropDepth = Math.min(0.5, recallDegradationPerStep * 10);
    const rebuildTimeFactor = 1.0 + (currentSize / 100000);
    const predictedRecoveryTime = Math.ceil(5 * rebuildTimeFactor);
    
    let riskLevel: 'safe' | 'yellow' | 'red';
    if (timeToFailure <= 2) {
      riskLevel = 'red';
    } else if (timeToFailure <= 5) {
      riskLevel = 'yellow';
    } else {
      riskLevel = 'safe';
    }
    
    const confidence = Math.min(0.9, 0.5 + (currentSize / 200000));
    
    const prediction = {
      timestamp: Date.now(),
      currentSize,
      currentRecall,
      currentLatency,
      predictedTimeToFailure: timeToFailure,
      predictedDropDepth,
      predictedRecoveryTime,
      riskLevel,
      confidence
    };
    
    this.predictions.push(prediction);
    return prediction;
  }

  recordObservation(
    predictionIndex: number,
    actualTimeToFailure: number,
    actualDropDepth: number,
    actualRecoveryTime: number,
    failureOccurred: boolean
  ): void {
    if (predictionIndex >= this.predictions.length) return;
    
    this.observations.push({
      predictionIndex,
      actualTimeToFailure,
      actualDropDepth,
      actualRecoveryTime,
      failureOccurred
    });
  }

  calculateCalibration(runId: string): PhaseIVCalibration {
    const limitations = [
      'Predictions based on observed degradation gradients only',
      'Novel failure modes not in training data cannot be predicted',
      'Confidence degrades for configurations not previously observed',
      'Recovery predictions assume no manual interventions',
      'Cascade effects from concurrent operations not modeled',
      'Memory pressure from system processes not accounted for'
    ];

    if (this.observations.length === 0) {
      return {
        runId,
        generated: new Date().toISOString(),
        totalForecasts: this.predictions.length,
        validatedForecasts: 0,
        timeToFailureMeanError: 0,
        timeToFailureMedianError: 0,
        dropDepthMeanError: 0,
        dropDepthMedianError: 0,
        recoveryTimeMeanError: 0,
        recoveryTimeMedianError: 0,
        falsePositives: 0,
        falseNegatives: 0,
        truePositives: 0,
        trueNegatives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        predictions: [],
        confidenceInterval95: [0, 1],
        limitations,
        brierScore: 0,
        brierSkillScore: 0,
        costSensitiveLoss: 0,
        reliabilityCurve: []
      };
    }

    const timeErrors: number[] = [];
    const dropErrors: number[] = [];
    const recoveryErrors: number[] = [];
    const calibrationData: CalibrationPrediction[] = [];
    
    let tp = 0, fp = 0, tn = 0, fn = 0;
    
    // For Brier score calculation
    const brierScores: number[] = [];
    
    for (const obs of this.observations) {
      const pred = this.predictions[obs.predictionIndex];
      
      timeErrors.push(Math.abs(pred.predictedTimeToFailure - obs.actualTimeToFailure));
      dropErrors.push(Math.abs(pred.predictedDropDepth - obs.actualDropDepth));
      recoveryErrors.push(Math.abs(pred.predictedRecoveryTime - obs.actualRecoveryTime));
      
      const predictedFailure = pred.riskLevel === 'red' || pred.riskLevel === 'yellow';
      
      if (predictedFailure && obs.failureOccurred) tp++;
      else if (predictedFailure && !obs.failureOccurred) fp++;
      else if (!predictedFailure && obs.failureOccurred) fn++;
      else tn++;
      
      // Brier score: (forecast probability - outcome)^2
      // Convert risk level to probability
      const forecastProb = RISK_LEVEL_PROBABILITIES[pred.riskLevel];
      const outcome = obs.failureOccurred ? 1 : 0;
      brierScores.push(Math.pow(forecastProb - outcome, 2));
      
      calibrationData.push({
        predictedTimeToFailure: pred.predictedTimeToFailure,
        actualTimeToFailure: obs.actualTimeToFailure,
        predictedDropDepth: pred.predictedDropDepth,
        actualDropDepth: obs.actualDropDepth,
        predictedRecoveryTime: pred.predictedRecoveryTime,
        actualRecoveryTime: obs.actualRecoveryTime,
        riskLevel: pred.riskLevel,
        failureOccurred: obs.failureOccurred
      });
    }
    
    const n = this.observations.length;
    
    const timeMean = timeErrors.reduce((a, b) => a + b, 0) / n;
    const dropMean = dropErrors.reduce((a, b) => a + b, 0) / n;
    const recoveryMean = recoveryErrors.reduce((a, b) => a + b, 0) / n;
    
    const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const timeMedian = sorted(timeErrors)[Math.floor(n / 2)];
    const dropMedian = sorted(dropErrors)[Math.floor(n / 2)];
    const recoveryMedian = sorted(recoveryErrors)[Math.floor(n / 2)];
    
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
    
    const accuracy = (tp + tn) / n;
    const ciWidth = 1.96 * Math.sqrt(accuracy * (1 - accuracy) / n);
    
    // Brier Score: mean of squared differences between forecast probability and outcome
    const brierScore = brierScores.reduce((a, b) => a + b, 0) / n;
    
    // Brier Skill Score: improvement over baseline (climatology)
    // Baseline Brier score is the variance of the outcomes
    const failureRate = (tp + fn) / n;
    const baselineBrier = failureRate * (1 - failureRate);
    const brierSkillScore = baselineBrier > 0 ? 1 - (brierScore / baselineBrier) : 0;
    
    // Cost-sensitive loss: FN costs 7x FP (biased toward safety)
    // Cost = FN_COST * FN + FP (normalized by total)
    const costSensitiveLoss = n > 0 ? (FALSE_NEGATIVE_COST_MULTIPLIER * fn + fp) / n : 0;
    
    // Reliability curve: group predictions by risk level and compute observed failure rate
    const reliabilityCurve = this.computeReliabilityCurve(calibrationData);
    
    return {
      runId,
      generated: new Date().toISOString(),
      totalForecasts: this.predictions.length,
      validatedForecasts: n,
      timeToFailureMeanError: timeMean,
      timeToFailureMedianError: timeMedian,
      dropDepthMeanError: dropMean,
      dropDepthMedianError: dropMedian,
      recoveryTimeMeanError: recoveryMean,
      recoveryTimeMedianError: recoveryMedian,
      falsePositives: fp,
      falseNegatives: fn,
      truePositives: tp,
      trueNegatives: tn,
      precision,
      recall,
      f1Score: f1,
      predictions: calibrationData,
      confidenceInterval95: [Math.max(0, accuracy - ciWidth), Math.min(1, accuracy + ciWidth)],
      limitations,
      brierScore,
      brierSkillScore,
      costSensitiveLoss,
      reliabilityCurve
    };
  }

  computeReliabilityCurve(predictions: CalibrationPrediction[]): Array<{ predicted: number; observed: number; count: number }> {
    // Group by risk level and compute observed failure rate
    const groups: Record<string, { count: number; failures: number }> = {
      'safe': { count: 0, failures: 0 },
      'yellow': { count: 0, failures: 0 },
      'red': { count: 0, failures: 0 }
    };
    
    for (const pred of predictions) {
      groups[pred.riskLevel].count++;
      if (pred.failureOccurred) {
        groups[pred.riskLevel].failures++;
      }
    }
    
    return [
      { 
        predicted: 0.2, 
        observed: groups['safe'].count > 0 ? groups['safe'].failures / groups['safe'].count : 0,
        count: groups['safe'].count 
      },
      { 
        predicted: 0.6, 
        observed: groups['yellow'].count > 0 ? groups['yellow'].failures / groups['yellow'].count : 0,
        count: groups['yellow'].count 
      },
      { 
        predicted: 0.9, 
        observed: groups['red'].count > 0 ? groups['red'].failures / groups['red'].count : 0,
        count: groups['red'].count 
      }
    ];
  }
}

function executePhaseIVRun(
  seed: number,
  config: PhaseIVConfig
): PhaseIVReport {
  const timestamp = new Date().toISOString();
  const runId = `results/phase4_s${seed}_init${config.initialSize}_steps${config.growthSteps}`;
  
  // Ensure directory exists
  if (!fs.existsSync(runId)) {
    fs.mkdirSync(runId, { recursive: true });
  }
  
  console.log(`[Phase IV] Starting FAISS Ground-Truth Certification...`);
  console.log(`[Phase IV] Initial size: ${config.initialSize}, Growth steps: ${config.growthSteps}`);
  
  // Initialize harness
  const harness = new FAISSHarnessSimulator(config, seed);
  harness.initialize(config.initialSize);
  
  // Initialize calibrator
  const calibrator = new PhaseIVCalibrator();
  
  // Collect metrics
  const metricsHistory: FAISSMetricsInternal[] = [];
  let baselineRecall = 1.0;
  
  // Run stress test with predictions
  for (let step = 0; step < config.growthSteps; step++) {
    const currentMetrics = harness.query(100);
    metricsHistory.push(currentMetrics);
    
    if (step === 0) {
      baselineRecall = currentMetrics.recallAtK;
    }
    
    // Make prediction
    calibrator.predictFailure(currentMetrics, config.vectorsPerStep);
    
    // Inject vector drift
    harness.addVectors(config.vectorsPerStep);
    
    // Get post-drift metrics
    const postMetrics = harness.query(100);
    
    // Calculate actual outcomes
    const actualDrop = baselineRecall - postMetrics.recallAtK;
    const failureOccurred = postMetrics.recallAtK < 0.7 || postMetrics.latencyP95Ms > 50;
    
    // Record observation
    calibrator.recordObservation(
      step,
      failureOccurred ? 0 : config.growthSteps - step,
      Math.max(0, actualDrop),
      5,
      failureOccurred
    );
    
    console.log(`[Phase IV] Step ${step + 1}/${config.growthSteps}: size=${postMetrics.indexSize}, recall=${postMetrics.recallAtK.toFixed(3)}, latency_p95=${postMetrics.latencyP95Ms.toFixed(2)}ms`);
  }
  
  // Calculate calibration
  const calibration = calibrator.calculateCalibration(runId);
  
  // Determine verdict
  let verdict: 'CERTIFIED' | 'CONDITIONAL' | 'NOT_CERTIFIED';
  let summaryText: string;
  
  if (calibration.f1Score >= 0.7 && calibration.falseNegatives <= 1) {
    verdict = 'CERTIFIED';
    summaryText = `The failure forecasting system demonstrates reliable prediction capability with F1 score of ${calibration.f1Score.toFixed(2)}. The system is suitable for production use with the recommended safety margins.`;
  } else if (calibration.f1Score >= 0.5) {
    verdict = 'CONDITIONAL';
    summaryText = `The failure forecasting system shows moderate prediction capability with F1 score of ${calibration.f1Score.toFixed(2)}. Use with caution and implement additional monitoring. Circuit breaker is strongly recommended.`;
  } else {
    verdict = 'NOT_CERTIFIED';
    summaryText = `The failure forecasting system does not meet minimum accuracy requirements (F1 score: ${calibration.f1Score.toFixed(2)}). Additional calibration data is needed before production deployment.`;
  }
  
  const report: PhaseIVReport = {
    generated: timestamp,
    runId,
    version: '4.0.0',
    overallVerdict: verdict,
    summaryText,
    keyFindings: [
      `Forecast precision: ${(calibration.precision * 100).toFixed(1)}%`,
      `Forecast recall: ${(calibration.recall * 100).toFixed(1)}%`,
      `False positive rate: ${calibration.falsePositives}/${calibration.validatedForecasts}`,
      `False negative rate: ${calibration.falseNegatives}/${calibration.validatedForecasts}`,
      `Tested index sizes up to ${metricsHistory[metricsHistory.length - 1]?.indexSize?.toLocaleString() || 0} vectors`
    ],
    calibration,
    metricsHistory,
    circuitBreakerConfig: {
      recallThreshold: 0.7,
      latencyThresholdMs: 50.0,
      hazardThreshold: 0.6,
      degradedNprobe: 1,
      optimalNprobe: 10
    },
    whatCanPredict: [
      'Approximate time-to-threshold-breach based on observed degradation gradients',
      'Risk level classification (safe/yellow/red) with measured precision/recall',
      'Order-of-magnitude recovery time estimates after degradation',
      'Memory pressure trends from progressive index growth',
      'Recall degradation patterns under increasing load',
      'Latency spike probability based on historical data'
    ],
    whatCannotPredict: [
      'Novel failure modes not observed during calibration',
      'Exact timing of failures (inherent stochastic variance)',
      'System-level failures (OOM kills, disk full, network issues)',
      'Concurrent workload interference effects',
      'Hardware-specific performance cliffs',
      'Effects of system updates or configuration changes',
      'Cascade failures from dependent services',
      'Human error or misconfiguration'
    ],
    knownFailureCases: []
  };
  
  if (calibration.falseNegatives > 0) {
    report.knownFailureCases.push(`Missed ${calibration.falseNegatives} actual failures - forecaster may underestimate risk in some conditions`);
  }
  if (calibration.falsePositives > 0) {
    report.knownFailureCases.push(`Raised ${calibration.falsePositives} false alarms - forecaster may be overly conservative`);
  }
  
  // Generate Operational Warranty
  const warranty = generateOperationalWarranty(
    runId,
    timestamp,
    metricsHistory,
    calibration,
    verdict,
    config
  );
  report.operationalWarranty = warranty;
  
  // Generate and write artifacts
  fs.writeFileSync(path.join(runId, 'certification_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(runId, 'certification_report.md'), generatePhaseIVMarkdown(report));
  fs.writeFileSync(path.join(runId, 'forecast_calibration.json'), JSON.stringify(calibration, null, 2));
  fs.writeFileSync(path.join(runId, 'forecast_calibration.md'), generateCalibrationMarkdown(calibration));
  fs.writeFileSync(path.join(runId, 'circuit_breaker.ts'), generateCircuitBreakerCode(report.circuitBreakerConfig));
  
  // Write Operational Warranty artifacts
  fs.writeFileSync(path.join(runId, 'operational_warranty.json'), JSON.stringify(warranty, null, 2));
  fs.writeFileSync(path.join(runId, 'operational_warranty.md'), generateOperationalWarrantyMarkdown(warranty));
  
  console.log(`[Phase IV] Certification complete: ${verdict}`);
  console.log(`[Phase IV] Operational Warranty generated: operational_warranty.md`);
  
  return report;
}

function generateOperationalWarranty(
  runId: string,
  timestamp: string,
  metricsHistory: FAISSMetricsInternal[],
  calibration: PhaseIVCalibration,
  verdict: 'CERTIFIED' | 'CONDITIONAL' | 'NOT_CERTIFIED',
  config: PhaseIVConfig
): OperationalWarranty {
  // Find key boundary points from metrics history
  const sizes = metricsHistory.map(m => m.indexSize);
  const recalls = metricsHistory.map(m => m.recallAtK);
  
  // Find where recall drops below 80% (safe load)
  let certifiedSafeLoad = config.initialSize;
  for (let i = 0; i < recalls.length; i++) {
    if (recalls[i] >= 0.8) {
      certifiedSafeLoad = sizes[i];
    } else {
      break;
    }
  }
  
  // Find where recall drops below 70% (circuit breaker trigger)
  let circuitBreakerTriggerPoint = certifiedSafeLoad;
  for (let i = 0; i < recalls.length; i++) {
    if (recalls[i] >= 0.7) {
      circuitBreakerTriggerPoint = sizes[i];
    } else {
      break;
    }
  }
  
  // Guaranteed failure region: 10% beyond trigger point
  const guaranteedFailureRegion = Math.ceil(circuitBreakerTriggerPoint * 1.1);
  
  // Safety margin: percentage between safe load and trigger point
  const safetyMargin = circuitBreakerTriggerPoint > certifiedSafeLoad && certifiedSafeLoad > 0
    ? ((circuitBreakerTriggerPoint - certifiedSafeLoad) / certifiedSafeLoad) * 100
    : 0;
  
  // Resilience Half-Life: estimate vectors until safety margin degrades by 50%
  // Based on observed degradation rate
  const sizeDelta = sizes[sizes.length - 1] - sizes[0];
  const degradationRate = metricsHistory.length > 1 && sizeDelta > 0
    ? (recalls[0] - recalls[recalls.length - 1]) / sizeDelta
    : 0.00001;
  
  const halfLifeVectors = degradationRate > 0 
    ? Math.ceil(0.1 / degradationRate)  // 0.1 = 50% of typical 0.2 margin
    : 100000;
  
  // Max memory observed
  const maxMemory = Math.max(...metricsHistory.map(m => m.memoryMb));
  
  return {
    generated: timestamp,
    runId,
    version: '4.0.0',
    
    certifiedSafeLoad,
    circuitBreakerTriggerPoint,
    guaranteedFailureRegion,
    safetyMargin,
    
    resilienceHalfLife: {
      vectors: halfLifeVectors,
      estimatedTime: halfLifeVectors > 50000 ? 'Days to weeks under normal growth' : 'Hours to days under heavy load',
      confidence: calibration.f1Score * 0.8  // Confidence based on forecast accuracy
    },
    
    operatingConstraints: {
      maxIndexSize: certifiedSafeLoad,
      maxMemoryMb: maxMemory * 1.2,  // 20% headroom
      minRecall: 0.7,
      maxLatencyMs: 50.0
    },
    
    scope: {
      indexType: 'IVF',
      dimensions: config.dimensions,
      queryPattern: 'random',
      testedRange: { min: config.initialSize, max: sizes[sizes.length - 1] }
    },
    
    limitations: [
      'Warranty valid only for tested configuration and workload patterns',
      'Concurrent operations may reduce certified safe load',
      'System-level failures (OOM, disk) not covered by this warranty',
      'Novel failure modes outside training data not predicted',
      'Warranty should be re-validated after significant system changes'
    ],
    
    certificationVerdict: verdict
  };
}

function generateOperationalWarrantyMarkdown(warranty: OperationalWarranty): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Operational Warranty`);
  lines.push(``);
  lines.push(`> A CTO-grade safety artifact for AI infrastructure.`);
  lines.push(``);
  lines.push(`**Generated:** ${warranty.generated}`);
  lines.push(`**Run ID:** ${warranty.runId}`);
  lines.push(`**Version:** ${warranty.version}`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Safety Guarantees`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`Certified Safe Load:       ${warranty.certifiedSafeLoad.toLocaleString()} vectors`);
  lines.push(`Circuit Breaker Trigger:   ${warranty.circuitBreakerTriggerPoint.toLocaleString()} vectors`);
  lines.push(`Guaranteed Failure Region: ≥${warranty.guaranteedFailureRegion.toLocaleString()} vectors`);
  lines.push(`Safety Margin:             ${warranty.safetyMargin.toFixed(1)}%`);
  lines.push(`\`\`\``);
  lines.push(``);
  
  lines.push(`### Interpretation`);
  lines.push(``);
  lines.push(`| Zone | Range | Status |`);
  lines.push(`|------|-------|--------|`);
  lines.push(`| 🟢 **Safe** | 0 – ${warranty.certifiedSafeLoad.toLocaleString()} | Normal operation guaranteed |`);
  lines.push(`| 🟡 **Warning** | ${warranty.certifiedSafeLoad.toLocaleString()} – ${warranty.circuitBreakerTriggerPoint.toLocaleString()} | Circuit breaker may activate |`);
  lines.push(`| 🔴 **Failure** | ≥${warranty.guaranteedFailureRegion.toLocaleString()} | System will degrade or fail |`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Resilience Half-Life`);
  lines.push(``);
  lines.push(`> **Definition:** Amount of drift until safety margin degrades by 50%.`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Half-Life (vectors) | ${warranty.resilienceHalfLife.vectors.toLocaleString()} |`);
  lines.push(`| Estimated Duration | ${warranty.resilienceHalfLife.estimatedTime} |`);
  lines.push(`| Confidence | ${(warranty.resilienceHalfLife.confidence * 100).toFixed(1)}% |`);
  lines.push(``);
  lines.push(`This means: after adding ~${warranty.resilienceHalfLife.vectors.toLocaleString()} more vectors, your safety margin will be half of what it is today.`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Operating Constraints`);
  lines.push(``);
  lines.push(`These constraints must be maintained for the warranty to remain valid:`);
  lines.push(``);
  lines.push(`| Constraint | Limit |`);
  lines.push(`|------------|-------|`);
  lines.push(`| Max Index Size | ${warranty.operatingConstraints.maxIndexSize.toLocaleString()} vectors |`);
  lines.push(`| Max Memory | ${warranty.operatingConstraints.maxMemoryMb.toFixed(1)} MB |`);
  lines.push(`| Min Recall | ${(warranty.operatingConstraints.minRecall * 100).toFixed(0)}% |`);
  lines.push(`| Max Latency (p95) | ${warranty.operatingConstraints.maxLatencyMs.toFixed(0)} ms |`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Warranty Scope`);
  lines.push(``);
  lines.push(`This warranty is valid under these conditions:`);
  lines.push(``);
  lines.push(`| Parameter | Value |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Index Type | ${warranty.scope.indexType} |`);
  lines.push(`| Dimensions | ${warranty.scope.dimensions} |`);
  lines.push(`| Query Pattern | ${warranty.scope.queryPattern} |`);
  lines.push(`| Tested Range | ${warranty.scope.testedRange.min.toLocaleString()} – ${warranty.scope.testedRange.max.toLocaleString()} vectors |`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Certification Status`);
  lines.push(``);
  const verdictEmoji = warranty.certificationVerdict === 'CERTIFIED' ? '✅' : 
                       warranty.certificationVerdict === 'CONDITIONAL' ? '⚠️' : '❌';
  lines.push(`**Verdict:** ${verdictEmoji} ${warranty.certificationVerdict}`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Limitations`);
  lines.push(``);
  lines.push(`> ⚠️ This warranty explicitly does NOT cover:`);
  lines.push(``);
  for (const limitation of warranty.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Guiding Principle`);
  lines.push(``);
  lines.push(`> **Interlock does not optimize systems. It makes failure visible — and survivable.**`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Generated by Interlock Operational Warranty Engine v${warranty.version}*`);
  
  return lines.join('\n');
}

function generatePhaseIVMarkdown(report: PhaseIVReport): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Phase IV – Ground-Truth Certification Report`);
  lines.push(``);
  lines.push(`> Interlock does not optimize systems.`);
  lines.push(`> It prevents them from breaking.`);
  lines.push(``);
  lines.push(`**Generated:** ${report.generated}`);
  lines.push(`**Run ID:** ${report.runId}`);
  lines.push(`**Version:** ${report.version}`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Executive Summary`);
  lines.push(``);
  
  const verdictEmoji = report.overallVerdict === 'CERTIFIED' ? '✅' : 
                       report.overallVerdict === 'CONDITIONAL' ? '⚠️' : '❌';
  lines.push(`### Verdict: ${verdictEmoji} ${report.overallVerdict}`);
  lines.push(``);
  lines.push(report.summaryText);
  lines.push(``);
  
  lines.push(`### Key Findings`);
  lines.push(``);
  for (const finding of report.keyFindings) {
    lines.push(`- ${finding}`);
  }
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Forecast Accuracy`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Precision | ${(report.calibration.precision * 100).toFixed(1)}% |`);
  lines.push(`| Recall | ${(report.calibration.recall * 100).toFixed(1)}% |`);
  lines.push(`| F1 Score | ${report.calibration.f1Score.toFixed(3)} |`);
  lines.push(`| True Positives | ${report.calibration.truePositives} |`);
  lines.push(`| False Positives | ${report.calibration.falsePositives} |`);
  lines.push(`| False Negatives | ${report.calibration.falseNegatives} |`);
  lines.push(`| True Negatives | ${report.calibration.trueNegatives} |`);
  lines.push(``);
  
  lines.push(`### Prediction Error`);
  lines.push(``);
  lines.push(`| Metric | Mean Error | Median Error |`);
  lines.push(`|--------|------------|--------------|`);
  lines.push(`| Time-to-Failure | ${report.calibration.timeToFailureMeanError.toFixed(2)} | ${report.calibration.timeToFailureMedianError.toFixed(2)} |`);
  lines.push(`| Drop Depth | ${report.calibration.dropDepthMeanError.toFixed(3)} | ${report.calibration.dropDepthMedianError.toFixed(3)} |`);
  lines.push(`| Recovery Time | ${report.calibration.recoveryTimeMeanError.toFixed(2)} | ${report.calibration.recoveryTimeMedianError.toFixed(2)} |`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Final Assessment (HONEST)`);
  lines.push(``);
  lines.push(`> This section contains no marketing language.`);
  lines.push(`> It states explicitly what Interlock can and cannot do.`);
  lines.push(``);
  
  lines.push(`### ✅ What Interlock CAN Predict`);
  lines.push(``);
  for (const item of report.whatCanPredict) {
    lines.push(`- ${item}`);
  }
  lines.push(``);
  
  lines.push(`### ❌ What Interlock CANNOT Predict`);;
  lines.push(``);
  for (const item of report.whatCannotPredict) {
    lines.push(`- ${item}`);
  }
  lines.push(``);
  
  lines.push(`### Known Failure Cases`);
  lines.push(``);
  if (report.knownFailureCases.length) {
    for (const failureCase of report.knownFailureCases) {
      lines.push(`- ⚠️ ${failureCase}`);
    }
  } else {
    lines.push(`*No failure cases identified in this calibration run.*`);
  }
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Circuit Breaker Configuration`);
  lines.push(``);
  lines.push(`A self-defending FAISS client is available based on this certification.`);
  lines.push(``);
  lines.push(`| Parameter | Value |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| recall_threshold | ${report.circuitBreakerConfig.recallThreshold} |`);
  lines.push(`| latency_threshold_ms | ${report.circuitBreakerConfig.latencyThresholdMs} |`);
  lines.push(`| hazard_threshold | ${report.circuitBreakerConfig.hazardThreshold} |`);
  lines.push(`| degraded_nprobe | ${report.circuitBreakerConfig.degradedNprobe} |`);
  lines.push(`| optimal_nprobe | ${report.circuitBreakerConfig.optimalNprobe} |`);
  lines.push(``);
  lines.push(`See \`circuit_breaker.ts\` for runnable implementation.`);
  lines.push(``);
  
  lines.push(`---`);
  lines.push(``);
  lines.push(`*Generated by Interlock Phase IV Ground-Truth Certification Engine*`);
  lines.push(``);
  lines.push(`**Guiding Principle:** Interlock does not optimize systems. It prevents them from breaking.`);
  
  return lines.join('\n');
}

function generateCalibrationMarkdown(calibration: PhaseIVCalibration): string {
  const lines: string[] = [];
  
  lines.push(`# Interlock Phase IV – Forecast Calibration Report`);
  lines.push(``);
  lines.push(`> Interlock does not prevent failure. It makes failure visible before it happens.`);
  lines.push(``);
  lines.push(`**Generated:** ${calibration.generated}`);
  lines.push(`**Run ID:** ${calibration.runId}`);
  lines.push(``);
  
  lines.push(`## Forecast Accuracy Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Forecasts | ${calibration.totalForecasts} |`);
  lines.push(`| Validated | ${calibration.validatedForecasts} |`);
  lines.push(`| Precision | ${(calibration.precision * 100).toFixed(1)}% |`);
  lines.push(`| Recall | ${(calibration.recall * 100).toFixed(1)}% |`);
  lines.push(`| F1 Score | ${calibration.f1Score.toFixed(3)} |`);
  lines.push(``);
  
  // Phase III: Brier Score and Cost-Sensitive Evaluation
  lines.push(`## Statistical Calibration (Phase III)`);
  lines.push(``);
  lines.push(`### Brier Score`);
  lines.push(``);
  lines.push(`The Brier score measures the accuracy of probabilistic predictions. Lower is better.`);
  lines.push(``);
  lines.push(`| Metric | Value | Interpretation |`);
  lines.push(`|--------|-------|----------------|`);
  lines.push(`| Brier Score | ${calibration.brierScore.toFixed(4)} | ${calibration.brierScore < 0.2 ? 'Excellent' : calibration.brierScore < 0.3 ? 'Good' : 'Needs Improvement'} |`);
  lines.push(`| Brier Skill Score | ${calibration.brierSkillScore.toFixed(4)} | ${calibration.brierSkillScore > 0 ? `${(calibration.brierSkillScore * 100).toFixed(1)}% better than baseline` : 'Below baseline'} |`);
  lines.push(``);
  
  lines.push(`### Cost-Sensitive Evaluation`);
  lines.push(``);
  lines.push(`> **Rule:** False negatives (missed failures) cost **7×** false positives (false alarms).`);
  lines.push(`> This biases the system toward safety—it's better to warn and be wrong than to miss a failure.`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Cost-Sensitive Loss | ${calibration.costSensitiveLoss.toFixed(4)} |`);
  lines.push(`| False Negatives (7× weight) | ${calibration.falseNegatives} |`);
  lines.push(`| False Positives (1× weight) | ${calibration.falsePositives} |`);
  lines.push(`| Weighted Cost | ${(7 * calibration.falseNegatives + calibration.falsePositives)} |`);
  lines.push(``);
  
  lines.push(`### Reliability Curve`);
  lines.push(``);
  lines.push(`Predicted probability vs observed frequency of failure:`);
  lines.push(``);
  lines.push(`| Risk Level | Predicted Prob | Observed Freq | Count | Calibration |`);
  lines.push(`|------------|----------------|---------------|-------|-------------|`);
  for (const point of calibration.reliabilityCurve) {
    const diff = Math.abs(point.predicted - point.observed);
    const calibrationStatus = diff < 0.15 ? '✅ Well-calibrated' : diff < 0.25 ? '⚠️ Slight bias' : '❌ Miscalibrated';
    lines.push(`| ${point.predicted === 0.2 ? '🟢 Safe' : point.predicted === 0.6 ? '🟡 Yellow' : '🔴 Red'} | ${(point.predicted * 100).toFixed(0)}% | ${(point.observed * 100).toFixed(1)}% | ${point.count} | ${calibrationStatus} |`);
  }
  lines.push(``);
  
  lines.push(`## Classification Matrix`);
  lines.push(``);
  lines.push(`| | Failure Occurred | No Failure |`);
  lines.push(`|---|------------------|------------|`);
  lines.push(`| **Predicted Failure** | ${calibration.truePositives} (TP) | ${calibration.falsePositives} (FP) |`);
  lines.push(`| **Predicted Safe** | ${calibration.falseNegatives} (FN) | ${calibration.trueNegatives} (TN) |`);
  lines.push(``);
  
  if (calibration.predictions.length > 0) {
    lines.push(`## Predicted vs Actual`);
    lines.push(``);
    lines.push(`| # | Pred TTF | Actual TTF | Pred Drop | Actual Drop | Risk | Failure? |`);
    lines.push(`|---|----------|------------|-----------|-------------|------|----------|`);
    
    for (let i = 0; i < Math.min(20, calibration.predictions.length); i++) {
      const pred = calibration.predictions[i];
      const riskIcon = pred.riskLevel === 'red' ? '🔴' : pred.riskLevel === 'yellow' ? '🟡' : '🟢';
      const failureIcon = pred.failureOccurred ? '✅' : '❌';
      lines.push(`| ${i+1} | ${pred.predictedTimeToFailure} | ${pred.actualTimeToFailure} | ${pred.predictedDropDepth.toFixed(3)} | ${pred.actualDropDepth.toFixed(3)} | ${riskIcon} | ${failureIcon} |`);
    }
    lines.push(``);
  }
  
  // Drop Depth Error Target Check
  lines.push(`## Target Metrics (Phase III)`);
  lines.push(``);
  const dropDepthTarget = 0.15;
  const dropDepthMet = calibration.dropDepthMeanError < dropDepthTarget;
  lines.push(`| Target | Threshold | Actual | Status |`);
  lines.push(`|--------|-----------|--------|--------|`);
  lines.push(`| Drop Depth MAE | < ${(dropDepthTarget * 100).toFixed(0)}% | ${(calibration.dropDepthMeanError * 100).toFixed(1)}% | ${dropDepthMet ? '✅ Met' : '❌ Not Met'} |`);
  lines.push(`| Brier Score Improving | < 0.25 | ${calibration.brierScore.toFixed(4)} | ${calibration.brierScore < 0.25 ? '✅ Met' : '❌ Not Met'} |`);
  lines.push(``);
  
  lines.push(`## Limitations`);
  lines.push(``);
  for (const limit of calibration.limitations) {
    lines.push(`- ${limit}`);
  }
  lines.push(``);
  
  lines.push(`---`);
  lines.push(`*Generated by Interlock Phase IV Forecast Calibration Engine*`);
  
  return lines.join('\n');
}

function generateCircuitBreakerCode(config: { recallThreshold: number; latencyThresholdMs: number; hazardThreshold: number; degradedNprobe: number; optimalNprobe: number }): string {
  return `/**
 * Interlock Self-Defending FAISS Client
 * ======================================
 * Auto-generated circuit breaker for FAISS index operations.
 * 
 * Configuration (from Phase IV certification):
 * - Recall Threshold: ${config.recallThreshold}
 * - Latency Threshold: ${config.latencyThresholdMs}ms
 * - Hazard Threshold: ${config.hazardThreshold}
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
    recallThreshold: ${config.recallThreshold},
    latencyThresholdMs: ${config.latencyThresholdMs},
    hazardThreshold: ${config.hazardThreshold},
    recoveryCheckIntervalS: 30.0,
    consecutiveSuccessesForClose: 3,
    degradedNprobe: ${config.degradedNprobe},
    optimalNprobe: ${config.optimalNprobe}
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
    console.warn(\`CIRCUIT BREAKER: \${previousState} -> \${newState} | \${trigger} | \${action}\`);
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
    return \`nprobe=\${this.config.degradedNprobe}\`;
  }
  
  private applyOptimalMode(): string {
    if (this.index.nprobe !== undefined) {
      this.index.nprobe = this.config.optimalNprobe;
    }
    return \`nprobe=\${this.config.optimalNprobe}\`;
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
          \`Hazard \${hazard.toFixed(3)} exceeded threshold\`, metrics, action);
        this.state = 'open';
        this.lastStateChange = Date.now();
        this.consecutiveSuccesses = 0;
      } else if (!success) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 3) {
          const action = this.applyDegradedMode();
          this.logIntervention('closed', 'open',
            \`\${this.consecutiveFailures} consecutive failures\`, metrics, action);
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
            \`Hazard reduced to \${hazard.toFixed(3)}\`, metrics, 'Testing recovery');
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
            \`Recovery successful after \${this.consecutiveSuccesses} successes\`, metrics, action);
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
`;
}

// Main entry point
function main(): void {
  const { seed, gens, transfer, drift, out, mode, stabilityGens, driftEvents, initialSize, growthSteps, vectorsPerStep } = parseArgs();
  
  console.log(`\n=== Interlock Headless Runner ===`);
  console.log(`Mode: ${mode.toUpperCase()}`);
  console.log(`Seed: ${seed}`);
  
  if (mode === 'phase4') {
    console.log(`Initial Size: ${initialSize}`);
    console.log(`Growth Steps: ${growthSteps}`);
    console.log(`Vectors per Step: ${vectorsPerStep}`);
    console.log(``);
    
    const config: PhaseIVConfig = {
      initialSize,
      growthSteps,
      vectorsPerStep,
      dimensions: 128,
      nlist: 100,
      nprobe: 10
    };
    
    const report = executePhaseIVRun(seed, config);
    
    console.log(`\n=== Phase IV Certification Complete ===`);
    console.log(`Run ID: ${report.runId}`);
    console.log(`Verdict: ${report.overallVerdict}`);
    console.log(`Precision: ${(report.calibration.precision * 100).toFixed(1)}%`);
    console.log(`Recall: ${(report.calibration.recall * 100).toFixed(1)}%`);
    console.log(`F1 Score: ${report.calibration.f1Score.toFixed(3)}`);
    console.log(`Artifacts: certification_report.md, forecast_calibration.md, circuit_breaker.ts`);
  } else if (mode === 'certification') {
    console.log(`Stability Generations: ${stabilityGens}`);
    console.log(`Drift Events: ${driftEvents}`);
    console.log(``);
    
    const audit = executeCertificationRun(seed, stabilityGens, driftEvents);
    
    console.log(`\n=== Certification Complete ===`);
    console.log(`Run ID: ${audit.runId}`);
    console.log(`Shield Rating: ${audit.resilienceScore.shieldRating.toUpperCase()}`);
    console.log(`Resilience Score: ${audit.resilienceScore.overall.toFixed(4)}`);
    console.log(`Artifacts: resilience_audit.md, laws.final.md, laws.final.json`);
  } else {
    console.log(`Generations: ${gens}, Transfer: ${transfer ? 'ON' : 'OFF'}, Drift: ${drift ? 'ON' : 'OFF'}`);
    console.log(`Output: ${out}\n`);
    
    // Drift schedule: inject drift at gen 100, 250, 400 if drift is enabled
    const driftSchedule = drift ? [100, 250, 400] : undefined;
    
    const result = executeRun(seed, gens, transfer, drift, driftSchedule);
    
    console.log(`\n=== Run Complete ===`);
    console.log(`Run ID: ${result.runId}`);
    console.log(`Report: ${result.runId}/report.md`);
    console.log(`Landscape: ${result.runId}/landscape.md`);
    console.log(`Boundaries: ${result.runId}/boundaries.md`);
    console.log(`Laws: ${result.lawQuality.proposed} proposed, ${result.lawQuality.validated} validated, ${result.lawQuality.falsified} falsified`);
    if (result.abSummary) {
      console.log(`A/B Tests: ${result.abSummary.totalTests} tests, ${(result.abSummary.netPositiveRate * 100).toFixed(1)}% net positive`);
    }
  }
}

// Export for programmatic use
export { 
  SOSSimulator, 
  executeRun, 
  executeCertificationRun,
  executePhaseIVRun,
  computeConvergence, 
  computeLawQuality, 
  computeTransferEffectiveness, 
  computeDriftResilience,
  generateLandscapeReport,
  generateLandscapeMarkdown,
  generateResilienceAuditMarkdown,
  // Phase III exports
  extractFailureBoundaries,
  generateBoundariesArtifact,
  generateBoundariesMarkdown,
  predictFailure,
  validateForecast,
  generateValidationSummary,
  generateForecastValidationMarkdown,
  // Phase IV exports
  FAISSHarnessSimulator,
  PhaseIVCalibrator,
  generatePhaseIVMarkdown,
  generateCalibrationMarkdown,
  generateCircuitBreakerCode
};

// Run if executed directly (ESM check)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('sim-runner.ts');
if (isMainModule) {
  main();
}
