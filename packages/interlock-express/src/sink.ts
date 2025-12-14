import * as fs from 'fs';
import * as path from 'path';

/**
 * Standard Incident Sink Interface
 * Ensures compliance with docs/LIVE_INCIDENTS.md format
 */

export interface InterlockEvent {
    incidentId?: string; // If part of ongoing incident
    trigger: string;
    action: string;
    details: string;
    recoveryTime: number; // Seconds
    confidence: number;
    failureClass: string;
}

export interface IncidentSink {
    logEvent(event: InterlockEvent): void;
}

// Default Legend to enforce standard compliance
const DEFAULT_LEGEND = `
## Confidence Interpretation
- **≥0.8**: High certainty (Normal operation)
- **0.5–0.79**: Moderate certainty (Protective mode preferred)
- **<0.5**: Low certainty (Refusal required)
`;

export class FileIncidentSink implements IncidentSink {
    private logPath: string;
    private incidentCounter: number = 0;
    private lastLoggedDate: string = '';

    constructor(absolutePath: string) {
        this.logPath = absolutePath;
        this.ensureHeader();
    }

    private ensureHeader() {
        if (!fs.existsSync(this.logPath)) {
            const header = `# Live Incident Log: Interlock Middleware

> **Status**: ACTIVE MONITORING
> **Service**: Express Middleware Integration
> **Location**: ${this.logPath}

---
${DEFAULT_LEGEND}

## Incident History

`;
            fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
            fs.writeFileSync(this.logPath, header);
        }
    }

    logEvent(event: InterlockEvent): void {
        const timestamp = new Date().toISOString();
        let entry = '';

        if (event.incidentId && !event.incidentId.includes('-')) {
            // It's a header / new incident start
            entry += `
### Incident #${event.incidentId}: ${event.action}
- **Failure Class**: ${event.failureClass}
- **Incident Window**: ${timestamp} → ...
- **Trigger**: ${event.trigger}

`;
        } else {
            // It's an event
            const evtId = event.incidentId || '000-X';
            entry += `#### Event ${evtId}
- **Timestamp**: ${timestamp}
- **Action**: ${event.action}
- **Outcome**: ${event.details}
- **Recovery time**: ${event.recoveryTime.toFixed(1)}s
- **Confidence**: ${event.confidence.toFixed(2)} (Moderate)

`;
        }

        fs.appendFileSync(this.logPath, entry);
    }
}
