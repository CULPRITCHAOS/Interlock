import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { interlockExpress, stopSdeTelemetry } from '../packages/interlock-express/src/index.ts';
import { emitInterventionEvent } from '../packages/interlock-express/src/intervention-emitter.ts';
import { buildHealthWindowEvent, createMetricsCollector, recordRequest } from '../packages/interlock-express/src/health-window.ts';
import { initKernelStamp } from '../services/kernel/eventStamp.ts';
import { loadLaw } from '../services/law-loader.ts';

describe('runtime law event stamp alignment', () => {
    let server: Server | null = null;
    const originalLawPath = process.env.INTERLOCK_LAW_PATH;
    const originalEventsPath = process.env.INTERLOCK_EVENTS_PATH;
    const originalHealthWindowMs = process.env.INTERLOCK_HEALTH_WINDOW_MS;
    const originalKernelPath = process.env.COGNITIVE_KERNEL_PATH;

    afterEach(async () => {
        stopSdeTelemetry();
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server?.close(error => error ? reject(error) : resolve());
            });
            server = null;
        }

        restoreEnv('INTERLOCK_LAW_PATH', originalLawPath);
        restoreEnv('INTERLOCK_EVENTS_PATH', originalEventsPath);
        restoreEnv('INTERLOCK_HEALTH_WINDOW_MS', originalHealthWindowMs);
        restoreEnv('COGNITIVE_KERNEL_PATH', originalKernelPath);

        for (const dir of tempDirsForCleanup) {
            rmSync(dir, { recursive: true, force: true });
        }
        tempDirsForCleanup.length = 0;
    });

    it('stamps health_window events with the loaded runtime law hash', async () => {
        const tmp = makeTempDir();
        const lawPath = join(tmp, 'law.json');
        const eventsPath = join(tmp, 'events.jsonl');
        writeFileSync(lawPath, JSON.stringify(makeLaw({ latency_threshold_ms: 1900 }), null, 2));

        process.env.INTERLOCK_LAW_PATH = lawPath;
        process.env.INTERLOCK_EVENTS_PATH = eventsPath;
        process.env.INTERLOCK_HEALTH_WINDOW_MS = '20';
        process.env.COGNITIVE_KERNEL_PATH = join(tmp, 'missing-kernel.json');

        const expectedLawHash = loadLaw('ollama').lawHash;
        const app = express();
        app.use(interlockExpress({ enable_sde_telemetry: true }));
        app.post('/work', (_req, res) => res.json({ status: 'done' }));

        server = app.listen(0);
        await new Promise<void>(resolve => server?.once('listening', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('expected tcp listener');

        const response = await fetch(`http://127.0.0.1:${address.port}/work`, { method: 'POST' });
        expect(response.status).toBe(200);

        const event = await readFirstEvent(eventsPath);
        expect(event.event_type).toBe('health_window');
        expect(event.kernel.law_hash).toBe(expectedLawHash);
        expect(event.kernel.domain).toBe('ollama');
        expect(event.kernel.packet_id).toBe(`runtime-law-${expectedLawHash}`);
        expect(event.kernel.quality_level).toBe('L0-Observed');
        expect(event.thresholds.latency_threshold_ms).toBe(1900);
    });

    it('stamps intervention events with the active runtime law hash', () => {
        const tmp = makeTempDir();
        const lawPath = join(tmp, 'law.json');
        const eventsPath = join(tmp, 'events.jsonl');
        writeFileSync(lawPath, JSON.stringify(makeLaw({ confidence_floor: 0.8 }), null, 2));

        process.env.INTERLOCK_LAW_PATH = lawPath;
        process.env.INTERLOCK_EVENTS_PATH = eventsPath;
        process.env.COGNITIVE_KERNEL_PATH = join(tmp, 'missing-kernel.json');

        const lawResult = loadLaw('ollama');
        initKernelStamp(
            { model_id: 'gemma3:1b', provider: 'ollama' },
            { domain: 'ollama', law_hash: lawResult.lawHash, packet_id: 'packet-runtime-test', quality_level: 'L2-StressBattery' }
        );

        emitInterventionEvent({
            domain: 'ollama',
            trigger: { interlockTrigger: 'confidence_floor_breach', thresholdMs: 1900, observedMs: 2500, confidence: 0.2 },
            action: { interlockAction: 'refuse', priorState: 'closed', newState: 'open' },
            recovery: { timeMs: 0, probeAttempts: 0, finalState: 'open' }
        });

        const event = readEvents(eventsPath)[0];
        expect(event.event_type).toBe('intervention');
        expect(event.kernel.law_hash).toBe(lawResult.lawHash);
        expect(event.kernel.domain).toBe('ollama');
        expect(event.kernel.packet_id).toBe('packet-runtime-test');
        expect(event.kernel.quality_level).toBe('L2-StressBattery');
    });

    it('fallback stamping still emits a non-empty law hash', () => {
        const tmp = makeTempDir();
        process.env.COGNITIVE_KERNEL_PATH = join(tmp, 'missing-kernel.json');

        initKernelStamp({ model_id: 'gemma3:1b', provider: 'ollama' });
        const collector = createMetricsCollector();
        recordRequest(collector, 42, false);

        const event = buildHealthWindowEvent(collector, 'ollama', {
            latency_threshold_ms: 500,
            error_threshold_pct: 0.05
        });

        expect(event.kernel.law_hash).toEqual(expect.any(String));
        expect(event.kernel.law_hash.length).toBeGreaterThan(0);
    });
});

function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'interlock-runtime-law-stamp-'));
    tempDirsForCleanup.push(dir);
    return dir;
}

const tempDirsForCleanup: string[] = [];

function makeLaw(parameters: Partial<Record<string, number>> = {}) {
    return {
        law_id: 'law-runtime-stamp-test',
        schema_version: '1.0.0',
        domain: 'ollama',
        hardware_fingerprint: null,
        parameters: {
            latency_threshold_ms: 500,
            error_threshold_pct: 0.05,
            recovery_timeout_ms: 60000,
            probe_interval_ms: 5000,
            confidence_floor: 0.5,
            decay_rate: 0.1,
            ...parameters
        },
        source: {
            type: 'manual',
            proposal_id: null,
            created_at: '2026-05-06T00:00:00.000Z'
        }
    };
}

async function readFirstEvent(eventsPath: string): Promise<any> {
    for (let i = 0; i < 50; i++) {
        const events = readEvents(eventsPath);
        if (events.length > 0) return events[0];
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`No events emitted to ${eventsPath}`);
}

function readEvents(eventsPath: string): any[] {
    try {
        return readFileSync(eventsPath, 'utf-8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));
    } catch {
        return [];
    }
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
