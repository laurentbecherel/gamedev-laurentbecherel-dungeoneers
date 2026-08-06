// WGSL shader sources – WebGPU migration – rebuilt with correct ordering
import { wgslCommon } from './shader-lib/common.wgsl.js';
import { wgslMaterial } from './shader-lib/material.wgsl.js';
import { wgslPom } from './shader-lib/pom.wgsl.js';
import { wgslRaymarch } from './shader-lib/raymarch.wgsl.js';
import { wgslPbr } from './shader-lib/pbr.wgsl.js';
import { wgslChamfer } from './shader-lib/chamfer.wgsl.js';
import { wgslGridChamfer } from './shader-lib/grid-chamfer.wgsl.js';
import { wgslModifiers } from './shader-lib/modifiers.wgsl.js';
import { wgslScene } from './shader-lib/scene.wgsl.js';
import { wgslSSR } from './shader-lib/ssr.wgsl.js';
import { wgslFeatures } from './shader-lib/features.wgsl.js';

export const MAX_LIGHTS = 8;
export const MAX_CHARS = 8;
export const FRAME_DATA_VEC4_COUNT = 32;
export const LIGHT_DATA_VEC4_COUNT = 40;
export const MODIFIERS_VEC4_COUNT = 49;

export const vsFullscreenWgsl = `
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let p = positions[vid];
  var out: VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = p * 0.5 + 0.5;
  return out;
}
`;

