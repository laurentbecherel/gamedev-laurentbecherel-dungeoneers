// GLSL shader sources for WebGL2 raycaster — Task 6 Complete: multi-lights + PBR sprites
// All visual domains exposed via uniforms from dedicated JSONs
// Extends Task 3 with MAX_LIGHTS array and sprite billboard PBR shaders.
// Inspiration from mygame's shaders.js which had MAX_LIGHTS 12 and sprite GPU path.

export const MAX_LIGHTS = 12;
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

in vec2 v_uv;
out vec4 outColor;

uniform vec2  u_resolution;
uniform vec2  u_playerPos;
uniform float u_playerAngle;
uniform float u_fov;
uniform float u_playerHeight;
uniform float u_bobPixels;

uniform sampler2D u_mapTex;
uniform sampler2D u_matMap;
uniform vec2  u_mapSize;

uniform sampler2D u_wallAlbedo, u_wallNormal, u_wallHeight, u_wallRoughMetal;
uniform sampler2D u_floorAlbedo, u_floorNormal, u_floorHeight, u_floorRoughMetal;
uniform sampler2D u_ceilAlbedo,  u_ceilNormal,  u_ceilHeight,  u_ceilRoughMetal;
uniform float u_texSize;
uniform float u_atlasWalls, u_atlasFloors, u_atlasCeils;

uniform int   u_numLights;
uniform vec3  u_lightPos[12];
uniform vec3  u_lightColor[12];
uniform float u_lightIntensity[12];
uniform float u_lightRadius[12];
uniform int   u_lightType[12];
uniform vec3  u_lightDir[12];
uniform float u_lightConeInner[12];
uniform float u_lightConeOuter[12];
uniform float u_lightPulseSpeed[12];
uniform float u_lightPulseAmt[12];
uniform int   u_lightNoShadow[12];
uniform float u_lightFlickerSpeed[12];
uniform float u_lightFlickerAmount[12];
uniform float u_lightPhase[12];
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

// POM core
uniform float u_pomWall;
uniform float u_pomFloor;
uniform float u_pomCeil;
uniform int   u_pomSteps;
// POM extended (pom.json)
uniform float u_pomMaxOffset;
uniform float u_pomMinVz;
uniform float u_pomMinEffVz;
uniform float u_pomFadeStart;
uniform float u_pomFadeEnd;

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

// Chamfer
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
// Chamfer extended trim (chamfer.json)
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

// True geometry rounded corners (corners.json)
uniform int   u_cornerEnabled;
uniform float u_cornerRadius;
uniform int   u_cornerMode; // 0=bevel flat, 1=round outer, 2=round all
uniform int   u_cornerInner;
// Corners extended
uniform float u_cornerBandNear;
uniform float u_cornerBandFarExtra;
uniform float u_cornerBandFarFactor;
uniform float u_cornerSectorThresh;
uniform float u_cornerNormalMix;
uniform float u_cornerAlbedoBoost;
uniform float u_cornerRoughMul;
uniform float u_cornerAoMul;

// Shadows (shadows.json)
uniform float u_shadowBiasN;
uniform float u_shadowBiasDir;
uniform float u_shadowSunFactor;
uniform float u_shadowPointFactor;
uniform float u_shadowSunMax;
uniform float u_shadowPointEps;
uniform float u_shadowNormalThresh;

// PBR extended (pbr.json)
uniform float u_pbrEmissiveAlbedoMul;
uniform float u_pbrEmissiveStrength;
uniform float u_pbrF0;
uniform float u_pbrAttenQuad;
uniform float u_pbrGGXEps;

// Rendering surface (rendering.json)
uniform float u_renderFloorMul;
uniform float u_renderCeilMul;
uniform float u_renderWallDarken;
uniform float u_renderEyeFactor;

const float PI = 3.14159265;

bool isWallCell(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_mapSize.x) || c.y >= int(u_mapSize.y)) return false;
  vec4 m = texelFetch(u_mapTex, c, 0);
  return (m.r * 255.0 > 0.5);
}

float nearestWallDistAndNormal(vec2 world, out vec3 outNorm) {
  ivec2 cell = ivec2(floor(world));
  vec2 f = fract(world);
  float best = 100.0;
  vec3 n = vec3(0.0);
  if (isWallCell(cell + ivec2(1,0))) { float d = 1.0 - f.x; if (d < best) { best = d; n = vec3(-1.0, 0.0, 0.0); } }
  if (isWallCell(cell + ivec2(-1,0))) { float d = f.x; if (d < best) { best = d; n = vec3(1.0, 0.0, 0.0); } }
  if (isWallCell(cell + ivec2(0,1))) { float d = 1.0 - f.y; if (d < best) { best = d; n = vec3(0.0, -1.0, 0.0); } }
  if (isWallCell(cell + ivec2(0,-1))) { float d = f.y; if (d < best) { best = d; n = vec3(0.0, 1.0, 0.0); } }
  outNorm = n;
  return best;
}

bool isOuterConvex(ivec2 W, ivec2 E, ivec2 W2, ivec2 D) {
  return !isWallCell(E) && !isWallCell(W2) && !isWallCell(D);
}
bool isInnerConcave(ivec2 W, ivec2 E, ivec2 W2, ivec2 D) {
  return !isWallCell(E) && isWallCell(W2) && isWallCell(D);
}
bool rayCircleHit(vec2 O, vec2 Dir, vec2 C, float r, out float t0, out float t1) {
  vec2 oc = O - C;
  float a = dot(Dir, Dir);
  float b = 2.0 * dot(oc, Dir);
  float c_ = dot(oc, oc) - r * r;
  float disc = b * b - 4.0 * a * c_;
  if (disc < 0.0) return false;
  float sd = sqrt(disc);
  t0 = (-b - sd) / (2.0 * a);
  t1 = (-b + sd) / (2.0 * a);
  return true;
}

