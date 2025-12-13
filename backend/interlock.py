"""
Interlock Phase II: One-Line Protection Interface
==================================================
Deployable protection with a single decorator.

Usage:
    from interlock import protect
    
    @protect(
        domain="faiss",
        memory_limit="8GB",
        failover={"nprobe": 8}
    )
    def search_vectors(query):
        return index.search(query)

Behavior:
    - Pre-call: Check forecast risk
    - On hazard: Apply failover strategy, log intervention
    - Post-call: Record outcome for calibration

Guiding Principle:
    Interlock does not optimize systems. It prevents them from breaking.
"""

import functools
import logging
import time
import threading
from typing import Any, Callable, Dict, Optional, Union
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("interlock.protect")


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Degraded mode active
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class ProtectionConfig:
    """Configuration for the @protect decorator."""
    domain: str = "faiss"
    memory_limit: str = "8GB"
    failover: Dict[str, Any] = field(default_factory=lambda: {"nprobe": 8})
    recall_threshold: float = 0.7
    latency_threshold_ms: float = 50.0
    hazard_threshold: float = 0.6
    recovery_check_interval_s: float = 30.0
    consecutive_successes_for_close: int = 3
    # Shadow Mode (Trust Acquisition) - logs decisions without interfering
    dry_run: bool = False


@dataclass
class ShadowBlock:
    """Record of what WOULD have happened in shadow/dry-run mode."""
    timestamp: float
    function_name: str
    would_have_transitioned: bool
    from_state: str
    to_state: str
    trigger: str
    reason: str  # Human-readable explanation
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "function_name": self.function_name,
            "would_have_transitioned": self.would_have_transitioned,
            "from_state": self.from_state,
            "to_state": self.to_state,
            "trigger": self.trigger,
            "reason": self.reason
        }


@dataclass
class Intervention:
    """Record of a protection intervention."""
    timestamp: float
    function_name: str
    previous_state: str
    new_state: str
    trigger: str
    failover_applied: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "function_name": self.function_name,
            "previous_state": self.previous_state,
            "new_state": self.new_state,
            "trigger": self.trigger,
            "failover_applied": self.failover_applied
        }


@dataclass
class CalibrationOutcome:
    """Outcome recorded for calibration."""
    timestamp: float
    function_name: str
    predicted_risk: str
    actual_success: bool
    latency_ms: float
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "function_name": self.function_name,
            "predicted_risk": self.predicted_risk,
            "actual_success": self.actual_success,
            "latency_ms": self.latency_ms,
            "error": self.error
        }


