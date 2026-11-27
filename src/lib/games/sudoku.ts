import type { FamilyGame, MemberId } from "@/types/family";
import type { GameDefinition, MoveValidationResult } from "./types";
import { generatePuzzle } from "./sudokuGenerator";

export type SudokuDifficulty = "easy" | "medium" | "hard";
export type SudokuBoardMode = "shared" | "separate";
export type SudokuTimeLimit = 5 | 10 | 15 | 20;

export const SUDOKU_WRONG_GUESS_LOCKOUT_MS = 3000;
/** Absorbs minor client/server clock or network jitter right as a 3s lockout ends. */
export const SUDOKU_LOCKOUT_GRACE_MS = 250;

export const SUDOKU_DIFFICULTY_OPTIONS: ReadonlyArray<{
  id: SudokuDifficulty;
  label: string;
  subtitle: string;
}> = [
  { id: "easy", label: "Easy", subtitle: "≈42 clues" },
  { id: "medium", label: "Medium", subtitle: "≈33 clues" },
  { id: "hard", label: "Hard", subtitle: "≈27 clues" },
];

export const SUDOKU_BOARD_MODE_OPTIONS: ReadonlyArray<{
  id: SudokuBoardMode;
  label: string;
  subtitle: string;
}> = [
  {
    id: "shared",
    label: "Shared board",
    subtitle: "Race on one grid — most correct guesses wins",
  },
  {
    id: "separate",
    label: "Separate boards",
    subtitle: "Same puzzle, own grids — first to finish wins",
  },
];

export const SUDOKU_TIME_OPTIONS: ReadonlyArray<SudokuTimeLimit> = [
  5, 10, 15, 20,
];

export const DEFAULT_SUDOKU_OPTIONS = {
  difficulty: "medium" as SudokuDifficulty,
  boardMode: "shared" as SudokuBoardMode,
  timeLimitMinutes: 10 as SudokuTimeLimit,
};

export type SudokuEventResult = "correct" | "wrong" | "set" | "clear";

export interface SudokuLastEvent {
  by: MemberId;
  cell: number;
  result: SudokuEventResult;
  at: string;
}

export interface SudokuState extends Record<string, unknown> {
  difficulty: SudokuDifficulty;
  boardMode: SudokuBoardMode;
  timeLimitMinutes: SudokuTimeLimit;
  /** 81 clues, 0 = empty. */
  puzzle: number[];
  /** 81 values. Server-only while the match is live (stripped for clients). */
  solution?: number[];
  startedAt: string | null;
  endsAt: string | null;
  /** Number of empty (non-clue) cells. */
  emptyCount: number;

  /* Shared board */
  claims: (MemberId | null)[];
  sharedValues: number[];
  scores: Record<MemberId, number>;
  misses: Record<MemberId, number>;
  lockouts: Record<MemberId, string | null>;

  /* Separate boards */
  /** Player entries (81, 0 = empty). Clients only receive their own while live. */
  boards: Record<MemberId, number[]>;
  /** Public count of filled (not necessarily correct) cells per player. */
  filled: Record<MemberId, number>;
  /** When a player's grid is full but wrong: how many cells are wrong. */
  fullButWrong: Record<MemberId, number>;
  /** Correct-cell counts, revealed when the match ends. */
  finalCorrect: Record<MemberId, number> | null;

  finishedBy: MemberId | null;
  timedOut: boolean;
  lastEvent: SudokuLastEvent | null;
}

export type SudokuMove =
  | { kind: "guess"; cell: number; value: number }
  | { kind: "set"; cell: number; value: number };

export function normalizeSudokuOptions(options?: Record<string, unknown>) {
  const d = options?.difficulty;
  const m = options?.boardMode;
  const t = Number(options?.timeLimitMinutes);
  return {
    difficulty: (d === "easy" || d === "medium" || d === "hard"
      ? d
      : DEFAULT_SUDOKU_OPTIONS.difficulty) as SudokuDifficulty,
    boardMode: (m === "shared" || m === "separate"
      ? m
      : DEFAULT_SUDOKU_OPTIONS.boardMode) as SudokuBoardMode,
    timeLimitMinutes: (t === 5 || t === 10 || t === 15 || t === 20
      ? t
      : DEFAULT_SUDOKU_OPTIONS.timeLimitMinutes) as SudokuTimeLimit,
  };
}

export function createInitialSudokuState(
  players: [MemberId, MemberId],
  options?: Record<string, unknown>
): SudokuState {
  const opts = normalizeSudokuOptions(options);
  const { puzzle, solution } = generatePuzzle(opts.difficulty);
  const [p1, p2] = players;
  const emptyCount = puzzle.filter((v) => v === 0).length;
  return {
    ...opts,
    puzzle,
    solution,
    startedAt: null,
    endsAt: null,
    emptyCount,
    claims: Array<MemberId | null>(81).fill(null),
    sharedValues: Array<number>(81).fill(0),
    scores: { [p1]: 0, [p2]: 0 },
    misses: { [p1]: 0, [p2]: 0 },
    lockouts: { [p1]: null, [p2]: null },
    boards: {
      [p1]: Array<number>(81).fill(0),
      [p2]: Array<number>(81).fill(0),
    },
    filled: { [p1]: 0, [p2]: 0 },
    fullButWrong: {},
    finalCorrect: null,
    finishedBy: null,
    timedOut: false,
    lastEvent: null,
  };
}

