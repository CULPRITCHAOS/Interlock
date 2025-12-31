/**
 * Interlock Adapter Types
 * ========================
 * Core types for the Interlock domain adapter system.
 * 
 * Adapters allow Interlock to work with any domain (ollama, dream_machine, etc.)
 * by providing:
 * 1. Domain metrics → Universal metrics translation
 * 2. Kernel physics → Domain config mapping
 * 3. Event stamping with adapter provenance
 */

// ============= Kernel Physics (Contract with SDE) =============

/**
 * Kernel physics values shipped by SDE.
 * These are the operational parameters Interlock MUST enforce.
 */
export interface KernelPhysics {
    max_safe_latency_ms: number;
    min_confidence_floor: number;
    error_threshold_rate: number;
    recovery_timeout_ms: number;
    probe_interval_ms: number;
}

/**
 * Kernel source metadata for attribution.
 */
export interface KernelSource {
    domain: string;
    packet_id: string;
    quality_level: string;
    law_hash: string;
    timestamp?: string;
    sde_commit?: string;
}

/**
 * Full kernel profile from hardware_profile.json.
 * Supports both v0.2 flat format and v0.3 registry format.
 */
export interface DomainEntry {
    source?: KernelSource;
    physics?: KernelPhysics;
    physics_hash?: string;
    status?: {
        mode?: string;
        last_ship_at?: string;
        last_rollback_at?: string;
    };
    _integrity_warning?: Record<string, unknown>;
}

export interface KernelProfile {
    schema_version: string;
    host_id?: string;

    // v0.2 flat format
    source?: KernelSource;
    physics?: KernelPhysics;

    // v0.3 registry format
    registry?: Record<string, DomainEntry>;

    status?: {
        mode?: string;
        last_ship_at?: string;
    };
    _warnings?: string[];
    _migrated_from_v02?: Record<string, unknown>;
}

// ============= Universal Metrics (Cross-Domain Contract) =============

/**
 * Universal metrics model that all adapters translate TO.
 * Kept intentionally lean - every field must be meaningful for law discovery.
 */
export interface UniversalMetrics {
    // Required: Core timing
    timestamp: string;  // ISO 8601

    // Required: Latency (at least one)
    latency_ms?: number;        // Single request latency
    latency_p95_ms?: number;    // 95th percentile
    latency_max_ms?: number;    // Maximum observed

    // Required: Error rate (0-1 scale, NOT percentage)
    error_rate: number;

    // Optional: Intervention marker
    intervention?: boolean | string;  // true, or type like "circuit_open"

    // Optional: Resource measures
    cpu_percent?: number;
    memory_mb?: number;
    gpu_memory_mb?: number;     // GPU memory for ML workloads

    // Optional: Request volume
    request_count?: number;

    // Optional: LLM-specific metrics
    concurrent_operations?: number;  // For concurrency limiting
    context_tokens?: number;         // Context window usage

    // Adapter provenance
    adapter_id?: string;

    // Workload identity (model provenance)
    workload?: WorkloadIdentity;
}

// ============= Workload Identity (Model Provenance) =============

/**
 * Workload identity for model provenance tracking.
 * Source of truth is the adapter's configured model, NOT runtime queries.
 */
export interface WorkloadIdentity {
    /** Model identifier, e.g., "gemma3:12b", "gpt-4o" */
    model_id: string;

    /** Provider/platform, e.g., "ollama", "openai" */
    provider: string;

    /** Adapter name, e.g., "ollama", "anthropic", "openai" */
    adapter?: string;

    /** API endpoint or route, e.g., "/api/generate", "/v1/chat/completions" */
    endpoint?: string;

    /** Max tokens for this request (for reproducibility) */
    token_cap?: number;

    /** SHA256 hash of prompt text (privacy-safe workload fingerprint) */
    prompt_hash?: string;

    /** Optional: strong digest for reproducibility (from `ollama show --json` etc.) */
    model_digest?: string;

    /** Optional: hash of the full config for this workload */
    config_hash?: string;
}

// ============= Domain Config =============

/**
 * Domain-specific configuration controlled by the adapter.
 * Free-form object that adapters can customize.
 */
export interface DomainConfig {
    [key: string]: unknown;
}

// ============= Adapter Interface =============

/**
 * Core adapter interface that all domain adapters must implement.
 * 
 * Adapters provide the bridge between domain-specific systems and
 * Interlock's universal model.
 */
export interface InterlockAdapter {
    /** Unique adapter identifier, e.g. "ollama/v1" */
    adapter_id: string;

    /** Domain this adapter handles, e.g. "ollama" */
    domain: string;

    /** Adapter version for compatibility tracking */
    version: string;

    /**
     * Translate domain-specific events into universal metrics.
     * 
     * @param domainEvent - Raw event from the domain system
     * @returns Universal metrics or null if event should be skipped
     */
    translateMetrics(domainEvent: unknown): UniversalMetrics | null;

    /**
     * Map kernel physics into domain-specific configuration.
     * 
     * @param physics - Kernel physics from SDE
     * @param currentConfig - Current domain configuration
     * @returns Updated domain configuration with physics applied
     */
    applyPhysics(physics: KernelPhysics, currentConfig: DomainConfig): DomainConfig;

    /**
     * Get default domain configuration.
     */
    getDefaultConfig(): DomainConfig;

    /**
     * Optional: Validate domain event before processing.
     */
    validateEvent?(domainEvent: unknown): boolean;
}

// ============= Stamping Types =============

/**
 * Kernel stamp for event attribution.
 * Added to every event for SDE monitor attribution.
 */
export interface KernelStamp {
    schema_version: string;
    packet_id: string;
    law_hash: string;
    quality_level?: string;
    domain?: string;
    timestamp?: string;
    missing?: boolean;
}

/**
 * Adapter stamp for event attribution.
 */
export interface AdapterStamp {
    adapter_id: string;
    version: string;
}

/**
 * Combined provenance stamp for events.
 */
export interface EventProvenance {
    kernel: KernelStamp;
    adapter?: AdapterStamp;
    physics_hash?: string;
}