// Uniform structs – must be defined before bindings
const structsAndBindings = `
// --- Modifiers Block (49 vec4) ---
${wgslModifiers}

struct FrameUniforms {
  resolution: vec2<f32>,
  playerPos: vec2<f32>,
  playerAngle: f32,
  fov: f32,
  playerHeight: f32,
  bobPixels: f32,
  mapSize: vec2<f32>,
  time: f32,
  wallCount: f32,
  floorCount: f32,
  ceilCount: f32,
  ssrDepthRange: f32,
  authentic: i32,
  bandLevels: i32,
  gridDebug: i32,
  lightingEnabled: i32,
  pbrEnabled: i32,
  pomEnabled: i32,
  pbrDebugMode: i32,
  fogEnabled: i32,
  modifiersEnabled: i32,
  numLights: i32,
  _pad0: i32,
  ambientColor: vec3<f32>,
  _padAC: f32,
  ambientLevel: f32,
  worldAmbientMul: f32,
  sunDir: vec2<f32>,
  sunDirZ: f32,
  sunIntensity: f32,
  sunColor: vec3<f32>,
  _padSC: f32,
  fogBase: f32,
  fogSquared: f32,
  fogColor: vec3<f32>,
  _padFC: f32,
  pomWall: f32,
  pomFloor: f32,
  pomCeil: f32,
  pomSteps: i32,
  pomMaxOffset: f32,
  pomMinVz: f32,
  pomMinEffVz: f32,
  pomFadeStart: f32,
  pomFadeEnd: f32,
  aoSun: f32,
  aoPoint: f32,
  aoAmbient: f32,
  _padAO: f32,
  chamferEnabled: i32,
  chamferFloorSize: f32,
  chamferCeilSize: f32,
  chamferWallSize: f32,
  chamferCornerRadius: f32,
  chamferDarken: f32,
  chamferRoundCorners: i32,
  chamferBlendFloor: f32,
  chamferBlendWall: f32,
  chamferRough: f32,
  chamferFloor: f32,
  chamferCeil: f32,
  chamferWall: f32,
  chamferTrimFloor: f32,
  chamferTrimCeil: f32,
  chamferTrimWall: f32,
  chamferTrimFloorAlt: f32,
  chamferTrimCeilAlt: f32,
  chamferCreviceEnd: f32,
  chamferCreviceSmoothEnd: f32,
  chamferTrimStart: f32,
  chamferTrimMid: f32,
  chamferTrimEnd: f32,
  chamferGridEnabled: i32,
  chamferGridFloorSize: f32,
  chamferGridCeilSize: f32,
  chamferGridFloorDarken: f32,
  chamferGridCeilDarken: f32,
  chamferGridFloorTrim: f32,
  chamferGridCeilTrim: f32,
  chamferGridFloorRough: f32,
  chamferGridCeilRough: f32,
  chamferGridFloorBlend: f32,
  chamferGridCeilBlend: f32,
  chamferGridCreviceEnd: f32,
  chamferGridCreviceSmoothEnd: f32,
  chamferGridTrimStart: f32,
  chamferGridTrimMid: f32,
  chamferGridTrimEnd: f32,
  cornerEnabled: i32,
  cornerRadius: f32,
  cornerMode: i32,
  cornerInner: i32,
  cornerBandNear: f32,
  cornerBandFarExtra: f32,
  cornerBandFarFactor: f32,
  cornerSectorThresh: f32,
  cornerNormalMix: f32,
  cornerAlbedoBoost: f32,
  cornerRoughMul: f32,
  cornerAoMul: f32,
  shadowBiasN: f32,
  shadowBiasDir: f32,
  shadowSunFactor: f32,
  shadowPointFactor: f32,
  shadowSunMax: f32,
  shadowPointEps: f32,
  shadowNormalThresh: f32,
  pbrEmissiveAlbedoMul: f32,
  pbrEmissiveStrength: f32,
  pbrF0: f32,
  pbrAttenQuad: f32,
  pbrGGXEps: f32,
  renderFloorMul: f32,
  renderCeilMul: f32,
  renderWallDarken: f32,
  renderEyeFactor: f32,
  ssrDebugMode: i32,
  ssrSteps: i32,
  ssrBinarySteps: i32,
  ssrMaxDistance: f32,
  ssrThickness: f32,
  ssrStride: f32,
  ssrJitter: f32,
  ssrDepthBias: f32,
  ssrZThicknessScale: f32,
  ssrMinPuddleMask: f32,
  ssrNormalThreshold: f32,
  ssrMaxGrazingAngle: f32,
  ssrEdgeFadeStart: f32,
  ssrEdgeFadeEnd: f32,
  ssrDistanceFadeStart: f32,
  ssrDistanceFadeEnd: f32,
  ssrFresnelPower: f32,
  ssrFresnelMin: f32,
  ssrFresnelMax: f32,
  ssrBlendStrength: f32,
  ssrPuddleMaskInfluence: f32,
  ssrTintStrength: f32,
  ssrAdditiveBoost: f32,
  ssrTint: vec3<f32>,
  _padTint: f32,
  horizon: f32,
  wallWorldHeight: f32,
};

struct LightEntry {
  pos: vec4<f32>,
  color: vec4<f32>,
  dir: vec4<f32>,
  cone: vec4<f32>,
  extra: vec4<f32>,
  typePad: vec4<f32>,
};

struct LightingUniforms {
  lights: array<LightEntry, 8>,
  count: i32,
  _pad: vec3<i32>,
};

struct FeatureUniforms {
  channel: vec4<f32>,
  waterShallow: vec4<f32>,
  waterDeep: vec4<f32>,
  waterMotion: vec4<f32>,
  materials: vec4<f32>,
  system: vec4<f32>,
  waterAppearance: vec4<f32>,
  waterColor: vec4<f32>,
  waterRipples: vec4<f32>,
  rayIntersection: vec4<f32>,
  waterOptics: vec4<f32>,
};

struct FeatureCellBuffer { data: array<u32>, };

// Bindings
@group(0) @binding(0) var<uniform> frameData: array<vec4<f32>, 32>;
@group(0) @binding(1) var<uniform> lightData: array<vec4<f32>, 40>;
@group(0) @binding(2) var<uniform> modifiersBlock: ModifiersBlock;
@group(0) @binding(3) var<uniform> frame: FrameUniforms;
@group(0) @binding(4) var<uniform> lights: LightingUniforms;
@group(0) @binding(5) var<storage, read> featureCellBuffer: FeatureCellBuffer;
@group(0) @binding(6) var<uniform> featureUniforms: FeatureUniforms;

@group(1) @binding(0) var mapTex: texture_2d<f32>;
@group(1) @binding(1) var matMapTex: texture_2d<f32>;
@group(1) @binding(2) var wallAlbedo: texture_2d_array<f32>;
@group(1) @binding(3) var wallNormal: texture_2d_array<f32>;
@group(1) @binding(4) var wallHeight: texture_2d_array<f32>;
@group(1) @binding(5) var wallRoughMetal: texture_2d_array<f32>;
@group(1) @binding(6) var floorAlbedo: texture_2d_array<f32>;
@group(1) @binding(7) var floorNormal: texture_2d_array<f32>;
@group(1) @binding(8) var floorHeight: texture_2d_array<f32>;
@group(1) @binding(9) var floorRoughMetal: texture_2d_array<f32>;
@group(1) @binding(10) var ceilAlbedo: texture_2d_array<f32>;
@group(1) @binding(11) var ceilNormal: texture_2d_array<f32>;
@group(1) @binding(12) var ceilHeight: texture_2d_array<f32>;
@group(1) @binding(13) var ceilRoughMetal: texture_2d_array<f32>;
@group(1) @binding(14) var modifierMap: texture_2d<f32>;
@group(1) @binding(15) var modifierMap2: texture_2d<f32>;

@group(2) @binding(0) var materialSampler: sampler;
@group(2) @binding(1) var linearSampler: sampler;

var<private> u_resolution: vec2<f32>;
var<private> u_playerPos: vec2<f32>;
var<private> u_playerAngle: f32;
var<private> u_fov: f32;
var<private> u_playerHeight: f32;
var<private> u_bobPixels: f32;
var<private> u_horizon: f32;
var<private> u_wallWorldHeight: f32;
var<private> u_mapSize: vec2<f32>;
var<private> u_time: f32;
var<private> u_wallCount: f32;
var<private> u_floorCount: f32;
var<private> u_ceilCount: f32;
var<private> u_ssrDepthRange: f32;
var<private> u_authentic: i32;
var<private> u_bandLevels: i32;
var<private> u_gridDebug: i32;
var<private> u_lightingEnabled: i32;
var<private> u_pbrEnabled: i32;
var<private> u_pomEnabled: i32;
var<private> u_pbrDebugMode: i32;
var<private> u_fogEnabled: i32;
var<private> u_modifiersEnabled: i32;
var<private> u_numLights: i32;
var<private> u_ambientColor: vec3<f32>;
var<private> u_ambientLevel: f32;
var<private> u_worldAmbientMul: f32;
var<private> u_sunDir: vec2<f32>;
var<private> u_sunDirZ: f32;
var<private> u_sunIntensity: f32;
var<private> u_sunColor: vec3<f32>;
var<private> u_fogBase: f32;
var<private> u_fogSquared: f32;
var<private> u_fogColor: vec3<f32>;
var<private> u_pomWall: f32;
var<private> u_pomFloor: f32;
var<private> u_pomCeil: f32;
var<private> u_pomSteps: i32;
var<private> u_pomMaxOffset: f32;
var<private> u_pomMinVz: f32;
var<private> u_pomMinEffVz: f32;
var<private> u_pomFadeStart: f32;
var<private> u_pomFadeEnd: f32;
var<private> u_aoSun: f32;
var<private> u_aoPoint: f32;
var<private> u_aoAmbient: f32;
var<private> u_chamferEnabled: i32;
var<private> u_chamferFloorSize: f32;
var<private> u_chamferCeilSize: f32;
var<private> u_chamferWallSize: f32;
var<private> u_chamferCornerRadius: f32;
var<private> u_chamferDarken: f32;
var<private> u_chamferRoundCorners: i32;
var<private> u_chamferBlendFloor: f32;
var<private> u_chamferBlendWall: f32;
var<private> u_chamferRough: f32;
var<private> u_chamferFloor: f32;
var<private> u_chamferCeil: f32;
var<private> u_chamferWall: f32;
var<private> u_chamferTrimFloor: f32;
var<private> u_chamferTrimCeil: f32;
var<private> u_chamferTrimWall: f32;
var<private> u_chamferTrimFloorAlt: f32;
var<private> u_chamferTrimCeilAlt: f32;
var<private> u_chamferCreviceEnd: f32;
var<private> u_chamferCreviceSmoothEnd: f32;
var<private> u_chamferTrimStart: f32;
var<private> u_chamferTrimMid: f32;
var<private> u_chamferTrimEnd: f32;
var<private> u_chamferGridEnabled: i32;
var<private> u_chamferGridFloorSize: f32;
var<private> u_chamferGridCeilSize: f32;
var<private> u_chamferGridFloorDarken: f32;
var<private> u_chamferGridCeilDarken: f32;
var<private> u_chamferGridFloorTrim: f32;
var<private> u_chamferGridCeilTrim: f32;
var<private> u_chamferGridFloorRough: f32;
var<private> u_chamferGridCeilRough: f32;
var<private> u_chamferGridFloorBlend: f32;
var<private> u_chamferGridCeilBlend: f32;
var<private> u_chamferGridCreviceEnd: f32;
var<private> u_chamferGridCreviceSmoothEnd: f32;
var<private> u_chamferGridTrimStart: f32;
var<private> u_chamferGridTrimMid: f32;
var<private> u_chamferGridTrimEnd: f32;
var<private> u_cornerEnabled: i32;
var<private> u_cornerRadius: f32;
var<private> u_cornerMode: i32;
var<private> u_cornerInner: i32;
var<private> u_cornerBandNear: f32;
var<private> u_cornerBandFarExtra: f32;
var<private> u_cornerBandFarFactor: f32;
var<private> u_cornerSectorThresh: f32;
var<private> u_cornerNormalMix: f32;
var<private> u_cornerAlbedoBoost: f32;
var<private> u_cornerRoughMul: f32;
var<private> u_cornerAoMul: f32;
var<private> u_shadowBiasN: f32;
var<private> u_shadowBiasDir: f32;
var<private> u_shadowSunFactor: f32;
var<private> u_shadowPointFactor: f32;
var<private> u_shadowSunMax: f32;
var<private> u_shadowPointEps: f32;
var<private> u_shadowNormalThresh: f32;
var<private> u_pbrEmissiveAlbedoMul: f32;
var<private> u_pbrEmissiveStrength: f32;
var<private> u_pbrF0: f32;
var<private> u_pbrAttenQuad: f32;
var<private> u_pbrGGXEps: f32;
var<private> u_renderFloorMul: f32;
var<private> u_renderCeilMul: f32;
var<private> u_renderWallDarken: f32;
var<private> u_renderEyeFactor: f32;

var<private> u_lightPos: array<vec3<f32>, 8>;
var<private> u_lightColor: array<vec3<f32>, 8>;
var<private> u_lightIntensity: array<f32, 8>;
var<private> u_lightRadius: array<f32, 8>;
var<private> u_lightType: array<i32, 8>;
var<private> u_lightDir: array<vec3<f32>, 8>;
var<private> u_lightConeInner: array<f32, 8>;
var<private> u_lightConeOuter: array<f32, 8>;
var<private> u_lightPulseSpeed: array<f32, 8>;
var<private> u_lightPulseAmt: array<f32, 8>;
var<private> u_lightNoShadow: array<i32, 8>;
var<private> u_lightFlickerSpeed: array<f32, 8>;
var<private> u_lightFlickerAmount: array<f32, 8>;
var<private> u_lightPhase: array<f32, 8>;

fn initUniforms() {
  u_resolution = frame.resolution;
  u_playerPos = frame.playerPos;
  u_playerAngle = frame.playerAngle;
  u_fov = frame.fov;
  u_playerHeight = frame.playerHeight;
  u_bobPixels = frame.bobPixels;
  u_horizon = frame.horizon;
  u_wallWorldHeight = frame.wallWorldHeight;
  u_mapSize = frame.mapSize;
  u_time = frame.time;
  u_wallCount = frame.wallCount;
  u_floorCount = frame.floorCount;
  u_ceilCount = frame.ceilCount;
  u_ssrDepthRange = frame.ssrDepthRange;
  u_authentic = frame.authentic;
  u_bandLevels = frame.bandLevels;
  u_gridDebug = frame.gridDebug;
  u_lightingEnabled = frame.lightingEnabled;
  u_pbrEnabled = frame.pbrEnabled;
  u_pomEnabled = frame.pomEnabled;
  u_pbrDebugMode = frame.pbrDebugMode;
  u_fogEnabled = frame.fogEnabled;
  u_modifiersEnabled = frame.modifiersEnabled;
  u_numLights = frame.numLights;
  u_ambientColor = frame.ambientColor;
  u_ambientLevel = frame.ambientLevel;
  u_worldAmbientMul = frame.worldAmbientMul;
  u_sunDir = frame.sunDir;
  u_sunDirZ = frame.sunDirZ;
  u_sunIntensity = frame.sunIntensity;
  u_sunColor = frame.sunColor;
  u_fogBase = frame.fogBase;
  u_fogSquared = frame.fogSquared;
  u_fogColor = frame.fogColor;
  u_pomWall = frame.pomWall;
  u_pomFloor = frame.pomFloor;
  u_pomCeil = frame.pomCeil;
  u_pomSteps = frame.pomSteps;
  u_pomMaxOffset = frame.pomMaxOffset;
  u_pomMinVz = frame.pomMinVz;
  u_pomMinEffVz = frame.pomMinEffVz;
  u_pomFadeStart = frame.pomFadeStart;
  u_pomFadeEnd = frame.pomFadeEnd;
  u_aoSun = frame.aoSun;
  u_aoPoint = frame.aoPoint;
  u_aoAmbient = frame.aoAmbient;
  u_chamferEnabled = frame.chamferEnabled;
  u_chamferFloorSize = frame.chamferFloorSize;
  u_chamferCeilSize = frame.chamferCeilSize;
  u_chamferWallSize = frame.chamferWallSize;
  u_chamferCornerRadius = frame.chamferCornerRadius;
  u_chamferDarken = frame.chamferDarken;
  u_chamferRoundCorners = frame.chamferRoundCorners;
  u_chamferBlendFloor = frame.chamferBlendFloor;
  u_chamferBlendWall = frame.chamferBlendWall;
  u_chamferRough = frame.chamferRough;
  u_chamferFloor = frame.chamferFloor;
  u_chamferCeil = frame.chamferCeil;
  u_chamferWall = frame.chamferWall;
  u_chamferTrimFloor = frame.chamferTrimFloor;
  u_chamferTrimCeil = frame.chamferTrimCeil;
  u_chamferTrimWall = frame.chamferTrimWall;
  u_chamferTrimFloorAlt = frame.chamferTrimFloorAlt;
  u_chamferTrimCeilAlt = frame.chamferTrimCeilAlt;
  u_chamferCreviceEnd = frame.chamferCreviceEnd;
  u_chamferCreviceSmoothEnd = frame.chamferCreviceSmoothEnd;
  u_chamferTrimStart = frame.chamferTrimStart;
  u_chamferTrimMid = frame.chamferTrimMid;
  u_chamferTrimEnd = frame.chamferTrimEnd;
  u_chamferGridEnabled = frame.chamferGridEnabled;
  u_chamferGridFloorSize = frame.chamferGridFloorSize;
  u_chamferGridCeilSize = frame.chamferGridCeilSize;
  u_chamferGridFloorDarken = frame.chamferGridFloorDarken;
  u_chamferGridCeilDarken = frame.chamferGridCeilDarken;
  u_chamferGridFloorTrim = frame.chamferGridFloorTrim;
  u_chamferGridCeilTrim = frame.chamferGridCeilTrim;
  u_chamferGridFloorRough = frame.chamferGridFloorRough;
  u_chamferGridCeilRough = frame.chamferGridCeilRough;
  u_chamferGridFloorBlend = frame.chamferGridFloorBlend;
  u_chamferGridCeilBlend = frame.chamferGridCeilBlend;
  u_chamferGridCreviceEnd = frame.chamferGridCreviceEnd;
  u_chamferGridCreviceSmoothEnd = frame.chamferGridCreviceSmoothEnd;
  u_chamferGridTrimStart = frame.chamferGridTrimStart;
  u_chamferGridTrimMid = frame.chamferGridTrimMid;
  u_chamferGridTrimEnd = frame.chamferGridTrimEnd;
  u_cornerEnabled = frame.cornerEnabled;
  u_cornerRadius = frame.cornerRadius;
  u_cornerMode = frame.cornerMode;
  u_cornerInner = frame.cornerInner;
  u_cornerBandNear = frame.cornerBandNear;
  u_cornerBandFarExtra = frame.cornerBandFarExtra;
  u_cornerBandFarFactor = frame.cornerBandFarFactor;
  u_cornerSectorThresh = frame.cornerSectorThresh;
  u_cornerNormalMix = frame.cornerNormalMix;
  u_cornerAlbedoBoost = frame.cornerAlbedoBoost;
  u_cornerRoughMul = frame.cornerRoughMul;
  u_cornerAoMul = frame.cornerAoMul;
  u_shadowBiasN = frame.shadowBiasN;
  u_shadowBiasDir = frame.shadowBiasDir;
  u_shadowSunFactor = frame.shadowSunFactor;
  u_shadowPointFactor = frame.shadowPointFactor;
  u_shadowSunMax = frame.shadowSunMax;
  u_shadowPointEps = frame.shadowPointEps;
  u_shadowNormalThresh = frame.shadowNormalThresh;
  u_pbrEmissiveAlbedoMul = frame.pbrEmissiveAlbedoMul;
  u_pbrEmissiveStrength = frame.pbrEmissiveStrength;
  u_pbrF0 = frame.pbrF0;
  u_pbrAttenQuad = frame.pbrAttenQuad;
  u_pbrGGXEps = frame.pbrGGXEps;
  u_renderFloorMul = frame.renderFloorMul;
  u_renderCeilMul = frame.renderCeilMul;
  u_renderWallDarken = frame.renderWallDarken;
  u_renderEyeFactor = frame.renderEyeFactor;

  for (var i: i32 = 0; i < 8; i++) {
    let base = i * 5;
    u_lightPos[i] = lightData[base].xyz;
    u_lightIntensity[i] = lightData[base].w;
    u_lightColor[i] = lightData[base + 1].xyz;
    u_lightRadius[i] = lightData[base + 1].w;
    u_lightDir[i] = lightData[base + 2].xyz;
    u_lightType[i] = i32(lightData[base + 2].w);
    u_lightConeInner[i] = lightData[base + 3].x;
    u_lightConeOuter[i] = lightData[base + 3].y;
    u_lightPulseSpeed[i] = lightData[base + 3].z;
    u_lightPulseAmt[i] = lightData[base + 3].w;
    u_lightNoShadow[i] = i32(lightData[base + 4].x);
    u_lightFlickerSpeed[i] = lightData[base + 4].y;
    u_lightFlickerAmount[i] = lightData[base + 4].z;
    u_lightPhase[i] = lightData[base + 4].w;
  }
  u_numLights = lights.count;
  // lights.count overrides if needed
}

fn octaEncodeGN(n: vec3<f32>) -> vec2<f32> {
  var nn: vec3<f32> = n / (abs(n.x) + abs(n.y) + abs(n.z));
  var enc: vec2<f32> = nn.xy;
  if (nn.z < 0.0) {
    enc = (1.0 - abs(vec2<f32>(enc.y, enc.x))) * vec2<f32>(select(-1.0, 1.0, nn.x >= 0.0), select(-1.0, 1.0, nn.y >= 0.0));
  }
  return enc * 0.5 + 0.5;
}
`;

const wgslLibs = `
${wgslCommon}
${wgslMaterial}
${wgslPom}
${wgslRaymarch}
${wgslPbr}
${wgslChamfer}
${wgslGridChamfer}
${wgslFeatures}
${wgslScene}
`;

