#!/usr/bin/env python3
"""
End-to-End Shift Test Driver Script
====================================
Tests the full Interlock stack (client → middleware → adapter → Ollama)
vs direct Ollama access to measure middleware overhead.

Usage:
  py scripts/run_e2e_shift_fast.py --model gemma3:1b --out logs/e2e_1b.jsonl --via-interlock
  py scripts/run_e2e_shift_fast.py --model gemma3:1b --out logs/direct_1b.jsonl
  
  # Use Interlock's native log (recommended for production validation):
  py scripts/run_e2e_shift_fast.py --model gemma3:1b --out logs/e2e_1b.jsonl --via-interlock --use-native-log
"""

import argparse
import hashlib
import urllib.request
import json
import os
import platform
import shutil
import time
from datetime import datetime

# Configuration
OLLAMA_URL = "http://localhost:11434/api/generate"
INTERLOCK_URL = "http://localhost:3001/work"  # Interlock express-demo with real Ollama
INTERLOCK_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "logs", "interlock_events.jsonl")
DOMAIN = "ollama"

# Prompts - scaled by token_cap
BASELINE_PROMPT_SHORT = 'Explain log rotation in 3 points.'
BASELINE_PROMPT_DEFAULT = 'Return a JSON object with keys: summary, steps. In exactly 6 bullet points, explain how to rotate logs safely in a Node service.'
BASELINE_PROMPT_LONG = 'Return a detailed JSON object with keys: overview, prerequisites, detailed_steps, verification, rollback_plan. Write a comprehensive guide on implementing log rotation in production Node services. Include at least 10 detailed steps with code examples, 5 prerequisites, 3 verification checks, and a complete rollback procedure.'

BURST_PROMPT_SHORT = 'Define request provenance in 50 words.'
BURST_PROMPT_DEFAULT = 'Write a technical explanation of request provenance in 180–220 words. Include exactly 3 numbered steps and 2 risks. No code.'
BURST_PROMPT_LONG = 'Write an extensive technical analysis of request provenance in distributed systems. Cover: origin tracking, chain of custody, cryptographic verification, audit logging, compliance requirements, implementation patterns, and security considerations. Include at least 500 words with specific examples from enterprise systems.'

BASELINE_N = 35  # Minimum 30 samples required for law generation
BURST_N = 35

# Parse arguments
parser = argparse.ArgumentParser(description='E2E Shift Test Driver')
parser.add_argument('--model', required=True, help='Ollama model ID')
parser.add_argument('--out', required=True, help='Output log path')
parser.add_argument('--via-interlock', action='store_true', help='Route through Interlock middleware')
parser.add_argument('--use-native-log', action='store_true', help='Copy Interlock native log instead of writing own events')
parser.add_argument('--token-cap', type=int, default=256, help='Max tokens (128=short, 256=default, 512=long)')
parser.add_argument('--profile', default='default', help='Workload profile ID (default, chat_short_v1, chat_long_v1)')
parser.add_argument('--burst-prompt', help='Custom prompt for burst phase')
args = parser.parse_args()

MODEL_ID = args.model
LOG_PATH = args.out
VIA_INTERLOCK = args.via_interlock
USE_NATIVE_LOG = args.use_native_log
TOKEN_CAP = args.token_cap
PROFILE_ID = args.profile
TARGET_URL = INTERLOCK_URL if VIA_INTERLOCK else OLLAMA_URL
# Compute OLLAMA_CONFIG_HASH dynamically based on environment knobs
_threads = os.environ.get("OLLAMA_NUM_THREADS", "default")
_ctx = os.environ.get("OLLAMA_NUM_CTX", "default")
OLLAMA_CONFIG_HASH = hashlib.sha256(f"threads:{_threads}|ctx:{_ctx}".encode('utf-8')).hexdigest()[:16]