class InterlockProtector:
    """
    Core protection engine for the @protect decorator.
    
    Manages:
    - Circuit breaker state
    - Hazard forecasting
    - Failover application
    - Intervention logging
    - Calibration data collection
    - Shadow mode (dry run) for trust acquisition
    """
    
    _instances: Dict[str, 'InterlockProtector'] = {}
    _lock = threading.Lock()
    
    def __init__(self, config: ProtectionConfig):
        self.config = config
        self.state = CircuitState.CLOSED
        self.consecutive_successes = 0
        self.consecutive_failures = 0
        self.last_state_change = time.time()
        
        # Metrics tracking
        self.recent_latencies: list = []
        self.recent_successes: list = []
        self.metrics_window = 10
        
        # Logging
        self.interventions: list = []
        self.calibration_outcomes: list = []
        
        # Shadow Mode (Trust Acquisition)
        self.shadow_blocks: list = []  # Records of what WOULD have happened
        
        mode_str = "SHADOW MODE (dry run)" if config.dry_run else "ACTIVE MODE"
        logger.info(f"Initialized InterlockProtector for domain={config.domain} [{mode_str}]")
    
    @classmethod
    def get_instance(cls, key: str, config: ProtectionConfig) -> 'InterlockProtector':
        """Get or create a protector instance for the given key."""
        with cls._lock:
            if key not in cls._instances:
                cls._instances[key] = cls(config)
            return cls._instances[key]
    
    def calculate_hazard_score(self) -> float:
        """
        Calculate current hazard score based on recent metrics.
        
        Returns a value from 0 to 1 where higher = more dangerous.
        """
        if len(self.recent_latencies) < 2:
            return 0.0
        
        # Latency-based hazard
        avg_latency = sum(self.recent_latencies[-5:]) / min(5, len(self.recent_latencies))
        latency_margin = self.config.latency_threshold_ms - avg_latency
        latency_hazard = max(0, 1 - (latency_margin / 20))
        
        # Success-rate based hazard
        recent_success_rate = sum(1 for s in self.recent_successes[-5:] if s) / min(5, len(self.recent_successes)) if self.recent_successes else 1.0
        success_hazard = max(0, 1 - recent_success_rate)
        
        # Combined hazard (weighted)
        hazard = 0.6 * latency_hazard + 0.4 * success_hazard
        return min(1.0, hazard)
    
    def predict_risk_level(self) -> str:
        """Predict risk level: safe, yellow, or red."""
        hazard = self.calculate_hazard_score()
        
        if hazard >= 0.8:
            return "red"
        elif hazard >= self.config.hazard_threshold:
            return "yellow"
        else:
            return "safe"
    
    def check_pre_call(self, func_name: str) -> tuple:
        """
        Pre-call check: Assess risk and determine if failover is needed.
        
        In Shadow Mode (dry_run=True): Calculates hazards and logs "virtual"
        interventions as Shadow Blocks, but does NOT apply failover.
        
        Returns:
            (should_apply_failover, risk_level, shadow_block)
        """
        risk_level = self.predict_risk_level()
        hazard = self.calculate_hazard_score()
        
        should_failover = False
        shadow_block = None
        
        # ============= SHADOW MODE: Log but don't intervene =============
        if self.config.dry_run:
            # In shadow mode, calculate what WOULD happen but don't actually do it
            if self.state == CircuitState.CLOSED:
                if hazard >= self.config.hazard_threshold:
                    shadow_block = ShadowBlock(
                        timestamp=time.time(),
                        function_name=func_name,
                        would_have_transitioned=True,
                        from_state=self.state.value,
                        to_state=CircuitState.OPEN.value,
                        trigger=f"Hazard {hazard:.3f} exceeded threshold {self.config.hazard_threshold}",
                        reason=f"SHADOW BLOCK: Would have entered OPEN state. "
                               f"In production mode, failover would be applied."
                    )
                    self.shadow_blocks.append(shadow_block)
                    logger.info(f"SHADOW BLOCK: {func_name} - Would have triggered failover "
                               f"(hazard={hazard:.3f})")
                elif self.consecutive_failures >= 3:
                    shadow_block = ShadowBlock(
                        timestamp=time.time(),
                        function_name=func_name,
                        would_have_transitioned=True,
                        from_state=self.state.value,
                        to_state=CircuitState.OPEN.value,
                        trigger=f"Consecutive failures: {self.consecutive_failures}",
                        reason=f"SHADOW BLOCK: Would have entered OPEN state due to failures. "
                               f"In production mode, failover would be applied."
                    )
                    self.shadow_blocks.append(shadow_block)
                    logger.info(f"SHADOW BLOCK: {func_name} - Would have triggered failover "
                               f"(consecutive failures={self.consecutive_failures})")
            
            # In shadow mode, never apply failover
            return False, risk_level, shadow_block
        
        # ============= ACTIVE MODE: Actually intervene =============
        if self.state == CircuitState.CLOSED:
            if hazard >= self.config.hazard_threshold:
                # Transition to OPEN
                self._transition_state(
                    CircuitState.OPEN,
                    f"Hazard {hazard:.3f} exceeded threshold {self.config.hazard_threshold}",
                    func_name
                )
                should_failover = True
            elif self.consecutive_failures >= 3:
                self._transition_state(
                    CircuitState.OPEN,
                    f"Consecutive failures: {self.consecutive_failures}",
                    func_name
                )
                should_failover = True
        
        elif self.state == CircuitState.OPEN:
            should_failover = True
            
            # Check for recovery opportunity
            time_since_change = time.time() - self.last_state_change
            if time_since_change >= self.config.recovery_check_interval_s:
                if hazard < self.config.hazard_threshold * 0.7:
                    self._transition_state(
                        CircuitState.HALF_OPEN,
                        f"Hazard reduced to {hazard:.3f}, testing recovery",
                        func_name
                    )
        
        elif self.state == CircuitState.HALF_OPEN:
            # Continue with normal settings to test recovery
            should_failover = False
        
        return should_failover, risk_level, shadow_block
    
    def record_post_call(
        self, 
        func_name: str, 
        success: bool, 
        latency_ms: float, 
        error: Optional[str] = None
    ) -> None:
        """
        Post-call: Record outcome for calibration and update state.
        """
        # Track metrics
        self.recent_latencies.append(latency_ms)
        self.recent_successes.append(success)
        
        if len(self.recent_latencies) > self.metrics_window:
            self.recent_latencies = self.recent_latencies[-self.metrics_window:]
            self.recent_successes = self.recent_successes[-self.metrics_window:]
        
        # Record calibration outcome
        outcome = CalibrationOutcome(
            timestamp=time.time(),
            function_name=func_name,
            predicted_risk=self.predict_risk_level(),
            actual_success=success,
            latency_ms=latency_ms,
            error=error
        )
        self.calibration_outcomes.append(outcome)
        
        # Update state based on outcome
        if self.state == CircuitState.HALF_OPEN:
            if success:
                self.consecutive_successes += 1
                self.consecutive_failures = 0
                
                if self.consecutive_successes >= self.config.consecutive_successes_for_close:
                    self._transition_state(
                        CircuitState.CLOSED,
                        f"Recovery successful after {self.consecutive_successes} successes",
                        func_name
                    )
            else:
                self._transition_state(
                    CircuitState.OPEN,
                    "Recovery failed",
                    func_name
                )
                self.consecutive_failures = 0
        else:
            if success:
                self.consecutive_successes += 1
                self.consecutive_failures = 0
            else:
                self.consecutive_failures += 1
                self.consecutive_successes = 0
    
    def _transition_state(self, new_state: CircuitState, trigger: str, func_name: str) -> None:
        """Transition to a new state and log intervention."""
        previous_state = self.state
        self.state = new_state
        self.last_state_change = time.time()
        self.consecutive_successes = 0
        self.consecutive_failures = 0
        
        intervention = Intervention(
            timestamp=time.time(),
            function_name=func_name,
            previous_state=previous_state.value,
            new_state=new_state.value,
            trigger=trigger,
            failover_applied=self.config.failover if new_state == CircuitState.OPEN else {}
        )
        self.interventions.append(intervention)
        
        logger.warning(
            f"INTERLOCK INTERVENTION: {previous_state.value} -> {new_state.value} | "
            f"Function: {func_name} | Trigger: {trigger}"
        )
    
    def get_state(self) -> Dict[str, Any]:
        """Get current protection state."""
        return {
            "state": self.state.value,
            "hazard_score": self.calculate_hazard_score(),
            "consecutive_successes": self.consecutive_successes,
            "consecutive_failures": self.consecutive_failures,
            "total_interventions": len(self.interventions),
            "total_outcomes": len(self.calibration_outcomes),
            # Shadow Mode info
            "dry_run": self.config.dry_run,
            "total_shadow_blocks": len(self.shadow_blocks)
        }
    
    def get_interventions(self) -> list:
        """Get list of all interventions."""
        return [i.to_dict() for i in self.interventions]
    
    def get_calibration_outcomes(self) -> list:
        """Get list of all calibration outcomes."""
        return [o.to_dict() for o in self.calibration_outcomes]
    
    def get_shadow_blocks(self) -> list:
        """Get list of all shadow blocks (what WOULD have happened in dry_run mode)."""
        return [s.to_dict() for s in self.shadow_blocks]
    
    def is_dry_run(self) -> bool:
        """Check if running in shadow/dry-run mode."""
        return self.config.dry_run


