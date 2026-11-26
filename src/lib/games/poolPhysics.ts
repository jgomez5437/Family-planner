export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 500;
export const BALL_RADIUS = 14;
export const HEAD_STRING_X = 250;
export const FOOT_SPOT = { x: 750, y: 250 } as const;
export const HEAD_SPOT = { x: 225, y: 250 } as const;

/** Unit quaternion [w, x, y, z] storing a ball's 3D orientation in table space. */
export type Quat = [number, number, number, number];

export const IDENTITY_QUAT: Quat = [1, 0, 0, 0];

export function normalizeQuat(q: Quat): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len < 1e-8) return [1, 0, 0, 0];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function roundQuat(q: Quat): Quat {
  const n = normalizeQuat(q);
  return [
    Math.round(n[0] * 10000) / 10000,
    Math.round(n[1] * 10000) / 10000,
    Math.round(n[2] * 10000) / 10000,
    Math.round(n[3] * 10000) / 10000,
  ];
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function quatFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number
): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [Math.cos(half), ax * s, ay * s, az * s];
}

export function nlerpQuat(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = dot < 0 ? -1 : 1;
  if (dot < 0) dot = -dot;
  return normalizeQuat([
    a[0] + (sign * b[0] - a[0]) * t,
    a[1] + (sign * b[1] - a[1]) * t,
    a[2] + (sign * b[2] - a[2]) * t,
    a[3] + (sign * b[3] - a[3]) * t,
  ]);
}

/** Rotates local vector (vx, vy, vz) by unit quaternion q. */
export function rotateVecByQuat(
  q: Quat,
  vx: number,
  vy: number,
  vz: number
): [number, number, number] {
  const [w, qx, qy, qz] = q;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + w * tx + (qy * tz - qz * ty),
    vy + w * ty + (qz * tx - qx * tz),
    vz + w * tz + (qx * ty - qy * tx),
  ];
}

export function getBallQuat(ball: { id: number; q?: Quat }): Quat {
  if (
    ball.q &&
    Array.isArray(ball.q) &&
    ball.q.length === 4 &&
    ball.q.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return normalizeQuat(ball.q);
  }
  return defaultQuatForBall(ball.id);
}

/** Deterministic slight tilt per ball so racked numbers & stripes look natural. */
function defaultQuatForBall(id: number): Quat {
  if (id === 0) {
    // Tilt cue ball slightly so a red measles dot is clearly visible right away
    return roundQuat(
      multiplyQuat(
        quatFromAxisAngle(0, 1, 0, 0.42),
        quatFromAxisAngle(1, 0, 0, -0.35)
      )
    );
  }
  // Slight varied orientation while keeping numbers readable on top
  const yaw = ((id * 1.13) % (Math.PI * 2)) - Math.PI;
  const tilt = 0.24 + (id % 4) * 0.08;
  return roundQuat(
    multiplyQuat(
      quatFromAxisAngle(0, 0, 1, yaw),
      quatFromAxisAngle(1, 0, 0, tilt)
    )
  );
}

export interface PocketDef {
  id: string;
  x: number;
  y: number;
  captureRadius: number;
  visualRadius: number;
}

export const POCKETS: readonly PocketDef[] = [
  { id: "tl", x: 4, y: 4, captureRadius: 29, visualRadius: 26 },
  { id: "tm", x: 500, y: -5, captureRadius: 27, visualRadius: 24 },
  { id: "tr", x: 996, y: 4, captureRadius: 29, visualRadius: 26 },
  { id: "bl", x: 4, y: 496, captureRadius: 29, visualRadius: 26 },
  { id: "bm", x: 500, y: 505, captureRadius: 27, visualRadius: 24 },
  { id: "br", x: 996, y: 496, captureRadius: 29, visualRadius: 26 },
];

export const CORNER_MOUTH = 42;
export const SIDE_MOUTH_HALF = 26;

interface JawKnuckle {
  x: number;
  y: number;
  r: number;
}

