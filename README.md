# Interlock 🔒

> **The Circuit Breaker for AI Infrastructure.**

Interlock is a safety certification and failure-survivability system for AI infrastructure.
It predicts failures, intervenes before collapse, and produces cryptographically verifiable evidence of system behavior under stress.

### 💡 Why Interlock?

Every AI company is one hallucination away from a lawsuit.

Standard circuit breakers only check if the server is up — they return HTTP 200 when your LLM confidently gives the wrong answer. Your users trust it. Your system logged "success." And you're liable.

**Interlock is different.** It tracks AI confidence, refuses to serve low-certainty responses, and produces cryptographically signed audit trails of every intervention. You get evidence, not apologies.

### 🧬 Origin

I started by researching whether AI systems could learn their own optimal operating parameters. That led me to a bigger question: if systems have optimal bounds, what happens when they operate outside them? That's when I built Interlock — to detect when AI systems are operating outside safe bounds, and refuse to serve rather than hallucinate.

> 🤝 **Looking for pilot partners**: If you're running RAG, vector DBs, or LLMs in production and want to test Interlock in shadow mode (free, no risk), [reach out](mailto:13culprit@gmail.com).

✅ **6 Vector DBs** &nbsp;|&nbsp; ✅ **Local AI (Ollama)** &nbsp;|&nbsp; ✅ **TS + Python** &nbsp;|&nbsp; ✅ **Certification Classes I–V**

