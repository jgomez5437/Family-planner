"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { CARD_SHADOW } from "@/lib/constants";
import {
  BALL_RADIUS,
  computeAimPreview,
  findFreeSpot,
  HEAD_STRING_X,
  isCueBallPlacementValid,
  POCKETS,
  POOL_BALL_VISUALS,
  simulatePoolShot,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  type PoolBall,
  type PoolFrameBall,
} from "@/lib/games/poolPhysics";
import {
  createInitialPoolState,
  getBallGroup,
  getRemainingBallsForGroup,
  isPoolState,
  type BallGroup,
  type PoolMove,
} from "@/lib/games/pool";
import { useMembers } from "@/components/MembersContext";
import { AvatarDot } from "@/components/ui/Primitives";
import type { FamilyGame, MemberId } from "@/types/family";

const RAIL = 46;
const H_CANVAS_W = TABLE_WIDTH + RAIL * 2; // 1092
const H_CANVAS_H = TABLE_HEIGHT + RAIL * 2; // 592
const V_CANVAS_W = H_CANVAS_H; // 592
const V_CANVAS_H = H_CANVAS_W; // 1092

function tableToCanvas(tx: number, ty: number, vertical: boolean) {
  if (!vertical) {
    return { cx: RAIL + tx, cy: RAIL + ty };
  }
  return { cx: RAIL + ty, cy: RAIL + (TABLE_WIDTH - tx) };
}

function canvasToTable(cx: number, cy: number, vertical: boolean) {
  if (!vertical) {
    return { tx: cx - RAIL, ty: cy - RAIL };
  }
  return { tx: TABLE_WIDTH - (cy - RAIL), ty: cx - RAIL };
}

