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

// Grid tile chamfer (chamfer.json grid + gridRanges) — Task 8: subtle 1m grout
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
 // Material Modifiers - Task 9: moss, damaged, water, puddle, blood, dust
// Generator provides per-cell intensity map (40x40 trivial) + shader evaluates noise mask + AO/height/rough cues
uniform int   u_modEnabled;
uniform sampler2D u_modTex; // packed double-height: top=RGBA moss/damaged/water/puddle, bottom=R=blood G=dust
uniform vec2  u_modMapSize;
uniform int   u_modDebugOverlay;
// Moss
uniform int   u_modMossEnabled;
uniform vec3  u_modMossAlbedo;
uniform vec3  u_modMossAlbedo2;
uniform float u_modMossAlbedoStr;
uniform float u_modMossRoughAdd;
uniform float u_modMossRoughMin;
uniform float u_modMossRoughMax;
uniform float u_modMossHeightAdd;
uniform float u_modMossNormalStr;
uniform float u_modMossNoiseScale;
uniform float u_modMossThresh;
uniform float u_modMossSoft;
uniform float u_modMossSeed;
// Damaged
uniform int   u_modDamagedEnabled;
uniform float u_modDamagedDarken;
uniform float u_modDamagedDarkenStr;
uniform float u_modDamagedDesat;
uniform float u_modDamagedRoughAdd;
uniform float u_modDamagedHeightAdd;
uniform float u_modDamagedNormalStr;
uniform float u_modDamagedNoiseScale;
uniform float u_modDamagedThresh;
uniform float u_modDamagedSoft;
uniform float u_modDamagedSeed;
// Water
uniform int   u_modWaterEnabled;
uniform float u_modWaterDarken;
uniform float u_modWaterDarkenStr;
uniform float u_modWaterRoughAdd;
uniform float u_modWaterRoughMin;
uniform float u_modWaterHeightAdd;
uniform float u_modWaterFlat;
uniform float u_modWaterStreak;
uniform float u_modWaterNoiseScale;
uniform float u_modWaterStreakScale;
uniform float u_modWaterThresh;
uniform float u_modWaterSoft;
uniform float u_modWaterSeed;
// Puddle
uniform int   u_modPuddleEnabled;
uniform float u_modPuddleAlbedoDarken;
uniform float u_modPuddleRoughTarget;
uniform float u_modPuddleRoughEdge;
uniform float u_modPuddleRoughLerp;
uniform float u_modPuddleHeightDepress;
uniform float u_modPuddleFlat;
uniform float u_modPuddleRipple;
uniform float u_modPuddleNoiseScale;
uniform float u_modPuddleThresh;
uniform float u_modPuddleSoft;
uniform float u_modPuddleRippleScale;
uniform float u_modPuddleSeed;
uniform float u_modPuddleFoamBright;
// Blood
uniform int   u_modBloodEnabled;
uniform vec3  u_modBloodAlbedo;
uniform vec3  u_modBloodAlbedo2;
uniform float u_modBloodAlbedoStr;
uniform float u_modBloodRoughAdd;
uniform float u_modBloodHeightAdd;
uniform float u_modBloodNormalStr;
uniform float u_modBloodNoiseScale;
uniform float u_modBloodThresh;
uniform float u_modBloodSoft;
uniform float u_modBloodSeed;
// Dust
uniform int   u_modDustEnabled;
uniform vec3  u_modDustAlbedo;
uniform float u_modDustAlbedoStr;
uniform float u_modDustDesat;
uniform float u_modDustRoughAdd;
uniform float u_modDustHeightAdd;
uniform float u_modDustFlat;
uniform float u_modDustNoiseScale;
uniform float u_modDustThresh;
uniform float u_modDustSoft;
uniform float u_modDustSeed;

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

  // Orthogonal
  float dE = 1.0 - f.x; vec3 nE = vec3(-1.0, 0.0, 0.0); bool eWall = isWallCell(cell + ivec2(1,0));
  float dW = f.x;       vec3 nW = vec3(1.0, 0.0, 0.0);  bool wWall = isWallCell(cell + ivec2(-1,0));
  float dN = 1.0 - f.y; vec3 nN = vec3(0.0, -1.0, 0.0); bool nWall = isWallCell(cell + ivec2(0,1));
  float dS = f.y;       vec3 nS = vec3(0.0, 1.0, 0.0);  bool sWall = isWallCell(cell + ivec2(0,-1));

  // Diagonal – distance to SW/SE/... corner of diagonal wall cell
  bool neWall = isWallCell(cell + ivec2(1,1));
  bool nwWall = isWallCell(cell + ivec2(-1,1));
  bool seWall = isWallCell(cell + ivec2(1,-1));
  bool swWall = isWallCell(cell + ivec2(-1,-1));

  vec2 toNE = vec2(1.0 - f.x, 1.0 - f.y); float dNE = length(toNE);
  vec2 toNW = vec2(-f.x, 1.0 - f.y);      float dNW = length(toNW);
  vec2 toSE = vec2(1.0 - f.x, -f.y);      float dSE = length(toSE);
  vec2 toSW = vec2(-f.x, -f.y);           float dSW = length(toSW);

  vec3 nNE = (dNE > 0.0001) ? vec3(normalize(-toNE), 0.0) : vec3(-0.707, -0.707, 0.0);
  vec3 nNW = (dNW > 0.0001) ? vec3(normalize(-toNW), 0.0) : vec3(0.707, -0.707, 0.0);
  vec3 nSE = (dSE > 0.0001) ? vec3(normalize(-toSE), 0.0) : vec3(-0.707, 0.707, 0.0);
  vec3 nSW = (dSW > 0.0001) ? vec3(normalize(-toSW), 0.0) : vec3(0.707, 0.707, 0.0);

  float best = 100.0;
  vec3 bestN = vec3(0.0);

  if (eWall && dE < best) { best = dE; bestN = nE; }
  if (wWall && dW < best) { best = dW; bestN = nW; }
  if (nWall && dN < best) { best = dN; bestN = nN; }
  if (sWall && dS < best) { best = dS; bestN = nS; }

  // Outer convex corners: diagonal walls. Previously these were ignored, which
  // broke the floor/ceiling chamfer at corners (screenshot gap). Now they are
  // considered always – orthogonal is still closer when present, but diagonal
  // provides the missing distance when both orthogonals are empty.
  if (neWall && dNE < best) { best = dNE; bestN = nNE; }
  if (nwWall && dNW < best) { best = dNW; bestN = nNW; }
  if (seWall && dSE < best) { best = dSE; bestN = nSE; }
  if (swWall && dSW < best) { best = dSW; bestN = nSW; }

  // Blending at inner concave corners and at wall end caps:
  // Collect every wall (orth + diag) whose distance is within eps of best
  // and accumulate normals. This yields a diagonal bevel for east+north,
  // and also wraps around a wall end where east + NE are both near.
  // For a 1-grid corridor we can have both corners of the same tile needing
  // chamfer (e.g. NW diag + SE diag). Per-fragment we pick the nearest, so
  // different fragments of the same tile correctly show different corners –
  // the tile as a whole shows both.
  {
    const float eps = 0.10;
    vec3 accum = vec3(0.0);
    int cnt = 0;
    if (eWall && abs(dE - best) <= eps) { accum += nE; cnt++; }
    if (wWall && abs(dW - best) <= eps) { accum += nW; cnt++; }
    if (nWall && abs(dN - best) <= eps) { accum += nN; cnt++; }
    if (sWall && abs(dS - best) <= eps) { accum += nS; cnt++; }
    if (neWall && abs(dNE - best) <= eps) { accum += nNE; cnt++; }
    if (nwWall && abs(dNW - best) <= eps) { accum += nNW; cnt++; }
    if (seWall && abs(dSE - best) <= eps) { accum += nSE; cnt++; }
    if (swWall && abs(dSW - best) <= eps) { accum += nSW; cnt++; }

    if (cnt > 1) {
      float len = length(accum);
      // If opposite walls cancel (len ~0), e.g. 1-tile wide corridor with
      // east+west both within eps at centre, keep bestN single to avoid
      // zero and still get chamfer from the closer edge as fragment moves.
      if (len > 0.35) {
        bestN = normalize(accum);
      }
      // else keep single bestN
    }
  }

  outNorm = bestN;
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
// ===== Task 9: Material Modifiers - noise compilation + mask + alterations =====
// Noise compiled from hash -> value noise -> FBM (3 octaves max) - mask decides placement
// Uses material cues AO, height, rough to decide where modifier sticks.
// Each modifier alters albedo, normal, PBR rough/metal, POM height distinctly.

