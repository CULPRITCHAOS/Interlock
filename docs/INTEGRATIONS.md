# Interlock Integrations

This document provides detailed integration guides for Interlock adapters.

---

## LangChain

### Purpose

The LangChain adapter adds failure forecasting and circuit-breaker protection to LangChain chains and retrievers. It makes failures visible early and survivable through confidence-based refusal and trust decay mechanisms.

### Failure Modes Protected

- **Trust decay without validation** — Confidence degrades over time without successful executions, preventing stale assumptions
- **Chain execution timeout without graceful degradation** — Latency-based confidence reduction triggers degradation before complete failure
- **Quality floor violations** — Automatic refusal when confidence drops below minimum acceptable threshold
- **Silent failures in retrievers** — Empty results trigger confidence degradation to signal potential issues
- **Cascading chain failures** — Each failure degrades confidence, preventing repeated attempts in degraded state

### Certification Impact

**Enabling LangChain adapter affects Interlock class:**

- **Class III+** requires confidence tracking (provided automatically)
- **Class V** requires quality floor enforcement (must enable `qualityFloorEnabled` in config)
- Shadow mode (`dryRun: true`) allows observation without affecting traffic (recommended for trust acquisition)

**Anti-gaming:** Disabling the adapter or quality floor will downgrade your certification class.

### Example Usage

#### Basic Chain Wrapping

```typescript
import { wrapChain } from './adapters/langchain';
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';

// Your existing LangChain function
async function myChain(input: string): Promise<string> {
  // Your chain logic here
  return result;
}

// Wrap with Interlock safety
const safeChain = wrapChain(myChain, DEFAULT_HYSTERESIS_CONFIG);

// Execute with automatic safety checks
try {
  const result = await safeChain.execute("user query");
  console.log(`Result: ${result}`);
} catch (error) {
  console.error(`Interlock refused execution: ${error.message}`);
}

// Monitor safety metrics
const metrics = safeChain.getMetrics();
console.log(`Confidence: ${metrics.confidenceScore}`);
console.log(`Refusals: ${metrics.refusalCount}`);
console.log(`Safety checks passed: ${metrics.safetyChecksPassed}`);
```

#### Retriever Wrapping

```typescript
import { wrapRetriever } from './adapters/langchain';

// Your retriever function
async function myRetriever(query: string): Promise<Document[]> {
  // Retrieval logic
  return documents;
}

// Wrap with safety checks
const safeRetriever = wrapRetriever(myRetriever, DEFAULT_HYSTERESIS_CONFIG);

// Execute
const docs = await safeRetriever.retrieve("search query");
```

#### Shadow Mode (Dry Run)

```typescript
const config = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  dryRun: true, // Log decisions but don't interfere
  qualityFloorEnabled: true,
  qualityFloor: 0.7
};

const safeChain = wrapChain(myChain, config);

// Logs "WOULD REFUSE" instead of throwing
// Useful for trust acquisition before giving Interlock control
await safeChain.execute(input);
```

#### Custom Quality Floor

```typescript
const config = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  qualityFloorEnabled: true,
  qualityFloor: 0.6, // Refuse if confidence < 60%
  minimumConfidenceThreshold: 0.5 // Trust decay threshold
};

const safeChain = wrapChain(myChain, config);
```

### What Interlock Refuses to Do

- **Does not optimize chain execution speed** — No performance tuning
- **Does not modify LangChain internals** — Only wraps external interface
- **Does not cache results** — No memoization or optimization
- **Does not retry failed chains** — Only observes and refuses
- **Does not abstract LangChain APIs** — You still use native LangChain

**Guiding principle:** Interlock makes failure visible and survivable, not invisible or impossible.

---

## LlamaIndex

### Purpose

The LlamaIndex adapter provides identical safety guarantees as the LangChain adapter, but for LlamaIndex query engines and retrievers. It forecasts failures and enforces quality floors to prevent degraded output.

### Failure Modes Protected

- **Query engine degradation without warning** — Trust decay and confidence tracking
- **Silent retrieval failures** — Empty results trigger confidence reduction
- **Latency spikes causing user-visible delays** — Latency-based confidence degradation
- **Repeated failures cascading** — Each failure reduces confidence, preventing repeated attempts
- **Stale confidence without fresh validation** — Time-based trust decay

