// Particles unit tests — Task 6 — flame/smoke organic wobble
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Particle, ParticleEmitter, ParticleSystem } from '../../systems/particles.js';

test('Particle update lifecycle, drag, fade, shrink', () => {
  const p = new Particle(1, 2, 0.5, 0.1, 0.2, 0.3, 0.1, [1, 0.6, 0.2], 1.0, 2.0);
  assert.equal(p.x, 1);
  assert.equal(p.y, 2);
  assert.equal(p.baseSize, 0.1);
  assert.equal(p.baseAlpha, 1.0);
  // update half life
  let alive = p.update(0.5);
  assert.ok(alive, 'still alive after 0.5 of 2.0 life');
  assert.ok(p.age === 0.5);
  assert.ok(p.x > 1, 'moved in x');
  assert.ok(p.vx < 0.1, 'drag reduced vx');
  // fade after 0.5 life
  alive = p.update(0.6); // now age 1.1 > 0.5*2.0=1.0 => fading
  assert.ok(p.alpha < 1.0, `alpha should fade after half life, got ${p.alpha}`);
  assert.ok(p.size < p.baseSize, 'size shrinks');
  // update beyond life
  alive = p.update(1.0);
  assert.ok(!alive, 'dead after life exceeded');
  // alpha eventually low
  assert.ok(p.alpha < 1.0);
});

test('ParticleEmitter creates particles at rate and respects type', () => {
  const emitter = new ParticleEmitter({ pos: [0,0,0.5], rate: 10, color: [1,0.6,0.2], size: 0.08, life: 1.0, velocity: [0,0,0.3], spread: 0.1, type: 'flame' });
  assert.equal(emitter.type, 'flame');
  assert.equal(emitter.particles.length, 0);
  // update 0.1s at rate 10 => accum 1 => 1 particle
  emitter.update(0.1, 0);
  assert.ok(emitter.particles.length >= 1, `should have >=1 particle after 0.1s at rate 10, got ${emitter.particles.length}`);
  const countAfterFirst = emitter.particles.length;
  emitter.update(0.1, 0.1);
  assert.ok(emitter.particles.length >= countAfterFirst, 'more or same after another tick (old may still alive)');
  // particles have valid fields
  for (const pa of emitter.particles) {
    assert.ok(pa.x !== undefined && pa.y !== undefined && pa.z !== undefined);
    assert.ok(pa.color.length === 3);
    assert.ok(pa.alpha > 0 && pa.alpha <= 1.2);
    assert.ok(pa.life > 0);
  }
});

test('ParticleEmitter smoke type produces slower larger dimmer particles', () => {
  const flame = new ParticleEmitter({ pos: [0,0,0.5], rate: 5, color: [1,0.6,0.2], size: 0.08, life: 1.0, spread: 0.05, type: 'flame' });
  const smoke = new ParticleEmitter({ pos: [0,0,0.5], rate: 5, color: [0.25,0.22,0.2], size: 0.08, life: 1.0, spread: 0.05, type: 'smoke' });
  flame.update(0.5, 1.0);
  smoke.update(0.5, 1.0);
  assert.ok(flame.particles.length > 0);
  assert.ok(smoke.particles.length > 0);
  // smoke typically larger and lower alpha on average
  const avgSize = arr => arr.reduce((s,p)=>s+p.size,0)/arr.length;
  const avgAlpha = arr => arr.reduce((s,p)=>s+p.alpha,0)/arr.length;
  const flameAvgSize = avgSize(flame.particles);
  const smokeAvgSize = avgSize(smoke.particles);
  const smokeAvgAlpha = avgAlpha(smoke.particles);
  assert.ok(smokeAvgSize > flameAvgSize * 0.8, `smoke larger than flame typical, smoke=${smokeAvgSize} flame=${flameAvgSize}`);
  assert.ok(smokeAvgAlpha < 0.5, `smoke low alpha ${smokeAvgAlpha}`);
});

test('ParticleEmitter disabled stops emitting but still updates existing', () => {
  const emitter = new ParticleEmitter({ pos: [0,0,0.5], rate: 20, size: 0.08, life: 0.3, type: 'flame' });
  emitter.update(0.2, 0);
  const beforeCount = emitter.particles.length;
  assert.ok(beforeCount > 0);
  emitter.setEnabled(false);
  assert.equal(emitter.enabled, false);
  emitter.update(0.2, 0.5);
  // should not emit new, but old particles may still be alive shrinking
  assert.ok(emitter.particles.length <= beforeCount, 'no new particles when disabled');
});

test('ParticleSystem add/remove/clear/update/getAllParticles/count', () => {
  const sys = new ParticleSystem();
  assert.equal(sys.count(), 0);
  assert.equal(sys.getAllParticles().length, 0);
  const e1 = new ParticleEmitter({ pos: [0,0,0], rate: 10, life: 1.0, type: 'flame' });
  const e2 = new ParticleEmitter({ pos: [5,5,0.5], rate: 10, life: 1.0, type: 'smoke' });
  sys.addEmitter(e1);
  sys.addEmitter(e2);
  assert.equal(sys.emitters.length, 2);
  sys.update(0.2, 0);
  assert.ok(sys.count() > 0, 'count >0 after update');
  assert.ok(sys.getAllParticles().length > 0);
  const all = sys.getAllParticles();
  for (const p of all) {
    assert.ok(p.life > 0);
  }
  sys.removeEmitter(e1.id);
  assert.equal(sys.emitters.length, 1);
  assert.equal(sys.emitters[0].id, e2.id);
  sys.clear();
  assert.equal(sys.emitters.length, 0);
  assert.equal(sys.count(), 0);
});

test('ParticleSystem organic flame wobble not static (color variation over time)', () => {
  // Emit many flame particles at different times, ensure color varies (yellow/orange/red) not all same
  const emitter = new ParticleEmitter({ pos: [1,2,0.7], rate: 50, life: 1.5, type: 'flame' });
  emitter.update(0.5, 0.0);
  const colors = emitter.particles.map(p => p.color.join(','));
  const uniqColors = new Set(colors.map(c => {
    // bucket by rough hue: check if contains 0.9 (bright) vs 0.35 vs 0.6 etc
    const parts = c.split(',').map(Number);
    if (parts[1] > 0.8) return 'bright';
    if (parts[1] > 0.5) return 'mid';
    return 'dark';
  }));
  // Should have at least 2 variants due to random + tempPhase logic
  assert.ok(uniqColors.size >= 2, `flame color variation expected >=2 got ${[...uniqColors]}`);
});

test('ParticleSystem spark type properties', () => {
  const spark = new ParticleEmitter({ pos: [0,0,0.5], rate: 10, size: 0.08, life: 0.8, type: 'spark' });
  spark.update(0.3, 1.0);
  assert.ok(spark.particles.length > 0);
  for (const p of spark.particles) {
    assert.ok(p.size <= 0.08 * 0.9, `spark small size ${p.size} <= 0.08*0.9`);
    assert.ok(p.alpha >= 0.8, `spark high alpha ${p.alpha}`);
  }
});
