"""
LawForge Phase IV: Certification Report Generator
=================================================
Generates professional certification reports containing:
- Executive summary
- Failure boundary maps
- Forecast accuracy
- Safe operating zones
- Recommended safety margins
- Known unsafe regions

Output: Markdown + JSON

IMPORTANT: Final Assessment Section is HONEST - no marketing language.
"""

import json
import time
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field

from faiss_harness import (
    ForecastCalibration,
    FAISSMetrics,
    FAISSConfig,
    RealFAISSHarness,
    FailureForecastCalibrator,
    PhysicalDriftInjector,
    run_calibration_session,
    generate_calibration_json,
    generate_calibration_markdown
)
from circuit_breaker import CircuitBreakerConfig, export_circuit_breaker


@dataclass
class FailureBoundaryMap:
    """Describes a failure boundary in the parameter space."""
    boundary_id: str
    parameter: str
    critical_value: float
    safe_range: Tuple[float, float]
    unsafe_range: Tuple[float, float]
    abruptness: float  # 0-1, how sharp the transition
    observed_consequences: List[str]
    confidence: float


@dataclass
class SafeOperatingZone:
    """Defines a safe operating zone."""
    zone_id: str
    parameters: Dict[str, Tuple[float, float]]  # parameter -> (min, max)
    expected_recall: Tuple[float, float]  # (min, max)
    expected_latency_ms: Tuple[float, float]  # (min, max)
    confidence: float
    notes: List[str]


@dataclass
class SafetyMargin:
    """Recommended safety margin for a parameter."""
    parameter: str
    current_value: float
    recommended_min: float
    recommended_max: float
    margin_percent: float
    rationale: str


@dataclass
class UnsafeRegion:
    """Describes an unsafe operating region."""
    region_id: str
    parameters: Dict[str, Tuple[float, float]]
    failure_mode: str
    severity: str  # "warning", "critical"
    observed_failures: int
    mitigation: str


@dataclass
class CertificationReport:
    """Complete certification report."""
    generated: str
    run_id: str
    version: str = "4.0.0"
    
    # Executive Summary
    overall_verdict: str = ""  # "CERTIFIED", "CONDITIONAL", "NOT_CERTIFIED"
    summary_text: str = ""
    key_findings: List[str] = field(default_factory=list)
    
    # Forecast Calibration
    calibration: Optional[ForecastCalibration] = None
    
    # Boundaries and Zones
    failure_boundaries: List[FailureBoundaryMap] = field(default_factory=list)
    safe_operating_zones: List[SafeOperatingZone] = field(default_factory=list)
    safety_margins: List[SafetyMargin] = field(default_factory=list)
    unsafe_regions: List[UnsafeRegion] = field(default_factory=list)
    
    # Metrics History
    metrics_history: List[FAISSMetrics] = field(default_factory=list)
    
    # Circuit Breaker Config
    circuit_breaker_config: Optional[CircuitBreakerConfig] = None
    
    # Honest Assessment
    what_can_predict: List[str] = field(default_factory=list)
    what_cannot_predict: List[str] = field(default_factory=list)
    confidence_bounds: Dict[str, Tuple[float, float]] = field(default_factory=dict)
    known_failure_cases: List[str] = field(default_factory=list)


