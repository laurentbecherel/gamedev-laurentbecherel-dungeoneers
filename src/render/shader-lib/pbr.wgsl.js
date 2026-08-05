export const wgslPbr = `
const PI: f32 = 3.14159265;

fn DistributionGGX(N: vec3<f32>, H: vec3<f32>, roughness: f32) -> f32 {
  let a: f32 = roughness * roughness;
  let a2: f32 = a * a;
  let NdotH: f32 = max(dot(N, H), 0.0);
  let NdotH2: f32 = NdotH * NdotH;
  var num: f32 = a2;
  var denom: f32 = NdotH2 * (a2 - 1.0) + 1.0;
  denom = PI * denom * denom;
  return num / max(denom, select(0.0001, frame.pbrGGXEps, frame.pbrGGXEps > 0.0));
}

fn GeometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r: f32 = roughness + 1.0;
  let k: f32 = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

fn GeometrySmith(N: vec3<f32>, V: vec3<f32>, L: vec3<f32>, roughness: f32) -> f32 {
  let NdotV: f32 = max(dot(N, V), 0.0);
  let NdotL: f32 = max(dot(N, L), 0.0);
  return GeometrySchlickGGX(NdotV, roughness) * GeometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn debugShowPBR(mode: i32, albedoRaw: vec3<f32>, normalRaw: vec3<f32>, worldN: vec3<f32>, heightVal: f32, rma: vec4<f32>, emissive: vec3<f32>) -> vec3<f32> {
  if (mode == 1) { return albedoRaw; }
  if (mode == 2) { return normalRaw; }
  if (mode == 3) { return worldN * 0.5 + 0.5; }
  if (mode == 4) { return vec3<f32>(heightVal); }
  if (mode == 5) { return vec3<f32>(rma.r); }
  if (mode == 6) { return vec3<f32>(rma.g); }
  if (mode == 7) { return vec3<f32>(rma.a); }
  if (mode == 8) { return emissive; }
  return albedoRaw;
}

// Unified PBR – uses private u_* light arrays (filled from lightData in initUniforms) – avoids struct member errors
fn pbrShade(albedo: vec3<f32>, N: vec3<f32>, rough: f32, metal: f32, ao: f32, emissive: vec3<f32>, worldPos: vec3<f32>, viewDir: vec3<f32>) -> vec3<f32> {
  let lightingEn: f32 = f32(frame.lightingEnabled);
  let pbrEn: f32 = f32(frame.pbrEnabled);
  let aoSunEff: f32 = mix(1.0, ao, clamp(frame.aoSun, 0.0, 1.0));
  let aoPointEff: f32 = mix(1.0, ao, clamp(frame.aoPoint, 0.0, 1.0));
  let aoAmbEff: f32 = mix(1.0, ao, clamp(frame.aoAmbient, 0.0, 1.0));

  let ng: vec3<f32> = vec3<f32>(N.x, N.y, 0.0);
  let ngLen: f32 = length(ng);
  var traceN: vec3<f32>;
  let ntThresh: f32 = select(0.02, frame.shadowNormalThresh, frame.shadowNormalThresh > 0.0);
  if (ngLen < ntThresh) {
    traceN = vec3<f32>(0.0, 0.0, 1.0);
  } else {
    var ngNorm: vec3<f32> = ng / ngLen;
    if (abs(ngNorm.x) > abs(ngNorm.y)) {
      traceN = vec3<f32>(sign(ngNorm.x), 0.0, 0.0);
    } else {
      traceN = vec3<f32>(0.0, sign(ngNorm.y), 0.0);
    }
  }
  let biasN: f32 = select(0.10, frame.shadowBiasN, frame.shadowBiasN > 0.0);
  let biasDir: f32 = select(0.06, frame.shadowBiasDir, frame.shadowBiasDir > 0.0);
  let sunShadFactor: f32 = select(0.25, frame.shadowSunFactor, frame.shadowSunFactor > 0.0);
  let pointShadFactor: f32 = select(0.15, frame.shadowPointFactor, frame.shadowPointFactor > 0.0);
  let sunMax: f32 = select(20.0, frame.shadowSunMax, frame.shadowSunMax > 0.0);
  let pointEps: f32 = select(0.1, frame.shadowPointEps, frame.shadowPointEps >= 0.0);
  let f0d: f32 = select(0.04, frame.pbrF0, frame.pbrF0 > 0.0);
  let F0: vec3<f32> = mix(vec3<f32>(f0d), albedo, metal);
  var Lo: vec3<f32> = vec3<f32>(0.0);

  // Sun
  {
    let sunDir: vec3<f32> = normalize(vec3<f32>(frame.sunDir.xy, frame.sunDirZ));
    let Lsun: vec3<f32> = -sunDir;
    var sunShadow: f32 = 1.0;
    let sDirSun: vec2<f32> = normalize(Lsun.xy);
    let sOriginSun: vec2<f32> = worldPos.xy + traceN.xy * biasN + sDirSun * biasDir;
    if (length(sDirSun) > 0.01 && traceRaySun(sOriginSun, sDirSun, sunMax)) { sunShadow = sunShadFactor; }
    let NdotLsun: f32 = max(dot(N, Lsun), 0.0);
    let hasNdotLsun: f32 = step(0.001, NdotLsun);
    let diffSun: vec3<f32> = albedo * frame.sunColor * frame.sunIntensity * NdotLsun * sunShadow * aoSunEff;
    let Hsun: vec3<f32> = normalize(viewDir + Lsun);
    let NDFsun: f32 = DistributionGGX(N, Hsun, rough);
    let Gsun: f32 = GeometrySmith(N, viewDir, Lsun, rough);
    let Fsun: vec3<f32> = fresnelSchlick(max(dot(Hsun, viewDir), 0.0), F0);
    let numSun: vec3<f32> = NDFsun * Gsun * Fsun;
    let denomSun: f32 = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lsun), 0.0) + max(frame.pbrGGXEps, 0.0001);
    let specSun: vec3<f32> = numSun / denomSun;
    let kSsun: vec3<f32> = Fsun;
    var kDsun: vec3<f32> = vec3<f32>(1.0) - kSsun;
    kDsun = kDsun * (1.0 - metal);
    let pbrSun: vec3<f32> = (kDsun * albedo / PI + specSun) * frame.sunColor * frame.sunIntensity * NdotLsun * sunShadow * aoSunEff;
    Lo += mix(diffSun, pbrSun, pbrEn) * hasNdotLsun;
  }

  for (var i: i32 = 0; i < 8; i++) {
    if (i >= frame.numLights) { continue; }
    let inten: f32 = u_lightIntensity[i];
    if (inten <= 0.001) { continue; }
    let lPos: vec3<f32> = u_lightPos[i];
    var Lvec: vec3<f32> = lPos - worldPos;
    let dist: f32 = length(Lvec);
    let radius: f32 = u_lightRadius[i];
    if (dist > radius || dist < 0.001) { continue; }
    Lvec = Lvec / dist;
    var atten: f32 = clamp(1.0 - dist / radius, 0.0, 1.0);
    atten = atten * atten;
    atten = atten / (1.0 + (dist / radius) * (dist / radius) * max(frame.pbrAttenQuad, 0.0));

    let needsShadow: f32 = 1.0 - f32(u_lightNoShadow[i]);
    let shDir: vec2<f32> = normalize(Lvec.xy);
    let shOrigin: vec2<f32> = worldPos.xy + traceN.xy * biasN + shDir * biasDir;
    let shHit: f32 = f32(traceRayPoint(shOrigin, shDir, dist - pointEps));
    let shCond: f32 = step(0.01, length(shDir)) * shHit * needsShadow;
    let shadow: f32 = mix(1.0, pointShadFactor, shCond);

    let lType: i32 = u_lightType[i];
    let isSpot: f32 = step(0.5, f32(lType == 1));
    let spotDir: vec3<f32> = normalize(u_lightDir[i]);
    let cosTheta: f32 = dot(-Lvec, spotDir);
    let spotAtt: f32 = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cosTheta);
    atten = mix(atten, atten * spotAtt, isSpot);
    let spotValid: f32 = step(0.011, spotAtt);
    atten = atten * mix(1.0, spotValid, isSpot);

    let isFlicker: f32 = step(0.5, f32(lType == 2));
    let isPulse: f32 = step(0.5, f32(lType == 3));
    let fSpeed: f32 = mix(6.0, u_lightFlickerSpeed[i], step(0.11, u_lightFlickerSpeed[i]));
    let ph: f32 = u_lightPhase[i];
    let flickAdd: f32 = 0.92 + 0.08 * sin(frame.time * fSpeed + ph * 1.7 + f32(i) * 0.9) + 0.05 * sin(frame.time * fSpeed * 1.9 + ph * 2.3);
    let flickClamped: f32 = clamp(flickAdd, 0.68, 1.22);
    atten = mix(atten, atten * flickClamped, isFlicker);

    let ps: f32 = u_lightPulseSpeed[i];
    let pa: f32 = u_lightPulseAmt[i];
    let pulseCond: f32 = step(0.11, ps) * step(0.011, pa);
    let pulseFactor: f32 = 1.0 + pa * sin(frame.time * ps + u_lightPhase[i] + f32(i) * 0.7);
    atten = mix(atten, atten * mix(1.0, pulseFactor, pulseCond), isPulse);

    let NdotL: f32 = max(dot(N, Lvec), 0.0);
    let hasNdotL: f32 = step(0.001, NdotL);
    let hasAtten: f32 = step(0.001, atten);
    let validLight: f32 = hasNdotL * hasAtten;
    let diffPoint: vec3<f32> = albedo * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    let H: vec3<f32> = normalize(viewDir + Lvec);
    let NDF: f32 = DistributionGGX(N, H, rough);
    let G: f32 = GeometrySmith(N, viewDir, Lvec, rough);
    let F: vec3<f32> = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);
    let numerator2: vec3<f32> = NDF * G * F;
    let denom2: f32 = 4.0 * max(dot(N, viewDir), 0.0) * max(dot(N, Lvec), 0.0) + max(frame.pbrGGXEps, 0.0001);
    let specular: vec3<f32> = numerator2 / denom2;
    let kS: vec3<f32> = F;
    var kD: vec3<f32> = vec3<f32>(1.0) - kS;
    kD = kD * (1.0 - metal);
    let pbrPoint: vec3<f32> = (kD * albedo / PI + specular) * u_lightColor[i] * inten * atten * NdotL * shadow * aoPointEff;
    Lo += mix(diffPoint, pbrPoint, pbrEn) * validLight;
  }

  let ambient: vec3<f32> = frame.ambientColor * albedo * frame.ambientLevel * frame.worldAmbientMul * aoAmbEff;
  let lit: vec3<f32> = ambient + Lo + emissive;
  let noLight: vec3<f32> = albedo + emissive;
  return mix(noLight, lit, lightingEn);
}
`;
