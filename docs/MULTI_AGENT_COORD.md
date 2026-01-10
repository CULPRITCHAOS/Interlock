# Multi-Agent Coordination Protocol

This living document coordinates work between AI agents operating on the Interlock repository.

## Active Agents

| Agent | Provider | Interface | Strengths |
|-------|----------|-----------|-----------|
| **Antigravity** | Google (Gemini) | VS Code Extension | Deep codebase context, browser automation, image generation, long sessions |
| **Claude Code** | Anthropic (Opus) | Terminal CLI | Fast edits, agentic coding, compact context |

---

## Coordination Rules

### 1. Handoff Protocol
When switching agents mid-task, the outgoing agent must update this file with:
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
- No merges to `main` without Rob's explicit approval phrase

---

## Current Handoff State

**Last Updated**: 2026-01-10 15:45 CST
**Active Agent**: Claude Code
**Status**: Active session, awaiting tasks
**Next Steps**: Ready for work assignments
**Blockers**: None

---

## Task Queue

| Priority | Task | Assigned To | Status |
|----------|------|-------------|--------|
| — | (no tasks queued) | — | — |

---

## Session Log

| Date | Agent | Action | Outcome |
|------|-------|--------|---------|
| 2026-01-05 | Antigravity | Merged PR #41 (AI Safety Hardening) | ✅ Complete |
| 2026-01-10 | Antigravity | Installed Claude Code CLI | ✅ Complete |
| 2026-01-10 | Antigravity | Created this coordination doc | ✅ Complete |
| 2026-01-10 | Claude Code | Received handoff, protocol acknowledged | ✅ Active |

---

## Communication Channels

1. **This file** (`docs/MULTI_AGENT_COORD.md`): Primary handoff mechanism
2. **Git commits**: Both agents read commit messages for context
3. **Rob (human)**: Final authority, approval for merges, tiebreaker

---

*Last edited by Claude Code*
