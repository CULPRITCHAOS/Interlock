# Interlock Certification Model

This document explains Interlock's Class I-V certification system in detail.

---

## Overview

Interlock uses a **five-tier certification system** (Class I through Class V) that is **deterministically derived** from your configuration and enabled capabilities. You cannot spoof your class by changing labels — it's computed from your actual setup.

**Core principle:** Certification reflects observed survival under defined stress, not theoretical invincibility.

**Analogy:** Like a bridge load rating, Interlock certifies that a system survived a specific stress test without collapsing, stalling, or lying to users. A 10-ton rated bridge doesn't guarantee it won't fail — it means it survived a 10-ton stress test.

---

## Class I-V Model

### Class I: Observable (Mirror)

**Codename:** Mirror

**Capabilities:**
- Hazard monitoring
- Boundary detection
- Metrics collection
- Event logging

**Minimum Requirements:**
- `hazardThreshold` defined
- Metrics tracking enabled
- Observability infrastructure operational

**What this class guarantees:**
- System observes and logs dangerous conditions
- Boundary violations are recorded
- Metrics are collected for analysis

**What this class does NOT guarantee:**
- No active intervention
- No failure prevention
- No circuit breaker protection

**Use case:** Observability-only deployment, shadow mode operation, trust acquisition phase.

**Example configuration:**
```typescript
{
  hazardThreshold: 0.8,
  // No circuit breaker enabled
  // No quality floor enforcement
  // Observation only
}
```

---

### Class II: Static (Fuse)

**Codename:** Fuse

**Capabilities:**
- All Class I capabilities
- Static threshold breaker
- Circuit state machine (CLOSED/OPEN/HALF_OPEN)
- Degraded mode activation

**Minimum Requirements:**
- `hazardThreshold > 0`
- Circuit breaker enabled
- Degraded mode configured
- State transitions tracked

**What this class guarantees:**
- Circuit opens when hazard exceeds threshold
- System enters degraded mode automatically
- State machine prevents flapping (basic)
- Hard threshold enforcement

**What this class does NOT guarantee:**
- No forecast-driven intervention (reactive only)
- No confidence-based decisions
- No hysteresis (may flap under noisy conditions)

**Use case:** Basic circuit breaker protection with static thresholds.

**Example configuration:**
```typescript
{
  hazardThreshold: 0.7,
  circuitBreakerEnabled: true,
  degradedModeConfig: { /* degraded settings */ }
}
```

---

### Class III: Dynamic (Governor)

**Codename:** Governor

**Capabilities:**
- All Class II capabilities
- Forecast-driven intervention
- Confidence-based decisions
- Recovery prediction
- Proactive hazard avoidance

**Minimum Requirements:**
- `minimumConfidenceThreshold > 0`
- Forecast calibration available
- Confidence tracking enabled
- Predictive intervention logic active

**What this class guarantees:**
- Intervenes BEFORE threshold breach (proactive)
- Uses confidence scores to inform decisions
- Predicts recovery time
- Degrades gracefully based on forecast

**What this class does NOT guarantee:**
- No reflex override for flash crowds
- No quality floor enforcement
- No trust decay tracking

**Use case:** Forecast-driven systems that prevent failures before they happen.

**Example configuration:**
```typescript
{
  hazardThreshold: 0.7,
  minimumConfidenceThreshold: 0.6,
  forecastEnabled: true,
  confidenceTracking: true
}
```

---

### Class IV: Reflexive (Airbag)

**Codename:** Airbag

**Capabilities:**
- All Class III capabilities
- Reflex override (flash crowd protection)
- Hysteresis (anti-flapping)
- Cooldown enforcement
- Load spike detection

**Minimum Requirements:**
- `flashThreshold > 0`
- Reflex override enabled
- Hysteresis enabled
- Consecutive interval tracking
- Cooldown configuration

