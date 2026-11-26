"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Flag,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  BALL_RADIUS,
  computeAimPreview,
  CORNER_MOUTH,
  findFreeSpot,
  getBallQuat,
  HEAD_STRING_X,
  isCueBallPlacementValid,
  nlerpQuat,
  POCKETS,
  POOL_BALL_VISUALS,
  rotateVecByQuat,
  SIDE_MOUTH_HALF,
  simulatePoolShot,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  type PoolBall,
  type PoolFrameBall,
  type PoolSoundEvent,
} from "@/lib/games/poolPhysics";
import {
  loadPoolMuted,
  playPoolSound,
  primePoolAudio,
  savePoolMuted,
} from "@/lib/games/poolAudio";
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
  // Reserve comfortable cue-stick grab & pullback apron around all four sides
  const padX = Math.round(Math.max(42, Math.min(96, safeW * 0.115)));
  const padY = Math.round(Math.max(44, Math.min(96, safeH * 0.105)));
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

/* ---- True 3D Rolling Pool Ball Renderer ---- */

const CUE_MEASLES_AXES: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const STRIPE_CAP_LATITUDE = 0.56;
const STRIPE_CAP_RADIUS = Math.sqrt(
  1 - STRIPE_CAP_LATITUDE * STRIPE_CAP_LATITUDE
);

function toScreenVec(
  v: [number, number, number],
  vertical: boolean
): [number, number, number] {
  return vertical ? [v[1], -v[0], v[2]] : v;
}

/**
 * Draws the exact orthographic 3D projection of a spherical cap { p · n >= h }
 * onto a clipped 2D disc of radius r. Handles full visibility, partial limb
 * wrap-around, and edge-on tilts continuously with zero seams.
 */
function drawSphericalCap(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  nx: number,
  ny: number,
  nz: number
) {
  const h = STRIPE_CAP_LATITUDE;
  const rc = STRIPE_CAP_RADIUS;
  if (nz <= -rc + 1e-4) return;

  const pLen = Math.hypot(nx, ny);
  ctx.save();
  ctx.translate(cx, cy);
  if (pLen > 1e-5) {
    ctx.rotate(Math.atan2(ny, nx));
  }

  ctx.beginPath();
  if (nz >= rc - 1e-4) {
    // Cap lies entirely inside the visible front hemisphere
    ctx.ellipse(
      h * pLen * r,
      0,
      Math.max(0.15, rc * nz * r),
      rc * r,
      0,
      0,
      Math.PI * 2
    );
  } else {
    // Cap wraps over the silhouette rim: outer circular arc + front ellipse arc
    const uRim = Math.max(-1, Math.min(1, h / pLen));
    const thetaRim = Math.acos(uRim);
    const cosT0 = Math.max(-1, Math.min(1, -(h * nz) / (rc * pLen)));
    const t0 = Math.acos(cosT0);
    const uCenter = h * pLen;
    const uAmp = rc * nz;

    ctx.arc(0, 0, r + 0.5, -thetaRim, thetaRim, false);
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = t0 - (2 * t0 * i) / steps;
      const u = uCenter - uAmp * Math.cos(t);
      const v = rc * Math.sin(t);
      ctx.lineTo(u * r, v * r);
    }
    ctx.closePath();
  }

  ctx.fillStyle = "#FAF7F0";
  ctx.fill();
  ctx.restore();
}

