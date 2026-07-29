// Deterministic hash and theme zone resolution for dungeon generator

// 32-bit integer hash — same output for same inputs across all JS engines
export function hash2i(x, y, seed = 0) {
  let h = ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff; // normalize to 0..1
}

// Weighted pick from array of {id, weight} using deterministic hash
export function pickWeighted(pool, hx, hy, seed) {
  if (!pool || pool.length === 0) return 1;
  const total = pool.reduce((s, p) => s + (p.weight || 1), 0);
  const r = hash2i(hx, hy, seed) * total;
  let acc = 0;
  for (const p of pool) {
    acc += p.weight || 1;
    if (r < acc) return p.id;
  }
  return pool[pool.length - 1].id;
}

// Theme definitions — 5 zone progression
const THEMES = {
  classic: {
    id: "classic",
    name: "Classic Dungeon",
    zones: [
      {
        name: "Entry",
        tStart: 0.0, tEnd: 0.15,
        wallPool: [{id:1, weight:1}],
        floorPool: [{id:1, weight:1}],
        ceilPool: [{id:1, weight:1}],
        deco: {moss:0.05, vines:0.02, roots:0.01, broken:0.03, puddle:0.01, beam:0.1, column:0.15, arch:0.05},
        height: {floorMin:-0.02, floorMax:0.02, floorBlockAmp:0.02, ceilMin:1.0, ceilMax:1.15, ceilJitter:0.03},
        vaultWeights: [{type:0, weight:0.7}, {type:1, weight:0.3}],
        pillar: {spacing:5, columnChance:0.2},
        architectureWeights: {dungeon:1.0},
        tint: [245, 230, 202], // warm cream
      },
      {
        name: "Antechamber",
        tStart: 0.15, tEnd: 0.35,
        wallPool: [{id:1, weight:1}],
        floorPool: [{id:1, weight:1}],
        ceilPool: [{id:1, weight:1}],
        deco: {moss:0.08, vines:0.04, roots:0.02, broken:0.05, puddle:0.02, beam:0.12, column:0.18, arch:0.06},
        height: {floorMin:-0.03, floorMax:0.03, floorBlockAmp:0.03, ceilMin:1.0, ceilMax:1.2, ceilJitter:0.04},
        vaultWeights: [{type:0, weight:0.6}, {type:1, weight:0.25}, {type:2, weight:0.15}],
        pillar: {spacing:4, columnChance:0.25},
        architectureWeights: {dungeon:1.0},
        tint: [212, 196, 168], // light stone
      },
      {
        name: "Depths",
        tStart: 0.35, tEnd: 0.60,
        wallPool: [{id:1, weight:1}],
        floorPool: [{id:1, weight:1}],
        ceilPool: [{id:1, weight:1}],
        deco: {moss:0.12, vines:0.06, roots:0.04, broken:0.08, puddle:0.04, beam:0.08, column:0.22, arch:0.08},
        height: {floorMin:-0.05, floorMax:0.05, floorBlockAmp:0.04, ceilMin:0.95, ceilMax:1.25, ceilJitter:0.05},
        vaultWeights: [{type:0, weight:0.4}, {type:1, weight:0.3}, {type:2, weight:0.2}, {type:3, weight:0.1}],
        pillar: {spacing:4, columnChance:0.3},
        architectureWeights: {dungeon:0.8, ruins:0.2},
        tint: [139, 115, 85], // medium gray-brown
      },
      {
        name: "Sanctum",
        tStart: 0.60, tEnd: 0.85,
        wallPool: [{id:1, weight:1}],
        floorPool: [{id:1, weight:1}],
        ceilPool: [{id:1, weight:1}],
        deco: {moss:0.22, vines:0.12, roots:0.1, broken:0.12, puddle:0.08, beam:0.05, column:0.18, arch:0.04},
        height: {floorMin:-0.08, floorMax:0.04, floorBlockAmp:0.05, ceilMin:0.9, ceilMax:1.2, ceilJitter:0.06},
        vaultWeights: [{type:0, weight:0.3}, {type:1, weight:0.25}, {type:2, weight:0.25}, {type:3, weight:0.2}],
        pillar: {spacing:3, columnChance:0.35},
        architectureWeights: {dungeon:0.5, ruins:0.3, cave:0.2},
        tint: [74, 93, 58], // dark green-brown moss
      },
      {
        name: "Exit",
        tStart: 0.85, tEnd: 1.01,
        wallPool: [{id:1, weight:1}],
        floorPool: [{id:1, weight:1}],
        ceilPool: [{id:1, weight:1}],
        deco: {moss:0.15, vines:0.08, roots:0.06, broken:0.15, puddle:0.05, beam:0.03, column:0.25, arch:0.12},
        height: {floorMin:-0.06, floorMax:0.06, floorBlockAmp:0.04, ceilMin:1.1, ceilMax:1.4, ceilJitter:0.04},
        vaultWeights: [{type:1, weight:0.4}, {type:0, weight:0.3}, {type:3, weight:0.2}, {type:2, weight:0.1}],
        pillar: {spacing:3, columnChance:0.4},
        architectureWeights: {dungeon:0.3, ruins:0.4, cave:0.3},
        tint: [45, 27, 61], // deep purple-black mystical
      },
    ],
  },
};

export function getTheme(themeId = "classic") {
  return THEMES[themeId] || THEMES.classic;
}

export function zoneForDepth(globalT, themeId = "classic") {
  const theme = getTheme(themeId);
  const t = Math.max(0, Math.min(1, globalT));
  for (const z of theme.zones) {
    if (t >= z.tStart && t < z.tEnd) {
      const local = (t - z.tStart) / (z.tEnd - z.tStart);
      return {zone: z, local, theme};
    }
  }
  const last = theme.zones[theme.zones.length - 1];
  return {zone: last, local: 1, theme};
}

export function globalDepthForLevel(localT, levelIndex, levelCount) {
  return (levelIndex + localT) / Math.max(1, levelCount);
}
