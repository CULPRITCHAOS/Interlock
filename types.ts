export interface SOSGenome {
  id: string;
  generation: number;
  domain: string;
  alpha: number; // P(valid) exponent
  explorationBonus: number;
  sampleStrategy: 'uniform' | 'gaussian' | 'adaptive' | 'exploit';
  ridgeAlpha: number;
  fitness: number;
  originDomain?: string; // Tracks where the strategy came from
}

// Constraint regime defines operational boundaries
export interface ConstraintRegime {
  maxLatencyMs?: number;        // Upper bound on latency
  minRecall?: number;           // Lower bound on recall
  maxMemoryMb?: number;         // Memory limit
  batchSizeRange?: [number, number]; // Min/max batch size
}

// Extended Workload Fingerprint - defines the complete scope signature for a law
export interface WorkloadFingerprint {
  domain: string;               // Domain this fingerprint applies to
  datasetSize: number;          // e.g., 10000 vectors
  dimensions: number;           // e.g., 128 dims
  queryPattern: 'random' | 'clustered' | 'sequential';
  targetMetric: 'recall' | 'latency' | 'memory';
  k: number;                    // top-k for recall@k
  constraintRegime?: ConstraintRegime; // Operational constraints
}

// Counterexample tracking for when a law fails
export interface LawCounterexample {
  id: string;
  observedAt: number;           // generation when observed
  workloadFingerprint: WorkloadFingerprint;
  expectedOutcome: string;
  actualOutcome: string;
  severity: 'minor' | 'major' | 'critical';
}

// Trial result for repeated confidence measurement
export interface LawTrialResult {
  trialId: string;
  generation: number;
  success: boolean;
  observedValue: number;
  expectedRange: [number, number];
}

// Confidence decay event for tracking why confidence dropped
export interface ConfidenceDecayEvent {
  generation: number;
  reason: 'drift' | 'scope_change' | 'contradiction' | 'time_decay';
  decayAmount: number;
  previousConfidence: number;
  newConfidence: number;
}

// Law taxonomy classification
export type LawType = 'structural' | 'soft' | 'regime-bound';

// Enhanced Law interface with falsifiable properties and taxonomy
export interface Law {
  id: string;
  domain: string;
  description: string;
  confidence: number;
  discoveredAt: number;         // generation
  isUniversal?: boolean;        // True if law applies across domains
  // Falsifiable law additions
  version: number;              // Law versioning
  scopeSignature?: WorkloadFingerprint;  // Scope where law applies
  trialResults?: LawTrialResult[];       // Track repeated trials
  counterexamples?: LawCounterexample[]; // When law fails
  lastValidatedAt?: number;     // Last generation where validated
  status: 'hypothesis' | 'validated' | 'falsified' | 'deprecated';
  // Confidence decay tracking
  confidenceHistory?: ConfidenceDecayEvent[];  // Track confidence changes over time
  evidenceCount?: number;       // Total evidence supporting the law
  // Law Taxonomy (Phase II)
  lawType?: LawType;            // structural=hard constraint, soft=performance gradient, regime-bound=valid under certain drift
  // Half-life metrics (Phase II)
  halfLife?: number;            // Generations law survives under perturbation
  churnRate?: number;           // Rate of invalidation under drift (0-1)
}

export interface SimulationLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'system' | 'transfer';
  message: string;
}

export interface ChartDataPoint {
  generation: number;
  [key: string]: number; // Allow dynamic access for domains (faiss, postgres, etc.)
}

export interface CrossDomainInsight {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  strategy: string;
  impact: string; // "Positive" | "Neutral" | "Negative"
}

// Benchmark Configuration for reproducible runs
export interface BenchmarkConfig {
  seed: number;                 // Deterministic random seed
  datasetSize: number;
  dimensions: number;
  queryCount: number;
  runs: number;                 // Number of repeated runs
  workloadFingerprint: WorkloadFingerprint;
}

