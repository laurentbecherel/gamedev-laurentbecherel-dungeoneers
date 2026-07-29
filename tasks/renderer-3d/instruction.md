# First-Person 3D Renderer — Dungeoneers Task 3 (Complete Edition)

> **Scope note:** This merges original Tasks 3 (renderer core), 5 (PBR materials) and 6 (lighting) plus geometry detailing (chamfer bevels, rounded corners) and hardening. It is intentionally an epic — the point where the game becomes first-person. If this is too large for your track, split into 3a raycaster, 3b PBR, 3c detailing.

Build the first-person 3D subsystem. Task 2 had top-down 2D. Task 3 must show first-person by default, WASD moves, QE turns, M toggles map, R regenerates. Walls brick with depth, floor stone slabs, PBR response to warm torch with shadows and fog, no grid feeling.

## 1. Why these choices

**Raycaster not rasterizer:** Doom-like grid DDA, but on GPU via WebGL2 fragment shader with modern PBR layered on top.

**Procedural atlases + single lock:** No artist textures. CPU generates albedo/height/normal/RMA on JS. Task 3 locks to 1 wall + 1 floor + 1 ceiling material (ID 1) to avoid multi-atlas wrapping bugs that produce streaks. Engine must be ready for N later but clamp to 1 now.

**Dedicated nested configs:** Flat `main.json` cannot expose tuning. All visual domains need dedicated JSON under subfolders so editor can tune without shader edits. Server must recursively walk configs and allow slash in API.

## 2. Project structure

Extend `src/` with:
- `assets/config/rendering/` 7 files: rendering, palette, pom, pbr, ao, raymarch, materials-proc
- `assets/config/lighting/` 3 files: lighting, shadows, fog
- `assets/config/geometry/` 2 files: chamfer, corners
- `assets/config/gameplay/` 2 files: generator, player
- `assets/config/ui/` 2 files: map, debug
- `assets/config/main.json` minimal v3 with `_readme` delegation note
- `render/renderer-gpu.js, shaders.js, gl-utils.js, map-upload.js, map-ui.js, palette.js`
- `world/materials.js`, `core/game.js` (Game orchestrator), `entities/player.js`, `systems/input.js`
- Modify `main.js, game.html, editor.html, editor.js, server/server.js, config/config.js`

Server: recursive `walkJsonFiles`, `safeCategory` allows `/`, API `GET/PUT /api/assets/<nested>/<name>`, returns 204 for favicon.

Editor: hierarchical tree of nested files, depth padding, hides `_readme`.

## 3. Procedural PBR atlases

`world/materials.js` exports `generateMaterialAtlases(wallMats,floorMats,ceilMats,procCfg)` and `atlasUvX(id,texSize,atlasW)`.

- Input: first material from each JSON. Atlas width = tile size * count. Count forced to 1 for Task3. 12 textures (albedo/normal/height/RMA per type) NEAREST filter.
- Brick pattern: running bond, offset per row, mortar groove darker, dome bulge per tile + hash jitter + cracks on edges.
- Floor/ceiling: pillowed dome per block (e.g. 8x8) beveled edges, deeper grout.
- Normal from height gradient, strength configurable.
- RMA packing: R=rough, G=metal (0 for Task3), B=emissive (black), A=AO baked softened (not black grid). Roughness must vary per-brick + micro jitter + dome polish vs grout, not flat constant. Fix common bug where config value ignored due to `||` fallback.
- Deterministic: same seed same bytes.

Intent measurable: floor normals show 4 sides in world-normal debug, roughness debug shows textured variation not flat, AO debug shows softened ~0.7+ min not black mortar, albedo shows brick/slab pattern.

## 4. GPURenderer

- `isWebGL2Supported()`, `class GPURenderer{ constructor(canvas) throws if no WebGL2, async init(map,cfg), render(map,player,time), renderMapOnly(), uploadMap(), set/toggle*() }`
- Context `alpha:false antialias:false`.
- Init compiles 3 programs (raycast, quantize, UI), fullscreen quad VAOs, generates atlases, upload map texture, palette 256x1 LUT 32^3, scene FBO for quant pass, map UI texture, caches uniforms.
- Must resolve toggles from dedicated configs with fallback chain dedicated -> legacy flat -> defaults. Do not overwrite runtime toggle each frame.
- State: authentic, palette style, gridDebug, lighting, pbr, pom, fog, pbrDebug, chamfer, corner.
- Methods: `setGridDebug, setLightingEnabled, setPBREnabled, setPOMEnabled, setFogEnabled, setChamferEnabled, setCornerEnabled, setPBRDebugMode, toggle*() returns new value, cyclePBRDebug 0..8, uploadMap, renderMapUI, setAuthentic/bandLevels`.
- Render: bind scene FBO, set uniforms from resolved config + player light source, trace rays, quant pass if authentic.

