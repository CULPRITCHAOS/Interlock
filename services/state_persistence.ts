/**
 * Interlock v2.x: State Persistence Service
 * ==========================================
 * 
 * Problem: Interlock loses safety context on restart:
 * - Breaker state (CLOSED / OPEN / HALF_OPEN)
 * - Reflex cooldown timers
 * - Confidence history
 * - Recent interventions
 * 
 * This creates unsafe optimism after restarts.
 * 
 * Solution: Local state persistence with:
 * - Schema versioning for forward compatibility
 * - Validation on load
 * - Safe boot behavior (never auto-restore CLOSED without evidence)
 * - Fail-safe on corrupt state (default to OPEN)
 * - Hardware fingerprinting to prevent "hardware lottery" crashes (v2.0.0+)
 * 
 * Guiding Principle:
 * Interlock prefers caution over optimism after restart.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CircuitState } from './phaseIV.types';

// ============= Schema Version =============

export const STATE_SCHEMA_VERSION = '2.0.0';  // Bumped for hardware fingerprint addition

// ============= Hardware Fingerprint Types =============

/**
 * Hardware fingerprint for persistence safety
 * 
 * Problem: Thresholds learned on a large machine may be unsafe on a smaller one.
 * Solution: Store hardware fingerprint and invalidate cached state on mismatch.
 */
export interface HardwareFingerprint {
  // Required: Total system memory in MB
  totalSystemMemoryMb: number;
  
  // Optional but useful: Number of CPU cores
  cpuCores?: number;
  
  // Optional: Container memory limit (cgroup detection)
  containerMemoryLimitMb?: number;
}

/**
 * Tolerance settings for hardware fingerprint comparison
 */
export interface HardwareFingerprintTolerance {
  // Memory tolerance as fraction (e.g., 0.2 = 20% difference allowed)
  memoryToleranceFraction: number;
  
  // CPU cores tolerance as absolute difference (e.g., 2 = allow +/- 2 cores)
  cpuCoresTolerance: number;
}

export const DEFAULT_FINGERPRINT_TOLERANCE: HardwareFingerprintTolerance = {
  memoryToleranceFraction: 0.2,  // 20% memory difference triggers invalidation
  cpuCoresTolerance: 2           // Allow +/- 2 CPU cores
};

// ============= Persisted State Types =============

/**
 * Persisted state schema
 * Contains all safety-critical state that must survive restarts
 */
export interface PersistedState {
  // Schema version for forward compatibility
  schemaVersion: string;
  
  // Hardware fingerprint (v2.0.0+)
  hardwareFingerprint?: HardwareFingerprint;
  
  // Core breaker state
  breakerState: CircuitState;
  lastTransitionTimestamp: number;
  
  // Reflex cooldown (flash crowd protection)
  reflexCooldownRemaining: number;  // ms remaining, 0 if not in cooldown
  lastReflexTripTimestamp: number | null;
  
  // Confidence history (bounded window)
  confidenceHistory: number[];  // Last N confidence values
  
  // Incident tracking
  lastIncidentId: string | null;
  interventionCount: number;
  
  // Quality floor state
  totalRefusals: number;
  
  // Timestamp for staleness detection
  persistedAt: number;
  
  // Checksum for integrity validation
  checksum: string;
}

// ============= Default State Factory =============

/**
 * Create a fresh default persisted state with current timestamps
 */
export function createDefaultPersistedState(): PersistedState {
  const now = Date.now();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    breakerState: 'closed',
    lastTransitionTimestamp: now,
    reflexCooldownRemaining: 0,
    lastReflexTripTimestamp: null,
    confidenceHistory: [],
    lastIncidentId: null,
    interventionCount: 0,
    totalRefusals: 0,
    persistedAt: now,
    checksum: ''
  };
}

// Legacy constant for backward compatibility (use factory function instead)
export const DEFAULT_PERSISTED_STATE: PersistedState = createDefaultPersistedState();

// ============= Safe Boot State Factory =============

/**
 * Safe boot state when previous state was OPEN or HALF_OPEN
 * or when state file is corrupt/missing
 * 
 * PRINCIPLE: Never auto-restore CLOSED without evidence
 */
