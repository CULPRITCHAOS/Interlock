# AI Collaboration Safety Policy

This document defines the safety boundaries for AI agents (like Antigravity) and automated systems interacting with the public Interlock repository. It protects against accidental PII leakage and ensures artifacts remain local.

> [!NOTE]
> **Scope**: This policy is **mandatory for AI agents/automation**. Human contributors may follow standard repository guidelines but are encouraged to run the safety scan before pushing.

---

## 1. Execution Control

- **Default**: Terminal auto-exec is **DISABLED**. All commands require manual user approval.
- **Mandatory Approval**: Any command not in the allowlist below MUST be approved by a human.

### Command Allowlist (Exact)
- **Git (read-only)**: `git status`, `git diff`, `git log -n 20`, `git branch`, `git show`, `git grep`, `git rev-parse`, `git remote -v`
- **Node/NPM**: `node -v`, `npm -v`, `npm ci`, `npm test`, `npm run validate`, `npx tsc -v`, `npx tsc`
- **Python**: `py -m pytest`, `py -m unittest`
- **OS**: `ls`, `dir`, `cat`/`type` **ONLY** for files inside the repository root.

### Command Denylist (NEVER EXECUTE)
- **Destructive**: `rm`, `del`, `rmdir`, `Remove-Item`
- **System Change**: `format`, `diskpart`, `bcdedit`, `reg`, `icacls`, `takeown`, `schtasks`
- **Unbounded Network**: `Invoke-WebRequest` to arbitrary domains.
- **External Access**: Any command touching drives or directories outside the repository root.

---

## 2. File Access & Data Protection

- **Tracked Files Only**: By default, AI agents must only read files tracked by Git.
- **Secrets & Credentials**: Do NOT read `.env`, SSH keys, tokens, browser profiles, or any local config without explicit user approval.
- **Strict Isolation**: Never access paths outside the repository root (`$HOME`, parent directories, etc.).

---

## 3. Browser & Web Allowlist

When performing web lookups, restrict to trusted documentation sources:
- **GitHub**: `github.com` (and subdomains)
- **NPM**: `npmjs.com`
- **TypeScript**: `typescriptlang.org`
- **Node.js**: `nodejs.org`
- **Google (specific)**: `developers.google.com`, `cloud.google.com`, `ai.google.dev`, `blog.google`, `research.google`

---

## 4. Mandatory Planning Requirement

A formal `implementation_plan.md` is REQUIRED in `PLANNING` mode for changes involving:
- **CI/CD**: `.github/workflows/*`
- **Security & Triage**: `docs/AI_COLLAB_SAFETY.md`, `.github/dependabot.yml`
- **Promoter Logic**: `tools/promote_receipt.ps1`, `tools/verify_operatorpack.py`
- **Gating/Publishing**: Any script affecting receipt verification or index generation.

*Planning is NOT required for trivial README edits, comments, or typo fixes.*

---

## 5. Public Hygiene (PII & Artifact Gate)

Before pushing any changes, run the automated safety scanner:
```powershell
powershell -File tools/precommit_safety_scan.ps1
```

The scan checks:
- **PII Scan**: No hardcoded machine paths (`C:\Users`, `/Users/`, `/home/`).
- **Artifact Check**: No benchmark receipts, verdicts, or summaries are tracked.
- **Secret Scan**: No API keys or tokens in tracked files.

**If the scan FAILs, do NOT push.**

---

## 6. Maintainer Authority Protocol

This section defines the operating authority for AI agents acting as maintainers on this public repository.

### Authorized Actions
- Triage issues: label, close with explanation, request info.
- Open PRs, push fixes on branches, update docs, adjust CI, update Dependabot config.
- Rebase/fix Dependabot PRs and propose merge order.

### Merge Authorization
AI agents are **NOT authorized to merge to `main`** unless ALL of the following are true:
1.  **CI is Green**: All workflow checks pass (or failures are understood and irrelevant).
2.  **Safety Scan Passes**: `tools/precommit_safety_scan.ps1` reports no PII or tracked artifacts.
3.  **Merge Receipt Posted**: A comment on the PR with:
    - Summary of changes.
    - Risk assessment and rollback plan.
    - Exact commands run and their results.
    - Explicit confirmation: "No real receipts/artifacts committed."
4.  **Explicit Approval**: Rob (the maintainer) gives a go/no-go in chat using: **`APPROVE MERGE PR #<number>`**

*AI agents can prep everything to the finish line; merging requires that explicit approval phrase.*
