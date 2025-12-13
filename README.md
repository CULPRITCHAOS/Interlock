# Interlock 🔒

> **The Circuit Breaker for AI Infrastructure**

Interlock is a failure forecasting and circuit-breaker system for AI infrastructure. It detects unsafe operating regions, forecasts collapse before it happens, and actively prevents catastrophic failure.

---

## ⚡ What Interlock Is

Interlock is a **failure forecasting and circuit-breaker system** for AI infrastructure:

- **Failure Boundary Detection** — Automatically identifies unsafe operating regions
- **Collapse Forecasting** — Predicts system failures before they happen
- **Circuit Breaker Protection** — Actively prevents catastrophic failure
- **Operational Warranty** — Certifies safe operating limits for AI systems

> If your AI infrastructure can fail, Interlock tells you when and how.

---

## 🚫 What Interlock Is NOT

- **Not an optimizer** — Interlock does not tune or improve system performance
- **Not universal intelligence** — Interlock works within calibrated domains only
- **Not predictive magic** — All forecasts are derived from observed data, not speculation

> Interlock does not optimize systems. It prevents them from breaking.

---

## ✅ Core Guarantees

| Guarantee | Description |
|-----------|-------------|
| **Detects unsafe operating regions** | Maps failure boundaries in parameter space |
| **Forecasts collapse before it happens** | Predicts time-to-failure, drop depth, recovery time |
| **Actively prevents catastrophic failure** | Circuit breaker triggers before system collapse |
| **Certifies safe operating limits** | Generates operational warranties with safety margins |

---

## 🏆 Tiered Certification System (Phase D7)

Interlock uses **tiered, defensible labels** instead of ambiguous "CERTIFIED" verdicts. Each tier explicitly states what it guarantees and what it does NOT guarantee.

### Certification Tiers

| Tier | Icon | Criteria | Use Case |
|------|------|----------|----------|
| **Safety-Certified** | ✅ | F1 ≥ 0.7, FN ≤ 1 | Production systems where missing failures is unacceptable |
| **Operational-Certified** | ⚠️ | F1 ≥ 0.5, FP ≤ 3 | Systems where false alarms are costly |
| **Not Certified** | ❌ | Does not meet criteria | Shadow mode observation only |

### Safety-Certified (✅)

**Prioritizes**: Never missing a failure (min FN, FP tolerated)

**Guarantees**:
- False negative rate ≤ 5% (rarely misses real failures)
- Will escalate conservatively when uncertain
- Quality floor enforcement active
- Flash crowd protection enabled

**Does NOT Guarantee**:
- Zero false positives (may trigger when not strictly necessary)
- Exact prediction timing (stochastic variance exists)
- Protection against novel failure modes outside calibration data

### Operational-Certified (⚠️)

**Prioritizes**: Avoiding over-reaction (bounded FP)

**Guarantees**:
- False positive rate bounded (minimizes unnecessary interventions)
- Will not over-react to transient spikes
- Hysteresis prevents flapping

**Does NOT Guarantee**:
- Catching all edge-case failures (may miss marginal cases)
- Full safety in high-risk scenarios

### Not Certified (❌)

**Status**: Unsafe region - explicit refusal

**Available**:
- Logging and monitoring still operational
- Shadow mode available for observation

**Not Available**:
- Active protection
- Reliable predictions

### Certification Report Structure

Every certification includes:

```json
{
  "overallVerdict": "SAFETY_CERTIFIED",
  "certificationDetails": {
    "tier": "SAFETY_CERTIFIED",
    "confidenceLevel": 0.85,
    "falseNegativeRate": 0.03,
    "falsePositiveRate": 0.12,
    "guarantees": ["..."],
    "doesNotGuarantee": ["..."],
    "knownBlindSpots": ["..."],
    "validUnderConditions": ["..."],
    "invalidUnderConditions": ["..."]
  }
}
```

> **Principle**: "Refuse capability rather than lie about safety."

---

## 🔬 Proof: Key Components

### FailureForecastCalibrator
Calibrates failure forecasts against observed outcomes:
- Predicts time-to-failure based on degradation gradients
- Measures prediction error (precision, recall, F1)
- Tracks false positives/negatives for continuous improvement
- **Location**: `backend/faiss_harness.py`

