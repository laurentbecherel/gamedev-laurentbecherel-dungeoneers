# First-Person 3D Renderer — Dungeoneers Task 3 (Complete Edition)

> **Task renumbering note:** This task merges original Task 3 (renderer-gpu-core), Task 5 (materials-pbr-system), and Task 6 (lighting-particles) into one coherent deliverable. The implementation you are auditing also introduces advanced geometry detailing (chamfer bevels, intruding rounded corners) and production hardening that are now part of the spec — because without them the dungeon feels like a mathematical grid, not a place.

Build the first-person 3D rendering subsystem for Dungeoneers: transform the Task 2 top-down 2D minimap into an immersive WebGL2 raycast renderer with procedural PBR materials, dynamic lighting with shadow raymarching, exponential fog, parallax occlusion mapping with centered reference and grazing safety, configurable ambient occlusion influence, fake-geometry chamfer baseboards and vertical bevels, true-geometry intruding rounded corners, palette quantization with authentic banding, full debug visualization suite, parchment map overlay restoration, and robust dungeon generation.

**Why this task matters:** Tasks 1-2 proved the data pipeline. Task 3 is where Dungeoneers becomes a first-person crawler. The game page must show first-person 3D by default, WASD moves, QE turns, M toggles fullscreen parchment map, R regenerates. Walls must have brick texture with POM depth, floor stone slabs, PBR response to warm player light with shadows and fog. But flat 90-degree corners and perfect alignment still feels artificial — hence chamfer and rounded corners are required to break grid feeling.

**Why raycaster not rasterizer:** Creative choice. Dungeoneers recreates Doom 1993 architecture — grid map, DDA walk, per-pixel raycast — on GPU via WebGL2 fragment shader with modern PBR layered on top. Retro-futuristic: what Doom would look like with a GPU but keeping raycast.

**Why procedural PBR atlases + single material lock:** Agent-built games cannot rely on artist textures. Atlases generated on CPU via JavaScript keep pipeline code-driven. Task 3 simplifies to 1 wall + 1 floor + 1 ceiling material only (ID 1 dungeon_brick, stone_slab, stone_ceiling) to avoid multi-material atlas wrapping bugs (CLAMP_TO_EDGE streaks). Engine must clamp to 1 with `slice(0,1)` and `Math.min(1,len)` but be ready for N materials later.

**Why dedicated nested configs:** Single flat main.json became unmaintainable. All magic numbers must be exposed as editor-tracked JSON under subfolders, so artists/designers tune without touching shaders. Server must recursively walk `src/assets/config/`, allow slash in category for API `GET /api/assets/<nested>/<name>`, config.js must map logical names via `CONFIG_PATHS` (nested first, flat fallback), Game must batch-load via `getAllRenderConfigs` and merge with backward-compatible fallback chain (dedicated → legacy main.json → hardcoded defaults). Editor must render hierarchical tree with padding by depth.

---

## 1. Project Structure

**Extend src/ with:**
- `assets/config/` subfolders:
  - `rendering/rendering.json, palette.json, pom.json, pbr.json, ao.json, raymarch.json, materials-proc.json`
  - `lighting/lighting.json, shadows.json, fog.json`
  - `geometry/chamfer.json, corners.json`
  - `gameplay/generator.json, player.json`
  - `ui/map.json, debug.json`
  - `main.json` minimal fallback v3 with `_readme` explaining delegation
- `render/renderer-gpu.js, shaders.js, gl-utils.js, map-upload.js, map-ui.js, palette.js` (+ existing `minimap.js` legacy)
- `world/materials.js`
- `core/game.js` (Game class orchestrator)
- `entities/player.js, entities/index.js`
- `systems/input.js`
- Modify `main.js, game.html, editor.html, editor.js, server/server.js, config/config.js`
- Tests: `tests/unit/materials.test.js, player.test.js, renderer.test.js`, update `tests/e2e/game.spec.js`

**Config server contract:**
- `walkJsonFiles` recursively walks config root
- `safeCategory` allows `[a-z0-9/_-]` slash included
- API `/api/assets/<category>/<name>` reads/writes nested files
- Editor tree lists `rendering/ao` etc with depth padding, hides `_readme` keys

---

## 2. Procedural PBR Material Atlas Generation

**Intent:** Brick walls need dome bulge and mortar grooves visible in height leading to POM extrusion, not flat color. Floor/ceiling need pillowed dome per 8x8 block to avoid 2-sided flat shading — must show 4-sided bevel normals. Roughness must vary, not flat constant.

**Requirements:**
- `world/materials.js` exports `generateMaterialAtlases(wallMats, floorMats, ceilMats, procConfig)` and `atlasUvX(materialId, texSize, atlasWidth)`
- Input: first material from each JSON (wall ID 1, floor ID 1, ceil ID 1). Force `Math.min(1, length)` count, atlas width = 64, height 64, total 12 textures (albedo/normal/height/roughMetalAO per type) WebGL NEAREST filter.
- Generate 4 maps + packed RMA per tile:
  - **Albedo** RGB procedural pattern: brick running bond with offset per row, mortar groove darken, dome bulge `0.28*strength + hash variation`, crack amount on edges, color jitter. Slab with beveled edges `blockSize` 8, grout width 1, dome `0.22*strength`.
  - **Height** float 0..1: grout low 0.08-0.28, brick high 0.6-0.8, slab grout 0.28, dome centered.
  - **Normal** from height gradient via Sobel-like `heightToNormal` with `normalStrength` factor, fix indexing bug: ensure per-pixel index *4 not *3 (was corrupting normals).
  - **RoughMetalAO** packing: R=rough 0..1, G=metal 0, B=emissiveStrength (black for Task 3), A=AO. Roughness must be textured: `baseRough + per-brick hash jitter * roughnessVariation + microRough + -dome*0.18 (centers polished) + groutRoughAdd + edge`. Wall rough range target 151-234 (0.59-0.91) not flat 217. Fix `|| roughVal` bug that ignored JSON config — use explicit check.
  - **AO** baked: `aoGrout 0.78 (was 0.42), aoFace 0.92 (was 0.72), aoDomeBoost 0.08 (was 0.30), aoMin 0.70, aoBoost 0.6 (was 1.1)` plus per-brick + micro jitter 0.04. Wall AO target 178-200 (0.698-0.784) softened, not black grid.
- Atlas packing must honor `materials-proc.json`: `walls {type brick, brick.w/h 8, heightScale, normalStrength, roughness 0.72, roughnessVariation 0.1, groutRoughAdd 0.15, aoGrout, aoFace, aoDomeBoost, aoMin, groutWidth, domeStrength, crackAmount, colorJitter, heightJitter, micro {aoJitter, perBrickAO, rough, rough2, edgeRough, domeRoughReduce}}`, `floors/ceils` slab similar with blockSize, domeHeight.
- Determinism: same seed produces same bytes.
- Config `texSize` 64 default.

**Fairness note:** No hidden material count — Task 3 explicitly 1 each. If implementation samples beyond 64 width with atlas, tests will catch CLAMP_TO_EDGE streaks. Must enforce single ID.

---

## 3. WebGL2 Renderer — GPURenderer Class

**Intent:** Centralize all GPU state, expose debug toggles for rapid iteration, keep shader magic numbers configurable without recompiling unless needed.

