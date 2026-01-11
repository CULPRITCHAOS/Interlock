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
touch "${ARTIFACT_DIR}/stdout.log" "${ARTIFACT_DIR}/stderr.log"
touch "${ARTIFACT_DIR}/findings.txt"

log_msg "$ARTIFACT_DIR" "Starting public safety check"
log_msg "$ARTIFACT_DIR" "Run ID: ${RUN_ID}"

EXIT_CODE=0
FINDINGS_COUNT=0

# Helper to record findings
record_finding() {
    local category="$1"
    local detail="$2"
    echo "[${category}] ${detail}" >> "${ARTIFACT_DIR}/findings.txt"
    log_err "$ARTIFACT_DIR" "[${category}] ${detail}"
    FINDINGS_COUNT=$((FINDINGS_COUNT + 1))
}

# ============================================
# Check 1: PII / Machine Paths
# ============================================
log_msg "$ARTIFACT_DIR" "Check 1/4: Scanning for PII/machine paths..."

# Get tracked files, excluding safe directories
TRACKED_FILES=$(git ls-files | grep -v -E '^(\.claude/|\.agent/|node_modules/|\.git/)' || true)

if [ -n "$TRACKED_FILES" ]; then
    # Check for Windows paths
    PII_MATCHES=$(echo "$TRACKED_FILES" | xargs grep -l -E 'C:\\Users\\|C:/Users/' 2>/dev/null || true)
    for match in $PII_MATCHES; do
        record_finding "PII" "Windows user path found in: $match"
        EXIT_CODE=1
    done

    # Check for macOS/Linux paths
    PII_MATCHES=$(echo "$TRACKED_FILES" | xargs grep -l -E '/Users/[a-zA-Z]|/home/[a-zA-Z]' 2>/dev/null || true)
    for match in $PII_MATCHES; do
        record_finding "PII" "Unix user path found in: $match"
        EXIT_CODE=1
    done
fi

if [ $EXIT_CODE -eq 0 ]; then
    log_msg "$ARTIFACT_DIR" "Check 1/4: PASS - No PII paths found"
else
    log_err "$ARTIFACT_DIR" "Check 1/4: FAIL - PII paths detected"
fi

# ============================================
# Check 2: Secret Patterns
# ============================================
log_msg "$ARTIFACT_DIR" "Check 2/4: Scanning for secret patterns..."

SECRET_PATTERNS=(
    'AKIA[0-9A-Z]{16}'                    # AWS Access Key
    'sk-[a-zA-Z0-9]{48}'                  # OpenAI API Key
    'ghp_[a-zA-Z0-9]{36}'                 # GitHub Personal Access Token
    'gho_[a-zA-Z0-9]{36}'                 # GitHub OAuth Token
    'glpat-[a-zA-Z0-9\-]{20}'             # GitLab Personal Access Token
    'xox[baprs]-[0-9a-zA-Z\-]+'           # Slack Token
    '-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----'  # Private Key Block
    'api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9]{20,}'  # Generic API Key
)

CURRENT_CHECK_FAILED=0
for pattern in "${SECRET_PATTERNS[@]}"; do
    if [ -n "$TRACKED_FILES" ]; then
        MATCHES=$(echo "$TRACKED_FILES" | xargs grep -l -E "$pattern" 2>/dev/null || true)
        for match in $MATCHES; do
            # Exclude test fixtures and documentation
            if [[ ! "$match" =~ (test|example|fixture|\.md$) ]]; then
                record_finding "SECRET" "Pattern '$pattern' found in: $match"
                CURRENT_CHECK_FAILED=1
            fi
        done
    fi
done

if [ $CURRENT_CHECK_FAILED -eq 1 ]; then
    EXIT_CODE=1
    log_err "$ARTIFACT_DIR" "Check 2/4: FAIL - Secret patterns detected"
else
    log_msg "$ARTIFACT_DIR" "Check 2/4: PASS - No secrets found"
fi

# ============================================
# Check 3: Forbidden Content (Internal Details)
# ============================================
log_msg "$ARTIFACT_DIR" "Check 3/4: Scanning for forbidden content..."

