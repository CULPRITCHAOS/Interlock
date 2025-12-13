# Interlock 🔒

> **The Circuit Breaker for AI Infrastructure**

Interlock is a failure forecasting and circuit-breaker system for AI infrastructure. It detects unsafe operating regions, forecasts collapse before it happens, and actively prevents catastrophic failure.

---

## ⚡ What Interlock Is

Interlock is a **failure forecasting and circuit-breaker system** for AI infrastructure:

- **Failure Boundary Detection** — Automatically identifies unsafe operating regions
- **Collapse Forecasting** — Predicts system failures before they happen
- **Circuit Breaker Protection** — Actively prevents catastrophic failure
- **Operational Warranty** — Certifies safe operating limits for AI systems

> If your AI infrastructure can fail, Interlock tells you when and how.

---

## 🚫 What Interlock Is NOT

- **Not an optimizer** — Interlock does not tune or improve system performance
- **Not universal intelligence** — Interlock works within calibrated domains only
- **Not predictive magic** — All forecasts are derived from observed data, not speculation

> Interlock does not optimize systems. It prevents them from breaking.

---

## ✅ Core Guarantees

| Guarantee | Description |
|-----------|-------------|
| **Detects unsafe operating regions** | Maps failure boundaries in parameter space |
| **Forecasts collapse before it happens** | Predicts time-to-failure, drop depth, recovery time |
| **Actively prevents catastrophic failure** | Circuit breaker triggers before system collapse |
| **Certifies safe operating limits** | Generates operational warranties with safety margins |

---

## 🔬 Proof: Key Components

### FailureForecastCalibrator
Calibrates failure forecasts against observed outcomes:
- Predicts time-to-failure based on degradation gradients
- Measures prediction error (precision, recall, F1)
- Tracks false positives/negatives for continuous improvement
- **Location**: `backend/faiss_harness.py`

### PhysicalDriftInjector
Injects physical drift through load-based stress:
- Progressive vector injection (memory pressure)
- Query rate spikes (latency stress)
- Index rebuild pressure
- **Location**: `backend/faiss_harness.py`

### Circuit Breaker Export
Generates self-defending clients:
- Automatic degraded mode when hazard detected
- Three states: CLOSED (normal), OPEN (degraded), HALF_OPEN (recovering)
- Logs all interventions for audit
- **Location**: `backend/circuit_breaker.py`

---

## 🚀 Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run the dashboard**
   ```bash
   npm run dev
   ```

3. **Run failure certification**
   ```bash
   # FAISS Ground-Truth Certification
   npm run sim:run -- --seed 42 --mode phase4 --initial-size 10000 --growth-steps 10 --vectors-per-step 10000
   ```

---

## 📋 Output Artifacts

Every certification run produces:

| Artifact | Description |
|----------|-------------|
| `certification_report.md` | Executive summary with verdict (CERTIFIED / CONDITIONAL / NOT_CERTIFIED) |
| `forecast_calibration.json` | Predicted vs actual failure metrics |
| `circuit_breaker.ts` | Runnable self-defending client code |
| `operational_warranty.json` | Machine-readable safety guarantees |

---

## 🛡️ Circuit Breaker States

| State | Icon | Behavior |
|-------|------|----------|
| **CLOSED** | 🟢 | Normal operation — optimal settings |
| **OPEN** | 🔴 | Degraded mode — reduced accuracy for stability |
| **HALF_OPEN** | 🟡 | Recovery testing — cautiously returning to normal |

---

## 📊 What Interlock CAN Predict

- ✅ Approximate time-to-threshold-breach based on observed degradation gradients
- ✅ Risk level classification (safe/yellow/red) with measured precision/recall
- ✅ Order-of-magnitude recovery time estimates after degradation
- ✅ Memory pressure trends from progressive index growth
- ✅ Recall degradation patterns under increasing load
- ✅ Latency spike probability based on historical data

## ❌ What Interlock CANNOT Predict

- ❌ Novel failure modes not observed during calibration
- ❌ Exact timing of failures (inherent stochastic variance)
- ❌ System-level failures (OOM kills, disk full, network issues)
- ❌ Concurrent workload interference effects
- ❌ Hardware-specific performance cliffs
- ❌ Effects of system updates or configuration changes

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Python (FAISS harness, circuit breaker, certification)
- **Visualization**: Recharts, HTML5 Canvas
- **Runtime**: Node.js with tsx

---

## 📂 Project Structure

- `/backend` — Python FAISS harness, circuit breaker, certification report generators
- `/components` — UI widgets (Early Warning Panel, Charts)
- `/services` — Failure forecasting, circuit breaker logic
- `/scripts` — Headless simulation runners
- `/results` — Certification outputs

---

## 📐 Guiding Principle

> **Interlock does not optimize systems. It prevents them from breaking.**
>
> **Interlock does not prevent failure. It makes failure visible before it happens.**

---

*Interlock v4.0.0 — The Circuit Breaker for AI Infrastructure*
