// SpriteGpuRenderer — WebGL2 PBR billboard sprite renderer — Task10: 8 lights (was 12)
// Forward lighting, PBR same lights/fog, back-to-front blend
import { createProgram } from './gl-utils.js';
import { getSprite, getSpriteTextures, loadSpriteGL } from './sprite-atlas.js';

// Shared with shaders.js MAX_LIGHTS — now 8 for perf + guarantee
export const MAX_LIGHTS_SPRITE = 8;

let vsSpriteSrc = null;
let fsSpritePBRSrc = null;

// Provide fallback vertex/fragment sources if shaders.js not yet extended
// These will be overwritten by import from shaders.js if present.

function defaultVS() {
  return `#version 300 es
  in vec2 a_corner;
  in vec3 a_center;
  in vec2 a_size;
  in vec4 a_uvRect;
  in float a_alpha;
  in float a_normalStrength;
  in float a_rimStrength;
  out vec2 v_uv;
  out float v_alpha;
  out float v_dist;
  out vec3 v_worldPos;
  uniform vec2 u_resolution;
  uniform vec2 u_pos;
  uniform float u_angle;
  uniform float u_planeLen;
  uniform float u_bobPixels;
  uniform float u_eyeZ;
  void main(){
    // Camera transform similar to CPU billboard path
    vec2 camPos = u_pos;
    float planeLen = u_planeLen;
    float angle = u_angle;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 plane = vec2(-dir.y, dir.x) * planeLen;
    vec2 rel = a_center.xy - camPos;
    float invDet = 1.0 / (plane.x * dir.y - dir.x * plane.y);
    float transX = invDet * (dir.y * rel.x - dir.x * rel.y);
    float transY = invDet * (-plane.y * rel.x + plane.x * rel.y);
    v_dist = transY;
    if (transY <= 0.05) { gl_Position = vec4(2.0,2.0,0.0,1.0); return; }
    float screenX = (u_resolution.x * 0.5) * (1.0 + transX / transY);
    float lineH = u_resolution.y / transY;
    float worldH = a_size.y;
    float worldW = a_size.x;
    float z = a_center.z;
    float eyeZ = u_eyeZ;
    // vertical screen size
    float hScreen = lineH * worldH;
    float drawTop = u_resolution.y * 0.5 + lineH * (eyeZ - (z + worldH));
    float drawBot = u_resolution.y * 0.5 + lineH * (eyeZ - z);
    drawTop -= u_bobPixels;
    drawBot -= u_bobPixels;
    // corner: x -1..1 left..right, y 0..1 bottom..top (0 bottom)
    float xOffset = a_corner.x * worldW * 0.5 * lineH;
    float yOffset = a_corner.y * hScreen;
    // pos: screenX + xOffset, drawBot - (1 - cornerY)*hScreen? Actually bottom=drawBot, top=drawTop
    // a_corner.y 0=bottom at drawBot, 1=top at drawTop
    float y = mix(drawBot, drawTop, a_corner.y);
    float x = screenX + xOffset;
    // NDC
    float ndcX = (x / u_resolution.x) * 2.0 - 1.0;
    float ndcY = 1.0 - (y / u_resolution.y) * 2.0;
    gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
    // uv lerp
    vec2 uv0 = a_uvRect.xy;
    vec2 uv1 = a_uvRect.zw;
    float u = (a_corner.x * 0.5 + 0.5);
    float v = a_corner.y;
    v_uv = vec2(mix(uv0.x, uv1.x, u), mix(uv0.y, uv1.y, v));
    v_alpha = a_alpha;
    v_worldPos = a_center;
  }`;
}

