/**
 * Interlock Core
 * ===============
 * Domain-agnostic core with pluggable adapters.
 * 
 * Exports:
 * - Adapter types and registry
 * - Kernel boot and stamping
 */

// Adapters
export * from './adapters';

// Boot
export {
    loadKernel,
    buildEffectiveConfig,
    createBootEvent,
    bootInterlock,
    initStamping,
    stampEvent,
    computePhysicsHash
} from './boot';

export type {
    KernelLoadResult,
    EffectiveConfig,
    KernelBootEvent,
    BootResult
} from './boot';
