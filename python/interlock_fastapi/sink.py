import os
import time
from typing import Optional

class IncidentSink:
    def __init__(self, log_file: str):
        self.log_file = log_file
        self.ensure_header()

    def ensure_header(self):
        if not os.path.exists(self.log_file):
            os.makedirs(os.path.dirname(self.log_file), exist_ok=True)
            with open(self.log_file, 'w', encoding='utf-8') as f:
                f.write("# Live Incident Log: Interlock Middleware (Python)\n\n")
                f.write("> **Status**: ACTIVE MONITORING\n")
                f.write(f"> **Location**: {self.log_file}\n\n")
                f.write("---\n")
                f.write("## Incident History\n\n")

    def log_event(self, event: dict):
        """
        Logs an event compliant with the Standard Incident Log format.
        """
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        incident_id = event.get("incident_id", "000")
        
        # Determine if Header (New Incident) or Event (Resolution/Update)
        # Using simple heuristic: Is it a Refusal (Start) or Recovery (End)?
        # For remote client, we might just append events linearly.
        
        with open(self.log_file, 'a', encoding='utf-8') as f:
            if "refusal" in str(event.get("trigger", "")).lower():
                 f.write(f"\n### Incident #{incident_id}: Traffic Refusal\n")
                 f.write(f"- **Failure Class**: {event.get('failure_class', 'Unknown')}\n")
                 f.write(f"- **Incident Window**: {timestamp} -> ...\n")
                 f.write(f"- **Trigger**: {event.get('trigger', 'Unknown')}\n\n")
            else:
                 f.write(f"#### Event {incident_id}-X\n")
                 f.write(f"- **Timestamp**: {timestamp}\n")
                 f.write(f"- **Action**: {event.get('action', 'Unknown')}\n")
                 f.write(f"- **Outcome**: {event.get('details', '')}\n")
                 f.write(f"- **Confidence**: {event.get('confidence', 0.0)}\n\n")