function drawBall3D(
  ctx: CanvasRenderingContext2D,
  ball: PoolBall | PoolFrameBall,
  vertical: boolean
) {
  if (ball.pocketed) return;
  const drop =
    "dropProgress" in ball && typeof ball.dropProgress === "number"
      ? Math.max(0, Math.min(1, ball.dropProgress))
      : 0;
  const { lx: cx, ly: cy } = tableToLocal(ball.x, ball.y, vertical);
  const r = BALL_RADIUS * (1 - 0.56 * drop);
  if (r < 1.5) return;

  const visual = POOL_BALL_VISUALS[ball.id] || {
    color: "#FAF7F0",
    stripe: false,
  };
  const q = getBallQuat(ball);

  // Directional overhead billiard lamp offset from table center
  const txOff = (ball.x - TABLE_WIDTH / 2) / (TABLE_WIDTH / 2);
  const tyOff = (ball.y - TABLE_HEIGHT / 2) / (TABLE_HEIGHT / 2);
  const dxL = vertical ? tyOff : txOff;
  const dyL = vertical ? -txOff : tyOff;

  // 1. Directional cast shadow + tight contact ambient-occlusion ring
  if (drop < 0.85) {
    const shadowAlpha = 1 - drop / 0.85;
    const shX = cx + dxL * 3.8 + 1.0;
    const shY = cy + dyL * 3.8 + 1.4;
    ctx.save();
    const castGrad = ctx.createRadialGradient(
      shX,
      shY,
      r * 0.25,
      shX,
      shY,
      r * 1.18
    );
    castGrad.addColorStop(0, `rgba(0, 0, 0, ${0.42 * shadowAlpha})`);
    castGrad.addColorStop(0.72, `rgba(0, 0, 0, ${0.26 * shadowAlpha})`);
    castGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.beginPath();
    ctx.arc(shX, shY, r * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = castGrad;
    ctx.fill();

    // Crisp contact shadow right under sphere base
    ctx.beginPath();
    ctx.arc(cx, cy + 0.6, r * 1.01, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.24 * shadowAlpha})`;
    ctx.fill();
    ctx.restore();
  }

  // 2. Clipped 3D Sphere Body
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Base resin color
  ctx.fillStyle = ball.id === 0 ? "#FBF8F1" : visual.color;
  ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);

  if (ball.id === 0) {
    // Pro-cup cue ball: 6 crimson measles dots on ±X, ±Y, ±Z axes
    for (let i = 0; i < CUE_MEASLES_AXES.length; i++) {
      const axis = CUE_MEASLES_AXES[i];
      const [sx, sy, sz] = toScreenVec(
        rotateVecByQuat(q, axis[0], axis[1], axis[2]),
        vertical
      );
      if (sz <= 0.05) continue;
      const dotR = r * 0.145;
      const px = cx + sx * r;
      const py = cy + sy * r;
      const phi = Math.atan2(sy, sx);
      ctx.save();
      ctx.globalAlpha = Math.min(1, sz * 3.8);
      ctx.beginPath();
      ctx.ellipse(px, py, Math.max(0.35, dotR * sz), dotR, phi, 0, Math.PI * 2);
      ctx.fillStyle = "#C81E2B";
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Striped balls (9–15): two curved 3D white polar caps around local ±Y
    if (visual.stripe) {
      const [px, py, pz] = toScreenVec(rotateVecByQuat(q, 0, 1, 0), vertical);
      drawSphericalCap(ctx, cx, cy, r, px, py, pz);
      drawSphericalCap(ctx, cx, cy, r, -px, -py, -pz);
    }

    // Dual opposite 3D-foreshortened white number medallions at local ±Z
    for (const sign of [1, -1] as const) {
      const N = toScreenVec(rotateVecByQuat(q, 0, 0, sign), vertical);
      if (N[2] <= 0.1) continue;
      const U = toScreenVec(rotateVecByQuat(q, sign, 0, 0), vertical);
      const V = toScreenVec(rotateVecByQuat(q, 0, 1, 0), vertical);

      ctx.save();
      ctx.globalAlpha = Math.min(1, (N[2] - 0.1) * 4.5);
      ctx.transform(U[0], U[1], V[0], V[1], cx + N[0] * r, cy + N[1] * r);

      const medR = r * 0.46;
      ctx.beginPath();
      ctx.arc(0, 0, medR, 0, Math.PI * 2);
      ctx.fillStyle = "#FAF7F0";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
      ctx.lineWidth = 0.65;
      ctx.stroke();

      const fontSize = Math.max(
        5.5,
        Math.round(r * (ball.id >= 10 ? 0.56 : 0.68))
      );
      ctx.fillStyle = "#141417";
      ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ball.id), 0, 0.4);

      if (ball.id === 6 || ball.id === 9) {
        ctx.fillRect(-r * 0.17, r * 0.27, r * 0.34, 1.15);
      }
      ctx.restore();
    }
  }

  // 3. Overhead Lamp Spherical Curvature Shading
  const litX = cx - dxL * r * 0.16 - r * 0.22;
  const litY = cy - dyL * r * 0.16 - r * 0.24;
  const shadeGrad = ctx.createRadialGradient(
    litX,
    litY,
    r * 0.08,
    cx,
    cy,
    r * 1.06
  );
  shadeGrad.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  shadeGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.02)");
  shadeGrad.addColorStop(0.72, "rgba(0, 0, 0, 0.18)");
  shadeGrad.addColorStop(1, "rgba(0, 0, 0, 0.48)");
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);

  // Subtle emerald felt bounce glow along bottom rim
  if (drop < 0.4) {
    const bounceGrad = ctx.createRadialGradient(
      cx + dxL * r * 0.2,
      cy + r * 0.85,
      r * 0.1,
      cx,
      cy + r * 0.65,
      r * 0.72
    );
    bounceGrad.addColorStop(0, "rgba(42, 188, 128, 0.18)");
    bounceGrad.addColorStop(1, "rgba(42, 188, 128, 0)");
    ctx.fillStyle = bounceGrad;
    ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);
  }

  // Phenolic gloss specular highlight + tiny crisp lamp glint
  const specX = cx - dxL * r * 0.14 - r * 0.28;
  const specY = cy - dyL * r * 0.14 - r * 0.30;
  ctx.beginPath();
  ctx.ellipse(specX, specY, r * 0.24, r * 0.14, -Math.PI / 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.46 * (1 - drop * 0.7)})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(specX - r * 0.04, specY - r * 0.03, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.78 * (1 - drop * 0.7)})`;
  ctx.fill();

  // Darken smoothly as ball sinks into pocket well
  if (drop > 0.01) {
    ctx.fillStyle = `rgba(5, 4, 3, ${drop * 0.84})`;
    ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2);
  }

  ctx.restore();
}

/* ---- Offscreen-Cached High-Detail Tournament Pool Table ---- */

let cachedClothPatternCanvas: HTMLCanvasElement | null = null;
const cachedTableCanvases = new Map<string, HTMLCanvasElement>();

function getClothPatternCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (cachedClothPatternCanvas) return cachedClothPatternCanvas;

  const tile = document.createElement("canvas");
  tile.width = 48;
  tile.height = 48;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  // Deterministic subtle woven Simonis wool-baize micro-grain
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = 0; y < 48; y += 2) {
    for (let x = 0; x < 48; x += 2) {
      const v = rand();
      if (v > 0.54) {
        tctx.fillStyle = `rgba(255, 255, 255, ${(v - 0.54) * 0.055})`;
        tctx.fillRect(x, y, 2, 1);
      } else if (v < 0.44) {
        tctx.fillStyle = `rgba(0, 0, 0, ${(0.44 - v) * 0.07})`;
        tctx.fillRect(x, y, 1, 2);
      }
    }
  }
  cachedClothPatternCanvas = tile;
  return tile;
}

