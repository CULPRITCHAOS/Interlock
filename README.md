![Interlock logo](./intelock_logo.jpg)
#INTERLOCK 

Interlock is a circuit-breaker + evidence layer for AI infrastructure. It monitors runtime signals (confidence/latency/failure), refuses or degrades when the system is outside safe bounds, and writes verifiable forensic logs.

## What it does

- **Quality gating**: refuse/degrade low-certainty responses
- **Survivability**: shed load and recover cleanly under stress
- **Evidence**: cryptographic provenance for interventions + configs
- **Adapters**: integration points for vector DBs and local models

## Quickstart

**Docs**: [Quickstart](./docs/QUICKSTART.md) · [Local AI](./docs/quickstart/local-ai.md) · [Middleware](./docs/MIDDLEWARE.md)

### Express (Node)

```typescript
import { interlockExpress } from '@interlock/express';
app.use(interlockExpress({ quality_floor: 0.8 }));
```

### FastAPI (Python)

```python
from interlock_fastapi.middleware import InterlockMiddleware
app.add_middleware(InterlockMiddleware, interlock_url="http://brain:3000")
```

## Supported Integrations

| Integration | Status |
|-------------|--------|
| Pinecone | ✅ Production |
| FAISS | ✅ Production |
| LangChain | ✅ Production |
| LlamaIndex | ✅ Production |
| Weaviate | ✅ Stable |
| Milvus | ✅ Stable |
| Ollama / Local AI | ✅ Tested |

## Evidence & Validation

CI workflows produce repeatable artifacts (stress, scale, adapter certification).

**See**: [Test Results](./docs/TEST_RESULTS.md) · [Live Incidents](./docs/LIVE_INCIDENTS.md)

## Security Posture

Demo configurations live under `laws/examples/` and are not production defaults.

Threat model and hardening details: [Security Posture](./docs/SECURITY_POSTURE.md)

## License

MIT. See [LICENSE](./LICENSE).
