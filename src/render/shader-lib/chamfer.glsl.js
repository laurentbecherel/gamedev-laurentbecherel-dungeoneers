// Chamfer helpers – unified to reduce duplication
// Previously 4x copy-paste for floor/ceil baseboard + wall floor/ceil trim
// Now unified applyBaseboard(isCeil) and applyWallHorizontalTrim(isFloor)

export const glslChamfer = `
float trimBandFactor(float t) {
  float tStart = u_chamferTrimStart >= 0.0 ? u_chamferTrimStart : 0.08;
  float tMid = u_chamferTrimMid > 0.0 ? u_chamferTrimMid : 0.35;
  float tEnd = u_chamferTrimEnd > 0.0 ? u_chamferTrimEnd : 1.0;
  return smoothstep(tStart, tMid, t) * (1.0 - smoothstep(tMid, tEnd, t));
}

// Unified baseboard: floor (isCeil=false, up=+1) vs ceiling (isCeil=true, up=-1)
void applyBaseboardUnified(in vec2 worldPos, in bool isCeil, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  if (u_chamferEnabled == 0) return;
  vec3 wN; float wd = nearestWallDistAndNormal(worldPos, wN);
  float sz = isCeil ? max(u_chamferCeilSize, 0.001) : max(u_chamferFloorSize, 0.001);
  if (wd >= sz || length(wN) <= 0.1) return;
  float t = wd / sz;
  float bevel = 1.0 - smoothstep(0.0, 1.0, t);
  float creviceSmooth = u_chamferCreviceSmoothEnd > 0.0 ? u_chamferCreviceSmoothEnd : 0.30;
  float blend = clamp(u_chamferBlendFloor, 0.0, 1.0);
  float darken = u_chamferDarken;
  float up = isCeil ? -1.0 : 1.0;
  vec3 cham = normalize(wN + vec3(0.0, 0.0, up));
  // Round corners handling unified for both floor and ceil now
  vec3 roundCham = normalize(mix(cham, vec3(0.0,0.0,up), smoothstep(0.0,1.0,t)));
  vec3 targetN = (u_chamferRoundCorners==1) ? roundCham : cham;
  N = normalize(mix(N, targetN, bevel * blend));
  ao *= mix(darken, 1.0, smoothstep(0.0, creviceSmooth, t));
  float trimBand = trimBandFactor(t);
  float trimAlt = isCeil ? (u_chamferTrimCeilAlt > 0.0 ? u_chamferTrimCeilAlt : 0.14) : (u_chamferTrimFloorAlt > 0.0 ? u_chamferTrimFloorAlt : 0.18);
  albedo += vec3(trimBand * trimAlt);
  float roughFactor = isCeil ? 0.3 : 0.5;
  rma.r = mix(rma.r * (1.0 - u_chamferRough * roughFactor), rma.r, t);
}

// Legacy wrappers for tests/backward compat – call unified
void applyFloorBaseboard(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyBaseboardUnified(worldPos, false, N, ao, albedo, rma);
}
void applyCeilBaseboard(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyBaseboardUnified(worldPos, true, N, ao, albedo, rma);
}

// Unified wall horizontal trim (floor vs ceiling)
void applyWallHorizontalTrimUnified(in float wallV, in bool isFloor, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  if (u_chamferEnabled == 0) return;
  float sz = isFloor ? max(u_chamferFloorSize, 0.04) : max(u_chamferCeilSize, 0.04);
  float rawT = isFloor ? wallV : (1.0 - wallV);
  if (rawT >= sz) return;
  float t = rawT / sz;
  float bevel = 1.0 - smoothstep(0.0, 1.0, t);
  float creviceEnd = u_chamferCreviceEnd > 0.0 ? u_chamferCreviceEnd : 0.12;
  float tStart = u_chamferTrimStart >= 0.0 ? u_chamferTrimStart : 0.08;
  float trimStrength = isFloor ? (u_chamferTrimFloor > 0.0 ? u_chamferTrimFloor : 0.22) : (u_chamferTrimCeil > 0.0 ? u_chamferTrimCeil : 0.18);
  vec3 upDown = isFloor ? vec3(0.0,0.0,1.0) : vec3(0.0,0.0,-1.0);
  vec3 chamGeom = normalize(Ngeom + upDown);
  vec3 chamRound = normalize(mix(upDown, chamGeom, smoothstep(0.0, 1.0, t)));
  vec3 targetN = (u_chamferRoundCorners==1) ? chamRound : chamGeom;
  if (!isFloor) {
    // For ceiling we had slightly different lerp previously – unify to same as floor but keep distinct param for future
    targetN = (u_chamferRoundCorners==1) ? normalize(mix(upDown, chamGeom, smoothstep(0.0,1.0,t))) : chamGeom;
  }
  Nw = normalize(mix(Nw, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
  float aoT = smoothstep(0.0, creviceEnd, t);
  rmaW.a *= mix(u_chamferDarken, 1.0, aoT);
  float trim = smoothstep(tStart, 0.32, t) * (1.0 - smoothstep(0.32, 1.0, t));
  albedoRaw += vec3(trim * trimStrength);
  rmaW.r *= isFloor ? mix(0.58, 1.0, t) : mix(0.62, 1.0, t);
}

void applyWallFloorTrim(in float wallV, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  applyWallHorizontalTrimUnified(wallV, true, Ngeom, Nw, albedoRaw, rmaW);
}
void applyWallCeilTrim(in float wallV, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  applyWallHorizontalTrimUnified(wallV, false, Ngeom, Nw, albedoRaw, rmaW);
}

void applyWallVerticalEdge(in float wallU, in int side, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  if (u_chamferEnabled == 0) return;
  float vS = max(u_chamferWallSize, 0.04);
  float e = min(wallU, 1.0 - wallU);
  if (e >= vS) return;
  float t = e / vS;
  float bevel = 1.0 - smoothstep(0.0, 1.0, t);
  vec3 n2;
  if (side == 0) n2 = (wallU < 0.5) ? vec3(0.0, -1.0, 0.0) : vec3(0.0, 1.0, 0.0);
  else n2 = (wallU < 0.5) ? vec3(-1.0, 0.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 diag = normalize(Ngeom + n2);
  Nw = normalize(mix(Nw, diag, bevel * clamp(u_chamferBlendWall,0.0,1.0)));
  rmaW.a *= mix(u_chamferDarken*0.88 + 0.12, 1.0, smoothstep(0.0, 0.45, t));
  rmaW.r *= mix(0.65, 1.0, smoothstep(0.0, 1.0, t));
  float trimWall = u_chamferTrimWall > 0.0 ? u_chamferTrimWall : 0.16;
  float trim = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.25, 1.0, t));
  albedoRaw += vec3(trim * trimWall);
}
`;
