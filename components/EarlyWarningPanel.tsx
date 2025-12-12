import React from 'react';
import { AlertTriangle, AlertCircle, Shield, Info, ChevronRight, TrendingDown, Clock, Target } from 'lucide-react';
import { FailureForecast, FailureBoundary, SystemState } from '../types';

interface EarlyWarningPanelProps {
  forecast: FailureForecast | null;
  boundaries: FailureBoundary[];
  systemState: SystemState | null;
  isRunning: boolean;
}

// Tooltip component for explanations
const Tooltip: React.FC<{
  content: string;
  children: React.ReactNode;
}> = ({ content, children }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  
  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-slate-800 text-slate-200 rounded-lg shadow-lg border border-slate-700 w-64 whitespace-normal">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      )}
    </div>
  );
};

// Risk level badge component
const RiskBadge: React.FC<{
  level: 'safe' | 'yellow' | 'red';
}> = ({ level }) => {
  const config = {
    safe: {
      bg: 'bg-emerald-900/30',
      border: 'border-emerald-500/50',
      text: 'text-emerald-400',
      icon: Shield,
      label: 'SAFE'
    },
    yellow: {
      bg: 'bg-amber-900/30',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      icon: AlertTriangle,
      label: 'CAUTION'
    },
    red: {
      bg: 'bg-red-900/30',
      border: 'border-red-500/50',
      text: 'text-red-400',
      icon: AlertCircle,
      label: 'DANGER'
    }
  };
  
  const { bg, border, text, icon: Icon, label } = config[level];
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${bg} ${border} border rounded-full`}>
      <Icon size={14} className={text} />
      <span className={`text-xs font-bold ${text}`}>{label}</span>
    </div>
  );
};

// Boundary proximity indicator
const BoundaryProximityBar: React.FC<{
  distance: number;  // 0-1, lower = closer to boundary
  boundary: FailureBoundary | null;
}> = ({ distance, boundary }) => {
  // Convert distance to proximity (0 = far, 1 = at boundary)
  const proximity = Math.max(0, Math.min(1, 1 - distance));
  
  // Determine color based on proximity
  const getColor = () => {
    if (proximity > 0.8) return 'bg-red-500';
    if (proximity > 0.5) return 'bg-amber-500';
    return 'bg-emerald-500';
  };
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-500">Boundary Distance</span>
        <span className="text-slate-400">{(distance * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor()} transition-all duration-300`}
          style={{ width: `${proximity * 100}%` }}
        />
      </div>
      {boundary && (
        <div className="text-[9px] text-slate-600">
          Nearest: {boundary.parameter} @ {boundary.criticalValue.toFixed(2)}
        </div>
      )}
    </div>
  );
};

// Metric display
const ForecastMetric: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tooltip: string;
}> = ({ label, value, icon, tooltip }) => (
  <Tooltip content={tooltip}>
    <div className="flex items-center gap-2 p-2 bg-slate-950/50 rounded border border-slate-800 cursor-help">
      <div className="text-slate-500">{icon}</div>
      <div>
        <div className="text-[9px] text-slate-500 uppercase">{label}</div>
        <div className="text-sm font-mono text-slate-300">{value}</div>
      </div>
    </div>
  </Tooltip>
);

