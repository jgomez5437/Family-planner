export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 500;
export const BALL_RADIUS = 14;
export const HEAD_STRING_X = 250;
export const FOOT_SPOT = { x: 750, y: 250 } as const;
export const HEAD_SPOT = { x: 225, y: 250 } as const;

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

// Pocket mouth spans along the rails so balls roll cleanly into pockets
const CORNER_MOUTH = 42;
const SIDE_MOUTH_HALF = 26;

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
}

export interface PoolFrameBall {
  id: number;
  x: number;
  y: number;
  pocketed: boolean;
}

export interface PoolSimulationResult {
  finalBalls: PoolBall[];
  frames: PoolFrameBall[][];
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
    { id: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y, pocketed: false },
  ];

  const colSpacing = BALL_RADIUS * Math.sqrt(3) + 0.5;
  const rowSpacing = BALL_RADIUS * 2 + 0.5;

  for (let row = 0; row < RACK_ROWS.length; row++) {
    const ids = RACK_ROWS[row];
    const x = FOOT_SPOT.x + row * colSpacing;
    const startY = FOOT_SPOT.y - ((ids.length - 1) * rowSpacing) / 2;
    for (let col = 0; col < ids.length; col++) {
      balls.push({
        id: ids[col],
        x: round2(x),
        y: round2(startY + col * rowSpacing),
        pocketed: false,
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

  // Search outward along the table centerline and then radial offsets
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

  // 1. Distance to cushions (inner playable bounds)
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

  // 2. Ray-circle intersection against active object balls (radius = 2 * BALL_RADIUS)
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

  // Object ball travels along the center-to-center line at impact
  const nx = targetBall.x - endX;
  const ny = targetBall.y - endY;
  const nLen = Math.hypot(nx, ny) || 1;
  const targetDirX = nx / nLen;
  const targetDirY = ny / nLen;

  // Cue ball deflects along the tangent perpendicular to the collision normal
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

const DT = 1 / 240;
const MAX_STEPS = 2880; // 12 seconds max simulated time
const FRAME_STRIDE = 4; // 60 fps recorded frames
const MAX_SHOT_SPEED = 1420;
const BALL_RESTITUTION = 0.96;
const RAIL_RESTITUTION = 0.78;
const LINEAR_DRAG = 135;
const QUAD_DRAG = 0.42;
const STOP_SPEED = 6;

interface SimBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
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

export function simulatePoolShot(
  initialBalls: PoolBall[],
  angle: number,
  power: number,
  options?: { recordFrames?: boolean }
): PoolSimulationResult {
  const recordFrames = Boolean(options?.recordFrames);
  const clampedPower = Math.max(0.04, Math.min(1, power));
  const speed =
    MAX_SHOT_SPEED *
    (0.1 + 0.9 * (0.42 * clampedPower + 0.58 * clampedPower * clampedPower));

  const sim: SimBall[] = initialBalls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.id === 0 && !b.pocketed ? Math.cos(angle) * speed : 0,
    vy: b.id === 0 && !b.pocketed ? Math.sin(angle) * speed : 0,
    pocketed: b.pocketed,
  }));

  const frames: PoolFrameBall[][] = [];
  const snapshot = () =>
    sim.map((b) => ({
      id: b.id,
      x: round2(b.x),
      y: round2(b.y),
      pocketed: b.pocketed,
    }));

  if (recordFrames) {
    frames.push(snapshot());
  }

  let firstContactBallId: number | null = null;
  const pocketedBallIds: number[] = [];
  const diameter = BALL_RADIUS * 2;
  const diameterSq = diameter * diameter;

  for (let step = 1; step <= MAX_STEPS; step++) {
    // 1. Advance positions & check pockets
    let anyMoving = false;
    for (let i = 0; i < sim.length; i++) {
      const b = sim[i];
      if (b.pocketed) continue;

      b.x += b.vx * DT;
      b.y += b.vy * DT;

      // Pocket capture check
      let captured = false;
      for (let pIdx = 0; pIdx < POCKETS.length; pIdx++) {
        const p = POCKETS[pIdx];
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy <= p.captureRadius * p.captureRadius) {
          b.pocketed = true;
          b.x = p.x;
          b.y = p.y;
          b.vx = 0;
          b.vy = 0;
          pocketedBallIds.push(b.id);
          captured = true;
          break;
        }
      }
      if (captured) continue;

      // Safety net if a high-speed ball passes deep through a pocket mouth
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
        b.pocketed = true;
        b.x = nearest.x;
        b.y = nearest.y;
        b.vx = 0;
        b.vy = 0;
        pocketedBallIds.push(b.id);
        continue;
      }

      // Cushion collisions (skipping pocket mouth openings)
      if (!isInLeftOrRightPocketMouth(b.y)) {
        if (b.x < BALL_RADIUS) {
          b.x = BALL_RADIUS;
          if (b.vx < 0) b.vx = -b.vx * RAIL_RESTITUTION;
        } else if (b.x > TABLE_WIDTH - BALL_RADIUS) {
          b.x = TABLE_WIDTH - BALL_RADIUS;
          if (b.vx > 0) b.vx = -b.vx * RAIL_RESTITUTION;
        }
      }

      if (!isInTopOrBottomPocketMouth(b.x)) {
        if (b.y < BALL_RADIUS) {
          b.y = BALL_RADIUS;
          if (b.vy < 0) b.vy = -b.vy * RAIL_RESTITUTION;
        } else if (b.y > TABLE_HEIGHT - BALL_RADIUS) {
          b.y = TABLE_HEIGHT - BALL_RADIUS;
          if (b.vy > 0) b.vy = -b.vy * RAIL_RESTITUTION;
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
            b.vx -= (1 + RAIL_RESTITUTION) * vn * nx;
            b.vy -= (1 + RAIL_RESTITUTION) * vn * ny;
          }
        }
      }
    }

    // 2. Pairwise elastic ball-ball collisions (2 solver passes for tight rack break)
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
            const impulse = (-(1 + BALL_RESTITUTION) * velAlongNormal) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    // 3. Apply cloth rolling friction
    const quadFactor = Math.exp(-QUAD_DRAG * DT);
    for (let i = 0; i < sim.length; i++) {
      const b = sim[i];
      if (b.pocketed) continue;
      const spd = Math.hypot(b.vx, b.vy);
      if (spd <= STOP_SPEED) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const nextSpd = Math.max(0, spd - LINEAR_DRAG * DT) * quadFactor;
        const ratio = nextSpd / spd;
        b.vx *= ratio;
        b.vy *= ratio;
        if (nextSpd > STOP_SPEED) {
          anyMoving = true;
        } else {
          b.vx = 0;
          b.vy = 0;
        }
      }
    }

    if (recordFrames && (step % FRAME_STRIDE === 0 || !anyMoving)) {
      frames.push(snapshot());
    }

    if (!anyMoving) break;
  }

  const finalBalls: PoolBall[] = sim.map((b) => ({
    id: b.id,
    x: round2(b.x),
    y: round2(b.y),
    pocketed: b.pocketed,
  }));

  return {
    finalBalls,
    frames,
    firstContactBallId,
    pocketedBallIds,
  };
}
