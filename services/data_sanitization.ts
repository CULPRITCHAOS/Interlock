/**
 * Interlock v2.x: Forensic Data Sanitization
 * ==========================================
 * 
 * Problem: Incident reports must be SRE-useful without leaking PII.
 * 
 * Solution: Semantic fingerprinting that replaces raw data with:
 * - vector_norm
 * - sparsity
 * - centroid_id
 * - dimensional_entropy
 * - similarity_distribution
 * 
 * Explicitly strips:
 * - Raw text
 * - User identifiers
 * - Request payloads
 * 
 * Guiding Principle:
 * Reports remain actionable while respecting privacy and legal compliance.
 */

// ============= Semantic Fingerprint Types =============

/**
 * Semantic fingerprint that replaces raw query/payload data
 * Contains only statistical properties, not actual content
 */
export interface SemanticFingerprint {
  // Vector properties (if applicable)
  vectorNorm?: number;          // L2 norm of the vector
  sparsity?: number;            // Fraction of zero/near-zero elements
  centroidId?: string;          // ID of nearest centroid (anonymized)
  dimensionalEntropy?: number;  // Entropy of dimensional distribution
  
  // Similarity distribution
  similarityDistribution?: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    percentile25: number;
    percentile50: number;
    percentile75: number;
  };
  
  // Query characteristics (without revealing content)
  queryCharacteristics?: {
    dimensionality: number;     // Number of dimensions
    magnitudeClass: 'small' | 'medium' | 'large';  // Relative magnitude
    densityClass: 'sparse' | 'normal' | 'dense';   // Sparsity classification
  };
  
  // Timestamp of fingerprinting (for audit trail)
  fingerprintedAt: number;
  
  // Hash of original data (for correlation, not reconstruction)
  contentHash: string;
}

/**
 * Sanitized incident context
 * Contains only actionable information without PII
 */
export interface SanitizedIncidentContext {
  // Sanitized query information
  queryFingerprint?: SemanticFingerprint;
  
  // Sanitized result information
  resultFingerprint?: SemanticFingerprint;
  
  // Operational metrics (always safe)
  operationalMetrics: {
    queryLatencyMs: number;
    resultCount: number;
    indexSizeAtQuery: number;
    memoryPressurePercent: number;
    queueDepth: number;
  };
  
  // Error context (sanitized)
  errorContext?: {
    errorClass: string;         // General error category
    errorCode?: string;         // Numeric/symbolic code only
    stackTraceHash?: string;    // Hash of stack trace for correlation
    affectedComponent: string;  // Which component failed
  };
  
  // Session context (anonymized)
  sessionContext: {
    sessionHash: string;        // Hash of session ID
    requestSequenceNumber: number;
    timeInSession: number;      // ms since session start
    requestsInSession: number;
  };
  
  // Sanitization metadata
  sanitizationMetadata: {
    sanitizedAt: number;
    sanitizerVersion: string;
    fieldsRedacted: string[];   // List of redacted field names
    originalPayloadSize: number;
    sanitizedPayloadSize: number;
  };
}

// ============= PII Detection Patterns =============

const PII_PATTERNS = {
  // Email patterns
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  
  // Phone patterns (various formats)
  phone: /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  
  // SSN-like patterns
  ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
  
  // Credit card-like patterns
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // UUID patterns (might be user IDs)
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  
  // API keys (common patterns)
  apiKey: /\b[A-Za-z0-9]{32,}\b/g,
  
  // JWT tokens
  jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
};

// ============= Sanitization Functions =============

/**
 * Calculate a simple hash for correlation purposes
 * NOT cryptographically secure - just for fingerprinting
 */
export function calculateContentHash(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + '-' + str.length.toString(16);
}

/**
 * Calculate vector norm (L2)
 */
export function calculateVectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

/**
 * Calculate sparsity (fraction of near-zero elements)
 */
export function calculateSparsity(vector: number[], threshold: number = 1e-6): number {
  const nearZeroCount = vector.filter(v => Math.abs(v) < threshold).length;
  return nearZeroCount / vector.length;
}

/**
 * Calculate dimensional entropy
 */
export function calculateDimensionalEntropy(vector: number[]): number {
  const norm = calculateVectorNorm(vector);
  if (norm === 0) return 0;
  
  // Normalize to probability distribution
  const probs = vector.map(v => Math.abs(v) / norm);
  
  // Calculate Shannon entropy
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  
  // Normalize by max possible entropy
  const maxEntropy = Math.log2(vector.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}

/**
 * Calculate similarity distribution statistics
 */
export function calculateSimilarityDistribution(similarities: number[]): SemanticFingerprint['similarityDistribution'] {
  if (similarities.length === 0) {
    return undefined;
  }
  
  const sorted = [...similarities].sort((a, b) => a - b);
  const n = sorted.length;
  
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  
  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    stdDev,
    percentile25: sorted[Math.floor(n * 0.25)],
    percentile50: sorted[Math.floor(n * 0.5)],
    percentile75: sorted[Math.floor(n * 0.75)]
  };
}

