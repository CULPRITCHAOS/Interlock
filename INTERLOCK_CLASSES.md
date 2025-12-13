# Interlock Classes

> **The Interlock Class Rating System (Class I–V)**: A deterministic, configuration-based rating that cannot be spoofed by marketing claims.

## Overview

Interlock Classes represent the **capability level** of your Interlock deployment. Unlike marketing labels, these classes are derived deterministically from:

1. **Configuration values** (thresholds, timeouts, feature flags)
2. **Feature enablement** (which safety features are active)
3. **Validation evidence** (which tests passed)

**Anti-Gaming**: You cannot claim a higher class by simply changing a label. The class is computed from your actual configuration.

**Badge Expiry**: Certifications expire after a configurable period (default: 30 days) to prevent "badge rot".

---

## The Five Classes

| Class | Name | Codename | Description |
|-------|------|----------|-------------|
| **I** | Observable | Mirror | Observability + boundary reporting, no interventions |
| **II** | Static | Fuse | Static threshold breaker capability |
| **III** | Dynamic | Governor | Forecast-driven preventative intervention |
| **IV** | Reflexive | Airbag | Reflex override + hysteresis (anti-flap) capability |
| **V** | Cognitive | Pilot | Trust decay + no false certainty + quality floor/refusal |

---

## Class I: Observable (Mirror)

### Description
The most basic level of Interlock. Provides observability and boundary detection without active intervention. Useful for monitoring and learning before enabling protection.

### Required Features
- Hazard threshold defined (`hazardThreshold > 0`)
- Hazard monitoring enabled
- Metrics collection enabled

### Capabilities
- Hazard monitoring
- Boundary detection
- Metrics collection
- Event logging

### Use Case
- Development and testing environments
- Initial deployment for observation
- Systems where manual intervention is preferred

---

## Class II: Static (Fuse)

### Description
Adds static threshold-based circuit breaking. When hazard exceeds a threshold, the system trips to degraded mode. Like a fuse, it protects but requires manual reset consideration.

### Required Features
- All Class I requirements
- Circuit breaker enabled
- Degraded mode configured (`degradedNprobe` or `degradedEfSearch` set)

### Capabilities
- All Class I capabilities
- Static threshold breaker
- Circuit state machine (CLOSED/OPEN/HALF_OPEN)
- Degraded mode activation

### Use Case
- Production systems with known failure thresholds
- Systems where static protection is sufficient
- Environments with predictable load patterns

---

## Class III: Dynamic (Governor)

### Description
Adds forecast-driven intervention. The system makes decisions based on confidence in its predictions, not just threshold crossings. Like a governor, it regulates speed proactively.

### Required Features
- All Class II requirements
- `minimumConfidenceThreshold > 0`
- Forecast calibration available
- Confidence tracking enabled

### Capabilities
- All Class II capabilities
- Forecast-driven intervention
- Confidence-based decisions
- Recovery prediction

### Use Case
- Production systems with variable load patterns
- Systems requiring proactive protection
- Environments where forecast data is available

---

## Class IV: Reflexive (Airbag)

### Description
Adds reflexive safety override for flash crowd protection and hysteresis for anti-flapping. Like an airbag, it deploys instantly when danger is detected, bypassing slower decision processes.

### Required Features
- All Class III requirements
- `flashThreshold > 0` (flash crowd detection)
- `reflexCooldownMs > 0` (cooldown after reflex trip)
- Reflex override enabled in capabilities
- `consecutiveIntervalsForHalfOpen >= 1` (hysteresis for recovery)
- `consecutiveWindowsForClose >= 1` (hysteresis for closing)
- Hysteresis enabled in capabilities

### Capabilities
- All Class III capabilities
- Reflexive safety override (flash crowd protection)
- Hysteresis lock (anti-flapping)
- Probe traffic during recovery

### Use Case
- High-traffic production systems
- Systems subject to traffic spikes (flash crowds)
- Environments where flapping must be prevented

---

## Class V: Cognitive (Pilot)

### Description
The highest level. Adds trust decay tracking, no false certainty guarantee, and quality floor enforcement. Like a pilot, it knows when it doesn't know and refuses to serve garbage results.

### Required Features
- All Class IV requirements
- `qualityFloorEnabled === true`
- `qualityFloor > 0` (minimum recall before refusing)
- Trust decay tracking enabled
- No false certainty enforcement active

### Capabilities
- All Class IV capabilities
- Trust decay tracking
- No false certainty guarantee
- Quality floor enforcement (refusal over corruption)

### Use Case
- Mission-critical production systems
- Systems where serving bad results is worse than refusing
- Environments requiring maximum safety guarantees

---

## How Class is Computed

The class derivation function (`deriveInterlockClass`) checks requirements from highest to lowest:

