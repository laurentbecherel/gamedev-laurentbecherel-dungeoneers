export const wgslPom = `
// Parallax Occlusion Mapping with grazing safety – exact port of glslPom from 632b7f2

fn pomOffsetArray(heightTex: texture_2d_array<f32>, uv: vec2<f32>, layer: i32, viewTS: vec3<f32>, strength: f32, steps: i32) -> vec2<f32> {
  if (strength <= 0.00001) { return vec2<f32>(0.0, 0.0); }
  let minVz: f32 = select(0.08, frame.pomMinVz, frame.pomMinVz > 0.0);
  let minEff: f32 = select(0.18, frame.pomMinEffVz, frame.pomMinEffVz > 0.0);
  let fadeStart: f32 = select(0.08, frame.pomFadeStart, frame.pomFadeStart > 0.0);
  let fadeEnd: f32 = select(0.22, frame.pomFadeEnd, frame.pomFadeEnd > 0.0);
  let maxOff: f32 = select(0.10, frame.pomMaxOffset, frame.pomMaxOffset > 0.0);

  let vzAbs: f32 = abs(viewTS.z);
  if (vzAbs < minVz) { return vec2<f32>(0.0, 0.0); }
  let effVz: f32 = max(vzAbs, minEff);
  var fullOffset: vec2<f32> = viewTS.xy * strength / effVz;
  var fade: f32 = 1.0;
  if (vzAbs < fadeEnd) { fade = (vzAbs - fadeStart) / max(0.001, fadeEnd - fadeStart); }
  let lenOff: f32 = length(fullOffset);
  if (lenOff > maxOff) { fullOffset = fullOffset * (maxOff / max(lenOff, 0.0001)); }
  fullOffset = fullOffset * clamp(fade, 0.0, 1.0);

  let layerDepth: f32 = 1.0 / f32(max(steps, 1));
  let delta: vec2<f32> = fullOffset / f32(max(steps,1));
  var curUV: vec2<f32> = uv - fullOffset * 0.5;
  var curDepth: f32 = 0.0;
  // Use textureLoad to stay in uniform flow (matches old non-uniform workaround) but with correct centered loop
  // Sample bilinear via textureLoad of 64x64 – we keep point but centered loop restores old visual
  {
    let c = vec2<i32>(clamp(curUV, vec2<f32>(0.0), vec2<f32>(0.999)) * 64.0);
    let h: f32 = textureLoad(heightTex, c, u32(clamp(layer,0,7)), 0).r;
    // first sample stored, loop will handle break check after
    var heightV: f32 = h;
    for (var i: i32 = 0; i < 16; i++) {
      if (i >= steps) { break; }
      if (curDepth >= heightV) { break; }
      curUV += delta;
      let cc = vec2<i32>(clamp(curUV, vec2<f32>(0.0), vec2<f32>(0.999)) * 64.0);
      heightV = textureLoad(heightTex, cc, u32(clamp(layer,0,7)), 0).r;
      curDepth += layerDepth;
    }
  }
  return curUV - uv;
}

fn sampleWallCompositeHeight(baseLayer: i32, fixtureLayer: i32, uv: vec2<f32>) -> f32 {
  let c = vec2<i32>(clamp(uv, vec2<f32>(0.0), vec2<f32>(0.999)) * 64.0);
  let bl: u32 = u32(clamp(baseLayer, 0, 7));
  let fl: u32 = u32(clamp(fixtureLayer, 0, 7));
  let baseH: f32 = textureLoad(wallHeight, c, bl, 0).r;
  let fixtureH: f32 = textureLoad(wallHeight, c, fl, 0).r;
  let coverage: f32 = textureLoad(wallAlbedo, c, fl, 0).a;
  return mix(baseH, fixtureH, coverage);
}

fn pomOffsetWallComposite(uv: vec2<f32>, baseLayer: i32, fixtureLayer: i32, viewTS: vec3<f32>, strength: f32, steps: i32) -> vec2<f32> {
  if (strength <= 0.00001) { return vec2<f32>(0.0); }
  let vzAbs: f32 = abs(viewTS.z);
  let minVz: f32 = select(0.08, frame.pomMinVz, frame.pomMinVz > 0.0);
  if (vzAbs < minVz) { return vec2<f32>(0.0); }
  let effVz: f32 = max(vzAbs, select(0.18, frame.pomMinEffVz, frame.pomMinEffVz > 0.0));
  var fullOffset: vec2<f32> = viewTS.xy * strength / effVz;
  let maxOff: f32 = select(0.10, frame.pomMaxOffset, frame.pomMaxOffset > 0.0);
  let lenOff: f32 = length(fullOffset);
  if (lenOff > maxOff) { fullOffset *= maxOff / max(lenOff, 0.0001); }
  let count: i32 = max(steps, 1);
  let delta: vec2<f32> = fullOffset / f32(count);
  var curUV: vec2<f32> = uv - fullOffset * 0.5;
  var curDepth: f32 = 0.0;
  var heightV: f32 = sampleWallCompositeHeight(baseLayer, fixtureLayer, curUV);
  for (var i: i32 = 0; i < 16; i++) {
    if (i >= count || curDepth >= heightV) { break; }
    curUV += delta;
    heightV = sampleWallCompositeHeight(baseLayer, fixtureLayer, curUV);
    curDepth += 1.0 / f32(count);
  }
  return curUV - uv;
}
`;
