// GLSL shader sources for WebGL2 raycaster with palette quantization, sun lighting, shadows

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

uniform sampler2D u_mapTex;
uniform sampler2D u_matMap;
uniform vec2  u_mapSize;

uniform sampler2D u_wallAlbedo, u_wallNormal, u_wallHeight, u_wallRoughMetal;
uniform sampler2D u_floorAlbedo, u_floorNormal, u_floorHeight, u_floorRoughMetal;
uniform sampler2D u_ceilAlbedo,  u_ceilNormal,  u_ceilHeight,  u_ceilRoughMetal;
uniform float u_texSize;
uniform float u_atlasWalls, u_atlasFloors, u_atlasCeils;

uniform vec3  u_lightPos;
uniform vec3  u_lightColor;
uniform float u_lightIntensity;
uniform float u_lightRadius;

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

uniform float u_pomWall;
uniform float u_pomFloor;
uniform float u_pomCeil;
uniform int   u_pomSteps;

uniform int   u_authentic;
uniform int   u_bandLevels;
uniform float u_time;

uniform int   u_gridDebug;
uniform int   u_lightingEnabled;
uniform int   u_pbrEnabled;
uniform int   u_pomEnabled;

const float PI = 3.14159265;

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
  for(int i=0;i<32;i++){
    if(sideDist.x < sideDist.y){ sideDist.x += deltaDist.x; mapPos.x += iStep.x; }
    else { sideDist.y += deltaDist.y; mapPos.y += iStep.y; }
    if(mapPos.x <0 || mapPos.y<0 || mapPos.x >= int(u_mapSize.x) || mapPos.y >= int(u_mapSize.y)) return false;
    vec4 ms = texelFetch(u_mapTex, mapPos, 0);
    int cell = int(ms.r*255.0+0.5);
    if(cell>0){
      float perp = min(sideDist.x - deltaDist.x, sideDist.y - deltaDist.y);
      if(perp > maxDist) return false;
      return true;
    }
  }
  return false;
}

float DistributionGGX(vec3 N, vec3 H, float roughness){
  float a = roughness*roughness; float a2=a*a;
  float NdotH = max(dot(N,H),0.0); float NdotH2=NdotH*NdotH;
  float num=a2; float denom=(NdotH2*(a2-1.0)+1.0); denom=PI*denom*denom;
  return num / max(denom,0.0001);
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
  float layerDepth = 1.0 / float(steps);
  float curDepth = 0.0;
  vec2 delta = viewTS.xy * strength / float(steps) / max(viewTS.z,0.001);
  vec2 curUV = uv;
  float height = texture(heightMap, curUV).r;
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    if (curDepth >= height) break;
    curUV -= delta;
    height = texture(heightMap, curUV).r;
    curDepth += layerDepth;
  }
  return curUV - uv;
}

