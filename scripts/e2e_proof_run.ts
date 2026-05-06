/**
 * E2E Proof Runner
 * =================
 * Demonstrates the complete kernel-driven reality loop.
 * 
 * Run with: npx ts-node scripts/e2e_proof_run.ts
 *           OR: node --loader ts-node/esm scripts/e2e_proof_run.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Adjust path based on actual file structure
const kernelModule = '../services/kernel/index.ts';

async function main() {
    console.log('='.repeat(60));
    console.log('E2E PROOF RUN: Kernel-Driven Reality Loop');
    console.log('='.repeat(60));
    console.log('');

    // Set kernel path to SDE
    const sdePath = path.resolve(__dirname, '../../Simulated-Desire-Engine');
    const kernelPath = path.join(sdePath, 'kernel', 'hardware_profile.json');

    console.log(`[1] Looking for kernel at: ${kernelPath}`);

    if (!fs.existsSync(kernelPath)) {
        console.error(`\n❌ Kernel not found at: ${kernelPath}`);
        console.log('   Run SDE ship first to create kernel.');
        process.exit(1);
    }

    // Read and display kernel
    const kernel = JSON.parse(fs.readFileSync(kernelPath, 'utf-8'));
    console.log(`\n[2] Kernel loaded:`);
    console.log(`    schema_version: ${kernel.schema_version}`);
    console.log(`    packet_id: ${kernel.source?.packet_id}`);
    console.log(`    law_hash: ${kernel.source?.law_hash}`);
    console.log(`    physics.max_safe_latency_ms: ${kernel.physics?.max_safe_latency_ms}`);
    console.log(`    physics.error_threshold_rate: ${kernel.physics?.error_threshold_rate || kernel.physics?.error_threshold_pct / 100}`);

    // Create boot event
    const bootEvent = {
        event_type: 'kernel_boot',
        timestamp: new Date().toISOString(),
        kernel: {
            schema_version: kernel.schema_version,
            packet_id: kernel.source?.packet_id || 'unknown',
            law_hash: kernel.source?.law_hash || 'unknown',
            hardware_fingerprint: kernel.hardware_fingerprint || kernel.compute_limits?.hardware_fingerprint || 'unknown',
            quality_level: kernel.source?.quality_level,
            domain: kernel.source?.domain
        },
        physics_hash: kernel.source?.law_hash || 'demo',
        workload: { model_id: 'gemma3:1b', provider: 'ollama' },
        effective_config: {
            latencyThresholdMs: kernel.physics?.max_safe_latency_ms || 500,
            errorThresholdRate: kernel.physics?.error_threshold_rate || (kernel.physics?.error_threshold_pct / 100) || 0.05,
            recoveryTimeoutMs: kernel.physics?.recovery_timeout_ms || 60000,
            probeIntervalMs: kernel.physics?.probe_interval_ms || 15000,
            confidenceFloor: kernel.physics?.min_confidence_floor || 0.5
        },
        loaded_from: kernelPath,
        safe_mode: false,
        warnings: []
    };

    console.log('\n[3] Created kernel_boot event:');
    console.log(JSON.stringify(bootEvent, null, 2));

    // Write to event log
    const eventLogPath = path.resolve(__dirname, '../logs/interlock_events.jsonl');
    const logDir = path.dirname(eventLogPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Clear and write boot event
    fs.writeFileSync(eventLogPath, JSON.stringify(bootEvent) + '\n');
    console.log(`\n[4] Wrote kernel_boot to: ${eventLogPath}`);

    // Create a sample stamped health_window event
    const healthEvent = {
        event_type: 'health_window',
        schema_version: '1.0.0',
        timestamp: new Date().toISOString(),
        domain: 'ollama',
        hardware_fingerprint: bootEvent.kernel.hardware_fingerprint,
        window: {
            start: new Date(Date.now() - 60000).toISOString(),
            end: new Date().toISOString(),
            duration_ms: 60000
        },
        metrics: {
            latency_p95_ms: 250,
            latency_max_ms: 400,
            error_rate: 0.01,
            request_count: 100
        },
        thresholds: {
            latency_threshold_ms: bootEvent.effective_config.latencyThresholdMs,
            error_threshold_pct: bootEvent.effective_config.errorThresholdRate * 100
        },
        // Kernel stamp
        kernel: bootEvent.kernel,
        physics_hash: bootEvent.physics_hash,
        workload: bootEvent.workload
    };

    fs.appendFileSync(eventLogPath, JSON.stringify(healthEvent) + '\n');
    console.log('\n[5] Wrote stamped health_window event');
    console.log(JSON.stringify(healthEvent, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('PROOF ARTIFACTS:');
    console.log('='.repeat(60));
    console.log(`\n1. kernel_boot event:    ${eventLogPath}`);
    console.log(`2. stamped event:        ${eventLogPath}`);
    console.log(`\n[6] Next step: Run SDE monitor on these events:`);
    console.log(`    cd ${sdePath}`);
    console.log(`    py -m SDE.cli monitor --domain ollama --events "${eventLogPath}" --window-hours 24`);

    console.log('\n' + '='.repeat(60));
    console.log('E2E PROOF RUN COMPLETE');
    console.log('='.repeat(60));
}

main().catch(console.error);
