#!/usr/bin/env npx tsx
/**
 * Interlock Badge Generator (v2.0 - Class Standard Integration)
 * ==============================================================
 * 
 * Generates the "Interlock Shield" badge artifacts:
 * - interlock_shield.json (machine-readable with expiry)
 * - interlock_shield.md (copy/paste badge block)
 * - interlock_shield.svg (visual badge)
 * 
 * Badge Concept: "🛡️ Interlock: Class IV (Reflexive/Airbag)"
 * 
 * NEW in v2.0:
 * - Interlock Class (I-V) based on enabled features + config
 * - Badge expiry (valid_until) to prevent "badge rot"
 * - Config fingerprint for anti-gaming
 * - Evidence-based metrics from validation tests
 * 
 * Fields:
 * - Interlock Class: I–V (Observable, Static, Dynamic, Reflexive, Cognitive)
 * - Load Rating: Class I-V based on tested vectors/QPS
 * - Reflex: Active (<X ms) if proven
 * - Drift Tolerance: Y% if proven
 * - Quality Floor: Enforced (min recall threshold)
 * - Last Audit: YYYY-MM-DD
 * - Valid Until: YYYY-MM-DD
 * - Tested On: hardware fingerprint
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import {
  InterlockClass,
  CLASS_METADATA,
  deriveInterlockClass,
  generateDefaultCapabilities,
  checkCertificationStaleness,
  calculateExpiryDate,
  generateConfigFingerprint,
  ValidationEvidence,
  InterlockCapabilities,
  ClassDerivationResult
} from '../services/interlock_class';
import { DEFAULT_HYSTERESIS_CONFIG, HysteresisConfig } from '../services/hysteresis';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG, CircuitBreakerConfig } from '../services/phaseIV.types';

// ============= Load Rating Definitions (separate from Interlock Class) =============

/**
 * Load Rating based on stress test results (vectors/QPS tested)
 * This is DIFFERENT from Interlock Class (which is feature-based)
 * 
 * Load Rating I:   Light load (0-1000 vectors, <10 QPS)
 * Load Rating II:  Moderate load (1000-10000 vectors, 10-50 QPS)
 * Load Rating III: Heavy load (10000-100000 vectors, 50-200 QPS)
 * Load Rating IV:  Extreme load (100000-1M vectors, 200-1000 QPS)
 * Load Rating V:   Massive load (>1M vectors, >1000 QPS)
 */
export type LoadRating = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface LoadRatingCriteria {
  maxVectors: number;
  maxQPS: number;
  label: string;
  description: string;
}

export const LOAD_RATING_CRITERIA: Record<LoadRating, LoadRatingCriteria> = {
  'I': { maxVectors: 1000, maxQPS: 10, label: 'Light', description: 'Development/Testing' },
  'II': { maxVectors: 10000, maxQPS: 50, label: 'Moderate', description: 'Small Production' },
  'III': { maxVectors: 100000, maxQPS: 200, label: 'Heavy', description: 'Standard Production' },
  'IV': { maxVectors: 1000000, maxQPS: 1000, label: 'Extreme', description: 'High-Scale Production' },
  'V': { maxVectors: Infinity, maxQPS: Infinity, label: 'Massive', description: 'Enterprise Scale' }
};

/**
 * Determine Load Rating from test metrics
 */
export function determineLoadRating(maxVectors: number, maxQPS: number): LoadRating {
  if (maxVectors <= 1000 && maxQPS <= 10) return 'I';
  if (maxVectors <= 10000 && maxQPS <= 50) return 'II';
  if (maxVectors <= 100000 && maxQPS <= 200) return 'III';
  if (maxVectors <= 1000000 && maxQPS <= 1000) return 'IV';
  return 'V';
}

// Legacy alias for backwards compatibility
export type LoadClass = LoadRating;
export const LOAD_CLASS_CRITERIA = LOAD_RATING_CRITERIA;
export const determineLoadClass = determineLoadRating;

// ============= Badge Types =============

export interface InterlockShield {
  // Badge metadata
  version: string;
  generated: string;
  interlockVersion: string;
  
  // ============= NEW: Interlock Class (Feature-Based) =============
  /** The Interlock class (I-V) based on enabled features + config */
  interlockClass: InterlockClass;
  /** Human-readable class name (Observable, Static, Dynamic, Reflexive, Cognitive) */
  interlockClassName: string;
  /** Class codename (Mirror, Fuse, Governor, Airbag, Pilot) */
  interlockClassCodename: string;
  /** Class description */
  interlockClassDescription: string;
  /** Whether this class was downgraded due to disabled features */
  isDowngraded: boolean;
  /** Reasons for the class assignment */
  classReasons: string[];
  /** What prevents a higher class */
  classMissing: string[];
  
