---
description: Validate receipt schemas with positive and negative tests
allowed-tools:
  - Bash(./scripts/claude/receipt_audit.sh)
---

# /interlock_receipt_audit

Validates receipt and log schemas:

1. **JSONL Schema Validation** - Event format compliance
2. **OperatorPack Positive Test** - Valid receipt acceptance
3. **OperatorPack Negative Test** - Invalid receipt rejection
4. **Malformed JSON Test** - Parser error handling
5. **Missing Fields Test** - Schema enforcement

## Usage

```
/interlock_receipt_audit
```

## Execution

Run the receipt audit wrapper:

```bash
./scripts/claude/receipt_audit.sh
```

## Output

After execution, summarize results:

- Report PASS/FAIL status
- Show tests passed/failed count
- List any test failures
- Show artifact directory path

## Negative Tests

The audit includes negative tests that MUST fail. If they pass, the validator is broken.
