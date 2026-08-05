export const wgslMaterial = `
// ----- material helpers (array path) – respects rendering.json textureFilter via nearestSampler for pixelated style
// Old WebGL2 used NEAREST filter for material arrays when textureFilter=nearest (default), giving chunky pixelated look
// WebGPU migration regression used linearSampler always, losing pixelated style – fixed to use nearestSampler when nearest
// For moire reduction (Doom/PSX retro): mag nearest (chunky), min/mipmap linear trilinear with mipmaps
fn decodeNormal(enc: vec3<f32>) -> vec3<f32> {
  return normalize(enc * 2.0 - 1.0);
}

fn clampLayer(id: f32, count: f32) -> i32 {
  let maxL = max(count - 1.0, 0.0);
  var l = id - 1.0;
  if (l < 0.0) { l = 0.0; }
  if (l > maxL) { l = maxL; }
  return i32(l);
}

// Helper to compute mip LOD from distance – keeps close chunky (lod 0), far uses higher mips to reduce moire
fn calcMipLOD(dist: f32) -> f32 {
  // dist ~1 => lod 0, dist ~4 => lod ~1.6, dist ~8 => lod ~2.4 etc.
  // Scale tuned for 64x64 base and retro look – preserves chunky mag up close, smooths far
  let d = max(dist, 0.5);
  let lod = log2(d) * 1.1;
  return clamp(lod, 0.0, 6.0);
}

fn sampleWallAlbedo(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(wallAlbedo, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleWallNormalRaw(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(wallNormal, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleWallHeight(layer: i32, uv: vec2<f32>, dist: f32) -> f32 {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(wallHeight, nearestSampler, uv, u32(layer), lod).r;
}
fn sampleWallRMA(layer: i32, uv: vec2<f32>, dist: f32) -> vec4<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(wallRoughMetal, nearestSampler, uv, u32(layer), lod);
}

fn sampleFloorAlbedo(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(floorAlbedo, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleFloorNormalRaw(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(floorNormal, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleFloorHeight(layer: i32, uv: vec2<f32>, dist: f32) -> f32 {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(floorHeight, nearestSampler, uv, u32(layer), lod).r;
}
fn sampleFloorRMA(layer: i32, uv: vec2<f32>, dist: f32) -> vec4<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(floorRoughMetal, nearestSampler, uv, u32(layer), lod);
}

fn sampleCeilAlbedo(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(ceilAlbedo, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleCeilNormalRaw(layer: i32, uv: vec2<f32>, dist: f32) -> vec3<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(ceilNormal, nearestSampler, uv, u32(layer), lod).rgb;
}
fn sampleCeilHeight(layer: i32, uv: vec2<f32>, dist: f32) -> f32 {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(ceilHeight, nearestSampler, uv, u32(layer), lod).r;
}
fn sampleCeilRMA(layer: i32, uv: vec2<f32>, dist: f32) -> vec4<f32> {
  let lod = calcMipLOD(dist);
  return textureSampleLevel(ceilRoughMetal, nearestSampler, uv, u32(layer), lod);
}

fn fetchFloorMatId(cell: vec2<i32>) -> f32 {
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) { return 1.0; }
  let m: vec4<f32> = textureLoad(matMapTex, cell, 0);
  let id: f32 = m.r * 255.0;
  if (id < 0.5) { return 1.0; }
  return id;
}
fn fetchCeilMatId(cell: vec2<i32>) -> f32 {
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) { return 1.0; }
  let m: vec4<f32> = textureLoad(matMapTex, cell, 0);
  let id: f32 = m.g * 255.0;
  if (id < 0.5) { return 1.0; }
  return id;
}
`;
