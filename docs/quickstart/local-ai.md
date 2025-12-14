# Quickstart: Local AI (Ollama, LM Studio)

Run Interlock with your local LLM. No cloud costs. No API keys.

---

## Supported Local AI

| Platform | Status |
|----------|--------|
| **Ollama** | ✅ Recommended |
| **LM Studio** | ✅ Works |
| **llama.cpp server** | ✅ Works |
| **vLLM** | ✅ Works |
| **Text Generation WebUI** | ✅ Works |

---

## Express + Ollama Example

```typescript
import express from 'express';
import { interlockExpress } from '@interlock/express';

const app = express();
app.use(express.json());

// Add Interlock protection
app.use(interlockExpress({
  quality_floor: 0.7,
  circuit_breaker: true,
  shadow_mode: false
}));

// Wrap your Ollama calls
app.post('/chat', async (req, res) => {
  const start = Date.now();
  
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt: req.body.prompt,
      stream: false
    })
  });
  
  const data = await response.json();
  const latency = Date.now() - start;
  
  // Interlock tracks this automatically
  res.json({
    response: data.response,
    latency_ms: latency
  });
});

app.listen(3000, () => {
  console.log('Protected Ollama server on :3000');
});
```

---

## What Interlock Monitors

| Signal | Source | Action |
|--------|--------|--------|
| **Latency** | Response time | Trip circuit if > threshold |
| **Error rate** | Failed requests | Degrade or refuse |
| **Confidence** | Logprobs (if available) | Quality floor enforcement |

---

## Run

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start your protected server
npx tsx server.ts

# Terminal 3: Test
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!"}'
```

---

## Why Use Interlock with Local AI?

| Problem | Interlock Solution |
|---------|-------------------|
| Local LLM hangs under load | Circuit breaker trips, returns error fast |
| Model gives low-quality response | Quality floor refuses to serve |
| GPU memory pressure | Latency spike detected, traffic reduced |
| No audit trail | Forensic logs of every intervention |

---

## Confidence from Local LLMs

Most local LLMs can return logprobs (token probabilities). Use these as confidence signals:

```typescript
// Ollama with logprobs
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'mistral',
    prompt: 'What is 2+2?',
    options: {
      logprobs: true  // Request token probabilities
    }
  })
});

// Use mean logprob as confidence proxy
const confidence = calculateMeanLogprob(response.logprobs);
```

---

*Works with any local AI that exposes an HTTP API.*
