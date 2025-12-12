import { Law } from './types';

export const DOMAINS = ['faiss', 'compression', 'postgres', 'prompts'];

export const INITIAL_LAWS: Law[] = [
  {
    id: 'law-001',
    domain: 'faiss',
    description: 'HNSW M > 32 yields diminishing recall returns',
    confidence: 0.85,
    discoveredAt: 1
  },
  {
    id: 'law-002',
    domain: 'postgres',
    description: 'work_mem correlates linearly with hash_agg performance',
    confidence: 0.92,
    discoveredAt: 3
  }
];

export const MOCK_INSIGHTS = [
  "Emergent Strategy: Adaptive Gaussian sampling is outperforming Uniform.",
  "Parameter Drift: Alpha converging towards 2.8 for high-dimensional vector spaces.",
  "Law Discovery: New correlation found between compression_level and cpu_time.",
  "Meta-Learning: Increased mutation rate for static surrogates.",
  "System: Cross-pollinating Postgres laws to Redis domain."
];
