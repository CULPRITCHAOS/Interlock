/**
 * Kernel Module Index
 * ====================
 * Exports all kernel-related utilities.
 */

export {
    loadKernel,
    getKernelProvenance,
    KernelProfile,
    KernelPhysics,
    KernelSource,
    KernelLoadResult,
    DEFAULT_PHYSICS,
    EMPTY_SOURCE
} from './kernelLoader.ts';

export {
    applyKernel,
    mergeKernelWithLaw,
    logEffectiveConfig,
    EffectiveConfig
} from './applyKernel.ts';

export {
    initKernelStamp,
    getKernelStamp,
    getCachedKernel,
    stampEvent,
    createKernelBootEvent,
    KernelStamp
} from './eventStamp.ts';

export {
    bootInterlock,
    writeEvent,
    BootResult
} from './boot.ts';
