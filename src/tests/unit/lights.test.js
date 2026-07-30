// Lights & organic flicker unit tests — Task 6
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_TYPES, LIGHT_TYPE_IDS, organicFlickerFactor, pulseFactor, getLightTypeId, isValidLightType } from '../../world/light-types.js';
import { Light, LightManager } from '../../systems/lights.js';

test('LIGHT_TYPES has required enums', () => {
  assert.ok(LIGHT_TYPES.POINT);
  assert.ok(LIGHT_TYPES.FLICKER);
  assert.ok(LIGHT_TYPES.PULSE);
  assert.ok(LIGHT_TYPES.SPOT);
  assert.ok(LIGHT_TYPES.DIRECTIONAL);
  assert.equal(LIGHT_TYPES.POINT, 'point');
  assert.equal(LIGHT_TYPES.FLICKER, 'flicker');
});

test('LIGHT_TYPE_IDS maps correctly', () => {
  assert.equal(LIGHT_TYPE_IDS.point, 0);
  assert.equal(LIGHT_TYPE_IDS.flicker, 2);
  assert.equal(LIGHT_TYPE_IDS.pulse, 3);
  assert.equal(LIGHT_TYPE_IDS.steady, 6);
  assert.ok(getLightTypeId('point') === 0);
  assert.ok(isValidLightType('flicker'));
  assert.ok(!isValidLightType('madeup'));
});

test('organicFlickerFactor returns 1 when no flicker', () => {
  assert.equal(organicFlickerFactor(0, 0, 0, 0), 1.0);
  assert.equal(organicFlickerFactor(123, 0, 0, 1.5), 1.0);
});

test('organicFlickerFactor is deterministic and non-NaN', () => {
  const a = organicFlickerFactor(1.2, 6.0, 0.22, 0.7);
  const b = organicFlickerFactor(1.2, 6.0, 0.22, 0.7);
  assert.equal(a, b);
  assert.ok(Number.isFinite(a));
  assert.ok(a >= 0.18, `factor ${a} should be >=0.18`);
  assert.ok(a <= 3.0, `factor ${a} should be <=3`);
});

test('organicFlickerFactor varies with time and phase', () => {
  const t1 = organicFlickerFactor(0.5, 6, 0.25, 0.0);
  const t2 = organicFlickerFactor(1.5, 6, 0.25, 0.0);
  const t3 = organicFlickerFactor(0.5, 6, 0.25, 2.5);
  assert.notEqual(t1, t2, 'different times should produce different flicker');
  assert.notEqual(t1, t3, 'different phases should produce different flicker');
});

test('organicFlickerFactor not simple sine — pop spikes', () => {
  // sample over 10 seconds, check variance and occasional spikes > threshold
  let min = Infinity, max = -Infinity, vals = [];
  for (let t = 0; t < 10; t += 0.1) {
    const v = organicFlickerFactor(t, 6, 0.25, 0.3);
    vals.push(v);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const range = max - min;
  assert.ok(range > 0.15, `range ${range} should be >0.15 for organic feel`);
  // Check non-monotonicity — there should be up and down
  let ups = 0, downs = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] > vals[i-1]) ups++; else downs++;
  }
  assert.ok(ups > 10 && downs > 10, `should have ups ${ups} downs ${downs} not monotonic`);
});

test('pulseFactor works', () => {
  assert.equal(pulseFactor(0, 0, 0, 0), 1.0);
  const p1 = pulseFactor(0, 2.2, 0.35, 0);
  const p2 = pulseFactor(0.5, 2.2, 0.35, 0);
  assert.notEqual(p1, p2);
  assert.ok(Number.isFinite(p1));
});

test('Light class getFlickeredIntensity', () => {
  const l = new Light({ intensity: 4, flickerSpeed: 6, flickerAmount: 0.22, phase: 0.5 });
  const i1 = l.getFlickeredIntensity(0.0);
  const i2 = l.getFlickeredIntensity(0.5);
  assert.ok(Number.isFinite(i1) && Number.isFinite(i2));
  assert.ok(i1 >= 4 * 0.18);
  assert.notEqual(i1, i2);
  assert.equal(l.typeId, 0);
});

test('Light class uploadAt', () => {
  const l = new Light({ pos: [1, 2, 0.7], color: [1, 0.6, 0.2], intensity: 4 });
  const up = l.uploadAt(1.0);
  assert.deepEqual(up.pos, [1, 2, 0.7]);
  assert.ok(up.intensity >= 0.18);
});

test('LightManager setFromMap creates lights', async () => {
  const { generateDungeon } = await import('../../world/dungeon/index.js');
  const genCfgRaw = JSON.parse(await (await import('fs/promises')).readFile(new URL('../../assets/config/gameplay/generator.json', import.meta.url), 'utf8'));
  const lightingRaw = JSON.parse(await (await import('fs/promises')).readFile(new URL('../../assets/config/lighting/lighting.json', import.meta.url), 'utf8'));
  let spritesRaw = null;
  try { spritesRaw = JSON.parse(await (await import('fs/promises')).readFile(new URL('../../assets/config/lighting/sprites.json', import.meta.url), 'utf8')); } catch {}
  const cfg = { generator: genCfgRaw, lighting: lightingRaw, sprites: spritesRaw, torchColors: genCfgRaw.torchColors };
  const map = await generateDungeon(cfg, 12345);
  const mgr = new LightManager(lightingRaw);
  mgr.setFromMap(map);
  assert.ok(mgr.count() > 0, 'should have lights');
  assert.ok(mgr.sun);
  const nearest = mgr.getNearest({ x: map.startX, y: map.startY }, 4);
  assert.ok(nearest.length <= 4);
  const flickered = mgr.getFlickeredList(1.0, { x: map.startX, y: map.startY }, 8, null);
  assert.ok(flickered.length > 0);
  for (const fl of flickered) assert.ok(fl.intensity >= 0.18);
});
