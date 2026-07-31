# Task: Grid Tile Chamfers — Dungeoneers Task 8

## Description

Extends the existing wall chamfer system (which already makes grid tiles readable on walls via darkened bevel + trim highlight at tile edges) to floors and ceilings. Currently floor/ceiling have only a wall-proximity baseboard/cove chamfer (`nearestWallDistAndNormal`), but no per-1m dungeon-tile grid separation. This makes the dungeon floor look like one continuous slab and hides the underlying grid that drives movement and generation.

This task adds subtle floor and ceiling grid-tile chamfers: faint darkened grooves at every 1×1 dungeon cell boundary, implemented in the raycast fragment shader using `fract(floorWorld)` / `fract(ceilWorld)` distance to edge, with AO darken, slight normal tilt, roughness tweak, and trim highlight. It is purely visual, zero gameplay impact, but helps the player intuitively understand what a dungeon tile is. Settings live in `assets/config/geometry/chamfer.json` (extended with a `grid` section) and are live-editable via Task 7's live-edit Tier 1 instant params.

## Why

- **Retro readability:** Classic crawlers (Grimrock, Dungeon Master, Doom) used subtle floor tile grout to show grid without heavy overlay. Walls already do this via `wallU` edge chamfer (~0.28 size). Floors/ceilings should too.
- **Teaching the grid:** Player in grid mode moves 1 tile per step. Without floor grid, you don't see where tiles end. With faint lines every 1m, movement feels anchored.
- **Visual coherence:** Walls show grid both horizontally and vertically; floor/ceiling should join that language. Screenshot reference: walls have dark grid, floor is flat black — feels disconnected.
- **Subtlety matters:** This should be barely noticeable at first glance, obvious when you look for it, especially under torch grazing light. Not Tron, not heavy black lines.

## Implementation (intended / gold reference structure)

**Config — `assets/config/geometry/chamfer.json`:**

- Keep existing `size`, `shading`, `trim`, `ranges` intact.
- Add `grid` object:

```json
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
  "note": "per-1m tile grooves, subtle, meters, 0.88 darken = faint grout"
},
"gridRanges": {
  "creviceEnd": 0.10,
  "creviceSmoothEnd": 0.30,
  "trimStart": 0.10,
  "trimMid": 0.35,
  "trimEnd": 1.0,
  "note": "thresholds for grid grooves"
}
```

Defaults: size 0.05-0.08 (5-8 cm half-width), darken 0.85-0.93 (much softer than wall-to-floor 0.55), trim 0.04-0.08. Enabled true.

**Shader — `src/render/shaders.js`:**

- Add uniforms: `u_chamferGridEnabled`, `u_chamferGridFloorSize`, `u_chamferGridCeilSize`, `u_chamferGridFloorDarken`, `u_chamferGridCeilDarken`, `u_chamferGridFloorTrim`, `u_chamferGridCeilTrim`, `u_chamferGridFloorRough`, `u_chamferGridCeilRough`, `u_chamferGridFloorBlend`, `u_chamferGridCeilBlend`, plus gridRanges thresholds.
- In both floor render paths (hit==1 floor branch and fallback no-hit floor), after existing wall-distance chamfer:
  - Compute `vec2 f = fract(floorWorld); float distX=min(f.x,1-f.x); float distY=min(f.y,1-f.y); float edgeDist=min(distX,distY);`
  - If `edgeDist < floorSize && gridEnabled`, compute `t=edgeDist/size`, `bevel=1-smoothstep`, darken AO `mix(darken,1,smoothstep)`, tilt normal toward edge, add trim highlight, tweak roughness.
- Same for ceiling with `N = vec3(0,0,-1)` base and chamfer normal `vec3(edgeN*0.6,-1)`.
- Stack with existing `nearestWallDistAndNormal` chamfer — both apply.
- Ensure `u_chamferEnabled==0` disables all including grid.

**Renderer — `src/render/renderer-gpu.js`:**

- Add uniform locations for grid uniforms to `uLoc` list.
- In `render()`, resolve via `_resolveConfigValue(cfg, ['chamfer.grid.floorSize', 'chamfer.grid.floorSize', ...], fallback)` and upload with `gl.uniform1f`.
- Fallback defaults keep rendering safe if config missing.
- `updateChamfer()` already updates `_cfgCache` — no extra code needed for live-edit Tier1, but verify new values are read each frame.

**Tests:**

