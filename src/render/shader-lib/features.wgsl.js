export const wgslFeatures = `
const FEATURE_NONE: u32 = 0u;
const FEATURE_CHANNEL: u32 = 1u;
const FEATURE_GRILLE: u32 = 2u;
const FEATURE_N: u32 = 1u;
const FEATURE_E: u32 = 2u;
const FEATURE_S: u32 = 4u;
const FEATURE_W: u32 = 8u;
const FEATURE_FILL_WATER: u32 = 1u;
const FEATURE_FLOW_REVERSED: u32 = 1u;

fn featureKind(word: u32) -> u32 { return word & 255u; }
fn featureConnections(word: u32) -> u32 { return (word >> 8u) & 15u; }
fn featureProfile(word: u32) -> u32 { return (word >> 12u) & 255u; }
fn featureFill(word: u32) -> u32 { return (word >> 20u) & 255u; }
fn featureFlags(word: u32) -> u32 { return (word >> 28u) & 15u; }

fn featureFaceForWallHit(side: i32, stepDir: vec2<i32>) -> u32 {
  if (side == 0) { return select(FEATURE_E, FEATURE_W, stepDir.x > 0); }
  return select(FEATURE_S, FEATURE_N, stepDir.y > 0);
}

fn isFeatureWallFace(word: u32, kind: u32, side: i32, stepDir: vec2<i32>) -> bool {
  return featureKind(word) == kind && (featureConnections(word) & featureFaceForWallHit(side, stepDir)) != 0u;
}

fn loadFeatureCell(cell: vec2<i32>) -> u32 {
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) { return 0u; }
  let idx: u32 = u32(cell.y) * u32(frame.mapSize.x) + u32(cell.x);
  return featureCellBuffer.data[idx];
}

struct FloorFeatureGeometry {
  renderHeight: f32,
  groundHeight: f32,
  macroNormal: vec3<f32>,
  bankT: f32,
  liquidMask: f32,
  edgeFactor: f32,
  flowDir: vec2<f32>,
  word: u32,
};

fn resolveFeatureFloor(worldXY: vec2<f32>, baseHeight: f32) -> FloorFeatureGeometry {
  let cell: vec2<i32> = vec2<i32>(floor(worldXY));
  let word: u32 = loadFeatureCell(cell);
  var out: FloorFeatureGeometry;
  out.renderHeight = baseHeight;
  out.groundHeight = baseHeight;
  out.macroNormal = vec3<f32>(0.0, 0.0, 1.0);
  out.bankT = 0.0;
  out.liquidMask = 0.0;
  out.edgeFactor = 0.0;
  out.flowDir = vec2<f32>(0.0);
  out.word = word;
  if (featureUniforms.system.x < 0.5 || featureKind(word) != FEATURE_CHANNEL) { return out; }

  let conn: u32 = featureConnections(word);
  let ns: bool = (conn & (FEATURE_N | FEATURE_S)) == (FEATURE_N | FEATURE_S);
  let local: vec2<f32> = fract(worldXY);
  let across: f32 = select(local.y, local.x, ns);
  let width: f32 = clamp(featureUniforms.channel.x, 0.05, 0.98);
  let depth: f32 = max(0.0, featureUniforms.channel.y);
  let halfW: f32 = width * 0.5;
  let bankW: f32 = clamp(featureUniforms.channel.z, 0.01, halfW);
  let bedHalf: f32 = max(0.0, halfW - bankW);
  let signedAcross: f32 = across - 0.5;
  let d: f32 = abs(signedAcross);
  var bankT: f32 = 0.0;
  var dhda: f32 = 0.0;
  if (d < halfW) {
    if (d <= bedHalf) {
      bankT = 1.0;
    } else {
      let rawT: f32 = clamp((halfW - d) / bankW, 0.0, 1.0);
      let sharpness: f32 = max(1.0, featureUniforms.materials.z);
      let t: f32 = 1.0 - pow(1.0 - rawT, sharpness);
      bankT = t * t * (3.0 - 2.0 * t);
      let signAcross: f32 = select(-1.0, 1.0, signedAcross >= 0.0);
      let dCurveDt: f32 = sharpness * pow(1.0 - rawT, sharpness - 1.0);
      dhda = depth * (6.0 * t * (1.0 - t)) * dCurveDt / bankW * signAcross;
    }
  }
  let ground: f32 = baseHeight - depth * bankT;
  let waterHeight: f32 = baseHeight - depth + clamp(featureUniforms.channel.w, 0.0, depth);
  let hasWater: bool = featureFill(word) == FEATURE_FILL_WATER;
  let surfaceEpsilon: f32 = max(featureUniforms.rayIntersection.w, 0.000001);
  let liquid: f32 = select(0.0, 1.0, hasWater && ground < waterHeight - surfaceEpsilon && d < halfW);
  out.groundHeight = ground;
  out.renderHeight = mix(ground, waterHeight, liquid);
  let slopeNormal: vec3<f32> = select(vec3<f32>(0.0, -dhda, 1.0), vec3<f32>(-dhda, 0.0, 1.0), ns);
  out.macroNormal = normalize(mix(slopeNormal, vec3<f32>(0.0,0.0,1.0), liquid));
  out.bankT = bankT;
  out.liquidMask = liquid;
  let edgeBlendDepth: f32 = max(featureUniforms.waterAppearance.x, surfaceEpsilon);
  out.edgeFactor = liquid * (1.0 - smoothstep(0.0, edgeBlendDepth, abs(ground - waterHeight)));
  var flow: vec2<f32> = select(vec2<f32>(1.0,0.0), vec2<f32>(0.0,1.0), ns);
  if ((featureFlags(word) & FEATURE_FLOW_REVERSED) != 0u) { flow = -flow; }
  out.flowDir = flow;
  return out;
}

struct FeatureFloorRayHit {
  distance: f32,
  height: f32,
  worldXY: vec2<f32>,
};

fn featureFloorHeightAt(worldXY: vec2<f32>) -> f32 {
  let cell: vec2<i32> = vec2<i32>(floor(worldXY));
  if (cell.x < 0 || cell.y < 0 || cell.x >= i32(frame.mapSize.x) || cell.y >= i32(frame.mapSize.y)) {
    return 0.0;
  }
  let mapSample: vec4<f32> = textureLoad(mapTex, cell, 0);
  if (i32(mapSample.r * 255.0 + 0.5) != 0) { return 0.0; }
  return resolveFeatureFloor(worldXY, 0.0).renderHeight;
}

// The ordinary floor projection gives the first possible hit. For a recessed
// feature, scan only the extra interval introduced by its configured depth,
// then bisect the first crossing. This avoids fixed-point oscillation between
// the flat floor and water planes at grazing view angles.
fn traceFeatureFloorSurface(origin: vec2<f32>, ray: vec2<f32>, eyeZ: f32, flatDistance: f32, verticalSlope: f32, distanceLimit: f32) -> FeatureFloorRayHit {
  var out: FeatureFloorRayHit;
  out.distance = flatDistance;
  out.worldXY = origin + ray * flatDistance;
  out.height = featureFloorHeightAt(out.worldXY);

  let surfaceEpsilon: f32 = max(featureUniforms.rayIntersection.w, 0.000001);
  if (out.height >= -surfaceEpsilon) { return out; }

  let slope: f32 = max(verticalSlope, surfaceEpsilon);
  let maxDrop: f32 = max(featureUniforms.channel.y, 0.0);
  let tracePadding: f32 = max(featureUniforms.rayIntersection.z, 0.0);
  let endDistance: f32 = min(flatDistance + maxDrop / slope + tracePadding, distanceLimit);
  let scanSteps: i32 = clamp(i32(featureUniforms.rayIntersection.x + 0.5), 1, 32);
  let binarySteps: i32 = clamp(i32(featureUniforms.rayIntersection.y + 0.5), 0, 12);
  var previousDistance: f32 = flatDistance;
  var lowDistance: f32 = flatDistance;
  var highDistance: f32 = endDistance;
  var found: bool = false;

  for (var i: i32 = 1; i <= 32; i++) {
    if (i > scanSteps) { break; }
    let sampleDistance: f32 = mix(flatDistance, endDistance, f32(i) / f32(scanSteps));
    let sampleWorld: vec2<f32> = origin + ray * sampleDistance;
    let rayHeight: f32 = eyeZ - sampleDistance * slope;
    let surfaceHeight: f32 = featureFloorHeightAt(sampleWorld);
    let gap: f32 = rayHeight - surfaceHeight;
    if (!found && gap <= 0.0) {
      lowDistance = previousDistance;
      highDistance = sampleDistance;
      found = true;
    }
    if (!found) { previousDistance = sampleDistance; }
  }

  if (found) {
    for (var i: i32 = 0; i < 12; i++) {
      if (i >= binarySteps) { break; }
      let middle: f32 = (lowDistance + highDistance) * 0.5;
      let middleWorld: vec2<f32> = origin + ray * middle;
      let gap: f32 = eyeZ - middle * slope - featureFloorHeightAt(middleWorld);
      if (gap > 0.0) { lowDistance = middle; } else { highDistance = middle; }
    }
    out.distance = highDistance;
  } else {
    out.distance = endDistance;
  }
  out.worldXY = origin + ray * out.distance;
  out.height = featureFloorHeightAt(out.worldXY);
  return out;
}

struct WaterSurface {
  albedo: vec3<f32>,
  normal: vec3<f32>,
  roughness: f32,
  reflectionWeight: f32,
};

fn evaluateWaterSurface(worldPos: vec3<f32>, flowDir: vec2<f32>, coverage: f32, edgeFactor: f32) -> WaterSurface {
  let hz: f32 = max(1.0, featureUniforms.waterMotion.w);
  let steppedTime: f32 = floor(frame.time * hz) / hz;
  let scale: f32 = max(0.01, featureUniforms.waterMotion.y);
  let speed: f32 = featureUniforms.waterMotion.z;
  let along: f32 = dot(worldPos.xy, flowDir);
  let across: f32 = dot(worldPos.xy, vec2<f32>(-flowDir.y, flowDir.x));
  let phase: f32 = along * scale - steppedTime * speed * 6.2831853;
  let r1: f32 = sin(phase + across * scale * featureUniforms.waterRipples.x);
  let r2: f32 = cos(phase * featureUniforms.waterRipples.y - across * scale * featureUniforms.waterRipples.z + featureUniforms.waterRipples.w);
  let amp: f32 = featureUniforms.waterMotion.x * coverage;
  let rippleXY: vec2<f32> = flowDir * r1 + vec2<f32>(-flowDir.y, flowDir.x) * r2;
  var out: WaterSurface;
  let shallow: vec3<f32> = featureUniforms.waterShallow.xyz;
  let deep: vec3<f32> = featureUniforms.waterDeep.xyz;
  let noise: f32 = 0.5 + 0.5 * sin((worldPos.x + worldPos.y) * featureUniforms.waterColor.x + steppedTime * featureUniforms.waterColor.y);
  out.albedo = mix(deep, shallow, featureUniforms.waterColor.z + noise * featureUniforms.waterColor.w);
  out.albedo *= 1.0 - edgeFactor * featureUniforms.system.z;
  out.normal = normalize(vec3<f32>(rippleXY * amp, 1.0));
  out.roughness = clamp(featureUniforms.waterShallow.w, featureUniforms.waterAppearance.w, 1.0);
  out.reflectionWeight = clamp(featureUniforms.waterDeep.w * coverage, 0.0, 1.0);
  return out;
}
`;
