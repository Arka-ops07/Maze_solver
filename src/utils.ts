import { Cell, Direction, PathAction } from './types';

export const GRID_SIZE = 16;
export const DX = [0, 1, 0, -1]; // Index matches Direction: 0:N, 1:E, 2:S, 3:W
export const DY = [-1, 0, 1, 0];
export const WALL_BITS = [1, 2, 4, 8]; // 1: N, 2: E, 4: S, 8: W

// Helper to check boundaries
export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

// 1. Maze Generation Presets
export function generateMaze(type: 'DEFAULT_DFS' | 'SPIRAL' | 'DOUBLE_CORRIDOR' | 'BLANK' | 'COMPLEX_LOOP'): number[][] {
  const maze = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(15));

  if (type === 'BLANK') {
    // Just outer boundaries
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        let walls = 0;
        if (y === 0) walls |= 1;
        if (x === GRID_SIZE - 1) walls |= 2;
        if (y === GRID_SIZE - 1) walls |= 4;
        if (x === 0) walls |= 8;
        maze[y][x] = walls;
      }
    }
    return maze;
  }

  if (type === 'SPIRAL') {
    // Generates a spiral towards the center
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        let walls = 0;
        if (y === 0) walls |= 1;
        if (x === GRID_SIZE - 1) walls |= 2;
        if (y === GRID_SIZE - 1) walls |= 4;
        if (x === 0) walls |= 8;
        maze[y][x] = walls;
      }
    }

    // Build spiral walls
    let left = 0, right = GRID_SIZE - 1, top = 0, bottom = GRID_SIZE - 1;
    let step = 0;
    while (left < right - 1 && top < bottom - 1) {
      if (step % 4 === 0) {
        // Wall along the row just inside
        for (let x = left + 1; x < right; x++) {
          maze[top + 2][x] |= 1; // N wall
          maze[top + 1][x] |= 4; // S wall
        }
        // Leave opening
        maze[top + 2][right - 1] &= ~1;
        maze[top + 1][right - 1] &= ~4;
      } else if (step % 4 === 1) {
        for (let y = top + 2; y < bottom; y++) {
          maze[y][right - 2] |= 2; // E wall
          maze[y][right - 1] |= 8; // W wall
        }
        maze[bottom - 1][right - 2] &= ~2;
        maze[bottom - 1][right - 1] &= ~8;
      } else if (step % 4 === 2) {
        for (let x = left + 2; x < right - 1; x++) {
          maze[bottom - 2][x] |= 4; // S wall
          maze[bottom - 1][x] |= 1; // N wall
        }
        maze[bottom - 2][left + 2] &= ~4;
        maze[bottom - 1][left + 2] &= ~1;
      } else if (step % 4 === 3) {
        for (let y = top + 3; y < bottom - 1; y++) {
          maze[y][left + 2] |= 8; // W wall
          maze[y][left + 1] |= 2; // E wall
        }
        maze[top + 3][left + 2] &= ~8;
        maze[top + 3][left + 1] &= ~2;
      }
      top += 2; right -= 2; bottom -= 2; left += 2;
      step++;
    }

    // Clear center area completely
    for (let r = 7; r <= 8; r++) {
      for (let c = 7; c <= 8; c++) {
        maze[r][c] = 0;
      }
    }
    maze[7][7] |= 1 | 8;
    maze[7][8] |= 1 | 2;
    maze[8][7] |= 4 | 8;
    maze[8][8] |= 4 | 2;

    return maze;
  }

  // DFS Maze Gen (Randomized depth-first search)
  const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));

  function dfs(x: number, y: number) {
    visited[y][x] = true;
    const dirs: Direction[] = [0, 1, 2, 3];
    // Shuffle directions
    dirs.sort(() => Math.random() - 0.5);

    for (const d of dirs) {
      const nx = x + DX[d];
      const ny = y + DY[d];

      if (inBounds(nx, ny) && !visited[ny][nx]) {
        // Knock down walls between (x, y) and (nx, ny)
        maze[y][x] &= ~WALL_BITS[d];
        maze[ny][nx] &= ~WALL_BITS[(d + 2) % 4];
        dfs(nx, ny);
      }
    }
  }

  // Start DFS at starting corner (0, 15)
  dfs(0, 15);

  // Guarantee the center 2x2 is open and connected for Micromouse standards
  // Center is (7,7), (7,8), (8,7), (8,8)
  maze[7][7] &= ~(2 | 4); // open East & South
  maze[7][8] &= ~(4 | 8); // open South & West
  maze[8][7] &= ~(1 | 2); // open North & East
  maze[8][8] &= ~(1 | 8); // open North & West

  // Ensure center goal is reachable from outer cells
  // If there's an absolute wall, knock it down
  if ((maze[6][7] & 4) && (maze[7][6] & 2) && (maze[9][7] & 1) && (maze[8][6] & 2) && (maze[6][8] & 4) && (maze[7][9] & 8) && (maze[9][8] & 1) && (maze[8][9] & 8)) {
    // Knock down N outer wall to enter goals
    maze[6][7] &= ~4;
    maze[7][7] &= ~1;
  }

  if (type === 'COMPLEX_LOOP') {
    // Start with DFS maze, then randomly break ~25 additional walls to create loop/multi-paths
    let extraRemoved = 0;
    while (extraRemoved < 28) {
      const rx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
      const ry = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
      const rd = Math.floor(Math.random() * 4) as Direction;

      const rnx = rx + DX[rd];
      const rny = ry + DY[rd];

      if (inBounds(rnx, rny)) {
        if ((maze[ry][rx] & WALL_BITS[rd]) !== 0) {
          maze[ry][rx] &= ~WALL_BITS[rd];
          maze[rny][rnx] &= ~WALL_BITS[(rd + 2) % 4];
          extraRemoved++;
        }
      }
    }
  } else if (type === 'DOUBLE_CORRIDOR') {
    // Generate some elegant symmetry corridors
    for (let y = 1; y < GRID_SIZE - 1; y += 2) {
      for (let x = 1; x < GRID_SIZE - 1; x++) {
        if (x !== 4 && x !== 11) {
          maze[y][x] |= 1 | 4; // Add horizontal barriers
          maze[y - 1][x] |= 4;
          maze[y + 1][x] |= 1;
        }
      }
    }
  }

  // Force outer boundary walls
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (y === 0) maze[y][x] |= 1;
      if (x === GRID_SIZE - 1) maze[y][x] |= 2;
      if (y === GRID_SIZE - 1) maze[y][x] |= 4;
      if (x === 0) maze[y][x] |= 8;
    }
  }

  return maze;
}

