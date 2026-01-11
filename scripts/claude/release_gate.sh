#!/usr/bin/env bash
# Interlock Claude Wrapper - Release Gate
# ========================================
# Orchestrates all checks for release verification.
# Runs: smoke.sh, public_safety_check.sh, receipt_audit.sh
# Fail-closed: any step failure = gate failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

cd "$REPO_ROOT"

# Initialize run - shared across all sub-scripts
export RUN_ID="${RUN_ID:-$(generate_run_id)}"
ARTIFACT_DIR=$(create_artifact_dir "release_gate")
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize log files
touch "${ARTIFACT_DIR}/stdout.log" "${ARTIFACT_DIR}/stderr.log"

log_msg "$ARTIFACT_DIR" "=========================================="
log_msg "$ARTIFACT_DIR" "  INTERLOCK RELEASE GATE"
log_msg "$ARTIFACT_DIR" "=========================================="
log_msg "$ARTIFACT_DIR" "Run ID: ${RUN_ID}"
log_msg "$ARTIFACT_DIR" "Artifact directory: ${ARTIFACT_DIR}"
log_msg "$ARTIFACT_DIR" ""

EXIT_CODE=0
STEPS_PASSED=0
STEPS_FAILED=0

# Track sub-artifact directories
declare -a SUB_ARTIFACTS

# ============================================
# Step 1: Smoke Test
# ============================================
log_msg "$ARTIFACT_DIR" "[Step 1/3] Running smoke test..."

SMOKE_EXIT=0
if "${SCRIPT_DIR}/smoke.sh" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "[Step 1/3] smoke.sh: PASS"
    STEPS_PASSED=$((STEPS_PASSED + 1))
else
    SMOKE_EXIT=$?
    log_err "$ARTIFACT_DIR" "[Step 1/3] smoke.sh: FAIL (exit code: ${SMOKE_EXIT})"
    STEPS_FAILED=$((STEPS_FAILED + 1))
    EXIT_CODE=1
fi
SUB_ARTIFACTS+=("./artifacts/claude/${RUN_ID}/smoke")

# ============================================
# Step 2: Public Safety Check
# ============================================
log_msg "$ARTIFACT_DIR" "[Step 2/3] Running public safety check..."

SAFETY_EXIT=0
if "${SCRIPT_DIR}/public_safety_check.sh" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "[Step 2/3] public_safety_check.sh: PASS"
    STEPS_PASSED=$((STEPS_PASSED + 1))
else
    SAFETY_EXIT=$?
    log_err "$ARTIFACT_DIR" "[Step 2/3] public_safety_check.sh: FAIL (exit code: ${SAFETY_EXIT})"
    STEPS_FAILED=$((STEPS_FAILED + 1))
    EXIT_CODE=1
fi
SUB_ARTIFACTS+=("./artifacts/claude/${RUN_ID}/public_safety_check")

# ============================================
# Step 3: Receipt Audit
# ============================================
log_msg "$ARTIFACT_DIR" "[Step 3/3] Running receipt audit..."

AUDIT_EXIT=0
if "${SCRIPT_DIR}/receipt_audit.sh" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "[Step 3/3] receipt_audit.sh: PASS"
    STEPS_PASSED=$((STEPS_PASSED + 1))
else
    AUDIT_EXIT=$?
    log_err "$ARTIFACT_DIR" "[Step 3/3] receipt_audit.sh: FAIL (exit code: ${AUDIT_EXIT})"
    STEPS_FAILED=$((STEPS_FAILED + 1))
    EXIT_CODE=1
fi
SUB_ARTIFACTS+=("./artifacts/claude/${RUN_ID}/receipt_audit")

# ============================================
# Step 4: Vulnerability Audit (Informational)
# ============================================
log_msg "$ARTIFACT_DIR" "[Step 4/4] Running vulnerability audit (informational)..."

# Save JSON report for auditability
npm audit --json --omit=dev > "${ARTIFACT_DIR}/vulnerability_report.json" 2>> "${ARTIFACT_DIR}/stderr.log" || true

if npm audit --omit=dev >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "[Step 4/4] npm audit: PASS - No vulnerabilities found"
else
    log_msg "$ARTIFACT_DIR" "[Step 4/4] npm audit: WARNING - Dependencies have audit issues (see vulnerability_report.json)"
fi

# ============================================
# Finalize
# ============================================
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS="PASS"
[ $EXIT_CODE -ne 0 ] && STATUS="FAIL"

log_msg "$ARTIFACT_DIR" ""
log_msg "$ARTIFACT_DIR" "=========================================="
log_msg "$ARTIFACT_DIR" "  RELEASE GATE: ${STATUS}"
log_msg "$ARTIFACT_DIR" "=========================================="

write_meta "$ARTIFACT_DIR" "release_gate" "$EXIT_CODE" "$STATUS" "$START_TIME" "$END_TIME"

# Write bundle summary
cat > "${ARTIFACT_DIR}/summary.md" << EOF
# Release Gate Summary

**Status**: ${STATUS}
**Exit Code**: ${EXIT_CODE}
**Steps Passed**: ${STEPS_PASSED}/3
**Steps Failed**: ${STEPS_FAILED}/3
**Run ID**: \`${RUN_ID}\`
**Artifact Directory**: \`${ARTIFACT_DIR}\`
**Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Gate Results

| Step | Script | Status |
|------|--------|--------|
| 1 | smoke.sh | $([ $SMOKE_EXIT -eq 0 ] && echo "PASS" || echo "FAIL (exit: ${SMOKE_EXIT})") |
| 2 | public_safety_check.sh | $([ $SAFETY_EXIT -eq 0 ] && echo "PASS" || echo "FAIL (exit: ${SAFETY_EXIT})") |
| 3 | receipt_audit.sh | $([ $AUDIT_EXIT -eq 0 ] && echo "PASS" || echo "FAIL (exit: ${AUDIT_EXIT})") |
| 4 | npm audit | Informational (Check log) |

## Sub-Artifact Directories

$(for dir in "${SUB_ARTIFACTS[@]}"; do echo "- \`${dir}\`"; done)

## Verdict

$(if [ $EXIT_CODE -eq 0 ]; then
    echo "**GATE PASSED** - All checks completed successfully. Release may proceed."
else
    echo "**GATE FAILED** - One or more checks failed. Release is blocked."
    echo ""
    echo "Review the sub-artifact directories for detailed failure information."
fi)

## Artifacts

- \`meta.json\` - Run metadata
- \`summary.md\` - This file
- \`stdout.log\` - Aggregated standard output
- \`stderr.log\` - Aggregated standard error
EOF

log_msg "$ARTIFACT_DIR" "Artifacts: ${ARTIFACT_DIR}"

exit $EXIT_CODE
