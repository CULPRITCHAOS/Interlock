import React from 'react';
import { BenchmarkRunResult, BenchmarkConfig } from '../types';
import { Gauge, Zap, HardDrive, Target, Activity, Database, RefreshCw } from 'lucide-react';

interface BenchmarkPanelProps {
  results: BenchmarkRunResult[];
  config: BenchmarkConfig;
  isRunning: boolean;
  onRunBenchmark?: () => void;
}

// Helper to format variance as ±stddev
const formatVariance = (variance: number): string => {
  const stdDev = Math.sqrt(variance);
  return `±${stdDev.toFixed(3)}`;
};

const MetricCard: React.FC<{
  label: string;
  value: number;
  unit: string;
  variance: number;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, unit, variance, icon, color }) => (
  <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
    <div className="flex items-center justify-between mb-1">
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-[10px] uppercase font-bold">{label}</span>
      </div>
      <span className="text-[9px] text-slate-500 font-mono">{formatVariance(variance)}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-bold text-white">{value.toFixed(3)}</span>
      <span className="text-xs text-slate-500">{unit}</span>
    </div>
  </div>
);

const BenchmarkPanel: React.FC<BenchmarkPanelProps> = ({ 
  results, 
  config, 
  isRunning,
  onRunBenchmark 
}) => {
  // Get latest result
  const latestResult = results.length > 0 ? results[results.length - 1] : null;
  
  // Calculate average metrics across all results
  const avgMetrics = results.length > 0 ? {
    recall: results.reduce((s, r) => s + r.metrics.recall, 0) / results.length,
    latency: results.reduce((s, r) => s + r.metrics.latencyMs, 0) / results.length,
    memory: results.reduce((s, r) => s + r.metrics.memoryMb, 0) / results.length
  } : null;
  
  // Calculate run-to-run variance
  const runToRunVariance = results.length > 1 ? {
    recall: results.reduce((s, r) => s + Math.pow(r.metrics.recall - avgMetrics!.recall, 2), 0) / results.length,
    latency: results.reduce((s, r) => s + Math.pow(r.metrics.latencyMs - avgMetrics!.latency, 2), 0) / results.length,
    memory: results.reduce((s, r) => s + Math.pow(r.metrics.memoryMb - avgMetrics!.memory, 2), 0) / results.length
  } : { recall: 0, latency: 0, memory: 0 };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-cyan-400" />
          <h3 className="text-slate-200 font-semibold text-sm">FAISS Benchmark</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono">
            Seed: {config.seed}
          </span>
          {onRunBenchmark && (
            <button
              onClick={onRunBenchmark}
              disabled={isRunning}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-all ${
                isRunning 
                  ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                  : 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30 hover:bg-cyan-900/50'
              }`}
            >
              <RefreshCw size={10} className={isRunning ? 'animate-spin' : ''} />
              {isRunning ? 'Running...' : 'Run Benchmark'}
            </button>
          )}
        </div>
      </div>

      {/* Config Summary */}
      <div className="flex items-center gap-4 mb-4 p-2 bg-slate-950/30 rounded border border-slate-800/50 text-[10px]">
        <div className="flex items-center gap-1 text-slate-400">
          <Database size={10} />
          <span>{config.datasetSize.toLocaleString()} vectors</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <Activity size={10} />
          <span>{config.dimensions}D</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <Target size={10} />
          <span>recall@{config.workloadFingerprint.k}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <RefreshCw size={10} />
          <span>{config.runs} runs</span>
        </div>
      </div>

      {/* Metrics Grid */}
      {latestResult ? (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MetricCard
            label="Recall@k"
            value={latestResult.metrics.recall}
            unit=""
            variance={latestResult.variance.recall}
            icon={<Target size={12} />}
            color="text-emerald-400"
          />
          <MetricCard
            label="Latency"
            value={latestResult.metrics.latencyMs}
            unit="ms"
            variance={latestResult.variance.latency}
            icon={<Zap size={12} />}
            color="text-amber-400"
          />
          <MetricCard
            label="Memory"
            value={latestResult.metrics.memoryMb}
            unit="MB"
            variance={latestResult.variance.memory}
            icon={<HardDrive size={12} />}
            color="text-purple-400"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-xs">
          <Gauge size={24} className="mb-2 opacity-50" />
          <span>No benchmark results yet</span>
          <span className="text-[10px] text-slate-600 mt-1">Start the simulation to collect metrics</span>
        </div>
      )}

      {/* Run-to-Run Variance Summary */}
      {results.length > 1 && (
        <div className="p-2 bg-slate-950/30 rounded border border-slate-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={10} className="text-slate-500" />
            <span className="text-[10px] text-slate-500 uppercase font-bold">Run-to-Run Variance</span>
            <span className="text-[9px] text-slate-600">({results.length} runs)</span>
          </div>
          <div className="flex items-center justify-around text-[10px]">
            <div className="text-center">
              <div className="text-slate-500">Recall</div>
              <div className="text-slate-300 font-mono">{formatVariance(runToRunVariance.recall)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Latency</div>
              <div className="text-slate-300 font-mono">{formatVariance(runToRunVariance.latency)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Memory</div>
              <div className="text-slate-300 font-mono">{formatVariance(runToRunVariance.memory)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Latest Run Info */}
      {latestResult && (
        <div className="mt-3 flex items-center justify-between text-[9px] text-slate-600">
          <span>Run ID: {latestResult.runId.substring(0, 12)}</span>
          <span>Seed: {latestResult.seed}</span>
          <span>Gen: {latestResult.generation}</span>
        </div>
      )}
    </div>
  );
};

export default BenchmarkPanel;
