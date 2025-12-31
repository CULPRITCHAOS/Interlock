/**
 * Kernel Loader
 * ==============
 * Loads kernel physics from disk (SDE's hardware_profile.json).
 * 
 * Priority:
 * 1. COGNITIVE_KERNEL_PATH env var
 * 2. ./kernel/hardware_profile.json (repo-relative)
 * 3. ../Simulated-Desire-Engine/kernel/hardware_profile.json (monorepo)
 * 
 * If kernel missing/invalid: continue with defaults, warn once.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============= Kernel Profile Type =============

export interface KernelSource {
    domain?: string;
    packet_id?: string;
    quality_level?: string;
    timestamp?: string;
    law_hash?: string;
    sde_commit?: string;
}

export interface KernelPhysics {
    max_safe_latency_ms?: number;
    min_confidence_floor?: number;
    error_threshold_rate?: number;
    recovery_timeout_ms?: number;
    probe_interval_ms?: number;
}

export interface KernelStatus {
    mode?: string;
    last_ship_at?: string;
}

export interface KernelProfile {
    schema_version?: string;
    profile_version?: string; // v1.0
    source?: KernelSource;
    physics?: KernelPhysics;
    // v1.0 fields
    compute_limits?: any;
    domain_policies?: any;
    status?: KernelStatus;
    _warnings?: string[];
}

export interface KernelLoadResult {
    success: boolean;
    profile: KernelProfile | null;
    physics: KernelPhysics;
    source: KernelSource;
    warnings: string[];
    loadedFrom: string;
}

// ============= Default Physics =============

export const DEFAULT_PHYSICS: KernelPhysics = {
    max_safe_latency_ms: 500,
    min_confidence_floor: 0.5,
    error_threshold_rate: 0.05,
    recovery_timeout_ms: 60000,
    probe_interval_ms: 15000
};

export const EMPTY_SOURCE: KernelSource = {
    domain: 'unknown',
    packet_id: 'none',
    quality_level: 'L0-Observed',
    law_hash: 'default'
};

// ============= Supported Schema Versions =============

const SUPPORTED_SCHEMA_VERSIONS = ['0.2.0', '0.3.0'];

// ============= Path Resolution =============

function getKernelPaths(): string[] {
    const paths: string[] = [];

    // Priority 1: Environment variable
    const envPath = process.env.COGNITIVE_KERNEL_PATH;
    if (envPath) {
        paths.push(envPath);
    }

    // Priority 2: Repo-relative
    paths.push('./kernel/hardware_profile.json');

    // Priority 3: SDE sibling repo
    paths.push('../Simulated-Desire-Engine/kernel/hardware_profile.json');

    // Priority 4: User home (optional)
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
        paths.push(path.join(homeDir, '.cognitive-kernel', 'hardware_profile.json'));
    }

    return paths;
}

// ============= Loader =============

let warnedOnce = false;

/**
 * Load kernel physics from disk.
 * Falls back to defaults if not found.
 */
