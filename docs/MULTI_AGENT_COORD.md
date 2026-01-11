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

**Last Updated**: 2026-01-10 18:05 CST
**Active Agent**: Antigravity (handoff pending)
**Status**: Claude-operable lockdown committed (550d179)
**Next Steps**: See Handoff Note below
**Blockers**: None

---

## Handoff Note: Claude Code → Antigravity

**From**: Claude Code
**To**: Antigravity
**Date**: 2026-01-10

### What Was Done

Implemented Claude-operable lockdown for Interlock. The repo now has:

1. **Wrapper Scripts** (`scripts/claude/`):
   - `smoke.sh` - Canonical smoke test (npm ci, lint, validate, jsonl)
   - `public_safety_check.sh` - PII/secrets scanner
   - `receipt_audit.sh` - Schema validation with negative tests
   - `release_gate.sh` - Orchestrates all checks

2. **Slash Commands** (`.claude/commands/`):
   - `/interlock_smoke`, `/interlock_public_safety_check`
   - `/interlock_receipt_audit`, `/interlock_release_gate`

3. **Skills** (`.claude/skills/`):
   - `governed-dev` - Evidence-first, fail-closed rules
   - `interlock-ops` - Receipt/enforcement governance

4. **Lockdown** (`.claude/settings.json`):
   - Only `./scripts/claude/*` allowed for Bash
   - Arbitrary shell, curl, wget, powershell denied

### For Antigravity

**You should know**:
- All Claude automation goes through `./scripts/claude/` wrappers
- Artifacts land in `artifacts/claude/<RUN_ID>/` (gitignored)
- Run `./scripts/claude/release_gate.sh` for full verification

**If modifying wrappers**:
- Keep `set -euo pipefail` at top
- Emit artifacts (meta.json, summary.md, logs)
- Fail-closed: non-zero exit on any issue

**New slash commands available**:
```
/interlock_smoke          # Run smoke tests
/interlock_release_gate   # Full release verification
```

### Verification

Release gate passed:
```
artifacts/claude/20260110T235644Z/release_gate/summary.md
- smoke.sh: PASS
- public_safety_check.sh: PASS
- receipt_audit.sh: PASS
```

---

## Task Queue

| Priority | Task | Assigned To | Status |
|----------|------|-------------|--------|
| — | (no tasks queued) | — | — |

---

## Session Log

| Date | Agent | Action | Outcome |
|------|-------|--------|---------|
| 2026-01-05 | Antigravity | Merged (AI Safety Hardening) | ✅ Complete |
| 2026-01-10 | Antigravity | Installed Claude Code CLI | ✅ Complete |
| 2026-01-10 | Antigravity | Created this coordination doc | ✅ Complete |
| 2026-01-10 | Claude Code | Received handoff, protocol acknowledged | ✅ Active |
| 2026-01-10 | Claude Code | Created CLAUDE.md, .claude/rules/, .claude/skills/, coordination template | ✅ Complete |
| 2026-01-10 | Claude Code | Added Claude-operable lockdown (scripts/claude/, commands, skills) | ✅ Complete |
| 2026-01-10 | Claude Code | Handoff to Antigravity with detailed notes | ✅ Pending |

---

## Communication Channels

1. **This file** (`docs/MULTI_AGENT_COORD.md`): Primary handoff mechanism
2. **Git commits**: Both agents read commit messages for context
3. **Rob (human)**: Final authority, approval for merges, tiebreaker

---

*Last edited by Claude Code*

## Feedback & Stability Notes (2026-01-10)

### 1. PII Self-Detection Issues
- **Problem**: Lower-level scanner scripts (like public_safety_check.sh) were detecting themselves because they contained PII-matching strings (C:\Users) for detection logic.
- **Fix**: Added scripts/claude/ and 	ools/ to the exclusion list in public_safety_check.sh.
- **Instruction for Claude**: When writing safety scripts, always ensure the script excludes its own directory and other known safety tools from content scans.

### 2. Cross-Platform Python Commands
- **Problem**: eceipt_audit.sh hardcoded python, which fails in Git Bash on Windows (where py is the standard launcher).
- **Fix**: Implemented a PYTHON_CMD detection block in eceipt_audit.sh that tries py, then python3, then python.
- **Instruction for Claude**: Always use dynamic command detection for Python on Windows environments.

### 3. Verification Gating
- **Note**: Antigravity found these issues by running ash scripts/claude/release_gate.sh. 
- **Instruction for Claude**: Always run the full elease_gate.sh and check the artifacts in rtifacts/claude/ before pushing, especially when modifying the wrappers themselves.