// 2. Flood Fill execution based on current known walls and goals
export function runFloodFill(botMap: Cell[][]): void {
  // Reset all distances
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      botMap[y][x].dist = 255;
    }
  }

  // Queue for BFS
  const q: { x: number; y: number }[] = [];

  // Goal is 2x2 center
  const goals = [[7, 7], [7, 8], [8, 7], [8, 8]];
  goals.forEach(([gx, gy]) => {
    botMap[gy][gx].dist = 0;
    q.push({ x: gx, y: gy });
  });

  while (q.length > 0) {
    const { x, y } = q.shift()!;
    const currentDist = botMap[y][x].dist;

    for (let d = 0; d < 4; d++) {
      // Check if wall is PRESENT in the bot map
      // If NOT present, we can explore that direction
      if (!(botMap[y][x].walls & WALL_BITS[d])) {
        const nx = x + DX[d];
        const ny = y + DY[d];

        if (inBounds(nx, ny) && botMap[ny][nx].dist === 255) {
          botMap[ny][nx].dist = currentDist + 1;
          q.push({ x: nx, y: ny });
        }
      }
    }
  }
}

// Flood fill mapping to start cell (0, 15) instead of center
// Used when the bot needs to return back to start after reaching the goal, to fully map
export function runFloodFillToStart(botMap: Cell[][]): void {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      botMap[y][x].dist = 255;
    }
  }
  botMap[15][0].dist = 0;
  const q = [{ x: 0, y: 15 }];

  while (q.length > 0) {
    const { x, y } = q.shift()!;
    const currentDist = botMap[y][x].dist;

    for (let d = 0; d < 4; d++) {
      if (!(botMap[y][x].walls & WALL_BITS[d])) {
        const nx = x + DX[d];
        const ny = y + DY[d];

        if (inBounds(nx, ny) && botMap[ny][nx].dist === 255) {
          botMap[ny][nx].dist = currentDist + 1;
          q.push({ x: nx, y: ny });
        }
      }
    }
  }
}

