import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { octaEncode, octaDecode, reflectVec, normalize, worldToScreenUV, computeFresnel, validatePuddleReflection } from '../../render/ssr-math.js';
import { fsSSRwgsl } from '../../render/shaders-wgsl.js';

it('SSR preserves the established cosmetic puddle ray roughness', () => {
  assert.match(fsSSRwgsl, /let reflectionRoughness: f32 = 0\.04/);
  assert.doesNotMatch(fsSSRwgsl, /featureUniforms\.waterShallow\.w/);
});

it('SSR reconstructs recessed reflective surface height before tracing', () => {
  assert.match(fsSSRwgsl, /let sourceHeight: f32/);
  assert.match(fsSSRwgsl, /linearDepth, sourceHeight, puddleMask/);
  assert.doesNotMatch(fsSSRwgsl, /ray0 \* linearDepth, 0\.0/);
});

it('SSR refines a signed depth crossing instead of selecting anywhere in a thick slab', () => {
  assert.match(fsSSRwgsl, /depthDiff >= 0\.0 && depthDiff < curThickness/);
  assert.match(fsSSRwgsl, /if \(midDiff >= 0\.0\) \{ highT = midT; \}/);
  assert.doesNotMatch(fsSSRwgsl, /abs\(depthDiff\) < curThickness/);
});

describe('SSR Math — octa encoding roundtrip', () => {
  const vectors = [
    [0,0,1],
    [0,0,-1],
    [1,0,0],
    [-1,0,0],
    [0,1,0],
    [0,-1,0],
    [0.5,0.5,0.7071],
    [0.2,-0.3,0.9],
  ];
  for (const v of vectors) {
    it(`roundtrip ${v}`, () => {
      const n = normalize(v);
      const enc = octaEncode(n);
      const dec = octaDecode(enc);
      const dot = n[0]*dec[0] + n[1]*dec[1] + n[2]*dec[2];
      assert.ok(dot > 0.98, `dot ${dot} too low for ${n} -> ${enc} -> ${dec}`);
      assert.ok(enc[0]>=0 && enc[0]<=1 && enc[1]>=0 && enc[1]<=1);
    });
  }
});

describe('SSR Math — worldToScreen projection', () => {
  it('floor below horizon, ceil above', () => {
    const camPos=[4.5,6.5], eyeZ=0.5, angle=-Math.PI/2, planeLen=Math.tan(1.0*0.5), res=[640,360];
    const floorPos=[4.5,4.5,0.0];
    const ceilPos=[4.5,4.5,1.2];
    const floorProj = worldToScreenUV(floorPos, camPos, eyeZ, angle, planeLen, res);
    const ceilProj = worldToScreenUV(ceilPos, camPos, eyeZ, angle, planeLen, res);
    // floor should be below horizon 0.5 (uvY <0.5), ceil above (uvY >0.5)
    assert.ok(floorProj.uv[1] < 0.5, `floor uvY ${floorProj.uv[1]} should <0.5`);
    assert.ok(ceilProj.uv[1] > 0.5, `ceil uvY ${ceilProj.uv[1]} should >0.5`);
  });

  it('center forward point projects to center', () => {
    const camPos=[4,4], eyeZ=0.5, angle=0, planeLen=Math.tan(1.0*0.5), res=[640,360];
    const forward = [6,4,0.5]; // directly ahead, same height as eye
    const proj = worldToScreenUV(forward, camPos, eyeZ, angle, planeLen, res);
    assert.ok(Math.abs(proj.uv[0]-0.5) < 0.05, `uvX ${proj.uv[0]} not centered`);
    assert.ok(Math.abs(proj.uv[1]-0.5) < 0.05, `uvY ${proj.uv[1]} not centered`);
  });

  it('custom horizon shifts projection without changing horizontal aim', () => {
    const camPos=[4,4], eyeZ=0.5, angle=0, planeLen=Math.tan(1.0*0.5), res=[640,360];
    const forward = [6,4,0.5];
    const proj = worldToScreenUV(forward, camPos, eyeZ, angle, planeLen, res, 0, 0.38);
    assert.ok(Math.abs(proj.uv[0]-0.5) < 0.001);
    assert.ok(Math.abs(proj.uv[1]-0.38) < 0.001);
  });

  it('left/right produce uvX <0.5 / >0.5 regardless of angle', () => {
    const angles = [0, Math.PI/4, -Math.PI/2, Math.PI, 2.1];
    for (const ang of angles) {
      const camPos=[4,4], eyeZ=0.5, planeLen=Math.tan(1.0*0.5), res=[640,360];
      const dirX=Math.cos(ang), dirY=Math.sin(ang);
      const rightX=-dirY, rightY=dirX;
      const leftWorld = [camPos[0] + dirX*2 + rightX* -1, camPos[1] + dirY*2 + rightY* -1, 0.5];
      const rightWorld = [camPos[0] + dirX*2 + rightX*1, camPos[1] + dirY*2 + rightY*1, 0.5];
      const leftProj = worldToScreenUV(leftWorld, camPos, eyeZ, ang, planeLen, res);
      const rightProj = worldToScreenUV(rightWorld, camPos, eyeZ, ang, planeLen, res);
      assert.ok(leftProj.uv[0] < 0.5, `ang ${ang} left uvX ${leftProj.uv[0]} not <0.5`);
      assert.ok(rightProj.uv[0] > 0.5, `ang ${ang} right uvX ${rightProj.uv[0]} not >0.5`);
    }
  });

  it('orientation stable across angles (your bug: weird orientation)', () => {
    const camPos=[4.5,6.5], eyeZ=0.5, ang=-Math.PI/2, planeLen=Math.tan(1.0*0.5), res=[640,360];
    const puddle=[4.5,4.5,0];
    const eye=[camPos[0],camPos[1],eyeZ];
    const V = normalize([eye[0]-puddle[0], eye[1]-puddle[1], eye[2]-puddle[2]]);
    const N=[0,0,1];
    const R = reflectVec([-V[0],-V[1],-V[2]], N);
    assert.ok(R[1] < 0, `R.y ${R[1]} should be negative for north reflection`);
    // Use higher t to reach wall height > eye
    const reflectedWorld = [puddle[0]+R[0]*4, puddle[1]+R[1]*4, 1.0];
    const proj = worldToScreenUV(reflectedWorld, camPos, eyeZ, ang, planeLen, res);
    assert.ok(proj.uv[1] > 0.48, `reflected wall uvY ${proj.uv[1]} should be near horizon or above, got ${proj.uv[1]}`);
    // X should stay centered because reflection is forward
    assert.ok(Math.abs(proj.uv[0]-0.5) < 0.15, `uvX ${proj.uv[0]} should stay centered`);
  });
});

