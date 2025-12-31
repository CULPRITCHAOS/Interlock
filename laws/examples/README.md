# Example Law Files

> [!CAUTION]
> These are **demo configurations** for local testing only.  
> **DO NOT USE in production.**

## Purpose

These files demonstrate the law file format and structure. The threshold values are **illustrative only** and are intentionally permissive for testing.

## Production Defaults

Production deployments should:

1. **Use compiled conservative defaults** hardcoded in application code
2. **OR** fetch signed lawpacks from a private registry (future capability)
3. **NEVER** auto-load from `laws/examples/` or any demo path

## File Structure

```json
{
  "law_id": "law-{domain}-{type}-{date}",
  "schema_version": "1.0.0",
  "domain": "ollama|openai|custom",
  "parameters": {
    "latency_threshold_ms": 60000,    // DEMO ONLY - use ~500ms in prod
    "error_threshold_pct": 0.05,
    "confidence_floor": 0.3,          // DEMO ONLY - use ~0.7 in prod
    "decay_rate": 0.1
  }
}
```

## See Also

- [Production configuration guide](../docs/PRODUCTION_CONFIG.md) (coming soon)
- [Law schema reference](../schemas/)