// 3. Shortest Path Solvers on Bot memory
// 3a. Dijkstra Shortest Path Solver on Bot memory
// Solves from start (0, 15) to center goals using only KNOWN walls.
export function solveDijkstra(botMap: Cell[][]): { path: { x: number; y: number }[]; cellsExplored: number } {
  const dist = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Infinity));
  const prev = Array.from({ length: GRID_SIZE }, () => Array<{ x: number; y: number } | null>(GRID_SIZE).fill(null));
  const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  
  dist[15][0] = 0;
  let cellsExplored = 0;
  let found = false;
  let finalGoalX = -1;
  let finalGoalY = -1;
  
  // Custom simple priority-queue based loop
  for (let count = 0; count < GRID_SIZE * GRID_SIZE; count++) {
    // Find min dist node that is unvisited
    let uX = -1, uY = -1;
    let minDist = Infinity;
    
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!visited[y][x] && dist[y][x] < minDist) {
          minDist = dist[y][x];
          uX = x;
          uY = y;
        }
      }
    }
    
    if (uX === -1 || uY === -1) break;
    
    visited[uY][uX] = true;
    cellsExplored++;
    
    // Check if we reached center goal
    if ((uX === 7 || uX === 8) && (uY === 7 || uY === 8)) {
      found = true;
      finalGoalX = uX;
      finalGoalY = uY;
      break;
    }
    
    for (let d = 0; d < 4; d++) {
      // Only traverse if wall is NOT known
      if (!(botMap[uY][uX].walls & WALL_BITS[d])) {
        const nx = uX + DX[d];
        const ny = uY + DY[d];
        
        if (inBounds(nx, ny) && !visited[ny][nx]) {
          const alt = dist[uY][uX] + 1;
          if (alt < dist[ny][nx]) {
            dist[ny][nx] = alt;
            prev[ny][nx] = { x: uX, y: uY };
          }
        }
      }
    }
  }
  
  if (!found) {
    return { path: [], cellsExplored };
  }

  // Reconstruct path
  const path: { x: number; y: number }[] = [];
  let curr: { x: number; y: number } | null = { x: finalGoalX, y: finalGoalY };
  while (curr !== null) {
    path.push(curr);
    curr = prev[curr.y][curr.x];
  }
  return { path: path.reverse(), cellsExplored };
}

// Helper Manhattan Heuristic generator for A* search towards 2x2 goals
function getHeuristic(x: number, y: number): number {
  const goals = [[7, 7], [7, 8], [8, 7], [8, 8]];
  let minH = Infinity;
  for (const [gx, gy] of goals) {
    const dist = Math.abs(x - gx) + Math.abs(y - gy);
    if (dist < minH) minH = dist;
  }
  return minH;
}

