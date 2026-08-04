// Grid tile chamfer – unified floor/ceiling

export const glslGridChamfer = `
void applyGridChamferUnified(in vec2 worldPos, in bool isCeil, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  float en = float(u_chamferEnabled) * float(u_chamferGridEnabled);
  vec2 f = fract(worldPos);
  float distX = min(f.x, 1.0 - f.x);
  float distY = min(f.y, 1.0 - f.y);
  float edgeDist = min(distX, distY);
  float gSize = isCeil ? max(u_chamferGridCeilSize, 0.001) : max(u_chamferGridFloorSize, 0.001);
  float cond = step(edgeDist, gSize) * en;
  float t = edgeDist / max(gSize, 0.0001);
  float bevel = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  float gridCreviceSmooth = u_chamferGridCreviceSmoothEnd > 0.0 ? u_chamferGridCreviceSmoothEnd : 0.30;
  float gridTStart = u_chamferGridTrimStart >= 0.0 ? u_chamferGridTrimStart : 0.10;
  float gridTMid = u_chamferGridTrimMid > 0.0 ? u_chamferGridTrimMid : 0.35;
  float gridTEnd = u_chamferGridTrimEnd > 0.0 ? u_chamferGridTrimEnd : 1.0;
  float isCeilF = float(isCeil);
  float gDarken = mix((u_chamferGridFloorDarken > 0.0 ? u_chamferGridFloorDarken : 0.88), (u_chamferGridCeilDarken > 0.0 ? u_chamferGridCeilDarken : 0.90), isCeilF);
  float gBlend = mix((u_chamferGridFloorBlend > 0.0 ? u_chamferGridFloorBlend : 0.85), (u_chamferGridCeilBlend > 0.0 ? u_chamferGridCeilBlend : 0.80), isCeilF);
  float gRough = mix((u_chamferGridFloorRough > 0.0 ? u_chamferGridFloorRough : 0.35), (u_chamferGridCeilRough > 0.0 ? u_chamferGridCeilRough : 0.30), isCeilF);
  float gTrim = mix((u_chamferGridFloorTrim >= 0.0 ? u_chamferGridFloorTrim : 0.06), (u_chamferGridCeilTrim >= 0.0 ? u_chamferGridCeilTrim : 0.04), isCeilF);
  float ao1 = ao * mix(gDarken, 1.0, smoothstep(0.0, gridCreviceSmooth, t));
  ao = mix(ao, ao1, cond);
  float xLessY = step(distX, distY);
  float yLessX = 1.0 - xLessY;
  float xSign = step(0.5, f.x) * 2.0 - 1.0;
  float ySign = step(0.5, f.y) * 2.0 - 1.0;
  // edgeN.x = xLessY * -xSign? Actually (f.x<0.5 ? -1 :1) = -1 when <0.5 else 1 = 2*step(0.5,f.x)-1
  // For distX<distY we want edgeN.x = that, y=0 else x=0 y=...
  vec2 edgeN = vec2(xLessY * (2.0*step(0.5, f.x)-1.0), yLessX * (2.0*step(0.5, f.y)-1.0));
  float upZ = mix(1.0, -1.0, isCeilF);
  vec3 chamN = normalize(vec3(edgeN * 0.6, upZ));
  vec3 newN = normalize(mix(N, chamN, bevel * clamp(gBlend, 0.0, 1.0)));
  N = mix(N, newN, cond);
  float trimBand = smoothstep(gridTStart, gridTMid, t) * (1.0 - smoothstep(gridTMid, gridTEnd, t)) * cond;
  vec3 newAlbedo = albedo + vec3(trimBand * gTrim);
  albedo = mix(albedo, newAlbedo, cond);
  float roughFactor = mix(0.5, 0.3, isCeilF);
  float newRough = mix(rma.r * (1.0 - gRough * roughFactor), rma.r, t);
  rma.r = mix(rma.r, newRough, cond);
  float cornerCond = step(distX, gSize) * step(distY, gSize) * en;
  float newAo = ao * 0.97;
  ao = mix(ao, newAo, cornerCond);
}

void applyGridFloor(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyGridChamferUnified(worldPos, false, N, ao, albedo, rma);
}
void applyGridCeil(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyGridChamferUnified(worldPos, true, N, ao, albedo, rma);
}
`;