const JAW_KNUCKLES: readonly JawKnuckle[] = [
  // Top rail mouth edges
  { x: CORNER_MOUTH + 2, y: 0, r: 4 },
  { x: 500 - SIDE_MOUTH_HALF - 2, y: 0, r: 4 },
  { x: 500 + SIDE_MOUTH_HALF + 2, y: 0, r: 4 },
  { x: TABLE_WIDTH - CORNER_MOUTH - 2, y: 0, r: 4 },
  // Bottom rail mouth edges
  { x: CORNER_MOUTH + 2, y: TABLE_HEIGHT, r: 4 },
  { x: 500 - SIDE_MOUTH_HALF - 2, y: TABLE_HEIGHT, r: 4 },
  { x: 500 + SIDE_MOUTH_HALF + 2, y: TABLE_HEIGHT, r: 4 },
  { x: TABLE_WIDTH - CORNER_MOUTH - 2, y: TABLE_HEIGHT, r: 4 },
  // Left & right rail mouth edges
  { x: 0, y: CORNER_MOUTH + 2, r: 4 },
  { x: 0, y: TABLE_HEIGHT - CORNER_MOUTH - 2, r: 4 },
  { x: TABLE_WIDTH, y: CORNER_MOUTH + 2, r: 4 },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT - CORNER_MOUTH - 2, r: 4 },
];

export interface PoolBall {
  id: number; // 0 = cue, 1..7 = solids, 8 = 8-ball, 9..15 = stripes
  x: number;
  y: number;
  pocketed: boolean;
  q?: Quat;
}

export interface PoolFrameBall {
  id: number;
  x: number;
  y: number;
  pocketed: boolean;
  q: Quat;
  /** 0..1 while smoothly dropping into a pocket well; undefined when on cloth. */
  dropProgress?: number;
}

export type PoolSoundKind = "cue" | "ball" | "rail" | "pocket";

export interface PoolSoundEvent {
  frame: number;
  kind: PoolSoundKind;
  /** 0.05..1 normalized loudness/impact intensity */
  intensity: number;
}

export interface PoolSimulationResult {
  finalBalls: PoolBall[];
  frames: PoolFrameBall[][];
  soundEvents: PoolSoundEvent[];
  firstContactBallId: number | null;
  pocketedBallIds: number[];
}

export interface AimPreview {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetBallId: number | null;
  targetDirX: number | null;
  targetDirY: number | null;
  cueDeflectX: number | null;
  cueDeflectY: number | null;
}

export interface PoolBallVisual {
  color: string;
  stripe: boolean;
}

export const POOL_BALL_VISUALS: Record<number, PoolBallVisual> = {
  0: { color: "#FAF7F0", stripe: false },
  1: { color: "#F2C224", stripe: false },
  2: { color: "#2563EB", stripe: false },
  3: { color: "#DC2626", stripe: false },
  4: { color: "#7C3AED", stripe: false },
  5: { color: "#F97316", stripe: false },
  6: { color: "#15803D", stripe: false },
  7: { color: "#881337", stripe: false },
  8: { color: "#18181B", stripe: false },
  9: { color: "#F2C224", stripe: true },
  10: { color: "#2563EB", stripe: true },
  11: { color: "#DC2626", stripe: true },
  12: { color: "#7C3AED", stripe: true },
  13: { color: "#F97316", stripe: true },
  14: { color: "#15803D", stripe: true },
  15: { color: "#881337", stripe: true },
};

