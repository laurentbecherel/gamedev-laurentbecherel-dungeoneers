// Raymarch shadow traces – split sun (64 steps) vs point (32 steps) to cut compile time
// Was single 64-step loop used 8× for point lights = 512 iterations, now point uses 32 =256

export const glslRaymarch = `
bool traceRaySun(vec2 origin, vec2 dir, float maxDist) {
  ivec2 mapPos = ivec2(floor(origin));
  vec2 deltaDist = abs(1.0 / dir);
  ivec2 iStep; vec2 sideDist;
  if(dir.x < 0.0){ iStep.x = -1; sideDist.x = (origin.x - float(mapPos.x)) * deltaDist.x; } else { iStep.x = 1; sideDist.x = (float(mapPos.x+1) - origin.x) * deltaDist.x; }
  if(dir.y < 0.0){ iStep.y = -1; sideDist.y = (origin.y - float(mapPos.y)) * deltaDist.y; } else { iStep.y = 1; sideDist.y = (float(mapPos.y+1) - origin.y) * deltaDist.y; }
  int side = 0;
  for(int i=0;i<64;i++){
    if(sideDist.x < sideDist.y){ sideDist.x += deltaDist.x; mapPos.x += iStep.x; side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += iStep.y; side = 1; }
    if(mapPos.x <0 || mapPos.y<0 || mapPos.x >= int(u_mapSize.x) || mapPos.y >= int(u_mapSize.y)) return false;
    float perp = (side==0) ? sideDist.x - deltaDist.x : sideDist.y - deltaDist.y;
    if(perp > maxDist) return false;
    vec4 ms = texelFetch(u_mapTex, mapPos, 0);
    if(int(ms.r*255.0+0.5)>0){ return true; }
  }
  return false;
}

bool traceRayPoint(vec2 origin, vec2 dir, float maxDist) {
  ivec2 mapPos = ivec2(floor(origin));
  vec2 deltaDist = abs(1.0 / dir);
  ivec2 iStep; vec2 sideDist;
  if(dir.x < 0.0){ iStep.x = -1; sideDist.x = (origin.x - float(mapPos.x)) * deltaDist.x; } else { iStep.x = 1; sideDist.x = (float(mapPos.x+1) - origin.x) * deltaDist.x; }
  if(dir.y < 0.0){ iStep.y = -1; sideDist.y = (origin.y - float(mapPos.y)) * deltaDist.y; } else { iStep.y = 1; sideDist.y = (float(mapPos.y+1) - origin.y) * deltaDist.y; }
  int side = 0;
  // 32 steps for point lights – faster compile, sufficient for max radius ~12
  for(int i=0;i<32;i++){
    if(sideDist.x < sideDist.y){ sideDist.x += deltaDist.x; mapPos.x += iStep.x; side = 0; }
    else { sideDist.y += deltaDist.y; mapPos.y += iStep.y; side = 1; }
    if(mapPos.x <0 || mapPos.y<0 || mapPos.x >= int(u_mapSize.x) || mapPos.y >= int(u_mapSize.y)) return false;
    float perp = (side==0) ? sideDist.x - deltaDist.x : sideDist.y - deltaDist.y;
    if(perp > maxDist) return false;
    vec4 ms = texelFetch(u_mapTex, mapPos, 0);
    if(int(ms.r*255.0+0.5)>0){ return true; }
  }
  return false;
}

// Legacy wrapper for tests/backward compat
bool traceRay(vec2 origin, vec2 dir, float maxDist) {
  // Use point version for legacy (32 steps) – sufficient, faster
  return traceRayPoint(origin, dir, maxDist);
}
`;
