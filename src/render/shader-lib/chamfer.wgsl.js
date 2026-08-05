export const wgslChamfer = `
fn trimBandFactor(t: f32) -> f32 {
  let tStart: f32 = select(0.08, frame.chamferTrimStart, frame.chamferTrimStart >= 0.0);
  let tMid: f32 = select(0.35, frame.chamferTrimMid, frame.chamferTrimMid > 0.0);
  let tEnd: f32 = select(1.0, frame.chamferTrimEnd, frame.chamferTrimEnd > 0.0);
  return smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
}

fn applyBaseboardUnified(worldPos: vec2<f32>, isCeil: bool, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  let en: f32 = f32(frame.chamferEnabled);
  var wN: vec3<f32>;
  let wallRes = nearestWallDistAndNormal(worldPos);
  wN = wallRes.normal;
  let wd: f32 = wallRes.dist;
  let sz: f32 = select(max(frame.chamferFloorSize, 0.001), max(frame.chamferCeilSize, 0.001), isCeil);
  let cond1: f32 = step(wd, sz);
  let cond2: f32 = step(0.11, length(wN));
  let valid: f32 = cond1 * cond2 * en;
  let t: f32 = wd / max(sz, 0.0001);
  let bevel: f32 = (1.0 - smoothstep(0.0, 1.0, t)) * valid;
  let creviceSmooth: f32 = select(0.30, frame.chamferCreviceSmoothEnd, frame.chamferCreviceSmoothEnd > 0.0);
  let blend: f32 = clamp(frame.chamferBlendFloor, 0.0, 1.0);
  let darken: f32 = frame.chamferDarken;
  let up: f32 = select(1.0, -1.0, isCeil);
  let cham: vec3<f32> = normalize(wN + vec3<f32>(0.0, 0.0, up));
  let roundCham: vec3<f32> = normalize(mix(cham, vec3<f32>(0.0, 0.0, up), smoothstep(0.0, 1.0, t)));
  let isRound: f32 = f32(frame.chamferRoundCorners == 1);
  let targetN: vec3<f32> = mix(cham, roundCham, isRound);
  let newN: vec3<f32> = normalize(mix(*N, targetN, bevel * blend));
  *N = mix(*N, newN, valid);
  let aoMix: f32 = mix(darken, 1.0, smoothstep(0.0, creviceSmooth, t));
  *ao = mix(*ao, *ao * aoMix, valid);
  let trimBand: f32 = trimBandFactor(t) * valid;
  let trimAlt: f32 = select(select(0.18, frame.chamferTrimFloorAlt, frame.chamferTrimFloorAlt > 0.0), select(0.14, frame.chamferTrimCeilAlt, frame.chamferTrimCeilAlt > 0.0), isCeil);
  *albedo = mix(*albedo, *albedo + vec3<f32>(trimBand * trimAlt), valid);
  let roughFactor: f32 = select(0.5, 0.3, isCeil);
  let newRough: f32 = mix((*rma).r * (1.0 - frame.chamferRough * roughFactor), (*rma).r, t);
  (*rma).r = mix((*rma).r, newRough, valid);
}

fn applyFloorBaseboard(worldPos: vec2<f32>, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  applyBaseboardUnified(worldPos, false, N, ao, albedo, rma);
}
fn applyCeilBaseboard(worldPos: vec2<f32>, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  applyBaseboardUnified(worldPos, true, N, ao, albedo, rma);
}

fn applyWallHorizontalTrimUnified(wallV: f32, isFloor: bool, Ngeom: vec3<f32>, Nw: ptr<function, vec3<f32>>, albedoRaw: ptr<function, vec3<f32>>, rmaW: ptr<function, vec4<f32>>) {
  let en: f32 = f32(frame.chamferEnabled);
  let sz: f32 = select(max(frame.chamferCeilSize, 0.04), max(frame.chamferFloorSize, 0.04), isFloor);
  let rawT: f32 = select(1.0 - wallV, wallV, isFloor);
  let cond: f32 = step(rawT, sz) * en;
  let t: f32 = rawT / max(sz, 0.0001);
  let bevel: f32 = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  let creviceEnd: f32 = select(0.12, frame.chamferCreviceEnd, frame.chamferCreviceEnd > 0.0);
  let tStart: f32 = select(0.08, frame.chamferTrimStart, frame.chamferTrimStart >= 0.0);
  let trimFlo: f32 = select(0.22, frame.chamferTrimFloor, frame.chamferTrimFloor > 0.0);
  let trimCei: f32 = select(0.18, frame.chamferTrimCeil, frame.chamferTrimCeil > 0.0);
  let trimStrength: f32 = select(trimCei, trimFlo, isFloor);
  let upDown: vec3<f32> = select(vec3<f32>(0.0, 0.0, -1.0), vec3<f32>(0.0, 0.0, 1.0), isFloor);
  let chamGeom: vec3<f32> = normalize(Ngeom + upDown);
  let chamRound: vec3<f32> = normalize(mix(upDown, chamGeom, smoothstep(0.0, 1.0, t)));
  let isRound: f32 = f32(frame.chamferRoundCorners == 1);
  var targetN: vec3<f32> = mix(chamGeom, chamRound, isRound);
  let isFloorF: f32 = f32(isFloor);
  let targetN2: vec3<f32> = mix(targetN, normalize(mix(upDown, chamGeom, smoothstep(0.0, 1.0, t))), (1.0 - isFloorF) * isRound);
  targetN = mix(targetN, targetN2, 1.0 - isFloorF);
  let newNw: vec3<f32> = normalize(mix(*Nw, targetN, bevel * clamp(frame.chamferBlendFloor, 0.0, 1.0)));
  *Nw = mix(*Nw, newNw, cond);
  let aoT: f32 = smoothstep(0.0, creviceEnd, t);
  let newAo: f32 = (*rmaW).a * mix(frame.chamferDarken, 1.0, aoT);
  (*rmaW).a = mix((*rmaW).a, newAo, cond);
  let trim: f32 = smoothstep(tStart, 0.32, t) * (1.0 - smoothstep(0.32, 1.0, t)) * cond;
  let newAlbedo: vec3<f32> = *albedoRaw + vec3<f32>(trim * trimStrength);
  *albedoRaw = mix(*albedoRaw, newAlbedo, cond);
  let newRough: f32 = (*rmaW).r * mix(select(0.62, 0.58, isFloor), 1.0, t);
  (*rmaW).r = mix((*rmaW).r, newRough, cond);
}

fn applyWallFloorTrim(wallV: f32, Ngeom: vec3<f32>, Nw: ptr<function, vec3<f32>>, albedoRaw: ptr<function, vec3<f32>>, rmaW: ptr<function, vec4<f32>>) {
  applyWallHorizontalTrimUnified(wallV, true, Ngeom, Nw, albedoRaw, rmaW);
}
fn applyWallCeilTrim(wallV: f32, Ngeom: vec3<f32>, Nw: ptr<function, vec3<f32>>, albedoRaw: ptr<function, vec3<f32>>, rmaW: ptr<function, vec4<f32>>) {
  applyWallHorizontalTrimUnified(wallV, false, Ngeom, Nw, albedoRaw, rmaW);
}

fn applyWallVerticalEdge(wallU: f32, side: i32, Ngeom: vec3<f32>, Nw: ptr<function, vec3<f32>>, albedoRaw: ptr<function, vec3<f32>>, rmaW: ptr<function, vec4<f32>>) {
  let en: f32 = f32(frame.chamferEnabled);
  let vS: f32 = max(frame.chamferWallSize, 0.04);
  let e: f32 = min(wallU, 1.0 - wallU);
  let cond: f32 = step(e, vS) * en;
  let t: f32 = e / max(vS, 0.0001);
  let bevel: f32 = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  let sideEq0: f32 = step(f32(side), 0.5);
  let left: f32 = step(wallU, 0.5);
  let n2a: vec3<f32> = mix(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, -1.0, 0.0), left);
  let n2b: vec3<f32> = mix(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(-1.0, 0.0, 0.0), left);
  let n2: vec3<f32> = mix(n2b, n2a, sideEq0);
  let diag: vec3<f32> = normalize(Ngeom + n2);
  let newNw: vec3<f32> = normalize(mix(*Nw, diag, bevel * clamp(frame.chamferBlendWall, 0.0, 1.0)));
  *Nw = mix(*Nw, newNw, cond);
  let newAo: f32 = (*rmaW).a * mix(frame.chamferDarken * 0.88 + 0.12, 1.0, smoothstep(0.0, 0.45, t));
  (*rmaW).a = mix((*rmaW).a, newAo, cond);
  let newRough: f32 = (*rmaW).r * mix(0.65, 1.0, smoothstep(0.0, 1.0, t));
  (*rmaW).r = mix((*rmaW).r, newRough, cond);
  let trimWall: f32 = select(0.16, frame.chamferTrimWall, frame.chamferTrimWall > 0.0);
  let trim: f32 = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.25, 1.0, t)) * cond;
  let newAlbedo: vec3<f32> = *albedoRaw + vec3<f32>(trim * trimWall);
  *albedoRaw = mix(*albedoRaw, newAlbedo, cond);
}
`;
