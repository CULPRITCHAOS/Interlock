/**
 * Interlock Boot Integration
 * ===========================
 * Call this at application startup to wire kernel physics into Interlock.
 * 
 * Usage:
 *   import { bootInterlock } from './services/kernel/boot';
 *   const bootResult = bootInterlock();
 *   // bootResult.bootEvent contains the kernel_boot event
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    loadKernel,
    KernelLoadResult
} from './kernelLoader.ts';
import {
    applyKernel,
    logEffectiveConfig,
    EffectiveConfig
} from './applyKernel.ts';
import {
    initKernelStamp,
    createKernelBootEvent
} from './eventStamp.ts';

// Event log path
const DEFAULT_EVENT_LOG = './logs/interlock_events.jsonl';

export interface BootResult {
    kernel: KernelLoadResult;
    config: EffectiveConfig;
    bootEvent: ReturnType<typeof createKernelBootEvent>;
    eventLogPath: string;
}

/**
 * Write an event to the event log.
 */
function writeEvent(event: Record<string, unknown>, logPath: string): void {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
}

/**
 * Boot Interlock with kernel physics.
 * 
 * This is the main entry point called at application startup.
 * Returns the boot event for logging.
 * 
 * @param eventLogPath Path to the event log file
 * @param workload Optional workload identity (defaults to gemma3:12b if not provided)
 */
export function bootInterlock(
    eventLogPath: string = DEFAULT_EVENT_LOG,
    workload?: { model_id: string; provider: string }
): BootResult {
    console.log('\n========================================');
    console.log('INTERLOCK KERNEL BOOT');
    console.log('========================================\n');

    // Default workload if not provided (SDE Contract Requirement)
    const effectiveWorkload = workload ?? {
        model_id: 'gemma3:1b',
        provider: 'ollama'
    };

    // 1. Load kernel from disk
    const kernel = loadKernel();

    // 2. Apply kernel physics to get effective config
    const config = applyKernel(kernel.physics);

    // 3. Initialize event stamping with workload identity
    initKernelStamp(effectiveWorkload);

    // 4. Log effective config
    logEffectiveConfig(config);

    // 5. Create boot event
    const bootEvent = createKernelBootEvent(config);

    // 6. Write boot event to log
    writeEvent(bootEvent, eventLogPath);
    console.log(`\n[Interlock] kernel_boot event written to: ${eventLogPath}`);
    console.log(`[Interlock] Workload Identity: ${effectiveWorkload.model_id} (${effectiveWorkload.provider})`);

    // 7. Summary
    console.log('\n========================================');
    console.log('KERNEL BOOT COMPLETE');
    console.log('========================================\n');

    if (!kernel.success) {
        console.log('⚠️  Running in SAFE MODE - no kernel found');
    } else {
        console.log(`✅ Kernel loaded: ${kernel.loadedFrom}`);
        console.log(`   packet_id: ${kernel.source.packet_id}`);
        console.log(`   law_hash: ${kernel.source.law_hash}`);
    }

    return {
        kernel,
        config,
        bootEvent,
        eventLogPath
    };
}

// Export for convenience
export { writeEvent };