### PhysicalDriftInjector
Injects physical drift through load-based stress:
- Progressive vector injection (memory pressure)
- Query rate spikes (latency stress)
- Index rebuild pressure
- **Location**: `backend/faiss_harness.py`

### Circuit Breaker Export
Generates self-defending clients:
- Automatic degraded mode when hazard detected
- Three states: CLOSED (normal), OPEN (degraded), HALF_OPEN (recovering)
- Logs all interventions for audit
- **Location**: `backend/circuit_breaker.py`

### Stress Chamber (Phase I)
Visual failure demonstration:
- Real-time CLI visualization of memory, latency, recall, hazard
- Protected run vs Control run comparison
- Shows failure forming before it happens
- **Location**: `scripts/stress-chamber.ts`

### @interlock.protect Decorator (Phase II)
One-line deployable protection:
- Pre-call: Check forecast risk
- On hazard: Apply failover strategy
- Post-call: Record outcome for calibration
- **Location**: `backend/interlock.py`

---

## 🚀 Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run the dashboard**
   ```bash
   npm run dev
   ```

3. **Run failure certification**
   ```bash
   # FAISS Ground-Truth Certification
   npm run sim:run -- --seed 42 --mode phase4 --initial-size 10000 --growth-steps 10 --vectors-per-step 10000
   ```

4. **Run Stress Chamber demo**
   ```bash
   # Run both protected and control tests
   npx tsx scripts/stress-chamber.ts --both --no-visualize --growth-steps 25
   ```

---

## 📋 Output Artifacts

Every certification run produces:

| Artifact | Description |
|----------|-------------|
| `certification_report.md` | Executive summary with verdict (CERTIFIED / CONDITIONAL / NOT_CERTIFIED) |
| `forecast_calibration.md` | Brier score, reliability curves, cost-sensitive evaluation (Phase III) |
| `operational_warranty.md` | CTO-grade safety guarantees with safe load, trigger points, half-life |
| `circuit_breaker.ts` | Runnable self-defending client code |
| `operational_warranty.json` | Machine-readable safety guarantees |

---

## 🛡️ Circuit Breaker States

| State | Icon | Behavior |
|-------|------|----------|
| **CLOSED** | 🟢 | Normal operation — optimal settings |
| **OPEN** | 🔴 | Degraded mode — reduced accuracy for stability |
| **HALF_OPEN** | 🟡 | Recovery testing — cautiously returning to normal |

---

## 📊 What Interlock CAN Predict

- ✅ Approximate time-to-threshold-breach based on observed degradation gradients
- ✅ Risk level classification (safe/yellow/red) with measured precision/recall
- ✅ Order-of-magnitude recovery time estimates after degradation
- ✅ Memory pressure trends from progressive index growth
- ✅ Recall degradation patterns under increasing load
- ✅ Latency spike probability based on historical data

## ❌ What Interlock CANNOT Predict

- ❌ Novel failure modes not observed during calibration
- ❌ Exact timing of failures (inherent stochastic variance)
- ❌ System-level failures (OOM kills, disk full, network issues)
- ❌ Concurrent workload interference effects
- ❌ Hardware-specific performance cliffs
- ❌ Effects of system updates or configuration changes

---

## 🚫 What Interlock Refuses to Do

Interlock is designed with explicit boundaries. These are not limitations to be "fixed" — they are intentional constraints that ensure honest, trustworthy operation.

### Interlock WILL NOT:

| Refusal | Rationale |
|---------|-----------|
| **Predict novel failure modes** | Forecasts are based on observed data only. Claiming to predict unseen failures would be dishonest. |
| **Guarantee uptime** | No system can guarantee uptime. Interlock reduces failure probability, it doesn't eliminate it. |
| **Replace load testing** | Interlock monitors production, it doesn't simulate all possible scenarios. Load test separately. |
| **Optimize performance** | Interlock prevents breaking, not optimizes. Use dedicated tuning tools for optimization. |
| **Claim universal safety** | Safety margins are calibration-specific. New configurations require new calibration. |

### Interlock WILL:

