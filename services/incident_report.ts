/**
 * Interlock Phase V: Forensic Incident Report System
 * ===================================================
 * 
 * When Interlock intervenes, it generates a post-mortem-ready forensic artifact,
 * not just logs. These reports are usable by an SRE without reading source code.
 * 
 * Report Contents:
 * - Timestamp of intervention
 * - Trigger condition(s)
 * - Forecasted failure type
 * - Predicted time-to-failure (with uncertainty bounds)
 * - Observed system metrics at trigger
 * - Mitigation action taken
 * - Estimated avoided failure (counterfactual)
 * - Time to stabilization
 * - Final system state
 * - Forecast confidence at trigger
 * 
 * Guiding Principle:
 * Interlock does not prevent failure. It makes failure visible early — and survivable.
 */

import { CircuitState, Intervention, FAISSMetrics } from './phaseIV.types.ts';

// Version constant - update when package.json version changes
export const INTERLOCK_VERSION = '5.0.0';

// ============= Incident Report Types =============

export interface TriggerCondition {
  metric: string;
  threshold: number;
  observedValue: number;
  direction: 'above' | 'below';
  breachSeverity: 'warning' | 'critical';
}

export interface UncertaintyBounds {
  lower: number;
  upper: number;
  confidence: number;  // Confidence level (e.g., 0.95 for 95%)
}

export interface PredictedFailure {
  type: string;
  description: string;
  timeToFailure: number;                   // Intervals until predicted failure
  timeToFailureUncertainty: UncertaintyBounds;
  expectedDropDepth: number;               // Expected performance drop (0-1)
  expectedDropDepthUncertainty: UncertaintyBounds;
  affectedMetrics: string[];
  rootCause: string;
}

export interface ObservedMetrics {
  timestamp: string;
  recall: number;
  latencyP95Ms: number;
  memoryMb: number;
  indexSize: number;
  hazardScore: number;
  queryCount: number;
}

export interface MitigationAction {
  type: 'degraded_mode' | 'probe_traffic' | 'full_recovery' | 'emergency_stop';
  description: string;
  parameters: Record<string, number | string>;
  expectedImpact: string;
}

export interface CounterfactualEstimate {
  withoutIntervention: {
    estimatedTimeToFailure: number;
    estimatedImpact: string;
    estimatedDowntimeSeconds: number;
    confidenceInEstimate: number;
  };
  withIntervention: {
    actualOutcome: string;
    downtimeAvoided: number;
    dataLossAvoided: boolean;
    serviceImpactReduced: string;
  };
  benefitSummary: string;
  // ============= ECONOMIC PROOF (Phase B4) =============
  // Converts logs → business justification, safety → ROI
  economicImpact?: {
    controlCrashPoint: number;         // Step at which unprotected system crashed
    maxLoadProtected: number;          // Max load the protected system handled
    queriesSaved: number;              // Additional queries processed
    costPerQuery?: number;             // Cost per query (configured by user)
    valueRetained?: number;            // queriesSaved * costPerQuery
    currency?: string;                 // Currency for value (e.g., "USD")
  };
}

export interface StabilizationMetrics {
  timeToStabilizationMs: number;
  peakHazardDuringRecovery: number;
  finalHazardScore: number;
  stepsInDegradedMode: number;
  probeAttempts: number;
  probeSuccesses: number;
}

export interface FinalSystemState {
  circuitState: CircuitState;
  recall: number;
  latencyP95Ms: number;
  memoryMb: number;
  hazardScore: number;
  isStable: boolean;
  confidence: number;
}

export interface HistoricalComparison {
  similarIncidents: number;
  averageRecoveryTime: number;
  thisIncidentVsAverage: string;
  improvementOpportunities: string[];
}

export interface ConfigurationRecommendation {
  parameter: string;
  currentValue: number | string;
  recommendedValue: number | string;
  rationale: string;
  expectedImprovement: string;
}

export interface UnsafeOperatingRegion {
  parameter: string;
  unsafeRange: [number, number];
  safeRange: [number, number];
  encounterTimestamp: string;
  severity: 'warning' | 'critical';
  recommendation: string;
}

// ============= Main Incident Report Interface =============

export interface IncidentReport {
  // Identification
  id: string;
  version: string;
  generated: string;

