# Security Baseline

> **Last Updated**: 2025-12-30  
> **Status**: FROZEN — Changes require `security-maintenance` label

This document defines the security baseline for Interlock. Baseline changes are treated separately from feature work to prevent security regressions.

## Required Checks

All PRs to `main` must pass these checks before merge:

| Check | Workflow | Required |
|-------|----------|----------|
| Secret Scan | `secret-scan.yml` | ✅ **Yes** |
| PR Checks (lint/test) | `pr-checks.yml` | ✅ **Yes** |
| Adapter Certification | `adapter-certification.yml` | ⚠️ Recommended |
| Benchmark Suite | `benchmark.yml` | ⚠️ Recommended |
| CodeQL | `codeql.yml` | ❌ Not yet (until clean) |

## Baseline vs Feature Changes

### Baseline Changes (Security Maintenance)

Changes that affect security posture, CI enforcement, or trust boundaries:

- `.github/workflows/*.yml` — CI/CD configuration
- `.github/CODEOWNERS` — Review requirements
- `.gitleaks.toml` — Secret scanning rules
- `services/kernel/hardwareFingerprint.ts` — Identity binding
- `services/law-loader.ts` — Law loading logic
- `laws/` — Any law configuration
- `docs/SECURITY*.md` — Security documentation
- Branch protection rules (manual)

### Feature Changes

Everything else:
- New adapters
- New API endpoints
- UI changes
- Documentation (non-security)
- Tests (non-security)
- Refactoring

## Rules

### 1. No Mixing Baseline + Feature

A PR must be **either** a baseline change **or** a feature change, never both.

**Wrong:**
```
feat: add Milvus adapter + update secret scan config
```

**Right:**
```
feat: add Milvus adapter
```
```
security: update secret scan allowlist
```

### 2. Baseline Changes Require Label

All baseline changes must:
- Have the `security-maintenance` label
- Be reviewed by a CODEOWNER
- Pass all required checks
- Be documented in the PR description

### 3. Weekly Security Batch

Security maintenance is batched weekly:
1. Create a "Security Maintenance" issue on Monday
2. Collect all security-related fixes/updates
3. Submit as a single labeled PR
4. Merge after review

### 4. Emergency Security Fixes

For urgent security issues:
1. Create PR with `security-maintenance` + `urgent` labels
2. Request expedited review
3. Document the urgency in PR description
4. Still requires all checks to pass

## Current Baseline State

| Component | Status | Last Reviewed |
|-----------|--------|---------------|
| Secret Scanning | ✅ Green | 2025-12-30 |
| Branch Protection | ✅ Enabled | 2025-12-30 |
| CODEOWNERS | ✅ Active | 2025-12-30 |
| Hardware Fingerprint | ✅ Unified | 2025-12-30 |
| Demo Laws Isolation | ✅ Enforced | 2025-12-30 |
| Dev Mode Gating | ✅ Dual-gated | 2025-12-30 |

## Related Documents

- [SECURITY_POSTURE.md](./SECURITY_POSTURE.md) — Threat model and policies
- [SECRET_INCIDENT_REPORT.md](./SECRET_INCIDENT_REPORT.md) — False positive analysis
- [RELEASE_PROCESS.md](./RELEASE_PROCESS.md) — How to cut releases
