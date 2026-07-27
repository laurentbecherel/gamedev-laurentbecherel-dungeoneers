// Torch placement with min distance constraint and corridor bias

import { hash2i } from "./dungeon/themes.js";

export function generateDungeonItems(dungeon, config) {
  const itemsCfg = config.items || {};
  const maxTorches = itemsCfg.maxTorches ?? 24;
  const minDist = itemsCfg.minTorchDist ?? 6;
  const corridorBias = itemsCfg.corridorBias ?? 1.5;
  const torchColors = config.torchColors || [
    {r:1, g:0.6, b:0.2, name:"warm"},
    {r:0.4, g:0.7, b:1, name:"cool"},
    {r:0.3, g:1, b:0.4, name:"green"},
    {r:0.8, g:0.3, b:1, name:"purple"},
  ];

  const {w, h, grid, rooms} = dungeon;
  const items = [];
  const lights = [];
  const placed = [];

  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }
  function tooClose(x, y) { return placed.some(p => dist2(x, y, p.x, p.y) < minDist * minDist); }

  // Collect candidate floor cells with corridor bias weighting
  const candidates = [];
  const roomSet = new Set();
  for (const r of rooms) {
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++) roomSet.add((r.y+dy)*w + (r.x+dx));
  }
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const idx = y*w + x;
      if (grid[idx] !== 0) continue; // not floor
      const inRoom = roomSet.has(idx);
      const weight = inRoom ? 1 : corridorBias;
      candidates.push({x: x+0.5, y: y+0.5, weight, idx});
    }
  }

  // Weighted shuffle via hash ordering for determinism
  candidates.sort((a,b) => hash2i(a.idx, dungeon.seed, 1) - hash2i(b.idx, dungeon.seed, 1));

  // Greedy place respecting min distance
  let colorIdx = 0;
  for (const c of candidates) {
    if (items.length >= maxTorches) break;
    if (tooClose(c.x, c.y)) continue;
    // probabilistic acceptance based on weight (corridor bias)
    const roll = hash2i(c.idx, dungeon.seed, 2);
    if (roll > Math.min(1, c.weight / corridorBias)) continue;

    const color = torchColors[colorIdx % torchColors.length];
    colorIdx++;

    items.push({x:c.x, y:c.y, type:"torch", color});
    lights.push({x:c.x, y:c.y, z:0.8, color, intensity:1.8, radius:4.5, flicker:true});
    placed.push({x:c.x, y:c.y});
  }

  return {items, lights};
}
