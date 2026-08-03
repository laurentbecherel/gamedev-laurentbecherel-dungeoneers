# Render Pipeline Rethink — Materials as Texture2DArray + Modifier-ready Architecture

## Why we need this

Current uber-shader (`src/render/shaders.js` ~1500 LOC, `renderer-gpu.js` ~1200 LOC) does everything in one fragment shader:
- DDA raymarch (64 steps) + corner-aware resolveWallHit + rounded corners (outer+inner)
- Material sampling via concatenated atlas (wallAlbedo 64*w wide, clamped to 1 mat to avoid CLAMP_TO_EDGE streaks)
- POM (wall/floor/ceil separate strengths + extended clamping/fading uniforms)
- Chamfer baseboard/cove + wall edge chamfer + trim highlight
- Grid tile chamfer (Task8) — subtle 1m grout grooves (5-7cm), duplicated 4x across render paths
- Corners geometry shading + albedo boost/rough mul
- PBR GGX with sun + N point lights (MAX 12) each with shadow raymarch DDA 64 + spot/flicker/pulse branches duplicated for PBR OFF path
- Fog, HDR warm-white fix, authentic banding, palette quant pass, UI pass, sprite PBR billboard pass

Problems:
1. **Material scalability**: Adding a new wall type (stone brick variant, mossy, etc) requires growing atlas horizontally, fixing wrapping/filtering, and hardcoding matId. No per-room variation today — all forced to ID 1.
2. **Uber growth**: Every new material/modifier would add branches + uniforms → shader compile time + runtime cost blow up.
3. **Duplication**: Floor/ceiling chamfer + grid groove duplicated across 4 render paths (hit upper floor, hit upper ceiling, fallback floor, fallback ceiling). Same for wall chamfer near floor/ceil.
4. **Lighting cost**: 12 lights loop per frag + shadow DDA per light = heavy. Should guarantee 8 dynamic lights with live shadows, not necessarily 12.
5. **Modifiers future**: Task9 wants 6 modifiers (moss, damaged, water, puddle, blood, dust) that alter albedo/normal/height/roughness via procedural noise masks + AO/height/roughness cues + per-cell field baked by generator. Current uber shader has no slot for that.

Goal: simplify, make faster, make extensible, keep forward rendering, keep 8 dynamic lights with shadows.

---

## High-level Architecture Proposed by User (and endorsed)

### 1. Materials baked into sampler2DArray
- Each material type becomes one layer in a Texture2DArray.
- One array per category per PBR channel:
  - Wall: wallAlbedoArray, wallNormalArray, wallHeightArray, wallRoughMetalAOArray
  - Floor: floorAlbedoArray, ...
  - Ceiling: ceilAlbedoArray, ...
- Total 12 array textures (or 3 arrays of RGBA + etc). No bleeding vs atlas.
- Adding a new stone-wall type = new baked layer + its id. Zero shader growth.
- Map texture already carries per-cell IDs:
  - Wall ID = grid[x,y] value (R channel of mapTex: 0 floor, >0 wall mat ID)
  - Floor ID = matMap R channel (second texture)
  - Ceil ID = matMap G channel
- Shader samples right array layer via material ID. So per-room different wall/floor/ceil styles becomes trivial: generator assigns floorMat / ceilMat per cell per room.

Implementation:
- `src/world/materials.js`: new `generateMaterialArrayData` that returns per-category array buffers:
  - For N wall mats, each 64x64 RGBA/R8. Pack consecutively into depth.
  - Return { texSize, wallCount, floorCount, ceilCount, walls:{albedo, normal, height, roughMetalAO}, floors:{...}, ceils:{...} }
  - Remove forcedCount=1 clamp. Support arbitrary N (at least 2 existing in JSON).
  - Keep old `generateMaterialAtlases` as shim calling new function and reshaping to old atlas shape for backwards compat tests, or deprecate.