// 3b. A* Search Shortest Path Solver on Bot memory
// Uses Manhattan distance heuristic towards center goal to minimize node expansions.
export function solveAStar(botMap: Cell[][]): { path: { x: number; y: number }[]; cellsExplored: number } {
  const gScore = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Infinity));
  const fScore = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Infinity));
  const prev = Array.from({ length: GRID_SIZE }, () => Array<{ x: number; y: number } | null>(GRID_SIZE).fill(null));
  const closedSet = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  
  gScore[15][0] = 0;
  fScore[15][0] = getHeuristic(0, 15);
  
  const openSet: { x: number; y: number }[] = [{ x: 0, y: 15 }];
  let cellsExplored = 0;
  let found = false;
  let finalGoalX = -1;
  let finalGoalY = -1;
  
  while (openSet.length > 0) {
    // Pick node with lowest fScore estimate
    let minIdx = 0;
    let minF = fScore[openSet[0].y][openSet[0].x];
    for (let i = 1; i < openSet.length; i++) {
      const f = fScore[openSet[i].y][openSet[i].x];
      if (f < minF) {
        minF = f;
        minIdx = i;
      }
    }
    
    const { x, y } = openSet[minIdx];
    openSet.splice(minIdx, 1);
    
    if (!closedSet[y][x]) {
      closedSet[y][x] = true;
      cellsExplored++;
    }
    
    if ((x === 7 || x === 8) && (y === 7 || y === 8)) {
      found = true;
      finalGoalX = x;
      finalGoalY = y;
      break;
    }
    
    for (let d = 0; d < 4; d++) {
      if (!(botMap[y][x].walls & WALL_BITS[d])) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        
        if (inBounds(nx, ny) && !closedSet[ny][nx]) {
          const tentativeG = gScore[y][x] + 1;
          if (tentativeG < gScore[ny][nx]) {
            prev[ny][nx] = { x, y };
            gScore[ny][nx] = tentativeG;
            fScore[ny][nx] = tentativeG + getHeuristic(nx, ny);
            
            if (!openSet.some(node => node.x === nx && node.y === ny)) {
              openSet.push({ x: nx, y: ny });
            }
          }
        }
      }
    }
  }
  
  if (!found) {
    return { path: [], cellsExplored };
  }
  
  const path: { x: number; y: number }[] = [];
  let curr: { x: number; y: number } | null = { x: finalGoalX, y: finalGoalY };
  while (curr !== null) {
    path.push(curr);
    curr = prev[curr.y][curr.x];
  }
  return { path: path.reverse(), cellsExplored };
}

// 3c. Flood Fill Potential Field Path Tracker on Bot memory
// Runs standard BFS flood fill to compute distances, then chooses greedy steps following the gradient.
export function solveFloodFillPath(botMap: Cell[][]): { path: { x: number; y: number }[]; cellsExplored: number } {
  const dist = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(255));
  const queue: { x: number; y: number }[] = [];
  
  const goals = [[7, 7], [7, 8], [8, 7], [8, 8]];
  goals.forEach(([gx, gy]) => {
    dist[gy][gx] = 0;
    queue.push({ x: gx, y: gy });
  });
  
  let cellsExplored = 0;
  
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    cellsExplored++;
    const currentDist = dist[y][x];
    
    for (let d = 0; d < 4; d++) {
      if (!(botMap[y][x].walls & WALL_BITS[d])) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        
        if (inBounds(nx, ny) && dist[ny][nx] === 255) {
          dist[ny][nx] = currentDist + 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  // Reconstruct path by following the steep flood fill values from (0, 15) to goal
  const path: { x: number; y: number }[] = [{ x: 0, y: 15 }];
  let cx = 0;
  let cy = 15;
  const pathSet = new Set<string>();
  pathSet.add(`${cx},${cy}`);
  let found = false;
  
  for (let steps = 0; steps < 500; steps++) {
    if ((cx === 7 || cx === 8) && (cy === 7 || cy === 8)) {
      found = true;
      break;
    }
    
    let bestNx = -1;
    let bestNy = -1;
    let minD = Infinity;
    
    for (let d = 0; d < 4; d++) {
      if (!(botMap[cy][cx].walls & WALL_BITS[d])) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        
        if (inBounds(nx, ny)) {
          const dVal = dist[ny][nx];
          if (dVal < minD && !pathSet.has(`${nx},${ny}`)) {
            minD = dVal;
            bestNx = nx;
            bestNy = ny;
          }
        }
      }
    }
    
    if (bestNx === -1 || bestNy === -1) {
      break;
    }
    
    cx = bestNx;
    cy = bestNy;
    path.push({ x: cx, y: cy });
    pathSet.add(`${cx},${cy}`);
  }
  
  if (!found) {
    return { path: [], cellsExplored };
  }
  
  return { path, cellsExplored };
}

