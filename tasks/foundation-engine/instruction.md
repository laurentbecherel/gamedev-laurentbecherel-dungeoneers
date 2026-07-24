# Foundation Engine — Dungeoneers Task 1

Build the foundational engine structure for Dungeoneers, a retro dungeon crawler built on a lightweight custom engine layer rather than an off-the-shelf game framework.

**Why custom lightweight:** Dungeoneers will use bespoke rendering techniques — starting from a column-based raycaster evolving toward WebGL2 with procedural PBR materials, parallax occlusion mapping, and torch-based lighting — alongside a fully data-driven asset pipeline where game content (materials, themes, dungeon architectures, runtime parameters) lives as editable JSON. A heavyweight engine would impose incompatible asset formats, editor paradigms, and rendering abstractions that fight the retro-first-person aesthetic and the need for live parameter tuning during development. A minimal custom scaffolding gives full control over the rendering pipeline, asset formats, and editor workflow from day one.

This task establishes that scaffolding: a Node.js server with unified asset REST API persisting JSON to disk, a landing page introducing the game, a fullscreen game runtime page with canvas placeholder, a live asset editor with dual-mode (visual widgets + raw JSON) editing, a cohesive design system shared across all pages, and Playwright end-to-end test coverage. No gameplay logic yet — this is the foundation upon which dungeon generation, rendering, entities, and RPG systems build incrementally in subsequent tasks.

The editor is central from day one because retro crawler feel depends heavily on parameter tuning — movement speed, field of view, material properties, light falloff, dungeon generation seeds. A live editor writing directly to disk (not localStorage) enables iteration without touching code, with changes tracked naturally via git alongside source.

## Requirements

### 1. Project Structure
Create project with this layout:
```
/
├── src/                      # Full self-contained project
│   ├── index.html            # Landing page with hero, features, navigation
│   ├── game.html             # Fullscreen game canvas entry point
│   ├── editor.html           # Editor with sidebar navigation and asset panels
│   ├── main.js               # Game bootstrap — fullscreen canvas, config HUD
│   ├── editor.js             # Editor bootstrap — sidebar nav, asset editor
│   ├── style.css             # Shared design system (CSS variables, components)
│   ├── config/
│   │   └── config.js         # Unified asset API client (config is an asset)
│   ├── assets/               # All JSON data assets including config
│   │   ├── config/
│   │   │   └── main.json     # Game configuration (unified asset)
│   │   ├── materials/
│   │   │   ├── walls.json
│   │   │   ├── floors.json
│   │   │   ├── ceils.json
│   │   │   └── architectures.json
│   │   └── themes/
│   │       └── themes.json
│   ├── server/               # Server-side Node.js application
│   │   └── server.js         # HTTP server with unified asset REST API
│   ├── tests/                # Playwright E2E test suite
│   │   ├── playwright.config.js
│   │   └── e2e/
│   │       ├── landing.spec.js
│   │       ├── game.spec.js
│   │       └── editor.spec.js
│   └── package.json          # Node dependencies and npm scripts
└── README.md                 # Running instructions
```

### 2. Server with Unified Asset REST API (src/server/server.js)
Build a Node.js HTTP server serving static files AND providing REST API endpoints. Use Node's built-in `http` module to minimize dependencies, OR Express if preferred (add to package.json dependencies).

