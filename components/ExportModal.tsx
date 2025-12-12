import React, { useState } from 'react';
import { SOSGenome } from '../types';
import { generateOptimizerCode, generateMain, generateRequirements, generateDockerfile, generateReadme } from '../services/codeGenerator';
import { X, Copy, Check, FileCode, Server, Box, Container, FileText } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  genomes: Record<string, SOSGenome>;
}

type Tab = 'main' | 'requirements' | 'docker' | 'readme' | string;

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, genomes }) => {
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getCode = () => {
    if (activeTab === 'main') return generateMain(genomes);
    if (activeTab === 'requirements') return generateRequirements();
    if (activeTab === 'docker') return generateDockerfile();
    if (activeTab === 'readme') return generateReadme(genomes);
    if (genomes[activeTab]) return generateOptimizerCode(genomes[activeTab]);
    return '# Error generating code';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-xl">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-emerald-500/20 rounded-lg">
               <Box size={20} className="text-emerald-400" />
             </div>
             <div>
               <h2 className="text-lg font-bold text-white">Export to Production</h2>
               <p className="text-xs text-slate-400">Generates deployment-ready artifacts based on current evolution state.</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar Tabs */}
          <div className="w-64 bg-slate-950 border-r border-slate-800 p-2 space-y-1 overflow-y-auto">
             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 py-2 mt-2">Infrastructure</div>
             <button 
                onClick={() => setActiveTab('readme')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'readme' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' : 'text-slate-400 hover:bg-slate-800'}`}
             >
                <FileText size={14} /> README.md
             </button>
             <button 
                onClick={() => setActiveTab('docker')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'docker' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' : 'text-slate-400 hover:bg-slate-800'}`}
             >
                <Container size={14} /> Dockerfile
             </button>
             <button 
                onClick={() => setActiveTab('requirements')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'requirements' ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' : 'text-slate-400 hover:bg-slate-800'}`}
             >
                <Box size={14} /> requirements.txt
             </button>

             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 py-2 mt-4">Application</div>
             <button 
                onClick={() => setActiveTab('main')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === 'main' ? 'bg-purple-600/20 text-purple-400 border border-purple-600/50' : 'text-slate-400 hover:bg-slate-800'}`}
             >
                <Server size={14} /> main.py
             </button>
             
             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 py-2 mt-4">Optimizers (optimizers/)</div>
             {Object.values(genomes).map((g: SOSGenome) => (
               <button
                 key={g.domain}
                 onClick={() => setActiveTab(g.domain)}
                 className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors capitalize ${activeTab === g.domain ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'text-slate-400 hover:bg-slate-800'}`}
               >
                 <FileCode size={14} /> {g.domain}.py
               </button>
             ))}
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col bg-[#0d1117] relative">
            <div className="absolute top-4 right-4 z-10">
               <button 
                 onClick={handleCopy}
                 className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-xs transition-colors shadow-lg"
               >
                 {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                 {copied ? "Copied!" : "Copy Code"}
               </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed text-slate-300 selection:bg-blue-500/30">
                <pre><code>{getCode()}</code></pre>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExportModal;