const RACK_ROWS: readonly number[][] = [
  [1],
  [9, 2],
  [3, 8, 10],
  [11, 4, 12, 5],
  [6, 13, 7, 14, 15],
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function createInitialPoolBalls(): PoolBall[] {
  const balls: PoolBall[] = [
    {
      id: 0,
      x: HEAD_SPOT.x,
      y: HEAD_SPOT.y,
      pocketed: false,
      q: defaultQuatForBall(0),
    },
  ];

  const colSpacing = BALL_RADIUS * Math.sqrt(3) + 0.5;
  const rowSpacing = BALL_RADIUS * 2 + 0.5;

  for (let row = 0; row < RACK_ROWS.length; row++) {
    const ids = RACK_ROWS[row];
    const x = FOOT_SPOT.x + row * colSpacing;
    const startY = FOOT_SPOT.y - ((ids.length - 1) * rowSpacing) / 2;
    for (let col = 0; col < ids.length; col++) {
      const id = ids[col];
      balls.push({
        id,
        x: round2(x),
        y: round2(startY + col * rowSpacing),
        pocketed: false,
        q: defaultQuatForBall(id),
      });
    }
  }

  return balls;
}

export function isCueBallPlacementValid(
  x: number,
  y: number,
  balls: PoolBall[],
  kitchenOnly: boolean
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const margin = BALL_RADIUS + 4;
  const maxX = kitchenOnly ? HEAD_STRING_X : TABLE_WIDTH - margin;
  if (x < margin || x > maxX || y < margin || y > TABLE_HEIGHT - margin) {
    return false;
  }

  for (const p of POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy < (p.captureRadius + BALL_RADIUS * 0.6) ** 2) {
      return false;
    }
  }

  const minDistSq = (BALL_RADIUS * 2 + 2) ** 2;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < minDistSq) return false;
  }

  return true;
}

export function findFreeSpot(
  preferredX: number,
  preferredY: number,
  balls: PoolBall[],
  ignoreBallId: number,
  kitchenOnly = false
): { x: number; y: number } {
  const minDistSq = (BALL_RADIUS * 2 + 2) ** 2;
  const margin = BALL_RADIUS + 6;
  const maxX = kitchenOnly ? HEAD_STRING_X : TABLE_WIDTH - margin;

  const isFree = (cx: number, cy: number) => {
    if (cx < margin || cx > maxX || cy < margin || cy > TABLE_HEIGHT - margin) {
      return false;
    }
    for (const p of POCKETS) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      if (dx * dx + dy * dy < (p.captureRadius + BALL_RADIUS) ** 2) {
        return false;
      }
    }
    for (const b of balls) {
      if (b.id === ignoreBallId || b.pocketed) continue;
      const dx = cx - b.x;
      const dy = cy - b.y;
      if (dx * dx + dy * dy < minDistSq) return false;
    }
    return true;
  };

  if (isFree(preferredX, preferredY)) {
    return { x: round2(preferredX), y: round2(preferredY) };
  }

  for (let r = 8; r <= 300; r += 8) {
    const candidates: [number, number][] = [
      [preferredX + r, preferredY],
      [preferredX - r, preferredY],
      [preferredX, preferredY + r],
      [preferredX, preferredY - r],
      [preferredX - r * 0.7, preferredY + r * 0.7],
      [preferredX - r * 0.7, preferredY - r * 0.7],
      [preferredX + r * 0.7, preferredY + r * 0.7],
      [preferredX + r * 0.7, preferredY - r * 0.7],
    ];
    for (const [cx, cy] of candidates) {
      if (isFree(cx, cy)) return { x: round2(cx), y: round2(cy) };
    }
  }

  return { x: round2(preferredX), y: round2(preferredY) };
}

export function computeAimPreview(
  cueBall: PoolBall,
  angle: number,
  balls: PoolBall[]
): AimPreview {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const startX = cueBall.x;
  const startY = cueBall.y;

  let minT = 2000;
  if (dx > 1e-6) {
    minT = Math.min(minT, (TABLE_WIDTH - BALL_RADIUS - startX) / dx);
  } else if (dx < -1e-6) {
    minT = Math.min(minT, (BALL_RADIUS - startX) / dx);
  }
  if (dy > 1e-6) {
    minT = Math.min(minT, (TABLE_HEIGHT - BALL_RADIUS - startY) / dy);
  } else if (dy < -1e-6) {
    minT = Math.min(minT, (BALL_RADIUS - startY) / dy);
  }

  const hitRadius = BALL_RADIUS * 2;
  const hitRadiusSq = hitRadius * hitRadius;
  let targetBall: PoolBall | null = null;

  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const ocX = b.x - startX;
    const ocY = b.y - startY;
    const proj = ocX * dx + ocY * dy;
    if (proj <= 0) continue;
    const perpSq = ocX * ocX + ocY * ocY - proj * proj;
    if (perpSq >= hitRadiusSq) continue;
    const thc = Math.sqrt(hitRadiusSq - perpSq);
    const t = proj - thc;
    if (t > 0.5 && t < minT) {
      minT = t;
      targetBall = b;
    }
  }

  const endX = startX + dx * minT;
  const endY = startY + dy * minT;

  if (!targetBall) {
    return {
      startX,
      startY,
      endX,
      endY,
      targetBallId: null,
      targetDirX: null,
      targetDirY: null,
      cueDeflectX: null,
      cueDeflectY: null,
    };
  }

  const nx = targetBall.x - endX;
  const ny = targetBall.y - endY;
  const nLen = Math.hypot(nx, ny) || 1;
  const targetDirX = nx / nLen;
  const targetDirY = ny / nLen;

  const dot = dx * targetDirX + dy * targetDirY;
  const tx = dx - dot * targetDirX;
  const ty = dy - dot * targetDirY;
  const tLen = Math.hypot(tx, ty);

  return {
    startX,
    startY,
    endX,
    endY,
    targetBallId: targetBall.id,
    targetDirX,
    targetDirY,
    cueDeflectX: tLen > 0.05 ? tx / tLen : null,
    cueDeflectY: tLen > 0.05 ? ty / tLen : null,
  };
}

