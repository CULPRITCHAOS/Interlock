# Live Incident Log: Interlock Reference Service

> **Status**: ACTIVE MONITORING
> **Service**: Reference Service (Express + Pinecone)
> **Location**: apps/live-monitor

---

## Confidence Interpretation
- **≥0.8**: High certainty (Normal operation)
- **0.5–0.79**: Moderate certainty (Protective mode preferred)
- **<0.5**: Low certainty (Refusal required)

## Incident History

### Incident #001: Circuit Breaker Activation
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-14T03:00:04Z → 2025-12-14T03:00:06Z
- **Trigger**: Latency/Failure Threshold Exceeded

#### Event 001-A
- **Timestamp**: 2025-12-14T03:00:04.972Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse during injected failure
- **Recovery time**: 58.0s
- **Confidence**: 0.66 (Moderate)

#### Event 001-B
- **Timestamp**: 2025-12-14T03:00:05.003Z
- **Action**: Traffic Refusal / Degraded Mode
- **Recovery time**: 58.5s
- **Confidence**: 0.66 (Moderate)

#### Event 001-C
- **Timestamp**: 2025-12-14T03:00:05.095Z
- **Action**: Traffic Refusal / Degraded Mode
- **Recovery time**: 58.4s
- **Confidence**: 0.66 (Moderate)


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-14T03:30:12.678Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #002: Circuit Breaker Activation
- **Timestamp**: 2025-12-14T03:44:02.266Z
- **Trigger**: Latency/Failure Threshold Exceeded
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: 
  - System refused traffic to prevent collapse during injected failure
  - Recovery time: 50.3s
- **Confidence**: 0.96


### Incident #002: Circuit Breaker Activation
- **Timestamp**: 2025-12-14T03:44:02.329Z
- **Trigger**: Latency/Failure Threshold Exceeded
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: 
  - System refused traffic to prevent collapse during injected failure
  - Recovery time: 50.8s
- **Confidence**: 0.96


### Incident #003: Circuit Breaker Activation
- **Timestamp**: 2025-12-14T03:44:57.431Z
- **Trigger**: Latency/Failure Threshold Exceeded
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: 
  - System refused traffic to prevent collapse during injected failure
  - Recovery time: 46.2s
- **Confidence**: 0.96


### Incident #003: Circuit Breaker Activation
- **Timestamp**: 2025-12-14T03:44:57.475Z
- **Trigger**: Latency/Failure Threshold Exceeded
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: 
  - System refused traffic to prevent collapse during injected failure
  - Recovery time: 46.7s
- **Confidence**: 0.96

