/**
 * Kernel Boot Integration
 * ========================
 * Wires kernel loading, adapter registration, and boot event emission
 * at Interlock startup.
 * 
 * This is the main integration point that proves the closed loop.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
    KernelPhysics,
    KernelProfile,
    KernelStamp,
    AdapterStamp,
    InterlockAdapter,
    DomainConfig,
    WorkloadIdentity
} from '../adapters';
import { AdapterRegistry } from '../adapters/registry';

// ============= Kernel Loading =============

export interface KernelLoadResult {
    success: boolean;
    profile: KernelProfile | null;
    physics: KernelPhysics;
    stamp: KernelStamp;
    warnings: string[];
    loadedFrom: string;
}

const DEFAULT_PHYSICS: KernelPhysics = {
    max_safe_latency_ms: 500,
    min_confidence_floor: 0.5,
    error_threshold_rate: 0.05,
    recovery_timeout_ms: 60000,
    probe_interval_ms: 15000
};

const SUPPORTED_SCHEMA_VERSIONS = ['0.2.0', '0.3.0'];

function getKernelPaths(): string[] {
    const paths: string[] = [];

    // Priority 1: Environment variable
    const envPath = process.env.COGNITIVE_KERNEL_PATH;
    if (envPath) {
        paths.push(envPath);
    }

    // Priority 2: Repo-relative
    paths.push('./kernel/hardware_profile.json');
    paths.push('../Simulated-Desire-Engine/kernel/hardware_profile.json');

    return paths;
}

export function loadKernel(domain?: string): KernelLoadResult {
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
            if (!SUPPORTED_SCHEMA_VERSIONS.includes(profile.schema_version)) {
                warnings.push(`Unsupported kernel schema: ${profile.schema_version}`);
                continue;
            }

            // === v0.3 Registry Pattern ===
            // If schema is 0.3.x and registry exists, read from registry[domain]
            let physicsSource: any;
            let sourceInfo: any;

            if (profile.schema_version.startsWith('0.3') && profile.registry) {
                // v0.3 registry pattern
                if (!domain) {
                    throw new Error(
                        'Kernel v0.3 requires domain parameter for bootInterlock(domain). ' +
                        `Available domains: ${Object.keys(profile.registry).join(', ')}`
                    );
                }

                const domainEntry = profile.registry[domain];
                if (!domainEntry) {
                    throw new Error(
                        `No physics for domain "${domain}" in kernel registry. ` +
                        `Did you ship/seed-baseline? Available domains: ${Object.keys(profile.registry).join(', ')}`
                    );
                }

                physicsSource = domainEntry.physics || {};
                sourceInfo = domainEntry.source || {};

                console.log(`[Interlock] Using v0.3 registry: registry.${domain}`);
            } else {
                // v0.2 flat pattern (backward compatibility)
                physicsSource = profile.physics || {};
                sourceInfo = profile.source || {};
            }

            // Extract physics with defaults
            const physics: KernelPhysics = {
                max_safe_latency_ms: physicsSource.max_safe_latency_ms ?? DEFAULT_PHYSICS.max_safe_latency_ms,
                min_confidence_floor: physicsSource.min_confidence_floor ?? DEFAULT_PHYSICS.min_confidence_floor,
                error_threshold_rate: physicsSource.error_threshold_rate ?? DEFAULT_PHYSICS.error_threshold_rate,
                recovery_timeout_ms: physicsSource.recovery_timeout_ms ?? DEFAULT_PHYSICS.recovery_timeout_ms,
                probe_interval_ms: physicsSource.probe_interval_ms ?? DEFAULT_PHYSICS.probe_interval_ms
            };

            // Build stamp
            const stamp: KernelStamp = {
                schema_version: profile.schema_version,
                packet_id: sourceInfo.packet_id ?? 'unknown',
                law_hash: sourceInfo.law_hash ?? 'unknown',
                hardware_fingerprint: sourceInfo.hardware_fingerprint ?? (profile as any).hardware_fingerprint ?? 'unknown',
                quality_level: sourceInfo.quality_level,
                domain: domain || sourceInfo.domain,
                timestamp: sourceInfo.timestamp
            };

            console.log(`[Interlock] Kernel loaded: ${kernelPath}`);
            console.log(`[Interlock]   packet_id: ${stamp.packet_id}`);
            console.log(`[Interlock]   law_hash: ${stamp.law_hash}`);
            console.log(`[Interlock]   latency_threshold: ${physics.max_safe_latency_ms}ms`);

            return {
                success: true,
                profile,
                physics,
                stamp,
                warnings,
                loadedFrom: kernelPath
            };

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // If this is a domain validation error, re-throw it (don't continue)
            if (msg.includes('No physics for domain') || msg.includes('requires domain parameter')) {
                throw err;
            }
            warnings.push(`Failed to parse kernel at ${kernelPath}: ${msg}`);
        }
    }

    // No kernel found - SAFE MODE
    console.warn(`[Interlock] No valid kernel found - using SAFE MODE defaults`);

    return {
        success: false,
        profile: null,
        physics: { ...DEFAULT_PHYSICS },
        stamp: {
            schema_version: 'unknown',
            packet_id: 'none',
            law_hash: 'default',
            hardware_fingerprint: 'unknown',
            missing: true
        },
        warnings: ['Kernel not found, using SAFE MODE defaults'],
        loadedFrom: 'SAFE_MODE_DEFAULTS'
    };
}

// ============= Physics Hash =============

export function computePhysicsHash(physics: KernelPhysics): string {
    const canonical = JSON.stringify(physics, Object.keys(physics).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 12);
}

// ============= Effective Config =============

export interface EffectiveConfig {
    // Core thresholds
    latencyThresholdMs: number;
    errorThresholdRate: number;
    probeIntervalMs: number;
    recoveryTimeoutMs: number;
    confidenceFloor: number;

    // Source
    configSource: 'kernel' | 'defaults';
    safeMode: boolean;

    // Domain config (if adapter applied)
    domainConfig?: DomainConfig;
}

export function buildEffectiveConfig(
    kernel: KernelLoadResult,
    adapter?: InterlockAdapter
): EffectiveConfig {
    const physics = kernel.physics;

    let domainConfig: DomainConfig | undefined;
    if (adapter) {
        const defaultConfig = adapter.getDefaultConfig();
        domainConfig = adapter.applyPhysics(physics, defaultConfig);
    }

    return {
        latencyThresholdMs: physics.max_safe_latency_ms,
        errorThresholdRate: physics.error_threshold_rate,
        probeIntervalMs: physics.probe_interval_ms,
        recoveryTimeoutMs: physics.recovery_timeout_ms,
        confidenceFloor: physics.min_confidence_floor,
        configSource: kernel.success ? 'kernel' : 'defaults',
        safeMode: !kernel.success,
        domainConfig
    };
}

// ============= Boot Event =============

export interface KernelBootEvent {
    event_type: 'kernel_boot';
    timestamp: string;
    kernel: KernelStamp;
    adapter?: AdapterStamp;
    physics_hash: string;
    effective_config: {
        latencyThresholdMs: number;
        errorThresholdRate: number;
        probeIntervalMs: number;
        recoveryTimeoutMs: number;
        confidenceFloor: number;
    };
    // Workload identity (model provenance) - source of truth is adapter config
    workload?: WorkloadIdentity;
    loaded_from: string;
    safe_mode: boolean;
    warnings: string[];
}

export function createBootEvent(
    kernel: KernelLoadResult,
    config: EffectiveConfig,
    adapter?: InterlockAdapter
): KernelBootEvent {
    const boot: KernelBootEvent = {
        event_type: 'kernel_boot',
        timestamp: new Date().toISOString(),
        kernel: kernel.stamp,
        physics_hash: computePhysicsHash(kernel.physics),
        effective_config: {
            latencyThresholdMs: config.latencyThresholdMs,
            errorThresholdRate: config.errorThresholdRate,
            probeIntervalMs: config.probeIntervalMs,
            recoveryTimeoutMs: config.recoveryTimeoutMs,
            confidenceFloor: config.confidenceFloor
        },
        loaded_from: kernel.loadedFrom,
        safe_mode: config.safeMode,
        warnings: kernel.warnings
    };

    if (adapter) {
        boot.adapter = {
            adapter_id: adapter.adapter_id,
            version: adapter.version
        };
    }

    return boot;
}

// ============= Main Boot Function =============

export interface BootResult {
    kernel: KernelLoadResult;
    config: EffectiveConfig;
    adapter?: InterlockAdapter;
    bootEvent: KernelBootEvent;
}

/**
 * Boot Interlock with kernel physics and adapter.
 * 
 * This is the main entry point that proves the closed loop.
 * For v0.3 kernels, domain is REQUIRED - throws if registry[domain] missing.
 */
