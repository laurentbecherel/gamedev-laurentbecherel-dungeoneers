// Grid tile chamfer – unified floor/ceiling

export const glslGridChamfer = `
void applyGridChamferUnified(in vec2 worldPos, in bool isCeil, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  if (u_chamferEnabled == 0 || u_chamferGridEnabled == 0) return;
  vec2 f = fract(worldPos);
  float distX = min(f.x, 1.0 - f.x);
  float distY = min(f.y, 1.0 - f.y);
  float edgeDist = min(distX, distY);
  float gSize = isCeil ? max(u_chamferGridCeilSize, 0.001) : max(u_chamferGridFloorSize, 0.001);
  if (edgeDist >= gSize) return;
  float t = edgeDist / gSize;
  float bevel = 1.0 - smoothstep(0.0, 1.0, t);
  float gridCreviceSmooth = u_chamferGridCreviceSmoothEnd > 0.0 ? u_chamferGridCreviceSmoothEnd : 0.30;
  float gridTStart = u_chamferGridTrimStart >= 0.0 ? u_chamferGridTrimStart : 0.10;
  float gridTMid = u_chamferGridTrimMid > 0.0 ? u_chamferGridTrimMid : 0.35;
  float gridTEnd = u_chamferGridTrimEnd > 0.0 ? u_chamferGridTrimEnd : 1.0;
  float gDarken = isCeil ? (u_chamferGridCeilDarken > 0.0 ? u_chamferGridCeilDarken : 0.90) : (u_chamferGridFloorDarken > 0.0 ? u_chamferGridFloorDarken : 0.88);
  float gBlend = isCeil ? (u_chamferGridCeilBlend > 0.0 ? u_chamferGridCeilBlend : 0.80) : (u_chamferGridFloorBlend > 0.0 ? u_chamferGridFloorBlend : 0.85);
  float gRough = isCeil ? (u_chamferGridCeilRough > 0.0 ? u_chamferGridCeilRough : 0.30) : (u_chamferGridFloorRough > 0.0 ? u_chamferGridFloorRough : 0.35);
  float gTrim = isCeil ? (u_chamferGridCeilTrim >= 0.0 ? u_chamferGridCeilTrim : 0.04) : (u_chamferGridFloorTrim >= 0.0 ? u_chamferGridFloorTrim : 0.06);
  ao *= mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
  vec2 edgeN = vec2(0.0);
  if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
  else edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
  float upZ = isCeil ? -1.0 : 1.0;
  vec3 chamN = normalize(vec3(edgeN * 0.6, upZ));
  N = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
  float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t));
  albedo += vec3(trimBand * gTrim);
  float roughFactor = isCeil ? 0.3 : 0.5;
  rma.r = mix(rma.r * (1.0 - gRough * roughFactor), rma.r, t);
  if (distX < gSize && distY < gSize) ao *= 0.97;
}

void applyGridFloor(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyGridChamferUnified(worldPos, false, N, ao, albedo, rma);
}
void applyGridCeil(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyGridChamferUnified(worldPos, true, N, ao, albedo, rma);
}
`;
