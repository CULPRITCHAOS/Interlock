---
description: Run Interlock canonical smoke test sequence
allowed-tools:
  - Bash(./scripts/claude/smoke.sh)
---

# /interlock_smoke

Runs the canonical Interlock smoke test sequence:

1. `npm ci` - Install dependencies
2. `npm run lint` - TypeScript type check
3. `npm run validate` - Validation tests
4. `npx tsx scripts/validate-jsonl-schema.ts` - JSONL schema validation

## Usage

```
/interlock_smoke
```

## Execution

Run the smoke test wrapper:

```bash
./scripts/claude/smoke.sh
```

## Output

After execution, summarize results from the artifact directory:

- Report PASS/FAIL status
- Show artifact directory path
- List any failures from stderr.log
- Do not overclaim - only report what the script output shows
