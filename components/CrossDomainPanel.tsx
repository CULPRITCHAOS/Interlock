import React from 'react';
import { CrossDomainInsight, TransferABTestResult } from '../types';
import { Network, GitMerge, Share2, TrendingUp, TrendingDown, Minus, FlaskConical, Target, Clock, BarChart3 } from 'lucide-react';

interface CrossDomainPanelProps {
  insights: CrossDomainInsight[];
  mutationRate: number;
  abTestResults?: TransferABTestResult[];
}

// Helper to render improvement indicator
const ImprovementIndicator: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const isPositive = value > 0;
  const isNeutral = Math.abs(value) < 1;
  
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-slate-500">{label}:</span>
      <div className={`flex items-center gap-0.5 font-mono ${
        isNeutral ? 'text-slate-400' : isPositive ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {isNeutral ? <Minus size={10} /> : isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        <span>{isPositive ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
    </div>
  );
};

const CrossDomainPanel: React.FC<CrossDomainPanelProps> = ({ insights, mutationRate, abTestResults = [] }) => {
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

      {/* A/B Test Results Section */}
      {abTestResults.length > 0 && (
        <div className="mb-4 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={12} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-slate-300 uppercase">Transfer A/B Test Results</span>
          </div>
          
          {[...abTestResults].reverse().slice(0, 2).map((test) => (
            <div key={test.id} className="mb-2 last:mb-0 p-2 bg-slate-900/50 rounded border border-slate-800">
              {/* Test Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-slate-400 uppercase">{test.sourceDomain}</span>
                  <GitMerge size={8} className="text-slate-500" />
                  <span className="text-slate-400 uppercase">{test.targetDomain}</span>
                </div>
                <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  test.isNetPositive 
                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-red-900/30 text-red-400 border border-red-500/30'
                }`}>
                  {test.isNetPositive ? 'NET POSITIVE' : 'NET NEGATIVE'}
                </div>
              </div>
              
              {/* Metrics */}
              <div className="space-y-1">
                <ImprovementIndicator value={test.improvement.timeToThreshold} label="Time-to-Threshold" />
                <ImprovementIndicator value={test.improvement.bestAchieved} label="Best Achieved" />
                <ImprovementIndicator value={test.improvement.regret} label="Regret Reduction" />
              </div>
              
              {/* Confidence */}
              <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[9px] text-slate-500">
                  <Target size={9} />
                  <span>Confidence: {(test.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-slate-600">
                  <Clock size={9} />
                  <span>Gen {test.completedAt}</span>
                </div>
              </div>
            </div>
          ))}
          
          {abTestResults.length > 2 && (
            <div className="text-[9px] text-slate-500 text-center mt-2">
              +{abTestResults.length - 2} more tests
            </div>
          )}
        </div>
      )}

      {/* Transfer Summary Stats */}
      {abTestResults.length > 0 && (
        <div className="flex items-center justify-around mb-3 p-2 bg-slate-950/30 rounded border border-slate-800/50">
          <div className="text-center">
            <div className="text-[10px] text-slate-500">Tests Run</div>
            <div className="text-sm font-bold text-slate-300">{abTestResults.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-slate-500">Net Positive</div>
            <div className="text-sm font-bold text-emerald-400">
              {abTestResults.filter(t => t.isNetPositive).length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-slate-500">Avg Improvement</div>
            <div className="text-sm font-bold text-blue-400">
              {abTestResults.length > 0 
                ? `${(abTestResults.reduce((s, t) => s + (t.improvement.timeToThreshold + t.improvement.bestAchieved + t.improvement.regret) / 3, 0) / abTestResults.length).toFixed(1)}%`
                : '0%'
              }
            </div>
          </div>
        </div>
      )}

      {/* Cross-Pollination Events */}
      <div className="flex items-center gap-2 mb-2">
        <Share2 size={12} className="text-slate-500" />
        <span className="text-[10px] text-slate-500 uppercase">Transfer Events</span>
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
