# Security Policy

## Supported Versions

Interlock follows semantic versioning. Security updates are provided for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 5.x     | :white_check_mark: |
| 4.x     | :warning: Critical fixes only |
| < 4.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in Interlock, please report it responsibly.

### How to Report

**Preferred Method**: Create a [GitHub Security Advisory](https://github.com/CULPRITCHAOS/Interlock/security/advisories/new)

**Alternative**: Email security concerns to the repository maintainers via GitHub issues marked as security-sensitive.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: Within 7 days
  - High: Within 30 days
  - Medium/Low: Next release cycle

### Disclosure Policy

- **Coordinated Disclosure**: 90 days from initial report
- We will credit security researchers in release notes (unless anonymity is requested)
- We will publish a security advisory after the fix is released

## Security Features

Interlock includes several security features designed to prevent tampering and ensure trustworthy operation:

### 1. Cryptographic Badge Signatures (HMAC-SHA256)

Certification badges include tamper-evident signatures:

- **Signed Fields**: `interlock_class`, `load_rating`, `valid_until`, `repo_commit`, `config_fingerprint`, `hardware_fingerprint`, `test_suite_version`
- **Algorithm**: HMAC-SHA256
- **Verification**: Runtime signature verification with security warnings on mismatch
- **Note**: This is tamper-evident (detects changes), not tamper-proof (does not prevent changes)

### 2. Tamper-Evident Certification

- Badge modifications are detectable
- Runtime verification emits `SECURITY WARNING: Certification Badge Tampered` on signature mismatch
- Badge expiry enforced (default: 30 days)
- Hardware fingerprint validation prevents unsafe state transfer between machines

### 3. No Credential Storage

Interlock does not store or require credentials:

- No API keys embedded in code
- No authentication tokens persisted
- No user credentials required
- Configuration-only setup

### 4. Input Validation

All external data is validated:

- Configuration schema validation
- Metric bounds checking
- State file integrity verification
- Hardware fingerprint validation

### 5. Data Sanitization

Forensic incident reports automatically sanitize sensitive data:

- Raw query vectors replaced with semantic fingerprints (norms, sparsity, cluster IDs)
- No PII leakage in incident reports
- Statistical properties preserved for debugging
- See `services/data_sanitization.ts` for implementation details

## What Interlock Does NOT Protect Against

**Important**: Interlock is a failure forecasting and circuit breaker system. It does NOT provide:

- **Authentication/Authorization**: Interlock does not manage access control
- **Encryption**: Data is not encrypted by Interlock (use TLS/encryption at application layer)
- **DDoS Protection**: Interlock detects load spikes but is not a DDoS mitigation system
- **SQL Injection**: Interlock does not sanitize database queries
- **XSS/CSRF**: Web security is out of scope (use appropriate web frameworks)
- **Physical Security**: Hardware protection is out of scope
- **Network Security**: Firewall and network isolation are external concerns

## Security Best Practices for Deployment

### 1. Use Environment Variables for Signing Keys

```bash
export INTERLOCK_SIGNING_KEY="your-secure-random-key-here"
```

**Never commit signing keys to source control.**

### 2. Restrict State File Permissions

```bash
chmod 600 interlock_state.json
```

Ensure state files are only readable by the Interlock process.

### 3. Validate Badge Signatures in Production

Enable signature verification in your deployment:

```typescript
import { verifyBadgeSignature } from './services/badge_signature';

const isValid = verifyBadgeSignature(badgeData);
if (!isValid) {
  console.error('SECURITY WARNING: Badge signature invalid');
}
```

### 4. Monitor for Tamper Warnings

Set up alerting for security warnings:

```bash
grep "SECURITY WARNING" /var/log/interlock.log | alert-system
```

### 5. Use Hardware Fingerprinting

Enable hardware fingerprint validation to prevent unsafe state transfer:

```typescript
const config = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  enableHardwareFingerprint: true,
  hardwareDriftTolerance: 0.20  // 20% tolerance
};
```

## Security Audit History

- **v5.0.0** (2024-12): Added cryptographic badge signatures, hardware fingerprinting, data sanitization
- **v4.0.0** (2024-11): Added state persistence with integrity validation
- **v3.0.0** (2024-10): Initial public release

## Scope of Security Guarantees

### ✅ What We Guarantee

- Badge signatures are tamper-evident
- State file corruption is detected
- Hardware mismatches invalidate cached thresholds
- Incident reports do not leak PII

### ❌ What We Do NOT Guarantee

- Protection against all attack vectors (see "What Interlock Does NOT Protect Against")
- Zero-day vulnerability immunity
- Backdoor-free dependencies (use dependency scanning tools)
- Perfect security (no system is perfectly secure)

## Dependencies and Supply Chain Security

Interlock has minimal dependencies. We recommend:

1. **Use `npm audit`** to check for known vulnerabilities:
   ```bash
   npm audit
   ```

2. **Pin dependency versions** in production deployments

3. **Review dependency updates** before upgrading

4. **Use Dependabot** or similar tools for automated security updates

## Threat Model

### Trust Boundaries

1. **Configuration-Bound**: Interlock trusts configuration provided by operators
2. **Calibration-Bound**: Predictions are only valid for observed configurations
3. **Evidence-Driven**: All thresholds derived from measured behavior
4. **Uncertainty-Aware**: When uncertain, Interlock escalates conservatively

### Assumed Threats

- **Malicious Configuration**: Operator provides intentionally unsafe configuration
- **Badge Tampering**: User manually edits badge files to misrepresent certification
- **State File Tampering**: User manually edits state file to bypass safety checks
- **Hardware Migration**: State file transferred to different hardware without validation

### Mitigations

- **Configuration validation**: Schema validation prevents invalid configurations
- **Badge signatures**: Tamper-evident signatures detect manual edits
- **State file validation**: Integrity checks detect corruption
- **Hardware fingerprinting**: Validates hardware hasn't changed significantly

## Contact

For security-related questions or concerns:

1. Open a [Security Advisory](https://github.com/CULPRITCHAOS/Interlock/security/advisories/new)
2. Check [existing security advisories](https://github.com/CULPRITCHAOS/Interlock/security/advisories)
3. Review this security policy for updates

---

**Last Updated**: 2025-12-13

*This security policy is subject to change. Check back regularly for updates.*
