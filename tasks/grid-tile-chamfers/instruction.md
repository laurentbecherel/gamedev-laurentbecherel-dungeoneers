# Grid Tile Chamfers — Dungeoneers Task 8

> The walls already have a chamfer that makes individual grid tiles readable — a darkened bevel and subtle highlight at each tile edge gives a distinct retro style. Floors and ceilings lack the same treatment: they look like one continuous slab. We need the same approach for floor and ceiling, showing ONE TILE as in grid-dungeon tiles (1×1 world cell), not the procedural brick/dalle material pattern.

> Reference from designer: walls show clear grid via chamfer; floor/ceiling in darker areas are flat and you cannot tell where tiles end.

## 1. Designer Intent

As a player, I want to *feel* the grid under my feet and above my head, without it being in-your-face.

- Wall chamfer today uses a darkened crevice, slight roughness tweak, and a trim highlight in the middle of the bevel band. It is visible but subtle.
- Floor and ceiling should get the same philosophy: when I look down a corridor, I see faint lines every one world meter indicating tile boundaries. It helps me understand movement (grid vs free) and distance, and makes the dungeon read as built from tiles.
- This is purely visual, zero gameplay impact: no collision, no generation, no movement change.
- Must be subtle: if you toggle chamfer off versus on, you notice the difference, but it never dominates the scene. Think floor tile grout in classic crawlers, not a heavy Tron grid.
- Should work both near walls and in open rooms — even in the center of a large room you still perceive the grid.
- Should be configurable and live-editable for fine-tuning. The designer should be able to open the existing chamfer JSON file in the editor and tweak sizes, darken amounts, roughness and trim without touching code, and see the result live when Live-Edit from Task 7 is on.

## 2. Project Structure

This task touches the existing visual tuning architecture in `src/`:

- **Chamfer config** — `assets/config/geometry/chamfer.json` holds sizes for the existing wall-to-floor/ceiling baseboard coves and wall-tile vertical bevels, plus shading (darken, blend, roughness) and trim strengths and ranges for smoothstep shaping. It is the natural home for the new floor/ceiling grid settings.
- **Shaders** — `render/shaders.js` contains the raycast fragment shader. Wall chamfer is per-tile using the local UV inside a wall face, giving vertical grid lines. Floor/ceiling chamfer today is only wall-proximity via `nearestWallDistAndNormal`, giving a baseboard cove near walls, not a grid.
- **Renderer** — `render/renderer-gpu.js` resolves config values each frame and uploads them as uniforms, respecting the global chamfer toggle (Key 7). It has a Tier 1 live path for instant visual params.
- **Config loader** — `config/config.js` maps logical name `chamfer` to `config/geometry/chamfer` with fallbacks, and editor discovers it via recursive JSON walk.

You will extend the JSON, add the needed uniforms and shader logic, and wire the renderer. No generation, player, discovery, or map UI changes are needed.

## 3. Grid Tile Chamfer Behavior

### What to achieve

- For floor and ceiling, show a faint groove at every 1×1 dungeon cell boundary.
- The groove should be read as a small V or soft crevice: slightly darker AO, optionally a slight normal tilt toward the edge so grazing light catches it, and optionally a faint highlight in the middle of the groove similar to existing trim, but much softer.
- At tile corners where two edges meet, the groove should not create bright crosses or artifacts — handle the corner as slightly darker or at least not brighter than the edges.

### How to think about it (guidance, not prescription)

- Floor/ceiling world position for each fragment is available in the shader (the XY where the ray hits floor/ceiling). The fractional part inside the current cell can be used to get distance to the nearest cell edge.
- Distance to edge being small means we are close to a grout line. A smooth function of that distance can drive bevel strength.
- AO darkening, normal blending toward the edge, and a small trim highlight can all be driven by that factor. Keep their strengths much softer than the existing wall-to-floor cove so the grid stays subtle.
- The existing wall-to-floor cove and the new grid can stack — when near a wall you see both baseboard and grid. Consider order so neither overwrites the other completely.
- There are two places where floor and ceiling are rendered in the shader: when a wall was hit but the fragment is above/below the wall slice, and when no wall was hit at all (distant floor/ceiling). Both need to show the grid, otherwise distant tiles lose it.

