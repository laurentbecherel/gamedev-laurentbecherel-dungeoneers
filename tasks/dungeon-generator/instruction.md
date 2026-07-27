# Dungeon Generator — Dungeoneers Task 2

Build the procedural dungeon generation subsystem for Dungeoneers, transforming the foundation engine's empty canvas placeholder into a live top-down 2D minimap visualizing generated dungeon layouts with toggleable rendering modes.

**Why procedural generation:** Dungeoneers is a 10-minute delve dungeon crawler where every run should feel distinct. Hand-authoring layouts doesn't scale to the variety needed for replayability, and the ADO GameDev track emphasizes data-driven content. A deterministic generator ensures the same seed produces bit-identical output across runs — critical for regression testing, sharing interesting layouts, and agent evaluation reproducibility.

**Why grid-based MST topology:** Grid maps align perfectly with the eventual DDA raycaster renderer (Task 3) using the same approach as Wolfenstein 3D. Minimum Spanning Tree guarantees full connectivity — every room reachable, no isolated dead sections. The longest path via double-BFS gives a natural critical path from entrance to stairs without manual authoring. Side branches become treasure/secret rooms organically, creating emergent level flow.

**Why top-down minimap in Task 2:** First-person 3D rendering is Task 3's scope. Task 2 needs visual proof that the generator works — a top-down 2D view serves as both developer debugging tool and the eventual in-game HUD minimap foundation. Building it as a proper `MinimapRenderer` class with legend, scale, title, and toggleable modes establishes the architecture early rather than a throwaway sketch.

**Why deterministic hashing over RNG for material picks:** `hash2i(x,y)` integer hash gives identical output every time for same coordinates across all JS engines. Ensures same seed = same dungeon = same minimap, enabling golden regression tests. `Math.random()` would vary between runs breaking determinism. RNG still used for room placement and graph construction via seeded LCG, maintaining determinism through controlled seed propagation.

This task builds on Task 1's foundation: config system, JSON asset API, editor shell, and server. It adds the `world/` subsystem, generator algorithm, minimap renderer, and editor Generator tab. No WebGL yet, no player movement, no 3D — purely data generation and 2D visualization.

---

## Requirements

### 1. Project Structure Additions

Extend `src/` with these new files and folders:

```
src/
├── world/                       # NEW — dungeon generation subsystem
│   ├── dungeon/
│   │   ├── generator.js         # 10-stage pipeline: rooms → corridors → zones → carve → paint → deco → items
│   │   ├── themes.js            # Theme zone resolution, weighted pool picker, hash2i deterministic hash
│   │   ├── atlas.js             # Material ID constants and lookup helpers (stub for Task 2, full in Task 5)
│   │   └── index.js             # Public API: generateDungeon(config) → DungeonMap
│   ├── map.js                   # Map façade — wraps DungeonMap with query helpers
│   └── items.js                 # Torch placement logic with min distance constraint
├── render/                      # NEW — 2D rendering subsystem (3D comes in Task 3)
│   └── minimap.js               # MinimapRenderer class with toggleable visualization modes
├── main.js                      # MODIFIED — replace placeholder with minimap render loop + R-key regen
├── editor.js                    # MODIFIED — add Generator tab with dungeon params and seed control
├── assets/config/main.json      # MODIFIED — expand generator section with full params
└── tests/
    ├── unit/
    │   └── generator.test.js    # NEW — unit tests for generator determinism, connectivity, role assignment
    └── e2e/
        └── game.spec.js         # MODIFIED — add minimap render assertions
```

### 2. Generator Algorithm — 10 Stage Pipeline

Implement `src/world/dungeon/generator.js` exporting `async function generateDungeon(config, seedOverride)` returning a `DungeonMap` object.

**Configuration source:** Read from `config.generator` section of `src/assets/config/main.json`. Task 2 expands this section from the minimal 4 fields in Task 1 to full parameter set (see section 6 below).

