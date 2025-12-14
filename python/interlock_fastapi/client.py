import httpx
import time
import logging

logger = logging.getLogger("interlock")

class InterlockClient:
    def __init__(self, base_url: str, timeout_ms: int = 100):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout_ms / 1000.0
        # Fail-open by default for dev safety, but can be configured
        self.fail_closed = False 

    async def get_decision(self, context: dict) -> dict:
        """
        Queries the Interlock Brain for a decision.
        Returns spec: { allowed: bool, refusal: dict, context: dict }
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/interlock/decision",
                    json=context
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Interlock Error: HTTP {response.status_code}")
                    return self._fallback_decision("http_error")

        except httpx.TimeoutException:
            logger.warning("Interlock Timeout: Core did not respond in time")
            return self._fallback_decision("timeout")
        except httpx.RequestError as e:
            logger.error(f"Interlock Connection Error: {str(e)}")
            return self._fallback_decision("connection_error")

    def _fallback_decision(self, reason: str) -> dict:
        """
        Determines behavior when Brain is unreachable.
        """
        if self.fail_closed:
            return {
                "allowed": False,
                "refusal": {
                    "reason": f"Interlock System Failure ({reason}) - Fail Closed",
                    "retry_after_ms": 10000,
                    "incident_id": "failsafe-000",
                    "confidence": 0.0
                }
            }
        else:
            # Fail Open (Shadow Mode log would happen here ideally)
            return {
                "allowed": True,
                "metadata": {
                    "confidence": 1.0, # Assume 1.0 if we can't check
                    "failsafe": True
                }
            }