// Resolve whether ray hits solid material in wall cell W, accounting for
// rounded corners. Corners are part of the hit test (not a post-hoc patch), so:
//   - convex corners cut the square back to a quarter-cylinder of radius r;
//     a ray that passes through the cut returns false so the caller keeps
//     marching (nothing is rendered there instead of the old flat wedge).
//   - concave corners add a fillet that bulges toward the room, in front of
//     the flat face; it only ever adds a nearer surface, never reveals behind.
// The arc is tangent to the flat face exactly r from the corner, so the
// arc<->flat join is continuous. Classification is world-space (view independent).
bool resolveWallHit(ivec2 W, int side, ivec2 stepDir, vec2 ray, float cornerR,
                    int cornerEnabled, int cornerInner,
                    out float outT, out vec2 outHp, out vec2 outN, out bool outRounded) {
  // Flat entry face.
  float perp;
  if (side == 0) perp = (float(W.x) - u_playerPos.x + (1.0 - float(stepDir.x)) * 0.5) / ray.x;
  else           perp = (float(W.y) - u_playerPos.y + (1.0 - float(stepDir.y)) * 0.5) / ray.y;
  outT = perp;
  outHp = u_playerPos + ray * perp;
  outN = (side == 0) ? vec2(float(-stepDir.x), 0.0) : vec2(0.0, float(-stepDir.y));
  outRounded = false;
  if (cornerEnabled != 1 || cornerR <= 0.01) return true;

  for (int k = 0; k < 2; k++) {
    int off = (k == 0) ? -1 : 1;
    vec2 P, interiorDir, roomDir;
    float coordAlong, cornerCoord;
    ivec2 E, W2, D;
    if (side == 0) {
      cornerCoord = float(W.y) + (k == 0 ? 0.0 : 1.0);
      coordAlong = outHp.y;
      P = vec2(float(W.x) + (stepDir.x > 0 ? 0.0 : 1.0), cornerCoord);
      interiorDir = vec2(float(stepDir.x), float(-off));
      roomDir     = vec2(float(-stepDir.x), float(-off));
      E  = ivec2(W.x - stepDir.x, W.y);
      W2 = ivec2(W.x, W.y + off);
      D  = ivec2(W.x - stepDir.x, W.y + off);
    } else {
      cornerCoord = float(W.x) + (k == 0 ? 0.0 : 1.0);
      coordAlong = outHp.x;
      P = vec2(cornerCoord, float(W.y) + (stepDir.y > 0 ? 0.0 : 1.0));
      interiorDir = vec2(float(-off), float(stepDir.y));
      roomDir     = vec2(float(-off), float(-stepDir.y));
      E  = ivec2(W.x, W.y - stepDir.y);
      W2 = ivec2(W.x + off, W.y);
      D  = ivec2(W.x + off, W.y - stepDir.y);
    }
    bool outer = isOuterConvex(W, E, W2, D);
    bool inner = (cornerInner == 1) && isInnerConcave(W, E, W2, D);
    if (!outer && !inner) continue;

    if (outer) {
      // Flat face is cut away within r of this corner.
      if (abs(coordAlong - cornerCoord) >= cornerR) continue;
      vec2 C = P + interiorDir * cornerR;
      float t0, t1;
      if (rayCircleHit(u_playerPos, ray, C, cornerR, t0, t1)) {
        for (int r = 0; r < 2; r++) {
          float t = (r == 0) ? t0 : t1;
          if (t <= 0.01) continue;
          vec2 q = u_playerPos + ray * t;
          vec2 offP = q - C;
          if (offP.x * interiorDir.x > 0.0 || offP.y * interiorDir.y > 0.0) continue;
          outT = t; outHp = q; outN = normalize(offP); outRounded = true;
          return true;
        }
      }
      // In the cut region and the arc was missed: ray passes through -> no hit.
      return false;
    } else {
      // Concave fillet: nearer surface bulging into the room; add only.
      vec2 C = P + roomDir * cornerR;
      float t0, t1;
      if (rayCircleHit(u_playerPos, ray, C, cornerR, t0, t1)) {
        for (int r = 0; r < 2; r++) {
          float t = (r == 0) ? t0 : t1;
          if (t <= 0.01 || t >= perp) continue;
          vec2 q = u_playerPos + ray * t;
          vec2 offP = q - C;
          if (offP.x * roomDir.x > 0.0 || offP.y * roomDir.y > 0.0) continue;
          outT = t; outHp = q; outN = normalize(-offP); outRounded = true;
          return true;
        }
      }
    }
  }
  return true;
}

vec2 atlasUV(float matId, vec2 uv, float atlasW, float texS) {
  float tileU = (matId - 1.0 + uv.x) / (atlasW / texS);
  return vec2(tileU, uv.y);
}
vec3 decodeNormal(vec3 enc) { return normalize(enc * 2.0 - 1.0); }

bool traceRay(vec2 origin, vec2 dir, float maxDist) {
  ivec2 mapPos = ivec2(floor(origin));
  vec2 deltaDist = abs(1.0 / dir);
  ivec2 iStep; vec2 sideDist;
  if(dir.x < 0.0){ iStep.x = -1; sideDist.x = (origin.x - float(mapPos.x)) * deltaDist.x; } else { iStep.x = 1; sideDist.x = (float(mapPos.x+1) - origin.x) * deltaDist.x; }
  if(dir.y < 0.0){ iStep.y = -1; sideDist.y = (origin.y - float(mapPos.y)) * deltaDist.y; } else { iStep.y = 1; sideDist.y = (float(mapPos.y+1) - origin.y) * deltaDist.y; }
  int side = 0;
  for(int i=0;i<64;i++){
    if(sideDist.x < sideDist.y){ sideDist.x += deltaDist.x; mapPos.x += iStep.x; side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += iStep.y; side = 1; }
    if(mapPos.x <0 || mapPos.y<0 || mapPos.x >= int(u_mapSize.x) || mapPos.y >= int(u_mapSize.y)) return false;
    float perp = (side==0) ? sideDist.x - deltaDist.x : sideDist.y - deltaDist.y;
    if(perp > maxDist) return false;
    vec4 ms = texelFetch(u_mapTex, mapPos, 0);
    int cell = int(ms.r*255.0+0.5);
    if(cell>0){ return true; }
  }
  return false;
}
float DistributionGGX(vec3 N, vec3 H, float roughness){
  float a = roughness*roughness; float a2=a*a;
  float NdotH = max(dot(N,H),0.0); float NdotH2=NdotH*NdotH;
  float num=a2; float denom=(NdotH2*(a2-1.0)+1.0); denom=PI*denom*denom;
  return num / max(denom, u_pbrGGXEps > 0.0 ? u_pbrGGXEps : 0.0001);
}
float GeometrySchlickGGX(float NdotV, float roughness){
  float r=(roughness+1.0); float k=(r*r)/8.0; return NdotV/(NdotV*(1.0-k)+k);
}
float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness){
  float NdotV=max(dot(N,V),0.0); float NdotL=max(dot(N,L),0.0);
  return GeometrySchlickGGX(NdotV,roughness) * GeometrySchlickGGX(NdotL,roughness);
}
vec3 fresnelSchlick(float cosTheta, vec3 F0){ return F0 + (1.0-F0)*pow(clamp(1.0-cosTheta,0.0,1.0),5.0); }