function defaultFS(maxLights) {
  return `#version 300 es
  precision highp float;
  in vec2 v_uv;
  in float v_alpha;
  in float v_dist;
  in vec3 v_worldPos;
  out vec4 outColor;
  uniform sampler2D u_albedo;
  uniform sampler2D u_normal;
  uniform sampler2D u_orm;
  uniform int u_numLights;
  uniform float u_time;
  uniform vec3 u_sunDir;
  uniform float u_sunIntensity;
  uniform vec3 u_sunColor;
  uniform float u_ambient;
  uniform float u_fogBase;
  uniform float u_fogSq;
  uniform vec3 u_lightPos[${maxLights}];
  uniform vec3 u_lightColor[${maxLights}];
  uniform float u_lightIntensity[${maxLights}];
  uniform float u_lightRadius[${maxLights}];
  uniform int u_lightType[${maxLights}];
  uniform vec3 u_lightDir[${maxLights}];
  uniform float u_lightConeInner[${maxLights}];
  uniform float u_lightConeOuter[${maxLights}];
  uniform float u_lightPulseSpeed[${maxLights}];
  uniform float u_lightPulseAmt[${maxLights}];
  uniform int u_lightNoShadow[${maxLights}];
  void main(){
    vec4 alb = texture(u_albedo, v_uv);
    if (alb.a < 0.08) discard;
    vec3 normEnc = texture(u_normal, v_uv).rgb * 2.0 - 1.0;
    vec3 orm = texture(u_orm, v_uv).rgb;
    float ao = orm.r;
    float rough = orm.g;
    float metal = orm.b;
    // simple PBR: diffuse + sun
    vec3 N = normalize(vec3(normEnc.x, normEnc.y, normEnc.z * 1.0 + 0.6));
    // face towards camera with slight up bias
    vec3 viewDir = normalize(vec3(0.0,0.0,1.0));
    // sun
    vec3 sunDir = normalize(-u_sunDir);
    float NdotLsun = max(dot(N, vec3(sunDir.x, sunDir.y, sunDir.z)), 0.0);
    vec3 diff = alb.rgb * u_sunColor * u_sunIntensity * NdotLsun * 0.35;
    vec3 ambient = alb.rgb * u_ambient * ao * 0.55;
    vec3 total = ambient + diff;
    // point lights
    for (int i=0;i<${maxLights};i++){
      if (i>=u_numLights) break;
      vec3 lp = u_lightPos[i];
      float dist = distance(v_worldPos.xy, lp.xy);
      float dist3 = distance(v_worldPos, lp);
      if (dist > u_lightRadius[i] * 1.35) continue;
      float atten = 1.0 - dist / u_lightRadius[i];
      if (atten<=0.0) continue;
      atten = atten*atten;
      // spot cone
      int lt = u_lightType[i];
      if (lt==1){
        vec3 toP = normalize(v_worldPos - lp);
        vec3 ld = normalize(u_lightDir[i]);
        float cosA = dot(-toP, ld);
        if (cosA < u_lightConeOuter[i]) continue;
        float spot = smoothstep(u_lightConeOuter[i], u_lightConeInner[i], cosA);
        atten *= spot;
      }
      vec3 L = normalize(lp - v_worldPos);
      float NdotL = max(dot(N, L), 0.0);
      total += alb.rgb * u_lightColor[i] * u_lightIntensity[i] * atten * NdotL * 1.15;
    }
    float fog = 1.0 / (1.0 + v_dist * u_fogBase + v_dist*v_dist*u_fogSq);
    fog = clamp(fog, 0.06, 1.0);
    float fogDark = 0.55 + fog*0.45;
    total *= fogDark;
    // HDR fix: avoid pink from channel-wise clamp to 1, preserve hue and bloom to warm white
    {
      float maxC = max(max(total.r, total.g), total.b);
      if (maxC > 1.0) {
        float over = clamp((maxC - 1.0) * 0.32, 0.0, 0.7);
        vec3 scaled = total / maxC;
        vec3 warmWhite = vec3(1.0, 0.94, 0.82);
        total = mix(scaled, warmWhite, over);
      }
      total = clamp(total, 0.0, 1.0);
    }
    outColor = vec4(total, alb.a * v_alpha);
  }`;
}

