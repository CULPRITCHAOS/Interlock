#!/usr/bin/env bash
# Interlock Claude Wrapper - Smoke Test
# ======================================
# Runs the canonical smoke sequence for Interlock.
# Emits artifacts: meta.json, stdout.log, stderr.log, summary.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

cd "$REPO_ROOT"

# Initialize run
export RUN_ID="${RUN_ID:-$(generate_run_id)}"
ARTIFACT_DIR=$(create_artifact_dir "smoke")
START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize log files
touch "${ARTIFACT_DIR}/stdout.log" "${ARTIFACT_DIR}/stderr.log"

log_msg "$ARTIFACT_DIR" "Starting Interlock smoke test"
log_msg "$ARTIFACT_DIR" "Run ID: ${RUN_ID}"
log_msg "$ARTIFACT_DIR" "Artifact directory: ${ARTIFACT_DIR}"

EXIT_CODE=0
COMMANDS_RUN=""

# Step 1: npm ci
log_msg "$ARTIFACT_DIR" "Step 1/4: npm ci (install dependencies)"
COMMANDS_RUN="${COMMANDS_RUN}\n1. \`npm ci\` - Install dependencies"
if npm ci >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
    log_msg "$ARTIFACT_DIR" "Step 1/4: PASS"
    COMMANDS_RUN="${COMMANDS_RUN} - PASS"
else
    log_err "$ARTIFACT_DIR" "Step 1/4: FAIL - npm ci failed"
    COMMANDS_RUN="${COMMANDS_RUN} - FAIL"
    EXIT_CODE=1
fi

# Step 2: npm run lint (only if previous step passed)
if [ $EXIT_CODE -eq 0 ]; then
    log_msg "$ARTIFACT_DIR" "Step 2/4: npm run lint (TypeScript type check)"
    COMMANDS_RUN="${COMMANDS_RUN}\n2. \`npm run lint\` - TypeScript type check"
    if npm run lint >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
        log_msg "$ARTIFACT_DIR" "Step 2/4: PASS"
        COMMANDS_RUN="${COMMANDS_RUN} - PASS"
    else
        log_err "$ARTIFACT_DIR" "Step 2/4: FAIL - lint failed"
        COMMANDS_RUN="${COMMANDS_RUN} - FAIL"
        EXIT_CODE=1
    fi
fi

# Step 3: npm run validate (only if previous steps passed)
if [ $EXIT_CODE -eq 0 ]; then
    log_msg "$ARTIFACT_DIR" "Step 3/4: npm run validate (validation tests)"
    COMMANDS_RUN="${COMMANDS_RUN}\n3. \`npm run validate\` - Validation tests"
    if npm run validate >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
        log_msg "$ARTIFACT_DIR" "Step 3/4: PASS"
        COMMANDS_RUN="${COMMANDS_RUN} - PASS"
    else
        log_err "$ARTIFACT_DIR" "Step 3/4: FAIL - validate failed"
        COMMANDS_RUN="${COMMANDS_RUN} - FAIL"
        EXIT_CODE=1
    fi
fi

# Step 4: JSONL schema validation (only if previous steps passed)
if [ $EXIT_CODE -eq 0 ]; then
    log_msg "$ARTIFACT_DIR" "Step 4/4: npx tsx scripts/validate-jsonl-schema.ts"
    COMMANDS_RUN="${COMMANDS_RUN}\n4. \`npx tsx scripts/validate-jsonl-schema.ts\` - JSONL schema validation"
    if npx tsx scripts/validate-jsonl-schema.ts >> "${ARTIFACT_DIR}/stdout.log" 2>> "${ARTIFACT_DIR}/stderr.log"; then
        log_msg "$ARTIFACT_DIR" "Step 4/4: PASS"
        COMMANDS_RUN="${COMMANDS_RUN} - PASS"
    else
        log_err "$ARTIFACT_DIR" "Step 4/4: FAIL - JSONL schema validation failed"
        COMMANDS_RUN="${COMMANDS_RUN} - FAIL"
        EXIT_CODE=1
    fi
fi

# Finalize
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STATUS="PASS"
[ $EXIT_CODE -ne 0 ] && STATUS="FAIL"

write_meta "$ARTIFACT_DIR" "smoke" "$EXIT_CODE" "$STATUS" "$START_TIME" "$END_TIME"
write_summary "$ARTIFACT_DIR" "smoke" "$EXIT_CODE" "$(echo -e "$COMMANDS_RUN")"

log_msg "$ARTIFACT_DIR" "Smoke test complete: ${STATUS}"
log_msg "$ARTIFACT_DIR" "Artifacts: ${ARTIFACT_DIR}"

exit $EXIT_CODE
