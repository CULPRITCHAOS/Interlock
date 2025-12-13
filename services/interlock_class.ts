/**
 * Interlock Class Standard
 * ========================
 * 
 * This module defines the formal Interlock Class Rating System (Class I–V)
 * as a deterministic, configuration-based rating derived from enabled
 * features, capabilities, and validation evidence.
 * 
 * This is the SINGLE SOURCE OF TRUTH for class determination.
 * 
 * Classes:
 * - Class I: Observable (Mirror) - Observability + boundary reporting, no interventions
 * - Class II: Static (Fuse) - Static threshold breaker capability
 * - Class III: Dynamic (Governor) - Forecast-driven preventative intervention
 * - Class IV: Reflexive (Airbag) - Reflex override + hysteresis (anti-flap) capability
 * - Class V: Cognitive (Pilot) - Trust decay + no false certainty + quality floor/refusal
 * 
 * IMPORTANT: Classes are determined by:
 * 1. Config values (qualityFloorEnabled, thresholds, etc.)
 * 2. Feature enablement (reflex override, hysteresis, trust decay tracking)
 * 3. Validation evidence (tests that passed)
 * 
 * Anti-Gaming: Disabling required safety features WILL downgrade your class.
 * Badge Rot: Certifications expire and require re-validation.
 */