vec2 pomOffset(sampler2D heightMap, vec2 uv, vec3 viewTS, float strength, int steps) {
  if (strength <= 0.00001) return vec2(0.0);
  float minVz = u_pomMinVz > 0.0 ? u_pomMinVz : 0.08;
  float minEff = u_pomMinEffVz > 0.0 ? u_pomMinEffVz : 0.18;
  float fadeStart = u_pomFadeStart > 0.0 ? u_pomFadeStart : 0.08;
  float fadeEnd = u_pomFadeEnd > 0.0 ? u_pomFadeEnd : 0.22;
  float maxOff = u_pomMaxOffset > 0.0 ? u_pomMaxOffset : 0.10;
  float vzAbs = abs(viewTS.z);
  if (vzAbs < minVz) return vec2(0.0);
  float layerDepth = 1.0 / float(steps);
  float effVz = max(vzAbs, minEff);
  vec2 fullOffset = viewTS.xy * strength / effVz;
  float fade = 1.0;
  if (vzAbs < fadeEnd) fade = (vzAbs - fadeStart) / max(0.001, (fadeEnd - fadeStart));
  float lenOff = length(fullOffset);
  if (lenOff > maxOff) fullOffset *= maxOff / lenOff;
  fullOffset *= clamp(fade, 0.0, 1.0);
  vec2 delta = fullOffset / float(steps);
  vec2 curUV = uv - fullOffset * 0.5;
  float curDepth = 0.0;
  float height = texture(heightMap, curUV).r;
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    if (curDepth >= height) break;
    curUV += delta;
    height = texture(heightMap, curUV).r;
    curDepth += layerDepth;
  }
  return curUV - uv;
}
vec3 debugShowPBR(int mode, vec3 albedoRaw, vec3 normalRaw, vec3 worldN, float heightVal, vec4 rma, vec3 emissive) {
  if (mode == 1) return albedoRaw;
  if (mode == 2) return normalRaw;
  if (mode == 3) return worldN * 0.5 + 0.5;
  if (mode == 4) return vec3(heightVal);
  if (mode == 5) return vec3(rma.r);
  if (mode == 6) return vec3(rma.g);
  if (mode == 7) return vec3(rma.a);
  if (mode == 8) return emissive;
  return albedoRaw;
}
vec3 pbrShade(vec3 albedo, vec3 N, float rough, float metal, float ao, vec3 emissive, vec3 worldPos, vec3 viewDir) {
  if (u_lightingEnabled == 0) { return albedo; }
  float aoSunEff = mix(1.0, ao, clamp(u_aoSun, 0.0, 1.0));
  float aoPointEff = mix(1.0, ao, clamp(u_aoPoint, 0.0, 1.0));
  float aoAmbEff = mix(1.0, ao, clamp(u_aoAmbient, 0.0, 1.0));
  vec3 ng = vec3(N.x, N.y, 0.0);
  float ngLen = length(ng);
  vec3 traceN;
  float ntThresh = u_shadowNormalThresh > 0.0 ? u_shadowNormalThresh : 0.02;
  if (ngLen < ntThresh) traceN = vec3(0.0, 0.0, 1.0);
  else {
    ng /= ngLen;
    if (abs(ng.x) > abs(ng.y)) traceN = vec3(sign(ng.x), 0.0, 0.0);
    else traceN = vec3(0.0, sign(ng.y), 0.0);
  }

  float biasN = u_shadowBiasN > 0.0 ? u_shadowBiasN : 0.10;
  float biasDir = u_shadowBiasDir > 0.0 ? u_shadowBiasDir : 0.06;
  float sunShadFactor = u_shadowSunFactor > 0.0 ? u_shadowSunFactor : 0.25;
  float pointShadFactor = u_shadowPointFactor > 0.0 ? u_shadowPointFactor : 0.15;
  float sunMax = u_shadowSunMax > 0.0 ? u_shadowSunMax : 20.0;
  float pointEps = u_shadowPointEps >= 0.0 ? u_shadowPointEps : 0.1;

  float f0d = u_pbrF0 > 0.0 ? u_pbrF0 : 0.04;
  vec3 F0 = mix(vec3(f0d), albedo, metal);
  vec3 Lo = vec3(0.0);

  // Sun
  vec3 sunDir = normalize(vec3(u_sunDir.xy, u_sunDirZ));
  vec3 Lsun = -sunDir;
  float sunShadow = 1.0;
  {
    vec2 sDirSun = normalize(Lsun.xy);
    vec2 sOriginSun = worldPos.xy + traceN.xy * biasN + sDirSun * biasDir;
    if (length(sDirSun) > 0.01 && traceRay(sOriginSun, sDirSun, sunMax)) sunShadow = sunShadFactor;
  }
  {
    vec3 H = normalize(viewDir + Lsun);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, viewDir, Lsun, rough);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    vec3 numerator = NDF * G * F;
    float denom = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lsun), 0.0) + max(u_pbrGGXEps, 0.0001);
    vec3 specular = numerator / denom;
    vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
    float NdotL = max(dot(N, Lsun), 0.0);
    Lo += (kD * albedo / 3.14159265 + specular) * u_sunColor * u_sunIntensity * NdotL * sunShadow * aoSunEff;
  }

  // Many point lights (torches/braziers) — Task 6
  for (int i = 0; i < 12; i++) {
    if (i >= u_numLights) break;
    vec3 lPos = u_lightPos[i];
    // skip zeroed lights
    if (u_lightIntensity[i] <= 0.001) continue;
    vec3 Lvec = lPos - worldPos;
    float dist = length(Lvec);
    float radius = u_lightRadius[i];
    if (dist > radius) continue;
    if (dist < 0.001) continue;
    Lvec /= dist;
    float atten = clamp(1.0 - dist / radius, 0.0, 1.0);
    // quadratic falloff + configurable quad factor if present, else simple square
    atten *= atten;
    atten = atten / (1.0 + (dist/radius)*(dist/radius) * max(u_pbrAttenQuad, 0.0));

    // Shadow: skip if flagged noShadow (emissive/ambient/crystal)
    float shadow = 1.0;
    if (u_lightNoShadow[i] == 0) {
      vec2 shDir = normalize(Lvec.xy);
      vec2 shOrigin = worldPos.xy + traceN.xy * biasN + shDir * biasDir;
      if (length(shDir) > 0.01 && traceRay(shOrigin, shDir, dist - pointEps)) shadow = pointShadFactor;
    }

    // Spot cone
    int lType = u_lightType[i];
    if (lType == 1) {
      vec3 spotDir = normalize(u_lightDir[i]);
      float cosTheta = dot(-Lvec, spotDir);
      float inner = u_lightConeInner[i];
      float outer = u_lightConeOuter[i];
      float spotAtt = smoothstep(outer, inner, cosTheta);
      atten *= spotAtt;
      if (spotAtt <= 0.01) continue;
    }

    // Flicker / Pulse already baked into intensity on CPU via organic factor,
    // but shader retains cheap visual flicker for extra liveliness when type==flicker
    if (lType == 2) {
      // cheap extra flicker (sin) layered on top of CPU organic intensity
      float fSpeed = u_lightFlickerSpeed[i] > 0.1 ? u_lightFlickerSpeed[i] : 6.0;
      float fAmt = u_lightFlickerAmount[i] > 0.001 ? u_lightFlickerAmount[i] : 0.12;
      float ph = u_lightPhase[i];
      float flickAdd = 0.92 + 0.08 * sin(u_time * fSpeed + ph * 1.7 + float(i)*0.9) + 0.05 * sin(u_time * fSpeed * 1.9 + ph*2.3);
      atten *= clamp(flickAdd, 0.68, 1.22);
    } else if (lType == 3) {
      float ps = u_lightPulseSpeed[i]; float pa = u_lightPulseAmt[i];
      if (ps > 0.1 && pa > 0.01) {
        float pulse = 1.0 + pa * sin(u_time * ps + u_lightPhase[i] + float(i)*0.7);
        atten *= pulse;
      }
    }

    vec3 H = normalize(viewDir + Lvec);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, viewDir, Lvec, rough);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    vec3 numerator2 = NDF * G * F;
    float denom2 = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lvec), 0.0) + max(u_pbrGGXEps, 0.0001);
    vec3 specular = numerator2 / denom2;
    vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
    float NdotL = max(dot(N, Lvec), 0.0);
    Lo += (kD * albedo / 3.14159265 + specular) * u_lightColor[i] * u_lightIntensity[i] * atten * NdotL * shadow * aoPointEff;
  }

  vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * aoAmbEff;
  vec3 color = ambient + Lo + emissive;
  return color;
}

