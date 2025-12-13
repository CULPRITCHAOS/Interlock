# LawForge ⚗️

> **LawForge** is an optimization microscope for discovering, falsifying, and stress-testing domain-scoped laws.
>
> It provides reproducible convergence measurement, falsifiable law tracking, and resilience certification under drift — with explicit evidence, counterexamples, and failure modes.
>
> **LawForge does not attempt universal transfer. It measures where transfer fails.**

![LawForge Preview](https://via.placeholder.com/800x400?text=LawForge+Instrument)

## 🔬 Core Concepts

LawForge is a rigorous measurement instrument for optimization law discovery:

- **Laws** (not heuristics): Explicit, falsifiable statements about parameter-performance relationships with tracked confidence, evidence, and counterexamples.
- **Law Taxonomy**: Laws are classified as Structural (hard constraints), Soft (performance gradients), or Regime-bound (valid under certain drift conditions).
- **Falsification**: Laws are continuously tested against new evidence. When counterexamples accumulate, laws are demoted or falsified.
- **Scope Signatures**: Every law has a defined scope (domain, workload fingerprint, metric set, constraint regime). Laws must not apply outside their scope.
- **Resilience Measurement**: The instrument tracks how laws behave when conditions change, measuring re-convergence time, half-life under perturbation, and churn rate under drift.

## ⚡ Key Features

### 1. Falsifiable Law Tracking
Laws are not just discovered — they are rigorously measured:
- **Confidence scoring** based on trial results and counterexamples
- **Status progression**: hypothesis → validated → falsified → deprecated
- **Scope signatures** that define exactly where a law applies
- **Version tracking** for law evolution over time
- **Law Taxonomy**: Structural, Soft, and Regime-bound classifications
- **Half-life metrics**: Generations a law survives under perturbation
- **Churn rate**: Law invalidation rate under drift conditions

### 2. Optimization Landscape Measurement
LawForge maps the optimization landscape:
- **Stable Regions**: Where laws hold and behavior is predictable
- **Brittle Regions**: Where laws break or behavior is unpredictable
- **Phase Transitions**: Sharp behavior changes at parameter boundaries
- **Invariants**: Laws that hold across all measured regions
- Exports: `landscape.json` and `landscape.md`

### 3. Reproducible Measurement
All experiments use deterministic seeded random number generation:
- **Seed 42** is the default for reproducibility
- Run-to-run variance is tracked and reported
- Results are stored in structured JSON format for analysis

### 4. Resilience Certification Mode
Run LawForge in certification mode (`--mode=certification`) to:
- **Optimize to stability** — Reach stable fitness levels
- **Hold steady** for N generations — Verify consistency
- **Inject drift events** — Multiple perturbations
- **Measure resilience** — Drop Depth, Recovery Time, Law invalidation rate
- **Compute Resilience Score**: `(1 - DropDepth) / RecoveryTime`
- **Output**: `LawForge_Resilience_Audit.md` with recovery curves and shield rating (green/yellow/red)

### 5. Failure Forecasting (Phase III) 🆕
> **LawForge does not prevent failure. It makes failure visible before it happens.**

LawForge now includes a failure forecasting engine that predicts system failures based on observed historical data:

#### Failure Boundary Detection
- Automatically detects **failure boundaries** from phase transitions and drift events
- Tracks **parameter ranges**, **abruptness scores**, and **historical drop depths**
- Calculates **recovery slopes** based on observed recovery times
- Exports: `boundaries.json` and `boundaries.md`

#### Failure Prediction
- `predictFailure(systemState, proposedChange)` function predicts:
  - **Expected drop depth** — How much fitness will drop
  - **Expected recovery time** — Generations to recover
  - **Dominant failure mode** — Primary failure pattern
  - **Confidence score** — Based on historical observations
- **No stochastic guessing** — All predictions derived from observed data

#### Early Warning UI
The dashboard includes an **Early Warning Panel** with:
- 🟢 **Safe Zone** — Operating within safe parameters
- 🟡 **Yellow Zone** — Approaching boundary (monitor closely)
- 🔴 **Red Zone** — Forecasted collapse (immediate action recommended)
- **Tooltip explanations** — Every warning explains why it was triggered
- **Mitigation suggestions** — Recommended actions to avoid failure

#### Forecast Validation
Run certification mode to validate forecast accuracy:
- **Controlled boundary-crossing experiments**
- **Compare predicted vs observed** failure metrics
- **Track forecast error** rates
- **Export**: `forecast_validation.md` with accuracy metrics

#### Certification Extensions
Certification reports now include:
- **Failure Forecast Summary** — Total boundaries, high-risk count, accuracy
- **Unsafe Operating Regions** — Domains and parameters to avoid
- **Recommended Safety Margins** — Safe ranges for each parameter

### 6. Cross-Domain Transfer (Experimental)
> ⚠️ **Warning:** Transfer is experimental and not currently net-positive in aggregate benchmarks (27.4% success rate).
> 
> **LawForge does not attempt universal transfer. It measures where transfer fails.**

- **Law-Gated Transfer**: Transfers constraints, not strategies
- Aborts transfer if scope similarity < threshold
- A/B testing to measure actual impact

### 7. Artifact Export
Every run produces explicit artifacts with no silent successes or hidden failures:
- `laws.final.json` — Machine-readable law definitions
- `laws.final.md` — Human-readable summary with evidence
- `landscape.json` / `landscape.md` — Optimization landscape measurement
- `boundaries.json` / `boundaries.md` — Failure boundary analysis (Phase III)
- `resilience_audit.md` — Resilience certification report (when using `--mode=certification`)
- `forecast_validation.md` — Forecast accuracy metrics (when using `--mode=certification`)
- `results/index.json` — Updated run index

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Visualization**: Recharts, HTML5 Canvas
- **Benchmark Runner**: Node.js with tsx
- **Icons**: Lucide React

## 🚀 Getting Started

1. **Clone the repository**
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run the dashboard**
   ```bash
   npm run dev
   ```
4. **Run benchmarks**
   ```bash
   # Full test matrix
   npm run bench
   
   # Single run with custom parameters
   npm run sim:run -- --seed 42 --gens 500 --transfer on --drift on
   
   # Resilience certification mode
   npm run sim:run -- --seed 42 --mode certification --stability-gens 100 --drift-events 3
   
   # Phase IV: FAISS Ground-Truth Certification
   npm run sim:run -- --seed 42 --mode phase4 --initial-size 10000 --growth-steps 10 --vectors-per-step 10000
   ```

## 🆕 Phase IV: FAISS Ground-Truth Certification

LawForge Phase IV provides real calibrated failure-forecasting using FAISS as the ground-truth domain.

### Key Features

1. **Real FAISS Harness** - Progressive index growth with actual recall@k, latency (p95), memory measurement
2. **Physical Drift Injection** - Load-based drift (vector injection, query spikes), not parameter noise
3. **Forecast Calibration** - Predicts time-to-failure, drop depth, recovery time with measured accuracy
4. **Circuit Breaker Export** - Generates runnable self-defending FAISS client code
5. **Certification Report** - Professional report with honest assessment of capabilities and limitations

### Running Phase IV

```bash
npm run sim:run -- --seed 42 --mode phase4 --initial-size 10000 --growth-steps 10 --vectors-per-step 10000
```

### Output Artifacts

- `certification_report.md` - Executive summary, forecast accuracy, honest assessment
- `forecast_calibration.json` / `.md` - Predicted vs actual failure metrics
- `circuit_breaker.ts` - Runnable self-defending FAISS client

### Honest Assessment

Phase IV reports explicitly state:
- ✅ What LawForge CAN predict (degradation trends, risk levels)
- ❌ What LawForge CANNOT predict (novel failures, exact timing, system-level issues)
- Confidence bounds for all predictions
- Known failure cases from calibration

## 📂 Project Structure

- `/components`: UI widgets (Charts, LawList, CrossDomainPanel, etc.)
- `/services`: Benchmark harness, law validation, code generation, Phase IV services
- `/scripts`: Headless simulation runners for long-horizon experiments
- `/backend`: Python FAISS harness, circuit breaker, certification report generators
- `/results`: Benchmark outputs with per-run folders
- `/types.ts`: TypeScript definitions for Laws, Genomes, and Benchmarks

## 📊 Benchmark Results

Latest benchmark findings (seed 42, 500 generations):

| Metric | Value |
|--------|-------|
| Transfer Net-Positive Rate | 27.4% |
| Avg Re-convergence Time (after drift) | 13.0 generations |
| Law Falsification Rate | 33.3% |
| System Stability | 99%+ |

See `results/consolidated_report.md` for full details.

---

## 📐 Guiding Principle

> **LawForge does not optimize systems. It reveals the physics they obey.**
> 
> **LawForge does not prevent failure. It makes failure visible before it happens.**

---

*LawForge v4.0.0 — Optimization Microscope, Resilience Certification, Failure Forecasting & FAISS Ground-Truth Certification Engine*