**Seed handling:** If `seedOverride` provided, use it. Else if `config.generator.seed` is non-null number, use that. Else generate random seed via `Date.now()`. Always return the used seed in output for reproducibility.

**Stage 1 — Rooms + connectivity:**
- Target room count from `config.generator.roomTarget` (default 52 for epic 80×80 scale, or scale down for Task 2 initial scope — 32 rooms on 64×64 is acceptable for first implementation).
- Grid dimensions from `config.generator.mapW` and `mapH`.
- Room placement: random x,y within bounds, random size 4..11 tiles, reject if overlaps existing room or too close to boundary. Up to `roomAttempts` tries (default 260).
- Build complete graph: nodes = rooms, edge weight = squared Euclidean distance between room centers.
- Kruskal's MST algorithm for minimum spanning tree → base connectivity ensuring every room reachable.
- Double BFS to find longest path in MST: BFS from arbitrary node to find farthest A, BFS from A to find farthest B and path. This path becomes the **main critical path**.
- Add extra loop edges: for each non-MST edge, add with probability `config.generator.loopExtraChance` (default 0.18) for alternative routes.
- Tag each edge as `main` (on critical path), `side` (MST branch off critical path), `loop` (extra edge), or `secret` (deep branch).

**Stage 2 — Role assignment (story topology):**
Assign role to each room based on position in main path and graph degree:
- `entrance` — first room on main critical path (start position)
- `stairs` — last room on main critical path (goal, stairs_down material forced)
- `guardian` — rooms at approximately 65-75% and 85-95% along main path (boss encounters)
- `treasure` — rooms at approximately 40% and 60% along main path
- `hub` — rooms on main path with degree ≥3 (junction decision points)
- `hall` — other rooms on main path
- `armory` or `shrine` — side branch rooms 1 tile deep off main path
- `secret` — leaf nodes or 2+ tiles deep from main path
- `corridor` — default for non-room cells (filled in later stages)

**Stage 3 — BFS depth from start:**
- Compute shortest-path distance in rooms graph from entrance room to every room via BFS.
- Normalize depths to 0..1 range within level.
- For multi-level support (future), map to global depth via helper: `globalDepth = (levelIndex + localT) / levelCount`. For Task 2, `levelIndex=0, levelCount=1` so global = local.

**Stage 4 — Theme zone resolution:**
Implement `src/world/dungeon/themes.js` with:
- `zoneForDepth(globalT)` returning zone object and local progress within zone.
- Theme `classic` with 5 zones (boundaries as fraction of global depth):
  - **Entrance** 0.00–0.15 — grand ashlar halls, welcoming
  - **Upper Works** 0.15–0.35 — crafted masonry, maintained
  - **Mid Vaults** 0.35–0.58 — rough stone, age showing
  - **Deep Damp** 0.58–0.82 — moss, roots, nature reclaiming
  - **Abyss Shrine** 0.82–1.01 — otherworldly, mystical
- Each zone defines: `wallPool` (array of `{id, weight}`), `floorPool`, `ceilPool`, `deco` probabilities object (8 deco types), `height` ranges, `vaultWeights` (4 vault types), `pillar` spec, `architectureWeights`.
- For Task 2, minimal pools sufficient: 2 wall materials, 2 floor, 2 ceiling defined in existing `assets/materials/*.json`.

**Stage 5 — Room material assignment:**
- Deterministic weighted pick using `hash2i(x, y, seed)` — integer hash function, NOT `Math.random()`. Must be pure function returning same value for same inputs across all JS engines.
- `hash2i` implementation suggestion: 32-bit mix like `((x*73856093) ^ (y*19349663) ^ (seed*83492791)) >>> 0`, then normalize to 0..1.
- Weighted pick: sum weights, hash to 0..sum, iterate accumulating until threshold crossed.
- Special cases: entrance room forces primary wall material for readability, stairs room forces wall material ID 9 (or highest available ID if only 2 materials in Task 2), treasure room forces floor material ID 2 (or highest floor ID), secret rooms favor cave/plaster types if available.
- Architecture picked per room from zone `architectureWeights` + role bias.
- Height profile from zone: `floorMin/Max`, `floorBlockAmp`, `ceilMin/Max`, `ceilJitter`, `vaultWeights`.
- Vault type picked from zone vault weights with guardian/treasure bias toward dome.