const extraBindingsForSSR = `
@group(3) @binding(0) var sceneTex: texture_2d<f32>;
@group(3) @binding(1) var gNormalDepthTex: texture_2d<f32>;
@group(3) @binding(2) var blueNoiseTex: texture_2d<f32>;
${wgslSSR}
`;

export const fsRaymarchWgsl = `
${structsAndBindings}
${wgslLibs}

struct FSOut {
  @location(0) color: vec4<f32>,
  @location(1) gbuffer: vec4<f32>,
};

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>, @builtin(position) fragPos: vec4<f32>) -> FSOut {
  initUniforms();
  let resolution: vec2<f32> = u_resolution;
  let fragCoord: vec2<f32> = vec2<f32>(v_uv.x * resolution.x, (1.0 - v_uv.y) * resolution.y + u_bobPixels);
  let cameraX: f32 = 2.0 * fragCoord.x / resolution.x - 1.0;
  let planeLen: f32 = tan(u_fov * 0.5);
  let rayDir: vec2<f32> = vec2<f32>(cos(u_playerAngle), sin(u_playerAngle));
  let plane: vec2<f32> = vec2<f32>(-rayDir.y, rayDir.x) * planeLen;
  let ray: vec2<f32> = rayDir + plane * cameraX;

  var mapPos: vec2<f32> = floor(u_playerPos);
  let deltaDist: vec2<f32> = vec2<f32>(abs(1.0 / ray.x), abs(1.0 / ray.y));
  var stepDir: vec2<i32> = vec2<i32>(select(-1, 1, ray.x >= 0.0), select(-1, 1, ray.y >= 0.0));
  var sideDist: vec2<f32>;
  if (ray.x < 0.0) { sideDist.x = (u_playerPos.x - mapPos.x) * deltaDist.x; } else { sideDist.x = (mapPos.x + 1.0 - u_playerPos.x) * deltaDist.x; }
  if (ray.y < 0.0) { sideDist.y = (u_playerPos.y - mapPos.y) * deltaDist.y; } else { sideDist.y = (mapPos.y + 1.0 - u_playerPos.y) * deltaDist.y; }

  var hit: i32 = 0;
  var side: i32 = 0;
  var perpDist: f32 = 0.0;
  var hitPos: vec2<f32> = vec2<f32>(0.0);
  var cellType: f32 = 0.0;
  var hitCell: vec2<i32> = vec2<i32>(0);
  var cornerNormal: vec3<f32> = vec3<f32>(0.0);
  var hasCornerRound: bool = false;
  let cornerRadius: f32 = clamp(u_cornerRadius, 0.02, 0.45);

  for (var i: i32 = 0; i < 64; i++) {
    if (sideDist.x < sideDist.y) { sideDist.x += deltaDist.x; mapPos.x += f32(stepDir.x); side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += f32(stepDir.y); side = 1; }
    if (mapPos.x < 0.0 || mapPos.y < 0.0 || mapPos.x >= u_mapSize.x || mapPos.y >= u_mapSize.y) { break; }
    let cell: vec2<i32> = vec2<i32>(i32(mapPos.x), i32(mapPos.y));
    let c: vec4<f32> = textureLoad(mapTex, cell, 0);
    cellType = c.r * 255.0;
    if (cellType > 0.5) {
      let wh = resolveWallHit(cell, side, stepDir, ray, cornerRadius, u_cornerEnabled, u_cornerInner);
      if (wh.hit) { hit = 1; hitCell = cell; perpDist = wh.t; hitPos = wh.hp; cornerNormal = vec3<f32>(wh.n.x, wh.n.y, 0.0); hasCornerRound = wh.rounded; break; }
    }
  }

  var finalColor: vec3<f32> = u_fogColor;
  let wc: f32 = select(1.0, u_wallCount, u_wallCount > 0.0);
  let fc: f32 = select(1.0, u_floorCount, u_floorCount > 0.0);
  let cc: f32 = select(1.0, u_ceilCount, u_ceilCount > 0.0);
  let eyeFactor: f32 = select(0.15, u_renderEyeFactor, u_renderEyeFactor >= 0.0);
  var gWallV_raw: f32 = 0.0;
  var resolvedNormal: vec3<f32> = vec3<f32>(0.0,0.0,1.0);
  var resolvedReflection: f32 = 0.0;

  if (hit == 1) {
    var floorH: f32 = 0.0; var ceilH: f32 = u_wallWorldHeight;
    let hitFeatureWord: u32 = loadFeatureCell(hitCell);
    var wallU: f32;
    if (side == 0) { wallU = hitPos.y - floor(hitPos.y); } else { wallU = hitPos.x - floor(hitPos.x); }
    if ((side == 0 && ray.x > 0.0) || (side == 1 && ray.y < 0.0)) { wallU = 1.0 - wallU; }
    if (u_authentic == 1) { wallU = floor(wallU * 64.0 * 65536.0) / 65536.0 / 64.0; }
    let insideChannelOpening: bool = abs(wallU - 0.5) <= featureUniforms.channel.x * 0.5;
    if (insideChannelOpening && isFeatureWallFace(hitFeatureWord, FEATURE_GRILLE, side, stepDir)) {
      floorH = -featureUniforms.channel.y + featureUniforms.channel.w;
    }
    let eyeZ: f32 = u_playerHeight;
    let wallH_full: f32 = resolution.y / max(perpDist, 0.0001) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
    let drawStart: f32 = resolution.y * u_horizon - (ceilH - eyeZ) * wallH_full;
    let drawEnd: f32 = resolution.y * u_horizon + (eyeZ - floorH) * wallH_full;
    let wallV_raw: f32 = (fragCoord.y - drawStart) / max(drawEnd - drawStart, 0.001);
    gWallV_raw = wallV_raw;
    if (wallV_raw < 0.0 || wallV_raw > 1.0) {
      let horizon: f32 = u_horizon; let vNorm: f32 = fragCoord.y / resolution.y;
      if (vNorm > horizon) {
        let projection: f32 = resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        let verticalSlope: f32 = max(0.0001, vNorm - horizon) / projection;
        let flatDistance: f32 = max(eyeZ / verticalSlope, 0.001);
        let floorHit: FeatureFloorRayHit = traceFeatureFloorSurface(u_playerPos, ray, eyeZ, flatDistance, verticalSlope, max(perpDist, flatDistance));
        var dist: f32 = floorHit.distance;
        let floorWorld: vec2<f32> = floorHit.worldXY;
        let floorH2: f32 = floorHit.height;
        let floorUV: vec2<f32> = fract(floorWorld);
        let matId: f32 = fetchFloorMatId(vec2<i32>(floor(floorWorld)));
        let shade = shadeFloorCell(floorWorld, floorUV, matId, fc, ray, eyeZ, floorH2);
        finalColor = shade.color; perpDist = dist; resolvedNormal = shade.normal; resolvedReflection = shade.reflectionWeight;
      } else {
        var dist: f32 = (u_wallWorldHeight - eyeZ) / max(0.0001, horizon - vNorm) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        dist = max(dist, 0.001);
        let ceilWorld: vec2<f32> = u_playerPos + ray * dist;
        let ceilUV: vec2<f32> = fract(ceilWorld);
        let matId: f32 = fetchCeilMatId(vec2<i32>(floor(ceilWorld)));
        let shade = shadeCeilCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, u_wallWorldHeight);
        finalColor = shade.color; perpDist = dist; resolvedNormal = shade.normal;
      }
    } else {
      let wallV: f32 = clamp(wallV_raw, 0.0, 1.0);
      let matId: f32 = max(1.0, cellType);
      finalColor = shadeWallCell(wallU, wallV, matId, wc, side, stepDir, ray, hitPos, hitCell, hasCornerRound, cornerNormal);
      if (hasCornerRound) { resolvedNormal = normalize(cornerNormal); }
      else if (side == 0) { resolvedNormal = vec3<f32>(f32(-stepDir.x),0.0,0.0); }
      else { resolvedNormal = vec3<f32>(0.0,f32(-stepDir.y),0.0); }
    }
  } else {
    let horizon: f32 = u_horizon; let vNorm2: f32 = 1.0 - v_uv.y;
    let pc: vec2<i32> = vec2<i32>(vec2<i32>(floor(u_playerPos)));
    var pfH: f32 = 0.0;
    if (pc.x >= 0 && pc.y >= 0 && pc.x < i32(u_mapSize.x) && pc.y < i32(u_mapSize.y)) {
      let pmd: vec4<f32> = textureLoad(mapTex, pc, 0);
      pfH = clamp(pmd.g - 0.5, -0.6, 0.6);
    }
    let eyeZ2: f32 = u_playerHeight;
    if (vNorm2 > horizon) {
      let projection: f32 = resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
      let verticalSlope: f32 = max(0.0001, vNorm2 - horizon) / projection;
      let flatDistance: f32 = max(eyeZ2 / verticalSlope, 0.001);
      let floorHit: FeatureFloorRayHit = traceFeatureFloorSurface(u_playerPos, ray, eyeZ2, flatDistance, verticalSlope, 100000.0);
      let floorH: f32 = floorHit.height;
      var dist: f32 = floorHit.distance;
      let floorWorld: vec2<f32> = floorHit.worldXY;
      let floorUV: vec2<f32> = fract(floorWorld);
      let matId: f32 = fetchFloorMatId(vec2<i32>(floor(floorWorld)));
      let shade = shadeFloorCell(floorWorld, floorUV, matId, fc, ray, eyeZ2, floorH);
      finalColor = shade.color; perpDist = dist; resolvedNormal = shade.normal; resolvedReflection = shade.reflectionWeight;
    } else {
      var ceilH: f32 = u_wallWorldHeight; var dist: f32 = 0.001; var ceilWorld: vec2<f32> = vec2<f32>(0.0);
      for (var it: i32 = 0; it < 3; it++) {
        dist = (ceilH - eyeZ2) / max(0.0001, horizon - vNorm2) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) { dist = 0.001; }
        ceilWorld = u_playerPos + ray * dist;
        let cc2: vec2<i32> = vec2<i32>(vec2<i32>(floor(ceilWorld)));
        if (cc2.x >= 0 && cc2.y >= 0 && cc2.x < i32(u_mapSize.x) && cc2.y < i32(u_mapSize.y)) {
          let cmd: vec4<f32> = textureLoad(mapTex, cc2, 0);
          let cellT: i32 = i32(cmd.r * 255.0 + 0.5);
          if (cellT == 0) { ceilH = clamp(cmd.b / 255.0 + 0.7, 0.4, 2.2); } else { break; }
        }
      }
      let ceilUV: vec2<f32> = fract(ceilWorld);
      let matId: f32 = fetchCeilMatId(vec2<i32>(floor(ceilWorld)));
      let shade = shadeCeilCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ2, ceilH);
      finalColor = shade.color; perpDist = dist; resolvedNormal = shade.normal;
    }
  }

  let fogEn: f32 = f32(u_fogEnabled);
  let fog: f32 = 1.0 / (1.0 + perpDist * u_fogBase + perpDist * perpDist * u_fogSquared);
  let fogged: vec3<f32> = finalColor * fog + u_fogColor * (1.0 - fog);
  finalColor = mix(finalColor, fogged, fogEn);

  var maxC: f32 = max(max(finalColor.r, finalColor.g), finalColor.b);
  let overCond: f32 = step(1.0, maxC);
  let over: f32 = clamp((maxC - 1.0) * 0.35, 0.0, 0.75) * overCond;
  var scaled: vec3<f32> = finalColor / max(maxC, 0.0001);
  let warmWhite: vec3<f32> = vec3<f32>(1.0, 0.94, 0.82);
  var tonemapped: vec3<f32> = mix(scaled, warmWhite, over);
  finalColor = mix(finalColor, tonemapped, overCond);
  finalColor = clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0));

  let authEn: f32 = f32(u_authentic);
  let bands: i32 = max(8, u_bandLevels);
  let quantized: vec3<f32> = floor(finalColor * f32(bands)) / f32(bands);
  finalColor = mix(finalColor, quantized, authEn);

  var out: FSOut;
  out.color = vec4<f32>(finalColor, 1.0);

  // GBuffer now receives the exact resolved surface instead of reconstructing
  // a flat floor and a second, divergent puddle mask after shading.
  let enc: vec2<f32> = octaEncodeGN(normalize(resolvedNormal));
  let depthNorm: f32 = clamp(perpDist / max(0.001, u_ssrDepthRange), 0.0, 1.0);
  out.gbuffer = vec4<f32>(enc.x, enc.y, depthNorm, clamp(resolvedReflection, 0.0, 1.0));
  return out;
}
`;