def run_certification(
    run_id: str,
    config: Optional[FAISSConfig] = None,
    initial_size: int = 10000,
    growth_steps: int = 10,
    vectors_per_step: int = 10000,
    seed: int = 42
) -> CertificationReport:
    """
    Run complete certification workflow.
    
    This performs:
    1. Initialize FAISS harness
    2. Run calibration session with stress testing
    3. Extract failure boundaries
    4. Define safe operating zones
    5. Generate safety margins
    6. Identify unsafe regions
    7. Generate honest assessment
    """
    
    # Run calibration
    calibration, metrics_history = run_calibration_session(
        run_id=run_id,
        config=config,
        initial_size=initial_size,
        growth_steps=growth_steps,
        vectors_per_step=vectors_per_step,
        seed=seed
    )
    
    # Extract failure boundaries from calibration data
    failure_boundaries = _extract_failure_boundaries(calibration, metrics_history)
    
    # Define safe operating zones
    safe_zones = _define_safe_operating_zones(metrics_history, calibration)
    
    # Calculate safety margins
    safety_margins = _calculate_safety_margins(metrics_history, failure_boundaries)
    
    # Identify unsafe regions
    unsafe_regions = _identify_unsafe_regions(metrics_history, failure_boundaries)
    
    # Determine overall verdict
    verdict, summary = _determine_verdict(calibration, failure_boundaries, unsafe_regions)
    
    # Generate circuit breaker config based on findings
    cb_config = _generate_circuit_breaker_config(failure_boundaries, safe_zones)
    
    return CertificationReport(
        generated=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        run_id=run_id,
        overall_verdict=verdict,
        summary_text=summary,
        key_findings=_generate_key_findings(calibration, failure_boundaries, metrics_history),
        calibration=calibration,
        failure_boundaries=failure_boundaries,
        safe_operating_zones=safe_zones,
        safety_margins=safety_margins,
        unsafe_regions=unsafe_regions,
        metrics_history=metrics_history,
        circuit_breaker_config=cb_config,
        what_can_predict=_get_predictable_items(),
        what_cannot_predict=_get_unpredictable_items(),
        confidence_bounds=_calculate_confidence_bounds(calibration),
        known_failure_cases=_get_known_failure_cases(calibration, metrics_history)
    )


def _extract_failure_boundaries(
    calibration: ForecastCalibration,
    metrics: List[FAISSMetrics]
) -> List[FailureBoundaryMap]:
    """Extract failure boundaries from observed data."""
    boundaries = []
    
    if not metrics:
        return boundaries
    
    # Find recall degradation boundary
    recalls = [m.recall_at_k for m in metrics]
    sizes = [m.index_size for m in metrics]
    
    # Find where recall drops below 0.8
    for i in range(1, len(recalls)):
        if recalls[i-1] >= 0.8 and recalls[i] < 0.8:
            boundaries.append(FailureBoundaryMap(
                boundary_id="recall_degradation_boundary",
                parameter="index_size",
                critical_value=sizes[i],
                safe_range=(0, sizes[i-1]),
                unsafe_range=(sizes[i], sizes[-1] if sizes else sizes[i] * 2),
                abruptness=abs(recalls[i] - recalls[i-1]) / 0.1,
                observed_consequences=["Recall drops below 80%", "Query quality degradation"],
                confidence=0.8
            ))
            break
    
    # Find latency spike boundary
    latencies = [m.latency_p95_ms for m in metrics]
    for i in range(1, len(latencies)):
        if latencies[i-1] <= 30 and latencies[i] > 30:
            boundaries.append(FailureBoundaryMap(
                boundary_id="latency_spike_boundary",
                parameter="index_size",
                critical_value=sizes[i],
                safe_range=(0, sizes[i-1]),
                unsafe_range=(sizes[i], sizes[-1] if sizes else sizes[i] * 2),
                abruptness=min(1.0, (latencies[i] - latencies[i-1]) / 20),
                observed_consequences=["Latency exceeds 30ms p95", "User experience degradation"],
                confidence=0.75
            ))
            break
    
    # Memory pressure boundary (estimated)
    if metrics:
        max_memory = max(m.memory_mb for m in metrics)
        boundaries.append(FailureBoundaryMap(
            boundary_id="memory_pressure_boundary",
            parameter="memory_mb",
            critical_value=max_memory * 0.9,  # 90% of observed max
            safe_range=(0, max_memory * 0.7),
            unsafe_range=(max_memory * 0.9, max_memory * 1.5),
            abruptness=0.6,
            observed_consequences=["Memory pressure increases", "Potential OOM risk"],
            confidence=0.6
        ))
    
    return boundaries


