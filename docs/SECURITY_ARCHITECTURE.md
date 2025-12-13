# Interlock Security Architecture

## Overview

Interlock is a failure forecasting and circuit breaker system designed with security and trust as core principles. This document describes the security architecture, threat model, and cryptographic guarantees.

## Design Principles

### 1. Trust Minimization

**Principle**: Minimize trust requirements and make trust boundaries explicit.

- **No External Dependencies for Core Logic**: Circuit breaker logic has zero external dependencies
- **Configuration-Bound Trust**: Interlock trusts the operator's configuration, nothing else
- **Evidence-Driven Decisions**: All thresholds derived from observed data, not assumptions
- **Explicit Uncertainty**: When Interlock doesn't know, it says so

### 2. Fail-Safe Defaults

**Principle**: Default to safe states when uncertain or during failures.

- **OPEN State on Corruption**: Corrupted state files → fail to OPEN (conservative)
- **OPEN State on Hardware Mismatch**: Different hardware → invalidate cached thresholds
- **Conservative Escalation**: Confidence drop → escalate to protective mode
- **Quality Floor Enforcement**: Low recall → refuse requests rather than serve corrupt results

### 3. Tamper-Evident, Not Tamper-Proof

**Principle**: Make tampering detectable, not impossible.

- **Badge Signatures**: HMAC-SHA256 signatures make manual edits detectable
- **Runtime Verification**: Signatures verified at load time
- **Security Warnings**: Tampering emits warnings, doesn't crash
- **Honest Assessment**: Certification includes "What We Do NOT Guarantee"

### 4. Defense in Depth

**Principle**: Multiple layers of validation and protection.

- **Input Validation**: Schema validation, bounds checking
- **State Validation**: Integrity checks, corruption detection
- **Hardware Validation**: Fingerprint matching, drift tolerance
- **Signature Validation**: Cryptographic verification

## Threat Model

### Assumed Threats

#### 1. Malicious Configuration

**Threat**: Operator provides intentionally unsafe configuration to bypass safety checks.

**Mitigation**:
- Schema validation rejects invalid configurations
- Anti-gaming rules prevent class spoofing
- Disabled features → lower certification class
- Cannot claim Class V without required features enabled

**Residual Risk**: Operator can disable Interlock entirely (intentional design choice).

#### 2. Badge Tampering

**Threat**: User manually edits badge files to misrepresent certification level.

**Mitigation**:
- HMAC-SHA256 signatures on all badge fields
- Runtime signature verification
- Security warnings on signature mismatch
- Signed fields: `interlock_class`, `load_rating`, `valid_until`, `repo_commit`, `config_fingerprint`, `hardware_fingerprint`, `test_suite_version`

**Residual Risk**: Tamper-evident, not tamper-proof. User can remove verification code.

#### 3. State File Tampering

**Threat**: User manually edits state file to bypass cooldowns or safety checks.

**Mitigation**:
- State file schema validation
- Corruption detection
- Fail-safe to OPEN on invalid state
- Hardware fingerprint prevents cross-machine state transfer

**Residual Risk**: User can delete state file (causes fresh start, conservative behavior).

#### 4. Hardware Migration

**Threat**: State file transferred to different hardware, unsafe thresholds applied.

**Mitigation**:
- Hardware fingerprint stored with state
- Memory, CPU, container limits tracked
- Drift tolerance (default: 20%)
- Invalidate state on significant hardware change

**Residual Risk**: Small hardware differences (<20%) not detected.

#### 5. PII Leakage in Incident Reports

**Threat**: Forensic reports leak sensitive user data.

**Mitigation**:
- Automatic data sanitization
- Raw vectors → semantic fingerprints (norms, sparsity, cluster IDs)
- User identifiers → session hashes
- Statistical properties preserved

**Residual Risk**: Derived statistics might still leak information in edge cases.

### Out of Scope Threats

Interlock does **NOT** protect against:

- **Network Attacks**: DDoS, man-in-the-middle, packet sniffing
- **Web Attacks**: XSS, CSRF, SQL injection
- **Physical Attacks**: Hardware tampering, side channels
- **Social Engineering**: Phishing, pretexting
- **Supply Chain Attacks**: Compromised dependencies (use `npm audit`)
- **Insider Threats**: Malicious operators with system access

## Trust Boundaries

### Boundary 1: Configuration Trust

**What We Trust**: Configuration provided by operators is intentional.

