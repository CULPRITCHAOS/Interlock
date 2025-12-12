import { GoogleGenAI } from "@google/genai";
import { SOSGenome, CrossDomainInsight } from "../types";

// Initialize Gemini
// Note: In a real production app, API calls should be routed through a backend to hide the key.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Rate Limiting State
let isRateLimited = false;
let rateLimitResetTime = 0;

const checkRateLimit = () => {
  if (isRateLimited) {
    if (Date.now() < rateLimitResetTime) return true;
    isRateLimited = false;
  }
  return false;
};

const handleApiError = (error: any) => {
  const isQuota = error?.status === 429 || error?.code === 429 || error?.message?.includes("429") || error?.message?.includes("Quota");
  if (isQuota) {
    // console.warn("Gemini API Quota Exceeded. Switching to simulation mode for 60s.");
    isRateLimited = true;
    rateLimitResetTime = Date.now() + 60000;
  } else {
    // console.error("AI Service Error:", error);
  }
};

// Fallback Generators (Mock Data)
const getMockInsight = (genome: SOSGenome) => {
  const commonMsgs = [
      `Adjusting alpha ${genome.alpha.toFixed(2)} for better recall.`,
      `Converging on ${genome.sampleStrategy} strategy limits.`,
      `Detected local minima in search space.`,
      `Expanding exploration radius.`
  ];
  
  const domainMsgs: Record<string, string[]> = {
      faiss: [
          "Optimizing HNSW M parameter for lower latency.",
          "Quantization residuals decreasing.",
          "Vector index fragmentation detected.",
          "Recalibrating Voronoi cells."
      ],
      postgres: [
          "Autovacuum threshold adjusted dynamically.",
          "Buffer cache hit ratio stabilizing.",
          "WAL throughput optimized.",
          "Query plan regression detected."
      ],
      compression: [
          "Dictionary entropy maximized.",
          "Sliding window size adapted.",
          "Huffman tree depth rebalanced.",
          "Lossless ratio improved by 2%."
      ],
      prompts: [
          "Chain-of-thought density increased.",
          "Temperature sampling annealed.",
          "Context window utilization optimized.",
          "Token efficiency improved."
      ]
  };

  const specificMsgs = domainMsgs[genome.domain] || [];
  const allMsgs = [...commonMsgs, ...specificMsgs];
  return allMsgs[Math.floor(Math.random() * allMsgs.length)];
};

const getMockLaw = (genome: SOSGenome) => ({
  description: `${genome.domain} requires alpha > ${genome.alpha.toFixed(1)} for stability`,
  confidence: 0.75 + Math.random() * 0.15
});

const getMockCrossInsight = (source: SOSGenome, target: SOSGenome): CrossDomainInsight => ({
  id: Math.random().toString(36).substring(7),
  sourceDomain: source.domain,
  targetDomain: target.domain,
  strategy: source.sampleStrategy,
  impact: "Simulated transfer gain"
});

export async function generateSimulatedInsight(genome: SOSGenome): Promise<string> {
  if (checkRateLimit()) return getMockInsight(genome);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `
        You are the kernel of a "Self-Optimizing Software" (SOS) system.
        
        Current System State for Domain: ${genome.domain}
        - Strategy: ${genome.sampleStrategy}
        - Alpha: ${genome.alpha.toFixed(2)}
        - Fitness: ${genome.fitness.toFixed(3)}

        Generate a single, extremely concise (max 12 words) system log message.
        Use specific technical jargon related to ${genome.domain} (e.g. quantization for compression, WAL for postgres).
        
        Do not include quotes.
      `,
    });
    
    return response.text?.trim() || getMockInsight(genome);
  } catch (error) {
    handleApiError(error);
    return getMockInsight(genome);
  }
}

export async function generateDiscoveredLaw(genome: SOSGenome): Promise<{description: string, confidence: number}> {
  if (checkRateLimit()) return getMockLaw(genome);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: "application/json",
      },
      contents: `
        Generate a "Discovered Law" for an optimization system working on: "${genome.domain}".
        The law should describe a relationship between two technical parameters.
        
        Return JSON: { "description": "string (max 12 words)", "confidence": number (0.6 to 0.99) }
      `
    });
    
    const text = response.text;
    if (!text) throw new Error("No response");
    
    return JSON.parse(text);
  } catch (error) {
    handleApiError(error);
    return getMockLaw(genome);
  }
}

export async function generateCrossDomainInsight(source: SOSGenome, target: SOSGenome): Promise<CrossDomainInsight> {
  if (checkRateLimit()) return getMockCrossInsight(source, target);

  try {
    const response = await ai.models.generateContent({
       model: 'gemini-2.5-flash',
       config: { responseMimeType: 'application/json' },
       contents: `
         The optimizer for "${source.domain}" is performing better than "${target.domain}".
         We are transferring the "${source.sampleStrategy}" strategy from ${source.domain} to ${target.domain}.
         
         Generate a JSON object describing this transfer:
         {
           "strategy": "${source.sampleStrategy}",
           "impact": "Predicted Positive impact based on high-dimensional similarity"
         }
         Keep impact string under 10 words.
       `
    });
    
    const data = JSON.parse(response.text || '{}');
    
    return {
        id: Math.random().toString(36).substring(7),
        sourceDomain: source.domain,
        targetDomain: target.domain,
        strategy: source.sampleStrategy,
        impact: data.impact || "High transfer potential detected"
    };
  } catch (error) {
      handleApiError(error);
      return getMockCrossInsight(source, target);
  }
}
