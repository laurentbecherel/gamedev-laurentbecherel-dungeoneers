# Dungeon Generator — Dungeoneers Task 2

Build the procedural dungeon generation subsystem for Dungeoneers, transforming the foundation engine's empty canvas placeholder into a live top-down 2D minimap visualizing generated dungeon layouts with toggleable rendering modes.

**Why procedural generation:** Dungeoneers is a 10-minute delve dungeon crawler where every run should feel distinct yet purposeful. Hand-authoring layouts doesn't scale to the variety needed for replayability, and the ADO GameDev track emphasizes data-driven content. A deterministic generator ensures the same seed produces bit-identical output across runs — critical for regression testing, sharing interesting layouts, and agent evaluation reproducibility.

**Why intentional linear topology over random maze:** Dungeoneers is not a maze crawler — it's a 10-minute delve with narrative pacing. The dungeon must tell a spatial story through its layout alone: a clear main path from entry stair to exit stair, with purposeful detours branching off at specific junctions for optional loot, guardian encounters, armory upgrades, or hidden secrets — then back to the main path to continue the descent. Pure random placement with minimum spanning tree connectivity produces chaotic corridor spaghetti that breaks narrative flow and feels like noise, not design. Instead, the generator must bias toward a strong linear backbone where rooms are placed roughly in sequence along a main axis, side branches are strictly limited in depth and count, and extra loops are very sparse so they feel like intentional shortcuts rather than labyrinthic confusion. The result should read on the minimap as intentional level design — the player always senses the general direction of progress, but is rewarded for exploring well-placed detours.

**Why top-down minimap in Task 2:** First-person 3D rendering is Task 3's scope. Task 2 needs visual proof that the generator works — a top-down 2D view serves as both developer debugging tool and the eventual in-game HUD minimap foundation. Building it as a properly architected renderer class with legend, scale, title, and toggleable modes establishes clean component boundaries early rather than a throwaway sketch.

**Why deterministic over random for content picks:** The same seed must produce bit-identical output every time across all JavaScript engines and runs. This enables golden regression tests, sharing interesting seeds between team members, and reproducible agent evaluation. Any randomness in the pipeline must flow through a seeded source so outputs are fully deterministic given seed + config.

This task builds on Task 1's foundation: config system, JSON asset API, editor file explorer, and server. It adds the world generation subsystem, minimap renderer, and a dedicated generator configuration asset. No WebGL yet, no player movement, no 3D — purely data generation and 2D visualization.

---

## Requirements

### 1. Project Structure

Extend `src/` with these new files and folders:

```
src/
├── world/                       # NEW — dungeon generation subsystem
│   ├── dungeon/
│   │   ├── generator.js         # Main generator — produces DungeonMap from config + seed
│   │   ├── themes.js            # Theme definitions, zone resolution, deterministic utilities
│   │   ├── atlas.js             # Material ID constants and lookup helpers
│   │   └── index.js             # Public API exports
│   ├── map.js                   # Map query facade with helper methods
│   └── items.js                 # Item placement logic (torches etc.)
├── render/                      # NEW — 2D rendering subsystem
│   └── minimap.js               # MinimapRenderer class
├── assets/config/
│   └── generator.json           # NEW — dedicated generator configuration asset
├── config/
│   └── config.js                # MODIFIED — add generator config loader
├── main.js                      # MODIFIED — replace placeholder with live minimap
├── tests/unit/
│   └── generator.test.js        # NEW — unit tests
└── tests/e2e/
    └── game.spec.js             # MODIFIED — minimap interaction tests
```

### 2. Dungeon Generation — Intent and Properties

Implement a generator that produces dungeons satisfying these design properties. How you achieve them is up to you — describe the approach at high level in code comments, but the instruction here specifies what must be true about the output, not which algorithms to use.

**Core design intent — intentional level, not random maze:**

