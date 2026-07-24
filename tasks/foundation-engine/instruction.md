# Foundation Engine — Dungeoneers Task 1

Build the foundational engine structure for Dungeoneers, a retro dungeon crawler. This task establishes a proper server with REST API, the runtime game page, the editor page, and the data-driven JSON config architecture where edits persist to actual JSON files via the API. No gameplay yet — just the scaffolding.

## Requirements

### 1. Project Structure
Create project with this layout:
```
/
├── src/                    # Client-side game code (served statically)
│   ├── index.html          # Runtime game entry point
│   ├── editor.html         # Editor entry point
│   ├── main.js             # Game bootstrap (minimal, placeholder)
│   ├── editor.js           # Editor bootstrap (minimal, placeholder)
│   ├── style.css           # Shared styles
│   ├── config/
│   │   └── config.js       # Central config system (client-side, fetches from API)
│   └── assets/             # JSON data assets (edited via API, served statically)
│       ├── materials/
│       │   ├── walls.json
│       │   ├── floors.json
│       │   ├── ceils.json
│       │   └── architectures.json
│       └── themes/
│           └── themes.json
├── server/                 # Server-side API and static file serving
│   ├── server.js           # Node.js HTTP server with REST API
│   └── package.json        # Node dependencies (minimal — use built-in http module or express)
└── README.md               # Running instructions
```

### 2. Runtime Page (index.html)
- HTML5 boilerplate, title "Dungeoneers"
- Canvas element for game rendering (id="game-canvas", 640x360)
- Loads main.js as ES module
- Minimal styling via style.css
- Placeholder: canvas clears to dark color, shows "Dungeoneers — Foundation Engine" text

### 2. Server with REST API (server/server.js)
Build a Node.js HTTP server that serves static files AND provides REST API endpoints for reading and writing JSON assets. Use Node's built-in `http` module to avoid external dependencies, OR use Express if preferred (add to package.json).

