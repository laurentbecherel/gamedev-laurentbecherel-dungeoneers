import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  getFixtureDefinition, getFixtureFacingYaw, resolveFourWayView,
  resolveFixtureBaseZ, resolveFixtureWallOffset, resolveSocketWorld,
  resolveSpriteFrame, validateFixtureManifest,
} from '../../systems/fixtures.js';
import { FixtureParticleSystem } from '../../systems/fixture-particles.js';

const fixtures = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/fixtures.json', import.meta.url), 'utf8'));
const torch = getFixtureDefinition(fixtures, 'torch_wall');
const particleConfig = JSON.parse(await fs.readFile(new URL('../../assets/config/lighting/particles.json', import.meta.url), 'utf8'));

test('fixture manifest has four torch views, sockets and valid effect references', () => {
  assert.deepEqual(validateFixtureManifest(fixtures), []);
  assert.equal(fixtures.fixtures.length,4);
  assert.ok(torch);
  assert.deepEqual(Object.keys(torch.render.views).sort(), ['back','front','left','right']);
  for (const socket of ['light','flame','smoke','sparks']) assert.equal(torch.sockets[socket].local.length, 3);
});

test('wall directions resolve to inward fixture yaw', () => {
  const instance = { x:0, y:0, z:0.34, wallDir:'N' };
  assert.ok(Math.abs(getFixtureFacingYaw(instance, torch) - Math.PI / 2) < 1e-9);
  instance.wallDir='W';
  assert.ok(Math.abs(getFixtureFacingYaw(instance, torch)) < 1e-9);
});

test('camera quadrants resolve all four directional atlas frames', () => {
  const instance={x:0,y:0,z:0.34,wallDir:'W'};
  const cameras={front:{x:2,y:0},right:{x:0,y:2},back:{x:-2,y:0},left:{x:0,y:-2}};
  for(const [view,camera] of Object.entries(cameras)) {
    assert.equal(resolveFourWayView(instance,torch,camera),view);
    assert.equal(resolveSpriteFrame(instance,torch,camera,0),torch.render.views[view]);
  }
});

test('light socket is above and forward from fixture base', () => {
  const instance={x:4,y:5,z:0.34,wallDir:'W'};
  const pos=resolveSocketWorld(instance,torch,'light');
  assert.ok(pos[0] > instance.x);
  assert.equal(pos[1],instance.y);
  assert.ok(pos[2] > instance.z);
});

test('fixture placement anchors make architectural contact', () => {
  const brazier = getFixtureDefinition(fixtures, 'brazier_floor');
  const lantern = getFixtureDefinition(fixtures, 'lantern_hanging');
  const crystal = getFixtureDefinition(fixtures, 'crystal_small');
  const brazierZ = resolveFixtureBaseZ(brazier, 0.2, 1);
  const crystalZ = resolveFixtureBaseZ(crystal, 0.2, 1);
  const lanternZ = resolveFixtureBaseZ(lantern, 0.2, 1);
  assert.ok(Math.abs(brazierZ + brazier.render.worldHeight * (1 - brazier.render.pivot[1]) - 0.21) < 1e-9);
  assert.ok(Math.abs(crystalZ + crystal.render.worldHeight * (1 - crystal.render.pivot[1]) - 0.21) < 1e-9);
  assert.ok(Math.abs(lanternZ + lantern.render.worldHeight * (1 - lantern.render.pivot[1]) + 0.015 - 1.2) < 1e-9);
  assert.ok(Math.abs(resolveFixtureBaseZ(torch, 0.2, 1) - 0.44) < 1e-9);
  assert.equal(resolveFixtureWallOffset(torch), 0.475);
});

test('flame effect advances deterministically through its atlas', () => {
  const flame=getFixtureDefinition(fixtures,'fx_flame_small');
  const a=resolveSpriteFrame({},flame,{x:0,y:0},0);
  const b=resolveSpriteFrame({},flame,{x:0,y:0},1/flame.render.fps);
  assert.equal(a,0);
  assert.equal(b,1);
  assert.equal(resolveSpriteFrame({phase:Math.PI},flame,{x:0,y:0},0),6);
});

test('every emitting sprite has a composed fixture with four directional views', () => {
  for(const id of ['torch_wall','brazier_floor','lantern_hanging','crystal_small']){
    const def=getFixtureDefinition(fixtures,id);
    assert.ok(def,`${id} fixture`);
    assert.equal(def.render.mode,'directionalBillboard4');
    assert.equal(def.render.atlas.count,4);
    assert.ok(def.sockets.light,`${id} light socket`);
  }
  const heat=getFixtureDefinition(fixtures,'fx_heat_haze');
  assert.equal(heat.render.mode,'distortionBillboard');
  assert.ok(heat.material.distortionStrength>0);
});

test('sprite shader consumes emissive maps and the occupancy map for point-light shadows', async () => {
  const shader=await fs.readFile(new URL('../../render/shaders-wgsl.js',import.meta.url),'utf8');
  assert.match(shader, /emissiveTex/);
  assert.match(shader, /spriteMapTex/);
  assert.match(shader, /fn spriteShadowTrace/);
});

test('fixture particles are seeded, renderable and bounded', () => {
  const instances=[{id:'torch-a',spriteId:'torch_wall',x:3,y:4,z:.34,wallDir:'W',phase:0}];
  const a=new FixtureParticleSystem(instances,fixtures,particleConfig,8);
  const b=new FixtureParticleSystem(instances,fixtures,particleConfig,8);
  for(let i=0;i<20;i++){a.update(.1,i*.1);b.update(.1,i*.1);}
  assert.ok(a.count()>0&&a.count()<=8);
  assert.deepEqual(a.getRenderSprites(),b.getRenderSprites());
  assert.ok(a.getRenderSprites().every(p=>['fx_smoke_puff','fx_spark'].includes(p.spriteId)));
});
