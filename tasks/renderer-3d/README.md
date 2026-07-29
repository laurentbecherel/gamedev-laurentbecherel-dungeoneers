# Task: renderer-3d

## Description

First-person 3D rendering subsystem for Dungeoneers — **Task 3 Complete Edition**, merging original Tasks 3 (renderer-gpu-core), 5 (materials-pbr-system), and 6 (lighting-particles) into one coherent deliverable plus advanced geometry detailing that proved essential for visual quality.

This task transforms Task 2's top-down 2D minimap into an immersive WebGL2 raycast renderer. It is where Dungeoneers stops being a map viewer and becomes a playable dungeon crawler: WASD moves through corridors, QE turns, walls rise with procedural brick PBR materials and POM depth extrusion, floor stone slabs show 4-sided pillowed normals, your torch illuminates surroundings with GGX BRDF response, shadow raymarching, exponential squared fog, and palette quantization. Minimap remains as M-key fullscreen parchment overlay.

**Why beyond basic PBR:**
- Flat triplanar 90-degree corners still feel like math — requires **chamfer bevels** (fake geometry via normal bending + AO + trim highlight) breaking grid feeling via baseboard/cove + vertical edges.
- Sharp silhouette still artificial — requires **true geometry intruding rounded corners** via ray-circle intersection (outer convex + inner concave) via `isWallCell` neighbor checks, changing silhouette not just shading.
- Production artifacts forced 4 major hardening passes: POM floating floor fixed by centered reference plane at 0.5, vertical streaks at grazing fixed by minViewZ/minEff clamping + maxOffset cap + fade, shadow acne grid speckles fixed by snapping bias to dominant-axis geometric normal, AO black mortar fixed by softening grout 0.78 face 0.92 + per-light influence via `mix(1,ao,affect)`.

**Config architecture:**
Single flat main.json collapsed — now 16 dedicated editor-tracked JSONs under subfolders `rendering/ (rendering, palette, pom, pbr, ao, raymarch, materials-proc)`, `lighting/ (lighting, shadows, fog)`, `geometry/ (chamfer, corners)`, `gameplay/ (generator, player)`, `ui/ (map, debug)`. Server recursively walks `src/assets/config/`, allows slash in category, `config.js` maps logical names via `CONFIG_PATHS` (nested first flat fallback) + batch loader `getAllRenderConfigs`, Game merges with backward-compatible fallback chain, Editor renders hierarchical tree with depth padding.

See [instruction.md](./instruction.md) for the full fair spec (now 351 lines, complete, non-ambiguous, training-ready).

## Implementation Summary

Built iteratively across 17 commits beyond `origin/main` (`f3e6b0c` → `a5fa90f`):

