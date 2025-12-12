# LawForge ⚗️

> **LawForge** is a deterministic optimization laboratory for discovering, validating, falsifying, and enforcing domain-scoped optimization laws.
>
> It provides reproducible convergence benchmarks, falsifiable law tracking, and resilience testing under drift — with explicit evidence, counterexamples, and failure modes.

![LawForge Preview](https://via.placeholder.com/800x400?text=LawForge+Dashboard)

## 🔬 Core Concepts

LawForge formalizes the process of optimization law discovery:

- **Laws** (not heuristics): Explicit, falsifiable statements about parameter-performance relationships with tracked confidence, evidence, and counterexamples.
- **Falsification**: Laws are continuously tested against new evidence. When counterexamples accumulate, laws are demoted or falsified.
- **Scope Signatures**: Every law has a defined scope (domain, workload fingerprint, metric set, constraint regime). Laws must not apply outside their scope.
- **Resilience Under Drift**: The system tracks how laws behave when conditions change, measuring re-convergence time and stability.

## ⚡ Key Features

### 1. Falsifiable Law Tracking
Laws are not just discovered — they are rigorously tracked:
- **Confidence scoring** based on trial results and counterexamples
- **Status progression**: hypothesis → validated → falsified → deprecated
- **Scope signatures** that define exactly where a law applies
- **Version tracking** for law evolution over time

### 2. Reproducible Benchmarks
All experiments use deterministic seeded random number generation:
- **Seed 42** is the default for reproducibility
- Run-to-run variance is tracked and reported
- Results are stored in structured JSON format for analysis

### 3. Drift Resilience Testing
Test system behavior under changing conditions:
- **Scheduled drift injection** at configurable generations
- **Re-convergence time measurement**
- **Law stability tracking** before/after drift events

### 4. Cross-Domain Transfer (Experimental)
> ⚠️ **Note:** Transfer is experimental and not currently net-positive in aggregate benchmarks (27.4% success rate).

The system can attempt to transfer successful strategies between domains, with A/B testing to measure actual impact.

### 5. Law Export
Export discovered laws as artifacts:
- `laws.final.json` — Machine-readable law definitions
- `laws.final.md` — Human-readable summary with evidence

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
   ```

## 📂 Project Structure

- `/components`: UI widgets (Charts, LawList, CrossDomainPanel, etc.)
- `/services`: Benchmark harness, law validation, code generation
- `/scripts`: Headless simulation runners for long-horizon experiments
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

*LawForge v3.0 — Deterministic Optimization Laboratory*
