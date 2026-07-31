# Task 9: Materials Modifiers — Thorough Implementation Plan

Date: 2026-07-31  
Branch: `task9-materials-modifiers` (from `31facfc` / `task9-setup`)  
Author: Laurent Becherel — `Muse Spark 1.1` expected

---

## 1. Executive Summary

Existing PBR materials are clean procedural atlases (brick/slab, 64x64) sampled per fragment via `atlasUV()`. They look too uniform. Task 9 introduces **6 material modifiers** that variably alter albedo, normals, PBR (rough/metal), and POM height, driven by:

1. A **compiled noise function** (value/hash → FBM, per-modifier seed/scale, evaluated in GLSL).
2. **Material cues** (AO, height, roughness) sampled from the base atlas before alteration.
3. **Generator-driven intensity** per grid cell (story-weighted by room role, deterministic seeded, plus organic noise).

Chosen architecture: **GPU shader overlay + generator texture**. CPU atlases stay untouched; generator emits a low-res modifier map (grid W×H, trivial memory) that renderer uploads as 2× RGBA textures (Nearest). Fragment shader fetches cell intensity, evaluates noise, computes mask using AO/height/rough, then alters channels.

This preserves 60fps, keeps existing atlases, enables storytelling variation per world location, and is fully config-driven + live-editable (Task 7 Tier 1).

---

## 2. Domain Breakdown

### 2.1 The Six Modifiers - Visual Target & Channel Logic

**Shared pipeline** (after base material fetch, before `pbrShade()`):

```glsl
// base
vec3 baseAlbedo = albedoRaw;
vec3 baseN = Nw;
float baseRough = rma.r;
float baseHeight = heightVal;
float baseAO = ao;

// per cell intensity from modifier map texture (0..1)
vec4 cellModA = sampleModifierMapA(worldCell); // R=moss G=damaged B=water A=puddle
vec4 cellModB = sampleModifierMapB(worldCell); // R=blood G=dust B=unused A=unused

// for each modifier m:
float intensity = cellIntensity * hash factors;
float noiseMask = fbm(worldPos*scale + seed) // 0..1 organic blobs/streaks/splatter
float cue = computeCue(ao, height, rough, position) // e.g. moss любит AO dark
float mask = noiseMask * intensity * cue;
mask = smoothstep(threshold, threshold+0.2, mask) * strength

// lerp / add per channel
albedo = mix(albedo, modifierAlbedo, mask)
rough = mix/base + add or target lerp
normal = perturb
height = baseHeight + delta*mask
ao = optionally dark
```

#### Moss
- Albedo: mix to `[0.18,0.42,0.15]` with yellow jitter `[0.22,0.48,0.12]`, keep luminance: `albedo *= 0.9 + variance`
- Normal: add low-freq lump: `vec3 mossN = normalize(vec3(hashGrad*0.6, 1)); N = mix(N, mossN, mask*0.6)`
- Rough: `+0.35` (very rough, 0.7..0.95)
- Height: `+0.18` bumpy via noise, makes POM sponge
- Cue: `ao < 0.88` (grout) * `height low` * `distToWall < 0.4` * `walls low Z`
- Placement: entrance/shrine/secret 0.3-0.5, near DECO_MOSS/ROOTS, corridors lower

#### Damaged
- Albedo: darken crevices black `* mix(0.4,1, noise)` + desaturate 0.2, occasional brick tint shift
- Normal: sharp fracture: hash crack angle, `N = normalize(mix(N, crackN, mask*0.8))` where crackN uses edge orientation
- Rough: `+0.15` + variance 0.07 edge wear
- Height: `-0.15` to `-0.25` chip carve, `chisel = step(noise,0.3)` for craters
- Cue: prefers `edgeDist small` (tile edges) + high traffic factor, AO mid
- Placement: hub/exit/armory 0.4-0.6, near DECO_BROKEN, high depth = more

#### Water / Wetness
- Albedo: darken `*0.85` + slight blue tint `[ -0.05, -0.02, +0.05 ]`, vertical streaks: `streak = noise(worldPos.z * 8 + worldPos.x*0.3)`
- Normal: flatten toward geometric flat `Ngeom` 0.35 mix for smooth wet spec, plus streak normal tilt: `N.x += streak*0.1`
- Rough: `-0.45` glossy, clamped to min `0.12`, streaks vary `-0.2..-0.5`
- Height: `-0.03` slight
- Cue: walls low third (`wallV <0.35`), near puddles, distance to floor height low
- Placement: entrance (rain seep) 0.4, low floors, near water sources, corridors some

