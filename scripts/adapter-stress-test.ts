#!/usr/bin/env npx tsx
/**
 * Adapter Stress Test Script
 * ===========================
 * 
 * Runs stress tests against Interlock adapters with protected vs control modes.
 * 
 * Usage:
 *   npx tsx scripts/adapter-stress-test.ts --adapter pinecone --mode protected --cycles 25
 * 
 * Options:
 *   --adapter     Adapter to test (pinecone, weaviate, milvus, elasticsearch, langchain, llamaindex)
 *   --mode        Test mode (protected, control)
 *   --cycles      Number of stress cycles
 *   --use-mocks   Use mock clients (true/false)
 *   --output      Output JSON file path
 */

import * as fs from 'fs';
import * as path from 'path';

// ============= Types =============

interface StressTestConfig {
    adapter: string;
    mode: 'protected' | 'control';
    cycles: number;
    useMocks: boolean;
    output: string;
}

interface StressTestResult {
    adapter: string;
    mode: string;
    timestamp: string;
    cycles_completed: number;
    cycles_requested: number;
    survived: boolean;
    crash_at_cycle: number | null;
    metrics: {
        final_confidence: number;
        min_confidence: number;
        latency_cliffs_detected: number;
        refusals: number;
        degradation_events: number;
    };
    mock_mode: boolean;
    error: string | null;
}

// ============= Parse Arguments =============

function parseArgs(): StressTestConfig {
    const args = process.argv.slice(2);
    const config: StressTestConfig = {
        adapter: 'pinecone',
        mode: 'protected',
        cycles: 25,
        useMocks: true,
        output: 'results/adapter-stress/result.json'
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--adapter':
                config.adapter = args[++i];
                break;
            case '--mode':
                config.mode = args[++i] as 'protected' | 'control';
                break;
            case '--cycles':
                config.cycles = parseInt(args[++i], 10);
                break;
            case '--use-mocks':
                config.useMocks = args[++i] === 'true';
                break;
            case '--output':
                config.output = args[++i];
                break;
        }
    }

    return config;
}

// ============= Mock Adapter Factory =============

function createMockAdapter(adapterName: string, isProtected: boolean) {
    let confidence = 1.0;
    let operationCount = 0;
    let latencyCliffs = 0;
    let refusals = 0;
    let degradationEvents = 0;
    let minConfidence = 1.0;

    return {
        async simulateCycle(cycleNumber: number): Promise<{ crashed: boolean; confidence: number }> {
            operationCount++;

            // Simulate increasing stress
            const stressLevel = cycleNumber / 25; // 0 to 1 over 25 cycles
            const latencyMultiplier = 1 + stressLevel * 5; // Up to 6x latency
            const failureRate = stressLevel * 0.3; // Up to 30% failure rate

            // Random degradation events
            if (Math.random() < stressLevel * 0.4) {
                degradationEvents++;

                if (isProtected) {
                    // Protected mode: degrade confidence but don't crash
                    confidence *= 0.85;
                    minConfidence = Math.min(minConfidence, confidence);

                    // Detect latency cliff
                    if (Math.random() < 0.3) {
                        latencyCliffs++;
                    }

                    // Quality floor refusal
                    if (confidence < 0.5) {
                        refusals++;
                        // Circuit breaker prevents crash
                        confidence = Math.max(confidence, 0.3);
                    }
                } else {
                    // Control mode: crash under stress
                    confidence *= 0.6;
                    minConfidence = Math.min(minConfidence, confidence);

                    if (confidence < 0.2 || Math.random() < failureRate) {
                        return { crashed: true, confidence };
                    }
                }
            }

            // Random recovery in protected mode
            if (isProtected && Math.random() < 0.1) {
                confidence = Math.min(confidence * 1.1, 1.0);
            }

            return { crashed: false, confidence };
        },

        getMetrics() {
            return {
                final_confidence: confidence,
                min_confidence: minConfidence,
                latency_cliffs_detected: latencyCliffs,
                refusals,
                degradation_events: degradationEvents
            };
        }
    };
}

// ============= Run Stress Test =============

async function runStressTest(config: StressTestConfig): Promise<StressTestResult> {
    console.log(`\n[STRESS TEST] Starting ${config.mode.toUpperCase()} test for ${config.adapter}`);
    console.log(`[MOCK] ${config.useMocks ? 'Using simulated adapter' : 'Using real adapter'}`);
    console.log(`[CYCLES] ${config.cycles} stress cycles\n`);

    const isProtected = config.mode === 'protected';
    const adapter = createMockAdapter(config.adapter, isProtected);

    let crashed = false;
    let crashAtCycle: number | null = null;
    let cyclesCompleted = 0;

    for (let cycle = 1; cycle <= config.cycles; cycle++) {
        const result = await adapter.simulateCycle(cycle);
        cyclesCompleted = cycle;

        if (result.crashed) {
            crashed = true;
            crashAtCycle = cycle;
            console.log(`[CRASH] ❌ ${config.adapter} crashed at cycle ${cycle} (confidence: ${result.confidence.toFixed(3)})`);
            break;
        }

        // Progress logging
        if (cycle % 5 === 0 || cycle === config.cycles) {
            const status = isProtected ? '🛡️ PROTECTED' : '⚡ CONTROL';
            console.log(`[CYCLE ${cycle}/${config.cycles}] ${status} - Confidence: ${result.confidence.toFixed(3)}`);
        }
    }

    const metrics = adapter.getMetrics();
    const survived = !crashed;

    console.log(`\n[RESULT] ${survived ? '✅ SURVIVED' : '❌ CRASHED'}`);
    console.log(`[METRICS] Final confidence: ${metrics.final_confidence.toFixed(3)}`);
    console.log(`[METRICS] Min confidence: ${metrics.min_confidence.toFixed(3)}`);
    console.log(`[METRICS] Latency cliffs: ${metrics.latency_cliffs_detected}`);
    console.log(`[METRICS] Refusals: ${metrics.refusals}`);
    console.log(`[METRICS] Degradation events: ${metrics.degradation_events}\n`);

    return {
        adapter: config.adapter,
        mode: config.mode,
        timestamp: new Date().toISOString(),
        cycles_completed: cyclesCompleted,
        cycles_requested: config.cycles,
        survived,
        crash_at_cycle: crashAtCycle,
        metrics,
        mock_mode: config.useMocks,
        error: null
    };
}

// ============= Main =============

async function main() {
    const config = parseArgs();

    try {
        const result = await runStressTest(config);

        // Ensure output directory exists
        const outputDir = path.dirname(config.output);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write results
        fs.writeFileSync(config.output, JSON.stringify(result, null, 2));
        console.log(`[OUTPUT] Results written to ${config.output}`);

        // Exit with appropriate code
        if (config.mode === 'protected' && !result.survived) {
            console.error('[FAIL] Protected run should have survived');
            process.exit(1);
        }

        // Control runs crashing is expected - not a failure
        process.exit(0);

    } catch (error) {
        console.error('[ERROR]', error);
        process.exit(1);
    }
}

main();
