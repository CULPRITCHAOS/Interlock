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

// Workload Fingerprint - defines the scope signature for a law
export interface WorkloadFingerprint {
  datasetSize: number;          // e.g., 10000 vectors
  dimensions: number;           // e.g., 128 dims
  queryPattern: 'random' | 'clustered' | 'sequential';
  targetMetric: 'recall' | 'latency' | 'memory';
  k: number;                    // top-k for recall@k
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
}