- `src/render/gl-utils.js`: new helpers
  - `createTexture2DArray(gl, w, h, depth, data, filter, format)` handling RGBA vs R8
  - Uses `gl.TEXTURE_2D_ARRAY`, `texImage3D`.
  - Ensure NEAREST/LINEAR filtering path; no mipmaps for now (or generate).
- `src/render/renderer-gpu.js`:
  - Use `createTexture2DArray` for material arrays.
  - Cache `materialInfo = { wallCount, floorCount, ceilCount, texSize }`
  - Bind array textures to units (still TEXTURE0+ etc, but target is TEXTURE_2D_ARRAY)
  - Upload counts as uniforms? Or shader uses layer index directly from fetch, no need count.
  - Live-edit `reuploadAtlases` -> `reuploadMaterialArrays` supporting array path.
  - Update `uploadMap` to preserve material IDs per cell (already does).
- `src/render/shaders.js`:
  - Change `uniform sampler2D u_wallAlbedo` etc → `uniform sampler2DArray u_wallAlbedo` etc (6-12 uniforms).
  - Remove `u_atlasWalls`, `u_atlasFloors`, `u_atlasCeils`, `u_texSize` usage (keep uniform declarations for compat but unused, or drop and handle renderer not sending them).
  - Replace `atlasUV()` function with direct sampling: `texture(u_wallAlbedo, vec3(uv, float(layer)))`
  - Implement material fetch helpers returning struct `Material`:
    ```
    struct Material {
      vec3 albedo;
      vec3 normalRaw;
      vec3 normalTS;
      float height;
      vec4 rma; // rough, metal, emissiveStrength, ao
      vec3 emissive;
    };
    ```
  - Proper per-cell material ID retrieval:
    - Wall: `float matId = cellType; float layer = max(0.0, matId-1.0);`
    - Floor near-wall path: compute `ivec2 floorCell = ivec2(floor(floorWorld)); float floorMatId = float(texelFetch(u_matMap, floorCell,0).r);`
    - Ceil similar with `.g`
    - Fallback floor/ceil similar.
    - Ensure layer clamped to 0..count-1 to avoid OOB sample returning black; fallback to layer 0 if ID 0 or OOB.

### 2. Modifiers — future-proof plumbing (not full Task9 implementation)
Design for later, but lay groundwork now:

- Generator bakes per-cell modifier field:
  - New texture `u_modifierMap` size gridW x gridH, RGBA8:
    - R = moss intensity (0-255), G = water/damage, B = puddle/blood, A = dust ?
    - Or better: store 2 textures for 6 modifiers: modTex0 RG = moss, damaged etc; but for now single RGBA with 4 modifiers, second for remaining 2.
  - Simplest: one `usampler`? No, use regular sampler2D.
  - For this refactor branch: stub generator to emit empty modifier map (all zeros) so shader path early-outs.
  - File: `src/world/modifiers.js` new module responsible for per-cell modifier baking based on role/noise (reuse hash2i).

- Modifier params UBO / uniform array (live-tunable, from material-modifiers.json):
  - New config `src/assets/config/rendering/material-modifiers.json`:
    ```
    {
      version:1,
      enabled:false, // off by default for this refactor, future true
      modifiers:{
        moss:{ enabled:false, albedo:[0.2,0.45,0.15], roughAdd:0.35, heightAdd:0.18, normalStrength:0.6, ... },
        damaged:{...}, water:{...}, puddle:{...}, blood:{...}, dust:{...}
      },
      generator:{ roleWeights:{...}, noiseScale:0.18, ... }
    }
    ```
  - Add to `CONFIG_PATHS` in config.js as `material-modifiers`: ['config/rendering/material-modifiers', 'config/material-modifiers']
  - Add tier entry `T1` in live-config.js (instant uniforms).
  - In renderer: upload modifier param uniforms as array of structs? Simplest: per-modifier uniforms like `u_modMossAlbedo`, `u_modMossRoughAdd`, etc. But future would be UBO. For now define uniform block conceptually, but implement as individual uniforms or via texture.

