# Interlock Architecture

This document provides a high-level overview of Interlock's architecture, components, and data flow.

---

## System Overview

Interlock is a **failure forecasting and circuit-breaker system** that makes AI system failures visible early and survivable. It operates as a safety and certification layer, not as an optimization or orchestration framework.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                           │
│  (LangChain, LlamaIndex, Pinecone, Elasticsearch, Custom Apps)     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    ┌────────▼──────────┐
                    │   INTERLOCK CORE  │
                    │   (TypeScript +   │
                    │     Python)       │
                    └────────┬──────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼─────┐      ┌─────▼──────┐     ┌─────▼─────┐
    │ ADAPTERS │      │  SERVICES  │     │  SCRIPTS  │
    └──────────┘      └────────────┘     └───────────┘
         │                   │                   │
    ┌────▼─────────────┐     │            ┌─────▼─────────┐
    │ LangChain        │     │            │ Stress Tests  │
    │ LlamaIndex       │     │            │ Benchmarks    │
    │ Pinecone         │     │            │ Validation    │
    │ Elasticsearch    │     │            └───────────────┘
    └──────────────────┘     │
                             │
                    ┌────────▼──────────┐
                    │   CORE SERVICES   │
                    │ • Hysteresis      │
                    │ • Forecast        │
                    │ • Metrics         │
                    │ • State Persist   │
                    │ • Certification   │
                    └───────────────────┘
