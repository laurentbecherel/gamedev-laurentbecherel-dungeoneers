// Light types + organic flicker — Task 6
// Implements deterministic value-noise + multi-octave sine warp + pop shaping
// to avoid predictable sin wave. Inspiration from mygame systems/lights.js
// but adapted to dungeoneers PBR pipeline and dedicated JSON config.

export const LIGHT_TYPES = {
  DIRECTIONAL: 'directional',
  POINT: 'point',
  AMBIENT: 'ambient',
  SPOT: 'spot',
  FLICKER: 'flicker',
  PULSE: 'pulse',
  EMISSIVE: 'emissive',
  STEADY: 'steady',
};

export const LIGHT_TYPE_IDS = {
  point: 0,
  spot: 1,
  flicker: 2,
  pulse: 3,
  emissive: 4,
  ambient: 5,
  steady: 6,
  directional: 0,
};

// Minimal pool for future theme/role weighting — centralizes available type strings.
export const LIGHT_TYPE_POOL = [
  'point', 'spot', 'flicker', 'pulse', 'emissive', 'ambient', 'steady'
];

// ---- Organic flicker helpers — deterministic, no Math.random ----

function hash1(p) {
  // sin-based hash 0..1, identical across engines for same numeric input
  const v = Math.sin(p * 127.1) * 43758.5453123;
  return v - Math.floor(v);
}

function valueNoise1D(t) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3.0 - 2.0 * f); // smoothstep
  const a = hash1(i);
  const b = hash1(i + 1.0);
  return (a + (b - a) * u) * 2.0 - 1.0; // -1..1
}

// Rich organic flame factor: 1 = no flicker.
// Intended layers:
// - low warp (slow sines depend on phase)
// - slow drift via value noise
// - 6 inharmonic sines
// - non-linear shaping via nested sin
// - fast pop via product of high-freq sines, pow-shaped
// - mid noise
export function organicFlickerFactor(time, flickerSpeed, flickerAmount, phase) {
  if (!flickerSpeed && !flickerAmount) return 1.0;
  const fs = flickerSpeed;
  const fa = flickerAmount;
  const ph = phase || 0;
  const baseT = time * fs + ph;

  // Warp: slowly varying offsets so frequency drifts over tens of seconds
  const warpA = Math.sin(baseT * 0.13 + ph * 0.71) * 0.34;
  const warpB = Math.sin(baseT * 0.067 + ph * 1.23) * 0.27;
  const slowNoise = valueNoise1D(baseT * 0.08 + ph) * 0.22;
  const tw = baseT + warpA + warpB + slowNoise;

  // 6 inharmonic sines — not integer multiples, avoids looping feel
  const s1 = Math.sin(tw * 1.0);
  const s2 = Math.sin(tw * 1.87 + ph * 1.31) * 0.58;
  const s3 = Math.sin(tw * 2.93 + ph * 0.74) * 0.34;
  const s4 = Math.sin(tw * 4.63 + ph * 2.07) * 0.20;
  const s5 = Math.sin(tw * 0.38 + ph * 0.52) * 0.26;
  const s6 = Math.sin(tw * 7.31 + ph * 1.93) * 0.11;

  let combined = s1 + s2 + s3 + s4 + s5 + s6;
  // Non-linear fold so bright side differs from dim side (avoids pure sine symmetry)
  combined = combined * 0.62 + Math.sin(combined * 1.35 + ph) * 0.38;

  // Fast pop: product of high freq sines = occasional spike where both near 1
  const fastA = Math.sin(tw * 11.7 + ph * 4.2);
  const fastB = Math.sin(tw * 9.3 + ph * 2.71);
  const pop = fastA * fastB;
  const popShaped = Math.pow(Math.abs(pop), 2.6) * Math.sign(pop) * 0.23;

  const midNoise = valueNoise1D(tw * 0.55 + ph * 3.3) * 0.18;

  const flick = 1.0 + (combined * 0.52 + popShaped + midNoise) * fa * 1.85;
  // Clamp to avoid total blackout — fire dims but never dies
  return Math.max(0.18, flick);
}

export function organicFlickerFactorCheap(time, speed, amount, phase) {
  // Cheaper approximation for GPU shader / minimap — same feel, cheaper math
  if (!speed && !amount) return 1.0;
  const t = time * speed + (phase || 0);
  const a = Math.sin(t * 1.0) * 0.5 + Math.sin(t * 1.87 + phase * 1.3) * 0.25 + Math.sin(t * 4.6) * 0.1;
  return Math.max(0.22, 1.0 + a * amount * 1.4);
}

// Pulse factor for crystals / magical: simple sinusoid 0..1 mapped to intensity scale
export function pulseFactor(time, pulseSpeed, pulseAmount, phase) {
  if (!pulseSpeed && !pulseAmount) return 1.0;
  return 1.0 + Math.sin(time * pulseSpeed + (phase || 0)) * pulseAmount;
}

// Spot cone attenuation: inner = full, outer = zero, smoothstep
export function spotConeAttenuation(lightDir, toLightDir, inner, outer) {
  // both dirs normalized, lightDir = direction light points, toLight = direction from light to point (so -lightDir is center)
  const cosAngle = -(lightDir[0] * toLightDir[0] + lightDir[1] * toLightDir[1] + lightDir[2] * toLightDir[2]);
  if (cosAngle > inner) return 1.0;
  if (cosAngle < outer) return 0.0;
  return (cosAngle - outer) / Math.max(0.001, inner - outer);
}

export function getLightTypeId(type) {
  return LIGHT_TYPE_IDS[type] ?? 0;
}

export function isValidLightType(t) {
  return !!LIGHT_TYPE_IDS.hasOwnProperty(t);
}