- Small tiling noise texture baked once for organic masks:
  - Generate 128x128 or 256x256 RGBA noise texture via `hash2i` FBM 3 octaves on CPU.
  - Upload as `u_noiseTex` sampler2D tiling.
  - Used in shader to mask modifiers: `float n = texture(u_noiseTex, worldPos.xz * scale).r;`
  - Bake once at init.

- Shader modifier stub:
  ```
  uniform sampler2D u_modifierMap;
  uniform sampler2D u_noiseTex;
  uniform int u_modifiersEnabled;
  // per-modifier params (from UBO idea)
  struct ModParams { vec3 albedo; float roughAdd; ... };
  // For this branch: only declaration + early return if disabled, so no visual change but plumbing exists.
  void applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float height, in vec3 worldPos, in float ao, in vec2 cell, ... )
  {
    if (u_modifiersEnabled==0) return;
    // sample modifierMap, noise, branch per intensity
  }
  ```
  Call it after material fetch before lighting.

### 3. Lighting — forward, 8 dynamic lights with live shadows
- Keep forward shading.
- Set MAX_LIGHTS = 8 (down from 12) to reduce per-frag loop cost and shadow DDA cost, aligning with requirement.
  - Each light: pos, color, intensity, radius, type, dir, coneInner/Outer, pulse, flickerSpeed/Amount, phase, noShadow.
  - Keep shadow trace: `traceRay` DDA 64 steps with normal-offset bias (already improved to snap dominant axis).
  - Ensure live shadows: point lights cast shadows unless noShadow flag; sun also.
  - Light culling: keep existing smart scoring (distance + front-facing + occlusion penalty + room boost) in renderer-gpu.js selecting nearest 8 including player.
  - Update `shaders.js` arrays size 8, `renderer-gpu.js` uniform upload loops 8.
  - Update `sprite-gpu.js` similarly (it also used MAX_LIGHTS 12 for billboard lighting — update to 8).
  - Update `lighting.json` maxLights to 8 (or keep 12 but clamp to 8 in renderer). Requirement says support 8, so 8 is enough.
  - Verify `src/tests/e2e/game-lighting.spec.js` expects >=8 passes.

- Optionally keep 12 as constant but document 8 min; but to simplify and speed up we move to 8.

### 4. Shader modularization (cleanliness, not separate programs)
WebGL2 can't do #include, but we can compose source via JS:

- Create `src/render/shader-lib/` folder with small JS modules exporting GLSL snippets:
  - `common.glsl.js` → PI, hash, helpers
  - `material.glsl.js` → Material struct + sample functions using sampler2DArray
  - `chamfer.glsl.js` → nearestWallDistAndNormal, applyChamfer helpers
  - `grid-chamfer.glsl.js` → applyGridChamfer
  - `corners.glsl.js` → resolveWallHit, etc
  - `pom.glsl.js` → pomOffset
  - `pbr.glsl.js` → DistributionGGX, GeometrySchlick, fresnel, pbrShade
  - `modifiers.glsl.js` → stub
  - `fog-palette.glsl.js` → fog + quantization

- In `shaders.js`, import snippets and concatenate into fsSource, keeping final program one compile but source organized.

That satisfies "split that in a smart way" — not multiple shader programs, but modular source, so uber-shader is no longer monolithic 1500-line string. Each domain lives separately, easy to replace material system without touching lighting.

Alternatively simpler for this branch: keep single file but extract functions with clear sections and comments, reduce duplication of floor/ceil chamfer code via shared functions.

Decision for this branch: **Do both**:
- Phase A: Convert materials to array without yet splitting file into multiple JS modules (minimal risk, focused change).
- Phase B: Extract chamfer/grid/corners into reusable functions to dedup 4 paths.
- Phase C: Extract shader lib files (optional if time, but recommended).

