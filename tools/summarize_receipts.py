import os
import json
import argparse
from datetime import datetime
from pathlib import Path

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

def summarize(approved_dir, out_dir):
    approved_path = Path(approved_dir)
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    print(f"Scanning {approved_path} for approved receipts...")
    
    receipts = []
    # Only load .json files that don't end in .verdict.json
    for f in approved_path.glob("*.json"):
        if f.name.endswith(".verdict.json"):
            continue
        
        try:
            with open(f, "r", encoding="utf-8-sig") as rfile:
                data = json.load(rfile)
                
            # Find verdict
            verdict_file = f.with_name(f.name + ".verdict.json")
            verdict = "N/A"
            if verdict_file.exists():
                with open(verdict_file, "r", encoding="utf-8-sig") as vfile:
                    v_data = json.load(vfile)
                    verdict = v_data.get("verdict", "UNKNOWN")

            # Extract metrics at maxN
            summary = get_val(data, "benchmarks.verify_scaling.summary")
            cases = get_val(data, "benchmarks.verify_scaling.cases") or []
            
            receipt_info = {
                "filename": f.name,
                "created_at": data.get("created_at"),
                "max_N": summary.get("max_N") if summary else None,
                "build_s": summary.get("build_s_at_maxN") if summary else None,
                "mem_mb": summary.get("mem_mb_at_maxN") if summary else None,
                "reciprocity": max(summary.get("reciprocity_range") or [0]) if summary else None,
                "verdict": verdict,
                "timestamp": datetime.fromisoformat(data["created_at"].replace("Z", "+00:00"))
            }
            receipts.append(receipt_info)
        except Exception as e:
            print(f"Warning: Could not process {f.name}: {e}")

    if not receipts:
        print("No approved receipts found.")
        return

    # Sort by timestamp
    receipts.sort(key=lambda x: x["timestamp"])

    # Regression tracking
    for i in range(len(receipts)):
        curr = receipts[i]
        curr["regressions"] = {}
        if i > 0:
            prev = receipts[i-1]
            if curr["max_N"] == prev["max_N"]:
                for key in ["build_s", "mem_mb"]:
                    if prev[key] and curr[key] and prev[key] > 0:
                        change = (curr[key] - prev[key]) / prev[key]
                        curr["regressions"][key] = change
                if prev["reciprocity"] and curr["reciprocity"] and prev["reciprocity"] > 0:
                    recip_change = curr["reciprocity"] / prev["reciprocity"]
                    curr["regressions"]["reciprocity"] = recip_change

    # Best so far
    best_build = min(receipts, key=lambda x: x["build_s"] if x["build_s"] else 1e9)
    best_mem = min(receipts, key=lambda x: x["mem_mb"] if x["mem_mb"] else 1e9)
    best_recip = min(receipts, key=lambda x: x["reciprocity"] if x["reciprocity"] else 1e9)

    # Generate Markdown Summary
    md = []
    md.append("# OperatorPack Receipts Summary")
    md.append(f"\n- **Count**: {len(receipts)} approved receipts")
    md.append(f"- **Latest**: {receipts[-1]['filename']} ({receipts[-1]['created_at']})")
    
    md.append("\n## Audit Table")
    md.append("| Filename | Created At | Max N | Build (s) | Mem (MB) | Reciprocity | Verdict |")
    md.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    for r in receipts:
        build_str = f"{r['build_s']:.2f}"
        if "build_s" in r["regressions"]:
            change = r["regressions"]["build_s"]
            build_str += f" ({'+' if change > 0 else ''}{change:.1%})"
            
        mem_str = f"{r['mem_mb']:.1f}"
        if "mem_mb" in r["regressions"]:
            change = r["regressions"]["mem_mb"]
            mem_str += f" ({'+' if change > 0 else ''}{change:.1%})"

        md.append(f"| `{r['filename']}` | {r['created_at']} | {r['max_N']} | {build_str} | {mem_str} | {r['reciprocity']:.2e} | {r['verdict']} |")

    md.append("\n## Hall of Famer (Best So Far)")
    md.append(f"- **Fastest Build**: {best_build['build_s']:.2f}s (`{best_build['filename']}`)")
    md.append(f"- **Leanest Memory**: {best_mem['mem_mb']:.1f}MB (`{best_mem['filename']}`)")
    md.append(f"- **Best Reciprocity**: {best_recip['reciprocity']:.2e} (`{best_recip['filename']}`)")

    # Save outputs
    with open(out_path / "RECEIPTS_SUMMARY.md", "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    
    with open(out_path / "receipts_summary.json", "w", encoding="utf-8") as f:
        summary_json = {
            "stats": {"count": len(receipts), "latest": receipts[-1]["filename"]},
            "receipts": [{k: v for k, v in r.items() if k != 'timestamp'} for r in receipts],
            "best": {
                "fastest_build": best_build["filename"],
                "leanest_memory": best_mem["filename"],
                "best_reciprocity": best_recip["filename"]
            }
        }
        json.dump(summary_json, f, indent=2)

    print(f"Summary generated at {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="receipts/approved", help="Directory of approved receipts")
    parser.add_argument("--out", default="receipts/summary", help="Output directory")
    args = parser.parse_args()
    
    summarize(args.dir, args.out)
