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

def process_directory(dir_path):
    path = Path(dir_path)
    if not path.exists():
        return []

    print(f"Scanning {path} for receipts...")
    receipts = []
    for f in path.glob("*.json"):
        if f.name.endswith(".verdict.json"): continue
        
        try:
            with open(f, "r", encoding="utf-8-sig") as rfile:
                data = json.load(rfile)
                
            verdict_file = f.with_name(f.name + ".verdict.json")
            verdict = "N/A"
            if verdict_file.exists():
                with open(verdict_file, "r", encoding="utf-8-sig") as vfile:
                    v_data = json.load(vfile)
                    verdict = v_data.get("verdict", "UNKNOWN")

            summary = get_val(data, "benchmarks.verify_scaling.summary")
            mv_ms = summary.get("matvec_ms_at_maxN") if summary else None
            
            # Fallback to cases if missing in summary
            if mv_ms is None and get_val(data, "benchmarks.verify_scaling.cases"):
                 cases = data["benchmarks"]["verify_scaling"]["cases"]
                 ordered = sorted(cases, key=lambda x: x.get("N", 0), reverse=True)
                 mv_ms = ordered[0].get("matvec_ms")

            receipt_info = {
                "filename": f.name,
                "created_at": data.get("created_at"),
                "max_N": summary.get("max_N") if summary else None,
                "build_s": summary.get("build_s_at_maxN") if summary else None,
                "mem_mb": summary.get("mem_mb_at_maxN") if summary else None,
                "matvec_ms": mv_ms,
                "reciprocity": max(summary.get("reciprocity_range") or [0]) if summary else None,
                "verdict": verdict,
                "timestamp": datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")),
                "regressions": {}
            }
            receipts.append(receipt_info)
        except Exception as e:
            print(f"Warning: Could not process {f.name}: {e}")
    
    receipts.sort(key=lambda x: x["timestamp"])
    
    # Regression tracking within directory
    for i in range(1, len(receipts)):
        curr, prev = receipts[i], receipts[i-1]
        if curr["max_N"] == prev["max_N"]:
            for key in ["build_s", "mem_mb", "matvec_ms"]:
                if prev.get(key) and curr.get(key) and prev[key] > 0:
                    curr["regressions"][key] = (curr[key] - prev[key]) / prev[key]
            if prev["reciprocity"] and curr["reciprocity"] and prev["reciprocity"] > 0:
                curr["regressions"]["reciprocity"] = curr["reciprocity"] / prev["reciprocity"]
    
    return receipts

def generate_table(receipts):
    if not receipts: return ["*No receipts in this tier.*"]
    lines = ["| Filename | Created At | Max N | Build (s) | Mem (MB) | Matvec (ms) | Reciprocity | Verdict |",
             "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"]
    for r in receipts:
        build_str = f"{r['build_s']:.2f}"
        if "build_s" in r["regressions"]:
            c = r["regressions"]["build_s"]
            build_str += f" ({'+' if c > 0 else ''}{c:.1%})"
        
        mem_str = f"{r['mem_mb']:.1f}"
        if "mem_mb" in r["regressions"]:
            c = r["regressions"]["mem_mb"]
            mem_str += f" ({'+' if c > 0 else ''}{c:.1%})"
            
        mv_str = f"{r['matvec_ms']:.2f}" if r.get('matvec_ms') else "-"
        if "matvec_ms" in r["regressions"]:
            c = r["regressions"]["matvec_ms"]
            mv_str += f" ({'+' if c > 0 else ''}{c:.1%})"

        lines.append(f"| `{r['filename']}` | {r['created_at']} | {r['max_N']} | {build_str} | {mem_str} | {mv_str} | {r['reciprocity']:.2e} | {r['verdict']} |")
    return lines

def summarize(prod_dir, explore_dir, out_dir):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    prod_receipts = process_directory(prod_dir)
    explore_receipts = process_directory(explore_dir)

    md = ["# OperatorPack Receipts Summary"]
    
    md.append("\n## 🏆 Production Tier (Strict)")
    md.extend(generate_table(prod_receipts))
    if prod_receipts:
        b_build = min(prod_receipts, key=lambda x: x["build_s"] or 1e9)
        b_mem = min(prod_receipts, key=lambda x: x["mem_mb"] or 1e9)
        b_recip = min(prod_receipts, key=lambda x: x["reciprocity"] or 1e9)
        b_mv = min([r for r in prod_receipts if r.get("matvec_ms")], key=lambda x: x["matvec_ms"], default=None)

        md.append(f"\n- **Fastest Build**: {b_build['build_s']:.2f}s (`{b_build['filename']}`)")
        md.append(f"- **Leanest Memory**: {b_mem['mem_mb']:.1f}MB (`{b_mem['filename']}`)")
        md.append(f"- **Best Reciprocity**: {b_recip['reciprocity']:.2e} (`{b_recip['filename']}`)")
        if b_mv:
            md.append(f"- **Fastest Matvec**: {b_mv['matvec_ms']:.2f}ms (`{b_mv['filename']}`)")

    md.append("\n## 🔬 Exploration Tier (Experimental)")
    md.extend(generate_table(explore_receipts))
    if explore_receipts:
        b_build = min(explore_receipts, key=lambda x: x["build_s"] or 1e9)
        b_mem = min(explore_receipts, key=lambda x: x["mem_mb"] or 1e9)
        b_recip = min(explore_receipts, key=lambda x: x["reciprocity"] or 1e9)
        b_mv = min([r for r in explore_receipts if r.get("matvec_ms")], key=lambda x: x["matvec_ms"], default=None)

        md.append(f"\n- **Fastest Build**: {b_build['build_s']:.2f}s (`{b_build['filename']}`)")
        md.append(f"- **Leanest Memory**: {b_mem['mem_mb']:.1f}MB (`{b_mem['filename']}`)")
        md.append(f"- **Best Reciprocity**: {b_recip['reciprocity']:.2e} (`{b_recip['filename']}`)")
        if b_mv:
            md.append(f"- **Fastest Matvec**: {b_mv['matvec_ms']:.2f}ms (`{b_mv['filename']}`)")

    with open(out_path / "RECEIPTS_SUMMARY.md", "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    
    # JSON for automation
    summary_json = {
        "production": [{k: v for k, v in r.items() if k != 'timestamp'} for r in prod_receipts],
        "exploration": [{k: v for k, v in r.items() if k != 'timestamp'} for r in explore_receipts]
    }
    with open(out_path / "receipts_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_json, f, indent=2)

    print(f"Summary generated at {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod-dir", default="receipts/approved", help="Production approved dir")
    parser.add_argument("--explore-dir", default="receipts/approved_experimental", help="Exploration approved dir")
    parser.add_argument("--out", default="receipts/summary", help="Output directory")
    args = parser.parse_args()
    
    summarize(args.prod_dir, args.explore_dir, args.out)
