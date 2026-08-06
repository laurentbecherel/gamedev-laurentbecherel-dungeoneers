// Game — top-level orchestration owning all subsystems.
// Task5: owns DiscoveryManager for fog-of-war minimap reveal with 1-tile peek, retro dither animation, dashed trail.
// Loads dedicated configs including discovery.json (gameplay/discovery) via getAllRenderConfigs.
// Architecture: Game is orchestrator only, no discovery algorithm inlined, clean wiring, AZERTY-safe.

import { getConfig, getAllRenderConfigs, getAsset, invalidateCache } from "../config/config.js";
import { generateDungeon } from "../world/dungeon/index.js";
import { GPURenderer, isWebGPUSupported, isWebGL2Supported } from "../render/renderer-gpu.js";
import { Player } from "../entities/player.js";
import { Input } from "../systems/input.js";
import { UI } from "../ui/ui.js";
import { DiscoveryManager } from "../world/discovery.js";
import { getLiveConfigManager, getTierForLogical, reverseLookupCategoryName } from "../config/live-config.js";
import { generateMaterialAtlases, generateMaterialArrayData } from "../world/materials.js";
import { ArchitectureDebugOverlay } from "../render/architecture-debug.js";

const DEFAULT_DISCOVERY_FALLBACK = {
  reveal: { enabled: true, peekDistance: 1, corridorRevealRadius: 4, animationDuration: 400, dither: { enabled: true, pattern: "random" } },
  trail: { enabled: true, color: [88, 128, 92], opacity: 0.45, lineWidth: 2.0, dash: [5, 4], onlyDiscovered: true }
};

