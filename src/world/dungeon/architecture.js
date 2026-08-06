// Coherent, deterministic architecture and room-type planning.
// Architecture is a construction language spanning regions; type is a room-level
// variation inside that language. All probabilities live in architectures.json.

import { hash2i } from "./themes.js";

const DEFAULT_TYPE = { id: "plain", numericId: 1, baseWeight: 1, roleWeights: {}, maxConsecutive: 3 };

function nonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function weighted(entries, roll, fallback = null) {
  const usable = entries.filter(entry => nonNegative(entry.weight) > 0);
  const total = usable.reduce((sum, entry) => sum + nonNegative(entry.weight), 0);
  if (!usable.length || total <= 0) return fallback;
  let cursor = roll * total;
  for (const entry of usable) {
    cursor -= nonNegative(entry.weight);
    if (cursor < 0) return entry.value;
  }
  return usable[usable.length - 1].value;
}

function roomRoll(room, roomIndex, seed, salt) {
  return hash2i(Math.floor(room.cx) + roomIndex * 17 + salt, Math.floor(room.cy) + roomIndex * 31, seed + salt);
}

function architectureWeight(architecture, room) {
  const zone = architecture.zoneWeights?.[room.zone] ?? 1;
  const role = architecture.roleWeights?.[room.role] ?? 1;
  return nonNegative(architecture.weight, 1) * nonNegative(zone, 1) * nonNegative(role, 1);
}

function chooseArchitecture(architectures, room, roomIndex, seed, salt, excludeId = null) {
  return weighted(architectures
    .filter(architecture => architecture.id !== excludeId)
    .map(architecture => ({ value: architecture, weight: architectureWeight(architecture, room) })),
  roomRoll(room, roomIndex, seed, salt), architectures[0] || null);
}

function typeWeight(type, architecture, room) {
  const architectureWeightForType = architecture.typeWeights?.[type.id] ?? 1;
  const globalRoleWeight = type.roleWeights?.[room.role] ?? 1;
  const architectureRoleWeight = architecture.roleTypeWeights?.[room.role]?.[type.id] ?? 1;
  return nonNegative(type.baseWeight, 1) * nonNegative(architectureWeightForType, 1) * nonNegative(globalRoleWeight, 1) * nonNegative(architectureRoleWeight, 1);
}

function mergeMultipliers(...sources) {
  const keys = new Set(sources.flatMap(source => Object.keys(source || {})));
  return Object.fromEntries([...keys].map(key => [key, sources.reduce((value, source) => value * nonNegative(source?.[key], 1), 1)]));
}

function applyRoomDefinition(room, architecture, type) {
  room.architecture = architecture.id;
  room.architectureId = architecture.numericId;
  room.architectureName = architecture.name;
  room.architectureType = type.id;
  room.typeId = type.numericId;
  room.typeName = type.name;
  room.paletteAccents = architecture.palette?.accentRamps || [];
  room.modifierMultipliers = mergeMultipliers(architecture.modifierMultipliers, type.modifierMultipliers);
  room.decoChances = { ...(architecture.decoChances || {}) };
  for (const [key, value] of Object.entries(type.decoMultipliers || {})) {
    room.decoChances[key] = (room.decoChances[key] ?? 0) * nonNegative(value, 1);
  }
  room.architectureMaterials = architecture.materials?.[type.id] || architecture.materials?.plain || null;
  room.architectureStoryTags = [...new Set([...(architecture.storyTags || []), ...(type.storyTags || [])])];
  if (type.structural?.vaultType != null) room.vaultType = type.structural.vaultType;
}

/**
 * Assign a small number of contiguous architecture regions, followed by
 * role-aware room types. Mutates rooms and returns an inspectable summary.
 */
