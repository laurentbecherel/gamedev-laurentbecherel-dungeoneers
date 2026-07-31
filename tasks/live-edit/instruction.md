# Live-Edit System — Dungeoneers Task 7

> **Goal:** Unity-like live tuning: two Chrome tabs (Editor + Game) open side-by-side. Designer drags a slider in Editor (e.g. `lighting.flickerAmount`, `fog.base`, `chamfer.floorSize`, `materials-proc.walls.bevelStart`) → Game tab updates within 100-500ms **without** pressing Save + R. Save semantics preserve current workflow when Live Edit is OFF.

---

## 1. Problem & Intent

**Current workflow:**
1. `editor.html` → edit JSON via visual form → Save → PUT `/api/assets/<cat>/<name>`
2. Switch to `game.html` → press R (regen) or reload to see change. Slow iteration for roughness multipliers, chamfer darkening, torch color, flicker speed, fog squared, bevel depth, etc.

**Desired workflow (Unity experience but better):**
- Open `editor.html` left monitor, `game.html` right monitor.
- Enable `Live Edit` toggle in editor topbar.
- Tweak `sprites.json → torch_wall.lightProfile.flicker.amountMax 0.3 → 0.6` → game torch flicker instantly more violent.
- Tweak `materials-proc.json → walls.bevelDepth 0.22 → 0.40` → walls chamfer deepens after ~600ms atlas rebuild, no reload.
- Tweak `fog.json → base 0.06 → 0.18` → scene fog dense instantly.
- When happy, Save persists to disk (if Auto-Save ON, every tweak already did debounced PUT, so reload keeps it). Unlike Unity play-mode, changes survive restart.

**Player-facing:** No player-facing change — this is a **tooling / workflow** task. But final acceptance must prove game still loads, no regression, existing toggles 1-8, M, R work.

---

## 2. Design Goals & Non-Goals

**Goals:**
- Real-time cross-tab config propagation <500ms for Tier-1 uniforms, <1200ms for Tier-2 atlas rebuild.
- Architecture sustainable for long-term game dev (10+ tasks more configs).
- No new runtime deps (Node built-ins + browser native EventSource + BroadcastChannel).
- Backward compat: Live OFF = old Save+R workflow identical.
- Observable live status in both tabs.
- Testable via Playwright multi-page E2E.

**Non-Goals:**
- Multi-user collaboration / OT / CRDT. Last-write-wins OK for local dev.
- Full undo/redo history (future).
- WebSocket full duplex — SSE enough for one-way broadcast.
- Hot-reload of JS code itself (only JSON configs).
- Persisting live preview without Save to disk indefinitely — after browser close, unsaved preview lost unless Auto-Save ON.

---

## 3. Current System Deep Dive

### 3.1 Server (`src/server/server.js`)
- Vanilla Node `http` server, no Express.
- `GET /api/assets` → recursive walk `src/assets/**/*.json` → [{category, name, path, itemCount}]
- `GET /api/assets/<category>/<name>` → read file, JSON parse, return.
- `PUT /api/assets/<category>/<name>` → `JSON.stringify(data, null, 2)` write file, return {success:true}
- Safe checks: `safeCategory` splits by '/', each segment `/^[a-zA-Z0-9_-]+$/`, prevents path traversal via `path.normalize` startsWith ASSETS_DIR.
- No notification mechanism.

### 3.2 Config loader (`src/config/config.js`)
- `CONFIG_PATHS` mapping logical name → ordered candidate API paths (e.g. `'fog': ['config/lighting/fog', 'config/fog', 'config/main']` first wins).
- `_cache` (main), `_caches` (logical name → data), `_pathCache` (api path → data).
- `getConfig()` fetches `/api/assets/config/main`, clones.
- `_fetchConfig(logical)` loops candidates, fetch, cache.
- `getAllRenderConfigs()` batch loads ~20 logical names.
- `getAsset(c,n)` checks `_caches[n]` if cat is config* → shortcut, else `_pathCache[key]` else fetch.
- `saveAsset(c,n,d)` PUT, updates both caches, updates `_cache` if main.
- `invalidateCache(name)` deletes logical + path caches.
- No events.

### 3.3 Game orchestration (`src/core/game.js`)
- `_loadAllConfigs()`: loads base + render configs, merges via `_pickCfg` and `_mergeDerivedRenderConfigs`.
- `cfg` merged object holds `.lighting`, `.fog`, `.sprites`, `.chamfer`, `.materialsProc`, `.player`, etc.
- `GPURenderer` init: takes dungeon + cfg, builds atlases via `generateMaterialAtlases(wallMats, floorMats, ceilMats, {walls, floors, ceils, ...})`, creates GL textures, compiles shaders, creates `LightManager` + `SpriteGpuRenderer`.
- Loop: `input.update → _updateDiscovery → renderer.render(dungeon, player, time)`.
- `_updateDiscovery` only.
- No live update path.

### 3.4 Renderer (`src/render/renderer-gpu.js`)
- `init(dungeon, config)`: creates programs (raycast fsSource, quantize, ui, sprite), VAOs, loads material JSONs via `getAsset`, generates atlases, uploads map texture, builds palette LUT, inits LightManager from dungeon, preloads sprites.
- Per frame `render()`:
  - Resolves many uniforms from cfg via `_resolveConfigValue(cfg, ['fog.base', ...], fallback)` and via `_resolveToggles`.
  - Uploads lights: `lightManager.getFlickeredList(time, playerPos, maxLights, playerLight)` → per light flicker CPU side, upload arrays `u_lightPos[i]`, `u_lightIntensity[i]` etc.
  - Draws raycast to FBO, quantize pass, UI map overlay, sprites back-to-front with depth buffer `_computeDepthBuffer`.
- Atlas re-upload only on `uploadMap(dungeon)` regen, not live.
- Uniforms cached in `uLoc` but values re-uploaded each frame from config lookup? Some configs read each frame, some cached at init.
- `_resolveConfigValue` dynamic per frame = easy live hook: if cfg reference mutates, next frame picks new values.

