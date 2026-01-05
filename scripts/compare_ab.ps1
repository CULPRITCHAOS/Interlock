# A/B Comparison Script
# Compares baseline vs burst protection law results

$baselinePath = "results/ab_baseline.json"
$burstPath = "results/ab_burst.json"

if (-not (Test-Path $baselinePath) -or -not (Test-Path $burstPath)) {
    Write-Host "Error: Missing A/B test results. Run run_ab_test.ps1 first." -ForegroundColor Red
    exit 1
}

$baseline = Get-Content $baselinePath | ConvertFrom-Json
$burst = Get-Content $burstPath | ConvertFrom-Json

# Calculate metrics
$latencyImprovement = if ($baseline.latency_p95_avg -gt 0) {
    (($baseline.latency_p95_avg - $burst.latency_p95_avg) / $baseline.latency_p95_avg) * 100
}
else { 0 }

$interventionDelta = $burst.interventions - $baseline.interventions
$interventionRatio = if ($baseline.interventions -gt 0) {
    $burst.interventions / $baseline.interventions
}
else { 0 }

# Determine verdict
$fpBudgetExceeded = $interventionRatio -gt 1.5
$verdict = if ($fpBudgetExceeded) {
    "⚠️ WARNING: FP rate increased by $([Math]::Round(($interventionRatio - 1) * 100, 1))%. Review burst law before promotion."
}
else {
    "✅ PASS: FP budget maintained. Safe to promote burst law."
}

# Generate report
$report = @"
# A/B Test: Baseline vs Burst Protection

**Test Date**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

---

## Executive Summary

$verdict

---

## Latency Performance

| Metric | Baseline | Burst | Change |
|--------|----------|-------|--------|
| **P95 Latency** | $([Math]::Round($baseline.latency_p95_avg, 1))ms | $([Math]::Round($burst.latency_p95_avg, 1))ms | $([Math]::Round($latencyImprovement, 1))% |

$(if ($latencyImprovement -gt 0) { "✅ **Burst law reduced latency**" } else { "⚠️ **Burst law increased latency**" })

---

## Intervention Rate (False Positive Proxy)

| Metric | Baseline | Burst | Delta |
|--------|----------|-------|-------|
| **Total Interventions** | $($baseline.interventions) | $($burst.interventions) | $interventionDelta |
| **FP Ratio** | 1.0x | $([Math]::Round($interventionRatio, 2))x | $([Math]::Round(($interventionRatio - 1) * 100, 1))% |

$(if ($fpBudgetExceeded) {
    "⚠️ **FP rate exceeded 1.5x threshold** - burst law may be too aggressive"
} else {
    "✅ **FP rate acceptable** - burst law maintains quality"
})

---

## Event Counts

| Metric | Baseline | Burst |
|--------|----------|-------|
| **Total Events** | $($baseline.total_events) | $($burst.total_events) |
| **Health Windows** | $($baseline.health_windows) | $($burst.health_windows) |

---

## Recommendation

$(if ($fpBudgetExceeded) {
    @"
**DO NOT PROMOTE** the burst protection law yet.

**Actions**:
1. Review intervention triggers in burst law
2. Consider relaxing `confidence_floor` from 0.6 to 0.55
3. Or adjust `latency_threshold_ms` from 400ms to 450ms
4. Rerun A/B test after adjustments
"@
} elseif ($latencyImprovement -lt 0) {
    @"
**MIXED RESULTS** - burst law maintained FP budget but increased latency.

**Actions**:
1. Review if burst scenarios were adequately tested
2. Consider conditional law deployment (normal vs burst modes)
3. Monitor production metrics closely if promoted
"@
} else {
    @"
**PROMOTE** the burst protection law.

**Actions**:
1. Deploy: ``Copy-Item laws/proposed/ollama_burst.json laws/active/ollama.json``
2. Monitor production for 24h
3. Compare live metrics to A/B results
4. Rollback if FP rate exceeds expectations
"@
})

---

## Raw Data

- **Baseline Results**: ``results/ab_baseline.json``
- **Burst Results**: ``results/ab_burst.json``
"@

$outputPath = "results/AB_OLLAMA_BASELINE_vs_BURST.md"
New-Item -ItemType Directory -Force -Path (Split-Path $outputPath) | Out-Null
$report | Out-File $outputPath -Encoding UTF8

Write-Host $report
Write-Host "`n📄 Report saved to: $outputPath" -ForegroundColor Green