// 4. Path action compressor
// Compresses cell-by-cell path into high-level drive & turn commands
// Uses Reverse Gear and instant direction flips to avoid unnecessary 180 transitions on backtracks
export function compressPath(path: { x: number; y: number }[]): PathAction[] {
  if (path.length < 2) return [];

  const rawActions: { type: 'F' | 'L' | 'R' | 'T'; val: number; gear: 'D' | 'R' }[] = [];
  
  let currentDir: Direction = 0; // Starts facing North (0)
  let currentGear: 'D' | 'R' = 'D'; // Drive (Forward) by default

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];

    // Determine target direction
    let targetDir: Direction = 0;
    if (p2.x > p1.x) targetDir = 1;      // East
    else if (p2.y > p1.y) targetDir = 2; // South
    else if (p2.x < p1.x) targetDir = 3; // West
    else targetDir = 0;                  // North

    // Bidirectional State check:
    // We can go:
    // 1) Forward mode (D): Rotate to match targetDir, then walk forward
    // 2) Reverse mode (R): Rotate to match (targetDir + 2) % 4, then walk reverse

    const rotateForward = (targetDir - currentDir + 4) % 4; // 0, 1, 2, 3
    const rotateReverse = ((targetDir + 2) % 4 - currentDir + 4) % 4;

    // Normalize turns to output angles:
    // 0: 0 deg, 1: 90 deg Right, 2: 180 deg, 3: 90 deg Left (which is -90)
    const turnForwardAngle = rotateForward === 3 ? -90 : rotateForward * 90;
    const turnReverseAngle = rotateReverse === 3 ? -90 : rotateReverse * 90;

    // Weighting function: favor less rotation. If rotation is equal, favor maintaining current gear.
    let selectedGear: 'D' | 'R' = 'D';
    let selectedTurn = 0;
    let nextFacingDir: Direction = currentDir;

    const absRotForward = Math.abs(turnForwardAngle);
    const absRotReverse = Math.abs(turnReverseAngle);

    if (absRotForward < absRotReverse) {
      selectedGear = 'D';
      selectedTurn = turnForwardAngle;
      nextFacingDir = targetDir;
    } else if (absRotReverse < absRotForward) {
      selectedGear = 'R';
      selectedTurn = turnReverseAngle;
      nextFacingDir = (targetDir + 2) % 4 as Direction;
    } else {
      // Rotation angles are equal (e.g. 90 deg Right vs 90 deg Left)
      // or both are 90 deg. Favor preserving same gear
      if (currentGear === 'R') {
        selectedGear = 'R';
        selectedTurn = turnReverseAngle;
        nextFacingDir = (targetDir + 2) % 4 as Direction;
      } else {
        selectedGear = 'D';
        selectedTurn = turnForwardAngle;
        nextFacingDir = targetDir;
      }
    }

    // Output TURN relative to current orientation
    if (selectedTurn === 90) {
      rawActions.push({ type: 'R', val: 90, gear: selectedGear });
    } else if (selectedTurn === -90) {
      rawActions.push({ type: 'L', val: 90, gear: selectedGear });
    } else if (Math.abs(selectedTurn) === 180) {
      rawActions.push({ type: 'T', val: 180, gear: selectedGear });
    }

    // Now issue moving forward/backward unit
    rawActions.push({ type: 'F', val: 1, gear: selectedGear });

    currentDir = nextFacingDir;
    currentGear = selectedGear;
  }

  // Now, COMPRESS adjacent forward movements of the SAME GEAR together!
  const compressed: PathAction[] = [];
  
  for (const act of rawActions) {
    if (act.type === 'F') {
      const last = compressed[compressed.length - 1];
      if (last && last.type === 'F' && last.gear === act.gear) {
        last.val += 1;
      } else {
        compressed.push({ ...act });
      }
    } else {
      // Turn action
      compressed.push(act);
    }
  }

  return compressed;
}
