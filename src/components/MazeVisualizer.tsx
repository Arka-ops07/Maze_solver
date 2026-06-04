import { useEffect, useRef } from 'react';
import { Cell, BotState } from '../types';
import { GRID_SIZE, DX, DY } from '../utils';

interface MazeVisualizerProps {
  title: string;
  mazeData: number[][] | null; // Real maze
  botMapData: Cell[][] | null; // Bot memory Map
  botState: BotState;
  shortestPath: { x: number; y: number }[];
  isReal: boolean;
  highlightPath: boolean;
}

export default function MazeVisualizer({
  title,
  mazeData,
  botMapData,
  botState,
  shortestPath,
  isReal,
  highlightPath,
}: MazeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const CELL_SIZE = 30; // 480 / 16
  const CANVAS_WIDTH = 480;
  const CANVAS_HEIGHT = 480;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background with dark sci-fi finish
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Minor grid lines for tech appearance
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, CANVAS_HEIGHT);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * CELL_SIZE);
        ctx.lineTo(CANVAS_WIDTH, i * CELL_SIZE);
        ctx.stroke();
    }

    // Highlighting goals and start
    const goals = [[7, 7], [7, 8], [8, 7], [8, 8]];

    // Draw Starting Area (0, 15)
    ctx.fillStyle = 'rgba(0, 255, 136, 0.08)';
    ctx.fillRect(0 * CELL_SIZE, 15 * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0 * CELL_SIZE + 2, 15 * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);

    // Draw goals center 2x2
    ctx.fillStyle = isReal ? 'rgba(0, 255, 136, 0.08)' : 'rgba(0, 255, 136, 0.12)';
    goals.forEach(([gx, gy]) => {
      ctx.fillRect(gx * CELL_SIZE, gy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    });

    // Draw cells
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cellX = x * CELL_SIZE;
        const cellY = y * CELL_SIZE;

        if (isReal && mazeData && mazeData[y] && mazeData[y][x] !== undefined) {
          const walls = mazeData[y][x];
          
          // Draw wall lines
          ctx.strokeStyle = '#333333'; // Sharp dark grey for real walls in high density
          ctx.lineWidth = 2.5;

          if (walls & 1) drawLine(ctx, cellX, cellY, cellX + CELL_SIZE, cellY); // North
          if (walls & 2) drawLine(ctx, cellX + CELL_SIZE, cellY, cellX + CELL_SIZE, cellY + CELL_SIZE); // East
          if (walls & 4) drawLine(ctx, cellX, cellY + CELL_SIZE, cellX + CELL_SIZE, cellY + CELL_SIZE); // South
          if (walls & 8) drawLine(ctx, cellX, cellY, cellX, cellY + CELL_SIZE); // West
          
        } else if (!isReal && botMapData && botMapData[y] && botMapData[y][x] !== undefined) {
          const cell = botMapData[y][x];

          if (!cell.known) {
            // Unexplored cells overlay (solid deep black)
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(cellX + 1, cellY + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            continue;
          }

          // Distances text
          if (cell.dist !== 255) {
            ctx.fillStyle = 'rgba(0, 255, 136, 0.45)';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.dist.toString(), cellX + CELL_SIZE / 2, cellY + CELL_SIZE / 2);
          }

          // Active wall sensors and mapped layout
          const walls = cell.walls;
          ctx.strokeStyle = '#00ff88'; // Sharp glowing neon green for explored digital twin walls
          ctx.lineWidth = 2.5;

          // Add heavy shadow glow to digital walls
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#00ff88';

          if (walls & 1) drawLine(ctx, cellX, cellY, cellX + CELL_SIZE, cellY); // North
          if (walls & 2) drawLine(ctx, cellX + CELL_SIZE, cellY, cellX + CELL_SIZE, cellY + CELL_SIZE); // East
          if (walls & 4) drawLine(ctx, cellX, cellY + CELL_SIZE, cellX + CELL_SIZE, cellY + CELL_SIZE); // South
          if (walls & 8) drawLine(ctx, cellX, cellY, cellX, cellY + CELL_SIZE); // West

          // Reset shadow
          ctx.shadowBlur = 0;
        }
      }
    }

    // Draw center goal holograms/circles
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(8 * CELL_SIZE, 8 * CELL_SIZE, CELL_SIZE, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GOAL', 8 * CELL_SIZE, 8 * CELL_SIZE + 2);

    // Draw planning path overlay
    if (highlightPath && shortestPath && shortestPath.length > 0) {
      ctx.strokeStyle = isReal ? '#f59e0b' : '#00ffd5'; // Gold for real path, Cyan for digital
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // Glow for trail
      ctx.shadowBlur = 8;
      ctx.shadowColor = isReal ? '#f59e0b' : '#00ffd5';

      ctx.beginPath();
      shortestPath.forEach((pt, idx) => {
        const px = pt.x * CELL_SIZE + CELL_SIZE / 2;
        const py = pt.y * CELL_SIZE + CELL_SIZE / 2;
        if (idx === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;

      // Draw tiny node dots along path
      ctx.fillStyle = isReal ? '#ffffff' : '#00ffd5';
      shortestPath.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x * CELL_SIZE + CELL_SIZE / 2, pt.y * CELL_SIZE + CELL_SIZE / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw Micromouse Bot
    ctx.save();
    
    // Scale real-time simulation position from state
    // Let's draw at current pixel positions
    ctx.translate(botState.pixelX, botState.pixelY);
    ctx.rotate(botState.angle);

    // Draw Bot Chassis (circular saucer body with styled metallic wings)
    const radius = 10;
    
    // Core body base
    ctx.fillStyle = botState.state === 'SPEED_RUNNING' ? '#0d1527' : '#091e16';
    ctx.strokeStyle = botState.state === 'SPEED_RUNNING' ? '#f59e0b' : '#10b981';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = botState.state === 'SPEED_RUNNING' ? '#f59e0b' : '#10b981';
    
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw tires/wheels
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-8, -radius - 1.5, 4, 3); // Left tire
    ctx.fillRect(-8, radius - 1.5, 4, 3); // Right tire

    // Distinct Arrow pointing to front (North relative to angle)
    ctx.fillStyle = botState.state === 'SPEED_RUNNING' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)';
    ctx.beginPath();
    ctx.moveTo(radius - 2, 0);
    ctx.lineTo(-2, -5);
    ctx.lineTo(-2, 5);
    ctx.closePath();
    ctx.fill();

    // Headlights (glowing in front)
    ctx.fillStyle = botState.movingForward ? '#00ffd5' : 'rgba(0,255,213,0.15)';
    ctx.beginPath();
    ctx.arc(radius - 1, -4, 2, 0, Math.PI * 2); // Left headlights
    ctx.arc(radius - 1, 4, 2, 0, Math.PI * 2);  // Right headlights
    ctx.fill();

    // Reversing Taillights (sharp red if backing up, dim red if forward)
    ctx.fillStyle = !botState.movingForward ? '#ef4444' : 'rgba(239, 68, 68, 0.25)';
    ctx.beginPath();
    ctx.arc(-radius + 1, -3, 1.8, 0, Math.PI * 2); // Left tail
    ctx.arc(-radius + 1, 3, 1.8, 0, Math.PI * 2);  // Right tail
    ctx.fill();

    // Gear indicator labels on top of the bot
    ctx.restore();

    // Floating Gear HUD next to bot
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    const gearText = botState.movingForward ? 'D' : 'R';
    const gearColor = botState.movingForward ? '#10b981' : '#f43f5e';
    ctx.fillStyle = gearColor;
    ctx.fillText(`${gearText}`, botState.pixelX + 13, botState.pixelY - 10);

  }, [mazeData, botMapData, botState, shortestPath, isReal, highlightPath]);

  function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  return (
    <div className="flex flex-col items-center bg-[#0a0a0a]/90 border border-[#222222] rounded p-2.5 shadow-none w-full">
      <div className="flex items-center justify-between w-full border-b border-[#111111] pb-1.5 mb-2">
        <h4 className="font-mono text-[10px] font-bold text-[#00ff88] uppercase tracking-wider">
          {title}
        </h4>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_6px_#00ff88] animate-pulse"></span>
          <span className="font-mono text-[9px] text-neutral-500 uppercase tracking-tight">Interactive Screen</span>
        </div>
      </div>
      <div className="relative w-full max-w-[480px] aspect-square rounded-sm overflow-hidden border border-[#111111]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full bg-[#050505] block pointer-events-none"
        />
      </div>
    </div>
  );
}
