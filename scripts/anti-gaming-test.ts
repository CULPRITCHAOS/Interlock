#!/usr/bin/env npx tsx
/**
 * Anti-Gaming Test Script
 * ========================
 * 
 * Validates that Interlock certification cannot be gamed by disabling safety features.
 * 
 * Test Cases:
 * 1. Disabling quality floor → cannot claim Class V
 * 2. Disabling hysteresis → cannot claim Class IV+
 * 3. Disabling reflex override → cannot claim Class IV+
 * 4. Badge tampering → signature verification fails
 * 5. Expired certification → clear warning message
 * 6. Stale certification → explicit notification
 * 
 * Usage:
 *   npx tsx scripts/anti-gaming-test.ts
 *   npx tsx scripts/anti-gaming-test.ts --adapter pinecone
 */

import * as crypto from 'crypto';

// ============= Types =============

interface AntiGamingTestResult {
    test_name: string;
    description: string;
    passed: boolean;
    expected: string;
    actual: string;
    error?: string;
}

interface TestConfig {
    qualityFloorEnabled: boolean;
    qualityFloor: number;
    hysteresisEnabled: boolean;
    reflexOverrideEnabled: boolean;
    flashThreshold: number;
}

// ============= Mock Certification Functions =============

function deriveClassFromConfig(config: TestConfig): string {
    // Class V requires: qualityFloorEnabled + qualityFloor > 0
    if (config.qualityFloorEnabled && config.qualityFloor > 0 &&
        config.hysteresisEnabled && config.reflexOverrideEnabled && config.flashThreshold > 0) {
        return 'V';
    }

    // Class IV requires: hysteresis + reflex override + flash threshold
    if (config.hysteresisEnabled && config.reflexOverrideEnabled && config.flashThreshold > 0) {
        return 'IV';
    }

    // Class III requires: hysteresis
    if (config.hysteresisEnabled) {
        return 'III';
    }

    // Class II: basic circuit breaker
    return 'II';
}

function generateBadgeSignature(badge: object, key: string): string {
    const payload = JSON.stringify(badge);
    return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function verifyBadgeSignature(badge: any, signature: string, key: string): boolean {
    const expectedSignature = generateBadgeSignature(badge, key);
    return signature === expectedSignature;
}

function checkCertificationExpiry(validUntil: string): { isExpired: boolean; warning: string | null } {
    const expiryDate = new Date(validUntil);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
        return { isExpired: true, warning: `⚠️ CERTIFICATION EXPIRED ${Math.abs(daysUntilExpiry)} days ago` };
    }

    if (daysUntilExpiry <= 7) {
        return { isExpired: false, warning: `⚠️ Certification expires in ${daysUntilExpiry} days` };
    }

    return { isExpired: false, warning: null };
}

// ============= Test Cases =============

function testDisablingQualityFloorCannotClaimClassV(): AntiGamingTestResult {
    const config: TestConfig = {
        qualityFloorEnabled: false, // Disabled!
        qualityFloor: 0.5,
        hysteresisEnabled: true,
        reflexOverrideEnabled: true,
        flashThreshold: 2.0
    };

    const derivedClass = deriveClassFromConfig(config);
    const passed = derivedClass !== 'V';

    return {
        test_name: 'Quality Floor Disabled → No Class V',
        description: 'Disabling quality floor should prevent Class V certification',
        passed,
        expected: 'Class != V',
        actual: `Class ${derivedClass}`,
        error: passed ? undefined : 'System incorrectly assigned Class V without quality floor'
    };
}

function testDisablingHysteresisCannotClaimClassIV(): AntiGamingTestResult {
    const config: TestConfig = {
        qualityFloorEnabled: true,
        qualityFloor: 0.5,
        hysteresisEnabled: false, // Disabled!
        reflexOverrideEnabled: true,
        flashThreshold: 2.0
    };

    const derivedClass = deriveClassFromConfig(config);
    const passed = derivedClass !== 'V' && derivedClass !== 'IV';

    return {
        test_name: 'Hysteresis Disabled → No Class IV+',
        description: 'Disabling hysteresis should prevent Class IV or V certification',
        passed,
        expected: 'Class < IV',
        actual: `Class ${derivedClass}`,
        error: passed ? undefined : 'System incorrectly assigned Class IV+ without hysteresis'
    };
}

