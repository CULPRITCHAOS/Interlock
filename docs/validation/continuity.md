# Restart Continuity Test (Anti-Amnesia)

> **Purpose**: Prove that Interlock maintains protection across process restarts.

---

## Test Scenario

1. System is mid-incident (circuit breaker in OPEN state)
2. Process is killed (SIGKILL)
3. System restarts
4. Measure time to restored protection

---

## Test Setup

| Component | Configuration |
|-----------|---------------|
| **Service** | Express + Pinecone adapter |
| **Persistence** | `services/state_persistence.ts` |
| **State File** | `interlock_state.json` |
| **Injection** | Forced failure during OPEN state |

---

## Procedure

```bash
# 1. Start service with failure injection
npm run validate

# 2. Wait for circuit breaker activation (OPEN state)
# 3. Kill process mid-incident
kill -9 $PID

# 4. Restart immediately
npm run validate

# 5. Measure protection restoration
```

---

## Results

| Metric | Value |
|--------|-------|
| **Cold Start (no prior state)** | 2.3s to first decision |
| **Warm Restart (persisted state)** | 0.4s to restored protection |
| **Delta** | -1.9s (82% faster) |
| **State Preserved** | ✅ OPEN state maintained |
| **Incident Context** | ✅ Hazard history restored |

---

## Observations

1. **State file integrity**: `interlock_state.json` was correctly written before kill.
2. **Hardware fingerprint match**: Restart validated on same hardware context.
3. **No protection gap**: Traffic refusal resumed immediately on restart.

---

## Takeaway

Interlock survives process termination without amnesia. Protection state persists across restarts, enabling safe recovery in containerized and ephemeral environments.

---

*Test executed: 2025-12-14*
