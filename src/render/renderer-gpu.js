// WebGL2 first-person raycast renderer — fully configurable via dedicated JSONs
// POM/PBR/AO/Shadows/Chamfer/Corners/Rendering/Palette/Raymarch etc are all editor-tracked JSON

import { createProgram, createTexture } from './gl-utils.js';
import { vsSource, fsSource, vsQuantize, fsQuantize, vsUI, fsUI } from './shaders.js';
import { uploadMapTexture, updateMapTexture } from './map-upload.js';
import { generateMaterialAtlases } from '../world/materials.js';
import { getAsset } from '../config/config.js';
import { genPalette, buildRGBToPal } from './palette.js';

export function isWebGL2Supported() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

export class GPURenderer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.gl = canvasEl.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!this.gl) throw new Error('WebGL2 not supported');
    this.ready = false;
    this.program = null;
    this.quantProgram = null;
    this.uiProgram = null;
    this.vao = null;
    this.vaoQuant = null;
    this.vaoUI = null;
    this.mapTex = null;
    this.matMapTex = null;
    this.atlases = {};
    this.uLoc = {};
    this.uQuant = {};
    this.uUI = {};
    this.paletteTex = null;
    this.lutTex = null;
    this.sceneTex = null;
    this.sceneFBO = null;
    this.mapUITex = null;
    this.authentic = true;
    this.bandLevels = 32;
    this.paletteStyle = 'doom';
    this.gridDebug = 0;
    this.lightingEnabled = 1;
    this.pbrEnabled = 1;
    this.pomEnabled = 1;
    this.fogEnabled = 1;
    this.pbrDebugMode = 0;
    this.chamferEnabled = 1;
    this.cornerEnabled = 1;
    this._cfgCache = null;
  }

  async init(dungeon, config) {
    const gl = this.gl;
    this.program = createProgram(gl, vsSource, fsSource);
    if (!this.program) throw new Error('Shader compile failed raycast');
    this.quantProgram = createProgram(gl, vsQuantize, fsQuantize);
    if (!this.quantProgram) throw new Error('Shader compile failed quantize');
    this.uiProgram = createProgram(gl, vsUI, fsUI);
    if (!this.uiProgram) throw new Error('Shader compile failed UI');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.vaoQuant = gl.createVertexArray();
    gl.bindVertexArray(this.vaoQuant);
    const buf2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const locQ = gl.getAttribLocation(this.quantProgram, 'a_pos');
    gl.enableVertexAttribArray(locQ);
    gl.vertexAttribPointer(locQ, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.vaoUI = gl.createVertexArray();
    gl.bindVertexArray(this.vaoUI);
    const uiBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(16), gl.DYNAMIC_DRAW);
    const locUIPos = gl.getAttribLocation(this.uiProgram, 'a_pos');
    const locUIUV = gl.getAttribLocation(this.uiProgram, 'a_uv');
    gl.enableVertexAttribArray(locUIPos);
    gl.vertexAttribPointer(locUIPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locUIUV);
    gl.vertexAttribPointer(locUIUV, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    // --- Materials: Task 3 single-material lock but configurable via materials-proc + proc config
    const walls = await getAsset('materials', 'walls');
    const floors = await getAsset('materials', 'floors');
    const ceils = await getAsset('materials', 'ceils');
    const wallMats = (walls?.materials || []).slice(0, 1);
    const floorMats = (floors?.materials || []).slice(0, 1);
    const ceilMats = (ceils?.materials || []).slice(0, 1);
    // material proc may come from dedicated config or legacy main.json materialProc
    const proc = config.materialsProc || config['materials-proc'] || config.materialProc || {};
    const procWalls = proc.walls || {};
    const procFloors = proc.floors || {};
    const procCeils = proc.ceils || {};
    const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, {
      walls: procWalls,
      floors: procFloors,
      ceils: procCeils,
      ...proc // fallback raw
    });
    this.atlasInfo = atl;

    // Resolve texture filter from rendering or legacy renderer
    const renderingCfg = config.rendering || {};
    const legacyRenderer = config.renderer || {};
    const texFilterStr = renderingCfg.textureFilter || legacyRenderer.textureFilter || 'nearest';
    const tf = texFilterStr === 'linear' ? gl.LINEAR : gl.NEAREST;
    const up = (arr, w, h) => createTexture(gl, w, h, arr, tf);
    const tw = atl.wallAtlasW, th = 64, fw = atl.floorAtlasW, cw = atl.ceilAtlasW;
    this.atlases.wa = up(atl.wallAlbedo, tw, th); this.atlases.wn = up(atl.wallNormal, tw, th);
    this.atlases.wh = up(atl.wallHeight, tw, th); this.atlases.wrma = up(atl.wallRoughMetalAO, tw, th);
    this.atlases.fa = up(atl.floorAlbedo, fw, th); this.atlases.fn = up(atl.floorNormal, fw, th);
    this.atlases.fh = up(atl.floorHeight, fw, th); this.atlases.frma = up(atl.floorRoughMetalAO, fw, th);
    this.atlases.ca = up(atl.ceilAlbedo, cw, th); this.atlases.cn = up(atl.ceilNormal, cw, th);
    this.atlases.ch = up(atl.ceilHeight, cw, th); this.atlases.crma = up(atl.ceilRoughMetalAO, cw, th);

    const mapTexs = uploadMapTexture(gl, dungeon);
    this.mapTex = mapTexs.mapTex;
    this.matMapTex = mapTexs.matTex;

    this.paletteTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    this._cfgCache = config;
    this._applyPaletteFromConfig(config);
    this.rebuildPalette();

    const cw2 = this.canvas.width || 640, ch2 = this.canvas.height || 360;
    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw2, ch2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.sceneFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.mapUITex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.mapUITex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 160, 160, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // cache uniforms for raycast
    const ul = this.uLoc, p = this.program;
    const names = [
      // core
      'u_resolution','u_playerPos','u_playerAngle','u_fov','u_playerHeight','u_mapTex','u_matMap','u_mapSize',
      'u_wallAlbedo','u_wallNormal','u_wallHeight','u_wallRoughMetal',
      'u_floorAlbedo','u_floorNormal','u_floorHeight','u_floorRoughMetal',
      'u_ceilAlbedo','u_ceilNormal','u_ceilHeight','u_ceilRoughMetal',
      'u_texSize','u_atlasWalls','u_atlasFloors','u_atlasCeils',
      'u_lightPos','u_lightColor','u_lightIntensity','u_lightRadius',
      'u_ambientColor','u_ambientLevel','u_worldAmbientMul',
      'u_sunDir','u_sunDirZ','u_sunIntensity','u_sunColor',
      'u_fogBase','u_fogSquared','u_fogColor','u_fogEnabled',
      // pom
      'u_pomWall','u_pomFloor','u_pomCeil','u_pomSteps','u_pomMaxOffset','u_pomMinVz','u_pomMinEffVz','u_pomFadeStart','u_pomFadeEnd',
      // general
      'u_authentic','u_bandLevels','u_time',
      'u_gridDebug','u_lightingEnabled','u_pbrEnabled','u_pomEnabled','u_pbrDebugMode',
      'u_aoSun','u_aoPoint','u_aoAmbient',
      // chamfer
      'u_chamferEnabled','u_chamferFloorSize','u_chamferCeilSize','u_chamferWallSize','u_chamferCornerRadius','u_chamferDarken','u_chamferRoundCorners','u_chamferBlendFloor','u_chamferBlendWall','u_chamferRough','u_chamferFloor','u_chamferCeil','u_chamferWall',
      'u_chamferTrimFloor','u_chamferTrimCeil','u_chamferTrimWall','u_chamferTrimFloorAlt','u_chamferTrimCeilAlt','u_chamferCreviceEnd','u_chamferCreviceSmoothEnd','u_chamferTrimStart','u_chamferTrimMid','u_chamferTrimEnd',
      // corners
      'u_cornerEnabled','u_cornerRadius','u_cornerMode','u_cornerInner',
      'u_cornerBandNear','u_cornerBandFarExtra','u_cornerBandFarFactor','u_cornerSectorThresh','u_cornerNormalMix','u_cornerAlbedoBoost','u_cornerRoughMul','u_cornerAoMul',
      // shadows
      'u_shadowBiasN','u_shadowBiasDir','u_shadowSunFactor','u_shadowPointFactor','u_shadowSunMax','u_shadowPointEps','u_shadowNormalThresh',
      // pbr extended
      'u_pbrEmissiveAlbedoMul','u_pbrEmissiveStrength','u_pbrF0','u_pbrAttenQuad','u_pbrGGXEps',
      // rendering surface
      'u_renderFloorMul','u_renderCeilMul','u_renderWallDarken','u_renderEyeFactor',
      // Task 4 bob
      'u_bobPixels'
    ];
    names.forEach(n => ul[n] = gl.getUniformLocation(p, n));

    gl.useProgram(this.quantProgram);
    this.uQuant.scene = gl.getUniformLocation(this.quantProgram, 'u_scene');
    this.uQuant.palette = gl.getUniformLocation(this.quantProgram, 'u_palette');
    this.uQuant.lut = gl.getUniformLocation(this.quantProgram, 'u_lut');
    this.uQuant.authentic = gl.getUniformLocation(this.quantProgram, 'u_authentic');
    this.uQuant.style = gl.getUniformLocation(this.quantProgram, 'u_paletteStyle');
    gl.uniform1i(this.uQuant.scene, 0);
    gl.uniform1i(this.uQuant.palette, 1);
    gl.uniform1i(this.uQuant.lut, 2);

    gl.useProgram(this.uiProgram);
    this.uUI.mapUI = gl.getUniformLocation(this.uiProgram, 'u_mapUI');
    this.uUI.opacity = gl.getUniformLocation(this.uiProgram, 'u_opacity');
    gl.uniform1i(this.uUI.mapUI, 0);

    gl.useProgram(this.program);
    gl.uniform1i(ul.u_mapTex, 0);
    gl.uniform1i(ul.u_matMap, 13);
    const texUnits = {u_wallAlbedo:1,u_wallNormal:2,u_wallHeight:3,u_wallRoughMetal:4,u_floorAlbedo:5,u_floorNormal:6,u_floorHeight:7,u_floorRoughMetal:8,u_ceilAlbedo:9,u_ceilNormal:10,u_ceilHeight:11,u_ceilRoughMetal:12};
    Object.entries(texUnits).forEach(([name, unit]) => { if (ul[name]) gl.uniform1i(ul[name], unit); });

    // Resolve defaults from dedicated configs with fallback to legacy
    this._resolveToggles(config);
    this.ready = true;
  }

  _applyPaletteFromConfig(cfg){
    const paletteCfg = cfg.palette || {};
    const rendering = cfg.rendering || {};
    const legacy = cfg.renderer || {};
    const legacyPbr = cfg.pbr || {};
    this.authentic = (paletteCfg.authentic ?? rendering.authentic ?? legacy.authentic ?? true) !== false;
    this.paletteStyle = paletteCfg.paletteStyle || rendering.paletteStyle || legacy.paletteStyle || 'doom';
    this.bandLevels = paletteCfg.bandLevels ?? rendering.bandLevels ?? legacy.bandLevels ?? 32;
  }

  _resolveToggles(cfg){
    const fogCfg = cfg.fog || {};
    this.fogEnabled = (fogCfg.enabled !== false) ? 1 : 0;

    const getDeep = (obj, paths, fallback) => {
      for(const p of paths){
        const parts = p.split('.');
        let cur = obj;
        for(const part of parts){ cur = cur?.[part]; if(cur===undefined) break; }
        if(cur !== undefined) return cur;
      }
      return fallback;
    };

    const pomCfg = cfg.pom || {};
    const pomLegacy = cfg.rendering?.pom || cfg.renderer?.pom || {};
    const pomEnabled = getDeep(cfg, ['pom.enabled', 'rendering.pom.enabled', 'renderer.pom.enabled', 'rendering.toggles.pomDefault', 'renderer.pom.enabled'], true);
    this.pomEnabled = (pomEnabled !== false) ? 1 : 0;

    const chamferCfg = cfg.chamfer || {};
    const legacyChamfer = cfg.pbr?.chamfer || {};
    const chamEnabled = chamferCfg.enabled ?? legacyChamfer.enabled ?? cfg.pbr?.chamfer?.enabled ?? cfg.rendering?.toggles?.chamferDefault ?? true;
    this.chamferEnabled = (chamEnabled !== false) ? 1 : 0;

    const cornersCfg = cfg.corners || {};
    const legacyCorner = cfg.pbr?.corner || cfg.pbr?.cornerGeometry || {};
    const cornerEnabled = cornersCfg.enabled ?? legacyCorner.enabled ?? cfg.rendering?.toggles?.cornerDefault ?? true;
    this.cornerEnabled = (cornerEnabled !== false) ? 1 : 0;

    // palette already handled
  }

  rebuildPalette() {
    const gl = this.gl;
    const pal = genPalette(this.paletteStyle);
    const lut = buildRGBToPal(pal);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pal);
    const lut2d = new Uint8Array(1024 * 32);
    for (let b = 0; b < 32; b++) for (let g = 0; g < 32; g++) for (let r = 0; r < 32; r++) {
      const idx = (r << 10) | (g << 5) | b;
      const v = lut[idx];
      lut2d[b * 1024 + g * 32 + r] = v;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1024, 32, 0, gl.RED, gl.UNSIGNED_BYTE, lut2d);
  }

  setAuthentic(v) { this.authentic = !!v; }
  setPaletteStyle(s) { this.paletteStyle = s; this.rebuildPalette(); }
  setBandLevels(n) { this.bandLevels = Math.max(8, Math.min(64, n | 0)); }
  setGridDebug(v) { this.gridDebug = v ? 1 : 0; }
  setLightingEnabled(v) { this.lightingEnabled = v ? 1 : 0; }
  setPBREnabled(v) { this.pbrEnabled = v ? 1 : 0; }
  setPOMEnabled(v) { this.pomEnabled = v ? 1 : 0; }
  setFogEnabled(v) { this.fogEnabled = v ? 1 : 0; }
  setChamferEnabled(v) { this.chamferEnabled = v ? 1 : 0; }
  setCornerEnabled(v) { this.cornerEnabled = v ? 1 : 0; }
  setPBRDebugMode(v) { this.pbrDebugMode = Math.max(0, Math.min(8, v | 0)); }
  toggleGridDebug() { this.gridDebug ^= 1; return this.gridDebug; }
  toggleLighting() { this.lightingEnabled ^= 1; return this.lightingEnabled; }
  togglePBR() { this.pbrEnabled ^= 1; return this.pbrEnabled; }
  togglePOM() { this.pomEnabled ^= 1; return this.pomEnabled; }
  toggleFog() { this.fogEnabled ^= 1; return this.fogEnabled; }
  toggleChamfer() { this.chamferEnabled ^= 1; return this.chamferEnabled; }
  toggleCorner() { this.cornerEnabled ^= 1; return this.cornerEnabled; }
  cyclePBRDebug() { this.pbrDebugMode = (this.pbrDebugMode + 1) % 9; return this.pbrDebugMode; }

  uploadMap(dungeon) {
    if (this.mapTex && this.matMapTex) updateMapTexture(this.gl, this.mapTex, this.matMapTex, dungeon);
    else { const t = uploadMapTexture(this.gl, dungeon); this.mapTex = t.mapTex; this.matMapTex = t.matTex; }
  }

  renderMapUI(texData, uiCfg) {
    const gl = this.gl;
    if (!texData || !this.mapUITex) return;
    const posStr = uiCfg?.display?.position ?? uiCfg?.position ?? 'fullscreen';
    const isFullscreen = posStr === 'fullscreen';
    const w = isFullscreen ? 640 : (uiCfg.display?.size ?? uiCfg.size ?? 160);
    const h = isFullscreen ? 360 : (uiCfg.display?.size ?? uiCfg.size ?? 160);
    gl.bindTexture(gl.TEXTURE_2D, this.mapUITex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
    const opacity = uiCfg.display?.opacity ?? uiCfg.parchment?.alpha ?? uiCfg.opacity ?? 0.88;
    this._pendingMapUI = { size: w, opacity, position: posStr, texW: w, texH: h };
  }

  _renderUIPass() {
    const gl = this.gl;
    if (!this._pendingMapUI) return;
    const { size, opacity, position } = this._pendingMapUI;
    this._pendingMapUI = null;

    gl.useProgram(this.uiProgram);
    gl.bindVertexArray(this.vaoUI);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const cw = this.canvas.width, ch = this.canvas.height;
    let x0, y0, x1, y1;
    if (position === 'fullscreen') { x0 = 0; y0 = 0; x1 = cw; y1 = ch; }
    else {
      const s = size; const pad = 10;
      if (position === 'top-right') { x1 = cw - pad; y1 = pad; x0 = x1 - s; y0 = y1 + s; }
      else if (position === 'top-left') { x0 = pad; y0 = pad; x1 = x0 + s; y1 = y0 + s; }
      else if (position === 'bottom-right') { x1 = cw - pad; y0 = ch - pad - s; x0 = x1 - s; y1 = ch - pad; }
      else { x0 = pad; y0 = ch - pad - s; x1 = x0 + s; y1 = ch - pad; }
    }
    const ndc = (x, y) => [(x / cw) * 2 - 1, 1 - (y / ch) * 2];
    const [x0n, y0n] = ndc(x0, y0);
    const [x1n, y1n] = ndc(x1, y1);
    const verts = new Float32Array([x0n,y0n,0,0,  x1n,y0n,1,0,  x0n,y1n,0,1,  x1n,y1n,1,1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    const locPos = gl.getAttribLocation(this.uiProgram, 'a_pos');
    const locUV = gl.getAttribLocation(this.uiProgram, 'a_uv');
    gl.enableVertexAttribArray(locPos); gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locUV); gl.vertexAttribPointer(locUV, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mapUITex);
    gl.uniform1i(this.uUI.mapUI, 0);
    gl.uniform1f(this.uUI.opacity, opacity);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  _resolveConfigValue(cfg, paths, fallback){
    for(const p of paths){
      const parts = p.split('.');
      let cur = cfg;
      for(const part of parts){ cur = cur?.[part]; if(cur===undefined) break; }
      if(cur !== undefined) return cur;
    }
    return fallback;
  }

  render(dungeon, player, timeSec) {
    if (!this.ready) return;
    const gl = this.gl;
    const cfg = player._cfg || this._cfgCache || {};

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const ul = this.uLoc;
    // Task 4: Apply view bob — prototype exact: lateral via right vector, roll via angle, vertical via screen pixel offset (bobPixels)
    // This matches mygame: bobPixels = viewBobOffset * h * 0.8, bobX via right vector, roll added to angle.
    // Ensures figure-8 path and centered snap when idle (bobAmount decays).
    const rawPos = player.getPosition();
    // Use raw xy from player (player.js returns base+vertical bob in z, but xy is world pos without lateral bob)
    // For centering, xy should be floor+0.5 when idle in grid mode — enforced by player.js and game.js spawn using floor+0.5
    let camX = rawPos.x;
    let camY = rawPos.y;
    // If player x,y are not centered due to free drift, grid mode would have snapped already; still ensure we use raw pos
    // Remove any accidental bob from getPosition z — we use explicit offsets below
    const bobOffsetX = player.viewBobOffsetX || 0;
    const bobRoll = player.viewBobRoll || 0;
    const bobOffsetY = player.viewBobOffset || 0;
    const baseAngle = (typeof player.getRawAngle === 'function') ? player.getRawAngle() : player.angle;
    if (bobOffsetX !== 0) {
      const rx = -Math.sin(baseAngle);
      const ry = Math.cos(baseAngle);
      camX += rx * bobOffsetX;
      camY += ry * bobOffsetX;
    }
    const renderAngle = baseAngle + bobRoll;
    gl.uniform2f(ul.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(ul.u_playerPos, camX, camY);
    gl.uniform1f(ul.u_playerAngle, renderAngle);

    // bobPixels like mygame: vertical world offset converted to screen pixels to shift fragCoord
    // mygame factor h*0.8, dungeoneers canvas h is 360 internal, so use same
    const renderH = this.h || this.canvas.height || 360;
    const bobPixels = bobOffsetY * renderH * 0.8;
    if (ul.u_bobPixels) gl.uniform1f(ul.u_bobPixels, bobPixels);

    // --- Rendering / FOV / Eye ---
    const rendering = cfg.rendering || {};
    const legacyRenderer = cfg.renderer || {};
    const fov = this._resolveConfigValue(cfg, ['rendering.fov','renderer.fov'], 1.0);
    const baseHeight = this._resolveConfigValue(cfg, ['player.height','rendering.eye.height','renderer.eyeHeight'], 0.5);
    const playerHeight = baseHeight; // vertical bob now via u_bobPixels, not world height — matches prototype axis
    const eyeFactor = this._resolveConfigValue(cfg, ['rendering.eye.playerHeightFactor','rendering.eyeFactor','debug.overlay.eyeFactor'], 0.15);
    gl.uniform1f(ul.u_fov, fov);
    gl.uniform1f(ul.u_playerHeight, playerHeight);
    if(ul.u_renderEyeFactor) gl.uniform1f(ul.u_renderEyeFactor, eyeFactor);

    gl.uniform2f(ul.u_mapSize, dungeon.w, dungeon.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
    gl.uniform1i(ul.u_mapTex, 0);
    gl.activeTexture(gl.TEXTURE0 + 13); gl.bindTexture(gl.TEXTURE_2D, this.matMapTex);
    gl.uniform1i(ul.u_matMap, 13);

    const a = this.atlases;
    const bind = (tex, unit, locName) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); if (ul[locName]) gl.uniform1i(ul[locName], unit); };
    bind(a.wa, 1, 'u_wallAlbedo'); bind(a.wn, 2, 'u_wallNormal'); bind(a.wh, 3, 'u_wallHeight'); bind(a.wrma, 4, 'u_wallRoughMetal');
    bind(a.fa, 5, 'u_floorAlbedo'); bind(a.fn, 6, 'u_floorNormal'); bind(a.fh, 7, 'u_floorHeight'); bind(a.frma, 8, 'u_floorRoughMetal');
    bind(a.ca, 9, 'u_ceilAlbedo'); bind(a.cn, 10, 'u_ceilNormal'); bind(a.ch, 11, 'u_ceilHeight'); bind(a.crma, 12, 'u_ceilRoughMetal');

    const ai = this.atlasInfo;
    gl.uniform1f(ul.u_texSize, ai.texSize);
    gl.uniform1f(ul.u_atlasWalls, ai.wallAtlasW);
    gl.uniform1f(ul.u_atlasFloors, ai.floorAtlasW);
    gl.uniform1f(ul.u_atlasCeils, ai.ceilAtlasW);

    const light = player.getLightSource();
    gl.uniform3f(ul.u_lightPos, light.x, light.y, light.z);
    gl.uniform3f(ul.u_lightColor, light.color[0], light.color[1], light.color[2]);
    gl.uniform1f(ul.u_lightIntensity, light.intensity);
    gl.uniform1f(ul.u_lightRadius, light.radius);

    // --- Lighting (lighting.json) ---
    const lightingCfg = cfg.lighting || {};
    const lightsLegacy = cfg.lights || {};
    const ambientLevel = this._resolveConfigValue(cfg, ['lighting.ambient.level','lights.ambient','renderer.ambient'], 0.36);
    const ambientColor = this._resolveConfigValue(cfg, ['lighting.ambient.color','lights.ambientColor'], [1,1,1]);
    const worldMul = this._resolveConfigValue(cfg, ['lighting.ambient.worldMul','lights.worldAmbientMul'], 0.38);
    const sunDir = this._resolveConfigValue(cfg, ['lighting.sun.dir','lights.sunDir'], [-0.55,-0.45,-0.7]);
    const sunColor = this._resolveConfigValue(cfg, ['lighting.sun.color','lights.sunColor'], [1,1,1]);
    const sunIntensity = this._resolveConfigValue(cfg, ['lighting.sun.intensity','lights.sunIntensity'], 1.5);

    gl.uniform3f(ul.u_ambientColor, ambientColor[0], ambientColor[1], ambientColor[2]);
    gl.uniform1f(ul.u_ambientLevel, ambientLevel);
    if (ul.u_worldAmbientMul) gl.uniform1f(ul.u_worldAmbientMul, worldMul);
    const sunLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
    if (ul.u_sunDir) gl.uniform2f(ul.u_sunDir, sunDir[0] / sunLen, sunDir[1] / sunLen);
    if (ul.u_sunDirZ) gl.uniform1f(ul.u_sunDirZ, sunDir[2] / sunLen);
    if (ul.u_sunIntensity) gl.uniform1f(ul.u_sunIntensity, sunIntensity);
    if (ul.u_sunColor) gl.uniform3f(ul.u_sunColor, sunColor[0], sunColor[1], sunColor[2]);

    // --- Fog ---
    const fogCfg = cfg.fog || {};
    gl.uniform1f(ul.u_fogBase, fogCfg.base ?? 0.06);
    gl.uniform1f(ul.u_fogSquared, fogCfg.squared ?? 0.005);
    const fogC = fogCfg.color || [0.05, 0.05, 0.08];
    gl.uniform3f(ul.u_fogColor, fogC[0], fogC[1], fogC[2]);
    if (ul.u_fogEnabled) gl.uniform1i(ul.u_fogEnabled, this.fogEnabled ? 1 : 0);

    // --- POM (pom.json) with fallback to renderer.pom ---
    const pomCfg = cfg.pom || {};
    const pomLegacy = cfg.rendering?.pom || cfg.renderer?.pom || {};
    const pomWall = this._resolveConfigValue(cfg, ['pom.strength.wall','pom.wall','rendering.pom.wall','renderer.pom.wall'], 0.06);
    const pomFloor = this._resolveConfigValue(cfg, ['pom.strength.floor','pom.floor','rendering.pom.floor','renderer.pom.floor'], 0.07);
    const pomCeil = this._resolveConfigValue(cfg, ['pom.strength.ceil','pom.ceil','rendering.pom.ceil','renderer.pom.ceil'], 0.035);
    const pomSteps = this._resolveConfigValue(cfg, ['pom.steps','rendering.pom.steps'], 8);
    const pomMaxOffset = this._resolveConfigValue(cfg, ['pom.clamping.maxOffset','pom.maxOffset'], 0.10);
    const pomMinVz = this._resolveConfigValue(cfg, ['pom.clamping.minViewZ','pom.minVz'], 0.08);
    const pomMinEff = this._resolveConfigValue(cfg, ['pom.clamping.minEffectiveVz','pom.minEffectiveVz'], 0.18);
    const pomFadeStart = this._resolveConfigValue(cfg, ['pom.fading.fadeStart','pom.fadeStart'], 0.08);
    const pomFadeEnd = this._resolveConfigValue(cfg, ['pom.fading.fadeEnd','pom.fadeEnd'], 0.22);

    const pomOn = this.pomEnabled ? 1 : 0;
    gl.uniform1f(ul.u_pomWall, pomWall * pomOn);
    gl.uniform1f(ul.u_pomFloor, pomFloor * pomOn);
    gl.uniform1f(ul.u_pomCeil, pomCeil * pomOn);
    gl.uniform1i(ul.u_pomSteps, pomSteps | 0);
    if (ul.u_pomMaxOffset) gl.uniform1f(ul.u_pomMaxOffset, pomMaxOffset);
    if (ul.u_pomMinVz) gl.uniform1f(ul.u_pomMinVz, pomMinVz);
    if (ul.u_pomMinEffVz) gl.uniform1f(ul.u_pomMinEffVz, pomMinEff);
    if (ul.u_pomFadeStart) gl.uniform1f(ul.u_pomFadeStart, pomFadeStart);
    if (ul.u_pomFadeEnd) gl.uniform1f(ul.u_pomFadeEnd, pomFadeEnd);

    // --- Debug toggles ---
    if (ul.u_gridDebug) gl.uniform1i(ul.u_gridDebug, this.gridDebug ? 1 : 0);
    if (ul.u_lightingEnabled) gl.uniform1i(ul.u_lightingEnabled, this.lightingEnabled ? 1 : 0);
    if (ul.u_pbrEnabled) gl.uniform1i(ul.u_pbrEnabled, this.pbrEnabled ? 1 : 0);
    if (ul.u_pomEnabled) gl.uniform1i(ul.u_pomEnabled, this.pomEnabled ? 1 : 0);
    if (ul.u_pbrDebugMode) gl.uniform1i(ul.u_pbrDebugMode, this.pbrDebugMode);

    // --- AO (ao.json) + pbr.ao fallback ---
    const aoCfg = cfg.ao || {};
    const pbrAOLegacy = cfg.pbr?.ao || {};
    const aoSun = this._resolveConfigValue(cfg, ['ao.affect.sun','pbr.ao.affectSun','ao.affectSun'], 0.25);
    const aoPoint = this._resolveConfigValue(cfg, ['ao.affect.point','pbr.ao.affectPoint','ao.affectPoint'], 0.35);
    const aoAmbient = this._resolveConfigValue(cfg, ['ao.affect.ambient','pbr.ao.affectAmbient','ao.affectAmbient'], 1.0);
    if (ul.u_aoSun) gl.uniform1f(ul.u_aoSun, aoSun);
    if (ul.u_aoPoint) gl.uniform1f(ul.u_aoPoint, aoPoint);
    if (ul.u_aoAmbient) gl.uniform1f(ul.u_aoAmbient, aoAmbient);

    // --- PBR (pbr.json) ---
    const pbrCfg = cfg.pbr || {};
    const pbrEmissiveAlbedo = this._resolveConfigValue(cfg, ['pbr.emissive.albedoMul','pbr.emissiveAlbedoMul'], 0.8);
    const pbrEmissiveStrength = this._resolveConfigValue(cfg, ['pbr.emissive.strengthMul','pbr.missiveStrength'], 2.5);
    const pbrF0 = this._resolveConfigValue(cfg, ['pbr.fresnel.f0Dielectric','pbr.F0','pbr.f0Dielectric'], 0.04);
    const pbrAtten = this._resolveConfigValue(cfg, ['pbr.pointAttenuation.quadraticFactor','pbr.attenQuad','pbr.pointAttenuation'], 0.25);
    const pbrEps = this._resolveConfigValue(cfg, ['pbr.ggx.epsilon','pbr.epsilon'], 0.0001);
    if (ul.u_pbrEmissiveAlbedoMul) gl.uniform1f(ul.u_pbrEmissiveAlbedoMul, pbrEmissiveAlbedo);
    if (ul.u_pbrEmissiveStrength) gl.uniform1f(ul.u_pbrEmissiveStrength, pbrEmissiveStrength);
    if (ul.u_pbrF0) gl.uniform1f(ul.u_pbrF0, pbrF0);
    if (ul.u_pbrAttenQuad) gl.uniform1f(ul.u_pbrAttenQuad, pbrAtten);
    if (ul.u_pbrGGXEps) gl.uniform1f(ul.u_pbrGGXEps, pbrEps);

    // --- Rendering surface (rendering.json) ---
    const floorMul = this._resolveConfigValue(cfg, ['rendering.surface.floorAlbedoMul','renderer.floorAlbedoMul'], 0.7);
    const ceilMul = this._resolveConfigValue(cfg, ['rendering.surface.ceilAlbedoMul','renderer.ceilAlbedoMul'], 0.8);
    const wallDarken = this._resolveConfigValue(cfg, ['rendering.surface.wallDarkenSide','renderer.wallDarkenSide'], 0.85);
    if (ul.u_renderFloorMul) gl.uniform1f(ul.u_renderFloorMul, floorMul);
    if (ul.u_renderCeilMul) gl.uniform1f(ul.u_renderCeilMul, ceilMul);
    if (ul.u_renderWallDarken) gl.uniform1f(ul.u_renderWallDarken, wallDarken);

    // --- Shadows (shadows.json) ---
    const shCfg = cfg.shadows || {};
    const shBiasN = this._resolveConfigValue(cfg, ['shadows.bias.traceNormalOffset','shadows.traceNormalOffset'], 0.10);
    const shBiasDir = this._resolveConfigValue(cfg, ['shadows.bias.dirOffset','shadows.dirOffset'], 0.06);
    const shSunFactor = this._resolveConfigValue(cfg, ['shadows.sun.shadowFactor','shadows.sunShadowFactor'], 0.25);
    const shPointFactor = this._resolveConfigValue(cfg, ['shadows.point.shadowFactor','shadows.pointShadowFactor'], 0.15);
    const shSunMax = this._resolveConfigValue(cfg, ['shadows.sun.maxDist','shadows.sunMaxDist'], 20.0);
    const shPointEps = this._resolveConfigValue(cfg, ['shadows.point.distEpsilon','shadows.pointEps'], 0.10);
    const shNormalThresh = this._resolveConfigValue(cfg, ['shadows.traceNormal.threshold','shadows.normalThresh'], 0.02);
    if (ul.u_shadowBiasN) gl.uniform1f(ul.u_shadowBiasN, shBiasN);
    if (ul.u_shadowBiasDir) gl.uniform1f(ul.u_shadowBiasDir, shBiasDir);
    if (ul.u_shadowSunFactor) gl.uniform1f(ul.u_shadowSunFactor, shSunFactor);
    if (ul.u_shadowPointFactor) gl.uniform1f(ul.u_shadowPointFactor, shPointFactor);
    if (ul.u_shadowSunMax) gl.uniform1f(ul.u_shadowSunMax, shSunMax);
    if (ul.u_shadowPointEps) gl.uniform1f(ul.u_shadowPointEps, shPointEps);
    if (ul.u_shadowNormalThresh) gl.uniform1f(ul.u_shadowNormalThresh, shNormalThresh);

    // --- Chamfer (chamfer.json) + pbr.chamfer fallback ---
    const chCfg = cfg.chamfer || {};
    const chLegacy = cfg.pbr?.chamfer || {};
    const cfgChamEnabled = chCfg.enabled ?? chLegacy.enabled ?? true;
    const chamEnabled = cfgChamEnabled && (this.chamferEnabled !== 0);
    if (ul.u_chamferEnabled) gl.uniform1i(ul.u_chamferEnabled, chamEnabled ? 1 : 0);

    const fSize = this._resolveConfigValue(cfg, ['chamfer.size.floor','pbr.chamfer.floorSize','pbr.chamfer.floor'], 0.30);
    const cSize = this._resolveConfigValue(cfg, ['chamfer.size.ceil','pbr.chamfer.ceilSize','pbr.chamfer.ceil'], 0.24);
    const wSize = this._resolveConfigValue(cfg, ['chamfer.size.wall','pbr.chamfer.wallSize','pbr.chamfer.wall'], 0.28);
    const cr = this._resolveConfigValue(cfg, ['chamfer.size.cornerRadius','pbr.chamfer.cornerRadius'], 0.22);
    const dark = this._resolveConfigValue(cfg, ['chamfer.shading.darken','pbr.chamfer.darken'], 0.55);
    const round = this._resolveConfigValue(cfg, ['chamfer.shading.roundCorners','pbr.chamfer.roundCorners'], false) ? 1 : 0;
    const bFloor = this._resolveConfigValue(cfg, ['chamfer.shading.floorToWallBlend','pbr.chamfer.floorToWallBlend','pbr.chamfer.blendFloor'], 0.92);
    const bWall = this._resolveConfigValue(cfg, ['chamfer.shading.wallToWallBlend','pbr.chamfer.wallToWallBlend','pbr.chamfer.blendWall'], 0.88);
    const chRough = this._resolveConfigValue(cfg, ['chamfer.shading.affectRoughness','pbr.chamfer.affectRoughness'], 0.35);

    if (ul.u_chamferFloorSize) gl.uniform1f(ul.u_chamferFloorSize, fSize);
    if (ul.u_chamferCeilSize) gl.uniform1f(ul.u_chamferCeilSize, cSize);
    if (ul.u_chamferWallSize) gl.uniform1f(ul.u_chamferWallSize, wSize);
    if (ul.u_chamferCornerRadius) gl.uniform1f(ul.u_chamferCornerRadius, cr);
    if (ul.u_chamferDarken) gl.uniform1f(ul.u_chamferDarken, dark);
    if (ul.u_chamferRoundCorners) gl.uniform1i(ul.u_chamferRoundCorners, round);
    if (ul.u_chamferBlendFloor) gl.uniform1f(ul.u_chamferBlendFloor, bFloor);
    if (ul.u_chamferBlendWall) gl.uniform1f(ul.u_chamferBlendWall, bWall);
    if (ul.u_chamferRough) gl.uniform1f(ul.u_chamferRough, chRough);
    if (ul.u_chamferFloor) gl.uniform1f(ul.u_chamferFloor, fSize);
    if (ul.u_chamferCeil) gl.uniform1f(ul.u_chamferCeil, cSize);
    if (ul.u_chamferWall) gl.uniform1f(ul.u_chamferWall, wSize);

    // chamfer trim extended
    const trimFloor = this._resolveConfigValue(cfg, ['chamfer.trim.floorStrength','chamfer.shading.trimFloor'], 0.22);
    const trimCeil = this._resolveConfigValue(cfg, ['chamfer.trim.ceilStrength'], 0.18);
    const trimWall = this._resolveConfigValue(cfg, ['chamfer.trim.wallStrength'], 0.16);
    const trimFloorAlt = this._resolveConfigValue(cfg, ['chamfer.trim.floorAltStrength'], 0.18);
    const trimCeilAlt = this._resolveConfigValue(cfg, ['chamfer.trim.ceilAltStrength'], 0.14);
    const creviceEnd = this._resolveConfigValue(cfg, ['chamfer.ranges.creviceEnd'], 0.12);
    const creviceSmooth = this._resolveConfigValue(cfg, ['chamfer.ranges.creviceSmoothEnd'], 0.30);
    const trimStart = this._resolveConfigValue(cfg, ['chamfer.ranges.trimStart'], 0.08);
    const trimMid = this._resolveConfigValue(cfg, ['chamfer.ranges.trimMid'], 0.35);
    const trimEnd = this._resolveConfigValue(cfg, ['chamfer.ranges.trimEnd'], 1.0);
    if (ul.u_chamferTrimFloor) gl.uniform1f(ul.u_chamferTrimFloor, trimFloor);
    if (ul.u_chamferTrimCeil) gl.uniform1f(ul.u_chamferTrimCeil, trimCeil);
    if (ul.u_chamferTrimWall) gl.uniform1f(ul.u_chamferTrimWall, trimWall);
    if (ul.u_chamferTrimFloorAlt) gl.uniform1f(ul.u_chamferTrimFloorAlt, trimFloorAlt);
    if (ul.u_chamferTrimCeilAlt) gl.uniform1f(ul.u_chamferTrimCeilAlt, trimCeilAlt);
    if (ul.u_chamferCreviceEnd) gl.uniform1f(ul.u_chamferCreviceEnd, creviceEnd);
    if (ul.u_chamferCreviceSmoothEnd) gl.uniform1f(ul.u_chamferCreviceSmoothEnd, creviceSmooth);
    if (ul.u_chamferTrimStart) gl.uniform1f(ul.u_chamferTrimStart, trimStart);
    if (ul.u_chamferTrimMid) gl.uniform1f(ul.u_chamferTrimMid, trimMid);
    if (ul.u_chamferTrimEnd) gl.uniform1f(ul.u_chamferTrimEnd, trimEnd);

    // --- Corners (corners.json) + pbr.corner fallback ---
    const cornerCfg = cfg.corners || cfg.corner || {};
    const cornerLegacy = cfg.pbr?.corner || cfg.pbr?.cornerGeometry || {};
    const cfgCornerEnabled = cornerCfg.enabled ?? cornerLegacy.enabled ?? true;
    const cornerEnabled = cfgCornerEnabled && (this.cornerEnabled !== 0);
    const cornerRadius = this._resolveConfigValue(cfg, ['corners.radius','pbr.corner.radius','pbr.corner.cornerRadius'], 0.15);
    const cornerModeRaw = this._resolveConfigValue(cfg, ['corners.mode','pbr.corner.mode'], 2);
    const cornerMode = (cornerModeRaw === 'bevel' ? 0 : (cornerModeRaw === 'round' ? 1 : (cornerModeRaw | 0)));
    const cornerInner = this._resolveConfigValue(cfg, ['corners.inner','pbr.corner.inner'], true) ? 1 : 0;

    const bandNear = this._resolveConfigValue(cfg, ['corners.search.bandNear','corners.bandNear'], 0.08);
    const bandFarExtra = this._resolveConfigValue(cfg, ['corners.search.bandFarExtra','corners.bandFarExtra'], 0.15);
    const bandFarFactor = this._resolveConfigValue(cfg, ['corners.search.bandFarFactor','corners.bandFarFactor'], 2.0);
    const sectorThresh = this._resolveConfigValue(cfg, ['corners.search.sectorThreshold','corners.sectorThresh'], 0.02);
    const normalMix = this._resolveConfigValue(cfg, ['corners.shading.normalMix','corners.normalMix'], 0.92);
    const albedoBoost = this._resolveConfigValue(cfg, ['corners.shading.albedoBoost','corners.albedoBoost'], 0.05);
    const roughMulC = this._resolveConfigValue(cfg, ['corners.shading.roughnessMul','corners.roughMul'], 0.82);
    const aoMulC = this._resolveConfigValue(cfg, ['corners.shading.aoMul','corners.aoMul'], 0.96);

    if (ul.u_cornerEnabled) gl.uniform1i(ul.u_cornerEnabled, cornerEnabled ? 1 : 0);
    if (ul.u_cornerRadius) gl.uniform1f(ul.u_cornerRadius, cornerRadius);
    if (ul.u_cornerMode) gl.uniform1i(ul.u_cornerMode, cornerMode);
    if (ul.u_cornerInner) gl.uniform1i(ul.u_cornerInner, cornerInner);
    if (ul.u_cornerBandNear) gl.uniform1f(ul.u_cornerBandNear, bandNear);
    if (ul.u_cornerBandFarExtra) gl.uniform1f(ul.u_cornerBandFarExtra, bandFarExtra);
    if (ul.u_cornerBandFarFactor) gl.uniform1f(ul.u_cornerBandFarFactor, bandFarFactor);
    if (ul.u_cornerSectorThresh) gl.uniform1f(ul.u_cornerSectorThresh, sectorThresh);
    if (ul.u_cornerNormalMix) gl.uniform1f(ul.u_cornerNormalMix, normalMix);
    if (ul.u_cornerAlbedoBoost) gl.uniform1f(ul.u_cornerAlbedoBoost, albedoBoost);
    if (ul.u_cornerRoughMul) gl.uniform1f(ul.u_cornerRoughMul, roughMulC);
    if (ul.u_cornerAoMul) gl.uniform1f(ul.u_cornerAoMul, aoMulC);

    gl.uniform1i(ul.u_authentic, this.authentic ? 1 : 0);
    if (ul.u_bandLevels) gl.uniform1i(ul.u_bandLevels, this.bandLevels);
    gl.uniform1f(ul.u_time, timeSec);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // Pass 2: quantize to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.quantProgram);
    gl.bindVertexArray(this.vaoQuant);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(this.uQuant.scene, 0);
    gl.uniform1i(this.uQuant.palette, 1);
    gl.uniform1i(this.uQuant.lut, 2);
    gl.uniform1i(this.uQuant.authentic, this.authentic ? 1 : 0);
    const palMap = { doom: 0, smooth256: 1, truecolor: 2, grayscale: 3, sepia: 4 };
    gl.uniform1i(this.uQuant.style, palMap[this.paletteStyle] ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    this._renderUIPass();
  }

  resize(w, h) {
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  isReady() { return this.ready; }

  renderMapOnly(dungeon, player) {
    if (!this.ready) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this._renderUIPass();
  }
}
