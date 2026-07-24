# Foundation Engine — Dungeoneers Task 1

Build the foundational engine structure for Dungeoneers, a retro dungeon crawler. This task establishes a Node.js server with REST API, a landing page, runtime game page, editor page, data-driven JSON config architecture with API persistence to disk, and a test suite with Playwright end-to-end tests. No gameplay yet — just the scaffolding.

## Requirements

### 1. Project Structure
Create project with this layout:
```
/
├── src/                      # Client-side code (served statically)
│   ├── index.html            # Landing page with links to game and editor
│   ├── game.html             # Runtime game entry point
│   ├── editor.html           # Editor entry point
│   ├── main.js               # Game bootstrap (minimal placeholder)
│   ├── editor.js             # Editor bootstrap (minimal placeholder)
│   ├── landing.js            # Landing page logic (optional, can be inline)
│   ├── style.css             # Shared styles
│   ├── config/
│   │   └── config.js         # Central config system (client-side API client)
│   └── assets/               # JSON data assets (edited via API)
│       ├── materials/
│       │   ├── walls.json
│       │   ├── floors.json
│       │   ├── ceils.json
│       │   └── architectures.json
│       └── themes/
│           └── themes.json
├── server/                   # Server-side
│   ├── server.js             # Node.js HTTP server with REST API + static serving
│   ├── package.json          # Node dependencies and scripts
│   └── config-state.json     # Server-side persisted config state (created at runtime if not exists)
├── tests/                    # Test suite
│   ├── playwright.config.js  # Playwright configuration
│   └── e2e/
│       ├── landing.spec.js   # Landing page tests
│       ├── game.spec.js      # Game page tests
│       └── editor.spec.js    # Editor page tests
└── README.md                 # Running instructions
```

### 2. Server with REST API (server/server.js)
Build a Node.js HTTP server serving static files AND providing REST API endpoints. Use Node's built-in `http` module to minimize dependencies, OR Express if preferred (add to package.json dependencies).

