import type { MemberId } from "@/types/family";
import type { GameDefinition, MoveValidationResult } from "./types";

export type DotsAndBoxesSize = 3 | 4 | 5;

export const DEFAULT_DOTS_AND_BOXES_SIZE: DotsAndBoxesSize = 4;

export const DOTS_AND_BOXES_SIZE_OPTIONS: ReadonlyArray<{
  size: DotsAndBoxesSize;
  label: string;
  subtitle: string;
}> = [
  { size: 3, label: "3×3", subtitle: "Quick · 9 boxes" },
  { size: 4, label: "4×4", subtitle: "Classic · 16 boxes" },
  { size: 5, label: "5×5", subtitle: "Big · 25 boxes" },
];

export type DotsAndBoxesOrientation = "h" | "v";

export interface DotsAndBoxesMove {
  orientation: DotsAndBoxesOrientation;
  row: number;
  col: number;
}

export interface DotsAndBoxesLastMove {
  orientation: DotsAndBoxesOrientation;
  row: number;
  col: number;
  by: MemberId;
  claimedBoxes: number[];
  keptTurn: boolean;
}

export interface DotsAndBoxesState extends Record<string, unknown> {
  rows: DotsAndBoxesSize;
  cols: DotsAndBoxesSize;
  /** (rows + 1) * cols horizontal segments; index = row * cols + col */
  horizontalEdges: (MemberId | null)[];
  /** rows * (cols + 1) vertical segments; index = row * (cols + 1) + col */
  verticalEdges: (MemberId | null)[];
  /** rows * cols boxes; index = row * cols + col */
  boxes: (MemberId | null)[];
  scores: Record<MemberId, number>;
  lastMove: DotsAndBoxesLastMove | null;
}

export function normalizeDotsAndBoxesSize(raw: unknown): DotsAndBoxesSize {
  const num = typeof raw === "string" ? Number(raw) : raw;
  if (num === 3 || num === 4 || num === 5) {
    return num;
  }
  return DEFAULT_DOTS_AND_BOXES_SIZE;
}

export function hEdgeIndex(cols: number, row: number, col: number): number {
  return row * cols + col;
}

export function vEdgeIndex(cols: number, row: number, col: number): number {
  return row * (cols + 1) + col;
}

export function boxIndex(cols: number, row: number, col: number): number {
  return row * cols + col;
}

export function isBoxSurrounded(
  rows: number,
  cols: number,
  horizontalEdges: (MemberId | null)[],
  verticalEdges: (MemberId | null)[],
  boxRow: number,
  boxCol: number
): boolean {
  if (boxRow < 0 || boxRow >= rows || boxCol < 0 || boxCol >= cols) {
    return false;
  }
  const top = horizontalEdges[hEdgeIndex(cols, boxRow, boxCol)] !== null;
  const bottom = horizontalEdges[hEdgeIndex(cols, boxRow + 1, boxCol)] !== null;
  const left = verticalEdges[vEdgeIndex(cols, boxRow, boxCol)] !== null;
  const right = verticalEdges[vEdgeIndex(cols, boxRow, boxCol + 1)] !== null;
  return top && bottom && left && right;
}

export function createInitialDotsAndBoxesState(
  players: [MemberId, MemberId],
  options?: Record<string, unknown>
): DotsAndBoxesState {
  const size = normalizeDotsAndBoxesSize(options?.size);
  const [p1, p2] = players;
  return {
    rows: size,
    cols: size,
    horizontalEdges: Array<MemberId | null>((size + 1) * size).fill(null),
    verticalEdges: Array<MemberId | null>(size * (size + 1)).fill(null),
    boxes: Array<MemberId | null>(size * size).fill(null),
    scores: {
      [p1]: 0,
      [p2]: 0,
    },
    lastMove: null,
  };
}

export function isDotsAndBoxesState(
  raw: Record<string, unknown> | null | undefined
): raw is DotsAndBoxesState {
  if (!raw || typeof raw !== "object") return false;
  const rows = raw.rows;
  const cols = raw.cols;
  if (
    (rows !== 3 && rows !== 4 && rows !== 5) ||
    (cols !== 3 && cols !== 4 && cols !== 5) ||
    rows !== cols
  ) {
    return false;
  }
  return Boolean(
    Array.isArray(raw.horizontalEdges) &&
      raw.horizontalEdges.length === (rows + 1) * cols &&
      Array.isArray(raw.verticalEdges) &&
      raw.verticalEdges.length === rows * (cols + 1) &&
      Array.isArray(raw.boxes) &&
      raw.boxes.length === rows * cols &&
      raw.scores &&
      typeof raw.scores === "object"
  );
}

export const dotsAndBoxesGame: GameDefinition<
  DotsAndBoxesState,
  DotsAndBoxesMove