export class SpriteGpuRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = null;
    this.vao = null;
    this.instanceVBO = null;
    this.quadVBO = null;
    this.uLoc = {};
    this.ready = false;
    this.maxLights = MAX_LIGHTS_SPRITE;
  }

  init(externalShaders = null) {
    const gl = this.gl;

    // Try to use shaders from shaders.js if they were extended, else fallback
    let vsSrc = vsSpriteSrc;
    let fsSrc = fsSpritePBRSrc;
    if (externalShaders) {
      vsSrc = externalShaders.vsSpriteSrc || vsSrc;
      fsSrc = externalShaders.fsSpritePBRSrc || fsSrc;
    }
    // dynamic import fallback not possible here synchronously, use defaults
    if (!vsSrc || !fsSrc) {
      // Attempt to load from global import later — for now use defaults
      vsSrc = defaultVS();
      fsSrc = defaultFS(this.maxLights);
    } else {
      // Ensure maxLights matches
      this.maxLights = externalShaders?.MAX_LIGHTS || this.maxLights;
    }

    // Keep references for potential recompile
    this._vsSrc = vsSrc;
    this._fsSrc = fsSrc;

    this.program = createProgram(gl, vsSrc, fsSrc);
    if (!this.program) {
      console.warn('[SpriteGpuRenderer] shader compile failed, trying fallback');
      // try fallback
      if (vsSrc !== defaultVS() || fsSrc !== defaultFS(this.maxLights)) {
        vsSrc = defaultVS();
        fsSrc = defaultFS(this.maxLights);
        this.program = createProgram(gl, vsSrc, fsSrc);
      }
      if (!this.program) throw new Error('Sprite shader compile failed');
    }

    // Quad geometry: 2 triangles forming unit quad
    // a_corner: x -1..1 left..right, y 0..1 bottom..top
    const quad = new Float32Array([
      -1, 0,  1, 0,  -1, 1,
       1, 0,  1, 1,  -1, 1,
    ]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const locCorner = gl.getAttribLocation(this.program, 'a_corner');
    if (locCorner >= 0) {
      gl.enableVertexAttribArray(locCorner);
      gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);
    }

    // Instance buffer: center 3 + size 2 + uvRect 4 + alpha 1 + normalStrength 1 + rimStrength 1 = 12 floats
    this.instanceVBO = gl.createBuffer();
    const stride = 12 * 4;

    const setupInst = (name, size, offsetFloats) => {
      const loc = gl.getAttribLocation(this.program, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetFloats * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    setupInst('a_center', 3, 0);
    setupInst('a_size', 2, 3);
    setupInst('a_uvRect', 4, 5);
    setupInst('a_alpha', 1, 9);
    setupInst('a_normalStrength', 1, 10);
    setupInst('a_rimStrength', 1, 11);

    gl.bindVertexArray(null);

    // Uniforms
    gl.useProgram(this.program);
    const u = {};
    const names = [
      'u_resolution','u_pos','u_angle','u_planeLen','u_bobPixels','u_eyeZ',
      'u_albedo','u_normal','u_orm',
      'u_numLights','u_time',
      'u_sunDir','u_sunIntensity','u_sunColor','u_ambient','u_fogBase','u_fogSq',
    ];
    for (const n of names) u[n] = gl.getUniformLocation(this.program, n);
    u.u_lightPos = []; u.u_lightColor = []; u.u_lightIntensity = []; u.u_lightRadius = [];
    u.u_lightType = []; u.u_lightDir = []; u.u_lightConeInner = []; u.u_lightConeOuter = [];
    u.u_lightPulseSpeed = []; u.u_lightPulseAmt = []; u.u_lightNoShadow = [];
    for (let i = 0; i < this.maxLights; i++) {
      u.u_lightPos.push(gl.getUniformLocation(this.program, `u_lightPos[${i}]`));
      u.u_lightColor.push(gl.getUniformLocation(this.program, `u_lightColor[${i}]`));
      u.u_lightIntensity.push(gl.getUniformLocation(this.program, `u_lightIntensity[${i}]`));
      u.u_lightRadius.push(gl.getUniformLocation(this.program, `u_lightRadius[${i}]`));
      u.u_lightType.push(gl.getUniformLocation(this.program, `u_lightType[${i}]`));
      u.u_lightDir.push(gl.getUniformLocation(this.program, `u_lightDir[${i}]`));
      u.u_lightConeInner.push(gl.getUniformLocation(this.program, `u_lightConeInner[${i}]`));
      u.u_lightConeOuter.push(gl.getUniformLocation(this.program, `u_lightConeOuter[${i}]`));
      u.u_lightPulseSpeed.push(gl.getUniformLocation(this.program, `u_lightPulseSpeed[${i}]`));
      u.u_lightPulseAmt.push(gl.getUniformLocation(this.program, `u_lightPulseAmt[${i}]`));
      u.u_lightNoShadow.push(gl.getUniformLocation(this.program, `u_lightNoShadow[${i}]`));
    }
    this.uLoc = u;

    gl.uniform1i(u.u_albedo, 0);
    gl.uniform1i(u.u_normal, 1);
    gl.uniform1i(u.u_orm, 2);

    this.ready = true;
  }

  // Ensure textures for sprites are loaded (async)
  async ensureSprites(gl, spriteIds) {
    for (const id of spriteIds) {
      try { await loadSpriteGL(gl, id); } catch {}
    }
  }

  render(sprites, camera, lights = [], time = 0, opts = {}) {
    const gl = this.gl;
    if (!this.ready || !sprites || sprites.length === 0) return;
    if (!this.program) return;

    // Sort back to front for alpha blending
    const sorted = sprites.slice().sort((a, b) => {
      const da = (a.x - camera.x) ** 2 + (a.y - camera.y) ** 2;
      const db = (b.x - camera.x) ** 2 + (b.y - camera.y) ** 2;
      return db - da;
    });

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const u = this.uLoc;
    if (!u.u_resolution) return;

    gl.uniform2f(u.u_resolution, camera.resolution[0], camera.resolution[1]);
    gl.uniform2f(u.u_pos, camera.x, camera.y);
    gl.uniform1f(u.u_angle, camera.angle);
    gl.uniform1f(u.u_planeLen, camera.planeLen || Math.tan(Math.PI * 0.25));
    gl.uniform1f(u.u_bobPixels, camera.bobPixels || 0);
    gl.uniform1f(u.u_eyeZ, camera.eyeZ || 0.5);
    gl.uniform1f(u.u_time, time);

    const sunDir = opts.sunDir || { x: -0.55, y: -0.45, z: -0.7 };
    gl.uniform3f(u.u_sunDir, sunDir.x, sunDir.y, sunDir.z);
    gl.uniform1f(u.u_sunIntensity, opts.sunIntensity ?? 1.5);
    const sc = opts.sunColor || [1, 1, 1];
    gl.uniform3f(u.u_sunColor, sc[0], sc[1], sc[2]);
    gl.uniform1f(u.u_ambient, opts.ambient ?? 0.36);
    gl.uniform1f(u.u_fogBase, opts.fogBase ?? 0.06);
    gl.uniform1f(u.u_fogSq, opts.fogSq ?? 0.005);

    const numL = Math.min(lights.length, this.maxLights);
    if (u.u_numLights) gl.uniform1i(u.u_numLights, numL);
    for (let i = 0; i < this.maxLights; i++) {
      if (i < numL) {
        const L = lights[i];
        const pos = L.pos || [0, 0, 0];
        const color = L.color || [1, 1, 1];
        if (u.u_lightPos[i]) gl.uniform3f(u.u_lightPos[i], pos[0], pos[1], pos[2] || 0.5);
        if (u.u_lightColor[i]) gl.uniform3f(u.u_lightColor[i], color[0], color[1], color[2]);
        if (u.u_lightIntensity[i]) gl.uniform1f(u.u_lightIntensity[i], L.intensity || 0);
        if (u.u_lightRadius[i]) gl.uniform1f(u.u_lightRadius[i], L.radius || 5);
        const typeMap = { point: 0, spot: 1, flicker: 2, pulse: 3, emissive: 4, ambient: 5, steady: 6, directional: 0 };
        const lt = L.typeId ?? typeMap[L.type] ?? 0;
        if (u.u_lightType[i]) gl.uniform1i(u.u_lightType[i], lt);
        const dir = L.dir || [0, 0, -1];
        if (u.u_lightDir[i]) gl.uniform3f(u.u_lightDir[i], dir[0], dir[1], dir[2] || -1);
        if (u.u_lightConeInner[i]) gl.uniform1f(u.u_lightConeInner[i], L.coneInner ?? 0.85);
        if (u.u_lightConeOuter[i]) gl.uniform1f(u.u_lightConeOuter[i], L.coneOuter ?? 0.65);
        if (u.u_lightPulseSpeed[i]) gl.uniform1f(u.u_lightPulseSpeed[i], L.pulseSpeed ?? 0);
        if (u.u_lightPulseAmt[i]) gl.uniform1f(u.u_lightPulseAmt[i], L.pulseAmount ?? L.pulseAmt ?? 0);
        if (u.u_lightNoShadow[i]) gl.uniform1i(u.u_lightNoShadow[i], (L.noShadow || lt === 4 || lt === 5 || lt === 6) ? 1 : 0);
      } else {
        if (u.u_lightPos[i]) gl.uniform3f(u.u_lightPos[i], 0, 0, 0);
        if (u.u_lightColor[i]) gl.uniform3f(u.u_lightColor[i], 0, 0, 0);
        if (u.u_lightIntensity[i]) gl.uniform1f(u.u_lightIntensity[i], 0);
        if (u.u_lightRadius[i]) gl.uniform1f(u.u_lightRadius[i], 0);
        if (u.u_lightType[i]) gl.uniform1i(u.u_lightType[i], 0);
        if (u.u_lightNoShadow[i]) gl.uniform1i(u.u_lightNoShadow[i], 0);
      }
    }

    for (const s of sorted) {
      if (s.visible === false) continue;
      // getSprite may be sync, need textures
      let meta = null;
      try { meta = getSprite(s.spriteId); } catch {}
      if (!meta) {
        // try fallback to s.type or s.id
        try { meta = getSprite(s.type); } catch {}
      }
      if (!meta) continue;

      let tex = null;
      try { tex = getSpriteTextures(gl, s.spriteId || s.type); } catch {}
      // If not yet loaded, attempt to bind placeholder entry already cached
      // loadSpriteGL is async, but we inserted placeholder on first call
      if (!tex) {
        // ensure we have placeholder cached by calling rarely? Skip this frame then
        continue;
      }
      if (!tex.albedo) continue;

      const frame = (s.frame | 0) % (meta.count || 1);
      const cols = meta.cols || 1;
      const col = frame % cols;
      const row = Math.floor(frame / cols);
      const atlasW = cols * (meta.cellW || 64);
      const atlasH = (meta.rows || 1) * (meta.cellH || 64);
      const sx = col * (meta.cellW || 64) + (meta.cropX || 0);
      const sy = row * (meta.cellH || 64) + (meta.cropY || 0);
      const u0 = sx / atlasW;
      const v0 = sy / atlasH;
      const u1 = (sx + (meta.cropW || meta.cellW || 64)) / atlasW;
      const v1 = (sy + (meta.cropH || meta.cellH || 64)) / atlasH;

      const worldH = s.worldHeight ?? (meta.worldHeight || 0.58) * (s.scale || 1);
      const worldW = s.worldWidth ?? worldH * (meta.worldWidthFactor || 0.43);
      const mat = meta.material || {};
      const smat = s.material || {};
      const normalStrength = smat.normalStrength ?? mat.normalStrength ?? 2.2;
      const rimStrength = smat.rimStrength ?? mat.rimStrength ?? 1.2;

      const inst = new Float32Array([
        s.x, s.y, s.z || 0,
        worldW, worldH,
        u0, v0, u1, v1,
        s.alpha ?? 1,
        normalStrength,
        rimStrength,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
      gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW);

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.albedo);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.normal);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.orm);

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // Hook to receive external shader sources
  setShaderSources(vsSrc, fsSrc, maxLights) {
    vsSpriteSrc = vsSrc;
    fsSpritePBRSrc = fsSrc;
    if (maxLights) this.maxLights = maxLights;
    // Re-init
    try { this.init({ vsSpriteSrc, fsSpritePBRSrc, MAX_LIGHTS: this.maxLights }); } catch (e) { console.warn('[SpriteGpu] setShaderSources failed', e); }
  }

  resize() {}
}
