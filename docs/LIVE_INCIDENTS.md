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


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T09:33:33.329Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T09:40:46.229Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T09:56:53.316Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T10:03:05.943Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T10:08:49.946Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T10:20:40.122Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T15:35:03.320Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-15T16:11:10.375Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-18T04:50:20.235Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 001-A
- **Timestamp**: 2025-12-18T04:54:39.808Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 259.6s
- **Confidence**: 0.87 (Moderate)


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T02:45:03.766Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T02:47:55.345Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T02:57:04.521Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T03:02:06.272Z → ...
- **Trigger**: Confidence < Quality Floor


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T09:46:54.092Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 001-A
- **Timestamp**: 2025-12-20T09:47:01.062Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 7.0s
- **Confidence**: 0.99 (Moderate)


### Incident #001: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T10:42:01.110Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 001-A
- **Timestamp**: 2025-12-20T10:42:53.824Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 52.7s
- **Confidence**: 0.55 (Moderate)


### Incident #002: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T10:44:55.436Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 002-A
- **Timestamp**: 2025-12-20T10:45:43.285Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 47.9s
- **Confidence**: 0.75 (Moderate)


### Incident #003: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T11:58:00.872Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 003-A
- **Timestamp**: 2025-12-20T11:58:07.429Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 6.6s
- **Confidence**: 1.00 (Moderate)


### Incident #004: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T13:32:37.663Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 004-A
- **Timestamp**: 2025-12-20T13:32:43.539Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 5.9s
- **Confidence**: 0.99 (Moderate)


### Incident #005: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T17:34:10.531Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 005-A
- **Timestamp**: 2025-12-20T17:34:16.280Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 5.7s
- **Confidence**: 0.99 (Moderate)


### Incident #006: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T18:16:24.972Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 006-A
- **Timestamp**: 2025-12-20T18:16:30.704Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 5.7s
- **Confidence**: 0.99 (Moderate)


### Incident #007: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T19:38:44.961Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 007-A
- **Timestamp**: 2025-12-20T19:38:50.873Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 5.9s
- **Confidence**: 0.99 (Moderate)


### Incident #008: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-20T21:52:56.324Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 008-A
- **Timestamp**: 2025-12-20T21:53:02.373Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 6.0s
- **Confidence**: 0.99 (Moderate)


### Incident #009: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-21T00:45:58.588Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 009-A
- **Timestamp**: 2025-12-21T00:46:04.714Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 6.1s
- **Confidence**: 0.99 (Moderate)


### Incident #010: Traffic Refusal
- **Failure Class**: Forced application error (non-user, non-network)
- **Incident Window**: 2025-12-21T02:12:27.933Z → ...
- **Trigger**: Confidence < Quality Floor

#### Event 010-A
- **Timestamp**: 2025-12-21T02:12:33.965Z
- **Action**: Traffic Refusal / Degraded Mode
- **Outcome**: System refused traffic to prevent collapse
- **Recovery time**: 6.0s
- **Confidence**: 0.99 (Moderate)

