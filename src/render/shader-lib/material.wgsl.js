export const wgslMaterial = `
// ----- material helpers (array path) – nearest sampling preserves the retro pixel-art material detail
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

// Explicit LOD keeps array sampling valid in non-uniform fragment control flow.
fn sampleWallAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(wallAlbedo, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleWallAlbedoRGBA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(wallAlbedo, materialSampler, uv, u32(layer), 0.0);
}
fn sampleWallNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(wallNormal, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleWallHeight(layer: i32, uv: vec2<f32>) -> f32 {
  return textureSampleLevel(wallHeight, materialSampler, uv, u32(layer), 0.0).r;
}
fn sampleWallRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(wallRoughMetal, materialSampler, uv, u32(layer), 0.0);
}

fn sampleFloorAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(floorAlbedo, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleFloorNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(floorNormal, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleFloorHeight(layer: i32, uv: vec2<f32>) -> f32 {
  return textureSampleLevel(floorHeight, materialSampler, uv, u32(layer), 0.0).r;
}
fn sampleFloorRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(floorRoughMetal, materialSampler, uv, u32(layer), 0.0);
}

fn sampleCeilAlbedo(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(ceilAlbedo, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleCeilNormalRaw(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  return textureSampleLevel(ceilNormal, materialSampler, uv, u32(layer), 0.0).rgb;
}
fn sampleCeilHeight(layer: i32, uv: vec2<f32>) -> f32 {
  return textureSampleLevel(ceilHeight, materialSampler, uv, u32(layer), 0.0).r;
}
fn sampleCeilRMA(layer: i32, uv: vec2<f32>) -> vec4<f32> {
  return textureSampleLevel(ceilRoughMetal, materialSampler, uv, u32(layer), 0.0);
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