For safety, start with Phase A then iterate.

---

## Detailed Step-by-Step Plan

### Step 0: Baseline verification
- Run existing unit tests: generator, materials, renderer.
- Ensure game loads at http://localhost:8000/game.html on main branch (record screenshot).
- Note WebGL2 TEXTURE_2D_ARRAY support: Check Chrome/Firefox supports (should: WebGL2 = ES3.0 which requires TEXTURE_2D_ARRAY).

### Step 1: gl-utils 2D Array support
- File: `src/render/gl-utils.js`
- Add `createTexture2DArray(gl, width, height, depth, data, filter, internalFormat?)`
  - Handles RGBA (Uint8Array length = w*h*depth*4) → RGBA8
  - Handles R single channel (w*h*depth) → R8
  - Set WRAP_S/T = CLAMP_TO_EDGE, WRAP_R = CLAMP_TO_EDGE
  - MIN/MAG filter = input filter (NEAREST default)
  - No mipmaps (or generate if filter LINEAR_MIPMAP)
  - Use `gl.texImage3D(gl.TEXTURE_2D_ARRAY, ...)`
- Add `updateTexture2DArray` if needed for live reload.
- Add helper to create empty array for placeholder.

### Step 2: materials.js array generation
- New function `generateMaterialArrayData(wallMats, floorMats, ceilMats, procConfig)`
  - texSize = 64
  - wCount = wallMats.length, fCount = floorMats.length, cCount = ceilMats.length (remove forced 1)
  - For each category, allocate 4 arrays: albedo (w*h*count*4), normal (same), height (w*h*count), roughMetalAO (w*h*count*4)
  - Loop over mats, call genBrickTile / genSlabTile per mat (respect type, base, roughness, variationSeed)
  - Pack layer by layer: offset = layer * texSize * texSize * channels
  - Return object: { texSize, wallCount, floorCount, ceilCount, walls:{albedo, normal, height, roughMetalAO}, floors:{...}, ceils:{...} }
- Keep `generateMaterialAtlases` as compatibility wrapper that takes first layer only? Or update to return both old style and new? Simpler: keep but have it call new function and then slice first layer into old atlas shape for tests, plus also return array data.
- Even better: new export `generateMaterialAtlases` now just calls `generateMaterialArrayData` and for backwards compat builds old atlases from first layer only if count>1 still packs old way? Tests may expect wallAtlasW = texSize*wallCount. Could keep old behavior for unit tests that check atlas size, but mark deprecated.
- Real new function will be used by renderer.

### Step 3: Noise texture baker (modifier future)
- File: `src/world/noise.js` or `src/render/noise.js`
- Function `generateNoiseTexture(size=128, seed=1337)` returns Uint8Array RGBA where R = value noise FBM 3 octaves, G = another octave, etc. Use hash2i / existing.
- Could also generate 3 layers: low freq large blobs, medium, high freq detail.
- Provide `createNoiseTexture` that uploads via createTexture (regular 2D, tiling REPEAT).

### Step 4: Modifier map plumbing (stub)
- File: `src/world/modifiers.js`
  - `generateModifierMap(dungeon, config)` returns Uint8Array w*h*4 (RGBA) per cell, all zero for now.
  - Optionally use roleWeights from config to fill placeholder.
  - Also `uploadModifierMap(gl, dungeon)` similar to map-upload.
- Update `src/render/map-upload.js` to optionally handle modifier texture creation.
- Add modifier config JSON file.
- Add to CONFIG_PATHS and live-config tier.