**Stage 6 — Grid carving:**
- Initialize `grid` Uint8Array of size `w*h` filled with boundary wall material ID (from `config.boundaryWallId` or default 1).
- Carve each room: set cells within room bounds to `GRID_FLOOR = 0` (walkable).
- Carve corridors: for each MST edge between room A and B, create L-shaped path (randomly choose horizontal-then-vertical or vertical-then-horizontal) connecting room centers. Set path cells to 0.
- Enforce outer boundary: ensure grid perimeter cells remain walls.

**Stage 7 — Wall painting (coherent per room):**
- First pass: for each room, paint its perimeter wall cells with that room's assigned `wallMat` ID (coherent coloring per room).
- Special: stairs room south wall, 3 cells wide centered, override to stairs material for fake door illusion.
- Second pass: corridor wall cells pick material from corridor pool via `hash2i`. Unpainted interior walls assign nearest room's material.
- Pillar accents: at wall corners and along long straight walls, insert carved_pillar material based on zone pillar spec (`spacing`, `columnChance`). For Task 2 with minimal materials, pillar accent can be skipped or use wall material 2 as accent.
- Enforce outer boundary again with boundary wall ID.

**Stage 8 — Floor/ceiling heights and materials:**
- Per-cell floor height: room base height + block variation (scaled 30% to avoid floating tile bug from prototype) + cell jitter via `hash2i` + rare shallow pits/mounds (5% chance).
- Per-cell ceiling height: room base + vault logic (dome = radial falloff from room center, barrel NS/EW = directional arch, cross = intersection) + jitter.
- Floor material per cell: 86% chance room's assigned floor material, 14% accent pick from zone floor pool via hash.
- Ceiling material: room's assigned ceiling material (no accent variation for simplicity in Task 2).
- Corridors: floor height blended toward nearest room base to prevent doorway steps (almost flat). Use corridor floor pool for material.
- **Critical:** use `floorToRoom` lookup array to track which room owns each floor cell, NOT `floorHeight !== 0` check (prototype bug: room floor at height 0 was misidentified as corridor).

**Stage 9 — Deco flags (bitmask per cell):**
- Define deco bit constants: `DECO_COLUMN=1, DECO_MOSS=2, DECO_VINES=4, DECO_ARCH=8, DECO_BROKEN=16, DECO_PUDDLE=32, DECO_ROOTS=64, DECO_BEAM=128`.
- Wall deco probabilities from zone `deco` object + material bonuses (e.g., mossy material +28% moss chance, cave +22%). Suppress deco for stairs material.
- Floor/ceiling deco: BROKEN, PUDDLE, ROOTS, BEAM with zone-driven probabilities.
- Store as `deco` Uint8Array bitmask per cell. For Task 2 minimap, deco can be visualized as small dots or ignored — not required in minimap but must be generated in data.

**Stage 10 — Items and lights:**
Implement `src/world/items.js` exporting `generateDungeonItems(dungeonMap, config)`:
- Place torches with minimum distance constraint (`config.items.minTorchDist`, default ~6 tiles).
- Corridor bias factor (`config.items.corridorBias`, default ~1.5 — torches more likely in corridors for wayfinding).
- Color variation from `config.torchColors` array (4 variants default: warm orange, cool blue, green, purple).
- Each torch becomes item object `{x, y, type:'torch', color, intensity}` and corresponding light definition.
- Return array of items; generator attaches to dungeon output.