vec3 pbrShade(vec3 albedo, vec3 N, float rough, float metal, float ao, vec3 emissive, vec3 worldPos, vec3 viewDir) {
  if (u_lightingEnabled == 0) {
    // lighting off: flat albedo only, no shading
    return albedo;
  }
  if (u_pbrEnabled == 0) {
    // PBR off: simple diffuse only, no specular/Fresnel/GGX
    vec3 sunDir = normalize(vec3(u_sunDir.xy, u_sunDirZ));
    vec3 Lsun = -sunDir;
    float sunShadow = 1.0;
    vec2 shadowOrigin = worldPos.xy + N.xy * 0.02;
    vec2 shadowDir = normalize(Lsun.xy);
    if (length(shadowDir) > 0.01 && traceRay(shadowOrigin, shadowDir, 20.0)) sunShadow = 0.25;
    float NdotLsun = max(dot(N, Lsun), 0.0);
    vec3 sunContrib = albedo * u_sunColor * u_sunIntensity * NdotLsun * sunShadow;

    vec3 Lp = u_lightPos - worldPos;
    float distp = length(Lp);
    vec3 pointContrib = vec3(0.0);
    if (distp < u_lightRadius) {
      Lp /= distp;
      float atten = clamp(1.0 - distp / u_lightRadius, 0.0, 1.0); atten *= atten;
      float shadow = 1.0;
      vec2 so = worldPos.xy + N.xy * 0.02;
      vec2 sd = normalize(Lp.xy);
      if (length(sd) > 0.01 && traceRay(so, sd, distp - 0.1)) shadow = 0.15;
      float flick = 0.85 + 0.15 * sin(u_time * 6.0) + 0.08 * sin(u_time * 9.0);
      atten *= flick;
      float NdotLp = max(dot(N, Lp), 0.0);
      pointContrib = albedo * u_lightColor * u_lightIntensity * atten * NdotLsun * shadow;
    }
    vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * ao;
    return ambient + sunContrib + pointContrib + emissive;
  }
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 Lo = vec3(0.0);

  // Sun directional light with shadow raymarch
  vec3 sunDir = normalize(vec3(u_sunDir.xy, u_sunDirZ));
  vec3 Lsun = -sunDir;
  float sunShadow = 1.0;
  {
    vec2 shadowOrigin = worldPos.xy + N.xy * 0.02;
    vec2 shadowDir = normalize(Lsun.xy);
    if (length(shadowDir) > 0.01 && traceRay(shadowOrigin, shadowDir, 20.0)) sunShadow = 0.25;
  }
  {
    vec3 H = normalize(viewDir + Lsun);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, viewDir, Lsun, rough);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lsun), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;
    vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
    float NdotL = max(dot(N, Lsun), 0.0);
    Lo += (kD * albedo / PI + specular) * u_sunColor * u_sunIntensity * NdotL * sunShadow;
  }

  // Player point light with shadow raymarch
  vec3 L = u_lightPos - worldPos;
  float dist = length(L);
  if (dist < u_lightRadius) {
    L /= dist;
    float atten = clamp(1.0 - dist / u_lightRadius, 0.0, 1.0); atten *= atten;
    float shadow = 1.0;
    vec2 shadowOrigin = worldPos.xy + N.xy * 0.02;
    vec2 shadowDir = normalize(L.xy);
    if (length(shadowDir) > 0.01 && traceRay(shadowOrigin, shadowDir, dist - 0.1)) shadow = 0.15;
    // flicker
    float flick = 0.85 + 0.15 * sin(u_time * 6.0) + 0.08 * sin(u_time * 9.0);
    atten *= flick;
    vec3 H = normalize(viewDir + L);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, viewDir, L, rough);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;
    vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
    float NdotL = max(dot(N, L), 0.0);
    Lo += (kD * albedo / PI + specular) * u_lightColor * u_lightIntensity * atten * NdotL * shadow * ao;
  }

  vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * ao;
  vec3 color = ambient + Lo + emissive;
  return color;
}

