/**
 * Apply Kernel Tests
 * ===================
 * Tests that kernel physics are applied correctly.
 */

import { describe, it, expect } from 'vitest';

// Note: Run with: npx vitest run test/kernelApply.test.ts

describe('applyKernel', () => {
    it('overrides defaults with kernel physics', async () => {
        const { applyKernel, DEFAULT_PHYSICS } = await import('../services/kernel/index.ts');

        const physics = {
            max_safe_latency_ms: 1900,
            min_confidence_floor: 0.8,
            error_threshold_rate: 0.02
        };

        const config = applyKernel(physics);

        expect(config.latencyThresholdMs).toBe(1900);
        expect(config.minimumConfidenceThreshold).toBe(0.8);
        expect(config.hazardThreshold).toBeCloseTo(0.98, 2); // 1 - 0.02
    });

    it('clamps insane latency values', async () => {
        const { applyKernel } = await import('../services/kernel/index.ts');

        // Too low
        let config = applyKernel({ max_safe_latency_ms: 0 });
        expect(config.latencyThresholdMs).toBe(1); // clamped to min

        // Too high
        config = applyKernel({ max_safe_latency_ms: 999999 });
        expect(config.latencyThresholdMs).toBe(120000); // clamped to max
    });

    it('clamps error threshold to 0-1 range', async () => {
        const { applyKernel } = await import('../services/kernel/index.ts');

        // Negative
        let config = applyKernel({ error_threshold_rate: -0.5 });
        expect(config.hazardThreshold).toBe(1); // 1 - 0 = 1

        // > 1
        config = applyKernel({ error_threshold_rate: 1.5 });
        expect(config.hazardThreshold).toBe(0); // 1 - 1 = 0
    });

    it('handles NaN values', async () => {
        const { applyKernel, DEFAULT_PHYSICS } = await import('../services/kernel/index.ts');

        const config = applyKernel({
            max_safe_latency_ms: NaN,
            min_confidence_floor: NaN
        });

        // Should fall back to safe values
        expect(config.latencyThresholdMs).toBe(1); // clamped to min
        expect(config.minimumConfidenceThreshold).toBe(0); // clamped to min
    });

    it('converts probe_interval_ms to seconds correctly', async () => {
        const { applyKernel } = await import('../services/kernel/index.ts');

        const config = applyKernel({ probe_interval_ms: 5000 });
        expect(config.recoveryCheckIntervalS).toBe(5);

        const config2 = applyKernel({ probe_interval_ms: 500 });
        expect(config2.recoveryCheckIntervalS).toBe(1); // minimum 1 second
    });
});
