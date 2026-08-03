// Material array sampling – replaces old atlasUV math
// One layer per material type, sampled via sampler2DArray layer = matId-1

export const glslMaterial = `
// ----- material helpers (array path) -----
vec3 decodeNormal(vec3 enc) { return normalize(enc * 2.0 - 1.0); }

float clampLayer(float id, float count) {
  float maxL = max(count - 1.0, 0.0);
  float l = id - 1.0;
  if (l < 0.0) l = 0.0;
  if (l > maxL) l = maxL;
  return l;
}

// Wall sampling
vec3 sampleWallAlbedo(float layer, vec2 uv) { return texture(u_wallAlbedo, vec3(uv, layer)).rgb; }
vec3 sampleWallNormalRaw(float layer, vec2 uv) { return texture(u_wallNormal, vec3(uv, layer)).rgb; }
float sampleWallHeight(float layer, vec2 uv) { return texture(u_wallHeight, vec3(uv, layer)).r; }
vec4 sampleWallRMA(float layer, vec2 uv) { return texture(u_wallRoughMetal, vec3(uv, layer)); }

// Floor
vec3 sampleFloorAlbedo(float layer, vec2 uv) { return texture(u_floorAlbedo, vec3(uv, layer)).rgb; }
vec3 sampleFloorNormalRaw(float layer, vec2 uv) { return texture(u_floorNormal, vec3(uv, layer)).rgb; }
float sampleFloorHeight(float layer, vec2 uv) { return texture(u_floorHeight, vec3(uv, layer)).r; }
vec4 sampleFloorRMA(float layer, vec2 uv) { return texture(u_floorRoughMetal, vec3(uv, layer)); }

// Ceil
vec3 sampleCeilAlbedo(float layer, vec2 uv) { return texture(u_ceilAlbedo, vec3(uv, layer)).rgb; }
vec3 sampleCeilNormalRaw(float layer, vec2 uv) { return texture(u_ceilNormal, vec3(uv, layer)).rgb; }
float sampleCeilHeight(float layer, vec2 uv) { return texture(u_ceilHeight, vec3(uv, layer)).r; }
vec4 sampleCeilRMA(float layer, vec2 uv) { return texture(u_ceilRoughMetal, vec3(uv, layer)); }

// Per-cell matId fetch via matMap (texelFetch – no filtering bleed)
float fetchFloorMatId(ivec2 cell) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= int(u_mapSize.x) || cell.y >= int(u_mapSize.y)) return 1.0;
  vec4 m = texelFetch(u_matMap, cell, 0);
  float id = m.r * 255.0;
  if (id < 0.5) return 1.0;
  return id;
}
float fetchCeilMatId(ivec2 cell) {
  if (cell.x < 0 || cell.y < 0 || cell.x >= int(u_mapSize.x) || cell.y >= int(u_mapSize.y)) return 1.0;
  vec4 m = texelFetch(u_matMap, cell, 0);
  float id = m.g * 255.0;
  if (id < 0.5) return 1.0;
  return id;
}
`;