The dungeon represents one level of a larger descent. The player enters via a stair at one side of the map and must reach an exit stair at the opposite side to progress deeper. Between entry and exit lies a main path of chambers connected in sequence — this is the critical path the player follows to complete the level. Along this main path, at specific junctions, short side branches lead to optional content: treasure rooms with loot, armories with equipment upgrades, shrines with boons, guardian chambers with mini-boss encounters, or secret rooms tucked away at depth 2. After exploring a side branch, the player returns to the main path hub junction and continues toward the exit. Occasionally — rarely — a loop shortcut connects two points on the main path or a side branch back to main path, rewarding thorough exploration with faster backtracking. The overall feel on the minimap should be a clear directed flow from left to right (or top to bottom, chosen per seed), with purposeful dead-end spurs, not a tangled maze.

**Required dungeon properties:**

- **Main path connectivity:** The entrance room must reach the exit room via a traversable corridor path. This is the core story requirement — the player must be able to complete the level. Most walkable floor cells should be reachable from the entry position via orthogonal moves (no diagonal through corners). Minor isolated cells due to placement edge cases are acceptable as long as the main path is fully connected.

- **Clear main path:** There exists a primary sequence of rooms from entry to exit forming the critical path. On the minimap in role visualization mode, this path should be visually traceable as a coherent chain across the map — not hidden among chaotic branches.

- **Purposeful room roles assigned by topology:** Rooms along the main path receive roles that create narrative pacing:
  - Exactly one `entrance` room at the start of the main path. This room contains the entry stair — a special wall segment on one edge representing stairs ascending out of the dungeon back toward the surface and lobby area. In the grid data model this is stored as a wall cell like any other wall, but marked distinctively in room metadata so the 3D renderer in a future task can draw it as a stairwell facade rather than flat stone — a "fake wall" that visually reads as stairs going up into darkness. The generator must decide which of the four wall edges of the entrance room hosts this stair, choosing the edge that faces generally opposite to the direction of dungeon progression so the stair feels like an entry point from the outside world, and ensuring the chosen edge does not overlap with the corridor doorway into the room. The chosen edge direction and the specific 3-cell-wide wall segment coordinates must be stored in the room's metadata.
  - Exactly one `exit` room at the end of the main path. Contains an exit stair — same fake-wall concept but representing stairs descending deeper to the next dungeon level. Generator chooses which wall edge faces generally in the direction of main path progression so it reads as leading onward, avoiding overlap with the corridor doorway. Store edge direction and wall segment coordinates in room metadata. The stair wall segment should use a distinct wall material ID so it remains visually identifiable even in top-down minimap material visualization mode, complementing the role-mode color coding.
  - `guardian` rooms at roughly 60-70% and 80-90% along main path — these are mini-boss encounters that gate progress
  - `treasure` rooms at roughly 30-35% and 50-55% along main path, plus occasional side branches — optional loot detours
  - `hub` rooms where main path has 3+ connections — junction decision points
  - `hall` rooms filling remaining main path positions — standard traversal chambers
  - `armory` or `shrine` rooms on side branches at depth 1 from main path — optional upgrade/boon rooms
  - `secret` rooms on side branches at depth 2 from main path — hidden rewards, rare
- **Limited side branch depth:** Side branches extending from main path hubs must not exceed a configurable maximum depth (default 2 rooms deep, ideally 1). Deeper branches create labyrinthic dead ends that break story flow. Depth 1 branches are common purposeful detours; depth 2 branches are rare secrets.
- **Sparse loops:** Extra connections beyond the tree backbone should be very rare — default probability low enough that most dungeons have 0-1 loops, occasional dungeon has 2. Loops should feel like intentional shortcuts rewarding exploration, not maze complexity.
- **Linear placement bias:** Room positions should follow a general progression direction across the map (west-to-east or north-to-south, chosen per seed). A configurable linearity parameter controls how strictly rooms follow this axis versus allowing variation. Higher linearity produces clearer main path readability on minimap.
- **Larger purposeful rooms:** Main path rooms should be noticeably larger on average than side branch rooms, reinforcing visual hierarchy on the minimap. Room sizes configurable with separate ranges for main path vs side rooms.
- **Entry-exit separation:** The entry room and exit room must be substantially separated — at least 30% of map diagonal distance apart — so the dungeon feels like a journey, not adjacent chambers.
- **Deterministic output:** Given identical configuration asset content and identical seed value, the generator must produce bit-identical output every time — same grid array values, same room positions and sizes, same roles, same everything. This enables regression testing and reproducible evaluation.

