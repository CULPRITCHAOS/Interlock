# Security Rules for Public Repository

This repo is **public**. Every commit is visible to the world.

## PII Protection

**NEVER commit paths containing:**
- `C:\Users\` (Windows user paths)
- `/Users/` (macOS user paths)
- `/home/` (Linux user paths)
- Machine names, usernames, or personal identifiers

**Before committing**, search staged files for these patterns.

## Artifact Exclusions

**NEVER stage or commit:**
- `receipts/**/*.json` - Benchmark receipt files
- `receipts/**/*.verdict.json` - Verdict files
- `receipts/summary/*` - Summary outputs
- `results/**` (except templates and .gitkeep)
- Any file containing real benchmark data

These are local artifacts. They are gitignored for a reason.

## Secret Protection

**NEVER commit:**
- `.env` files
- API keys or tokens (even if "test" keys)
- SSH keys or certificates
- Credentials in any form

## Pre-Commit Check

Always run before committing:
```powershell
pwsh -File tools/precommit_safety_scan.ps1
```

If it fails, **do not push**. Fix the issue first.

## File Access Boundaries

- Only read/write files inside the repository root.
- Never access `$HOME`, parent directories, or other drives.
- Only read Git-tracked files unless explicitly approved.
