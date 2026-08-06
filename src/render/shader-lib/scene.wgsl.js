export const wgslScene = `
// Scene helpers – shading walls/floors/ceils, debug viz

fn getGridColor(world: vec2<f32>, isCeil: bool) -> vec3<f32> {
  let fx: f32 = fract(world).x;
  let fy: f32 = fract(world).y;
  let high: f32 = select(0.25, 1.0, fx > 0.97 || fy > 0.97) * 0.9;
  if (isCeil) {
    return vec3<f32>(0.0, 0.0, high);
  } else {
    return vec3<f32>(0.0, high, 0.0);
  }
}

fn debugFinalPuddleMask(worldPos: vec3<f32>, matHeight: f32, ao: f32) -> vec3<f32> {
  let modUV: vec2<f32> = worldPos.xy / frame.mapSize;
  let mod1: vec4<f32> = loadModifierMap(modUV);
  let puddleCell: f32 = mod1.b;
  let mask: f32 = computePuddleMaskTweakable(worldPos, matHeight, ao, puddleCell);
  let edge: f32 = mask * (1.0 - mask) * 5.0;
  var inside: vec3<f32> = vec3<f32>(0.10, 0.55, 1.0) * mask * 1.8;
  var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.25, 0.85) * edge;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  var col: vec3<f32> = bg + inside + edgeCol;
  let high: f32 = step(0.5, mask);
  col = mix(col, vec3<f32>(0.20, 0.75, 1.0), high * 0.6);
  return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugFinalMossMask(worldPos: vec3<f32>, matHeight: f32, ao: f32) -> vec3<f32> {
  let isFloor: f32 = step(worldPos.z, 0.6);
  let rough: f32 = 0.7;
  let finalM: f32 = mossFinalMask(worldPos, matHeight, ao, rough, isFloor);
  let edge: f32 = finalM * (1.0 - finalM) * 4.0;
  var inside: vec3<f32> = vec3<f32>(0.18, 0.68, 0.18) * finalM * 1.6;
  var edgeCol: vec3<f32> = vec3<f32>(0.35, 1.0, 0.35) * edge * 0.9;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + inside + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugMossNoiseMask(worldPos: vec3<f32>) -> vec3<f32> {
  let m: f32 = mossNoiseShape(worldPos);
  let raw: f32 = mossNoiseRaw(worldPos);
  let edge: f32 = m * (1.0 - m) * 3.5;
  var inside: vec3<f32> = vec3<f32>(0.18, 0.68, 0.18) * m * (0.85 + 0.35 * raw) * 1.6;
  var edgeCol: vec3<f32> = vec3<f32>(0.40, 1.0, 0.42) * edge * 0.85;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + inside + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugMossEnvMask(worldPos: vec3<f32>, isFloorSurface: f32) -> vec3<f32> {
  let e: f32 = mossEnvMask(worldPos, isFloorSurface);
  let edge: f32 = e * (1.0 - e) * 2.5;
  var inside: vec3<f32> = vec3<f32>(0.85, 0.75, 0.15) * e * 1.2;
  var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.95, 0.45) * edge * 0.6;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + inside + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugMossMaterialMask(matHeight: f32, ao: f32, rough: f32) -> vec3<f32> {
  let c: vec3<f32> = debugMossMaterialCol(matHeight, ao, rough);
  let m: f32 = mossMaterialMask(matHeight, ao, rough);
  let edge: f32 = m * (1.0 - m) * 3.0;
  var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.85, 0.35) * edge * 0.55;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + c + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugMossCombinedMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloorSurface: f32) -> vec3<f32> {
  let c: vec3<f32> = debugMossCombinedCol(worldPos, matHeight, ao, rough, isFloorSurface);
  let f: f32 = mossFinalMask(worldPos, matHeight, ao, rough, isFloorSurface);
  let edge: f32 = f * (1.0 - f) * 4.0;
  var edgeCol: vec3<f32> = vec3<f32>(0.35, 1.0, 0.35) * edge * 0.9;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + c + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugDamagedMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloor: f32) -> vec3<f32> {
  let f: f32 = damagedFinalMask(worldPos, matHeight, ao, rough, isFloor);
  let edge: f32 = f * (1.0 - f) * 5.0;
  var inside: vec3<f32> = vec3<f32>(0.85, 0.22, 0.18) * f * 2.2;
  var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.55, 0.25) * edge * 0.95;
  var ridge: vec3<f32> = vec3<f32>(1.0, 0.85, 0.2) * damagedRidgeRaw(worldPos) * f * 0.6;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + inside + edgeCol + ridge, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugDamagedNoiseMask(worldPos: vec3<f32>) -> vec3<f32> {
  let m: f32 = damagedNoiseShape(worldPos);
  let raw: f32 = damagedNoiseRaw(worldPos);
  let ridge: f32 = damagedRidgeRaw(worldPos);
  let edge: f32 = m * (1.0 - m) * 3.5;
  var inside: vec3<f32> = vec3<f32>(0.85, 0.22, 0.18) * m * (0.5 + 0.7 * raw + 0.4 * ridge) * 1.8;
  var edgeCol: vec3<f32> = vec3<f32>(1.0, 0.65, 0.25) * edge * 0.85 + vec3<f32>(1.0, 0.9, 0.2) * ridge * m * 0.5;
  var bg: vec3<f32> = vec3<f32>(0.02, 0.02, 0.03);
  return clamp(bg + inside + edgeCol, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Compact 3x5 diagnostic font: 0-9, A, T, M. Each construction tile shows
// architecture, room type, and the material actually used on that surface.
const DEBUG_GLYPHS: array<u32, 13> = array<u32, 13>(
  31599u, 11415u, 29671u, 29647u, 23497u,
  31183u, 31215u, 29257u, 31727u, 31695u,
  11245u, 29842u, 24557u
);

fn debugGlyph(code: u32, uv: vec2<f32>) -> f32 {
  if (code >= 13u || uv.x < 0.0 || uv.x >= 1.0 || uv.y < 0.0 || uv.y >= 1.0) { return 0.0; }
  let column: u32 = min(2u, u32(floor(uv.x * 3.0)));
  let row: u32 = min(4u, u32(floor((1.0 - uv.y) * 5.0)));
  let bit: u32 = (4u - row) * 3u + (2u - column);
  return f32((DEBUG_GLYPHS[code] >> bit) & 1u);
}

fn debugTextLine(uv: vec2<f32>, label: u32, value: u32, rowIndex: u32) -> f32 {
  let lineTop: f32 = 0.84 - f32(rowIndex) * 0.235;
  let local: vec2<f32> = vec2<f32>((uv.x - 0.14) / 0.72, (uv.y - (lineTop - 0.17)) / 0.17);
  if (local.x < 0.0 || local.x >= 1.0 || local.y < 0.0 || local.y >= 1.0) { return 0.0; }
  let slot: u32 = min(2u, u32(floor(local.x * 3.0)));
  let slotUV: vec2<f32> = vec2<f32>(fract(local.x * 3.0) * 1.28 - 0.14, local.y * 1.18 - 0.09);
  var code: u32 = label;
  if (slot == 1u) { code = select(99u, min(9u, value / 10u), value >= 10u); }
  if (slot == 2u) { code = value % 10u; }
  return debugGlyph(code, slotUV);
}

fn debugConstructionIds(cell: vec2<i32>) -> vec2<u32> {
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) {
    return vec2<u32>(0u);
  }
  let encoded: vec4<f32> = textureLoad(matMapTex, cell, 0);
  return vec2<u32>(u32(round(encoded.b * 255.0)), u32(round(encoded.a * 255.0)));
}

fn debugConstructionSurface(uvRaw: vec2<f32>, cell: vec2<i32>, materialId: u32, surfaceKind: u32) -> vec3<f32> {
  let uv: vec2<f32> = clamp(uvRaw, vec2<f32>(0.0), vec2<f32>(0.9999));
  let ids: vec2<u32> = debugConstructionIds(cell);
  var base: vec3<f32> = vec3<f32>(0.34, 0.085, 0.065); // wall
  if (surfaceKind == 1u) { base = vec3<f32>(0.055, 0.27, 0.13); } // floor
  if (surfaceKind == 2u) { base = vec3<f32>(0.065, 0.15, 0.34); } // ceiling
  let edgeDistance: f32 = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let gridLine: f32 = 1.0 - smoothstep(0.025, 0.055, edgeDistance);
  let panel: f32 = step(0.085, uv.x) * step(uv.x, 0.915) * step(0.085, uv.y) * step(uv.y, 0.91);
  var color: vec3<f32> = mix(base, vec3<f32>(0.78, 0.84, 0.76), gridLine);
  color = mix(color, vec3<f32>(0.012, 0.016, 0.017), panel * 0.88);
  let aInk: f32 = debugTextLine(uv, 10u, ids.x, 0u);
  let tInk: f32 = debugTextLine(uv, 11u, ids.y, 1u);
  let mInk: f32 = debugTextLine(uv, 12u, materialId, 2u);
  color = mix(color, vec3<f32>(1.0, 0.67, 0.22), aInk);
  color = mix(color, vec3<f32>(0.24, 0.86, 0.91), tInk);
  color = mix(color, vec3<f32>(0.92, 0.94, 0.88), mInk);
  return color;
}

fn debugDamagedPlacementMask(worldPos: vec3<f32>) -> vec3<f32> {
  let biome: f32 = damagedBiomeMask(worldPos.xy);
  let presence: f32 = smoothstep(0.001, 0.02, biome);
  // Placement normally lives in a much lower range than a final 0..1 mask
  // (corridors often sit around .03-.12). Use a perceptual false-colour ramp
  // so those useful values do not collapse into nearly-black blue.
  var ramp: vec3<f32>;
  if (biome < 0.12) {
    ramp = mix(vec3<f32>(0.04, 0.22, 1.0), vec3<f32>(0.0, 0.92, 1.0), biome / 0.12);
  } else if (biome < 0.35) {
    ramp = mix(vec3<f32>(0.0, 0.92, 1.0), vec3<f32>(1.0, 0.88, 0.04), (biome - 0.12) / 0.23);
  } else {
    ramp = mix(vec3<f32>(1.0, 0.88, 0.04), vec3<f32>(1.0, 0.08, 0.015), smoothstep(0.35, 0.85, biome));
  }
  let displayGain: f32 = pow(clamp(biome, 0.0, 1.0), 0.32);
  let field: vec3<f32> = ramp * (0.52 + displayGain * 0.48) * presence;
  return clamp(vec3<f32>(0.012, 0.012, 0.018) + field, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugDamagedFactorsMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloor: f32) -> vec3<f32> {
  let noise: f32 = damagedNoiseShape(worldPos);
  let placement: f32 = damagedBiomeMask(worldPos.xy);
  let material: f32 = damagedMaterialMask(matHeight, ao, rough);
  let environment: f32 = damagedEnvMask(worldPos, isFloor);
  let placementDisplay: f32 = pow(clamp(placement, 0.0, 1.0), 0.40);
  // R = procedural 3D noise, G = display-gamma generated room/wall placement,
  // B = material eligibility modulated by floor/wall environment.
  return clamp(vec3<f32>(noise, placementDisplay, material * environment), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugDamagedHeightMask(worldPos: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloor: f32) -> vec3<f32> {
  let sample: DamagedSurfaceSample = damagedSurfaceSample(worldPos, matHeight, ao, rough, isFloor);
  let mask: f32 = sample.mask;
  let height: f32 = sample.height;
  let cavity: f32 = clamp(-height * 4.0, 0.0, 1.0);
  let raised: f32 = clamp(height * 8.0, 0.0, 1.0);
  let edge: f32 = clamp(4.0 * mask * (1.0 - mask), 0.0, 1.0);
  return clamp(vec3<f32>(raised + edge * 0.55, edge * 0.65, cavity), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn debugDamagedNormalMask(worldPos: vec3<f32>, geomN: vec3<f32>, matHeight: f32, ao: f32, rough: f32, isFloor: f32) -> vec3<f32> {
  let sample: DamagedSurfaceSample = damagedSurfaceSample(worldPos, matHeight, ao, rough, isFloor);
  let mask: f32 = sample.mask;
  let reliefN: vec3<f32> = damagedReliefNormal(worldPos, geomN, matHeight, ao, rough, isFloor, mask, sample.height);
  let encoded: vec3<f32> = reliefN * 0.5 + vec3<f32>(0.5);
  return mix(vec3<f32>(0.015, 0.015, 0.02), encoded, smoothstep(0.001, 0.08, mask));
}

struct HorizontalShadeResult {
  color: vec3<f32>,
  dist: f32,
  normal: vec3<f32>,
  reflectionWeight: f32,
}

fn shadeHorizontalCell(horizWorld: vec2<f32>, horizUV: vec2<f32>, matId: f32, count: f32, ray: vec2<f32>, eyeZ: f32, heightAtRay: f32, isCeil: bool) -> HorizontalShadeResult {
  if (frame.gridDebug != 0) {
    let kind: u32 = select(1u, 2u, isCeil);
    let normal: vec3<f32> = select(vec3<f32>(0.0,0.0,1.0), vec3<f32>(0.0,0.0,-1.0), isCeil);
    return HorizontalShadeResult(debugConstructionSurface(horizUV, vec2<i32>(floor(horizWorld)), u32(round(matId)), kind), distance(horizWorld, frame.playerPos), normal, 0.0);
  }
  let hostLayer: i32 = clampLayer(matId, count);
  var layer: i32 = hostLayer;
  // Base floors are a strict z=0 plane. Only structural features alter macro
  // geometry; material height remains shading/POM data, not world elevation.
  let hostHeight: f32 = select(0.0, heightAtRay, isCeil);
  let featureGeom: FloorFeatureGeometry = resolveFeatureFloor(horizWorld, hostHeight);
  let isChannel: bool = !isCeil && featureKind(featureGeom.word) == FEATURE_CHANNEL;
  let isLiquid: bool = isChannel && featureGeom.liquidMask > 0.5;
  if (isChannel && featureGeom.bankT > featureUniforms.rayIntersection.w && !isLiquid) {
    layer = clampLayer(featureUniforms.materials.y, count);
  }
  var uv: vec2<f32> = horizUV;
  let pomEn: f32 = f32(frame.pomEnabled);
  let worldPosForPOM: vec3<f32> = vec3<f32>(horizWorld, heightAtRay);
  let isFloorSurfaceForPOM: f32 = 1.0;

  // POM with damaged integration
  let viewDirCeil: vec3<f32> = normalize(vec3<f32>(-ray, 0.5));
  let poCeil: vec2<f32> = pomOffsetArrayDamaged(ceilHeight, uv, layer, viewDirCeil, frame.pomCeil, frame.pomSteps, worldPosForPOM, isFloorSurfaceForPOM);
  let viewDirFloor: vec3<f32> = normalize(vec3<f32>(-ray, 0.8));
  let poFloor: vec2<f32> = pomOffsetArrayDamaged(floorHeight, uv, layer, viewDirFloor, frame.pomFloor, frame.pomSteps, worldPosForPOM, isFloorSurfaceForPOM);
  var po: vec2<f32> = mix(poFloor, poCeil, f32(isCeil));
  uv = mix(uv, uv + po, pomEn);

  var albedoRaw: vec3<f32>;
  var normalRaw: vec3<f32>;
  var heightVal: f32;
  var rma: vec4<f32>;
  var Nw: vec3<f32>;
  if (isCeil) {
    albedoRaw = sampleCeilAlbedo(layer, uv);
    normalRaw = sampleCeilNormalRaw(layer, uv);
    let nt: vec3<f32> = decodeNormal(normalRaw);
    Nw = normalize(vec3<f32>(nt.x, -nt.y, -nt.z));
    heightVal = sampleCeilHeight(layer, uv);
    rma = sampleCeilRMA(layer, uv);
  } else {
    albedoRaw = sampleFloorAlbedo(layer, uv);
    normalRaw = sampleFloorNormalRaw(layer, uv);
    let nt: vec3<f32> = decodeNormal(normalRaw);
    Nw = normalize(vec3<f32>(nt.xy, nt.z));
    heightVal = sampleFloorHeight(layer, uv);
    rma = sampleFloorRMA(layer, uv);
  }

  var ao: f32 = rma.a;
  let emissiveAlbedoMul: f32 = select(0.8, frame.pbrEmissiveAlbedoMul, frame.pbrEmissiveAlbedoMul > 0.0);
  let emissiveStrength: f32 = select(2.5, frame.pbrEmissiveStrength, frame.pbrEmissiveStrength > 0.0);
  var emissive: vec3<f32> = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;

  let surfMul: f32 = select(select(0.7, frame.renderFloorMul, frame.renderFloorMul > 0.0), select(0.8, frame.renderCeilMul, frame.renderCeilMul > 0.0), isCeil);
  var albedo: vec3<f32> = albedoRaw * surfMul;
  var N: vec3<f32> = Nw;
  var reflectionNormal: vec3<f32> = N;

  if (isCeil) {
    applyCeilBaseboard(horizWorld, &N, &ao, &albedo, &rma);
    applyGridCeil(horizWorld, &N, &ao, &albedo, &rma);
  } else if (!isChannel) {
    applyFloorBaseboard(horizWorld, &N, &ao, &albedo, &rma);
    applyGridFloor(horizWorld, &N, &ao, &albedo, &rma);
  }

  if (isChannel && !isLiquid) {
    // Macro bank normal bends the lining normal without introducing a mesh path.
    N = normalize(N + featureGeom.macroNormal - vec3<f32>(0.0,0.0,1.0));
    // Blend lining back toward the original host so different room floors remain legible.
    let hostAlbedo: vec3<f32> = sampleFloorAlbedo(hostLayer, uv) * surfMul;
    let liningStrength: f32 = clamp(featureUniforms.system.y * featureGeom.bankT, 0.0, 1.0);
    albedo = mix(hostAlbedo, albedo, liningStrength);
  }

  let isFloorSurface: f32 = 1.0;
  var roughTmp: f32 = rma.r;
  var metalTmp: f32 = rma.g;
  // Capture the cosmetic puddle coverage before applyModifiers mutates AO and
  // the surface normal. The modifier remains the sole owner of its established
  // albedo/roughness/ripple look; this value is only forwarded to the GBuffer.
  var cosmeticPuddleMask: f32 = 0.0;
  if (!isCeil && !isChannel && frame.modifiersEnabled != 0) {
    let modUV: vec2<f32> = horizWorld / frame.mapSize;
    let puddleCell: f32 = loadModifierMap(modUV).b;
    cosmeticPuddleMask = computePuddleMaskTweakable(vec3<f32>(horizWorld, heightAtRay), heightVal, ao, puddleCell);
  }
  if (!isLiquid) {
    applyModifiers(&albedo, &N, &roughTmp, &metalTmp, &ao, vec3<f32>(horizWorld, heightAtRay), &heightVal, isFloorSurface);
  }
  rma.r = roughTmp;
  rma.g = metalTmp;

  var reflectionWeight: f32 = 0.0;
  if (isLiquid) {
    let water: WaterSurface = evaluateWaterSurface(vec3<f32>(horizWorld, heightAtRay), featureGeom.flowDir, 1.0, featureGeom.edgeFactor);
    // Opaque-raycast approximation of shallow water: retain a restrained view
    // of the recessed lining so depth reads without requiring transparency.
    let liningLayer: i32 = clampLayer(featureUniforms.materials.y, count);
    let submergedLining: vec3<f32> = sampleFloorAlbedo(liningLayer, uv) * surfMul * featureUniforms.waterAppearance.y;
    albedo = mix(submergedLining, water.albedo, featureUniforms.waterAppearance.z);
    N = water.normal;
    reflectionNormal = normalize(mix(vec3<f32>(0.0, 0.0, 1.0), water.normal, clamp(featureUniforms.waterOptics.x, 0.0, 1.0)));
    rma.r = water.roughness;
    rma.g = 0.0;
    ao = 1.0;
    emissive = vec3<f32>(0.0);
    reflectionWeight = water.reflectionWeight;
  } else if (cosmeticPuddleMask > 0.001) {
    reflectionWeight = cosmeticPuddleMask;
  }
  if (!isLiquid) { reflectionNormal = N; }

  let worldPos: vec3<f32> = vec3<f32>(horizWorld, heightAtRay);
  let viewDir: vec3<f32> = normalize(vec3<f32>(frame.playerPos, eyeZ) - worldPos);
  let dist: f32 = distance(horizWorld, frame.playerPos);
  let col: vec3<f32> = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
  return HorizontalShadeResult(col, dist, reflectionNormal, reflectionWeight);
}

fn shadeFloorCell(floorWorld: vec2<f32>, floorUV: vec2<f32>, matId: f32, fc: f32, ray: vec2<f32>, eyeZ: f32, floorH_atRay: f32) -> HorizontalShadeResult {
  return shadeHorizontalCell(floorWorld, floorUV, matId, fc, ray, eyeZ, floorH_atRay, false);
}
fn shadeCeilCell(ceilWorld: vec2<f32>, ceilUV: vec2<f32>, matId: f32, cc: f32, ray: vec2<f32>, eyeZ: f32, ceilH_atRay: f32) -> HorizontalShadeResult {
  return shadeHorizontalCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, ceilH_atRay, true);
}

fn shadeWallCell(wallU: f32, wallV: f32, matId: f32, wc: f32, side: i32, stepDir: vec2<i32>, ray: vec2<f32>, hitPos: vec2<f32>, wallCell: vec2<i32>, hasCornerRound: bool, cornerNormal: vec3<f32>) -> vec3<f32> {
  if (frame.gridDebug != 0) {
    return debugConstructionSurface(vec2<f32>(wallU, 1.0 - wallV), wallCell, u32(round(matId)), 0u);
  }
  let layer: i32 = clampLayer(matId, wc);
  var uv: vec2<f32> = vec2<f32>(wallU, wallV);
  let bitangent: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
  let sideEq0: f32 = step(f32(side), 0.5);
  let rayXpos: f32 = step(0.0, ray.x);
  let rayYneg: f32 = step(ray.y, 0.0);
  var NgeomFlat0: vec3<f32> = vec3<f32>(f32(-stepDir.x), 0.0, 0.0);
  var NgeomFlat1: vec3<f32> = vec3<f32>(0.0, f32(-stepDir.y), 0.0);
  var NgeomFlat: vec3<f32> = mix(NgeomFlat1, NgeomFlat0, sideEq0);
  var tangentFlat0: vec3<f32> = vec3<f32>(0.0, mix(-1.0, 1.0, rayXpos), 0.0);
  var tangentFlat1: vec3<f32> = vec3<f32>(mix(1.0, -1.0, rayYneg), 0.0, 0.0);
  var tangentFlat: vec3<f32> = mix(tangentFlat1, tangentFlat0, sideEq0);
  var Ngeom: vec3<f32> = NgeomFlat;
  var tangent: vec3<f32> = tangentFlat;

  let cornerEn: f32 = f32(hasCornerRound);
  let cornerMode0: f32 = step(f32(frame.cornerMode), 0.5);
  let left: f32 = step(wallU, 0.5);
  var n2_0a: vec3<f32> = vec3<f32>(0.0, mix(1.0, -1.0, left), 0.0);
  var n2_1a: vec3<f32> = vec3<f32>(mix(-1.0, 1.0, left), 0.0, 0.0);
  var n2: vec3<f32> = mix(n2_1a, n2_0a, sideEq0);
  var cornerGeom0: vec3<f32> = normalize(NgeomFlat + n2);
  var cornerGeom: vec3<f32> = mix(cornerNormal, cornerGeom0, cornerMode0);
  let nMix: f32 = select(0.92, frame.cornerNormalMix, frame.cornerNormalMix > 0.0);
  var NgeomMixed: vec3<f32> = normalize(mix(NgeomFlat, cornerGeom, clamp(nMix, 0.0, 1.0)));
  Ngeom = mix(NgeomFlat, NgeomMixed, cornerEn);

  let dotTN: f32 = dot(tangentFlat, Ngeom);
  var tOrtho: vec3<f32> = tangentFlat - dotTN * Ngeom;
  let tiny: f32 = step(dot(tOrtho, tOrtho), 0.000001);
  var tOrthoFallback: vec3<f32> = vec3<f32>(-Ngeom.y, Ngeom.x, 0.0);
  let flip: f32 = step(dot(tOrthoFallback, tangentFlat), 0.0);
  var tOrthoFlipped: vec3<f32> = mix(tOrthoFallback, -tOrthoFallback, flip);
  tOrtho = mix(tOrtho, tOrthoFlipped, tiny);
  var tangentOrtho: vec3<f32> = normalize(tOrtho);
  tangent = mix(tangentFlat, tangentOrtho, cornerEn);

  let featureWord: u32 = loadFeatureCell(wallCell);
  let hasGrille: bool = featureUniforms.system.x > 0.5 && isFeatureWallFace(featureWord, FEATURE_GRILLE, side, stepDir);
  // The channel-facing wall continues down to the waterline so the water meets
  // the grille instead of leaving a dry strip at z=0. Restrict that extension
  // to the channel opening; the rest of the host wall keeps its normal base.
  let grilleFloor: f32 = -featureUniforms.channel.y + featureUniforms.channel.w;
  let insideChannelOpening: bool = abs(wallU - 0.5) <= featureUniforms.channel.x * 0.5;
  let extendsToWater: bool = hasGrille && insideChannelOpening;
  let wallFloor: f32 = select(0.0, grilleFloor, extendsToWater);
  let worldPos: vec3<f32> = vec3<f32>(hitPos.x, hitPos.y, mix(frame.wallWorldHeight, wallFloor, wallV));
  // Preserve the host masonry scale above z=0. Mirror the small submerged
  // continuation instead of stretching one texel row down the wall skirt.
  let hostVRaw: f32 = (frame.wallWorldHeight - worldPos.z) / max(frame.wallWorldHeight, 0.0001);
  let hostV: f32 = clamp(select(hostVRaw, 2.0 - hostVRaw, hostVRaw > 1.0), 0.0, 1.0);
  uv.y = hostV;
  let viewDir: vec3<f32> = normalize(vec3<f32>(frame.playerPos, frame.playerHeight) - worldPos);
  let viewTS: vec3<f32> = vec3<f32>(dot(viewDir, tangent), dot(viewDir, bitangent), dot(viewDir, Ngeom));
  let pomEn: f32 = f32(frame.pomEnabled);
  let isFloorSurface: f32 = 0.0;
  let fixtureLayer: i32 = clampLayer(featureUniforms.materials.x, wc);
  var poWall: vec2<f32> = pomOffsetArrayDamaged(wallHeight, uv, layer, viewTS, frame.pomWall, frame.pomSteps, worldPos, isFloorSurface);
  if (hasGrille) {
    poWall = pomOffsetWallComposite(uv, layer, fixtureLayer, viewTS, max(frame.pomWall, featureUniforms.system.w), frame.pomSteps);
  }
  var uvPOM: vec2<f32> = mix(uv, uv + poWall, pomEn);

  var albedoRaw: vec3<f32> = sampleWallAlbedo(layer, uvPOM);
  var normalRaw: vec3<f32> = sampleWallNormalRaw(layer, uvPOM);
  var normalTSw: vec3<f32> = decodeNormal(normalRaw);
  var heightVal: f32 = sampleWallHeight(layer, uvPOM);
  var rmaW: vec4<f32> = sampleWallRMA(layer, uvPOM);
  if (hasGrille) {
    let fixtureAlbedo: vec4<f32> = sampleWallAlbedoRGBA(fixtureLayer, uvPOM);
    let fixtureCoverage: f32 = fixtureAlbedo.a;
    let fixtureNormal: vec3<f32> = decodeNormal(sampleWallNormalRaw(fixtureLayer, uvPOM));
    let fixtureHeight: f32 = sampleWallHeight(fixtureLayer, uvPOM);
    let fixtureRMA: vec4<f32> = sampleWallRMA(fixtureLayer, uvPOM);
    albedoRaw = mix(albedoRaw, fixtureAlbedo.rgb, fixtureCoverage);
    normalTSw = normalize(mix(normalTSw, fixtureNormal, fixtureCoverage));
    heightVal = mix(heightVal, fixtureHeight, fixtureCoverage);
    rmaW = mix(rmaW, fixtureRMA, fixtureCoverage);
  }

  let emissiveAlbedoMul: f32 = select(0.8, frame.pbrEmissiveAlbedoMul, frame.pbrEmissiveAlbedoMul > 0.0);
  let emissiveStrength: f32 = select(2.5, frame.pbrEmissiveStrength, frame.pbrEmissiveStrength > 0.0);
  var emissiveW: vec3<f32> = albedoRaw * emissiveAlbedoMul * rmaW.b * emissiveStrength;
  var Nw: vec3<f32> = normalize(tangent * normalTSw.x + bitangent * normalTSw.y + Ngeom * normalTSw.z);

  let albBoost: f32 = select(0.05, frame.cornerAlbedoBoost, frame.cornerAlbedoBoost >= 0.0);
  let roughMul: f32 = select(0.82, frame.cornerRoughMul, frame.cornerRoughMul > 0.0);
  let aoMul: f32 = select(0.96, frame.cornerAoMul, frame.cornerAoMul > 0.0);
  var albedoCorner: vec3<f32> = albedoRaw + vec3<f32>(albBoost);
  albedoRaw = mix(albedoRaw, albedoCorner, cornerEn);
  var rmaRoughCorner: f32 = rmaW.r * roughMul;
  rmaW.r = mix(rmaW.r, rmaRoughCorner, cornerEn);
  var rmaAoCorner: f32 = rmaW.a * aoMul;
  rmaW.a = mix(rmaW.a, rmaAoCorner, cornerEn);

  applyWallFloorTrim(hostV, Ngeom, &Nw, &albedoRaw, &rmaW);
  applyWallCeilTrim(hostV, Ngeom, &Nw, &albedoRaw, &rmaW);
  let noCorner: f32 = 1.0 - cornerEn;
  let vertEn: f32 = noCorner * f32(frame.chamferEnabled);
  var NwBefore: vec3<f32> = Nw;
  var albedoBefore: vec3<f32> = albedoRaw;
  var rmaBefore: vec4<f32> = rmaW;
  applyWallVerticalEdge(wallU, side, Ngeom, &Nw, &albedoRaw, &rmaW);
  Nw = mix(NwBefore, Nw, vertEn);
  albedoRaw = mix(albedoBefore, albedoRaw, vertEn);
  rmaW = mix(rmaBefore, rmaW, vertEn);

  var roughTmpW: f32 = rmaW.r;
  var metalTmpW: f32 = rmaW.g;
  var aoTmpW: f32 = rmaW.a;
  applyModifiers(&albedoRaw, &Nw, &roughTmpW, &metalTmpW, &aoTmpW, worldPos, &heightVal, isFloorSurface);
  rmaW.r = roughTmpW;
  rmaW.g = metalTmpW;
  rmaW.a = aoTmpW;

  var color: vec3<f32> = pbrShade(albedoRaw, Nw, rmaW.r, rmaW.g, rmaW.a, emissiveW, worldPos, viewDir);
  let sideY: f32 = step(0.5, f32(side));
  let wallDarken: f32 = select(0.85, frame.renderWallDarken, frame.renderWallDarken > 0.0);
  color = mix(color, color * wallDarken, sideY);
  return color;
}
`;