**Output format — DungeonMap object:**
```js
{
  w, h,                                    // grid dimensions
  grid: Uint8Array,                        // w*h, 0=floor walkable, 1..N=wall material ID
  floorHeight: Float32Array,               // w*h per-cell floor Z in world units
  ceilHeight: Float32Array,                // w*h per-cell ceiling Z
  deco: Uint8Array,                        // w*h bitmask per cell
  floorMat: Uint8Array,                    // w*h, 1..M floor material ID
  ceilMat: Uint8Array,                     // w*h, 1..C ceiling material ID
  startX, startY,                          // entrance room center position (float tile coords)
  seed,                                    // seed used for generation
  rooms: [                                 // array of room objects
    { x, y, w, h, cx, cy, role, zone, wallMat, floorMat, ceilMat,
      architecture, vaultType, depth, globalDepth, ... }
  ],
  items: [ {x, y, type, color, ...} ],     // torch placements etc.
  lights: [ {x, y, z, color, intensity, radius, ...} ],
  meta: {
    themeId, themeName, levelIndex, levelCount, boundaryWallId,
    zoneSummary, edges, depths, rolesSummary, archSummary, ...
  }
}
```

### 3. Map Façade API

Implement `src/world/map.js` exporting `class DungeonMapWrapper` or plain object with query helpers:

- `isWalkable(x, y)` — true if grid cell at integer coords is floor (0)
- `getCell(x, y)` — returns `{grid, floorMat, ceilMat, floorHeight, ceilHeight, deco}` or null if out of bounds
- `getRoomAt(x, y)` — returns room object containing this cell, or null
- `getStartPos()` — returns `{x, y}` start position
- `getRoomsByRole(role)` — filter rooms by role string
- `width`, `height` getters

Pure functions, no side effects, safe to call from renderer every frame.

### 4. Minimap Renderer — Proper Class Architecture

Implement `src/render/minimap.js` exporting `class MinimapRenderer`.

**This is the central visual component of Task 2 and must be architected properly — not a quick sketch.** It will evolve into the in-game HUD minimap in later tasks, so establish clean component boundaries now.

**Class structure:**
```js
export class MinimapRenderer {
  constructor(canvas, dungeonMap) { ... }
  setDungeonMap(dungeonMap) { ... }           // swap to new generated dungeon
  setMode(mode) { ... }                        // 'role' | 'zone' | 'material'
  setZoom(zoom) { ... }                        // zoom level for detail control
  setPanOffset(dx, dy) { ... }                 // pan for large maps
  render() { ... }                             // main render entry point
  _renderGrid(ctx) { ... }                     // draw cell grid based on current mode
  _renderLegend(ctx) { ... }                   // draw legend panel
  _renderScale(ctx) { ... }                    // draw scale bar
  _renderTitle(ctx) { ... }                    // draw title overlay
  _renderRoomLabels(ctx) { ... }               // optional room role labels
  _getCellColor(x, y) { ... }                  // color logic per mode
  _drawCell(ctx, x, y, color) { ... }          // single cell draw
}
```

**Visualization modes (toggleable via keyboard 1/2/3 keys):**

- **Mode 1 — Role (`'role'`)** — default on load:
  - Color-code rooms by assigned role. Suggested palette (dark theme, gold accent consistent with site design):
    - `entrance` — bright green `#4ade80` with "START" label
    - `stairs` — bright red `#ef4444` with "EXIT" label
    - `guardian` — purple `#a855f7` with "BOSS" label
    - `treasure` — gold `#c9a84c` (site accent) with "$" or treasure icon
    - `hub` — cyan `#22d3ee` junction marker
    - `hall` — medium gray `#6b7280` for main path rooms
    - `armory` / `shrine` — orange `#f97316` side room marker
    - `secret` — dim gray `#374151` subtle
    - Corridor floor — very dark gray `#1f1f1f`
    - Walls — near-black `#0a0a0a` or material-tinted dark shade
  - Draw room role labels as text overlay at room center for key roles (entrance, stairs, guardian, treasure). Use Inter font, small size, centered.

