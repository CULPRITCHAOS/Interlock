import { Law, BenchmarkConfig, WorkloadFingerprint } from './types';

export const DOMAINS = ['faiss', 'compression', 'postgres', 'prompts'];

// Default workload fingerprint for FAISS domain (our primary measurable target)
export const DEFAULT_FAISS_FINGERPRINT: WorkloadFingerprint = {
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

// Default benchmark configuration for reproducible runs
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  seed: 42,                     // Fixed seed for reproducibility
  datasetSize: 10000,
  dimensions: 128,
  queryCount: 100,
  runs: 5,                      // 5 repeated runs to measure variance
  workloadFingerprint: DEFAULT_FAISS_FINGERPRINT
};

export const INITIAL_LAWS: Law[] = [
  {
    id: 'law-001',
    domain: 'faiss',
    description: 'HNSW M > 32 yields diminishing recall returns',
    confidence: 0.85,
    discoveredAt: 1,
    version: 1,
    status: 'validated',
    scopeSignature: DEFAULT_FAISS_FINGERPRINT,
    trialResults: [
      { trialId: 't001', generation: 1, success: true, observedValue: 0.92, expectedRange: [0.85, 0.95] }
    ],
    counterexamples: [],
    lastValidatedAt: 1,
    evidenceCount: 1
  },
  {
    id: 'law-002',
    domain: 'postgres',
    description: 'work_mem correlates linearly with hash_agg performance',
    confidence: 0.92,
    discoveredAt: 3,
    version: 1,
    status: 'validated',
    scopeSignature: {
      domain: 'postgres',
      datasetSize: 100000,
      dimensions: 1,
      queryPattern: 'sequential',
      targetMetric: 'latency',
      k: 1,
      constraintRegime: {
        maxLatencyMs: 100,
        maxMemoryMb: 1024
      }
    },
    trialResults: [
      { trialId: 't002', generation: 3, success: true, observedValue: 0.88, expectedRange: [0.80, 0.95] }
    ],
    counterexamples: [],
    lastValidatedAt: 3,
    evidenceCount: 1
  }
];

export const MOCK_INSIGHTS = [
  "Emergent Strategy: Adaptive Gaussian sampling is outperforming Uniform.",
  "Parameter Drift: Alpha converging towards 2.8 for high-dimensional vector spaces.",
  "Law Discovery: New correlation found between compression_level and cpu_time.",
  "Meta-Learning: Increased mutation rate for static surrogates.",
  "System: Cross-pollinating Postgres laws to Redis domain."
];
