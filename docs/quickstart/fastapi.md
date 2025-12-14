# Quickstart: FastAPI (Python)

Minimal example: protect → degrade → refuse.

```python
from fastapi import FastAPI
from interlock_fastapi import InterlockMiddleware

app = FastAPI()

# Add Interlock middleware
app.add_middleware(
    InterlockMiddleware,
    interlock_url="http://localhost:4000",  # Interlock brain service
    quality_floor=0.7,
    shadow_mode=False
)

@app.get("/search")
async def search(q: str):
    results = await vector_db.query(q)
    return {"results": results}
```

## Behavior

| Condition | Action |
|-----------|--------|
| Confidence ≥ 0.7 | ✅ Request passes |
| Confidence 0.5–0.7 | ⚠️ Degraded response |
| Confidence < 0.5 | ❌ Request refused (503) |
| Circuit OPEN | ❌ All traffic refused |

## Run

```bash
pip install interlock-fastapi
uvicorn main:app --reload
```

## Start Interlock Brain

```bash
# In separate terminal
npx tsx apps/live-monitor/server.ts
```