```typescript
import { deriveInterlockClass, generateDefaultCapabilities } from './services/interlock_class';
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from './services/phaseIV.types';

// Generate capabilities from your config
const capabilities = generateDefaultCapabilities(config, circuitConfig);

// Derive the class
const result = deriveInterlockClass(config, circuitConfig, capabilities, validationEvidence);

console.log(`Class: ${result.class} (${result.metadata.name})`);
console.log(`Reasons: ${result.reasons.join(', ')}`);
console.log(`Missing for higher class: ${result.missing.join(', ')}`);
```

### Return Value

```typescript
interface ClassDerivationResult {
  class: InterlockClass;        // I, II, III, IV, or V
  reasons: string[];            // Why this class was assigned
  missing: string[];            // What prevents a higher class
  evidence: string[];           // Tests/artifacts that justify the class
  metadata: ClassMetadata;      // Name, codename, description
  isDowngraded: boolean;        // True if config-based downgrade occurred
  originalClass?: InterlockClass;
  downgradeReasons: string[];
}
```

---

## Anti-Gaming Rules

### Class V Downgrade Conditions
If any of these are true, you CANNOT claim Class V:
- `qualityFloorEnabled === false`
- `qualityFloor <= 0`
- Trust decay tracking disabled
- No false certainty not enforced

### Class IV Downgrade Conditions
If any of these are true, you CANNOT claim Class IV:
- `flashThreshold <= 0`
- Reflex override disabled
- Hysteresis disabled
- `consecutiveIntervalsForHalfOpen < 1`
- `consecutiveWindowsForClose < 1`

---

## Badge Expiry

Certifications include expiry dates to prevent "badge rot":

```json
{
  "issued_at": "2025-12-13T18:00:00.000Z",
  "valid_until": "2026-01-12T18:00:00.000Z",
  "validity_days": 30,
  "is_stale": false
}
```

### Staleness Check

```typescript
import { checkCertificationStaleness } from './services/interlock_class';

const result = checkCertificationStaleness(shield.valid_until);
if (result.isStale) {
  console.warn(result.warningMessage);
  // "Certification stale — expired 5 days ago. Rerun stress test with 'npm run validate'."
}
```

### Runtime Warning

At application startup, check for stale certifications:

```typescript
import { checkRuntimeStaleness } from './scripts/generate-badge';

const staleness = checkRuntimeStaleness('results/certification/interlock_shield.json');
if (staleness.isStale) {
  // Emit metric: certification_stale=1
  // Log warning (single, low-frequency)
  console.warn(staleness.warningMessage);
}
```

---

## Generating Badges

### Run Validation Tests

```bash
npm run validate
```

### Generate Badge

```bash
npx tsx scripts/generate-badge.ts
```

### Badge Outputs

- `results/certification/interlock_shield.json` - Machine-readable badge with expiry
- `results/certification/interlock_shield.md` - Copy/paste markdown block
- `results/certification/interlock_shield.svg` - Visual badge image

---

## Certification Philosophy

### What This Certification Means

**Interlock certifies that a specific configuration survived specific stress tests under controlled conditions.**

✅ We certify:
- Evidence of survival under tested conditions
- Measured outcomes (F1, FP, FN rates)
- Hardware fingerprint at test time

❌ We do NOT certify:
- Future safety under different conditions
- Protection against novel failure modes
- System-level failures (OOM, disk, network)

### Liability-Safe Language

> "This certification certifies that this configuration survived the following stress tests under controlled conditions. This is evidence of past test results, not a guarantee of future behavior."

---

## Quick Reference

### Check Your Class

```bash
npx tsx scripts/generate-badge.ts
```

### Upgrade Your Class

| Current | To Get | Enable |
|---------|--------|--------|
| I → II | Static protection | Circuit breaker + degraded mode |
| II → III | Forecast-driven | Confidence threshold + tracking |
| III → IV | Reflexive safety | Flash threshold + hysteresis |
| IV → V | Cognitive features | Quality floor + trust decay |

### Class Requirements Matrix

| Feature | I | II | III | IV | V |
|---------|---|----|----|----|----|
| Hazard monitoring | ✓ | ✓ | ✓ | ✓ | ✓ |
| Circuit breaker | - | ✓ | ✓ | ✓ | ✓ |
| Degraded mode | - | ✓ | ✓ | ✓ | ✓ |
| Confidence threshold | - | - | ✓ | ✓ | ✓ |
| Flash crowd protection | - | - | - | ✓ | ✓ |
| Hysteresis | - | - | - | ✓ | ✓ |
| Quality floor | - | - | - | - | ✓ |
| Trust decay tracking | - | - | - | - | ✓ |
| No false certainty | - | - | - | - | ✓ |

---

*Interlock v5.0.0 — The Circuit Breaker for AI Infrastructure*

> Interlock does not prevent failure. It makes failure visible early — and survivable.