### 3.5 Light system (`src/systems/lights.js`)
- `Light` holds pos, color, intensity, radius, flickerSpeed/Amount, phase, pulseSpeed/Amount, dir, cone inner/outer, noShadow, etc.
- `getFlickeredIntensity(time)` → `organicFlickerFactor(time, speed, amount, phase)` layered: drift, multi-octave sines, pop spikes, clamp.
- `LightManager`: owns sun + ambient + array of Lights.
  - `setConfig(cfg)` updates sun/ambient, maxLights.
  - `setFromMap(map)`: maps `map.lights` or `map.sprites` → Light instances.
  - `getNearest(pos, maxCount)` sorted by d2.
  - `getFlickeredList(time, cameraPos, maxCount, playerLight)` → nearest + flickered.
- Live need: `updateFlickerParams`, `updateFromLightTypes`, `scaleExistingIntensities`.

### 3.6 Materials (`src/world/materials.js`)
- `genBrickTile(size, baseRGB, proc, seed, matRough)` and `genSlabTile` generate albedo, normal (heightToNormal), height, rough, metal, ao, emiss.
- Key tunable proc fields that directly affect visuals and **must be live-editable**:
  - `heightScale` 1.15, `normalStrength`, `normalFactor` 1.6/1.4, `roughness`, `roughnessVariation`, `bevelStart` 0.42/0.48, `bevelDepth` 0.22/0.16, `cornerRound` 0.5, `roundness` 0.06/0.05, `groutDepth` 0.08, `groutWidth`, `aoStrength`, `aoGrout`, etc.
- `generateMaterialAtlases(wallMats, floorMats, ceilMats, procConfig)` packs into Uint8Array atlases 64x64 * count (forcedCount 1 currently).
- CPU heavy but <100ms for 3 tiles 64x64 — OK to debounce to 500ms for live slider dragging.
- Outputs: `wallAlbedo, wallNormal, wallHeight, wallRoughMetalAO, ...` → texture upload via `createTexture(gl, w, h, arr, filter)`.

### 3.7 Editor (`src/editor.js`)
- Builds hierarchical tree from `getAssetList()` categories split by '/'.
- Visual form: recursive `buildForm(container, obj, path)` for objects/arrays, number inputs with range slider when value in [0,1] and key match roughness/metal/chance/weight/strength/etc.
- Color picker for [R,G,B] triple arrays.
- Raw JSON tab with textarea.
- `setByPath(obj, path, value)` via split on '.' and '[i]'.
- Save via `saveAsset`.
- Status pill.
- No live logic.

---

## 4. Architecture Overview

```
┌─────────────┐  oninput (Live ON)  ┌─────────────────────┐  debounced PUT  ┌──────────────────┐
│ editor.html │────────────────────►│ BroadcastChannel    │────────────────►│ server.js        │
│  (tab A)    │   instant BC post   │ 'dungeoneers-live'  │   /api/assets/PUT│  + SSE fanout   │
└─────────────┘                     └─────────┬───────────┘                  └──────┬───────────┘
                                              │  BC message                        │ SSE event
                                              ▼                                    │ {asset-updated}
                                    ┌──────────────────┐                           ▼
                                    │   Shared?        │                  ┌─────────────────┐
                                    └──────────────────┘                  │  SSE endpoint    │
                                                                            │  /api/watch     │
                                                                            └──────┬──────────┘
                                                                                   │ EventSource
┌─────────────┐  LiveConfigManager  ┌──────────────────┐  onLiveUpdate(*)  ┌──────▼──────────┐
│ game.html   │◄────────────────────│  EventSource     │◄─────────────────│ game.html tab B │
│  (tab B)    │  BC listener + SSE  │  + BC listener   │  Live subscriber  │ + editor.html   │
│             │                     └──────────────────┘                   └─────────────────┘
│  Game._applyLiveConfig(logical, data) ──► Renderer.updateFog / updateChamfer / updateLighting
│                                        ──► LightManager.updateFlicker / updateFromConfig
│                                        ──► Atlas rebuild queue (materials-proc) → reuploadAtlases()
│                                        ──► Player.setConfig(), Discovery.updateConfig()
└─────────────────────────────────────────────────────────────────────────────────────────────┘

Tiers:
Tier 1 (instant <300ms): fog, lighting ambient/sun/torchColors maxLights, chamfer shading/trim/range uniforms, corners uniforms, rendering fov/textureFilter, pbr F0/ao, pom steps/clamping, shadows bias, raymarch maxSteps, palette style, player moveSpeed/turnSpeed/bob, discovery animationDuration/trail color/opacity/dash, map parchment colors, debug hud timeout.
Tier 2 (debounced atlas rebuild 500-1000ms): materials-proc walls/floors/ceils fields bevelStart/bevelDepth/cornerRound/roundness/groutDepth/normalFactor/heightScale/roughness/etc, pom strength wall/floor/ceil, pbr chamfer/corner affect, palette gen (if custom palette JSON).
Tier 3 (regen-required): generator roomCount/zone/role weights/items maxTorches/minTorchDist/corridorBias/torchOffset/seed, sprites generation pools weights/zBase/jitter, sprites maxLights, discovery peekDistance/corridorRevealRadius logic that affects discovered shape, any config that changes dungeon.w/h.
```

---

## 5. Detailed Component Design

### 5.1 Server — SSE Broadcast

**New endpoint:** `GET /api/watch` or `GET /api/assets/watch` (stay under `/api/` CORS headers already set).

Implementation with vanilla Node `http`:

```js
const sseClients = new Set();

function broadcastAssetUpdate(category, name, dataHint = null) {
  const payload = JSON.stringify({
    type: 'asset-updated',
    category, // e.g. 'config/lighting'
    name, // e.g. 'fog'
    path: `${category}/${name}`,
    timestamp: Date.now(),
    // optionally include dataHint small or just signal to re-fetch to keep SSE payload light
  });
  const msg = `event: asset-updated\ndata: ${payload}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