// SSR – full raymarch ported from WebGL2 fsSSR (632b7f2) – uses layout [frame, samplers, ssrTextures] = groups 0,1,2
export const fsSSRwgsl = `
struct FrameUniforms {
  resolution: vec2<f32>,
  playerPos: vec2<f32>,
  playerAngle: f32,
  fov: f32,
  playerHeight: f32,
  bobPixels: f32,
  mapSize: vec2<f32>,
  time: f32,
  wallCount: f32,
  floorCount: f32,
  ceilCount: f32,
  ssrDepthRange: f32,
  authentic: i32,
  bandLevels: i32,
  gridDebug: i32,
  lightingEnabled: i32,
  pbrEnabled: i32,
  pomEnabled: i32,
  pbrDebugMode: i32,
  fogEnabled: i32,
  modifiersEnabled: i32,
  numLights: i32,
  _pad0: i32,
  ambientColor: vec3<f32>,
  _padAC: f32,
  ambientLevel: f32,
  worldAmbientMul: f32,
  sunDir: vec2<f32>,
  sunDirZ: f32,
  sunIntensity: f32,
  sunColor: vec3<f32>,
  _padSC: f32,
  fogBase: f32,
  fogSquared: f32,
  fogColor: vec3<f32>,
  _padFC: f32,
  pomWall: f32,
  pomFloor: f32,
  pomCeil: f32,
  pomSteps: i32,
  pomMaxOffset: f32,
  pomMinVz: f32,
  pomMinEffVz: f32,
  pomFadeStart: f32,
  pomFadeEnd: f32,
  aoSun: f32,
  aoPoint: f32,
  aoAmbient: f32,
  _padAO: f32,
  chamferEnabled: i32,
  chamferFloorSize: f32,
  chamferCeilSize: f32,
  chamferWallSize: f32,
  chamferCornerRadius: f32,
  chamferDarken: f32,
  chamferRoundCorners: i32,
  chamferBlendFloor: f32,
  chamferBlendWall: f32,
  chamferRough: f32,
  chamferFloor: f32,
  chamferCeil: f32,
  chamferWall: f32,
  chamferTrimFloor: f32,
  chamferTrimCeil: f32,
  chamferTrimWall: f32,
  chamferTrimFloorAlt: f32,
  chamferTrimCeilAlt: f32,
  chamferCreviceEnd: f32,
  chamferCreviceSmoothEnd: f32,
  chamferTrimStart: f32,
  chamferTrimMid: f32,
  chamferTrimEnd: f32,
  chamferGridEnabled: i32,
  chamferGridFloorSize: f32,
  chamferGridCeilSize: f32,
  chamferGridFloorDarken: f32,
  chamferGridCeilDarken: f32,
  chamferGridFloorTrim: f32,
  chamferGridCeilTrim: f32,
  chamferGridFloorRough: f32,
  chamferGridCeilRough: f32,
  chamferGridFloorBlend: f32,
  chamferGridCeilBlend: f32,
  chamferGridCreviceEnd: f32,
  chamferGridCreviceSmoothEnd: f32,
  chamferGridTrimStart: f32,
  chamferGridTrimMid: f32,
  chamferGridTrimEnd: f32,
  cornerEnabled: i32,
  cornerRadius: f32,
  cornerMode: i32,
  cornerInner: i32,
  cornerBandNear: f32,
  cornerBandFarExtra: f32,
  cornerBandFarFactor: f32,
  cornerSectorThresh: f32,
  cornerNormalMix: f32,
  cornerAlbedoBoost: f32,
  cornerRoughMul: f32,
  cornerAoMul: f32,
  shadowBiasN: f32,
  shadowBiasDir: f32,
  shadowSunFactor: f32,
  shadowPointFactor: f32,
  shadowSunMax: f32,
  shadowPointEps: f32,
  shadowNormalThresh: f32,
  pbrEmissiveAlbedoMul: f32,
  pbrEmissiveStrength: f32,
  pbrF0: f32,
  pbrAttenQuad: f32,
  pbrGGXEps: f32,
  renderFloorMul: f32,
  renderCeilMul: f32,
  renderWallDarken: f32,
  renderEyeFactor: f32,
  ssrDebugMode: i32,
  ssrSteps: i32,
  ssrBinarySteps: i32,
  ssrMaxDistance: f32,
  ssrThickness: f32,
  ssrStride: f32,
  ssrJitter: f32,
  ssrDepthBias: f32,
  ssrZThicknessScale: f32,
  ssrMinPuddleMask: f32,
  ssrNormalThreshold: f32,
  ssrMaxGrazingAngle: f32,
  ssrEdgeFadeStart: f32,
  ssrEdgeFadeEnd: f32,
  ssrDistanceFadeStart: f32,
  ssrDistanceFadeEnd: f32,
  ssrFresnelPower: f32,
  ssrFresnelMin: f32,
  ssrFresnelMax: f32,
  ssrBlendStrength: f32,
  ssrPuddleMaskInfluence: f32,
  ssrTintStrength: f32,
  ssrAdditiveBoost: f32,
  ssrTint: vec3<f32>,
  _padTint: f32,
  horizon: f32,
  wallWorldHeight: f32,
};

@group(0) @binding(3) var<uniform> frame: FrameUniforms;
@group(1) @binding(0) var nearestSampler: sampler;
@group(1) @binding(1) var linearSampler: sampler;
@group(2) @binding(0) var sceneTex: texture_2d<f32>;
@group(2) @binding(1) var gNormalDepthTex: texture_2d<f32>;
@group(2) @binding(2) var blueNoiseTex: texture_2d<f32>;

fn octaDecodeSSR(enc: vec2<f32>) -> vec3<f32> {
  let f: vec2<f32> = enc * 2.0 - 1.0;
  var n: vec3<f32> = vec3<f32>(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  let t: f32 = max(0.0, -n.z);
  n.x = n.x + select(t, -t, n.x >= 0.0);
  n.y = n.y + select(t, -t, n.y >= 0.0);
  return normalize(n);
}

fn worldToScreenUVSSR_Full(worldPos: vec3<f32>, camPos: vec2<f32>, eyeZ: f32, playerAngle: f32, planeLen: f32, resolution: vec2<f32>, bobPixels: f32) -> vec3<f32> {
  let dx: f32 = worldPos.x - camPos.x;
  let dy: f32 = worldPos.y - camPos.y;
  let dirX: f32 = cos(playerAngle);
  let dirY: f32 = sin(playerAngle);
  let rightX: f32 = -dirY;
  let rightY: f32 = dirX;
  var forwardDist: f32 = dx * dirX + dy * dirY;
  let rightDist: f32 = dx * rightX + dy * rightY;
  if (forwardDist < 0.20) { forwardDist = 0.20; }
  let cameraX: f32 = rightDist / forwardDist / max(0.0001, planeLen);
  let uvX: f32 = cameraX * 0.5 + 0.5;
  let fovFactor: f32 = 1.0 / max(0.0001, planeLen);
  let aspect: f32 = resolution.x / max(1.0, resolution.y);
  let yShift: f32 = (eyeZ - worldPos.z) / forwardDist * fovFactor * 0.5 * aspect;
  let uvY_noBob: f32 = frame.horizon - yShift;
  let uvY: f32 = uvY_noBob + bobPixels / max(1.0, resolution.y);
  return vec3<f32>(uvX, uvY, forwardDist);
}

struct SSRResult_Full {
  color: vec3<f32>,
  hit: f32,
  fade: f32,
  rayLength: f32,
  hitUV: vec2<f32>,
};

fn traceScreenSpaceRaySSR_Full(startUV: vec2<f32>, N: vec3<f32>, V: vec3<f32>, linearDepth: f32, startHeight: f32, puddleMask: f32, roughness: f32, resolution: vec2<f32>, steps: i32, binarySteps: i32, maxDistance: f32, thickness: f32, stride: f32, jitter: f32, depthBias: f32, zThicknessScale: f32, camPos: vec2<f32>, eyeZ: f32, playerAngle: f32, planeLen: f32, bobPixels: f32) -> SSRResult_Full {
  var res: SSRResult_Full;
  res.color = vec3<f32>(0.0, 0.0, 0.0);
  res.hit = 0.0; res.fade = 0.0; res.rayLength = 0.0; res.hitUV = startUV;
  var R: vec3<f32> = reflect(-V, N);
  let effectiveJitter: f32 = jitter * clamp(roughness * 4.0, 0.0, 1.0);
  if (abs(R.z) < 0.001) { R.z = 0.001; }
  if (dot(R, vec3<f32>(0.0, 0.0, 1.0)) < -0.999) { return res; }

  let fragCoord: vec2<f32> = vec2<f32>(startUV.x * resolution.x, (1.0 - startUV.y) * resolution.y);
  let cameraX0: f32 = 2.0 * fragCoord.x / resolution.x - 1.0;
  let rayDir0: vec2<f32> = vec2<f32>(cos(playerAngle), sin(playerAngle));
  let plane0: vec2<f32> = vec2<f32>(-rayDir0.y, rayDir0.x) * planeLen;
  let ray0: vec2<f32> = rayDir0 + plane0 * cameraX0;
  let worldPos: vec3<f32> = vec3<f32>(camPos + ray0 * linearDepth, startHeight);

  var noise: f32 = 0.0;
  if (effectiveJitter > 0.001) {
    let noiseUV: vec2<f32> = fract(startUV * resolution / 64.0);
    noise = textureSampleLevel(blueNoiseTex, nearestSampler, noiseUV, 0.0).r * 2.0 - 1.0;
  }
  var tRay: f32 = depthBias + abs(noise) * effectiveJitter * 0.08;
  var tStep: f32 = 0.12;

  for (var i: i32 = 0; i < 64; i++) {
    if (i >= steps) { break; }
    if (tRay > maxDistance) { break; }
    let reflectedWorld: vec3<f32> = worldPos + R * tRay;
    let proj: vec3<f32> = worldToScreenUVSSR_Full(reflectedWorld, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
    let uv: vec2<f32> = proj.xy;
    let fwDist: f32 = proj.z;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { tRay += tStep; tStep = tStep * stride; continue; }
    // Flip Y for WebGPU top-left sampling. worldToScreenUVSSR already includes bob, so no extra term.
    let uvFlip: vec2<f32> = vec2<f32>(uv.x, 1.0 - uv.y);
    let gSmpl: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, uvFlip, 0.0);
    let sampledDepthNorm: f32 = gSmpl.b;
    if (sampledDepthNorm < 0.001) { tRay += tStep; tStep = tStep * stride; continue; }
    let sampledN: vec3<f32> = octaDecodeSSR(gSmpl.rg);
    // Reject floor re-hit only – keep walls and ceiling (fix from 48e9608, d557895). 0.60 strict like WebGL2.
    if (sampledN.z > 0.60) { tRay += tStep; tStep = tStep * stride; continue; }
    let sampledLin: f32 = sampledDepthNorm * frame.ssrDepthRange;
    let depthDiff: f32 = fwDist - sampledLin;
    let curThickness: f32 = thickness + tRay * zThicknessScale * 0.08;
    // A hit is a front-to-back depth crossing. Thickness only limits how far
    // a march step may overshoot; accepting the whole +/- slab made adjacent
    // water rows snap to unrelated wall UVs while still producing a solid mask.
    if (depthDiff >= 0.0 && depthDiff < curThickness) {
      res.hit = 1.0; res.hitUV = uv; res.color = textureSampleLevel(sceneTex, nearestSampler, uvFlip, 0.0).rgb; res.rayLength = tRay;
      // tStep has already been multiplied by stride since the previous sample.
      // Recover the actual previous ray position instead of over-extending the
      // binary-search bracket into unrelated screen geometry.
      var lowT: f32 = max(0.0, tRay - tStep / max(stride, 0.0001)); var highT: f32 = tRay;
      for (var b: i32 = 0; b < 8; b++) {
        if (b >= binarySteps) { break; }
        let midT: f32 = mix(lowT, highT, 0.5);
        let midW: vec3<f32> = worldPos + R * midT;
        let midProj: vec3<f32> = worldToScreenUVSSR_Full(midW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
        let midUVFlip: vec2<f32> = vec2<f32>(midProj.x, 1.0 - midProj.y);
        let midG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, midUVFlip, 0.0);
        let midDepthNorm: f32 = midG.b;
        if (midDepthNorm < 0.001) { lowT = midT; continue; }
        let midN: vec3<f32> = octaDecodeSSR(midG.rg);
        if (midN.z > 0.60) { lowT = midT; continue; }
        let midLin: f32 = midDepthNorm * frame.ssrDepthRange;
        let midDiff: f32 = midProj.z - midLin;
        if (midDiff >= 0.0) { highT = midT; } else { lowT = midT; }
      }
      let finalW: vec3<f32> = worldPos + R * highT;
      let finalProj: vec3<f32> = worldToScreenUVSSR_Full(finalW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
      let finalUVFlip: vec2<f32> = vec2<f32>(finalProj.x, 1.0 - finalProj.y);
      let finalG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, finalUVFlip, 0.0);
      let finalN: vec3<f32> = octaDecodeSSR(finalG.rg);
      // Final must not be floor – rely on normal only, no uv.y threshold (fix 48e9608)
      if (finalG.b > 0.001 && finalN.z <= 0.60) {
        res.hitUV = finalProj.xy;
        res.color = textureSampleLevel(sceneTex, nearestSampler, finalUVFlip, 0.0).rgb;
        res.rayLength = highT;
      } else {
        res.hit = 0.0;
      }
      if (res.hit > 0.5) { break; }
    }
    tRay += tStep;
    tStep = tStep * stride;
  }

  // Fallback � fixed: no clamp, edge margin to avoid stretch columns
  if (res.hit < 0.5 && puddleMask > 0.02) {
    let fallbackW: vec3<f32> = worldPos + R * (maxDistance * 0.85);
    let fProj: vec3<f32> = worldToScreenUVSSR_Full(fallbackW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
    let fUV: vec2<f32> = fProj.xy;
    if (fUV.x >= 0.05 && fUV.x <= 0.95 && fUV.y >= 0.10 && fUV.y <= 0.90) {
      let fUVFlip: vec2<f32> = vec2<f32>(fUV.x, 1.0 - fUV.y);
      let fG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, fUVFlip, 0.0);
      let fN: vec3<f32> = octaDecodeSSR(fG.rg);
      if (fG.b > 0.001 && fN.z <= 0.60) {
        res.color = textureSampleLevel(sceneTex, nearestSampler, fUVFlip, 0.0).rgb * 0.7;
        res.hit = 0.5;
        res.hitUV = fUV;
        res.rayLength = maxDistance * 0.85;
      }
    }
  }
  return res;
}

struct SSRFSOut {
  @location(0) color: vec4<f32>,
};

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> SSRFSOut {
  let resolution: vec2<f32> = frame.resolution;
  // WebGPU top-left vs GL bottom-left: flip Y only. GBuffer already bobbed at same pixel.
  let v_uv_flip: vec2<f32> = vec2<f32>(v_uv.x, 1.0 - v_uv.y);
  let g: vec4<f32> = textureSample(gNormalDepthTex, nearestSampler, v_uv_flip);
  let depthNorm: f32 = g.b;
  let puddleMask: f32 = g.a;
  let enc: vec2<f32> = g.rg;
  let N: vec3<f32> = octaDecodeSSR(enc);

  var out: SSRFSOut;

  // gating thresholds from ssr.json � live-editable via frame uniform
  let minPuddleMask: f32 = frame.ssrMinPuddleMask;
  let normalThreshold: f32 = frame.ssrNormalThreshold;
  let maxGrazingAngle: f32 = frame.ssrMaxGrazingAngle;

  // debug modes
  if (frame.ssrDebugMode == 1) {
    let edge: f32 = puddleMask * (1.0 - puddleMask) * 5.0;
    var inside: vec3<f32> = vec3<f32>(0.10, 0.55, 1.0) * puddleMask * 1.8;
    var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.25, 0.85) * edge;
    var col: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03) + inside + edgeCol;
    if (puddleMask > 0.5) { col = mix(col, vec3<f32>(0.20, 0.75, 1.0), 0.6); }
    out.color = vec4<f32>(col, 1.0); return out;
  } else if (frame.ssrDebugMode == 2) {
    out.color = vec4<f32>(vec3<f32>(pow(clamp(depthNorm, 0.0, 1.0), 0.55)), 1.0); return out;
  } else if (frame.ssrDebugMode == 3) {
    out.color = vec4<f32>(N * 0.5 + 0.5, 1.0); return out;
  }

  if (puddleMask < minPuddleMask) { out.color = vec4<f32>(0.0); return out; }
  if (N.z < normalThreshold) { out.color = vec4<f32>(0.0); return out; }

  let fragCoord: vec2<f32> = vec2<f32>(v_uv.x * resolution.x, (1.0 - v_uv.y) * resolution.y);
  let cameraX: f32 = 2.0 * fragCoord.x / resolution.x - 1.0;
  let planeLen: f32 = tan(frame.fov * 0.5);
  let rayDir: vec2<f32> = vec2<f32>(cos(frame.playerAngle), sin(frame.playerAngle));
  let plane: vec2<f32> = vec2<f32>(-rayDir.y, rayDir.x) * planeLen;
  let ray: vec2<f32> = rayDir + plane * cameraX;
  let linearDepth: f32 = depthNorm * frame.ssrDepthRange;
  // Reconstruct the actual source height from the same projection used by the
  // raymarch pass. Reflective structural water is recessed and cannot assume z=0.
  let sourceVNorm: f32 = fragCoord.y / resolution.y + frame.bobPixels / max(1.0, resolution.y);
  let projectionScale: f32 = resolution.x / resolution.y * 0.5 / max(tan(frame.fov * 0.5), 0.0001);
  let sourceHeight: f32 = frame.playerHeight - linearDepth * (sourceVNorm - frame.horizon) / projectionScale;
  let worldPos: vec3<f32> = vec3<f32>(frame.playerPos + ray * linearDepth, sourceHeight);
  let eyePos: vec3<f32> = vec3<f32>(frame.playerPos, frame.playerHeight);
  let V: vec3<f32> = normalize(eyePos - worldPos);
  let NdotV: f32 = clamp(dot(N, V), 0.0, 1.0);
  if (NdotV < (1.0 - maxGrazingAngle)) { out.color = vec4<f32>(0.0); return out; }

  // Live-editable from ssr.json via frame uniform (fix for hardcoded regression)
  let steps: i32 = frame.ssrSteps;
  let binarySteps: i32 = frame.ssrBinarySteps;
  let maxDistance: f32 = frame.ssrMaxDistance;
  let thickness: f32 = frame.ssrThickness;
  let stride: f32 = frame.ssrStride;
  let jitter: f32 = frame.ssrJitter;
  let depthBias: f32 = frame.ssrDepthBias;
  let zThicknessScale: f32 = frame.ssrZThicknessScale;

  // Preserve the established cosmetic-puddle SSR response. Structural water
  // owns its PBR roughness in the surface pass; this controls SSR ray jitter.
  let reflectionRoughness: f32 = 0.04;
  let r: SSRResult_Full = traceScreenSpaceRaySSR_Full(v_uv, N, V, linearDepth, sourceHeight, puddleMask, reflectionRoughness, resolution, steps, binarySteps, maxDistance, thickness, stride, jitter, depthBias, zThicknessScale, frame.playerPos, frame.playerHeight, frame.playerAngle, planeLen, frame.bobPixels);

  let edgeFadeStart: f32 = frame.ssrEdgeFadeStart; let edgeFadeEnd: f32 = frame.ssrEdgeFadeEnd;
  let distFadeStart: f32 = frame.ssrDistanceFadeStart; let distFadeEnd: f32 = frame.ssrDistanceFadeEnd;
  let fresnelPower: f32 = frame.ssrFresnelPower; let fresnelMin: f32 = frame.ssrFresnelMin; let fresnelMax: f32 = frame.ssrFresnelMax;

  let edgeFade: f32 = 1.0 - smoothstep(edgeFadeStart, edgeFadeEnd, max(abs(r.hitUV.x - 0.5), abs(r.hitUV.y - 0.5)) * 2.0);
  let distFade: f32 = 1.0 - smoothstep(distFadeStart, distFadeEnd, r.rayLength);
  let fresnel: f32 = fresnelMin + (fresnelMax - fresnelMin) * pow(1.0 - NdotV, fresnelPower);
  let fade: f32 = edgeFade * distFade * fresnel * r.hit * puddleMask;

  if (frame.ssrDebugMode == 4) { out.color = vec4<f32>(r.hitUV, 0.0, 1.0); return out; }
  else if (frame.ssrDebugMode == 5) { out.color = vec4<f32>(vec3<f32>(r.hit), 1.0); return out; }
  else if (frame.ssrDebugMode == 6) { out.color = vec4<f32>(vec3<f32>(NdotV), 1.0); return out; }
  else if (frame.ssrDebugMode == 7 || frame.ssrDebugMode == 8) { out.color = vec4<f32>(r.color, 1.0); return out; }

  out.color = vec4<f32>(r.color, fade);
  return out;
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(pos[vid], 0.0, 1.0);
}
`;

