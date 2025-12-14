# Interlock Reference Service

**Status**: Verified Trust Anchor
**Location**: `apps/live-monitor`

## Purpose
This service acts as the "Trust Anchor" for Interlock. It runs a continuous loop of traffic against a protected Vector DB (Pinecone) adapter, validating that Interlock correctly:
1. Detects degradation (Latency/Errors).
2. Intervenes to Protect System (Refusal > Corruption).
3. Recovers when conditions improve.
4. **Logs every incident publicly** to `docs/LIVE_INCIDENTS.md` using the Interlock Standard Format (Incident > Events).

## Architecture
- **Server**: Express.js API with `PineconeAdapter`.
- **Monitor**: Independent process that generates traffic and verifies 503 responses.
- **Mock Mode**: Validates logic without incurring Pinecone costs (simulated latency/errors).

## Running
```bash
# Start Server
npx tsx apps/live-monitor/server.ts

# Start Monitor
npx tsx apps/live-monitor/monitor.ts
```

## Failure Injection
Trigger incidents manually to test resilience:
```bash
# Force Latency (3s)
curl -X POST http://localhost:3000/admin/inject-failure -d '{"mode":"FORCE_LAG"}'

# Force Error (100% Failure)
curl -X POST http://localhost:3000/admin/inject-failure -d '{"mode":"FORCE_ERROR"}'
```
