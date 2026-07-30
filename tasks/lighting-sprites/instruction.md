# Lighting, Sprites & Particles — Dungeoneers Task 6

Build the dungeon lighting and environmental sprite subsystem that places emissive billboard props — torches, braziers, lanterns, crystals — in the dungeon, each potentially owning a point light with organic, non-sinusoidal flicker. The renderer must support many lights and render sprites as PBR-lit camera-facing quads sharing the same lighting, fog, and shadow logic as the raycasted walls. This turns the dark corridor walk from flat player-only lighting into a lived-in, breathing space where lights populate naturally and fire dances non-predictably.

**Why this task exists:** After Task 3 (first-person PBR raycaster) the dungeon feels dead — only the player torch lights a black void. Retro crawlers like Grimrock, Legend of Grimrock 2, and Dungeon Master use environmental torches as both wayfinding and atmosphere: inconsistent pools of warm light, occasional cool or green magical glows, and low-frequency flame flicker that sells that the place is inhabited. Static lights are not enough; fire must feel alive, which rules out a simple `1+sin(time)*amount`. You need multi-octave, noisy, occasionally popping flicker. The sprite itself must fit the environment physically (wall-mounted sconce vs floor brazier, correct world height, PBR response to its own and neighboring lights) — otherwise it looks like a sticker.

**Reference — mygame prototype (`gamedev-laurentbecherel-mygame` next to this repo):** That prototype already solved a version of this with `entities/sprite-entity.js`, `render/sprite-atlas.js`, `render/sprite-gpu.js`, `systems/lights.js`, `systems/particles.js`, `world/items.js`, `world/scene.js`. You can use it as inspiration for architecture. Specifically look at how characters are handled as PBR billboard sprites: a central registry of sprite metas (albedo path + normal path + ORM path + atlas grid + crop + worldHeight + worldWidthFactor + material {normalStrength, rimStrength...}), a WeakMap GL texture cache per WebGL context with magenta placeholder / neutral normal / neutral ORM fallbacks, async image loading, and a GPU instanced billboard renderer that sorts back-to-front, shares light uniforms with the raycast shader, and does PBR (albedo/normal/ORM sampled). Copying that quality bar for environment sprites (torch, brazier) is the goal — but for this task the sprites are lights themselves, not NPCs. Do NOT copy code verbatim; adapt and integrate cleanly with dungeoneers' dedicated JSON config layout.

---

## 1. Project Structure

Extend `src/` with:

```
src/
├── world/
│   ├── sprites.js             NEW — sprite definition registry, weighted pools per zone/role/theme,
│   │                              placement algorithm, generates {sprites, lights}
│   ├── light-types.js         NEW — light type constants + organic flicker (value-noise + multi-octave sin)
│   ├── dungeon/
│   │   └── generator.js       MODIFIED — calls sprites generator, anchor Z to floorHeight, include sprites+lights in output
│   ├── items.js               MODIFIED or DEPRECATED — keep shim exporting to new sprites.js for backward compat,
│   │                              or refactor to use sprites.js internally
│   ├── map.js                 MODIFIED — expose sprites in query facade
│   └── materials.js           MODIFIED only if needed for shared PBR helpers (optional)
├── systems/
│   ├── lights.js              NEW — Light class + LightManager (unified, config-aware)
│   └── particles.js           NEW — Particle + ParticleEmitter + ParticleSystem for flame/smoke/dust
│                              (highly recommended; torch without subtle smoke feels dry)
├── entities/
│   ├── sprite-entity.js       NEW — base billboard entity for any world sprite (position, spriteId,
│   │                              scale, visibility, time, frame, distanceTo, getSpriteId, getFrame, world size helpers)
│   └── index.js               MODIFIED — export SpriteEntity if already exists
├── render/
│   ├── sprite-atlas.js        NEW — central sprite registry Map + WeakMap GL cache + loadImage + placeholder/neutral tex + async upload
│   ├── sprite-gpu.js          NEW — SpriteGpuRenderer GPU instanced PBR billboard renderer (program, VAO, instance VBO, sort back-to-front)
│   ├── shaders.js             MODIFIED — add MAX_LIGHTS constant, light array uniforms for raycast,
│   │                              plus vsSpriteSrc + fsSpritePBRSrc for sprite PBR lighting sharing same flicker/fog/shadow logic
│   ├── renderer-gpu.js        MODIFIED — own LightManager + SpriteGpuRenderer, resolve lights from dungeon + player
│   │                              flicker via organic factor, upload light arrays each frame, render sprites > after raycast scene,
│   │                              before or after quantize but behind UI, with blending
│   └── map-upload.js          MODIFIED only if needed to pass sprites meta to GPU
├── assets/
│   ├── sprites/
│   │   ├── registry.js        NEW — side-effect registers at least 2-3 sprite definitions (torch_wall, brazier_floor,
│   │   │                           maybe lantern or crystal) via registerSprite(id, meta)
│   │   └── [optional PNGs]    — PBR maps: albedo, normal, orm. May be missing at runtime => placeholder must work
│   └── config/
│       └── lighting/
│           ├── lighting.json          MODIFIED — extend with maxLights, torchColors, player light as currently, keep backward compat
│           ├── sprites.json           NEW — editor-tracked list of environmental sprite definitions:
│           │                              id, displayName, category, emitsLight bool, lightProfile {}, material {}, placement {}
│           ├── light-types.json       NEW — editor-tracked light type definitions:
│           │                              id, type enum, baseIntensity, radius, flickerSpeed/Amount, pulse, spot cone, castShadows, color
│           └── particles.json         (optional) — flame/smoke emitter defaults
├── config/
│   └── config.js              MODIFIED — add CONFIG_PATHS for sprites, light-types, particles, add getters
│                              getSpritesConfig, getLightTypesConfig, getParticlesConfig, include in getAllRenderConfigs
└── core/
    └── game.js                MODIFIED — expose dungeon.sprites to window for E2E, ensure light count >0 after gen
```

Existing `src/assets/config/gameplay/generator.json` items block should be interpreted by `world/sprites.js` (or keep items shim). Ensure server recursive walk already covers `config/lighting/` — no server change needed if using existing `CONFIG_PATHS` mechanism, but verify.

All JS must be ES modules, no runtime deps beyond WebGL2. No emoji in code.

---

## 2. Sprite System — handling position, name, setup, material, light linkage

**SpriteEntity base class** (`entities/sprite-entity.js`) — very similar to mygame's version:

- Fields: `x, y, z` world, `spriteId` (registry key), `scale`, `visible`, `time` (accumulated), `frame`, `id` (unique like `spr_...`).
- Methods: `update(dt)` advances time, `distanceTo(x,y)` = hypot, `getSpriteId()` returns spriteId (override point), `getFrame()` returns int frame, `getWorldHeight(meta)` = (meta.worldHeight||0.5)*scale, `getWorldWidth(meta)` = height * (meta.worldWidthFactor||0.5). Subclasses (if any) can override.

**Sprite Registry / Atlas** (`render/sprite-atlas.js` + `assets/sprites/registry.js`):

- `registry` Map `id -> SpriteMeta` where SpriteMeta at minimum:
  - `id`, `path` albedo PNG (string), `normalPath?`, `ormPath?` or `roughMetalPath?`, `heightPath?`
  - Atlas grid: `cols, rows, count, cellW, cellH, cropX, cropY, cropW, cropH`
  - World sizing: `worldHeight` (world units, e.g. 0.5-1.2), `worldWidthFactor` (0.3-0.6)
  - `fps` animation rate
  - `material`: `{ normalStrength (>=1, e.g. 2.2), baseRoughness, baseMetal, rimStrength }`
- `registerSprite(id, meta)` side-effect API.
- GL cache: WeakMap `gl -> Map(id -> { albedo, normal, orm, height, meta, loaded })`
- Helpers: `loadImage(src) => Promise`, `createGLTex(gl, img, filter)` with CLAMP_TO_EDGE, NEAREST vs LINEAR, `placeholderTex` magenta `[255,0,255,255]`, `neutralNormalTex` `[128,128,255,255]`, `neutralORMTex` (R=AO=255, G=rough~217, B=metal=0).
- `loadSpriteGL(gl, id)`: if cached return, else create placeholder entries immediately, then async try loading each texture path (supporting single string or array fallback). On success replace GL texture (delete placeholder, create new). Never throws to break render — logs warn. Returns entry.
- `getSpriteTextures(gl, id)` returns cached or null.
- `getSprite(id)`, `listSprites()`, `preloadSpritesGL(gl, ids)` helpers.
- `assets/sprites/registry.js` imports `registerSprite` and registers at least:
  - `torch_wall` — wall sconce, `worldHeight ~0.6`, `worldWidthFactor ~0.4`, single frame or small flame atlas.
  - `brazier_floor` — floor standing brazier, larger `worldHeight ~1.0-1.2` maybe, wider.
  - Optional third like `lantern_hanging` or `crystal_small` for magical cool/purple.

