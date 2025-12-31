
import { bootInterlock } from '../services/kernel/boot';
import { stampEvent } from '../services/kernel/eventStamp';
import * as fs from 'fs';
import * as path from 'path';

const LOG_PATH = './logs/interlock_verification.jsonl';

// Clean previous run
if (fs.existsSync(LOG_PATH)) {
    fs.unlinkSync(LOG_PATH);
}

console.log('--- Starting Provenance Verification ---');

// 1. Boot with explicit workload
const bootResult = bootInterlock(LOG_PATH, {
    model_id: 'gemma3:12b-VERIFY',
    provider: 'ollama'
});

console.log('\n--- Boot Result ---');
console.log('Physics Hash:', bootResult.bootEvent.physics_hash);
console.log('Workload:', bootResult.bootEvent.workload);

// 2. Stamp a test event
const testEvent = {
    event_type: 'inference',
    timestamp: new Date().toISOString(),
    data: 'test'
};

const stamped = stampEvent(testEvent);
console.log('\n--- Stamped Event ---');
console.log('Kernel Physics Hash:', stamped.kernel.physics_hash);
console.log('Kernel Workload:', stamped.kernel.workload);

// 3. Verify Log
const logContent = fs.readFileSync(LOG_PATH, 'utf-8');
const bootEntry = JSON.parse(logContent.trim().split('\n')[0]);

if (bootEntry.workload?.model_id === 'gemma3:12b-VERIFY' && bootEntry.physics_hash) {
    console.log('\n✅ VERIFICATION SUCCESS: Workload and Physics Hash present in logs.');
} else {
    console.error('\n❌ VERIFICATION FAILED: Stamping missing.');
    process.exit(1);
}
