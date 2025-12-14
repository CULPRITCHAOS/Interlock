/**
 * Interlock Integrity Service
 * ===========================
 * 
 * Provides cryptographic verification and integrity checks for Interlock certification.
 * Extracted from generate-badge.ts to isolate validation logic from CLI/Canvas dependencies.
 */

import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { InterlockClass } from './interlock_class.ts';

// ============= Types =============

export interface HardwareFingerprintData {
    memoryGb: number;
    cpuCores: number;
    platform: string;
}

/**
 * Core certified claims that are included in the signature.
 * These fields (and ONLY these fields) are cryptographically signed.
 */
export interface SignedClaims {
    interlock_class: string;
    load_rating: string;
    valid_until: string;
    repository: string;
    repo_commit: string | null;
    config_fingerprint: string;
    hardware_fingerprint: string;
    test_suite_version: string;
}

/**
 * Badge types from generate-badge.ts need to be shared,
 * but to avoid circular deps we define minimal interfaces here or import types.
 * Since InterlockShield structure is defined by the badge generator,
 * we will duplicate the interface for now to keep this service pure,
 * OR we can rely on structural typing. 
 * Better: We define the canonical Shield interface here.
 */
export interface InterlockShield {
    version: string;
    generated: string;
    interlockVersion: string;

    interlockClass: InterlockClass;
    interlockClassName: string;
    interlockClassCodename: string;
    interlockClassDescription: string;
    isDowngraded: boolean;
    classReasons: string[];
    classMissing: string[];

    loadRating: string;
    loadRatingLabel: string;
    loadClass?: string; // Legacy
    loadClassLabel?: string; // Legacy
    reflexStatus: 'Active' | 'Disabled';
    reflexLatencyMs: number;
    driftTolerancePercent: number;
    qualityFloorEnforced: boolean;
    qualityFloorThreshold: number;

    certificationTier: 'SAFETY_CERTIFIED' | 'OPERATIONAL_CERTIFIED' | 'NOT_CERTIFIED';
    certificationF1: number;

    issued_at: string;
    valid_until: string;
    validity_days: number;
    is_stale: boolean;

    config_fingerprint: string;
    hardware_fingerprint: string;
    test_suite_version: string;
    repo_commit: string | null;
    repository: string;

    lastAuditDate: string;
    testSuiteHash: string;

    hardwareFingerprint: HardwareFingerprintData;

    testsSummary: {
        total: number;
        passed: number;
        failed: number;
    };

    evidence: string[];
    signature?: string;
}

// ============= Helper Functions =============

/**
 * Get git commit hash if available
 * Uses the full path to git and validates the output format
 */
export function getGitCommit(): string | null {
    try {
        // Use which to find git location, or fall back to common paths
        const result = execSync('git rev-parse HEAD', {
            encoding: 'utf-8',
            timeout: 5000,  // 5 second timeout
            stdio: ['pipe', 'pipe', 'pipe']  // Capture stderr
        }).trim();

        // Validate the output looks like a git hash (40 hex characters)
        // Also accept 7-8 char short hash
        if (/^[a-f0-9]{7,40}$/i.test(result)) {
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
export function generateHardwareFingerprint(): string {
    const memoryGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const cpuCores = os.cpus().length;
    const platform = os.platform();
    const cpuModel = os.cpus()[0]?.model || 'unknown';

    const fingerprint = `${memoryGb}GB-${cpuCores}cores-${platform}-${cpuModel}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
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
        repository: shield.repository,
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
        `repository=${claims.repository}`,
        `test_suite_version=${claims.test_suite_version}`,
        `valid_until=${claims.valid_until}`
    ];
    return parts.join('|');
}

/**
 * Default development signing key.
 * ⚠️ WARNING: This is NOT secure for production use.
 */
export const DEV_SIGNING_KEY = 'interlock-dev-signing-key-not-for-production';

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
        if (!(getSigningKey as any).warned) {
            console.warn('[INTERLOCK] ⚠️ Using development signing key. Set INTERLOCK_SIGNING_KEY for production.');
            (getSigningKey as any).warned = true;
        }
        return DEV_SIGNING_KEY;
    }
    return envKey;
}
// Track if warning has been emitted
(getSigningKey as any).warned = false;

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