export function assignArchitecturePlan(rooms, mainPath, seed, architectureConfig) {
  const config = architectureConfig || {};
  const selection = config.selection || {};
  const activeIds = new Set(selection.activeArchitectureIds || []);
  const configuredArchitectures = (config.architectures || [])
    .filter(architecture => architecture?.id && (!activeIds.size || activeIds.has(architecture.id)))
    .map((architecture, index) => ({ ...architecture, numericId: architecture.numericId ?? index + 1 }));
  const forcedArchitectureId = selection.forcedArchitectureId || null;
  const forcedArchitecture = forcedArchitectureId
    ? configuredArchitectures.find(architecture => architecture.id === forcedArchitectureId)
    : null;
  const architectures = forcedArchitecture ? [forcedArchitecture] : configuredArchitectures;
  const types = (config.types?.length ? config.types : [DEFAULT_TYPE])
    .map((type, index) => ({ ...DEFAULT_TYPE, ...type, numericId: type.numericId ?? index + 1 }));
  if (!architectures.length) return { enabled: false, dominant: null, regions: [], architectureCount: 0, typeCount: types.length };

  const path = mainPath?.length ? mainPath : rooms.map((_, index) => index);
  const firstRoom = rooms[path[0]] || rooms[0];
  const dominant = chooseArchitecture(architectures, firstRoom, path[0] || 0, seed, 101);
  const maxArchitectures = Math.max(1, Math.min(architectures.length, selection.maxArchitecturesPerLevel ?? 2));
  const transitionChance = Math.max(0, Math.min(1, selection.transitionChance ?? 0.16));
  const minRegionRooms = Math.max(1, selection.minRegionRooms ?? 3);
  const allowed = [dominant];
  let current = dominant;
  let regionLength = 0;
  const regions = [];

  for (let pathPosition = 0; pathPosition < path.length; pathPosition++) {
    const roomIndex = path[pathPosition];
    const room = rooms[roomIndex];
    const canTransition = regionLength >= minRegionRooms && allowed.length < maxArchitectures && pathPosition < path.length - 1;
    if (canTransition && roomRoll(room, roomIndex, seed, 211) < transitionChance) {
      const next = chooseArchitecture(architectures, room, roomIndex, seed, 223, current.id);
      if (next && next.id !== current.id) {
        current = next;
        allowed.push(next);
        regionLength = 0;
      }
    }
    if (!regions.length || regions[regions.length - 1].architecture !== current.id) {
      regions.push({ architecture: current.id, numericId: current.numericId, startPathIndex: pathPosition, roomIndices: [] });
    }
    regions[regions.length - 1].roomIndices.push(roomIndex);
    room._architectureDef = current;
    regionLength++;
  }

  // Side rooms tell the story of their hub. Rare exceptions may use one of the
  // already introduced languages, never an unrelated one-off architecture.
  const sideInheritChance = Math.max(0, Math.min(1, selection.sideBranchInheritChance ?? 0.92));
  rooms.forEach((room, roomIndex) => {
    if (room._architectureDef) return;
    const parent = rooms[room.hubParent];
    if (parent?._architectureDef && roomRoll(room, roomIndex, seed, 307) < sideInheritChance) {
      room._architectureDef = parent._architectureDef;
    } else {
      room._architectureDef = chooseArchitecture(allowed, room, roomIndex, seed, 313) || dominant;
    }
  });

  const persistence = Math.max(0, Math.min(1, selection.typeAdjacencyPersistence ?? 0.42));
  const sideTypeInherit = Math.max(0, Math.min(1, selection.sideBranchTypeInheritChance ?? 0.48));
  let previousType = null;
  let consecutive = 0;

  for (let pathPosition = 0; pathPosition < path.length; pathPosition++) {
    const roomIndex = path[pathPosition];
    const room = rooms[roomIndex];
    const architecture = room._architectureDef;
    let type = null;
    const canPersist = previousType && consecutive < (previousType.maxConsecutive ?? 3) && typeWeight(previousType, architecture, room) > 0;
    if (canPersist && roomRoll(room, roomIndex, seed, 401) < persistence) type = previousType;
    if (!type) {
      const candidates = types.map(candidate => ({
        value: candidate,
        weight: previousType?.id === candidate.id && consecutive >= (candidate.maxConsecutive ?? 3) ? 0 : typeWeight(candidate, architecture, room)
      }));
      const fallbackType = candidates.some(candidate => candidate.weight > 0)
        ? (types.find(candidate => candidate.id !== previousType?.id) || types[0])
        : (previousType || types[0]);
      type = weighted(candidates, roomRoll(room, roomIndex, seed, 409), fallbackType);
    }
    consecutive = previousType?.id === type.id ? consecutive + 1 : 1;
    previousType = type;
    room._typeDef = type;
    applyRoomDefinition(room, architecture, type);
  }

  rooms.forEach((room, roomIndex) => {
    if (room._typeDef) return;
    const parent = rooms[room.hubParent];
    const architecture = room._architectureDef;
    let type = null;
    if (parent?._typeDef && roomRoll(room, roomIndex, seed, 503) < sideTypeInherit && typeWeight(parent._typeDef, architecture, room) > 0) {
      type = parent._typeDef;
    }
    if (!type) type = weighted(types.map(candidate => ({ value: candidate, weight: typeWeight(candidate, architecture, room) })), roomRoll(room, roomIndex, seed, 509), types[0]);
    room._typeDef = type;
    applyRoomDefinition(room, architecture, type);
  });

  for (const room of rooms) {
    delete room._architectureDef;
    delete room._typeDef;
  }
  return {
    enabled: true,
    forced: !!forcedArchitecture,
    dominant: dominant.id,
    dominantNumericId: dominant.numericId,
    dominantPalette: dominant.palette || null,
    regions,
    architectureCount: allowed.length,
    typeCount: types.length,
    architectures: allowed.map(({ id, numericId, name }) => ({ id, numericId, name })),
    types: types.map(({ id, numericId, name }) => ({ id, numericId, name })),
  };
}