- **Project Structure:** `render/renderer-gpu.js, shaders.js, gl-utils.js, map-upload.js, map-ui.js (parchment restore), palette.js`, `world/materials.js`, `core/game.js` Game orchestrator, `entities/player.js` + `systems/input.js`, `assets/config/` nested, `config/config.js` CONFIG_PATHS + getAllRenderConfigs, `server/server.js` recursive walkJsonFiles + safeCategory slash + favicon 204.
- **Procedural PBR Atlases (`materials.js`):** CPU generation 64x64 per material, 12 WebGL textures NEAREST, 6 maps per material albedo/height/normal/roughMetalAO, brick running bond mortar grooves dome bulge 0.28*ds + hash jitter + crackAmount, slab pillowed dome per 8x8 0.22*ds beveled edges, normal from Sobel with strength, RMA packing R=rough textured variation `baseRough + per-brick jitter*roughnessVariation + micro + -dome*0.18 + groutAdd` 151-234 not flat 217 (fix `||` bug), G=metal 0, B=emissive black, A=AO softened grout 0.78 face 0.92 domeBoost 0.08 min 0.70 boost 0.6 + micro jitter. Deterministic seed, atlasUvX, forcedCount 1 single-material lock per Task3 to avoid CLAMP_TO_EDGE streaks.
- **GPURenderer (`renderer-gpu.js`):** WebGL2 context alpha:false antialias:false, compiles 3 programs raycast + quantize + UI, fullscreen quad VAOs, generates atlases `slice(0,1)` + proc config, uploads mapTex/matTex via map-upload, paletteTex 256x1 via genPalette, LUT 1024x32 via buildRGBToPal, sceneTex+FBO for quan pass, mapUITex, caches ~50 uniform locations including +27 extended (pom clamping minVz/minEff/maxOffset/fade, shadow biasN/dirFactor/sunFactor/pointFactor/sunMax/pointEps/normalThresh, pbr emissive albedMul/strengthMul/F0/attenQuad/GGXEps, rendering floorMul/ceilMul/wallDarken/eyeFactor, chamfer trim ranges, corner bandNear/FarFactor/FarExtra/sectorThresh/normalMix/albedoBoost/roughMul/aoMul), resolves toggles from dedicated via `_resolveToggles`/`_resolveConfigValue` fallback chain `pom.enabled → rendering.pom.enabled → renderer.pom.enabled`, state fields authentic true paletteStyle doom bandLevels 32 gridDebug 0 lighting 1 pbr 1 pom 1 fog 1 pbrDebug 0 chamfer 1 corner 1, methods set*/toggle* xor 1 return new value cyclePBRDebug 0..8 mod9, uploadMap, renderMapUI stores pending with size/opacity/position, _renderUIPass blend SRC_ALPHA ONE_MINUS_SRC_ALPHA fullscreen or corner quad via UI shader, render binds FBO clears sets all uniforms from player._cfg || _cfgCache.
- **GLSL Shaders (`shaders.js` ~800+ lines):** vs quad, fs DDA raycaster: uniforms core + extended, helpers `isWallCell` texelFetch R*255>0.5, `nearestWallDistAndNormal` 4 neighbors best dist+normal, `isOuterConvex` `!E && !W2 && !D`, `isInnerConcave` `!E && W2 && D`, `rayCircleHit` quadratic disc, `atlasUV` `(matId-1+uv.x)/(atlasW/texS)`, `decodeNormal`, `traceRay` DDA 64 steps perp via side, GGX `DistributionGGX/GeometrySchlickGGX/GeometrySmith/fresnelSchlick`, `pomOffset` centered `curUV = uv - 0.5*fullOffset` march +delta with grazing safety vzAbs < minVz 0.08 return 0, effVz clamp 0.18, maxOffset 0.10 cap, fade 0.08-0.22, `debugShowPBR` switch 1..8 albedo/normalRaw/worldN/height/rough/metal/AO/emissive, `pbrShade` AO per-light `mix(1,ao,affect)` + shadow bias snapped dominant axis threshold 0.02 normalOffset 0.10 dirOffset 0.06 sunFactor 0.25 point 0.15 sunMax 20 pointEps 0.1 + GGX vs diffuse-only. Per-fragment: cameraX = 2*frag.x/res.x-1 planeLen tan(fov*0.5) ray, DDA 64 steps, perpDist via side, hitPos = playerPos+ray*perpDist, true intruding rounded corners detection 2 candidates per side dy/dx > radius+bandNear skip, classify outer/inner, compute circle center C0+dirSign*radius dirSign toward cell center, rayCircleHit tCand within [perpDist-bandNear, perpDist+radius*bandFarFactor+bandFarExtra] >0.01, sector offP*dirSign > sectorThresh reject, replace perpDist = tCand hitPos new cornerNormal normalize(offP) hasCornerRound flag. Wall UV fract flip if ray dir, optional authentic fixed-point truncation floor(wallU*64*65536)/65536/64, atlasUV, build TBN Ngeom per side tangent bitangent Z worldPos viewDir viewTS. POM offset, sample albedo/normal/height/rma, if corner round mix Nw with cornerNormal mix(Nw,cn,normalMix 0.92) albedo+=albedoBoost 0.05 rough*=roughMul 0.82 AO*=aoMul 0.96. Chamfer floor bevel wallV < floorSize 0.30 / ceil 0.24 bend toward up/down normalize(Ngeom+up) or spherical mix if roundCorners, AO mix(darken 0.55,1,smoothstep(0,creviceEnd 0.12,t)), trim highlight smoothstep(tStart 0.08,0.32,t)*(1-smoothstep(0.32,1,t))*floorStrength 0.22 added to albedo rough mix 0.58-1. Vertical bevel edgeU=min(wallU,1-wallU)<wallSize 0.28 diagonal normal normalize(Ngeom+n2) Ao darken blend 0.12 highlight. Grid debug wall red floor green ceil blue with grid lines, PBR debug bypass fog/banding, PBR shade with wallDarken 0.85, floor/ceiling ray-plane intersection dist = (eyeZ - floorH)/(vNorm-horizon)..., floorWorld, fract UV, POM, albedo* floorMul 0.7 ceil 0.8, chamfer floor/ceiling via nearestWallDistAndNormal.
- **Fog:** exponential squared `fog = 1/(1+dist*base+dist*dist*squared)` base 0.06 squared 0.005 color [0.05,0.05,0.08] presets off/light/default/heavy, enabled toggle key5 via u_fogEnabled.
- **AO influence:** baked AO alpha, mix per light type sun 0.25 point 0.35 ambient 1.0 prevents black corners losing all light.
- **Lighting:** lighting.json ambient level 0.36 color [1,1,1] worldMul 0.38 sun intensity 1.5 dir [-0.55,-0.45,-0.7] Lsun=-normalize dir XY primary for 2D shadow trace, player torch intensity 1.8 radius 4.5 color [1,0.9,0.7] height 0.45 torchColors warm/cool/green/purple, shadows.json biasN 0.10 dir 0.06 sunFactor 0.25 point 0.15 maxDist20 eps0.1 dda64 threshold0.02.
- **Chamfer:** chamfer.json enabled true size floor0.3 ceil0.24 wall0.28 cornerRadius0.22 shading darken0.55 roundCorners false floorToWallBlend0.92 wallToWallBlend0.88 affectRoughness0.35 trim floor0.22 ceil0.18 wall0.16 floorAlt0.18 ceilAlt0.14 ranges creviceEnd0.12 creviceSmoothEnd0.3 trimStart0.08 trimMid0.35 trimEnd1 debug Key7.
- **Corners:** corners.json enabled true radius0.15 clamp min0.02 max0.45 mode2 modes 0 bevel flat 45deg diag 1 round outer only 2 round all outer+inner default inner true search bandNear0.08 bandFarFactor2 bandFarExtra0.15 sectorThreshold0.02 shading normalMix0.92 albedoBoost0.05 roughnessMul0.82 aoMul0.96 debug Key8.
- **Palette:** palette.json authentic true style doom bandLevels 32 clamp 8-64 styles doom id0 brown ramp + smooth256 truecolor grayscale sepia quantization lutSize r32 g32 b32 paletteTexSize256 banding enabled note when authentic floor(color*bandLevels)/bandLevels.
- **Player:** player.js spawn setPosition, setConfig reads playerCfg, update WASD forward/back/strafe QE turn slide collision tries full then X-only Y-only checks 3x3 wall cells dist < radius 0.28 configurable collision.radius, getPosition getAngle getLightSource torch at eye height warm color height 0.45.
- **Game orchestration:** core/game.js Game class _mergeConfigs merges 16 dedicated + legacy aliases generator/fog/rendering/palette/pom/pbr/ao/lighting/shadows/chamfer/corners/raymarch/map/materialsProc/playerCfg/debug/items/torchColors/boundaryWallId/renderer/pbr/lights/player/ui/materialProc with defaults, _loadAllConfigs getConfig+getAllRenderConfigs, _loadMapFont Pixelify Sans googleName `Pixelify+Sans:wght@400;600;700` family fallback Georgia creates link map-font href `https://fonts.googleapis.com/css2?family=${googleName}&display=swap` awaits onload + document.fonts.load 12px regular bold 12px 10px bold16px + fonts.ready +50ms warn fallback, init retry maxAttempts 5 random seeds Math.floor(Math.random()*1e6) generateDungeon logs seed w*h rooms warn retry throw lastErr, GPURenderer init, Player at start+0.5 angle -PI/2 setConfig, Input, UI setDungeon, hide hud, _resize baseWidth/baseHeight scale min(vw/baseW,vh/baseH) canvas.style, listeners resize keydown, regen 3 attempts reload configs generate uploadMap setPosition setConfig ui setDungeon, _loop dt min0.05 (time-last)/1000 if ready input.update player.update showMap ? ui.drawMap + renderMapOnly : render time/1000 RAF, _onKeyDown R regen M showMap toggle, 1 gridDebug `ON (floor green / wall red / ceil blue)`, 2 lighting `ON/OFF (flat albedo)`, 3 PBR, 4 POM, 5 fog, 6 cyclePBRDebug names[OFF/Albedo/Normal raw/World Normal/Height/Rough/Metal/AO/Emissive] (v), 7 chamfer `ON (floor/ceil baseboard + vertical edges) / OFF (sharp 90°)`, 8 corner `ON (rounded intruding r=0.15 outer+inner) / OFF`, _showHud msg display block clearTimeout timer debug.hud.timeoutMs 1500.
- **Map UI restoration:** render/map-ui.js Canvas2D MinimapRenderer rounded rooms calcLayout w-40 oy+20 fix swatch overwrite bug filling border at alpha80 over swatch restore fillText legend labels stair arrows ▲▼, map.json fully configurable colors parchment roles materials layout legendHeight60 gap16 padding40 grid minCell2 stair sizeFactor1.2 minSize6 strokeFactor0.12 playerDot minRad3 sizeFactor0.5 legend swatch12 gap8 itemWidth90 panelAlpha220 borderAlpha220.
- **Generator lock:** generator.js forces wallMat/floorMat/ceilMat=1 stairMat=1, themes.js + themes.json pools [{id:1,weight:1}], renderer slice(0,1), materials.js min(1) single-tile clamping per spec, grid uniq IDs [0,1] only avoids CLAMP_TO_EDGE streaks that produced constant-U horizontal streaks with ID2.