export const fsCompositeWgsl = `
struct CompOut {
  @location(0) color: vec4<f32>,
};
struct FrameUniforms {
  resolution: vec2<f32>, playerPos: vec2<f32>, playerAngle: f32, fov: f32, playerHeight: f32, bobPixels: f32,
  mapSize: vec2<f32>, time: f32, wallCount: f32, floorCount: f32, ceilCount: f32, ssrDepthRange: f32,
  authentic: i32, bandLevels: i32, gridDebug: i32, lightingEnabled: i32, pbrEnabled: i32, pomEnabled: i32, pbrDebugMode: i32,
  fogEnabled: i32, modifiersEnabled: i32, numLights: i32, _pad0: i32,
  ambientColor: vec3<f32>, _padAC: f32, ambientLevel: f32, worldAmbientMul: f32, sunDir: vec2<f32>, sunDirZ: f32, sunIntensity: f32,
  sunColor: vec3<f32>, _padSC: f32, fogBase: f32, fogSquared: f32, fogColor: vec3<f32>, _padFC: f32,
  pomWall: f32, pomFloor: f32, pomCeil: f32, pomSteps: i32, pomMaxOffset: f32, pomMinVz: f32, pomMinEffVz: f32, pomFadeStart: f32, pomFadeEnd: f32,
  aoSun: f32, aoPoint: f32, aoAmbient: f32, _padAO: f32,
  chamferEnabled: i32, chamferFloorSize: f32, chamferCeilSize: f32, chamferWallSize: f32, chamferCornerRadius: f32, chamferDarken: f32, chamferRoundCorners: i32,
  chamferBlendFloor: f32, chamferBlendWall: f32, chamferRough: f32, chamferFloor: f32, chamferCeil: f32, chamferWall: f32,
  chamferTrimFloor: f32, chamferTrimCeil: f32, chamferTrimWall: f32, chamferTrimFloorAlt: f32, chamferTrimCeilAlt: f32, chamferCreviceEnd: f32, chamferCreviceSmoothEnd: f32, chamferTrimStart: f32, chamferTrimMid: f32, chamferTrimEnd: f32,
  chamferGridEnabled: i32, chamferGridFloorSize: f32, chamferGridCeilSize: f32, chamferGridFloorDarken: f32, chamferGridCeilDarken: f32, chamferGridFloorTrim: f32, chamferGridCeilTrim: f32, chamferGridFloorRough: f32, chamferGridCeilRough: f32, chamferGridFloorBlend: f32, chamferGridCeilBlend: f32, chamferGridCreviceEnd: f32, chamferGridCreviceSmoothEnd: f32, chamferGridTrimStart: f32, chamferGridTrimMid: f32, chamferGridTrimEnd: f32,
  cornerEnabled: i32, cornerRadius: f32, cornerMode: i32, cornerInner: i32, cornerBandNear: f32, cornerBandFarExtra: f32, cornerBandFarFactor: f32, cornerSectorThresh: f32, cornerNormalMix: f32, cornerAlbedoBoost: f32, cornerRoughMul: f32, cornerAoMul: f32,
  shadowBiasN: f32, shadowBiasDir: f32, shadowSunFactor: f32, shadowPointFactor: f32, shadowSunMax: f32, shadowPointEps: f32, shadowNormalThresh: f32,
  pbrEmissiveAlbedoMul: f32, pbrEmissiveStrength: f32, pbrF0: f32, pbrAttenQuad: f32, pbrGGXEps: f32, renderFloorMul: f32, renderCeilMul: f32, renderWallDarken: f32, renderEyeFactor: f32, ssrDebugMode: i32, ssrSteps: i32, ssrBinarySteps: i32, ssrMaxDistance: f32, ssrThickness: f32, ssrStride: f32, ssrJitter: f32, ssrDepthBias: f32, ssrZThicknessScale: f32, ssrMinPuddleMask: f32, ssrNormalThreshold: f32, ssrMaxGrazingAngle: f32, ssrEdgeFadeStart: f32, ssrEdgeFadeEnd: f32, ssrDistanceFadeStart: f32, ssrDistanceFadeEnd: f32, ssrFresnelPower: f32, ssrFresnelMin: f32, ssrFresnelMax: f32, ssrBlendStrength: f32, ssrPuddleMaskInfluence: f32, ssrTintStrength: f32, ssrAdditiveBoost: f32, ssrTint: vec3<f32>, _padTint: f32, horizon: f32, wallWorldHeight: f32,
};
@group(0) @binding(3) var<uniform> frame: FrameUniforms;
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var ssrTex: texture_2d<f32>;
@group(1) @binding(2) var gNormalDepthTex: texture_2d<f32>;
@group(2) @binding(0) var nearestSampler: sampler;

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> CompOut {
  let uvFlip: vec2<f32> = vec2<f32>(v_uv.x, 1.0 - v_uv.y);
  let baseCol: vec4<f32> = textureSample(sceneTex, nearestSampler, uvFlip);
  let refl: vec4<f32> = textureSample(ssrTex, nearestSampler, uvFlip);
  let g: vec4<f32> = textureSample(gNormalDepthTex, nearestSampler, uvFlip);
  let puddleMask: f32 = g.a;

  // Live-editable from ssr.json via frame uniform
  let minPuddleMask: f32 = frame.ssrMinPuddleMask;
  let puddleMaskInfluence: f32 = frame.ssrPuddleMaskInfluence;
  let tintStrength: f32 = frame.ssrTintStrength;
  let blendStrength: f32 = frame.ssrBlendStrength;
  let additiveBoost: f32 = frame.ssrAdditiveBoost;
  let tint: vec3<f32> = frame.ssrTint;

  // DEBUG BRANCH: restore WebGL2 behavior – when ssrDebugMode 1..8, bypass puddle gating and output refl directly
  // This is what makes O give pure visualizations instead of overlay
  if (frame.ssrDebugMode != 0) {
    // For modes 1..8, old composite did: outColor = vec4(reflection,1.0) ignoring base and fade
    // reflection here is refl.rgb already containing debug viz from fsSSR (PuddleMask, Depth, Normal, etc.)
    var outDbg: CompOut;
    outDbg.color = vec4<f32>(refl.rgb, 1.0);
    return outDbg;
  }

  var fade: f32 = refl.a;
  if (puddleMask < minPuddleMask) {
    var outNoSSR: CompOut;
    outNoSSR.color = vec4<f32>(baseCol.rgb, baseCol.a);
    return outNoSSR;
  }
  fade = fade * mix(1.0, puddleMask, puddleMaskInfluence);
  var reflection: vec3<f32> = refl.rgb;
  reflection = mix(reflection, reflection * tint * 2.0, tintStrength);
  let lum: f32 = dot(reflection, vec3<f32>(0.299, 0.587, 0.114));
  reflection = reflection + vec3<f32>(lum * additiveBoost);
  let composite: vec3<f32> = mix(baseCol.rgb, reflection, clamp(fade * blendStrength, 0.0, 1.0));

  var out: CompOut;
  out.color = vec4<f32>(composite, baseCol.a);
  return out;
}
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(pos[vid], 0.0, 1.0);
}
`;

