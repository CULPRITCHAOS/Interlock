import React from 'react';
import { AlertTriangle, Wind, Zap, RefreshCcw } from 'lucide-react';
import { DOMAINS } from '../constants';

interface ControlPanelProps {
  onInjectDrift: (domain: string) => void;
  onBoostMutation: () => void;
  onReset: () => void;
  currentMutationRate: number;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ 
  onInjectDrift, 
  onBoostMutation, 
  onReset,
  currentMutationRate 
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-slate-400 text-xs uppercase font-bold flex items-center gap-2">
            <Zap size={14} className="text-yellow-500" />
            System Overrides (God Mode)
        </h3>
        <span className="text-[10px] text-slate-600 font-mono">
            μ-Rate: {(currentMutationRate * 100).toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Chaos Injection */}
        <div className="col-span-2 space-y-2">
            <label className="text-[10px] text-slate-500 uppercase font-bold">Inject Data Drift</label>
            <div className="grid grid-cols-2 gap-2">
                {DOMAINS.map(domain => (
                    <button
                        key={domain}
                        onClick={() => onInjectDrift(domain)}
                        className="flex items-center justify-center gap-2 bg-slate-950 border border-slate-800 hover:border-red-500/50 hover:bg-red-900/10 text-slate-400 hover:text-red-400 py-2 rounded text-xs transition-all active:scale-95"
                    >
                        <Wind size={12} />
                        <span className="capitalize">{domain}</span>
                    </button>
                ))}
            </div>
        </div>

        {/* Global Controls */}
        <button 
            onClick={onBoostMutation}
            className="flex flex-col items-center justify-center gap-1 bg-slate-800 hover:bg-purple-900/30 border border-slate-700 hover:border-purple-500/50 text-slate-300 p-3 rounded transition-all active:scale-95"
        >
            <AlertTriangle size={16} className="text-purple-400" />
            <span className="text-[10px] font-bold">Boost Mutation</span>
        </button>

        <button 
            onClick={onReset}
            className="flex flex-col items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 p-3 rounded transition-all active:scale-95"
        >
            <RefreshCcw size={16} className="text-slate-400" />
            <span className="text-[10px] font-bold">Hard Reset</span>
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