## How to verify

**Prerequisites:** Node.js v18+, modern browser, `npm install && npx playwright install` in `src/`.

```bash
cd src
npm start # http://localhost:8000
```

- Landing: http://localhost:8000/
- Game: http://localhost:8000/game.html — first-person 3D walkable WASD+QE, walls brick POM depth extrusion centered mid-grey grout intrudes pave extrudes grazing-clamped no vertical streaks, floor/ceiling 4-sided pillowed normals, roughness textured variation rough 0.59-0.91 not flat 217, AO softened 0.698-0.784 not 0.41 grout black grid, PBR GGX warm torch with shadows no acne grid speckles (bias snapped dominant axis 0.10N+0.06 dir) and fog ~76% visibility at 4m base0.06 sq0.005, chamfer visible baseboard floor 0.30 ceil 0.24 wall 0.28 AO darken + trim highlight catching point light key7, true rounded corners intruding radius0.15 outer+inner silhouette key8, palette doom 256 colors LUT bandLevels32 authentic toggle.
- Toggles: 1 grid debug floor green wall red ceil blue, 2 lighting OFF=flat albedo, 3 PBR OFF=diffuse only, 4 POM OFF, 5 fog OFF, 6 cycle PBR debug 0 OFF 1 Albedo 2 Normal raw 3 World Normal 4 Height 5 Rough 6 Metal 7 AO 8 Emissive, 7 chamfer, 8 corner, R regen robust retry 3-5 attempts random seeds, M fullscreen parchment map overlay opaque correct colors alignment Pixelify Sans legend labels stair arrows ▲▼ opacity0.92.
- Editor: http://localhost:8000/editor.html — hierarchical tree rendering: `rendering/` 7 files, `lighting/` 3, `geometry/` 2, `gameplay/` 2, `ui/` 2, depth padding, hides _readme, raw + visual tabs, save persists via recursive API `/api/assets/<nested>/<name>` with slash allowed, favicon 204.

