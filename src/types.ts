export type Direction = 0 | 1 | 2 | 3; // 0: North, 1: East, 2: South, 3: West

export interface Cell {
  x: number;
  y: number;
  walls: number; // Bitmask: 1: North, 2: East, 4: South, 8: West
  known: boolean;
  dist: number; // Flood fill distance
}

export interface BotState {
  gridX: number;
  gridY: number;
  pixelX: number;
  pixelY: number;
  angle: number; // Current physical angle of the bot in radians
  dir: Direction; // Logical direction the bot body is facing
  movingForward: boolean; // true = forward gear, false = reverse gear
  state: 'IDLE' | 'EXPLORING' | 'RETURNING' | 'SPEED_RUNNING' | 'FINISHED';
  speedIndex: number;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  type: 'SYSTEM' | 'EXPLORE' | 'GEAR' | 'COMPRESSION' | 'SPEEDRUN' | 'ERROR';
  text: string;
}

export type MazePreset = 'DEFAULT_DFS' | 'SPIRAL' | 'DOUBLE_CORRIDOR' | 'BLANK' | 'COMPLEX_LOOP';

export interface PathAction {
  type: 'F' | 'L' | 'R' | 'T'; // Forward, Left 90, Right 90, Turn 180 (usually not needed with reverse gear!)
  val: number; // Cells for F, degrees for L/R/T
  gear: 'D' | 'R'; // Drive or Reverse
}
