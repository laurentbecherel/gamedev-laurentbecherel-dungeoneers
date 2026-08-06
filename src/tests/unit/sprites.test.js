// Sprites generation unit tests — Task 6 — comprehensive
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2i } from '../../world/dungeon/themes.js';
import { SpriteEntity, TorchSprite } from '../../entities/sprite-entity.js';
import { registerSprite, getSprite, listSprites, hasSprite } from '../../render/sprite-atlas.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const genCfgRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/gameplay/generator.json'), 'utf8'));
  const lightingRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/lighting/lighting.json'), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/lighting/sprites.json'), 'utf8')); } catch {}
  const fixturesRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/lighting/fixtures.json'), 'utf8'));
  const renderingRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/rendering/rendering.json'), 'utf8'));
  return { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, fixtures: fixturesRaw, rendering: renderingRaw, torchColors: genCfgRaw.torchColors || lightingRaw.torchColors };
}

test('hash2i deterministic same input same output, different inputs different', () => {
  const a = hash2i(1, 2);
  const b = hash2i(1, 2);
  const c = hash2i(2, 1);
  const d = hash2i(1, 3);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.ok(a >= 0 && a <= 1, 'normalized 0..1');
});

test('SpriteEntity basics', () => {
  const e = new SpriteEntity({ x: 1, y: 2, z: 0.5, spriteId: 'torch_wall', scale: 1.2 });
  assert.equal(e.x, 1);
  assert.equal(e.y, 2);
  assert.equal(e.getSpriteId(), 'torch_wall');
  assert.equal(e.getFrame(), 0);
  e.update(0.1);
  assert.ok(e.time > 0);
  assert.ok(e.distanceTo(1, 2) < 0.001);
  const wh = e.getWorldHeight({ worldHeight: 0.6 });
  assert.ok(Math.abs(wh - 0.72) < 0.001);
  const ww = e.getWorldWidth({ worldHeight: 0.6, worldWidthFactor: 0.5 });
  assert.ok(ww > 0);
  assert.ok(ww < wh, 'width factor <1 gives narrower width than height');
});

test('TorchSprite toLightDesc and emitsLight', () => {
  const t = new TorchSprite({ x: 2, y: 3, z: 0.7, spriteId: 'torch_wall', color: [1, 0.6, 0.2], intensity: 4, radius: 10, flickerSpeed: 6, flickerAmount: 0.2, phase: 0.3, tileX: 2, tileY: 3, roomIndex: 1 });
  assert.ok(t.emitsLight);
  const ld = t.toLightDesc();
  assert.deepEqual(ld.pos, [2, 3, 0.7]);
  assert.equal(ld.type, 'flicker');
  assert.ok(ld.color.length === 3);
  assert.ok(ld.intensity > 0 && ld.radius > 0);
  assert.ok(typeof ld.phase === 'number');
  assert.ok(ld.spriteId === 'torch_wall');
});

test('sprite-atlas registry register/get/list/has', () => {
  const id = 'test_dummy_' + Date.now();
  registerSprite(id, {
    id,
    path: './assets/sprites/test.png',
    cols: 1, rows: 1, count: 1, cellW: 64, cellH: 64, cropX: 0, cropY: 0, cropW: 64, cropH: 64,
    worldHeight: 0.5, worldWidthFactor: 0.5,
    material: { normalStrength: 2.2, baseRoughness: 0.85, baseMetal: 0 }
  });
  const meta = getSprite(id);
  assert.ok(meta);
  assert.equal(meta.id, id);
  assert.ok(listSprites().includes(id));
  assert.ok(hasSprite(id));
  assert.equal(getSprite('nonexistent_xyz'), null);
});