async function handleWatch(req, res) {
  // headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });
  res.write(`: connected\n\n`);
  sseClients.add(res);
  // heartbeat every 25s to keep proxy alive
  const hb = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch { clearInterval(hb); sseClients.delete(res); }
  }, 25000);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
}
```

- Hook into PUT path after `await saveAssetFile(cat,name,jb)` → `broadcastAssetUpdate(cat,name)`.
- Also support `fs.watch` optional (future): `fs.watch(ASSETS_DIR, {recursive:true}, (event, filename) => {... broadcast...})` debounced 200ms. Keep behind env flag `LIVE_WATCH_FS=1` to avoid noisy on Windows.
- SSE client list in memory, no persistence.
- CORS headers already set in `handleApi`, ensure SSE also sets them.
- Keep `safeCategory` / `safeName` checks.
- No auth — local dev.

**API versioning:** Add `GET /api/watch/health`? Not needed.

### 5.2 Client Live Manager — `src/config/live-config.js` (NEW)

Why separate file: `config.js` already 211 lines with caches; keep live logic modular but integrate via import.

**Class: `LiveConfigManager`**

- Singleton pattern: `let _instance = null; export function getLiveConfigManager() { if (!_instance) _instance = new LiveConfigManager(); return _instance; }`
- Constructor:
  - `this.enabled = false` (starts disabled unless localStorage `dungeoneers-live-enabled` = true)
  - `this.bc = null` through `BroadcastChannel` if available else null. Channel name `dungeoneers-live-edit`.
  - `this.es = null` (EventSource)
  - `this.listeners = Map<pattern, Set<callback>>` pattern = logical name, 'category/name', '*'.
  - `this.debounceTimers = {}`
  - `this.pollInterval = null`
  - `this.lastEventTs = 0`

- Methods:
  - `enable()`:
    - Set `enabled=true`, localStorage flag.
    - Setup BroadcastChannel: `new BroadcastChannel(name)`, `onmessage = (e) => handleMessage(e.data)`.
    - Setup SSE: `new EventSource('/api/watch')`, addEventListener `asset-updated`, `onerror` → retry with backoff + fallback poll.
    - Dispatch window event `dungeoneers-live-enabled`.
  - `disable()`:
    - close ES, close BC, clear poll, listeners stay but not triggered.
  - `subscribe(pattern, cb)` → returns unsubscribe fn. Pattern matching: exact logical, exact path, '*'.
  - `publishPreview(category, name, data, source='editor')`:
    - BC post: `{type:'preview', category, name, data, ts, sourceTabId}`
    - Also via window CustomEvent for same-tab listeners.
    - Data is cloned via structuredClone or JSON roundtrip.
  - `handleMessage(msg)`:
    - If `msg.type === 'preview'` → resolve logical names reverse lookup from category/name → for each logical call `notifyListeners(logical, {data, category, name, source:'bc'})` plus need to update _caches via `invalidateCache`? For preview-only (no PUT), we still want cache updated in memory but not persisted. So update _caches directly with clone, and _pathCache, without calling save.
    - If `msg.type === 'asset-updated'` (from SSE) → fetch latest via `getAsset(cat,name)` then notify.
  - `handleSSE(event)`:
    - Parse JSON, get category, name, async `getAsset` (which will cache), then `notifyListeners` for all logical that map.
  - Reverse lookup: build `REVERSE_MAP`: `path -> [logical,...]` from CONFIG_PATHS at init. Also support direct path not in CONFIG_PATHS (e.g. `materials/walls`) → logical = null but still notify by path.
  - `notifyListeners(logicalOrPath, payload)`: for each listener whose pattern matches (exact or '*'), call cb.
  - Polling fallback: if EventSource fails >3 times or unsupported, setInterval every 2000ms fetch `/api/assets` list with ETags? Simpler: keep last fetch timestamps per asset? For MVP poll only current file being edited? But for game we need poll any change. Implement: every 3s fetch asset list and compare `itemCount` or fetch for specific watched logicals? Keep simple: poll list of assets that were previously fetched via `getAssetList()` then re-fetch changed file if timestamp? Actually list doesn't include timestamp; we can rely on BC as primary and SSE as secondary; polling as last resort fetch all known logicals HEAD? Implement simple: every 5s re-fetch `getAsset` for each cached logical and compare JSON.stringify? Costly but ok for 20 small JSONs. Debounce diff detection.

- Integration with existing `config.js`:
  - Export `invalidateCache`, `_caches`, `_pathCache` maybe accessor.
  - After asset PUT, `saveAsset` already updates caches — keep.
  - Add `import { getLiveConfigManager }` not circular; better `live-config.js` imports `getAsset`, `invalidateCache`, `CONFIG_PATHS` from config.js. Since config.js doesn't import live-config.js initially, no cycle.
  - Then `config.js` can lazily import live manager in `getAsset` after save? Actually we want Game to import live manager directly.

**BroadcastChannel protocol:**

```js
// editor -> game
{
  type: 'preview',
  category: 'config/lighting',
  name: 'fog',
  data: {version:1, enabled:true, base:0.12, ...},
  source: 'editor',
  tabId: 'editor-xxxx',
  ts: 171...
}

