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

/**
 * Tiered Certification Verdicts (Phase D7)
 * 
 * Each certificate must include:
 * - Confidence bounds
 * - Known blind spots
 * - Explicit "what this does NOT guarantee"
 */
export type CertificationVerdict = 
  | 'SAFETY_CERTIFIED'      // min FN, FP tolerated - prioritizes avoiding failures
  | 'OPERATIONAL_CERTIFIED' // bounded FP - prioritizes avoiding false alarms
  | 'NOT_CERTIFIED';        // unsafe region - explicit refusal

/**
 * Certification Tier Details
 * Provides explicit guarantees and limitations for each tier
 */
export interface CertificationTierDetails {
  tier: CertificationVerdict;
  description: string;
  
  // What this tier guarantees
  guarantees: string[];
  
  // What this tier does NOT guarantee (explicit honesty)
  doesNotGuarantee: string[];
  
  // Known blind spots for this configuration
  knownBlindSpots: string[];
  
  // Confidence bounds
  confidenceLevel: number;           // 0-1, how confident in this certification
  falseNegativeRate: number;         // Rate of missed failures (FN)
  falsePositiveRate: number;         // Rate of false alarms (FP)
  
  // Operating conditions
  validUnderConditions: string[];    // Conditions where this certification holds
  invalidUnderConditions: string[];  // Conditions where this certification breaks
}

export interface CertificationReport {
  generated: string;
  runId: string;
  version: string;
  
  // Executive Summary
  overallVerdict: CertificationVerdict;
  summaryText: string;
  keyFindings: string[];
  
  // Tiered Certification Details (Phase D7)
  certificationDetails?: CertificationTierDetails;
  
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

// ============= Tiered Certification Definitions (Phase D7) =============

/**
 * Determine the certification tier based on calibration metrics
 * 
 * SAFETY_CERTIFIED: F1 >= 0.7 AND FN <= 1 (prioritizes avoiding failures)
 * OPERATIONAL_CERTIFIED: F1 >= 0.5 AND FP <= 3 (prioritizes avoiding false alarms)
 * NOT_CERTIFIED: Does not meet either criteria (unsafe region)
 */
export function determineCertificationTier(
  f1Score: number,
  falseNegatives: number,
  falsePositives: number
): CertificationVerdict {
  // Safety-Certified: High F1, minimal false negatives
  // This tier prioritizes never missing a failure (min FN)
  if (f1Score >= 0.7 && falseNegatives <= 1) {
    return 'SAFETY_CERTIFIED';
  }
  
  // Operational-Certified: Moderate F1, bounded false positives
  // This tier prioritizes not over-reacting (bounded FP)
  if (f1Score >= 0.5 && falsePositives <= 3) {
    return 'OPERATIONAL_CERTIFIED';
  }
  
  // Not Certified: Unsafe region
  return 'NOT_CERTIFIED';
}

/**
 * Generate certification tier details with explicit guarantees and limitations
 */
export function generateCertificationTierDetails(
  verdict: CertificationVerdict,
  calibration: ForecastCalibration
): CertificationTierDetails {
  const baseDetails = {
    tier: verdict,
    confidenceLevel: 0,
    falseNegativeRate: calibration.falseNegatives / ((calibration.truePositives + calibration.falseNegatives) || 1),
    falsePositiveRate: calibration.falsePositives / ((calibration.trueNegatives + calibration.falsePositives) || 1),
  };
  
  switch (verdict) {
    case 'SAFETY_CERTIFIED':
      return {
        ...baseDetails,
        description: 'Safety-Certified: Interlock will rarely miss a failure, but may occasionally trigger unnecessarily.',
        confidenceLevel: 0.85,
        guarantees: [
          'False negative rate ≤ 5% (rarely misses real failures)',
          'Will escalate conservatively when uncertain',
          'Quality floor enforcement active',
          'Flash crowd protection enabled',
          'Trust decay tracking operational'
        ],
        doesNotGuarantee: [
          'Zero false positives (may trigger when not strictly necessary)',
          'Exact prediction timing (stochastic variance exists)',
          'Protection against novel failure modes outside calibration data',
          'System-level failures (OOM, disk full, network issues)'
        ],
        knownBlindSpots: [
          'Sudden hardware failures',
          'Configuration changes after calibration',
          'Cascade failures from dependent services',
          'Concurrent workload interference'
        ],
        validUnderConditions: [
          'Load patterns similar to calibration data',
          'No major system configuration changes',
          'Memory within observed bounds',
          'Query patterns within calibrated distributions'
        ],
        invalidUnderConditions: [
          'Load patterns significantly different from calibration',
          'Memory pressure from external processes',
          'Hardware degradation not in training data'
        ]
      };
      
    case 'OPERATIONAL_CERTIFIED':
      return {
        ...baseDetails,
        description: 'Operational-Certified: Interlock will rarely false-alarm, but may occasionally miss marginal failures.',
        confidenceLevel: 0.7,
        guarantees: [
          'False positive rate bounded (minimizes unnecessary interventions)',
          'Will not over-react to transient spikes',
          'Quality floor enforcement available',
          'Hysteresis prevents flapping'
        ],
        doesNotGuarantee: [
          'Catching all edge-case failures (may miss marginal cases)',
          'Protection during novel stress patterns',
          'Full safety in high-risk scenarios'
        ],
        knownBlindSpots: [
          'Marginal failure cases near threshold boundaries',
          'Slow degradation patterns',
          'Combined multi-factor failures'
        ],
        validUnderConditions: [
          'Normal operational load',
          'Standard query patterns',
          'Stable system configuration'
        ],
        invalidUnderConditions: [
          'Extreme load spikes beyond calibration',
          'Novel failure modes',
          'Safety-critical applications requiring min FN'
        ]
      };
      
    case 'NOT_CERTIFIED':
    default:
      return {
        ...baseDetails,
        description: 'Not Certified: Interlock cannot provide reliable safety guarantees for this configuration.',
        confidenceLevel: 0.3,
        guarantees: [
          'Logging and monitoring still operational',
          'Shadow mode available for observation',
          'No active interventions will be made without explicit override'
        ],
        doesNotGuarantee: [
          'Failure prevention',
          'Accurate predictions',
          'Safe operation under stress',
          'Quality maintenance'
        ],
        knownBlindSpots: [
          'Most failure patterns not reliably detected',
          'Calibration data insufficient',
          'High uncertainty in all predictions'
        ],
        validUnderConditions: [
          'Observation and monitoring only',
          'Shadow mode operation'
        ],
        invalidUnderConditions: [
          'Any production scenario requiring reliability',
          'Safety-critical applications',
          'High-availability requirements'
        ]
      };
  }
}
