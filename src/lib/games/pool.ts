import type { MemberId } from "@/types/family";
import type { GameDefinition, MoveValidationResult } from "./types";
import {
  createInitialPoolBalls,
  findFreeSpot,
  FOOT_SPOT,
  HEAD_SPOT,
  isCueBallPlacementValid,
  simulatePoolShot,
  type PoolBall,
} from "./poolPhysics";

export type BallGroup = "solids" | "stripes";

export interface PoolMove {
  angle: number;
  power: number;
  cueBallPos?: { x: number; y: number } | null;
}

export interface PoolLastShot {
  seq: number;
  by: MemberId;
  move: PoolMove;
  preBalls: PoolBall[];
  summary: string;
  foul: boolean;
  keptTurn: boolean;
  pocketedBallIds: number[];
}

export interface PoolState extends Record<string, unknown> {
  balls: PoolBall[];
  groups: Record<MemberId, BallGroup | null>;
  isBreakShot: boolean;
  ballInHand: boolean;
  shotCount: number;
  lastShot: PoolLastShot | null;
}

export function getBallGroup(ballId: number): BallGroup | null {
  if (ballId >= 1 && ballId <= 7) return "solids";
  if (ballId >= 9 && ballId <= 15) return "stripes";
  return null;
}

export function getRemainingBallsForGroup(
  balls: PoolBall[],
  group: BallGroup
): PoolBall[] {
  return balls.filter(
    (b) => !b.pocketed && getBallGroup(b.id) === group
  );
}

export function createInitialPoolState(
  players: [MemberId, MemberId]
): PoolState {
  const [p1, p2] = players;
  return {
    balls: createInitialPoolBalls(),
    groups: {
      [p1]: null,
      [p2]: null,
    },
    isBreakShot: true,
    ballInHand: true, // Breaker may place cue ball anywhere behind head string
    shotCount: 0,
    lastShot: null,
  };
}

export function isPoolState(
  raw: Record<string, unknown> | null | undefined
): raw is PoolState {
  return Boolean(
    raw &&
      Array.isArray(raw.balls) &&
      raw.balls.length === 16 &&
      raw.groups &&
      typeof raw.groups === "object"
  );
}

