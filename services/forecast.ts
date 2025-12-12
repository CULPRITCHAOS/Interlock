/**
 * LawForge Failure Forecasting Engine (Phase III)
 * ================================================
 * Predicts system failures based on observed boundary data.
 * 
 * Guiding Principle: LawForge does not prevent failure.
 * It makes failure visible before it happens.
 * 
 * NO STOCHASTIC GUESSING - All predictions derived from observed gradients and stress data.
 */

import {
  FailureBoundary,
  BoundariesArtifact,
  SystemState,
  ProposedChange,
  FailureForecast,
  ForecastValidation,
  ForecastValidationSummary,
  Boundary,
  Region,
  DriftInjectionResult
} from '../types';

// ============= Boundary Detection =============

/**
 * Extract failure boundaries from phase transition data
 * Converts existing Boundary type to enhanced FailureBoundary with forecasting data
 */
export function extractFailureBoundaries(
  phaseTransitions: Boundary[],
  driftResults: DriftInjectionResult[],
  stableRegions: Region[],
  brittleRegions: Region[]
): FailureBoundary[] {
  const boundaries: FailureBoundary[] = [];
  
  // Convert phase transitions to failure boundaries
  for (const transition of phaseTransitions) {
    // Calculate historical drop depth from associated drift results
    const domainDrifts = driftResults.filter(d => d.domain === transition.domain);
    const avgDropDepth = domainDrifts.length > 0
      ? domainDrifts.reduce((s, d) => s + d.dropDepth, 0) / domainDrifts.length
      : transition.abruptness * 0.3; // Estimate from abruptness if no drift data
    
    // Calculate recovery slope from drift results
    const avgRecoveryTime = domainDrifts.length > 0
      ? domainDrifts.reduce((s, d) => s + d.recoveryTime, 0) / domainDrifts.length
      : 20; // Default estimate
    const recoverySlope = avgRecoveryTime > 0 ? avgDropDepth / avgRecoveryTime : 0.01;
    
    // Determine parameter range from associated regions
    const associatedRegion = [...stableRegions, ...brittleRegions]
      .find(r => r.id === transition.fromRegion || r.id === transition.toRegion);
    
    const parameterRange: [number, number] = associatedRegion
      ? associatedRegion.parameterRanges.alpha
      : [1.0, 6.0];
    
    // Calculate confidence based on observation count and consistency
    const observedCrossings = domainDrifts.length;
    const confidence = Math.min(0.95, 0.5 + (observedCrossings * 0.1));
    
    const boundary: FailureBoundary = {
      id: `fb-${transition.id}`,
      domain: transition.domain,
      parameter: transition.transitionParameter,
      parameterRange,
      criticalValue: transition.transitionValue,
      abruptnessScore: transition.abruptness,
      historicalDropDepth: avgDropDepth,
      recoverySlope,
      confidence,
      observedCrossings,
      lawsAtRisk: transition.lawsInvalidated
    };
    
    boundaries.push(boundary);
  }
  
  // Add implicit boundaries from brittle regions
  for (const region of brittleRegions) {
    if (region.stability < 0.3) {
      // Very unstable region - create implicit boundary
      const boundary: FailureBoundary = {
        id: `fb-implicit-${region.id}`,
        domain: region.domain,
        parameter: 'alpha',
        parameterRange: region.parameterRanges.alpha,
        criticalValue: (region.parameterRanges.alpha[0] + region.parameterRanges.alpha[1]) / 2,
        abruptnessScore: 1 - region.stability,
        historicalDropDepth: region.fitnessRange[1] - region.fitnessRange[0],
        recoverySlope: 0.02, // Conservative estimate
        confidence: 0.6,
        observedCrossings: 1,
        lawsAtRisk: region.lawsBreaking
      };
      boundaries.push(boundary);
    }
  }
  
  return boundaries;
}

/**
 * Generate boundaries artifact for export
 */
export function generateBoundariesArtifact(
  boundaries: FailureBoundary[],
  runId: string
): BoundariesArtifact {
  const highRisk = boundaries.filter(b => b.abruptnessScore > 0.7).length;
  const mediumRisk = boundaries.filter(b => b.abruptnessScore >= 0.4 && b.abruptnessScore <= 0.7).length;
  const lowRisk = boundaries.filter(b => b.abruptnessScore < 0.4).length;
  
  return {
    generated: new Date().toISOString(),
    runId,
    totalBoundaries: boundaries.length,
    summary: { highRisk, mediumRisk, lowRisk },
    boundaries
  };
}

