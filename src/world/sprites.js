// Dungeon Sprites & Lights Generation — Task 6
// Replaces simplistic items.js with rich sprite-based system.
// Places torches, braziers, lanterns, crystals as PBR billboard sprites owning lights.
// Deterministic given seed + config, wall-anchored Z to avoid floating, organic flicker variation.

import { hash2i } from "./dungeon/themes.js";
import { LIGHT_TYPES } from "./light-types.js";

function makeFallbackRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = Math.imul(s, 1664525) + 1013904223 >>> 0; return s / 0x100000000; };
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function chooseWallOffset(wallAdj, rng) {
  if (!wallAdj || wallAdj.length === 0) return { dir: 'N', ox: 0, oy: -1 };
  const dir = wallAdj[Math.floor(rng() * wallAdj.length)];
  let ox = 0, oy = 0;
  switch (dir) {
    case 'N': oy = -1; break;
    case 'S': oy = 1; break;
    case 'W': ox = -1; break;
    case 'E': ox = 1; break;
    default: break;
  }
  return { dir, ox, oy };
}

function shuffleWithRng(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Weighted pick using rng (not hash) — for sprite type selection per room
function pickWeightedRng(pool, rng) {
  // pool: object { id: weight } or array [{id, weight}]
  const entries = Array.isArray(pool) ? pool : Object.entries(pool).map(([id, w]) => ({ id, weight: w }));
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + (e.weight || 0), 0);
  if (total <= 0) return entries[0].id;
  let r = rng() * total;
  for (const e of entries) {
    r -= (e.weight || 0);
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1].id;
}

// ---- Core generation ----