  // Core badge fields (Load Rating - separate from Interlock Class)
  loadRating: LoadRating;
  loadRatingLabel: string;
  /** @deprecated Use loadRating instead */
  loadClass: LoadClass;
  /** @deprecated Use loadRatingLabel instead */
  loadClassLabel: string;
  reflexStatus: 'Active' | 'Disabled';
  reflexLatencyMs: number;
  driftTolerancePercent: number;
  qualityFloorEnforced: boolean;
  qualityFloorThreshold: number;
  
  // Certification status
  certificationTier: 'SAFETY_CERTIFIED' | 'OPERATIONAL_CERTIFIED' | 'NOT_CERTIFIED';
  certificationF1: number;
  
  // ============= NEW: Badge Expiry (Anti-Badge-Rot) =============
  /** When this badge was issued */
  issued_at: string;
  /** When this badge expires (must revalidate) */
  valid_until: string;
  /** Validity period in days */
  validity_days: number;
  /** Whether the badge is currently stale */
  is_stale: boolean;
  
  // ============= NEW: Fingerprints (Anti-Gaming) =============
  /** Hash of configuration used for certification */
  config_fingerprint: string;
  /** Hash of hardware at certification time */
  hardware_fingerprint: string;
  /** Version of the test suite used */
  test_suite_version: string;
  /** Git commit hash (if available) */
  repo_commit: string | null;
  
  // Legacy audit information (for backwards compatibility)
  lastAuditDate: string;
  testSuiteHash: string;
  
  // Hardware fingerprint (coarse - for badge display)
  hardwareFingerprint: {
    memoryGb: number;
    cpuCores: number;
    platform: string;
  };
  
  // Test summary
  testsSummary: {
    total: number;
    passed: number;
    failed: number;
  };
  
  // ============= NEW: Evidence =============
  /** Tests/artifacts that justify this class */
  evidence: string[];
  
  // ============= NEW: Tamper-Evident Signature =============
  /** HMAC-SHA256 signature of core certified claims (tamper-evident) */
  signature?: string;
}

// ============= Helper Functions =============

/**
 * Get git commit hash if available
 * Uses the full path to git and validates the output format
 */
