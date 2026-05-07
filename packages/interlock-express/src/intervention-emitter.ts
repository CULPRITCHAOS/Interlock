/**
 * Intervention Event Emitter
 * ===========================
 * Emits intervention events when circuit breaker acts.
 */

import {
    InterventionEvent,
    Domain,
    TriggerType,
    ActionType,
    CircuitStateUpper,
    getHardwareFingerprint,
    mapToSDETriggerType,
    mapToSDEActionType,
    mapToSDEState
} from '../../../services/events.types.ts';
import { stampEvent } from '../../../services/kernel/eventStamp.ts';
import { getJsonlSink } from './jsonl-sink.ts';
import type { RuntimeGraceSnapshot } from './runtime-grace.ts';

export interface InterventionEventData {
    domain: Domain;
    trigger: {
        interlockTrigger: string;
        thresholdMs: number;
        observedMs: number;
        confidence: number;
    };
    action: {
        interlockAction: string;
        priorState: string;
        newState: string;
    };
    recovery: {
        timeMs: number;
        probeAttempts: number;
        finalState: string;
    };
    context?: {
        qualityFloorHit?: boolean;
        trustDecayRate?: number;
        windowDurationMs?: number;
    };
    grace?: RuntimeGraceSnapshot;
}

/**
 * Build and emit an intervention event
 */
export function emitInterventionEvent(data: InterventionEventData): void {
    const event = stampEvent({
        event_type: 'intervention',
        schema_version: '1.0.0',
        timestamp: new Date().toISOString(),
        domain: data.domain,
        hardware_fingerprint: getHardwareFingerprint(),
        runtime_phase: data.grace?.runtime_phase,
        grace_active: data.grace?.grace_active,
        grace_reason: data.grace?.grace_reason,
        grace_request_index: data.grace?.grace_request_index,
        grace_elapsed_ms: data.grace?.grace_elapsed_ms,
        active_latency_threshold_ms: data.grace?.active_latency_threshold_ms,
        steady_state_latency_threshold_ms: data.grace?.steady_state_latency_threshold_ms,
        trigger: {
            type: mapToSDETriggerType(data.trigger.interlockTrigger),
            threshold_ms: data.trigger.thresholdMs,
            observed_ms: data.trigger.observedMs,
            confidence: data.trigger.confidence
        },
        action: {
            type: mapToSDEActionType(data.action.interlockAction),
            prior_state: mapToSDEState(data.action.priorState),
            new_state: mapToSDEState(data.action.newState)
        },
        recovery: {
            time_ms: data.recovery.timeMs,
            probe_attempts: data.recovery.probeAttempts,
            final_state: mapToSDEState(data.recovery.finalState)
        }
    }) as InterventionEvent;

    if (data.context) {
        event.context = {
            quality_floor_hit: data.context.qualityFloorHit,
            trust_decay_rate: data.context.trustDecayRate,
            window_duration_ms: data.context.windowDurationMs
        };
    }

    const sink = getJsonlSink();
    sink.emit(event);

    console.log(`[Interlock] Intervention emitted: ${event.trigger.type} → ${event.action.type}`);
}