**Server responsibilities:**
- Serve static files from `src/` directory over HTTP (so ES modules work — no file:// restriction)
- Provide REST API endpoints under `/api/` prefix for config and asset management
- Handle CORS headers to allow fetch from same origin (straightforward since serving same origin)
- Listen on configurable port (default 8000, override via PORT env var or command line arg)

**Required API endpoints:**

`GET /api/config`
- Returns current merged config as JSON (defaults + any overrides stored server-side, or just defaults for foundation task).
- Response: `{version:1, renderer:{...}, player:{...}, generator:{...}, ...}`

`POST /api/config`
- Accepts JSON body with config updates (full config object or partial patch).
- Validates basic structure (must have version field, must be valid JSON).
- Persists to server-side storage — for foundation task, write to a JSON file like `server/config-state.json` as simple persistence layer, OR keep in memory (simpler for foundation, persistence to disk can come later).
- Returns updated config as JSON with 200 status, or 400 on validation error.

`GET /api/assets/:category/:name`
- Serves JSON asset files dynamically. Category = materials or themes. Name = walls, floors, ceils, architectures, themes (without .json extension).
- Example: `GET /api/assets/materials/walls` → reads `src/assets/materials/walls.json` and returns parsed JSON.
- Response: JSON content of requested asset file, or 404 if not found.

`PUT /api/assets/:category/:name`  (or POST — pick one consistently)
- Accepts JSON body representing updated asset content.
- Validates basic structure depending on asset type (walls/floors/ceils expect array with objects containing at least id and name; architectures/themes expect object).
- Writes updated JSON back to corresponding file in `src/assets/` directory, pretty-printed with 2-space indentation for readability and version control friendliness.
- Returns success JSON with 200 status, or 400 on validation error, 404 if asset path invalid.

`GET /api/assets` (optional but useful)
- Returns list of available assets with metadata: `[{category:"materials", name:"walls", path:"...", itemCount:16}, ...]`
- Helps editor discover what assets exist dynamically rather than hardcoding list.

**Server startup:**
- `node server/server.js` starts server (add npm script in package.json: `"start": "node server/server.js"`)
- Logs startup message with URL: "Dungeoneers server running at http://localhost:8000"
- Graceful shutdown on SIGINT/SIGTERM.

**package.json (minimal):**
```json
{
  "name": "dungeoneers-engine",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "node server/server.js" },
  "dependencies": {}
}
```
If using Express instead of built-in http: add `"express": "^4.18.0"` to dependencies, run `npm install` documented in README.

### 3. Runtime Page (index.html)
- HTML5 boilerplate, title "Dungeoneers"
- Canvas element for game rendering (id="game-canvas", 640x360)
- Loads main.js as ES module
- Minimal styling via style.css
- Placeholder: canvas clears to dark color, shows "Dungeoneers — Foundation Engine" text
- Fetches config from API on load (see config system below) rather than localStorage

### 4. Editor Page (editor.html)
- HTML5 boilerplate, title "Dungeoneers Editor"
- Simple UI shell with sections/tabs placeholder for future subsystems
- Loads editor.js as ES module
- Displays current config values fetched from API
- Button to save config → POST to `/api/config`
- Button to reset config to defaults → POST with default payload or dedicated reset endpoint
- Button to export config as JSON download (client-side blob download, no server roundtrip needed)
- Button to import config from JSON file upload → POST uploaded content to `/api/config`
- Additional section showing JSON assets list fetched from `/api/assets`, with per-asset view/edit capability (simple textarea editor acceptable for foundation — full structured UI comes in later tasks)

### 5. Central Config System (src/config/config.js)
Single source of truth for all tweakable properties on the client side. Fetches from server API rather than localStorage.

Must support:
- **Defaults object** with version number (start at version 1)
- **API-based persistence:** fetch from `/api/config` on init, POST to `/api/config` on save — NO localStorage usage (server is source of truth)
- **Versioned migration:** function to migrate old versions to new (stub for now, just logs). Migration runs client-side after fetching from API, before exposing config to rest of app. Future server-side migration possible but client-side sufficient for foundation.
- **API client functions (async):**
  - `async getConfig()` → fetches from `/api/config`, merges with defaults client-side as fallback, returns config object
  - `async saveConfig(cfg)` → POST to `/api/config` with cfg as JSON body, updates cache on success, dispatches event, returns boolean success
  - `async resetConfig()` → POST default config to `/api/config` or call dedicated reset endpoint, returns fresh config
  - `exportConfigJSON()` → returns JSON.stringify of current config (client-side, no server call — for download)
  - `async importConfigJSON(jsonStr)` → parse and validate locally, then POST to `/api/config`, returns boolean
- **Asset API client functions:**
  - `async getAssetList()` → GET `/api/assets` returning available assets metadata
  - `async getAsset(category, name)` → GET `/api/assets/{category}/{name}` returning asset JSON
  - `async saveAsset(category, name, data)` → PUT to `/api/assets/{category}/{name}` with data as JSON body, returns boolean success
- **Deep merge:** fetched config merged over defaults client-side so missing keys fall back to defaults defined in code (defensive against partial API responses or schema evolution)
- **Caching:** cache fetched config in module-level variable to avoid repeated API calls within same session. Invalidate cache on save.
- **Event dispatch:** fire `dungeoneers-config-saved` CustomEvent on successful save so game page (if open in another tab) can refresh config via API fetch in response to event.
- **Browser/Node detection:** gracefully handle non-browser environments (return defaults synchronously or via resolved Promise, no fetch attempts that would fail in Node without fetch polyfill — though Node 18+ has fetch built-in).

Default config structure (minimal for foundation):
```js
{
  version: 1,
  renderer: { resolution: "640x360", authentic: true },
  player: { moveSpeed: 3.0, mouseSensitivity: 0.002 },
  generator: { mapW: 32, mapH: 32, seed: null },
  // walls/floors/ceils/architectures/themes loaded via separate asset API, not embedded in main config
  // (they live as separate JSON files under src/assets/, fetched individually as needed)
}
```

### 6. JSON Assets Structure
Create placeholder JSON files in `src/assets/` that define the schema. These files are the authoritative storage — edited via API endpoints, not local files manually (though manual editing via text editor also works since they're plain JSON on disk).

Each file should have valid structure with at least one example entry to demonstrate schema:

- `src/assets/materials/walls.json` — array of wall material definition objects. Example entry defines schema fields: id (number), name (string), type (string), base (RGB array), roughness (0..1), metal (0..1), tag, role, architectureShape, tileScale, variationSeed, emissiveColor (RGB 0..1 array), emissiveStrength (0..1), storyTags (string array).
- `src/assets/materials/floors.json` — array of floor material definitions, same schema as walls adapted for floor types.
- `src/assets/materials/ceils.json` — array of ceiling material definitions.
- `src/assets/materials/architectures.json` — object mapping architecture IDs to definitions. Each architecture has id, name, description, wallShapes/floorShapes/ceilShapes weight objects, decoMult object, pillar spec object, storyTags array.
- `src/assets/themes/themes.json` — object mapping theme IDs to theme definitions with zones array, corridor config, etc.

For foundation task, these can contain minimal example data (1-2 materials per file, 1 architecture, 1 theme with 1 zone) — enough to demonstrate schema and test API read/write roundtrip. Full content comes in later tasks.

### 7. JSON Asset Loader (client-side)
In `src/config/config.js`, add asset API client functions (as specified in section 5 above):
- `async getAssetList()` → GET `/api/assets`
- `async getAsset(category, name)` → GET `/api/assets/{category}/{name}`
- `async saveAsset(category, name, data)` → PUT to API endpoint

These replace the old prototype's `loadAssetJSON()` that fetched static files directly — now all asset access goes through API so edits persist to disk via server.

For backward compatibility with code expecting in-code material defaults, config.js may still define minimal DEFAULTS for materials as fallback, but primary source is API-served JSON assets.

### 8. Main.js (runtime bootstrap)
- Minimal: check for canvas element by ID, get 2D rendering context, clear to dark background color, draw placeholder text "Dungeoneers — Foundation Engine" centered.
- Import config.js and call `await getConfig()` on load — log loaded config to browser console to verify API fetch working.
- Display fetched config values somewhere on page (simple text overlay or console is sufficient for foundation — proper HUD comes later).
- No game loop yet — static placeholder render is sufficient to prove rendering pipeline works.
- Handle async properly: wrap bootstrap in async IIFE or use top-level await (ES modules support top-level await in modern browsers).

### 9. Editor.js (editor bootstrap)
- Import config.js API client functions.
- On page load: `await getConfig()` to fetch current config from API, render into DOM (simple `<pre>` formatted JSON dump acceptable for foundation task — structured tabbed UI comes in Task 7).
- Also fetch asset list via `getAssetList()` and display available assets with view/edit capability — simple version: dropdown to select asset, textarea showing JSON content fetched via `getAsset()`, Save Asset button calling `saveAsset()` to persist changes back to server.
- Wire up buttons:
  - **Save Config** → collects current config state from UI (or uses working config object if UI edits mutate it live) → `await saveConfig()` → show confirmation toast on success or error message on failure.
  - **Reset Config** → confirm dialog → POST default config to API → reload page or re-fetch to display reset state.
  - **Export Config** → client-side blob download of current config as JSON file (no server call needed — uses `exportConfigJSON()` which stringifies current config object).
  - **Import Config** → file input or textarea paste → parse JSON locally for basic validation → POST to `/api/config` → on success, re-fetch and re-render UI to show imported state.
- Listen for `dungeoneers-config-saved` CustomEvent (dispatched by saveConfig on success) and re-render config display to reflect saved state.
- Handle async properly throughout — all API calls are async, UI should show loading states or at minimum not break on slow responses.

### 10. Running Instructions
Add to README.md at repo root:

**Prerequisites:** Node.js installed (v18+ recommended for built-in fetch support on server side if needed, though server uses http module not fetch).

**Install (first time only):**
```bash
npm install
```
(Only needed if using Express. If using built-in http module with zero dependencies, npm install does nothing but harmless to run.)

**Start server:**
```bash
npm start
# or: node server/server.js
# Server runs at http://localhost:8000 by default
# Override port: PORT=3000 npm start   (Unix)  or  $env:PORT=3000; npm start  (PowerShell)
```

**Open in browser:**
- Game (runtime): http://localhost:8000/
- Editor: http://localhost:8000/editor.html

Both pages served from same origin so API calls to `/api/*` work without CORS issues. ES modules load correctly over HTTP (would fail over file:// protocol).

## Acceptance Criteria
- [ ] `npm start` (or `node server/server.js`) starts server successfully, logs URL to console, no errors on startup
- [ ] `http://localhost:8000/` loads index.html showing placeholder canvas with "Dungeoneers — Foundation Engine" text
- [ ] `http://localhost:8000/editor.html` loads editor page displaying config fetched from API
- [ ] Editor Save button POSTs to `/api/config` successfully and shows confirmation
- [ ] Editor Reset button restores defaults via API successfully
- [ ] Editor Export button downloads current config as JSON file via browser download
- [ ] Editor Import button accepts JSON file upload and POSTs to API successfully, UI updates to reflect imported values
- [ ] Editor can list available JSON assets via `/api/assets`, view individual asset content, edit in textarea, and save back via PUT to `/api/assets/{category}/{name}` — changes persist to actual JSON files on disk (verify by checking file content after save and after server restart)
- [ ] Game page fetches config from `/api/config` on load (not localStorage) and logs to console
- [ ] JSON asset files exist in `src/assets/` with valid structure containing at least example entries demonstrating schema
- [ ] No console errors on either page during normal operation
- [ ] Pure ES modules on client side, Node.js server side using built-in modules (or Express as single optional dependency documented in package.json)
- [ ] Server handles invalid API requests gracefully with appropriate HTTP status codes (400 for bad JSON/body, 404 for unknown asset, 500 for server errors with logged details)

## Out of Scope for This Task
- Actual dungeon rendering or gameplay — that's future tasks (Task 2+)
- Full editor UI tabs with structured controls per subsystem — just shell with config display and asset editor textarea for now (structured tabs come in Task 7)
- WebGL rendering — 2D canvas placeholder is fine for foundation (WebGL raycaster comes in Task 3)
- Authentication / multi-user support — single-user local dev server sufficient for foundation
- Database persistence — JSON files on disk sufficient, no need for SQLite/Postgres yet
- Hot reload / live update between editor and game tabs — game page can require manual refresh to pick up config changes for foundation task (live update via events can be added as enhancement later, or in Task 7 with editor polish)
- Input validation beyond basic structure checks — thorough schema validation can come later
