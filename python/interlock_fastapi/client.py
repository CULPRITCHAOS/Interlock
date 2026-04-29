import httpx
import logging
from typing import Dict, TypedDict, Literal
from datetime import datetime

logger = logging.getLogger("interlock")

Mode = Literal["ENFORCE", "SHADOW_ONLY"]
Action = Literal["ALLOW", "DEGRADE", "REFUSE", "BLOCK"]

class EnforcementDecision(TypedDict, total=False):
    mode: Mode
    action: Action
    reason: str
    law_hash: str
    request_id: str
    stream_id: str
    action_taken: str
    status_code: int
    timestamp: str


class InterlockClient:
    def __init__(self, base_url: str, timeout_ms: int = 100, fail_closed: bool = True, dev_fail_open_override: bool = False):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout_ms / 1000.0
        self.fail_closed = fail_closed
        self.dev_fail_open_override = dev_fail_open_override

    async def get_decision(self, context: dict) -> Dict:
        request_id = context.get("request_id", f"req-{int(datetime.utcnow().timestamp()*1000)}")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/interlock/decision", json=context)
                if response.status_code != 200:
                    return self._fallback_decision("http_error", request_id)

                data = response.json()
                if not self._valid_brain_response(data):
                    return self._fallback_decision("malformed_decision", request_id)
                return data
        except httpx.TimeoutException:
            return self._fallback_decision("timeout", request_id)
        except httpx.RequestError as e:
            logger.error(f"Interlock Connection Error: {str(e)}")
            return self._fallback_decision("connection_error", request_id)

    def _valid_brain_response(self, data: dict) -> bool:
        return isinstance(data, dict) and 'decision' in data and isinstance(data['decision'], dict) and 'action' in data['decision']

    def _fallback_decision(self, reason: str, request_id: str) -> Dict:
        if self.fail_closed and not self.dev_fail_open_override:
            return {
                "decision": {
                    "mode": "ENFORCE",
                    "action": "BLOCK",
                    "reason": f"Interlock System Failure ({reason}) - Fail Closed",
                    "law_hash": "control-plane-fallback",
                    "request_id": request_id,
                    "action_taken": "BLOCKED_FAIL_CLOSED",
                    "status_code": 503,
                    "timestamp": datetime.utcnow().isoformat()
                }
            }
        return {
            "decision": {
                "mode": "SHADOW_ONLY",
                "action": "DEGRADE",
                "reason": f"Interlock System Failure ({reason}) - Dev Fail Open Override",
                "law_hash": "control-plane-fallback",
                "request_id": request_id,
                "action_taken": "DEV_FAIL_OPEN_OVERRIDE",
                "status_code": 200,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