**Zone progression — single level journey:**

The dungeon uses 5 thematic zones progressing along the main path from entry to exit within this single level (not across multiple levels). Each zone has distinct visual character through material pools, decoration density, height variation, and architecture weights:

- **Entry** (0–15% along main path) — entry stair chamber, grand halls, welcoming atmosphere, well-lit, crafted stonework suggesting a maintained entrance area where adventurers arrive.
- **Antechamber** (15–35%) — entrance halls transitioning to active dungeon, crafted masonry, first encounters, moderate decoration. The dungeon proper begins here.
- **Depths** (35–60%) — rough stone vaults, age showing through cracks and wear, main dungeon body with most rooms and first guardian encounter. Visual storytelling of long-abandoned depths.
- **Sanctum** (60–85%) — moss-covered damp areas with roots breaking through stonework, puddles on floors, overgrown atmosphere suggesting nature reclaiming the depths. Second guardian encounter and hidden treasure rooms.
- **Exit** (85–100%) — shrine-like exit chamber with exit stair leading deeper, climactic atmosphere with hints of otherworldly power below. Distinct from entry — darker, more mystical, suggesting greater danger ahead.

Zone assignment flows from room depth along main path from entry. Rooms at similar progression depth share zone identity, creating coherent visual regions on the minimap in zone visualization mode.

**Architecture, Theme, and Material — how they relate:**

These three concepts form a hierarchy that may be confusing at first, so here's how they fit together in Dungeoneers' data-driven pipeline:

- **Theme** is the top-level container defining the overall dungeon identity for one complete level. Task 2 implements one theme called "classic". A theme contains 5 zones arranged in progression order from entry to exit. Each zone specifies weighted pools describing what materials, architectures, decorations, height profiles, and vault types belong in that thematic area. Themes are data — in Task 2 they live in code as a starting point, but the architecture supports moving them to JSON assets under `assets/themes/` in a future task so designers can author new themes without touching code.

- **Zone** is one thematic region within a theme, covering a specific fraction of the main path progression from entry (0.0) to exit (1.0). When the generator assigns a room its zone, it looks at how far along the main path that room sits topologically — rooms near the start get Entry zone, rooms near the end get Exit zone, middle rooms get Antechamber, Depths, or Sanctum accordingly. Each zone's weighted pools then drive all downstream content choices for rooms in that zone, ensuring visual coherence — rooms in the Sanctum zone will predominantly use mossy materials with high decoration density, while Entry zone rooms use clean ashlar with minimal decoration, creating storytelling through environment alone.

- **Architecture** describes structural style — dungeon masonry, ruined stonework, natural cave, grand cathedral vaulting, wooden construction, crystalline formations, etc. Each zone specifies architecture weights (e.g., Sanctum zone might be 50% dungeon, 30% ruins, 20% cave) and each room picks one architecture deterministically from its zone's weights. Architecture influences material selection bias and will drive procedural texture generation patterns in Task 5. In Task 2 scope, architecture is stored in room metadata and visible in data output but does not yet produce distinct visual differences on the minimap beyond the material colors already assigned — the architecture field is forward-looking infrastructure for the PBR material system.