float modHash(vec2 p) {
  // cheap sin hash, deterministic per cell
  // using dot + sin fract, fast enough for WebGL2
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}
float modHash2(vec2 p, float seed) {
  return modHash(p + vec2(seed * 0.13, seed * 0.37));
}
float modNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = modHash(i);
  float b = modHash(i + vec2(1.0, 0.0));
  float c = modHash(i + vec2(0.0, 1.0));
  float d = modHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float modFBM(vec2 p, float seed, int octaves) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  float norm = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += modNoise(p * freq + vec2(seed * 1.7 + float(i) * 19.3, seed * 0.9)) * amp;
    norm += amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return norm > 0.0 ? v / norm : 0.0;
}
float modMask(float cellIntensity, float noiseVal, float thresh, float soft) {
  float t0 = thresh;
  float t1 = thresh + max(soft, 0.01);
  return cellIntensity * smoothstep(t0, t1, noiseVal);
}

// Sample modifier map textures per world cell - returns intensities 0..1 for each mod
void sampleModCell(vec2 worldXY, out vec4 outA, out vec4 outB) {
  if (u_modMapSize.x < 1.0 || u_modMapSize.y < 1.0) {
    outA = vec4(0.0); outB = vec4(0.0);
    return;
  }
  vec2 cell = floor(worldXY);
  vec2 uv = (cell + vec2(0.5)) / u_modMapSize;
  // clamp to avoid border
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  // Packed single texture double-height
  vec2 uvA = vec2(uv.x, uv.y * 0.5);
  vec2 uvB = vec2(uv.x, uv.y * 0.5 + 0.5);
  outA = texture(u_modTex, uvA);
  outB = texture(u_modTex, uvB);
}