#### Puddle (floor only)
- Albedo: darken `0.55` + subtle environment tint `mix base*0.6 with 0.3,0.35,0.45`, edge brighter foam `+0.08` where `puddleEdge = fwidth(mask)`
- Rough: target `0.06..0.12` mirror, `rough = mix(base, 0.08, mask*0.9)`, plus edge 0.25 for foam ring, Fresnel boost implicit via low rough GGX
- Normal: almost flat water: `N = mix(N, vec3(0,0,1) + ripple*0.15, mask*0.85)` where ripple = `fbm*0.2 -0.1` small
- Height: depress `-0.15..-0.22`, pool shape defines edge: `height = mix(base, base-0.18, mask)` — POM will self-shadow edge via step
- Cue: `floorHeight low` (depression) + `noise blob >0.55` with large scale 0.12, corners/wall proximity factor
- Placement: only floors (guard floors only), low zones, near walls, role damp 0.2, push deterministic blob pattern; thresholded so ~15% of floor cells have some puddle

#### Blood
- Albedo: blood palette `[0.45,0.05,0.08]` fresh to dried `[0.30,0.04,0.04]`, splatter = radial dots + drag: generate `splatterNoise = (blob + streak*0.6)`, mix with desat base * dark
- Normal: subtle crust bump `+ hash*0.2`, not strong — keep flat but add micro bump for dried edge
- Rough: `+0.08..+0.18` rougher for dried, but fresh spots `*0.8` slightly glossy: var by `noise >0.7`
- Height: `+0.04..+0.10` crust bump
- Cue: favors center of room + random splatter noise, no AO preference, but can use roughness high as base for crust
- Placement: guardian 0.8, armory 0.5, hub 0.3, corridors near guardian trail toward exit. Use directional vector noise for drag trails.

#### Dust
- Albedo: lerp toward dusty beige `[0.65,0.6,0.5]` + desaturate base 0.3: `albedo = mix(desat(base), beige, mask*0.6)`, preserves luminance low
- Normal: soften: `N = mix(N, Ngeom, mask*0.4)` i.e. blur normal toward flat, reduces detail
- Rough: `+0.25..+0.35` dusty
- Height: `+0.05` accumulation in crevices: `height += mask * 0.05 * (1.0 - ao)` (more where ao dark = crevice)
- Cue: ceilings heavily (`isCeil *1.5`), high corners, away from puddles/water (if puddle >0.2 reduce dust), AO dark/cavities
- Placement: treasure/secret 0.7, shrine 0.4, corridors low 0.15, deeper = dustier? Or shallower dustier (undisturbed). Use `depth` + role

---

### 2.2 Noise Compilation - What "compiling a noise function" Means

In shader we need cheap but decent noise:

- **Hash**: `float hash(vec2 p)` using `sin(fract)*43758.5` or mygame's `hash2i` style. Use existing `hash(float)` from prototype if present, else define.
- **Value noise**: bilinear lerp of 4 hashes at integer lattice `fract` world pos.
- **FBM**: loop `3 octaves`, `freq *=2, amp *=0.5`, sum. Keep 3 max for perf.
- **Per modifier**: different scale + seed offset.

```glsl
float modHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float modNoise(vec2 p){ // value noise
  vec2 i=floor(p); vec2 f=fract(p);
  float a=modHash(i); float b=modHash(i+vec2(1,0));
  float c=modHash(i+vec2(0,1)); float d=modHash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float modFBM(vec2 p, int octaves, float seed){
  float v=0.0; float amp=0.5; float freq=1.0;
  for(int i=0;i<3;i++){ if(i>=octaves) break; v+=modNoise(p*freq+seed)*amp; freq*=2.0; amp*=0.5; }
  return v;
}
```

For wall vertical streaks: use `vec2(worldPos.z*8, worldPos.x)` etc to get streak bias.

For puddle large blobs: scale `0.12` very low.

For blood splatter: combine `fbm + radial blob`: generate random centers via hash per cell, then distance field + streak along `worldPos.xy`.

Could also have CPU pre-bake noise into modifier map? But spec says compiling noise, so shader-side.

---

### 2.3 Generator Story Spreading

**Data**:

- Extend generator output:
```js
dungeon.modifiers = {
  w,h,
  moss: Float32Array(w*h),
  damaged: Float32Array,
  water: Float32Array,
  puddle: Float32Array,
  blood: Float32Array,
  dust: Float32Array,
  seed
}
```
Could be packed into `dungeon.meta.modifiers` plus textures.

