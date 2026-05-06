/**
 * Event Stamp
 * ============
 * Stamps every emitted event with kernel provenance.
 * 
 * All events include:
 * - kernel.schema_version
 * - kernel.packet_id
 * - kernel.law_hash
 * - kernel.quality_level
 * - kernel.domain
 * - kernel.hardware_fingerprint (NEW - for lawpack namespacing)
 */

import { loadKernel, getKernelProvenance, computePhysicsHash, KernelLoadResult } from './kernelLoader.ts';
import { getHardwareForStamp, HardwareDetails } from './hardwareFingerprint.ts';

export interface KernelStamp {
    schema_version: string;
    packet_id: string;
    law_hash: string;
    quality_level: string;
    domain: string;
    timestamp?: string;
    physics_hash?: string;     // [NEW] Added for SDE contract
    workload?: {               // [NEW] Added for SDE contract
        model_id: string;
        provider: string;
    };
    // Hardware fingerprint for lawpack namespacing (additive, no schema bump)
    hardware_fingerprint?: string;
    hardware?: HardwareDetails;  // Full details only if INTERLOCK_INCLUDE_HARDWARE=1
    missing?: boolean;
    invalid?: boolean;
}

export interface RuntimeLawProvenance {
    domain: string;
    law_hash?: string;
    packet_id?: string;
    quality_level?: string;
}

// ============= Cached Kernel State =============

let cachedKernel: KernelLoadResult | null = null;
let cachedStamp: KernelStamp | null = null;
let warnedLawHashConflict = false;

/**
 * Initialize kernel and cache stamp for event emission.
 * Call once at boot.
 * 
 * @param workload Optional workload identity to stamp (e.g. { model_id: 'gemma3:12b' })
 */
export function initKernelStamp(
    workload?: { model_id: string; provider: string },
    runtimeLaw?: RuntimeLawProvenance
): KernelStamp {
    cachedKernel = loadKernel();
    // Use the newly exported computePhysicsHash

    const baseStamp = getKernelProvenance(cachedKernel);
    const runtimeLawHash = runtimeLaw?.law_hash;
    const runtimePacketId = runtimeLaw?.packet_id || (
        runtimeLawHash ? `runtime-law-${runtimeLawHash}` : undefined
    );

    if (
        runtimeLawHash &&
        baseStamp.law_hash &&
        baseStamp.law_hash !== 'unknown' &&
        baseStamp.law_hash !== 'default' &&
        baseStamp.law_hash !== runtimeLawHash &&
        !warnedLawHashConflict
    ) {
        console.warn(
            `[Interlock] Runtime law hash ${runtimeLawHash} differs from kernel law_hash ` +
            `${baseStamp.law_hash}; event stamps will use runtime law hash.`
        );
        warnedLawHashConflict = true;
    }

    const physicsHash = cachedKernel.success ? computePhysicsHash(cachedKernel.physics) : 'none';

    // Get hardware fingerprint (always stamped; full details only if env flag set)
    const hardwareStamp = getHardwareForStamp();

    cachedStamp = {
        ...baseStamp,
        domain: runtimeLaw?.domain ?? baseStamp.domain,
        law_hash: runtimeLawHash || safeStampValue(baseStamp.law_hash, 'default'),
        packet_id: runtimePacketId || safeStampValue(baseStamp.packet_id, 'none'),
        quality_level: runtimeLaw?.quality_level || safeStampValue(baseStamp.quality_level, 'L0-Observed'),
        physics_hash: physicsHash,
        workload: workload,
        hardware_fingerprint: hardwareStamp.hardware_fingerprint,
        hardware: hardwareStamp.hardware  // undefined if INTERLOCK_INCLUDE_HARDWARE != 1
    };

    return cachedStamp;
}

function safeStampValue(value: string | undefined, fallback: string): string {
    if (!value || value === 'unknown') return fallback;
    return value;
}

/**
 * Get the current kernel stamp for events.
 * Lazy-initializes if not already done.
 */
export function getKernelStamp(): KernelStamp {
    if (!cachedStamp) {
        return initKernelStamp();
    }
    return cachedStamp;
}

/**
 * Get the cached kernel load result.
 */
export function getCachedKernel(): KernelLoadResult | null {
    return cachedKernel;
}

/**
 * Stamp an event with kernel provenance.
 * Adds SDE provenance fields to any event object.
 */
export function stampEvent<T extends Record<string, any>>(event: T): T & {
    kernel: KernelStamp;
    physics_hash: string;
    workload: KernelStamp['workload'];
    hardware_fingerprint: string;
} {
    const stamp = getKernelStamp();

    return {
        ...event,
        kernel: stamp,
        physics_hash: event.physics_hash ?? stamp.physics_hash ?? 'none',
        workload: event.workload ?? stamp.workload,
        hardware_fingerprint: event.hardware_fingerprint ?? stamp.hardware_fingerprint ?? 'unknown'
    };
}

/**
 * Create a kernel_boot event for logging at startup.
 */
export function createKernelBootEvent(effectiveConfig: Record<string, any>): {
    event_type: 'kernel_boot';
    timestamp: string;
    kernel: KernelStamp;
    physics_hash: string;      // Top-level for easy parsing
    workload: { model_id: string; provider: string } | undefined; // Top-level for easy parsing
    effective_config: Record<string, any>;
    loaded_from: string;
    warnings: string[];
} {
    const kernel = getCachedKernel();
    const stamp = getKernelStamp();

    return {
        event_type: 'kernel_boot',
        timestamp: new Date().toISOString(),
        kernel: stamp,
        physics_hash: stamp.physics_hash ?? 'none',
        workload: stamp.workload,
        effective_config: effectiveConfig,
        loaded_from: kernel?.loadedFrom ?? 'defaults',
        warnings: kernel?.warnings ?? []
    };
}
