// Sprites generation unit tests — Task 6
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2i } from '../../world/dungeon/themes.js';
import { SpriteEntity, TorchSprite } from '../../entities/sprite-entity.js';
import { registerSprite, getSprite, listSprites } from '../../render/sprite-atlas.js';

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
});

test('TorchSprite toLightDesc', () => {
  const t = new TorchSprite({ x: 2, y: 3, z: 0.7, spriteId: 'torch_wall', color: [1, 0.6, 0.2], intensity: 4, radius: 10, flickerSpeed: 6, flickerAmount: 0.2, phase: 0.3, tileX: 2, tileY: 3, roomIndex: 1 });
  assert.ok(t.emitsLight);
  const ld = t.toLightDesc();
  assert.deepEqual(ld.pos, [2, 3, 0.7]);
  assert.equal(ld.type, 'flicker');
});

test('sprite-atlas registry register/get/list', () => {
  registerSprite('test_dummy', {
    id: 'test_dummy',
    path: './assets/sprites/test.png',
    cols: 1, rows: 1, count: 1, cellW: 64, cellH: 64, cropX: 0, cropY: 0, cropW: 64, cropH: 64,
    worldHeight: 0.5, worldWidthFactor: 0.5,
  });
  const meta = getSprite('test_dummy');
  assert.ok(meta);
  assert.equal(meta.id, 'test_dummy');
  assert.ok(listSprites().includes('test_dummy'));
});

test('generateDungeonSprites deterministic same seed same sprites/lights', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const fs = await import('fs/promises');
  const genCfgRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/gameplay/generator.json', import.meta.url), 'utf8'));
  const lightingRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/lighting.json', import.meta.url), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch {}
  const cfg = { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, torchColors: genCfgRaw.torchColors };

  const a = await generateDungeon(cfg, 777);
  const b = await generateDungeon(cfg, 777);
  assert.ok(a.sprites && a.sprites.length > 0, 'should have sprites');
  assert.ok(a.lights && a.lights.length > 0, 'should have lights');
  assert.equal(a.sprites.length, b.sprites.length);
  assert.equal(a.lights.length, b.lights.length);
  // deep equality of positions and ids for deterministic check
  for (let i = 0; i < a.sprites.length; i++) {
    const sA = a.sprites[i], sB = b.sprites[i];
    assert.equal(sA.x, sB.x, `sprite ${i} x same`);
    assert.equal(sA.y, sB.y, `sprite ${i} y same`);
    assert.equal(sA.z, sB.z, `sprite ${i} z same`);
    assert.equal(sA.spriteId, sB.spriteId);
    assert.equal(sA.phase, sB.phase);
  }
});

test('sprites respect bounds and min distance', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const fs = await import('fs/promises');
  const genCfgRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/gameplay/generator.json', import.meta.url), 'utf8'));
  const lightingRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/lighting.json', import.meta.url), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch {}
  const cfg = { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, torchColors: genCfgRaw.torchColors };
  const d = await generateDungeon(cfg, 123);
  const minDist = genCfgRaw.items?.minTorchDist ?? 6;
  const minSq = (minDist - 0.2) * (minDist - 0.2); // allow small eps due to offset rounding
  for (let i = 0; i < d.sprites.length; i++) {
    const s = d.sprites[i];
    assert.ok(s.x >= 0 && s.x < d.w, `sprite ${i} x in bounds`);
    assert.ok(s.y >= 0 && s.y < d.h, `sprite ${i} y in bounds`);
    assert.ok(s.z >= -1 && s.z <= 3, `sprite ${i} z sane`);
    assert.ok(s.intensity > 0 && s.radius > 0);
    assert.ok(s.color[0] >= 0 && s.color[0] <= 1);
    assert.ok(s.spriteId);
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
  const fs = await import('fs/promises');
  const genCfgRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/gameplay/generator.json', import.meta.url), 'utf8'));
  const lightingRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/lighting.json', import.meta.url), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch {}
  const cfg = { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, torchColors: genCfgRaw.torchColors };
  const d = await generateDungeon(cfg, 42);
  for (const s of d.sprites) {
    const idx = s.tileY * d.w + s.tileX;
    const floorH = d.floorHeight[idx] || 0;
    // z should be floorH + base (~0.15-0.72) +/- jitter reasonable
    assert.ok(s.z >= floorH - 0.1, `sprite z ${s.z} should be >= floorH ${floorH} -0.1`);
    assert.ok(s.z <= floorH + 1.2, `sprite z ${s.z} should be <= floorH+1.2`);
    assert.equal(s.floorH, floorH);
  }
});

test('sprites have unique phase so flicker not synced', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const fs = await import('fs/promises');
  const genCfgRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/gameplay/generator.json', import.meta.url), 'utf8'));
  const lightingRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/lighting.json', import.meta.url), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch {}
  const cfg = { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, torchColors: genCfgRaw.torchColors };
  const d = await generateDungeon(cfg, 999);
  const phases = d.sprites.map(s => s.phase);
  const uniq = new Set(phases.map(p => Math.round(p * 100) / 100));
  assert.ok(uniq.size >= Math.min(phases.length, 3), 'phases should be varied to avoid sync');
});

test('config sprites.json valid and contains required types', async () => {
  const fs = await import('fs/promises');
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch (e) { assert.fail('sprites.json missing'); }
  assert.equal(spritesRaw.version, 1);
  assert.ok(Array.isArray(spritesRaw.sprites) && spritesRaw.sprites.length >= 2, 'at least 2 sprite defs');
  const ids = spritesRaw.sprites.map(s => s.id);
  assert.ok(ids.includes('torch_wall'), 'torch_wall exists');
  assert.ok(ids.includes('brazier_floor'), 'brazier_floor exists');
  for (const s of spritesRaw.sprites) {
    assert.ok(s.id, 'has id');
    assert.ok(s.material.worldHeight > 0.1 && s.material.worldHeight < 2.5, `worldHeight sane for ${s.id}`);
    assert.ok(s.material.worldWidthFactor > 0.2 && s.material.worldWidthFactor < 1.0);
    assert.ok(s.lightProfile.intensity.min > 0);
    assert.ok(s.lightProfile.radius.min > 0);
  }
  assert.ok(spritesRaw.pools.zone.Entry, 'zone pool exists');
  assert.ok(spritesRaw.pools.role.corridor, 'role pool exists');
});