**What this class guarantees:**
- Bypasses forecast for extreme load spikes (reflex)
- Prevents flapping with hysteresis
- Enforces cooldown after reflex trips
- Handles sudden load increases

**What this class does NOT guarantee:**
- No quality floor enforcement
- No false certainty prevention
- No trust decay

**Use case:** Production systems facing flash crowds or sudden load spikes.

**Example configuration:**
```typescript
{
  hazardThreshold: 0.7,
  minimumConfidenceThreshold: 0.6,
  flashThreshold: 2.0, // 2x load spike triggers reflex
  reflexCooldownMs: 60000,
  consecutiveIntervalsForHalfOpen: 3
}
```

---

### Class V: Cognitive (Pilot)

**Codename:** Pilot

**Capabilities:**
- All Class IV capabilities
- Trust decay tracking
- No false certainty
- Quality floor enforcement
- Conservative escalation
- Refusal over corruption

**Minimum Requirements:**
- `qualityFloorEnabled = true`
- `qualityFloor > 0`
- Trust decay tracking active
- No false certainty (confidence degrades appropriately)
- Refusal enforcement enabled

**What this class guarantees:**
- Refuses requests below quality floor (no degraded output)
- Trust decays over time without validation
- Never claims high confidence without evidence
- Escalates conservatively when uncertain
- Prioritizes safety over availability

**What this class does NOT guarantee:**
- Zero false positives (may refuse when not strictly necessary)
- Perfect prediction timing (stochastic variance exists)
- Protection against novel failure modes outside calibration

**Use case:** Safety-critical production systems where degraded output is unacceptable.

**Example configuration:**
```typescript
{
  hazardThreshold: 0.7,
  minimumConfidenceThreshold: 0.6,
  flashThreshold: 2.0,
  reflexCooldownMs: 60000,
  consecutiveIntervalsForHalfOpen: 3,
  qualityFloorEnabled: true,
  qualityFloor: 0.5, // Refuse if confidence < 50%
  trustDecayEnabled: true
}
```

---

## Anti-Gaming Rules

Interlock's class system is **tamper-resistant**:

### 1. Config-Derived, Not Label-Based

**You cannot claim Class V by setting a label.** Class is computed from:
- Enabled features (`qualityFloorEnabled`, `flashThreshold`, etc.)
- Configuration thresholds (`hazardThreshold`, `qualityFloor`, etc.)
- Validation evidence (test results)

**Example:**
```typescript
// This claims Class V but will be downgraded to Class II
{
  claimedClass: 'V', // Ignored
  qualityFloorEnabled: false, // Missing Class V requirement
  flashThreshold: 0, // Missing Class IV requirement
  // System will derive actual class: II
}
```

### 2. Disabled Features = Lower Class

**Disabling required features downgrades certification:**

- Disable quality floor → Cannot be Class V
- Disable reflex override → Cannot be Class IV
- Disable forecast → Cannot be Class III
- Disable circuit breaker → Cannot be Class II

**This prevents "certification shopping" where you claim high class but disable protections.**

### 3. Validation Evidence Required

**Class certification requires passing tests:**

- Class V requires zero false negatives in stability tests
- Class IV requires reflex trip validation
- Class III requires forecast accuracy demonstration
- All classes require stress test survival

**You cannot certify without evidence.**

### 4. Signature Verification

**Certification badges include HMAC-SHA256 signatures:**

```json
{
  "interlockClass": "V",
  "signature": "hmac-sha256-of-all-fields",
  "signedFields": ["interlockClass", "loadRating", "validUntil", ...]
}
```

**Tampering with badge fields invalidates the signature.**

Runtime verification:
```typescript
const valid = verifyBadgeSignature(badge, signingKey);
if (!valid) {
  throw new Error('Badge signature invalid - tampering detected');
}
```

---

## Conditional Certification

Some certifications are **conditional** — they depend on operational factors.

### Config-Conditional

**Certification is valid only if configuration matches certified config:**

