import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { interlockExpress, stopSdeTelemetry } from '../packages/interlock-express/src/index.ts';

describe('interlockExpress control plane paths', () => {
    let server: Server | null = null;

    afterEach(async () => {
        stopSdeTelemetry();
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server?.close(error => error ? reject(error) : resolve());
            });
            server = null;
        }
    });

    it('allows demo failure reset while data-plane traffic is refused', async () => {
        const app = express();
        const tmp = mkdtempSync(join(tmpdir(), 'interlock-control-plane-'));

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
                req.interlock.failureInjector.disableInjection();
                req.interlock.failureInjector.clear();
                req.interlock.monitor.reset();
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
});

function postJson(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}