**API required:**
- `export function isWebGL2Supported()`
- `class GPURenderer { constructor(canvasEl) throws if no WebGL2, async init(dungeonMap, config), render(dungeonMap, player, timeSeconds), renderMapOnly(dungeon, player), resize(), rebuildMaterials(), uploadMap(), rebuildPalette(), isReady(), set/toggle methods }`
- Constructor gets WebGL2 context with `alpha:false, antialias:false, depth:false, stencil:false`.
- `init`: compiles shaders (raycast + quantize + UI), creates fullscreen quad VAOs (2 triangles strip), generates atlases via `generateMaterialAtlases` using `config.materialsProc || config['materials-proc']`, uploads via `createTexture` with filter from `rendering.textureFilter` (`nearest` default). Creates map texture via `uploadMapTexture`, palette texture 256x1 via `genPalette`, LUT texture 1024x32 via `buildRGBToPal`, scene texture + FBO for quantization pass, map UI texture. Caches ~50 uniform locations including extended set (pom clamping, shadow bias, pbr emissive/F0/atten, rendering surface mul, chamfer trim ranges, corner bands/normalMix).
- **Config resolution:** Must resolve toggles from dedicated configs with deep fallback chain: `getDeep(['pom.enabled','rendering.pom.enabled','renderer.pom.enabled',...])`. Similar for chamfer `['chamfer.enabled','pbr.chamfer.enabled']` and corners `['corners.enabled','pbr.corner.enabled']`. Defaults true for POM/chamfer/corner/fog/palette.
- **State fields:** `authentic=true, bandLevels=32, paletteStyle='doom', gridDebug=0, lightingEnabled=1, pbrEnabled=1, pomEnabled=1, fogEnabled=1, pbrDebugMode=0, chamferEnabled=1, cornerEnabled=1, _cfgCache`
- **Toggle methods:** `setGridDebug, setLightingEnabled, setPBREnabled, setPOMEnabled, setFogEnabled, setChamferEnabled, setCornerEnabled, setPBRDebugMode, toggleGridDebug (xor 1 returns new), toggleLighting, togglePBR, togglePOM, toggleFog, toggleChamfer, toggleCorner, cyclePBRDebug 0..8 mod 9`, `setAuthentic, setPaletteStyle, setBandLevels, rebuildPalette, uploadMap, renderMapUI(texData, uiCfg) stores _pendingMapUI with size/opacity/position, _renderUIPass draws blend SRC_ALPHA ONE_MINUS_SRC_ALPHA fullscreen or corner quad via UI shader`
- `render`: bind scene FBO, clear black, use raycast program, set uniforms from `player._cfg || _cfgCache` via `_resolveConfigValue(paths, fallback)`: fov from `rendering.fov`, playerHeight, eyeFactor `rendering.eye.playerHeightFactor`, mapSize, bind mapTex unit 0 matMap 13 atlases 1-12, texSize atlasW, light source from `player.getLightSource()`, lighting ambient level/color/worldMul from `lighting.ambient`, sun dir/color/intensity from `lighting.sun`, fog base/squared/color/enabled from `fog.json`, POM wall/floor/ceil/steps/maxOffset/minVz/minEffVz/fadeStart/fadeEnd from `pom.json`, debug toggles, AO sun/point/ambient from `ao.affect` or `pbr.ao`, PBR emissive albedoMul/strengthMul F0 attenQuad GGXEps from `pbr.json`, rendering surface floorMul/ceilMul/wallDarken/eyeFactor from `rendering.surface`, shadows biasN/dirOffset/sunFactor/pointFactor/sunMax/pointEps/normalThresh from `shadows.json`, chamfer size floor/ceil/wall/cornerRadius/darken/roundCorners/blendFloor/blendWall/rough + trim strengths + ranges creviceEnd creviceSmoothEnd trimStart trimMid trimEnd from `chamfer.json`, corners radius/mode/inner/bandNear/bandFarExtra/bandFarFactor/sectorThresh/normalMix/albedoBoost/roughMul/aoMul from `corners.json`
- Second pass quantization if authentic: use `quantProgram`, bind sceneTex LUT etc.

---

## 4. GLSL Shaders — DDA Raycaster with PBR + Advanced Features

**Why DDA:** Grid-based raycasting preserves retro feel while allowing modern lighting.

**Vertex shader:** fullscreen quad `a_pos -> v_uv = a_pos*0.5+0.5`.

**Fragment shader required structure (~800+ lines):**
- Uniforms: core resolution/playerPos/angle/fov/playerHeight mapTex/matMap/mapSize wall/floor/ceil atlases texSize atlasWalls/Floors/Ceils lightPos/color/intensity/radius ambientColor/level/worldAmbientMul sunDir/sunDirZ/intensity/color fogBase/squared/color/fogEnabled POM core wall/floor/ceil steps + extended maxOffset minVz minEffVz fadeStart fadeEnd authentic bandLevels time debug toggles gridDebug lightingEnabled pbrEnabled pomEnabled pbrDebugMode aoSun/aoPoint/aoAmbient chamferEnabled + sizes + darken + roundCorners + blends + rough + trim uniforms + cornerEnabled radius mode inner + bands + shading + PBR extended + rendering surface + eyeFactor
- Helpers: `isWallCell(ivec2) texelFetch mapTex R*255>0.5`, `nearestWallDistAndNormal(world out norm)` checks 4 neighbors returns best dist + normal, `isOuterConvex/isInnerConcave` corner classification via 3 neighbor checks, `rayCircleHit(O Dir C r out t0 t1)` quadratic discriminant, `atlasUV(matId uv atlasW texS) = (matId-1+uv.x)/(atlasW/texS)`, `decodeNormal(enc)`, `traceRay(origin dir maxDist)` DDA up to 64 steps returns true if wall hit within maxDist, PBR GGX `DistributionGGX, GeometrySchlickGGX, GeometrySmith, fresnelSchlick`, `pomOffset(heightMap uv viewTS strength steps)` centered reference + grazing clamp + maxOffset cap, `debugShowPBR(mode albedoRaw normalRaw worldN height rma emissive)` switch 1-8, `pbrShade` with AO per-light influence `mix(1,ao,affect)` + shadow bias logic + PBR GGX vs diffuse-only path