| Commitment | Implementation |
|------------|----------------|
| **Escalate conservatively when confidence degrades** | When forecast confidence drops below threshold, Interlock biases toward protective action, not permissive action. |
| **Prefer false positives over false negatives** | Better to trigger degraded mode unnecessarily than to miss a real failure. |
| **Record uncertainty explicitly** | All forecasts include confidence intervals. No false certainty is emitted. |
| **Generate forensic incident reports** | Every intervention produces a post-mortem-ready artifact explaining what happened and why. |

### Trust Boundaries

Interlock operates within these explicit trust boundaries:

1. **Calibration-Bound**: Predictions are only valid for configurations observed during calibration
2. **Evidence-Driven**: All thresholds and hysteresis parameters are derived from measured behavior, not magic constants
3. **Uncertainty-Aware**: When Interlock doesn't know, it says so and escalates conservatively
4. **Honest Assessment**: Certification reports include "What We Cannot Predict" sections

> **If Interlock is uncertain, it will tell you. If Interlock can't help, it will say so.**

---

## 🔄 Hysteresis Lock (Anti-Flapping)

Circuit breakers without hysteresis flap under noisy recovery conditions, destroying trust. Interlock v5.0 implements evidence-driven hysteresis:

### State Machine Diagram

```
                         ┌─────────────────────────────────────┐
                         │                                     │
                         ▼                                     │
┌──────────┐  hazard > threshold  ┌──────────┐                │
│          │ ─────────────────────>│          │                │
│  CLOSED  │  OR confidence drop  │   OPEN   │<───────────────┤
│  (🟢)    │  OR flash crowd      │   (🔴)   │   probe failed │
│          │  OR quality floor    │          │                │
└──────────┘                      └──────────┘                │
     ^                                  │                      │
     │                                  │                      │
     │                                  │ K consecutive safe   │
     │                                  │ X% recovery          │
     │                                  │ min confidence       │
     │                                  ▼                      │
     │     N safe probe windows   ┌──────────┐                │
     └────────────────────────────│          │────────────────┘
                                  │HALF_OPEN │
                                  │   (🟡)   │
                                  │          │
                                  └──────────┘
```

### State Transitions (REQUIRED)

| From | To | Trigger |
|------|----|---------|
| CLOSED | OPEN | Hazard exceeds threshold |
| CLOSED | OPEN | **Reflex Trip**: Flash crowd detected (load spike) |
| CLOSED | OPEN | **Quality Floor**: Recall below minimum |
| CLOSED | OPEN | **Confidence Drop**: Below threshold |
| OPEN | HALF_OPEN | K consecutive safe intervals + recovery + confidence |
| HALF_OPEN | CLOSED | N successful probe windows |
| HALF_OPEN | OPEN | Probe failed |

### OPEN → HALF_OPEN Requirements

All of the following must be true before Interlock considers recovery:

1. **K consecutive safe intervals** (hazard below threshold)
2. **X% safety margin recovery** relative to trigger point (derived from calibration)
3. **Forecast confidence exceeds minimum threshold**
4. **Not in reflex cooldown** (after flash crowd protection)

### HALF_OPEN Behavior

- Routes only 1-5% probe traffic
- Observes hazard delta and recovery trend
- Promotes to CLOSED only if probe remains safe across N windows
- Otherwise reverts to OPEN

### What This Prevents

- ❌ Hard-coded cooldown times
- ❌ Magic constants not tied to measured behavior
- ❌ Premature recovery attempts
- ❌ State oscillation (flapping)

---

## ⚡ Reflexive Safety Override (Flash Crowd Protection)

**Problem**: Forecasts fail under step-function load spikes.

**Solution**: A spinal reflex that bypasses forecast logic entirely when:

```
(current_load - previous_load) > FLASH_THRESHOLD
```

### Behavior

| Action | Description |
|--------|-------------|
| **Immediate trip** | Breaker goes to OPEN without waiting for confidence computation |
| **Bypass forecasting** | This is a reflex, not prediction |
| **Enter cooldown** | Hysteresis cooldown window prevents premature recovery |
| **Resume forecasting** | Only after stabilization period |

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `flashThreshold` | 2.0 | Load ratio that triggers reflex (2x = double previous load) |
| `reflexCooldownMs` | 30000 | Cooldown period after reflex trip |

### Market Language

> **"Reflexive safety override for flash crowd protection."**

---

## 🛑 Quality Floor Enforcement (Outcome-Based Degradation)

