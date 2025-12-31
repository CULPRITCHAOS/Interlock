
import subprocess
import time
import urllib.request
import urllib.parse
import json
import os
from datetime import datetime

LOG_PATH = r"C:\Users\13cul\Desktop\Interlock\logs\interlock_events.jsonl"
SERVER_URL = "http://localhost:3001/chat"
MODEL_ID = "gemma3:1b"

def get_utc_iso():
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def inject_marker(phase):
    marker = {
        "event_type": "ab_phase",
        "phase": phase,
        "timestamp": get_utc_iso(),
        "workload": {"model_id": MODEL_ID, "provider": "ollama"}
    }
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(marker) + "\n")
    print(f"Injected {phase} marker")

def send_traffic(count, burst=False):
    print(f"Sending {count} requests (burst={burst})...")
    data = json.dumps({"messages": [{"role": "user", "content": "test"}]}).encode('utf-8')
    for i in range(count):
        try:
            req = urllib.request.Request(SERVER_URL, data=data, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req) as response:
                response.read()
            if not burst:
                time.sleep(0.1)
            else:
                time.sleep(0.01)
        except Exception as e:
            print(f"Request failed: {e}")

def run():
    # 0. Start server if not running (assumed running from background command)
    
    # 1. Baseline
    inject_marker("baseline")
    send_traffic(50, burst=False)
    
    # 2. Burst
    inject_marker("burst")
    send_traffic(50, burst=True)
    
    # 3. End
    inject_marker("end")
    
    print("Run B completion successful")

if __name__ == "__main__":
    run()