PBR intent: sprite fragment shader must sample albedo/normal/ORM and apply same sun + point lights as walls, with fog, ambient. Rough/metal affect specular. Even if textures missing (placeholder path fails), renderer must still show something (magenta + neutral) and not crash — this keeps task solvable without artist assets.

**Sprite Definitions Config** (`assets/config/lighting/sprites.json`):

Editor-tracked version 1 JSON, structure example (exact field names flexible, but must convey intent):

```json
{
  "_readme": "Enviro sprites that emit light. Pools driven by zone/role/theme for future variation.",
  "version": 1,
  "sprites": [
    {
      "id": "torch_wall",
      "displayName": "Wall Torch",
      "category": "torch",
      "emitsLight": true,
      "lightProfile": { "type": "flicker", "color": [1,0.62,0.28], "intensity": { "min":3.2, "max":4.5 }, "radius": { "min":8, "max":11 }, "flicker": { "speedMin":4.5, "speedMax":9, "amountMin":0.12, "amountMax":0.30 } },
      "material": { "worldHeight":0.6, "worldWidthFactor":0.42, "normalStrength":2.2, "roughness":0.85, "metal":0, "emissive":0.0 },
      "placement": { "wallMounted": true, "floorStanding": false, "perimeterBias": true, "allowedZones": ["Entry","Antechamber","Depths","Sanctum","Exit"], "allowedRoles": { "hall":1, "corridor":1.5, "hub":1, "treasure":0.6, "guardian":0.4 }, "weight":1.0, "minTorchDist":3.5 }
    },
    {
      "id": "brazier_floor",
      "displayName": "Standing Brazier",
      "category": "brazier",
      "emitsLight": true,
      "lightProfile": { "type": "flicker", "color": [1,0.55,0.22], "intensity": { "min":3.8, "max":5.2 }, "radius": { "min":9, "max":12.5 } },
      "material": { "worldHeight":1.05, "worldWidthFactor":0.55, "normalStrength":1.8, "roughness":0.8, "metal":0.2 },
      "placement": { "wallMounted": false, "floorStanding": true, "centerBias": true, "allowedZones": ["Depths","Sanctum","Exit"], "allowedRoles": { "treasure":1.4, "shrine":1.5, "guardian":1.2, "armory":0.8 }, "weight":0.6 }
    }
  ],
  "pools": {
    "zone": { "Entry": {"torch_wall":0.8,"brazier_floor":0.2}, "Depths": {"torch_wall":0.5,"brazier_floor":0.5} /* ... */ },
    "role": { "treasure": {"brazier_floor":0.7,"torch_wall":0.3}, "corridor": {"torch_wall":1.0} /* ... */ }
  }
}
```

At least two types required. Pools may be simplified or omitted in code if weights come directly from placement field, but config must show thinking long-term about theme/role/zone picking.

---

## 3. Light System — types, organic flicker, management

**Light Types** (`world/light-types.js` or `systems/lights.js`):

Export constants:

```js
export const LIGHT_TYPES = { DIRECTIONAL:'directional', POINT:'point', AMBIENT:'ambient', SPOT:'spot', FLICKER:'flicker', PULSE:'pulse', EMISSIVE:'emissive', STEADY:'steady' };
export const LIGHT_TYPE_IDS = { point:0, spot:1, flicker:2, pulse:3, emissive:4, ambient:5, steady:6, directional:0 };
```

**Light class**:

- Props: `type, pos [x,y,z], color [r,g,b], intensity, radius, flickerSpeed, flickerAmount, phase, id, dir [x,y,z], coneInner, coneOuter, pulseSpeed, pulseAmount, noShadow`
- Getter `typeId` -> map.
- Static helpers for organic flicker:
  - `_hash1(p)` sin-based returning 0..1 (same across engines)
  - `_valueNoise1D(t)` smoothstep lerp between hash values, maps to -1..1
  - `organicFactor(time, flickerSpeed, flickerAmount, phase)` returns 1.0 when speed==0 && amount==0 else rich non-predictable factor >=0.18 (prevent total blackout). Required behavior (do NOT have to exactly copy coefficients, but intent must match):
    - Warp time with low-freq sines dependent on phase to avoid uniform flicker across torches
    - Add slow drift via valueNoise
    - Combined several inharmonic sines (e.g. 1.0x, 1.87x, 2.93x, 4.63x etc) with different phase offsets
    - Non-linear shaping: `combined*0.6 + sin(combined*1.3+phase)*0.4`
    - High-freq pop: product of two fast sines, shaped with `pow(abs(pop), 2.5-3)*sign(pop)` small contribution
    - Mid noise contribution
    - Final `1 + (combined*0.5 + popShaped + midNoise) * amount * ~1.8`
    - Clamp low at e.g. 0.18
  - This should look like fire: mostly slow wave, occasional sudden dim or bright spike, never looping cleanly within few seconds.
- Methods: `getFlickeredIntensity(time)` returns intensity*factor.

Also export standalone `getOrganicFlickerFactor(time,speed,amount,phase)` for renderers that don't want class.

**LightManager**:

- Holds `lights` array (environment) + `sun` directional + `ambient` scalar.
- `sun.dir` normalized, `sunIntensity`, `ambient`.
- `setFromMap(map)` where map has `lights` array or derives from `map.items` filtered torch -> Light POINT
- `getNearest(pos, maxCount=8)` returns up to maxCount closest by 2D distance
- `getAll()`, `getPoints()`
- Should read live config via `getLightingConfig` with fallback.

**Shader extension** (`render/shaders.js`):

- Currently single point light uniforms. Extend to array up to MAX_LIGHTS (e.g. 12) — must NOT break existing uniforms.
- Add uniforms: `u_numLights`, `u_lightPos[MAX]`, `u_lightColor[MAX]`, `u_lightIntensity[MAX]`, `u_lightRadius[MAX]`, `u_lightType[MAX]`, `u_lightDir[MAX]`, `u_lightConeInner[MAX]`, `u_lightConeOuter[MAX]`, `u_lightPulseSpeed[MAX]`, `u_lightPulseAmt[MAX]`, `u_lightNoShadow[MAX]` maybe plus `u_lightFlickerSpeed`, `u_lightFlickerAmt`, `u_lightPhase` if you want to compute flicker in shader cheap, but preferred to compute intensity flickered on CPU and upload already flickered intensity — either valid, but organic feel must be consistent.
- Raycast fragment shader loop over lights for contribution, with atten `1 - dist/radius` squared, optional spot cone dot, pulse factor (`1+sin(time*pulseSpeed+phase)*pulseAmt`), shadow trace (reuse existing `traceRay` with bias)
- Keep sun and ambient.
- Add sprite shaders: `vsSpriteSrc` and `fsSpritePBRSrc` — similar to mygame:
  - Vertex shader: billboard facing camera, using `a_corner` corner in [-1,0..1,1], `a_center xyz`, `a_size wh`, `a_uvRect uv0 uv1`, `a_alpha`, `a_normalStrength`, `a_rimStrength`. Compute world position, then screen transform using player's angle/planeLen/resolution/bobPixels/eyeZ similar to character-billboard CPU path, but done on GPU. Or simpler: compute view-aligned quad entirely CPU and just pass clip pos — either is acceptable.
  - Fragment shader: sample albedo/normal/ORM, decode normal, apply TBN (tangent=camera right, bitangent=up), geom normal facing camera, PBR shade using sun+point lights array with flicker intensities already passed, ambient, fog via `1/(1+dist*fogBase+dist*dist*fogSq)`, optional rim when light behind.
- MAX_LIGHTS and MAX_CHARS constants exported (keep MAX_LIGHTS shared).
- Provide `fsParticleSrc` / `vsParticleSrc` if adding particles GPU path, or keep particle rendering CPU canvas overlay.