> = {
  id: "dots_and_boxes",
  name: "Dots & Boxes",
  shortDescription: "Draw lines to close boxes and earn bonus turns.",
  rulesSummary:
    "Connect dots one line at a time. Complete a box to claim it and go again!",
  emoji: "🟦",
  createInitialState: createInitialDotsAndBoxesState,
  extractRematchOptions(prevState) {
    if (isDotsAndBoxesState(prevState)) {
      return { size: prevState.rows };
    }
    return undefined;
  },
  validateAndApplyMove({
    state,
    move,
    playerId,
    players,
  }): MoveValidationResult<DotsAndBoxesState> {
    if (!move || typeof move !== "object") {
      return { ok: false, error: "Invalid move payload." };
    }

    if (!players.includes(playerId)) {
      return { ok: false, error: "You are not a player in this match." };
    }

    const { orientation, row, col } = move as DotsAndBoxesMove;
    if (orientation !== "h" && orientation !== "v") {
      return { ok: false, error: "Invalid line orientation." };
    }
    if (
      typeof row !== "number" ||
      !Number.isInteger(row) ||
      typeof col !== "number" ||
      !Number.isInteger(col)
    ) {
      return { ok: false, error: "Please choose a valid line on the board." };
    }

    const current = isDotsAndBoxesState(state)
      ? state
      : createInitialDotsAndBoxesState(players);
    const { rows, cols } = current;

    if (orientation === "h") {
      if (row < 0 || row > rows || col < 0 || col >= cols) {
        return { ok: false, error: "That line is outside the board." };
      }
    } else {
      if (row < 0 || row >= rows || col < 0 || col > cols) {
        return { ok: false, error: "That line is outside the board." };
      }
    }

    const nextHorizontal = [...current.horizontalEdges];
    const nextVertical = [...current.verticalEdges];

    if (orientation === "h") {
      const idx = hEdgeIndex(cols, row, col);
      if (nextHorizontal[idx] !== null) {
        return { ok: false, error: "That line has already been drawn." };
      }
      nextHorizontal[idx] = playerId;
    } else {
      const idx = vEdgeIndex(cols, row, col);
      if (nextVertical[idx] !== null) {
        return { ok: false, error: "That line has already been drawn." };
      }
      nextVertical[idx] = playerId;
    }

    const nextBoxes = [...current.boxes];
    const candidateCoords: Array<[number, number]> =
      orientation === "h"
        ? [
            ...(row > 0 ? ([[row - 1, col]] as Array<[number, number]>) : []),
            ...(row < rows ? ([[row, col]] as Array<[number, number]>) : []),
          ]
        : [
            ...(col > 0 ? ([[row, col - 1]] as Array<[number, number]>) : []),
            ...(col < cols ? ([[row, col]] as Array<[number, number]>) : []),
          ];

    const claimedBoxes: number[] = [];
    for (const [br, bc] of candidateCoords) {
      const bIdx = boxIndex(cols, br, bc);
      if (
        nextBoxes[bIdx] === null &&
        isBoxSurrounded(rows, cols, nextHorizontal, nextVertical, br, bc)
      ) {
        nextBoxes[bIdx] = playerId;
        claimedBoxes.push(bIdx);
      }
    }

    const [p1, p2] = players;
    const nextScores: Record<MemberId, number> = {
      [p1]: current.scores[p1] ?? 0,
      [p2]: current.scores[p2] ?? 0,
    };
    nextScores[playerId] = (nextScores[playerId] ?? 0) + claimedBoxes.length;

    const allClaimed = nextBoxes.every((owner) => owner !== null);
    const keptTurn = !allClaimed && claimedBoxes.length > 0;
    const lastMove: DotsAndBoxesLastMove = {
      orientation,
      row,
      col,
      by: playerId,
      claimedBoxes,
      keptTurn,
    };

    const nextState: DotsAndBoxesState = {
      rows,
      cols,
      horizontalEdges: nextHorizontal,
      verticalEdges: nextVertical,
      boxes: nextBoxes,
      scores: nextScores,
      lastMove,
    };

    if (allClaimed) {
      const p1Score = nextScores[p1] ?? 0;
      const p2Score = nextScores[p2] ?? 0;
      if (p1Score === p2Score) {
        return {
          ok: true,
          nextState,
          nextTurnId: null,
          completed: true,
          winnerId: null,
          outcome: "draw",
        };
      }
      const winnerId = p1Score > p2Score ? p1 : p2;
      return {
        ok: true,
        nextState,
        nextTurnId: null,
        completed: true,
        winnerId,
        outcome: "win",
      };
    }

    const opponentId = p1 === playerId ? p2 : p1;
    const nextTurnId = keptTurn ? playerId : opponentId;

    return {
      ok: true,
      nextState,
      nextTurnId,
      completed: false,
      winnerId: null,
      outcome: null,
    };
  },
};
