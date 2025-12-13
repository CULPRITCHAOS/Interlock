# Interlock CI/CD Workflows

This directory contains GitHub Actions workflows for automated testing, certification, and evidence collection for the Interlock project.

## Workflows Overview

### 1. Test and Certify (`test-and-certify.yml`)

**Purpose:** Main CI workflow that runs on every push and pull request to validate all Interlock claims.

**Triggers:**
- Push to any branch
- Pull requests

**Features:**
- Matrix testing across Python 3.9, 3.10, 3.11
- Matrix testing across Node.js 18, 20
- Full validation test suite (`npm run validate`)
- Badge signature verification
- Certification artifact generation
- Workflow summaries with detailed metrics

**Artifacts:**
- Validation test results (30-day retention)
- Backend test results (30-day retention)
- Certification badge (90-day retention)

**Duration:** ~30 minutes

---

### 2. Stress Chamber Tests (`stress-chamber.yml`)

**Purpose:** Daily stress testing to validate Interlock protection under extreme load conditions.

**Triggers:**
- Scheduled: Daily at 2 AM UTC
- Manual: workflow_dispatch with configurable parameters

**Features:**
- Comparative stress tests (protected vs control)
- Long-run stability tests (default 50 cycles)
- Memory usage tracking
- Latency and recall degradation monitoring
- Incident report generation

**Configurable Inputs:**
- `stability_cycles`: Number of stability test cycles (default: 50)
- `stress_growth_steps`: Growth steps for stress chamber (default: 25)

**Artifacts:**
- Stress chamber results (60-day retention)
- Stability test results (60-day retention)
- Incident reports (90-day retention)

**Duration:** ~90 minutes

---

### 3. Generate Certification Badge (`generate-certification.yml`)

**Purpose:** Generate and publish Interlock certification badge with tamper-evident signature.

**Triggers:**
- Manual: workflow_dispatch only

**Features:**
- Runs full validation tests for evidence
- Generates certification badge with HMAC-SHA256 signature
- Commits badge files to repository
- Creates GitHub Release with certification artifacts
- Tags release with certification date and class level

**Configurable Inputs:**
- `create_release`: Create GitHub Release (default: true)
- `release_class`: Release tag suffix (default: auto)

**Required Secrets:**
- `INTERLOCK_SIGNING_KEY`: Secret key for badge signing (optional, defaults to test key)

**Artifacts:**
- Certification badge (365-day retention)
- Validation evidence (365-day retention)

**Duration:** ~30 minutes

**Release Tags:** `cert-YYYYMMDD-class-{I-V}`

---

### 4. Benchmark Suite (`benchmark.yml`)

**Purpose:** Weekly performance benchmarking to track regression and compare protection strategies.

**Triggers:**
- Scheduled: Weekly on Sundays at midnight UTC
- Manual: workflow_dispatch with configurable parameters

**Features:**
- Comparative benchmarks (Interlock vs naive vs no protection)
- Full benchmark suite execution
- Performance trend tracking
- Regression analysis

**Configurable Inputs:**
- `benchmark_seed`: Random seed for reproducibility (default: 42)
- `total_steps`: Total benchmark steps (default: 1000)

**Comparison Metrics:**
- Crash point
- Max survivable load
- Average latency
- Recall at peak load
- Time in red zone

**Artifacts:**
- Benchmark results (90-day retention)
- Performance trends (365-day retention)

**Duration:** ~90 minutes

---

### 5. Production Evidence Collection (`production-monitor.yml`)

**Purpose:** Simulate production workloads and collect evidence of Interlock protection effectiveness.

**Triggers:**
- Scheduled: Weekly on Wednesdays at 3 AM UTC
- Manual: workflow_dispatch with scenario selection

**Features:**
- Realistic production workload simulation
- Controlled failure injection
- Economic impact calculation
- Evidence collection for claims verification

**Workload Scenarios:**
1. **standard**: Mixed workload with gradual degradation
2. **high-query-spike**: Flash crowd scenario testing reflex activation
3. **memory-pressure**: Index bloat testing circuit breaker
4. **index-fragmentation**: Degraded recall testing quality floor

**Configurable Inputs:**
- `workload_scenario`: Scenario to simulate (default: standard)
- `duration_minutes`: Simulation duration (default: 30)

**Evidence Collected:**
- Production simulation results
- Failure injection outcomes
- Economic impact reports
- Queries saved / downtime prevented

**Artifacts:**
- Production evidence (365-day retention)
- Failure injection results (90-day retention)
- Economic impact reports (365-day retention)

**Duration:** ~120 minutes (configurable)

---

## Workflow Dependencies

### Required Secrets

- `INTERLOCK_SIGNING_KEY` (optional): Secret key for badge signing
  - Used in: `generate-certification.yml`
  - Defaults to test key if not provided

### Required npm Scripts

All workflows depend on these npm scripts defined in `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "npx tsc --noEmit",
    "bench": "npx tsx scripts/bench-runner.ts",
    "sim:run": "npx tsx scripts/sim-runner.ts",
    "validate": "npx tsx scripts/validation-tests.ts"
  }
}
```

### Required Python Dependencies

Backend workflows require `backend/requirements.txt`:

```txt
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
websockets>=12.0
numpy>=1.26.0
pydantic>=2.6.0
faiss-cpu>=1.7.4
```

---

## Artifact Structure

### Directory Layout

