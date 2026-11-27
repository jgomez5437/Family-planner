import type {
  FamilyGame,
  GameOutcome,
  GameTypeId,
  MemberId,
} from "@/types/family";

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
  /** Server clock for timed games; defaults to `new Date()`. */
  now?: Date;
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
  /** Only remote play supported (no Pass & Play). */
  remoteOnly?: boolean;
  /** Both players may move at any time; `currentTurnId` stays null while active. */
  simultaneous?: boolean;
  /** Called when an invite is accepted (e.g. to start a clock). */
  onActivate?: (state: TState, now: Date) => TState;
  /**
   * Strips secrets (e.g. solutions) and the other player's private data
   * before a game is sent to `viewerId`.
   */
  sanitizeForViewer?: (
    game: FamilyGame<TState>,
    viewerId: MemberId
  ) => FamilyGame<TState>;
  /** Lazy settlement for timed games. Returns null if not yet expired. */
  resolveTimeout?: (
    state: TState,
    players: [MemberId, MemberId],
    now: Date
  ) => null | {
    nextState: TState;
    winnerId: MemberId | null;
    outcome: GameOutcome;
  };
}