```json
{
  "interlockClass": "V",
  "conditionalOn": {
    "qualityFloorEnabled": true,
    "qualityFloor": 0.5,
    "hazardThreshold": 0.7
  }
}
```

**If you change config, certification is invalidated.**

### Hardware-Conditional

**Certification assumes specific hardware fingerprint:**

```json
{
  "interlockClass": "V",
  "hardwareFingerprint": "cpu:8core-mem:32GB-disk:ssd",
  "conditionalOn": {
    "hardwareMatchTolerance": 0.2 // 20% variance allowed
  }
}
```

**Significant hardware changes require re-certification.**

### Load-Conditional

**Certification is valid up to a tested load rating:**

```json
{
  "interlockClass": "V",
  "loadRating": {
    "maxVectorsPerIndex": 1000000,
    "maxQueriesPerSecond": 1000
  }
}
```

**Exceeding load rating may invalidate guarantees.**

### Time-Conditional

**All certifications expire (default 30 days):**

```json
{
  "interlockClass": "V",
  "validUntil": "2025-01-15T00:00:00Z",
  "expiryReason": "Configuration drift / environmental changes"
}
```

**Expired certifications require re-validation.**

---

## Badge Expiry

### Why Certifications Expire

**Reason 1: Configuration Drift**
- Dependencies update
- Config files change
- Environment variables modified
- Thresholds adjusted

**Reason 2: Environmental Changes**
- Hardware degradation
- Network conditions change
- Load patterns evolve
- Dataset characteristics shift

**Reason 3: Software Updates**
- Framework version changes
- Interlock core updates
- Application code changes
- Library updates

**Principle:** Stale certifications don't reflect current reality.

### Default Expiry: 30 Days

```json
{
  "validUntil": "2025-01-15T00:00:00Z",
  "certifiedAt": "2024-12-15T00:00:00Z",
  "expiryPolicy": {
    "defaultExpiryDays": 30,
    "extendable": false
  }
}
```

**Expired badges are visually marked:**
- ❌ Badge turns red
- "EXPIRED" overlay
- Warning in README

### Change-Based Expiry

**Certification expires immediately if:**

1. **Config fingerprint changes**
   - `qualityFloor` modified
   - `hazardThreshold` changed
   - Any Class-affecting config modified

2. **Hardware fingerprint exceeds tolerance**
   - CPU count changes >20%
   - Memory changes >20%
   - Storage type changes

3. **Code changes affecting safety logic**
   - Interlock core updated
   - Circuit breaker logic modified
   - Hysteresis config changed

**Detection:**
```typescript
const currentFingerprint = computeConfigFingerprint(currentConfig);
const certifiedFingerprint = badge.configFingerprint;

if (currentFingerprint !== certifiedFingerprint) {
  console.error('Configuration changed - certification invalidated');
  badge.status = 'EXPIRED';
}
```

### Extending Expiry

**Expiry can be extended by re-running certification:**

```bash
# Re-run stress tests
npx tsx scripts/stress-chamber.ts --profile heavy --both

# Re-generate badge
npx tsx scripts/generate-badge.ts

# New badge with new expiry date
```

**Extension requires passing tests again** — no free renewals.

---

## Trust Decay and Refusal Guarantees

### Trust Decay Mechanism

**Trust (confidence) degrades over time without successful validation:**

```typescript
const timeSinceLastSuccess = Date.now() - lastSuccessfulExecution;
const decayFactor = Math.exp(-timeSinceLastSuccess / halfLifeMs);
const currentConfidence = baseConfidence * decayFactor;
```

**Example:**
- Half-life: 5 minutes (300,000ms)
- Base confidence: 0.9
- After 5 minutes: 0.9 * 0.5 = 0.45
- After 10 minutes: 0.9 * 0.25 = 0.225

**Why trust decays:**
- System state may have changed
- No recent validation evidence
- Conditions may have drifted
- Conservative assumption: assume degradation without proof of health

