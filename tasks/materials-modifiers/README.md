# Task: Materials Modifiers - Dungeoneers Task 9

## Description

Base PBR materials (brick walls, stone slab floors/ceilings) are clean 64x64 procedural atlases and look uniform across the whole dungeon. This task adds a **material modifier system** that layers smart variations over existing materials: moss, damaged, water wetness, puddle, blood, dust. Each modifier alters albedo, normals, PBR roughness/metal, and POM height, driven by a compiled noise function (hash -> value noise -> FBM) that decides the mask plus material cues (AO, height, roughness) and generator intensity map.

The dungeon generator spreads modifiers according to story, room role, depth, distance-to-wall, and noise variation - deterministic seeded, not uniform.

## Why

- **Lived-in feel:** Clean brick everywhere tells no story. Moss in damp entrance, blood in guardian room, dusty secret, puddles mirroring torch light, water streaks down walls, damaged hub edges make the dungeon read as aged and narrative.
- **PBR coherence:** Modifiers are not just color tint; they change roughness (moss rough +0.36, water glossy -0.46, puddle mirror 0.08), normal (moss lumpy, water flattened, damaged sharp fracture, dust softened) and height (moss spongy +0.22, puddle depressed -0.19, damaged chip -0.20, dust accumulation +0.06) so lighting reacts correctly.
- **Smart masking:** Mask = compiled noise * generator intensity * cue(AO/height/rough + position). Moss loves AO dark grout + low height + wall bottom; puddle loves floor depressions + large blob noise; blood splatter uses radial dots + drag streak; dust accumulates in crevices + ceilings; water shows vertical streaks `noise(worldPos.z*streakScale)`.
- **Story integration:** Entrance moss/water, guardian blood/damage, treasure/secret dust, shrine moss, hub damaged/blood, exit damaged/water via `roleWeights` in config. Per-cell jitter + FBM organic, max 2 modifiers per cell normalized.

## Implementation (gold reference)

**Config - `assets/config/rendering/material-modifiers.json` v1:**

- Top-level `enabled`, `global { noiseOctaves, blendMode: top2_normalized, maxPerCell:2 }`
- `modifiers { moss, damaged, water, puddle, blood, dust }` each with:
  - `enabled`, `albedo` (RGB 0-255), `albedoStrength`, `roughAdd`, `heightAdd`, `normalStrength/Flatten`, `noiseScale`, `threshold`, `softness`, `seed` distinct per modifier, plus specific: moss `albedo2, roughMin/Max`, puddle `roughTarget 0.08, foamBright, rippleScale`, blood `splatterScale, albedo2`, dust `desat, ceilingBoost`, water `streakScale`.
- `generator { roleWeights per role 0..1, distanceToWallFactor, depthFactor, ceilingDustBoost, floorPuddleBoost, decoInfluence }`
- `debug { toggleKey: Key9 }`

**Generator - `world/modifiers.js` new module + integration in `dungeon/generator.js`:**

- `generateModifiers({w,h,rooms,grid,deco,floorHeight,floorToRoom,roleMap,depthArr,seed,config})`:
  - Per-room base: `roleWeights[role][mod]` + depthFactor*(depth-0.5) + perRoom jitter `hash2i(x+ri*19, y+ri*7, seed)` + small rng.
  - Per-cell: `valueNoise2(x*noiseScale, y*noiseScale)` FBM 2 octaves for organic `nMod 0.55+n*0.9`, distance-to-wall `dtwNorm` = 1 at edge vs 0 interior, `wallInfluence = 1+dtw*0.9`, deco bits (`DECO_MOSS=2, ROOTS=64, PUDDLE=32, BROKEN=16`) boost.
  - Puddle floors only: if `grid!=GRID_FLOOR` => 0, else `depression = max(0, -floorHeight[i]+0.02)*3` * bigBlob `fbm(x*0.12, y*0.12)` to shape pools.
  - Blood center bias: more toward room center `1-dtw`, plus hash peaks >0.88 boost *1.6.
  - Dust ceiling boost via `ceilingDustBoost`.
  - Top2 normalization: sort intensities per cell, keep top 2, damp others *0.25 unless >0.55, if top sum >1.2 scale to 1.2 to avoid mud.
  - Deterministic via `hash2i` + seeded rng.
