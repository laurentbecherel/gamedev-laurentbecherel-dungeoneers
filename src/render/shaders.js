// GLSL shader sources — v11 Full UBO + 2x modifier textures + main() split
// - Array pipeline (sampler2DArray) – 12 textures + map + matMap + noise + 2*modifier = 17 units (checks max units)
// - Modifiers: 2 textures lossless (tex1 moss/water/puddle/dust, tex2 damaged/blood) + UBO ModifiersBlock 192 bytes std140
// - Main split into shadeFloorCell, shadeCeilCell, shadeWallCell in shader-lib/scene.glsl.js
// - Unified chamfer, periodic noise

import { glslCommon } from './shader-lib/common.glsl.js';
import { glslMaterial } from './shader-lib/material.glsl.js';
import { glslPom } from './shader-lib/pom.glsl.js';
import { glslRaymarch } from './shader-lib/raymarch.glsl.js';
import { glslPbr } from './shader-lib/pbr.glsl.js';
import { glslChamfer } from './shader-lib/chamfer.glsl.js';
import { glslGridChamfer } from './shader-lib/grid-chamfer.glsl.js';
import { glslModifiers } from './shader-lib/modifiers.glsl.js';
import { glslScene } from './shader-lib/scene.glsl.js';

export const MAX_LIGHTS = 8;
export const MAX_CHARS = 8;

export const vsSource = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const fsSource = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;

in vec2 v_uv;
out vec4 outColor;

// ---- core ----
uniform vec2  u_resolution;
uniform vec2  u_playerPos;
uniform float u_playerAngle;
uniform float u_fov;
uniform float u_playerHeight;
uniform float u_bobPixels;

uniform sampler2D u_mapTex;
uniform sampler2D u_matMap;
uniform vec2  u_mapSize;

// ---- material arrays ----
uniform sampler2DArray u_wallAlbedo, u_wallNormal, u_wallHeight, u_wallRoughMetal;
uniform sampler2DArray u_floorAlbedo, u_floorNormal, u_floorHeight, u_floorRoughMetal;
uniform sampler2DArray u_ceilAlbedo,  u_ceilNormal,  u_ceilHeight,  u_ceilRoughMetal;

// ---- material counts ----
uniform float u_wallCount;
uniform float u_floorCount;
uniform float u_ceilCount;

// ---- modifiers v11: 2 textures lossless + UBO 192 bytes – 16 units total ----
uniform sampler2D u_modifierMap;   // 14: moss/water/puddle/dust
uniform sampler2D u_modifierMap2;  // 15: damaged/blood
// u_noiseTex removed v11 – procedural hash21_proc frees unit, keeps seamless (old noise tex kept CPU side for fallback, not sampled)
uniform int u_modifiersEnabled;

// ---- lighting forward 8 ----
uniform int   u_numLights;
uniform vec3  u_lightPos[8];
uniform vec3  u_lightColor[8];
uniform float u_lightIntensity[8];
uniform float u_lightRadius[8];
uniform int   u_lightType[8];
uniform vec3  u_lightDir[8];
uniform float u_lightConeInner[8];
uniform float u_lightConeOuter[8];
uniform float u_lightPulseSpeed[8];
uniform float u_lightPulseAmt[8];
uniform int   u_lightNoShadow[8];
uniform float u_lightFlickerSpeed[8];
uniform float u_lightFlickerAmount[8];
uniform float u_lightPhase[8];
uniform vec3  u_ambientColor;
uniform float u_ambientLevel;
uniform float u_worldAmbientMul;
uniform vec2  u_sunDir;
uniform float u_sunDirZ;
uniform float u_sunIntensity;
uniform vec3  u_sunColor;
uniform float u_fogBase;
uniform float u_fogSquared;
uniform vec3  u_fogColor;
uniform int   u_fogEnabled;

// ---- POM ----
uniform float u_pomWall;
uniform float u_pomFloor;
uniform float u_pomCeil;
uniform int   u_pomSteps;
uniform float u_pomMaxOffset;
uniform float u_pomMinVz;
uniform float u_pomMinEffVz;
uniform float u_pomFadeStart;
uniform float u_pomFadeEnd;

