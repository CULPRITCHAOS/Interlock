/**
 * Real Traffic Generator
 * =======================
 * Sends real HTTP requests to the Interlock Express Demo to generate
 * valid telemetry for the 24h SDE run.
 * 
 * Usage:
 *   npx tsx scripts/real-traffic-gen.ts
 */

import http from 'http';

const CONFIG = {
    url: 'http://localhost:3001/chat',
    concurrency: 5,
    requestDelayMs: 100, // Faster cycle
    burstProbability: 0.3, // More frequent bursts
    burstSize: 35 // 35 * 20ms = 700ms + 50ms base = 750ms (Breach 500ms limit)
};

console.log('Starting Real Traffic Generator...');
console.log(`Target: ${CONFIG.url}`);

async function sendRequest(id: number) {
    return new Promise<void>((resolve) => {
        const body = JSON.stringify({
            messages: [{ role: 'user', content: `Hello from client ${id}` }]
        });

        const req = http.request(CONFIG.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        // Print latency to help visualize load
                        if (json.delayMs > 500) process.stdout.write(`(${json.delayMs}ms)`);
                        else process.stdout.write('.');
                    } catch (e) {
                        process.stdout.write('.');
                    }
                } else if (res.statusCode === 503) {
                    process.stdout.write('x'); // Intervention/Refusal
                } else {
                    process.stdout.write(`[${res.statusCode}]`); // Specific Error Code
                }
                resolve();
            });
        });

        req.on('error', (e) => {
            process.stdout.write(`[E:${e.message}]`);
            resolve();
        });

        req.write(body);
        req.end();
    });
}

async function loop() {
    while (true) {
        // Normal load
        const promises = [];
        const isBurst = Math.random() < CONFIG.burstProbability;
        const count = isBurst ? CONFIG.burstSize : CONFIG.concurrency;

        if (isBurst) process.stdout.write(' [BURST] ');

        for (let i = 0; i < count; i++) {
            promises.push(sendRequest(i));
        }

        await Promise.all(promises);
        await new Promise(r => setTimeout(r, CONFIG.requestDelayMs));
    }
}

loop().catch(console.error);