function tableAngleToCanvasAngle(angle: number, vertical: boolean): number {
  return vertical ? angle - Math.PI / 2 : angle;
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: PoolFrameBall,
  vertical: boolean,
  scale = 1
) {
  if (ball.pocketed) return;
  const { cx, cy } = tableToCanvas(ball.x, ball.y, vertical);
  const r = BALL_RADIUS * scale;
  const visual = POOL_BALL_VISUALS[ball.id] || {
    color: "#FAF7F0",
    stripe: false,
  };

  // Drop shadow
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + 2.5, cy + 3.2, r * 1.02, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.fill();
  ctx.restore();

  // Ball body clipped to sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (ball.id === 0) {
    // Cue ball
    ctx.fillStyle = "#FAF7F0";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Subtle pro-cup red dot
    ctx.beginPath();
    ctx.arc(cx + r * 0.28, cy + r * 0.22, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = "#DC2626";
    ctx.fill();
  } else if (visual.stripe) {
    // Ivory base + colored stripe band
    ctx.fillStyle = "#FAF7F0";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = visual.color;
    ctx.fillRect(cx - r, cy - r * 0.54, r * 2, r * 1.08);
  } else {
    ctx.fillStyle = visual.color;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 3D spherical shading
  const shadeGrad = ctx.createRadialGradient(
    cx - r * 0.34,
    cy - r * 0.34,
    r * 0.12,
    cx,
    cy,
    r * 1.08
  );
  shadeGrad.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  shadeGrad.addColorStop(0.38, "rgba(255, 255, 255, 0.05)");
  shadeGrad.addColorStop(0.75, "rgba(0, 0, 0, 0.16)");
  shadeGrad.addColorStop(1, "rgba(0, 0, 0, 0.46)");
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Number badge for object balls
  if (ball.id > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.47, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 252, 245, 0.94)";
    ctx.fill();

    ctx.fillStyle = "#18181B";
    ctx.font = `800 ${Math.round(r * 0.72)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(ball.id), cx, cy + 0.5);
  }

  // Crisp glossy specular highlight
  ctx.beginPath();
  ctx.ellipse(
    cx - r * 0.32,
    cy - r * 0.36,
    r * 0.24,
    r * 0.14,
    -Math.PI / 5,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fill();

  ctx.restore();
}

function drawPoolTable(
  ctx: CanvasRenderingContext2D,
  vertical: boolean,
  highlightKitchen: boolean
) {
  const cw = vertical ? V_CANVAS_W : H_CANVAS_W;
  const ch = vertical ? V_CANVAS_H : H_CANVAS_H;

  ctx.clearRect(0, 0, cw, ch);

  // 1. Outer Walnut Wood Frame
  const woodGrad = ctx.createLinearGradient(0, 0, cw, ch);
  woodGrad.addColorStop(0, "#6E3B1E");
  woodGrad.addColorStop(0.35, "#4E2712");
  woodGrad.addColorStop(0.7, "#5E3117");
  woodGrad.addColorStop(1, "#3A1C0C");

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, cw, ch, 26);
  ctx.fillStyle = woodGrad;
  ctx.fill();

  // Subtle wood rim highlight
  ctx.strokeStyle = "rgba(255, 224, 178, 0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Brass corner accent plates
  const plateSize = 46;
  const brassGrad = ctx.createLinearGradient(0, 0, cw, ch);
  brassGrad.addColorStop(0, "#D9AD5B");
  brassGrad.addColorStop(0.5, "#A6772E");
  brassGrad.addColorStop(1, "#D2A34F");
  ctx.fillStyle = brassGrad;
  const corners = [
    [0, 0, 26, 0, 0, 0],
    [cw - plateSize, 0, 0, 26, 0, 0],
    [0, ch - plateSize, 0, 0, 0, 26],
    [cw - plateSize, ch - plateSize, 0, 0, 26, 0],
  ];
  for (const [x, y, r1, r2, r3, r4] of corners) {
    ctx.beginPath();
    ctx.roundRect(x, y, plateSize, plateSize, [r1, r2, r3, r4]);
    ctx.fill();
  }

  // 2. Inner Rail Cushion Frame
  const feltX = RAIL;
  const feltY = RAIL;
  const feltW = cw - RAIL * 2;
  const feltH = ch - RAIL * 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(feltX - 11, feltY - 11, feltW + 22, feltH + 22, 10);
  ctx.fillStyle = "#0B4A33";
  ctx.fill();
  ctx.restore();

  // 3. Tournament Emerald Felt Surface
  const feltGrad = ctx.createRadialGradient(
    cw / 2,
    ch / 2,
    40,
    cw / 2,
    ch / 2,
    Math.max(feltW, feltH) * 0.72
  );
  feltGrad.addColorStop(0, "#1C8C61");
  feltGrad.addColorStop(0.62, "#14724E");
  feltGrad.addColorStop(1, "#0E573B");

  ctx.save();
  ctx.beginPath();
  ctx.rect(feltX, feltY, feltW, feltH);
  ctx.fillStyle = feltGrad;
  ctx.fill();

  // Soft rail shadow onto felt
  ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
  ctx.lineWidth = 10;
  ctx.strokeRect(feltX - 2, feltY - 2, feltW + 4, feltH + 4);

  // Subtle kitchen highlight on opening break
  if (highlightKitchen) {
    ctx.fillStyle = "rgba(255, 248, 220, 0.08)";
    if (!vertical) {
      ctx.fillRect(feltX, feltY, HEAD_STRING_X, feltH);
    } else {
      ctx.fillRect(
        feltX,
        feltY + (TABLE_WIDTH - HEAD_STRING_X),
        feltW,
        HEAD_STRING_X
      );
    }
  }

  // Head string (baulk line)
  const hs1 = tableToCanvas(HEAD_STRING_X, 6, vertical);
  const hs2 = tableToCanvas(HEAD_STRING_X, TABLE_HEIGHT - 6, vertical);
  ctx.beginPath();
  ctx.moveTo(hs1.cx, hs1.cy);
  ctx.lineTo(hs2.cx, hs2.cy);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Head spot & Foot spot
  const spots = [
    tableToCanvas(225, 250, vertical),
    tableToCanvas(750, 250, vertical),
  ];
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  for (const s of spots) {
    ctx.beginPath();
    ctx.arc(s.cx, s.cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Ivory Diamond Sights along rails
  const diamondCoords: { cx: number; cy: number }[] = [];
  for (const frac of [1 / 8, 2 / 8, 3 / 8, 5 / 8, 6 / 8, 7 / 8]) {
    const tx = TABLE_WIDTH * frac;
    const top = tableToCanvas(tx, 0, vertical);
    const bot = tableToCanvas(tx, TABLE_HEIGHT, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: top.cx, cy: RAIL / 2 - 2 });
      diamondCoords.push({ cx: bot.cx, cy: ch - RAIL / 2 + 2 });
    } else {
      diamondCoords.push({ cx: RAIL / 2 - 2, cy: top.cy });
      diamondCoords.push({ cx: cw - RAIL / 2 + 2, cy: bot.cy });
    }
  }
  for (const frac of [1 / 4, 2 / 4, 3 / 4]) {
    const ty = TABLE_HEIGHT * frac;
    const left = tableToCanvas(0, ty, vertical);
    const right = tableToCanvas(TABLE_WIDTH, ty, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: RAIL / 2 - 2, cy: left.cy });
      diamondCoords.push({ cx: cw - RAIL / 2 + 2, cy: right.cy });
    } else {
      diamondCoords.push({ cx: left.cx, cy: ch - RAIL / 2 + 2 });
      diamondCoords.push({ cx: right.cx, cy: RAIL / 2 - 2 });
    }
  }

  ctx.fillStyle = "#F4E6C8";
  for (const d of diamondCoords) {
    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
  }

  // 5. Six Pockets
  for (const p of POCKETS) {
    const { cx, cy } = tableToCanvas(p.x, p.y, vertical);
    // Outer leather collar
    ctx.beginPath();
    ctx.arc(cx, cy, p.visualRadius + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1E120A";
    ctx.fill();
    // Deep pocket hole
    const holeGrad = ctx.createRadialGradient(
      cx,
      cy,
      2,
      cx,
      cy,
      p.visualRadius
    );
    holeGrad.addColorStop(0, "#050505");
    holeGrad.addColorStop(0.75, "#0D0B09");
    holeGrad.addColorStop(1, "#211914");
    ctx.beginPath();
    ctx.arc(cx, cy, p.visualRadius, 0, Math.PI * 2);
    ctx.fillStyle = holeGrad;
    ctx.fill();
  }
}

function drawCueStick(
  ctx: CanvasRenderingContext2D,
  cueX: number,
  cueY: number,
  canvasAngle: number,
  pullbackOffset: number
) {
  ctx.save();
  ctx.translate(cueX, cueY);
  // Cue stick sits behind the cue ball (pointing toward canvasAngle)
  ctx.rotate(canvasAngle + Math.PI);

  const tipStart = BALL_RADIUS + 8 + pullbackOffset;
  const stickLen = 340;

  // Soft shadow beneath stick
  ctx.save();
  ctx.translate(0, 6);
  ctx.beginPath();
  ctx.moveTo(tipStart, -3.2);
  ctx.lineTo(tipStart + stickLen, -7.2);
  ctx.lineTo(tipStart + stickLen, 7.2);
  ctx.lineTo(tipStart, 3.2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fill();
  ctx.restore();

  // Blue chalk tip
  ctx.fillStyle = "#3B82F6";
  ctx.beginPath();
  ctx.roundRect(tipStart, -3.2, 6, 6.4, 2);
  ctx.fill();

  // Ivory ferrule
  ctx.fillStyle = "#F7F3E8";
  ctx.fillRect(tipStart + 6, -3.4, 11, 6.8);

  // Tapered maple shaft
  const shaftEnd = tipStart + 185;
  const shaftGrad = ctx.createLinearGradient(0, -6, 0, 6);
  shaftGrad.addColorStop(0, "#F5D9A6");
  shaftGrad.addColorStop(0.5, "#E0B675");
  shaftGrad.addColorStop(1, "#B8894A");
  ctx.beginPath();
  ctx.moveTo(tipStart + 17, -3.4);
  ctx.lineTo(shaftEnd, -5.2);
  ctx.lineTo(shaftEnd, 5.2);
  ctx.lineTo(tipStart + 17, 3.4);
  ctx.closePath();
  ctx.fillStyle = shaftGrad;
  ctx.fill();

  // Gold decorative joint ring
  ctx.fillStyle = "#D4A346";
  ctx.fillRect(shaftEnd, -5.4, 6, 10.8);

  // Dark rosewood butt
  const buttEnd = tipStart + stickLen;
  const buttGrad = ctx.createLinearGradient(0, -8, 0, 8);
  buttGrad.addColorStop(0, "#6E3220");
  buttGrad.addColorStop(0.45, "#421B10");
  buttGrad.addColorStop(1, "#260F08");
  ctx.beginPath();
  ctx.moveTo(shaftEnd + 6, -5.2);
  ctx.lineTo(buttEnd - 10, -7.2);
  ctx.lineTo(buttEnd - 10, 7.2);
  ctx.lineTo(shaftEnd + 6, 5.2);
  ctx.closePath();
  ctx.fillStyle = buttGrad;
  ctx.fill();

  // Grip wrap accent band
  ctx.fillStyle = "rgba(244, 230, 200, 0.25)";
  ctx.fillRect(shaftEnd + 46, -6.2, 58, 12.4);

  // Rubber bumper
  ctx.fillStyle = "#18181B";
  ctx.beginPath();
  ctx.roundRect(buttEnd - 10, -7.2, 10, 14.4, [0, 4, 4, 0]);
  ctx.fill();

  ctx.restore();
}

function MiniBallBadge({
  id,
  pocketed,
}: {
  id: number;
  pocketed: boolean;
}) {
  const visual = POOL_BALL_VISUALS[id] || { color: "#18181B", stripe: false };
  return (
    <span
      title={`Ball #${id}${pocketed ? " (pocketed)" : ""}`}
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 800,
        position: "relative",
        overflow: "hidden",
        border: pocketed
          ? "1px dashed var(--border-strong)"
          : "1px solid rgba(0,0,0,0.22)",
        background: pocketed
          ? "var(--bg-subtle)"
          : visual.stripe
            ? "#FAF7F0"
            : visual.color,
        color: pocketed ? "var(--text-faint)" : "#18181B",
        opacity: pocketed ? 0.38 : 1,
        flexShrink: 0,
      }}
    >
      {!pocketed && visual.stripe && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 3,
            bottom: 3,
            background: visual.color,
          }}
        />
      )}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: pocketed ? "transparent" : "rgba(255,252,245,0.92)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
      >
        {id}
      </span>
    </span>
  );
}

