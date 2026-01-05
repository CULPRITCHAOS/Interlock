/**
 * Kernel Module Index
 * ====================
 * Exports all kernel-related utilities.
 */

export {
    loadKernel,
    getKernelProvenance,
    DEFAULT_PHYSICS,
    EMPTY_SOURCE
} from './kernelLoader.ts';

export type {
    KernelProfile,
    KernelPhysics,
    KernelSource,
    KernelLoadResult
} from './kernelLoader.ts';

export {
    applyKernel,
    mergeKernelWithLaw,
    logEffectiveConfig
} from './applyKernel.ts';

export type { EffectiveConfig } from './applyKernel.ts';

export {
    initKernelStamp,
    getKernelStamp,
    getCachedKernel,
    stampEvent,
    createKernelBootEvent
} from './eventStamp.ts';

export type { KernelStamp } from './eventStamp.ts';

export {
    bootInterlock,
    writeEvent
} from './boot.ts';

export type { BootResult } from './boot.ts';