---

## 4. Particle System (strongly recommended)

`systems/particles.js`:

- `Particle { x,y,z, vx,vy,vz, size, baseSize, color[], alpha, baseAlpha, life, age, update(dt): bool }` with drag (0.98) and fade after 0.5 life, shrink.
- `ParticleEmitter { pos[3], rate (particles/sec), color, size, life, velocity[3], spread, type ('flame','smoke','spark'), accum, particles[], update(dt,time,extraPos?), emit(basePos,time), getParticles() }`.
- Flame emitter: organic wobble — inharmonic sines + warp field + gust shaped pop influences vx/vy/vz. Color variation yellow->orange occasional brighter. Size jitter.
- Smoke: lower vz, slower, darker gray, low alpha, larger size, longer life.
- `ParticleSystem { emitters[], addEmitter, clear, update, getAllParticles }`

Integration: each Torch entity owns 1-2 emitters (flame + occasional smoke). Game loop ticks system.

Rendering: simplest CPU path — reuse GPURenderer's debug? Actually for first-person we can render particles as small blended quads in same sprite GPU renderer or separate small additive overlay canvas. At minimum, particles should contribute to atmosphere — even if rendered as simple colored dots via sprite-gpu with additive blending, it satisfies torch feel.

This part can be deferred to stretch, but lack of smoke/flame particles makes torches look static.

---

## 5. Dungeon Generator Integration — placing sprites as part of generation

Modify `world/dungeon/generator.js` + `world/sprites.js` (new):

**Candidate collection** (deterministic, no Math.random beyond seeded RNG):

- Consider all floor cells. Find those adjacent to at least one wall (for wall torches) and those in room interior not near wall (for floor braziers).
- Skip cells too close to start (e.g. dist < 2.2) to avoid blocking spawn.
- Classify per candidate: `insideRoom` (reference to room object), `isCorridor` bool, `perimeterDist` distance to room border, `wallAdj` list of dirs ['N','S','E','W'] where neighbor grid is wall, plus tile x,y, center cx,cy.

**Config driven**:

Read from generator config asset (`src/assets/config/gameplay/generator.json`):

- `items` block or new `sprites` block: `maxTorches` / `maxSprites`, `minTorchDist`, `corridorBias`, `torchOffset`, `flameSizeMin/Range`, `zBase/Jitter`, `flickerSpeedMin/Range`, `flickerAmountMin/Range`, plus `corridorTargetFactor/Min`.

Plus per-zone/per-role weights from `sprites.json` and `light-types.json` — allow picking which sprite type to place given zone/role. For Task 6 minimal, you may hardcode picking logic but leave pool structure in place for future `assets/themes/themes.json` to drive.

**Greedy placement**:

- Per room: 1-2 sprites (entrance room 1). Use shuffle with deterministic RNG.
- Wall torches: prefer perimeterDist <=1, choose wall offset (e.g. `chooseWallOffset(wallAdj,rng)` returns ox,oy,dir). Position = center + offset*scale.
- Floor braziers: prefer center area (`perimeterDist > 1`), position at center.
- Corridor: target count = `max(2, floor(rooms.length*0.6))`, weighted shuffle of corridor candidates.
- Ensure min distance between placed sprites (sq check) >= `minTorchDist`.
- Cap to `maxTorches`.

**Z anchoring**:

For each placed torch, read `floorHeight[ tileIdx ]` if present to anchor `z = floorH + zBase + jitter`. This prevents floating in pits (Task 3 bug fix).

**Color & light variation**:

- Pick base from torchColors palette: `{r,g,b,name}`.
- Add jitter `(rand-0.5)*0.08`.
- Intensity = base.intensity + (rand-0.5)*0.6, radius = base.radius + (rand-0.5)*1.2.
- flickerSpeed = min+rand*range, amount similarly, phase = rand*2pi.

**Light type assignment based on architecture/role** (future extensibility but implement minimal variation for credibility):

Example from mygame:

```
if arch==prison -> flicker
cathedral -> spot down
mossy -> pulse greenish
crystal -> pulse blue-purple noShadow
ruins -> ambient noShadow lower intensity larger radius
cave -> flicker
role treasure/shrine -> pulse noShadow
guardian -> spot
secret -> flicker dim
```