**Problem**: Surviving with garbage results is silent failure.

**Principle**: Refusal is safer than corruption.

### Behavior

```
IF recall < QUALITY_FLOOR:
    REFUSE request (load shed)
ELSE:
    degrade gracefully
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `qualityFloor` | 0.5 | Minimum recall before refusing requests (50%) |
| `qualityFloorEnabled` | true | Enable/disable quality floor enforcement |

### What Gets Logged

- All refusals are logged as **trust-preserving actions**
- Refusal reason includes observed recall vs floor
- Supports audit trail for SRE investigation

### Market Language

> **"Interlock prefers refusal over corruption."**

---

## 👁️ Shadow Mode (Trust Acquisition / Dry Run)

**Problem**: No Enterprise CTO will let you install an active circuit breaker that degrades their customer experience on Day 1. They're scared of false positives.

**Solution**: A "Log Only" or "Shadow Mode" where Interlock pretends to trip the breaker and logs "I WOULD have downgraded precision here" but doesn't actually touch the traffic.

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dryRun` | false | If true, log decisions but don't interfere with traffic |

### TypeScript Usage

```typescript
const shadowConfig: HysteresisConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  dryRun: true  // Enable shadow mode
};

const breaker = new HysteresisLock(shadowConfig, circuitBreakerConfig);
const result = breaker.update(metrics);

// In shadow mode:
// - result.isShadowMode === true
// - result.shadowBlock contains what WOULD have happened
// - result.newState stays at 'closed' (no actual intervention)
```

### Python Usage

```python
from interlock import protect, get_shadow_blocks

@protect(
    domain="faiss",
    dry_run=True  # Shadow Mode enabled
)
def search_vectors(query):
    return index.search(query)

# After running queries, audit the decisions
shadow_blocks = get_shadow_blocks(search_vectors)
for block in shadow_blocks:
    print(f"Would have: {block['trigger']}")
    print(f"Reason: {block['reason']}")
```

### Shadow Block Record

| Field | Description |
|-------|-------------|
| `timestamp` | When the shadow block was recorded |
| `wouldHaveTransitioned` | `true` if state would have changed |
| `fromState` | Current state |
| `toState` | State that would have been entered |
| `trigger` | What triggered the virtual intervention |
| `reason` | Human-readable explanation |

### Use Case: Trust Acquisition

1. **Week 1**: Deploy Interlock in shadow mode
2. **Week 2**: Audit shadow blocks - review "I WOULD have..." decisions
3. **Week 3**: If decisions align with expectations, enable active mode
4. **Ongoing**: Keep shadow mode running on a subset for continuous validation

### Market Language

> **"Shadow mode lets you audit Interlock's decisions for a week before giving it control."**

---

## 📉 Adaptive Risk Escalation (Confidence Decay Logic)

**Problem**: Systems may claim false certainty when they should be uncertain.

**Principle**: Interlock must explicitly say "I don't know".

### Behavior

When confidence drops sharply:
1. **Escalate protection before certainty collapses**
2. **Increase conservatism automatically**
3. **Never interpolate or extrapolate false certainty**

### Tracked Metrics (REQUIRED)

| Metric | Description |
|--------|-------------|
| `confidenceDropPercent` | Percentage drop in confidence from early to late window |
| `escalatedConservatively` | `true` if protection escalated when confidence degraded |
| `noFalseCertainty` | `true` if we never claimed certainty we don't have |

### How It Works

```typescript
// When confidence degrades below threshold
if (metrics.confidence < minimumConfidenceThreshold) {
  // TRUST ENFORCEMENT: Escalate conservatively
  // This ensures we don't claim false certainty
  escalatedConservatively = true;
  transitionTo('open', metrics,
    `Confidence dropped - escalating conservatively`);
}
```

---

## 📊 Trust Decay Tracking (Leading Indicator)

**Purpose**: Identify when the model is aging and needs attention.

### Tracked Over Time

| Metric | Description |
|--------|-------------|
| Early vs Late Confidence | Compare confidence at start vs end of observation window |
| Confidence Half-Life | How quickly confidence decays |
| Drift Severity | Magnitude of confidence degradation |

### Purpose

- Identify retraining need
- Quantify model aging
- Support MLOps decisions

### Constraint

> **Informational only** — no auto-retraining claims yet.