/* ---- Rigid-Sphere Tournament Cloth Physics Constants ---- */
// Canonical scale: 10 units ≈ 1 inch on a 9-ft table (1000 × 500)
const DT = 1 / 240;
const MAX_STEPS = 3840; // 16 seconds max simulated time
const FRAME_STRIDE = 4; // 60 fps recorded frames
const MIN_SHOT_SPEED = 56;
const SHOT_SPEED_SPAN = 1520;
const POWER_EXPONENT = 1.48;
const BALL_RESTITUTION = 0.96;
const RAIL_RESTITUTION = 0.80;
const RAIL_TANGENT_DAMP = 0.92;
const SLIDE_ACCEL = 760; // μ_slide ≈ 0.20 (natural stun & 5/7 v0 roll transition)
const ROLL_ACCEL = 64; // μ_roll ≈ 0.016 (tournament Simonis cloth glide)
const SLIP_EPS = 4.0;
const STOP_SPEED = 1.8;
const DROP_SUBSTEPS = 48; // 12 recorded frames (~200ms) smooth pocket-drop animation

interface SimBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Top-surface rotational velocity (rx = ωy * R, ry = -ωx * R) for true 3D roll. */
  rx: number;
  ry: number;
  q: Quat;
  pocketed: boolean;
  /** Animation-only drop state after pocket capture. */
  dropStep: number;
  dropStartX: number;
  dropStartY: number;
  pocketX: number;
  pocketY: number;
  dropQ: Quat;
}

function isInTopOrBottomPocketMouth(x: number): boolean {
  return (
    x < CORNER_MOUTH ||
    x > TABLE_WIDTH - CORNER_MOUTH ||
    Math.abs(x - 500) < SIDE_MOUTH_HALF
  );
}

function isInLeftOrRightPocketMouth(y: number): boolean {
  return y < CORNER_MOUTH || y > TABLE_HEIGHT - CORNER_MOUTH;
}

/** Calibrated initial cue-ball speed (units/sec) from normalized pullback power [0.04..1]. */
export function shotSpeedFromPower(power: number): number {
  const clamped = Math.max(0.04, Math.min(1, power));
  return MIN_SHOT_SPEED + SHOT_SPEED_SPAN * Math.pow(clamped, POWER_EXPONENT);
}

function integrateQuat(q: Quat, rx: number, ry: number, dt: number): Quat {
  const rotSpeed = Math.hypot(rx, ry);
  if (rotSpeed < 1e-4) return q;
  const dAngle = (rotSpeed * dt) / BALL_RADIUS;
  // ω = (-ry / R, rx / R, 0) -> unit axis = (-ry / rotSpeed, rx / rotSpeed, 0)
  const ax = -ry / rotSpeed;
  const ay = rx / rotSpeed;
  const dq = quatFromAxisAngle(ax, ay, 0, dAngle);
  return normalizeQuat(multiplyQuat(dq, q));
}

function integrateBallQuat(b: SimBall, dt: number) {
  b.q = integrateQuat(b.q, b.rx, b.ry, dt);
}

