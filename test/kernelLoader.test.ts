/**
 * Kernel Loader Tests
 * ====================
 * Tests that kernel loading works correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Note: These tests assume vitest is available. 
// Run with: npx vitest run test/kernelLoader.test.ts

describe('kernelLoader', () => {
    const testDir = path.join(os.tmpdir(), 'interlock-kernel-test');
    const testKernelPath = path.join(testDir, 'test_kernel.json');

    beforeEach(() => {
        // Clean up before each test
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        // Clean up after each test
        delete process.env.COGNITIVE_KERNEL_PATH;
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    it('loads kernel via env var', async () => {
        // Create test kernel
        const testKernel = {
            schema_version: '0.2.0',
            source: {
                domain: 'ollama',
                packet_id: 'test_packet_123',
                quality_level: 'L2-StressBattery',
                law_hash: 'abc123'
            },
            physics: {
                max_safe_latency_ms: 1500,
                min_confidence_floor: 0.7,
                error_threshold_rate: 0.03
            }
        };

        fs.writeFileSync(testKernelPath, JSON.stringify(testKernel, null, 2));
        process.env.COGNITIVE_KERNEL_PATH = testKernelPath;

        // Clear module cache to force reload
        const { loadKernel } = await import('../services/kernel/kernelLoader.ts');

        const result = loadKernel();

        expect(result.success).toBe(true);
        expect(result.physics.max_safe_latency_ms).toBe(1500);
        expect(result.physics.min_confidence_floor).toBe(0.7);
        expect(result.source.packet_id).toBe('test_packet_123');
        expect(result.source.law_hash).toBe('abc123');
    });

    it('falls back to defaults when kernel missing', async () => {
        process.env.COGNITIVE_KERNEL_PATH = '/nonexistent/path/kernel.json';

        const { loadKernel, DEFAULT_PHYSICS } = await import('../services/kernel/kernelLoader.ts');

        const result = loadKernel();

        expect(result.success).toBe(false);
        expect(result.physics.max_safe_latency_ms).toBe(DEFAULT_PHYSICS.max_safe_latency_ms);
        expect(result.loadedFrom).toBe('defaults');
    });

    it('warns on unsupported schema version', async () => {
        const badKernel = {
            schema_version: '99.0.0',
            physics: { max_safe_latency_ms: 999 }
        };

        fs.writeFileSync(testKernelPath, JSON.stringify(badKernel));
        process.env.COGNITIVE_KERNEL_PATH = testKernelPath;

        const { loadKernel, DEFAULT_PHYSICS } = await import('../services/kernel/kernelLoader.ts');

        const result = loadKernel();

        // Should fall back to defaults
        expect(result.physics.max_safe_latency_ms).toBe(DEFAULT_PHYSICS.max_safe_latency_ms);
        expect(result.warnings.some(w => w.includes('Unsupported'))).toBe(true);
    });

    it('handles invalid JSON gracefully', async () => {
        fs.writeFileSync(testKernelPath, '{ invalid json }');
        process.env.COGNITIVE_KERNEL_PATH = testKernelPath;

        const { loadKernel, DEFAULT_PHYSICS } = await import('../services/kernel/kernelLoader.ts');

        const result = loadKernel();

        expect(result.success).toBe(false);
        expect(result.physics.max_safe_latency_ms).toBe(DEFAULT_PHYSICS.max_safe_latency_ms);
        expect(result.warnings.some(w => w.includes('Failed to parse'))).toBe(true);
    });
});
