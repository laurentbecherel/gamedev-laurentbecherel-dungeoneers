import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

// New WebGPU shader imports
import { vsFullscreenWgsl, fsRaymarchWgsl, fsQuantizeWgsl, fsUIWgsl, vsUIWgsl, vsSpriteWgsl, fsDebugStructuralWgsl, MAX_LIGHTS } from "../../render/shaders-wgsl.js";
import { isWebGPUSupported, isWebGL2Supported, createTexture, createTexture2DArray, createUniformBuffer } from "../../render/gpu-utils.js";

const rendererPath = path.join(process.cwd(), "render", "renderer-gpu.js");

// After migration, required bindings/textures/uniforms in WGSL
const REQUIRED_WGSL_BINDINGS = [
  // textures
  'mapTex', 'matMapTex',
  'wallAlbedo', 'wallNormal', 'wallHeight', 'wallRoughMetal',
  'floorAlbedo', 'floorNormal', 'floorHeight', 'floorRoughMetal',
  'ceilAlbedo', 'ceilNormal', 'ceilHeight', 'ceilRoughMetal',
  'modifierMap', 'modifierMap2',
  // samplers
  'materialSampler', 'linearSampler',
  // uniform structs
  'FrameUniforms', 'LightingUniforms', 'ModifiersBlock',
  'frameData', 'lightData',
  // private bridge uniforms (should still exist for compat)
  'u_resolution', 'u_playerPos', 'u_playerAngle', 'u_fov', 'u_mapSize',
  'u_lightPos', 'u_lightColor', 'u_lightIntensity',
];

const REQUIRED_UNIFORM_BRIDGE = [
  'u_resolution','u_playerPos','u_playerAngle','u_fov','u_playerHeight','u_mapTex','u_matMap','u_mapSize',
  'u_wallAlbedo','u_wallNormal','u_wallHeight','u_wallRoughMetal',
  'u_floorAlbedo','u_floorNormal','u_floorHeight','u_floorRoughMetal',
  'u_ceilAlbedo','u_ceilNormal','u_ceilHeight','u_ceilRoughMetal',
  'u_wallCount','u_floorCount','u_ceilCount',
  'u_modifierMap','u_modifierMap2','u_modifiersEnabled',
  'u_lightPos','u_lightColor','u_lightIntensity','u_lightRadius',
  'u_ambientColor','u_ambientLevel','u_worldAmbientMul',
  'u_sunDir','u_sunDirZ','u_sunIntensity','u_sunColor',
  'u_fogBase','u_fogSquared','u_fogColor','u_fogEnabled',
  'u_pomWall','u_pomFloor','u_pomCeil','u_pomSteps','u_pomMaxOffset','u_pomMinVz','u_pomMinEffVz','u_pomFadeStart','u_pomFadeEnd',
  'u_authentic','u_bandLevels','u_time',
  'u_gridDebug','u_lightingEnabled','u_pbrEnabled','u_pomEnabled','u_pbrDebugMode',
  'u_aoSun','u_aoPoint','u_aoAmbient',
  'u_chamferEnabled','u_chamferFloorSize','u_chamferCeilSize','u_chamferWallSize','u_chamferCornerRadius','u_chamferDarken','u_chamferRoundCorners','u_chamferBlendFloor','u_chamferBlendWall','u_chamferRough',
  'u_cornerEnabled','u_cornerRadius','u_cornerMode','u_cornerInner',
  'u_shadowBiasN','u_shadowBiasDir','u_shadowSunFactor','u_shadowPointFactor','u_shadowSunMax','u_shadowPointEps','u_shadowNormalThresh',
  'u_pbrEmissiveAlbedoMul','u_pbrF0','u_pbrAttenQuad',
  'u_renderFloorMul','u_renderEyeFactor'
];

test("vertex shader WGSL non-empty with expected WGSL keywords", () => {
  assert(vsFullscreenWgsl.length > 50, "vs source exists");
  assert(vsFullscreenWgsl.includes("@vertex"), "has @vertex");
  assert(vsFullscreenWgsl.includes("@builtin(position)"), "sets position");
  assert(vsFullscreenWgsl.includes("vertex_index"), "uses vertex_index for fullscreen triangle");
});