- `packModifierTextures(modData)` packs into 2 RGBA8: texA R=moss G=damaged B=water A=puddle, texB R=blood G=dust, NEAREST, CLAMP.
- Integration: Stage 9b after deco, `dungeon.modifiers = modifierData`. Fallback empty arrays if fails.
- `core/game.js` merges config: `merged["material-modifiers"] = renderCfgs["material-modifiers"]` + `merged.materialModifiers`.

**Renderer - `render/renderer-gpu.js`:**

- Import `createModifierTextures, updateModifierTextures` from `./modifier-map.js`.
- Constructor adds `this.modifiersEnabled=1`.
- Uniform list extended: `u_modEnabled, u_modTexA/B, u_modMapSize, u_modDebugOverlay` plus per-modifier: ~10 uniforms each (enabled, albedo, albedo2, albedoStr, roughAdd, heightAdd, normalStr/Flat, noiseScale, thresh, soft, seed etc) total ~60 new uniforms.
- `init()` after `uploadMapTexture` creates mod textures via `createModifierTextures(gl, dungeon.modifiers)`, stores `modTexA/B` and `modMapSize`, dummy 1x1 if no data.
- `texUnits` includes `u_modTexA:14, u_modTexB:15` (units 0 map, 1-12 atlases, 13 matMap, 14-15 mods).
- `render()` binds textures: `activeTexture 14/15`, `bindTexture modTexA/B`, `uniform1i 14/15`, `uniform2f modMapSize`.
- After corner uploads, adds Task9 block:
  - Resolve `modCfg = cfg["material-modifiers"] || cfg.materialModifiers`, `cfgModEnabled && this.modifiersEnabled` -> `modEnabledUpload`.
  - Per modifier resolve via `getMod(name)` and upload `u_modMossEnabled` etc with `_resolveConfigValue` fallbacks or direct from json (albedo divided by 255 for shader vec3).
  - `toggleModifiers()`, `setModifiersEnabled(v)`, `updateMaterialModifiers(cfg)` live-edit hook updates `_cfgCache` and local enabled.

**Shader - `render/shaders.js`:**

- Uniforms block added after grid chamfer: `u_modEnabled`, samplers `u_modTexA/B`, `u_modMapSize`, per-modifier params (see above).
- Noise compilation:
  ```glsl
  float modHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
  float modNoise(vec2 p){ // value noise 4 hash + smoothstep
    vec2 i=floor(p); vec2 f=fract(p);
    float a=modHash(i); float b=modHash(i+vec2(1,0));
    float c=modHash(i+vec2(0,1)); float d=modHash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float modFBM(vec2 p, float seed, int octaves){ // 2-3 octaves loop freq*=2 amp*=0.5
    float v=0; float amp=0.5; float freq=1; float norm=0;
    for(int i=0;i<4;i++){ if(i>=octaves) break; v+=modNoise(p*freq+vec2(seed*1.7+float(i)*19.3, seed*0.9))*amp; norm+=amp; freq*=2; amp*=0.5; }
    return norm>0 ? v/norm : 0;
  }
  float modMask(float cellInt, float noiseVal, float thresh, float soft){ return cellInt * smoothstep(thresh, thresh+max(soft,0.01), noiseVal); }
  void sampleModCell(vec2 worldXY, out vec4 outA, out vec4 outB){ vec2 cell=floor(worldXY); vec2 uv=(cell+0.5)/u_modMapSize; outA=texture(u_modTexA, uv); outB=texture(u_modTexB, uv); }
  ```
