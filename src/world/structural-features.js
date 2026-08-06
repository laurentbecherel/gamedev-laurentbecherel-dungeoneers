// Structural surface features: semantic placement data, compact GPU packing,
// and CPU-side macro-height queries. These are deliberately separate from
// continuous material modifiers in world/modifiers.js.

export const FEATURE_KIND = Object.freeze({
  NONE: 0,
  CHANNEL_FLOOR: 1,
  ROUND_GRILLE_WALL: 2,
});

export const FEATURE_CONNECTION = Object.freeze({
  NORTH: 1,
  EAST: 2,
  SOUTH: 4,
  WEST: 8,
});

export const FEATURE_FILL = Object.freeze({
  NONE: 0,
  WATER: 1,
  BLOOD: 2,
  LAVA: 3,
});

export const FEATURE_FLAGS = Object.freeze({
  FLOW_REVERSED: 1,
  INHERIT_HOST: 2,
  DISABLE_COSMETIC_PUDDLE: 4,
});

export const DEFAULT_CHANNEL_PROFILE = Object.freeze({
  width: 0.75,
  depth: 0.11,
  bankWidth: 0.16,
  bankSharpness: 1.4,
  waterDepth: 0.07,
  walkable: true,
  liningMode: 'blend_host',
  liningStrength: 0.70,
});

const ROLE_PRIORITY = Object.freeze({ hub: 0, hall: 1, guardian: 2, shrine: 3, armory: 4, treasure: 5, secret: 6 });

export function packFeatureCell(kind, connections = 0, profile = 0, fill = 0, flags = 0) {
  return ((kind & 0xff)
    | ((connections & 0x0f) << 8)
    | ((profile & 0xff) << 12)
    | ((fill & 0xff) << 20)
    | ((flags & 0x0f) << 28)) >>> 0;
}

export function decodeFeatureCell(word) {
  const v = Number(word) >>> 0;
  return {
    kind: v & 0xff,
    connections: (v >>> 8) & 0x0f,
    profile: (v >>> 12) & 0xff,
    fill: (v >>> 20) & 0xff,
    flags: (v >>> 28) & 0x0f,
  };
}

function hash01(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 700001)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function featureConfig(config) {
  return config?.structuralFeatures || config?.['structural-features'] || config?.features || null;
}

function channelProfile(config) {
  const cfg = featureConfig(config);
  const p = cfg?.profiles?.stone_channel || cfg?.profiles?.channel || {};
  return { ...DEFAULT_CHANNEL_PROFILE, ...p };
}

function orderedOffsets(length) {
  const center = (length - 1) * 0.5;
  return Array.from({ length }, (_, i) => i)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
}

function isStairCell(room, x, y) {
  const s = room?.stairWall;
  if (!s) return false;
  return x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2;
}

function findTrackInRoom(dungeon, room, preferredAxis, minSpan) {
  const { w, h, grid } = dungeon;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : grid[y * w + x];
  const axes = preferredAxis === 'east-west' ? ['east-west', 'north-south'] : ['north-south', 'east-west'];

  for (const axis of axes) {
    const span = axis === 'east-west' ? room.w : room.h;
    const cross = axis === 'east-west' ? room.h : room.w;
    if (span < minSpan) continue;
    for (const off of orderedOffsets(cross)) {
      const floorCells = [];
      let start, end, startFace, endFace, connections;
      if (axis === 'east-west') {
        const y = room.y + off;
        start = { x: room.x - 1, y };
        end = { x: room.x + room.w, y };
        startFace = FEATURE_CONNECTION.EAST;
        endFace = FEATURE_CONNECTION.WEST;
        connections = FEATURE_CONNECTION.EAST | FEATURE_CONNECTION.WEST;
        for (let x = room.x; x < room.x + room.w; x++) floorCells.push({ x, y });
      } else {
        const x = room.x + off;
        start = { x, y: room.y - 1 };
        end = { x, y: room.y + room.h };
        startFace = FEATURE_CONNECTION.SOUTH;
        endFace = FEATURE_CONNECTION.NORTH;
        connections = FEATURE_CONNECTION.NORTH | FEATURE_CONNECTION.SOUTH;
        for (let y = room.y; y < room.y + room.h; y++) floorCells.push({ x, y });
      }
      if (at(start.x, start.y) <= 0 || at(end.x, end.y) <= 0) continue;
      if (isStairCell(room, start.x, start.y) || isStairCell(room, end.x, end.y)) continue;
      if (floorCells.some(c => at(c.x, c.y) !== 0)) continue;
      return { axis, connections, floorCells, endpoints: [
        { ...start, face: startFace },
        { ...end, face: endFace },
      ] };
    }
  }
  return null;
}

