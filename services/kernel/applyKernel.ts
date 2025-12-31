/**
 * Apply Kernel Physics
 * =====================
 * Maps kernel physics to Interlock runtime configuration.
 * 
 * Physics → Config Mapping:
 * - max_safe_latency_ms → latencyThresholdMs
 * - min_confidence_floor → minimumConfidenceThreshold, qualityFloor
 * - error_threshold_rate → hazardThreshold (inverted)
 * - recovery_timeout_ms → minimumOpenDurationMs
 * - probe_interval_ms → recoveryCheckIntervalS
 */

import { KernelPhysics, DEFAULT_PHYSICS } from './kernelLoader.ts';
import { LawParameters, DEFAULT_LAW_PARAMETERS } from '../law.types.ts';

// ============= Effective Config Type =============

export interface EffectiveConfig {
    // Circuit breaker
    latencyThresholdMs: number;
    hazardThreshold: number;

    // Hysteresis
    minimumConfidenceThreshold: number;
    qualityFloor: number;
    minimumOpenDurationMs: number;
    recoveryCheckIntervalS: number;

    // Source info
    configSource: 'kernel' | 'law' | 'defaults';
}

// ============= Safety Bounds =============

const BOUNDS = {
    latencyThresholdMs: { min: 1, max: 120000 },
    errorThresholdRate: { min: 0, max: 1 },
    probeIntervalMs: { min: 100, max: 300000 },
    recoveryTimeoutMs: { min: 0, max: 3600000 },
    confidenceFloor: { min: 0, max: 1 }
};

function clamp(value: number, min: number, max: number): number {
    if (isNaN(value) || value < min) return min;
    if (value > max) return max;
    return value;
}

// ============= Apply Kernel =============

/**
 * Merge kernel physics with defaults to produce effective config.
 */
export function applyKernel(
    physics: KernelPhysics,
    lawParams?: LawParameters
): EffectiveConfig {
    // Start with defaults
    const defaults = DEFAULT_PHYSICS;
    const configSource: 'kernel' | 'law' | 'defaults' =
        physics !== defaults ? 'kernel' : (lawParams ? 'law' : 'defaults');

    // Apply kernel physics with clamping
    const latencyThresholdMs = clamp(
        physics.max_safe_latency_ms ?? defaults.max_safe_latency_ms!,
        BOUNDS.latencyThresholdMs.min,
        BOUNDS.latencyThresholdMs.max
    );

    const errorRate = clamp(
        physics.error_threshold_rate ?? defaults.error_threshold_rate!,
        BOUNDS.errorThresholdRate.min,
        BOUNDS.errorThresholdRate.max
    );

    const confidenceFloor = clamp(
        physics.min_confidence_floor ?? defaults.min_confidence_floor!,
        BOUNDS.confidenceFloor.min,
        BOUNDS.confidenceFloor.max
    );

    const recoveryTimeoutMs = clamp(
        physics.recovery_timeout_ms ?? defaults.recovery_timeout_ms!,
        BOUNDS.recoveryTimeoutMs.min,
        BOUNDS.recoveryTimeoutMs.max
    );

    const probeIntervalMs = clamp(
        physics.probe_interval_ms ?? defaults.probe_interval_ms!,
        BOUNDS.probeIntervalMs.min,
        BOUNDS.probeIntervalMs.max
    );

    return {
        // Circuit breaker
        latencyThresholdMs,
        hazardThreshold: 1 - errorRate, // Invert for hazard threshold

        // Hysteresis
        minimumConfidenceThreshold: confidenceFloor,
        qualityFloor: confidenceFloor,
        minimumOpenDurationMs: recoveryTimeoutMs,
        recoveryCheckIntervalS: Math.max(1, Math.round(probeIntervalMs / 1000)),

        // Source
        configSource
    };
}

/**
 * Apply kernel physics on top of law parameters.
 * Kernel takes precedence when values differ.
 */
export function mergeKernelWithLaw(
    physics: KernelPhysics,
    lawParams: LawParameters
): EffectiveConfig {
    // Kernel physics override law params where specified
    const merged: KernelPhysics = {
        max_safe_latency_ms: physics.max_safe_latency_ms ?? lawParams.latency_threshold_ms,
        min_confidence_floor: physics.min_confidence_floor ?? lawParams.confidence_floor,
        error_threshold_rate: physics.error_threshold_rate ?? (lawParams.error_threshold_pct / 100),
        recovery_timeout_ms: physics.recovery_timeout_ms ?? lawParams.recovery_timeout_ms,
        probe_interval_ms: physics.probe_interval_ms ?? lawParams.probe_interval_ms
    };

    return applyKernel(merged, lawParams);
}

/**
 * Log effective config at boot (for debugging).
 */
export function logEffectiveConfig(config: EffectiveConfig): void {
    console.log('[Interlock] Effective Config:');
    console.log(`  latencyThresholdMs: ${config.latencyThresholdMs}`);
    console.log(`  hazardThreshold: ${config.hazardThreshold}`);
    console.log(`  minimumConfidenceThreshold: ${config.minimumConfidenceThreshold}`);
    console.log(`  recoveryCheckIntervalS: ${config.recoveryCheckIntervalS}`);
    console.log(`  configSource: ${config.configSource}`);
}
