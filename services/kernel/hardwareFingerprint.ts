/**
 * Hardware Fingerprint
 * ====================
 * Generates a stable, deterministic hardware fingerprint for lawpack namespacing.
 * 
 * - hardware_fingerprint: sha256 of normalized, stable hardware details (always stamped)
 * - hardware: full details object (only logged if INTERLOCK_INCLUDE_HARDWARE=1)
 * 
 * GPU is intentionally EXCLUDED from fingerprint to avoid cross-OS detection instability.
 * GPU affects performance but is better captured via kernel.ollama_config.
 */

import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Hardware details for full logging (optional, gated by env flag).
 */
export interface HardwareDetails {
    cpu_model: string;
    cpu_threads: number;
    ram_gb: number;
    os_name: string;
    os_version: string;
    // GPU fields optional - unreliable across OS
    gpu_present?: boolean;
    gpu_name?: string;
}

/**
 * Core hardware fields used for fingerprint (stable subset).
 * GPU excluded for cross-platform stability.
 */
interface FingerprintCore {
    cpu_model: string;
    cpu_threads: number;
    ram_gb: number;
    os_name: string;
}

/**
 * Normalize JSON for deterministic hashing.
 * Sorted keys, no extra whitespace.
 */
function normalizeJson(obj: Record<string, unknown>): string {
    return JSON.stringify(obj, Object.keys(obj).sort(), 0);
}

/**
 * Compute SHA256 fingerprint of normalized object.
 */
function computeFingerprint(obj: Record<string, unknown>): string {
    const normalized = normalizeJson(obj);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get hardware details for the current machine.
 */
export function getHardwareDetails(): HardwareDetails {
    const cpus = os.cpus();
    // Canonicalize CPU model: trim, collapse whitespace, lowercase for stability
    const rawCpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
    const cpuModel = rawCpuModel.trim().replace(/\s+/g, ' ').toLowerCase();
    const cpuThreads = cpus.length;
    const ramBytes = os.totalmem();
    const ramGb = Math.round(ramBytes / (1024 ** 3));

    return {
        cpu_model: cpuModel,
        cpu_threads: cpuThreads,
        ram_gb: ramGb,
        os_name: os.platform(),
        os_version: os.release(),
        // GPU detection intentionally omitted for stability
        // Can be added later via kernel.ollama_config
    };
}

/**
 * Get deterministic hardware fingerprint.
 * Uses only stable, core fields (excludes GPU and os_version for stability).
 * OS patches should not invalidate lawpacks.
 */
export function getHardwareFingerprint(): string {
    const details = getHardwareDetails();

    // Core fields for fingerprint (GPU and os_version excluded for stability)
    const core: FingerprintCore = {
        cpu_model: details.cpu_model,
        cpu_threads: details.cpu_threads,
        ram_gb: details.ram_gb,
        os_name: details.os_name
        // os_version intentionally excluded - patches shouldn't invalidate laws
    };

    return computeFingerprint(core as unknown as Record<string, unknown>);
}

/**
 * Check if full hardware logging is enabled.
 */
export function isHardwareLoggingEnabled(): boolean {
    return process.env.INTERLOCK_INCLUDE_HARDWARE === '1';
}

/**
 * Get hardware for event stamping.
 * Returns fingerprint always, full details only if env flag set.
 */
export function getHardwareForStamp(): {
    hardware_fingerprint: string;
    hardware?: HardwareDetails;
} {
    const fingerprint = getHardwareFingerprint();

    if (isHardwareLoggingEnabled()) {
        return {
            hardware_fingerprint: fingerprint,
            hardware: getHardwareDetails()
        };
    }

    return { hardware_fingerprint: fingerprint };
}
