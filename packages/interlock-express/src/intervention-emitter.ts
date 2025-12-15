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
import { getJsonlSink } from './jsonl-sink.ts';

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
}

/**
 * Build and emit an intervention event
 */
export function emitInterventionEvent(data: InterventionEventData): void {
    const event: InterventionEvent = {
        event_type: 'intervention',
        schema_version: '1.0.0',
        timestamp: new Date().toISOString(),
        domain: data.domain,
        hardware_fingerprint: getHardwareFingerprint(),
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
    };

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
