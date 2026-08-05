export const wgslGridChamfer = `
fn applyGridChamferUnified(worldPos: vec2<f32>, isCeil: bool, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  let en: f32 = f32(frame.chamferEnabled) * f32(frame.chamferGridEnabled);
  let f: vec2<f32> = fract(worldPos);
  let distX: f32 = min(f.x, 1.0 - f.x);
  let distY: f32 = min(f.y, 1.0 - f.y);
  let edgeDist: f32 = min(distX, distY);
  let gSize: f32 = select(max(frame.chamferGridFloorSize, 0.001), max(frame.chamferGridCeilSize, 0.001), isCeil);
  let cond: f32 = step(edgeDist, gSize) * en;
  let t: f32 = edgeDist / max(gSize, 0.0001);
  let bevel: f32 = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  let gridCreviceSmooth: f32 = select(0.30, frame.chamferGridCreviceSmoothEnd, frame.chamferGridCreviceSmoothEnd > 0.0);
  let gridTStart: f32 = select(0.10, frame.chamferGridTrimStart, frame.chamferGridTrimStart >= 0.0);
  let gridTMid: f32 = select(0.35, frame.chamferGridTrimMid, frame.chamferGridTrimMid > 0.0);
  let gridTEnd: f32 = select(1.0, frame.chamferGridTrimEnd, frame.chamferGridTrimEnd > 0.0);
  let isCeilF: f32 = f32(isCeil);
  let gDarkenFloor: f32 = select(0.88, frame.chamferGridFloorDarken, frame.chamferGridFloorDarken > 0.0);
  let gDarkenCeil: f32 = select(0.90, frame.chamferGridCeilDarken, frame.chamferGridCeilDarken > 0.0);
  let gDarken: f32 = mix(gDarkenFloor, gDarkenCeil, isCeilF);
  let gBlendFloor: f32 = select(0.85, frame.chamferGridFloorBlend, frame.chamferGridFloorBlend > 0.0);
  let gBlendCeil: f32 = select(0.80, frame.chamferGridCeilBlend, frame.chamferGridCeilBlend > 0.0);
  let gBlend: f32 = mix(gBlendFloor, gBlendCeil, isCeilF);
  let gRoughFloor: f32 = select(0.35, frame.chamferGridFloorRough, frame.chamferGridFloorRough > 0.0);
  let gRoughCeil: f32 = select(0.30, frame.chamferGridCeilRough, frame.chamferGridCeilRough > 0.0);
  let gRough: f32 = mix(gRoughFloor, gRoughCeil, isCeilF);
  let gTrimFloor: f32 = select(0.06, frame.chamferGridFloorTrim, frame.chamferGridFloorTrim >= 0.0);
  let gTrimCeil: f32 = select(0.04, frame.chamferGridCeilTrim, frame.chamferGridCeilTrim >= 0.0);
  let gTrim: f32 = mix(gTrimFloor, gTrimCeil, isCeilF);

  let ao1: f32 = *ao * mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
  *ao = mix(*ao, ao1, cond);

  let xLessY: f32 = step(distX, distY);
  // edge normal
  let xSign: f32 = step(0.5, f.x) * 2.0 - 1.0;
  let ySign: f32 = step(0.5, f.y) * 2.0 - 1.0;
  let edgeN: vec2<f32> = vec2<f32>(xLessY * xSign, (1.0 - xLessY) * ySign);
  let upZ: f32 = mix(1.0, -1.0, isCeilF);
  let chamN: vec3<f32> = normalize(vec3<f32>(edgeN * 0.6, upZ));
  let newN: vec3<f32> = normalize(mix(*N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
  *N = mix(*N, newN, cond);

  let trimBand: f32 = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t)) * cond;
  let newAlbedo: vec3<f32> = *albedo + vec3<f32>(trimBand * gTrim);
  *albedo = mix(*albedo, newAlbedo, cond);

  let roughFactor: f32 = mix(0.5, 0.3, isCeilF);
  let newRough: f32 = mix((*rma).r * (1.0 - gRough * roughFactor), (*rma).r, t);
  (*rma).r = mix((*rma).r, newRough, cond);

  let cornerCond: f32 = step(distX, gSize) * step(distY, gSize) * en;
  let newAo: f32 = *ao * 0.97;
  *ao = mix(*ao, newAo, cornerCond);
}

fn applyGridFloor(worldPos: vec2<f32>, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  applyGridChamferUnified(worldPos, false, N, ao, albedo, rma);
}
fn applyGridCeil(worldPos: vec2<f32>, N: ptr<function, vec3<f32>>, ao: ptr<function, f32>, albedo: ptr<function, vec3<f32>>, rma: ptr<function, vec4<f32>>) {
  applyGridChamferUnified(worldPos, true, N, ao, albedo, rma);
}
`;
