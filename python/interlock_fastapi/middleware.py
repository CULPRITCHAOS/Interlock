from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request
from datetime import datetime
from .client import InterlockClient
from .sink import IncidentSink

class InterlockMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, interlock_url: str = "http://localhost:3000", log_file: str = "docs/LIVE_INCIDENTS.md", dry_run: bool = False, fail_closed: bool = True, dev_fail_open_override: bool = False):
        super().__init__(app)
        self.client = InterlockClient(interlock_url, fail_closed=fail_closed, dev_fail_open_override=dev_fail_open_override)
        self.sink = IncidentSink(log_file)
        self.dry_run = dry_run
        self.enforcement_count = 0

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", f"req-{int(datetime.utcnow().timestamp()*1000)}")

        if request.url.path.endswith('/stream'):
            return JSONResponse(status_code=501, content={
                "error": "Streaming enforcement unsupported without protocol adapter",
                "request_id": request_id,
                "todo": ["SSE/NDJSON fatal event then close", "WebSocket close code 1008", "raw/unknown transport abort"]
            })

        payload = {"path": request.url.path, "method": request.method, "request_id": request_id}
        result = await self.client.get_decision(payload)
        decision = result.get("decision", {})

        if self.dry_run:
            decision["mode"] = "SHADOW_ONLY"
            if decision.get("action") in ["REFUSE", "BLOCK"]:
                decision["action_taken"] = f"WOULD_{decision['action']}"

        print("[Interlock Enforcement]", {
            "law_hash": decision.get("law_hash"), "request_id": decision.get("request_id", request_id), "mode": decision.get("mode"),
            "action": decision.get("action"), "action_taken": decision.get("action_taken"), "reason": decision.get("reason"),
            "timestamp": decision.get("timestamp", datetime.utcnow().isoformat())
        })

        action = decision.get("action", "ALLOW")
        if action in ["REFUSE", "BLOCK", "DEGRADE"]:
            if decision.get("mode") != "SHADOW_ONLY":
                self.enforcement_count += 1
            try:
                self.sink.log_event({"incident_id": decision.get("request_id", request_id), "trigger": "Remote Decision", "action": action, "failure_class": "Runtime Enforcement", "confidence": 0.0})
            except Exception:
                pass
            if decision.get("mode") != "SHADOW_ONLY":
                return JSONResponse(status_code=decision.get("status_code", 503), content={"refused": True, "decision": decision})

        response = await call_next(request)
        return response