// Benchmark run result with variance tracking
export interface BenchmarkRunResult {
  runId: string;
  seed: number;
  generation: number;
  metrics: {
    recall: number;             // recall@k
    latencyMs: number;          // query latency
    memoryMb: number;           // memory usage
  };
  variance: {
    recall: number;
    latency: number;
    memory: number;
  };
  timestamp: string;
}

// A/B Test result for transfer comparison
export interface TransferABTestResult {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  baselineMetrics: {
    timeToThreshold: number;    // Generations to reach fitness threshold
    bestAchieved: number;       // Best fitness achieved
    regret: number;             // Cumulative regret
  };
  transferMetrics: {
    timeToThreshold: number;
    bestAchieved: number;
    regret: number;
  };
  improvement: {
    timeToThreshold: number;    // % improvement
    bestAchieved: number;
    regret: number;
  };
  isNetPositive: boolean;       // Overall determination
  confidence: number;           // Statistical confidence
  completedAt: number;          // Generation when test completed
  // Law-gated transfer additions
  lawGated?: boolean;           // Whether transfer was law-gated
  scopeSimilarity?: number;     // Similarity score (0-1) if law-gated
}

// Law stress test result
export interface LawStressTestResult {
  lawId: string;
  lawDescription: string;
  testGeneration: number;
  // Violation parameters
  violationType: 'boundary_push' | 'parameter_extreme' | 'scope_violation';
  violationMagnitude: number;   // How far beyond the boundary
  // Performance metrics
  degradationSlope: number;     // Performance drop rate
  recoveryTime: number;         // Generations to recover
  didRevalidate: boolean;       // Whether law re-validated after rollback
  // Classification
  brittlenessScore: number;     // 0-1, higher = more brittle
  constraintType: 'hard' | 'soft';
}

// Law export format
export interface LawExport {
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
    confidenceHistory: number[];  // Last N confidence values
  };
  status: 'validated' | 'falsified' | 'deprecated' | 'hypothesis';
  confidence: number;
  discoveredAt: number;
  lastValidatedAt: number;
  version: number;
  // Law Taxonomy (Phase II)
  lawType?: LawType;            // Classification: structural, soft, or regime-bound
  // Half-life metrics (Phase II)
  halfLife?: number;            // Generations law survives under perturbation
  churnRate?: number;           // Rate of invalidation under drift
}

// Final laws artifact format
export interface LawsFinalArtifact {
  generated: string;            // ISO timestamp
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
export interface Region {
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
export interface Boundary {
  id: string;
  domain: string;
  fromRegion: string;           // Region ID
  toRegion: string;             // Region ID
  transitionParameter: string;  // Parameter that triggers the transition
  transitionValue: number;      // Value at which transition occurs
  abruptness: number;           // 0-1, how sharp is the transition
  lawsInvalidated: string[];    // Laws that break at this boundary
}

// Optimization Landscape Report - LawForge's scientific core
export interface LandscapeReport {
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
export interface RecoveryCurvePoint {
  generation: number;
  fitness: number;
  lawsValid: number;
  lawsInvalid: number;
}

// Single drift injection result
export interface DriftInjectionResult {
  injectedAt: number;           // Generation when drift was injected
  domain: string;
  preFitness: number;
  dropDepth: number;            // Max fitness drop (0-1)
  recoveryTime: number;         // Generations to recover to 90% of pre-drift
  lawsInvalidatedCount: number;
  recoveryCurve: RecoveryCurvePoint[];
}

// Resilience Score calculation
export interface ResilienceScore {
  overall: number;              // (1 - DropDepth) / RecoveryTime
  byDomain: Record<string, number>;
  shieldRating: 'green' | 'yellow' | 'red';  // green: ≥0.08, yellow: ≥0.04, red: <0.04
}

// Resilience Audit Report
export interface ResilienceAudit {
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