FORBIDDEN_PATTERNS=(
    'enforcement heuristics'
    'private rules'
    'internal-only'
    'DO NOT PUBLISH'
    # Note: CONFIDENTIAL removed - commonly used in legitimate security docs
)

CURRENT_CHECK_FAILED=0
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    if [ -n "$TRACKED_FILES" ]; then
        MATCHES=$(echo "$TRACKED_FILES" | xargs grep -l -i "$pattern" 2>/dev/null || true)
        for match in $MATCHES; do
            # Exclude this script and documentation about the check
            if [[ ! "$match" =~ (public_safety_check\.sh|AI_COLLAB_SAFETY\.md) ]]; then
                record_finding "FORBIDDEN" "Pattern '$pattern' found in: $match"
                CURRENT_CHECK_FAILED=1
            fi
        done
    fi
done

if [ $CURRENT_CHECK_FAILED -eq 1 ]; then
    EXIT_CODE=1
    log_err "$ARTIFACT_DIR" "Check 3/4: FAIL - Forbidden content detected"
else
    log_msg "$ARTIFACT_DIR" "Check 3/4: PASS - No forbidden content found"
fi

# ============================================
# Check 4: Artifact Leakage
# ============================================
log_msg "$ARTIFACT_DIR" "Check 4/4: Checking for tracked artifacts..."

ARTIFACT_PATTERNS=(
    'receipts/approved/'
    'receipts/rejected/'
    'receipts/summary/'
    'results/badge/'
    '\.verdict\.json$'
)

CURRENT_CHECK_FAILED=0
for pattern in "${ARTIFACT_PATTERNS[@]}"; do
    MATCHES=$(git ls-files | grep -E "$pattern" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
        for match in $MATCHES; do
            # Exclude .gitkeep files (structural placeholders are OK)
            if [[ ! "$match" =~ \.gitkeep$ ]]; then
                record_finding "ARTIFACT" "Tracked artifact: $match"
                CURRENT_CHECK_FAILED=1
            fi
        done
    fi
done

if [ $CURRENT_CHECK_FAILED -eq 1 ]; then
    EXIT_CODE=1
    log_err "$ARTIFACT_DIR" "Check 4/4: FAIL - Tracked artifacts detected"
else
    log_msg "$ARTIFACT_DIR" "Check 4/4: PASS - No artifact leakage"
fi

# ============================================
# Finalize
# ============================================
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS="PASS"
[ $EXIT_CODE -ne 0 ] && STATUS="FAIL"

write_meta "$ARTIFACT_DIR" "public_safety_check" "$EXIT_CODE" "$STATUS" "$START_TIME" "$END_TIME"

# Write detailed summary
cat > "${ARTIFACT_DIR}/summary.md" << EOF
# Public Safety Check Summary

**Status**: ${STATUS}
**Exit Code**: ${EXIT_CODE}
**Findings Count**: ${FINDINGS_COUNT}
**Artifact Directory**: \`${ARTIFACT_DIR}\`
**Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Checks Performed

1. **PII/Machine Paths** - Scan for hardcoded user paths
2. **Secret Patterns** - Scan for API keys, tokens, private keys
3. **Forbidden Content** - Scan for internal-only markers
4. **Artifact Leakage** - Check for tracked receipts/verdicts

## Findings

$(if [ -s "${ARTIFACT_DIR}/findings.txt" ]; then cat "${ARTIFACT_DIR}/findings.txt"; else echo "None"; fi)

## Artifacts

- \`meta.json\` - Run metadata
- \`findings.txt\` - Detailed findings
- \`stdout.log\` - Standard output
- \`stderr.log\` - Standard error
EOF

log_msg "$ARTIFACT_DIR" "Public safety check complete: ${STATUS}"
log_msg "$ARTIFACT_DIR" "Findings: ${FINDINGS_COUNT}"
log_msg "$ARTIFACT_DIR" "Artifacts: ${ARTIFACT_DIR}"

exit $EXIT_CODE
