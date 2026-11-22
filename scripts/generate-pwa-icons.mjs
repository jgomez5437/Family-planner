#!/usr/bin/env node
/**
 * Generates crisp, anti-aliased PWA icons (SVG + PNG) for Family Planner
 * with zero external dependencies (uses Node.js built-in zlib + 4x4 supersampled SDF).
 *
 * Outputs:
 *   - public/icons/icon.svg
 *   - public/icons/icon-192.png
 *   - public/icons/icon-512.png
 *   - public/icons/icon-maskable-512.png
 *   - public/icons/apple-touch-icon.png
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.resolve(process.cwd(), "public/icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ---------------- PNG Encoder (RGBA 8-bit) ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- SDF Geometry Helpers ---------------- */

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sdRoundedRect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function sdTriangle(px, py, p0x, p0y, p1x, p1y, p2x, p2y) {
  const e0x = p1x - p0x, e0y = p1y - p0y;
  const e1x = p2x - p1x, e1y = p2y - p1y;
  const e2x = p0x - p2x, e2y = p0y - p2y;

  const v0x = px - p0x, v0y = py - p0y;
  const v1x = px - p1x, v1y = py - p1y;
  const v2x = px - p2x, v2y = py - p2y;

  const pq0x = v0x - e0x * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const pq0y = v0y - e0y * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);

  const pq1x = v1x - e1x * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const pq1y = v1y - e1y * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);

  const pq2x = v2x - e2x * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const pq2y = v2y - e2y * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);

  const s = Math.sign(e0x * e2y - e0y * e2x);

  const d0 = pq0x * pq0x + pq0y * pq0y;
  const c0 = s * (v0x * e0y - v0y * e0x);

  const d1 = pq1x * pq1x + pq1y * pq1y;
  const c1 = s * (v1x * e1y - v1y * e1x);

  const d2 = pq2x * pq2x + pq2y * pq2y;
  const c2 = s * (v2x * e2y - v2y * e2x);

  const minD = Math.min(d0, d1, d2);
  const minC = Math.min(c0, c1, c2);
  return -Math.sqrt(minD) * Math.sign(minC);
}

/**
 * Signed distance to an upright heart centered around (cx, cy) with scale s.
 */
function sdHeart(px, py, cx, cy, scale) {
  let x = Math.abs((px - cx) / scale);
  // Flip Y so positive y points up for the canonical heart formula
  let y = -(py - cy) / scale + 0.55;

  if (y + x > 1.0) {
    return (Math.hypot(x - 0.25, y - 0.75) - Math.SQRT2 / 4.0) * scale;
  }
  const t = 0.5 * Math.max(x + y, 0.0);
  const d1 = (x - 0.0) * (x - 0.0) + (y - 1.0) * (y - 1.0);
  const d2 = (x - t) * (x - t) + (y - t) * (y - t);
  return Math.sqrt(Math.min(d1, d2)) * Math.sign(x - y) * scale;
}

/* ---------------- Icon Renderer ---------------- */

/**
 * Renders the Family Planner icon at `size x size`.
 * - roundedMask: applies rounded corners (true for standard icons; false for full-bleed maskable/Apple icons)
 * - artworkScale: shrinks motif slightly for maskable icons so it stays inside Android's 80% safe circle
 */
