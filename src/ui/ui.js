// UI — WebGL-based UI subsystem for map overlay and HUD.
// Task5: supports fog-of-war discovery with retro dither + dashed trail.
// Prepares map texture data for WebGL rendering (no separate 2D canvas).

import { generateMapTextureData } from "../render/map-ui.js";

export class UI {
  constructor(cfg) {
    this.cfg = cfg;
    this.dungeon = null;
    this.uiCfg = cfg?.map || cfg?.ui?.map || { position: "top-right", size: 160, opacity: 0.9 };
  }

  setDungeon(dungeon) { this.dungeon = dungeon; }
  updateMapConfig(mapCfg) { this.uiCfg = mapCfg || this.uiCfg; this.cfg = { ...this.cfg, map: mapCfg, ui: { ...(this.cfg?.ui||{}), map: mapCfg } }; }

  /**
   * Draw map texture.
   * Signature: drawMap(dungeon, player, renderer, discovery, animProgress, discoveryCfg)
   * - dungeon, player, renderer required
   * - discovery optional (implements isDiscovered, getPath, getNewlyDiscoveredSinceLastOpen)
   * - animProgress 0..1 optional
   * - discoveryCfg optional file config
   */
  drawMap(dungeon, player, renderer, discovery = null, animProgress = 1, discoveryCfg = null) {
    if (!dungeon || !renderer) return;
    const d = dungeon || this.dungeon;
    if (!d) return;

    let actualRenderer = renderer;
    let actualDiscovery = discovery;
    let actualAnim = animProgress;
    let actualDiscoveryCfg = discoveryCfg;

    // Backward compat: 4th arg could be animProgress number if discovery omitted
    if (typeof actualDiscovery === "number") {
      actualAnim = actualDiscovery;
      actualDiscovery = null;
    }

    // Validate discovery shape — must have isDiscovered fn, otherwise treat as null and keep anim
    if (actualDiscovery && typeof actualDiscovery.isDiscovered !== "function") {
      // Legacy call where discovery slot held something else — ignore
      actualDiscovery = null;
    }

    const uiCfg = this.uiCfg;
    const discCfg = actualDiscoveryCfg || this.cfg?.discovery || null;

    const texData = generateMapTextureData(d, "role", player, uiCfg, actualDiscovery, actualAnim, discCfg);
    if (texData && actualRenderer?.renderMapUI) {
      actualRenderer.renderMapUI(texData, uiCfg);
    }
  }
}