export function createSafeBootState(): PersistedState {
  const now = Date.now();
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    breakerState: 'open',  // Conservative: start in degraded mode
    lastTransitionTimestamp: now,
    reflexCooldownRemaining: 0,
    lastReflexTripTimestamp: null,
    confidenceHistory: [],
    lastIncidentId: null,
    interventionCount: 0,
    totalRefusals: 0,
    persistedAt: now,
    checksum: ''
  };
}

// Legacy constant for backward compatibility (use factory function instead)
export const SAFE_BOOT_STATE: PersistedState = createSafeBootState();

// ============= Hardware Fingerprint Functions =============

/**
 * Collect current hardware fingerprint from the system
 * This is minimal and focuses on memory (the primary "hardware lottery" concern)
 */
export function collectHardwareFingerprint(): HardwareFingerprint {
  const fingerprint: HardwareFingerprint = {
    totalSystemMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    cpuCores: os.cpus().length
  };
  
  // Try to detect container memory limit via cgroup
  // This is a best-effort attempt - may not work in all environments
  const containerLimit = detectContainerMemoryLimit();
  if (containerLimit !== null) {
    fingerprint.containerMemoryLimitMb = containerLimit;
  }
  
  return fingerprint;
}

/**
 * Detect container memory limit from cgroup (Linux containers)
 * Returns null if not in a container or unable to detect
 */
function detectContainerMemoryLimit(): number | null {
  // Check for MEMORY_LIMIT env var (commonly set in containers)
  const envLimit = process.env.MEMORY_LIMIT;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  // Try to read cgroup v2 memory limit
  try {
    const cgroupPath = '/sys/fs/cgroup/memory.max';
    if (fs.existsSync(cgroupPath)) {
      const content = fs.readFileSync(cgroupPath, 'utf-8').trim();
      if (content !== 'max') {
        const bytes = parseInt(content, 10);
        if (!isNaN(bytes)) {
          return Math.round(bytes / (1024 * 1024));
        }
      }
    }
  } catch {
    // Ignore - not in container or no access
  }
  
  // Try cgroup v1 memory limit
  try {
    const cgroupV1Path = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
    if (fs.existsSync(cgroupV1Path)) {
      const content = fs.readFileSync(cgroupV1Path, 'utf-8').trim();
      const bytes = parseInt(content, 10);
      // Skip if it's the max value (no limit set)
      if (!isNaN(bytes) && bytes < os.totalmem() * 2) {
        return Math.round(bytes / (1024 * 1024));
      }
    }
  } catch {
    // Ignore - not in container or no access
  }
  
  return null;
}

/**
 * Compare two hardware fingerprints and determine if they match within tolerance
 * Returns a result indicating match status and reasons for any mismatch
 */
export interface FingerprintComparisonResult {
  matches: boolean;
  reasons: string[];
  memoryDifference?: number;  // Percentage difference in memory
  coresDifference?: number;   // Absolute difference in CPU cores
}

