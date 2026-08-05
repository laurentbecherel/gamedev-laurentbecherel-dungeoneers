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

export const MAX_LIGHTS = 8;
export const MAX_CHARS = 8;
export const FRAME_DATA_VEC4_COUNT = 32;
export const LIGHT_DATA_VEC4_COUNT = 40;
export const MODIFIERS_VEC4_COUNT = 34;

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
// --- Modifiers Block (34 vec4) ---
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
  _padEnd: vec3<i32>,
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

// Bindings
@group(0) @binding(0) var<uniform> frameData: array<vec4<f32>, 32>;
@group(0) @binding(1) var<uniform> lightData: array<vec4<f32>, 40>;
@group(0) @binding(2) var<uniform> modifiersBlock: ModifiersBlock;
@group(0) @binding(3) var<uniform> frame: FrameUniforms;
@group(0) @binding(4) var<uniform> lights: LightingUniforms;

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

@group(2) @binding(0) var nearestSampler: sampler;
@group(2) @binding(1) var linearSampler: sampler;

var<private> u_resolution: vec2<f32>;
var<private> u_playerPos: vec2<f32>;
var<private> u_playerAngle: f32;
var<private> u_fov: f32;
var<private> u_playerHeight: f32;
var<private> u_bobPixels: f32;
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
      if (wh.hit) { hit = 1; perpDist = wh.t; hitPos = wh.hp; cornerNormal = vec3<f32>(wh.n.x, wh.n.y, 0.0); hasCornerRound = wh.rounded; break; }
    }
  }

  var finalColor: vec3<f32> = u_fogColor;
  let wc: f32 = select(1.0, u_wallCount, u_wallCount > 0.0);
  let fc: f32 = select(1.0, u_floorCount, u_floorCount > 0.0);
  let cc: f32 = select(1.0, u_ceilCount, u_ceilCount > 0.0);
  let eyeFactor: f32 = select(0.15, u_renderEyeFactor, u_renderEyeFactor >= 0.0);
  var gWallV_raw: f32 = 0.0;

  if (hit == 1) {
    var floorH: f32 = 0.0; var ceilH: f32 = 1.15;
    var wallU: f32;
    if (side == 0) { wallU = hitPos.y - floor(hitPos.y); } else { wallU = hitPos.x - floor(hitPos.x); }
    if ((side == 0 && ray.x > 0.0) || (side == 1 && ray.y < 0.0)) { wallU = 1.0 - wallU; }
    if (u_authentic == 1) { wallU = floor(wallU * 64.0 * 65536.0) / 65536.0 / 64.0; }
    let eyeZ: f32 = 0.5;
    let wallH_full: f32 = resolution.y / max(perpDist, 0.0001) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
    let drawStart: f32 = resolution.y * 0.5 - (ceilH - eyeZ) * wallH_full;
    let drawEnd: f32 = resolution.y * 0.5 + (eyeZ - floorH) * wallH_full;
    let wallV_raw: f32 = (fragCoord.y - drawStart) / max(drawEnd - drawStart, 0.001);
    gWallV_raw = wallV_raw;
    if (wallV_raw < 0.0 || wallV_raw > 1.0) {
      let horizon: f32 = 0.5; let vNorm: f32 = fragCoord.y / resolution.y;
      if (vNorm > horizon) {
        var dist: f32 = (eyeZ - 0.0) / max(0.0001, vNorm - horizon) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        dist = max(dist, 0.001);
        let floorWorld: vec2<f32> = u_playerPos + ray * dist;
        let floorUV: vec2<f32> = fract(floorWorld);
        let matId: f32 = fetchFloorMatId(vec2<i32>(floor(floorWorld)));
        let shade = shadeFloorCell(floorWorld, floorUV, matId, fc, ray, eyeZ, 0.0);
        finalColor = shade.color; perpDist = shade.dist;
      } else {
        var dist: f32 = (1.15 - eyeZ) / max(0.0001, horizon - vNorm) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        dist = max(dist, 0.001);
        let ceilWorld: vec2<f32> = u_playerPos + ray * dist;
        let ceilUV: vec2<f32> = fract(ceilWorld);
        let matId: f32 = fetchCeilMatId(vec2<i32>(floor(ceilWorld)));
        let shade = shadeCeilCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, 1.15);
        finalColor = shade.color; perpDist = shade.dist;
      }
    } else {
      let wallV: f32 = clamp(wallV_raw, 0.0, 1.0);
      let matId: f32 = max(1.0, cellType);
      finalColor = shadeWallCell(wallU, wallV, matId, wc, side, stepDir, ray, hitPos, hasCornerRound, cornerNormal);
    }
  } else {
    let horizon: f32 = 0.5; let vNorm2: f32 = 1.0 - v_uv.y;
    let pc: vec2<i32> = vec2<i32>(vec2<i32>(floor(u_playerPos)));
    var pfH: f32 = 0.0;
    if (pc.x >= 0 && pc.y >= 0 && pc.x < i32(u_mapSize.x) && pc.y < i32(u_mapSize.y)) {
      let pmd: vec4<f32> = textureLoad(mapTex, pc, 0);
      pfH = clamp(pmd.g - 0.5, -0.6, 0.6);
    }
    let eyeZ2: f32 = 0.5 + pfH * eyeFactor;
    if (vNorm2 > horizon) {
      var floorH: f32 = 0.0; var dist: f32 = 0.001; var floorWorld: vec2<f32> = vec2<f32>(0.0);
      for (var it: i32 = 0; it < 3; it++) {
        dist = (eyeZ2 - floorH) / max(0.0001, vNorm2 - horizon) * resolution.x / resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) { dist = 0.001; }
        floorWorld = u_playerPos + ray * dist;
        let fc2: vec2<i32> = vec2<i32>(vec2<i32>(floor(floorWorld)));
        if (fc2.x >= 0 && fc2.y >= 0 && fc2.x < i32(u_mapSize.x) && fc2.y < i32(u_mapSize.y)) {
          let fmd: vec4<f32> = textureLoad(mapTex, fc2, 0);
          let cellT: i32 = i32(fmd.r * 255.0 + 0.5);
          if (cellT == 0) { floorH = clamp(fmd.g - 0.5, -0.6, 0.6); } else { break; }
        }
      }
      let floorUV: vec2<f32> = fract(floorWorld);
      let matId: f32 = fetchFloorMatId(vec2<i32>(floor(floorWorld)));
      let shade = shadeFloorCell(floorWorld, floorUV, matId, fc, ray, eyeZ2, floorH);
      finalColor = shade.color; perpDist = shade.dist;
    } else {
      var ceilH: f32 = 1.15; var dist: f32 = 0.001; var ceilWorld: vec2<f32> = vec2<f32>(0.0);
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
      finalColor = shade.color; perpDist = shade.dist;
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

  // GBuffer
  let hitF: f32 = f32(hit);
  let noHit: f32 = 1.0 - hitF;
  let hasRoundF: f32 = f32(hasCornerRound);
  let sideEq0: f32 = step(f32(side), 0.5);
  var gNormalWallNoRound0: vec3<f32> = vec3<f32>(f32(-stepDir.x), 0.0, 0.0);
  var gNormalWallNoRound1: vec3<f32> = vec3<f32>(0.0, f32(-stepDir.y), 0.0);
  var gNormalWallNoRound: vec3<f32> = mix(gNormalWallNoRound1, gNormalWallNoRound0, sideEq0);
  var gNormalCorner: vec3<f32> = normalize(cornerNormal);
  var gNormalWall: vec3<f32> = mix(gNormalWallNoRound, gNormalCorner, hasRoundF);
  let wV: f32 = gWallV_raw;
  let condW0: f32 = step(wV, -0.0001);
  let condW1: f32 = step(1.0001, wV);
  var condWmid: f32 = 1.0 - condW0 - condW1;
  condWmid = clamp(condWmid, 0.0, 1.0);
  let modUVf: vec2<f32> = (u_playerPos + ray * perpDist) / u_mapSize;
  let puddleCellf: f32 = loadModifierMap(modUVf).b;
  let worldPosf: vec3<f32> = vec3<f32>(u_playerPos + ray * perpDist, 0.0);
  let gMaskFloorPuddle: f32 = computePuddleMaskTweakable(worldPosf, 0.5, 1.0, puddleCellf);
  var gNormalCeil: vec3<f32> = vec3<f32>(0.0, 0.0, -1.0);
  var gNormalFloor: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  var gNormalWallMid: vec3<f32> = mix(gNormalWall, gNormalFloor, condW1);
  var gNormalWallFinal: vec3<f32> = mix(gNormalWallMid, gNormalCeil, condW0);
  var gNormalFromHit: vec3<f32> = mix(vec3<f32>(0.0, 0.0, 1.0), gNormalWallFinal, hitF);
  let vNormH: f32 = fragCoord.y / u_resolution.y;
  let condFloor: f32 = step(0.5001, vNormH) * noHit;
  let condCeil: f32 = (1.0 - step(0.5001, vNormH)) * noHit;
  let fw: vec2<f32> = u_playerPos + ray * perpDist;
  let modUVf2: vec2<f32> = fw / u_mapSize;
  let pc2: f32 = loadModifierMap(modUVf2).b;
  let wp2: vec3<f32> = vec3<f32>(fw, 0.0);
  let gMaskFromFloor: f32 = computePuddleMaskTweakable(wp2, 0.5, 1.0, pc2) * condFloor;
  let gMaskFromMid: f32 = gMaskFloorPuddle * condW1 * hitF;
  var gNormalFromNoHit: vec3<f32> = mix(gNormalCeil, gNormalFloor, condFloor);
  var gNormalCombined: vec3<f32> = mix(gNormalFromNoHit, gNormalFromHit, hitF);
  var gMask: f32 = gMaskFromFloor + gMaskFromMid;
  var gNormal: vec3<f32> = gNormalCombined;
  let hasGMask: f32 = step(0.021, gMask);
  let fw2: vec2<f32> = u_playerPos + ray * perpDist;
  let rippleX: f32 = sin(fw2.x * 2.7 + u_time * 0.6) * 0.08 + sin(fw2.y * 3.3 + u_time * 0.4) * 0.04;
  let rippleY: f32 = cos(fw2.x * 2.1 + u_time * 0.5) * 0.08 + cos(fw2.y * 2.9 + u_time * 0.3) * 0.04;
  let gNormalRippled: vec3<f32> = normalize(vec3<f32>(rippleX * gMask, rippleY * gMask, 1.0));
  gNormal = mix(gNormal, gNormalRippled, hasGMask);
  let enc: vec2<f32> = octaEncodeGN(normalize(gNormal));
  let depthNorm: f32 = clamp(perpDist / max(0.001, u_ssrDepthRange), 0.0, 1.0);
  out.gbuffer = vec4<f32>(enc.x, enc.y, depthNorm, clamp(gMask, 0.0, 1.0));
  return out;
}
`;

// SSR – minimal stub, avoids material group to stay under 16 textures, no POM
// Uses layout [frame, samplers, ssrTextures] = groups 0,1,2
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
  _padEnd: vec3<i32>,
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

struct SSRFSOut {
  @location(0) color: vec4<f32>,
};

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> SSRFSOut {
  let resolution = frame.resolution;
  let startUV = v_uv;
  let texSize = vec2<i32>(i32(resolution.x), i32(resolution.y));
  var coord = vec2<i32>(vec2<f32>(clamp(startUV, vec2<f32>(0.0), vec2<f32>(1.0)) * resolution));
  coord = vec2<i32>(clamp(coord, vec2<i32>(0), texSize - vec2<i32>(1)));
  let gSample: vec4<f32> = textureLoad(gNormalDepthTex, coord, 0);
  let enc: vec2<f32> = gSample.xy;
  let puddleMask: f32 = gSample.w;
  var out: SSRFSOut;
  if (puddleMask < 0.01) { out.color = vec4<f32>(0.0); return out; }
  let N: vec3<f32> = octaDecodeSSR(enc);
  if (N.z < 0.1) { out.color = vec4<f32>(0.0); return out; }
  // Use textureLoad for base to avoid uniform control flow restriction
  let baseSample = textureLoad(sceneTex, coord, 0).rgb;
  let fade = puddleMask * 0.5;
  out.color = vec4<f32>(baseSample * 0.7, fade);
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
@group(0) @binding(0) var sceneTex: texture_2d<f32>;
@group(0) @binding(1) var ssrTex: texture_2d<f32>;
@group(1) @binding(0) var nearestSampler: sampler;

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> CompOut {
  let base: vec3<f32> = textureSample(sceneTex, nearestSampler, v_uv).rgb;
  let refl: vec4<f32> = textureSample(ssrTex, nearestSampler, v_uv);
  let mixed: vec3<f32> = mix(base, refl.rgb, refl.a * 0.85);
  var out: CompOut;
  out.color = vec4<f32>(mixed, 1.0);
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
  pbrEmissiveAlbedoMul: f32, pbrEmissiveStrength: f32, pbrF0: f32, pbrAttenQuad: f32, pbrGGXEps: f32, renderFloorMul: f32, renderCeilMul: f32, renderWallDarken: f32, renderEyeFactor: f32, ssrDebugMode: i32, _padEnd: vec3<i32>,
};
struct QuantOut { @location(0) color: vec4<f32>, };
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var paletteTex: texture_2d<f32>;
@group(1) @binding(2) var lutTex: texture_2d<f32>;
@group(2) @binding(0) var nearestSampler: sampler;
@group(0) @binding(3) var<uniform> frame: FrameUniforms;

@fragment
fn fs_main(@location(0) v_uv: vec2<f32>) -> QuantOut {
  var sc: vec4<f32> = textureSample(sceneTex, nearestSampler, v_uv);
  if (frame.authentic == 0 || frame.pbrDebugMode != 0) {
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
struct UIUniforms { opacity: f32, _pad: vec3<f32>, };
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
struct UIUniforms { opacity: f32, _pad: vec3<f32>, };
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
  var yAtWorldZ: f32 = cam.resolution.y * 0.5 + lineH * (cam.eyeZ - worldPos.z);
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
@group(2) @binding(0) var linearSampler: sampler;
@group(2) @binding(1) var nearestSampler: sampler;
struct CameraUniforms {
  resolution: vec2<f32>,
  pos: vec2<f32>,
  angle: f32,
  planeLen: f32,
  bobPixels: f32,
  eyeZ: f32,
  time: f32,
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
  let albedoS: vec4<f32> = textureSample(albedoTex, linearSampler, v_uv);
  if (albedoS.a < 0.08) { discard; }
  var albedo: vec3<f32> = albedoS.rgb;
  var normalEnc: vec3<f32> = textureSample(normalTex, linearSampler, v_uv).rgb;
  var normalTS: vec3<f32> = decodeNormal(normalEnc);
  normalTS = vec3<f32>(normalTS.xy * v_normalStrength, normalTS.z);
  normalTS = normalize(normalTS);
  let tangent: vec3<f32> = normalize(v_cameraRight);
  let bitangent: vec3<f32> = vec3<f32>(0.0,0.0,1.0);
  let geomN: vec3<f32> = normalize(-v_cameraForward + vec3<f32>(0.0,0.0,0.4));
  let N: vec3<f32> = normalize(tangent * normalTS.x + bitangent * normalTS.y + geomN * normalTS.z);
  let orm: vec3<f32> = textureSample(ormTex, linearSampler, v_uv).rgb;
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
      let fresnel: f32 = pow(1.0 - max(dot(V, N), 0.0), 3.0) * v_rimStrength;
      Lo += albedo * fresnel * behind * 0.5;
    }
  }
  for (var i: i32 = 0; i < 8; i++) {
    let base: i32 = i * 5;
    let lPos: vec3<f32> = lightData[base].xyz;
    let lInt: f32 = lightData[base].w;
    if (lInt <= 0.001) { continue; }
    let lColor: vec3<f32> = lightData[base + 1].xyz;
    let lRadius: f32 = lightData[base + 1].w;
    let lType: i32 = i32(lightData[base + 2].w);
    let lDir: vec3<f32> = lightData[base + 2].xyz;
    let coneInner: f32 = lightData[base + 3].x;
    let coneOuter: f32 = lightData[base + 3].y;
    let dist: f32 = distance(v_worldPos.xy, lPos.xy);
    if (dist > lRadius * 1.35) { continue; }
    var atten: f32 = 1.0 - dist / lRadius;
    if (atten <= 0.0) { continue; }
    atten = atten * atten;
    if (lType == 1) {
      let toP: vec3<f32> = normalize(v_worldPos - vec3<f32>(lPos.xy, lPos.z));
      let ld: vec3<f32> = normalize(lDir);
      let cosA: f32 = dot(-toP, ld);
      if (cosA < coneOuter) { continue; }
      let spot: f32 = smoothstep(coneOuter, coneInner, cosA);
      atten = atten * spot;
    }
    let L: vec3<f32> = normalize(lPos - v_worldPos);
    let NdotL: f32 = max(dot(N, L), 0.0);
    Lo += albedo * lColor * lInt * atten * NdotL * 1.15;
  }
  let fog: f32 = 1.0 / (1.0 + v_dist * cam.fogBase + v_dist * v_dist * cam.fogSq);
  let fogClamped: f32 = clamp(fog, 0.06, 1.0);
  let fogDark: f32 = 0.55 + fogClamped * 0.45;
  Lo = Lo * fogDark;
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

// Debug FS generators
function makeDebugFS(mode) {
  return fsRaymarchWgsl.replace(
    'out.color = vec4<f32>(finalColor, 1.0);',
    `
    var dbgWPos: vec3<f32>;
    var dbgIsFloor: f32;
    let vN: f32 = fragCoord.y / resolution.y;
    var dbgFloorWorld: vec2<f32> = u_playerPos + ray * perpDist;
    if (hit == 1) {
      let wV: f32 = gWallV_raw;
      if (wV >= 0.0 && wV <= 1.0) { dbgWPos = vec3<f32>(hitPos, (1.0 - wV) * 1.15); dbgIsFloor = 0.0; }
      else { if (vN > 0.5) { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 0.0); dbgIsFloor = 1.0; } else { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 1.15); dbgIsFloor = 1.0; } }
    } else { if (vN > 0.5) { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 0.0); dbgIsFloor = 1.0; } else { dbgWPos = vec3<f32>(u_playerPos + ray * perpDist, 1.15); dbgIsFloor = 1.0; } }
    var dbgCol: vec3<f32>;
    if (${mode} == 1) { dbgCol = debugMossNoiseCol(dbgWPos); }
    else if (${mode} == 2) { dbgCol = debugMossEnvCol(dbgWPos, dbgIsFloor); }
    else if (${mode} == 3) { dbgCol = debugMossMaterialCol(0.5, 0.85, 0.7); }
    else if (${mode} == 4) { dbgCol = debugMossCombinedCol(dbgWPos, 0.5, 0.85, 0.7, dbgIsFloor); }
    else if (${mode} == 5) { dbgCol = debugFinalPuddleMask(dbgWPos, 0.5, 1.0); }
    else if (${mode} == 6) { dbgCol = debugDamagedMask(dbgWPos, 0.5, 0.85, 0.7, dbgIsFloor); }
    else if (${mode} == 7) { dbgCol = debugDamagedNoiseCol(dbgWPos); }
    else { dbgCol = finalColor; }
    out.color = vec4<f32>(dbgCol, 1.0);
    `
  );
}

export const fsDebugMossNoiseWgsl = makeDebugFS(1);
export const fsDebugMossEnvWgsl = makeDebugFS(2);
export const fsDebugMossMaterialWgsl = makeDebugFS(3);
export const fsDebugMossCombinedWgsl = makeDebugFS(4);
export const fsDebugPuddleWgsl = makeDebugFS(5);
export const fsDebugDamagedWgsl = makeDebugFS(6);
export const fsDebugDamagedNoiseWgsl = makeDebugFS(7);
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