function drawBeveledCushionSegment(
  ctx: CanvasRenderingContext2D,
  polyTable: readonly [number, number][],
  noseA: readonly [number, number],
  noseB: readonly [number, number],
  shadowOffsetTable: readonly [number, number],
  vertical: boolean
) {
  const pts = polyTable.map(([tx, ty]) => tableToLocal(tx, ty, vertical));
  const nA = tableToLocal(noseA[0], noseA[1], vertical);
  const nB = tableToLocal(noseB[0], noseB[1], vertical);
  const shA = tableToLocal(
    noseA[0] + shadowOffsetTable[0],
    noseA[1] + shadowOffsetTable[1],
    vertical
  );
  const shB = tableToLocal(
    noseB[0] + shadowOffsetTable[0],
    noseB[1] + shadowOffsetTable[1],
    vertical
  );

  // 1. Soft cushion overhang shadow cast onto the emerald cloth
  ctx.save();
  const shGrad = ctx.createLinearGradient(nA.lx, nA.ly, shA.lx, shA.ly);
  shGrad.addColorStop(0, "rgba(0, 0, 0, 0.36)");
  shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.beginPath();
  ctx.moveTo(nA.lx, nA.ly);
  ctx.lineTo(nB.lx, nB.ly);
  ctx.lineTo(shB.lx, shB.ly);
  ctx.lineTo(shA.lx, shA.ly);
  ctx.closePath();
  ctx.fillStyle = shGrad;
  ctx.fill();
  ctx.restore();

  // 2. Beveled rubber cushion body with gradient from wood rail to nose
  const backMidX = (pts[2].lx + pts[3].lx) * 0.5;
  const backMidY = (pts[2].ly + pts[3].ly) * 0.5;
  const noseMidX = (nA.lx + nB.lx) * 0.5;
  const noseMidY = (nA.ly + nB.ly) * 0.5;

  ctx.save();
  const cushGrad = ctx.createLinearGradient(
    backMidX,
    backMidY,
    noseMidX,
    noseMidY
  );
  cushGrad.addColorStop(0, "#0A4630");
  cushGrad.addColorStop(0.55, "#116647");
  cushGrad.addColorStop(0.88, "#1A865E");
  cushGrad.addColorStop(1, "#0E563B");

  ctx.beginPath();
  ctx.moveTo(pts[0].lx, pts[0].ly);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].lx, pts[i].ly);
  }
  ctx.closePath();
  ctx.fillStyle = cushGrad;
  ctx.fill();

  // Crisp top nose highlight along the playable rail edge
  ctx.beginPath();
  ctx.moveTo(nA.lx, nA.ly);
  ctx.lineTo(nB.lx, nB.ly);
  ctx.strokeStyle = "rgba(176, 255, 224, 0.24)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Subtle dark border along jaw facings
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function renderPoolTableScene(
  ctx: CanvasRenderingContext2D,
  vertical: boolean,
  highlightKitchen: boolean
) {
  const cw = vertical ? V_TABLE_W : H_TABLE_W;
  const ch = vertical ? V_TABLE_H : H_TABLE_H;
  const feltX = RAIL;
  const feltY = RAIL;
  const feltW = cw - RAIL * 2;
  const feltH = ch - RAIL * 2;

  // 1. Outer Grained Walnut Wood Cabinet Frame
  const woodGrad = ctx.createLinearGradient(0, 0, cw, ch);
  woodGrad.addColorStop(0, "#754020");
  woodGrad.addColorStop(0.3, "#532A14");
  woodGrad.addColorStop(0.68, "#633419");
  woodGrad.addColorStop(1, "#3A1C0B");

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, cw, ch, 26);
  ctx.fillStyle = woodGrad;
  ctx.fill();
  ctx.clip();

  // Subtle longitudinal walnut grain streaks
  ctx.strokeStyle = "rgba(25, 10, 4, 0.16)";
  ctx.lineWidth = 1.6;
  for (let i = 6; i < Math.max(cw, ch); i += 11) {
    ctx.beginPath();
    if (!vertical) {
      ctx.moveTo(0, i % ch);
      ctx.bezierCurveTo(
        cw * 0.33,
        (i % ch) + ((i % 3) - 1) * 4,
        cw * 0.66,
        (i % ch) - ((i % 3) - 1) * 3,
        cw,
        i % ch
      );
    } else {
      ctx.moveTo(i % cw, 0);
      ctx.bezierCurveTo(
        (i % cw) + ((i % 3) - 1) * 4,
        ch * 0.33,
        (i % cw) - ((i % 3) - 1) * 3,
        ch * 0.66,
        i % cw,
        ch
      );
    }
    ctx.stroke();
  }

  // Brushed brass corner castings + mid-rail side pocket plates
  const plateSize = 46;
  const brassGrad = ctx.createLinearGradient(0, 0, cw, ch);
  brassGrad.addColorStop(0, "#E3B866");
  brassGrad.addColorStop(0.45, "#B07F31");
  brassGrad.addColorStop(0.75, "#D9AC57");
  brassGrad.addColorStop(1, "#8D6222");
  ctx.fillStyle = brassGrad;

  const corners: [number, number, number, number, number, number][] = [
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

  // Matching brass side-pocket plates
  if (!vertical) {
    ctx.fillRect(cw / 2 - 26, 0, 52, 22);
    ctx.fillRect(cw / 2 - 26, ch - 22, 52, 22);
  } else {
    ctx.fillRect(0, ch / 2 - 26, 22, 52);
    ctx.fillRect(cw - 22, ch / 2 - 26, 22, 52);
  }

  // Subtle brass corner rivets
  const rivets: [number, number][] = [
    [13, 35],
    [35, 13],
    [cw - 13, 35],
    [cw - 35, 13],
    [13, ch - 35],
    [35, ch - 13],
    [cw - 13, ch - 35],
    [cw - 35, ch - 13],
  ];
  for (const [rx, ry] of rivets) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(70, 42, 12, 0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(rx - 0.5, ry - 0.5, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 240, 200, 0.55)";
    ctx.fill();
  }

  // Outer warm bevel edge
  ctx.beginPath();
  ctx.roundRect(1, 1, cw - 2, ch - 2, 25);
  ctx.strokeStyle = "rgba(255, 224, 178, 0.24)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 2. Dark Recessed Cushion Backing Channel (for pocket throats)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(feltX - 14, feltY - 14, feltW + 28, feltH + 28, 12);
  ctx.fillStyle = "#093927";
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 3. Tournament Emerald Simonis Wool Baize Surface
  ctx.save();
  ctx.beginPath();
  ctx.rect(feltX - 13, feltY - 13, feltW + 26, feltH + 26);
  ctx.clip();

  const feltGrad = ctx.createRadialGradient(
    cw / 2,
    ch / 2,
    40,
    cw / 2,
    ch / 2,
    Math.max(feltW, feltH) * 0.72
  );
  feltGrad.addColorStop(0, "#1E9567");
  feltGrad.addColorStop(0.58, "#157852");
  feltGrad.addColorStop(1, "#0E583C");
  ctx.fillStyle = feltGrad;
  ctx.fillRect(feltX - 13, feltY - 13, feltW + 26, feltH + 26);

  // Dual overhead billiard-lamp warm illumination pools (at 30% & 70% table length)
  for (const frac of [0.3, 0.7]) {
    const lamp = tableToLocal(TABLE_WIDTH * frac, TABLE_HEIGHT / 2, vertical);
    const poolGrad = ctx.createRadialGradient(
      lamp.lx,
      lamp.ly,
      10,
      lamp.lx,
      lamp.ly,
      250
    );
    poolGrad.addColorStop(0, "rgba(180, 255, 220, 0.10)");
    poolGrad.addColorStop(0.55, "rgba(160, 255, 210, 0.03)");
    poolGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = poolGrad;
    ctx.fillRect(feltX, feltY, feltW, feltH);
  }

  // Subtle woven wool micro-texture overlay
  const clothTile = getClothPatternCanvas();
  if (clothTile) {
    const pattern = ctx.createPattern(clothTile, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(feltX, feltY, feltW, feltH);
    }
  }

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
  const hs1 = tableToLocal(HEAD_STRING_X, 5, vertical);
  const hs2 = tableToLocal(HEAD_STRING_X, TABLE_HEIGHT - 5, vertical);
  ctx.beginPath();
  ctx.moveTo(hs1.lx, hs1.ly);
  ctx.lineTo(hs2.lx, hs2.ly);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Head & Foot spot markers (with dark center dot like real tournament stickers)
  const spots = [
    tableToLocal(225, 250, vertical),
    tableToLocal(750, 250, vertical),
  ];
  for (const s of spots) {
    ctx.beginPath();
    ctx.arc(s.lx, s.ly, 4.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.36)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.lx, s.ly, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10, 45, 30, 0.55)";
    ctx.fill();
  }
  ctx.restore();

  // 4. Six Recessed Pockets with Stitched Leather Collars (rendered beneath cushion jaws)
  for (const p of POCKETS) {
    const { lx: cx, ly: cy } = tableToLocal(p.x, p.y, vertical);

    // Outer stitched dark leather collar
    ctx.beginPath();
    ctx.arc(cx, cy, p.visualRadius + 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#22140B";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 224, 178, 0.14)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Deep recessed pocket well
    const holeGrad = ctx.createRadialGradient(
      cx,
      cy,
      2,
      cx,
      cy,
      p.visualRadius
    );
    holeGrad.addColorStop(0, "#020202");
    holeGrad.addColorStop(0.72, "#090706");
    holeGrad.addColorStop(1, "#221811");
    ctx.beginPath();
    ctx.arc(cx, cy, p.visualRadius, 0, Math.PI * 2);
    ctx.fillStyle = holeGrad;
    ctx.fill();
  }

  // 5. Six Beveled Cushion Rails with Angled Pocket Jaws
  const C = 13;
  const JC = 11; // Corner jaw flare
  const JS = 6; // Side jaw flare
  const SH = 9; // Cushion shadow reach onto cloth

  // Top-left & top-right
  drawBeveledCushionSegment(
    ctx,
    [
      [CORNER_MOUTH, 0],
      [500 - SIDE_MOUTH_HALF, 0],
      [500 - SIDE_MOUTH_HALF + JS, -C],
      [CORNER_MOUTH - JC, -C],
    ],
    [CORNER_MOUTH, 0],
    [500 - SIDE_MOUTH_HALF, 0],
    [0, SH],
    vertical
  );
  drawBeveledCushionSegment(
    ctx,
    [
      [500 + SIDE_MOUTH_HALF, 0],
      [TABLE_WIDTH - CORNER_MOUTH, 0],
      [TABLE_WIDTH - CORNER_MOUTH + JC, -C],
      [500 + SIDE_MOUTH_HALF - JS, -C],
    ],
    [500 + SIDE_MOUTH_HALF, 0],
    [TABLE_WIDTH - CORNER_MOUTH, 0],
    [0, SH],
    vertical
  );

  // Bottom-left & bottom-right
  drawBeveledCushionSegment(
    ctx,
    [
      [CORNER_MOUTH, TABLE_HEIGHT],
      [500 - SIDE_MOUTH_HALF, TABLE_HEIGHT],
      [500 - SIDE_MOUTH_HALF + JS, TABLE_HEIGHT + C],
      [CORNER_MOUTH - JC, TABLE_HEIGHT + C],
    ],
    [CORNER_MOUTH, TABLE_HEIGHT],
    [500 - SIDE_MOUTH_HALF, TABLE_HEIGHT],
    [0, -SH],
    vertical
  );
  drawBeveledCushionSegment(
    ctx,
    [
      [500 + SIDE_MOUTH_HALF, TABLE_HEIGHT],
      [TABLE_WIDTH - CORNER_MOUTH, TABLE_HEIGHT],
      [TABLE_WIDTH - CORNER_MOUTH + JC, TABLE_HEIGHT + C],
      [500 + SIDE_MOUTH_HALF - JS, TABLE_HEIGHT + C],
    ],
    [500 + SIDE_MOUTH_HALF, TABLE_HEIGHT],
    [TABLE_WIDTH - CORNER_MOUTH, TABLE_HEIGHT],
    [0, -SH],
    vertical
  );

  // Left & Right end cushions
  drawBeveledCushionSegment(
    ctx,
    [
      [0, CORNER_MOUTH],
      [0, TABLE_HEIGHT - CORNER_MOUTH],
      [-C, TABLE_HEIGHT - CORNER_MOUTH + JC],
      [-C, CORNER_MOUTH - JC],
    ],
    [0, CORNER_MOUTH],
    [0, TABLE_HEIGHT - CORNER_MOUTH],
    [SH, 0],
    vertical
  );
  drawBeveledCushionSegment(
    ctx,
    [
      [TABLE_WIDTH, CORNER_MOUTH],
      [TABLE_WIDTH, TABLE_HEIGHT - CORNER_MOUTH],
      [TABLE_WIDTH + C, TABLE_HEIGHT - CORNER_MOUTH + JC],
      [TABLE_WIDTH + C, CORNER_MOUTH - JC],
    ],
    [TABLE_WIDTH, CORNER_MOUTH],
    [TABLE_WIDTH, TABLE_HEIGHT - CORNER_MOUTH],
    [-SH, 0],
    vertical
  );

  // 6. Inlaid Mother-of-Pearl / Ivory Diamond Sights
  const diamondCoords: { cx: number; cy: number }[] = [];
  for (const frac of [1 / 8, 2 / 8, 3 / 8, 5 / 8, 6 / 8, 7 / 8]) {
    const tx = TABLE_WIDTH * frac;
    const top = tableToLocal(tx, 0, vertical);
    const bot = tableToLocal(tx, TABLE_HEIGHT, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: top.lx, cy: RAIL / 2 - 4 });
      diamondCoords.push({ cx: bot.lx, cy: ch - RAIL / 2 + 4 });
    } else {
      diamondCoords.push({ cx: RAIL / 2 - 4, cy: top.ly });
      diamondCoords.push({ cx: cw - RAIL / 2 + 4, cy: bot.ly });
    }
  }
  for (const frac of [1 / 4, 2 / 4, 3 / 4]) {
    const ty = TABLE_HEIGHT * frac;
    const left = tableToLocal(0, ty, vertical);
    const right = tableToLocal(TABLE_WIDTH, ty, vertical);
    if (!vertical) {
      diamondCoords.push({ cx: RAIL / 2 - 4, cy: left.ly });
      diamondCoords.push({ cx: cw - RAIL / 2 + 4, cy: right.ly });
    } else {
      diamondCoords.push({ cx: left.lx, cy: ch - RAIL / 2 + 4 });
      diamondCoords.push({ cx: right.lx, cy: RAIL / 2 - 4 });
    }
  }

  for (const d of diamondCoords) {
    ctx.save();
    ctx.translate(d.cx, d.cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(35, 16, 6, 0.55)";
    ctx.fillRect(-3.8, -3.8, 7.6, 7.6);
    ctx.fillStyle = "#F5E7C9";
    ctx.fillRect(-3.0, -3.0, 6.0, 6.0);
    ctx.restore();
  }
}

