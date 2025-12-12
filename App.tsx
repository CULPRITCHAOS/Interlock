import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SOSGenome, Law, SimulationLog, ChartDataPoint, CrossDomainInsight } from './types';
import { DOMAINS, INITIAL_LAWS } from './constants';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import Terminal from './components/Terminal';
import GenomeCard from './components/GenomeCard';
import Charts from './components/Charts';
import LawList from './components/LawList';
import CrossDomainPanel from './components/CrossDomainPanel';
import ExportModal from './components/ExportModal';
import SearchSpaceViz from './components/SearchSpaceViz';
import ControlPanel from './components/ControlPanel'; // New Import
import { Play, Pause, RefreshCw, Trophy, Download, Activity, Cpu } from 'lucide-react';
import { generateSimulatedInsight, generateDiscoveredLaw, generateCrossDomainInsight } from './services/ai';

// Utility for random ID
const generateId = () => Math.random().toString(36).substring(2, 8);

type PanelTab = 'blueprint' | 'kernel';

// Initial "Physics"
const INITIAL_BIAS: Record<string, { targetAlpha: number, preferredStrategy: string }> = {
  faiss: { targetAlpha: 4.5, preferredStrategy: 'gaussian' },
  postgres: { targetAlpha: 1.8, preferredStrategy: 'uniform' },
  compression: { targetAlpha: 3.0, preferredStrategy: 'adaptive' },
  prompts: { targetAlpha: 5.0, preferredStrategy: 'exploit' }
};

