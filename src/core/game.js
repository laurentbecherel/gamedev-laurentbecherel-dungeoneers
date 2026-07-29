// Game — top-level orchestration owning all subsystems.
// Adapted from prototype architecture but simplified for Task 3 scope.

import { getConfig, getGeneratorConfig, getFogConfig } from "../config/config.js";
import { generateDungeon } from "../world/dungeon/index.js";
import { GPURenderer, isWebGL2Supported } from "../render/renderer-gpu.js";
import { Player } from "../entities/player.js";
import { Input } from "../systems/input.js";
import { UI } from "../ui/ui.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.hud = document.getElementById("game-hud");
    this.cfg = null;
    this.dungeon = null;
    this.renderer = null;
    this.player = null;
    this.input = null;
    this.ui = null;
    this.lastTime = 0;
    this.showMap = false;
    this._loop = this._loop.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  async init() {
    const baseCfg = await getConfig();
    const genCfg = await getGeneratorConfig();
    const fogCfg = await getFogConfig();
    this.cfg = { ...baseCfg, generator: genCfg, fog: fogCfg, items: genCfg.items, torchColors: genCfg.torchColors, boundaryWallId: genCfg.boundaryWallId };

    if (!isWebGL2Supported()) {
      this.hud.textContent = "WebGL2 not supported";
      this.hud.style.display = "block";
      throw new Error("WebGL2 not supported");
    }

    this.dungeon = await generateDungeon(this.cfg, null);
    console.log("Dungeon generated:", this.dungeon.seed, this.dungeon.w + "x" + this.dungeon.h, this.dungeon.rooms.length + " rooms");

    this.renderer = new GPURenderer(this.canvas);
    await this.renderer.init(this.dungeon, this.cfg);

    this.player = new Player(this.dungeon.startX + 0.5, this.dungeon.startY + 0.5, -Math.PI / 2);
    this.player.setConfig(this.cfg);

    this.input = new Input();
    this.ui = new UI(this.cfg);
    this.ui.setDungeon(this.dungeon);

    this.hud.style.display = "none";
    this._resize();
    window.addEventListener("resize", () => this._resize());
    window.addEventListener("keydown", this._onKeyDown);
  }

  _resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / 640, vh / 360);
    this.canvas.style.width = Math.floor(640 * scale) + "px";
    this.canvas.style.height = Math.floor(360 * scale) + "px";
  }

  async regen(seedOverride = null) {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const baseCfg = await getConfig();
    const genCfg = await getGeneratorConfig();
    const fogCfg = await getFogConfig();
    this.cfg = { ...baseCfg, generator: genCfg, fog: fogCfg, items: genCfg.items, torchColors: genCfg.torchColors, boundaryWallId: genCfg.boundaryWallId };
        const seedToUse = seedOverride !== null ? seedOverride : (attempts === 0 ? null : Math.floor(Math.random() * 1000000));
        this.dungeon = await generateDungeon(this.cfg, seedToUse);
        console.log("Dungeon regenerated:", this.dungeon.seed);
        this.renderer.uploadMap(this.dungeon);
        this.player.setPosition(this.dungeon.startX + 0.5, this.dungeon.startY + 0.5, -Math.PI / 2);
        this.player.setConfig(this.cfg);
        this.ui.setDungeon(this.dungeon);
        return;
      } catch (e) {
        attempts++;
        if (attempts >= 3) { console.warn("Generation failed after 3 attempts", e); this.hud.textContent = "Generation failed — check console"; this.hud.style.display = "block"; return; }
      }
    }
  }

  start() { requestAnimationFrame(this._loop); }

  _loop(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (this.renderer && this.renderer.isReady() && this.player && this.input && this.dungeon) {
      const inp = this.input.update();
      this.player.update(dt, inp, this.dungeon);
      if (this.showMap) {
        this.ui.drawMap(this.dungeon, this.player, this.renderer);
        this.renderer.renderMapOnly(this.dungeon, this.player);
      } else {
        this.renderer.render(this.dungeon, this.player, time / 1000);
      }
    }
    requestAnimationFrame(this._loop);
  }

  async _onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === "r") { await this.regen(null); }
    else if (k === "m") { this.showMap = !this.showMap; }
    else if (k === "1") { const v = this.renderer.toggleGridDebug(); this._showHud(`Grid debug: ${v ? 'ON (floor green / wall red / ceil blue)' : 'OFF'}`); }
    else if (k === "2") { const v = this.renderer.toggleLighting(); this._showHud(`Lighting: ${v ? 'ON' : 'OFF (flat albedo)'}`); }
    else if (k === "3") { const v = this.renderer.togglePBR(); this._showHud(`PBR: ${v ? 'ON' : 'OFF (diffuse only)'}`); }
    else if (k === "4") { const v = this.renderer.togglePOM(); this._showHud(`POM: ${v ? 'ON' : 'OFF'}`); }
    else if (k === "5") { const v = this.renderer.toggleFog(); this._showHud(`Fog: ${v ? 'ON' : 'OFF'}`); }
    else if (k === "6") { const v = this.renderer.cyclePBRDebug(); const names=['OFF','Albedo','Normal raw','World Normal','Height','Rough','Metal','AO','Emissive']; this._showHud(`PBR Debug: ${names[v]} (${v})`); }
  }

  _showHud(msg) {
    if (!this.hud) return;
    this.hud.textContent = msg;
    this.hud.style.display = 'block';
    clearTimeout(this._hudTimer);
    this._hudTimer = setTimeout(() => { this.hud.style.display = 'none'; }, 1500);
  }
}