import { HysteresisConfig, DEFAULT_HYSTERESIS_CONFIG } from './hysteresis';
import { CircuitBreakerConfig, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './phaseIV.types';

// ============= Interlock Class Enum =============

export enum InterlockClass {
  CLASS_I = 'I',
  CLASS_II = 'II',
  CLASS_III = 'III',
  CLASS_IV = 'IV',
  CLASS_V = 'V'
}

// ============= Class Metadata =============

export interface ClassMetadata {
  class: InterlockClass;
  name: string;
  codename: string;
  description: string;
  capabilities: string[];
  minRequirements: string[];
}

export const CLASS_METADATA: Record<InterlockClass, ClassMetadata> = {
  [InterlockClass.CLASS_I]: {
    class: InterlockClass.CLASS_I,
    name: 'Observable',
    codename: 'Mirror',
    description: 'Observability + boundary reporting, no interventions',
    capabilities: [
      'Hazard monitoring',
      'Boundary detection',
      'Metrics collection',
      'Event logging'
    ],
    minRequirements: [
      'hazardThreshold defined',
      'Metrics tracking enabled'
    ]
  },
  [InterlockClass.CLASS_II]: {
    class: InterlockClass.CLASS_II,
    name: 'Static',
    codename: 'Fuse',
    description: 'Static threshold breaker capability',
    capabilities: [
      'All Class I capabilities',
      'Static threshold breaker',
      'Circuit state machine (CLOSED/OPEN/HALF_OPEN)',
      'Degraded mode activation'
    ],
    minRequirements: [
      'hazardThreshold > 0',
      'Circuit breaker enabled',
      'Degraded mode configured'
    ]
  },
  [InterlockClass.CLASS_III]: {
    class: InterlockClass.CLASS_III,
    name: 'Dynamic',
    codename: 'Governor',
    description: 'Forecast-driven preventative intervention',
    capabilities: [
      'All Class II capabilities',
      'Forecast-driven intervention',
      'Confidence-based decisions',
      'Recovery prediction'
    ],
    minRequirements: [
      'minimumConfidenceThreshold > 0',
      'Forecast calibration available',
      'Confidence tracking enabled'
    ]
  },
  [InterlockClass.CLASS_IV]: {
    class: InterlockClass.CLASS_IV,
    name: 'Reflexive',
    codename: 'Airbag',
    description: 'Reflex override + hysteresis (anti-flap) capability',
    capabilities: [
      'All Class III capabilities',
      'Reflexive safety override (flash crowd protection)',
      'Hysteresis lock (anti-flapping)',
      'Probe traffic during recovery'
    ],
    minRequirements: [
      'flashThreshold > 0',
      'reflexCooldownMs > 0',
      'consecutiveIntervalsForHalfOpen >= 1',
      'consecutiveWindowsForClose >= 1'
    ]
  },
  [InterlockClass.CLASS_V]: {
    class: InterlockClass.CLASS_V,
    name: 'Cognitive',
    codename: 'Pilot',
    description: 'Trust decay + no false certainty + quality floor/refusal',
    capabilities: [
      'All Class IV capabilities',
      'Trust decay tracking',
      'No false certainty guarantee',
      'Quality floor enforcement (refusal over corruption)'
    ],
    minRequirements: [
      'qualityFloorEnabled === true',
      'qualityFloor > 0',
      'Trust decay tracking enabled',
      'noFalseCertainty enforcement'
    ]
  }
};

// ============= Configuration + Capabilities Interface =============

export interface InterlockCapabilities {
  // Core monitoring
  hazardMonitoring: boolean;
  boundaryDetection: boolean;
  metricsCollection: boolean;
  
  // Circuit breaker
  circuitBreakerEnabled: boolean;
  degradedModeConfigured: boolean;
  
  // Forecasting
  forecastCalibrationAvailable: boolean;
  confidenceTrackingEnabled: boolean;
  
  // Reflexive safety
  reflexOverrideEnabled: boolean;
  hysteresisEnabled: boolean;
  
  // Cognitive features
  trustDecayTracking: boolean;
  noFalseCertaintyEnforced: boolean;
}

export interface ValidationEvidence {
  testsTotal: number;
  testsPassed: number;
  testSuiteVersion: string;
  
  // Specific test results (from validation test series)
  flappingPreventionPassed: boolean;
  incidentQualityPassed: boolean;
  counterfactualSurvivalPassed: boolean;
  trustDecayPassed: boolean;
  flashCrowdReflexPassed: boolean;
  qualityFloorEnforcementPassed: boolean;
  noFalseCertaintyPassed: boolean;
  shadowModePassed: boolean;
  statePersistencePassed: boolean;
  dataSanitizationPassed: boolean;
  hardwareFingerprintPassed: boolean;
}

// ============= Class Derivation Result =============

export interface ClassDerivationResult {
  /** The derived Interlock class */
  class: InterlockClass;
  
  /** Human-readable reasons why this class was assigned */
  reasons: string[];
  
  /** What prevents a higher class (if not Class V) */
  missing: string[];
  
  /** Tests/artifacts that justify this class */
  evidence: string[];
  
  /** Metadata about the derived class */
  metadata: ClassMetadata;
  
  /** Whether this is a downgrade due to disabled features */
  isDowngraded: boolean;
  
  /** Original class before config-based downgrade (if applicable) */
  originalClass?: InterlockClass;
  
  /** Downgrade reasons (if any) */
  downgradeReasons: string[];
}

// ============= Class Requirements Checker =============

/**
 * Check if configuration meets Class I requirements
 */
function meetsClassI(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: InterlockCapabilities
): { meets: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  
  if (circuitConfig.hazardThreshold > 0) {
    reasons.push('Hazard threshold defined');
  } else {
    missing.push('hazardThreshold must be > 0');
  }
  
  if (capabilities.hazardMonitoring) {
    reasons.push('Hazard monitoring enabled');
  } else {
    missing.push('Hazard monitoring must be enabled');
  }
  
  if (capabilities.metricsCollection) {
    reasons.push('Metrics collection enabled');
  } else {
    missing.push('Metrics collection must be enabled');
  }
  
  return { meets: missing.length === 0, reasons, missing };
}

/**
 * Check if configuration meets Class II requirements
 */
function meetsClassII(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: InterlockCapabilities
): { meets: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  
  // Must first meet Class I
  const classI = meetsClassI(config, circuitConfig, capabilities);
  if (!classI.meets) {
    return { meets: false, reasons: classI.reasons, missing: [...classI.missing, 'Must meet Class I requirements'] };
  }
  reasons.push(...classI.reasons);
  
  if (capabilities.circuitBreakerEnabled) {
    reasons.push('Circuit breaker enabled');
  } else {
    missing.push('Circuit breaker must be enabled');
  }
  
  if (capabilities.degradedModeConfigured) {
    reasons.push('Degraded mode configured');
  } else {
    missing.push('Degraded mode must be configured');
  }
  
  if (circuitConfig.degradedNprobe > 0 || circuitConfig.degradedEfSearch > 0) {
    reasons.push('Degraded mode parameters set');
  } else {
    missing.push('Degraded mode parameters must be set');
  }
  
  return { meets: missing.length === 0, reasons, missing };
}

/**
 * Check if configuration meets Class III requirements
 */
function meetsClassIII(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: InterlockCapabilities
): { meets: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  
  // Must first meet Class II
  const classII = meetsClassII(config, circuitConfig, capabilities);
  if (!classII.meets) {
    return { meets: false, reasons: classII.reasons, missing: [...classII.missing, 'Must meet Class II requirements'] };
  }
  reasons.push(...classII.reasons);
  
  if (config.minimumConfidenceThreshold > 0) {
    reasons.push(`Minimum confidence threshold set (${(config.minimumConfidenceThreshold * 100).toFixed(0)}%)`);
  } else {
    missing.push('minimumConfidenceThreshold must be > 0');
  }
  
  if (capabilities.forecastCalibrationAvailable) {
    reasons.push('Forecast calibration available');
  } else {
    missing.push('Forecast calibration must be available');
  }
  
  if (capabilities.confidenceTrackingEnabled) {
    reasons.push('Confidence tracking enabled');
  } else {
    missing.push('Confidence tracking must be enabled');
  }
  
  return { meets: missing.length === 0, reasons, missing };
}

/**
 * Check if configuration meets Class IV requirements
 */
function meetsClassIV(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: InterlockCapabilities
): { meets: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  
  // Must first meet Class III
  const classIII = meetsClassIII(config, circuitConfig, capabilities);
  if (!classIII.meets) {
    return { meets: false, reasons: classIII.reasons, missing: [...classIII.missing, 'Must meet Class III requirements'] };
  }
  reasons.push(...classIII.reasons);
  
  // Reflexive safety override (flash crowd protection)
  if (config.flashThreshold > 0) {
    reasons.push(`Flash crowd threshold set (${config.flashThreshold}x)`);
  } else {
    missing.push('flashThreshold must be > 0 for reflex override');
  }
  
  if (config.reflexCooldownMs > 0) {
    reasons.push(`Reflex cooldown configured (${config.reflexCooldownMs}ms)`);
  } else {
    missing.push('reflexCooldownMs must be > 0');
  }
  
  if (capabilities.reflexOverrideEnabled) {
    reasons.push('Reflex override enabled');
  } else {
    missing.push('Reflex override must be enabled');
  }
  
  // Hysteresis (anti-flapping)
  if (config.consecutiveIntervalsForHalfOpen >= 1) {
    reasons.push(`Hysteresis recovery intervals set (K=${config.consecutiveIntervalsForHalfOpen})`);
  } else {
    missing.push('consecutiveIntervalsForHalfOpen must be >= 1');
  }
  
  if (config.consecutiveWindowsForClose >= 1) {
    reasons.push(`Hysteresis close windows set (N=${config.consecutiveWindowsForClose})`);
  } else {
    missing.push('consecutiveWindowsForClose must be >= 1');
  }
  
  if (capabilities.hysteresisEnabled) {
    reasons.push('Hysteresis enabled');
  } else {
    missing.push('Hysteresis must be enabled');
  }
  
  return { meets: missing.length === 0, reasons, missing };
}

/**
 * Check if configuration meets Class V requirements
 */
function meetsClassV(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: InterlockCapabilities
): { meets: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];
  
  // Must first meet Class IV
  const classIV = meetsClassIV(config, circuitConfig, capabilities);
  if (!classIV.meets) {
    return { meets: false, reasons: classIV.reasons, missing: [...classIV.missing, 'Must meet Class IV requirements'] };
  }
  reasons.push(...classIV.reasons);
  
  // Quality floor enforcement
  if (config.qualityFloorEnabled === true) {
    reasons.push('Quality floor enforcement enabled');
  } else {
    missing.push('qualityFloorEnabled must be true');
  }
  
  if (config.qualityFloor > 0) {
    reasons.push(`Quality floor threshold set (${(config.qualityFloor * 100).toFixed(0)}% recall)`);
  } else {
    missing.push('qualityFloor must be > 0');
  }
  
  // Trust decay tracking
  if (capabilities.trustDecayTracking) {
    reasons.push('Trust decay tracking enabled');
  } else {
    missing.push('Trust decay tracking must be enabled');
  }
  
  // No false certainty
  if (capabilities.noFalseCertaintyEnforced) {
    reasons.push('No false certainty enforcement active');
  } else {
    missing.push('No false certainty enforcement must be active');
  }
  
  return { meets: missing.length === 0, reasons, missing };
}

