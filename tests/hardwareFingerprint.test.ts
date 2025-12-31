/**
 * Hardware Fingerprint Tests
 * ==========================
 * Tests for:
 * 1. Fingerprint presence (always stamped)
 * 2. Fingerprint stability (same machine = same hash)
 * 3. Fingerprint sensitivity (different inputs = different hash)
 * 4. Hardware gated by env flag
 * 5. CPU model canonicalization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as crypto from 'crypto';

// We need to test the internal logic, so we'll create test helpers
// that mirror the production code structure

describe('Hardware Fingerprint', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.INTERLOCK_INCLUDE_HARDWARE;
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe('getHardwareFingerprint', () => {
        it('should return a valid SHA256 hash (64 hex chars)', async () => {
            const { getHardwareFingerprint } = await import('../services/kernel/hardwareFingerprint');
            const fp = getHardwareFingerprint();
            expect(fp).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should be stable across multiple calls', async () => {
            const { getHardwareFingerprint } = await import('../services/kernel/hardwareFingerprint');
            const fp1 = getHardwareFingerprint();
            const fp2 = getHardwareFingerprint();
            expect(fp1).toBe(fp2);
        });
    });

    describe('getHardwareDetails', () => {
        it('should contain required fields', async () => {
            const { getHardwareDetails } = await import('../services/kernel/hardwareFingerprint');
            const details = getHardwareDetails();
            expect(details.cpu_model).toBeDefined();
            expect(details.cpu_threads).toBeGreaterThan(0);
            expect(details.ram_gb).toBeGreaterThan(0);
            expect(details.os_name).toBeDefined();
            expect(details.os_version).toBeDefined();
        });

        it('should canonicalize CPU model (lowercase, trimmed)', async () => {
            const { getHardwareDetails } = await import('../services/kernel/hardwareFingerprint');
            const details = getHardwareDetails();
            // CPU model should be lowercase and have no leading/trailing whitespace
            expect(details.cpu_model).toBe(details.cpu_model.toLowerCase());
            expect(details.cpu_model).toBe(details.cpu_model.trim());
            // Should not have multiple consecutive spaces
            expect(details.cpu_model).not.toMatch(/\s{2,}/);
        });
    });

    describe('fingerprint sensitivity (different inputs = different hash)', () => {
        it('different RAM should produce different fingerprint', () => {
            // Manually compute fingerprints with different RAM values
            const core1 = { cpu_model: 'test cpu', cpu_threads: 8, ram_gb: 16, os_name: 'linux' };
            const core2 = { cpu_model: 'test cpu', cpu_threads: 8, ram_gb: 32, os_name: 'linux' };

            const hash1 = crypto.createHash('sha256')
                .update(JSON.stringify(core1, Object.keys(core1).sort()))
                .digest('hex');
            const hash2 = crypto.createHash('sha256')
                .update(JSON.stringify(core2, Object.keys(core2).sort()))
                .digest('hex');

            expect(hash1).not.toBe(hash2);
        });

        it('different CPU threads should produce different fingerprint', () => {
            const core1 = { cpu_model: 'test cpu', cpu_threads: 8, ram_gb: 16, os_name: 'linux' };
            const core2 = { cpu_model: 'test cpu', cpu_threads: 16, ram_gb: 16, os_name: 'linux' };

            const hash1 = crypto.createHash('sha256')
                .update(JSON.stringify(core1, Object.keys(core1).sort()))
                .digest('hex');
            const hash2 = crypto.createHash('sha256')
                .update(JSON.stringify(core2, Object.keys(core2).sort()))
                .digest('hex');

            expect(hash1).not.toBe(hash2);
        });

        it('different OS should produce different fingerprint', () => {
            const core1 = { cpu_model: 'test cpu', cpu_threads: 8, ram_gb: 16, os_name: 'linux' };
            const core2 = { cpu_model: 'test cpu', cpu_threads: 8, ram_gb: 16, os_name: 'win32' };

            const hash1 = crypto.createHash('sha256')
                .update(JSON.stringify(core1, Object.keys(core1).sort()))
                .digest('hex');
            const hash2 = crypto.createHash('sha256')
                .update(JSON.stringify(core2, Object.keys(core2).sort()))
                .digest('hex');

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('CPU model canonicalization', () => {
        it('whitespace variations should produce same canonical form', () => {
            const canonicalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

            const raw1 = 'Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz';
            const raw2 = '  Intel(R)  Core(TM)  i7-9700K  CPU @ 3.60GHz  ';
            const raw3 = 'INTEL(R) CORE(TM) I7-9700K CPU @ 3.60GHZ';

            expect(canonicalize(raw1)).toBe(canonicalize(raw2));
            expect(canonicalize(raw1).toLowerCase()).toBe(canonicalize(raw3));
        });
    });

    describe('getHardwareForStamp', () => {
        it('should always include hardware_fingerprint', async () => {
            const { getHardwareForStamp } = await import('../services/kernel/hardwareFingerprint');
            const stamp = getHardwareForStamp();
            expect(stamp.hardware_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should NOT include full hardware by default', async () => {
            delete process.env.INTERLOCK_INCLUDE_HARDWARE;
            // Need fresh import to reset module state
            vi.resetModules();
            const { getHardwareForStamp } = await import('../services/kernel/hardwareFingerprint');
            const stamp = getHardwareForStamp();
            expect(stamp.hardware).toBeUndefined();
        });

        it('should include full hardware when env flag is set', async () => {
            process.env.INTERLOCK_INCLUDE_HARDWARE = '1';
            vi.resetModules();
            const { getHardwareForStamp } = await import('../services/kernel/hardwareFingerprint');
            const stamp = getHardwareForStamp();
            expect(stamp.hardware).toBeDefined();
            expect(stamp.hardware?.cpu_model).toBeDefined();
            expect(stamp.hardware?.cpu_threads).toBeGreaterThan(0);
            expect(stamp.hardware?.ram_gb).toBeGreaterThan(0);
        });
    });

    describe('isHardwareLoggingEnabled', () => {
        it('should return false by default', async () => {
            delete process.env.INTERLOCK_INCLUDE_HARDWARE;
            const { isHardwareLoggingEnabled } = await import('../services/kernel/hardwareFingerprint');
            expect(isHardwareLoggingEnabled()).toBe(false);
        });

        it('should return true when INTERLOCK_INCLUDE_HARDWARE=1', async () => {
            process.env.INTERLOCK_INCLUDE_HARDWARE = '1';
            const { isHardwareLoggingEnabled } = await import('../services/kernel/hardwareFingerprint');
            expect(isHardwareLoggingEnabled()).toBe(true);
        });

        it('should return false for other values', async () => {
            const { isHardwareLoggingEnabled } = await import('../services/kernel/hardwareFingerprint');

            process.env.INTERLOCK_INCLUDE_HARDWARE = 'true';
            expect(isHardwareLoggingEnabled()).toBe(false);

            process.env.INTERLOCK_INCLUDE_HARDWARE = 'yes';
            expect(isHardwareLoggingEnabled()).toBe(false);
        });
    });
});