For Task 6 with single architecture dungeon currently only uses id 1, you can base mostly on role + zone: treasure/shrine get brazier with pulse warm, guardian gets brighter steady or spot, secret dim flicker, hall/corridor gets regular flicker torch. Allowed but not mandatory to have full architecture differentiation — but code path must exist for future architectures.

**Output**:

Dungeon object must include:

- `sprites: [{id, type: spriteId (e.g. torch_wall), x,y,z, wallDir?, tileX,tileY, floorH, color[3], intensity, radius, flickerSpeed, flickerAmount, phase, roomIndex, flameSize, lightType, ...}]`
- `lights: [{pos:[x,y,z], color[3], intensity, radius, flickerSpeed, flickerAmount, phase, id, type, dir, coneInner, coneOuter, pulseSpeed, pulseAmount, noShadow }]`

Keep backward compat: `items` array may alias sprites where type=='torch', and `lights` as before, so old minimap-renderer still works.

Determinism: same seed + same config => bit-identical sprites/lights (positions, colors, flicker phases). No `Math.random` outside seeded RNG.

---

## 6. Rendering — many lights + PBR billboards

**GPURenderer modifications**:

- Import LightManager, SpriteGpuRenderer, sprite-atlas helpers, registry side-effect.
- Fields: `lightManager = new LightManager()`, `spriteRenderer = new SpriteGpuRenderer(gl)`, `lights = []` (from manager), `sprites = []` (from map).
- `init(map,cfg)`: after atlases, init sprite renderer, preload sprite IDs used in map (or listSprites()), set up light manager from map (`setFromMap`) plus sun/ambient from lighting.json.
- Add method to resolve nearest lights to player each frame (e.g. up to MAX_LIGHTS-1 to leave room for player light, or include player as one of them) — implement logic: take all environment lights + player point light (as `noShadow` maybe), compute dist, sort, slice to MAX_LIGHTS.
- On each `render(map,player,time)`:
  - Compute flickered intensities for each selected light via `light.getFlickeredIntensity(time)` or organic factor lookup.
  - Upload light uniform arrays (pos/color/intensity/radius/type/etc).
  - Existing raycast pass runs with many lights.
  - Then render sprites: build array of `{x,y,z, worldWidth, worldHeight, spriteId, frame, scale, alpha, visible}` from dungeon.sprites (frame may animate via time & sprite.fps). Sort back-to-front by dist to camera (already in spriteGpu). Call `spriteGpu.render(sprites, camera, flickeredLights, time, {sunDir,sunIntensity,sunColor,ambient,fogBase,fogSq})`.
  - Ensure blending enabled, disable depth write.
  - If particles exist: either render via particle shader or via sprite renderer extended.

- Shader raycast must now loop up to MAX_LIGHTS, not single — test via visual: previously only player area lit, after task walking near torch wall lights scene without moving player torch. Fog still applies.

- Minimap: sprites optionally drawn as light dots? Existing map-ui does not need to draw sprites, but may show light positions as small glow. Not required.

**Lighting flicker tweak** (critical):

- Avoid predictable sin — human eye instantly spots sin wave in torch intensity. Implement organicFactor as described §3.
- Store `phase` per torch uniquely from deterministic hash/rng, so no two torches sync.
- In shader cheap flicker (if flicker computed in shader) use at least 2 sines different freq; preferably use CPU flickered intensity already computed organically and uploaded — then shader is consistent with CPU value. Document trade-off: CPU organic reference vs shader cheaper approximation for performance — note that feel should align even if math cheaper in shader.
- Flame billboard itself may also wobble UV slightly via sin time + phase.

**Visual quality**:

- Torches must not float: Z anchored to floorHeight.
- Wall torches offset toward wall (torchOffset).
- Sprites must respond to nearby lights (their own + others) so they self-illuminate plausibly, plus fog attenuation.
- Additive glow around flame? At minimum alpha transparent.

---

## 7. Config & Editor

Create:

