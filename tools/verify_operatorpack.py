import json
import sys
import os

# Thresholds
MIN_MAX_N = 10000
MAX_BUILD_TIME_S = 150.0
MAX_MEMORY_MB = 500.0
MAX_RECIPROCITY = 1e-15

def verify_receipt(receipt_path):
    if not os.path.exists(receipt_path):
        return {
            "verdict": "FAIL",
            "reasons": [f"File not found: {receipt_path}"]
        }

    try:
        with open(receipt_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        return {
            "verdict": "FAIL",
            "reasons": [f"Failed to parse JSON: {str(e)}"]
        }

    # Validate required keys
    required_keys = ['operatorpack_version', 'created_at', 'project', 'environment', 'geometry', 'operator', 'benchmarks']
    missing_keys = [k for k in required_keys if k not in data]
    if missing_keys:
        return {
            "verdict": "FAIL",
            "reasons": [f"Missing required keys: {', '.join(missing_keys)}"]
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

    # Fallback to cases if summary is missing
    if max_n is None or build_time is None or memory is None:
        cases = verify_scaling.get('cases', [])
        if not cases:
            return {
                "verdict": "FAIL",
                "reasons": ["Missing benchmark summary and cases"]
            }
        
        # Sort by N descending
        sorted_cases = sorted(cases, key=lambda x: x.get('N', 0), reverse=True)
        max_case = sorted_cases[0]
        max_n = max_case.get('N')
        
        # Alias support for case keys
        build_time = max_case.get('build_s') or max_case.get('build_time_s') or max_case.get('build_time_seconds')
        memory = max_case.get('mem_mb') or max_case.get('memory_mb') or max_case.get('mem_mb_at_maxN')
        
        if reciprocity is None:
            reciprocity = max_case.get('reciprocity')

    # Handle reciprocity if it's a list (reciprocity_range)
    if isinstance(reciprocity, list):
        reciprocity = max(reciprocity)

    if reciprocity is None or None in (max_n, build_time, memory):
        return {

            "verdict": "FAIL",
            "reasons": ["Could not extract all required metrics (N, build_time, memory, reciprocity)"]
        }

    reasons = []
    verdict = "PASS"

    # Check FAIL conditions
    if max_n < MIN_MAX_N:
        verdict = "FAIL"
        reasons.append(f"max_N ({max_n}) < {MIN_MAX_N}")
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
        # Within 10% of limit
        # For MIN_MAX_N: 10000 to 11000. But if exactly 10000, let's PASS if it's the target.
        # Actually, let's only WARN if it's within 10% margin of the FAIL zone.
        # For a MIN: WARN if MIN < value < MIN * 1.05 (narrower margin for pass)
        if MIN_MAX_N < max_n < MIN_MAX_N * 1.05:
            verdict = "WARN"
            reasons.append(f"max_N ({max_n}) is near minimum limit ({MIN_MAX_N})")
        # For a MAX: WARN if 0.95 * MAX < value < MAX
        if 0.95 * MAX_BUILD_TIME_S < build_time < MAX_BUILD_TIME_S:
            verdict = "WARN"
            reasons.append(f"build_time_s ({build_time}) is near maximum limit ({MAX_BUILD_TIME_S})")
        if 0.95 * MAX_MEMORY_MB < memory < MAX_MEMORY_MB:
            verdict = "WARN"
            reasons.append(f"memory_mb ({memory}) is near maximum limit ({MAX_MEMORY_MB})")
        if 0.95 * MAX_RECIPROCITY < reciprocity < MAX_RECIPROCITY:
            verdict = "WARN"
            reasons.append(f"reciprocity ({reciprocity}) is near maximum limit ({MAX_RECIPROCITY})")


    result = {
        "verdict": verdict,
        "file": os.path.basename(receipt_path),
        "max_N": max_n,
        "build_time_s_at_maxN": build_time,
        "mem_mb_at_maxN": memory,
        "reciprocity": reciprocity,
        "reasons": reasons
    }
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/verify_operatorpack.py <path_to_operatorpack.json>")
        sys.exit(2)

    path = sys.argv[1]
    res = verify_receipt(path)
    
    print(json.dumps(res, indent=2))
    
    if res["verdict"] == "PASS":
        sys.exit(0)
    elif res["verdict"] == "WARN":
        sys.exit(1)
    else:
        sys.exit(2)
