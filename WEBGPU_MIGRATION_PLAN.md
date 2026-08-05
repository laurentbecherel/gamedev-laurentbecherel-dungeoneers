# WebGL2 → WebGPU Migration — Architecture & Implementation Plan

**Date:** 2026-08-05  
**Scope:** Migrate entire `src/render/` pipeline from WebGL2/GLSL 300 es to WebGPU/WGSL  
**Impact:** renderer-gpu.js (~1900 LOC), gl-utils.js (169 LOC), shaders.js (~1000 LOC), shader-lib/*.glsl.js (10 files, ~1800 LOC), sprite-gpu.js (444 LOC), sprite-atlas.js (287 LOC), map-upload.js, plus game bootstrap (main.js, game.js) and all tests.

---

## 1. Why WebGPU (Motivation for this migration)

- **Next phases depend on it:** compute shaders for visibility culling, async texture compression, storage buffers for light BVH, etc impossible in WebGL2.
- **Performance:** WebGPU gives explicit bind-group caching, lower CPU overhead than WebGL2, better parallel shader compile (no KHR_parallel_shader_compile polling), and avoids ANGLE translation shims that made shader linking take 30-40s in heavy-modifier builds.
- **Features:**
  - Uniform buffers are first-class (no INVALID_INDEX fallback).
  - Texture2DArray is natively efficient with explicit formats (r8unorm vs RGBA8 detection hack removed).
  - MRT is trivial via multiple colorAttachments (no drawBuffers hack).
  - Compute pass will allow us to move `_computeDepthBuffer` (96-step DDA per column on CPU) to GPU for sprite occlusion culling.
  - Better sampler/texture separation, optional anisotropy, etc.
- **Future-proofing:** WebGL2 is legacy; Chromium is optimizing WebGPU. Three.js, Babylon all migrating.

---

## 2. Current WebGL2 Architecture Recap

```
main.js → isWebGL2Supported → Game.init → GPURenderer (WebGL2)
                           ↓
                   createProgramAsync x5 (KHR_parallel_shader_compile polling)
                   VAOs full-screen quad [-1,-1,1,-1,-1,1,1,1]
                   Texture2DArray x12 (wall albedo/norm/h/rm, floor, ceil)
                   Textures: mapTex (R=cellType, G=floorH, B=ceilH), matMap (R=floorId,G=ceilId),
                              modifierMap (moss,puddle), modifierMap2 (damaged), noise (128 tiling),
                              palette 256x1, LUT 1024x32 (R8), blueNoise 64x64
                   FBOs: gBufferFBO (sceneTex + gNormalDepthTex MRT), ssrFBO, compositeFBO, sceneFBO, mapUITex
                   UBO: ModifiersBlock 34*vec4 (544B) binding=1
                   LightManager + SpriteGpuRenderer (instanced billboard, 8 lights)

Per frame:
  1. GBuffer pass: bind gBufferFBO, drawBuffers(COLOR0+1) → raymarch fsSource outputs outColor+outGBuffer (octaNormal.xy + depthNorm + puddleMask). Depth buffer CPU DDA for occlusion.
  2. Sprite pass: CPU occlusion + sort back-to-front, draw to COLOR0 only, BLEND SRC_ALPHA ONE_MINUS_SRC_ALPHA.
  3. SSR pass (optional): ssrFBO samples sceneTex + gNormalDepthTex + blueNoise → fsSSR traceScreenSpaceRaySSR (worldToScreenUV, 64 steps + 8 binary refine, floor rejection).
  4. Composite: compositeFBO mix scene + SSR with tint influence.
  5. Quantize: default FB → fsQuantize samples scene/composite + palette + LUT → doom palette if authentic.
  6. UI: renderMapUI uploads parchment RGBA → _renderUIPass fullscreen or corner quad.

Shader variants via string replace outColor=... for 7 debug programs (mossNoise, mossEnv, etc) lazy-compiled on Digit6.

TextureUnits: 0 map, 13 matMap, 1-4 wall array, 5-8 floor, 9-12 ceil, 14 modifier, 15 modifier2 (+0-2 for SSR sub-programs).
```

Shader-lib decomposition: common (isWallCell, nearestWallDistAndNormal, rayCircleHit, resolveWallHit), material (decodeNormal, sample helpers), pom (nazgraz clamp), raymarch (traceRaySun 64 DDA), pbr (GGX), chamfer, grid-chamfer, modifiers (737 LOC, UBO 34 vec4, moss/damaged decomposition fully tunable), scene (shadeFloor/Ceil/WallCell), ssr (octaEncode, worldToScreenUV, traceScreenSpaceRaySSR).

---

## 3. Target WebGPU Architecture

### 3.1 High-level design principles

1. **Preserve public API** — `GPURenderer` class keeps same methods (`init(dungeon,config)`, `render(dungeon,player,timeSec)`, `uploadMap`, `reuploadAtlases`, `renderMapUI`, `toggle*/set*`, `cyclePBRDebug`, `isReady`) so `core/game.js` changes minimally (only import rename + support check).
2. **Module parity** — Replace `gl-utils.js` with `gpu-utils.js` (WebGPU helpers). Keep `gl-utils.js` as `gl-utils-legacy.js` for reference or delete after migration (we delete and replace).
3. **Shader parity** — New `shaders-wgsl.js` + `shader-lib/*.wgsl.js` mirrors GLSL modular composition but emits WGSL. Main uber shader string composition stays JS-driven.
4. **Pipeline caching** — 5 render pipelines (raycast gbuffer + sprite + ssr + composite + quantize + ui) each with bind-group layouts, cached pipelines. Debug variants are separate pipelines created lazily.
5. **Resource model:**
   - Device: `navigator.gpu.requestAdapter() → adapter.requestDevice()`
   - Canvas: `canvas.getContext('webgpu')`, `configure({device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode:'opaque'})`
   - Uniform buffers: instead of 80+ individual uniforms, pack into structs:
     - `CameraUniforms`: resolution, playerPos, angle, fov, playerHeight, bobPixels, mapSize, time, etc (~64 B)
     - `LightingUniforms`: numLights + 8 lights (pos,color,intensity,radius,type,dir,cone, pulse/noShadow, flicker) + ambient/sun/fog (~ ~800 B)
     - `MaterialCounts`: wallCount,floorCount,ceilCount
     - `Toggles`: authentic, bandLevels, gridDebug, lightingEnabled, pbrEnabled, pomEnabled, pbrDebug, aoSun/Point/Ambient, chamfer*, corner*, shadow bias, pbr extended, rendering muls, ssrDepthRange, modifiersEnabled (~256 B)
     - `POMUniforms`, `ChamferUniforms`, etc — grouping reduces bind-group churn; for first iteration we can have 2 big UBOs: `FrameUniforms` (camera+time+toggles) and `LightingUniforms`, plus ModifiersBlock (kept 34*vec4=544 B).
   - Textures: `GPUTexture` creation via `device.createTexture({size:[w,h,depth], dimension:'2d', format, usage: TEXTURE_BINDING|COPY_DST|RENDER_ATTACHMENT for targets})` + `queue.writeTexture`. Samplers separate (nearest, linear, repeat).
   - For simplicity, first pass we use `texture_2d<f32>` for mapTex/matMap/modifier and `texture_2d_array<f32>` for material arrays (format rgba8unorm / r8unorm). In WGSL we need array index as i32 or u32.
   - Render targets: `sceneTex`, `gNormalDepthTex`, `ssrTex`, `compositeTex` as GPUTextures with RENDER_ATTACHMENT usage, plus views.

6. **Bind group layouts:**
   - Group 0: Frame uniforms + lighting uniforms + modifiers UBO (3 buffers)
   - Group 1: Material textures (12 textures + 2 samplers sampled? We'll use 2 samplers: nearest and linear, share)
     - Actually WebGPU allows up to 16 textures per group; we have 12 material arrays + mapTex + matMap + modifierMap + modifierMap2 + noise + blueNoise etc — need split across groups.
   - Simpler for MVP: all textures in group 1 (16 max), samplers in group 2.
   - Define: Group 0 = uniforms (frame, lights, modifiers), Group 1 = textures (map, matMap, wall*4, floor*4, ceil*4, mod1,mod2, noise, blueNoise) — 16 slots exactly.
   - Group 2 = samplers (nearest, linear, repeat).

   For SSR/composite/quantize passes which sample sceneTex, gNormalDepthTex, etc., use separate bind group layouts referencing those textures.

7. **Vertex handling:** Full-screen triangle technique instead of quad VAO: vertex shader with `@builtin(vertex_index)` generating triangle covering screen `pos = vec2(f32((i<<1)&2), f32(i&2))*2.0 -1`. No vertex buffers needed for fullscreen passes. For UI quad, use dynamic vertex buffer or compute in shader from uniform quad coords.

8. **MRT GBuffer:** WebGPU render pass with `colorAttachments: [ {view: sceneView}, {view: gNormalView} ]`.

9. **Sprite pass:** Keep CPU sort but use WebGPU pipeline with instanced rendering: instance buffer with 12 floats same as before, but use `device.createBuffer` + `queue.writeBuffer`. Vertex shader reads corner from vertex_index (6 vertices for 2 tris) + instance data.

10. **Fallback:** WebGPU not available everywhere (Firefox). Plan:
    - New `isWebGPUSupported(): boolean` checks `navigator.gpu`.
    - Keep shim `isWebGL2Supported` that delegates to WebGPU OR returns false — but we still want to detect and show message if neither.
    - For Dev / Playwright: ensure Chromium launched with WebGPU enabled (`--enable-unsafe-webgpu` or recent stable already default). Update playwright.config.js to add launchOptions args.
    - No WebGL2 fallback in production — the migration is intentional hard cut. But keep legacy file `renderer-gpu-legacy.js` untracked just in case? Decision: delete gl-utils and replace, but git history retains.

### 3.2 File structure after migration

```
src/render/
  gpu-utils.js              # WebGPU device/texture/buffer/pipeline helpers (replaces gl-utils.js)
  shaders-wgsl.js           # WGSL source composition (vsSourceWgsl, fsSourceWgsl, vsQuantizeWgsl, etc.) mirrors shaders.js
  shader-lib/
    common.wgsl.js
    material.wgsl.js
    pom.wgsl.js
    raymarch.wgsl.js
    pbr.wgsl.js
    chamfer.wgsl.js
    grid-chamfer.wgsl.js
    modifiers.wgsl.js
    scene.wgsl.js
    ssr.wgsl.js
    [old .glsl.js kept until full parity, then removed]
  renderer-gpu.js           # Now WebGPU implementation (same public class name GPURenderer)
  renderer-gpu-legacy.js    # (optional) backup of old WebGL2 for diff reference, gitignored or deleted
  sprite-gpu.js             # WebGPU billboard renderer (API same, internals WebGPU)
  sprite-atlas.js           # Adapted: getSpriteTextures now returns GPUTexture views instead of gl textures; loader uses createImageBitmap → copyExternalImageToTexture
  palette.js                # Unchanged (CPU)
  map-upload.js             # Adapted to WebGPU texture upload (queue.writeTexture)
  map-ui.js                 # Mostly unchanged (CPU canvas → then upload to GPU texture)
  minimap.js                # Unchanged (Canvas2D legacy viewer)
  ssr-math.js               # Unchanged (JS mirror for tests)
  gpu-init.js               # New: adapter/device init + canvas config
```

Also:

```
src/main.js                 # isWebGPUSupported guard, not WebGL2
src/core/game.js            # imports GPURenderer same, but may use new gpu-init
src/playwright.config.js    # add WebGPU launch args
```

### 3.3 WGSL Port Strategy (GLSL → WGSL mapping)

| GLSL concept | WGSL equivalent |
|--------------|-----------------|
| `#version 300 es`, `precision highp` | Removed; WGSL is inherently highp |
| `uniform sampler2D` + `u_mapTex` | Separate `texture_2d<f32>` + `sampler` in bind group, sample via `textureSample` |
| `sampler2DArray` | `texture_2d_array<f32>` (or texture_2d_array + sampler). Sample `textureSample(..., vec3(uv, layerIdx))` — note WGSL array index is f32 layer coords but samples with u32 layer via `textureSample` third coord? Actually `textureSample(t,s,coord: vec2<f32>, array_index: u32 or i32)`. We'll abstract. |
| `texelFetch(u_mapTex, ivec2, 0)` | `textureLoad(mapTex, ivec2, 0)` — no sampler needed. |
| `uniform float/int` | Members of uniform struct `FrameUniforms` |
| `uniform vec3 u_lightPos[8]` | Array in uniform struct `array<vec3<f32>,8>` with padding careful (std140-like but WGSL has explicit layout; use `vec4` to avoid alignment issues — encode pos as vec4). Simpler: struct Light { pos: vec4, color: vec4, params... } array. |
| `layout(location=0) out vec4 outColor` | Fragment returns `struct { @location(0) color: vec4<f32>, @location(1) gbuffer: vec4<f32> }` |
| `in vec2 v_uv` / `out` | `@location(0) uv: vec2<f32>` etc. |
| `gl_Position = vec4(a_pos,0,1)` | Return `@builtin(position) vec4<f32>` |
| `octaEncode` unchanged logic, just syntax: `f32`, `vec2<f32>` |
| `for (int i=0;i<64;i++)` | `for (var i=0; i<64; i++)` but need `i32`. WGSL loops must be uniform-controlled? We use `for (var i: i32 =0; i<64; i++) {}` — this is constant loop, okay. |
| `discard` | Keep `discard` in WGSL removed; use early return or `if (alpha < thresh) { discard; }` — WGSL uses `discard;` is valid? Actually WGSL has `discard` via extension? Standard: use `if (albedo.a < 0.08) { discard; }` is `discard;` valid as of WGSL 1.0? Yes `discard` statement exists. Check. If not, we set alpha=0 and rely on blend? We'll use `discard`. |
| UBO `layout(std140) uniform ModifiersBlock { vec4 ... }` | Uniform struct `struct ModifiersBlock { modMossAlbedo: vec4<f32>, ... }` with 34 vec4s = 544B |
| `texture(u_modifierMap, uv)` | `textureSample(modifierMap, linearSampler, uv)` |

**Material helper abstraction**

Define in WGSL:

```wgsl
struct FrameUniforms {
  resolution: vec2<f32>,
  playerPos: vec2<f32>,
  playerAngle: f32,
  fov: f32,
  playerHeight: f32,
  bobPixels: f32,
  mapSize: vec2<f32>,
  time: f32,
  // toggles padded...
  authentic: i32,
  bandLevels: i32,
  gridDebug: i32,
  lightingEnabled: i32,
  // etc need vec4 alignment - pack as separate struct
}
```

To avoid complex packing issues, use multiple uniform buffers or one big buffer with `vec4` arrays - simpler: use same Modifiers UBO trick: everything as `vec4` array and JS side fills Float32Array mapping.

MVP simplification: Create uniform buffers that exactly match WebGL uniform locations but as storage of f32/i32, and JS writes similarly to buffer. For textures, we have bind group with all textures.

**Full-screen triangle vertex shader (WGSL)**

```wgsl
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  // triangle covering screen: (-1,-1), (3,-1), (-1,3) -> pos = vec2((vid<<1 &2), vid &2) trick
  var pos = array<vec2<f32>,3>(
    vec2(-1.0,-1.0),
    vec2(3.0,-1.0),
    vec2(-1.0,3.0)
  );
  return vec4(pos[vid], 0.0, 1.0);
}
```

Fragment needs uv: compute from position: `uv = (pos.xy *0.5+0.5)` with Y flip careful (WebGPU NDC Y down? Actually WebGPU NDC Y flipped vs GL? Need to check. We'll handle in shader: uv = vec2(pos.x*0.5+0.5, 1.0 - (pos.y*0.5+0.5))? WebGL UV bottom-left vs top-left. Original GLSL v_uv = a_pos*0.5+0.5 and fragCoord uses (1-v_uv.y) adjustments plus u_bobPixels. We must preserve behavior. Simplest: compute uv in frag from @builtin(position): `uv = position.xy / resolution` and then re-derive fragCoord as earlier.

Alternatively, have vertex output uv and compute fragCoord similar to before.

**Raymarch port**

Keep DDA loop same but using `textureLoad(mapTex, ivec2<i32>(mapPos), 0)` to fetch cell type (original `texelFetch(u_mapTex, ivec2(mapPos),0)`). mapTex format rgba8unorm — we get vec4<f32> 0-1 range, need to multiply .r *255 like before.

`resolveWallHit` function: in GLSL it returns bool and out params via `out float t, out vec2 Hp, ...`. WGSL doesn't have out params; use struct return or pointer params (`ptr<function, f32>`). We'll return struct `WallHitResult { hit: bool, t: f32, hp: vec2<f32>, n: vec2<f32>, rounded: bool }`.

**PBR, Chamfer, Grid, Modifiers, Scene, SSR** - each GLSL snippet translated to WGSL functions keeping same math (pow, sin, dot, etc same names but `pow`, `sin` etc exist). Need to rename `mix`→`mix` still valid? WGSL uses `mix` as well (or `mix` alias). Clamp `clamp`, `smoothstep`, `step` exist.

**Debug programs** - Instead of string-replace trick to swap `outColor=...`, we will have same technique but in WGSL: have separate entry points or same approach: replace final assignment with debug viz. Lazy creation of debug pipelines continues but using `device.createRenderPipelineAsync` (fast).

**Sprite renderer (WebGPU)**

- Vertex buffer: quad 6 vertices same a_corner same as before but stored in GPUBuffer.
- Instance buffer: same layout 12 floats, but now as vertex buffer with stepMode instance.
- Bind group: albedo, normal, orm textures (2d), uniforms (camera, lights).
- Sorting remains CPU.

**SSR, Composite, Quantize, UI**

Each simple fullscreen pass with own pipeline.

SSR: needs `sceneTex`, `gNormalDepthTex`, `blueNoiseTex`, plus uniform for ssrEnabled, thresholds, etc. We can reuse FrameUniforms + SSR struct.

Composite: samples scene + ssr.

Quantize: samples scene/composite + palette + lut (palette 256x1 rgba8unorm, lut 1024x32 r8unorm or r8). Need nearest sampler.

UI: similar to quantize, samples mapUITex with opacity uniform.

---

## 4. Implementation Steps (Ordered)

### Step 0 — Baseline & Guard
- Run unit tests: `node --test tests/unit/*.test.js` — record passing.
- Verify WebGPU: `navigator.gpu` in Chrome 113+.
- Update `playwright.config.js`: add `launchOptions.args: ['--enable-unsafe-webgpu']` (or `--enable-features=Vulkan,UseSkiaRenderer` etc) even if Chrome 120+ doesn't strictly need, safe.
- Create backup: copy `renderer-gpu.js` → `renderer-gpu-webgl2-legacy.js` (not committed? Actually keep for reference during port via git mv).

### Step 1 — gpu-utils.js (WebGPU core helpers)
Replace `gl-utils.js` with WebGPU equivalents but keep same exports where possible fallback? Actually create new file `gpu-utils.js` with:
- `async initWebGPU(canvas): {device, context, format, adapter}`
- `createTexture(device, w,h,data,format, usage, label)` → GPUTexture + write
- `createTexture2DArray(device, w,h,depth,data,format, label)` — wraps `device.createTexture({size:[w,h,depth], dimension:'2d', format, usage})`
- `updateTexture(device, texture, w,h,data)` → queue.writeTexture
- `createUniformBuffer(device, size, label)` → `device.createBuffer({size, usage: UNIFORM|COPY_DST})`
- `updateUniformBuffer(device, buffer, data, offset)`
- `isWebGPUSupported()` → `!!navigator.gpu`
- Keep legacy helpers for transition? No — we replace entirely.
- Also `getPreferredFormat()`.

Implement with proper format detection: if data.length == w*h → r8unorm, if *3 → rgb8? But WebGPU doesn't have rgb8 as renderable easily; use rgba8unorm and pad. Simplest: always rgba8unorm except height maps as r8unorm. Detect.

### Step 2 — WGSL shader-lib port
Create `render/shader-lib/*.wgsl.js` each exporting string.

Start with:
- `common.wgsl.js`: isWallCell (uses textureLoad), nearestWallDistAndNormal (requires sampling mapTex via textureLoad in loop — need to pass mapTex), rayCircleHit, resolveWallHit.
- `material.wgsl.js`: clampLayer, sample helpers: `sampleWallAlbedo(layer, uv)` → `textureSample(wallAlbedo, sampler, vec3? Actually textureSample for array takes uv:vec2, index:u32)` → use built-in. Implement as functions receiving texture and sampler.
- `pom.wgsl.js`
- `raymarch.wgsl.js`
- `pbr.wgsl.js`
- `chamfer.wgsl.js`
- `grid-chamfer.wgsl.js`
- `modifiers.wgsl.js` — longest, keep UBO struct definition.
- `scene.wgsl.js`
- `ssr.wgsl.js`

Each file will import? Actually keep them as template strings that expect certain global uniforms/textures defined by main shader.

Better: central `shaders-wgsl.js` imports all snippets and concatenates like before into `fsSourceWgsl`.

Define WGSL globals at top of fsSource:
```wgsl
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var<uniform> lights: LightingUniforms;
@group(0) @binding(2) var<uniform> modifiersBlock: ModifiersBlock;
@group(1) @binding(0) var mapTex: texture_2d<f32>;
@group(1) @binding(1) var matMapTex: texture_2d<f32>;
@group(1) @binding(2) var wallAlbedo: texture_2d_array<f32>;
...
@group(2) @binding(0) var nearestSampler: sampler;
@group(2) @binding(1) var linearSampler: sampler;
```

Then lib functions can reference these globals directly (no need to pass).

### Step 3 — shaders-wgsl.js main composition
- Export `MAX_LIGHTS = 8` same.
- `vsFullscreenWgsl` — full-screen triangle vertex.
- `fsRaymarchWgsl` — uber shader: body same as GLSL but translated. Use snippet imports via `${glslCommonWgsl}` etc but those are now WGSL strings.
- `fsQuantizeWgsl`, `fsUIWgsl`, `vsSpriteWgsl`, `fsSpriteWgsl`, `fsSSRwgsl`, `fsCompositeWgsl`

Also export constants for uniform buffer layouts (JS side struct offsets).

### Step 4 — renderer-gpu.js WebGPU rewrite

Class `GPURenderer` but internals WebGPU:

```js
export function isWebGPUSupported() { return !!navigator.gpu; }
export function isWebGL2Supported() { return isWebGPUSupported() || !!document.createElement('canvas').getContext('webgl2'); } // shim for old code paths

export class GPURenderer {
  constructor(canvas) { this.canvas=canvas; this.device=null; ... }
  async init(dungeon,config) {
    const {device, context, format} = await initWebGPU(this.canvas);
    this.device=device; this.context=context; this.format=format;
    // create pipelines, textures, buffers
    // load materials via getAsset, generateMaterialArrayData
    // upload via createTexture2DArray
    // create render targets
    // create uniform buffers + bind groups
    // init sprite renderer
  }
  render(dungeon,player,timeSec) { // encode commands
    const encoder = this.device.createCommandEncoder();
    // gbuffer pass
    const gPass = encoder.beginRenderPass({colorAttachments:[{view: sceneView, loadOp:'clear',...}, {view: gNormalView,...}]});
    gPass.setPipeline(this.raymarchPipeline);
    gPass.setBindGroup(0, this.frameBindGroup);
    gPass.setBindGroup(1, this.materialBindGroup);
    gPass.setBindGroup(2, this.samplerBindGroup);
    gPass.draw(3);
    gPass.end();
    // sprite pass etc → similar, encoding second pass into same command buffer or separate
    // SSR pass if enabled
    // composite
    // quantize to canvas (need currentTexture view)
    this.device.queue.submit([encoder.finish()]);
  }
}
```

Need to handle:
- Uniform updates per frame: queue.writeBuffer for frameUniforms, lights etc.
- Depth buffer CPU for sprite occlusion initially kept CPU (reuse _computeDepthBuffer) — okay. Future compute.
- Resize: re-create render target textures.
- BlueNoise texture: procedural 64x64 RGBA.
- Palette + LUT: create textures.

Helper for texture array creation: `device.createTexture({size:[ts,ts,depth], format:'rgba8unorm', usage: TEXTURE_BINDING|COPY_DST})`, then for each layer `queue.writeTexture({texture, origin:[0,0,layer]}, dataSlice, {bytesPerRow: ts*4}, {width:ts,height:ts})` — need loop.

### Step 5 — sprite-atlas.js WebGPU adaptation
- `loadImage` → `createImageBitmap` via fetch.
- `createGLTex` → `createGPUTextureFromImageBitmap` using `device.queue.copyExternalImageToTexture` or `writeTexture`.
- `getSpriteTextures(gl, id)` → `getSpriteTextures(device, id)` returning GPUTexture views.
- Fallback procedural canvas: use `canvas.transferToImageBitmap` or `getImageData` → writeTexture.

### Step 6 — sprite-gpu.js WebGPU port
- Replace `createProgram` with `device.createRenderPipeline`.
- Vertex/index: pipeline with vertex buffers: 0 = quad (6*2 float), 1 = instance (12 float, stepMode instance).
- Uniforms: uniform buffer for camera + lights.
- In `render(sprites,camera,lights,time,opts)`: build instance buffer per sprite as before, but instead of drawing one by one with texture bind changes (inefficient), we must minimize bind group changes: each sprite needs different albedo/normal/orm textures → needs bind group per sprite. Original GL did per-sprite bind + draw. WebGPU same but with bind groups. Keep loop but set bind group then draw 6 vertices instance count 1.

- For simplicity first pass: per sprite, create transient bind group referencing its 3 textures + uniform + sampler. Backend cache views.

### Step 7 — map-upload.js
Replace GL texture creation with GPU texture creation using device.

### Step 8 — Integration with game.js / main.js
- `main.js`: `import { isWebGPUSupported } from "./render/renderer-gpu.js"` and guard: if !isWebGPUSupported, show "WebGPU not supported...".
- `game.js`: import stays same (`GPURenderer, isWebGPUSupported` or `isWebGL2Supported` shim). Ensure `await renderer.init` handles async.
- `sandbox.js` maybe uses gl-utils — update accordingly (low priority, mark as todo).

### Step 9 — Server & Playwright config
- `playwright.config.js`: add `use: { launchOptions: { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] } }`. Also maybe set `extraHTTPHeaders`.
- For Firefox not supported — we run Chromium only in CI? Keep chromium project. E2E tests will now check `navigator.gpu` instead of `getContext('webgl2')`.

### Step 10 — Tests Update

**Unit tests**
- `renderer.test.js` currently checks `#version 300 es`, WebGL2 GLSL, gl-utils helpers. Need to update to WGSL:
  - Check `fsSource` contains `texture_2d_array`, `textureSample`, `@fragment`, `@vertex`, `uniform`, etc.
  - Required uniforms list now become members of uniform structs — check for struct fields or binding names: e.g., `mapTex`, `wallAlbedo`, `FrameUniforms`, `LightingUniforms`, `modifiersBlock`, etc. Instead of checking individual `u_*` uniform strings, check for WGSL binding equivalents: `wallAlbedo`, `floorAlbedo`, `ceilAlbedo`, `modifierMap`, `palette`, `blueNoise`, etc plus PBR toggles.
  - Keep POM grazing safety checks but look for WGSL equivalent: `pomMinVz`, `pomMaxOffset`, etc.
  - Keep chamfer/corner checks: look for `nearestWallDistAndNormal`, `rayCircleHit`, etc (functions still exist but now WGSL syntax).
  - Update `gl-utils has UBO helpers` → check `gpu-utils` has `createUniformBuffer`, `createTexture2DArray`, `isWebGPUSupported`.
- Other unit tests (materials, generator, etc) unchanged because CPU side same. Only renderer test affected.

**E2E tests**
- `game.spec.js`: first test `WebGL2` → replace with WebGPU: `const webgpuOk = await page.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter()));` Expect true.
- Non-black pixels test: still `canvas.toDataURL()` works with WebGPU? WebGPU canvas toDataURL works if canvas is obtained? Need to ensure context is webgpu. `toDataURL` should still work because canvas is same HTMLCanvasElement; data URL from canvas after WebGPU render should still give pixels if the canvas is readable. Or fallback to checking that `window._gameRenderer.device` exists.
- `game-lighting.spec.js`: similar WebGL2 → WebGPU.
- Add new test: `adapter info` exists.
- Editor, live-edit, etc. unaffected because they don't directly test renderer GL.

### Step 11 — Cleanup & Removal
- Delete `render/gl-utils.js` OR rename to `render/gl-utils-legacy.js` and remove from imports. Since we've replaced functionality with `gpu-utils.js`, we will **delete** old file after confirming new renderer doesn't import it.
- Keep shader-lib glsl files temporarily for reference, but after successful migration, either delete or move to legacy folder. For this PR, we keep both but renderer uses WGSL only, and unit test no longer checks for GLSL version.

---

## 5. Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| WGSL shader compilation errors (syntax, binding mismatches) | Game black screen | Use `device.createShaderModule` with synchronous error checking, log `getCompilationInfo()`. In dev, enable GPU validation via `device.pushErrorScope`. Keep GLSL code open side-by-side for logic diff. |
| WebGPU not available in Playwright bundled Chromium | E2E fails | Add launch args, test locally with `npx playwright test --headed`. If Firefox required, skip WebGPU test gracefully: `test.skip(!isWebGPU)`. Update CI to use Chromium only for now. |
| Texture array format not supported (r8unorm requires feature) | Material height maps fail | Use `rgba8unorm` for all array layers and store height in R channel (wasteful but compatible). Or check `adapter.features.has('texture-format-r8unorm')` — should be core. |
| Uniform alignment issues (vec3 array stride 16) | Lighting broken | Pack lights as struct of vec4s: pos=vec4<f32>, color=vec4, etc., all 16-byte aligned. Use Float32Array view same as WGSL. |
| Full-screen triangle UV flipped vs quad | Scene upside down or bob offset wrong | Match original: original used `v_uv = a_pos*0.5+0.5` then `fragCoord = vec(v_uv.x*resX, (1-v_uv.y)*resY + bobPixels)`. In WebGPU, `@builtin(position)` gives pixel coords top-left origin. So `fragCoord = position.xy` already? Need to invert Y for original logic: `v_uv = position.xy / resolution` but original had Y flip. We'll compute `fragCoord = vec2(v_uv.x*resX, (1-v_uv.y)*resY + bobPixels)` same as before using uv. Ensure bobPixels handling identical. |
| Sprite occlusion CPU depth buffer still used | Performance same as before, but okay | Keep CPU path for v1; later replace with compute shader. Document as future work. |
| Browser memory leaks on resize (recreate textures) | Crash on window resize | Implement `onResize` that destroys old textures (`texture.destroy()`) before creating new. |
| Palette LUT 1024x32 R8 not valid as rgba8unorm? | Quantize fails | Create palette tex 256x1 rgba8unorm, LUT 1024x32 r8unorm or r32? Actually LUT stores palette index 0-255 encoded as r8 value. Use r8unorm but sample as float. |
| Async pipeline creation stalling | 90s timeout in main.js | Use `createRenderPipelineAsync` like before (`createProgramAsync`). Keep timeout logic. |

---

## 6. Success Criteria — Definition of Done

- [ ] New `gpu-utils.js` implements `isWebGPUSupported`, `initWebGPU`, `createTexture*`, `createUniformBuffer`, etc., no WebGL imports.
- [ ] New `shaders-wgsl.js` + 10 `shader-lib/*.wgsl.js` files, 100% WGSL, cover all previous features (raymarch, POM, chamfer, corners, PBR GGX, modifiers 34 vec4 UBO, SSR).
- [ ] `renderer-gpu.js` rewritten to WebGPU: device init, 5+ pipelines (raycast gbuffer, sprite, ssr, composite, quantize, ui), bind groups, uniform updates, texture array uploads.
- [ ] `sprite-gpu.js` & `sprite-atlas.js` ported to WebGPU (texture loading via ImageBitmap).
- [ ] `map-upload.js` ported.
- [ ] `main.js` and `game.js` use WebGPU guard.
- [ ] `playwright.config.js` launch args for WebGPU.
- [ ] Unit tests updated and passing: `npm run test:unit` — especially renderer.test.js now checks WGSL.
- [ ] E2E tests updated and passing: `npx playwright test` — at least `game page loads with canvas and WebGPU`, `3D scene renders non-black pixels`, no console errors.
- [ ] Manual verification: game.html loads, WASD moves, QE turns, M map, 1-8 toggles work, no magenta.
- [ ] Performance: shader compile <2s (vs 30s before), frame time same or better.
- [ ] Documentation: this plan doc + updated README.md render section mentioning WebGPU.

---

## 7. Implementation Order (for this session)

1. **Scaffold** — Create `gpu-utils.js` with device init + texture/buffer helpers.
2. **WGSL lib** — Write all 10 wgsl.js snippet files (start from GLSL conversion).
3. **Shaders-wgsl composition** — Build main uber FS from snippets.
4. **Renderer core** — Rewrite `renderer-gpu.js` using gpu-utils + shaders-wgsl: init, pipelines, bind groups, per-frame encode.
5. **Sprite systems** — Port sprite-atlas and sprite-gpu to WebGPU, integrate into renderer.
6. **Map-upload & Misc** — Adapt map-upload, palette, etc.
7. **Bootstrap** — Update main.js, game.js, playwright config.
8. **Tests** — Update unit/e2e tests.
9. **Validation** — Run unit tests, run e2e, manual checks via browser.
10. **Cleanup** — Delete legacy gl-utils if desired, update README.

EstimatedLOC: shaders ~1500 WGSL, renderer ~1200, sprite ~300, utils ~300 = ~3300 new, but much is transliteration.

---

## 8. Future Extensions (Post-migration)

- Compute shader for `_computeDepthBuffer` + `_isOccluded` — move to GPU for 10x speedup and allow thousands of sprites.
- Storage buffer for lights BVH culling per tile (forward+).
- Bindless textures or texture atlas array for sprites (instead of per-sprite bind group).
- Temporal reprojection for SSR (history).
- HDR canvas with `hdr` color space.
- OffscreenCanvas worker rendering.

---

**Decision Log**
- Hard cut to WebGPU (no WebGL2 fallback in production) — justified because next phases require compute.
- Keep `GPURenderer` class name to minimize churn in `core/game.js`.
- Use full-screen triangle not quad to eliminate VAO.
- Keep 8 lights max, same as current, but use uniform struct for efficiency.
- Lazy debug pipelines preserved.

End of plan.
