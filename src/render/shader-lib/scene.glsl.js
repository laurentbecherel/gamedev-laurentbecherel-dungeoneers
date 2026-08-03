// Scene rendering helpers – main() split v11.1: unified horizontal to cut compile cost
// Floor/Ceiling were 2× duplicated, now one function shadeHorizontalCell(isCeil)

export const glslScene = `
// Grid debug colors – forward declared
vec3 getGridColor(in vec2 world, in bool isCeil) {
  if (isCeil) return vec3(0.0, 0.0, (fract(world).x > 0.97 || fract(world).y > 0.97 ? 1.0 : 0.25) * 0.9);
  return vec3(0.0, (fract(world).x > 0.97 || fract(world).y > 0.97 ? 1.0 : 0.25) * 0.9, 0.0);
}

// Modifier mask debug visualization – shows per-cell intensities (v2 2-texture)
vec3 debugModifiersViz(in ivec2 cell, in int mode) {
  vec4 m1 = texelFetch(u_modifierMap, cell, 0);
  vec4 m2 = texelFetch(u_modifierMap2, cell, 0);
  if (mode == 9) return m1.rgb; // moss/water/puddle combined RGB
  if (mode == 10) return vec3(m1.a, m2.r, m2.g); // dust/damaged/blood
  if (mode == 11) return vec3(m1.r); // moss only
  if (mode == 12) return vec3(m1.g); // water only
  if (mode == 13) return vec3(m1.b); // puddle only
  if (mode == 14) return vec3(m1.a); // dust only
  if (mode == 15) return vec3(m2.r); // damaged only
  if (mode == 16) return vec3(m2.g); // blood only
  if (mode == 17) return vec3(m1.r, m1.g, m2.g); // moss/water/blood highlight
  return vec3(0.0);
}

// Unified horizontal (floor/ceil) – reduces code size ~50% vs two separate functions
vec3 shadeHorizontalCell(in vec2 horizWorld, in vec2 horizUV, in float matId, in float count, in vec2 ray, in float eyeZ, in float heightAtRay, in bool isCeil, out float outDist) {
  float layer = clampLayer(matId, count);
  vec2 uv = horizUV;
  if (u_pomEnabled == 1) {
    if (isCeil) {
      vec3 viewDirTS = normalize(vec3(-ray, 0.5));
      vec2 po = pomOffsetArray(u_ceilHeight, uv, layer, viewDirTS, u_pomCeil, u_pomSteps);
      uv += po;
    } else {
      vec3 viewDirTS = normalize(vec3(-ray, 0.8));
      vec2 po = pomOffsetArray(u_floorHeight, uv, layer, viewDirTS, u_pomFloor, u_pomSteps);
      uv += po;
    }
  }
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

  // Modifier debug takes precedence to allow seeing masks even when grid debug on
  if (u_pbrDebugMode >= 9 && u_pbrDebugMode <= 17) {
    outDist = distance(horizWorld, u_playerPos);
    return debugModifiersViz(ivec2(floor(horizWorld)), u_pbrDebugMode);
  }
  if (u_gridDebug == 1) {
    outDist = distance(horizWorld, u_playerPos);
    return getGridColor(horizWorld, isCeil);
  }
  if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
    outDist = distance(horizWorld, u_playerPos);
    return debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rma, emissive);
  }

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
  applyModifiers(albedo, N, rma.r, rma.g, ao, vec3(horizWorld, heightAtRay));
  vec3 worldPos = vec3(horizWorld, heightAtRay);
  vec3 viewDir = normalize(vec3(u_playerPos, eyeZ) - worldPos);
  outDist = distance(horizWorld, u_playerPos);
  return pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
}

// Wrappers kept for tests / old call sites – forward to unified
vec3 shadeFloorCell(in vec2 floorWorld, in vec2 floorUV, in float matId, in float fc, in vec2 ray, in float eyeZ, in float floorH_atRay, out float outDist) {
  return shadeHorizontalCell(floorWorld, floorUV, matId, fc, ray, eyeZ, floorH_atRay, false, outDist);
}
vec3 shadeCeilCell(in vec2 ceilWorld, in vec2 ceilUV, in float matId, in float cc, in vec2 ray, in float eyeZ, in float ceilH_atRay, out float outDist) {
  return shadeHorizontalCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, ceilH_atRay, true, outDist);
}

vec3 shadeWallCell(in float wallU, in float wallV, in float matId, in float wc, in int side, in ivec2 stepDir, in vec2 ray, in vec2 hitPos, in bool hasCornerRound, in vec3 cornerNormal) {
  float layer = clampLayer(matId, wc);
  vec2 uv = vec2(wallU, wallV);
  vec3 NgeomFlat;
  vec3 tangentFlat;
  vec3 bitangent = vec3(0.0, 0.0, 1.0);
  if (side == 0) {
    NgeomFlat = vec3(float(-stepDir.x), 0.0, 0.0);
    tangentFlat = vec3(0.0, ray.x > 0.0 ? -1.0 : 1.0, 0.0);
  } else {
    NgeomFlat = vec3(0.0, float(-stepDir.y), 0.0);
    tangentFlat = vec3(ray.y < 0.0 ? -1.0 : 1.0, 0.0, 0.0);
  }
  vec3 Ngeom = NgeomFlat;
  vec3 tangent = tangentFlat;
  if (hasCornerRound) {
    vec3 cornerGeom = cornerNormal;
    if (u_cornerMode == 0) {
      vec3 n2 = (side == 0) ? vec3(0.0, (wallU < 0.5 ? -1.0 : 1.0), 0.0) : vec3((wallU < 0.5 ? -1.0 : 1.0), 0.0, 0.0);
      cornerGeom = normalize(NgeomFlat + n2);
    }
    float nMix = u_cornerNormalMix > 0.0 ? u_cornerNormalMix : 0.92;
    Ngeom = normalize(mix(NgeomFlat, cornerGeom, clamp(nMix, 0.0, 1.0)));
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
  vec2 uvPOM = uv;
  if (u_pomEnabled == 1) {
    vec2 po = pomOffsetArray(u_wallHeight, uv, layer, viewTS, u_pomWall, u_pomSteps);
    uvPOM = uv + po;
  }
  vec3 albedoRaw = sampleWallAlbedo(layer, uvPOM);
  vec3 normalRaw = sampleWallNormalRaw(layer, uvPOM);
  vec3 normalTSw = decodeNormal(normalRaw);
  float heightVal = sampleWallHeight(layer, uvPOM);
  vec4 rmaW = sampleWallRMA(layer, uvPOM);
  float emissiveAlbedoMul = u_pbrEmissiveAlbedoMul > 0.0 ? u_pbrEmissiveAlbedoMul : 0.8;
  float emissiveStrength = u_pbrEmissiveStrength > 0.0 ? u_pbrEmissiveStrength : 2.5;
  vec3 emissiveW = albedoRaw * emissiveAlbedoMul * rmaW.b * emissiveStrength;
  vec3 Nw = normalize(tangent * normalTSw.x + bitangent * normalTSw.y + Ngeom * normalTSw.z);

  if (u_pbrDebugMode >= 9 && u_pbrDebugMode <= 17) {
    return debugModifiersViz(ivec2(floor(hitPos)), u_pbrDebugMode);
  }
  if (u_gridDebug == 1) {
    float wallH = 1.0;
    vec2 wuv = vec2(fract(wallU), fract(wallV * wallH));
    float grid = (wuv.x > 0.95 || wuv.y > 0.95 || wuv.x < 0.05 || wuv.y < 0.05) ? 1.0 : 0.25;
    return vec3(grid * 0.9, 0.0, 0.0);
  }
  if (u_pbrDebugMode != 0 && u_gridDebug == 0) {
    return debugShowPBR(u_pbrDebugMode, albedoRaw, normalRaw, Nw, heightVal, rmaW, emissiveW);
  }

  if (hasCornerRound) {
    float albBoost = u_cornerAlbedoBoost >= 0.0 ? u_cornerAlbedoBoost : 0.05;
    float roughMul = u_cornerRoughMul > 0.0 ? u_cornerRoughMul : 0.82;
    float aoMul = u_cornerAoMul > 0.0 ? u_cornerAoMul : 0.96;
    albedoRaw += vec3(albBoost);
    rmaW.r *= roughMul;
    rmaW.a *= aoMul;
  }

  applyWallFloorTrim(wallV, Ngeom, Nw, albedoRaw, rmaW);
  applyWallCeilTrim(wallV, Ngeom, Nw, albedoRaw, rmaW);
  if (!hasCornerRound) applyWallVerticalEdge(wallU, side, Ngeom, Nw, albedoRaw, rmaW);
  applyModifiers(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, worldPos);

  vec3 color = pbrShade(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, emissiveW, worldPos, viewDir);
  if (side == 1) {
    float wallDarken = u_renderWallDarken > 0.0 ? u_renderWallDarken : 0.85;
    color *= wallDarken;
  }
  return color;
}
`;
