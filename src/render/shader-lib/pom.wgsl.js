export const wgslPom = `
// Parallax Occlusion Mapping with grazing safety

fn pomOffsetArray(heightTex: texture_2d_array<f32>, uv: vec2<f32>, layer: i32, viewTS: vec3<f32>, strength: f32, steps: i32) -> vec2<f32> {
  let minVz: f32 = frame.pomMinVz;
  let minEffVz: f32 = frame.pomMinEffVz;
  let maxOffset: f32 = frame.pomMaxOffset;
  let fadeStart: f32 = frame.pomFadeStart;
  let fadeEnd: f32 = frame.pomFadeEnd;

  let vzAbs: f32 = abs(viewTS.z);
  if (vzAbs < minVz) {
    return vec2<f32>(0.0, 0.0);
  }
  let effVz: f32 = max(vzAbs, minEffVz);
  var fullOffset: vec2<f32> = viewTS.xy * strength / effVz;
  let lenOff: f32 = length(fullOffset);
  if (lenOff > maxOffset) {
    fullOffset = fullOffset * (maxOffset / max(lenOff, 0.0001));
  }
  // fade at grazing
  let fade: f32 = smoothstep(fadeStart, fadeEnd, vzAbs);
  fullOffset = fullOffset * fade;

  var curOffset: f32 = 0.0;
  var curDepth: f32 = 0.0;
  var curUV: vec2<f32> = uv - fullOffset * 0.5;
  let stepSize: f32 = 1.0 / f32(steps);
  for (var i: i32 = 0; i < 32; i++) {
    if (i >= steps) { break; }
    // Use textureLoad to avoid uniform control flow requirement (non-uniform ray direction)
    let size = 64;
    let c = vec2<i32>(vec2<f32>(clamp(curUV, vec2<f32>(0.0), vec2<f32>(0.999)) * f32(size)));
    let h: f32 = textureLoad(heightTex, c, u32(layer), 0).r;
    if (curDepth >= h) { break; }
    curOffset += stepSize;
    curDepth = curOffset;
    curUV = uv - fullOffset * curOffset;
  }

  // refinement binary? Keep simple
  return fullOffset * curDepth;
}
`;
