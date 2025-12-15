/**
 * Interlock Law Loader
 * =====================
 * Loads laws from disk and maps to Interlock configuration.
 * 
 * Laws are read-only. Interlock never writes/mutates law files.
 * Hardware fingerprint mismatch triggers a warning and falls back to defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LawFile, LawParameters, DEFAULT_LAW_PARAMETERS } from './law.types.ts';
import { getHardwareFingerprint, getHardwareInfo } from './events.types.ts';

const DEFAULT_LAWS_DIR = './laws/active';

export interface LoadLawResult {
    success: boolean;
    law: LawFile | null;
    parameters: LawParameters;
    lawHash: string;
    configFingerprint: string;
    warnings: string[];
}

/**
 * Compute SHA256 hash of law file contents
 */
function computeLawHash(law: LawFile): string {
    const canonical = JSON.stringify(law, Object.keys(law).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Compute config fingerprint from effective parameters + hardware
 */
function computeConfigFingerprint(params: LawParameters): string {
    const hardware = getHardwareInfo();
    const raw = JSON.stringify({ params, hardware });
    return 'cfg_' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);
}

/**
 * Load a law file for a specific domain
 */
export function loadLaw(domain: string): LoadLawResult {
    const warnings: string[] = [];
    const lawPath = process.env.INTERLOCK_LAW_PATH ||
        path.join(DEFAULT_LAWS_DIR, `${domain}.json`);

    // Check if law file exists
    if (!fs.existsSync(lawPath)) {
        warnings.push(`Law file not found: ${lawPath}. Using defaults.`);
        console.warn(`[Interlock] ${warnings[0]}`);

        return {
            success: false,
            law: null,
            parameters: DEFAULT_LAW_PARAMETERS,
            lawHash: 'default',
            configFingerprint: computeConfigFingerprint(DEFAULT_LAW_PARAMETERS),
            warnings
        };
    }

    try {
        const rawContent = fs.readFileSync(lawPath, 'utf-8');
        const law: LawFile = JSON.parse(rawContent);

        // Validate schema version
        if (law.schema_version !== '1.0.0') {
            warnings.push(`Unknown schema version: ${law.schema_version}. Using defaults.`);
            return {
                success: false,
                law: null,
                parameters: DEFAULT_LAW_PARAMETERS,
                lawHash: 'default',
                configFingerprint: computeConfigFingerprint(DEFAULT_LAW_PARAMETERS),
                warnings
            };
        }

        // Check hardware fingerprint compatibility
        const currentHwFingerprint = getHardwareFingerprint();
        const ignoreHwMismatch = process.env.INTERLOCK_IGNORE_HW_FINGERPRINT === '1';

        if (law.hardware_fingerprint !== null &&
            law.hardware_fingerprint !== currentHwFingerprint &&
            !ignoreHwMismatch) {
            warnings.push(
                `Hardware mismatch: law expects ${law.hardware_fingerprint}, ` +
                `current is ${currentHwFingerprint}. Using defaults. ` +
                `Set INTERLOCK_IGNORE_HW_FINGERPRINT=1 to override.`
            );
            console.warn(`[Interlock] ${warnings[warnings.length - 1]}`);

            return {
                success: false,
                law,
                parameters: DEFAULT_LAW_PARAMETERS,
                lawHash: computeLawHash(law),
                configFingerprint: computeConfigFingerprint(DEFAULT_LAW_PARAMETERS),
                warnings
            };
        }

        // Validate and use parameters
        const params: LawParameters = {
            latency_threshold_ms: law.parameters.latency_threshold_ms ?? DEFAULT_LAW_PARAMETERS.latency_threshold_ms,
            error_threshold_pct: law.parameters.error_threshold_pct ?? DEFAULT_LAW_PARAMETERS.error_threshold_pct,
            recovery_timeout_ms: law.parameters.recovery_timeout_ms ?? DEFAULT_LAW_PARAMETERS.recovery_timeout_ms,
            probe_interval_ms: law.parameters.probe_interval_ms ?? DEFAULT_LAW_PARAMETERS.probe_interval_ms,
            confidence_floor: law.parameters.confidence_floor ?? DEFAULT_LAW_PARAMETERS.confidence_floor,
            decay_rate: law.parameters.decay_rate ?? DEFAULT_LAW_PARAMETERS.decay_rate
        };

        // Bounds checking
        if (params.latency_threshold_ms < 10 || params.latency_threshold_ms > 60000) {
            warnings.push(`latency_threshold_ms out of bounds, clamping.`);
            params.latency_threshold_ms = Math.max(10, Math.min(60000, params.latency_threshold_ms));
        }
        if (params.confidence_floor < 0 || params.confidence_floor > 1) {
            warnings.push(`confidence_floor out of bounds, clamping.`);
            params.confidence_floor = Math.max(0, Math.min(1, params.confidence_floor));
        }

        console.log(`[Interlock] Loaded law: ${law.law_id} (domain: ${law.domain})`);

        return {
            success: true,
            law,
            parameters: params,
            lawHash: computeLawHash(law),
            configFingerprint: computeConfigFingerprint(params),
            warnings
        };

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to parse law file: ${errMsg}. Using defaults.`);
        console.error(`[Interlock] ${warnings[warnings.length - 1]}`);

        return {
            success: false,
            law: null,
            parameters: DEFAULT_LAW_PARAMETERS,
            lawHash: 'default',
            configFingerprint: computeConfigFingerprint(DEFAULT_LAW_PARAMETERS),
            warnings
        };
    }
}

/**
 * Map law parameters to HysteresisConfig fields
 */
export function mapLawToHysteresisConfig(params: LawParameters): Partial<{
    minimumConfidenceThreshold: number;
    qualityFloor: number;
    minimumOpenDurationMs: number;
    recoveryCheckIntervalS: number;
}> {
    return {
        minimumConfidenceThreshold: params.confidence_floor,
        qualityFloor: params.confidence_floor,
        minimumOpenDurationMs: params.recovery_timeout_ms,
        // Convert probe_interval_ms to seconds for recoveryCheckIntervalS
        recoveryCheckIntervalS: Math.max(1, Math.round(params.probe_interval_ms / 1000))
    };
}

/**
 * Map law parameters to CircuitBreakerConfig fields  
 */
export function mapLawToCircuitBreakerConfig(params: LawParameters): Partial<{
    latencyThresholdMs: number;
    hazardThreshold: number;
}> {
    return {
        latencyThresholdMs: params.latency_threshold_ms,
        // Map error_threshold_pct to hazardThreshold (inverse relationship)
        hazardThreshold: 1 - params.error_threshold_pct
    };
}
