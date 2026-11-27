import type { GameOutcome, GameTypeId, MemberId } from "@/types/family";

export type MoveValidationResult<TState = Record<string, unknown>> =
  | {
      ok: true;
      nextState: TState;
      nextTurnId: MemberId | null;
      completed: boolean;
      winnerId: MemberId | null;
      outcome: GameOutcome;
    }
  | {
      ok: false;
      error: string;
    };

export interface GameMoveContext<
  TState = Record<string, unknown>,
  TMove = unknown,
> {
  state: TState;
  move: TMove;
  playerId: MemberId;
  players: [MemberId, MemberId];
}

/**
 * Pluggable turn-based game contract.
 * Adding a new game requires implementing this interface and registering it
 * in `src/lib/games/registry.ts` plus its board renderer component.
 */
export interface GameDefinition<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TMove = unknown,
> {
  id: GameTypeId;
  name: string;
  shortDescription: string;
  rulesSummary: string;
  emoji: string;
  createInitialState: (
    players: [MemberId, MemberId],
    options?: Record<string, unknown>
  ) => TState;
  extractRematchOptions?: (
    prevState: TState
  ) => Record<string, unknown> | undefined;
  validateAndApplyMove: (
    ctx: GameMoveContext<TState, TMove>
  ) => MoveValidationResult<TState>;
}