This is a **leading indicator** for human operators, not automated remediation.

---

## 📝 Forensic Incident Reports

When Interlock intervenes, it generates a post-mortem-ready forensic artifact:

### Report Contents (JSON + Markdown)

| Field | Description |
|-------|-------------|
| **Timestamp** | Exact moment of intervention |
| **Trigger conditions** | Which thresholds were breached |
| **Forecasted failure type** | What kind of failure was predicted |
| **Time-to-failure** | Predicted intervals until failure (with uncertainty bounds) |
| **Observed metrics** | System state at intervention time |
| **Mitigation action** | What Interlock did |
| **Counterfactual estimate** | What would have happened without intervention |
| **Time to stabilization** | How long until system recovered |
| **Final system state** | Current status after intervention |
| **Forecast confidence** | How certain was the prediction |

### Optional Fields

- Unsafe operating region encountered
- Recommended configuration changes
- Historical comparison to prior incidents

> **These reports are usable by an SRE without reading Interlock source code.**

---

## 🧪 Validation Test Suite

Run the validation test suite to verify all safety guarantees:

```bash
npm run validate
```

### Test Series (NON-NEGOTIABLE)

| # | Test | Description |
|---|------|-------------|
| 1 | **Flapping Prevention** | Compare no-interlock, without-hysteresis, with-hysteresis |
| 2 | **Incident Quality** | Verify forensic reports are actionable |
| 3 | **Counterfactual Survival** | Paired runs comparing protected vs control |
| 4 | **Trust Decay** | Verify confidence drops under novel stress |
| 5 | **Flash Crowd Reflex** | Verify reflexive safety override on load spikes |
| 6 | **Quality Floor Enforcement** | Verify refusal when recall < quality floor |
| 7 | **No False Certainty** | Verify Interlock never claims certainty it doesn't have |
| 8 | **Shadow Mode (Dry Run)** | Verify Interlock logs decisions without interfering with traffic |

### Success Criteria

| Criterion | Test |
|-----------|------|
| Protected system survives | Counterfactual Survival |
| Control system crashes | Counterfactual Survival |
| Reports generated before failure | Incident Quality |
| No silent degradation | Quality Floor Enforcement |
| Conservative escalation verified | Trust Decay, No False Certainty |
| Shadow mode logs without interfering | Shadow Mode |

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Python (FAISS harness, circuit breaker, certification)
- **Visualization**: Recharts, HTML5 Canvas
- **Runtime**: Node.js with tsx

---

## 📂 Project Structure

- `/backend` — Python FAISS harness, circuit breaker, certification report generators
- `/components` — UI widgets (Early Warning Panel, Charts)
- `/services` — Failure forecasting, circuit breaker logic, state persistence, data sanitization
- `/scripts` — Headless simulation runners, benchmarks, stability tests
- `/results` — Certification outputs, benchmark reports, stability reports

---

## 🔒 v2.x Operational Hardening Features

### State Persistence (Restart Safety)

**Problem**: Interlock loses safety context on restart, creating unsafe optimism.

**Solution**: Local state persistence with safe boot behavior.

```typescript
// State is persisted to interlock_state.json
// Schema versioning ensures forward compatibility
// Validation prevents corrupt state from causing issues

// Safe boot rules:
// - If previous state was OPEN or HALF_OPEN → resume in OPEN (conservative)
// - Never auto-restore CLOSED without evidence
// - Corrupt state file → fail safe (OPEN)
```

| Scenario | Behavior |
|----------|----------|
| Restart during OPEN | Remains OPEN |
| Restart during cooldown | Cooldown respected |
| Corrupt state file | Fail safe → OPEN |
| Stale state (>24h) | Fresh start |

### Shadow Mode Trust Upgrade

**Problem**: Shadow Mode logs "would have blocked" events, but risks being interpreted as false positives.

**Solution**: Reframed outputs with semantic violation types:

| Old Output | New Output |
|------------|------------|
| SHADOW_BLOCK | SAFETY_MARGIN_VIOLATION |
| - | PROJECTED_FAILURE_WINDOW |
| - | QUALITY_DEGRADATION |
| - | CONFIDENCE_DECAY |