## 5. Shaders

Full-screen quad vs. Fs ~800 line DDA raycaster with PBR + features.

Required: DDA walk up to order 64 steps, check `isWallCell` via mapTex. Helpers needed but naming free: wall check, nearest wall distance+normal (4 neighbors), outer/inner corner classification (3 neighbor checks), ray-circle intersection (quadratic), atlas UV, TBN, POM offset, PBR BRDF, shadow trace, debug modes, fog, AO per-light, palette.

Per fragment:
1. Ray dir `cameraX = 2*frag.x/res.x-1`, plane from fov.
2. DDA, perpDist via side, hitPos.
3. If enabled: true intruding rounded corners replacing perpDist via ray-circle circle center offset toward cell center by radius, only when close to corner, sector check rejecting wrong quadrant. Must change silhouette (intrudes into air), not just shading. Modes bevel flat vs round outer vs all.
4. Wall UV: fract with axis flip, optional fixed-point trunc if authentic. Build TBN per side, worldPos, viewDir viewTS.
5. POM: sample height atlas via raymarch into height map. Must satisfy: mid-grey = zero displacement (grout intrudes, pave extrudes), not global floating. Must not streak at grazing: return zero / fade to flat when view near-parallel, cap max offset to prevent crossing tile boundary.
6. Sample albedo/normal/rma. If corner hit, blend N with cornerNormal, slight albedo boost, rougher->polished, AO slight darken.
7. Chamfer fake geometry if no corner and enabled: floor/ceiling bevel where close to wall bottom/top -> bend N toward up/down (flat 45° or spherical), AO darken in crevice, trim highlight band middle catching light. Vertical bevel every wall-wall edge (must not skip interior concave) diagonal N, AO darken + highlight.
8. Grid debug bypass, PBR debug bypass.
9. PBR shade vs flat: shadows via DDA from offset origin along stable dominant-axis normal + light dir (must not use perturbed normal-map normal else mortar re-hits own wall as acne grid). AO per-light influence: `mix(1,ao,affect)` with low influence for sun/point, full for ambient, so mortar not black.

Lighting: ambient level/color, sun dir/color/intensity, player torch warm point light at eye height with intensity/radius/color/height from config.

Fog: exponential squared, final mixed with fog color, enabled gate, presets off/light/default/heavy, toggle key.

Palette: build Doom-like palette + LUT nearest, quant pass samples sceneTex, authentic banding `floor(color*bandLevels)/bandLevels`.

## 6. Player + Input

`player.js`: spawn at start+0.5 angle -PI/2, `setPosition`, `setConfig(cfg)`, `update(dt,input,map)` WASD forward/back/strafe QE turn slide collision tries full then X then Y, checks wall cells distance < radius, `getLightSource()` warm point at eye height.

`input.js`: keyboard tracker returning forward/strafe/turn.

## 7. Dedicated configs

All must be editor-tracked version 1, each logically owned by a domain. Exact numeric defaults are **not** part of spec — see Appendix A for reference gold. What spec requires is schema and purpose:

- `rendering/rendering.json`: fov, textureFilter, eye height/horizon, surface mul floor/ceil/wallDarken, geometry floor/ceiling baseline, canvas base size, toggles defaults
- `rendering/palette.json`: authentic, style doom/smooth256 etc, bandLevels range, lut/palette sizes, banding enabled
- `rendering/pom.json`: enabled, strength per surface, steps, clamping (maxOffset, minViewZ, minEff, fade range), reference plane note (centered), presets
- `rendering/pbr.json`: enabled, roughness/metal clamp, emissive mul, GGX epsilon, F0, point attenuation, debug modes list for key6
- `rendering/ao.json`: per-light affect factors, material strengths grout/face/dome/min
- `rendering/raymarch.json`: maxSteps, epsilon, encoding offsets, refinement
- `rendering/materials-proc.json`: texSize, walls type brick (brick w/h, heightScale, normalStrength, roughness+variation, grout/dome/AO, jitter, micro), floors/ceils slab blockSize, packing note forcedCount 1
- `lighting/lighting.json`: ambient level/color, sun intensity/dir/color, player torch props, torchColors palette
- `lighting/shadows.json`: enabled, bias normalOffset+dirOffset, dominant-axis threshold, sun/point shadowFactor/maxDist/epsilon, DDA steps
- `lighting/fog.json`: enabled, base/squared/color formula, presets off/light/default/heavy, toggle key
- `geometry/chamfer.json`: enabled, size floor/ceil/wall/cornerRadius (world meters vs UV fraction), shading darken/roundCorners/blend/rough, trim strengths + ranges shaping thresholds, key
- `geometry/corners.json`: enabled, radius clamp min-max, mode (bevel flat/outer/all) inner bool, search bands near/far/sector, shading normalMix/albedoBoost/roughMul/aoMul, key
- `gameplay/generator.json`: mapW/H, roomTarget, roomAttempts, loops, items, boundary, linearity, sideDepth, room size ranges etc + robustness: wider search, size variants, tolerant skip
- `gameplay/player.json`: moveSpeed, turnSpeed, radius, height, light
- `ui/map.json`: font family fallback googleName (Pixelify Sans), display position/size/opacity, parchment bg/scan, colors wallDark/gold/player/roles/materials, layout legend/padding/grid/stair/playerDot/legend swatches, must load via `document.fonts.load` before first draw
- `ui/debug.json`: keys 1..8,R,M with human-readable descriptions matching HUD, hud timeout, regen attempts, overlay scale

## 8. Game integration

`main.js`: 14-line bootstrap Game.

`core/game.js`: merges 16 configs via `getAllRenderConfigs` with legacy fallback chain, loads map font async via Google Fonts link + `document.fonts.load` + `fonts.ready` + small delay, init retry loop random seeds on failure, retry regen, resize canvas contain scaling, RAF loop render vs renderMapOnly, key handling 1-8 R M with HUD timeout.

Generator robustness: tolerant skip, roomAttempts + search radius.

## 9. Debug visualization — fairness critical

Agent can't tune PBR without isolation. Must enumerate every toggle, key, HUD, purpose. Reference screenshots are provided by the task author in `README.md` and `screenshots/` (gold branch a5fa90f) to show expected visual differences — solver does NOT need to produce screenshots; e2e verification uses canvas pixel changes and HUD text.