### Configuration

- Extend the existing chamfer JSON file with a new section for grid tile chamfer. Keep old fields intact with their current defaults.
- The new section should have at least: an enabled flag, sizes for floor and ceiling grooves (in world meters, small), darken factors (close to 1 for subtle), and controls for roughness/trim/blend. You can also add ranges for shaping the crevice and trim bands, reusing the same smoothstep pattern the existing ranges use.
- All tunable numbers must have named fields — no magic numbers hardcoded in JS or GLSL except safe fallback defaults when a uniform is missing.
- The JSON should be valid, versioned, and keep a `_readme` or note explaining that these are per-dungeon-tile grooves, subtle.

### Rendering plumbing

- Add uniforms for the new grid params, upload them each frame from the resolved config, respecting the global chamfer enabled state and the grid's own enabled flag.
- Ensure fallback defaults keep rendering safe if config is missing.
- No new runtime dependencies.

### Live-edit

- Task 7 introduced tiered live-edit: chamfer is Tier 1 instant (shader uniforms). Your new fields should also be Tier 1 — dragging values in `editor.html` with Live ON should update the Game view within a few hundred milliseconds without requiring R.
- When Live is OFF, old Save+R workflow must stay unchanged.

### No regressions

- Existing chamfer toggle must still disable all chamfers including the new grid.
- Existing wall tile chamfer (vertical lines per wall face) must remain visible and unchanged in strength.
- Existing floor-to-wall and ceiling-to-wall coves near walls must remain.
- PBR, fog, shadows, corners, POM, many lights, sprites must keep working, no WebGL errors, no shader compile failure.
- Editor must still show the chamfer JSON in the hierarchical tree and persist via PUT.

## 4. Architecture Quality

- ES modules only, no new runtime dependencies, no emoji in code.
- Keep single source of truth for config paths in `config.js`; resolve values via the existing `_resolveConfigValue` pattern.
- Avoid duplicating logic for floor versus ceiling or for hit versus fallback paths more than necessary — extract helpers where sensible but stay within GLSL limits.
- Preserve readability: comment the groove math briefly.

## 5. Acceptance Criteria (intent, not prescribed solution)

- [ ] Floor shows faint 1×1 dungeon-tile grooves that are visible when you look for them, especially under torch grazing light, but do not dominate the scene. Toggling chamfer off makes the floor look continuous; on shows the grid.
- [ ] Ceiling shows the same subtle grid behavior, coherent with floor.
- [ ] In a corridor perspective you can see wall tile chamfer, floor grid, and ceiling grid together, reading as one consistent tile system.
- [ ] All grid appearance is controlled from the existing chamfer JSON file with its own section, including enable flag and size/darken/roughness/trim/blend controls, with fallbacks and without breaking old fields.
- [ ] Live-editing those values with Live ON updates the Game view quickly without reload; with Live OFF the old Save+R flow is preserved.
- [ ] Global chamfer toggle still disables all chamfers including grid, and existing wall-to-floor cove remains near walls.
- [ ] No shader compile errors, no WebGL errors, existing PBR/fog/shadows/corners/POM/lighting still work.

## 6. Out of Scope

- Changing wall tile chamfer logic.
- Changing dungeon generation, player movement, collision, discovery, map UI.
- Creating a separate JSON file for grid — extend the existing chamfer file (a separate file is acceptable if editor-discoverable, but extending is preferred).
- Changing PBR material atlases for bricks/dalles (that's material relief, not grid).
- Audio, gameplay balancing, multi-floor persistence.
- Hot-reloading GLSL source itself.

## 7. Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Walk down corridor, look slightly down: faint grid lines every tile on floor
# Look up: faint grid on ceiling
# Press 7 to toggle chamfer OFF/ON — grid should disappear/appear with wall chamfers
# Editor: http://localhost:8000/editor.html → assets / config / geometry / chamfer.json
# → tweak grid fields (size, darken, trim, blend) → with Live ON see instant update
```
