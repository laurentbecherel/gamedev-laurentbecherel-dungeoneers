export const fsDepthOfFieldWgsl = `
struct DepthOfFieldUniforms {
  sharpUntil: f32,
  fullEffectAt: f32,
  curve: f32,
  strength: f32,
  maxBlockPixels: f32,
  referenceHeight: f32,
  filterStrength: f32,
  filterRadius: f32,
  absoluteThreshold: f32,
  relativeThreshold: f32,
  depthRange: f32,
  _pad0: f32,
  enabled: u32,
  filterPattern: u32,
  debugView: u32,
  scaleWithResolution: u32,
};

@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var normalDepthTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> dof: DepthOfFieldUniforms;

fn clampedCoord(coord: vec2<i32>, dims: vec2<i32>) -> vec2<i32> {
  return clamp(coord, vec2<i32>(0), dims - vec2<i32>(1));
}

fn linearDepthAt(coord: vec2<i32>, dims: vec2<i32>) -> f32 {
  return textureLoad(normalDepthTex, clampedCoord(coord, dims), 0).b * dof.depthRange;
}

fn sampleAccepted(sampleCoord: vec2<i32>, baseDepth: f32, dims: vec2<i32>) -> bool {
  let sampleDepth = linearDepthAt(sampleCoord, dims);
  let threshold = dof.absoluteThreshold + baseDepth * dof.relativeThreshold;
  return abs(sampleDepth - baseDepth) <= threshold;
}

@fragment
fn fs_main(@builtin(position) fragPos: vec4<f32>) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(textureDimensions(sourceTex));
  let coord = clampedCoord(vec2<i32>(fragPos.xy), dims);
  let original = textureLoad(sourceTex, coord, 0);
  let baseDepth = linearDepthAt(coord, dims);
  let distanceSpan = max(0.001, dof.fullEffectAt - dof.sharpUntil);
  let rawFactor = clamp((baseDepth - dof.sharpUntil) / distanceSpan, 0.0, 1.0);
  let smoothFactor = rawFactor * rawFactor * (3.0 - 2.0 * rawFactor);
  let factor = pow(smoothFactor, max(0.05, dof.curve));

  var resolutionScale = 1.0;
  if (dof.scaleWithResolution != 0u) {
    resolutionScale = f32(dims.y) / max(1.0, dof.referenceHeight);
  }
  let maxBlock = max(1.0, dof.maxBlockPixels * resolutionScale);
  let blockSize = max(1, i32(round(mix(1.0, maxBlock, factor))));
  let blockExtent = vec2<i32>(blockSize);
  let blockCenter = clampedCoord((coord / blockExtent) * blockExtent + vec2<i32>(blockSize / 2), dims);
  let spread = max(1, i32(round(f32(blockSize) * dof.filterRadius * 0.5)));

  let offsets = array<vec2<i32>, 9>(
    vec2<i32>(0, 0),
    vec2<i32>(1, 0), vec2<i32>(-1, 0),
    vec2<i32>(0, 1), vec2<i32>(0, -1),
    vec2<i32>(1, 1), vec2<i32>(-1, 1),
    vec2<i32>(1, -1), vec2<i32>(-1, -1)
  );
  var sampleCount = 1;
  if (dof.filterPattern == 1u) { sampleCount = 5; }
  if (dof.filterPattern >= 2u) { sampleCount = 9; }

  var accumulated = vec3<f32>(0.0);
  var accepted = 0.0;
  var rejected = 0.0;
  var nearestColor = original.rgb;
  for (var i: i32 = 0; i < 9; i++) {
    if (i >= sampleCount) { break; }
    let sampleCoord = clampedCoord(blockCenter + offsets[i] * vec2<i32>(spread), dims);
    if (sampleAccepted(sampleCoord, baseDepth, dims)) {
      let sampleColor = textureLoad(sourceTex, sampleCoord, 0).rgb;
      accumulated += sampleColor;
      accepted += 1.0;
      if (i == 0) { nearestColor = sampleColor; }
    } else {
      rejected += 1.0;
    }
  }
  let averaged = select(original.rgb, accumulated / max(1.0, accepted), accepted > 0.0);
  let pixelated = mix(nearestColor, averaged, dof.filterStrength);
  let enabledAmount = select(0.0, 1.0, dof.enabled != 0u);
  let effectAmount = factor * dof.strength * enabledAmount;
  var finalColor = mix(original.rgb, pixelated, effectAmount);

  if (dof.debugView == 1u) {
    let value = pow(clamp(baseDepth / max(0.001, dof.depthRange), 0.0, 1.0), 0.55);
    finalColor = vec3<f32>(value);
  } else if (dof.debugView == 2u) {
    finalColor = vec3<f32>(factor);
  } else if (dof.debugView == 3u) {
    let value = f32(blockSize) / max(1.0, maxBlock);
    finalColor = vec3<f32>(value, factor, 1.0 - value);
  } else if (dof.debugView == 4u) {
    let value = rejected / max(1.0, f32(sampleCount));
    finalColor = vec3<f32>(value, accepted / max(1.0, f32(sampleCount)), 0.0);
  }
  return vec4<f32>(finalColor, original.a);
}
`;