// ---- toggles / debug ----
uniform int   u_authentic;
uniform int   u_bandLevels;
uniform float u_time;
uniform int   u_gridDebug;
uniform int   u_lightingEnabled;
uniform int   u_pbrEnabled;
uniform int   u_pomEnabled;
uniform int   u_pbrDebugMode;

uniform float u_aoSun;
uniform float u_aoPoint;
uniform float u_aoAmbient;

// ---- Chamfer ----
uniform int   u_chamferEnabled;
uniform float u_chamferFloorSize;
uniform float u_chamferCeilSize;
uniform float u_chamferWallSize;
uniform float u_chamferCornerRadius;
uniform float u_chamferDarken;
uniform int   u_chamferRoundCorners;
uniform float u_chamferBlendFloor;
uniform float u_chamferBlendWall;
uniform float u_chamferRough;
uniform float u_chamferFloor;
uniform float u_chamferCeil;
uniform float u_chamferWall;
uniform float u_chamferTrimFloor;
uniform float u_chamferTrimCeil;
uniform float u_chamferTrimWall;
uniform float u_chamferTrimFloorAlt;
uniform float u_chamferTrimCeilAlt;
uniform float u_chamferCreviceEnd;
uniform float u_chamferCreviceSmoothEnd;
uniform float u_chamferTrimStart;
uniform float u_chamferTrimMid;
uniform float u_chamferTrimEnd;

// ---- Grid tile chamfer ----
uniform int   u_chamferGridEnabled;
uniform float u_chamferGridFloorSize;
uniform float u_chamferGridCeilSize;
uniform float u_chamferGridFloorDarken;
uniform float u_chamferGridCeilDarken;
uniform float u_chamferGridFloorTrim;
uniform float u_chamferGridCeilTrim;
uniform float u_chamferGridFloorRough;
uniform float u_chamferGridCeilRough;
uniform float u_chamferGridFloorBlend;
uniform float u_chamferGridCeilBlend;
uniform float u_chamferGridCreviceEnd;
uniform float u_chamferGridCreviceSmoothEnd;
uniform float u_chamferGridTrimStart;
uniform float u_chamferGridTrimMid;
uniform float u_chamferGridTrimEnd;

// ---- Rounded corners ----
uniform int   u_cornerEnabled;
uniform float u_cornerRadius;
uniform int   u_cornerMode;
uniform int   u_cornerInner;
uniform float u_cornerBandNear;
uniform float u_cornerBandFarExtra;
uniform float u_cornerBandFarFactor;
uniform float u_cornerSectorThresh;
uniform float u_cornerNormalMix;
uniform float u_cornerAlbedoBoost;
uniform float u_cornerRoughMul;
uniform float u_cornerAoMul;

// ---- Shadows ----
uniform float u_shadowBiasN;
uniform float u_shadowBiasDir;
uniform float u_shadowSunFactor;
uniform float u_shadowPointFactor;
uniform float u_shadowSunMax;
uniform float u_shadowPointEps;
uniform float u_shadowNormalThresh;

// ---- PBR extended ----
uniform float u_pbrEmissiveAlbedoMul;
uniform float u_pbrEmissiveStrength;
uniform float u_pbrF0;
uniform float u_pbrAttenQuad;
uniform float u_pbrGGXEps;

// ---- Rendering surface ----
uniform float u_renderFloorMul;
uniform float u_renderCeilMul;
uniform float u_renderWallDarken;
uniform float u_renderEyeFactor;

const float PI = 3.14159265;

${glslCommon}
${glslMaterial}
${glslPom}
${glslRaymarch}
${glslPbr}
${glslChamfer}
${glslGridChamfer}
${glslModifiers}
${glslScene}

