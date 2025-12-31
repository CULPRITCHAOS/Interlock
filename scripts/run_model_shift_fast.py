#!/usr/bin/env python3
"""
Model Shift Reality Run Driver Script (Fast Version)
=====================================================
Generates REAL Ollama traffic for apples-to-apples model comparison.

Usage:
  py scripts/run_model_shift_fast.py --model gemma3:12b --out logs/run_a.jsonl
  py scripts/run_model_shift_fast.py --model gemma3:1b --out logs/run_b.jsonl
"""

import argparse
import urllib.request
import json
import time
from datetime import datetime

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
DOMAIN = "ollama"
TOKEN_CAP = 256  # Limit output length for faster completion

# Prompts (exact text from user spec)
BASELINE_PROMPT = 'Return a JSON object with keys: summary, steps. In exactly 6 bullet points, explain how to rotate logs safely in a Node service.'
BURST_PROMPT = 'Write a technical explanation of request provenance in 180–220 words. Include exactly 3 numbered steps and 2 risks. No code.'

# Request counts
BASELINE_N = 25
BURST_N = 25

# Parse arguments
parser = argparse.ArgumentParser(description='Model Shift Reality Run Driver')
parser.add_argument('--model', required=True, help='Ollama model ID (e.g., gemma3:12b or gemma3:1b)')
parser.add_argument('--out', required=True, help='Output log path')
args = parser.parse_args()

MODEL_ID = args.model
LOG_PATH = args.out

def get_utc_iso():
    """Get current UTC timestamp in ISO format."""
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def log_event(event):
    """Log event with kernel stamps to JSONL file."""
    stamped_event = {
        **event,
        "kernel": {
            "schema_version": "0.3.0",
            "packet_id": "model_shift_run_20251219",
            "law_hash": "ae234c4f2b3f322b",
            "quality_level": "L1-Hardware-Validated",
            "domain": DOMAIN,
            "workload": {"model_id": MODEL_ID, "provider": "ollama"}
        },
        "physics_hash": "716ee688f5f25589",
        "workload": {"model_id": MODEL_ID, "provider": "ollama"}
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(stamped_event) + "\n")

def inject_marker(phase):
    """Inject A/B phase marker."""
    marker = {
        "event_type": "ab_phase",
        "phase": phase,
        "timestamp": get_utc_iso(),
        "ab_phase": phase
    }
    log_event(marker)
    print(f"[MARKER] {phase}")

def run_inference(prompt):
    """Send inference request to Ollama and log result."""
    data = json.dumps({
        "model": MODEL_ID,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_predict": TOKEN_CAP  # Limit output tokens for faster completion
        }
    }).encode('utf-8')
    
    start_time = time.time()
    try:
        req = urllib.request.Request(OLLAMA_URL, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=120) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            duration_ms = (time.time() - start_time) * 1000
            
            # Log the inference event
            log_event({
                "event_type": "inference",
                "timestamp": get_utc_iso(),
                "latency_ms": duration_ms,
                "confidence": 0.9,
                "load_factor": 0.3,
                "domain": DOMAIN,
                "tokens_generated": res_data.get("eval_count", 0)
            })
            print(f"  Request: {duration_ms:.1f}ms ({res_data.get('eval_count', 0)} tokens)")
            return duration_ms
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        log_event({
            "event_type": "error",
            "timestamp": get_utc_iso(),
            "error": str(e),
            "latency_ms": duration_ms,
            "domain": DOMAIN
        })
        print(f"  ERROR: {e} ({duration_ms:.1f}ms)")
        return None

def run_model_shift():
    """Execute the full model shift capture."""
    print(f"\n{'='*60}")
    print(f"MODEL SHIFT REALITY RUN")
    print(f"{'='*60}")
    print(f"Model: {MODEL_ID}")
    print(f"Output: {LOG_PATH}")
    print(f"Token cap: {TOKEN_CAP}")
    print(f"Requests: {BASELINE_N} baseline + {BURST_N} burst = {BASELINE_N + BURST_N} total")
    print(f"{'='*60}\n")
    
    # 0. Boot event
    log_event({
        "event_type": "kernel_boot",
        "timestamp": get_utc_iso(),
        "domain": DOMAIN,
        "effective_config": {
            "latencyThresholdMs": 500,
            "hazardThreshold": 0.97,
            "model_id": MODEL_ID,
            "token_cap": TOKEN_CAP
        }
    })
    print("[BOOT] Kernel boot event logged\n")
    
    # 1. Baseline phase
    inject_marker("baseline_start")
    print(f"\n[BASELINE] Starting {BASELINE_N} requests...")
    baseline_latencies = []
    for i in range(BASELINE_N):
        lat = run_inference(BASELINE_PROMPT)
        if lat:
            baseline_latencies.append(lat)
        time.sleep(0.5)  # Small delay between requests
    
    # 2. Burst phase
    inject_marker("burst_start")
    print(f"\n[BURST] Starting {BURST_N} requests...")
    burst_latencies = []
    for i in range(BURST_N):
        lat = run_inference(BURST_PROMPT)
        if lat:
            burst_latencies.append(lat)
        # No delay for burst
    
    # 3. End marker
    inject_marker("end")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"RUN COMPLETE: {MODEL_ID}")
    print(f"{'='*60}")
    print(f"Baseline: {len(baseline_latencies)}/{BASELINE_N} requests")
    if baseline_latencies:
        baseline_latencies.sort()
        p50_idx = len(baseline_latencies) // 2
        p95_idx = int(len(baseline_latencies) * 0.95)
        print(f"  P50: {baseline_latencies[p50_idx]:.1f}ms")
        print(f"  P95: {baseline_latencies[min(p95_idx, len(baseline_latencies)-1)]:.1f}ms")
    print(f"Burst: {len(burst_latencies)}/{BURST_N} requests")
    if burst_latencies:
        burst_latencies.sort()
        p50_idx = len(burst_latencies) // 2
        p95_idx = int(len(burst_latencies) * 0.95)
        print(f"  P50: {burst_latencies[p50_idx]:.1f}ms")
        print(f"  P95: {burst_latencies[min(p95_idx, len(burst_latencies)-1)]:.1f}ms")
    print(f"\nLog saved to: {LOG_PATH}")

if __name__ == "__main__":
    run_model_shift()