```bash
cd src
npm run test:unit # 88 tests — materials roughness variation, AO softened, 4-sided, single lock, renderer 27+ uniforms, POM centered+grazing, shadow snap bias, chamfer/corners helpers, fog gating, AO per-light, PBR debug, palette, nested configs CONFIG_PATHS/getAllRenderConfigs recursive walk safeCategory slash favicon 204, generator robustness + single lock themes lock, server nested API etc.
npm run test:e2e # 39 tests — game loads WebGL2 640x360, 3D non-black pixels, WASD/QE changes, R regen, M fullscreen parchment opacity, toggles 1..8 no console errors, PBR debug cycle HUD, fog base0.06 presets, chamfer floor0.30 ceil0.24 wall0.28, corners radius0.15 mode2 inner true, POM centered 0.5 clamping, shadows bias 0.10/0.06 DDA64, AO affect 0.25/0.35/1.0 grout0.78 face0.92, palette doom band32, map parchment #e8dcc4/#ddd0b8 Pixelify Sans family fallback Georgia display fullscreen opacity0.92 swatch12 gap8, generator lock boundary1 roomAttempts200 uniq [0,1], favicon 204 tolerant, no console errors, back home link, editor hierarchical 16 dedicated configs visible editable pom ref plane clamping fog/shadows/chamfer/corners/map/ao/pbr/main v3 minimal _readme save roundtrip nested pom walls legacy padding depth, landing.
npm test # full 127 passing
```

## Avocado vs Claude Performance

TBD — task not yet implemented via one-shot comparison.

Once golden feature built, one-shot `instruction.md` (Complete Edition) with BOTH Avocado (1P) and Claude (3P) separately and record findings here. Do NOT commit code from one-shots.

| Evaluation | Claude | Avocado | Track opportunity |
| --- | --- | --- | --- |
| Success | TBD | TBD | TBD |
| Approach | TBD | TBD | TBD |
| Strengths | TBD | TBD | TBD |
| Weaknesses | TBD | TBD | TBD |

**Anticipated differences (based on manual build):**
- Avocado likely succeeds but may miss grazing clamp (vertical streaks) or shadow dominant-axis snap (acne grid) — requires reasoning about DDA self-intersection not just normal perturbation.
- Claude may produce rasterizer not raycaster if spec ambiguous — hence spec now explicitly requires DDA + texelFetch mapTex + 64 steps.
- Both may forget centered POM reference (floating floor) — spec now documents mid-grey 0.5 zero displacement.
- Chamfer vs corners confusion: fake (normal bending) vs true (ray-circle) distinction critical — spec clarifies silhouette vs shading.

## Human-Tuned Areas

- **Dedicated nested configs:** Split 17 flat JSONs into subfolders with recursive server walk, CONFIG_PATHS fallback, getAllRenderConfigs merge, hierarchical editor tree — enables tuning without shader edits.
- **POM production hardening:** Centered reference plane `uv -0.5*fullOffset` at 128 to prevent global floor elevation; grazing clamp `vzAbs<0.08 return 0`, effVz clamp 0.18, maxOffset 0.10 cap, fade 0.08-0.22 to flat rather than streaking; old bug `CLAMP_TO_EDGE` smearing border as black vertical lines down corridor.
- **Shadow acne elimination:** Bias previously used perturbed normal-mapped normal *0.04 causing per-pixel DDA path divergence — mortar grooves re-hit own wall cell as shadow visible as black brick-grid speckles. Fix snap to dominant geometric axis + 0.10N +0.06 dir forward + correct perp via tracked side + 64 iterations. Configurable via `shadows.json`.
- **Material realism:** 4-sided floor/ceiling normals pillowed dome per 8x8 + deeper grout 0.28 vs 0.5+dome AO follows dome, fix `sni=si*3 → si*4` corrupted normals, restore wall TBN + full wall POM, pomOffset `+= delta` not `-=` → pavé extruded outward grout low 0.08-0.28 brick high 0.6-0.8 matches mygame reference, textured roughness variation per-brick hash jitter + micro + dome polish, soften AO grout 0.78 face 0.92 domeBoost 0.08 aoMin 0.70 boost 0.6 perBrick + micro jitter, add AO per-light influence.
- **Chamfer bevels:** Visible configurable enlargement floor 0.12→0.30 ceil 0.10→0.24 wall 0.14→0.28 cornerRadius 0.22 darken 0.55 blend 0.92/0.88 roughness 0.35, helpers `isWallCell` texelFetch + `nearestWallDistAndNormal` distance+normal, horizontal bevel where wallV<floorSize or 1-wallV<ceilSize mix Ngeom toward up/down 45deg flat or spherical smoothstep when roundCorners, AO mix darken first 12%, trim albedo +0.22/+0.18 rough 0.58 polish catches point light, vertical bevel every cell edge edgeU=min(wallU,1-wallU)<wallSize no longer skips interior concave corners: n2 perpendicular + Ngeom diagonal, AO darken 0.88* highlight. Runtime chamferEnabled && configEnabled not overwritten each frame.
- **True rounded corners:** Intruding (not extruding) for outer+inner, circle center offset by radius along dirSign toward cell center, rayCircleHit quadratic disc sqrt, tCand within bandNear 0.08 bandFar radius*2+0.15, sector offP*dirSign >0.02 reject wrong quadrant, mode 0 bevel flat 45° diagonal normalize(Ngeom+n2), 1 round outer only, 2 round all outer+inner default inner true, shading normalMix 0.92 albedoBoost 0.05 roughMul 0.82 aoMul 0.96.
- **Fog dédié:** Extract to fog.json tuned defaults base0.06 squared0.005 replacing heavy 0.18/0.025 now ~76% visibility at 4m vs ~46% before presets off/light/default/heavy, remove fogBase/fogSquared/fogColor from main.json lights block, add getFogConfigSync/saveFogConfig, u_fogEnabled uniform gate, key5 toggle.
- **Parchment map restoration:** Restore Task2 MinimapRenderer Canvas2D path rounded rooms correct calcLayout w-40 oy+20 fix swatch color overwrite bug filling border at alpha80 over swatch restore fillText legend labels stair arrows ▲▼, map.json font config Pixelify Sans / Georgia fallback, game.js dynamic Google Font loading _loadMapFont awaiting document.fonts.load before first map render.
- **Generator robustness + init retry + favicon 404:** roomAttempts 200 inner tries 5-6 size variants wider search 14+sizeTry*3 tolerant skip <4 main rooms to avoid Failed to place main path room 1 on unlucky seed, Game.init retries 5 times random seeds like regen logs warning not crash, server returns 204 for /favicon.ico to avoid console noise. Map overlay stays opaque restored correct colors alignment Pixelify Sans labels.
- **Single-material lock for Task3:** Generator forced wallMat/floorMat/ceilMat=1 stairMat=1 restore hx declaration that was accidentally removed causing hx not defined crash, themes.js + themes.json pools [{id:1,weight:1}], renderer slice(0,1) clarifying comment, materials.js min(1) single-tile clamping per spec verified grid uniq [0,1] only unit 38 pass.