- **Mode 2 — Zone (`'zone'`)**:
  - Tint overlay showing 5 theme zones with distinct hues progressing from light/warm (entrance) to dark/cool (abyss):
    - Entrance 0-15% — warm cream `#f5e6ca` tint
    - Upper 15-35% — light stone `#d4c4a8`
    - Mid 35-58% — medium gray-brown `#8b7355`
    - Deep 58-82% — dark green-brown `#4a5d3a` (moss/damp)
    - Abyss 82-100% — deep purple-black `#2d1b3d` (mystical)
  - Apply tint as overlay multiply or alpha blend over base floor color. Walls remain dark for contrast.
  - Optional zone boundary lines as subtle dividers.

- **Mode 3 — Material (`'material'`)**:
  - Wall cells colored by wall material ID using distinct hues from material definitions in `assets/materials/walls.json` (convert RGB base color to display color, darkened for wall shading).
  - Floor cells colored by floor material ID similarly from `floors.json`.
  - Shows material distribution coherence — rooms should appear as solid color blocks, corridors as consistent material, validating the wall painting algorithm's per-room coherence.

**Legend component:**
- Positioned top-right or bottom-right corner as semi-transparent panel with backdrop blur matching site design system.
- Shows current mode title, color swatches with labels for each category in current mode.
- Updates dynamically when mode toggled.
- Styled with site CSS variables: dark elevated background, gold accent border, Inter font.

**Scale bar component:**
- Bottom-left corner showing grid scale reference (e.g., "10 tiles" with bar graphic).
- Helps orient viewer to dungeon size.

**Title overlay:**
- Top-left or top-center showing dungeon metadata: seed number, dimensions, room count, theme name.
- Example: "Seed 42 · 64×64 · 32 rooms · Classic theme"

**Grid rendering:**
- Calculate cell size to fit dungeon within canvas while maintaining aspect ratio and leaving margin for legend/title.
- For 64×64 dungeon on 640×360 canvas: cell size ~5px fits comfortably with margins. For 80×80: ~4px.
- Draw each cell as filled rectangle. Walls slightly darker than floors for depth.
- Optional 1px grid lines in very dark color for cell boundaries (toggleable or subtle alpha).
- Start position marked with pulsing green circle or arrow. Stairs marked with red downward arrow or distinct icon.

**Interaction:**
- Keyboard `1` → role mode, `2` → zone mode, `3` → material mode. Update legend accordingly.
- Keyboard `R` → regenerate dungeon with new random seed, re-render minimap.
- Keyboard `+` / `-` or mouse wheel → zoom in/out centered on canvas.
- Optional drag to pan when zoomed (nice to have, not required for Task 2 acceptance but architect class to support it).

**Styling consistency:**
- Use site design system from `style.css`: CSS variables for colors (`--bg`, `--surface`, `--accent: #c9a84c`, etc.), Inter font for UI text, JetBrains Mono for seed/numbers.
- Minimap should feel integrated with the Dungeoneers visual identity — dark dungeon aesthetic, gold accents, not bright cartoon colors (except role mode needs distinguishable hues; desaturate to fit dark theme).

### 5. Main.js Integration

Modify `src/main.js` to replace static placeholder with live minimap:

- Import `getConfig` from config API and `MinimapRenderer` from render module and `generateDungeon` from world module.
- On load: fetch config, call `generateDungeon(config)`, create `MinimapRenderer` instance with canvas and dungeon result, render.
- Display HUD pill updated to show: seed, dimensions, room count, current visualization mode.
- Keyboard event listeners:
  - `R` key → regenerate with new random seed → update minimap → update HUD
  - `1`, `2`, `3` keys → switch minimap mode → re-render → update HUD mode indicator
  - `+`/`-` → zoom (optional)
- Console log dungeon summary on generation for debugging.
- Handle config fetch failure gracefully (show error in HUD, keep canvas with error message).

Canvas setup remains 640×360 internal resolution scaled to viewport as in Task 1.

### 6. Config Expansion

Update `src/assets/config/main.json` generator section from minimal Task 1 version to full Task 2 parameter set:

```json
{
  "version": 1,
  "renderer": { "resolution": "640x360", "authentic": true },
  "player": { "moveSpeed": 3.0, "mouseSensitivity": 0.0022 },
  "generator": {
    "mapW": 64,
    "mapH": 64,
    "roomTarget": 32,
    "roomAttempts": 160,
    "levelCount": 1,
    "seed": null,
    "loopExtraChance": 0.18,
    "flattenStartRadius": 2
  },
  "items": {
    "maxTorches": 24,
    "minTorchDist": 6,
    "corridorBias": 1.5,
    "torchOffset": 0.35
  },
  "boundaryWallId": 1
}
```

Defaults chosen for reasonable Task 2 scope — 64×64 with 32 rooms renders clearly on minimap without overwhelming detail. Can scale to 80×80 / 52 rooms later.

### 7. Editor Generator Tab

Modify `src/editor.js` to add Generator tab to the sidebar navigation and editor panel.

**Generator tab UI controls** (using existing generic widget system from Task 1 editor):
- Map width number input (32–128 range)
- Map height number input (32–128)
- Room target number input (16–64)
- Room attempts number input (80–320)
- Loop extra chance slider 0..0.5 step 0.01
- Flatten start radius slider 0..5 step 1
- Seed text input (empty = random on next generation, numeric = fixed seed for reproducibility)
- Level count number input 1..10 (for future multi-level, Task 2 uses 1)
- Max torches number input
- Min torch distance slider
- Corridor bias slider 0.5..3.0

Save button persists to unified asset API as in Task 1. Game page picks up changes on next R-key regen (no live cross-tab update required for Task 2 — manual R press sufficient).

Add Generator tab button to sidebar folder tree or as top-level tab alongside existing asset categories. Follow existing editor patterns from Task 1.

### 8. Tests

**Unit tests** — create `src/tests/unit/generator.test.js` using Node.js built-in test runner:

- Determinism test: same config + same seed → bit-identical DungeonMap output (deep compare grid, floorMat, rooms array). Run twice, assert equality.
- Connectivity test: every floor cell reachable from start position via flood fill (no isolated disconnected regions). Assert all floor cells visited.
- Role assignment test: generated dungeon has exactly 1 entrance room, exactly 1 stairs room, 2 guardian rooms, 2 treasure rooms (within tolerance for small dungeons — adjust expectations based on room count).
- Start/goal separation test: Manhattan or path distance between entrance and stairs is substantial fraction of dungeon diameter (not adjacent).
- Bounds test: all room coordinates within grid bounds, no out-of-bounds access.
- Material ID validity test: all wall material IDs in grid are valid (1..N where N = walls.json materials count), same for floor and ceiling arrays.
- Hash determinism test: `hash2i(x,y,seed)` returns same value across multiple calls with same inputs.

**E2E tests** — modify `src/tests/e2e/game.spec.js`:

- Game page loads without console errors.
- Canvas element exists and has non-empty rendering (check via evaluating canvas toDataURL length or pixel sampling — at minimum verify MinimapRenderer instantiated without errors via console log check).
- Pressing R key triggers regeneration (verify via console log or HUD seed value change).
- Pressing 1, 2, 3 keys switches minimap mode (verify HUD mode indicator updates, or verify no console errors on keypress).
- HUD displays seed, dimensions, room count, and mode.

Add new test file `src/tests/e2e/generator.spec.js` if needed for generator-specific E2E flows, or extend existing game.spec.js.

Update `package.json` test scripts if needed to include unit test runner: `"test:unit": "node --test tests/unit/*.test.js"` (should already exist from Task 1).

### 9. Running Instructions Update

Update repo root `README.md` Tasks table to mark Task 2 as in progress or link to task folder. Add note to game page usage section about R/1/2/3 key controls for minimap interaction.

---

## Acceptance Criteria

