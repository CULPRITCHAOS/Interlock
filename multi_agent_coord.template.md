# Multi-Agent Coordination Protocol (Template)

> **This is a template.** Copy to `docs/MULTI_AGENT_COORD.md` (gitignored) for actual use.
> The working file stays local to prevent leaking sensitive task context.

## Active Agents

| Agent | Provider | Interface | Strengths |
|-------|----------|-----------|-----------|
| **Antigravity** | Google (Gemini) | VS Code Extension | Deep codebase context, browser automation, image generation, long sessions |
| **Claude Code** | Anthropic (Opus) | Terminal CLI | Fast edits, agentic coding, compact context, complex reasoning |

## Task Assignment Tags

| Tag | Assigned To | Reason |
|-----|-------------|--------|
| `[HARD]` | Claude Code | Complex refactor, tricky debug |
| `[SEC]` | Claude Code | Security review, policy changes |
| `[MCP]` | Claude Code | Tool integration, external checks |
| `[DESIGN]` | Claude Code | Schema/protocol design |
| *(routine)* | Antigravity | PR plumbing, bulk edits, CI fixes |

---

## Coordination Rules

### 1. Handoff Protocol

When switching agents mid-task, the outgoing agent must update the working file with:
- **Current Status**: What was just completed
- **Next Steps**: What the incoming agent should do
- **Blockers**: Any issues or decisions needed from Rob

### 2. Conflict Avoidance

- Only one agent edits a file at a time
- Check `git status` before starting work
- If both agents touched the same file, the second agent must `git stash` and report

### 3. Safety Rules (Both Agents)

- Follow `docs/AI_COLLAB_SAFETY.md`
- Run `tools/precommit_safety_scan.ps1` before any commit
- No merges to `main` without Rob's explicit approval phrase: `APPROVE MERGE PR #<number>`

---

## Current Handoff State

**Last Updated**: [YYYY-MM-DD HH:MM TZ]
**Active Agent**: [Agent Name]
**Status**: [Current status]
**Next Steps**: [What needs to happen]
**Blockers**: [Any blockers or "None"]

---

## Task Queue

| Priority | Task | Assigned To | Status |
|----------|------|-------------|--------|
| 1 | [Task description] | [Agent] | [pending/in_progress/done] |

---

## Session Log

| Date | Agent | Action | Outcome |
|------|-------|--------|---------|
| YYYY-MM-DD | [Agent] | [What was done] | [Result] |

---

## Communication Channels

1. **Working coord file** (`docs/MULTI_AGENT_COORD.md`): Primary handoff mechanism (local only)
2. **Git commits**: Both agents read commit messages for context
3. **Rob (human)**: Final authority, approval for merges, tiebreaker

---

*Template version: 1.0*