**Per-fragment flow:**
1. Compute ray dir from `cameraX = 2*gl_FragCoord.x/res.x-1`, `planeLen = tan(fov*0.5)`, `ray = rayDir + plane* cameraX`
2. DDA walk `sideDist, deltaDist, stepDir, mapPos` up to 64, break on wall `cellType>0.5`
3. If hit==1:
   - Compute `perpDist` via side, `hitPos = playerPos + ray*perpDist`
   - **True intruding rounded corners:** if `cornerEnabled==1` and `cornerRadius` 0.02-0.45:
     For side X or Y, check 2 candidate corners `wy,wy+1` or `wx,wx+1`, `dy/dx > radius+bandNear` skip. Classify outer convex `!E && !W2 && !D` vs inner concave `!E && W2 && D` via `isOuterConvex/isInnerConcave`. Compute circle center `C0 + dirSign*radius` where dirSign toward cell center. `rayCircleHit` playerPos ray C radius out t0 t1, accept tCand within `[perpDist - bandNear, perpDist + radius*bandFarFactor + bandFarExtra]` positive >0.01. Check sector `offP*dirSign > sectorThresh` reject wrong quadrant. If accepted, replace perpDist = tCand, hitPos = new, store `cornerNormal = normalize(offP)`, flag `hasCornerRound`. Intent: silhouette actually curves inward, not just shading.
     Config: radius default 0.15 clamp 0.02-0.45, mode 0 bevel flat 45° diagonal `normalize(Ngeom+n2)`, 1 round outer only, 2 round all outer+inner (default) `inner true`, search `bandNear 0.08 bandFarFactor 2 bandFarExtra 0.15 sectorThreshold 0.02`, shading `normalMix 0.92 albedoBoost 0.05 roughnessMul 0.82 aoMul 0.96`
   - Compute floor/ceiling heights 0.0/1.0 exact threshold (no overshoot margin for pixel-perfect corners)
   - Wall: `wallU = fract(hitPos.y/x)` flip if ray direction, optional fixed-point truncation if authentic `floor(wallU*64*65536)/65536/64`. Atlas UV via `atlasUV`. Build TBN `Ngeom per side, tangent, bitangent Z`, `worldPos = hitPos.xy + playerHeight+(wallV-0.5)`, `viewDir`, `viewTS = dot(viewDir, tangent/bitangent/Ngeom)`. POM offset via `pomOffset` on wallHeight atlas, centered reference: shader must do `curUV = uv - fullOffset*0.5` starting at -0.5*offset and march +delta, so mid-grey 0.5 = zero displacement. Sample albedo/normal/height/rma. If `hasCornerRound && pbrDebug==0 && gridDebug==0`, mix Nw with cornerNormal `mix(Nw, cn, normalMix)`, albedo += boost, rough *= roughMul, AO *= aoMul. If chamfer enabled and not corner round and pbrDebug==0 gridDebug==0, detect floor bevel `wallV < floorSize` or ceil `1-wallV < ceilSize` bend normal toward up/down via `normalize(Ngeom+up)` or spherical smoothstep if `roundCorners`, AO `mix(darken,1,smoothstep(0,creviceEnd,t))`, trim highlight `smoothstep(tStart,0.32,t)*(1-smoothstep(0.32,1,t))*floorStrength` added to albedo, rough `mix(0.58,1,t)`. Vertical bevel `edgeU = min(wallU,1-wallU) < wallSize` no skip interior concave (old bug skipped), diagonal normal `normalize(Ngeom+n2)`, AO darken blend, trim highlight.
   - Grid debug: if `u_gridDebug==1`, wall red, floor green with grid lines, ceil blue, raw AO=1, emissive 0.
   - PBR debug: if `pbrDebugMode !=0 && gridDebug==0`, bypass fog/banding, return `debugShowPBR`.
   - Otherwise PBR shade: see `pbrShade`
   - Wall side darkening `0.85` for Y-facing walls.
   - Floor/ceiling path when `wallV_raw <0 or >1`: ray-plane intersection perspective `dist = (eyeZ - floorH)/(vNorm-horizon)...`, `floorWorld = playerPos + ray*dist`, `fract` UV, POM sample, albedo * floorMul 0.7 ceilMul 0.8, normal decode, Nw, chamfer floor/ceiling detection via `nearestWallDistAndNormal` if within floorSize/ceilSize bend toward up/down, AO darken, trim highlight.

4. **POM intent details:**
   - Reference plane centered at 0.5 note in pom.json: `sampled as centered -0.5 offset` so mostly-grey floor does not float/elevate globally. Previous bug raw height as absolute depth caused floating.
   - Grazing safety: at ~80deg wall `viewTS.z ->0` fullOffset explodes `viewTS.xy*strength/vz` with 8-step march jumps whole bricks hitting CLAMP_TO_EDGE smearing tile border as black vertical lines. Fix: `vzAbs < minViewZ (0.08 ~5 deg) return zero`, `effective vz clamped to minEffectiveVz 0.18 (~10 deg)`, `hard max offset 0.10 UV (~1.5 bricks)` to prevent crossing tile, linear fade `0.08-0.22` to flat at extreme grazing. Must be configurable.

5. **Shadow intent details:**
   - Shadow grid artifacts were caused by DDA self-intersection: bias used perturbed normal-mapped normal *0.04 causing per-pixel DDA path divergence (mortar grooves re-hit own wall as shadow, black brick-grid speckles). Lighting off bypasses pbrShade -> albedo only confirms lighting-only bug. Also perp distance used `min(sideDist - deltaDist)` underestimating.
   - Fix: snap bias normal to dominant axis (geometric axis-aligned walls) ignoring normal-map jitter, threshold `traceNormal.threshold 0.02`, if N.xy length < threshold traceN=(0,0,1) else dominant axis. Increase combined bias `traceNormalOffset 0.10 + dirOffset 0.06` forward along light dir, correct perp using tracked side, DDA iterations 64.

6. **Fog intent:**
   - Exponential squared: `fog = 1.0/(1.0+dist*base+dist*dist*squared); final*=fog + fogColor*(1-fog)`. Old heavy values 0.18/0.025 gave only 46% visibility at 4m, new defaults base 0.06 squared 0.005 gives ~76% visibility at 4m. Config `fog.json` enabled true, presets off/light/default/heavy, toggle key 5 via `u_fogEnabled` uniform gating.

7. **AO influence:**
   - AO baked but should not kill all light in mortar crevice. Use `mix(1,ao,affect)` separately per light. Config `ao.affect sun 0.25 point 0.35 ambient 1.0`. Low sun/point values keep dark corners lit slightly.

8. **Palette quantization:**
   - `genPalette(style)` Doom-like brown ramp + 216 colors or smooth256 etc, `buildRGBToPal` LUT brute search 32^3 -> nearest palette index. Quantization shader samples sceneTex + paletteTex + lutTex, `authentic` toggle true, `bandLevels` 8-64 default 32, `floor(color*bandLevels)/bandLevels` when authentic.

---

## 5. Player Entity with WASD Movement

- `entities/player.js`: `constructor(x,y,angle), setPosition(x,y,angle), setConfig(cfg) reads playerCfg or legacy, update(dt, inputState, dungeonMap) with WASD forward/back/strafe and QE turn and slide collision, getPosition(), getAngle(), getLightSource() returns player point light at eye height with warm color from config lighting.player or player.light {intensity 1.8 radius 4.5 color [1,0.9,0.7] height 0.45}`
- Slide collision: tries full move then X-only then Y-only. Checks 3x3 grid wall cells block if distance < radius 0.28 configurable via `player.json collision.radius`
- Input: `systems/input.js` keyboard state tracker with `Input` class `update()` producing `{forward,strafe,turn}` from WASD+QE, plus direct key query for R/M/1-8

---

## 6. Configuration Expansion — Dedicated Files Required

All must be editor-tracked via server recursive walk and displayed in hierarchical UI. Each file version 1.