export const poolGame: GameDefinition<PoolState, PoolMove> = {
  id: "pool",
  name: "8-Ball Pool",
  shortDescription: "Classic 15-ball rack with cue stick & power meter.",
  rulesSummary:
    "Sink your group (Solids 1–7 or Stripes 9–15), then pocket the 8-ball to win!",
  emoji: "🎱",
  createInitialState: createInitialPoolState,
  validateAndApplyMove({
    state,
    move,
    playerId,
    players,
  }): MoveValidationResult<PoolState> {
    if (!move || typeof move !== "object") {
      return { ok: false, error: "Invalid shot payload." };
    }

    const { angle, power, cueBallPos } = move as PoolMove;
    if (typeof angle !== "number" || !Number.isFinite(angle)) {
      return { ok: false, error: "Invalid aim angle." };
    }
    if (
      typeof power !== "number" ||
      !Number.isFinite(power) ||
      power < 0.04 ||
      power > 1
    ) {
      return { ok: false, error: "Shot power must be between 4% and 100%." };
    }

    const current = isPoolState(state)
      ? state
      : createInitialPoolState(players);

    if (!players.includes(playerId)) {
      return { ok: false, error: "You are not a player in this match." };
    }

    const opponentId = players[0] === playerId ? players[1] : players[0];
    const preBalls: PoolBall[] = current.balls.map((b) => ({ ...b }));
    const cueBall = preBalls.find((b) => b.id === 0);
    if (!cueBall) {
      return { ok: false, error: "Cue ball is missing from table state." };
    }

    // Apply optional Ball-in-Hand placement if allowed
    if (cueBallPos && typeof cueBallPos === "object") {
      if (!current.ballInHand) {
        return {
          ok: false,
          error: "You can only reposition the cue ball during Ball in Hand.",
        };
      }
      if (
        !isCueBallPlacementValid(
          cueBallPos.x,
          cueBallPos.y,
          preBalls,
          current.isBreakShot
        )
      ) {
        return {
          ok: false,
          error: current.isBreakShot
            ? "On the break, place the cue ball behind the head line."
            : "Cue ball cannot overlap another ball or pocket.",
        };
      }
      cueBall.x = Math.round(cueBallPos.x * 100) / 100;
      cueBall.y = Math.round(cueBallPos.y * 100) / 100;
      cueBall.pocketed = false;
    } else if (cueBall.pocketed) {
      const spot = findFreeSpot(HEAD_SPOT.x, HEAD_SPOT.y, preBalls, 0, true);
      cueBall.x = spot.x;
      cueBall.y = spot.y;
      cueBall.pocketed = false;
    }

    // Run deterministic physics simulation (server doesn't need animation frames)
    const sim = simulatePoolShot(preBalls, angle, power, {
      recordFrames: false,
    });

    const nextBalls = sim.finalBalls.map((b) => ({ ...b }));
    const pocketed = sim.pocketedBallIds;
    const scratched = pocketed.includes(0);
    const eightPocketed = pocketed.includes(8);
    const pocketedSolids = pocketed.filter((id) => id >= 1 && id <= 7);
    const pocketedStripes = pocketed.filter((id) => id >= 9 && id <= 15);
    const pocketedObjects = pocketed.filter((id) => id !== 0 && id !== 8);

    const prevShooterGroup = current.groups[playerId] ?? null;
    const shooterClearedBeforeShot =
      prevShooterGroup !== null &&
      getRemainingBallsForGroup(preBalls, prevShooterGroup).length === 0;

    // 1. Evaluate fouls
    let foul = false;
    let foulReason = "";

    if (scratched) {
      foul = true;
      foulReason = "Scratch";
    } else if (sim.firstContactBallId === null) {
      foul = true;
      foulReason = "No ball hit";
    } else if (!current.isBreakShot && prevShooterGroup !== null) {
      if (shooterClearedBeforeShot) {
        if (sim.firstContactBallId !== 8) {
          foul = true;
          foulReason = "Must hit the 8-ball first";
        }
      } else {
        const hitGroup = getBallGroup(sim.firstContactBallId);
        if (hitGroup !== prevShooterGroup) {
          foul = true;
          foulReason =
            sim.firstContactBallId === 8
              ? "Hit the 8-ball first"
              : `Hit opponent's ball first`;
        }
      }
    } else if (
      !current.isBreakShot &&
      prevShooterGroup === null &&
      sim.firstContactBallId === 8
    ) {
      foul = true;
      foulReason = "Hit the 8-ball first on an open table";
    }

    // 2. Respawn cue ball if scratched (opponent gets Ball-in-Hand)
    if (scratched) {
      const nextCue = nextBalls.find((b) => b.id === 0);
      if (nextCue) {
        const free = findFreeSpot(HEAD_SPOT.x, HEAD_SPOT.y, nextBalls, 0, false);
        nextCue.x = free.x;
        nextCue.y = free.y;
        nextCue.pocketed = false;
      }
    }

    const nextSeq = (current.shotCount || 0) + 1;
    const normalizedMove: PoolMove = {
      angle: Math.round(angle * 10000) / 10000,
      power: Math.round(power * 1000) / 1000,
      cueBallPos: current.ballInHand ? { x: cueBall.x, y: cueBall.y } : null,
    };

    // 3. Handle 8-ball pocketed
    if (eightPocketed) {
      if (current.isBreakShot) {
        // Casual rule: 8-ball on the break re-spots on the foot spot
        const eightBall = nextBalls.find((b) => b.id === 8);
        if (eightBall) {
          const spot = findFreeSpot(
            FOOT_SPOT.x,
            FOOT_SPOT.y,
            nextBalls,
            8,
            false
          );
          eightBall.x = spot.x;
          eightBall.y = spot.y;
          eightBall.pocketed = false;
        }
      } else {
        const wonLegally = shooterClearedBeforeShot && !foul;
        const winnerId = wonLegally ? playerId : opponentId;
        const summary = wonLegally
          ? "Sank the 8-ball to win the rack!"
          : foul
            ? `Foul on the 8-ball (${foulReason}) — loss of rack`
            : "Pocketed the 8-ball early — loss of rack";

        return {
          ok: true,
          nextState: {
            balls: nextBalls,
            groups: { ...current.groups },
            isBreakShot: false,
            ballInHand: false,
            shotCount: nextSeq,
            lastShot: {
              seq: nextSeq,
              by: playerId,
              move: normalizedMove,
              preBalls,
              summary,
              foul: !wonLegally,
              keptTurn: false,
              pocketedBallIds: pocketed,
            },
          },
          nextTurnId: null,
          completed: true,
          winnerId,
          outcome: "win",
        };
      }
    }

    // 4. Assign Solids / Stripes on first foul-free non-break pot
    const nextGroups: Record<MemberId, BallGroup | null> = {
      ...current.groups,
    };
    let assignedNewGroup: BallGroup | null = null;
    if (
      !current.isBreakShot &&
      prevShooterGroup === null &&
      !foul &&
      pocketedObjects.length > 0
    ) {
      // Assign based on first object ball pocketed (or majority if mixed)
      const firstObjGroup = getBallGroup(pocketedObjects[0]);
      if (firstObjGroup) {
        assignedNewGroup = firstObjGroup;
        nextGroups[playerId] = firstObjGroup;
        nextGroups[opponentId] =
          firstObjGroup === "solids" ? "stripes" : "solids";
      }
    }

    // 5. Determine if shooter keeps their turn
    const activeGroup = nextGroups[playerId] ?? null;
    let pocketedOwnBall = false;
    if (activeGroup === "solids") {
      pocketedOwnBall = pocketedSolids.length > 0;
    } else if (activeGroup === "stripes") {
      pocketedOwnBall = pocketedStripes.length > 0;
    } else {
      // Open table (break or open rack)
      pocketedOwnBall = pocketedObjects.length > 0;
    }

    const keptTurn = !foul && pocketedOwnBall;
    const nextTurnId = keptTurn ? playerId : opponentId;

    let summary = "";
    if (foul) {
      summary = `Foul (${foulReason}) — Ball in Hand`;
    } else if (current.isBreakShot && eightPocketed) {
      summary = keptTurn
        ? "8-ball spotted from break — shoot again!"
        : "Break complete (8-ball spotted)";
    } else if (assignedNewGroup) {
      summary = `Claimed ${assignedNewGroup === "solids" ? "Solids (1–7)" : "Stripes (9–15)"} — shoot again!`;
    } else if (keptTurn) {
      summary =
        pocketedObjects.length > 1
          ? `Pocketed ${pocketedObjects.length} balls — shoot again!`
          : "Nice shot! Shoot again.";
    } else if (current.isBreakShot) {
      summary = "Dry break — table is open";
    } else {
      summary = "No pocket — turn passes";
    }

    return {
      ok: true,
      nextState: {
        balls: nextBalls,
        groups: nextGroups,
        isBreakShot: false,
        ballInHand: foul,
        shotCount: nextSeq,
        lastShot: {
          seq: nextSeq,
          by: playerId,
          move: normalizedMove,
          preBalls,
          summary,
          foul,
          keptTurn,
          pocketedBallIds: pocketed,
        },
      },
      nextTurnId,
      completed: false,
      winnerId: null,
      outcome: null,
    };
  },
};
