import unittest
from unittest.mock import AsyncMock
from starlette.requests import Request
from starlette.responses import Response
from python.interlock_fastapi.client import InterlockClient
from python.interlock_fastapi.middleware import InterlockMiddleware

class TestFastAPIBoundary(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_fails_closed_default(self):
        c = InterlockClient('http://x')
        d = c._fallback_decision('timeout', 'r1')['decision']
        self.assertEqual(d['action'], 'BLOCK')
        self.assertEqual(d['mode'], 'ENFORCE')

    async def test_non200_and_malformed_fail_closed(self):
        c = InterlockClient('http://x')
        d = c._fallback_decision('http_error', 'r2')['decision']
        self.assertEqual(d['status_code'], 503)
        self.assertFalse(c._valid_brain_response({'allowed': True}))

    async def test_dev_fail_open_override_stamped(self):
        c = InterlockClient('http://x', fail_closed=True, dev_fail_open_override=True)
        d = c._fallback_decision('timeout', 'r3')['decision']
        self.assertEqual(d['mode'], 'SHADOW_ONLY')
        self.assertEqual(d['action_taken'], 'DEV_FAIL_OPEN_OVERRIDE')

    async def test_middleware_refusal_prevents_call_next(self):
        m = InterlockMiddleware(app=lambda scope, receive, send: None)
        m.client.get_decision = AsyncMock(return_value={"decision": {"mode":"ENFORCE","action":"REFUSE","reason":"r","law_hash":"h","request_id":"id","action_taken":"REFUSED","status_code":503,"timestamp":"t"}})
        scope = {"type": "http", "method": "GET", "path": "/work", "headers": []}
        req = Request(scope)
        call_next = AsyncMock(return_value=Response('ok'))
        resp = await m.dispatch(req, call_next)
        self.assertEqual(resp.status_code, 503)
        call_next.assert_not_called()

if __name__ == '__main__':
    unittest.main()
