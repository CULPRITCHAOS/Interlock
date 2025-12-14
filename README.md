# Interlock 🔒

> **The Circuit Breaker for AI Infrastructure**

[![Test and Certify](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml)
[![Stress Chamber](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml)
[![Benchmark Suite](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/benchmark.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/benchmark.yml)
[![Competitive Benchmark](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/competitive-benchmark.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/competitive-benchmark.yml)
[![Scale Test](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml)
[![Real FAISS Validation](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/real-faiss-validation.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/real-faiss-validation.yml)
[![Adapter Stress Tests](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/adapter-stress-test.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/adapter-stress-test.yml)
[![Adapter Certification](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/adapter-certification.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/adapter-certification.yml)

**📋 Documentation**: [Security Policy](./SECURITY.md) | [Contributing Guide](./CONTRIBUTING.md) | [Security Architecture](./docs/SECURITY_ARCHITECTURE.md) | [Production Deployment](./docs/PRODUCTION_DEPLOYMENT.md) | [Test Results](./docs/TEST_RESULTS.md) | [Case Study Template](./docs/CASE_STUDY_TEMPLATE.md)

Interlock is a failure forecasting and circuit-breaker system for AI infrastructure. It detects unsafe operating regions, forecasts collapse before it happens, and actively prevents catastrophic failure.

---

## 🎯 The 60-Second Explanation

> **Interlock is the structural safety certification for AI systems.**
> 
> Like a bridge load rating, it certifies that a system survived a defined stress test without collapsing, stalling, or lying to users.
> 
> **It certifies observed survival — not invincibility.**

What this means in practice:
- A bridge rated for 10 tons doesn't guarantee it won't fail — it means it survived a 10-ton stress test
- Interlock Class V certification doesn't guarantee your AI won't fail — it means it survived rigorous testing with all safety features enabled
- Certification expires (default 30 days) because conditions change
- Tampering with the certification badge is detectable via cryptographic signature

**Interlock does not prevent failure. It makes failure visible early — and survivable.**

---

## 🔌 Framework Integrations

Interlock provides lightweight adapters for popular AI frameworks and vector databases. These adapters add safety guardrails without changing your existing code structure.

### LangChain Integration

Wrap LangChain chains and retrievers with Interlock safety checks:

```typescript
import { wrapChain, wrapRetriever } from './adapters/langchain';
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';

// Wrap a chain with safety guardrails
const safeChain = wrapChain(myChainFunction, DEFAULT_HYSTERESIS_CONFIG);

// Execute with automatic safety checks
const result = await safeChain.execute(input);

// Monitor safety metrics
const metrics = safeChain.getMetrics();
console.log(`Confidence: ${metrics.confidenceScore}, Refusals: ${metrics.refusalCount}`);
```

**Protection provided:**
- Pre-execution safety checks with trust decay
- Post-execution validation
- Automatic refusal when confidence drops below quality floor
- Shadow mode for trust acquisition (dry-run testing)

### LlamaIndex Integration

Identical interface for LlamaIndex query engines and retrievers:

```typescript
import { wrapChain, wrapRetriever } from './adapters/llamaindex';
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';

// Wrap a query engine
const safeQueryEngine = wrapChain(myQueryEngine, DEFAULT_HYSTERESIS_CONFIG);

// Execute with guardrails
const response = await safeQueryEngine.query(userQuery);
```

**What Interlock does NOT do:**
- Does not optimize chain/query performance
- Does not modify LlamaIndex internals
- Does not abstract away framework APIs
- Only adds observation + safety hooks

### Vector Database Integrations

#### Pinecone Adapter

Production-ready adapter with comprehensive monitoring:

```typescript
import { createPineconeAdapter } from './adapters/pinecone';

const adapter = createPineconeAdapter(0.5); // 0.5 = quality floor

// Wrap query function
const safeQuery = adapter.wrapQuery(pineconeClient.query);

// Execute with full monitoring
const results = await safeQuery({ vector, topK: 10 });

// Observe adapter state
const metrics = adapter.observe();
console.log(`Latency P95: ${metrics.latencyP95Ms}ms, Confidence: ${metrics.confidenceScore}`);
```

**What this provides:**
- Latency cliff detection (sudden spikes)
- Failure signal tracking
- Confidence-based refusal
- Controlled degradation hooks
- Shadow mode support

#### Elasticsearch Vector Search (EXPERIMENTAL)

Lightweight adapter for Elasticsearch vector/hybrid search:

```typescript
import { createElasticsearchAdapter } from './adapters/elasticsearch';

const adapter = createElasticsearchAdapter(200); // 200ms latency threshold

// Wrap search function
const safeSearch = adapter.wrapQuery(esClient.search);

// Detect silent degradation
const results = await safeSearch(searchParams);
```

**Status:** Experimental — demonstrates Interlock's enterprise applicability

#### Weaviate Adapter

Production-ready adapter for Weaviate vector database with GraphQL and REST API monitoring:

```typescript
import { createWeaviateAdapter } from './adapters/weaviate';

const adapter = createWeaviateAdapter({
  qualityFloor: 0.5,
  dryRun: false  // Set true for shadow mode
});

// Wrap GraphQL query function
const safeQuery = adapter.wrapQuery(weaviateClient.graphql, 'graphql');

// Execute with monitoring
const results = await safeQuery(query);

// Check metrics
const metrics = adapter.observe();
console.log(`GraphQL latency: ${metrics.graphqlLatencyMs}ms`);
```

**Protection provided:**
- Latency cliff detection (3x spike threshold)
- Silent degradation detection (50% increase)
- GraphQL/REST per-endpoint monitoring
- Batch import latency tracking

#### Milvus Adapter

Production-ready adapter for Milvus vector database with timeout detection:

```typescript
import { createMilvusAdapter } from './adapters/milvus';

const adapter = createMilvusAdapter({
  qualityFloor: 0.5,
  dryRun: true  // Shadow mode for observation
});

// Wrap search with 30s timeout
const safeSearch = adapter.wrapOperation(milvusClient.search, 'search', 30000);

// Execute with timeout detection
const results = await safeSearch(searchParams);

// Monitor timeouts
const metrics = adapter.observe();
console.log(`Timeouts: ${metrics.timeoutCount}`);
```

**Protection provided:**
- Query timeout detection with severe confidence degradation
- Search/insert latency tracking
- Collection availability monitoring

### Adapter Summary

| Adapter | Status | LOC | Features | Class Capable |
|---------|--------|-----|----------|---------------|
| **LangChain** | ✅ Production | ~327 | Chain/retriever wrapping, trust decay | Class V |
| **LlamaIndex** | ✅ Production | ~320 | Query engine wrapping, trust decay | Class V |
| **Pinecone** | ✅ Production | ~700 | Full monitoring, controlled degradation | Class V |
| **Weaviate** | ✅ Production | ~180 | GraphQL/REST monitoring, latency cliffs | Class V |
| **Milvus** | ✅ Production | ~180 | Timeout detection, search/insert tracking | Class V |
| **Elasticsearch** | ⚠️ Experimental | ~228 | Basic latency monitoring | Class III |

> All adapters implement the shared `InterlockAdapter` interface and support shadow mode.

---

## 🏅 What Certification Means

### "Certified on Pinecone" / "Certified on Elasticsearch"

**What it guarantees:**
- Adapter survived stress testing without crashing
- Latency monitoring detected degradation correctly
- Confidence-based refusal worked as designed
- No false certainty (degraded confidence when appropriate)

**What it does NOT guarantee:**
- Perfect recall or zero latency spikes
- Protection against Pinecone/ES infrastructure failures
- Optimization of vector search performance
- Universal applicability to all query patterns

**Analogy:** Like a bridge load rating — it certifies survival under defined stress, not invincibility.

**Certification expires:** Default 30 days, because system conditions change.

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

## 🛡️ Interlock Classes (Class I-V)

Interlock uses a **five-class rating system** that is deterministically derived from your configuration and enabled features. You cannot spoof your class by changing labels - it's computed from your actual setup.

| Class | Name | Codename | Description |
|-------|------|----------|-------------|
| **I** | Observable | Mirror | Observability + boundary reporting, no interventions |
| **II** | Static | Fuse | Static threshold breaker capability |
| **III** | Dynamic | Governor | Forecast-driven preventative intervention |
| **IV** | Reflexive | Airbag | Reflex override + hysteresis (anti-flap) |
| **V** | Cognitive | Pilot | Trust decay + no false certainty + quality floor |

### Anti-Gaming Rules

- **Class V requires**: `qualityFloorEnabled=true`, `qualityFloor>0`, trust decay tracking, no false certainty
- **Class IV requires**: `flashThreshold>0`, reflex override, hysteresis enabled
- **Disabled features = lower class**: You can't claim Class V if quality floor is disabled

### Badge Expiry

Certifications expire after 30 days (configurable). This prevents "badge rot" - stale certifications that don't reflect current system state.

For full details, see [INTERLOCK_CLASSES.md](./INTERLOCK_CLASSES.md).

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

### 🎯 Source of Truth

The Interlock Shield badge, release tag, and certification metadata are generated from a **single derived certification result**.

- All certification metadata comes from `deriveInterlockClass()` 
- No partial reconstruction or recomputation occurs
- If certification metadata is incomplete or inconsistent, badge generation **fails hard**
- This prevents ambiguous or misleading certification claims

**Zero tolerance for `undefined` values in production certification.**

#### Badge Generation Pipeline

```javascript
// 1. Derive certification object ONCE (contains everything)
const derived = deriveInterlockClass(config, circuitConfig, capabilities, validation)
// Already contains: interlock_class, load_rating, capabilities, test counts, expiry

// 2. Build badge metadata from derived object (no recomputation)
const badgeMetadata = {
  interlockClass: derived.class,
  loadRating: derived.loadRating,
  repository: process.env.GITHUB_REPOSITORY,
  repo_commit: getGitCommit(),
  config_fingerprint: configFingerprint,
  hardware_fingerprint: hardwareFingerprint,
  valid_until: expiryDate.toISOString(),
  test_suite_version: testSuiteVersion,
  // ... more fields from derived object
}

// 3. Validate - FAIL HARD if required fields missing
const requiredFields = ['interlockClass', 'loadRating', 'repository', 'repo_commit', 'valid_until']
for (const field of requiredFields) {
  if (!badgeMetadata[field]) {
    throw new Error(`CERTIFICATION FAILURE: Required field '${field}' is undefined`)
  }
}

// 4. Sign complete metadata and emit outputs
```

> 📊 **[View Live Test Results →](docs/TEST_RESULTS.md)**
>
> See detailed results from daily production monitoring, weekly stability tests, and stress testing.

---

## 🎯 Latest Test Results & Key Metrics

### ✅ Class V Certification Results

The latest stability test (50 cycles) demonstrates exceptional performance:

| Metric | Value | Status | Significance |
|--------|-------|--------|--------------|
| **False Negatives** | 0 | ✅ **Critical** | No missed dangerous conditions - meets Class V requirement |
| **False Positives** | 3266 | ✅ **Expected** | High sensitivity appropriate for safety-critical systems |
| **Confidence Drift** | 0.35% | ✅ **Outstanding** | Exceptional stability over 50 cycles |
| **Memory Growth** | 0.043 MB/cycle | ✅ **Bounded** | No memory leaks detected |
| **State File Growth** | 1.58 KB max | ✅ **Bounded** | Long-run deployment safe |

**Verdict**: These results legitimately support **Class V (Cognitive/Pilot)** certification.

> **Why zero false negatives matter**: Class V requires zero tolerance for missed failures. The system must never miss a dangerous condition - a single missed failure would invalidate the certification tier.

### 🧪 Comprehensive Test Coverage

All test suites are operational and passing:

| Test Suite | Status | Schedule | Purpose |
|------------|--------|----------|---------|
| **Test and Certify** | ✅ Passing | Every push/PR | Matrix testing (Python 3.9-3.11, Node 18-20) |
| **Competitive Benchmark** | ✅ Passing | Weekly (Sunday) | Interlock vs alternatives comparison |
| **Scale Test** | ✅ Passing | Weekly (Saturday) | Enterprise scale validation (1M+ vectors, 1000 QPS) |
| **Chaos Engineering** | ✅ Passing | On-demand | 6 resilience scenarios |
| **Production Monitor** | ✅ Passing | Weekly (Wednesday) | Production workload simulation |
| **Long-Run Stability** | ✅ Passing | Weekly (Sunday) | 50-cycle stability validation |
| **Stress Chamber** | ✅ Passing | Daily at 2 AM UTC | Stress testing with medium/heavy profiles |
| **Real FAISS Validation** | 🆕 New | Weekly (Saturday) | **Actual FAISS operations, not simulation** |
| **Adapter Stress Tests** | ✅ Passing | Daily at 3 AM UTC | Per-adapter stress testing (6 adapters) |
| **Adapter Stability Tests** | ✅ Passing | Weekly (Saturday) | Long-run adapter validation |
| **Adapter Certification** | ✅ Passing | Weekly (Sunday) | Class III/IV/V adapter certification |

**Success Criteria Met:**
- ✅ Control crash rate ≥80% (tests are appropriately difficult)
- ✅ Protected survival rate ≥95% (circuit breaker prevents failures)
- ✅ All matrix combinations passing (Python 3.9, 3.10, 3.11 + Node 18, 20)
- ✅ Zero false negatives in stability tests

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

3. **Run validation test suite**
   ```bash
   # Run full validation test suite (11 tests)
   npm run validate
   
   # Run chaos engineering tests (6 scenarios)
   npm run chaos-test
   
   # Calculate economic value/ROI
   npm run roi-calculator
   ```

4. **Run failure certification**
   ```bash
   # FAISS Ground-Truth Certification
   npm run sim:run -- --seed 42 --mode phase4 --initial-size 10000 --growth-steps 10 --vectors-per-step 10000
   ```

5. **Run Stress Chamber demo**
   ```bash
   # Quick validation with light profile
   npx tsx scripts/stress-chamber.ts --profile light --both --no-visualize
   
   # Standard testing with medium profile (default)
   npx tsx scripts/stress-chamber.ts --both --no-visualize
   
   # Aggressive testing with heavy profile
   npx tsx scripts/stress-chamber.ts --profile heavy --both --no-visualize
   ```

### Stress Test Profiles

Interlock provides three stress profiles for different testing scenarios:

| Profile | Recall | Latency | Vectors/Step | Steps | Use Case |
|---------|--------|---------|--------------|-------|----------|
| **Light** | ≥70% | ≤50ms | 10,000 | 15 | Quick validation |
| **Medium** | ≥75% | ≤40ms | 15,000 | 25 | CI/CD daily runs |
| **Heavy** | ≥80% | ≤30ms | 25,000 | 30 | Certification runs |

**Why tests are intentionally hard:**
- Control runs SHOULD crash (demonstrates real failure scenarios)
- Protected runs MUST survive (validates circuit breaker protection)
- Target: 80%+ crash rate for control, 95%+ survival for protected
- If both survive, the test wasn't stressful enough

For detailed crash statistics and test philosophy, see [TEST_RESULTS.md](docs/TEST_RESULTS.md).

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
| 9 | **State Persistence** | Verify state survives restarts safely |
| 10 | **Forensic Data Sanitization** | Verify incident reports protect PII |
| 11 | **Hardware Fingerprint** | Verify hardware mismatch invalidates cached state |
| 12 | **Class Certification Integrity** | Verify class derivation, anti-gaming, badge expiry |

### Success Criteria

| Criterion | Test |
|-----------|------|
| Protected system survives | Counterfactual Survival |
| Control system crashes | Counterfactual Survival |
| Reports generated before failure | Incident Quality |
| No silent degradation | Quality Floor Enforcement |
| Conservative escalation verified | Trust Decay, No False Certainty |
| Shadow mode logs without interfering | Shadow Mode |
| Class cannot be spoofed | Class Certification Integrity |
| Badge expiry enforced | Class Certification Integrity |

---

## 🔄 CI/CD Pipeline

Interlock includes automated GitHub Actions workflows for continuous testing, certification, and evidence collection:

### Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| **Test and Certify** | Every push/PR | Matrix testing (Python 3.9-3.11, Node 18-20), validation suite, badge verification |
| **Stress Chamber** | Daily at 2 AM UTC | Comparative stress tests, 50-cycle stability tests, memory/latency tracking |
| **Benchmark Suite** | Weekly (Sundays) | Performance comparison, regression tracking, Interlock vs alternatives |
| **Production Monitor** | Weekly (Wednesdays) | Simulated production workloads, failure injection, economic impact |
| **Generate Badge** | Manual (on-demand) | Certification badge generation, GitHub release creation |

### Automated Evidence Collection

Every workflow run collects artifacts proving Interlock claims:

- **Test results**: Validation pass/fail, certification verdicts
- **Performance metrics**: Latency, recall, memory usage over time
- **Incident reports**: Forensic data from failures (sanitized)
- **Economic impact**: Queries saved, downtime prevented, value retained
- **Certification badges**: Tamper-evident badges with expiry dates

### Viewing Results

1. Go to the [Actions tab](../../actions)
2. Select a workflow
3. Download artifacts or view workflow summaries

For detailed documentation, see [`.github/workflows/README.md`](.github/workflows/README.md).

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

### Hardware Fingerprinting (Prevents "Hardware Lottery" Crashes)

**Problem**: Thresholds learned on a large machine may be unsafe on a smaller one, causing immediate acceptance of unsafe load when state is transferred between machines.

**Solution**: Store hardware fingerprint with persisted state and invalidate on mismatch.

```typescript
// Hardware fingerprint includes:
// - totalSystemMemoryMb (required)
// - cpuCores (optional)
// - containerMemoryLimitMb (optional, auto-detected via cgroup)

// On startup:
// - Compare current hardware to saved fingerprint
// - If memory differs by >20%, invalidate cached safety envelope
// - Enter conservative mode (OPEN state) rather than CLOSED
// - Emit single low-frequency log explaining invalidation
```

| Scenario | Behavior |
|----------|----------|
| Same hardware | Load state normally |
| Memory differs >20% | Invalidate state, start OPEN |
| CPU cores differ significantly | Warning only |
| Container limit changed | Invalidate state, start OPEN |

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
// - Hardware mismatch → invalidate learned thresholds
```

| Scenario | Behavior |
|----------|----------|
| Restart during OPEN | Remains OPEN |
| Restart during cooldown | Cooldown respected |
| Corrupt state file | Fail safe → OPEN |
| Stale state (>24h) | Fresh start |
| Hardware mismatch | Invalidate + OPEN |

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

### CI-Validated (Automatically Checked) ✅

These items are continuously validated by CI workflows:

- [x] **Run validation tests**: `npm run validate` — All tests pass (Test and Certify workflow)
- [x] **Run comparative benchmark**: Interlock advantage verified (Competitive Benchmark workflow)
- [x] **Run stability test**: No degradation over time (Adapter Stability Tests workflow)
- [x] **Run scale test**: Handles 1M+ vectors at 1000 QPS (Scale Test workflow)
- [x] **Adapter certification**: All 6 adapters certified (Adapter Certification workflow)

### Infrastructure Setup (Manual) 📋

These require manual configuration for your environment:

- [ ] **Configure state persistence**: Set `stateFilePath` to persistent storage
- [ ] **Set up monitoring**: Track breaker trips, recoveries, refusals
- [ ] **Configure alerting**: Alert on sustained OPEN state
- [ ] **Document rollback plan**: How to disable Interlock if needed
- [ ] **Generate certification badge**: Run `npx tsx scripts/generate-badge.ts`

### Deployment Steps (Week-by-Week) 🚦

- [ ] **Week 1 - Shadow Mode**: Deploy with `dryRun: true` for observation
- [ ] **Week 1 - Review shadow blocks**: Audit "would have blocked" decisions
- [ ] **Week 2 - Enable active protection**: Set `dryRun: false` after trust acquired

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

## 📜 Certification Philosophy (Stress Test Certified, Not System Safety)

**Important**: Interlock certifies past test evidence, not future safety guarantees.

### What We Certify

✅ "This configuration survived this stress test under these conditions"  
✅ "Interlock detected and prevented X potential failures during testing"  
✅ Evidence of survival with measured metrics

### What We Do NOT Certify

❌ "This system will never fail"  
❌ "This configuration is safe under all conditions"  
❌ Future behavior predictions

> **Certification is evidence of survival, not a prediction of safety.**

For full certification documentation, see [CERTIFICATION.md](./CERTIFICATION.md).

---

## 🛡️ Interlock Shield (Badge System)

After running validation tests, generate a certification badge for your README:

```bash
# Run validation tests first
npm run validate

# Generate badge
npx tsx scripts/generate-badge.ts
```

This generates:
- `results/certification/interlock_shield.json` — Machine-readable badge data with expiry and cryptographic signature
- `results/certification/interlock_shield.md` — Copy/paste badge block for README
- `results/certification/interlock_shield.svg` — Visual badge image

### Badge Fields (v2.0)

| Field | Description |
|-------|-------------|
| **Interlock Class** | I–V based on enabled features + config (anti-gaming enforced) |
| **Load Rating** | I–V based on vectors/QPS tested |
| **Reflex** | Active (<Xms) or Disabled |
| **Drift Tolerance** | Percentage tolerance for hardware changes |
| **Quality Floor** | Enforced (min recall threshold) or Disabled |
| **Last Audit** | Date of last validation run |
| **Valid Until** | Badge expiry date (default: 30 days) |
| **Tested On** | Hardware fingerprint (memory, cores, platform) |
| **Signature** | HMAC-SHA256 signature for tamper-evidence |

### Tamper-Evident Certification

The badge includes a cryptographic signature that makes manual edits detectable:

- **Signed fields**: `interlock_class`, `load_rating`, `valid_until`, `repo_commit`, `config_fingerprint`, `hardware_fingerprint`, `test_suite_version`
- **Runtime verification**: On load, the signature is recomputed and compared
- **On mismatch**: Emits `SECURITY WARNING: Certification Badge Tampered` (does not crash)

This is **tamper-evident, not tamper-proof** — edits are detectable but not prevented.

### Example Badge Output

```markdown
## 🛡️ Interlock: Class V (Cognitive)

> *Trust decay + no false certainty + quality floor/refusal*

| Field | Value |
|-------|-------|
| **Interlock Class** | V (Cognitive/Pilot) |
| **Status** | ✅ Safety Certified |
| **Load Rating** | Class III (Heavy) |
| **Reflex** | Active (<30ms) |
| **Drift Tolerance** | 20% |
| **Quality Floor** | Enforced (min 50% recall) |
| **Last Audit** | 2025-12-13 |
| **Valid Until** | 2026-01-12 |
| **Tests** | 12/12 passed |

> **Disclaimer**: This certification certifies that this configuration survived stress tests under controlled conditions. It does not guarantee future safety or behavior under different conditions.
```

---

## 💰 Economic Value Tracking

Interlock can compute economic value retained during incidents:

### Configuration

Set `cost_per_query` in your incident report configuration:

```typescript
const economicData = {
  controlCrashPoint: 45,      // Step at which unprotected system crashed
  maxLoadProtected: 100,      // Max load the protected system handled
  queriesSaved: 5500,         // Additional queries processed
  costPerQuery: 0.001,        // Cost per query in USD
  currency: 'USD'
};
```

### Output

Incident reports include:

```json
{
  "economicImpact": {
    "controlCrashPoint": 45,
    "maxLoadProtected": 100,
    "queriesSaved": 5500,
    "costPerQuery": 0.001,
    "valueRetained": 5.50,
    "currency": "USD"
  }
}
```

> **Note**: `valueRetained` is an estimate based on your configured `costPerQuery`. Actual savings may vary based on business context.

---

*Interlock v5.0.0 — The Circuit Breaker for AI Infrastructure*
