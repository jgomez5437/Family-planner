/**
 * Dependency-free Sudoku generator & solver.
 *
 * Grids are flat arrays of 81 numbers (row-major), 0 = empty.
 * Puzzles are guaranteed to have exactly one solution.
 */

export type SudokuGeneratorDifficulty = "easy" | "medium" | "hard";

/** Target clue counts (inclusive range) per difficulty. */
export const SUDOKU_CLUE_TARGETS: Record<
  SudokuGeneratorDifficulty,
  { min: number; max: number }
> = {
  easy: { min: 40, max: 44 },
  medium: { min: 32, max: 35 },
  hard: { min: 26, max: 29 },
};

const ALL_BITS = 0x3fe; // bits 1..9

function boxOf(cell: number): number {
  const r = Math.floor(cell / 9);
  const c = cell % 9;
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

const ROW_OF = Array.from({ length: 81 }, (_, i) => Math.floor(i / 9));
const COL_OF = Array.from({ length: 81 }, (_, i) => i % 9);
const BOX_OF = Array.from({ length: 81 }, (_, i) => boxOf(i));

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c += 1;
  }
  return c;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Counts solutions of `grid` up to `limit` (stops early).
 * If `out` is provided, the first solution found is written into it.
 */
export function countSolutions(
  grid: readonly number[],
  limit = 2,
  out?: number[],
  rand?: () => number
): number {
  const g = grid.slice();
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < 81; i += 1) {
    const v = g[i];
    if (v) {
      const bit = 1 << v;
      if (
        rows[ROW_OF[i]] & bit ||
        cols[COL_OF[i]] & bit ||
        boxes[BOX_OF[i]] & bit
      ) {
        return 0; // invalid givens
      }
      rows[ROW_OF[i]] |= bit;
      cols[COL_OF[i]] |= bit;
      boxes[BOX_OF[i]] |= bit;
    }
  }

  let count = 0;

  function search(): boolean {
    // Choose the empty cell with the fewest candidates (MRV).
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i += 1) {
      if (g[i]) continue;
      const mask =
        ALL_BITS & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
      const n = popcount(mask);
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best === -1) {
      count += 1;
      if (out && count === 1) {
        for (let i = 0; i < 81; i += 1) out[i] = g[i];
      }
      return count >= limit;
    }
    if (bestCount === 0) return false;

    const digits: number[] = [];
    for (let d = 1; d <= 9; d += 1) if (bestMask & (1 << d)) digits.push(d);
    if (rand) shuffle(digits, rand);

    const r = ROW_OF[best];
    const c = COL_OF[best];
    const b = BOX_OF[best];
    for (const d of digits) {
      const bit = 1 << d;
      g[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (search()) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      g[best] = 0;
    }
    return false;
  }

  search();
  return count;
}

export function generateSolvedGrid(rand: () => number = Math.random): number[] {
  const out = new Array<number>(81).fill(0);
  countSolutions(new Array<number>(81).fill(0), 1, out, rand);
  return out;
}

export function isValidSolvedGrid(grid: readonly number[]): boolean {
  if (grid.length !== 81) return false;
  for (let unit = 0; unit < 9; unit += 1) {
    let rowMask = 0;
    let colMask = 0;
    let boxMask = 0;
    for (let k = 0; k < 9; k += 1) {
      const rv = grid[unit * 9 + k];
      const cv = grid[k * 9 + unit];
      const br = Math.floor(unit / 3) * 3 + Math.floor(k / 3);
      const bc = (unit % 3) * 3 + (k % 3);
      const bv = grid[br * 9 + bc];
      rowMask |= 1 << rv;
      colMask |= 1 << cv;
      boxMask |= 1 << bv;
    }
    if (rowMask !== ALL_BITS || colMask !== ALL_BITS || boxMask !== ALL_BITS) {
      return false;
    }
  }
  return true;
}

function digPuzzle(
  solution: number[],
  targetClues: number,
  rand: () => number
): number[] {
  const puzzle = solution.slice();
  let clues = 81;

  // Pass 1: symmetric pairs for a pleasing layout.
  const pairOrder = shuffle(
    Array.from({ length: 41 }, (_, i) => i),
    rand
  );
  for (const i of pairOrder) {
    if (clues <= targetClues) break;
    const j = 80 - i;
    if (!puzzle[i]) continue;
    const removeCount = i === j ? 1 : 2;
    if (clues - removeCount < targetClues) continue;
    const a = puzzle[i];
    const b = puzzle[j];
    puzzle[i] = 0;
    puzzle[j] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      clues -= removeCount;
    } else {
      puzzle[i] = a;
      puzzle[j] = b;
    }
  }

  // Pass 2: single cells to reach the target if symmetry got stuck.
  if (clues > targetClues) {
    const order = shuffle(
      Array.from({ length: 81 }, (_, i) => i),
      rand
    );
    for (const i of order) {
      if (clues <= targetClues) break;
      if (!puzzle[i]) continue;
      const v = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        clues -= 1;
      } else {
        puzzle[i] = v;
      }
    }
  }

  return puzzle;
}

export function countClues(puzzle: readonly number[]): number {
  return puzzle.reduce((n, v) => (v ? n + 1 : n), 0);
}

/**
 * Generates a unique-solution puzzle for the given difficulty.
 * Retries with fresh grids until the clue count lands in range (bounded).
 */
export function generatePuzzle(
  difficulty: SudokuGeneratorDifficulty,
  rand: () => number = Math.random
): { puzzle: number[]; solution: number[] } {
  const { min, max } = SUDOKU_CLUE_TARGETS[difficulty];
  let best: { puzzle: number[]; solution: number[]; clues: number } | null =
    null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const solution = generateSolvedGrid(rand);
    const target = min + Math.floor(rand() * (max - min + 1));
    const puzzle = digPuzzle(solution, target, rand);
    const clues = countClues(puzzle);
    if (clues <= max) {
      return { puzzle, solution };
    }
    if (!best || clues < best.clues) best = { puzzle, solution, clues };
  }
  return { puzzle: best!.puzzle, solution: best!.solution };
}
