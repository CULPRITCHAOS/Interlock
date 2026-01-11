---
description: Run full release gate (smoke + safety + audit)
allowed-tools:
  - Bash(./scripts/claude/release_gate.sh)
---

# /interlock_release_gate

Orchestrates the full release verification gate:

1. **Smoke Test** (`smoke.sh`) - Build and validation
2. **Public Safety Check** (`public_safety_check.sh`) - PII/secrets scan
3. **Receipt Audit** (`receipt_audit.sh`) - Schema validation

## Usage

```
/interlock_release_gate
```

## Execution

Run the release gate wrapper:

```bash
./scripts/claude/release_gate.sh
```

## Output

After execution, summarize results:

- Report overall GATE PASSED/FAILED
- Show step-by-step results
- List sub-artifact directories
- Show main artifact directory path

## Fail-Closed

Any step failure = gate failure. All three must pass for release to proceed.

## Artifacts

The gate creates a bundle summary referencing all sub-artifact directories:

```
artifacts/claude/<RUN_ID>/
├── release_gate/
│   ├── meta.json
│   ├── summary.md
│   ├── stdout.log
│   └── stderr.log
├── smoke/
├── public_safety_check/
└── receipt_audit/
```
