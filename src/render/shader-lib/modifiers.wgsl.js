// WGSL port of modifiers.glsl.js – UBO 34 vec4 + exact moss/damaged/puddle from 632b7f2
// Preserves all public function names. Uses linearSampler for smooth modifier maps (matches old texture() LINEAR).

export const wgslModifiers = `
// UBO v26 - 34 vec4 = 544 bytes
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

// Damaged – chaotic multi-octave (exact from 632b7f2: dual ridge + cross scratch)
fn damagedBiomeMask(w: vec2<f32>) -> f32 {
  let uv: vec2<f32> = w / frame.mapSize;
  return textureSampleLevel(modifierMap2, linearSampler, uv, 0.0).r;
}

fn damagedNoiseRaw(w: vec3<f32>) -> f32 {
  let base: f32 = mossDefault(modifiersBlock.modDamagedNoise.x, 2.2);
  let warpS: f32 = mossDefault(modifiersBlock.modDamagedNoise.w, 0.35);
  var wp: vec2<f32> = w.xy * base + vec2<f32>(13.7, 5.1) + vec2<f32>(w.z * 0.25, w.z * 0.15);
  let warp1: f32 = fbm2D_2(wp * 0.35 + vec2<f32>(1.1, 2.2)) * warpS;
  let warp2: f32 = fbm2D_2(wp * 0.35 + vec2<f32>(7.7, 3.1)) * warpS;
  var p: vec2<f32> = wp + vec2<f32>(warp1, warp2) * 1.2;

  let dScalesZero: f32 = step(length(modifiersBlock.modDamagedScales), 0.0001);
  var lSc: f32 = mix(modifiersBlock.modDamagedScales.x, 1.0, dScalesZero);
  var mSc: f32 = mix(modifiersBlock.modDamagedScales.y, 2.4, dScalesZero);
  var sSc: f32 = mix(modifiersBlock.modDamagedScales.z, 5.8, dScalesZero);
  var crackSc: f32 = mix(modifiersBlock.modDamagedScales.w, 3.2, dScalesZero);

  let nLarge: f32 = fbm2D_3(p * lSc + vec2<f32>(w.z * 0.20, w.z * 0.12));
  let nMed: f32 = valueNoise2D(p * mSc + vec2<f32>(11.3, 23.7) + vec2<f32>(w.z * 0.4, 0.0));
  let nSmall: f32 = valueNoise2D(p * sSc + vec2<f32>(5.1, 2.9) + vec2<f32>(w.z * 0.6, 0.0));

  let crackRaw: f32 = valueNoise2D(p * crackSc + vec2<f32>(19.1, 7.7) + vec2<f32>(w.z * 0.7, 0.0));
  var ridge: f32 = 1.0 - abs(crackRaw * 2.0 - 1.0);
  ridge = ridge * ridge;
  let ridgeStr: f32 = mossDefault(modifiersBlock.modDamagedCrack.x, 1.0);
  ridge = ridge * ridgeStr;

  let crack2: f32 = valueNoise2D(p * crackSc * 1.7 + vec2<f32>(7.7, 19.1) + vec2<f32>(w.z * 0.25, w.z * 0.5));
  var ridge2: f32 = 1.0 - abs(crack2 * 2.0 - 1.0);
  ridge2 = ridge2 * ridge2 * ridgeStr * 0.6;

  let scratchSc: f32 = mossDefault(modifiersBlock.modDamagedCrack.y, 8.5);
  let nA: f32 = valueNoise2D(w.xy * scratchSc + vec2<f32>(w.z * 0.7, 0.0));
  let nB: f32 = valueNoise2D(vec2<f32>(w.y, w.x) * scratchSc * 0.7 + vec2<f32>(17.0, 3.1) + vec2<f32>(0.0, w.z * 0.3));
  var scratch: f32 = nA * nB;
  let scratchDet: f32 = valueNoise2D(w.xy * scratchSc * 1.7 + vec2<f32>(3.1, 7.7) + vec2<f32>(w.z * 0.4, 0.0));
  scratch = scratch * 0.7 + scratchDet * 0.3;

  let dWZero: f32 = step(length(modifiersBlock.modDamagedWeights), 0.0001);
  var lW: f32 = mix(modifiersBlock.modDamagedWeights.x, 0.45, dWZero);
  var mW: f32 = mix(modifiersBlock.modDamagedWeights.y, 0.28, dWZero);
  var sW: f32 = mix(modifiersBlock.modDamagedWeights.z, 0.15, dWZero);
  var cW: f32 = mix(modifiersBlock.modDamagedWeights.w, 0.38, dWZero);
  var sWc: f32 = mix(modifiersBlock.modDamagedCrack.z, 0.22, dWZero);

  let combined: f32 = nLarge * lW + nMed * mW + nSmall * sW + ridge * cW + ridge2 * cW * 0.5 + scratch * sWc;
  return clamp(combined, 0.0, 1.0);
}

fn damagedRidgeRaw(w: vec3<f32>) -> f32 {
  var p: vec2<f32> = w.xy * mossDefault(modifiersBlock.modDamagedNoise.x, 2.2) * mossDefault(modifiersBlock.modDamagedScales.w, 3.2) + vec2<f32>(19.1, 7.7) + vec2<f32>(w.z * 0.4, w.z * 0.25);
  let r: f32 = valueNoise2D(p);
  var ridge: f32 = 1.0 - abs(r * 2.0 - 1.0);
  let r2: f32 = valueNoise2D(p * 1.7 + vec2<f32>(7.7, 19.1));
  var ridge2: f32 = 1.0 - abs(r2 * 2.0 - 1.0);
  return ridge * ridge * 0.7 + ridge2 * ridge2 * 0.3;
}

fn damagedNoiseShape(w: vec3<f32>) -> f32 {
  let th: f32 = mossDefault(modifiersBlock.modDamagedNoise.y, 0.78);
  let fe: f32 = mossDefault(modifiersBlock.modDamagedNoise.z, 0.06);
  return smoothstep(th - fe, th + fe, damagedNoiseRaw(w));
}

fn damagedEnvMask(w: vec3<f32>, isFloor: f32) -> f32 {
  let eBase: f32 = mossDefault(modifiersBlock.modDamagedFinal.y, 0.25);
  let bot: f32 = 1.0 - smoothstep(0.0, 0.18, w.z) * 0.10;
  let top: f32 = 1.0 - smoothstep(frame.wallWorldHeight * 0.60869565, frame.wallWorldHeight, w.z) * 0.30;
  let wall: f32 = mix(eBase, 1.0, bot * top);
  return clamp(mix(wall, 1.0, step(0.5, isFloor)), 0.0, 1.0);
}

fn damagedFinalMask(w: vec3<f32>, mh: f32, ao: f32, ro: f32, isFloor: f32) -> f32 {
  let biome: f32 = damagedBiomeMask(w.xy);
  let has: f32 = step(0.001, biome);
  let noise: f32 = damagedNoiseShape(w);
  let env: f32 = damagedEnvMask(w, isFloor);
  let bBase: f32 = mossDefault(modifiersBlock.modDamagedFinal.x, 0.15);
  let eBase: f32 = mossDefault(modifiersBlock.modDamagedFinal.y, 0.25);
  let boost: f32 = mossDefault(modifiersBlock.modDamagedFinal.w, 1.35);
  let nW: f32 = mossDefault(modifiersBlock.modDamagedFinalWeights.x, 1.0);
  let eW: f32 = mossDefault(modifiersBlock.modDamagedFinalWeights.y, 0.35);
  let bW: f32 = mossDefault(modifiersBlock.modDamagedFinalWeights.w, 0.5);
  let envMod: f32 = mix(eBase, 1.0, env);
  let bioMod: f32 = mix(bBase, 1.0, biome);
  let sum: f32 = max(0.001, nW + eW + bW);
  var f: f32 = (noise * nW + envMod * eW + bioMod * bW) / sum;
  f = f * has;
  f = clamp(f * boost, 0.0, 1.0);
  let contrast: f32 = mossDefault(modifiersBlock.modDamagedGlobal.x, 1.35);
  f = clamp((f - 0.5) * contrast + 0.5, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  return f;
}

fn damagedHeightOffset(w: vec3<f32>, s: f32) -> f32 {
  let has: f32 = step(0.001, s);
  let dSZero: f32 = step(length(modifiersBlock.modDamagedSurface), 0.0001);
  var depth: f32 = mix(modifiersBlock.modDamagedSurface.x, -0.38, dSZero);
  var pitVar: f32 = mix(modifiersBlock.modDamagedSurface.y, 0.32, dSZero);
  var ridgeH: f32 = mix(modifiersBlock.modDamagedSurface.z, 0.18, dSZero);
  let raw: f32 = damagedNoiseRaw(w);
  let ridge: f32 = damagedRidgeRaw(w);
  let scratch: f32 = valueNoise2D(w.xy * mossDefault(modifiersBlock.modDamagedCrack.y, 8.5));
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
  let dMask: f32 = damagedNoiseShape(worldPos) * has * cell;
  let depth: f32 = mossDefault(modifiersBlock.modDamagedSurface.x, -0.38);
  let pomBoost: f32 = mossDefault(modifiersBlock.modDamagedGlobal2.z, 1.4);
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

  let mossAlbedo: vec3<f32> = mossAlbedoBase * (0.85 + 0.28 * mossNoiseVal);
  let mossStrength: f32 = mossMask * mossHas;
  *albedo = mix(*albedo, mossAlbedo, mossStrength * mossColorStrength);
  *rough = clamp(*rough + mossRoughAdd * mossStrength, 0.0, 1.0);
  *metal = mix(*metal, 0.0, mossStrength * 0.80);
  *ao = *ao * (1.0 - mossStrength * mossAoStr);
  let mossUp: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  let wallBias: f32 = mix(0.85, 0.55, step(0.5, isFloorSurface));
  *N = normalize(mix(*N, mossUp, mossStrength * mossNormalStr * wallBias));
  *matHeight = *matHeight + mossStrength * mossHeightAdd;

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

  // Damaged – full chaotic PBR from old GLSL
  let dCell: f32 = mod2.r * modsEnabled * inBounds;
  let dHas: f32 = step(0.001, dCell);
  let dMask: f32 = damagedFinalMask(worldPos, *matHeight, *ao, *rough, isFloorSurface);
  var dStr: f32 = dMask * dHas;
  let dHasS: f32 = step(0.001, dStr);
  dStr = dStr * dHasS;

  let dSZero: f32 = step(length(modifiersBlock.modDamagedSurface), 0.0001);
  let dS2Zero: f32 = step(length(modifiersBlock.modDamagedSurface2), 0.0001);
  var dDepth: f32 = mix(modifiersBlock.modDamagedSurface.x, -0.38, dSZero);
  var dNStr: f32 = mix(modifiersBlock.modDamagedSurface.w, 0.95, dSZero);
  var dRAdd: f32 = mix(modifiersBlock.modDamagedSurface2.y, 0.42, dS2Zero);
  var dRVar: f32 = mix(modifiersBlock.modDamagedSurface2.z, 0.28, dS2Zero);
  var dAo: f32 = mix(modifiersBlock.modDamagedSurface2.w, 0.38, dS2Zero);
  let chipSc: f32 = mix(modifiersBlock.modDamagedGlobal2.w, 12.0, step(length(modifiersBlock.modDamagedGlobal2), 0.0001));

  let rawD: f32 = damagedNoiseRaw(worldPos);
  let ridge: f32 = damagedRidgeRaw(worldPos);
  let fine: f32 = valueNoise2D(worldPos.xy * chipSc * 0.7);
  let hPit: f32 = dDepth + (rawD - 0.5) * 0.32 * 1.2 + fine * 0.12;
  let hOff: f32 = (hPit * 0.85 + ridge * 0.18 * 0.35) * dStr;
  *matHeight = *matHeight + hOff;

  let upV: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  var tang: vec3<f32> = normalize(cross(*N, upV + vec3<f32>(0.001, 0.002, 0.0)));
  let upDot: f32 = abs(dot(*N, upV));
  var tangAlt: vec3<f32> = cross(*N, vec3<f32>(1.0, 0.0, 0.0));
  tang = normalize(mix(tang, tangAlt, step(0.95, upDot)));
  let bit: vec3<f32> = normalize(cross(*N, tang));
  let nX: f32 = valueNoise2D(worldPos.xy * 12.0) * 2.0 - 1.0;
  let nY: f32 = valueNoise2D(worldPos.xy * 12.0 + vec2<f32>(5.7, 3.1)) * 2.0 - 1.0;
  let grad: vec3<f32> = tang * nX + bit * nY;
  let dN: vec3<f32> = normalize(*N - grad * dNStr * dStr * 0.65);
  *N = normalize(mix(*N, dN, clamp(dStr * dNStr, 0.0, 1.0)));

  let rNoise: f32 = rawD * 0.6 + fine * 0.3 + ridge * 0.2;
  let rAdd: f32 = dRAdd * dStr + dRVar * rNoise * dStr;
  *rough = clamp(*rough + rAdd * dHasS, 0.0, 1.0);

  var aoDark: f32 = 1.0 - dStr * dAo * (0.6 + 0.4 * rawD + 0.3 * ridge);
  aoDark = mix(1.0, aoDark, dHasS);
  *ao = clamp(*ao * aoDark, 0.0, 1.0);
  *metal = mix(*metal, *metal * 0.72, dStr * 0.45);
}

fn applyModifiersSimple(albedo: ptr<function, vec3<f32>>, N: ptr<function, vec3<f32>>, rough: ptr<function, f32>, metal: ptr<function, f32>, ao: ptr<function, f32>, worldPos: vec3<f32>) {
  var tmpH: f32 = 0.5;
  applyModifiers(albedo, N, rough, metal, ao, worldPos, &tmpH, 1.0);
}
`;