// Core modifier application - alters all PBR channels
// worldPos provided for noise, NgeomFlat optional for flattening
void applyMaterialModifiers(
  inout vec3 albedo,
  inout vec3 N,
  inout float rough,
  inout float metal,
  inout float height,
  inout float ao,
  vec3 worldPos,
  vec2 worldXY,
  vec3 NgeomFlat,
  bool isFloor,
  bool isCeil,
  bool isWall,
  float wallU,
  float wallV
) {
  if (u_modEnabled == 0) return;
  vec4 modA; vec4 modB;
  sampleModCell(worldXY, modA, modB);
  // modA.r=moss g=damaged b=water a=puddle
  // modB.r=blood g=dust
  float cellMoss = modA.r;
  float cellDamaged = modA.g;
  float cellWater = modA.b;
  float cellPuddle = modA.a;
  float cellBlood = modB.r;
  float cellDust = modB.g;

  // Early cheap exit if sum very low
  float sumCell = cellMoss + cellDamaged + cellWater + cellPuddle + cellBlood + cellDust;
  if (sumCell < 0.015) return;

  // Shared world XY for noise
  vec2 wp = worldXY;

  // ----- MOSS -----
  if (u_modMossEnabled == 1 && cellMoss > 0.01) {
    float scale = max(u_modMossNoiseScale, 0.05);
    float noise = modFBM(wp * scale, u_modMossSeed, 3);
    // AO cue: moss prefers dark AO crevices (grout) and low height
    float aoCue = 1.0 - smoothstep(0.75, 0.98, ao);
    float hCue = 1.0 - smoothstep(0.25, 0.75, height); // prefers low (grout)
    // wall bottom cue
    float wallCue = 1.0;
    if (isWall) wallCue = 1.0 - smoothstep(0.0, 0.55, wallV); // more at bottom
    float cue = mix(1.0, aoCue * 0.8 + hCue * 0.6, 0.55) * wallCue;
    float mask = modMask(cellMoss, noise, u_modMossThresh, u_modMossSoft) * cue;
    mask = clamp(mask * u_modMossAlbedoStr, 0.0, 1.0);
    if (mask > 0.001) {
      // albedo green-yellow mix with variance via noise
      float varN = modNoise(wp * scale * 2.1 + vec2(7.3, 2.1));
      vec3 mossCol = mix(u_modMossAlbedo, u_modMossAlbedo2, varN);
      albedo = mix(albedo, mossCol * (0.85 + varN * 0.25), mask);
      // rough rougher
      rough = mix(rough, clamp(mix(u_modMossRoughMin, u_modMossRoughMax, varN), 0.0, 1.0), mask * 0.9);
      // height bumpy spongy
      float bump = modFBM(wp * scale * 1.7, u_modMossSeed + 5.0, 2) * 0.5 + 0.5;
      height += bump * u_modMossHeightAdd * mask;
      // normal lumpy: perturb toward random lump direction
      float nx = modNoise(wp * scale * 1.3 + vec2(1.1, 3.3)) * 2.0 - 1.0;
      float ny = modNoise(wp * scale * 1.3 + vec2(4.7, 8.1)) * 2.0 - 1.0;
      vec3 mossN = normalize(vec3(nx * 0.6, ny * 0.6, 1.0));
      // blend with world normal
      if (isFloor) mossN = normalize(vec3(nx * 0.6, ny * 0.6, 1.0));
      else if (isCeil) mossN = normalize(vec3(nx * 0.6, -ny * 0.6, -1.0));
      else mossN = normalize(NgeomFlat + vec3(nx * 0.5, 0.0, ny * 0.5));
      N = normalize(mix(N, mossN, mask * u_modMossNormalStr));
      ao *= mix(1.0, 0.85, mask * 0.5);
    }
  }

  // ----- DAMAGED -----
  if (u_modDamagedEnabled == 1 && cellDamaged > 0.01) {
    float scale = max(u_modDamagedNoiseScale, 0.05);
    float noise = modFBM(wp * scale, u_modDamagedSeed, 2);
    float crack = modFBM(wp * scale * 2.8, u_modDamagedSeed + 11.0, 2);
    // edge weight already in generator, but emphasize via world XY fract near tile edge
    float edgeFrac = 1.0;
    if (isFloor || isCeil) {
      vec2 f = fract(worldXY);
      float ex = min(f.x, 1.0 - f.x);
      float ey = min(f.y, 1.0 - f.y);
      float ed = min(ex, ey);
      edgeFrac = 1.0 - smoothstep(0.05, 0.35, ed); // more damage at edges
    } else {
      float eu = min(wallU, 1.0 - wallU);
      edgeFrac = 1.0 - smoothstep(0.05, 0.28, eu);
    }
    float mask = modMask(cellDamaged, noise * 0.7 + crack * 0.35, u_modDamagedThresh, u_modDamagedSoft);
    mask *= mix(0.6, 1.0, edgeFrac);
    mask = clamp(mask, 0.0, 1.0);
    if (mask > 0.001) {
      // darken + desat
      float darkF = mix(1.0, u_modDamagedDarken, mask * u_modDamagedDarkenStr);
      albedo *= darkF;
      float l = dot(albedo, vec3(0.299, 0.587, 0.114));
      albedo = mix(albedo, vec3(l), mask * u_modDamagedDesat);
      rough += u_modDamagedRoughAdd * mask;
      rough = clamp(rough + (modHash(wp + vec2(3.1, 7.7)) - 0.5) * 0.08 * mask, 0.0, 1.0);
      height += u_modDamagedHeightAdd * mask + crack * u_modDamagedHeightAdd * 0.25 * mask;
      // normal fracture: sharp random tilt
      float rx = modHash2(wp * 1.7 + vec2(2.3, 9.1), u_modDamagedSeed) * 2.0 - 1.0;
      float ry = modHash2(wp * 1.7 + vec2(5.5, 1.2), u_modDamagedSeed + 2.0) * 2.0 - 1.0;
      vec3 crackN = normalize(vec3(rx * 1.2, ry * 1.2, 0.5 + crack * 0.3));
      if (isCeil) crackN.z = -abs(crackN.z);
      N = normalize(mix(N, crackN, mask * u_modDamagedNormalStr * (0.5 + edgeFrac * 0.5)));
      ao *= mix(1.0, 0.75, mask * 0.6);
    }
  }

  // ----- WATER (wetness) -----
  if (u_modWaterEnabled == 1 && cellWater > 0.01) {
    float scale = max(u_modWaterNoiseScale, 0.05);
    float streakScale = max(u_modWaterStreakScale, 1.0);
    // base wet blob
    float baseN = modFBM(wp * scale, u_modWaterSeed, 2);
    // vertical streak bias for walls: use worldPos.z (height) + wp for streaks
    float streak = 0.0;
    if (isWall) {
      streak = modNoise(vec2(worldPos.z * streakScale, wp.x * 0.8 + wp.y * 0.3));
      streak = pow(streak, 1.3);
    } else {
      // floors: more isotropic
      streak = modNoise(wp * scale * 1.5 + vec2(2.2, 8.8));
    }
    float combined = baseN * 0.65 + streak * 0.55;
    float mask = modMask(cellWater, combined, u_modWaterThresh, u_modWaterSoft);
    if (isWall) mask *= 1.0 - smoothstep(0.35, 0.9, wallV); // more at bottom third
    mask = clamp(mask, 0.0, 1.0);
    if (mask > 0.001) {
      albedo *= mix(1.0, 1.0 - u_modWaterDarken, mask * u_modWaterDarkenStr);
      rough = mix(rough, max(u_modWaterRoughMin, 0.05), mask * 0.85);
      rough += u_modWaterRoughAdd * mask; // negative will make glossier
      rough = clamp(rough, 0.05, 1.0);
      height += u_modWaterHeightAdd * mask;
      // normal flatten toward geometric flat + streak tilt
      vec3 flatN = NgeomFlat;
      if (isFloor) flatN = vec3(0.0, 0.0, 1.0);
      else if (isCeil) flatN = vec3(0.0, 0.0, -1.0);
      N = normalize(mix(N, flatN, mask * u_modWaterFlat));
      if (isWall && u_modWaterStreak > 0.01) {
        // tilt slightly along streak direction
        float sx = (modHash2(wp, u_modWaterSeed + 7.0) - 0.5) * 0.2;
        N = normalize(N + vec3(0.0, 0.0, sx) * mask * u_modWaterStreak);
      }
      ao *= mix(1.0, 0.92, mask * 0.5);
    }
  }

  // ----- PUDDLE (floors only) -----
  if (u_modPuddleEnabled == 1 && cellPuddle > 0.01 && (isFloor || !isWall)) {
    // only floors - isFloor guard already
    if (isFloor) {
      float scale = max(u_modPuddleNoiseScale, 0.03);
      float bigBlob = modFBM(wp * scale, u_modPuddleSeed, 2);
      float ripple = modFBM(wp * u_modPuddleRippleScale, u_modPuddleSeed + 13.0, 2);
      float mask = modMask(cellPuddle, bigBlob, u_modPuddleThresh, u_modPuddleSoft);
      mask = clamp(mask, 0.0, 1.0);
      if (mask > 0.001) {
        // albedo darken with tint
        vec3 tint = vec3(0.27, 0.31, 0.38); // fallback from config
        // use actual tint from config via uniform? we have darken only, approximate tint
        // darken + slight reflect tint
        albedo = mix(albedo, albedo * (1.0 - u_modPuddleAlbedoDarken) + tint * 0.15, mask * 0.9);
        // edge foam bright via fwidth of mask approximation using noise derivative
        float edge = 0.0;
        // crude edge detection: where mask near threshold
        float edDist = abs(bigBlob - u_modPuddleThresh);
        edge = 1.0 - smoothstep(0.0, 0.08, edDist);
        albedo += vec3(u_modPuddleFoamBright * edge * mask);
        // rough mirror
        float target = u_modPuddleRoughTarget;
        float rEdge = u_modPuddleRoughEdge;
        float roughBase = mix(target, rEdge, edge * 0.8);
        rough = mix(rough, roughBase, mask * u_modPuddleRoughLerp);
        rough = clamp(rough, 0.03, 1.0);
        // height depression
        height = mix(height, height + u_modPuddleHeightDepress, mask);
        // height edge softer
        height = mix(height, height + (u_modPuddleHeightDepress * 0.3), edge * mask * 0.6);
        // normal flat + ripple
        vec3 flatN = vec3(0.0, 0.0, 1.0);
        float rnX = (ripple - 0.5) * 0.4;
        float rnY = modNoise(wp * u_modPuddleRippleScale * 1.4 + vec2(5.5, 2.2)) - 0.5;
        vec3 pudN = normalize(vec3(rnX * u_modPuddleRipple, rnY * u_modPuddleRipple, 1.0));
        N = normalize(mix(N, mix(flatN, pudN, 0.25), mask * u_modPuddleFlat));
        ao *= mix(1.0, 0.88, mask * 0.6);
      }
    }
  }

  // ----- BLOOD -----
  if (u_modBloodEnabled == 1 && cellBlood > 0.01) {
    float scale = max(u_modBloodNoiseScale, 0.05);
    // splatter pattern: use two noises + cell-peak hash
    float blob = modFBM(wp * scale, u_modBloodSeed, 2);
    float blob2 = modFBM(wp * scale * 2.3, u_modBloodSeed + 19.0, 2);
    // radial splat: hash centers per 2x2 tiling
    vec2 cellId = floor(wp * 0.5);
    float centerHash = modHash2(cellId, u_modBloodSeed + 7.0);
    float distToCenter = length(fract(wp * 0.5) - 0.5);
    float radial = 1.0 - smoothstep(0.1, 0.45, distToCenter + (1.0 - centerHash) * 0.25);
    // streak drag bias: use direction approx along x or y
    float streakDir = modNoise(vec2(wp.y * 0.7, wp.x * 0.3 + u_modBloodSeed * 0.02));
    streakDir = pow(streakDir, 2.0);
    float combined = blob * 0.55 + blob2 * 0.30 + radial * 0.4 + streakDir * 0.25;
    float mask = modMask(cellBlood, combined, u_modBloodThresh, u_modBloodSoft);
    mask = clamp(mask * u_modBloodAlbedoStr, 0.0, 1.0);
    if (mask > 0.001) {
      float varN = modHash2(wp * 1.3, u_modBloodSeed + 3.0);
      vec3 bloodCol = mix(u_modBloodAlbedo, u_modBloodAlbedo2, varN * 0.7 + blob2 * 0.3);
      // multiply over base, preserve darker cracks
      vec3 mixed = mix(albedo, bloodCol * (0.6 + varN * 0.4), mask);
      // add slightly darker pool
      mixed *= mix(1.0, 0.92, mask * 0.6);
      albedo = mixed;
      rough = clamp(rough + u_modBloodRoughAdd * mask + (varN - 0.5) * 0.1 * mask, 0.0, 1.0);
      height += u_modBloodHeightAdd * mask * (0.5 + varN * 0.5);
      float bx = (modNoise(wp * scale * 2.0 + vec2(1.7, 4.4)) - 0.5) * 0.3;
      float by = (modNoise(wp * scale * 2.0 + vec2(6.1, 2.9)) - 0.5) * 0.3;
      vec3 bloodN = normalize(vec3(bx, by, 1.0 + mask * 0.2));
      if (isCeil) bloodN.z = -abs(bloodN.z);
      N = normalize(mix(N, bloodN, mask * u_modBloodNormalStr));
      ao *= mix(1.0, 0.90, mask * 0.4);
    }
  }

  // ----- DUST -----
  if (u_modDustEnabled == 1 && cellDust > 0.01) {
    float scale = max(u_modDustNoiseScale, 0.05);
    float noise = modFBM(wp * scale, u_modDustSeed, 2);
    // AO cue: dust accumulates in crevices (high AO dark)
    float aoCue = smoothstep(0.70, 0.95, 1.0 - ao); // more when ao low (dark)
    float cue = mix(0.7, 1.0, aoCue * 0.7);
    if (isCeil) cue *= 1.25; // ceiling boost
    float mask = modMask(cellDust, noise, u_modDustThresh, u_modDustSoft) * cue;
    mask = clamp(mask * u_modDustAlbedoStr, 0.0, 1.0);
    if (mask > 0.001) {
      // desaturate + beige veil
      float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
      vec3 desat = mix(albedo, vec3(lum), u_modDustDesat);
      vec3 dustCol = u_modDustAlbedo;
      albedo = mix(desat, mix(desat, dustCol, 0.55), mask);
      rough = clamp(rough + u_modDustRoughAdd * mask, 0.0, 1.0);
      height += u_modDustHeightAdd * mask * (0.4 + aoCue * 0.6);
      // normal soften toward flat geometric
      vec3 flatN = NgeomFlat;
      if (isFloor) flatN = vec3(0.0, 0.0, 1.0);
      else if (isCeil) flatN = vec3(0.0, 0.0, -1.0);
      N = normalize(mix(N, flatN, mask * u_modDustFlat));
      ao *= mix(1.0, 0.96, mask * 0.3);
    }
  }
}

