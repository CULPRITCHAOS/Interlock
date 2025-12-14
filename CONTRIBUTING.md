# Contributing to Interlock

Thank you for your interest in contributing to Interlock! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and professional
- Focus on constructive feedback
- Welcome newcomers and help them learn
- Assume good intentions

## How to Contribute

### 1. Reporting Bugs

Before creating a bug report:

- Check [existing issues](https://github.com/CULPRITCHAOS/Interlock/issues) to avoid duplicates
- Verify the bug exists in the latest version
- Collect relevant information (version, environment, error messages)

**Bug Report Template:**

```markdown
**Description**: Brief description of the bug

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**: What should happen

**Actual Behavior**: What actually happens

**Environment**:
- Interlock version: x.x.x
- Node.js version: x.x.x
- Python version: x.x.x
- OS: [e.g., Ubuntu 22.04]

**Logs/Screenshots**: Include relevant error messages or screenshots
```

### 2. Suggesting Enhancements

Enhancement suggestions are welcome! Please include:

- Clear use case description
- Expected behavior
- Why this enhancement benefits users
- Potential implementation approach (optional)

### 3. Security Vulnerabilities

**Do NOT open public issues for security vulnerabilities.**

See [SECURITY.md](./SECURITY.md) for responsible disclosure guidelines.

### 4. Pull Requests

We welcome pull requests! Follow these guidelines:

#### Before You Start

1. **Open an issue first** for major changes to discuss approach
2. **Check existing PRs** to avoid duplicate work
3. **Review the codebase** to understand conventions

#### Development Process

1. **Fork the repository**
   ```bash
   gh repo fork CULPRITCHAOS/Interlock
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow existing code style
   - Write clear, descriptive commit messages
   - Keep commits focused and atomic

4. **Test your changes**
   ```bash
   npm run validate    # Run validation test suite
   npm run lint        # Type checking
   ```

5. **Update documentation**
   - Update README.md if adding features
   - Update relevant documentation in `/docs`
   - Add inline comments for complex logic

6. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add feature description"
   ```

7. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Open a Pull Request**
   - Use descriptive PR title
   - Reference related issues
   - Describe what changed and why

## Code Standards

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow existing code style
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Prefer explicit over implicit

**Example:**

```typescript
/**
 * Calculates hazard level based on system metrics.
 * 
 * @param metrics - Current system metrics
 * @returns Hazard level between 0 and 1
 */
export function calculateHazard(metrics: FAISSMetrics): number {
  // Implementation
}
```

### Python

- Follow PEP 8 style guide
- Use type hints
- Add docstrings for functions and classes
- Keep functions focused and single-purpose

**Example:**

```python
def calculate_hazard(metrics: FAISSMetrics) -> float:
    """
    Calculate hazard level based on system metrics.
    
    Args:
        metrics: Current system metrics
        
    Returns:
        Hazard level between 0 and 1
    """
    # Implementation
```

### Testing Requirements

All PRs must include appropriate tests:

1. **Unit Tests**: Test individual functions/components
2. **Integration Tests**: Test component interactions
3. **Validation Tests**: Test safety guarantees

**Test Checklist:**

- [ ] New code has corresponding tests
- [ ] All existing tests pass
- [ ] Validation suite passes (`npm run validate`)
- [ ] No type errors (`npm run lint`)

### Documentation Requirements

- [ ] README.md updated (if adding user-facing features)
- [ ] Inline comments for complex logic
- [ ] JSDoc/docstrings for public APIs
- [ ] Update relevant docs in `/docs` directory

### Security Considerations

**Required for all PRs:**

- [ ] No hardcoded credentials or API keys
- [ ] No logging of sensitive data
- [ ] Input validation for external data
- [ ] No SQL injection vulnerabilities (if applicable)
- [ ] No XSS vulnerabilities (if applicable)

**Security Checklist:**

- Do NOT commit secrets (use environment variables)
- Do NOT log PII in incident reports (use data sanitization)
- Do validate all external inputs
- Do check for known vulnerabilities (`npm audit`)

## Commit Message Guidelines

Use conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(breaker): add flash crowd reflex protection

Adds reflexive safety override that bypasses forecasting when
load spikes exceed flash threshold.

Closes #123
```

```
fix(persistence): handle corrupted state files gracefully

Previously, corrupted state files would cause crashes. Now we
detect corruption and fail safe to OPEN state.

Fixes #456
```

## Review Process

### What We Look For

1. **Correctness**: Does it work as intended?
2. **Safety**: Does it maintain Interlock's safety guarantees?
3. **Testing**: Are there adequate tests?
4. **Documentation**: Is it documented?
5. **Code Quality**: Is it readable and maintainable?
6. **Performance**: Does it introduce performance regressions?

### Review Timeline

- Initial review: Within 7 days
- Follow-up responses: Within 3-5 days
- Approval: When all requirements met

### Addressing Feedback

- Respond to all review comments
- Make requested changes or explain why not
- Push updates to the same branch
- Request re-review when ready

## Development Setup

### Prerequisites

- Node.js 18+ or 20+
- Python 3.9, 3.10, or 3.11
- npm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/CULPRITCHAOS/Interlock.git
cd Interlock

# Install dependencies
npm install

# Run tests
npm run validate
```

### Project Structure

```
/backend          # Python FAISS harness, circuit breaker
/components       # React UI components
/docs             # Documentation
/results          # Test results and artifacts
/scripts          # CLI tools and test runners
/services         # Core TypeScript services
.github/workflows # CI/CD workflows
```

### Key Files

- `services/hysteresis.ts` - Circuit breaker state machine
- `services/incident_report.ts` - Forensic report generation
- `services/state_persistence.ts` - State persistence and hardware fingerprinting
- `services/data_sanitization.ts` - PII sanitization
- `scripts/validation-tests.ts` - Validation test suite

## CI/CD Pipeline

All PRs automatically run:

1. **Type checking** (`npm run lint`)
2. **Validation tests** (`npm run validate`)
3. **Badge signature verification**
4. **Matrix testing** (Python 3.9-3.11, Node 18-20)

**PR must pass all checks before merging.**

## What We're Looking For

### High Priority Contributions

- Bug fixes (especially security-related)
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Example implementations

### Medium Priority

- New validation tests
- Additional safety features
- Monitoring and observability improvements
- Production deployment guides

### Lower Priority (Discuss First)

- Major architectural changes
- Breaking API changes
- New dependencies

## Questions?

- Open a [Discussion](https://github.com/CULPRITCHAOS/Interlock/discussions)
- Review [existing issues](https://github.com/CULPRITCHAOS/Interlock/issues)
- Check the [documentation](./docs)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

**Thank you for contributing to Interlock!** 🔒