// ==================== MAIN: short dispatch using scene helpers ====================
void main() {
  vec2 fragCoord = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y + u_bobPixels);
  float cameraX = 2.0 * fragCoord.x / u_resolution.x - 1.0;
  float planeLen = tan(u_fov * 0.5);
  vec2 rayDir = vec2(cos(u_playerAngle), sin(u_playerAngle));
  vec2 plane = vec2(-rayDir.y, rayDir.x) * planeLen;
  vec2 ray = rayDir + plane * cameraX;

  vec2 mapPos = floor(u_playerPos);
  vec2 deltaDist = abs(vec2(1.0) / ray);
  ivec2 stepDir = ivec2(ray.x < 0.0 ? -1 : 1, ray.y < 0.0 ? -1 : 1);
  vec2 sideDist;
  sideDist.x = (ray.x < 0.0 ? (u_playerPos.x - mapPos.x) : (mapPos.x + 1.0 - u_playerPos.x)) * deltaDist.x;
  sideDist.y = (ray.y < 0.0 ? (u_playerPos.y - mapPos.y) : (mapPos.y + 1.0 - u_playerPos.y)) * deltaDist.y;

  int hit = 0; int side = 0;
  float perpDist = 0.0;
  vec2 hitPos = vec2(0.0);
  float cellType = 0.0;
  vec3 cornerNormal = vec3(0.0);
  bool hasCornerRound = false;
  float cornerRadius = clamp(u_cornerRadius, 0.02, 0.45);

  for (int i=0;i<64;i++) {
    if (sideDist.x < sideDist.y) { sideDist.x += deltaDist.x; mapPos.x += float(stepDir.x); side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += float(stepDir.y); side = 1; }
    if (mapPos.x < 0.0 || mapPos.y < 0.0 || mapPos.x >= u_mapSize.x || mapPos.y >= u_mapSize.y) break;
    vec4 cell = texelFetch(u_mapTex, ivec2(mapPos), 0);
    cellType = cell.r * 255.0;
    if (cellType > 0.5) {
      float cT; vec2 cHp; vec2 cN; bool cRound;
      if (resolveWallHit(ivec2(mapPos), side, stepDir, ray, cornerRadius, u_cornerEnabled, u_cornerInner, cT, cHp, cN, cRound)) {
        hit = 1; perpDist = cT; hitPos = cHp; cornerNormal = vec3(cN.x,cN.y,0.0); hasCornerRound = cRound; break;
      }
    }
  }

  vec3 finalColor = u_fogColor;
  float wc = u_wallCount > 0.0 ? u_wallCount : 1.0;
  float fc = u_floorCount > 0.0 ? u_floorCount : 1.0;
  float cc = u_ceilCount > 0.0 ? u_ceilCount : 1.0;
  float eyeFactor = u_renderEyeFactor >= 0.0 ? u_renderEyeFactor : 0.15;

  if (hit == 1) {
    float floorH = 0.0; float ceilH = 1.0;
    float wallU; if (side==0) wallU = hitPos.y - floor(hitPos.y); else wallU = hitPos.x - floor(hitPos.x);
    if ((side==0 && ray.x > 0.0) || (side==1 && ray.y < 0.0)) wallU = 1.0 - wallU;
    if (u_authentic == 1) wallU = floor(wallU * 64.0 * 65536.0) / 65536.0 / 64.0;
    float eyeZ = 0.5;
    float wallH_full = u_resolution.y / max(perpDist,0.0001) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov*0.5);
    float drawStart = u_resolution.y * 0.5 - (ceilH - eyeZ) * wallH_full;
    float drawEnd = u_resolution.y * 0.5 + (eyeZ - floorH) * wallH_full;
    float wallV_raw = (fragCoord.y - drawStart) / max(drawEnd - drawStart, 0.001);

    if (wallV_raw < 0.0 || wallV_raw > 1.0) {
      float horizon = 0.5; float vNorm = fragCoord.y / u_resolution.y;
      if (vNorm > horizon) {
        float floorH_atRay = 0.0;
        float dist = (eyeZ - floorH_atRay) / max(0.0001, (vNorm - horizon)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov*0.5);
        dist = max(dist,0.001);
        vec2 floorWorld = u_playerPos + ray * dist;
        vec2 floorUV = fract(floorWorld);
        float matId = fetchFloorMatId(ivec2(floor(floorWorld)));
        float d=0.0;
        finalColor = shadeFloorCell(floorWorld,floorUV,matId,fc,ray,eyeZ,floorH_atRay,d);
        perpDist = dist;
      } else {
        float ceilH_atRay = 1.0;
        float dist = (ceilH_atRay - eyeZ) / max(0.0001, (horizon - vNorm)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov*0.5);
        dist = max(dist,0.001);
        vec2 ceilWorld = u_playerPos + ray * dist;
        vec2 ceilUV = fract(ceilWorld);
        float matId = fetchCeilMatId(ivec2(floor(ceilWorld)));
        float d=0.0;
        finalColor = shadeCeilCell(ceilWorld,ceilUV,matId,cc,ray,eyeZ,ceilH_atRay,d);
        perpDist = dist;
      }
    } else {
      float wallV = clamp(wallV_raw,0.0,1.0);
      float matId = max(1.0, cellType);
      finalColor = shadeWallCell(wallU,wallV,matId,wc,side,stepDir,ray,hitPos,hasCornerRound,cornerNormal);
    }
  } else {
    // No wall hit – use height-aware floor/ceil with 3-iteration refinement
    float horizon = 0.5; float vNorm2 = 1.0 - v_uv.y;
    ivec2 pc = ivec2(floor(u_playerPos));
    float pfH = 0.0;
    if (pc.x>=0 && pc.y>=0 && pc.x < int(u_mapSize.x) && pc.y < int(u_mapSize.y)) {
      vec4 pmd = texelFetch(u_mapTex, pc, 0); pfH = clamp(pmd.g - 0.5, -0.6, 0.6);
    }
    float eyeZ2 = 0.5 + pfH * eyeFactor;
    if (vNorm2 > horizon) {
      float floorH = 0.0; float dist = 0.001; vec2 floorWorld = vec2(0.0);
      for (int it=0; it<3; it++) {
        dist = (eyeZ2 - floorH) / max(0.0001, (vNorm2 - horizon)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov*0.5);
        if (dist < 0.001) dist = 0.001;
        floorWorld = u_playerPos + ray * dist;
        ivec2 fc2 = ivec2(floor(floorWorld));
        if (fc2.x>=0 && fc2.y>=0 && fc2.x < int(u_mapSize.x) && fc2.y < int(u_mapSize.y)) {
          vec4 fmd = texelFetch(u_mapTex, fc2, 0);
          int cellT = int(fmd.r*255.0+0.5);
          if (cellT==0) { floorH = clamp(fmd.g - 0.5, -0.6, 0.6); } else { break; }
        }
      }
      vec2 floorUV = fract(floorWorld);
      float matId = fetchFloorMatId(ivec2(floor(floorWorld)));
      float d=0.0;
      finalColor = shadeFloorCell(floorWorld,floorUV,matId,fc,ray,eyeZ2,floorH,d);
      perpDist = dist;
    } else {
      float ceilH = 1.15; float dist = 0.001; vec2 ceilWorld = vec2(0.0);
      for (int it=0; it<3; it++) {
        dist = (ceilH - eyeZ2) / max(0.0001, (horizon - vNorm2)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov*0.5);
        if (dist < 0.001) dist = 0.001;
        ceilWorld = u_playerPos + ray * dist;
        ivec2 cc2 = ivec2(floor(ceilWorld));
        if (cc2.x>=0 && cc2.y>=0 && cc2.x < int(u_mapSize.x) && cc2.y < int(u_mapSize.y)) {
          vec4 cmd = texelFetch(u_mapTex, cc2, 0);
          int cellT = int(cmd.r*255.0+0.5);
          if (cellT==0) { ceilH = clamp(cmd.b/255.0+0.7, 0.4, 2.2); } else { break; }
        }
      }
      vec2 ceilUV = fract(ceilWorld);
      float matId = fetchCeilMatId(ivec2(floor(ceilWorld)));
      float d=0.0;
      finalColor = shadeCeilCell(ceilWorld,ceilUV,matId,cc,ray,eyeZ2,ceilH,d);
      perpDist = dist;
    }
  }

  if (u_pbrDebugMode == 0) {
    if (u_fogEnabled == 1) {
      float fog = 1.0 / (1.0 + perpDist * u_fogBase + perpDist*perpDist*u_fogSquared);
      finalColor *= fog; finalColor += u_fogColor * (1.0 - fog);
    }
    {
      float maxC = max(max(finalColor.r,finalColor.g),finalColor.b);
      if (maxC > 1.0) {
        float over = clamp((maxC - 1.0)*0.35, 0.0, 0.75);
        vec3 scaled = finalColor / maxC;
        vec3 warmWhite = vec3(1.0,0.94,0.82);
        finalColor = mix(scaled,warmWhite,over);
      }
      finalColor = clamp(finalColor,0.0,1.0);
    }
    if (u_authentic == 1) {
      int bands = max(8, u_bandLevels);
      finalColor = floor(finalColor * float(bands)) / float(bands);
    }
  }
  outColor = vec4(finalColor,1.0);
}
`;

export const vsQuantize = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const fsQuantize = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_palette;
uniform sampler2D u_lut;
uniform int u_authentic;
uniform int u_paletteStyle;
out vec4 outColor;
void main(){
  vec4 sc = texture(u_scene, v_uv);
  if (u_authentic == 0 || u_paletteStyle == 2) { outColor = sc; return; }
  ivec2 lutCoord = ivec2(int(sc.r * 31.99) + int(sc.g * 31.99) * 32, int(sc.b * 31.99));
  float palIdx = float(texture(u_lut, (vec2(lutCoord) + 0.5) / vec2(1024.0, 32.0)).r * 255.0) / 255.0;
  vec3 palCol = texture(u_palette, vec2(palIdx + 0.5/256.0, 0.5)).rgb;
  if (u_paletteStyle == 3) { float g = dot(palCol, vec3(0.299,0.587,0.114)); palCol = vec3(g); }
  else if (u_paletteStyle == 4) { float g = dot(palCol, vec3(0.299,0.587,0.114)); palCol = vec3(min(1.0,g*1.2), min(1.0,g*0.9), min(1.0,g*0.6)); }
  outColor = vec4(palCol, sc.a);
}
`;