## Screenshots

Screenshots captured via Playwright on `a5fa90f` branch (WebGL2). All debug toggles 1..8 + PBR debug 0..8 must be visually documented for fairness — training agent needs to see expected output per state.

### Core 3D + Map

![First-person 3D dungeon with PBR brick POM depth](./screenshots/game-3d.png)
*Default ON (all toggles ON): procedural brick walls POM extrusion centered mid-grey grout intrudes pave extrudes grazing-clamped no streaks, stone slab floor 4-sided pillowed normals, roughness textured 0.59-0.91, AO softened 0.698-0.784, PBR GGX warm torch [1,0.9,0.7] intensity 1.8 radius 4.5 + sun + shadow bias snapped dominant axis 0.10/0.06 DDA64 no acne grid + fog exponential base0.06 sq0.005 ~76% vis at 4m + chamfer ON 0.30/0.24/0.28 + corners ON radius0.15 outer+inner silhouette.*

![Fullscreen parchment map overlay with Pixelify Sans](./screenshots/game-minimap-overlay.png)
*Fullscreen map overlay M: WebGL parchment 640x360 opacity 0.92 + Canvas2D rounded rooms correct calcLayout w-40 oy+20 swatch overwrite fix legend fillText stair arrows ▲▼ colors wallDark #2a2a2a gold #c9a84c player [15,220,15] font Pixelify Sans Google Fonts + document.fonts.load fallback Georgia.*

### Debug toggles 1..8 — each variant

![Grid debug RGB](./screenshots/game-grid-debug.png)
*Key 1 Grid Debug ON: floor solid green with grid lines fract floorWorld>0.97 highlight 0.9 vs 0.25, wall red, ceil blue, AO 1 emissive 0 bypass PBR. Validates wall-floor-ceiling alignment exact 0.0/1.0 no overshoot pixel-perfect corners. HUD: Grid debug ON (floor green / wall red / ceil blue).*

![Lighting OFF flat albedo](./screenshots/game-debug-lighting-off.png)
*Key 2 Lighting OFF: flat albedo only early return in pbrShade. Isolates lighting-only bugs e.g., shadow acne speckles gone when OFF. HUD Lighting OFF (flat albedo).*
![Lighting ON](./screenshots/game-debug-lighting-on.png)
*Key 2 Lighting ON: full PBR ambient+sun+point+shadows+AO. Comparison to OFF shows diffuse contribution.*

![PBR OFF diffuse only](./screenshots/game-debug-pbr-off.png)
*Key 3 PBR OFF: Lambert diffuse only NdotL with shadows + ambient, no GGX specular. Shows specular contribution. HUD PBR OFF (diffuse only).*
![PBR ON](./screenshots/game-debug-pbr-on.png)
*Key 3 PBR ON: full GGX Cook-Torrance DistributionGGX GeometrySmith fresnel F0 0.04 mixed by metal, attenuation quadratic 0.25.*

![POM OFF](./screenshots/game-debug-pom-off.png)
*Key 4 POM OFF: zero offset uvPOM=uvAtlas, flat brick. Shows POM depth contribution. HUD POM OFF.*
![POM ON](./screenshots/game-debug-pom-on.png)
*Key 4 POM ON: 8-step raymarch into height map centered ref `curUV = uv -0.5*fullOffset` mid-grey 0.5 zero displacement. HUD POM ON.*