// editor -> server -> SSE -> game (persisted)
{
  type: 'asset-updated',
  category: 'config/lighting',
  name: 'fog',
  path: 'config/lighting/fog',
  timestamp: ...
  // data not included, client re-fetches
}
```

**Deduplication:** Editor tab itself may receive its own BC echo — ignore if tabId === ownId.

### 5.3 Config Tier Classification — `src/config/live-tiers.js` or inside live-config.js

Create explicit table:

| Logical / Path | Tier | Live Action | Needs Atlas? | Needs Regen? | Notes |
|---|---|---|---|---|---|
| `fog` | T1 instant | `renderer.updateFog(data)` + cfg.fog=data | no | no | base/squared/color uniforms per frame |
| `lighting` | T1 | `lightManager.setConfig` + `cfg.torchColors`, `cfg.maxLights` | no | no | sun dir/color/intensity, ambient |
| `sprites` (lightProfile intensity/radius/flicker color) | T1 | `lightManager.updateFromSpritesConfig(data, existingLights)` mapping by spriteId/type → update matching lights | no | no | keep positions, only update flicker/intensity/radius/color |
| `light-types` | T1 | `lightManager.updateFromLightTypes(data)` | no | no | archetype change affects all lights of that type |
| `chamfer` | T1 | `renderer.updateChamfer(data)` → uniform cache update | no | no | size floor/ceil/wall, shading darken/blend/rough, trim strengths, ranges thresholds |
| `corners` | T1 | `renderer.updateCorners(data)` | no | no | radius, mode, inner, band thresholds, albedoBoost etc |
| `pbr` | T1 | `renderer.updatePBR(data)` | no | no | ao affect, emissive mul, F0, attenQuad etc |
| `ao` | T1 | `renderer.updateAO(data)` | no | no | affect sun/point/ambient |
| `shadows` | T1 | `renderer.updateShadows(data)` | no | no | bias, factors |
| `raymarch` | T1 | `renderer.updateRaymarch(data)` | no | no | maxSteps |
| `rendering` | T1 | `renderer.updateRendering(data)` + `game._resize` if resolution changed | no | no | fov, textureFilter, authentic/palette LUT |
| `palette` | T1/T2 | `renderer.rebuildPalette()` instant unless custom palette texture custom — tier 1 for style/bandLevels, T2 if custom lut texture |
| `pom` | T1 + T2 | steps + clamping T1, strength wall/floor/ceil T2 if affects height texture? Actually pom strength is uniform but affects atlas offset? No atlas effect, just uniform so T1; but note pom.strength affects shader offset magnitude, not atlas |
| `player` | T1 | `player.setConfig(cfg)` + maybe bob presets | no | no | moveSpeed/turnSpeed/radius/height/bob |
| `discovery` | T1 | `discovery.updateConfig(data)` or `game.cfg.discovery=data` | no | no | animationDuration, trail color/opacity/dash/lineWidth |
| `map` | T1 | `game.ui.updateMapConfig` | no | no | parchment colors, font |
| `debug` | T1 | `game.cfg.debug=data` | no | no | hud timeout |
| `materials-proc` | T2 rebuild | `renderer.rebuildAtlases(walls,floors,ceils,proc)` async queue | YES | no | bevelStart/bevelDepth/cornerRound/roundness/groutDepth/normalFactor/heightScale etc |
| `materials/walls`, `floors`, `ceils` | T2 | same as materials-proc | YES | no | base color, roughness per mat |
| `generator` | T3 regen-required | show HUD banner "Regen required (R)" + optional auto-regen after debounce if enabled in live settings | no | YES | room counts, zone theme, seed logic |
| `sprites.generation` (pools, zBase, flameSize) | T3 | regen-required banner | no | YES | affects placement |
| `main` (legacy bundle) | T1/T3 mixed | parse and route to appropriate tiers based on keys present; if generator keys present → T3 | depends | maybe | fallback |

Implement helper `getTierForLogical(logicalName)` or `getTierForPath(cat/name)`.

### 5.4 Editor — Live Toggle UI

Modify `src/editor.html` toolbar:

Add inside `.editor-toolbar` after Save button:

```html
<div class="live-controls" id="live-controls">
  <label class="toggle sm"><input type="checkbox" id="toggle-live"><span class="toggle-slider"></span>Live Edit</label>
  <label class="toggle sm"><input type="checkbox" id="toggle-autosave"><span class="toggle-slider"></span>Auto Save</label>
  <span id="live-status" class="status-pill">offline</span>
</div>
```

CSS in `style.css`: small toggle, status pill colors: `live-connected` green, `live-bc-only` yellow, `live-offline` gray, `live-syncing` blue pulse.

`src/editor.js` changes:
- Import `getLiveConfigManager`, `getAsset`, `saveAsset`.
- On init, get live manager instance, enable if localStorage flagged.
- Setup UI listeners:
  - `toggle-live` → enable/disable live manager
  - `toggle-autosave` → flag `autoSaveEnabled` stored localStorage.
  - Live manager status → update `#live-status` pill.
- Wrap `setByPath` calls: after setting, if live ON → `liveManager.publishPreview(category, name, currentData)`, plus schedule debounced PUT if autoSave ON.
- Debounce helper:

```js
function debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }
const debouncedSave = debounce(async () => {
  status('Live syncing...','sync');
  const ok = await saveAsset(current.category, current.name, currentData);
  status(ok?'Live saved':'Save failed', ok?'ok':'err');
  // if ok, server will broadcast SSE which game will receive; we also BC posted already so game already updated preview even before PUT ack
}, 350);
```

