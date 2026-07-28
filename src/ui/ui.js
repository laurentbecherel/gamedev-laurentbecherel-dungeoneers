// UI — WebGL-based UI subsystem for map overlay and HUD.
// Prepares map texture data for WebGL rendering (no separate 2D canvas).

import { generateMapTextureData } from "../render/map-ui.js";

export class UI {
  constructor(cfg) {
    this.cfg = cfg;
    this.dungeon = null;
    this.uiCfg = cfg?.ui?.map || { position: "top-right", size: 160, opacity: 0.9 };
  }

  setDungeon(dungeon) { this.dungeon = dungeon; }

  drawMap(dungeon, player, renderer) {
    if (!dungeon || !renderer) return;
    const d = dungeon || this.dungeon;
    if (!d) return;
    // Generate map texture RGBA data and upload to renderer for UI overlay pass
    const texData = generateMapTextureData(d, "role", player, this.uiCfg);
    if (texData && renderer.renderMapUI) {
      renderer.renderMapUI(texData, this.uiCfg);
    }
  }
}
