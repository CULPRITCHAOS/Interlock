# AI Collaboration Safety Policy

This document defines the strict safety boundaries for any AI agent (like Antigravity) or automated system interacting with the Interlock repository. This policy is designed to protect the project's public hygiene and prevent accidental leakage of PII or benchmark artifacts.

> [!NOTE]
> This policy applies specifically to AI agents and automated workflows. Human contributors can follow the standard repository guidelines.

## 1. Execution Control
- **Default Baseline**: Terminal auto-exec is **DISABLED**. All commands require manual user approval.
- **Mandatory Approval**: Any command not in the allowlist below MUST be approved by a human.

### Command Allowlist (Exact)
- **Git**: `git status`, `git diff`, `git log -n 20`, `git branch`, `git show`
- **Node/NPM**: `node -v`, `npm -v`, `npm ci`, `npm test`, `npm run validate`, `npx tsc -v`, `npx tsc`
- **Python**: `py -m pytest`, `py -m unittest`
- **OS**: `ls`, `dir`, `cat`/`type` **ONLY** for files inside the repository (no `$HOME`, no parent directories).

### Command Denylist (CRITICAL - NEVER EXECUTE)
The following commands (and their equivalents) are strictly prohibited:
- **Destructive**: `rm`, `del`, `rmdir`, `Remove-Item`
- **System Change**: `format`, `diskpart`, `bcdedit`, `reg`, `icacls`, `takeown`, `schtasks`
- **Unbounded Network**: `Invoke-WebRequest` to arbitrary domains.
- **External Access**: Any command attempting to touch drives or directories outside the repository root.

## 2. File Access & Security
- **Tracked Files Only**: By default, AI agents must only read files tracked by Git. Do NOT `cat` or read untracked files (like `.env`, SSH keys, or tokens) unless explicitly approved by the user.
- **Strict Isolation**: Never attempt to access paths outside the repository root (`$HOME`, browser profiles, system config, etc.).

## 3. Mandatory Planning Requirement
A formal `implementation_plan.md` is REQUIRED in `PLANNING` mode and must be approved by `notify_user` for changes involving:
- **CI/CD**: `.github/workflows/*`
- **Security & Triage**: `docs/AI_COLLAB_SAFETY.md`, `.github/dependabot.yml`
- **Promoter Logic**: `tools/promote_receipt.ps1`, `tools/verify_operatorpack.py`.
- **Gating/Publishing**: Any script that affects receipt verification or index generation.

*Planning is NOT required for trivial README edits, comments, or typo fixes.*

## 4. Public Hygiene (PII & Artifact Gate)
Before pushing any changes, the following checks MUST be performed:
- **PII Scan**: `git grep -n "C:\\Users|/Users/"` must yield zero results.
- **Artifact Check**: `git status` must confirm that no benchmark receipts (`.json`), verdicts, or internal summaries are tracked.

Run the automated safety scanner before push:
```powershell
./tools/precommit_safety_scan.ps1
```
