import React from 'react';
import { SOSGenome } from '../types';
import { Fingerprint, Zap, Target, Brain, Microscope } from 'lucide-react';

interface GenomePanelProps {
  genome: SOSGenome;
}

const GenomePanel: React.FC<GenomePanelProps> = ({ genome }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Alpha */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs uppercase tracking-wider">
          <Target size={14} />
          <span>Alpha (α)</span>
        </div>
        <div className="text-2xl font-mono text-white font-bold">
          {genome.alpha.toFixed(3)}
        </div>
        <div className="text-xs text-slate-500 mt-1">P(valid) exponent</div>
      </div>

      {/* Exploration */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs uppercase tracking-wider">
          <Microscope size={14} />
          <span>Exploration</span>
        </div>
        <div className="text-2xl font-mono text-emerald-400 font-bold">
          {genome.explorationBonus.toFixed(3)}
        </div>
        <div className="text-xs text-slate-500 mt-1">Discovery bonus</div>
      </div>

      {/* Strategy */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs uppercase tracking-wider">
          <Brain size={14} />
          <span>Strategy</span>
        </div>
        <div className="text-lg font-mono text-purple-400 font-bold capitalize truncate">
          {genome.sampleStrategy}
        </div>
        <div className="text-xs text-slate-500 mt-1">Sampling method</div>
      </div>

      {/* ID / Meta */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs uppercase tracking-wider">
          <Fingerprint size={14} />
          <span>Genome ID</span>
        </div>
        <div className="text-lg font-mono text-blue-400 font-bold">
          #{genome.id}
        </div>
        <div className="text-xs text-slate-500 mt-1">Generation {genome.generation}</div>
      </div>
    </div>
  );
};

export default GenomePanel;