- [ ] `src/world/dungeon/generator.js` exists exporting `generateDungeon(config, seedOverride)` implementing 10-stage pipeline
- [ ] `src/world/dungeon/themes.js` exists with `zoneForDepth()`, theme definitions, `hash2i()` deterministic hash, weighted pool picker
- [ ] `src/world/dungeon/atlas.js` exists with material ID constants and lookup helpers (stub acceptable for Task 2)
- [ ] `src/world/dungeon/index.js` exports public generator API
- [ ] `src/world/map.js` exists with DungeonMapWrapper query helpers (`isWalkable`, `getCell`, `getRoomAt`, `getStartPos`, `getRoomsByRole`)
- [ ] `src/world/items.js` exists with torch placement logic respecting min distance and corridor bias
- [ ] `src/render/minimap.js` exists exporting `MinimapRenderer` class with proper component methods (`setDungeonMap`, `setMode`, `render`, `_renderGrid`, `_renderLegend`, `_renderScale`, `_renderTitle`, `_getCellColor`)
- [ ] Minimap renders on game page canvas replacing Task 1 placeholder — visible grid showing dungeon layout on page load
- [ ] Minimap supports 3 toggleable modes via 1/2/3 keys: role mode (default, color-coded by room role with labels), zone mode (5 theme zones with tint), material mode (wall/floor material IDs as shades)
- [ ] Legend panel renders in corner showing current mode categories with color swatches and labels, updates on mode toggle
- [ ] Scale bar renders showing tile scale reference
- [ ] Title overlay renders showing seed, dimensions, room count, theme name
- [ ] Start position marked distinctively (green circle/arrow), stairs marked distinctively (red arrow/icon)
- [ ] R key regenerates dungeon with new random seed and re-renders minimap
- [ ] HUD pill updated to show seed, dimensions, room count, current mode
- [ ] `src/assets/config/main.json` expanded with full generator and items parameter sections
- [ ] Editor has Generator tab with controls for map dimensions, room target, attempts, loop chance, seed, torch params — saves via unified asset API
- [ ] Unit test suite at `src/tests/unit/generator.test.js` covering determinism, connectivity, role assignment, start/goal separation, bounds, material validity, hash determinism — all passing via `npm run test:unit`
- [ ] E2E test suite updated covering minimap render, R-key regen, mode toggle keys, HUD display — all passing via `npm run test:e2e`
- [ ] `npm test` runs both unit and E2E suites successfully
- [ ] No console errors on game page or editor page during normal operation
- [ ] Determinism verified: same seed produces bit-identical dungeon output across multiple generations (manual verification acceptable, unit test required)
- [ ] Game page accessible at `http://localhost:8000/game.html` showing minimap, not placeholder
- [ ] Editor page accessible at `http://localhost:8000/editor.html` with Generator tab functional

## Out of Scope for This Task

- First-person 3D rendering or WebGL — that's Task 3 renderer-gpu-core. Task 2 is strictly 2D top-down minimap.
- Player movement or input handling beyond R/1/2/3 keys for minimap interaction — player controller is Task 4.
- WebGL shaders, PBR materials, POM parallax — Task 3 and Task 5 respectively.
- Lighting system, torch flicker visuals, particle effects — Task 6.
- Character sprites or NPCs — Task 8.
- RPG trinity gameplay mechanics (tank/heal/DPS roles, aggro, equipment) — Task 9.
- Full editor parity with prototype's 14 subsystem tabs — Task 7 editor-complete. Task 2 adds only Generator tab.
- Live cross-tab update between editor save and game minimap refresh — game requires manual R press to pick up config changes for Task 2 simplicity. Live update via storage events can be enhancement in Task 7.
- Procedural PBR texture generation — Task 5 materials-pbr-system. Task 2 uses solid colors derived from material JSON base RGB values for minimap visualization.
- Audio system — much later in development timeline.
- Mobile/responsive polish beyond basic functional layout — refinements deferred.
- Performance optimization beyond basic functionality — generator runs once per R press, ~100ms acceptable for Task 2 scope.
