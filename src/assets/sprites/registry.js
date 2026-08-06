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
  emissivePath: './assets/sprites/torch/torch_wall_emissive.png',
  cols: 4,
  rows: 1,
  count: 4,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.62,
  worldWidthFactor: 0.55,
  fps: 0,
  renderMode: 'directionalBillboard4',
  views: { back: 0, right: 1, front: 2, left: 3 },
  pivot: [0.5, 0.84],
  orientation: { source: 'wallDir', facesAwayFromWall: true, sectorHysteresisDeg: 5 },
  sockets: {
    light: { local: [0.14, 0, 0.46] },
    flame: { local: [0.08, 0, 0.42] },
    smoke: { local: [0.08, 0, 0.64] },
    sparks: { local: [0.08, 0, 0.50] },
  },
  layers: [{ id: 'flame', spriteId: 'fx_flame_small', socket: 'flame', scale: 1, phaseFromInstance: true }],
  material: { normalStrength: 1.35, baseRoughness: 0.78, baseMetal: 0.55, rimStrength: 0.55, emissiveStrength: 0 },
  category: 'torch',
  emitsLight: true,
});

registerSprite('fx_flame_small', {
  id: 'fx_flame_small',
  path: './assets/sprites/effects/flame_small_albedo.png',
  normalPath: './assets/sprites/effects/flame_small_normal.png',
  ormPath: './assets/sprites/effects/flame_small_orm.png',
  emissivePath: './assets/sprites/effects/flame_small_emissive.png',
  cols: 12, rows: 1, count: 12, cellW: 48, cellH: 48,
  cropX: 0, cropY: 0, cropW: 48, cropH: 48,
  worldHeight: 0.2, worldWidthFactor: 0.62, fps: 14,
  renderMode: 'animatedBillboard', pivot: [0.5, 1],
  material: { normalStrength: 0, baseRoughness: 0.9, baseMetal: 0, rimStrength: 0, emissiveStrength: 0.72 },
  category: 'effect', emitsLight: false,
});

// Apply editable fixture manifests without making the renderer understand the
// config schema. Registry metadata remains the rendering boundary.
export function registerFixtureDefinitions(config) {
  const defs = [...(config?.fixtures || []), ...(config?.effects || [])];
  for (const def of defs) {
    const r = def.render;
    if (!def?.id || !(r?.albedo || r?.distortion) || !r?.atlas) continue;
    registerSprite(def.id, {
      path: r.albedo || r.distortion, normalPath: r.normal, ormPath: r.orm, emissivePath: r.emissive,
      distortionPath: r.distortion,
      cols: r.atlas.cols, rows: r.atlas.rows, count: r.atlas.count,
      cellW: r.atlas.cellW, cellH: r.atlas.cellH,
      cropX: r.atlas.cropX || 0, cropY: r.atlas.cropY || 0,
      cropW: r.atlas.cropW || r.atlas.cellW, cropH: r.atlas.cropH || r.atlas.cellH,
      worldHeight: r.worldHeight, worldWidthFactor: r.worldWidthFactor,
      fps: r.fps || 0, renderMode: r.mode, views: r.views || null,
      pivot: r.pivot || [0.5, 1], orientation: def.orientation || null,
      sockets: def.sockets || null, layers: def.layers || [], material: def.material || {},
      category: def.category || (config?.effects?.includes(def) ? 'effect' : 'fixture'),
      emitsLight: def.emitsLight !== false && !config?.effects?.includes(def),
    });
  }
}

// --- Standing brazier ---
registerSprite('brazier_floor', {
  id: 'brazier_floor',
  path: './assets/sprites/brazier/brazier_floor_albedo.png',
  normalPath: './assets/sprites/brazier/brazier_floor_normal.png',
  ormPath: './assets/sprites/brazier/brazier_floor_orm.png',
  emissivePath: './assets/sprites/brazier/brazier_floor_emissive.png',
  cols: 4,
  rows: 1,
  count: 4,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.9,
  worldWidthFactor: 0.78,
  fps: 0,
  renderMode: 'directionalBillboard4', views: { back:0, right:1, front:2, left:3 },
  material: { normalStrength: 1, baseRoughness: 0.8, baseMetal: 0.2, rimStrength: 0.45 },
  category: 'brazier',
  emitsLight: true,
});

// --- Hanging lantern (steadier, for future Entry theming) ---
registerSprite('lantern_hanging', {
  id: 'lantern_hanging',
  path: './assets/sprites/lantern/lantern_hanging_albedo.png',
  normalPath: './assets/sprites/lantern/lantern_hanging_normal.png',
  ormPath: './assets/sprites/lantern/lantern_hanging_orm.png',
  emissivePath: './assets/sprites/lantern/lantern_hanging_emissive.png',
  cols: 4,
  rows: 1,
  count: 4,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.65,
  worldWidthFactor: 0.52,
  fps: 0,
  renderMode: 'directionalBillboard4', views: { back:0, right:1, front:2, left:3 },
  material: { normalStrength: 0.9, baseRoughness: 0.6, baseMetal: 0.45, rimStrength: 0.3, emissiveStrength: 0.62 },
  category: 'lantern',
  emitsLight: true,
});

// --- Small glowing crystal (pulse blue, no shadow) ---
registerSprite('crystal_small', {
  id: 'crystal_small',
  path: './assets/sprites/crystal/crystal_small_albedo.png',
  normalPath: './assets/sprites/crystal/crystal_small_normal.png',
  ormPath: './assets/sprites/crystal/crystal_small_orm.png',
  emissivePath: './assets/sprites/crystal/crystal_small_emissive.png',
  cols: 4,
  rows: 1,
  count: 4,
  cellW: 64,
  cellH: 64,
  cropX: 0,
  cropY: 0,
  cropW: 64,
  cropH: 64,
  worldHeight: 0.46,
  worldWidthFactor: 0.82,
  fps: 0,
  renderMode: 'directionalBillboard4', views: { back:0, right:1, front:2, left:3 },
  material: { normalStrength: 0.8, baseRoughness: 0.45, baseMetal: 0, rimStrength: 0.42, emissiveStrength: 0.48 },
  category: 'crystal',
  emitsLight: true,
});

// Future expansion: additional sprites register here using same schema.
// Example:
// registerSprite('candle_cluster', { path:'./assets/sprites/candle/candle.png', cols:1, rows:1, count:1, worldHeight:0.35, worldWidthFactor:0.5, ...});