const EarlyWarningPanel: React.FC<EarlyWarningPanelProps> = ({
  forecast,
  boundaries,
  systemState,
  isRunning
}) => {
  // No forecast available
  if (!forecast && !systemState) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={16} className="text-slate-500" />
          <h3 className="text-slate-400 font-semibold text-sm">Early Warning System</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-xs">
          <Shield size={32} className="mb-2 opacity-30" />
          <span>No forecast data available</span>
          <span className="text-[10px] text-slate-600 mt-1">Start simulation to enable forecasting</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className={
            forecast?.riskLevel === 'red' ? 'text-red-400 animate-pulse' :
            forecast?.riskLevel === 'yellow' ? 'text-amber-400' :
            'text-emerald-400'
          } />
          <h3 className="text-slate-200 font-semibold text-sm">Early Warning System</h3>
        </div>
        {forecast && <RiskBadge level={forecast.riskLevel} />}
      </div>
      
      {/* Warning Message */}
      {forecast && forecast.riskLevel !== 'safe' && (
        <div className={`mb-4 p-3 rounded-lg border ${
          forecast.riskLevel === 'red' 
            ? 'bg-red-900/20 border-red-500/30' 
            : 'bg-amber-900/20 border-amber-500/30'
        }`}>
          <div className={`text-xs font-bold mb-1 ${
            forecast.riskLevel === 'red' ? 'text-red-400' : 'text-amber-400'
          }`}>
            {forecast.riskLevel === 'red' ? '⚠️ RED ZONE - Forecasted Collapse' : '⚡ YELLOW ZONE - Approaching Boundary'}
          </div>
          <Tooltip content={forecast.warningReason}>
            <p className="text-[11px] text-slate-300 cursor-help">
              {forecast.warningReason.substring(0, 150)}{forecast.warningReason.length > 150 ? '...' : ''}
            </p>
          </Tooltip>
          <div className="mt-2 pt-2 border-t border-slate-700/50">
            <div className="text-[10px] text-slate-500 uppercase mb-1">Suggested Action</div>
            <p className="text-[11px] text-slate-400">{forecast.mitigationSuggestion}</p>
          </div>
        </div>
      )}
      
      {/* Safe Zone Message */}
      {forecast && forecast.riskLevel === 'safe' && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-900/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
            <Shield size={12} />
            <span>OPERATING WITHIN SAFE PARAMETERS</span>
          </div>
          <p className="text-[11px] text-slate-400">{forecast.warningReason}</p>
        </div>
      )}
      
      {/* Boundary Proximity */}
      {forecast && (
        <div className="mb-4">
          <BoundaryProximityBar 
            distance={forecast.boundaryDistance} 
            boundary={forecast.nearestBoundary}
          />
        </div>
      )}
      
      {/* Forecast Metrics */}
      {forecast && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <ForecastMetric 
            label="Expected Drop"
            value={`${(forecast.expectedDropDepth * 100).toFixed(1)}%`}
            icon={<TrendingDown size={12} />}
            tooltip={`Predicted fitness drop if boundary is crossed. Based on ${forecast.nearestBoundary?.observedCrossings || 0} historical observations.`}
          />
          <ForecastMetric 
            label="Recovery Time"
            value={`${forecast.expectedRecoveryTime} gens`}
            icon={<Clock size={12} />}
            tooltip={`Estimated generations to recover to 90% of pre-failure fitness. Assumes no additional interventions.`}
          />
          <ForecastMetric 
            label="Failure Mode"
            value={forecast.dominantFailureMode.split(':')[0]}
            icon={<AlertCircle size={12} />}
            tooltip={`Primary failure pattern: ${forecast.dominantFailureMode}. This determines how the system will degrade.`}
          />
          <ForecastMetric 
            label="Confidence"
            value={`${(forecast.confidenceScore * 100).toFixed(0)}%`}
            icon={<Target size={12} />}
            tooltip={`Prediction confidence based on historical data. Higher confidence means more reliable forecast.`}
          />
        </div>
      )}
      
      {/* Boundaries Summary */}
      {boundaries.length > 0 && (
        <div className="border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Known Boundaries</span>
            <span className="text-[10px] text-slate-600">{boundaries.length} detected</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {boundaries.slice(0, 5).map((boundary) => {
              const riskIcon = boundary.abruptnessScore > 0.7 ? '🔴' : 
                              boundary.abruptnessScore >= 0.4 ? '🟡' : '🟢';
              return (
                <Tooltip 
                  key={boundary.id}
                  content={`Parameter: ${boundary.parameter}, Critical value: ${boundary.criticalValue.toFixed(2)}, Historical drop: ${(boundary.historicalDropDepth * 100).toFixed(1)}%`}
                >
                  <div className="flex items-center justify-between p-1.5 bg-slate-950/30 rounded text-[10px] cursor-help hover:bg-slate-950/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{riskIcon}</span>
                      <span className="text-slate-400">{boundary.domain}</span>
                      <ChevronRight size={10} className="text-slate-600" />
                      <span className="text-slate-300">{boundary.parameter}</span>
                    </div>
                    <span className="text-slate-500">{(boundary.abruptnessScore * 100).toFixed(0)}%</span>
                  </div>
                </Tooltip>
              );
            })}
            {boundaries.length > 5 && (
              <div className="text-[10px] text-slate-600 text-center py-1">
                + {boundaries.length - 5} more boundaries
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-slate-600">
            {forecast ? `Updated: ${new Date(forecast.timestamp).toLocaleTimeString()}` : 'No forecast'}
          </span>
          <Tooltip content="LawForge does not prevent failure. It makes failure visible before it happens.">
            <span className="text-slate-500 cursor-help flex items-center gap-1">
              <Info size={10} />
              Phase III Forecasting
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default EarlyWarningPanel;