Each shadow block now includes:
- `distanceToBoundary` — How close to hazard threshold
- `durationInRedZone` — Time spent above threshold
- `counterfactualCrashPoint` — Estimated crash point without protection
- `explanation.survivedByLuck` — "System survived by luck, not safety"
- `explanation.interlockWouldHaveIntervened` — "Interlock would have intervened here"

### Forensic Data Sanitization (Legal + Utility)

**Problem**: Incident reports must be SRE-useful without leaking PII.

**Solution**: Semantic fingerprinting replaces raw data with statistical properties:

| Removed | Replaced With |
|---------|--------------|
| Raw query vectors | vector_norm, sparsity, centroid_id |
| User identifiers | Session hash |
| Request payloads | dimensional_entropy |
| Raw text | Content hash |

```typescript
// Semantic fingerprint includes:
// - vectorNorm: L2 norm of the vector
// - sparsity: Fraction of near-zero elements
// - centroidId: Anonymized nearest cluster ID
// - dimensionalEntropy: Information distribution
// - similarityDistribution: Statistical summary
```

### Comparative Benchmarks

Run comparative benchmarks to prove Interlock advantage:

```bash
npx tsx scripts/comparative-benchmark.ts
```

Compares four protection modes:
1. **No protection** — Baseline crash behavior
2. **Monitoring only** — Alerts without action
3. **Naive circuit breaker** — Simple threshold breaker
4. **Interlock** — Full evidence-based protection

### Long-Run Stability Test

Prove Interlock doesn't degrade over time:

```bash
npx tsx scripts/long-run-stability.ts --cycles 50
```

Validates:
- No memory leaks
- No confidence drift accumulation
- Stable state file size
- No increasing false positives

---

## 🚀 Production Readiness Checklist

Before deploying Interlock to production:

- [ ] **Run validation tests**: `npm run validate` — All 10 tests must pass
- [ ] **Run comparative benchmark**: Verify Interlock advantage vs alternatives
- [ ] **Run stability test**: Verify no degradation over time
- [ ] **Configure state persistence**: Set `stateFilePath` to persistent storage
- [ ] **Start in Shadow Mode**: Use `dryRun: true` for first week
- [ ] **Review shadow blocks**: Audit "would have blocked" decisions
- [ ] **Enable active protection**: Set `dryRun: false` after trust acquired
- [ ] **Set up monitoring**: Track breaker trips, recoveries, refusals
- [ ] **Configure alerting**: Alert on sustained OPEN state
- [ ] **Document rollback plan**: How to disable Interlock if needed

---

## 🛡️ How to Deploy Safely

### Week 1: Shadow Mode (Trust Acquisition)

```typescript
const config: HysteresisConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  dryRun: true  // Shadow mode - observe only
};
```

1. Deploy Interlock in shadow mode
2. Monitor shadow blocks in logs
3. Review "would have blocked" decisions
4. Verify alignment with expectations

### Week 2: Active Mode (Gradual Rollout)

```typescript
const config: HysteresisConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  dryRun: false  // Active protection
};
```

1. Enable active mode on non-critical traffic first
2. Monitor actual interventions
3. Verify no false positives on production traffic
4. Gradually increase traffic coverage

### Ongoing: Monitor and Tune

- Review incident reports weekly
- Track false positive/negative rates
- Adjust thresholds based on evidence
- Run stability tests monthly

---

## 🚫 What Interlock Refuses To Do

Interlock explicitly refuses to:

| Action | Reason |
|--------|--------|
| **Claim certainty it doesn't have** | Confidence decay tracking prevents false certainty |
| **Recover prematurely** | Hysteresis requires evidence before CLOSED |
| **Serve corrupt results** | Quality floor enforcement prefers refusal |
| **Ignore flash crowds** | Reflexive override bypasses slow forecasting |
| **Lose state on restart** | Persistence ensures safety context survives |
| **Leak PII in reports** | Data sanitization strips sensitive data |
| **Make unvalidated predictions** | All forecasts include uncertainty bounds |

> **Interlock prefers caution over optimism, refusal over corruption.**

---

## 📐 Guiding Principle

> **Interlock does not optimize systems. It prevents them from breaking.**
>
> **Interlock does not prevent failure. It makes failure visible before it happens.**

---

*Interlock v5.0.0 — The Circuit Breaker for AI Infrastructure*