- `rendering/rendering.json`: `resolution 640x360, fov 1.0, textureFilter nearest, eye {height 0.5 playerHeightFactor 0.15 horizon 0.5}, surface {floorAlbedoMul 0.7 ceilAlbedoMul 0.8 wallDarkenSide 0.85}, geometry {floorBaseline 0 ceilBaseline 1 wallThreshold 0.5 heightClamp {...}}, canvas {baseWidth 640 baseHeight 360 scaleMode contain}, toggles {gridDebugDefault false lightingDefault true pbrDefault true pomDefault true fogDefault true chamferDefault true cornerDefault true}`
- `rendering/palette.json`: `authentic true paletteStyle doom bandLevels 32 clamp min 8 max 64 styles {doom id0 brown ramp, smooth256, truecolor bypass, grayscale, sepia} quantization {lutSize r32 g32 b32 paletteTexSize 256} banding {enabled note}`
- `rendering/pom.json`: `enabled true strength {wall 0.06 floor 0.07 ceil 0.035 note}, steps 8 stepsMax 32 clamping {maxOffset 0.1 minViewZ 0.08 minEffectiveVz 0.18 note}, fading {fadeStart 0.08 fadeEnd 0.22}, reference {plane 0.5 note centered}, presets {off, subtle, default, deep, extreme}`
- `rendering/pbr.json`: `enabled true roughness {clampMin 0.2 max 0.95}, metal {default0 clamp 0-1}, emissive {albedoMul 0.8 strengthMul 2.5 note}, ggx {epsilon 0.0001 pi}, fresnel {f0Dielectric 0.04}, pointAttenuation {quadraticFactor 0.25}, debug {modes [OFF Albedo Normal raw World Normal Height Rough Metal AO Emissive] note key6 cycles}`
- `rendering/ao.json`: `affect {sun 0.25 point 0.35 ambient 1.0 note 0=ignore AO 1=full via mix}, material {globalStrength 0.6 groutFactor 0.78 faceFactor 0.92 domeBoost 0.08 min 0.7}, sampling {microJitter 0.04 perBrickJitter 0.04 note baked}`
- `rendering/raymarch.json`: `maxSteps 64 shadowSteps 64 epsilon 0.0001 nearClip 0.0001 farClip 100 wallThreshold 0.5 encoding {floorOffset 0.5 ceilOffset 0.7}, fallback {floorHeight 0 ceilHeight 1.15}, refinement {steps 3}`
- `rendering/materials-proc.json`: `texSize 64 walls {type brick brick{w 8 h8} heightScale 1.15 normalStrength 1.15 roughness 0.72 roughnessVariation 0.1 groutRoughAdd 0.15 metal0 aoStrength 0.6 aoBoost 0.6 aoGrout 0.78 aoFace 0.92 aoDomeBoost 0.08 aoMin 0.7 groutWidth1 domeStrength 1.1 crackAmount 0.6 emissive0 colorJitter28 heightJitter0.12 domeHeight0.28 groutDarken {r0.45 g0.4 b0.35} normalFactor2.4 micro{...}} floors {type slab blockSize8 heightScale0.8 normalStrength0.9 roughness0.78 ...} ceils {... roughness0.82} packing {note forcedCount1}`
- `lighting/lighting.json`: `ambient {level0.36 color[1,1,1] worldMul0.38}, sun {intensity1.5 color[1,1,1] dir[-0.55,-0.45,-0.7] note dir normalized Lsun=-normalize dir XY primary for 2D shadow trace}, player {intensity1.8 radius4.5 color[1,0.9,0.7] height0.45 note torch}, torchColors [{warm rgba}...]`
- `lighting/shadows.json`: `enabled true bias {traceNormalOffset0.1 dirOffset0.06 note shadowOrigin=worldPos.xy+traceN*normalOffset+dir*dirOffset prevents acne}, traceNormal {threshold0.02 note if N.xy len<thresh traceN=(0,0,1) else dominant axis}, sun {shadowFactor0.25 maxDist20 note multiplier when sun ray hits wall final*=factor 0.25=75% dark}, point {shadowFactor0.15 distEpsilon0.1 note traceRay(dist-epsilon) factor stronger than sun}, dda {maxSteps64 shadowSteps64}`
- `lighting/fog.json`: `enabled true base0.06 squared0.005 color[0.05,0.05,0.08] formula note, presets {off base0 squared0, light 0.04/0.003, default 0.06/0.005, heavy 0.18/0.025}, debug {toggle Key5 note u_fogEnabled uniform}`
- `geometry/chamfer.json`: `enabled true size {floor0.3 ceil0.24 wall0.28 cornerRadius0.22 note floor/ceil world meters baseboard cove bevel width wall UV fraction 0-0.5}, shading {darken0.55 roundCorners false floorToWallBlend0.92 wallToWallBlend0.88 affectRoughness0.35 note darken AO in crevice 0=black 1=no darken roundCorners spherical vs flat bevel}, trim {floorStrength0.22 ceilStrength0.18 wallStrength0.16 floorAltStrength0.18 ceilAltStrength0.14 note trim highlight added in middle bevel band simulates baseboard catching light}, ranges {creviceEnd0.12 creviceSmoothEnd0.3 trimStart0.08 trimMid0.35 trimEnd1 wallAODarkenBlend0.12 etc note thresholds for smoothstep shaping}, debugToggle Key7`
- `geometry/corners.json`: `enabled true radius0.15 clamp {min0.02 max0.45} mode2 modes {0 bevel flat 45deg diagonal, 1 round outer only, 2 round all outer+inner default} inner true search {bandNear0.08 bandFarFactor2 bandFarExtra0.15 sectorThreshold0.02 note bandNear = hitPos within radius+0.08 triggers check bandFar = perpDist+radius*2+0.15 search range sectorThreshold=offP*dirSign>threshold rejects wrong quadrant} shading {normalMix0.92 albedoBoost0.05 roughnessMul0.82 aoMul0.96 note when corner hit Nw=mix(Nw,cornerNormal,normalMix)} debugToggle Key8`
- `gameplay/generator.json`: `mapW64 mapH64 roomTarget14 roomAttempts200 levelCount1 seed null loopExtraChance0.02 flattenStartRadius2 items {maxTorches24 minTorchDist6 corridorBias1.5 torchOffset0.35} torchColors [...] boundaryWallId1 linearity0.85 sideBranchMaxDepth1 roomSizeMin6 Max14 mainPathRooms8 mainPathRoomSizeBonus2 corridorWidth1 corridorWidthMain1 sideWeights etc` + robustness: roomAttempts 200 for inner tries, 5-6 size variants, search radius 14+sizeTry*3, tolerant skip <4 main rooms
- `gameplay/player.json`: `moveSpeed3 turnSpeed2.2 radius0.28 height0.5 mouseSensitivity0.0022 collision {slide true radius0.28 note circle vs AABB per wall cell} light {intensity1.8 radius4.5 color[1,0.9,0.7] height0.45}`
- `ui/map.json`: `font {family Pixelify Sans fallback Georgia serif googleName Pixelify+Sans:wght@400;600;700 note restored from Task2 main.json minimap.font parchment aesthetic}, display {position fullscreen size640 opacity0.92 note fullscreen|top-right|... corner}, parchment {bg #e8dcc4 scan #ddd0b8 alpha0.92 scanlineEvery4}, colors {wallDark #2a2a2a gold #c9a84c goldDim #8a7233 player [15,220,15] parchmentPanel [220,205,175] parchmentBorder [139,115,85] textLight [58,48,32] textDim [107,93,72] roles {entrance #8a8a8a exit... treasure #c9a84c ...} materials {wall1 #4a4a4a ...}}, layout {legendHeight60 legendGap16 padding40 grid{minCell2} stair{sizeFactor1.2 minSize6 strokeFactor0.12} playerDot{minRad3 sizeFactor0.5} legend{swatch12 gap8 itemWidth90 panelAlpha220 borderAlpha220}}`
- `ui/debug.json`: `keys {1 toggle grid debug floor green wall red ceil blue, 2 toggle lighting, 3 toggle PBR diffuse-only vs full GGX, 4 toggle POM, 5 toggle Fog, 6 cycle PBR debug OFF Albedo Normal raw World Normal Height Rough Metal AO Emissive, 7 toggle Chamfer baseboard+vertical edge bevels, 8 toggle Corner geometry true intruding rounded corners, R regen dungeon, M toggle fullscreen map}, hud {timeoutMs1500}, regen {maxAttempts3}, overlay {scaleRefW640 scaleRefH360}`

