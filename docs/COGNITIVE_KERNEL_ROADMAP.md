# Cognitive Kernel Roadmap

> Strategic direction for Interlock + SDE evolution into a cross-app computational nervous system.
> Reference document for future development. Focus on current A/B testing first.

---

## Executive Summary

Build a **read-only Capability Envelope** + keep **Policy Packs governed**. This turns Interlock+SDE into a cross-app computational nervous system without coupling to any app or agent framework.

---

## Architecture

### Layer 1 (NEW): Capability Envelope (Read-Only, Audit-Grade)

**Output artifact**: `hardware_profile.json`

**Source**: Interlock telemetry + SDE evaluation outputs + proven law packs

**Contains only descriptive limits**:
- `memory_safe_mb` / `memory_redline_mb`
- `latency_cliff_ms` (where collapse/opens start)
- `queue_collapse_threshold`
- Per-domain recommended thresholds

**Provenance required**: Every number must have `run_id`, `sample_count`, `time_window`, `confidence`, `law_hash`

**No runtime learning, no writes to Interlock. Pure export.**

### Layer 2 (EXISTING): Policy Packs (Governed, Human-Gated)

Keep exactly as-is:
- `laws/active/*.json`
- SDE proposal pipeline with FN=0
- Human gate for promotion

---

## Build Tracks

### Track A: `sde export-profile` CLI

**Goal**: Generate `hardware_profile.json` from real runs + policy packs

**Command**:
```bash
py -m SDE.cli export-profile --events logs/interlock_events.jsonl --laws laws/active --out hardware_profile.json
```

**Outputs**:
- `hardware_fingerprint`
- `compute_limits` (memory_safe_mb, memory_redline_mb, latency_cliff_ms, queue_collapse_threshold)
- `domain_policies.ollama` from active laws + evidence packet provenance

**Fails loudly if provenance can't be computed (no guessing)**

### Track B: Sidecar API + MCP Wrapper

**Order matters**:

1. **Local sidecar** (Node/Express or Python):
   - `GET /profile` (reads hardware_profile.json)
   - `POST /check` (OpSpec → verdict: LOCAL/CLOUD/QUEUE/REFUSE + reason)
   - `GET /audit` (recent interventions + last profile provenance)

2. **MCP server** wrapping those endpoints (no extra logic)

3. **LangChain tools** (thin adapters only, last priority)

---

## Explicit Non-Goals

- ❌ No "optimize anything" claims
- ❌ No runtime learning daemon
- ❌ No auto-promotion of laws
- ❌ No giant fantasy schema (keep profile minimal + provable)

---

## First Consumer: Dream Machine

Dream Machine integration comes AFTER Track A/B are complete.

**Integration points**:
- On startup: Load `hardware_profile.json`
- Before heavy ops: `kernel.canHandle({op:"llm_infer", ctx, streams})`
- Enforce: `max_concurrent_generations`, `local_llm_max_context`, `queue_depth_cap`

---

## Next Actions (When Ready)

1. ✅ Complete current A/B test (baseline vs burst)
2. Implement `export-profile` + schema + golden fixture tests
3. Implement sidecar endpoints reading `hardware_profile.json`
4. Implement MCP wrapper over sidecar
5. After 4h+ dev mode data and 24h+ prod data, regenerate profile and compare diffs

---

## Schema Reference (Minimal)

```json
{
  "profile_version": "1.0.0",
  "hardware_fingerprint": "663874e8be2bdf66",
  "generated_at": "2025-12-15T11:40:00Z",
  "compute_limits": {
    "memory_safe_mb": 12000,
    "memory_redline_mb": 14500,
    "latency_cliff_ms": 3500,
    "queue_collapse_threshold": 8
  },
  "domain_policies": {
    "ollama": {
      "latency_threshold_ms": 400,
      "confidence_floor": 0.6,
      "error_threshold_pct": 3.0,
      "provenance": {
        "run_id": "ab_burst_20251215",
        "sample_count": 223693,
        "confidence": 0.92,
        "time_window": "2025-12-15T04:00:00Z/2025-12-15T07:47:00Z",
        "law_hash": "abc123def456"
      }
    }
  }
}
```

---

*Document created: 2025-12-15*
*Source: ChatGPT strategic analysis*
*Status: Reference for future development*