**What We Verify**:
- Schema validation
- Type checking
- Bounds checking (e.g., thresholds ∈ [0, 1])
- Anti-gaming rules (can't claim Class V without required features)

**What We Do NOT Verify**:
- Whether configuration is "good" or "bad"
- Whether operator understands the configuration
- Whether thresholds are optimal for the workload

### Boundary 2: Calibration Trust

**What We Trust**: Test results accurately represent system behavior during testing.

**What We Verify**:
- Test completion without crashes
- Metric collection succeeded
- Forecasts matched outcomes within confidence bounds

**What We Do NOT Verify**:
- Whether test scenarios represent production workloads
- Whether test environment matches production
- Whether calibration is still valid after time passes

### Boundary 3: Runtime Trust

**What We Trust**: Metrics provided to Interlock are accurate.

**What We Verify**:
- Metric types match expected schema
- Values are within reasonable bounds
- Timestamps are monotonically increasing

**What We Do NOT Verify**:
- Whether metrics accurately represent system state
- Whether metrics are being spoofed
- Whether underlying system is functioning correctly

## Cryptographic Guarantees

### Badge Signature (HMAC-SHA256)

**Purpose**: Make badge tampering detectable.

**Algorithm**: HMAC-SHA256

**Signed Fields**:
```typescript
const fieldsToSign = [
  'interlock_class',
  'load_rating',
  'valid_until',
  'repo_commit',
  'config_fingerprint',
  'hardware_fingerprint',
  'test_suite_version'
];
```

**Key Management**:
- Development: Hardcoded key (for demo purposes)
- Production: `INTERLOCK_SIGNING_KEY` environment variable

**Verification**:
```typescript
import { verifyBadgeSignature } from './services/badge_signature';

const isValid = verifyBadgeSignature(badgeData);
if (!isValid) {
  console.error('SECURITY WARNING: Badge signature invalid');
}
```

**Security Properties**:
- ✅ **Integrity**: Detects modifications to signed fields
- ✅ **Authenticity**: Verifies badge was generated by Interlock
- ❌ **Confidentiality**: Badge data is not encrypted (intentionally public)
- ❌ **Non-repudiation**: Shared secret, not public key cryptography

**Limitations**:
- Signing key is shared secret (not asymmetric)
- User can remove signature verification code
- User can regenerate badge with different values
- This is **tamper-evident**, not **tamper-proof**

### Hardware Fingerprint

**Purpose**: Detect when state file is transferred to different hardware.

**Collected Data**:
```typescript
interface HardwareFingerprint {
  totalSystemMemoryMb: number;        // Required
  cpuCores?: number;                  // Optional
  containerMemoryLimitMb?: number;    // Optional (auto-detected)
  platform?: string;                  // Optional (e.g., 'linux', 'darwin')
}
```

**Comparison**:
```typescript
function compareHardwareFingerprints(
  current: HardwareFingerprint,
  stored: HardwareFingerprint,
  tolerance: number = 0.20
): boolean {
  const memoryDiff = Math.abs(current.totalSystemMemoryMb - stored.totalSystemMemoryMb);
  const memoryDriftPct = memoryDiff / stored.totalSystemMemoryMb;
  
  if (memoryDriftPct > tolerance) {
    return false; // Hardware changed significantly
  }
  
  // Container limit changed?
  if (current.containerMemoryLimitMb && stored.containerMemoryLimitMb) {
    const containerDiff = Math.abs(
      current.containerMemoryLimitMb - stored.containerMemoryLimitMb
    );
    const containerDriftPct = containerDiff / stored.containerMemoryLimitMb;
    
    if (containerDriftPct > tolerance) {
      return false;
    }
  }
  
  return true;
}
```

**Security Properties**:
- ✅ **Hardware Change Detection**: Detects significant hardware differences
- ✅ **Container Awareness**: Detects container limit changes
- ❌ **Perfect Matching**: Small changes (<20%) not detected
- ❌ **Tamper Resistance**: User can modify fingerprint in state file

## Data Sanitization

**Purpose**: Prevent PII leakage in forensic incident reports.

**Sensitive Data Removed**:
- Raw query vectors
- User identifiers
- Request payloads
- Raw text

**Replaced With**:
- `vectorNorm`: L2 norm of vector
- `sparsity`: Fraction of near-zero elements
- `centroidId`: Anonymized cluster ID
- `dimensionalEntropy`: Information distribution
- `similarityDistribution`: Statistical summary

**Implementation**: See `services/data_sanitization.ts`

**Security Properties**:
- ✅ **PII Removal**: Raw data not included in reports
- ✅ **Debug Utility**: Statistical properties preserved
- ❌ **Perfect Anonymization**: Derived statistics may still leak information

## State Persistence Security

**Purpose**: Ensure safe behavior across restarts.

**State File**: `interlock_state.json`

**Schema Versioning**: `2.0.0`

**Validation**:
```typescript
interface PersistedState {
  version: string;           // Schema version
  timestamp: number;         // When saved
  state: CircuitState;       // CLOSED, OPEN, HALF_OPEN
  hardwareFingerprint: HardwareFingerprint;
  configFingerprint: string; // Hash of configuration
  // ... other fields
}
```

**Safe Boot Rules**:
1. **Corrupted file** → Fail safe to OPEN
2. **Schema mismatch** → Fail safe to OPEN
3. **Hardware mismatch** → Invalidate state, start OPEN
4. **Stale state (>24h)** → Fresh start
5. **Previous OPEN/HALF_OPEN** → Resume in OPEN (conservative)

**Security Properties**:
- ✅ **Corruption Detection**: Schema validation catches corruption
- ✅ **Fail-Safe Defaults**: Invalid state → conservative mode
- ❌ **Integrity Protection**: No HMAC on state file (could add)
- ❌ **Confidentiality**: State file not encrypted

## Security Best Practices

### For Developers

1. **Never commit secrets**
   ```bash
   # Use environment variables
   export INTERLOCK_SIGNING_KEY="$(openssl rand -hex 32)"
   ```

2. **Validate all inputs**
   ```typescript
   if (typeof metrics.hazard !== 'number' || metrics.hazard < 0 || metrics.hazard > 1) {
     throw new Error('Invalid hazard value');
   }
   ```

3. **Use data sanitization**
   ```typescript
   import { createSanitizedIncidentContext } from './services/data_sanitization';
   
   const sanitized = createSanitizedIncidentContext(rawData);
   ```

4. **Check for vulnerabilities**
   ```bash
   npm audit
   npm audit fix
   ```

### For Operators

1. **Restrict state file permissions**
   ```bash
   chmod 600 interlock_state.json
   chown interlock:interlock interlock_state.json
   ```

2. **Use environment variables for keys**
   ```bash
   # In production
   export INTERLOCK_SIGNING_KEY="your-production-key"
   ```

3. **Monitor for security warnings**
   ```bash
   grep "SECURITY WARNING" /var/log/interlock.log
   ```

4. **Validate badge signatures**
   ```typescript
   const isValid = verifyBadgeSignature(badgeData);
   if (!isValid) {
     // Alert security team
   }
   ```

5. **Enable hardware fingerprinting**
   ```typescript
   const config = {
     enableHardwareFingerprint: true,
     hardwareDriftTolerance: 0.20
   };
   ```

## What Interlock Does NOT Protect Against

This is **NOT** a comprehensive security system. Interlock does **NOT** provide:

### Application Security
- ❌ SQL Injection protection
- ❌ XSS/CSRF protection
- ❌ Authentication/Authorization
- ❌ Session management
- ❌ Input sanitization (beyond validation)

### Network Security
- ❌ DDoS protection
- ❌ Firewall functionality
- ❌ TLS/SSL termination
- ❌ Man-in-the-middle detection
- ❌ Network intrusion detection

### Infrastructure Security
- ❌ Container escape prevention
- ❌ Kernel vulnerability protection
- ❌ Physical security
- ❌ Side-channel attack protection
- ❌ Supply chain security

### Operational Security
- ❌ Access control
- ❌ Audit logging (only Interlock decisions logged)
- ❌ Compliance enforcement
- ❌ Backup/disaster recovery
- ❌ Key management infrastructure

## Security Audit History

- **v5.0.0** (2024-12): Added badge signatures, hardware fingerprinting, data sanitization
- **v4.0.0** (2024-11): Added state persistence with validation
- **v3.0.0** (2024-10): Initial public release

## Reporting Security Issues

See [SECURITY.md](./SECURITY.md) for vulnerability reporting process.

---

**Last Updated**: 2025-12-13

*This security architecture document describes the current implementation. Future versions may add additional security features.*
