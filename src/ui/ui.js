// UI — WebGL-based UI subsystem for map overlay and HUD.
// Task5: now supports fog-of-war discovery with retro dither + dashed trail.
// Prepares map texture data for WebGL rendering (no separate 2D canvas).

import { generateMapTextureData } from "../render/map-ui.js";

export class UI {
  constructor(cfg) {
    this.cfg = cfg;
    this.dungeon = null;
    this.uiCfg = cfg?.map || cfg?.ui?.map || { position: "top-right", size: 160, opacity: 0.9 };
  }

  setDungeon(dungeon) { this.dungeon = dungeon; }

  // New signature: drawMap(dungeon, player, renderer, discovery, animProgress, discoveryCfg)
  // Keeps backward compat: if 3rd arg is renderer and 4th is discovery, handle.
  drawMap(dungeon, player, renderer, discovery = null, animProgress = 1, discoveryCfg = null) {
    if (!dungeon || !renderer) return;
    const d = dungeon || this.dungeon;
    if (!d) return;
    // If renderer is actually discovery (old calls), shift
    // Detect if 3rd param looks like renderer (has renderMapUI) vs discovery (has isDiscovered)
    let actualRenderer = renderer;
    let actualDiscovery = discovery;
    let actualAnim = animProgress;
    let actualDiscoveryCfg = discoveryCfg;

    // If renderer passed as discovery (legacy UI.drawMap(dungeon, player, renderer) from old Game)
    // then discovery param is null and we are fine.

    // If discovery is number (animProgress passed as 4th), handle
    if (typeof actualDiscovery === "number") {
      actualAnim = actualDiscovery;
      actualDiscovery = null;
    }

    const uiCfg = this.uiCfg;
    const discCfg = actualDiscoveryCfg || this.cfg?.discovery || null;

    const texData = generateMapTextureData(d, "role", player, uiCfg, actualDiscovery, actualAnim, discCfg);
    if (texData && actualRenderer && actualRenderer.renderMapUI) {
      actualRenderer.renderMapUI(texData, uiCfg);
    }
  }
}
