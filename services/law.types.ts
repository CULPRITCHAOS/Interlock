/**
 * Interlock Law Types
 * ====================
 * Types for law files that control Interlock's tunable parameters.
 * 
 * Laws are read-only. Interlock never writes/mutates law files.
 * SDE proposes changes, humans approve, Interlock loads on restart.
 */

// ============= Law File Schema =============

export interface LawParameters {
    /** Latency threshold in milliseconds */
    latency_threshold_ms: number;

    /** Error rate threshold as percentage (0.05 = 5%) */
    error_threshold_pct: number;

    /** Recovery timeout in milliseconds */
    recovery_timeout_ms: number;

    /** Probe interval in milliseconds */
    probe_interval_ms: number;

    /** Confidence floor (0-1) */
    confidence_floor: number;

    /** Trust decay rate */
    decay_rate: number;
}

export interface LawSource {
    /** Type of law source */
    type: 'baseline' | 'sde_proposal' | 'manual';

    /** SDE proposal ID if type is sde_proposal */
    proposal_id: string | null;

    /** Creation timestamp */
    created_at: string;
}

export interface LawFile {
    /** Unique law identifier */
    law_id: string;

    /** Schema version */
    schema_version: '1.0.0';

    /** Target domain */
    domain: 'ollama' | 'pinecone' | 'faiss' | 'chromadb' | 'weaviate' | 'qdrant' | 'milvus';

    /** Hardware fingerprint this law applies to, or null for all hardware */
    hardware_fingerprint: string | null;

    /** Tunable parameters */
    parameters: LawParameters;

    /** Source information */
    source: LawSource;
}

// ============= Default Parameters =============

export const DEFAULT_LAW_PARAMETERS: LawParameters = {
    latency_threshold_ms: 500,
    error_threshold_pct: 0.05,
    recovery_timeout_ms: 60000,
    probe_interval_ms: 5000,
    confidence_floor: 0.5,
    decay_rate: 0.1
};