- **Material** is the concrete surface definition with specific visual properties: numeric ID, name string, base RGB color triplet, roughness value, metalness value, architecture shape hint, descriptive tags, and story tags. Materials live as JSON assets under `src/assets/materials/` (walls.json, floors.json, ceilings.json) editable through the existing asset editor UI. Each zone's weighted material pools reference these material IDs by number with weights — for example, Entry zone wall pool might specify material ID 1 at weight 0.65 and ID 2 at weight 0.35, meaning roughly two thirds of Entry zone walls use material 1. The generator picks materials per room deterministically using a hash of room coordinates and seed, so same seed always yields same material assignments. Room perimeter walls use coherent material (same ID for all walls of one room) creating solid color blocks on minimap in material visualization mode. In Task 2 the minimap renders materials as flat solid colors derived from base RGB; Task 5 expands this into full procedural PBR texture atlases with albedo, normal maps, height maps, roughness/metalness, ambient occlusion, and emissive channels.

The data flow is: Theme → Zone (by main path depth) → Architecture pick (from zone weights) + Material pick (from zone pools) → Room stores all selections → Grid carving paints cells → Minimap visualizes → Future 3D renderer will consume same data for full PBR rendering.

**Material system integration (minimal for Task 2):**

For Task 2 scope, use the existing 2 wall materials, 2 floor materials, and 2 ceiling materials already defined in `src/assets/materials/*.json`. Each room picks materials deterministically from its zone's weighted pools. Room perimeter walls should use coherent material per room (same material for all walls of one room) to create solid color blocks on minimap in material visualization mode. Corridors pick from corridor-specific pools. Full procedural PBR texture generation comes in Task 5 — Task 2 uses solid colors derived from material JSON base RGB values for minimap display.

**Decoration system (data generated, minimally visualized):**

Generate per-cell decoration flags as bitmask values driven by zone probabilities and material type bonuses (e.g., mossy materials increase moss probability, cave materials increase root probability). Define bit constants for wall decorations (column/pillar, moss, vines, arch) and floor/ceiling decorations (broken tiles, puddles, roots, wooden beams). Store in output data structure for future use in 3D renderer — minimap visualization of deco is optional for Task 2 (small dots acceptable, or omit entirely).

**Item placement:**

Place torches throughout the dungeon respecting minimum distance between torches and with configurable bias toward corridors versus rooms (corridors need more wayfinding light). Each torch selects color variant from configured palette. Output torch positions as items array and corresponding light definitions for future renderer use.

**Configuration asset:**

Create `src/assets/config/generator.json` as a dedicated JSON asset file (not embedded in main.json). The editor's existing file system explorer automatically discovers and provides editing UI for any JSON file under `src/assets/` — no custom editor code needed. The file appears in sidebar tree under `assets → config → generator.json`, editable via Visual Editor tab (auto-generated form widgets for numbers, sliders, arrays, nested objects) and Raw JSON tab.

