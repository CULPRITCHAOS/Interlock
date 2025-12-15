# Interlock ↔ SDE Telemetry Contract

> **Purpose**: Define the event stream Interlock emits for SDE consumption.

## JSONL Location

| Setting | Value |
|---------|-------|
| Default path | `./logs/interlock_events.jsonl` |
| Env override | `INTERLOCK_EVENTS_PATH` |
| Format | Newline-delimited JSON (JSONL) |

---

## Event Types

Interlock emits exactly **two** event types:

### 1. `intervention`

Emitted when the circuit breaker takes action.

```json
{
  "event_type": "intervention",
  "schema_version": "1.0.0",
  "timestamp": "2025-12-14T23:00:00Z",
  "domain": "ollama",
  "hardware_fingerprint": "abc123def456",
  "trigger": {
    "type": "latency_threshold_exceeded",
    "threshold_ms": 500,
    "observed_ms": 782,
    "confidence": 0.85
  },
  "action": {
    "type": "circuit_open",
    "prior_state": "CLOSED",
    "new_state": "OPEN"
  },
  "recovery": {
    "time_ms": 52300,
    "probe_attempts": 3,
    "final_state": "CLOSED"
  }
}
```

**Trigger types:**
- `latency_threshold_exceeded` — reflex trip, flash crowd
- `error_rate_exceeded` — hazard threshold
- `confidence_floor_breach` — quality floor hit
- `trust_decay_critical` — confidence decay

**Action types:**
- `circuit_open` — breaker opened
- `degrade` — degraded mode
- `refuse` — traffic refused

---

### 2. `health_window`

Emitted periodically (default: every 5s).

```json
{
  "event_type": "health_window",
  "schema_version": "1.0.0",
  "timestamp": "2025-12-14T23:00:30Z",
  "domain": "ollama",
  "hardware_fingerprint": "abc123def456",
  "window": {
    "start": "2025-12-14T23:00:00Z",
    "end": "2025-12-14T23:00:30Z",
    "duration_ms": 30000
  },
  "metrics": {
    "latency_p95_ms": 120,
    "latency_max_ms": 450,
    "error_rate": 0.01,
    "request_count": 150
  },
  "thresholds": {
    "latency_threshold_ms": 500,
    "error_threshold_pct": 0.05
  }
}
```

**Why health windows matter:**
- Provides **negative evidence** (liveness)
- SDE can distinguish "healthy silence" vs "observer offline"
- Fires even with zero traffic

---

## Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `INTERLOCK_EVENTS_PATH` | `./logs/interlock_events.jsonl` | JSONL output path |
| `INTERLOCK_HEALTH_WINDOW_MS` | `5000` | Health window interval |
| `INTERLOCK_LAW_PATH` | `./laws/active/{domain}.json` | Law file path |
| `INTERLOCK_IGNORE_HW_FINGERPRINT` | `0` | Ignore hardware mismatch |

---

## Schema Validation

Interlock events must validate against:
- `schemas/interlock_event.schema.json`

This is a vendored copy of SDE's schema.

---

## Trigger Mapping

| Interlock Internal | SDE Trigger Type |
|--------------------|------------------|
| Reflex trip | `latency_threshold_exceeded` |
| Flash crowd | `latency_threshold_exceeded` |
| Hazard threshold | `error_rate_exceeded` |
| Quality floor | `confidence_floor_breach` |
| Confidence decay | `trust_decay_critical` |

---

*Schema version: 1.0.0*
