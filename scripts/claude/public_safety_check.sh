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

# Patterns - Improved regexes for reliability
SECRET_PATTERNS=(
    'AKIA[0-9A-Z]{16}'
    'sk-[a-zA-Z0-9]{48}'
    'ghp_[a-zA-Z0-9]{36}'
    'gho_[a-zA-Z0-9]{36}'
    'glpat-[a-zA-Z0-9\-]{20}'
    'xox[baprs]-[0-9a-zA-Z\-]+'
    '-----BEGIN( [A-Z0-9]+)? PRIVATE KEY-----'
    'api[_-]?key[[:space:]]*[:=][[:space:]]*[a-zA-Z0-9]{20,}'
)
FORBIDDEN_PATTERNS=(
    'enforcement heuristics'
    'private rules'
    'internal-only'
    'DO NOT PUBLISH'
)

# =============================================================================
# Per-Match Granular Allowlist
# =============================================================================
# Format: "CATEGORY|FILE_PATH|PATTERN_SUBSTRING|REASON"
# - CATEGORY: PII, SECRET, FORBIDDEN (ARTIFACT findings are NEVER allowlisted)
# - FILE_PATH: Normalized path (forward slashes)
# - PATTERN_SUBSTRING: The pattern or substring that triggered the finding
# - REASON: Why this specific match is allowed
#
# This eliminates "ignore zones" - a real secret in an allowlisted file will
# still be caught unless it matches a specific allowlist entry.
# =============================================================================
GRANULAR_ALLOWLIST=(
    # Documentation files that legitimately discuss these patterns
    "FORBIDDEN|docs/AI_COLLAB_SAFETY.md|enforcement heuristics|Documents the rule itself"
    "FORBIDDEN|docs/AI_COLLAB_SAFETY.md|private rules|Documents the rule itself"
    "FORBIDDEN|docs/AI_COLLAB_SAFETY.md|internal-only|Documents the rule itself"
    "PII|docs/AI_COLLAB_SAFETY.md|/Users/|Example path in docs"
    "PII|docs/AI_COLLAB_SAFETY.md|/home/|Example path in docs"
    "PII|docs/AI_COLLAB_SAFETY.md|C:/Users/|Example path in docs"
    # CLAUDE.md documents project rules including PII examples
    "PII|CLAUDE.md|/Users/|Example path in project rules"
    "PII|CLAUDE.md|/home/|Example path in project rules"
    "PII|CLAUDE.md|C:/Users/|Example path in project rules"
    # Claude skill files
    "FORBIDDEN|.claude/skills/interlock-ops/SKILL.md|enforcement heuristics|Skill defines the constraint"
    "FORBIDDEN|.claude/skills/interlock-ops/SKILL.md|internal-only|Skill defines the constraint"
    "PII|.claude/skills/maintainer/SKILL.md|/Users/|Example path in skill file"
    "PII|.claude/skills/maintainer/SKILL.md|/home/|Example path in skill file"
    # Security rule files that define patterns
    "FORBIDDEN|.claude/rules/security-public-repo.md|internal-only|Rule definition file"
    "PII|.claude/rules/security-public-repo.md|/Users/|Pattern example in rule file"
    "PII|.claude/rules/security-public-repo.md|/home/|Pattern example in rule file"
    "PII|.claude/rules/security-public-repo.md|C:/Users/|Pattern example in rule file"
    "FORBIDDEN|.agent/workflows/security-public-repo.md|internal-only|Workflow definition file"
    # Command files that reference patterns for documentation
    "FORBIDDEN|.claude/commands/interlock_public_safety_check.md|internal-only|Command help text"
    "PII|.claude/commands/interlock_public_safety_check.md|/Users/|Example path in docs"
    "PII|.claude/commands/interlock_public_safety_check.md|/home/|Example path in docs"
    "PII|.claude/commands/interlock_public_safety_check.md|C:/Users/|Example path in docs"
    "PII|.claude/commands/interlock_public_safety_check.md|file:///|Example path in docs"
    # The safety scripts themselves contain patterns for scanning
    "SECRET|scripts/claude/public_safety_check.sh|PRIVATE KEY|Pattern definition"
    "SECRET|scripts/claude/public_safety_check.sh|AKIA|Pattern definition"
    "SECRET|scripts/claude/public_safety_check.sh|api[_-]?key|Pattern definition"
    "FORBIDDEN|scripts/claude/public_safety_check.sh|enforcement heuristics|Pattern definition"
    "FORBIDDEN|scripts/claude/public_safety_check.sh|private rules|Pattern definition"
    "FORBIDDEN|scripts/claude/public_safety_check.sh|internal-only|Pattern definition"
    "FORBIDDEN|scripts/claude/public_safety_check.sh|DO NOT PUBLISH|Pattern definition"
    "PII|scripts/claude/public_safety_check.sh|/Users/|Pattern definition"
    "PII|scripts/claude/public_safety_check.sh|/home/|Pattern definition"
    "PII|scripts/claude/public_safety_check.sh|file:///|Pattern definition"
    "PII|scripts/claude/public_safety_check.sh|C:/Users/|Pattern definition"
    # PowerShell safety scanner
    "SECRET|tools/precommit_safety_scan.ps1|PRIVATE KEY|Pattern definition"
    "SECRET|tools/precommit_safety_scan.ps1|AKIA|Pattern definition"
    "FORBIDDEN|tools/precommit_safety_scan.ps1|internal-only|Pattern definition"
    "PII|tools/precommit_safety_scan.ps1|/Users/|Pattern definition"
    "PII|tools/precommit_safety_scan.ps1|/home/|Pattern definition"
    "PII|tools/precommit_safety_scan.ps1|C:/Users/|Pattern definition"
    # Claude settings contains deny patterns
    "PII|.claude/settings.json|C:/Users/|Deny rule definition"
)

