# Interlock ↔ SDE Governed Loop

> **Purpose**: Explain how Interlock and SDE work together to form a governed feedback loop.

## The Loop

```
┌─────────────┐      JSONL Events      ┌─────────────┐
│  Interlock  │ ──────────────────────►│     SDE     │
│  (Runtime)  │                        │  (Analysis) │
└─────────────┘                        └─────────────┘
       ▲                                      │
       │                                      │
       │ Human approves & copies              │ Proposes law
       │                                      │ changes
       │        ┌──────────────┐              │
       └────────│    Human     │◄─────────────┘
                │   Operator   │
                └──────────────┘
```

1. **Interlock emits events** → `logs/interlock_events.jsonl`
2. **SDE analyzes events** → proposes threshold changes
3. **Human reviews proposal** → approves or rejects
4. **Human updates law file** → `laws/active/{domain}.json`
5. **Interlock restarts** → loads new law

---

## Key Principle

> **Interlock never self-modifies.**

Laws are loaded only on restart. No runtime hot-patching.

---

## Quick Start

### 1. Run Interlock (produces JSONL)

```bash
npx tsx apps/examples/express-demo/server.ts
```

Events appear in `./logs/interlock_events.jsonl`

### 2. Run SDE propose command

```bash
python -m SDE.cli propose \
  --domain ollama \
  --events ./logs/interlock_events.jsonl \
  --baseline ./laws/baselines/ollama.json
```

SDE outputs: `./laws/proposed/ollama_sde-{id}.json`

### 3. Human reviews and approves

```bash
# Review the proposal
cat ./laws/proposed/ollama_sde-*.json

# If approved, copy to active
cp ./laws/proposed/ollama_sde-*.json ./laws/active/ollama.json
```

### 4. Restart Interlock

```bash
# Interlock loads new law on startup
npx tsx apps/examples/express-demo/server.ts
```

---

## What We Do NOT Claim

| Claim | Reality |
|-------|---------|
| "Interlock learns automatically" | ❌ No — SDE proposes, humans approve |
| "Laws hot-swap at runtime" | ❌ No — requires restart |
| "SDE modifies Interlock" | ❌ No — SDE outputs proposals only |

---

## Law File Format

```json
{
  "law_id": "law-ollama-20251214",
  "schema_version": "1.0.0",
  "domain": "ollama",
  "hardware_fingerprint": null,
  "parameters": {
    "latency_threshold_ms": 500,
    "error_threshold_pct": 0.05,
    "recovery_timeout_ms": 60000,
    "probe_interval_ms": 5000,
    "confidence_floor": 0.5,
    "decay_rate": 0.1
  },
  "source": {
    "type": "baseline",
    "proposal_id": null,
    "created_at": "2025-12-14T00:00:00Z"
  }
}
```

---

## Safety Constraints

| Constraint | Enforcement |
|------------|-------------|
| `predicted_fn_rate` must be 0 | SDE enforces in proposals |
| Hardware mismatch | Interlock warns and uses defaults |
| Schema validation | Interlock validates law file on load |

---

*Governed loop version: 1.0*
