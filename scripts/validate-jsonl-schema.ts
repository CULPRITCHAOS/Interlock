/**
 * JSONL Schema Validation
 * ========================
 * Validates that emitted events conform to SDE's interlock_event.schema.json
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = './schemas/interlock_event.schema.json';
const GOLDEN_FIXTURE_PATH = './schemas/golden_fixture.jsonl';

console.log('═══════════════════════════════════════════════════════');
console.log('          JSONL SCHEMA VALIDATION');
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

// ============= Load Schema =============

test('Schema file exists', () => {
    return fs.existsSync(SCHEMA_PATH);
});

let schema: any = null;
try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
} catch (e) {
    console.log('  ❌ Failed to load schema');
    process.exit(1);
}

test('Schema has valid $schema', () => {
    return schema.$schema === 'http://json-schema.org/draft-07/schema#';
});

test('Schema has oneOf with intervention and health_window', () => {
    return schema.oneOf && schema.oneOf.length === 2;
});

test('Schema defines intervention_event', () => {
    return schema.definitions?.intervention_event !== undefined;
});

test('Schema defines health_window_event', () => {
    return schema.definitions?.health_window_event !== undefined;
});

// ============= Validate Golden Fixture =============

console.log('\nGolden Fixture Tests:');

test('Golden fixture file exists', () => {
    return fs.existsSync(GOLDEN_FIXTURE_PATH);
});

if (fs.existsSync(GOLDEN_FIXTURE_PATH)) {
    const lines = fs.readFileSync(GOLDEN_FIXTURE_PATH, 'utf-8').trim().split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const event = JSON.parse(line);

            test(`Golden fixture line ${i + 1} has event_type`, () => {
                return event.event_type === 'intervention' || event.event_type === 'health_window';
            });

            test(`Golden fixture line ${i + 1} has schema_version 1.0.0`, () => {
                return event.schema_version === '1.0.0';
            });

            test(`Golden fixture line ${i + 1} has hardware_fingerprint`, () => {
                return typeof event.hardware_fingerprint === 'string' && event.hardware_fingerprint.length > 0;
            });

            test(`Golden fixture line ${i + 1} has ISO timestamp`, () => {
                const ts = event.timestamp;
                return typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts);
            });

            test(`Golden fixture line ${i + 1} has valid domain`, () => {
                const validDomains = ['ollama', 'pinecone', 'faiss', 'chromadb', 'weaviate', 'qdrant', 'milvus'];
                return validDomains.includes(event.domain);
            });
        } catch (e) {
            test(`Golden fixture line ${i + 1} is valid JSON`, () => false);
        }
    }
}

// ============= Summary =============

console.log('\n═══════════════════════════════════════════════════════');
console.log(`          RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (failed > 0) {
    process.exit(1);
}