Simpler for renderer: two RGBA8 textures (or Float? need Uint8Normalized) size `w x h`.

- Encode intensity 0..1 per modifier per cell.
- Determine per-room base profile + per-cell jitter.

**Algorithm**:

1. After `rooms` + `roleMap` + `depthArr` ready, have config `material-modifiers.generator.roleWeights` with per role intensities (0..1) for each modifier. Provide fallback defaults.

2. For each room ri:
   - `role = roleMap.get(ri)`
   - `weights = roleWeights[role] || corridor`
   - For each mod M: `roomBase[M] = weights[M] * (0.7 + rng*0.6 + depthFactor*0.2)`, clamped 0..1.

3. For each cell (x,y) in room interior:
   - `cellDistToWall = compute min dist to room edge (for per-cell factor)`
   - For each M:
     - `noiseVal = fbm(hash2i(x,y,seed + modIndex)*scale)` → 0..1 organic
     - `distFactor = (mod==moss||puddle) ? (1 / (1+distToWall)) : 1` etc
     - `cellIntensity = roomBase[M] * (0.6 + noiseVal*0.8) * distFactor`
     - Clamp.

4. Corridors: `floorToRoom==-2`, assign `corridor` weights (lower dust/moss).

5. Floors vs walls:
   - Puddle only where `grid==FLOOR` and `floorHeight` local low-ish. Else 0.
   - Moss more on walls adjacent to floor cells with ROOTS/MOSS deco bit.
   - Dust multiplied by `~0.6` on walls, `1.3` on ceilings (but ceiling uses same grid; we handle via shader isCeil, but intensity same).

6. Avoid over-stacking: If sum needed? The spec: "maxModifiersPerCell 2" suggested. So compute all intensities, sort top 2, keep them, zero others below minimal threshold, or normalize top2 to keep visual not muddy.

7. Determinism: Use `hash2i(x,y,seed)` not pure rng for per-cell noise, so same seed same result even if call order changes, but also use `makeRng(seed)` deterministic.

8. Serialize: into dungeon object for renderer: `dungeon.modifierTextures?` Actually renderer can generate its own textures from `dungeon.modifiers` data during init => `GPURenderer.init` after map texture upload, also upload modifier textures.

**Config Shape**:

- New file `src/assets/config/rendering/material-modifiers.json` version 1:

```json
{
  "version":1,
  "enabled": true,
  "global": { "noiseOctaves":3, "blendMode":"top2", "maxPerCell":2 },
  "modifiers": {
    "moss":   { "enabled":true, "albedo":[46,107,38], "albedoStrength":0.85, "roughAdd":0.35, "heightAdd":0.18, "normalStrength":0.6, "noiseScale":0.35, "octaves":3, "threshold":0.42, "aoWeight":0.7, "heightWeight":-0.5, "distToWall":0.35 },
    "damaged":{"enabled":true, "darken":0.45, "roughAdd":0.15, "heightAdd":-0.18, "normalStrength":0.75, "noiseScale":0.55, "threshold":0.48 },
    "water":  {"enabled":true, "darken":0.15, "blueTint":0.05, "roughAdd":-0.45, "roughMin":0.12, "heightAdd":-0.03, "normalFlatten":0.35, "noiseScale":0.8, "streakScale":8.0, "threshold":0.38 },
    "puddle": {"enabled":true, "floorsOnly":true, "albedoDarken":0.55, "roughTarget":0.08, "heightDepress":-0.18, "normalFlatten":0.85, "foamBright":0.08, "noiseScale":0.12, "threshold":0.58, "edgeWidth":0.08 },
    "blood":  {"enabled":true, "albedo":[115,13,20], "albedo2":[77,10,10], "albedoStrength":0.9, "roughAdd":0.12, "heightAdd":0.06, "normalStrength":0.25, "noiseScale":0.65, "splatterScale":1.2, "threshold":0.45 },
    "dust":   {"enabled":true, "albedo":[166,153,128], "desat":0.3, "albedoStrength":0.6, "roughAdd":0.30, "heightAdd":0.05, "normalFlatten":0.40, "noiseScale":0.45, "threshold":0.40 }
  },
  "generator": {
    "seedInfluence":0.3,
    "perRoomJitter":0.4,
    "noiseScale":0.18,
    "maxModifiersPerCell":2,
    "roleWeights": {
      "entrance":  {"moss":0.30,"damaged":0.15,"water":0.40,"puddle":0.20,"blood":0.05,"dust":0.20},
      "guardian":  {"moss":0.05,"damaged":0.60,"water":0.10,"puddle":0.05,"blood":0.85,"dust":0.10},
      "treasure":  {"moss":0.15,"damaged":0.10,"water":0.05,"puddle":0.02,"blood":0.08,"dust":0.70},
      "secret":    {"moss":0.25,"damaged":0.10,"water":0.05,"puddle":0.03,"blood":0.05,"dust":0.75},
      "shrine":    {"moss":0.50,"damaged":0.10,"water":0.20,"puddle":0.10,"blood":0.10,"dust":0.40},
      "hub":       {"moss":0.18,"damaged":0.40,"water":0.15,"puddle":0.08,"blood":0.30,"dust":0.20},
      "armory":    {"moss":0.08,"damaged":0.30,"water":0.08,"puddle":0.05,"blood":0.50,"dust":0.30},
      "exit":      {"moss":0.12,"damaged":0.50,"water":0.30,"puddle":0.18,"blood":0.15,"dust":0.25},
      "corridor":  {"moss":0.12,"damaged":0.20,"water":0.15,"puddle":0.08,"blood":0.12,"dust":0.15},
      "hall":      {"moss":0.15,"damaged":0.25,"water":0.10,"puddle":0.05,"blood":0.10,"dust":0.25}
    },
    "distanceToWallFactor": { "moss":0.30, "puddle":0.50, "dust":0.20, "water":0.20 },
    "ceilingDustBoost":1.35,
    "floorPuddleBoost":1.2
  },
  "debug": { "toggleKey":"9", "showModifierOverlay":false }
}
```

