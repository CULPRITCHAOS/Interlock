/**
 * Law Loader Validation
 * ======================
 * Validates law loading functionality including hardware fingerprint mismatch handling.
 */

import { loadLaw, mapLawToHysteresisConfig, mapLawToCircuitBreakerConfig } from '../services/law-loader.ts';
import { DEFAULT_LAW_PARAMETERS } from '../services/law.types.ts';
import { getHardwareFingerprint } from '../services/events.types.ts';

console.log('═══════════════════════════════════════════════════════');
console.log('          LAW LOADER VALIDATION');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
    try {
        const result = fn();
        if (result) {
            console.log(`  ✅ ${name}`);
            passed++;
        } else {
            console.log(`  ❌ ${name}`);
            failed++;
        }
    } catch (error) {
        console.log(`  ❌ ${name}: ${error}`);
        failed++;
    }
}

// ============= Test Law Loading =============

console.log('Law Loading Tests:');

test('Load ollama law successfully', () => {
    const result = loadLaw('ollama');
    return result.success === true;
});

test('Ollama law has correct domain', () => {
    const result = loadLaw('ollama');
    return result.law?.domain === 'ollama';
});

test('Ollama law has schema_version 1.0.0', () => {
    const result = loadLaw('ollama');
    return result.law?.schema_version === '1.0.0';
});

test('Ollama law parameters are loaded', () => {
    const result = loadLaw('ollama');
    return result.parameters.latency_threshold_ms > 0;
});

// ============= Test Hardware Fingerprint Handling =============

console.log('\nHardware Fingerprint Tests:');

test('Current hardware fingerprint is generated', () => {
    const fp = getHardwareFingerprint();
    return typeof fp === 'string' && /^[a-f0-9]{16}$|^[a-f0-9]{64}$/.test(fp);
});

test('Ollama law has null hardware_fingerprint (accept all)', () => {
    const result = loadLaw('ollama');
    return result.law?.hardware_fingerprint === null;
});

// ============= Test Missing Domain Handling =============

console.log('\nMissing Domain Tests:');

test('Missing domain returns success=false', () => {
    const result = loadLaw('nonexistent');
    return result.success === false;
});

test('Missing domain has no warnings in demo-default mode', () => {
    const result = loadLaw('nonexistent');
    return result.warnings.length === 0;
});

test('Missing domain falls back to defaults', () => {
    const result = loadLaw('nonexistent');
    return result.parameters.latency_threshold_ms === DEFAULT_LAW_PARAMETERS.latency_threshold_ms;
});

// ============= Test Config Mapping =============

console.log('\nConfig Mapping Tests:');

test('mapLawToHysteresisConfig returns valid config', () => {
    const result = loadLaw('ollama');
    const hystConfig = mapLawToHysteresisConfig(result.parameters);
    return hystConfig.minimumConfidenceThreshold !== undefined;
});

test('mapLawToCircuitBreakerConfig returns valid config', () => {
    const result = loadLaw('ollama');
    const cbConfig = mapLawToCircuitBreakerConfig(result.parameters);
    return cbConfig.latencyThresholdMs !== undefined;
});

test('Confidence floor is mapped correctly', () => {
    const result = loadLaw('ollama');
    const hystConfig = mapLawToHysteresisConfig(result.parameters);
    return hystConfig.minimumConfidenceThreshold === result.parameters.confidence_floor;
});

// ============= Test Hash Computation =============

console.log('\nHash Computation Tests:');

test('Law hash is computed', () => {
    const result = loadLaw('ollama');
    return result.lawHash !== 'default' && result.lawHash.length > 0;
});

test('Config fingerprint starts with cfg_', () => {
    const result = loadLaw('ollama');
    return result.configFingerprint.startsWith('cfg_');
});

test('Law hash is deterministic', () => {
    const result1 = loadLaw('ollama');
    const result2 = loadLaw('ollama');
    return result1.lawHash === result2.lawHash;
});

// ============= Summary =============

console.log('\n═══════════════════════════════════════════════════════');
console.log(`          RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (failed > 0) {
    process.exit(1);
}