![Fog OFF](./screenshots/game-debug-fog-off.png)
*Key 5 Fog OFF: bypass `u_fogEnabled` gating, no exponential mix. Shows fog density contribution. HUD Fog OFF.*
![Fog ON](./screenshots/game-debug-fog-on.png)
*Key 5 Fog ON: `fog=1/(1+dist*0.06+dist^2*0.005)` final*=fog+fogColor*(1-fog) presets off/light/default/heavy.*

![PBR Debug OFF](./screenshots/game-debug-pbr-debug-off.png)
*Key 6 PBR Debug OFF mode 0: normal PBR path with fog/banding. HUD PBR Debug OFF (0).*

![PBR Debug Albedo](./screenshots/game-debug-pbr-albedo.png)
*Key 6 mode 1 Albedo: raw albedo texture without lighting, shows brick pattern color jitter.*
![PBR Debug Normal raw](./screenshots/game-debug-pbr-normal-raw.png)
*Key 6 mode 2 Normal raw: encoded normal raw RGB TS, shows Sobel gradient from height, validates fix sni*4 not *3.*
![PBR Debug World Normal](./screenshots/game-debug-pbr-world-normal.png)
*Key 6 mode 3 World Normal: world-space Nw*0.5+0.5, shows 4-sided floor/ceiling pillowed normals + TBN wall.*
![PBR Debug Height](./screenshots/game-debug-pbr-height.png)
*Key 6 mode 4 Height: height map vec3(heightVal), grout low 0.08-0.28 brick high 0.6-0.8, validates centered ref 0.5 mid.*
![PBR Debug Rough](./screenshots/game-debug-pbr-rough.png)
*Key 6 mode 5 Rough: rma.r roughness textured variation 151-234 0.59-0.91 not flat 217, groutRoughAdd + dome polish -0.18.*
![PBR Debug Metal](./screenshots/game-debug-pbr-metal.png)
*Key 6 mode 6 Metal: rma.g metal channel 0 for Task3, validates packing.*
![PBR Debug AO](./screenshots/game-debug-pbr-ao.png)
*Key 6 mode 7 AO: rma.a AO baked softened 0.70 min grout 0.78 face 0.92 domeBoost 0.08, not black grid 0.41 old, validates softened.*
![PBR Debug Emissive](./screenshots/game-debug-pbr-emissive.png)
*Key 6 mode 8 Emissive: black for Task3, validates B channel.*

![Chamfer ON baseboard + vertical](./screenshots/game-debug-chamfer-on.png)
*Key 7 Chamfer ON: fake geometry via normal bending isWallCell+nearestWallDistAndNormal floorSize0.30 ceil0.24 wallSize0.28 darken0.55 blend0.92/0.88 roughness0.35 trim floor0.22 ceil0.18 wall0.16 + highlight band catching point light, breaks 90° grid feeling. HUD Chamfer ON (floor/ceil baseboard + vertical edges).*
![Chamfer OFF sharp 90°](./screenshots/game-debug-chamfer-off.png)
*Key 7 Chamfer OFF: sharp 90° wall-floor-ceiling, no bevel. Comparison shows baseboard missing. HUD Chamfer OFF (sharp 90°).*

![Corner ON rounded intruding](./screenshots/game-debug-corner-on.png)
*Key 8 Corner ON: true intruding rounded corners via rayCircleHit outer convex !E&&!W2&&!D + inner concave !E&&W2&&D radius0.15 clamp0.02-0.45 mode2 all outer+inner search bandNear0.08 bandFarFactor2 bandFarExtra0.15 sectorThresh0.02 normalMix0.92 albedoBoost0.05 roughMul0.82 aoMul0.96, silhouette actually curves intrudes into air. HUD Corner ON (rounded intruding r=0.15 outer+inner).*
![Corner OFF sharp 90°](./screenshots/game-debug-corner-off.png)
*Key 8 Corner OFF: sharp 90° silhouette, no circle intersection. HUD OFF.*
![Sharp 90° combined chamfer+corner OFF](./screenshots/game-debug-sharp-90.png)
*Combined Key7 OFF + Key8 OFF: pure sharp 90° grid, no fake or true bevels, shows baseline before detailing — validates necessity of chamfer+corner.*

### Editor configs hierarchical

![Editor hierarchical tree with rendering configs](./screenshots/editor-rendering-config.png)
*Editor hierarchical tree — assets/ root, config/rendering 7 files lighting 3 geometry 2 gameplay 2 ui 2, padding by depth, hides _readme, visual + raw tabs, server recursive walkJsonFiles safeCategory slash allowed API /api/assets/<nested>/<name> getAllRenderConfigs batch.*

![POM config centered reference](./screenshots/editor-pom-config.png)
*POM config pom.json enabled strength wall0.06 floor0.07 ceil0.035 steps8 clamping maxOffset0.10 minViewZ0.08 minEff0.18 fading 0.08-0.22 ref plane0.5 centered presets off/subtle/default/deep/extreme.*

![Fog dedicated exponential squared](./screenshots/editor-fog-config.png)
*Fog fog.json enabled base0.06 squared0.005 color [0.05,0.05,0.08] formula fog=1/(1+dist*base+dist^2*sq) presets off/light/default/heavy toggle Key5 u_fogEnabled.*