const App: React.FC = () => {
  // --- State ---
  const [isRunning, setIsRunning] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('blueprint');
  const [generation, setGeneration] = useState(0);
  
  // Simulation State
  const [domainBias, setDomainBias] = useState(INITIAL_BIAS);
  // Track visual targets for the Viz component
  const [vizTargets, setVizTargets] = useState<Record<string, {x: number, y: number}>>({
      faiss: {x: 0.7, y: 0.3},
      postgres: {x: 0.2, y: 0.8},
      compression: {x: 0.5, y: 0.5},
      prompts: {x: 0.8, y: 0.8}
  });

  // Parallel Genomes State
  const [genomes, setGenomes] = useState<Record<string, SOSGenome>>(() => {
    const initial: Record<string, SOSGenome> = {};
    DOMAINS.forEach(d => {
      initial[d] = {
        id: generateId(),
        generation: 0,
        domain: d,
        alpha: 2.0 + Math.random(), 
        explorationBonus: 0.1,
        sampleStrategy: 'uniform', 
        ridgeAlpha: 1.0,
        fitness: 0.2 + Math.random() * 0.1
      };
    });
    return initial;
  });

  const [globalMutationRate, setGlobalMutationRate] = useState(0.05);

  // History State
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [laws, setLaws] = useState<Law[]>(INITIAL_LAWS);
  const [crossInsights, setCrossInsights] = useState<CrossDomainInsight[]>([]);
  const [logs, setLogs] = useState<SimulationLog[]>([
    { id: generateId(), timestamp: new Date().toLocaleTimeString(), level: 'system', message: 'SOS Tournament Mode Initialized.' },
    { id: generateId(), timestamp: new Date().toLocaleTimeString(), level: 'info', message: '4 Parallel evolutionary channels active.' },
  ]);

  // Refs
  const intervalRef = useRef<number | null>(null);
  const isFetchingAI = useRef(false);

  // --- Logic ---

  // Auto-switch to Kernel view when running
  useEffect(() => {
    if (isRunning) {
        setActiveTab('kernel');
    }
  }, [isRunning]);

  const addLog = useCallback((message: string, level: SimulationLog['level'] = 'info') => {
    setLogs(prev => {
        const newLogs = [...prev, { id: generateId(), timestamp: new Date().toLocaleTimeString(), level, message }];
        if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
        return newLogs;
    });
  }, []);

  // God Mode: Inject Drift
  const handleInjectDrift = (domain: string) => {
     addLog(`WARNING: Detected Data Drift in ${domain.toUpperCase()}`, 'warning');
     
     // 1. Shift Physics
     setDomainBias(prev => ({
         ...prev,
         [domain]: {
             targetAlpha: Math.max(1.5, Math.random() * 5.0), // New random optimal alpha
             preferredStrategy: prev[domain].preferredStrategy === 'gaussian' ? 'uniform' : 'gaussian' // Switch optimal strategy
         }
     }));

     // 2. Shift Visual Target
     setVizTargets(prev => ({
         ...prev,
         [domain]: {
             x: Math.random() * 0.8 + 0.1,
             y: Math.random() * 0.8 + 0.1
         }
     }));

     // 3. Drop fitness temporarily (Simulate shock)
     setGenomes(prev => ({
         ...prev,
         [domain]: { ...prev[domain], fitness: prev[domain].fitness * 0.6 }
     }));
     
     // 4. Boost mutation to help recover
     setGlobalMutationRate(0.25);
     setTimeout(() => setGlobalMutationRate(0.05), 5000); // Decaying boost
  };

  const handleBoostMutation = () => {
      setGlobalMutationRate(0.5);
      addLog('SYSTEM: Manually boosted global mutation rate to 50%', 'system');
      setTimeout(() => {
          setGlobalMutationRate(0.05);
          addLog('SYSTEM: Mutation rate stabilized.', 'system');
      }, 3000);
  };

  // Evolve a single genome based on "Domain Physics" (Dynamic)
  const evolveGenome = useCallback((current: SOSGenome): SOSGenome => {
    const newGenome = { ...current };
    newGenome.generation += 1;
    
    // USE DYNAMIC BIAS HERE
    const bias = domainBias[current.domain]; 
    
    // 1. Mutate Alpha
    const noise = (Math.random() - 0.5) * (globalMutationRate * 5);
    const pullToOptimal = (bias.targetAlpha - current.alpha) * 0.1;
    newGenome.alpha = Math.max(1.0, Math.min(6.0, current.alpha + pullToOptimal + noise));

    // 2. Mutate Strategy
    if (Math.random() < globalMutationRate) {
       const strategies: Array<SOSGenome['sampleStrategy']> = ['uniform', 'gaussian', 'adaptive', 'exploit'];
       if (Math.random() > 0.4) {
           newGenome.sampleStrategy = bias.preferredStrategy as any;
       } else {
           newGenome.sampleStrategy = strategies[Math.floor(Math.random() * strategies.length)];
       }
    }

    // 3. Calculate Fitness
    const alphaDistance = Math.abs(newGenome.alpha - bias.targetAlpha);
    const alphaScore = Math.max(0, 1 - (alphaDistance / 4)); 
    
    const strategyBonus = newGenome.sampleStrategy === bias.preferredStrategy ? 0.2 : 0;
    
    // If we are far from target (due to drift), fitness drops
    const baseFitness = (alphaScore * 0.7) + strategyBonus + 0.1;
    const runNoise = (Math.random() - 0.5) * 0.05;
    
    newGenome.fitness = (current.fitness * 0.8) + ((baseFitness + runNoise) * 0.2);
    newGenome.fitness = Math.min(0.9995, Math.max(0, newGenome.fitness));

    return newGenome;
  }, [globalMutationRate, domainBias]);

  // Cross-Pollination
  const performCrossPollination = useCallback(async (currentGenomes: Record<string, SOSGenome>) => {
     const sorted = Object.values(currentGenomes).sort((a, b) => b.fitness - a.fitness);
     const best = sorted[0];
     const worst = sorted[sorted.length - 1];

     if (best.domain !== worst.domain && (best.fitness - worst.fitness > 0.15)) {
         const newWorst = { 
             ...worst, 
             sampleStrategy: best.sampleStrategy,
             originDomain: best.domain
         };
         
         setGenomes(prev => ({ ...prev, [worst.domain]: newWorst }));
         addLog(`Cross-pollination: ${best.domain} (${best.sampleStrategy}) -> ${worst.domain}`, 'transfer');
         setGlobalMutationRate(r => Math.max(0.01, r * 0.95));

         const insight = await generateCrossDomainInsight(best, worst);
         setCrossInsights(prev => [...prev, insight]);
     } else {
         setGlobalMutationRate(r => Math.min(0.2, r * 1.05));
     }
  }, [addLog]);


  // Main Step
  const runSimulationStep = useCallback(() => {
    setGeneration(g => {
        const nextGen = g + 1;
        setGenomes(prev => {
            const nextGenomes: Record<string, SOSGenome> = {};
            let bestFitness = 0;
            let leaderDomain = '';

            DOMAINS.forEach(d => {
                nextGenomes[d] = evolveGenome(prev[d]);
                if (nextGenomes[d].fitness > bestFitness) {
                    bestFitness = nextGenomes[d].fitness;
                    leaderDomain = d;
                }
            });

            setChartData(prevChart => {
                const point: ChartDataPoint = { generation: nextGen };
                DOMAINS.forEach(d => { 
                    point[d] = nextGenomes[d].fitness; 
                    point[`${d}_alpha`] = nextGenomes[d].alpha;
                });
                const newData = [...prevChart, point];
                return newData.length > 50 ? newData.slice(newData.length - 50) : newData;
            });

            return nextGenomes;
        });
        return nextGen;
    });
  }, [evolveGenome]);

  // Effects (Intervals)
  useEffect(() => {
    if (isRunning && generation > 0 && generation % 15 === 0) performCrossPollination(genomes);
  }, [generation, isRunning]); 

  useEffect(() => {
    if (!isRunning) return;
    if (generation > 0 && generation % 30 === 0 && !isFetchingAI.current) {
        isFetchingAI.current = true;
        const randomDomain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
        generateSimulatedInsight(genomes[randomDomain]).then(text => {
            addLog(`[${randomDomain.toUpperCase()}] ${text}`, 'info');
            isFetchingAI.current = false;
        });
    }
    if (generation > 0 && generation % 45 === 0) {
         const randomDomain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
         generateDiscoveredLaw(genomes[randomDomain]).then(law => {
             const newLaw: Law = {
                 id: generateId(),
                 domain: randomDomain,
                 description: law.description,
                 confidence: law.confidence,
                 discoveredAt: generation
             };
             setLaws(prev => [...prev, newLaw]);
             addLog(`Universal Law Candidate: ${law.description}`, 'success');
         });
    }
  }, [generation, isRunning, genomes]); 

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(runSimulationStep, 600);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, runSimulationStep]);

  const handleReset = () => {
    setIsRunning(false);
    setActiveTab('blueprint');
    setGeneration(0);
    setChartData([]);
    setCrossInsights([]);
    setGlobalMutationRate(0.05);
    setDomainBias(INITIAL_BIAS); // Reset Physics
    const initial: Record<string, SOSGenome> = {};
    DOMAINS.forEach(d => {
      initial[d] = {
        id: generateId(),
        generation: 0,
        domain: d,
        alpha: 2.0 + Math.random(),
        explorationBonus: 0.1,
        sampleStrategy: 'uniform',
        ridgeAlpha: 1.0,
        fitness: 0.2
      };
    });
    setGenomes(initial);
    setLogs([{ id: generateId(), timestamp: new Date().toLocaleTimeString(), level: 'system', message: 'Tournament Reset.' }]);
  };

  const leaderKey = Object.keys(genomes).reduce((a, b) => genomes[a].fitness > genomes[b].fitness ? a : b);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6 font-sans selection:bg-pink-500/30">
      
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg">
             <Trophy size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-500">
                SOS Tournament
            </h1>
            <p className="text-slate-500 text-xs mt-0.5 font-mono">Parallel Evolutionary Optimization • Gen {generation}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsExportOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-400 rounded text-xs hover:text-white border border-slate-700 hover:border-emerald-500/50 transition-all"
            >
                <Download size={14} />
                Export Optimizers
            </button>
            <div className="h-8 w-px bg-slate-800"></div>
            <button 
                onClick={() => setIsRunning(!isRunning)}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all shadow-lg ${
                  isRunning 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/50 hover:bg-amber-500/20' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/50'
                }`}
            >
                {isRunning ? <Pause size={16} /> : <Play size={16} />}
                {isRunning ? "PAUSE" : "START TOURNAMENT"}
            </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">
        
        {/* Col 1: System View (Diagram or Kernel Viz) */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
            
            <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                <button 
                    onClick={() => setActiveTab('blueprint')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded transition-all ${activeTab === 'blueprint' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Activity size={12} /> Blueprint
                </button>
                <button 
                    onClick={() => setActiveTab('kernel')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded transition-all ${activeTab === 'kernel' ? 'bg-emerald-900/30 text-emerald-400 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Cpu size={12} /> Kernel
                </button>
            </div>

            <div className="min-h-[250px]">
                {activeTab === 'blueprint' ? (
                    <ArchitectureDiagram />
                ) : (
                    <SearchSpaceViz 
                        genome={genomes[leaderKey]} 
                        isRunning={isRunning} 
                        target={vizTargets[leaderKey]} // Dynamic Target
                    />
                )}
            </div>
            
            {/* Replace Terminal with Control Panel when in Kernel mode for more fun? Or stack them? */}
            {/* Let's stack them but make terminal smaller */}
            <div className="flex-1 min-h-[150px]">
                <ControlPanel 
                    onInjectDrift={handleInjectDrift}
                    onBoostMutation={handleBoostMutation}
                    onReset={handleReset}
                    currentMutationRate={globalMutationRate}
                />
            </div>
            
             <div className="h-32">
                <Terminal logs={logs} />
             </div>
        </div>

        {/* Col 2 & 3: Active Evolution (Grid of cards + Chart) */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto pr-2">
            
            <div className="grid grid-cols-2 gap-4">
                {DOMAINS.map(d => (
                    <GenomeCard 
                        key={d} 
                        genome={genomes[d]} 
                        isLeader={leaderKey === d} 
                    />
                ))}
            </div>

            <Charts data={chartData} />

            <div className="flex-1">
                 <LawList laws={laws} />
            </div>
        </div>

        {/* Col 4: Cross Domain Intelligence */}
        <div className="lg:col-span-1 flex flex-col gap-6">
            <CrossDomainPanel insights={crossInsights} mutationRate={globalMutationRate} />
        </div>

      </div>

      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        genomes={genomes} 
      />
    </div>
  );
};

export default App;