- `applyMaterialModifiers(inout albedo,N,rough,metal,height,ao, worldPos,worldXY,NgeomFlat,isFloor,isCeil,isWall,wallU,wallV)`:
  - samples cell `modA=texture(u_modTexA)`, `modB=texture(u_modTexB)`, intensities `cellMoss=modA.r` etc.
  - early exit if sum <0.015.
  - For each modifier if enabled && cell>0.01:
    - scale=max(noiseScale,0.05), noise=modFBM(wp*scale, seed, octaves)
    - cue from AO `1-smoothstep(0.75,0.98,ao)`, height `1-smoothstep(0.25,0.75,height)`, wall bottom `1-smoothstep(0.0,0.55,wallV)` etc.
    - mask=modMask(cell, noise/threshold/soft)*cue*strength clamped.
    - Alter channels: `albedo=mix`, `rough=mix/target + add`, `height+=delta*mask`, `N=mix toward flat/crack/lump via normalStrength/Flat`, `ao*=mix`.
    - Detailed per modifier as in plan: moss green yellow variance + lump normal + sponge height; damaged darken*desat + chip height -0.20 + crack normal; water darken blue tint + rough min 0.12 + flatten; puddle floors only darken 0.56 + rough target 0.08 mirror + flat+ripple normal + depress -0.19 + foam edge bright; blood red-brown splatter radial+streak + crust height + crust normal; dust beige desat + rough + height accumulation in crevices + flatten.

- Wiring in main(): 5 paths each calls `applyMaterialModifiers` after chamfer/grid:
  - floor hit `floorWorld, floorH_atRay` true floor
  - ceil hit `ceilWorld, ceilH_atRay` true ceil
  - wall `albedoRaw,Nw,rmaW, hitPos,Ngeom,true wall wallU/V`
  - floor fallback `floorWorld,floorH` true floor
  - ceil fallback `ceilWorld,ceilH` true ceil
  - Each wrapped in own block with temp vars to avoid name clash, before `pbrShade`.

**Config system:**
- `CONFIG_PATHS['material-modifiers'] = ['config/rendering/material-modifiers', 'config/material-modifiers', 'config/main']`
- `getAllRenderConfigs()` includes `material-modifiers`.
- `live-config.js` TierMap `'material-modifiers':'T1'` + path overrides `'config/rendering/material-modifiers':'T1'` so live-edit instant uniform.
- `core/game.js` case `'material-modifiers'/'materialModifiers'` calls `renderer.updateMaterialModifiers`.
- Key 9 `Digit9` toggles `renderer.toggleModifiers()` shows HUD.

**Textures:**
- New helper `render/modifier-map.js` creates Uint8 RGBA textures from packed data, NEAREST, CLAMP_TO_EDGE.

## Tests

**Unit (via playwright or node):**

- material-modifiers.json version 1, enabled true, 6 modifiers each enabled bool, albedo array 3 0-255, thresholds 0..1, noiseScale 0.05..2.0, seed int
- shaders.js contains `modHash`, `modNoise`, `modFBM`, `applyMaterialModifiers`, `u_modEnabled`, `u_modTexA/B`, `ao` cue usage, `height` alteration, `rough` alteration
- renderer-gpu.js contains uniform locations for `u_modEnabled` + `u_modMoss` etc, `createModifierTextures`, `modTexA/B` binding units 14/15, `toggleModifiers`
- modifiers.js generates deterministic, roleWeights: guardian blood >0.4 avg, shrine moss >0.2, treasure/secret dust >0.6, entrance water >0.2

**E2E (`npx playwright test`):**

- Game loads WebGL2 canvas non-empty, no console errors, no shader compile failure
- `api/assets/config/rendering/material-modifiers` returns version 1 with 6 keys
- Modifier toggle Key9 (Digit9) works, HUD shows Material Modifiers ON/OFF, clean look when OFF vs modified when ON
- Many lights, sprites, chamfer, corners, fog still work (no regression)
- Playwright screenshots:
  - `screen-moss-wall.png` - wall near floor greenish patches, rougher, lumpy normal under torch
  - `screen-blood-guardian.png` - guardian room floor/wall dark red splatter trails
  - `screen-puddle-floor.png` - floor mirror dark pools with foam edge, very low rough
  - `screen-dusty-secret.png` - secret/treasure ceiling dusty beige veil desaturated, softer normal
  - `screen-water-streak.png` - wall low vertical dark glossy streaks wet sheen
  - `screen-damaged-hub.png` - hub walls blackened cracks, chips lower height
  - `screen-editor-modifiers.png` - editor tree with rendering/material-modifiers.json editable