**Backward compatibility:** Game merges dedicated configs via `getAllRenderConfigs` + legacy `main.json` fields (`materialProc, renderer, pbr, lights, player, ui.map`) must still work via fallback.

---

## 7. Game Page Integration

- `main.js` now 14-line bootstrap: fetch config, create Game, init, start loop. No longer Task2 MinimapRenderer IIFE.
- `core/game.js` Game class:
  - Constructor(canvas) stores hud `getElementById('game-hud')`, cfg null, dungeon null, renderer null, player null, input null, ui null, lastTime 0, showMap false, binds _loop _onKeyDown
  - `_mergeConfigs(baseCfg, renderCfgs)` merges dedicated entries, builds backward compat aliases `generator, fog, rendering, palette, pom, pbr, ao, lighting, shadows, chamfer, corners, raymarch, map, materialsProc, playerCfg, debug, items, torchColors, boundaryWallId, renderer, pbr, lights, player, ui, materialProc` with fallback defaults. Explain in comments.
  - `async _loadAllConfigs()` calls `getConfig()` + `getAllRenderConfigs()`
  - `async _loadMapFont(mapCfg)` restores Task2 font loading: reads `font.family fallback googleName`, creates link `id=map-font` href `https://fonts.googleapis.com/css2?family=${googleName}&display=swap`, awaits onload + `document.fonts.load` 12px regular, bold 12px, 10px, bold 16px + `document.fonts.ready` + 50ms. Handles failure warn.
  - `async init()`: load all configs, check `isWebGL2Supported()` throw if not supported showing hud, load map font awaiting, retry loop like regen: `maxAttempts = debug.init.maxAttempts ??5`, random seed on attempts>0 `Math.floor(Math.random()*1000000)`, `generateDungeon(cfg, seed)` logs seed w*h rooms, warn on retry, throw lastErr if all fail. Create `GPURenderer(canvas)`, `await init`, create `Player(start+0.5, start+0.5, -PI/2)`, setConfig, Input, UI, setDungeon, hide hud, resize handling `baseW baseH scale = min(vw/baseW, vh/baseH)` set canvas.style.width/height, listeners resize keydown.
  - `async regen(seedOverride)`: similar retry 3 attempts, reload configs, generate, `renderer.uploadMap`, `player.setPosition`, `player.setConfig`, `ui.setDungeon`.
  - `_loop(time)`: dt `min(0.05,(time-last)/1000)`, if ready get `input.update()`, `player.update`, if `showMap` `ui.drawMap` + `renderer.renderMapOnly` else `renderer.render(dungeon, player, time/1000)`, RAF.
  - `_onKeyDown`: R regen, M showMap toggle, 1 toggleGridDebug hud `Grid debug: ON (floor green / wall red / ceil blue)`, 2 toggleLighting `Lighting: ON/OFF (flat albedo)`, 3 togglePBR, 4 togglePOM, 5 toggleFog, 6 cyclePBRDebug `PBR Debug: names[OFF/Albedo/Normal raw/World Normal/Height/Rough/Metal/AO/Emissive] (v)`, 7 toggleChamfer `Chamfer: ON (floor/ceil baseboard + vertical edges) / OFF (sharp 90°)`, 8 toggleCorner `Corner Geometry: ON (rounded intruding r=0.15 outer+inner) / OFF`
- `server.js`: return 204 for `/favicon.ico` to avoid console 404 noise.

**Generator robustness intent:** Original generator used single attempt and narrow search radius, failed on unlucky seed with "Failed to place main path room 1". New spec requires attempt loop, wider search, size variants.

---

## 8. Debug Visualization Suite & Toggle Keys — Training & Fairness Critical

**Intent for training:** An agent cannot tune PBR without being able to isolate each subsystem's visual contribution. Without debug toggles, a black mortar grid could be AO, shadow acne, fog, or roughness bug — indistinguishable. The debug suite makes each subsystem independently verifiable and provides clear HUD feedback so the agent (and human) knows what state is active. This is required to be fair: the spec must enumerate every toggle, its key, its HUD message, its visual effect, and why it exists, so a future agent can reproduce behavior and screenshots match.

**Required keys and behaviors (defined in `ui/debug.json` + implemented in `core/game.js` _onKeyDown + `render/renderer-gpu.js` toggle methods):**

- **Key 1 — Grid Debug:** Toggles `u_gridDebug`. ON = floor solid green with grid lines (fract floorWorld >0.97 highlighted 0.9 vs 0.25), wall solid red, ceil solid blue, raw AO=1 emissive 0 bypassing PBR materials. OFF = proper PBR materials. Purpose: validate wall-floor-ceiling alignment exact 0.0/1.0 wall threshold, pixel-perfect corners, no overshoot margin. HUD: `Grid debug: ON (floor green / wall red / ceil blue) / OFF`. Config default `rendering.toggles.gridDebugDefault false`. Screenshot required: `game-grid-debug.png`.

- **Key 2 — Lighting:** Toggles `u_lightingEnabled`. ON = full PBR shade ambient + sun + point + shadows + AO. OFF = flat albedo only (early return in `pbrShade`). Purpose: isolate lighting-only bugs — e.g., shadow acne speckles disappeared when lighting OFF proving lighting-only bug. HUD: `Lighting: ON / OFF (flat albedo)`. Screenshot required: `game-debug-lighting-off.png` vs default lighting ON (`game-3d.png`). Explain intent.

- **Key 3 — PBR:** Toggles `u_pbrEnabled`. ON = full GGX Cook-Torrance BRDF (DistributionGGX + GeometrySmith + fresnelSchlick, F0 dielectric 0.04 mixed with albedo by metalness, point attenuation quadraticFactor 0.25). OFF = diffuse-only Lambert NdotL with shadow + ambient, no specular. Purpose: see specular contribution, isolate roughness/metal bugs. HUD: `PBR: ON / OFF (diffuse only)`. Screenshot: `game-debug-pbr-off.png`.

- **Key 4 — POM:** Toggles `u_pomEnabled`. ON = parallax occlusion mapping via `pomOffset` 8-step raymarch into height map with centered reference `curUV = uv - 0.5*fullOffset` and grazing clamp (minVz 0.08, minEff 0.18, maxOff 0.10, fade 0.08-0.22). OFF = zero offset (uvPOM = uvAtlas). Purpose: validate POM correctness vs floating floor / vertical streak artifacts. HUD: `POM: ON / OFF`. Screenshot: `game-debug-pom-off.png`.