test('generateDungeonSprites deterministic same seed same sprites/lights', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();

  const a = await generateDungeon(cfg, 777);
  const b = await generateDungeon(cfg, 777);
  assert.ok(a.sprites && a.sprites.length > 0, 'should have sprites');
  assert.ok(a.lights && a.lights.length > 0, 'should have lights');
  assert.equal(a.sprites.length, b.sprites.length, 'sprite count deterministic');
  assert.equal(a.lights.length, b.lights.length, 'light count deterministic');
  for (let i = 0; i < a.sprites.length; i++) {
    const sA = a.sprites[i], sB = b.sprites[i];
    assert.equal(sA.x, sB.x, `sprite ${i} x same`);
    assert.equal(sA.y, sB.y, `sprite ${i} y same`);
    assert.equal(sA.z, sB.z, `sprite ${i} z same`);
    assert.equal(sA.spriteId, sB.spriteId, `spriteId same`);
    assert.equal(sA.phase, sB.phase, `phase same`);
    assert.equal(sA.color[0], sB.color[0], `color r same`);
    assert.equal(sA.intensity, sB.intensity, `intensity same`);
  }
  for (let i = 0; i < a.lights.length; i++) {
    const lA = a.lights[i], lB = b.lights[i];
    assert.deepEqual(lA.pos, lB.pos, `light ${i} pos same`);
    assert.equal(lA.phase, lB.phase, `light ${i} phase same`);
  }
});

test('generateDungeon different seeds produce valid but different placements', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const a = await generateDungeon(cfg, 111);
  const b = await generateDungeon(cfg, 222);
  assert.ok(a.sprites.length > 0 && b.sprites.length > 0);
  // Most seeds produce different positions, but allow same count sometimes; check at least one sprite differs position
  let diffFound = a.sprites.length !== b.sprites.length;
  if (!diffFound) {
    for (let i = 0; i < a.sprites.length; i++) {
      if (a.sprites[i].x !== b.sprites[i].x || a.sprites[i].y !== b.sprites[i].y) { diffFound = true; break; }
    }
  }
  assert.ok(diffFound, 'different seeds should differ');
  // Both must respect bounds individually
  for (const d of [a, b]) {
    for (const s of d.sprites) {
      assert.ok(s.x >= -1 && s.x <= d.w + 1, 'x roughly in bounds');
      assert.ok(s.y >= -1 && s.y <= d.h + 1, 'y roughly in bounds');
    }
  }
});

test('sprites respect bounds and min distance', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const genCfgRaw = cfg.generator;
  const d = await generateDungeon(cfg, 123);
  const minDist = genCfgRaw.items?.minTorchDist ?? genCfgRaw.minTorchDist ?? 3.5;
  const minSq = (minDist - 0.5) * (minDist - 0.5);
  assert.ok(d.sprites.length >= 4, `should have at least 4 sprites, got ${d.sprites.length}`);
  const maxTorches = genCfgRaw.items?.maxTorches ?? genCfgRaw.maxTorches ?? 24;
  assert.ok(d.sprites.length <= maxTorches, `should respect maxTorches ${maxTorches}, got ${d.sprites.length}`);
  for (let i = 0; i < d.sprites.length; i++) {
    const s = d.sprites[i];
    assert.ok(s.x >= 0 && s.x < d.w, `sprite ${i} x in bounds`);
    assert.ok(s.y >= 0 && s.y < d.h, `sprite ${i} y in bounds`);
    assert.ok(s.z >= -1 && s.z <= 3, `sprite ${i} z sane`);
    assert.ok(s.intensity > 0 && s.radius > 0, `intensity/radius >0`);
    assert.ok(s.color[0] >= 0 && s.color[0] <= 1.1, `color r 0..1`);
    assert.ok(s.color[1] >= 0 && s.color[1] <= 1.1, `color g 0..1`);
    assert.ok(s.color[2] >= 0 && s.color[2] <= 1.1, `color b 0..1`);
    assert.ok(s.spriteId, `has spriteId`);
    for (let j = i + 1; j < d.sprites.length; j++) {
      const s2 = d.sprites[j];
      const dx = s.x - s2.x, dy = s.y - s2.y;
      const d2 = dx * dx + dy * dy;
      assert.ok(d2 >= minSq || d2 < 0.01, `sprites ${i},${j} too close ${Math.sqrt(d2)} < ${minDist}`);
    }
  }
});

