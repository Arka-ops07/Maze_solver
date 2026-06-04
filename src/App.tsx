/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  RotateCcw,
  Sparkles,
  Award,
  Zap,
  Gauge,
  HelpCircle,
  Cpu,
  Layers,
  ArrowRightLeft,
  Search,
  Sliders,
  Settings,
  ChevronRight,
  Info
} from 'lucide-react';
import { Cell, BotState, LogMessage, PathAction, MazePreset } from './types';
import {
  generateMaze,
  runFloodFill,
  runFloodFillToStart,
  solveDijkstra,
  compressPath,
  GRID_SIZE,
  DX,
  DY,
  WALL_BITS,
  inBounds
} from './utils';
import MazeVisualizer from './components/MazeVisualizer';
import ConsoleLogs from './components/ConsoleLogs';

export default function App() {
  // UI Reactive States
  const [phase, setPhase] = useState<'EXPLORE_TO_GOAL' | 'EXPLORE_RETURN' | 'SOLVED' | 'SPEEDRUN' | 'READY'>('READY');
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [preset, setPreset] = useState<MazePreset>('DEFAULT_DFS');
  const [exploreMode, setExploreMode] = useState<'TO_GOAL' | 'FULL_MAPPING'>('FULL_MAPPING');
  
  // Stats for HUD
  const [stepsCount, setStepsCount] = useState(0);
  const [distanceRemaining, setDistanceRemaining] = useState(255);
  const [activeGear, setActiveGear] = useState<'D' | 'R'>('D');
  const [currentSpeedCellsPerSec, setCurrentSpeedCellsPerSec] = useState(0);
  const [turnsCount, setTurnsCount] = useState(0);
  const [solvedLength, setSolvedLength] = useState(0);

  // Pathing Outcomes
  const [shortestPathCells, setShortestPathCells] = useState<{ x: number; y: number }[]>([]);
  const [compressedPathActions, setCompressedPathActions] = useState<PathAction[]>([]);
  const [activeActionIndex, setActiveActionIndex] = useState<number>(-1);

  // Sliders/Configs
  const [motorVelocity, setMotorVelocity] = useState(30); // pixels/frame motion speed (controls speed of physical representation)
  const [backtrackMultiplier, setBacktrackMultiplier] = useState(1.8); // reverse backtrack speed boost multiplier
  const [scanLatency, setScanLatency] = useState(15); // frame ticks paused on each cell center to perform scans (0 = instant)
  const [gforceTurnMultiplier, setGforceTurnMultiplier] = useState(0.65); // speed damping coefficient during rotation/turn steps

  // Direct Refs to evade React closures in the paint Loop
  const mazeRef = useRef<number[][]>([]);
  const botMapRef = useRef<Cell[][]>([]);
  const botRef = useRef<BotState>({
    gridX: 0,
    gridY: 15,
    pixelX: 15,
    pixelY: 480 - 15,
    angle: -Math.PI / 2, // Facing North
    dir: 0,
    movingForward: true,
    state: 'IDLE',
    speedIndex: 0,
  });

  // State loop references
  const animFrameIdRef = useRef<number | null>(null);
  const sleepTicksRef = useRef<number>(0);
  const targetXRef = useRef<number>(0);
  const targetYRef = useRef<number>(0);
  const explorationGoalRef = useRef<'CENTER' | 'START'>('CENTER');
  const previousCellRef = useRef<{ x: number; y: number }>({ x: 0, y: 15 });

  const CELL_SIZE = 30;

  // Initialize System on load
  useEffect(() => {
    handleHardReset(preset);
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, []);

  // Sync preset change
  const handlePresetChange = (newPreset: MazePreset) => {
    setPreset(newPreset);
    handleHardReset(newPreset);
  };

  // Push diagnostic log
  const pushLog = (type: LogMessage['type'], text: string) => {
    const now = new Date();
    const minStr = String(now.getMinutes()).padStart(2, '0');
    const secStr = String(now.getSeconds()).padStart(2, '0');
    const msStr = String(now.getMilliseconds()).padStart(3, '0');
    const timestamp = `${minStr}:${secStr}.${msStr}`;

    const newLog: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      type,
      text,
    };
    setLogs((prev) => [...prev, newLog].slice(-100)); // Maintain last 100 logs
  };

  // Update starting positions
  const handleHardReset = (targetPreset: MazePreset = preset) => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    // Generate Mazes
    const realGrid = generateMaze(targetPreset);
    mazeRef.current = realGrid;

    // Initialize bot digital memory with boundaries in botMap
    const botMap: Cell[][] = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from({ length: GRID_SIZE }, (_, x) => {
        let walls = 0;
        // Outer boundaries are known natively
        if (y === 0) walls |= 1;
        if (x === GRID_SIZE - 1) walls |= 2;
        if (y === GRID_SIZE - 1) walls |= 4;
        if (x === 0) walls |= 8;

        return {
          x,
          y,
          walls,
          known: false,
          dist: 255,
        };
      })
    );

    botMapRef.current = botMap;

    // Position Bot at Starting square (0, 15) facing North
    botRef.current = {
      gridX: 0,
      gridY: 15,
      pixelX: CELL_SIZE / 2,
      pixelY: 480 - CELL_SIZE / 2,
      angle: -Math.PI / 2,
      dir: 0,
      movingForward: true,
      state: 'IDLE',
      speedIndex: 0,
    };

    targetXRef.current = CELL_SIZE / 2;
    targetYRef.current = 480 - CELL_SIZE / 2;
    explorationGoalRef.current = 'CENTER';
    previousCellRef.current = { x: 0, y: 15 };
    sleepTicksRef.current = 0;

    // Reset stats
    setStepsCount(0);
    setTurnsCount(0);
    setDistanceRemaining(255);
    setActiveGear('D');
    setCurrentSpeedCellsPerSec(0);
    setSolvedLength(0);
    setShortestPathCells([]);
    setCompressedPathActions([]);
    setActiveActionIndex(-1);
    setPhase('READY');
    setLogs([]);

    pushLog('SYSTEM', `System Initialized. Loaded Maze Preset: [${targetPreset}]`);
    pushLog('EXPLORE', `Position set to Start (0, 15). Ready for Phase 1.`);

    // Run first flood fill with empty map
    runFloodFill(botMap);
    setDistanceRemaining(botMap[15][0].dist);

    // Boot the engine's animation tick
    runEngine();
  };

  // Perform symmetrical scanning of cell walls
  const scanCurrentCell = (x: number, y: number) => {
    if (!inBounds(x, y)) return;
    
    // Copy real wall characteristics
    const walls = mazeRef.current[y][x];
    const botCell = botMapRef.current[y][x];
    
    if (botCell.known) return; // Already scanned

    botCell.walls = walls;
    botCell.known = true;
    
    // Push updates symmetrically to adjacent neighbors
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (inBounds(nx, ny)) {
        if (walls & WALL_BITS[d]) {
          botMapRef.current[ny][nx].walls |= WALL_BITS[(d + 2) % 4];
        } else {
          botMapRef.current[ny][nx].walls &= ~WALL_BITS[(d + 2) % 4];
        }
      }
    }

    pushLog('EXPLORE', `Scanned [${x}, ${y}]. Found walls mask [${walls}] (N:${walls&1?'1':'0'} E:${walls&2?'1':'0'} S:${walls&4?'1':'0'} W:${walls&8?'1':'0'})`);
  };

  // Start exploration mapping
  const startExploration = () => {
    if (botRef.current.state !== 'IDLE' && botRef.current.state !== 'FINISHED') return;

    pushLog('SYSTEM', `Phase 1 initiated. Path exploration mode: [${exploreMode}]`);
    
    // Scan root cell immediately
    scanCurrentCell(0, 15);
    if (explorationGoalRef.current === 'CENTER') {
      runFloodFill(botMapRef.current);
    } else {
      runFloodFillToStart(botMapRef.current);
    }

    botRef.current.state = 'EXPLORING';
    setPhase('EXPLORE_TO_GOAL');
    
    // Determine the next cell move
    decideNextExplorationMove();
  };

  // Decide next step in exploration using flood fill values
  const decideNextExplorationMove = () => {
    const bot = botRef.current;
    const botMap = botMapRef.current;
    const cx = bot.gridX;
    const cy = bot.gridY;

    // Check if goal conditions are reached
    if (explorationGoalRef.current === 'CENTER') {
      const reachedGoal = (cx === 7 || cx === 8) && (cy === 7 || cy === 8);
      if (reachedGoal) {
        pushLog('EXPLORE', `SUCCESS: Center goal reached at cell [${cx}, ${cy}].`);
        
        if (exploreMode === 'FULL_MAPPING') {
          pushLog('GEAR', `Re-solving flood-fill target to START cell (0, 15) for full mapping.`);
          explorationGoalRef.current = 'START';
          setPhase('EXPLORE_RETURN');
          runFloodFillToStart(botMap);
          decideNextExplorationMove();
        } else {
          // Finish and trigger solver optimization
          bot.state = 'IDLE';
          setPhase('SOLVED');
          pushLog('SYSTEM', `Exploration Finished. Solver ready to Dijkstra and Compress path.`);
          planShortestPath();
        }
        return;
      }
    } else if (explorationGoalRef.current === 'START') {
      if (cx === 0 && cy === 15) {
        pushLog('EXPLORE', `SUCCESS: Returned back to START point! Maze mapped.`);
        bot.state = 'IDLE';
        setPhase('SOLVED');
        pushLog('SYSTEM', `Complete bidirectional mapping finished. Solver optimized.`);
        planShortestPath();
        return;
      }
    }

    // Extract next valid neighbors
    let bestNeighbor: { nx: number; ny: number; d: number; dist: number } | null = null;
    let minTurnOverhead = Infinity;

    for (let d = 0; d < 4; d++) {
      // Is there NO wall in direction d?
      if (!(botMap[cy][cx].walls & WALL_BITS[d])) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];

        if (inBounds(nx, ny)) {
          const neighborDist = botMap[ny][nx].dist;
          const currentDist = botMap[cy][cx].dist;

          // Standard flood-fill: we move to a neighbor of smaller flood distance
          if (neighborDist < currentDist) {
            // Bidirectional State check to minimize unnecessary rotations
            // Option 1: Face Forward (Body dir = d, gear = Forward)
            const forwardTurn = (d - bot.dir + 4) % 4;
            const forwardRot = forwardTurn === 3 ? 90 : forwardTurn * 90;

            // Option 2: Face Reverse (Body dir = (d+2)%4, gear = Reverse)
            const reverseTurn = (((d + 2) % 4) - bot.dir + 4) % 4;
            const reverseRot = reverseTurn === 3 ? 90 : reverseTurn * 90;

            // Compute actual rotation needed
            const turnCost = Math.min(Math.abs(forwardRot), Math.abs(reverseRot));

            // Select best neighbor
            if (neighborDist < (bestNeighbor?.dist ?? Infinity)) {
              bestNeighbor = { nx, ny, d, dist: neighborDist };
              minTurnOverhead = turnCost;
            } else if (neighborDist === (bestNeighbor?.dist ?? Infinity)) {
              // Tiebreak by choosing path of least turn rotation
              if (turnCost < minTurnOverhead) {
                bestNeighbor = { nx, ny, d, dist: neighborDist };
                minTurnOverhead = turnCost;
              }
            }
          }
        }
      }
    }

    if (bestNeighbor) {
      const { nx, ny, d } = bestNeighbor;
      
      // Calculate bidirectional drive selection
      const rotForward = (d - bot.dir + 4) % 4;
      const turnForwardAngle = rotForward === 3 ? -90 : rotForward * 90;

      const rotReverse = (((d + 2) % 4) - bot.dir + 4) % 4;
      const turnReverseAngle = rotReverse === 3 ? -90 : rotReverse * 90;

      let nextBodyDir: number = bot.dir;
      let nextGear: boolean = true;
      let rotMsg = "";

      const absF = Math.abs(turnForwardAngle);
      const absR = Math.abs(turnReverseAngle);

      if (absF < absR) {
        nextBodyDir = d;
        nextGear = true;
        if (absF > 0) rotMsg = `Turn ${turnForwardAngle}° to face [${d}]`;
      } else if (absR < absF) {
        nextBodyDir = (d + 2) % 4;
        nextGear = false;
        rotMsg = `SHIFTS TO REVERSE GEAR. Body facing [${nextBodyDir}] (Reverse movement)`;
      } else {
        // Equal rotation required (usually 90 degree Left or Right).
        // Break tie by keeping the current gear
        if (bot.movingForward === false) {
          nextBodyDir = (d + 2) % 4;
          nextGear = false;
          rotMsg = `Kept REVERSE GEAR. Body facing [${nextBodyDir}]`;
        } else {
          nextBodyDir = d;
          nextGear = true;
          if (absF > 0) rotMsg = `Turn ${turnForwardAngle}° to face [${d}]`;
        }
      }

      // Record logs if rotation or gear shifts
      if (rotMsg) {
        if (!nextGear && bot.movingForward !== nextGear) {
          pushLog('GEAR', `[HEAD-FLIP REVERSE GEAR ACTIVE] -> Backtracking into [${nx}, ${ny}]`);
        } else if (rotMsg.includes('Turn')) {
          pushLog('SYSTEM', `${rotMsg} for grid transit.`);
          setTurnsCount((prev) => prev + 1);
        }
      }

      // Update bot target cell positions and gears
      previousCellRef.current = { x: cx, y: cy };
      bot.gridX = nx;
      bot.gridY = ny;
      bot.dir = nextBodyDir as any;
      bot.angle = (nextBodyDir * Math.PI / 2) - Math.PI / 2;
      bot.movingForward = nextGear;
      
      setActiveGear(nextGear ? 'D' : 'R');

      // Set target pixel locations for canvas motion
      targetXRef.current = nx * CELL_SIZE + CELL_SIZE / 2;
      targetYRef.current = ny * CELL_SIZE + CELL_SIZE / 2;
      
      // Reset Sleep timer to trigger sensor scans on arrival
      sleepTicksRef.current = scanLatency;
    } else {
      // Unreachable path fallback. Force Flood Fill calculations to rebuild paths
      pushLog('ERROR', `Path exploration blocked at [${cx}, ${cy}]. Recalculating BFS routes.`);
      runFloodFill(botMap);
      setDistanceRemaining(botMap[cy][cx].dist);
    }
  };

  // Dijkstra + Bidirectional Compression Compilation
  const planShortestPath = () => {
    pushLog('SYSTEM', `Planning Dijkstra shortest-path utilizing bot's mapped memory...`);
    const path = solveDijkstra(botMapRef.current);
    
    if (path.length === 0) {
      pushLog('ERROR', `Failed to resolve any pathway to goals from mapped coordinates!`);
      return;
    }

    setShortestPathCells(path);
    setSolvedLength(path.length - 1);
    pushLog('SYSTEM', `Shortest path solved! Grid distance: ${path.length - 1} cells.`);

    // Compress turns into commands
    const actions = compressPath(path);
    setCompressedPathActions(actions);
    
    const commandStr = actions.map((act) => `${act.gear === 'R' ? 'R-' : ''}${act.type}${act.val}`).join(' ➔ ');
    pushLog('COMPRESSION', `Optimized commands: [ ${commandStr} ]`);
    pushLog('COMPRESSION', `Path Compressed! Reduced path coordinates into ${actions.length} motion actions.`);
    setPhase('SOLVED');
  };

  // Speed Run Launcher
  const startSpeedRun = () => {
    if (shortestPathCells.length === 0) {
      pushLog('ERROR', `No optimized path available. Scan and solve first.`);
      return;
    }

    pushLog('SPEEDRUN', `🚨 SPEED RUN LAUNCHED. Adjusting thrust thresholds...`);
    
    // Reset Bot to start position (0, 15) facing North
    const bot = botRef.current;
    bot.gridX = 0;
    bot.gridY = 15;
    bot.pixelX = CELL_SIZE / 2;
    bot.pixelY = 480 - CELL_SIZE / 2;
    bot.angle = -Math.PI / 2;
    bot.dir = 0;
    bot.movingForward = true;
    bot.state = 'SPEED_RUNNING';
    bot.speedIndex = 0;

    targetXRef.current = CELL_SIZE / 2;
    targetYRef.current = 480 - CELL_SIZE / 2;
    sleepTicksRef.current = 0;
    
    setStepsCount(0);
    setPhase('SPEEDRUN');
    setActiveActionIndex(0);

    // Compute active current action
    deployNextSpeedRunStep();
  };

  // Handle step-by-step progress during Speed Run
  const deployNextSpeedRunStep = () => {
    const bot = botRef.current;
    
    if (bot.speedIndex >= shortestPathCells.length - 1) {
      bot.state = 'FINISHED';
      setPhase('SOLVED');
      setActiveActionIndex(-1);
      pushLog('SPEEDRUN', `🏆 SPEED RUN SUCCESS! Reached G-center. Navigation timeline complete.`);
      return;
    }

    // Fetch the target cell coord
    const nextIdx = bot.speedIndex + 1;
    const nextCell = shortestPathCells[nextIdx];
    
    const cx = bot.gridX;
    const cy = bot.gridY;
    const nx = nextCell.x;
    const ny = nextCell.y;

    // Detect direction of travel
    let d = 0;
    if (nx > cx) d = 1;
    else if (ny > cy) d = 2;
    else if (nx < cx) d = 3;

    // Calculate bidirectional gear & rotation
    const rotF = (d - bot.dir + 4) % 4;
    const turnF = rotF === 3 ? -90 : rotF * 90;

    const rotR = (((d + 2) % 4) - bot.dir + 4) % 4;
    const turnR = rotR === 3 ? -90 : rotR * 90;

    let nextBodyDir = bot.dir;
    let nextGear = true;

    if (Math.abs(turnF) < Math.abs(turnR)) {
      nextBodyDir = d;
      nextGear = true;
    } else if (Math.abs(turnR) < Math.abs(turnF)) {
      nextBodyDir = (d + 2) % 4;
      nextGear = false;
    } else {
      nextGear = bot.movingForward;
      nextBodyDir = nextGear ? d : ((d + 2) % 4);
    }

    // Set variables
    bot.gridX = nx;
    bot.gridY = ny;
    bot.dir = nextBodyDir as any;
    bot.angle = (nextBodyDir * Math.PI / 2) - Math.PI / 2;
    bot.movingForward = nextGear;
    bot.speedIndex = nextIdx;

    setActiveGear(nextGear ? 'D' : 'R');
    targetXRef.current = nx * CELL_SIZE + CELL_SIZE / 2;
    targetYRef.current = ny * CELL_SIZE + CELL_SIZE / 2;

    // Relate current grid index to action commands for timing HUD highlight
    // Calculate how many Forward indices we have traversed
    let cumulativeSteps = 0;
    let actIdx = 0;
    for (let idx = 0; idx < compressedPathActions.length; idx++) {
      const act = compressedPathActions[idx];
      if (act.type === 'F') {
        cumulativeSteps += act.val;
        if (nextIdx <= cumulativeSteps) {
          actIdx = idx;
          break;
        }
      } else {
        // Turn actions don't cover cell offsets themselves
      }
    }
    setActiveActionIndex(actIdx);

    setStepsCount(nextIdx);
    setDistanceRemaining(shortestPathCells.length - 1 - nextIdx);
    
    // Slight tick sleep to allow turns, but speed trials are fast
    sleepTicksRef.current = 2; 
  };

  // Decoupled tick loop in Animation Frames for ultra smooth performance
  const runEngine = () => {
    const bot = botRef.current;

    if (bot.state === 'EXPLORING' || bot.state === 'SPEED_RUNNING') {
      // Handle brief latencies for cell sensing delays
      if (sleepTicksRef.current > 0) {
        sleepTicksRef.current--;
      } else {
        // Calculate velocity and apply reverse boosters/turn penalties
        let baseVelocityVal = motorVelocity / 8; // scale down slider to fit comfortable frame ranges
        if (bot.state === 'SPEED_RUNNING') {
          baseVelocityVal = (motorVelocity * 1.5) / 8; // speed runs get default hyperboosts
        }

        // Apply reverse multiplier if backtracking
        let activeVelocity = baseVelocityVal;
        if (!bot.movingForward) {
          activeVelocity = baseVelocityVal * backtrackMultiplier;
        }

        // Distance vector
        const dx = targetXRef.current - bot.pixelX;
        const dy = targetYRef.current - bot.pixelY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= activeVelocity) {
          // Snap directly on target
          bot.pixelX = targetXRef.current;
          bot.pixelY = targetYRef.current;

          // Perform actions on cell arrival
          if (bot.state === 'EXPLORING') {
            setStepsCount((prev) => prev + 1);
            
            // Scan current cell walls symmetrically in digital memory
            scanCurrentCell(bot.gridX, bot.gridY);

            // Re-calculate flood fill BFS
            if (explorationGoalRef.current === 'CENTER') {
              runFloodFill(botMapRef.current);
            } else {
              runFloodFillToStart(botMapRef.current);
            }
            
            setDistanceRemaining(botMapRef.current[bot.gridY][bot.gridX].dist);

            // Trigger next decision
            decideNextExplorationMove();
          } else if (bot.state === 'SPEED_RUNNING') {
            deployNextSpeedRunStep();
          }
        } else {
          // Move intermediate fractions smoothly towards the target
          const angleToTarget = Math.atan2(dy, dx);
          bot.pixelX += Math.cos(angleToTarget) * activeVelocity;
          bot.pixelY += Math.sin(angleToTarget) * activeVelocity;

          // Estimate HUD speed gauge
          setCurrentSpeedCellsPerSec(Number((activeVelocity * 2.5).toFixed(1)));
        }
      }
    } else {
      setCurrentSpeedCellsPerSec(0);
    }

    // Schedule next frame
    animFrameIdRef.current = requestAnimationFrame(runEngine);
  };

  return (
    <div id="full-dashboard" className="min-h-screen bg-[#050505] text-[#e5e5e5] flex flex-col font-mono select-none antialiased">
      {/* HUD Header Bar */}
      <header className="bg-[#0a0a0a] border-b border-[#222222] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3 text-left">
          <div className="p-2 bg-[#00ff88]/5 rounded border border-[#00ff88]/20 shadow-[0_0_8px_rgba(0,255,136,0.1)]">
            <Cpu className="w-4 h-4 text-[#00ff88] animate-spin" style={{ animationDuration: '8s' }} />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold text-white tracking-widest flex items-center gap-2">
              MICROMOUSE_V5 <span className="text-[9px] px-1 py-0.2 bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 rounded-sm font-normal">PROTOTYPE</span>
            </h1>
            <p className="text-[9px] text-neutral-400 font-mono tracking-wider uppercase">
              Path Compression & Intelligent Speed Run Engine
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-2.5 py-1 bg-[#050505] border border-[#222222] rounded flex items-center gap-2">
            <div className="text-[9px] font-mono text-neutral-500 shrink-0">CURRENT PHASE</div>
            <div className="px-1.5 py-0.5 rounded bg-[#00ff88]/5 border border-[#00ff88]/20 text-[10px] font-mono font-bold text-[#00ff88]">
              {phase === 'READY' && '1. READY'}
              {phase === 'EXPLORE_TO_GOAL' && '1. EXPLORING TO GOAL'}
              {phase === 'EXPLORE_RETURN' && '1. EXPLORING BACK TO START'}
              {phase === 'SOLVED' && '2. DIJKSTRA OPTIMIZED'}
              {phase === 'SPEEDRUN' && '3. SHIFT GEAR & RUNNING'}
            </div>
          </div>

          <div className="px-2.5 py-1 bg-[#050505] border border-[#222222] rounded flex items-center gap-2">
            <div className="text-[9px] font-mono text-neutral-500 uppercase">Bot State</div>
            <div className="px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-[10px] font-mono font-bold text-[#00ff88]">
              {botRef.current.state}
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-[380px_1fr_390px] gap-4 max-w-[1720px] mx-auto w-full">
        
        {/* Left Column: Sliders & Settings */}
        <section id="tuning-panel" className="flex flex-col gap-3">
          <div className="bg-[#0a0a0a]/90 border border-[#222222] rounded p-3 text-left">
            <div className="flex items-center gap-2 border-b border-[#111111] pb-2 mb-3.5">
              <Sliders className="w-3.5 h-3.5 text-[#00ff88]" />
              <h2 className="font-mono text-[10px] font-bold text-white uppercase tracking-wider">
                // MOTOR_SENSOR_TUNING
              </h2>
            </div>

            {/* Sliders Area */}
            <div className="space-y-3">
              {/* Slider 1: Motor Velocity */}
              <div className="space-y-1 p-2 bg-[#050505] rounded border border-[#111111] transition hover:border-[#222222]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-medium text-neutral-400">Motor Velocity</span>
                  <span className="font-mono text-[10px] font-bold text-[#00ff88]">{motorVelocity} px/f</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={motorVelocity}
                  onChange={(e) => setMotorVelocity(Number(e.target.value))}
                  className="w-full h-1 bg-[#151515] accent-[#00ff88] rounded appearance-none cursor-pointer"
                />
                <div className="text-[8.5px] text-neutral-500 font-mono tracking-tight">Controls pixel speed during driving steps</div>
              </div>

              {/* Slider 2: Backtrack Reverse multiplier */}
              <div className="space-y-1 p-2 bg-[#050505] rounded border border-[#111111] transition hover:border-[#222222]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-medium text-neutral-400">Backtrack Booster</span>
                  <span className="font-mono text-[10px] font-bold text-[#00ff88]">⚡ {backtrackMultiplier}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.1"
                  value={backtrackMultiplier}
                  onChange={(e) => setBacktrackMultiplier(Number(e.target.value))}
                  className="w-full h-1 bg-[#151515] accent-[#00ff88] rounded appearance-none cursor-pointer"
                />
                <div className="text-[8.5px] text-neutral-500 font-mono tracking-tight">Reversing speed multiplier for backtracks</div>
              </div>

              {/* Slider 3: Scan Latency */}
              <div className="space-y-1 p-2 bg-[#050505] rounded border border-[#111111] transition hover:border-[#222222]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-medium text-neutral-400">Sensor Scan Delay</span>
                  <span className="font-mono text-[10px] font-bold text-[#00ff88]">{scanLatency} f</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={scanLatency}
                  onChange={(e) => setScanLatency(Number(e.target.value))}
                  className="w-full h-1 bg-[#151515] accent-[#00ff88] rounded appearance-none cursor-pointer"
                />
                <div className="text-[8.5px] text-neutral-500 font-mono tracking-tight">Pause states spent on each cell to sense walls</div>
              </div>

              {/* Mode Selectors */}
              <div className="space-y-1.5 p-2 bg-[#050505] rounded border border-[#111111]">
                <span className="text-[10px] font-mono font-medium text-neutral-400 block mb-1">Explorer Navigation Mode</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setExploreMode('TO_GOAL');
                      pushLog('SYSTEM', 'Configured explore mode: TO GOAL (stop at center)');
                    }}
                    className={`p-1.5 rounded-sm font-mono text-[9px] font-bold border transition cursor-pointer ${
                      exploreMode === 'TO_GOAL'
                        ? 'bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30 shadow-[0_0_6px_rgba(0,255,136,0.1)]'
                        : 'bg-[#111111] text-neutral-500 border-[#1a1a1a] hover:text-neutral-300'
                    }`}
                  >
                    Touch Center
                  </button>
                  <button
                    onClick={() => {
                      setExploreMode('FULL_MAPPING');
                      pushLog('SYSTEM', 'Configured explore mode: GO & RETURN (fully map elements)');
                    }}
                    className={`p-1.5 rounded-sm font-mono text-[9px] font-bold border transition cursor-pointer ${
                      exploreMode === 'FULL_MAPPING'
                        ? 'bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30 shadow-[0_0_6px_rgba(0,255,136,0.1)]'
                        : 'bg-[#111111] text-neutral-500 border-[#1a1a1a] hover:text-neutral-300'
                    }`}
                  >
                    Go & Return Map
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Informational / Help Deck */}
          <div className="bg-[#0a0a0a]/90 border border-[#222222] rounded p-3 text-left flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-[#111111] pb-2 mb-2.5">
                <Info className="w-3.5 h-3.5 text-[#00ff88]" />
                <h3 className="font-mono text-[10px] font-bold text-white uppercase tracking-wider">
                  // TECH_SPECIFICATIONS
                </h3>
              </div>
              <ul className="space-y-2 text-[9.5px] leading-relaxed font-mono text-neutral-400">
                <li className="flex items-start gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#00ff88] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-neutral-200">Bidirectional Shifting:</strong> If the next step is behind, the bot utilizes reverse gear instantly instead of spinning 180°.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#00ff88] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-neutral-200">Path Compression:</strong> Turns and continuous straights are compiled step-by-step into motion instructions vectors.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <ChevronRight className="w-3.5 h-3.5 text-[#00ff88] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-neutral-200">Digital Twin Sync:</strong> Scanning maps boundaries symmetrically to keep data routing consistent.
                  </span>
                </li>
              </ul>
            </div>

            <div className="p-2 bg-[#050505] border border-[#111111] rounded mt-3 shrink-0">
              <div className="flex justify-between items-center text-[9px] font-mono mb-1 text-neutral-400">
                <span>ESTIMATED THRUST LEVEL</span>
                <span className="text-[#00ff88] font-bold">OPTIMAL</span>
              </div>
              <div className="h-1 w-full bg-[#1a1a1a] rounded overflow-hidden">
                <div className="h-full bg-[#00ff88] rounded" style={{ width: '85%' }}></div>
              </div>
            </div>
          </div>
        </section>

        {/* Center Column: Twin Screens and Core Triggers */}
        <section id="simulator-grid" className="flex flex-col gap-3">
          
          {/* Dual Screen Canvases */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MazeVisualizer
              title="Real-world Maze (Physical Grid)"
              mazeData={mazeRef.current}
              botMapData={null}
              botState={botRef.current}
              shortestPath={shortestPathCells}
              isReal={true}
              highlightPath={phase !== 'READY' && phase !== 'EXPLORE_TO_GOAL' && phase !== 'EXPLORE_RETURN'}
            />
            <MazeVisualizer
              title="Bot Known Memory (Digital Twin Map)"
              mazeData={null}
              botMapData={botMapRef.current}
              botState={botRef.current}
              shortestPath={shortestPathCells}
              isReal={false}
              highlightPath={phase !== 'READY' && phase !== 'EXPLORE_TO_GOAL' && phase !== 'EXPLORE_RETURN'}
            />
          </div>

          {/* Interactive Button Slabs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-[#0a0a0a]/90 p-2.5 rounded border border-[#222222] shadow-none">
            {/* DFS Generator Preset Button */}
            <div className="flex flex-col gap-0.5 col-span-1 text-left justify-center">
              <label className="text-[8.5px] font-mono text-neutral-500 uppercase tracking-wider pl-1 font-bold">Maze Preset</label>
              <select
                value={preset}
                onChange={(e) => handlePresetChange(e.target.value as MazePreset)}
                className="bg-[#050505] border border-[#222222] hover:border-[#00ff88] text-[#00ff88] py-2 px-1.5 rounded font-mono text-[10px] cursor-pointer focus:outline-none transition"
              >
                <option value="DEFAULT_DFS">🏁 STD DFS Generator</option>
                <option value="COMPLEX_LOOP">➰ Multi-Loop Circuit</option>
                <option value="SPIRAL">🌀 Symmetrical Spiral</option>
                <option value="DOUBLE_CORRIDOR">🌉 Double Corridors</option>
                <option value="BLANK">⬜ Boundary Only</option>
              </select>
            </div>

            {/* Run button */}
            <button
              onClick={startExploration}
              disabled={botRef.current.state !== 'IDLE' || (phase === 'SOLVED')}
              className="py-2 px-3 bg-[#111] hover:bg-[#00ff88] border border-[#333] hover:border-[#00ff88] text-[#00ff88] hover:text-black disabled:opacity-20 disabled:hover:bg-[#111] disabled:hover:text-[#00ff88] disabled:hover:border-[#333] font-mono text-[10px] font-bold rounded cursor-pointer transition uppercase text-center flex items-center justify-center min-h-[38px]"
            >
              PHASE 1: EXPLORE
            </button>

            {/* Dijkstra Planning Button */}
            <button
              onClick={planShortestPath}
              disabled={phase !== 'SOLVED' && botRef.current.state !== 'IDLE'}
              className="py-2 px-3 bg-[#111] hover:bg-[#00ff88] border border-[#333] hover:border-[#00ff88] text-[#00ff88] hover:text-black disabled:opacity-20 disabled:hover:bg-[#111] disabled:hover:text-[#00ff88] disabled:hover:border-[#333] font-mono text-[10px] font-bold rounded cursor-pointer transition uppercase text-center flex items-center justify-center min-h-[38px]"
            >
              PHASE 2: COMPRESS
            </button>

            {/* Speed Run Button */}
            <button
              onClick={startSpeedRun}
              disabled={shortestPathCells.length === 0 || botRef.current.state === 'SPEED_RUNNING' || botRef.current.state === 'EXPLORING'}
              className="py-2 px-3 bg-[#111] hover:bg-[#00ff88] border border-[#302505] hover:border-[#00ff88] text-[#00ff88] hover:text-black disabled:opacity-20 disabled:hover:bg-[#111] disabled:hover:text-[#00ff88] disabled:hover:border-[#302505] font-mono text-[10px] font-bold rounded cursor-pointer transition uppercase text-center flex items-center justify-center min-h-[38px] shadow-[0_0_12px_rgba(0,255,136,0.05)]"
            >
              PHASE 3: SPEED RUN
            </button>
          </div>
        </section>

        {/* Right Column: Compression timeline of path actions & diagnostics console */}
        <section id="compression-panel" className="flex flex-col gap-3">
          
          {/* Diagnostic Stats HUD Bar */}
          <div className="bg-[#0a0a0a]/90 border border-[#222222] rounded p-3 text-left shrink-0">
            <h3 className="font-mono text-[10px] font-bold text-white uppercase tracking-wider mb-2.5">
              // KINETIC_TELEMETRY
            </h3>
            
            <div className="grid grid-cols-2 gap-1.5 text-left">
              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">GRID POSITION</div>
                <div className="text-xs font-mono font-bold text-[#e5e5e5]">
                  [{botRef.current.gridX}, {botRef.current.gridY}]
                </div>
              </div>

              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">STEPS TAKEN</div>
                <div className="text-xs font-mono font-bold text-[#e5e5e5]">
                  {stepsCount} / 256 cells
                </div>
              </div>

              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">FLOOD DISTANCE</div>
                <div className="text-xs font-mono font-bold text-[#e5e5e5]">
                  {distanceRemaining === 255 ? 'UNSOLVED' : `${distanceRemaining} H-dist`}
                </div>
              </div>

              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">REVERSE RATIO</div>
                <div className="text-xs font-mono font-bold text-[#e5e5e5] uppercase">
                  ACTIVE GEAR <span className={activeGear === 'D' ? 'text-[#00ff88]' : 'text-rose-500 font-extrabold'}>[{activeGear}]</span>
                </div>
              </div>

              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">TURNS INDEXED</div>
                <div className="text-xs font-mono font-bold text-[#e5e5e5]">
                  {turnsCount} Turns
                </div>
              </div>

              <div className="p-2 bg-[#050505] rounded border border-[#111111]">
                <div className="text-[8.5px] font-mono text-neutral-500 font-bold">ENGINE VELOCITY</div>
                <div className="text-xs font-mono font-bold text-[#00ff88] animate-pulse">
                  {currentSpeedCellsPerSec} cells/s
                </div>
              </div>
            </div>

            {/* Hard reset */}
            <button
              onClick={() => handleHardReset(preset)}
              className="mt-3 w-full py-1.5 bg-[#111111] hover:bg-neutral-950 hover:text-red-300 border border-[#222222] hover:border-red-900/30 rounded font-mono text-[9px] font-bold tracking-widest text-[#00ff88] transition cursor-pointer"
            >
              🔄 COLD RESET ENGINE
            </button>
          </div>

          {/* Path action compiler sequence list */}
          <div className="bg-[#0a0a0a]/90 border border-[#222222] rounded p-3 text-left flex-1 flex flex-col min-h-[140px] max-h-[300px]">
            <div className="flex items-center justify-between border-b border-[#111111] pb-2 mb-2 shrink-0">
              <span className="font-mono text-[10px] font-bold text-white uppercase tracking-wider">
                // PATH_ACTION_TIMELINE
              </span>
              <span className="text-[9px] font-mono text-[#00ff88] font-bold bg-[#00ff88]/5 px-1.5 py-0.5 rounded border border-[#00ff88]/20 shrink-0 font-bold">
                COMPRESSION COMPILER
              </span>
            </div>

            {/* Timeline cards */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-neutral-800">
              {compressedPathActions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-neutral-600 py-10">
                  <ArrowRightLeft className="w-5 h-5 mb-1.5 text-neutral-700" />
                  <span className="text-[9px] font-mono uppercase tracking-wider">Awaiting compiler resolution...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 pt-0.5">
                  {compressedPathActions.map((act, idx) => {
                    let text = `Forward ${act.val}`;
                    let colorClasses = "border-[#1a1a1a] text-neutral-300";
                    if (act.type === 'L') {
                      text = "Turn L90°";
                    } else if (act.type === 'R') {
                      text = "Turn R90°";
                    } else if (act.type === 'T') {
                      text = "Flip 180°";
                    } else if (act.type === 'F' && act.gear === 'R') {
                      text = `Reverse ${act.val}`;
                    }

                    const isCurrent = idx === activeActionIndex;

                    return (
                      <div
                        key={idx}
                        className={`p-1.5 border rounded-sm font-mono text-[10px] flex flex-col gap-0.5 bg-[#050505] transition ${colorClasses} ${
                          isCurrent
                            ? 'border-[#00ff88] bg-[#00ff88]/5 text-[#00ff88] font-extrabold shadow-[0_0_8px_rgba(0,255,136,0.1)] animate-pulse'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-[#111111] pb-0.5 mb-1">
                          <span className="text-[8px] text-neutral-600">#{idx + 1}</span>
                          <span className={`text-[8px] font-bold ${act.gear === 'D' ? 'text-[#00ff88]' : 'text-rose-500'}`}>
                            {act.gear === 'D' ? 'DRIVE' : 'REVERSE'}
                          </span>
                        </div>
                        <span className="text-white text-[10px] truncate">{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Console Diagnostics logs window */}
          <div className="flex-1 min-h-[160px] max-h-[220px]">
            <ConsoleLogs logs={logs} onClear={() => setLogs([])} />
          </div>
        </section>

      </main>

      {/* Floating System HUD Footer bar */}
      <footer className="bg-[#0a0a0a] border-t border-[#222222] px-4 py-2 flex items-center justify-between font-mono text-[9px] text-neutral-500 text-left shrink-0">
        <div>
          MICROMOUSE V5 • PATH COMPRESSION ENGINE
        </div>
        <div>
          SIMULATION ENVIRONMENT STATUS MODELING ACTIVE
        </div>
      </footer>
    </div>
  );
}
