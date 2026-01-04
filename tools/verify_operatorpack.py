import json
import sys
import os
import argparse

# Thresholds
MIN_MAX_N_PROD = 10000
MIN_MAX_N_EXPLORE = 2000
MAX_BUILD_TIME_S = 150.0
MAX_MEMORY_MB = 500.0
MAX_RECIPROCITY = 1e-15

def get_val(data, path_str):
    """Helper to get nested value from dict using dot notation."""
    keys = path_str.split('.')
    val = data
    for k in keys:
        if isinstance(val, dict) and k in val:
            val = val[k]
        else:
            return None
    return val

def verify_receipt(receipt_path, mode="production"):
    if not os.path.exists(receipt_path):
        return {
            "verdict": "FAIL",
            "reasons": [f"File not found: {receipt_path}"],
            "mode": mode
        }

    try:
        with open(receipt_path, 'r', encoding="utf-8-sig") as f:
            data = json.load(f)
    except Exception as e:
        return {
            "verdict": "FAIL",
            "reasons": [f"Failed to parse JSON: {str(e)}"],
            "mode": mode
        }

    # Set threshold based on mode
    min_n = MIN_MAX_N_PROD if mode == "production" else MIN_MAX_N_EXPLORE

    # Validate required keys
    required_keys = ['operatorpack_version', 'created_at', 'project', 'environment', 'geometry', 'operator', 'benchmarks']
    missing_keys = [k for k in required_keys if k not in data]
    if missing_keys:
        return {
            "verdict": "FAIL",
            "reasons": [f"Missing required keys: {', '.join(missing_keys)}"],
            "mode": mode
        }

    # Extract benchmarks
    benchmarks = data.get('benchmarks', {})
    verify_scaling = benchmarks.get('verify_scaling', {})
    summary = verify_scaling.get('summary', {})
    
    max_n = summary.get('max_N')
    
    # Alias support for summary keys
    build_time = summary.get('build_s_at_maxN') or summary.get('build_time_s_at_maxN')
    memory = summary.get('mem_mb_at_maxN') or summary.get('memory_mb_at_maxN')
    reciprocity = summary.get('reciprocity_range')
    matvec_ms = summary.get('matvec_ms_at_maxN')

    # Fallback to cases if summary is missing
    if max_n is None or build_time is None or memory is None:
        cases = verify_scaling.get('cases', [])
        if not cases:
            return {
                "verdict": "FAIL",
                "reasons": ["Missing benchmark summary and cases"],
                "mode": mode
            }
        
        # Sort by N descending
        sorted_cases = sorted(cases, key=lambda x: x.get('N', 0), reverse=True)
        max_case = sorted_cases[0]
        max_n = max_case.get('N')
        
        # Alias support for case keys
        build_time = max_case.get('build_s') or max_case.get('build_time_s') or max_case.get('build_time_seconds')
        memory = max_case.get('mem_mb') or max_case.get('memory_mb') or max_case.get('mem_mb_at_maxN')
        matvec_ms = max_case.get('matvec_ms')
        
        if reciprocity is None:
            reciprocity = max_case.get('reciprocity')

    # Handle reciprocity if it's a list (reciprocity_range)
    if isinstance(reciprocity, list):
        reciprocity = max(reciprocity)

    if reciprocity is None or None in (max_n, build_time, memory):
        return {
            "verdict": "FAIL",
            "reasons": ["Could not extract all required metrics (N, build_time, memory, reciprocity)"],
            "mode": mode
        }

    reasons = []
    verdict = "PASS"

    # Check FAIL conditions
    if max_n < min_n:
        verdict = "FAIL"
        reasons.append(f"max_N ({max_n}) < {min_n} (mode: {mode})")
    if build_time > MAX_BUILD_TIME_S:
        verdict = "FAIL"
        reasons.append(f"build_time_s ({build_time}) > {MAX_BUILD_TIME_S}")
    if memory > MAX_MEMORY_MB:
        verdict = "FAIL"
        reasons.append(f"memory_mb ({memory}) > {MAX_MEMORY_MB}")
    if reciprocity > MAX_RECIPROCITY:
        verdict = "FAIL"
        reasons.append(f"reciprocity ({reciprocity}) > {MAX_RECIPROCITY}")

    # Check WARN conditions (if not already FAIL)
    if verdict == "PASS":
        # WARN if near limits (within 5% for N, 5% for others)
        if min_n < max_n < min_n * 1.05:
            verdict = "WARN"
            reasons.append(f"max_N ({max_n}) is near minimum limit ({min_n})")
        if 0.95 * MAX_BUILD_TIME_S < build_time < MAX_BUILD_TIME_S:
            verdict = "WARN"
            reasons.append(f"build_time_s ({build_time}) is near maximum limit ({MAX_BUILD_TIME_S})")
        if 0.95 * MAX_MEMORY_MB < memory < MAX_MEMORY_MB:
            verdict = "WARN"
            reasons.append(f"memory_mb ({memory}) is near maximum limit ({MAX_MEMORY_MB})")
        if 0.95 * MAX_RECIPROCITY < reciprocity < MAX_RECIPROCITY:
            verdict = "WARN"
            reasons.append(f"reciprocity ({reciprocity}) is near maximum limit ({MAX_RECIPROCITY})")
        
        # Optional: Matvec Sanity check
        if matvec_ms is not None:
             if matvec_ms > 10000:
                 verdict = "WARN"
                 reasons.append(f"matvec_ms ({matvec_ms:.2f}) is suspiciously high (>10s)")
             
             # Production regression check: current gold ~9.18ms, 1.25x threshold ~11.5ms
             if mode == "production" and max_n >= 10000 and matvec_ms > 11.5:
                 if verdict == "PASS": verdict = "WARN"
                 reasons.append(f"Matvec regression detected: {matvec_ms:.2f}ms > 11.5ms threshold (+25% vs gold)")

    result = {
        "verdict": verdict,
        "mode": mode,
        "file": os.path.basename(receipt_path),
        "max_N": max_n,
        "build_time_s_at_maxN": build_time,
        "mem_mb_at_maxN": memory,
        "matvec_ms": matvec_ms,
        "reciprocity": reciprocity,
        "reasons": reasons
    }
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify an OperatorPack receipt against policy gates.")
    parser.add_argument("receipt", help="Path to the operatorpack.json file")
    parser.add_argument("--mode", choices=["production", "exploration"], default="production", help="Verification mode (default: production)")
    
    args = parser.parse_args()
    
    res = verify_receipt(args.receipt, mode=args.mode)
    
    print(json.dumps(res, indent=2))
    
    if res["verdict"] == "PASS":
        sys.exit(0)
    elif res["verdict"] == "WARN":
        sys.exit(1)
    else:
        sys.exit(2)