def protect(
    domain: str = "faiss",
    memory_limit: str = "8GB",
    failover: Optional[Dict[str, Any]] = None,
    recall_threshold: float = 0.7,
    latency_threshold_ms: float = 50.0,
    hazard_threshold: float = 0.6,
    dry_run: bool = False
) -> Callable:
    """
    One-line protection decorator for functions.
    
    Usage:
        @interlock.protect(
            domain="faiss",
            memory_limit="8GB",
            failover={"nprobe": 8}
        )
        def search_vectors(query):
            return index.search(query)
        
        # Shadow Mode (Trust Acquisition) - audit decisions before giving control
        @interlock.protect(
            domain="faiss",
            dry_run=True  # Log "I WOULD have..." without touching traffic
        )
        def search_vectors(query):
            return index.search(query)
    
    Behavior:
        - Pre-call: Check forecast risk
        - On hazard: Apply failover strategy, log intervention
        - Post-call: Record outcome for calibration
        
        In Shadow Mode (dry_run=True):
        - Pre-call: Check forecast risk, log as Shadow Block
        - On hazard: DO NOT apply failover, just log
        - Post-call: Record outcome for calibration
    
    Args:
        domain: The domain for this protection (e.g., "faiss", "postgres")
        memory_limit: Memory limit string (e.g., "8GB")
        failover: Dict of failover parameters to apply when hazard detected
        recall_threshold: Minimum acceptable recall (0-1)
        latency_threshold_ms: Maximum acceptable latency in milliseconds
        hazard_threshold: Hazard score threshold to trigger failover (0-1)
        dry_run: If True, log decisions but don't interfere with traffic (Shadow Mode)
    
    Returns:
        Decorated function with automatic protection
    """
    if failover is None:
        failover = {"nprobe": 8}
    
    config = ProtectionConfig(
        domain=domain,
        memory_limit=memory_limit,
        failover=failover,
        recall_threshold=recall_threshold,
        latency_threshold_ms=latency_threshold_ms,
        hazard_threshold=hazard_threshold,
        dry_run=dry_run
    )
    
    def decorator(func: Callable) -> Callable:
        # Get or create protector instance
        key = f"{domain}:{func.__name__}"
        protector = InterlockProtector.get_instance(key, config)
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            func_name = func.__name__
            
            # PRE-CALL: Check forecast risk
            should_failover, risk_level, shadow_block = protector.check_pre_call(func_name)
            
            # Apply failover if needed (NOT in dry_run mode)
            original_kwargs = kwargs.copy()
            if should_failover and not config.dry_run:
                kwargs.update(config.failover)
                logger.info(f"Applying failover for {func_name}: {config.failover}")
            
            # CALL: Execute the function
            start_time = time.perf_counter()
            error = None
            success = True
            result = None
            
            try:
                result = func(*args, **kwargs)
            except Exception as e:
                error = str(e)
                success = False
                raise
            finally:
                # POST-CALL: Record outcome for calibration
                latency_ms = (time.perf_counter() - start_time) * 1000
                protector.record_post_call(func_name, success, latency_ms, error)
            
            return result
        
        # Attach protector reference for inspection
        wrapper._interlock_protector = protector
        wrapper._interlock_config = config
        
        return wrapper
    
    return decorator