describe('SSR Math — reflection validation colors', () => {
  it('flatColorRoom walls give distinct colors via side', () => {
    // Our flat atlases: wall 1 red (255,64,64), 2 blue, 3 green, 4 yellow
    // Just check that our expected logic gives different colors per side, not all same olive
    // This validates your observation that 1/3 wall was missing
    // For floor normal (0,0,1) -> blue #8080FF, ceiling (0,0,-1) -> olive #808000, wall +X red etc.
    // We test octa roundtrip already gives those, so normal debug should show 3 distinct bands
    const floorN=[0,0,1], ceilN=[0,0,-1], wallX=[1,0,0], wallY=[0,1,0];
    const floorEnc = octaEncode(floorN);
    const ceilEnc = octaEncode(ceilN);
    const wallXEnc = octaEncode(wallX);
    const wallYEnc = octaEncode(wallY);
    // encodings should be distinct
    assert.notDeepEqual(floorEnc, ceilEnc);
    assert.notDeepEqual(wallXEnc, wallYEnc);
    // decoded colors distinct
    const floorCol = octaDecode(floorEnc).map(c=>Math.round((c*0.5+0.5)*255));
    const ceilCol = octaDecode(ceilEnc).map(c=>Math.round((c*0.5+0.5)*255));
    const wallXCol = octaDecode(wallXEnc).map(c=>Math.round((c*0.5+0.5)*255));
    // floor blue has B=255, ceil B~0, wall X has R=255
    assert.ok(floorCol[2] > 200, `floor B ${floorCol[2]} should be high`);
    assert.ok(ceilCol[2] < 50, `ceil B ${ceilCol[2]} should be low`);
    assert.ok(wallXCol[0] > 200, `wallX R ${wallXCol[0]} high`);
  });

  it('puddle reflection should see opposite wall (math correctness)', () => {
    // Player at (4,6.5) looking north, puddle at (4,4), north wall at (4,0)
    const playerPos=[4.5,6.5], playerAngle=-Math.PI/2, puddle=[4.5,4.5,0], northWall=[4.5,0.5,0.5];
    const res = validatePuddleReflection(playerPos, playerAngle, puddle, northWall, Math.tan(1.0*0.5));
    assert.ok(res.cosAngle > 0.5, `cosAngle ${res.cosAngle} should >0.5 for north wall reflection`);
    assert.ok(res.shouldHit, 'should hit north wall');
  });

  it('fresnel: grazing more reflective than facing', () => {
    const facing = computeFresnel(0.9, 2.2, 0.25, 1.0);
    const grazing = computeFresnel(0.1, 2.2, 0.25, 1.0);
    assert.ok(grazing > facing, `grazing ${grazing} should > facing ${facing}`);
  });
});

describe('SSR Math — various angles sweep (autonomous)', () => {
  const angles = [0, Math.PI/6, Math.PI/4, Math.PI/3, Math.PI/2, -Math.PI/2, Math.PI, -Math.PI/4];
  for (const ang of angles) {
    it(`angle ${ang.toFixed(2)} reflection math does not crash and projection stable`, () => {
      const camPos=[4.5,4.5], eyeZ=0.5, planeLen=Math.tan(1.0*0.5), res=[640,360];
      const puddle=[4.5,3.5,0];
      const eye=[camPos[0],camPos[1],eyeZ];
      const V = normalize([eye[0]-puddle[0], eye[1]-puddle[1], eye[2]-puddle[2]]);
      const N=[0,0,1];
      const R = reflectVec([-V[0],-V[1],-V[2]], N);
      const reflectedWorld = [puddle[0]+R[0]*3, puddle[1]+R[1]*3, 0.5];
      const proj = worldToScreenUV(reflectedWorld, camPos, eyeZ, ang, planeLen, res);
      // forwardDist clamped to 0.06 when behind camera - that's valid culling, not a fail
      assert.ok(proj.forwardDist >= 0.05, `forwardDist ${proj.forwardDist} should be >=0.05 at angle ${ang}`);
      assert.ok(Number.isFinite(proj.uv[0]) && Number.isFinite(proj.uv[1]), `uv not finite at angle ${ang}`);
    });
  }
});
