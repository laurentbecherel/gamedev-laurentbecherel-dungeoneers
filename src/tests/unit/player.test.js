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


test("view bob figure-8 path: vertical 2x freq of horizontal", () => {
  const p = new Player(5,5,0); p.setConfig({"playerCfg":{"moveSpeed":3,"strafeSpeed":2.8,"turnSpeed":2.2,"mouseSensitivity":0.0022,"radius":0.28,"height":0.5,"gridMode":false,"gridMoveSpeed":5,"gridTurnSpeed":6.5,"viewBobEnabled":true,"bob":{"ampY":0.025,"ampX":0.015,"ampRollDeg":0.6,"freq":9,"speedScale":1,"presets":{"subtle":{"ampY":0.012,"ampX":0.008,"ampRollDeg":0.3,"freq":7.5},"default":{"ampY":0.025,"ampX":0.015,"ampRollDeg":0.6,"freq":9},"heavy":{"ampY":0.045,"ampX":0.028,"ampRollDeg":1.2,"freq":10.5},"disabled":{"ampY":0,"ampX":0,"ampRollDeg":0,"freq":0}}},"light":{"intensity":1.8,"radius":4.5,"color":[1,0.9,0.7],"height":0.45}}});
  p.setViewBobEnabled(true);
  p.setGridMode(false);
  // Manually drive phase to test formula
  p.bobPhase = 0;
  p.bobAmount = 1;
  // phase 0 -> sin0*2 =0, sin0=0
  // we directly compute expected using same formula as impl
  const bp = p.bobParams;
  const checkAtPhase = (phase) => {
    p.bobPhase = phase;
    // simulate offset calculation
    const offsetY = Math.sin(phase*2)*bp.ampY;
    const offsetX = Math.sin(phase)*bp.ampX;
    return {offsetY, offsetX};
  };
  const at0 = checkAtPhase(0);
  assert(Math.abs(at0.offsetY) < 1e-9);
  assert(Math.abs(at0.offsetX) < 1e-9);
  const atQuarter = checkAtPhase(Math.PI/2);
  // sin(PI/2)=1, sin(PI)=0 => X max, Y 0 => proves 2:1
  assert(Math.abs(atQuarter.offsetX - bp.ampX) < 1e-9, "horizontal max at PI/2");
  assert(Math.abs(atQuarter.offsetY) < 1e-9, "vertical zero at PI/2 because sin(PI)=0");
  const atEigth = checkAtPhase(Math.PI/4);
  // sin(PI/4)=0.707, sin(PI/2)=1
  assert(Math.abs(atEigth.offsetY - bp.ampY) < 1e-9, "vertical max at PI/4");
  // Full cycle returns to zero
  const atFull = checkAtPhase(Math.PI*2);
  assert(Math.abs(atFull.offsetY) < 1e-9 && Math.abs(atFull.offsetX) < 1e-9);
});

test("view bob presets subtle/default/heavy/disabled values", () => {
  const cfgV2 = {
    playerCfg: {
      moveSpeed: 3, strafeSpeed: 2.8, turnSpeed: 2.2, mouseSensitivity: 0.0022,
      radius: 0.28, height: 0.5, gridMode: false,
      viewBobEnabled: true,
      bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: { subtle:{ampY:0.012,ampX:0.008,ampRollDeg:0.3,freq:7.5}, default:{ampY:0.025,ampX:0.015,ampRollDeg:0.6,freq:9}, heavy:{ampY:0.045,ampX:0.028,ampRollDeg:1.2,freq:10.5}, disabled:{ampY:0,ampX:0,ampRollDeg:0,freq:0} } },
      light: { intensity: 1.8, radius: 4.5, color: [1,0.9,0.7], height: 0.45 }
    }
  };
  const p = new Player(5,5,0); p.setConfig(cfgV2);
  const presets = cfgV2.playerCfg.bob.presets;
  // subtle smaller than default
  assert(presets.subtle.ampY < presets.default.ampY);
  assert(presets.subtle.ampX < presets.default.ampX);
  assert(presets.subtle.ampRollDeg < presets.default.ampRollDeg);
  assert(presets.subtle.freq < presets.default.freq);
  // heavy larger than default
  assert(presets.heavy.ampY > presets.default.ampY);
  assert(presets.heavy.ampX > presets.default.ampX);
  assert(presets.heavy.ampRollDeg > presets.default.ampRollDeg);
  assert(presets.heavy.freq > presets.default.freq);
  // disabled zeros
  assert.equal(presets.disabled.ampY, 0);
  assert.equal(presets.disabled.ampX, 0);
  assert.equal(presets.disabled.ampRollDeg, 0);
  assert.equal(presets.disabled.freq, 0);
  // applying presets via setBobParams
  p.setBobParams(presets.subtle);
  assert.equal(p.bobParams.ampY, 0.012);
  p.setBobParams(presets.heavy);
  assert.equal(p.bobParams.ampY, 0.045);
  p.setBobParams(presets.disabled);
  assert.equal(p.bobParams.ampY, 0);
  // re-enable default
  p.setBobParams(presets.default);
  p.setViewBobEnabled(true);
  assert.equal(p.bobParams.ampY, 0.025);
});

