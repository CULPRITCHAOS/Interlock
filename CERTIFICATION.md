# Interlock Certification

> **Important**: This document certifies past test evidence, not future safety guarantees.

## What This Certification Means

**Interlock certifies that a specific configuration survived a specific stress test under specific conditions.**

This is NOT a guarantee that:
- The system will never fail
- The configuration is safe under all conditions
- Future workloads will behave identically

---

## Certification Philosophy

### We Certify

✅ **Evidence of Survival**
- "This configuration survived this stress test"
- "Under these measured conditions, no failures occurred"
- "Interlock detected and prevented X potential failures"

✅ **Test Conditions**
- Hardware fingerprint at test time
- Load profile and growth pattern
- Duration and number of stress cycles
- Version of Interlock used

✅ **Measured Outcomes**
- False positive rate (unnecessary interventions)
- False negative rate (missed failures)
- Recovery time after interventions
- Recall/precision at various load levels

### We Do NOT Certify

❌ **Future Safety**
- We cannot predict novel failure modes
- We cannot guarantee behavior under different hardware
- We cannot promise identical results under different workloads

❌ **Universal Applicability**
- Certification is specific to the tested configuration
- Different deployments require separate certification runs
- Hardware changes may invalidate cached safety envelopes

---

## Certification Tiers

### SAFETY_CERTIFIED ✅

**Criteria:**
- F1 Score ≥ 0.70
- False Negatives ≤ 1

**What This Means:**
- The system demonstrated reliable failure detection
- Missed failures were rare (≤1 during test)
- Suitable for production with active protection enabled

**What This Does NOT Mean:**
- Zero false positives (some unnecessary interventions may occur)
- Protection against novel failure modes
- Safety under radically different conditions

### OPERATIONAL_CERTIFIED ⚠️

**Criteria:**
- F1 Score ≥ 0.50
- False Positives ≤ 3

**What This Means:**
- The system demonstrated bounded false alarm rate
- Suitable for environments sensitive to unnecessary interventions
- Hysteresis prevents excessive flapping

**What This Does NOT Mean:**
- All edge-case failures will be caught
- Full safety in high-risk scenarios

### NOT_CERTIFIED ❌

**Criteria:**
- Does not meet above criteria

**What This Means:**
- Use Shadow Mode only (observation, no active protection)
- Additional calibration or tuning recommended
- Logging and monitoring remain operational

---

## Audit Record Template

When running certification tests, Interlock generates audit records with the following structure:

```json
{
  "auditId": "<unique-identifier>",
  "timestamp": "<ISO-8601-timestamp>",
  "interlockVersion": "<version>",
  
  "testConfiguration": {
    "testSuiteVersion": "<commit-hash>",
    "seed": <random-seed>,
    "duration": "<test-duration>",
    "cycles": <number-of-cycles>
  },
  
  "environmentFingerprint": {
    "totalSystemMemoryMb": <memory-in-mb>,
    "cpuCores": <number-of-cores>,
    "containerMemoryLimitMb": <container-limit-or-null>,
    "platform": "<os-platform>"
  },
  
  "loadProfile": {
    "loadClass": "<I-V>",
    "peakLoad": <peak-value>,
    "growthPattern": "<linear|exponential|burst>"
  },
  
  "summaryMetrics": {
    "reflexLatencyMs": <p95-latency>,
    "driftTolerance": <percentage>,
    "qualityFloorEnforced": <true|false>,
    "minRecallThreshold": <threshold>
  },
  
  "certificationOutcome": {
    "tier": "<SAFETY_CERTIFIED|OPERATIONAL_CERTIFIED|NOT_CERTIFIED>",
    "f1Score": <score>,
    "falsePositives": <count>,
    "falseNegatives": <count>,
    "precision": <value>,
    "recall": <value>
  },
  
  "artifacts": {
    "validationReport": "<path-to-validation-report>",
    "incidentReports": "<path-to-incident-reports>",
    "metricsSnapshot": "<path-to-metrics>"
  },
  
  "limitations": [
    "Certification valid only for tested configuration",
    "Hardware changes may require re-certification",
    "Novel failure modes outside calibration data are not covered"
  ]
}
```

---

## How to Generate Certification

### 1. Run Validation Tests

```bash
npm run validate
```

This runs the full validation suite (11 test series) and outputs:
- `results/validation/validation_report_<timestamp>.json`
- `results/validation/validation_report_<timestamp>.md`

### 2. Run Stress Test (Optional, for Load Class certification)

```bash
npx tsx scripts/stress-chamber.ts --both --no-visualize --growth-steps 25
```

### 3. Run Long-Run Stability Test (Optional)

```bash
npx tsx scripts/long-run-stability.ts --cycles 50
```

### 4. Generate Badge (Optional)

```bash
npx tsx scripts/generate-badge.ts
```

---

## Re-Certification Requirements

Re-certification is required when:

1. **Hardware Changes**: System memory differs by >20% from certified fingerprint
2. **Configuration Changes**: Circuit breaker thresholds modified
3. **Version Updates**: Interlock version changed
4. **Workload Changes**: Production load profile significantly differs from test profile

---

## Legal Disclaimer

This certification system is designed to provide evidence-based assurance, not absolute guarantees.

**Interlock does NOT:**
- Guarantee system availability
- Promise zero failures
- Warrant fitness for any particular purpose beyond tested conditions

**Interlock DOES:**
- Provide transparent test evidence
- Document tested conditions explicitly
- Identify limitations honestly

---

## Contact

For questions about certification or interpretation of results, refer to the [README](./README.md) or open an issue in the repository.

---

*Generated by Interlock v5.0.0 — The Circuit Breaker for AI Infrastructure*

> Interlock does not prevent failure. It makes failure visible early — and survivable.