// ============= Evidence Builder =============

function buildEvidence(
  interlockClass: InterlockClass,
  validation?: ValidationEvidence
): string[] {
  const evidence: string[] = [];
  
  if (!validation) {
    evidence.push('No validation evidence available - class based on configuration only');
    return evidence;
  }
  
  evidence.push(`Test suite version: ${validation.testSuiteVersion}`);
  evidence.push(`Tests passed: ${validation.testsPassed}/${validation.testsTotal}`);
  
  // Map tests to classes
  if (validation.flappingPreventionPassed) {
    evidence.push('✓ Flapping Prevention test passed');
  }
  
  if (validation.incidentQualityPassed) {
    evidence.push('✓ Incident Quality test passed');
  }
  
  if (validation.counterfactualSurvivalPassed) {
    evidence.push('✓ Counterfactual Survival test passed');
  }
  
  // Class III+ evidence
  if (interlockClass >= InterlockClass.CLASS_III) {
    if (validation.trustDecayPassed) {
      evidence.push('✓ Trust Decay test passed (Class III+ requirement)');
    }
  }
  
  // Class IV+ evidence
  if (interlockClass >= InterlockClass.CLASS_IV) {
    if (validation.flashCrowdReflexPassed) {
      evidence.push('✓ Flash Crowd Reflex test passed (Class IV requirement)');
    }
    if (validation.statePersistencePassed) {
      evidence.push('✓ State Persistence test passed (Class IV requirement)');
    }
  }
  
  // Class V evidence
  if (interlockClass === InterlockClass.CLASS_V) {
    if (validation.qualityFloorEnforcementPassed) {
      evidence.push('✓ Quality Floor Enforcement test passed (Class V requirement)');
    }
    if (validation.noFalseCertaintyPassed) {
      evidence.push('✓ No False Certainty test passed (Class V requirement)');
    }
  }
  
  return evidence;
}

