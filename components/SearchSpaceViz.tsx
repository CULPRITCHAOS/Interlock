import React, { useEffect, useRef } from 'react';
import { SOSGenome } from '../types';

interface SearchSpaceVizProps {
  genome: SOSGenome;
  isRunning: boolean;
  target: { x: number, y: number }; // Now accepts a dynamic target
}

const SearchSpaceViz: React.FC<SearchSpaceVizProps> = ({ genome, isRunning, target }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const particlesRef = useRef<{x: number, y: number}[]>([]);
  
  // Animate Particles & Landscape
  useEffect(() => {
    if (!isRunning) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Helper to draw heatmap
    const drawLandscape = (width: number, height: number, targetX: number, targetY: number) => {
        // We only redraw landscape periodically or if target shifts significantly to save perf?
        // For smoothness, let's draw it every frame but optimize.
        // Actually, let's just draw "blobs" for the target instead of per-pixel for perf in this loop
        
        // Clear with fade for trails
        ctx.fillStyle = 'rgba(2, 6, 23, 0.25)'; // Dark slate with opacity
        ctx.fillRect(0, 0, width, height);

        // Draw Target "Gravity Well" (The Peak)
        const gradient = ctx.createRadialGradient(
            targetX * width, targetY * height, 0,
            targetX * width, targetY * height, width * 0.4
        );
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)'); // Emerald center
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');   // Transparent edge
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Draw Contour Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(targetX * width, targetY * height, width * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(targetX * width, targetY * height, width * 0.2, 0, Math.PI * 2);
        ctx.stroke();
    };

    const animate = () => {
      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw Background/Landscape
      drawLandscape(width, height, target.x, target.y);
      
      // 2. Update Particles based on Strategy
      const strategy = genome.sampleStrategy;
      
      // Initialize or replenish particles
      if (particlesRef.current.length < 50 || Math.random() > 0.92) {
          const newParticles = [];
          for(let i=0; i<50; i++) {
              let x, y;
              
              if (strategy === 'uniform') {
                  x = Math.random();
                  y = Math.random();
              } else if (strategy === 'gaussian') {
                  // Cluster around target with some variance based on fitness
                  const variance = Math.max(0.1, 0.5 - (genome.fitness * 0.4));
                  // Add some lag/noise so they don't instantly teleport to new target
                  x = target.x + (Math.random() - 0.5) * variance;
                  y = target.y + (Math.random() - 0.5) * variance;
              } else if (strategy === 'exploit') {
                  const variance = 0.05;
                  x = target.x + (Math.random() - 0.5) * variance;
                  y = target.y + (Math.random() - 0.5) * variance;
              } else {
                  // Adaptive
                   x = Math.random() > 0.5 ? target.x + (Math.random()-0.5)*0.2 : Math.random();
                   y = Math.random() > 0.5 ? target.y + (Math.random()-0.5)*0.2 : Math.random();
              }
              newParticles.push({x: x * width, y: y * height});
          }
          particlesRef.current = newParticles;
      }

      // 3. Draw Particles
      particlesRef.current.forEach(p => {
          ctx.beginPath();
          ctx.fillStyle = genome.domain === 'faiss' ? '#10b981' : 
                          genome.domain === 'compression' ? '#3b82f6' :
                          genome.domain === 'postgres' ? '#a855f7' : '#f59e0b';
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Movement Logic
          // In a viz, we just jitter them. Real movement logic is complex.
          // To make it look like "chasing" the target:
          const dx = (target.x * width) - p.x;
          const dy = (target.y * height) - p.y;
          
          // Strategy affects movement speed towards optima
          const speed = strategy === 'exploit' ? 0.05 : 
                        strategy === 'gaussian' ? 0.02 : 0.005;

          if (strategy !== 'uniform') {
            p.x += dx * speed + (Math.random() - 0.5) * 2;
            p.y += dy * speed + (Math.random() - 0.5) * 2;
          } else {
            p.x += (Math.random() - 0.5) * 4;
            p.y += (Math.random() - 0.5) * 4;
          }
      });

      // Draw Info Overlay
      ctx.fillStyle = 'white';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText(`STRATEGY: ${strategy.toUpperCase()}`, 10, 20);
      ctx.fillText(`TARGET: (${target.x.toFixed(2)}, ${target.y.toFixed(2)})`, 10, 35);
      
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameRef.current);
  }, [genome, isRunning, target]);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <canvas 
        ref={canvasRef} 
        width={350} 
        height={250} 
        className="w-full h-full object-cover"
      />
      
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent opacity-20 pointer-events-none animate-scan" />
      
      <div className="absolute bottom-2 right-2 text-[10px] font-mono text-slate-500 bg-slate-900/80 px-1 rounded flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        Live Kernel View
      </div>
    </div>
  );
};

export default SearchSpaceViz;
