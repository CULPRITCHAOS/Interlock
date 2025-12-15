/**
 * JSONL Event Sink for SDE Integration
 * =====================================
 * Writes Interlock events in JSONL format for SDE consumption.
 * 
 * Path: ./logs/interlock_events.jsonl (default)
 * Override: INTERLOCK_EVENTS_PATH env var
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InterlockEvent } from '../../../services/events.types.ts';

const DEFAULT_JSONL_PATH = './logs/interlock_events.jsonl';

export class JsonlEventSink {
    private logPath: string;

    constructor(customPath?: string) {
        this.logPath = customPath || process.env.INTERLOCK_EVENTS_PATH || DEFAULT_JSONL_PATH;
        this.ensureDirectory();
    }

    private ensureDirectory(): void {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Append a single event to the JSONL file
     */
    emit(event: InterlockEvent): void {
        try {
            const line = JSON.stringify(event) + '\n';
            fs.appendFileSync(this.logPath, line, 'utf-8');
        } catch (error) {
            // Log error but don't crash - event emission is best-effort
            console.error('[Interlock] JSONL emit error:', error);
        }
    }

    /**
     * Get the current log path
     */
    getPath(): string {
        return this.logPath;
    }
}

// ============= Singleton Instance =============

let singletonSink: JsonlEventSink | null = null;

export function getJsonlSink(): JsonlEventSink {
    if (!singletonSink) {
        singletonSink = new JsonlEventSink();
    }
    return singletonSink;
}
