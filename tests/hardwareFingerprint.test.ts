/**
 * Hardware Fingerprint Tests
 * ==========================
 * Tests for:
 * 1. Fingerprint presence (always stamped)
 * 2. Fingerprint stability (same machine = same hash)
 * 3. Hardware gated by env flag
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getHardwareFingerprint,
    getHardwareDetails,
    getHardwareForStamp,
    isHardwareLoggingEnabled
} from '../services/kernel/hardwareFingerprint';

describe('Hardware Fingerprint', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.INTERLOCK_INCLUDE_HARDWARE;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('getHardwareFingerprint', () => {
        it('should return a valid SHA256 hash (64 hex chars)', () => {
            const fp = getHardwareFingerprint();
            expect(fp).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should be stable across multiple calls', () => {
            const fp1 = getHardwareFingerprint();
            const fp2 = getHardwareFingerprint();
            expect(fp1).toBe(fp2);
        });
    });

    describe('getHardwareDetails', () => {
        it('should contain required fields', () => {
            const details = getHardwareDetails();
            expect(details.cpu_model).toBeDefined();
            expect(details.cpu_threads).toBeGreaterThan(0);
            expect(details.ram_gb).toBeGreaterThan(0);
            expect(details.os_name).toBeDefined();
            expect(details.os_version).toBeDefined();
        });
    });

    describe('getHardwareForStamp', () => {
        it('should always include hardware_fingerprint', () => {
            const stamp = getHardwareForStamp();
            expect(stamp.hardware_fingerprint).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should NOT include full hardware by default', () => {
            delete process.env.INTERLOCK_INCLUDE_HARDWARE;
            const stamp = getHardwareForStamp();
            expect(stamp.hardware).toBeUndefined();
        });

        it('should include full hardware when env flag is set', () => {
            process.env.INTERLOCK_INCLUDE_HARDWARE = '1';
            const stamp = getHardwareForStamp();
            expect(stamp.hardware).toBeDefined();
            expect(stamp.hardware?.cpu_model).toBeDefined();
            expect(stamp.hardware?.cpu_threads).toBeGreaterThan(0);
            expect(stamp.hardware?.ram_gb).toBeGreaterThan(0);
        });
    });

    describe('isHardwareLoggingEnabled', () => {
        it('should return false by default', () => {
            delete process.env.INTERLOCK_INCLUDE_HARDWARE;
            expect(isHardwareLoggingEnabled()).toBe(false);
        });

        it('should return true when INTERLOCK_INCLUDE_HARDWARE=1', () => {
            process.env.INTERLOCK_INCLUDE_HARDWARE = '1';
            expect(isHardwareLoggingEnabled()).toBe(true);
        });

        it('should return false for other values', () => {
            process.env.INTERLOCK_INCLUDE_HARDWARE = 'true';
            expect(isHardwareLoggingEnabled()).toBe(false);
            process.env.INTERLOCK_INCLUDE_HARDWARE = 'yes';
            expect(isHardwareLoggingEnabled()).toBe(false);
        });
    });
});
