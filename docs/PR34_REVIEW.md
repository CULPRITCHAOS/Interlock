# PR #34 Security Review Report

**PR**: [#34 - Hardware fingerprint stamping](https://github.com/CULPRITCHAOS/Interlock/pull/34)  
**Reviewed**: 2025-12-30  
**Verdict**: ⚠️ **NEEDS FIXES before merge**

---

## Critical Findings

### 🔴 CRITICAL: Two Conflicting Fingerprint Implementations

**Problem**: The codebase has TWO different fingerprint functions that produce DIFFERENT hashes for the same machine:

| Location | Inputs | Output |
|----------|--------|--------|
| `services/events.types.ts:116` | RAM (MB) + CPU cores only | 16-char hex |
| `services/kernel/hardwareFingerprint.ts:83` | CPU model + threads + RAM (GB) + OS name | 64-char hex |

**Evidence**:
```typescript
// OLD (events.types.ts) - still used by law-loader.ts
const raw = `${totalMemMb}|${cpuCores}`;
cachedFingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);

// NEW (kernel/hardwareFingerprint.ts) - PR #34
const core: FingerprintCore = {
    cpu_model: details.cpu_model,  // <-- NEW
    cpu_threads: details.cpu_threads,
    ram_gb: details.ram_gb,        // <-- Different rounding (GB vs MB)
    os_name: details.os_name       // <-- NEW
};
```

**Impact**: 
- `law-loader.ts` imports from `events.types.ts` (old)
- `packages/interlock-express/` imports from new `kernel/hardwareFingerprint.ts`
- **Same machine will show DIFFERENT fingerprints** depending on which path is used
- Lawpack validation will behave inconsistently

**Required Fix**: Unify to single implementation. Either:
1. Replace old with new and update all imports, OR
2. Delete new file and keep old (less stable)

---

### 🟡 MEDIUM: CPU Model Not Canonicalized

**Problem**: CPU model strings are not normalized. Different Node.js versions or OS updates can return slightly different strings.

**Current**:
```typescript
const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
```

**Risk**: 
- `Intel(R) Core(TM) i7-9700K` vs `Intel Core i7-9700K` = different fingerprint
- Leading/trailing whitespace = different fingerprint

**Suggested Fix**:
```typescript
const cpuModel = (cpus[0]?.model || 'unknown').trim().replace(/\s+/g, ' ');
```

---

### ✅ GOOD: OS Version Correctly Excluded

**Finding**: `os_version` is collected in `getHardwareDetails()` but **excluded** from `FingerprintCore`:

```typescript
// Core fields for fingerprint (GPU and os_version excluded for stability)
const core: FingerprintCore = {
    cpu_model: details.cpu_model,
    cpu_threads: details.cpu_threads,
    ram_gb: details.ram_gb,
    os_name: details.os_name  // Just "win32", "linux", "darwin" - stable
    // os_version intentionally excluded - patches shouldn't invalidate laws
};
```

OS updates will NOT cause fingerprint churn. ✅

---

### ✅ GOOD: RAM Rounding Is Sensible

**Finding**: RAM is rounded to nearest GB:
```typescript
const ramGb = Math.round(ramBytes / (1024 ** 3));
```

This avoids churn from minor memory fluctuations. ✅

---

### ✅ GOOD: Privacy Gating Works Correctly

**Finding**: Raw hardware details are only logged when explicitly opted in:

```typescript
export function getHardwareForStamp() {
    const fingerprint = getHardwareFingerprint();
    
    if (isHardwareLoggingEnabled()) {  // INTERLOCK_INCLUDE_HARDWARE=1
        return { hardware_fingerprint: fingerprint, hardware: getHardwareDetails() };
    }
    
    return { hardware_fingerprint: fingerprint };  // Hash only
}
```

Tests verify this behavior:
- `should NOT include full hardware by default` ✅
- `should include full hardware when env flag is set` ✅

---

### 🟡 MEDIUM: Tests Don't Verify Input Changes = Hash Changes

**Current tests**:
- ✅ Fingerprint is valid hex
- ✅ Fingerprint is stable across calls
- ✅ Logging is gated by env var

**Missing tests**:
- ❌ Different inputs produce different hashes
- ❌ Canonicalization robustness (whitespace, casing)

---

## Threat Model Assessment

**This is identity binding, NOT anti-tamper.** The code comments correctly understand this:

> "hardware_fingerprint changes → require recalibration / refuse old lawpack"

**Current behavior in `law-loader.ts`**:
```typescript
if (law.hardware_fingerprint !== null &&
    law.hardware_fingerprint !== currentHwFingerprint &&
    !ignoreHwMismatch) {
    warnings.push(`Hardware mismatch... Using defaults.`);
    // Falls back to defaults - CORRECT behavior
}
```

This is the right threat model. ✅

---

## Required Actions Before Merge

| Priority | Action |
|----------|--------|
| 🔴 P0 | Unify fingerprint implementations (delete old or migrate all imports) |
| 🟡 P1 | Add CPU model canonicalization (trim, normalize whitespace) |
| 🟡 P1 | Add test: "different RAM → different hash" |
| 🟢 P2 | Add test: "CPU model with extra whitespace → same hash" (after canonicalization) |

---

## Recommended Unification Approach

1. **Keep** `services/kernel/hardwareFingerprint.ts` (more inputs = more stable identity)
2. **Update** `services/events.types.ts` to re-export from kernel:
   ```typescript
   export { getHardwareFingerprint, getHardwareDetails as getHardwareInfo } from './kernel/hardwareFingerprint';
   ```
3. **Update** `law-loader.ts` import path
4. **Delete** duplicate implementation in `events.types.ts`
5. **Verify** all fingerprints in badge history are invalidated (expected - hardware definition changed)
