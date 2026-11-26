import type { MemberId } from "@/types/family";
import type { GameDefinition, MoveValidationResult } from "./types";

export type TicTacToeMark = "X" | "O";

export interface TicTacToeState extends Record<string, unknown> {
  board: (TicTacToeMark | null)[];
  marks: Record<MemberId, TicTacToeMark>;
  winningLine: number[] | null;
  lastMoveIndex: number | null;
}

export interface TicTacToeMove {
  index: number;
}

export const TIC_TAC_TOE_WINNING_LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function findTicTacToeWinningLine(
  board: (TicTacToeMark | null)[]
): { mark: TicTacToeMark; line: number[] } | null {
  for (const [a, b, c] of TIC_TAC_TOE_WINNING_LINES) {
    const val = board[a];
    if (val && val === board[b] && val === board[c]) {
      return { mark: val, line: [a, b, c] };
    }
  }
  return null;
}

export function createInitialTicTacToeState(
  players: [MemberId, MemberId]
): TicTacToeState {
  const [firstPlayer, secondPlayer] = players;
  return {
    board: Array<TicTacToeMark | null>(9).fill(null),
    marks: {
      [firstPlayer]: "X",
      [secondPlayer]: "O",
    },
    winningLine: null,
    lastMoveIndex: null,
  };
}

export function isTicTacToeState(
  raw: Record<string, unknown> | null | undefined
): raw is TicTacToeState {
  return Boolean(
    raw &&
      Array.isArray(raw.board) &&
      raw.board.length === 9 &&
      raw.marks &&
      typeof raw.marks === "object"
  );
}

export const ticTacToeGame: GameDefinition<TicTacToeState, TicTacToeMove> = {
  id: "tic_tac_toe",
  name: "Tic-Tac-Toe",
  shortDescription: "Classic 3×3 race to get three in a row.",
  rulesSummary: "Take turns placing X and O. First to align three wins!",
  emoji: "⭕",
  createInitialState: createInitialTicTacToeState,
  validateAndApplyMove({
    state,
    move,
    playerId,
    players,
  }): MoveValidationResult<TicTacToeState> {
    if (!move || typeof move !== "object") {
      return { ok: false, error: "Invalid move payload." };
    }
    const index = (move as TicTacToeMove).index;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 8
    ) {
      return { ok: false, error: "Please choose a valid square on the board." };
    }

    const normalizedState = isTicTacToeState(state)
      ? state
      : createInitialTicTacToeState(players);

    const mark = normalizedState.marks[playerId];
    if (!mark) {
      return { ok: false, error: "You are not a player in this match." };
    }

    if (normalizedState.board[index] !== null) {
      return { ok: false, error: "That square is already taken." };
    }

    const nextBoard = [...normalizedState.board];
    nextBoard[index] = mark;

    const win = findTicTacToeWinningLine(nextBoard);
    if (win) {
      return {
        ok: true,
        nextState: {
          ...normalizedState,
          board: nextBoard,
          winningLine: win.line,
          lastMoveIndex: index,
        },
        nextTurnId: null,
        completed: true,
        winnerId: playerId,
        outcome: "win",
      };
    }

    const isDraw = nextBoard.every((cell) => cell !== null);
    if (isDraw) {
      return {
        ok: true,
        nextState: {
          ...normalizedState,
          board: nextBoard,
          winningLine: null,
          lastMoveIndex: index,
        },
        nextTurnId: null,
        completed: true,
        winnerId: null,
        outcome: "draw",
      };
    }

    const nextTurnId = players[0] === playerId ? players[1] : players[0];
    return {
      ok: true,
      nextState: {
        ...normalizedState,
        board: nextBoard,
        winningLine: null,
        lastMoveIndex: index,
      },
      nextTurnId,
      completed: false,
      winnerId: null,
      outcome: null,
    };
  },
};