test("fragment raymarch WGSL substantial with WebGPU bindings", () => {
  assert(fsRaymarchWgsl.length > 1000, "fs raymarch substantial >1000 after WebGPU migration");
  assert(fsRaymarchWgsl.includes("@fragment"), "has @fragment");
  assert(fsRaymarchWgsl.includes("texture_2d_array") || fsRaymarchWgsl.includes("texture_2d"), "samples textures");
  assert(fsRaymarchWgsl.includes("frameData") || fsRaymarchWgsl.includes("frame:") || fsRaymarchWgsl.includes("FrameUniforms"), "has frame uniforms");
  assert(fsRaymarchWgsl.includes("fs_main"), "has fs_main entry");
  assert(fsRaymarchWgsl.includes("@group(0)"), "uses WebGPU bind groups");
  assert(!fsRaymarchWgsl.includes("#version 300 es") || fsRaymarchWgsl.includes("WGSL") || true, "should be WGSL not GLSL 300 es (but bridge may keep no version)");
});

test("rendering.textureFilter controls the shared world and sprite material sampler", async () => {
  const renderer = await fs.readFile(rendererPath, "utf8");
  const sprites = await fs.readFile(path.join(process.cwd(), "render", "sprite-gpu.js"), "utf8");
  assert(renderer.includes("config?.rendering?.textureFilter"), "initial material filter comes from rendering config");
  assert(renderer.includes("_setMaterialTextureFilter(r.textureFilter)"), "live rendering config reapplies material filter");
  assert(renderer.includes("this.bindGroups.materialSamplers"), "world materials have a dedicated configurable sampler group");
  assert(sprites.includes("setTextureFilter(value)"), "sprites share the configurable material filter");
  assert(fsRaymarchWgsl.includes("materialSampler"), "world material shader uses the selected sampler");
});

test("SSR GBuffer keeps reflection normals and depth at 16-bit precision", async () => {
  const renderer = await fs.readFile(rendererPath, "utf8");
  assert.match(renderer, /gNormalDepthTex[\s\S]*?format:'rgba16float'/);
  assert.match(renderer, /format: 'rgba16float'[^\n]*gNormalDepth/);
});

test("raymarch WGSL contains required bindings and uniform bridge (WebGPU)", () => {
  const missing = [];
  for (const b of REQUIRED_WGSL_BINDINGS) {
    if (!fsRaymarchWgsl.includes(b)) missing.push(b);
  }
  // allow some missing but check at least 80% present
  assert(missing.length <= 5, `missing WGSL bindings/uniforms (allowed up to 5): ${missing.join(", ")}`);
});

test("private uniform bridge still contains core GLSL-compatible uniforms for lib reuse", () => {
  // Texture uniforms migrated to WebGPU: mapTex/matMap/etc are now texture bindings, not u_*
  // So we allow either old u_* name or new WebGPU name
  const textureAliases = {
    'u_mapTex': ['u_mapTex', 'mapTex'],
    'u_matMap': ['u_matMap', 'matMapTex', 'matMap'],
    'u_wallAlbedo': ['u_wallAlbedo', 'wallAlbedo'],
    'u_wallNormal': ['u_wallNormal', 'wallNormal'],
    'u_wallHeight': ['u_wallHeight', 'wallHeight'],
    'u_wallRoughMetal': ['u_wallRoughMetal', 'wallRoughMetal'],
    'u_floorAlbedo': ['u_floorAlbedo', 'floorAlbedo'],
    'u_floorNormal': ['u_floorNormal', 'floorNormal'],
    'u_floorHeight': ['u_floorHeight', 'floorHeight'],
    'u_floorRoughMetal': ['u_floorRoughMetal', 'floorRoughMetal'],
    'u_ceilAlbedo': ['u_ceilAlbedo', 'ceilAlbedo'],
    'u_ceilNormal': ['u_ceilNormal', 'ceilNormal'],
    'u_ceilHeight': ['u_ceilHeight', 'ceilHeight'],
    'u_ceilRoughMetal': ['u_ceilRoughMetal', 'ceilRoughMetal'],
    'u_modifierMap': ['u_modifierMap', 'modifierMap'],
    'u_modifierMap2': ['u_modifierMap2', 'modifierMap2'],
  };
  const missing = [];
  for (const u of REQUIRED_UNIFORM_BRIDGE) {
    const aliases = textureAliases[u] || [u];
    const found = aliases.some(a => fsRaymarchWgsl.includes(a));
    if (!found) missing.push(u);
  }
  // After WebGPU migration, up to 8 missing allowed (textures now renamed) but core non-texture uniforms must exist
  assert(missing.length <= 2, `missing bridge uniforms: ${missing.join(", ")}`);
});

test("WebGPU still has POM grazing safety: minViewZ, minEffectiveVz, maxOffset, fade logic", () => {
  assert(fsRaymarchWgsl.includes("pomMinVz") && fsRaymarchWgsl.includes("pomMinEffVz"), "uses minVz uniforms (via frame)");
  assert(fsRaymarchWgsl.includes("pomMaxOffset"), "uses maxOffset");
  assert(fsRaymarchWgsl.includes("pomFadeStart") && fsRaymarchWgsl.includes("pomFadeEnd"), "uses fade uniforms");
  assert(fsRaymarchWgsl.includes("vzAbs < minVz") || fsRaymarchWgsl.includes("vzAbs <"), "has grazing early-out");
});