export const fsQuantizeWgsl = `
struct FrameUniforms {
  resolution: vec2<f32>, playerPos: vec2<f32>, playerAngle: f32, fov: f32, playerHeight: f32, bobPixels: f32,
  mapSize: vec2<f32>, time: f32, wallCount: f32, floorCount: f32, ceilCount: f32, ssrDepthRange: f32,
  authentic: i32, bandLevels: i32, gridDebug: i32, lightingEnabled: i32, pbrEnabled: i32, pomEnabled: i32, pbrDebugMode: i32,
  fogEnabled: i32, modifiersEnabled: i32, numLights: i32, _pad0: i32,
  ambientColor: vec3<f32>, _padAC: f32, ambientLevel: f32, worldAmbientMul: f32, sunDir: vec2<f32>, sunDirZ: f32, sunIntensity: f32,
  sunColor: vec3<f32>, _padSC: f32, fogBase: f32, fogSquared: f32, fogColor: vec3<f32>, _padFC: f32,
  pomWall: f32, pomFloor: f32, pomCeil: f32, pomSteps: i32, pomMaxOffset: f32, pomMinVz: f32, pomMinEffVz: f32, pomFadeStart: f32, pomFadeEnd: f32,
  aoSun: f32, aoPoint: f32, aoAmbient: f32, _padAO: f32,
  chamferEnabled: i32, chamferFloorSize: f32, chamferCeilSize: f32, chamferWallSize: f32, chamferCornerRadius: f32, chamferDarken: f32, chamferRoundCorners: i32,
  chamferBlendFloor: f32, chamferBlendWall: f32, chamferRough: f32, chamferFloor: f32, chamferCeil: f32, chamferWall: f32,
  chamferTrimFloor: f32, chamferTrimCeil: f32, chamferTrimWall: f32, chamferTrimFloorAlt: f32, chamferTrimCeilAlt: f32, chamferCreviceEnd: f32, chamferCreviceSmoothEnd: f32, chamferTrimStart: f32, chamferTrimMid: f32, chamferTrimEnd: f32,
  chamferGridEnabled: i32, chamferGridFloorSize: f32, chamferGridCeilSize: f32, chamferGridFloorDarken: f32, chamferGridCeilDarken: f32, chamferGridFloorTrim: f32, chamferGridCeilTrim: f32, chamferGridFloorRough: f32, chamferGridCeilRough: f32, chamferGridFloorBlend: f32, chamferGridCeilBlend: f32, chamferGridCreviceEnd: f32, chamferGridCreviceSmoothEnd: f32, chamferGridTrimStart: f32, chamferGridTrimMid: f32, chamferGridTrimEnd: f32,
  cornerEnabled: i32, cornerRadius: f32, cornerMode: i32, cornerInner: i32, cornerBandNear: f32, cornerBandFarExtra: f32, cornerBandFarFactor: f32, cornerSectorThresh: f32, cornerNormalMix: f32, cornerAlbedoBoost: f32, cornerRoughMul: f32, cornerAoMul: f32,
  shadowBiasN: f32, shadowBiasDir: f32, shadowSunFactor: f32, shadowPointFactor: f32, shadowSunMax: f32, shadowPointEps: f32, shadowNormalThresh: f32,
  pbrEmissiveAlbedoMul: f32, pbrEmissiveStrength: f32, pbrF0: f32, pbrAttenQuad: f32, pbrGGXEps: f32, renderFloorMul: f32, renderCeilMul: f32, renderWallDarken: f32, renderEyeFactor: f32, ssrDebugMode: i32, ssrSteps: i32, ssrBinarySteps: i32, ssrMaxDistance: f32, ssrThickness: f32, ssrStride: f32, ssrJitter: f32, ssrDepthBias: f32, ssrZThicknessScale: f32, ssrMinPuddleMask: f32, ssrNormalThreshold: f32, ssrMaxGrazingAngle: f32, ssrEdgeFadeStart: f32, ssrEdgeFadeEnd: f32, ssrDistanceFadeStart: f32, ssrDistanceFadeEnd: f32, ssrFresnelPower: f32, ssrFresnelMin: f32, ssrFresnelMax: f32, ssrBlendStrength: f32, ssrPuddleMaskInfluence: f32, ssrTintStrength: f32, ssrAdditiveBoost: f32, ssrTint: vec3<f32>, _padTint: f32, horizon: f32, wallWorldHeight: f32,
};
struct QuantOut { @location(0) color: vec4<f32>, };
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var paletteTex: texture_2d<f32>;
@group(1) @binding(2) var lutTex: texture_2d<f32>;
@group(2) @binding(0) var nearestSampler: sampler;
@group(0) @binding(3) var<uniform> frame: FrameUniforms;

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> QuantOut {
  let uvFlip: vec2<f32> = vec2<f32>(v_uv.x, 1.0 - v_uv.y);
  var sc: vec4<f32> = textureSample(sceneTex, nearestSampler, uvFlip);
  // Restore WebGL2 parity: bypass palette quant when either PBR debug OR SSR debug active
  // Old quant shader checked pbrDebugMode !=0 ; old renderer also forced authentic=0 for SSR debug path.
  if (frame.authentic == 0 || frame.pbrDebugMode != 0 || frame.ssrDebugMode != 0) {
    var out: QuantOut; out.color = sc; return out;
  }
  let lutCoord: vec2<i32> = vec2<i32>(i32(sc.r * 31.99) + i32(sc.g * 31.99) * 32, i32(sc.b * 31.99));
  let lutSample: vec4<f32> = textureLoad(lutTex, lutCoord, 0);
  let palIdx: f32 = lutSample.r;
  let palCol: vec3<f32> = textureSample(paletteTex, nearestSampler, vec2<f32>(palIdx + 0.5/256.0, 0.5)).rgb;
  var out: QuantOut; out.color = vec4<f32>(palCol, sc.a); return out;
}
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(pos[vid], 0.0, 1.0);
}
`;

export const vsUIWgsl = `
struct VSOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, };
// Four scalars keep the host-shareable struct at 16 bytes. A vec3 after the
// opacity would start at offset 16 due to its alignment and make this 32 bytes.
struct UIUniforms { opacity: f32, _pad0: f32, _pad1: f32, _pad2: f32, };
@group(0) @binding(0) var<uniform> uiData: UIUniforms;
@vertex
fn vs_main(@location(0) pos: vec2<f32>, @location(1) uv: vec2<f32>) -> VSOut {
  var out: VSOut; out.pos = vec4<f32>(pos, 0.0, 1.0); out.uv = uv; return out;
}
@vertex
fn vs_main_fullscreen(@builtin(vertex_index) vid: u32) -> VSOut {
  var positions = array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  let p = positions[vid];
  var out: VSOut;
  out.pos = vec4<f32>(p,0.0,1.0);
  out.uv = p*0.5+0.5;
  return out;
}
`;

