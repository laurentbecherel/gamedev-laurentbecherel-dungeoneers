import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateDungeon } from '../../world/dungeon/generator.js';
import { generateMaterialArrayData } from '../../world/materials.js';
import {
  FEATURE_CONNECTION,
  FEATURE_FILL,
  FEATURE_FLAGS,
  FEATURE_KIND,
  decodeFeatureCell,
  packFeatureCell,
  sampleChannelProfile,
  sampleWalkSurface,
} from '../../world/structural-features.js';

const config = {
  generator: {
    mapW: 40, mapH: 40, roomTarget: 14, mainPathRooms: 8, roomAttempts: 200,
    roomSizeMin: 4, roomSizeMax: 8, mainPathRoomSizeBonus: 1, seed: 1337,
    loopExtraChance: 0.02, flattenStartRadius: 2,
  },
  boundaryWallId: 1,
  structuralFeatures: {
    enabled: true,
    profiles: { stone_channel: { width: 0.75, depth: 0.2, bankWidth: 0.12, waterDepth: 0.1 } },
    generator: {
      prototypeGuarantee: 1, maxPerLevel: 1, minRoomSpan: 5,
      preferredRoles: ['hub', 'hall', 'guardian', 'shrine'], excludedRoles: ['entrance', 'exit'],
    },
  },
};

test('structural cell packing round-trips exact fields', () => {
  const word = packFeatureCell(
    FEATURE_KIND.CHANNEL_FLOOR,
    FEATURE_CONNECTION.EAST | FEATURE_CONNECTION.WEST,
    17,
    FEATURE_FILL.WATER,
    FEATURE_FLAGS.FLOW_REVERSED | FEATURE_FLAGS.DISABLE_COSMETIC_PUDDLE,
  );
  assert.deepEqual(decodeFeatureCell(word), {
    kind: FEATURE_KIND.CHANNEL_FLOOR,
    connections: FEATURE_CONNECTION.EAST | FEATURE_CONNECTION.WEST,
    profile: 17,
    fill: FEATURE_FILL.WATER,
    flags: FEATURE_FLAGS.FLOW_REVERSED | FEATURE_FLAGS.DISABLE_COSMETIC_PUDDLE,
  });
});

test('channel profile preserves shoulders and reaches configured bed depth', () => {
  const p = { width: 0.75, depth: 0.2, bankWidth: 0.12 };
  assert.equal(sampleChannelProfile(0.02, 0.3, p).height, 0.3);
  assert(Math.abs(sampleChannelProfile(0.5, 0.3, p).height - 0.1) < 1e-9);
  const bank = sampleChannelProfile(0.15, 0.3, p);
  assert.equal(bank.region, 'bank');
  assert(bank.height < 0.3 && bank.height > 0.1);
});

test('sewer generation is deterministic, connected, and leaves grid untouched', async () => {
  const without = await generateDungeon({ ...config, structuralFeatures: { enabled: false } }, 1337);
  const a = await generateDungeon(config, 1337);
  const b = await generateDungeon(config, 1337);
  assert.equal(a.features.length, 1, 'prototype guarantees one valid sewer track');
  assert.deepEqual(a.features, b.features);
  assert.deepEqual(Array.from(a.featureCells), Array.from(b.featureCells));
  assert.deepEqual(Array.from(a.grid), Array.from(without.grid), 'structural feature does not alter walkability grid');

  const feature = a.features[0];
  assert(feature.floorCells.length >= 5);
  assert.equal(feature.endpoints.length, 2);
  for (const index of feature.floorCells) {
    assert.equal(a.grid[index], 0, 'channel stays on floor cells');
    const cell = decodeFeatureCell(a.featureCells[index]);
    assert.equal(cell.kind, FEATURE_KIND.CHANNEL_FLOOR);
    assert.equal(cell.fill, FEATURE_FILL.WATER);
  }
  for (const endpoint of feature.endpoints) {
    assert(a.grid[endpoint.cellIndex] > 0, 'grille remains an opaque wall cell');
    assert.equal(decodeFeatureCell(a.featureCells[endpoint.cellIndex]).kind, FEATURE_KIND.ROUND_GRILLE_WALL);
  }
  const channelIndices = new Set(feature.floorCells);
  for (const sprite of a.sprites) {
    assert(!channelIndices.has(sprite.tileY * a.w + sprite.tileX), 'structural footprint remains clear of props');
  }
});

test('walk surface follows shoulder, bank, and bed without blocking the cell', async () => {
  const d = await generateDungeon(config, 1337);
  const f = d.features[0];
  const index = f.floorCells[Math.floor(f.floorCells.length / 2)];
  const cx = index % d.w, cy = Math.floor(index / d.w);
  const base = d.floorHeight[index];
  const center = sampleWalkSurface(d, cx + 0.5, cy + 0.5);
  const shoulder = f.axis === 'north-south'
    ? sampleWalkSurface(d, cx + 0.02, cy + 0.5)
    : sampleWalkSurface(d, cx + 0.5, cy + 0.02);
  assert(Math.abs(center.height - (base - 0.2)) < 1e-5);
  assert(Math.abs(shoulder.height - base) < 1e-5);
  assert.equal(center.liquidDepth, 0.1);
  assert.equal(d.grid[index], 0);
});

test('round grille material is an opaque recessed fixture composited over its host wall', async () => {
  const wallConfig = JSON.parse(await readFile(new URL('../../assets/materials/walls.json', import.meta.url), 'utf8'));
  const fixture = wallConfig.materials.find(material => material.name === 'round_sewer_grille');
  assert(fixture, 'fixture material is registered');
  assert.equal(fixture.assignable, false, 'room material assignment must not select fixture layers');

  const arrays = generateMaterialArrayData(
    wallConfig.materials,
    [{ id: 1, type: 'slab', base: [90, 88, 80] }],
    [{ id: 1, type: 'slab', base: [80, 78, 72] }],
    { texSize: 64, walls: {}, floors: {}, ceils: {} },
  );
  const layerPixels = 64 * 64;
  const layer = wallConfig.materials.indexOf(fixture);
  const alpha = [];
  const heights = [];
  for (let i = 0; i < layerPixels; i++) {
    alpha.push(arrays.walls.albedo[(layer * layerPixels + i) * 4 + 3]);
    heights.push(arrays.walls.height[layer * layerPixels + i]);
  }
  assert(alpha.includes(0), 'outside the round fixture preserves the host wall');
  assert(alpha.includes(255), 'the cavity and iron are opaque, never a see-through portal');
  assert(Math.min(...heights) < 20, 'cavity has strong POM recession');
  assert(Math.max(...heights) > 230, 'iron rim has strong POM relief');
});