```

---

## Core Components

### 1. Core Engine

**Location:** `services/`

The core engine provides the foundational safety and certification logic.

#### 1.1 Failure Forecasting Calibrator

**File:** `services/forecast.ts`

**Purpose:** Predicts time-to-failure based on degradation gradients.

**Responsibilities:**
- Observe latency, recall, memory trends
- Compute degradation velocity
- Predict time-to-threshold-breach
- Track forecast accuracy (precision, recall, F1)

**Key Functions:**
```typescript
class ForecastCalibrator {
  calibrate(observations: Observation[]): ForecastModel;
  predict(currentState: SystemState): Prediction;
  measureError(prediction: Prediction, outcome: Outcome): Error;
}
```

**NOT in scope:**
- Optimization
- Root cause analysis
- Automated remediation

#### 1.2 Circuit Breaker Logic

**File:** `services/phaseIV.ts`, `services/phaseIV.types.ts`

**Purpose:** State machine for circuit protection.

**States:**
- **CLOSED** — Normal operation
- **OPEN** — Degraded mode (hazard detected)
- **HALF_OPEN** — Recovery testing

**Responsibilities:**
- Track hazard scores
- Trigger state transitions
- Enforce degraded mode
- Prevent flapping with hysteresis

**Key Interface:**
```typescript
interface CircuitBreakerConfig {
  hazardThreshold: number;
  degradedModeConfig: DegradedConfig;
  recoveryTestConfig: RecoveryConfig;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

#### 1.3 Hysteresis & Anti-Flapping

**File:** `services/hysteresis.ts`

**Purpose:** Prevent circuit breaker flapping under noisy conditions.

**Mechanisms:**
- Consecutive interval requirements
- Safety margin recovery thresholds
- Probe traffic (1-5% in HALF_OPEN)
- Flash crowd reflex override
- Quality floor enforcement

**Key Config:**
```typescript
interface HysteresisConfig {
  consecutiveIntervalsForHalfOpen: number;
  consecutiveWindowsForClose: number;
  safetyMarginRecoveryPercent: number;
  flashThreshold: number;
  qualityFloorEnabled: boolean;
  qualityFloor: number;
  dryRun: boolean;
}
```

**Class V Features:**
- Trust decay tracking
- Quality floor refusal
- No false certainty
- Conservative escalation

#### 1.4 Certification Derivation

**File:** `services/interlock_class.ts`

**Purpose:** Single source of truth for class determination.

**Process:**
```typescript
function deriveInterlockClass(
  config: HysteresisConfig,
  circuitConfig: CircuitBreakerConfig,
  capabilities: Capabilities,
  validation: ValidationResults
): InterlockClassMetadata {
  // Analyze config to derive class
  // Class V requires: qualityFloorEnabled=true, qualityFloor>0, etc.
  // Class IV requires: flashThreshold>0, reflex enabled
  // ...
  return { class, loadRating, capabilities, ... };
}
```

**Anti-gaming:**
- Config-derived, not label-based
- Disabled features → lower class
- Tamper-evident signatures

#### 1.5 Metrics Service

**File:** `services/metrics.ts`

**Purpose:** Enterprise-grade metrics collection.

**Metrics exported:**
- `interlock_shadow_blocks_total` — Shadow mode blocks
- `interlock_reflex_trips_total` — Reflex override activations
- `interlock_quality_refusals_total` — Quality floor refusals
- `interlock_state_transitions_total` — Circuit state changes

**Export formats:**
- JSON snapshot
- Prometheus-style text (future)

**Why metrics over logs:**
- Reduce observability costs (Splunk/Datadog bills)
- Counters instead of per-event logging
- Aggregate high-volume events

#### 1.6 State Persistence

**File:** `services/state_persistence.ts`

**Purpose:** Safe boot and state recovery.

**Features:**
- Hardware fingerprinting
- Config fingerprinting
- Safe boot on corruption (OPEN state)
- Bounded state file growth

**Schema:**
```typescript
interface PersistedState {
  version: '2.0.0';
  lastState: CircuitState;
  hardwareFingerprint: HardwareFingerprint;
  configFingerprint: string;
  trustScore: number;
  lastUpdated: number;
}
```

**Safe boot rules:**
- Previous OPEN/HALF_OPEN → Resume OPEN
- Corrupt file → Fail safe to OPEN
- Hardware mismatch → OPEN state

---

### 2. Adapters

**Location:** `adapters/`

Adapters provide framework-specific safety wrappers.

#### 2.1 LangChain Adapter

**Files:** `adapters/langchain/index.ts`

**Exports:**
- `wrapChain(chainFn, config)` — Wrap chain with safety
- `wrapRetriever(retrieverFn, config)` — Wrap retriever
- `getMetrics(wrapped)` — Get safety metrics

**Safety scope:**
- Pre-execution checks (trust decay, quality floor)
- Post-execution validation (latency, output validation)
- Refusal enforcement
- Shadow mode support

**NOT in scope:**
- Chain optimization
- Result caching
- LangChain internals modification

#### 2.2 LlamaIndex Adapter

**Files:** `adapters/llamaindex/index.ts`

**Identical interface to LangChain:**
- `wrapChain(queryEngineFn, config)`
- `wrapRetriever(retrieverFn, config)`
- `getMetrics(wrapped)`

**Same safety scope as LangChain.**

#### 2.3 Pinecone Adapter

**Files:** 
- `adapters/pinecone/latency_probe.ts` — Latency monitoring
- `adapters/pinecone/failure_injector.ts` — Failure detection
- `adapters/pinecone/confidence_monitor.ts` — Confidence tracking
- `adapters/pinecone/index.ts` — Main exports

**Exports:**
- `createPineconeAdapter(qualityFloor)` — Create adapter
- `PineconeAdapter.wrapQuery(queryFn, dryRun)` — Wrap query
- `PineconeAdapter.observe()` — Get metrics
- `PineconeAdapter.getConfidence()` — Get confidence score

**Features:**
- Latency cliff detection (3x spike)
- Silent degradation detection (50% increase)
- Failure signal tracking
- Confidence-based refusal
- Degradation hooks

**NOT in scope:**
- Pinecone client implementation
- Query optimization
- Index management

#### 2.4 Elasticsearch Adapter (EXPERIMENTAL)

**Files:** `adapters/elasticsearch/index.ts`

**Status:** Experimental

**Features:**
- Latency cliff detection
- Silent degradation detection
- Confidence erosion tracking

**Limitations:**
- No recall quality monitoring
- No cluster health integration
- Basic latency-only monitoring

**Recommended:** Shadow mode only

#### Adapter Interface Contract

All adapters implement:
```typescript
interface InterlockAdapter {
  observe(): Metrics;
  injectFailure?(): void; // Optional, for testing
  getConfidence(): number;
}
```

**Design principles:**
- ≤200 LOC per file
- Zero dependencies beyond Interlock core + target SDK
- Observation + hooks only, no orchestration
- Shadow mode support
- Fail-safe defaults

---

### 3. CI Stress Chamber

**Location:** `scripts/stress-chamber.ts`

**Purpose:** Automated stress testing with visual feedback.

**Stress Profiles:**
- **Light** — Recall ≥70%, Latency ≤50ms, 10k vectors/step, 15 steps
- **Medium** — Recall ≥75%, Latency ≤40ms, 15k vectors/step, 25 steps
- **Heavy** — Recall ≥80%, Latency ≤30ms, 25k vectors/step, 30 steps

**Test Modes:**
- **Protected** — Interlock enabled (should survive)
- **Control** — Interlock disabled (should crash)
- **Both** — Compare side-by-side

**Success Criteria:**
- Control crash rate ≥80%
- Protected survival rate ≥95%
- If both survive → Test too easy

**Outputs:**
- Real-time CLI visualization
- Stress test reports (`results/stress-chamber/`)
- Crash statistics
- Comparative analysis

**Scheduler:**
- Daily at 2 AM UTC (medium profile)
- Weekly Sunday at 3 AM UTC (heavy profile)

---

### 4. Evidence Pipeline

**Location:** `scripts/`, `docs/`

The evidence pipeline generates certification artifacts.

#### 4.1 Forensic Incident Reports

**File:** `services/incident_report.ts`

**Purpose:** Generate tamper-evident incident reports.

**Contents:**
- Incident type (crash, refusal, degradation)
- Sanitized context (PII removed)
- Stack traces
- System state snapshot
- Confidence scores

**Data sanitization:**
- Vectors replaced with semantic fingerprints
- PII stripped from logs
- Privacy-preserving summaries

#### 4.2 Shadow Mode Logging

**Config:** `dryRun: true`

**Behavior:**
- Log "I WOULD have..." decisions
- Don't interfere with traffic
- Build trust before enforcement

**Shadow block types:**
- `SAFETY_MARGIN_VIOLATION` — Survived by luck
- `PROJECTED_FAILURE_WINDOW` — Would have intervened
- `QUALITY_DEGRADATION` — Quality floor breach
- `CONFIDENCE_DECAY` — Trust decay threshold

**Use case:** Trust acquisition phase

#### 4.3 Trust Acquisition Data

**Process:**
1. Deploy with `dryRun: true`
2. Observe shadow blocks
3. Calibrate thresholds
4. Enable enforcement (`dryRun: false`)

**Metrics to collect:**
- False positive rate (acceptable)
- False negative rate (must be 0 for Class V)
- Confidence calibration
- Threshold tuning

---

### 5. Badge Signing & Verification

**File:** `scripts/generate-badge.ts`

**Purpose:** Generate tamper-evident certification badges.

#### 5.1 Badge Generation

**Process:**
```typescript
// 1. Derive certification (single source of truth)
const derived = deriveInterlockClass(config, circuitConfig, capabilities, validation);

// 2. Build badge metadata
const badge = {
  interlockClass: derived.class,
  loadRating: derived.loadRating,
  repository: process.env.GITHUB_REPOSITORY,
  repo_commit: getGitCommit(),
  config_fingerprint: computeConfigFingerprint(config),
  hardware_fingerprint: getHardwareFingerprint(),
  valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  test_suite_version: '5.0.0'
};

// 3. Sign with HMAC-SHA256
const signature = generateSignature(badge, SIGNING_KEY);
badge.signature = signature;

// 4. Emit outputs
fs.writeFileSync('results/badge/interlock_shield.json', JSON.stringify(badge));
```

#### 5.2 Signature Algorithm

**Algorithm:** HMAC-SHA256

**Signed fields:**
- `interlockClass`
- `loadRating`
- `valid_until`
- `repo_commit`
- `config_fingerprint`
- `hardware_fingerprint`
- `test_suite_version`

**Signing key:** `INTERLOCK_SIGNING_KEY` environment variable

**Verification:**
```typescript
function verifyBadgeSignature(badge: Badge, key: string): boolean {
  const expectedSig = generateSignature(badge, key);
  return badge.signature === expectedSig;
}
```

**Tampering detection:**
- Modified fields invalidate signature
- Expired badges marked visually
- Config mismatch triggers re-certification

#### 5.3 Badge Formats

**JSON badge:**
```json
{
  "interlockClass": "V",
  "loadRating": { "maxVectorsPerIndex": 1000000, "maxQPS": 1000 },
  "validUntil": "2025-01-15T00:00:00Z",
  "signature": "hmac-sha256-hash",
  "configFingerprint": "sha256-hash"
}
```

**Markdown badge:**
```markdown
# Interlock Shield

**Class V (Cognitive/Pilot)** ✅

**Valid Until:** 2025-01-15

**Load Rating:** 1M vectors, 1000 QPS

**Signature:** ✅ Verified
```

**Visual badge:** SVG with embedded signature

---

## Data Flow

### 1. Request Flow (Normal Operation)

```
User Request
    │
    ▼
┌────────────────────┐
│  Application Code  │
│  (LangChain/etc)   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Adapter Wrapper   │ ◄── Pre-execution check
│  (wrapChain/etc)   │     (trust decay, quality floor)
└────────┬───────────┘
         │
         ▼ (if safe)
┌────────────────────┐
│   Actual Function  │
│  (chain.execute)   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Adapter Wrapper   │ ◄── Post-execution validation
│  (validation)      │     (latency, output check)
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  Metrics Service   │ ◄── Record metrics
│  (observeLatency)  │
└────────┬───────────┘
         │
         ▼
    Response
```

### 2. Refusal Flow

```
User Request
    │
    ▼
┌────────────────────┐
│  Pre-check         │
│  (trust decay)     │
└────────┬───────────┘
         │
         ▼
   Confidence < Quality Floor?
         │
         ├─ Yes ──► Shadow Mode?
         │              │
         │              ├─ Yes ──► Log "WOULD REFUSE" + Continue
         │              │
         │              └─ No ───► Throw Error (Refusal)
         │
         └─ No ───► Continue
```

### 3. Circuit Breaker Flow

```
System Metrics
    │
    ▼
┌────────────────────┐
│  Forecast Service  │ ◄── Predict time-to-failure
└────────┬───────────┘
         │
         ▼
   Hazard Score > Threshold?
         │
         ├─ Yes ──► CLOSED → OPEN
         │              │
         │              ▼
         │         ┌────────────────────┐
         │         │  Degraded Mode     │
         │         │  (reduced accuracy,│
         │         │   increased safety)│
         │         └────────┬───────────┘
         │                  │
         │                  ▼
         │            Wait K intervals
         │                  │
         │                  ▼
         │              OPEN → HALF_OPEN
         │                  │
         │                  ▼
         │            Probe Traffic (1-5%)
         │                  │
         │                  ▼
         │            N safe windows?
         │                  │
         │                  └─ Yes ──► HALF_OPEN → CLOSED
         │
         └─ No ───► Stay CLOSED
```

### 4. Stress Test Flow

```
Stress Chamber Start
    │
    ▼
┌────────────────────┐
│  Select Profile    │ ◄── Light / Medium / Heavy
│  (latency/recall   │
│   thresholds)      │
└────────┬───────────┘
         │
         ├────────────────────┬────────────────────┐
         ▼                    ▼                    ▼
    Protected Run        Control Run         Both (Compare)
    (Interlock ON)       (Interlock OFF)
         │                    │                    │
         ▼                    ▼                    ▼
    Simulate Load        Simulate Load        Side-by-side
    (vectors/QPS)        (vectors/QPS)
         │                    │                    │
         ▼                    ▼                    ▼
    Monitor Metrics      Monitor Metrics      Compare Results
    (latency/recall)     (latency/recall)
         │                    │                    │
         ▼                    ▼                    ▼
    Survive?             Crash?               Protected survives,
                                              Control crashes?
         │                    │                    │
         ▼                    ▼                    ▼
    Generate Report      Generate Report      Generate Comparison
```

### 5. Certification Flow

```
Configuration
    │
    ▼
┌────────────────────────────┐
│  deriveInterlockClass()    │ ◄── Analyze config
│  (single source of truth)  │     (features enabled,
└────────┬───────────────────┘      thresholds set)
         │
         ▼
┌────────────────────────────┐
│  Run Stress Tests          │ ◄── Validate capabilities
│  (stress-chamber.ts)       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Collect Evidence          │ ◄── Test results
│  (FN rate, FP rate, etc)   │     Stability data
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Generate Badge            │ ◄── Sign with HMAC-SHA256
│  (generate-badge.ts)       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Emit Outputs              │
│  • interlock_shield.json   │
│  • interlock_shield.md     │
│  • README badge update     │
└────────────────────────────┘
```

---

## Integration Points

### 1. Framework Integration

**Entry point:** Adapters (`adapters/`)

**Integration pattern:**
```typescript
// 1. Import adapter
import { wrapChain } from './adapters/langchain';

// 2. Import config
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';

// 3. Wrap existing function
const safeChain = wrapChain(myExistingChain, DEFAULT_HYSTERESIS_CONFIG);

// 4. Use wrapped function
const result = await safeChain.execute(input);
```

**No deep integration required** — wrappers only.

### 2. CI/CD Integration

**GitHub Actions workflows:**
- `.github/workflows/test-and-certify.yml` — Matrix testing
- `.github/workflows/stress-chamber.yml` — Daily stress tests
- `.github/workflows/benchmark.yml` — Weekly benchmarks
- `.github/workflows/generate-certification.yml` — Badge generation

**Integration:**
```yaml
- name: Run Stress Test
  run: npx tsx scripts/stress-chamber.ts --profile medium --both

- name: Generate Certification
  run: npx tsx scripts/generate-badge.ts
  env:
    INTERLOCK_SIGNING_KEY: ${{ secrets.SIGNING_KEY }}
```

### 3. Monitoring Integration

**Metrics export:**
```typescript
import { globalMetrics } from './services/metrics';

// Export JSON snapshot
const snapshot = globalMetrics.snapshot();
console.log(JSON.stringify(snapshot));

// Future: Prometheus endpoint
// app.get('/metrics', (req, res) => {
//   res.send(globalMetrics.toPrometheus());
// });
```

**Integration with observability platforms:**
- Export metrics to Datadog/Splunk/etc.
- Alert on `interlock_reflex_trips_total`
- Dashboard `interlock_quality_refusals_total`

### 4. Runtime Verification

**Startup check:**
```typescript
import { verifyBadgeSignature } from './services/badge_verification';

const badge = require('./results/badge/interlock_shield.json');

// Verify signature
if (!verifyBadgeSignature(badge, process.env.SIGNING_KEY)) {
  throw new Error('Badge tampered with');
}

// Check expiry
if (new Date() > new Date(badge.validUntil)) {
  console.warn('Certification expired');
}

// Check config fingerprint
const currentFingerprint = computeConfigFingerprint(currentConfig);
if (currentFingerprint !== badge.configFingerprint) {
  throw new Error('Config changed - re-certification required');
}
```

---

## Deployment Architecture

### Development Environment

```
Developer Workstation
    │
    ├─► npm run dev (Dashboard)
    ├─► npm run validate (Tests)
    ├─► npm run chaos-test (Chaos)
    └─► npx tsx scripts/stress-chamber.ts (Stress)
```

### CI/CD Environment

```
GitHub Actions
    │
    ├─► Matrix Testing (Python 3.9-3.11, Node 18-20)
    ├─► Stress Chamber (Daily medium, Weekly heavy)
    ├─► Benchmarks (Weekly comparative)
    └─► Badge Generation (On success)
         │
         └─► Commit badge to repo
```

### Production Environment

```
Production Application
    │
    ├─► Import Interlock Adapters
    ├─► Wrap Critical Functions
    ├─► Export Metrics (JSON/Prometheus)
    └─► Runtime Badge Verification
         │
         ├─► Verify signature
         ├─► Check expiry
         └─► Validate config fingerprint
```

---

## Security Considerations

### 1. Badge Signing

- Use strong signing key (`INTERLOCK_SIGNING_KEY`)
- Rotate keys periodically
- Store keys in secrets management (GitHub Secrets, Vault, etc.)
- Never commit signing keys to repo

### 2. State Persistence

- Encrypt state files if they contain sensitive data
- Use file permissions to restrict access
- Validate state file integrity on load

### 3. Adapter Security

- Adapters should fail-safe on error
- Don't expose sensitive data in logs
- Sanitize PII in incident reports
- Use data sanitization service

### 4. CI/CD Security

- Pin dependency versions
- Use dependabot for security updates
- Scan for vulnerabilities (`npm audit`)
- Verify artifact integrity

---

## Performance Considerations

### 1. Adapter Overhead

**Latency overhead:**
- Pre-check: <1ms (trust decay calculation)
- Post-check: <1ms (validation)
- Metrics recording: <0.1ms

**Memory overhead:**
- Per-adapter state: ~1KB
- Metrics registry: ~10KB
- Total: <20KB per adapter

**Recommendation:** Negligible overhead for most use cases.

### 2. State File Growth

**Bounded growth:**
- Max state file size: ~2KB
- No unbounded accumulation
- Periodic cleanup

### 3. Metrics Collection

**Strategy:**
- Counters instead of per-event logs
- Aggregate high-volume events
- Bounded histogram buckets

---

## Extensibility

### Adding New Adapters

1. Create `adapters/<framework>/` directory
2. Implement `InterlockAdapter` interface
3. Keep ≤200 LOC per file
4. Add shadow mode support
5. Document in `INTEGRATIONS.md`
6. Add stress tests

### Adding New Services

1. Create `services/<service>.ts`
2. Export clean API
3. Add TypeScript types
4. Document in code comments
5. Add to architecture diagram

### Adding New Stress Profiles

1. Edit `scripts/stress-chamber.ts`
2. Add profile to `STRESS_PROFILES` object
3. Update documentation
4. Test with `--profile <name>`

---

## References

- [INTEGRATIONS.md](./INTEGRATIONS.md) — Adapter integration guides
- [CERTIFICATION_MODEL.md](./CERTIFICATION_MODEL.md) — Certification details
- [TEST_RESULTS.md](./TEST_RESULTS.md) — Test evidence
- [SECURITY.md](../SECURITY.md) — Security policy
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Development guide