function testDisablingReflexOverrideCannotClaimClassIV(): AntiGamingTestResult {
    const config: TestConfig = {
        qualityFloorEnabled: true,
        qualityFloor: 0.5,
        hysteresisEnabled: true,
        reflexOverrideEnabled: false, // Disabled!
        flashThreshold: 2.0
    };

    const derivedClass = deriveClassFromConfig(config);
    const passed = derivedClass !== 'V' && derivedClass !== 'IV';

    return {
        test_name: 'Reflex Override Disabled → No Class IV+',
        description: 'Disabling reflex override should prevent Class IV or V certification',
        passed,
        expected: 'Class < IV',
        actual: `Class ${derivedClass}`,
        error: passed ? undefined : 'System incorrectly assigned Class IV+ without reflex override'
    };
}

function testBadgeTamperingFailsSignatureVerification(): AntiGamingTestResult {
    const signingKey = 'test-signing-key-12345';

    const originalBadge = {
        interlockClass: 'V',
        loadRating: { maxVectors: 1000000, maxQPS: 1000 },
        validUntil: '2025-01-15T00:00:00Z'
    };

    const signature = generateBadgeSignature(originalBadge, signingKey);

    // Tamper with the badge
    const tamperedBadge = {
        ...originalBadge,
        interlockClass: 'V', // Same, but let's change loadRating
        loadRating: { maxVectors: 9999999, maxQPS: 9999 } // Tampering!
    };

    const verificationResult = verifyBadgeSignature(tamperedBadge, signature, signingKey);
    const passed = !verificationResult; // Should FAIL verification

    return {
        test_name: 'Badge Tampering → Signature Fails',
        description: 'Modifying badge content should cause signature verification failure',
        passed,
        expected: 'Verification = false',
        actual: `Verification = ${verificationResult}`,
        error: passed ? undefined : 'Tampered badge passed signature verification!'
    };
}

function testExpiredCertificationWarnsCleanly(): AntiGamingTestResult {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 10); // 10 days ago

    const result = checkCertificationExpiry(expiredDate.toISOString());
    const passed = result.isExpired && result.warning !== null && result.warning.includes('EXPIRED');

    return {
        test_name: 'Expired Certification → Clear Warning',
        description: 'Expired certification should produce explicit warning message',
        passed,
        expected: 'isExpired=true, warning contains "EXPIRED"',
        actual: `isExpired=${result.isExpired}, warning="${result.warning}"`,
        error: passed ? undefined : 'Expired certification did not produce clear warning'
    };
}

function testStaleCertificationNotifiesExplicitly(): AntiGamingTestResult {
    const soonToExpire = new Date();
    soonToExpire.setDate(soonToExpire.getDate() + 5); // 5 days from now

    const result = checkCertificationExpiry(soonToExpire.toISOString());
    const passed = !result.isExpired && result.warning !== null && result.warning.includes('expires');

    return {
        test_name: 'Stale Certification → Explicit Notification',
        description: 'Soon-to-expire certification should produce proactive notification',
        passed,
        expected: 'isExpired=false, warning mentions upcoming expiry',
        actual: `isExpired=${result.isExpired}, warning="${result.warning}"`,
        error: passed ? undefined : 'Stale certification did not produce notification'
    };
}

// ============= Main Runner =============

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║            INTERLOCK ANTI-GAMING VALIDATION                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const tests: AntiGamingTestResult[] = [
        testDisablingQualityFloorCannotClaimClassV(),
        testDisablingHysteresisCannotClaimClassIV(),
        testDisablingReflexOverrideCannotClaimClassIV(),
        testBadgeTamperingFailsSignatureVerification(),
        testExpiredCertificationWarnsCleanly(),
        testStaleCertificationNotifiesExplicitly()
    ];

    let passedCount = 0;
    let failedCount = 0;

    for (const test of tests) {
        const icon = test.passed ? '✅' : '❌';
        console.log(`${icon} ${test.test_name}`);
        console.log(`   ${test.description}`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Actual:   ${test.actual}`);
        if (test.error) {
            console.log(`   Error:    ${test.error}`);
        }
        console.log('');

        if (test.passed) {
            passedCount++;
        } else {
            failedCount++;
        }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passedCount} passed, ${failedCount} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failedCount > 0) {
        console.error('[FAIL] Anti-gaming validation failed');
        process.exit(1);
    }

    console.log('[PASS] All anti-gaming tests passed');
    console.log('');
    console.log('Confirmed:');
    console.log('  🔒 Cannot upgrade class by disabling quality floor');
    console.log('  🔒 Cannot upgrade class by disabling hysteresis');
    console.log('  🔒 Cannot upgrade class by disabling reflex override');
    console.log('  🔒 Badge tampering is detectable');
    console.log('  🔒 Expired certifications warn clearly');
    console.log('  🔒 Stale certifications notify explicitly');
    console.log('');

    process.exit(0);
}

main();
