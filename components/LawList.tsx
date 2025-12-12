import React from 'react';
import { Law } from '../types';
import { BookOpen, CheckCircle2, XCircle, AlertTriangle, Clock, GitBranch, FlaskConical, Fingerprint } from 'lucide-react';

interface LawListProps {
  laws: Law[];
}

// Helper to format workload fingerprint
const formatFingerprint = (fp?: Law['scopeSignature']): string => {
  if (!fp) return 'Global';
  return `${fp.datasetSize}x${fp.dimensions}:${fp.queryPattern}:${fp.targetMetric}@${fp.k}`;
};

// Status badge styling
const getStatusBadge = (status: Law['status']) => {
  switch (status) {
    case 'validated':
      return { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-500/30' };
    case 'falsified':
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30 border-red-500/30' };
    case 'deprecated':
      return { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-900/30 border-amber-500/30' };
    default:
      return { icon: FlaskConical, color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-500/30' };
  }
};

const LawList: React.FC<LawListProps> = ({ laws }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-blue-400" />
                <h3 className="text-slate-200 font-semibold text-sm">Discovered Laws</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{laws.length} laws archived</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {laws.filter(l => l.status === 'validated').length} validated
              </span>
            </div>
        </div>
      </div>
      
      <div className="overflow-y-auto p-4 space-y-3 h-[300px]">
        {[...laws].reverse().map((law) => {
          const statusInfo = getStatusBadge(law.status || 'hypothesis');
          const StatusIcon = statusInfo.icon;
          const trialsCount = law.trialResults?.length || 0;
          const successCount = law.trialResults?.filter(t => t.success).length || 0;
          const counterexampleCount = law.counterexamples?.length || 0;
          
          return (
            <div key={law.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg hover:border-slate-600 transition-colors group">
              {/* Header Row */}
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 group-hover:border-slate-700">
                    {law.domain}
                  </span>
                  {/* Version Badge */}
                  <span className="text-[9px] text-slate-600 font-mono flex items-center gap-0.5">
                    <GitBranch size={8} />
                    v{law.version || 1}
                  </span>
                </div>
                {/* Status Badge */}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${statusInfo.bg}`}>
                  <StatusIcon size={10} className={statusInfo.color} />
                  <span className={`text-[10px] font-mono capitalize ${statusInfo.color}`}>
                    {law.status || 'hypothesis'}
                  </span>
                </div>
              </div>
              
              {/* Description */}
              <p className="text-sm text-slate-300 leading-snug font-medium mb-2">
                {law.description}
              </p>
              
              {/* Confidence Bar */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-500">Confidence:</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      law.confidence >= 0.8 ? 'bg-emerald-500' : 
                      law.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${law.confidence * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{(law.confidence * 100).toFixed(0)}%</span>
              </div>
              
              {/* Scope Signature */}
              {law.scopeSignature && (
                <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-1 bg-slate-900/50 px-1.5 py-0.5 rounded">
                  <Fingerprint size={9} />
                  <span className="font-mono">{formatFingerprint(law.scopeSignature)}</span>
                </div>
              )}
              
              {/* Trial & Counterexample Stats */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-3 text-[10px]">
                  {/* Trials */}
                  <div className="flex items-center gap-1 text-slate-500">
                    <FlaskConical size={10} />
                    <span>{successCount}/{trialsCount} trials</span>
                  </div>
                  {/* Counterexamples */}
                  {counterexampleCount > 0 && (
                    <div className="flex items-center gap-1 text-red-400">
                      <XCircle size={10} />
                      <span>{counterexampleCount} counterexample{counterexampleCount > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
                {/* Metadata */}
                <div className="text-[10px] text-slate-600 font-mono flex items-center gap-1">
                  <Clock size={9} />
                  Gen {law.discoveredAt} • {law.id.substring(0,6)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LawList;
