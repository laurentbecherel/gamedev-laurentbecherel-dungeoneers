// Modifier system - v15 moss decomposed: noise, env/nearwall, material, combined - fully tunable via JSON/UBO
export const glslModifiers = `

// UBO v20 - 22 vec4 = 352 bytes, binding 1 - fully tunable, moss albedo+strengths now live
// 0 = modMossAlbedoRough: x=floorDepress y=seed z=mossNoiseScale w=mossThreshold
// 1 = modMossParams: x=heightGroutLow y=heightGroutHigh z=aoGroutLow w=aoGroutHigh (puddle grout)
// 2 = modWaterAlbedoRough -> mossEnv1: x=floorBase y=wallBase z=wallEdgeBase w=cornerBonus
// 3 = modWaterParams: x=worldLowHigh y=worldLowLow z=maskBoost w=darkBaseFactor (puddle)
// 4 = modPuddleAlbedoRough: xyz albedo w roughTarget
// 5 = modPuddleParams: x=colorStrength y=scaleLarge z=threshold w=feather
// 6 = modBloodAlbedoMix: x=cellLow y=cellHigh z=cellEps w=unused
// 7 = modBloodParams: x=rippleScale y=edgeFoam z=heightInfluence w=aoMix
// 8 = modDustAlbedoRough -> mossEnv2: x=bottomLow y=bottomHigh z=ceilReduce w=seamBoost
// 9 = modDustParams: x=tintMix y=grooveMin z=edgeLow w=edgeHigh
// 10 = modDamagedAlbedoRough -> mossMat1: x=heightLow y=heightHigh z=aoLow w=aoHigh
// 11 = modDamagedParams: x=roughLow y=roughHigh z=flatStrength w=metalMix (puddle)
// 12 = modMossMatRough -> mossMat2: x=roughLow y=roughHigh z=matBase w=feather
// 13 = modMossFinal: x=biomeBase y=envBase z=matFinalBase w=finalBoost (global multiplier)
// 14 = modMossExtra1: x=wallDistInner y=wallDistOuter z=floorDistInner w=floorDistOuter (env feather)
// 15 = modMossExtra2: x=heightWeight y=aoWeight z=roughWeight w=combineModeMat (0=max,0.5=add,1=mul)
// 16 = modMossFinalWeights: x=noiseWeight y=envWeight z=matWeight w=biomeWeight
// 17 = modMossFinalCombine: x=combineModeFinal (0=max,0.5=add,1=mul) yzw reserved
// 18 = modMossGlobal: x=contrast y=brightness z=minThreshold w=maxThreshold
// 19 = modMossGlobal2: x=power yzw reserved
// 20 = modMossAlbedo: xyz albedo (from JSON [97,171,48]/255) w=colorStrength
// 21 = modMossStrengths: x=roughAdd y=heightAdd z=normalStrength w=aoStrength
layout(std140) uniform ModifiersBlock {
  vec4 modMossAlbedoRough;
  vec4 modMossParams;
  vec4 modWaterAlbedoRough;
  vec4 modWaterParams;
  vec4 modPuddleAlbedoRough;
  vec4 modPuddleParams;
  vec4 modBloodAlbedoMix;
  vec4 modBloodParams;
  vec4 modDustAlbedoRough;
  vec4 modDustParams;
  vec4 modDamagedAlbedoRough;
  vec4 modDamagedParams;
  vec4 modMossMatRough;
  vec4 modMossFinal;
  vec4 modMossExtra1;
  vec4 modMossExtra2;
  vec4 modMossFinalWeights;
  vec4 modMossFinalCombine;
  vec4 modMossGlobal;
  vec4 modMossGlobal2;
  vec4 modMossAlbedo;
  vec4 modMossStrengths;
};

// --- Lean reusable noise ---
float hash21_puddle(vec2 p) {
  float seedOff = modMossAlbedoRough.y;
  return fract(sin(dot(p + vec2(seedOff*0.13, seedOff*0.17), vec2(127.1, 311.7))) * 43758.5453);
}
float hash21_proc(vec2 p) { return hash21_puddle(p); }
float hash21(vec2 p){ return hash21_puddle(p); }

float valueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21_puddle(i);
  float b = hash21_puddle(i + vec2(1.0, 0.0));
  float c = hash21_puddle(i + vec2(0.0, 1.0));
  float d = hash21_puddle(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float hash31(vec3 p) {
  float seedOff = modMossAlbedoRough.y;
  return fract(sin(dot(p + vec3(seedOff*0.13, seedOff*0.17, seedOff*0.19), vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float valueNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}
float fbm3D_2(vec3 p){ return valueNoise3D(p)*0.5 + valueNoise3D(p*2.0)*0.25; }
float fbm3D_3(vec3 p){ return valueNoise3D(p)*0.5 + valueNoise3D(p*2.0)*0.25 + valueNoise3D(p*4.0)*0.125; }

float fbm2D_2(vec2 p) { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25; }
float fbm2D_3(vec2 p) { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125; }
float fbm2D_4(vec2 p) { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125 + valueNoise2D(p * 8.0) * 0.0625; }
float fbm2D(vec2 p, int o) { if (o <= 2) return fbm2D_2(p); return fbm2D_3(p); }
float fbm(vec2 p){ return fbm2D_3(p); }

vec3 puddleNoise(vec2 worldXY, float scaleLarge) {
  vec2 w = vec2(fbm2D_2(worldXY * 0.12), fbm2D_2(worldXY * 0.12 + vec2(7.3, 3.1))) * 0.9;
  vec2 p = worldXY * scaleLarge + w;
  float nLarge = fbm2D_3(p);
  float nMed   = valueNoise2D(p * 2.1 + vec2(11.3, 23.7));
  float nSmall = valueNoise2D(worldXY * 0.52 + vec2(5.1, 2.9));
  float cloud = nLarge * 0.60 + nMed * 0.28 + nSmall * 0.12;
  return vec3(cloud, nMed, nSmall);
}
float puddleCloudFBM(vec2 worldXY, float scaleLarge) { return puddleNoise(worldXY, scaleLarge).x; }

float computePuddleMask(in vec3 worldPos, in float matHeight, in float ao, in float puddleCell, in float scaleLarge, in float threshold, in float feather, in float heightInfluence, in vec4 groutParams, in vec4 worldParams) {
  float cellLow = modBloodAlbedoMix.x;
  float cellHigh = modBloodAlbedoMix.y;
  float cellEps = modBloodAlbedoMix.z;
  float cellSoft = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) return 0.0;
  vec2 worldXY = worldPos.xy;
  vec3 noise = puddleNoise(worldXY, scaleLarge);
  float nLarge = noise.x; float nMed = noise.y; float nSmall = noise.z;
  float lowTh = threshold - feather; float highTh = threshold + feather;
  float poolShape = smoothstep(lowTh, highTh, nLarge);
  poolShape *= mix(0.45, 1.0, nMed); poolShape *= mix(0.75, 1.0, nSmall);
  float hLow = groutParams.x; float hHigh = groutParams.y; float aoLow = groutParams.z; float aoHigh = groutParams.w;
  float heightGrout = 1.0 - smoothstep(hLow, hHigh, matHeight);
  float aoGrout = 1.0 - smoothstep(aoLow, aoHigh, ao);
  float groove = max(heightGrout, aoGrout * 0.6);
  float grooveMin = worldParams.w;
  float grooveBias = mix(1.0, mix(grooveMin, 1.0, groove), clamp(heightInfluence, 0.0, 1.0));
  float worldHigh = worldParams.x; float worldLow = worldParams.y; float boost = worldParams.z;
  float worldLowVal = smoothstep(worldHigh, worldLow, worldPos.z);
  float worldBias = mix(0.70, 1.0, worldLowVal);
  float mask = cellSoft * poolShape * grooveBias * worldBias;
  mask = clamp(mask * boost, 0.0, 1.0);
  mask = mask * mask * (3.0 - 2.0 * mask);
  mask *= (0.80 + 0.20 * nSmall);
  return mask;
}

float computePuddleMaskTweakable(in vec3 worldPos, in float matHeight, in float ao, in float puddleCell) {
  float cellLow = modBloodAlbedoMix.x; float cellHigh = modBloodAlbedoMix.y; float cellEps = modBloodAlbedoMix.z;
  float cellSoft = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) return 0.0;
  float scaleLarge = modPuddleParams.y; float threshold = modPuddleParams.z; float feather = modPuddleParams.w;
  float heightInfluence = modBloodParams.z; float grooveMin = modDustParams.y;
  vec4 groutParams = modMossParams; vec4 worldParams = modWaterParams;
  vec2 worldXY = worldPos.xy;
  vec3 noise = puddleNoise(worldXY, scaleLarge);
  float nLarge = noise.x; float nMed = noise.y; float nSmall = noise.z;
  float lowTh = threshold - feather; float highTh = threshold + feather;
  float poolShape = smoothstep(lowTh, highTh, nLarge);
  poolShape *= mix(0.45, 1.0, nMed); poolShape *= mix(0.75, 1.0, nSmall);
  float hLow = groutParams.x; float hHigh = groutParams.y; float aoLow = groutParams.z; float aoHigh = groutParams.w;
  float heightGrout = 1.0 - smoothstep(hLow, hHigh, matHeight);
  float aoGrout = 1.0 - smoothstep(aoLow, aoHigh, ao);
  float groove = max(heightGrout, aoGrout * 0.6);
  float grooveBias = mix(1.0, mix(grooveMin, 1.0, groove), clamp(heightInfluence, 0.0, 1.0));
  float worldHigh = worldParams.x; float worldLow = worldParams.y; float boost = worldParams.z;
  float worldLowVal = smoothstep(worldHigh, worldLow, worldPos.z);
  float worldBias = mix(0.70, 1.0, worldLowVal);
  float mask = cellSoft * poolShape * grooveBias * worldBias;
  mask = clamp(mask * boost, 0.0, 1.0);
  mask = mask * mask * (3.0 - 2.0 * mask);
  mask *= (0.80 + 0.20 * nSmall);
  return mask;
}

// =============================================================
// Moss decomposition - fully tunable via UBO (no hard-coded magic)
// =============================================================

// Default fallbacks for moss tunable params (used when UBO=0 = not configured yet)
float mossDefault(float uboVal, float fallback){ return mix(uboVal, fallback, step(uboVal, 0.0001)); }

// Helper: wall query
float isWallAt(ivec2 cell) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= int(u_mapSize.x) || cell.y >= int(u_mapSize.y)) return 1.0;
  float ct = texelFetch(u_mapTex, cell, 0).r * 255.0;
  return step(0.5, ct);
}

float mossBiomeMask(vec2 worldXY) {
  vec2 uv = worldXY / u_mapSize;
  return texture(u_modifierMap, uv).r;
}
float mossBiomeMaskWS(vec3 worldPos){ return mossBiomeMask(worldPos.xy); }

// Noise
float mossNoiseRaw(vec3 worldPos) {
  float scale = mossDefault(modMossAlbedoRough.z, 2.95);
  vec3 p = worldPos * scale * 0.85 + vec3(2.7, 5.4, 8.1);
  float n3D = fbm3D_3(p);
  float n3DDet = valueNoise3D(p * 2.2 + vec3(11.3, 23.7, 4.7));
  return n3D * 0.65 + n3DDet * 0.35;
}
float mossNoiseShape(vec3 worldPos) {
  float thresh = mossDefault(modMossAlbedoRough.w, 0.46);
  float feather = mossDefault(modMossMatRough.w, 0.16);
  float varCombined = mossNoiseRaw(worldPos);
  float low = thresh - feather;
  float high = thresh + feather;
  return smoothstep(low, high, varCombined);
}

// Env / near-wall
float mossEnvMask(vec3 worldPos, float isFloorSurface) {
  // v16: pre-baked smooth wall proximity in modifierMap.a (dust channel) + tunable feather
  // This eliminates hard cell lines (was 8-neighbour binary count via texelFetch)
  vec2 uv = worldPos.xy / u_mapSize;
  float wallProx = texture(u_modifierMap, uv).a; // 0..1 smooth due to LINEAR + 2x blur in CPU bake

  float floorBase = mossDefault(modWaterAlbedoRough.x, 0.20);
  float wallBase = mossDefault(modWaterAlbedoRough.y, 0.28);
  float wallEdgeBase = mossDefault(modWaterAlbedoRough.z, 0.55);
  float cornerBonus = mossDefault(modWaterAlbedoRough.w, 0.38); // now baked, but kept as legacy multiplier

  float env2Zero = step(length(modDustAlbedoRough), 0.0001);
  float bottomLowF = mix(modDustAlbedoRough.x, 0.08, env2Zero);
  float bottomHighF = mix(modDustAlbedoRough.y, 0.85, env2Zero);
  float ceilReduceF = mix(modDustAlbedoRough.z, 0.45, env2Zero);
  float seamBoostF = mix(modDustAlbedoRough.w, 0.35, env2Zero);

  // Extra feather tunable via modMossExtra1 (slot14): wallInner, wallOuter, floorInner, floorOuter
  float extra1Zero = step(length(modMossExtra1), 0.0001);
  float wallInner = mix(modMossExtra1.x, 0.0, extra1Zero);
  float wallOuter = mix(modMossExtra1.y, 1.0, extra1Zero);
  float floorInner = mix(modMossExtra1.z, 0.0, extra1Zero);
  float floorOuter = mix(modMossExtra1.w, 1.0, extra1Zero);

  // Feather the pre-baked proximity with smoothstep for user-tweakable softness
  float nearWallWall = smoothstep(wallInner, wallOuter, wallProx);
  float nearWallFloor = smoothstep(floorInner, floorOuter, wallProx);

  float isFloor = step(0.5, isFloorSurface);

  float floorMask = mix(floorBase, 1.0, nearWallFloor);
  floorMask = mix(floorMask, 1.0, smoothstep(0.5, 0.85, nearWallFloor) * seamBoostF);

  float z = worldPos.z;
  float bottomBias = 1.0 - smoothstep(bottomLowF, bottomHighF, z);
  float wallBaseMask = mix(wallBase, 1.0, bottomBias);
  float wallEdgeMask = mix(wallEdgeBase, 1.0, nearWallWall);
  float wallMask = wallBaseMask * wallEdgeMask;

  float ceilReduce = 1.0 - smoothstep(0.7, 1.15, worldPos.z) * ceilReduceF;
  floorMask *= mix(1.0, ceilReduce, step(0.7, worldPos.z));

  // Apply corner bonus (baked already, but add slight extra if desired via final boost)
  // wallProx already includes cornerRaw *0.35 + blur, so cornerBonus is now embedded

  return clamp(mix(wallMask, floorMask, isFloor), 0.0, 1.0);
}

// Material influence - fully tunable: per-channel weights + multiply vs max vs add
float mossMaterialMask(float matHeight, float ao, float rough) {
  float mat1Zero = step(length(modDamagedAlbedoRough), 0.0001);
  float hLow = mix(modDamagedAlbedoRough.x, 0.16, mat1Zero);
  float hHigh = mix(modDamagedAlbedoRough.y, 0.55, mat1Zero);
  float aoLow = mix(modDamagedAlbedoRough.z, 0.58, mat1Zero);
  float aoHigh = mix(modDamagedAlbedoRough.w, 0.90, mat1Zero);

  float mat2Zero = step(length(modMossMatRough), 0.0001);
  float rLow = mix(modMossMatRough.x, 0.52, mat2Zero);
  float rHigh = mix(modMossMatRough.y, 0.88, mat2Zero);
  float matBase = mix(modMossMatRough.z, 0.28, mat2Zero);

  float hMaskRaw = 1.0 - smoothstep(hLow, hHigh, matHeight); // low = grout fav
  float aoMaskRaw = 1.0 - smoothstep(aoLow, aoHigh, ao);
  float rMaskRaw = smoothstep(rLow, rHigh, rough);

  float extra2Zero = step(length(modMossExtra2), 0.0001);
  float hWeight = mix(modMossExtra2.x, 1.0, extra2Zero);
  float aoWeight = mix(modMossExtra2.y, 0.8, extra2Zero);
  float rWeight = mix(modMossExtra2.z, 0.6, extra2Zero);
  float combineMode = mix(modMossExtra2.w, 0.35, extra2Zero); // 0=max permissive, 0.5=weighted add avg, 1=multiply restrictive

  // Weighted masks
  float hMask = clamp(hMaskRaw * hWeight, 0.0, 1.0);
  float aoMask = clamp(aoMaskRaw * aoWeight, 0.0, 1.0);
  float rMask = clamp(rMaskRaw * rWeight, 0.0, 1.0);

  float maxMask = max(hMask, max(aoMask, rMask));

  float weightSum = max(0.001, hWeight + aoWeight + rWeight);
  float addMask = (hMaskRaw * hWeight + aoMaskRaw * aoWeight + rMaskRaw * rWeight) / weightSum;
  addMask = clamp(addMask, 0.0, 1.0);

  float mulMask = hMaskRaw * aoMaskRaw * rMaskRaw;
  // if weight 0, that channel should not block multiply - use 1 for disabled
  float hMul = mix(1.0, hMaskRaw, step(0.001, hWeight));
  float aoMul = mix(1.0, aoMaskRaw, step(0.001, aoWeight));
  float rMul = mix(1.0, rMaskRaw, step(0.001, rWeight));
  mulMask = hMul * aoMul * rMul;

  float combined;
  if (combineMode < 0.5) {
    combined = mix(maxMask, addMask, combineMode * 2.0);
  } else {
    combined = mix(addMask, mulMask, (combineMode - 0.5) * 2.0);
  }

  combined = mix(matBase, 1.0, combined);
  return clamp(combined, 0.0, 1.0);
}

float mossFinalMask(vec3 worldPos, float matHeight, float ao, float rough, float isFloorSurface) {
  // Raw factors - each 0..1, all tunable via JSON, no hidden magic
  float biome = mossBiomeMask(worldPos.xy); // room/dungeon filtering
  float hasBiome = step(0.001, biome);
  float noise = mossNoiseShape(worldPos); // organic shape
  float env = mossEnvMask(worldPos, isFloorSurface); // corners + floor/wall seams
  float mat = mossMaterialMask(matHeight, ao, rough); // AO/height/rough

  float finalZero = step(length(modMossFinal), 0.0001);
  float biomeBase = mix(modMossFinal.x, 0.42, finalZero);
  float envBase = mix(modMossFinal.y, 0.32, finalZero);
  float matBase = mix(modMossFinal.z, 0.38, finalZero);
  float finalBoost = mix(modMossFinal.w, 1.28, finalZero);

  float wZero = step(length(modMossFinalWeights), 0.0001);
  float noiseW = mix(modMossFinalWeights.x, 1.0, wZero);
  float envW = mix(modMossFinalWeights.y, 1.0, wZero);
  float matW = mix(modMossFinalWeights.z, 1.0, wZero);
  float biomeW = mix(modMossFinalWeights.w, 1.0, wZero);

  float cZero = step(length(modMossFinalCombine), 0.0001);
  float combineFinal = mix(modMossFinalCombine.x, 1.0, cZero); // 0=max (any),0.5=add avg,1=mul (all)

  // Base-mixed versions - for permissive modes, prevents full zeroing (envBase etc = min floor)
  // If you want env to fully block when far from wall, set envBase=0 in JSON
  float envMod = mix(envBase, 1.0, env);
  float matMod = mix(matBase, 1.0, mat);
  float biomeMod = mix(biomeBase, 1.0, biome);
  float noiseMod = noise; // noise no base, already feathered

  // Weighted max (permissive) - any factor high = moss
  float noiseWMax = noiseMod * max(noiseW, 0.001);
  float envWMax = envMod * max(envW, 0.001);
  float matWMax = matMod * max(matW, 0.001);
  float biomeWMax = biomeMod * max(biomeW, 0.001);
  float maxMaskMod = max(max(noiseWMax, envWMax), max(matWMax, biomeWMax));
  float maxMaskRaw = max(max(noise * noiseW, env * envW), max(mat * matW, biome * biomeW));

  // Weighted average (soft blend) - additive feel
  float wSum = max(0.001, noiseW + envW + matW + biomeW);
  float addMaskMod = (noiseMod * noiseW + envMod * envW + matMod * matW + biomeMod * biomeW) / wSum;
  float addMaskRaw = (noise * noiseW + env * envW + mat * matW + biome * biomeW) / wSum;

  // Multiply (restrictive) - needs ALL factors, env 0 truly blocks when envBase=0
  // Raw multiply uses raw factors so env multiplier works as you imagine: 0 = no moss, 1 = keep
  float noiseMulRaw = mix(1.0, noise, step(0.001, noiseW));
  float envMulRaw = mix(1.0, env, step(0.001, envW));
  float matMulRaw = mix(1.0, mat, step(0.001, matW));
  float biomeMulRaw = mix(1.0, biome, step(0.001, biomeW));
  float mulMaskRaw = noiseMulRaw * envMulRaw * matMulRaw * biomeMulRaw;

  // Modded multiply (with base) for transition
  float noiseMulMod = mix(1.0, noiseMod, step(0.001, noiseW));
  float envMulMod = mix(1.0, envMod, step(0.001, envW));
  float matMulMod = mix(1.0, matMod, step(0.001, matW));
  float biomeMulMod = mix(1.0, biomeMod, step(0.001, biomeW));
  float mulMaskMod = noiseMulMod * envMulMod * matMulMod * biomeMulMod;

  float finalM;
  if (combineFinal < 0.33) {
    float t = combineFinal / 0.33;
    finalM = mix(maxMaskMod, addMaskMod, t);
  } else if (combineFinal < 0.66) {
    float t = (combineFinal - 0.33) / 0.33;
    finalM = mix(addMaskMod, addMaskRaw, t);
  } else {
    float t = (combineFinal - 0.66) / 0.34;
    finalM = mix(addMaskRaw, mulMaskRaw, t);
  }

  finalM *= hasBiome;

  // --- Global multiplier / contrast / brightness / power / min-max remap (tunable via JSON) ---
  float gZero = step(length(modMossGlobal), 0.0001);
  float g2Zero = step(length(modMossGlobal2), 0.0001);
  float contrast = mix(modMossGlobal.x, 1.0, gZero);
  float brightness = mix(modMossGlobal.y, 0.0, gZero);
  float minThresh = mix(modMossGlobal.z, 0.0, gZero);
  float maxThresh = mix(modMossGlobal.w, 1.0, gZero);
  float power = mix(modMossGlobal2.x, 1.0, g2Zero);

  finalM = clamp(finalM * finalBoost + brightness, 0.0, 1.0);
  finalM = clamp((finalM - 0.5) * contrast + 0.5, 0.0, 1.0);
  finalM = pow(clamp(finalM, 0.001, 1.0), power);
  float range = max(0.001, maxThresh - minThresh);
  finalM = clamp((finalM - minThresh) / range, 0.0, 1.0);
  finalM = finalM * finalM * (3.0 - 2.0 * finalM); // final smooth
  return finalM;
}

// Debug colored helpers
vec3 debugMossNoiseCol(vec3 worldPos) {
  float m = mossNoiseShape(worldPos);
  float raw = mossNoiseRaw(worldPos);
  return vec3(0.18, 0.68, 0.18) * m * (0.85 + 0.35*raw);
}
vec3 debugMossEnvCol(vec3 worldPos, float isFloor) {
  float e = mossEnvMask(worldPos, isFloor);
  return vec3(0.22 + 0.38*e, 0.72*e + 0.18*e, 0.12) * (0.6 + 0.9*e);
}
vec3 debugMossMaterialCol(float matHeight, float ao, float rough) {
  float m = mossMaterialMask(matHeight, ao, rough);
  float hMask = 1.0 - smoothstep(0.16, 0.55, matHeight);
  float aoMask = 1.0 - smoothstep(0.58, 0.90, ao);
  float rMask = smoothstep(0.52, 0.88, rough);
  vec3 col = vec3(aoMask*0.7 + rMask*0.2, (hMask*0.5 + rMask*0.5)*0.8 + 0.15, hMask*0.6) * m;
  col = mix(col, vec3(0.18,0.68,0.18)*m, 0.45);
  return col * 1.3;
}
vec3 debugMossCombinedCol(vec3 worldPos, float matHeight, float ao, float rough, float isFloor) {
  float f = mossFinalMask(worldPos, matHeight, ao, rough, isFloor);
  return vec3(0.18, 0.68, 0.18) * f * 1.6;
}

// Main applyModifiers - moss uses decomposed pipeline, puddle unchanged
// FIX: matHeight was previously read-only so moss could never affect height despite spec
void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 worldPos, inout float matHeight, in float isFloorSurface) {
  float modsEnabled = float(u_modifiersEnabled);
  ivec2 cellI = ivec2(floor(worldPos.xy));
  float inBounds = step(0.0, float(cellI.x)) * step(0.0, float(cellI.y)) * step(float(cellI.x), u_mapSize.x - 1.0) * step(float(cellI.y), u_mapSize.y - 1.0);

  vec2 modUV = worldPos.xy / u_mapSize;
  vec4 mod1 = texture(u_modifierMap, modUV);
  vec4 mod2 = texture(u_modifierMap2, modUV);

  float mossCell = mod1.r * modsEnabled * inBounds;
  float puddleCell = mod1.b * modsEnabled * inBounds;

  float floorFactor = step(0.5, isFloorSurface);
  puddleCell *= mix(0.02, 1.0, floorFactor);

  vec3 puddleAlbedo = modPuddleAlbedoRough.xyz;
  float puddleRoughTarget = modPuddleAlbedoRough.w;
  float colorStrength = modPuddleParams.x;
  float scaleLarge = modPuddleParams.y;
  float threshold = modPuddleParams.z;
  float feather = modPuddleParams.w;
  float rippleScale = modBloodParams.x;
  float edgeFoam = modBloodParams.y;
  float heightInfluence = modBloodParams.z;
  float aoMix = modBloodParams.w;
  float darkBase = modWaterParams.w;
  float tintMix = modDustParams.x;
  float floorDepress = modMossAlbedoRough.x;
  float grooveMin = modDustParams.y;
  float edgeLow = modDustParams.z;
  float edgeHigh = modDustParams.w;
  float roughLow = modDamagedParams.x;
  float roughHigh = modDamagedParams.y;
  float flatStrength = modDamagedParams.z;
  float metalMix = modDamagedParams.w;

  colorStrength = mix(colorStrength, 0.92, step(colorStrength, 0.001));
  scaleLarge = mix(scaleLarge, 0.22, step(scaleLarge, 0.001));
  threshold = mix(threshold, 0.55, step(threshold, 0.001));
  feather = mix(feather, 0.12, step(feather, 0.001));

  // Moss - decomposed
  float isFloor = step(0.5, isFloorSurface);
  float mossMask = mossFinalMask(worldPos, matHeight, ao, rough, isFloorSurface);
  // BUG FIX: was step(cell)*step(mask) -> double gating, mask already includes biome via texture
  // Low biome 0.1 * low final 0.2 = invisible, so gate only by cell which has modsEnabled
  float mossHas = step(0.001, mossCell);
  float mossNoiseVal = mossNoiseRaw(worldPos);

  // NEW: live-tweakable colour + strengths from UBO (20,21) - fallback to original hardcoded
  float mossAlbedoZero = step(length(modMossAlbedo), 0.0001);
  vec3 mossAlbedoBase = mix(modMossAlbedo.xyz, vec3(0.18, 0.42, 0.15), mossAlbedoZero);
  float mossColorStrength = mix(modMossAlbedo.w, 0.75, mossAlbedoZero);

  float mossStrZero = step(length(modMossStrengths), 0.0001);
  float mossRoughAdd = mix(modMossStrengths.x, 0.34, mossStrZero);
  float mossHeightAdd = mix(modMossStrengths.y, 0.12, mossStrZero);
  float mossNormalStr = mix(modMossStrengths.z, 0.36, mossStrZero);
  float mossAoStr = mix(modMossStrengths.w, 0.16, mossStrZero);

  vec3 mossAlbedo = mossAlbedoBase * (0.85 + 0.28 * mossNoiseVal);
  float mossStrength = mossMask * mossHas;
  albedo = mix(albedo, mossAlbedo, mossStrength * mossColorStrength);
  rough = clamp(rough + mossRoughAdd * mossStrength, 0.0, 1.0);
  metal = mix(metal, 0.0, mossStrength * 0.80);
  ao *= (1.0 - mossStrength * mossAoStr);
  vec3 mossUp = vec3(0.0, 0.0, 1.0);
  float wallBias = mix(0.85, 0.55, isFloor);
  N = normalize(mix(N, mossUp, mossStrength * mossNormalStr * wallBias));
  matHeight += mossStrength * mossHeightAdd;

  // Puddle
  float floorHas = step(0.5, isFloorSurface) * step(worldPos.z, 0.6);
  float puddleHas = step(0.001, puddleCell) * floorHas;
  float puddleCellForMask = puddleCell * puddleHas;
  float puddleMask = computePuddleMaskTweakable(worldPos, matHeight, ao, puddleCellForMask);
  float puddleHas2 = step(0.001, puddleMask);
  puddleMask *= puddleHas2;

  vec3 darkBaseCol = albedo * darkBase;
  vec3 puddleTint = mix(darkBaseCol, puddleAlbedo, tintMix);
  albedo = mix(albedo, puddleTint, puddleMask * colorStrength * puddleHas2);

  float edge = puddleMask * (1.0 - puddleMask);
  edge = smoothstep(edgeLow, edgeHigh, edge) * edgeFoam * puddleHas2;
  albedo = mix(albedo, albedo + vec3(0.18, 0.175, 0.16) * edge, puddleHas2);

  float roughFeather = smoothstep(roughLow, roughHigh, puddleMask);
  rough = mix(rough, puddleRoughTarget, roughFeather * 0.97 * puddleHas2);

  vec3 flatWater = vec3(0.0, 0.0, 1.0);
  vec2 ripUV = worldPos.xy * rippleScale;
  float r1 = valueNoise2D(ripUV);
  float r2 = valueNoise2D(ripUV + vec2(13.5, 7.1));
  vec3 rippleN = normalize(vec3((r1 - 0.5) * 0.25, (r2 - 0.5) * 0.25, 1.0));
  vec3 baseFlat = mix(N, flatWater, puddleMask * flatStrength * puddleHas2);
  float rippleMix = puddleMask * 0.28 * (0.5 + 0.5 * fbm2D_2(worldPos.xy * 0.52)) * puddleHas2;
  N = normalize(mix(baseFlat, rippleN, rippleMix));

  metal = mix(metal, 0.0, puddleMask * metalMix * puddleHas2);
  ao *= (1.0 - puddleMask * aoMix * puddleHas2);
  float depressMask = puddleMask * floorDepress * puddleHas2;
  ao = mix(ao, ao * (1.0 + depressMask * 0.6), puddleHas2);
  albedo = mix(albedo, albedo * (1.0 + depressMask * 0.15), puddleHas2);
}

void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 worldPos) {
  float tmpH = 0.5;
  float tmpFloor = 1.0;
  applyModifiers(albedo, N, rough, metal, ao, worldPos, tmpH, tmpFloor);
}

`;
