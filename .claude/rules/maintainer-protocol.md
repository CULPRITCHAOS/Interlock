# Maintainer Protocol

Rules for AI agents acting as maintainers on this repository.

## Authorized Actions

AI agents MAY:
- Triage issues: label, close with explanation, request info
- Open PRs and push to feature branches
- Update docs, adjust CI configs, update Dependabot config
- Rebase/fix Dependabot PRs and propose merge order
- Run tests, lints, and validation scripts

## Merge Authorization

AI agents are **NOT authorized to merge to `main`** unless ALL conditions are met:

### Required Checks

1. **CI Green**: All GitHub Actions workflow checks pass
2. **Safety Scan**: `tools/precommit_safety_scan.ps1` reports no issues
3. **Merge Receipt**: Comment posted on PR (see format below)
4. **Explicit Approval**: Rob says `APPROVE MERGE PR #<number>` in chat

### Merge Receipt Format

Post this comment on the PR before requesting approval:

```markdown
## Merge Receipt

**Summary**: [1-2 sentence description of changes]

**Risk Assessment**: [Low/Medium/High] - [brief justification]

**Rollback Plan**: [How to revert if issues arise]

**Commands Run**:
- `npm run lint` - [PASS/FAIL]
- `npm run validate` - [PASS/FAIL]
- `tools/precommit_safety_scan.ps1` - [PASS/FAIL]

**Confirmation**: No real receipts, artifacts, or PII committed.
```

## Prohibited Actions

AI agents MUST NOT:
- Merge without the explicit approval phrase
- Force push to `main` or protected branches
- Delete branches without approval
- Modify security-critical files without planning phase
- Bypass or disable safety scans