- **Key 5 — Fog:** Toggles `u_fogEnabled`. ON = exponential squared fog `fog = 1/(1+dist*base+dist*dist*squared)` base 0.06 squared 0.005 color [0.05,0.05,0.08] final *= fog + fogColor*(1-fog). OFF = bypass fog (finalColor not mixed). Purpose: test fog density and isolate fog vs lighting darkness. Config `fog.json` presets off 0/0, light 0.04/0.003, default 0.06/0.005, heavy 0.18/0.025. Old heavy gave 46% visibility at 4m vs new default 76%. HUD: `Fog: ON / OFF`. Screenshot: `game-debug-fog-off.png` and `game-debug-fog-on.png` if needed, but at least OFF variant.

- **Key 6 — Cycle PBR Debug Modes 0..8:** Cycles `u_pbrDebugMode` ` (mode+1)%9` via `cyclePBRDebug()`. When `pbrDebugMode !=0 && gridDebug==0`, fragment shader must bypass fog/banding and return `debugShowPBR(mode, albedoRaw, normalRaw, worldN, heightVal, rma, emissive)`:
  - 0 OFF = normal PBR path
  - 1 Albedo = raw albedo texture without lighting
  - 2 Normal raw = encoded normal map raw RGB (TS)
  - 3 World Normal = world-space normal `Nw*0.5+0.5`
  - 4 Height = height map `vec3(heightVal)`
  - 5 Rough = `rma.r` roughness channel
  - 6 Metal = `rma.g` metal channel
  - 7 AO = `rma.a` AO channel baked (should show softened 0.70 min, not black grid)
  - 8 Emissive = emissive (black for Task3)
  Purpose: validate each PBR map generation correctness, show 4-sided floor normals, textured roughness variation not flat 217, AO softened. HUD: `PBR Debug: OFF / Albedo / Normal raw / World Normal / Height / Rough / Metal / AO / Emissive (mode)`. Names from `pbr.json debug.modes[]`. Config default `pbr.debug.modes`. Screenshots required for ALL 8 non-OFF modes: `game-debug-pbr-albedo.png`, `game-debug-pbr-normal-raw.png`, `game-debug-pbr-world-normal.png`, `game-debug-pbr-height.png`, `game-debug-pbr-rough.png`, `game-debug-pbr-metal.png`, `game-debug-pbr-ao.png`, `game-debug-pbr-emissive.png`.

- **Key 7 — Chamfer Bevels:** Toggles `u_chamferEnabled`. ON = fake geometry via normal bending + AO darken + roughness + trim highlight. Must be visible with defaults floorSize 0.30 ceilSize 0.24 wallSize 0.28: floor/ceiling baseboard/cove bevel width in world meters, wall in UV fraction 0-0.5, darken 0.55, roundCorners false, floorToWallBlend 0.92 wallToWallBlend 0.88 affectRoughness 0.35, trim strengths floor 0.22 ceil 0.18 wall 0.16 alt 0.18/0.14, ranges creviceEnd 0.12 creviceSmoothEnd 0.3 trimStart 0.08 trimMid 0.35 trimEnd1. Implementation via helpers `isWallCell` texelFetch mapTex and `nearestWallDistAndNormal`. Horizontal bevel where wallV < floorSize or 1-wallV < ceilSize: mix Ngeom toward up/down (45deg flat or spherical smoothstep when roundCorners), AO mix(darken,1,smoothstep(0,creviceEnd,t)), trim highlight `smoothstep(tStart,0.32,t)*(1-smoothstep(0.32,1,t))*strength` added to albedo. Vertical bevel every cell edge `edgeU=min(wallU,1-wallU)<wallSize` — must NOT skip interior concave corners (old bug skipped). Diagonal normal `normalize(Ngeom+n2)`, AO darken 0.88* blend, roughness mix. Purpose: break sharp 90° grid feeling. HUD: `Chamfer: ON (floor/ceil baseboard + vertical edges) / OFF (sharp 90°)`. Screenshots required: `game-debug-chamfer-on.png` (default ON with visible baseboard catching point light + vertical edges) and `game-debug-chamfer-off.png` (sharp).

- **Key 8 — True Geometry Rounded Corners:** Toggles `u_cornerEnabled`. ON = true intruding rounded corners via DDA + ray-circle intersection changing silhouette. Implementation via `rayCircleHit(O Dir C r out t0,t1)` quadratic, `isOuterConvex` outer convex `!E && !W2 && !D`, `isInnerConcave` inner concave `!E && W2 && D` where E=cell - stepDir, W2=cell+off, D=cell-stepDir+off, C0 corner position hitPos.x or y, dirSign toward cell center, circle center `C0+dirSign*radius`, search bandNear 0.08 triggers if dy/dx <= radius+bandNear, accept tCand within [perpDist-bandNear, perpDist+radius*bandFarFactor 2+bandFarExtra 0.15] >0.01, sector `offP*dirSign > sectorThresh 0.02` reject wrong quadrant, replace perpDist = tCand, store cornerNormal normalize(offP) flag hasCornerRound. Mode 0 bevel flat 45° diagonal `normalize(Ngeom+n2)`, 1 round outer only, 2 round all outer+inner default, inner true. Shading normalMix 0.92 mix(Nw,cornerNormal,normalMix), albedoBoost 0.05, roughMul 0.82, aoMul 0.96 makes corner catch light. Radius default 0.15 clamp 0.02-0.45. Purpose: silhouette change, not just normal trick — intrudes into air space. HUD: `Corner Geometry: ON (rounded intruding r=0.15 outer+inner) / OFF`. Screenshots required: `game-debug-corner-on.png` (rounded silhouette) and `game-debug-corner-off.png` (sharp 90°).

- **Key R — Regen Dungeon:** Calls `Game.regen(null)` which reloads all 16 configs, generates dungeon with random seed on retry attempts 3 (debug.regen.maxAttempts), uploads map via `renderer.uploadMap`, resets player start+0.5 angle -PI/2 setConfig, ui setDungeon. Robustness: must not crash on unlucky seed. Screenshot not required but E2E must verify canvas changes.

- **Key M — Fullscreen Parchment Map Overlay:** Toggles `showMap` bool. When true, `ui.drawMap(dungeon,player,renderer)` Canvas2D + `renderer.renderMapOnly(dungeon,player)` + `_renderUIPass` draws mapUITex via UI shader fullscreen 640x360 opacity 0.92 or corner mini (top-right etc size 160). Must restore Task2 parchment correct colors alignment Pixelify Sans labels via fillText legend stair arrows ▲▼, swatch 12 gap8 itemWidth90, parchment bg #e8dcc4 scan #ddd0b8. HUD not needed for M but E2E verifies. Screenshot required: `game-minimap-overlay.png` (already) plus optional corner variants.

**HUD & Config:**
- HUD element `id=game-hud` displays message via `_showHud(msg)` timeout `debug.hud.timeoutMs` 1500ms from `ui/debug.json`. All toggles must show HUD with clear ON/OFF and description as listed.
- `debug.json` keys field must enumerate all keys 1..8,R,M with human-readable descriptions matching HUD. This file is the source of truth for key bindings.
- All toggles runtime configEnabled && configEnabled pattern: e.g., `chamferEnabled = configChamEnabled && runtimeChamferEnabled` not overwritten each frame (old bug overwrote runtime toggle each frame). Renderer `_resolveToggles` must resolve `configEnabled && runtime` correctly.

