// Common geometry helpers – modularized from uber-shader
// Contains wall cell queries, corner detection, ray-circle hit, wall hit resolver

export const glslCommon = `
// ----- common helpers -----
bool isWallCell(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(u_mapSize.x) || c.y >= int(u_mapSize.y)) return false;
  vec4 m = texelFetch(u_mapTex, c, 0);
  return (m.r * 255.0 > 0.5);
}

// Optimized: only 4 cardinal neighbors + optional diagonal blend – was 8 texelFetch, now 4 for fast compile
float nearestWallDistAndNormal(vec2 world, out vec3 outNorm) {
  ivec2 cell = ivec2(floor(world));
  vec2 f = fract(world);
  float dE = 1.0 - f.x; vec3 nE = vec3(-1.0, 0.0, 0.0); bool eWall = isWallCell(cell + ivec2(1,0));
  float dW = f.x;       vec3 nW = vec3(1.0, 0.0, 0.0);  bool wWall = isWallCell(cell + ivec2(-1,0));
  float dN = 1.0 - f.y; vec3 nN = vec3(0.0, -1.0, 0.0); bool nWall = isWallCell(cell + ivec2(0,1));
  float dS = f.y;       vec3 nS = vec3(0.0, 1.0, 0.0);  bool sWall = isWallCell(cell + ivec2(0,-1));
  float best = 100.0; vec3 bestN = vec3(0.0);
  if (eWall && dE < best) { best = dE; bestN = nE; }
  if (wWall && dW < best) { best = dW; bestN = nW; }
  if (nWall && dN < best) { best = dN; bestN = nN; }
  if (sWall && dS < best) { best = dS; bestN = nS; }
  // Diagonal only for corner darkening – cheaper: only if no cardinal close (<0.35)
  if (best > 0.35) {
    bool neWall = isWallCell(cell + ivec2(1,1));
    bool nwWall = isWallCell(cell + ivec2(-1,1));
    bool seWall = isWallCell(cell + ivec2(1,-1));
    bool swWall = isWallCell(cell + ivec2(-1,-1));
    vec2 toNE = vec2(1.0 - f.x, 1.0 - f.y); float dNE = length(toNE);
    vec2 toNW = vec2(-f.x, 1.0 - f.y);      float dNW = length(toNW);
    vec2 toSE = vec2(1.0 - f.x, -f.y);      float dSE = length(toSE);
    vec2 toSW = vec2(-f.x, -f.y);           float dSW = length(toSW);
    vec3 nNE = (dNE > 0.0001) ? vec3(normalize(-toNE), 0.0) : vec3(-0.707, -0.707, 0.0);
    vec3 nNW = (dNW > 0.0001) ? vec3(normalize(-toNW), 0.0) : vec3(0.707, -0.707, 0.0);
    vec3 nSE = (dSE > 0.0001) ? vec3(normalize(-toSE), 0.0) : vec3(-0.707, 0.707, 0.0);
    vec3 nSW = (dSW > 0.0001) ? vec3(normalize(-toSW), 0.0) : vec3(0.707, 0.707, 0.0);
    if (neWall && dNE < best) { best = dNE; bestN = nNE; }
    if (nwWall && dNW < best) { best = dNW; bestN = nNW; }
    if (seWall && dSE < best) { best = dSE; bestN = nSE; }
    if (swWall && dSW < best) { best = dSW; bestN = nSW; }
  }
  // Blend close normals for smoother bevel (only cardinal blend when near wall)
  {
    const float eps = 0.10;
    vec3 accum = vec3(0.0); int cnt = 0;
    if (eWall && abs(dE - best) <= eps) { accum += nE; cnt++; }
    if (wWall && abs(dW - best) <= eps) { accum += nW; cnt++; }
    if (nWall && abs(dN - best) <= eps) { accum += nN; cnt++; }
    if (sWall && abs(dS - best) <= eps) { accum += nS; cnt++; }
    if (cnt > 1) {
      float len = length(accum);
      if (len > 0.35) bestN = normalize(accum);
    }
  }
  outNorm = bestN;
  return best;
}

bool isOuterConvex(ivec2 W, ivec2 E, ivec2 W2, ivec2 D) {
  return !isWallCell(E) && !isWallCell(W2) && !isWallCell(D);
}
bool isInnerConcave(ivec2 W, ivec2 E, ivec2 W2, ivec2 D) {
  return !isWallCell(E) && isWallCell(W2) && isWallCell(D);
}
bool rayCircleHit(vec2 O, vec2 Dir, vec2 C, float r, out float t0, out float t1) {
  vec2 oc = O - C;
  float a = dot(Dir, Dir);
  float b = 2.0 * dot(oc, Dir);
  float c_ = dot(oc, oc) - r * r;
  float disc = b * b - 4.0 * a * c_;
  if (disc < 0.0) return false;
  float sd = sqrt(disc);
  t0 = (-b - sd) / (2.0 * a);
  t1 = (-b + sd) / (2.0 * a);
  return true;
}

bool resolveWallHit(ivec2 W, int side, ivec2 stepDir, vec2 ray, float cornerR,
                    int cornerEnabled, int cornerInner,
                    out float outT, out vec2 outHp, out vec2 outN, out bool outRounded) {
  float perp;
  if (side == 0) perp = (float(W.x) - u_playerPos.x + (1.0 - float(stepDir.x)) * 0.5) / ray.x;
  else           perp = (float(W.y) - u_playerPos.y + (1.0 - float(stepDir.y)) * 0.5) / ray.y;
  outT = perp;
  outHp = u_playerPos + ray * perp;
  outN = (side == 0) ? vec2(float(-stepDir.x), 0.0) : vec2(0.0, float(-stepDir.y));
  outRounded = false;
  if (cornerEnabled != 1 || cornerR <= 0.01) return true;
  for (int k = 0; k < 2; k++) {
    int off = (k == 0) ? -1 : 1;
    vec2 P, interiorDir, roomDir;
    float coordAlong, cornerCoord;
    ivec2 E, W2, D;
    if (side == 0) {
      cornerCoord = float(W.y) + (k == 0 ? 0.0 : 1.0);
      coordAlong = outHp.y;
      P = vec2(float(W.x) + (stepDir.x > 0 ? 0.0 : 1.0), cornerCoord);
      interiorDir = vec2(float(stepDir.x), float(-off));
      roomDir     = vec2(float(-stepDir.x), float(-off));
      E  = ivec2(W.x - stepDir.x, W.y);
      W2 = ivec2(W.x, W.y + off);
      D  = ivec2(W.x - stepDir.x, W.y + off);
    } else {
      cornerCoord = float(W.x) + (k == 0 ? 0.0 : 1.0);
      coordAlong = outHp.x;
      P = vec2(cornerCoord, float(W.y) + (stepDir.y > 0 ? 0.0 : 1.0));
      interiorDir = vec2(float(-off), float(stepDir.y));
      roomDir     = vec2(float(-off), float(-stepDir.y));
      E  = ivec2(W.x, W.y - stepDir.y);
      W2 = ivec2(W.x + off, W.y);
      D  = ivec2(W.x + off, W.y - stepDir.y);
    }
    bool outer = isOuterConvex(W, E, W2, D);
    bool inner = (cornerInner == 1) && isInnerConcave(W, E, W2, D);
    if (!outer && !inner) continue;
    if (outer) {
      if (abs(coordAlong - cornerCoord) >= cornerR) continue;
      vec2 C = P + interiorDir * cornerR;
      float t0, t1;
      if (rayCircleHit(u_playerPos, ray, C, cornerR, t0, t1)) {
        for (int r = 0; r < 2; r++) {
          float t = (r == 0) ? t0 : t1;
          if (t <= 0.01) continue;
          vec2 q = u_playerPos + ray * t;
          vec2 offP = q - C;
          if (offP.x * interiorDir.x > 0.0 || offP.y * interiorDir.y > 0.0) continue;
          outT = t; outHp = q; outN = normalize(offP); outRounded = true;
          return true;
        }
      }
      return false;
    } else {
      vec2 C = P + roomDir * cornerR;
      float t0, t1;
      if (rayCircleHit(u_playerPos, ray, C, cornerR, t0, t1)) {
        for (int r = 0; r < 2; r++) {
          float t = (r == 0) ? t0 : t1;
          if (t <= 0.01 || t >= perp) continue;
          vec2 q = u_playerPos + ray * t;
          vec2 offP = q - C;
          if (offP.x * roomDir.x > 0.0 || offP.y * roomDir.y > 0.0) continue;
          outT = t; outHp = q; outN = normalize(-offP); outRounded = true;
          return true;
        }
      }
    }
  }
  return true;
}
`;