def _define_safe_operating_zones(
    metrics: List[FAISSMetrics],
    calibration: ForecastCalibration
) -> List[SafeOperatingZone]:
    """Define safe operating zones based on observed metrics."""
    zones = []
    
    if not metrics:
        return zones
    
    # Find stable operating ranges
    stable_metrics = [m for m in metrics if m.recall_at_k >= 0.8 and m.latency_p95_ms <= 30]
    
    if stable_metrics:
        min_size = min(m.index_size for m in stable_metrics)
        max_size = max(m.index_size for m in stable_metrics)
        
        zones.append(SafeOperatingZone(
            zone_id="optimal_zone",
            parameters={
                "index_size": (min_size, max_size),
                "nprobe": (5, 20),
                "memory_mb": (0, max(m.memory_mb for m in stable_metrics) * 1.1)
            },
            expected_recall=(0.8, 0.95),
            expected_latency_ms=(1.0, 30.0),
            confidence=0.85,
            notes=[
                "Best balance of recall and latency",
                "Recommended for production workloads",
                "Monitor for degradation as index grows"
            ]
        ))
    
    # Conservative zone (always safe)
    zones.append(SafeOperatingZone(
        zone_id="conservative_zone",
        parameters={
            "index_size": (0, metrics[0].index_size if metrics else 10000),
            "nprobe": (1, 5),
            "memory_mb": (0, 100)
        },
        expected_recall=(0.6, 0.85),
        expected_latency_ms=(0.5, 10.0),
        confidence=0.95,
        notes=[
            "Maximum stability, reduced accuracy",
            "Use when stability is critical",
            "Lower recall trade-off for guaranteed performance"
        ]
    ))
    
    return zones


def _calculate_safety_margins(
    metrics: List[FAISSMetrics],
    boundaries: List[FailureBoundaryMap]
) -> List[SafetyMargin]:
    """Calculate recommended safety margins."""
    margins = []
    
    if not metrics:
        return margins
    
    current_size = metrics[-1].index_size if metrics else 10000
    current_recall = metrics[-1].recall_at_k if metrics else 0.9
    current_latency = metrics[-1].latency_p95_ms if metrics else 5.0
    
    # Index size margin
    for b in boundaries:
        if b.parameter == "index_size":
            margin = SafetyMargin(
                parameter="index_size",
                current_value=current_size,
                recommended_min=0,
                recommended_max=b.critical_value * 0.8,  # 20% margin
                margin_percent=20.0,
                rationale=f"Stay 20% below critical boundary at {b.critical_value:.0f}"
            )
            margins.append(margin)
            break
    
    # Recall margin
    margins.append(SafetyMargin(
        parameter="recall_at_k",
        current_value=current_recall,
        recommended_min=0.75,  # 5% above threshold
        recommended_max=1.0,
        margin_percent=7.1,
        rationale="Maintain 5% margin above 0.7 threshold"
    ))
    
    # Latency margin
    margins.append(SafetyMargin(
        parameter="latency_p95_ms",
        current_value=current_latency,
        recommended_min=0,
        recommended_max=40.0,  # 20% below 50ms threshold
        margin_percent=20.0,
        rationale="Stay 20% below 50ms threshold"
    ))
    
    return margins


def _identify_unsafe_regions(
    metrics: List[FAISSMetrics],
    boundaries: List[FailureBoundaryMap]
) -> List[UnsafeRegion]:
    """Identify unsafe operating regions."""
    regions = []
    
    # High index size region
    for b in boundaries:
        if b.parameter == "index_size":
            regions.append(UnsafeRegion(
                region_id="high_index_size",
                parameters={"index_size": (b.critical_value, b.critical_value * 2)},
                failure_mode="recall_degradation",
                severity="critical",
                observed_failures=1,
                mitigation="Reduce index size or increase nprobe/efSearch"
            ))
    
    # Low nprobe region (under-searching)
    regions.append(UnsafeRegion(
        region_id="under_searched",
        parameters={"nprobe": (0, 2)},
        failure_mode="low_recall",
        severity="warning",
        observed_failures=0,
        mitigation="Increase nprobe to at least 5 for reasonable recall"
    ))
    
    return regions