// ============= Main Class Derivation Function =============

/**
 * Derive the Interlock class based on configuration, capabilities, and validation evidence.
 * 
 * This is the SINGLE SOURCE OF TRUTH for class determination.
 * 
 * IMPORTANT: This function enforces anti-gaming rules:
 * - Disabling qualityFloorEnabled OR qualityFloor <= 0 → Cannot claim Class V
 * - Disabling reflexOverride OR hysteresis → Cannot claim Class IV
 * 
 * @param config - Hysteresis configuration
 * @param circuitConfig - Circuit breaker configuration  
 * @param capabilities - Current feature capabilities
 * @param validation - Optional validation evidence from test runs
 * @returns ClassDerivationResult with class, reasons, missing requirements, and evidence
 */
export function deriveInterlockClass(
  config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
  circuitConfig: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
  capabilities: InterlockCapabilities,
  validation?: ValidationEvidence
): ClassDerivationResult {
  let derivedClass = InterlockClass.CLASS_I;
  let reasons: string[] = [];
  let missing: string[] = [];
  let isDowngraded = false;
  let originalClass: InterlockClass | undefined;
  const downgradeReasons: string[] = [];
  
  // Check each class level from highest to lowest
  const classV = meetsClassV(config, circuitConfig, capabilities);
  const classIV = meetsClassIV(config, circuitConfig, capabilities);
  const classIII = meetsClassIII(config, circuitConfig, capabilities);
  const classII = meetsClassII(config, circuitConfig, capabilities);
  const classI = meetsClassI(config, circuitConfig, capabilities);
  
  if (classV.meets) {
    derivedClass = InterlockClass.CLASS_V;
    reasons = classV.reasons;
    missing = [];
  } else if (classIV.meets) {
    derivedClass = InterlockClass.CLASS_IV;
    reasons = classIV.reasons;
    missing = classV.missing.filter(m => !m.includes('Must meet'));
  } else if (classIII.meets) {
    derivedClass = InterlockClass.CLASS_III;
    reasons = classIII.reasons;
    missing = classIV.missing.filter(m => !m.includes('Must meet'));
  } else if (classII.meets) {
    derivedClass = InterlockClass.CLASS_II;
    reasons = classII.reasons;
    missing = classIII.missing.filter(m => !m.includes('Must meet'));
  } else if (classI.meets) {
    derivedClass = InterlockClass.CLASS_I;
    reasons = classI.reasons;
    missing = classII.missing.filter(m => !m.includes('Must meet'));
  } else {
    // Doesn't even meet Class I
    derivedClass = InterlockClass.CLASS_I;
    reasons = ['Minimum monitoring capabilities present'];
    missing = classI.missing;
  }
  
  // ============= ANTI-GAMING ENFORCEMENT =============
  // Apply config-based downgrades for disabled features
  
  // Check for Class V downgrade conditions
  if (derivedClass === InterlockClass.CLASS_V) {
    if (config.qualityFloorEnabled === false) {
      originalClass = derivedClass;
      derivedClass = InterlockClass.CLASS_IV;
      isDowngraded = true;
      downgradeReasons.push('qualityFloorEnabled is false - cannot claim Class V');
    }
    if (config.qualityFloor <= 0) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_IV;
      isDowngraded = true;
      downgradeReasons.push('qualityFloor <= 0 - cannot claim Class V');
    }
    if (!capabilities.trustDecayTracking) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_IV;
      isDowngraded = true;
      downgradeReasons.push('Trust decay tracking disabled - cannot claim Class V');
    }
    if (!capabilities.noFalseCertaintyEnforced) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_IV;
      isDowngraded = true;
      downgradeReasons.push('No false certainty not enforced - cannot claim Class V');
    }
  }
  
  // Check for Class IV downgrade conditions
  if (derivedClass === InterlockClass.CLASS_IV) {
    if (!capabilities.reflexOverrideEnabled || config.flashThreshold <= 0) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_III;
      isDowngraded = true;
      downgradeReasons.push('Reflex override disabled or flashThreshold <= 0 - cannot claim Class IV');
    }
    if (!capabilities.hysteresisEnabled) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_III;
      isDowngraded = true;
      downgradeReasons.push('Hysteresis disabled - cannot claim Class IV');
    }
    if (config.consecutiveIntervalsForHalfOpen < 1 || config.consecutiveWindowsForClose < 1) {
      originalClass = originalClass || derivedClass;
      derivedClass = InterlockClass.CLASS_III;
      isDowngraded = true;
      downgradeReasons.push('Hysteresis intervals not configured - cannot claim Class IV');
    }
  }
  
  // Validate against test evidence if available
  if (validation) {
    // Class V requires specific tests
    if (derivedClass === InterlockClass.CLASS_V) {
      if (!validation.qualityFloorEnforcementPassed || !validation.noFalseCertaintyPassed) {
        originalClass = originalClass || derivedClass;
        derivedClass = InterlockClass.CLASS_IV;
        isDowngraded = true;
        downgradeReasons.push('Class V validation tests did not pass');
      }
    }
    
    // Class IV requires specific tests
    if (derivedClass === InterlockClass.CLASS_IV) {
      if (!validation.flashCrowdReflexPassed || !validation.flappingPreventionPassed) {
        originalClass = originalClass || derivedClass;
        derivedClass = InterlockClass.CLASS_III;
        isDowngraded = true;
        downgradeReasons.push('Class IV validation tests did not pass');
      }
    }
  }
  
  // Build evidence
  const evidence = buildEvidence(derivedClass, validation);
  
  // Add downgrade info to reasons if applicable
  if (isDowngraded) {
    reasons = [
      ...reasons,
      `⚠️ DOWNGRADED from Class ${originalClass} due to configuration`,
      ...downgradeReasons.map(r => `  - ${r}`)
    ];
  }
  
  return {
    class: derivedClass,
    reasons,
    missing,
    evidence,
    metadata: CLASS_METADATA[derivedClass],
    isDowngraded,
    originalClass,
    downgradeReasons
  };
}