  // Executive Summary
  executiveSummary: {
    outcome: 'failure_prevented' | 'impact_reduced' | 'monitoring_only';
    headline: string;
    keyTakeaways: string[];
  };

  // Required Fields (from problem statement)
  timestampOfIntervention: string;
  triggerConditions: TriggerCondition[];
  forecastedFailure: PredictedFailure;
  observedMetricsAtTrigger: ObservedMetrics;
  mitigationActionTaken: MitigationAction;
  estimatedAvoidedFailure: CounterfactualEstimate;
  timeToStabilization: StabilizationMetrics;
  finalSystemState: FinalSystemState;
  forecastConfidenceAtTrigger: number;

  // Optional but Recommended Fields
  unsafeOperatingRegions?: UnsafeOperatingRegion[];
  recommendedConfigurationChanges?: ConfigurationRecommendation[];
  historicalComparison?: HistoricalComparison;

  // Metadata
  interlockVersion: string;
  runId: string;
  interventionSequenceNumber: number;

  // Limitations (honesty)
  limitations: string[];
}

// ============= Incident Report Builder =============

export class IncidentReportBuilder {
  private report: Partial<IncidentReport>;
  private interventionCount: number = 0;

  constructor() {
    this.report = {
      version: '2.0.0',
      interlockVersion: INTERLOCK_VERSION,
      limitations: [
        'Counterfactual estimates are probabilistic, not guaranteed outcomes',
        'Recovery predictions assume no additional system changes during recovery',
        'Novel failure modes not in calibration data cannot be accurately predicted',
        'Cascade effects from dependent services are not fully modeled',
        'Time-to-failure predictions have inherent stochastic variance'
      ]
    };
  }

  public setId(id: string): this {
    this.report.id = id;
    return this;
  }

  public setRunId(runId: string): this {
    this.report.runId = runId;
    return this;
  }

  public setInterventionTimestamp(timestamp: string): this {
    this.report.timestampOfIntervention = timestamp;
    return this;
  }

  public setGeneratedTimestamp(timestamp: string): this {
    this.report.generated = timestamp;
    return this;
  }

  public setInterventionSequenceNumber(num: number): this {
    this.report.interventionSequenceNumber = num;
    this.interventionCount = num;
    return this;
  }

  public setTriggerConditions(conditions: TriggerCondition[]): this {
    this.report.triggerConditions = conditions;
    return this;
  }

  public setForecastedFailure(failure: PredictedFailure): this {
    this.report.forecastedFailure = failure;
    return this;
  }

  public setObservedMetrics(metrics: ObservedMetrics): this {
    this.report.observedMetricsAtTrigger = metrics;
    return this;
  }

  public setMitigationAction(action: MitigationAction): this {
    this.report.mitigationActionTaken = action;
    return this;
  }

  public setCounterfactualEstimate(estimate: CounterfactualEstimate): this {
    this.report.estimatedAvoidedFailure = estimate;
    return this;
  }

  public setStabilizationMetrics(metrics: StabilizationMetrics): this {
    this.report.timeToStabilization = metrics;
    return this;
  }

  public setFinalSystemState(state: FinalSystemState): this {
    this.report.finalSystemState = state;
    return this;
  }

  public setForecastConfidence(confidence: number): this {
    this.report.forecastConfidenceAtTrigger = confidence;
    return this;
  }

  public setUnsafeOperatingRegions(regions: UnsafeOperatingRegion[]): this {
    this.report.unsafeOperatingRegions = regions;
    return this;
  }

  public setConfigurationRecommendations(recommendations: ConfigurationRecommendation[]): this {
    this.report.recommendedConfigurationChanges = recommendations;
    return this;
  }

  public setHistoricalComparison(comparison: HistoricalComparison): this {
    this.report.historicalComparison = comparison;
    return this;
  }