export function isSudokuState(
  raw: Record<string, unknown> | null | undefined
): raw is SudokuState {
  if (!raw || typeof raw !== "object") return false;
  return (
    Array.isArray(raw.puzzle) &&
    raw.puzzle.length === 81 &&
    (raw.boardMode === "shared" || raw.boardMode === "separate") &&
    Array.isArray(raw.claims) &&
    typeof raw.boards === "object" &&
    raw.boards !== null
  );
}

function countCorrect(entries: number[] | undefined, solution: number[]) {
  if (!entries) return 0;
  let n = 0;
  for (let i = 0; i < 81; i += 1) {
    if (entries[i] && entries[i] === solution[i]) n += 1;
  }
  return n;
}

function decideByScore(
  a: MemberId,
  b: MemberId,
  scoreA: number,
  scoreB: number
): { winnerId: MemberId | null; outcome: "win" | "draw" } {
  if (scoreA === scoreB) return { winnerId: null, outcome: "draw" };
  return { winnerId: scoreA > scoreB ? a : b, outcome: "win" };
}

function computeFinalCorrect(
  state: SudokuState,
  players: [MemberId, MemberId]
): Record<MemberId, number> {
  const [p1, p2] = players;
  if (state.boardMode === "shared") {
    return { [p1]: state.scores[p1] ?? 0, [p2]: state.scores[p2] ?? 0 };
  }
  const solution = state.solution || [];
  return {
    [p1]: countCorrect(state.boards[p1], solution),
    [p2]: countCorrect(state.boards[p2], solution),
  };
}

export function formatSudokuSettings(state: SudokuState): string {
  const diff =
    state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
  const mode = state.boardMode === "shared" ? "Shared" : "Separate";
  return `${diff} · ${mode} · ${state.timeLimitMinutes} min`;
}