function drawPoolTable(
  ctx: CanvasRenderingContext2D,
  vertical: boolean,
  highlightKitchen: boolean,
  dpr: number
) {
  const cw = vertical ? V_TABLE_W : H_TABLE_W;
  const ch = vertical ? V_TABLE_H : H_TABLE_H;
  if (typeof document === "undefined") {
    renderPoolTableScene(ctx, vertical, highlightKitchen);
    return;
  }

  const cacheScale = Math.min(2, Math.max(1, Math.round(dpr * 2) / 2));
  const key = `${vertical ? "v" : "h"}-${highlightKitchen ? "k" : "n"}-${cacheScale}`;
  let cached = cachedTableCanvases.get(key);

  if (!cached) {
    cached = document.createElement("canvas");
    cached.width = Math.round(cw * cacheScale);
    cached.height = Math.round(ch * cacheScale);
    const offCtx = cached.getContext("2d");
    if (offCtx) {
      offCtx.scale(cacheScale, cacheScale);
      renderPoolTableScene(offCtx, vertical, highlightKitchen);
      // Keep cache tiny (at most 6 entries across orientations & states)
      if (cachedTableCanvases.size >= 6) {
        const firstKey = cachedTableCanvases.keys().next().value;
        if (firstKey) cachedTableCanvases.delete(firstKey);
      }
      cachedTableCanvases.set(key, cached);
    } else {
      renderPoolTableScene(ctx, vertical, highlightKitchen);
      return;
    }
  }

  // Soft ambient cabinet drop shadow grounding the inset table onto the room floor
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.roundRect(2, 2, cw - 4, ch - 4, 26);
  ctx.fillStyle = "#1B0E07";
  ctx.fill();
  ctx.restore();

  ctx.drawImage(cached, 0, 0, cw, ch);
}

