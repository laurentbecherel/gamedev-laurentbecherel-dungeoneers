
// Scene rendering helpers - v14 puddle precise debug bright mask

export const glslScene = `
// Grid debug colors
vec3 getGridColor(in vec2 world, in bool isCeil) {
  if (isCeil) return vec3(0.0, 0.0, (fract(world).x > 0.97 || fract(world).y > 0.97 ? 1.0 : 0.25) * 0.9);
  return vec3(0.0, (fract(world).x > 0.97 || fract(world).y > 0.97 ? 1.0 : 0.25) * 0.9, 0.0);
}

vec3 debugModifiersViz(in ivec2 cell, in int mode) {
  vec4 m1 = texelFetch(u_modifierMap, cell, 0);
  vec4 m2 = texelFetch(u_modifierMap2, cell, 0);
  if (mode == 9) return m1.rgb;
  if (mode == 10) return vec3(m1.a, m2.r, m2.g);
  if (mode == 11) return vec3(m1.r);
  if (mode == 12) return vec3(m1.g);
  if (mode == 13) return vec3(m1.b);
  if (mode == 14) return vec3(m1.a);
  if (mode == 15) return vec3(m2.r);
  if (mode == 16) return vec3(m2.g);
  if (mode == 17) return vec3(m1.r, m1.g, m2.g);
  return vec3(0.0);
}

// Bright mask visualization - BIG BLUE / PINK as requested, not dark PBR
vec3 debugFinalPuddleMask(in vec3 worldPos, in float matHeight, in float ao) {
  vec2 modUV = worldPos.xy / u_mapSize;
  vec4 mod1 = texture(u_modifierMap, modUV);
  float puddleCell = mod1.b;
  float mask = computePuddleMaskTweakable(worldPos, matHeight, ao, puddleCell);
  // BIG COLOR: bright cyan for water, magenta for edge, high contrast vs black
  // Use intense colors that survive doom palette quantization
  float edge = mask * (1.0 - mask) * 5.0;
  vec3 inside = vec3(0.10, 0.55, 1.0) * mask * 1.8; // BRIGHT BLUE
  vec3 edgeCol = vec3(1.0, 0.25, 0.85) * edge; // BRIGHT PINK/MAGENTA edge
  vec3 bg = vec3(0.02, 0.02, 0.03); // near black background
  vec3 col = bg + inside + edgeCol;
  // Add solid fill for high mask so it's BIG COLOR
  if (mask > 0.5) col = mix(col, vec3(0.20, 0.75, 1.0), 0.6); // even brighter inside puddle
  return clamp(col, 0.0, 1.0);
}

vec3 shadeHorizontalCell(in vec2 horizWorld, in vec2 horizUV, in float matId, in float count, in vec2 ray, in float eyeZ, in float heightAtRay, in bool isCeil, out float outDist) {
  float layer = clampLayer(matId, count);
  vec2 uv = horizUV;
  float pomEn = float(u_pomEnabled);
  float isCeilF = float(isCeil);
  vec3 viewDirCeil = normalize(vec3(-ray, 0.5));
  vec2 poCeil = pomOffsetArray(u_ceilHeight, uv, layer, viewDirCeil, u_pomCeil, u_pomSteps);
  vec3 viewDirFloor = normalize(vec3(-ray, 0.8));
  vec2 poFloor = pomOffsetArray(u_floorHeight, uv, layer, viewDirFloor, u_pomFloor, u_pomSteps);
  vec2 po = mix(poFloor, poCeil, isCeilF);
  uv = mix(uv, uv + po, pomEn);
  vec3 albedoRaw;
  vec3 normalRaw;
  float heightVal;
  vec4 rma;
  vec3 Nw;
  if (isCeil) {
    albedoRaw = sampleCeilAlbedo(layer, uv);
    normalRaw = sampleCeilNormalRaw(layer, uv);
    vec3 nt = decodeNormal(normalRaw);
    Nw = normalize(vec3(nt.x, -nt.y, -nt.z));
    heightVal = sampleCeilHeight(layer, uv);
    rma = sampleCeilRMA(layer, uv);
  } else {
    albedoRaw = sampleFloorAlbedo(layer, uv);
    normalRaw = sampleFloorNormalRaw(layer, uv);
    vec3 nt = decodeNormal(normalRaw);
    Nw = normalize(vec3(nt.xy, nt.z));
    heightVal = sampleFloorHeight(layer, uv);
    rma = sampleFloorRMA(layer, uv);
  }
  float ao = rma.a;
  float emissiveAlbedoMul = u_pbrEmissiveAlbedoMul > 0.0 ? u_pbrEmissiveAlbedoMul : 0.8;
  float emissiveStrength = u_pbrEmissiveStrength > 0.0 ? u_pbrEmissiveStrength : 2.5;
  vec3 emissive = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;

  float surfMul = isCeil ? (u_renderCeilMul > 0.0 ? u_renderCeilMul : 0.8) : (u_renderFloorMul > 0.0 ? u_renderFloorMul : 0.7);
  vec3 albedo = albedoRaw * surfMul;
  vec3 N = Nw;
  if (isCeil) {
    applyCeilBaseboard(horizWorld, N, ao, albedo, rma);
    applyGridCeil(horizWorld, N, ao, albedo, rma);
  } else {
    applyFloorBaseboard(horizWorld, N, ao, albedo, rma);
    applyGridFloor(horizWorld, N, ao, albedo, rma);
  }
  float isFloorSurface = isCeil ? 0.0 : 1.0;
  applyModifiers(albedo, N, rma.r, rma.g, ao, vec3(horizWorld, heightAtRay), heightVal, isFloorSurface);
  vec3 worldPos = vec3(horizWorld, heightAtRay);
  vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
  outDist = distance(horizWorld, u_playerPos);
  return pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
}

vec3 shadeFloorCell(in vec2 floorWorld, in vec2 floorUV, in float matId, in float fc, in vec2 ray, in float eyeZ, in float floorH_atRay, out float outDist) {
  return shadeHorizontalCell(floorWorld, floorUV, matId, fc, ray, eyeZ, floorH_atRay, false, outDist);
}
vec3 shadeCeilCell(in vec2 ceilWorld, in vec2 ceilUV, in float matId, in float cc, in vec2 ray, in float eyeZ, in float ceilH_atRay, out float outDist) {
  return shadeHorizontalCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, ceilH_atRay, true, outDist);
}

vec3 shadeWallCell(in float wallU, in float wallV, in float matId, in float wc, in int side, in ivec2 stepDir, in vec2 ray, in vec2 hitPos, in bool hasCornerRound, in vec3 cornerNormal) {
  float layer = clampLayer(matId, wc);
  vec2 uv = vec2(wallU, wallV);
  vec3 bitangent = vec3(0.0, 0.0, 1.0);
  float sideEq0 = step(float(side), 0.5);
  float sideEq1 = 1.0 - sideEq0;
  float rayXpos = step(0.0, ray.x);
  float rayYneg = step(ray.y, 0.0);
  vec3 NgeomFlat0 = vec3(float(-stepDir.x), 0.0, 0.0);
  vec3 NgeomFlat1 = vec3(0.0, float(-stepDir.y), 0.0);
  vec3 NgeomFlat = mix(NgeomFlat1, NgeomFlat0, sideEq0);
  vec3 tangentFlat0 = vec3(0.0, mix(-1.0, 1.0, rayXpos), 0.0);
  vec3 tangentFlat1 = vec3(mix(1.0, -1.0, rayYneg), 0.0, 0.0);
  vec3 tangentFlat = mix(tangentFlat1, tangentFlat0, sideEq0);
  vec3 Ngeom = NgeomFlat;
  vec3 tangent = tangentFlat;
  float cornerEn = float(hasCornerRound);
  float cornerMode0 = step(float(u_cornerMode), 0.5);
  float left = step(wallU, 0.5);
  vec3 n2_0a = vec3(0.0, mix(1.0, -1.0, left), 0.0);
  vec3 n2_1a = vec3(mix(-1.0, 1.0, left), 0.0, 0.0);
  vec3 n2 = mix(n2_1a, n2_0a, sideEq0);
  vec3 cornerGeom0 = normalize(NgeomFlat + n2);
  vec3 cornerGeom = mix(cornerNormal, cornerGeom0, cornerMode0);
  float nMix = u_cornerNormalMix > 0.0 ? u_cornerNormalMix : 0.92;
  vec3 NgeomMixed = normalize(mix(NgeomFlat, cornerGeom, clamp(nMix, 0.0, 1.0)));
  Ngeom = mix(NgeomFlat, NgeomMixed, cornerEn);
  float dotTN = dot(tangentFlat, Ngeom);
  vec3 tOrtho = tangentFlat - dotTN * Ngeom;
  float tiny = step(dot(tOrtho, tOrtho), 0.000001);
  vec3 tOrthoFallback = vec3(-Ngeom.y, Ngeom.x, 0.0);
  float flip = step(dot(tOrthoFallback, tangentFlat), 0.0);
  vec3 tOrthoFlipped = mix(tOrthoFallback, -tOrthoFallback, flip);
  tOrtho = mix(tOrtho, tOrthoFlipped, tiny);
  vec3 tangentOrtho = normalize(tOrtho);
  tangent = mix(tangentFlat, tangentOrtho, cornerEn);
  vec3 worldPos = vec3(hitPos.x, hitPos.y, u_playerHeight + (wallV - 0.5));
  vec3 viewDir = normalize(vec3(u_playerPos, u_playerHeight) - worldPos);
  vec3 viewTS = vec3(dot(viewDir, tangent), dot(viewDir, bitangent), dot(viewDir, Ngeom));
  float pomEn = float(u_pomEnabled);
  vec2 poWall = pomOffsetArray(u_wallHeight, uv, layer, viewTS, u_pomWall, u_pomSteps);
  vec2 uvPOM = mix(uv, uv + poWall, pomEn);
  vec3 albedoRaw = sampleWallAlbedo(layer, uvPOM);
  vec3 normalRaw = sampleWallNormalRaw(layer, uvPOM);
  vec3 normalTSw = decodeNormal(normalRaw);
  float heightVal = sampleWallHeight(layer, uvPOM);
  vec4 rmaW = sampleWallRMA(layer, uvPOM);
  float emissiveAlbedoMul = u_pbrEmissiveAlbedoMul > 0.0 ? u_pbrEmissiveAlbedoMul : 0.8;
  float emissiveStrength = u_pbrEmissiveStrength > 0.0 ? u_pbrEmissiveStrength : 2.5;
  vec3 emissiveW = albedoRaw * emissiveAlbedoMul * rmaW.b * emissiveStrength;
  vec3 Nw = normalize(tangent * normalTSw.x + bitangent * normalTSw.y + Ngeom * normalTSw.z);

  float albBoost = u_cornerAlbedoBoost >= 0.0 ? u_cornerAlbedoBoost : 0.05;
  float roughMul = u_cornerRoughMul > 0.0 ? u_cornerRoughMul : 0.82;
  float aoMul = u_cornerAoMul > 0.0 ? u_cornerAoMul : 0.96;
  vec3 albedoCorner = albedoRaw + vec3(albBoost);
  albedoRaw = mix(albedoRaw, albedoCorner, cornerEn);
  float rmaRoughCorner = rmaW.r * roughMul;
  rmaW.r = mix(rmaW.r, rmaRoughCorner, cornerEn);
  float rmaAoCorner = rmaW.a * aoMul;
  rmaW.a = mix(rmaW.a, rmaAoCorner, cornerEn);

  applyWallFloorTrim(wallV, Ngeom, Nw, albedoRaw, rmaW);
  applyWallCeilTrim(wallV, Ngeom, Nw, albedoRaw, rmaW);
  float noCorner = 1.0 - cornerEn;
  float vertEn = noCorner * float(u_chamferEnabled);
  // apply vertical edge with valid factor already inside, but gate by noCorner
  // we call with branchless version that uses en internally, extra gate via mix
  vec3 NwBefore = Nw; vec3 albedoBefore = albedoRaw; vec4 rmaBefore = rmaW;
  applyWallVerticalEdge(wallU, side, Ngeom, Nw, albedoRaw, rmaW);
  Nw = mix(NwBefore, Nw, vertEn);
  albedoRaw = mix(albedoBefore, albedoRaw, vertEn);
  rmaW = mix(rmaBefore, rmaW, vertEn);
  float isFloorSurface = 0.0;
  applyModifiers(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, worldPos, heightVal, isFloorSurface);

  vec3 color = pbrShade(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, emissiveW, worldPos, viewDir);
  float sideY = step(0.5, float(side));
  // side==1 -> darken
  float wallDarken = u_renderWallDarken > 0.0 ? u_renderWallDarken : 0.85;
  color = mix(color, color * wallDarken, sideY);
  return color;
}
`;
