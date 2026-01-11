#!/usr/bin/env bash
# Interlock Claude Wrapper - Receipt Audit
# =========================================
# Validates receipt/log schemas with positive and negative tests.
# Fail-closed: any validation failure = non-zero exit.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

cd "$REPO_ROOT"

# Initialize run
export RUN_ID="${RUN_ID:-$(generate_run_id)}"
ARTIFACT_DIR=$(create_artifact_dir "receipt_audit")
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize log files
touch "${ARTIFACT_DIR}/stdout.log" "${ARTIFACT_DIR}/stderr.log"

log_msg "$ARTIFACT_DIR" "Starting receipt audit"
log_msg "$ARTIFACT_DIR" "Run ID: ${RUN_ID}"

# Detect Python command (Windows uses py, Unix uses python3/python)
PYTHON_CMD=""
if command -v py &>/dev/null; then
    PYTHON_CMD="py"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    log_err "$ARTIFACT_DIR" "ERROR: Python not found in PATH"
    exit 1
fi
log_msg "$ARTIFACT_DIR" "Using Python command: $PYTHON_CMD"

EXIT_CODE=0
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================
# Test 1: JSONL Schema Validation
# ============================================
log_msg "$ARTIFACT_DIR" "Test 1: JSONL schema validation..."

if npx tsx scripts/validate-jsonl-schema.ts >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "Test 1: PASS - JSONL schema valid"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_err "$ARTIFACT_DIR" "Test 1: FAIL - JSONL schema validation failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    EXIT_CODE=1
fi

# ============================================
# Test 2: OperatorPack Positive Test
# ============================================
log_msg "$ARTIFACT_DIR" "Test 2: OperatorPack positive test (should PASS)..."

PASS_FIXTURE="receipts/examples/operatorpack_example_pass.json"
if [ -f "$PASS_FIXTURE" ]; then
    if $PYTHON_CMD tools/verify_operatorpack.py "$PASS_FIXTURE" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
        log_msg "$ARTIFACT_DIR" "Test 2: PASS - Valid receipt accepted"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_err "$ARTIFACT_DIR" "Test 2: FAIL - Valid receipt was rejected (unexpected)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        EXIT_CODE=1
    fi
else
    log_err "$ARTIFACT_DIR" "Test 2: SKIP - Fixture not found: $PASS_FIXTURE"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    EXIT_CODE=1
fi

# ============================================
# Test 3: OperatorPack Negative Test
# ============================================
log_msg "$ARTIFACT_DIR" "Test 3: OperatorPack negative test (should FAIL)..."

FAIL_FIXTURE="receipts/examples/operatorpack_example_fail.json"
if [ -f "$FAIL_FIXTURE" ]; then
    # This SHOULD fail, so we invert the logic
    if $PYTHON_CMD tools/verify_operatorpack.py "$FAIL_FIXTURE" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
        log_err "$ARTIFACT_DIR" "Test 3: FAIL - Invalid receipt was accepted (unexpected)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        EXIT_CODE=1
    else
        log_msg "$ARTIFACT_DIR" "Test 3: PASS - Invalid receipt correctly rejected"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
else
    log_err "$ARTIFACT_DIR" "Test 3: SKIP - Fixture not found: $FAIL_FIXTURE"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    EXIT_CODE=1
fi

# ============================================
# Test 4: Malformed JSON Negative Test
# ============================================
log_msg "$ARTIFACT_DIR" "Test 4: Malformed JSON negative test..."

# Create a temporary malformed fixture
MALFORMED_FIXTURE="${ARTIFACT_DIR}/malformed_test.json"
echo '{"invalid": json, missing_quotes}' > "$MALFORMED_FIXTURE"

# This SHOULD fail
if $PYTHON_CMD tools/verify_operatorpack.py "$MALFORMED_FIXTURE" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_err "$ARTIFACT_DIR" "Test 4: FAIL - Malformed JSON was accepted (unexpected)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    EXIT_CODE=1
else
    log_msg "$ARTIFACT_DIR" "Test 4: PASS - Malformed JSON correctly rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# ============================================
# Test 5: Missing Required Fields Negative Test
# ============================================
log_msg "$ARTIFACT_DIR" "Test 5: Missing required fields negative test..."

INCOMPLETE_FIXTURE="${ARTIFACT_DIR}/incomplete_test.json"
cat > "$INCOMPLETE_FIXTURE" << 'EOF'
{
  "partial": "data",
  "missing": "required_fields"
}
EOF

# This SHOULD fail
if $PYTHON_CMD tools/verify_operatorpack.py "$INCOMPLETE_FIXTURE" >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_err "$ARTIFACT_DIR" "Test 5: FAIL - Incomplete receipt was accepted (unexpected)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    EXIT_CODE=1
else
    log_msg "$ARTIFACT_DIR" "Test 5: PASS - Incomplete receipt correctly rejected"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# ============================================
# Finalize
# ============================================
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS="PASS"
[ $EXIT_CODE -ne 0 ] && STATUS="FAIL"

write_meta "$ARTIFACT_DIR" "receipt_audit" "$EXIT_CODE" "$STATUS" "$START_TIME" "$END_TIME"

# Write detailed summary
cat > "${ARTIFACT_DIR}/summary.md" << EOF
# Receipt Audit Summary

**Status**: ${STATUS}
**Exit Code**: ${EXIT_CODE}
**Tests Passed**: ${TESTS_PASSED}
**Tests Failed**: ${TESTS_FAILED}
**Artifact Directory**: \`${ARTIFACT_DIR}\`
**Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Tests Executed

| Test | Description | Result |
|------|-------------|--------|
| 1 | JSONL schema validation | $([ $TESTS_PASSED -ge 1 ] && echo "PASS" || echo "FAIL") |
| 2 | OperatorPack positive test | $([ $TESTS_PASSED -ge 2 ] && echo "PASS" || echo "FAIL") |
| 3 | OperatorPack negative test | $([ $TESTS_PASSED -ge 3 ] && echo "PASS" || echo "FAIL") |
| 4 | Malformed JSON rejection | $([ $TESTS_PASSED -ge 4 ] && echo "PASS" || echo "FAIL") |
| 5 | Missing fields rejection | $([ $TESTS_PASSED -ge 5 ] && echo "PASS" || echo "FAIL") |

## Test Fixtures Used

- \`receipts/examples/operatorpack_example_pass.json\` - Valid receipt (should pass)
- \`receipts/examples/operatorpack_example_fail.json\` - Invalid receipt (should fail)
- \`malformed_test.json\` - Malformed JSON (generated, should fail)
- \`incomplete_test.json\` - Missing fields (generated, should fail)

## Artifacts

- \`meta.json\` - Run metadata
- \`stdout.log\` - Standard output
- \`stderr.log\` - Standard error
- \`malformed_test.json\` - Generated negative fixture
- \`incomplete_test.json\` - Generated negative fixture
EOF

log_msg "$ARTIFACT_DIR" "Receipt audit complete: ${STATUS}"
log_msg "$ARTIFACT_DIR" "Tests: ${TESTS_PASSED} passed, ${TESTS_FAILED} failed"
log_msg "$ARTIFACT_DIR" "Artifacts: ${ARTIFACT_DIR}"

exit $EXIT_CODE