test('sprites anchoring to floorHeight prevents floating', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const d = await generateDungeon(cfg, 42);
  for (const s of d.sprites) {
    const idx = s.tileY * d.w + s.tileX;
    if (idx < 0 || idx >= d.floorHeight.length) continue;
    const floorH = d.floorHeight[idx] ?? 0;
    assert.ok(s.z >= floorH - 0.15, `sprite z ${s.z} should be >= floorH ${floorH} -0.15`);
    assert.ok(s.z <= floorH + 1.6, `sprite z ${s.z} should be <= floorH+1.6, floorH=${floorH}`);
    if (s.floorH !== undefined) assert.equal(s.floorH, floorH);
  }
});

test('contact jitter settings do not shift fixture type or tile RNG', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const { generateDungeonSprites } = await import('../../world/sprites.js');
  const cfg = await loadConfig();
  const dungeon = await generateDungeon(cfg, 777);
  const zeroJitter = structuredClone(cfg);
  const tinyJitter = structuredClone(cfg);
  for (const def of zeroJitter.fixtures.fixtures) def.placement.verticalJitter = 0;
  for (const def of tinyJitter.fixtures.fixtures) def.placement.verticalJitter = Number.EPSILON;
  const signature = result => result.sprites.map(({ spriteId, tileX, tileY, wallDir }) => ({ spriteId, tileX, tileY, wallDir }));
  assert.deepEqual(
    signature(generateDungeonSprites(dungeon, zeroJitter)),
    signature(generateDungeonSprites(dungeon, tinyJitter)),
    'disabling visual Z jitter must not shift the seeded placement/type stream',
  );
});

test('generated fixtures touch their authored wall, floor or ceiling anchors', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const fixtureById = new Map(cfg.fixtures.fixtures.map(def => [def.id, def]));
  const found = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const d = await generateDungeon(cfg, seed);
    for (const s of d.sprites) {
      const def = fixtureById.get(s.spriteId);
      if (!def) continue;
      found.add(s.spriteId);
      const i = s.tileY * d.w + s.tileX;
      const floor = d.floorHeight[i], ceiling = d.ceilHeight[i];
      const contact = s.z + def.render.worldHeight * (1 - def.render.pivot[1]);
      if (def.placement.anchor === 'floor') assert.ok(Math.abs(contact - (floor + def.placement.clearance)) < 1e-6, `${s.spriteId} floor contact`);
      if (def.placement.anchor === 'ceiling') assert.ok(Math.abs(contact - (ceiling - def.placement.clearance)) < 1e-6, `${s.spriteId} ceiling contact`);
      if (def.placement.anchor === 'wall') {
        assert.ok(Math.abs(s.z - (floor + def.placement.baseZ)) < 1e-6, `${s.spriteId} wall height`);
        const offset = Math.abs(s.x - (s.tileX + 0.5)) + Math.abs(s.y - (s.tileY + 0.5));
        assert.ok(Math.abs(offset - (0.5 - def.placement.wallInset)) < 1e-6, `${s.spriteId} wall plane`);
      }
    }
  }
  assert.deepEqual([...found].sort(), ['brazier_floor', 'crystal_small', 'lantern_hanging', 'torch_wall']);
});

test('sprites have unique phase so flicker not synced', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const d = await generateDungeon(cfg, 999);
  const phases = d.sprites.map(s => s.phase);
  // At least 3 distinct rounded phases for >2 sprites
  const uniq = new Set(phases.map(p => Math.round(p * 100) / 100));
  assert.ok(uniq.size >= Math.min(phases.length, 3), `phases varied to avoid sync, uniq=${uniq.size} total=${phases.length}`);
  // No two phases exactly same if many sprites (allow small collision due to 2pi wrap)
  if (phases.length > 5) {
    assert.ok(uniq.size >= 3, 'at least 3 unique phases for many sprites');
  }
});

