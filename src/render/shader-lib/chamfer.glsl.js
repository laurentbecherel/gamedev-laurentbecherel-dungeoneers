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
  float en = float(u_chamferEnabled);
  vec3 wN; float wd = nearestWallDistAndNormal(worldPos, wN);
  float sz = isCeil ? max(u_chamferCeilSize, 0.001) : max(u_chamferFloorSize, 0.001);
  float cond1 = step(wd, sz);
  float cond2 = step(0.11, length(wN));
  float valid = cond1 * cond2 * en;
  float t = wd / max(sz, 0.0001);
  float bevel = (1.0 - smoothstep(0.0, 1.0, t)) * valid;
  float creviceSmooth = u_chamferCreviceSmoothEnd > 0.0 ? u_chamferCreviceSmoothEnd : 0.30;
  float blend = clamp(u_chamferBlendFloor, 0.0, 1.0);
  float darken = u_chamferDarken;
  float up = isCeil ? -1.0 : 1.0;
  vec3 cham = normalize(wN + vec3(0.0, 0.0, up));
  vec3 roundCham = normalize(mix(cham, vec3(0.0,0.0,up), smoothstep(0.0,1.0,t)));
  float isRound = float(u_chamferRoundCorners==1);
  vec3 targetN = mix(cham, roundCham, isRound);
  vec3 newN = normalize(mix(N, targetN, bevel * blend));
  N = mix(N, newN, valid);
  float aoMix = mix(darken, 1.0, smoothstep(0.0, creviceSmooth, t));
  ao = mix(ao, ao * aoMix, valid);
  float trimBand = trimBandFactor(t) * valid;
  float trimAlt = isCeil ? (u_chamferTrimCeilAlt > 0.0 ? u_chamferTrimCeilAlt : 0.14) : (u_chamferTrimFloorAlt > 0.0 ? u_chamferTrimFloorAlt : 0.18);
  albedo = mix(albedo, albedo + vec3(trimBand * trimAlt), valid);
  float roughFactor = isCeil ? 0.3 : 0.5;
  float newRough = mix(rma.r * (1.0 - u_chamferRough * roughFactor), rma.r, t);
  rma.r = mix(rma.r, newRough, valid);
}

// Legacy wrappers for tests/backward compat – call unified
void applyFloorBaseboard(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyBaseboardUnified(worldPos, false, N, ao, albedo, rma);
}
void applyCeilBaseboard(in vec2 worldPos, inout vec3 N, inout float ao, inout vec3 albedo, inout vec4 rma) {
  applyBaseboardUnified(worldPos, true, N, ao, albedo, rma);
}

// Unified wall horizontal trim (floor vs ceiling) - branchless
void applyWallHorizontalTrimUnified(in float wallV, in bool isFloor, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  float en = float(u_chamferEnabled);
  float sz = isFloor ? max(u_chamferFloorSize, 0.04) : max(u_chamferCeilSize, 0.04);
  float rawT = isFloor ? wallV : (1.0 - wallV);
  float cond = step(rawT, sz) * en;
  float t = rawT / max(sz, 0.0001);
  float bevel = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  float creviceEnd = u_chamferCreviceEnd > 0.0 ? u_chamferCreviceEnd : 0.12;
  float tStart = u_chamferTrimStart >= 0.0 ? u_chamferTrimStart : 0.08;
  float trimStrength = isFloor ? (u_chamferTrimFloor > 0.0 ? u_chamferTrimFloor : 0.22) : (u_chamferTrimCeil > 0.0 ? u_chamferTrimCeil : 0.18);
  vec3 upDown = isFloor ? vec3(0.0,0.0,1.0) : vec3(0.0,0.0,-1.0);
  vec3 chamGeom = normalize(Ngeom + upDown);
  vec3 chamRound = normalize(mix(upDown, chamGeom, smoothstep(0.0, 1.0, t)));
  float isRound = float(u_chamferRoundCorners==1);
  vec3 targetN = mix(chamGeom, chamRound, isRound);
  float isFloorF = float(isFloor);
  vec3 targetN2 = mix(targetN, normalize(mix(upDown, chamGeom, smoothstep(0.0,1.0,t))), (1.0-isFloorF)*isRound);
  targetN = mix(targetN, targetN2, 1.0-isFloorF);
  vec3 newNw = normalize(mix(Nw, targetN, bevel * clamp(u_chamferBlendFloor,0.0,1.0)));
  Nw = mix(Nw, newNw, cond);
  float aoT = smoothstep(0.0, creviceEnd, t);
  float newAo = rmaW.a * mix(u_chamferDarken, 1.0, aoT);
  rmaW.a = mix(rmaW.a, newAo, cond);
  float trim = smoothstep(tStart, 0.32, t) * (1.0 - smoothstep(0.32, 1.0, t)) * cond;
  vec3 newAlbedo = albedoRaw + vec3(trim * trimStrength);
  albedoRaw = mix(albedoRaw, newAlbedo, cond);
  float newRough = rmaW.r * mix(isFloor ? 0.58 : 0.62, 1.0, t);
  rmaW.r = mix(rmaW.r, newRough, cond);
}

void applyWallFloorTrim(in float wallV, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  applyWallHorizontalTrimUnified(wallV, true, Ngeom, Nw, albedoRaw, rmaW);
}
void applyWallCeilTrim(in float wallV, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  applyWallHorizontalTrimUnified(wallV, false, Ngeom, Nw, albedoRaw, rmaW);
}

void applyWallVerticalEdge(in float wallU, in int side, in vec3 Ngeom, inout vec3 Nw, inout vec3 albedoRaw, inout vec4 rmaW) {
  float en = float(u_chamferEnabled);
  float vS = max(u_chamferWallSize, 0.04);
  float e = min(wallU, 1.0 - wallU);
  float cond = step(e, vS) * en;
  float t = e / max(vS, 0.0001);
  float bevel = (1.0 - smoothstep(0.0, 1.0, t)) * cond;
  float sideEq0 = step(float(side), 0.5);
  float left = step(wallU, 0.5);
  vec3 n2a = mix(vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), left);
  vec3 n2b = mix(vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), left);
  vec3 n2 = mix(n2b, n2a, sideEq0);
  vec3 diag = normalize(Ngeom + n2);
  vec3 newNw = normalize(mix(Nw, diag, bevel * clamp(u_chamferBlendWall,0.0,1.0)));
  Nw = mix(Nw, newNw, cond);
  float newAo = rmaW.a * mix(u_chamferDarken*0.88 + 0.12, 1.0, smoothstep(0.0, 0.45, t));
  rmaW.a = mix(rmaW.a, newAo, cond);
  float newRough = rmaW.r * mix(0.65, 1.0, smoothstep(0.0, 1.0, t));
  rmaW.r = mix(rmaW.r, newRough, cond);
  float trimWall = u_chamferTrimWall > 0.0 ? u_chamferTrimWall : 0.16;
  float trim = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.25, 1.0, t)) * cond;
  vec3 newAlbedo = albedoRaw + vec3(trim * trimWall);
  albedoRaw = mix(albedoRaw, newAlbedo, cond);
}
`;
