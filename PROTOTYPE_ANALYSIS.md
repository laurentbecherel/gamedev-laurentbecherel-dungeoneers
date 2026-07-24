# Dungeoneers Prototype — Exhaustive Feature Analysis

> **Source:** `c:\aai\gamedev-laurentbecherel-mygame\` — rough prototype to reconstruct as `gamedev-laurentbecherel-dungeoneers`
> **Purpose:** Reference guide for rebuilding feature-by-feature with proper task boundaries
> **Structure per section:** TL;DR → Rationale → Technical Deep Dive → Reconstruction Notes

---

## 0. High-Level Overview

### TL;DR
Browser-based first-person dungeon crawler. Pure ES modules, no build step, WebGL2 raycast renderer, data-driven JSON config with live editor UI. ~8,500 lines of JS across ~50 modules. Runs via `python -m http.server`.

### Rationale
- **Why browser + ES modules:** Zero build tooling means agents can edit text files directly without npm/webpack complexity. Matches ADO GameDev track "no IDE-dependent workflow" requirement.
- **Why WebGL2 raycaster not Three.js/Babylon:** Doom-authentic visual style requires column-based rendering with palette quantization and fixed-point artifacts — polygon engines can't replicate this. Raycaster also keeps GPU requirements minimal (no geometry pipeline, just fullscreen quad + fragment shader).
- **Why data-driven config:** Every parameter flows through `config.js` so the editor can tune anything live. This decouples game logic from magic numbers and enables external tooling to generate content via JSON.
- **Why two HTML pages:** Separation of runtime (game) and authoring (editor) from day one. Editor writes localStorage, game reads + listens for updates. No shared state beyond storage events.

### Technical Deep Dive

**Tech stack in detail:**
| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Vanilla JS ES modules (ES2020) | No transpilation, browser-native, agent-editable |
| Graphics primary | WebGL2 fragment shader raymarcher | Screen-space raycast, no geometry, Doom-authentic |
| Graphics secondary | 2D Canvas API | HUD minimap, sprite billboard overlay, editor UI |
| Data persistence | localStorage + JSON | Browser-native, synchronous, versioned |
| Asset format | JSON (materials, themes, architectures) + PNG (sprites) | Text-editable, agent-compatible |
| Module system | ES `import`/`export`, no bundler | Direct browser load via `<script type="module">` |
| Server requirement | Any static HTTP server | ES modules blocked on `file://` protocol |

**File count by subsystem:**
```
config/          1 file    (~730 lines)  — central config + migration
core/            1 file    (~375 lines)  — Game orchestration class
world/           7 files   (~1,800 lines) — dungeon gen, materials, scene, atlas, themes
render/          9 files   (~2,300 lines) — WebGL renderer, shaders, palette, sprites, GL utils
entities/        3 files   (~400 lines)  — player controller, characters, sprite entity
systems/         3 files   (~350 lines)  — input, lights, particles
ui/              2 files   (~200 lines)  — HUD, shadow debug
rpg/             4 files   (~600 lines)  — classes, boons, equipment, run manager (not wired)
editor/          18 files  (~1,200 lines) — tabbed UI, 14 subsystem tabs, widgets, PBR debugger
assets/          5 JSON + sprite PNGs     — data-driven content
util/            1 file    — debug logger
tests/           1 harness — Node-based verification (no browser needed)
Total: ~8,500 lines JS + ~1,350 lines GLSL shaders
```

**Entry point flow:**
```
index.html
  → <script type="module" src="main.js">
    → import { Game } from './core/game.js'
    → import { isWebGL2Supported } from './render/renderer-gpu.js'
    → new Game(canvas) → game.start()
      → requestAnimationFrame loop
        → input.update() → player.update()
        → particleSystem.update()
        → charManager.update()
        → gpuRenderer.render(map, player, chars)
        → gpuRenderer.renderCharacters(chars, player, map)
        → ui.drawMinimap() + ui.updateStats()

editor.html
  → <script type="module" src="editor.js">
    → import { getConfig, saveConfig, ... } from './config/config.js'
    → import tab builders from './editor/tabs/*.js'
    → build tabbed UI, each tab lazy-builds on first open
    → Save button → saveConfig() → localStorage + CustomEvent
```

**Core architectural principles:**
1. **Data flows down, never up:** Config is read-only in game logic (via getters). Only editor writes. Game subscribes to change events.
2. **Determinism:** Dungeon generator uses seeded hash functions (`hash2i`), not `Math.random()`, so same seed + same config = identical dungeon. Critical for regression testing.
3. **Modular by concern:** Each folder owns one subsystem. No cross-imports between peer folders except via config or well-defined APIs.
4. **Live-editable:** Every numeric/string/enum parameter in config has a corresponding editor control. No parameter is hardcoded in a way that requires code change to tune.
5. **Graceful degradation:** Every module checks `isBrowser()` and no-ops in Node. Enables test harness to import modules without browser environment.

### Reconstruction Notes
Task 1 must establish the module structure, config system skeleton, two HTML entry points, and the data flow pattern (editor writes localStorage → game reads + listens). The prototype's ~730-line config.js is the result of 12 versions of migration — reconstruction can start with version 1 skeleton and grow incrementally per task.

---

## 1. Foundation / Config Engine

**Files:** `config/config.js` (~730 lines), `main.js`, `index.html`, `editor.html`, `editor.js`

### TL;DR
Single source of truth for every tweakable parameter in the entire game. The editor mutates config and persists; the game reads on boot and applies live. Versioned migration ensures old localStorage doesn't break on updates.

### Rationale
- **Agent compatibility:** Text files only, no IDE-dependent workflow — matches ADO GameDev track requirement for agent-built games
- **Live tuning:** Designer tweaks in editor tab, game tab updates without reload via storage events
- **Data-driven:** JSON assets override in-code defaults, enabling external tooling to generate content

### Technical Deep Dive

**Config structure (DEFAULTS object, version 12 in prototype):**
```js
{
  version: 12,
  walls: [16 materials],        // from JSON or in-code fallback
  floors: [10 materials],
  ceils: [8 materials],
  architectures: {8 types},     // prison, ruins, castle, mossy, cave, cathedral, wood, crystal
  lightTypes: [6 types],        // point_torch, spot_wall, flicker_candle, pulse_crystal, emissive_proxy, ambient_fill
  themes: { classic: {...} },   // zone progression with weighted material pools
  boundaryWallId: 5,
  texSize: 64,
  torchColors: [4 variants],
  items: { maxTorches, minTorchDist, ... },
  lights: { ambient, sunDir, fog, ... },
  characters: { shadow: {...}, pbr: {...} },
  player: { moveSpeed, bob params, light source, gridMode, ... },
  renderer: { authentic, paletteStyle, bandLevels, pom, spriteMode, ... },
  generator: { mapW, mapH, roomTarget, roomAttempts, levelCount, seed, ... },
  materialProc: { walls:{heightScale,normalStrength,...}, floors:{...}, ceils:{...} }
}
```

**Persistence flow:**
1. `getConfig()` → deep clone of merged defaults + stored
2. `getConfigLive()` → direct reference to cached merged (for live mutation detection)
3. `saveConfig(cfg)` → JSON.stringify to `localStorage['retro_dungeon_config_v1']` + dispatch `CustomEvent`
4. `loadFromStorage()` → parse + `migrateIfNeeded()` through version chain v1→v12
5. Migration functions handle schema changes (e.g., v9 added stairs_down material, epic 80x80 scale; v10 expanded to 16/10/8 materials + architectures + light types; v12 added player light breathing)

