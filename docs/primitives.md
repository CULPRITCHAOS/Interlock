# Interlock Primitives Schema

> **Purpose**: Formal vocabulary for Interlock's safety primitives. Domain-agnostic, behavior-grounded definitions.

---

## Hazard

A measurable deviation from the expected operating envelope. Hazards are detected through confidence decay, latency spikes, or error rate increases. A hazard does not imply action—it implies heightened monitoring.

**Observable indicators**: Confidence < threshold, latency > baseline × 2, error rate > 5%.

---

## Reflex

An immediate, non-forecast safety action triggered when hazard severity exceeds tolerance. Reflexes are reactive, not predictive. They execute within a single decision cycle and do not require state coordination.

**Examples**: Traffic refusal, request shedding, immediate degradation.

---

## Guard

A sustained intervention that persists across multiple decision cycles. Guards implement protective policies (circuit breakers, quality floors) and require state management. Guards are lifted through explicit recovery criteria, not timeouts alone.

**Examples**: Circuit breaker (OPEN state), quality floor enforcement, rate limiting.

---

## State

The operating mode of the circuit breaker, following standard patterns:

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation. All traffic passes. Monitoring active. |
| **OPEN** | Breaker tripped. Traffic refused. Recovery timer running. |
| **HALF_OPEN** | Probe mode. Limited traffic allowed. Success → CLOSED, Failure → OPEN. |

**Hysteresis**: State transitions require sustained signals (not single events) to prevent flapping.

---

## Confidence

Internal belief in forecast validity, expressed as a value in [0, 1]. Confidence is computed from recent observation history and decays over time without reinforcement.

| Range | Interpretation |
|-------|----------------|
| ≥ 0.8 | High certainty. Normal operation. |
| 0.5–0.79 | Moderate certainty. Protective mode preferred. |
| < 0.5 | Low certainty. Refusal required. |

---

## Trust Decay

The derivative of confidence over time. Trust decay measures how rapidly the system is losing certainty about its operating environment.

- **Positive decay (dC/dt < 0)**: Conditions deteriorating. Increase vigilance.
- **Zero decay**: Stable state.
- **Negative decay (dC/dt > 0)**: Conditions improving. Consider recovery.

Trust decay enables proactive intervention before confidence crosses thresholds.

---

## Relationships

```
Hazard Detection
       ↓
   [Severity?]
       ↓
  Low → Monitor (adjust Confidence)
  High → Reflex (immediate action)
       ↓
   [Sustained?]
       ↓
   Yes → Guard (state change)
   No → Return to monitoring
```

---

*This schema is designed for cross-domain reasoning and standards-level clarity.*