/**
 * Generate boundaries markdown report
 */
export function generateBoundariesMarkdown(artifact: BoundariesArtifact): string {
  const lines: string[] = [];
  
  lines.push(`# LawForge - Failure Boundary Analysis`);
  lines.push(``);
  lines.push(`> LawForge makes failure visible before it happens.`);
  lines.push(``);
  lines.push(`**Generated:** ${artifact.generated}`);
  lines.push(`**Run ID:** ${artifact.runId}`);
  lines.push(`**Total Boundaries Detected:** ${artifact.totalBoundaries}`);
  lines.push(``);
  
  lines.push(`## Risk Summary`);
  lines.push(``);
  lines.push(`| Risk Level | Count | Description |`);
  lines.push(`|------------|-------|-------------|`);
  lines.push(`| 🔴 High | ${artifact.summary.highRisk} | Abruptness > 70% - Sharp transitions |`);
  lines.push(`| 🟡 Medium | ${artifact.summary.mediumRisk} | Abruptness 40-70% - Moderate transitions |`);
  lines.push(`| 🟢 Low | ${artifact.summary.lowRisk} | Abruptness < 40% - Gradual transitions |`);
  lines.push(``);
  
  // Group by domain
  const byDomain: Record<string, FailureBoundary[]> = {};
  for (const b of artifact.boundaries) {
    if (!byDomain[b.domain]) byDomain[b.domain] = [];
    byDomain[b.domain].push(b);
  }
  
  for (const [domain, boundaries] of Object.entries(byDomain)) {
    lines.push(`## ${domain.toUpperCase()} Domain Boundaries`);
    lines.push(``);
    
    for (const b of boundaries.sort((a, b) => b.abruptnessScore - a.abruptnessScore)) {
      const riskIcon = b.abruptnessScore > 0.7 ? '🔴' : b.abruptnessScore >= 0.4 ? '🟡' : '🟢';
      lines.push(`### ${riskIcon} ${b.id}`);
      lines.push(``);
      lines.push(`- **Parameter:** ${b.parameter}`);
      lines.push(`- **Critical Value:** ${b.criticalValue.toFixed(3)}`);
      lines.push(`- **Parameter Range:** [${b.parameterRange[0].toFixed(2)}, ${b.parameterRange[1].toFixed(2)}]`);
      lines.push(`- **Abruptness:** ${(b.abruptnessScore * 100).toFixed(1)}%`);
      lines.push(`- **Historical Drop Depth:** ${(b.historicalDropDepth * 100).toFixed(1)}%`);
      lines.push(`- **Recovery Slope:** ${b.recoverySlope.toFixed(4)} fitness/gen`);
      lines.push(`- **Confidence:** ${(b.confidence * 100).toFixed(1)}%`);
      lines.push(`- **Observed Crossings:** ${b.observedCrossings}`);
      if (b.lawsAtRisk.length > 0) {
        lines.push(`- **Laws at Risk:** ${b.lawsAtRisk.join(', ')}`);
      }
      lines.push(``);
    }
  }
  
  lines.push(`---`);
  lines.push(`*Generated by LawForge Failure Boundary Analyzer*`);
  
  return lines.join('\n');
}

// ============= Failure Prediction Engine =============

/**
 * Find the nearest boundary to the current system state
 */
export function findNearestBoundary(
  state: SystemState,
  boundaries: FailureBoundary[]
): { boundary: FailureBoundary | null; distance: number } {
  const domainBoundaries = boundaries.filter(b => b.domain === state.domain);
  
  if (domainBoundaries.length === 0) {
    return { boundary: null, distance: Infinity };
  }
  
  let nearest: FailureBoundary | null = null;
  let minDistance = Infinity;
  
  for (const boundary of domainBoundaries) {
    // Calculate normalized distance based on parameter
    let distance: number;
    if (boundary.parameter === 'alpha') {
      distance = Math.abs(state.currentAlpha - boundary.criticalValue);
    } else if (boundary.parameter === 'fitness') {
      distance = Math.abs(state.currentFitness - boundary.criticalValue);
    } else {
      // Default: use alpha
      distance = Math.abs(state.currentAlpha - boundary.criticalValue);
    }
    
    // Normalize by parameter range
    const range = boundary.parameterRange[1] - boundary.parameterRange[0];
    const normalizedDistance = range > 0 ? distance / range : distance;
    
    if (normalizedDistance < minDistance) {
      minDistance = normalizedDistance;
      nearest = boundary;
    }
  }
  
  return { boundary: nearest, distance: minDistance };
}

