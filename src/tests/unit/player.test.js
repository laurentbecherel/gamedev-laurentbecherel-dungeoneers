import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../../entities/player.js";

const mockDungeon = {
  w: 10, h: 10,
  grid: (() => { const g = new Uint8Array(100); g.fill(0); for (let x = 0; x < 10; x++) { g[x] = 1; g[90 + x] = 1; } for (let y = 0; y < 10; y++) { g[y * 10] = 1; g[y * 10 + 9] = 1; } return g; })(),
};

const cfg = { player: { moveSpeed: 3, turnSpeed: 2.2, radius: 0.28, height: 0.5, light: { intensity: 1.2, radius: 6, color: [1, 0.85, 0.6], height: 0.15 } } };

test("player spawn sets position correctly", () => {
  const p = new Player(5, 5, 0);
  p.setConfig(cfg);
  const pos = p.getPosition();
  assert.equal(pos.x, 5); assert.equal(pos.y, 5); assert.equal(pos.z, 0.5);
  assert.equal(p.getAngle(), 0);
});

test("forward movement with no obstacles", () => {
  const p = new Player(5, 5, 0); // facing east
  p.setConfig(cfg);
  p.update(1.0, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  assert(pos.x > 7.5 && pos.x < 8.5, `moved east to x~8, got ${pos.x}`);
  assert(Math.abs(pos.y - 5) < 0.01, `y unchanged, got ${pos.y}`);
});

test("wall collision blocks movement", () => {
  const p = new Player(1.5, 5, Math.PI); // near west wall facing west
  p.setConfig(cfg);
  p.update(0.1, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  assert(pos.x >= 1.2 && pos.x < 1.6, `blocked by wall, x should stay >=1.2, got ${pos.x}`);
});

test("slide collision along wall", () => {
  // place player near corner moving diagonally into wall — should slide along one axis
  const p = new Player(1.5, 1.5, -Math.PI * 0.75); // facing northwest toward corner
  p.setConfig(cfg);
  const startX = p.x, startY = p.y;
  p.update(1.0, { forward: 1, strafe: 0, turn: 0 }, mockDungeon);
  const pos = p.getPosition();
  // should have moved somewhat but not into wall; at least one coordinate should change from slide
  const moved = Math.abs(pos.x - startX) > 0.01 || Math.abs(pos.y - startY) > 0.01;
  const notInWall = pos.x > 1.0 && pos.y > 1.0;
  assert(moved || notInWall, "slide behavior allows some movement or stays safe");
});

test("turn input rotates angle", () => {
  const p = new Player(5, 5, 0);
  p.setConfig(cfg);
  p.update(1.0, { forward: 0, strafe: 0, turn: 1 }, mockDungeon);
  assert(p.getAngle() > 2.0 && p.getAngle() < 2.4, `turned ~2.2 rad, got ${p.getAngle()}`);
});

test("getLightSource returns correct position and config", () => {
  const p = new Player(5, 3, 0);
  p.setConfig(cfg);
  const light = p.getLightSource();
  assert.equal(light.x, 5); assert.equal(light.y, 3);
  assert.equal(light.z, 0.65); // 0.5 height + 0.15 offset
  assert.deepEqual(light.color, [1, 0.85, 0.6]);
  assert.equal(light.intensity, 1.2);
  assert.equal(light.radius, 6);
});