export function simulatePoolShot(
  initialBalls: PoolBall[],
  angle: number,
  power: number,
  options?: { recordFrames?: boolean }
): PoolSimulationResult {
  const recordFrames = Boolean(options?.recordFrames);
  const clampedPower = Math.max(0.04, Math.min(1, power));
  const speed = shotSpeedFromPower(clampedPower);

  const sim: SimBall[] = initialBalls.map((b) => {
    const startQ = getBallQuat(b);
    return {
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.id === 0 && !b.pocketed ? Math.cos(angle) * speed : 0,
      vy: b.id === 0 && !b.pocketed ? Math.sin(angle) * speed : 0,
      // Center-ball strike starts with zero top/back spin (pure slide -> transitions to 5/7 v0 roll)
      rx: 0,
      ry: 0,
      q: startQ,
      pocketed: b.pocketed,
      dropStep: b.pocketed ? DROP_SUBSTEPS : 0,
      dropStartX: b.x,
      dropStartY: b.y,
      pocketX: b.x,
      pocketY: b.y,
      dropQ: startQ,
    };
  });

  const frames: PoolFrameBall[][] = [];
  const soundEvents: PoolSoundEvent[] = [];
  let frameIndex = 0;

  if (recordFrames) {
    soundEvents.push({
      frame: 0,
      kind: "cue",
      intensity: Math.max(0.12, Math.min(1, clampedPower)),
    });
  }

  const pushSound = (kind: PoolSoundKind, intensity: number) => {
    if (!recordFrames) return;
    const clampedInt = Math.max(0.05, Math.min(1, intensity));
    // Coalesce simultaneous micro-impacts of the same kind within a single frame
    const existing = soundEvents.find(
      (e) => e.frame === frameIndex && e.kind === kind
    );
    if (existing) {
      if (clampedInt > existing.intensity) existing.intensity = clampedInt;
    } else {
      soundEvents.push({ frame: frameIndex, kind, intensity: clampedInt });
    }
  };

  const snapshot = (): PoolFrameBall[] =>
    sim.map((b) => {
      if (b.pocketed && b.dropStep < DROP_SUBSTEPS) {
        const prog = b.dropStep / DROP_SUBSTEPS;
        const ease = 1 - (1 - prog) * (1 - prog);
        return {
          id: b.id,
          x: round2(b.dropStartX + (b.pocketX - b.dropStartX) * ease),
          y: round2(b.dropStartY + (b.pocketY - b.dropStartY) * ease),
          pocketed: false,
          q: roundQuat(b.dropQ),
          dropProgress: Math.round(prog * 1000) / 1000,
        };
      }
      return {
        id: b.id,
        x: round2(b.x),
        y: round2(b.y),
        pocketed: b.pocketed,
        q: roundQuat(b.q),
      };
    });

  if (recordFrames) {
    frames.push(snapshot());
  }

  let firstContactBallId: number | null = null;
  const pocketedBallIds: number[] = [];
  const diameter = BALL_RADIUS * 2;
  const diameterSq = diameter * diameter;

  for (let step = 1; step <= MAX_STEPS; step++) {
    frameIndex = Math.ceil(step / FRAME_STRIDE);
    let anyActive = false;

    // 1. Advance positions, pocket capture, cushion & jaw collisions
    for (let i = 0; i < sim.length; i++) {
      const b = sim[i];
      if (b.pocketed) {
        if (recordFrames && b.dropStep < DROP_SUBSTEPS) {
          b.dropStep += 1;
          b.dropQ = integrateQuat(b.dropQ, b.rx, b.ry, DT);
          anyActive = true;
        }
        continue;
      }

      b.x += b.vx * DT;
      b.y += b.vy * DT;

      // Pocket capture check
      let captured = false;
      for (let pIdx = 0; pIdx < POCKETS.length; pIdx++) {
        const p = POCKETS[pIdx];
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy <= p.captureRadius * p.captureRadius) {
          const entrySpeed = Math.hypot(b.vx, b.vy);
          b.pocketed = true;
          b.dropStep = 0;
          b.dropStartX = b.x;
          b.dropStartY = b.y;
          b.pocketX = p.x;
          b.pocketY = p.y;
          b.dropQ = b.q;
          b.x = p.x;
          b.y = p.y;
          b.vx = 0;
          b.vy = 0;
          // Keep gentle visual spin while falling into pocket
          b.rx *= 0.65;
          b.ry *= 0.65;
          pocketedBallIds.push(b.id);
          pushSound("pocket", Math.max(0.25, Math.min(1, entrySpeed / 700)));
          if (recordFrames) anyActive = true;
          captured = true;
          break;
        }
      }
      if (captured) continue;

      // Safety net if a high-speed ball passes deep into a pocket throat
      if (
        b.x < -12 ||
        b.x > TABLE_WIDTH + 12 ||
        b.y < -12 ||
        b.y > TABLE_HEIGHT + 12
      ) {
        let nearest = POCKETS[0];
        let bestD = Infinity;
        for (const p of POCKETS) {
          const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
          if (d < bestD) {
            bestD = d;
            nearest = p;
          }
        }
        const entrySpeed = Math.hypot(b.vx, b.vy);
        b.pocketed = true;
        b.dropStep = 0;
        b.dropStartX = b.x;
        b.dropStartY = b.y;
        b.pocketX = nearest.x;
        b.pocketY = nearest.y;
        b.dropQ = b.q;
        b.x = nearest.x;
        b.y = nearest.y;
        b.vx = 0;
        b.vy = 0;
        b.rx *= 0.65;
        b.ry *= 0.65;
        pocketedBallIds.push(b.id);
        pushSound("pocket", Math.max(0.3, Math.min(1, entrySpeed / 700)));
        if (recordFrames) anyActive = true;
        continue;
      }

      // Cushion collisions (skipping pocket mouth openings)
      if (!isInLeftOrRightPocketMouth(b.y)) {
        if (b.x < BALL_RADIUS) {
          b.x = BALL_RADIUS;
          if (b.vx < 0) {
            const impact = -b.vx;
            const e = Math.max(0.72, RAIL_RESTITUTION - impact * 0.00004);
            b.vx = impact * e;
            b.vy *= RAIL_TANGENT_DAMP;
            b.rx = -b.rx * 0.45;
            if (impact > 25) pushSound("rail", impact / 950);
          }
        } else if (b.x > TABLE_WIDTH - BALL_RADIUS) {
          b.x = TABLE_WIDTH - BALL_RADIUS;
          if (b.vx > 0) {
            const impact = b.vx;
            const e = Math.max(0.72, RAIL_RESTITUTION - impact * 0.00004);
            b.vx = -impact * e;
            b.vy *= RAIL_TANGENT_DAMP;
            b.rx = -b.rx * 0.45;
            if (impact > 25) pushSound("rail", impact / 950);
          }
        }
      }

      if (!isInTopOrBottomPocketMouth(b.x)) {
        if (b.y < BALL_RADIUS) {
          b.y = BALL_RADIUS;
          if (b.vy < 0) {
            const impact = -b.vy;
            const e = Math.max(0.72, RAIL_RESTITUTION - impact * 0.00004);
            b.vy = impact * e;
            b.vx *= RAIL_TANGENT_DAMP;
            b.ry = -b.ry * 0.45;
            if (impact > 25) pushSound("rail", impact / 950);
          }
        } else if (b.y > TABLE_HEIGHT - BALL_RADIUS) {
          b.y = TABLE_HEIGHT - BALL_RADIUS;
          if (b.vy > 0) {
            const impact = b.vy;
            const e = Math.max(0.72, RAIL_RESTITUTION - impact * 0.00004);
            b.vy = -impact * e;
            b.vx *= RAIL_TANGENT_DAMP;
            b.ry = -b.ry * 0.45;
            if (impact > 25) pushSound("rail", impact / 950);
          }
        }
      }

      // Pocket jaw knuckle collisions
      for (let kIdx = 0; kIdx < JAW_KNUCKLES.length; kIdx++) {
        const k = JAW_KNUCKLES[kIdx];
        const dx = b.x - k.x;
        const dy = b.y - k.y;
        const minR = BALL_RADIUS + k.r;
        const distSq = dx * dx + dy * dy;
        if (distSq < minR * minR && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          b.x = k.x + nx * minR;
          b.y = k.y + ny * minR;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            const impact = -vn;
            b.vx -= (1 + RAIL_RESTITUTION) * vn * nx;
            b.vy -= (1 + RAIL_RESTITUTION) * vn * ny;
            if (impact > 25) pushSound("rail", impact / 950);
          }
        }
      }
    }

    // 2. Pairwise elastic ball-ball collisions (2 solver passes for crisp rack break)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < sim.length; i++) {
        const a = sim[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < sim.length; j++) {
          const b = sim[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= diameterSq || distSq < 1e-10) continue;

          if (firstContactBallId === null) {
            if (a.id === 0) firstContactBallId = b.id;
            else if (b.id === 0) firstContactBallId = a.id;
          }

          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (diameter - dist) * 0.505;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            const impact = -velAlongNormal;
            const impulse = ((1 + BALL_RESTITUTION) * impact) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            // Notice: linear velocity transfers while angular rolling spin (rx, ry)
            // is preserved on each sphere -> produces true stun on fast skids & natural follow on rolls!
            if (pass === 0 && impact > 14) {
              pushSound("ball", impact / 900);
            }
          }
        }
      }
    }

    // 3. Sliding-to-Rolling cloth friction + 3D quaternion integration
    for (let i = 0; i < sim.length; i++) {
      const b = sim[i];
      if (b.pocketed) continue;

      const slipX = b.vx - b.rx;
      const slipY = b.vy - b.ry;
      const slipSpeed = Math.hypot(slipX, slipY);

      if (slipSpeed > SLIP_EPS) {
        // Sliding phase: friction opposes contact-patch slip, slowing v and spinning up r (ratio 1 : 2.5)
        const maxDeltaSlip = 3.5 * SLIDE_ACCEL * DT;
        if (slipSpeed <= maxDeltaSlip) {
          // Lock cleanly into pure roll at (5/7 v + 2/7 r)
          const rollX = (5 * b.vx + 2 * b.rx) / 7;
          const rollY = (5 * b.vy + 2 * b.ry) / 7;
          b.vx = rollX;
          b.vy = rollY;
          b.rx = rollX;
          b.ry = rollY;
        } else {
          const sx = slipX / slipSpeed;
          const sy = slipY / slipSpeed;
          const dv = SLIDE_ACCEL * DT;
          b.vx -= dv * sx;
          b.vy -= dv * sy;
          b.rx += 2.5 * dv * sx;
          b.ry += 2.5 * dv * sy;
        }
      } else {
        // Pure rolling phase: gentle tournament cloth rolling resistance
        b.rx = b.vx;
        b.ry = b.vy;
        const spd = Math.hypot(b.vx, b.vy);
        if (spd <= STOP_SPEED) {
          b.vx = 0;
          b.vy = 0;
          b.rx = 0;
          b.ry = 0;
        } else {
          const nextSpd = Math.max(0, spd - ROLL_ACCEL * DT);
          const ratio = nextSpd / spd;
          b.vx *= ratio;
          b.vy *= ratio;
          b.rx = b.vx;
          b.ry = b.vy;
        }
      }

      // Integrate 3D ball orientation from rotational velocity
      integrateBallQuat(b, DT);

      if (
        Math.hypot(b.vx, b.vy) > STOP_SPEED ||
        Math.hypot(b.rx, b.ry) > STOP_SPEED
      ) {
        anyActive = true;
      } else {
        b.vx = 0;
        b.vy = 0;
        b.rx = 0;
        b.ry = 0;
      }
    }

    if (recordFrames && (step % FRAME_STRIDE === 0 || !anyActive)) {
      frames.push(snapshot());
    }

    if (!anyActive) break;
  }

  const finalBalls: PoolBall[] = sim.map((b) => ({
    id: b.id,
    x: round2(b.x),
    y: round2(b.y),
    pocketed: b.pocketed,
    q: roundQuat(b.q),
  }));

  return {
    finalBalls,
    frames,
    soundEvents,
    firstContactBallId,
    pocketedBallIds,
  };
}
