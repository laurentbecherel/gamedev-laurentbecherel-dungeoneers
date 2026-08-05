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

struct HorizontalShadeResult {
  color: vec3<f32>,
  dist: f32,
}

fn shadeHorizontalCell(horizWorld: vec2<f32>, horizUV: vec2<f32>, matId: f32, count: f32, ray: vec2<f32>, eyeZ: f32, heightAtRay: f32, isCeil: bool) -> HorizontalShadeResult {
  let layer: i32 = clampLayer(matId, count);
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
  let emissive: vec3<f32> = albedoRaw * emissiveAlbedoMul * rma.b * emissiveStrength;

  let surfMul: f32 = select(select(0.7, frame.renderFloorMul, frame.renderFloorMul > 0.0), select(0.8, frame.renderCeilMul, frame.renderCeilMul > 0.0), isCeil);
  var albedo: vec3<f32> = albedoRaw * surfMul;
  var N: vec3<f32> = Nw;

  if (isCeil) {
    applyCeilBaseboard(horizWorld, &N, &ao, &albedo, &rma);
    applyGridCeil(horizWorld, &N, &ao, &albedo, &rma);
  } else {
    applyFloorBaseboard(horizWorld, &N, &ao, &albedo, &rma);
    applyGridFloor(horizWorld, &N, &ao, &albedo, &rma);
  }

  let isFloorSurface: f32 = 1.0;
  var roughTmp: f32 = rma.r;
  var metalTmp: f32 = rma.g;
  applyModifiers(&albedo, &N, &roughTmp, &metalTmp, &ao, vec3<f32>(horizWorld, heightAtRay), &heightVal, isFloorSurface);
  rma.r = roughTmp;
  rma.g = metalTmp;

  let worldPos: vec3<f32> = vec3<f32>(horizWorld, heightAtRay);
  let viewDir: vec3<f32> = normalize(vec3<f32>(frame.playerPos, eyeZ) - worldPos);
  let dist: f32 = distance(horizWorld, frame.playerPos);
  let col: vec3<f32> = pbrShade(albedo, N, rma.r, rma.g, ao, emissive, worldPos, viewDir);
  return HorizontalShadeResult(col, dist);
}

fn shadeFloorCell(floorWorld: vec2<f32>, floorUV: vec2<f32>, matId: f32, fc: f32, ray: vec2<f32>, eyeZ: f32, floorH_atRay: f32) -> HorizontalShadeResult {
  return shadeHorizontalCell(floorWorld, floorUV, matId, fc, ray, eyeZ, floorH_atRay, false);
}
fn shadeCeilCell(ceilWorld: vec2<f32>, ceilUV: vec2<f32>, matId: f32, cc: f32, ray: vec2<f32>, eyeZ: f32, ceilH_atRay: f32) -> HorizontalShadeResult {
  return shadeHorizontalCell(ceilWorld, ceilUV, matId, cc, ray, eyeZ, ceilH_atRay, true);
}

fn shadeWallCell(wallU: f32, wallV: f32, matId: f32, wc: f32, side: i32, stepDir: vec2<i32>, ray: vec2<f32>, hitPos: vec2<f32>, hasCornerRound: bool, cornerNormal: vec3<f32>) -> vec3<f32> {
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

  let worldPos: vec3<f32> = vec3<f32>(hitPos.x, hitPos.y, (1.0 - wallV) * 1.15);
  let viewDir: vec3<f32> = normalize(vec3<f32>(frame.playerPos, frame.playerHeight) - worldPos);
  let viewTS: vec3<f32> = vec3<f32>(dot(viewDir, tangent), dot(viewDir, bitangent), dot(viewDir, Ngeom));
  let pomEn: f32 = f32(frame.pomEnabled);
  let isFloorSurface: f32 = 0.0;
  let poWall: vec2<f32> = pomOffsetArrayDamaged(wallHeight, uv, layer, viewTS, frame.pomWall, frame.pomSteps, worldPos, isFloorSurface);
  var uvPOM: vec2<f32> = mix(uv, uv + poWall, pomEn);

  var albedoRaw: vec3<f32> = sampleWallAlbedo(layer, uvPOM);
  var normalRaw: vec3<f32> = sampleWallNormalRaw(layer, uvPOM);
  var normalTSw: vec3<f32> = decodeNormal(normalRaw);
  var heightVal: f32 = sampleWallHeight(layer, uvPOM);
  var rmaW: vec4<f32> = sampleWallRMA(layer, uvPOM);

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

  applyWallFloorTrim(wallV, Ngeom, &Nw, &albedoRaw, &rmaW);
  applyWallCeilTrim(wallV, Ngeom, &Nw, &albedoRaw, &rmaW);
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
