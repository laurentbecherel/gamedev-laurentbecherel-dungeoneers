// Modifier system – v11.3 PROPER: Full UBO (192 bytes) + 2-texture lossless + procedural noise
// Tex1: R=moss G=water B=puddle A=dust
// Tex2: R=damaged G=blood
// UBO binding point 1, std140, JS guarantees defaults so shader has no fallback branching (fast compile)

export const glslModifiers = `
// Full UBO – 12 vec4 = 192 bytes, binding 1
layout(std140) uniform ModifiersBlock {
  vec4 modMossAlbedoRough;      // xyz albedo, w roughAdd
  vec4 modMossParams;           // x colorStrength
  vec4 modWaterAlbedoRough;     // xyz albedo, w roughAdd
  vec4 modWaterParams;
  vec4 modPuddleAlbedoRough;    // xyz albedo, w roughTarget
  vec4 modPuddleParams;
  vec4 modBloodAlbedoMix;       // xyz albedo, w mix
  vec4 modBloodParams;
  vec4 modDustAlbedoRough;      // xyz albedo, w roughAdd
  vec4 modDustParams;
  vec4 modDamagedAlbedoRough;   // xyz albedo, w roughAdd
  vec4 modDamagedParams;
};

// Fast hash noise – no texture unit, tileable
float hash21_proc(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 worldPos) {
  if (u_modifiersEnabled == 0) return;
  ivec2 cell = ivec2(floor(worldPos.xy));
  if (cell.x < 0 || cell.y < 0 || cell.x >= int(u_mapSize.x) || cell.y >= int(u_mapSize.y)) return;
  vec4 mod1 = texelFetch(u_modifierMap, cell, 0);
  vec4 mod2 = texelFetch(u_modifierMap2, cell, 0);
  if (dot(mod1, vec4(1.0)) < 0.01 && dot(mod2, vec4(1.0)) < 0.01) return;

  vec2 pn = worldPos.xy * 0.25;
  vec4 noise;
  noise.r = hash21_proc(pn);
  noise.g = hash21_proc(pn + vec2(17.13, 8.77));
  noise.b = hash21_proc(pn + vec2(23.45, 19.12));
  noise.a = hash21_proc(pn + vec2(31.23, 41.58));

  // Increased visibility for enabled mode – was 0.10-0.15 too subtle to notice
  float mossMask = mod1.r * smoothstep(0.4, 0.7, noise.r) * 0.45;
  float waterMask = mod1.g * smoothstep(0.35, 0.65, noise.g) * 0.35;
  float puddleMask = mod1.b * smoothstep(0.45, 0.75, noise.b) * 0.50;
  float dustMask = mod1.a * smoothstep(0.3, 0.6, noise.a) * 0.38;
  float damagedMask = mod2.r * smoothstep(0.35, 0.65, noise.g) * 0.42;
  float bloodMask = mod2.g * smoothstep(0.4, 0.75, noise.r) * 0.50;

  if (mossMask > 0.001) {
    albedo = mix(albedo, modMossAlbedoRough.xyz * (0.8 + 0.4*noise.g), mossMask * modMossParams.x);
    rough = clamp(rough + modMossAlbedoRough.w * mossMask, 0.0, 1.0);
    N = normalize(mix(N, vec3(noise.r*0.5-0.25, noise.g*0.5-0.25, 1.0), mossMask*0.5));
  }
  if (waterMask > 0.001) {
    albedo *= (1.0 - waterMask * 0.25);
    albedo = mix(albedo, albedo * modWaterAlbedoRough.xyz, waterMask * 0.3);
    rough = mix(rough, 0.15, waterMask * 0.5);
  }
  if (puddleMask > 0.001) {
    albedo = mix(albedo, modPuddleAlbedoRough.xyz, puddleMask * 0.6);
    rough = mix(rough, modPuddleAlbedoRough.w, puddleMask * 0.6);
    ao *= (1.0 - puddleMask * 0.25);
  }
  if (dustMask > 0.001) {
    float l = dot(albedo, vec3(0.299,0.587,0.114));
    albedo = mix(albedo, vec3(l)*modDustAlbedoRough.xyz, dustMask*0.45);
    rough = clamp(rough + modDustAlbedoRough.w * dustMask, 0.0, 1.0);
    N = normalize(mix(N, vec3(0.0,0.0,1.0), dustMask*0.3));
  }
  if (damagedMask > 0.001) {
    albedo = mix(albedo, modDamagedAlbedoRough.xyz, damagedMask * 0.55);
    rough = clamp(rough + modDamagedAlbedoRough.w * damagedMask, 0.0, 1.0);
    ao *= (1.0 - damagedMask * 0.15);
  }
  if (bloodMask > 0.001) {
    albedo = mix(albedo, modBloodAlbedoMix.xyz, bloodMask * modBloodAlbedoMix.w);
    rough = mix(rough, 0.18, bloodMask * 0.5);
    ao *= (1.0 - bloodMask * 0.15);
  }
}
`;
