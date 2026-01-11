#!/usr/bin/env bash
# Interlock Claude Wrapper - Common Utilities
# ============================================
# Shared functions for all Claude wrapper scripts.
# Provides: artifact directory creation, meta.json writing, logging.

set -euo pipefail

# Generate UTC timestamp for run ID
generate_run_id() {
    date -u +%Y%m%dT%H%M%SZ
}

# Create artifact directory and return path
# Usage: ARTIFACT_DIR=$(create_artifact_dir "smoke")
create_artifact_dir() {
    local script_name="${1:-unknown}"
    local run_id="${RUN_ID:-$(generate_run_id)}"
    local artifact_dir="./artifacts/claude/${run_id}/${script_name}"

    mkdir -p "$artifact_dir"
    echo "$artifact_dir"
}

# Write meta.json with run metadata
# Usage: write_meta "$artifact_dir" "smoke" 0 "PASS"
write_meta() {
    local artifact_dir="$1"
    local script_name="$2"
    local exit_code="$3"
    local status="$4"
    local start_time="${5:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
    local end_time="${6:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

    cat > "${artifact_dir}/meta.json" << EOF
{
  "script": "${script_name}",
  "run_id": "${RUN_ID:-unknown}",
  "start_time": "${start_time}",
  "end_time": "${end_time}",
  "exit_code": ${exit_code},
  "status": "${status}",
  "artifact_dir": "${artifact_dir}",
  "hostname": "$(hostname 2>/dev/null || echo 'unknown')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
}
EOF
}

# Write summary.md with execution results
# Usage: write_summary "$artifact_dir" "smoke" 0 "Commands executed..."
write_summary() {
    local artifact_dir="$1"
    local script_name="$2"
    local exit_code="$3"
    local details="$4"
    local status="PASS"

    if [ "$exit_code" -ne 0 ]; then
        status="FAIL"
    fi

    cat > "${artifact_dir}/summary.md" << EOF
# ${script_name} Execution Summary

**Status**: ${status}
**Exit Code**: ${exit_code}
**Artifact Directory**: \`${artifact_dir}\`
**Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Commands Executed

${details}

## Artifacts

- \`meta.json\` - Run metadata
- \`stdout.log\` - Standard output
- \`stderr.log\` - Standard error
- \`summary.md\` - This file
EOF
}

# Log message to both console and file
# Usage: log_msg "$artifact_dir" "Running npm ci..."
log_msg() {
    local artifact_dir="$1"
    local msg="$2"
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[${timestamp}] ${msg}" | tee -a "${artifact_dir}/stdout.log"
}

# Log error to both console and stderr file
# Usage: log_err "$artifact_dir" "npm ci failed"
log_err() {
    local artifact_dir="$1"
    local msg="$2"
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[${timestamp}] ERROR: ${msg}" | tee -a "${artifact_dir}/stderr.log" >&2
}

# Export functions for subshells
export -f generate_run_id create_artifact_dir write_meta write_summary log_msg log_err