export function compareHardwareFingerprints(
  saved: HardwareFingerprint,
  current: HardwareFingerprint,
  tolerance: HardwareFingerprintTolerance = DEFAULT_FINGERPRINT_TOLERANCE
): FingerprintComparisonResult {
  const reasons: string[] = [];
  let matches = true;
  
  // Compare system memory (required check)
  const memoryDiff = Math.abs(current.totalSystemMemoryMb - saved.totalSystemMemoryMb) / saved.totalSystemMemoryMb;
  const memoryDifferencePercent = memoryDiff * 100;
  
  if (memoryDiff > tolerance.memoryToleranceFraction) {
    matches = false;
    reasons.push(
      `Memory changed from ${saved.totalSystemMemoryMb}MB to ${current.totalSystemMemoryMb}MB ` +
      `(${memoryDifferencePercent.toFixed(1)}% difference exceeds ${tolerance.memoryToleranceFraction * 100}% tolerance)`
    );
  }
  
  // Compare CPU cores (optional check - only if both have values)
  let coresDiff: number | undefined;
  if (saved.cpuCores !== undefined && current.cpuCores !== undefined) {
    coresDiff = Math.abs(current.cpuCores - saved.cpuCores);
    if (coresDiff > tolerance.cpuCoresTolerance) {
      matches = false;
      reasons.push(
        `CPU cores changed from ${saved.cpuCores} to ${current.cpuCores} ` +
        `(${coresDiff} difference exceeds ${tolerance.cpuCoresTolerance} tolerance)`
      );
    }
  }
  
  // Compare container memory limit if available
  if (saved.containerMemoryLimitMb !== undefined && current.containerMemoryLimitMb !== undefined) {
    const containerMemDiff = Math.abs(current.containerMemoryLimitMb - saved.containerMemoryLimitMb) / saved.containerMemoryLimitMb;
    if (containerMemDiff > tolerance.memoryToleranceFraction) {
      matches = false;
      reasons.push(
        `Container memory limit changed from ${saved.containerMemoryLimitMb}MB to ${current.containerMemoryLimitMb}MB ` +
        `(${(containerMemDiff * 100).toFixed(1)}% difference exceeds tolerance)`
      );
    }
  }
  
  return {
    matches,
    reasons,
    memoryDifference: memoryDifferencePercent,
    coresDifference: coresDiff
  };
}

// ============= State Persistence Configuration =============

export interface StatePersistenceConfig {
  // File path for state persistence
  stateFilePath: string;
  
  // Maximum confidence history entries to persist
  maxConfidenceHistorySize: number;
  
  // Maximum age (ms) before state is considered stale
  staleStateThresholdMs: number;
  
  // Enable automatic persistence on state changes
  autoPersist: boolean;
  
  // Persistence interval (ms) for periodic saves
  persistIntervalMs: number;
  
  // Hardware fingerprint tolerance (v2.0.0+)
  fingerprintTolerance: HardwareFingerprintTolerance;
}

export const DEFAULT_PERSISTENCE_CONFIG: StatePersistenceConfig = {
  stateFilePath: 'interlock_state.json',
  maxConfidenceHistorySize: 50,
  staleStateThresholdMs: 24 * 60 * 60 * 1000,  // 24 hours
  autoPersist: true,
  persistIntervalMs: 60000,  // 1 minute
  fingerprintTolerance: DEFAULT_FINGERPRINT_TOLERANCE
};

// ============= Checksum Calculation =============

/**
 * Calculate a simple checksum for state integrity validation
 * Uses a hash of the critical state fields
 */
function calculateChecksum(state: Omit<PersistedState, 'checksum'>): string {
  const data = JSON.stringify({
    schemaVersion: state.schemaVersion,
    breakerState: state.breakerState,
    lastTransitionTimestamp: state.lastTransitionTimestamp,
    reflexCooldownRemaining: state.reflexCooldownRemaining,
    confidenceHistoryLength: state.confidenceHistory.length,
    interventionCount: state.interventionCount,
    persistedAt: state.persistedAt
  });
  
  // Simple hash function (non-cryptographic, just for integrity)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;  // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ============= State Validation =============

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  safeBootRequired: boolean;
}

/**
 * Validate persisted state for correctness and safety
 */
