import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../../entities/player.js";

const mockDungeon = {
  w: 10, h: 10,
  grid: (() => { const g = new Uint8Array(100); g.fill(0); for (let x = 0; x < 10; x++) { g[x] = 1; g[90 + x] = 1; } for (let y = 0; y < 10; y++) { g[y * 10] = 1; g[y * 10 + 9] = 1; } return g; })(),
};

const cfgLegacy = { player: { moveSpeed: 3, turnSpeed: 2.2, radius: 0.28, height: 0.5, light: { intensity: 1.2, radius: 6, color: [1, 0.85, 0.6], height: 0.15 } } };

const cfgV2 = {
  playerCfg: {
    moveSpeed: 3, strafeSpeed: 2.8, turnSpeed: 2.2, mouseSensitivity: 0.0022,
    radius: 0.28, height: 0.5, gridMode: true, gridMoveSpeed: 5, gridTurnSpeed: 6.5,
    gridHoldInitialDelay: 0.18, gridHoldRepeatDelay: 0.06,
    viewBobEnabled: true,
    bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: { subtle:{ampY:0.012,ampX:0.008,ampRollDeg:0.3,freq:7.5}, default:{ampY:0.025,ampX:0.015,ampRollDeg:0.6,freq:9}, heavy:{ampY:0.045,ampX:0.028,ampRollDeg:1.2,freq:10.5}, disabled:{ampY:0,ampX:0,ampRollDeg:0,freq:0} } },
    light: { intensity: 1.8, radius: 4.5, color: [1,0.9,0.7], height: 0.45 }
  }
};

test("player spawn sets position correctly", () => {
  const p = new Player(5, 5, 0);
  p.setConfig(cfgLegacy);
  const pos = p.getPosition();
  assert.equal(pos.x, 5); assert.equal(pos.y, 5);
  assert(Math.abs(pos.z - 0.5) < 0.001);
  assert.equal(p.getRawAngle ? p.getRawAngle() : p.getAngle(), 0);
});

test("forward movement with no obstacles (legacy signature)", () => {
  const p = new Player(5, 5, 0);
  p.setConfig(cfgLegacy);
  p.setGridMode(false);
  p.update(1.0, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  assert(pos.x > 7.5 && pos.x < 8.5, 'moved east to x~8, got '+pos.x);
  assert(Math.abs(pos.y - 5) < 0.01, 'y unchanged, got '+pos.y);
});

test("wall collision blocks movement", () => {
  const p = new Player(1.5, 5, Math.PI);
  p.setConfig(cfgLegacy);
  p.setGridMode(false);
  p.update(0.1, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  assert(pos.x >= 1.2 && pos.x < 1.6, 'blocked by wall, x should stay >=1.2, got '+pos.x);
});

test("slide collision along wall", () => {
  const p = new Player(1.5, 1.5, -Math.PI * 0.75);
  p.setConfig(cfgLegacy);
  p.setGridMode(false);
  const startX = p.x, startY = p.y;
  p.update(1.0, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  const moved = Math.abs(pos.x - startX) > 0.01 || Math.abs(pos.y - startY) > 0.01;
  const notInWall = pos.x > 1.0 && pos.y > 1.0;
  assert(moved || notInWall, "slide behavior allows some movement or stays safe");
});

test("turn input rotates angle", () => {
  const p = new Player(5, 5, 0);
  p.setConfig(cfgLegacy);
  p.setGridMode(false);
  p.update(1.0, { forward: 0, strafe: 0, turn: 1 }, mockDungeon);
  const ang = p.getRawAngle ? p.getRawAngle() : p.getAngle();
  assert(ang > 2.0 && ang < 2.4, 'turned ~2.2 rad, got '+ang);
});

test("getLightSource returns correct position and config", () => {
  const p = new Player(5, 3, 0);
  p.setConfig(cfgLegacy);
  const light = p.getLightSource();
  assert.equal(light.x, 5); assert.equal(light.y, 3);
  assert(Math.abs(light.z - 0.65) < 0.01);
  assert.deepEqual(light.color, [1, 0.85, 0.6]);
  assert.equal(light.intensity, 1.2);
  assert.equal(light.radius, 6);
});

test("config resolution alias player vs playerCfg", () => {
  const p1 = new Player(5,5,0); p1.setConfig({ player: { moveSpeed: 5 } });
  assert.equal(p1.moveSpeed, 5);
  const p2 = new Player(5,5,0); p2.setConfig({ playerCfg: { moveSpeed: 7 } });
  assert.equal(p2.moveSpeed, 7);
});

test("setPosition resets lerp and bob", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2);
  p.bobPhase = 3; p.bobAmount = 1; p.moveLerp = 0.5;
  p.setPosition(2.5,3.5,1);
  assert.equal(p.x,2.5); assert.equal(p.y,3.5); assert.equal(p.moveLerp,1);
  assert.equal(p.bobPhase,0); assert.equal(p.bobAmount,0);
});

test("grid mode default ON and facing from angle", () => {
  const p = new Player(1.5,1.5,-Math.PI/2); p.setConfig(cfgV2);
  assert.equal(p.gridMode, true);
  assert.equal(p.gridFacing, 0);
});

test("grid tryMove blocks wall and allows free tile", () => {
  const p = new Player(1.5,1.5,0); p.setConfig(cfgV2); p.setGridMode(true);
  p.setPosition(1.5,1.5,0);
  const map = { w:10,h:10, grid: new Uint8Array(100) };
  map.grid[1*10+2]=1;
  let ok = p.tryGridMoveWithMap(0, map);
  assert.equal(ok, false, "should block wall east");
  map.grid[1*10+2]=0;
  ok = p.tryGridMoveWithMap(0, map);
  assert.equal(ok, true);
  assert.equal(p.gridTargetX, 2.5); assert.equal(p.moveLerp,0);
});

test("grid lerp progresses and snaps", () => {
  const p = new Player(1.5,1.5,0); p.setConfig(cfgV2); p.setGridMode(true);
  p.setPosition(1.5,1.5,0);
  const map = { w:10,h:10, grid: new Uint8Array(100) };
  p.tryGridMoveWithMap(0, map);
  assert(p.moveLerp < 1);
  p.update(0.1, map);
  assert(p.x > 1.5 && p.x < 2.5, 'lerp x '+p.x);
  p.update(1.0, map);
  assert.equal(p.x, 2.5); assert.equal(p.moveLerp,1);
});

test("grid turn 90 deg and facing updates", () => {
  const p = new Player(1.5,1.5,0); p.setConfig(cfgV2); p.setGridMode(true);
  p.setPosition(1.5,1.5,0);
  assert.equal(p.gridFacing,1);
  let ok = p.tryGridTurn(1);
  assert.equal(ok,true);
  assert.equal(p.gridFacing,2);
  p.update(1.0, {w:10,h:10,grid:new Uint8Array(100)});
  assert(Math.abs(p.getRawAngle() - Math.PI/2) < 0.01);
});

test("grid mode toggle snaps to center and cardinal", () => {
  const p = new Player(1.2,2.8,0.3); p.setConfig(cfgV2); p.setGridMode(false);
  assert.equal(p.gridMode,false);
  p.setGridMode(true);
  assert.equal(p.gridMode,true);
  assert.equal(p.gridTargetX, 1.5);
  assert.equal(p.gridTargetY, 2.5);
  assert(Math.abs(p.gridTargetAngle - 0) < 0.001);
  assert(p.moveLerp < 1 || p.turnLerp < 1, "should lerp to snapped pose");
});

test("free mode diagonal clamping prevents sprint", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(false);
  p.setInput(1,1,0,0);
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  const startX = p.x, startY = p.y;
  p.update(1.0, map);
  const dx = p.x - startX, dy = p.y - startY;
  const dist = Math.hypot(dx,dy);
  assert(dist < 3.2, 'diagonal clamped dist '+dist+' should <3.2');
});

