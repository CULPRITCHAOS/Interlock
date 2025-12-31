# Security Posture

> **Last Updated**: 2025-12-30

This document describes Interlock's security stance, threat model, and design decisions.

## Philosophy: Adoption-First Open-Core

Interlock is an open-source project with MIT license. The core library is public and designed for adoption. Security is enforced through:

1. **Conservative Defaults** — Production settings are hardcoded, not loaded from editable demo files
2. **Identity Binding** — Hardware fingerprints detect environment changes, triggering recalibration
3. **Provenance Tracking** — All configuration changes are logged with cryptographic hashes
4. **Review Gates** — CODEOWNERS enforces review for sensitive paths

## Public vs Private Surface

### Public (Open Source)
- Core circuit breaker logic (`services/hysteresis.ts`)
- Adapter interfaces (`adapters/`)
- Event schemas (`schemas/`)
- Demo law configurations (`laws/examples/`)

### Private Enforcement (Not in Repo)
- Production lawpacks (signed, fetched from registry)
- Training data and model weights (if applicable)
- Deployment-specific configurations

## Demo Laws Policy

**Location**: `laws/examples/`

These are **demonstration configurations only**. They are:
- ❌ Not auto-loaded in production
- ❌ Not validated for security
- ⚠️ Explicitly flagged with console warnings if used

The law loader (`services/law-loader.ts`) will print:
```
[Interlock] WARNING: Using demo law path. Production should use INTERLOCK_LAW_PATH or defaults.
```

Production deployments should:
1. Set `INTERLOCK_LAW_PATH` to a signed lawpack, OR
2. Use compiled conservative defaults (no env var = safe defaults)

## Dev Mode Gating

**Environment Variable**: `SDE_DEV_MODE=1`

Dev mode bypasses are:
- ✅ Dual-gated (requires both env var AND explicit flag)
- ✅ Logged loudly with `[DEV MODE]` prefix
- ❌ Never silently enabled
- ❌ Not reachable in default import paths

Example output when dev mode is active:
```
[DEV MODE] WARNING: Hardware fingerprint override enabled via SDE_DEV_MODE + SDE_FORCE_HW_FP
[DEV MODE] This should NEVER be used in production!
```

## Hardware Fingerprint Threat Model

**Purpose**: Identity binding (NOT anti-tampering)

The hardware fingerprint is a SHA256 hash of:
- CPU model (canonicalized: trim, collapse whitespace, lowercase)
- CPU thread count
- RAM (rounded to nearest GB)
- OS family (win32/linux/darwin)

**Excluded** (for stability):
- GPU information
- OS version/build number

### What It Does
- Detects when code runs on a different machine
- Triggers recalibration when environment changes
- Enables lawpack namespacing (different configs for different hardware)

### What It Does NOT Do
- Prevent sophisticated attackers from spoofing
- Guarantee anti-tampering
- Provide cryptographic security

**Mismatch Behavior**: If a lawpack's `hardware_fingerprint` doesn't match the current machine:
- Warning is logged
- Strict production defaults are used
- Recalibration is required

## Supply Chain Checks

| Check | Location | Trigger |
|-------|----------|---------|
| Secret Scanning | `.github/workflows/secret-scan.yml` | Nightly + PRs + manual |
| CodeQL Analysis | `.github/workflows/codeql.yml` | Weekly + PRs |
| Dependabot | `.github/dependabot.yml` | Weekly |
| PR Checks | `.github/workflows/pr-checks.yml` | All PRs |

> **Note on Gitleaks**: The secret scan may flag test credentials in validation scripts (e.g., `test_api_key_...`). These are intentionally allowlisted in `.gitleaks.toml` with minimal, path-scoped rules. See `docs/SECRET_INCIDENT_REPORT.md` for details.

## CODEOWNERS

Sensitive paths require review from designated owners:
- `.github/` — CI/CD changes
- `laws/` — Configuration changes
- `scripts/` — Automation changes
- `services/kernel/`, `services/hysteresis.ts`, `services/phaseIV.ts` — Core logic
