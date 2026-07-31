# Grid Tile Chamfers — Dungeoneers Task 8

> The walls already have a chamfer that makes individual grid tiles readable (darkened bevel + trim highlight at each tile edge). This gives the retro dungeon a clear tile structure. But floors and ceilings lack the same treatment — they look like one continuous slab. We need to add **grid tile chamfers** for floor and ceiling, i.e. a subtle visual separation at every 1×1 dungeon cell boundary (not the procedural brick/dalle pattern), so the player intuitively understands what is a dungeon tile.

> Reference screenshot (attached by designer): walls show clear horizontal+vertical grid via chamfer; floor/ceiling in the dark areas are flat and unreadable for tile boundaries.

## 1. Designer Intent

- As a player, I want to *feel* the grid under my feet and above my head without it being in-your-face.
  - The wall chamfer currently uses a darkened crevice + slight roughness tweak + trim highlight in the middle of the bevel band. It is visible but subtle.
  - Floor and ceiling should get the same philosophy: when I look down a corridor, I see faint lines every 1 world meter indicating tile boundaries. It helps me understand movement (grid vs free) and distance.
- This is purely visual, **zero gameplay impact**: no collision change, no generation change, no player movement change.
- Must be **subtle**: if you screenshot with chamfer OFF vs ON, you should notice the difference, but it should not dominate the scene or look like a heavy grid overlay. Think Doom/Quake style floor tile grout, not Tron.
- Must be **configurable and live-editable**: all sizes, darken amounts, roughness tweaks, trim strengths should live in a JSON (likely `assets/config/geometry/chamfer.json` existing file) and be hot-reloadable via the live-edit system from Task 7 (Tier 1 instant params). Designer should be able to drag sliders in editor.html and see floor grid appear/disappear live.
- Should work with existing wall chamfer, corners, PBR, fog, lighting (many lights), POM — no regression, no shader compile errors.
- Should work both near walls and in open rooms — even in the center of a large room, you still see the grid.

## 2. Current System (for context)

**Chamfer today (`src/render/shaders.js` + `src/assets/config/geometry/chamfer.json`):**

- `chamfer.json` has:
  - `size.floor` / `ceil` / `wall` / `cornerRadius` — widths for wall-to-floor/ceil bevels and wall-tile vertical bevel.
  - `shading.darken` ~0.55, `roundCorners`, `floorToWallBlend`, `wallToWallBlend`, `affectRoughness`.
  - `trim.*Strength` — albedo highlight in middle of bevel band simulating baseboard catching light.
  - `ranges.*` — thresholds for smoothstep shaping (creviceEnd, creviceSmoothEnd, trimStart/Mid/End etc) to avoid magic numbers hardcoded.

- Shader has two floor/ceiling chamfer usages:
  1. **Wall chamfer at tile edges:** for walls, `e = min(wallU, 1-wallU) < wallSize` → bevel + AO darken + trim. `wallU` is the local UV inside a single wall face (0..1 per grid tile), so this already shows per-tile wall grid.
  2. **Floor/ceiling near walls:** `nearestWallDistAndNormal(floorWorld)` → distance to nearest wall cell, if `wd < floorSize` → bevel that blends floor normal toward wall + AO darken + trim. This is a *baseboard/cove* chamfer, not a tile-grid chamfer.

- `renderer-gpu.js` resolves config values and uploads uniforms `u_chamferFloorSize`, `u_chamferCeilSize`, `u_chamferWallSize`, etc.

- Config loader `src/config/config.js` has `CONFIG_PATHS['chamfer'] = ['config/geometry/chamfer', 'config/chamfer', 'config/main']` with `getChamferConfig()`.

**What is missing:**

- No per-tile chamfer for floor/ceiling. The floor currently is continuous PBR material with procedural brick/dalle relief (from `materials-proc.json`) but no indication of 1m dungeon cell boundaries.
- The desired feature is similar to wall's `wallU` edge logic, but for floor: use `fract(floorWorld)` distance to tile edge.

## 3. Requirements

### 3.1 Visual behavior