test('sprites material fields in sane ranges', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const d = await generateDungeon(cfg, 555);
  for (const s of d.sprites) {
    assert.ok(s.intensity >= 1 && s.intensity <= 8, `intensity sane ${s.intensity}`);
    assert.ok(s.radius >= 4 && s.radius <= 16, `radius sane ${s.radius}`);
    assert.ok(s.flickerSpeed >= 0 && s.flickerSpeed <= 15, `flickerSpeed sane ${s.flickerSpeed}`);
    assert.ok(s.flickerAmount >= 0 && s.flickerAmount <= 0.6, `flickerAmount sane ${s.flickerAmount}`);
    assert.ok(s.phase >= 0 && s.phase <= Math.PI * 2 + 0.001, `phase 0..2pi ${s.phase}`);
    if (s.flameSize !== undefined) {
      assert.ok(s.flameSize > 0 && s.flameSize < 1.0, `flameSize sane ${s.flameSize}`);
    }
  }
});

test('config sprites.json valid and contains required types and pools', async () => {
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(path.join(__dirname, '../../assets/config/lighting/sprites.json'), 'utf8')); } catch (e) { assert.fail('sprites.json missing or invalid'); }
  assert.ok([1,2,3].includes(spritesRaw.version), `version 1..3, got ${spritesRaw.version}`);
  assert.ok(Array.isArray(spritesRaw.sprites) && spritesRaw.sprites.length >= 2, 'at least 2 sprite defs');
  const ids = spritesRaw.sprites.map(s => s.id);
  assert.ok(ids.includes('torch_wall'), 'torch_wall exists');
  assert.ok(ids.includes('brazier_floor'), 'brazier_floor exists');
  for (const s of spritesRaw.sprites) {
    assert.ok(s.id, `${s.id} has id`);
    const mh = s.material?.worldHeight ?? s.material?.worldHeight;
    const wh = s.material.worldHeight;
    const wwf = s.material.worldWidthFactor;
    assert.ok(wh > 0.1 && wh < 2.5, `worldHeight sane for ${s.id}: ${wh}`);
    assert.ok(wwf > 0.2 && wwf < 1.2, `worldWidthFactor sane for ${s.id}: ${wwf}`);
    assert.ok(s.lightProfile.intensity.min > 0, `intensity min >0 for ${s.id}`);
    assert.ok(s.lightProfile.radius.min > 0, `radius min >0 for ${s.id}`);
    assert.ok(s.lightProfile.color.length === 3, `color [r,g,b] for ${s.id}`);
    assert.ok(s.material.normalStrength === undefined || s.material.normalStrength > 0, `normalStrength >0`);
    if (s.material.baseRoughness !== undefined) {
      assert.ok(s.material.baseRoughness >= 0 && s.material.baseRoughness <= 1, `roughness 0..1`);
    }
    if (s.material.baseMetal !== undefined) {
      assert.ok(s.material.baseMetal >= 0 && s.material.baseMetal <= 1, `metal 0..1`);
    }
  }
  assert.ok(spritesRaw.pools, 'has pools');
  assert.ok(spritesRaw.pools.zone, 'zone pools exist');
  assert.ok(spritesRaw.pools.role, 'role pools exist');
  assert.ok(spritesRaw.pools.zone.Entry, 'zone Entry exists');
  assert.ok(spritesRaw.pools.role.corridor, 'role corridor exists');
  // Check weights sane (positive numbers)
  for (const [zone, pool] of Object.entries(spritesRaw.pools.zone)) {
    for (const [sid, w] of Object.entries(pool)) {
      assert.ok(w >= 0 && w <= 2, `zone pool weight sane ${zone}/${sid}=${w}`);
    }
  }
});

test('generator output includes both sprites and lights plus items shim', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const cfg = await loadConfig();
  const d = await generateDungeon(cfg, 1337);
  assert.ok(Array.isArray(d.sprites), 'has sprites array');
  assert.ok(Array.isArray(d.lights), 'has lights array');
  // lights should be at least as many as sprites (each sprite emits light) or close
  assert.ok(d.lights.length >= Math.floor(d.sprites.length * 0.8), `lights >= 80% sprites, sprites=${d.sprites.length} lights=${d.lights.length}`);
  // items optional shim for backward compat OR sprites
  if (d.items) {
    assert.ok(Array.isArray(d.items), 'items is array if present');
  }
  assert.ok(d.grid, 'has grid');
  assert.ok(d.w && d.h, 'has dimensions');
});
