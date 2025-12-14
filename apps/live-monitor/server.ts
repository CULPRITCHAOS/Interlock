/**
 * Reference Service Server
 * ========================
 * 
 * "Always-on" reference service for the Interlock Trust Anchor.
 * Mimics a real AI API with vector search capabilities.
 * 
 * Features:
 * - Express API
 * - Real Pinecone Integration
 * - Interlock Middleware protection
 * - Failure Injection Hooks (for validation)
 */

import express from 'express';
import { createPineconeAdapter } from '../../adapters/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';

// --- Configuration ---
const PORT = 3000;
const PINECONE_INDEX = 'interlock-test';
const QUALITY_FLOOR = 0.8;

// --- State ---
let isLagging = false;
let isError = false;
let memoryLeaking: any[] = [];

// --- Setup ---
const app = express();
app.use(express.json());

// Initialize Adapter
const adapter = createPineconeAdapter(QUALITY_FLOOR);

// Register Degradation Hooks
adapter.onDegradation(0.8, 'warn', () => {
    console.log('⚠️ [Warning] Hazard high - Pre-intervention warning');
});

adapter.onDegradation(0.9, 'refuse', () => {
    console.log('🛡️ [Intervention] Request refused due to Quality Floor');
});

// Helper: Simulate Lag
const maybeLag = async () => {
    if (isLagging) {
        const lagMs = 3000; // Hard 3s lag (Simulates severe degradation)
        await new Promise(r => setTimeout(r, lagMs));
    }
};

// --- Routes ---

// 1. Health Probe
app.get('/health', (req, res) => {
    const metrics = adapter.observe();
    res.json({
        status: 'ok',
        metrics
    });
});

// 2. Vector Search (Protected)
app.post('/search', async (req, res) => {
    try {
        // Setup Pinecone (Lazy init for demo speed)
        const apiKey = process.env.PINECONE_API_KEY || 'test-key-for-demo';
        const pc = new Pinecone({ apiKey });
        const index = pc.index(PINECONE_INDEX);

        // Protection Wrap
        const protectedQuery = adapter.wrapQuery(async (vector: number[]) => {
            await maybeLag();

            // MOCK MODE for Local Validation (if no real API key)
            if (apiKey === 'test-key-for-demo') {
                if (isError) {
                    throw new Error("Simulated Pinecone Error (FORCE_ERROR)");
                }

                // Simulate network latency
                await new Promise(r => setTimeout(r, 50));
                return {
                    matches: Array(5).fill(0).map((_, i) => ({
                        id: `mock-${i}`,
                        score: 0.9 - (i * 0.1),
                        values: []
                    }))
                };
            }

            // Simulate "Real Work"
            if (Math.random() < 0.1) await new Promise(r => setTimeout(r, 50)); // Baseline noise

            return await index.query({
                vector,
                topK: 5,
                includeMetadata: false
            });
        });

        // Execute
        const vector = req.body.vector || Array(1536).fill(0).map(() => Math.random());
        const result = await protectedQuery(vector, 5);

        // Check if result was effectively refused/degraded
        const confidence = adapter.getConfidence();

        if (adapter.shouldRefuse()) {
            res.status(503).json({
                error: "Interlock Protection: Request refused to prevent system collapse",
                confidence
            });
            return;
        }

        res.json({
            data: result,
            meta: {
                confidence: adapter.getConfidence(),
                metrics: adapter.observe()
            }
        });

    } catch (error: any) {
        if (error.message.includes('Interlock refusal')) {
            res.status(503).json({
                error: "Interlock Protection: Request refused to prevent system collapse",
                confidence: adapter.getConfidence()
            });
            return;
        }
        console.error('Search failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 2b. Remote Decision Endpoint (The "Brain")
// Minimal contract for remote middleware (FastAPI/Python, Go, etc.)
app.post('/interlock/decision', (req, res) => {
    // 1. Update Monitor State (Heartbeat)
    adapter.observe(); // Ensures time-decay and metric tracking happen

    // 2. Check Logic
    // In a real implementation, we'd accept 'service' and 'context' from req.body

    // DEBUG: Inspect detailed metrics
    console.log('[Brain Debug]', adapter.observe());

    const shouldRefuse = adapter.shouldRefuse();
    const confidence = adapter.getConfidence();

    if (shouldRefuse) {
        res.json({
            allowed: false,
            refusal: {
                reason: "Interlock refusal: Confidence below quality floor",
                retry_after_ms: 5000,
                // In generic mode, we might generate ID here or let client handle it.
                // For now, Brain is authority.
                incident_id: "remote-" + Date.now(),
                confidence
            }
        });
    } else {
        res.json({
            allowed: true,
            metadata: {
                confidence
            }
        });
    }
});

// 3. Admin: Failure Injection
app.post('/admin/inject-failure', (req, res) => {
    const mode = req.body.mode;
    console.log(`💉 Failure Injection: ${mode}`);

    if (mode === 'FORCE_LAG') {
        isLagging = true;
        // Auto-recover after 30s
        setTimeout(() => {
            isLagging = false;
            console.log('✅ Failure Injection: Cleared FORCE_LAG');
        }, 30000);
    }

    if (mode === 'FORCE_ERROR') {
        isError = true;
        setTimeout(() => {
            isError = false;
            console.log('✅ Failure Injection: Cleared FORCE_ERROR');
        }, 30000);
    }

    if (mode === 'MEMORY_LEAK') {
        // Fill memory rapidly
        const leakloop = setInterval(() => {
            if (memoryLeaking.length > 500) {
                clearInterval(leakloop);
                memoryLeaking = []; // Cleanup eventually to prevent actual process death in this demo
                console.log('✅ Failure Injection: Cleared MEMORY_LEAK (Reset)');
                return;
            }
            memoryLeaking.push(new Array(1000000).fill('x'));
        }, 100);
    }

    res.json({ status: 'injected', mode });
});

// Start
app.listen(PORT, () => {
    console.log(`Reference Service running on port ${PORT}`);
    console.log('Interlock Protection: ENABLED');
});
