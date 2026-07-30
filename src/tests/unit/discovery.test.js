import test from "node:test";
import assert from "node:assert/strict";
import { DiscoveryManager, getRoomAt } from "../../world/discovery.js";

function makeMockDungeon() {
  const w = 10, h = 10;
  const grid = new Uint8Array(w * h).fill(1);
  const rooms = [
    { x: 1, y: 1, w: 3, h: 3 },
    { x: 6, y: 1, w: 3, h: 3 },
    { x: 1, y: 6, w: 3, h: 3 },
  ];
  function carve(x, y, ww, hh) {
    for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < ww; dx++) {
      const idx = (y + dy) * w + (x + dx);
      grid[idx] = 0;
    }
  }
  carve(1, 1, 3, 3);
  carve(6, 1, 3, 3);
  carve(1, 6, 3, 3);
  carve(3, 2, 4, 1);
  carve(2, 3, 1, 4);
  return { w, h, grid, rooms };
}

const defaultCfg = {
  reveal: { peekDistance: 1, corridorRevealRadius: 4, animationDuration: 400, dither: { pattern: "random" } },
  trail: { maxPoints: 1024, onlyDiscovered: true, dash: [5, 4], opacity: 0.5 },
};

test("discovery starts all false", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  assert.equal(disc.getDiscoveredCount(), 0);
  assert.equal(disc.isDiscovered(2, 2), false);
});

test("spawn reveals only starting room + 1 peek, not whole floor", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  const newly = disc.markDiscoveredAt(2, 2, d);
  assert(newly.length > 0);
  const walkable = disc.getWalkableDiscoveredCount(d);
  assert(walkable < 15, `walkable ${walkable} <15`);
  assert.equal(disc.isDiscovered(2, 2), true);
  assert.equal(disc.isDiscovered(7, 7), false);
  assert.equal(disc.isDiscovered(7, 2), false);
});

test("entering new room reveals entire room interior + perimeter", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  disc.markDiscoveredAt(2, 2, d);
  const before = disc.getDiscoveredCount();
  disc.markDiscoveredAt(7, 2, d);
  const after = disc.getDiscoveredCount();
  assert(after > before);
  assert.equal(disc.isDiscovered(6, 1), true);
  assert.equal(disc.isDiscovered(7, 2), true);
  assert.equal(disc.isDiscovered(8, 3), true);
});

test("peek invariant: inside room sees 1 beyond doorway but not 2 beyond", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  disc.markDiscoveredAt(2, 2, d);
  assert.equal(disc.isDiscovered(4, 2), true);
  assert.equal(disc.isDiscovered(5, 2), true);
  assert.equal(disc.isDiscovered(6, 2), false);
  assert.equal(disc.isDiscovered(7, 2), false);
});

test("corridor walking reveals incremental and 1 peek into room", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  disc.markDiscoveredAt(2, 2, d);
  disc.markDiscoveredAt(4, 2, d);
  assert.equal(disc.isDiscovered(4, 2), true);
  assert.equal(disc.isDiscovered(5, 2), true);
  disc.markDiscoveredAt(5, 2, d);
  assert.equal(disc.isDiscovered(6, 2), true);
  assert.equal(disc.isDiscovered(1, 6), false);
});

test("path tracking: append on move, no duplicate, reset clears", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  disc.addPathPoint(2, 2);
  assert.equal(disc.getPath().length, 1);
  disc.addPathPoint(2, 2);
  assert.equal(disc.getPath().length, 1);
  disc.addPathPoint(3, 2);
  assert.equal(disc.getPath().length, 2);
  disc.addPathPoint(2, 2);
  assert.equal(disc.getPath().length, 3);
  disc.reset(d);
  assert.equal(disc.getPath().length, 0);
  assert.equal(disc.getDiscoveredCount(), 0);
});

test("idempotent marking returns empty on second call same room", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  const first = disc.markDiscoveredAt(2, 2, d);
  const second = disc.markDiscoveredAt(2, 2, d);
  assert(first.length > 0);
  assert.equal(second.length, 0);
});

test("animation: onMapOpened captures pending and advances max order", () => {
  const d = makeMockDungeon();
  const disc = new DiscoveryManager(d, defaultCfg);
  disc.markDiscoveredAt(2, 2, d);
  const pending1 = disc.onMapOpened(0);
  assert(pending1.length > 0);
  assert.equal(disc.getAnimationProgress(0, 400), 0);
  assert.equal(disc.getAnimationProgress(200, 400), 0.5);
  assert.equal(disc.getAnimationProgress(500, 400), 1);
  const pending2 = disc.onMapOpened(600);
  assert.equal(pending2.length, 0);
  disc.markDiscoveredAt(7, 2, d);
  const pending3 = disc.onMapOpened(700);
  assert(pending3.length > 0);
});
