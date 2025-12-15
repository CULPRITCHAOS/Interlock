/**
 * Interlock ↔ SDE Event Types
 * ============================
 * TypeScript types matching SDE's interlock_event.schema.json
 * 
 * Event Types:
 * - intervention: Emitted when circuit breaker acts
 * - health_window: Emitted periodically for liveness/negative evidence
 */

import * as os from 'os';
import * as crypto from 'crypto';

// ============= Domain Types =============

export type Domain = 'ollama' | 'pinecone' | 'faiss' | 'chromadb' | 'weaviate' | 'qdrant' | 'milvus';

export type CircuitStateUpper = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

export type TriggerType =
    | 'latency_threshold_exceeded'
    | 'error_rate_exceeded'
    | 'confidence_floor_breach'
    | 'trust_decay_critical';

export type ActionType = 'circuit_open' | 'degrade' | 'refuse';

// ============= Event Common Fields =============

interface EventBase {
    schema_version: '1.0.0';
    timestamp: string; // ISO 8601
    domain: Domain;
    hardware_fingerprint: string;
}

// ============= Intervention Event =============

export interface InterventionTrigger {
    type: TriggerType;
    threshold_ms: number;
    observed_ms: number;
    confidence: number; // 0-1
}

export interface InterventionAction {
    type: ActionType;
    prior_state: CircuitStateUpper;
    new_state: CircuitStateUpper;
}

export interface InterventionRecovery {
    time_ms: number;
    probe_attempts: number;
    final_state: CircuitStateUpper;
}

export interface InterventionContext {
    quality_floor_hit?: boolean;
    trust_decay_rate?: number;
    window_duration_ms?: number;
}

export interface InterventionEvent extends EventBase {
    event_type: 'intervention';
    trigger: InterventionTrigger;
    action: InterventionAction;
    recovery: InterventionRecovery;
    context?: InterventionContext;
}

// ============= Health Window Event =============

export interface HealthWindow {
    start: string; // ISO 8601
    end: string;   // ISO 8601
    duration_ms: number;
}

export interface HealthMetrics {
    latency_p95_ms: number;
    latency_max_ms: number;
    error_rate: number;
    request_count: number;
}

export interface HealthThresholds {
    latency_threshold_ms: number;
    error_threshold_pct: number;
}

export interface HealthMargin {
    latency_headroom_ms?: number;
    description?: string;
}

export interface HealthWindowEvent extends EventBase {
    event_type: 'health_window';
    window: HealthWindow;
    metrics: HealthMetrics;
    thresholds: HealthThresholds;
    margin?: HealthMargin;
}

// ============= Union Type =============

export type InterlockEvent = InterventionEvent | HealthWindowEvent;

// ============= Hardware Fingerprint Utility =============

let cachedFingerprint: string | null = null;

/**
 * Generate a stable hardware fingerprint from system info
 */
export function getHardwareFingerprint(): string {
    if (cachedFingerprint) return cachedFingerprint;

    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
    const cpuCores = os.cpus().length;

    const raw = `${totalMemMb}|${cpuCores}`;
    cachedFingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);

    return cachedFingerprint;
}

/**
 * Get raw hardware info for debugging/display
 */
export function getHardwareInfo(): { total_mem_mb: number; cpu_cores: number } {
    return {
        total_mem_mb: Math.round(os.totalmem() / (1024 * 1024)),
        cpu_cores: os.cpus().length
    };
}

// ============= Trigger Mapping =============

/**
 * Map Interlock's internal trigger strings to SDE trigger types
 */
export function mapToSDETriggerType(interlockTrigger: string): TriggerType {
    const lower = interlockTrigger.toLowerCase();

    if (lower.includes('reflex') || lower.includes('flash') || lower.includes('latency')) {
        return 'latency_threshold_exceeded';
    }
    if (lower.includes('error') || lower.includes('hazard')) {
        return 'error_rate_exceeded';
    }
    if (lower.includes('quality') || lower.includes('floor') || lower.includes('recall')) {
        return 'confidence_floor_breach';
    }
    if (lower.includes('decay') || lower.includes('confidence') || lower.includes('trust')) {
        return 'trust_decay_critical';
    }

    // Default to latency threshold
    return 'latency_threshold_exceeded';
}

/**
 * Map Interlock's action strings to SDE action types
 */
export function mapToSDEActionType(interlockAction: string): ActionType {
    const lower = interlockAction.toLowerCase();

    if (lower.includes('open') || lower.includes('circuit')) {
        return 'circuit_open';
    }
    if (lower.includes('refuse') || lower.includes('reject')) {
        return 'refuse';
    }

    return 'degrade';
}

/**
 * Map Interlock's state to uppercase SDE format
 */
export function mapToSDEState(state: string): CircuitStateUpper {
    const lower = state.toLowerCase();
    if (lower === 'open') return 'OPEN';
    if (lower === 'half_open' || lower === 'half-open') return 'HALF_OPEN';
    return 'CLOSED';
}