def get_protection_status(func: Callable) -> Optional[Dict[str, Any]]:
    """
    Get the protection status of a decorated function.
    
    Args:
        func: The decorated function
    
    Returns:
        Dict with protection status or None if not protected
    """
    protector = getattr(func, '_interlock_protector', None)
    if protector is None:
        return None
    return protector.get_state()


def get_interventions(func: Callable) -> list:
    """
    Get list of interventions for a decorated function.
    
    Args:
        func: The decorated function
    
    Returns:
        List of intervention dicts
    """
    protector = getattr(func, '_interlock_protector', None)
    if protector is None:
        return []
    return protector.get_interventions()


def get_calibration_outcomes(func: Callable) -> list:
    """
    Get list of calibration outcomes for a decorated function.
    
    Args:
        func: The decorated function
    
    Returns:
        List of outcome dicts
    """
    protector = getattr(func, '_interlock_protector', None)
    if protector is None:
        return []
    return protector.get_calibration_outcomes()


def get_shadow_blocks(func: Callable) -> list:
    """
    Get list of shadow blocks (what WOULD have happened) for a decorated function.
    
    Shadow blocks are only recorded when dry_run=True (Shadow Mode).
    
    Args:
        func: The decorated function
    
    Returns:
        List of shadow block dicts
    """
    protector = getattr(func, '_interlock_protector', None)
    if protector is None:
        return []
    return protector.get_shadow_blocks()