- Unit: config.test extended to check grid fields in 0.02-0.12 size, 0.75-0.98 darken, shader contains `fract(floorWorld)` and grid uniform names, renderer uploads.
- E2E: game loads, chamfer toggle Key7 still works, no WebGL errors, screenshots capture grid.

## Tests (planned)

**Unit (`npm run test:unit`):**

- chamfer.json version 1, enabled true, old fields preserved (floor 0.30 ±0.05 etc)
- grid.enabled true bool, floorSize 0.02..0.12, ceilSize 0.02..0.12, floorDarken 0.75..0.98, ceilDarken 0.75..0.98, trim/roughness/blend numbers sensible
- shaders.js contains `fract(floorWorld)` and `fract(ceilWorld)` and `u_chamferGrid` uniforms and AO darken for grid
- renderer-gpu.js contains uniform locations + uploads for grid

**E2E (`npx playwright test`):**

- Game loads WebGL2 canvas non-empty, no console errors
- Chamfer toggle 7 still shows HUD and disables
- Playwright screenshots: floor looking down shows grid lines faint but measurable (edge pixels slightly darker than center), ceiling similar
- Editor shows `geometry/chamfer.json` with grid fields editable, PUT roundtrip persists

## Screenshots (to be generated via Playwright, real WebGL2)

- `screen-floor-grid.png` — looking down corridor floor, 1m grid faint
- `screen-ceiling-grid.png` — looking up ceiling grid
- `screen-floor-ceiling-wall-together.png` — perspective showing all three grids coherent
- `screen-grid-off-vs-on.png` — A/B comparison off vs on to prove subtlety
- `screen-editor-chamfer.png` — editor tree with new grid fields
- `screen-live-edit-grid-tweak.png` — live-edit dragging darken value

**How to regenerate (example):**

```js
await page.goto("/game.html");
await page.waitForFunction(() => window.game && window.game.dungeon);
await page.keyboard.press("ArrowDown"); // look down via mouse? or use free cam
await page.waitForTimeout(500);
await page.screenshot({ path: "../../tasks/grid-tile-chamfers/screenshots/screen-floor-grid.png" });
// toggle chamfer off via config or Key7, screenshot off, then on
```

## Avocado vs Claude Performance

TBD — task scaffolded on main, implementation to be done on branch `task8-grid-tile-chamfers`.

Expected delta:

- Avocado should handle shader uniform plumbing + `fract()` edge distance logic + stacking with existing wall chamfer + live-edit Tier1 if instruction clearly says "subtle, fract(floorWorld), new uniforms, extend chamfer.json, keep fallback".
- Claude may:
  - Hardcode grid line color as black overlay not respecting AO/trim/PBR (too in-your-face)
  - Forget second floor path (fallback no-hit branch) so distant floor shows no grid
  - Use `mod()` incorrectly causing seams at negative coordinates, or forget to handle `fract` for ceiling too
  - Break existing wall chamfer by overwriting `N` or `ao` without mixing
  - Miss renderer uniform uploads → shader compiles but uses 0 defaults (invisible)
  - Set darken too strong (0.5) making Tron grid, not subtle
  - Forget `u_chamferEnabled` toggle interaction
  - Not preserve existing chamfer.json fields, breaking config.test

## Trajectory

- Base commit: `a112461` chore(task7): update commit-hash to 96575d3 complete edition (main before Task8)
- Branch: `task8-grid-tile-chamfers` (to be created from main after scaffold tag)
- Scaffold commit: `feat(task8): scaffold grid-tile-chamfers task folder with instruction` (to be tagged `task8-setup` on main)
- Implementation commits on branch (planned):
  - feat(task8): add grid tile chamfer JSON + shader uniforms + floor/ceiling grid logic
  - fix: subtle defaults and corner handling
  - feat: unit + e2e tests + screenshots proving grid
  - docs: update README top-level Tasks table

## Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Walk down corridor, look slightly down: faint grid lines every 1m on floor
# Look up: faint grid on ceiling
# Press 7 to toggle chamfer OFF/ON — grid should disappear/appear with wall chamfers
# Editor: http://localhost:8000/editor.html → assets → config → geometry → chamfer.json
# → tweak grid.floorSize (0.05-0.09), grid.floorDarken (0.80-0.95), grid.floorTrim
# → with Live ON (two tabs) see instant update; with Live OFF need Save+R

npm run test:unit -- --test-concurrency=1
npx playwright test tests/e2e/chamfer-grid.spec.js --reporter=list
npm test
```