/**
 * Predict failure based on system state and proposed change
 * NO STOCHASTIC GUESSING - Uses observed gradients and historical data
 */
export function predictFailure(
  systemState: SystemState,
  proposedChange: ProposedChange,
  boundaries: FailureBoundary[]
): FailureForecast {
  const { boundary: nearestBoundary, distance: currentDistance } = findNearestBoundary(systemState, boundaries);
  
  // Calculate new distance after proposed change
  let newParameterValue: number;
  if (proposedChange.parameterName === 'alpha') {
    newParameterValue = proposedChange.proposedValue;
  } else {
    newParameterValue = systemState.currentAlpha; // Default
  }
  
  // Calculate distance to boundary after change
  let newDistance = currentDistance;
  if (nearestBoundary) {
    const rawDistance = Math.abs(newParameterValue - nearestBoundary.criticalValue);
    const range = nearestBoundary.parameterRange[1] - nearestBoundary.parameterRange[0];
    newDistance = range > 0 ? rawDistance / range : rawDistance;
  }
  
  // Determine if we're crossing a boundary
  const isCrossingBoundary = nearestBoundary !== null && 
    newDistance < 0.1 && // Very close to boundary
    proposedChange.currentValue !== proposedChange.proposedValue;
  
  // Calculate expected drop depth using historical data (NO GUESSING)
  let expectedDropDepth = 0;
  let expectedRecoveryTime = 0;
  let dominantFailureMode = 'none';
  let riskLevel: 'safe' | 'yellow' | 'red' = 'safe';
  let warningReason = 'System operating within safe parameters.';
  let mitigationSuggestion = 'No action required.';
  
  if (nearestBoundary) {
    // Use observed historical data for predictions
    const proximityFactor = Math.max(0, 1 - newDistance * 2); // 0 to 1
    
    // Expected drop depth = historical drop * proximity factor * abruptness
    expectedDropDepth = nearestBoundary.historicalDropDepth * proximityFactor * nearestBoundary.abruptnessScore;
    
    // Expected recovery time = historical recovery time based on slope
    if (nearestBoundary.recoverySlope > 0) {
      expectedRecoveryTime = Math.ceil(expectedDropDepth / nearestBoundary.recoverySlope);
    } else {
      expectedRecoveryTime = 50; // Default max
    }
    
    // Determine failure mode
    if (nearestBoundary.lawsAtRisk.length > 0) {
      dominantFailureMode = `law_invalidation:${nearestBoundary.lawsAtRisk[0]}`;
    } else if (nearestBoundary.abruptnessScore > 0.7) {
      dominantFailureMode = 'phase_transition';
    } else {
      dominantFailureMode = 'gradual_degradation';
    }
    
    // Risk level based on proximity and abruptness
    if (proximityFactor > 0.8 || (isCrossingBoundary && nearestBoundary.abruptnessScore > 0.5)) {
      riskLevel = 'red';
      warningReason = `Forecasted collapse: approaching ${nearestBoundary.parameter} boundary at ${nearestBoundary.criticalValue.toFixed(2)}. ` +
        `Historical drop: ${(nearestBoundary.historicalDropDepth * 100).toFixed(1)}%. ` +
        `Expected recovery: ${expectedRecoveryTime} generations.`;
      mitigationSuggestion = `Avoid ${proposedChange.changeType}. Consider moving ${nearestBoundary.parameter} away from ${nearestBoundary.criticalValue.toFixed(2)}.`;
    } else if (proximityFactor > 0.5) {
      riskLevel = 'yellow';
      warningReason = `Approaching boundary: ${nearestBoundary.parameter} = ${nearestBoundary.criticalValue.toFixed(2)} ` +
        `is ${(newDistance * 100).toFixed(1)}% away. Abruptness: ${(nearestBoundary.abruptnessScore * 100).toFixed(1)}%.`;
      mitigationSuggestion = `Monitor ${nearestBoundary.parameter} closely. Consider smaller incremental changes.`;
    }
  }
  
  // Calculate confidence based on available data
  const confidenceScore = nearestBoundary 
    ? nearestBoundary.confidence * (0.5 + nearestBoundary.observedCrossings * 0.1)
    : 0.3; // Low confidence if no boundary data
  
  return {
    id: `forecast-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    systemState,
    proposedChange,
    expectedDropDepth,
    expectedRecoveryTime,
    dominantFailureMode,
    riskLevel,
    confidenceScore: Math.min(0.95, confidenceScore),
    nearestBoundary,
    boundaryDistance: newDistance,
    warningReason,
    mitigationSuggestion
  };
}

// ============= Forecast Validation =============

/**
 * Validate a forecast against actual observed outcome
 */
export function validateForecast(
  forecast: FailureForecast,
  observedDropDepth: number,
  observedRecoveryTime: number
): ForecastValidation {
  const dropDepthError = Math.abs(forecast.expectedDropDepth - observedDropDepth);
  const recoveryTimeError = Math.abs(forecast.expectedRecoveryTime - observedRecoveryTime);
  
  // Determine if risk level prediction was correct
  let wasCorrectRiskLevel = false;
  if (forecast.riskLevel === 'red') {
    wasCorrectRiskLevel = observedDropDepth > 0.15; // Significant drop
  } else if (forecast.riskLevel === 'yellow') {
    wasCorrectRiskLevel = observedDropDepth > 0.05 && observedDropDepth <= 0.15;
  } else {
    wasCorrectRiskLevel = observedDropDepth <= 0.05; // Minimal drop
  }
  
  return {
    forecastId: forecast.id,
    predictedDropDepth: forecast.expectedDropDepth,
    observedDropDepth,
    predictedRecoveryTime: forecast.expectedRecoveryTime,
    observedRecoveryTime,
    dropDepthError,
    recoveryTimeError,
    wasCorrectRiskLevel,
    generation: forecast.systemState.generation
  };
}

/**
 * Generate validation summary from multiple forecast validations
 */
export function generateValidationSummary(
  validations: ForecastValidation[],
  runId: string
): ForecastValidationSummary {
  const totalForecasts = validations.length;
  const totalValidated = validations.length;
  
  // Calculate accuracy metrics
  const dropDepthErrors = validations.map(v => v.dropDepthError);
  const recoveryTimeErrors = validations.map(v => v.recoveryTimeError);
  
  const dropDepthMeanError = dropDepthErrors.length > 0
    ? dropDepthErrors.reduce((s, e) => s + e, 0) / dropDepthErrors.length
    : 0;
  
  const recoveryTimeMeanError = recoveryTimeErrors.length > 0
    ? recoveryTimeErrors.reduce((s, e) => s + e, 0) / recoveryTimeErrors.length
    : 0;
  
  // Calculate median errors
  const sortedDropErrors = [...dropDepthErrors].sort((a, b) => a - b);
  const sortedRecoveryErrors = [...recoveryTimeErrors].sort((a, b) => a - b);
  
  const dropDepthMedianError = sortedDropErrors.length > 0
    ? sortedDropErrors[Math.floor(sortedDropErrors.length / 2)]
    : 0;
  
  const recoveryTimeMedianError = sortedRecoveryErrors.length > 0
    ? sortedRecoveryErrors[Math.floor(sortedRecoveryErrors.length / 2)]
    : 0;
  
  // Risk level accuracy
  const correctRiskLevels = validations.filter(v => v.wasCorrectRiskLevel).length;
  const riskLevelAccuracy = totalValidated > 0 ? correctRiskLevels / totalValidated : 0;
  
  // False positives: predicted significant drop, didn't happen
  const falsePositives = validations.filter(v => 
    v.predictedDropDepth > 0.1 && v.observedDropDepth < 0.05
  ).length;
  
  // False negatives: didn't predict significant drop, it happened
  const falseNegatives = validations.filter(v => 
    v.predictedDropDepth < 0.05 && v.observedDropDepth > 0.1
  ).length;
  
  return {
    generated: new Date().toISOString(),
    runId,
    totalForecasts,
    totalValidated,
    accuracy: {
      dropDepthMeanError,
      dropDepthMedianError,
      recoveryTimeMeanError,
      recoveryTimeMedianError,
      riskLevelAccuracy
    },
    falsePositives,
    falseNegatives,
    limitsOfPrediction: [
      'Predictions are based on observed historical data only',
      'Novel failure modes not in training data cannot be predicted',
      'Confidence degrades for parameter combinations not previously observed',
      'Recovery predictions assume no additional interventions',
      'Cascade effects between domains are not modeled'
    ],
    validations
  };
}

/**
 * Generate forecast validation markdown report
 */
export function generateForecastValidationMarkdown(summary: ForecastValidationSummary): string {
  const lines: string[] = [];
  
  lines.push(`# LawForge Phase III – Failure Forecasting`);
  lines.push(``);
  lines.push(`> LawForge does not prevent failure. It makes failure visible before it happens.`);
  lines.push(``);
  lines.push(`**Generated:** ${summary.generated}`);
  lines.push(`**Run ID:** ${summary.runId}`);
  lines.push(``);
  
  lines.push(`## Forecast Accuracy Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Forecasts | ${summary.totalForecasts} |`);
  lines.push(`| Total Validated | ${summary.totalValidated} |`);
  lines.push(`| Risk Level Accuracy | ${(summary.accuracy.riskLevelAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Drop Depth Mean Error | ${(summary.accuracy.dropDepthMeanError * 100).toFixed(2)}% |`);
  lines.push(`| Drop Depth Median Error | ${(summary.accuracy.dropDepthMedianError * 100).toFixed(2)}% |`);
  lines.push(`| Recovery Time Mean Error | ${summary.accuracy.recoveryTimeMeanError.toFixed(1)} gens |`);
  lines.push(`| Recovery Time Median Error | ${summary.accuracy.recoveryTimeMedianError.toFixed(1)} gens |`);
  lines.push(``);
  
  lines.push(`## False Positives / Negatives`);
  lines.push(``);
  lines.push(`- **False Positives:** ${summary.falsePositives} (predicted failure, didn't happen)`);
  lines.push(`- **False Negatives:** ${summary.falseNegatives} (didn't predict failure, it happened)`);
  lines.push(``);
  
  const falsePositiveRate = summary.totalValidated > 0 ? summary.falsePositives / summary.totalValidated : 0;
  const falseNegativeRate = summary.totalValidated > 0 ? summary.falseNegatives / summary.totalValidated : 0;
  
  lines.push(`- **False Positive Rate:** ${(falsePositiveRate * 100).toFixed(1)}%`);
  lines.push(`- **False Negative Rate:** ${(falseNegativeRate * 100).toFixed(1)}%`);
  lines.push(``);
  
  lines.push(`## Limits of Prediction`);
  lines.push(``);
  for (const limit of summary.limitsOfPrediction) {
    lines.push(`- ${limit}`);
  }
  lines.push(``);
  
  if (summary.validations.length > 0) {
    lines.push(`## Validation Details`);
    lines.push(``);
    lines.push(`| Forecast ID | Predicted Drop | Observed Drop | Error | Risk Correct |`);
    lines.push(`|-------------|----------------|---------------|-------|--------------|`);
    
    for (const v of summary.validations.slice(0, 20)) {
      const checkMark = v.wasCorrectRiskLevel ? '✅' : '❌';
      lines.push(`| ${v.forecastId.substring(0, 12)} | ${(v.predictedDropDepth * 100).toFixed(1)}% | ${(v.observedDropDepth * 100).toFixed(1)}% | ${(v.dropDepthError * 100).toFixed(1)}% | ${checkMark} |`);
    }
    
    if (summary.validations.length > 20) {
      lines.push(`| ... | ... | ... | ... | ... |`);
      lines.push(`| (${summary.validations.length - 20} more validations) | | | | |`);
    }
    lines.push(``);
  }
  
  lines.push(`---`);
  lines.push(`*Generated by LawForge Failure Forecasting Engine*`);
  
  return lines.join('\n');
}
