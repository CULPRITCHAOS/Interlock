# Evidence & Receipts Policy

How Interlock handles benchmark evidence and OperatorPack receipts.

## Two-Tier Model

### Private Vault (Local Only)
- **Location**: `receipts/approved/`, `receipts/rejected/`, `receipts/summary/`
- **Contents**: Real benchmark receipts, verdicts, performance data
- **Visibility**: Local filesystem only, never committed
- **Purpose**: Source of truth for Rob's validation work

### Public Verifier (Repository)
- **Location**: `tools/verify_operatorpack.py`, `tools/promote_receipt.ps1`
- **Contents**: Verification logic, threshold definitions, workflow scripts
- **Visibility**: Public, committed to repo
- **Purpose**: Reproducible verification methodology

## What Gets Committed

**YES - Commit these:**
- Verification scripts and tools
- Threshold definitions and schemas
- Example/template receipts (in `receipts/examples/`)
- Index templates (`.template` suffix)
- Documentation about the receipt workflow

**NO - Never commit:**
- Real benchmark receipts (`*.json` in receipts/)
- Verdict files (`*.verdict.json`)
- Summary files in `receipts/summary/`
- Any file containing actual performance metrics from real runs

## Gitignore Enforcement

The `.gitignore` blocks:
```
receipts/**/*.json
receipts/**/*.verdict.json
receipts/summary/*
```

If `git status` shows these files as untracked, that's correct. Do not add them.

## Workflow

1. **Generate**: Obtain receipt from external lab (source of truth)
2. **Stage**: Copy to `receipts/inbox/`
3. **Verify**: Run promotion script locally
4. **Result**: Files land in `approved/` or `rejected/` (local only)
5. **Never push**: These files stay on Rob's machine