- For **floor** (worldPos XY for floor, Z ~ floorHeight):
  - Compute `fract(floorWorld)` → `fx, fy` in [0,1) inside current dungeon tile.
  - `edgeDist = min(min(fx,1-fx), min(fy,1-fy))` — distance to nearest tile edge in world units (since tile is 1×1, this is also in meters).
  - If `edgeDist < floorGridSize` (e.g. 0.06-0.10), apply chamfer:
    - Darken AO: `ao *= mix(floorGridDarken, 1.0, smoothstep(...))` where `floorGridDarken` ~0.85-0.92 (much subtler than wall 0.55).
    - Perturb normal toward edge: blend floor normal `N = (0,0,1)` with edge direction (or with `vec3(0,0,1)` → ??). For floor, a simple way: add slight bevel by mixing normal toward negative Z? Actually for floor we want a groove: normal tilts toward center of edge or slightly down. Similar to existing floor-to-wall chamfer which tilts toward wall+up. For tile-grid, a gentle V groove: normal tilts toward the edge (i.e. if near X edge, tilt X). Can use `nearest edge normal` derived from fx/fy: if `fx < 0.5` then edge normal X negative, etc. Or simply darken AO only for minimal subtle version, but ideally also slight normal tilt for light catch.
    - Roughness: `rma.r = mix(rma.r * (1.0 - affectRoughness*0.5), rma.r, t)` to make groove slightly rougher/darker.
    - Optional trim highlight: `albedo += vec3(trimBand * floorGridTrimStrength)` with trimBand computed as `smoothstep(trimStart, trimMid, t) * (1-smoothstep(trimMid, trimEnd, t))` similar to existing, but strength should be small (0.03-0.10) so it is barely visible.

- For **ceiling** (worldPos XY for ceiling, Z ~ ceilHeight):
  - Same logic, but `N = (0,0,-1)` facing down. Edge distance from `fract(ceilWorld)`.
  - Use `ceilGridSize`, `ceilGridDarken`, `ceilGridTrimStrength`, etc. Slightly darker or lighter to match ceiling lighting — designer can tune.

- Must work in **both shader paths**:
  - Path A: inside `hit==1` when `wallV_raw` out of [0,1] → floor/ceiling rendered as part of raycast hit miss (the one using `floorH_atRay`, `ceilH_atRay` + POM).
  - Path B: fallback `else` when no wall hit at all → distant floor/ceiling using `pfH`/`ceilH` loops. Both need the grid chamfer, otherwise distant tiles show no grid.

- **Subtlety guidance:** Start with size 0.05-0.08 m (5-8 cm groove half-width), darken 0.88-0.93, trim 0.04-0.08. Should be visible when you look for it, especially under torch light grazing, but not a strong black grid. A/B test: toggle chamfer.enabled or grid.enabled OFF should make floor look continuous; ON should show faint lines.

- **Corners of grid:** At tile corners where both X and Y edges are close, the groove should appear darker (product or min) and not create bright crossing artifacts. Blending two edges: you could take `t = edgeDist / size` for the nearest edge only (simplest), or combine `fxEdge` and `fyEdge` for corner darkening. Keep simple but handle corners gracefully (no bright plus).

- **Should not interfere with existing wall-to-floor chamfer:** Both chamfers can stack. The existing `nearestWallDistAndNormal` chamfer is near walls (baseboard). Grid chamfer is everywhere. When both apply, AO multiplications combine, normal blends in sequence. Order: apply grid chamfer first, then wall chamfer, or vice versa — choose order that preserves readability. Document in code.

- **Must respect `u_chamferEnabled` toggle (Key 7):** When disabled, both wall and grid chamfers off. Optionally add separate enable flag for grid inside JSON, but at minimum the global `enabled` must disable it.

### 3.2 Configuration

- Extend `assets/config/geometry/chamfer.json` with a new section for grid tile chamfers. Design a clean schema, examples:

```json
{
  "version": 1,
  "enabled": true,
  "size": { "floor":0.3, "ceil":0.24, "wall":0.28, "cornerRadius":0.22 },
  "shading": { ... },
  "trim": { ... },
  "ranges": { ... },
  "grid": {
    "enabled": true,
    "floorSize": 0.07,
    "ceilSize": 0.06,
    "floorDarken": 0.88,
    "ceilDarken": 0.90,
    "floorRoughness": 0.35,
    "ceilRoughness": 0.30,
    "floorTrim": 0.06,
    "ceilTrim": 0.04,
    "floorBlend": 0.85,
    "ceilBlend": 0.80,
    "note": "1=per-dungeon-tile grid grooves, subtle, meters, 0.88 darken = faint"
  },
  "gridRanges": {
    "creviceEnd": 0.10,
    "creviceSmoothEnd": 0.30,
    "trimStart": 0.10,
    "trimMid": 0.35,
    "trimEnd": 1.0,
    "note": "thresholds for grid grooves"
  }
}
```