export function bootInterlock(domain?: string): BootResult {
    console.log('\n========================================');
    console.log('INTERLOCK KERNEL BOOT');
    console.log(`Domain: ${domain || 'auto-detect'}`);
    console.log('========================================\n');

    // 1. Load kernel (passes domain for v0.3 registry lookup)
    const kernel = loadKernel(domain);


    // 2. Get adapter
    const adapter = domain
        ? AdapterRegistry.getAdapter(domain)
        : AdapterRegistry.getDefaultAdapter();

    if (adapter) {
        console.log(`[Interlock] Using adapter: ${adapter.adapter_id}`);
    } else {
        console.log('[Interlock] No adapter registered');
    }

    // 3. Build effective config
    const config = buildEffectiveConfig(kernel, adapter);

    // 4. Create boot event
    const bootEvent = createBootEvent(kernel, config, adapter);

    // 5. Log summary
    console.log('\n--- Effective Configuration ---');
    console.log(`  latencyThresholdMs: ${config.latencyThresholdMs}`);
    console.log(`  errorThresholdRate: ${config.errorThresholdRate}`);
    console.log(`  probeIntervalMs: ${config.probeIntervalMs}`);
    console.log(`  recoveryTimeoutMs: ${config.recoveryTimeoutMs}`);
    console.log(`  confidenceFloor: ${config.confidenceFloor}`);
    console.log(`  configSource: ${config.configSource}`);
    console.log(`  safeMode: ${config.safeMode}`);

    if (kernel.warnings.length > 0) {
        console.log('\n--- Warnings ---');
        kernel.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }

    console.log('\n========================================');
    console.log('KERNEL BOOT COMPLETE');
    console.log('========================================\n');

    return {
        kernel,
        config,
        adapter,
        bootEvent
    };
}

