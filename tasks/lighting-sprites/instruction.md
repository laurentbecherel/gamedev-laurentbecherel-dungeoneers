# Lighting, Sprites & Particles — Dungeoneers Task 6

Build the environmental lighting and sprite subsystem that makes the dungeon feel inhabited. After Task 3–5 the world has PBR walls, fog, and map discovery, but only a single player torch lights a black void. Retro crawlers like Grimrock and Dungeon Master use placed torches as both wayfinding and atmosphere: warm inconsistent pools, occasional cool or eerie glows, and flame that dances unpredictably — never a clean sine wave.

This task turns a dark walk into a lived-in space: emissive billboard props (wall sconces, floor braziers, hanging lanterns, small crystals) placed during generation, each potentially owning a point light with organic flicker. The renderer must support many simultaneous lights and render sprites as PBR-lit camera-facing quads that share lighting, fog, and shadow logic with raycasted walls.

Reference prototype `gamedev-laurentbecherel-mygame` next to this repo already solved a version of sprites as PBR billboards (atlas, GPU instanced quads, WeakMap texture cache, placeholder/neutral fallbacks). Use it for architectural inspiration, not verbatim copy — adapt to Dungeoneers' dedicated JSON config layout and editor.

---

## 1. Player-facing intent

- **Before:** walking away from start is darkness beyond player radius, scene feels dead, no reason to look down a corridor.
- **After:** distant warm glows hint at passage, approaching brightens walls organically. Each light feels alive because no two flicker in sync and intensity never loops cleanly within a few seconds.
- **Sprites feel physical:** a wall torch sits offset toward a wall, at a height anchored to the floor so it does not float in pits; a brazier stands on floor center, taller and wider. They respond to nearby lights (their own and neighbors) so they self-illuminate plausibly, fade with fog, and sort back-to-front with transparency.
- **Wayfinding:** corridors get more torches than dead ends, treasure / shrine / guardian rooms get larger braziers. Even without textures (placeholder) the scene should show colored quads that are lit, not black stickers.
- **No regression:** R regeneration, M map toggle, 1–8 debug toggles, and editor save/reload continue to work. No console errors, no shader compile failures.

---

## 2. What must be true about generation

**Source of randomness:** All sprite/light placement must be deterministic given the same seed + same config JSON. No unseeded Math.random() in the generator path. The same seed produces bit-identical positions, colors, intensity, radius, flicker phases, and sprite type choices.

**Candidate selection:** Consider only walkable floor cells near walls (for wall sconces) or interior room cells (for floor braziers). Skip cells too close to spawn to avoid blocking start. Classify each candidate with zone/role context from its room if any.

**Placement constraints:**
- All placed sprite tile coordinates inside map bounds. World positions may be offset from tile center for wall adherence but must stay within reasonable map extents.
- Respect a minimum separation distance between any two placed sprites — no clumping. Cap to a configurable max count so density stays readable.
- Per-room quota: a few per room, more in large/hub rooms, limited in corridors with a tunable target count and bias.
- Wall torches prefer perimeter cells and include a wall direction + offset so renderer can nudge them toward wall. Floor braziers prefer central area.
- Z height anchored to `floorHeight` channel when available: final Z = floorH + small base + jitter, preventing floating over pits.
- Color variation: pick from a torch color palette (warm, occasional cool/green/purple) with small random jitter, not uniform.
- Intensity / radius / flicker speed / amount randomized within small ranges per sprite so no two look identical.

**Sprite-type choice:** Must support at least two environmental types (e.g. `torch_wall` wall-mounted and `brazier_floor` floor-standing). Architecture should allow future expansion via weighted pools: per zone and per role weights that drive which sprite type is picked. Even if minimal logic now selects types by role/zone, config must express pools so designers can add themes without code (e.g. sanctum prefers crystals, corridor always torch_wall). Keep structure extensible.

**Output:** Dungeon object includes:
- `sprites` array — each entry has world x,y,z, tile x/y, sprite type id, color, intensity, radius, flicker parameters, phase, room linkage, flame size or similar.
- `lights` array — derived point lights consumable by renderer, each with pos, color, intensity, radius, flickerSpeed/Amount, phase, id, and light type (flicker / pulse / steady / spot etc) plus optional spot cone / pulse fields / shadow flags. The two arrays may overlap but both must be present for backward compat.

**Light-type variation for credibility:** Not every light identical. Some roles should hint at different behavior: treasure/shrine may use pulse or brighter flicker, guardian steadier or spot downward, secret dimmer. Code path for differentiating by role / future architecture id must exist, even if currently only small variation is applied.

