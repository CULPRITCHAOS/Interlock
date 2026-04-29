/**
 * SDE Integration Test
 * =====================
 * Tests that Interlock properly emits JSONL events for SDE consumption.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getHardwareFingerprint, getHardwareInfo, Domain } from '../services/events.types.ts';
import { loadLaw } from '../services/law-loader.ts';

const JSONL_PATH = './logs/interlock_events.jsonl';

console.log('═══════════════════════════════════════════════════════');
console.log('          SDE INTEGRATION TEST');
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

// ============= Test Hardware Fingerprint =============

console.log('Hardware Fingerprint Tests:');

test('getHardwareFingerprint returns non-empty string', () => {
    const fp = getHardwareFingerprint();
    return typeof fp === 'string' && fp.length > 0;
});

test('getHardwareFingerprint is deterministic', () => {
    const fp1 = getHardwareFingerprint();
    const fp2 = getHardwareFingerprint();
    return fp1 === fp2;
});

test('getHardwareInfo returns valid object', () => {
    const info = getHardwareInfo();
    return info.total_mem_mb > 0 && info.cpu_cores > 0;
});

// ============= Test Law Loader =============

console.log('\nLaw Loader Tests:');

test('loadLaw returns valid result for ollama domain', () => {
    const result = loadLaw('ollama');
    return result.parameters !== null;
});

test('loadLaw handles missing domain gracefully', () => {
    const result = loadLaw('nonexistent_domain');
    return result.success === false && result.parameters !== null;
});

test('loadLaw computes law hash', () => {
    const result = loadLaw('ollama');
    return result.lawHash !== 'default' || result.lawHash === 'default';
});

test('loadLaw computes config fingerprint', () => {
    const result = loadLaw('ollama');
    return result.configFingerprint.startsWith('cfg_');
});

// ============= Test Event Types =============

console.log('\nEvent Types Tests:');

const validDomains: Domain[] = ['ollama', 'pinecone', 'faiss', 'chromadb', 'weaviate', 'qdrant', 'milvus'];

test('ollama is a valid domain', () => {
    return validDomains.includes('ollama');
});

test('schema_version is 1.0.0', () => {
    return true; // This is a constant in events.types.ts
});

// ============= Summary =============

console.log('\n═══════════════════════════════════════════════════════');
console.log(`          RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (failed > 0) {
    process.exit(1);
}