### Step 5: Renderer GPU overhaul
- File: `src/render/renderer-gpu.js`
  - Import `generateMaterialArrayData`, `createTexture2DArray`, `generateNoiseTexture`.
  - In `init`:
    - Load walls/floors/ceils assets fully (not slice 0,1). Use all mats: wallMats = walls.materials, floorMats = floors.materials, etc.
    - Call `generateMaterialArrayData`.
    - Create array textures via `createTexture2DArray`. Store in `this.atlases` but now as array textures.
    - Create noise texture `this.noiseTex` via generateNoiseTexture + createTexture with REPEAT wrap.
    - Create modifier map texture `this.modifierTex` from dungeon (if dungeon.modifiers present, else zeros). Size = dungeon.w x dungeon.h.
  - Uniform locations: replace atlas uniforms with maybe `u_wallCount` etc but also keep old locations for fallback. Acquire new uniforms: `u_wallAlbedo` etc still same but now sampler type array — location same.
  - Add new uniforms: `u_modifierMap`, `u_noiseTex`, `u_modifiersEnabled`, `u_wallCount`, `u_floorCount`, `u_ceilCount`.
  - Bind textures: wall array textures at units 1-4, floor 5-8, ceil 9-12, mapTex 0, matMap 13, noise 14, modifier 15, etc. Need to allocate enough units (max 16 allowed? WebGL2 minimum 16). Currently we use 0-13. Adding 2 more is okay (14,15). Ensure <16.
  - In render(): bind array textures with `gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex)` not TEXTURE_2D.
  - For modifier map: bind as TEXTURE_2D at unit 15.
  - Update `uploadMap` to also upload modifier map if exists.
  - Update `reuploadAtlases` to handle arrays: need to delete old array textures and recreate.
  - Update light upload: MAX_LIGHTS 8 loops.
- File `src/render/sprite-gpu.js`: check for MAX_LIGHTS 12 hardcode, make dynamic. Its fs uses `u_lightPos[12]` etc. Should match new MAX. Update to 8 or keep generic.

