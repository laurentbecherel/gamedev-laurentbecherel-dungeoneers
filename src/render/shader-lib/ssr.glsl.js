export const glslSSR = `
// octa
vec2 octaEncodeSSR(vec3 n){ n/=(abs(n.x)+abs(n.y)+abs(n.z)); vec2 enc=n.xy; if(n.z<0.0){ enc=(1.0-abs(enc.yx))*vec2(n.x>=0.0?1.0:-1.0,n.y>=0.0?1.0:-1.0);} return enc*0.5+0.5; }
vec3 octaDecodeSSR(vec2 enc){ vec2 f=enc*2.0-1.0; vec3 n=vec3(f.x,f.y,1.0-abs(f.x)-abs(f.y)); float t=max(0.0,-n.z); n.xy+=vec2(n.x>=0.0?-t:t,n.y>=0.0?-t:t); return normalize(n); }

// world -> screen UV for raycast cam - FIXED Y sign (was inverted, causing weird orientation)
// forwardDist = dot(world-cam, dir), rightDist = dot(world-cam, right), cameraX = rightDist/forwardDist/planeLen, uvX = cameraX*0.5+0.5
// uvY = 0.5 - (eyeZ - worldZ)/forwardDist * fovFactor *0.5 (was + before, inverted)
vec3 worldToScreenUVSSR(vec3 worldPos, vec2 camPos, float eyeZ, float playerAngle, float planeLen, vec2 resolution, out float forwardDist){
  float dx = worldPos.x - camPos.x;
  float dy = worldPos.y - camPos.y;
  float dirX = cos(playerAngle);
  float dirY = sin(playerAngle);
  float rightX = -dirY;
  float rightY = dirX;
  forwardDist = dx * dirX + dy * dirY;
  float rightDist = dx * rightX + dy * rightY;
  if (forwardDist < 0.06) forwardDist = 0.06;
  float cameraX = rightDist / forwardDist / max(0.0001, planeLen);
  float uvX = cameraX * 0.5 + 0.5;
  float fovFactor = 1.0 / max(0.0001, planeLen);
  float yShift = (eyeZ - worldPos.z) / forwardDist * fovFactor * 0.5;
  float uvY = 0.5 - yShift; // FIXED: was + before, now - so floor (z=0) is below horizon 0.5
  return vec3(uvX, uvY, 0.0);
}

struct SSRResult{ vec3 color; float hit; float fade; float rayLength; vec2 hitUV; };

SSRResult traceScreenSpaceRaySSR(in vec2 startUV, in vec3 N, in vec3 V, in float linearDepth, in float puddleMask, in float roughness, in sampler2D sceneTex, in sampler2D gNormalDepthTex, in sampler2D blueNoiseTex, in vec2 resolution, in int steps, in int binarySteps, in float maxDistance, in float thickness, in float stride, in float jitter, in float depthBias, in float zThicknessScale, in float maxRayAngle, in vec2 camPos, in float eyeZ, in float playerAngle, in float planeLen){
  SSRResult res; res.color=vec3(0.0); res.hit=0.0; res.fade=0.0; res.rayLength=0.0; res.hitUV=startUV;
  vec3 R = reflect(-V, N);
  // low roughness mirror should have minimal jitter
  float effectiveJitter = jitter * clamp(roughness * 4.0, 0.0, 1.0);
  if (abs(R.z) < 0.001) { R.z = 0.001; }
  // quick grazing reject
  if (dot(R, vec3(0,0,1)) < -0.999) return res;

  // reconstruct world start from startUV + linearDepth
  // caller provides cam info via extra params
  vec2 fragCoord = vec2(startUV.x * resolution.x, (1.0 - startUV.y) * resolution.y);
  float cameraX0 = 2.0 * fragCoord.x / resolution.x - 1.0;
  vec2 rayDir0 = vec2(cos(playerAngle), sin(playerAngle));
  vec2 plane0 = vec2(-rayDir0.y, rayDir0.x) * planeLen;
  vec2 ray0 = rayDir0 + plane0 * cameraX0;
  vec3 worldPos = vec3(camPos + ray0 * linearDepth, 0.0);

  float noise = 0.0;
  if (effectiveJitter > 0.001) {
    vec2 noiseUV = fract(startUV * resolution / 64.0);
    noise = texture(blueNoiseTex, noiseUV).r * 2.0 - 1.0;
  }

  float tRay = depthBias + abs(noise) * effectiveJitter * 0.08;
  float tStep = 0.12;

  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    if (tRay > maxDistance) break;
    vec3 reflectedWorld = worldPos + R * tRay;
    float fwDist;
    vec3 proj = worldToScreenUVSSR(reflectedWorld, camPos, eyeZ, playerAngle, planeLen, resolution, fwDist);
    vec2 uv = proj.xy;
    if (uv.x < -0.15 || uv.x > 1.15 || uv.y < -0.15 || uv.y > 1.15) { tRay += tStep; tStep *= stride; continue; }
    float sampledDepthNorm = texture(gNormalDepthTex, uv).b;
    if (sampledDepthNorm < 0.001) { tRay += tStep; tStep *= stride; continue; }
    float sampledLin = sampledDepthNorm * maxDistance; // assume depthRange ~ maxDistance for thickness test simplification
    // Actually use proper depthRange via uniform? We'll approximate with maxDistance
    float depthDiff = fwDist - sampledLin;
    float curThickness = thickness + tRay * zThicknessScale * 0.08;
    if (abs(depthDiff) < curThickness) {
      res.hit = 1.0;
      res.hitUV = uv;
      res.color = texture(sceneTex, uv).rgb;
      res.rayLength = tRay;
      // binary refine
      float lowT = tRay - tStep;
      float highT = tRay;
      for (int b = 0; b < 8; b++) {
        if (b >= binarySteps) break;
        float midT = mix(lowT, highT, 0.5);
        vec3 midW = worldPos + R * midT;
        float midFd;
        vec3 midProj = worldToScreenUVSSR(midW, camPos, eyeZ, playerAngle, planeLen, resolution, midFd);
        float midDepthNorm = texture(gNormalDepthTex, midProj.xy).b;
        float midLin = midDepthNorm * maxDistance;
        float midDiff = midFd - midLin;
        if (midDepthNorm > 0.001 && abs(midDiff) < curThickness) highT = midT; else lowT = midT;
      }
      vec3 finalW = worldPos + R * highT;
      float finalFd;
      vec3 finalProj = worldToScreenUVSSR(finalW, camPos, eyeZ, playerAngle, planeLen, resolution, finalFd);
      res.hitUV = finalProj.xy;
      res.color = texture(sceneTex, finalProj.xy).rgb;
      res.rayLength = highT;
      break;
    }
    tRay += tStep;
    tStep *= stride;
  }

  if (res.hit < 0.5 && puddleMask > 0.02) {
    // fallback with proper projection - sample forward wall
    vec3 fallbackW = worldPos + R * (maxDistance * 0.5);
    float fDist;
    vec3 fProj = worldToScreenUVSSR(fallbackW, camPos, eyeZ, playerAngle, planeLen, resolution, fDist);
    vec2 fUV = clamp(fProj.xy, 0.0, 1.0);
    // only if fUV is in upper half (walls), not floor again
    if (fUV.y > 0.52) {
      res.color = texture(sceneTex, fUV).rgb * 0.7;
      res.hit = 0.5;
      res.hitUV = fUV;
      res.rayLength = maxDistance * 0.5;
    }
  }

  return res;
}
`;