**Fairness rationale:** Without explicit listing, a future agent may implement only grid debug and miss chamfer/corners or PBR debug modes, producing ambiguous spec. By enumerating every key, HUD text, config path, and visual intent, spec becomes training-ready: agent can implement `toggleX` methods, wire keydown, and produce matching screenshots `game-debug-*.png` that reviewers can verify without running code blindly. Tests must cover each toggle returns correct type and has no console errors.

---

## 9. Map UI — Parchment Overlay Restoration

**Why restore:** Task2 minimap had correct parchment colors, alignment, text labels, Pixelify Sans. Task3 early commits broke it to monochrome. Must restore.

- `render/map-ui.js` Canvas2D path `MinimapRenderer` with rounded rooms
- Layout `calcLayout` w-40 oy+20 (not w-20), fix swatch color bug (was filling border at alpha 80 over swatch), restore `fillText` for legend labels and stair arrows ▲▼
- Colors from `map.json` colors.parchmentPanel/Border, roles materials palettes, player dot, grid, legend swatches 12 gap 8 itemWidth 90 panelAlpha border.
- Display modes: fullscreen 640x360 overlay WebGL-rendered parchment via `renderer.renderMapOnly` + Canvas2D overlay, or corner mini modes top-right etc with size 160 and opacity 0.88.
- `map.json` font config Pixelify Sans / Georgia fallback from Task2, must be loaded dynamically before first map render — await `document.fonts.load`.

---

## 10. Tests

**Unit (88 pass expected after hardening):**
- `materials.test.js`: atlas size 64x64 per material, value ranges normal unit length, determinism same seed same bytes, brick pattern not uniform, roughness variation not flat constant bug, AO softened not 0.41 grout.
- `player.test.js`: spawn at start+0.5, movement WASD forward/back/strafe, wall collision blocking, slide collision tries full then X-only then Y-only, turning via QE, light source returns player point light at eye height warm color intensity radius from config.
- `renderer.test.js`: WebGL2 detection via canvas.getContext, shader source validity contains required uniform names `u_pomMaxOffset u_shadowBiasN u_chamferEnabled u_cornerEnabled etc`, GL utils `createShader/createProgram` error logging, `isWallCell` logic, generator single ID lock `uniq IDs [0,1] only`.

**E2E (`game.spec.js`):**
- Page loads no errors (filter external font resource errors)
- Canvas WebGL2 context obtainable (not 2D context call on WebGL canvas regression)
- 3D scene renders non-black pixels after init
- WASD moves canvas changes, QE turns canvas changes, M toggles minimap (checks WebGL context for fullscreen map path), R regenerates canvas changes, no WebGL errors, back home works
- Editor E2E for new nested config fields hierarchical tree

**Full suite:** `npm run test:unit` + `npm run test:e2e` must pass, `npm test` full suite 88 unit + 39 e2e = 127 total pass after debug suite + nested configs + hardening.
**Debug screenshots must be captured** for all toggles: `game-3d.png` (default all ON), `game-grid-debug.png` (key1), `game-debug-lighting-off.png` (key2 OFF), `game-debug-pbr-off.png` (key3 OFF), `game-debug-pom-off.png` (key4 OFF), `game-debug-fog-off.png` (key5 OFF), `game-debug-pbr-*` (key6 cycle 8 modes albedo, normal-raw, world-normal, height, rough, metal, ao, emissive), `game-debug-chamfer-off.png`/`-on.png` (key7), `game-debug-corner-off.png`/`-on.png` (key8), `game-minimap-overlay.png` (M fullscreen parchment), plus editor configs for rendering/pom/fog/chamfer/corners.

---

## 11. Acceptance Criteria (Fair and Measurable)

- [ ] `src/assets/config/` contains 16 dedicated JSONs in subfolders `rendering/` 7 files, `lighting/` 3, `geometry/` 2, `gameplay/` 2, `ui/` 2, plus minimal `main.json v3` with _readme delegation. Server recursive `walkJsonFiles` works, API accepts `/api/assets/<nested>/<name>` with slash.
- [ ] `config/config.js` has `CONFIG_PATHS` mapping logical name → candidate paths nested first flat fallback, `getAllRenderConfigs` batch loads, `getAsset` supports nested category.
- [ ] `editor.js` renders hierarchical tree for `config/rendering` etc padding by depth, hides `_readme` keys, allows editing nested files.
- [ ] `world/materials.js` generates PBR atlases 64x64 for 1 wall +1 floor +1 ceiling only (`Math.min(1,len)`), 12 textures NEAREST filter, 6 maps per material albedo height normal roughMetal packing, AO baked softened grout 0.78 face 0.92 domeBoost 0.08 min 0.70 boost 0.6, roughness variation per-brick hash jitter + micro + grout add + edge, dome polish, fix `|| roughVal` bug, normal indexing *4, exports `generateMaterialAtlases` + `atlasUvX`.
- [ ] `render/renderer-gpu.js` GPURenderer with specified API, init compiles 3 programs (raycast, quantize, UI), creates fullscreen quad VAOs, generates atlases, uploads mapTex matTex, creates paletteTex 256x1 LUT 1024x32 sceneTex FBO mapUITex, caches +27 extended uniforms, resolves toggles from dedicated configs with fallback, methods set/toggle gridDebug lighting PBR POM fog chamfer corner pbrDebug authentic palette. `renderMapOnly` exists. `uploadMap` updates existing texture or creates new. `renderMapUI` stores pending. Toggle methods return new value.
- [ ] `render/shaders.js` vsSource fullscreen quad, fsSource ~800+ lines with all uniforms listed, helpers `isWallCell, nearestWallDistAndNormal, isOuterConvex, isInnerConcave, rayCircleHit, atlasUV, decodeNormal, traceRay, DistributionGGX, GeometrySchlickGGX, GeometrySmith, fresnelSchlick, pomOffset centered, debugShowPBR, pbrShade`. DDA up to 64 steps, wall threshold exact 0.0/1.0 no overshoot. POM centered reference `curUV = uv - 0.5*fullOffset` and marching +delta, grazing safety minVz 0.08 minEff 0.18 maxOffset 0.10 fade 0.08-0.22. Shadow bias dominant axis snap threshold 0.02 normalOffset 0.10 dirOffset 0.06 sunFactor 0.25 pointFactor 0.15 sunMax 20 pointEps 0.1. Fog formula `1/(1+dist*base+dist*dist*squared)` base 0.06 squared 0.005 color. AO influence `mix(1,ao,affect)` per light sun 0.25 point 0.35 ambient 1.0. Chamfer detection via `nearestWallDistAndNormal` floorSize 0.30 ceilSize 0.24 wallSize 0.28 darken 0.55 roundCorners false blend 0.92/0.88 roughness 0.35 trim strengths ranges. Corners true geometry ray-circle intruding radius 0.15 clamp 0.02-0.45 mode 2 outer+inner search bandNear 0.08 bandFarFactor 2 bandFarExtra 0.15 sectorThresh 0.02 shading normalMix 0.92 albedoBoost 0.05 roughMul 0.82 aoMul 0.96.
- [ ] `entities/player.js` WASD+QE slide collision radius 0.28 height 0.5 getLightSource warm [1,0.9,0.7] intensity 1.8 radius 4.5 height 0.45.
- [ ] `systems/input.js` Input keyboard tracker.
- [ ] `core/game.js` Game class orchestration merging all 16 dedicated configs, font loading via Google Fonts link + `document.fonts.load`, init retry 5 attempts random seeds, regen 3 attempts, resize canvas contain scaling baseWidth/baseHeight, RAF loop render vs renderMapOnly, key handling 1-8 R M with HUD timeout 1500ms.
- [ ] `render/map-ui.js` Canvas2D parchment minimap rounded rooms correct calcLayout w-40 oy+20, swatch color overwrite fix, fillText legend labels stair arrows ▲▼, fully configurable from `map.json` colors parchment layout font, font Pixelify Sans fallback Georgia.
- [ ] Generator single-material lock: `generator.js` forces wallMat/floorMat/ceilMat=1 stairMat=1, `themes.js` + `themes.json` pools `[{id:1,weight:1}]`, renderer `slice(0,1)`, grid uniq IDs [0,1] only.
- [ ] Generator robustness: `generator.json` roomAttempts 200, size variants 5-6, search radius 14+sizeTry*3, tolerant skip <4 main rooms, Game retries.
- [ ] `server.js` returns 204 for favicon.ico.
- [ ] Game page shows first-person 3D with PBR materials procedural brick POM depth, floor stone slabs, PBR response to warm player light with shadows (no acne grid speckles) and fog ~76% visibility at 4m, chamfer visible baseboard + vertical edges when ON (toggled key7), true rounded corners intruding outer+inner silhouette when ON (key8), palette quantization optional authentic doom bandLevels 32.
- [ ] Toggles: 1 grid debug floor green wall red ceil blue, 2 lighting OFF=flat albedo, 3 PBR OFF=diffuse only, 4 POM OFF, 5 fog OFF, 6 cycle PBR debug 0 OFF 1 Albedo 2 Normal raw 3 World Normal 4 Height 5 Rough 6 Metal 7 AO 8 Emissive, 7 chamfer, 8 corner, R regen, M fullscreen map overlay opaque parchment correct colors alignment Pixelify Sans labels, opacity 0.92.
- [ ] No console errors, WebGL2 unavailable handled, shader compile errors logged.
- [ ] Editor shows hierarchical config tree with all 16 dedicated files editable persisting correctly, recursive walk.
- [ ] Unit tests pass `npm run test:unit` 88, E2E pass `npm run test:e2e` 39, full `npm test` 127 total.
- [ ] Debug screenshots for all variants exist in `screenshots/`: grid debug, lighting OFF, PBR OFF, POM OFF, fog OFF, PBR debug 8 modes (albedo, normal-raw, world-normal, height, rough, metal, ao, emissive), chamfer OFF/ON, corner OFF/ON, minimap overlay fullscreen, plus editor configs rendering/pom/fog/chamfer/corners — enumerated in task.toml.
- [ ] No emoji Phosphor only pure ES modules.