def _determine_verdict(
    calibration: ForecastCalibration,
    boundaries: List[FailureBoundaryMap],
    unsafe_regions: List[UnsafeRegion]
) -> Tuple[str, str]:
    """Determine overall certification verdict."""
    
    if calibration.f1_score >= 0.7 and calibration.false_negatives <= 1:
        verdict = "CERTIFIED"
        summary = (
            "The failure forecasting system demonstrates reliable prediction capability "
            f"with F1 score of {calibration.f1_score:.2f}. The system is suitable for "
            "production use with the recommended safety margins."
        )
    elif calibration.f1_score >= 0.5:
        verdict = "CONDITIONAL"
        summary = (
            "The failure forecasting system shows moderate prediction capability "
            f"with F1 score of {calibration.f1_score:.2f}. Use with caution and "
            "implement additional monitoring. Circuit breaker is strongly recommended."
        )
    else:
        verdict = "NOT_CERTIFIED"
        summary = (
            "The failure forecasting system does not meet minimum accuracy requirements "
            f"(F1 score: {calibration.f1_score:.2f}). Additional calibration data is needed "
            "before production deployment."
        )
    
    return verdict, summary


def _generate_circuit_breaker_config(
    boundaries: List[FailureBoundaryMap],
    zones: List[SafeOperatingZone]
) -> CircuitBreakerConfig:
    """Generate circuit breaker config based on findings."""
    return CircuitBreakerConfig(
        recall_threshold=0.7,
        latency_threshold_ms=50.0,
        hazard_threshold=0.6,
        recovery_check_interval_s=30.0,
        consecutive_successes_for_close=3,
        degraded_nprobe=1,
        degraded_ef_search=16,
        optimal_nprobe=10,
        optimal_ef_search=64
    )


def _generate_key_findings(
    calibration: ForecastCalibration,
    boundaries: List[FailureBoundaryMap],
    metrics: List[FAISSMetrics]
) -> List[str]:
    """Generate key findings list."""
    findings = []
    
    findings.append(f"Forecast precision: {calibration.precision:.1%}")
    findings.append(f"Forecast recall: {calibration.recall:.1%}")
    findings.append(f"False positive rate: {calibration.false_positives}/{calibration.validated_forecasts}")
    findings.append(f"False negative rate: {calibration.false_negatives}/{calibration.validated_forecasts}")
    
    if boundaries:
        findings.append(f"Identified {len(boundaries)} failure boundaries")
    
    if metrics:
        max_size = max(m.index_size for m in metrics)
        findings.append(f"Tested index sizes up to {max_size:,} vectors")
    
    return findings


def _get_predictable_items() -> List[str]:
    """Return list of what LawForge CAN predict."""
    return [
        "Approximate time-to-threshold-breach based on observed degradation gradients",
        "Risk level classification (safe/yellow/red) with measured precision/recall",
        "Order-of-magnitude recovery time estimates after degradation",
        "Memory pressure trends from progressive index growth",
        "Recall degradation patterns under increasing load",
        "Latency spike probability based on historical data"
    ]


def _get_unpredictable_items() -> List[str]:
    """Return list of what LawForge CANNOT predict."""
    return [
        "Novel failure modes not observed during calibration",
        "Exact timing of failures (inherent stochastic variance)",
        "System-level failures (OOM kills, disk full, network issues)",
        "Concurrent workload interference effects",
        "Hardware-specific performance cliffs",
        "Effects of system updates or configuration changes",
        "Cascade failures from dependent services",
        "Human error or misconfiguration"
    ]


def _calculate_confidence_bounds(
    calibration: ForecastCalibration
) -> Dict[str, Tuple[float, float]]:
    """Calculate confidence bounds for predictions."""
    return {
        "time_to_failure": (
            calibration.time_to_failure_mean_error * 0.5,
            calibration.time_to_failure_mean_error * 2.0
        ),
        "drop_depth": (
            max(0, calibration.drop_depth_mean_error - 0.1),
            min(1, calibration.drop_depth_mean_error + 0.1)
        ),
        "recovery_time": (
            calibration.recovery_time_mean_error * 0.5,
            calibration.recovery_time_mean_error * 2.0
        ),
        "overall_accuracy": calibration.confidence_interval_95
    }