export const vsUI = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const fsUI = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_mapUI;
uniform float u_opacity;
out vec4 outColor;
void main(){ vec4 c = texture(u_mapUI, v_uv); outColor = vec4(c.rgb, c.a * u_opacity); }
`;

// --- Sprite billboard shaders — 8 lights ---
export const vsSpriteSrc = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec3 a_center;
in vec2 a_size;
in vec4 a_uvRect;
in float a_alpha;
in float a_normalStrength;
in float a_rimStrength;
uniform vec2 u_resolution;
uniform vec2 u_pos;
uniform float u_angle;
uniform float u_planeLen;
uniform float u_bobPixels;
uniform float u_eyeZ;
out vec2 v_uv;
out vec3 v_worldPos;
out vec3 v_viewDir;
out vec3 v_cameraRight;
out vec3 v_cameraForward;
out float v_alpha;
out float v_normalStrength;
out float v_rimStrength;
out float v_dist;
void main(){
  vec2 dir = vec2(cos(u_angle), sin(u_angle));
  vec2 plane = vec2(-dir.y, dir.x) * u_planeLen;
  vec2 camRight2 = normalize(vec2(-dir.y, dir.x));
  vec3 camRight = vec3(camRight2, 0.0);
  vec3 camUp = vec3(0.0, 0.0, 1.0);
  vec3 camForward = vec3(dir.x, dir.y, 0.0);
  float halfW = a_size.x * 0.5;
  float h = a_size.y;
  vec3 worldPos = a_center + camRight * (a_corner.x * halfW) + camUp * (a_corner.y * h);
  vec2 toCenter = a_center.xy - u_pos;
  float invDet = 1.0 / (plane.x * dir.y - dir.x * plane.y);
  float transformX = invDet * (dir.y * toCenter.x - dir.x * toCenter.y);
  float transformY = invDet * (-plane.y * toCenter.x + plane.x * toCenter.y);
  if (transformY <= 0.12) { gl_Position = vec4(2.0,2.0,0.0,1.0); return; }
  float screenX = 0.5 * (1.0 + transformX / transformY);
  float lineH = u_resolution.y / transformY;
  float bottomZ = a_center.z;
  float topZ = a_center.z + a_size.y;
  float yAtWorldZ = u_resolution.y * 0.5 + lineH * (u_eyeZ - worldPos.z);
  yAtWorldZ -= u_bobPixels;
  float wScreen = lineH * a_size.x;
  float xScreen = screenX * u_resolution.x + a_corner.x * wScreen * 0.5;
  float clipX = (xScreen / u_resolution.x) * 2.0 - 1.0;
  float clipY = 1.0 - (yAtWorldZ / u_resolution.y) * 2.0;
  gl_Position = vec4(clipX, clipY, 0.0, 1.0);
  float u_ = mix(a_uvRect.x, a_uvRect.z, a_corner.x * 0.5 + 0.5);
  float v_ = mix(a_uvRect.w, a_uvRect.y, a_corner.y);
  v_uv = vec2(u_, v_);
  v_worldPos = worldPos;
  v_viewDir = normalize(vec3(u_pos.x, u_pos.y, u_eyeZ) - worldPos);
  v_cameraRight = normalize(camRight);
  v_cameraForward = normalize(camForward);
  v_alpha = a_alpha;
  v_normalStrength = a_normalStrength;
  v_rimStrength = a_rimStrength;
  v_dist = transformY;
}
`;

