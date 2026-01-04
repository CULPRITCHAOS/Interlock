import json
import sys
import os

def extract_metrics(receipt_path):
    try:
        with open(receipt_path, 'r') as f:
            data = json.load(f)
    except:
        return None

    benchmarks = data.get('benchmarks', {})
    verify_scaling = benchmarks.get('verify_scaling', {})
    summary = verify_scaling.get('summary', {})
    
    max_n = summary.get('max_N')
    build_time = summary.get('build_s_at_maxN')
    memory = summary.get('mem_mb_at_maxN')
    reciprocity = summary.get('reciprocity_range')

    if max_n is None or build_time is None or memory is None:
        cases = verify_scaling.get('cases', [])
        if cases:
            sorted_cases = sorted(cases, key=lambda x: x.get('N', 0), reverse=True)
            max_case = sorted_cases[0]
            max_n = max_case.get('N')
            build_time = max_case.get('build_time_s')
            memory = max_case.get('memory_mb')
            if reciprocity is None:
                reciprocity = max_case.get('reciprocity')

    # Handle reciprocity if it's a list (reciprocity_range)
    if isinstance(reciprocity, list):
        reciprocity = max(reciprocity)

    # Date and Tag from JSON or filename

    date = data.get('created_at', '').split('T')[0]
    filename = os.path.basename(receipt_path)
    
    # Simple tag extraction from filename if possible (e.g. N10k)
    tag = "N/A"
    if 'N10k' in filename:
        tag = 'N10k'
    elif 'r20' in filename:
        tag = 'r20'

    return {
        "filename": filename,
        "date": date,
        "tag": tag,
        "max_N": max_n,
        "build_time": build_time,
        "mem": memory,
        "reciprocity": reciprocity
    }

def append_to_index(receipt_path, index_path):
    metrics = extract_metrics(receipt_path)
    if not metrics:
        print(f"Error: Could not extract metrics from {receipt_path}")
        return

    # Create index file if it doesn't exist
    if not os.path.exists(index_path):
        with open(index_path, 'w') as f:
            f.write("# OperatorPack Receipt Index\n\n")
            f.write("| Filename | Date | Tag | Max_N | Build_Time_s | Memory_MB | Reciprocity |\n")
            f.write("|:---|:---|:---|:---|:---|:---|:---|\n")

    # Read existing index to check for duplicates
    with open(index_path, 'r') as f:
        lines = f.readlines()
    
    if any(metrics["filename"] in line for line in lines):
        print(f"File {metrics['filename']} already in index. Skipping.")
        return

    # Format row as Markdown Table row
    row = f"| {metrics['filename']} | {metrics['date']} | {metrics['tag']} | {metrics['max_N']} | {metrics['build_time']:.2f} | {metrics['mem']:.1f} MB | {metrics['reciprocity']:.2e} |\n"
    
    with open(index_path, 'a') as f:
        f.write(row)

    
    print(f"Appended {metrics['filename']} to {index_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python tools/append_receipt_index.py <path_to_operatorpack.json> <path_to_RECEIPTS_INDEX.md>")
        sys.exit(1)

    receipt = sys.argv[1]
    index = sys.argv[2]
    append_to_index(receipt, index)