export function PoolBoard({
  game,
  currentUser,
  submitting,
  onMakeMove,
  onRematch,
  onBack,
}: {
  game: FamilyGame;
  currentUser: MemberId;
  submitting: boolean;
  onMakeMove: (move: PoolMove) => void;
  onRematch: () => void;
  onBack: () => void;
}) {
  const { memberById } = useMembers();
  const state = useMemo(
    () =>
      isPoolState(game.state)
        ? game.state
        : createInitialPoolState(game.players),
    [game.state, game.players]
  );

  const [p1Id, p2Id] = game.players;
  const p1 = memberById(p1Id);
  const p2 = memberById(p2Id);
  const isPassAndPlay = game.mode === "pass_and_play";
  const isActive = game.status === "active";
  const isCompleted = game.status === "completed";

  // Responsive orientation: vertical on mobile portrait (< 700px), horizontal on desktop
  const [vertical, setVertical] = useState(false);
  const userToggledOrientationRef = useRef(false);

  useEffect(() => {
    const syncOrientation = () => {
      if (!userToggledOrientationRef.current) {
        setVertical(window.innerWidth < 700);
      }
    };
    syncOrientation();
    window.addEventListener("resize", syncOrientation);
    return () => window.removeEventListener("resize", syncOrientation);
  }, []);

  // Local aiming, Ball-in-Hand, and Power Meter state
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [pullPower, setPullPower] = useState<number>(0);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [draftCuePos, setDraftCuePos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const powerTrackRef = useRef<HTMLDivElement | null>(null);
  const animFramesRef = useRef<PoolFrameBall[][]>([]);
  const animFrameIdxRef = useRef<number>(0);
  const animStrikeStartRef = useRef<number>(0);
  const animShotMetaRef = useRef<{
    angle: number;
    power: number;
    cueStart: { x: number; y: number };
  } | null>(null);
  const animRafRef = useRef<number | null>(null);
  const lastAnimatedSeqRef = useRef<number>(state.lastShot?.seq ?? 0);
  const dragModeRef = useRef<"none" | "aim" | "place_cue">("none");
  const powerDraggingRef = useRef<boolean>(false);
  const powerStartYRef = useRef<number>(0);

  const canShootNow =
    isActive &&
    !submitting &&
    !isAnimating &&
    (isPassAndPlay || game.currentTurnId === currentUser);

  const canPlaceCue = canShootNow && state.ballInHand;

  // Reset draft cue ball placement whenever shotCount changes
  useEffect(() => {
    setDraftCuePos(null);
  }, [state.shotCount, game.id]);

  // Compute effective balls on table (with optional Ball-in-Hand draft cue pos)
  const effectiveBalls = useMemo<PoolBall[]>(() => {
    if (!draftCuePos) return state.balls;
    return state.balls.map((b) =>
      b.id === 0 ? { ...b, x: draftCuePos.x, y: draftCuePos.y, pocketed: false } : b
    );
  }, [state.balls, draftCuePos]);

  // Default aim angle toward the nearest legal target ball whenever turn/shot changes
  useEffect(() => {
    const cue = state.balls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;
    if (state.isBreakShot) {
      setAimAngle(0);
      return;
    }
    const shooterId = game.currentTurnId || currentUser;
    const myGroup = state.groups[shooterId] ?? null;
    const candidates = state.balls.filter((b) => {
      if (b.id === 0 || b.pocketed) return false;
      if (myGroup === null) return b.id !== 8;
      const remaining = getRemainingBallsForGroup(state.balls, myGroup);
      if (remaining.length === 0) return b.id === 8;
      return getBallGroup(b.id) === myGroup;
    });
    if (candidates.length === 0) return;
    let nearest = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = (c.x - cue.x) ** 2 + (c.y - cue.y) ** 2;
      if (d < bestD) {
        bestD = d;
        nearest = c;
      }
    }
    setAimAngle(Math.atan2(nearest.y - cue.y, nearest.x - cue.x));
  }, [game.id, state.shotCount, game.currentTurnId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animation playback helper
  const startShotAnimation = useCallback(
    (preBalls: PoolBall[], move: PoolMove) => {
      if (animRafRef.current !== null) {
        window.cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }
      const adjustedPre = preBalls.map((b) =>
        b.id === 0 && move.cueBallPos
          ? { ...b, x: move.cueBallPos.x, y: move.cueBallPos.y, pocketed: false }
          : { ...b }
      );
      const cue = adjustedPre.find((b) => b.id === 0) || {
        id: 0,
        x: 225,
        y: 250,
        pocketed: false,
      };
      const sim = simulatePoolShot(adjustedPre, move.angle, move.power, {
        recordFrames: true,
      });
      animFramesRef.current = sim.frames;
      animFrameIdxRef.current = 0;
      animStrikeStartRef.current = performance.now();
      animShotMetaRef.current = {
        angle: move.angle,
        power: move.power,
        cueStart: { x: cue.x, y: cue.y },
      };
      setIsAnimating(true);
    },
    []
  );

  // Auto-animate incoming remote opponent shots when lastShot.seq advances
  useEffect(() => {
    const seq = state.lastShot?.seq ?? 0;
    if (seq < lastAnimatedSeqRef.current) {
      lastAnimatedSeqRef.current = seq;
      return;
    }
    if (seq > lastAnimatedSeqRef.current && state.lastShot) {
      lastAnimatedSeqRef.current = seq;
      startShotAnimation(state.lastShot.preBalls, state.lastShot.move);
    }
  }, [game.id, state.lastShot, startShotAnimation]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (animRafRef.current !== null) {
        window.cancelAnimationFrame(animRafRef.current);
      }
    };
  }, []);

  // Determine if aiming at a foul target (for helpful visual feedback)
  const activeShooterId = game.currentTurnId || currentUser;
  const activeShooterGroup = state.groups[activeShooterId] ?? null;
  const activeShooterCleared =
    activeShooterGroup !== null &&
    getRemainingBallsForGroup(effectiveBalls, activeShooterGroup).length === 0;

  const isTargetLegal = useCallback(
    (ballId: number | null): boolean => {
      if (ballId === null) return true;
      if (state.isBreakShot) return true;
      if (activeShooterGroup === null) return ballId !== 8;
      if (activeShooterCleared) return ballId === 8;
      return getBallGroup(ballId) === activeShooterGroup;
    },
    [state.isBreakShot, activeShooterGroup, activeShooterCleared]
  );

  // Canvas Renderer (handles both static aiming state and 60fps animation)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cw = vertical ? V_CANVAS_W : H_CANVAS_W;
    const ch = vertical ? V_CANVAS_H : H_CANVAS_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }

    const renderStatic = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      drawPoolTable(ctx, vertical, canPlaceCue && state.isBreakShot);

      // Draw balls
      for (const b of effectiveBalls) {
        drawBall(ctx, b, vertical);
      }

      const cue = effectiveBalls.find((b) => b.id === 0);

      // Ball-in-Hand highlight ring
      if (canPlaceCue && cue && !cue.pocketed) {
        const { cx, cy } = tableToCanvas(cue.x, cue.y, vertical);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, BALL_RADIUS + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 226, 130, 0.92)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.restore();
      }

      // Aiming guide & Cue Stick
      if (canShootNow && cue && !cue.pocketed) {
        const preview = computeAimPreview(cue, aimAngle, effectiveBalls);
        const startC = tableToCanvas(preview.startX, preview.startY, vertical);
        const endC = tableToCanvas(preview.endX, preview.endY, vertical);
        const legal = isTargetLegal(preview.targetBallId);

        // Aiming dashed ray
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startC.cx, startC.cy);
        ctx.lineTo(endC.cx, endC.cy);
        ctx.strokeStyle = legal
          ? "rgba(255, 255, 255, 0.78)"
          : "rgba(248, 113, 113, 0.88)";
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 6]);
        ctx.stroke();
        ctx.restore();

        // Ghost ball circle at impact
        ctx.save();
        ctx.beginPath();
        ctx.arc(endC.cx, endC.cy, BALL_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = legal
          ? "rgba(255, 255, 255, 0.85)"
          : "rgba(248, 113, 113, 0.92)";
        ctx.lineWidth = 2;
        ctx.fillStyle = legal
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(248, 113, 113, 0.2)";
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Target ball direction & cue deflection lines
        if (
          preview.targetBallId !== null &&
          preview.targetDirX !== null &&
          preview.targetDirY !== null
        ) {
          const targetBall = effectiveBalls.find(
            (b) => b.id === preview.targetBallId
          );
          if (targetBall) {
            const tbStart = tableToCanvas(targetBall.x, targetBall.y, vertical);
            const tbEnd = tableToCanvas(
              targetBall.x + preview.targetDirX * 115,
              targetBall.y + preview.targetDirY * 115,
              vertical
            );
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tbStart.cx, tbStart.cy);
            ctx.lineTo(tbEnd.cx, tbEnd.cy);
            ctx.strokeStyle = legal
              ? "rgba(134, 239, 172, 0.9)"
              : "rgba(248, 113, 113, 0.9)";
            ctx.lineWidth = 2.6;
            ctx.stroke();
            ctx.restore();
          }

          if (preview.cueDeflectX !== null && preview.cueDeflectY !== null) {
            const cdEnd = tableToCanvas(
              preview.endX + preview.cueDeflectX * 52,
              preview.endY + preview.cueDeflectY * 52,
              vertical
            );
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(endC.cx, endC.cy);
            ctx.lineTo(cdEnd.cx, cdEnd.cy);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Tapered Cue Stick
        const canvasAngle = tableAngleToCanvasAngle(aimAngle, vertical);
        drawCueStick(
          ctx,
          startC.cx,
          startC.cy,
          canvasAngle,
          pullPower * 110
        );
      }

      ctx.restore();
    };

    if (!isAnimating) {
      renderStatic();
      return;
    }

    // 60fps Shot Playback Loop (90ms cue lunge + physics frames)
    const STRIKE_MS = 95;
    let lastFrameTime = performance.now();
    let frameAccumulator = 0;

    const tick = (now: number) => {
      const elapsedSinceStart = now - animStrikeStartRef.current;
      const dt = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;

      ctx.save();
      ctx.scale(dpr, dpr);
      drawPoolTable(ctx, vertical, false);

      const frames = animFramesRef.current;
      const meta = animShotMetaRef.current;

      if (elapsedSinceStart < STRIKE_MS && meta && frames[0]) {
        // Cue stick lunges forward into the cue ball
        for (const b of frames[0]) {
          drawBall(ctx, b, vertical);
        }
        const t = Math.min(1, elapsedSinceStart / STRIKE_MS);
        const eased = 1 - (1 - t) * (1 - t);
        const pullback = meta.power * 110 * (1 - eased) - eased * 6;
        const cueC = tableToCanvas(meta.cueStart.x, meta.cueStart.y, vertical);
        drawCueStick(
          ctx,
          cueC.cx,
          cueC.cy,
          tableAngleToCanvasAngle(meta.angle, vertical),
          Math.max(-5, pullback)
        );
        ctx.restore();
        animRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      // Advance at 60fps (16.67ms per recorded physics frame)
      frameAccumulator += dt;
      while (frameAccumulator >= 16.666) {
        frameAccumulator -= 16.666;
        if (animFrameIdxRef.current < frames.length - 1) {
          animFrameIdxRef.current += 1;
        }
      }

      const frame = frames[animFrameIdxRef.current] || frames[frames.length - 1];
      if (frame) {
        for (const b of frame) {
          drawBall(ctx, b, vertical);
        }
      }
      ctx.restore();

      if (animFrameIdxRef.current >= frames.length - 1) {
        animRafRef.current = null;
        setIsAnimating(false);
        return;
      }

      animRafRef.current = window.requestAnimationFrame(tick);
    };

    animRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animRafRef.current !== null) {
        window.cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }
    };
  }, [
    vertical,
    effectiveBalls,
    aimAngle,
    pullPower,
    canShootNow,
    canPlaceCue,
    state.isBreakShot,
    isAnimating,
    isTargetLegal,
  ]);

  // Convert pointer event to canonical table coordinates
  function pointerToTableCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cw = vertical ? V_CANVAS_W : H_CANVAS_W;
    const ch = vertical ? V_CANVAS_H : H_CANVAS_H;
    const cx = ((e.clientX - rect.left) / rect.width) * cw;
    const cy = ((e.clientY - rect.top) / rect.height) * ch;
    return canvasToTable(cx, cy, vertical);
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canShootNow) return;
    const pt = pointerToTableCoords(e);
    if (!pt) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const cue = effectiveBalls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;

    const distToCue = Math.hypot(pt.tx - cue.x, pt.ty - cue.y);
    if (canPlaceCue && distToCue <= BALL_RADIUS * 2.4) {
      dragModeRef.current = "place_cue";
      return;
    }

    dragModeRef.current = "aim";
    if (distToCue > 6) {
      setAimAngle(Math.atan2(pt.ty - cue.y, pt.tx - cue.x));
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragModeRef.current === "none" || !canShootNow) return;
    const pt = pointerToTableCoords(e);
    if (!pt) return;

    if (dragModeRef.current === "place_cue" && canPlaceCue) {
      const margin = BALL_RADIUS + 4;
      const maxX = state.isBreakShot ? HEAD_STRING_X : TABLE_WIDTH - margin;
      const clampedX = Math.max(margin, Math.min(maxX, pt.tx));
      const clampedY = Math.max(
        margin,
        Math.min(TABLE_HEIGHT - margin, pt.ty)
      );
      if (
        isCueBallPlacementValid(
          clampedX,
          clampedY,
          state.balls,
          state.isBreakShot
        )
      ) {
        setDraftCuePos({
          x: Math.round(clampedX * 100) / 100,
          y: Math.round(clampedY * 100) / 100,
        });
      } else {
        const nearestFree = findFreeSpot(
          clampedX,
          clampedY,
          state.balls,
          0,
          state.isBreakShot
        );
        setDraftCuePos(nearestFree);
      }
      return;
    }

    if (dragModeRef.current === "aim") {
      const cue = effectiveBalls.find((b) => b.id === 0);
      if (!cue || cue.pocketed) return;
      const dist = Math.hypot(pt.tx - cue.x, pt.ty - cue.y);
      if (dist > 6) {
        setAimAngle(Math.atan2(pt.ty - cue.y, pt.tx - cue.x));
      }
    }
  }

  function handleCanvasPointerUp() {
    dragModeRef.current = "none";
  }

  // Fire shot from Power Meter
  function fireShot(power: number) {
    if (!canShootNow || power < 0.04) return;
    const cue = effectiveBalls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;

    const move: PoolMove = {
      angle: Math.round(aimAngle * 10000) / 10000,
      power: Math.round(Math.min(1, power) * 1000) / 1000,
      cueBallPos: state.ballInHand ? { x: cue.x, y: cue.y } : null,
    };

    // Advance expected seq so optimistic/server response doesn't double-animate
    lastAnimatedSeqRef.current = (state.shotCount || 0) + 1;
    startShotAnimation(effectiveBalls, move);
    onMakeMove(move);
  }

  // Spring-loaded Power Meter pointer handlers
  function updatePowerFromPointer(clientY: number) {
    const track = powerTrackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const usable = Math.max(80, rect.height - 34);
    const delta = clientY - powerStartYRef.current;
    // Also allow tapping/dragging directly along track from top
    const fromTop = clientY - rect.top - 16;
    const raw = Math.max(delta, fromTop) / usable;
    const clamped = Math.max(0, Math.min(1, raw));
    setPullPower(clamped);
    return clamped;
  }

  function handlePowerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canShootNow) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    powerDraggingRef.current = true;
    powerStartYRef.current = e.clientY;
    setIsCharging(true);
    updatePowerFromPointer(e.clientY);
  }

  function handlePowerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!powerDraggingRef.current) return;
    updatePowerFromPointer(e.clientY);
  }

  function handlePowerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!powerDraggingRef.current) return;
    powerDraggingRef.current = false;
    const finalPower = updatePowerFromPointer(e.clientY);
    setIsCharging(false);
    setPullPower(0);
    if (finalPower >= 0.04) {
      fireShot(finalPower);
    }
  }

  function nudgeAim(deltaDeg: number) {
    if (!canShootNow) return;
    setAimAngle((prev) => prev + (deltaDeg * Math.PI) / 180);
  }

  // Status Banner Text
  const activeTurnMember = game.currentTurnId
    ? memberById(game.currentTurnId)
    : null;
  const winnerMember = game.winnerId ? memberById(game.winnerId) : null;
  const showCompletedUI = isCompleted && !isAnimating;

  let statusText = "";
  let statusTone: "turn" | "wait" | "win" | "foul" = "wait";
  if (showCompletedUI) {
    if (game.outcome === "forfeit" && winnerMember) {
      statusText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? "You won by forfeit!"
          : `${winnerMember.name} won by forfeit`;
      statusTone = "win";
    } else if (winnerMember) {
      statusText =
        winnerMember.id === currentUser && !isPassAndPlay
          ? "You sank the 8-ball and won! 🎱🎉"
          : `${winnerMember.name} won the rack! 🎱🎉`;
      statusTone = "win";
    }
  } else if (isAnimating) {
    statusText = "Balls in motion…";
    statusTone = "wait";
  } else if (isActive && activeTurnMember) {
    const isMyShot = isPassAndPlay || game.currentTurnId === currentUser;
    if (isMyShot) {
      const who = isPassAndPlay ? `${activeTurnMember.name}'s shot` : "Your shot";
      if (state.isBreakShot) {
        statusText = `${who} — Break! Drag cue ball behind line & pull meter`;
        statusTone = "turn";
      } else if (state.ballInHand) {
        statusText = `${who} — Ball in Hand! Drag cue ball anywhere & shoot`;
        statusTone = "foul";
      } else {
        statusText = `${who} — Aim & pull the Power Meter`;
        statusTone = "turn";
      }
    } else {
      statusText = `Waiting for ${activeTurnMember.name} to shoot…`;
      statusTone = "wait";
    }
  } else if (game.status === "pending") {
    statusText =
      game.opponentId === currentUser
        ? "Accept the challenge above to rack 'em up!"
        : `Waiting for ${memberById(game.opponentId).name} to accept…`;
  }

  const powerPct = Math.round(pullPower * 100);
  const powerColor =
    pullPower < 0.4
      ? "#1F9D6E"
      : pullPower < 0.75
        ? "#E09F24"
        : "#E04F2E";

  return (
    <div>
      {/* Player Matchup & Ball Group Racks */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {[p1, p2].map((player) => {
          const group: BallGroup | null = state.groups[player.id] ?? null;
          const isTurn = isActive && game.currentTurnId === player.id;
          const isWinner = showCompletedUI && game.winnerId === player.id;
          const groupIds =
            group === "solids"
              ? [1, 2, 3, 4, 5, 6, 7]
              : group === "stripes"
                ? [9, 10, 11, 12, 13, 14, 15]
                : [];
          const clearedGroup =
            group !== null &&
            getRemainingBallsForGroup(state.balls, group).length === 0;

          return (
            <div
              key={player.id}
              style={{
                background: isWinner
                  ? "var(--success-soft)"
                  : isTurn
                    ? "var(--accent-soft)"
                    : "var(--bg-subtle)",
                border: `1.5px solid ${
                  isWinner
                    ? "var(--success)"
                    : isTurn
                      ? "var(--accent)"
                      : "var(--border-subtle)"
                }`,
                borderRadius: 14,
                padding: "9px 10px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <AvatarDot id={player.id} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {player.id === currentUser && !isPassAndPlay
                      ? "You"
                      : player.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: group ? player.color : "var(--text-muted)",
                    }}
                  >
                    {group === "solids"
                      ? clearedGroup
                        ? "On the 8-Ball 🎱"
                        : "Solids (1–7)"
                      : group === "stripes"
                        ? clearedGroup
                          ? "On the 8-Ball 🎱"
                          : "Stripes (9–15)"
                        : "Open Table"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {group === null ? (
                  <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                    Sink a ball to claim Solids or Stripes
                  </span>
                ) : clearedGroup ? (
                  <MiniBallBadge
                    id={8}
                    pocketed={Boolean(
                      state.balls.find((b) => b.id === 8)?.pocketed
                    )}
                  />
                ) : (
                  groupIds.map((id) => (
                    <MiniBallBadge
                      key={id}
                      id={id}
                      pocketed={Boolean(
                        state.balls.find((b) => b.id === id)?.pocketed
                      )}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Turn / Outcome Status Banner */}
      {statusText && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "8px 12px",
            borderRadius: 12,
            marginBottom: 10,
            fontSize: 12.5,
            fontWeight: 700,
            textAlign: "center",
            background:
              statusTone === "win"
                ? "var(--success-soft)"
                : statusTone === "foul"
                  ? "var(--cat-ochre-soft)"
                  : statusTone === "turn"
                    ? "var(--accent-soft)"
                    : "var(--bg-subtle)",
            color:
              statusTone === "win"
                ? "var(--success-ink)"
                : statusTone === "foul"
                  ? "var(--cat-ochre)"
                  : statusTone === "turn"
                    ? "var(--accent-ink)"
                    : "var(--text-secondary)",
            border: `1px solid ${
              statusTone === "win"
                ? "var(--success-border)"
                : statusTone === "turn"
                  ? "var(--accent-border)"
                  : "var(--border-subtle)"
            }`,
          }}
        >
          {statusTone === "win" && <Trophy size={14} />}
          {statusTone === "turn" && <Sparkles size={14} />}
          {isPassAndPlay && isActive && !isAnimating && <Users size={13} />}
          <span>{statusText}</span>
        </div>
      )}

      {/* Last Shot Feed + Controls Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-muted)",
            fontWeight: 600,
            flex: "1 1 160px",
          }}
        >
          {state.lastShot
            ? `${memberById(state.lastShot.by).name}: ${state.lastShot.summary}`
            : "Drag on the table to aim · Pull the Power Meter to strike"}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {state.lastShot && !isAnimating && (
            <button
              type="button"
              onClick={() => {
                if (state.lastShot) {
                  startShotAnimation(
                    state.lastShot.preBalls,
                    state.lastShot.move
                  );
                }
              }}
              style={{
                background: "var(--bg-subtle)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: 9,
                padding: "5px 9px",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Play size={11} /> Replay
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              userToggledOrientationRef.current = true;
              setVertical((v) => !v);
            }}
            title="Rotate table orientation"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: 9,
              padding: "5px 9px",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <RotateCw size={11} /> {vertical ? "Horizontal" : "Vertical"}
          </button>
        </div>
      </div>

      {/* Pool Table Canvas + Side Spring-Loaded Power Meter */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: vertical ? 350 : 740,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            style={{
              width: "100%",
              aspectRatio: vertical
                ? `${V_CANVAS_W} / ${V_CANVAS_H}`
                : `${H_CANVAS_W} / ${H_CANVAS_H}`,
              display: "block",
              borderRadius: 18,
              boxShadow: CARD_SHADOW,
              touchAction: "none",
              userSelect: "none",
              cursor: canShootNow ? "crosshair" : "default",
            }}
          />
        </div>

        {/* Spring-Loaded Power Meter */}
        <div
          style={{
            width: 52,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: canShootNow ? 1 : 0.45,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.4,
              color: isCharging ? powerColor : "var(--text-muted)",
              textTransform: "uppercase",
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {isCharging ? `${powerPct}%` : "Power"}
          </div>

          <div
            ref={powerTrackRef}
            role="slider"
            aria-label="Shot power meter — pull down and release to shoot"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={powerPct}
            onPointerDown={handlePowerPointerDown}
            onPointerMove={handlePowerPointerMove}
            onPointerUp={handlePowerPointerUp}
            onPointerCancel={() => {
              powerDraggingRef.current = false;
              setIsCharging(false);
              setPullPower(0);
            }}
            style={{
              flex: 1,
              minHeight: 190,
              maxHeight: vertical ? 380 : 340,
              width: 44,
              borderRadius: 22,
              background: "linear-gradient(180deg, #2D231B 0%, #1C1510 100%)",
              border: `2px solid ${isCharging ? powerColor : "#573C29"}`,
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
              position: "relative",
              overflow: "hidden",
              touchAction: "none",
              userSelect: "none",
              cursor: canShootNow ? "ns-resize" : "not-allowed",
            }}
          >
            {/* Tick marks */}
            {[25, 50, 75].map((pct) => (
              <div
                key={pct}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  top: `${pct}%`,
                  height: 1,
                  background: "rgba(255,255,255,0.16)",
                  pointerEvents: "none",
                }}
              />
            ))}

            {/* Power Fill Bar */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 4,
                right: 4,
                top: 4,
                height: `calc(${pullPower * 100}% - 4px)`,
                borderRadius: 16,
                background:
                  "linear-gradient(180deg, #22C55E 0%, #EAB308 55%, #EF4444 100%)",
                opacity: pullPower > 0.01 ? 0.9 : 0,
                transition: isCharging ? "none" : "height 0.14s ease",
                pointerEvents: "none",
              }}
            />

            {/* Draggable Cue Plunger Handle */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 5,
                right: 5,
                top: `calc(${pullPower * 78}% + 6px)`,
                height: 36,
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, #F5D9A6 0%, #D9A45B 45%, #5C2B16 100%)",
                border: "1.5px solid rgba(255,255,255,0.65)",
                boxShadow: "0 3px 8px rgba(0,0,0,0.45)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                transition: isCharging ? "none" : "top 0.14s ease",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 2,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.75)",
                }}
              />
              <span
                style={{
                  width: 14,
                  height: 2,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.75)",
                }}
              />
            </div>
          </div>

          <div
            style={{
              fontSize: 9.5,
              color: "var(--text-faint)",
              textAlign: "center",
              lineHeight: 1.2,
              fontWeight: 600,
            }}
          >
            {isCharging
              ? pullPower < 0.04
                ? "Cancel"
                : "Release!"
              : "Pull ↓"}
          </div>
        </div>
      </div>

      {/* Fine Aim Precision Nudges */}
      {canShootNow && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: showCompletedUI ? 14 : 2,
          }}
        >
          <button
            type="button"
            onClick={() => nudgeAim(-0.5)}
            aria-label="Fine aim counter-clockwise"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <ChevronLeft size={14} /> Fine Aim
          </button>
          <button
            type="button"
            onClick={() => nudgeAim(0.5)}
            aria-label="Fine aim clockwise"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            Fine Aim <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Post-game actions (revealed once final shot stops rolling) */}
      {showCompletedUI && (
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={onRematch}
            style={{
              flex: "1 1 160px",
              maxWidth: 220,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "11px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: submitting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              boxShadow: "0 4px 12px rgba(232,98,44,0.28)",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <RotateCcw size={15} />
            {isPassAndPlay ? "Rack Again" : "Send Rematch"}
          </button>
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: "0 1 auto",
              background: "var(--bg-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "11px 16px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Games
          </button>
        </div>
      )}
    </div>
  );
}