// ============= Badge Expiry Types =============

export interface BadgeExpiry {
  /** When the badge was issued */
  issued_at: string;
  
  /** When the badge expires */
  valid_until: string;
  
  /** Validity period in days */
  validity_days: number;
  
  /** Whether the badge is currently stale */
  is_stale: boolean;
  
  /** Days until expiry (negative if expired) */
  days_until_expiry: number;
}

export interface CertificationFingerprint {
  /** Hash of the configuration used */
  config_fingerprint: string;
  
  /** Hardware fingerprint at certification time */
  hardware_fingerprint: string;
  
  /** Version of the test suite used */
  test_suite_version: string;
  
  /** Git commit hash (if available) */
  repo_commit: string | null;
}

/**
 * Check if a certification is stale based on valid_until date
 * 
 * @param validUntil - ISO date string of expiry
 * @returns Object with staleness info and warning message
 */
export function checkCertificationStaleness(validUntil: string): {
  isStale: boolean;
  daysUntilExpiry: number;
  warningMessage: string | null;
} {
  const now = new Date();
  const expiry = new Date(validUntil);
  const diffMs = expiry.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) {
    return {
      isStale: true,
      daysUntilExpiry,
      warningMessage: `Certification stale — expired ${Math.abs(daysUntilExpiry)} days ago. Rerun stress test with 'npm run validate'.`
    };
  }
  
  if (daysUntilExpiry <= 7) {
    return {
      isStale: false,
      daysUntilExpiry,
      warningMessage: `Certification expiring soon — ${daysUntilExpiry} days remaining. Consider rerunning stress test.`
    };
  }
  
  return {
    isStale: false,
    daysUntilExpiry,
    warningMessage: null
  };
}

