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

// Unified single loop – was 2x loops (simple + PBR) causing 2x code size and slower compile
vec3 pbrShade(vec3 albedo, vec3 N, float rough, float metal, float ao, vec3 emissive, vec3 worldPos, vec3 viewDir) {
  if (u_lightingEnabled == 0) { return albedo + emissive; }
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
    if (NdotLsun > 0.001) {
      if (u_pbrEnabled == 0) {
        Lo += albedo * u_sunColor * u_sunIntensity * NdotLsun * sunShadow * aoSunEff;
      } else {
        vec3 H = normalize(viewDir + Lsun);
        float NDF = DistributionGGX(N, H, rough);
        float G = GeometrySmith(N, viewDir, Lsun, rough);
        vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
        vec3 numerator = NDF * G * F;
        float denom = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lsun), 0.0) + max(u_pbrGGXEps, 0.0001);
        vec3 specular = numerator / denom;
        vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
        Lo += (kD * albedo / PI + specular) * u_sunColor * u_sunIntensity * NdotLsun * sunShadow * aoSunEff;
      }
    }
  }

  // Point lights – single loop (was duplicated for simple/PBR)
  for (int i=0;i<8;i++) {
    if (i >= u_numLights) break;
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

    float shadow = 1.0;
    if (u_lightNoShadow[i] == 0) {
      vec2 shDir = normalize(Lvec.xy);
      vec2 shOrigin = worldPos.xy + traceN.xy * biasN + shDir * biasDir;
      if (length(shDir) > 0.01 && traceRayPoint(shOrigin, shDir, dist - pointEps)) shadow = pointShadFactor;
    }

    int lType = u_lightType[i];
    if (lType == 1) {
      vec3 spotDir = normalize(u_lightDir[i]);
      float cosTheta = dot(-Lvec, spotDir);
      float spotAtt = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cosTheta);
      atten *= spotAtt;
      if (spotAtt <= 0.01) continue;
    }
    if (lType == 2) {
      float fSpeed = u_lightFlickerSpeed[i] > 0.1 ? u_lightFlickerSpeed[i] : 6.0;
      float ph = u_lightPhase[i];
      float flickAdd = 0.92 + 0.08 * sin(u_time * fSpeed + ph * 1.7 + float(i)*0.9) + 0.05 * sin(u_time * fSpeed * 1.9 + ph*2.3);
      atten *= clamp(flickAdd, 0.68, 1.22);
    } else if (lType == 3) {
      float ps = u_lightPulseSpeed[i]; float pa = u_lightPulseAmt[i];
      if (ps > 0.1 && pa > 0.01) {
        atten *= (1.0 + pa * sin(u_time * ps + u_lightPhase[i] + float(i)*0.7));
      }
    }

    float NdotL = max(dot(N, Lvec), 0.0);
    if (NdotL <= 0.001) continue;
    if (atten <= 0.001) continue;

    if (u_pbrEnabled == 0) {
      Lo += albedo * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    } else {
      vec3 H = normalize(viewDir + Lvec);
      float NDF = DistributionGGX(N, H, rough);
      float G = GeometrySmith(N, viewDir, Lvec, rough);
      vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
      vec3 numerator2 = NDF * G * F;
      float denom2 = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lvec), 0.0) + max(u_pbrGGXEps, 0.0001);
      vec3 specular = numerator2 / denom2;
      vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - metal;
      Lo += (kD * albedo / PI + specular) * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    }
  }

  vec3 ambient = u_ambientColor * albedo * u_ambientLevel * u_worldAmbientMul * aoAmbEff;
  return ambient + Lo + emissive;
}
`;
