export const wgslMaterial = `
// ----- material helpers (array path) – uses textureLoad to avoid uniform control flow restriction
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

// Use textureLoad for array textures – avoids "must only be called from uniform control flow"
// Assumes texture size 64x64 (our material gen) – UV 0..1 -> i32(uv*64)
fn sampleWallAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64;
  let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(wallAlbedo, c, u32(layer), 0).rgb;
}
fn sampleWallNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64;
  let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(wallNormal, c, u32(layer), 0).rgb;
}
fn sampleWallHeight(layer: i32, uv: vec2<f32>) -> f32 {
  let size = 64;
  let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(wallHeight, c, u32(layer), 0).r;
}
fn sampleWallRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  let size = 64;
  let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(wallRoughMetal, c, u32(layer), 0);
}

fn sampleFloorAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(floorAlbedo, c, u32(layer), 0).rgb;
}
fn sampleFloorNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(floorNormal, c, u32(layer), 0).rgb;
}
fn sampleFloorHeight(layer: i32, uv: vec2<f32>) -> f32 {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(floorHeight, c, u32(layer), 0).r;
}
fn sampleFloorRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(floorRoughMetal, c, u32(layer), 0);
}

fn sampleCeilAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(ceilAlbedo, c, u32(layer), 0).rgb;
}
fn sampleCeilNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(ceilNormal, c, u32(layer), 0).rgb;
}
fn sampleCeilHeight(layer: i32, uv: vec2<f32>) -> f32 {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(ceilHeight, c, u32(layer), 0).r;
}
fn sampleCeilRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  let size = 64; let c = vec2<i32>(vec2<f32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
  return textureLoad(ceilRoughMetal, c, u32(layer), 0);
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