- Values above are examples. You must pick sensible defaults that are subtle but visible. Avoid `floorSize > 0.12` as that becomes chunky. Ensure `floorDarken` is closer to 1 than `shading.darken` (0.55 is strong for wall-to-floor coves; grid should be much softer).

- All tunable numbers must have named fields, no magic numbers hardcoded in shader except fallback defaults when uniform missing (keep fallback pattern existing: `u_chamferFloorSize` fallback using `max(...,0.001)`).

- JSON must be valid, version 1, and keep existing fields' values intact (don't change existing defaults drastically — preserve backward compat).

- Consider adding separate uniforms for grid: `u_gridFloorSize`, `u_gridCeilSize`, `u_gridFloorDarken`, etc. OR reuse existing `u_chamfer*` plus new ones. Decide cleanly, but avoid uniform explosion by grouping logically. Existing shader already has ~20 chamfer uniforms; adding 8-12 more is acceptable. Keep naming consistent `u_chamferGridFloorSize`, etc or `u_gridFloorSize`.

- Live-edit: `config.js` already exposes `chamfer`. No change needed for loader, but ensure new fields are included when config is merged in `renderer-gpu.js`. The renderer must have `updateChamfer()` path for live-edit Tier 1 instant update — already exists, it just updates cached config. Your new uniforms should be read each frame via `_resolveConfigValue` similar to existing, or updated via `updateChamfer()` invalidating cache.

### 3.3 Renderer + Shader implementation

**Files to modify:**

- `src/render/shaders.js` — add grid chamfer logic in floor/ceiling sections (both hit branches). Add uniforms. Keep comments explaining the math.
- `src/render/renderer-gpu.js` — add uniform locations for new grid params, and in `render()` `_resolveConfigValue` reads from config to upload. Extend `_resolveToggles` or `updateChamfer` if needed. Also keep fallback defaults.
- Optionally `assets/config/geometry/chamfer.json` — new fields.
- No generation change needed; no player change; no map UI change.

**Shader details (guidance, not prescription):**

- For floor: after you have `floorWorld` (vec2), `fuvAtlas`, `albedoRaw`, `Nw`, `rma`, `ao`:

```glsl
// grid tile chamfer - subtle 1m cell grooves
float gridFloorSize = max(u_chamferGridFloorSize, 0.001);
vec2 f = fract(floorWorld);
float distX = min(f.x, 1.0 - f.x);
float distY = min(f.y, 1.0 - f.y);
float edgeDist = min(distX, distY);
if (edgeDist < gridFloorSize && gridEnabled) {
  float t = edgeDist / gridFloorSize; // 0 at edge, 1 at far
  float bevel = 1.0 - smoothstep(0.0, 1.0, t);
  // AO darken
  ao *= mix(u_chamferGridFloorDarken, 1.0, smoothstep(0.0, creviceSmooth, t));
  // normal tilt: figure edge normal in XY
  vec2 edgeN = vec2(0.0);
  if (distX < distY) edgeN.x = (f.x < 0.5 ? -1.0 : 1.0);
  else               edgeN.y = (f.y < 0.5 ? -1.0 : 1.0);
  vec3 chamN = normalize(vec3(edgeN * 0.6, 1.0)); // slight tilt toward edge + up
  // or mix toward groove: blend N with (edgeN,0,1)
  N = normalize(mix(N, chamN, bevel * blend));
  // trim highlight
  float trimBand = smoothstep(trimStart, trimMid, t) * (1.0 - smoothstep(trimMid, trimEnd, t));
  albedo += vec3(trimBand * trimFloor);
  // roughness
  rma.r = mix(rma.r * (1.0 - rough*0.5), rma.r, t);
}
```

- Adapt for ceiling (N down, chamN = vec3(edgeN*0.6, -1.0) ?). Choose a variant that opens groove downward.