### Certification Impact

**Identical to LangChain adapter:**

- Automatic confidence tracking (Class III+)
- Quality floor enforcement (Class V)
- Shadow mode available for dry-run testing
- Disabling adapter or quality floor downgrades certification

### Example Usage

#### Basic Query Engine Wrapping

```typescript
import { wrapChain } from './adapters/llamaindex';
import { DEFAULT_HYSTERESIS_CONFIG } from './services/hysteresis';

// Your query engine function
async function myQueryEngine(query: string): Promise<string> {
  // Query logic
  return response;
}

// Wrap with safety
const safeEngine = wrapChain(myQueryEngine, DEFAULT_HYSTERESIS_CONFIG);

// Execute with guardrails
const response = await safeEngine.query("user question");

// Monitor metrics
const metrics = safeEngine.getMetrics();
console.log(`Average latency: ${metrics.latencyMs}ms`);
console.log(`Current confidence: ${metrics.confidenceScore}`);
```

#### Retriever with Quality Floor

```typescript
import { wrapRetriever } from './adapters/llamaindex';

const config = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  qualityFloorEnabled: true,
  qualityFloor: 0.7,
  dryRun: false // Enforce refusals
};

const safeRetriever = wrapRetriever(myRetriever, config);

try {
  const nodes = await safeRetriever.retrieve(query);
} catch (error) {
  // Handle refusal - confidence below quality floor
  console.error(`Quality floor violation: ${error.message}`);
}
```

#### Shadow Mode for Testing

```typescript
const shadowConfig = {
  ...DEFAULT_HYSTERESIS_CONFIG,
  dryRun: true,
  qualityFloorEnabled: true,
  qualityFloor: 0.8
};

const testEngine = wrapChain(myQueryEngine, shadowConfig);

// Runs normally but logs what Interlock would do
// Use this to calibrate quality floor thresholds
await testEngine.query(testQuery);
```

### What Interlock Refuses to Do

- **Does not optimize query performance** — No index tuning
- **Does not modify LlamaIndex nodes** — Only wraps query interface
- **Does not implement caching** — No result memoization
- **Does not retry queries** — Only observes and refuses
- **Does not abstract LlamaIndex APIs** — Native APIs remain unchanged

**Same principle:** Observation and refusal, not optimization.

---

## Pinecone

### Purpose

The Pinecone adapter provides comprehensive monitoring for Pinecone vector database operations, including latency cliff detection, failure signal tracking, and confidence-based degradation. It enables graceful degradation before complete failure.

### Failure Modes Protected

- **Latency cliffs (sudden spikes)** — Detects when latency jumps >3x previous observations
- **Silent degradation (gradual decline)** — Identifies when average latency increases >50% over time
- **Rate limiting without graceful handling** — Failure signal detection for quota/rate limit errors
- **Timeout cascades** — Tracks timeout patterns and degrades confidence
- **Quality degradation without visibility** — Confidence scoring reveals degraded state

### Certification Impact

**Pinecone adapter enables enterprise certification:**

- **Class IV+** can leverage reflex override on latency cliffs
- **Class V** requires quality floor + confidence monitoring (both provided)
- Certification includes "Certified on Pinecone" designation
- Badge reflects latency thresholds and confidence floors tested

**Certification scope:**
- Latency monitoring accuracy
- Failure detection precision
- Confidence-based refusal correctness
- Shadow mode fidelity

**NOT certified:**
- Pinecone infrastructure reliability
- Vector search recall quality
- Query optimization

### Example Usage

#### Basic Adapter Setup

```typescript
import { createPineconeAdapter } from './adapters/pinecone';

// Create adapter with quality floor of 0.5 (50% confidence minimum)
const adapter = createPineconeAdapter(0.5);

// Your Pinecone query function
async function queryPinecone(params: any): Promise<any> {
  // Pinecone query logic
  return results;
}

// Wrap with monitoring
const safeQuery = adapter.wrapQuery(queryPinecone, false); // false = not dry-run

// Execute with full monitoring
try {
  const results = await safeQuery({ vector, topK: 10 });
} catch (error) {
  console.error(`Interlock refused query: ${error.message}`);
}
```

#### Observing Adapter Metrics

