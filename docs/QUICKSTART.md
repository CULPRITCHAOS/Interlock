# ⚡ 5-Minute Quickstart

This guide will get you from zero to **Interlock Protected** in 5 minutes.
You will run the **Interlock Brain** (Reference Service) and connect a **Client** to it.

## Prerequisites

- Node.js 18+
- Python 3.10+ (for FastAPI example)
- npm

## 1. Start "The Brain" (Reference Service)

The Brain is the Trust Anchor. It monitors global system health and makes refusal decisions.

```bash
# In terminal 1
cd interlock-repo
npm install
npx tsx apps/live-monitor/server.ts
```

**Expected Output:**
```text
Reference Service running on port 3000
Interlock Protection: ENABLED
[Interlock] Adapter Initialized: Quality Floor=0.8
```

> The Brain is now listening on `:3000`. It exposes `POST /interlock/decision`.

---

## 2. Start a Client

Choose your flavor: **Express (Node)** or **FastAPI (Python)**.

### Option A: Express (Node.js)

```bash
# In terminal 2
npx tsx apps/examples/express-demo/server.ts
```

**Expected Output:**
```text
Demo running on http://localhost:4000
Interlock Middleware Active (Local Mode)
```

### Option B: FastAPI (Python)

```bash
# In terminal 2
# Ensure dependencies installed: pip install fastapi uvicorn httpx
python3 apps/examples/fastapi-demo/main.py
```

**Expected Output:**
```text
FastAPI Demo running on http://localhost:8000
```

---

## 3. Verify Protection (The "Hello World")

Check that traffic is allowed when the system is healthy.

```bash
# In terminal 3
curl http://localhost:4000/work  # For Express
# OR
curl http://localhost:8000/work  # For FastAPI
```

**Response:** `{"status":"done", ...}` (Allowed)

---

## 4. Trigger Chaos (Refusal)

Now, let's break it safely. We will tell the Brain to simulate a critical failure.

**1. Inject Failure into Brain:**
```bash
curl -X POST http://localhost:3000/admin/inject-failure \
  -H "Content-Type: application/json" \
  -d '{"mode":"FORCE_ERROR"}'
```

**2. Bombard the Service (Simulate Traffic):**
Refusal is confidence-based. You need to send a few requests so Interlock "notices" the failure rate.

```bash
# Run this 10-20 times quickly
for i in {1..20}; do curl -s "http://localhost:3000/search" -X POST > /dev/null; done
```

**3. Verify Refusal:**
Now try to access your endpoint again.

```bash
curl -v http://localhost:4000/work
# OR
curl -v http://localhost:8000/work
```

**Expected Response (503 Service Unavailable):**
```json
{
  "refused": true,
  "reason": "Interlock refusal: Confidence below quality floor",
  "incident_id": "remote-170259...",
  "retry_after_ms": 5000
}
```

> **Congratulations!** Your service just actively refused a request because the underlying system was unstable. You prevented a potential cascade or hallucination.

---

## What Just Happened?

1. **Failure Injection**: You forced the Brain's internal components (Pinecone adapter) to fail.
2. **Observation**: Interlock observed the failure rate spiking.
3. **Decay**: The `ConfidenceScore` dropped below the `Quality Floor` (0.8).
4. **Decision**: When you called the client API, it asked the Brain (or checked local logic).
5. **Refusal**: The system returned `503` instead of processing the request in an unsafe state.
6. **Logging**: Check `docs/LIVE_INCIDENTS.md` to see the forensic log.
