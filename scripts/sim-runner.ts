/**
 * LawForge - Headless Simulation Runner
 * =============================================
 * Run long-horizon deterministic experiments with detailed logging.
 * 
 * Usage:
 *   npx tsx scripts/sim-runner.ts --seed 42 --gens 500 --transfer on --drift off --out results/run_001
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
      lastValidatedAt: this.generation
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
  
  lines.push(`# LawForge Run Report`);
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
  lines.push(`*Generated by LawForge Benchmark Harness*`);
  
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
    version: law.version
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
  
  lines.push(`# LawForge - Discovered Laws`);
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
      lines.push(`- **${law.id}:** ${law.description} (${law.evidence.counterexamples} counterexamples)`);
    }
    lines.push(``);
  }
  
  // Deprecated laws
  if (byStatus.deprecated.length > 0) {
    lines.push(`## ⚠️ Deprecated Laws`);
    lines.push(``);
    for (const law of byStatus.deprecated) {
      lines.push(`- **${law.id}:** ${law.description} (confidence: ${(law.confidence * 100).toFixed(1)}%)`);
    }
    lines.push(``);
  }
  
  // Hypothesis laws (top 10 by confidence)
  if (byStatus.hypothesis.length > 0) {
    lines.push(`## 🔬 Hypothesis (Pending Validation)`);
    lines.push(``);
    for (const law of byStatus.hypothesis.sort((a, b) => b.confidence - a.confidence).slice(0, 10)) {
      lines.push(`- **${law.id}:** ${law.description} (confidence: ${(law.confidence * 100).toFixed(1)}%)`);
    }
    if (byStatus.hypothesis.length > 10) {
      lines.push(`- ... and ${byStatus.hypothesis.length - 10} more`);
    }
    lines.push(``);
  }
  
  lines.push(`---`);
  lines.push(`*Generated by LawForge*`);
  
  return lines.join('\n');
}

// ============= Main Execution =============

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
  
  // Write ab_summary.json
  if (abSummary) {
    fs.writeFileSync(path.join(runId, 'ab_summary.json'), JSON.stringify(abSummary, null, 2));
  }
  
  // Generate report
  const report = generateMarkdownReport(config, convergence, lawQuality, transferEff, driftRes, abSummary);
  fs.writeFileSync(path.join(runId, 'report.md'), report);
  
  return { runId, config, convergence, lawQuality, transferEff, driftRes, abSummary, report };
}

// Parse command line arguments
function parseArgs(): { seed: number; gens: number; transfer: boolean; drift: boolean; out: string } {
  const args = process.argv.slice(2);
  let seed = 42;
  let gens = 500;
  let transfer = false;
  let drift = false;
  let out = 'results/default';
  
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
    }
  }
  
  return { seed, gens, transfer, drift, out };
}

// Main entry point
function main(): void {
  const { seed, gens, transfer, drift, out } = parseArgs();
  
  console.log(`\n=== LawForge Headless Runner ===`);
  console.log(`Seed: ${seed}, Generations: ${gens}, Transfer: ${transfer ? 'ON' : 'OFF'}, Drift: ${drift ? 'ON' : 'OFF'}`);
  console.log(`Output: ${out}\n`);
  
  // Drift schedule: inject drift at gen 100, 250, 400 if drift is enabled
  const driftSchedule = drift ? [100, 250, 400] : undefined;
  
  const result = executeRun(seed, gens, transfer, drift, driftSchedule);
  
  console.log(`\n=== Run Complete ===`);
  console.log(`Run ID: ${result.runId}`);
  console.log(`Report: ${result.runId}/report.md`);
  console.log(`Laws: ${result.lawQuality.proposed} proposed, ${result.lawQuality.validated} validated, ${result.lawQuality.falsified} falsified`);
  if (result.abSummary) {
    console.log(`A/B Tests: ${result.abSummary.totalTests} tests, ${(result.abSummary.netPositiveRate * 100).toFixed(1)}% net positive`);
  }
}

// Export for programmatic use
export { SOSSimulator, executeRun, computeConvergence, computeLawQuality, computeTransferEffectiveness, computeDriftResilience };

// Run if executed directly (ESM check)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('sim-runner.ts');
if (isMainModule) {
  main();
}