```typescript
// Get comprehensive metrics
const metrics = adapter.observe();

console.log(`Latency P95: ${metrics.latencyP95Ms}ms`);
console.log(`Failure rate: ${metrics.failureRate} per minute`);
console.log(`Confidence: ${metrics.confidenceScore}`);
console.log(`Operations: ${metrics.operationCount}`);

// Check if should refuse
if (adapter.shouldRefuse()) {
  console.warn('Adapter confidence below quality floor - operations will be refused');
}
```

#### Degradation Hooks

```typescript
// Register custom degradation hooks
adapter.onDegradation(0.8, 'warn', () => {
  console.warn('Confidence dropped below 80% - entering warning state');
});

adapter.onDegradation(0.5, 'degrade', () => {
  console.error('Confidence at 50% - degrading service');
  // Switch to fallback index, reduce topK, etc.
});

adapter.onDegradation(0.3, 'refuse', () => {
  console.error('Confidence at 30% - refusing new queries');
});
```

#### Shadow Mode Testing

```typescript
const adapter = createPineconeAdapter(0.6);

// Dry run mode - logs refusals but doesn't throw
const dryRunQuery = adapter.wrapQuery(queryPinecone, true);

// Run in production to observe Interlock behavior
const results = await dryRunQuery(params); // Always succeeds, but logs
```

#### Controlled Failure Injection (Testing)

```typescript
// Enable failure injection for resilience testing
adapter.injectFailure(0.1); // 10% failure rate

// Run tests to verify error handling
// ...

// Disable after testing
adapter.disableFailureInjection();
```

#### Direct Component Access

```typescript
import { 
  LatencyProbe, 
  FailureInjector, 
  ConfidenceMonitor 
} from './adapters/pinecone';

// Use components individually if needed
const latencyProbe = new LatencyProbe();
const failureInjector = new FailureInjector();
const monitor = new ConfidenceMonitor(latencyProbe, failureInjector, 0.5);

// Wrap functions individually
import { wrapWithLatencyProbe } from './adapters/pinecone';
const withLatency = wrapWithLatencyProbe(myFunc, latencyProbe, 'query');
```

### What Interlock Refuses to Do

- **Does not implement Pinecone client** — Use official Pinecone SDK
- **Does not optimize vector search** — No index tuning or query optimization
- **Does not cache query results** — No result memoization
- **Does not abstract Pinecone API** — Native client methods unchanged
- **Does not retry failed queries** — Only observes and refuses
- **Does not manage indexes** — No index creation/deletion

**Adapter scope:** Observation, failure detection, and refusal. Nothing more.

---

## Elasticsearch (Experimental)

### Purpose

**Status: EXPERIMENTAL**

The Elasticsearch adapter demonstrates Interlock's applicability to enterprise AI infrastructure with legacy systems. It focuses on detecting latency cliffs and silent degradation in Elasticsearch vector/hybrid search.

### Failure Modes Protected

- **Latency cliffs** — Sudden query time increases (3x+ previous latency)
- **Silent degradation** — Gradual latency increases (>50% over recent average)
- **Confidence erosion over time** — Trust decay without successful executions
- **Error cascades** — Confidence reduction on repeated failures

### Certification Impact

**Experimental status:**
- Not included in standard certification tiers
- Separate "Experimental Elasticsearch Support" badge
- Certification validates latency detection, not search quality
- Shadow mode required for initial deployment

**What certification validates:**
- Latency cliff detection accuracy
- Silent degradation identification
- Confidence-based refusal logic

**What it does NOT validate:**
- Elasticsearch cluster reliability
- Vector search recall quality
- Hybrid search effectiveness

### Example Usage

#### Basic Setup

```typescript
import { createElasticsearchAdapter } from './adapters/elasticsearch';

// Create adapter with 200ms latency threshold
const adapter = createElasticsearchAdapter(200);

// Your Elasticsearch search function
async function esSearch(params: any): Promise<any> {
  // ES search logic
  return results;
}

// Wrap with monitoring
const safeSearch = adapter.wrapQuery(esSearch, false);

// Execute
try {
  const results = await safeSearch(searchParams);
} catch (error) {
  // Interlock refused due to latency cliff or low confidence
  console.error(`Search refused: ${error.message}`);
}
```

#### Monitoring Metrics