---

## 12. Out of Scope (Now Deferred)

- Full 16/10/8 material library deferred (engine ready but locked to 1 for Task3 to avoid wrapping bugs)
- Multiple torch lights deferred (only player point light + sun)
- Mouse look, view bob, grid snap deferred to Task 4
- Character sprites deferred to Task 6
- Live config hot-reload sync deferred (requires regen or rebuild)
- Audio, mobile performance, R8 optimization deferred

Palette quantization, PBR debug, chamfer, rounded corners are **in scope** now (previously deferred) because they proved essential for visual quality and training fairness.

---

## 13. Deliverables Summary

After this task `game.html` shows first-person 3D dungeon walkable with WASD+QE, walls procedural brick with POM extrusion centered at mid-grey (grout intrudes, pave extrudes) and grazing-clamped to avoid streaks, floor/ceiling 4-sided pillowed normals, roughness textured variation, AO softened darkening crevices 0.70 min, PBR GGX response to warm player torch with shadow raymarch bias snapped to geometric normal avoiding acne, exponential squared fog configurable base 0.06 squared 0.005 with presets, chamfer fake-geometry bevels floor-wall 0.30 ceil-wall 0.24 wall-wall 0.28 with AO darken + trim highlight catching point light (key7), true intruding rounded corners radius 0.15 outer+inner via ray-circle intersection changing silhouette (key8), palette quantization doom 256 colors + LUT bandLevels 32 authentic toggle, grid debug RGB, lighting/PBR/POM/fog toggles 1-5, PBR debug cycle 0..8 key6, M toggles fullscreen WebGL parchment map overlay 640x360 with correct colors alignment Pixelify Sans legend labels stair arrows ▲▼ opacity 0.92, R regenerates robustly with retry, editor shows nested rendering/lighting/geometry/gameplay/ui configs hierarchical tree editable persisting via recursive server API. Dungeoneers as playable first-person experience free of floating floor, vertical streaks, shadow acne grid, black AO mortar, flat roughness.

---

## 14. Tech Choices Explained (For Training Fairness)

- **Centering POM at 128:** Raw height as absolute depth makes mid-grey 0.5 cause 0.5*strength UV shift everywhere — grey floor appears floating elevated. Centered reference `uv - 0.5*fullOffset` makes 0.5 zero displacement, <0.5 negative (grout intrude), >0.5 positive (pave extrude). Intent: ground truth is mid-surface.
- **Grazing clamp:** At near-parallel view, `viewTS.xy*strength/vz` explodes. Single 8-step march jumps whole bricks hitting CLAMP_TO_EDGE border color smearing as thin black vertical line down corridor. Intent: bound offset, fade to flat at grazing to preserve visual intent without artifacts. Explain thresholds measurable.
- **Shadow bias geometric snap:** Perturbed normal-mapped normal varies per pixel per mortar groove, causing stable world pos to push in random directions per groove re-hitting own wall cell as shadow speckles. Intent: bias direction must be stable per wall face, not per texel — snap to dominant geometric axis.
- **Chamfer vs Corner:** Chamfer is fake geometry — only normal + material change, cheap, breaks 90° feeling via normal bending 45deg or spherical mix, plus AO darken + trim polish highlight. Corner is true geometry — ray-circle intersection replaces wall hit distance, silhouette actually curves, intrudes into air space (not extrudes), requires outer convex vs inner concave neighbor check. Intent: both needed, first for baseboard/cove visual richness, second for silhouette.
- **AO per-light influence:** If AO multiplies all lighting including sun that comes from far, mortar never sees sun — black grid. Real AO affects ambient most, direct lights partially. Hence low sun 0.25 point 0.35 ambient 1.0.
- **Dedicated configs:** Flat config hides tuning. Each visual domain needs own file so editor can track and agent can iterate without merge conflicts. Required to be fair — agent must discover all tuning knobs without reading shader source blindly.
- **Font loading:** Parchment map aesthetic depends on Pixelify Sans, but Google Fonts loads async. If canvas rendered before font ready, fallback Georgia renders and never updates — looks wrong. Must await `document.fonts.load` + `ready` + 50ms before first draw.
- **Generator retry:** Dungeon generation is random greedy placement with overlap rejection. Occasional failure is expected, not exceptional. A single failure should not crash init — retry loop with random seeds makes system resilient and fair for testing.

This spec now matches the shipped `a5fa90f` branch exactly — no hidden requirements, all tuning ranges documented, all toggles enumerated, artifacts and their prevention explained without spelling exact GLSL lines.
