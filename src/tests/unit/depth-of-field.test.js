import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEPTH_OF_FIELD_UNIFORM_BYTES,
  depthEffectFactor,
  normalizeDepthOfFieldConfig,
  packDepthOfFieldUniforms,
} from '../../render/depth-of-field.js';
import { fsDepthOfFieldWgsl, fsSpriteDepthWgsl } from '../../render/shaders-wgsl.js';

const ROOT = process.cwd();

test('depth-of-field config is dedicated, documented, and fully ranged for the editor', async () => {
  const config = JSON.parse(await fs.readFile(path.join(ROOT, 'assets/config/rendering/depth-of-field.json'), 'utf8'));
  assert.equal(config.version, 1);
  assert.equal(config.enabled, true);
  assert(config.docs?.distance?.sharpUntil);
  assert(config.docs?.filter?.pattern);
  for (const [section, fields] of Object.entries({
    distance: ['sharpUntil', 'fullEffectAt', 'curve'],
    pixelation: ['maxBlockPixels', 'strength', 'referenceHeight'],
    filter: ['strength', 'radius'],
    edge: ['absoluteThreshold', 'relativeThreshold'],
  })) {
    for (const field of fields) {
      const schema = config.ui?.[section]?.[field];
      assert.equal(typeof schema?.min, 'number', `${section}.${field} has editor min`);
      assert.equal(typeof schema?.max, 'number', `${section}.${field} has editor max`);
      assert.equal(typeof schema?.step, 'number', `${section}.${field} has editor step`);
    }
  }
  assert.deepEqual(config.ui.filter.pattern.options, ['nearest', 'cross5', 'box9']);
  assert(config.ui.debug.view.options.includes('rejectedSamples'));
});

test('depth-of-field normalization clamps unsafe input and preserves far-only ordering', () => {
  const normalized = normalizeDepthOfFieldConfig({
    distance: { sharpUntil: 12, fullEffectAt: 4, curve: -3 },
    pixelation: { maxBlockPixels: 99, strength: 4, referenceHeight: 0 },
    filter: { pattern: 'unknown', strength: -2, radius: 9 },
    edge: { absoluteThreshold: 0, relativeThreshold: 8 },
    debug: { view: 'blockSize' },
  }, 25);
  assert(normalized.fullEffectAt >= normalized.sharpUntil + 0.25);
  assert.equal(normalized.curve, 0.05);
  assert.equal(normalized.maxBlockPixels, 32);
  assert.equal(normalized.strength, 1);
  assert.equal(normalized.referenceHeight, 1);
  assert.equal(normalized.filterPatternName, 'cross5');
  assert.equal(normalized.debugView, 3);
  assert.equal(normalized.relativeThreshold, 1);
});

test('depth effect factor stays sharp nearby and reaches one in the far field', () => {
  const config = { distance: { sharpUntil: 4, fullEffectAt: 20, curve: 1.35 } };
  assert.equal(depthEffectFactor(0, config), 0);
  assert.equal(depthEffectFactor(4, config), 0);
  assert(depthEffectFactor(12, config) > 0 && depthEffectFactor(12, config) < 1);
  assert.equal(depthEffectFactor(20, config), 1);
  assert.equal(depthEffectFactor(100, config), 1);
});

test('depth-of-field uniform packing matches the 64-byte WGSL contract', () => {
  const packed = packDepthOfFieldUniforms({
    enabled: true,
    distance: { sharpUntil: 5, fullEffectAt: 18, curve: 2 },
    pixelation: { maxBlockPixels: 6, strength: 0.8, referenceHeight: 360, scaleWithResolution: false },
    filter: { pattern: 'box9', strength: 0.5, radius: 0.75 },
    edge: { absoluteThreshold: 1, relativeThreshold: 0.1 },
  }, 30);
  assert.equal(packed.buffer.byteLength, DEPTH_OF_FIELD_UNIFORM_BYTES);
  const view = new DataView(packed.buffer);
  assert.equal(view.getFloat32(0, true), 5);
  assert.equal(view.getFloat32(4, true), 18);
  assert.equal(view.getFloat32(40, true), 30);
  assert.equal(view.getUint32(48, true), 1);
  assert.equal(view.getUint32(52, true), 2);
  assert.equal(view.getUint32(60, true), 0);
});

test('WGSL performs depth-aware block filtering and solid sprites write scene depth', async () => {
  assert(fsDepthOfFieldWgsl.includes('absoluteThreshold'));
  assert(fsDepthOfFieldWgsl.includes('relativeThreshold'));
  assert(fsDepthOfFieldWgsl.includes('blockCenter'));
  assert(fsDepthOfFieldWgsl.includes('sampleAccepted'));
  assert(fsDepthOfFieldWgsl.includes('sampleCount = 9'));
  assert(fsSpriteDepthWgsl.includes('depthNorm'));
  assert(fsSpriteDepthWgsl.includes('albedo.a * v_alpha < 0.20'));

  const renderer = await fs.readFile(path.join(ROOT, 'render/renderer-gpu.js'), 'utf8');
  const spriteRenderer = await fs.readFile(path.join(ROOT, 'render/sprite-gpu.js'), 'utf8');
  assert(renderer.indexOf('// SSR pass') < renderer.indexOf('// Depth-aware pixelation'));
  assert(renderer.indexOf('// Depth-aware pixelation') < renderer.indexOf('// Quantize to canvas'));
  assert(renderer.includes('quantizeDepthOfField'));
  assert(spriteRenderer.includes('sprite_depth_pipeline'));
  assert(spriteRenderer.includes("meta?.category !== 'effect'"));
  assert(spriteRenderer.includes('!s.isParticle'));
});

test('depth-of-field is a Tier 1 config with a reverse path mapping', async () => {
  const { getTierForLogical, reverseLookupPath } = await import('../../config/live-config.js');
  assert.equal(getTierForLogical('depth-of-field'), 'T1');
  assert(reverseLookupPath('config/rendering/depth-of-field').includes('depth-of-field'));
});
