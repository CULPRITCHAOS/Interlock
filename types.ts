export interface SOSGenome {
  id: string;
  generation: number;
  domain: string;
  alpha: number; // P(valid) exponent
  explorationBonus: number;
  sampleStrategy: 'uniform' | 'gaussian' | 'adaptive' | 'exploit';
  ridgeAlpha: number;
  fitness: number;
  originDomain?: string; // Tracks where the strategy came from
}

export interface Law {
  id: string;
  domain: string;
  description: string;
  confidence: number;
  discoveredAt: number; // generation
  isUniversal?: boolean; // True if law applies across domains
}

export interface SimulationLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'system' | 'transfer';
  message: string;
}

export interface ChartDataPoint {
  generation: number;
  [key: string]: number; // Allow dynamic access for domains (faiss, postgres, etc.)
}

export interface CrossDomainInsight {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  strategy: string;
  impact: string; // "Positive" | "Neutral" | "Negative"
}