/**
 * Generate centroid ID (anonymized identifier for nearest cluster)
 */
export function generateCentroidId(vector: number[], seed: number = 42): string {
  // Simple deterministic hashing for centroid identification
  const norm = calculateVectorNorm(vector);
  const sparsity = calculateSparsity(vector);
  const entropy = calculateDimensionalEntropy(vector);
  
  // Create a stable identifier from vector properties
  const combined = `${norm.toFixed(4)}-${sparsity.toFixed(4)}-${entropy.toFixed(4)}`;
  let hash = seed;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash = hash & hash;
  }
  
  return `centroid-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Create semantic fingerprint from vector data
 */
export function createSemanticFingerprint(
  vector?: number[],
  similarities?: number[],
  originalData?: unknown
): SemanticFingerprint {
  const fingerprint: SemanticFingerprint = {
    fingerprintedAt: Date.now(),
    contentHash: calculateContentHash(originalData || vector || {})
  };
  
  if (vector && vector.length > 0) {
    const norm = calculateVectorNorm(vector);
    const sparsity = calculateSparsity(vector);
    
    fingerprint.vectorNorm = norm;
    fingerprint.sparsity = sparsity;
    fingerprint.centroidId = generateCentroidId(vector);
    fingerprint.dimensionalEntropy = calculateDimensionalEntropy(vector);
    
    fingerprint.queryCharacteristics = {
      dimensionality: vector.length,
      magnitudeClass: norm < 1 ? 'small' : norm < 10 ? 'medium' : 'large',
      densityClass: sparsity > 0.7 ? 'sparse' : sparsity > 0.3 ? 'normal' : 'dense'
    };
  }
  
  if (similarities && similarities.length > 0) {
    fingerprint.similarityDistribution = calculateSimilarityDistribution(similarities);
  }
  
  return fingerprint;
}

/**
 * Check if a string contains potential PII
 */
export function containsPII(text: string): { hasPII: boolean; types: string[] } {
  const foundTypes: string[] = [];
  
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (pattern.test(text)) {
      foundTypes.push(type);
    }
    // Reset regex state
    pattern.lastIndex = 0;
  }
  
  return {
    hasPII: foundTypes.length > 0,
    types: foundTypes
  };
}

/**
 * Redact PII from text
 */
export function redactPII(text: string): { redacted: string; redactedCount: number } {
  let redacted = text;
  let redactedCount = 0;
  
  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = redacted.match(pattern);
    if (matches) {
      redactedCount += matches.length;
      redacted = redacted.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
    }
    // Reset regex state
    pattern.lastIndex = 0;
  }
  
  return { redacted, redactedCount };
}

/**
 * Sanitize an arbitrary object, removing PII and raw payloads
 */
export function sanitizeObject(obj: unknown, depth: number = 0, maxDepth: number = 10): unknown {
  if (depth > maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Check for PII in strings
    const { hasPII } = containsPII(obj);
    if (hasPII) {
      return redactPII(obj).redacted;
    }
    
    // Redact long strings that might be payloads
    if (obj.length > 500) {
      return `[TRUNCATED_STRING: ${obj.length} chars, hash: ${calculateContentHash(obj)}]`;
    }
    
    return obj;
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    // Check if it looks like a vector (array of numbers)
    if (obj.every(v => typeof v === 'number')) {
      if (obj.length > 10) {
        // Replace with fingerprint
        const fingerprint = createSemanticFingerprint(obj);
        return {
          _sanitized: true,
          _type: 'vector',
          fingerprint
        };
      }
    }
    
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    
    for (const [key, value] of Object.entries(record)) {
      // Skip fields that are likely to contain PII
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('key') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('user_id') ||
        lowerKey.includes('userid') ||
        lowerKey.includes('email') ||
        lowerKey.includes('phone') ||
        lowerKey.includes('ssn') ||
        lowerKey.includes('address') ||
        lowerKey.includes('name') && (lowerKey.includes('first') || lowerKey.includes('last'))
      ) {
        sanitized[key] = `[REDACTED_FIELD]`;
        continue;
      }
      
      // Check for vector/embedding fields
      if (
        (lowerKey.includes('vector') || 
         lowerKey.includes('embedding') || 
         lowerKey.includes('query')) &&
        Array.isArray(value) &&
        (value as unknown[]).every(v => typeof v === 'number')
      ) {
        const fingerprint = createSemanticFingerprint(value as number[]);
        sanitized[key] = {
          _sanitized: true,
          _type: 'vector',
          fingerprint
        };
        continue;
      }
      
      // Recursively sanitize
      sanitized[key] = sanitizeObject(value, depth + 1, maxDepth);
    }
    
    return sanitized;
  }
  
  return '[UNSUPPORTED_TYPE]';
}

/**
 * Create sanitized incident context from raw data
 */
export function createSanitizedIncidentContext(
  rawContext: {
    query?: number[];
    result?: number[];
    similarities?: number[];
    latencyMs: number;
    resultCount: number;
    indexSize: number;
    memoryPressure: number;
    queueDepth: number;
    error?: Error;
    sessionId?: string;
    requestNumber?: number;
    sessionStartTime?: number;
    sessionRequestCount?: number;
    rawPayload?: unknown;
  }
): SanitizedIncidentContext {
  const redactedFields: string[] = [];
  let originalSize = 0;
  
  // Calculate original payload size
  try {
    originalSize = JSON.stringify(rawContext).length;
  } catch {
    originalSize = 0;
  }
  
  // Create query fingerprint
  let queryFingerprint: SemanticFingerprint | undefined;
  if (rawContext.query) {
    queryFingerprint = createSemanticFingerprint(
      rawContext.query,
      rawContext.similarities,
      rawContext.query
    );
    redactedFields.push('query');
  }
  
  // Create result fingerprint
  let resultFingerprint: SemanticFingerprint | undefined;
  if (rawContext.result) {
    resultFingerprint = createSemanticFingerprint(
      rawContext.result,
      undefined,
      rawContext.result
    );
    redactedFields.push('result');
  }
  
  // Sanitize error context
  let errorContext: SanitizedIncidentContext['errorContext'];
  if (rawContext.error) {
    const errorStr = rawContext.error.stack || rawContext.error.message || '';
    errorContext = {
      errorClass: rawContext.error.name || 'Error',
      errorCode: (rawContext.error as Error & { code?: string }).code,
      stackTraceHash: calculateContentHash(errorStr),
      affectedComponent: extractComponentFromStack(errorStr)
    };
    redactedFields.push('error.stack', 'error.message');
  }
  
  // Create session context
  const sessionContext: SanitizedIncidentContext['sessionContext'] = {
    sessionHash: rawContext.sessionId 
      ? calculateContentHash(rawContext.sessionId) 
      : 'no-session',
    requestSequenceNumber: rawContext.requestNumber || 0,
    timeInSession: rawContext.sessionStartTime 
      ? Date.now() - rawContext.sessionStartTime 
      : 0,
    requestsInSession: rawContext.sessionRequestCount || 1
  };
  
  if (rawContext.sessionId) {
    redactedFields.push('sessionId');
  }
  
  if (rawContext.rawPayload) {
    redactedFields.push('rawPayload');
  }
  
  const sanitized: SanitizedIncidentContext = {
    queryFingerprint,
    resultFingerprint,
    operationalMetrics: {
      queryLatencyMs: rawContext.latencyMs,
      resultCount: rawContext.resultCount,
      indexSizeAtQuery: rawContext.indexSize,
      memoryPressurePercent: rawContext.memoryPressure,
      queueDepth: rawContext.queueDepth
    },
    errorContext,
    sessionContext,
    sanitizationMetadata: {
      sanitizedAt: Date.now(),
      sanitizerVersion: '1.0.0',
      fieldsRedacted: redactedFields,
      originalPayloadSize: originalSize,
      sanitizedPayloadSize: 0 // Will be calculated below
    }
  };
  
  // Calculate sanitized size
  try {
    sanitized.sanitizationMetadata.sanitizedPayloadSize = JSON.stringify(sanitized).length;
  } catch {
    sanitized.sanitizationMetadata.sanitizedPayloadSize = 0;
  }
  
  return sanitized;
}

/**
 * Extract component name from stack trace
 */
function extractComponentFromStack(stack: string): string {
  // Try to find the first file/component in the stack
  const lines = stack.split('\n');
  for (const line of lines.slice(1)) {
    const match = line.match(/at\s+(?:(\w+)\.)?(\w+)\s+\(/);
    if (match) {
      return match[1] ? `${match[1]}.${match[2]}` : match[2];
    }
    
    // Try alternative format
    const fileMatch = line.match(/\(([^)]+):\d+:\d+\)/);
    if (fileMatch) {
      const path = fileMatch[1];
      const parts = path.split('/');
      return parts[parts.length - 1].replace(/\.[jt]sx?$/, '');
    }
  }
  
  return 'unknown';
}

/**
 * Validate that sanitized data contains no PII
 */
export function validateSanitization(data: unknown): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  function check(obj: unknown, path: string = ''): void {
    if (typeof obj === 'string') {
      const { hasPII, types } = containsPII(obj);
      if (hasPII) {
        issues.push(`PII found at ${path}: ${types.join(', ')}`);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, i) => check(item, `${path}[${i}]`));
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        check(value, path ? `${path}.${key}` : key);
      }
    }
  }
  
  check(data);
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// ============= Exports =============

export default {
  createSemanticFingerprint,
  createSanitizedIncidentContext,
  sanitizeObject,
  containsPII,
  redactPII,
  validateSanitization,
  calculateContentHash,
  calculateVectorNorm,
  calculateSparsity,
  calculateDimensionalEntropy,
  calculateSimilarityDistribution,
  generateCentroidId
};
