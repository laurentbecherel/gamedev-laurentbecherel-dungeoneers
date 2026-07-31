// Material Modifiers - generator-side intelligent spreading
// Task 9: moss, damaged, water, puddle, blood, dust
// Uses seeded deterministic rng + hash2i noise + room role weighting.

import { hash2i } from "./dungeon/themes.js";

const MOD_KEYS = ["moss", "damaged", "water", "puddle", "blood", "dust"];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// Value noise approx using hash2i bilinear for CPU organic variation
function valueNoise2(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  // smoothstep
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2i(xi, yi, seed);
  const b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed);
  const d = hash2i(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

function fbm2(x, y, seed, octaves = 2, lac = 2.0, gain = 0.5) {
  let amp = 0.5, freq = 1.0, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq, seed + i * 137) * amp;
    norm += amp;
    freq *= lac;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

function distanceToRoomEdge(x, y, room) {
  const dx = Math.min(x - room.x, room.x + room.w - 1 - x);
  const dy = Math.min(y - room.y, room.y + room.h - 1 - y);
  return Math.min(dx, dy);
}

// Default roleWeights mirrors material-modifiers.json but kept as fallback
const DEFAULT_ROLE_WEIGHTS = {
  entrance:  { moss: 0.32, damaged: 0.15, water: 0.42, puddle: 0.20, blood: 0.05, dust: 0.20 },
  guardian:  { moss: 0.06, damaged: 0.62, water: 0.12, puddle: 0.06, blood: 0.86, dust: 0.10 },
  treasure:  { moss: 0.14, damaged: 0.12, water: 0.06, puddle: 0.02, blood: 0.08, dust: 0.72 },
  secret:    { moss: 0.26, damaged: 0.10, water: 0.06, puddle: 0.03, blood: 0.05, dust: 0.78 },
  shrine:    { moss: 0.52, damaged: 0.10, water: 0.22, puddle: 0.10, blood: 0.08, dust: 0.42 },
  hub:       { moss: 0.18, damaged: 0.42, water: 0.16, puddle: 0.09, blood: 0.32, dust: 0.22 },
  armory:    { moss: 0.08, damaged: 0.32, water: 0.08, puddle: 0.05, blood: 0.55, dust: 0.32 },
  exit:      { moss: 0.12, damaged: 0.52, water: 0.30, puddle: 0.18, blood: 0.16, dust: 0.26 },
  corridor:  { moss: 0.12, damaged: 0.20, water: 0.15, puddle: 0.08, blood: 0.12, dust: 0.15 },
  hall:      { moss: 0.16, damaged: 0.26, water: 0.12, puddle: 0.06, blood: 0.10, dust: 0.26 },
};

const DEFAULT_DTW = { moss: 0.32, puddle: 0.52, dust: 0.20, water: 0.22, damaged: 0.18, blood: 0.05 };
const DEFAULT_DEPTH_F = { moss: -0.12, dust: 0.18, water: -0.08, puddle: -0.06, blood: 0.10, damaged: 0.12 };

/**
 * Generate per-cell modifier intensities.
 * @param {object} params {w,h,rooms,grid,deco,floorHeight,floorToRoom,roleMap,depthArr,seed,config}
 * config can be material-modifiers.generator portion.
 */
export function generateModifiers(params) {
  const { w, h, rooms, grid, floorHeight, floorToRoom, roleMap, depthArr, seed, config } = params;
  const size = w * h;
  const cfg = config || {};
  const roleWeights = cfg.roleWeights || DEFAULT_ROLE_WEIGHTS;
  const dtwFactor = cfg.distanceToWallFactor || DEFAULT_DTW;
  const depthFactor = cfg.depthFactor || DEFAULT_DEPTH_F;
  const decoInfl = cfg.decoInfluence || {};
  const perRoomJitter = cfg.perRoomJitter ?? 0.42;
  const noiseScale = cfg.noiseScale ?? 0.18;
  const maxPerCell = cfg.maxModifiersPerCell ?? 2;
  const ceilingDustBoost = cfg.ceilingDustBoost ?? 1.35;
  const floorPuddleBoost = cfg.floorPuddleBoost ?? 1.2;
  const floorMossWallAdj = cfg.floorMossWallAdj ?? 0.25;

  const rng = makeRng(seed);

  // Per-room base profiles
  const roomBases = new Array(rooms.length);
  for (let ri = 0; ri < rooms.length; ri++) {
    const role = (roleMap && roleMap.get(ri)) || rooms[ri].role || "corridor";
    const d = depthArr ? (depthArr[ri] >= 0 ? depthArr[ri] : 0.5) : 0.5;
    const weights = roleWeights[role] || roleWeights["corridor"];
    const base = {};
    for (const mk of MOD_KEYS) {
      let v = weights[mk] ?? 0.1;
      // depth modulation
      const df = depthFactor[mk] ?? 0;
      v += df * (d - 0.5) * 0.6;
      // per-room jitter deterministic
      const jitter = (hash2i(rooms[ri].x + ri * 19, rooms[ri].y + ri * 7, seed + 100) - 0.5) * perRoomJitter;
      v = clamp01(v + jitter * 0.5 + (rng() - 0.5) * 0.1);
      base[mk] = v;
    }
    roomBases[ri] = base;
  }

  // Allocate per cell float arrays 0..1
  const out = {};
  for (const mk of MOD_KEYS) out[mk] = new Float32Array(size);

  const idx = (x, y) => y * w + x;

  // Helper to get deco bit influence (reuse atlas deco constants from generator if needed)
  // We don't have deco bits here via import? We'll use params.deco if given. Use same constants as atlas: DECO_MOSS=2, DECO_ROOTS=64, DECO_PUDDLE=32, DECO_BROKEN=16, DECO_BEAM=128
  // For evaluation we just check >0 jitter.

  const DECO_MOSS = 2, DECO_ROOTS = 64, DECO_PUDDLE = 32, DECO_BROKEN = 16;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const isFloor = grid[i] === 0;
      // find room
      let roomIdx = -1;
      let room = null;
      if (floorToRoom && floorToRoom[i] >= 0) {
        roomIdx = floorToRoom[i];
        room = rooms[roomIdx];
      } else if (floorToRoom && floorToRoom[i] === -2) {
        // corridor - treat as corridor role
        roomIdx = -1;
      } else {
        // wall cell - find nearest room for wall modifiers
        let bestD = 1e9;
        for (let ri = 0; ri < rooms.length; ri++) {
          const r = rooms[ri];
          const d = Math.abs(x - r.cx) + Math.abs(y - r.cy);
          if (d < bestD) { bestD = d; roomIdx = ri; room = r; }
        }
        if (!room) continue;
      }
      if (roomIdx === -1) {
        // corridor weights
        room = { x, y, w: 1, h: 1, role: "corridor" };
      } else {
        room = rooms[roomIdx];
      }

      const baseProfile = roomIdx >= 0 ? roomBases[roomIdx] : (roleWeights["corridor"]);

      // distance to edge for walls/floors
      let dtwNorm = 0;
      if (roomIdx >= 0) {
        const de = distanceToRoomEdge(x, y, room);
        dtwNorm = Math.max(0, 1 - de / Math.max(1, Math.min(room.w, room.h) * 0.5)); // 0 interior, 1 edge
      } else {
        dtwNorm = 0.5;
      }

      const fx = x * noiseScale, fy = y * noiseScale;

      for (let mi = 0; mi < MOD_KEYS.length; mi++) {
        const mk = MOD_KEYS[mi];
        let v = baseProfile[mk] ?? 0.1;

        // organic noise variation per modifier using different seed offset
        const nSeed = seed + mi * 7919 + 123;
        const n = fbm2(fx + mi * 13.37, fy + mi * 7.13, nSeed, 2, 2.0, 0.5);
        // n is 0..1, map to 0.6..1.4 modulation
        const nMod = 0.55 + n * 0.9;

        // distance to wall influence
        const dwF = dtwFactor[mk] ?? 0;
        const wallInfluence = 1 + dwF * dtwNorm * 0.9;

        // deco influence
        let decoAdd = 0;
        if (params.deco) {
          const d = params.deco[i];
          if (mk === "moss" && (d & DECO_MOSS)) decoAdd += decoInfl["moss_moss"] ?? 0.45;
          if (mk === "moss" && (d & DECO_ROOTS)) decoAdd += decoInfl["moss_roots"] ?? 0.35;
          if (mk === "puddle" && (d & DECO_PUDDLE)) decoAdd += decoInfl["puddle_puddle"] ?? 0.4;
          if (mk === "damaged" && (d & DECO_BROKEN)) decoAdd += decoInfl["damaged_broken"] ?? 0.38;
        }

        // floorHeight depression for puddles
        if (mk === "puddle") {
          if (!isFloor) {
            v = 0; // puddle floors only per config
          } else {
            const fh = floorHeight ? floorHeight[i] : 0;
            // fh is around 0 average, but corridor has *0.2 flatten, negative is depression? Use low values
            const depression = Math.max(0, -fh + 0.02) * 3.0; // negative fh -> more puddle
            v = v * (1 + depression) * floorPuddleBoost * (0.5 + n * 1.0);
            // large blob shaping for puddle using low freq noise separately
            const bigBlob = fbm2(x * 0.12, y * 0.12, seed + 555, 2);
            v = v * (0.3 + bigBlob * 1.2);
            if (bigBlob < 0.35) v *= 0.4;
          }
        }

        if (mk === "moss") {
          if (!isFloor) {
            // walls: more near floor low? But use dtw for near floor adjacency via deco
            v = v * wallInfluence;
            const adjFloorMoss = floorMossWallAdj;
            // check if wall cell adjacent to floor with roots
            // simplistic: if any neighboring floor cell has moss/roots deco, boost
          } else {
            // floors: less moss but still near walls
            v *= (0.6 + dtwNorm * 0.6);
          }
        }

        if (mk === "water") {
          // water more near puddle and low walls
          if (isFloor) v *= (0.5 + dtwNorm * 0.3);
          else v *= (0.9 + dtwNorm * 0.35);
          // correlate with puddle presence
        }

        if (mk === "blood") {
          // more toward room center
          const centerFactor = roomIdx >= 0 ? (1 - dtwNorm) : 0.5;
          v = v * (0.5 + centerFactor * 0.8) * nMod;
          // splatter peaks via hash threshold
          const peak = hash2i(x * 3, y * 3, seed + mi * 101 + 77);
          if (peak > 0.88) v = Math.min(1, v * 1.6);
          else if (peak < 0.25) v *= 0.45;
        }

        if (mk === "dust") {
          v = v * wallInfluence * 0.9;
          // ceilings boost (we encode same intensity, shader will boost for ceil)
          // but mark a bit higher overall
          v *= (isFloor ? 1.0 : ceilingDustBoost * 0.7);
          // away from puddle/water: reduce if puddle strong (will be normalized later)
        }

        if (mk === "damaged") {
          // damaged loves edges and high variation
          v = v * (0.6 + dtwNorm * 0.9) * nMod;
        }

        v = clamp01(v * nMod + decoAdd * 0.6);
        // threshold minimal cut to avoid noise everywhere
        const minThresh = 0.08;
        if (v < minThresh) v *= 0.25;

        out[mk][i] = v;
      }

      // Top2 normalization optimized - avoids per-cell allocation + sort (was causing GC pauses and 5min freeze perception)
      // Manual find top 2 indices without object allocation
      let max1Idx = -1, max2Idx = -1;
      let max1Val = -1, max2Val = -1;
      for (let mi2 = 0; mi2 < MOD_KEYS.length; mi2++) {
        const k = MOD_KEYS[mi2];
        const v = out[k][i];
        if (v > max1Val) { max2Val = max1Val; max2Idx = max1Idx; max1Val = v; max1Idx = mi2; }
        else if (v > max2Val) { max2Val = v; max2Idx = mi2; }
      }
      // Dampen non-top entries
      for (let mi2 = 0; mi2 < MOD_KEYS.length; mi2++) {
        if (mi2 === max1Idx || mi2 === max2Idx) continue;
        const k = MOD_KEYS[mi2];
        const v = out[k][i];
        if (v < 0.55) out[k][i] = v * 0.25;
        else out[k][i] = v * 0.55;
      }
      // Normalize top2 sum <=1.2
      let topSum = 0;
      if (max1Idx >= 0) topSum += out[MOD_KEYS[max1Idx]][i];
      if (max2Idx >= 0) topSum += out[MOD_KEYS[max2Idx]][i];
      if (topSum > 1.2) {
        const scale = 1.2 / topSum;
        if (max1Idx >= 0) out[MOD_KEYS[max1Idx]][i] *= scale;
        if (max2Idx >= 0) out[MOD_KEYS[max2Idx]][i] *= scale;
      }
    }
  }

  // Also per-room averages for screenshot targeting / debug
  const roomAvgs = rooms.map((r, ri) => {
    const w0 = r.w, h0 = r.h;
    const acc = {};
    for (const mk of MOD_KEYS) acc[mk] = 0;
    let count = 0;
    for (let dy = 0; dy < h0; dy++) for (let dx = 0; dx < w0; dx++) {
      const x = r.x + dx, y = r.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = idx(x, y);
      if (grid[i] !== 0) continue;
      for (const mk of MOD_KEYS) acc[mk] += out[mk][i];
      count++;
    }
    if (count > 0) for (const mk of MOD_KEYS) acc[mk] /= count;
    return { idx: ri, role: r.role, x: r.cx, y: r.cy, avg: acc, count };
  });

  return {
    w, h, seed,
    moss: out.moss,
    damaged: out.damaged,
    water: out.water,
    puddle: out.puddle,
    blood: out.blood,
    dust: out.dust,
    roomAvgs,
  };
}

export function packModifierTextures(modData) {
  const { w, h, moss, damaged, water, puddle, blood, dust } = modData;
  const size = w * h;
  const texA = new Uint8Array(size * 4); // R=moss G=damaged B=water A=puddle
  const texB = new Uint8Array(size * 4); // R=blood G=dust B=0 A=0
  for (let i = 0; i < size; i++) {
    texA[i * 4] = Math.round(clamp01(moss[i]) * 255);
    texA[i * 4 + 1] = Math.round(clamp01(damaged[i]) * 255);
    texA[i * 4 + 2] = Math.round(clamp01(water[i]) * 255);
    texA[i * 4 + 3] = Math.round(clamp01(puddle[i]) * 255);
    texB[i * 4] = Math.round(clamp01(blood[i]) * 255);
    texB[i * 4 + 1] = Math.round(clamp01(dust[i]) * 255);
    texB[i * 4 + 2] = 0;
    texB[i * 4 + 3] = 255;
  }
  return { w, h, texA, texB };
}