def is_dry_run(func: Callable) -> bool:
    """
    Check if a decorated function is in shadow/dry-run mode.
    
    Args:
        func: The decorated function
    
    Returns:
        True if in dry_run mode, False otherwise
    """
    protector = getattr(func, '_interlock_protector', None)
    if protector is None:
        return False
    return protector.is_dry_run()


# Module-level namespace class for clean imports
class Interlock:
    """
    Namespace class providing the @interlock.protect decorator.
    
    Usage:
        from interlock import interlock
        
        @interlock.protect(domain="faiss")
        def search_vectors(query):
            return index.search(query)
    """
    protect = staticmethod(protect)


# Convenience alias for module-level import
interlock = Interlock()


# Example usage and testing
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Simulate a FAISS search function
    class MockIndex:
        def __init__(self):
            self.nprobe = 10
            self.call_count = 0
        
        def search(self, query, k=10, nprobe=None):
            self.call_count += 1
            if nprobe:
                self.nprobe = nprobe
            # Simulate increasing latency
            latency_factor = 1 + (self.call_count / 20)
            time.sleep(0.01 * latency_factor)
            return f"results for {query} with nprobe={self.nprobe}"
    
    index = MockIndex()
    
    @protect(
        domain="faiss",
        memory_limit="8GB",
        failover={"nprobe": 4},
        hazard_threshold=0.5
    )
    def search_vectors(query, k=10, **kwargs):
        return index.search(query, k=k, **kwargs)
    
    # Run some test queries
    print("Running protected search queries...")
    for i in range(30):
        try:
            result = search_vectors(f"query_{i}")
            print(f"Query {i}: {result}")
        except Exception as e:
            print(f"Query {i} failed: {e}")
        
        # Check status every 10 queries
        if (i + 1) % 10 == 0:
            status = get_protection_status(search_vectors)
            print(f"\n--- Protection Status after {i + 1} queries ---")
            print(f"State: {status['state']}")
            print(f"Hazard: {status['hazard_score']:.3f}")
            print(f"Interventions: {status['total_interventions']}")
            print()
    
    # Print final intervention log
    interventions = get_interventions(search_vectors)
    if interventions:
        print("\n--- Intervention Log ---")
        for intervention in interventions:
            print(f"  {intervention['previous_state']} -> {intervention['new_state']}: {intervention['trigger']}")
    
    # Print calibration summary
    outcomes = get_calibration_outcomes(search_vectors)
    if outcomes:
        success_count = sum(1 for o in outcomes if o['actual_success'])
        print(f"\n--- Calibration Summary ---")
        print(f"Total outcomes: {len(outcomes)}")
        print(f"Success rate: {success_count / len(outcomes) * 100:.1f}%")
        avg_latency = sum(o['latency_ms'] for o in outcomes) / len(outcomes)
        print(f"Average latency: {avg_latency:.2f}ms")