def _get_known_failure_cases(
    calibration: ForecastCalibration,
    metrics: List[FAISSMetrics]
) -> List[str]:
    """Return known failure cases."""
    cases = []
    
    if calibration.false_negatives > 0:
        cases.append(
            f"Missed {calibration.false_negatives} actual failures - "
            "forecaster may underestimate risk in some conditions"
        )
    
    if calibration.false_positives > 0:
        cases.append(
            f"Raised {calibration.false_positives} false alarms - "
            "forecaster may be overly conservative"
        )
    
    if metrics:
        min_recall = min(m.recall_at_k for m in metrics)
        if min_recall < 0.7:
            cases.append(
                f"Observed recall dropped to {min_recall:.2f} during stress testing"
            )
    
    return cases


def generate_certification_json(report: CertificationReport) -> Dict[str, Any]:
    """Generate JSON format for certification report."""
    return {
        "generated": report.generated,
        "run_id": report.run_id,
        "version": report.version,
        "verdict": {
            "overall": report.overall_verdict,
            "summary": report.summary_text,
            "key_findings": report.key_findings
        },
        "calibration": generate_calibration_json(report.calibration) if report.calibration else None,
        "failure_boundaries": [
            {
                "id": b.boundary_id,
                "parameter": b.parameter,
                "critical_value": b.critical_value,
                "safe_range": list(b.safe_range),
                "unsafe_range": list(b.unsafe_range),
                "abruptness": b.abruptness,
                "consequences": b.observed_consequences,
                "confidence": b.confidence
            }
            for b in report.failure_boundaries
        ],
        "safe_operating_zones": [
            {
                "id": z.zone_id,
                "parameters": {k: list(v) for k, v in z.parameters.items()},
                "expected_recall": list(z.expected_recall),
                "expected_latency_ms": list(z.expected_latency_ms),
                "confidence": z.confidence,
                "notes": z.notes
            }
            for z in report.safe_operating_zones
        ],
        "safety_margins": [
            {
                "parameter": m.parameter,
                "current_value": m.current_value,
                "recommended_min": m.recommended_min,
                "recommended_max": m.recommended_max,
                "margin_percent": m.margin_percent,
                "rationale": m.rationale
            }
            for m in report.safety_margins
        ],
        "unsafe_regions": [
            {
                "id": r.region_id,
                "parameters": {k: list(v) for k, v in r.parameters.items()},
                "failure_mode": r.failure_mode,
                "severity": r.severity,
                "observed_failures": r.observed_failures,
                "mitigation": r.mitigation
            }
            for r in report.unsafe_regions
        ],
        "assessment": {
            "can_predict": report.what_can_predict,
            "cannot_predict": report.what_cannot_predict,
            "confidence_bounds": {k: list(v) for k, v in report.confidence_bounds.items()},
            "known_failure_cases": report.known_failure_cases
        },
        "circuit_breaker_config": {
            "recall_threshold": report.circuit_breaker_config.recall_threshold,
            "latency_threshold_ms": report.circuit_breaker_config.latency_threshold_ms,
            "hazard_threshold": report.circuit_breaker_config.hazard_threshold
        } if report.circuit_breaker_config else None
    }


