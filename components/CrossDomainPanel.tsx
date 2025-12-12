import React from 'react';
import { CrossDomainInsight } from '../types';
import { Network, GitMerge, Share2 } from 'lucide-react';

interface CrossDomainPanelProps {
  insights: CrossDomainInsight[];
  mutationRate: number;
}

const CrossDomainPanel: React.FC<CrossDomainPanelProps> = ({ insights, mutationRate }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
           <Network size={16} className="text-pink-400" />
           <h3 className="text-slate-400 text-xs uppercase font-bold">Cross-Domain Intelligence</h3>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 px-2 py-1 rounded text-[10px]">
           <span className="text-slate-400">Global Mutation Rate:</span>
           <span className="text-pink-400 font-mono">{(mutationRate * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {insights.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs italic">
            <Share2 size={24} className="mb-2 opacity-50" />
            Waiting for cross-pollination event...
          </div>
        ) : (
          [...insights].reverse().map((insight) => (
            <div key={insight.id} className="bg-slate-950/50 border border-slate-800 p-2.5 rounded hover:border-pink-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded uppercase">
                  {insight.sourceDomain}
                </span>
                <GitMerge size={10} className="text-slate-500" />
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 rounded uppercase">
                  {insight.targetDomain}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                Transferred <span className="text-pink-400 font-mono">{insight.strategy}</span> strategy.
                <span className="text-slate-500 ml-1">Impact: {insight.impact}</span>
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CrossDomainPanel;