export const fsUIWgsl = `
struct UIUniforms { opacity: f32, _pad0: f32, _pad1: f32, _pad2: f32, };
@group(0) @binding(0) var<uniform> uiData: UIUniforms;
@group(1) @binding(0) var mapUITex: texture_2d<f32>;
@group(2) @binding(0) var nearestSampler: sampler;
@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c: vec4<f32> = textureSample(mapUITex, nearestSampler, uv);
  return vec4<f32>(c.rgb, c.a * uiData.opacity);
}
`;

export const vsSpriteWgsl = `
struct CameraUniforms {
  resolution: vec2<f32>,
  pos: vec2<f32>,
  angle: f32,
  planeLen: f32,
  bobPixels: f32,
  eyeZ: f32,
  time: f32,
  horizon: f32,
  sunDir: vec3<f32>,
  sunIntensity: f32,
  sunColor: vec3<f32>,
  ambient: f32,
  fogBase: f32,
  fogSq: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> lightData: array<vec4<f32>, 40>;
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) worldPos: vec3<f32>,
  @location(2) viewDir: vec3<f32>,
  @location(3) cameraRight: vec3<f32>,
  @location(4) cameraForward: vec3<f32>,
  @location(5) alpha: f32,
  @location(6) normalStrength: f32,
  @location(7) rimStrength: f32,
  @location(8) dist: f32,
};
@vertex
fn vs_main(
  @location(0) a_corner: vec2<f32>,
  @location(1) a_center: vec3<f32>,
  @location(2) a_size: vec2<f32>,
  @location(3) a_uvRect: vec4<f32>,
  @location(4) a_alpha: f32,
  @location(5) a_normalStrength: f32,
  @location(6) a_rimStrength: f32
) -> VSOut {
  var out: VSOut;
  let dir: vec2<f32> = vec2<f32>(cos(cam.angle), sin(cam.angle));
  let plane: vec2<f32> = vec2<f32>(-dir.y, dir.x) * cam.planeLen;
  let camRight2: vec2<f32> = normalize(vec2<f32>(-dir.y, dir.x));
  let camRight: vec3<f32> = vec3<f32>(camRight2, 0.0);
  let camUp: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  let camForward: vec3<f32> = vec3<f32>(dir.x, dir.y, 0.0);
  let halfW: f32 = a_size.x * 0.5; let h: f32 = a_size.y;
  let worldPos: vec3<f32> = a_center + camRight * (a_corner.x * halfW) + camUp * (a_corner.y * h);
  let toCenter: vec2<f32> = a_center.xy - cam.pos;
  let invDet: f32 = 1.0 / (plane.x * dir.y - dir.x * plane.y);
  let transformX: f32 = invDet * (dir.y * toCenter.x - dir.x * toCenter.y);
  let transformY: f32 = invDet * (-plane.y * toCenter.x + plane.x * toCenter.y);
  if (transformY <= 0.12) { out.pos = vec4<f32>(2.0,2.0,0.0,1.0); return out; }
  let screenX: f32 = 0.5 * (1.0 + transformX / transformY);
  let lineH: f32 = cam.resolution.y / transformY;
  var yAtWorldZ: f32 = cam.resolution.y * cam.horizon + lineH * (cam.eyeZ - worldPos.z);
  yAtWorldZ -= cam.bobPixels;
  let wScreen: f32 = lineH * a_size.x;
  let xScreen: f32 = screenX * cam.resolution.x + a_corner.x * wScreen * 0.5;
  let clipX: f32 = (xScreen / cam.resolution.x) * 2.0 - 1.0;
  let clipY: f32 = 1.0 - (yAtWorldZ / cam.resolution.y) * 2.0;
  out.pos = vec4<f32>(clipX, clipY, 0.0, 1.0);
  let u_: f32 = mix(a_uvRect.x, a_uvRect.z, a_corner.x * 0.5 + 0.5);
  let v_: f32 = mix(a_uvRect.w, a_uvRect.y, a_corner.y);
  out.uv = vec2<f32>(u_, v_);
  out.worldPos = worldPos;
  out.viewDir = normalize(vec3<f32>(cam.pos.x, cam.pos.y, cam.eyeZ) - worldPos);
  out.cameraRight = normalize(camRight);
  out.cameraForward = normalize(camForward);
  out.alpha = a_alpha;
  out.normalStrength = a_normalStrength;
  out.rimStrength = a_rimStrength;
  out.dist = transformY;
  return out;
}
`;

export const fsSpriteWgsl = `
@group(1) @binding(0) var albedoTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var ormTex: texture_2d<f32>;
@group(2) @binding(0) var materialSampler: sampler;
@group(2) @binding(1) var nearestSampler: sampler;
struct CameraUniforms {
  resolution: vec2<f32>,
  pos: vec2<f32>,
  angle: f32,
  planeLen: f32,
  bobPixels: f32,
  eyeZ: f32,
  time: f32,
  horizon: f32,
  sunDir: vec3<f32>,
  sunIntensity: f32,
  sunColor: vec3<f32>,
  ambient: f32,
  fogBase: f32,
  fogSq: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> lightData: array<vec4<f32>, 40>;
fn decodeNormal(enc: vec3<f32>) -> vec3<f32> { return normalize(enc * 2.0 - 1.0); }
fn attenuateSprite(dist: f32, radius: f32) -> f32 {
  if (dist > radius) { return 0.0; }
  let d: f32 = dist / radius;
  return pow(max(0.0, 1.0 - d), 2.0) / (1.0 + d * d * 0.2);
}
@fragment
fn fs_main(
  @location(0) v_uv: vec2<f32>,
  @location(1) v_worldPos: vec3<f32>,
  @location(2) v_viewDir: vec3<f32>,
  @location(3) v_cameraRight: vec3<f32>,
  @location(4) v_cameraForward: vec3<f32>,
  @location(5) v_alpha: f32,
  @location(6) v_normalStrength: f32,
  @location(7) v_rimStrength: f32,
  @location(8) v_dist: f32
) -> @location(0) vec4<f32> {
  let albedoS: vec4<f32> = textureSample(albedoTex, materialSampler, v_uv);
  if (albedoS.a < 0.08) { discard; }
  var albedo: vec3<f32> = albedoS.rgb;
  var normalEnc: vec3<f32> = textureSample(normalTex, materialSampler, v_uv).rgb;
  var normalTS: vec3<f32> = decodeNormal(normalEnc);
  normalTS = vec3<f32>(normalTS.xy * v_normalStrength, normalTS.z);
  normalTS = normalize(normalTS);
  let tangent: vec3<f32> = normalize(v_cameraRight);
  let bitangent: vec3<f32> = vec3<f32>(0.0,0.0,1.0);
  let geomN: vec3<f32> = normalize(-v_cameraForward + vec3<f32>(0.0,0.0,0.4));
  let N: vec3<f32> = normalize(tangent * normalTS.x + bitangent * normalTS.y + geomN * normalTS.z);
  let orm: vec3<f32> = textureSample(ormTex, materialSampler, v_uv).rgb;
  let ao: f32 = orm.r;
  var roughness: f32 = clamp(orm.g, 0.04, 1.0);
  let metal: f32 = clamp(orm.b, 0.0, 1.0);
  let V: vec3<f32> = normalize(v_viewDir);
  var Lo: vec3<f32> = albedo * (cam.ambient * 1.6 + 0.22) * ao;
  {
    let L: vec3<f32> = normalize(-cam.sunDir);
    let NdotL: f32 = max(dot(N, L), 0.0);
    if (NdotL > 0.0) {
      let H: vec3<f32> = normalize(V + L);
      let NdotH: f32 = max(dot(N, H), 0.0);
      let specPower: f32 = mix(64.0, 2.0, roughness);
      let spec: f32 = pow(NdotH, specPower) * (1.0 - roughness) * (0.2 + metal * 0.8) * NdotL;
      Lo += albedo * NdotL * cam.sunIntensity * 0.6 * cam.sunColor;
      Lo += spec * cam.sunColor * cam.sunIntensity * 0.5;
    }
    let VdotL: f32 = dot(V, L);
    let behind: f32 = max(0.0, -VdotL);
    if (behind > 0.01) {
      let fresnel: f32 = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      let rim: f32 = fresnel * behind * v_rimStrength * 0.7;
      Lo += vec3<f32>(rim, rim * 0.6, rim * 0.3);
    }
  }
  for (var i: i32 = 0; i < 8; i++) {
    let base: i32 = i * 5;
    let lPos: vec3<f32> = lightData[base].xyz;
    var lInt: f32 = lightData[base].w;
    if (lInt <= 0.001) { continue; }
    let lColor: vec3<f32> = lightData[base + 1].xyz;
    let lRadius: f32 = lightData[base + 1].w;
    let lType: i32 = i32(lightData[base + 2].w);
    let lDir: vec3<f32> = lightData[base + 2].xyz;
    let coneInner: f32 = lightData[base + 3].x;
    let coneOuter: f32 = lightData[base + 3].y;
    let pulseSpeed: f32 = lightData[base + 3].z;
    let pulseAmt: f32 = lightData[base + 3].w;
    let flickerSpeed: f32 = lightData[base + 4].y; // we store flickerSpeed here; flickerAmount in z
    // 3D distance like old final
    let toL: vec3<f32> = lPos - v_worldPos;
    let dist: f32 = length(toL);
    if (dist > lRadius) { continue; }
    var atten: f32 = attenuateSprite(dist, lRadius);
    if (lType == 1) {
      let spotDir: vec3<f32> = normalize(lDir);
      let Ldir: vec3<f32> = normalize(toL);
      let cosTheta: f32 = dot(-Ldir, spotDir);
      let spotAtt: f32 = smoothstep(coneOuter, coneInner, cosTheta);
      atten = atten * spotAtt;
    }
    if (lType == 2) {
      let flick: f32 = 0.72 + 0.28 * sin(cam.time * 9.0 + f32(i) * 2.3) + 0.12 * sin(cam.time * 17.0 + f32(i));
      atten = atten * clamp(flick, 0.45, 1.35);
    } else if (lType == 3) {
      var ps: f32 = pulseSpeed;
      var pa: f32 = pulseAmt;
      if (ps < 0.1) { ps = 2.2; }
      if (pa < 0.01) { pa = 0.4; }
      atten = atten * (1.0 + pa * sin(cam.time * ps + f32(i)));
    }
    if (atten <= 0.01) { continue; }
    let L: vec3<f32> = toL / max(dist, 0.001);
    let NdotL: f32 = max(dot(N, L), 0.0);
    if (NdotL > 0.0) {
      let attenN: f32 = atten * (0.35 + 0.65 * NdotL);
      let contrib: f32 = attenN * lInt * NdotL * 1.15;
      Lo += albedo * contrib * lColor;
    }
    if (NdotL > 0.08) {
      let H: vec3<f32> = normalize(V + L);
      let NdotH: f32 = max(dot(N, H), 0.0);
      if (NdotH > 0.18) {
        let specPower: f32 = 3.0 + (1.0 - roughness) * 36.0;
        let metalBoost: f32 = 0.2 + metal * 1.6;
        let attenN: f32 = atten * (0.35 + 0.65 * NdotL);
        let spec: f32 = pow(NdotH, specPower) * (1.0 - roughness) * metalBoost * max(0.1, NdotL) * attenN;
        Lo += spec * lColor;
      }
    }
    let VdotL: f32 = dot(V, L);
    let behind: f32 = max(0.0, -VdotL);
    let behindSide: f32 = max(0.0, -dot(N, L)) * 0.5;
    let NdotV: f32 = max(dot(N, V), 0.0);
    let fresnel: f32 = pow(1.0 - NdotV, 3.0);
    let edgeNorm: f32 = length(normalTS.xy);
    let rimBase: f32 = max(edgeNorm * 1.8, max(0.0, 1.0 - normalTS.z) * 2.0);
    let rim: f32 = rimBase * fresnel * (behind * 0.9 + behindSide) * v_rimStrength * atten * (0.7 + metal * 0.8) * 0.35;
    if (rim > 0.001) { Lo += vec3<f32>(rim, rim * 0.6, rim * 0.3) * lColor; }
  }
  let fog: f32 = 1.0 / (1.0 + v_dist * cam.fogBase + v_dist * v_dist * cam.fogSq);
  let fogClamped: f32 = clamp(fog, 0.05, 1.0);
  Lo = Lo * fogClamped;
  var maxC: f32 = max(max(Lo.r, Lo.g), Lo.b);
  if (maxC > 1.0) {
    let over: f32 = clamp((maxC - 1.0) * 0.32, 0.0, 0.7);
    let scaled: vec3<f32> = Lo / maxC;
    let warmWhite: vec3<f32> = vec3<f32>(1.0, 0.94, 0.82);
    Lo = mix(scaled, warmWhite, over);
  }
  Lo = clamp(Lo, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(Lo, albedoS.a * v_alpha);
}
`;

