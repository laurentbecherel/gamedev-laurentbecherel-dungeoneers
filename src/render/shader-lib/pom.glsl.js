// POM using Texture2DArray – centered reference plane + grazing safety

export const glslPom = `
// ---- POM for array ----
vec2 pomOffsetArray(sampler2DArray heightMap, vec2 uv, float layer, vec3 viewTS, float strength, int steps) {
  if (strength <= 0.00001) return vec2(0.0);
  float minVz = u_pomMinVz > 0.0 ? u_pomMinVz : 0.08;
  float minEff = u_pomMinEffVz > 0.0 ? u_pomMinEffVz : 0.18;
  float fadeStart = u_pomFadeStart > 0.0 ? u_pomFadeStart : 0.08;
  float fadeEnd = u_pomFadeEnd > 0.0 ? u_pomFadeEnd : 0.22;
  float maxOff = u_pomMaxOffset > 0.0 ? u_pomMaxOffset : 0.10;
  float vzAbs = abs(viewTS.z);
  if (vzAbs < minVz) return vec2(0.0);
  float layerDepth = 1.0 / float(steps);
  float effVz = max(vzAbs, minEff);
  vec2 fullOffset = viewTS.xy * strength / effVz;
  float fade = 1.0;
  if (vzAbs < fadeEnd) fade = (vzAbs - fadeStart) / max(0.001, (fadeEnd - fadeStart));
  float lenOff = length(fullOffset);
  if (lenOff > maxOff) fullOffset *= maxOff / lenOff;
  fullOffset *= clamp(fade, 0.0, 1.0);
  vec2 delta = fullOffset / float(steps);
  vec2 curUV = uv - fullOffset * 0.5;
  float curDepth = 0.0;
  float height = texture(heightMap, vec3(curUV, layer)).r;
  // Reduced max loop from 32 to 16 (steps uniform is 8) – cuts compile time, no visual change
  for (int i = 0; i < 16; i++) {
    if (i >= steps) break;
    if (curDepth >= height) break;
    curUV += delta;
    height = texture(heightMap, vec3(curUV, layer)).r;
    curDepth += layerDepth;
  }
  return curUV - uv;
}
`;