/**
 * Deterministically place structural features on a fully carved and painted dungeon.
 * The floor/wall grid is never mutated.
 */
export function generateStructuralFeatures(dungeon, config = {}) {
  const cfg = featureConfig(config);
  const size = dungeon.w * dungeon.h;
  const cells = new Uint32Array(size);
  if (!cfg || cfg.enabled === false) {
    return { features: [], cells, profiles: [null, channelProfile(config)], enabled: false };
  }

  const gen = cfg.generator || {};
  const excluded = new Set(gen.excludedRoles || ['entrance', 'exit']);
  const preferred = gen.preferredRoles || ['hub', 'hall', 'guardian', 'shrine'];
  const preferredRank = new Map(preferred.map((r, i) => [r, i]));
  const minSpan = Math.max(4, gen.minRoomSpan ?? 5);
  const seed = dungeon.seed ?? 1337;
  const candidates = (dungeon.rooms || [])
    .map((room, roomIndex) => ({ room, roomIndex }))
    .filter(({ room }) => !excluded.has(room.role))
    .sort((a, b) => {
      const ar = preferredRank.has(a.room.role) ? preferredRank.get(a.room.role) : (ROLE_PRIORITY[a.room.role] ?? 20);
      const br = preferredRank.has(b.room.role) ? preferredRank.get(b.room.role) : (ROLE_PRIORITY[b.room.role] ?? 20);
      if (ar !== br) return ar - br;
      const areaDelta = b.room.w * b.room.h - a.room.w * a.room.h;
      if (areaDelta) return areaDelta;
      return hash01(a.room.x, a.room.y, seed) - hash01(b.room.x, b.room.y, seed);
    });

  const maxFeatures = Math.max(0, Math.min(gen.maxPerLevel ?? gen.prototypeGuarantee ?? 1, 8));
  const features = [];
  for (const { room, roomIndex } of candidates) {
    if (features.length >= maxFeatures) break;
    const preferredAxis = room.w >= room.h ? 'east-west' : 'north-south';
    const track = findTrackInRoom(dungeon, room, preferredAxis, minSpan);
    if (!track) continue;
    const flowReversed = hash01(room.x + room.w, room.y + room.h, seed + 991) < 0.5;
    const flags = FEATURE_FLAGS.DISABLE_COSMETIC_PUDDLE | (flowReversed ? FEATURE_FLAGS.FLOW_REVERSED : 0);
    const floorIndices = [];
    for (const c of track.floorCells) {
      const index = c.y * dungeon.w + c.x;
      floorIndices.push(index);
      cells[index] = packFeatureCell(FEATURE_KIND.CHANNEL_FLOOR, track.connections, 1, FEATURE_FILL.WATER, flags);
    }
    const endpoints = track.endpoints.map(e => {
      const cellIndex = e.y * dungeon.w + e.x;
      cells[cellIndex] = packFeatureCell(FEATURE_KIND.ROUND_GRILLE_WALL, e.face, 1, FEATURE_FILL.WATER, flags);
      return { cellIndex, x: e.x, y: e.y, face: e.face, fixtureId: 'round_sewer_grille' };
    });
    const feature = {
      id: features.length + 1,
      recipeId: 'sewer_track',
      roomIndex,
      axis: track.axis,
      flowDirection: flowReversed
        ? (track.axis === 'east-west' ? 'west' : 'north')
        : (track.axis === 'east-west' ? 'east' : 'south'),
      geometryProfileId: 'stone_channel',
      fillId: 'water',
      floorCells: floorIndices,
      endpoints,
    };
    features.push(feature);
    room.structuralFeatureId = feature.id;
  }

  return { features, cells, profiles: [null, channelProfile(config)], enabled: features.length > 0 };
}