- When live OFF, old behavior: only explicit Save button saves.
- Handle incoming SSE for current file: if another tab edited same file via PUT, need to merge or prompt. Simple: if current file matches updated category/name and not dirty (user hasn't typed since last save), auto-reload via `getAsset` + `render()`. If dirty, show "External change — reload?" banner.
- BroadcastChannel preview-only mode: when autoSave OFF, only BC preview, no PUT. Show indicator "Preview (unsaved)".
- When autoSave ON, do both preview + debounced PUT.

### 5.5 Game — Live Integration

**`src/core/game.js`:**

- Import `getLiveConfigManager`.
- In `init()` after configs loaded, init live manager: `this.liveManager = getLiveConfigManager(); this.liveManager.enable();` but only if URL param `?live=1` or localStorage. For simplicity always enable listener but not publishing (game is subscriber only).
- Subscribe:

```js
this._liveUnsub = this.liveManager.subscribe('*', async ({ logical, category, name, data, source }) => {
  // ignore own tab source? game never publishes, so ignore check
  try {
    await this._applyLiveConfig({ logical, category, name, data });
    this._showHud(`Live: ${logical || category+'/'+name} updated`, 1200);
    // update window.game.cfg for E2E
    if (logical && this.cfg) this.cfg[logical] = data;
    // also update merged cfg for tier that uses path-based not logical? Ensure this.cfg.raw path cache too?
  } catch (e) {
    console.warn('[Live] apply failed', logical, e);
  }
});
```

- Implement `_applyLiveConfig`:

```js
async _applyLiveConfig({ logical, category, name, data }) {
  const tier = getTierForLogical(logical || `${category}/${name}`);
  if (tier === 'T1') {
    switch(logical) {
      case 'fog': this.cfg.fog = data; this.renderer.updateFog(data); break;
      case 'lighting': this.cfg.lighting = data; this.renderer.lightManager?.setConfig(data); this.cfg.torchColors = data.torchColors || this.cfg.torchColors; this.cfg.maxLights = data.maxLights; if (this.renderer) this.renderer.maxLights = data.maxLights; break;
      case 'sprites': this.cfg.sprites = data; this._applySpritesLive(data); break;
      case 'light-types': this.cfg['light-types'] = data; this._applyLightTypesLive(data); break;
      case 'chamfer': this.cfg.chamfer = data; this.renderer.updateChamfer(data); break;
      case 'corners': this.cfg.corners = data; this.renderer.updateCorners(data); break;
      case 'pbr': this.cfg.pbr = data; this.renderer.updatePBR(data); break;
      case 'ao': this.cfg.ao = data; this.renderer.updateAO(data); break;
      case 'shadows': this.cfg.shadows = data; this.renderer.updateShadows(data); break;
      case 'raymarch': this.cfg.raymarch = data; this.renderer.updateRaymarch(data); break;
      case 'rendering': this.cfg.rendering = data; this.renderer.updateRendering(data); break;
      case 'palette': this.cfg.palette = data; this.renderer._applyPaletteFromConfig({palette:data}); this.renderer.rebuildPalette(); break;
      case 'player': this.cfg.player = data; this.player.setConfig({player:data, ...this.cfg}); break;
      case 'discovery': this.cfg.discovery = data; this.discovery?.updateConfig?.(data); break;
      case 'map': this.cfg.map = data; this.ui?.updateMapConfig?.(data); break;
      case 'debug': this.cfg.debug = data; break;
      case 'materials-proc': // fall through to T2
        return this._applyMaterialsProcLive(data);
      // ... handle materials/walls etc path-based via category/name:
      default:
        if (category === 'config' && name === 'main') {
          // merge main into cfg and re-route
          const merged = this._mergeConfigs(data, await getAllRenderConfigs());
          this.cfg = merged;
          // for each key in merged that changed, apply T1 quickly
        } else if (category.includes('materials')) {
          return this._applyMaterialsProcLive(this.cfg['materials-proc'] || this.cfg.materialsProc);
        }
    }
  } else if (tier === 'T2') {
    await this._applyMaterialsProcLive(data);
  } else if (tier === 'T3') {
    this._regenRequired = true;
    this._showHud(`Live: ${logical||name} changed — press R to regen`, 4000);
    // optionally auto-regen if this.cfg.debug.liveAutoRegen
  }
}

_applySpritesLive(newSpritesCfg) {
  // update existing lights in LightManager that correspond to sprites
  // naive: for each light in manager.lights, find sprite def by id/type and update intensity/radius/flicker/color
  // keep pos/radius already placed, just mutate props
  const lm = this.renderer?.lightManager;
  if (!lm) return;
  const byId = new Map(newSpritesCfg.sprites?.map(s => [s.id, s]) || []);
  lm.lights.forEach(L => {
    const def = byId.get(L.spriteId) || byId.get(L.type) || null;
    if (!def) return;
    const lp = def.lightProfile;
    if (!lp) return;
    if (lp.color) L.color = lp.color.slice();
    if (lp.intensity) { L.intensity = (lp.intensity.min + lp.intensity.max)/2; } // or keep offset but update base
    if (lp.radius) L.radius = (lp.radius.min + lp.radius.max)/2;
    if (lp.flicker) {
      L.flickerSpeed = (lp.flicker.speedMin + lp.flicker.speedMax)/2;
      L.flickerAmount = (lp.flicker.amountMin + lp.flicker.amountMax)/2;
    }
    if (lp.pulse) {
      L.pulseSpeed = lp.pulse.speedMin ?? lp.pulse.speed ?? 0;
      L.pulseAmount = lp.pulse.amountMin ?? lp.pulse.amount ?? 0;
    }
  });
  // also update torchColors used for generation? No regen
}

_applyLightTypesLive(lightTypesCfg) { similar }

async _applyMaterialsProcLive(mproc) {
  // debounce wrapper already? Ensure game debounces rebuilds
  if (this._atlasRebuildTimer) clearTimeout(this._atlasRebuildTimer);
  this._atlasRebuildTimer = setTimeout(async () => {
    try {
      this._showHud('Live: rebuilding materials...', 800);
      const walls = await getAsset('materials','walls');
      const floors = await getAsset('materials','floors');
      const ceils = await getAsset('materials','ceils');
      const atl = generateMaterialAtlases(walls.materials, floors.materials, ceils.materials, mproc);
      this.renderer.reuploadAtlases(atl);
      this._showHud('Live: materials rebuilt', 1000);
    } catch (e) { console.warn('atlas rebuild failed', e); }
  }, 400); // 400ms debounce
}
```

- Also need `renderer` methods stubs that currently don't exist: implement:

**`src/render/renderer-gpu.js`:**

- Add `updateFog(fogCfg)`, `updateChamfer(chamferCfg)`, `updateCorners()`, `updateShadows()`, `updatePBR()`, `updateAO()`, `updateRaymarch()`, `updateRendering()`, `updatePalette()` already exists partially.
- Each just updates internal cache `this._cfgCache = {...this._cfgCache, fog:fogCfg}` and next frame's `_resolveConfigValue` may read from cfg, but for performance store uniforms and update.
- For chamfer/corners/shadows etc: they set uniform values each frame already via reading cfg? Need to verify current code reads via `_resolveConfigValue` each frame in `render()`. If so, mutating cfg is enough. But to be safe implement explicit update methods that set new config reference.
- Introduce `this._cfgCache` mutable reference: `updateConfig(partial)` merges.
- `reuploadAtlases(atl)`: takes output of `generateMaterialAtlases`, creates textures via `createTexture`, replaces `this.atlases.wa`, `wn`, etc, updates `this.atlasInfo`. Need to handle async GL context: `gl.bindTexture`, `texImage2D` etc. Must also update texSize, etc.
- Ensure depth buffer not invalidated.
- Add fast path: no need to recompile shaders.

**`src/systems/lights.js`:**

- Add `updateFromSpritesConfig`, `updateFromLightTypes`, `updateFlickerForAll(newSpeed, newAmount)`? Keep simple.
- Method `updateFlickerGlobalMultiplier(mul)`? But better per light.

**Game HUD live indicator:**

- Add `<div id="live-indicator" class="live-badge">LIVE</div>` in `game.html` topbar or hud.
- CSS: small dot green when connected to SSE, gray when offline, blinking when update received.
- Game subscribes to live manager connection status events.

### 5.6 Discovery + Player + Map UI Live Patching

- `world/discovery.js`: add `updateConfig(newCfg)` that merges new trail/reveal settings (animationDuration, dash, color, opacity). Already constructor takes config. Add method.

- `entities/player.js`: `setConfig` already exists, ensure it reads live moveSpeed/turnSpeed.

- `render/map-ui.js`: add `updateMapConfig(newCfg)` that updates parchment colors.

### 5.7 Persistence Semantics Deep Dive

**Modes:**

1. **AutoSave ON (recommended MVP):**
   - Editor oninput → BC preview instantly (game updates before PUT ack) → debounced PUT 350ms → server writes file + SSE broadcast.
   - SSE broadcast acts as confirmation for other tabs and for persistence across reload.
   - Race: if BC delivered already, SSE echo may cause second fetch but idempotent.

2. **Preview-only OFF (AutoSave OFF):**
   - Editor oninput → BC preview only.
   - Disk not written. Game shows live preview but after reload reverts.
   - Save button does PUT + implicit BC + SSE.
   - Game should show indicator "Preview mode — not saved" if last update source was BC preview without matching SSE.
   - Implementation: live manager flags `pendingUnsaved` map category/name → data clone. On Save, clear.

3. **Conflict resolution:**
   - Last-write-wins for PUT.
   - If editor has dirty unsaved changes and receives external SSE for same file, show modal/banner: "File changed on disk — Reload? Keep your changes?".
   - Similarly game if multiple editors.

**LocalStorage keys:**
- `dungeoneers-live-enabled` bool
- `dungeoneers-live-autosave` bool
- `dungeoneers-live-tabId` random.

---

## 6. Failure Modes & Mitigations

- **SSE not supported / blocked by proxy:** fallback to polling + BC still works for same-origin two tabs.
- **BroadcastChannel not supported (Safari <15.4?):** fallback to `localStorage` event: `localStorage.setItem('dungeoneers-bc', JSON.stringify(msg))` triggers `storage` event in other tab. Implement wrapper `CrossTabBus` that tries BC → localStorage → polling.
- **Rapid slider drag causing 60 PUTs/sec:** debounce 350ms + throttle max 2/sec. Keep BC preview at full rate (throttled to rAF ~60hz okay because BC messages cheap).
- **Atlas rebuild heavy:** debounce 400-600ms, show spinner, cancel previous pending rebuild promise.
- **Memory leak: SSE clients Set grows if not cleaned on close:** handle `req.on('close')` and `res.on('error')` delete.
- **GL context lost during atlas reupload:** catch, attempt to re-create texture, no crash.
- **Config invalid after live edit (user typed bad JSON in raw tab):** editor raw tab validates JSON before broadcast; on invalid, show error, don't broadcast.

---

## 7. Testing Plan — Playwright Two Tabs

### 7.1 Unit Tests (`src/tests/unit/live-*.test.js`)

- `live-config.test.js`:
  - Reverse lookup: given category/name `config/lighting/fog`, returns logicals `['fog']` plus `'lighting'`? Test mapping.
  - Pattern matching: subscribe '*' gets all, subscribe 'fog' only fog, subscribe 'config/lighting/fog' exact.
  - Debounce: rapid publishPreview calls coalesce for PUT but BC immediate? Test logic separation.
  - CrossTab bus fallback logic.
  - Tier classification: `getTier('materials-proc')===T2`, `getTier('generator')===T3`, `getTier('fog')===T1`, etc.

- `server-live.test.js` (Node):
  - Simulate server's `sseClients` Set, `broadcastAssetUpdate` writes to mocked res objects, verify message format `event: asset-updated\ndata: {...}`.
  - Verify safeCategory checks still block `../` traversal.

- `game-live-apply.test.js`:
  - Mock Game, Renderer, LightManager, test `_applyLiveConfig` for T1 updates mutates correct fields without throw.
  - Test atlas rebuild debounced (use fake timers).

### 7.2 E2E Tests (`src/tests/e2e/live-edit.spec.js`) — TWO TAB ACTUAL

We need Playwright multi-page in same browserContext to test BroadcastChannel + SSE.

**Setup:** Use `webServer` already configured at port 8005 (`npm start`). Tests baseURL `http://localhost:8005`. New spec file `live-edit.spec.js`.

**Test matrix:**

```js
test.describe('live-edit system', () => {
  test('SSE endpoint returns event-stream', async ({ request }) => {
    // fetch /api/watch and check headers content-type text/event-stream
  });

  test('editor live toggle UI exists and persists', async ({ page }) => {
    await page.goto('/editor.html');
    await expect(page.locator('#toggle-live')).toBeVisible();
    await expect(page.locator('#toggle-autosave')).toBeVisible();
    await expect(page.locator('#live-status')).toBeVisible();
    // toggle, reload, check localStorage persisted
  });

  test('fog live update via API PUT propagates to game without reload (SSE path)', async ({ browser }) => {
    // Use single browser context for shared origin to allow BC
    const context = await browser.newContext();
    const gamePage = await context.newPage();
    const editorPage = await context.newPage();

    await gamePage.goto('/game.html');
    await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.renderer && window.game.renderer.isReady());
    // optional: wait for non-empty fog
    const initialFogBase = await gamePage.evaluate(() => window.game.cfg.fog.base);

    // Editor page will PUT new fog via API (simulate editor saving)
    await editorPage.goto('/editor.html');
    // ensure live enabled in game
    await gamePage.evaluate(() => {
      localStorage.setItem('dungeoneers-live-enabled','1');
      localStorage.setItem('dungeoneers-live-autosave','1');
    });
    // wait for live manager connection? Evaluate manager enabled flag
    await gamePage.reload();
    await gamePage.waitForFunction(() => window.game && window.game.liveManager && window.game.liveManager.enabled);

    // Now mutate fog via PUT from editor context
    const newFogBase = initialFogBase + 0.12;
    await editorPage.evaluate(async (newBase) => {
      const res = await fetch('/api/assets/config/lighting/fog');
      const cfg = await res.json();
      cfg.base = newBase;
      await fetch('/api/assets/config/lighting/fog', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg)});
    }, newFogBase);

    // Game should auto update via SSE within 2s
    await gamePage.waitForFunction((expected) => {
      return window.game && window.game.cfg && Math.abs(window.game.cfg.fog.base - expected) < 0.001;
    }, newFogBase, {timeout: 5000});

    // Check renderer fog uniform applied (next frame)
    const rendererFog = await gamePage.evaluate(() => window.game.renderer._cfgCache?.fog?.base || window.game.cfg.fog.base);
    expect(Math.abs(rendererFog - newFogBase)).toBeLessThan(0.01);

    // Reload game and check persisted (auto-save path)
    await gamePage.reload();
    await gamePage.waitForFunction((expected) => window.game && Math.abs(window.game.cfg.fog.base - expected) < 0.001, newFogBase, {timeout:5000});

    // Cleanup revert
    await editorPage.evaluate(async (oldBase) => {
      const res = await fetch('/api/assets/config/lighting/fog');
      const cfg = await res.json(); cfg.base = oldBase;
      await fetch('/api/assets/config/lighting/fog', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg)});
    }, initialFogBase);

    await context.close();
  });

  test('BroadcastChannel preview path instant without PUT (preview-only)', ...)
  test('chamfer live update instant uniform', ...)
  test('materials-proc live atlas rebuild', async ({browser}) => {
    const context = await browser.newContext();
    const game = await context.newPage();
    await game.goto('/game.html');
    await game.waitForFunction(() => window.game?.renderer?.isReady());
    // initial atlas info
    const initialBevel = await game.evaluate(() => window.game.cfg['materials-proc'].walls.bevelDepth);
    const newBevel = initialBevel + 0.12;
    // PUT materials-proc
    await game.evaluate(async (nb) => {
      const r = await fetch('/api/assets/config/rendering/materials-proc');
      const cfg = await r.json(); cfg.walls.bevelDepth = nb;
      await fetch('/api/assets/config/rendering/materials-proc', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg)});
    }, newBevel);
    // should trigger atlas rebuild HUD
    await game.waitForFunction(() => {
      const hud = document.getElementById('game-hud');
      return hud && hud.textContent.includes('materials');
    }, {timeout: 5000}).catch(()=>{}); // HUD may be transient
    // Wait for reupload
    await game.waitForFunction((nb) => {
      return window.game && Math.abs(window.game.cfg['materials-proc'].walls.bevelDepth - nb) < 0.001;
    }, newBevel, {timeout: 7000});
    // Canvas still non-empty, no WebGL error
    await game.waitForFunction(() => {
      const c = document.getElementById('game-canvas');
      return c && c.width>0;
    });
    // cleanup
  });

  test('generator live shows regen-required banner not auto regen', ...)
  test('two tabs editor UI slider drag debounced PUT count', async ({browser}) => {
    // editor page toggles live on, then simulates 10 rapid oninput changes, expect only <=3 PUTs captured via intercept? Count via server log or mock fetch counting
    // Use page.route to count PUTs to /api/assets/*
  });

  test('no regression: live OFF keeps Save+R workflow', ...)
});
```

**Key Playwright techniques:**
- `browser.newContext()` then `context.newPage()` twice → same origin, shared localStorage via same context? Actually localStorage shared across pages in same context? Playwright docs: same context shares cookies/storage? Need to ensure. BroadcastChannel works across same origin tabs in same browser, which Playwright browserContext provides (each context is like isolated profile but multiple pages inside share BC). Yes.
- Use `page.evaluate(() => window.game.liveManager)` exposed for E2E.
- For SSE test, don't use `request` to keep connection open? Use `fetch` EventSource inside evaluate.
- Use `page.waitForFunction` with polling for config change rather than fixed timeout.
- For visual proof, take screenshots of game canvas before/after fog tweak into `tasks/live-edit/screenshots/`? But E2E screenshot-taking should be part of spec option: export canvas to data URL and compare pixel variance?
- Test that no console errors: `page.on('console')` and `page.on('pageerror')`.

**Performance tests:**
- Measure time from PUT to game config updated: use `performance.now()` before PUT and after live update resolved.

**Fallback tests:**
- Disable BroadcastChannel via `delete window.BroadcastChannel` in evaluate, then test SSE-only path still works.
- Simulate EventSource failure by intercepting `/api/watch` route abort, then verify polling fallback still picks change within 5s.

### 7.3 Manual Two-Tab Validation Checklist

- Open `game.html` + `editor.html` side by side Chrome.
- Enable Live Edit + Auto Save in editor.
- Tweak fog `base` slider → game fog thickens instantly.
- Tweak `lighting.json → ambient.level 0.36→0.8` → scene brighter.
- Tweak `chamfer.json → size.floor 0.3→0.6` → floor baseboard wider instantly.
- Tweak `materials-proc.json → walls.roundness 0.06→0.20` → bricks more bubbled after ~0.6s rebuild.
- Tweak `sprites.json → torch_wall lightProfile flicker amountMax 0.3→0.8` → torches wilder.
- Disable Live Edit → tweak fog → game does NOT update until Save+R.
- Check DevTools Network: PUT debounced, SSE connection held open.
- Check memory: open/close tabs multiple times, SSE clients set should not leak.

---

## 8. Implementation Phases

**Phase 0 — Server SSE (smallest increment):**
- Modify `src/server/server.js`: add `sseClients Set`, `/api/watch` handling, `broadcastAssetUpdate` call on PUT, heartbeat, error handling.
- Add unit test for broadcast format.
- Manual test: curl SSE? `curl -N http://localhost:8000/api/watch` then in another terminal `curl -X PUT ... fog.json`.

**Phase 1 — Client Live Manager:**
- New `src/config/live-config.js` with `LiveConfigManager`, `CrossTabBus` wrapper (BC → localStorage → noop).
- Add `CONFIG_PATHS` reverse map, tier classification helper `getTier`.
- Integrate with `config.js` via export of paths but no hard cycle.
- Unit tests: reverse lookup, tier, subscribe/unsubscribe, debounce.

**Phase 2 — Editor Live UI:**
- `editor.html` add live controls HTML.
- `editor.js` import live manager, setup toggles, status pill, localStorage, BC preview, debounced PUT.
- Test editor UI exists E2E.

**Phase 3 — Game Tier-1 Hot Reload:**
- `game.js` import live manager, subscribe, `_applyLiveConfig` for T1.
- `renderer-gpu.js` add `updateFog`, `updateChamfer`, `updateCorners`, `updateShadows`, `updatePBR`, `updateAO`, `updateRaymarch`, `updateRendering`, `updatePalette`, plus generic `updateConfig`.
- `lights.js` add update methods.
- `discovery.js` add `updateConfig`.
- Add HUD toast + live badge.
- E2E fog live, chamfer live.

**Phase 4 — Tier-2 Atlas Rebuild:**
- `renderer-gpu.js` implement `reuploadAtlases(atl)` properly replacing textures.
- `game.js` implement `_applyMaterialsProcLive` debounced queue.
- Test materials-proc slider triggers rebuild without crash, no WebGL errors.
- Profile CPU cost.

**Phase 5 — Tier-3 Regen UX:**
- Generator change → show persistent banner "Regen required (R)" with UI in game.html (small top-left pill).
- Optionally auto-regen if `debug.liveAutoRegen` true.
- E2E that generator change doesn't crash but shows banner.

**Phase 6 — Polish & Tests & Screenshots:**
- Full Playwright suite including multi-page tests.
- Generate screenshots for task folder: `live-edit-toggle.png`, `live-fog-tweak.png`, `live-flicker-tweak.png`, `live-chamfer-tweak.png`, `editor-live-badge.png`, `game-live-indicator.png`.
- Update `task.toml` `commit-hash` and `README.md` with model comparison.

---

## 9. Files to Create / Modify

**Create:**
- `src/config/live-config.js` — LiveConfigManager, CrossTabBus, tier table, reverse lookup.
- `src/config/live-tiers.js` (optional if want separation, else inside live-config.js).
- `src/tests/unit/live-config.test.js`
- `src/tests/unit/live-tiers.test.js`
- `src/tests/e2e/live-edit.spec.js`
- `tasks/live-edit/screenshots/*` (6 PNGs)

**Modify:**
- `src/server/server.js` — SSE endpoint, broadcast, heartbeat.
- `src/config/config.js` — export CONFIG_PATHS, maybe expose _caches for live manager, ensure invalidateCache works.
- `src/core/game.js` — live manager integration, _applyLiveConfig, atlas rebuild queue, regen banner, live indicator.
- `src/render/renderer-gpu.js` — update* methods, reuploadAtlases, mutable cfg cache.
- `src/systems/lights.js` — updateFromSpritesConfig, updateFromLightTypes, updateFlicker helpers.
- `src/world/discovery.js` — updateConfig.
- `src/world/materials.js` — no change needed or extract helper for async rebuild (optional).
- `src/editor.html` — live controls UI.
- `src/editor.js` — live toggles, BC preview, debounced PUT, status.
- `src/game.html` — add live badge element.
- `src/style.css` — live badge, toggle styles, status pills.
- `src/playwright.config.js` — maybe increase timeout for live tests.

---

## 10. Acceptance Criteria

- [ ] Server has `GET /api/watch` SSE endpoint, holds clients, heartbeat, broadcasts on PUT with `event: asset-updated` and JSON `{type, category, name, path, timestamp}`. No new deps, uses vanilla Node.
- [ ] `LiveConfigManager` singleton exists in `src/config/live-config.js`, uses EventSource + BroadcastChannel (+ localStorage fallback), reverse lookup via CONFIG_PATHS, pattern subscribe (`*`, logical, `cat/name`), publishes preview instant, handles SSE re-fetch, debounced, auto-reconnect, enable/disable.
- [ ] Cross-tab communication works: editor BC preview updates game in <200ms without PUT, and SSE after PUT updates any tab including after reload.
- [ ] Editor UI has Live Edit toggle and Auto Save toggle with localStorage persistence, status pill showing connected/offline/syncing, debounced PUT (350ms) max 2/sec, preview-only mode when auto-save OFF.
- [ ] Game subscribes to live updates: Tier-1 configs update instantly without reload/regen (fog, lighting ambient/sun/torchColors, chamfer uniforms, corners, pbr/ao/shadows/raymarch/rendering/palette style, player, discovery, map). Verified via `window.game.cfg` change and canvas visual or uniform.
- [ ] Tier-2 materials-proc and material atlases rebuild debounced 400-600ms via `generateMaterialAtlases` + `reuploadAtlases`, no WebGL error, no memory leak.
- [ ] Tier-3 generator and sprite generation changes show "Regen required (R)" banner, do not auto teleport, press R regenerates with new config.
- [ ] No regression when Live OFF: Save+R workflow identical to Task6.
- [ ] Game HUD toast for live updates, live badge indicator green/gray.
- [ ] Unit tests pass: live-config reverse lookup, tier classification, broadcast logic, game apply logic.
- [ ] E2E: new `live-edit.spec.js` with multi-page context proves fog live via PUT+SSE, chamfer live via API, materials-proc atlas rebuild, generator regen banner, editor toggle persistence, no console errors, no shader failures. Existing E2E still pass.
- [ ] Screenshots generated via Playwright in `tasks/live-edit/screenshots/` showing toggle, fog tweak, flicker tweak, chamfer tweak, editor badge, game indicator.
- [ ] ES modules only, no new runtime deps, vanilla JS, no emoji in code.

---

## 11. Out of Scope

- Collaborative editing OT, conflict merge UI beyond simple reload prompt.
- Hot-reload of GLSL shader source (uniforms only).
- Undo/redo stack.
- Auto-save of preview-only changes after browser close.
- WebSocket server.

---

## 12. Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html + /editor.html
# Tab A: http://localhost:8000/game.html
# Tab B: http://localhost:8000/editor.html -> assets/config/lighting/fog.json -> enable Live Edit + Auto Save
# Drag base 0.06 -> 0.18 -> game fog dense live
# Drag materials-proc walls.bevelDepth 0.22 -> 0.4 -> see chamfer deepen after rebuild
# Disable Live Edit -> drag fog -> game does NOT update until Save + R (backward compat)
# E2E: npm run test:unit && npm test # includes live-edit.spec multi-page
```