/**
 * Calculate expiry date from issued date and validity period
 */
export function calculateExpiryDate(issuedAt: Date, validityDays: number = 30): Date {
  const expiry = new Date(issuedAt);
  expiry.setDate(expiry.getDate() + validityDays);
  return expiry;
}

/**
 * Generate a simple hash fingerprint for a configuration object
 */
export function generateConfigFingerprint(config: object): string {
  const str = JSON.stringify(config, Object.keys(config).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `cfg_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// ============= Default Capabilities =============

/**
 * Generate default capabilities based on configuration
 * This creates a capabilities object from hysteresis and circuit breaker configs
 */
export function generateDefaultCapabilities(
  config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
  circuitConfig: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG
): InterlockCapabilities {
  return {
    // Core monitoring - always enabled if configs exist
    hazardMonitoring: circuitConfig.hazardThreshold > 0,
    boundaryDetection: true,
    metricsCollection: true,
    
    // Circuit breaker - check if properly configured
    circuitBreakerEnabled: circuitConfig.hazardThreshold > 0,
    degradedModeConfigured: circuitConfig.degradedNprobe > 0 || circuitConfig.degradedEfSearch > 0,
    
    // Forecasting - check confidence settings
    forecastCalibrationAvailable: true,
    confidenceTrackingEnabled: config.minimumConfidenceThreshold > 0,
    
    // Reflexive safety - check flash crowd settings
    reflexOverrideEnabled: config.flashThreshold > 0 && config.reflexCooldownMs > 0,
    hysteresisEnabled: config.consecutiveIntervalsForHalfOpen >= 1 && config.consecutiveWindowsForClose >= 1,
    
    // Cognitive features - check quality floor and trust settings
    trustDecayTracking: true, // Always tracking if hysteresis is available
    noFalseCertaintyEnforced: config.minimumConfidenceThreshold > 0
  };
}

// ============= Exports =============

export {
  meetsClassI,
  meetsClassII,
  meetsClassIII,
  meetsClassIV,
  meetsClassV
};