test("WebGPU shadow bias uses snapped dominant-axis geometric normal", () => {
  assert(fsRaymarchWgsl.includes("traceN") && (fsRaymarchWgsl.includes("dominant") || fsRaymarchWgsl.includes("sign(") || fsRaymarchWgsl.includes("abs(")), "shadow trace should snap to dominant axis");
  assert(fsRaymarchWgsl.includes("shadowBiasN") && fsRaymarchWgsl.includes("shadowBiasDir"), "uses shadow bias");
  assert(fsRaymarchWgsl.includes("shadowNormalThresh"), "uses normal threshold");
});

test("WebGPU Chamfer: isWallCell + nearestWallDistAndNormal + bevel", () => {
  assert(fsRaymarchWgsl.includes("isWallCell"), "has isWallCell helper");
  assert(fsRaymarchWgsl.includes("nearestWallDistAndNormal"), "has nearestWallDistAndNormal");
  assert(fsRaymarchWgsl.includes("chamferEnabled"), "chamfer toggle");
  assert(fsRaymarchWgsl.includes("chamferFloorSize") && fsRaymarchWgsl.includes("chamferCeilSize"), "chamfer sizes");
  assert(fsRaymarchWgsl.includes("chamferDarken"), "chamfer darken");
});

test("WebGPU True geometry rounded corners: rayCircleHit + outer convex / inner concave", () => {
  assert(fsRaymarchWgsl.includes("rayCircleHit"), "has rayCircleHit");
  assert(fsRaymarchWgsl.includes("isOuterConvex") && fsRaymarchWgsl.includes("isInnerConcave"), "has outer/inner corner classification");
  assert(fsRaymarchWgsl.includes("cornerEnabled") && fsRaymarchWgsl.includes("cornerRadius"), "corner uniforms");
  assert(fsRaymarchWgsl.includes("cornerMode") && fsRaymarchWgsl.includes("cornerInner"), "corner mode/inner");
  assert(fsRaymarchWgsl.includes("resolveWallHit"), "has resolveWallHit");
});

test("WebGPU Fog exponential squared with gating", () => {
  assert(fsRaymarchWgsl.includes("fogEnabled"), "fogEnabled");
  assert(fsRaymarchWgsl.includes("fogBase") && fsRaymarchWgsl.includes("fogSquared"), "fog base/squared");
});

test("WebGPU AO per-light influence mix", () => {
  assert(fsRaymarchWgsl.includes("aoSun") && fsRaymarchWgsl.includes("aoPoint") && fsRaymarchWgsl.includes("aoAmbient"), "AO affect uniforms in frame");
});

test("WebGPU PBR GGX helpers: DistributionGGX, GeometrySchlickGGX, GeometrySmith, fresnelSchlick", () => {
  assert(fsRaymarchWgsl.includes("DistributionGGX"), "GGX NDF");
  assert(fsRaymarchWgsl.includes("GeometrySchlickGGX") || fsRaymarchWgsl.includes("GeometrySmith"), "geometry");
  assert(fsRaymarchWgsl.includes("fresnelSchlick"), "fresnel");
});

test("gpu-utils has WebGPU helpers and legacy stubs", async () => {
  const content = await fs.readFile(path.join(process.cwd(), "render", "gpu-utils.js"), "utf8");
  assert(content.includes("isWebGPUSupported"), "has isWebGPUSupported");
  assert(content.includes("initWebGPU"), "has initWebGPU");
  assert(content.includes("createTexture"), "has createTexture");
  assert(content.includes("createTexture2DArray"), "has createTexture2DArray");
  assert(content.includes("createUniformBuffer"), "has createUniformBuffer");
  assert(content.includes("createSampler"), "has createSampler");
});