![Shadows bias dominant-axis snap](./screenshots/editor-shadows-config.png)
*Shadows shadows.json enabled bias traceNormalOffset0.10 dirOffset0.06 note shadowOrigin=worldPos.xy+traceN*normalOffset+dir*dirOffset prevents acne, traceNormal threshold0.02 dominant axis snap, sun shadowFactor0.25 maxDist20 point factor0.15 eps0.1 dda64.*

![PBR config F0 0.04 debug modes](./screenshots/editor-pbr-config.png)
*PBR pbr.json enabled roughness clamp 0.2-0.95 metal 0-1 emissive albedoMul0.8 strengthMul2.5 ggx epsilon0.0001 fresnel F0Dielectric0.04 pointAttenuation quadraticFactor0.25 debug modes[OFF Albedo Normal raw World Normal Height Rough Metal AO Emissive] key6 cycles.*

![AO per-light influence](./screenshots/editor-ao-config.png)
*AO ao.json affect sun0.25 point0.35 ambient1.0 note 0=ignore 1=full via mix(1,ao,affect) material globalStrength0.6 grout0.78 face0.92 domeBoost0.08 min0.70 sampling micro jitter.*

![Chamfer config visible defaults](./screenshots/editor-chamfer-config.png)
*Chamfer chamfer.json enabled size floor0.30 ceil0.24 wall0.28 cornerRadius0.22 shading darken0.55 roundCorners false blend 0.92/0.88 affectRoughness0.35 trim floor0.22 ceil0.18 wall0.16 floorAlt0.18 ceilAlt0.14 ranges creviceEnd0.12 creviceSmoothEnd0.3 trimStart0.08 trimMid0.35 trimEnd1. Key7.*

![Rounded corners config intruding outer+inner](./screenshots/editor-corners-config.png)
*Corners corners.json enabled radius0.15 clamp0.02-0.45 mode2 bevel flat diag / round outer only / round all outer+inner default inner true search bandNear0.08 bandFarFactor2 bandFarExtra0.15 sectorThresh0.02 shading normalMix0.92 albedoBoost0.05 roughMul0.82 aoMul0.96. Key8.*

![Palette quantization Doom](./screenshots/editor-palette-config.png)
*Palette palette.json authentic true paletteStyle doom bandLevels32 clamp8-64 styles doom id0 brown ramp smooth256 truecolor bypass grayscale sepia quantization lutSize 32^3 paletteTexSize256 banding enabled note floor(color*bandLevels)/bandLevels.*

![Map parchment Pixelify Sans](./screenshots/editor-map-config.png)
*Map map.json font family Pixelify Sans fallback Georgia googleName Pixelify+Sans:wght@400;600;700 note parchment aesthetic display fullscreen size640 opacity0.92 parchment bg #e8dcc4 scan #ddd0b8 alpha0.92 colors gold #c9a84c roles treasure etc materials wall1 #4a4a4a layout legendHeight60 gap16 padding40 grid minCell2 stair sizeFactor1.2 minSize6 playerDot minRad3 swatch12 gap8.*

![Debug keys 1..8 R M](./screenshots/editor-debug-config.png)
*Debug debug.json keys 1 grid debug floor green wall red ceil blue, 2 lighting, 3 PBR diffuse vs GGX, 4 POM, 5 Fog, 6 cycle PBR debug OFF Albedo Normal raw World Normal Height Rough Metal AO Emissive, 7 chamfer baseboard+vertical, 8 corner intruding rounded, R regen dungeon maxAttempts3, M toggle fullscreen map, hud timeout1500 overlay scaleRefW640 H360.*

All referenced from [task.toml](./task.toml) screenshots array (35+). Captures prove each debug toggle variant and config domain.

## Videos

Do not commit video files. Upload to **PixelCloud** and reference links here and in task.toml (`videos`, `teaser` — teaser ~10 sec highlight).

- Gameplay 3D walkthrough with toggles 1..8: TBD (capture WASD movement, M fullscreen map, R regen robust, chamfer key7, corners key8, PBR debug key6 cycle, fog key5, grid key1)
- Teaser ~10 sec highlight: TBD (first-person corridor, torch flicker, fog, rounded corners silhouette, parchment map overlay)

## Trajectories

Golden implementation built iteratively across 17 commits on branch `task3` (`2da1de8` → `a5fa90f`):

