export const wgslSSR = `
// SSR helpers – WGSL port

fn octaEncodeSSR(n: vec3<f32>) -> vec2<f32> {
  var nn: vec3<f32> = n / (abs(n.x) + abs(n.y) + abs(n.z));
  var enc: vec2<f32> = nn.xy;
  if (nn.z < 0.0) {
    enc = (1.0 - abs(vec2<f32>(enc.y, enc.x))) * vec2<f32>(select(-1.0, 1.0, nn.x >= 0.0), select(-1.0, 1.0, nn.y >= 0.0));
  }
  return enc * 0.5 + 0.5;
}

fn octaDecodeSSR(enc: vec2<f32>) -> vec3<f32> {
  let f: vec2<f32> = enc * 2.0 - 1.0;
  var n: vec3<f32> = vec3<f32>(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  let t: f32 = max(0.0, -n.z);
  n.x = n.x + select(t, -t, n.x >= 0.0);
  n.y = n.y + select(t, -t, n.y >= 0.0);
  return normalize(n);
}

fn worldToScreenUVSSR(worldPos: vec3<f32>, camPos: vec2<f32>, eyeZ: f32, playerAngle: f32, planeLen: f32, resolution: vec2<f32>, bobPixels: f32) -> vec3<f32> {
  let dx: f32 = worldPos.x - camPos.x;
  let dy: f32 = worldPos.y - camPos.y;
  let dirX: f32 = cos(playerAngle);
  let dirY: f32 = sin(playerAngle);
  let rightX: f32 = -dirY;
  let rightY: f32 = dirX;
  var forwardDist: f32 = dx * dirX + dy * dirY;
  let rightDist: f32 = dx * rightX + dy * rightY;
  if (forwardDist < 0.20) { forwardDist = 0.20; }
  let cameraX: f32 = rightDist / forwardDist / max(0.0001, planeLen);
  let uvX: f32 = cameraX * 0.5 + 0.5;
  let fovFactor: f32 = 1.0 / max(0.0001, planeLen);
  let aspect: f32 = resolution.x / max(1.0, resolution.y);
  let yShift: f32 = (eyeZ - worldPos.z) / forwardDist * fovFactor * 0.5 * aspect;
  let uvY_noBob: f32 = 0.5 - yShift;
  let uvY: f32 = uvY_noBob + bobPixels / max(1.0, resolution.y);
  return vec3<f32>(uvX, uvY, forwardDist);
}

struct SSRResult {
  color: vec3<f32>,
  hit: f32,
  fade: f32,
  rayLength: f32,
  hitUV: vec2<f32>,
};

fn traceScreenSpaceRaySSR(startUV: vec2<f32>, N: vec3<f32>, V: vec3<f32>, linearDepth: f32, puddleMask: f32, roughness: f32, resolution: vec2<f32>, steps: i32, binarySteps: i32, maxDistance: f32, thickness: f32, stride: f32, jitter: f32, depthBias: f32, zThicknessScale: f32, camPos: vec2<f32>, eyeZ: f32, playerAngle: f32, planeLen: f32, bobPixels: f32) -> SSRResult {
  var res: SSRResult;
  res.color = vec3<f32>(0.0, 0.0, 0.0);
  res.hit = 0.0;
  res.fade = 0.0;
  res.rayLength = 0.0;
  res.hitUV = startUV;

  var R: vec3<f32> = reflect(-V, N);
  let effectiveJitter: f32 = jitter * clamp(roughness * 4.0, 0.0, 1.0);
  if (abs(R.z) < 0.001) { R.z = 0.001; }
  if (dot(R, vec3<f32>(0.0, 0.0, 1.0)) < -0.999) { return res; }

  // reconstruct world start
  let fragCoord: vec2<f32> = vec2<f32>(startUV.x * resolution.x, (1.0 - startUV.y) * resolution.y);
  let cameraX0: f32 = 2.0 * fragCoord.x / resolution.x - 1.0;
  let rayDir0: vec2<f32> = vec2<f32>(cos(playerAngle), sin(playerAngle));
  let plane0: vec2<f32> = vec2<f32>(-rayDir0.y, rayDir0.x) * planeLen;
  let ray0: vec2<f32> = rayDir0 + plane0 * cameraX0;
  let worldPos: vec3<f32> = vec3<f32>(camPos + ray0 * linearDepth, 0.0);

  var noise: f32 = 0.0;
  if (effectiveJitter > 0.001) {
    let noiseUV: vec2<f32> = fract(startUV * resolution / 64.0);
    // sample blue noise – SampleLevel to allow non-uniform flow
    noise = textureSampleLevel(blueNoiseTex, nearestSampler, noiseUV, 0.0).r * 2.0 - 1.0;
  }

  var tRay: f32 = depthBias + abs(noise) * effectiveJitter * 0.08;
  var tStep: f32 = 0.12;

  for (var i: i32 = 0; i < 64; i++) {
    if (i >= steps) { break; }
    if (tRay > maxDistance) { break; }
    let reflectedWorld: vec3<f32> = worldPos + R * tRay;
    let proj: vec3<f32> = worldToScreenUVSSR(reflectedWorld, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
    let uv: vec2<f32> = proj.xy;
    let fwDist: f32 = proj.z;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      tRay += tStep; tStep = tStep * stride; continue;
    }
    let uvFlip: vec2<f32> = vec2<f32>(uv.x, 1.0 - uv.y);
    let gSmpl: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, uvFlip, 0.0);
    let sampledDepthNorm: f32 = gSmpl.b;
    if (sampledDepthNorm < 0.001) { tRay += tStep; tStep = tStep * stride; continue; }
    let sampledN: vec3<f32> = octaDecodeSSR(gSmpl.rg);
    if (sampledN.z > 0.60) { tRay += tStep; tStep = tStep * stride; continue; }
    // Use maxDistance for thickness test (small lib, no frame uniform – use param, main Full path uses frame.ssrDepthRange)
    let sampledLin: f32 = sampledDepthNorm * maxDistance;
    let depthDiff: f32 = fwDist - sampledLin;
    let curThickness: f32 = thickness + tRay * zThicknessScale * 0.08;
    if (abs(depthDiff) < curThickness) {
      res.hit = 1.0;
      res.hitUV = uv;
      res.color = textureSampleLevel(sceneTex, nearestSampler, uvFlip, 0.0).rgb;
      res.rayLength = tRay;
      var lowT: f32 = tRay - tStep;
      var highT: f32 = tRay;
      for (var b: i32 = 0; b < 8; b++) {
        if (b >= binarySteps) { break; }
        let midT: f32 = mix(lowT, highT, 0.5);
        let midW: vec3<f32> = worldPos + R * midT;
        let midProj: vec3<f32> = worldToScreenUVSSR(midW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
        let midFlip: vec2<f32> = vec2<f32>(midProj.x, 1.0 - midProj.y + bobPixels / max(1.0, resolution.y));
        let midG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, midFlip, 0.0);
        let midDepthNorm: f32 = midG.b;
        if (midDepthNorm < 0.001) { lowT = midT; continue; }
        let midN: vec3<f32> = octaDecodeSSR(midG.rg);
        if (midN.z > 0.60) { lowT = midT; continue; }
        let midLin: f32 = midDepthNorm * maxDistance;
        let midDiff: f32 = midProj.z - midLin;
        if (abs(midDiff) < curThickness) { highT = midT; } else { lowT = midT; }
      }
      let finalW: vec3<f32> = worldPos + R * highT;
      let finalProj: vec3<f32> = worldToScreenUVSSR(finalW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
      let finalFlip: vec2<f32> = vec2<f32>(finalProj.x, 1.0 - finalProj.y + bobPixels / max(1.0, resolution.y));
      let finalG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, finalFlip, 0.0);
      let finalN: vec3<f32> = octaDecodeSSR(finalG.rg);
      if (finalG.b > 0.001 && finalN.z <= 0.60) {
        res.hitUV = finalProj.xy;
        res.color = textureSampleLevel(sceneTex, nearestSampler, finalFlip, 0.0).rgb;
        res.rayLength = highT;
      } else {
        res.hit = 0.0;
      }
      if (res.hit > 0.5) { break; }
    }
    tRay += tStep;
    tStep = tStep * stride;
  }

  // Fallback � no clamp, edge margin
  if (res.hit < 0.5 && puddleMask > 0.02) {
    let fallbackW: vec3<f32> = worldPos + R * (maxDistance * 0.85);
    let fProj: vec3<f32> = worldToScreenUVSSR(fallbackW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels);
    let fUV: vec2<f32> = fProj.xy;
    if (fUV.x >= 0.05 && fUV.x <= 0.95 && fUV.y >= 0.10 && fUV.y <= 0.90) {
      let fUVFlip: vec2<f32> = vec2<f32>(fUV.x, 1.0 - fUV.y + bobPixels / max(1.0, resolution.y));
      let fG: vec4<f32> = textureSampleLevel(gNormalDepthTex, nearestSampler, fUVFlip, 0.0);
      let fN: vec3<f32> = octaDecodeSSR(fG.rg);
      if (fG.b > 0.001 && fN.z <= 0.60) {
        res.color = textureSampleLevel(sceneTex, nearestSampler, fUVFlip, 0.0).rgb * 0.7;
        res.hit = 0.5;
        res.hitUV = fUV;
        res.rayLength = maxDistance * 0.85;
      }
    }
  }

  return res;
}
`;