```typescript
const metrics = adapter.getMetrics();

console.log(`Average latency: ${metrics.queryLatencyMs}ms`);
console.log(`Degradation detected: ${metrics.degradationDetected}`);
console.log(`Confidence: ${metrics.confidenceScore}`);
console.log(`Query count: ${metrics.operationCount}`);
```

#### Shadow Mode (Recommended)

```typescript
const adapter = createElasticsearchAdapter(200);

// Shadow mode for observation
const shadowSearch = adapter.wrapQuery(esSearch, true);

// Logs warnings but doesn't refuse
const results = await shadowSearch(params);

// Review metrics to calibrate thresholds
const metrics = adapter.observe();
```

### Experimental Limitations

**Current limitations:**
- No recall quality monitoring (latency only)
- No cluster health integration
- Basic latency cliff detection (3x threshold)
- No shard-level monitoring
- No query complexity analysis

**Recommended usage:**
- Shadow mode only (dryRun: true) for production
- Use for observability, not enforcement
- Calibrate latency thresholds with real traffic
- Monitor confidence trends over time

### What Interlock Refuses to Do

- **Does not implement Elasticsearch client** — Use official client
- **Does not optimize queries** — No query DSL modification
- **Does not manage indexes** — No mapping changes
- **Does not tune cluster settings** — No ES configuration
- **Does not cache search results** — No result storage
- **Does not abstract ES API** — Native API unchanged

**Experimental scope:** Latency observation and cliff detection only.

---

## Integration Principles

All Interlock adapters follow these principles:

### 1. Observation Over Optimization

Adapters **observe** system behavior and **refuse** when unsafe. They do NOT:
- Optimize performance
- Cache results
- Retry operations
- Modify framework internals

### 2. Minimal Surface Area

Each adapter:
- ≤200 LOC per file
- 3-5 exported functions maximum
- Zero dependencies beyond Interlock core + framework SDK
- No feature creep

### 3. Shadow Mode First

All adapters support shadow mode (`dryRun: true`):
- Log decisions without interfering
- Build trust before enforcement
- Calibrate thresholds with real traffic

### 4. Fail Safe

On error, adapters:
- Log failures
- Degrade confidence
- Return safe defaults (shadow mode)
- Never crash the application

### 5. Certification Alignment

Adapters integrate with Interlock's certification system:
- Class assignment derived from config
- Badges reflect real capabilities
- Tampering is detectable
- Expiry enforces re-validation

---

## Choosing an Adapter

| Use Case | Adapter | Status | Certification Level |
|----------|---------|--------|---------------------|
| LangChain chains/retrievers | LangChain | Production | Class V capable |
| LlamaIndex query engines | LlamaIndex | Production | Class V capable |
| Pinecone vector DB | Pinecone | Production | Class V capable |
| Elasticsearch vector search | Elasticsearch | Experimental | Observability only |

**Production recommendation:** Start with shadow mode, calibrate thresholds, then enable enforcement.

**Enterprise use:** Pinecone adapter provides most comprehensive monitoring for vector databases.

**Legacy systems:** Elasticsearch adapter demonstrates extensibility (experimental).

---

## Adapter API Contract

All adapters implement this interface:

```typescript
export interface InterlockAdapter {
  observe(): Metrics;           // Required - collect current metrics
  injectFailure?(): void;       // Optional - controlled failure injection (testing)
  getConfidence(): number;      // Required - current confidence level
}
```

**Metrics structure varies by adapter** but always includes:
- Confidence score (0.0 to 1.0)
- Operation count
- Last observed timestamp
- Adapter-specific metrics (latency, failure rate, etc.)

---

## Contributing New Adapters

See [CONTRIBUTING.md](../CONTRIBUTING.md) for adapter development guidelines.

**Key requirements:**
- ≤200 LOC per file
- Implement `InterlockAdapter` interface
- Zero dependencies beyond core + target framework
- Include shadow mode support
- Add comprehensive documentation
- Provide usage examples

---

## Support

For integration issues:
1. Check [TEST_RESULTS.md](./TEST_RESULTS.md) for adapter test status
2. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
3. See [CERTIFICATION_MODEL.md](./CERTIFICATION_MODEL.md) for class requirements
4. Open an issue with adapter name + error logs
