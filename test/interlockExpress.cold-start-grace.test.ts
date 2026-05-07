import express from 'express';
import rateLimit from 'express-rate-limit';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { interlockExpress, stopSdeTelemetry } from '../packages/interlock-express/src/index.ts';
import { loadLaw } from '../services/law-loader.ts';

const rateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false
});
const TEST_SLOW_DELAY_MS = 40;
const TEST_WAIT_FOR_GRACE_EXPIRY_MS = 10;
const TEST_EVENT_POLL_MS = 20;

describe('interlockExpress bounded cold-start grace', () => {
    let server: Server | null = null;
    const originalLawPath = process.env.INTERLOCK_LAW_PATH;
    const originalEventsPath = process.env.INTERLOCK_EVENTS_PATH;
    const originalHealthWindowMs = process.env.INTERLOCK_HEALTH_WINDOW_MS;
    const tempDirsForCleanup: string[] = [];

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

        for (const dir of tempDirsForCleanup) {
            rmSync(dir, { recursive: true, force: true });
        }
        tempDirsForCleanup.length = 0;
    });

    it('preserves default threshold poisoning behavior when grace fields are absent', async () => {
        const app = await startApp(makeLaw({ latency_threshold_ms: 20, confidence_floor: 0.5 }));
        const slow = await postJson(`${app.baseUrl}/work-slow`, {});
        expect(slow.status).toBe(200);

        const refused = await postJson(`${app.baseUrl}/work`, {});
        expect(refused.status).toBe(503);
        await expect(refused.json()).resolves.toMatchObject({ refused: true });
    });

    it('prevents startup false refusal after one cold slow healthy request', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 1,
            cold_start_grace_ms: 10_000,
            confidence_floor: 0.5
        }));

        const coldSlow = await postJson(`${app.baseUrl}/work-slow`, {});
        expect(coldSlow.status).toBe(200);

        const nextHealthy = await postJson(`${app.baseUrl}/work`, {});
        expect(nextHealthy.status).toBe(200);
    });

    it('expires grace after request count and still refuses slow traffic after grace', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 1,
            cold_start_grace_ms: 10_000,
            confidence_floor: 0.5
        }));

        expect((await postJson(`${app.baseUrl}/work-slow`, {})).status).toBe(200);
        expect((await postJson(`${app.baseUrl}/work`, {})).status).toBe(200);

        const postGraceSlow = await postJson(`${app.baseUrl}/work-slow`, {});
        expect(postGraceSlow.status).toBe(200);

        const refused = await postJson(`${app.baseUrl}/work`, {});
        expect(refused.status).toBe(503);
    });

    it('expires grace after time window', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 10,
            cold_start_grace_ms: 1,
            confidence_floor: 0.5
        }));

        await delay(TEST_WAIT_FOR_GRACE_EXPIRY_MS);

        expect((await postJson(`${app.baseUrl}/work-slow`, {})).status).toBe(200);
        const refused = await postJson(`${app.baseUrl}/work`, {});
        expect(refused.status).toBe(503);
    });

    it('does not suppress failure-injection refusal during grace', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 10,
            cold_start_grace_ms: 10_000,
            confidence_floor: 0.8
        }), { controlPlane: true });

        expect((await postJson(`${app.baseUrl}/admin/inject-failure`, { mode: 'FORCE_ERROR' })).status).toBe(200);
        expect((await postJson(`${app.baseUrl}/work`, {})).status).toBe(500);
        expect((await postJson(`${app.baseUrl}/work`, {})).status).toBe(500);
        expect((await postJson(`${app.baseUrl}/work`, {})).status).toBe(500);

        const refused = await postJson(`${app.baseUrl}/work`, {});
        expect(refused.status).toBe(503);
    });

    it('emits grace telemetry fields with the active law hash', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 1,
            cold_start_grace_ms: 10_000,
            confidence_floor: 0.5
        }), { telemetry: true });

        expect((await postJson(`${app.baseUrl}/work-slow`, {})).status).toBe(200);

        const events = await readEventsEventually(app.eventsPath, events =>
            events.some(event => event.event_type === 'health_window' && event.metrics?.request_count > 0)
        );
        const healthWindow = events.find(event => event.event_type === 'health_window' && event.metrics?.request_count > 0);
        expect(healthWindow).toBeTruthy();
        expect(healthWindow.kernel.law_hash).toBe(app.expectedLawHash);
        expect(healthWindow.runtime_phase).toBe('cold_start');
        expect(healthWindow.grace_active).toBe(true);
        expect(healthWindow.grace_reason).toBe('cold_start_bounded');
        expect(healthWindow.grace_request_index).toBe(1);
        expect(healthWindow.active_latency_threshold_ms).toBe(20);
        expect(healthWindow.steady_state_latency_threshold_ms).toBe(20);
        expect(healthWindow.thresholds.active_latency_threshold_ms).toBe(20);
        expect(healthWindow.workload.model_id).toBe('gemma3:1b');
    });

    it('reset clears runtime state without adding reset grace in v1', async () => {
        const app = await startApp(makeLaw({
            latency_threshold_ms: 20,
            steady_state_latency_threshold_ms: 20,
            cold_start_grace_requests: 1,
            cold_start_grace_ms: 10_000,
            confidence_floor: 0.5
        }), { controlPlane: true });

        expect((await postJson(`${app.baseUrl}/work-slow`, {})).status).toBe(200);
        expect((await postJson(`${app.baseUrl}/work`, {})).status).toBe(200);

        const reset = await postJson(`${app.baseUrl}/admin/inject-failure`, { mode: 'RESET' });
        expect(reset.status).toBe(200);

        expect((await postJson(`${app.baseUrl}/work-slow`, {})).status).toBe(200);
        const refused = await postJson(`${app.baseUrl}/work`, {});
        expect(refused.status).toBe(503);
    });

    async function startApp(
        law: ReturnType<typeof makeLaw>,
        options: { telemetry?: boolean; controlPlane?: boolean } = {}
    ): Promise<{ baseUrl: string; eventsPath: string; expectedLawHash: string }> {
        const tmp = mkdtempSync(join(tmpdir(), 'interlock-cold-start-grace-'));
        tempDirsForCleanup.push(tmp);
        const lawPath = join(tmp, 'law.json');
        const eventsPath = join(tmp, 'events.jsonl');
        writeFileSync(lawPath, JSON.stringify(law, null, 2));

        process.env.INTERLOCK_LAW_PATH = lawPath;
        process.env.INTERLOCK_EVENTS_PATH = eventsPath;
        process.env.INTERLOCK_HEALTH_WINDOW_MS = '20';
        const expectedLawHash = loadLaw('ollama').lawHash;

        const app = express();
        app.use(rateLimiter);
        app.use(interlockExpress({
            control_plane_paths: options.controlPlane ? ['/admin/inject-failure'] : [],
            enable_sde_telemetry: options.telemetry ?? false,
            incident_file: join(tmp, 'LIVE_INCIDENTS.md')
        }));
        app.use(express.json());

        app.post('/admin/inject-failure', (req, res) => {
            if (!req.interlock) return res.status(500).json({ error: 'missing interlock control plane' });
            if (req.body?.mode === 'FORCE_ERROR') {
                req.interlock.failureInjector.enableInjection(1.0);
                return res.json({ status: 'injected' });
            }
            if (req.body?.mode === 'RESET') {
                req.interlock.resetRuntimeState();
                return res.json({ status: 'reset' });
            }
            return res.status(400).json({ error: 'Unknown mode' });
        });

        app.post('/work', (_req, res) => {
            res.json({ status: 'done' });
        });

        app.post('/work-slow', async (_req, res) => {
            await delay(TEST_SLOW_DELAY_MS);
            res.json({ status: 'done' });
        });

        server = app.listen(0);
        await new Promise<void>(resolve => server?.once('listening', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('expected tcp listener');

        return {
            baseUrl: `http://127.0.0.1:${address.port}`,
            eventsPath,
            expectedLawHash
        };
    }
});

function postJson(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

function makeLaw(parameters: Partial<Record<string, number>> = {}) {
    return {
        law_id: 'law-cold-start-grace-test',
        schema_version: '1.0.0',
        domain: 'ollama',
        hardware_fingerprint: null,
        parameters: {
            latency_threshold_ms: 20,
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
            created_at: '2026-05-07T00:00:00.000Z'
        }
    };
}

async function readEventsEventually(eventsPath: string, predicate: (events: any[]) => boolean = events => events.length > 0): Promise<any[]> {
    for (let i = 0; i < 50; i++) {
        const events = readEvents(eventsPath);
        if (predicate(events)) return events;
        await delay(TEST_EVENT_POLL_MS);
    }
    return readEvents(eventsPath);
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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