**Class V requirement:** Trust decay MUST be enabled.

### Refusal vs Degradation

Interlock has two strategies for handling low confidence:

#### Refusal (Class V)

**When confidence drops below quality floor, REFUSE the request:**

```typescript
if (confidence < qualityFloor) {
  if (dryRun) {
    console.log('[Shadow Mode] WOULD REFUSE: Confidence below quality floor');
  } else {
    throw new Error('Interlock refusal: Confidence below quality floor');
  }
}
```

**Principle:** **Refusal is safer than corruption.**

**When to refuse:**
- Confidence < quality floor
- Trust decay exceeded threshold
- No recent successful validations
- System in unknown state

#### Graceful Degradation (Class III/IV)

**When confidence is marginal, degrade quality but don't refuse:**

```typescript
if (confidence < 0.7 && confidence >= qualityFloor) {
  console.warn('Degraded mode: Reducing topK, using cache, etc.');
  // Reduce query complexity, use fallback index, etc.
}
```

**When to degrade:**
- Confidence between 50-70%
- System functional but not optimal
- Degraded output acceptable

### Conservative Escalation

**Class V guarantees conservative escalation:**

**Rule 1: When uncertain, escalate**
- If confidence is ambiguous, assume lower
- If safety is unclear, refuse
- If outcome is uncertain, degrade

**Rule 2: Prioritize false positives over false negatives**
- Better to refuse when not strictly necessary (FP)
- Than to allow when unsafe (FN)
- Class V tolerates high FP rate for zero FN rate

**Rule 3: Explicit over implicit**
- Log all refusals
- Document all degradations
- Never silently degrade without logging

**Example escalation ladder:**
1. Confidence 100% → Normal operation
2. Confidence 80% → Log warning
3. Confidence 60% → Degrade (reduce complexity)
4. Confidence 50% → Refuse (if quality floor enabled)
5. Confidence <50% → Hard refusal

---

## Certification Validation Process

### Step 1: Configuration Analysis

**Derive class from config:**
```typescript
const derivedClass = deriveInterlockClass(config, circuitConfig, capabilities, validation);
```

**Class determination logic:**
- Class V: All features enabled, quality floor active
- Class IV: Reflex + hysteresis enabled
- Class III: Forecast + confidence tracking
- Class II: Circuit breaker enabled
- Class I: Observability only

### Step 2: Stress Testing

**Run stress chamber with appropriate profile:**
```bash
# Class V requires heavy profile
npx tsx scripts/stress-chamber.ts --profile heavy --both --no-visualize
```

**Success criteria:**
- Control crash rate ≥80%
- Protected survival rate ≥95%
- Zero false negatives (Class V)

### Step 3: Evidence Collection

**Collect artifacts:**
- Stress test results
- Stability test output (50 cycles)
- Chaos test results
- Comparative benchmark data

**Validate evidence:**
- False negative rate (must be 0 for Class V)
- False positive rate (acceptable if FN = 0)
- Confidence drift (must be bounded)
- Memory/state file growth (must be bounded)

### Step 4: Badge Generation

**Generate signed badge:**
```bash
npx tsx scripts/generate-badge.ts
```

**Badge includes:**
- Derived class (from config, not claimed)
- Load rating (from stress tests)
- Config fingerprint
- Hardware fingerprint
- Expiry date (30 days default)
- HMAC signature

### Step 5: Runtime Verification

**On application startup:**
```typescript
const badge = loadCertificationBadge();
const valid = verifyBadgeSignature(badge, SIGNING_KEY);

if (!valid) {
  throw new Error('Badge tampered with');
}

if (new Date() > new Date(badge.validUntil)) {
  console.warn('Certification expired - re-validation required');
}

const currentFingerprint = computeConfigFingerprint(currentConfig);
if (currentFingerprint !== badge.configFingerprint) {
  throw new Error('Configuration changed - certification invalidated');
}
```

