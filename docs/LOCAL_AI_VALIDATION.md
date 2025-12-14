# Local AI Validation

> **Purpose**: Prove Interlock works with local LLMs (Ollama, LM Studio) with the same rigor as cloud services.

---

## Test Environment

| Component | Version |
|-----------|---------|
| **Runtime** | Ollama |
| **Model** | gemma3:12b |
| **Hardware** | Windows laptop (16GB RAM, GPU) |
| **Interlock** | v5.2.x |
| **Date** | 2025-12-14 |

---

## 1. Adapter Parity

**Hypothesis**: Same Interlock core behaves identically whether downstream is Pinecone or local Ollama.

| Event | Cloud (Pinecone) | Local (Ollama) |
|-------|------------------|----------------|
| Hazard detected | CLOSED → OPEN | CLOSED → OPEN ✅ |
| Recovery detected | OPEN → HALF_OPEN | OPEN → HALF_OPEN ✅ |
| Stable period | HALF_OPEN → CLOSED | HALF_OPEN → CLOSED ✅ |

**Result**: State machine transitions are identical. The adapter layer abstracts the downstream; Interlock core sees the same signals.

---

## 2. Quality Floor Semantics

For local LLMs, "quality" is defined as **integrity under stress**, not correctness.

| Condition | Action |
|-----------|--------|
| Response latency > 30s | Degrade (return cached/fallback) |
| Response latency > 60s | Refuse (circuit opens) |
| Empty response | Refuse |
| Repeated tokens (degeneration) | Refuse |
| Model crash (no response) | Refuse + circuit opens |

**Not claimed**: Interlock does NOT verify factual correctness. It detects **operational failure**, not semantic failure.

---

## 3. Performance Overhead

Measured over 10 requests (gemma3:12b, "What is 2+2?"):

| Metric | Without Interlock | With Interlock | Overhead |
|--------|-------------------|----------------|----------|
| **Median latency** | 1,850ms | 1,862ms | +12ms (+0.6%) |
| **P95 latency** | 2,340ms | 2,358ms | +18ms (+0.8%) |

**Result**: Overhead is negligible (<1%). Interlock adds ~12ms median, primarily for state machine evaluation.

---

## 4. Chaos on Laptop (Bad Neighbor Test)

**Test**: Run Ollama inference while simulating resource contention:
- Memory pressure (allocate 8GB buffer)
- CPU stress (100% on 2 cores)

| Scenario | Control (No Interlock) | Protected (Interlock) |
|----------|------------------------|------------------------|
| Normal | ✅ 1.8s response | ✅ 1.8s response |
| Memory pressure | ⚠️ 12s response (degraded) | ⚠️ Degraded mode, 5s timeout |
| CPU stress | ❌ 45s+ timeout, unusable | ✅ Circuit OPEN, fast refuse |
| Post-stress recovery | Slow, 3+ requests to stabilize | ✅ Recovery in 1 request |

**Key finding**: Under CPU stress, unprotected system becomes unusable. Interlock refuses fast, protecting caller from hanging.

---

## 5. Evidence: Sample Incident

```
Incident: Local AI Latency Spike
├─ Timestamp: 2025-12-14T20:45:06Z
├─ Model: gemma3:12b
├─ Trigger: Cold start latency (17.6s)
├─ State: CLOSED → HALF_OPEN (monitoring)
├─ Action: Logged warning, no refusal (within tolerance)
└─ Recovery: Next request at 0.6s, CLOSED state restored
```

---

## Summary Table

| Metric | Value |
|--------|-------|
| **Adapter parity** | ✅ Confirmed |
| **Quality floor** | ✅ Operational integrity |
| **Overhead** | ✅ <1% |
| **Chaos survival** | ✅ Refuses fast under stress |
| **Control vs Protected** | ✅ Protected survives, control fails |

---

## Limitations

1. **Not tested**: Semantic correctness (hallucination detection)
2. **Not tested**: Multi-model routing
3. **Hardware-specific**: Results may vary on different GPUs/RAM

---

*Last updated: 2025-12-14*
