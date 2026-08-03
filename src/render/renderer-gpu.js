// WebGL2 raycast renderer — Task10 refactor: Material Array + Modifier-ready + 8 lights
// - Materials baked into sampler2DArray (one layer per wall/floor/ceil type) — no atlas bleeding
// - Generator assigns per-cell material IDs via u_mapTex (wall) and u_matMap (floor/ceil)
// - Shader samples correct array layer: texture(u_wallAlbedo, vec3(uv, layer))
// - Modifier plumbing: per-cell modifier map (grid-sized) + tiling noise texture + material-modifiers.json config stub
// - Lighting forward, 8 dynamic lights with live shadows (DDA raymarch + bias), smart nearest selection
// - Sprite PBR billboards same lights/fog
// - Live-edit T1 instant uniforms + T2 material array rebuild + T3 regen banner

import { createProgram, createProgramAsync, createTexture, createTexture2DArray, isTexture2DArraySupported, createUniformBuffer, updateUniformBuffer, bindUniformBlock, bindUniformBufferBase } from './gl-utils.js';
import { vsSource, fsSource, vsQuantize, fsQuantize, vsUI, fsUI, MAX_LIGHTS, vsSpriteSrc, fsSpritePBRSrc } from './shaders.js';
import { uploadMapTexture, updateMapTexture } from './map-upload.js';
import { generateMaterialArrayData, generateMaterialAtlases } from '../world/materials.js';
import { getAsset } from '../config/config.js';
import { genPalette, buildRGBToPal } from './palette.js';
import { LightManager } from '../systems/lights.js';
import { SpriteGpuRenderer } from './sprite-gpu.js';
import '../assets/sprites/registry.js';
import { generateNoiseTextureData } from '../world/noise.js';
import { generateModifierMap } from '../world/modifiers.js';

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
    this.modifierTex = null;
    this.modifierTex2 = null;
    this.noiseTex = null;
    this.modifiersUBO = null;
    this.modifiersBlockBinding = 1;
    this.modifiersBlockIndex = -1;
    this.atlases = {};
    this.materialInfo = null;
    this.useArrayPath = true;
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
    this.modifiersEnabled = 0;
    this._cfgCache = null;
    this.lightManager = null;
    this.spriteRenderer = null;
    this._sprites = [];
    this._lightsCache = [];
    this.maxLights = MAX_LIGHTS || 8;
  }

  async init(dungeon, config) {
    const gl = this.gl;
    // Parallel compile all 3 programs at once – faster than sequential await, uses KHR_parallel_shader_compile
    const glUtils = await import('./gl-utils.js');
    const { createProgramAsync, createProgram } = glUtils;
    const compileAsync = (vs, fs) => {
      try { return createProgramAsync(gl, vs, fs).catch(()=>null); } catch { return Promise.resolve(null); }
    };
    // Start all in parallel
    const [pMain, pQuant, pUI] = await Promise.all([
      compileAsync(vsSource, fsSource),
      compileAsync(vsQuantize, fsQuantize),
      compileAsync(vsUI, fsUI)
    ]);
    this.program = pMain || createProgram(gl, vsSource, fsSource);
    if (!this.program) throw new Error('Shader compile failed raycast');
    this.quantProgram = pQuant || createProgram(gl, vsQuantize, fsQuantize);
    if (!this.quantProgram) throw new Error('Shader compile failed quantize');
    this.uiProgram = pUI || createProgram(gl, vsUI, fsUI);
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

    // Feature detection for array textures
    this.useArrayPath = isTexture2DArraySupported(gl);
    if (!this.useArrayPath) console.warn('[GPURenderer] TEXTURE_2D_ARRAY not supported, falling back to atlas');

    // Load materials (all types, not just first)
    const walls = await getAsset('materials', 'walls');
    const floors = await getAsset('materials', 'floors');
    const ceils = await getAsset('materials', 'ceils');
    const wallMats = (walls?.materials || []).slice(0, 8); // cap to 8 layers for array perf
    const floorMats = (floors?.materials || []).slice(0, 8);
    const ceilMats = (ceils?.materials || []).slice(0, 8);
    // Ensure at least 1
    if (wallMats.length === 0) wallMats.push({ id:1, base:[138,58,44], roughness:0.85, metal:0, variationSeed:101 });
    if (floorMats.length === 0) floorMats.push({ id:1, base:[90,88,80], roughness:0.88, metal:0, variationSeed:201 });
    if (ceilMats.length === 0) ceilMats.push({ id:1, base:[80,78,70], roughness:0.9, metal:0, variationSeed:301 });

    const proc = config.materialsProc || config['materials-proc'] || config.materialProc || {};
    const procWalls = proc.walls || {};
    const procFloors = proc.floors || {};
    const procCeils = proc.ceils || {};
    const renderingCfg = config.rendering || {};
    const legacyRenderer = config.renderer || {};
    const texFilterStr = renderingCfg.textureFilter || legacyRenderer.textureFilter || 'nearest';
    const tf = texFilterStr === 'linear' ? gl.LINEAR : gl.NEAREST;

    if (this.useArrayPath) {
      const arr = generateMaterialArrayData(wallMats, floorMats, ceilMats, {
        walls: procWalls, floors: procFloors, ceils: procCeils, ...proc, texSize: proc.texSize ?? 64
      });
      this.materialInfo = arr;
      const ts = arr.texSize;
      const upArr = (data, w, h, depth) => createTexture2DArray(gl, w, h, depth, data, tf);
      // Walls
      this.atlases.wa = upArr(arr.walls.albedo, ts, ts, arr.wallCount);
      this.atlases.wn = upArr(arr.walls.normal, ts, ts, arr.wallCount);
      this.atlases.wh = upArr(arr.walls.height, ts, ts, arr.wallCount);
      this.atlases.wrma = upArr(arr.walls.roughMetalAO, ts, ts, arr.wallCount);
      // Floors
      this.atlases.fa = upArr(arr.floors.albedo, ts, ts, arr.floorCount);
      this.atlases.fn = upArr(arr.floors.normal, ts, ts, arr.floorCount);
      this.atlases.fh = upArr(arr.floors.height, ts, ts, arr.floorCount);
      this.atlases.frma = upArr(arr.floors.roughMetalAO, ts, ts, arr.floorCount);
      // Ceils
      this.atlases.ca = upArr(arr.ceils.albedo, ts, ts, arr.ceilCount);
      this.atlases.cn = upArr(arr.ceils.normal, ts, ts, arr.ceilCount);
      this.atlases.ch = upArr(arr.ceils.height, ts, ts, arr.ceilCount);
      this.atlases.crma = upArr(arr.ceils.roughMetalAO, ts, ts, arr.ceilCount);
      // Keep legacy atlasInfo shape for shader backward compat uniform handling (not used)
      this.atlasInfo = { texSize: ts, wallAtlasW: ts, floorAtlasW: ts, ceilAtlasW: ts, wallCount: arr.wallCount, floorCount: arr.floorCount, ceilCount: arr.ceilCount, arrayData: arr };
    } else {
      // Fallback old atlas path (legacy)
      const atl = generateMaterialAtlases(wallMats.slice(0,1), floorMats.slice(0,1), ceilMats.slice(0,1), {
        walls: procWalls, floors: procFloors, ceils: procCeils, ...proc
      });
      this.materialInfo = atl;
      this.atlasInfo = atl;
      const up = (arr, w, h) => createTexture(gl, w, h, arr, tf);
      const tw = atl.wallAtlasW, th = 64, fw = atl.floorAtlasW, cw = atl.ceilAtlasW;
      this.atlases.wa = up(atl.wallAlbedo, tw, th); this.atlases.wn = up(atl.wallNormal, tw, th);
      this.atlases.wh = up(atl.wallHeight, tw, th); this.atlases.wrma = up(atl.wallRoughMetalAO, tw, th);
      this.atlases.fa = up(atl.floorAlbedo, fw, th); this.atlases.fn = up(atl.floorNormal, fw, th);
      this.atlases.fh = up(atl.floorHeight, fw, th); this.atlases.frma = up(atl.floorRoughMetalAO, fw, th);
      this.atlases.ca = up(atl.ceilAlbedo, cw, th); this.atlases.cn = up(atl.ceilNormal, cw, th);
      this.atlases.ch = up(atl.ceilHeight, cw, th); this.atlases.crma = up(atl.ceilRoughMetalAO, cw, th);
    }

    // Map textures
    const mapTexs = uploadMapTexture(gl, dungeon);
    this.mapTex = mapTexs.mapTex;
    this.matMapTex = mapTexs.matTex;

    // Noise texture (tiling, baked once for organic modifier masks)
    try {
      const noiseCfg = config.materialModifiers?.noise || config['material-modifiers']?.noise || {};
      const nSize = noiseCfg.size ?? 128;
      const nSeed = noiseCfg.seed ?? (dungeon.seed || 1337);
      const noiseData = generateNoiseTextureData(nSize, nSeed);
      // create as regular 2D with REPEAT
      this.noiseTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, noiseData.size, noiseData.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    } catch (e) { console.warn('[Renderer] noise tex failed', e); this.noiseTex = null; }

    // Modifier maps v2 – 2 textures lossless (moss/water/puddle/dust + damaged/blood)
    try {
      const modMap = generateModifierMap(dungeon, config);
      this.modifierTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.modifierTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, modMap.w, modMap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, modMap.data);
      this.modifierTex2 = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.modifierTex2);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const data2 = modMap.data2 || modMap.data; // fallback for old maps
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, modMap.w, modMap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data2);
      this._modifierMapInfo = modMap;
    } catch (e) { console.warn('[Renderer] modifier tex failed', e); this.modifierTex = null; this.modifierTex2 = null; }

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

    // cache uniforms for raycast — extended with MAX_LIGHTS arrays + new material/modifier uniforms
    const ul = this.uLoc, p = this.program;
    const names = [
      'u_resolution','u_playerPos','u_playerAngle','u_fov','u_playerHeight','u_mapTex','u_matMap','u_mapSize',
      'u_wallAlbedo','u_wallNormal','u_wallHeight','u_wallRoughMetal',
      'u_floorAlbedo','u_floorNormal','u_floorHeight','u_floorRoughMetal',
      'u_ceilAlbedo','u_ceilNormal','u_ceilHeight','u_ceilRoughMetal',
      // legacy atlas uniforms removed in v10 (array pipeline)
      'u_ambientColor','u_ambientLevel','u_worldAmbientMul',
      'u_sunDir','u_sunDirZ','u_sunIntensity','u_sunColor',
      'u_fogBase','u_fogSquared','u_fogColor','u_fogEnabled',
      'u_pomWall','u_pomFloor','u_pomCeil','u_pomSteps','u_pomMaxOffset','u_pomMinVz','u_pomMinEffVz','u_pomFadeStart','u_pomFadeEnd',
      'u_authentic','u_bandLevels','u_time',
      'u_gridDebug','u_lightingEnabled','u_pbrEnabled','u_pomEnabled','u_pbrDebugMode',
      'u_aoSun','u_aoPoint','u_aoAmbient',
      'u_chamferEnabled','u_chamferFloorSize','u_chamferCeilSize','u_chamferWallSize','u_chamferCornerRadius','u_chamferDarken','u_chamferRoundCorners','u_chamferBlendFloor','u_chamferBlendWall','u_chamferRough','u_chamferFloor','u_chamferCeil','u_chamferWall',
      'u_chamferTrimFloor','u_chamferTrimCeil','u_chamferTrimWall','u_chamferTrimFloorAlt','u_chamferTrimCeilAlt','u_chamferCreviceEnd','u_chamferCreviceSmoothEnd','u_chamferTrimStart','u_chamferTrimMid','u_chamferTrimEnd',
      'u_chamferGridEnabled','u_chamferGridFloorSize','u_chamferGridCeilSize','u_chamferGridFloorDarken','u_chamferGridCeilDarken','u_chamferGridFloorTrim','u_chamferGridCeilTrim','u_chamferGridFloorRough','u_chamferGridCeilRough','u_chamferGridFloorBlend','u_chamferGridCeilBlend','u_chamferGridCreviceEnd','u_chamferGridCreviceSmoothEnd','u_chamferGridTrimStart','u_chamferGridTrimMid','u_chamferGridTrimEnd',
      'u_cornerEnabled','u_cornerRadius','u_cornerMode','u_cornerInner',
      'u_cornerBandNear','u_cornerBandFarExtra','u_cornerBandFarFactor','u_cornerSectorThresh','u_cornerNormalMix','u_cornerAlbedoBoost','u_cornerRoughMul','u_cornerAoMul',
      'u_shadowBiasN','u_shadowBiasDir','u_shadowSunFactor','u_shadowPointFactor','u_shadowSunMax','u_shadowPointEps','u_shadowNormalThresh',
      'u_pbrEmissiveAlbedoMul','u_pbrEmissiveStrength','u_pbrF0','u_pbrAttenQuad','u_pbrGGXEps',
      'u_renderFloorMul','u_renderCeilMul','u_renderWallDarken','u_renderEyeFactor',
      'u_bobPixels',
      'u_numLights',
      // array path counts
      'u_wallCount','u_floorCount','u_ceilCount',
      // modifiers v11.3 PROPER: 2 textures (14&15) + Full UBO 192 bytes (no individual uniforms)
      'u_modifierMap','u_modifierMap2','u_modifiersEnabled',
    ];
    names.forEach(n => ul[n] = gl.getUniformLocation(p, n));

    ul.u_lightPos = []; ul.u_lightColor = []; ul.u_lightIntensity = []; ul.u_lightRadius = [];
    ul.u_lightType = []; ul.u_lightDir = []; ul.u_lightConeInner = []; ul.u_lightConeOuter = [];
    ul.u_lightPulseSpeed = []; ul.u_lightPulseAmt = []; ul.u_lightNoShadow = [];
    ul.u_lightFlickerSpeed = []; ul.u_lightFlickerAmount = []; ul.u_lightPhase = [];
    for (let i = 0; i < this.maxLights; i++) {
      ul.u_lightPos.push(gl.getUniformLocation(p, `u_lightPos[${i}]`));
      ul.u_lightColor.push(gl.getUniformLocation(p, `u_lightColor[${i}]`));
      ul.u_lightIntensity.push(gl.getUniformLocation(p, `u_lightIntensity[${i}]`));
      ul.u_lightRadius.push(gl.getUniformLocation(p, `u_lightRadius[${i}]`));
      ul.u_lightType.push(gl.getUniformLocation(p, `u_lightType[${i}]`));
      ul.u_lightDir.push(gl.getUniformLocation(p, `u_lightDir[${i}]`));
      ul.u_lightConeInner.push(gl.getUniformLocation(p, `u_lightConeInner[${i}]`));
      ul.u_lightConeOuter.push(gl.getUniformLocation(p, `u_lightConeOuter[${i}]`));
      ul.u_lightPulseSpeed.push(gl.getUniformLocation(p, `u_lightPulseSpeed[${i}]`));
      ul.u_lightPulseAmt.push(gl.getUniformLocation(p, `u_lightPulseAmt[${i}]`));
      ul.u_lightNoShadow.push(gl.getUniformLocation(p, `u_lightNoShadow[${i}]`));
      ul.u_lightFlickerSpeed.push(gl.getUniformLocation(p, `u_lightFlickerSpeed[${i}]`));
      ul.u_lightFlickerAmount.push(gl.getUniformLocation(p, `u_lightFlickerAmount[${i}]`));
      ul.u_lightPhase.push(gl.getUniformLocation(p, `u_lightPhase[${i}]`));
    }

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
    if (ul.u_matMap) gl.uniform1i(ul.u_matMap, 13);
    const arrayUnits = {
      u_wallAlbedo:1,u_wallNormal:2,u_wallHeight:3,u_wallRoughMetal:4,
      u_floorAlbedo:5,u_floorNormal:6,u_floorHeight:7,u_floorRoughMetal:8,
      u_ceilAlbedo:9,u_ceilNormal:10,u_ceilHeight:11,u_ceilRoughMetal:12,
      u_modifierMap:14, u_modifierMap2:15 // noiseTex optional legacy, procedural now frees unit
    };
    // u_noiseTex kept at 13? Actually matMap is 13, so 14-15 for modifiers = 16 units total (0-15)
    Object.entries(arrayUnits).forEach(([name, unit]) => { if (ul[name]) gl.uniform1i(ul[name], unit); });

    // Full UBO for modifiers – binding point 1 (192 bytes = 12 vec4)
    try {
      this.modifiersBlockBinding = 1;
      const blockIdx = gl.getUniformBlockIndex(this.program, 'ModifiersBlock');
      if (blockIdx !== gl.INVALID_INDEX && blockIdx !== -1) {
        bindUniformBlock(gl, this.program, 'ModifiersBlock', this.modifiersBlockBinding);
        this.modifiersBlockIndex = blockIdx;
        this.modifiersUBO = createUniformBuffer(gl, 192, gl.DYNAMIC_DRAW);
        bindUniformBufferBase(gl, this.modifiersBlockBinding, this.modifiersUBO);
      } else {
        // Fast path: shader uses individual uniforms (v11.2 instant ANGLE compile) – UBO not present, not an error
        this.modifiersBlockIndex = -1;
        this.modifiersUBO = null;
        console.log('[GPURenderer] ModifiersBlock not present – using fast individual uniforms path (instant compile)');
      }
      const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      if (maxUnits < 16) {
        console.warn('[GPURenderer] MAX_TEXTURE_IMAGE_UNITS=' + maxUnits + ' <16, material arrays may fallback; need >=16 (WebGL2 minimum, usually 32).');
      }
      // v11 uses 16 units total: 0 map, 1-12 arrays, 13 matMap, 14 mod1, 15 mod2 (noise procedural, no unit) – fits 16
    } catch (e) {
      console.warn('[GPURenderer] UBO setup failed', e);
    }

    // Lighting & sprites init
    try {
      this.lightManager = new LightManager(config.lighting || config.sprites || {});
      this.lightManager.setFromMap(dungeon);
      this._sprites = dungeon.sprites || dungeon.items || [];
    } catch (e) {
      console.warn('[GPURenderer] LightManager init failed', e);
      this.lightManager = new LightManager({});
      this.lightManager.setFromMap(dungeon);
      this._sprites = dungeon.sprites || [];
    }

    try {
      this.spriteRenderer = new SpriteGpuRenderer(gl);
      this.spriteRenderer.init({ vsSpriteSrc, fsSpritePBRSrc, MAX_LIGHTS: this.maxLights });
      const ids = [...new Set(this._sprites.map(s => s.spriteId || s.type || 'torch_wall'))].filter(Boolean);
      await this.spriteRenderer.ensureSprites(gl, ids);
    } catch (e) {
      console.warn('[GPURenderer] SpriteRenderer init failed, sprites will be invisible', e);
    }

    this._resolveToggles(config);
    this.ready = true;
  }

  _applyPaletteFromConfig(cfg){
    const paletteCfg = cfg.palette || {};
    const rendering = cfg.rendering || {};
    const legacy = cfg.renderer || {};
    this.authentic = (paletteCfg.authentic ?? rendering.authentic ?? legacy.authentic ?? true) !== false;
    this.paletteStyle = paletteCfg.paletteStyle || rendering.paletteStyle || legacy.paletteStyle || 'doom';
    this.bandLevels = paletteCfg.bandLevels ?? rendering.bandLevels ?? legacy.bandLevels ?? 32;
  }

  _isWallCell(dungeon, x, y) {
    if (x < 0 || y < 0 || x >= dungeon.w || y >= dungeon.h) return false;
    return dungeon.grid[y * dungeon.w + x] !== 0;
  }
  _rayCircleHit(ox, oy, dx, dy, cx, cy, r) {
    const ocx = ox - cx, ocy = oy - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (ocx * dx + ocy * dy);
    const c = ocx * ocx + ocy * ocy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sd = Math.sqrt(disc);
    const t0 = (-b - sd) / (2 * a);
    const t1 = (-b + sd) / (2 * a);
    return [t0, t1];
  }

  _computeDepthBuffer(dungeon, posX, posY, angle) {
    const w = this.canvas.width || 640;
    this._depthBuffer = this._depthBuffer && this._depthBuffer.length === w ? this._depthBuffer : new Float32Array(w);
    const depth = this._depthBuffer;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const planeLen = Math.tan((this._fovCache || 1.0) * 0.5);
    const planeX = -dirY * planeLen;
    const planeY = dirX * planeLen;
    const mapW = dungeon.w, mapH = dungeon.h;
    for (let x = 0; x < w; x++) {
      const cameraX = 2 * x / w - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;
      let mapX = Math.floor(posX);
      let mapY = Math.floor(posY);
      const deltaDistX = Math.abs(1 / rayDirX) || 1e30;
      const deltaDistY = Math.abs(1 / rayDirY) || 1e30;
      let stepX, stepY;
      let sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (posX - mapX) * deltaDistX; } else { stepX = 1; sideDistX = (mapX + 1 - posX) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (posY - mapY) * deltaDistY; } else { stepY = 1; sideDistY = (mapY + 1 - posY) * deltaDistY; }
      let hit = 0, perp = 0;
      for (let iter = 0; iter < 96; iter++) {
        if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; } else { sideDistY += deltaDistY; mapY += stepY; }
        if (mapX < 0 || mapY < 0 || mapX >= mapW || mapY >= mapH) { perp = 20; hit = 1; break; }
        if (dungeon.grid[mapY * mapW + mapX] === 0) continue;
        const flatPerp = sideDistX < sideDistY ? sideDistX - deltaDistX : sideDistY - deltaDistY;
        perp = flatPerp;
        hit = 1;
        break;
      }
      if (hit === 0) perp = 20;
      if (perp < 0.0001) perp = 0.0001;
      depth[x] = perp;
    }
    return depth;
  }

  _isOccluded(dungeon, x0, y0, x1, y1) {
    const w = dungeon.w, h = dungeon.h;
    const grid = dungeon.grid;
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return false;
    const dirX = dx / dist, dirY = dy / dist;
    let mapX = Math.floor(x0), mapY = Math.floor(y0);
    const targetMapX = Math.floor(x1), targetMapY = Math.floor(y1);
    const deltaDistX = Math.abs(1 / dirX) || 1e30;
    const deltaDistY = Math.abs(1 / dirY) || 1e30;
    let stepX, stepY, sideDistX, sideDistY;
    if (dirX < 0) { stepX = -1; sideDistX = (x0 - mapX) * deltaDistX; } else { stepX = 1; sideDistX = (mapX + 1 - x0) * deltaDistX; }
    if (dirY < 0) { stepY = -1; sideDistY = (y0 - mapY) * deltaDistY; } else { stepY = 1; sideDistY = (mapY + 1 - y0) * deltaDistY; }
    for (let i = 0; i < 96; i++) {
      if (mapX === targetMapX && mapY === targetMapY) break;
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; } else { sideDistY += deltaDistY; mapY += stepY; }
      if (mapX < 0 || mapY < 0 || mapX >= w || mapY >= h) return true;
      if (mapX === targetMapX && mapY === targetMapY) break;
      if (grid[mapY * w + mapX] === 0) continue;
      const wx = mapX + 0.5, wy = mapY + 0.5;
      if (Math.hypot(wx - x1, wy - y1) < 0.85) {
        const swx = wx - x1, swy = wy - y1;
        const scx = x0 - x1, scy = y0 - y1;
        const dot = swx * scx + swy * scy;
        if (dot < 0) continue;
      }
      return true;
    }
    return false;
  }

  _isSpriteOccluded(dungeon, camX, camY, sprite, depthBuffer, renderAngle) {
    const dirX = Math.cos(renderAngle), dirY = Math.sin(renderAngle);
    const planeLen = Math.tan((this._fovCache || 1.0) * 0.5);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const dx = sprite.x - camX, dy = sprite.y - camY;
    const invDet = 1.0 / (planeX * dirY - dirX * planeY);
    const tx = invDet * (dirY * dx - dirX * dy);
    const ty = invDet * (-planeY * dx + planeX * dy);
    if (ty <= 0.12) return true;
    const w = this.canvas.width || 640;
    const screenX = w * 0.5 * (1 + tx / ty);
    const mid = (screenX | 0);
    if (mid >= 0 && mid < depthBuffer.length) {
      if (ty > depthBuffer[mid] - 0.55) {
        if (this._isOccluded(dungeon, camX, camY, sprite.x, sprite.y)) return true;
      }
    }
    if (this._isOccluded(dungeon, camX, camY, sprite.x, sprite.y)) return true;
    return false;
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
    const modCfg = cfg.materialModifiers || cfg['material-modifiers'] || {};
    this.modifiersEnabled = (modCfg.enabled === true) ? 1 : 0;
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
  setGridDebug(v) { this.gridDebug = v ? 1 : 0; }
  setLightingEnabled(v) { this.lightingEnabled = v ? 1 : 0; }
  setPBREnabled(v) { this.pbrEnabled = v ? 1 : 0; }
  setPOMEnabled(v) { this.pomEnabled = v ? 1 : 0; }
  setFogEnabled(v) { this.fogEnabled = v ? 1 : 0; }
  setChamferEnabled(v) { this.chamferEnabled = v ? 1 : 0; }
  setCornerEnabled(v) { this.cornerEnabled = v ? 1 : 0; }
  setPBRDebugMode(v) { this.pbrDebugMode = Math.max(0, Math.min(17, v | 0)); }
  setModifiersEnabled(v){ this.modifiersEnabled = v?1:0; }

  toggleGridDebug() { this.gridDebug ^= 1; return this.gridDebug; }
  toggleLighting() { this.lightingEnabled ^= 1; return this.lightingEnabled; }
  togglePBR() { this.pbrEnabled ^= 1; return this.pbrEnabled; }
  togglePOM() { this.pomEnabled ^= 1; return this.pomEnabled; }
  toggleFog() { this.fogEnabled ^= 1; return this.fogEnabled; }
  toggleChamfer() { this.chamferEnabled ^= 1; return this.chamferEnabled; }
  toggleCorner() { this.cornerEnabled ^= 1; return this.cornerEnabled; }
  toggleModifiers() { 
    this.modifiersEnabled ^= 1; 
    // Regen maps when turning ON if they were all-zero from disabled init
    try {
      if (this.modifiersEnabled && this._lastDungeon && this.modifierTex) {
        const cfg = this._cfgCache || {};
        // force enabled true for generation
        const genCfg = { ...cfg, materialModifiers: { ...(cfg.materialModifiers||{}), enabled:true } };
        const mm = generateModifierMap(this._lastDungeon, genCfg);
        const gl = this.gl;
        if (mm && mm.data) {
          gl.bindTexture(gl.TEXTURE_2D, this.modifierTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mm.w, mm.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, mm.data);
          if (this.modifierTex2 && mm.data2) {
            gl.bindTexture(gl.TEXTURE_2D, this.modifierTex2);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mm.w, mm.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, mm.data2);
          }
          this._modifierMapInfo = mm;
          this._lastDungeon.modifierMap = mm;
        }
      }
    } catch (e) { console.warn('[toggleModifiers] regen failed', e); }
    return this.modifiersEnabled; 
  }
  cyclePBRDebug() { this.pbrDebugMode = (this.pbrDebugMode + 1) % 18; return this.pbrDebugMode; }

  updateConfig(partial) {
    if (!partial) return;
    if (!this._cfgCache) this._cfgCache = {};
    Object.assign(this._cfgCache, partial);
    if (partial.fog || partial.chamfer || partial.corners || partial.pom || partial.palette || partial.materialModifiers) {
      try { this._resolveToggles(this._cfgCache); } catch {}
    }
    if (partial.palette) { try { this._applyPaletteFromConfig(this._cfgCache); this.rebuildPalette(); } catch {} }
  }
  updateFog(fogCfg) { if (!fogCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.fog = fogCfg; this.fogEnabled = (fogCfg.enabled !== false) ? 1 : 0; }
  updateChamfer(chamferCfg) { if (!chamferCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.chamfer = chamferCfg; const enabled = chamferCfg.enabled ?? true; this.chamferEnabled = (enabled !== false) ? 1 : 0; }
  updateCorners(cornersCfg) { if (!cornersCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.corners = cornersCfg; const enabled = cornersCfg.enabled ?? true; this.cornerEnabled = (enabled !== false) ? 1 : 0; }
  updateShadows(shCfg) { if (!shCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.shadows = shCfg; }
  updatePBR(pbrCfg) { if (!pbrCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.pbr = pbrCfg; }
  updateAO(aoCfg) { if (!aoCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.ao = aoCfg; }
  updateRaymarch(rmCfg) { if (!rmCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.raymarch = rmCfg; }
  updateRendering(rCfg) { if (!rCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.rendering = rCfg; }
  updatePOM(pomCfg) { if (!pomCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.pom = pomCfg; }
  updateLighting(lightingCfg) {
    if (!lightingCfg) return; if (!this._cfgCache) this._cfgCache = {}; this._cfgCache.lighting = lightingCfg;
    if (this.lightManager && typeof this.lightManager.setConfig === 'function') { try { this.lightManager.setConfig(lightingCfg); } catch {} }
  }
  updateMaterialModifiers(mmCfg){
    if(!mmCfg) return; if(!this._cfgCache) this._cfgCache={}; this._cfgCache.materialModifiers = mmCfg; this._cfgCache['material-modifiers']=mmCfg;
    this.modifiersEnabled = (mmCfg.enabled===true)?1:0;
    // Regen maps if we have dungeon and we are turning ON or params changed
    try {
      if (this._lastDungeon && this.modifierTex) {
        const genCfg = { ...this._cfgCache, materialModifiers: { ...mmCfg, enabled: mmCfg.enabled===true } };
        const mm = generateModifierMap(this._lastDungeon, genCfg);
        const gl = this.gl;
        if (mm && mm.data) {
          gl.bindTexture(gl.TEXTURE_2D, this.modifierTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mm.w, mm.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, mm.data);
          if (this.modifierTex2 && mm.data2) {
            gl.bindTexture(gl.TEXTURE_2D, this.modifierTex2);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mm.w, mm.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, mm.data2);
          }
          this._modifierMapInfo = mm;
          this._lastDungeon.modifierMap = mm;
        }
      }
    } catch (e) { console.warn('[updateMaterialModifiers] regen failed', e); }
  }

  reuploadAtlases(atl) {
    if (!atl) return;
    const gl = this.gl;
    if (!gl) return;
    try {
      const renderingCfg = this._cfgCache?.rendering || {};
      const legacyRenderer = this._cfgCache?.renderer || {};
      const texFilterStr = renderingCfg.textureFilter || legacyRenderer.textureFilter || 'nearest';
      const tf = texFilterStr === 'linear' ? gl.LINEAR : gl.NEAREST;
      const arr = atl.arrayData || atl;
      const old = this.atlases;
      const toDelete = [old.wa, old.wn, old.wh, old.wrma, old.fa, old.fn, old.fh, old.frma, old.ca, old.cn, old.ch, old.crma].filter(Boolean);
      try { toDelete.forEach(t => { try { gl.deleteTexture(t); } catch {} }); } catch {}

      if (arr.walls && arr.walls.albedo && arr.wallCount) {
        // Preferred array path – uses existing createTexture2DArray helper (clean, no duplication)
        const ts = arr.texSize || 64;
        this.atlases.wa = createTexture2DArray(gl, ts, ts, arr.wallCount, arr.walls.albedo, tf);
        this.atlases.wn = createTexture2DArray(gl, ts, ts, arr.wallCount, arr.walls.normal, tf);
        this.atlases.wh = createTexture2DArray(gl, ts, ts, arr.wallCount, arr.walls.height, tf);
        this.atlases.wrma = createTexture2DArray(gl, ts, ts, arr.wallCount, arr.walls.roughMetalAO, tf);
        this.atlases.fa = createTexture2DArray(gl, ts, ts, arr.floorCount, arr.floors.albedo, tf);
        this.atlases.fn = createTexture2DArray(gl, ts, ts, arr.floorCount, arr.floors.normal, tf);
        this.atlases.fh = createTexture2DArray(gl, ts, ts, arr.floorCount, arr.floors.height, tf);
        this.atlases.frma = createTexture2DArray(gl, ts, ts, arr.floorCount, arr.floors.roughMetalAO, tf);
        this.atlases.ca = createTexture2DArray(gl, ts, ts, arr.ceilCount, arr.ceils.albedo, tf);
        this.atlases.cn = createTexture2DArray(gl, ts, ts, arr.ceilCount, arr.ceils.normal, tf);
        this.atlases.ch = createTexture2DArray(gl, ts, ts, arr.ceilCount, arr.ceils.height, tf);
        this.atlases.crma = createTexture2DArray(gl, ts, ts, arr.ceilCount, arr.ceils.roughMetalAO, tf);
        this.materialInfo = arr;
        this.atlasInfo = { texSize: ts, wallAtlasW: ts, floorAtlasW: ts, ceilAtlasW: ts, wallCount: arr.wallCount, floorCount: arr.floorCount, ceilCount: arr.ceilCount, arrayData: arr };
      } else {
        // Legacy horizontal atlas – kept only for unit tests / old save compat, not used in game (WebGL2 guarantees ARRAY)
        const upLegacy = (arrData, w, h) => {
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, tf);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, tf);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (arrData.length === w * h * 4) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, arrData);
          else if (arrData.length === w * h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, arrData);
          else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, arrData);
          return tex;
        };
        const tw = atl.wallAtlasW, fw = atl.floorAtlasW, cw = atl.ceilAtlasW;
        const th = 64;
        this.atlases.wa = upLegacy(atl.wallAlbedo, tw, th); this.atlases.wn = upLegacy(atl.wallNormal, tw, th); this.atlases.wh = upLegacy(atl.wallHeight, tw, th); this.atlases.wrma = upLegacy(atl.wallRoughMetalAO, tw, th);
        this.atlases.fa = upLegacy(atl.floorAlbedo, fw, th); this.atlases.fn = upLegacy(atl.floorNormal, fw, th); this.atlases.fh = upLegacy(atl.floorHeight, fw, th); this.atlases.frma = upLegacy(atl.floorRoughMetalAO, fw, th);
        this.atlases.ca = upLegacy(atl.ceilAlbedo, cw, th); this.atlases.cn = upLegacy(atl.ceilNormal, cw, th); this.atlases.ch = upLegacy(atl.ceilHeight, cw, th); this.atlases.crma = upLegacy(atl.ceilRoughMetalAO, cw, th);
        this.atlasInfo = atl;
      }
    } catch (e) { console.warn('[Renderer] reuploadAtlases failed', e); }
  }

  uploadMap(dungeon) {
    if (this.mapTex && this.matMapTex) updateMapTexture(this.gl, this.mapTex, this.matMapTex, dungeon);
    else { const t = uploadMapTexture(this.gl, dungeon); this.mapTex = t.mapTex; this.matMapTex = t.matTex; }
    try {
      if (this.lightManager) this.lightManager.setFromMap(dungeon);
      this._sprites = dungeon.sprites || dungeon.items || [];
      if (this.spriteRenderer) {
        const gl = this.gl;
        const ids = [...new Set(this._sprites.map(s => s.spriteId || s.type || 'torch_wall'))].filter(Boolean);
        this.spriteRenderer.ensureSprites(gl, ids).catch(()=>{});
      }
      this._lastDungeon = dungeon;
      // Upload modifier maps v2 – always regen with current cfg (fixes invisible when toggled ON after init with all-zero map)
      if (this.modifierTex) {
        const gl = this.gl;
        let modMap = null;
        try { modMap = generateModifierMap(dungeon, this._cfgCache || {}); } catch {}
        // fallback to pre-baked if generator failed
        if (!modMap) modMap = dungeon.modifierMap;
        if (modMap && modMap.data) {
          gl.bindTexture(gl.TEXTURE_2D, this.modifierTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, modMap.w, modMap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, modMap.data);
          if (this.modifierTex2 && modMap.data2) {
            gl.bindTexture(gl.TEXTURE_2D, this.modifierTex2);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, modMap.w, modMap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, modMap.data2);
          }
          this._modifierMapInfo = modMap;
          dungeon.modifierMap = modMap; // keep in sync for next regen
        }
      }
    } catch (e) { console.warn('[uploadMap] sprite/light/modifier update failed', e); }
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

    const rawPos = player.getPosition();
    let camX = rawPos.x;
    let camY = rawPos.y;
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
    const renderH = this.canvas.height || 360;
    const bobPixels = bobOffsetY * renderH * 0.8;
    if (ul.u_bobPixels) gl.uniform1f(ul.u_bobPixels, bobPixels);

    const rendering = cfg.rendering || {};
    const fov = this._resolveConfigValue(cfg, ['rendering.fov','renderer.fov'], 1.0);
    const baseHeight = this._resolveConfigValue(cfg, ['player.height','rendering.eye.height','renderer.eyeHeight'], 0.5);
    const eyeFactor = this._resolveConfigValue(cfg, ['rendering.eye.playerHeightFactor','rendering.eyeFactor','debug.overlay.eyeFactor'], 0.15);
    gl.uniform1f(ul.u_fov, fov);
    gl.uniform1f(ul.u_playerHeight, baseHeight);
    if(ul.u_renderEyeFactor) gl.uniform1f(ul.u_renderEyeFactor, eyeFactor);

    gl.uniform2f(ul.u_mapSize, dungeon.w, dungeon.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
    gl.uniform1i(ul.u_mapTex, 0);
    gl.activeTexture(gl.TEXTURE0 + 13); gl.bindTexture(gl.TEXTURE_2D, this.matMapTex);
    if (ul.u_matMap) gl.uniform1i(ul.u_matMap, 13);

    const a = this.atlases;
    const bindArray = (tex, unit, locName) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      if (this.useArrayPath) gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      else gl.bindTexture(gl.TEXTURE_2D, tex);
      if (ul[locName]) gl.uniform1i(ul[locName], unit);
    };
    bindArray(a.wa, 1, 'u_wallAlbedo'); bindArray(a.wn, 2, 'u_wallNormal'); bindArray(a.wh, 3, 'u_wallHeight'); bindArray(a.wrma, 4, 'u_wallRoughMetal');
    bindArray(a.fa, 5, 'u_floorAlbedo'); bindArray(a.fn, 6, 'u_floorNormal'); bindArray(a.fh, 7, 'u_floorHeight'); bindArray(a.frma, 8, 'u_floorRoughMetal');
    bindArray(a.ca, 9, 'u_ceilAlbedo'); bindArray(a.cn, 10, 'u_ceilNormal'); bindArray(a.ch, 11, 'u_ceilHeight'); bindArray(a.crma, 12, 'u_ceilRoughMetal');

    // Modifiers v11: 2 textures lossless (14 & 15) + UBO 192 bytes; noise procedural (frees unit)
    if (this.modifierTex) { gl.activeTexture(gl.TEXTURE0+14); gl.bindTexture(gl.TEXTURE_2D, this.modifierTex); if (ul.u_modifierMap) gl.uniform1i(ul.u_modifierMap, 14); }
    if (this.modifierTex2) { gl.activeTexture(gl.TEXTURE0+15); gl.bindTexture(gl.TEXTURE_2D, this.modifierTex2); if (ul.u_modifierMap2) gl.uniform1i(ul.u_modifierMap2, 15); }
    // Legacy noiseTex kept but not required (procedural procNoise frees unit)
    if (this.noiseTex && ul.u_noiseTex) { /* optional legacy – not bound to conserve units */ }
    if (ul.u_modifiersEnabled) gl.uniform1i(ul.u_modifiersEnabled, this.modifiersEnabled?1:0);

    // Modifiers params v14: FULL UBO 12 vec4 = 48 floats, all puddle fields tweakable, other mods guaranteed zero
    // Layout:
    // 0 mossAlbedoRough (unused, zeroed)
    // 1 mossParams = puddle grout thresholds: x=heightGroutLow y=heightGroutHigh z=aoGroutLow w=aoGroutHigh
    // 2 waterAlbedoRough (unused zero)
    // 3 waterParams = x=worldLowHigh y=worldLowLow z=maskBoost w=darkBaseFactor
    // 4 puddleAlbedoRough = xyz albedo w roughTarget
    // 5 puddleParams = x=colorStrength y=scaleLarge z=threshold w=feather
    // 6 bloodAlbedoMix (unused zero, but w reused for aoMix fallback)
    // 7 bloodParams = x=rippleScale y=edgeFoam z=heightInfluence w=aoMix
    // 8 dustAlbedoRough (unused)
    // 9 dustParams = x=tintMix y=grooveMin z=edgeLow w=edgeHigh
    // 10 damagedAlbedoRough (unused)
    // 11 damagedParams = x=roughLow y=roughHigh z=flatStrength w=metalMix
    try {
      const mm = cfg.materialModifiers || cfg['material-modifiers'] || this._cfgCache?.materialModifiers || {};
      const mods = mm.modifiers || {};
      const puddle = mods.puddle || {};
      // Guarantee: other mods forced zero / disabled regardless of texture data
      const moss = { albedo:[0,0,0], roughAdd:0, colorStrength:0, noiseScale:0, threshold:0, aoWeight:0 };
      const water = { albedo:[0,0,0], roughAdd:0, colorStrength:0, noiseScale:0, threshold:0, aoWeight:0 };
      const blood = { albedo:[0,0,0], colorStrength:0 };
      const dust = { albedo:[0,0,0], roughAdd:0, colorStrength:0, noiseScale:0, threshold:0, aoWeight:0 };
      const damaged = { albedo:[0,0,0], roughAdd:0, colorStrength:0, noiseScale:0, threshold:0 };
      if (this.modifiersUBO && this.modifiersBlockIndex !== -1) {
        const buf = new Float32Array(48);
        function normalizeAlbedo(arr, fallback) {
          const a = arr || fallback;
          // if values look like 0-255 (>1.0), convert to 0-1 to avoid saturation
          if (a[0] > 1.0 || a[1] > 1.0 || a[2] > 1.0) {
            return [a[0]/255.0, a[1]/255.0, a[2]/255.0];
          }
          return [a[0], a[1], a[2]];
        }
        function setVec4(off, xyz, w) { buf[off]=xyz[0]; buf[off+1]=xyz[1]; buf[off+2]=xyz[2]; buf[off+3]=w; }
        function setVec4Full(off, x,y,z,w){ buf[off]=x; buf[off+1]=y; buf[off+2]=z; buf[off+3]=w; }
        // 0 repurposed: x=floorDepress y=masterSeed (derived from dungeon.seed, master = generator.json)
        // master seed = gameplay/generator.json seed, deterministic refresh, one seed drives all
        setVec4Full(0, puddle.floorDepress ?? -0.08, dungeon.seed ?? 1337, 0.0, 0.0);
        // 1 grout thresholds
        setVec4Full(4, puddle.heightGroutLow ?? 0.12, puddle.heightGroutHigh ?? 0.48, puddle.aoGroutLow ?? 0.72, puddle.aoGroutHigh ?? 0.95);
        // 2 water zeroed
        setVec4(8, [0,0,0], 0);
        // 3 world low + boost + darkBase
        setVec4Full(12, puddle.worldLowHigh ?? 0.25, puddle.worldLowLow ?? -0.35, puddle.maskBoost ?? 1.4, puddle.darkBaseFactor ?? 0.35);
        // 4 puddle albedo + roughTarget - normalized 0-255->0-1 to prevent saturation
        setVec4(16, normalizeAlbedo(puddle.albedo, [0.10,0.14,0.19]), puddle.roughTarget ?? 0.04);
        // 5 puddle main: colorStrength, scaleLarge, threshold, feather
        setVec4Full(20, puddle.colorStrength ?? 0.92, puddle.noiseScaleLarge ?? 0.22, puddle.threshold ?? 0.55, puddle.feather ?? 0.12);
        // 6 repurposed: puddle cell feather (was blood albedo zeroed, blood disabled via texture channel 0)
        // x=cellFeatherLow y=cellFeatherHigh z=cellEpsilon w=unused - tweakable, avoids hard tile cut
        setVec4Full(24, puddle.cellFeatherLow ?? 0.0, puddle.cellFeatherHigh ?? 0.28, puddle.cellEpsilon ?? 0.0005, 0.0);
        // 7 ripple, edgeFoam, heightInfluence, aoMix
        setVec4Full(28, puddle.rippleScale ?? 3.0, puddle.edgeFoam ?? 0.25, puddle.heightInfluence ?? 0.85, puddle.aoMix ?? 0.20);
        // 8 dust zeroed
        setVec4(32, [0,0,0], 0);
        // 9 tintMix, grooveMin, edgeLow, edgeHigh
        setVec4Full(36, puddle.tintMix ?? 0.60, puddle.grooveMin ?? 0.30, puddle.edgeLow ?? 0.0, puddle.edgeHigh ?? 0.15);
        // 10 damaged zeroed
        setVec4(40, [0,0,0], 0);
        // 11 roughLow, roughHigh, flatStrength, metalMix
        setVec4Full(44, puddle.roughFeatherLow ?? 0.0, puddle.roughFeatherHigh ?? 0.65, puddle.flatStrength ?? 0.88, puddle.metalMix ?? 0.85);
        updateUniformBuffer(gl, this.modifiersUBO, buf);
        bindUniformBufferBase(gl, this.modifiersBlockBinding, this.modifiersUBO);
      } else {
        // Fast path - individual uniforms (no UBO)
        if (ul.u_modMossAlbedo) { const a=moss.albedo||[0.18,0.42,0.15]; gl.uniform3f(ul.u_modMossAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modMossRoughAdd) gl.uniform1f(ul.u_modMossRoughAdd, moss.roughAdd ?? 0.35);
        if (ul.u_modMossColorStrength) gl.uniform1f(ul.u_modMossColorStrength, moss.colorStrength ?? 0.85);
        if (ul.u_modWaterAlbedo) { const a=water.albedo||[0.2,0.3,0.45]; gl.uniform3f(ul.u_modWaterAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modWaterRoughAdd) gl.uniform1f(ul.u_modWaterRoughAdd, water.roughAdd ?? -0.45);
        if (ul.u_modPuddleAlbedo) { const a=puddle.albedo||[0.10,0.14,0.19]; gl.uniform3f(ul.u_modPuddleAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modPuddleRoughTarget) gl.uniform1f(ul.u_modPuddleRoughTarget, puddle.roughTarget ?? 0.04);
        if (ul.u_modBloodAlbedo) { const a=blood.albedo||[0.55,0.12,0.12]; gl.uniform3f(ul.u_modBloodAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modBloodMix) gl.uniform1f(ul.u_modBloodMix, blood.colorStrength ?? 0.75);
        if (ul.u_modDustAlbedo) { const a=dust.albedo||[0.65,0.6,0.5]; gl.uniform3f(ul.u_modDustAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modDustRoughAdd) gl.uniform1f(ul.u_modDustRoughAdd, dust.roughAdd ?? 0.28);
        if (ul.u_modDamagedAlbedo) { const a=damaged.albedo||[0.18,0.15,0.12]; gl.uniform3f(ul.u_modDamagedAlbedo,a[0],a[1],a[2]); }
        if (ul.u_modDamagedRoughAdd) gl.uniform1f(ul.u_modDamagedRoughAdd, damaged.roughAdd ?? 0.3);


      }
    } catch (e) { console.warn('[GPURenderer] modifier params upload failed', e); }

    const ai = this.atlasInfo || this.materialInfo || { texSize:64, wallCount:1, floorCount:1, ceilCount:1 };
    if (ul.u_wallCount) gl.uniform1f(ul.u_wallCount, ai.wallCount || 1);
    if (ul.u_floorCount) gl.uniform1f(ul.u_floorCount, ai.floorCount || 1);
    if (ul.u_ceilCount) gl.uniform1f(ul.u_ceilCount, ai.ceilCount || 1);

    // Lighting base
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

    // Fog
    const fogCfg = cfg.fog || {};
    gl.uniform1f(ul.u_fogBase, fogCfg.base ?? 0.06);
    gl.uniform1f(ul.u_fogSquared, fogCfg.squared ?? 0.005);
    const fogC = fogCfg.color || [0.05, 0.05, 0.08];
    gl.uniform3f(ul.u_fogColor, fogC[0], fogC[1], fogC[2]);
    if (ul.u_fogEnabled) gl.uniform1i(ul.u_fogEnabled, this.fogEnabled ? 1 : 0);

    // POM
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

    if (ul.u_gridDebug) gl.uniform1i(ul.u_gridDebug, this.gridDebug ? 1 : 0);
    if (ul.u_lightingEnabled) gl.uniform1i(ul.u_lightingEnabled, this.lightingEnabled ? 1 : 0);
    if (ul.u_pbrEnabled) gl.uniform1i(ul.u_pbrEnabled, this.pbrEnabled ? 1 : 0);
    if (ul.u_pomEnabled) gl.uniform1i(ul.u_pomEnabled, this.pomEnabled ? 1 : 0);
    if (ul.u_pbrDebugMode) gl.uniform1i(ul.u_pbrDebugMode, this.pbrDebugMode);

    const aoSun = this._resolveConfigValue(cfg, ['ao.affect.sun','pbr.ao.affectSun','ao.affectSun'], 0.25);
    const aoPoint = this._resolveConfigValue(cfg, ['ao.affect.point','pbr.ao.affectPoint','ao.affectPoint'], 0.35);
    const aoAmbient = this._resolveConfigValue(cfg, ['ao.affect.ambient','pbr.ao.affectAmbient','ao.affectAmbient'], 1.0);
    if (ul.u_aoSun) gl.uniform1f(ul.u_aoSun, aoSun);
    if (ul.u_aoPoint) gl.uniform1f(ul.u_aoPoint, aoPoint);
    if (ul.u_aoAmbient) gl.uniform1f(ul.u_aoAmbient, aoAmbient);

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

    const floorMul = this._resolveConfigValue(cfg, ['rendering.surface.floorAlbedoMul','renderer.floorAlbedoMul'], 0.7);
    const ceilMul = this._resolveConfigValue(cfg, ['rendering.surface.ceilAlbedoMul','renderer.ceilAlbedoMul'], 0.8);
    const wallDarken = this._resolveConfigValue(cfg, ['rendering.surface.wallDarkenSide','renderer.wallDarkenSide'], 0.85);
    if (ul.u_renderFloorMul) gl.uniform1f(ul.u_renderFloorMul, floorMul);
    if (ul.u_renderCeilMul) gl.uniform1f(ul.u_renderCeilMul, ceilMul);
    if (ul.u_renderWallDarken) gl.uniform1f(ul.u_renderWallDarken, wallDarken);

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

    const gridCfg = chCfg.grid || {};
    const cfgGridEnabled = gridCfg.enabled ?? true;
    const gridEnabledUpload = cfgGridEnabled && chamEnabled ? 1 : 0;
    if (ul.u_chamferGridEnabled) gl.uniform1i(ul.u_chamferGridEnabled, gridEnabledUpload);
    const gFloorSize = this._resolveConfigValue(cfg, ['chamfer.grid.floorSize','chamfer.grid.floorSize'], 0.07);
    const gCeilSize = this._resolveConfigValue(cfg, ['chamfer.grid.ceilSize'], 0.06);
    const gFloorDarken = this._resolveConfigValue(cfg, ['chamfer.grid.floorDarken'], 0.88);
    const gCeilDarken = this._resolveConfigValue(cfg, ['chamfer.grid.ceilDarken'], 0.90);
    const gFloorTrim = this._resolveConfigValue(cfg, ['chamfer.grid.floorTrim','chamfer.grid.floorTrim'], 0.06);
    const gCeilTrim = this._resolveConfigValue(cfg, ['chamfer.grid.ceilTrim'], 0.04);
    const gFloorRough = this._resolveConfigValue(cfg, ['chamfer.grid.floorRoughness','chamfer.grid.floorRough'], 0.35);
    const gCeilRough = this._resolveConfigValue(cfg, ['chamfer.grid.ceilRoughness','chamfer.grid.ceilRough'], 0.30);
    const gFloorBlend = this._resolveConfigValue(cfg, ['chamfer.grid.floorBlend','chamfer.grid.floorBlend'], 0.85);
    const gCeilBlend = this._resolveConfigValue(cfg, ['chamfer.grid.ceilBlend'], 0.80);
    const gCreviceEnd = this._resolveConfigValue(cfg, ['chamfer.gridRanges.creviceEnd','chamfer.grid.ranges.creviceEnd'], 0.10);
    const gCreviceSmooth = this._resolveConfigValue(cfg, ['chamfer.gridRanges.creviceSmoothEnd','chamfer.grid.ranges.creviceSmoothEnd'], 0.30);
    const gTrimStart = this._resolveConfigValue(cfg, ['chamfer.gridRanges.trimStart','chamfer.grid.ranges.trimStart'], 0.10);
    const gTrimMid = this._resolveConfigValue(cfg, ['chamfer.gridRanges.trimMid','chamfer.grid.ranges.trimMid'], 0.35);
    const gTrimEnd = this._resolveConfigValue(cfg, ['chamfer.gridRanges.trimEnd','chamfer.grid.ranges.trimEnd'], 1.0);
    if (ul.u_chamferGridFloorSize) gl.uniform1f(ul.u_chamferGridFloorSize, gFloorSize);
    if (ul.u_chamferGridCeilSize) gl.uniform1f(ul.u_chamferGridCeilSize, gCeilSize);
    if (ul.u_chamferGridFloorDarken) gl.uniform1f(ul.u_chamferGridFloorDarken, gFloorDarken);
    if (ul.u_chamferGridCeilDarken) gl.uniform1f(ul.u_chamferGridCeilDarken, gCeilDarken);
    if (ul.u_chamferGridFloorTrim) gl.uniform1f(ul.u_chamferGridFloorTrim, gFloorTrim);
    if (ul.u_chamferGridCeilTrim) gl.uniform1f(ul.u_chamferGridCeilTrim, gCeilTrim);
    if (ul.u_chamferGridFloorRough) gl.uniform1f(ul.u_chamferGridFloorRough, gFloorRough);
    if (ul.u_chamferGridCeilRough) gl.uniform1f(ul.u_chamferGridCeilRough, gCeilRough);
    if (ul.u_chamferGridFloorBlend) gl.uniform1f(ul.u_chamferGridFloorBlend, gFloorBlend);
    if (ul.u_chamferGridCeilBlend) gl.uniform1f(ul.u_chamferGridCeilBlend, gCeilBlend);
    if (ul.u_chamferGridCreviceEnd) gl.uniform1f(ul.u_chamferGridCreviceEnd, gCreviceEnd);
    if (ul.u_chamferGridCreviceSmoothEnd) gl.uniform1f(ul.u_chamferGridCreviceSmoothEnd, gCreviceSmooth);
    if (ul.u_chamferGridTrimStart) gl.uniform1f(ul.u_chamferGridTrimStart, gTrimStart);
    if (ul.u_chamferGridTrimMid) gl.uniform1f(ul.u_chamferGridTrimMid, gTrimMid);
    if (ul.u_chamferGridTrimEnd) gl.uniform1f(ul.u_chamferGridTrimEnd, gTrimEnd);

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

    // Multi-light upload — forward 8 lights, smart scoring
    const playerLight = player.getLightSource();
    let envLights = [];
    try {
      if (this.lightManager) {
        const all = this.lightManager.lights || [];
        const camPos = { x: camX, y: camY };
        const dirX = Math.cos(renderAngle), dirY = Math.sin(renderAngle);
        const scored = all.map(L => {
          const dx = L.pos[0] - camX, dy = L.pos[1] - camY;
          const d2 = dx*dx + dy*dy;
          const dist = Math.sqrt(d2);
          const frontDot = dx * dirX + dy * dirY;
          let score = dist;
          if (frontDot < 0) score += 4.5;
          let occluded = false;
          try { occluded = this._isOccluded(dungeon, camX, camY, L.pos[0], L.pos[1]); } catch {}
          if (occluded) score += 6.0 + dist * 0.15;
          try {
            const playerRoom = dungeon.rooms ? dungeon.rooms.find(r => camX >= r.x && camX < r.x + r.w && camY >= r.y && camY < r.y + r.h) : null;
            const lightRoomIdx = L.roomIndex ?? -1;
            if (playerRoom && dungeon.rooms && dungeon.rooms[lightRoomIdx] === playerRoom) score -= 1.2;
          } catch {}
          return { L, score, dist, frontDot, occluded };
        });
        scored.sort((a,b) => a.score - b.score);
        envLights = scored.slice(0, Math.max(0, this.maxLights - 1)).map(s => s.L);
      } else if (dungeon.lights) {
        envLights = dungeon.lights.map(l => {
          const pos = l.pos || [l.x||0, l.y||0, l.z||0.5];
          return { pos, color: l.color, intensity: l.intensity, radius: l.radius, flickerSpeed: l.flickerSpeed, flickerAmount: l.flickerAmount, phase: l.phase, type: l.type||'flicker', dir: l.dir||[0,0,-1], coneInner: l.coneInner||0.85, coneOuter: l.coneOuter||0.65, pulseSpeed: l.pulseSpeed||0, pulseAmount: l.pulseAmount||0, noShadow: !!l.noShadow, roomIndex: l.roomIndex };
        });
        const dirX = Math.cos(renderAngle), dirY = Math.sin(renderAngle);
        envLights = envLights.map(L=>{ const dx=L.pos[0]-camX, dy=L.pos[1]-camY; const dist=Math.hypot(dx,dy); const front=dx*dirX+dy*dirY; const occ=this._isOccluded? (this._isOccluded(dungeon,camX,camY,L.pos[0],L.pos[1])?6:0):0; const behind=front<0?4.5:0; return {L, score:dist+occ+behind}; }).sort((a,b)=>a.score-b.score).slice(0, Math.max(0,this.maxLights-1)).map(o=>o.L);
      }
    } catch (e) { console.warn('[lights smart select] failed', e); }

    const time = timeSec;
    const lightList = [];
    lightList.push({
      pos: [playerLight.x, playerLight.y, playerLight.z],
      color: playerLight.color,
      intensity: playerLight.intensity,
      radius: playerLight.radius,
      type: 'point', typeId: 0, dir: [0,0,-1], coneInner:0.85, coneOuter:0.65, pulseSpeed:0, pulseAmount:0, noShadow:true, flickerSpeed:0, flickerAmount:0, phase:0,
    });
    for (let i = 0; i < envLights.length && lightList.length < this.maxLights; i++) {
      const L = envLights[i];
      let intensity = L.intensity;
      try {
        if (L.getFlickeredIntensity) intensity = L.getFlickeredIntensity(time);
        else {
          const fs = L.flickerSpeed || 0, fa = L.flickerAmount || 0, ph = L.phase || 0;
          if (fs || fa) {
            const baseT = time * fs + ph;
            const warp = Math.sin(baseT*0.13)*0.34 + Math.sin(baseT*0.067)*0.27;
            const tw = baseT + warp;
            const s1 = Math.sin(tw*1.0) + Math.sin(tw*1.87+ph*1.31)*0.58 + Math.sin(tw*2.93+ph*0.74)*0.34;
            const shaped = s1*0.62 + Math.sin(s1*1.35+ph)*0.38;
            const pop = Math.sin(tw*11.7+ph*4.2)*Math.sin(tw*9.3+ph*2.71);
            const popShaped = Math.pow(Math.abs(pop),2.6)*Math.sign(pop)*0.23;
            const factor = Math.max(0.18, 1.0 + (shaped*0.52 + popShaped)*fa*1.85);
            intensity *= factor;
          }
          if (L.type === 'pulse' && L.pulseSpeed) {
            const pulse = 1.0 + Math.sin(time * L.pulseSpeed + (L.phase||0)) * (L.pulseAmount||0.3);
            intensity *= pulse;
          }
        }
      } catch {}
      lightList.push({
        pos: L.pos, color: L.color, intensity, radius: L.radius, type: L.type || 'point',
        typeId: (L.typeId !== undefined) ? L.typeId : ({point:0,spot:1,flicker:2,pulse:3,emissive:4,ambient:5,steady:6}[L.type]||0),
        dir: L.dir || [0,0,-1], coneInner: L.coneInner ?? 0.85, coneOuter: L.coneOuter ?? 0.65,
        pulseSpeed: L.pulseSpeed ?? 0, pulseAmount: L.pulseAmount ?? L.pulseAmt ?? 0,
        noShadow: !!L.noShadow, flickerSpeed: L.flickerSpeed || 0, flickerAmount: L.flickerAmount || 0, phase: L.phase || 0,
      });
    }

    const numLights = Math.min(lightList.length, this.maxLights);
    if (ul.u_numLights) gl.uniform1i(ul.u_numLights, numLights);
    for (let i = 0; i < this.maxLights; i++) {
      if (i < numLights) {
        const L = lightList[i];
        if (ul.u_lightPos[i]) gl.uniform3f(ul.u_lightPos[i], L.pos[0], L.pos[1], L.pos[2]);
        if (ul.u_lightColor[i]) gl.uniform3f(ul.u_lightColor[i], L.color[0], L.color[1], L.color[2]);
        if (ul.u_lightIntensity[i]) gl.uniform1f(ul.u_lightIntensity[i], L.intensity);
        if (ul.u_lightRadius[i]) gl.uniform1f(ul.u_lightRadius[i], L.radius);
        if (ul.u_lightType[i]) gl.uniform1i(ul.u_lightType[i], L.typeId);
        if (ul.u_lightDir[i]) gl.uniform3f(ul.u_lightDir[i], L.dir[0], L.dir[1], L.dir[2]);
        if (ul.u_lightConeInner[i]) gl.uniform1f(ul.u_lightConeInner[i], L.coneInner);
        if (ul.u_lightConeOuter[i]) gl.uniform1f(ul.u_lightConeOuter[i], L.coneOuter);
        if (ul.u_lightPulseSpeed[i]) gl.uniform1f(ul.u_lightPulseSpeed[i], L.pulseSpeed);
        if (ul.u_lightPulseAmt[i]) gl.uniform1f(ul.u_lightPulseAmt[i], L.pulseAmount);
        if (ul.u_lightNoShadow[i]) gl.uniform1i(ul.u_lightNoShadow[i], L.noShadow ? 1 : 0);
        if (ul.u_lightFlickerSpeed[i]) gl.uniform1f(ul.u_lightFlickerSpeed[i], L.flickerSpeed);
        if (ul.u_lightFlickerAmount[i]) gl.uniform1f(ul.u_lightFlickerAmount[i], L.flickerAmount);
        if (ul.u_lightPhase[i]) gl.uniform1f(ul.u_lightPhase[i], L.phase);
      } else {
        if (ul.u_lightPos[i]) gl.uniform3f(ul.u_lightPos[i], 0,0,0);
        if (ul.u_lightColor[i]) gl.uniform3f(ul.u_lightColor[i], 0,0,0);
        if (ul.u_lightIntensity[i]) gl.uniform1f(ul.u_lightIntensity[i], 0);
        if (ul.u_lightRadius[i]) gl.uniform1f(ul.u_lightRadius[i], 0);
        if (ul.u_lightType[i]) gl.uniform1i(ul.u_lightType[i], 0);
        if (ul.u_lightNoShadow[i]) gl.uniform1i(ul.u_lightNoShadow[i], 0);
      }
    }
    this._lightsCache = lightList;

    gl.uniform1i(ul.u_authentic, this.authentic ? 1 : 0);
    if (ul.u_bandLevels) gl.uniform1i(ul.u_bandLevels, this.bandLevels);
    gl.uniform1f(ul.u_time, timeSec);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    if (this.spriteRenderer && this._sprites && this._sprites.length > 0) {
      try {
        const eyeZ = baseHeight;
        this._fovCache = fov;
        const camera = {
          x: camX, y: camY, angle: renderAngle, eyeZ, bobPixels,
          planeLen: Math.tan(fov*0.5),
          resolution: [this.canvas.width, this.canvas.height],
        };
        const depthBuffer = this._computeDepthBuffer(dungeon, camX, camY, renderAngle);
        const spritesForRender = [];
        for (const orig of this._sprites) {
          const dx = orig.x - camX, dy = orig.y - camY;
          const d2 = dx*dx + dy*dy;
          if (d2 >= 22*22) continue;
          if (this._isSpriteOccluded(dungeon, camX, camY, orig, depthBuffer, renderAngle)) continue;
          spritesForRender.push({
            x: orig.x, y: orig.y, z: orig.z,
            spriteId: orig.spriteId || orig.type || 'torch_wall',
            type: orig.spriteId || orig.type,
            frame: orig.frame || 0, scale: orig.scale || 1, alpha: orig.alpha ?? 1,
            visible: orig.visible !== false, material: orig.material || null,
          });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
        this.spriteRenderer.render(spritesForRender, camera, this._lightsCache, timeSec, {
          sunDir: { x: sunDir[0]/sunLen, y: sunDir[1]/sunLen, z: sunDir[2]/sunLen },
          sunIntensity, sunColor, ambient: ambientLevel,
          fogBase: fogCfg.base ?? 0.06, fogSq: fogCfg.squared ?? 0.005,
        });
        gl.bindVertexArray(null);
      } catch (e) { console.warn('[render sprites] failed', e); }
    }

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
    if (this.spriteRenderer) this.spriteRenderer.resize();
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

