// WebGL2 first-person raycast renderer with PBR, palette quantization, sun lighting, shadows, and UI map overlay

import { createProgram, createTexture } from './gl-utils.js';
import { vsSource, fsSource, vsQuantize, fsQuantize, vsUI, fsUI } from './shaders.js';
import { uploadMapTexture, updateMapTexture } from './map-upload.js';
import { generateMaterialAtlases } from '../world/materials.js';
import { getAsset } from '../config/config.js';
import { genPalette, genColormap, buildRGBToPal } from './palette.js';

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
    this.pomEnabled = 0;
    this.fogEnabled = 1;
  }

  async init(dungeon, config) {
    const gl = this.gl;
    this.program = createProgram(gl, vsSource, fsSource);
    if (!this.program) throw new Error('Shader compile failed raycast');
    this.quantProgram = createProgram(gl, vsQuantize, fsQuantize);
    if (!this.quantProgram) throw new Error('Shader compile failed quantize');
    this.uiProgram = createProgram(gl, vsUI, fsUI);
    if (!this.uiProgram) throw new Error('Shader compile failed UI');

    // fullscreen quad VAO for raycast
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // quantize VAO
    this.vaoQuant = gl.createVertexArray();
    gl.bindVertexArray(this.vaoQuant);
    const buf2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const locQ = gl.getAttribLocation(this.quantProgram, 'a_pos');
    gl.enableVertexAttribArray(locQ);
    gl.vertexAttribPointer(locQ, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // UI VAO with positions and UVs for corner quad
    this.vaoUI = gl.createVertexArray();
    gl.bindVertexArray(this.vaoUI);
    // positions and UVs interleaved: x,y,u,v
    const uiBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uiBuf);
    // placeholder quad, updated per frame in renderMapUI
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(16), gl.DYNAMIC_DRAW);
    const locUIPos = gl.getAttribLocation(this.uiProgram, 'a_pos');
    const locUIUV = gl.getAttribLocation(this.uiProgram, 'a_uv');
    gl.enableVertexAttribArray(locUIPos);
    gl.vertexAttribPointer(locUIPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locUIUV);
    gl.vertexAttribPointer(locUIUV, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    // load materials
    const walls = await getAsset('materials', 'walls');
    const floors = await getAsset('materials', 'floors');
    const ceils = await getAsset('materials', 'ceils');
    const wallMats = (walls?.materials || []).slice(0, 1);
    const floorMats = (floors?.materials || []).slice(0, 1);
    const ceilMats = (ceils?.materials || []).slice(0, 1);
    const proc = config.materialProc || {};
    const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
    this.atlasInfo = atl;

    const tf = config.renderer?.textureFilter === 'linear' ? gl.LINEAR : gl.NEAREST;
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

    // palette textures
    this.paletteTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    this.rebuildPalette();

    // scene FBO for first pass
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

    // map UI texture
    this.mapUITex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.mapUITex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 160, 160, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // cache uniform locations for raycast program
    const ul = this.uLoc, p = this.program;
    const names = ['u_resolution','u_playerPos','u_playerAngle','u_fov','u_playerHeight','u_mapTex','u_matMap','u_mapSize',
      'u_wallAlbedo','u_wallNormal','u_wallHeight','u_wallRoughMetal',
      'u_floorAlbedo','u_floorNormal','u_floorHeight','u_floorRoughMetal',
      'u_ceilAlbedo','u_ceilNormal','u_ceilHeight','u_ceilRoughMetal',
      'u_texSize','u_atlasWalls','u_atlasFloors','u_atlasCeils',
      'u_lightPos','u_lightColor','u_lightIntensity','u_lightRadius',
      'u_ambientColor','u_ambientLevel','u_worldAmbientMul',
      'u_sunDir','u_sunDirZ','u_sunIntensity','u_sunColor',
      'u_fogBase','u_fogSquared','u_fogColor','u_fogEnabled',
      'u_pomWall','u_pomFloor','u_pomCeil','u_pomSteps','u_authentic','u_bandLevels','u_time',
      'u_gridDebug','u_lightingEnabled','u_pbrEnabled','u_pomEnabled'];
    names.forEach(n => ul[n] = gl.getUniformLocation(p, n));

    // quantize uniforms
    gl.useProgram(this.quantProgram);
    this.uQuant.scene = gl.getUniformLocation(this.quantProgram, 'u_scene');
    this.uQuant.palette = gl.getUniformLocation(this.quantProgram, 'u_palette');
    this.uQuant.lut = gl.getUniformLocation(this.quantProgram, 'u_lut');
    this.uQuant.authentic = gl.getUniformLocation(this.quantProgram, 'u_authentic');
    this.uQuant.style = gl.getUniformLocation(this.quantProgram, 'u_paletteStyle');
    gl.uniform1i(this.uQuant.scene, 0);
    gl.uniform1i(this.uQuant.palette, 1);
    gl.uniform1i(this.uQuant.lut, 2);

    // UI uniforms
    gl.useProgram(this.uiProgram);
    this.uUI.mapUI = gl.getUniformLocation(this.uiProgram, 'u_mapUI');
    this.uUI.opacity = gl.getUniformLocation(this.uiProgram, 'u_opacity');
    gl.uniform1i(this.uUI.mapUI, 0);

    // set texture units for raycast program
    gl.useProgram(this.program);
    gl.uniform1i(ul.u_mapTex, 0);
    gl.uniform1i(ul.u_matMap, 13);
    const texUnits = {u_wallAlbedo:1,u_wallNormal:2,u_wallHeight:3,u_wallRoughMetal:4,u_floorAlbedo:5,u_floorNormal:6,u_floorHeight:7,u_floorRoughMetal:8,u_ceilAlbedo:9,u_ceilNormal:10,u_ceilHeight:11,u_ceilRoughMetal:12};
    Object.entries(texUnits).forEach(([name, unit]) => { if (ul[name]) gl.uniform1i(ul[name], unit); });

    // apply config
    const rc = config.renderer || {};
    this.authentic = rc.authentic !== false;
    this.paletteStyle = rc.paletteStyle || 'doom';
    this.bandLevels = rc.bandLevels || 32;
    this.rebuildPalette();

    const fogCfgInit = config.fog || {}; this.fogEnabled = (fogCfgInit.enabled !== false) ? 1 : 0;
    this.ready = true;
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
  toggleGridDebug() { this.gridDebug ^= 1; return this.gridDebug; }
  toggleLighting() { this.lightingEnabled ^= 1; return this.lightingEnabled; }
  togglePBR() { this.pbrEnabled ^= 1; return this.pbrEnabled; }
  togglePOM() { this.pomEnabled ^= 1; return this.pomEnabled; }
  toggleFog() { this.fogEnabled ^= 1; return this.fogEnabled; }

  uploadMap(dungeon) {
    if (this.mapTex && this.matMapTex) updateMapTexture(this.gl, this.mapTex, this.matMapTex, dungeon);
    else { const t = uploadMapTexture(this.gl, dungeon); this.mapTex = t.mapTex; this.matMapTex = t.matTex; }
  }

  renderMapUI(texData, uiCfg) {
    const gl = this.gl;
    if (!texData || !this.mapUITex) return;
    const isFullscreen = uiCfg.position === 'fullscreen';
    const w = isFullscreen ? 640 : (uiCfg.size || 160);
    const h = isFullscreen ? 360 : (uiCfg.size || 160);
    gl.bindTexture(gl.TEXTURE_2D, this.mapUITex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, texData);
    // store for UI pass after quantize
    this._pendingMapUI = { size: uiCfg.size || 160, opacity: uiCfg.opacity ?? 0.88, position: uiCfg.position || 'fullscreen', texW: w, texH: h };
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

    // compute quad in NDC - fullscreen or corner
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
    // triangle strip: TL, TR, BL, BR with UVs 0,0 1,0 0,1 1,1
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

  render(dungeon, player, timeSec) {
    if (!this.ready) return;
    const gl = this.gl;
    const cfg = player._cfg || {};

    // Pass 1: raycast to scene FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const ul = this.uLoc;
    const pos = player.getPosition();
    gl.uniform2f(ul.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(ul.u_playerPos, pos.x, pos.y);
    gl.uniform1f(ul.u_playerAngle, player.getAngle());
    gl.uniform1f(ul.u_fov, cfg.renderer?.fov ?? 1.0);
    gl.uniform1f(ul.u_playerHeight, cfg.player?.height ?? 0.5);
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

    const lc = cfg.lights || {};
    const ambC = lc.ambientColor || [1, 1, 1];
    gl.uniform3f(ul.u_ambientColor, ambC[0], ambC[1], ambC[2]);
    gl.uniform1f(ul.u_ambientLevel, lc.ambient ?? 0.36);
    if (ul.u_worldAmbientMul) gl.uniform1f(ul.u_worldAmbientMul, lc.worldAmbientMul ?? 0.38);
    const sunDir = lc.sunDir || [-0.55, -0.45, -0.7];
    const sunLen = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
    if (ul.u_sunDir) gl.uniform2f(ul.u_sunDir, sunDir[0] / sunLen, sunDir[1] / sunLen);
    if (ul.u_sunDirZ) gl.uniform1f(ul.u_sunDirZ, sunDir[2] / sunLen);
    if (ul.u_sunIntensity) gl.uniform1f(ul.u_sunIntensity, lc.sunIntensity ?? 1.5);
    const sunC = lc.sunColor || [1, 1, 1];
    if (ul.u_sunColor) gl.uniform3f(ul.u_sunColor, sunC[0], sunC[1], sunC[2]);
    const fogCfg = cfg.fog || {};
    gl.uniform1f(ul.u_fogBase, fogCfg.base ?? 0.06);
    gl.uniform1f(ul.u_fogSquared, fogCfg.squared ?? 0.005);
    const fogC = fogCfg.color || [0.05, 0.05, 0.08];
    gl.uniform3f(ul.u_fogColor, fogC[0], fogC[1], fogC[2]);
    if (ul.u_fogEnabled) gl.uniform1i(ul.u_fogEnabled, this.fogEnabled ? 1 : 0);

    const pom = cfg.renderer?.pom || {};
    const pomOn = this.pomEnabled ? 1 : 0;
    gl.uniform1f(ul.u_pomWall, (pom.wall ?? 0.06) * pomOn);
    gl.uniform1f(ul.u_pomFloor, (pom.floor ?? 0.07) * pomOn);
    gl.uniform1f(ul.u_pomCeil, (pom.ceil ?? 0.035) * pomOn);
    gl.uniform1i(ul.u_pomSteps, 8);
    if (ul.u_gridDebug) gl.uniform1i(ul.u_gridDebug, this.gridDebug ? 1 : 0);
    if (ul.u_lightingEnabled) gl.uniform1i(ul.u_lightingEnabled, this.lightingEnabled ? 1 : 0);
    if (ul.u_pbrEnabled) gl.uniform1i(ul.u_pbrEnabled, this.pbrEnabled ? 1 : 0);
    if (ul.u_pomEnabled) gl.uniform1i(ul.u_pomEnabled, this.pomEnabled ? 1 : 0);
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

    // Pass 3: UI map overlay (after quantize so it stays crisp, or could be before for retro look)
    this._renderUIPass();
  }

  resize(w, h) {
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  isReady() { return this.ready; }
  rebuildMaterials() { /* TODO */ }

  renderMapOnly(dungeon, player) {
    if (!this.ready) return;
    const gl = this.gl;
    // Generate map texture data via UI path — called from game loop after ui.drawMap sets _pendingMapUI
    // Clear to black then draw fullscreen map quad
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // _renderUIPass expects _pendingMapUI to be set by renderMapUI beforehand
    this._renderUIPass();
  }
}
