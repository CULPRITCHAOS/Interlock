from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request
import time
import asyncio
from .client import InterlockClient
from .sink import IncidentSink

class InterlockMiddleware(BaseHTTPMiddleware):
    def __init__(
        self, 
        app, 
        interlock_url: str = "http://localhost:3000",
        log_file: str = "docs/LIVE_INCIDENTS.md",
        dry_run: bool = False
    ):
        super().__init__(app)
        self.client = InterlockClient(interlock_url)
        self.sink = IncidentSink(log_file)
        self.dry_run = dry_run
        self.incident_buffer = {} # Simple state for debouncing LOGGING (not decision)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # 1. Ask Brain
        decision = await self.client.get_decision({
            "path": request.url.path,
            "method": request.method
        })

        # 2. Enforce Decision
        if not decision.get("allowed", True):
            refusal = decision["refusal"]
            
            # Log Incident (Async to not block too much, but here strictly for simplicity)
            # In production, use background task.
            self.sink.log_event({
                "incident_id": refusal.get("incident_id"),
                "trigger": "Remote Refusal",
                "action": "Traffic Refusal",
                "failure_class": "Remote Decision",
                "confidence": refusal.get("confidence")
            })

            if not self.dry_run:
                return JSONResponse(
                    status_code=503,
                    content={
                        "refused": True,
                        "reason": refusal.get("reason"),
                        "incident_id": refusal.get("incident_id"),
                        "retry_after_ms": refusal.get("retry_after_ms")
                    }
                )
            else:
                print(f"[Interlock Shadow] Would Refuse: {refusal}")

        # 3. Proceed
        response = await call_next(request)
        
        # Metric hook could go here (send latency back to Brain?)
        # For Phase 3B "Remote Client", Brain monitors itself via its own adapter 
        # acting as the Proxy/Sidecar or receiving distinct signals.
        # But wait, if Brain is separate process, it doesn't see THIS request's latency 
        # unless we send it back.
        # The prompt says: "Do not re-implement hazard logic". 
        # It implies the Brain uses its OWN internal state (from the Reference App load)
        # OR we send metrics. 
        # For "Phase 3B", we rely on the Brain's internal state (which we are mocking via Force/Lag).
        
        return response