# Select prompts based on token_cap
if TOKEN_CAP <= 128:
    BASELINE_PROMPT = BASELINE_PROMPT_SHORT
    BURST_PROMPT = BURST_PROMPT_SHORT
elif TOKEN_CAP >= 512:
    BASELINE_PROMPT = BASELINE_PROMPT_LONG
    BURST_PROMPT = BURST_PROMPT_LONG
else:
    BASELINE_PROMPT = BASELINE_PROMPT_DEFAULT
    BURST_PROMPT = args.burst_prompt if args.burst_prompt else BURST_PROMPT_DEFAULT

def get_utc_iso():
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def sha256_hash(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def compute_hardware_fingerprint():
    """
    Compute deterministic hardware fingerprint.
    Uses same fields as Interlock: cpu_model, cpu_threads, ram_gb (rounded), os_name.
    """
    import os as _os
    
    # Allow manual override for testing/portability proofs (GATED)
    override_fp = _os.environ.get("SDE_FORCE_HW_FP")
    dev_mode = _os.environ.get("SDE_DEV_MODE") == "1"
    if override_fp and dev_mode:
        print("[DEV MODE] WARNING: Hardware fingerprint override enabled via SDE_DEV_MODE + SDE_FORCE_HW_FP")
        print(f"[DEV MODE] Using override fingerprint: {override_fp}")
        print("[DEV MODE] This should NEVER be used in production!")
        return override_fp
    
    # CPU info
    cpu_model = platform.processor() or "unknown"
    cpu_threads = _os.cpu_count() or 1
    
    # RAM (rounded to nearest GB for stability)
    try:
        import psutil
        ram_bytes = psutil.virtual_memory().total
        ram_gb = round(ram_bytes / (1024**3))
    except ImportError:
        # Fallback if psutil not available
        ram_gb = 0
    
    # OS name (without version for stability)
    os_name = platform.system()
    
    # Compute hash of sorted JSON
    core = {
        "cpu_model": cpu_model,
        "cpu_threads": cpu_threads,
        "ram_gb": ram_gb,
        "os_name": os_name
    }
    normalized = json.dumps(core, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

# Compute fingerprint once at startup
HARDWARE_FINGERPRINT = compute_hardware_fingerprint()
print(f"[INFO] Hardware fingerprint: {HARDWARE_FINGERPRINT}")


def log_event(event):
    # Add expanded provenance
    stamped_event = {
        **event,
        "kernel": {
            "schema_version": "0.3.0",
            "packet_id": "e2e_shift_test_20251220",
            "law_hash": "ae234c4f2b3f322b",
            "quality_level": "L1-E2E-Test",
            "domain": DOMAIN,
            "hardware_fingerprint": HARDWARE_FINGERPRINT,  # Deterministic fingerprint
            "ollama_config_hash": OLLAMA_CONFIG_HASH,     # Identity key 7
            "workload": {
                "model_id": MODEL_ID, 
                "provider": "ollama",
                "adapter": "ollama" if not VIA_INTERLOCK else "interlock-express",
                "endpoint": TARGET_URL,
                "token_cap": TOKEN_CAP,
                "profile_id": PROFILE_ID
            }
        },
        "physics_hash": "716ee688f5f25589",
        "workload": {
            "model_id": MODEL_ID, 
            "provider": "ollama",
            "adapter": "ollama" if not VIA_INTERLOCK else "interlock-express",
            "endpoint": TARGET_URL,
            "token_cap": TOKEN_CAP
        }
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(stamped_event) + "\n")

def inject_marker(phase):
    marker = {
        "event_type": "ab_phase",
        "phase": phase,
        "timestamp": get_utc_iso(),
        "ab_phase": phase
    }
    log_event(marker)
    print(f"[MARKER] {phase}")

def run_inference(prompt):
    prompt_hash = sha256_hash(prompt)
    
    if VIA_INTERLOCK:
        # Use Interlock /work format (matches express-demo server)
        data = json.dumps({
            "model": MODEL_ID,
            "prompt": prompt,
            "max_tokens": TOKEN_CAP
        }).encode('utf-8')
    else:
        # Use Ollama direct format
        data = json.dumps({
            "model": MODEL_ID,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": TOKEN_CAP,
                "num_ctx": int(os.environ.get("OLLAMA_NUM_CTX", 2048))
            }
        }).encode('utf-8')
    
    start_time = time.time()
    try:
        req = urllib.request.Request(TARGET_URL, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=180) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            duration_ms = (time.time() - start_time) * 1000
            
            log_event({
                "event_type": "inference",
                "timestamp": get_utc_iso(),
                "latency_ms": duration_ms,
                "confidence": 0.9,
                "load_factor": 0.3,
                "domain": DOMAIN,
                "prompt_hash": prompt_hash,
                "tokens_generated": res_data.get("eval_count", 0) or res_data.get("usage", {}).get("completion_tokens", 0)
            })
            print(f"  Request: {duration_ms:.1f}ms")
            return duration_ms
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        log_event({
            "event_type": "error",
            "timestamp": get_utc_iso(),
            "error": str(e),
            "latency_ms": duration_ms,
            "domain": DOMAIN,
            "prompt_hash": prompt_hash
        })
        print(f"  ERROR: {e} ({duration_ms:.1f}ms)")
        return None

def run_e2e_shift():
    mode = "INTERLOCK MIDDLEWARE" if VIA_INTERLOCK else "DIRECT OLLAMA"
    print(f"\n{'='*60}")
    print(f"E2E SHIFT TEST: {mode}")
    print(f"{'='*60}")
    print(f"Model: {MODEL_ID}")
    print(f"Target: {TARGET_URL}")
    print(f"Output: {LOG_PATH}")
    print(f"Token cap: {TOKEN_CAP}")
    print(f"Requests: {BASELINE_N} baseline + {BURST_N} burst = {BASELINE_N + BURST_N} total")
    print(f"{'='*60}\n")
    
    # Boot event
    log_event({
        "event_type": "kernel_boot",
        "timestamp": get_utc_iso(),
        "domain": DOMAIN,
        "effective_config": {
            "latencyThresholdMs": 500,
            "hazardThreshold": 0.97,
            "model_id": MODEL_ID,
            "token_cap": TOKEN_CAP,
            "via_interlock": VIA_INTERLOCK
        }
    })
    print("[BOOT] Kernel boot event logged\n")
    
    # Baseline
    inject_marker("baseline_start")
    print(f"\n[BASELINE] Starting {BASELINE_N} requests...")
    baseline_latencies = []
    for i in range(BASELINE_N):
        lat = run_inference(BASELINE_PROMPT)
        if lat:
            baseline_latencies.append(lat)
        time.sleep(0.5)
    
    # Burst
    inject_marker("burst_start")
    print(f"\n[BURST] Starting {BURST_N} requests...")
    burst_latencies = []
    for i in range(BURST_N):
        lat = run_inference(BURST_PROMPT)
        if lat:
            burst_latencies.append(lat)
    
    # End
    inject_marker("end")
    
    # Summary
    print(f"\n{'='*60}")
    print(f"RUN COMPLETE: {MODEL_ID} via {mode}")
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
    
    # Copy native log if requested (recommended for production validation)
    if USE_NATIVE_LOG and VIA_INTERLOCK:
        native_log = os.path.normpath(INTERLOCK_LOG_PATH)
        if os.path.exists(native_log):
            shutil.copy2(native_log, LOG_PATH)
            print(f"\n[NATIVE LOG] Copied Interlock native log to: {LOG_PATH}")
        else:
            print(f"\n[WARNING] Native log not found: {native_log}")
            print(f"[INFO] Script events saved to: {LOG_PATH}")
    else:
        print(f"\nLog saved to: {LOG_PATH}")

if __name__ == "__main__":
    run_e2e_shift()