```
results/
├── badge/                    # Certification badges
│   ├── interlock_shield.json
│   ├── interlock_shield.md
│   └── *.svg
├── validation/               # Validation test results
│   ├── *.md
│   └── *.json
├── stress_chamber/           # Stress test results
│   ├── *.md
│   └── *.json
├── stability/                # Stability test results
│   ├── *.md
│   └── *.json
├── benchmark/                # Benchmark results
│   ├── *.md
│   └── *.json
├── production-evidence/      # Production simulation evidence
│   ├── evidence_*.md
│   └── economic_impact_*.md
└── incidents/                # Incident reports
    └── *.md
```

### Retention Policies

- **30 days**: Test results, validation outputs
- **60 days**: Stress chamber, stability tests
- **90 days**: Benchmarks, certification artifacts, incident reports
- **365 days**: Certification badges, performance trends, production evidence

---

## Workflow Summaries

Each workflow generates a detailed summary visible in the GitHub Actions UI:

- **Test and Certify**: Badge details, capabilities, signature info
- **Stress Chamber**: Stress test results, memory metrics, stability analysis
- **Generate Certification**: Badge metadata, capabilities, signature preview
- **Benchmark**: Performance comparison table, Interlock advantage metrics
- **Production Monitor**: Evidence summary, failure prevention analysis, economic impact

---

## Concurrency Control

All workflows use concurrency groups to prevent resource conflicts:

- `test-and-certify`: Group by workflow + ref (cancels stale runs)
- `stress-chamber`: Single instance (no cancellation)
- `benchmark-suite`: Single instance (no cancellation)
- `production-monitor`: Single instance (no cancellation)

Badge generation can run concurrently with other workflows.

---

## Error Handling

### Timeout Limits

- Test workflows: 30 minutes
- Stress tests: 60-90 minutes
- Production simulation: 120 minutes
- Individual jobs: Never exceed 2 hours

### Failure Behavior

- **Test failures**: Workflow fails, blocks merges
- **Stress test crashes**: Expected for control tests, captured in summary
- **Badge generation**: Fails if validation tests fail
- **Benchmark issues**: Logged but don't block other workflows

### Retry Logic

Control tests that are expected to crash use `|| echo "Expected crash"` to prevent workflow failure.

---

## Usage Examples

### Running Validation Tests Locally

```bash
npm run validate
```

### Running Stress Tests Manually

```bash
# Protected test
npx tsx scripts/stress-chamber.ts --seed 42 --initial-size 10000 --growth-steps 25 --protected

# Control test (will crash)
npx tsx scripts/stress-chamber.ts --seed 42 --initial-size 10000 --growth-steps 25 --control
```

### Generating Badge Locally

```bash
npx tsx scripts/generate-badge.ts
```

### Running Benchmarks Locally

```bash
npm run bench
```

---

## Monitoring and Debugging

### View Workflow Status

1. Go to the **Actions** tab in GitHub
2. Select the workflow from the left sidebar
3. Click on a specific run to see details

### Download Artifacts

1. Navigate to a workflow run
2. Scroll to the **Artifacts** section at the bottom
3. Click to download ZIP archives

### Check Workflow Summaries

Each workflow run generates a markdown summary visible in the run details page. This includes:

- Job status tables
- Key metrics
- Performance comparisons
- Evidence summaries

### Troubleshooting

**Validation tests fail:**
- Check validation results artifact
- Review workflow summary for specific test failures
- Run `npm run validate` locally to reproduce

**Stress tests timeout:**
- Increase `timeout-minutes` in workflow file
- Reduce `stress_growth_steps` parameter
- Check system resources

**Badge generation fails:**
- Ensure validation tests pass first
- Check `INTERLOCK_SIGNING_KEY` secret is set
- Verify badge script runs locally

**Benchmark inconsistencies:**
- Use consistent `benchmark_seed` for reproducibility
- Compare multiple runs for trends
- Check for system load variations

---

## Status Badges

Add these to your README to show workflow status:

```markdown
[![Test and Certify](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml)

[![Stress Chamber](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml)

[![Benchmark Suite](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/benchmark.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/benchmark.yml)
```

---

## Security Considerations

### Badge Signing

Certification badges include HMAC-SHA256 signatures covering:
- Interlock Class
- Load Rating
- Valid Until date
- Repository commit
- Configuration fingerprint
- Hardware fingerprint
- Test suite version

### Secret Management

- Never commit `INTERLOCK_SIGNING_KEY` to repository
- Use GitHub Secrets for sensitive values
- Rotate signing keys periodically
- Test key used for CI if secret not set

### Permissions

Workflows use minimal required permissions:
- `contents: write` only for badge generation and releases
- `pull-requests: write` only where needed
- Default `contents: read` for all others

---

## Contributing

When modifying workflows:

1. **Test locally first**: Run scripts manually before updating workflows
2. **Validate YAML**: Use `yamllint` or Python's `yaml.safe_load()`
3. **Update this README**: Document any new workflows or changes
4. **Check artifact retention**: Balance storage costs with evidence needs
5. **Monitor duration**: Keep workflows under timeout limits

---

## Support

For issues or questions:

1. Check workflow summaries for detailed error messages
2. Review artifact contents for test failures
3. Run failing scripts locally to reproduce
4. Check GitHub Actions logs for system issues

---

*Last updated: 2025-12-13*