// ============= Event Stamping =============

let cachedStamp: KernelStamp | null = null;
let cachedAdapterStamp: AdapterStamp | null = null;
let cachedPhysicsHash: string | null = null;

/**
 * Initialize stamping from boot result.
 */
export function initStamping(boot: BootResult): void {
    cachedStamp = boot.kernel.stamp;
    cachedPhysicsHash = computePhysicsHash(boot.kernel.physics);

    if (boot.adapter) {
        cachedAdapterStamp = {
            adapter_id: boot.adapter.adapter_id,
            version: boot.adapter.version
        };
    }
}

/**
 * Stamp an event with kernel and adapter provenance.
 */
export function stampEvent<T extends Record<string, unknown>>(event: T): T & {
    kernel: KernelStamp;
    adapter?: AdapterStamp;
    physics_hash?: string;
    hardware_fingerprint: string;
} {
    const kernel = cachedStamp ?? {
        schema_version: 'unknown',
        packet_id: 'none',
        law_hash: 'default',
        hardware_fingerprint: 'unknown',
        missing: true
    };

    return {
        ...event,
        kernel,
        hardware_fingerprint: (event.hardware_fingerprint as string | undefined) ?? kernel.hardware_fingerprint ?? 'unknown',
        ...(cachedAdapterStamp && { adapter: cachedAdapterStamp }),
        ...(cachedPhysicsHash && { physics_hash: cachedPhysicsHash })
    };
}