vec3 modDebugOverlayColor(vec2 worldXY, int mode) {
  if (mode==0) return vec3(0.0);
  vec4 a; vec4 b;
  sampleModCell(worldXY, a, b);
  float m = a.r; // moss
  float d = a.g; // damaged
  float wa = a.b; // water
  float pu = a.a; // puddle
  float bl = b.r; // blood
  float du = b.g; // dust
  if (mode==2) return vec3(0.12,0.88,0.24) * m; // moss green
  if (mode==3) return vec3(0.62,0.62,0.62) * d; // damaged gray
  if (mode==4) return vec3(0.18,0.48,1.0) * wa; // water blue
  if (mode==5) return vec3(0.08,0.32,0.78) * pu; // puddle dark blue
  if (mode==6) return vec3(0.92,0.08,0.16) * bl; // blood red
  if (mode==7) return vec3(0.82,0.72,0.52) * du; // dust beige
  if (mode==8) {
    vec3 col = vec3(0.0);
    col += vec3(0.12,0.88,0.24) * m * 0.9;
    col += vec3(0.62,0.62,0.62) * d * 0.8;
    col += vec3(0.18,0.48,1.0) * wa * 0.8;
    col += vec3(0.08,0.32,0.78) * pu * 1.0;
    col += vec3(0.92,0.08,0.16) * bl * 1.0;
    col += vec3(0.82,0.72,0.52) * du * 0.9;
    return col;
  }
  return vec3(0.0);
}
float modDebugIntensity(vec2 worldXY, int mode) {
  vec4 a; vec4 b;
  sampleModCell(worldXY, a, b);
  if (mode==2) return a.r;
  if (mode==3) return a.g;
  if (mode==4) return a.b;
  if (mode==5) return a.a;
  if (mode==6) return b.r;
  if (mode==7) return b.g;
  if (mode==8) return clamp((a.r + a.g + a.b + a.a + b.r + b.g)/2.0, 0.0, 1.0);
  return 0.0;
}