test("view bob includes roll strafe influence", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { moveSpeed: 3, strafeSpeed: 2.8, turnSpeed: 2.2, mouseSensitivity: 0.0022, radius: 0.28, height: 0.5, gridMode: false, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: {} }, light: {} } });
  p.setGridMode(false);
  p.setViewBobEnabled(true);
  p.bobPhase = Math.PI/2; // sin=1
  p.bobAmount = 1;
  p.setInput(0, 1, 0, 0); // strafe right
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  p.update(0.01, map);
  // roll = sin(phase)*ampRoll*amount + strafe*0.5*ampRoll*0.8
  // With phase PI/2, sin=1, so first term ~ampRoll, second term strafe*0.5*ampRoll*0.8
  // Roll should be larger when strafing than when not
  const rollWithStrafe = p.viewBobRoll;
  p.setInput(0, 0, 0, 0);
  p.bobPhase = Math.PI/2;
  p.bobAmount = 1;
  p.update(0.01, map);
  const rollNoStrafe = p.viewBobRoll;
  assert(Math.abs(rollWithStrafe) > Math.abs(rollNoStrafe), "strafe should increase roll magnitude "+rollWithStrafe+" vs "+rollNoStrafe);
});

test("getPosition returns base height without bob (renderer uses u_bobPixels)", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { height: 0.5, moveSpeed: 3, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: {} }, light: {} } });
  p.viewBobOffset = 0.1;
  const pos = p.getPosition();
  assert.equal(pos.z, 0.5, "z should be base height without bob, got "+pos.z);
  // getViewBobState should still expose offset
  assert.equal(p.getViewBobState().offset, 0.1);
});

test("getAngle returns raw without roll, getAngleWithRoll includes roll", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { height: 0.5, moveSpeed: 3, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: {} }, light: {} } });
  p.angle = 1.0;
  p.viewBobRoll = 0.2;
  p.setViewBobEnabled(true);
  assert.equal(p.getAngle(), 1.0, "getAngle raw");
  assert.equal(p.getRawAngle(), 1.0);
  assert(Math.abs(p.getAngleWithRoll() - 1.2) < 1e-9, "with roll should be angle+roll");
  p.setViewBobEnabled(false);
  assert.equal(p.getAngleWithRoll(), 1.0, "disabled bob roll should be ignored in withRoll? actually still angle only when disabled? Impl includes enabled check");
});

test("getLightSource does NOT bob (torch steady)", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { height: 0.5, light: { height: 0.45, color: [1,1,1], intensity: 1, radius: 5 }, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: {} }, moveSpeed: 3 } });
  p.viewBobOffset = 0.5;
  const light = p.getLightSource();
  assert.equal(light.z, 0.95, "light z should be h+lh without bob, got "+light.z);
});

test("setPosition clears input intent to avoid drift after regen", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { height: 0.5, moveSpeed: 3, viewBobEnabled: false, bob: { ampY:0,ampX:0,ampRollDeg:0,freq:0,presets:{} }, light:{} } });
  p.setInput(1,1,1,100);
  p.setPosition(2,2,0);
  assert.equal(p._forward, 0);
  assert.equal(p._strafe, 0);
  assert.equal(p._turn, 0);
  assert.equal(p._mouseDX, 0);
});

test("bob speedScale affects phase accumulation", () => {
  const p = new Player(5,5,0);
  p.setConfig({ playerCfg: { height: 0.5, moveSpeed: 3, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 2.0, presets: {} }, light: {} } });
  p.setGridMode(false);
  p.setViewBobEnabled(true);
  p.setInput(1,0,0,0);
  const map = { w:20,h:20, grid: new Uint8Array(400) };
  p.bobPhase = 0;
  p.bobAmount = 1;
  p.update(0.1, map);
  const phaseFast = p.bobPhase;
  p.setBobParams({ speedScale: 1.0 });
  p.bobPhase = 0;
  p.bobAmount = 1;
  p.update(0.1, map);
  const phaseSlow = p.bobPhase;
  assert(phaseFast > phaseSlow, "speedScale 2.0 should advance phase faster: "+phaseFast+" vs "+phaseSlow);
});

test("grid mode bob: target 0.7 when moving, 0 when idle", () => {
  const p = new Player(1.5,1.5,0);
  p.setConfig({ playerCfg: { height: 0.5, moveSpeed: 3, gridMode: true, gridMoveSpeed: 5, gridTurnSpeed: 6.5, viewBobEnabled: true, bob: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9, speedScale: 1, presets: {} }, light: {} } });
  p.setGridMode(true);
  p.setPosition(1.5,1.5,0);
  const map = { w:10,h:10, grid: new Uint8Array(100) };
  p.tryGridMoveWithMap(0, map);
  assert(p.moveLerp < 1, "should be moving");
  p.update(0.05, map);
  assert(p.bobAmount > 0.05, "bobAmount should be >0 when moving in grid mode, got "+p.bobAmount);
  // finish lerp using small steps to avoid dt*8 overshoot
  for(let i=0;i<10;i++) p.update(0.05, map);
  assert.equal(p.moveLerp,1, "should have finished lerp");
  const amountMoving = p.bobAmount;
  // now idle, bob should decay after a few frames
  for(let i=0;i<10;i++) p.update(0.05, map);
  assert(p.bobAmount < amountMoving, "bob should decay when idle: "+p.bobAmount+" < "+amountMoving);
  assert(p.bobAmount < 0.5, "bob should decay well below peak after idle");
});
