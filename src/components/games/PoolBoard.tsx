"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Flag,
  Play,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
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

const RAIL = 44;
const STICK_LENGTH = 340;
const H_TABLE_W = TABLE_WIDTH + RAIL * 2; // 1088
const H_TABLE_H = TABLE_HEIGHT + RAIL * 2; // 588
const V_TABLE_W = H_TABLE_H; // 588
const V_TABLE_H = H_TABLE_W; // 1088

interface StageViewport {
  stageW: number;
  stageH: number;
  vertical: boolean;
  scale: number;
  originX: number;
  originY: number;
}

function computeStageViewport(stageW: number, stageH: number): StageViewport {
  const safeW = Math.max(240, stageW);
  const safeH = Math.max(240, stageH);
  const vertical = safeH > safeW;
  const tw = vertical ? V_TABLE_W : H_TABLE_W;
  const th = vertical ? V_TABLE_H : H_TABLE_H;
  const padX = 8;
  const padY = 8;
  const scale = Math.min((safeW - padX * 2) / tw, (safeH - padY * 2) / th);
  const originX = (safeW - tw * scale) / 2;
  const originY = (safeH - th * scale) / 2;
  return { stageW: safeW, stageH: safeH, vertical, scale, originX, originY };
}

function tableToLocal(tx: number, ty: number, vertical: boolean) {
  if (!vertical) {
    return { lx: RAIL + tx, ly: RAIL + ty };
  }
  return { lx: RAIL + ty, ly: RAIL + (TABLE_WIDTH - tx) };
}

function stageToTable(sx: number, sy: number, vp: StageViewport) {
  const lx = (sx - vp.originX) / vp.scale;
  const ly = (sy - vp.originY) / vp.scale;
  if (!vp.vertical) {
    return { tx: lx - RAIL, ty: ly - RAIL };
  }
  return { tx: TABLE_WIDTH - (ly - RAIL), ty: lx - RAIL };
}

function tableAngleToCanvasAngle(angle: number, vertical: boolean): number {
  return vertical ? angle - Math.PI / 2 : angle;
}

