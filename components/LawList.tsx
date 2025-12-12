import React from 'react';
import { Law } from '../types';
import { BookOpen, CheckCircle2 } from 'lucide-react';

interface LawListProps {
  laws: Law[];
}

const LawList: React.FC<LawListProps> = ({ laws }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-blue-400" />
                <h3 className="text-slate-200 font-semibold text-sm">Discovered Laws</h3>
            </div>
            <span className="text-xs text-slate-500">{laws.length} laws archived</span>
        </div>
      </div>
      
      <div className="overflow-y-auto p-4 space-y-3 h-[300px]">
        {[...laws].reverse().map((law) => (
          <div key={law.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg hover:border-slate-600 transition-colors group">
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 group-hover:border-slate-700">
                {law.domain}
              </span>
              <div className="flex items-center gap-1 text-emerald-500">
                <CheckCircle2 size={12} />
                <span className="text-xs font-mono">{(law.confidence * 100).toFixed(0)}% Conf</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-snug font-medium">
              {law.description}
            </p>
            <div className="mt-2 text-[10px] text-slate-600 font-mono">
              Found at Gen {law.discoveredAt} • ID: {law.id.substring(0,6)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LawList;