  /**
   * Build the executive summary from the collected data
   */
  private buildExecutiveSummary(): void {
    const finalState = this.report.finalSystemState;
    const counterfactual = this.report.estimatedAvoidedFailure;

    let outcome: 'failure_prevented' | 'impact_reduced' | 'monitoring_only';
    let headline: string;

    if (finalState?.isStable && counterfactual?.withoutIntervention.estimatedTimeToFailure === 0) {
      outcome = 'failure_prevented';
      headline = `Circuit breaker prevented imminent system failure`;
    } else if (finalState?.isStable) {
      outcome = 'impact_reduced';
      headline = `Circuit breaker reduced impact of system degradation`;
    } else {
      outcome = 'monitoring_only';
      headline = `System remains under observation`;
    }

    const keyTakeaways: string[] = [];

    if (this.report.triggerConditions && this.report.triggerConditions.length > 0) {
      const criticalTriggers = this.report.triggerConditions.filter(t => t.breachSeverity === 'critical');
      if (criticalTriggers.length > 0) {
        keyTakeaways.push(`${criticalTriggers.length} critical threshold(s) breached`);
      }
    }

    if (this.report.forecastedFailure) {
      keyTakeaways.push(`Predicted failure type: ${this.report.forecastedFailure.type}`);
    }

    if (counterfactual) {
      keyTakeaways.push(`Estimated downtime avoided: ${counterfactual.withIntervention.downtimeAvoided} seconds`);
    }

    if (this.report.timeToStabilization) {
      keyTakeaways.push(`System stabilized in ${this.report.timeToStabilization.timeToStabilizationMs}ms`);
    }

    this.report.executiveSummary = {
      outcome,
      headline,
      keyTakeaways
    };
  }