// Debug FS generators – restore WebGL2 exact fetching for material masks (mode 3,4,6)
function makeDebugFS(mode) {
  // This mirrors the old GLSL fsDebug* logic, now in WGSL, fetching actual height/AO/rough from array textures
  // to ensure parity with 632b7f2.
  return fsRaymarchWgsl.replace(
    'out.color = vec4<f32>(finalColor, 1.0);',
    `
    // --- debug world pos reconstruction (same as old GLSL) ---
    var dbgWPos: vec3<f32>;
    var dbgIsFloor: f32;
    var dbgWallU: f32 = 0.0;
    var dbgWallV: f32 = gWallV_raw;
    let vN: f32 = fragCoord.y / resolution.y;
    var dbgFloorWorld: vec2<f32> = u_playerPos + ray * perpDist;
    if (hit == 1) {
      let wV: f32 = gWallV_raw;
      if (wV >= 0.0 && wV <= 1.0) {
        dbgWPos = vec3<f32>(hitPos, (1.0 - wV) * u_wallWorldHeight);
        dbgIsFloor = 0.0;
        var wU: f32 = 0.0;
        if (side == 0) { wU = hitPos.y - floor(hitPos.y); } else { wU = hitPos.x - floor(hitPos.x); }
        if ((side == 0 && ray.x > 0.0) || (side == 1 && ray.y < 0.0)) { wU = 1.0 - wU; }
        dbgWallU = wU;
        dbgWallV = wV;
      } else {
        if (vN > u_horizon) { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 0.0); dbgIsFloor = 1.0; }
        else { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, u_wallWorldHeight); dbgIsFloor = 1.0; }
      }
    } else {
      if (vN > u_horizon) { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 0.0); dbgIsFloor = 1.0; }
      else { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, u_wallWorldHeight); dbgIsFloor = 1.0; }
    }

    var dbgCol: vec3<f32> = finalColor;

    if (${mode} == 1) {
      // Moss noise – world pos only
      dbgCol = debugMossNoiseMask(dbgWPos);
    } else if (${mode} == 2) {
      // Moss env – world + isFloor
      dbgCol = debugMossEnvMask(dbgWPos, dbgIsFloor);
    } else if (${mode} == 3 || ${mode} == 4 || ${mode} == 6 || ${mode} == 10 || ${mode} == 12 || ${mode} == 13 || ${mode} == 14) {
      // Modes needing material: fetch actual height/AO/rough from arrays (parity with 632b7f2)
      var dbgMatHeight: f32 = 0.5;
      var dbgAo: f32 = 0.85;
      var dbgRough: f32 = 0.7;
      if (dbgIsFloor > 0.5) {
        if (vN > u_horizon) {
          let fcCell: vec2<i32> = vec2<i32>(floor(dbgFloorWorld));
          let matId: f32 = fetchFloorMatId(fcCell);
          let layer: i32 = clampLayer(matId, fc);
          let uv: vec2<f32> = fract(dbgFloorWorld);
          dbgMatHeight = sampleFloorHeight(layer, uv);
          let rma: vec4<f32> = sampleFloorRMA(layer, uv);
          dbgAo = rma.a;
          dbgRough = rma.r;
        } else {
          let ccCell: vec2<i32> = vec2<i32>(floor(dbgFloorWorld));
          let matId: f32 = fetchCeilMatId(ccCell);
          let layer: i32 = clampLayer(matId, cc);
          let uv: vec2<f32> = fract(dbgFloorWorld);
          dbgMatHeight = sampleCeilHeight(layer, uv);
          let rma: vec4<f32> = sampleCeilRMA(layer, uv);
          dbgAo = rma.a;
          dbgRough = rma.r;
        }
      } else {
        let matId: f32 = max(1.0, cellType);
        let layer: i32 = clampLayer(matId, wc);
        let uv: vec2<f32> = vec2<f32>(dbgWallU, clamp(dbgWallV, 0.0, 1.0));
        dbgMatHeight = sampleWallHeight(layer, uv);
        let rma: vec4<f32> = sampleWallRMA(layer, uv);
        dbgAo = rma.a;
        dbgRough = rma.r;
      }

      if (${mode} == 3) {
        dbgCol = debugMossMaterialMask(dbgMatHeight, dbgAo, dbgRough);
      } else if (${mode} == 4) {
        dbgCol = debugMossCombinedMask(dbgWPos, dbgMatHeight, dbgAo, dbgRough, dbgIsFloor);
      } else if (${mode} == 6) {
        dbgCol = debugDamagedMask(dbgWPos, dbgMatHeight, dbgAo, dbgRough, dbgIsFloor);
      } else if (${mode} == 10) {
        dbgCol = debugDustMaskCol(dbgWPos, dbgIsFloor, dbgMatHeight, dbgAo);
      } else if (${mode} == 12) {
        dbgCol = debugDamagedFactorsMask(dbgWPos, dbgMatHeight, dbgAo, dbgRough, dbgIsFloor);
      } else if (${mode} == 13) {
        dbgCol = debugDamagedHeightMask(dbgWPos, dbgMatHeight, dbgAo, dbgRough, dbgIsFloor);
      } else if (${mode} == 14) {
        var dbgGeomN: vec3<f32>;
        if (dbgIsFloor > 0.5) {
          dbgGeomN = vec3<f32>(0.0, 0.0, select(-1.0, 1.0, vN > u_horizon));
        } else if (side == 0) {
          dbgGeomN = vec3<f32>(f32(-stepDir.x), 0.0, 0.0);
        } else {
          dbgGeomN = vec3<f32>(0.0, f32(-stepDir.y), 0.0);
        }
        dbgCol = debugDamagedNormalMask(dbgWPos, dbgGeomN, dbgMatHeight, dbgAo, dbgRough, dbgIsFloor);
      }
    } else if (${mode} == 5) {
      // Puddle mask – floor only logic preserved, uses computePuddleMaskTweakable via debugFinalPuddleMask
      dbgCol = debugFinalPuddleMask(dbgWPos, 0.5, 1.0);
    } else if (${mode} == 7) {
      dbgCol = debugDamagedNoiseMask(dbgWPos);
    } else if (${mode} == 8) {
      // Structural feature isolate: ordinary surfaces nearly black, channel
      // banks/water cyan-violet, and wall fixtures amber.
      let isFloorPixel: bool = dbgIsFloor > 0.5 && vN > u_horizon;
      let isWallPixel: bool = dbgIsFloor < 0.5;
      let featureCell: vec2<i32> = select(hitCell, vec2<i32>(floor(dbgWPos.xy)), isFloorPixel);
      let featureWord: u32 = loadFeatureCell(featureCell);
      let kind: u32 = featureKind(featureWord);
      let grilleFaceVisible: bool = isFeatureWallFace(featureWord, FEATURE_GRILLE, side, stepDir);
      dbgCol = finalColor * 0.06;
      if (isFloorPixel && kind == FEATURE_CHANNEL) {
        let geom: FloorFeatureGeometry = resolveFeatureFloor(dbgWPos.xy, 0.0);
        let checker: f32 = step(0.5, fract((dbgWPos.x + dbgWPos.y) * 4.0));
        let bankColor: vec3<f32> = mix(vec3<f32>(0.85, 0.05, 1.0), vec3<f32>(0.3, 0.0, 0.65), geom.bankT);
        let waterColor: vec3<f32> = mix(vec3<f32>(0.0, 0.75, 1.0), vec3<f32>(0.0, 1.0, 0.65), checker);
        dbgCol = mix(bankColor, waterColor, geom.liquidMask);
      } else if (isWallPixel && kind == FEATURE_GRILLE && grilleFaceVisible) {
        dbgCol = vec3<f32>(1.0, 0.45, 0.02);
      }
    } else if (${mode} == 9) {
      dbgCol = debugBloodMaskCol(dbgWPos, dbgIsFloor);
    } else if (${mode} == 11) {
      dbgCol = debugDamagedPlacementMask(dbgWPos);
    } else {
      dbgCol = finalColor;
    }

    out.color = vec4<f32>(dbgCol, 1.0);
    `
  );
}

// One runtime-selected debug shader replaces the old per-mode variants. The
// pipeline is compiled once and frame.pbrDebugMode changes are then uniform-only.
export const fsDebugModifiersWgsl = makeDebugFS('frame.pbrDebugMode');
export const fsDebugMossNoiseWgsl = fsDebugModifiersWgsl;
export const fsDebugMossEnvWgsl = fsDebugModifiersWgsl;
export const fsDebugMossMaterialWgsl = fsDebugModifiersWgsl;
export const fsDebugMossCombinedWgsl = fsDebugModifiersWgsl;
export const fsDebugPuddleWgsl = fsDebugModifiersWgsl;
export const fsDebugDamagedWgsl = fsDebugModifiersWgsl;
export const fsDebugDamagedNoiseWgsl = fsDebugModifiersWgsl;
export const fsDebugStructuralWgsl = fsDebugModifiersWgsl;
export const fsDebugBloodWgsl = fsDebugModifiersWgsl;
export const fsDebugDustWgsl = fsDebugModifiersWgsl;
export const fsDebugDamagedPlacementWgsl = fsDebugModifiersWgsl;
export const fsDebugDamagedFactorsWgsl = fsDebugModifiersWgsl;
export const fsDebugMossWgsl = fsDebugMossCombinedWgsl;

// Compatibility exports matching old shaders.js names (non-WGSL suffix)
export const vsSource = vsFullscreenWgsl;
export const fsSource = fsRaymarchWgsl;
export const vsQuantize = vsFullscreenWgsl;
export const fsQuantize = fsQuantizeWgsl;
export const vsUI = vsUIWgsl;
export const fsUI = fsUIWgsl;
export const vsSpriteSrc = vsSpriteWgsl;
export const fsSpritePBRSrc = fsSpriteWgsl;
export const vsSSR = vsFullscreenWgsl;
export const fsSSR = fsSSRwgsl;
export const vsComposite = vsFullscreenWgsl;
export const fsComposite = fsCompositeWgsl;
export const fsDebugMoss = fsDebugMossCombinedWgsl;
export const fsDebugMossNoise = fsDebugMossNoiseWgsl;
export const fsDebugMossEnv = fsDebugMossEnvWgsl;
export const fsDebugMossMaterial = fsDebugMossMaterialWgsl;
export const fsDebugMossCombined = fsDebugMossCombinedWgsl;
export const fsDebugPuddle = fsDebugPuddleWgsl;
export const fsDebugCombined = fsRaymarchWgsl;
export const fsDebugMossRaw = fsRaymarchWgsl;
export const fsDebugDamaged = fsDebugDamagedWgsl;
export const fsDebugDamagedNoise = fsDebugDamagedNoiseWgsl;
export const fsDebugBlood = fsDebugBloodWgsl;
export const fsDebugDust = fsDebugDustWgsl;
