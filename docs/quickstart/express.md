# Quickstart: Express (Node.js)

Minimal example: protect → degrade → refuse.

```typescript
import express from 'express';
import { interlockExpress } from '@interlock/express';

const app = express();

// Add Interlock middleware
app.use(interlockExpress({
  quality_floor: 0.7,          // Refuse below this confidence
  circuit_breaker: true,       // Enable automatic protection
  shadow_mode: false           // Live enforcement (not dry-run)
}));

// Your endpoint
app.get('/search', async (req, res) => {
  const results = await vectorDB.query(req.query.q);
  res.json(results);
});

app.listen(3000, () => {
  console.log('Protected service running on :3000');
});
```

## Behavior

| Condition | Action |
|-----------|--------|
| Confidence ≥ 0.7 | ✅ Request passes |
| Confidence 0.5–0.7 | ⚠️ Degraded response |
| Confidence < 0.5 | ❌ Request refused (503) |
| Circuit OPEN | ❌ All traffic refused |

## Run

```bash
npm install @interlock/express
npx tsx server.ts
```
