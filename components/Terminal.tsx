import React, { useRef, useEffect } from 'react';
import { SimulationLog } from '../types';

interface TerminalProps {
  logs: SimulationLog[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col h-64 font-mono text-xs">
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
        <span className="text-slate-400 font-semibold">sos_master.py - Output</span>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
        </div>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3">
            <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
            <span className={`
              ${log.level === 'info' ? 'text-slate-300' : ''}
              ${log.level === 'success' ? 'text-emerald-400' : ''}
              ${log.level === 'warning' ? 'text-amber-400' : ''}
              ${log.level === 'system' ? 'text-blue-400 font-bold' : ''}
            `}>
              {log.level === 'system' && '> '}
              {log.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default Terminal;
