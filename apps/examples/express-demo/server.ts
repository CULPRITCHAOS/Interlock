import express from 'express';
import rateLimit from 'express-rate-limit';
// Handle default export wrapping from TSX
import * as InterlockPkg from '../../../packages/interlock-express/src/index.ts';
const interlockExpress = (InterlockPkg as any).default?.interlockExpress || (InterlockPkg as any).interlockExpress;

const app = express();
const PORT = 3001; // Diff port than reference service

// Rate limiting - CodeQL security requirement
// Limit each IP to 100 requests per minute
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// Enable Interlock - E2E testing with LLM-appropriate thresholds
app.use(interlockExpress({
    quality_floor: 0.3,        // Low floor for LLM testing (0.3)
    dry_run: false,            // REAL Ollama calls
    latency_threshold_ms: 10000,  // 10s threshold for LLM workloads
    hazard_threshold: 0.97
}));

app.use(express.json());

// Real workload - calls Ollama
app.post('/work', async (req, res) => {
    const { model = 'gemma3:1b', prompt = 'Hello', max_tokens = 256 } = req.body;
    const startTime = Date.now();

    try {
        const ollamaRes = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false,
                options: { num_predict: max_tokens }
            })
        });

        const data = await ollamaRes.json();
        const latencyMs = Date.now() - startTime;

        res.json({
            status: 'done',
            latency_ms: latencyMs,
            model,
            tokens: (data as any).eval_count || 0
        });
    } catch (err) {
        res.status(500).json({ error: String(err), latency_ms: Date.now() - startTime });
    }
});

// Simulated workload (for stress testing)
let activeRequests = 0;
app.post('/chat', async (req, res) => {
    activeRequests++;
    const delay = 50 + (activeRequests * 100);
    await new Promise(r => setTimeout(r, delay));
    activeRequests--;
    res.json({ status: 'done', delayMs: delay });
});

// Admin: Inject Failure
app.post('/admin/inject-failure', (req, res) => {
    const { mode } = req.body;
    if (req.interlock) {
        if (mode === 'FORCE_ERROR') {
            req.interlock.failureInjector.enableInjection(1.0);
            res.json({ status: 'injected', mode: 'FORCE_ERROR' });
        } else if (mode === 'RESET') {
            req.interlock.failureInjector.disableInjection();
            req.interlock.monitor.reset();
            res.json({ status: 'reset' });
        } else {
            res.status(400).json({ error: 'Unknown mode' });
        }
    } else {
        res.status(500).json({ error: 'Interlock not attached' });
    }
});

app.listen(PORT, () => {
    console.log(`Express Demo running on http://localhost:${PORT}`);
    console.log(`  /work  - Real Ollama inference (E2E test)`);
    console.log(`  /chat  - Simulated delay (stress test)`);
});

// Force Keep-Alive
setInterval(() => { }, 1000);
