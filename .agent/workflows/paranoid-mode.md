---
description: Activates Paranoid Mode for AI Interactions on Public Interlock
---

# Antigravity Paranoid Mode (Interlock Public)

This workflow defines the mandatory security constraints for any AI agent interacting with this repository.

## 1. Terminal Security
- **Auto-exec OFF**: The `SafeToAutoRun` flag MUST be set to `false` for all commands unless specifically listed in the allowlist below.
- **Safe Command Allowlist**:
  - `git status`, `git branch`, `git log`, `git diff`
  - `ls`, `dir`, `cat`, `Get-Content`
  - `npm test`, `npm run lint`, `npx tsc --noEmit`
  - `python --version`, `node -v`

## 2. Browser & Web Security
- **Domain Allowlist**: When using `search_web` or `read_url_content`, only the following domains are considered trusted:
  - `github.com` (and subdomains)
  - `npmjs.com`
  - `typescriptlang.org`
  - `nodejs.org`
  - `google.com` (for official documentation/codelabs)
- **PII Protection**: Never enter repository-specific paths or local user information into search queries.

## 3. Mandatory Planning Mode
- **Scope**: Any changes to files in the following directories or types:
  - `.github/workflows/` (CI/CD)
  - `.github/dependabot.yml`
  - `receipts/` (including templates)
  - `SECURITY.md`, `LICENSE`, `COMMERCIAL-LICENSE.md`
  - Any file related to "publishing" or "external telemetry".
- **Requirement**: A full `implementation_plan.md` must be created in `PLANNING` mode and approved via `notify_user` BEFORE any `EXECUTION` tool calls are made.

## 4. Verification Hygiene
- ALWAYS run `git status` after tests to ensure no benchmark receipts or results were accidentally tracked.
- Use `git grep` periodically to check for leaked machine paths (`C:\Users\...`).

// turbo-all
// Note: turbo-all is disabled by the "Auto-exec OFF" rule above.