function normalizeAngleDelta(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function rayDistanceToBounds(
  x: number,
  y: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): number {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (maxX - x) / dx);
  else if (dx < -1e-6) t = Math.min(t, (minX - x) / dx);
  if (dy > 1e-6) t = Math.min(t, (maxY - y) / dy);
  else if (dy < -1e-6) t = Math.min(t, (minY - y) / dy);
  return Math.max(0, Number.isFinite(t) ? t : 0);
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: PoolFrameBall,
  vertical: boolean
) {
  if (ball.pocketed) return;
  const { lx: cx, ly: cy } = tableToLocal(ball.x, ball.y, vertical);
  const r = BALL_RADIUS;
  const visual = POOL_BALL_VISUALS[ball.id] || {
    color: "#FAF7F0",
    stripe: false,
  };

  // Soft drop shadow
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + 2.4, cy + 3.0, r * 1.02, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
  ctx.fill();
  ctx.restore();

  // Ball sphere clipped
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (ball.id === 0) {
    ctx.fillStyle = "#FAF7F0";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.beginPath();
    ctx.arc(cx + r * 0.28, cy + r * 0.22, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = "#DC2626";
    ctx.fill();
  } else if (visual.stripe) {
    ctx.fillStyle = "#FAF7F0";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = visual.color;
    ctx.fillRect(cx - r, cy - r * 0.54, r * 2, r * 1.08);
  } else {
    ctx.fillStyle = visual.color;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 3D shading gradient
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

  // Number medallion
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

  // Gloss specular highlight
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.56)";
  ctx.fill();

  ctx.restore();
}

function drawPoolTable(
  ctx: CanvasRenderingContext2D,
  vertical: boolean,
  highlightKitchen: boolean
) {
  const cw = vertical ? V_TABLE_W : H_TABLE_W;
  const ch = vertical ? V_TABLE_H : H_TABLE_H;

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

  ctx.strokeStyle = "rgba(255, 224, 178, 0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Brass corner accent plates
  const plateSize = 44;
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

  ctx.strokeStyle = "rgba(0, 0, 0, 0.36)";
  ctx.lineWidth = 10;
  ctx.strokeRect(feltX - 2, feltY - 2, feltW + 4, feltH + 4);

  if (highlightKitchen) {
    ctx.fillStyle = "rgba(255, 248, 220, 0.09)";
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
  const hs1 = tableToLocal(HEAD_STRING_X, 6, vertical);
  const hs2 = tableToLocal(HEAD_STRING_X, TABLE_HEIGHT - 6, vertical);
  ctx.beginPath();
  ctx.moveTo(hs1.lx, hs1.ly);
  ctx.lineTo(hs2.lx, hs2.ly);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Head & Foot spots
  const spots = [
    tableToLocal(225, 250, vertical),
    tableToLocal(750, 250, vertical),
  ];
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  for (const s of spots) {
    ctx.beginPath();
    ctx.arc(s.lx, s.ly, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Ivory Diamond Sights
  const diamondCoords: { cx: number; cy: number }[] = [];
  for (const frac of [1 / 8, 2 / 8, 3 / 8, 5 / 8, 6 / 8, 7 / 8]) {
    const tx = TABLE_WIDTH * frac;
    const top = tableToLocal(tx, 0, vertical);
    const bot = tableToLocal(tx, TABLE_HEIGHT, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: top.lx, cy: RAIL / 2 - 2 });
      diamondCoords.push({ cx: bot.lx, cy: ch - RAIL / 2 + 2 });
    } else {
      diamondCoords.push({ cx: RAIL / 2 - 2, cy: top.ly });
      diamondCoords.push({ cx: cw - RAIL / 2 + 2, cy: bot.ly });
    }
  }
  for (const frac of [1 / 4, 2 / 4, 3 / 4]) {
    const ty = TABLE_HEIGHT * frac;
    const left = tableToLocal(0, ty, vertical);
    const right = tableToLocal(TABLE_WIDTH, ty, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: RAIL / 2 - 2, cy: left.ly });
      diamondCoords.push({ cx: cw - RAIL / 2 + 2, cy: right.ly });
    } else {
      diamondCoords.push({ cx: left.lx, cy: ch - RAIL / 2 + 2 });
      diamondCoords.push({ cx: right.lx, cy: RAIL / 2 - 2 });
    }
  }

  ctx.fillStyle = "#F4E6C8";
  for (const d of diamondCoords) {
    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.1, -3.1, 6.2, 6.2);
    ctx.restore();
  }

  // 5. Six Pockets
  for (const p of POCKETS) {
    const { lx: cx, ly: cy } = tableToLocal(p.x, p.y, vertical);
    ctx.beginPath();
    ctx.arc(cx, cy, p.visualRadius + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1E120A";
    ctx.fill();

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
  pullbackOffset: number,
  powerRatio: number,
  isPulling: boolean,
  showPullHint: boolean
) {
  ctx.save();
  ctx.translate(cueX, cueY);
  ctx.rotate(canvasAngle + Math.PI);

  const tipStart = BALL_RADIUS + 8 + pullbackOffset;
  const stickLen = STICK_LENGTH;

  // Power tension glow line between cue ball and pulled-back cue tip
  if (isPulling && powerRatio > 0.02) {
    const tensionColor =
      powerRatio < 0.4
        ? "#4ADE80"
        : powerRatio < 0.75
          ? "#FACC15"
          : "#F87171";
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(BALL_RADIUS + 3, 0);
    ctx.lineTo(tipStart - 2, 0);
    ctx.strokeStyle = tensionColor;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.shadowColor = tensionColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  }

  // Subtle shadow beneath stick
  ctx.save();
  ctx.translate(0, 6);
  ctx.beginPath();
  ctx.moveTo(tipStart, -3.2);
  ctx.lineTo(tipStart + stickLen, -7.2);
  ctx.lineTo(tipStart + stickLen, 7.2);
  ctx.lineTo(tipStart, 3.2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fill();
  ctx.restore();

  // Blue chalk tip
  ctx.fillStyle = "#3B82F6";
  ctx.beginPath();
  ctx.roundRect(tipStart, -3.3, 6, 6.6, 2);
  ctx.fill();

  // Ivory ferrule
  ctx.fillStyle = "#F7F3E8";
  ctx.fillRect(tipStart + 6, -3.5, 11, 7.0);

  // Tapered maple shaft
  const shaftEnd = tipStart + 185;
  const shaftGrad = ctx.createLinearGradient(0, -6, 0, 6);
  shaftGrad.addColorStop(0, "#F5D9A6");
  shaftGrad.addColorStop(0.5, "#E0B675");
  shaftGrad.addColorStop(1, "#B8894A");
  ctx.beginPath();
  ctx.moveTo(tipStart + 17, -3.5);
  ctx.lineTo(shaftEnd, -5.4);
  ctx.lineTo(shaftEnd, 5.4);
  ctx.lineTo(tipStart + 17, 3.5);
  ctx.closePath();
  ctx.fillStyle = shaftGrad;
  ctx.fill();

  // Gold joint collar
  ctx.fillStyle = "#D4A346";
  ctx.fillRect(shaftEnd, -5.6, 6, 11.2);

  // Dark rosewood butt
  const buttEnd = tipStart + stickLen;
  const buttGrad = ctx.createLinearGradient(0, -8, 0, 8);
  buttGrad.addColorStop(0, "#6E3220");
  buttGrad.addColorStop(0.45, "#421B10");
  buttGrad.addColorStop(1, "#260F08");
  ctx.beginPath();
  ctx.moveTo(shaftEnd + 6, -5.4);
  ctx.lineTo(buttEnd - 10, -7.4);
  ctx.lineTo(buttEnd - 10, 7.4);
  ctx.lineTo(shaftEnd + 6, 5.4);
  ctx.closePath();
  ctx.fillStyle = buttGrad;
  ctx.fill();

  // Grip wrap highlight (glows gently when ready to grab or actively pulling)
  ctx.fillStyle = isPulling
    ? "rgba(252, 211, 77, 0.45)"
    : "rgba(244, 230, 200, 0.28)";
  ctx.fillRect(shaftEnd + 42, -6.5, 64, 13.0);

  // Pull-back directional chevrons on the shaft to invite grabbing
  if (showPullHint && !isPulling) {
    ctx.strokeStyle = "rgba(255, 245, 220, 0.72)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const offset of [56, 70, 84]) {
      const cx = shaftEnd + offset;
      ctx.beginPath();
      ctx.moveTo(cx - 4, -3.5);
      ctx.lineTo(cx + 1, 0);
      ctx.lineTo(cx - 4, 3.5);
      ctx.stroke();
    }
  }

  // Rubber bumper
  ctx.fillStyle = "#18181B";
  ctx.beginPath();
  ctx.roundRect(buttEnd - 10, -7.4, 10, 14.8, [0, 4, 4, 0]);
  ctx.fill();

  ctx.restore();
}

function TinyBallDot({ id, pocketed }: { id: number; pocketed: boolean }) {
  const visual = POOL_BALL_VISUALS[id] || { color: "#18181B", stripe: false };
  return (
    <span
      title={`#${id}${pocketed ? " (pocketed)" : ""}`}
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        display: "inline-block",
        position: "relative",
        overflow: "hidden",
        background: pocketed
          ? "rgba(255,255,255,0.12)"
          : visual.stripe
            ? "#FAF7F0"
            : visual.color,
        border: pocketed
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid rgba(255,255,255,0.35)",
        opacity: pocketed ? 0.35 : 1,
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
            top: 2,
            bottom: 2,
            background: visual.color,
          }}
        />
      )}
    </span>
  );
}