Required configuration fields with suggested defaults tuned for clear linear structure:
- `version`: 1
- `mapW`: 64, `mapH`: 64 — grid dimensions in tiles
- `roomTarget`: 14 — total rooms to place (fewer than old prototype's 32/52 for clearer purposeful structure)
- `mainPathRooms`: 8 — rooms in main path sequence from entry to exit
- `roomAttempts`: 200 — placement attempts before giving up
- `roomSizeMin`: 6, `roomSizeMax`: 14 — room size range in tiles (larger than old 4-11 for more substantial chambers)
- `mainPathRoomSizeBonus`: 2 — extra size added to main path rooms for visual hierarchy
- `linearity`: 0.85 — 0..1 bias strength for linear placement (1.0 very linear, 0.0 random scatter)
- `sideBranchMaxDepth`: 1 — maximum depth of side branches from main path (1 = short detours, 2 = rare secrets allowed)
- `loopExtraChance`: 0.02 — probability of extra loop edges (very low for intentional linear feel)
- `levelCount`: 1 — for future multi-level support, Task 2 uses single level
- `seed`: null — fixed number for reproducibility, or null for random each generation
- `flattenStartRadius`: 2 — tiles around spawn flattened for stable starting area
- `items` object with `maxTorches`, `minTorchDist`, `corridorBias`, `torchOffset`
- `torchColors` array with RGB variants
- `boundaryWallId`: 1 — wall material for map outer boundary
- `corridorWidthMain`: 2 — corridor width in tiles for main path connections (wider for visual hierarchy and comfortable traversal)
- `corridorWidthSide`: 1 — corridor width in tiles for side branch connections (narrower to reinforce that side branches are secondary detours)
- `corridorWidth`: 1 — deprecated fallback, prefer corridorWidthMain/Side

**Seed handling:** Generator function accepts optional seed override parameter. If provided, use it. Else read seed from configuration asset — if non-null number, use that for fixed reproducible output; if null, generate random seed (e.g., from current time). Always include the used seed value in returned dungeon data for display and reproducibility.

**Output data structure:**

The generator must return an object describing the complete dungeon state, suitable for rendering and gameplay systems to consume. At minimum include:
- Grid dimensions and arrays: grid cell types (0 for walkable floor, positive integers for wall material IDs), per-cell floor heights, ceiling heights, decoration bitmasks, floor material IDs, ceiling material IDs — all as typed arrays sized to grid width × height for efficient access
- Start position coordinates (entry room center)
- Seed value used
- Rooms array with per-room properties: position, size, center coordinates, assigned role, zone name, selected materials, architecture type, vault type, depth along main path, and flags indicating whether room lies on main path and at what depth from main path for side branches. Entrance and exit rooms must include stair wall metadata specifying edge direction and 3-cell wall segment coordinates, chosen to avoid overlap with corridor doorways.
- Items array with placed torch positions and properties
- Lights array derived from torches for renderer consumption
- Metadata object summarizing theme, level indices, role counts, zone distribution, edge counts, etc.

Exact field names and structure should follow clear conventions matching the prototype analysis document as reference, adapted for Task 2 scope.

### 3. Map Query Facade

Provide a query interface wrapping the raw dungeon data with convenient helper methods for renderer and future gameplay code to use. Should support checking whether a grid coordinate is walkable, retrieving cell properties at given coordinates with bounds safety, finding which room contains given coordinates, getting start position, and filtering rooms by role. Pure functions with no side effects.

### 4. Minimap Renderer

Implement a properly architected renderer class responsible for drawing the dungeon top-down view on an HTML5 canvas element. This is a central visual component — architect it with clean separation of concerns as it will evolve into the in-game HUD minimap in later tasks.

**Required capabilities:**
- Accept a dungeon data object and render it to canvas
- Support swapping to newly generated dungeon without recreating renderer instance
- Support at least three visualization modes toggleable at runtime, with distinct visual encoding per mode
- Render legend explaining current mode's visual encoding
- Support zoom level adjustment and pan offset for navigating large dungeons
- Follow parchment adventurer's map aesthetic — light parchment background, ink-style rendering

**Visualization modes — what each must communicate:**

*Role mode (default):* Show dungeon topology and narrative structure through room role encoding. Each room colored distinctly by its assigned role so the main path story is immediately readable: entrance room, exit room, guardian rooms as major encounters along the path, treasure rooms as optional objectives, hubs as junction decision points, side branch rooms (armory, shrine, secret) distinguishable from main path halls. Corridors in medium gray, walls as dark ink borders. No text labels overlaid on rooms — the legend provides role identification, keeping the map clean and readable. The minimap should tell the dungeon's story at a glance through color alone — follow the chain of rooms from entrance to exit, spot guardian encounters blocking the way, notice gold treasure detours branching off.

*Zone mode:* Show thematic progression through the level via color tinting reflecting the 5 zones from entry to exit. Each zone uses distinct hue progressing from warm light tones at entry through to deep cool tones at exit, communicating the single-level journey spatially. Apply as overlay tint over base floor colors so underlying structure remains visible. Walls stay dark for contrast. Zone names in legend must match single-level semantics: Entry, Antechamber, Depths, Sanctum, Exit.

*Material mode:* Show material distribution for debugging and validating coherent room wall painting. Wall cells colored by wall material ID, floor cells by floor material ID, using colors derived from material JSON definitions. Rooms should appear as solid coherent color blocks validating that wall painting assigns consistent material per room perimeter. Corridors show corridor pool materials distinctly.

**Legend — what it must show:**

Legend positioned below the centered minimap as a horizontal strip of color swatches paired with text labels. Shows proper full role names: Entrance, Exit, Guardian, Treasure, Hub, Hall, Armory, Shrine, Secret (no abbreviations). Must update dynamically when mode changes — switching from role to zone mode replaces role swatches with zone swatches seamlessly. Legend uses parchment panel styling matching the map aesthetic.

**Grid rendering approach:**

Full canvas background is warm light parchment (`#e8dcc4`) with subtle texture scanlines. Calculate appropriate cell pixel size to fit the full dungeon grid within canvas bounds while preserving aspect ratio, centering the minimap horizontally and vertically with legend below. Rooms render as solid rounded rectangles (not per-cell grids) with dark ink wall borders — rounded corners give a hand-drawn parchment map feel. Corridors render as solid connecting rectangles. Empty space outside the dungeon structure remains parchment — only wall cells adjacent to floors are drawn as dark ink, so the map reads as ink on paper rather than dark void.

Entrance and exit positions are indicated solely by stair markers at their respective wall locations — a single clear visual indicator per stair, positioned at the 3-cell wall segment coordinates stored in room metadata, using distinct directional glyphs (upward for entrance stair ascending toward surface, downward for exit stair descending deeper) rendered with high contrast against parchment so they remain clearly visible at typical zoom levels. No separate room-center markers and no text labels overlaid on rooms — the stair markers serve as both position indicators and stair placement verification, while the legend provides role identification for all room types.

**Interaction requirements:**

Keyboard controls on game page for interacting with minimap without mouse dependency:
- Number keys 1, 2, 3 switch between role, zone, and material visualization modes respectively, updating legend and re-rendering immediately
- R key triggers dungeon regeneration with new random seed (unless config specifies fixed seed), updating minimap display and HUD
- Plus and minus keys (or equals and underscore) adjust zoom level centered on canvas
- Optional mouse wheel zoom and drag-to-pan when zoomed are nice enhancements but not required for Task 2 — architect the renderer class to support pan offset so these can be added easily later without restructuring

**Visual design consistency:**

The minimap uses a parchment adventurer's map aesthetic distinct from the site's dark UI chrome: warm light parchment background (`#e8dcc4`) with subtle texture, ink-style rendering in grayscale with gold accent (`#c9a84c`) for treasure rooms only. Rooms render as solid rounded rectangles with dark ink borders — no per-cell grid appearance. Empty space outside the dungeon structure remains parchment; only walls adjacent to floors render as dark ink.

Font is configurable via `src/assets/config/main.json` under the `minimap` key — default is Pixelify Sans (Google Fonts) with Georgia serif fallback, fitting the retro pixel game aesthetic on parchment. The font must be loaded dynamically from config at runtime using the Font Loading API before canvas text rendering, with no hardcoded font names in renderer code. Legend text and S/E markers use the configured minimap font. Site UI chrome (headers, buttons) continues using Inter / JetBrains Mono from Task 1.

### 5. Game Page Integration

Update the game page JavaScript to replace Task 1's static placeholder canvas drawing with live minimap functionality:

On page load, fetch both main configuration and generator configuration assets via the unified asset API, invoke the dungeon generator with merged configuration, create minimap renderer instance bound to the game canvas element, and render the initial dungeon view. The HUD status pill is hidden — the minimap is self-contained with its legend providing all necessary context.

Add keyboard event handling for R (regenerate), 1/2/3 (mode toggle), and +/- (zoom) as described in minimap interaction requirements. On regeneration, fetch fresh config (in case editor changes were saved), generate new dungeon, update minimap renderer with new data, and log dungeon summary to browser console for debugging visibility.

Handle configuration fetch or generation failures gracefully while keeping canvas in a safe state — no uncaught exceptions breaking the page.

### 6. Configuration Asset Structure

Create `src/assets/config/generator.json` as described in section 2 above with all required fields and sensible defaults tuned for intentional linear dungeon feel. The existing editor file system explorer automatically provides editing UI — no additional editor code required beyond ensuring the file exists with valid JSON schema and is discoverable via the asset API.

Extend the client-side configuration module to export dedicated loader functions for the generator configuration asset, following the same caching pattern established for main configuration in Task 1.

Update the existing `src/assets/config/main.json` to remove generator-related fields now housed in the dedicated file, keeping it focused on core engine settings (renderer resolution, player movement parameters, version). Add a `minimap` section with configurable font settings: `fontFamily` (display name for canvas, e.g. "Pixelify Sans"), `fontFallback` (CSS fallback stack, e.g. "monospace"), and `fontGoogleName` (URL-encoded Google Fonts name with weights, e.g. "Pixelify+Sans:wght@400;600;700"). The game page must load the font dynamically from config at runtime — no hardcoded font names in HTML or renderer code.

### 7. Tests

**Unit tests** using Node.js built-in test runner at `src/tests/unit/generator.test.js`:

- Determinism: same configuration + same seed produces bit-identical output across multiple invocations — compare grid arrays, room arrays deeply for equality
- Connectivity: entrance room and exit room must be connected via traversable corridor path (core story requirement). Most walkable floor cells should be reachable from entry — allow tolerance for minor edge-case isolated cells as long as main path is fully connected.
- Role assignment: generated dungeon contains exactly one entrance room and exactly one exit room, with at least some special-role rooms (guardian, treasure, or hub) distributed along main path
- Start-exit separation: Manhattan or Euclidean distance between entrance and exit room centers substantial relative to map dimensions — dungeon should feel like a journey not adjacent chambers
- Bounds respect: all room coordinates within grid bounds with safe margins, no out-of-bounds array access during generation
- Material validity: all wall, floor, and ceiling material IDs referenced in output arrays correspond to valid entries in respective material JSON asset files
- Deterministic hash: hash utility function returns identical values across repeated calls with same inputs, and different values for different inputs, normalized to expected range

**End-to-end tests** updating `src/tests/e2e/game.spec.js`:

- Game page loads without console errors and canvas element renders with non-empty content
- Canvas renders dungeon on load (verify via absence of console errors and successful page load — visual content is canvas-based)
- Pressing R key triggers regeneration without console errors
- Pressing number keys 1, 2, 3 switches visualization modes and triggers re-render without console errors
- Back to home navigation link functions correctly

Extend existing editor E2E tests to account for new generator.json asset appearing in file tree — adjust selectors to explicitly target intended files rather than assuming first file in tree order.

### 8. Acceptance Criteria

- [ ] `src/world/dungeon/generator.js` exists exporting generator function accepting config and optional seed override, returning dungeon data object with required structure
- [ ] `src/world/dungeon/themes.js` exists with zone resolution, theme definitions using single-level zone names (Entry, Antechamber, Depths, Sanctum, Exit), deterministic hash utility, and weighted selection helper
- [ ] `src/world/dungeon/atlas.js` exists with material ID constants, grid cell type constants, and decoration bitmask definitions
- [ ] `src/world/dungeon/index.js` exports public generator API
- [ ] `src/world/map.js` exists providing map query facade with walkability check, cell property retrieval, room lookup, start position, and role filtering capabilities
- [ ] `src/world/items.js` exists implementing item placement respecting configured constraints
- [ ] `src/render/minimap.js` exists exporting renderer class with methods for setting dungeon data, switching modes, adjusting zoom/pan, and rendering complete minimap with grid and legend components
- [ ] Game page canvas displays live minimap on load replacing Task 1 placeholder — dungeon layout clearly visible with distinguishable rooms and corridors on parchment background
- [ ] Minimap renders a clear linear main path from entry to exit with purposeful side branches visible as short dead-end spurs — layout reads as intentional level design not random maze on visual inspection across multiple regenerations
- [ ] Role visualization mode is default, showing rooms as solid rounded rectangles color-coded by role with dark ink borders — no text labels overlaid on rooms, legend provides identification
- [ ] Zone mode shows 5 distinct thematic regions progressing spatially from entry side to exit side with appropriate tints and updated zone names in legend
- [ ] Material mode shows coherent per-room wall colors and distinct floor materials validating material assignment logic
- [ ] Legend renders below centered minimap with proper full role names (Entrance, Exit, Guardian, Treasure, Hub, Hall, Armory, Shrine, Secret — no abbreviations), updating dynamically when visualization mode changes via keyboard
- [ ] Canvas background is warm parchment throughout; empty space outside dungeon structure shows as parchment, not dark walls — only walls adjacent to floors render as dark ink
- [ ] Entrance and exit positions indicated solely by stair markers at their wall locations — single clear visual indicator per stair with directional glyph (upward for entrance, downward for exit), clearly visible against parchment at typical zoom levels, no separate room-center markers or text labels
- [ ] R key regenerates dungeon and updates display
- [ ] Number keys 1, 2, 3 switch visualization modes with immediate visual update
- [ ] HUD status pill is hidden — minimap is self-contained
- [ ] `src/assets/config/generator.json` exists as dedicated asset file with all required configuration fields and sensible defaults for intentional linear design (reduced room count, low loop probability, linearity bias, side branch depth limit, larger room sizes)
- [ ] `src/assets/config/main.json` updated to remove generator-related fields, add `minimap` section with configurable font settings (`fontFamily`, `fontFallback`, `fontGoogleName`) — no hardcoded font names
- [ ] Editor file system explorer shows `generator.json` under assets config folder — this uses the generic JSON asset editor UI provided by Task 1 (file tree sidebar with Visual Editor tab showing auto-generated form widgets, and Raw JSON tab). Task 2 does NOT add custom editor tabs; the dedicated 14-tab editor UI is Task 7 scope. The required screenshot must show the generic editor with generator.json open in the file tree, not a custom Generator tab. The generic editor provides editing via Visual Editor with appropriate form widgets and via Raw JSON tab, persisting correctly via asset API
- [ ] Client configuration module extended with generator config loader following established caching pattern
- [ ] Game page dynamically loads minimap font from config at runtime via Font Loading API before canvas rendering
- [ ] MinimapRenderer accepts font configuration via constructor options, no hardcoded font names in renderer code
- [ ] Unit test suite covers determinism, connectivity including entry-exit path guarantee, role assignment, start-exit separation, bounds, material validity, hash determinism, stair wall doorway avoidance, side branch depth limit, room size hierarchy, zone progression, and item placement constraints — all passing
- [ ] E2E test suite covers minimap rendering with canvas pixel verification, regeneration interaction, mode toggle, and no console errors — all passing
- [ ] Full test suite passes via npm test command without errors
- [ ] No console errors during normal game page or editor page operation
- [ ] Determinism property verified through unit test — same seed produces identical output
- [ ] Main path connectivity guaranteed — entry room always reaches exit room via traversable corridor path across all tested seeds (validated by unit test flood fill check specifically asserting exit reachability)

## Out of Scope for This Task

- First-person 3D rendering or WebGL — Task 3 scope. Task 2 strictly top-down 2D minimap visualization.
- Player movement, collision, or input beyond minimap interaction keys — player controller is Task 4.
- WebGL shaders, procedural PBR materials, parallax occlusion mapping — Tasks 3 and 5.
- Dynamic lighting, torch flicker visuals, particle effects — Task 6.
- Character sprites, NPCs, billboard rendering — Task 8.
- RPG gameplay mechanics including trinity roles, aggro/threat, equipment, boons, run loop — Task 9.
- Full editor with 14 subsystem-specific tabs — Task 7. Task 2 relies on generic JSON asset editor via file system explorer for generator configuration.
- Live cross-tab synchronization between editor saves and game minimap — manual R-key refresh sufficient for Task 2.
- Procedural texture generation — Task 5. Task 2 minimap uses solid colors from material definitions.
- Audio, mobile responsiveness polish, performance optimization beyond functional correctness.