function drawCueStick(
  ctx: CanvasRenderingContext2D,
  cueX: number,
  cueY: number,
  canvasAngle: number,
  pullbackOffset: number,
  powerRatio: number,
  isPulling: boolean,
  showPullHint: boolean,
  availStickUnits?: number
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

  // Pull-back directional chevrons: stay on the visible portion of the stick even near a rail
  if (showPullHint && !isPulling) {
    const defaultCenter = shaftEnd + 70;
    const minCenter = tipStart + 32;
    const maxVisibleCenter =
      availStickUnits !== undefined
        ? Math.max(minCenter, availStickUnits - 26)
        : defaultCenter;
    const chevronCenter = Math.min(defaultCenter, maxVisibleCenter);

    // Subtle grab pill behind chevrons when shifted forward onto the lighter maple shaft
    if (chevronCenter < shaftEnd + 20) {
      ctx.fillStyle = "rgba(24, 16, 10, 0.42)";
      ctx.beginPath();
      ctx.roundRect(chevronCenter - 22, -5.4, 44, 10.8, 5);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255, 245, 220, 0.85)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const rel of [-14, 0, 14]) {
      const cx = chevronCenter + rel;
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

function TinyBallDot({
  id,
  pocketed,
  size = 10,
}: {
  id: number;
  pocketed: boolean;
  size?: number;
}) {
  const visual = POOL_BALL_VISUALS[id] || { color: "#18181B", stripe: false };
  return (
    <span
      title={`#${id}${pocketed ? " (pocketed)" : ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-block",
        position: "relative",
        overflow: "hidden",
        background: pocketed
          ? "rgba(255,255,255,0.1)"
          : visual.stripe
            ? "#FAF7F0"
            : visual.color,
        border: pocketed
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid rgba(255,255,255,0.38)",
        boxShadow: pocketed
          ? "none"
          : "inset -1.5px -1.5px 2.5px rgba(0,0,0,0.35), inset 1px 1px 1.5px rgba(255,255,255,0.35)",
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
            top: "22%",
            bottom: "22%",
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

  // Lock page scroll completely while in full-screen Pool + Escape to exit
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConfirmForfeit((open) => {
          if (open) return false;
          onBack();
          return false;
        });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [onBack]);

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

  // Interactive aiming, Ball-in-Hand, cue pullback, audio & animation state
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [pullPower, setPullPower] = useState<number>(0);
  const [isPullingStick, setIsPullingStick] = useState<boolean>(false);
  const [hoverZone, setHoverZone] = useState<"cloth" | "stick" | "cue">(
    "cloth"
  );
  const [draftCuePos, setDraftCuePos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [confirmForfeit, setConfirmForfeit] = useState<boolean>(false);
  const [shotToast, setShotToast] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const mutedRef = useRef<boolean>(false);

  // Hydrate persisted mute preference on mount (client-only)
  useEffect(() => {
    const saved = loadPoolMuted();
    setMuted(saved);
    mutedRef.current = saved;
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      savePoolMuted(next);
      if (!next) primePoolAudio();
      return next;
    });
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFramesRef = useRef<PoolFrameBall[][]>([]);
  const animSoundEventsRef = useRef<PoolSoundEvent[]>([]);
  const animNextSoundIdxRef = useRef<number>(0);
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
      animSoundEventsRef.current = sim.soundEvents;
      animNextSoundIdxRef.current = 0;
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

    drawPoolTable(ctx, vp.vertical, canPlaceCue && state.isBreakShot, dpr);

    for (const b of effectiveBalls) {
      drawBall3D(ctx, b, vp.vertical);
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
      const cueStageX = vp.originX + startL.lx * vp.scale;
      const cueStageY = vp.originY + startL.ly * vp.scale;
      const availStickPx = rayDistanceToBounds(
        cueStageX,
        cueStageY,
        -Math.cos(canvasAngle),
        -Math.sin(canvasAngle),
        4,
        4,
        vp.stageW - 4,
        vp.stageH - 4
      );
      const availStickUnits = availStickPx / vp.scale;
      drawCueStick(
        ctx,
        startL.lx,
        startL.ly,
        canvasAngle,
        pullPower * 125,
        pullPower,
        isPullingStick,
        true,
        availStickUnits
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

  // Isolated Sub-Frame Interpolated 60–120Hz Shot Animation Loop + Synced Audio
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
    const FRAME_MS = 1000 / 60;

    const tick = (now: number) => {
      const elapsed = now - animStrikeStartRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, vp.stageW, vp.stageH);
      ctx.translate(vp.originX, vp.originY);
      ctx.scale(vp.scale, vp.scale);

      drawPoolTable(ctx, vp.vertical, false, dpr);

      const frames = animFramesRef.current;
      const meta = animShotMetaRef.current;

      if (elapsed < STRIKE_MS && meta && frames[0]) {
        for (const b of frames[0]) {
          drawBall3D(ctx, b, vp.vertical);
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

      const maxIdx = Math.max(0, frames.length - 1);
      const rollMs = Math.max(0, elapsed - STRIKE_MS);
      const frameFloat = rollMs / FRAME_MS;
      const idx = Math.min(maxIdx, Math.floor(frameFloat));
      const nextIdx = Math.min(maxIdx, idx + 1);
      const alpha =
        idx >= maxIdx ? 0 : Math.max(0, Math.min(1, frameFloat - idx));

      // Fire synchronized Web Audio impact sounds up to the current physics frame
      // (skipping stale events > 4 frames old if the browser tab was backgrounded mid-shot)
      const events = animSoundEventsRef.current;
      while (
        animNextSoundIdxRef.current < events.length &&
        events[animNextSoundIdxRef.current].frame <= idx
      ) {
        const ev = events[animNextSoundIdxRef.current];
        if (idx - ev.frame <= 4) {
          playPoolSound(ev.kind, ev.intensity, mutedRef.current);
        }
        animNextSoundIdxRef.current += 1;
      }

      const frameA = frames[idx] || frames[maxIdx];
      const frameB = frames[nextIdx] || frameA;
      if (frameA && frameB) {
        const droppingBalls: PoolFrameBall[] = [];
        const clothBalls: PoolFrameBall[] = [];

        for (let i = 0; i < frameA.length; i++) {
          const a = frameA[i];
          const b = frameB[i] || a;
          if (a.pocketed && b.pocketed) continue;

          if (!a.pocketed && b.pocketed) {
            if (a.dropProgress !== undefined) {
              droppingBalls.push({
                id: a.id,
                x: a.x + (b.x - a.x) * alpha,
                y: a.y + (b.y - a.y) * alpha,
                pocketed: false,
                q: nlerpQuat(a.q, b.q, alpha),
                dropProgress: a.dropProgress + (1 - a.dropProgress) * alpha,
              });
            }
            continue;
          }

          const hasDrop =
            a.dropProgress !== undefined || b.dropProgress !== undefined;
          const interpBall: PoolFrameBall = {
            id: a.id,
            x: a.x + (b.x - a.x) * alpha,
            y: a.y + (b.y - a.y) * alpha,
            pocketed: false,
            q: alpha > 0.001 ? nlerpQuat(a.q, b.q, alpha) : a.q,
            dropProgress: hasDrop
              ? (a.dropProgress ?? 0) +
                ((b.dropProgress ?? 0) - (a.dropProgress ?? 0)) * alpha
              : undefined,
          };

          if (hasDrop) droppingBalls.push(interpBall);
          else clothBalls.push(interpBall);
        }

        // Draw sinking balls first so active cloth balls always render cleanly above them
        for (const b of droppingBalls) {
          drawBall3D(ctx, b, vp.vertical);
        }
        for (const b of clothBalls) {
          drawBall3D(ctx, b, vp.vertical);
        }
      }

      ctx.restore();

      if (frameFloat >= maxIdx) {
        while (animNextSoundIdxRef.current < events.length) {
          const ev = events[animNextSoundIdxRef.current];
          if (maxIdx - ev.frame <= 3) {
            playPoolSound(ev.kind, ev.intensity, mutedRef.current);
          }
          animNextSoundIdxRef.current += 1;
        }
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
    if (!mutedRef.current) primePoolAudio();
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

    const stickPerpTol = Math.max(54, 28 / vp.scale);
    if (
      along >= BALL_RADIUS * 0.45 &&
      along <= STICK_LENGTH + 90 &&
      perp <= stickPerpTol
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
        6,
        6,
        vp.stageW - 6,
        vp.stageH - 6
      );
      const maxPullPx = Math.max(
        28,
        Math.min(idealPullPx, edgeRoomPx * 0.94)
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
    if (!canShootNow) return;

    const { sx, sy } = pointerToStage(e);

    if (drag.mode === "none") {
      if (e.pointerType === "mouse") {
        const cue = effectiveBalls.find((b) => b.id === 0);
        if (cue && !cue.pocketed) {
          const { tx, ty } = stageToTable(sx, sy, vp);
          const distToCue = Math.hypot(tx - cue.x, ty - cue.y);
          if (canPlaceCue && distToCue <= BALL_RADIUS * 2.1) {
            setHoverZone((prev) => (prev === "cue" ? prev : "cue"));
          } else {
            const backX = -Math.cos(aimAngle);
            const backY = -Math.sin(aimAngle);
            const vx = tx - cue.x;
            const vy = ty - cue.y;
            const along = vx * backX + vy * backY;
            const perp = Math.abs(vx * -backY + vy * backX);
            const stickPerpTol = Math.max(54, 28 / vp.scale);
            const onStick =
              along >= BALL_RADIUS * 0.45 &&
              along <= STICK_LENGTH + 90 &&
              perp <= stickPerpTol;
            const next = onStick ? "stick" : "cloth";
            setHoverZone((prev) => (prev === next ? prev : next));
          }
        }
      }
      return;
    }

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

  const isStackedHud = stageSize.w < 640;

  const hudIconBtnStyle = (opts?: {
    activeDanger?: boolean;
    dimmed?: boolean;
  }): React.CSSProperties => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    background: opts?.activeDanger
      ? "rgba(240, 113, 96, 0.25)"
      : opts?.dimmed
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(255, 255, 255, 0.09)",
    border: opts?.activeDanger
      ? "1px solid rgba(240, 113, 96, 0.6)"
      : "1px solid rgba(255, 255, 255, 0.13)",
    color: opts?.activeDanger
      ? "#FCA396"
      : opts?.dimmed
        ? "rgba(244,239,231,0.45)"
        : "#F4EFE7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  });

  const renderPlayerHud = (
    player: typeof p1,
    alignRight: boolean,
    stacked: boolean
  ) => {
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
    const groupLabel =
      group === null
        ? "Open"
        : clearedGroup
          ? "8-Ball"
          : group === "solids"
            ? "Solids"
            : "Stripes";

    return (
      <div
        key={player.id}
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: alignRight ? "row-reverse" : "row",
          gap: 8,
          minWidth: 0,
          flex: 1,
          padding: stacked ? "6px 9px" : "4px 8px",
          borderRadius: 12,
          background: stacked
            ? isTurn
              ? "rgba(255, 255, 255, 0.085)"
              : "rgba(255, 255, 255, 0.035)"
            : isTurn
              ? "rgba(255, 255, 255, 0.06)"
              : "transparent",
          border: stacked
            ? isTurn
              ? "1px solid rgba(244, 180, 110, 0.35)"
              : "1px solid rgba(255, 255, 255, 0.07)"
            : "1px solid transparent",
          opacity: isActive && !isAnimating && !isTurn ? 0.68 : 1,
          transition: "opacity 0.2s, background 0.2s, border-color 0.2s",
        }}
      >
        <div
          style={{
            borderRadius: "50%",
            boxShadow: isTurn ? "0 0 0 2px var(--accent)" : "none",
            flexShrink: 0,
          }}
        >
          <AvatarDot id={player.id} size={stacked ? 28 : 26} />
        </div>
        <div
          style={{
            minWidth: 0,
            flex: 1,
            textAlign: alignRight ? "right" : "left",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: alignRight ? "flex-end" : "flex-start",
              flexDirection: alignRight ? "row-reverse" : "row",
              gap: 5,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "#F4EFE7",
                lineHeight: 1.15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {player.id === currentUser && !isPassAndPlay
                ? "You"
                : player.name}
            </span>
            {group !== null && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(244,239,231,0.5)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {groupLabel}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: alignRight ? "flex-end" : "flex-start",
              gap: 3,
              marginTop: 4,
              minHeight: stacked ? 11 : 10,
            }}
          >
            {group === null ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "rgba(244,239,231,0.42)",
                  lineHeight: 1,
                }}
              >
                Open table
              </span>
            ) : clearedGroup ? (
              <TinyBallDot
                id={8}
                size={stacked ? 11 : 10}
                pocketed={Boolean(hudBalls.find((b) => b.id === 8)?.pocketed)}
              />
            ) : (
              groupIds.map((id) => (
                <TinyBallDot
                  key={id}
                  id={id}
                  size={stacked ? 10.5 : 9.5}
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

  const renderUtilityButtons = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 6,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={toggleMuted}
        aria-label={muted ? "Unmute table audio" : "Mute table audio"}
        title={muted ? "Unmute table audio" : "Mute table audio"}
        style={hudIconBtnStyle({ dimmed: muted })}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      {state.lastShot && !isAnimating && (
        <button
          type="button"
          onClick={() => {
            if (!mutedRef.current) primePoolAudio();
            if (state.lastShot) {
              startShotAnimation(
                state.lastShot.preBalls,
                state.lastShot.move
              );
            }
          }}
          aria-label="Replay last shot"
          title="Replay last shot"
          style={hudIconBtnStyle()}
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
          style={hudIconBtnStyle({ activeDanger: confirmForfeit })}
        >
          <Flag size={14} />
        </button>
      )}
    </div>
  );

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to Games"
      title="Back to Games"
      style={hudIconBtnStyle()}
    >
      <ChevronLeft size={19} />
    </button>
  );

  const statusPill = (
    <span
      style={{
        fontSize: isStackedHud ? 12 : 11.5,
        fontWeight: 800,
        padding: isStackedHud ? "5px 12px" : "4px 11px",
        borderRadius: 999,
        background: centerPillBg,
        color: centerPillColor,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
        justifySelf: "center",
        flexShrink: isStackedHud ? 1 : 0,
        letterSpacing: "0.01em",
      }}
    >
      {centerPillText}
    </span>
  );

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
      {/* Roomier Top HUD Header (2-row on phones, 1-row on landscape/desktop) */}
      <div
        style={{
          padding: isStackedHud
            ? "calc(10px + env(safe-area-inset-top)) 12px 10px"
            : "calc(8px + env(safe-area-inset-top)) 14px 8px",
          background: "rgba(22, 18, 15, 0.96)",
          borderBottom: "1px solid rgba(255, 232, 200, 0.12)",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: isStackedHud ? "column" : "row",
          alignItems: isStackedHud ? "stretch" : "center",
          gap: isStackedHud ? 8 : 10,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {isStackedHud ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {backButton}
              </div>
              {statusPill}
              {renderUtilityButtons()}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 8,
                minWidth: 0,
              }}
            >
              {renderPlayerHud(p1, false, true)}
              {renderPlayerHud(p2, true, true)}
            </div>
          </>
        ) : (
          <>
            {backButton}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                maxWidth: 720,
                margin: "0 auto",
              }}
            >
              {renderPlayerHud(p1, false, false)}
              {statusPill}
              {renderPlayerHud(p2, true, false)}
            </div>
            {renderUtilityButtons()}
          </>
        )}
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
          background:
            "radial-gradient(ellipse at center, #221B16 0%, #14100D 68%, #0C0A08 100%)",
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
                ? hoverZone === "stick"
                  ? "grab"
                  : hoverZone === "cue"
                    ? "move"
                    : "crosshair"
                : "default",
          }}
        />

        {/* Live Cue-Stick Pullback Power Pill */}
        {isPullingStick && (
          <div
            style={{
              position: "absolute",
              top: 8,
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
              bottom: "calc(8px + env(safe-area-inset-bottom))",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(18, 15, 12, 0.88)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 232, 200, 0.2)",
              color: "#F4EFE7",
              borderRadius: 999,
              padding: "6px 14px",
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
              bottom: "calc(8px + env(safe-area-inset-bottom))",
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
                        if (!mutedRef.current) primePoolAudio();
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
