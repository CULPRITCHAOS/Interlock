from fastapi import FastAPI
from starlette.responses import JSONResponse
import sys
import os

# Add local python package to path for demo
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../python")))

from interlock_fastapi.middleware import InterlockMiddleware

app = FastAPI()

# Enable Interlock Middleware
# Pointing to the Node Reference Service running on port 3000
app.add_middleware(
    InterlockMiddleware,
    interlock_url="http://localhost:3000",
    log_file="docs/LIVE_INCIDENTS.md",
    dry_run=False
)

@app.get("/work")
async def do_work():
    return {"status": "done", "data": "Python worked"}

if __name__ == "__main__":
    import uvicorn
    print("FastAPI Demo running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