- **1 Grid debug:** floor green + grid lines, wall red, ceil blue, no PBR. Validates alignment 0.0/1.0 pixel-perfect. HUD `Grid debug: ON (floor green / wall red / ceil blue) / OFF`
- **2 Lighting:** ON full ambient+sun+point+shadows+AO, OFF flat albedo early return. Isolates lighting bugs (speckles gone when OFF). HUD `Lighting: ON / OFF (flat albedo)`
- **3 PBR:** ON GGX, OFF diffuse only Lambert. HUD `PBR: ON / OFF`
- **4 POM:** ON depth marching centered ref + grazing safe, OFF flat. HUD `POM: ON / OFF`
- **5 Fog:** ON exp squared final mixed, OFF bypass. Must have density presets. HUD `Fog: ON / OFF`
- **6 Cycle PBR debug 0..8:** Albedo, Normal raw, World Normal (4-sided visible), Height (grout low brick high), Rough (must vary not flat), Metal (0 for Task3), AO (softened not black grid), Emissive (black). HUD `PBR Debug: OFF / Albedo / ...`
- **7 Chamfer:** ON fake baseboard/cove + vertical edges via normal bending + AO darken + trim highlight catching light, OFF sharp 90°. HUD `Chamfer: ON (floor/ceil baseboard + vertical) / OFF`
- **8 Corner:** ON true intruding rounded corners silhouettes curving, OFF sharp 90°. HUD `Corner Geometry: ON (rounded intruding r=...) / OFF`
- **R Regen:** reload configs, random seed, uploadMap, no crash on unlucky seed
- **M Map:** fullscreen parchment overlay WebGL+Canvas2D correct colors parchment (#e8dcc4 ref), labels Pixelify Sans, legend swatches, stair arrows, opacity ~0.9. Reference screenshots in `screenshots/` illustrate ON vs OFF for each toggle — author-provided, not solver-required.

## 10. Map UI restoration

`render/map-ui.js` Canvas2D rounded rooms, correct calcLayout offset (not w-20), fix swatch color bug, restore fillText legend labels + stair arrows, fully configurable from map.json colors/palette/layout/font. Font Pixelify Sans async loaded.

## 11. Tests

- Unit: atlas size 64 per material, normal unit length, determinism same seed same bytes, brick not uniform, roughness variation not flat, AO softened range >0.6 not black, player spawn+collision slide, renderer WebGL2 detection, shader contains required uniform groups (without exact names - check presence of pom/shadow/chamfer/corner toggles generically), server recursive walk + slash + favicon 204, generator single ID lock uniq [0,1]
- E2E: page loads no console errors, canvas WebGL2 obtainable not 2D regression, non-black pixels after init, WASD moves canvas changes, QE turns changes, R regenerates changes, M toggles map, toggles 1..8 no errors and HUD shown, PBR debug cycles, no WebGL errors, editor hierarchical tree shows nested configs editable persisting via nested API
- Full `npm run test:unit` + `test:e2e` must pass

## 12. Out of Scope

- Full 16/10/8 material library deferred (engine ready but locked to 1)
- Multiple torches deferred (only player + sun)
- Mouse look, view bob, grid snap deferred
- Character sprites deferred
- Live hot-reload sync deferred
- Audio, mobile, R8

Palette quantization, PBR debug, chamfer, corners are **in scope** because they prove visual quality without artifacts; otherwise grid feeling remains.

## 13. Acceptance — measurable without exact numbers

- Nested configs exist under subfolders, server recursive walk works, API accepts slash, editor shows hierarchical tree
- `materials.js` generates atlases 64 per material, 12 textures, RMA packing R rough varied G metal B emissive A AO softened, deterministic
- GPURenderer APIs as listed, init compiles 3 programs, creates quad, atlases, map/palette/LUT/scene FBO/mapUITex, resolves toggles configEnabled && runtime, toggles return new value
- Shader DDA up to order 64, wall threshold 0.0/1.0, POM centered mid-grey = zero, grazing does not streak, shadow bias stable per face dominant axis, fog exp squared, AO per-light low sun/point full ambient, chamfer visible as baseboard+vertical highlight, corners intrude silhouette via ray-circle
- Player WASD/QE slide radius configurable, light warm point at eye height
- Game merges 16 configs, font loads before first map, retry init/regen random seeds robust, resize contain, RAF loop, HUD timeout
- Map parchment correct colors alignment font labels arrows, opaque (see reference `game-minimap-overlay.png`)
- No console errors, WebGL2 unavailable handled, shader compile logged
- Toggles as listed change canvas pixels and show HUD, no console errors
- No emoji, ES modules only

## 14. Appendix A — Reference defaults (non-normative, from gold a5fa90f)

Any artifact-free tuning acceptable. These numbers produced `game-3d.png` reference:

- Pom: wall 0.06 floor 0.07 ceil 0.035 steps 8 clamping maxOffset 0.10 minViewZ 0.08 minEff 0.18 fade 0.08-0.22 ref plane 0.5
- Fog: base 0.06 squared 0.005 color dark desat, gives ~76% at 4m vs old 0.18/0.025 46%
- Shadows: bias normal 0.10 dir 0.06 sunFactor 0.25 point 0.15 max 20 eps 0.1 threshold 0.02
- PBR: F0 0.04 attenQuad 0.25 GGXEps 0.0001
- Chamfer: size floor ~0.3m ceil 0.24 wall UV 0.28 radius 0.22 darken 0.55 blend 0.92/0.88 roughness 0.35 trim 0.22/0.18/0.16
- Corners: radius 0.15 clamp 0.02-0.45 mode 2 outer+inner search near ~0.08 farFactor 2 extra 0.15 sector 0.02 shading normalMix 0.92 albedo 0.05 rough 0.82 ao 0.96
- Materials: AO grout 0.78 face 0.92 domeBoost 0.08 min 0.70, rough 0.59-0.91 range target

Use as tuning guide, not mandatory.

## 15. Appendix B — Tech intent (why hardening needed)

- Centered POM: raw height as absolute depth makes mid-grey float whole floor. Centered `uv - 0.5*fullOffset` makes 0.5 zero.
- Grazing clamp: near-parallel view explodes offset, 8-step jumps whole brick hitting CLAMP_TO_EDGE smears as black vertical line down corridor. Bound offset, fade to flat.
- Shadow snap: perturbed normal-mapped normal varies per mortar groove causing stable pos to re-hit own cell as speckles. Snap to dominant geometric axis makes bias stable per face.
- Chamfer vs Corner: chamfer fake (normal+material) cheap, breaks 90° via baseboard/cove, corner true (ray-circle) changes silhouette intruding into air.
- AO per-light: if AO kills sun, mortar never sees sun = black grid. Low sun/point, full ambient.
- Font loading: Google Fonts async, if canvas rendered before ready fallback renders forever. Await `document.fonts.load` + ready.
- Retry: greedy placement occasionally fails, retry with random seeds resilient.
