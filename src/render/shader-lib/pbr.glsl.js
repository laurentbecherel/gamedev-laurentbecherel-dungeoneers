// PBR GGX + forward 8 lights – unified single light loop to cut compile time (was 2x duplicated)

export const glslPbr = `
float DistributionGGX(vec3 N, vec3 H, float roughness){
  float a = roughness*roughness; float a2=a*a;
  float NdotH = max(dot(N,H),0.0); float NdotH2=NdotH*NdotH;
  float num=a2; float denom=(NdotH2*(a2-1.0)+1.0); denom=PI*denom*denom;
  return num / max(denom, u_pbrGGXEps > 0.0 ? u_pbrGGXEps : 0.0001);
}
float GeometrySchlickGGX(float NdotV, float roughness){
  float r=(roughness+1.0); float k=(r*r)/8.0; return NdotV/(NdotV*(1.0-k)+k);
}
float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness){
  float NdotV=max(dot(N,V),0.0); float NdotL=max(dot(N,L),0.0);
  return GeometrySchlickGGX(NdotV,roughness) * GeometrySchlickGGX(NdotL,roughness);
}
vec3 fresnelSchlick(float cosTheta, vec3 F0){ return F0 + (1.0-F0)*pow(clamp(1.0-cosTheta,0.0,1.0),5.0); }

vec3 debugShowPBR(int mode, vec3 albedoRaw, vec3 normalRaw, vec3 worldN, float heightVal, vec4 rma, vec3 emissive) {
  if (mode == 1) return albedoRaw;
  if (mode == 2) return normalRaw;
  if (mode == 3) return worldN * 0.5 + 0.5;
  if (mode == 4) return vec3(heightVal);
  if (mode == 5) return vec3(rma.r);
  if (mode == 6) return vec3(rma.g);
  if (mode == 7) return vec3(rma.a);
  if (mode == 8) return emissive;
  return albedoRaw;
}

// Unified single loop – branchless for ANGLE: no if(u_lightingEnabled), multiply by 0 neutral
vec3 pbrShade(vec3 albedo, vec3 N, float rough, float metal, float ao, vec3 emissive, vec3 worldPos, vec3 viewDir) {
  float lightingEn = float(u_lightingEnabled);
  float pbrEn = float(u_pbrEnabled);
  float aoSunEff = mix(1.0, ao, clamp(u_aoSun, 0.0, 1.0));
  float aoPointEff = mix(1.0, ao, clamp(u_aoPoint, 0.0, 1.0));
  float aoAmbEff = mix(1.0, ao, clamp(u_aoAmbient, 0.0, 1.0));

  vec3 ng = vec3(N.x, N.y, 0.0);
  float ngLen = length(ng);
  vec3 traceN;
  float ntThresh = u_shadowNormalThresh > 0.0 ? u_shadowNormalThresh : 0.02;
  if (ngLen < ntThresh) traceN = vec3(0.0, 0.0, 1.0);
  else {
    ng /= ngLen;
    if (abs(ng.x) > abs(ng.y)) traceN = vec3(sign(ng.x), 0.0, 0.0);
    else traceN = vec3(0.0, sign(ng.y), 0.0);
  }
  float biasN = u_shadowBiasN > 0.0 ? u_shadowBiasN : 0.10;
  float biasDir = u_shadowBiasDir > 0.0 ? u_shadowBiasDir : 0.06;
  float sunShadFactor = u_shadowSunFactor > 0.0 ? u_shadowSunFactor : 0.25;
  float pointShadFactor = u_shadowPointFactor > 0.0 ? u_shadowPointFactor : 0.15;
  float sunMax = u_shadowSunMax > 0.0 ? u_shadowSunMax : 20.0;
  float pointEps = u_shadowPointEps >= 0.0 ? u_shadowPointEps : 0.1;

  float f0d = u_pbrF0 > 0.0 ? u_pbrF0 : 0.04;
  vec3 F0 = mix(vec3(f0d), albedo, metal);
  vec3 Lo = vec3(0.0);

  // Sun – uses 64-step trace for long distance
  {
    vec3 sunDir = normalize(vec3(u_sunDir.xy, u_sunDirZ));
    vec3 Lsun = -sunDir;
    float sunShadow = 1.0;
    vec2 sDirSun = normalize(Lsun.xy);
    vec2 sOriginSun = worldPos.xy + traceN.xy * biasN + sDirSun * biasDir;
    if (length(sDirSun) > 0.01 && traceRaySun(sOriginSun, sDirSun, sunMax)) sunShadow = sunShadFactor;
    float NdotLsun = max(dot(N, Lsun), 0.0);
    float hasNdotLsun = step(0.001, NdotLsun);
    // branchless pbr vs diffuse
    vec3 diffSun = albedo * u_sunColor * u_sunIntensity * NdotLsun * sunShadow * aoSunEff;
    vec3 Hsun = normalize(viewDir + Lsun);
    float NDFsun = DistributionGGX(N, Hsun, rough);
    float Gsun = GeometrySmith(N, viewDir, Lsun, rough);
    vec3 Fsun = fresnelSchlick(max(dot(Hsun, viewDir), 0.0), F0);
    vec3 numSun = NDFsun * Gsun * Fsun;
    float denomSun = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lsun), 0.0) + max(u_pbrGGXEps, 0.0001);
    vec3 specSun = numSun / denomSun;
    vec3 kSsun = Fsun; vec3 kDsun = vec3(1.0) - kSsun; kDsun *= 1.0 - metal;
    vec3 pbrSun = (kDsun * albedo / PI + specSun) * u_sunColor * u_sunIntensity * NdotLsun * sunShadow * aoSunEff;
    Lo += mix(diffSun, pbrSun, pbrEn) * hasNdotLsun;
  }

  // Point lights – single loop (was duplicated for simple/PBR)
  for (int i=0;i<8;i++) {
    // fixed 8, no dynamic break -> fast ANGLE compile, use continue instead
    if (i >= u_numLights) continue;
    float inten = u_lightIntensity[i];
    if (inten <= 0.001) continue;
    vec3 lPos = u_lightPos[i];
    vec3 Lvec = lPos - worldPos;
    float dist = length(Lvec);
    float radius = u_lightRadius[i];
    if (dist > radius || dist < 0.001) continue;
    Lvec /= dist;
    float atten = clamp(1.0 - dist / radius, 0.0, 1.0);
    atten *= atten;
    atten = atten / (1.0 + (dist/radius)*(dist/radius) * max(u_pbrAttenQuad, 0.0));

    // Branchless shadow - multiply by 0 neutral
    float needsShadow = 1.0 - float(u_lightNoShadow[i]);
    vec2 shDir = normalize(Lvec.xy);
    vec2 shOrigin = worldPos.xy + traceN.xy * biasN + shDir * biasDir;
    float shHit = float(traceRayPoint(shOrigin, shDir, dist - pointEps));
    float shCond = step(0.01, length(shDir)) * shHit * needsShadow;
    float shadow = mix(1.0, pointShadFactor, shCond);

    int lType = u_lightType[i];
    float isSpot = step(0.5, float(lType == 1));
    vec3 spotDir = normalize(u_lightDir[i]);
    float cosTheta = dot(-Lvec, spotDir);
    float spotAtt = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cosTheta);
    atten = mix(atten, atten * spotAtt, isSpot);
    // branchless continue for spot cutoff - multiply atten by 0 when spotAtt <=0.01
    float spotValid = step(0.011, spotAtt);
    atten *= mix(1.0, spotValid, isSpot);
    float isFlicker = step(0.5, float(lType == 2));
    float isPulse = step(0.5, float(lType == 3));
    float fSpeed = mix(6.0, u_lightFlickerSpeed[i], step(0.11, u_lightFlickerSpeed[i]));
    float ph = u_lightPhase[i];
    float flickAdd = 0.92 + 0.08 * sin(u_time * fSpeed + ph * 1.7 + float(i)*0.9) + 0.05 * sin(u_time * fSpeed * 1.9 + ph*2.3);
    float flickClamped = clamp(flickAdd, 0.68, 1.22);
    atten = mix(atten, atten * flickClamped, isFlicker);
    float ps = u_lightPulseSpeed[i]; float pa = u_lightPulseAmt[i];
    float pulseCond = step(0.11, ps) * step(0.011, pa);
    float pulseFactor = 1.0 + pa * sin(u_time * ps + u_lightPhase[i] + float(i)*0.7);
    atten = mix(atten, atten * mix(1.0, pulseFactor, pulseCond), isPulse);

    float NdotL = max(dot(N, Lvec), 0.0);
    float hasNdotL = step(0.001, NdotL);
    float hasAtten = step(0.001, atten);
    float validLight = hasNdotL * hasAtten;
    vec3 diffPoint = albedo * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    vec3 H = normalize(viewDir + Lvec);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, viewDir, Lvec, rough);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    vec3 numerator2 = NDF * G * F;
    float denom2 = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lvec), 0.0) + max(u_pbrGGXEps, 0.0001);
    vec3 specular = numerator2 / denom2;
    vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
    vec3 pbrPoint = (kD * albedo / PI + specular) * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    Lo += mix(diffPoint, pbrPoint, pbrEn) * validLight;
  }

  vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * aoAmbEff;
  vec3 lit = ambient + Lo + emissive;
  vec3 noLight = albedo + emissive;
  return mix(noLight, lit, lightingEn);
}
`;