# Check if a finding matches the granular allowlist
is_allowlisted() {
    local category="$1"
    local file_path="$2"
    local pattern="$3"

    for entry in "${GRANULAR_ALLOWLIST[@]}"; do
        local al_cat al_file al_pattern al_reason
        IFS='|' read -r al_cat al_file al_pattern al_reason <<< "$entry"
        
        # Match: category must match, file must match
        if [[ "$category" == "$al_cat" && "$file_path" == "$al_file" ]]; then
            # For PII findings, we only check category + file (the specific pattern is in the file)
            # For SECRET/FORBIDDEN, we check if the pattern substring matches
            if [[ "$category" == "PII" ]]; then
                log_msg "$ARTIFACT_DIR" "  [SKIP] Allowlisted: $category in $file_path ($al_reason)"
                return 0
            elif [[ "$pattern" == *"$al_pattern"* || "$al_pattern" == *"$pattern"* ]]; then
                log_msg "$ARTIFACT_DIR" "  [SKIP] Allowlisted: $category in $file_path ($al_reason)"
                return 0
            fi
        fi
    done
    return 1
}

# Helper to record findings (with granular allowlist check)
record_safety_finding() {
    local category="$1"
    local message="$2"
    local target_file="$3"
    local pattern="${4:-}"

    # Normalize path for matching
    local norm
    norm=$(echo "$target_file" | tr '\\' '/' | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    # ARTIFACT findings are NEVER allowlisted (security-critical)
    if [[ "$category" != "ARTIFACT" ]]; then
        if is_allowlisted "$category" "$norm" "$pattern"; then
            return 0
        fi
    fi

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
    
    # PII Check - Improved regexes for reliable matching
    # Matches: file:/// | c:/Users/ | C:/Users/ | c:\Users\ | C:\Users\ | /Users/<name> | /home/<name>
    if grep -q -E 'file:///|[cC]:/Users/|[cC]:\\Users\\|/Users/[^[:space:]/]+|/home/[^[:space:]/]+' "$f" 2>/dev/null; then
         record_safety_finding "PII" "Absolute path detected" "$f" "path"
    fi

    # Secrets Check
    for p in "${SECRET_PATTERNS[@]}"; do
        if grep -q -E "$p" "$f" 2>/dev/null; then
            record_safety_finding "SECRET" "Pattern '$p' detected" "$f" "$p"
        fi
    done

    # Forbidden Check
    for p in "${FORBIDDEN_PATTERNS[@]}"; do
        if grep -qi "$p" "$f" 2>/dev/null; then
            record_safety_finding "FORBIDDEN" "Pattern '$p' detected" "$f" "$p"
        fi
    done

    # Artifact Leakage Check (Never skipped - no allowlisting)
    if echo "$f" | grep -qiE "(receipts/(approved|rejected|summary)/|results/badge/|\.verdict\.json$)" && [[ "$f" != *".gitkeep" ]]; then
        record_safety_finding "ARTIFACT" "Tracked artifact" "$f" "artifact"
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

## Allowlist Model
Per-match granular allowlist (category + file + pattern + reason).
ARTIFACT findings are NEVER allowlisted.

## Findings
$(if [ -s "${ARTIFACT_DIR}/findings.txt" ]; then cat "${ARTIFACT_DIR}/findings.txt"; else echo "None"; fi)
EOF

log_msg "$ARTIFACT_DIR" "Public safety check complete: ${STATUS}"
exit $EXIT_CODE