export const sudokuGame: GameDefinition<SudokuState, SudokuMove> = {
  id: "sudoku",
  name: "Versus Sudoku",
  shortDescription: "Real-time Sudoku race on a timer.",
  rulesSummary: "",
  emoji: "🔢",
  remoteOnly: true,
  simultaneous: true,
  createInitialState: createInitialSudokuState,

  extractRematchOptions(prevState) {
    if (!isSudokuState(prevState)) return undefined;
    return {
      difficulty: prevState.difficulty,
      boardMode: prevState.boardMode,
      timeLimitMinutes: prevState.timeLimitMinutes,
    };
  },

  onActivate(state, now) {
    return {
      ...state,
      startedAt: now.toISOString(),
      endsAt: new Date(
        now.getTime() + state.timeLimitMinutes * 60_000
      ).toISOString(),
    };
  },

  resolveTimeout(state, players, now) {
    if (!isSudokuState(state) || !state.endsAt) return null;
    if (now.getTime() < Date.parse(state.endsAt)) return null;
    const finalCorrect = computeFinalCorrect(state, players);
    const [p1, p2] = players;
    const { winnerId, outcome } = decideByScore(
      p1,
      p2,
      finalCorrect[p1] ?? 0,
      finalCorrect[p2] ?? 0
    );
    return {
      nextState: { ...state, timedOut: true, finalCorrect },
      winnerId,
      outcome,
    };
  },

  sanitizeForViewer(game: FamilyGame<SudokuState>, viewerId) {
    if (game.status === "completed") return game; // reveal everything after the match
    const state = game.state;
    if (!isSudokuState(state)) return game;
    const { solution: _solution, ...rest } = state;
    void _solution;
    const puzzle =
      game.status === "pending" ? Array<number>(81).fill(0) : state.puzzle;
    const boards: Record<MemberId, number[]> = {};
    if (state.boards[viewerId]) boards[viewerId] = state.boards[viewerId];
    const hideOthersMoves = state.boardMode === "separate";
    return {
      ...game,
      state: { ...rest, puzzle, boards } as SudokuState,
      moves: hideOthersMoves
        ? game.moves.map((m) =>
            m.by === viewerId ? m : { by: m.by, move: null, at: m.at }
          )
        : game.moves,
    };
  },

  validateAndApplyMove({
    state,
    move,
    playerId,
    players,
    now: nowArg,
  }): MoveValidationResult<SudokuState> {
    const now = nowArg ?? new Date();
    if (!isSudokuState(state)) {
      return { ok: false, error: "Invalid Sudoku state." };
    }
    if (!players.includes(playerId)) {
      return { ok: false, error: "You are not a player in this match." };
    }
    const solution = state.solution;
    if (!solution || solution.length !== 81) {
      return { ok: false, error: "Sudoku moves are checked by the server." };
    }
    if (!state.startedAt || !state.endsAt) {
      return { ok: false, error: "The match hasn't started yet." };
    }
    if (now.getTime() >= Date.parse(state.endsAt)) {
      return { ok: false, error: "Time's up!" };
    }
    if (!move || typeof move !== "object") {
      return { ok: false, error: "Invalid move payload." };
    }
    const { kind, cell, value } = move as SudokuMove;
    if (
      typeof cell !== "number" ||
      !Number.isInteger(cell) ||
      cell < 0 ||
      cell > 80
    ) {
      return { ok: false, error: "Pick a cell on the board." };
    }
    if (state.puzzle[cell] !== 0) {
      return { ok: false, error: "That's a starting number." };
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false, error: "Pick a number from 1 to 9." };
    }

    const nowIso = now.toISOString();
    const [p1, p2] = players;

    /* ---------- Shared board ---------- */
    if (state.boardMode === "shared") {
      if (kind !== "guess") {
        return { ok: false, error: "Invalid move for a shared board." };
      }
      if (value < 1 || value > 9) {
        return { ok: false, error: "Pick a number from 1 to 9." };
      }
      const lockedUntil = state.lockouts[playerId];
      if (
        lockedUntil &&
        now.getTime() + SUDOKU_LOCKOUT_GRACE_MS < Date.parse(lockedUntil)
      ) {
        return { ok: false, error: "Locked out — wait a moment!" };
      }
      if (state.claims[cell]) {
        return {
          ok: false,
          error:
            state.claims[cell] === playerId
              ? "You already solved that cell."
              : "Too slow — that cell was just claimed!",
        };
      }

      if (solution[cell] !== value) {
        const nextState: SudokuState = {
          ...state,
          misses: {
            ...state.misses,
            [playerId]: (state.misses[playerId] ?? 0) + 1,
          },
          lockouts: {
            ...state.lockouts,
            [playerId]: new Date(
              now.getTime() + SUDOKU_WRONG_GUESS_LOCKOUT_MS
            ).toISOString(),
          },
          lastEvent: { by: playerId, cell, result: "wrong", at: nowIso },
        };
        return {
          ok: true,
          nextState,
          nextTurnId: null,
          completed: false,
          winnerId: null,
          outcome: null,
        };
      }

      const claims = [...state.claims];
      claims[cell] = playerId;
      const sharedValues = [...state.sharedValues];
      sharedValues[cell] = value;
      const scores = {
        ...state.scores,
        [playerId]: (state.scores[playerId] ?? 0) + 1,
      };
      const claimedCount = claims.filter(Boolean).length;
      const boardFull = claimedCount >= state.emptyCount;
      let nextState: SudokuState = {
        ...state,
        claims,
        sharedValues,
        scores,
        lockouts: {
          ...state.lockouts,
          [playerId]: null,
        },
        lastEvent: { by: playerId, cell, result: "correct", at: nowIso },
      };
      if (boardFull) {
        const finalCorrect = { [p1]: scores[p1] ?? 0, [p2]: scores[p2] ?? 0 };
        nextState = { ...nextState, finalCorrect };
        const { winnerId, outcome } = decideByScore(
          p1,
          p2,
          finalCorrect[p1],
          finalCorrect[p2]
        );
        return {
          ok: true,
          nextState,
          nextTurnId: null,
          completed: true,
          winnerId,
          outcome,
        };
      }
      return {
        ok: true,
        nextState,
        nextTurnId: null,
        completed: false,
        winnerId: null,
        outcome: null,
      };
    }

    /* ---------- Separate boards ---------- */
    if (kind !== "set") {
      return { ok: false, error: "Invalid move for separate boards." };
    }
    if (value < 0 || value > 9) {
      return { ok: false, error: "Pick a number from 1 to 9." };
    }
    const board = [...(state.boards[playerId] || Array<number>(81).fill(0))];
    if (board[cell] === value) {
      return { ok: false, error: "No change." };
    }
    board[cell] = value;
    let filledCount = 0;
    let wrongCount = 0;
    for (let i = 0; i < 81; i += 1) {
      if (state.puzzle[i] !== 0) continue;
      if (board[i]) {
        filledCount += 1;
        if (board[i] !== solution[i]) wrongCount += 1;
      }
    }
    const isFull = filledCount >= state.emptyCount;
    const fullButWrong = { ...state.fullButWrong };
    if (isFull && wrongCount > 0) fullButWrong[playerId] = wrongCount;
    else delete fullButWrong[playerId];

    let nextState: SudokuState = {
      ...state,
      boards: { ...state.boards, [playerId]: board },
      filled: { ...state.filled, [playerId]: filledCount },
      fullButWrong,
      lastEvent: {
        by: playerId,
        cell,
        result: value === 0 ? "clear" : "set",
        at: nowIso,
      },
    };

    if (isFull && wrongCount === 0) {
      nextState = {
        ...nextState,
        finishedBy: playerId,
        finalCorrect: computeFinalCorrect(nextState, players),
      };
      return {
        ok: true,
        nextState,
        nextTurnId: null,
        completed: true,
        winnerId: playerId,
        outcome: "win",
      };
    }

    return {
      ok: true,
      nextState,
      nextTurnId: null,
      completed: false,
      winnerId: null,
      outcome: null,
    };
  },
};
