import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChartDataPoint } from '../types';
import { DOMAINS } from '../constants';

interface ChartsProps {
  data: ChartDataPoint[];
}

const COLORS = {
  faiss: '#10b981',      // Emerald
  compression: '#3b82f6', // Blue
  postgres: '#a855f7',    // Purple
  prompts: '#f59e0b',     // Amber
};

type ViewMode = 'fitness' | 'alpha';

const CustomTooltip = ({ active, payload, label, mode }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl text-xs">
        <p className="text-slate-300 font-bold mb-2">Gen {label}</p>
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center justify-between gap-4 mb-1">
            <span style={{ color: entry.color }} className="capitalize font-semibold">
              {entry.name.replace(`_${mode}`, '')}:
            </span>
            <span className="text-slate-200 font-mono">{entry.value.toFixed(4)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const Charts: React.FC<ChartsProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('fitness');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-64 flex flex-col relative">
      <div className="flex items-center justify-between mb-4 ml-2">
        <h3 className="text-slate-400 text-xs uppercase font-bold">
          {viewMode === 'fitness' ? 'Tournament Trajectory (Fitness)' : 'Parameter Evolution (Alpha)'}
        </h3>
        
        <div className="flex bg-slate-950 rounded-lg border border-slate-800 p-0.5">
          <button 
            onClick={() => setViewMode('fitness')}
            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
              viewMode === 'fitness' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            FITNESS
          </button>
          <button 
             onClick={() => setViewMode('alpha')}
             className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
               viewMode === 'alpha' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-500 hover:text-slate-300'
             }`}
          >
            ALPHA
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="generation" 
              stroke="#475569" 
              tick={{fontSize: 10}}
              tickLine={false}
            />
            <YAxis 
              stroke="#475569" 
              tick={{fontSize: 10}} 
              tickLine={false}
              domain={viewMode === 'fitness' ? [0, 1] : [0, 6]} 
            />
            <Tooltip content={(props) => <CustomTooltip {...props} mode={viewMode} />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
            
            {DOMAINS.map((domain) => (
              <Line 
                key={domain}
                type="monotone" 
                dataKey={viewMode === 'fitness' ? domain : `${domain}_alpha`} 
                name={domain}
                stroke={COLORS[domain as keyof typeof COLORS] || '#fff'} 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false} 
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default Charts;