- `assets/config/lighting/sprites.json` version 1 with `_readme`, `sprites[]`, `pools`, plus future `themes[]` placeholder.
- `assets/config/lighting/light-types.json` version 1 with `_readme`, `types[]` e.g. point_torch, flicker_torch, brazier, pulse_crystal, ambient_fill etc. Each: id,name,type,baseIntensity,baseRadius,flickerSpeed,Amount,pulseSpeed,Amount,coneInner/Outer,castShadows,color.

- Modify `assets/config/lighting/lighting.json` to contain `maxLights` (e.g. 12), `torchColors` palette as today, plus optional `player` and `fog` still.

- Extend `config/config.js`:

```
'sprites': ['config/lighting/sprites','config/sprites'],
'light-types': ['config/lighting/light-types','config/light-types'],
'particles': ['config/lighting/particles','config/particles'],
```

Add getters:

```
export async function getSpritesConfig(){return _fetchConfig('sprites');}
export async function getLightTypesConfig(){return _fetchConfig('light-types');}
export async function getParticlesConfig(){return _fetchConfig('particles');}
```

Include them in `getAllRenderConfigs()` name list so Game merges them.

Editor: no custom tab required — generic visual editor must auto-discover nested files and allow editing via form (numbers, sliders, arrays, nested objects, color pickers for [r,g,b]). After saving via PUT, changes persist to disk and reloaded on R regeneration.

---

## 8. Tests

**Unit** (Node built-in test runner, under `src/tests/unit/`):

Create `sprites.test.js` + `lights.test.js` or extend `generator.test.js`:

- `hash2i` deterministic: same inputs same output, different inputs different, normalized 0..1.
- Organic flicker: `LIGHT_TYPE_IDS` defined, `Light.organicFactor(0,0,0,0) === 1`, with amount 0 returns 1, with non-zero returns finite number >=0.18 and <= ~3? Check not NaN, not infinite. Varies with time (two different times produce different factor given same phase, but deterministic repeated call same factor). Phases cause differing factor for same time.
- Light class: `getFlickeredIntensity` = intensity*factor, not NaN.
- LightManager: `setFromMap` creates lights, `getNearest` returns ≤maxCount sorted by distance, `getAll` includes sun.
- Sprite registry: `registerSprite`, `getSprite`, `listSprites` — registering and retrieving works, returns meta with required fields, worldHeight positive.
- Generator determinism: same config + same seed => same `sprites` array deep equal and same `lights` array deep equal (positions, colors, flicker phases). Not just grid but sprite list.
- Placement constraints: all sprite tile coordinates within map bounds [0,w)×[0,h), placed positions within bounds plus offset, no two sprites closer than minDist (allow small eps e.g. 0.1), at least some sprites (e.g. ≥4) placed for default config, max respects `maxTorches`.
- Bounds: no out-of-bounds grid access during candidate collection.
- Material validity: sprite material fields within sane ranges (roughness 0..1, metal 0..1, normalStrength >0, worldHeight 0.1..2).
- Config validity: `sprites.json` parses, version 1, sprites array non-empty, each sprite has id.

**E2E** (Playwright, extend `tests/e2e/game.spec.js` or new `game-lighting.spec.js`):

- Game page loads without console errors, canvas element WebGL2 obtainable, canvas non-empty (non-black pixels after init).
- `window.game.dungeon.sprites` exists and length >0 after generation.
- `window.game.dungeon.lights` length >0, each light has pos[3], color[3], intensity>0, radius>0.
- Press R triggers regeneration, sprites/lights remain >0, no console errors.
- Walk near torch: player position moves, render changes (hard to assert pixel-perfect, but ensure no WebGL errors).
- Editor E2E: new lighting configs appear in file tree under `assets → config → lighting → sprites.json` and `light-types.json`, selectable and editable, save persists (modify a number, save, fetch again contains new number).
- Verify `MAX_LIGHTS` uniform path not breaking: check for WebGL errors via console messages (no "shader compile failed").

Optional visual: screenshot difference when player moves from dark area to near torch — brightness increases.

No 3P image assets required; placeholder must be acceptable.

---

## 9. Out of Scope

