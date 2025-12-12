"""
SOS Tournament - Live Backend Server
=====================================
This FastAPI server provides real-time WebSocket communication for the SOS Dashboard.
It broadcasts discovery events (laws, insights, genome updates) to connected clients.

Run with:
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload --host 0.0.0.0 --port 8001
"""
import asyncio
import json
import logging
import random
import time
from datetime import datetime
from typing import Any, Dict, List, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("sos.backend")


# --- Data Models ---
class SOSGenome(BaseModel):
    id: str
    generation: int
    domain: str
    alpha: float
    exploration_bonus: float
    sample_strategy: str
    ridge_alpha: float
    fitness: float
    origin_domain: str | None = None


class WorkloadFingerprint(BaseModel):
    """Defines the scope signature for a law."""
    dataset_size: int = 10000
    dimensions: int = 128
    query_pattern: str = "random"  # 'random' | 'clustered' | 'sequential'
    target_metric: str = "recall"  # 'recall' | 'latency' | 'memory'
    k: int = 10


class LawTrialResult(BaseModel):
    """Trial result for repeated confidence measurement."""
    trial_id: str
    generation: int
    success: bool
    observed_value: float
    expected_range: tuple[float, float]


class LawCounterexample(BaseModel):
    """Counterexample tracking for when a law fails."""
    id: str
    observed_at: int
    workload_fingerprint: WorkloadFingerprint
    expected_outcome: str
    actual_outcome: str
    severity: str  # 'minor' | 'major' | 'critical'


class Law(BaseModel):
    """Enhanced Law with falsifiable properties."""
    id: str
    domain: str
    description: str
    confidence: float
    discovered_at: int
    version: int = 1
    status: str = "hypothesis"  # 'hypothesis' | 'validated' | 'falsified' | 'deprecated'
    scope_signature: WorkloadFingerprint | None = None
    trial_results: List[LawTrialResult] = []
    counterexamples: List[LawCounterexample] = []
    last_validated_at: int | None = None


class SimulationLog(BaseModel):
    id: str
    timestamp: str
    level: str
    message: str


class SOSEvent(BaseModel):
    type: str  # "genome_update", "law_discovered", "log", "cross_pollination", "status"
    data: Dict[str, Any]
    timestamp: str


