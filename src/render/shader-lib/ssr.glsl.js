export const glslSSR = `
// octa
vec2 octaEncodeSSR(vec3 n){ n/=(abs(n.x)+abs(n.y)+abs(n.z)); vec2 enc=n.xy; if(n.z<0.0){ enc=(1.0-abs(enc.yx))*vec2(n.x>=0.0?1.0:-1.0,n.y>=0.0?1.0:-1.0);} return enc*0.5+0.5; }
vec3 octaDecodeSSR(vec2 enc){ vec2 f=enc*2.0-1.0; vec3 n=vec3(f.x,f.y,1.0-abs(f.x)-abs(f.y)); float t=max(0.0,-n.z); n.xy+=vec2(n.x>=0.0?-t:t,n.y>=0.0?-t:t); return normalize(n); }

// world -> screen UV for raycast cam - FIXED Y sign (was inverted, causing weird orientation)
// forwardDist = dot(world-cam, dir), rightDist = dot(world-cam, right), cameraX = rightDist/forwardDist/planeLen, uvX = cameraX*0.5+0.5
// uvY = 0.5 - (eyeZ - worldZ)/forwardDist * fovFactor *0.5 + bobPixels/resY (bob is screen-space vertical shift from renderer-gpu.js)
// NOTE: bobPixels is same value used in main pass (u_bobPixels) — must be added so SSR samples sceneTex/gNormalDepth which are bobbed.
vec3 worldToScreenUVSSR(vec3 worldPos, vec2 camPos, float eyeZ, float playerAngle, float planeLen, vec2 resolution, float bobPixels, out float forwardDist){
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
  // Base projection without bob:
  float uvY_noBob = 0.5 - yShift;
  // Main pass does: fragCoord = (1 - v_uv)*res.y + bobPixels => v_uv = uv_noBob + bobPixels/res.y
  float uvY = uvY_noBob + bobPixels / max(1.0, resolution.y);
  return vec3(uvX, uvY, 0.0);
}

struct SSRResult{ vec3 color; float hit; float fade; float rayLength; vec2 hitUV; };

SSRResult traceScreenSpaceRaySSR(in vec2 startUV, in vec3 N, in vec3 V, in float linearDepth, in float puddleMask, in float roughness, in sampler2D sceneTex, in sampler2D gNormalDepthTex, in sampler2D blueNoiseTex, in vec2 resolution, in int steps, in int binarySteps, in float maxDistance, in float thickness, in float stride, in float jitter, in float depthBias, in float zThicknessScale, in float maxRayAngle, in vec2 camPos, in float eyeZ, in float playerAngle, in float planeLen, in float bobPixels){
  SSRResult res; res.color=vec3(0.0); res.hit=0.0; res.fade=0.0; res.rayLength=0.0; res.hitUV=startUV;
  // For puddles, use flat mirror normal for stable trace — rippled N causes white/grey flicker moving with ripples
  vec3 traceN = N;
  if (puddleMask > 0.05 && N.z > 0.3) {
    // floor-like puddle: replace rippled normal with flat (0,0,1) to avoid ripple-driven miss/fallback toggle
    traceN = vec3(0.0, 0.0, 1.0);
  }
  vec3 R = reflect(-V, traceN);
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
    vec3 proj = worldToScreenUVSSR(reflectedWorld, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels, fwDist);
    vec2 uv = proj.xy;
    if (uv.x < -0.15 || uv.x > 1.15 || uv.y < -0.15 || uv.y > 1.15) { tRay += tStep; tStep *= stride; continue; }
    // Reject hits below horizon that are floor – puddle should only reflect walls/upper
    // Also we decode sampled normal to ensure it's a wall, not floor re-hit
    vec4 gSmpl = texture(gNormalDepthTex, uv);
    float sampledDepthNorm = gSmpl.b;
    if (sampledDepthNorm < 0.001) { tRay += tStep; tStep *= stride; continue; }
    vec3 sampledN = octaDecodeSSR(gSmpl.rg);
    // floor N = (0,0,1) => z~1, ceil N = (0,0,-1) => z~-1, wall N z~0
    // Reject floor re-hit only – keep walls and ceiling for reflection
    if (sampledN.z > 0.60) { tRay += tStep; tStep *= stride; continue; }
    // Also reject if projection still in floor half (below horizon) to avoid floor showing
    // We allow slightly below 0.5 for low wall, but not deep floor
    if (uv.y < 0.48) { tRay += tStep; tStep *= stride; continue; }
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
        vec3 midProj = worldToScreenUVSSR(midW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels, midFd);
        vec4 midG = texture(gNormalDepthTex, midProj.xy);
        float midDepthNorm = midG.b;
        if (midDepthNorm < 0.001) { lowT = midT; continue; }
        vec3 midN = octaDecodeSSR(midG.rg);
        if (midN.z > 0.60) { lowT = midT; continue; } // floor only
        float midLin = midDepthNorm * maxDistance;
        float midDiff = midFd - midLin;
        if (abs(midDiff) < curThickness) highT = midT; else lowT = midT;
      }
      vec3 finalW = worldPos + R * highT;
      float finalFd;
      vec3 finalProj = worldToScreenUVSSR(finalW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels, finalFd);
      vec4 finalG = texture(gNormalDepthTex, finalProj.xy);
      vec3 finalN = octaDecodeSSR(finalG.rg);
      // Final must not be floor (allow wall + ceiling)
      if (finalG.b > 0.001 && finalN.z <= 0.60 && finalProj.xy.y > 0.40) {
        res.hitUV = finalProj.xy;
        res.color = texture(sceneTex, finalProj.xy).rgb;
        res.rayLength = highT;
      } else {
        // binary refined to floor – discard hit
        res.hit = 0.0;
      }
      if (res.hit > 0.5) break;
    }
    tRay += tStep;
    tStep *= stride;
  }

  if (res.hit < 0.5 && puddleMask > 0.02) {
    // fallback with proper projection - sample forward wall
    vec3 fallbackW = worldPos + R * (maxDistance * 0.5);
    float fDist;
    vec3 fProj = worldToScreenUVSSR(fallbackW, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels, fDist);
    vec2 fUV = clamp(fProj.xy, 0.0, 1.0);
    // only if fUV is in upper half (walls), not floor again, and normal is wall
    if (fUV.y > 0.40) { // allow walls + ceiling
      vec4 fG = texture(gNormalDepthTex, fUV);
      vec3 fN = octaDecodeSSR(fG.rg);
      if (fG.b > 0.001 && fN.z <= 0.60) { // not floor
        res.color = texture(sceneTex, fUV).rgb * 0.7;
        res.hit = 0.5;
        res.hitUV = fUV;
        res.rayLength = maxDistance * 0.5;
      }
    }
  }

  return res;
}
`;

