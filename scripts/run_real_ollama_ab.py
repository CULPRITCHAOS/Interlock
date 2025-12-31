import argparse
import urllib.request
import urllib.parse
import json
import time
import os
from datetime import datetime

# Default Paths
OLLAMA_URL = "http://localhost:11434/api/generate"
DOMAIN = "ollama"

parser = argparse.ArgumentParser(description='Reality Capture Driver')
parser.add_argument('--model', required=True, help='Ollama model ID')
parser.add_argument('--out', required=True, help='Output log path')
args_cli = parser.parse_args()

MODEL_ID = args_cli.model
LOG_PATH = args_cli.out

def get_utc_iso():
    # Use timezone-aware version to avoid deprecation warning if possible, 
    # but keep it simple for standard lib
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def log_event(event):
    # This manually mimics the 'stampEvent' logic since we're in Python
    # In a real setup, we'd use the Interlock TS boot result.
    # Here we hardcode the kernel stamps from the current hardware_profile.json
    stamped_event = {
        **event,
        "kernel": {
            "schema_version": "0.3.0",
            "packet_id": "profile_20251215_225305", # From user's log
            "law_hash": "ae234c4f2b3f322b",         # From user's log
            "quality_level": "L1-Hardware-Validated",
            "domain": DOMAIN,
            "workload": {"model_id": MODEL_ID, "provider": "ollama"}
        },
        "physics_hash": "716ee688f5f25589", # From user's log
        "workload": {"model_id": MODEL_ID, "provider": "ollama"}
    }
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(stamped_event) + "\n")

def inject_marker(phase):
    marker = {
        "event_type": "ab_phase",
        "phase": phase,
        "timestamp": get_utc_iso(),
        "ab_phase": phase
    }
    log_event(marker)
    print(f"Injected {phase} marker")

def run_inference(prompt):
    data = json.dumps({
        "model": MODEL_ID,
        "prompt": prompt,
        "stream": False
    }).encode('utf-8')
    
    start_time = time.time()
    try:
        req = urllib.request.Request(OLLAMA_URL, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            duration_ms = (time.time() - start_time) * 1000
            
            # Log the inference event
            log_event({
                "event_type": "inference",
                "timestamp": get_utc_iso(),
                "latency_ms": duration_ms,
                "confidence": 0.9,
                "load_factor": 0.3,
                "domain": DOMAIN
            })
            print(f"Request: {duration_ms:.1f}ms")
            return duration_ms
    except Exception as e:
        print(f"Inference failed: {e}")
        return None

def run_ab_run():
    # 0. Boot event
    log_event({
        "event_type": "kernel_boot",
        "timestamp": get_utc_iso(),
        "domain": DOMAIN,
        "effective_config": {
            "latencyThresholdMs": 500,
            "hazardThreshold": 0.97
        }
    })
    
    # 1. Baseline
    inject_marker("baseline")
    print(f"Starting Baseline (15 requests)...")
    for i in range(15):
        run_inference("Explain the concept of entropy in one sentence.")
        time.sleep(0.5)
        
    # 2. Burst (using a heavier prompt)
    inject_marker("burst")
    print(f"Starting Burst (15 heavier requests)...")
    for i in range(15):
        run_inference("Write a detailed 5-paragraph essay on the impact of artificial intelligence on the job market.")
        # No delay for burst
        
    inject_marker("end")
    print("Run B Reality Capture Complete")

if __name__ == "__main__":
    run_ab_run()
