// Sprite registry — defines enviro light props (torch, brazier, lantern, crystal)
// Side-effect module: importing registers sprites in sprite-atlas.
// PBR meta follows mygame pattern: albedo path + normal + ORM + atlas grid + crop + world size + material.
// For Task 6 we provide placeholder paths that may not exist on disk yet — placeholder magenta + procedural fallback keeps renderer alive.

import { registerSprite } from '../../render/sprite-atlas.js';

// --- Torch wall sconce — primary light ---
// Single frame for now (flame flipbook can be 4 frames later). Using 64x64 procedural fallback until artist PNG exists.
// Paths point to ./assets/sprites/... which server will serve if files placed; otherwise procedural fallback used.

registerSprite('torch_wall', {
  id: 'torch_wall',
  path: './assets/sprites/torch/torch_wall_albedo.png',
  normalPath: './assets/sprites/torch/torch_wall_normal.png',
  ormPath: './assets/sprites/torch/torch_wall_orm.png',
  heightPath: './assets/sprites/torch/torch_wall_height.png',
  cols: 1,
  rows: 1,
  count: 1,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.58,
  worldWidthFactor: 0.42,
  fps: 7,
  material: { normalStrength: 2.2, baseRoughness: 0.85, baseMetal: 0.0, rimStrength: 1.2 },
  category: 'torch',
  emitsLight: true,
});

// --- Standing brazier ---
registerSprite('brazier_floor', {
  id: 'brazier_floor',
  path: './assets/sprites/brazier/brazier_floor_albedo.png',
  normalPath: './assets/sprites/brazier/brazier_floor_normal.png',
  ormPath: './assets/sprites/brazier/brazier_floor_orm.png',
  heightPath: './assets/sprites/brazier/brazier_floor_height.png',
  cols: 1,
  rows: 1,
  count: 1,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 1.05,
  worldWidthFactor: 0.55,
  fps: 5,
  material: { normalStrength: 1.8, baseRoughness: 0.8, baseMetal: 0.2, rimStrength: 1.0 },
  category: 'brazier',
  emitsLight: true,
});

// --- Hanging lantern (steadier, for future Entry theming) ---
registerSprite('lantern_hanging', {
  id: 'lantern_hanging',
  path: './assets/sprites/lantern/lantern_albedo.png',
  normalPath: './assets/sprites/lantern/lantern_normal.png',
  ormPath: './assets/sprites/lantern/lantern_orm.png',
  cols: 1,
  rows: 1,
  count: 1,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.65,
  worldWidthFactor: 0.38,
  fps: 2,
  material: { normalStrength: 1.5, baseRoughness: 0.6, baseMetal: 0.45, rimStrength: 0.8 },
  category: 'lantern',
  emitsLight: true,
});

// --- Small glowing crystal (pulse blue, no shadow) ---
registerSprite('crystal_small', {
  id: 'crystal_small',
  path: './assets/sprites/crystal/crystal_small_albedo.png',
  normalPath: './assets/sprites/crystal/crystal_small_normal.png',
  ormPath: './assets/sprites/crystal/crystal_small_orm.png',
  cols: 1,
  rows: 1,
  count: 1,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.45,
  worldWidthFactor: 0.45,
  fps: 2,
  material: { normalStrength: 1.2, baseRoughness: 0.45, baseMetal: 0, rimStrength: 1.5, emissiveStrength: 0.6 },
  category: 'crystal',
  emitsLight: true,
});

// Future expansion: additional sprites register here using same schema.
// Example:
// registerSprite('candle_cluster', { path:'./assets/sprites/candle/candle.png', cols:1, rows:1, count:1, worldHeight:0.35, worldWidthFactor:0.5, ...});