const BOB_PRESETS_FALLBACK = {
  subtle: { ampY: 0.012, ampX: 0.008, ampRollDeg: 0.3, freq: 7.5 },
  default: { ampY: 0.025, ampX: 0.015, ampRollDeg: 0.6, freq: 9 },
  heavy: { ampY: 0.045, ampX: 0.028, ampRollDeg: 1.2, freq: 10.5 },
  disabled: { ampY: 0, ampX: 0, ampRollDeg: 0, freq: 0 }
};

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
    this.discovery = null;
    this.lastTime = 0;
    this.showMap = false;
    this._bobPresetIdx = 1;
    this._lastPlayerGridX = null;
    this._lastPlayerGridY = null;
    this._loop = this._loop.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    // Live-edit
    this.liveManager = null;
    this._liveUnsub = null;
    this._liveStatusUnsub = null;
    this._atlasRebuildTimer = null;
    this._regenRequired = false;
    this._regenBannerEl = null;
    this._liveBadgeEl = null;
    this.architectureDebug = null;
    this._architectureOverrideId = null;
    this._architectureCycleBusy = false;
  }

  _createLiveUI() {
    try {
      // Live badge - hidden by default when live is OFF, only shown when enabled
      if (!this._liveBadgeEl) {
        const badge = document.createElement('div');
        badge.id = 'live-badge';
        badge.className = 'live-badge live-offline';
        badge.innerHTML = `<span class="dot"></span><span class="live-text">LIVE offline</span>`;
        badge.title = 'Live-edit status: offline\nEnable Live in Editor';
        badge.style.display = 'none'; // hidden when no live-edit
        document.body.appendChild(badge);
        this._liveBadgeEl = badge;
      }
      // Regen banner
      if (!this._regenBannerEl) {
        const banner = document.createElement('div');
        banner.id = 'regen-banner';
        banner.className = 'regen-banner';
        banner.innerHTML = `<i class="ph ph-warning" style="font-size:14px"></i><span>Regen required — press R</span><button class="btn btn-sm btn-secondary" id="btn-regen-live" style="margin-left:8px">R Regen</button>`;
        document.body.appendChild(banner);
        this._regenBannerEl = banner;
        const btn = banner.querySelector('#btn-regen-live');
        if (btn) btn.onclick = async () => { await this.regen(null); this._setRegenRequired(false); };
      }
    } catch {}
  }

  _updateLiveBadge(status) {
    if (!this._liveBadgeEl) this._createLiveUI();
    if (!this._liveBadgeEl) return;
    const textEl = this._liveBadgeEl.querySelector('.live-text');
    const statusMap = {
      'offline': 'LIVE offline',
      'connecting': 'LIVE connecting...',
      'connected': 'LIVE ✓',
      'bc-only': 'LIVE bc-only',
      'polling': 'LIVE polling'
    };
    if (textEl) textEl.textContent = statusMap[status] || status;
    this._liveBadgeEl.className = `live-badge live-${status}`;
    this._liveBadgeEl.title = `Live status: ${status}\nTab: ${this.liveManager ? this.liveManager.tabId : 'n/a'}\nOpen Editor to tweak configs live`;
    // Hide completely when offline (no live-edit), show only when live is actually ON
    if (status === 'offline') {
      this._liveBadgeEl.style.display = 'none';
    } else {
      this._liveBadgeEl.style.display = 'flex';
    }
  }

  _setRegenRequired(v) {
    this._regenRequired = !!v;
    if (!this._regenBannerEl) this._createLiveUI();
    if (!this._regenBannerEl) return;
    if (v) this._regenBannerEl.classList.add('show');
    else this._regenBannerEl.classList.remove('show');
  }

  _pickCfg(renderCfgs, baseCfg, key, fallback) {
    return renderCfgs[key] || baseCfg[key] || fallback;
  }

  _mergeConfigs(baseCfg, renderCfgs){
    const merged = { ...baseCfg };
    for(const [k,v] of Object.entries(renderCfgs)){
      if(v) merged[k] = v;
    }
    merged.generator = this._pickCfg(renderCfgs, baseCfg, 'generator', {});
    merged.fog = this._pickCfg(renderCfgs, baseCfg, 'fog', { enabled:true, base:0.06, squared:0.005, color:[0.05,0.05,0.08] });
    merged.rendering = this._pickCfg(renderCfgs, baseCfg, 'rendering', { fov:1.0, textureFilter:"nearest", resolution:"640x360" });
    merged.palette = this._pickCfg(renderCfgs, baseCfg, 'palette', { authentic:true, paletteStyle:"doom", bandLevels:32 });
    merged.pom = this._pickCfg(renderCfgs, baseCfg, 'pom', baseCfg.pbr?.pom || baseCfg.renderer?.pom || { enabled:true, wall:0.06, floor:0.07, ceil:0.035, steps:8 });
    merged.pbr = this._pickCfg(renderCfgs, baseCfg, 'pbr', { ao:{affectSun:0.25,affectPoint:0.35,affectAmbient:1.0} });
    merged.ao = this._pickCfg(renderCfgs, baseCfg, 'ao', baseCfg.pbr?.ao || { affect:{sun:0.25,point:0.35,ambient:1.0} });
    merged.lighting = this._pickCfg(renderCfgs, baseCfg, 'lighting', baseCfg.lights || { ambient:{level:0.36,color:[1,1,1],worldMul:0.38}, sun:{intensity:1.5,color:[1,1,1],dir:[-0.55,-0.45,-0.7]} });
    merged.shadows = this._pickCfg(renderCfgs, baseCfg, 'shadows', { bias:{traceNormalOffset:0.10,dirOffset:0.06}, sun:{shadowFactor:0.25,maxDist:20}, point:{shadowFactor:0.15,distEpsilon:0.1} });
    merged.chamfer = this._pickCfg(renderCfgs, baseCfg, 'chamfer', baseCfg.pbr?.chamfer || { enabled:true, floorSize:0.30, ceilSize:0.24, wallSize:0.28 });
    merged.corners = this._pickCfg(renderCfgs, baseCfg, 'corners', baseCfg.pbr?.corner || { enabled:true, radius:0.15, mode:2, inner:true });
    merged.raymarch = this._pickCfg(renderCfgs, baseCfg, 'raymarch', { maxSteps:64 });
    merged.map = this._pickCfg(renderCfgs, baseCfg, 'map', baseCfg.ui?.map || { display:{position:"fullscreen",size:640,opacity:0.92} });
    merged.discovery = this._pickCfg(renderCfgs, baseCfg, 'discovery', DEFAULT_DISCOVERY_FALLBACK);
    merged.sprites = this._pickCfg(renderCfgs, baseCfg, 'sprites', { version:1, maxLights:8, sprites:[] });
    merged.lightTypes = this._pickCfg(renderCfgs, baseCfg, 'light-types', { version:1, types:[] });
    merged.particles = this._pickCfg(renderCfgs, baseCfg, 'particles', { version:1 });
    merged.fixtures = this._pickCfg(renderCfgs, baseCfg, 'fixtures', { version:1, fixtures:[], effects:[] });
    merged.materialsProc = renderCfgs["materials-proc"] || baseCfg.materialsProc || baseCfg["materials-proc"] || baseCfg.materialProc || { walls:{}, floors:{}, ceils:{} };
    merged.materialAssignments = renderCfgs["material-assignments"] || baseCfg.materialAssignments || baseCfg["material-assignments"] || { version:1, policy:{}, fallback:{wall:1,floor:1,ceil:1} };
    merged['material-assignments'] = merged.materialAssignments;
    merged.architectures = renderCfgs.architectures || baseCfg.architectures || { version:1, architectures:[] };
    merged.materialModifiers = renderCfgs["material-modifiers"] || baseCfg.materialModifiers || baseCfg["material-modifiers"] || { version:1, enabled:false, modifiers:{} };
    merged['material-modifiers'] = merged.materialModifiers;
    merged.structuralFeatures = renderCfgs['structural-features'] || baseCfg.structuralFeatures || baseCfg['structural-features'] || { enabled:false };
    merged['structural-features'] = merged.structuralFeatures;
    merged.liquids = renderCfgs.liquids || baseCfg.liquids || { enabled:true, liquids:{} };
    merged.depthOfField = renderCfgs['depth-of-field'] || baseCfg.depthOfField || baseCfg['depth-of-field'] || { enabled:false };
    merged['depth-of-field'] = merged.depthOfField;
    merged.playerCfg = this._pickCfg(renderCfgs, baseCfg, 'player', baseCfg.player || { moveSpeed:3, turnSpeed:2.2, radius:0.28, height:0.5 });
    merged.debug = this._pickCfg(renderCfgs, baseCfg, 'debug', {});
    merged.items = merged.generator?.items || merged.sprites?.generation || baseCfg.items || { maxTorches:24, minTorchDist:6, corridorBias:1.5, torchOffset:0.35 };
    merged.torchColors = merged.generator?.torchColors || merged.lighting?.torchColors || baseCfg.torchColors || lightingFallbackColors();
    merged.boundaryWallId = merged.generator?.boundaryWallId ?? baseCfg.boundaryWallId ?? 1;

    this._mergeDerivedRenderConfigs(merged);
    return merged;
  }

  _mergeDerivedRenderConfigs(merged){
    if(!merged.renderer) merged.renderer = {
      fov: merged.rendering?.fov ?? 1.0,
      textureFilter: merged.rendering?.textureFilter ?? "nearest",
      resolution: merged.rendering?.resolution ?? "640x360",
      authentic: merged.palette?.authentic ?? true,
      paletteStyle: merged.palette?.paletteStyle ?? "doom",
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
    if(!merged.ui) merged.ui = { map: merged.map?.display || merged.map || { position:"fullscreen", size:640, opacity:0.92, parchmentBg:"#e8dcc4", parchmentScan:"#ddd0b8" } };
    if(!merged.materialProc) merged.materialProc = merged.materialsProc;
  }

  async _loadAllConfigs(){
    const baseCfg = await getConfig();
    const renderCfgs = await getAllRenderConfigs();
    return this._mergeConfigs(baseCfg, renderCfgs);
  }

  async _loadMapFont(mapCfg) {
    const fontCfg = mapCfg?.font || mapCfg || {};
    const googleName = fontCfg.googleName || fontCfg.fontGoogleName || mapCfg?.fontGoogleName || "Pixelify+Sans:wght@400;600;700";
    const family = fontCfg.family || fontCfg.fontFamily || mapCfg?.fontFamily || "Pixelify Sans";
    if (!googleName) return;
    try {
      let link = document.getElementById("map-font");
      if (!link) {
        link = document.createElement("link");
        link.id = "map-font";
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=" + googleName + "&display=swap";
        document.head.appendChild(link);
        await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 800); });
      }
      const q = "\"" + family + "\"";
      if (document.fonts && document.fonts.load) {
        await Promise.all([
          document.fonts.load("12px " + q),
          document.fonts.load("bold 12px " + q),
          document.fonts.load("10px " + q),
          document.fonts.load("bold 16px " + q),
        ]);
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e) {
      console.warn("Map font load failed, falling back", e);
    }
  }

  _initDiscovery() {
    const discoveryCfg = this.cfg?.discovery || { reveal:{}, trail:{} };
    if (!this.dungeon) return;
    if (!this.discovery) {
      this.discovery = new DiscoveryManager(this.dungeon, discoveryCfg);
    } else {
      this.discovery.reset(this.dungeon, discoveryCfg);
    }
    const sx = Math.floor(this.dungeon.startX);
    const sy = Math.floor(this.dungeon.startY);
    this.discovery.markDiscoveredAt(sx, sy, this.dungeon);
    this.discovery.addPathPoint(sx, sy);
    this._lastPlayerGridX = sx;
    this._lastPlayerGridY = sy;
  }

  _updateDiscovery() {
    if (!this.dungeon || !this.player || !this.discovery) return;
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    if (this._lastPlayerGridX === px && this._lastPlayerGridY === py) return;
    const newly = this.discovery.markDiscoveredAt(px, py, this.dungeon);
    this.discovery.addPathPoint(px, py);
    if (newly && newly.length > 0) {
      const cfg = this.cfg?.discovery?.debug || {};
      if (cfg.logNewRoom && newly.length > 5) {
        console.log("New area discovered", newly.length, "cells");
      }
      if (this.showMap) {
        this.discovery.addPendingWhileMapOpen(newly);
      }
    }
    this._lastPlayerGridX = px;
    this._lastPlayerGridY = py;
  }

  _initLive() {
    try {
      this._createLiveUI();
      this.liveManager = getLiveConfigManager();
      // Game always listens for live updates (editor drives). Enable unless user explicitly disabled live in localStorage.
      let shouldEnable = true;
      try { const flag = localStorage.getItem('dungeoneers-live-enabled'); if (flag === '0') shouldEnable = false; } catch {}
      if (shouldEnable) this.liveManager.enable();
      this._updateLiveBadge(this.liveManager.getStatus());
      this._liveStatusUnsub = this.liveManager.onStatus((s) => this._updateLiveBadge(s));
      this._liveUnsub = this.liveManager.subscribe('*', async (payload) => {
        const { logicals, logical, category, name, data, source, tier } = payload;
        try {
          await this._applyLiveConfig({ logicals, logical, category, name, data, source, tier });
          const lab = logical || (logicals && logicals[0]) || `${category}/${name}`;
          this._showHud(`Live: ${lab} updated (${source})`, 1600);
          // mutate cfg for E2E inspection
          if (this.cfg) {
            if (logical) this.cfg[logical] = data;
            if (logicals) logicals.forEach(l => { if (l) this.cfg[l] = data; });
            // also merge into cfg for path-based? Keep generic path cache in cfg._liveRaw?
            if (!this.cfg._liveRaw) this.cfg._liveRaw = {};
            this.cfg._liveRaw[`${category}/${name}`] = data;
          }
          try { window._gameLiveLast = payload; } catch {}
        } catch (e) {
          console.warn('[Game Live] apply failed', payload, e);
        }
      });
      try { window._gameLiveManager = this.liveManager; } catch {}
    } catch (e) {
      console.warn('Live init failed', e);
    }
  }

  _applySpritesLive(newCfg) {
    const lm = this.renderer?.lightManager;
    if (!lm) return;
    if (!newCfg || !newCfg.sprites) return;
    // If generation changed significantly, mark regen-required but still apply T1 light tweaks
    const hasGenerationChange = newCfg.generation && Object.keys(newCfg.generation).length > 0;
    const byId = new Map((newCfg.sprites || []).map(s => [s.id, s]));
    for (const L of lm.lights) {
      const def = byId.get(L.spriteId) || byId.get(L.id) || null;
      if (!def) continue;
      const lp = def.lightProfile;
      if (!lp) continue;
      if (lp.color) L.color = lp.color.slice();
      if (lp.intensity) {
        const avg = typeof lp.intensity === 'number' ? lp.intensity : (lp.intensity.min + lp.intensity.max) / 2;
        L.intensity = avg;
      }
      if (lp.radius) {
        const avg = typeof lp.radius === 'number' ? lp.radius : (lp.radius.min + lp.radius.max) / 2;
        L.radius = avg;
      }
      if (lp.flicker) {
        if (lp.flicker.speedMin !== undefined && lp.flicker.speedMax !== undefined) {
          L.flickerSpeed = (lp.flicker.speedMin + lp.flicker.speedMax) / 2;
          L.flickerAmount = (lp.flicker.amountMin + lp.flicker.amountMax) / 2;
        } else {
          if (lp.flicker.speed !== undefined) L.flickerSpeed = lp.flicker.speed;
          if (lp.flicker.amount !== undefined) L.flickerAmount = lp.flicker.amount;
        }
      }
      if (lp.pulse) {
        L.pulseSpeed = lp.pulse.speedMin ?? lp.pulse.speed ?? L.pulseSpeed;
        L.pulseAmount = lp.pulse.amountMin ?? lp.pulse.amount ?? L.pulseAmount;
      }
    }
    if (hasGenerationChange) {
      this._setRegenRequired(true);
    }
  }

  _applyLightTypesLive(newCfg) {
    const lm = this.renderer?.lightManager;
    if (!lm || !newCfg || !newCfg.types) return;
    // For each type archetype, if flicker/intensity changed, apply to lights of that archetype? Simplify just store
    try {
      if (typeof lm.updateFromLightTypes === 'function') lm.updateFromLightTypes(newCfg);
    } catch {}
  }

  _applyMaterialsProcLive(mproc) {
    if (this._atlasRebuildTimer) { clearTimeout(this._atlasRebuildTimer); this._atlasRebuildTimer = null; }
    this._atlasRebuildTimer = setTimeout(async () => {
      try {
        this._showHud('Live: rebuilding materials (array)...', 1200);
        const walls = await getAsset('materials', 'walls').catch(()=>({materials:[]}));
        const floors = await getAsset('materials', 'floors').catch(()=>({materials:[]}));
        const ceils = await getAsset('materials', 'ceils').catch(()=>({materials:[]}));
        const wallMats = (walls && walls.materials) ? [...walls.materials] : [{base:[128,128,128]}];
        const floorMats = (floors && floors.materials) ? [...floors.materials] : [{base:[128,128,128]}];
        const ceilMats = (ceils && ceils.materials) ? [...ceils.materials] : [{base:[128,128,128]}];
        const proc = mproc || this.cfg['materials-proc'] || this.cfg.materialsProc || {};
        const procNorm = proc.walls ? proc : { walls: proc, floors: proc.floors || proc.walls || proc, ceils: proc.ceils || proc.floors || proc.walls || proc };
        // Prefer array path if renderer supports it
        let atl;
        if (this.renderer?.useArrayPath) {
          atl = generateMaterialArrayData(wallMats, floorMats, ceilMats, procNorm);
        } else {
          atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, procNorm);
        }
        this.renderer.reuploadAtlases(atl);
        this._showHud('Live: materials rebuilt', 1200);
      } catch (e) { console.warn('atlas rebuild failed', e); this._showHud('Live material rebuild failed', 1500); }
    }, 450);
  }

  async _applyLiveConfig({ logicals, logical, category, name, data, source, tier }) {
    // Resolve logical if missing via reverse lookup
    let resolvedLogics = logicals && logicals.length ? logicals : [];
    if (!resolvedLogics.length && logical) resolvedLogics = [logical];
    if (!resolvedLogics.length) {
      try { resolvedLogics = reverseLookupCategoryName(category, name); } catch {}
    }
    const primaryLogical = resolvedLogics[0] || logical || name;
    const effTier = tier || getTierForLogical(primaryLogical || `${category}/${name}`);

    // T3 regen
    if (effTier === 'T3') {
      // still store config for after regen
      if (primaryLogical && this.cfg) this.cfg[primaryLogical] = data;
      // Structural feature assets contain both placement rules (T3) and
      // render/profile tuning (T1). Apply the latter immediately to the GPU;
      // the existing feature cells remain valid until the requested regen.
      if (primaryLogical === 'structural-features' || primaryLogical === 'structuralFeatures') {
        this.cfg.structuralFeatures = data;
        this.cfg['structural-features'] = data;
        if (this.renderer && typeof this.renderer.updateConfig === 'function') {
          this.renderer.updateConfig({ structuralFeatures: data, 'structural-features': data });
        }
      }
      this._setRegenRequired(true);
      return;
    }

    // T2 atlas rebuild
    if (effTier === 'T2') {
      if (primaryLogical === 'materials-proc' || `${category}/${name}`.includes('materials-proc') || category.includes('materials')) {
        if (this.cfg) { this.cfg['materials-proc'] = data; this.cfg.materialsProc = data; this.cfg.materialsProc = data; }
        // If category is materials/walls etc, we need to refetch proc config for rebuild
        let mproc = data;
        if (category.includes('materials')) {
          // fetch current materials-proc and rebuild with new wall/floor/ceil base mats
          try { mproc = await getAsset('config/rendering', 'materials-proc'); } catch { mproc = this.cfg['materials-proc']; }
          if (this.cfg) { this.cfg['materials-proc'] = mproc; }
        }
        this._applyMaterialsProcLive(mproc);
        return;
      }
    }

    // T1 instant
    if (!this.cfg) this.cfg = {};
    // update cfg for primary
    if (primaryLogical) this.cfg[primaryLogical] = data;
    // Also store path-based in cfg._liveRaw
    if (!this.cfg._liveRaw) this.cfg._liveRaw = {};
    this.cfg._liveRaw[`${category}/${name}`] = data;

    switch (primaryLogical) {
      case 'fog': {
        this.cfg.fog = data;
        if (this.renderer && typeof this.renderer.updateFog === 'function') this.renderer.updateFog(data);
        break;
      }
      case 'lighting': {
        this.cfg.lighting = data;
        this.cfg.torchColors = data.torchColors || this.cfg.torchColors;
        if (data.maxLights && this.renderer) this.renderer.maxLights = data.maxLights;
        if (this.renderer?.lightManager && typeof this.renderer.lightManager.setConfig === 'function') this.renderer.lightManager.setConfig(data);
        // FIX: lighting.json contains player torch (dead-code bug) — propagate to player so live edits work
        if (data.player && this.player && typeof this.player.setConfig === 'function') {
          // this.cfg already has lighting updated, so getLightSource() will see new values
          this.player.setConfig(this.cfg);
        }
        break;
      }
      case 'sprites': {
        this.cfg.sprites = data;
        this._applySpritesLive(data);
        // if maxLights changed
        if (data.maxLights && this.renderer) this.renderer.maxLights = data.maxLights;
        break;
      }
      case 'light-types':
      case 'light-types.json':
      case 'lightTypes': {
        this.cfg['light-types'] = data;
        this._applyLightTypesLive(data);
        break;
      }
      case 'chamfer': {
        this.cfg.chamfer = data;
        if (this.renderer && typeof this.renderer.updateChamfer === 'function') this.renderer.updateChamfer(data);
        break;
      }
      case 'corners': {
        this.cfg.corners = data;
        if (this.renderer && typeof this.renderer.updateCorners === 'function') this.renderer.updateCorners(data);
        break;
      }
      case 'pbr': {
        this.cfg.pbr = data;
        if (this.renderer && typeof this.renderer.updatePBR === 'function') this.renderer.updatePBR(data);
        break;
      }
      case 'ao': {
        this.cfg.ao = data;
        if (this.renderer && typeof this.renderer.updateAO === 'function') this.renderer.updateAO(data);
        break;
      }
      case 'shadows': {
        this.cfg.shadows = data;
        if (this.renderer && typeof this.renderer.updateShadows === 'function') this.renderer.updateShadows(data);
        break;
      }
      case 'raymarch': {
        this.cfg.raymarch = data;
        if (this.renderer && typeof this.renderer.updateRaymarch === 'function') this.renderer.updateRaymarch(data);
        break;
      }
      case 'rendering': {
        this.cfg.rendering = data;
        if (this.renderer && typeof this.renderer.updateRendering === 'function') this.renderer.updateRendering(data);
        break;
      }
      case 'palette': {
        this.cfg.palette = data;
        if (this.renderer && typeof this.renderer.rebuildPalette === 'function') {
          try { this.renderer._applyPaletteFromConfig({ palette: data }); this.renderer.rebuildPalette(); } catch {}
        }
        break;
      }
      case 'pom': {
        this.cfg.pom = data;
        if (this.renderer && typeof this.renderer.updatePOM === 'function') this.renderer.updatePOM(data);
        break;
      }
      case 'player': {
        this.cfg.player = data;
        this.cfg.playerCfg = data;
        if (this.player && typeof this.player.setConfig === 'function') this.player.setConfig(this.cfg);
        break;
      }
      case 'discovery': {
        this.cfg.discovery = data;
        if (this.discovery && typeof this.discovery.updateConfig === 'function') this.discovery.updateConfig(data);
        break;
      }
      case 'map': {
        this.cfg.map = data;
        if (this.ui && typeof this.ui.updateMapConfig === 'function') this.ui.updateMapConfig(data);
        break;
      }
      case 'debug': {
        this.cfg.debug = data;
        break;
      }
      case 'material-modifiers':
      case 'materialModifiers': {
        this.cfg.materialModifiers = data;
        this.cfg['material-modifiers'] = data;
        if (this.renderer && typeof this.renderer.updateMaterialModifiers === 'function') this.renderer.updateMaterialModifiers(data);
        break;
      }
      case 'ssr': {
        this.cfg.ssr = data;
        if (this.renderer && typeof this.renderer.updateSSR === 'function') this.renderer.updateSSR(data);
        break;
      }
      case 'depth-of-field':
      case 'depthOfField': {
        this.cfg.depthOfField = data;
        this.cfg['depth-of-field'] = data;
        if (this.renderer && typeof this.renderer.updateDepthOfField === 'function') this.renderer.updateDepthOfField(data);
        break;
      }
      default: {
        if (category.includes('material-modifiers') || primaryLogical === 'material-modifiers') {
          this.cfg.materialModifiers = data;
          this.cfg['material-modifiers'] = data;
          if (this.renderer && typeof this.renderer.updateMaterialModifiers === 'function') this.renderer.updateMaterialModifiers(data);
          break;
        }
        if (category.includes('materials')) {
          let mproc = this.cfg['materials-proc'];
          try { mproc = await getAsset('config/rendering', 'materials-proc'); } catch {}
          this._applyMaterialsProcLive(mproc || data);
        } else {
          if (this.renderer && typeof this.renderer.updateConfig === 'function') {
            this.renderer.updateConfig({ [primaryLogical]: data, [name]: data });
          }
        }
        break;
      }
    }
  }

  async init() {
    try { window._gameEarly = this; window.game = this; } catch(e) {}

    this.cfg = await this._loadAllConfigs();
    if (!isWebGPUSupported()) {
      if (!isWebGL2Supported()) {
        this.hud.textContent = "WebGPU not supported – use Chrome 113+ with WebGPU";
        this.hud.style.display = "block";
        throw new Error("WebGPU not supported");
      } else {
        console.warn('[Game] WebGPU not detected, but WebGL2 present – proceeding with WebGPU renderer (will fail if adapter missing)');
      }
    }
    await this._loadMapFont(this.cfg?.map);
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
        console.warn("Dungeon gen attempt " + (attempt+1) + " failed, retrying", e.message);
      }
    }
    if (lastErr) throw lastErr;
    if (this.dungeon?.meta?.paletteAccents?.length) {
      this.cfg.palette = { ...(this.cfg.palette || {}), accentRamps: this.dungeon.meta.paletteAccents };
    }
    this.renderer = new GPURenderer(this.canvas);
    await this.renderer.init(this.dungeon, this.cfg);
    const sx = Math.floor(this.dungeon.startX) + 0.5;
    const sy = Math.floor(this.dungeon.startY) + 0.5;
    this.player = new Player(sx, sy, -Math.PI / 2);
    this.player.setConfig(this.cfg);
    this._initDiscovery();
    this.input = new Input(this.canvas);
    this.ui = new UI(this.cfg);
    this.ui.setDungeon(this.dungeon);
    this.architectureDebug = new ArchitectureDebugOverlay(document.querySelector('.game-viewport'), this.canvas);
    this.architectureDebug.setDungeon(this.dungeon);
    const architectureToggle = document.getElementById('architecture-debug-toggle');
    if (architectureToggle) architectureToggle.onclick = () => this._toggleArchitectureDebug();
    this.hud.style.display = "none";
    try { window.game = this; window._gamePlayer = this.player; window._gameRenderer = this.renderer; window._gameDiscovery = this.discovery; window._gameDungeon = this.dungeon; console.log("Game exposed for E2E in game.js", !!window.game); } catch(e) { console.warn("expose failed in game.js", e); }
    this._resize();
    window.addEventListener("resize", () => this._resize());
    window.addEventListener("keydown", this._onKeyDown);
    // Live-edit init after base subsystems
    this._initLive();
  }

  _resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const rendering = this.cfg?.rendering || {};
    const baseW = rendering.canvas?.baseWidth || rendering.baseWidth || 640;
    const baseH = rendering.canvas?.baseHeight || rendering.baseHeight || 360;
    const scale = Math.min(vw / baseW, vh / baseH);
    this.canvas.style.width = Math.floor(baseW * scale) + "px";
    this.canvas.style.height = Math.floor(baseH * scale) + "px";
    if (this.architectureDebug?.visible) this.architectureDebug.draw(this.player);
  }

  async regen(seedOverride = null, { preservePlayer = false } = {}) {
    // Live-edit: ensure fresh fetch from server, not stale _caches, so Save+R works even when live OFF
    try { invalidateCache(); } catch {}
    const debugCfg = this.cfg?.debug || {};
    const maxAttempts = debugCfg.regen?.maxAttempts ?? debugCfg.regenMaxAttempts ?? 3;
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        this.cfg = await this._loadAllConfigs();
        if (this._architectureOverrideId && this.cfg.architectures) {
          this.cfg.architectures = {
            ...this.cfg.architectures,
            selection: {
              ...(this.cfg.architectures.selection || {}),
              forcedArchitectureId: this._architectureOverrideId,
              maxArchitecturesPerLevel: 1
            }
          };
        }
        const seedToUse = seedOverride !== null ? seedOverride : (attempts === 0 ? null : Math.floor(Math.random() * 1000000));
        this.dungeon = await generateDungeon(this.cfg, seedToUse);
        if (this.dungeon?.meta?.paletteAccents?.length) {
          this.cfg.palette = { ...(this.cfg.palette || {}), accentRamps: this.dungeon.meta.paletteAccents };
        }
        console.log("Dungeon regenerated:", this.dungeon.seed);
        // uploadMap also rebuilds config-driven modifier/structural data. Keep the
        // renderer cache in lockstep with the freshly reloaded configuration.
        this.renderer.updateConfig(this.cfg);
        this.renderer.updatePalette?.(this.cfg.palette);
        this.renderer.uploadMap(this.dungeon);
        const isWalkable = (x, y) => {
          const gx = Math.floor(x), gy = Math.floor(y);
          return gx >= 0 && gy >= 0 && gx < this.dungeon.w && gy < this.dungeon.h
            && this.dungeon.grid[gy * this.dungeon.w + gx] === 0;
        };
        // Architecture cycling retains the seed/topology. Do not call any
        // Player mutator here: setConfig/setPosition would cancel a grid lerp,
        // buffered step, held input, mouse delta and view-bob phase. Movement
        // simply continues against the freshly themed copy of the same map.
        const canKeepPlayer = preservePlayer && isWalkable(this.player.x, this.player.y)
          && (!this.player.gridMode || isWalkable(this.player.gridTargetX, this.player.gridTargetY));
        if (!canKeepPlayer) {
          this.player.setConfig(this.cfg);
          const rsx = Math.floor(this.dungeon.startX) + 0.5;
          const rsy = Math.floor(this.dungeon.startY) + 0.5;
          this.player.setPosition(rsx, rsy, -Math.PI / 2);
        }
        if (preservePlayer && this.discovery && this.discovery._w === this.dungeon.w && this.discovery._h === this.dungeon.h) {
          this.discovery.updateConfig(this.cfg?.discovery || { reveal:{}, trail:{} });
        } else {
          this._initDiscovery();
        }
        this.ui.setDungeon(this.dungeon);
        this.architectureDebug?.setDungeon(this.dungeon);
        try { window._gameDiscovery = this.discovery; window._gameDungeon = this.dungeon; } catch(e) {}
        this._setRegenRequired(false);
        return true;
      } catch (e) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn("Generation failed after " + maxAttempts + " attempts", e);
          this.hud.textContent = "Generation failed — check console";
          this.hud.style.display = "block";
          return false;
        }
      }
    }
  }

  start() { requestAnimationFrame(this._loop); }

  _loop(time) {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (this.renderer && this.renderer.isReady() && this.player && this.input && this.dungeon) {
      this.input.update(dt, this.player, this.dungeon);
      this._updateDiscovery();

      if (this.architectureDebug?.visible) {
        this.architectureDebug.draw(this.player);
      } else if (this.showMap) {
        const discoveryCfg = this.cfg?.discovery || null;
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const animDuration = discoveryCfg?.reveal?.animationDuration ?? 400;
        const animProgress = this.discovery ? this.discovery.getAnimationProgress(now, animDuration) : 1;
        this.ui.drawMap(this.dungeon, this.player, this.renderer, this.discovery, animProgress, discoveryCfg);
        this.renderer.renderMapOnly(this.dungeon, this.player);
      } else {
        this.renderer.render(this.dungeon, this.player, time / 1000);
      }
    }
    requestAnimationFrame(this._loop);
  }

  async _onKeyDown(e) {
    const code = e.code || "";
    if (code === "KeyR") { await this.regen(null); return; }
    if (code === "KeyI") { this._toggleArchitectureDebug(); return; }
    const architectureKey = this.cfg?.debug?.architectureCycle?.key || 'KeyH';
    if (code === architectureKey && e.repeat) return;
    if (code === architectureKey && !e.shiftKey) { await this._cycleArchitecture(); return; }
    if (code === architectureKey && e.shiftKey) { await this._resetArchitectureCycle(); return; }
    if (code === "KeyM") {
      const wasShowing = this.showMap;
      this.showMap = !this.showMap;
      if (this.showMap && !wasShowing && this.discovery) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        this.discovery.onMapOpened(now);
      }
      this._showHud("Map: " + (this.showMap ? "ON (parchment overlay — discovery + trail)" : "OFF"));
      return;
    }
    if (code === "KeyG") {
      const newMode = !this.player.gridMode;
      this.player.setGridMode(newMode);
      this._showHud("Grid mode: " + (newMode ? "ON (Grimrock tile step ZQSD+AE)" : "OFF (free FPS WASD+mouse)") + " — G to toggle");
      return;
    }
    if (code === "KeyV" || code === "KeyB") {
      this.player.setViewBobEnabled(!this.player.viewBobEnabled);
      this._showHud("View bob: " + (this.player.viewBobEnabled ? "ON (figure-8)" : "OFF") + " — V/B toggle, P cycles presets");
      return;
    }
    if (code === "KeyP") {
      const presets = this.cfg?.playerCfg?.bob?.presets || this.cfg?.player?.bob?.presets || BOB_PRESETS_FALLBACK;
      const keys = Object.keys(presets);
      this._bobPresetIdx = (this._bobPresetIdx + 1) % keys.length;
      const name = keys[this._bobPresetIdx];
      this.player.setBobParams(presets[name]);
      if (name === "disabled") this.player.setViewBobEnabled(false); else this.player.setViewBobEnabled(true);
      this._showHud("Bob preset: " + name + " — P to cycle, V/B to toggle");
      return;
    }
    if (code === "KeyK") {
      if (e.shiftKey) {
        this.renderer.setFeatureDebug(true);
        const focus = this._focusStructuralFeature();
        this._showHud(focus
          ? `Structural debug: FOCUSED at ${focus.x},${focus.y} — cyan/violet channel, amber grille`
          : "Structural debug: no generated feature found");
      } else {
        const v = this.renderer.toggleFeatureDebug();
        this._showHud("Structural debug: " + (v ? "ON — cyan/violet channel, amber grille; Shift+K focuses" : "OFF"));
      }
      return;
    }
    if (code === "Digit1" || code === "Numpad1") { const v = this.renderer.toggleGridDebug(); this._showHud("3D construction grid: " + (v ? "ON — A architecture · T type · M material" : "OFF — rendered materials")); return; }
    if (code === "Digit2" || code === "Numpad2") { const v = this.renderer.toggleLighting(); this._showHud("Lighting: " + (v ? "ON" : "OFF (flat albedo)")); return; }
    if (code === "Digit3" || code === "Numpad3") { const v = this.renderer.togglePBR(); this._showHud("PBR: " + (v ? "ON" : "OFF (diffuse only)")); return; }
    if (code === "Digit4" || code === "Numpad4") { const v = this.renderer.togglePOM(); this._showHud("POM: " + (v ? "ON" : "OFF")); return; }
    if (code === "Digit5" || code === "Numpad5") { const v = this.renderer.toggleFog(); this._showHud("Fog: " + (v ? "ON" : "OFF")); return; }
    if (code === "Digit6" || code === "Numpad6") { const v = this.renderer.cyclePBRDebug(); const names=["Normal - OFF","Moss Noise mask (3D FBM)","Moss Nearwall/Env mask (corners+floor seams+room biome)","Moss Material mask (AO/Height/Rough combo)","Moss Combined mask (final)","Puddle mask","Damaged Final Coverage (actual albedo + PBR application mask)","Damaged Noise (isotropic 3D chips/cracks)","Structural features (channel cyan/violet, grille amber)","Blood mask (story field + splatters/drips)","Dust mask (story field + height/AO/orientation)","Damaged Placement (black none → blue/cyan low → yellow/red high)","Damaged Factors (R=noise, G=boosted placement, B=material × environment)","Damaged Height (blue cavity, yellow/orange bevel/rim)","Damaged Normal (height-derived world normal)"]; this._showHud("PBR Debug: " + (names[v]||"Mode "+v) + " (" + v + ")"); return; }
    if (code === "Digit7" || code === "Numpad7") { const v = this.renderer.toggleChamfer(); this._showHud("Chamfer: " + (v ? "ON (floor/ceil baseboard + vertical edges)" : "OFF (sharp 90°)")); return; }
    if (code === "Digit8" || code === "Numpad8") { const v = this.renderer.toggleCorner(); this._showHud("Corner Geometry: " + (v ? "ON (rounded intruding r=0.15 outer+inner)" : "OFF")); return; }
    if (code === "Digit9" || code === "Numpad9") { const v = this.renderer.toggleModifiers(); this._showHud("Modifiers: " + (v ? "ON (moss + puddle + blood + dust + damaged; live JSON/UBO tuning)" : "OFF (clean PBR)")); return; }
    if (code === "Digit0" || code === "Numpad0") { const v = this.renderer.toggleSSR(); this._showHud("SSR Puddle Reflections: " + (v ? "ON (puddle-only, sprite-aware)" : "OFF")); return; }
    if (code === "KeyO") { const v = this.renderer.cycleSSRDebug(); const names=["OFF","PuddleMask cyan/pink","Depth","Normal","ReflectionUV","HitMask","RayDir","Fresnel","SSR only"]; this._showHud("SSR Debug: " + (names[v]||"Mode "+v) + " ("+v+") - O cycle, 0 toggle"); return; }
  }

  _toggleArchitectureDebug() {
    if (!this.architectureDebug) return false;
    const visible = this.architectureDebug.toggle();
    const button = document.getElementById('architecture-debug-toggle');
    if (button) button.setAttribute('aria-pressed', String(visible));
    this._showHud(`Architecture IDs: ${visible ? 'ON — A# architecture / T# room type' : 'OFF — rendered PBR view'}`);
    return visible;
  }

  _architectureChoices() {
    const config = this.cfg?.architectures || {};
    const active = new Set(config.selection?.activeArchitectureIds || []);
    return (config.architectures || []).filter(architecture => architecture?.id && (!active.size || active.has(architecture.id)));
  }

  async _cycleArchitecture() {
    if (this._architectureCycleBusy || !this.dungeon) return false;
    const choices = this._architectureChoices();
    if (!choices.length) { this._showHud('Architecture cycle: no configured architectures'); return false; }
    const currentId = this._architectureOverrideId || this.dungeon.meta?.architecturePlan?.dominant;
    const currentIndex = Math.max(-1, choices.findIndex(architecture => architecture.id === currentId));
    const next = choices[(currentIndex + 1) % choices.length];
    const retainedSeed = this.cfg?.debug?.architectureCycle?.keepSeed !== false ? this.dungeon.seed : null;
    this._architectureOverrideId = next.id;
    this._architectureCycleBusy = true;
    this._showHud(`Changing architecture → ${next.name}…`);
    try {
      const ok = await this.regen(retainedSeed, { preservePlayer: true });
      const activeName = this.dungeon?.rooms?.[0]?.architectureName || next.name;
      this._showHud(ok ? `Architecture: ${activeName} · H next · Shift+H auto` : `Architecture change failed: ${next.name}`);
      return !!ok;
    } finally {
      this._architectureCycleBusy = false;
    }
  }

  async _resetArchitectureCycle() {
    if (this._architectureCycleBusy || !this.dungeon) return false;
    const retainedSeed = this.cfg?.debug?.architectureCycle?.keepSeed !== false ? this.dungeon.seed : null;
    this._architectureOverrideId = null;
    this._architectureCycleBusy = true;
    this._showHud('Architecture: returning to weighted story selection…');
    try {
      const ok = await this.regen(retainedSeed, { preservePlayer: true });
      const activeName = this.dungeon?.rooms?.[0]?.architectureName || this.dungeon?.meta?.architecturePlan?.dominant || 'automatic';
      this._showHud(ok ? `Architecture: ${activeName} (automatic) · H to cycle` : 'Architecture reset failed');
      return !!ok;
    } finally {
      this._architectureCycleBusy = false;
    }
  }

  _focusStructuralFeature() {
    const feature = this.dungeon?.features?.[0];
    if (!feature?.floorCells?.length || !this.player) return null;
    const midIndex = feature.floorCells[Math.floor(feature.floorCells.length * 0.5)];
    const targetX = (midIndex % this.dungeon.w) + 0.5;
    const targetY = Math.floor(midIndex / this.dungeon.w) + 0.5;
    const offsets = feature.axis === 'east-west'
      ? [[0,-2], [0,2], [0,-1], [0,1]]
      : [[-2,0], [2,0], [-1,0], [1,0]];
    let viewX = targetX;
    let viewY = targetY;
    for (const [dx,dy] of offsets) {
      const cx = Math.floor(targetX) + dx;
      const cy = Math.floor(targetY) + dy;
      if (cx < 0 || cy < 0 || cx >= this.dungeon.w || cy >= this.dungeon.h) continue;
      const index = cy * this.dungeon.w + cx;
      if (this.dungeon.grid[index] === 0 && ((this.dungeon.featureCells?.[index] ?? 0) & 0xff) === 0) {
        viewX = cx + 0.5;
        viewY = cy + 0.5;
        break;
      }
    }
    const angle = Math.atan2(targetY - viewY, targetX - viewX);
    this.player.setPosition(viewX, viewY, angle);
    return { x: Math.floor(targetX), y: Math.floor(targetY), viewX, viewY };
  }

  _showHud(msg) {
    if (!this.hud) return;
    this.hud.textContent = msg;
    this.hud.style.display = "block";
    clearTimeout(this._hudTimer);
    const timeout = this.cfg?.debug?.hud?.timeoutMs ?? this.cfg?.debug?.hudTimeout ?? 1500;
    this._hudTimer = setTimeout(() => { this.hud.style.display = "none"; }, timeout);
  }
}

function lightingFallbackColors(){
  return [
    { r:1,g:0.6,b:0.2,name:"warm" },
    { r:0.4,g:0.7,b:1,name:"cool" },
    { r:0.3,g:1,b:0.4,name:"green" },
    { r:0.8,g:0.3,b:1,name:"purple" }
  ];
}