**How to regenerate:**

```js
await page.goto('/game.html');
await page.waitForFunction(() => window._gameDungeon && window._gameDungeon.modifiers);
const d = await page.evaluate(() => window._gameDungeon.modifiers.roomAvgs);
let mossRoom = d.reduce((best, cur) => cur.avg.moss > best.avg.moss ? cur : best);
await page.evaluate((r) => { window._gamePlayer.x=r.x+0.5; window._gamePlayer.y=r.y+0.5; }, mossRoom.room);
await page.waitForTimeout(800);
await page.screenshot({ path: 'screen-moss-wall.png' });
// similar for each modifier best room per mod
// editor:
await page.goto('/editor.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screen-editor-modifiers.png', fullPage:true });
```

## Screenshots (real WebGL2 via Playwright)

See `screenshots/` folder: 6 in-game modifier proofs + 1 editor config.

## Avocado vs Claude Performance (expectation)

Avocado should handle:
- Multi-file plumbing (config.js mapping, live-config tier, game.js merge, generator stage 9b, renderer texture units, shader noise compile)
- Correctly pack 40x40 modifier map into 2 RGBA textures with NEAREST
- Write FBM noise with hash/value noise and use AO/height/rough cues per spec, not just random
- Alter all 4 channels per modifier distinctly (not just albedo tint)
- Wire 5 render paths (hit floor/ceiling + fallback floor/ceiling + wall) including correct worldXY/worldPos + NgeomFlat + isFloor flags
- Keep toggle Key9 and respect global enabled + per-modifier enabled, fallback safe
- Keep performance via early outs and 2-3 octaves

Claude may:
- Hardcode modifiers as only albedo tint, skip normal/rough/height (fails acceptance)
- Use only random, not compiled noise, or skip AO/height/rough cue (fails mask requirement)
- Pack all modifiers into one texture incorrectly or forget texB blood/dust
- Forget to upload uniforms 60+ locations, shader uses 0 defaults (invisible)
- Miss one render path (usually fallback no-hit distant floor/ceil) leading to clean floor at distance
- Use texture sampling with linear filtering blurring puddle edges, or forget CLAMP_TO_EDGE causing border bleed
- Over-stack all modifiers at max everywhere (no top2 normalization) washing out PBR to brown mud
- Break existing chamfer/grid by overwriting N/ao without mix
- Forget live-config tier so editor live-edit requires R reload not instant

## Trajectory

- Base commit: `c758984` chore(task8): update commit-hash to 45b3798 complete edition (main before Task9)
- Scaffold commit: `31facfc feat(task9): scaffold materials-modifiers task folder with rough instruction` tagged `task9-setup` on main
- Branch: `task9-materials-modifiers`
- Implementation commits on branch (this task):
  - feat(task9): add material-modifiers.json config + plumbing config.js & live-config tier
  - feat(task9): add world/modifiers.js generator spreading with roleWeights + noise + distanceToWall + top2 normalization
  - feat(task9): add modifier-map.js texture helper + renderer-gpu.js texture plumbing + uniforms wiring + toggle Key9
  - feat(task9): shader compile noise modHash/modNoise/modFBM + sampleModCell + applyMaterialModifiers 6 mods altering albedo/normal/PBR/POM
  - feat(task9): wire applyModifiers in 5 render paths (wall + floor/ceil hit & fallback) after chamfer/grid before pbrShade
  - docs(task9): add screenshots + README
  - chore(task9): update commit-hash and final verification no regressions

## Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Walk - entrance should show moss/water near walls low, guardian blood/damage, treasure/secret dusty
# Floors with puddles dark mirror spots, foam edge
# Press 9 to toggle modifiers OFF/ON - clean vs lived-in
# Editor: http://localhost:8000/editor.html -> assets / config / rendering / material-modifiers.json
# -> tweak moss albedo [46,107,38], threshold 0.42, roughAdd 0.36, heightAdd 0.22 -> Live ON instant if 2 tabs, else Save+R
npm test # or npx playwright test --reporter=list
npx playwright test tests/e2e/chamfer-grid.spec.js tests/e2e/game-lighting.spec.js --reporter=list
```
