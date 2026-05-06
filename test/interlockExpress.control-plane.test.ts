import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { interlockExpress, stopSdeTelemetry } from '../packages/interlock-express/src/index.ts';
import { loadLaw } from '../services/law-loader.ts';

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

function rateLimiter(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        next();
        return;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        res.status(429).json({ error: 'Too many requests' });
        return;
    }

    record.count++;
    next();
}

describe('interlockExpress control plane paths', () => {
    let server: Server | null = null;
    const originalLawPath = process.env.INTERLOCK_LAW_PATH;
    const originalEventsPath = process.env.INTERLOCK_EVENTS_PATH;
    const originalHealthWindowMs = process.env.INTERLOCK_HEALTH_WINDOW_MS;
    const tempDirsForCleanup: string[] = [];

    afterEach(async () => {
        rateLimitStore.clear();
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

    it('allows demo failure reset while data-plane traffic is refused', async () => {
        const app = express();
        const tmp = mkdtempSync(join(tmpdir(), 'interlock-control-plane-'));

        app.use(rateLimiter);
        app.use(interlockExpress({
            control_plane_paths: ['/admin/inject-failure'],
            enable_sde_telemetry: false,
            incident_file: join(tmp, 'LIVE_INCIDENTS.md'),
            quality_floor: 0.3
        }));
        app.use(express.json());

        app.post('/admin/inject-failure', (req, res) => {
            const { mode } = req.body;
            if (!req.interlock) return res.status(500).json({ error: 'missing interlock control plane' });

            if (mode === 'FORCE_ERROR') {
                req.interlock.failureInjector.enableInjection(1.0);
                return res.json({ status: 'injected', mode: 'FORCE_ERROR' });
            }
            if (mode === 'RESET') {
                req.interlock.resetRuntimeState();
                return res.json({ status: 'reset' });
            }
            return res.status(400).json({ error: 'Unknown mode' });
        });

        app.post('/work', (_req, res) => {
            res.json({ status: 'done' });
        });

        server = app.listen(0);
        await new Promise<void>(resolve => server?.once('listening', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('expected tcp listener');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const force = await postJson(`${baseUrl}/admin/inject-failure`, { mode: 'FORCE_ERROR' });
        expect(force.status).toBe(200);

        let refusedResponse: Response | null = null;
        for (let i = 0; i < 15; i++) {
            const response = await postJson(`${baseUrl}/work`, {});
            if (response.status === 503) {
                refusedResponse = response;
                break;
            }
        }

        expect(refusedResponse?.status).toBe(503);
        const refusedBody = await refusedResponse?.json();
        expect(refusedBody.refused).toBe(true);

        const reset = await postJson(`${baseUrl}/admin/inject-failure`, { mode: 'RESET' });
        expect(reset.status).toBe(200);
        await expect(reset.json()).resolves.toEqual({ status: 'reset' });

        const recovered = await postJson(`${baseUrl}/work`, {});
        expect(recovered.status).toBe(200);
        await expect(recovered.json()).resolves.toEqual({ status: 'done' });
    });

    it('recovers after reset from threshold-induced refusal', async () => {
        const app = express();
        const tmp = mkdtempSync(join(tmpdir(), 'interlock-threshold-reset-'));
        tempDirsForCleanup.push(tmp);
        const lawPath = join(tmp, 'law.json');
        const eventsPath = join(tmp, 'events.jsonl');
        writeFileSync(lawPath, JSON.stringify(makeLaw({ latency_threshold_ms: 20, confidence_floor: 0.5 }), null, 2));

        process.env.INTERLOCK_LAW_PATH = lawPath;
        process.env.INTERLOCK_EVENTS_PATH = eventsPath;
        process.env.INTERLOCK_HEALTH_WINDOW_MS = '20';
        const expectedLawHash = loadLaw('ollama').lawHash;

        app.use(rateLimiter);
        app.use(interlockExpress({
            control_plane_paths: ['/admin/inject-failure'],
            enable_sde_telemetry: true,
            incident_file: join(tmp, 'LIVE_INCIDENTS.md')
        }));
        app.use(express.json());

        app.post('/admin/inject-failure', (req, res) => {
            if (!req.interlock) return res.status(500).json({ error: 'missing interlock control plane' });
            if (req.body?.mode === 'RESET') {
                req.interlock.resetRuntimeState();
                return res.json({ status: 'reset' });
            }
            return res.status(400).json({ error: 'Unknown mode' });
        });

        app.post('/work', async (req, res) => {
            const delayMs = Number(req.query.delayMs || 0);
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
            res.json({ status: 'done' });
        });

        server = app.listen(0);
        await new Promise<void>(resolve => server?.once('listening', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('expected tcp listener');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const initialHealthy = await postJson(`${baseUrl}/work`, {});
        expect(initialHealthy.status).toBe(200);

        const slow = await postJson(`${baseUrl}/work?delayMs=40`, {});
        expect(slow.status).toBe(200);

        const refused = await postJson(`${baseUrl}/work`, {});
        expect(refused.status).toBe(503);
        const refusedBody = await refused.json();
        expect(refusedBody.refused).toBe(true);
        expect(refusedBody.decision.law_hash).toBe(expectedLawHash);

        const reset = await postJson(`${baseUrl}/admin/inject-failure`, { mode: 'RESET' });
        expect(reset.status).toBe(200);
        await expect(reset.json()).resolves.toEqual({ status: 'reset' });

        const recovered = await postJson(`${baseUrl}/work`, {});
        expect(recovered.status).toBe(200);
        await expect(recovered.json()).resolves.toEqual({ status: 'done' });

        const events = await readEventsEventually(eventsPath);
        expect(events.some(event => event.kernel?.law_hash === expectedLawHash)).toBe(true);
        expect(events.every(event => typeof event.kernel?.law_hash === 'string' && event.kernel.law_hash.length > 0)).toBe(true);
    });
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
        law_id: 'law-threshold-reset-test',
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
            created_at: '2026-05-06T00:00:00.000Z'
        }
    };
}

async function readEventsEventually(eventsPath: string): Promise<any[]> {
    for (let i = 0; i < 50; i++) {
        const events = readEvents(eventsPath);
        if (events.length > 0) return events;
        await new Promise(resolve => setTimeout(resolve, 20));
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

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