**Server responsibilities:**
- Serve static files from `src/` directory at root path `/` over HTTP (enables ES modules — no file:// restriction)
- Provide REST API endpoints under `/api/` prefix for config and asset management
- Handle CORS headers (straightforward since same origin serving)
- Listen on configurable port (default 8000, override via PORT env var)
- Graceful shutdown on SIGINT/SIGTERM signals

**Required API endpoints:**

`GET /api/config`
- Returns current config as JSON.
- On first call with no persisted state, returns defaults merged from in-code DEFAULTS + JSON asset files.
- Response: 200 with JSON body `{version:1, renderer:{...}, player:{...}, generator:{...}}`

`POST /api/config`
- Accepts JSON body (full config object or partial patch — support full replacement for simplicity in foundation).
- Validates: must be valid JSON parseable, must be object type, should have version field (warn if missing but accept).
- Persists to `server/config-state.json` on disk (pretty-printed, 2-space indent). Create server/ directory if needed. On subsequent GET requests, read from this file and merge over defaults.
- Returns updated config as JSON with 200 status, or 400 on validation error with JSON error message body.

`GET /api/assets`
- Returns list of available JSON assets with metadata.
- Scans `src/assets/materials/` and `src/assets/themes/` directories for .json files.
- Response: 200 with JSON array like `[{"category":"materials","name":"walls","path":"materials/walls.json","itemCount":2}, ...]`
- itemCount = number of items in array for materials files, or number of keys for object-type files like architectures/themes.

`GET /api/assets/:category/:name`
- Serves specific JSON asset file content dynamically.
- Category must be `materials` or `themes`. Name without extension: `walls`, `floors`, `ceils`, `architectures`, `themes`.
- Reads corresponding file from `src/assets/{category}/{name}.json`, parses and returns as JSON.
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
- `node server/server.js` starts server.
- package.json at `server/package.json` OR at repo root — pick one consistently (repo root simpler for single npm install command). Recommend repo root `package.json` for simplicity.
- package.json minimal content:
```json
{
  "name": "dungeoneers-engine",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node server/server.js",
    "test": "npx playwright test",
    "test:ui": "npx playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0"
  },
  "dependencies": {}
}
```
- If using Express: add `"express": "^4.18.0"` to dependencies (not devDependencies since needed at runtime).
- Log on startup: "Dungeoneers server running at http://localhost:{port}" to console.
- Log API requests at info level (method, path, status code, maybe timing) for debugging.

### 3. Landing Page (src/index.html)
- HTML5 boilerplate, title "Dungeoneers — Delve Co."
- Clean landing page design introducing the game — NOT the game itself.
- Content sections:
  - Game title/logo area with tagline: "Tank. Heal. Loot. Clock Out."
  - Short pitch paragraph describing 4-player co-op retro dungeon crawler concept
  - Two prominent action buttons/links:
    * "Play Game" → links to `game.html`
    * "Open Editor" → links to `editor.html`
  - Optional: brief feature list, controls reference, or "About" section
- Styling via style.css — dark dungeon aesthetic matching game theme (dark background, readable text, retro pixel font if available or monospace fallback)
- No JavaScript required for landing page functionality beyond basic link navigation, but may include landing.js for subtle animations or dynamic content if desired (optional).
- This page served at root path `/` when user visits http://localhost:8000/

### 4. Game Page (src/game.html)
- HTML5 boilerplate, title "Dungeoneers"
- Canvas element for game rendering with id="game-canvas", width 640, height 360 (internal resolution, CSS may scale for display)
- Loads main.js as ES module via `<script type="module" src="main.js">`
- Styling via style.css — canvas centered, dark background, optional retro CRT styling hints (scanline overlay via CSS pseudo-element acceptable but not required for foundation)
- Link back to landing page (small link in corner or header: "← Back to Home" linking to index.html)
- Placeholder rendering via main.js: canvas cleared to dark color (#0a0a0a or similar), centered text "Dungeoneers — Foundation Engine" in light color with readable font
- Fetches config from API on load and logs to console to verify API connectivity

### 5. Editor Page (src/editor.html)
- HTML5 boilerplate, title "Dungeoneers Editor"
- Simple UI shell — for foundation task, basic layout sufficient (detailed tabbed UI with 14 subsystem tabs comes in Task 7)
- Loads editor.js as ES module
- Displays current config values fetched from API — simple `<pre>` formatted JSON dump acceptable for foundation, OR basic form with a few key fields editable
- Buttons wired to API:
  - **Save Config** → collects current config state → POST to `/api/config` → show success/error feedback
  - **Reset Config** → confirm dialog → POST default config to API (or dedicated reset — for foundation, POST hardcoded defaults object is fine) → re-fetch and re-render UI
  - **Export Config** → client-side blob download of current config as JSON file (no server roundtrip — uses local config object stringified)
  - **Import Config** → file input element → FileReader reads selected JSON file → parse and validate locally → POST to `/api/config` → on success re-fetch and update UI
- Asset management section:
  - Fetch asset list from `/api/assets` on page load, display as list or dropdown
  - Select asset → fetch content via `/api/assets/{category}/{name}` → display in textarea for editing
  - Save Asset button → PUT edited JSON back to same endpoint → show success/error feedback
  - For foundation, simple textarea JSON editor sufficient — structured per-field UI comes in Task 7
- Link back to landing page ("← Back to Home" → index.html)

### 6. Central Config System (src/config/config.js)
Client-side module providing API client functions for config and asset management. Replaces old localStorage-based approach — server API is source of truth.

**Must export async functions:**

`async getConfig()`
- GET fetch to `/api/config`
- On success (200): parse JSON response, merge over in-code DEFAULTS via deepMerge as defensive fallback for missing keys, cache result, return config object
- On failure: log warning to console, return deep clone of DEFAULTS as fallback so app doesn't crash if server unavailable
- Always returns Promise resolving to config object (never throws — graceful degradation)

`async saveConfig(cfg)`
- POST fetch to `/api/config` with cfg JSON-stringified in request body, Content-Type: application/json header
- On 200 response: parse returned JSON, update cache, dispatch CustomEvent, return true
- On non-200 or network error: log error, return false
- Dispatches `new CustomEvent('dungeoneers-config-saved', {detail: savedConfig})` on window on success

`async resetConfig()`
- POST default config object (deep clone of DEFAULTS) to `/api/config`
- On success: clear cache, return fresh config from response
- On failure: return null or defaults fallback

`exportConfigJSON()`
- Synchronous — returns `JSON.stringify(getConfigSync() || DEFAULTS, null, 2)` for pretty-printed download
- No server call needed (uses cached config or defaults)

`async importConfigJSON(jsonStr)`
- Parse jsonStr locally, validate basic structure (must be object, should have version field — warn if missing but proceed)
- On parse/validation success: call saveConfig(parsed) to persist via API
- Return boolean success

`async getAssetList()`
- GET fetch to `/api/assets`
- Returns array of asset metadata objects, or empty array on failure

`async getAsset(category, name)`
- GET fetch to `/api/assets/${category}/${name}`
- Returns parsed asset JSON object/array, or null on failure

`async saveAsset(category, name, data)`
- PUT fetch to `/api/assets/${category}/${name}` with data JSON-stringified in body
- Returns boolean success based on response status

**Helper functions (internal, not necessarily exported but useful):**
- `deepClone(obj)` — JSON parse/stringify deep clone for safe copying
- `deepMerge(target, source)` — recursive merge where source overrides target deeply, arrays replaced wholesale, objects merged key-by-key
- `isBrowser()` — check for window/document existence for graceful Node degradation (though config.js primarily client-side, good practice for test harness compatibility)

**DEFAULTS object structure (minimal for foundation, version 1):**
```js
const DEFAULTS = {
  version: 1,
  renderer: {
    resolution: "640x360",
    authentic: true,
  },
  player: {
    moveSpeed: 3.0,
    mouseSensitivity: 0.0022,
  },
  generator: {
    mapW: 32,
    mapH: 32,
    seed: null,   // null means random seed each generation
  },
  // Note: walls, floors, ceils, architectures, themes are NOT embedded here —
  // they live as separate JSON asset files under src/assets/, accessed via asset API.
};
```

**Caching strategy:**
- Module-level `_cachedConfig` variable holds last fetched config to avoid repeated API calls within same page session
- Invalidate cache (set to null) on saveConfig success so next getConfig re-fetches fresh state from server
- getConfig checks cache first, fetches from API only on cache miss

**Event pattern for cross-tab updates (optional for foundation, nice to have):**
- saveConfig dispatches CustomEvent on successful save
- Game page (if open in another browser tab) could listen for storage events OR poll periodically OR require manual refresh — for foundation task, manual refresh acceptable. Live cross-tab update via BroadcastChannel or storage event listening can be enhancement in later task.

### 7. JSON Assets Structure
Create placeholder JSON files in `src/assets/` defining schemas with example entries demonstrating structure. These are authoritative storage — edited via API PUT endpoints which write back to these files on disk.

**Required files with example schema:**

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

### 8. Test Suite with Playwright

Create end-to-end test suite using Playwright to validate all three pages and API functionality.

**Setup:**
- Add `@playwright/test` to devDependencies in package.json (already in template above)
- Run `npx playwright install` once to download browser binaries (document in README as setup step, or include in package.json postinstall script)
- Create `playwright.config.js` at repo root with basic configuration

**playwright.config.js structure:**
```js
// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
  },
  // Start dev server automatically before tests (Playwright webServer feature):
  webServer: {
    command: 'node server/server.js',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
```

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
- Editor page loads at `/editor.html` without errors
- Page title contains "Editor" or "Dungeoneers Editor"
- Config display area shows fetched config data (verify text content contains expected fields like version, renderer, etc.)
- Save Config button exists and is clickable
- Reset Config button exists
- Export and Import buttons exist
- Asset management section shows asset list fetched from API (verify dropdown or list contains expected asset names like walls, floors, etc.)
- Test Save Config flow:
  * Click Save button
  * Wait for API POST request to /api/config to complete (Playwright can waitForResponse)
  * Verify success feedback shown (toast message or status text)
  * Optionally verify via direct API GET that config persisted
- Test asset edit flow:
  * Select asset from dropdown/list
  * Verify textarea populated with JSON content from API
  * Modify JSON content in textarea (e.g., change a material name)
  * Click Save Asset button
  * Wait for PUT request to complete successfully
  * Re-fetch asset and verify change persisted
  * Restore original content to leave clean state for next test run
- No console errors during normal editor operation

**Running tests:**
```bash
# Install Playwright browsers (first time only):
npx playwright install

# Run all E2E tests headless:
npm test
# or: npx playwright test

# Run with UI mode for debugging:
npm run test:ui
# or: npx playwright test --ui

# Run specific test file:
npx playwright test tests/e2e/landing.spec.js

# View HTML report after run:
npx playwright show-report
```

**Test philosophy for foundation task:**
Tests validate that the scaffolding works end-to-end — server starts, pages load, API endpoints respond correctly, editor can read/write config and assets persist to disk. Tests do NOT need to validate game logic (no game logic exists yet) or visual correctness beyond basic element presence. As features added in subsequent tasks, test suite expands to cover new functionality.

**CI consideration:** Playwright config includes CI-specific settings (forbidOnly, retries, single worker) so tests suitable for CI pipeline if GameDev track adds automated validation later. For now, tests run locally during development to catch regressions.

### 9. Main.js — Game Page Bootstrap
- Async IIFE wrapper or top-level await to handle async config fetch at module load time
- Get canvas element by ID "game-canvas", verify exists, get 2D rendering context
- Clear canvas to dark background (#0a0a0a or similar)
- Draw centered placeholder text "Dungeoneers — Foundation Engine" in light color, readable font size
- Import config module and call `await getConfig()` — log returned config object to browser console to verify API connectivity working
- Display fetched config values on page somewhere visible (simple text overlay div showing version and key settings, OR console log sufficient for foundation with text overlay as nice-to-have)
- No game loop needed yet — static render proves canvas and rendering context functional
- Handle errors gracefully: if config fetch fails, log warning and fall back to displaying default message; canvas placeholder still renders even without config

### 10. Editor.js — Editor Page Bootstrap
- Import config API client functions from config module
- Async initialization on page load:
  * `await getConfig()` → store working config object
  * Render config into DOM — simple `<pre>` element with pretty-printed JSON acceptable for foundation task (structured form UI with individual controls comes in Task 7)
  * `await getAssetList()` → populate asset selector dropdown or list UI
- Asset editor section:
  * Dropdown/select to choose asset from list (display as "materials/walls", "themes/themes", etc.)
  * On selection change: `await getAsset(category, name)` → populate textarea with pretty-printed JSON
  * Save Asset button → parse textarea JSON (try/catch for validation) → `await saveAsset(category, name, parsedData)` → show success toast or error message with details
- Wire up config buttons:
  * **Save Config** → `await saveConfig(workingConfig)` → toast success/failure feedback
  * **Reset Config** → confirm() dialog → on confirm, POST default config object to API (or call reset endpoint if server provides dedicated one) → on success, re-fetch config and re-render UI to show reset state (or reload page for simplicity)
  * **Export Config** → create Blob from `exportConfigJSON()` string → create temporary anchor element with download attribute → trigger click → browser downloads dungeoneers-config.json file → clean up temporary elements. No server roundtrip needed.
  * **Import Config** → file input change handler → FileReader reads selected file as text → parse JSON with try/catch → on valid parse, `await saveConfig(parsed)` to persist via API → on success re-fetch and re-render UI (or reload page)
- Listen for CustomEvent `dungeoneers-config-saved` → re-render config display to stay in sync (useful if multiple editor tabs open, though primary use case is single editor tab)
- Handle async throughout with loading indicators or at minimum try/catch with user-visible error messages — UI should not silently fail or break on network errors
- Back to Home link to index.html landing page

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
npx playwright install
```

**Start server section:**
```bash
npm start
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
npm test              # Run Playwright E2E tests headless
npm run test:ui       # Run with Playwright UI mode for debugging
npx playwright show-report   # View HTML test report after run
```

**Project structure overview** in README explaining src/, server/, tests/, tasks/ layout and purpose of each.

## Acceptance Criteria
- [ ] `npm install` completes successfully installing Playwright (and Express if used)
- [ ] `npx playwright install` downloads browser binaries successfully (one-time setup)
- [ ] `npm start` starts Node.js server successfully, logs "Dungeoneers server running at http://localhost:8000" to console, no errors on startup
- [ ] `http://localhost:8000/` loads landing page (index.html) showing game title, tagline, pitch text, "Play Game" button linking to game.html, and "Open Editor" button linking to editor.html
- [ ] Landing page "Play Game" link navigates to game.html successfully
- [ ] Landing page "Open Editor" link navigates to editor.html successfully
- [ ] `http://localhost:8000/game.html` loads game page showing canvas with "Dungeoneers — Foundation Engine" placeholder text rendered via 2D context
- [ ] Game page fetches config from `/api/config` on load and logs config object to browser console (verify via DevTools console)
- [ ] Game page has "Back to Home" link navigating to index.html landing page
- [ ] `http://localhost:8000/editor.html` loads editor page displaying config fetched from API (visible in UI as JSON dump or form)
- [ ] Editor Save Config button POSTs to `/api/config` successfully, shows success confirmation feedback to user
- [ ] Editor Reset Config button restores defaults via API successfully with confirmation dialog shown before reset
- [ ] Editor Export Config button triggers browser download of current config as JSON file
- [ ] Editor Import Config button accepts JSON file selection, parses and POSTs to API successfully, UI updates to reflect imported values
- [ ] Editor asset section lists available JSON assets fetched from `/api/assets` endpoint
- [ ] Editor can select an asset from list/dropdown, view its JSON content in textarea fetched via `/api/assets/{category}/{name}`
- [ ] Editor can modify asset JSON in textarea and save via PUT to API endpoint — changes persist to actual JSON file on disk (verify by inspecting file content on disk after save, and by restarting server and re-fetching to confirm persistence survives restart)
- [ ] Editor has Back to Home link navigating to index.html
- [ ] No console errors on landing page, game page, or editor page during normal operation (API fetch errors handled gracefully with user-visible feedback, not silent failures or uncaught exceptions)
- [ ] Pure ES modules on client side (all `<script type="module">` imports resolve correctly over HTTP)
- [ ] Node.js server uses built-in modules only for core functionality (http, fs, path, url) OR Express as single documented dependency in package.json — no other runtime dependencies
- [ ] Server handles invalid API requests gracefully: 400 status with JSON error body for malformed JSON or invalid structure, 404 for unknown asset paths or endpoints, 500 for unexpected server errors with details logged server-side
- [ ] Playwright test suite exists with 3 test files covering landing page, game page, and editor page functionality as specified in section 8 above
- [ ] `npm test` runs Playwright tests successfully with all tests passing (may require server running or rely on Playwright webServer config to start server automatically)
- [ ] Test files follow Playwright best practices: descriptive test names, appropriate assertions, waiting for network responses where needed, cleanup to restore state after asset modification tests

## Out of Scope for This Task
- Actual dungeon rendering or gameplay mechanics — that's Task 2 (dungeon generator) and beyond
- Full editor UI with structured per-field controls organized in 14 subsystem tabs — foundation provides basic shell with config JSON display and asset textarea editor; structured tabbed UI with individual sliders/color pickers per parameter comes in Task 7 (editor-complete)
- WebGL rendering — 2D canvas placeholder sufficient for foundation task to prove rendering pipeline works; WebGL2 raycaster implementation comes in Task 3
- Authentication, multi-user support, or session management — single-user local development server sufficient for foundation; no login, no user accounts, no access control needed
- Database persistence layer — JSON files on disk sufficient for configuration and asset storage at this stage; SQLite or other database introduction deferred to future if needed for scale or querying capabilities
- Hot reload / live cross-tab update between editor and game pages — game page may require manual browser refresh to pick up config changes saved from editor for foundation task simplicity; live update via BroadcastChannel, storage events, or WebSocket push can be enhancement in later task (Task 7 editor polish phase)
- Comprehensive input validation and JSON schema enforcement beyond basic structure checks — thorough schema validation with detailed error messages per field can be added incrementally as schemas stabilize across tasks
- Audio system — no sound in foundation task, audio comes much later in development timeline
- Mobile/responsive design polish — basic functional layout sufficient, responsive refinements deferred
- Performance optimization beyond basic functionality — foundation prioritizes correctness and clear architecture over optimization; performance tuning comes naturally as features added and bottlenecks identified
