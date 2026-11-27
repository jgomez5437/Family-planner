import type {
  FamilyGame,
  GameTypeId,
  Member,
  MemberId,
} from "@/types/family";
import { ticTacToeGame } from "./ticTacToe";
import { poolGame } from "./pool";
import { dotsAndBoxesGame } from "./dotsAndBoxes";
import { sudokuGame } from "./sudoku";
import type { GameDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_DEFINITIONS: GameDefinition<any, any>[] = [
  ticTacToeGame,
  poolGame,
  dotsAndBoxesGame,
  sudokuGame,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_DEFINITION_BY_ID: Record<GameTypeId, GameDefinition<any, any>> = {
  tic_tac_toe: ticTacToeGame,
  pool: poolGame,
  dots_and_boxes: dotsAndBoxesGame,
  sudoku: sudokuGame,
};

export function getGameDefinition(
  gameType: string | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): GameDefinition<any, any> | null {
  if (!gameType) return null;
  if (gameType in GAME_DEFINITION_BY_ID) {
    return GAME_DEFINITION_BY_ID[gameType as GameTypeId];
  }
  return null;
}

/**
 * Removes hidden information (e.g. Sudoku solutions, opponent's private board)
 * before sending a game to `viewerId`.
 */
export function sanitizeGameForViewer(
  game: FamilyGame,
  viewerId: MemberId
): FamilyGame {
  const def = getGameDefinition(game.gameType);
  return def?.sanitizeForViewer ? def.sanitizeForViewer(game, viewerId) : game;
}

export function sanitizeGamesForViewer(
  games: FamilyGame[],
  viewerId: MemberId
): FamilyGame[] {
  return games.map((g) => sanitizeGameForViewer(g, viewerId));
}

/**
 * Counts games requiring immediate attention from `memberId`:
 * - Pending incoming remote challenges awaiting Accept / Decline
 * - Active remote games where it is currently `memberId`'s turn
 * - Active real-time (simultaneous) games `memberId` is playing
 */
export function countActionableGamesForMember(
  games: FamilyGame[],
  memberId: MemberId
): number {
  let count = 0;
  for (const g of games) {
    if (g.mode !== "remote") continue;
    if (g.status === "pending" && g.opponentId === memberId) {
      count += 1;
    } else if (g.status === "active" && g.currentTurnId === memberId) {
      count += 1;
    } else if (
      g.status === "active" &&
      g.players.includes(memberId) &&
      getGameDefinition(g.gameType)?.simultaneous
    ) {
      count += 1;
    }
  }
  return count;
}

export interface ScoreboardEntry {
  memberId: MemberId;
  wins: number;
  losses: number;
  draws: number;
  played: number;
  winRate: number; // 0..100 integer percentage
}

/**
 * Computes competitive W/L/D statistics across completed remote matches.
 * Same-device Pass & Play matches are intentionally excluded so local games
 * do not skew head-to-head family rankings.
 */
export function computeFamilyScoreboard(
  games: FamilyGame[],
  members: Member[]
): ScoreboardEntry[] {
  const stats = new Map<
    MemberId,
    { wins: number; losses: number; draws: number }
  >();

  for (const m of members) {
    stats.set(m.id, { wins: 0, losses: 0, draws: 0 });
  }

  const ensureEntry = (id: MemberId) => {
    let entry = stats.get(id);
    if (!entry) {
      entry = { wins: 0, losses: 0, draws: 0 };
      stats.set(id, entry);
    }
    return entry;
  };

  for (const g of games) {
    if (g.mode !== "remote" || g.status !== "completed") continue;
    const [p1, p2] = g.players;
    if (g.outcome === "draw") {
      ensureEntry(p1).draws += 1;
      ensureEntry(p2).draws += 1;
    } else if (
      (g.outcome === "win" || g.outcome === "forfeit") &&
      g.winnerId
    ) {
      const loserId = g.winnerId === p1 ? p2 : p1;
      ensureEntry(g.winnerId).wins += 1;
      ensureEntry(loserId).losses += 1;
    }
  }

  const rows: ScoreboardEntry[] = [];
  for (const [memberId, s] of stats.entries()) {
    const played = s.wins + s.losses + s.draws;
    if (played === 0) continue;
    rows.push({
      memberId,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      played,
      winRate: Math.round((s.wins / played) * 100),
    });
  }

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.draws !== a.draws) return b.draws - a.draws;
    return b.played - a.played;
  });

  return rows;
}
