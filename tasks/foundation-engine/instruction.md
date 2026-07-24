# Foundation Engine — Dungeoneers Task 1

Build the foundational engine structure for Dungeoneers, a retro dungeon crawler. This task establishes the runtime game page, the editor page, and the data-driven JSON config architecture. No gameplay yet — just the scaffolding.

## Requirements

### 1. Project Structure
Create `src/` with this layout:
```
src/
├── index.html          # Runtime game entry point
├── editor.html         # Editor entry point
├── main.js             # Game bootstrap (minimal, placeholder)
├── editor.js           # Editor bootstrap (minimal, placeholder)
├── style.css           # Shared styles
├── config/
│   └── config.js       # Central config system
└── assets/
    ├── materials/
    │   ├── walls.json
    │   ├── floors.json
    │   ├── ceils.json
    │   └── architectures.json
    └── themes/
        └── themes.json
```

### 2. Runtime Page (index.html)
- HTML5 boilerplate, title "Dungeoneers"
- Canvas element for game rendering (id="game-canvas", 640x360)
- Loads main.js as ES module
- Minimal styling via style.css
- Placeholder: canvas clears to dark color, shows "Dungeoneers — Foundation Engine" text

### 3. Editor Page (editor.html)
- HTML5 boilerplate, title "Dungeoneers Editor"
- Simple UI shell with sections/tabs placeholder for future subsystems
- Loads editor.js as ES module
- Displays current config values read from config.js
- Button to save config (writes to localStorage)
- Button to reset config to defaults
- Button to export config as JSON download
- Button to import config from JSON file upload

### 4. Central Config System (config/config.js)
Single source of truth for all tweakable properties. Must support:

- **Defaults object** with version number (start at version 1)
- **localStorage persistence**: key `dungeoneers_config_v1`
- **Versioned migration**: function to migrate old versions to new (stub for now, just logs)
- **Live getters**: `getConfig()`, `getConfigLive()`, `saveConfig()`, `resetConfig()`, `exportConfigJSON()`, `importConfigJSON()`
- **Deep merge**: stored values override defaults, missing keys fall back to defaults
- **Browser detection**: no-op gracefully in non-browser (Node) environments
- **Event dispatch**: fire `dungeoneers-config-saved` CustomEvent on save

Default config structure (minimal for foundation):
```js
{
  version: 1,
  renderer: { resolution: "640x360", authentic: true },
  player: { moveSpeed: 3.0, mouseSensitivity: 0.002 },
  generator: { mapW: 32, mapH: 32, seed: null },
  walls: [], floors: [], ceils: [], architectures: {}, themes: {}
}
```

### 5. JSON Assets Structure
Create placeholder JSON files in `src/assets/` that define the schema (empty arrays/objects for now, but valid JSON with structure comments via a `_schema` field or example entry):

- `materials/walls.json` — array of wall material definitions
- `materials/floors.json` — array of floor material definitions
- `materials/ceils.json` — array of ceiling material definitions
- `materials/architectures.json` — object mapping architecture IDs to definitions
- `themes/themes.json` — object mapping theme IDs to definitions

Each JSON should have a valid structure that the config system can load (via fetch in browser). For foundation task, they can contain empty arrays or one example entry — the important part is the file exists and the loader path is wired.

### 6. JSON Asset Loader
In config.js, add `loadAssetJSON()` async function that:
- Fetches the 5 JSON files from `./assets/...` paths
- Merges loaded data into DEFAULTS (overriding empty defaults)
- Falls back gracefully to in-code defaults if fetch fails
- Called on browser init, dispatches config-saved event when loaded
- Returns boolean success

### 7. Main.js (runtime bootstrap)
- Minimal: check for canvas, get 2D context, clear to dark, draw placeholder text
- Import config.js and log loaded config to console
- No game loop yet — just static placeholder render

### 8. Editor.js (editor bootstrap)
- Import config.js
- Render current config values into DOM (simple `<pre>` dump is acceptable for foundation)
- Wire up Save / Reset / Export / Import buttons
- On save, call config.saveConfig() and show confirmation
- Listen for config-saved event and re-render

### 9. Running Instructions
Add to game README or as comment: serve src/ over HTTP (ES modules require http:// not file://). Example: `python -m http.server 8000` from src directory, then open http://localhost:8000/ for game and http://localhost:8000/editor.html for editor.

## Acceptance Criteria
- [ ] `src/index.html` loads and shows placeholder canvas with text
- [ ] `src/editor.html` loads and displays config, with working Save/Reset/Export/Import buttons
- [ ] Editing values in editor (via future UI or manual JSON import) persists to localStorage
- [ ] Game page reads config from localStorage on load
- [ ] JSON assets in `src/assets/` exist with valid structure and are fetchable
- [ ] No console errors on either page
- [ ] Pure ES modules, no build step, no external dependencies

## Out of Scope for This Task
- Actual dungeon rendering or gameplay — that's future tasks
- Full editor UI tabs — just the shell and config plumbing for now
- WebGL — 2D canvas placeholder is fine for foundation