---

## 3. Sprite system — physical presence and PBR

**Base billboard entity:**
- Holds world position, sprite registry key, scale, visibility, accumulated time, animation frame.
- Helpers for world height / width from meta (height * widthFactor) and distance to player, plus frame lookup for animated flame atlases.

**Registry / Atlas:**
- Central registry id -> meta describing at least: albedo texture path(s), optional normal/ORM/height paths, atlas layout, world sizing, fps, material tweaks (normalStrength, roughness, metal, rim).
- Registration function called as side effect from a registry module that ships at least torch_wall and brazier_floor definitions with distinct heights (wall shorter, floor taller).
- GL cache per context via WeakMap: id -> { albedo, normal, orm, meta, loaded }. Immediate placeholder textures so render never crashes when PNG missing: magenta placeholder for albedo, neutral normal, neutral ORM. Async image loading that replaces textures when available, but never throws into render loop.
- Helpers to get/list/preload sprites.

**PBR intent:** Sprite fragment shader must sample albedo/normal/ORM and light with same sun + point lights as walls, apply ambient + fog + rim. Even with placeholder, sprite should still be lit.

---

## 4. Light system — types and organic flicker

**Light types:** Provide constants for point, spot, flicker, pulse, emissive, ambient, steady, directional (names flexible but must express intent). Also numeric ids for shader so it can branch cheaply on type.

**Organic flicker — why not sin:**
Human eye spots `sin(time)` instantly. Fire has slow drift (seconds), occasional brighter pop, mid-frequency wobble, and non-symmetric bright/dim sides. Desired qualities:

- Same inputs produce same output (deterministic), different time or phase produce different output.
- When flickerSpeed and flickerAmount are zero, factor must be exactly 1.0.
- With non-zero params, factor must vary over time, stay finite, never NaN, and clamp low to avoid total blackout (fire dims but never dies). Upper bound reasonable.
- Not monotonic over a 10s window; many ups/downs and occasional spikes. Phases desync torches.
- Achieve via layering: low-frequency warp using phase-dependent sines, slow drift via value-noise (hash-based smoothstep noise), several inharmonic sines (frequencies not integer multiples), non-linear shaping, fast pop via product of high-freq sines shaped with pow to create rare spikes, plus mid noise. Final scale by flickerAmount.

You do not need to copy exact coefficients, but implement the layered feel and document intent. Provide both a rich CPU function and optionally a cheaper shader approximation — but if you upload already-flickered intensities from CPU, shader stays consistent.

**Light class:**
- Fields: type, pos, color, intensity, radius, flickerSpeed/Amount, phase, id, plus spot/pulse data if needed.
- Method to get flickered intensity at time.

**LightManager:**
- Owns environment lights + sun + ambient.
- Can be populated from map.
- Query helpers: get nearest lights to player (up to max count, sorted), get all, get points only.
- Produces flickered list each frame.

---

## 5. Rendering — many lights + PBR billboards

**Shader upgrade:** Existing single point light must become array of up to MAX_LIGHTS without breaking existing uniforms. Raycast fragment shader loops over `u_numLights` with attenuation, optional spot cone, optional pulse, and shadow trace reuse (or noShadow flag for emissive/ambient). Keep sun and ambient.

**Sprite shaders:** Vertex builds camera-facing quad from center + corner + size, similar to character billboards: computes view transform using player angle/plane/resolution and maps corner to screen, outputs uv, worldPos, dist, alpha. Fragment samples albedo/normal/ORM, reconstructs TBN, applies same point lights array (intensities already flickered on CPU), ambient, fog, optional rim. Discard low alpha.

**Renderer integration:**
- Owns LightManager + sprite renderer, preloads sprite ids used in current map.
- Each frame: resolve nearest lights to player, compute flickered intensities, upload uniform arrays.
- Raycast pass runs with many lights — visible proof is walls brightening near environmental torches.
- Then render sprites back-to-front, blending enabled, depth write off, behind UI.
- No WebGL errors.

**Particles (strongly recommended):** Flame without smoke feels dry. Consider Particle + Emitter + System: particles have pos/vel/size/color/alpha/life/age with drag and fade; emitters spawn at rate with type flame/smoke/spark and organic wobble; each torch owns 1–2 emitters. Render as blended quads via same sprite path or additive overlay. If omitted, document why fallback still plausible.

---

## 6. Config & editor

Create data-driven JSON configs under `assets/config/lighting/`:

- `sprites.json` version 1: `_readme`, `sprites` array with at least 2 types each describing id/displayName/category/emitsLight/lightProfile/material/placement, plus `pools` showing long-term weighting by zone and role.
- `light-types.json` version 1: `_readme`, `types` array defining archetypes with type enum, base intensity/radius, flicker/pulse/cone/shadow flags, color.
- Extend `lighting.json` with `maxLights` and torchColors palette while preserving player light and fog.

Integrate with existing config loader: add logical paths for sprites, light-types, particles and getters plus batch loading. Editor must auto-discover new files via generic file tree — they appear under `assets → config → lighting → sprites.json / light-types.json`, editable via visual form and raw JSON, save persists via PUT and reloads on R regen.

---

## 7. What tests should prove

**Unit:**
- Hash/noise deterministic.
- Flicker: zero returns 1, non-zero finite >= low clamp, deterministic, varies with time and phase, over 10s shows variance and many ups/downs.
- Light class flickered intensity.
- LightManager nearest sorted.
- Sprite registry register/get/list, meta sizing positive, material sane ranges.
- Generator determinism same seed same sprites/lights.
- Bounds: sprites inside map, Z anchored to floorHeight, not floating, at least a handful placed, max respected, min distance respected, no OOB access.
- Unique phases to avoid sync.
- Config validity: sprites.json v1 ≥2 types including torch_wall and brazier_floor, pools present; light-types.json v1 valid.

**E2E (Playwright):**
- Game loads without console errors, canvas WebGL2, non-empty pixels.
- dungeon.sprites and lights exist length>0 with valid fields.
- R regen keeps sprites>0.
- No shader compile failures.
- Editor files appear and are editable/persist via API.
- Visual: walk near torch brightens, multiple lights visible.
- Screenshot-taking: capture images proving feature into `tasks/lighting-sprites/screenshots/`.

---

## 8. Screenshots expected

Generate via Playwright e2e taking real canvas captures, not hand-drawn. Save to task folder `tasks/lighting-sprites/screenshots/`:

- `screen-torch-wall.png` — corridor wall sconce, warm pool, flame billboard visible.
- `screen-brazier-floor.png` — floor brazier in room, larger radius.
- `screen-multi-lights.png` — several torches overlapping, proving many-lights path.
- `screen-flicker-graph.png` — evidence organic flicker not sinusoidal: debug overlay or two captures showing brightness change.
- `screen-sprite-pbr.png` — sprite close-up showing PBR shading.
- `screen-editor-sprites.png` — editor tree showing sprites.json and light-types.json editable.

Placeholder magenta acceptable if PNGs missing, but must be lit.

---

## 9. Out of scope

- Full 64-frame character sheets, audio crackle, burning damage, real-time shadow maps per torch, multi-floor persistence, saving discovery per sprite, procedural sprite PNG generation, mobile compressed textures.

---

## 10. Acceptance

- Generation outputs sprites and lights deterministic, respects min distance, wall/floor anchoring, corridor bias, unique phases, color/intensity/radius variation, type pools.
- Light system has types/ids, organic flicker (multi-octave + drift + pop, not pure sin, clamped), plus pulse helper.
- LightManager owns sun/ambient/points, nearest query.
- Sprite registry + atlas with WeakMap cache, placeholder fallbacks, async load, at least torch_wall + brazier_floor.
- GPU sprite renderer: instanced PBR billboards, back-to-front sort, blending, fog, shares lights.
- Shaders: MAX_LIGHTS and array uniforms looping many lights, sprite shaders doing PBR with same lights, fog, rim.
- Renderer uploads many flickered lights each frame, renders sprites after raycast, no WebGL errors.
- Configs: sprites.json v1 with ≥2 defs + pools showing future extensibility, light-types.json v1 with archetypes, lighting.json with maxLights + colors, all editor-tracked and integrated into config loader.
- Sprites not floating, wall offset applied, look correct.
- Game loads sprites>0 lights>0, R regen stable, M map works.
- Editor shows new lighting configs and edits persist.
- Unit + e2e pass including screenshot-taking e2e that populates task screenshots.
- No new runtime deps, ES modules only, no emoji.

---

## 11. Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Corridors have warm pools beyond player torch
# Walk toward torch: walls brighten organically, flame flickers non-repeating
# R: new seed deterministic if seed fixed, M: map still works
# Editor: http://localhost:8000/editor.html -> assets / config / lighting / sprites.json

npm run test:unit
npm test
```