**JSON asset loader:**
- `loadAssetJSON()` async fetches 5 files: `assets/materials/walls.json`, `floors.json`, `ceils.json`, `architectures.json`, `assets/themes/themes.json`
- Merges into DEFAULTS, overriding in-code fallbacks
- Falls back gracefully if fetch fails (e.g., file:// protocol or missing files)
- Called on browser init, dispatches config-saved when loaded

**Editor integration:**
- `editor.js` builds tabbed UI, each tab in `editor/tabs/*.js` receives `EditorContext` with working config reference
- Save button → `saveConfig()` → game tab receives storage event → applies live via `_onStorage()` / `_onConfigSaved()` in `core/game.js`
- Raw JSON tab for export/import/copy/upload of entire config as JSON file

### Reconstruction Notes
The config system is the **backbone**. Task 1 must establish this first — without it, no other feature can be data-driven. The editor shell and game shell both depend on config.js being the single import point for all parameters.

---

## 2. Editor UI

**Files:** `editor.html` (~80 lines), `editor.js` (~115 lines), `editor.css` (~200 lines), `editor/context.js`, `editor/widgets.js`, `editor/preview.js`, `editor/pbr-debugger.js`, `editor/tabs/*.js` (14 files, ~60-120 lines each)

### TL;DR
Tabbed parameter editor — not a level editor. 14 subsystem tabs + overview + raw JSON tab. Every control bound to config path via EditorContext pattern. Changes mutate working config in place; Save button persists to localStorage triggering live game update via storage events. Tab content built lazily on first open for performance.

### Rationale
- **Why tabbed not single scroll:** 200+ parameters across 14 subsystems would overwhelm a single view. Tabs group by concern matching code folder structure, creating consistent mental model between editor UI and codebase organization.
- **Why lazy-build tabs not all at once:** 14 tabs × dozens of DOM elements each = slow initial load and high memory. Building tab content only when first opened keeps editor responsive on load. `target.dataset.built` flag prevents rebuilding on subsequent tab switches.
- **Why EditorContext pattern not global state:** Encapsulates working config reference, save pipeline, and toast UI feedback in one object passed to tab builders. Tab builders are pure functions `(ctx) => void` that render into their panel DOM element — modular, testable, no hidden dependencies.
- **Why raw JSON tab alongside structured tabs:** Power users and agents need direct JSON access for bulk edits, copy/paste between browser instances, version control diffs, and programmatic manipulation. Structured tabs serve interactive tuning; raw tab serves programmatic access. Both write to same config object ensuring consistency.
- **Why no auto-save on every control change:** Prevents excessive localStorage writes and storage event spam to game tab during rapid slider dragging. User explicitly clicks Save All when satisfied, creating intentional save points. beforeunload handler calls saveQuiet() as safety net.

### Technical Deep Dive

**editor.html structure (~80 lines):**
- HTML5 boilerplate with dark theme CSS link to `editor.css`
- Tab button bar container `#tabs` holding 16 `<button>` elements, each with `data-tab` attribute matching corresponding panel ID (values: overview, walls, floors, ceils, architectures, lighttypes, themes, torches, lights, characters, player, renderer, generator, geometry, textures, raw)
- 16 tab panel containers `.tab-panel` with IDs `tab-overview` through `tab-raw` — CSS rule `.tab-panel { display: none; }` and `.tab-panel.active { display: block; }` (or grid) controls visibility. Only one panel active at a time.
- Global control bar with Save All button (`#saveAll`), Reset All button (`#resetAll` with confirm dialog)
- Raw tab panel contains: `<textarea id="rawJson">` monospace for JSON display/edit, Export button (`#exportBtn`), Import button (`#importBtn`), Copy button (`#copyBtn`), hidden `<input type="file" id="fileInput" accept=".json">`, Upload button (`#uploadBtn`), status `<span id="rawStatus">`
- Toast container (likely fixed-position div) for transient save feedback messages

**EditorContext class (`editor/context.js`):**
```js
class EditorContext {
  constructor({ cfg, saveConfig, exportConfigJSON }) {
    this.cfg = cfg;  // working reference — direct mutations affect this object
    this._saveConfig = saveConfig;           // imported from config/config.js
    this._exportConfigJSON = exportConfigJSON;
  }
  save() {
    this._saveConfig(this.cfg);              // persist to localStorage
    this.toast('Saved');                     // UI feedback
    this.refreshRaw();                       // update raw JSON textarea
  }
  saveQuiet() {
    this._saveConfig(this.cfg);              // no toast, for beforeunload
  }
  toast(msg) {
    // Show transient overlay message top-right, fade after ~2s via CSS transition
    // Implementation likely creates/fades a div or updates existing toast element
  }
  refreshRaw() {
    const ta = document.getElementById('rawJson');
    if (ta) ta.value = this._exportConfigJSON();  // pretty-printed JSON
  }
}
```

**Tab switching and lazy building (`editor.js` initTabs function):**
```js
function initTabs() {
  const btns = document.querySelectorAll('#tabs button');
  const panels = document.querySelectorAll('.tab-panel');
  btns.forEach(b => {
    b.onclick = () => {
      // Deactivate all buttons and panels
      btns.forEach(x => x.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      // Activate clicked button and corresponding panel
      b.classList.add('active');
      const id = b.dataset.tab;
      const target = document.getElementById('tab-' + id);
      if (target) target.classList.add('active');
      // Lazy build: only construct tab content on first open
      const builder = tabBuilders[id];
      if (builder && !target.dataset.built) {
        builder(ctx);                    // tab builder receives EditorContext
        target.dataset.built = '1';      // mark as built to prevent rebuild
      }
    };
  });
}
```
Tab builders registry maps tab ID string to builder function:
```js
const tabBuilders = {
  walls: buildWalls,           // imported from './editor/tabs/walls.js'
  floors: buildFloors,
  ceils: buildCeils,
  architectures: buildArchitectures,
  lighttypes: buildLightTypes,
  themes: buildThemes,
  torches: buildTorches,
  lights: buildLights,
  characters: buildCharacters,
  player: buildPlayer,
  renderer: buildRenderer,
  generator: buildGenerator,
  geometry: buildGeometry,
  textures: buildTextures,
  // overview and raw are built directly in editor.js, not via registry
};
```

**widgets.js helper API — DOM factory functions returning elements with bound event handlers:**
- `slider(label, min, max, step, value, onChange)` → returns div containing label span, range input element, and live-updating number display span. Input event calls onChange(newValue) with parsed float.
- `colorPicker(label, rgbArray255, onChange)` → HTML `<input type="color">` bound to [r,g,b] array 0-255. Converts hex to/from RGB array on change.
- `colorPickerRGB01(label, rgbArray01, onChange)` → same but for 0..1 range used by emissive colors in material definitions. Converts hex to 0..1 float array.
- `select(label, optionsArray, value, onChange)` → `<select>` dropdown with option elements. Options array contains {value, label} objects or strings.
- `textInput(label, value, onChange)` → text field input with change/input event binding.
- `numberInput(label, value, onChange, step=1)` → number type input with step control for precise numeric entry.
- `checkbox(label, checked, onChange)` → toggle checkbox input.
- `section(title)` → returns collapsible container element — likely `<details><summary>title</summary><div class="section-content"></div></details>` or styled div with header for grouping related controls within a tab.
- All helpers return DOM elements ready to append to panel. onChange callbacks mutate `ctx.cfg` properties directly — no intermediate state.

**14 subsystem tabs — control inventory in detail:**

1. **Overview** (`editor/preview.js` `buildOverview`): Read-only dashboard. Shows config version number, material counts (16 walls / 10 floors / 8 ceils from live config arrays), architecture type count (8), theme info (name, zone count), possibly quick stats like total parameters or last saved timestamp. No editable controls — informational only.

2. **Walls** (`editor/tabs/walls.js`): Iterates `ctx.cfg.walls` array (16 materials). Per material renders collapsible section with: name text input, type select dropdown (options: brick, stone_block, ashlar, cave, plaster, pillar, arch, metal_trim, rubble, wood), base color picker (RGB 0-255), roughness slider 0..1 step 0.01, metal slider 0..1 step 0.01, tag text input, role text input (longer description), architectureShape select (12 shape options: brick_bond, ashlar_rough, mossy, planks, ashlar_grand, cave, plaster, pillar, arch_stairs, bars, rubble, arch), tileScale number input, variationSeed number input, emissive color picker RGB01 (0..1 range), emissiveStrength slider 0..1 step 0.01, storyTags text input (comma-separated, split on save or stored as array).

3. **Floors** (`editor/tabs/floors.js`): Same pattern for 10 floor materials. Type options: slab, cobble, rubble, dirt, mosaic, tile, crystal. Same field set as walls.

4. **Ceils** (`editor/tabs/ceils.js`): Same for 8 ceiling materials. Type options: slab, vault, beams, cave, organic, crystal, mossy.

5. **Architectures** (`editor/tabs/architectures.js`): Per architecture type (8 total: prison, ruins, castle, mossy, cave, cathedral, wood, crystal). Per architecture: name text input, description textarea, wallShapes object editor (dynamic list of shape name → weight number pairs with add/remove row buttons), floorShapes object editor same pattern, ceilShapes object editor, decoMult object editor (8 deco types each with multiplier slider, likely 0..3 range), pillar subgroup with spacing number input and columnChance slider 0..1, storyTags text input comma-separated.

6. **Light Types** (`editor/tabs/lighttypes.js`): Per light type (6 total). Per type: name text, type select dropdown (point, spot, flicker, pulse, emissive, ambient), baseIntensity slider, baseRadius slider, flickerSpeed slider (for flicker type), flickerAmount slider 0..1, pulseSpeed slider (for pulse type), pulseAmount slider 0..1, coneInner slider 0..1 and coneOuter slider 0..1 (for spot type, inner/outer cone angles as cosine values), castShadows checkbox, color picker RGB.

7. **Themes** (`editor/tabs/themes.js`): Most complex tab. Theme selector dropdown (currently only 'classic' but structure supports multiple). For selected theme: name text, description textarea, boundaryWallId number. Corridor section (separate from zones): wallPool editor (dynamic table of material ID + weight pairs with add/remove), floorPool editor same, ceilPool editor same, deco object with 8 probability sliders (moss, vines, roots, broken, puddle, beam, column, arch each 0..1), pillar spec (spacing number, columnChance slider, useCarvedId number). Zones section: for each of 5 zones in order — collapsible section per zone with name text, tStart/tEnd range sliders defining zone boundaries in 0..1 global depth (must not overlap, likely validated or auto-adjusted), wall/floor/ceil weighted pools same editor pattern as corridor, deco probabilities object same 8 sliders, height subgroup with floorMin/Max sliders (likely -0.2 to 0.2 range), floorBlockAmp slider, ceilMin/Max sliders (likely 0.8 to 1.6), ceilJitter slider, vault weights subgroup (4 vault types — flat, dome, barrel NS, barrel EW — each with weight slider), pillar spec same as corridor, architectureWeights object editor (8 architectures each with weight slider for per-zone architecture distribution).

8. **Torches** (`editor/tabs/torches.js` — may be merged into items or lights tab): Torch color variants array editor — per variant: RGB color picker, intensity slider, radius slider, name text input, with add/remove variant buttons. Placement parameters subgroup: maxTorches number, minTorchDist slider, torchOffset slider (distance from wall), flame size min/range sliders, Z base height + jitter sliders, flicker speed min/range and amount min/range sliders, corridor target factor slider.

9. **Lights** (`editor/tabs/lights.js`): Ambient subgroup — ambient level slider 0..1, ambient color picker RGB, worldAmbientMul slider. Sun subgroup — sun intensity slider, sun color picker RGB, sun direction as 3 sliders for x/y/z vector components (likely -1..1 range, normalized in shader) or possibly spherical coordinate inputs (azimuth/elevation). Limits subgroup — maxLights number input (1-12, constrained by shader MAX_LIGHTS constant). Fog subgroup — fog base slider and fog squared slider controlling exponential fog equation. Global multiplier — lightIntensityMultiplier slider scaling all point light intensities.

10. **Characters** (`editor/tabs/characters.js`): Shadow subgroup — enabled checkbox, contactStrength slider 0..1 (darkening intensity of circular AO under feet), contactRadius slider 0..2 world units (size of contact disc), silhouetteStrength slider 0..1 (darkening of projected silhouette), silhouetteOpacity slider 0..1, maxLength slider 0..10 world units (how far shadow projects), useSilhouette checkbox, debugMode select dropdown (0=off/normal dark subtle shadows, 1=bright red disc at character footprint for position validation, 2=bright red silhouette projection for shape validation). PBR subgroup — normalStrength slider 0..5 (multiplier on normal map XY components to fix flat appearance), rimStrength slider 0..3 (glow intensity when light behind sprite), rimEnabled checkbox, ambientBoost slider 0..3 (makes NPC visible far from torches), usePerPixel checkbox (enables per-pixel inferred normal sampling vs per-sprite uniform normal).

11. **Player** (`editor/tabs/player.js`): Movement subgroup — moveSpeed slider (likely 1..6), strafeSpeed slider, turnSpeedKeyboard slider (radians/sec), mouseSensitivity slider (0.0005..0.005), radius number input (collision radius in tile units), gridMoveSpeed slider (lerp speed for grid mode), gridTurnSpeed slider, gridMode checkbox (toggle free vs grid movement), grid hold initial delay slider and repeat delay slider (key repeat timing for grid step). View bob subgroup — viewBobEnabled checkbox, ampY slider 0..0.08 world units (vertical bob height), ampX slider 0..0.08 (horizontal sway), ampRollDeg slider 0..3 degrees (camera roll), freq slider 4..16 Hz (bob cycles per second at full speed), speedScale slider (multiplier on bob ramp with movement velocity). Preset buttons applying four documented presets: Doom authentic button sets all to 0, Quake default button sets 0.02/0.01/0.8°/9/1.0, Heavy armor button sets 0.035/0.008/0.3°/6/0.8, Light rogue button sets 0.015/0.02/1.2°/11/1.2. Player light subgroup — enabled checkbox, intensity slider, radius slider, color picker RGB, height slider (light source height above player feet in world units), noShadow checkbox (optimization flag — player light doesn't cast shadows to save performance), breatheSpeed slider (primary sine frequency in Hz), breatheAmount slider (primary amplitude 0..1), breatheSpeed2 slider (secondary sine frequency), breatheAmount2 slider (secondary amplitude) — dual sine waves create organic non-repeating flicker pattern.

12. **Renderer** (`editor/tabs/renderer.js`): Authentic checkbox (toggles palette quantization post-pass on/off), paletteStyle select dropdown (doom/custom — though only doom implemented), bandLevels slider 2..64 (number of palette quantization bands, default 32 matching Doom colormap), textureFilter select (nearest/linear — nearest gives crisp pixel art look, linear gives smooth), resolution select dropdown (320x200 VGA, 640x360 default, 960x540, 1280x720 — changes canvas internal resolution, CSS scales to fit), POM subgroup with wall strength slider 0..0.15, floor strength 0..0.15, ceil strength 0..0.15 (parallax occlusion mapping offset strength), fogEnabled checkbox, sunShadowStrength slider 0..1, torchGlow checkbox, viewBob checkbox (duplicate of player setting — inconsistency noted, should unify), spriteMode select (cpu/gpu — toggles between 2D canvas billboard path and WebGL sprite shader path).

13. **Generator** (`editor/tabs/generator.js`): mapW and mapH number inputs (suggested range 32-128, prototype uses 80×80 epic scale), roomTarget number input (target room count, prototype 52), roomAttempts number input (placement attempts before giving up, prototype 260), levelCount number input 1..10 (floors in run), seed text input (empty string or "null" means random seed each generation, numeric string = fixed seed for reproducibility), loopExtraChance slider 0..0.5 (probability of adding extra loop edges beyond MST for alternative routes), flattenStartRadius number 0..5 (tiles around spawn flattened to height 0 for stable starting area).

14. **Geometry** (`editor/tabs/geometry.js`): Likely focused on vault geometry parameters or global geometric constants. May overlap with themes zone height editors but at global override level. Possibly vault type shape coefficients, global height scale factors, or doorway/arch dimensions. Exact contents unclear from file listing alone — would need to read file to confirm, but pattern suggests numeric sliders for geometric tuning beyond what themes zones provide.

15. **Textures** (`editor/tabs/textures.js`): materialProc editor — per surface type subgroup (walls, floors, ceils). Each subgroup: heightScale slider 0.5..2.0 (scales height map deviation from 0.5 midpoint — higher = more extrusion), normalStrength slider 0.5..3.0 (multiplies normal XY for bumpier lighting), aoBoost slider 0.5..2.0 (scales ambient occlusion contrast), groutWidth slider 0..3 (mortar thickness in pixels, affects procedural pattern generation). Walls additionally: domeStrength slider 0.5..2.0 (brick/block dome bulge amount), crackAmount slider 0..2.0 (crack probability and depth scaling). Floors additionally: blockSize slider 2..16 (paving stone size in pixels), microOffset slider 0..0.3 (world Z lift for floor tiles to make POM visible without floating appearance).

16. **Raw JSON** (built directly in editor.js, not via tab builder registry): Textarea element `#rawJson` with monospace font family showing pretty-printed JSON from `exportConfigJSON()`. Export button calls `ctx.refreshRaw()` to repopulate textarea from current working config (useful after making changes in structured tabs to see JSON representation). Import button reads textarea value → `importConfigJSON()` → validates JSON has required fields (walls array, floors array, version) → if valid calls saveConfig → shows toast and status message prompting page reload to rebuild all tabs with imported data (reload needed because tabs already built with old config references). Copy button uses `navigator.clipboard.writeText()` API with try/catch fallback to toast "Copy failed" if clipboard API unavailable or permission denied. Upload button triggers hidden file input click → FileReader reads selected .json file as text → populates textarea → updates status span with filename and instruction to click Import to apply (two-step process prevents accidental overwrite from file selection alone).

**PBR Debugger detail (`editor/pbr-debugger.js`):**
Likely standalone tool — possibly separate HTML page or dynamically created modal overlay. Contains: preview canvas showing sprite rendered with current PBR parameters, light control sliders (angle around sprite 0-360°, elevation angle, intensity, distance), PBR parameter sliders mirroring character PBR config (normalStrength 0..5, rimStrength 0..3, ambientBoost 0..3, rim toggle), real-time preview update on slider change showing lit sprite result. Purpose is visual tuning loop — adjust parameters while seeing immediate visual feedback on sprite appearance under controlled lighting, then copy values to main editor character tab. May include preset buttons or A/B comparison toggle.

**CSS styling approach (`editor.css` ~200 lines):**
Dark theme throughout — background #1a1a1a or similar very dark gray, text #e0e0e0 light gray, accent color likely orange/brown matching dungeon aesthetic for active states. Tab bar as horizontal flex container with buttons styled as tabs (bottom border highlight for active, subtle background change on hover). Tab panels use CSS Grid for control layout — probably 2-column grid with labels in first column (fixed width ~180px right-aligned) and inputs in second column (flexible). Sliders given custom styling via `::-webkit-slider-thumb` and `::-moz-range-thumb` for consistent dark theme appearance across browsers. Color inputs styled to match dark theme (may need wrapper div since native color input styling limited). Sections within tabs likely use `<fieldset>` with `<legend>` or bordered divs with bold headers for visual grouping. Toast messages positioned fixed top-right with semi-transparent dark background, white text, fade in/out via CSS opacity transition over ~2 seconds controlled by adding/removing CSS class via JavaScript timeout. Raw JSON textarea uses monospace font family (Consolas, Monaco, monospace stack), dark background slightly lighter than page background for contrast, light text, preserved whitespace, vertical scroll.

**Save/Reset wiring detail:**
```js
// In editor.js boot sequence after tab init:
document.getElementById('saveAll').onclick = () => ctx.save();

document.getElementById('resetAll').onclick = () => {
  if (confirm('Reset all settings to defaults? This cannot be undone.')) {
    ctx.cfg = resetConfig();    // returns fresh deep clone of DEFAULTS, already saved to localStorage
    ctx.save();                  // redundant save but ensures event dispatch
    location.reload();           // full page reload to rebuild all tabs from fresh defaults
  }
};

// Auto-save safety net:
window.addEventListener('beforeunload', () => ctx.saveQuiet());
// Ensures any unsaved changes in working config are persisted if user closes tab accidentally.
// Uses saveQuiet (no toast, no raw refresh) to avoid UI operations during unload.
```

**Live update mechanism to game tab — full flow:**
1. User adjusts slider in editor tab → onchange handler fires → mutates `ctx.cfg.specific.path = newValue` directly (working config object modified in place, not yet persisted)
2. User clicks Save All → `ctx.save()` → calls `saveConfig(ctx.cfg)` from config module
3. `saveConfig` deep clones cfg, sets version and _savedAt timestamp, JSON.stringifies to localStorage key `retro_dungeon_config_v1`
4. `saveConfig` dispatches `new CustomEvent('rd-config-saved', {detail: cachedConfig})` on window
5. `saveConfig` returns true → `ctx.save()` shows toast "Saved" and refreshes raw JSON textarea
6. Game tab (separate browser tab, same origin) receives ONE of:
   a. `storage` event — browser fires automatically on localStorage change in other tabs (cross-tab). Event contains key, oldValue, newValue.
   b. `CustomEvent('rd-config-saved')` — only if editor and game in same tab/window (unusual but possible via iframe or same-tab navigation)
7. Game's event handler (`_onStorage` or `_onConfigSaved` in core/game.js):
   - Calls `getConfigLive()` to get fresh merged config (reads from localStorage if storage event, or uses event.detail if custom event)
   - Calls `this._applyRendererLive(live.renderer)` → applies renderer settings via setter methods on GPURenderer instance (setAuthentic, setPaletteStyle, setBandLevels, setTextureFilter, setSpriteMode, setResolution if changed)
   - Updates player bob params via `this.player.setBobParams()` with new values from live config
   - Logs light/character changes to console via dlog (actual visual update happens next frame when renderer reads live config values during render call)
   - If walls/floors/ceils changed → calls `this._rebuildMaterialsLive()` → dynamic import of atlas.js → `refreshLookups()` → `gpuRenderer.rebuildMaterials()` → regenerates procedural atlases and re-uploads to GPU textures
8. Next animation frame → renderer reads updated config values via live getters during render() call → visual changes appear without page reload

---

## 3. Dungeon Generator

**Files:** `world/dungeon/generator.js` (~954 lines), `world/dungeon/atlas.js` (~100 lines), `world/dungeon/themes.js` (~283 lines), `world/dungeon/index.js`, `world/map.js`, `world/items.js` (~120 lines)

### TL;DR
9-stage procedural pipeline producing themed story-consistent dungeons via MST connectivity, role-based room assignment, 5-zone theme progression, and deterministic seeded hashing. Grid-based output (80×80, 52 rooms target) compatible with DDA raycaster. Fully data-driven via weighted material pools in JSON themes. Same seed + same config = bit-identical output for regression testing.

### Rationale
- **Why grid-based not sector/BSP:** Simpler to implement and debug — grid maps work perfectly with DDA raycaster using same approach as Wolfenstein 3D. True Doom sector geometry would require BSP tree builder adding significant complexity for marginal visual benefit at prototype stage. Grid simplifies collision detection to array lookups and enables straightforward procedural carving algorithms.
- **Why MST + longest path for topology:** Minimum Spanning Tree guarantees connectivity (every room reachable from every other — no isolated disconnected components). Longest path via double BFS gives natural main critical path from entrance to stairs without manual authoring. Side branches off main path become treasure/secret rooms organically based on graph distance, creating emergent level flow rather than random scatter.
- **Why role assignment by topology not random:** Creates intentional pacing beats through spatial narrative — entrance room at start of main path establishes safe starting area, stairs at end provides clear goal, guardians at 65-75% and 85-95% along path create boss-like difficulty spikes before exit, treasure at 40% and 60% rewards mid-run exploration, hubs at high-degree junctions become natural decision points. Player experiences designed tension curve not random difficulty spikes.
- **Why deterministic hashing not RNG for material/deco picks:** `hash2i(x,y)` integer hash function gives identical output every time for same coordinates across all JS engines and runs. Ensures same seed produces bit-identical dungeon enabling regression golden tests. `Math.random()`-based picks would vary between runs breaking determinism contract. Hash used for material selection, deco placement, pillar positions — anything requiring stability per seed. RNG still used for room placement and graph construction where order matters but determinism maintained via seeded LCG.
- **Why 5-zone theme progression not uniform materials:** Mimics classic dungeon descent narrative arc — grand entrance halls signal beginning of adventure, crafted upper works suggest active maintenance, rough mid vaults imply age and decay setting in, damp deep areas with moss and roots show nature reclaiming, mystical abyss shrine at bottom provides climactic otherworldly atmosphere. Each zone has distinct material palette, deco density, height variation, and architecture distribution creating visual storytelling through environment alone without explicit narrative text.
- **Why weighted pools not fixed per-zone materials:** Weighted random selection via hash creates variety within zone consistency preventing monotony. Entrance zone 65% large_ashlar + 25% dungeon_brick + 10% carved_pillar means most walls read as grand ashlar establishing zone identity, but occasional brick accents and pillar details break uniformity adding visual interest. Weights tunable per zone in editor enabling designers to adjust zone character without code changes.

### Technical Deep Dive

**Pipeline overview — 10 stages:**

**1. Rooms + connectivity**
- Generate 52 target rooms (80x80 epic scale) via random placement with overlap rejection (260 attempts)
- Room sizes 4..11 tiles varied
- Build complete graph weighted by squared Euclidean distance
- Kruskal MST for minimum spanning tree → base connectivity
- Double BFS to find longest path in tree → **main critical path** (entrance to stairs)
- Add extra loop edges (18% chance) for alternative routes
- Tag edges: `main`, `side`, `loop`, `secret`

**2. Role assignment (story topology)**
Based on position in main path and degree:
- `entrance` — start of main path
- `stairs` — end of main path (stairs_down material forced)
- `guardian` — at 65-75% and 85-95% along main path (boss-like encounters)
- `treasure` — at ~40% and ~60% along main path
- `hub` — degree ≥3 on main path (junction rooms)
- `hall` — other main path rooms
- `armory` / `shrine` — side branches off main path (1 tile deep)
- `secret` — leaf nodes or 2 tiles deep from main path
- `corridor` — default

**3. BFS depth from start**
- Compute room depths from entrance room via adjacency BFS
- Normalize to 0..1 within level
- Map to global depth 0..1 across multi-level run via `theme.globalDepthForLevel(localT, levelIndex, levelCount)`

**4. Theme zone resolution**
- Theme `classic` has 5 zones: Entrance (0-15%), Upper Works (15-35%), Mid Vaults (35-58%), Deep Damp (58-82%), Abyss Shrine (82-101%)
- Each zone defines: wall/floor/ceil weighted pools, deco probabilities, height ranges, vault type weights, pillar spec, architecture weights
- `zoneForDepth(globalT)` returns zone + local progress within zone

**5. Room material assignment**
- Deterministic weighted pick from zone pools using `hash2i()` seeded hash (not RNG — ensures same seed = same materials)
- Special cases: entrance forces primary materials for readability, stairs room forces wall material 9 (stairs_down), treasure forces floor material 6 (mosaic), secret favors cave/plaster
- Architecture picked per room from zone architecture weights + role bias via `pickArchitecture()`
- Height profiles from zone: floorMin/Max, floorBlockAmp, ceilMin/Max, ceilJitter, vault weights
- Vault type picked from zone vault weights (+ guardian/treasure bias toward dome)

**6. Grid carving**
- Initialize grid to boundary wall material ID
- Carve rooms as floor (GRID_FLOOR = 0)
- Carve corridors via L-shaped paths (hThenV or vThenH randomly) along MST edges
- Enforce outer boundary walls

**7. Wall painting (coherent)**
- **First pass:** room perimeter walls get room's wallMat (coherent per room)
- Special: stairs room south wall 3-wide override to material 9 for fake door illusion
- **Second pass:** corridor walls pick from corridor pool via hash; unpainted interior walls assign nearest room's material
- **Pillar accents:** carved_pillar material (id 8) inserted at corners and long straight walls based on zone pillar spec (spacing, columnChance)
- Enforce outer boundary again

**8. Floor/ceiling heights & materials**
- Per-cell floor height: room base + block variation (scaled to 30% to avoid floating tiles bug) + cell jitter + rare shallow pits/mounds
- Per-cell ceiling height: room base + vault logic (dome/barrel/cross based on vault type) + jitter
- Floor material: mostly room's, occasional accent from zone pool (86% room / 14% accent)
- Ceiling material: room's
- Corridors: almost flat height (blended toward nearest room base to prevent doorway steps), corridor material pools
- **Critical fix:** old code used `floorHeight[idx] !== 0` to detect room vs corridor, which failed when room floor was flat at 0 → corridor overwrote room → duplicated floating tiles. Fixed to use `floorToRoom` lookup array.

**9. Deco flags (bitmask per cell)**
- Wall deco: COLUMN (pillar/corner), MOSS, VINES, ARCH — probabilities from zone deco + material bonuses (mossy_stone +28% moss, cave +22%, etc.), suppressed for stairs_down material
- Floor/ceiling deco: BROKEN, PUDDLE, ROOTS, BEAM — zone-driven probabilities, material-influenced

**10. Items & lights**
- `generateDungeonItems()` places torches with min distance constraint, corridor bias factor, color variation from torchColors config
- Each torch becomes a light source + particle emitter in the scene

### Output format
```js
{
  w, h,                                    // dimensions (80x80)
  grid: Uint8Array,                        // 0=floor, 1..16=wall material ID
  floorHeight: Float32Array,               // per-cell floor Z
  ceilHeight: Float32Array,                // per-cell ceiling Z
  deco: Uint8Array,                        // bitmask per cell
  floorMat: Uint8Array,                    // 1..10 floor material ID
  ceilMat: Uint8Array,                     // 1..8 ceiling material ID
  startX, startY,                          // entrance position
  seed,
  rooms: [...],                            // room objects with role, zone, materials, architecture, etc.
  items: [...],                            // torch placements
  lights: [...],                           // light definitions
  meta: { themeId, themeName, levelIndex, levelCount, boundaryWallId, zoneSummary, edges, depths, rolesSummary, archSummary, ... }
}
```

### Reconstruction Notes
Generator is **deterministic and data-driven**. Same seed + same config = same dungeon. All probabilities flow through weighted pools defined in JSON themes. Task 2 should build the generator with minimal material support first (maybe just 2-3 materials), then expand as materials system comes online in Task 5.

---

## 4. Materials System (Procedural PBR)

**Files:** `world/materials.js` (~860 lines), `world/dungeon/atlas.js` (~100 lines), `assets/materials/walls.json`, `floors.json`, `ceils.json`, `architectures.json`

### TL;DR
Generate procedural PBR texture atlases at runtime via CPU — no image assets needed. 16 wall + 10 floor + 8 ceiling materials each with 6 maps (albedo, normal from height gradient, height, roughness/metal, AO, emissive) at 64x64 packed into horizontal atlases. Type-dispatched procedural patterns with architectureShape hints. Config-tunable proc parameters exposed in editor.

### Rationale
- **Why procedural not image assets:** Agent-built games cannot rely on artist textures. Procedural from JSON enables infinite variety from compact specs. Matches ADO track "model generates all pixels" guidance.
- **Why PBR with 6 maps:** Modern lighting model gives realistic material response to dynamic torch lights. Even retro-styled, PBR makes materials distinguishable under varying illumination vs flat shading.
- **Why CPU generation not GPU compute:** WebGL2 lacks compute shader support. Generation once at startup (~100ms) acceptable. Enables test harness verification without GPU. Pure functions input JSON output Uint8Array, no WebGL dependency.
- **Why 64x64 tile size:** Balance detail vs atlas size. 16x64=1024px wide fits GPU memory. Larger tiles bloat atlas with diminishing returns for pixel art aesthetic.
- **Why emissive packed in RM.B:** WebGL texture unit limit ~16. Separate emissive atlas would exceed limit. Packing emissive strength into roughMetal B channel saves unit.
- **Why type-dispatched patterns:** Each material type needs distinct algorithm matching real-world structure. Type field drives dispatch to appropriate generator with t-index fallback for legacy.

### Technical Deep Dive

**Atlas layout:** — no image files needed. Each material gets albedo, normal map (from height), height map, roughness/metalness, ambient occlusion, and emissive maps. All 64x64 tiles packed into horizontal atlases.

### Technical Deep Dive

**Atlas layout:**
- **Walls:** 16 materials × 64px = 1024×64 atlas, 6 maps (albedo, normal, height, roughMetal, ao, emissive)
- **Floors:** 10 materials × 64px = 640×64 atlas, 6 maps
- **Ceilings:** 8 materials × 64px = 512×64 atlas, 6 maps
- **Flame:** 4 frames × 32px = 128×32 atlas for torch particles

### Material definition schema (from JSON)
```json
{
  "id": 1,
  "name": "dungeon_brick",
  "type": "brick",
  "base": [138, 58, 44],
  "roughness": 0.85,
  "metal": 0,
  "tag": "masonry",
  "role": "Upper crafted dungeon running bond",
  "architectureShape": "brick_bond",
  "tileScale": 1,
  "variationSeed": 101,
  "emissiveColor": [0, 0, 0],
  "emissiveStrength": 0,
  "storyTags": ["castle", "prison", "upper"]
}
```

### Procedural generation per material type

The generator dispatches by `type` field with t-index fallback for legacy:

- **brick** (t=0,10,13): running bond pattern 8px bricks, mortar grooves, dome bulge per brick, edge wear cracks. Hash-based variation per brick for color.
- **stone_block / ashlar_rough** (t=1): 16px blocks, beveled edges, fine noise, occasional cracks
- **stone_block mossy** (t=2): same as above + moss factor increasing with Y position, green tint in grout
- **wood / planks** (t=3,15): 10px planks, wood grain sine waves, knots as dark spots, groove lines
- **ashlar / ashlar_grand** (t=4,12): 32px huge blocks, subtle dome, hairline cracks, light gray stone
- **cave** (t=5,14): 24px irregular voronoi-ish, sine/cosine noise for organic rock, crystal facets variant adds sharp planes
- **plaster** (t=6): 16px blocks with crack patterns (sine-based fracture lines), off-white with dirt gradient
- **pillar** (t=7): 64px fluted column, 8 flutes via sine, capital/base decorative bands
- **arch / arch_stairs** (t=8): descending stair illusion — arch frame border at full height, inner 5 steps recessed deeper each level, side jambs, moss streak center, riser lip highlights
- **metal_trim / bars** (t=9): brick pattern base + vertical iron bars every 12px as dark metallic strips
- **rubble** (t=11): 20px chaotic chunks, deep cracks, varied heights

Each material type has corresponding floor/ceiling variants (slab, cobble, rubble, dirt, mosaic, tile, vault, beams, etc.) with appropriate procedural patterns.

### Height → normal conversion
`heightToNormal(hL, hR, hU, hD, strength)` computes surface normal from height neighbors via cross product, strength scaled by materialProc config (editor-tunable).

### Emissive packing
Emissive strength packed into roughMetal texture B channel to stay within WebGL texture unit limits (16 max). Separate emissive atlas exists but not bound to shader in current version.

### Config-driven proc params
`materialProc` config section controls:
- `walls.heightScale`, `normalStrength`, `aoBoost`, `groutWidth`, `domeStrength`, `crackAmount`
- `floors.heightScale`, `normalStrength`, `aoBoost`, `microOffset`, `groutWidth`, `blockSize`
- `ceils.heightScale`, `normalStrength`, `aoBoost`

Editor tab "Textures" exposes these live. Changing them triggers `rebuildMaterials()` in renderer.

### Reconstruction Notes
Materials system is **the visual identity**. It's pure functions — input material definition JSON, output Uint8Array atlases. No WebGL dependency in generation (runs on CPU, uploads to GPU as textures). Task 5 should start with 2-3 simple materials (brick, stone, wood) and expand to full 16/10/8 set incrementally. The architectureShape field is forward-looking for future shape-aware generation but currently maps to type-based dispatch.

---

## 5. Renderer GPU (WebGL2 Raycaster)

**Files:** `render/renderer-gpu.js` (~952 lines orchestration), `render/shaders.js` (~1,347 lines GLSL), `render/gl-utils.js` (~80 lines), `render/palette.js` (~150 lines), `render/map-upload.js` (~120 lines), `render/character-billboard.js` (~280 lines), `render/sprite-gpu.js` (~200 lines), `render/sprite-atlas.js` (~180 lines), `render/character-sheet.js` (~60 lines)

### TL;DR
WebGL2 screen-space raymarcher rendering grid dungeon in first-person via fullscreen quad fragment shader. No polygon geometry — DDA grid walk per pixel sampling PBR material atlases. 3-pass pipeline: raycast (PBR lighting + POM + shadows) to intermediate buffer, quantize post-pass (palette banding toggle), character billboards (CPU 2D canvas default or GPU sprite shader). Doom-authentic fixed-point emulation and palette quantization toggleable via config.

### Rationale
- **Why raymarcher not rasterizer:** Doom-authentic rendering requires per-pixel raycasting for column-based style with palette quantization and fixed-point artifacts. Polygon rasterization would need geometry generation losing authentic artifacts. Raymarcher naturally produces correct visual style.
- **Why WebGL2 not WebGL1:** Need texelFetch for integer grid sampling, better precision for raymarch, potential MRT. WebGL1 lacks integer texture fetch critical for grid raycasting.
- **Why 3-pass pipeline:** Separation enables toggling palette quantization independently without shader recompile. Character billboards need depth buffer from raycast pass for occlusion testing. Extensible for future post effects.
- **Why per-pixel not per-column:** Original Doom per-column for 1993 CPU efficiency. WebGL fragment shader runs per-pixel naturally via GPU parallelism — no efficiency gain from columns, per-pixel smoother while still emulating fixed-point artifacts via explicit truncation when authentic mode enabled.
- **Why CPU sprite default:** CPU 2D canvas path simpler to debug (per-pixel PBR in JS visible in debugger). GPU sprite shader exists as optimization toggled via G key but CPU default ensures reliability across GPU/driver variations.
- **Why palette quantization as post-pass:** Allows toggling authentic mode without recompiling main shader. Keeps main shader focused on raycasting+lighting. Clean separation of concerns.

### Technical Deep Dive

**GPURenderer class public API:** (no polygon geometry). Doom-style column renderer adapted to WebGL2 with modern PBR lighting, POM parallax, and palette quantization post-process.

### Architecture

**Three-pass pipeline:**
1. **Raycast pass** — fullscreen quad fragment shader marches rays per pixel through grid map, samples material atlases, computes PBR lighting
2. **Quantize pass** — optional palette + colormap banding for Doom-authentic look (toggleable)
3. **Character billboard pass** — 2D canvas overlay OR WebGL sprite shader renders NPCs with depth occlusion and torch-projected shadows

**Main shader (`fsRaycastSrc` in shaders.js):**
- Ray DDA grid walk per fragment (like Doom column renderer but per-pixel not per-column for WebGL efficiency)
- For each wall hit: sample wall atlas at computed UV, apply POM offset based on view angle and height map
- Floor/ceiling: perspective-correct UV mapping with POM
- Lighting: ambient + sun directional + up to 8 point lights (torches) with distance attenuation and flicker
- Shadow: simple raymarch shadow test toward each light (configurable strength)
- PBR: sample normal map, roughness/metal maps, compute Cook-Torrance-ish specular
- Fog: exponential squared fog based on distance
- Deco: bitmask drives additional geometry (columns as wall thickening, etc.)

**Palette system (`palette.js`):**
- Procedurally generate 256-color VGA 6×6×6 cube palette approximating Doom tones
- 32-level colormap precomputed by scaling RGB values
- Quantize pass maps truecolor render target through palette lookup based on distance light level
- Toggle "authentic mode" switches between smooth truecolor and palette banding

**Fixed-point emulation:**
- Texture coordinates computed with `floor(u * 64 * 65536) >> 16` pattern to emulate Doom's fixed-point truncation artifacts (column seam shimmer, floor swim)
- Toggleable via authentic flag

**POM (Parallax Occlusion Mapping):**
- Raymarch into height map along view direction to offset UV coordinates
- Strengths configurable per surface: wall 0.06, floor 0.07, ceiling 0.035 (defaults)
- Creates visible brick extrusion and pavement depth at grazing angles

**Live config integration:**
Renderer exposes setters called from `core/game.js` on config change:
- `setAuthentic(bool)`, `setPaletteStyle(str)`, `setBandLevels(n)`, `setTextureFilter(str)`, `setSpriteMode('cpu'|'gpu')`, `rebuildMaterials()`, `resize(w,h)`

**Character rendering:**
Two paths:
- **CPU mode (default):** 2D canvas overlay (`character-billboard.js`) — per-pixel PBR lighting computed on CPU, depth-tested against renderer's depth buffer, torch-projected silhouette shadows drawn to floor
- **GPU mode:** WebGL sprite shader (`sprite-gpu.js`) — PBR billboard shader with same lighting model as walls, toggled via G key or editor

**Sprite atlas system:**
- `sprite-atlas.js` loads PNG sprite sheets + normal + ORM + roughMetal maps
- `character-sheet.js` defines frame layout for idle animation (64 frames south + 64 frames north)
- Precomputed PBR maps from `tools/sprite-pbr/generate_pbr.py` (converts diffuse PNG to normal/height/ORM via image processing)

### Reconstruction Notes
Renderer is the **largest single module** (~950 lines) because raymarch renderers are inherently monolithic — the fragment shader does most work. Task 3 should build a minimal WebGL2 raycaster first: just walls as solid colors, no materials, no POM, no palette. Then Task 5 adds materials+POM, Task 6 adds lighting+particles, Task 8 adds character billboards. Incremental complexity is essential — jumping straight to full PBR raycaster is overwhelming for an agent task.

---

## 6. Entities & Player Controller

**Files:** `entities/player.js` (~200 lines), `entities/characters.js` (~150 lines), `entities/sprite-entity.js` (~50 lines base class), `systems/input.js` (~120 lines)

### TL;DR
First-person controller supporting dual modes: Doom-style free float movement (continuous position/angle, WASD+mouse) and optional grid snap mode (tile-to-tile lerp, discrete turns) toggleable at runtime. Slide collision against grid walls with 0.28 tile radius. Quake-style view bob with 5 tunable parameters and 4 presets. Player emits configurable warm light with dual-sine breathing flicker. Character system manages NPC billboard sprites with directional facing logic (north/south variants based on player relative angle).

### Rationale
- **Why dual-mode (free + grid snap):** Prototype hedges between modern FPS feel (free float, smooth) and classic dungeon crawler feel (tile-step, deliberate). Grid mode toggle allows designer/player choice without code change. Unclear from prototype which is intended default — config has `gridMode: true` but free mode feels more natural for real-time gameplay.
- **Why slide collision not stop-on-collide:** Wolfenstein 3D / Doom corridor navigation feel — moving diagonally into wall corner should slide along wall surface rather than stopping dead. More fluid in tight 1-tile corridors. Achieved via axis-separated collision checks.
- **Why 0.28 tile radius:** Fits through 1-tile-wide corridors with 0.44 units clearance (1.0 - 2×0.28). Tight enough to feel constrained in corridors, generous enough to not frustrate. Tuned empirically — smaller feels floaty, larger gets stuck frequently.
- **Why Quake-style 5-parameter view bob not simple sine:** Quake introduced multi-axis bob (vertical bounce + lateral sway + roll tilt) creating figure-8 camera path for immersion. Exposing all 5 parameters allows tuning from heavy armor clunk (slow, tall vertical, minimal roll) to light rogue nimbleness (fast, wide sway, pronounced roll) without code change. Presets documented in retro-findings.md provide starting points.
- **Why player emits light:** Dungeon crawler fantasy expectation — adventurer carries torch or has magical aura. Ensures player never completely blind even in unlit areas far from placed torches. Breathing flicker (dual sine at different frequencies) adds organic life preventing static flat look. `noShadow=true` flag is optimization — player light doesn't cast shadows in shader to save raymarch cost (player is always at camera origin, self-shadowing not visible anyway).
- **Why pointer lock for mouse look:** Standard FPS control scheme. Browser Pointer Lock API captures mouse movement deltas even when cursor hits screen edge, essential for continuous turning. Fallback QE keys for keyboard-only or when pointer lock unavailable/denied.
- **Why character facing based on player angle not AI:** Prototype has no enemy AI — debug NPC simply orients to face player (or show back) for sprite direction testing. Shows idle_n sprite when player behind character (character facing away from player), idle_s when player in front (character facing player). Simple dot product or angle quadrant check sufficient, no pathfinding needed at prototype stage.

### Technical Deep Dive

**Player class structure (`entities/player.js` ~200 lines):**
```js
class Player {
  constructor(x, y, angle) {
    // World state
    this.x = x;                    // world X in tile units (float, continuous)
    this.y = y;                    // world Y in tile units
    this.z = 0.5;                  // eye height above floor in world units (constant unless crouch added)
    this.angle = angle;            // radians, 0 = east (+X), PI/2 = south (+Y), PI = west, -PI/2 = north (-Y). Default spawn facing -PI/2 (north).

    // Velocity state for physics integration (free mode)
    this.vx = 0; this.vy = 0;      // velocity components, units/sec
    this.onGround = true;          // always true in prototype (no jumping/falling)

    // View bob state
    this.bobPhase = 0;             // 0..2PI, advances with movement
    this.bobAmpY = 0.025;          // vertical amplitude in world units (~5 pixels at 320px height when projected)
    this.bobAmpX = 0.015;          // horizontal sway amplitude (~3 pixels)
    this.bobAmpRoll = 0.6 * Math.PI/180;  // roll in radians (~0.01047 rad)
    this.bobFreq = 9.0;            // Hz at full movement speed
    this.bobSpeedScale = 1.0;      // multiplier on bob speed ramp
    this.viewBobEnabled = true;    // master toggle

    // Grid mode state
    this.gridMode = true;          // toggleable — unclear if intended default
    this.gridTargetX = x;          // lerp target X in grid mode
    this.gridTargetY = y;          // lerp target Y
    this.gridTargetAngle = angle;  // lerp target angle (snapped to cardinal directions)
    this.gridMoveSpeed = 5.0;      // lerp rate for position (units/sec toward target)
    this.gridTurnSpeed = 6.5;      // lerp rate for angle (radians/sec)
    this.gridHoldInitialDelay = 0.18;  // seconds before key repeat starts when holding move key
    this.gridHoldRepeatDelay = 0.06;   // seconds between repeats once repeating
    this._gridHoldTimer = 0;       // internal repeat timer state
    this._gridHoldActive = false;  // whether currently in repeat phase
  }

  setPos(x, y, angle) {
    // Teleport to absolute position — used on dungeon regen to move player to new start
    this.x = this.gridTargetX = x;
    this.y = this.gridTargetY = y;
    this.angle = this.gridTargetAngle = angle;
    this.vx = this.vy = 0;
    this.bobPhase = 0;
  }

  setBobParams({ampY, ampX, ampRoll, freq, speedScale}) {
    // Update bob parameters from config — called on boot and on live config change
    if (ampY !== undefined) this.bobAmpY = ampY;
    if (ampX !== undefined) this.bobAmpX = ampX;
    if (ampRoll !== undefined) this.bobAmpRoll = ampRoll;  // already in radians from caller
    if (freq !== undefined) this.bobFreq = freq;
    if (speedScale !== undefined) this.bobSpeedScale = speedScale;
  }

  setViewBobEnabled(bool) { this.viewBobEnabled = !!bool; }
  setGridMode(bool) { this.gridMode = !!bool; /* snap current pos to nearest tile center on toggle? */ }

  update(dt, inputState, map) {
    // inputState = {forward: -1..1, strafe: -1..1, turn: -1..1, mouseDeltaX, mouseDeltaY}
    // dt = delta time in seconds, clamped to max 0.05 in game loop to prevent large jumps on frame drops

    if (this.gridMode) {
      // GRID MODE: discrete tile movement with lerp animation
      // Handle key repeat timing for held keys:
      //   On key press edge → immediate step to adjacent tile in pressed direction
      //   Start hold timer at gridHoldInitialDelay
      //   When timer expires → enter repeat phase, step again, reset timer to gridHoldRepeatDelay
      //   Continue repeating while key held
      //   On key release → exit repeat phase
      // This gives responsive single-step on tap, plus smooth repeat on hold.

      // Determine intended move direction from inputState.forward/strafe
      // Map to cardinal tile offset (prioritize forward over strafe if both pressed, or combine diagonally if allowed)
      // Check target tile walkable via map collision check
      // If walkable and not already moving (at target), set new gridTargetX/Y

      // Lerp current position toward grid target:
      const dx = this.gridTargetX - this.x;
      const dy = this.gridTargetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        const move = Math.min(dist, this.gridMoveSpeed * dt);
        this.x += (dx / dist) * move;
        this.y += (dy / dist) * move;
      } else {
        this.x = this.gridTargetX;
        this.y = this.gridTargetY;
      }

      // Lerp angle toward grid target angle (snapped to 0, PI/2, PI, -PI/2 for N/E/S/W):
      let angleDiff = this.gridTargetAngle - this.angle;
      // Normalize to -PI..PI shortest path:
      while (angleDiff > Math.PI) angleDiff -= 2*Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2*Math.PI;
      const maxTurn = this.gridTurnSpeed * dt;
      if (Math.abs(angleDiff) > 0.001) {
        this.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurn);
      }

      // Update bob based on lerp progress speed (not raw input, since grid mode has no continuous velocity)
      const lerpSpeed = dist > 0.001 ? this.gridMoveSpeed : 0;
      this._updateBob(dt, lerpSpeed);

    } else {
      // FREE MODE: continuous physics-style movement
      // Compute movement vector in world space:
      const moveSpeed = /* from config player.moveSpeed, default 3.0 units/sec */;
      const strafeSpeed = /* from config player.strafeSpeed, default 2.8 */;
      const forwardMove = inputState.forward * moveSpeed * dt;
      const strafeMove = inputState.strafe * strafeSpeed * dt;

      // Rotate movement vector by player angle to get world-space delta:
      const dx = Math.cos(this.angle) * forwardMove - Math.sin(this.angle) * strafeMove;
      const dy = Math.sin(this.angle) * forwardMove + Math.cos(this.angle) * strafeMove;

      // Attempted new position:
      const newX = this.x + dx;
      const newY = this.y + dy;

      // Slide collision resolution (axis-separated):
      const radius = /* from config player.radius, default 0.28 */;
      const canMoveFull = !checkCollision(newX, newY, map, radius);
      if (canMoveFull) {
        this.x = newX; this.y = newY;   // full move succeeds
      } else {
        // Try X slide only (slide along Y wall):
        const canSlideX = !checkCollision(newX, this.y, map, radius);
        if (canSlideX) this.x = newX;
        // Try Y slide only (slide along X wall):
        const canSlideY = !checkCollision(this.x, newY, map, radius);
        if (canSlideY) this.y = newY;
        // If both blocked, no movement (corner case — player stopped by wall corner)
      }

      // Apply turn input + mouse look:
      const turnSpeed = /* from config player.turnSpeedKeyboard, default 2.2 rad/sec */;
      const mouseSensitivity = /* from config player.mouseSensitivity, default 0.0022 rad/pixel */;
      this.angle += inputState.turn * turnSpeed * dt;           // keyboard QE turn
      this.angle += inputState.mouseDeltaX * mouseSensitivity;  // mouse look (pointer lock deltas)
      // Note: mouseDeltaY ignored in prototype (no pitch/vertical look — classic Doom style horizontal only)

      // Update bob based on actual movement speed magnitude:
      const speed = Math.hypot(dx, dy) / dt;  // units per second actual speed after collision
      this._updateBob(dt, speed);
    }
  }

  _updateBob(dt, speed) {
    if (!this.viewBobEnabled) return;
    // Bob phase advances proportional to speed:
    const speedFactor = Math.min(1, speed / 3.0);  // normalize to 0..1 where 3.0 units/sec = full speed
    const phaseDelta = this.bobFreq * 2 * Math.PI * dt * speedFactor * this.bobSpeedScale;
    this.bobPhase = (this.bobPhase + phaseDelta) % (2 * Math.PI);
    // Bob offsets computed on demand in getViewMatrix(), not stored
  }

  getViewMatrix() {
    // Returns camera transform for renderer, including bob offsets applied to camera position/orientation.
    // Bob pattern is figure-8: vertical sine at base frequency, horizontal sine at 2x frequency for figure-8 path.
    const speedFactor = /* derived from recent movement, 0..1 */;
    const bobY = this.viewBobEnabled ? Math.sin(this.bobPhase) * this.bobAmpY * speedFactor : 0;
    const bobX = this.viewBobEnabled ? Math.sin(this.bobPhase * 2) * this.bobAmpX * speedFactor : 0;
    // Strafe lean couples bob roll to lateral movement for additional immersion:
    const strafeLean = /* from input strafe intent, maybe ±0.2 radians max */;
    const bobRoll = this.viewBobEnabled ? (Math.sin(this.bobPhase + strafeLean) * this.bobAmpRoll * speedFactor) : 0;

    // Camera position = player position + bob offsets in camera-local space rotated to world:
    // Right vector = (cos(angle+PI/2), sin(angle+PI/2)) = (-sin(angle), cos(angle))
    // Up vector = world Z axis (0,0,1) for vertical bob
    // Apply bobX along right vector, bobY along up (Z), bobRoll as camera roll angle around view axis
    // Return transform matrix or components for renderer to use in ray direction calculation
  }

  getLightSource(time) {
    // Returns player light definition for renderer uniform upload each frame.
    // Config driven from player.light section.
    const cfg = /* getPlayerConfig().light */;
    if (!cfg?.enabled) return null;

    // Breathing flicker via dual sine waves at different frequencies for organic non-repeating pattern:
    const breathe1 = Math.sin(time * (cfg.breatheSpeed ?? 0.35)) * (cfg.breatheAmount ?? 0.12);
    const breathe2 = Math.sin(time * (cfg.breatheSpeed2 ?? 0.11)) * (cfg.breatheAmount2 ?? 0.06);
    const breathe = breathe1 + breathe2;  // combined in range roughly -0.18..+0.18
    const intensity = (cfg.intensity ?? 1.8) * (1 + breathe);

    return {
      x: this.x,
      y: this.y,
      z: (cfg.height ?? 0.45),  // light source height above floor in world units
      color: cfg.color ?? {r:1, g:0.9, b:0.7},  // warm torch-like default
      intensity,
      radius: cfg.radius ?? 4.5,
      noShadow: cfg.noShadow ?? true,  // optimization: player light doesn't cast shadows
    };
  }
}
```

**Collision detection algorithm (`checkCollision` helper, likely in player.js or util):**
```js
function checkCollision(x, y, map, radius = 0.28) {
  // Check 3x3 neighborhood around player position (radius < 0.5 tiles, so at most 1 tile beyond center in each direction needs checking)
  const minCellX = Math.floor(x - radius);
  const maxCellX = Math.floor(x + radius);
  const minCellY = Math.floor(y - radius);
  const maxCellY = Math.floor(y + radius);

  for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      // Bounds check — treat out of bounds as solid wall
      if (cellX < 0 || cellY < 0 || cellX >= map.w || cellY >= map.h) return true;

      const cellIdx = cellY * map.w + cellX;
      const cellValue = map.grid[cellIdx];  // 0 = floor/walkable, >0 = wall material ID = solid

      if (cellValue > 0) {
        // Wall cell — check circle vs AABB collision:
        // Find closest point on cell's axis-aligned bounding box to circle center
        const closestX = Math.max(cellX, Math.min(x, cellX + 1));
        const closestY = Math.max(cellY, Math.min(y, cellY + 1));
        const distX = x - closestX;
        const distY = y - closestY;
        const distSq = distX * distX + distY * distY;

        if (distSq < radius * radius) {
          return true;  // collision detected
        }
      }
    }
  }
  return false;  // no collision, position is clear
}
```
This is standard circle-vs-AABB collision, efficient for grid-based worlds. The 3×3 neighborhood check limits to at most 9 cells per collision test.

**Slide collision resolution — why axis-separated works:**
When moving diagonally into a wall corner, full diagonal move is blocked. Trying X-only first allows sliding along Y-axis wall (preserving X momentum component). If X slide also blocked, trying Y-only allows sliding along X-axis wall. Order matters subtly — prototype tries X then Y, meaning X slide preferred when both possible (rare edge case, mostly indistinguishable in practice). True slide along wall surface normal would require vector projection, but axis-separated is simpler and feels good enough for grid-aligned walls.

**Input system detail (`systems/input.js` ~120 lines):**
```js
class Input {
  constructor(canvas) {
    this.pressed = new Set();        // currently held keys by code string
    this.mouseDeltaX = 0;            // accumulated since last update()
    this.mouseDeltaY = 0;
    this.pointerLocked = false;

    // Canvas click → request pointer lock for mouse look
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });

    // Pointer lock state tracking
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = (document.pointerLockElement === canvas);
    });

    // Mouse movement accumulation (only when locked)
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX || 0;
        this.mouseDeltaY += e.movementY || 0;  // collected but ignored by player (no pitch)
      }
    });

    // Keyboard state tracking
    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.code);
      // Prevent default for game keys to avoid browser scrolling etc.
      if (['KeyW','KeyA','KeyS','KeyD','Space','KeyQ','KeyE'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.pressed.delete(e.code);
    });

    // Prevent context menu on right click (common FPS expectation, though prototype may not use right click)
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  update(dt, player, map) {
    // Map pressed keys to movement intents in range -1..1:
    const forward = (this.pressed.has('KeyW') ? 1 : 0) - (this.pressed.has('KeyS') ? 1 : 0);
    const strafe  = (this.pressed.has('KeyD') ? 1 : 0) - (this.pressed.has('KeyA') ? 1 : 0);
    const turn    = (this.pressed.has('KeyE') ? 1 : 0) - (this.pressed.has('KeyQ') ? 1 : 0);
    // Note: W+S cancel to 0, A+D cancel to 0, Q+E cancel to 0 — no diagonal speed boost beyond sqrt(2) from vector normalization in player update (if implemented — prototype may allow slight diagonal speed boost, common oversight)

    const inputState = {
      forward, strafe, turn,
      mouseDeltaX: this.mouseDeltaX,
      mouseDeltaY: this.mouseDeltaY,
    };

    // Clear mouse accumulator for next frame:
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Delegate to player:
    player.update(dt, inputState, map);
  }
}
```

**Key bindings reference (from `core/game.js` _onKeyDown handler):**
| Key | Action | Context |
|-----|--------|---------|
| W/A/S/D | Move forward/left/back/right | Held, continuous in free mode; tap for grid step in grid mode |
| Mouse move | Turn view left/right | When pointer locked (click canvas to lock) |
| Q / E | Turn left/right (keyboard fallback) | Held, continuous at turnSpeedKeyboard rate |
| R | Regenerate dungeon | Instant, new random seed, rebuilds world |
| L | Next level | Increments levelIndex, same seed, deeper theme zones |
| K | Previous level | Decrements levelIndex |
| N | Respawn debug NPC | Spawns character next to player position |
| O | Cycle shadow debug | 0=normal → 1=red disc → 2=red silhouette → back to 0 |
| G | Toggle sprite mode | CPU ↔ GPU billboard rendering path, saves to config |

**Character system detail (`entities/characters.js` ~150 lines):**
```js
class CharacterManager {
  constructor() {
    this.chars = [];        // array of character objects
    this._nextId = 1;
  }

  spawnDebugNPC(map, player) {
    // Find valid spawn position near player:
    // Try positions in expanding ring around player start (radius 1..3 tiles)
    // For each candidate angle around circle, check if floor cell and not in wall via map grid
    // Pick first valid or fallback to player position offset
    const angle = Math.random() * Math.PI * 2;  // random direction around player
    const dist = 2.0 + Math.random();            // 2-3 tiles away
    let x = player.x + Math.cos(angle) * dist;
    let y = player.y + Math.sin(angle) * dist;
    // Clamp to map bounds and snap to nearest walkable floor cell...

    const char = {
      id: this._nextId++,
      x, y,
      z: 0.5,                    // feet at floor level + half height for billboard center
      spriteId: 'female_mage_leather',  // references sprite registry entry
      facing: 0,                 // 0=N, 1=E, 2=S, 3=W — updated each frame based on player angle
      frame: 0,                  // animation frame index 0..63 for idle loop
      animTime: 0,               // accumulated time for animation progression
      radius: 0.3,               // for potential future collision/selection
      height: 1.0,               // billboard height in world units
    };
    this.chars.push(char);
    return char;
  }

  update(dt, player) {
    for (const c of this.chars) {
      // Advance animation:
      c.animTime += dt;
      const fps = 12;  // idle animation frame rate
      c.frame = Math.floor(c.animTime * fps) % 64;  // 64-frame loop = ~5.33 second cycle

      // Determine facing based on angle from character to player:
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const angleToPlayer = Math.atan2(dy, dx);  // radians, 0=east
      // Map to 4 cardinal facings (could expand to 8-directional with more sprite sheets):
      // Facing convention: 0=N (-PI/2), 1=E (0), 2=S (PI/2), 3=W (PI or -PI)
      // Choose facing that best represents character orientation toward or away from player.
      // Prototype logic: show idle_n (north/back view) when player is behind character,
      // show idle_s (south/front view) when player in front. Simplified to 2 facings for now.
      // With full 4-directional sprites, would compute quadrant.

      // Simplified 2-facing version used in prototype:
      // If player mostly behind character (dot product of character forward vs to-player vector negative),
      // show back sprite (idle_n). Else show front sprite (idle_s).
      // Character forward direction assumed south (facing 2) by default for debug NPC,
      // or could rotate to always face player (billboard always faces camera — then facing is moot,
      // but sprite sheet has directional variants for when we want non-billboard fixed orientation).

      // Actual prototype implementation likely always uses billboard facing camera,
      // and selects north vs south sprite sheet based on whether camera is in front of or behind
      // character's nominal facing direction. Simplified for debug purposes.

      // For now, just set facing based on quadrant for future expansion:
      const normalizedAngle = (angleToPlayer + Math.PI*2) % (Math.PI*2);
      if (normalizedAngle >= Math.PI*7/4 || normalizedAngle < Math.PI/4) c.facing = 1;        // E
      else if (normalizedAngle < Math.PI*3/4) c.facing = 2;   // S
      else if (normalizedAngle < Math.PI*5/4) c.facing = 3;   // W
      else c.facing = 0;                                      // N
    }
  }

  getAll() { return this.chars; }
}
```

**Sprite entity base (`entities/sprite-entity.js` ~50 lines):**
Likely defines base class or factory for billboard sprite entities with common properties (position xyz, spriteId string referencing registry, facing direction enum, animation frame index, animation time accumulator, radius for interaction, height for billboard scale). CharacterManager creates objects conforming to this structure. May include helper methods for distance checks, visibility tests, or animation frame advancement logic shared across entity types.

### Reconstruction Notes
Task 4 implements player controller. Recommended incremental approach:
1. **Phase 4a — Basic free movement:** WASD movement with slide collision against simple grid (no config integration yet, hardcoded speeds). Mouse look via pointer lock API. No view bob, no grid mode, no player light. Acceptance: can walk around empty test map, turn with mouse, collide with walls naturally.
2. **Phase 4b — Config integration:** Wire speeds, sensitivity, radius to config getters. Add live update on config change.
3. **Phase 4c — View bob:** Implement 5-parameter bob with figure-8 pattern. Start with Quake default preset hardcoded, add editor controls later in Task 7.
4. **Phase 4d — Grid mode (optional stretch):** Add toggle and lerp-based grid snap movement as alternative. Can defer to later task or omit if free movement suffices.
5. **Phase 4e — Player light:** Add getLightSource() returning config-driven light definition with breathing flicker math. Renderer integration happens in Task 6 when lighting system exists — for now just define the API.

Character system deferred entirely to Task 8 (characters-sprites). Task 4 focuses purely on player controller and input mapping.

---

## 7. Lighting & Particles

**Files:** `systems/lights.js` (~180 lines), `systems/particles.js` (~150 lines), `world/items.js` (~120 lines), `world/scene.js` (~100 lines Torch/Scene classes)

### TL;DR
Atmospheric torch lighting system with 6 configurable light types, organic flicker via dual sine waves with per-light phase offsets, and CPU particle simulation for flame/smoke effects. Torch placement integrated into dungeon generation with configurable density and corridor bias. Max 8 active lights (WebGL uniform limit). All parameters driven by config — light colors, intensities, flicker speeds, particle behavior fully editable via editor.

### Rationale
- **Why 6 light types not just point lights:** Different dungeon elements need distinct lighting character — torches flicker organically, wall sconces cast directional spots, candles have fast nervous flicker, crystals pulse rhythmically, emissive surfaces (glowing crystal veins, shrine mosaics) provide steady fill without shadow cost, ambient fill lights soften dark corners. Type system allows material-driven light assignment (e.g., crystal_vein_rock material spawns pulse_crystal light type automatically).
- **Why dual sine flicker not random noise:** Sum of two sine waves at incommensurate frequencies (e.g., 6.5 Hz + 2.3 Hz) creates organic non-repeating variation that looks natural — mimics real flame turbulence better than pure random which looks jittery and artificial. Per-light phase offset ensures torches don't flicker in sync (which would look obviously procedural).
- **Why CPU particle simulation not GPU compute:** WebGL2 has no compute shader support (only WebGL 2 Compute extension which has limited browser support). CPU simulation for ~50-100 particles per frame is trivial cost (<0.1ms). Particles spawned as glowing screen-space quads via main raycast shader's particle spawn path — no separate particle rendering pass needed in current implementation (though particle shader program scaffold exists for future expansion).
- **Why max 8 lights:** WebGL uniform array size limit — shader declares `uniform vec3 u_lightPos[12]` actually (MAX_LIGHTS=12 in shaders.js but prototype uses 8 active). Each light requires ~10 uniforms (position vec3, color vec3, intensity float, radius float, type int, direction vec3, cone angles, pulse params, shadow flag) = ~15 floats per light × 8 lights = 120 floats, well within typical uniform limits (~1024 vec4s = 4096 floats). Could increase to 12 but 8 sufficient for dungeon scale (torches spaced ~3.5 tiles apart, player rarely sees more than 4-5 simultaneously due to walls occluding).
- **Why torch placement during generation not fixed:** Procedural dungeons need procedural lighting — fixed torch positions wouldn't adapt to generated room layouts. Placement algorithm biases toward corridor junctions (high-traffic decision points need visibility) and room entrances (dramatic reveal), with minimum distance constraint preventing torch clustering.
- **Why separate sun directional + ambient + point lights:** Three-tier lighting model matches PBR standard — ambient provides base visibility preventing pure black shadows, sun gives directional character and shadow direction consistency (even underground, represents faint light shafts or magical ambient directionality), point lights provide local atmosphere and gameplay-relevant illumination (torches mark paths, create pools of safety in darkness).

### Technical Deep Dive

**LightManager class (`systems/lights.js` ~180 lines):**
```js
class LightManager {
  constructor() {
    this.lights = [];           // array of runtime light objects
    this.sunDir = {x:-0.55, y:-0.45, z:-0.7};  // default from config
    this.sunIntensity = 1.5;
    this.sunColor = {r:1, g:1, b:1};
    this.ambient = 0.36;
    this.ambientColor = {r:1, g:1, b:1};
    this.worldAmbientMul = 0.38;
    this.fog = {base:0.18, squared:0.025};
  }

  setFromMap(map) {
    // Convert map.lights array (from dungeon generator output) to runtime light objects.
    // Map lights come from generateDungeonItems() during dungeon generation.
    // Each map light has: x, y, z, typeId (references lightTypes config), color override optional.
    // Look up light type definition from config.getLightTypesConfig():
    //   type definition contains: baseIntensity, baseRadius, flickerSpeed, flickerAmount,
    //   pulseSpeed, pulseAmount, coneInner/Outer (for spots), castShadows bool, default color.
    // Create runtime light with:
    //   position from map (x,y,z in world tile units, z ~0.7 for wall-mounted torch height)
    //   color = map override or type default or random pick from torchColors config array
    //   intensity = type baseIntensity * config lights.lightIntensityMultiplier (global scalar)
    //   radius = type baseRadius
    //   type enum mapped from type string to int (0=point,1=spot,2=flicker,3=pulse,4=emissive,5=ambient,6=steady)
    //   phaseOffset = Math.random() * PI*2  for flicker desynchronization
    //   direction vector for spot lights (points away from wall toward room center, computed from nearest wall normal)
    //   cone angles converted to cosine values for shader dot product test
    // Store in this.lights array, truncated to MAX_LIGHTS closest to player each frame during upload to shader.
  }

  update(dt, time, playerPos) {
    // Called each frame from game loop before render.
    // For each light, compute current flicker/pulse modulation based on type:
    //
    // Type 0 point / 6 steady: no modulation, intensity = baseIntensity (constant)
    //
    // Type 1 spot: same as point but with cone direction test in shader (no CPU modulation needed)
    //
    // Type 2 flicker (candle-like fast nervous flicker):
    //   flicker = sin(time * flickerSpeed + phaseOffset) * flickerAmount
    //           + sin(time * flickerSpeed * 2.3 + phaseOffset * 1.7) * flickerAmount * 0.5
    //   // Dual sine at incommensurate frequencies for organic variation
    //   intensity = baseIntensity * (1 + flicker)
    //   // flickerAmount typically 0.28 for candles (28% variation), 0.15 for torches
    //
    // Type 3 pulse (crystal rhythmic glow):
    //   pulse = sin(time * pulseSpeed + phaseOffset) * 0.5 + 0.5  // 0..1 range, not -1..1
    //   intensity = baseIntensity * (0.6 + pulse * pulseAmount)
    //   // pulseAmount typically 0.4 → intensity oscillates between 60% and 100% of base
    //   // Creates smooth breathing glow unlike flicker's nervous jitter
    //
    // Type 4 emissive (steady glow surface, no shadow):
    //   intensity = baseIntensity (constant, no flicker)
    //   flagged noShadow=true so shader skips shadow raymarch for performance
    //
    // Type 5 ambient fill:
    //   intensity = baseIntensity (constant)
    //   large radius (14.0 default), low intensity (1.2), no shadow, cool color tint
    //   Used to softly illuminate large chambers without harsh point light falloff
    //
    // After computing modulated intensities, sort lights by distance to player
    // and select closest MAX_LIGHTS (8) for upload to shader uniforms.
    // Further lights beyond 8 are culled (not rendered) — acceptable since attenuation
    // makes distant lights negligible contribution anyway.
  }

  getActiveLights(playerPos) {
    // Returns array of up to 8 light objects sorted by distance to player,
    // each with computed current intensity after flicker/pulse modulation.
    // Called by renderer each frame to upload to shader uniforms.
  }

  getSunConfig() {
    // Returns {dir:{x,y,z}, intensity, color:{r,g,b}} from live config
    // via getLightsConfig() getter — picks up editor changes live.
  }

  getAmbientConfig() {
    // Returns {level, color, worldMul} for ambient term in shader.
  }

  getFogConfig() {
    // Returns {base, squared} for exponential squared fog equation in shader:
    // fogFactor = exp(-fogBase * distance - fogSq * distance²)
  }
}
```

**6 light type definitions from config (lightTypes array):**
| ID | Name | Type | Base Intensity | Radius | Flicker Speed | Flicker Amt | Shadows | Color | Use Case |
|----|------|------|---------------|--------|--------------|-------------|---------|-------|----------|
| point_torch | Torch Point | point | 4.0 | 10.0 | 6.5 | 0.15 | yes | warm orange [1,0.62,0.28] | Standard wall torch |
| spot_wall | Wall Spot | spot | 3.2 | 8.5 | — | — | yes | warm [1,0.7,0.4] | Directional sconce highlighting wall art |
| flicker_candle | Candle Flicker | flicker | 2.4 | 6.0 | 9.0 | 0.28 | yes | warm [1,0.55,0.22] | Small nervous flame, altar candles |
| pulse_crystal | Pulse Crystal | pulse | 3.8 | 9.0 | — | — | no | cool blue [0.4,0.7,1.0] | Crystal vein glow, magical source |
| emissive_proxy | Emissive Surface | emissive | 2.0 | 5.5 | — | — | no | warm [0.8,0.6,0.3] | Glowing material surface proxy light |
| ambient_fill | Ambient Fill | ambient | 1.2 | 14.0 | — | — | no | cool [0.7,0.7,0.85] | Large chamber soft fill |

Pulse type uses pulseSpeed 2.2 and pulseAmount 0.4 from config (not shown in table but in light type definition).

**ParticleSystem class (`systems/particles.js` ~150 lines):**
```js
class ParticleSystem {
  constructor() {
    this.emitters = [];      // array of ParticleEmitter objects
    this.particles = [];     // flat array of active Particle objects across all emitters
    this._pool = [];         // object pool for particle reuse to avoid GC pressure
  }

  addEmitter(emitter) { /* add to emitters array */ }
  clear() { /* remove all emitters and particles, return particles to pool */ }

  update(dt, time) {
    // For each emitter, possibly spawn new particles based on emitter rate and time
    // For each active particle:
    //   age += dt
    //   if age >= life → remove particle (return to pool), continue
    //   Update position: p.x += p.vx * dt;  p.y += p.vy * dt;  p.z += p.vz * dt;
    //   Apply forces:
    //     Gravity: p.vz -= 0.8 * dt  (downward acceleration, world units/sec²)
    //     Drag: p.vx *= (1 - drag*dt); similarly vy, vz  (air resistance slowing)
    //     Buoyancy for flame particles: upward force counteracting gravity partially
    //   Update alpha fade: p.alpha = 1 - (age / life)  with optional ease curve
    //     Could use smoothstep or quadratic ease for more natural fade
    //   Update size: maybe grow slightly then shrink, or constant
    //   Update color shift: flame particles shift from white-yellow core to orange to red to transparent as they age
  }

  getAllParticles() {
    // Return array of active particles for renderer to spawn as glowing quads.
    // Each particle as {x,y,z, size, color:[r,g,b], alpha, age, life}
  }
}

class ParticleEmitter {
  constructor({x, y, z, rate, particleConfig}) {
    this.x = x; this.y = y; this.z = z;  // world position (attached to torch)
    this.rate = rate;                     // particles per second to spawn
    this.particleConfig = particleConfig; // template for spawned particles
    this._accum = 0;                      // fractional particle accumulator for sub-frame rates
  }

  // Called by ParticleSystem.update to spawn new particles this frame
  emit(dt, particlePool, outParticlesArray) {
    this._accum += this.rate * dt;
    while (this._accum >= 1) {
      this._accum -= 1;
      // Get particle from pool or create new:
      const p = particlePool.pop() || {};
      // Initialize from template with random variation:
      p.x = this.x + (Math.random()-0.5) * 0.1;  // small spawn jitter
      p.y = this.y + (Math.random()-0.5) * 0.1;
      p.z = this.z + (Math.random()-0.5) * 0.05;
      p.vx = (Math.random()-0.5) * 0.3;   // initial velocity spread
      p.vy = (Math.random()-0.5) * 0.3;
      p.vz = 0.4 + Math.random() * 0.3;   // upward initial velocity for flame rise
      p.size = 0.18 + Math.random() * 0.06;  // from items config flameSizeMin/Range
      p.color = [1.0, 0.6, 0.2];          // warm flame base, shifts with age in update
      p.alpha = 1.0;
      p.age = 0;
      p.life = 0.8 + Math.random() * 0.4; // seconds lifetime
      outParticlesArray.push(p);
    }
  }
}
```

**Torch placement algorithm (`world/items.js` `generateDungeonItems` ~120 lines):**
```js
function generateDungeonItems(rooms, grid, w, h, rng, startX, startY, floorHeight) {
  const cfg = getItemsConfig();  // from config: maxTorches, minTorchDist, etc.
  const maxTorches = cfg.maxTorches ?? 14;
  const minDist = cfg.minTorchDist ?? 3.5;
  const torchOffset = cfg.torchOffset ?? 0.35;  // distance from wall surface into room
  const corridorTargetFactor = cfg.corridorTargetFactor ?? 0.6;  // 60% of torches in corridors vs rooms
  const corridorTargetMin = cfg.corridorTargetMin ?? 2;

  const torchColors = getTorchColors();  // array of 4 color variants from config

  // Candidate positions: wall-adjacent floor cells throughout dungeon
  const candidates = [];
  for each floor cell in grid:
    // Check if adjacent to wall (at least one orthogonal neighbor is wall):
    const wallNeighbors = count of orthogonal adjacent cells where grid > 0
    if wallNeighbors > 0:
      // Determine wall normal direction (vector from wall into floor space):
      // Average of vectors to adjacent wall cells, normalized
      // Torch position offset from wall into room by torchOffset distance along normal
      // Compute candidate score based on:
      //   - Corridor bonus: if cell is corridor floor (not inside room per isRoomCell), multiply score by corridor bias
      //   - Junction bonus: if 3+ adjacent floor cells (corridor intersection), higher score
      //   - Room entrance bonus: if on room perimeter near doorway (transition from room to corridor)
      //   - Distance from start penalty: very close to start position gets reduced score (don't waste torches at spawn)
      // Add to candidates array with {x, y, score, wallNormal}

  // Sort candidates by score descending
  // Greedily select torches ensuring minimum distance constraint:
  const selected = [];
  for candidate in sorted order:
    if selected.length >= maxTorches: break;
    // Check distance to all already selected torches:
    let tooClose = false;
    for s in selected:
      if distance(candidate, s) < minDist: tooClose = true; break;
    if !tooClose: selected.push(candidate);

  // Ensure minimum corridor torches met (corridorTargetMin):
  // If corridor torches < minimum, boost corridor candidates and re-run selection,
  // or force-add highest-scoring corridor candidates ignoring minDist slightly.

  // Create torch objects with light and emitter attachments:
  const items = [];   // torch item objects for game logic (position, interaction?)
  const lights = [];  // light definitions for LightManager
  for each selected position:
    const colorVariant = torchColors[Math.floor(rng() * torchColors.length)];
    const torchZ = floorHeight[cellY * w + cellX] + 0.72;  // sits on floor surface + height offset from items config zBase
    // Add jitter to Z via config zJitter for natural variation

    items.push({
      type: 'torch',
      x: pos.x, y: pos.y, z: torchZ,
      color: colorVariant.color,
      // ... maybe flicker params override per torch for variety
    });

    lights.push({
      x: pos.x, y: pos.y, z: torchZ,
      typeId: 'point_torch',  // references lightTypes config
      color: colorVariant.color,
      // intensity/radius from light type definition, not overridden per torch (could add variation)
    });

    // Particle emitter will be created in Scene class wrapping these torch items,
    // attaching ParticleEmitter at torch position with rate ~8 particles/sec,
    // particle config for flame rise behavior (upward velocity, warm color shift over lifetime, fade out).

  return { items, lights };
}
```

**Scene class integration (`world/scene.js`):**
- Wraps raw map output from generator into scene graph objects
- `Scene` owns array of `Torch` objects, each wrapping a torch item from map with additional runtime state
- `Torch` class likely has: position, color, light reference ID, array of particle emitters (maybe 1 flame emitter + 1 smoke emitter per torch with different particle configs)
- `scene.getTorches()` returns torch array for game loop to attach emitters to ParticleSystem
- `scene.toLegacyMap()` converts back to flat map format expected by renderer (for backward compatibility with older renderer interface expecting simple grid arrays rather than scene graph)

**Flame atlas generation detail:**
Procedural 128×32 RGBA texture with 4 frames of 32×32 flame sprites arranged horizontally. Per frame generation algorithm:
```js
for frame f in 0..3:
  offsetX = f * 32
  for y in 0..31, x in 0..31:
    cx = 16, cy = 24  // flame base near bottom center of sprite
    dx = (x - cx) / 12, dy = (y - cy) / 18  // normalized with vertical stretch 1.3x
    dist = hypot(dx, dy * 1.3)
    wobble = sin((x + f*7)*0.3)*0.15 + sin((y + f*5)*0.4)*0.1  // frame-dependent wobble
    shape = max(0, 1 - dist + wobble * (1 - abs(dy)) - max(0, (cy - y)/28)*0.4)
    // shape = distance field with wobble perturbation and top taper (flame narrows toward top)
    alpha = pow(shape, 1.2)  // power curve for soft falloff
    if alpha < 0.02: transparent pixel; continue
    // Color ramp by shape value (distance from center = temperature):
    if shape > 0.78: r=255,g=245,b=190      // white-hot core
    else if shape > 0.55: r=255,g=200,b=70 // yellow body
    else if shape > 0.32: r=255,g=130,b=20 // orange mid
    else: r=200,g=50,b=10                   // red outer edge
    flick = 0.85 + f * 0.05  // slight brightness variation per frame for animation
    r,g,b *= flick
    setPixel(flameAtlas, offsetX+x, y, r,g,b, alpha*255)
```
Results in 4-frame looping flame animation when sampled with frame index cycling based on time.

**Shader integration — how lights reach GPU:**
Each frame in game loop, before `gpuRenderer.render()` call:
1. `lightManager.update(dt, elapsedTime, playerPos)` computes current flicker/pulse modulation for all lights
2. `lightManager.getActiveLights(playerPos)` returns up to 8 closest lights sorted by distance
3. Game loop passes lights to renderer (or renderer pulls via getter — architecture unclear but likely renderer queries LightManager or receives lights as parameter via Game orchestration)
4. Renderer uploads to shader uniforms:
```js
gl.uniform1i(raycastProgram.u_numLights, activeLights.length);
for i in 0..activeLights.length-1:
  gl.uniform3f(raycastProgram.u_lightPos[i], light.x, light.y, light.z);
  gl.uniform3f(raycastProgram.u_lightColor[i], light.color.r, light.color.g, light.color.b);
  gl.uniform1f(raycastProgram.u_lightIntensity[i], light.intensity);  // already modulated
  gl.uniform1f(raycastProgram.u_lightRadius[i], light.radius);
  gl.uniform1i(raycastProgram.u_lightType[i], light.typeEnum);
  // ... spot direction, cone angles, pulse params, shadow flag
```
5. Shader computes per-fragment lighting contribution from each light in main raycast loop.

**Performance considerations:**
- 8 lights × shadow raymarch per light per fragment = potentially expensive. Prototype likely uses optimized shadow test (fewer steps than primary raycast, early exit on hit) or limits shadow-casting lights to subset (torch = yes shadow, ambient fill = no shadow, emissive proxy = no shadow).
- Particle count kept low (~50-100 active max across all torches) to maintain 60fps on integrated graphics.
- Flame atlas sampled in shader for particle rendering — 4 frames cycled via time-based frame index uniform or vertex attribute.

### Reconstruction Notes
Task 6 implements lighting and particles incrementally:
- **Phase 6a — Basic point lights:** Hardcode 2 point lights at fixed positions near spawn. Add light uniforms to shader, compute simple diffuse attenuation (no shadows, no flicker, no PBR specular yet — just N dot L * attenuation). Verify lights appear in rendered scene.
- **Phase 6b — LightManager class:** Move hardcoded lights into LightManager with setFromMap() stub returning fixed lights. Add config integration for ambient/sun/fog parameters.
- **Phase 6c — Torch placement integration:** Wire generateDungeonItems() from Task 2 generator output to create actual torch lights at generated positions. LightManager converts map lights to runtime.
- **Phase 6d — Flicker types:** Implement flicker/pulse modulation in LightManager.update() with dual sine waves. Add light type definitions to config schema. Verify organic flicker visible in game.
- **Phase 6e — Shadows:** Add shadow raymarch in shader for point lights (configurable strength, early exit optimization). Start with hard shadows, optionally add softening later.
- **Phase 6f — Particles:** Implement ParticleSystem class with CPU update loop. Add flame atlas generation. Integrate particle spawn path in renderer (start with simple colored quads, no atlas sampling, then add flame texture).
- **Phase 6g — Palette quantization:** Add quantize post-pass shader for Doom-authentic banding toggle. Requires palette.js color table generation and RGB→palette lookup texture.

---

## 8. RPG Trinity Layer (Specified But Not Wired)

**Files:** `rpg/classes.js` (~160 lines), `rpg/boons.js` (~200 lines estimated), `rpg/equipment.js` (~180 lines estimated), `rpg/run.js` (~390 lines)

### TL;DR
Roguelike run structure with holy trinity gameplay roles (Tank/Healer/DPS) across 8 distinct classes with fixed ability kits. 5-floor progression with boon selection at stairs between floors, instanced chest loot (no competition between players), camp phase for healing/rerolling/buying, and downed/rez mechanics. Fully specified as pure data structures and rules logic (~600 lines total) but **not connected to renderer or game loop** in prototype — exists as standalone module with no integration into visual gameplay. Serves as design specification for Task 9 implementation.

### Rationale
- **Why holy trinity as roles not locked player counts:** Classic MMO trinity (Tank controls aggro and mitigation, Healer manages health and positioning, DPS executes mechanics and damage) creates interdependent gameplay where each role has distinct, irreplaceable function. Making them roles rather than enforcing 1-1-2 composition allows flexible party sizes (1-4 players) with difficulty scaling — system supports 0-2 tanks, 0-2 healers, rest DPS, adjusting enemy stats accordingly. Preserves trinity fantasy without rigid party requirements.
- **Why 8 classes not 3:** Two variants per role provide gameplay variety while maintaining role identity. Ironclad (static doorway blocker) vs Juggernaut (mobile displacer) both tank but play differently. Luminant (single-target LoS healer) vs Warden (zone/area healer) both heal but demand different positioning. Four DPS variants cover melee flank, ranged trap, AoE mage, and deploy/trap archetypes. Fixed kits per class (no talent trees) keep scope manageable for agent implementation — each class is ~40 lines of ability definitions, not complex skill tree logic.
- **Why fixed kits with boon transforms not talent trees:** Fixed Q/E/R/Ult buttons per class means UI never changes — boons transform what existing buttons do rather than adding new buttons or UI elements. Simplifies implementation dramatically: boon is just a function hook modifying ability behavior, no dynamic UI generation needed. "Boons transform verbs, never add buttons" is explicit design constraint in classes.js comments.
- **Why no +10% stat stick rewards:** Design philosophy — every reward must change gameplay verbs meaningfully, not just increment numbers. Boon example: "Bulwark now taunts enemies in area on plant" changes Bulwark from pure defensive ability to defensive+aggro tool, altering tactical usage. Equipment example: weapon that makes Fireball leave burning ground changes Fireball from burst to zone control. This creates memorable build-defining moments rather than invisible stat inflation.
- **Why instanced chest loot:** 4-player co-op with shared chests traditionally creates loot competition and friction ("who gets the legendary?"). Instanced loot means each player sees different equipment tailored to their class when opening same chest — no competition, no drama, everyone gets meaningful upgrade. Chest tracks `openedBy` Set per player ID, so each player opens independently.
- **Why 5-floor run structure:** Roguelike run length balancing — 5 floors × ~10 minutes per floor = ~50 minute run, substantial but completable in single session. Shorter than traditional roguelikes (20+ floors) to match "10-minute delves" pitch and lunch-break-friendly design goal. Each floor uses same dungeon generator with increasing levelIndex for deeper theme zones (floor 1 starts in Entrance zone, floor 5 reaches Abyss Shrine).
- **Why boon picks at stairs not during combat:** Creates natural pacing beat between floors — combat ends, tension releases, players make build decisions together at stairs before descending. Mirrors Hades / Slay the Spire reward structure where choices happen at safe transition points, not mid-combat. Allows social/cooperative decision discussion ("take the taunt Bulwark or the shield charge stun upgrade?").
- **Why camp phase between floors:** Healing to full between floors prevents death spiral where early mistakes compound across entire run (unfun). Reroll option (50 gold cost) gives agency over RNG — bad boon choices can be rerolled at meaningful cost creating gold management decisions. Buy random equipment (80 gold) provides alternative gold sink for players who like their boon choices. Shared gold pool encourages team discussion on spending priorities.
- **Why downed/rez not instant death:** Co-op friendliness — downed player enters 30-second crawl state where teammates can rescue by moving to same tile ("Swap Protocol" — likely body swap mechanic where rescuer takes downed player's position). Creates dramatic rescue moments and teamwork pressure without ending run on single mistake. Bleed-out after 30s if not rescued means consequences exist but aren't instant. Revive between floors at 30% HP if dead prevents permanent elimination mid-run.

### Technical Deep Dive

**Class definition schema (`rpg/classes.js` ~160 lines):**
```js
export const CLASS_ROLES = { TANK: 'tank', HEALER: 'healer', DPS: 'dps' };

export const CLASSES = {
  ironclad: {
    id: 'ironclad',
    name: 'Ironclad',
    role: CLASS_ROLES.TANK,
    hp: 150,                    // base hit points (tank highest)
    resource: 'stamina',        // resource type for ability costs (or flavor only in prototype)
    flavor: 'The doorway. You are the wall.',
    abilities: {
      Q: { id:'taunt_horn', name:'Taunt Horn', cd:8, range:3, aoe:'3x3',
           desc:'Force aggro 4s', hook:'onTaunt' },
      E: { id:'bulwark', name:'Bulwark', cd:12, duration:3,
           desc:'Plant, immovable, blocks 2-wide', hook:'onBulwark' },
      R: { id:'shield_charge', name:'Shield Charge', cd:10, range:3,
           desc:'Dash 3, stun first, knockback', hook:'onCharge' },
      ULT: { id:'bastion', name:'Bastion', cd:60, aoe:'5x5', duration:6,
             desc:'Fortress -40% dmg allies inside', hook:'onBastion' },
    },
    passive: { id:'body_block', name:'Body Block',
               desc:'Taunted enemies cannot pass through you or adjacent tiles' },
    tags: ['block', 'taunt', 'plant'],  // for boon matching / synergy detection
  },
  // ... 7 more classes with similar structure
};

export function getClass(id) { return CLASSES[id]; }
export function getClassesByRole(role) { return Object.values(CLASSES).filter(c => c.role === role); }
export function getAllClasses() { return Object.values(CLASSES); }

export const STARTER_CLASS_IDS = ['ironclad', 'luminant', 'cutthroat', 'sharpshooter'];
// 4 starter classes unlocked by default — 1 tank, 1 healer, 2 DPS covering melee and ranged

export const CLASS_UNLOCKS = {
  juggernaut: { desc:'Block 2000 damage as Ironclad in one run',
                check: (stats) => (stats.blocked||0) >= 2000 },
  warden: { desc:'Heal 1000 in one delve',
            check: (stats) => (stats.healed||0) >= 1000 },
  sparkcaster: { desc:'Interrupt 20 casts',
                 check: (stats) => (stats.interrupts||0) >= 20 },
  sapper: { desc:'Kill 30 enemies with traps/kegs',
            check: (stats) => (stats.trapKills||0) >= 30 },
};
// Unlock system tracks per-run stats and checks conditions at run end.
// Unlocked classes persist across runs (likely via localStorage, though persistence layer not shown in prototype files).
```

**8 classes in detail:**

*Tanks (high HP, aggro control, mitigation):*
- **Ironclad** (150 HP, stamina resource): The immovable object. Q Taunt Horn forces enemy aggro in 3×3 area for 4 seconds — classic tank taunt establishing threat. E Bulwark roots self in place for 3s becoming immovable and blocking 2-tile width — doorway control fantasy, body-blocking choke points. R Shield Charge dashes 3 tiles stunning first enemy hit and knocking back others — mobility + disruption. Ult Bastion creates 5×5 fortress zone reducing ally damage 40% for 6s — team defensive cooldown. Passive Body Block prevents taunted enemies passing through tank or adjacent tiles — enforces tank positioning importance for choke control.
- **Juggernaut** (130 HP, rage resource): The unstoppable force. Q Grapple Chain pulls single enemy 4 tiles to tank generating massive threat — repositioning tool bringing dangerous enemies to tank. E Seismic Slam knocks back + slows in 3×3 area and grants shield per enemy hit — AoE disruption with self-sustain scaling on enemy count. R Unstoppable sprints through enemies for 2s leaving blocking trail behind — repositioning + battlefield manipulation creating temporary walls. Ult Vortex Maw pulls all enemies within 4 tiles over 3 seconds — massive AoE gather for team follow-up. Passive Adrenal Plate converts damage taken below 40% HP into Rage resource and heals percentage of Rage spent — comeback mechanic rewarding aggressive play at low health.

*Healers (low HP, sustain, utility):*
- **Luminant** (80 HP, mana resource): The precise single-target healer where line-of-sight is core mechanic. Q Flash Heal restores 60 HP to single ally within 3 tiles after 1.5s cast time, requires clear LoS — positioning puzzle of maintaining sight lines around corners and through doorways while staying safe. E Beacon marks ally causing 30% of healing done to beacon target to spill to nearby allies — enables efficient group healing through single target focus. R Cleanse Ward places 1-tile ward lasting 5s that removes damage-over-time and poison effects from allies standing on it — utility for specific encounter mechanics. Ult Divine Plank fires line heal along 5-tile line restoring 100 HP to all allies hit, requires LoS — skillshot heal rewarding good positioning and prediction. Passive Critical Faith: healing ally below 30% HP grants instant heal plus 1 second invulnerability with 10s internal cooldown — emergency save rewarding attentive triage.
- **Warden** (85 HP, seeds resource): The zone/area healer who paints the battlefield green. Q Bloom Tile places flower on tile (2 charges, 6s cooldown per charge) creating 3×3 area healing 15 HP/sec to allies for 8 seconds — zone control healer placing healing areas proactively. E Vine Grasp roots single enemy within 3 tiles for 2.5s and spawns bloom flower on rooted tile — CC combined with healing zone creation. R Overgrowth places 2 temporary wall tiles lasting 4 seconds — battlefield manipulation creating cover or blocking enemy paths, synergizes with bloom placement behind walls. Ult Liferoot Canopy causes entire room to bloom for 8 seconds — massive area heal for clutch moments or boss phases. Passive Photosynthesis grants +40% healing power while standing on own bloom tiles — rewards healer positioning inside their own healing zones rather than hanging back.

*DPS — Damage dealers with distinct mechanical identities:*
- **Cutthroat** (90 HP, no resource shown — likely energy or cooldown-only): Melee flank assassin who exploits taunted enemies. Q Blink Stab teleports to position behind taunted enemy within 4 tiles — requires tank to establish aggro first, creating tank-DPS synergy loop. E Kidney Shot interrupts enemy cast, breaks 1 armor pip, stuns 1.5s if used from behind target — positional reward mechanic encouraging flanking play. R Smoke Tile creates 2×2 area of invisibility lasting 4s — stealth repositioning and escape tool. Ult Death Mark applies debuff to target for 5s causing +100% damage taken from entire team — coordinated burst window requiring team communication. Passive Opportunist grants +50% damage when attacking taunted enemy from flank/rear — core synergy with tank role, Cutthroat does mediocre damage alone but devastating damage with tank support.
- **Sharpshooter** (85 HP): Ranged DPS with trap utility and mobility. Q Piercing Shot fires line projectile up to 6 tiles hitting up to 2 enemies in line — positioning to line up multiple targets rewarded. E Frost Trap places trap triggering 3×3 root for 2 seconds when enemy steps on it — zone control and peel tool. R Grapple Hook pulls self to wall up to 4 tiles away — mobility for repositioning to high ground or escaping danger, also enables creative angles for Piercing Shot lineups. Ult Volley rains arrows over 4×4 area for 4 seconds — sustained AoE for add phases or area denial. Passive Hunter's Sight shows enemy intent arrow 0.5 seconds early — predictive information advantage allowing preemptive positioning or interrupt preparation.
- **Sparkcaster** (70 HP — squishiest class): Glass cannon AoE mage requiring tank protection to stand still and cast. Q Fireball launches explosive projectile up to 4 tiles detonating in 2×2 AoE — primary damage tool. E Frost Wall places 3-tile-long wall lasting 4 seconds — defensive peel and choke creation compensating for low HP fragility. R Mana Surge empowers next spell to double size and break 2 armor pips — setup ability creating burst windows, requires planning and cooldown management (15s CD). Ult Meteor calls down delayed AoE slam over 5×5 area with stun effect — high impact teamfight ultimate requiring setup time allowing counterplay. Passive Glass Cannon grants +30% damage after standing still for 2 seconds until moving again — rewards stationary positioning behind tank frontline, punishes kiting playstyle, creates risk/reward of planting feet for damage vs repositioning for safety.
- **Sapper** (95 HP — relatively tanky for DPS): Deployable/trap engineer who prepares battlefield before engagement. Q Powder Keg places explosive with 3-second fuse detonating in 3×3 AoE, or can be shot early to detonate on demand — setup/puzzle gameplay of placing kegs in enemy paths or choke points before pulling. E Turret Tile deploys automated turret firing 3 shots at nearest enemies — sustained DPS deployable rewarding good placement with line of sight to enemy approach paths. R Oil Slick covers 3×3 area slowing enemies — zone control slowing enemy advance into prepared kill zone. Ult Bunker creates 2×2 fortified cover structure with door allowing allies through but blocking enemies — defensive repositioning tool and safe casting platform for Sparkcaster etc. Passive Chain Reaction causes explosions to trigger other nearby explosives — combo potential placing keg near turret or multiple kegs in chain for massive burst when timed correctly.

**Boon system (`rpg/boons.js` ~200 lines estimated — exact structure inferred from usage in run.js):**
```js
export const BOONS = [
  // Example structure inferred:
  {
    id: 'bulwark_taunt',
    name: 'Resonating Bulwark',
    desc: 'Bulwark now taunts enemies in area on plant',
    classId: 'ironclad',    // null = generic available to all classes, or specific class ID
    hook: 'onBulwark',      // which ability/event this boon modifies
    transform: {            // data describing the transformation
      type: 'add_taunt',
      radius: 3,
      duration: 4,
      // ... parameters for the added effect
    },
    rarity: 'rare',         // possibly used for weighting in random selection
    tags: ['taunt', 'area'], // for synergy detection or filtering
  },
  // ... many more boons covering all 8 classes plus generics
];

export function getRandomBoons(count = 3, classId = null, excludeIds = []) {
  // Filter pool: exclude already owned boons, filter by class (class-specific OR generic)
  // Weight selection: 70% chance class-specific, 30% generic (or similar weighting)
  // Random pick without replacement from weighted pool
  // Return array of boon objects for player choice UI
}
```
Boon design philosophy from code comments: "Boons/Equipment transform verbs, never add buttons." This is critical architectural constraint — boon modifies existing Q/E/R/Ult abilities via hook system rather than granting new abilities requiring new UI elements or keybinds. Keeps UI static (always 4 ability buttons) while gameplay depth comes from how those 4 buttons behave differently based on boon combinations.

Hook system concept: each ability definition in class has `hook` string identifier (e.g., 'onBulwark'). When ability activated, game checks player.transforms[hook] array and applies each transform in sequence modifying ability parameters or adding secondary effects. Boon adds its transform object to appropriate hook array when picked. Equipment verbs work identically — equipment object has verb with type field used as hook key, pushed to transforms array on equip.

**Equipment system (`rpg/equipment.js` ~180 lines estimated):**
```js
export const EQUIPMENT = {
  weapons: [
    // Example structure inferred from usage:
    {
      id: 'flame_tongue_blade',
      name: 'Flame Tongue Blade',
      slot: 'weapon',
      classRestriction: null,  // or specific class IDs array
      verb: {
        type: 'onAttack',      // hook point (or onFireball for class-specific weapon, etc.)
        transform: { /* adds burning ground effect to attacks */ },
      },
      flavor: '...',
    },
    // ...
  ],
  armors: [ /* similar structure, slot:'armor' */ ],
  trinkets: [ /* slot:'trinket', max 2 equipped */ ],
};

export function getInstancedChestLoot() {
  // Returns {main: equipmentObject, bonus: equipmentObject|null} for single player
  // Random selection from equipment pools, possibly weighted by rarity
  // Called per player per chest to generate instanced (different per player) loot
}
```
Equipment slots: weapon (1 max), armor (1 max), trinkets (2 max). When equipping new item in occupied slot, replaces existing (old item presumably lost/destroyed — simple inventory model with no bag management complexity). Equipment verbs aggregate into same transforms system as boons — unified modification pipeline regardless of source (boon pick vs chest loot).

**RunManager class (`rpg/run.js` ~390 lines) — full API:**

```js
export class RunManager {
  constructor({ seed, playerClasses, maxFloors = 5 }) {
    this.seed = seed >>> 0;
    this.rng = makeRNG(this.seed);           // deterministic LCG same as dungeon generator
    this.maxFloors = maxFloors;              // default 5
    this.floor = 0;                          // 0 = not started, 1..maxFloors during run
    this.generator = new DungeonGenerator(); // reuses world generation system
    this.players = playerClasses.map((classId, idx) =>
      createPlayerRunState(`p${idx}`, classId, this.rng)
    );
    this.sharedGold = 0;                     // team resource pool for camp spending
    this.currentMap = null;                  // current floor dungeon map object
    this.chests = [];                        // Chest[] instances for current floor
    this.boonChoices = {};                   // playerId -> [boon,boon,boon] at stairs
    this.runOver = false;
    this.victory = false;
    this.floorHistory = [];                  // array of floor data for replay/summary
    this.bossDefeated = false;               // possibly tracks boss state on final floor
  }

  startRun() {
    // Initialize run state, set floor=1, clear flags/history, generate first floor
    this.floor = 1;
    this.runOver = false;
    this.victory = false;
    this.floorHistory = [];
    return this.generateFloor(this.floor);
  }

  generateFloor(floorNum) {
    // Deterministic floor seed derived from run seed:
    const floorSeed = (this.seed + floorNum * 1013904223) >>> 0;
    // Generate dungeon via existing generator with levelIndex for theme progression:
    const map = this.generator.generateLevel({
      w: 80, h: 80,
      seed: floorSeed,
      themeId: 'classic',
      levelIndex: floorNum - 1,    // 0-indexed for theme global depth mapping
      levelCount: this.maxFloors,
      roomTarget: 52,
      attempts: 260,
    });
    this.currentMap = map;

    // Place chests biased toward high-value rooms:
    // Filter rooms excluding entrance and stairs roles
    // Sort by role priority: treasure (0, highest) → armory/shrine (1) → secret (2) → hall/hub (3) → guardian (4) → corridor (5, lowest)
    // Take top N rooms where N = 6 for boss floor (floorNum === maxFloors), else 4 or 5 randomly
    // For each chosen room, pick random position inside room bounds (1 tile margin from walls)
    // Generate instanced loot per player via getInstancedChestLoot() — each player gets different equipment
    // Create Chest instance with id, position, and instancedLoot map {playerId -> {main, bonus}}

    // Reset player positions to map start, revive dead players at 30% HP for new floor attempt
    // Clear boon choices (repopulated at stairs, not at floor start)
    // Record floor data in history and return for UI display
  }

  reachStairs() {
    // Called when party reaches stairs tile on current floor
    // Generates boon choices per player:
    // For each player:
    //   Filter BOONS pool excluding already owned boon IDs
    //   Filter to class-specific boons (boon.classId === player.classId) OR generic (boon.classId === null)
    //   Shuffle class-specific and generic pools separately via RNG
    //   Pick up to 2 from class-specific pool, 1 from generic pool (70/30 split approximated)
    //   Fill remaining slots to reach 3 total from combined available pool if needed
    //   Store in this.boonChoices[playerId] = [boon, boon, boon]
    // Return boonChoices object mapping player IDs to choice arrays
  }

  pickBoon(playerId, boonId) {
    // Validate boonId in player's current choices, throw if invalid
    // Find player object, call applyBoonToPlayer(player, boon) to add to boons array and transforms
    // Clear player's boon choices (consumed)
    // Return picked boon object
  }

  openChest(playerId, chestId) {
    // Find chest by ID, check if already opened by this player (idempotent per player)
    // If not opened: mark openedBy Set add playerId, retrieve instanced loot for this player
    // Apply equipment to player via applyEquipmentToPlayer() for main and bonus slots
    // Return {chestId, playerId, loot:[...applied equipment...], fullyLooted: bool}
    // fullyLooted true when all players in run have opened this chest (for UI/completion tracking)
  }

  peekChestLoot(playerId, chestId) {
    // Preview what player would receive without opening (for UI hover tooltip maybe)
    // Returns instanced loot object without marking as opened or applying equipment
  }

  campHeal() {
    // Between-floor camp action: restore all players to full HP, or revive downed at 50% HP
    // Free action, no cost — basic sustain between floors
  }

  rerollBoons(playerId) {
    // Costs 50 shared gold. Regenerate 3 new boon choices for specified player,
    // excluding already owned AND already offered (to guarantee new options).
    // Deduct gold, update boonChoices[playerId], return new choices array.
    // Returns null if insufficient gold.
  }

  buyRandomEquipment(playerId) {
    // Costs 80 shared gold. Pick random equipment from combined weapons+armors+trinkets pool,
    // apply to player via applyEquipmentToPlayer (replaces existing in slot if occupied).
    // Deduct gold, return picked equipment object. Returns null if insufficient gold.
  }

  advanceFloor() {
    // Check if current floor >= maxFloors → set victory=true, runOver=true, return victory result
    // Else increment floor counter and generateFloor(new floor number)
    // Returns floor data for UI to display new dungeon
  }

  downPlayer(playerId) {
    // Mark player as downed (0 HP, downed flag true, 30s crawl timer started)
    // Called when player HP reaches 0 during combat (combat system not implemented in prototype)
  }

  tryRez(rezzerId, targetId) {
    // Attempt rescue: check rezzer and target exist, target is downed,
    // and rezzer.position matches target.position (same tile — "Swap Protocol" rescue mechanic)
    // If valid: clear downed flag, restore target HP to 25% of max, return true
    // Else return false
  }

  tick(dt) {
    // Per-frame or per-tick update (called from game loop):
    // Decrement downed timers for downed players → bleed out to dead (0 HP, not downed) when timer expires
    // Check wipe condition: if all players have HP <= 0 → set runOver=true, victory=false
  }

  getRunSummary() {
    // Returns serializable summary object for UI display or persistence:
    // {seed, floor, maxFloors, victory, runOver, players:[{id,classId,boons:[ids],equipment:{weapon:id,armor:id,trinkets:[ids]},transforms:[hook keys]}], sharedGold}
  }
}

function createPlayerRunState(playerId, classId, rng) {
  // Factory creating per-player run state object:
  // {id, classId, cls:classDefinitionObject, floor:0, hp:maxHp, maxHp, downed:false, downedTimer:0,
  //  boons:[], equipment:{weapon:null,armor:null,trinkets:[]}, transforms:{}, gold:0,
  //  position:{x:0,y:0}, facing:0, stats:{blocked:0,healed:0,interrupts:0,trapKills:0}}
  // Stats tracked for class unlock conditions at run end.
}

function applyBoonToPlayer(player, boon) {
  // Push boon to player.boons array
  // Add boon.transform to player.transforms[boon.hook] array (create array if first)
  // Also track in player.transforms._list for UI display of all owned boons
}

function applyEquipmentToPlayer(player, equip) {
  // Place equipment in appropriate slot (weapon/armor replace existing, trinket added up to 2 max then replaces oldest)
  // Add equipment verb to player.transforms[verb.type] array (same hook system as boons)
  // Returns true on success
}

class Chest {
  constructor(id, x, y, instancedLoot) {
    this.id = id;
    this.x = x; this.y = y;                    // grid position in dungeon
    this.openedBy = new Set();                 // player IDs who opened
    this.instancedLoot = instancedLoot;        // {playerId: {main:equip, bonus:equip|null}}
  }
  isOpenedBy(playerId) { return this.openedBy.has(playerId); }
  open(playerId) { /* mark opened, return loot or null if already opened */ }
  isFullyLooted(playerCount) { return this.openedBy.size >= playerCount; }
}
```

**Boon choice weighting algorithm detail (from `reachStairs` method):**
Per player at stairs, generate 3 boon options via:
1. Filter full BOONS array excluding already owned boon IDs (no duplicates within run)
2. Partition remaining into classSpecific (boon.classId === player.classId) and generic (boon.classId === null)
3. Shuffle each partition using run RNG for determinism (same seed → same shuffle order → reproducible choices)
4. Take up to 2 from shuffled class-specific list, 1 from shuffled generic list — approximates 67/33 split close to intended 70/30
5. If insufficient in either pool, fill remaining slots from combined available pool shuffled
6. Result always 3 choices (or fewer if pool exhausted near end of long run with many boons already owned, though with reasonable boon pool size this shouldn't happen in 5-floor run)

This weighting ensures class identity preserved (mostly class-specific boons reinforcing class fantasy) while allowing occasional generic boons for cross-class synergies or utility.

**Chest placement algorithm detail (from `generateFloor` method):**
1. Filter dungeon rooms excluding entrance and stairs roles (don't place chests at start or exit — breaks pacing)
2. Sort remaining candidate rooms by role priority ascending (lower number = higher priority):
   - treasure: 0 (explicit treasure rooms get chests first — narrative consistency)
   - armory: 1, shrine: 1 (special utility rooms second priority)
   - secret: 2 (hidden rooms reward exploration with chest)
   - hall: 3, hub: 3 (main path rooms medium priority)
   - guardian: 4 (boss-like encounter rooms lower priority — chest after fight maybe, or guarded chest concept)
   - corridor: 5 (lowest — corridors generally shouldn't have chests except maybe secret stashes)
3. Within same priority tier, randomize order via sort comparator using Math.random() (non-deterministic within tier, but acceptable since tier priority dominates)
4. Take top N rooms where N = 6 for boss floor (final floor more rewarding), else 4 or 5 randomly (50% chance each) for variety in chest density per floor
5. For each chosen room, pick random position inside room bounds with 1-tile margin from walls (so chest not flush against wall, accessible from all sides)
6. Generate instanced loot per player via `getInstancedChestLoot()` — likely random pick from equipment pools weighted by rarity, possibly filtered by player class for relevance (class-appropriate weapons favored)

**Why specification-complete but not wired matters for reconstruction:**
The RPG layer files exist and export functional classes/data, but nothing in `core/game.js` imports or instantiates RunManager. Game loop currently does debug free-roam with R-key manual dungeon regen, not structured floor progression. Wiring it in Task 9 means significant game loop refactoring: replacing free-roam update logic with RunManager state machine (floor → combat → stairs → boon pick → camp → next floor), adding UI screens for boon selection and camp actions, adding chest interaction detection (player position proximity to chest triggers open prompt), and integrating combat system (which doesn't exist yet — prototype has no enemies, no combat, just empty dungeon exploration).

### Reconstruction Notes
Task 9 is the culmination — wiring RPG layer into game loop. Recommended phased approach:
- **Phase 9a — RunManager integration shell:** Import RunManager in Game class, replace R-key regen with RunManager.startRun() → generateFloor(1). Display current floor number in HUD. No other gameplay changes yet — still free roam, just structured around RunManager state.
- **Phase 9b — Chest interaction:** Add chest entities to scene from RunManager chests array. Detect player proximity to chest → show "Press E to open" prompt → on E, call runManager.openChest() → apply equipment → update UI feedback. Visual chest model can be simple colored cube initially.
- **Phase 9c — Stairs and floor progression:** Detect player reaching stairs room position → trigger reachStairs() → show boon selection UI overlay with 3 choices per player (for single-player prototype, just show 3 choices for player 0). On pick → advance to camp screen or directly to next floor.
- **Phase 9d — Camp UI:** Between-floor screen showing Heal button (free), Reroll button (costs 50 gold, shows updated choices), Buy Equipment button (costs 80 gold, shows acquired item), Continue button to advance floor. Display shared gold pool and player boons/equipment summary.
- **Phase 9e — Victory/defeat screens:** On floor 5 completion → victory screen with run summary. On wipe (all players HP 0) → defeat screen. Both offer return to main menu / new run.
- **Phase 9f — Class selection:** At run start, show class pick UI (4 starter classes shown, locked classes grayed with unlock condition text). For single-player prototype, pick 1 class; multiplayer UI can come later or be simplified to single-player focus initially.
- **Combat system note:** Prototype RPG layer assumes combat exists (abilities have damage, cooldowns, ranges, AoE shapes) but no enemy AI or combat resolution implemented. Task 9 may need to stub combat as simplified placeholder (e.g., chests guarded by stationary damage zones, or enemies as simple HP pools that auto-attack when player nearby) to make abilities meaningful, OR defer full combat to future work beyond initial 10-task scope and focus Task 9 on run structure + progression UI with combat as stubbed future hook points.

---

## 9. UI / HUD

**Files:** `ui/ui.js` (~150 lines), `ui/shadow-debug.js` (~80 lines), `style.css` (~120 lines game styles)

### TL;DR
Minimal heads-up display: 160×160 minimap canvas showing top-down dungeon layout with player position/orientation and NPC markers, plus text stats overlay (FPS, seed, elapsed time, player coordinates). Shadow debug overlay toggled via O key cycles through 3 visualization modes for validating character shadow projection. No main menu, pause screen, or game-over UI in prototype — game starts immediately in generated dungeon on page load.

### Rationale
- **Why minimap not full 3D map:** Top-down 2D minimap is standard dungeon crawler convention dating to Wolfenstein 3D automap. Provides spatial awareness without breaking first-person immersion. 160×160 is small enough to not obstruct main view while readable at a glance. Canvas 2D API sufficient — no WebGL needed for simple grid rendering.
- **Why text stats overlay not graphical HUD:** Prototype prioritizes debug information over polished UI. FPS counter essential for performance monitoring during development (raycaster + PBR + particles pushes GPU). Seed display enables reproducing specific dungeons for bug reports ("seed 12345 has floating tile at x,y"). Time elapsed useful for pacing validation. Player position coordinates aid debugging collision and generation issues.
- **Why shadow debug overlay as separate modes not always-on:** Character shadow projection is subtle by design (dark, low opacity for realism). During development, need obvious visual validation that shadows project correctly onto floor geometry respecting height variations and wall occlusion. RED modes make projection unmistakable — bright red disc at character feet validates contact shadow position, bright red silhouette validates projection shape and direction. Normal mode (0) is intended final appearance — dark subtle shadows that enhance realism without drawing attention.
- **Why no menus in prototype:** Prototype is tech demo focused on rendering and generation systems, not complete game experience. Menus add significant UI state management complexity (main menu → game → pause → resume flow, input focus handling, button navigation) without contributing to core technical demonstration. Task 10 adds full game shell including menus as final polish layer.
- **Why orange NPC markers on minimap:** High contrast against typical dungeon colors (grays, browns, dark stone). Orange stands out without conflicting with player marker color (likely white or green). Facing line on marker shows NPC orientation at a glance — useful for debugging character facing logic.

### Technical Deep Dive

**UI class structure (`ui/ui.js` ~150 lines):**
```js
class UI {
  constructor() {
    // Get DOM references to HUD elements created in index.html:
    this.minimap = document.getElementById('minimap');     // 160x160 canvas element
    this.mctx = this.minimap?.getContext('2d');            // 2D rendering context for minimap
    this.fpsEl = document.getElementById('fps');           // span or div for FPS text
    this.seedEl = document.getElementById('seed');         // seed display element
    this.timeEl = document.getElementById('time');         // elapsed time element
    this.posEl = document.getElementById('pos');           // player position element (may not exist in prototype HTML, added dynamically or via stats div)
    // Possibly other stat elements...

    this._time = 0;  // accumulated elapsed time in seconds, updated each frame via setTime()
  }

  setTime(elapsedSeconds) {
    this._time = elapsedSeconds;
    if (this.timeEl) {
      // Format as MM:SS or with decimal for sub-minute precision
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = Math.floor(elapsedSeconds % 60);
      this.timeEl.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
    }
  }

  drawMinimap(map, player) {
    // Clear minimap canvas:
    const W = this.minimap.width;   // 160
    const H = this.minimap.height;  // 160
    this.mctx.clearRect(0, 0, W, H);
    // Optional: fill background dark
    this.mctx.fillStyle = '#111';
    this.mctx.fillRect(0, 0, W, H);

    // Compute scale to fit map within minimap canvas preserving aspect ratio:
    const scale = Math.min(W / map.w, H / map.h);
    // Compute offset to center map in canvas (letterbox if map not square):
    const offsetX = (W - map.w * scale) * 0.5;
    const offsetY = (H - map.h * scale) * 0.5;

    // Draw dungeon grid cells:
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const cellIdx = y * map.w + x;
        const cellValue = map.grid[cellIdx];  // 0=floor, >0=wall material ID
        const px = offsetX + x * scale;
        const py = offsetY + y * scale;
        const pw = Math.max(1, scale);  // at least 1 pixel wide even at small scale
        const ph = Math.max(1, scale);

        if (cellValue === 0) {
          // Floor cell — dark gray
          this.mctx.fillStyle = '#222';
        } else {
          // Wall cell — lighter gray, possibly tinted by material type for extra info
          // Prototype likely uses uniform wall color for simplicity, or slight variation by material ID
          const matId = cellValue;
          // Simple hash to color variation so different wall materials distinguishable on minimap:
          const hue = (matId * 37) % 60 + 200;  // bluish-gray range 200-260 hue
          const sat = 8;
          const light = 28 + (matId % 3) * 4;
          this.mctx.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
          // Or simpler: this.mctx.fillStyle = '#444'; for uniform walls
        }
        this.mctx.fillRect(px, py, pw, ph);
      }
    }

    // Draw player marker:
    const playerPx = offsetX + player.x * scale;
    const playerPy = offsetY + player.y * scale;
    // Player dot:
    this.mctx.fillStyle = '#0f0';  // bright green for visibility
    this.mctx.beginPath();
    this.mctx.arc(playerPx, playerPy, Math.max(2, scale * 0.6), 0, Math.PI * 2);
    this.mctx.fill();
    // Player facing direction line:
    const facingLen = scale * 1.2;  // line length in pixels
    const facingX = playerPx + Math.cos(player.angle) * facingLen;
    const facingY = playerPy + Math.sin(player.angle) * facingLen;
    this.mctx.strokeStyle = '#0f0';
    this.mctx.lineWidth = Math.max(1, scale * 0.25);
    this.mctx.beginPath();
    this.mctx.moveTo(playerPx, playerPy);
    this.mctx.lineTo(facingX, facingY);
    this.mctx.stroke();

    // Note: NPC markers drawn separately by Game._drawMinimapNPCs() after UI.drawMinimap()
    // to layer on top. That method accesses this.ui.mctx directly to draw orange dots.
  }

  updateStats(player) {
    // Update FPS — actually FPS updated separately in game loop via fps element directly,
    // this method may update player position display:
    if (this.posEl) {
      this.posEl.textContent = `x:${player.x.toFixed(1)} y:${player.y.toFixed(1)} a:${(player.angle*180/Math.PI).toFixed(0)}°`;
    }
    // Seed display updated on dungeon regen, not every frame (in Game.regen() method)
    // Time updated via setTime() each frame separately
  }
}
```

**Game loop integration — FPS counter (in `core/game.js` _loop method):**
```js
// FPS calculation done in game loop, not UI class:
this.fpsAcc += 1;  // increment frame counter each frame
if (now - this.fpsLast > 500) {  // update display every 500ms (twice per second)
  const fps = Math.round(this.fpsAcc * 1000 / (now - this.fpsLast));
  const fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.textContent = fps + ' fps';
  this.fpsAcc = 0;
  this.fpsLast = now;
}
```
Updates twice per second to avoid flickering from frame-to-frame variance while remaining responsive to performance changes. 500ms window smooths out spikes.

**NPC minimap overlay (`core/game.js` _drawMinimapNPCs method):**
```js
_drawMinimapNPCs() {
  try {
    const mini = document.getElementById('minimap');
    if (mini && this.ui.mctx) {
      const ctx = this.ui.mctx;
      const W = mini.width, H = mini.height;
      const scale = Math.min(W / this.map.w, H / this.map.h);
      const ox = (W - this.map.w * scale) / 2;
      const oy = (H - this.map.h * scale) / 2;
      for (const c of this.charManager.getAll()) {
        const cx = ox + c.x * scale;
        const cy = oy + c.y * scale;
        // Orange dot for NPC:
        ctx.fillStyle = '#fa0';  // bright orange
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, scale * 0.5), 0, Math.PI * 2);
        ctx.fill();
        // Facing direction line:
        // Map character facing enum (0=N,1=E,2=S,3=W) to angle in radians:
        const ang = c.facing === 0 ? -Math.PI/2 : c.facing === 1 ? 0 : c.facing === 2 ? Math.PI/2 : Math.PI;
        ctx.strokeStyle = '#fa0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * scale * 0.8, cy + Math.sin(ang) * scale * 0.8);
        ctx.stroke();
      }
    }
  } catch {}
}
```
Called after `ui.drawMinimap()` each frame to layer NPC markers on top of grid. Orange chosen for high contrast against green player marker and gray dungeon colors.

**Shadow debug overlay (`ui/shadow-debug.js` ~80 lines):**
Likely contains interactive debug visualization for character shadow projection system — possibly separate from the O-key cycle modes in main game. May render additional overlay canvas showing shadow rays, projection geometry, or ground intersection calculations for development debugging of the torch-projected silhouette algorithm. Press O cycles through modes defined in character shadow config debugMode field (0=normal dark subtle, 1=bright red disc at character footprint validating contact shadow position, 2=bright red silhouette projection validating shape and direction).

The O-key handler in `core/game.js`:
```js
if (e.code === 'KeyO') {
  const live = getConfigLive();
  if (live?.characters?.shadow) {
    const nxt = ((live.characters.shadow.debugMode | 0) + 1) % 3;
    live.characters.shadow.debugMode = nxt;
    const labels = [
      'OFF (normal shadows)',
      'RED disc at character footprint (data check)',
      'RED silhouette projection (floor+walls)'
    ];
    dlog(`[shadow debug] mode ${nxt} — ${labels[nxt]} (press O to cycle)`);
  }
}
```
Cycles 0→1→2→0. Mode stored in live config so persists until changed (not saved to localStorage unless user clicks Save in editor — debug mode is transient development aid, not intended as persistent setting).

**style.css game styles (~120 lines):**
- Dark theme matching dungeon aesthetic — likely black or very dark gray background (#0a0a0a or #111)
- Game container centered or full-viewport with flex layout
- `#game-gpu` canvas styled with pixelated rendering hint for crisp pixels when scaled: `image-rendering: pixelated; image-rendering: crisp-edges;`
- `#sprite-layer` canvas absolutely positioned over game-gpu canvas at same size for sprite overlay compositing via alpha blending
- Minimap canvas positioned top-right or top-left corner overlay with border
- Stats overlay text elements positioned with monospace font family for debug readout consistency
- Possibly CRT scanline overlay as CSS pseudo-element or separate div with repeating linear gradient for retro aesthetic (though CRT post-processing more likely intended as WebGL shader effect in Task 10, not CSS)

**index.html HUD structure:**
Likely contains div elements for stats positioned absolutely over game canvas:
```html
<div id="hud">
  <div id="stats">
    <span id="fps">-- fps</span>
    <span id="seed">seed: --</span>
    <span id="time">0:00</span>
    <!-- possibly position display added dynamically -->
  </div>
  <canvas id="minimap" width="160" height="160"></canvas>
</div>
```
Exact structure would need verification by reading index.html, but pattern is standard overlay HUD.

### Reconstruction Notes
Task 10 expands UI to full game shell, but incremental UI work happens throughout:
- **Task 1:** Basic HTML structure with placeholder text in canvas — no HUD needed yet since no game running.
- **Task 3:** Add FPS counter and basic stats overlay once renderer running — useful for performance monitoring during development.
- **Task 4:** Add player position to stats overlay for debugging movement and collision.
- **Task 8:** Add NPC markers to minimap once character system exists.
- **Task 9:** Add in-game UI for chest interaction prompts, boon selection screen at stairs, camp UI between floors, run summary overlay.
- **Task 10:** Full game shell — main menu (New Run, Continue?, Options, Credits), pause menu (Resume, Restart Floor, Abandon Run, Options, Quit to Menu), results screen (victory/defeat, run summary with floors cleared, boons collected, stats), options screen (graphics settings mirroring editor controls but in-game accessible), credits screen. CRT post-processing toggle as shader uniform or CSS overlay option. All menus as HTML overlay divs shown/hidden via CSS classes, navigable via keyboard (WASD/Enter/Escape) and mouse click.

---

## 10. Testing & Tooling

**Files:** `tests/_harness/verify.mjs` (~200 lines), `tests/_harness/goldens/` directory with committed hash files, `tools/sprite-pbr/generate_pyr.py`, `tools/sprite-pbr/HOST.bat`, plus ComfyUI workflow files in `tools/`

### TL;DR
Node-based regression harness performing 4 checks without browser environment: syntax validation via node --check, import graph resolution verification, determinism golden hash comparison for dungeon generation and palette output, and real ESM module loading test. Run via `node tests/_harness/verify.mjs` with optional `--update` to refresh goldens. Python PBR pipeline precomputes sprite normal/height/ORM maps offline from diffuse PNGs — no runtime PBR generation.

### Rationale
- **Why Node-based harness not browser test runner:** Browser test runners (Jest with jsdom, Playwright, Puppeteer) add heavy dependencies and complexity. Node can directly import ES modules (with .mjs extension or type:module in package.json) and verify syntax, imports, and deterministic pure functions without DOM or WebGL context. Catches 80% of common breakage (syntax errors, broken imports, logic changes affecting determinism) with zero browser overhead and near-instant execution.
- **Why 4 specific checks:** Each targets a common failure mode encountered during prototype development:
  1. Syntax check catches typos and parse errors immediately after edit without needing to open browser
  2. Import graph check catches renamed/moved files breaking imports, missing exports, circular dependency issues
  3. Determinism goldens catch silent drift in dungeon generation output or palette color tables — if hash changes unexpectedly, something in generation logic changed (intentionally or via bug)
  4. ESM load check verifies modules actually execute without runtime errors at import time (top-level code errors, missing dependencies that static analysis misses)
- **Why determinism goldens specifically:** Dungeon generator must produce identical output for same seed across code changes unless generation logic intentionally modified. Golden hashes act as regression sentinels — if dungeon hash changes after refactor that shouldn't affect generation, the refactor introduced a bug. Palette goldens similarly ensure color output stability.
- **Why Python PBR pipeline offline not runtime:** Converting diffuse sprite to normal/height/ORM maps requires image processing operations (Sobel edge detection for normals, luminance analysis for height, color segmentation for material properties) that are computationally expensive and would add significant startup delay if done at runtime in browser JavaScript. Precomputing once offline and shipping PNG assets is standard game industry practice. Python chosen for image processing ecosystem maturity (PIL/OpenCV/numpy readily available).
- **Why ComfyUI workflow files in tools/:** Prototype includes AI art generation pipeline for creating sprite assets via ComfyUI (Stable Diffusion based image generation with pose control, style transfer, etc.). Out of scope for game runtime — purely asset creation tooling. Included in repo for reproducibility of art assets but not needed for game to function (precomputed PNGs already in assets/sprites/).

### Technical Deep Dive

**Regression harness structure (`tests/_harness/verify.mjs` ~200 lines):**

Main entry point parses command line args for `--update` flag, then runs 4 checks sequentially, reporting pass/fail per check with colored console output, exiting with code 0 on all pass or 1 on any failure.

**Check 1 — Syntax validation:**
```js
// For each .js file in src/ recursively (excluding node_modules, output, etc.):
//   Run child_process spawnSync: node --check <filepath>
//   node --check parses file without executing, reporting syntax errors
//   Collect any files with non-zero exit code → syntax failures
//   Report count of files checked and list of failures if any
```
Catches: missing brackets, invalid syntax, top-level await in non-module context, import/export syntax errors, etc. Fast — typically <1 second for ~50 files.

**Check 2 — Import graph resolution:**
```js
// Parse each module file to extract import statements via regex or AST parser
// For each import specifier:
//   Resolve relative path against importing file's directory
//   Check if target file exists on disk
//   If target is .js file, parse it to extract exported names
//   Verify imported names exist in target's exports (for named imports)
//   Track dynamic imports separately (import() calls) — verify target exists but can't verify named exports statically
// Report unresolved imports and missing named exports
```
Catches: renamed files breaking imports, moved files with outdated relative paths, typos in import specifiers, importing non-exported names, missing file extensions in import paths (required in ES modules unlike Node CommonJS). Does not catch runtime-only dynamic import failures where path computed at runtime.

**Check 3 — Determinism goldens:**
```js
// Dungeon generation golden:
//   Import DungeonGenerator class from world/dungeon/generator.js
//   Instantiate with fixed seed (likely 12345 or similar canonical test seed)
//   Generate dungeon with fixed parameters (80x80, roomTarget 52, etc. matching defaults)
//   Serialize relevant output deterministically (probably grid array + floorHeight array + rooms metadata)
//   Compute hash (likely SHA-256 or simple checksum) of serialized output
//   Compare against committed golden hash in tests/_harness/goldens/dungeon-<params>.hash
//   If mismatch and --update flag set: write new hash to golden file and report updated
//   If mismatch without --update: report failure with expected vs actual hash

// Palette golden (similar pattern):
//   Import genPalette and genColormap from render/palette.js
//   Generate palette with 'doom' style and default parameters
//   Generate colormap with 32 levels
//   Hash palette RGB array + colormap array
//   Compare against committed golden
```
Catches: unintended changes to generation algorithm, hash function modifications affecting determinism, palette color math changes, floating point precision issues across environments (though Node JS should be consistent). Golden files committed to repo act as contract — intentional algorithm changes require explicit `--update` to acknowledge new expected output.

**Check 4 — Real ESM load:**
```js
// For each non-entry module file in src/ (excluding main.js, editor.js which expect DOM):
//   Dynamic import() the module in Node ESM context
//   Catch any errors during module evaluation (top-level code execution)
//   Report modules that fail to load
// Entry points detected by filename or by checking if module accesses DOM APIs at top level
// and skipped (expected to fail in Node without browser environment)
```
Catches: top-level code that throws (e.g., accessing window/document at import time without isBrowser guard), missing dependencies that static import graph check might miss (dynamic imports, side-effect imports), circular dependency runtime errors, initialization order issues.

**Running the harness:**
```bash
# From repo root or src parent directory:
node tests/_harness/verify.mjs              # check mode — verify against goldens, report pass/fail
node tests/_harness/verify.mjs --update     # update mode — refresh golden hashes to current output
# Exit code 0 = all checks pass, 1 = any check fails (suitable for CI integration)
```

**Sprite PBR pipeline detail (`tools/sprite-pbr/generate_pbr.py`):**
Python script converting diffuse sprite PNG to PBR material maps. Likely workflow:
1. Load diffuse PNG (e.g., `leather_idle_s.png` — south-facing idle animation frame sheet, 512×512 containing 8×8 grid of 64×64 frames = 64 frames total)
2. For each 64×64 frame cell in sheet, process independently:
   - **Normal map generation:** Apply Sobel edge detection filter to luminance channel to estimate surface gradient → convert gradient X/Y to normal vector XYZ → encode to RGB 0-255 range (normal map standard encoding: R = X*0.5+0.5, G = Y*0.5+0.5, B = Z*0.5+0.5). Strength multiplier applied (maybe 3.4 base from material system, though sprite PBR may use different scale).
   - **Height map generation:** Convert diffuse to grayscale luminance → invert or scale to approximate height (bright areas = raised, dark = recessed). May apply additional processing like ambient occlusion baking or curvature estimation.
   - **ORM map generation:** O = ambient occlusion estimated from height map curvature or dark areas in diffuse (cavities darker). R = roughness estimated from surface detail — smooth areas (low normal variation) get low roughness, detailed/noisy areas get high roughness. M = metalness — for leather armor sprite, mostly 0 (dielectric) with small spots at belt buckle set to high metalness (~0.85) based on color thresholding (brass/gold colored pixels detected via hue/saturation).
3. Special handling noted in config comments: "ORM now fixed: sleeves (linen #8a7d6e) forced metal 0, belt buckle tiny brass spots only" — suggests manual color-based masking or post-processing rules to correct automatic material classification errors.
4. Output separate PNG files: `_normal.png`, `_height.png`, `_orm.png`, `_roughmetal.png` (possibly ORM split into separate rough and metal channels for debugging, though ORM combined is standard PBR packing: R=AO, G=roughness, B=metalness).
5. Naming convention: input `leather_idle_s.png` → outputs `leather_idle_s_normal.png`, `leather_idle_s_orm.png`, etc. Same for north variant `leather_idle_n.png`.

**ComfyUI workflow files (`tools/` directory structure):**
- `HOST.bat` — likely starts ComfyUI server locally for AI image generation
- Workflow JSON files defining Stable Diffusion pipelines for sprite generation — probably include pose control via ControlNet (to generate consistent character poses across animation frames), style transfer to maintain pixel art aesthetic, background removal, upscaling, etc.
- Out of scope for game runtime — purely asset creation pipeline. Included for reproducibility but game functions fine with precomputed PNG assets already in `assets/sprites/` directory.

**Test file organization:**
```
tests/
  _harness/
    verify.mjs              # main test runner (~200 lines)
    goldens/                # committed expected output hashes
      dungeon-80x80-seed12345.hash   # example golden file name pattern
      palette-doom-32.hash
      # ... possibly more goldens for different parameter combinations
```

**Why no browser-based tests:** Prototype has no browser test runner setup (no Jest, no Playwright, no Cypress). Adding one would introduce npm dependencies conflicting with "zero dependencies" philosophy. Node harness covers static analysis needs sufficiently for prototype stage. Future full game might benefit from Playwright E2E tests for UI flows (menu navigation, in-game interactions) but out of scope for current prototype analysis.

### Reconstruction Notes
- **Task 1:** Include `tests/_harness/verify.mjs` skeleton from day 1 — even with minimal modules (just config.js and main.js initially), syntax and import checks provide immediate value catching basic errors during development.
- **Task 2:** Add dungeon generation golden check once generator produces deterministic output (even simple version). Start with one golden for default parameters at fixed seed.
- **Task 3:** Add palette golden check once palette.js exists with color generation.
- **Task 5:** Expand goldens if material atlas generation output format stabilizes (optional — material atlases are large binary Uint8Arrays, hashing them may be heavy but feasible).
- **Task 8:** Sprite PBR pipeline remains build-time tooling — document in README how to run `generate_pbr.py` if modifying sprites, but ship precomputed PNGs in repo so game runs without Python dependency. For reconstruction, can start with simple placeholder sprites (solid color rectangles) and add PBR maps later, or generate minimal PBR maps procedurally in JS at runtime for placeholders (simpler than Python pipeline dependency).

---

## 11. File Organization Patterns

**Files:** N/A — structural overview across entire src/ tree

### TL;DR
Clear grouping by subsystem concern with entry points at root and all other code in subsystem folders. No peer cross-imports except via config or well-defined APIs. Acyclic dependency structure with core/ orchestrator at top and config+util foundations at bottom proven to scale across ~50 modules and ~10K lines.

### Rationale
- **Why entry points at root:** index.html, main.js, editor.html, editor.js at src/ root makes project structure immediately obvious — entry points are first files seen when listing directory. Subsystem folders below contain implementation details.
- **Why grouping by concern not by layer:** Alternative grouping by technical layer scatters related code. Grouping by subsystem keeps related code co-located regardless of file type, improving discoverability during feature work.
- **Why no peer cross-imports:** Enforces modularity — subsystems communicate via config getters or via orchestrator (Game class). Prevents tangled dependency graph and circular imports.
- **Why barrel exports:** world/dungeon/index.js re-exports public API providing single import point instead of deep paths. Simplifies imports and allows internal refactoring without breaking consumers.

### Technical Deep Dive

**Directory structure with rationale per folder:**

```
src/
  main.js, index.html, editor.html, editor.js, style.css, editor.css  ← entry points at root
  config/          ← single source of truth
  core/            ← top-level orchestration (Game class)
  world/           ← generation + scene description
    dungeon/       ← generator, atlas registry, themes, index barrel
  render/          ← everything WebGL
  entities/        ← player, characters, sprite-entity
  systems/         ← input, lights, particles
  ui/              ← HUD, debug overlays
  rpg/             ← classes, boons, equipment, run (not wired)
  assets/          ← JSON definitions + sprite PNGs
  util/            ← debug logger
  editor/          ← editor UI with tabs/
```

**Entry points at root, everything else in subsystem folders.** This pattern should be preserved in reconstruction — it's clean and scales well.

---

## 12. Reconstruction Task Mapping

**Files:** N/A — planning overview document

### TL;DR
10-task incremental rebuild plan mapping prototype features to reconstruction tasks with clear acyclic dependencies. Each task self-contained building on previous ones. Task 1 foundation-engine establishes config backbone, Task 10 UI polish completes game shell. No circular dependencies confirmed.

### Rationale
- **Why 10 tasks not fewer/more:** 10 provides right granularity — each substantial enough to be meaningful feature increment (~500-1000 lines typical) while small enough for agent completion in reasonable session.
- **Why this specific order:** Follows dependency chain from foundation upward. Config before anything reading config, dungeon before renderer has something to render, renderer before player movement visible, materials enhance existing renderer, lighting enhances existing materials, etc.
- **Why editor grows incrementally:** Editor tabs correspond to subsystems — building tab before subsystem requires stubbing leading to drift. Building alongside ensures accuracy.
- **Why RPG near end:** RPG depends on nearly full stack for meaningful integration. Attempting earlier would require massive stubbing.

### Technical Deep Dive

**Task dependency graph and detailed mapping:**

Based on this analysis, here's how prototype features map to our 10-task plan:

| Task | Prototype Features Covered | Why This Order |
|------|---------------------------|----------------|
| 1 foundation-engine | config.js, index.html, editor.html shell, JSON asset structure, localStorage persistence | Backbone first — everything else depends on config |
| 2 dungeon-generator | world/dungeon/generator.js, world/map.js, world/items.js (torch placement) | Need a world to render before renderer makes sense |
| 3 renderer-gpu-core | render/ skeleton, shaders.js basic, gl-utils.js, palette.js, WebGL setup, column raycast minimal | Render the generated dungeon — walls/floors/ceilings as solid colors first |
| 4 player-controller | entities/player.js, systems/input.js, view bob params | Navigate the rendered world |
| 5 materials-pbr-system | world/materials.js full, assets JSON expanded, POM, procedural atlases | Rich visuals — depends on renderer existing |
| 6 lighting-particles | systems/lights.js, systems/particles.js, torch flicker, flame atlas | Atmosphere — depends on materials for PBR response |
| 7 editor-complete | editor/tabs/ full implementations for each subsystem | Editor grows alongside features it tunes |
| 8 characters-sprites | entities/characters.js, render character billboards, sprite atlas, shadow projection | NPCs in world — depends on renderer + materials |
| 9 rpg-trinity-loop | rpg/ classes, boons, equipment, run.js wired into game loop | Gameplay layer — depends on everything below |
| 10 ui-hud-polish | ui/ expanded, main menu, pause, results, CRT post | Final polish shell |

Each task builds on previous ones without circular dependencies. The prototype proves the architecture works — reconstruction just needs to follow the same patterns with cleaner task boundaries.
