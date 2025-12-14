# Interlock Middleware Guide

> **Drop-in Protection for API Services**

Interlock Middleware provides "One-Line" circuit breaker protection for web services without requiring deep integration into your business logic.

---

## Supported Frameworks

| Framework | Language | Pattern | Latency | Logic |
|-----------|----------|---------|---------|-------|
| **Express** | Node.js | Local (Native) | < 1ms | Direct Import |
| **FastAPI** | Python | Remote Client | ~5-10ms | Queries Trust Anchor (Node) |

---

## 🚀 1. Express (Node.js)

The Express middleware runs **locally** within your Node.js process, reusing the core `confidence_monitor` logic for maximum performance (microssecond overhead).

### Installation

```bash
npm install @interlock/express
```

### Usage

```typescript
import { interlockExpress } from '@interlock/express';

// Add as early as possible in your middleware chain
app.use(interlockExpress({
    quality_floor: 0.5,    // Refuse if confidence < 0.5
    dry_run: false,        // Set true for Shadow Mode
    incident_file: 'docs/LIVE_INCIDENTS.md' // Shared log path
}));
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `quality_floor` | `0.5` | Minimum confidence score (0.0-1.0) before refusal. |
| `dry_run` | `false` | If `true`, logs "WOULD REFUSE" but allows traffic. Use for trust acquisition. |
| `incident_file` | `...` | Path to the **Standard Incident Log**. |
| `failure_class` | `"Application"` | Tag used for failure attribution in logs. |

---

## 🐍 2. FastAPI (Python)

The FastAPI middleware operates as a **Remote Client**. It delegates hazard decisions to your central Interlock Reference Service ("The Brain"). This ensures **zero semantic drift** between your Node and Python services.

### Prerequisite: The Brain

You must have the Interlock Reference Service (Node.js) running and accessible:

```bash
# Start the Trust Anchor
npx tsx apps/live-monitor/server.ts
# Listens on http://localhost:3000
```

### Installation

Copy `python/interlock_fastapi` to your project (PyPI package coming soon).

### Usage

```python
from fastapi import FastAPI
from interlock_fastapi.middleware import InterlockMiddleware

app = FastAPI()

app.add_middleware(
    InterlockMiddleware,
    interlock_url="http://localhost:3000", # URL of The Brain
    dry_run=False,
    log_file="docs/LIVE_INCIDENTS.md"
)
```

### How It Works (The "Remote Decision" Pattern)

1. **Request Arrives**: Middleware intercepts request metadata (method, path).
2. **Consult Brain**: Middleware queries `POST /interlock/decision` on the Reference Service.
3. **Decision**:
   - The Brain evaluates global system health (Pinecone latency, error rates, etc.).
   - Returns `{ allowed: true/false }`.
4. **Enforcement**:
   - If `allowed: false`: Middleware returns `503 Service Unavailable`.
   - If `allowed: true`: Request proceeds.

### Fail-Open / Fail-Closed

By default, the client **fails open** (allows traffic) if The Brain is unreachable, but logs the error.
- **Why**: Preventing a safety tool from becoming a single point of failure.
- **Configuration**: Modify `client.py` to `self.fail_closed = True` for Class V critical systems.

---

## 📝 3. Shared Incident Log (`LIVE_INCIDENTS.md`)

Both middlewares write to the **Standard Incident Log** format. This provides a unified view of all interventions across your polyglot stack.

### Format Example

```markdown
### Incident #remote-1702589: Traffic Refusal
- **Failure Class**: Remote Decision
- **Incident Window**: 2025-12-14T10:00:00Z -> ...
- **Trigger**: Confidence < Quality Floor
```

---

## 🛡️ Best Practices

1. **Start with Shadow Mode**: Set `dry_run: true` for 24 hours to observe logs without impacting users.
2. **Calibrate Quality Floor**: Use `0.5` for standard apps, `0.8` for mission-critical/medical apps.
3. **Monitor The Brain**: Ensure your Reference Service is highly available if using Python clients.