void main() {
  // Task 4: vertical bob as screen-space pixel offset like mygame — u_bobPixels = viewBobOffset * h * 0.8
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

  for (int i = 0; i < 64; i++) {
    if (sideDist.x < sideDist.y) { sideDist.x += deltaDist.x; mapPos.x += float(stepDir.x); side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += float(stepDir.y); side = 1; }
    if (mapPos.x < 0.0 || mapPos.y < 0.0 || mapPos.x >= u_mapSize.x || mapPos.y >= u_mapSize.y) break;
    vec4 cell = texelFetch(u_mapTex, ivec2(mapPos), 0);
    cellType = cell.r * 255.0;
    if (cellType > 0.5) {
      // Corner-aware hit test: rounded corners participate in the hit so a ray
      // that passes through a cut convex corner keeps marching instead of
      // rendering a stray flat wedge.
      float cT; vec2 cHp; vec2 cN; bool cRound;
      if (resolveWallHit(ivec2(mapPos), side, stepDir, ray, cornerRadius,
                         u_cornerEnabled, u_cornerInner, cT, cHp, cN, cRound)) {
        hit = 1;
        perpDist = cT;
        hitPos = cHp;
        cornerNormal = vec3(cN.x, cN.y, 0.0);
        hasCornerRound = cRound;
        break;
      }
      // else: corner rounded away here — continue the DDA.
    }
  }

  vec3 finalColor = u_fogColor;

  // uniforms with fallback
  float emissiveAlbedoMul = u_pbrEmissiveAlbedoMul > 0.0 ? u_pbrEmissiveAlbedoMul : 0.8;
  float emissiveStrength = u_pbrEmissiveStrength > 0.0 ? u_pbrEmissiveStrength : 2.5;
  float floorMul = u_renderFloorMul > 0.0 ? u_renderFloorMul : 0.7;
  float ceilMul = u_renderCeilMul > 0.0 ? u_renderCeilMul : 0.8;
  float wallDarken = u_renderWallDarken > 0.0 ? u_renderWallDarken : 0.85;
  float eyeFactor = u_renderEyeFactor >= 0.0 ? u_renderEyeFactor : 0.15;
  float trimFloor = u_chamferTrimFloor > 0.0 ? u_chamferTrimFloor : 0.22;
  float trimCeil = u_chamferTrimCeil > 0.0 ? u_chamferTrimCeil : 0.18;
  float trimWall = u_chamferTrimWall > 0.0 ? u_chamferTrimWall : 0.16;
  float trimFloorAlt = u_chamferTrimFloorAlt > 0.0 ? u_chamferTrimFloorAlt : 0.18;
  float trimCeilAlt = u_chamferTrimCeilAlt > 0.0 ? u_chamferTrimCeilAlt : 0.14;
  float creviceEnd = u_chamferCreviceEnd > 0.0 ? u_chamferCreviceEnd : 0.12;
  float creviceSmooth = u_chamferCreviceSmoothEnd > 0.0 ? u_chamferCreviceSmoothEnd : 0.30;
  float tStart = u_chamferTrimStart >= 0.0 ? u_chamferTrimStart : 0.08;
  float tMid = u_chamferTrimMid > 0.0 ? u_chamferTrimMid : 0.35;
  float tEnd = u_chamferTrimEnd > 0.0 ? u_chamferTrimEnd : 1.0;
  float nMix = u_cornerNormalMix > 0.0 ? u_cornerNormalMix : 0.92;
  float albBoost = u_cornerAlbedoBoost >= 0.0 ? u_cornerAlbedoBoost : 0.05;
  float roughMul = u_cornerRoughMul > 0.0 ? u_cornerRoughMul : 0.82;
  float aoMul = u_cornerAoMul > 0.0 ? u_cornerAoMul : 0.96;

  if (hit == 1) {

    float floorH = 0.0;
    float ceilH = 1.0;

    float wallU;
    if (side == 0) wallU = hitPos.y - floor(hitPos.y);
    else wallU = hitPos.x - floor(hitPos.x);
    if ((side == 0 && ray.x > 0.0) || (side == 1 && ray.y < 0.0)) wallU = 1.0 - wallU;
    if (u_authentic == 1) wallU = floor(wallU * 64.0 * 65536.0) / 65536.0 / 64.0;

    float eyeZ = 0.5;
    float wallH_full = u_resolution.y / max(perpDist, 0.0001) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
    float drawStart = u_resolution.y * 0.5 - (ceilH - eyeZ) * wallH_full;
    float drawEnd = u_resolution.y * 0.5 + (eyeZ - floorH) * wallH_full;
    float wallV_raw = (fragCoord.y - drawStart) / max(drawEnd - drawStart, 0.001);

    if (wallV_raw < 0.0 || wallV_raw > 1.0) {
      float horizon = 0.5;
      // Task 4 fix: floor/ceiling must follow bob — use fragCoord with bobPixels like prototype
      // Prototype uses y = fragCoord (with bob) and floorScreen = y - halfH, ceilScreen = halfH - y
      // So vNorm with bob = fragCoord.y / u_resolution.y
      float vNorm = fragCoord.y / u_resolution.y;
      if (vNorm > horizon) {
        float floorH_atRay = 0.0;
        float dist = (eyeZ - floorH_atRay) / max(0.0001, (vNorm - horizon)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        dist = max(dist, 0.001);
        vec2 floorWorld = u_playerPos + ray * dist;
        vec2 floorUV = fract(floorWorld);
        vec2 fuvAtlas = atlasUV(1.0, floorUV, u_atlasFloors, u_texSize);
        if (u_pomEnabled == 1) {
          vec3 viewDirTS = normalize(vec3(-ray, 0.8));
          vec2 fpo = pomOffset(u_floorHeight, fuvAtlas, viewDirTS, u_pomFloor, u_pomSteps);
          fuvAtlas += fpo;
        }
        vec3 albedoRaw = texture(u_floorAlbedo, fuvAtlas).rgb;
        vec3 normalRaw = texture(u_floorNormal, fuvAtlas).rgb;
        vec3 normalTS = decodeNormal(normalRaw);
        vec3 Nw = normalize(vec3(normalTS.xy, normalTS.z));
        float heightVal = texture(u_floorHeight, fuvAtlas).r;
        vec4 rma = texture(u_floorRoughMetal, fuvAtlas);
        float ao = rma.a;
        vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
        if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
          finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
        } else {
          vec3 albedo = (u_gridDebug == 1) ? vec3(0.0, (fract(floorWorld).x > 0.97 || fract(floorWorld).y > 0.97 ? 1.0 : 0.25) * 0.9, 0.0) : albedoRaw * floorMul;
          vec3 N = (u_gridDebug == 1) ? vec3(0,0,1) : Nw;
          if (u_gridDebug == 1) { rma = vec4(0.9,0,0,1); ao = 1.0; emissive = vec3(0); }
          else {
            if (u_chamferEnabled == 1) {
              vec3 wN; float wd = nearestWallDistAndNormal(floorWorld, wN);
              float fS = max(u_chamferFloorSize, 0.001);
              if (wd < fS && length(wN) > 0.1) {
                float t = wd / fS;
                float bevel = 1.0 - smoothstep(0.0, 1.0, t);
                vec3 cham = normalize(wN + vec3(0.0,0.0,1.0));
                vec3 roundCham = normalize(mix(cham, vec3(0.0,0.0,1.0), smoothstep(0.0,1.0,t)));
                vec3 targetN = (u_chamferRoundCorners==1) ? roundCham : cham;
                N = normalize(mix(N, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
                ao *= mix(u_chamferDarken, 1.0, smoothstep(0.0, creviceSmooth, t));
                float trimBand = smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
                albedo += vec3(trimBand * trimFloorAlt);
                rma.r = mix(rma.r * (1.0 - u_chamferRough*0.5), rma.r, t);
              }
            }
          }
          vec3 worldPos = vec3(floorWorld, floorH_atRay);
          vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
          finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
        }
        perpDist = dist;
      } else {
        float ceilH_atRay = 1.0;
        float dist = (ceilH_atRay - eyeZ) / max(0.0001, (horizon - vNorm)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        dist = max(dist, 0.001);
        vec2 ceilWorld = u_playerPos + ray * dist;
        vec2 ceilUV = fract(ceilWorld);
        vec2 cuvAtlas = atlasUV(1.0, ceilUV, u_atlasCeils, u_texSize);
        if (u_pomEnabled == 1) {
          vec3 viewDirTS_ceil = normalize(vec3(-ray, 0.5));
          vec2 cpo = pomOffset(u_ceilHeight, cuvAtlas, viewDirTS_ceil, u_pomCeil, u_pomSteps);
          cuvAtlas += cpo;
        }
        vec3 albedoRaw = texture(u_ceilAlbedo, cuvAtlas).rgb;
        vec3 normalRaw = texture(u_ceilNormal, cuvAtlas).rgb;
        vec3 normalTS = decodeNormal(normalRaw);
        vec3 Nw = normalize(vec3(normalTS.xy, -normalTS.z));
        float heightVal = texture(u_ceilHeight, cuvAtlas).r;
        vec4 rma = texture(u_ceilRoughMetal, cuvAtlas);
        float ao = rma.a;
        vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
        if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
          finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
        } else {
          vec3 albedo = (u_gridDebug == 1) ? vec3(0.0, 0.0, (fract(ceilWorld).x > 0.97 || fract(ceilWorld).y > 0.97 ? 1.0 : 0.25) * 0.9) : albedoRaw * ceilMul;
          vec3 N = (u_gridDebug == 1) ? vec3(0,0,-1) : Nw;
          if (u_gridDebug == 1) { rma = vec4(0.9,0,0,1); ao = 1.0; emissive = vec3(0); }
          else {
            if (u_chamferEnabled == 1) {
              vec3 wN; float wd = nearestWallDistAndNormal(ceilWorld, wN);
              float cS = max(u_chamferCeilSize, 0.001);
              if (wd < cS && length(wN) > 0.1) {
                float t = wd / cS;
                float bevel = 1.0 - smoothstep(0.0,1.0,t);
                vec3 cham = normalize(wN + vec3(0.0,0.0,-1.0));
                vec3 targetN = (u_chamferRoundCorners==1) ? normalize(mix(vec3(0.0,0.0,-1.0), cham, t)) : cham;
                N = normalize(mix(N, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
                ao *= mix(u_chamferDarken, 1.0, smoothstep(0.0, creviceSmooth, t));
                float trimBand = smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
                albedo += vec3(trimBand * trimCeilAlt);
                rma.r = mix(rma.r * (1.0 - u_chamferRough*0.35), rma.r, t);
              }
            }
          }
          vec3 worldPos = vec3(ceilWorld, ceilH_atRay);
          vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
          finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
        }
        perpDist = dist;
      }
    } else {
      float wallV = clamp(wallV_raw, 0.0, 1.0);
      float matId = max(1.0, cellType);
      vec2 uv = vec2(wallU, wallV);
      vec2 uvAtlas = atlasUV(matId, uv, u_atlasWalls, u_texSize);

      vec3 Ngeom = vec3(0.0);
      vec3 tangent = vec3(0.0);
      vec3 bitangent = vec3(0.0, 0.0, 1.0);
      if (side == 0) {
        Ngeom = vec3(float(-stepDir.x), 0.0, 0.0);
        tangent = vec3(0.0, 1.0, 0.0);
      } else {
        Ngeom = vec3(0.0, float(-stepDir.y), 0.0);
        tangent = vec3(1.0, 0.0, 0.0);
      }

      vec3 worldPos = vec3(hitPos.x, hitPos.y, u_playerHeight + (wallV - 0.5));
      vec3 viewDir = normalize(vec3(u_playerPos, u_playerHeight) - worldPos);
      vec3 viewTS = vec3(dot(viewDir, tangent), dot(viewDir, bitangent), dot(viewDir, Ngeom));

      vec2 uvPOM = uvAtlas;
      if (u_pomEnabled == 1) {
        vec2 po = pomOffset(u_wallHeight, uvAtlas, viewTS, u_pomWall, u_pomSteps);
        uvPOM = uvAtlas + po;
      }
      vec3 albedoRaw = texture(u_wallAlbedo, uvPOM).rgb;
      vec3 normalRaw = texture(u_wallNormal, uvPOM).rgb;
      vec3 normalTSw = decodeNormal(normalRaw);
      float heightVal = texture(u_wallHeight, uvPOM).r;
      vec4 rmaW = texture(u_wallRoughMetal, uvPOM);
      vec3 emissiveW = albedoRaw * emissiveAlbedoMul * rmaW.b * emissiveStrength;
      vec3 Nw = normalize(tangent * normalTSw.x + bitangent * normalTSw.y + Ngeom * normalTSw.z);

      if (hasCornerRound && u_pbrDebugMode == 0 && u_gridDebug == 0) {
        vec3 cn = cornerNormal;
        if (u_cornerMode == 0) {
          vec3 n2 = (side == 0) ? vec3(0.0, (wallU < 0.5 ? -1.0 : 1.0), 0.0) : vec3((wallU < 0.5 ? -1.0 : 1.0), 0.0, 0.0);
          cn = normalize(Ngeom + n2);
        }
        Nw = normalize(mix(Nw, cn, nMix));
        albedoRaw += vec3(albBoost);
        rmaW.r *= roughMul;
        rmaW.a *= aoMul;
      }

      if (u_chamferEnabled == 1 && u_pbrDebugMode == 0 && u_gridDebug == 0) {
        {
          float fS = max(u_chamferFloorSize, 0.04);
          float cS = max(u_chamferCeilSize, 0.04);
          if (wallV < fS) {
            float t = wallV / fS;
            float bevel = 1.0 - smoothstep(0.0, 1.0, t);
            vec3 up = vec3(0.0, 0.0, 1.0);
            vec3 chamGeom = normalize(Ngeom + up);
            vec3 chamRound = normalize(mix(up, chamGeom, smoothstep(0.0, 1.0, t)));
            vec3 targetN = (u_chamferRoundCorners==1) ? chamRound : chamGeom;
            Nw = normalize(mix(Nw, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
            float aoT = smoothstep(0.0, creviceEnd, t);
            rmaW.a *= mix(u_chamferDarken, 1.0, aoT);
            float trim = smoothstep(tStart, 0.32, t) * (1.0 - smoothstep(0.32, 1.0, t));
            albedoRaw += vec3(trim * trimFloor);
            rmaW.r *= mix(0.58, 1.0, t);
          }
          if ((1.0 - wallV) < cS) {
            float t = (1.0 - wallV) / cS;
            float bevel = 1.0 - smoothstep(0.0, 1.0, t);
            vec3 down = vec3(0.0, 0.0, -1.0);
            vec3 chamGeom = normalize(Ngeom + down);
            vec3 targetN = (u_chamferRoundCorners==1) ? normalize(mix(down, chamGeom, smoothstep(0.0,1.0,t))) : chamGeom;
            Nw = normalize(mix(Nw, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
            float aoT = smoothstep(0.0, creviceEnd, t);
            rmaW.a *= mix(u_chamferDarken, 1.0, aoT);
            float trim = smoothstep(tStart, 0.32, t) * (1.0 - smoothstep(0.32, 1.0, t));
            albedoRaw += vec3(trim * trimCeil);
            rmaW.r *= mix(0.62, 1.0, t);
          }
        }
        if (!hasCornerRound) {
          float vS = max(u_chamferWallSize, 0.04);
          float e = min(wallU, 1.0 - wallU);
          if (e < vS) {
            float t = e / vS;
            float bevel = 1.0 - smoothstep(0.0, 1.0, t);
            vec3 n2;
            if (side == 0) {
              n2 = (wallU < 0.5) ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0);
            } else {
              n2 = (wallU < 0.5) ? vec3(-1.0, 0.0, 0.0) : vec3(1.0, 0.0, 0.0);
            }
            vec3 diag = normalize(Ngeom + n2);
            Nw = normalize(mix(Nw, diag, bevel * clamp(u_chamferBlendWall,0.0,1.0)));
            rmaW.a *= mix(u_chamferDarken*0.88 + 0.12, 1.0, smoothstep(0.0, 0.45, t));
            rmaW.r *= mix(0.65, 1.0, smoothstep(0.0, 1.0, t));
            float trim = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.25, 1.0, t));
            albedoRaw += vec3(trim * trimWall);
          }
        }
      }

      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
        finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rmaW, emissiveW);
      } else if (u_gridDebug == 1) {
        float wallH = ceilH - floorH;
        vec2 wuv = vec2(fract(wallU), fract(wallV * wallH));
        float grid = (wuv.x > 0.95 || wuv.y > 0.95 || wuv.x < 0.05 || wuv.y < 0.05) ? 1.0 : 0.25;
        finalColor = vec3(grid * 0.9, 0.0, 0.0);
      } else {
        finalColor = pbrShade(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, emissiveW, worldPos, viewDir);
      }
      if (side == 1 && u_pbrDebugMode == 0 && u_gridDebug == 0) finalColor *= wallDarken;
    }
  } else {
    float horizon = 0.5;
    float vNorm2 = 1.0 - v_uv.y;
    ivec2 pc = ivec2(floor(u_playerPos));
    float pfH = 0.0;
    if (pc.x >= 0 && pc.y >= 0 && pc.x < int(u_mapSize.x) && pc.y < int(u_mapSize.y)) {
      vec4 pmd = texelFetch(u_mapTex, pc, 0); pfH = clamp(pmd.g - 0.5, -0.6, 0.6);
    }
    float eyeZ2 = 0.5 + pfH * eyeFactor;
    if (vNorm2 > horizon) {
      float floorH = 0.0;
      float dist = 0.001;
      vec2 floorWorld = vec2(0.0);
      for (int it = 0; it < 3; it++) {
        dist = (eyeZ2 - floorH) / max(0.0001, (vNorm2 - horizon)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) dist = 0.001;
        floorWorld = u_playerPos + ray * dist;
        ivec2 fc = ivec2(floor(floorWorld));
        if (fc.x >= 0 && fc.y >= 0 && fc.x < int(u_mapSize.x) && fc.y < int(u_mapSize.y)) {
          vec4 fmd = texelFetch(u_mapTex, fc, 0);
          int cellT = int(fmd.r * 255.0 + 0.5);
          if (cellT == 0) { floorH = clamp(fmd.g - 0.5, -0.6, 0.6); } else { break; }
        }
      }
      vec2 floorUV = fract(floorWorld);
      vec2 fuvAtlas = atlasUV(1.0, floorUV, u_atlasFloors, u_texSize);
      if (u_pomEnabled == 1) {
        vec3 viewDirTS2 = normalize(vec3(-ray, 0.8));
        vec2 fpo = pomOffset(u_floorHeight, fuvAtlas, viewDirTS2, u_pomFloor, u_pomSteps);
        fuvAtlas += fpo;
      }
      vec3 albedoRaw = texture(u_floorAlbedo, fuvAtlas).rgb;
      vec3 normalRaw = texture(u_floorNormal, fuvAtlas).rgb;
      vec3 normalTS = decodeNormal(normalRaw);
      vec3 Nw = normalize(vec3(normalTS.xy, normalTS.z));
      float heightVal = texture(u_floorHeight, fuvAtlas).r;
      vec4 rma = texture(u_floorRoughMetal, fuvAtlas);
      float ao = rma.a;
      vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
        finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
      } else {
        vec3 albedo = (u_gridDebug == 1) ? vec3(0.0, (fract(floorWorld).x > 0.97 || fract(floorWorld).y > 0.97 ? 1.0 : 0.25) * 0.9, 0.0) : albedoRaw * floorMul;
        vec3 N = (u_gridDebug == 1) ? vec3(0,0,1) : Nw;
        if (u_gridDebug == 1) { rma = vec4(0.9,0,0,1); ao = 1.0; emissive = vec3(0); }
        else {
          if (u_chamferEnabled == 1) {
            vec3 wN; float wd = nearestWallDistAndNormal(floorWorld, wN);
            float fS = max(u_chamferFloorSize, 0.001);
            if (wd < fS && length(wN) > 0.1) {
              float t = wd / fS;
              float bevel = 1.0 - smoothstep(0.0, 1.0, t);
              vec3 cham = normalize(wN + vec3(0.0,0.0,1.0));
              N = normalize(mix(N, cham, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
              ao *= mix(u_chamferDarken, 1.0, smoothstep(0.0, creviceSmooth, t));
              float trimBand = smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
              albedo += vec3(trimBand * trimFloorAlt);
              rma.r = mix(rma.r * (1.0 - u_chamferRough*0.5), rma.r, t);
            }
          }
        }
        vec3 worldPos = vec3(floorWorld, floorH);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
      }
      perpDist = dist;
    } else {
      float ceilH = 1.15;
      float dist = 0.001;
      vec2 ceilWorld = vec2(0.0);
      for (int it = 0; it < 3; it++) {
        dist = (ceilH - eyeZ2) / max(0.0001, (horizon - vNorm2)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) dist = 0.001;
        ceilWorld = u_playerPos + ray * dist;
        ivec2 cc = ivec2(floor(ceilWorld));
        if (cc.x >= 0 && cc.y >= 0 && cc.x < int(u_mapSize.x) && cc.y < int(u_mapSize.y)) {
          vec4 cmd = texelFetch(u_mapTex, cc, 0);
          int cellT = int(cmd.r * 255.0 + 0.5);
          if (cellT == 0) { ceilH = clamp(cmd.b / 255.0 + 0.7, 0.4, 2.2); } else { break; }
        }
      }
      vec2 ceilUV = fract(ceilWorld);
      vec2 cuvAtlas = atlasUV(1.0, ceilUV, u_atlasCeils, u_texSize);
      if (u_pomEnabled == 1) {
        vec3 viewDirTS_ceil2 = normalize(vec3(-ray, 0.5));
        vec2 cpo2 = pomOffset(u_ceilHeight, cuvAtlas, viewDirTS_ceil2, u_pomCeil, u_pomSteps);
        cuvAtlas += cpo2;
      }
      vec3 albedoRaw = texture(u_ceilAlbedo, cuvAtlas).rgb;
      vec3 normalRaw = texture(u_ceilNormal, cuvAtlas).rgb;
      vec3 normalTS = decodeNormal(normalRaw);
      vec3 Nw = normalize(vec3(normalTS.xy, -normalTS.z));
      float heightVal = texture(u_ceilHeight, cuvAtlas).r;
      vec4 rma = texture(u_ceilRoughMetal, cuvAtlas);
      float ao = rma.a;
      vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
        finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
      } else {
        vec3 albedo = (u_gridDebug == 1) ? vec3(0.0, 0.0, (fract(ceilWorld).x > 0.97 || fract(ceilWorld).y > 0.97 ? 1.0 : 0.2) * 0.9) : albedoRaw * ceilMul;
        vec3 N = (u_gridDebug == 1) ? vec3(0,0,-1) : Nw;
        if (u_gridDebug == 1) { rma = vec4(0.9,0,0,1); ao = 1.0; emissive = vec3(0); }
        else {
          if (u_chamferEnabled == 1) {
            vec3 wN; float wd = nearestWallDistAndNormal(ceilWorld, wN);
            float cS = max(u_chamferCeilSize, 0.001);
            if (wd < cS && length(wN) > 0.1) {
              float t = wd / cS;
              float bevel = 1.0 - smoothstep(0.0, 1.0, t);
              vec3 cham = normalize(wN + vec3(0.0,0.0,-1.0));
              N = normalize(mix(N, cham, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
              ao *= mix(u_chamferDarken, 1.0, smoothstep(0.0, creviceSmooth, t));
              float trimBand = smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
              albedo += vec3(trimBand * trimCeilAlt);
              rma.r = mix(rma.r * (1.0 - u_chamferRough*0.3), rma.r, t);
            }
          }
        }
        vec3 worldPos = vec3(ceilWorld, ceilH);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
      }
      perpDist = dist;
    }
  }

  if (u_pbrDebugMode == 0) {
    if (u_fogEnabled == 1) {
      float fog = 1.0 / (1.0 + perpDist * u_fogBase + perpDist * perpDist * u_fogSquared);
      finalColor *= fog;
      finalColor += u_fogColor * (1.0 - fog);
    }
    if (u_authentic == 1) {
      int bands = max(8, u_bandLevels);
      finalColor = floor(finalColor * float(bands)) / float(bands);
    }
  }
  outColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
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

// --- Sprite GPU billboard shaders — Task 6 ---
// Adapted from mygame's vsSpriteSrc / fsSpritePBRSrc which rendered PBR lit characters
// sharing sun+torch uniforms. Here reused for environmental sprites (torch wall sconce, brazier).

export const vsSpriteSrc = `#version 300 es
precision highp float;
// Sprite billboard vertex shader — instanced quads facing camera.
// Projection matches raycast camera.

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
uniform vec3 u_lightPos[12];
uniform vec3 u_lightColor[12];
uniform float u_lightIntensity[12];
uniform float u_lightRadius[12];
uniform int u_lightType[12];
uniform vec3 u_lightDir[12];
uniform float u_lightConeInner[12];
uniform float u_lightConeOuter[12];
uniform float u_lightPulseSpeed[12];
uniform float u_lightPulseAmt[12];
uniform int u_lightNoShadow[12];
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
  for (int i=0;i<12;i++){
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
    } else if (lt == 6) {
    } else if (lt == 4 || lt == 5) {
    } else {
      float flick = 0.85 + 0.15 * sin(u_time * 6.0 + float(i) * 1.7) + 0.08 * sin(u_time * 9.0 + float(i) * 2.3);
      att *= flick;
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
  float fog = 1.0 / (1.0 + v_dist * u_fogBase + v_dist * v_dist * u_fogSq);
  fog = clamp(fog, 0.06, 1.0);
  float fogDark = 0.68 + fog * 0.32;
  Lo *= fogDark;
  float alphaFade = 1.0;
  if (v_dist > 14.0) alphaFade = max(0.12, 1.0 - (v_dist - 14.0) * 0.09);
  float alphaOut = albedoS.a * v_alpha * alphaFade;
  outColor = vec4(clamp(Lo, 0.0, 1.5), alphaOut);
}
`;

// Particle shaders — simple additive for flame/sparking, Task 6
export const vsParticleSrc = `#version 300 es
in vec2 a_pos;
in vec3 a_center;
in float a_size;
in vec4 a_color;
uniform vec2 u_resolution;
uniform vec2 u_pos;
uniform float u_angle;
uniform float u_planeLen;
uniform float u_bobPixels;
uniform float u_eyeZ;
out vec4 v_color;
out float v_dist;
void main(){
  vec2 dir = vec2(cos(u_angle), sin(u_angle));
  vec2 plane = vec2(-dir.y, dir.x) * u_planeLen;
  vec2 toC = a_center.xy - u_pos;
  float invDet = 1.0 / (plane.x * dir.y - dir.x * plane.y);
  float tx = invDet * (dir.y * toC.x - dir.x * toC.y);
  float ty = invDet * (-plane.y * toC.x + plane.x * toC.y);
  if (ty <= 0.15) { gl_Position = vec4(2.0,2.0,0.0,1.0); return; }
  float sx = 0.5 * (1.0 + tx / ty);
  float lineH = u_resolution.y / ty;
  float yWorld = u_resolution.y * 0.5 + lineH * (u_eyeZ - a_center.z) - u_bobPixels;
  float xScreen = sx * u_resolution.x + a_pos.x * a_size * lineH * 0.5;
  float yScreen = yWorld + a_pos.y * a_size * lineH * 0.5;
  float clipX = (xScreen / u_resolution.x) * 2.0 - 1.0;
  float clipY = 1.0 - (yScreen / u_resolution.y) * 2.0;
  gl_Position = vec4(clipX, clipY, 0.0, 1.0);
  v_color = a_color;
  v_dist = ty;
}
`;

export const fsParticleSrc = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_dist;
out vec4 outColor;
uniform float u_fogBase;
uniform float u_fogSq;
void main(){
  float fog = 1.0 / (1.0 + v_dist * u_fogBase + v_dist * v_dist * u_fogSq);
  fog = clamp(fog, 0.06, 1.0);
  outColor = vec4(v_color.rgb * fog, v_color.a);
}
`;
