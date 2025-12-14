import express from 'express';
// Handle default export wrapping from TSX
import * as InterlockPkg from '../../../packages/interlock-express/src/index.ts';
const interlockExpress = (InterlockPkg as any).default?.interlockExpress || (InterlockPkg as any).interlockExpress;

const app = express();
const PORT = 3001; // Diff port than reference service

// Enable Interlock
app.use(interlockExpress({
    quality_floor: 0.8,
    dry_run: false
}));

app.use(express.json());

// Main workload
app.get('/work', async (req, res) => {
    // Simulate some work
    await new Promise(r => setTimeout(r, 50));
    res.json({ status: 'done', data: 'some result' });
});

// Admin: Inject Failure
app.post('/admin/inject-failure', (req, res) => {
    const { mode } = req.body;
    if (req.interlock) {
        if (mode === 'FORCE_ERROR') {
            req.interlock.failureInjector.enableInjection(1.0); // 100% failure
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
});

// Force Keep-Alive
setInterval(() => { }, 1000);
