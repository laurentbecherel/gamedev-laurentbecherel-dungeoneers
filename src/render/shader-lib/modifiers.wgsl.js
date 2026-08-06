// WGSL material modifiers – 48 vec4 UBO with dedicated damage, blood and dust blocks.
// Preserves all public function names. Uses linearSampler for smooth modifier maps (matches old texture() LINEAR).

export const wgslModifiers = `
// UBO v28 - 48 vec4 = 768 bytes
struct ModifiersBlock {
  modMossAlbedoRough: vec4<f32>,
  modMossParams: vec4<f32>,
  modWaterAlbedoRough: vec4<f32>,
  modWaterParams: vec4<f32>,
  modPuddleAlbedoRough: vec4<f32>,
  modPuddleParams: vec4<f32>,
  modBloodAlbedoMix: vec4<f32>,
  modBloodParams: vec4<f32>,
  modDustAlbedoRough: vec4<f32>,
  modDustParams: vec4<f32>,
  modDamagedAlbedoRough: vec4<f32>,
  modDamagedParams: vec4<f32>,
  modMossMatRough: vec4<f32>,
  modMossFinal: vec4<f32>,
  modMossExtra1: vec4<f32>,
  modMossExtra2: vec4<f32>,
  modMossFinalWeights: vec4<f32>,
  modMossFinalCombine: vec4<f32>,
  modMossGlobal: vec4<f32>,
  modMossGlobal2: vec4<f32>,
  modMossAlbedo: vec4<f32>,
  modMossStrengths: vec4<f32>,
  modDamagedNoise: vec4<f32>,
  modDamagedScales: vec4<f32>,
  modDamagedWeights: vec4<f32>,
  modDamagedCrack: vec4<f32>,
  modDamagedMaterial: vec4<f32>,
  modDamagedMaterial2: vec4<f32>,
  modDamagedFinal: vec4<f32>,
  modDamagedFinalWeights: vec4<f32>,
  modDamagedSurface: vec4<f32>,
  modDamagedSurface2: vec4<f32>,
  modDamagedGlobal: vec4<f32>,
  modDamagedGlobal2: vec4<f32>,
  modBloodAlbedo: vec4<f32>,
  modBloodDarkRough: vec4<f32>,
  modBloodNoise: vec4<f32>,
  modBloodShape: vec4<f32>,
  modBloodSurface: vec4<f32>,
  modBloodPlacement: vec4<f32>,
  modBloodFinal: vec4<f32>,
  modDustAlbedo: vec4<f32>,
  modDustNoise: vec4<f32>,
  modDustMaterial: vec4<f32>,
  modDustSurface: vec4<f32>,
  modDustPlacement: vec4<f32>,
  modDustFinal: vec4<f32>,
  modDamagedAppearance: vec4<f32>,
};

fn hash21_puddle(p: vec2<f32>) -> f32 {
  let seedOff: f32 = modifiersBlock.modMossAlbedoRough.y;
  return fract(sin(dot(p + vec2<f32>(seedOff * 0.13, seedOff * 0.17), vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn hash21_proc(p: vec2<f32>) -> f32 { return hash21_puddle(p); }
fn hash21(p: vec2<f32>) -> f32 { return hash21_puddle(p); }

fn valueNoise2D(p: vec2<f32>) -> f32 {
  let i: vec2<f32> = floor(p);
  var f: vec2<f32> = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a: f32 = hash21_puddle(i);
  let b: f32 = hash21_puddle(i + vec2<f32>(1.0, 0.0));
  let c: f32 = hash21_puddle(i + vec2<f32>(0.0, 1.0));
  let d: f32 = hash21_puddle(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn hash31(p: vec3<f32>) -> f32 {
  let seedOff: f32 = modifiersBlock.modMossAlbedoRough.y;
  return fract(sin(dot(p + vec3<f32>(seedOff * 0.13, seedOff * 0.17, seedOff * 0.19), vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453);
}

fn valueNoise3D(p: vec3<f32>) -> f32 {
  let i: vec3<f32> = floor(p);
  var f: vec3<f32> = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let n000: f32 = hash31(i);
  let n100: f32 = hash31(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010: f32 = hash31(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110: f32 = hash31(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001: f32 = hash31(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101: f32 = hash31(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011: f32 = hash31(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111: f32 = hash31(i + vec3<f32>(1.0, 1.0, 1.0));
  let nx00: f32 = mix(n000, n100, f.x);
  let nx10: f32 = mix(n010, n110, f.x);
  let nx01: f32 = mix(n001, n101, f.x);
  let nx11: f32 = mix(n011, n111, f.x);
  let nxy0: f32 = mix(nx00, nx10, f.y);
  let nxy1: f32 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

fn fbm3D_2(p: vec3<f32>) -> f32 { return valueNoise3D(p) * 0.5 + valueNoise3D(p * 2.0) * 0.25; }
fn fbm3D_3(p: vec3<f32>) -> f32 { return valueNoise3D(p) * 0.5 + valueNoise3D(p * 2.0) * 0.25 + valueNoise3D(p * 4.0) * 0.125; }
fn fbm2D_2(p: vec2<f32>) -> f32 { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25; }
fn fbm2D_3(p: vec2<f32>) -> f32 { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125; }
fn fbm2D_4(p: vec2<f32>) -> f32 { return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125 + valueNoise2D(p * 8.0) * 0.0625; }
fn fbm2D(p: vec2<f32>, o: i32) -> f32 { if (o <= 2) { return fbm2D_2(p); } return fbm2D_3(p); }
fn fbm(p: vec2<f32>) -> f32 { return fbm2D_3(p); }

fn puddleNoise(worldXY: vec2<f32>, scaleLarge: f32) -> vec3<f32> {
  let w: vec2<f32> = vec2<f32>(fbm2D_2(worldXY * 0.12), fbm2D_2(worldXY * 0.12 + vec2<f32>(7.3, 3.1))) * 0.9;
  let p: vec2<f32> = worldXY * scaleLarge + w;
  let nLarge: f32 = fbm2D_3(p);
  let nMed: f32 = valueNoise2D(p * 2.1 + vec2<f32>(11.3, 23.7));
  let nSmall: f32 = valueNoise2D(worldXY * 0.52 + vec2<f32>(5.1, 2.9));
  let cloud: f32 = nLarge * 0.60 + nMed * 0.28 + nSmall * 0.12;
  return vec3<f32>(cloud, nMed, nSmall);
}
fn puddleCloudFBM(worldXY: vec2<f32>, scaleLarge: f32) -> f32 { return puddleNoise(worldXY, scaleLarge).x; }

fn computePuddleMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, puddleCell: f32, scaleLarge: f32, threshold: f32, feather: f32, heightInfluence: f32, groutParams: vec4<f32>, worldParams: vec4<f32>) -> f32 {
  let cellLow: f32 = modifiersBlock.modBloodAlbedoMix.x;
  let cellHigh: f32 = modifiersBlock.modBloodAlbedoMix.y;
  let cellEps: f32 = modifiersBlock.modBloodAlbedoMix.z;
  let cellSoft: f32 = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) { return 0.0; }
  let worldXY: vec2<f32> = worldPos.xy;
  var noise: vec3<f32> = puddleNoise(worldXY, scaleLarge);
  let nLarge: f32 = noise.x; let nMed: f32 = noise.y; let nSmall: f32 = noise.z;
  let lowTh: f32 = threshold - feather; let highTh: f32 = threshold + feather;
  var poolShape: f32 = smoothstep(lowTh, highTh, nLarge);
  poolShape = poolShape * mix(0.45, 1.0, nMed) * mix(0.75, 1.0, nSmall);
  let hLow: f32 = groutParams.x; let hHigh: f32 = groutParams.y; let aoLow: f32 = groutParams.z; let aoHigh: f32 = groutParams.w;
  let heightGrout: f32 = 1.0 - smoothstep(hLow, hHigh, matHeight);
  let aoGrout: f32 = 1.0 - smoothstep(aoLow, aoHigh, ao);
  let groove: f32 = max(heightGrout, aoGrout * 0.6);
  let grooveMin: f32 = worldParams.w;
  let grooveBias: f32 = mix(1.0, mix(grooveMin, 1.0, groove), clamp(heightInfluence, 0.0, 1.0));
  let worldHigh: f32 = worldParams.x; let worldLow: f32 = worldParams.y; let boost: f32 = worldParams.z;
  let worldLowVal: f32 = smoothstep(worldHigh, worldLow, worldPos.z);
  let worldBias: f32 = mix(0.70, 1.0, worldLowVal);
  var mask: f32 = cellSoft * poolShape * grooveBias * worldBias;
  mask = clamp(mask * boost, 0.0, 1.0);
  mask = mask * mask * (3.0 - 2.0 * mask);
  mask = mask * (0.80 + 0.20 * nSmall);
  return mask;
}

fn computePuddleMaskTweakable(worldPos: vec3<f32>, matHeight: f32, ao: f32, puddleCell: f32) -> f32 {
  let cellLow: f32 = modifiersBlock.modBloodAlbedoMix.x;
  let cellHigh: f32 = modifiersBlock.modBloodAlbedoMix.y;
  let cellEps: f32 = modifiersBlock.modBloodAlbedoMix.z;
  let cellSoft: f32 = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) { return 0.0; }
  let scaleLarge: f32 = modifiersBlock.modPuddleParams.y;
  let threshold: f32 = modifiersBlock.modPuddleParams.z;
  let feather: f32 = modifiersBlock.modPuddleParams.w;
  let groutParams: vec4<f32> = modifiersBlock.modMossParams;
  let worldParams: vec4<f32> = modifiersBlock.modWaterParams;
  return computePuddleMask(worldPos, matHeight, ao, puddleCell, scaleLarge, threshold, feather, modifiersBlock.modBloodParams.z, groutParams, worldParams);
}

// ----- Moss -----
fn mossDefault(uboVal: f32, fallback: f32) -> f32 {
  return mix(uboVal, fallback, step(uboVal, 0.0001));
}

fn isWallAt(cell: vec2<i32>) -> f32 {
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) { return 1.0; }
  let ct: f32 = textureLoad(mapTex, cell, 0).r * 255.0;
  return step(0.5, ct);
}

fn mossBiomeMask(worldXY: vec2<f32>) -> f32 {
  let uv: vec2<f32> = worldXY / frame.mapSize;
  // Use SampleLevel to avoid derivative uniform-flow issues but keep bilinear like old texture() LINEAR
  return textureSampleLevel(modifierMap, linearSampler, uv, 0.0).r;
}
fn mossBiomeMaskWS(worldPos: vec3<f32>) -> f32 { return mossBiomeMask(worldPos.xy); }

fn mossNoiseRaw(worldPos: vec3<f32>) -> f32 {
  let scale: f32 = mossDefault(modifiersBlock.modMossAlbedoRough.z, 2.95);
  let p: vec3<f32> = worldPos * scale * 0.85 + vec3<f32>(2.7, 5.4, 8.1);
  let n3D: f32 = fbm3D_3(p);
  let n3DDet: f32 = valueNoise3D(p * 2.2 + vec3<f32>(11.3, 23.7, 4.7));
  return n3D * 0.65 + n3DDet * 0.35;
}

fn mossNoiseShape(worldPos: vec3<f32>) -> f32 {
  let thresh: f32 = mossDefault(modifiersBlock.modMossAlbedoRough.w, 0.46);
  let feather: f32 = mossDefault(modifiersBlock.modMossMatRough.w, 0.16);
  let varCombined: f32 = mossNoiseRaw(worldPos);
  let low: f32 = thresh - feather;
  let high: f32 = thresh + feather;
  return smoothstep(low, high, varCombined);
}

fn loadModifierMap(uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(modifierMap, linearSampler, uv, 0.0);
}
fn loadModifierMap2(uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(modifierMap2, linearSampler, uv, 0.0);
}

fn mossEnvMask(worldPos: vec3<f32>, isFloorSurface: f32) -> f32 {
  let uv: vec2<f32> = worldPos.xy / frame.mapSize;
  let wallProx: f32 = loadModifierMap(uv).a;

  var floorBase: f32 = mossDefault(modifiersBlock.modWaterAlbedoRough.x, 0.20);
  var wallBase: f32 = mossDefault(modifiersBlock.modWaterAlbedoRough.y, 0.28);
  var wallEdgeBase: f32 = mossDefault(modifiersBlock.modWaterAlbedoRough.z, 0.55);

  var bottomLowF: f32 = modifiersBlock.modDustAlbedoRough.x;
  var bottomHighF: f32 = modifiersBlock.modDustAlbedoRough.y;
  var ceilReduceF: f32 = modifiersBlock.modDustAlbedoRough.z;
  var seamBoostF: f32 = modifiersBlock.modDustAlbedoRough.w;
  let env2Zero: f32 = step(length(modifiersBlock.modDustAlbedoRough), 0.0001);
  bottomLowF = mix(bottomLowF, 0.08, env2Zero);
  bottomHighF = mix(bottomHighF, 0.85, env2Zero);
  ceilReduceF = mix(ceilReduceF, 0.45, env2Zero);
  seamBoostF = mix(seamBoostF, 0.35, env2Zero);

  var wallInner: f32 = modifiersBlock.modMossExtra1.x;
  var wallOuter: f32 = modifiersBlock.modMossExtra1.y;
  var floorInner: f32 = modifiersBlock.modMossExtra1.z;
  var floorOuter: f32 = modifiersBlock.modMossExtra1.w;
  let extra1Zero: f32 = step(length(modifiersBlock.modMossExtra1), 0.0001);
  wallInner = mix(wallInner, 0.0, extra1Zero);
  wallOuter = mix(wallOuter, 1.0, extra1Zero);
  floorInner = mix(floorInner, 0.0, extra1Zero);
  floorOuter = mix(floorOuter, 1.0, extra1Zero);

  let nearWallWall: f32 = smoothstep(wallInner, wallOuter, wallProx);
  let nearWallFloor: f32 = smoothstep(floorInner, floorOuter, wallProx);
  let isFloor: f32 = step(0.5, isFloorSurface);
  var floorMask: f32 = mix(floorBase, 1.0, nearWallFloor);
  floorMask = mix(floorMask, 1.0, smoothstep(0.5, 0.85, nearWallFloor) * seamBoostF);
  let z: f32 = worldPos.z;
  let bottomBias: f32 = 1.0 - smoothstep(bottomLowF, bottomHighF, z);
  let wallBaseMask: f32 = mix(wallBase, 1.0, bottomBias);
  let wallEdgeMask: f32 = mix(wallEdgeBase, 1.0, nearWallWall);
  let wallMask: f32 = wallBaseMask * wallEdgeMask;
  let wallUpperStart: f32 = frame.wallWorldHeight * 0.60869565;
  let ceilReduce: f32 = 1.0 - smoothstep(wallUpperStart, frame.wallWorldHeight, worldPos.z) * ceilReduceF;
  floorMask = floorMask * mix(1.0, ceilReduce, step(wallUpperStart, worldPos.z));
  return clamp(mix(wallMask, floorMask, isFloor), 0.0, 1.0);
}

fn mossMaterialMask(matHeight: f32, ao: f32, rough: f32) -> f32 {
  let mat1Zero: f32 = step(length(modifiersBlock.modDamagedAlbedoRough), 0.0001);
  var hLow: f32 = mix(modifiersBlock.modDamagedAlbedoRough.x, 0.16, mat1Zero);
  var hHigh: f32 = mix(modifiersBlock.modDamagedAlbedoRough.y, 0.55, mat1Zero);
  var aoLow: f32 = mix(modifiersBlock.modDamagedAlbedoRough.z, 0.58, mat1Zero);
  var aoHigh: f32 = mix(modifiersBlock.modDamagedAlbedoRough.w, 0.90, mat1Zero);
  let mat2Zero: f32 = step(length(modifiersBlock.modMossMatRough), 0.0001);
  var rLow: f32 = mix(modifiersBlock.modMossMatRough.x, 0.52, mat2Zero);
  var rHigh: f32 = mix(modifiersBlock.modMossMatRough.y, 0.88, mat2Zero);
  var matBase: f32 = mix(modifiersBlock.modMossMatRough.z, 0.28, mat2Zero);
  let hMaskRaw: f32 = 1.0 - smoothstep(hLow, hHigh, matHeight);
  let aoMaskRaw: f32 = 1.0 - smoothstep(aoLow, aoHigh, ao);
  let rMaskRaw: f32 = smoothstep(rLow, rHigh, rough);
  let extra2Zero: f32 = step(length(modifiersBlock.modMossExtra2), 0.0001);
  var hWeight: f32 = mix(modifiersBlock.modMossExtra2.x, 1.0, extra2Zero);
  var aoWeight: f32 = mix(modifiersBlock.modMossExtra2.y, 0.8, extra2Zero);
  var rWeight: f32 = mix(modifiersBlock.modMossExtra2.z, 0.6, extra2Zero);
  var combineMode: f32 = mix(modifiersBlock.modMossExtra2.w, 0.35, extra2Zero);
  let hMask: f32 = clamp(hMaskRaw * hWeight, 0.0, 1.0);
  let aoMask: f32 = clamp(aoMaskRaw * aoWeight, 0.0, 1.0);
  let rMask: f32 = clamp(rMaskRaw * rWeight, 0.0, 1.0);
  let maxMask: f32 = max(hMask, max(aoMask, rMask));
  let weightSum: f32 = max(0.001, hWeight + aoWeight + rWeight);
  var addMask: f32 = (hMaskRaw * hWeight + aoMaskRaw * aoWeight + rMaskRaw * rWeight) / weightSum;
  addMask = clamp(addMask, 0.0, 1.0);
  var hMul: f32 = mix(1.0, hMaskRaw, step(0.001, hWeight));
  var aoMul: f32 = mix(1.0, aoMaskRaw, step(0.001, aoWeight));
  var rMul: f32 = mix(1.0, rMaskRaw, step(0.001, rWeight));
  var mulMask: f32 = hMul * aoMul * rMul;
  var combined: f32;
  if (combineMode < 0.5) {
    combined = mix(maxMask, addMask, combineMode * 2.0);
  } else {
    combined = mix(addMask, mulMask, (combineMode - 0.5) * 2.0);
  }
  combined = mix(matBase, 1.0, combined);
  return clamp(combined, 0.0, 1.0);
}

fn mossFinalMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloorSurface: f32) -> f32 {
  let biome: f32 = mossBiomeMask(worldPos.xy);
  let hasBiome: f32 = step(0.001, biome);
  let noise: f32 = mossNoiseShape(worldPos);
  let env: f32 = mossEnvMask(worldPos, isFloorSurface);
  let mat: f32 = mossMaterialMask(matHeight, ao, rough);

  let finalZero: f32 = step(length(modifiersBlock.modMossFinal), 0.0001);
  var biomeBase: f32 = mix(modifiersBlock.modMossFinal.x, 0.42, finalZero);
  var envBase: f32 = mix(modifiersBlock.modMossFinal.y, 0.32, finalZero);
  var matBase: f32 = mix(modifiersBlock.modMossFinal.z, 0.38, finalZero);
  var finalBoost: f32 = mix(modifiersBlock.modMossFinal.w, 1.28, finalZero);

  let wZero: f32 = step(length(modifiersBlock.modMossFinalWeights), 0.0001);
  var noiseW: f32 = mix(modifiersBlock.modMossFinalWeights.x, 1.0, wZero);
  var envW: f32 = mix(modifiersBlock.modMossFinalWeights.y, 1.0, wZero);
  var matW: f32 = mix(modifiersBlock.modMossFinalWeights.z, 1.0, wZero);
  var biomeW: f32 = mix(modifiersBlock.modMossFinalWeights.w, 1.0, wZero);

  let cZero: f32 = step(length(modifiersBlock.modMossFinalCombine), 0.0001);
  var combineFinal: f32 = mix(modifiersBlock.modMossFinalCombine.x, 1.0, cZero);

  let envMod: f32 = mix(envBase, 1.0, env);
  let matMod: f32 = mix(matBase, 1.0, mat);
  let biomeMod: f32 = mix(biomeBase, 1.0, biome);
  let noiseMod: f32 = noise;

  var noiseWMax: f32 = noiseMod * max(noiseW, 0.001);
  var envWMax: f32 = envMod * max(envW, 0.001);
  var matWMax: f32 = matMod * max(matW, 0.001);
  var biomeWMax: f32 = biomeMod * max(biomeW, 0.001);
  var maxMaskMod: f32 = max(max(noiseWMax, envWMax), max(matWMax, biomeWMax));
  var maxMaskRaw: f32 = max(max(noise * noiseW, env * envW), max(mat * matW, biome * biomeW));

  let wSum: f32 = max(0.001, noiseW + envW + matW + biomeW);
  var addMaskMod: f32 = (noiseMod * noiseW + envMod * envW + matMod * matW + biomeMod * biomeW) / wSum;
  var addMaskRaw: f32 = (noise * noiseW + env * envW + mat * matW + biome * biomeW) / wSum;

  var noiseMulRaw: f32 = mix(1.0, noise, step(0.001, noiseW));
  var envMulRaw: f32 = mix(1.0, env, step(0.001, envW));
  var matMulRaw: f32 = mix(1.0, mat, step(0.001, matW));
  var biomeMulRaw: f32 = mix(1.0, biome, step(0.001, biomeW));
  var mulMaskRaw: f32 = noiseMulRaw * envMulRaw * matMulRaw * biomeMulRaw;

  var noiseMulMod: f32 = mix(1.0, noiseMod, step(0.001, noiseW));
  var envMulMod: f32 = mix(1.0, envMod, step(0.001, envW));
  var matMulMod: f32 = mix(1.0, matMod, step(0.001, matW));
  var biomeMulMod: f32 = mix(1.0, biomeMod, step(0.001, biomeW));
  var mulMaskMod: f32 = noiseMulMod * envMulMod * matMulMod * biomeMulMod;

  var finalM: f32;
  if (combineFinal < 0.33) {
    let t: f32 = combineFinal / 0.33;
    finalM = mix(maxMaskMod, addMaskMod, t);
  } else if (combineFinal < 0.66) {
    let t: f32 = (combineFinal - 0.33) / 0.33;
    finalM = mix(addMaskMod, addMaskRaw, t);
  } else {
    let t: f32 = (combineFinal - 0.66) / 0.34;
    finalM = mix(addMaskRaw, mulMaskRaw, t);
  }

  finalM = finalM * hasBiome;

  let gZero: f32 = step(length(modifiersBlock.modMossGlobal), 0.0001);
  let g2Zero: f32 = step(length(modifiersBlock.modMossGlobal2), 0.0001);
  let contrast: f32 = mix(modifiersBlock.modMossGlobal.x, 1.0, gZero);
  let brightness: f32 = mix(modifiersBlock.modMossGlobal.y, 0.0, gZero);
  let minThresh: f32 = mix(modifiersBlock.modMossGlobal.z, 0.0, gZero);
  let maxThresh: f32 = mix(modifiersBlock.modMossGlobal.w, 1.0, gZero);
  let power: f32 = mix(modifiersBlock.modMossGlobal2.x, 1.0, g2Zero);

  finalM = clamp(finalM * finalBoost + brightness, 0.0, 1.0);
  finalM = clamp((finalM - 0.5) * contrast + 0.5, 0.0, 1.0);
  finalM = pow(clamp(finalM, 0.001, 1.0), power);
  let range: f32 = max(0.001, maxThresh - minThresh);
  finalM = clamp((finalM - minThresh) / range, 0.0, 1.0);
  finalM = finalM * finalM * (3.0 - 2.0 * finalM);
  return finalM;
}

// Debug helpers
fn debugMossNoiseCol(worldPos: vec3<f32>) -> vec3<f32> {
  let m: f32 = mossNoiseShape(worldPos);
  let raw: f32 = mossNoiseRaw(worldPos);
  return vec3<f32>(0.18, 0.68, 0.18) * m * (0.85 + 0.35 * raw);
}
fn debugMossEnvCol(worldPos: vec3<f32>, isFloor: f32) -> vec3<f32> {
  let e: f32 = mossEnvMask(worldPos, isFloor);
  return vec3<f32>(0.22 + 0.38 * e, 0.72 * e + 0.18 * e, 0.12) * (0.6 + 0.9 * e);
}
fn debugMossMaterialCol(matHeight: f32, ao: f32, rough: f32) -> vec3<f32> {
  let m: f32 = mossMaterialMask(matHeight, ao, rough);
  let hMask: f32 = 1.0 - smoothstep(0.16, 0.55, matHeight);
  let aoMask: f32 = 1.0 - smoothstep(0.58, 0.90, ao);
  let rMask: f32 = smoothstep(0.52, 0.88, rough);
  var col: vec3<f32> = vec3<f32>(aoMask * 0.7 + rMask * 0.2, (hMask * 0.5 + rMask * 0.5) * 0.8 + 0.15, hMask * 0.6) * m;
  col = mix(col, vec3<f32>(0.18, 0.68, 0.18) * m, 0.45);
  return col * 1.3;
}
fn debugMossCombinedCol(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloor: f32) -> vec3<f32> {
  let f: f32 = mossFinalMask(worldPos, matHeight, ao, rough, isFloor);
  return vec3<f32>(0.18, 0.68, 0.18) * f * 1.6;
}

// Damaged – isotropic world-space chips, cracks and impact scarring.  Every
// procedural signal is genuinely 3D so the same feature scale survives on
// floors, ceilings and both wall axes without planar stretching.
fn damagedBiomeMask(w: vec2<f32>) -> f32 {
  let uv: vec2<f32> = w / frame.mapSize;
  return textureSampleLevel(modifierMap2, linearSampler, uv, 0.0).r;
}

fn damagedNoiseRaw(w: vec3<f32>) -> f32 {
  let base: f32 = max(modifiersBlock.modDamagedNoise.x, 0.01);
  let warpS: f32 = modifiersBlock.modDamagedNoise.w;
  let wp: vec3<f32> = w * base + vec3<f32>(13.7, 5.1, 9.3);
  let warpP: vec3<f32> = wp * 0.35;
  let warp: vec3<f32> = vec3<f32>(
    valueNoise3D(warpP + vec3<f32>(1.1, 2.2, 6.7)),
    valueNoise3D(warpP + vec3<f32>(7.7, 3.1, 1.9)),
    valueNoise3D(warpP + vec3<f32>(4.3, 9.6, 3.2))
  ) - vec3<f32>(0.5);
  let p: vec3<f32> = wp + warp * warpS * 2.4;

  let lSc: f32 = max(modifiersBlock.modDamagedScales.x, 0.01);
  let mSc: f32 = max(modifiersBlock.modDamagedScales.y, 0.01);
  let sSc: f32 = max(modifiersBlock.modDamagedScales.z, 0.01);
  let crackSc: f32 = max(modifiersBlock.modDamagedScales.w, 0.01);

  let nLarge: f32 = clamp(fbm3D_3(p * lSc) * 1.142857, 0.0, 1.0);
  let nMed: f32 = valueNoise3D(p * mSc + vec3<f32>(11.3, 23.7, 4.9));
  let nSmall: f32 = valueNoise3D(p * sSc + vec3<f32>(5.1, 2.9, 17.3));

  let crackRaw: f32 = valueNoise3D(p * crackSc + vec3<f32>(19.1, 7.7, 12.4));
  var ridge: f32 = 1.0 - abs(crackRaw * 2.0 - 1.0);
  let ridgeStr: f32 = max(modifiersBlock.modDamagedCrack.x, 0.0);
  let edgeSharpen: f32 = max(modifiersBlock.modDamagedCrack.w, 0.05);
  ridge = pow(clamp(ridge, 0.0, 1.0), edgeSharpen) * ridgeStr;

  let crack2: f32 = valueNoise3D(p * crackSc * 1.7 + vec3<f32>(7.7, 19.1, 3.8));
  var ridge2: f32 = 1.0 - abs(crack2 * 2.0 - 1.0);
  ridge2 = pow(clamp(ridge2, 0.0, 1.0), edgeSharpen) * ridgeStr * 0.6;

  let scratchSc: f32 = max(modifiersBlock.modDamagedCrack.y, 0.01);
  let nA: f32 = valueNoise3D(w * vec3<f32>(scratchSc, scratchSc * 0.31, scratchSc * 0.73) + vec3<f32>(2.1, 13.7, 5.4));
  let nB: f32 = valueNoise3D(w * vec3<f32>(scratchSc * 0.29, scratchSc, scratchSc * 0.61) + vec3<f32>(17.0, 3.1, 9.8));
  var scratch: f32 = nA * nB;
  let scratchDet: f32 = valueNoise3D(w * scratchSc * 1.7 + vec3<f32>(3.1, 7.7, 15.2));
  scratch = scratch * 0.7 + scratchDet * 0.3;

  let lW: f32 = max(modifiersBlock.modDamagedWeights.x, 0.0);
  let mW: f32 = max(modifiersBlock.modDamagedWeights.y, 0.0);
  let sW: f32 = max(modifiersBlock.modDamagedWeights.z, 0.0);
  let cW: f32 = max(modifiersBlock.modDamagedWeights.w, 0.0);
  let sWc: f32 = max(modifiersBlock.modDamagedCrack.z, 0.0);

  let weightSum: f32 = max(0.001, lW + mW + sW + cW * 1.5 + sWc);
  let combined: f32 = (nLarge * lW + nMed * mW + nSmall * sW + ridge * cW + ridge2 * cW * 0.5 + scratch * sWc) / weightSum;
  return clamp(combined, 0.0, 1.0);
}

fn damagedRidgeRaw(w: vec3<f32>) -> f32 {
  let p: vec3<f32> = w * max(modifiersBlock.modDamagedNoise.x, 0.01) * max(modifiersBlock.modDamagedScales.w, 0.01) + vec3<f32>(19.1, 7.7, 12.4);
  let r: f32 = valueNoise3D(p);
  var ridge: f32 = 1.0 - abs(r * 2.0 - 1.0);
  let r2: f32 = valueNoise3D(p * 1.7 + vec3<f32>(7.7, 19.1, 3.8));
  var ridge2: f32 = 1.0 - abs(r2 * 2.0 - 1.0);
  let sharpen: f32 = max(modifiersBlock.modDamagedCrack.w, 0.05);
  return pow(clamp(ridge, 0.0, 1.0), sharpen) * 0.7 + pow(clamp(ridge2, 0.0, 1.0), sharpen) * 0.3;
}

fn damagedSurfaceDetail(w: vec3<f32>) -> f32 {
  let scale: f32 = max(modifiersBlock.modDamagedGlobal2.w, 0.01);
  let chip: f32 = hash31(floor(w * scale + vec3<f32>(9.7, 31.2, 5.4)));
  let grit: f32 = valueNoise3D(w * scale * 0.47 + vec3<f32>(21.3, 4.1, 14.8));
  return clamp(chip * 0.62 + grit * 0.38, 0.0, 1.0);
}

fn damagedNoiseShape(w: vec3<f32>) -> f32 {
  let th: f32 = modifiersBlock.modDamagedNoise.y;
  let fe: f32 = max(modifiersBlock.modDamagedNoise.z, 0.0001);
  return smoothstep(th - fe, th + fe, damagedNoiseRaw(w));
}

fn damagedEnvMask(w: vec3<f32>, isFloor: f32) -> f32 {
  let eBase: f32 = modifiersBlock.modDamagedFinal.y;
  let bot: f32 = 1.0 - smoothstep(0.0, 0.18, w.z) * 0.10;
  let top: f32 = 1.0 - smoothstep(frame.wallWorldHeight * 0.60869565, frame.wallWorldHeight, w.z) * 0.30;
  let wall: f32 = mix(eBase, 1.0, bot * top);
  return clamp(mix(wall, 1.0, step(0.5, isFloor)), 0.0, 1.0);
}

fn damagedMaterialMask(mh: f32, ao: f32, ro: f32) -> f32 {
  let hCue: f32 = smoothstep(modifiersBlock.modDamagedMaterial.x, modifiersBlock.modDamagedMaterial.y, mh);
  let aoCue: f32 = smoothstep(modifiersBlock.modDamagedMaterial.z, modifiersBlock.modDamagedMaterial.w, ao);
  let roughCue: f32 = smoothstep(modifiersBlock.modDamagedMaterial2.x, modifiersBlock.modDamagedMaterial2.y, ro);
  let permissive: f32 = max(hCue, max(aoCue, roughCue));
  let average: f32 = (hCue + aoCue + roughCue) / 3.0;
  let restrictive: f32 = hCue * aoCue * roughCue;
  let combine: f32 = clamp(modifiersBlock.modDamagedMaterial2.w, 0.0, 1.0);
  let cue: f32 = select(mix(permissive, average, combine * 2.0), mix(average, restrictive, (combine - 0.5) * 2.0), combine >= 0.5);
  return mix(clamp(modifiersBlock.modDamagedMaterial2.z, 0.0, 1.0), 1.0, clamp(cue, 0.0, 1.0));
}

fn damagedFinalMask(w: vec3<f32>, mh: f32, ao: f32, ro: f32, isFloor: f32) -> f32 {
  if (modifiersBlock.modDamagedAppearance.w < 0.0) { return 0.0; }
  let biome: f32 = damagedBiomeMask(w.xy);
  let has: f32 = step(0.001, biome);
  let noise: f32 = damagedNoiseShape(w);
  let env: f32 = damagedEnvMask(w, isFloor);
  let mat: f32 = damagedMaterialMask(mh, ao, ro);
  let bBase: f32 = modifiersBlock.modDamagedFinal.x;
  let eBase: f32 = modifiersBlock.modDamagedFinal.y;
  let mBase: f32 = modifiersBlock.modDamagedFinal.z;
  let boost: f32 = modifiersBlock.modDamagedFinal.w;
  let nW: f32 = max(modifiersBlock.modDamagedFinalWeights.x, 0.0);
  let eW: f32 = max(modifiersBlock.modDamagedFinalWeights.y, 0.0);
  let mW: f32 = max(modifiersBlock.modDamagedFinalWeights.z, 0.0);
  let bW: f32 = max(modifiersBlock.modDamagedFinalWeights.w, 0.0);
  let envMod: f32 = mix(eBase, 1.0, env);
  let matMod: f32 = mix(mBase, 1.0, mat);
  let bioMod: f32 = mix(bBase, 1.0, biome);
  let sum: f32 = max(0.001, nW + eW + mW + bW);
  let average: f32 = (noise * nW + envMod * eW + matMod * mW + bioMod * bW) / sum;
  let permissive: f32 = max(noise * nW, max(envMod * eW, max(matMod * mW, bioMod * bW)));
  let restrictive: f32 = mix(1.0, noise, step(0.001, nW))
    * mix(1.0, envMod, step(0.001, eW))
    * mix(1.0, matMod, step(0.001, mW))
    * mix(1.0, bioMod, step(0.001, bW));
  let combine: f32 = clamp(modifiersBlock.modDamagedGlobal2.y, 0.0, 1.0);
  var f: f32 = mix(permissive, average, combine * 2.0);
  if (combine >= 0.5) { f = mix(average, restrictive, (combine - 0.5) * 2.0); }
  // Preserve the generated room/story intensity instead of treating every
  // nonzero bilinear tail as equally damaged. This is what makes guardian and
  // armory zones visibly harsher than corridors or secret rooms.
  let biomeStrength: f32 = smoothstep(0.015, 0.75, biome);
  f = f * has * biomeStrength;
  let brightness: f32 = modifiersBlock.modDamagedGlobal.y;
  f = clamp(f * boost + brightness, 0.0, 1.0);
  let contrast: f32 = max(modifiersBlock.modDamagedGlobal.x, 0.0);
  f = clamp((f - 0.5) * contrast + 0.5, 0.0, 1.0);
  f = pow(clamp(f, 0.001, 1.0), max(modifiersBlock.modDamagedGlobal2.x, 0.05));
  let range: f32 = max(0.001, modifiersBlock.modDamagedGlobal.w - modifiersBlock.modDamagedGlobal.z);
  f = clamp((f - modifiersBlock.modDamagedGlobal.z) / range, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  return f;
}

fn damagedHeightOffset(w: vec3<f32>, s: f32) -> f32 {
  let has: f32 = step(0.001, s);
  var depth: f32 = modifiersBlock.modDamagedSurface.x;
  var pitVar: f32 = modifiersBlock.modDamagedSurface.y;
  var ridgeH: f32 = modifiersBlock.modDamagedSurface.z;
  let raw: f32 = damagedNoiseRaw(w);
  let ridge: f32 = damagedRidgeRaw(w);
  let scratch: f32 = damagedSurfaceDetail(w);
  var pit: f32 = depth + (raw - 0.5) * pitVar * 1.2 - scratch * 0.08;
  return (pit * 0.85 + ridge * ridgeH * 0.35) * s * has;
}

fn pomOffsetArrayDamaged(heightTex: texture_2d_array<f32>, uv: vec2<f32>, layer: i32, viewTS: vec3<f32>, strength: f32, steps: i32, worldPos: vec3<f32>, isFloor: f32) -> vec2<f32> {
  let base: vec2<f32> = pomOffsetArray(heightTex, uv, layer, viewTS, strength, steps);
  let modUV: vec2<f32> = worldPos.xy / frame.mapSize;
  let ci: vec2<i32> = vec2<i32>(floor(worldPos.xy));
  var inB: f32 = 1.0;
  if (ci.x < 0 || ci.y < 0 || ci.x >= i32(frame.mapSize.x) || ci.y >= i32(frame.mapSize.y)) { inB = 0.0; }
  let cell: f32 = loadModifierMap2(modUV).r * f32(frame.modifiersEnabled) * inB;
  let has: f32 = step(0.001, cell);
  let damageEnabled: f32 = step(0.0, modifiersBlock.modDamagedAppearance.w);
  let dMask: f32 = damagedNoiseShape(worldPos) * has * cell * damageEnabled;
  let depth: f32 = modifiersBlock.modDamagedSurface.x;
  let pomBoost: f32 = modifiersBlock.modDamagedGlobal2.z;
  let dH: f32 = depth * dMask * pomBoost * has;
  let extra: vec2<f32> = viewTS.xy * dH * 0.65 / max(abs(viewTS.z), 0.18) * has;
  var tot: vec2<f32> = base + extra * 0.55;
  let maxOff: f32 = select(0.10, frame.pomMaxOffset, frame.pomMaxOffset > 0.0);
  if (length(tot) > maxOff * 1.4) {
    tot = tot * (maxOff * 1.4 / max(length(tot), 0.001));
  }
  return tot;
}

fn debugDamagedNoiseCol(w: vec3<f32>) -> vec3<f32> { return vec3<f32>(0.85, 0.22, 0.18) * damagedNoiseShape(w) * 1.8; }
fn debugDamagedCombinedCol(w: vec3<f32>, mh: f32, ao: f32, ro: f32, isFloor: f32) -> vec3<f32> { return vec3<f32>(0.85, 0.25, 0.15) * damagedFinalMask(w, mh, ao, ro, isFloor) * 1.8; }

// Coverage noise is intentionally broad so moss forms readable patches.  The
// surface needs a separate, finer signal or fully covered pixels all receive
// almost identical albedo and PBR values.
fn mossSurfaceDetail(worldPos: vec3<f32>) -> f32 {
  let seedOffset: f32 = modifiersBlock.modMossAlbedoRough.y * 0.011;
  let detailScale: f32 = max(mossDefault(modifiersBlock.modMossAlbedoRough.z, 2.95) * 2.0, 6.0);
  let p: vec3<f32> = worldPos * detailScale + vec3<f32>(17.3 + seedOffset, 9.1, 23.7);
  // Quantized hash cells are deliberate: at the game's internal resolution
  // they give stable pixel clusters for a fraction of interpolated 3D noise's cost.
  let clump: f32 = hash31(floor(p));
  let fiber: f32 = hash31(floor(p * 1.91 + vec3<f32>(4.7, 13.2, 6.4)));
  return clamp(clump * 0.68 + fiber * 0.32, 0.0, 1.0);
}

// ----- Blood -----
// Blood uses the story-weighted modifierMap2.g field for coarse placement and
// a continuous 3D splatter signal for shapes that cross floor/wall seams.
fn bloodFinalMask(worldPos: vec3<f32>, surfaceN: vec3<f32>, bloodCell: f32) -> f32 {
  if (bloodCell < 0.001 || modifiersBlock.modBloodFinal.x < 0.5) { return 0.0; }
  let scale: f32 = max(modifiersBlock.modBloodNoise.x, 0.01);
  let threshold: f32 = modifiersBlock.modBloodNoise.y;
  let feather: f32 = max(modifiersBlock.modBloodNoise.z, 0.001);
  let warpStrength: f32 = modifiersBlock.modBloodNoise.w;
  let splatterScale: f32 = max(modifiersBlock.modBloodShape.x, 0.01);
  let speckleScale: f32 = max(modifiersBlock.modBloodShape.y, 0.01);
  let streakScale: f32 = max(modifiersBlock.modBloodShape.z, 0.02);
  let satelliteWeight: f32 = modifiersBlock.modBloodShape.w;

  let warpP: vec3<f32> = worldPos * scale * 0.32;
  let warp: vec3<f32> = vec3<f32>(
    valueNoise3D(warpP + vec3<f32>(7.1, 2.3, 11.7)),
    valueNoise3D(warpP + vec3<f32>(17.4, 5.2, 3.8)),
    valueNoise3D(warpP + vec3<f32>(4.6, 19.3, 8.1))
  ) - vec3<f32>(0.5);
  let wallFacing: f32 = 1.0 - clamp(abs(surfaceN.z), 0.0, 1.0);
  let bloodP: vec3<f32> = (worldPos + warp * warpStrength) * scale * splatterScale;
  let floorCloud: f32 = fbm3D_3(bloodP);
  let streakP: vec3<f32> = vec3<f32>(bloodP.xy, bloodP.z * streakScale);
  let wallCloud: f32 = fbm3D_3(streakP + vec3<f32>(13.0, 5.0, 2.0));
  let cloud: f32 = mix(floorCloud, wallCloud, wallFacing);
  let broad: f32 = smoothstep(threshold - feather, threshold + feather, cloud);
  let speckle: f32 = hash31(floor(worldPos * speckleScale + vec3<f32>(29.3, 7.7, 41.1)));
  let satellites: f32 = smoothstep(0.78, 0.94, speckle) * (1.0 - broad) * satelliteWeight;
  let splatter: f32 = clamp(broad + satellites, 0.0, 1.0);

  let upFacing: f32 = clamp(surfaceN.z, 0.0, 1.0);
  let floorPlacement: f32 = upFacing * modifiersBlock.modBloodPlacement.x;
  let wallFadeHeight: f32 = max(0.01, modifiersBlock.modBloodPlacement.z * frame.wallWorldHeight);
  let wallBottom: f32 = 1.0 - smoothstep(wallFadeHeight, frame.wallWorldHeight, worldPos.z);
  let wallPlacement: f32 = wallFacing * modifiersBlock.modBloodPlacement.y * (0.32 + 0.68 * wallBottom);
  let placement: f32 = clamp(floorPlacement + wallPlacement, 0.0, 1.0);

  var mask: f32 = bloodCell * splatter * placement * modifiersBlock.modBloodFinal.y;
  mask = clamp((mask - 0.5) * modifiersBlock.modBloodFinal.z + 0.5, 0.0, 1.0);
  return pow(mask, max(modifiersBlock.modBloodFinal.w, 0.05));
}

// ----- Dust -----
// Dust favors upward surfaces and low/occluded material regions. Its soft
// noise is intentionally independent from the crisper moss/blood signals.
fn dustFinalMask(worldPos: vec3<f32>, surfaceN: vec3<f32>, matHeight: f32, ao: f32, dustCell: f32) -> f32 {
  if (dustCell < 0.001 || modifiersBlock.modDustFinal.x < 0.5) { return 0.0; }
  let scale: f32 = max(modifiersBlock.modDustNoise.x, 0.01);
  let threshold: f32 = modifiersBlock.modDustNoise.y;
  let feather: f32 = max(modifiersBlock.modDustNoise.z, 0.001);
  let detailScale: f32 = max(modifiersBlock.modDustNoise.w, 0.01);
  let broad: f32 = fbm3D_2(worldPos * scale + vec3<f32>(3.7, 21.1, 8.3));
  let fine: f32 = valueNoise3D(worldPos * detailScale + vec3<f32>(15.2, 4.8, 31.0));
  let noiseMask: f32 = smoothstep(threshold - feather, threshold + feather, broad) * (0.82 + 0.18 * fine);

  let heightCue: f32 = 1.0 - smoothstep(modifiersBlock.modDustMaterial.x, modifiersBlock.modDustMaterial.y, matHeight);
  let aoCue: f32 = 1.0 - smoothstep(modifiersBlock.modDustMaterial.z, modifiersBlock.modDustMaterial.w, ao);
  let materialCue: f32 = clamp(0.35 + max(heightCue, aoCue * 0.75) * 0.65, 0.0, 1.0);
  let upFacing: f32 = clamp(surfaceN.z, 0.0, 1.0);
  let downFacing: f32 = clamp(-surfaceN.z, 0.0, 1.0);
  let wallFacing: f32 = 1.0 - clamp(abs(surfaceN.z), 0.0, 1.0);
  let placement: f32 = upFacing * modifiersBlock.modDustPlacement.x
    + wallFacing * modifiersBlock.modDustPlacement.y
    + downFacing * modifiersBlock.modDustPlacement.z;
  var mask: f32 = dustCell * noiseMask * materialCue * placement * modifiersBlock.modDustPlacement.w;
  mask = clamp((mask - 0.5) * modifiersBlock.modDustFinal.y + 0.5, 0.0, 1.0);
  return pow(mask, max(modifiersBlock.modDustFinal.z, 0.05));
}

fn debugBloodMaskCol(worldPos: vec3<f32>, isFloor: f32) -> vec3<f32> {
  let uv: vec2<f32> = worldPos.xy / frame.mapSize;
  let surfaceN: vec3<f32> = select(vec3<f32>(1.0, 0.0, 0.0), select(vec3<f32>(0.0, 0.0, -1.0), vec3<f32>(0.0, 0.0, 1.0), worldPos.z < frame.wallWorldHeight * 0.5), isFloor > 0.5);
  return vec3<f32>(0.85, 0.04, 0.025) * bloodFinalMask(worldPos, surfaceN, loadModifierMap2(uv).g) * 1.35;
}

fn debugDustMaskCol(worldPos: vec3<f32>, isFloor: f32, matHeight: f32, ao: f32) -> vec3<f32> {
  let uv: vec2<f32> = worldPos.xy / frame.mapSize;
  let surfaceN: vec3<f32> = select(vec3<f32>(1.0, 0.0, 0.0), select(vec3<f32>(0.0, 0.0, -1.0), vec3<f32>(0.0, 0.0, 1.0), worldPos.z < frame.wallWorldHeight * 0.5), isFloor > 0.5);
  return vec3<f32>(0.78, 0.68, 0.48) * dustFinalMask(worldPos, surfaceN, matHeight, ao, loadModifierMap2(uv).b) * 1.25;
}

// Main applyModifiers – exact from old GLSL translated to WGSL
fn applyModifiers(albedo: ptr<function, vec3<f32>>, N: ptr<function, vec3<f32>>, rough: ptr<function, f32>, metal: ptr<function, f32>, ao: ptr<function, f32>, worldPos: vec3<f32>, matHeight: ptr<function, f32>, isFloorSurface: f32) {
  let modsEnabled: f32 = f32(frame.modifiersEnabled);
  let cellI: vec2<i32> = vec2<i32>(floor(worldPos.xy));
  var inBounds: f32 = 1.0;
  if (cellI.x < 0 || cellI.y < 0 || cellI.x >= i32(frame.mapSize.x) || cellI.y >= i32(frame.mapSize.y)) { inBounds = 0.0; }

  let modUV: vec2<f32> = worldPos.xy / frame.mapSize;
  let mod1: vec4<f32> = loadModifierMap(modUV);
  let mod2: vec4<f32> = loadModifierMap2(modUV);

  var mossCell: f32 = mod1.r * modsEnabled * inBounds;
  var puddleCell: f32 = mod1.b * modsEnabled * inBounds;
  let floorFactor: f32 = step(0.5, isFloorSurface);
  puddleCell = puddleCell * mix(0.02, 1.0, floorFactor);

  // Moss decomposed
  let mossMask: f32 = mossFinalMask(worldPos, *matHeight, *ao, *rough, isFloorSurface);
  let mossHas: f32 = step(0.001, mossCell);
  let mossNoiseVal: f32 = mossNoiseRaw(worldPos);
  let mossDetail: f32 = mossSurfaceDetail(worldPos);
  let mossDetailScale: f32 = max(mossDefault(modifiersBlock.modMossAlbedoRough.z, 2.95) * 2.0, 6.0);
  let mossSpeckle: f32 = hash31(floor(worldPos * mossDetailScale * 1.875 + vec3<f32>(31.7, 5.3, 19.1)));

  var mossAlbedoBase: vec3<f32> = modifiersBlock.modMossAlbedo.xyz;
  let mossAlbedoZero: f32 = step(length(modifiersBlock.modMossAlbedo), 0.0001);
  mossAlbedoBase = mix(mossAlbedoBase, vec3<f32>(0.18, 0.42, 0.15), mossAlbedoZero);
  var mossColorStrength: f32 = modifiersBlock.modMossAlbedo.w;
  mossColorStrength = mix(mossColorStrength, 0.75, mossAlbedoZero);

  var mossRoughAdd: f32 = modifiersBlock.modMossStrengths.x;
  var mossHeightAdd: f32 = modifiersBlock.modMossStrengths.y;
  var mossNormalStr: f32 = modifiersBlock.modMossStrengths.z;
  var mossAoStr: f32 = modifiersBlock.modMossStrengths.w;
  let mossStrZero: f32 = step(length(modifiersBlock.modMossStrengths), 0.0001);
  mossRoughAdd = mix(mossRoughAdd, 0.34, mossStrZero);
  mossHeightAdd = mix(mossHeightAdd, 0.12, mossStrZero);
  mossNormalStr = mix(mossNormalStr, 0.36, mossStrZero);
  mossAoStr = mix(mossAoStr, 0.16, mossStrZero);

  // A compact three-tone ramp survives the low internal resolution better
  // than smooth macro-noise alone.  The warm highlight keeps the green from
  // reading as a single flat debug colour.
  let mossDark: vec3<f32> = mossAlbedoBase * vec3<f32>(0.66, 0.72, 0.63);
  let mossMid: vec3<f32> = mossAlbedoBase * vec3<f32>(0.94, 1.00, 0.90);
  let mossLight: vec3<f32> = mossAlbedoBase * vec3<f32>(1.17, 1.14, 0.91) + vec3<f32>(0.018, 0.014, 0.002);
  let darkToMid: f32 = smoothstep(0.24, 0.58, mossDetail);
  let midToLight: f32 = smoothstep(0.62, 0.86, mossSpeckle) * smoothstep(0.45, 0.78, mossDetail);
  var mossAlbedo: vec3<f32> = mix(mossDark, mossMid, darkToMid);
  mossAlbedo = mix(mossAlbedo, mossLight, midToLight);
  mossAlbedo = mossAlbedo * (0.94 + 0.12 * mossNoiseVal);

  let mossStrength: f32 = clamp(mossMask * mossHas, 0.0, 1.0);
  // colorStrength is a visibility gain for the deliberately sparse final mask.
  // Keep the resulting interpolation bounded so gains above 1 never extrapolate RGB.
  let mossBlend: f32 = clamp(mossStrength * mossColorStrength, 0.0, 1.0);
  *albedo = mix(*albedo, mossAlbedo, mossBlend);

  // Moss is rough, but not uniformly max-rough.  Blend toward a varied target
  // so already-rough masonry does not simply clamp every moss pixel to 1.0.
  let mossRoughTarget: f32 = clamp(0.74 + mossRoughAdd * 0.35 + (mossDetail - 0.5) * 0.18 + (mossSpeckle - 0.5) * 0.08, 0.68, 0.96);
  *rough = mix(*rough, mossRoughTarget, mossStrength * 0.88);
  *metal = mix(*metal, 0.0, mossStrength * 0.80);
  *ao = *ao * (1.0 - mossStrength * mossAoStr * (0.65 + 0.35 * (1.0 - mossDetail)));

  // Build the relief in the actual surface plane.  Blending toward world-up
  // flattened floor normals and tilted wall normals; tangent-space detail is
  // stable on floors, ceilings and every wall orientation.
  let mossBaseN: vec3<f32> = normalize(*N);
  let mossAxis: vec3<f32> = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(mossBaseN.z) > 0.92);
  let mossTangent: vec3<f32> = normalize(cross(mossAxis, mossBaseN));
  let mossBitangent: vec3<f32> = normalize(cross(mossBaseN, mossTangent));
  let mossSlope: vec3<f32> = mossTangent * (mossDetail - 0.5) + mossBitangent * (mossSpeckle - 0.5);
  let mossReliefN: vec3<f32> = normalize(mossBaseN - mossSlope * mossNormalStr * 0.55);
  *N = normalize(mix(mossBaseN, mossReliefN, mossStrength));
  *matHeight = *matHeight + mossStrength * mossHeightAdd * (0.55 + 0.55 * mossDetail);

  // Dust – pale, dry accumulation with softened normals and varied roughness.
  let dustCell: f32 = mod2.b * modsEnabled * inBounds;
  let dustMask: f32 = dustFinalMask(worldPos, normalize(*N), *matHeight, *ao, dustCell);
  if (dustMask > 0.0001) {
    let dustGain: f32 = max(modifiersBlock.modDustAlbedo.w, 0.0);
    let dustVisible: f32 = clamp(dustMask * dustGain, 0.0, 1.0);
    let dustFine: f32 = valueNoise3D(worldPos * max(modifiersBlock.modDustNoise.w, 0.01) + vec3<f32>(6.2, 18.7, 2.4));
    let dustBase: vec3<f32> = modifiersBlock.modDustAlbedo.xyz;
    let dustGray: f32 = dot(dustBase, vec3<f32>(0.299, 0.587, 0.114));
    let dustTint: vec3<f32> = mix(dustBase, vec3<f32>(dustGray), modifiersBlock.modDustFinal.w) * (0.86 + 0.22 * dustFine);
    *albedo = mix(*albedo, dustTint, dustVisible);
    let dustPbr: f32 = clamp(dustMask * max(1.0, dustGain), 0.0, 1.0);
    *rough = clamp(*rough + modifiersBlock.modDustSurface.x * dustPbr * (0.72 + 0.28 * dustFine), 0.0, 0.98);
    *metal = mix(*metal, 0.0, dustPbr * 0.92);
    *ao = *ao * (1.0 - dustPbr * modifiersBlock.modDustSurface.w);
    *matHeight = *matHeight + dustPbr * modifiersBlock.modDustSurface.y * (0.70 + 0.30 * dustFine);
    let dustBaseN: vec3<f32> = normalize(*N);
    let dustAxis: vec3<f32> = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(dustBaseN.z) > 0.92);
    let dustTangent: vec3<f32> = normalize(cross(dustAxis, dustBaseN));
    let dustBitangent: vec3<f32> = normalize(cross(dustBaseN, dustTangent));
    let dustFine2: f32 = hash31(floor(worldPos * max(modifiersBlock.modDustNoise.w, 0.01) + vec3<f32>(23.8, 3.4, 11.9)));
    let dustSlope: vec3<f32> = dustTangent * (dustFine - 0.5) + dustBitangent * (dustFine2 - 0.5);
    let dustReliefN: vec3<f32> = normalize(dustBaseN - dustSlope * modifiersBlock.modDustSurface.z * 0.22);
    *N = normalize(mix(dustBaseN, dustReliefN, dustPbr));
  }

  // Blood – irregular dark-red splatters with a dried edge, shallow relief,
  // and a roughness range that can cover fresh through dried appearances.
  let bloodCell: f32 = mod2.g * modsEnabled * inBounds;
  let bloodMask: f32 = bloodFinalMask(worldPos, normalize(*N), bloodCell);
  if (bloodMask > 0.0001) {
    let bloodGain: f32 = max(modifiersBlock.modBloodAlbedo.w, 0.0);
    let bloodVisible: f32 = clamp(bloodMask * bloodGain, 0.0, 1.0);
    let bloodDetail: f32 = hash31(floor(worldPos * max(modifiersBlock.modBloodShape.y, 0.01) + vec3<f32>(3.1, 27.4, 12.6)));
    let bloodEdge: f32 = (1.0 - smoothstep(0.12, 0.58, bloodMask)) * modifiersBlock.modBloodPlacement.w;
    var bloodColor: vec3<f32> = mix(modifiersBlock.modBloodAlbedo.xyz, modifiersBlock.modBloodDarkRough.xyz, bloodEdge);
    bloodColor = bloodColor * (0.82 + 0.28 * bloodDetail);
    *albedo = mix(*albedo, bloodColor, bloodVisible);
    let bloodPbr: f32 = clamp(bloodMask * max(1.0, bloodGain), 0.0, 1.0);
    let bloodRoughTarget: f32 = clamp(modifiersBlock.modBloodDarkRough.w + (bloodDetail - 0.5) * modifiersBlock.modBloodSurface.z, 0.08, 0.96);
    *rough = mix(*rough, bloodRoughTarget, bloodPbr);
    *metal = mix(*metal, 0.0, bloodPbr);
    *ao = *ao * (1.0 - bloodPbr * modifiersBlock.modBloodSurface.w);
    *matHeight = *matHeight + bloodPbr * modifiersBlock.modBloodSurface.x * (0.65 + 0.35 * bloodDetail);
    let bloodBaseN: vec3<f32> = normalize(*N);
    let bloodAxis: vec3<f32> = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(bloodBaseN.z) > 0.92);
    let bloodTangent: vec3<f32> = normalize(cross(bloodAxis, bloodBaseN));
    let bloodBitangent: vec3<f32> = normalize(cross(bloodBaseN, bloodTangent));
    let bloodDetail2: f32 = hash31(floor(worldPos * max(modifiersBlock.modBloodShape.y, 0.01) + vec3<f32>(19.4, 5.9, 33.2)));
    let bloodSlope: vec3<f32> = bloodTangent * (bloodDetail - 0.5) + bloodBitangent * (bloodDetail2 - 0.5);
    let bloodReliefN: vec3<f32> = normalize(bloodBaseN - bloodSlope * modifiersBlock.modBloodSurface.y * 0.35);
    *N = normalize(mix(bloodBaseN, bloodReliefN, bloodPbr));
  }

  // Puddle – full ripple + metal + ao path from old GLSL
  let isFloor: f32 = step(0.5, isFloorSurface);
  let floorHasP: f32 = isFloor * step(worldPos.z, 0.6);
  let puddleHas: f32 = step(0.001, puddleCell) * floorHasP;
  let puddleCellForMask: f32 = puddleCell * puddleHas;
  var puddleMask: f32 = computePuddleMaskTweakable(worldPos, *matHeight, *ao, puddleCellForMask);
  let puddleHas2: f32 = step(0.001, puddleMask);
  puddleMask = puddleMask * puddleHas2;

  var darkBase: f32 = modifiersBlock.modWaterParams.w;
  darkBase = mix(darkBase, 0.35, step(darkBase, 0.0001));
  var tintMix: f32 = modifiersBlock.modDustParams.x;
  tintMix = mix(tintMix, 0.60, step(length(modifiersBlock.modDustParams), 0.0001));
  var puddleAlbedo: vec3<f32> = modifiersBlock.modPuddleAlbedoRough.xyz;
  let puddleAlbedoZero: f32 = step(length(modifiersBlock.modPuddleAlbedoRough), 0.0001);
  puddleAlbedo = mix(puddleAlbedo, vec3<f32>(0.10, 0.14, 0.19), puddleAlbedoZero);
  var colorStrength: f32 = modifiersBlock.modPuddleParams.x;
  colorStrength = mix(colorStrength, 0.92, step(colorStrength, 0.001));
  var floorDepress: f32 = modifiersBlock.modMossAlbedoRough.x;
  floorDepress = mix(floorDepress, -0.08, step(abs(floorDepress), 0.0001) * step(floorDepress, 0.001)); // keep negative fallback
  // Actually use -0.08 if UBO has 0 and we are in fallback mode: detect via length zero of block 0
  // Simpler: if abs(floorDepress) < 0.0001 then -0.08
  if (abs(floorDepress) < 0.0001) { floorDepress = -0.08; }
  let darkBaseCol: vec3<f32> = *albedo * darkBase;
  let puddleTint: vec3<f32> = mix(darkBaseCol, puddleAlbedo, tintMix);
  *albedo = mix(*albedo, puddleTint, puddleMask * colorStrength * puddleHas2);

  let edge: f32 = puddleMask * (1.0 - puddleMask);
  var edgeLow: f32 = modifiersBlock.modDustParams.z;
  var edgeHigh: f32 = modifiersBlock.modDustParams.w;
  let dustZero: f32 = step(length(modifiersBlock.modDustParams), 0.0001);
  edgeLow = mix(edgeLow, 0.0, dustZero);
  edgeHigh = mix(edgeHigh, 0.15, dustZero);
  var edgeFoam: f32 = modifiersBlock.modBloodParams.y;
  edgeFoam = mix(edgeFoam, 0.25, step(length(modifiersBlock.modBloodParams), 0.0001));
  let edgeV: f32 = smoothstep(edgeLow, edgeHigh, edge) * edgeFoam * puddleHas2;
  *albedo = mix(*albedo, *albedo + vec3<f32>(0.18, 0.175, 0.16) * edgeV, puddleHas2);

  var roughLow: f32 = modifiersBlock.modDamagedParams.x;
  var roughHigh: f32 = modifiersBlock.modDamagedParams.y;
  let damParamsZero: f32 = step(length(modifiersBlock.modDamagedParams), 0.0001);
  roughLow = mix(roughLow, 0.0, damParamsZero);
  roughHigh = mix(roughHigh, 0.65, damParamsZero);
  var puddleRoughTarget: f32 = modifiersBlock.modPuddleAlbedoRough.w;
  puddleRoughTarget = mix(puddleRoughTarget, 0.04, puddleAlbedoZero);
  let roughFeather: f32 = smoothstep(roughLow, roughHigh, puddleMask);
  *rough = mix(*rough, puddleRoughTarget, roughFeather * 0.97 * puddleHas2);

  // Ripple normal + metal + ao + depress – restored from old
  var rippleScale: f32 = modifiersBlock.modBloodParams.x;
  rippleScale = mix(rippleScale, 3.0, step(length(modifiersBlock.modBloodParams), 0.0001));
  var flatStrength: f32 = modifiersBlock.modDamagedParams.z;
  flatStrength = mix(flatStrength, 0.88, damParamsZero);
  var metalMix: f32 = modifiersBlock.modDamagedParams.w;
  metalMix = mix(metalMix, 0.85, damParamsZero);
  var aoMix: f32 = modifiersBlock.modBloodParams.w;
  aoMix = mix(aoMix, 0.20, step(length(modifiersBlock.modBloodParams), 0.0001));

  let flatWater: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  let ripUV: vec2<f32> = worldPos.xy * rippleScale;
  let r1: f32 = valueNoise2D(ripUV);
  let r2: f32 = valueNoise2D(ripUV + vec2<f32>(13.5, 7.1));
  let rippleN: vec3<f32> = normalize(vec3<f32>((r1 - 0.5) * 0.25, (r2 - 0.5) * 0.25, 1.0));
  let baseFlat: vec3<f32> = mix(*N, flatWater, puddleMask * flatStrength * puddleHas2);
  let rippleMix: f32 = puddleMask * 0.28 * (0.5 + 0.5 * fbm2D_2(worldPos.xy * 0.52)) * puddleHas2;
  *N = normalize(mix(baseFlat, rippleN, rippleMix));

  *metal = mix(*metal, 0.0, puddleMask * metalMix * puddleHas2);
  *ao = *ao * (1.0 - puddleMask * aoMix * puddleHas2);
  // depress handled via matHeight bias in scene if needed (floorDepress negative); we keep here for completeness
  // matHeight depression is applied via puddle floor depress (handled via extra offset in footstep shader, we keep additive inverse)
  // In old path, floorDepress modulated height but main depression is via separate pass; keeping matHeight update minimal
  // *matHeight += puddleMask * floorDepress * puddleHas2; // floorDepress negative -> slight dip

  // Damaged – chipped albedo and full PBR relief in the host surface plane.
  let dCell: f32 = mod2.r * modsEnabled * inBounds;
  let dMask: f32 = damagedFinalMask(worldPos, *matHeight, *ao, *rough, isFloorSurface);
  if (dCell > 0.0001 && dMask > 0.0001) {
    let dStr: f32 = clamp(dMask, 0.0, 1.0);
    let rawD: f32 = damagedNoiseRaw(worldPos);
    let ridge: f32 = damagedRidgeRaw(worldPos);
    let fine: f32 = damagedSurfaceDetail(worldPos);
    let fine2: f32 = hash31(floor(worldPos * max(modifiersBlock.modDamagedGlobal2.w, 0.01) + vec3<f32>(27.4, 6.1, 18.9)));

    let dDepth: f32 = modifiersBlock.modDamagedSurface.x;
    let dPitVar: f32 = modifiersBlock.modDamagedSurface.y;
    let dRidgeHeight: f32 = modifiersBlock.modDamagedSurface.z;
    let hPit: f32 = dDepth + (rawD - 0.5) * dPitVar + (fine - 0.5) * dPitVar * 0.35;
    *matHeight = *matHeight + (hPit + ridge * dRidgeHeight) * dStr;

    // A restrained exposed-stone tint makes damage readable even where the
    // low-resolution lighting cannot show every normal/height change.
    let chipDark: vec3<f32> = modifiersBlock.modDamagedAppearance.xyz * vec3<f32>(0.68, 0.66, 0.62);
    let chipLight: vec3<f32> = modifiersBlock.modDamagedAppearance.xyz * vec3<f32>(1.12, 1.08, 1.01);
    let chipColor: vec3<f32> = mix(chipDark, chipLight, smoothstep(0.28, 0.82, fine));
    let dColorBlend: f32 = clamp(dStr * max(modifiersBlock.modDamagedAppearance.w, 0.0) * (0.76 + ridge * 0.24), 0.0, 1.0);
    *albedo = mix(*albedo, chipColor, dColorBlend);

    let dBaseN: vec3<f32> = normalize(*N);
    let dAxis: vec3<f32> = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(dBaseN.z) > 0.92);
    let dTangent: vec3<f32> = normalize(cross(dAxis, dBaseN));
    let dBitangent: vec3<f32> = normalize(cross(dBaseN, dTangent));
    let dNormalDetail: f32 = modifiersBlock.modDamagedSurface2.x;
    let dSlope: vec3<f32> = dTangent * (fine - 0.5) + dBitangent * (fine2 - 0.5) + (dTangent + dBitangent) * (ridge - 0.5) * 0.22;
    let dReliefN: vec3<f32> = normalize(dBaseN - dSlope * modifiersBlock.modDamagedSurface.w * dNormalDetail);
    *N = normalize(mix(dBaseN, dReliefN, dStr));

    let dRoughTarget: f32 = clamp(*rough + modifiersBlock.modDamagedSurface2.y + (fine - 0.5) * modifiersBlock.modDamagedSurface2.z, 0.25, 0.98);
    *rough = mix(*rough, dRoughTarget, dStr);
    *ao = clamp(*ao * (1.0 - dStr * modifiersBlock.modDamagedSurface2.w * (0.62 + 0.38 * ridge)), 0.0, 1.0);
    *metal = mix(*metal, 0.0, dStr * 0.72);
  }
}

fn applyModifiersSimple(albedo: ptr<function, vec3<f32>>, N: ptr<function, vec3<f32>>, rough: ptr<function, f32>, metal: ptr<function, f32>, ao: ptr<function, f32>, worldPos: vec3<f32>) {
  var tmpH: f32 = 0.5;
  applyModifiers(albedo, N, rough, metal, ao, worldPos, &tmpH, 1.0);
}
`;
