import React from 'react';
import { SOSGenome } from '../types';
import { Zap, Target, Brain, ArrowUpRight } from 'lucide-react';

interface GenomeCardProps {
  genome: SOSGenome;
  isLeader: boolean;
}

const DOMAIN_COLORS = {
  faiss: 'text-emerald-400 border-emerald-500/30',
  compression: 'text-blue-400 border-blue-500/30',
  postgres: 'text-purple-400 border-purple-500/30',
  prompts: 'text-amber-400 border-amber-500/30',
};

const GenomeCard: React.FC<GenomeCardProps> = ({ genome, isLeader }) => {
  const colorClass = DOMAIN_COLORS[genome.domain as keyof typeof DOMAIN_COLORS] || 'text-slate-400';
  
  return (
    <div className={`bg-slate-900 p-4 rounded-xl border relative transition-all duration-300 ${isLeader ? 'border-yellow-500/50 shadow-yellow-900/20 shadow-lg' : 'border-slate-800'}`}>
      {isLeader && (
        <div className="absolute -top-3 right-3 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-500/50 uppercase tracking-wider">
          Leader
        </div>
      )}
      
      <div className="flex items-center justify-between mb-3">
        <h4 className={`text-sm font-bold uppercase tracking-wider ${colorClass.split(' ')[0]}`}>
          {genome.domain}
        </h4>
        <div className="text-xs text-slate-500 font-mono">Gen {genome.generation}</div>
      </div>

      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-2xl font-bold text-white">{genome.fitness.toFixed(4)}</span>
        <span className="text-xs text-slate-500">fitness</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Target size={12} />
            <span>Alpha</span>
          </div>
          <span className="font-mono text-slate-300">{genome.alpha.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Brain size={12} />
            <span>Strategy</span>
          </div>
          <span className="font-mono text-slate-300 capitalize">{genome.sampleStrategy}</span>
        </div>
        
        {genome.originDomain && genome.originDomain !== genome.domain && (
           <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-1 text-[10px] text-emerald-400 animate-pulse">
             <ArrowUpRight size={10} />
             <span>Imported from {genome.originDomain}</span>
           </div>
        )}
      </div>
    </div>
  );
};

export default GenomeCard;
