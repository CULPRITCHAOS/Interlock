/**
 * Interlock Phase IV: FAISS Ground-Truth Certification Types
 * ==========================================================
 * TypeScript type definitions for Phase IV features:
 * - Real FAISS harness integration
 * - Physical drift injection
 * - Forecast calibration
 * - Circuit breaker export
 * - Certification report
 */

// ============= FAISS Harness Types =============

export type IndexType = 'Flat' | 'IVF' | 'HNSW' | 'PQ';

export interface FAISSConfig {
  indexType: IndexType;
  dimensions: number;
  nlist: number;        // Number of clusters for IVF
  nprobe: number;       // Number of clusters to search
  mHnsw: number;        // HNSW M parameter
  efSearch: number;     // HNSW search parameter
  nPq: number;          // PQ subquantizers
}

export interface FAISSMetrics {
  recallAtK: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  memoryMb: number;
  indexSize: number;
  queryCount: number;
  error?: string;
}

export interface StressTestResult {
  testId: string;
  initialSize: number;
  finalSize: number;
  metricsHistory: FAISSMetrics[];
  failureIteration?: number;
  failureReason?: string;
  dropDepth: number;
  recoveryTime: number;
  predictedFailure?: number;
  predictedDropDepth: number;
  predictedRecoveryTime: number;
}

// ============= Forecast Calibration Types =============

export interface CalibrationPrediction {
  predictedTimeToFailure: number;
  actualTimeToFailure: number;
  predictedDropDepth: number;
  actualDropDepth: number;
  predictedRecoveryTime: number;
  actualRecoveryTime: number;
  riskLevel: 'safe' | 'yellow' | 'red';
  failureOccurred: boolean;
}

export interface ForecastCalibration {
  runId: string;
  generated: string;
  totalForecasts: number;
  validatedForecasts: number;
  
  // Error metrics
  timeToFailureMeanError: number;
  timeToFailureMedianError: number;
  dropDepthMeanError: number;
  dropDepthMedianError: number;
  recoveryTimeMeanError: number;
  recoveryTimeMedianError: number;
  
  // Classification metrics
  falsePositives: number;
  falseNegatives: number;
  truePositives: number;
  trueNegatives: number;
  
  // Precision/Recall
  precision: number;
  recall: number;
  f1Score: number;
  
  // Calibration data
  predictions: CalibrationPrediction[];
  
  // Confidence bounds
  confidenceInterval95: [number, number];
  
  // Known limitations
  limitations: string[];
}

// ============= Circuit Breaker Types =============

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  recallThreshold: number;
  latencyThresholdMs: number;
  hazardThreshold: number;
  recoveryCheckIntervalS: number;
  consecutiveSuccessesForClose: number;
  degradedNprobe: number;
  degradedEfSearch: number;
  optimalNprobe: number;
  optimalEfSearch: number;
}

export interface Intervention {
  timestamp: number;
  previousState: CircuitState;
  newState: CircuitState;
  trigger: string;
  metrics: {
    recall: number;
    latencyMs: number;
    hazard: number;
  };
  actionTaken: string;
}

export interface CircuitBreakerState {
  state: CircuitState;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalInterventions: number;
  recentAvgRecall: number;
  recentAvgLatencyMs: number;
  hazardScore: number;
}

// ============= Failure Boundary Types =============

export interface FailureBoundaryMap {
  boundaryId: string;
  parameter: string;
  criticalValue: number;
  safeRange: [number, number];
  unsafeRange: [number, number];
  abruptness: number;
  observedConsequences: string[];
  confidence: number;
}

// ============= Safe Operating Zone Types =============

export interface SafeOperatingZone {
  zoneId: string;
  parameters: Record<string, [number, number]>;
  expectedRecall: [number, number];
  expectedLatencyMs: [number, number];
  confidence: number;
  notes: string[];
}

// ============= Safety Margin Types =============

export interface SafetyMargin {
  parameter: string;
  currentValue: number;
  recommendedMin: number;
  recommendedMax: number;
  marginPercent: number;
  rationale: string;
}

// ============= Unsafe Region Types =============