export const fsSpritePBRSrc = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
in vec3 v_worldPos;
in vec3 v_viewDir;
in vec3 v_cameraRight;
in vec3 v_cameraForward;
in float v_alpha;
in float v_normalStrength;
in float v_rimStrength;
in float v_dist;
out vec4 outColor;
uniform sampler2D u_albedo;
uniform sampler2D u_normal;
uniform sampler2D u_orm;
uniform int u_numLights;
uniform vec3 u_lightPos[8];
uniform vec3 u_lightColor[8];
uniform float u_lightIntensity[8];
uniform float u_lightRadius[8];
uniform int u_lightType[8];
uniform vec3 u_lightDir[8];
uniform float u_lightConeInner[8];
uniform float u_lightConeOuter[8];
uniform float u_lightPulseSpeed[8];
uniform float u_lightPulseAmt[8];
uniform int u_lightNoShadow[8];
uniform float u_time;
uniform vec3 u_sunDir;
uniform float u_sunIntensity;
uniform vec3 u_sunColor;
uniform float u_ambient;
uniform float u_fogBase;
uniform float u_fogSq;
vec3 decodeNormal(vec3 enc){ return normalize(enc * 2.0 - 1.0); }
float attenuate(float dist, float radius){
  if (dist > radius) return 0.0;
  float d = dist / radius;
  return pow(max(0.0, 1.0 - d), 2.0) / (1.0 + d * d * 0.2);
}
void main(){
  vec4 albedoS = texture(u_albedo, v_uv);
  if (albedoS.a < 0.08) discard;
  vec3 albedo = albedoS.rgb;
  vec3 normalEnc = texture(u_normal, v_uv).rgb;
  vec3 normalTS = decodeNormal(normalEnc);
  normalTS.xy *= v_normalStrength;
  normalTS = normalize(normalTS);
  vec3 tangent = normalize(v_cameraRight);
  vec3 bitangent = vec3(0.0,0.0,1.0);
  vec3 geomN = normalize(-v_cameraForward + vec3(0.0,0.0,0.4));
  mat3 TBN = mat3(tangent, bitangent, geomN);
  vec3 N = normalize(TBN * normalTS);
  vec3 orm = texture(u_orm, v_uv).rgb;
  float ao = orm.r;
  float roughness = clamp(orm.g, 0.04, 1.0);
  float metal = clamp(orm.b, 0.0, 1.0);
  vec3 V = normalize(v_viewDir);
  float ambientBoost = 1.6;
  float ambientBase = 0.22;
  vec3 Lo = albedo * (u_ambient * ambientBoost + ambientBase) * ao;
  {
    vec3 L = normalize(-u_sunDir);
    float NdotL = max(dot(N, L), 0.0);
    if (NdotL > 0.0) {
      vec3 H = normalize(V + L);
      float NdotH = max(dot(N, H), 0.0);
      float specPower = mix(64.0, 2.0, roughness);
      float spec = pow(NdotH, specPower) * (1.0 - roughness) * (0.2 + metal * 0.8) * NdotL;
      vec3 diffuse = albedo * NdotL * u_sunIntensity * 0.6;
      Lo += diffuse * u_sunColor;
      Lo += spec * u_sunColor * u_sunIntensity * 0.5;
    }
    float VdotL = dot(V, L);
    float behind = max(0.0, -VdotL);
    if (behind > 0.01) {
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      float rim = fresnel * behind * v_rimStrength * 0.7;
      Lo += vec3(rim, rim * 0.6, rim * 0.3);
    }
  }
  for (int i=0;i<8;i++){
    if (i>=u_numLights) break;
    vec3 lp = u_lightPos[i];
    vec3 toL = lp - v_worldPos;
    float dist = length(toL);
    float radius = u_lightRadius[i];
    if (dist > radius) continue;
    float att = attenuate(dist, radius);
    int lt = u_lightType[i];
    if (lt == 1) {
      vec3 spotDir = normalize(u_lightDir[i]);
      vec3 Ldir = normalize(toL);
      float cosTheta = dot(-Ldir, spotDir);
      float spotAtt = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cosTheta);
      att *= spotAtt;
    }
    if (lt == 2) {
      float flick = 0.72 + 0.28 * sin(u_time * 9.0 + float(i)*2.3) + 0.12 * sin(u_time*17.0 + float(i));
      att *= clamp(flick, 0.45, 1.35);
    } else if (lt == 3) {
      float ps = u_lightPulseSpeed[i]; float pa = u_lightPulseAmt[i];
      if (ps < 0.1) ps = 2.2; if (pa < 0.01) pa = 0.4;
      att *= (1.0 + pa * sin(u_time * ps + float(i)));
    }
    if (att <= 0.01) continue;
    vec3 L = toL / max(dist, 0.001);
    float NdotL = max(dot(N, L), 0.0);
    if (NdotL > 0.0) {
      float attenN = att * (0.35 + 0.65 * NdotL);
      float contrib = attenN * u_lightIntensity[i] * NdotL * 1.15;
      Lo += albedo * contrib * u_lightColor[i];
    }
    if (NdotL > 0.08) {
      vec3 H = normalize(V + L);
      float NdotH = max(dot(N, H), 0.0);
      if (NdotH > 0.18) {
        float specPower = 3.0 + (1.0 - roughness) * 36.0;
        float metalBoost = 0.2 + metal * 1.6;
        float attenN = att * (0.35 + 0.65 * NdotL);
        float spec = pow(NdotH, specPower) * (1.0 - roughness) * metalBoost * max(0.1, NdotL) * attenN;
        Lo += spec * u_lightColor[i];
      }
    }
    float VdotL = dot(V, L);
    float behind = max(0.0, -VdotL);
    float behindSide = max(0.0, -dot(N, L)) * 0.5;
    float NdotV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.0);
    float edgeNorm = length(normalTS.xy);
    float rimBase = max(edgeNorm * 1.8, max(0.0, 1.0 - normalTS.z) * 2.0);
    float rim = rimBase * fresnel * (behind * 0.9 + behindSide) * v_rimStrength * att * (0.7 + metal * 0.8) * 0.35;
    if (rim > 0.001) Lo += vec3(rim, rim * 0.6, rim * 0.3) * u_lightColor[i];
  }
  vec3 color = Lo;
  float fog = 1.0 / (1.0 + v_dist * u_fogBase + v_dist * v_dist * u_fogSq);
  fog = clamp(fog, 0.05, 1.0);
  color *= fog;
  {
    float maxC = max(max(color.r, color.g), color.b);
    if (maxC > 1.0) {
      float over = clamp((maxC - 1.0) * 0.32, 0.0, 0.7);
      vec3 scaled = color / maxC;
      vec3 warmWhite = vec3(1.0, 0.94, 0.82);
      color = mix(scaled, warmWhite, over);
    }
    color = clamp(color, 0.0, 1.0);
  }
  outColor = vec4(color, albedoS.a * v_alpha);
}
`;
