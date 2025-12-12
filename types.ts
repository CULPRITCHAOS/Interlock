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

// Enhanced Law interface with falsifiable properties
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
