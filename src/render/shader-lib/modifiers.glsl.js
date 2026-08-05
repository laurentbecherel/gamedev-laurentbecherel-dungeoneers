// Modifier system - v25 restored original moss volumetric 3D, mul-only (no if), cheap damaged 2D, single POM wrapper, UBO 34 vec4
export const glslModifiers = `
layout(std140) uniform ModifiersBlock {
  vec4 modMossAlbedoRough;
  vec4 modMossParams;
  vec4 modWaterAlbedoRough;
  vec4 modWaterParams;
  vec4 modPuddleAlbedoRough;
  vec4 modPuddleParams;
  vec4 modBloodAlbedoMix;
  vec4 modBloodParams;
  vec4 modDustAlbedoRough;
  vec4 modDustParams;
  vec4 modDamagedAlbedoRough;
  vec4 modDamagedParams;
  vec4 modMossMatRough;
  vec4 modMossFinal;
  vec4 modMossExtra1;
  vec4 modMossExtra2;
  vec4 modMossFinalWeights;
  vec4 modMossFinalCombine;
  vec4 modMossGlobal;
  vec4 modMossGlobal2;
  vec4 modMossAlbedo;
  vec4 modMossStrengths;
  vec4 modDamagedNoise;
  vec4 modDamagedScales;
  vec4 modDamagedWeights;
  vec4 modDamagedCrack;
  vec4 modDamagedMaterial;
  vec4 modDamagedMaterial2;
  vec4 modDamagedFinal;
  vec4 modDamagedFinalWeights;
  vec4 modDamagedSurface;
  vec4 modDamagedSurface2;
  vec4 modDamagedGlobal;
  vec4 modDamagedGlobal2;
};

float mossDefault(float v, float f){ return mix(v, f, step(v, 0.0001)); }

// 2D noise
float hash21_puddle(vec2 p){
  float s = modMossAlbedoRough.y;
  return fract(sin(dot(p + vec2(s*0.13, s*0.17), vec2(127.1, 311.7))) * 43758.5453);
}
float valueNoise2D(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21_puddle(i);
  float b = hash21_puddle(i + vec2(1.0,0.0));
  float c = hash21_puddle(i + vec2(0.0,1.0));
  float d = hash21_puddle(i + vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm2D_2(vec2 p){ return valueNoise2D(p)*0.5 + valueNoise2D(p*2.0)*0.25; }
float fbm2D_3(vec2 p){ return valueNoise2D(p)*0.5 + valueNoise2D(p*2.0)*0.25 + valueNoise2D(p*4.0)*0.125; }

// 3D noise for moss volumetric - ORIGINAL
float hash31(vec3 p){
  float s = modMossAlbedoRough.y;
  return fract(sin(dot(p + vec3(s*0.13, s*0.17, s*0.19), vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float valueNoise3D(vec3 p){
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}
float fbm3D_3(vec3 p){ return valueNoise3D(p)*0.5 + valueNoise3D(p*2.0)*0.25 + valueNoise3D(p*4.0)*0.125; }

// puddle - mul-only
vec3 puddleNoise(vec2 w, float s){
  vec2 warp = vec2(fbm2D_2(w*0.12), fbm2D_2(w*0.12+vec2(7.3,3.1)))*0.9;
  vec2 p = w*s + warp;
  float nL = fbm2D_3(p);
  float nM = valueNoise2D(p*2.1+vec2(11.3,23.7));
  float nS = valueNoise2D(w*0.52+vec2(5.1,2.9));
  return vec3(nL*0.60+nM*0.28+nS*0.12, nM, nS);
}
float computePuddleMaskTweakable(in vec3 wp, in float mh, in float ao, in float cell){
  float cSoft = smoothstep(modBloodAlbedoMix.x, modBloodAlbedoMix.y, cell);
  float has = step(modBloodAlbedoMix.z, cSoft);
  cSoft *= has;
  float sL = modPuddleParams.y; float th = modPuddleParams.z; float fe = modPuddleParams.w;
  vec3 ns = puddleNoise(wp.xy, sL);
  float shape = smoothstep(th-fe, th+fe, ns.x);
  shape *= mix(0.45,1.0, ns.y);
  shape *= mix(0.75,1.0, ns.z);
  float hG = 1.0 - smoothstep(modMossParams.x, modMossParams.y, mh);
  float aG = 1.0 - smoothstep(modMossParams.z, modMossParams.w, ao);
  float groove = max(hG, aG*0.6);
  float bias = mix(1.0, mix(modDustParams.y,1.0,groove), clamp(modBloodParams.z,0.0,1.0));
  float wb = mix(0.70,1.0, smoothstep(modWaterParams.x, modWaterParams.y, wp.z));
  float m = cSoft * shape * bias * wb;
  m = clamp(m*modWaterParams.z,0.0,1.0);
  m = m*m*(3.0-2.0*m);
  m *= (0.80+0.20*ns.z);
  return m*has;
}

// moss ORIGINAL - volumetric, decomposed, all tunable, now mul-only (if replaced with step/mix)
float mossBiomeMask(vec2 w){ return texture(u_modifierMap, w/u_mapSize).r; }

float mossNoiseRaw(vec3 w){
  float sc = mossDefault(modMossAlbedoRough.z, 2.95);
  vec3 p = w * sc * 0.85 + vec3(2.7, 5.4, 8.1);
  float n3D = fbm3D_3(p);
  float n3DDet = valueNoise3D(p * 2.2 + vec3(11.3, 23.7, 4.7));
  return n3D * 0.65 + n3DDet * 0.35;
}
float mossNoiseShape(vec3 w){
  float th = mossDefault(modMossAlbedoRough.w, 0.46);
  float fe = mossDefault(modMossMatRough.w, 0.16);
  return smoothstep(th-fe, th+fe, mossNoiseRaw(w));
}
float mossEnvMask(vec3 w, float isFloor){
  float prox = texture(u_modifierMap, w.xy/u_mapSize).a;
  float fb = mossDefault(modWaterAlbedoRough.x,0.20);
  float wb = mossDefault(modWaterAlbedoRough.y,0.28);
  float eb = mossDefault(modWaterAlbedoRough.z,0.55);
  float bL = mossDefault(modDustAlbedoRough.x,0.08);
  float bH = mossDefault(modDustAlbedoRough.y,0.85);
  float cR = mossDefault(modDustAlbedoRough.z,0.45);
  float sB = mossDefault(modDustAlbedoRough.w,0.35);
  float wallInner = mossDefault(modMossExtra1.x,0.0);
  float wallOuter = mossDefault(modMossExtra1.y,1.0);
  float floorInner = mossDefault(modMossExtra1.z,0.0);
  float floorOuter = mossDefault(modMossExtra1.w,1.0);
  float nearW = smoothstep(wallInner, wallOuter, prox);
  float nearF = smoothstep(floorInner, floorOuter, prox);
  float floorM = mix(fb,1.0,nearF);
  floorM = mix(floorM,1.0, smoothstep(0.5,0.85,nearF)*sB);
  float bot = 1.0 - smoothstep(bL,bH,w.z);
  float wallM = mix(wb,1.0,bot) * mix(eb,1.0,nearW);
  float ceilR = 1.0 - smoothstep(0.7,1.15,w.z)*cR;
  floorM *= mix(1.0,ceilR,step(0.7,w.z));
  return clamp(mix(wallM,floorM,step(0.5,isFloor)),0.0,1.0);
}
float mossMaterialMask(float mh, float ao, float ro){
  float mat1Zero = step(length(modDamagedAlbedoRough),0.0001);
  float hL = mix(modDamagedAlbedoRough.x,0.16,mat1Zero);
  float hH = mix(modDamagedAlbedoRough.y,0.55,mat1Zero);
  float aL = mix(modDamagedAlbedoRough.z,0.58,mat1Zero);
  float aH = mix(modDamagedAlbedoRough.w,0.90,mat1Zero);
  float mat2Zero = step(length(modMossMatRough),0.0001);
  float rL = mix(modMossMatRough.x,0.52,mat2Zero);
  float rH = mix(modMossMatRough.y,0.88,mat2Zero);
  float base = mix(modMossMatRough.z,0.28,mat2Zero);
  float extra2Zero = step(length(modMossExtra2),0.0001);
  float hW = mix(modMossExtra2.x,1.0,extra2Zero);
  float aW = mix(modMossExtra2.y,0.8,extra2Zero);
  float rW = mix(modMossExtra2.z,0.6,extra2Zero);
  float combine = mix(modMossExtra2.w,0.35,extra2Zero);
  float hRaw = 1.0 - smoothstep(hL,hH,mh);
  float aRaw = 1.0 - smoothstep(aL,aH,ao);
  float rRaw = smoothstep(rL,rH,ro);
  float maxM = max(hRaw, max(aRaw, rRaw));
  float sum = max(0.001, hW+aW+rW);
  float addM = (hRaw*hW + aRaw*aW + rRaw*rW)/sum;
  float hMul = mix(1.0,hRaw,step(0.001,hW));
  float aMul = mix(1.0,aRaw,step(0.001,aW));
  float rMul = mix(1.0,rRaw,step(0.001,rW));
  float mulM = hMul*aMul*rMul;
  // branch-free combine: <0.5 => mix(max,add), else mix(add,mul)
  float lowT = combine*2.0;
  float highT = (combine-0.5)*2.0;
  float lowMix = mix(maxM, addM, lowT);
  float highMix = mix(addM, mulM, highT);
  float combined = mix(lowMix, highMix, step(0.5, combine));
  return clamp(mix(base,1.0,combined),0.0,1.0);
}
float mossFinalMask(vec3 w, float mh, float ao, float ro, float isFloor){
  float biome = mossBiomeMask(w.xy);
  float has = step(0.001, biome);
  float noise = mossNoiseShape(w);
  float env = mossEnvMask(w,isFloor);
  float mat = mossMaterialMask(mh,ao,ro);
  float fZero = step(length(modMossFinal),0.0001);
  float bBase = mix(modMossFinal.x,0.42,fZero);
  float eBase = mix(modMossFinal.y,0.32,fZero);
  float mBase = mix(modMossFinal.z,0.38,fZero);
  float boost = mix(modMossFinal.w,1.28,fZero);
  float wZero = step(length(modMossFinalWeights),0.0001);
  float nW = mix(modMossFinalWeights.x,1.0,wZero);
  float eW = mix(modMossFinalWeights.y,1.0,wZero);
  float mW = mix(modMossFinalWeights.z,1.0,wZero);
  float bW = mix(modMossFinalWeights.w,1.0,wZero);
  float cZero = step(length(modMossFinalCombine),0.0001);
  float combine = mix(modMossFinalCombine.x,1.0,cZero);
  float envMod = mix(eBase,1.0,env);
  float matMod = mix(mBase,1.0,mat);
  float bioMod = mix(bBase,1.0,biome);
  float noiseMod = noise;
  float sum = max(0.001, nW+eW+mW+bW);
  float addMod = (noiseMod*nW + envMod*eW + matMod*mW + bioMod*bW)/sum;
  float addRaw = (noise*nW + env*eW + mat*mW + biome*bW)/sum;
  float maxMod = max(max(noiseMod*nW, envMod*eW), max(matMod*mW, bioMod*bW));
  float maxRaw = max(max(noise*nW, env*eW), max(mat*mW, biome*bW));
  float nMulRaw = mix(1.0,noise,step(0.001,nW));
  float eMulRaw = mix(1.0,env,step(0.001,eW));
  float mMulRaw = mix(1.0,mat,step(0.001,mW));
  float bMulRaw = mix(1.0,biome,step(0.001,bW));
  float mulRaw = nMulRaw*eMulRaw*mMulRaw*bMulRaw;
  float nMulMod = mix(1.0,noiseMod,step(0.001,nW));
  float eMulMod = mix(1.0,envMod,step(0.001,eW));
  float mMulMod = mix(1.0,matMod,step(0.001,mW));
  float bMulMod = mix(1.0,bioMod,step(0.001,bW));
  float mulMod = nMulMod*eMulMod*mMulMod*bMulMod;
  // branch-free 3-segment lerp: 0-0.33 maxMod->addMod, 0.33-0.66 addMod->addRaw, 0.66-1 addRaw->mulRaw
  float t01 = clamp(combine/0.33,0.0,1.0);
  float t12 = clamp((combine-0.33)/0.33,0.0,1.0);
  float t23 = clamp((combine-0.66)/0.34,0.0,1.0);
  float stage01 = mix(maxMod, addMod, t01);
  float stage12 = mix(addMod, addRaw, t12);
  float stage23 = mix(addRaw, mulRaw, t23);
  float finalM = mix(stage01, stage12, step(0.33, combine));
  finalM = mix(finalM, stage23, step(0.66, combine));
  finalM *= has;
  float gZero = step(length(modMossGlobal),0.0001);
  float g2Zero = step(length(modMossGlobal2),0.0001);
  float contrast = mix(modMossGlobal.x,1.0,gZero);
  float bright = mix(modMossGlobal.y,0.0,gZero);
  float minTh = mix(modMossGlobal.z,0.0,gZero);
  float maxTh = mix(modMossGlobal.w,1.0,gZero);
  float power = mix(modMossGlobal2.x,1.0,g2Zero);
  finalM = clamp(finalM*boost+bright,0.0,1.0);
  finalM = clamp((finalM-0.5)*contrast+0.5,0.0,1.0);
  finalM = pow(clamp(finalM,0.001,1.0), power);
  float range = max(0.001, maxTh-minTh);
  finalM = clamp((finalM-minTh)/range,0.0,1.0);
  finalM = finalM*finalM*(3.0-2.0*finalM);
  return finalM;
}

// damaged cheap 2D mul-only - same UBO, no var pow
float damagedBiomeMask(vec2 w){ return texture(u_modifierMap2, w/u_mapSize).r; }
float damagedNoiseRaw(vec3 w){
  float base = mossDefault(modDamagedNoise.x,2.2);
  vec2 p = w.xy*base + vec2(13.7,5.1) + vec2(w.z*0.25,w.z*0.15);
  float n1 = valueNoise2D(p);
  float n2 = valueNoise2D(p*2.3+vec2(5.1,2.9));
  float crack = valueNoise2D(p*3.2+vec2(19.1,7.7));
  float ridge = 1.0 - abs(crack*2.0-1.0);
  ridge = ridge*ridge * mossDefault(modDamagedCrack.x,1.0);
  float scratch = valueNoise2D(w.xy*mossDefault(modDamagedCrack.y,8.5)) * valueNoise2D(vec2(w.y,w.x)*5.7);
  float lW = mossDefault(modDamagedWeights.x,0.45);
  float mW = mossDefault(modDamagedWeights.y,0.28);
  float cW = mossDefault(modDamagedWeights.w,0.38);
  float sW = mossDefault(modDamagedCrack.z,0.22);
  return clamp(n1*lW + n2*mW + ridge*cW + scratch*sW,0.0,1.0);
}
float damagedRidgeRaw(vec3 w){
  vec2 p = w.xy*mossDefault(modDamagedNoise.x,2.2)*mossDefault(modDamagedScales.w,3.2)+vec2(19.1,7.7);
  float r = valueNoise2D(p);
  float ridge = 1.0-abs(r*2.0-1.0);
  return ridge*ridge;
}
float damagedNoiseShape(vec3 w){
  float th = mossDefault(modDamagedNoise.y,0.78);
  float fe = mossDefault(modDamagedNoise.z,0.06);
  return smoothstep(th-fe, th+fe, damagedNoiseRaw(w));
}
float damagedEnvMask(vec3 w, float isFloor){
  float eBase = mossDefault(modDamagedFinal.y,0.25);
  float bot = 1.0 - smoothstep(0.0,0.18,w.z)*0.10;
  float top = 1.0 - smoothstep(0.70,1.15,w.z)*0.30;
  float wall = mix(eBase,1.0,bot*top);
  return clamp(mix(wall,1.0,step(0.5,isFloor)),0.0,1.0);
}
float damagedFinalMask(vec3 w, float mh, float ao, float ro, float isFloor){
  float biome = damagedBiomeMask(w.xy);
  float has = step(0.001, biome);
  float noise = damagedNoiseShape(w);
  float env = damagedEnvMask(w,isFloor);
  float bBase = mossDefault(modDamagedFinal.x,0.15);
  float eBase = mossDefault(modDamagedFinal.y,0.25);
  float boost = mossDefault(modDamagedFinal.w,1.35);
  float nW = mossDefault(modDamagedFinalWeights.x,1.0);
  float eW = mossDefault(modDamagedFinalWeights.y,0.35);
  float bW = mossDefault(modDamagedFinalWeights.w,0.5);
  float envMod = mix(eBase,1.0,env);
  float bioMod = mix(bBase,1.0,biome);
  float sum = max(0.001,nW+eW+bW);
  float f = (noise*nW + envMod*eW + bioMod*bW)/sum;
  f *= has;
  f = clamp(f*boost,0.0,1.0);
  float contrast = mossDefault(modDamagedGlobal.x,1.35);
  f = clamp((f-0.5)*contrast+0.5,0.0,1.0);
  f = f*f*(3.0-2.0*f);
  return f;
}
float damagedHeightOffset(vec3 w, float s){
  float has = step(0.001,s);
  float depth = mossDefault(modDamagedSurface.x,-0.38);
  float pitVar = mossDefault(modDamagedSurface.y,0.32);
  float ridgeH = mossDefault(modDamagedSurface.z,0.18);
  float raw = damagedNoiseRaw(w);
  float ridge = damagedRidgeRaw(w);
  float pit = depth + (raw-0.5)*pitVar*1.2;
  return (pit*0.85 + ridge*ridgeH*0.35) * s * has;
}
vec2 pomOffsetArrayDamaged(sampler2DArray hm, vec2 uv, float layer, vec3 vTS, float str, int steps, vec3 wPos, float isFloor){
  vec2 base = pomOffsetArray(hm, uv, layer, vTS, str, steps);
  vec2 mUV = wPos.xy / u_mapSize;
  ivec2 ci = ivec2(floor(wPos.xy));
  float inB = step(0.0,float(ci.x))*step(0.0,float(ci.y))*step(float(ci.x),u_mapSize.x-1.0)*step(float(ci.y),u_mapSize.y-1.0);
  float cell = texture(u_modifierMap2, mUV).r * float(u_modifiersEnabled) * inB;
  float has = step(0.001, cell);
  float dMask = damagedNoiseShape(wPos) * has * cell;
  float depth = mossDefault(modDamagedSurface.x,-0.38);
  float pomBoost = mossDefault(modDamagedGlobal2.z,1.4);
  float dH = depth * dMask * pomBoost * has;
  vec2 extra = vTS.xy * dH * 0.65 / max(abs(vTS.z),0.18) * has;
  float maxOff = u_pomMaxOffset>0.0?u_pomMaxOffset:0.10;
  vec2 tot = base + extra*0.55;
  float over = step(maxOff*1.4, length(tot));
  tot = mix(tot, tot*(maxOff*1.4/max(length(tot),0.001)), over);
  return tot;
}

// debug cols
vec3 debugMossNoiseCol(vec3 w){ return vec3(0.18,0.68,0.18)*mossNoiseShape(w)*1.6; }
vec3 debugMossEnvCol(vec3 w,float isFloor){ float e=mossEnvMask(w,isFloor); return vec3(0.22+0.38*e,0.72*e+0.18*e,0.12)*(0.6+0.9*e); }
vec3 debugMossMaterialCol(float mh,float ao,float ro){
  float m=mossMaterialMask(mh,ao,ro);
  float h=1.0-smoothstep(0.16,0.55,mh);
  float a=1.0-smoothstep(0.58,0.90,ao);
  float r=smoothstep(0.52,0.88,ro);
  vec3 col=vec3(a*0.7+r*0.2,(h*0.5+r*0.5)*0.8+0.15,h*0.6)*m;
  return mix(col, vec3(0.18,0.68,0.18)*m,0.45)*1.3;
}
vec3 debugMossCombinedCol(vec3 w,float mh,float ao,float ro,float isFloor){ return vec3(0.18,0.68,0.18)*mossFinalMask(w,mh,ao,ro,isFloor)*1.6; }
vec3 debugDamagedNoiseCol(vec3 w){ return vec3(0.85,0.22,0.18)*damagedNoiseShape(w)*1.8; }
vec3 debugDamagedCombinedCol(vec3 w,float mh,float ao,float ro,float isFloor){ return vec3(0.85,0.25,0.15)*damagedFinalMask(w,mh,ao,ro,isFloor)*1.8; }

// main - mul-only
void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 wPos, inout float mH, in float isFloor){
  float en = float(u_modifiersEnabled);
  ivec2 ci = ivec2(floor(wPos.xy));
  float inB = step(0.0,float(ci.x))*step(0.0,float(ci.y))*step(float(ci.x),u_mapSize.x-1.0)*step(float(ci.y),u_mapSize.y-1.0);
  vec2 mUV = wPos.xy / u_mapSize;
  vec4 m1 = texture(u_modifierMap, mUV);
  vec4 m2 = texture(u_modifierMap2, mUV);
  float mossCell = m1.r*en*inB;
  float puddleCell = m1.b*en*inB * mix(0.02,1.0,step(0.5,isFloor));
  float damagedCell = m2.r*en*inB;

  // moss - original volumetric, mul-only
  float mossMask = mossFinalMask(wPos,mH,ao,rough,isFloor);
  float mossStr = mossMask * step(0.001,mossCell);
  vec3 mossBase = mix(modMossAlbedo.xyz, vec3(0.18,0.42,0.15), step(length(modMossAlbedo),0.0001));
  float mossColStr = mix(modMossAlbedo.w,0.75,step(length(modMossAlbedo),0.0001));
  float mRAdd = mix(modMossStrengths.x,0.34,step(length(modMossStrengths),0.0001));
  float mHAdd = mix(modMossStrengths.y,0.12,step(length(modMossStrengths),0.0001));
  float mNStr = mix(modMossStrengths.z,0.36,step(length(modMossStrengths),0.0001));
  float mAo = mix(modMossStrengths.w,0.16,step(length(modMossStrengths),0.0001));
  vec3 mossCol = mossBase*(0.85+0.28*mossNoiseRaw(wPos));
  albedo = mix(albedo, mossCol, mossStr*mossColStr);
  rough = clamp(rough + mRAdd*mossStr,0.0,1.0);
  metal = mix(metal,0.0,mossStr*0.80);
  ao *= (1.0 - mossStr*mAo);
  vec3 up = vec3(0.0,0.0,1.0);
  N = normalize(mix(N, up, mossStr*mNStr*mix(0.85,0.55,step(0.5,isFloor))));
  mH += mossStr*mHAdd;

  // puddle
  float fHas = step(0.5,isFloor)*step(wPos.z,0.6);
  float pHas = step(0.001,puddleCell)*fHas;
  float pMask = computePuddleMaskTweakable(wPos,mH,ao,puddleCell*pHas);
  float pHas2 = step(0.001,pMask);
  pMask *= pHas2;
  vec3 dark = albedo*modWaterParams.w;
  vec3 pTint = mix(dark, modPuddleAlbedoRough.xyz, modDustParams.x);
  albedo = mix(albedo, pTint, pMask*mix(modPuddleParams.x,0.92,step(modPuddleParams.x,0.001))*pHas2);
  float edge = pMask*(1.0-pMask);
  float eF = smoothstep(modDustParams.z, modDustParams.w, edge)*modBloodParams.y*pHas2;
  albedo = mix(albedo, albedo+vec3(0.18,0.175,0.16)*eF, pHas2);
  float rF = smoothstep(modDamagedParams.x, modDamagedParams.y, pMask);
  rough = mix(rough, modPuddleAlbedoRough.w, rF*0.97*pHas2);
  vec3 flatWaterN = vec3(0.0,0.0,1.0);
  vec2 rip = wPos.xy*modBloodParams.x;
  float r1 = valueNoise2D(rip);
  float r2 = valueNoise2D(rip+vec2(13.5,7.1));
  vec3 ripN = normalize(vec3((r1-0.5)*0.25,(r2-0.5)*0.25,1.0));
  vec3 bF = mix(N, flatWaterN, pMask*modDamagedParams.z*pHas2);
  float rMix = pMask*0.28*(0.5+0.5*valueNoise2D(wPos.xy*0.52))*pHas2;
  N = normalize(mix(bF, ripN, rMix));
  metal = mix(metal,0.0,pMask*modDamagedParams.w*pHas2);
  ao *= (1.0 - pMask*modBloodParams.w*pHas2);
  float dep = pMask*modMossAlbedoRough.x*pHas2;
  ao = mix(ao, ao*(1.0+dep*0.6), pHas2);
  albedo = mix(albedo, albedo*(1.0+dep*0.15), pHas2);

  // damaged - no albedo
  float dHas = step(0.001, damagedCell);
  float dMask = damagedFinalMask(wPos,mH,ao,rough,isFloor);
  float dStr = dMask * dHas;
  float dHasS = step(0.001,dStr);
  dStr *= dHasS;
  float dSZero = step(length(modDamagedSurface),0.0001);
  float dS2Zero = step(length(modDamagedSurface2),0.0001);
  float dDepth = mix(modDamagedSurface.x,-0.38,dSZero);
  float dNStr = mix(modDamagedSurface.w,0.95,dSZero);
  float dRAdd = mix(modDamagedSurface2.y,0.42,dS2Zero);
  float dRVar = mix(modDamagedSurface2.z,0.28,dS2Zero);
  float dAo = mix(modDamagedSurface2.w,0.38,dS2Zero);
  float chipSc = mix(modDamagedGlobal2.w,12.0,step(length(modDamagedGlobal2),0.0001));
  float rawD = damagedNoiseRaw(wPos);
  float ridge = damagedRidgeRaw(wPos);
  float fine = valueNoise2D(wPos.xy*chipSc*0.7);
  float hPit = dDepth + (rawD-0.5)*0.32*1.2 + fine*0.12;
  float hOff = (hPit*0.85 + ridge*0.18*0.35) * dStr;
  mH += hOff;
  vec3 upV = vec3(0.0,0.0,1.0);
  vec3 tang = normalize(cross(N, upV+vec3(0.001,0.002,0.0)));
  float upDot = abs(dot(N,upV));
  tang = normalize(mix(tang, cross(N,vec3(1.0,0.0,0.0)), step(0.95,upDot)));
  vec3 bit = normalize(cross(N,tang));
  float nX = valueNoise2D(wPos.xy*12.0)*2.0-1.0;
  float nY = valueNoise2D(wPos.xy*12.0+vec2(5.7,3.1))*2.0-1.0;
  vec3 grad = tang*nX + bit*nY;
  vec3 dN = normalize(N - grad*dNStr*dStr*0.65);
  N = normalize(mix(N, dN, clamp(dStr*dNStr,0.0,1.0)));
  float rNoise = rawD*0.6 + fine*0.3 + ridge*0.2;
  float rAdd = dRAdd*dStr + dRVar*rNoise*dStr;
  rough = clamp(rough + rAdd*dHasS,0.0,1.0);
  float aoDark = (1.0 - dStr*dAo*(0.6+0.4*rawD+0.3*ridge));
  aoDark = mix(1.0, aoDark, dHasS);
  ao = clamp(ao*aoDark,0.0,1.0);
  metal = mix(metal, metal*0.72, dStr*0.45);
}
void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float ao, in vec3 wPos){
  float th=0.5; float fl=1.0;
  applyModifiers(albedo,N,rough,metal,ao,wPos,th,fl);
}
`;