export function generateDungeonSprites(dungeon, config, rngOverride = null) {
  const seed = dungeon.seed >>> 0;
  const rng = rngOverride || makeFallbackRng(seed + 7919);

  const genCfg = config.generator || {};
  const spritesCfg = config.sprites || config['sprites'] || {};
  const lightingCfg = config.lighting || {};
  const torchColors = config.torchColors || lightingCfg.torchColors || genCfg.torchColors || [
    { r: 1, g: 0.6, b: 0.2, name: "warm" },
    { r: 0.4, g: 0.7, b: 1, name: "cool" },
    { r: 0.3, g: 1, b: 0.4, name: "green" },
    { r: 0.8, g: 0.3, b: 1, name: "purple" },
  ];

  // Max sprites / torches
  const itemsCfg = genCfg.items || config.items || spritesCfg.generation || {};
  const maxSprites = genCfg.maxTorches ?? itemsCfg.maxTorches ?? spritesCfg.generation?.maxTorches ?? 24;
  const minDist = genCfg.minTorchDist ?? itemsCfg.minTorchDist ?? spritesCfg.generation?.minTorchDist ?? 6;
  const corridorBias = genCfg.corridorBias ?? itemsCfg.corridorBias ?? 1.5;
  const torchOffsetScale = genCfg.torchOffset ?? itemsCfg.torchOffset ?? spritesCfg.generation?.torchOffset ?? 0.35;

  // Z anchoring
  const genSpritesMeta = spritesCfg.sprites || [];
  const wallZBase = spritesCfg.generation?.zBase_wall ?? itemsCfg.zBase ?? 0.72;
  const wallZJitter = spritesCfg.generation?.zJitter_wall ?? itemsCfg.zJitter ?? 0.08;
  const floorZBase = spritesCfg.generation?.zBase_floor ?? 0.15;
  const floorZJitter = spritesCfg.generation?.zJitter_floor ?? 0.05;

  const flameMin = spritesCfg.generation?.flameSizeMin ?? itemsCfg.flameSizeMin ?? 0.18;
  const flameRange = spritesCfg.generation?.flameSizeRange ?? itemsCfg.flameSizeRange ?? 0.06;

  // Flicker ranges fallback
  const flickerSpeedMin = itemsCfg.flickerSpeedMin ?? 4.5;
  const flickerSpeedRange = itemsCfg.flickerSpeedRange ?? 4.5;
  const flickerAmountMin = itemsCfg.flickerAmountMin ?? 0.12;
  const flickerAmountRange = itemsCfg.flickerAmountRange ?? 0.18;

  const w = dungeon.w, h = dungeon.h, grid = dungeon.grid;
  const rooms = dungeon.rooms || [];

  // --- Collect candidates: floor cells adjacent to wall ---
  const candidates = [];
  const roomIndexMap = new Int16Array(w * h);
  roomIndexMap.fill(-1);
  rooms.forEach((r, ri) => {
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) {
      const x = r.x + dx, y = r.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      roomIndexMap[y * w + x] = ri;
    }
  });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (grid[idx] !== 0) continue; // need floor
      // Structural floor features own the tile footprint. Keep wall torches,
      // braziers, and other billboards out of channels/pits/lava recipes.
      if (((dungeon.featureCells?.[idx] ?? 0) & 0xff) !== 0) continue;
      // avoid start too close
      if (dungeon.startX != null) {
        const ds = Math.hypot((x + 0.5) - dungeon.startX, (y + 0.5) - dungeon.startY);
        if (ds < 2.2) continue;
      }
      const wallAdj = [];
      if (x > 0 && grid[y * w + (x - 1)] !== 0) wallAdj.push('W');
      if (x < w - 1 && grid[y * w + (x + 1)] !== 0) wallAdj.push('E');
      if (y > 0 && grid[(y - 1) * w + x] !== 0) wallAdj.push('N');
      if (y < h - 1 && grid[(y + 1) * w + x] !== 0) wallAdj.push('S');
      if (wallAdj.length === 0) continue;

      const roomIdx = roomIndexMap[idx];
      const insideRoom = roomIdx >= 0 ? rooms[roomIdx] : null;

      let perimeterDist = 999;
      if (insideRoom) {
        const dx = Math.min(x - insideRoom.x, insideRoom.x + insideRoom.w - 1 - x);
        const dy = Math.min(y - insideRoom.y, insideRoom.y + insideRoom.h - 1 - y);
        perimeterDist = Math.min(dx, dy);
      }

      candidates.push({
        x, y,
        cx: x + 0.5,
        cy: y + 0.5,
        idx,
        wallAdj,
        insideRoom,
        roomIdx,
        isCorridor: !insideRoom,
        perimeterDist,
        zone: insideRoom?.zone || null,
        role: insideRoom?.role || (insideRoom ? 'hall' : 'corridor'),
      });
    }
  }

  // Deterministic sort for cross-engine stability
  candidates.sort((a, b) => hash2i(a.idx, seed, 1) - hash2i(b.idx, seed, 1));

  // ---- Sprite definition lookup ----
  const spriteDefsById = new Map();
  for (const def of genSpritesMeta) spriteDefsById.set(def.id, def);

  // Pools for picking (future-proof: zone/role)
  const zonePools = spritesCfg.pools?.zone || {};
  const rolePools = spritesCfg.pools?.role || {};

  function pickSpriteIdForCandidate(cand) {
    // Try role pool first, then zone pool, then weighted global fallback torch_wall > brazier
    const role = cand.role || 'corridor';
    const zone = cand.zone || 'Depths';

    // role-specific
    if (rolePools[role]) {
      const pick = pickWeightedRng(rolePools[role], rng);
      if (pick && spriteDefsById.has(pick)) return pick;
    }
    if (zonePools[zone]) {
      const pick = pickWeightedRng(zonePools[zone], rng);
      if (pick && spriteDefsById.has(pick)) return pick;
    }

    // placement heuristic: corridor prefers torch_wall
    if (cand.isCorridor) return 'torch_wall';

    // room interior center bias -> brazier if available else torch
    if (cand.perimeterDist > 1) {
      // prefer brazier in treasure/shrine/guardian
      if (cand.role === 'treasure' || cand.role === 'shrine' || cand.role === 'guardian') {
        if (spriteDefsById.has('brazier_floor') && rng() < 0.65) return 'brazier_floor';
      }
      if (spriteDefsById.has('brazier_floor') && rng() < 0.35) return 'brazier_floor';
    }

    // secret likes crystal
    if (cand.role === 'secret' && spriteDefsById.has('crystal_small') && rng() < 0.5) return 'crystal_small';

    // Default: torch_wall if exists else first def
    if (spriteDefsById.has('torch_wall')) return 'torch_wall';
    return genSpritesMeta[0]?.id || 'torch_wall';
  }

  // ---- Placement ----
  const placedPositions = [];
  const placedSprites = [];
  const minDistSq = minDist * minDist;

  function tooClose(x, y) {
    for (const p of placedPositions) {
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy < minDistSq) return true;
    }
    return false;
  }

  // Helper to build sprite from candidate + spriteId
  function buildSpriteFromCand(cand, spriteIndex) {
    const spriteId = pickSpriteIdForCandidate(cand);
    const def = spriteDefsById.get(spriteId) || null;

    const isWall = def?.placement?.wallMounted ?? (spriteId === 'torch_wall');
    const isFloor = def?.placement?.floorStanding ?? (spriteId === 'brazier_floor' || spriteId === 'crystal_small');

    const offset = isWall ? chooseWallOffset(cand.wallAdj, rng) : { dir: null, ox: 0, oy: 0 };
    const offScale = def?.placement?.torchOffset ?? torchOffsetScale;
    const tx = cand.cx + offset.ox * offScale;
    const ty = cand.cy + offset.oy * offScale;

    if (tooClose(tx, ty)) return null;

    // Anchored Z
    const tileFloorH = 0;
    const zBase = isWall ? wallZBase : (isFloor ? floorZBase : wallZBase * 0.6);
    const zJit = isWall ? wallZJitter : floorZJitter;
    const z = tileFloorH + zBase + (rng() - 0.5) * zJit;

    // Color from torchColors palette + jitter
    const colorPick = torchColors[Math.floor(rng() * torchColors.length)];
    const baseC = Array.isArray(colorPick.color) ? colorPick.color : [colorPick.r ?? 1, colorPick.g ?? 0.6, colorPick.b ?? 0.2];
    const jitter = (rng() - 0.5) * 0.08;
    let col = [
      Math.min(1, (baseC[0] ?? 1) + jitter),
      Math.min(1, (baseC[1] ?? 0.6) + jitter * 0.6),
      Math.min(1, Math.max(0.15, (baseC[2] ?? 0.2) + jitter * 0.4)),
    ];

    // Override crystal colors from def if crystal
    if (def?.lightProfile?.color) {
      // blend 50% def color + 50% picked to preserve variation but keep category tint
      const dc = def.lightProfile.color;
      col = [
        col[0] * 0.4 + dc[0] * 0.6,
        col[1] * 0.4 + dc[1] * 0.6,
        col[2] * 0.4 + dc[2] * 0.6,
      ];
    }

    // Intensity / radius from def or fallback
    const lp = def?.lightProfile || {};
    const intMin = lp.intensity?.min ?? (colorPick.intensity ?? 3.5);
    const intMax = lp.intensity?.max ?? (colorPick.intensity ?? 4.5);
    const intRange = intMax - intMin;
    const intensity = intMin + rng() * Math.max(0.1, intRange) + (rng() - 0.5) * 0.2;

    const radMin = lp.radius?.min ?? (colorPick.radius ?? 9);
    const radMax = lp.radius?.max ?? (colorPick.radius ?? 11);
    const radRange = radMax - radMin;
    const radius = radMin + rng() * Math.max(0.1, radRange) + (rng() - 0.5) * 0.3;

    const fMin = lp.flicker?.speedMin ?? flickerSpeedMin;
    const fRange = (lp.flicker?.speedMax ?? (fMin + flickerSpeedRange)) - fMin;
    const faMin = lp.flicker?.amountMin ?? flickerAmountMin;
    const faRange = (lp.flicker?.amountMax ?? (faMin + flickerAmountRange)) - faMin;

    const flickerSpeed = fMin + rng() * Math.max(0, fRange);
    const flickerAmount = faMin + rng() * Math.max(0, faRange);
    const phase = rng() * Math.PI * 2;

    // Light type: from def profile or infer from role/arch
    let lightType = lp.type || 'flicker';
    let dir = lp.spot?.dir || [0, 0, -1];
    let coneInner = lp.spot?.coneInner ?? 0.85;
    let coneOuter = lp.spot?.coneOuter ?? 0.65;
    let pulseSpeed = lp.pulse?.speedMin ?? lp.pulse?.speed ?? 0;
    let pulseAmt = lp.pulse?.amountMin ?? lp.pulse?.amount ?? 0;
    // For pulse varying: if speedMin/Max present, randomize
    if (lp.pulse?.speedMin != null && lp.pulse?.speedMax != null) {
      pulseSpeed = lp.pulse.speedMin + rng() * (lp.pulse.speedMax - lp.pulse.speedMin);
    }
    if (lp.pulse?.amountMin != null && lp.pulse?.amountMax != null) {
      pulseAmt = lp.pulse.amountMin + rng() * (lp.pulse.amountMax - lp.pulse.amountMin);
    }

    let noShadow = lp.flags?.noShadow ?? false;

    // Role-based overrides for readability even if arch currently single
    const role = cand.role || 'corridor';
    if (role === 'treasure' || role === 'shrine') {
      if (lightType !== 'pulse' && rng() < 0.3) { lightType = 'pulse'; pulseSpeed = 2.5 + rng() * 0.5; pulseAmt = 0.35 + rng() * 0.15; noShadow = true; }
    } else if (role === 'guardian') {
      if (rng() < 0.4) { lightType = 'spot'; }
    } else if (role === 'secret') {
      // dimmer
      // intensity *0.7 handled later? Keep factor here
    }

    // For crystal override: force pulse + noShadow + blue tint already done
    if (spriteId === 'crystal_small') {
      lightType = 'pulse';
      noShadow = true;
    }

    const spriteObj = {
      id: `spr_${spriteIndex}_${spriteId}_${cand.x}_${cand.y}`,
      spriteId,
      type: spriteId, // alias for backward compat
      x: tx,
      y: ty,
      z,
      wallDir: offset.dir,
      tileX: cand.x,
      tileY: cand.y,
      floorH: tileFloorH,
      color: col,
      lightColor: col.slice(),
      intensity,
      radius,
      flickerSpeed,
      flickerAmount,
      phase,
      roomIndex: cand.roomIdx,
      zone: cand.zone,
      role,
      lightType,
      dir,
      coneInner,
      coneOuter,
      pulseSpeed,
      pulseAmount: pulseAmt,
      noShadow,
      flameSize: flameMin + rng() * flameRange,
      emitsLight: def?.emitsLight ?? true,
      material: def?.material || null,
    };

    return spriteObj;
  }

  // ---- 1. Per-room torches/braziers ----
  for (let ri = 0; ri < rooms.length; ri++) {
    const room = rooms[ri];
    // candidates inside this room
    const perRoomCands = candidates.filter(c => c.roomIdx === ri);

    if (perRoomCands.length === 0) continue;

    // Separate wall-adjacent vs center
    const wallCands = perRoomCands.filter(c => c.perimeterDist <= 1);
    const centerCands = perRoomCands.filter(c => c.perimeterDist > 1);

    // Order deterministic but shuffled via rng for variation
    shuffleWithRng(wallCands, rng);
    shuffleWithRng(centerCands, rng);

    const isFirstRoom = ri === 0; // spawn room
    const numTarget = isFirstRoom ? 1 : (1 + (rng() < 0.5 ? 0 : 1)); // 1-2

    let placedInRoom = 0;

    // Prefer wall torches for most rooms
    for (const cand of wallCands) {
      if (placedInRoom >= numTarget) break;
      if (placedSprites.length >= maxSprites) break;
      const spr = buildSpriteFromCand(cand, placedSprites.length);
      if (!spr) continue;
      placedPositions.push({ x: spr.x, y: spr.y });
      placedSprites.push(spr);
      placedInRoom++;
    }

    // Maybe add a brazier in center for special roles if we still have budget for this room
    if (!isFirstRoom && placedInRoom < numTarget + 1 && (room.role === 'treasure' || room.role === 'shrine' || room.role === 'guardian' || room.role === 'armory')) {
      if (centerCands.length > 0 && placedSprites.length < maxSprites) {
        const cand = centerCands[Math.floor(rng() * centerCands.length)];
        const spr = buildSpriteFromCand(cand, placedSprites.length);
        if (spr) {
          placedPositions.push({ x: spr.x, y: spr.y });
          placedSprites.push(spr);
          placedInRoom++;
        }
      }
    }
  }

  // ---- 2. Corridor sprites ----
  const corridorCands = candidates.filter(c => c.isCorridor);
  shuffleWithRng(corridorCands, rng);
  const corridorFactor = itemsCfg.corridorTargetFactor ?? 0.6;
  const corridorMin = itemsCfg.corridorTargetMin ?? 2;
  const corridorTarget = Math.max(corridorMin, Math.floor(rooms.length * corridorFactor));

  let corridorPlaced = 0;
  for (const cand of corridorCands) {
    if (corridorPlaced >= corridorTarget) break;
    if (placedSprites.length >= maxSprites) break;
    // corridor bias probabilistic roll
    const roll = hash2i(cand.idx, seed, 2); // 0..1
    if (roll > Math.min(1, 1.0 / corridorBias + 0.3)) {
      // still need to occasionally allow, but bias reduces acceptance
      // Use weight check: if corridorBias high, more accepted. So invert.
    }
    // Simpler: if corridorBias>1, rooms preferred; but we are in corridor list, so reduce chance if bias low?
    // Keep original logic: acceptance = weight / bias. Here weight=1 for corridor? Actually use 1.
    // To keep many corridors, we accept with probability 0.7 if bias 1.5.
    if (rng() > 0.7) continue;

    const spr = buildSpriteFromCand(cand, placedSprites.length);
    if (!spr) continue;
    placedPositions.push({ x: spr.x, y: spr.y });
    placedSprites.push(spr);
    corridorPlaced++;
  }

  // ---- 3. Fill-up if too few (<4) from general pool ----
  if (placedSprites.length < 4) {
    const general = [...candidates];
    shuffleWithRng(general, rng);
    for (const cand of general) {
      if (placedSprites.length >= 6) break;
      const spr = buildSpriteFromCand(cand, placedSprites.length);
      if (!spr) continue;
      placedPositions.push({ x: spr.x, y: spr.y });
      placedSprites.push(spr);
    }
  }

  // Cap
  if (placedSprites.length > maxSprites) {
    placedSprites.length = maxSprites;
  }

  // Build lights array from sprites
  const lights = placedSprites.filter(s => s.emitsLight !== false).map(s => ({
    id: s.id,
    pos: [s.x, s.y, s.z],
    color: s.color.slice(),
    intensity: s.intensity,
    radius: s.radius,
    flickerSpeed: s.flickerSpeed,
    flickerAmount: s.flickerAmount,
    phase: s.phase,
    type: s.lightType,
    dir: s.dir.slice(),
    coneInner: s.coneInner,
    coneOuter: s.coneOuter,
    pulseSpeed: s.pulseSpeed,
    pulseAmount: s.pulseAmount,
    noShadow: s.noShadow,
    spriteId: s.spriteId,
    zone: s.zone,
    role: s.role,
  }));

  return { sprites: placedSprites, lights };
}

// Shim for backward compat with old items.js API
export function generateDungeonItems(dungeon, config, rng = null, seed = null) {
  const s = seed ?? dungeon.seed;
  const r = rng || makeFallbackRng(s + 9137);
  const { sprites, lights } = generateDungeonSprites(dungeon, config, r);
  // Old API returned items as torch list
  const items = sprites.map(spr => ({
    x: spr.x,
    y: spr.y,
    z: spr.z,
    type: 'torch',
    color: { r: spr.color[0], g: spr.color[1], b: spr.color[2], name: spr.spriteId },
    intensity: spr.intensity,
    radius: spr.radius,
    flickerSpeed: spr.flickerSpeed,
    flickerAmount: spr.flickerAmount,
    phase: spr.phase,
    id: spr.id,
    spriteId: spr.spriteId,
    wallDir: spr.wallDir,
    tileX: spr.tileX,
    tileY: spr.tileY,
    roomIndex: spr.roomIndex,
  }));
  return { items, lights, sprites };
}