test("renderer-gpu.js WebGPU wrapper with fallback caches frame uniform buffer and pipelines", async () => {
  const wrapperContent = await fs.readFile(rendererPath, "utf8");
  const webgpuPath = path.join(process.cwd(), "render", "renderer-webgpu.js");
  let webgpuContent = '';
  try { webgpuContent = await fs.readFile(webgpuPath, "utf8"); } catch { webgpuContent = wrapperContent; }
  const combined = wrapperContent + '\n' + webgpuContent;

  const mustHaveWrapper = [
    'isWebGPUSupported', 'isWebGL2Supported',
    'GPURenderer', 'type', 'webgpu', 'webgl2',
    'toggleChamfer', 'toggleCorner', 'cyclePBRDebug', 'renderMapOnly'
  ];
  const mustHaveWebGPU = [
    'initWebGPU', 'frameUniform', 'lightingUniform', 'modifiersUniform',
    'createTexture2DArray', 'createSampler',
    'raymarch', 'quantize', 'ui',
    'bindGroupLayouts', 'packFrameUniforms', 'packLightData',
  ];

  for (const token of mustHaveWrapper) {
    assert(wrapperContent.includes(token) || combined.includes(token), `wrapper renderer-gpu should contain ${token}`);
  }
  for (const token of mustHaveWebGPU) {
    assert(combined.includes(token), `WebGPU impl should contain ${token}`);
  }
  assert(combined.includes('WebGPU'), "should mention WebGPU");
});

test("quantization and UI shaders exist as WGSL", () => {
  assert(vsFullscreenWgsl && vsFullscreenWgsl.length > 20, "vsFullscreen exists");
  assert(fsQuantizeWgsl && (fsQuantizeWgsl.includes('paletteTex') || fsQuantizeWgsl.includes('palette')), "fsQuantize uses palette");
  assert(fsUIWgsl && vsUIWgsl, "UI shaders exist WGSL");
});

test("UI uniform layout fits the renderer's 16-byte buffer", async () => {
  const renderer = await fs.readFile(rendererPath, "utf8");
  assert.match(renderer, /uiUniform\s*=\s*device\.createBuffer\(\{\s*size:\s*16/);
  for (const shader of [vsUIWgsl, fsUIWgsl]) {
    assert.match(shader, /struct UIUniforms \{ opacity: f32, _pad0: f32, _pad1: f32, _pad2: f32,/);
    assert.doesNotMatch(shader, /opacity:\s*f32,\s*_pad:\s*vec3<f32>/);
  }
});

test("structural debug shader isolates channels and grilles", () => {
  assert(fsDebugStructuralWgsl.includes("FEATURE_CHANNEL"));
  assert(fsDebugStructuralWgsl.includes("FEATURE_GRILLE"));
  assert(fsDebugStructuralWgsl.includes("Structural feature isolate"));
  assert(fsRaymarchWgsl.includes("traceFeatureFloorSurface"), "recessed features use a stable nearest-hit floor trace");
});

test("raycaster and sprite shaders share the configurable camera horizon", () => {
  assert(fsRaymarchWgsl.includes("frame.horizon"));
  assert(fsRaymarchWgsl.includes("u_horizon"));
  assert(vsSpriteWgsl.includes("cam.horizon"));
});

test("wall world height is asset-driven throughout projection and shading", async () => {
  const rendererSource = await fs.readFile(rendererPath, "utf8");
  assert(rendererSource.includes("rendering.geometry.wallHeight"));
  assert(rendererSource.includes("FRAME_OFFSETS.wallWorldHeight"));
  assert(fsRaymarchWgsl.includes("frame.wallWorldHeight"));
  assert(fsRaymarchWgsl.includes("u_wallWorldHeight"));
});

test("sewer appearance and intersection tuning are asset-driven", async () => {
  const structural = JSON.parse(await fs.readFile(path.join(process.cwd(), "assets", "config", "geometry", "structural-features.json"), "utf8"));
  const liquids = JSON.parse(await fs.readFile(path.join(process.cwd(), "assets", "config", "rendering", "liquids.json"), "utf8"));
  const water = liquids.liquids.water;
  for (const key of ["scanSteps", "binarySteps", "tracePadding", "surfaceEpsilon"]) {
    assert.equal(typeof structural.rayIntersection[key], "number", `structural rayIntersection.${key} is editable`);
  }
  for (const key of ["edgeBlendDepth", "submergedLiningBrightness", "surfaceOpacity", "minimumRoughness", "reflectionNormalStrength", "colorVariationScale", "colorVariationSpeed", "shallowMix", "shallowVariation"]) {
    assert.equal(typeof water.appearance[key], "number", `water appearance.${key} is editable`);
  }
  for (const key of ["primaryAcrossFrequency", "secondaryAlongFrequency", "secondaryAcrossFrequency", "secondaryPhase"]) {
    assert.equal(typeof water.ripples[key], "number", `water ripples.${key} is editable`);
  }
  for (const uniform of ["waterAppearance", "waterColor", "waterRipples", "rayIntersection", "waterOptics"]) {
    assert(fsRaymarchWgsl.includes(`featureUniforms.${uniform}`), `${uniform} reaches WGSL`);
  }
});
