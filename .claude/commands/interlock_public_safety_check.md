---
description: Scan repository for PII, secrets, and forbidden content
allowed-tools:
  - Bash(./scripts/claude/public_safety_check.sh)
---

# /interlock_public_safety_check

Scans the repository for:

1. **PII/Machine Paths** - Hardcoded user paths (`C:\Users\`, `/Users/`, `/home/`)
2. **Secret Patterns** - API keys, tokens, private keys
3. **Forbidden Content** - Internal-only markers, enforcement heuristics
4. **Artifact Leakage** - Tracked receipts or verdicts

## Usage

```
/interlock_public_safety_check
```

## Execution

Run the safety check wrapper:

```bash
./scripts/claude/public_safety_check.sh
```

## Output

After execution, summarize results:

- Report PASS/FAIL status
- Show findings count
- List any detected issues from findings.txt
- Show artifact directory path

## Fail-Closed

Any finding = non-zero exit. The check fails closed.
