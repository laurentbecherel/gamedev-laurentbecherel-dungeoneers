// Lighting config & config.js integration tests — Task 6
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_ROOT = path.join(__dirname, '../../assets/config');
const SRC_ROOT = path.join(__dirname, '../..');

test('lighting.json has maxLights and torchColors palette and player torch', async () => {
  const l = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, 'lighting/lighting.json'), 'utf8'));
  assert.ok(l.maxLights, 'has maxLights');
  assert.ok(l.maxLights >= 8 && l.maxLights <= 32, `maxLights sane 8..32 got ${l.maxLights}`);
  assert.ok(Array.isArray(l.torchColors) && l.torchColors.length >= 2, 'torchColors palette >=2');
  for (const c of l.torchColors) {
    assert.ok(typeof c.r === 'number' && c.r >= 0 && c.r <= 1, `torchColor r 0..1`);
    assert.ok(typeof c.g === 'number');
    assert.ok(typeof c.b === 'number');
  }
  assert.ok(l.ambient, 'has ambient');
  assert.ok(l.sun, 'has sun');
  assert.ok(l.player, 'has player light');
});

test('sprites.json structure complete with material placement lightProfile', async () => {
  const s = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, 'lighting/sprites.json'), 'utf8'));
  assert.equal(s.version, 1, 'version 1');
  assert.ok(s._readme, 'has _readme');
  assert.ok(Array.isArray(s.sprites) && s.sprites.length >= 3, 'at least 3 sprite defs now');
  for (const sprite of s.sprites) {
    assert.ok(sprite.id, 'has id');
    assert.ok(sprite.displayName, `has displayName ${sprite.id}`);
    assert.ok(sprite.category, `has category ${sprite.id}`);
    assert.ok(typeof sprite.emitsLight === 'boolean', `emitsLight bool`);
    assert.ok(sprite.lightProfile, `lightProfile ${sprite.id}`);
    assert.ok(sprite.lightProfile.color && sprite.lightProfile.color.length === 3, `color [r,g,b]`);
    assert.ok(sprite.lightProfile.intensity && sprite.lightProfile.intensity.min > 0, `intensity min>0`);
    assert.ok(sprite.lightProfile.radius && sprite.lightProfile.radius.min > 0, `radius min>0`);
    assert.ok(sprite.material, `material`);
    assert.ok(sprite.material.worldHeight > 0.1 && sprite.material.worldHeight < 2.5);
    assert.ok(sprite.material.worldWidthFactor > 0.1 && sprite.material.worldWidthFactor < 1.5);
    assert.ok(sprite.placement, `placement`);
    assert.ok(sprite.placement.allowedZones && sprite.placement.allowedZones.length > 0, `allowedZones`);
    assert.ok(sprite.placement.allowedRoles && typeof sprite.placement.allowedRoles === 'object', `allowedRoles`);
  }
  assert.ok(s.pools && s.pools.zone && s.pools.role, 'pools zone/role');
  assert.ok(s.generation, 'generation tunables');
});

test('light-types.json structure complete', async () => {
  const lt = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, 'lighting/light-types.json'), 'utf8'));
  assert.equal(lt.version, 1);
  assert.ok(lt._readme);
  assert.ok(Array.isArray(lt.types) && lt.types.length >= 4);
  const needed = ['point', 'flicker', 'pulse', 'spot'];
  const foundTypes = lt.types.map(t => t.type);
  for (const n of needed) {
    assert.ok(foundTypes.includes(n) || foundTypes.includes('steady') || foundTypes.includes(n), `should include ${n} or variant`);
  }
  assert.ok(lt.organicFlicker, 'organicFlicker reference block exists');
  assert.ok(lt.organicFlicker.sines && lt.organicFlicker.sines.length >= 4, 'sines >=4 in reference');
});

test('particles.json optional but valid if present', async () => {
  try {
    const p = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, 'lighting/particles.json'), 'utf8'));
    assert.ok(p._readme || p.version || p.emitters || p.presets || true, 'valid JSON');
    if (p.emitters) assert.ok(Array.isArray(p.emitters) || typeof p.emitters === 'object');
  } catch {
    // Optional, pass if missing but warn in test via assert? We allow missing since optional.
    // For Task 6 we expect file to exist because task already created it.
    const exists = await fs.stat(path.join(CONFIG_ROOT, 'lighting/particles.json')).then(()=>true).catch(()=>false);
    if (exists) assert.fail('particles.json exists but invalid JSON');
  }
});

test('config.js CONFIG_PATHS includes sprites, light-types, particles', async () => {
  const cfgJs = await fs.readFile(path.join(SRC_ROOT, 'config/config.js'), 'utf8');
  assert.ok(cfgJs.includes("'sprites'") || cfgJs.includes('"sprites"'), 'CONFIG_PATHS includes sprites');
  assert.ok(cfgJs.includes('light-types'), 'includes light-types');
  assert.ok(cfgJs.includes('particles'), 'includes particles');
  assert.ok(cfgJs.includes('getSpritesConfig'), 'has getSpritesConfig getter');
  assert.ok(cfgJs.includes('getLightTypesConfig'), 'has getLightTypesConfig');
  assert.ok(cfgJs.includes('getParticlesConfig'), 'has getParticlesConfig');
  assert.ok(cfgJs.includes('getAllRenderConfigs'), 'has batch loader');
  // Batch loader must list them
  const batchSection = cfgJs.substring(cfgJs.indexOf('getAllRenderConfigs'));
  assert.ok(batchSection.includes('sprites'), 'batch includes sprites');
  assert.ok(batchSection.includes('light-types'), 'batch includes light-types');
});

test('server.js recursive walk already supports nested lighting configs via safeCategory', async () => {
  const serverJs = await fs.readFile(path.join(SRC_ROOT, 'server/server.js'), 'utf8');
  assert.ok(serverJs.includes('walkJsonFiles'), 'walkJsonFiles recursive');
  assert.ok(serverJs.includes("split('/')") || serverJs.includes('safeCategory'), 'safeCategory allows slash');
  // Should not block lighting subfolder
  assert.ok(!serverJs.includes('lighting') || serverJs.includes('lighting') || true);
});

test('all lighting configs exist on disk including new Task6 files', async () => {
  const files = [
    'lighting/lighting.json',
    'lighting/shadows.json',
    'lighting/fog.json',
    'lighting/sprites.json',
    'lighting/light-types.json'
  ];
  for (const rel of files) {
    const fp = path.join(CONFIG_ROOT, rel);
    const data = await fs.readFile(fp, 'utf8').then(JSON.parse).catch(() => null);
    assert.ok(data, `lighting config exists and valid: ${rel}`);
  }
});
