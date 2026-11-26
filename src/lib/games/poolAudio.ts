import type { PoolSoundKind } from "./poolPhysics";

const MUTE_STORAGE_KEY = "family-planner:pool-muted";

let sharedCtx: AudioContext | null = null;
let sharedOut: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): { ctx: AudioContext; out: AudioNode } | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new Ctor();
      // Soft master limiter so overlapping break clacks never clip on mobile speakers
      if (typeof sharedCtx.createDynamicsCompressor === "function") {
        const comp = sharedCtx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-10, sharedCtx.currentTime);
        comp.knee.setValueAtTime(12, sharedCtx.currentTime);
        comp.ratio.setValueAtTime(8, sharedCtx.currentTime);
        comp.attack.setValueAtTime(0.002, sharedCtx.currentTime);
        comp.release.setValueAtTime(0.08, sharedCtx.currentTime);
        comp.connect(sharedCtx.destination);
        sharedOut = comp;
      } else {
        sharedOut = sharedCtx.destination;
      }
    } catch {
      return null;
    }
  }
  if (sharedCtx.state === "suspended") {
    void sharedCtx.resume().catch(() => {});
  }
  return { ctx: sharedCtx, out: sharedOut || sharedCtx.destination };
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const len = Math.floor(ctx.sampleRate * 0.15);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

export function loadPoolMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePoolMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore storage errors */
  }
}

/** Unlocks AudioContext on the first user touch/click gesture. */
export function primePoolAudio(): void {
  getAudioContext();
}

export function playPoolSound(
  kind: PoolSoundKind,
  intensity: number,
  muted: boolean
): void {
  if (muted) return;
  const audio = getAudioContext();
  if (!audio || audio.ctx.state !== "running") return;
  const { ctx, out } = audio;

  const now = ctx.currentTime;
  const amp = Math.max(0.04, Math.min(1, intensity));

  if (kind === "ball") {
    // Authentic phenolic resin clack: dual high-Q modal pings + micro-transient
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32 * amp, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.048);
    gain.connect(out);

    const pitchJitter = 0.96 + Math.random() * 0.08;
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(2150 * pitchJitter + amp * 350, now);
    osc1.frequency.exponentialRampToValueAtTime(1650 * pitchJitter, now + 0.035);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.05);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(3850 * pitchJitter, now);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.16 * amp, now);
    g2.gain.exponentialRampToValueAtTime(0.0005, now + 0.024);
    osc2.connect(g2);
    g2.connect(out);
    osc2.start(now);
    osc2.stop(now + 0.026);

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(3200, now);
    bp.Q.setValueAtTime(2.5, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.24 * amp, now);
    ng.gain.exponentialRampToValueAtTime(0.0008, now + 0.012);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    src.start(now);
    src.stop(now + 0.015);
    return;
  }

  if (kind === "cue") {
    // Crisp leather cue-tip strike + maple shaft pop
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420 + amp * 190, now);
    osc.frequency.exponentialRampToValueAtTime(135, now + 0.055);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.36 * amp, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.07);

    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.setValueAtTime(1400, now);
    hp.Q.setValueAtTime(1.4, now);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2 * amp, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(out);
    src.start(now);
    src.stop(now + 0.022);
    return;
  }

  if (kind === "rail") {
    // Rubber cushion thump
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155 + amp * 55, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.085);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.28 * amp, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.1);
    return;
  }

  if (kind === "pocket") {
    // Leather pocket drop + hollow wooden cup rattle
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.24 * Math.max(0.35, amp), now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.17);

    // Secondary soft rattle bounce inside the pocket
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(145, now + 0.09);
    osc2.frequency.exponentialRampToValueAtTime(68, now + 0.18);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.001, now + 0.09);
    g2.gain.linearRampToValueAtTime(0.14 * Math.max(0.35, amp), now + 0.096);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc2.connect(g2);
    g2.connect(out);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.2);
  }
}
