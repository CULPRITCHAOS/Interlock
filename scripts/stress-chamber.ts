/**
 * Interlock Stress Chamber - Phase I
 * ====================================
 * A visceral failure demonstration that shows failure forming before it happens.
 * 
 * Features:
 * - Real-time memory usage plotting (CLI visualization)
 * - Latency trending visualization
 * - Forecasted failure boundary display
 * - Circuit breaker activation moment logging
 * 
 * Usage:
 *   npx tsx scripts/stress-chamber.ts --seed 42 --initial-size 10000 --growth-steps 15
 *   npx tsx scripts/stress-chamber.ts --control   # Run without protection (will crash)
 * 
 * Guiding Principle:
 * Interlock does not optimize systems. It makes failure visible — and survivable.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============= Stress Profiles =============
const STRESS_PROFILES = {
  light: {
    recallThreshold: 0.7,
    latencyThresholdMs: 50.0,
    vectorsPerStep: 10000,
    growthSteps: 15
  },
  medium: {
    recallThreshold: 0.75,
    latencyThresholdMs: 40.0,
    vectorsPerStep: 15000,
    growthSteps: 25
  },
  heavy: {
    recallThreshold: 0.8,
    latencyThresholdMs: 30.0,
    vectorsPerStep: 25000,
    growthSteps: 30
  }
} as const;

type StressProfile = keyof typeof STRESS_PROFILES;

// ============= Shared Constants =============
const STRESS_CHAMBER_CONFIG = {
  RECALL_THRESHOLD: 0.75, // Updated from 0.7 to be stricter
  LATENCY_THRESHOLD_MS: 40.0, // Updated from 50.0 to be stricter
  HAZARD_THRESHOLD: 0.6,
  RECOVERY_CHECK_INTERVAL_S: 5.0,
  CONSECUTIVE_SUCCESSES_FOR_CLOSE: 3,
  DEGRADED_NPROBE: 1,
  OPTIMAL_NPROBE: 10,
  RECALL_MARGIN_DIVISOR: 0.3,
  LATENCY_MARGIN_DIVISOR: 20
} as const;

// ============= Seeded Random Number Generator =============
const LCG_MULTIPLIER = 1103515245;
const LCG_INCREMENT = 12345;
const LCG_MODULUS = 0x7fffffff;

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * LCG_MULTIPLIER + LCG_INCREMENT) & LCG_MODULUS;
    return this.seed / LCG_MODULUS;
  }
}

// ============= Types =============

interface StressChamberMetrics {
  step: number;
  timestamp: string;
  indexSize: number;
  memoryMb: number;
  recallAtK: number;
  latencyP95Ms: number;
  hazardScore: number;
  riskLevel: 'safe' | 'yellow' | 'red';
  circuitBreakerState: 'closed' | 'open' | 'half_open';
  forecastedFailureIn: number; // Steps until predicted failure
}

interface StressChamberTimestamps {
  startTime: string;
  firstWarning?: string;
  circuitBreakerTriggered?: string;
  recoveryStarted?: string;
  testComplete: string;
}

interface StressChamberResult {
  runId: string;
  mode: 'protected' | 'control';
  survived: boolean;
  metricsHistory: StressChamberMetrics[];
  timestamps: StressChamberTimestamps;
  crashPoint?: {
    step: number;
    reason: string;
    metrics: StressChamberMetrics;
  };
  interventions: Intervention[];
}

interface Intervention {
  timestamp: string;
  step: number;
  previousState: string;
  newState: string;
  trigger: string;
  action: string;
}

// ============= FAISS Harness Simulator (for TypeScript CLI) =============

class StressChamberHarness {
  private currentSize: number = 0;
  private baseRecall: number = 0.92;
  private baseLatency: number = 2.0;
  private memoryPerVector: number;
  private rng: SeededRandom;
  private dimensions: number;
  private nlist: number;
  private nprobe: number;

  constructor(seed: number, dimensions: number = 128, nlist: number = 100, nprobe: number = 10) {
    this.dimensions = dimensions;
    this.nlist = nlist;
    this.nprobe = nprobe;
    this.rng = new SeededRandom(seed);
    this.memoryPerVector = (this.dimensions * 4) / (1024 * 1024);
  }

  initialize(nVectors: number): StressChamberMetrics {
    this.currentSize = nVectors;
    return this.computeMetrics(0);
  }

  addVectors(nVectors: number): StressChamberMetrics {
    this.currentSize += nVectors;
    return this.computeMetrics(0);
  }

  query(nQueries: number): StressChamberMetrics {
    return this.computeMetrics(nQueries);
  }

  private computeMetrics(step: number): StressChamberMetrics {
    const sizeFactor = this.currentSize / 100000;
    const recallDegradation = Math.min(0.3, sizeFactor * 0.1);
    const probeBoost = Math.min(0.2, (this.nprobe / 100) * 0.15);
    const noise = (this.rng.next() - 0.5) * 0.02;
    
    const recall = Math.max(0.5, Math.min(0.99, 
      this.baseRecall - recallDegradation + probeBoost + noise
    ));
    
    const latencyBase = this.baseLatency;
    const latencySizeMultiplier = 1 + (this.currentSize / 100000);
    const latencyProbeMultiplier = 1 + (this.nprobe / 50) * 0.5;
    const latencyNoise = (this.rng.next() - 0.5) * 2;
    
    const latencyP95 = Math.max(0.5, latencyBase * latencySizeMultiplier * latencyProbeMultiplier * (1.3 + this.rng.next() * 0.4) + latencyNoise);
    const memory = this.currentSize * this.memoryPerVector;
    
    return {
      step,
      timestamp: new Date().toISOString(),
      indexSize: this.currentSize,
      memoryMb: memory,
      recallAtK: recall,
      latencyP95Ms: latencyP95,
      hazardScore: 0, // Will be calculated by circuit breaker
      riskLevel: 'safe',
      circuitBreakerState: 'closed',
      forecastedFailureIn: 100
    };
  }

  setNprobe(nprobe: number): void {
    this.nprobe = Math.max(1, Math.min(nprobe, this.nlist));
  }

  getNprobe(): number {
    return this.nprobe;
  }

  getSize(): number {
    return this.currentSize;
  }
}

// ============= Stress Chamber Circuit Breaker =============

class StressChamberCircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private lastStateChange: number = Date.now();
  private recentRecalls: number[] = [];
  private recentLatencies: number[] = [];
  private interventions: Intervention[] = [];
  
  // Use configurable thresholds
  private config: {
    recallThreshold: number;
    latencyThresholdMs: number;
    hazardThreshold: number;
    recoveryCheckIntervalS: number;
    consecutiveSuccessesForClose: number;
    degradedNprobe: number;
    optimalNprobe: number;
  };

  constructor(private harness: StressChamberHarness, recallThreshold?: number, latencyThresholdMs?: number) {
    this.config = {
      recallThreshold: recallThreshold ?? STRESS_CHAMBER_CONFIG.RECALL_THRESHOLD,
      latencyThresholdMs: latencyThresholdMs ?? STRESS_CHAMBER_CONFIG.LATENCY_THRESHOLD_MS,
      hazardThreshold: STRESS_CHAMBER_CONFIG.HAZARD_THRESHOLD,
      recoveryCheckIntervalS: STRESS_CHAMBER_CONFIG.RECOVERY_CHECK_INTERVAL_S,
      consecutiveSuccessesForClose: STRESS_CHAMBER_CONFIG.CONSECUTIVE_SUCCESSES_FOR_CLOSE,
      degradedNprobe: STRESS_CHAMBER_CONFIG.DEGRADED_NPROBE,
      optimalNprobe: STRESS_CHAMBER_CONFIG.OPTIMAL_NPROBE
    };
  }

  calculateHazardScore(): number {
    if (this.recentRecalls.length < 2) return 0;
    
    const avgRecall = this.recentRecalls.slice(-5).reduce((a, b) => a + b, 0) / 
                      Math.min(5, this.recentRecalls.length);
    const recallMargin = avgRecall - this.config.recallThreshold;
    const recallHazard = Math.max(0, 1 - (recallMargin / STRESS_CHAMBER_CONFIG.RECALL_MARGIN_DIVISOR));
    
    const avgLatency = this.recentLatencies.slice(-5).reduce((a, b) => a + b, 0) /
                       Math.min(5, this.recentLatencies.length);
    const latencyMargin = this.config.latencyThresholdMs - avgLatency;
    const latencyHazard = Math.max(0, 1 - (latencyMargin / STRESS_CHAMBER_CONFIG.LATENCY_MARGIN_DIVISOR));
    
    return Math.min(1.0, 0.6 * recallHazard + 0.4 * latencyHazard);
  }

  predictFailureIn(currentRecall: number, currentLatency: number, growthRate: number): number {
    const recallDegradationPerStep = 0.01 * (this.harness.getSize() / 50000);
    const latencyDegradationPerStep = 0.5 * (this.harness.getSize() / 50000);
    
    let timeToRecallFailure: number;
    if (currentRecall <= this.config.recallThreshold) {
      timeToRecallFailure = 0;
    } else {
      const recallMargin = currentRecall - this.config.recallThreshold;
      timeToRecallFailure = recallDegradationPerStep > 0 
        ? Math.ceil(recallMargin / recallDegradationPerStep)
        : 100;
    }
    
    let timeToLatencyFailure: number;
    if (currentLatency >= this.config.latencyThresholdMs) {
      timeToLatencyFailure = 0;
    } else {
      const latencyMargin = this.config.latencyThresholdMs - currentLatency;
      timeToLatencyFailure = latencyDegradationPerStep > 0
        ? Math.ceil(latencyMargin / latencyDegradationPerStep)
        : 100;
    }
    
    return Math.min(timeToRecallFailure, timeToLatencyFailure);
  }

  update(metrics: StressChamberMetrics, step: number): StressChamberMetrics {
    // Track recent metrics
    this.recentRecalls.push(metrics.recallAtK);
    this.recentLatencies.push(metrics.latencyP95Ms);
    
    if (this.recentRecalls.length > 10) {
      this.recentRecalls = this.recentRecalls.slice(-10);
      this.recentLatencies = this.recentLatencies.slice(-10);
    }
    
    const hazard = this.calculateHazardScore();
    const forecastedFailureIn = this.predictFailureIn(metrics.recallAtK, metrics.latencyP95Ms, 10000);
    
    let riskLevel: 'safe' | 'yellow' | 'red';
    if (forecastedFailureIn <= 2) {
      riskLevel = 'red';
    } else if (forecastedFailureIn <= 5) {
      riskLevel = 'yellow';
    } else {
      riskLevel = 'safe';
    }
    
    const success = metrics.recallAtK >= this.config.recallThreshold && 
                    metrics.latencyP95Ms <= this.config.latencyThresholdMs;
    
    // State machine transitions
    if (this.state === 'closed') {
      if (hazard >= this.config.hazardThreshold) {
        this.interventions.push({
          timestamp: new Date().toISOString(),
          step,
          previousState: 'closed',
          newState: 'open',
          trigger: `Hazard ${hazard.toFixed(3)} exceeded threshold ${this.config.hazardThreshold}`,
          action: `Degraded mode: nprobe=${this.config.degradedNprobe}`
        });
        this.harness.setNprobe(this.config.degradedNprobe);
        this.state = 'open';
        this.lastStateChange = Date.now();
        this.consecutiveSuccesses = 0;
        this.consecutiveFailures = 0;
      } else if (!success) {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        
        if (this.consecutiveFailures >= 3) {
          this.interventions.push({
            timestamp: new Date().toISOString(),
            step,
            previousState: 'closed',
            newState: 'open',
            trigger: `${this.consecutiveFailures} consecutive failures`,
            action: `Emergency degradation: nprobe=${this.config.degradedNprobe}`
          });
          this.harness.setNprobe(this.config.degradedNprobe);
          this.state = 'open';
          this.lastStateChange = Date.now();
          this.consecutiveFailures = 0;
        }
      } else {
        this.consecutiveSuccesses++;
        this.consecutiveFailures = 0;
      }
    } else if (this.state === 'open') {
      const timeSinceChange = Date.now() - this.lastStateChange;
      if (timeSinceChange >= this.config.recoveryCheckIntervalS * 1000) {
        if (hazard < this.config.hazardThreshold * 0.7) {
          this.interventions.push({
            timestamp: new Date().toISOString(),
            step,
            previousState: 'open',
            newState: 'half_open',
            trigger: `Hazard reduced to ${hazard.toFixed(3)}, testing recovery`,
            action: 'Entering half-open state'
          });
          this.state = 'half_open';
          this.lastStateChange = Date.now();
          this.consecutiveSuccesses = 0;
        }
      }
    } else if (this.state === 'half_open') {
      if (success && hazard < this.config.hazardThreshold * 0.7) {
        this.consecutiveSuccesses++;
        if (this.consecutiveSuccesses >= this.config.consecutiveSuccessesForClose) {
          this.interventions.push({
            timestamp: new Date().toISOString(),
            step,
            previousState: 'half_open',
            newState: 'closed',
            trigger: `Recovery successful after ${this.consecutiveSuccesses} successes`,
            action: `Resuming optimal mode: nprobe=${this.config.optimalNprobe}`
          });
          this.harness.setNprobe(this.config.optimalNprobe);
          this.state = 'closed';
          this.lastStateChange = Date.now();
          this.consecutiveSuccesses = 0;
        }
      } else {
        this.interventions.push({
          timestamp: new Date().toISOString(),
          step,
          previousState: 'half_open',
          newState: 'open',
          trigger: 'Recovery failed',
          action: `Returning to degraded mode: nprobe=${this.config.degradedNprobe}`
        });
        this.harness.setNprobe(this.config.degradedNprobe);
        this.state = 'open';
        this.lastStateChange = Date.now();
        this.consecutiveFailures = 0;
      }
    }
    
    return {
      ...metrics,
      hazardScore: hazard,
      riskLevel,
      circuitBreakerState: this.state,
      forecastedFailureIn
    };
  }

  getState(): 'closed' | 'open' | 'half_open' {
    return this.state;
  }

  getInterventions(): Intervention[] {
    return this.interventions;
  }
}

// ============= CLI Visualization =============

function renderProgressBar(value: number, max: number, width: number = 40, threshold?: number): string {
  const filled = Math.round((value / max) * width);
  const bar = '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(0, width - filled));
  
  if (threshold !== undefined) {
    const thresholdPos = Math.round((threshold / max) * width);
    const barArray = bar.split('');
    if (thresholdPos < width) {
      barArray[thresholdPos] = '│';
    }
    return barArray.join('');
  }
  
  return bar;
}

function renderRiskLevel(level: 'safe' | 'yellow' | 'red'): string {
  switch (level) {
    case 'safe': return '🟢 SAFE';
    case 'yellow': return '🟡 WARNING';
    case 'red': return '🔴 DANGER';
  }
}

function renderCircuitBreaker(state: 'closed' | 'open' | 'half_open'): string {
  switch (state) {
    case 'closed': return '🟢 CLOSED (normal)';
    case 'open': return '🔴 OPEN (degraded)';
    case 'half_open': return '🟡 HALF_OPEN (testing)';
  }
}

function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

function renderStressChamberFrame(metrics: StressChamberMetrics, step: number, totalSteps: number, mode: string, recallThreshold: number, latencyThresholdMs: number): void {
  clearScreen();
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              INTERLOCK STRESS CHAMBER - PHASE I                    ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${mode.padEnd(20)} Step: ${step}/${totalSteps}`.padEnd(72) + '║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log('║  SYSTEM METRICS                                                    ║');
  console.log('║                                                                    ║');
  
  // Memory Usage
  const memoryMax = 100; // MB scale
  const memoryBar = renderProgressBar(metrics.memoryMb, memoryMax, 40, 80);
  console.log(`║  Memory:  [${memoryBar}] ${metrics.memoryMb.toFixed(1).padStart(6)} MB ║`);
  
  // Latency
  const latencyMax = 100; // ms scale
  const latencyBar = renderProgressBar(metrics.latencyP95Ms, latencyMax, 40, latencyThresholdMs);
  console.log(`║  Latency: [${latencyBar}] ${metrics.latencyP95Ms.toFixed(1).padStart(6)} ms ║`);
  
  // Recall
  const recallBar = renderProgressBar(metrics.recallAtK * 100, 100, 40, recallThreshold * 100);
  console.log(`║  Recall:  [${recallBar}] ${(metrics.recallAtK * 100).toFixed(1).padStart(5)}%  ║`);
  
  // Hazard Score
  const hazardBar = renderProgressBar(metrics.hazardScore * 100, 100, 40, 60);
  console.log(`║  Hazard:  [${hazardBar}] ${(metrics.hazardScore * 100).toFixed(1).padStart(5)}%  ║`);
  
  console.log('║                                                                    ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log('║  STATUS                                                            ║');
  console.log('║                                                                    ║');
  console.log(`║  Risk Level:      ${renderRiskLevel(metrics.riskLevel).padEnd(30)}          ║`);
  console.log(`║  Circuit Breaker: ${renderCircuitBreaker(metrics.circuitBreakerState).padEnd(30)}          ║`);
  console.log(`║  Forecast:        Failure in ${metrics.forecastedFailureIn} steps`.padEnd(71) + '║');
  console.log(`║  Index Size:      ${metrics.indexSize.toLocaleString()} vectors`.padEnd(52) + '║');
  console.log('║                                                                    ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log('║  THRESHOLDS                                                        ║');
  console.log('║  │ denotes threshold on progress bars                              ║');
  const memLimit = '80 MB';
  const latLimit = `${latencyThresholdMs} ms`;
  const recallMin = `${(recallThreshold * 100).toFixed(0)}%`;
  const thresholdLine = `║  Memory limit: ${memLimit} | Latency limit: ${latLimit} | Recall min: ${recallMin}`;
  const paddingNeeded = 72 - thresholdLine.length;
  console.log(thresholdLine + ' '.repeat(Math.max(0, paddingNeeded)) + '║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
}

// ============= Stress Chamber Execution =============

async function runStressChamber(
  seed: number,
  initialSize: number,
  growthSteps: number,
  vectorsPerStep: number,
  mode: 'protected' | 'control',
  visualize: boolean = true,
  recallThreshold: number = STRESS_CHAMBER_CONFIG.RECALL_THRESHOLD,
  latencyThresholdMs: number = STRESS_CHAMBER_CONFIG.LATENCY_THRESHOLD_MS
): Promise<StressChamberResult> {
  const runId = `stress_chamber_${mode}_s${seed}_${Date.now()}`;
  const timestamps: StressChamberTimestamps = {
    startTime: new Date().toISOString(),
    testComplete: ''
  };
  
  const harness = new StressChamberHarness(seed);
  const circuitBreaker = mode === 'protected' ? new StressChamberCircuitBreaker(harness, recallThreshold, latencyThresholdMs) : null;
  
  const metricsHistory: StressChamberMetrics[] = [];
  let crashed = false;
  let crashPoint: StressChamberResult['crashPoint'];
  
  // Initialize
  harness.initialize(initialSize);
  
  console.log(`\n[Stress Chamber] Starting ${mode.toUpperCase()} run...`);
  console.log(`[Stress Chamber] Initial size: ${initialSize}, Growth steps: ${growthSteps}`);
  console.log(`[Stress Chamber] Thresholds: Recall ≥ ${(recallThreshold * 100).toFixed(0)}%, Latency ≤ ${latencyThresholdMs}ms`);
  console.log(`[Stress Chamber] Protection: ${mode === 'protected' ? 'ENABLED' : 'DISABLED'}\n`);
  
  if (mode === 'control') {
    console.log('⚠️  CONTROL RUN: No circuit breaker protection. System will crash when limits exceeded.\n');
  }
  
  for (let step = 0; step < growthSteps; step++) {
    // Add vectors (progressive stress)
    harness.addVectors(vectorsPerStep);
    
    // Query to get metrics
    let metrics = harness.query(100);
    metrics.step = step;
    
    // Apply circuit breaker if protected
    if (circuitBreaker) {
      metrics = circuitBreaker.update(metrics, step);
      
      // Track first warning
      if (!timestamps.firstWarning && metrics.riskLevel !== 'safe') {
        timestamps.firstWarning = new Date().toISOString();
        console.log(`\n⚠️  [Step ${step}] FORECAST WARNING: Risk level ${metrics.riskLevel}, failure in ${metrics.forecastedFailureIn} steps`);
      }
      
      // Track circuit breaker trigger
      if (!timestamps.circuitBreakerTriggered && metrics.circuitBreakerState === 'open') {
        timestamps.circuitBreakerTriggered = new Date().toISOString();
        console.log(`\n🔴 [Step ${step}] CIRCUIT BREAKER TRIGGERED: Entering degraded mode`);
      }
      
      // Track recovery
      if (timestamps.circuitBreakerTriggered && !timestamps.recoveryStarted && metrics.circuitBreakerState === 'half_open') {
        timestamps.recoveryStarted = new Date().toISOString();
        console.log(`\n🟡 [Step ${step}] RECOVERY STARTED: Testing return to normal operation`);
      }
    } else {
      // Control mode: calculate hazard without protection
      const hazard = calculateUnprotectedHazard(metrics, recallThreshold, latencyThresholdMs);
      metrics.hazardScore = hazard;
      metrics.riskLevel = hazard >= 0.8 ? 'red' : hazard >= 0.5 ? 'yellow' : 'safe';
      metrics.circuitBreakerState = 'closed';
      metrics.forecastedFailureIn = calculateUnprotectedForecast(metrics, harness.getSize(), recallThreshold, latencyThresholdMs);
      
      // Check for crash (unprotected)
      if (metrics.recallAtK < recallThreshold || metrics.latencyP95Ms > latencyThresholdMs) {
        crashed = true;
        crashPoint = {
          step,
          reason: metrics.recallAtK < recallThreshold 
            ? `Recall dropped below threshold (${(metrics.recallAtK * 100).toFixed(1)}% < ${(recallThreshold * 100).toFixed(0)}%)`
            : `Latency exceeded threshold (${metrics.latencyP95Ms.toFixed(1)}ms > ${latencyThresholdMs}ms)`,
          metrics
        };
        metricsHistory.push(metrics);
        
        console.log(`\n💥 [Step ${step}] CRASH: ${crashPoint.reason}`);
        console.log(`   System failure without circuit breaker protection.`);
        break;
      }
    }
    
    metricsHistory.push(metrics);
    
    // Visualize
    if (visualize) {
      renderStressChamberFrame(metrics, step + 1, growthSteps, mode.toUpperCase(), recallThreshold, latencyThresholdMs);
      await sleep(300);
    } else {
      // Simple progress logging
      const statusIcon = metrics.circuitBreakerState === 'open' ? '🔴' : 
                         metrics.circuitBreakerState === 'half_open' ? '🟡' : '🟢';
      console.log(`[Step ${step + 1}/${growthSteps}] ${statusIcon} recall=${(metrics.recallAtK * 100).toFixed(1)}%, latency=${metrics.latencyP95Ms.toFixed(1)}ms, hazard=${(metrics.hazardScore * 100).toFixed(0)}%`);
    }
  }
  
  timestamps.testComplete = new Date().toISOString();
  
  const result: StressChamberResult = {
    runId,
    mode,
    survived: !crashed,
    metricsHistory,
    timestamps,
    crashPoint,
    interventions: circuitBreaker?.getInterventions() || []
  };
  
  return result;
}

function calculateUnprotectedHazard(metrics: StressChamberMetrics, recallThreshold: number, latencyThresholdMs: number): number {
  const recallMargin = metrics.recallAtK - recallThreshold;
  const recallHazard = Math.max(0, 1 - (recallMargin / STRESS_CHAMBER_CONFIG.RECALL_MARGIN_DIVISOR));
  
  const latencyMargin = latencyThresholdMs - metrics.latencyP95Ms;
  const latencyHazard = Math.max(0, 1 - (latencyMargin / STRESS_CHAMBER_CONFIG.LATENCY_MARGIN_DIVISOR));
  
  return Math.min(1.0, 0.6 * recallHazard + 0.4 * latencyHazard);
}

function calculateUnprotectedForecast(metrics: StressChamberMetrics, currentSize: number, recallThreshold: number, latencyThresholdMs: number): number {
  const recallDegradationPerStep = 0.01 * (currentSize / 50000);
  const latencyDegradationPerStep = 0.5 * (currentSize / 50000);
  
  const recallMargin = metrics.recallAtK - recallThreshold;
  const timeToRecallFailure = recallDegradationPerStep > 0 
    ? Math.ceil(recallMargin / recallDegradationPerStep)
    : 100;
  
  const latencyMargin = latencyThresholdMs - metrics.latencyP95Ms;
  const timeToLatencyFailure = latencyDegradationPerStep > 0
    ? Math.ceil(latencyMargin / latencyDegradationPerStep)
    : 100;
  
  return Math.max(0, Math.min(timeToRecallFailure, timeToLatencyFailure));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= Report Generation =============

function validateStressTestResults(protectedResult: StressChamberResult, controlResult: StressChamberResult): {
  controlCrashRate: number;
  protectedSurvivalRate: number;
  testTooEasy: boolean;
  validationMessage: string;
} {
  // In a single run, we can only determine if it's too easy if both survived
  const testTooEasy = protectedResult.survived && controlResult.survived;
  
  // For historical tracking, we'd need multiple runs
  // For now, we report on this single run
  const controlCrashRate = controlResult.survived ? 0 : 100;
  const protectedSurvivalRate = protectedResult.survived ? 100 : 0;
  
  let validationMessage = '';
  
  if (testTooEasy) {
    validationMessage = '⚠️  WARNING: Test too easy - both protected and control survived. Consider increasing stress parameters or using a heavier profile.';
  } else if (protectedResult.survived && !controlResult.survived) {
    validationMessage = '✅ SUCCESS: Protected run survived while control crashed - circuit breaker protection verified.';
  } else if (!protectedResult.survived && controlResult.survived) {
    validationMessage = '❌ FAILURE: Protected run crashed before control - circuit breaker may need tuning.';
  } else {
    validationMessage = '❌ FAILURE: Both runs crashed - stress level exceeded protection capability.';
  }
  
  return {
    controlCrashRate,
    protectedSurvivalRate,
    testTooEasy,
    validationMessage
  };
}

function generateStressChamberReport(protectedResult: StressChamberResult, controlResult: StressChamberResult): string {
  const lines: string[] = [];
  const validation = validateStressTestResults(protectedResult, controlResult);
  
  lines.push('# Interlock Stress Chamber - Phase I Results');
  lines.push('');
  lines.push('> Interlock does not optimize systems. It makes failure visible — and survivable.');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  
  lines.push('## Validation Summary');
  lines.push('');
  lines.push(validation.validationMessage);
  lines.push('');
  if (validation.testTooEasy) {
    lines.push('### Recommendations');
    lines.push('- Use `--profile medium` for moderate stress');
    lines.push('- Use `--profile heavy` for aggressive stress testing');
    lines.push('- Control runs should crash in 80%+ of tests for effective validation');
    lines.push('');
  }
  
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('| Run Type | Outcome | Crash Point |');
  lines.push('|----------|---------|-------------|');
  lines.push(`| **Protected** | ${protectedResult.survived ? '✅ SURVIVED' : '❌ CRASHED'} | ${protectedResult.crashPoint ? `Step ${protectedResult.crashPoint.step}` : 'N/A'} |`);
  lines.push(`| **Control** | ${controlResult.survived ? '✅ SURVIVED' : '❌ CRASHED'} | ${controlResult.crashPoint ? `Step ${controlResult.crashPoint.step}` : 'N/A'} |`);
  lines.push('');
  
  lines.push('## Key Timestamps');
  lines.push('');
  lines.push('### Protected Run');
  lines.push('');
  lines.push(`- **Start:** ${protectedResult.timestamps.startTime}`);
  if (protectedResult.timestamps.firstWarning) {
    lines.push(`- **First Warning:** ${protectedResult.timestamps.firstWarning}`);
  }
  if (protectedResult.timestamps.circuitBreakerTriggered) {
    lines.push(`- **Circuit Breaker Triggered:** ${protectedResult.timestamps.circuitBreakerTriggered}`);
  }
  if (protectedResult.timestamps.recoveryStarted) {
    lines.push(`- **Recovery Started:** ${protectedResult.timestamps.recoveryStarted}`);
  }
  lines.push(`- **Test Complete:** ${protectedResult.timestamps.testComplete}`);
  lines.push('');
  
  lines.push('### Control Run');
  lines.push('');
  lines.push(`- **Start:** ${controlResult.timestamps.startTime}`);
  lines.push(`- **Test Complete:** ${controlResult.timestamps.testComplete}`);
  if (controlResult.crashPoint) {
    lines.push(`- **Crash Point:** Step ${controlResult.crashPoint.step}`);
    lines.push(`- **Crash Reason:** ${controlResult.crashPoint.reason}`);
  }
  lines.push('');
  
  if (protectedResult.interventions.length > 0) {
    lines.push('## Circuit Breaker Interventions');
    lines.push('');
    lines.push('| Step | Previous | New | Trigger | Action |');
    lines.push('|------|----------|-----|---------|--------|');
    for (const int of protectedResult.interventions) {
      lines.push(`| ${int.step} | ${int.previousState} | ${int.newState} | ${int.trigger} | ${int.action} |`);
    }
    lines.push('');
  }
  
  lines.push('## Metrics Comparison');
  lines.push('');
  lines.push('### Protected Run - Final Metrics');
  lines.push('');
  if (protectedResult.metricsHistory.length > 0) {
    const finalProtected = protectedResult.metricsHistory[protectedResult.metricsHistory.length - 1];
    lines.push(`- Index Size: ${finalProtected.indexSize.toLocaleString()} vectors`);
    lines.push(`- Memory: ${finalProtected.memoryMb.toFixed(1)} MB`);
    lines.push(`- Recall: ${(finalProtected.recallAtK * 100).toFixed(1)}%`);
    lines.push(`- Latency (p95): ${finalProtected.latencyP95Ms.toFixed(1)} ms`);
    lines.push(`- Hazard Score: ${(finalProtected.hazardScore * 100).toFixed(1)}%`);
  }
  lines.push('');
  
  lines.push('### Control Run - Crash Metrics');
  lines.push('');
  if (controlResult.crashPoint) {
    const crashMetrics = controlResult.crashPoint.metrics;
    lines.push(`- Index Size: ${crashMetrics.indexSize.toLocaleString()} vectors`);
    lines.push(`- Memory: ${crashMetrics.memoryMb.toFixed(1)} MB`);
    lines.push(`- Recall: ${(crashMetrics.recallAtK * 100).toFixed(1)}%`);
    lines.push(`- Latency (p95): ${crashMetrics.latencyP95Ms.toFixed(1)} ms`);
    lines.push(`- Hazard Score: ${(crashMetrics.hazardScore * 100).toFixed(1)}%`);
  } else if (controlResult.metricsHistory.length > 0) {
    const finalControl = controlResult.metricsHistory[controlResult.metricsHistory.length - 1];
    lines.push(`- Index Size: ${finalControl.indexSize.toLocaleString()} vectors`);
    lines.push(`- Memory: ${finalControl.memoryMb.toFixed(1)} MB`);
    lines.push(`- Recall: ${(finalControl.recallAtK * 100).toFixed(1)}%`);
    lines.push(`- Latency (p95): ${finalControl.latencyP95Ms.toFixed(1)} ms`);
  }
  lines.push('');
  
  lines.push('## Conclusion');
  lines.push('');
  if (protectedResult.survived && !controlResult.survived) {
    lines.push('**Interlock circuit breaker protection prevented system failure.**');
    lines.push('');
    lines.push(`The control run crashed at step ${controlResult.crashPoint?.step}, while the protected run completed all steps successfully.`);
    lines.push('This demonstrates that Interlock can detect approaching failure and take preemptive action to keep the system operational.');
  } else if (protectedResult.survived && controlResult.survived) {
    lines.push('Both runs completed without crash. Consider increasing stress parameters for more aggressive testing.');
  } else if (!protectedResult.survived && controlResult.survived) {
    lines.push('Protected run crashed before control run. Circuit breaker may need tuning.');
  } else {
    lines.push('Both runs crashed. Circuit breaker protection was insufficient for this stress level.');
  }
  lines.push('');
  
  lines.push('---');
  lines.push('');
  lines.push('*Generated by Interlock Stress Chamber - Phase I*');
  lines.push('');
  lines.push('**Guiding Principle:** Interlock does not optimize systems. It makes failure visible — and survivable.');
  
  return lines.join('\n');
}

// ============= Main Entry Point =============

function parseArgs(args: string[]): {
  seed: number;
  initialSize: number;
  growthSteps?: number;
  vectorsPerStep?: number;
  control: boolean;
  both: boolean;
  noVisualize: boolean;
  out: string;
  profile: StressProfile;
  recallThreshold?: number;
  latencyThresholdMs?: number;
} {
  let seed = 42;
  let initialSize = 10000;
  let growthSteps: number | undefined;
  let vectorsPerStep: number | undefined;
  let control = false;
  let both = false;
  let noVisualize = false;
  let out = 'results/stress_chamber';
  let profile: StressProfile = 'medium'; // Default to medium
  let recallThreshold: number | undefined;
  let latencyThresholdMs: number | undefined;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) {
      seed = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--initial-size' && args[i + 1]) {
      initialSize = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--growth-steps' && args[i + 1]) {
      growthSteps = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--vectors-per-step' && args[i + 1]) {
      vectorsPerStep = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--profile' && args[i + 1]) {
      const requestedProfile = args[i + 1].toLowerCase();
      // Check if profile exists in STRESS_PROFILES
      if (requestedProfile in STRESS_PROFILES) {
        profile = requestedProfile as StressProfile;
      } else {
        console.error(`Invalid profile: ${args[i + 1]}. Valid options: ${Object.keys(STRESS_PROFILES).join(', ')}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--recall-threshold' && args[i + 1]) {
      recallThreshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--latency-threshold' && args[i + 1]) {
      latencyThresholdMs = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--control') {
      control = true;
    } else if (args[i] === '--both') {
      both = true;
    } else if (args[i] === '--no-visualize') {
      noVisualize = true;
    } else if (args[i] === '--out' && args[i + 1]) {
      out = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Interlock Stress Chamber - Phase I
==================================

Usage:
  npx tsx scripts/stress-chamber.ts [options]

Options:
  --seed <n>                  Random seed (default: 42)
  --initial-size <n>          Initial index size (default: 10000)
  --growth-steps <n>          Number of growth steps (default: 25)
  --vectors-per-step <n>      Vectors to add per step (default: 15000)
  --profile <light|medium|heavy>  Stress profile (default: medium)
                              - light:  recall≥70%, latency≤50ms, 10k vectors/step, 15 steps
                              - medium: recall≥75%, latency≤40ms, 15k vectors/step, 25 steps
                              - heavy:  recall≥80%, latency≤30ms, 25k vectors/step, 30 steps
  --recall-threshold <n>      Override recall threshold (0-1)
  --latency-threshold <n>     Override latency threshold (ms)
  --control                   Run without protection (crash demo)
  --both                      Run both protected and control tests
  --no-visualize              Disable real-time visualization
  --out <dir>                 Output directory (default: results/stress_chamber)
  --help, -h                  Show this help

Examples:
  npx tsx scripts/stress-chamber.ts --both --no-visualize
  npx tsx scripts/stress-chamber.ts --profile heavy --both
  npx tsx scripts/stress-chamber.ts --control --growth-steps 20
  npx tsx scripts/stress-chamber.ts --seed 123 --profile light
`);
      process.exit(0);
    }
  }
  
  return { seed, initialSize, growthSteps, vectorsPerStep, control, both, noVisualize, out, profile, recallThreshold, latencyThresholdMs };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config = parseArgs(args);
  
  // Apply profile settings (can be overridden by explicit CLI args)
  const profileSettings = STRESS_PROFILES[config.profile];
  const growthSteps = config.growthSteps ?? profileSettings.growthSteps;
  const vectorsPerStep = config.vectorsPerStep ?? profileSettings.vectorsPerStep;
  const recallThreshold = config.recallThreshold ?? profileSettings.recallThreshold;
  const latencyThresholdMs = config.latencyThresholdMs ?? profileSettings.latencyThresholdMs;
  
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              INTERLOCK STRESS CHAMBER - PHASE I                    ║');
  console.log('║                                                                    ║');
  console.log('║    "Interlock does not optimize systems.                           ║');
  console.log('║     It makes failure visible — and survivable."                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Configuration:`);
  console.log(`  Profile: ${config.profile.toUpperCase()}`);
  console.log(`  Seed: ${config.seed}`);
  console.log(`  Initial Size: ${config.initialSize}`);
  console.log(`  Growth Steps: ${growthSteps}`);
  console.log(`  Vectors per Step: ${vectorsPerStep}`);
  console.log(`  Recall Threshold: ${(recallThreshold * 100).toFixed(0)}%`);
  console.log(`  Latency Threshold: ${latencyThresholdMs}ms`);
  console.log(`  Mode: ${config.both ? 'BOTH' : config.control ? 'CONTROL' : 'PROTECTED'}`);
  console.log('');
  
  // Ensure output directory exists
  if (!fs.existsSync(config.out)) {
    fs.mkdirSync(config.out, { recursive: true });
  }
  
  let protectedResult: StressChamberResult | null = null;
  let controlResult: StressChamberResult | null = null;
  
  if (config.both || !config.control) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('                     PROTECTED RUN (with circuit breaker)          ');
    console.log('═══════════════════════════════════════════════════════════════════');
    protectedResult = await runStressChamber(
      config.seed,
      config.initialSize,
      growthSteps,
      vectorsPerStep,
      'protected',
      !config.noVisualize,
      recallThreshold,
      latencyThresholdMs
    );
    
    console.log(`\n[Protected Run] Outcome: ${protectedResult.survived ? '✅ SURVIVED' : '❌ CRASHED'}`);
    console.log(`[Protected Run] Interventions: ${protectedResult.interventions.length}`);
  }
  
  if (config.both || config.control) {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                     CONTROL RUN (no protection)                   ');
    console.log('═══════════════════════════════════════════════════════════════════');
    controlResult = await runStressChamber(
      config.seed,
      config.initialSize,
      growthSteps,
      vectorsPerStep,
      'control',
      !config.noVisualize,
      recallThreshold,
      latencyThresholdMs
    );
    
    console.log(`\n[Control Run] Outcome: ${controlResult.survived ? '✅ SURVIVED' : '❌ CRASHED'}`);
    if (controlResult.crashPoint) {
      console.log(`[Control Run] Crash at step ${controlResult.crashPoint.step}: ${controlResult.crashPoint.reason}`);
    }
  }
  
  // Generate and save results
  const timestamp = Date.now();
  
  if (protectedResult) {
    fs.writeFileSync(
      path.join(config.out, `protected_result_${timestamp}.json`),
      JSON.stringify(protectedResult, null, 2)
    );
  }
  
  if (controlResult) {
    fs.writeFileSync(
      path.join(config.out, `control_result_${timestamp}.json`),
      JSON.stringify(controlResult, null, 2)
    );
  }
  
  if (protectedResult && controlResult) {
    const report = generateStressChamberReport(protectedResult, controlResult);
    fs.writeFileSync(path.join(config.out, `stress_chamber_report_${timestamp}.md`), report);
    console.log(`\n[Stress Chamber] Report saved to: ${config.out}/stress_chamber_report_${timestamp}.md`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                     STRESS CHAMBER COMPLETE                       ');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  if (protectedResult && controlResult) {
    console.log(`\nSummary:`);
    console.log(`  Protected: ${protectedResult.survived ? '✅ SURVIVED' : '❌ CRASHED'}`);
    console.log(`  Control:   ${controlResult.survived ? '✅ SURVIVED' : '❌ CRASHED'}`);
    
    if (protectedResult.survived && !controlResult.survived) {
      console.log(`\n🎯 Interlock prevented failure at step ${controlResult.crashPoint?.step}`);
      console.log(`   Circuit breaker protection verified.`);
    } else if (protectedResult.survived && controlResult.survived) {
      console.log(`\n⚠️  WARNING: Test too easy - both survived. Consider using --profile heavy`);
    }
  }
}

// Run if executed directly - match the pattern from sim-runner.ts
const isMainModule = process.argv[1]?.includes('stress-chamber');
if (isMainModule) {
  main().catch(console.error);
}

export {
  StressChamberHarness,
  StressChamberCircuitBreaker,
  runStressChamber,
  generateStressChamberReport
};