export function sampleChannelProfile(localAcross, baseHeight = 0, profile = DEFAULT_CHANNEL_PROFILE) {
  const width = Math.max(0.05, Math.min(0.98, profile.width ?? DEFAULT_CHANNEL_PROFILE.width));
  const half = width * 0.5;
  const bankWidth = Math.max(0.01, Math.min(half, profile.bankWidth ?? DEFAULT_CHANNEL_PROFILE.bankWidth));
  const bedHalf = Math.max(0, half - bankWidth);
  const depth = Math.max(0, profile.depth ?? DEFAULT_CHANNEL_PROFILE.depth);
  const d = Math.abs(localAcross - 0.5);
  let bankT = 0;
  if (d < half) {
    if (d <= bedHalf) bankT = 1;
    else {
      const rawT = (half - d) / bankWidth;
      const sharpness = Math.max(1, profile.bankSharpness ?? DEFAULT_CHANNEL_PROFILE.bankSharpness);
      const t = 1 - Math.pow(1 - rawT, sharpness);
      bankT = t * t * (3 - 2 * t);
    }
  }
  const derivativeSign = localAcross < 0.5 ? -1 : 1;
  let slope = 0;
  if (d > bedHalf && d < half) {
    const rawT = (half - d) / bankWidth;
    const sharpness = Math.max(1, profile.bankSharpness ?? DEFAULT_CHANNEL_PROFILE.bankSharpness);
    const t = 1 - Math.pow(1 - rawT, sharpness);
    const dSmoothDt = 6 * t * (1 - t);
    const dCurveDt = sharpness * Math.pow(1 - rawT, sharpness - 1);
    slope = depth * dSmoothDt * dCurveDt / bankWidth * derivativeSign;
  }
  return {
    height: baseHeight - depth * bankT,
    bankT,
    slope,
    region: bankT <= 0 ? 'host' : (bankT >= 0.999 ? 'bed' : 'bank'),
    edgeFactor: bankT * (1 - bankT) * 4,
    inside: d < half,
  };
}

export function sampleWalkSurface(dungeon, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (!dungeon || cx < 0 || cy < 0 || cx >= dungeon.w || cy >= dungeon.h) {
    return { height: 0, normal: [0, 0, 1], featureKind: FEATURE_KIND.NONE, fillId: FEATURE_FILL.NONE, liquidDepth: 0 };
  }
  const index = cy * dungeon.w + cx;
  const baseHeight = 0;
  const decoded = decodeFeatureCell(dungeon.featureCells?.[index] ?? 0);
  if (decoded.kind !== FEATURE_KIND.CHANNEL_FLOOR) {
    return { height: baseHeight, normal: [0, 0, 1], featureKind: decoded.kind, fillId: decoded.fill, liquidDepth: 0 };
  }
  const ns = (decoded.connections & (FEATURE_CONNECTION.NORTH | FEATURE_CONNECTION.SOUTH)) === (FEATURE_CONNECTION.NORTH | FEATURE_CONNECTION.SOUTH);
  const across = ns ? x - cx : y - cy;
  const profile = dungeon.featureProfiles?.[decoded.profile] || DEFAULT_CHANNEL_PROFILE;
  const s = sampleChannelProfile(across, baseHeight, profile);
  const n = ns ? [-s.slope, 0, 1] : [0, -s.slope, 1];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return {
    height: s.height,
    normal: [n[0] / len, n[1] / len, n[2] / len],
    featureKind: decoded.kind,
    fillId: decoded.fill,
    liquidDepth: s.inside ? Math.min(profile.waterDepth ?? DEFAULT_CHANNEL_PROFILE.waterDepth, profile.depth ?? DEFAULT_CHANNEL_PROFILE.depth) : 0,
    region: s.region,
  };
}