function renderIcon(size, { roundedMask = false, artworkScale = 1.0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4; // 4x4 supersampling for clean anti-aliased edges

  // Colors matching Family Planner brand palette
  const topLeft = [240, 114, 58]; // warm coral-terracotta highlight
  const midGrad = [232, 98, 44]; // #E8622C primary brand color
  const botRight = [194, 70, 26]; // #C2461A deep terracotta
  const cream = [255, 249, 240]; // #FFF9F0 warm cream house
  const heartColor = [232, 98, 44]; // #E8622C heart cutout inside house
  const roofAccent = [255, 236, 214]; // subtle warm glow behind house

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (px + (sx + 0.5) / samples) / size; // [0, 1]
          const v = (py + (sy + 0.5) / samples) / size; // [0, 1]

          // Optional rounded outer clip for transparent-corner standard icon
          if (roundedMask) {
            const bgDist = sdRoundedRect(u, v, 0.5, 0.5, 0.48, 0.48, 0.22);
            if (bgDist > 0) {
              continue; // transparent pixel outside rounded square
            }
          }

          // Diagonal warm terracotta gradient background
          const g = clamp((u * 0.65 + v * 0.85) / 1.4, 0, 1);
          let r, gr, b;
          if (g < 0.5) {
            const t = g * 2;
            r = lerp(topLeft[0], midGrad[0], t);
            gr = lerp(topLeft[1], midGrad[1], t);
            b = lerp(topLeft[2], midGrad[2], t);
          } else {
            const t = (g - 0.5) * 2;
            r = lerp(midGrad[0], botRight[0], t);
            gr = lerp(midGrad[1], botRight[1], t);
            b = lerp(midGrad[2], botRight[2], t);
          }

          // Subtle radial soft highlight near top-center
          const glowD = Math.hypot((u - 0.35) * 1.1, (v - 0.25) * 1.1);
          const glow = clamp(1 - glowD / 0.75, 0, 1) * 0.12;
          r = lerp(r, 255, glow);
          gr = lerp(gr, 232, glow);
          b = lerp(b, 208, glow);

          // Map into artwork coordinate space centered at (0.5, 0.5)
          const ax = (u - 0.5) / artworkScale + 0.5;
          const ay = (v - 0.5) / artworkScale + 0.5;

          // Subtle soft halo behind the house
          const haloD = Math.hypot(ax - 0.5, ay - 0.52);
          if (haloD < 0.34) {
            const haloT = Math.pow(1 - haloD / 0.34, 2) * 0.14;
            r = lerp(r, roofAccent[0], haloT);
            gr = lerp(gr, roofAccent[1], haloT);
            b = lerp(b, roofAccent[2], haloT);
          }

          // House silhouette:
          // 1. Base body (rounded rectangle)
          const bodyDist = sdRoundedRect(ax, ay, 0.5, 0.615, 0.215, 0.17, 0.045);

          // 2. Chimney on right side of roof
          const chimneyDist = sdRoundedRect(ax, ay, 0.655, 0.36, 0.042, 0.085, 0.018);

          // 3. Filled gabled roof triangle (slightly rounded)
          const roofFill =
            sdTriangle(ax, ay, 0.5, 0.24, 0.24, 0.49, 0.76, 0.49) - 0.015;

          // 4. Thick rounded roof eaves strokes extending cleanly past house body
          const leftEave = sdSegment(ax, ay, 0.5, 0.235, 0.215, 0.495) - 0.044;
          const rightEave = sdSegment(ax, ay, 0.5, 0.235, 0.785, 0.495) - 0.044;

          const houseDist = Math.min(bodyDist, chimneyDist, roofFill, leftEave, rightEave);

          // Drop shadow under house
          const shadowBody = sdRoundedRect(ax, ay - 0.025, 0.5, 0.615, 0.215, 0.17, 0.045);
          if (houseDist > 0 && shadowBody < 0.035) {
            const sh = clamp(1 - Math.max(shadowBody, 0) / 0.035, 0, 1) * 0.18;
            r = lerp(r, 90, sh);
            gr = lerp(gr, 24, sh);
            b = lerp(b, 8, sh);
          }

          if (houseDist <= 0) {
            r = cream[0];
            gr = cream[1];
            b = cream[2];

            // Heart emblem centered inside the house body
            const heartDist = sdHeart(ax, ay, 0.5, 0.59, 0.22);
            if (heartDist <= 0) {
              // Warm terracotta heart matching the icon gradient
              r = heartColor[0];
              gr = heartColor[1];
              b = heartColor[2];
            }
          }

          accR += r;
          accG += gr;
          accB += b;
          accA += 255;
        }
      }

      const n = samples * samples;
      const idx = (py * size + px) * 4;
      if (accA === 0) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      } else {
        // Un-premultiply RGB so semi-transparent rounded edge stays clean
        const cov = accA / (n * 255);
        rgba[idx] = Math.round(clamp(accR / (accA / 255), 0, 255));
        rgba[idx + 1] = Math.round(clamp(accG / (accA / 255), 0, 255));
        rgba[idx + 2] = Math.round(clamp(accB / (accA / 255), 0, 255));
        rgba[idx + 3] = Math.round(clamp(cov * 255, 0, 255));
      }
    }
  }

  return encodePng(size, size, rgba);
}

/* ---------------- SVG Icon ---------------- */

const SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="fp-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F0723A" />
      <stop offset="50%" stop-color="#E8622C" />
      <stop offset="100%" stop-color="#C2461A" />
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="492" height="492" rx="112" fill="url(#fp-bg)" />
  <g fill="#FFF9F0">
    <!-- Chimney -->
    <rect x="314" y="142" width="44" height="86" rx="10" />
    <!-- House body -->
    <rect x="146" y="228" width="220" height="174" rx="26" />
    <!-- Gable fill -->
    <polygon points="256,120 120,252 392,252" />
    <!-- Roof eaves -->
    <path d="M110 254 L256 120 L402 254" fill="none" stroke="#FFF9F0" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" />
  </g>
  <!-- Heart emblem -->
  <path d="M256 358 C256 358 198 320 198 282 C198 261 214 246 233 246 C244 246 252 252 256 259 C260 252 268 246 279 246 C298 246 314 261 314 282 C314 320 256 358 256 358 Z" fill="#E8622C" />
</svg>
`;

/* ---------------- Write All Outputs ---------------- */

fs.writeFileSync(path.join(OUT_DIR, "icon.svg"), SVG_ICON, "utf8");
console.log("Generated public/icons/icon.svg");

const targets = [
  {
    name: "icon-192.png",
    size: 192,
    roundedMask: true,
    artworkScale: 0.96,
  },
  {
    name: "icon-512.png",
    size: 512,
    roundedMask: true,
    artworkScale: 0.96,
  },
  {
    name: "icon-maskable-512.png",
    size: 512,
    roundedMask: false, // full-bleed background for Android adaptive masks
    artworkScale: 0.78, // inside Android 80% maskable safe zone
  },
  {
    name: "apple-touch-icon.png",
    size: 180,
    roundedMask: false, // iOS applies its own squircle mask; opaque avoids black corners
    artworkScale: 0.92,
  },
];

for (const target of targets) {
  const png = renderIcon(target.size, {
    roundedMask: target.roundedMask,
    artworkScale: target.artworkScale,
  });
  fs.writeFileSync(path.join(OUT_DIR, target.name), png);
  console.log(`Generated public/icons/${target.name} (${target.size}x${target.size}, ${png.length} bytes)`);
}
