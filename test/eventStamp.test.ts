/**
 * Event Stamp Tests
 * ==================
 * Tests that events are stamped with kernel provenance.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Note: Run with: npx vitest run test/eventStamp.test.ts

describe('eventStamp', () => {
    it('stamps events with kernel provenance', async () => {
        const { stampEvent, initKernelStamp } = await import('../services/kernel/index.ts');

        // Initialize (will use defaults since no kernel file)
        initKernelStamp();

        const event = {
            event_type: 'health_window',
            timestamp: new Date().toISOString(),
            domain: 'ollama'
        };

        const stamped = stampEvent(event);

        expect(stamped.kernel).toBeDefined();
        expect(stamped.kernel.schema_version).toBeDefined();
        expect(stamped.kernel.law_hash).toBeDefined();
        expect(stamped.event_type).toBe('health_window');
    });

    it('includes missing flag when kernel not found', async () => {
        const { getKernelStamp, initKernelStamp } = await import('../services/kernel/index.ts');

        // Force reinit with no kernel
        process.env.COGNITIVE_KERNEL_PATH = '/nonexistent/kernel.json';
        initKernelStamp();

        const stamp = getKernelStamp();

        expect(stamp.missing).toBe(true);
        expect(stamp.law_hash).toBe('default');
    });

    it('creates kernel_boot event', async () => {
        const { createKernelBootEvent, initKernelStamp } = await import('../services/kernel/index.ts');

        initKernelStamp();

        const effectiveConfig = {
            latencyThresholdMs: 500,
            hazardThreshold: 0.95
        };

        const bootEvent = createKernelBootEvent(effectiveConfig);

        expect(bootEvent.event_type).toBe('kernel_boot');
        expect(bootEvent.timestamp).toBeDefined();
        expect(bootEvent.kernel).toBeDefined();
        expect(bootEvent.effective_config).toEqual(effectiveConfig);
        expect(bootEvent.loaded_from).toBeDefined();
    });
});