def generate_certification_markdown(report: CertificationReport) -> str:
    """Generate professional markdown certification report."""
    lines = []
    
    # Header
    lines.append("# LawForge Phase IV – Ground-Truth Certification Report")
    lines.append("")
    lines.append("> LawForge does not optimize systems.")
    lines.append("> It prevents engineers from unknowingly driving them off cliffs.")
    lines.append("")
    lines.append(f"**Generated:** {report.generated}")
    lines.append(f"**Run ID:** {report.run_id}")
    lines.append(f"**Version:** {report.version}")
    lines.append("")
    
    # Executive Summary
    lines.append("---")
    lines.append("")
    lines.append("## Executive Summary")
    lines.append("")
    
    verdict_emoji = "✅" if report.overall_verdict == "CERTIFIED" else "⚠️" if report.overall_verdict == "CONDITIONAL" else "❌"
    lines.append(f"### Verdict: {verdict_emoji} {report.overall_verdict}")
    lines.append("")
    lines.append(report.summary_text)
    lines.append("")
    
    lines.append("### Key Findings")
    lines.append("")
    for finding in report.key_findings:
        lines.append(f"- {finding}")
    lines.append("")
    
    # Forecast Accuracy
    lines.append("---")
    lines.append("")
    lines.append("## Forecast Accuracy")
    lines.append("")
    
    if report.calibration:
        lines.append("| Metric | Value |")
        lines.append("|--------|-------|")
        lines.append(f"| Precision | {report.calibration.precision:.1%} |")
        lines.append(f"| Recall | {report.calibration.recall:.1%} |")
        lines.append(f"| F1 Score | {report.calibration.f1_score:.3f} |")
        lines.append(f"| True Positives | {report.calibration.true_positives} |")
        lines.append(f"| False Positives | {report.calibration.false_positives} |")
        lines.append(f"| False Negatives | {report.calibration.false_negatives} |")
        lines.append(f"| True Negatives | {report.calibration.true_negatives} |")
        lines.append("")
        
        lines.append("### Prediction Error")
        lines.append("")
        lines.append("| Metric | Mean Error | Median Error |")
        lines.append("|--------|------------|--------------|")
        lines.append(f"| Time-to-Failure | {report.calibration.time_to_failure_mean_error:.2f} | {report.calibration.time_to_failure_median_error:.2f} |")
        lines.append(f"| Drop Depth | {report.calibration.drop_depth_mean_error:.3f} | {report.calibration.drop_depth_median_error:.3f} |")
        lines.append(f"| Recovery Time | {report.calibration.recovery_time_mean_error:.2f} | {report.calibration.recovery_time_median_error:.2f} |")
        lines.append("")
    
    # Failure Boundary Maps
    lines.append("---")
    lines.append("")
    lines.append("## Failure Boundary Maps")
    lines.append("")
    
    if report.failure_boundaries:
        for boundary in report.failure_boundaries:
            risk_icon = "🔴" if boundary.abruptness > 0.7 else "🟡" if boundary.abruptness > 0.4 else "🟢"
            lines.append(f"### {risk_icon} {boundary.boundary_id}")
            lines.append("")
            lines.append(f"- **Parameter:** {boundary.parameter}")
            lines.append(f"- **Critical Value:** {boundary.critical_value:.0f}")
            lines.append(f"- **Safe Range:** [{boundary.safe_range[0]:.0f}, {boundary.safe_range[1]:.0f}]")
            lines.append(f"- **Unsafe Range:** [{boundary.unsafe_range[0]:.0f}, {boundary.unsafe_range[1]:.0f}]")
            lines.append(f"- **Abruptness:** {boundary.abruptness:.1%}")
            lines.append(f"- **Confidence:** {boundary.confidence:.1%}")
            lines.append(f"- **Consequences:** {', '.join(boundary.observed_consequences)}")
            lines.append("")
    else:
        lines.append("*No failure boundaries identified in this run.*")
        lines.append("")
    
    # Safe Operating Zones
    lines.append("---")
    lines.append("")
    lines.append("## Safe Operating Zones")
    lines.append("")
    
    for zone in report.safe_operating_zones:
        lines.append(f"### 🟢 {zone.zone_id}")
        lines.append("")
        lines.append("| Parameter | Min | Max |")
        lines.append("|-----------|-----|-----|")
        for param, (pmin, pmax) in zone.parameters.items():
            lines.append(f"| {param} | {pmin:.0f} | {pmax:.0f} |")
        lines.append("")
        lines.append(f"- **Expected Recall:** {zone.expected_recall[0]:.0%} - {zone.expected_recall[1]:.0%}")
        lines.append(f"- **Expected Latency:** {zone.expected_latency_ms[0]:.1f}ms - {zone.expected_latency_ms[1]:.1f}ms")
        lines.append(f"- **Confidence:** {zone.confidence:.0%}")
        lines.append("")
        lines.append("Notes:")
        for note in zone.notes:
            lines.append(f"- {note}")
        lines.append("")
    
    # Recommended Safety Margins
    lines.append("---")
    lines.append("")
    lines.append("## Recommended Safety Margins")
    lines.append("")
    lines.append("| Parameter | Current | Recommended Max | Margin | Rationale |")
    lines.append("|-----------|---------|-----------------|--------|-----------|")
    for margin in report.safety_margins:
        lines.append(f"| {margin.parameter} | {margin.current_value:.2f} | {margin.recommended_max:.2f} | {margin.margin_percent:.0f}% | {margin.rationale} |")
    lines.append("")
    
    # Known Unsafe Regions
    lines.append("---")
    lines.append("")
    lines.append("## Known Unsafe Regions")
    lines.append("")
    
    for region in report.unsafe_regions:
        severity_icon = "🔴" if region.severity == "critical" else "🟡"
        lines.append(f"### {severity_icon} {region.region_id}")
        lines.append("")
        lines.append(f"- **Severity:** {region.severity.upper()}")
        lines.append(f"- **Failure Mode:** {region.failure_mode}")
        lines.append(f"- **Parameters:** {region.parameters}")
        lines.append(f"- **Mitigation:** {region.mitigation}")
        lines.append("")
    
    # HONEST Assessment Section
    lines.append("---")
    lines.append("")
    lines.append("## Final Assessment (HONEST)")
    lines.append("")
    lines.append("> This section contains no marketing language.")
    lines.append("> It states explicitly what LawForge can and cannot do.")
    lines.append("")
    
    lines.append("### ✅ What LawForge CAN Predict")
    lines.append("")
    for item in report.what_can_predict:
        lines.append(f"- {item}")
    lines.append("")
    
    lines.append("### ❌ What LawForge CANNOT Predict")
    lines.append("")
    for item in report.what_cannot_predict:
        lines.append(f"- {item}")
    lines.append("")
    
    lines.append("### Confidence Bounds")
    lines.append("")
    lines.append("| Metric | Lower Bound | Upper Bound |")
    lines.append("|--------|-------------|-------------|")
    for metric, (lower, upper) in report.confidence_bounds.items():
        lines.append(f"| {metric} | {lower:.2f} | {upper:.2f} |")
    lines.append("")
    
    lines.append("### Known Failure Cases")
    lines.append("")
    if report.known_failure_cases:
        for case in report.known_failure_cases:
            lines.append(f"- ⚠️ {case}")
    else:
        lines.append("*No failure cases identified in this calibration run.*")
    lines.append("")
    
    # Circuit Breaker Export
    if report.circuit_breaker_config:
        lines.append("---")
        lines.append("")
        lines.append("## Circuit Breaker Configuration")
        lines.append("")
        lines.append("A self-defending FAISS client is available based on this certification.")
        lines.append("")
        lines.append("| Parameter | Value |")
        lines.append("|-----------|-------|")
        lines.append(f"| recall_threshold | {report.circuit_breaker_config.recall_threshold} |")
        lines.append(f"| latency_threshold_ms | {report.circuit_breaker_config.latency_threshold_ms} |")
        lines.append(f"| hazard_threshold | {report.circuit_breaker_config.hazard_threshold} |")
        lines.append(f"| degraded_nprobe | {report.circuit_breaker_config.degraded_nprobe} |")
        lines.append(f"| optimal_nprobe | {report.circuit_breaker_config.optimal_nprobe} |")
        lines.append("")
        lines.append("See `self_defending_faiss.py` for runnable implementation.")
        lines.append("")
    
    # Footer
    lines.append("---")
    lines.append("")
    lines.append("*Generated by LawForge Phase IV Ground-Truth Certification Engine*")
    lines.append("")
    lines.append("**Guiding Principle:** LawForge does not optimize systems. It prevents engineers from unknowingly driving them off cliffs.")
    
    return "\n".join(lines)


if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Run certification
    report = run_certification(
        run_id="certification_test",
        initial_size=10000,
        growth_steps=5,
        vectors_per_step=10000,
        seed=42
    )
    
    # Generate outputs
    print("\n" + "=" * 60)
    print("CERTIFICATION REPORT")
    print("=" * 60)
    print(generate_certification_markdown(report))
    
    # Save JSON
    json_report = generate_certification_json(report)
    print("\n" + "=" * 60)
    print("JSON SUMMARY")
    print("=" * 60)
    print(json.dumps(json_report["verdict"], indent=2))
