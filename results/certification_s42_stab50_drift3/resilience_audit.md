# LawForge Resilience Audit

> Resilience = (1 - DropDepth) / RecoveryTime

**Generated:** 2025-12-12T21:37:07.011Z
**Run ID:** results/certification_s42_stab50_drift3
**Mode:** certification

## Configuration

- **Seed:** 42
- **Stability Hold:** 50 generations
- **Drift Events:** 3

## Shield Rating: 🟡 YELLOW

**Overall Resilience Score:** 0.0502

| Domain | Resilience Score |
|--------|------------------|
| faiss | 0.0233 |
| compression | 0.0862 |
| postgres | 0.1342 |

## Phase 1: Optimization

- **Duration:** Gen 0 → 200
- **Final Fitness:**
  - faiss: 0.9757
  - compression: 0.9752
  - postgres: 0.9429
  - prompts: 0.9273

## Phase 2: Stability Hold

- **Duration:** Gen 200 → 250
- **Stability Maintained:** ✅ Yes
- **Variance Observed:**
  - faiss: 0.000210 ✅
  - compression: 0.004319 ✅
  - postgres: 0.006021 ✅
  - prompts: 0.003415 ✅

## Phase 3: Stress Testing

- **Law Invalidation Rate:** 6.7%

### Drift Injection Results

| Drift # | Domain | Pre-Fitness | Drop Depth | Recovery Time | Laws Lost |
|---------|--------|-------------|------------|---------------|-----------|
| 1 | faiss | 0.994 | 41.7% | 25 gens | -2 |
| 2 | compression | 0.714 | 39.7% | 7 gens | 1 |
| 3 | postgres | 0.822 | 32.9% | 5 gens | 2 |

### Recovery Curves

**faiss** (Drift at gen 250):
```
Gen  250: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.579
Gen  252: ████░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.620
Gen  254: ████░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.624
Gen  256: █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.590
Gen  258: ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.606
Gen  260: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.579
Gen  262: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.579
Gen  264: ███░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.616
Gen  266: ███████░░░░░░░░░░░░░░░░░░░░░░░ 0.663
Gen  268: ████████████░░░░░░░░░░░░░░░░░░ 0.720
Gen  270: ████████████████████░░░░░░░░░░ 0.812
Gen  272: ████████████████████████░░░░░░ 0.868
Gen  274: ███████████████████████████░░░ 0.902
Gen  276: ███████████████████░░░░░░░░░░░ 0.808
Gen  278: ████████████████░░░░░░░░░░░░░░ 0.772
Gen  280: ██████████████░░░░░░░░░░░░░░░░ 0.743
Gen  282: ███████████████░░░░░░░░░░░░░░░ 0.757
Gen  284: █████████████████████░░░░░░░░░ 0.824
Gen  286: ████████████████████████░░░░░░ 0.858
Gen  288: ██████████████████████████░░░░ 0.882
```

**compression** (Drift at gen 300):
```
Gen  300: ██████░░░░░░░░░░░░░░░░░░░░░░░░ 0.417
Gen  302: █████░░░░░░░░░░░░░░░░░░░░░░░░░ 0.407
Gen  304: ██████████████░░░░░░░░░░░░░░░░ 0.572
Gen  306: ██████████████████████░░░░░░░░ 0.699
Gen  308: ████████████████████████░░░░░░ 0.744
Gen  310: █████████████████████████░░░░░ 0.762
Gen  312: ████████████████████████░░░░░░ 0.750
Gen  314: ████████████████████████████░░ 0.811
Gen  316: ██████████████████████████████ 0.849
Gen  318: ███████████████████████░░░░░░░ 0.733
Gen  320: ███████████████████████░░░░░░░ 0.733
Gen  322: ████████████████████████░░░░░░ 0.750
Gen  324: ██████████████████████████░░░░ 0.776
Gen  326: ██████████████████████████░░░░ 0.783
Gen  328: ███████████████████████░░░░░░░ 0.717
Gen  330: ████████████████░░░░░░░░░░░░░░ 0.602
Gen  332: ███████░░░░░░░░░░░░░░░░░░░░░░░ 0.448
Gen  334: █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.327
Gen  336: ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.359
Gen  338: ███░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.376
```

**postgres** (Drift at gen 350):
```
Gen  350: ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0.539
Gen  352: ████████████░░░░░░░░░░░░░░░░░░ 0.655
Gen  354: ██████████████████████░░░░░░░░ 0.755
Gen  356: ██████████████████████████░░░░ 0.794
Gen  358: ███████████████████████████░░░ 0.807
Gen  360: ██████████████████████████████ 0.838
Gen  362: ██████████████████████████░░░░ 0.793
Gen  364: ████████████████████░░░░░░░░░░ 0.734
Gen  366: █████████████░░░░░░░░░░░░░░░░░ 0.673
Gen  368: ████████░░░░░░░░░░░░░░░░░░░░░░ 0.620
Gen  370: ███████████████░░░░░░░░░░░░░░░ 0.688
Gen  372: ████████████░░░░░░░░░░░░░░░░░░ 0.653
Gen  374: ██████████████░░░░░░░░░░░░░░░░ 0.680
Gen  376: ██████████████░░░░░░░░░░░░░░░░ 0.674
Gen  378: ████████████████████░░░░░░░░░░ 0.734
Gen  380: █████████████████░░░░░░░░░░░░░ 0.710
Gen  382: ██████████████░░░░░░░░░░░░░░░░ 0.679
Gen  384: ████████████████████░░░░░░░░░░ 0.738
Gen  386: ████████████░░░░░░░░░░░░░░░░░░ 0.661
Gen  388: ███████░░░░░░░░░░░░░░░░░░░░░░░ 0.608
```

## Failure Modes

- ❌ faiss: Severe fitness drop (41.7%) at gen 250
- ❌ compression: Severe fitness drop (39.7%) at gen 300
- ❌ postgres: Severe fitness drop (32.9%) at gen 350

## Recovery Patterns

- ✅ compression: Fast recovery (7 gens)
- ✅ postgres: Fast recovery (5 gens)

## Phase III: Failure Forecasting

### Unsafe Operating Regions

- **faiss**: Avoid fitness below 0.795 (observed 41.7% drop)
- **compression**: Avoid fitness below 0.571 (observed 39.7% drop)
- **postgres**: Avoid fitness below 0.658 (observed 32.9% drop)

### Recommended Safety Margins

| Parameter | Safe Range | Margin |
|-----------|------------|--------|
| faiss fitness | [0.829, 1.000] | 0.146 |
| compression fitness | [0.829, 1.000] | 0.146 |
| postgres fitness | [0.801, 1.000] | 0.141 |
| prompts fitness | [0.788, 1.000] | 0.139 |

### Forecast Limitations

- Predictions based on observed historical data only
- Novel failure modes cannot be predicted
- Cascade effects between domains not modeled
- See `forecast_validation.md` for detailed accuracy metrics

---
*Generated by LawForge Resilience Certification Engine (Phase III)*