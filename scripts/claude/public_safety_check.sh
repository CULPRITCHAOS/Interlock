#!/usr/bin/env bash
# Interlock Claude Wrapper - Public Safety Check
# ===============================================
# Scans for PII, secrets, and forbidden content.
# Fail-closed: any match = non-zero exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

cd "$REPO_ROOT"

# Initialize run
export RUN_ID="${RUN_ID:-$(generate_run_id)}"
ARTIFACT_DIR=$(create_artifact_dir "public_safety_check")
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize log files
rm -f "${ARTIFACT_DIR}/findings.txt"
touch "${ARTIFACT_DIR}/findings.txt"
touch "${ARTIFACT_DIR}/stdout.log" "${ARTIFACT_DIR}/stderr.log"

log_msg "$ARTIFACT_DIR" "Starting public safety check (Run ID: ${RUN_ID})"

EXIT_CODE=0
FINDINGS_COUNT=0

# Patterns
SECRET_PATTERNS=(
    'AKIA[0-9A-Z]{16}'
    'sk-[a-zA-Z0-9]{48}'
    'ghp_[a-zA-Z0-9]{36}'
    'gho_[a-zA-Z0-9]{36}'
    'glpat-[a-zA-Z0-9\-]{20}'
    'xox[baprs]-[0-9a-zA-Z\-]+'
    '-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----'
    'api[_-]?key[[:space:]]*[:=][[:space:]]*[a-zA-Z0-9]{20,}'
)
FORBIDDEN_PATTERNS=(
    'enforcement heuristics'
    'private rules'
    'internal-only'
    'DO NOT PUBLISH'
)

# Helper to record findings
record_safety_finding() {
    local category="$1"
    local message="$2"
    local target_file="$3"

    # Normalize path for matching
    local norm
    norm=$(echo "$target_file" | tr '\\' '/' | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # Narrow Allowlist: Specific files that legitimately contain these patterns as documentation/tools
    case "$norm" in
        "docs/AI_COLLAB_SAFETY.md" | ".claude/rules/security-public-repo.md" | ".agent/workflows/security-public-repo.md" | ".claude/skills/interlock-ops/SKILL.md" | ".claude/settings.json")
            log_msg "$ARTIFACT_DIR" "  [SKIP] Allowlisted doc match in $norm: $message"
            return 0
            ;;
        "tools/precommit_safety_scan.ps1" | "scripts/claude/public_safety_check.sh")
            log_msg "$ARTIFACT_DIR" "  [SKIP] Allowlisted script match in $norm: $message"
            return 0
            ;;
    esac

    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[${RUN_ID}] [${ts}] [${category}] ${message} in ${target_file}" >> "${ARTIFACT_DIR}/findings.txt"
    log_err "$ARTIFACT_DIR" "[${category}] ${message} in ${target_file}"
}

# Scan ALL tracked files for maximum safety (no global skips)
# Use process substitution to avoid subshell scope issues
while IFS= read -r f; do
    # Skip directories we never scan (node_modules is huge and external)
    [[ "$f" == node_modules/* ]] && continue
    [[ "$f" == .git/* ]] && continue
    
    # PII Check
    # Regex: file:/// | c:/Users | C:/Users | c:\Users | C:\Users | /Users/name | /home/name
    if grep -q -E 'file:///|[cC]:/Users/|[cC]:\\Users\\|/Users/[[:alpha:]]|/home/[[:alpha:]]' "$f" 2>/dev/null; then
         record_safety_finding "PII" "Absolute path detected" "$f"
    fi

    # Secrets Check
    for p in "${SECRET_PATTERNS[@]}"; do
        if grep -q -E "$p" "$f" 2>/dev/null; then
            record_safety_finding "SECRET" "Pattern '$p' detected" "$f"
        fi
    done

    # Forbidden Check
    for p in "${FORBIDDEN_PATTERNS[@]}"; do
        if grep -qi "$p" "$f" 2>/dev/null; then
            record_safety_finding "FORBIDDEN" "Pattern '$p' detected" "$f"
        fi
    done

    # Artifact Leakage Check (Never skipped)
    if echo "$f" | grep -qiE "(receipts/(approved|rejected|summary)/|results/badge/|\.verdict\.json$)" && [[ "$f" != *".gitkeep" ]]; then
        record_safety_finding "ARTIFACT" "Tracked artifact" "$f"
    fi
done < <(git ls-files)

# Finalize - Fail-closed backstop: recalculate findings count from file
FINDINGS_COUNT=$(wc -l < "${ARTIFACT_DIR}/findings.txt" | tr -d ' ')
if [ "$FINDINGS_COUNT" -gt 0 ]; then
    EXIT_CODE=1
fi

END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS="PASS"
[ $EXIT_CODE -ne 0 ] && STATUS="FAIL"

write_meta "$ARTIFACT_DIR" "public_safety_check" "$EXIT_CODE" "$STATUS" "$START_TIME" "$END_TIME"

cat > "${ARTIFACT_DIR}/summary.md" << EOF
# Public Safety Check Summary
**Status**: ${STATUS}
**Findings**: ${FINDINGS_COUNT}
**Run ID**: ${RUN_ID}

## Findings
$(if [ -s "${ARTIFACT_DIR}/findings.txt" ]; then cat "${ARTIFACT_DIR}/findings.txt"; else echo "None"; fi)
EOF

log_msg "$ARTIFACT_DIR" "Public safety check complete: ${STATUS}"
exit $EXIT_CODE
