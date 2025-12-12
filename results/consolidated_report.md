# LawForge - Consolidated Benchmark Report

**Generated:** 2025-12-12T18:47:00.000Z
**Total Runs:** 11
**LawForge Version:** 3.0.0

## 1. What Was Run

### LawForge Update Runs
| Run ID | Seed | Gens | Transfer | Drift | Notes |
|--------|------|------|----------|-------|-------|
| results/run_s42_g500_t0_d0 | 42 | 500 | OFF | OFF | Baseline |
| results/run_s42_g500_t1_d1 | 42 | 500 | ON | ON | Drift resilience |
| results/run_s42_g300_t1_d0 | 42 | 300 | ON | OFF | Transfer A/B test |

### Historical Baseline Runs
| Run ID | Seed | Gens | Transfer | Drift |
|--------|------|------|----------|-------|
| results/run_s42_g500_t0_d0 | 42 | 500 | OFF | OFF |
| results/run_s123_g500_t0_d0 | 123 | 500 | OFF | OFF |
| results/run_s999_g500_t0_d0 | 999 | 500 | OFF | OFF |

### Historical Transfer A/B Testing
#### Transfer OFF
| Run ID | Seed | Gens | Transfer | Drift |
|--------|------|------|----------|-------|
| results/run_s42_g500_t0_d0 | 42 | 500 | OFF | OFF |
| results/run_s123_g500_t0_d0 | 123 | 500 | OFF | OFF |
| results/run_s999_g500_t0_d0 | 999 | 500 | OFF | OFF |

#### Transfer ON
| Run ID | Seed | Gens | Transfer | Drift |
|--------|------|------|----------|-------|
| results/run_s42_g500_t1_d0 | 42 | 500 | ON | OFF |
| results/run_s123_g500_t1_d0 | 123 | 500 | ON | OFF |
| results/run_s999_g500_t1_d0 | 999 | 500 | ON | OFF |

### Historical Drift Resilience
| Run ID | Seed | Gens | Transfer | Drift |
|--------|------|------|----------|-------|
| results/run_s42_g500_t1_d1 | 42 | 500 | ON | ON |
| results/run_s123_g500_t1_d1 | 123 | 500 | ON | ON |

## 2. Key Outcomes

### Convergence Summary (Group 1 Baseline)
| Domain | Avg Time-to-Threshold | Avg Best Fitness | Avg Stability |
|--------|----------------------|------------------|---------------|
| faiss | 14.0 | 0.9984 | 99.7% |
| compression | 7.0 | 0.9995 | 99.1% |
| postgres | 6.7 | 0.9980 | 99.3% |
| prompts | 19.0 | 0.9975 | 99.9% |

### Law Quality Summary
- **Total Proposed:** 54
- **Total Validated:** 14
- **Total Falsified:** 18
- **Falsification Rate:** 33.3%

### Top 5 Laws (Highest Confidence Across All Runs)
1. **[postgres]** work_mem > 163MB improves hash_agg by 11%
   - Confidence: 100.0%, Status: validated
   - Trials: 10, Counterexamples: 0
2. **[prompts]** Context window utilization peaks at 65% occupancy
   - Confidence: 100.0%, Status: validated
   - Trials: 10, Counterexamples: 0
3. **[prompts]** Context window utilization peaks at 82% occupancy
   - Confidence: 100.0%, Status: validated
   - Trials: 10, Counterexamples: 0
4. **[compression]** Entropy coding switch point at 0.62 redundancy
   - Confidence: 100.0%, Status: validated
   - Trials: 8, Counterexamples: 0
5. **[prompts]** Chain-of-thought improves accuracy by 23% for reasoning tasks
   - Confidence: 100.0%, Status: validated
   - Trials: 8, Counterexamples: 0

### A/B Testing Verdict
#### Fitness Comparison (Transfer OFF vs Transfer ON)
| Domain | Avg Fitness (OFF) | Avg Fitness (ON) | Δ |
|--------|-------------------|------------------|---|
| faiss | 0.9984 | 0.9995 | +0.0011 |
| compression | 0.9995 | 0.9995 | +0.0000 |
| postgres | 0.9980 | 0.9995 | +0.0015 |
| prompts | 0.9975 | 0.9983 | +0.0008 |

**A/B Test Results:**
- Total Tests: 62
- Net Positive: 17 (27.4%)
- **Verdict:** ❌ TRANSFER IS NOT NET POSITIVE (Experimental)

> ⚠️ **Note:** Cross-domain transfer is experimental and not currently net-positive in aggregate benchmarks.

### Drift Resilience Verdict
- **Total Drift Events:** 6
- **Avg Re-convergence Time:** 13.0 generations
- **Verdict:** ✅ SYSTEM RECOVERS FROM DRIFT

## 3. Bugs Found + Fixes

- No critical bugs found during benchmark execution.
- All runs completed successfully with deterministic outputs.

## 4. Remaining Risks / TODOs

- **TODO:** Integrate real FAISS harness (current metrics are simulated).
- **TODO:** Connect real Postgres workload runner.
- **TODO:** Add CI/CD integration for automated benchmark runs.
- **COMPLETED:** Implemented law-gated transfer (law taxonomy + scope similarity checks).
- **RISK:** Simulated metrics may not reflect real-world performance.

## 5. Phase II Features (v3.1.0)

### Optimization Landscape Measurement
- Every run now exports `landscape.json` and `landscape.md`
- Identifies stable regions, brittle regions, and phase transitions
- Maps where laws hold and where they break

### Law Taxonomy + Half-Life Metrics
- Laws classified as: **Structural** (hard constraints), **Soft** (performance gradients), **Regime-bound** (valid under certain drift)
- **Half-life**: Generations a law survives under perturbation
- **Churn rate**: Law invalidation rate under drift conditions

### Resilience Certification Mode
- Run with `--mode=certification` for formal resilience audit
- Computes Resilience Score: `(1 - DropDepth) / RecoveryTime`
- Shield rating: 🟢 GREEN (≥0.08), 🟡 YELLOW (≥0.04), 🔴 RED (<0.04)
- Outputs `resilience_audit.md` with recovery curves

### Transfer: Kept Honest
- Cross-domain transfer remains labeled **Experimental** (27.4% net-positive)
- **LawForge does not attempt universal transfer. It measures where transfer fails.**

## 6. Next Recommended Step

**Run Resilience Certification:** Execute `npm run sim:run -- --seed 42 --mode certification --stability-gens 100 --drift-events 3` to generate a formal resilience audit and establish baseline shield rating.

---
*Generated by LawForge Optimization Microscope v3.1.0*