export function validatePersistedState(state: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let safeBootRequired = false;
  
  // Check if state is an object
  if (!state || typeof state !== 'object') {
    return {
      valid: false,
      errors: ['State is not an object'],
      warnings: [],
      safeBootRequired: true
    };
  }
  
  const s = state as Record<string, unknown>;
  
  // Check schema version
  if (typeof s.schemaVersion !== 'string') {
    errors.push('Missing or invalid schemaVersion');
    safeBootRequired = true;
  } else if (s.schemaVersion !== STATE_SCHEMA_VERSION) {
    warnings.push(`Schema version mismatch: expected ${STATE_SCHEMA_VERSION}, got ${s.schemaVersion}`);
    // Future: add migration logic here
  }
  
  // Validate breaker state
  if (!['closed', 'open', 'half_open'].includes(s.breakerState as string)) {
    errors.push(`Invalid breakerState: ${s.breakerState}`);
    safeBootRequired = true;
  }
  
  // Validate timestamps
  if (typeof s.lastTransitionTimestamp !== 'number' || s.lastTransitionTimestamp <= 0) {
    errors.push('Invalid lastTransitionTimestamp');
    safeBootRequired = true;
  }
  
  if (typeof s.persistedAt !== 'number' || s.persistedAt <= 0) {
    errors.push('Invalid persistedAt timestamp');
    safeBootRequired = true;
  }
  
  // Validate reflex cooldown
  if (typeof s.reflexCooldownRemaining !== 'number' || s.reflexCooldownRemaining < 0) {
    warnings.push('Invalid reflexCooldownRemaining, will be reset to 0');
  }
  
  // Validate confidence history
  if (!Array.isArray(s.confidenceHistory)) {
    warnings.push('Invalid confidenceHistory, will be reset to empty array');
  } else {
    const validHistory = s.confidenceHistory.every(
      (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1
    );
    if (!validHistory) {
      warnings.push('Some confidence history values are invalid');
    }
  }
  
  // Validate checksum
  if (typeof s.checksum === 'string' && s.checksum.length > 0) {
    const stateWithoutChecksum = { ...s };
    delete stateWithoutChecksum.checksum;
    const expectedChecksum = calculateChecksum(stateWithoutChecksum as Omit<PersistedState, 'checksum'>);
    if (s.checksum !== expectedChecksum) {
      errors.push('Checksum validation failed - state may be corrupted');
      safeBootRequired = true;
    }
  }
  
  // Check for previous unsafe state (requires safe boot)
  if (s.breakerState === 'open' || s.breakerState === 'half_open') {
    safeBootRequired = true;
    warnings.push(`Previous state was ${s.breakerState} - safe boot required`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    safeBootRequired
  };
}

// ============= State Persistence Manager =============

export class StatePersistenceManager {
  private config: StatePersistenceConfig;
  private currentState: PersistedState;
  private persistInterval: ReturnType<typeof setInterval> | null = null;
  private bootState: 'normal' | 'safe_boot' | 'corrupt_recovery' | 'hardware_mismatch' = 'normal';
  private loadErrors: string[] = [];
  private hardwareMismatchReasons: string[] = [];
  private currentHardwareFingerprint: HardwareFingerprint;

  constructor(config: Partial<StatePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.currentState = { ...DEFAULT_PERSISTED_STATE };
    this.currentHardwareFingerprint = collectHardwareFingerprint();
  }

  /**
   * Initialize the persistence manager
   * Loads state from disk if available, applies safe boot rules
   * Now includes hardware fingerprint validation (v2.0.0+)
   */
  public initialize(): { state: PersistedState; bootState: string; warnings: string[] } {
    const warnings: string[] = [];
    
    // Try to load existing state
    const loadResult = this.loadState();
    
    if (!loadResult.success) {
      // State file doesn't exist or is corrupt
      this.bootState = loadResult.corrupt ? 'corrupt_recovery' : 'normal';
      this.loadErrors = loadResult.errors;
      
      if (loadResult.corrupt) {
        warnings.push('State file corrupt - entering safe boot (OPEN state)');
        this.currentState = { ...SAFE_BOOT_STATE, persistedAt: Date.now() };
      } else {
        // First boot - start with clean state and store hardware fingerprint
        this.currentState = { 
          ...DEFAULT_PERSISTED_STATE, 
          persistedAt: Date.now(),
          hardwareFingerprint: this.currentHardwareFingerprint
        };
      }
    } else if (loadResult.state) {
      const validation = validatePersistedState(loadResult.state);
      this.loadErrors = validation.errors;
      warnings.push(...validation.warnings);
      
      // Check hardware fingerprint (v2.0.0+ feature)
      let hardwareMismatch = false;
      if (loadResult.state.hardwareFingerprint) {
        const comparison = compareHardwareFingerprints(
          loadResult.state.hardwareFingerprint,
          this.currentHardwareFingerprint,
          this.config.fingerprintTolerance
        );
        
        if (!comparison.matches) {
          hardwareMismatch = true;
          this.hardwareMismatchReasons = comparison.reasons;
          // Single low-frequency log explaining invalidation
          warnings.push(
            `HARDWARE MISMATCH: Cached safety envelope invalidated. ${comparison.reasons.join('; ')}. ` +
            `Entering conservative mode to prevent "hardware lottery" failure.`
          );
        }
      }
      
      if (validation.safeBootRequired || hardwareMismatch) {
        this.bootState = hardwareMismatch ? 'hardware_mismatch' : 'safe_boot';
        
        // Preserve some state but enter OPEN mode
        // For hardware mismatch, we invalidate learned thresholds by starting fresh
        this.currentState = {
          ...loadResult.state,
          breakerState: 'open',  // Never auto-restore CLOSED
          lastTransitionTimestamp: Date.now(),
          persistedAt: Date.now(),
          hardwareFingerprint: this.currentHardwareFingerprint,  // Update to current hardware
          // For hardware mismatch, reset confidence history (learned on different hardware)
          confidenceHistory: hardwareMismatch ? [] : loadResult.state.confidenceHistory
        };
        
        // Recalculate remaining cooldown
        if (loadResult.state.lastReflexTripTimestamp && loadResult.state.reflexCooldownRemaining > 0) {
          const elapsed = Date.now() - loadResult.state.persistedAt;
          this.currentState.reflexCooldownRemaining = Math.max(0, 
            loadResult.state.reflexCooldownRemaining - elapsed);
        }
        
        if (!hardwareMismatch) {
          warnings.push('Safe boot activated - starting in OPEN state');
        }
      } else {
        this.bootState = 'normal';
        this.currentState = loadResult.state;
        // Update fingerprint if it was missing (migration from v1.x)
        if (!this.currentState.hardwareFingerprint) {
          this.currentState.hardwareFingerprint = this.currentHardwareFingerprint;
        }
      }
    }
    
    // Update checksum
    this.currentState.checksum = calculateChecksum(this.currentState);
    
    // Start periodic persistence if enabled
    if (this.config.autoPersist && this.config.persistIntervalMs > 0) {
      this.startPeriodicPersistence();
    }
    
    return {
      state: { ...this.currentState },
      bootState: this.bootState,
      warnings
    };
  }

  /**
   * Load state from disk
   */
  private loadState(): { 
    success: boolean; 
    state?: PersistedState; 
    corrupt: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    try {
      if (!fs.existsSync(this.config.stateFilePath)) {
        return { success: false, corrupt: false, errors: ['State file does not exist'] };
      }
      
      const content = fs.readFileSync(this.config.stateFilePath, 'utf-8');
      
      if (!content || content.trim() === '') {
        errors.push('State file is empty');
        return { success: false, corrupt: true, errors };
      }
      
      const state = JSON.parse(content) as PersistedState;
      
      // Check for staleness
      const age = Date.now() - state.persistedAt;
      if (age > this.config.staleStateThresholdMs) {
        errors.push(`State file is stale (${(age / 1000 / 60 / 60).toFixed(1)} hours old)`);
        return { success: false, corrupt: false, errors };
      }
      
      return { success: true, state, corrupt: false, errors };
    } catch (error) {
      errors.push(`Failed to load state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, corrupt: true, errors };
    }
  }

  /**
   * Save current state to disk
   */
  public saveState(): { success: boolean; error?: string } {
    try {
      // Update persistence timestamp
      this.currentState.persistedAt = Date.now();
      
      // Trim confidence history if needed
      if (this.currentState.confidenceHistory.length > this.config.maxConfidenceHistorySize) {
        this.currentState.confidenceHistory = this.currentState.confidenceHistory.slice(
          -this.config.maxConfidenceHistorySize
        );
      }
      
      // Calculate checksum
      this.currentState.checksum = calculateChecksum(this.currentState);
      
      // Ensure directory exists
      const dir = path.dirname(this.config.stateFilePath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write atomically using temp file + rename
      const tempPath = `${this.config.stateFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.currentState, null, 2));
      fs.renameSync(tempPath, this.config.stateFilePath);
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Update breaker state
   */
  public updateBreakerState(state: CircuitState, trigger?: string): void {
    if (this.currentState.breakerState !== state) {
      this.currentState.breakerState = state;
      this.currentState.lastTransitionTimestamp = Date.now();
      
      if (this.config.autoPersist) {
        this.saveState();
      }
    }
  }

  /**
   * Update reflex cooldown
   */
  public updateReflexCooldown(remainingMs: number, lastTripTimestamp?: number): void {
    this.currentState.reflexCooldownRemaining = remainingMs;
    if (lastTripTimestamp !== undefined) {
      this.currentState.lastReflexTripTimestamp = lastTripTimestamp;
    }
    
    if (this.config.autoPersist && remainingMs > 0) {
      this.saveState();
    }
  }

  /**
   * Update confidence history
   */
  public updateConfidenceHistory(confidence: number): void {
    this.currentState.confidenceHistory.push(confidence);
    
    // Trim if over max size
    if (this.currentState.confidenceHistory.length > this.config.maxConfidenceHistorySize) {
      this.currentState.confidenceHistory = this.currentState.confidenceHistory.slice(
        -this.config.maxConfidenceHistorySize
      );
    }
  }

  /**
   * Record an incident
   */
  public recordIncident(incidentId: string): void {
    this.currentState.lastIncidentId = incidentId;
    this.currentState.interventionCount++;
    
    if (this.config.autoPersist) {
      this.saveState();
    }
  }

  /**
   * Record a quality floor refusal
   */
  public recordRefusal(): void {
    this.currentState.totalRefusals++;
  }

  /**
   * Get current persisted state
   */
  public getState(): PersistedState {
    return { ...this.currentState };
  }

  /**
   * Get boot state information
   */
  public getBootInfo(): { 
    bootState: string; 
    loadErrors: string[];
    isSafeBoot: boolean;
    hardwareMismatch: boolean;
    hardwareMismatchReasons: string[];
  } {
    return {
      bootState: this.bootState,
      loadErrors: this.loadErrors,
      isSafeBoot: this.bootState === 'safe_boot' || this.bootState === 'corrupt_recovery' || this.bootState === 'hardware_mismatch',
      hardwareMismatch: this.bootState === 'hardware_mismatch',
      hardwareMismatchReasons: this.hardwareMismatchReasons
    };
  }

  /**
   * Check if system is in safe boot mode
   */
  public isSafeBoot(): boolean {
    return this.bootState === 'safe_boot' || this.bootState === 'corrupt_recovery' || this.bootState === 'hardware_mismatch';
  }

  /**
   * Check if system entered safe boot due to hardware mismatch
   */
  public isHardwareMismatch(): boolean {
    return this.bootState === 'hardware_mismatch';
  }

  /**
   * Get current hardware fingerprint
   */
  public getHardwareFingerprint(): HardwareFingerprint {
    return { ...this.currentHardwareFingerprint };
  }

  /**
   * Get hardware mismatch reasons (if any)
   */
  public getHardwareMismatchReasons(): string[] {
    return [...this.hardwareMismatchReasons];
  }

  /**
   * Start periodic persistence
   */
  private startPeriodicPersistence(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
    }
    
    this.persistInterval = setInterval(() => {
      this.saveState();
    }, this.config.persistIntervalMs);
  }

  /**
   * Stop periodic persistence
   */
  public stopPeriodicPersistence(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }
  }

  /**
   * Delete state file (for testing)
   */
  public deleteStateFile(): boolean {
    try {
      if (fs.existsSync(this.config.stateFilePath)) {
        fs.unlinkSync(this.config.stateFilePath);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Force state to a specific value (for testing)
   */
  public forceState(state: Partial<PersistedState>): void {
    this.currentState = {
      ...this.currentState,
      ...state,
      persistedAt: Date.now()
    };
    this.currentState.checksum = calculateChecksum(this.currentState);
  }
}

// ============= Factory Function =============

/**
 * Create and initialize a state persistence manager
 */
export function createStatePersistenceManager(
  config?: Partial<StatePersistenceConfig>
): { manager: StatePersistenceManager; bootInfo: ReturnType<StatePersistenceManager['initialize']> } {
  const manager = new StatePersistenceManager(config);
  const bootInfo = manager.initialize();
  return { manager, bootInfo };
}

// ============= Exports =============

export default StatePersistenceManager;