export function loadKernel(): KernelLoadResult {
    const warnings: string[] = [];
    const paths = getKernelPaths();

    for (const kernelPath of paths) {
        if (!fs.existsSync(kernelPath)) {
            continue;
        }

        try {
            const raw = fs.readFileSync(kernelPath, 'utf-8');
            const profile: KernelProfile = JSON.parse(raw);

            // Validate schema version
            const version = profile.schema_version || profile.profile_version;

            if (!SUPPORTED_SCHEMA_VERSIONS.includes(version) && version !== '1.0.0') {
                warnings.push(`Unsupported kernel schema: ${version}`);
                if (!warnedOnce) {
                    console.warn(`[Interlock] ${warnings[0]}, using defaults`);
                    warnedOnce = true;
                }
                continue;
            }

            let physics: KernelPhysics;
            let source: KernelSource;

            if (version === '1.0.0') {
                // Map v1.0 SDE Profile to Kernel Physics
                // Default to 'ollama' policy or first available
                const policies = profile.domain_policies || {};
                const domainKey = Object.keys(policies)[0] || 'default';
                const policy = policies[domainKey] || {};
                const provenance = policy.provenance || profile.compute_limits?.provenance || {};

                physics = {
                    max_safe_latency_ms: policy.latency_threshold_ms ?? DEFAULT_PHYSICS.max_safe_latency_ms,
                    min_confidence_floor: policy.confidence_floor ?? DEFAULT_PHYSICS.min_confidence_floor,
                    error_threshold_rate: (policy.error_threshold_pct ?? (DEFAULT_PHYSICS.error_threshold_rate! * 100)) / 100,
                    recovery_timeout_ms: policy.recovery_timeout_ms ?? DEFAULT_PHYSICS.recovery_timeout_ms,
                    probe_interval_ms: policy.probe_interval_ms ?? DEFAULT_PHYSICS.probe_interval_ms
                };

                source = {
                    domain: domainKey,
                    packet_id: provenance.run_id ?? 'unknown',
                    quality_level: 'L1-Hardware-Validated',
                    timestamp: provenance.time_window_end,
                    law_hash: provenance.law_hash || profile.compute_limits?.provenance?.law_hash || 'none',
                    sde_commit: 'unknown'
                };
            } else {
                // v0.2 / v0.3 Logic
                physics = {
                    max_safe_latency_ms: profile.physics?.max_safe_latency_ms ?? DEFAULT_PHYSICS.max_safe_latency_ms,
                    min_confidence_floor: profile.physics?.min_confidence_floor ?? DEFAULT_PHYSICS.min_confidence_floor,
                    error_threshold_rate: profile.physics?.error_threshold_rate ?? DEFAULT_PHYSICS.error_threshold_rate,
                    recovery_timeout_ms: profile.physics?.recovery_timeout_ms ?? DEFAULT_PHYSICS.recovery_timeout_ms,
                    probe_interval_ms: profile.physics?.probe_interval_ms ?? DEFAULT_PHYSICS.probe_interval_ms
                };

                source = {
                    domain: profile.source?.domain ?? 'unknown',
                    packet_id: profile.source?.packet_id ?? 'unknown',
                    quality_level: profile.source?.quality_level ?? 'unknown',
                    timestamp: profile.source?.timestamp,
                    law_hash: profile.source?.law_hash ?? 'unknown',
                    sde_commit: profile.source?.sde_commit
                };
            }

            console.log(`[Interlock] Loaded kernel: ${kernelPath} (v${version})`);
            console.log(`[Interlock]   law_hash: ${source.law_hash}`);
            console.log(`[Interlock]   quality: ${source.quality_level}`);
            console.log(`[Interlock]   latency_threshold: ${physics.max_safe_latency_ms}ms`);

            return {
                success: true,
                profile,
                physics,
                source,
                warnings,
                loadedFrom: kernelPath
            };

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            warnings.push(`Failed to parse kernel at ${kernelPath}: ${msg}`);
            if (!warnedOnce) {
                console.warn(`[Interlock] ${warnings[warnings.length - 1]}`);
                warnedOnce = true;
            }
        }
    }

    // No kernel found - use defaults
    if (!warnedOnce) {
        console.warn(`[Interlock] No kernel found, using default physics`);
        warnedOnce = true;
    }

    return {
        success: false,
        profile: null,
        physics: { ...DEFAULT_PHYSICS },
        source: { ...EMPTY_SOURCE },
        warnings: ['Kernel not found, using defaults'],
        loadedFrom: 'defaults'
    };
}

/**
 * Get kernel provenance for event stamping.
 */
export function getKernelProvenance(result: KernelLoadResult): {
    schema_version: string;
    packet_id: string;
    law_hash: string;
    quality_level: string;
    domain: string;
    timestamp?: string;
    missing?: boolean;
    invalid?: boolean;
} {
    if (!result.success) {
        return {
            schema_version: 'unknown',
            packet_id: 'none',
            law_hash: 'default',
            quality_level: 'L0-Observed',
            domain: 'unknown',
            missing: true
        };
    }

    return {
        schema_version: result.profile?.schema_version ?? 'unknown',
        packet_id: result.source.packet_id ?? 'unknown',
        law_hash: result.source.law_hash ?? 'unknown',
        quality_level: result.source.quality_level ?? 'unknown',
        domain: result.source.domain ?? 'unknown',
        timestamp: result.source.timestamp
    };
}

/**
 * Compute stable hash of kernel physics configuration
 */
export function computePhysicsHash(physics: KernelPhysics): string {
    // Sort keys for stability
    // Sort keys for stability
    const canonical = JSON.stringify(physics, Object.keys(physics).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