---

## 3. Touch Points - Files to Modify

### 3.1 New Files
- `src/assets/config/rendering/material-modifiers.json` - main config above.
- `src/world/modifiers.js` (or `src/world/material-modifiers.js`) - CPU side generation of per-cell intensities. Function `generateModifiers(dungeon, config, seed, rng)` returning packed object.
- Optional helper `src/render/modifier-map.js` to build GPU textures from CPU data.

### 3.2 Existing Files

#### `src/config/config.js`
- Add entry `'material-modifiers': ['config/rendering/material-modifiers', 'config/material-modifiers', 'config/main']` in `CONFIG_PATHS`.
- Ensure `getAsset` can fetch it; editor will discover via recursive walk (check `editor.js` walk logic – it walks `assets/config` dir, so `rendering/material-modifiers.json` should appear automatically if server's `/api/assets` list includes nested? Verify `server.js` asset listing).

#### `src/world/dungeon/generator.js`
- Import `generateModifiers`.
- After Stage 6-9 (grid carved, heights, deco), call `modData = generateModifiers({rooms, grid, deco, floorHeight, floorToRoom, w,h, seed, roleMap})`.
- Attach to dungeon: `dungeon.modifiers = modData` (with arrays).
- Also ensure `dungeon.modifiers` persisted if needed for tests.
- Extend roles weighting etc.

#### `src/server/server.js` (or `src/server/index.js`)
- Ensure static file serving includes new config path; should be automatic via file system walk.

#### `src/world/materials.js`
- No major change: stays base atlas generation. Optionally add comment that modifiers are GPU overlay, not CPU bake (to justify perf choice). Could also add CPU alternative for fallback if WebGL no texture but not needed.

#### `src/render/shaders.js`
Highest complexity.

Add near top uniforms section:

```glsl
// Material Modifiers - Task 9
uniform int   u_modEnabled;
uniform sampler2D u_modTexA; // R=moss G=damaged B=water A=puddle
uniform sampler2D u_modTexB; // R=blood G=dust
uniform vec2  u_modMapSize;
// Per modifier params (pack maybe)
uniform vec3  u_modMossAlbedo; uniform float u_modMossRough; etc...
// Simpler: many uniforms: enabled per modifier, albedo, roughAdd, heightAdd, normalStr, noiseScale, threshold, etc.
```

Define helper noise functions early (before `pbrShade`).

Define function `applyModifiers(inout vec3 albedo, inout vec3 N, inout float rough, inout float metal, inout float height, inout float ao, vec3 worldPos, vec2 worldCell, vec3 Ngeom, vec2 wallU, float wallV, bool isFloor, bool isCeil)`

Logic inside must handle:

- Sample modTex at `worldCell / modMapSize` (cell coordinate = floor(worldPos.xz))
- Early out if `u_modEnabled==0`
- Compute cell intensities.
- For each modifier if intensity > 0.01 branch:
  - Compute `noise = modFBM(worldPos.xz*scale, octaves, seed)`
  - For walls water streak: `noise = mix(noise, modNoise(vec2(worldPos.z*streakScale)), 0.6)`
  - For puddle: `noiseBlob = modFBM(worldPos.xz*0.12, 2)` large
  - For blood: extra splatter pattern: hash per 2x2 cells for center, distance field.
  - Cue: e.g., moss `cue = (1.0 - smoothstep(0.7,1.0,ao)) * (1.0 - smoothstep(0.3,0.7,height))`
- Mask compute.
- Apply channel mixes.

Duplication: there are 4 floor/ceiling rendering paths + 1 wall path in `fsSource` (~600 lines). Need to call `applyModifiers` in each. To avoid duplication, extract helper to inline function and call.

Potential refactor: create function `sampleAndApplyFloorMod(...)` but keep inline to respect GLSL no shared function capturing uniforms easily.

Critical: after modifier, re-normalize N.

Also POM consideration: height altered affects POM? In current code POM offset computed *before* material fetch, using height texture sampled with initial UV atlas. If we depress height for puddle, should POM also reflect? Options:
- Keep POM from base texture only, and just darken albedo to imply depression (simpler, no POM re-iteration)
- Or alter heightVal after POM but still affect shading/parallax self-shadowing? Existing POM only offsets UV, not shadow. So we can just add to `heightVal` for debug views but not re-run POM. Acceptable.
- For better: after modifier, could bias `heightVal` used for debug but not need to re-sample.

Likewise chamfer and grid already perturb N, ao, albedo. Modifier should stack *after* chamfer/grid? Probably after, so moss can appear in chamfer grooves too, but chamfer dark already applied. Order: base atlas → POM offset → sample → chamfer/grid modification → **modifiers** → pbrShade. Let's specify that: modifiers last before shading so they override.

#### `src/render/renderer-gpu.js`

- Extend `uLoc` list with new uniforms: `u_modEnabled, u_modTexA, u_modTexB, u_modMapSize, u_modMossEnabled, u_modMossAlbedo, u_modMossRoughAdd, u_modMossHeightAdd, ...` for each of 6 modifiers ( ~ 6*10 =60 uniforms, okay). Pack as possible to reduce but readable.

- In `init(dungeon, config)`:
  - After atlas generation, create modifier textures from `dungeon.modifiers` if present.
  - Helper: `createModifierTextures(gl, modData, w,h)` returns `{texA, texB}`.
  - If no modData (old dungeon), create dummy 1x1 zero texture.

- Bind textures to units: use 7,8 (check existing tex units: 0 mapTex, 1 wallAlbedo etc. Atlas tex units up to maybe 12? The code has `texUnits` mapping. Need to reserve 14,15 for modTexA,B.)

- In `render()`:
  - Resolve config values via `_resolveConfigValue(cfg, ['material-modifiers.enabled', ...], default)` or directly fetch `cfg['material-modifiers']` or `cfg.modifiers`?
  - Actually `config.js` returns separate caches per logical name; but `GPURenderer` receives aggregated `config` object containing all subconfigs? In existing `_cfgCache`, it seems to merge via `config` passed from `main.js`? Check `main.js` how config loaded: `getAsset` vs `getConfig`. In init, `config` already has subconfigs? Look: `async init(dungeon, config)` gets `config` from `main.js` which likely combines? Need to inspect `main.js` to see aggregation.

- Update modifier textures when dungeon changes (new level). `updateMapTexture` pattern similar.

- Upload modMapSize as vec2.

- Fallback: if config missing fields, defaults safe (enabled 1 but intensities zero).

- Add method `setModifiersEnabled(v)` and maybe `toggleModifiers` similar to chamfer.

- In `_resolveConfigValue`, add modifier param paths.

#### `src/render/map-upload.js`
- Maybe nothing; modifier tex creation separate.

#### `src/main.js`
- After dungeon generation, ensure modifiers data passed to renderer.
- Handle config loading: load `material-modifiers` asset via `getAsset`? Need to check how chamfer config loaded: it's fetched via `CONFIG_PATHS['chamfer']` → `getAsset('config','...')`? Actually `getAsset` is used for materials, but config for chamfer is via `config.chamfer`? In `renderer-gpu.js` `_cfgCache` includes `chamfer` object because `main.js` fetched? Let's view `main.js`.

#### `src/assets/materials/*.json`
- No change.

#### `src/editor.js` and `src/config/live-config.js`
- Tier handling: check `live-config.js` for how it classifies tiers. In Task 7, chamfer was Tier1 instant (shader uniform). Need to ensure `material-modifiers` fields also Tier1.
- In `live-config.js`, there is likely a mapping of config keys to tier. Look for `TIER1` list includes chamfer.* → add modifiers.* too.

- Editor discovery: recursive JSON walk for `assets/config` -> should auto show `rendering/material-modifiers.json` tree. No code change if generic.

#### `src/server/*` REST API for asset list
- Check if directory listing includes nested `rendering/material-modifiers.json`. Server uses glob `*.json` recursive? Probably.

#### `src/tests/` or `tests/` Playwright
- Extend e2e: check game loads, no WebGL errors, modifier map textures bound, config file exists.

---

## 4. Performance Considerations

- Modifier map: 40x40 RGBA8 = 6.4KB per texture ×2 = ~13KB trivial.
- Shader cost: 6*FBM*3 octaves = 18 value-noise evaluations per fragment worst. Could be heavy at 320x240 upscaled? But still okay WebGL2.
- Mitigations:
  - Branch early: if cell intensity ==0 skip.
  - Share noise computation: compute 2 FBMs with different scales reused across modifiers via scaling.
  - Reduce octaves per modifier: puddle 2, moss 3, others 2.
  - Precompute per cell noise into modifier intensity (CPU bakes noise into texture) → shader just uses mask = intensity * cue (no FBM). However spec says "compiling a noise function" suggests shader-side noise must be visible in code.
  - Hybrid: CPU bakes organic intensity (including noise) into texture, shader still additionally computes fine noise for detail (small scale). That's still "noise function" plus generator noise modification.
- Use `gl.NEAREST` for modifier tex to avoid lerp blurring pool edges.

---

## 5. Live-Edit & Config Plumbing Details

- `CONFIG_PATHS['material-modifiers'] = ['config/rendering/material-modifiers', 'config/material-modifiers', 'config/main']`
- In `main.js`, ensure `Promise.all` fetching includes `material-modifiers`. Look at similar for chamfer: chamfer config likely fetched via `getAsset` generic? Actually `config.js` has `getChamferConfig()` but `GPURenderer` uses `_cfgCache` which is result of combined assets? Need to check `main.js` asset loading loop.

- In `editor.js`, visual editing: JSON textarea + structured fields. Since new JSON is hierarchical, it should auto render nested objects as collapsible.

- Tier 1: In `live-config.js`, there is list:
```js
const TIER_1_PREFIXES = ['rendering.', 'chamfer.', 'corners.', 'palette.', ...]
```
Add `'material-modifiers.'`.

- On live edit, `liveManager.subscribe('*', ...)` in game updates config cache and re-uploads uniforms next frame. The `updateConfig(partial)` in `GPURenderer` may need to handle partial containing `material-modifiers`.

- Hot reload: editing moss albedo `[46,107,38]` in editor with Live ON should update wall within ~200ms.

---

## 6. Testing & Screenshots Plan

### Unit (existing `npm run test:unit` if exists or Playwright config.test)
- Check `material-modifiers.json` exists, version 1, enabled bool, modifiers object has 6 keys, each has enabled bool, albedo array length 3 values 0-255, roughAdd in -0.6..0.6, heightAdd -0.3..0.3, noiseScale 0.05..2.0, threshold 0..1
- Check `shaders.js` contains `u_modEnabled`, `u_modTexA`, `modFBM` or `modNoise`, `moss`, `puddle`, `blood`, etc. and `ao` cue usage.
- Check `renderer-gpu.js` contains uniform locations + texture creation for modifiers.
- Check `generator.js` imports/contains `generateModifiers` or `modifiers` roleWeights.

### E2E Playwright (real WebGL2)
- Test game loads: canvas non-empty, no console errors
- Test modifier map textures bound: spy `gl.getExtension`? Simpler: check HUD shows modifiers toggle or config exists via fetch.
- Screenshot series (7 images required by task.toml):
  1. `screen-moss-wall.png` – seed where entrance has moss, look at wall near floor with greenish patches
  2. `screen-blood-guardian.png` – teleport to guardian room coordinates, show blood splatter floor/wall dark red
  3. `screen-puddle-floor.png` – looking down floor with mirror-like dark spots, edge foam
  4. `screen-dusty-secret.png` – ceiling dusty beige veil desaturated
  5. `screen-water-streak.png` – wall low with vertical dark glossy streaks
  6. `screen-damaged-hub.png` – hub walls with blackened cracks, chips
  7. `screen-editor-modifiers.png` – editor tree showing rendering/material-modifiers.json

How to capture? Need deterministic seeds. Generator seed null = random; set `generator.json` seed to fixed value (e.g., 12345) for screenshot reproducibility. Then find rooms by role.

Possible Playwright script pseudocode:

```js
await page.goto('/game.html?seed=12345');
await page.waitForSelector('canvas');
// teleport via game API? The game may expose window.dungeon.rooms etc.
// For MVP, walk forward or use free camera if available.
```

Simpler: use fixed seed, and assume moss appears near entrance (role entrance). Capture looking at wall near floor in first room.

Guardian room: `rooms.find(r=>r.role==='guardian')`. Need access via `window` – expose dungeon for tests.

- Toggle test: press 9 (if mapped) toggles modifiers off -> screen should get cleaner (optional).

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Shader compile fails due to too many uniforms / loop unrolling | Keep uniforms <100, use defines, fallback defaults, test compile in headless. |
| Performance drop >10ms/frame from 6 FBM on mobile | Early outs, reduce octaves to 2 for water/dust/damaged/puddle, share noise; bench on laptop integrated. |
| Modifier map texture sampling at floorWorld edges artifact | Use Nearest, clamp cell coord via floor, handle boundary bi-linear no. |
| Generator over-stacks modifiers washing out PBR | Implement top2 normalization: sort, keep top2, zero others. |
| Editor doesn't discover new JSON | Check server's `getAssetList` recursive – may need to restart server, add explicit listing. |
| Config missing causing shader to render black | Fallback defaults: if uniform 0, treat as disabled. Validate with `max()` etc. |
| Determinism broken across reloads | Use `hash2i(x,y,seed+modIndex)` not Math.random per cell. |
| Conflict with chamfer/grid altering same channels | Order: chamfer → grid → modifiers, multiplicative for roughness darken etc. Test toggling individually. |

---

## 8. Implementation Steps (Incremental, each testable)

**Phase 0 – Config & Plumbing (1-2h)**
- [ ] Create `assets/config/rendering/material-modifiers.json` with version, defaults, generator roleWeights (as above).
- [ ] Add mapping in `config.js` → `CONFIG_PATHS['material-modifiers']`.
- [ ] Verify editor shows it, PUT persists, Live preview works (check network).
- [ ] Add Tier1 prefix for modifiers in `live-config.js`.

**Phase 1 – Generator Spreading (2-3h)**
- [ ] Create `src/world/modifiers.js` with `generateModifiers({w,h,rooms,grid,dec, ... seed})` implementing per-room base + per-cell noise + distanceToWall + puddle floorHeight logic + top2 normalization.
- [ ] Integrate into `generator.js` Stage after grid carving (Stage 9/10). Attach result to `dungeon.modifiers`.
- [ ] Add debug overlay: console.log per role averages per modifier for verification.
- [ ] Test determinism: same seed → same intensities file diff.

**Phase 2 – Renderer Texture Plumbing (1-2h)**
- [ ] In `renderer-gpu.js`, create `createModifierTextures(gl, modData)` → 2 RGBA Uint8 textures (convert float 0..1 → 0..255).
- [ ] Allocate `uLoc` uniforms for modEnabled, modTexA/B, modMapSize.
- [ ] Upload textures in `init`, bind to units.
- [ ] Add `_resolveConfigValue` calls for global enabled + per modifier enabled (initially just global).
- [ ] In render loop, bind textures, upload sizes.

**Phase 3 – Shader Noise & Single Modifier Prototype (moss) (3-4h)**
- [ ] Add uniforms for moss params in `shaders.js`.
- [ ] Implement `modHash`, `modNoise`, `modFBM` helper functions.
- [ ] Implement helper `applyMoss(inout ...)` using mask = intensity * fbm * cue (AO).
- [ ] Call it in one place (e.g., floor fallback path) to test.
- [ ] Iterate visually: tune albedo green, rough +, height +, normal lump until moss reads.

**Phase 4 – All Six Modifiers in Shader (4-5h)**
- [ ] Extend uniforms for remaining 5 modifiers (damaged, water, puddle, blood, dust).
- [ ] Write per-modifier logic as per section 2.1 inside single `applyModifiers()` function or six inline blocks with early outs.
- [ ] Implement branching: sample modTex once, then if R>0.01 evaluate moss, etc.
- [ ] Handle floor-only puddle guard: `if(!isFloor) puddleMask=0`.
- [ ] Wall vertical streak for water: special `streak = modNoise(vec2(worldPos.z*8))`.
- [ ] Blood splatter radial: `for each 2x2 cell center compute dist`.
- [ ] Apply in all 5 shader branches (floor hit, ceil hit, floor no-hit, ceil no-hit, wall).
- [ ] Order after chamfer/grid.

**Phase 5 – Config-Driven Tuning & Live-Edit (1-2h)**
- [ ] Wire all per-modifier tunable values from JSON as uniforms (albedo, roughAdd, heightAdd, normalStr, noiseScale, thresh).
- [ ] Fallback defaults for safety.
- [ ] Verify live-edit tier: editing in editor with Live ON updates game view quickly.
- [ ] Polish ranges: ensure moss not neon, puddle mirror not too perfect, blood not too bright.

**Phase 6 – Integration, Optimization, Debug Toggle (1-2h)**
- [ ] Add toggle Key 9 for modifiers (like Key 7 chamfer). Reuse existing toggle system in `main.js` keyboard handler.
- [ ] Ensure toggle disables all modifiers returning clean look.
- [ ] Optimize shader: reuse two FBM calls for multiple modifiers via scaling, reduce octaves.
- [ ] Check no WebGL errors, compile on Firefox/Chrome.

**Phase 7 – Screenshots & Tests (2h)**
- [ ] Fix seed for reproducibility (12345) in generator.json temporarily, capture 7 screenshots via Playwright script.
- [ ] Add/update unit test file for config existence and shader content.
- [ ] Run `npm test` E2E, ensure still passing.
- [ ] Update `task.toml` commit-hash after completion.

**Phase 8 – Documentation**
- [ ] Update `tasks/materials-modifiers/README.md` with description, why, implementation, tests, screenshots.
- [ ] Update top-level `README.md` task table.

---

## 9. Alternative Architectures Considered (and rejected)

- **CPU Atlas Bake per material ID**: Would bake moss etc into 64x64 atlas. Pro: zero shader cost. Con: cannot vary per world cell story, tiling repeats ugly, loses organic blob shapes, cannot have puddle blobs spanning multiple cells. Rejected — but could be fallback if GPU texture path fails, but we want world variation.

- **Decal Meshes**: Separate planes for puddles/blood. Pro: true reflections maybe. Con: needs extra geometry, DDA, lighting integration, complex. Out of scope.

- **Single RGBA8 packed as bitmask**: Store bitmask not intensity → less storytelling gradation. We want continuous 0..1 intensity.

- **Per-vertex modifier**: N/A — raycaster has no vertices per cell.

Chosen GPU overlay is best fit for this raycaster architecture.

---

## 10. Open Questions

- Should ceiling have moss? Real dungeons moss grows on damp walls low, not ceiling much -> ceiling moss reduced or zero. Our ceilingDustBoost handles.
- Should puddle reflect sprites/lights via low rough GGX? Yes, mirror via rough_target 0.08 already gives reflection-ish (specular highlight). Could attempt screen-space reflection but overkill.
- Blood trail direction: use vector from guardian to entrance? Could implement optional directional streak: bias noise angle toward exit. NTH but nice storytelling: blood trails pointing exit direction via dot product.
- Interaction with discovery/fog: modifiers should be visible even in fog/dither? Fog multiplies after pbrShade, so okay.

---

## 11. Success Criteria Mapping

- [ ] Base materials when modifiers disabled → clean: toggle Key 9 or config enabled false.
- [ ] 6 modifiers distinct altering all channels: verify per modifier code touches albedo, normal, rough, height.
- [ ] Noise function compiled + material cues: shader contains `modFBM`, `modNoise`, and uses `ao`, `height`, `rough` to compute `cue`/`mask`.
- [ ] Generator intelligently spread: roleWeights + rng + noise + distanceToWall → check `modifiers.js` implementation.
- [ ] Config JSON live-editable Tier1: file exists, editor shows, live-config includes prefix.
- [ ] Renderer uploads mod map textures: check `renderer-gpu.js` code.
- [ ] Screenshots 7: real WebGL2 captures.
- [ ] No regressions: PBR, POM, chamfer, corners, fog, sprites still work (E2E passes).
- [ ] Performance: maintain 60fps on 1080p (estimate).

---

## 12. Estimated Effort

- Total ~15-20h focused work.
- Most time in shader tuning visually (puddle mirror, moss green readability).
- Generator logic medium.
- Plumbing quick if copy chamfer pattern.

---

## 13. Next Action

Start Phase 0 now on branch `task9-materials-modifiers`, commit incrementally, push, and begin Phase 1 after config verified live.

