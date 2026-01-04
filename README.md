# Interlock

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

## OperatorPack Receipt Verification

Interlock includes tools to verify and index OperatorPack receipts (JSON).

### Usage

1. **Verify a receipt**:
   ```powershell
   python tools/verify_operatorpack.py "C:\path\to\operatorpack.json"
   ```
   Outputs a JSON verdict (PASS/WARN/FAIL) based on performance and quality thresholds.

2. **Index a receipt**:
   ```powershell
   python tools/append_receipt_index.py "C:\path\to\operatorpack.json" "C:\path\to\RECEIPTS_INDEX.md"
   ```
   Appends metrics to a **Markdown table** index file for long-term tracking (Memory_MB is stored as a numeric value for machine readability).

### Recommended Workflow
Place new receipts in `receipts/inbox/` for verification before promotion.

Example using current Helix receipt:
```powershell
python tools/verify_operatorpack.py "C:\Users\13cul\Desktop\cross project files\operatorpack_helix_mqs_nb4_d0p1_r20_f1e6_N10k_2026-01-04.json"
```


## License

MIT. See [LICENSE](./LICENSE).
