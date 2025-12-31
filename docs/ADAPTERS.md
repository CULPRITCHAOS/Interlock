# Interlock Domain Adapters

> One core, pluggable domains. Kernel physics is the contract.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     INTERLOCK CORE                             │
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ kernelLoader │───▶│ AdapterReg.  │───▶│   bootInt.   │     │
│  │              │    │              │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│                              │                   │             │
│                              ▼                   ▼             │
│                       ┌─────────────────────────────────┐     │
│                       │        stampEvent()             │     │
│                       │    (kernel + adapter stamp)     │     │
│                       └─────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│                       DOMAIN ADAPTERS                          │
│                                                                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │  ollama   │  │  dream_   │  │  custom   │  │   ...     │   │
│  │  adapter  │  │  machine  │  │  adapter  │  │           │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Adapter Interface

```typescript
interface InterlockAdapter {
    adapter_id: string;    // e.g. "ollama/v1"
    domain: string;        // e.g. "ollama"
    version: string;

    // Domain metrics → Universal metrics
    translateMetrics(domainEvent: unknown): UniversalMetrics | null;

    // Kernel physics → Domain config
    applyPhysics(physics: KernelPhysics, currentConfig: DomainConfig): DomainConfig;

    // Get defaults
    getDefaultConfig(): DomainConfig;
}
```

---

## Universal Metrics

All adapters translate domain events to this common model:

```typescript
interface UniversalMetrics {
    timestamp: string;           // ISO 8601
    latency_ms?: number;         // Single request
    latency_p95_ms?: number;     // 95th percentile
    error_rate: number;          // 0-1 scale (NOT percentage)
    intervention?: boolean;      // Intervention marker
    request_count?: number;      // Volume
    adapter_id?: string;         // Source adapter
}
```

---

## Kernel Physics (Contract)

These are the operational parameters shipped by SDE:

| Field | Type | Description |
|-------|------|-------------|
| `max_safe_latency_ms` | number | Latency breach threshold |
| `min_confidence_floor` | number | Minimum confidence (0-1) |
| `error_threshold_rate` | number | Error rate threshold (0-1) |
| `recovery_timeout_ms` | number | Recovery cooldown |
| `probe_interval_ms` | number | Health check interval |

---

## Event Stamping

Every event includes provenance:

```json
{
    "event_type": "health_window",
    "timestamp": "2025-12-16T...",
    "kernel": {
        "schema_version": "0.2.0",
        "packet_id": "ep_battery_ollama_...",
        "law_hash": "abc123"
    },
    "adapter": {
        "adapter_id": "ollama/v1",
        "version": "1.0.0"
    },
    "physics_hash": "7a3b9c..."
}
```

---

## Using the Ollama Adapter

```typescript
import { AdapterRegistry, bootInterlock, initStamping, stampEvent } from 'interlock-core';
import { OllamaAdapter } from 'adapter-ollama';

// 1. Register adapter
AdapterRegistry.registerAdapter(OllamaAdapter);

// 2. Boot with kernel
const boot = bootInterlock('ollama');
initStamping(boot);

// 3. Emit boot event
console.log(JSON.stringify(boot.bootEvent, null, 2));

// 4. Stamp all events
const event = { event_type: 'health_window', latency_p95_ms: 150 };
const stamped = stampEvent(event);
// stamped now has kernel + adapter provenance
```

---

## Closed Loop Proof

### 1. Ship Law → Kernel Updated

```bash
cd Simulated-Desire-Engine
py -m SDE.cli ship --packet results/evidence/ollama/L2_evidence.json
```

### 2. Boot Interlock → kernel_boot Event

```bash
cd Interlock
# Start with kernel path
COGNITIVE_KERNEL_PATH=../Simulated-Desire-Engine/kernel/hardware_profile.json npm run dev
```

**Expected kernel_boot event:**
```json
{
    "event_type": "kernel_boot",
    "timestamp": "2025-12-16T...",
    "kernel": {
        "packet_id": "ep_battery_ollama_20251216",
        "law_hash": "abc123",
        "schema_version": "0.2.0"
    },
    "adapter": {
        "adapter_id": "ollama/v1",
        "version": "1.0.0"
    },
    "effective_config": {
        "latencyThresholdMs": 1900,
        "errorThresholdRate": 0.05
    },
    "safe_mode": false
}
```

### 3. Events Stamped → SDE Monitor Attribution

```bash
cd Simulated-Desire-Engine
py -m SDE.cli monitor --domain ollama --events ../Interlock/logs/interlock_events.jsonl
```

Monitor reads `kernel.packet_id` from events and computes FN/TP/FP using the SAME physics Interlock enforced.

### 4. FN>0 → Rollback → Kernel Update → Restart

```bash
# If FN detected
py -m SDE.cli rollback --domain ollama --reason "FN detected"

# Restart Interlock - new kernel loaded
COGNITIVE_KERNEL_PATH=../Simulated-Desire-Engine/kernel/hardware_profile.json npm run dev
```

---

## Creating a New Adapter

```typescript
import { InterlockAdapter, UniversalMetrics, KernelPhysics, DomainConfig } from 'interlock-core';

export const MyAdapter: InterlockAdapter = {
    adapter_id: 'mydomain/v1',
    domain: 'mydomain',
    version: '1.0.0',

    translateMetrics(domainEvent: unknown): UniversalMetrics | null {
        // Translate domain format to universal
        const e = domainEvent as MyDomainEvent;
        return {
            timestamp: e.ts,
            latency_ms: e.response_time,
            error_rate: e.failures / e.total,
            adapter_id: this.adapter_id
        };
    },

    applyPhysics(physics: KernelPhysics, config: DomainConfig): DomainConfig {
        return {
            ...config,
            timeout: physics.max_safe_latency_ms,
            retryThreshold: physics.error_threshold_rate
        };
    },

    getDefaultConfig(): DomainConfig {
        return { timeout: 500, retryThreshold: 0.05 };
    }
};
```

---

## The Contract

**Interlock MUST enforce the exact physics SDE shipped.**

If the kernel says `max_safe_latency_ms: 1900`, then Interlock's breach detection uses 1900ms. If SDE monitor computes FN using 1900ms and Interlock was using something different, the loop is broken.

The adapter's `applyPhysics()` is the bridge that makes this contract real.