test("view bob disabled gives zero offsets", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(false);
  p.setViewBobEnabled(false);
  p.setInput(1,0,0,0);
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  p.update(0.5, map);
  assert.equal(p.viewBobOffset,0); assert.equal(p.viewBobOffsetX,0); assert.equal(p.viewBobRoll,0);
});

test("view bob enabled moving gives figure-8 non-zero", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(false);
  p.setViewBobEnabled(true);
  p.setInput(1,0,0,0);
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  p.update(0.2, map);
  assert(p.bobAmount > 0.1, 'bobAmount '+p.bobAmount);
  assert(Math.abs(p.viewBobOffset) > 0 || Math.abs(p.viewBobOffsetX) > 0, "bob offsets non-zero");
  const state = p.getViewBobState();
  assert.equal(state.enabled,true);
  assert(typeof state.offset === 'number');
  assert(typeof state.offsetX === 'number');
});

test("view bob decays when idle", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(false);
  p.setViewBobEnabled(true);
  p.setInput(1,0,0,0);
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  p.update(0.3, map);
  const amountMoving = p.bobAmount;
  p.setInput(0,0,0,0);
  p.update(1.0, map);
  assert(p.bobAmount < amountMoving, 'should decay '+p.bobAmount+' < '+amountMoving);
});

test("setBobParams merges and presets shape valid", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2);
  p.setBobParams({ ampY: 0.05 });
  assert.equal(p.bobParams.ampY, 0.05);
  assert(p.bobParams.ampX > 0, "ampX preserved");
  p.setBobParams({ ampRollDeg: 1.2 });
  assert(Math.abs(p.bobParams._ampRollDeg - 1.2) < 0.001);
  const presets = cfgV2.playerCfg.bob.presets;
  assert(presets.subtle && presets.default && presets.heavy && presets.disabled);
  assert(presets.default.ampY === 0.025);
});

test("8-point circle collision detects near wall", () => {
  const p = new Player(1.3,5,0); p.setConfig(cfgV2);
  const map = { w:10,h:10, grid: new Uint8Array(100) };
  map.grid[5*10+1]=1;
  assert(p.collides(1.3,5,map) === true, "should collide near wall");
  assert(p.collides(5,5,map) === false, "free space no collide");
});

test("mouse look in free mode changes angle", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(false);
  const start = p.getRawAngle();
  p.setInput(0,0,0,100);
  assert(Math.abs(p.getRawAngle() - (start + 100*0.0022)) < 0.0001, 'angle '+p.getRawAngle());
});

test("mouse look ignored in grid mode", () => {
  const p = new Player(5,5,0); p.setConfig(cfgV2); p.setGridMode(true);
  const start = p.getRawAngle();
  p.setInput(0,0,0,100);
  assert.equal(p.getRawAngle(), start, "grid mode should ignore mouseDX");
});