vec3 pbrShade(vec3 albedo, vec3 N, float rough, float metal, float ao, vec3 emissive, vec3 worldPos, vec3 viewDir) {
  if (u_lightingEnabled == 0) { return albedo + emissive; }
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

  // ——— PBR OFF: diffuse-only Lambert, but still multi-light + sun + shadows ———
  if (u_pbrEnabled == 0) {
    vec3 sunDir = normalize(vec3(u_sunDir.xy, u_sunDirZ));
    vec3 Lsun = -sunDir;
    float sunShadow = 1.0;
    {
      vec2 sDirSun = normalize(Lsun.xy);
      vec2 sOriginSun = worldPos.xy + traceN.xy * biasN + sDirSun * biasDir;
      if (length(sDirSun) > 0.01 && traceRay(sOriginSun, sDirSun, sunMax)) sunShadow = sunShadFactor;
    }
    float NdotLsun = max(dot(N, Lsun), 0.0);
    vec3 sunContrib = albedo * u_sunColor * u_sunIntensity * NdotLsun * sunShadow * aoSunEff;
    vec3 pointContrib = vec3(0.0);
    for (int i=0;i<12;i++){
      if (i>=u_numLights) break;
      if (u_lightIntensity[i]<=0.001) continue;
      vec3 lPos = u_lightPos[i];
      vec3 Lp = lPos - worldPos;
      float dist = length(Lp);
      float rad = u_lightRadius[i];
      if (dist>rad) continue;
      Lp /= dist;
      float atten = clamp(1.0 - dist/rad, 0.0, 1.0); atten*=atten;
      float shadow=1.0;
      if (u_lightNoShadow[i]==0){
        vec2 sd = normalize(Lp.xy);
        vec2 so = worldPos.xy + traceN.xy * biasN + sd * biasDir;
        if (length(sd)>0.01 && traceRay(so, sd, dist-pointEps)) shadow = pointShadFactor;
      }
      int lt = u_lightType[i];
      if (lt==1){
        vec3 sDir = normalize(u_lightDir[i]);
        float cT = dot(-Lp, sDir);
        float spot = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cT);
        atten*=spot;
        if (spot<=0.01) continue;
      }
      // cheap flicker/pulse still applied as attenuation modulation (intensity already flickered on CPU)
      if (lt==2){
        float fs = u_lightFlickerSpeed[i]>0.1?u_lightFlickerSpeed[i]:6.0;
        float fa = u_lightFlickerAmount[i]>0.001?u_lightFlickerAmount[i]:0.12;
        float ph = u_lightPhase[i];
        float flickAdd = 0.92 + 0.08 * sin(u_time * fs + ph*1.7 + float(i)*0.9) + 0.05 * sin(u_time*fs*1.9+ph*2.3);
        atten *= clamp(flickAdd, 0.68, 1.22);
      } else if (lt==3){
        float ps = u_lightPulseSpeed[i]; float pa = u_lightPulseAmt[i];
        if (ps>0.1 && pa>0.01){ atten *= (1.0 + pa * sin(u_time * ps + u_lightPhase[i] + float(i)*0.7)); }
      }
      float NdotLp = max(dot(N, Lp), 0.0);
      pointContrib += albedo * u_lightColor[i] * u_lightIntensity[i] * atten * NdotLp * shadow * aoPointEff;
    }
    vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * aoAmbEff;
    return ambient + sunContrib + pointContrib + emissive;
  }

  // ——— PBR ON: full GGX ———
  float f0d = u_pbrF0 > 0.0 ? u_pbrF0 : 0.04;
  vec3 F0 = mix(vec3(f0d), albedo, metal);
  vec3 Lo = vec3(0.0);

  // Sun PBR
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

  // Many point lights PBR
  for (int i = 0; i < 12; i++) {
    if (i >= u_numLights) break;
    vec3 lPos = u_lightPos[i];
    if (u_lightIntensity[i] <= 0.001) continue;
    vec3 Lvec = lPos - worldPos;
    float dist = length(Lvec);
    float radius = u_lightRadius[i];
    if (dist > radius) continue;
    if (dist < 0.001) continue;
    Lvec /= dist;
    float atten = clamp(1.0 - dist / radius, 0.0, 1.0);
    atten *= atten;
    atten = atten / (1.0 + (dist/radius)*(dist/radius) * max(u_pbrAttenQuad, 0.0));

    float shadow = 1.0;
    if (u_lightNoShadow[i] == 0) {
      vec2 shDir = normalize(Lvec.xy);
      vec2 shOrigin = worldPos.xy + traceN.xy * biasN + shDir * biasDir;
      if (length(shDir) > 0.01 && traceRay(shOrigin, shDir, dist - pointEps)) shadow = pointShadFactor;
    }

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

    if (lType == 2) {
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

  // Grid tile chamfer fallbacks — Task 8 subtle 1m grout, separate from wall-to-floor cove
  float gridCreviceEnd = u_chamferGridCreviceEnd > 0.0 ? u_chamferGridCreviceEnd : 0.10;
  float gridCreviceSmooth = u_chamferGridCreviceSmoothEnd > 0.0 ? u_chamferGridCreviceSmoothEnd : 0.30;
  float gridTStart = u_chamferGridTrimStart >= 0.0 ? u_chamferGridTrimStart : 0.10;
  float gridTMid = u_chamferGridTrimMid > 0.0 ? u_chamferGridTrimMid : 0.35;
  float gridTEnd = u_chamferGridTrimEnd > 0.0 ? u_chamferGridTrimEnd : 1.0;

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
        // Task 9 early: apply modifiers before PBR debug so debug modes show modified channels (fixes key 6 not showing modifiers)
        if (u_modEnabled == 1 && u_pbrDebugMode != 0) {
          vec3 _earlyAlbedo = albedoRaw;
          vec3 _earlyN = Nw;
          float _earlyRough = rma.r;
          float _earlyMetal = rma.g;
          float _earlyHeight = heightVal;
          float _earlyAO = ao;
          vec3 _earlyWPos = vec3(floorWorld, floorH_atRay);
          applyMaterialModifiers(_earlyAlbedo, _earlyN, _earlyRough, _earlyMetal, _earlyHeight, _earlyAO, _earlyWPos, floorWorld, vec3(0.0,0.0,1.0), true, false, false, 0.0, 0.0);
          albedoRaw = _earlyAlbedo; Nw = _earlyN; rma.r = _earlyRough; rma.g = _earlyMetal; heightVal = _earlyHeight; ao = _earlyAO;
        }
        if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
          finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
        
          // Task 9 debug overlay for PBR debug path
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgColD = modDebugOverlayColor(floorWorld, u_modDebugOverlay);
            float _dbgIntD = modDebugIntensity(floorWorld, u_modDebugOverlay);
            if (u_modDebugOverlay == 8) {
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgColD, clamp(_dbgIntD*1.2, 0.0, 1.0));
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgColD + vec3(0.12), clamp(_dbgIntD, 0.0, 1.0));
            }
          }

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
            // --- Task 8: grid tile chamfer for floor (1m dungeon tile grooves, subtle) ---
            if (u_chamferEnabled == 1 && u_chamferGridEnabled == 1) {
              vec2 f = fract(floorWorld);
              float distX = min(f.x, 1.0 - f.x);
              float distY = min(f.y, 1.0 - f.y);
              float edgeDist = min(distX, distY);
              float gSize = max(u_chamferGridFloorSize, 0.001);
              if (edgeDist < gSize) {
                float t = edgeDist / gSize;
                float bevel = 1.0 - smoothstep(0.0, 1.0, t);
                float gDarken = u_chamferGridFloorDarken > 0.0 ? u_chamferGridFloorDarken : 0.88;
                float gBlend = u_chamferGridFloorBlend > 0.0 ? u_chamferGridFloorBlend : 0.85;
                float gRough = u_chamferGridFloorRough > 0.0 ? u_chamferGridFloorRough : 0.35;
                float gTrim = u_chamferGridFloorTrim >= 0.0 ? u_chamferGridFloorTrim : 0.06;
                ao *= mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
                vec2 edgeN = vec2(0.0);
                if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
                else              edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
                vec3 chamN = normalize(vec3(edgeN * 0.6, 1.0));
                N = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
                float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t));
                albedo += vec3(trimBand * gTrim);
                rma.r = mix(rma.r * (1.0 - gRough * 0.5), rma.r, t);
                if (distX < gSize && distY < gSize) ao *= 0.97;
              }
            }
          }
          // Task 9: Material Modifiers - after chamfer/grid, before shading, uses noise + AO/height/rough cues
          {
            vec3 _modAlbedo = albedo;
            vec3 _modN = N;
            float _modRough = rma.r;
            float _modMetal = rma.g;
            float _modHeight = heightVal;
            float _modAO = ao;
            vec3 _worldPosFh = vec3(floorWorld, floorH_atRay);
            applyMaterialModifiers(_modAlbedo, _modN, _modRough, _modMetal, _modHeight, _modAO, _worldPosFh, floorWorld, vec3(0.0,0.0,1.0), true, false, false, 0.0, 0.0);
            albedo = _modAlbedo; N = _modN; rma.r = _modRough; rma.g = _modMetal; heightVal = _modHeight; ao = _modAO;
          }
          vec3 worldPos = vec3(floorWorld, floorH_atRay);
          vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
          finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);

          // Task 9 debug overlay: colored mask per modifier type when u_modDebugOverlay >=2
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgCol = modDebugOverlayColor(worldPos.xy, u_modDebugOverlay);
            float _dbgInt = modDebugIntensity(worldPos.xy, u_modDebugOverlay);
            // For single-mod masks, show dark base with colored intensity; for combined, show mixed col directly
            if (u_modDebugOverlay == 8) {
              // Combined - show mixed colors, brighten a bit
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgCol, clamp(_dbgInt*1.2, 0.0, 1.0));
              // add faint grid to see cell boundaries
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.03) finalColor *= 0.75;
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgCol + vec3(0.12), clamp(_dbgInt, 0.0, 1.0));
              // subtle noise grain to show organic mask shape vs flat cell intensity
              float _n = modNoise(worldPos.xy * 0.35 + vec2(float(u_modDebugOverlay)*1.7));
              finalColor *= 0.85 + _n * 0.35;
              // edge darkening for cell border visibility
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.025) finalColor *= 0.65;
            }
          }

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
        vec3 Nw = normalize(vec3(normalTS.x, -normalTS.y, -normalTS.z));
        float heightVal = texture(u_ceilHeight, cuvAtlas).r;
        vec4 rma = texture(u_ceilRoughMetal, cuvAtlas);
        float ao = rma.a;
              vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
        // Task 9 early ceil hit - modifiers before PBR debug (fixes key 6)
        if (u_modEnabled == 1 && u_pbrDebugMode != 0) {
          vec3 _earlyAlbedo = albedoRaw;
          vec3 _earlyN = Nw;
          float _earlyRough = rma.r;
          float _earlyMetal = rma.g;
          float _earlyHeight = heightVal;
          float _earlyAO = ao;
          vec3 _earlyWPos = vec3(ceilWorld, ceilH_atRay);
          applyMaterialModifiers(_earlyAlbedo, _earlyN, _earlyRough, _earlyMetal, _earlyHeight, _earlyAO, _earlyWPos, ceilWorld, vec3(0.0,0.0,-1.0), false, true, false, 0.0, 0.0);
          albedoRaw = _earlyAlbedo; Nw = _earlyN; rma.r = _earlyRough; rma.g = _earlyMetal; heightVal = _earlyHeight; ao = _earlyAO;
        }
      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
          finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
        
          // Task 9 debug overlay for PBR debug path
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgColD = modDebugOverlayColor(ceilWorld, u_modDebugOverlay);
            float _dbgIntD = modDebugIntensity(ceilWorld, u_modDebugOverlay);
            if (u_modDebugOverlay == 8) {
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgColD, clamp(_dbgIntD*1.2, 0.0, 1.0));
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgColD + vec3(0.12), clamp(_dbgIntD, 0.0, 1.0));
            }
          }

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
            // --- Task 8: grid tile chamfer for ceiling ---
            if (u_chamferEnabled == 1 && u_chamferGridEnabled == 1) {
              vec2 f = fract(ceilWorld);
              float distX = min(f.x, 1.0 - f.x);
              float distY = min(f.y, 1.0 - f.y);
              float edgeDist = min(distX, distY);
              float gSize = max(u_chamferGridCeilSize, 0.001);
              if (edgeDist < gSize) {
                float t = edgeDist / gSize;
                float bevel = 1.0 - smoothstep(0.0, 1.0, t);
                float gDarken = u_chamferGridCeilDarken > 0.0 ? u_chamferGridCeilDarken : 0.90;
                float gBlend = u_chamferGridCeilBlend > 0.0 ? u_chamferGridCeilBlend : 0.80;
                float gRough = u_chamferGridCeilRough > 0.0 ? u_chamferGridCeilRough : 0.30;
                float gTrim = u_chamferGridCeilTrim >= 0.0 ? u_chamferGridCeilTrim : 0.04;
                ao *= mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
                vec2 edgeN = vec2(0.0);
                if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
                else              edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
                vec3 chamN = normalize(vec3(edgeN * 0.6, -1.0));
                N = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
                float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t));
                albedo += vec3(trimBand * gTrim);
                rma.r = mix(rma.r * (1.0 - gRough * 0.3), rma.r, t);
                if (distX < gSize && distY < gSize) ao *= 0.97;
              }
            }
          }
          // Task 9: Material Modifiers - ceiling
          {
            vec3 _modAlbedo = albedo;
            vec3 _modN = N;
            float _modRough = rma.r;
            float _modMetal = rma.g;
            float _modHeight = heightVal;
            float _modAO = ao;
            vec3 _worldPosCh = vec3(ceilWorld, ceilH_atRay);
            applyMaterialModifiers(_modAlbedo, _modN, _modRough, _modMetal, _modHeight, _modAO, _worldPosCh, ceilWorld, vec3(0.0,0.0,-1.0), false, true, false, 0.0, 0.0);
            albedo = _modAlbedo; N = _modN; rma.r = _modRough; rma.g = _modMetal; heightVal = _modHeight; ao = _modAO;
          }
          vec3 worldPos = vec3(ceilWorld, ceilH_atRay);
          vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
          finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);

          // Task 9 debug overlay: colored mask per modifier type when u_modDebugOverlay >=2
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgCol = modDebugOverlayColor(worldPos.xy, u_modDebugOverlay);
            float _dbgInt = modDebugIntensity(worldPos.xy, u_modDebugOverlay);
            // For single-mod masks, show dark base with colored intensity; for combined, show mixed col directly
            if (u_modDebugOverlay == 8) {
              // Combined - show mixed colors, brighten a bit
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgCol, clamp(_dbgInt*1.2, 0.0, 1.0));
              // add faint grid to see cell boundaries
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.03) finalColor *= 0.75;
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgCol + vec3(0.12), clamp(_dbgInt, 0.0, 1.0));
              // subtle noise grain to show organic mask shape vs flat cell intensity
              float _n = modNoise(worldPos.xy * 0.35 + vec2(float(u_modDebugOverlay)*1.7));
              finalColor *= 0.85 + _n * 0.35;
              // edge darkening for cell border visibility
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.025) finalColor *= 0.65;
            }
          }

        }
        perpDist = dist;
      }
    } else {
      float wallV = clamp(wallV_raw, 0.0, 1.0);
      float matId = max(1.0, cellType);
      vec2 uv = vec2(wallU, wallV);
      vec2 uvAtlas = atlasUV(matId, uv, u_atlasWalls, u_texSize);

      // --- Flat basis ---
      vec3 NgeomFlat = vec3(0.0);
      vec3 tangentFlat = vec3(0.0);
      vec3 bitangent = vec3(0.0, 0.0, 1.0);
      // Tangent must point along INCREASING wallU in world space. wallU is flipped
      // (see wallU computation) when (side==0 && ray.x>0) or (side==1 && ray.y<0), so
      // the tangent sign has to match — otherwise the normal map's X (horizontal relief)
      // is applied backwards and a light on the right lights the LEFT edge of each tile.
      if (side == 0) {
        NgeomFlat = vec3(float(-stepDir.x), 0.0, 0.0);
        tangentFlat = vec3(0.0, ray.x > 0.0 ? -1.0 : 1.0, 0.0);
      } else {
        NgeomFlat = vec3(0.0, float(-stepDir.y), 0.0);
        tangentFlat = vec3(ray.y < 0.0 ? -1.0 : 1.0, 0.0, 0.0);
      }

      // --- Rounded corners: compute proper geometric normal FIRST ---
      // The old code built Nw with flat TBN then did mix(Nw, cn, nMix) which killed
      // normal-map detail and produced wrong WORLD normals. Instead we mix the
      // geometric normals, rebuild a valid orthonormal TBN, and then apply the
      // normal map on top of the rounded basis. This preserves PBR detail and
      // gives correct world normals for lighting + debug.
      vec3 Ngeom = NgeomFlat;
      vec3 tangent = tangentFlat;
      vec3 cornerGeom = vec3(0.0);
      if (hasCornerRound) {
        cornerGeom = cornerNormal;
        if (u_cornerMode == 0) {
          vec3 n2 = (side == 0) ? vec3(0.0, (wallU < 0.5 ? -1.0 : 1.0), 0.0) : vec3((wallU < 0.5 ? -1.0 : 1.0), 0.0, 0.0);
          cornerGeom = normalize(NgeomFlat + n2);
        }
        // Mix geometric normals per u_cornerNormalMix (default 0.92) — not final world normal
        Ngeom = normalize(mix(NgeomFlat, cornerGeom, clamp(nMix, 0.0, 1.0)));
        // Orthogonalize flat tangent to new Ngeom to keep texture direction stable
        float dotTN = dot(tangentFlat, Ngeom);
        vec3 tOrtho = tangentFlat - dotTN * Ngeom;
        if (dot(tOrtho, tOrtho) < 0.000001) {
          tOrtho = vec3(-Ngeom.y, Ngeom.x, 0.0);
          if (dot(tOrtho, tangentFlat) < 0.0) tOrtho = -tOrtho;
        }
        tangent = normalize(tOrtho);
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
      // Proper PBR: normal map applied on top of rounded TBN, preserving detail
      vec3 Nw = normalize(tangent * normalTSw.x + bitangent * normalTSw.y + Ngeom * normalTSw.z);
      // Task 9 early wall: modifiers before PBR debug so key 6 shows them
      if (u_modEnabled == 1 && u_pbrDebugMode != 0) {
        vec3 _earlyAlbedoW = albedoRaw;
        vec3 _earlyNW = Nw;
        float _earlyRoughW = rmaW.r;
        float _earlyMetalW = rmaW.g;
        float _earlyHeightW = heightVal;
        float _earlyAOW = rmaW.a;
        applyMaterialModifiers(_earlyAlbedoW, _earlyNW, _earlyRoughW, _earlyMetalW, _earlyHeightW, _earlyAOW, worldPos, hitPos, Ngeom, false, false, true, wallU, wallV);
        albedoRaw = _earlyAlbedoW; Nw = _earlyNW; rmaW.r = _earlyRoughW; rmaW.g = _earlyMetalW; heightVal = _earlyHeightW; rmaW.a = _earlyAOW;
      }

      if (hasCornerRound && u_pbrDebugMode == 0 && u_gridDebug == 0) {
        // Keep material tweaks but do NOT overwrite Nw — detail is already in Nw via TBN
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
      
          // Task 9 debug overlay for PBR debug path
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgColD = modDebugOverlayColor(vec2(0.0), u_modDebugOverlay);
            float _dbgIntD = modDebugIntensity(vec2(0.0), u_modDebugOverlay);
            if (u_modDebugOverlay == 8) {
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgColD, clamp(_dbgIntD*1.2, 0.0, 1.0));
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgColD + vec3(0.12), clamp(_dbgIntD, 0.0, 1.0));
            }
          }

} else if (u_gridDebug == 1) {
        float wallH = ceilH - floorH;
        vec2 wuv = vec2(fract(wallU), fract(wallV * wallH));
        float grid = (wuv.x > 0.95 || wuv.y > 0.95 || wuv.x < 0.05 || wuv.y < 0.05) ? 1.0 : 0.25;
        finalColor = vec3(grid * 0.9, 0.0, 0.0);
      } else {
      if (u_modEnabled == 1 && u_pbrDebugMode == 0 && u_gridDebug == 0) {
        vec3 _modAlbedoW = albedoRaw;
        vec3 _modNW = Nw;
        float _modRoughW = rmaW.r;
        float _modMetalW = rmaW.g;
        float _modHeightW = heightVal;
        float _modAOW = rmaW.a;
        applyMaterialModifiers(_modAlbedoW, _modNW, _modRoughW, _modMetalW, _modHeightW, _modAOW, worldPos, hitPos, Ngeom, false, false, true, wallU, wallV);
        albedoRaw = _modAlbedoW; Nw = _modNW; rmaW.r = _modRoughW; rmaW.g = _modMetalW; heightVal = _modHeightW; rmaW.a = _modAOW;
      }
        finalColor = pbrShade(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, emissiveW, worldPos, viewDir);

          // Task 9 debug overlay: colored mask per modifier type when u_modDebugOverlay >=2
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgCol = modDebugOverlayColor(worldPos.xy, u_modDebugOverlay);
            float _dbgInt = modDebugIntensity(worldPos.xy, u_modDebugOverlay);
            // For single-mod masks, show dark base with colored intensity; for combined, show mixed col directly
            if (u_modDebugOverlay == 8) {
              // Combined - show mixed colors, brighten a bit
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgCol, clamp(_dbgInt*1.2, 0.0, 1.0));
              // add faint grid to see cell boundaries
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.03) finalColor *= 0.75;
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgCol + vec3(0.12), clamp(_dbgInt, 0.0, 1.0));
              // subtle noise grain to show organic mask shape vs flat cell intensity
              float _n = modNoise(worldPos.xy * 0.35 + vec2(float(u_modDebugOverlay)*1.7));
              finalColor *= 0.85 + _n * 0.35;
              // edge darkening for cell border visibility
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.025) finalColor *= 0.65;
            }
          }

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
        // Task 9 early floor fallback - modifiers before PBR debug
        if (u_modEnabled == 1 && u_pbrDebugMode != 0) {
          vec3 _earlyAlbedo = albedoRaw;
          vec3 _earlyN = Nw;
          float _earlyRough = rma.r;
          float _earlyMetal = rma.g;
          float _earlyHeight = heightVal;
          float _earlyAO = ao;
          vec3 _earlyWPos = vec3(floorWorld, floorH);
          applyMaterialModifiers(_earlyAlbedo, _earlyN, _earlyRough, _earlyMetal, _earlyHeight, _earlyAO, _earlyWPos, floorWorld, vec3(0.0,0.0,1.0), true, false, false, 0.0, 0.0);
          albedoRaw = _earlyAlbedo; Nw = _earlyN; rma.r = _earlyRough; rma.g = _earlyMetal; heightVal = _earlyHeight; ao = _earlyAO;
        }
      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
        finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
      
          // Task 9 debug overlay for PBR debug path
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgColD = modDebugOverlayColor(floorWorld, u_modDebugOverlay);
            float _dbgIntD = modDebugIntensity(floorWorld, u_modDebugOverlay);
            if (u_modDebugOverlay == 8) {
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgColD, clamp(_dbgIntD*1.2, 0.0, 1.0));
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgColD + vec3(0.12), clamp(_dbgIntD, 0.0, 1.0));
            }
          }

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
          // Task 8: grid tile chamfer for floor — fallback path
          if (u_chamferEnabled == 1 && u_chamferGridEnabled == 1) {
            vec2 f = fract(floorWorld);
            float distX = min(f.x, 1.0 - f.x);
            float distY = min(f.y, 1.0 - f.y);
            float edgeDist = min(distX, distY);
            float gSize = max(u_chamferGridFloorSize, 0.001);
            if (edgeDist < gSize) {
              float t = edgeDist / gSize;
              float bevel = 1.0 - smoothstep(0.0, 1.0, t);
              float gDarken = u_chamferGridFloorDarken > 0.0 ? u_chamferGridFloorDarken : 0.88;
              float gBlend = u_chamferGridFloorBlend > 0.0 ? u_chamferGridFloorBlend : 0.85;
              float gRough = u_chamferGridFloorRough > 0.0 ? u_chamferGridFloorRough : 0.35;
              float gTrim = u_chamferGridFloorTrim >= 0.0 ? u_chamferGridFloorTrim : 0.06;
              ao *= mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
              vec2 edgeN = vec2(0.0);
              if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
              else              edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
              vec3 chamN = normalize(vec3(edgeN * 0.6, 1.0));
              N = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
              float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t));
              albedo += vec3(trimBand * gTrim);
              rma.r = mix(rma.r * (1.0 - gRough * 0.5), rma.r, t);
              if (distX < gSize && distY < gSize) ao *= 0.97;
            }
          }
        }
        // Task 9: Material Modifiers - floor fallback (no wall hit distant)
        {
          vec3 _modAlbedo = albedo;
          vec3 _modN = N;
          float _modRough = rma.r;
          float _modMetal = rma.g;
          float _modHeight = heightVal;
          float _modAO = ao;
          vec3 _worldPosF = vec3(floorWorld, floorH);
          applyMaterialModifiers(_modAlbedo, _modN, _modRough, _modMetal, _modHeight, _modAO, _worldPosF, floorWorld, vec3(0.0,0.0,1.0), true, false, false, 0.0, 0.0);
          albedo = _modAlbedo; N = _modN; rma.r = _modRough; rma.g = _modMetal; heightVal = _modHeight; ao = _modAO;
        }
        vec3 worldPos = vec3(floorWorld, floorH);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);

          // Task 9 debug overlay: colored mask per modifier type when u_modDebugOverlay >=2
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgCol = modDebugOverlayColor(worldPos.xy, u_modDebugOverlay);
            float _dbgInt = modDebugIntensity(worldPos.xy, u_modDebugOverlay);
            // For single-mod masks, show dark base with colored intensity; for combined, show mixed col directly
            if (u_modDebugOverlay == 8) {
              // Combined - show mixed colors, brighten a bit
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgCol, clamp(_dbgInt*1.2, 0.0, 1.0));
              // add faint grid to see cell boundaries
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.03) finalColor *= 0.75;
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgCol + vec3(0.12), clamp(_dbgInt, 0.0, 1.0));
              // subtle noise grain to show organic mask shape vs flat cell intensity
              float _n = modNoise(worldPos.xy * 0.35 + vec2(float(u_modDebugOverlay)*1.7));
              finalColor *= 0.85 + _n * 0.35;
              // edge darkening for cell border visibility
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.025) finalColor *= 0.65;
            }
          }

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
      vec3 Nw = normalize(vec3(normalTS.x, -normalTS.y, -normalTS.z));
      float heightVal = texture(u_ceilHeight, cuvAtlas).r;
      vec4 rma = texture(u_ceilRoughMetal, cuvAtlas);
      float ao = rma.a;
            vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;
        // Task 9 early ceil fb early - modifiers before PBR debug so key 6 shows them
        if (u_modEnabled == 1 && u_pbrDebugMode != 0) {
          vec3 _earlyAlbedo = albedoRaw;
          vec3 _earlyN = Nw;
          float _earlyRough = rma.r;
          float _earlyMetal = rma.g;
          float _earlyHeight = heightVal;
          float _earlyAO = ao;
          vec3 _earlyWPos = vec3(ceilWorld, ceilH);
          applyMaterialModifiers(_earlyAlbedo, _earlyN, _earlyRough, _earlyMetal, _earlyHeight, _earlyAO, _earlyWPos, ceilWorld, vec3(0.0,0.0,-1.0), false, true, false, 0.0, 0.0);
          albedoRaw = _earlyAlbedo; Nw = _earlyN; rma.r = _earlyRough; rma.g = _earlyMetal; heightVal = _earlyHeight; ao = _earlyAO;
        }
      if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
        finalColor = debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
      
          // Task 9 debug overlay for PBR debug path
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgColD = modDebugOverlayColor(ceilWorld, u_modDebugOverlay);
            float _dbgIntD = modDebugIntensity(ceilWorld, u_modDebugOverlay);
            if (u_modDebugOverlay == 8) {
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgColD, clamp(_dbgIntD*1.2, 0.0, 1.0));
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgColD + vec3(0.12), clamp(_dbgIntD, 0.0, 1.0));
            }
          }

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
          // Task 8: grid tile chamfer for ceiling — fallback path
          if (u_chamferEnabled == 1 && u_chamferGridEnabled == 1) {
            vec2 f = fract(ceilWorld);
            float distX = min(f.x, 1.0 - f.x);
            float distY = min(f.y, 1.0 - f.y);
            float edgeDist = min(distX, distY);
            float gSize = max(u_chamferGridCeilSize, 0.001);
            if (edgeDist < gSize) {
              float t = edgeDist / gSize;
              float bevel = 1.0 - smoothstep(0.0, 1.0, t);
              float gDarken = u_chamferGridCeilDarken > 0.0 ? u_chamferGridCeilDarken : 0.90;
              float gBlend = u_chamferGridCeilBlend > 0.0 ? u_chamferGridCeilBlend : 0.80;
              float gRough = u_chamferGridCeilRough > 0.0 ? u_chamferGridCeilRough : 0.30;
              float gTrim = u_chamferGridCeilTrim >= 0.0 ? u_chamferGridCeilTrim : 0.04;
              ao *= mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
              vec2 edgeN = vec2(0.0);
              if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
              else              edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
              vec3 chamN = normalize(vec3(edgeN * 0.6, -1.0));
              N = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
              float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t));
              albedo += vec3(trimBand * gTrim);
              rma.r = mix(rma.r * (1.0 - gRough * 0.3), rma.r, t);
              if (distX < gSize && distY < gSize) ao *= 0.97;
            }
          }
        }
        // Task 9: Material Modifiers - ceil fallback
        {
          vec3 _modAlbedo = albedo;
          vec3 _modN = N;
          float _modRough = rma.r;
          float _modMetal = rma.g;
          float _modHeight = heightVal;
          float _modAO = ao;
          vec3 _worldPosC = vec3(ceilWorld, ceilH);
          applyMaterialModifiers(_modAlbedo, _modN, _modRough, _modMetal, _modHeight, _modAO, _worldPosC, ceilWorld, vec3(0.0,0.0,-1.0), false, true, false, 0.0, 0.0);
          albedo = _modAlbedo; N = _modN; rma.r = _modRough; rma.g = _modMetal; heightVal = _modHeight; ao = _modAO;
        }
        vec3 worldPos = vec3(ceilWorld, ceilH);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);

          // Task 9 debug overlay: colored mask per modifier type when u_modDebugOverlay >=2
          if (u_modDebugOverlay >= 2) {
            vec3 _dbgCol = modDebugOverlayColor(worldPos.xy, u_modDebugOverlay);
            float _dbgInt = modDebugIntensity(worldPos.xy, u_modDebugOverlay);
            // For single-mod masks, show dark base with colored intensity; for combined, show mixed col directly
            if (u_modDebugOverlay == 8) {
              // Combined - show mixed colors, brighten a bit
              finalColor = mix(vec3(0.06,0.06,0.07), _dbgCol, clamp(_dbgInt*1.2, 0.0, 1.0));
              // add faint grid to see cell boundaries
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.03) finalColor *= 0.75;
            } else {
              vec3 _baseDark = vec3(0.08,0.08,0.09);
              finalColor = mix(_baseDark, _dbgCol + vec3(0.12), clamp(_dbgInt, 0.0, 1.0));
              // subtle noise grain to show organic mask shape vs flat cell intensity
              float _n = modNoise(worldPos.xy * 0.35 + vec2(float(u_modDebugOverlay)*1.7));
              finalColor *= 0.85 + _n * 0.35;
              // edge darkening for cell border visibility
              vec2 f = fract(worldPos.xy);
              float edge = min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y));
              if (edge < 0.025) finalColor *= 0.65;
            }
          }

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
    // HDR fix: bright should go to warm white, not pink/magenta from channel-wise clamp
    {
      float maxC = max(max(finalColor.r, finalColor.g), finalColor.b);
      if (maxC > 1.0) {
        float over = clamp((maxC - 1.0) * 0.35, 0.0, 0.75);
        vec3 scaled = finalColor / maxC;
        vec3 warmWhite = vec3(1.0, 0.94, 0.82);
        finalColor = mix(scaled, warmWhite, over);
      }
      finalColor = clamp(finalColor, 0.0, 1.0);
    }
    if (u_authentic == 1) {
      int bands = max(8, u_bandLevels);
      finalColor = floor(finalColor * float(bands)) / float(bands);
    }
  }
  outColor = vec4(finalColor, 1.0);
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
  // HDR fix for sprites too: preserve hue, avoid pink from channel clip, bloom to warm white
  {
    float maxC = max(max(Lo.r, Lo.g), Lo.b);
    if (maxC > 1.0) {
      float over = clamp((maxC - 1.0) * 0.32, 0.0, 0.7);
      vec3 scaled = Lo / maxC;
      vec3 warmWhite = vec3(1.0, 0.94, 0.82);
      Lo = mix(scaled, warmWhite, over);
    }
    Lo = clamp(Lo, 0.0, 1.0);
  }
  float alphaFade = 1.0;
  if (v_dist > 14.0) alphaFade = max(0.12, 1.0 - (v_dist - 14.0) * 0.09);
  float alphaOut = albedoS.a * v_alpha * alphaFade;
  outColor = vec4(Lo, alphaOut);
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














