import React from 'react';
import { ArrowRight, ArrowDown, ArrowUp, Database, Cpu, Dna, Activity } from 'lucide-react';

const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="w-full bg-slate-900/50 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 opacity-50" />
      
      <h3 className="text-sm font-semibold text-slate-400 mb-6 uppercase tracking-wider">Fusion Architecture: Self-Optimizing SDE</h3>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8 relative z-10">
        
        {/* SDE Core */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 w-48 shadow-lg relative group hover:border-blue-500 transition-colors">
             <div className="absolute -top-3 left-3 bg-blue-900 text-blue-200 text-xs px-2 py-0.5 rounded border border-blue-700">SDE Core</div>
            <div className="flex items-center gap-2 mb-2 text-blue-400">
              <Cpu size={20} />
              <span className="font-bold">Optimizer</span>
            </div>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• Surrogate Models</li>
              <li>• P(valid) Est.</li>
              <li>• E[reward] Est.</li>
              <li>• α Tuning</li>
            </ul>
          </div>
        </div>

        {/* Connection Arrows */}
        <div className="flex flex-col gap-1 items-center justify-center">
            <div className="flex items-center gap-2">
                <ArrowRight className="text-emerald-500 animate-pulse" size={20} />
                <ArrowRight className="text-emerald-500 animate-pulse delay-75" size={20} />
            </div>
            <span className="text-[10px] text-emerald-500 font-mono">Feedback Loop</span>
        </div>

        {/* AI Grower */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 w-48 shadow-lg relative hover:border-purple-500 transition-colors">
            <div className="absolute -top-3 left-3 bg-purple-900 text-purple-200 text-xs px-2 py-0.5 rounded border border-purple-700">AI Grower</div>
            <div className="flex items-center gap-2 mb-2 text-purple-400">
              <Dna size={20} />
              <span className="font-bold">Evolver</span>
            </div>
            <ul className="text-xs text-slate-400 space-y-1">
              <li>• Genome (DNA)</li>
              <li>• Mutation</li>
              <li>• Meta-Learning</li>
              <li>• Evolution</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Law Database */}
      <div className="mt-8 flex flex-col items-center relative z-10">
        <div className="h-8 border-l-2 border-dashed border-slate-600 mb-2"></div>
        <ArrowDown className="text-slate-500 mb-2" size={16} />
        
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700 w-64 shadow-lg text-center hover:border-emerald-500 transition-colors">
            <div className="flex items-center justify-center gap-2 mb-2 text-emerald-400">
              <Database size={20} />
              <span className="font-bold">Law Database</span>
            </div>
            <p className="text-xs text-slate-400">Persistent storage of optimization laws discovered across all generations.</p>
        </div>
      </div>
      
      {/* Background Decor */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-10 right-10 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl"></div>
    </div>
  );
};

export default ArchitectureDiagram;