- Keep `roundCorners` option? For grid you may want to round the groove (spherical interpolation) vs flat bevel. Optional — you can reuse existing `u_chamferRoundCorners` or add dedicated bool.

- Ensure you don't break POM: POM offset applied before grid chamfer is fine.

- Must handle both uniform fallback: if new uniform missing (old config), default to 0 (disabled) or subtle defaults so old shader still compiles.

**Renderer uniform upload:**

- In `renderer-gpu.js` `render()` method, look at how `chamferFloorSize` etc are resolved via `_resolveConfigValue(cfg, ['chamfer.size.floor', ...], fallback)`. Add similar for grid: `cfg.chamfer.grid.floorSize` etc.

- Add to `uLoc` list new uniform names.

- Upload via `gl.uniform1f(ul.u_chamferGridFloorSize, ...)` each frame (or when changed).

- If you introduce `grid.enabled` flag, respect it: if false, set size to 0 or skip shader logic via uniform bool.

### 3.4 Live-edit integration

- Task 7 introduced `live-config.js` tier system: `chamfer` is Tier 1 instant (shader uniforms). Verify your new grid fields are also Tier 1 — editing in editor.html with Live ON should update game view within few hundred ms.

- Test manually: two tabs Editor + Game, Live + Auto Save ON, tweak `chamfer.json` `grid.floorDarken` from 0.88 to 0.60 — floor grid should become visibly darker instantly.

- No extra work needed if you follow existing `updateChamfer()` → `_resolveConfigValue` pattern, but document that it works.

### 3.5 No regressions

- Existing chamfer toggle Key 7 must still disable all chamfers including new grid.

