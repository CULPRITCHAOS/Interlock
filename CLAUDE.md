# Interlock - Claude Code Project Memory

This file is read by Claude Code on every session. Keep it current.

## Build & Test Commands

```bash
# Lint (TypeScript type-check)
npm run lint

# Validation tests
npm run validate

# Build
npm run build

# Safety scan (run before every commit)
pwsh -File tools/precommit_safety_scan.ps1
```

## Safety Invariants

1. **No PII in commits**: Never commit paths containing `C:\Users`, `/Users/`, or `/home/`.
2. **No receipts/artifacts**: `receipts/`, verdict files, and benchmark outputs are gitignored. Never stage them.
3. **No secrets**: API keys, tokens, `.env` files must never be committed.
4. **Safety scan required**: Run `tools/precommit_safety_scan.ps1` before every commit. If it fails, do not push.

## Merge Gate Protocol

Before any merge to `main`:

1. **CI Green**: All GitHub Actions checks must pass.
2. **Safety Scan Passes**: `tools/precommit_safety_scan.ps1` reports clean.
3. **Merge Receipt Posted**: Comment on PR with summary, risk assessment, rollback plan.
4. **Explicit Approval**: Rob must say `APPROVE MERGE PR #<number>` in chat.

## When to Use Claude Code vs Antigravity

| Tag | Use Agent | Reason |
|-----|-----------|--------|
| `[HARD]` | Claude Code | Complex refactor, tricky debug, multi-file reasoning |
| `[SEC]` | Claude Code | Security review, policy changes, hygiene gates |
| `[MCP]` | Claude Code | Tool integration, external system checks |
| `[DESIGN]` | Claude Code | Schema/protocol design, architecture decisions |
| *(everything else)* | Antigravity | Routine edits, PR plumbing, bulk changes, CI fixes |

**Budget rule**: Claude Code is expensive. Use Antigravity for routine work.

## Key Files

- `docs/AI_COLLAB_SAFETY.md` - Full safety policy
- `multi_agent_coord.template.md` - Coordination protocol template
- `.claude/rules/` - Modular rules (security, maintainer, evidence)
- `.claude/skills/` - Project skills (maintainer, multi-agent-coordination)

## MCP Security (If Enabled)

- Require explicit approval for any MCP server connection.
- Use allowlist of trusted servers/domains only.
- Third-party MCP servers can expose prompt-injection paths.