  /**
   * Build the final incident report
   */
  public build(): IncidentReport {
    // Generate missing fields
    if (!this.report.id) {
      this.report.id = `incident-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
    }

    if (!this.report.generated) {
      this.report.generated = new Date().toISOString();
    }

    // Build executive summary
    this.buildExecutiveSummary();

    // Validate required fields
    const requiredFields = [
      'timestampOfIntervention',
      'triggerConditions',
      'forecastedFailure',
      'observedMetricsAtTrigger',
      'mitigationActionTaken',
      'estimatedAvoidedFailure',
      'timeToStabilization',
      'finalSystemState',
      'forecastConfidenceAtTrigger'
    ];

    for (const field of requiredFields) {
      if (!(field in this.report) || this.report[field as keyof IncidentReport] === undefined) {
        throw new Error(`Required field '${field}' is missing from incident report`);
      }
    }

    return this.report as IncidentReport;
  }
}

// ============= Incident Report Generator =============

export function generateIncidentReport(
  intervention: Intervention,
  preInterventionMetrics: FAISSMetrics,
  postInterventionMetrics: FAISSMetrics,
  stabilizationData: {
    timeToStabilizationMs: number;
    peakHazard: number;
    probeAttempts: number;
    probeSuccesses: number;
    stepsInDegradedMode: number;
  },
  runId: string,
  sequenceNumber: number,
  confidence: number,
  // Optional economic data for "Saved Value" metric (Phase B4)
  economicData?: {
    controlCrashPoint?: number;      // Step at which control system crashed
    maxLoadProtected?: number;       // Max load the protected system handled
    queriesSaved?: number;           // Additional queries processed
    costPerQuery?: number;           // Cost per query (user-configured)
    currency?: string;               // Currency code (default: "USD")
  }
): IncidentReport {
  const builder = new IncidentReportBuilder();

  // Calculate trigger conditions from metrics
  const triggerConditions: TriggerCondition[] = [];

  if (intervention.metrics.hazard >= 0.6) {
    triggerConditions.push({
      metric: 'hazardScore',
      threshold: 0.6,
      observedValue: intervention.metrics.hazard,
      direction: 'above',
      breachSeverity: intervention.metrics.hazard >= 0.8 ? 'critical' : 'warning'
    });
  }

  if (intervention.metrics.recall < 0.7) {
    triggerConditions.push({
      metric: 'recall',
      threshold: 0.7,
      observedValue: intervention.metrics.recall,
      direction: 'below',
      breachSeverity: intervention.metrics.recall < 0.6 ? 'critical' : 'warning'
    });
  }

  if (intervention.metrics.latencyMs > 50) {
    triggerConditions.push({
      metric: 'latencyP95Ms',
      threshold: 50,
      observedValue: intervention.metrics.latencyMs,
      direction: 'above',
      breachSeverity: intervention.metrics.latencyMs > 75 ? 'critical' : 'warning'
    });
  }

  // Build forecasted failure
  const forecastedFailure: PredictedFailure = {
    type: determineFailureType(intervention.metrics.hazard, intervention.metrics.recall, intervention.metrics.latencyMs),
    description: `System approaching failure boundary with hazard score ${intervention.metrics.hazard.toFixed(3)}`,
    timeToFailure: estimateTimeToFailure(intervention.metrics.hazard),
    timeToFailureUncertainty: {
      lower: Math.max(0, estimateTimeToFailure(intervention.metrics.hazard) - 2),
      upper: estimateTimeToFailure(intervention.metrics.hazard) + 3,
      confidence: 0.9
    },
    expectedDropDepth: Math.min(0.4, intervention.metrics.hazard * 0.5),
    expectedDropDepthUncertainty: {
      lower: Math.min(0.2, intervention.metrics.hazard * 0.3),
      upper: Math.min(0.6, intervention.metrics.hazard * 0.7),
      confidence: 0.85
    },
    affectedMetrics: getAffectedMetrics(intervention.metrics),
    rootCause: determineRootCause(intervention.trigger)
  };

  // Build counterfactual estimate
  const counterfactualEstimate: CounterfactualEstimate = {
    withoutIntervention: {
      estimatedTimeToFailure: forecastedFailure.timeToFailure,
      estimatedImpact: getEstimatedImpact(intervention.metrics.hazard),
      estimatedDowntimeSeconds: estimateDowntime(intervention.metrics.hazard),
      confidenceInEstimate: confidence
    },
    withIntervention: {
      actualOutcome: postInterventionMetrics.recallAtK >= 0.7 ? 'System stabilized' : 'Degraded but operational',
      downtimeAvoided: estimateDowntime(intervention.metrics.hazard),
      dataLossAvoided: intervention.metrics.hazard < 0.9,
      serviceImpactReduced: `Maintained ${(postInterventionMetrics.recallAtK * 100).toFixed(1)}% recall vs projected ${(intervention.metrics.recall * 0.5 * 100).toFixed(1)}%`
    },
    benefitSummary: `Prevented potential ${estimateDowntime(intervention.metrics.hazard)} second outage by entering degraded mode proactively`
  };

  // Add economic impact if data provided (Phase B4: Saved Value Metric)
  if (economicData) {
    counterfactualEstimate.economicImpact = {
      controlCrashPoint: economicData.controlCrashPoint ?? 0,
      maxLoadProtected: economicData.maxLoadProtected ?? 0,
      queriesSaved: economicData.queriesSaved ?? 0,
      costPerQuery: economicData.costPerQuery,
      currency: economicData.currency ?? 'USD'
    };

    // Calculate value retained if cost per query is provided
    if (economicData.costPerQuery && economicData.queriesSaved) {
      counterfactualEstimate.economicImpact.valueRetained =
        economicData.queriesSaved * economicData.costPerQuery;

      // Update benefit summary to include economic value
      const valueStr = counterfactualEstimate.economicImpact.valueRetained.toLocaleString('en-US', {
        style: 'currency',
        currency: economicData.currency ?? 'USD'
      });
      counterfactualEstimate.benefitSummary =
        `Interlock processed ${economicData.queriesSaved.toLocaleString()} additional queries that would have been lost. ` +
        `Estimated value retained: ${valueStr}.`;
    }
  }

  // Build observed metrics
  const observedMetrics: ObservedMetrics = {
    timestamp: new Date(intervention.timestamp).toISOString(),
    recall: intervention.metrics.recall,
    latencyP95Ms: intervention.metrics.latencyMs,
    memoryMb: preInterventionMetrics.memoryMb,
    indexSize: preInterventionMetrics.indexSize,
    hazardScore: intervention.metrics.hazard,
    queryCount: preInterventionMetrics.queryCount
  };

  // Build mitigation action
  const mitigationAction: MitigationAction = {
    type: getMitigationType(intervention.newState),
    description: intervention.actionTaken,
    parameters: parseMitigationParameters(intervention.actionTaken),
    expectedImpact: `Reduce hazard score while maintaining ${getMaintainedCapability(intervention.newState)}`
  };

  // Build stabilization metrics
  const stabilizationMetrics: StabilizationMetrics = {
    timeToStabilizationMs: stabilizationData.timeToStabilizationMs,
    peakHazardDuringRecovery: stabilizationData.peakHazard,
    finalHazardScore: intervention.metrics.hazard * 0.5, // Estimate
    stepsInDegradedMode: stabilizationData.stepsInDegradedMode,
    probeAttempts: stabilizationData.probeAttempts,
    probeSuccesses: stabilizationData.probeSuccesses
  };

  // Build final system state
  const finalSystemState: FinalSystemState = {
    circuitState: intervention.newState as CircuitState,
    recall: postInterventionMetrics.recallAtK,
    latencyP95Ms: postInterventionMetrics.latencyP95Ms,
    memoryMb: postInterventionMetrics.memoryMb,
    hazardScore: intervention.metrics.hazard * 0.5,
    isStable: postInterventionMetrics.recallAtK >= 0.6,
    confidence: confidence
  };

  return builder
    .setRunId(runId)
    .setInterventionSequenceNumber(sequenceNumber)
    .setInterventionTimestamp(new Date(intervention.timestamp).toISOString())
    .setTriggerConditions(triggerConditions)
    .setForecastedFailure(forecastedFailure)
    .setObservedMetrics(observedMetrics)
    .setMitigationAction(mitigationAction)
    .setCounterfactualEstimate(counterfactualEstimate)
    .setStabilizationMetrics(stabilizationMetrics)
    .setFinalSystemState(finalSystemState)
    .setForecastConfidence(confidence)
    .build();
}

// ============= Helper Functions =============

function determineFailureType(hazard: number, recall: number, latency: number): string {
  if (hazard >= 0.9) {
    return 'imminent_crash';
  } else if (recall < 0.6) {
    return 'recall_degradation';
  } else if (latency > 75) {
    return 'latency_spike';
  } else if (hazard >= 0.7) {
    return 'approaching_boundary';
  }
  return 'general_degradation';
}

function estimateTimeToFailure(hazard: number): number {
  if (hazard >= 0.9) return 0;
  if (hazard >= 0.8) return 1;
  if (hazard >= 0.7) return 2;
  if (hazard >= 0.6) return 4;
  return 10;
}

function getAffectedMetrics(metrics: { recall: number; latencyMs: number; hazard: number }): string[] {
  const affected: string[] = [];
  if (metrics.recall < 0.8) affected.push('recall');
  if (metrics.latencyMs > 30) affected.push('latency');
  affected.push('hazardScore');
  return affected;
}

function determineRootCause(trigger: string): string {
  if (trigger.includes('Hazard')) {
    return 'Progressive system stress approaching failure boundary';
  } else if (trigger.includes('consecutive')) {
    return 'Repeated metric threshold violations';
  } else if (trigger.includes('Recovery')) {
    return 'Recovery attempt detected unsafe conditions';
  }
  return 'System operating outside safe parameters';
}

function getEstimatedImpact(hazard: number): string {
  if (hazard >= 0.9) {
    return 'Critical: Potential complete service outage';
  } else if (hazard >= 0.7) {
    return 'Severe: Major performance degradation and possible data loss';
  } else if (hazard >= 0.5) {
    return 'Moderate: Noticeable performance impact on end users';
  }
  return 'Minor: Subtle performance variations';
}

function estimateDowntime(hazard: number): number {
  // Estimate downtime in seconds based on hazard level
  if (hazard >= 0.9) return 300;  // 5 minutes
  if (hazard >= 0.8) return 120;  // 2 minutes
  if (hazard >= 0.7) return 60;   // 1 minute
  if (hazard >= 0.6) return 30;   // 30 seconds
  return 10;
}

function getMitigationType(newState: string): MitigationAction['type'] {
  switch (newState) {
    case 'open': return 'degraded_mode';
    case 'half_open': return 'probe_traffic';
    case 'closed': return 'full_recovery';
    default: return 'emergency_stop';
  }
}

function parseMitigationParameters(actionTaken: string): Record<string, number | string> {
  const params: Record<string, number | string> = {};

  // Extract nprobe value if present
  const nprobeMatch = actionTaken.match(/nprobe=(\d+)/);
  if (nprobeMatch) {
    params['nprobe'] = parseInt(nprobeMatch[1], 10);
  }

  // Extract probe traffic percentage if present
  const probeMatch = actionTaken.match(/(\d+)%\s*probe/i);
  if (probeMatch) {
    params['probeTrafficPercent'] = parseInt(probeMatch[1], 10);
  }

  return params;
}

function getMaintainedCapability(newState: string): string {
  switch (newState) {
    case 'open': return 'basic query functionality with reduced accuracy';
    case 'half_open': return 'limited traffic handling for recovery testing';
    case 'closed': return 'full system capability';
    default: return 'minimal essential operations';
  }
}

// ============= Report Output Formatters =============

/**
 * Generate JSON output for incident report
 */
export function incidentReportToJSON(report: IncidentReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Generate Markdown output for incident report
 */
export function incidentReportToMarkdown(report: IncidentReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Interlock Incident Report`);
  lines.push('');
  lines.push(`> **${report.executiveSummary.headline}**`);
  lines.push('');
  lines.push(`**Report ID:** ${report.id}`);
  lines.push(`**Generated:** ${report.generated}`);
  lines.push(`**Run ID:** ${report.runId}`);
  lines.push(`**Intervention #:** ${report.interventionSequenceNumber}`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`**Outcome:** ${formatOutcome(report.executiveSummary.outcome)}`);
  lines.push('');
  lines.push('### Key Takeaways');
  lines.push('');
  for (const takeaway of report.executiveSummary.keyTakeaways) {
    lines.push(`- ${takeaway}`);
  }
  lines.push('');

  // Timeline
  lines.push('## Incident Timeline');
  lines.push('');
  lines.push(`- **Intervention Triggered:** ${report.timestampOfIntervention}`);
  lines.push(`- **Time to Stabilization:** ${report.timeToStabilization.timeToStabilizationMs}ms`);
  lines.push(`- **Peak Hazard During Recovery:** ${(report.timeToStabilization.peakHazardDuringRecovery * 100).toFixed(1)}%`);
  lines.push('');

  // Trigger Conditions
  lines.push('## Trigger Conditions');
  lines.push('');
  lines.push('| Metric | Threshold | Observed | Severity |');
  lines.push('|--------|-----------|----------|----------|');
  for (const trigger of report.triggerConditions) {
    const severity = trigger.breachSeverity === 'critical' ? '🔴 Critical' : '🟡 Warning';
    const direction = trigger.direction === 'above' ? '>' : '<';
    lines.push(`| ${trigger.metric} | ${direction} ${trigger.threshold} | ${trigger.observedValue.toFixed(3)} | ${severity} |`);
  }
  lines.push('');

  // Forecasted Failure
  lines.push('## Forecasted Failure');
  lines.push('');
  lines.push(`**Type:** ${formatFailureType(report.forecastedFailure.type)}`);
  lines.push('');
  lines.push(`**Description:** ${report.forecastedFailure.description}`);
  lines.push('');
  lines.push(`**Root Cause:** ${report.forecastedFailure.rootCause}`);
  lines.push('');
  lines.push('### Prediction Details');
  lines.push('');
  lines.push(`- **Time to Failure:** ${report.forecastedFailure.timeToFailure} intervals ` +
    `(${report.forecastedFailure.timeToFailureUncertainty.lower}-${report.forecastedFailure.timeToFailureUncertainty.upper} @ ` +
    `${(report.forecastedFailure.timeToFailureUncertainty.confidence * 100).toFixed(0)}% confidence)`);
  lines.push(`- **Expected Drop Depth:** ${(report.forecastedFailure.expectedDropDepth * 100).toFixed(1)}% ` +
    `(${(report.forecastedFailure.expectedDropDepthUncertainty.lower * 100).toFixed(1)}-` +
    `${(report.forecastedFailure.expectedDropDepthUncertainty.upper * 100).toFixed(1)}%)`);
  lines.push(`- **Affected Metrics:** ${report.forecastedFailure.affectedMetrics.join(', ')}`);
  lines.push(`- **Forecast Confidence:** ${(report.forecastConfidenceAtTrigger * 100).toFixed(1)}%`);
  lines.push('');

  // Observed Metrics
  lines.push('## Observed Metrics at Trigger');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Recall | ${(report.observedMetricsAtTrigger.recall * 100).toFixed(1)}% |`);
  lines.push(`| Latency (p95) | ${report.observedMetricsAtTrigger.latencyP95Ms.toFixed(1)} ms |`);
  lines.push(`| Memory | ${report.observedMetricsAtTrigger.memoryMb.toFixed(1)} MB |`);
  lines.push(`| Index Size | ${report.observedMetricsAtTrigger.indexSize.toLocaleString()} vectors |`);
  lines.push(`| Hazard Score | ${(report.observedMetricsAtTrigger.hazardScore * 100).toFixed(1)}% |`);
  lines.push('');

  // Mitigation Action
  lines.push('## Mitigation Action');
  lines.push('');
  lines.push(`**Type:** ${formatMitigationType(report.mitigationActionTaken.type)}`);
  lines.push('');
  lines.push(`**Action:** ${report.mitigationActionTaken.description}`);
  lines.push('');
  lines.push(`**Expected Impact:** ${report.mitigationActionTaken.expectedImpact}`);
  lines.push('');
  if (Object.keys(report.mitigationActionTaken.parameters).length > 0) {
    lines.push('### Parameters');
    lines.push('');
    for (const [key, value] of Object.entries(report.mitigationActionTaken.parameters)) {
      lines.push(`- **${key}:** ${value}`);
    }
    lines.push('');
  }

  // Counterfactual Analysis
  lines.push('## Counterfactual Analysis');
  lines.push('');
  lines.push('### What Would Have Happened Without Intervention');
  lines.push('');
  lines.push(`- **Estimated Time to Failure:** ${report.estimatedAvoidedFailure.withoutIntervention.estimatedTimeToFailure} intervals`);
  lines.push(`- **Estimated Impact:** ${report.estimatedAvoidedFailure.withoutIntervention.estimatedImpact}`);
  lines.push(`- **Estimated Downtime:** ${report.estimatedAvoidedFailure.withoutIntervention.estimatedDowntimeSeconds} seconds`);
  lines.push(`- **Confidence:** ${(report.estimatedAvoidedFailure.withoutIntervention.confidenceInEstimate * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('### What Actually Happened With Intervention');
  lines.push('');
  lines.push(`- **Outcome:** ${report.estimatedAvoidedFailure.withIntervention.actualOutcome}`);
  lines.push(`- **Downtime Avoided:** ${report.estimatedAvoidedFailure.withIntervention.downtimeAvoided} seconds`);
  lines.push(`- **Data Loss Avoided:** ${report.estimatedAvoidedFailure.withIntervention.dataLossAvoided ? 'Yes' : 'No'}`);
  lines.push(`- **Impact Reduction:** ${report.estimatedAvoidedFailure.withIntervention.serviceImpactReduced}`);
  lines.push('');
  lines.push(`**Summary:** ${report.estimatedAvoidedFailure.benefitSummary}`);
  lines.push('');

  // Economic Impact (Phase B4: Saved Value Metric)
  if (report.estimatedAvoidedFailure.economicImpact) {
    const econ = report.estimatedAvoidedFailure.economicImpact;
    lines.push('### 💰 Economic Impact (Saved Value)');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Control Crash Point | Step ${econ.controlCrashPoint} |`);
    lines.push(`| Max Load Protected | Step ${econ.maxLoadProtected} |`);
    lines.push(`| Queries Saved | ${econ.queriesSaved.toLocaleString()} |`);
    if (econ.costPerQuery !== undefined) {
      lines.push(`| Cost Per Query | ${econ.costPerQuery.toFixed(4)} ${econ.currency || 'USD'} |`);
    }
    if (econ.valueRetained !== undefined) {
      const valueStr = econ.valueRetained.toLocaleString('en-US', {
        style: 'currency',
        currency: econ.currency || 'USD'
      });
      lines.push(`| **Value Retained** | **${valueStr}** |`);
    }
    lines.push('');
    if (econ.valueRetained !== undefined) {
      const valueStr = econ.valueRetained.toLocaleString('en-US', {
        style: 'currency',
        currency: econ.currency || 'USD'
      });
      lines.push(`> *"Interlock processed ${econ.queriesSaved.toLocaleString()} additional queries that would have been lost.`);
      lines.push(`> Estimated value retained: ${valueStr}."*`);
    } else {
      lines.push(`> *"Interlock processed ${econ.queriesSaved.toLocaleString()} additional queries that would have been lost."*`);
    }
    lines.push('');
  }

  // Final System State
  lines.push('## Final System State');
  lines.push('');
  lines.push(`| Metric | Value | Status |`);
  lines.push('|--------|-------|--------|');
  lines.push(`| Circuit State | ${formatCircuitState(report.finalSystemState.circuitState)} | - |`);
  lines.push(`| Recall | ${(report.finalSystemState.recall * 100).toFixed(1)}% | ${report.finalSystemState.recall >= 0.7 ? '✅' : '⚠️'} |`);
  lines.push(`| Latency (p95) | ${report.finalSystemState.latencyP95Ms.toFixed(1)} ms | ${report.finalSystemState.latencyP95Ms <= 50 ? '✅' : '⚠️'} |`);
  lines.push(`| Hazard Score | ${(report.finalSystemState.hazardScore * 100).toFixed(1)}% | ${report.finalSystemState.hazardScore < 0.5 ? '✅' : '⚠️'} |`);
  lines.push(`| System Stable | ${report.finalSystemState.isStable ? '✅ Yes' : '⚠️ No'} | - |`);
  lines.push('');

  // Unsafe Operating Regions (optional)
  if (report.unsafeOperatingRegions && report.unsafeOperatingRegions.length > 0) {
    lines.push('## Unsafe Operating Regions Encountered');
    lines.push('');
    for (const region of report.unsafeOperatingRegions) {
      const severityIcon = region.severity === 'critical' ? '🔴' : '🟡';
      lines.push(`### ${severityIcon} ${region.parameter}`);
      lines.push('');
      lines.push(`- **Unsafe Range:** ${region.unsafeRange[0]} - ${region.unsafeRange[1]}`);
      lines.push(`- **Safe Range:** ${region.safeRange[0]} - ${region.safeRange[1]}`);
      lines.push(`- **Recommendation:** ${region.recommendation}`);
      lines.push('');
    }
  }

  // Configuration Recommendations (optional)
  if (report.recommendedConfigurationChanges && report.recommendedConfigurationChanges.length > 0) {
    lines.push('## Recommended Configuration Changes');
    lines.push('');
    lines.push('| Parameter | Current | Recommended | Rationale |');
    lines.push('|-----------|---------|-------------|-----------|');
    for (const rec of report.recommendedConfigurationChanges) {
      lines.push(`| ${rec.parameter} | ${rec.currentValue} | ${rec.recommendedValue} | ${rec.rationale} |`);
    }
    lines.push('');
  }

  // Limitations
  lines.push('## Limitations');
  lines.push('');
  lines.push('> **Important:** This report is generated by Interlock\'s automated incident analysis. The following limitations apply:');
  lines.push('');
  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by Interlock v${INTERLOCK_VERSION} — The Circuit Breaker for AI Infrastructure*`);
  lines.push('');
  lines.push('> Interlock does not prevent failure. It makes failure visible early — and survivable.');

  return lines.join('\n');
}

// ============= Format Helpers =============

function formatOutcome(outcome: string): string {
  switch (outcome) {
    case 'failure_prevented': return '✅ Failure Prevented';
    case 'impact_reduced': return '🟡 Impact Reduced';
    case 'monitoring_only': return '👁️ Monitoring Only';
    default: return outcome;
  }
}

function formatFailureType(type: string): string {
  switch (type) {
    case 'imminent_crash': return '🔴 Imminent Crash';
    case 'recall_degradation': return '📉 Recall Degradation';
    case 'latency_spike': return '⏱️ Latency Spike';
    case 'approaching_boundary': return '⚠️ Approaching Boundary';
    case 'general_degradation': return '📊 General Degradation';
    default: return type;
  }
}

function formatMitigationType(type: string): string {
  switch (type) {
    case 'degraded_mode': return '🔴 Degraded Mode';
    case 'probe_traffic': return '🟡 Probe Traffic';
    case 'full_recovery': return '🟢 Full Recovery';
    case 'emergency_stop': return '🛑 Emergency Stop';
    default: return type;
  }
}

function formatCircuitState(state: CircuitState): string {
  switch (state) {
    case 'closed': return '🟢 CLOSED (normal)';
    case 'open': return '🔴 OPEN (degraded)';
    case 'half_open': return '🟡 HALF_OPEN (testing)';
    default: return state;
  }
}

// ============= Exports =============

// All types and classes are already exported inline with their definitions
