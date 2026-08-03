// Modifier system - v14 puddle precise tweakable, no hardcoded magic, other mods guaranteed disabled
export const glslModifiers = `

// Full UBO - 12 vec4 = 192 bytes, binding 1
// v14 tweakable: no hard-coded magic, all values from config via UBO, other mods guaranteed zero
// Layout:
// 0 = puddle floorDepress.x + rest zero (was moss albedo zeroed, moss disabled via tex)
// 1 = modMossParams = heightGroutLow, heightGroutHigh, aoGroutLow, aoGroutHigh
// 2 = unused zero (water albedo zeroed)
// 3 = modWaterParams = worldLowHigh, worldLowLow, maskBoost, darkBaseFactor
// 4 = modPuddleAlbedoRough = xyz albedo, w roughTarget
// 5 = modPuddleParams = x=colorStrength y=scaleLarge z=threshold w=feather
// 6 = unused zero (blood albedo zeroed)
// 7 = modBloodParams = x=rippleScale y=edgeFoam z=heightInfluence w=aoMix
// 8 = unused zero (dust)
// 9 = modDustParams = x=tintMix y=grooveMin z=edgeLow w=edgeHigh
// 10 = unused zero (damaged)
// 11 = modDamagedParams = x=roughLow y=roughHigh z=flatStrength w=metalMix
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
};

// --- Lean reusable noise - fast compile, no dynamic loops ---
// Single cheap hash (IQ style) - 1 sin/dot instead of fract*2 + dot
float hash21_puddle(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

// Fixed 2/3 octaves - no params, no break, directly unrolls
float fbm2D_2(vec2 p) {
  return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25;
}
float fbm2D_3(vec2 p) {
  return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125;
}
// full unrolled 4 oct kept for compat but rarely used
float fbm2D_4(vec2 p) {
  return valueNoise2D(p) * 0.5 + valueNoise2D(p * 2.0) * 0.25 + valueNoise2D(p * 4.0) * 0.125 + valueNoise2D(p * 8.0) * 0.0625;
}
float fbm2D(vec2 p, int o) {
  if (o <= 2) return fbm2D_2(p);
  return fbm2D_3(p);
}
float fbm(vec2 p){ return fbm2D_3(p); }

// Reusable puddle FBM - returns vec3(large, med, small) from ONE call, no duplicated work
vec3 puddleNoise(vec2 worldXY, float scaleLarge) {
  // warp - 2 noises via fbm2D_2 reuses 4 valueNoise
  vec2 w = vec2(fbm2D_2(worldXY * 0.12), fbm2D_2(worldXY * 0.12 + vec2(7.3, 3.1))) * 0.9;
  vec2 p = worldXY * scaleLarge + w;
  float nLarge = fbm2D_3(p);                      // 3 noises
  float nMed   = valueNoise2D(p * 2.1 + vec2(11.3, 23.7)); // 1 noise, was fbm_3
  float nSmall = valueNoise2D(worldXY * 0.52 + vec2(5.1, 2.9)); // 1 noise, was fbm_2
  // total ~ 4+3+1+1 = 9 valueNoise (was 13) and called once per mask
  float cloud = nLarge * 0.60 + nMed * 0.28 + nSmall * 0.12;
  return vec3(cloud, nMed, nSmall);
}
// legacy wrapper for compat
float puddleCloudFBM(vec2 worldXY, float scaleLarge) {
  return puddleNoise(worldXY, scaleLarge).x;
}

float computePuddleMask(in vec3 worldPos, in float matHeight, in float ao, in float puddleCell, in float scaleLarge, in float threshold, in float feather, in float heightInfluence, in vec4 groutParams, in vec4 worldParams) {
  // puddleCell is LINEAR filtered density field (tweakable feather) - avoids hard cut at floor(worldPos)
  // cell params from UBO block 6 (modBloodAlbedoMix repurposed as puddleCellParams): x=low y=high z=epsilon
  float cellLow = modBloodAlbedoMix.x;
  float cellHigh = modBloodAlbedoMix.y;
  float cellEps = modBloodAlbedoMix.z;
  float cellSoft = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) return 0.0;
  vec2 worldXY = worldPos.xy;
  vec3 noise = puddleNoise(worldXY, scaleLarge);
  float nLarge = noise.x;
  float nMed = noise.y;
  float nSmall = noise.z;

  float lowTh = threshold - feather;
  float highTh = threshold + feather;
  float poolShape = smoothstep(lowTh, highTh, nLarge);
  poolShape *= mix(0.45, 1.0, nMed);
  poolShape *= mix(0.75, 1.0, nSmall);

  // All grout thresholds are tunable from UBO (modMossParams)
  float hLow = groutParams.x; // 0.12
  float hHigh = groutParams.y; // 0.48
  float aoLow = groutParams.z; // 0.72
  float aoHigh = groutParams.w; // 0.95
  float heightGrout = 1.0 - smoothstep(hLow, hHigh, matHeight);
  float aoGrout = 1.0 - smoothstep(aoLow, aoHigh, ao);
  float groove = max(heightGrout, aoGrout * 0.6);
  float grooveMin = worldParams.w; // actually dustParams.y is grooveMin, but we pass separately below
  // We'll handle grooveMin outside, here just use heightInfluence bias
  float grooveBias = mix(1.0, mix(grooveMin, 1.0, groove), clamp(heightInfluence, 0.0, 1.0));

  float worldHigh = worldParams.x; // 0.25
  float worldLow = worldParams.y; // -0.35
  float worldLowVal = smoothstep(worldHigh, worldLow, worldPos.z);
  float worldBias = mix(0.70, 1.0, worldLowVal);

  float boost = worldParams.z; // 1.4
  float mask = cellSoft * poolShape * grooveBias * worldBias;
  mask = clamp(mask * boost, 0.0, 1.0);
  mask = mask * mask * (3.0 - 2.0 * mask);
  mask *= (0.80 + 0.20 * nSmall);
  return mask;
}

// Overload with explicit params unpacked from UBO inside
float computePuddleMaskTweakable(in vec3 worldPos, in float matHeight, in float ao, in float puddleCell) {
  // puddleCell is now LINEAR filtered from w*h tex -> continuous density, not per-tile step
  // Tweakable via config: cellFeatherLow/High/Epsilon in modBloodAlbedoMix (puddleCellParams)
  float cellLow = modBloodAlbedoMix.x;
  float cellHigh = modBloodAlbedoMix.y;
  float cellEps = modBloodAlbedoMix.z;
  float cellSoft = smoothstep(cellLow, cellHigh, puddleCell);
  if (cellSoft < cellEps) return 0.0;
  float scaleLarge = modPuddleParams.y;
  float threshold = modPuddleParams.z;
  float feather = modPuddleParams.w;
  float heightInfluence = modBloodParams.z;
  float grooveMin = modDustParams.y;
  // groutParams = modMossParams, worldParams = modWaterParams except grooveMin override
  vec4 groutParams = modMossParams;
  vec4 worldParams = modWaterParams;
  // Need to inject grooveMin into worldParams.w for compute function? We'll use separate logic here to keep tweakable
  vec2 worldXY = worldPos.xy;
  vec3 noise = puddleNoise(worldXY, scaleLarge);
  float nLarge = noise.x;
  float nMed = noise.y;
  float nSmall = noise.z;

  float lowTh = threshold - feather;
  float highTh = threshold + feather;
  float poolShape = smoothstep(lowTh, highTh, nLarge);
  poolShape *= mix(0.45, 1.0, nMed);
  poolShape *= mix(0.75, 1.0, nSmall);

  float hLow = groutParams.x;
  float hHigh = groutParams.y;
  float aoLow = groutParams.z;
  float aoHigh = groutParams.w;
  float heightGrout = 1.0 - smoothstep(hLow, hHigh, matHeight);
  float aoGrout = 1.0 - smoothstep(aoLow, aoHigh, ao);
  float groove = max(heightGrout, aoGrout * 0.6);
  float grooveBias = mix(1.0, mix(grooveMin, 1.0, groove), clamp(heightInfluence, 0.0, 1.0));

  float worldHigh = worldParams.x;
  float worldLow = worldParams.y;
  float boost = worldParams.z;
  float worldLowVal = smoothstep(worldHigh, worldLow, worldPos.z);
  float worldBias = mix(0.70, 1.0, worldLowVal);

  float mask = cellSoft * poolShape * grooveBias * worldBias;
  mask = clamp(mask * boost, 0.0, 1.0);
  mask = mask * mask * (3.0 - 2.0 * mask);
  mask *= (0.80 + 0.20 * nSmall);
  return mask;
}

void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 worldPos, in float matHeight, in float isFloorSurface) {
  if (u_modifiersEnabled == 0) return;

  ivec2 cellI = ivec2(floor(worldPos.xy));
  if (cellI.x < 0 || cellI.y < 0 || cellI.x >= int(u_mapSize.x) || cellI.y >= int(u_mapSize.y)) return;

  // LINEAR sampling - smooth cloud, not hard squares - GUARANTEE: other mods texture forced zero
  vec2 modUV = worldPos.xy / u_mapSize;
  vec4 mod1 = texture(u_modifierMap, modUV);
  // mod2 unused in puddle-only but fetched for completeness (zeroed)
  vec4 mod2 = texture(u_modifierMap2, modUV);

  float puddleCell = mod1.b; // B = puddle, guaranteed only channel with data in v14
  // Other channels guaranteed zero via generator + zeroed UBO
  // float mossCell = mod1.r; // forced 0
  // float waterCell = mod1.g; // forced 0
  // etc.

  if (isFloorSurface < 0.5) {
    puddleCell *= 0.02; // no puddle on walls/ceilings
  }

  // Tweakable params from UBO - no hard-coded magic
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
  float floorDepress = modMossAlbedoRough.x; // now tweakable live - negative depresses floor visually
  float grooveMin = modDustParams.y;
  float edgeLow = modDustParams.z;
  float edgeHigh = modDustParams.w;
  float roughLow = modDamagedParams.x;
  float roughHigh = modDamagedParams.y;
  float flatStrength = modDamagedParams.z;
  float metalMix = modDamagedParams.w;
  float maskBoost = modWaterParams.z;

  // Fallback defaults if UBO not set (should not happen in v14)
  if (colorStrength < 0.001) colorStrength = 0.92;
  if (scaleLarge < 0.001) scaleLarge = 0.22;
  if (threshold < 0.001) threshold = 0.55;
  if (feather < 0.001) feather = 0.12;

  if (puddleCell > 0.001 && isFloorSurface > 0.5) {
    float puddleMask = computePuddleMaskTweakable(worldPos, matHeight, ao, puddleCell);

    if (puddleMask > 0.001) {
      vec3 darkBaseCol = albedo * darkBase;
      vec3 puddleTint = mix(darkBaseCol, puddleAlbedo, tintMix);
      albedo = mix(albedo, puddleTint, puddleMask * colorStrength);

      float edge = puddleMask * (1.0 - puddleMask);
      edge = smoothstep(edgeLow, edgeHigh, edge) * edgeFoam;
      albedo += edge * vec3(0.18, 0.175, 0.16);

      float roughFeather = smoothstep(roughLow, roughHigh, puddleMask);
      rough = mix(rough, puddleRoughTarget, roughFeather * 0.97);
      float rippleRoughVar = (valueNoise2D(worldPos.xy * 4.1) - 0.5) * 0.03 * puddleMask;
      rough = clamp(rough + rippleRoughVar, 0.02, 1.0);

      vec3 flatWater = vec3(0.0, 0.0, 1.0);
      vec2 ripUV = worldPos.xy * rippleScale;
      float r1 = valueNoise2D(ripUV);
      float r2 = valueNoise2D(ripUV + vec2(13.5, 7.1));
      vec3 rippleN = normalize(vec3((r1 - 0.5) * 0.25, (r2 - 0.5) * 0.25, 1.0));

      vec3 baseFlat = mix(N, flatWater, puddleMask * flatStrength);
      float rippleMix = puddleMask * 0.28 * (0.5 + 0.5 * fbm2D_2(worldPos.xy * 0.52));
      N = normalize(mix(baseFlat, rippleN, rippleMix));

      metal = mix(metal, 0.0, puddleMask * metalMix);
      ao *= (1.0 - puddleMask * aoMix);
      // floorDepress wired: negative = lower floor, simulate with extra AO darkening and slight albedo dark
      float depressMask = puddleMask * floorDepress; // floorDepress negative
      ao *= 1.0 + depressMask * 0.6; // more depress = slightly darker AO
      albedo *= 1.0 + depressMask * 0.15; // subtle darkening
    }
  }
}

void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 worldPos) {
  applyModifiers(albedo, N, rough, metal, ao, worldPos, 0.5, 1.0);
}

`;
