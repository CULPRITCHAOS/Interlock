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
 * 
 * Guiding Principle:
 * Interlock prefers caution over optimism after restart.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CircuitState } from './phaseIV.types';

// ============= Schema Version =============

export const STATE_SCHEMA_VERSION = '1.0.0';

// ============= Persisted State Types =============

/**
 * Persisted state schema
 * Contains all safety-critical state that must survive restarts
 */
export interface PersistedState {
  // Schema version for forward compatibility
  schemaVersion: string;
  
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
}

export const DEFAULT_PERSISTENCE_CONFIG: StatePersistenceConfig = {
  stateFilePath: 'interlock_state.json',
  maxConfidenceHistorySize: 50,
  staleStateThresholdMs: 24 * 60 * 60 * 1000,  // 24 hours
  autoPersist: true,
  persistIntervalMs: 60000  // 1 minute
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
  private bootState: 'normal' | 'safe_boot' | 'corrupt_recovery' = 'normal';
  private loadErrors: string[] = [];

  constructor(config: Partial<StatePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.currentState = { ...DEFAULT_PERSISTED_STATE };
  }

  /**
   * Initialize the persistence manager
   * Loads state from disk if available, applies safe boot rules
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
        // First boot - start with clean state
        this.currentState = { ...DEFAULT_PERSISTED_STATE, persistedAt: Date.now() };
      }
    } else if (loadResult.state) {
      const validation = validatePersistedState(loadResult.state);
      this.loadErrors = validation.errors;
      warnings.push(...validation.warnings);
      
      if (validation.safeBootRequired) {
        this.bootState = 'safe_boot';
        
        // Preserve some state but enter OPEN mode
        this.currentState = {
          ...loadResult.state,
          breakerState: 'open',  // Never auto-restore CLOSED
          lastTransitionTimestamp: Date.now(),
          persistedAt: Date.now()
        };
        
        // Recalculate remaining cooldown
        if (loadResult.state.lastReflexTripTimestamp && loadResult.state.reflexCooldownRemaining > 0) {
          const elapsed = Date.now() - loadResult.state.persistedAt;
          this.currentState.reflexCooldownRemaining = Math.max(0, 
            loadResult.state.reflexCooldownRemaining - elapsed);
        }
        
        warnings.push('Safe boot activated - starting in OPEN state');
      } else {
        this.bootState = 'normal';
        this.currentState = loadResult.state;
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
  } {
    return {
      bootState: this.bootState,
      loadErrors: this.loadErrors,
      isSafeBoot: this.bootState === 'safe_boot' || this.bootState === 'corrupt_recovery'
    };
  }

  /**
   * Check if system is in safe boot mode
   */
  public isSafeBoot(): boolean {
    return this.bootState === 'safe_boot' || this.bootState === 'corrupt_recovery';
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