export interface UnsafeRegion {
  regionId: string;
  parameters: Record<string, [number, number]>;
  failureMode: string;
  severity: 'warning' | 'critical';
  observedFailures: number;
  mitigation: string;
}

// ============= Certification Report Types =============

export type CertificationVerdict = 'CERTIFIED' | 'CONDITIONAL' | 'NOT_CERTIFIED';

export interface CertificationReport {
  generated: string;
  runId: string;
  version: string;
  
  // Executive Summary
  overallVerdict: CertificationVerdict;
  summaryText: string;
  keyFindings: string[];
  
  // Forecast Calibration
  calibration?: ForecastCalibration;
  
  // Boundaries and Zones
  failureBoundaries: FailureBoundaryMap[];
  safeOperatingZones: SafeOperatingZone[];
  safetyMargins: SafetyMargin[];
  unsafeRegions: UnsafeRegion[];
  
  // Metrics History
  metricsHistory: FAISSMetrics[];
  
  // Circuit Breaker Config
  circuitBreakerConfig?: CircuitBreakerConfig;
  
  // Honest Assessment
  whatCanPredict: string[];
  whatCannotPredict: string[];
  confidenceBounds: Record<string, [number, number]>;
  knownFailureCases: string[];
}

// ============= Phase IV Run Configuration =============

export interface PhaseIVConfig {
  // FAISS harness config
  faissConfig: FAISSConfig;
  
  // Stress test parameters
  initialSize: number;
  growthSteps: number;
  vectorsPerStep: number;
  
  // Drift injection
  enableVectorDrift: boolean;
  enableQuerySpike: boolean;
  enableRebuildPressure: boolean;
  
  // Calibration
  runCalibration: boolean;
  
  // Circuit breaker
  generateCircuitBreaker: boolean;
  
  // Output
  generateReport: boolean;
  outputDir: string;
}

// ============= Default Configurations =============

export const DEFAULT_FAISS_CONFIG: FAISSConfig = {
  indexType: 'IVF',
  dimensions: 128,
  nlist: 100,
  nprobe: 10,
  mHnsw: 32,
  efSearch: 64,
  nPq: 8
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  recallThreshold: 0.7,
  latencyThresholdMs: 50.0,
  hazardThreshold: 0.6,
  recoveryCheckIntervalS: 30.0,
  consecutiveSuccessesForClose: 3,
  degradedNprobe: 1,
  degradedEfSearch: 16,
  optimalNprobe: 10,
  optimalEfSearch: 64
};

export const DEFAULT_PHASE_IV_CONFIG: PhaseIVConfig = {
  faissConfig: DEFAULT_FAISS_CONFIG,
  initialSize: 10000,
  growthSteps: 10,
  vectorsPerStep: 10000,
  enableVectorDrift: true,
  enableQuerySpike: true,
  enableRebuildPressure: false,
  runCalibration: true,
  generateCircuitBreaker: true,
  generateReport: true,
  outputDir: 'results'
};

// ============= Predictable/Unpredictable Items =============

export const WHAT_CAN_PREDICT: string[] = [
  'Approximate time-to-threshold-breach based on observed degradation gradients',
  'Risk level classification (safe/yellow/red) with measured precision/recall',
  'Order-of-magnitude recovery time estimates after degradation',
  'Memory pressure trends from progressive index growth',
  'Recall degradation patterns under increasing load',
  'Latency spike probability based on historical data'
];

export const WHAT_CANNOT_PREDICT: string[] = [
  'Novel failure modes not observed during calibration',
  'Exact timing of failures (inherent stochastic variance)',
  'System-level failures (OOM kills, disk full, network issues)',
  'Concurrent workload interference effects',
  'Hardware-specific performance cliffs',
  'Effects of system updates or configuration changes',
  'Cascade failures from dependent services',
  'Human error or misconfiguration'
];

export const CALIBRATION_LIMITATIONS: string[] = [
  'Predictions based on observed degradation gradients only',
  'Novel failure modes not in training data cannot be predicted',
  'Confidence degrades for configurations not previously observed',
  'Recovery predictions assume no manual interventions',
  'Cascade effects from concurrent operations not modeled',
  'Memory pressure from system processes not accounted for'
];