export function PoolBoard({
  game,
  currentUser,
  submitting,
  onMakeMove,
  onRespondInvite,
  onForfeit,
  onRematch,
  onBack,
}: {
  game: FamilyGame;
  currentUser: MemberId;
  submitting: boolean;
  onMakeMove: (move: PoolMove) => void;
  onRespondInvite: (decision: "accept" | "decline" | "cancel") => void;
  onForfeit: () => void;
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
  const isParticipant = game.players.includes(currentUser);
  const isPendingForMe =
    game.status === "pending" && game.opponentId === currentUser;
  const isPendingByMe =
    game.status === "pending" && game.challengerId === currentUser;

  // Lock page scroll completely while in full-screen Pool
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // Measure the exact stage container for 100% zero-scroll canvas fit
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 390,
    h: 740,
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const vp = useMemo(
    () => computeStageViewport(stageSize.w, stageSize.h),
    [stageSize.w, stageSize.h]
  );

  // Interactive aiming, Ball-in-Hand, cue pullback & animation state
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [pullPower, setPullPower] = useState<number>(0);
  const [isPullingStick, setIsPullingStick] = useState<boolean>(false);
  const [draftCuePos, setDraftCuePos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [confirmForfeit, setConfirmForfeit] = useState<boolean>(false);
  const [shotToast, setShotToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const shotToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dragStateRef = useRef<
    | { mode: "none" }
    | { mode: "place_cue" }
    | {
        mode: "aim";
        startAimAngle: number;
        startPtrAngle: number;
        startSx: number;
        startSy: number;
        moved: boolean;
      }
    | {
        mode: "pull_stick";
        startSx: number;
        startSy: number;
        backDirX: number;
        backDirY: number;
        maxPullPx: number;
      }
  >({ mode: "none" });

  const canShootNow =
    isActive &&
    !submitting &&
    !isAnimating &&
    (isPassAndPlay || game.currentTurnId === currentUser);

  const canPlaceCue = canShootNow && state.ballInHand;

  useEffect(() => {
    setDraftCuePos(null);
  }, [state.shotCount, game.id]);

  // Show brief shot summary toast right when animation finishes
  const prevAnimatingRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevAnimatingRef.current && !isAnimating && state.lastShot && !isCompleted) {
      setShotToast(
        `${memberById(state.lastShot.by).name}: ${state.lastShot.summary}`
      );
      if (shotToastTimerRef.current) clearTimeout(shotToastTimerRef.current);
      shotToastTimerRef.current = setTimeout(() => setShotToast(null), 3200);
    }
    prevAnimatingRef.current = isAnimating;
  }, [isAnimating, state.lastShot, isCompleted, memberById]);

  useEffect(() => {
    return () => {
      if (shotToastTimerRef.current) clearTimeout(shotToastTimerRef.current);
      if (animRafRef.current !== null) {
        window.cancelAnimationFrame(animRafRef.current);
      }
    };
  }, []);

  const effectiveBalls = useMemo<PoolBall[]>(() => {
    if (!draftCuePos) return state.balls;
    return state.balls.map((b) =>
      b.id === 0
        ? { ...b, x: draftCuePos.x, y: draftCuePos.y, pocketed: false }
        : b
    );
  }, [state.balls, draftCuePos]);

  // Default aim angle toward nearest legal target ball on turn/shot change
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

  const startShotAnimation = useCallback(
    (preBalls: PoolBall[], move: PoolMove) => {
      if (animRafRef.current !== null) {
        window.cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }
      const adjustedPre = preBalls.map((b) =>
        b.id === 0 && move.cueBallPos
          ? {
              ...b,
              x: move.cueBallPos.x,
              y: move.cueBallPos.y,
              pocketed: false,
            }
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
      setShotToast(null);
      setIsAnimating(true);
    },
    []
  );

  // Auto-animate incoming remote opponent shots
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

  // Static Full-Stage Canvas Renderer
  useEffect(() => {
    if (isAnimating) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(vp.stageW * dpr);
    const targetH = Math.round(vp.stageH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vp.stageW, vp.stageH);

    // Transform into centered table-local coordinates
    ctx.translate(vp.originX, vp.originY);
    ctx.scale(vp.scale, vp.scale);

    drawPoolTable(ctx, vp.vertical, canPlaceCue && state.isBreakShot);

    for (const b of effectiveBalls) {
      drawBall(ctx, b, vp.vertical);
    }

    const cue = effectiveBalls.find((b) => b.id === 0);

    if (canPlaceCue && cue && !cue.pocketed) {
      const { lx: cx, ly: cy } = tableToLocal(cue.x, cue.y, vp.vertical);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, BALL_RADIUS + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 226, 130, 0.94)";
      ctx.lineWidth = 2.6;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    if (canShootNow && cue && !cue.pocketed) {
      const preview = computeAimPreview(cue, aimAngle, effectiveBalls);
      const startL = tableToLocal(preview.startX, preview.startY, vp.vertical);
      const endL = tableToLocal(preview.endX, preview.endY, vp.vertical);
      const legal = isTargetLegal(preview.targetBallId);

      // Dashed aiming ray
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startL.lx, startL.ly);
      ctx.lineTo(endL.lx, endL.ly);
      ctx.strokeStyle = legal
        ? "rgba(255, 255, 255, 0.8)"
        : "rgba(248, 113, 113, 0.9)";
      ctx.lineWidth = 2.1;
      ctx.setLineDash([7, 6]);
      ctx.stroke();
      ctx.restore();

      // Ghost ball at impact
      ctx.save();
      ctx.beginPath();
      ctx.arc(endL.lx, endL.ly, BALL_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = legal
        ? "rgba(255, 255, 255, 0.88)"
        : "rgba(248, 113, 113, 0.94)";
      ctx.lineWidth = 2;
      ctx.fillStyle = legal
        ? "rgba(255, 255, 255, 0.14)"
        : "rgba(248, 113, 113, 0.22)";
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
          const tbStart = tableToLocal(targetBall.x, targetBall.y, vp.vertical);
          const tbEnd = tableToLocal(
            targetBall.x + preview.targetDirX * 120,
            targetBall.y + preview.targetDirY * 120,
            vp.vertical
          );
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(tbStart.lx, tbStart.ly);
          ctx.lineTo(tbEnd.lx, tbEnd.ly);
          ctx.strokeStyle = legal
            ? "rgba(134, 239, 172, 0.92)"
            : "rgba(248, 113, 113, 0.92)";
          ctx.lineWidth = 2.8;
          ctx.stroke();
          ctx.restore();
        }

        if (preview.cueDeflectX !== null && preview.cueDeflectY !== null) {
          const cdEnd = tableToLocal(
            preview.endX + preview.cueDeflectX * 54,
            preview.endY + preview.cueDeflectY * 54,
            vp.vertical
          );
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(endL.lx, endL.ly);
          ctx.lineTo(cdEnd.lx, cdEnd.ly);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Direct-pullback Tapered Cue Stick
      const canvasAngle = tableAngleToCanvasAngle(aimAngle, vp.vertical);
      drawCueStick(
        ctx,
        startL.lx,
        startL.ly,
        canvasAngle,
        pullPower * 125,
        pullPower,
        isPullingStick,
        true
      );
    }

    ctx.restore();
  }, [
    vp,
    effectiveBalls,
    aimAngle,
    pullPower,
    isPullingStick,
    canShootNow,
    canPlaceCue,
    state.isBreakShot,
    isAnimating,
    isTargetLegal,
  ]);

  // Isolated 60fps Shot Animation Loop
  useEffect(() => {
    if (!isAnimating) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(vp.stageW * dpr);
    const targetH = Math.round(vp.stageH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const STRIKE_MS = 90;
    let lastFrameTime = performance.now();
    let frameAccumulator = 0;

    const tick = (now: number) => {
      const elapsed = now - animStrikeStartRef.current;
      const dt = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, vp.stageW, vp.stageH);
      ctx.translate(vp.originX, vp.originY);
      ctx.scale(vp.scale, vp.scale);

      drawPoolTable(ctx, vp.vertical, false);

      const frames = animFramesRef.current;
      const meta = animShotMetaRef.current;

      if (elapsed < STRIKE_MS && meta && frames[0]) {
        for (const b of frames[0]) {
          drawBall(ctx, b, vp.vertical);
        }
        const t = Math.min(1, elapsed / STRIKE_MS);
        const eased = 1 - (1 - t) * (1 - t);
        const pullback = meta.power * 125 * (1 - eased) - eased * 6;
        const cueL = tableToLocal(
          meta.cueStart.x,
          meta.cueStart.y,
          vp.vertical
        );
        drawCueStick(
          ctx,
          cueL.lx,
          cueL.ly,
          tableAngleToCanvasAngle(meta.angle, vp.vertical),
          Math.max(-5, pullback),
          meta.power * (1 - eased),
          false,
          false
        );
        ctx.restore();
        animRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

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
          drawBall(ctx, b, vp.vertical);
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
  }, [isAnimating, vp]);

  // Fire shot with chosen pullback power
  function fireShot(power: number) {
    if (!canShootNow || power < 0.04) return;
    const cue = effectiveBalls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;

    const move: PoolMove = {
      angle: Math.round(aimAngle * 10000) / 10000,
      power: Math.round(Math.min(1, power) * 1000) / 1000,
      cueBallPos: state.ballInHand ? { x: cue.x, y: cue.y } : null,
    };

    lastAnimatedSeqRef.current = (state.shotCount || 0) + 1;
    startShotAnimation(effectiveBalls, move);
    onMakeMove(move);
  }

  function pointerToStage(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canShootNow) return;
    const cue = effectiveBalls.find((b) => b.id === 0);
    if (!cue || cue.pocketed) return;

    const { sx, sy } = pointerToStage(e);
    const { tx, ty } = stageToTable(sx, sy, vp);
    e.currentTarget.setPointerCapture(e.pointerId);

    const distToCue = Math.hypot(tx - cue.x, ty - cue.y);

    // 1. Ball-in-Hand cue placement
    if (canPlaceCue && distToCue <= BALL_RADIUS * 2.1) {
      dragStateRef.current = { mode: "place_cue" };
      return;
    }

    // 2. Grab cue stick shaft to pull back for shot power
    const backX = -Math.cos(aimAngle);
    const backY = -Math.sin(aimAngle);
    const perpX = -backY;
    const perpY = backX;
    const vx = tx - cue.x;
    const vy = ty - cue.y;
    const along = vx * backX + vy * backY;
    const perp = Math.abs(vx * perpX + vy * perpY);

    if (
      along >= BALL_RADIUS * 0.7 &&
      along <= STICK_LENGTH + 50 &&
      perp <= 48
    ) {
      const canvasAngle = tableAngleToCanvasAngle(aimAngle, vp.vertical);
      const backDirX = -Math.cos(canvasAngle);
      const backDirY = -Math.sin(canvasAngle);
      const idealPullPx = Math.min(
        180,
        Math.max(105, Math.min(vp.stageW, vp.stageH) * 0.34)
      );
      const edgeRoomPx = rayDistanceToBounds(
        sx,
        sy,
        backDirX,
        backDirY,
        14,
        14,
        vp.stageW - 14,
        vp.stageH - 14
      );
      const maxPullPx = Math.max(
        56,
        Math.min(idealPullPx, Math.max(56, edgeRoomPx * 0.92))
      );

      dragStateRef.current = {
        mode: "pull_stick",
        startSx: sx,
        startSy: sy,
        backDirX,
        backDirY,
        maxPullPx,
      };
      setIsPullingStick(true);
      setPullPower(0);
      return;
    }

    // 3. Aim rotation on table cloth
    dragStateRef.current = {
      mode: "aim",
      startAimAngle: aimAngle,
      startPtrAngle: Math.atan2(ty - cue.y, tx - cue.x),
      startSx: sx,
      startSy: sy,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragStateRef.current;
    if (drag.mode === "none" || !canShootNow) return;

    const { sx, sy } = pointerToStage(e);

    if (drag.mode === "pull_stick") {
      const pullPx =
        (sx - drag.startSx) * drag.backDirX +
        (sy - drag.startSy) * drag.backDirY;
      const nextPower = Math.max(0, Math.min(1, pullPx / drag.maxPullPx));
      setPullPower(nextPower);
      return;
    }

    const { tx, ty } = stageToTable(sx, sy, vp);

    if (drag.mode === "place_cue" && canPlaceCue) {
      const margin = BALL_RADIUS + 4;
      const maxX = state.isBreakShot ? HEAD_STRING_X : TABLE_WIDTH - margin;
      const clampedX = Math.max(margin, Math.min(maxX, tx));
      const clampedY = Math.max(margin, Math.min(TABLE_HEIGHT - margin, ty));
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
        setDraftCuePos(
          findFreeSpot(clampedX, clampedY, state.balls, 0, state.isBreakShot)
        );
      }
      return;
    }

    if (drag.mode === "aim") {
      const cue = effectiveBalls.find((b) => b.id === 0);
      if (!cue || cue.pocketed) return;
      if (!drag.moved && Math.hypot(sx - drag.startSx, sy - drag.startSy) > 5) {
        drag.moved = true;
      }
      if (drag.moved && Math.hypot(tx - cue.x, ty - cue.y) > 8) {
        const currPtrAngle = Math.atan2(ty - cue.y, tx - cue.x);
        const delta = normalizeAngleDelta(currPtrAngle - drag.startPtrAngle);
        setAimAngle(drag.startAimAngle + delta);
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragStateRef.current;
    dragStateRef.current = { mode: "none" };

    if (drag.mode === "pull_stick") {
      const { sx, sy } = pointerToStage(e);
      const pullPx =
        (sx - drag.startSx) * drag.backDirX +
        (sy - drag.startSy) * drag.backDirY;
      const finalPower = Math.max(0, Math.min(1, pullPx / drag.maxPullPx));
      setIsPullingStick(false);
      setPullPower(0);
      if (finalPower >= 0.04) {
        fireShot(finalPower);
      }
      return;
    }

    if (drag.mode === "aim" && !drag.moved && canShootNow) {
      const cue = effectiveBalls.find((b) => b.id === 0);
      if (!cue || cue.pocketed) return;
      const { sx, sy } = pointerToStage(e);
      const { tx, ty } = stageToTable(sx, sy, vp);
      if (Math.hypot(tx - cue.x, ty - cue.y) > BALL_RADIUS * 1.4) {
        setAimAngle(Math.atan2(ty - cue.y, tx - cue.x));
      }
    }
  }

  function handlePointerCancel() {
    dragStateRef.current = { mode: "none" };
    setIsPullingStick(false);
    setPullPower(0);
  }

  // HUD calculations (spoiler-free while animating)
  const hudBalls =
    isAnimating && animFramesRef.current[0]
      ? animFramesRef.current[0]
      : state.balls;
  const activeTurnMember = game.currentTurnId
    ? memberById(game.currentTurnId)
    : null;
  const winnerMember = game.winnerId ? memberById(game.winnerId) : null;
  const showCompletedOverlay = isCompleted && !isAnimating;

  let centerPillText = "8-Ball";
  let centerPillBg = "rgba(255,255,255,0.1)";
  let centerPillColor = "#F4EFE7";

  if (game.status === "pending") {
    centerPillText = "Invite";
    centerPillBg = "rgba(240, 115, 64, 0.25)";
    centerPillColor = "#FCA580";
  } else if (isAnimating) {
    centerPillText = "Rolling…";
  } else if (showCompletedOverlay) {
    centerPillText = "Final";
    centerPillBg = "rgba(61, 168, 141, 0.26)";
    centerPillColor = "#7FD9A8";
  } else if (isActive && activeTurnMember) {
    const isMyShot = isPassAndPlay || game.currentTurnId === currentUser;
    if (isMyShot) {
      if (state.isBreakShot) {
        centerPillText = isPassAndPlay
          ? `${activeTurnMember.name} · Break`
          : "Break!";
      } else if (state.ballInHand) {
        centerPillText = "Ball in Hand";
        centerPillBg = "rgba(230, 184, 79, 0.26)";
        centerPillColor = "#FDE08A";
      } else {
        centerPillText = isPassAndPlay
          ? `${activeTurnMember.name}'s Turn`
          : "Your Turn";
        centerPillBg = "var(--accent)";
        centerPillColor = "#FFFFFF";
      }
    } else {
      centerPillText = `${activeTurnMember.name}'s Turn`;
    }
  }

  const powerPct = Math.round(pullPower * 100);
  const powerColor =
    pullPower < 0.4 ? "#4ADE80" : pullPower < 0.75 ? "#FACC15" : "#F87171";

  const renderPlayerHud = (player: typeof p1, alignRight: boolean) => {
    const group: BallGroup | null = state.groups[player.id] ?? null;
    const isTurn = !isAnimating && isActive && game.currentTurnId === player.id;
    const groupIds =
      group === "solids"
        ? [1, 2, 3, 4, 5, 6, 7]
        : group === "stripes"
          ? [9, 10, 11, 12, 13, 14, 15]
          : [];
    const clearedGroup =
      group !== null && getRemainingBallsForGroup(hudBalls, group).length === 0;

    return (
      <div
        key={player.id}
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: alignRight ? "row-reverse" : "row",
          gap: 6,
          minWidth: 0,
          flex: 1,
          opacity: isActive && !isAnimating && !isTurn ? 0.65 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <div
          style={{
            borderRadius: "50%",
            boxShadow: isTurn ? "0 0 0 2px var(--accent)" : "none",
            flexShrink: 0,
          }}
        >
          <AvatarDot id={player.id} size={24} />
        </div>
        <div
          style={{
            minWidth: 0,
            textAlign: alignRight ? "right" : "left",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: "#F4EFE7",
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 84,
            }}
          >
            {player.id === currentUser && !isPassAndPlay ? "You" : player.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: alignRight ? "flex-end" : "flex-start",
              gap: 2,
              marginTop: 2,
            }}
          >
            {group === null ? (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  color: "rgba(244,239,231,0.5)",
                }}
              >
                Open
              </span>
            ) : clearedGroup ? (
              <TinyBallDot
                id={8}
                pocketed={Boolean(hudBalls.find((b) => b.id === 8)?.pocketed)}
              />
            ) : (
              groupIds.map((id) => (
                <TinyBallDot
                  key={id}
                  id={id}
                  pocketed={Boolean(
                    hudBalls.find((b) => b.id === id)?.pocketed
                  )}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 120,
        background: "#12100E",
        color: "#F4EFE7",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        overscrollBehavior: "none",
      }}
    >
      {/* Slim ~44px Top HUD Strip */}
      <div
        style={{
          padding: "calc(6px + env(safe-area-inset-top)) 10px 6px",
          minHeight: 44,
          background: "rgba(22, 18, 15, 0.96)",
          borderBottom: "1px solid rgba(255, 232, 200, 0.1)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Games"
          title="Back to Games"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(255, 255, 255, 0.09)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#F4EFE7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} />
        </button>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {renderPlayerHud(p1, false)}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              padding: "3px 8px",
              borderRadius: 999,
              background: centerPillBg,
              color: centerPillColor,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {centerPillText}
          </span>
          {renderPlayerHud(p2, true)}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}
        >
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
              aria-label="Replay last shot"
              title="Replay last shot"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(255, 255, 255, 0.09)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#F4EFE7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Play size={14} />
            </button>
          )}
          {isActive && isParticipant && (
            <button
              type="button"
              onClick={() => setConfirmForfeit((v) => !v)}
              aria-label="Forfeit match"
              title="Forfeit match"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: confirmForfeit
                  ? "rgba(240, 113, 96, 0.25)"
                  : "rgba(255, 255, 255, 0.09)",
                border: confirmForfeit
                  ? "1px solid rgba(240, 113, 96, 0.6)"
                  : "1px solid rgba(255, 255, 255, 0.12)",
                color: confirmForfeit ? "#FCA396" : "rgba(244,239,231,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Flag size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Full-Screen Pool Table Stage (Zero Scroll) */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          position: "relative",
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            userSelect: "none",
            cursor: isPullingStick
              ? "grabbing"
              : canShootNow
                ? "crosshair"
                : "default",
          }}
        />

        {/* Live Cue-Stick Pullback Power Pill */}
        {isPullingStick && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(18, 15, 12, 0.88)",
              backdropFilter: "blur(8px)",
              border: `1.5px solid ${pullPower < 0.04 ? "rgba(255,255,255,0.22)" : powerColor}`,
              borderRadius: 999,
              padding: "6px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              pointerEvents: "none",
              zIndex: 15,
              boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                width: 68,
                height: 7,
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${powerPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: powerColor,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: pullPower < 0.04 ? "#C6BCB0" : powerColor,
                whiteSpace: "nowrap",
              }}
            >
              {pullPower < 0.04
                ? "Release to cancel"
                : `${powerPct}% · Release!`}
            </span>
          </div>
        )}

        {/* Brief Non-Intrusive Shot Summary Toast */}
        {shotToast && !isPullingStick && !showCompletedOverlay && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(14px + env(safe-area-inset-bottom))",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(18, 15, 12, 0.88)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 232, 200, 0.2)",
              color: "#F4EFE7",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              maxWidth: "90vw",
              overflow: "hidden",
              textOverflow: "ellipsis",
              pointerEvents: "none",
              zIndex: 12,
            }}
          >
            {shotToast}
          </div>
        )}

        {/* Subtle Turn Control Hint */}
        {canShootNow && !isPullingStick && !shotToast && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(12px + env(safe-area-inset-bottom))",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(18, 15, 12, 0.72)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "rgba(244, 239, 231, 0.86)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 11,
            }}
          >
            {canPlaceCue
              ? "Drag cue ball · Aim cloth · Pull stick back to shoot"
              : "Drag cloth to aim · Pull stick back to shoot"}
          </div>
        )}

        {/* Forfeit Confirm Floating Popover */}
        {confirmForfeit && isActive && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(28, 23, 19, 0.96)",
              border: "1px solid rgba(240, 113, 96, 0.45)",
              borderRadius: 14,
              padding: "10px 12px",
              boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
              zIndex: 25,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#F4EFE7" }}>
              Forfeit rack?
            </span>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setConfirmForfeit(false);
                onForfeit();
              }}
              style={{
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Forfeit
            </button>
            <button
              type="button"
              onClick={() => setConfirmForfeit(false)}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#F4EFE7",
                border: "none",
                borderRadius: 8,
                padding: "5px 9px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Floating Pending / Declined / Cancelled Overlay */}
        {(isPendingForMe ||
          isPendingByMe ||
          game.status === "declined" ||
          game.status === "cancelled") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(12, 10, 8, 0.48)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 320,
                background: "rgba(28, 23, 19, 0.96)",
                border: "1px solid rgba(255, 232, 200, 0.18)",
                borderRadius: 20,
                padding: "20px 18px",
                textAlign: "center",
                boxShadow: "0 18px 44px rgba(0,0,0,0.55)",
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 6 }}>🎱</div>
              <div
                style={{
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {isPendingForMe
                  ? `${memberById(game.challengerId).name} challenged you!`
                  : isPendingByMe
                    ? `Waiting for ${memberById(game.opponentId).name}…`
                    : game.status === "declined"
                      ? `${memberById(game.opponentId).name} declined`
                      : `${memberById(game.challengerId).name} cancelled`}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "rgba(244,239,231,0.7)",
                  marginBottom: 16,
                  lineHeight: 1.4,
                }}
              >
                {isPendingForMe
                  ? "Accept to rack 'em up and start playing 8-Ball Pool."
                  : isPendingByMe
                    ? "They've been notified — your match starts as soon as they accept."
                    : "Start a new match anytime from the Games lobby."}
              </div>

              {isPendingForMe ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => onRespondInvite("accept")}
                    style={{
                      flex: 1,
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 11,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <Check size={15} strokeWidth={2.8} /> Accept
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => onRespondInvite("decline")}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.1)",
                      color: "#F4EFE7",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 11,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                    }}
                  >
                    <X size={15} /> Decline
                  </button>
                </div>
              ) : isPendingByMe ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={onBack}
                    style={{
                      flex: 1,
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 11,
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Back to Games
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => onRespondInvite("cancel")}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      color: "rgba(244,239,231,0.85)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 11,
                      padding: "10px 14px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    width: "100%",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 11,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Back to Games
                </button>
              )}
            </div>
          </div>
        )}

        {/* Floating Victory / Post-Game Overlay (only shown once balls stop rolling) */}
        {showCompletedOverlay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(12, 10, 8, 0.52)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 320,
                background: "rgba(28, 23, 19, 0.96)",
                border: "1px solid rgba(127, 217, 168, 0.35)",
                borderRadius: 20,
                padding: "20px 18px",
                textAlign: "center",
                boxShadow: "0 18px 44px rgba(0,0,0,0.55)",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  background: "rgba(61, 168, 141, 0.2)",
                  color: "#7FD9A8",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Trophy size={24} />
              </div>
              <div
                style={{
                  fontFamily: "'Baloo 2', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {game.outcome === "forfeit" && winnerMember
                  ? winnerMember.id === currentUser && !isPassAndPlay
                    ? "You won by forfeit!"
                    : `${winnerMember.name} won by forfeit`
                  : winnerMember
                    ? winnerMember.id === currentUser && !isPassAndPlay
                      ? "You won the rack! 🎱"
                      : `${winnerMember.name} wins! 🎱`
                    : "Match complete"}
              </div>
              {state.lastShot && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "rgba(244,239,231,0.72)",
                    marginBottom: 16,
                    lineHeight: 1.4,
                  }}
                >
                  {state.lastShot.summary}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {isParticipant && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onRematch}
                    style={{
                      width: "100%",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 11,
                      padding: "11px 14px",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: submitting ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <RotateCcw size={15} />
                    {isPassAndPlay ? "Rack Again" : "Send Rematch"}
                  </button>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {state.lastShot && (
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
                        flex: 1,
                        background: "rgba(255,255,255,0.1)",
                        color: "#F4EFE7",
                        border: "1px solid rgba(255,255,255,0.16)",
                        borderRadius: 11,
                        padding: "9px 12px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <Play size={13} /> Replay
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onBack}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.1)",
                      color: "#F4EFE7",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 11,
                      padding: "9px 12px",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Back to Games
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