---

## Class Comparison Table

| Feature | Class I | Class II | Class III | Class IV | Class V |
|---------|---------|----------|-----------|----------|---------|
| Observability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Circuit breaker | ❌ | ✅ | ✅ | ✅ | ✅ |
| Forecast-driven | ❌ | ❌ | ✅ | ✅ | ✅ |
| Reflex override | ❌ | ❌ | ❌ | ✅ | ✅ |
| Hysteresis | ❌ | ❌ | ❌ | ✅ | ✅ |
| Quality floor | ❌ | ❌ | ❌ | ❌ | ✅ |
| Trust decay | ❌ | ❌ | ❌ | ❌ | ✅ |
| Refusal enforcement | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Use Case** | Observability | Basic protection | Proactive prevention | Flash crowd handling | Safety-critical |

---

## Certification Checklist

Use this checklist to verify your certification:

### Class V Checklist

- [ ] `qualityFloorEnabled = true`
- [ ] `qualityFloor > 0` (typically 0.5-0.7)
- [ ] `flashThreshold > 0` (typically 2.0)
- [ ] `reflexCooldownMs > 0` (typically 60000)
- [ ] `consecutiveIntervalsForHalfOpen ≥ 3`
- [ ] Trust decay enabled
- [ ] Stress tests pass (heavy profile)
- [ ] Zero false negatives in stability test
- [ ] Config fingerprint computed
- [ ] Hardware fingerprint captured
- [ ] Badge signed with HMAC-SHA256
- [ ] Expiry date set (30 days)

### Class IV Checklist

- [ ] All Class III requirements
- [ ] `flashThreshold > 0`
- [ ] `reflexCooldownMs > 0`
- [ ] Hysteresis enabled
- [ ] Reflex trip validated in tests

### Class III Checklist

- [ ] All Class II requirements
- [ ] `minimumConfidenceThreshold > 0`
- [ ] Forecast calibration available
- [ ] Confidence tracking enabled
- [ ] Proactive intervention tested

### Class II Checklist

- [ ] All Class I requirements
- [ ] `hazardThreshold > 0`
- [ ] Circuit breaker enabled
- [ ] Degraded mode configured
- [ ] State transitions tracked

### Class I Checklist

- [ ] `hazardThreshold` defined
- [ ] Metrics tracking enabled
- [ ] Observability infrastructure operational

---

## FAQ

### Q: Can I claim Class V without enabling quality floor?

**A:** No. Class is derived from config. Disabling quality floor automatically downgrades you to Class IV (at best).

### Q: Why does my certification expire after 30 days?

**A:** Stale certifications don't reflect current reality. Configuration drift, environmental changes, and software updates require re-validation.

### Q: Can I extend expiry without re-running tests?

**A:** No. Extension requires passing stress tests again.

### Q: What happens if I change config after certification?

**A:** Certification is immediately invalidated. Config fingerprint mismatch triggers expiry.

### Q: Why are false positives acceptable for Class V?

**A:** Class V prioritizes safety over availability. Better to refuse unnecessarily (FP) than miss a dangerous condition (FN).

### Q: Can I disable Interlock and keep the badge?

**A:** Badges include runtime verification. Disabling Interlock or changing config invalidates certification.

### Q: How do I upgrade from Class III to Class V?

**A:** Enable quality floor, trust decay, and reflex override in config. Re-run stress tests. Certification will auto-upgrade if tests pass.

---

## References

- [INTERLOCK_CLASSES.md](../INTERLOCK_CLASSES.md) — Class definitions and requirements
- [INTEGRATIONS.md](./INTEGRATIONS.md) — How adapters affect certification
- [TEST_RESULTS.md](./TEST_RESULTS.md) — Evidence artifacts and test results
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design and components
- [SECURITY.md](../SECURITY.md) — Security considerations and badge signing
