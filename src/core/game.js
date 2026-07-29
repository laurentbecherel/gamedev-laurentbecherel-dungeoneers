// Game — top-level orchestration owning all subsystems.
// Now loads all dedicated rendering configs (POM/PBR/AO/Chamfer/Corners/Shadows/Lighting/Rendering/Palette/Raymarch/Map/MaterialsProc/Player/Debug/Fog/Generator)
// All configs are editor-tracked JSON in src/assets/config/

import { getConfig, getAllRenderConfigs } from "../config/config.js";
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

  _mergeConfigs(baseCfg, renderCfgs){
    // renderCfgs contains all dedicated files, may have nulls
    const merged = { ...baseCfg };
    // Direct dedicated entries
    for(const [k,v] of Object.entries(renderCfgs)){
      if(v) merged[k] = v;
    }
    // Backward compatibility aliases
    // generator already in renderCfgs.generator but also top-level legacy
    merged.generator = renderCfgs.generator || baseCfg.generator || {};
    merged.fog = renderCfgs.fog || baseCfg.fog || { enabled:true, base:0.06, squared:0.005, color:[0.05,0.05,0.08] };
    merged.rendering = renderCfgs.rendering || baseCfg.rendering || { fov:1.0, textureFilter:'nearest', resolution:'640x360' };
    merged.palette = renderCfgs.palette || baseCfg.palette || { authentic:true, paletteStyle:'doom', bandLevels:32 };
    merged.pom = renderCfgs.pom || baseCfg.pbr?.pom || baseCfg.renderer?.pom || { enabled:true, wall:0.06, floor:0.07, ceil:0.035, steps:8 };
    merged.pbr = renderCfgs.pbr || baseCfg.pbr || { ao:{affectSun:0.25,affectPoint:0.35,affectAmbient:1.0} };
    merged.ao = renderCfgs.ao || baseCfg.ao || baseCfg.pbr?.ao || { affect:{sun:0.25,point:0.35,ambient:1.0} };
    merged.lighting = renderCfgs.lighting || baseCfg.lighting || baseCfg.lights || { ambient:{level:0.36,color:[1,1,1],worldMul:0.38}, sun:{intensity:1.5,color:[1,1,1],dir:[-0.55,-0.45,-0.7]} };
    merged.shadows = renderCfgs.shadows || baseCfg.shadows || { bias:{traceNormalOffset:0.10,dirOffset:0.06}, sun:{shadowFactor:0.25,maxDist:20}, point:{shadowFactor:0.15,distEpsilon:0.1} };
    merged.chamfer = renderCfgs.chamfer || baseCfg.chamfer || baseCfg.pbr?.chamfer || { enabled:true, floorSize:0.30, ceilSize:0.24, wallSize:0.28 };
    merged.corners = renderCfgs.corners || baseCfg.corners || baseCfg.pbr?.corner || { enabled:true, radius:0.15, mode:2, inner:true };
    merged.raymarch = renderCfgs.raymarch || baseCfg.raymarch || { maxSteps:64 };
    merged.map = renderCfgs.map || baseCfg.map || baseCfg.ui?.map || { display:{position:'fullscreen',size:640,opacity:0.92} };
    merged.materialsProc = renderCfgs['materials-proc'] || baseCfg.materialsProc || baseCfg['materials-proc'] || baseCfg.materialProc || { walls:{}, floors:{}, ceils:{} };
    merged.playerCfg = renderCfgs.player || baseCfg.playerCfg || baseCfg.player || { moveSpeed:3, turnSpeed:2.2, radius:0.28, height:0.5 };
    merged.debug = renderCfgs.debug || baseCfg.debug || {};

    // Convenience flat accessors still used by old code paths
    merged.items = merged.generator?.items || baseCfg.items || { maxTorches:24, minTorchDist:6, corridorBias:1.5, torchOffset:0.35 };
    merged.torchColors = merged.generator?.torchColors || merged.lighting?.torchColors || baseCfg.torchColors || lightingFallbackColors();
    merged.boundaryWallId = merged.generator?.boundaryWallId ?? baseCfg.boundaryWallId ?? 1;

    // Keep legacy renderer and pbr fields for renderer-gpu fallback lookup
    if(!merged.renderer) merged.renderer = {
      fov: merged.rendering?.fov ?? 1.0,
      textureFilter: merged.rendering?.textureFilter ?? 'nearest',
      resolution: merged.rendering?.resolution ?? '640x360',
      authentic: merged.palette?.authentic ?? true,
      paletteStyle: merged.palette?.paletteStyle ?? 'doom',
      bandLevels: merged.palette?.bandLevels ?? 32,
      pom: { wall: merged.pom?.strength?.wall ?? merged.pom?.wall ?? 0.06, floor: merged.pom?.strength?.floor ?? merged.pom?.floor ?? 0.07, ceil: merged.pom?.strength?.ceil ?? merged.pom?.ceil ?? 0.035, steps: merged.pom?.steps ?? 8 }
    };
    if(!merged.pbr) merged.pbr = {
      ao: merged.ao?.affect || merged.ao || { affectSun:0.25,affectPoint:0.35,affectAmbient:1.0 },
      chamfer: merged.chamfer,
      corner: merged.corners
    };
    if(!merged.lights) merged.lights = {
      ambient: merged.lighting?.ambient?.level ?? 0.36,
      ambientColor: merged.lighting?.ambient?.color ?? [1,1,1],
      worldAmbientMul: merged.lighting?.ambient?.worldMul ?? 0.38,
      sunDir: merged.lighting?.sun?.dir ?? [-0.55,-0.45,-0.7],
      sunIntensity: merged.lighting?.sun?.intensity ?? 1.5,
      sunColor: merged.lighting?.sun?.color ?? [1,1,1]
    };
    if(!merged.player) merged.player = merged.playerCfg;
    if(!merged.ui) merged.ui = { map: merged.map?.display || merged.map || { position:'fullscreen', size:640, opacity:0.92, parchmentBg:'#e8dcc4', parchmentScan:'#ddd0b8' } };
    if(!merged.materialProc) merged.materialProc = merged.materialsProc;

    return merged;
  }

  async _loadAllConfigs(){
    const baseCfg = await getConfig();
    const renderCfgs = await getAllRenderConfigs();
    return this._mergeConfigs(baseCfg, renderCfgs);
  }

  async _loadMapFont(mapCfg) {
    // Restore Task 2 font loading — Pixelify Sans for parchment map aesthetic
    // Config now lives in src/assets/config/ui/map.json under font {family, fallback, googleName}
    const fontCfg = mapCfg?.font || mapCfg || {};
    const googleName = fontCfg.googleName || fontCfg.fontGoogleName || mapCfg?.fontGoogleName || "Pixelify+Sans:wght@400;600;700";
    const family = fontCfg.family || fontCfg.fontFamily || mapCfg?.fontFamily || "Pixelify Sans";
    if (!googleName) return;
    try {
      let link = document.getElementById('map-font');
      if (!link) {
        link = document.createElement('link');
        link.id = 'map-font';
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${googleName}&display=swap`;
        document.head.appendChild(link);
        // Wait for stylesheet to load
        await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 800); });
      }
      const q = `"${family}"`;
      // Preload weights/sizes used in map overlay (12px regular for legend, bold for stairs)
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load(`12px ${q}`),
          document.fonts.load(`bold 12px ${q}`),
          document.fonts.load(`10px ${q}`),
          document.fonts.load(`bold 16px ${q}`),
        ]);
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {
      console.warn("Map font load failed, falling back", e);
    }
  }

  async init() {
    this.cfg = await this._loadAllConfigs();

    if (!isWebGL2Supported()) {
      this.hud.textContent = "WebGL2 not supported";
      this.hud.style.display = "block";
      throw new Error("WebGL2 not supported");
    }

    // Load parchment map font before first render — fixes wrong font regression
    await this._loadMapFont(this.cfg?.map);

    // Retry loop like regen() — generator can fail on unlucky random seed (room overlap)
    // Previous version called generateDungeon once and crashed init on failure
    const debugCfg = this.cfg?.debug || {};
    const maxAttempts = debugCfg.init?.maxAttempts ?? 5;
    let lastErr = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const seedToUse = attempt === 0 ? null : Math.floor(Math.random() * 1000000);
        this.dungeon = await generateDungeon(this.cfg, seedToUse);
        console.log("Dungeon generated:", this.dungeon.seed, this.dungeon.w + "x" + this.dungeon.h, this.dungeon.rooms.length + " rooms");
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`Dungeon gen attempt ${attempt+1} failed, retrying`, e.message);
      }
    }
    if (lastErr) throw lastErr;

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
    const rendering = this.cfg?.rendering || {};
    const baseW = rendering.canvas?.baseWidth || rendering.baseWidth || 640;
    const baseH = rendering.canvas?.baseHeight || rendering.baseHeight || 360;
    const scale = Math.min(vw / baseW, vh / baseH);
    this.canvas.style.width = Math.floor(baseW * scale) + "px";
    this.canvas.style.height = Math.floor(baseH * scale) + "px";
  }

  async regen(seedOverride = null) {
    const debugCfg = this.cfg?.debug || {};
    const maxAttempts = debugCfg.regen?.maxAttempts ?? debugCfg.regenMaxAttempts ?? 3;
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        this.cfg = await this._loadAllConfigs();
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
        if (attempts >= maxAttempts) {
          console.warn("Generation failed after " + maxAttempts + " attempts", e);
          this.hud.textContent = "Generation failed — check console";
          this.hud.style.display = "block";
          return;
        }
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
    else if (k === "7") { const v = this.renderer.toggleChamfer(); this._showHud(`Chamfer: ${v ? 'ON (floor/ceil baseboard + vertical edges)' : 'OFF (sharp 90°)'}`); }
    else if (k === "8") { const v = this.renderer.toggleCorner(); this._showHud(`Corner Geometry: ${v ? 'ON (rounded intruding r=0.15 outer+inner)' : 'OFF'}`); }
  }

  _showHud(msg) {
    if (!this.hud) return;
    this.hud.textContent = msg;
    this.hud.style.display = 'block';
    clearTimeout(this._hudTimer);
    const timeout = this.cfg?.debug?.hud?.timeoutMs ?? this.cfg?.debug?.hudTimeout ?? 1500;
    this._hudTimer = setTimeout(() => { this.hud.style.display = 'none'; }, timeout);
  }
}

function lightingFallbackColors(){
  return [
    { r:1,g:0.6,b:0.2,name:'warm' },
    { r:0.4,g:0.7,b:1,name:'cool' },
    { r:0.3,g:1,b:0.4,name:'green' },
    { r:0.8,g:0.3,b:1,name:'purple' }
  ];
}