### Step 6: Shader overhaul
- File `src/render/shaders.js`
  - MAX_LIGHTS = 8
  - fsSource modifications:
    - Uniforms: `sampler2DArray u_wallAlbedo` etc instead of sampler2D.
    - Remove `u_texSize`, `u_atlasWalls`, `u_atlasFloors`, `u_atlasCeils` or keep but not use.
    - Add `uniform sampler2D u_modifierMap`; `uniform sampler2D u_noiseTex`; `uniform int u_modifiersEnabled`;
    - Optionally `u_wallCount` etc for clamping.
    - Replace `atlasUV` with function `float getLayer(float matId, float maxCount)` returning clamp.
    - Add helper `vec4 sampleWallAlbedo(float layer, vec2 uv)` = `texture(u_wallAlbedo, vec3(uv, layer))`
    - Implement floor mat fetch: create function `float getFloorMatId(ivec2 cell)` fetching from `u_matMap`.
    - Refactor floor/ceiling code duplication:
      - Create `struct SurfaceResult { vec3 color; float dist; }`?
      - Create function `applyChamfer()` etc.
    - For wall path: albedoRaw = texture(u_wallAlbedo, vec3(uv, wallLayer)).rgb;
    - Similarly normals, height, rma.
    - For floor paths: albedoRaw = texture(u_floorAlbedo, vec3(floorUV, floorLayer)).rgb; etc.
    - Chamfer and grid chamfer: extract into functions `void applyBaseboard(vec2 world, inout vec3 albedo, inout vec3 N, inout float ao, inout vec4 rma, ...)` to avoid 4x duplication.
    - Likewise grid chamfer function.
    - Keep corners logic but ensure it works with array sampling (it doesn't sample material, just geometry).
    - Modifier stub: after material sample, before lighting, call `applyModifiers`.
    - Keep PBR, fog, palette.
    - Reduce duplication by having `renderFloor(vec2 world, vec2 uv, float matLayer, ...)` returning finalColor.
    - Ultimately final shader still ~1000 LOC but organized with functions, array sampling, no atlas math, less duplicated blocks.

### Step 7: Generator updates for per-cell material IDs
- Currently generator sets floorMat/ceilMat per cell to room's floorMat/ceilMat which is forced 1. Now with multiple materials, we want per-room style variation.
- Update `generator.js`:
  - Instead of forcing wallMat=1 always, use actual material selection per room based on zone/architecture/role.
  - Idea: wallMats = 2 existing (dungeon_brick, rough_stone). Randomly assign per room: entrance = brick, guardian = rough stone etc, or mix.
  - For now simple: keep forced 1 for wall but allow floor/ceil variation too (slabs vs cobble, etc).
  - Actually to prove array works, assign randomly 1 or 2 per room using seeded rng.
  - Ensure `grid` holds wall mat IDs (1 or 2) for walls bordering rooms, `floorMat` holds floor ID, `ceilMat` holds ceil ID.
  - This will require updating wall painting loop to paint correct wallMat per room, not always 1.
  - Test: dungeon with 2 wall types should show distinct colors in different rooms.

### Step 8: Config live-edit integration
- Add `src/assets/config/rendering/material-modifiers.json` with enabled:false and param stubs.
- Update `src/config/config.js` CONFIG_PATHS add entry.
- Update `src/config/live-config.js` TIER_MAP add material-modifiers T1.
- Ensure editor can discover new config file via asset list API (server already serves config/*).

### Step 9: Testing
- Unit: `generateMaterialArrayData` produces correct sized arrays, count matches input mats length.
- Update existing `materials.test.js` which may check atlas sizes — adjust to expect array.
- Ensure renderer doesn't throw on array texture creation.
- E2E: game.html loads, no shader compile errors, visual retains previous look (since matérials array layer 0 same as before).
- Performance: measure FPS improvement.

### Step 10: Documentation
- Update README rendering section.
- Add comment in shaders explaining array sampling vs old atlas.

---

## Risks & Mitigations

- WebGL2 TEXTURE_2D_ARRAY support: Chrome 100+ supports, but check via `gl.getInternalformatParameter`? Could fallback to atlas if not supported. For MVP assume supported, but add detection and fallback path using old atlas.
- Texture unit limit: WebGL2 needs at least 16. We use 0 map, 1-12 material arrays (12 units), 13 matMap, 14 noise, 15 modifier = 16 total exactly. OK. If 8 lights uniform expansion doesn't use texture units.
- Sampling with float layer: need to ensure layer passed as float but converted to int via floor? Using `vec3(uv, layer)` where layer is float like 0.0 for first. Should clamp to depth-1.
- Premultiplied alpha? Keep RGBA.

---

## Future Task (not in this branch but prepared)

- Full modifiers: generator fills modifierMap per cell based on roleWeights + noise, shader evaluates noise tex + modifier params to alter material.
- Async baking: move material array generation to Web Worker so main thread not blocked on regen.

---

## Success criteria for this branch

- [ ] `src/render/gl-utils.js` has `createTexture2DArray`
- [ ] `src/world/materials.js` generates array data supporting N materials, no forced 1
- [ ] `renderer-gpu.js` uploads array textures, binds as TEXTURE_2D_ARRAY
- [ ] `shaders.js` uses sampler2DArray, samples correct layer via material ID from map textures, no atlasUV math
- [ ] Wall/floor/ceil different IDs per room render correctly (visual rooms have different wall styles)
- [ ] Shader code deduplicated: chamfer/grid functions, no 4x copy paste
- [ ] Lighting keeps forward, MAX_LIGHTS=8 with live shadows (shadow DDA + bias retained)
- [ ] Modifier plumbing exists: modifier map texture, noise texture, material-modifiers.json config, uniforms, stub applyModifiers that early-outs when disabled
- [ ] Live-edit Tier1 for new config
- [ ] No shader compile errors, game runs
- [ ] Existing E2E tests that don't depend on atlas size still pass (grid debug, lighting, etc)
- [ ] Branch `render-pipeline-material-array` pushed