- Full 64-frame animated character idle (that's characters-sprites old task 6). For torch/brazier a single frame or 4-frame flame flipbook suffices.
- Audio flicker crackle, positional audio.
- Full RPG gameplay integration, burning damage over time when near brazier.
- Real-time shadow maps per torch — raymarch shadow trace as existing shading trace suffices (plus noShadow optimization for emissive/ambient).
- Multi-floor persistence of sprites.
- Saving discovery per sprite (sprite visibility may be gated by discovery later, but not required now).
- Procedural PNG generation of PBR sprites from scratch (acceptable to use placeholder magenta until authored; infrastructure must support loading when PNGs eventually exist).
- Mobile / R8 texture compression.

---

## 10. Acceptance Criteria

- [ ] `src/world/sprites.js` exists generating sprites + lights, deterministic, respects min distance, corridor bias, wall/floor anchoring, outputs both arrays
- [ ] `src/world/light-types.js` or `systems/lights.js` exports `LIGHT_TYPES`, `LIGHT_TYPE_IDS`, `Light` class with `typeId`, `organicFactor` (non-trivial multi-octave + valueNoise + warp + pop), `getFlickeredIntensity`, and standalone `getOrganicFlickerFactor`
- [ ] `src/systems/lights.js` `LightManager` owns sun + ambient + point list, `setFromMap`, `getNearest`, `getAll`
- [ ] `src/systems/particles.js` Particle + Emitter + System with flame organic wobble and smoke types (if not, document why fallback static still plausible)
- [ ] `src/entities/sprite-entity.js` base entity as spec, helper sizing
- [ ] `src/render/sprite-atlas.js` Map registry + WeakMap GL cache + placeholder/neutral textures + async loader
- [ ] `assets/sprites/registry.js` registers torch_wall + brazier_floor (at least 2) with PBR meta
- [ ] `render/sprite-gpu.js` GPU instanced PBR billboard renderer sorting back-to-front, blending, fog, uses light uniforms
- [ ] `render/shaders.js` extended with `MAX_LIGHTS`, light array uniforms loop over many lights, plus sprite `vsSpriteSrc`/`fsSpritePBRSrc` doing PBR shading with same lights, fog, rim
- [ ] `render/renderer-gpu.js` uploads many lights flickered each frame via organic factor, renders sprites after raycast, no WebGL compile errors
- [ ] `assets/config/lighting/sprites.json` version 1 editor-tracked, contains at least 2 definitions with light profiles + material + placement + pools structure showing long-term extensibility for theme/role/zone
- [ ] `assets/config/lighting/light-types.json` version 1 editor-tracked, defines types point/spot/flicker/pulse etc with base params
- [ ] `config/config.js` adds logical paths + getters + batch loader includes new configs
- [ ] Generator produces identical sprites/lights for same seed, respects bounds and min distance, anchors Z to floorHeight, chooses wall offset, assigns unique phase per torch so flicker not synced
- [ ] Flicker is visibly organic, not simple sin: multi-octave + drift + pop, clamps low to avoid blackout
- [ ] Sprites render PBR-lit (respond to nearby lights), with transparency, sorted, not floating, look correct in environment (height, width factor)
- [ ] Game loads, `window.game.dungeon.sprites.length>0` and `.lights.length>0`, R regenerates without error, M map toggle still works
- [ ] Editor tree shows `assets/config/lighting/sprites.json` and `light-types.json`, editable and persists
- [ ] Unit tests for lights + sprites + determinism pass, E2E passes
- [ ] No new runtime deps, ES modules only, no emoji

---

## 11. Running Instructions

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Observe: corridor now has warm torch glows beyond player torch, not just black fog
# Walk toward torch: walls brighten organically, flame sprite (if texture available else magenta placeholder) flickers non-repeating
# Press R: new random seed, new sprite placement but deterministic if seed fixed in config
# Press M: map still works, does not crash with new sprites
# Editor: http://localhost:8000/editor.html -> assets / config / lighting / sprites.json -> tweak intensity/radius/flickerSpeed/Amount, save, R in game to see live
# Also: assets / config / lighting / light-types.json -> tweak type definitions, torchColors palette in lighting.json
# For visual proof without textures, placeholder magenta + neutral normal should still be lit by PBR: move close, rim highlight visible on edges
# Particle debug (if implemented): torch has subtle smoke rising, flame particles wobble with wind gust not static

# Tests
npm run test:unit   # should include lights/sprites determinism
npm test            # e2e checks sprite count and editor tree
```