void main() {
  vec2 fragCoord = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
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

  for (int i = 0; i < 64; i++) {
    if (sideDist.x < sideDist.y) { sideDist.x += deltaDist.x; mapPos.x += float(stepDir.x); side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += float(stepDir.y); side = 1; }
    if (mapPos.x < 0.0 || mapPos.y < 0.0 || mapPos.x >= u_mapSize.x || mapPos.y >= u_mapSize.y) break;
    vec4 cell = texelFetch(u_mapTex, ivec2(mapPos), 0);
    cellType = cell.r * 255.0;
    if (cellType > 0.5) { hit = 1; break; }
  }

  vec3 finalColor = u_fogColor;

  if (hit == 1) {
    if (side == 0) perpDist = (mapPos.x - u_playerPos.x + (1.0 - float(stepDir.x)) * 0.5) / ray.x;
    else perpDist = (mapPos.y - u_playerPos.y + (1.0 - float(stepDir.y)) * 0.5) / ray.y;
    hitPos = u_playerPos + ray * perpDist;

    // unit grid: walls exactly 1m tall from floor 0 to ceiling 1
    float floorH = 0.0;
    float ceilH = 1.0;

    float wallU;
    if (side == 0) wallU = hitPos.y - floor(hitPos.y);
    else wallU = hitPos.x - floor(hitPos.x);
    if ((side == 0 && ray.x > 0.0) || (side == 1 && ray.y < 0.0)) wallU = 1.0 - wallU;
    if (u_authentic == 1) wallU = floor(wallU * 64.0 * 65536.0) / 65536.0 / 64.0;

    // eyeZ fixed at 0.5 for unit grid flat floor
    float eyeZ = 0.5;
    float wallH_full = u_resolution.y / max(perpDist, 0.0001) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
    float drawStart = u_resolution.y * 0.5 - (ceilH - eyeZ) * wallH_full;
    float drawEnd = u_resolution.y * 0.5 + (eyeZ - floorH) * wallH_full;
    float wallV_raw = (fragCoord.y - drawStart) / max(drawEnd - drawStart, 0.001);

    if (wallV_raw < -0.03 || wallV_raw > 1.03) {
      float horizon = 0.5;
      float vNorm = 1.0 - v_uv.y;
      if (vNorm > horizon) {
        // flat floor at 0
        float floorH_atRay = 0.0;
        float dist = 0.001;
        vec2 floorWorld = vec2(0.0);
        dist = (eyeZ - floorH_atRay) / max(0.0001, (vNorm - horizon)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) dist = 0.001;
        floorWorld = u_playerPos + ray * dist;
        vec2 floorUV = fract(floorWorld);
        // grid debug: floor green, wall red, ceiling blue — or normal grid lines
        vec2 fw = fract(floorWorld);
        float grid = (fw.x > 0.97 || fw.y > 0.97 || fw.x < 0.03 || fw.y < 0.03) ? 1.0 : 0.25;
        vec3 albedo;
        if (u_gridDebug == 1) albedo = vec3(0.0, grid * 0.9, 0.0);
        else albedo = vec3(grid * 0.8, grid * 0.8, grid);
        vec3 normalTS = vec3(0.5,0.5,1.0);
        vec3 N = vec3(0,0,1);
        vec4 rma = vec4(0.9,0,0,1);
        float ao = 1.0;
        vec3 emissive = vec3(0);
        vec3 worldPos = vec3(floorWorld, floorH_atRay);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
        perpDist = dist;
      } else {
        // flat ceiling at 1.0
        float ceilH_atRay = 1.0;
        float dist = 0.001;
        vec2 ceilWorld = vec2(0.0);
        dist = (ceilH_atRay - eyeZ) / max(0.0001, (horizon - vNorm)) * u_resolution.x / u_resolution.y * 0.5 / tan(u_fov * 0.5);
        if (dist < 0.001) dist = 0.001;
        ceilWorld = u_playerPos + ray * dist;
        vec2 ceilUV = fract(ceilWorld);
        vec2 cuvAtlas = atlasUV(1.0, ceilUV, u_atlasCeils, u_texSize);
        vec2 cw = fract(ceilWorld);
        float grid = (cw.x > 0.97 || cw.y > 0.97 || cw.x < 0.03 || cw.y < 0.03) ? 1.0 : 0.25;
        vec3 albedo;
        if (u_gridDebug == 1) albedo = vec3(0.0, 0.0, grid * 0.9);
        else albedo = vec3(grid * 0.8, grid * 0.8, grid);
        vec3 normalTS = vec3(0.5,0.5,1.0);
        vec3 N = vec3(0,0,-1);
        vec4 rma = vec4(0.9,0,0,1);
        float ao = 1.0;
        vec3 emissive = vec3(0);
        vec3 worldPos = vec3(ceilWorld, ceilH_atRay);
        vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
        finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
        perpDist = dist;
      }
    } else {
      float wallV = clamp(wallV_raw, 0.0, 1.0);
      float matId = max(1.0, cellType);
      vec2 uv = vec2(wallU, wallV);
      // DEBUG GRID on walls - show 1 world unit squares
      float wallH = ceilH - floorH;
      vec2 wuv = vec2(fract(wallU), fract(wallV * wallH));
      float grid = (wuv.x > 0.95 || wuv.y > 0.95 || wuv.x < 0.05 || wuv.y < 0.05) ? 1.0 : 0.25;
      vec3 albedo;
      if (u_gridDebug == 1) albedo = vec3(grid * 0.9, 0.0, 0.0);
      else albedo = vec3(grid * 0.8, grid * 0.8, grid);
      vec3 normal = vec3(0,0,1);
      float rough = 0.9; float metal = 0.0; float ao = 1.0;
      vec3 emissive = vec3(0);

      vec3 worldPos = vec3(hitPos.x, hitPos.y, u_playerHeight + (wallV - 0.5));
      vec3 viewDir = normalize(vec3(u_playerPos, u_playerHeight) - worldPos);

      finalColor = pbrShade(albedo, normal, rough, metal, ao, emissive, worldPos, viewDir);
      if (side == 1) finalColor *= 0.85;
    }
  } else {
    float horizon = 0.5;
    float vNorm2 = 1.0 - v_uv.y;
    // sample player cell floor for eye height like wall-hit path
    ivec2 pc = ivec2(floor(u_playerPos));
    float pfH = 0.0;
    if (pc.x >= 0 && pc.y >= 0 && pc.x < int(u_mapSize.x) && pc.y < int(u_mapSize.y)) {
      vec4 pmd = texelFetch(u_mapTex, pc, 0); pfH = clamp(pmd.g - 0.5, -0.6, 0.6);
    }
    float eyeZ2 = 0.5 + pfH * 0.15;
    if (vNorm2 > horizon) {
      // Iterate to find correct floor height at hit cell like prototype
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
          int cellType = int(fmd.r * 255.0 + 0.5);
          if (cellType == 0) {
            floorH = clamp(fmd.g - 0.5, -0.6, 0.6);
          } else {
            break; // hit wall, stop iterating
          }
        }
      }
      vec2 floorUV = fract(floorWorld);
      vec2 fuvAtlas = atlasUV(1.0, floorUV, u_atlasFloors, u_texSize);
        vec2 fw = fract(floorWorld);
        float grid = (fw.x > 0.97 || fw.y > 0.97 || fw.x < 0.03 || fw.y < 0.03) ? 1.0 : 0.25;
        vec3 albedo = vec3(grid * 0.8, grid * 0.8, grid);
        vec3 normalTS = vec3(0.5,0.5,1.0);
        vec3 N = vec3(0,0,1);
        vec4 rma = vec4(0.9,0,0,1);
        float ao = 1.0;
        vec3 emissive = vec3(0);
      vec3 worldPos = vec3(floorWorld, floorH);
      vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
      finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
      perpDist = dist;
    } else {
      // Iterate to find correct ceiling height at hit cell like prototype
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
          int cellType = int(cmd.r * 255.0 + 0.5);
          if (cellType == 0) {
            ceilH = clamp(cmd.b / 255.0 + 0.7, 0.4, 2.2);
          } else {
            break; // hit wall, stop iterating
          }
        }
      }
      vec2 ceilUV = fract(ceilWorld);
      vec2 cuvAtlas = atlasUV(1.0, ceilUV, u_atlasCeils, u_texSize);
        vec2 cw = fract(ceilWorld);
        float grid = (cw.x > 0.97 || cw.y > 0.97 || cw.x < 0.03 || cw.y < 0.03) ? 1.0 : 0.2;
        vec3 albedo = vec3(grid * 0.8, grid * 0.8, grid);
        vec3 normalTS = vec3(0.5,0.5,1.0);
        vec3 N = vec3(0,0,-1);
        vec4 rma = vec4(0.9,0,0,1);
        float ao = 1.0;
        vec3 emissive = vec3(0);
      vec3 worldPos = vec3(ceilWorld, ceilH);
      vec3 viewDir = normalize(vec3(u_playerPos, eyeZ2) - worldPos);
      finalColor = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
      perpDist = dist;
    }
  }

  // Squared exponential fog matching prototype
  float fog = 1.0 / (1.0 + perpDist * u_fogBase + perpDist * perpDist * u_fogSquared);
  finalColor *= fog;
  finalColor += u_fogColor * (1.0 - fog);

  // Authentic banding if enabled
  if (u_authentic == 1) {
    int bands = max(8, u_bandLevels);
    finalColor = floor(finalColor * float(bands)) / float(bands);
  }

  outColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}
`;

// Palette quantization pass shaders
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
  // RGB 5-bit quantization via LUT
  ivec2 lutCoord = ivec2(int(sc.r * 31.99) + int(sc.g * 31.99) * 32, int(sc.b * 31.99));
  float palIdx = float(texture(u_lut, (vec2(lutCoord) + 0.5) / vec2(1024.0, 32.0)).r * 255.0) / 255.0;
  vec3 palCol = texture(u_palette, vec2(palIdx + 0.5/256.0, 0.5)).rgb;
  if (u_paletteStyle == 3) { float g = dot(palCol, vec3(0.299,0.587,0.114)); palCol = vec3(g); }
  else if (u_paletteStyle == 4) { float g = dot(palCol, vec3(0.299,0.587,0.114)); palCol = vec3(min(1.0,g*1.2), min(1.0,g*0.9), min(1.0,g*0.6)); }
  outColor = vec4(palCol, sc.a);
}
`;

// UI overlay shaders for map HUD
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