# --- WebSocket Connection Manager ---
class ConnectionManager:
    """Manages WebSocket connections and broadcasts events to all connected clients."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, event: SOSEvent):
        """Broadcast an event to all connected clients."""
        if not self.active_connections:
            return
        
        message = event.model_dump_json()
        disconnected = set()
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        self.active_connections -= disconnected
    
    async def send_personal(self, websocket: WebSocket, event: SOSEvent):
        """Send an event to a specific client."""
        try:
            await websocket.send_text(event.model_dump_json())
        except Exception as e:
            logger.warning(f"Failed to send to client: {e}")


manager = ConnectionManager()


# --- SOS Evolution Simulation ---
DOMAINS = ["faiss", "compression", "postgres", "prompts"]

# Domain bias targets (the "physics" of each domain)
DOMAIN_BIAS = {
    "faiss": {"target_alpha": 4.5, "preferred_strategy": "gaussian"},
    "postgres": {"target_alpha": 1.8, "preferred_strategy": "uniform"},
    "compression": {"target_alpha": 3.0, "preferred_strategy": "adaptive"},
    "prompts": {"target_alpha": 5.0, "preferred_strategy": "exploit"}
}

# Mock law generation data
LAW_TEMPLATES = {
    "faiss": [
        "HNSW M parameter correlates with recall at threshold {threshold}",
        "Vector quantization optimal at dim > {dim} for this workload",
        "Index fragmentation inversely proportional to batch size",
    ],
    "postgres": [
        "work_mem > {mem}MB improves hash_agg by {pct}%",
        "Autovacuum frequency optimal at {freq} for write-heavy loads",
        "B-tree vs Hash index crossover at cardinality {card}",
    ],
    "compression": [
        "Dictionary size {size}KB maximizes compression ratio",
        "Sliding window {window} optimal for streaming data",
        "Entropy coding switch point at {point} redundancy",
    ],
    "prompts": [
        "Chain-of-thought improves accuracy by {pct}% for reasoning tasks",
        "Temperature {temp} optimal for creative generation",
        "Context window utilization peaks at {util}% occupancy",
    ]
}

# Default workload fingerprints for each domain
DEFAULT_FINGERPRINTS = {
    "faiss": WorkloadFingerprint(
        dataset_size=10000,
        dimensions=128,
        query_pattern="random",
        target_metric="recall",
        k=10
    ),
    "postgres": WorkloadFingerprint(
        dataset_size=100000,
        dimensions=1,
        query_pattern="sequential",
        target_metric="latency",
        k=1
    ),
    "compression": WorkloadFingerprint(
        dataset_size=50000,
        dimensions=256,
        query_pattern="random",
        target_metric="memory",
        k=1
    ),
    "prompts": WorkloadFingerprint(
        dataset_size=1000,
        dimensions=512,
        query_pattern="clustered",
        target_metric="recall",
        k=5
    )
}


def generate_id() -> str:
    return f"{random.randint(0, 0xFFFFFF):06x}"


def get_timestamp() -> str:
    return datetime.now().strftime("%H:%M:%S")


def generate_mock_law(domain: str, generation: int) -> Law:
    """Generate a mock discovered law with falsifiable properties."""
    templates = LAW_TEMPLATES.get(domain, LAW_TEMPLATES["faiss"])
    template = random.choice(templates)
    
    # Fill in placeholders with random values
    description = template.format(
        threshold=round(random.uniform(0.8, 0.99), 2),
        dim=random.randint(64, 512),
        mem=random.randint(64, 256),
        pct=random.randint(5, 30),
        freq=random.randint(100, 1000),
        card=random.randint(1000, 100000),
        size=random.randint(16, 128),
        window=random.randint(1024, 8192),
        point=round(random.uniform(0.3, 0.7), 2),
        temp=round(random.uniform(0.1, 1.0), 2),
        util=random.randint(60, 95)
    )
    
    # Get default fingerprint for the domain
    fingerprint = DEFAULT_FINGERPRINTS.get(domain, DEFAULT_FINGERPRINTS["faiss"])
    
    return Law(
        id=f"law-{generate_id()}",
        domain=domain,
        description=description,
        confidence=round(random.uniform(0.75, 0.98), 2),
        discovered_at=generation,
        version=1,
        status="hypothesis",
        scope_signature=fingerprint,
        trial_results=[],
        counterexamples=[],
        last_validated_at=generation
    )


class SOSSimulator:
    """Simulates the SOS evolution process and broadcasts events via WebSocket."""
    
    def __init__(self):
        self.is_running = False
        self.generation = 0
        self.mutation_rate = 0.05
        self.genomes: Dict[str, Dict[str, Any]] = {}
        self._init_genomes()
    
    def _init_genomes(self):
        """Initialize genomes for all domains."""
        for domain in DOMAINS:
            self.genomes[domain] = {
                "id": generate_id(),
                "generation": 0,
                "domain": domain,
                "alpha": 2.0 + random.random(),
                "exploration_bonus": 0.1,
                "sample_strategy": "uniform",
                "ridge_alpha": 1.0,
                "fitness": 0.2 + random.random() * 0.1
            }
    
    def evolve_genome(self, domain: str) -> Dict[str, Any]:
        """Evolve a genome based on domain physics."""
        current = self.genomes[domain]
        bias = DOMAIN_BIAS[domain]
        
        # Mutate alpha
        noise = (random.random() - 0.5) * (self.mutation_rate * 5)
        pull = (bias["target_alpha"] - current["alpha"]) * 0.1
        new_alpha = max(1.0, min(6.0, current["alpha"] + pull + noise))
        
        # Mutate strategy
        strategies = ["uniform", "gaussian", "adaptive", "exploit"]
        new_strategy = current["sample_strategy"]
        if random.random() < self.mutation_rate:
            if random.random() > 0.4:
                new_strategy = bias["preferred_strategy"]
            else:
                new_strategy = random.choice(strategies)
        
        # Calculate fitness
        alpha_distance = abs(new_alpha - bias["target_alpha"])
        alpha_score = max(0, 1 - (alpha_distance / 4))
        strategy_bonus = 0.2 if new_strategy == bias["preferred_strategy"] else 0
        base_fitness = (alpha_score * 0.7) + strategy_bonus + 0.1
        run_noise = (random.random() - 0.5) * 0.05
        new_fitness = (current["fitness"] * 0.8) + ((base_fitness + run_noise) * 0.2)
        new_fitness = min(0.9995, max(0, new_fitness))
        
        # Update genome
        self.genomes[domain] = {
            **current,
            "generation": self.generation,
            "alpha": new_alpha,
            "sample_strategy": new_strategy,
            "fitness": new_fitness
        }
        
        return self.genomes[domain]
    
    async def run_step(self):
        """Execute one evolution step and broadcast events."""
        self.generation += 1
        
        # Evolve all genomes
        updates = {}
        for domain in DOMAINS:
            updates[domain] = self.evolve_genome(domain)
        
        # Broadcast genome updates
        await manager.broadcast(SOSEvent(
            type="genome_update",
            data={"genomes": updates, "generation": self.generation},
            timestamp=get_timestamp()
        ))
        
        # Occasionally discover a law (every ~10 generations with randomness)
        if self.generation > 0 and random.random() < 0.1:
            domain = random.choice(DOMAINS)
            law = generate_mock_law(domain, self.generation)
            
            await manager.broadcast(SOSEvent(
                type="law_discovered",
                data=law.model_dump(),
                timestamp=get_timestamp()
            ))
            
            # Also send a log event
            await manager.broadcast(SOSEvent(
                type="log",
                data={
                    "id": generate_id(),
                    "timestamp": get_timestamp(),
                    "level": "success",
                    "message": f"Universal Law Candidate: {law.description}"
                },
                timestamp=get_timestamp()
            ))
        
        # Cross-pollination check
        if self.generation > 0 and self.generation % 15 == 0:
            sorted_genomes = sorted(
                updates.items(),
                key=lambda x: x[1]["fitness"],
                reverse=True
            )
            best = sorted_genomes[0]
            worst = sorted_genomes[-1]
            
            if best[0] != worst[0] and (best[1]["fitness"] - worst[1]["fitness"] > 0.15):
                await manager.broadcast(SOSEvent(
                    type="cross_pollination",
                    data={
                        "source": best[0],
                        "target": worst[0],
                        "strategy": best[1]["sample_strategy"]
                    },
                    timestamp=get_timestamp()
                ))
                
                await manager.broadcast(SOSEvent(
                    type="log",
                    data={
                        "id": generate_id(),
                        "timestamp": get_timestamp(),
                        "level": "transfer",
                        "message": f"Cross-pollination: {best[0]} ({best[1]['sample_strategy']}) -> {worst[0]}"
                    },
                    timestamp=get_timestamp()
                ))
    
    def reset(self):
        """Reset the simulation."""
        self.generation = 0
        self.mutation_rate = 0.05
        self._init_genomes()
    
    def inject_drift(self, domain: str):
        """Inject data drift into a domain."""
        if domain in self.genomes:
            self.genomes[domain]["fitness"] *= 0.6
            DOMAIN_BIAS[domain]["target_alpha"] = max(1.5, random.random() * 5.0)
            current_strategy = DOMAIN_BIAS[domain]["preferred_strategy"]
            DOMAIN_BIAS[domain]["preferred_strategy"] = "gaussian" if current_strategy == "uniform" else "uniform"


simulator = SOSSimulator()
simulation_task: asyncio.Task | None = None


async def simulation_loop():
    """Main simulation loop that runs continuously when active."""
    while simulator.is_running:
        await simulator.run_step()
        await asyncio.sleep(0.6)  # Match frontend interval


# --- FastAPI Application ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SOS Backend starting up...")
    yield
    logger.info("SOS Backend shutting down...")
    simulator.is_running = False


app = FastAPI(
    title="SOS Tournament Live Backend",
    version="1.0.0",
    description="Real-time WebSocket server for SOS Dashboard",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "simulation_running": simulator.is_running,
        "generation": simulator.generation,
        "connected_clients": len(manager.active_connections)
    }


@app.get("/status")
async def get_status():
    """Get current simulation status."""
    return {
        "is_running": simulator.is_running,
        "generation": simulator.generation,
        "genomes": simulator.genomes,
        "mutation_rate": simulator.mutation_rate
    }


@app.post("/start")
async def start_simulation():
    """Start the simulation."""
    global simulation_task
    
    if not simulator.is_running:
        simulator.is_running = True
        simulation_task = asyncio.create_task(simulation_loop())
        
        await manager.broadcast(SOSEvent(
            type="status",
            data={"action": "started", "generation": simulator.generation},
            timestamp=get_timestamp()
        ))
        
        return {"status": "started", "generation": simulator.generation}
    
    return {"status": "already_running", "generation": simulator.generation}


@app.post("/stop")
async def stop_simulation():
    """Stop the simulation."""
    global simulation_task
    
    if simulator.is_running:
        simulator.is_running = False
        if simulation_task:
            simulation_task.cancel()
            try:
                await simulation_task
            except asyncio.CancelledError:
                pass
            simulation_task = None
        
        await manager.broadcast(SOSEvent(
            type="status",
            data={"action": "stopped", "generation": simulator.generation},
            timestamp=get_timestamp()
        ))
        
        return {"status": "stopped", "generation": simulator.generation}
    
    return {"status": "already_stopped", "generation": simulator.generation}


@app.post("/reset")
async def reset_simulation():
    """Reset the simulation."""
    global simulation_task
    
    was_running = simulator.is_running
    simulator.is_running = False
    
    if simulation_task:
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
        simulation_task = None
    
    simulator.reset()
    
    await manager.broadcast(SOSEvent(
        type="status",
        data={"action": "reset", "generation": 0},
        timestamp=get_timestamp()
    ))
    
    return {"status": "reset", "generation": 0}


@app.post("/inject-drift/{domain}")
async def inject_drift(domain: str):
    """Inject data drift into a specific domain."""
    if domain not in DOMAINS:
        return {"error": f"Unknown domain: {domain}"}
    
    simulator.inject_drift(domain)
    
    await manager.broadcast(SOSEvent(
        type="log",
        data={
            "id": generate_id(),
            "timestamp": get_timestamp(),
            "level": "warning",
            "message": f"WARNING: Detected Data Drift in {domain.upper()}"
        },
        timestamp=get_timestamp()
    ))
    
    return {"status": "drift_injected", "domain": domain}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await manager.connect(websocket)
    
    # Send initial state
    await manager.send_personal(websocket, SOSEvent(
        type="status",
        data={
            "action": "connected",
            "is_running": simulator.is_running,
            "generation": simulator.generation,
            "genomes": simulator.genomes
        },
        timestamp=get_timestamp()
    ))
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                command = message.get("command")
                
                if command == "start":
                    await start_simulation()
                elif command == "stop":
                    await stop_simulation()
                elif command == "reset":
                    await reset_simulation()
                elif command == "inject_drift":
                    domain = message.get("domain")
                    if domain:
                        await inject_drift(domain)
                elif command == "ping":
                    await manager.send_personal(websocket, SOSEvent(
                        type="pong",
                        data={"time": time.time()},
                        timestamp=get_timestamp()
                    ))
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {data}")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