- `2da1de8` Fix unit grid: walls 1m anchored floor flat floor/ceiling 0/1 disable POM add toggle shortcuts 1=grid RGB 2=lighting 3=PBR 4=POM
- `4e14a2d` Fix Task 3 regression: wire up Game class bootstrap 82-line Task2 IIFE → 14-line Game replacing MinimapRenderer with GPURenderer WebGL2 raycaster PBR palette sun lighting
- `61f51d2` Restore PBR materials as default grid debug on toggle
- `9ed03f2` Fix wall-floor-ceiling alignment exact 0.0/1.0 no overshoot pixel-perfect corners
- `f2d2493` Extract fog to dedicated config with debug toggle key5
- `a8254c0` fix 4-sided floor/ceiling normals + inverted POM + wall TBN + restore PBR debug key6
- `9a6385c` fix center POM reference plane at 128 to prevent global floor elevation
- `c3f1c09` fix lock generator to single material ID 1 for Task3 slice(0,1) themes [{id:1,weight:1}] atlas uniq [0,1] only fix CLAMP streaks
- `7f3a340` fix eliminate shadow acne artifacts on brick walls snap bias dominant axis 0.10N+0.06 dir correct perp side DDA 32→64
- `66e36dd` fix clamp POM at grazing to remove vertical streak maxOffset0.10 minVz0.08 minEff0.18 fade0.08-0.22
- `e588c0b` fix enable POM by default load from config
- `18beb50` fix soften AO texture roughness configurable AO light influence affectSun0.25 affectPoint0.35 affectAmbient1.0 base rough variation groutAdd etc
- `5c496a6` feat add visible configurable chamfer bevels floor-wall wall-wall toggle key7 normal-bending AO rough trim highlight
- `92347f8` feat add true geometry rounded corners intruding outer+inner toggle key8 rayCircleHit isOuterConvex isInnerConcave
- `919641f` refactor dedicated editor-tracked configs for AO/PBR/POM/shadows/chamfer/corners + subfolders recursive walkJsonFiles safeCategory slash CONFIG_PATHS getAllRenderConfigs hierarchical tree hides _readme +27 uniforms
- `bfea435` fix restore parchment map overlay correct colors alignment text labels Pixelify Sans font loading via Google Fonts + document.fonts.load
- `a5fa90f` fix generator robustness init retry favicon 404 roomAttempts200 size variants search radius 14+sizeTry*3 tolerant skip<4 init retry 5 random seeds favicon 204 map overlay stays opaque

Gold build trajectory: manual iterative with Avocado Code CLI, not one-shot.

## Tag reference

`task.toml` uses controlled vocabularies:

**game-tags:** RPG/adventure/story · Arcade/action · 3D/VR scene-like · Puzzle/board/card · Simulation/management · Sports/racing/vehicle · Casual/avatar/decor · Educational/serious · Interactive scene/cinematic · Other game/unclear
*This task uses RPG/adventure/story, Arcade/action, 3D/VR scene-like — first-person dungeon crawler.*

**tech-stack-tags:** Web JS/DOM · WebGL2 · GLSL · Vanilla JS canvas · Three.js/WebGL · Phaser · Pixi.js · Godot · Unity · Other
*This task uses Web JS/DOM, WebGL2, GLSL, Vanilla JS canvas — custom vanilla ES modules + Node HTTP server, no engine framework.*

**assets-used:** primitives · procedural
*Uses primitives (grid map, fullscreen quad) + procedural (PBR atlases CPU-generated 64x64 brick/slab dome + AO + roughness variation, palette LUT 32^3 Doom-like brown ramp).*

**harness:** Metacode

**screenshots:** relative paths from task.toml to `screenshots/` folder — must exist and be PNG/JPG crisp.

**videos/teaser:** PixelCloud URLs https://pxl.cl/... short links, not stored in repo.

**commit-hash / base-commit-hash:** git SHAs.

## Deliverables Checklist (per TASK_GUIDELINES.md)

- [x] Task folder `renderer-3d` descriptive kebab-case no date prefix
- [x] `instruction.md` present 351 lines detailed following template, no 3P refs, fair complete non-ambiguous training-ready
- [x] `task.toml` present with all required fields name, instruction, game tags, tech stack, assets, model Muse Spark 1.1, harness Metacode, screenshots array, base-commit-hash task2 complete `257c6e2`, commit-hash task3 setup `e6f6abc` (to be updated to `a5fa90f` on final)
- [x] `README.md` present with description, implementation summary, verify steps, model comparison TBD, human-tuned areas, screenshots inline, videos TBD, trajectories list 17 commits, tag reference
- [x] `screenshots/` folder exists with 36 PNGs covering all debug variants: game-3d.png default ON, game-minimap-overlay.png M fullscreen parchment, game-grid-debug.png key1 RGB, game-debug-lighting-off/on key2 flat albedo, game-debug-pbr-off/on key3 diffuse vs GGX, game-debug-pom-off/on key4, game-debug-fog-off/on key5 exponential squared, game-debug-pbr-debug-off.png + game-debug-pbr-albedo/normal-raw/world-normal/height/rough/metal/ao/emissive.png 8 modes key6 cycle, game-debug-chamfer-off/on key7 baseboard+vertical, game-debug-corner-off/on key8 intruding rounded corners, game-debug-sharp-90 combined sharp, plus 11 editor configs rendering/pom/fog/shadows/pbr/ao/chamfer/corners/palette/map/debug + legacy renderer
- [x] Screenshots referenced in task.toml (36) via relative paths — all exist PNG crisp
- [x] instruction.md has acceptance criteria checklist 20+ items measurable, out-of-scope bounded, running instructions
- [x] task.toml tags appropriate specific RPG/adventure/story Arcade/action 3D/VR scene-like Web JS/DOM WebGL2 GLSL Vanilla JS canvas primitives procedural
- [x] Feature implemented in src/ not task folder, follows prior patterns, no hardcoded magic numbers still in dedicated JSONs, no binaries
- [x] Game runs without console errors related to feature, behavior matches acceptance, screenshots from actual running game via Playwright
- [x] Full test suite 127 passing (88 unit + 39 e2e) `npm test`