- Existing wall chamfer for tile edges must remain visible and unchanged in strength (don't weaken it).

- Existing floor-to-wall and ceiling-to-wall coves must remain (near walls still has baseboard chamfer). Your grid chamfer is additional.

- PBR, fog, shadows, corners, POM, lighting (many torches), sprites must still work, no WebGL errors.

- Editor must still show `geometry/chamfer.json` as editable tree and save via PUT.

## 4. Tests — what should be proven

**Unit — extend `tests/unit/config.test.js` or create `tests/unit/chamfer-grid.test.js`:**

- `chamfer.json` exists, valid JSON, version 1, `enabled` true.
- Old fields still present: `size.floor` ~0.30, `size.ceil` ~0.24, `size.wall` ~0.28, `shading.darken` 0.4-0.7, `trim` strengths numbers, `ranges` thresholds.
- New grid fields present:
  - `grid` object exists, `enabled` bool true.
  - `grid.floorSize` number in 0.02..0.12, `ceilSize` in 0.02..0.12.
  - `grid.floorDarken` in 0.75..0.98 (subtle, not strong like 0.55), `ceilDarken` similar.
  - `grid` trim/roughness/blend numbers in sensible ranges.
  - Optional `gridRanges` or reuse of `ranges`.
- Shader string contains new logic: `shaders.js` includes `fract(floorWorld)` or `fract(ceilWorld)` and `u_chamferGrid` or `u_grid` uniforms, and applies AO darken for floor/ceiling grid (search for pattern `floorWorld` + `edgeDist` or `distX`/`distY`).
- Renderer uploads new uniforms: `renderer-gpu.js` contains `u_chamferGrid` or `u_gridFloor` uniform locations and `gl.uniform1f`.
- Config loader includes chamfer (already done).
- No hardcoded magic: `_resolveConfigValue` includes path `chamfer.grid.floorSize` etc or similar.

**E2E — extend `tests/e2e/game.spec.js` or create `tests/e2e/chamfer-grid.spec.js`:**

- Game loads without console errors, canvas WebGL2, non-empty pixels, `chamfer.json` fetchable.
- Toggling chamfer with Key 7 still works (HUD message or internal flag).
- Visual sanity: take screenshots comparing grid off vs on? For E2E you can test that floor world UV near edge has different brightness:
  - Simpler: verify that shader contains grid logic (already unit), and that game renders with new config without crashing.
- More meaningful: ensure live-edit still works for chamfer (reuse existing `live-edit.spec.js` if needed).
- Screenshots: your dedicated E2E spec should capture canvas images proving feature.

**Manual validation (for your README and screenshots):**

- Use Playwright to take screenshots looking straight down at floor (pitch down) or slightly forward in a corridor, with grid enabled vs disabled.
- Show floor grid visible but subtle, ceiling grid similar (look up).
- Show wall + floor grid together (corridor) to prove both present.

## 5. Screenshots expected

Generate via Playwright (or manually then commit) into `tasks/grid-tile-chamfers/screenshots/`:

- `screen-floor-grid.png` — looking down at floor in lit corridor/room, faint 1m grid lines visible.
- `screen-ceiling-grid.png` — looking slightly up at ceiling, grid lines visible but subtle.
- `screen-floor-ceiling-wall-together.png` — perspective view down a corridor showing wall tile chamfer + floor tile chamfer + ceiling tile chamfer together, proving coherent grid.
- `screen-grid-off-vs-on.png` (optional, or 2 separate) — comparison: grid disabled (continuous) vs enabled (subtle lines) to show subtlety.
- `screen-editor-chamfer.png` — editor tree showing `geometry/chamfer.json` with new grid fields editable.
- `screen-live-edit-grid-tweak.png` (optional) — live-edit in action tweaking `floorDarken`.

Naming is flexible but must be referenced in `task.toml` `screenshots` array.

All screenshots must be real WebGL2 canvas captures, not mockups.

## 6. Acceptance Criteria

- [ ] `assets/config/geometry/chamfer.json` extended with `grid` (or equivalent) section containing `enabled`, `floorSize`, `ceilSize`, `floorDarken`, `ceilDarken`, `floorTrim`, `ceilTrim`, `floorRoughness` or similar blend factors, plus `_readme` explaining subtlety. Old fields preserved, values not drastically changed.
- [ ] Shader `src/render/shaders.js` implements floor and ceiling grid-tile chamfer using `fract(world)` distance to tile edge, with AO darken, optional normal tilt and trim highlight, controlled by new uniforms, subtle enough (darken 0.85-0.95 default), working in both hit and fallback floor/ceiling paths, stacking with existing wall-to-floor coves.
- [ ] Renderer `src/render/renderer-gpu.js` adds uniform locations for new grid params, resolves from config via `_resolveConfigValue`, uploads each frame, respects `enabled` and global `u_chamferEnabled`.
- [ ] Live-edit Tier 1: changing grid values in editor with Live ON updates Game view within few hundred ms without R, and OFF preserves old workflow (no update until Save+R).
- [ ] No regressions: Key 7 toggle still works, wall tile chamfer unchanged, floor-to-wall cove still visible near walls, PBR/fog/shadows/corners/POM/lighting still work, no WebGL errors, no shader compile failures.
- [ ] Unit tests prove config validity, presence of new fields in sensible ranges, shader contains grid logic, renderer uploads uniforms.
- [ ] E2E tests prove game loads, chamfer toggle works, screenshots can be taken, no console errors.
- [ ] Screenshots committed in task folder proving floor grid, ceiling grid, combined view, editor editability, and subtlety (off vs on if possible).
- [ ] ES modules only, no new runtime deps, no emoji in code, no magic numbers hardcoded (all tunable via JSON with fallback defaults).

## 7. Out of Scope

- Changing wall tile chamfer logic (keep existing).
- Changing dungeon generation, player movement, collision, discovery, map UI.
- Adding new JSON file for grid (should extend existing chamfer.json, but if you create `grid.json` separately it's acceptable if documented and editor-discoverable — however preference is to extend chamfer.json).
- PBR material atlas changes for bricks/dalles (that's material relief, not grid chamfer).
- Audio, gameplay balancing.
- Multi-floor persistence.
- Shader hot-reload of GLSL source itself (live-edit for config only).

## 8. Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Walk down corridor, look slightly down: faint grid lines every 1m on floor
# Look up: faint grid on ceiling
# Press 7 to toggle chamfer OFF/ON — grid should disappear/appear with wall chamfers
# Editor: http://localhost:8000/editor.html → assets / config / geometry / chamfer.json
# → tweak grid.floorSize (0.05-0.09), grid.floorDarken (0.80-0.95), grid.floorTrim
# → with Live ON (two tabs) see instant update; with Live OFF need Save+R

npm run test:unit
npm test
```
