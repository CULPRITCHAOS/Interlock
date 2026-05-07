export type RuntimePhase = 'cold_start' | 'steady_state' | 'post_reset' | 'unknown';

export interface ColdStartGraceConfig {
    coldStartGraceRequests: number;
    coldStartGraceMs: number;
    steadyStateLatencyThresholdMs: number;
}

export interface RuntimeGraceSnapshot {
    runtime_phase: RuntimePhase;
    grace_active: boolean;
    grace_reason: string;
    grace_request_index: number;
    grace_elapsed_ms: number;
    active_latency_threshold_ms: number;
    steady_state_latency_threshold_ms: number;
}

interface ActiveRequest {
    graceActive: boolean;
    requestIndex: number;
}

export class RuntimeGraceTracker {
    private readonly initializedAt = Date.now();
    private requestCount = 0;
    private coldStartClosed = false;
    private postResetPending = false;

    constructor(private readonly config: ColdStartGraceConfig) { }

    startRequest(): RuntimeGraceSnapshot {
        this.expireColdStartIfNeeded();

        const phase = this.currentPhase();
        const nextRequestIndex = this.requestCount + 1;
        const graceActive = this.isColdStartGraceActive(nextRequestIndex);

        this.requestCount = nextRequestIndex;
        if (this.requestCount >= this.config.coldStartGraceRequests) {
            this.coldStartClosed = true;
        }

        return this.snapshot(phase, {
            graceActive,
            requestIndex: nextRequestIndex
        });
    }

    finishRequest(): void {
        if (this.postResetPending) {
            this.postResetPending = false;
        }
        this.expireColdStartIfNeeded();
    }

    reset(): void {
        this.coldStartClosed = true;
        this.postResetPending = true;
    }

    snapshotNow(): RuntimeGraceSnapshot {
        this.expireColdStartIfNeeded();
        return this.snapshot(this.currentPhase(), {
            graceActive: false,
            requestIndex: this.requestCount
        });
    }

    private currentPhase(): RuntimePhase {
        if (this.postResetPending) return 'post_reset';
        if (!this.coldStartClosed && this.config.coldStartGraceRequests > 0 && this.config.coldStartGraceMs > 0) {
            return 'cold_start';
        }
        return 'steady_state';
    }

    private isColdStartGraceActive(nextRequestIndex: number): boolean {
        return this.currentPhase() === 'cold_start'
            && nextRequestIndex <= this.config.coldStartGraceRequests
            && this.elapsedMs() <= this.config.coldStartGraceMs;
    }

    private expireColdStartIfNeeded(): void {
        if (this.coldStartClosed) return;
        if (this.config.coldStartGraceRequests <= 0 || this.config.coldStartGraceMs <= 0) {
            this.coldStartClosed = true;
            return;
        }
        if (this.requestCount >= this.config.coldStartGraceRequests || this.elapsedMs() > this.config.coldStartGraceMs) {
            this.coldStartClosed = true;
        }
    }

    private snapshot(phase: RuntimePhase, request: ActiveRequest): RuntimeGraceSnapshot {
        const graceReason = request.graceActive ? 'cold_start_bounded' : 'none';
        return {
            runtime_phase: phase,
            grace_active: request.graceActive,
            grace_reason: graceReason,
            grace_request_index: request.graceActive ? request.requestIndex : 0,
            grace_elapsed_ms: phase === 'cold_start' ? this.elapsedMs() : 0,
            active_latency_threshold_ms: this.config.steadyStateLatencyThresholdMs,
            steady_state_latency_threshold_ms: this.config.steadyStateLatencyThresholdMs
        };
    }

    private elapsedMs(): number {
        return Date.now() - this.initializedAt;
    }
}
