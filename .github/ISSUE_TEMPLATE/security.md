---
name: Security Vulnerability Report
about: Report a security vulnerability (use private security advisory for sensitive issues)
title: '[SECURITY] '
labels: security
assignees: ''
---

## ⚠️ IMPORTANT: For Sensitive Security Issues

**Do NOT use this public issue for sensitive security vulnerabilities.**

Instead, create a private [GitHub Security Advisory](https://github.com/CULPRITCHAOS/Interlock/security/advisories/new).

---

## Security Issue Description

**Brief Summary**: 
<!-- Provide a brief description of the security issue -->

**Severity Assessment**: 
<!-- Your assessment: Critical / High / Medium / Low -->

## Vulnerability Details

**Type of Vulnerability**:
<!-- e.g., Badge tampering, State file corruption, Input validation, etc. -->

**Affected Component**:
<!-- e.g., Badge signature, State persistence, Circuit breaker, etc. -->

**Affected Versions**:
<!-- e.g., All versions, v5.0.0+, etc. -->

## Steps to Reproduce

1. 
2. 
3. 

## Expected Behavior

<!-- What should happen? -->

## Actual Behavior

<!-- What actually happens? -->

## Potential Impact

<!-- Describe the potential security impact -->

- [ ] Data leakage
- [ ] Unauthorized access
- [ ] Denial of service
- [ ] Certification bypass
- [ ] Other: ___

## Suggested Fix

<!-- If you have suggestions for fixing this issue -->

## Proof of Concept

<!-- If applicable, provide PoC code or steps (sanitized) -->

```typescript
// PoC code here (remove sensitive details)
```

## Environment

- **Interlock Version**: 
- **Node.js Version**: 
- **Python Version**: 
- **OS**: 
- **Deployment Type**: [Local / Docker / Kubernetes / Other]

## Additional Context

<!-- Any other context, screenshots, or information -->

## Checklist

- [ ] I have checked this is not a duplicate issue
- [ ] I have reviewed the [Security Policy](../SECURITY.md)
- [ ] I have assessed this issue is appropriate for a public issue (not highly sensitive)
- [ ] I have removed any sensitive information from this report

---

## For Maintainers

- [ ] Issue triaged and severity assessed
- [ ] Security advisory created (if needed)
- [ ] Fix developed and tested
- [ ] Security patch released
- [ ] Advisory published
- [ ] Reporter credited (if desired)