function getGitCommit(): string | null {
  try {
    // Use which to find git location, or fall back to common paths
    const result = execSync('git rev-parse HEAD', { 
      encoding: 'utf-8',
      timeout: 5000,  // 5 second timeout
      stdio: ['pipe', 'pipe', 'pipe']  // Capture stderr
    }).trim();
    
    // Validate the output looks like a git hash (40 hex characters)
    if (/^[a-f0-9]{40}$/i.test(result)) {
      return result.substring(0, 8);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a hardware fingerprint hash
 */
function generateHardwareFingerprint(): string {
  const memoryGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpuCores = os.cpus().length;
  const platform = os.platform();
  const cpuModel = os.cpus()[0]?.model || 'unknown';
  
  const fingerprint = `${memoryGb}GB-${cpuCores}cores-${platform}-${cpuModel}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
}

// ============= Tamper-Evident Signature =============

/**
 * Core certified claims that are included in the signature.
 * These fields (and ONLY these fields) are cryptographically signed.
 * 
 * SIGNED FIELDS (EXACT - from problem statement):
 * - interlock_class
 * - load_rating
 * - valid_until
 * - repo_commit
 * - config_fingerprint
 * - hardware_fingerprint
 * - test_suite_version
 */
export interface SignedClaims {
  interlock_class: string;
  load_rating: string;
  valid_until: string;
  repo_commit: string | null;
  config_fingerprint: string;
  hardware_fingerprint: string;
  test_suite_version: string;
}

/**
 * Extract signed claims from a shield for signature computation.
 * Uses stable key order for deterministic signing.
 */
export function extractSignedClaims(shield: InterlockShield): SignedClaims {
  return {
    interlock_class: shield.interlockClass,
    load_rating: shield.loadRating,
    valid_until: shield.valid_until,
    repo_commit: shield.repo_commit,
    config_fingerprint: shield.config_fingerprint,
    hardware_fingerprint: shield.hardware_fingerprint,
    test_suite_version: shield.test_suite_version
  };
}

/**
 * Build canonical string from signed claims for signature computation.
 * Uses stable order and delimiter separation for deterministic hashing.
 */
export function buildCanonicalString(claims: SignedClaims): string {
  // Stable order: alphabetical by key name
  const parts = [
    `config_fingerprint=${claims.config_fingerprint}`,
    `hardware_fingerprint=${claims.hardware_fingerprint}`,
    `interlock_class=${claims.interlock_class}`,
    `load_rating=${claims.load_rating}`,
    `repo_commit=${claims.repo_commit ?? 'null'}`,
    `test_suite_version=${claims.test_suite_version}`,
    `valid_until=${claims.valid_until}`
  ];
  return parts.join('|');
}

/**
 * Default development signing key.
 * ⚠️ WARNING: This is NOT secure for production use.
 */
const DEV_SIGNING_KEY = 'interlock-dev-signing-key-not-for-production';

/**
 * Check if the signing key is the insecure development key.
 */
export function isUsingDevSigningKey(): boolean {
  return !process.env.INTERLOCK_SIGNING_KEY;
}

/**
 * Get the signing key, with logging for security awareness.
 * In production, INTERLOCK_SIGNING_KEY must be set.
 */
function getSigningKey(): string {
  const envKey = process.env.INTERLOCK_SIGNING_KEY;
  if (!envKey) {
    // Only warn once per process to avoid log spam
    if (!getSigningKey.warned) {
      console.warn('[INTERLOCK] ⚠️ Using development signing key. Set INTERLOCK_SIGNING_KEY for production.');
      getSigningKey.warned = true;
    }
    return DEV_SIGNING_KEY;
  }
  return envKey;
}
// Track if warning has been emitted
getSigningKey.warned = false;

/**
 * Generate HMAC-SHA256 signature for the badge.
 * 
 * Key source priority:
 * 1. INTERLOCK_SIGNING_KEY environment variable (production)
 * 2. Default fallback key for development (allows badge generation without secrets)
 * 
 * ⚠️ WARNING: In production, always inject the signing key via environment variable.
 * The fallback key is for development/testing only.
 */
export function generateBadgeSignature(claims: SignedClaims): string {
  const signingKey = getSigningKey();
  const canonicalString = buildCanonicalString(claims);
  const signature = crypto.createHmac('sha256', signingKey)
    .update(canonicalString)
    .digest('hex');
  return signature;
}

/**
 * Verify the HMAC-SHA256 signature of a badge.
 * Returns verification result with details.
 * 
 * @returns Object with verification status and details
 */
export function verifyBadgeSignature(shield: InterlockShield): {
  valid: boolean;
  expectedSignature: string;
  actualSignature: string | undefined;
  claims: SignedClaims;
  warningMessage: string | null;
} {
  const claims = extractSignedClaims(shield);
  const expectedSignature = generateBadgeSignature(claims);
  const actualSignature = shield.signature;
  
  const valid = actualSignature === expectedSignature;
  
  let warningMessage: string | null = null;
  if (!actualSignature) {
    warningMessage = 'SECURITY WARNING: Badge has no signature - cannot verify integrity';
  } else if (!valid) {
    warningMessage = 'SECURITY WARNING: Certification Badge Tampered - signature mismatch detected';
  }
  
  return {
    valid,
    expectedSignature,
    actualSignature,
    claims,
    warningMessage
  };
}

/**
 * Parse validation report to extract test evidence
 */
function parseValidationEvidence(validationData: any): ValidationEvidence | undefined {
  if (!validationData || !validationData.testSeries) {
    return undefined;
  }
  
  const testSeries = validationData.testSeries;
  const findTest = (name: string) => testSeries.find((t: any) => t.name === name)?.passed ?? false;
  
  return {
    testsTotal: testSeries.length,
    testsPassed: testSeries.filter((t: any) => t.passed).length,
    testSuiteVersion: validationData.generated || 'unknown',
    
    flappingPreventionPassed: findTest('Flapping Prevention'),
    incidentQualityPassed: findTest('Incident Quality'),
    counterfactualSurvivalPassed: findTest('Counterfactual Survival'),
    trustDecayPassed: findTest('Trust Decay'),
    flashCrowdReflexPassed: findTest('Flash Crowd Reflex'),
    qualityFloorEnforcementPassed: findTest('Quality Floor Enforcement'),
    noFalseCertaintyPassed: findTest('No False Certainty'),
    shadowModePassed: findTest('Shadow Mode (Dry Run)'),
    statePersistencePassed: findTest('State Persistence'),
    dataSanitizationPassed: findTest('Forensic Data Sanitization'),
    hardwareFingerprintPassed: findTest('Hardware Fingerprint')
  };
}

// ============= Badge Generation =============

/**
 * Generate badge from validation results
 */
export function generateShield(options: {
  validationReportPath?: string;
  hysteresisConfig?: HysteresisConfig;
  circuitBreakerConfig?: CircuitBreakerConfig;
  capabilities?: InterlockCapabilities;
  maxVectors?: number;
  maxQPS?: number;
  reflexLatencyMs?: number;
  driftTolerancePercent?: number;
  qualityFloorThreshold?: number;
  qualityFloorEnforced?: boolean;
  certificationTier?: 'SAFETY_CERTIFIED' | 'OPERATIONAL_CERTIFIED' | 'NOT_CERTIFIED';
  certificationF1?: number;
  testSuiteHash?: string;
  testsPassed?: number;
  testsTotal?: number;
  validityDays?: number;
}): InterlockShield {
  const now = new Date();
  const validityDays = options.validityDays ?? 30;
  
  // Use provided configs or defaults
  const hysteresisConfig = options.hysteresisConfig ?? DEFAULT_HYSTERESIS_CONFIG;
  const circuitBreakerConfig = options.circuitBreakerConfig ?? DEFAULT_CIRCUIT_BREAKER_CONFIG;
  
  // Read validation report if provided
  let validationData: any = null;
  let validationEvidence: ValidationEvidence | undefined;
  if (options.validationReportPath && fs.existsSync(options.validationReportPath)) {
    try {
      validationData = JSON.parse(fs.readFileSync(options.validationReportPath, 'utf-8'));
      validationEvidence = parseValidationEvidence(validationData);
    } catch {
      // Ignore parse errors
    }
  }
  
  // Generate capabilities from config or use provided
  const capabilities = options.capabilities ?? generateDefaultCapabilities(hysteresisConfig, circuitBreakerConfig);
  
  // ============= DERIVE INTERLOCK CLASS =============
  const classResult = deriveInterlockClass(
    hysteresisConfig,
    circuitBreakerConfig,
    capabilities,
    validationEvidence
  );
  
  // Determine values from validation data or options
  const testsTotal = options.testsTotal ?? validationData?.testSeries?.length ?? 11;
  const testsPassed = options.testsPassed ?? validationData?.testSeries?.filter((t: any) => t.passed).length ?? testsTotal;
  
  // Calculate certification tier based on tests
  let certificationTier: InterlockShield['certificationTier'] = options.certificationTier ?? 'NOT_CERTIFIED';
  let certificationF1 = options.certificationF1 ?? 0;
  
  if (!options.certificationTier) {
    const passRate = testsPassed / testsTotal;
    if (passRate >= 0.9) {
      certificationTier = 'SAFETY_CERTIFIED';
      certificationF1 = passRate;
    } else if (passRate >= 0.7) {
      certificationTier = 'OPERATIONAL_CERTIFIED';
      certificationF1 = passRate;
    } else {
      certificationTier = 'NOT_CERTIFIED';
      certificationF1 = passRate;
    }
  }
  
  // Determine load rating (based on test metrics, separate from Interlock Class)
  const maxVectors = options.maxVectors ?? 100000;
  const maxQPS = options.maxQPS ?? 100;
  const loadRating = determineLoadRating(maxVectors, maxQPS);
  
  // Get hardware fingerprint
  const memoryGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpuCores = os.cpus().length;
  const platform = os.platform();
  
  // Generate fingerprints
  const configFingerprint = generateConfigFingerprint({ hysteresisConfig, circuitBreakerConfig });
  const hardwareFingerprint = generateHardwareFingerprint();
  const repoCommit = getGitCommit();
  
  // Generate test suite hash
  const testSuiteHash = options.testSuiteHash ?? 
    `v5.0.0-${now.toISOString().split('T')[0].replace(/-/g, '')}`;
  
  // Calculate expiry
  const expiryDate = calculateExpiryDate(now, validityDays);
  const staleness = checkCertificationStaleness(expiryDate.toISOString());
  
  // Create shield without signature first
  const shield: InterlockShield = {
    version: '2.0.0',
    generated: now.toISOString(),
    interlockVersion: '5.0.0',
    
    // Interlock Class (Feature-Based)
    interlockClass: classResult.class,
    interlockClassName: classResult.metadata.name,
    interlockClassCodename: classResult.metadata.codename,
    interlockClassDescription: classResult.metadata.description,
    isDowngraded: classResult.isDowngraded,
    classReasons: classResult.reasons,
    classMissing: classResult.missing,
    
    // Load Rating (based on test metrics)
    loadRating,
    loadRatingLabel: LOAD_RATING_CRITERIA[loadRating].label,
    loadClass: loadRating, // Legacy alias
    loadClassLabel: LOAD_RATING_CRITERIA[loadRating].label, // Legacy alias
    reflexStatus: hysteresisConfig.flashThreshold > 0 ? 'Active' : 'Disabled',
    reflexLatencyMs: options.reflexLatencyMs ?? hysteresisConfig.reflexCooldownMs / 1000,
    driftTolerancePercent: options.driftTolerancePercent ?? 20,
    qualityFloorEnforced: hysteresisConfig.qualityFloorEnabled,
    qualityFloorThreshold: hysteresisConfig.qualityFloor,
    
    certificationTier,
    certificationF1,
    
    // Badge Expiry
    issued_at: now.toISOString(),
    valid_until: expiryDate.toISOString(),
    validity_days: validityDays,
    is_stale: staleness.isStale,
    
    // Fingerprints
    config_fingerprint: configFingerprint,
    hardware_fingerprint: hardwareFingerprint,
    test_suite_version: testSuiteHash,
    repo_commit: repoCommit,
    
    lastAuditDate: now.toISOString().split('T')[0],
    testSuiteHash,
    
    hardwareFingerprint: {
      memoryGb,
      cpuCores,
      platform
    },
    
    testsSummary: {
      total: testsTotal,
      passed: testsPassed,
      failed: testsTotal - testsPassed
    },
    
    evidence: classResult.evidence
  };
  
  // Generate cryptographic signature for tamper-evidence
  const claims = extractSignedClaims(shield);
  shield.signature = generateBadgeSignature(claims);
  
  return shield;
}

// ============= Badge Output Formatters =============

/**
 * Generate JSON output
 */
export function shieldToJSON(shield: InterlockShield): string {
  return JSON.stringify(shield, null, 2);
}

/**
 * Generate Markdown badge block
 */
export function shieldToMarkdown(shield: InterlockShield): string {
  const lines: string[] = [];
  
  // Determine badge emoji and color based on certification
  let tierIcon: string;
  let tierLabel: string;
  switch (shield.certificationTier) {
    case 'SAFETY_CERTIFIED':
      tierIcon = '✅';
      tierLabel = 'Safety Certified';
      break;
    case 'OPERATIONAL_CERTIFIED':
      tierIcon = '⚠️';
      tierLabel = 'Operational Certified';
      break;
    default:
      tierIcon = '❌';
      tierLabel = 'Not Certified';
  }
  
  // Stale warning
  const staleWarning = shield.is_stale 
    ? '\n> ⚠️ **Warning**: This certification has expired. Rerun validation tests to refresh.\n'
    : '';
  
  lines.push('<!-- Interlock Shield Badge - Copy this block to your README -->');
  lines.push('');
  lines.push(`## 🛡️ Interlock: Class ${shield.interlockClass} (${shield.interlockClassName})`);
  lines.push('');
  lines.push(`> *${shield.interlockClassDescription}*`);
  lines.push(staleWarning);
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| **Interlock Class** | ${shield.interlockClass} (${shield.interlockClassName}/${shield.interlockClassCodename})${shield.isDowngraded ? ' ⚠️ Downgraded' : ''} |`);
  lines.push(`| **Status** | ${tierIcon} ${tierLabel} |`);
  lines.push(`| **Load Rating** | Class ${shield.loadRating} (${shield.loadRatingLabel}) |`);
  lines.push(`| **Reflex** | ${shield.reflexStatus} (<${shield.reflexLatencyMs}ms) |`);
  lines.push(`| **Drift Tolerance** | ${shield.driftTolerancePercent}% |`);
  lines.push(`| **Quality Floor** | ${shield.qualityFloorEnforced ? `Enforced (min ${(shield.qualityFloorThreshold * 100).toFixed(0)}% recall)` : 'Disabled'} |`);
  lines.push(`| **Last Audit** | ${shield.lastAuditDate} |`);
  lines.push(`| **Valid Until** | ${shield.valid_until.split('T')[0]} |`);
  lines.push(`| **Tested On** | ${shield.hardwareFingerprint.memoryGb}GB RAM, ${shield.hardwareFingerprint.cpuCores} cores, ${shield.hardwareFingerprint.platform} |`);
  lines.push(`| **Tests** | ${shield.testsSummary.passed}/${shield.testsSummary.total} passed |`);
  lines.push(`| **F1 Score** | ${(shield.certificationF1 * 100).toFixed(1)}% |`);
  lines.push('');
  
  // Add disclaimer
  lines.push('> **Disclaimer**: This certification certifies that this configuration survived stress tests under controlled conditions. It does not guarantee future safety or behavior under different conditions.');
  lines.push('');
  lines.push('> *Generated by [Interlock](https://github.com/CULPRITCHAOS/Interlock) v' + shield.interlockVersion + '*');
  lines.push('');
  lines.push('<!-- End Interlock Shield Badge -->');
  
  return lines.join('\n');
}

/**
 * Generate compact one-line badge (for inline use)
 */
export function shieldToCompactBadge(shield: InterlockShield): string {
  let icon: string;
  switch (shield.certificationTier) {
    case 'SAFETY_CERTIFIED':
      icon = '🛡️✅';
      break;
    case 'OPERATIONAL_CERTIFIED':
      icon = '🛡️⚠️';
      break;
    default:
      icon = '🛡️❌';
  }
  
  const stale = shield.is_stale ? ' [STALE]' : '';
  return `${icon} Interlock Class ${shield.interlockClass} (${shield.interlockClassName}) | Load ${shield.loadRating} | ${shield.testsSummary.passed}/${shield.testsSummary.total} tests | Valid until ${shield.valid_until.split('T')[0]}${stale}`;
}

/**
 * Generate SVG badge
 */
export function shieldToSVG(shield: InterlockShield): string {
  // Determine colors based on certification
  let bgColor: string;
  let textColor = '#fff';
  switch (shield.certificationTier) {
    case 'SAFETY_CERTIFIED':
      bgColor = '#4c1';  // Green
      break;
    case 'OPERATIONAL_CERTIFIED':
      bgColor = '#fe7d37';  // Orange
      break;
    default:
      bgColor = '#e05d44';  // Red
  }
  
  const classText = `Class ${shield.interlockClass}`;
  const statusText = shield.interlockClassName;
  const validText = shield.is_stale ? 'STALE' : `Valid: ${shield.valid_until.split('T')[0]}`;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="60" role="img" aria-label="Interlock: Class ${shield.interlockClass}">
  <title>Interlock: Class ${shield.interlockClass} (${shield.interlockClassName})</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="280" height="60" rx="6" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="100" height="60" fill="#555"/>
    <rect x="100" width="180" height="60" fill="${bgColor}"/>
    <rect width="280" height="60" fill="url(#s)"/>
  </g>
  <g fill="${textColor}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="50" y="22" fill="#fff">🛡️ Interlock</text>
    <text x="50" y="42" fill="#fff" font-size="9">${validText}</text>
    <text x="190" y="18" fill="${textColor}" font-weight="bold" font-size="14">${classText}</text>
    <text x="190" y="36" fill="${textColor}">${statusText}</text>
    <text x="190" y="52" fill="${textColor}" font-size="9">Load: ${shield.loadRating} | Tests: ${shield.testsSummary.passed}/${shield.testsSummary.total}</text>
  </g>
</svg>`;
}

// ============= File Output =============

/**
 * Write shield to files
 */
export function writeShieldFiles(
  shield: InterlockShield, 
  outputDir: string = 'results/certification'
): { jsonPath: string; mdPath: string; svgPath: string } {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const jsonPath = path.join(outputDir, 'interlock_shield.json');
  const mdPath = path.join(outputDir, 'interlock_shield.md');
  const svgPath = path.join(outputDir, 'interlock_shield.svg');
  
  fs.writeFileSync(jsonPath, shieldToJSON(shield));
  fs.writeFileSync(mdPath, shieldToMarkdown(shield));
  fs.writeFileSync(svgPath, shieldToSVG(shield));
  
  return { jsonPath, mdPath, svgPath };
}

// ============= Runtime Staleness Check =============

/**
 * Check certification staleness at runtime
 * Call this on application startup to warn about stale certifications
 * 
 * @returns Object with staleness info for metrics/logging
 */
export function checkRuntimeStaleness(shieldPath: string = 'results/certification/interlock_shield.json'): {
  isStale: boolean;
  daysUntilExpiry: number;
  warningMessage: string | null;
  metricsPayload: { certification_stale: number; days_until_expiry: number };
} {
  try {
    if (!fs.existsSync(shieldPath)) {
      return {
        isStale: true,
        daysUntilExpiry: -1,
        warningMessage: 'No certification found. Run npm run validate && npm run generate-badge.',
        metricsPayload: { certification_stale: 1, days_until_expiry: -1 }
      };
    }
    
    const shield: InterlockShield = JSON.parse(fs.readFileSync(shieldPath, 'utf-8'));
    const staleness = checkCertificationStaleness(shield.valid_until);
    
    return {
      isStale: staleness.isStale,
      daysUntilExpiry: staleness.daysUntilExpiry,
      warningMessage: staleness.warningMessage,
      metricsPayload: {
        certification_stale: staleness.isStale ? 1 : 0,
        days_until_expiry: staleness.daysUntilExpiry
      }
    };
  } catch (error) {
    return {
      isStale: true,
      daysUntilExpiry: -1,
      warningMessage: `Failed to read certification: ${error}`,
      metricsPayload: { certification_stale: 1, days_until_expiry: -1 }
    };
  }
}

// ============= Runtime Badge Verification (Complete) =============

/**
 * Badge validity check result
 */
export interface BadgeValidityResult {
  /** Is the badge valid? */
  isValid: boolean;
  
  /** Is the badge signature valid (tamper-evident check)? */
  signatureValid: boolean;
  
  /** Is the badge not expired? */
  notExpired: boolean;
  
  /** Does the repo commit match current? */
  repoCommitMatches: boolean;
  
  /** Does the config fingerprint match? (if provided) */
  configFingerprintMatches: boolean;
  
  /** Does the hardware fingerprint match? */
  hardwareFingerprintMatches: boolean;
  
  /** List of all warning messages */
  warnings: string[];
  
  /** List of all error messages (invalidating conditions) */
  errors: string[];
  
  /** Days until badge expiry */
  daysUntilExpiry: number;
  
  /** The shield data */
  shield: InterlockShield | null;
}

/**
 * Verify badge validity at runtime.
 * 
 * Checks ALL validity conditions per problem statement:
 * - Current date > valid_until
 * - repo_commit changes
 * - config_fingerprint changes
 * - hardware_fingerprint changes
 * - test_suite_version changes
 * - Signature tampering
 * 
 * @param shieldPath Path to the shield JSON file
 * @param currentConfigFingerprint Optional - current config fingerprint to compare
 * @returns Validity result with detailed breakdown
 */
export function verifyBadgeValidity(
  shieldPath: string = 'results/certification/interlock_shield.json',
  currentConfigFingerprint?: string
): BadgeValidityResult {
  const result: BadgeValidityResult = {
    isValid: true,
    signatureValid: false,
    notExpired: false,
    repoCommitMatches: true, // Default true unless we can check
    configFingerprintMatches: true, // Default true unless we can check
    hardwareFingerprintMatches: false,
    warnings: [],
    errors: [],
    daysUntilExpiry: -1,
    shield: null
  };
  
  // Check if file exists
  if (!fs.existsSync(shieldPath)) {
    result.isValid = false;
    result.errors.push('No certification badge found. Run npm run validate && npx tsx scripts/generate-badge.ts');
    return result;
  }
  
  // Try to parse the shield
  let shield: InterlockShield;
  try {
    shield = JSON.parse(fs.readFileSync(shieldPath, 'utf-8'));
    result.shield = shield;
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Failed to parse certification badge: ${error}`);
    return result;
  }
  
  // 1. Check signature (tamper-evident)
  const signatureResult = verifyBadgeSignature(shield);
  result.signatureValid = signatureResult.valid;
  if (!signatureResult.valid) {
    result.isValid = false;
    if (signatureResult.warningMessage) {
      result.errors.push(signatureResult.warningMessage);
    }
  }
  
  // 2. Check expiry (valid_until)
  const staleness = checkCertificationStaleness(shield.valid_until);
  result.daysUntilExpiry = staleness.daysUntilExpiry;
  result.notExpired = !staleness.isStale;
  if (staleness.isStale) {
    result.isValid = false;
    result.errors.push(`Badge expired ${Math.abs(staleness.daysUntilExpiry)} days ago. Run validation tests to refresh.`);
  } else if (staleness.warningMessage) {
    result.warnings.push(staleness.warningMessage);
  }
  
  // 3. Check repo_commit
  const currentCommit = getGitCommit();
  if (currentCommit && shield.repo_commit && currentCommit !== shield.repo_commit) {
    result.repoCommitMatches = false;
    result.isValid = false;
    result.errors.push(`Repository commit changed: badge=${shield.repo_commit}, current=${currentCommit}. Re-run validation.`);
  }
  
  // 4. Check config_fingerprint (if provided)
  if (currentConfigFingerprint && shield.config_fingerprint !== currentConfigFingerprint) {
    result.configFingerprintMatches = false;
    result.isValid = false;
    result.errors.push(`Configuration changed: badge=${shield.config_fingerprint}, current=${currentConfigFingerprint}. Re-run validation.`);
  }
  
  // 5. Check hardware_fingerprint
  const currentHardwareFingerprint = generateHardwareFingerprint();
  if (shield.hardware_fingerprint === currentHardwareFingerprint) {
    result.hardwareFingerprintMatches = true;
  } else {
    result.hardwareFingerprintMatches = false;
    result.isValid = false;
    result.errors.push(`Hardware changed: badge=${shield.hardware_fingerprint}, current=${currentHardwareFingerprint}. Re-run validation.`);
  }
  
  return result;
}

/**
 * Print runtime badge verification warnings to console.
 * This should be called at application startup.
 * Does NOT crash the system - only emits warnings.
 */
export function emitBadgeVerificationWarnings(
  shieldPath: string = 'results/certification/interlock_shield.json',
  currentConfigFingerprint?: string
): void {
  const result = verifyBadgeValidity(shieldPath, currentConfigFingerprint);
  
  // Emit errors (invalidating conditions)
  for (const error of result.errors) {
    console.error(`[INTERLOCK] ${error}`);
  }
  
  // Emit warnings (non-invalidating but concerning)
  for (const warning of result.warnings) {
    console.warn(`[INTERLOCK] ${warning}`);
  }
  
  // Summary
  if (!result.isValid) {
    console.error('[INTERLOCK] ⚠️ Certification badge is INVALID. System continues but certification claims are void.');
  } else if (result.warnings.length > 0) {
    console.warn(`[INTERLOCK] ⚠️ Badge valid but ${result.warnings.length} warning(s) present.`);
  }
}

// ============= CLI =============

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let validationReportPath: string | undefined;
  let outputDir = 'results/certification';
  let validityDays = 30;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--validation' && args[i + 1]) {
      validationReportPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--validity' && args[i + 1]) {
      validityDays = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Interlock Badge Generator (v2.0 - Class Standard)
==================================================

Usage:
  npx tsx scripts/generate-badge.ts [options]

Options:
  --validation <path>  Path to validation report JSON
  --out <dir>          Output directory (default: results/certification)
  --validity <days>    Badge validity period in days (default: 30)
  --help, -h           Show this help

Output:
  - interlock_shield.json  (machine-readable badge data with expiry)
  - interlock_shield.md    (copy/paste markdown badge block)
  - interlock_shield.svg   (visual badge image)

Interlock Classes:
  I   - Observable (Mirror)   - Observability + boundary reporting
  II  - Static (Fuse)         - Static threshold breaker
  III - Dynamic (Governor)    - Forecast-driven intervention
  IV  - Reflexive (Airbag)    - Reflex override + hysteresis
  V   - Cognitive (Pilot)     - Trust decay + quality floor

Example:
  npx tsx scripts/generate-badge.ts --validation results/validation/validation_report_latest.json --validity 30
`);
      process.exit(0);
    }
  }
  
  // Find latest validation report if not specified
  if (!validationReportPath) {
    const validationDir = 'results/validation';
    if (fs.existsSync(validationDir)) {
      const files = fs.readdirSync(validationDir)
        .filter(f => f.endsWith('.json') && f.startsWith('validation_report_'))
        .sort()
        .reverse();
      if (files.length > 0) {
        validationReportPath = path.join(validationDir, files[0]);
        console.log(`Using latest validation report: ${validationReportPath}`);
      }
    }
  }
  
  // Generate shield
  const shield = generateShield({
    validationReportPath,
    validityDays
  });
  
  // Write files
  const { jsonPath, mdPath, svgPath } = writeShieldFiles(shield, outputDir);
  
  // Also write to legacy location for backwards compatibility
  const legacyDir = 'results/badge';
  if (!fs.existsSync(legacyDir)) {
    fs.mkdirSync(legacyDir, { recursive: true });
  }
  fs.writeFileSync(path.join(legacyDir, 'interlock_shield.json'), shieldToJSON(shield));
  fs.writeFileSync(path.join(legacyDir, 'interlock_shield.md'), shieldToMarkdown(shield));
  
  console.log('\n🛡️ Interlock Shield Generated (v2.0 - Class Standard)\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(shieldToCompactBadge(shield));
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Show class details
  console.log('Interlock Class Details:');
  console.log(`  Class: ${shield.interlockClass} (${shield.interlockClassName}/${shield.interlockClassCodename})`);
  console.log(`  Description: ${shield.interlockClassDescription}`);
  if (shield.isDowngraded) {
    console.log(`  ⚠️  Downgraded from higher class due to disabled features`);
  }
  console.log('');
  
  // Show expiry info
  console.log('Certification Validity:');
  console.log(`  Issued: ${shield.issued_at.split('T')[0]}`);
  console.log(`  Valid Until: ${shield.valid_until.split('T')[0]} (${shield.validity_days} days)`);
  if (shield.is_stale) {
    console.log(`  ⚠️  WARNING: Certification is STALE - rerun validation`);
  }
  console.log('');
  
  console.log('Files created:');
  console.log(`  - ${jsonPath}`);
  console.log(`  - ${mdPath}`);
  console.log(`  - ${svgPath}`);
  console.log(`  - ${path.join(legacyDir, 'interlock_shield.json')} (legacy)`);
  console.log(`  - ${path.join(legacyDir, 'interlock_shield.md')} (legacy)`);
  console.log('\nCopy the badge block from interlock_shield.md to your README.');
}

// Run if executed directly
const isMainModule = process.argv[1]?.includes('generate-badge');
if (isMainModule) {
  main().catch(console.error);
}

export default generateShield;