[![Test and Certify](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml)
[![Stress Chamber](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml)
[![Scale Test](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml)
[![Middleware Express](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/middleware-express.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/middleware-express.yml)
[![Middleware FastAPI](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/middleware-fastapi.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/middleware-fastapi.yml)

**Docs**: [⚡ Quickstart](./docs/QUICKSTART.md) | [🏠 Local AI](./docs/quickstart/local-ai.md) | [📚 Middleware Guide](./docs/MIDDLEWARE.md) | [📊 Case Study](./docs/CASE_STUDY.md)

### 🆕 What's New in v5.2

| Feature | What It Does |
|---------|--------------|
| **Auto Badge Generation** | Certification badge generates automatically on every release tag |
| **Shields.io Endpoint** | Dynamic badge for your README via `results/badge/shields.json` |
| **Version History** | Every certification archived to `results/badge/history/` for audit trail |
| **Formal Primitives** | Standardized vocabulary: Hazard, Reflex, Guard, State, Confidence, Trust Decay |
| **Restart Continuity** | Protection survives process restarts (anti-amnesia) |
| **Variance Reports** | Recovery time distribution, calibration tables, shock type analysis |

> 📖 **Full details**: [Primitives](./docs/primitives.md) · [Variance](./docs/validation/variance.md) · [Continuity](./docs/validation/continuity.md)

---

## 🏗️ Architecture

```mermaid
graph TD
    A[AI System] --> B[Adapter Layer]
    B --> C{Interlock Core}
    
    subgraph Core [Logic Loop]
    D[Confidence Tracking]
    E[Hazard Forecasting]
    F[Circuit Breaker]
    G[Quality Floor]
    end
    
    C --> D
    D --> E --> F --> G
    
    G --> H[Forensic Logging]
    G --> I[Outcome]
    
    I -- Safe --> J[Pass Through]
    I -- Unsafe --> K[Refusal / Degrade]
```

## 📊 The Impact

This is why you use Interlock.

| Scenario | Without Interlock | With Interlock |
|----------|-------------------|----------------|
| **Recall Collapse** | System crashes, users churn | **Degraded but alive** (lower precision) |
| **Load Spike** | OOM / 504 Gateway Timeout | **Refusal + Recovery** (Shed load fast) |
| **Latency Cliff** | Silent corruption, slow UX | **Logged Intervention** (Fast fail) |
| **Postmortem** | Guesswork & "It works on my machine" | **Certified Report** (Cryptographically signed) |

---

## 🔬 Real-World Validation & Certification

Interlock is tested against **live Pinecone APIs** in production-like conditions with injected failures.

### Aggregated Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Total Interventions** | 6 | All successful |
| **Recovery Time (mean)** | 52.3s | σ = 4.8s |
| **Intervention Confidence** | 0.96 | Certainty the intervention was correct |
| **False Negatives** | 0 | No missed failures |
| **Zero Data Loss** | ✅ | All traffic refused safely |
| **Zero Cascading Failures** | ✅ | Isolation worked |

### Validation Artifacts

| Test | CI Workflow | Status |
|------|-------------|--------|
| Core Validation | [test-and-certify.yml](./.github/workflows/test-and-certify.yml) | [![Test](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/test-and-certify.yml) |
| Stress Chamber | [stress-chamber.yml](./.github/workflows/stress-chamber.yml) | [![Stress](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/stress-chamber.yml) |
| Scale Test | [scale-test.yml](./.github/workflows/scale-test.yml) | [![Scale](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml/badge.svg)](https://github.com/CULPRITCHAOS/Interlock/actions/workflows/scale-test.yml) |
| Live Pinecone | [real-pinecone-test.yml](./.github/workflows/real-pinecone-test.yml) | Weekly |
| **Local AI (Ollama)** | [LOCAL_AI_VALIDATION.md](./docs/LOCAL_AI_VALIDATION.md) | ✅ Tested |

### Sample Incident (Live Pinecone + Express)
```
Incident #002: Circuit Breaker Activation
├─ Timestamp: 2025-12-14T03:44:02.266Z
├─ Trigger: Latency/Failure Threshold Exceeded  
├─ Action: Traffic Refusal / Degraded Mode
├─ Recovery: 50.3s
└─ Confidence: 0.96 (High)
```

> 📊 **Evidence**: [Live Incidents](./docs/LIVE_INCIDENTS.md) · [Variance & Calibration](./docs/validation/variance.md) · [Restart Continuity](./docs/validation/continuity.md) · [Case Study](./docs/CASE_STUDY.md)
>
> 📐 **Formal Schema**: [Interlock Primitives](./docs/primitives.md)

## 🔌 Adoption Surface

Interlock fits into your stack in 3 ways. Choose the one that fits your architecture:

| Path | Description | Use Case |
|------|-------------|----------|
| **A. Express Middleware** | Drop-in NPM package. Zero latency overhead. | Node.js / Next.js backends. |
| **B. FastAPI Middleware** | Remote Client that queries "The Brain". | Python AI Services (RAG pipelines). |
| **C. Core Library** | Direct import of `adapters`. | Custom TypeScript implementations. |

### 🚀 Quick Install

**Express (Node)**
```typescript
import { interlockExpress } from '@interlock/express';
app.use(interlockExpress({ quality_floor: 0.8 }));
```

**FastAPI (Python)**
```python
from interlock_fastapi.middleware import InterlockMiddleware
app.add_middleware(InterlockMiddleware, interlock_url="http://brain:3000")
```

[**View the 5-Minute Quickstart →**](./docs/QUICKSTART.md)

---

## 🔬 Proof & Evidence

Interlock follows the **"Evidence Over Claims"** governance model.

- **[Case Study 📊](./docs/CASE_STUDY.md)**: See how Interlock prevented a 100% outage during a simulated Black Friday.
- **[Live Incident Log 🚨](./docs/LIVE_INCIDENTS.md)**: Real forensic logs generated by the system during interventions.
- **[Test Results 🧪](./docs/TEST_RESULTS.md)**: Detailed breakdown of the Stress Chamber, Scale, and Stability tests.

---

## 🔌 Supported Integrations

All integrations are verified via CI/CD pipelines.

| Integration | Status | Verified By |
|-------------|--------|-------------|
| **Pinecone** | ✅ Production | [Real API Test](./.github/workflows/real-pinecone-test.yml) (Weekly) |
| **FAISS** | ✅ Production | [Real FAISS Test](./.github/workflows/real-faiss-validation.yml) (Weekly) |
| **LangChain** | ✅ Production | [Matrix Test](./.github/workflows/test-and-certify.yml) |
| **LlamaIndex** | ✅ Production | [Matrix Test](./.github/workflows/test-and-certify.yml) |
| **Weaviate** | ✅ Stable | Adapter Certification |
| **Milvus** | ✅ Stable | Adapter Certification |
| **Ollama / Local AI** | ✅ Tested | [Validation Report](./docs/LOCAL_AI_VALIDATION.md) |

---

> **Why use Interlock?**
> Because "Retrying" a hallucinating LLM doesn't fix it. You need to know *when* to stop asking.

---

## 📜 License

Interlock is [MIT licensed](./LICENSE) for open-source and evaluation use.

[Commercial licenses](./COMMERCIAL-LICENSE.md) are available for organizations requiring enterprise support, SLAs, or custom certification.

---

## 🔮 Roadmap

| Milestone | Status |
|-----------|--------|
| Certification badge automation | ✅ Complete |
| **Pilot customer deployment** | 🔍 Seeking partners |
| **Published case study** | Planned |
| **Enterprise pricing model** | Planned |
| External chaos testing (k6, stress-ng, toxiproxy) | Planned |
| Cross-domain variance benchmarks | Planned |

> 💼 **Interested in a pilot?** Run Interlock in shadow mode for free. See what it catches. [Contact us](mailto:13culprit@gmail.com).