**Server responsibilities:**
- Serve static files from `src/` directory at root path `/` over HTTP (enables ES modules — no file:// restriction)
- Provide unified REST API endpoints under `/api/` prefix — config is treated as an asset under `assets/config/` category
- Handle CORS headers (straightforward since same origin serving)
- Listen on configurable port (default 8000, override via PORT env var)
- Graceful shutdown on SIGINT/SIGTERM signals

**Required API endpoints:**

`GET /api/assets`
- Returns list of available JSON assets with metadata across all categories including config.
- Scans `src/assets/*/` directories dynamically — each subfolder name becomes a category. Scans all `.json` files within each category folder.
- Response: 200 with JSON array like `[{"category":"config","name":"main","path":"config/main.json","itemCount":4}, {"category":"materials","name":"walls","path":"materials/walls.json","itemCount":2}, ...]`
- itemCount heuristic: if top-level value is array, use array length; else find first array-valued field in object and use its length; else count top-level object keys. Fully generic — no hardcoded field names.

`GET /api/assets/:category/:name`
- Serves specific JSON asset file content dynamically.
- Category is any valid subfolder name under `src/assets/` — validated server-side against existing directories to prevent path traversal. Name without extension derived from filename, e.g., `main`, `walls`, `floors`, etc.
- Reads corresponding file from `src/assets/{category}/{name}.json` — config lives at `src/assets/config/main.json`, parses and returns as JSON.
- Response: 200 with JSON body on success, 404 with JSON error if file not found or category invalid.

`PUT /api/assets/:category/:name`
- Accepts JSON body with updated asset content.
- Validates basic structure by asset type:
  - walls/floors/ceils: expect object with `materials` array field, OR array directly (support both for flexibility). Each material in array should have at least `id` (number) and `name` (string) fields — warn but don't reject if missing, as schema may evolve.
  - architectures: expect object with either `architectures` array field or direct object mapping IDs to definitions.
  - themes: expect object with `themes` field or direct object mapping.
- Writes updated JSON back to `src/assets/{category}/{name}.json` on disk, pretty-printed with 2-space indentation for version control readability.
- Returns 200 with success JSON on write success, 400 with error JSON on validation failure, 404 if category/name invalid.

**Server startup and package.json:**
- `cd src && node server/server.js` (or `npm start`) starts the server.
- `package.json` lives at `src/package.json` since `src/` is the self-contained project root.
- Must define npm scripts: `start` to launch the server, `test` to run Playwright headless, `test:ui` for Playwright UI mode.
- Must set `"type": "module"` for ES module support in Node.js.
- Dev dependency: `@playwright/test` at appropriate recent version for E2E testing. If using Express instead of Node built-in http module, add express as runtime dependency.
- Server must log startup confirmation message including the port number to console.
- Server should log API requests for debugging purposes (method, path, status code).

### 3. Landing Page (src/index.html)
- HTML5 boilerplate with Google Fonts (Inter for UI, JetBrains Mono for code/data)
- Elegant landing page with cohesive design system — NOT the game itself.
- Design system via CSS variables in style.css: dark theme with gold accent (#c9a84c), elevated surfaces, soft borders, generous spacing scale, subtle shadows and glows.
- Content sections:
  - Game title/logo area with tagline: "Tank. Heal. Loot. Clock Out."
  - Short pitch paragraph describing 4-player co-op retro dungeon crawler concept
  - Top bar navigation (consistent across all pages, see Navigation System section) with Play and Editor links using Phosphor icons before text labels.
  Two prominent hero action buttons/links with Phosphor icons:
    * "Play Game" (with ph-play icon before text) → links to `game.html`
    * "Open Editor" (with ph-wrench icon before text) → links to `editor.html`
  - Optional: brief feature list, controls reference, or "About" section
- Styling via style.css design system — dark dungeon aesthetic with CSS variables for colors, spacing, radius, shadows. Hero section with radial gradient and subtle scanline texture overlay. Feature cards in responsive grid. Elegant typography hierarchy with Inter font family.
- No JavaScript required for landing page functionality beyond basic link navigation, but may include landing.js for subtle animations or dynamic content if desired (optional).
- This page served at root path `/` when user visits http://localhost:8000/

### Navigation System (shared across all pages)
All three pages share a consistent top bar navigation component with identical structure, styling, and icon usage:

- **HTML structure** (same on every page):
  ```html
  <header class="topbar [page-specific-class]">
    <div class="brand">DUNGEONEERS</div>  <!-- or "DUNGEONEERS EDITOR" on editor page -->
    <div class="spacer"></div>
    <a class="btn btn-ghost" href="..."><i class="ph ph-..."></i> Label</a>
    <a class="btn btn-ghost" href="..."><i class="ph ph-..."></i> Label</a>
  </header>
  ```
- **Layout**: brand/title on left, spacer flex pushes navigation to right, two ghost-style buttons on right
- **Icon placement**: Phosphor icon always BEFORE text label in navigation buttons, consistent across all pages
- **Icon mapping**: Home → `ph-house`, Play/Game → `ph-play`, Editor → `ph-wrench`
- **Styling**: shared `.topbar` CSS class with dark elevated background, bottom border, 52px height. Game page uses `.game-topbar` variant with gradient overlay and transparent background for fullscreen immersion, but same HTML structure and button styles.
- **Page-specific navigation**:
  * Landing (`index.html`): brand "DUNGEONEERS", right nav has Play → game.html and Editor → editor.html
  * Game (`game.html`): brand "DUNGEONEERS", right nav has Home → index.html and Editor → editor.html
  * Editor (`editor.html`): brand "DUNGEONEERS EDITOR", right nav has Play → game.html and Home → index.html

### 4. Game Page (src/game.html) — Fullscreen Canvas
- HTML5 boilerplate with Google Fonts and Phosphor Icons CDN (@phosphor-icons/web), title "Dungeoneers". Consistent top bar navigation shared across all pages. No emoji — Phosphor icons only.
- **Fullscreen layout**: body has no margins, black background, canvas fills viewport while maintaining 640×360 internal resolution scaled via CSS to fit window preserving aspect ratio
- Canvas element with id="game-canvas", width 640, height 360 internal resolution
- Top bar uses shared navigation component with `.topbar.game-topbar` classes — gradient overlay variant for fullscreen immersion, same button structure as other pages (brand left, Home and Editor links right with icons before text)
- Fixed bottom HUD pill showing config status (version, resolution, player speed, map size) — semi-transparent backdrop-blur design
- Loads main.js as ES module
- Styling: pure black background (#000), canvas centered in viewport flex container, scaled responsively via JavaScript calculating scale factor from window dimensions
- Placeholder rendering via main.js: canvas with dark background, subtle scanline pattern, centered "DUNGEONEERS" title in gold accent color with Inter font, subtitle and resolution info
- Fetches config from unified asset API (`/api/assets/config/main`) on load, displays in HUD, logs to console

### 5. Editor Page (src/editor.html) — Dual-Mode Asset Editor with Folder Tree
- HTML5 boilerplate with Google Fonts (Inter + JetBrains Mono) and Phosphor Icons CDN (@phosphor-icons/web), title "Dungeoneers Editor". No emoji characters — all icons via Phosphor <i> tags.
- **Elegant three-panel layout with resizable sidebar**: top bar with branding and actions, left sidebar as folder tree explorer, draggable resizer bar (4px) between sidebar and main panel allowing width adjustment from 180px to 480px, main content area with tabbed editor
- Design system: CSS variables for colors/spacing/radius/shadows, Inter sans-serif + JetBrains Mono monospace typography, Phosphor Icons icon system via CDN (@phosphor-icons/web), gold accent theme. Sidebar with active state highlighting. Top bar with Save Changes button and status pills.
- Loads editor.js as ES module
- **Folder tree explorer sidebar**: fully generic file explorer reflecting actual folder hierarchy under `src/assets/`. Root "assets" folder node at top level, expandable/collapsible with chevron toggle (▼/▶). Each subfolder becomes a collapsible category node sorted alphabetically, with auto-formatted labels (snake/kebab-case to Title Case). Each JSON file appears as a leaf node under its folder with `.json` extension shown and item count badge. Clicking a file node loads it into the editor panel and highlights active state. No hardcoded category names, labels, or icons anywhere — entirely driven by filesystem structure discovered via API. Collapsed/expanded state tracked in memory per folder.
- **Dual-mode editor panel with tabs** (Visual Editor default, Raw JSON secondary):
  - **Visual Editor tab (default)**: Generic form renderer inspects JSON structure and generates appropriate widgets automatically — no hardcoded schemas per asset type. Widget mapping:
    * `number` → number input; for 0-1 ranges also synchronized range slider
    * `string` → text input
    * `boolean` → toggle switch with enabled/disabled label
    * `null` → text input with null placeholder
    * Array of 3 numbers (RGB) → color picker + RGB number trio kept in sync
    * Array of objects → expandable card list with per-item header, delete button, Add item button
    * Nested object → indented fieldset with left border, recursive rendering
    * Field labels auto-generated from keys with capitalized words
  - **Raw JSON tab**: monospace textarea with pretty-printed JSON for power users. Switching tabs syncs bidirectionally — visual edits update object live via oninput; switching to raw serializes; switching back parses (error pill shown and stays in raw if invalid).
- **Buttons wired to unified asset API:**
  - **Save Changes** (top bar, sole action button) → collects current data from active mode → PUT to `/api/assets/{category}/{name}` → status pill feedback (green ok / red err)
  - No reset, export, or import buttons — version control handled via git; edit JSON files directly or via editor and commit normally
- **Asset navigation:** fetch list from `/api/assets` on load — server scans `src/assets/*/` folders dynamically. Build tree UI with root assets node containing collapsible folder nodes per category, each containing file leaf nodes. Click file node to load asset into Visual mode by default. Save PUTs to unified endpoint. Config treated identically to other assets. Sidebar width adjustable via drag resizer.
- **Widget styling:** tabs with active underline accent; uppercase field labels; dark inputs with accent glow on focus; custom range sliders; sliding toggle pills; color picker squares; array cards with header bar and delete; nested left-border indents; rounded status pills
- Top bar navigation links use Phosphor house icon for Home and wrench icon for Editor / play icon for Play

### 6. Unified Asset API Client (src/config/config.js)
Client-side module providing unified API client for all assets including config. Config is just another asset under `config` category accessed via the same asset API paths as all other game data — no separate config-specific endpoints exist at all.

**Must export async functions:**

`async getConfig()`
- GET fetch to `/api/assets/config/main`
- On success (200): parse JSON response, cache result, return config object
- On failure: log error and throw — config asset must exist at `src/assets/config/main.json`, no fallback defaults
- Always returns Promise resolving to config object, throws on error

`async saveConfig(cfg)`
- PUT fetch to `/api/assets/config/main` with cfg JSON-stringified in request body
- On 200 response: update cache, dispatch CustomEvent, return true
- On non-200 or network error: log error and throw

`async getAssetList()`
- GET fetch to `/api/assets`
- Returns array of asset metadata objects, or empty array on failure

`async getAsset(category, name)`
- GET fetch to `/api/assets/{category}/{name}` — category validated server-side against existing asset folders
- Returns parsed JSON or null on failure

`async saveAsset(category, name, data)`
- PUT fetch to `/api/assets/{category}/{name}` — writes back to corresponding JSON file on disk
- Returns boolean success

**Helper functions:**
- `clone(obj)` — JSON parse/stringify deep clone for safe copying
- No deepMerge needed — config asset is authoritative source of truth, no fallback merging

**Config asset structure (`src/assets/config/main.json`, version 1):**
```json
{
  "version": 1,
  "renderer": { "resolution": "640x360", "authentic": true },
  "player": { "moveSpeed": 3.0, "mouseSensitivity": 0.0022 },
  "generator": { "mapW": 32, "mapH": 32, "seed": null }
}
```
Config lives as a regular JSON asset file on disk — no hardcoded defaults in code. Server returns 404 if missing; client throws error.

**Caching strategy:**
- Module-level `_cache` variable holds last fetched config
- getConfig checks cache first, fetches from unified asset API only on cache miss
- saveConfig updates cache on success and dispatches CustomEvent

**Event pattern for cross-tab updates (optional for foundation, nice to have):**
- saveConfig dispatches CustomEvent on successful save
- Game page (if open in another browser tab) could listen for storage events OR poll periodically OR require manual refresh — for foundation task, manual refresh acceptable. Live cross-tab update via BroadcastChannel or storage event listening can be enhancement in later task.

### 7. JSON Assets Structure (Unified)
Create placeholder JSON files in `src/assets/` defining schemas with example entries. Config is stored as `src/assets/config/main.json` alongside other assets — unified storage model. All assets edited via same PUT `/api/assets/{category}/{name}` endpoint.

**Required files with example schema (note config/ category added):**

`src/assets/config/main.json`:
```json
{
  "version": 1,
  "renderer": { "resolution": "640x360", "authentic": true },
  "player": { "moveSpeed": 3.0, "mouseSensitivity": 0.0022 },
  "generator": { "mapW": 32, "mapH": 32, "seed": null }
}
```

`src/assets/materials/walls.json`:
```json
{
  "version": 1,
  "materials": [
    {
      "id": 1,
      "name": "dungeon_brick",
      "type": "brick",
      "base": [138, 58, 44],
      "roughness": 0.85,
      "metal": 0,
      "tag": "masonry",
      "role": "Basic dungeon brick wall",
      "architectureShape": "brick_bond",
      "tileScale": 1,
      "variationSeed": 101,
      "emissiveColor": [0, 0, 0],
      "emissiveStrength": 0,
      "storyTags": ["dungeon"]
    },
    {
      "id": 2,
      "name": "rough_stone",
      "type": "stone_block",
      "base": [102, 100, 92],
      "roughness": 0.92,
      "metal": 0,
      "tag": "masonry",
      "role": "Rough natural stone blocks",
      "architectureShape": "ashlar_rough",
      "tileScale": 1,
      "variationSeed": 102,
      "emissiveColor": [0, 0, 0],
      "emissiveStrength": 0,
      "storyTags": ["dungeon", "cave"]
    }
  ]
}
```

`src/assets/materials/floors.json` — similar structure with 2 example floor materials (e.g., stone slabs and cobblestone).

`src/assets/materials/ceils.json` — similar with 2 example ceiling materials (e.g., flat stone slabs and wooden beams).

`src/assets/materials/architectures.json`:
```json
{
  "version": 1,
  "architectures": [
    {
      "id": "dungeon",
      "name": "Dungeon",
      "description": "Standard dungeon masonry",
      "wallShapes": {"brick_bond": 0.6, "ashlar_rough": 0.4},
      "floorShapes": {"slab": 0.7, "cobble": 0.3},
      "ceilShapes": {"slab": 0.8, "beams": 0.2},
      "decoMult": {"moss": 1.0, "column": 1.0, "broken": 1.0},
      "pillar": {"spacing": 4, "columnChance": 0.35},
      "storyTags": ["dungeon"]
    }
  ]
}
```

`src/assets/themes/themes.json`:
```json
{
  "version": 1,
  "themes": {
    "basic": {
      "id": "basic",
      "name": "Basic Dungeon",
      "description": "Simple single-zone dungeon theme for foundation testing",
      "boundaryWallId": 1,
      "corridor": {
        "wallPool": [{"id": 1, "weight": 1.0}],
        "floorPool": [{"id": 1, "weight": 1.0}],
        "ceilPool": [{"id": 1, "weight": 1.0}],
        "deco": {"moss": 0.1, "column": 0.2, "broken": 0.05},
        "pillar": {"spacing": 4, "columnChance": 0.3, "useCarvedId": 1}
      },
      "zones": [
        {
          "name": "Main",
          "tStart": 0.0,
          "tEnd": 1.01,
          "wallPool": [{"id": 1, "weight": 0.7}, {"id": 2, "weight": 0.3}],
          "floorPool": [{"id": 1, "weight": 0.8}, {"id": 2, "weight": 0.2}],
          "ceilPool": [{"id": 1, "weight": 0.9}, {"id": 2, "weight": 0.1}],
          "deco": {"moss": 0.15, "column": 0.25, "broken": 0.08, "puddle": 0.05},
          "height": {
            "floorMin": -0.05, "floorMax": 0.05, "floorBlockAmp": 0.04,
            "ceilMin": 1.0, "ceilMax": 1.2, "ceilJitter": 0.05,
            "vaultWeights": [{"type": 0, "weight": 1.0}]
          },
          "pillar": {"spacing": 4, "columnChance": 0.35, "useCarvedId": 1},
          "architectureWeights": {"dungeon": 1.0}
        }
      ]
    }
  }
}
```

For foundation task, minimal example data sufficient — 2 materials per type demonstrates array structure and API roundtrip works. Full 16/10/8 materials come in later tasks.

### 8. Test Suite — Unit Tests and Playwright E2E

Create two complementary test suites validating the foundation from different angles: unit tests for server-side asset handling logic, and end-to-end tests for full-stack user flows across all three pages.

**Test structure:**
- Unit tests at `src/tests/unit/` using Node.js built-in test runner (`node --test`) — no additional test framework dependency needed beyond Node itself
- E2E tests at `src/tests/e2e/` using Playwright
- `package.json` scripts should expose: `test:unit` running Node test runner on unit test files, `test:e2e` running Playwright, and `test` running both in sequence

**Unit test coverage expectations (`server.test.js` or similar):**

The server exposes pure functions for asset file handling that deserve direct unit testing independent of HTTP layer complexity. Tests should start the server programmatically on an alternate port to avoid conflicts, exercise edge cases via HTTP requests, and clean up temporary test artifacts afterward.

Expected test scenarios:
- Item counting heuristic correctness across different JSON structures — arrays at top level, objects containing array-valued fields, objects with only scalar fields, and empty objects should each produce expected counts used for sidebar badges
- Path traversal attacks are blocked — requests attempting directory traversal via `../` segments or URL-encoded variants must not escape the assets directory and should return 404
- Invalid category and asset names containing characters outside the safe alphanumeric/underscore/hyphen pattern are rejected appropriately
- Malformed JSON in PUT request bodies results in 400 response with error details rather than server crash
- Requests for non-existent assets return 404 with clear error messaging
- Save and load roundtrip preserves data exactly and writes pretty-printed JSON with consistent indentation to disk — verify by reading file content back from filesystem after API write
- New category folders created under `src/assets/` are automatically discovered by subsequent API list requests without requiring server restart or code changes, demonstrating the fully generic folder-driven architecture

**Playwright E2E setup:**
- Add `@playwright/test` to devDependencies in package.json
- Run `cd src && npx playwright install` once to download browser binaries (document in README)
- Create `src/playwright.config.js` with configuration specifying test directory, base URL pointing to local server, HTML reporter, trace capture on retry, CI-appropriate settings, and webServer configuration to launch the Node.js server automatically before test run with health check URL and timeout.

**Test files to create in `tests/e2e/`:**

`landing.spec.js` — Landing page tests:
- Landing page loads at root URL `/` without errors
- Page title contains "Dungeoneers"
- "Play Game" link exists and points to game.html (or navigates correctly when clicked)
- "Open Editor" link exists and points to editor.html
- No console errors on page load
- Basic content visible (title, tagline, buttons)

`game.spec.js` — Game page tests:
- Game page loads at `/game.html` without errors
- Page title contains "Dungeoneers"
- Canvas element with id="game-canvas" exists with correct dimensions (640x360 attributes)
- Canvas renders placeholder content (check via evaluating canvas toDataURL or checking 2D context operations — at minimum verify canvas element present and main.js loaded without errors)
- Config fetched from API on load (verify via checking console logs or network requests — Playwright can intercept/wait for API calls)
- Back to Home link exists pointing to index.html (landing page)
- No console errors related to config loading or canvas setup

`editor.spec.js` — Editor page tests:
- Editor page loads at `/editor.html` without errors, title contains "Editor"
- Folder tree sidebar is visible and populated with asset categories discovered from API
- Clicking a file node in the tree loads asset content into editor panel
- Visual Editor tab is active by default showing structured form widgets; Raw JSON tab is available and switchable
- Save Changes button exists, is clickable, and triggers successful API request with status feedback visible on click
- Asset edit flow: select asset from tree → switch to Raw JSON tab → modify JSON content → save → verify success feedback → optionally verify persistence via direct API GET → restore original to leave clean state
- No console errors during normal editor operation

**Running tests:**
```bash
# Install Playwright browsers (first time only):
cd src && npx playwright install

# Run all tests (unit + E2E):
cd src && npm test

# Run only unit tests (fast, no browser):
cd src && npm run test:unit
# or: cd src && node --test tests/unit/*.test.js

# Run only E2E tests:
cd src && npm run test:e2e
# or: cd src && npx playwright test

# Run E2E with UI mode for debugging:
cd src && npm run test:ui

# Run specific test file:
cd src && npx playwright test tests/e2e/landing.spec.js
cd src && node --test tests/unit/server.test.js

# View HTML report after E2E run:
cd src && npx playwright show-report
```

**Test philosophy for foundation task:**
Unit tests validate server-side asset handling in isolation — file I/O correctness, path traversal defenses, input validation, dynamic folder discovery, and persistence formatting. They run fast via Node's built-in test runner with no browser overhead, catching edge cases that full-stack E2E tests might miss or find expensive to exercise.

E2E tests validate full-stack integration — server starts successfully, all three pages render without console errors, navigation between pages functions correctly, editor folder tree populates from live API data, dual-mode editor tabs switch properly with bidirectional data sync, save operations persist to disk and survive page reload. E2E tests do not need to validate game logic (none exists yet in foundation scope) or pixel-perfect visual correctness beyond basic element presence and interaction flows.

Together the two suites provide confidence at different layers: units catch logic errors and security edge cases fast; E2E catches integration failures across the full stack. As subsequent tasks add dungeon generation algorithms, rendering math, and gameplay systems, both suites expand — units for pure algorithmic functions, E2E for user-visible feature flows.

**CI consideration:** Both test runners support CI-friendly modes. Playwright config includes CI-specific settings; Node test runner is inherently CI-compatible with no extra dependencies. For now tests run locally during development to catch regressions.

### 9. Main.js — Game Runtime Bootstrap

Game page JavaScript responsible for initializing the canvas rendering context, fetching configuration from the unified asset API, and displaying a placeholder render proving the rendering pipeline functions end-to-end. No game loop or gameplay logic in foundation scope — a static render is sufficient to validate canvas setup, module loading, and API connectivity.

**Behavioral requirements:** On page load, obtain canvas element and 2D rendering context, render a placeholder scene communicating foundation state (dark background with subtle retro display patterning, centered title text, resolution information), fetch config asset asynchronously and display key values in the HUD element, log config to browser console for verification, handle fetch failures gracefully with appropriate HUD messaging while keeping placeholder render visible.

### 10. Editor.js — Dual-Mode Asset Editor Application

Editor page JavaScript powering the folder tree navigation and dual-mode editing interface. Must feel responsive and robust — no silent failures on network errors, clear user feedback via status pills.

**Behavioral requirements:**

On initialization, fetch the asset catalog from the unified API and construct a folder tree UI reflecting the actual directory structure under `src/assets/` — root assets node containing collapsible folder nodes per discovered category, each containing clickable file leaf nodes showing filename and item count. Folder expand/collapse state managed in memory. Clicking a file node loads that asset's content and switches editor to Visual mode.

The editor panel implements two tabs switching between Visual Editor (default) and Raw JSON modes with bidirectional data synchronization. Visual mode renders a structured form by inspecting the JSON data structure at runtime — mapping data types to appropriate input widgets generically without hardcoded schemas specific to any asset type. Raw mode displays editable pretty-printed JSON textarea. Switching tabs must preserve edits: visual-to-raw serializes current in-memory state; raw-to-visual attempts parse and shows error feedback remaining in raw mode if invalid JSON.

Save Changes button in the toolbar collects current data from whichever tab is active and persists via PUT to the unified asset API, displaying success or error status pill feedback. No reset, export, or import functionality — version control handled externally via git.

### 11. Running Instructions and Documentation
Update README.md at repo root with clear setup and running instructions:

**Prerequisites section:**
- Node.js v18 or higher installed (for built-in fetch support and ES module support in Node, though server primarily uses http module)
- Modern browser with ES module support (Chrome, Firefox, Safari, Edge all supported — no IE)

**Install section:**
```bash
# Clone repository (if starting fresh):
git clone https://github.com/laurentbecherel/gamedev-laurentbecherel-dungeoneers.git
cd gamedev-laurentbecherel-dungeoneers

# Install dependencies (first time only):
npm install
# Installs Playwright for testing. If using Express, also installs express.
# If using Node built-in http module with zero runtime dependencies, only dev dependencies installed.

# Install Playwright browsers (first time only):
cd src && npx playwright install
```

**Start server section:**
```bash
cd src && npm start
# Starts Node.js server at http://localhost:8000
# Alternative: node server/server.js
# Override port:  PORT=3000 npm start    (Unix/macOS)
#                 $env:PORT=3000; npm start   (PowerShell on Windows)
```

**Open in browser section:**
- Landing page: http://localhost:8000/ — introduction with links to game and editor
- Game (runtime): http://localhost:8000/game.html — placeholder canvas with foundation message
- Editor: http://localhost:8000/editor.html — config and asset editor UI

**Run tests section:**
```bash
cd src && npm test              # Run Playwright E2E tests headless
npm run test:ui       # Run with Playwright UI mode for debugging
cd src && npx playwright show-report   # View HTML test report after run
```

**Project structure overview** in README explaining src/, server/, tests/, tasks/ layout and purpose of each.

## Acceptance Criteria
- [ ] `npm install` completes successfully installing Playwright (and Express if used)
- [ ] `cd src && npx playwright install` downloads browser binaries successfully (one-time setup)
- [ ] `npm start` starts Node.js server successfully, logs "Dungeoneers server running at http://localhost:8000" to console, no errors on startup
- [ ] `http://localhost:8000/` (or `http://localhost:8000/index.html`) loads elegant landing page with hero section, game title in large gold typography, tagline, pitch paragraph, feature cards in responsive grid, and prominent "Play Game" and "Open Editor" buttons
- [ ] Landing page "Play Game" link navigates to game.html successfully
- [ ] Landing page "Open Editor" link navigates to editor.html successfully
- [ ] `http://localhost:8000/game.html` loads fullscreen game page with black background, canvas scaled to fit viewport maintaining 640×360 internal resolution, placeholder rendering with title and scanline effect, fixed top bar navigation, and bottom HUD pill showing config values fetched from unified asset API
- [ ] Game page fetches config asset from unified API on load and logs to browser console, HUD displays config values
- [ ] Game page top bar navigation consistent with other pages — brand on left, Home and Editor links on right with Phosphor icons before text labels
- [ ] `http://localhost:8000/editor.html` loads editor with three-panel layout: top bar with consistent navigation, left sidebar as collapsible folder tree explorer, main panel with tabbed dual-mode editor
- [ ] Editor sidebar reflects folder hierarchy under `src/assets/` dynamically — root assets node expandable, category folders collapsible with chevron toggle, file nodes clickable, no hardcoded category names
- [ ] Editor sidebar width adjustable via draggable resizer
- [ ] Editor defaults to Visual Editor tab showing auto-generated form widgets appropriate to data types; Raw JSON tab available with bidirectional sync and validation
- [ ] Editor Save Changes button PUTs to unified asset API successfully with status pill feedback; no Reset, Export, or Import buttons present
- [ ] Editor top bar navigation consistent with other pages
- [ ] No console errors on landing page, game page, or editor page during normal operation (API fetch errors handled gracefully with user-visible feedback, not silent failures or uncaught exceptions)
- [ ] Pure ES modules on client side (all `<script type="module">` imports resolve correctly over HTTP)
- [ ] Node.js server uses built-in modules only for core functionality (http, fs, path, url) OR Express as single documented dependency in package.json — no other runtime dependencies
- [ ] Server handles invalid API requests gracefully: 400 status for malformed JSON or invalid category/name pattern, 404 for unknown asset paths, 500 for unexpected errors with details logged server-side. No legacy `/api/config` endpoints exist — only unified `/api/assets/*` paths.
- [ ] Unit test suite exists at `src/tests/unit/` using Node.js built-in test runner, covering server asset handling edge cases: item counting heuristic across JSON structure variants, path traversal blocking, invalid name rejection, malformed JSON handling, missing asset 404s, save/load roundtrip with pretty-print verification, and dynamic category discovery
- [ ] Playwright E2E test suite exists with 3 test files covering landing, game, and editor pages as specified in section 8
- [ ] `package.json` defines `test`, `test:unit`, `test:e2e`, and `test:ui` npm scripts appropriately
- [ ] `cd src && npm test` runs both unit and E2E suites successfully with all tests passing
- [ ] Test files follow appropriate best practices for their respective frameworks with descriptive names and proper cleanup

## Out of Scope for This Task
- Actual dungeon rendering or gameplay mechanics — that's Task 2 (dungeon generator) and beyond
- Domain-specific custom editor controls beyond generic JSON-driven widgets — foundation provides generic form renderer mapping data types to appropriate inputs; specialized per-subsystem UI with custom layouts comes in Task 7 (editor-complete)
- WebGL rendering — 2D canvas placeholder sufficient for foundation task to prove rendering pipeline works; WebGL2 raycaster implementation comes in Task 3
- Authentication, multi-user support, or session management — single-user local development server sufficient for foundation; no login, no user accounts, no access control needed
- Database persistence layer — JSON files on disk sufficient for configuration and asset storage at this stage; SQLite or other database introduction deferred to future if needed for scale or querying capabilities
- Hot reload / live cross-tab update between editor and game pages — game page may require manual browser refresh to pick up config changes saved from editor for foundation task simplicity; live update via BroadcastChannel, storage events, or WebSocket push can be enhancement in later task (Task 7 editor polish phase)
- Comprehensive input validation and JSON schema enforcement beyond basic structure checks — thorough schema validation with detailed error messages per field can be added incrementally as schemas stabilize across tasks
- Audio system — no sound in foundation task, audio comes much later in development timeline
- Mobile/responsive design polish — basic functional layout sufficient, responsive refinements deferred
- Performance optimization beyond basic functionality — foundation prioritizes correctness and clear architecture over optimization; performance tuning comes naturally as features added and bottlenecks identified
