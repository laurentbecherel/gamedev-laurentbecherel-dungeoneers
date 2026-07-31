# Live-Edit — Dungeoneers Task 7 (ROUGH DRAFT)

> Current workflow: edit JSON in editor.html -> Save (PUT /api/assets/...) -> go to game.html -> press R to reload/regen to see changes. Slow for fine-tuning flicker, chamfer roughness, fog, bevelStart, etc.

> Goal: Unity-like experience with two Chrome tabs open (editor + game) — tweaking a value in editor immediately reflects in running game without reload. Then explicit Save persists to .json. Or alternatively, live tweak IS save, but reversible.

## 1. Player/Designer Intent

- As a designer I want to fine-tune light flicker speed/amount, torchColors, chamfer floorSize/ceilingSize/wallSize, roughness multiplier of chamfers, materials-proc bevelStart/bevelDepth/cornerRound/roundness/groutDepth/normalFactor, fog base/squared/color, ambient/sun, etc while watching game tab.
- Workflow: open editor.html and game.html side-by-side. In editor, enable "Live Edit". Drag slider for `flickerAmount` or `materials-proc chamfer roughness` -> game tab updates within ~100-300ms.
- If Live Edit OFF, old behavior (requires Save + R) must still work. No regression.
- When Live Edit changes happen, they are ephemeral in game memory unless saved. Option: "Auto Save" toggle vs "Live Preview (unsaved)" + Save button commits to disk. Decide architecture. Prefer:
  - Option A (Recommended for MVP): live edit = auto save (every tweak does PUT). Simple. Game gets notified via server. This matches current Save = PUT semantics already. Risk: spam PUT.
  - Option B (Better UX): Editor holds draft, broadcasts via BroadcastChannel or via server transient endpoint, game applies temporary override. Only when hitting Save does it persist. Allows revert.
  - Hybrid: Implement both - immediate broadcast via BroadcastChannel/localStorage for 0 latency, plus debounced PUT after 500ms if Auto Save enabled. Provide revert button.
- Must support many configs: lighting, sprites, light-types, rendering, pbr, pom, ao, chamfer, corners, raymarch, fog, materials-proc, palette, player, generator, discovery, map.

## 2. Architecture — Proper Long-Term System

### Server (`src/server/server.js`)

Current server: simple HTTP serving static + REST GET/PUT /api/assets/<category>/<name>. No live notify.

Needed:
- Add SSE endpoint `GET /api/watch` or `GET /api/assets/watch` that keeps connection open and emits JSON events on asset changes.
- On PUT success, server writes file and then broadcasts to all SSE clients: `{ type: 'asset-updated', category, name, path, timestamp }`. Optionally include data payload, or client re-fetches via GET for simplicity.
- Manage SSE clients list: set, on close remove. Use `res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive', ... })`
- Also consider BroadcastChannel not needing server, but SSE is source of truth across browsers and server restarts. Should support fallback polling every 2s if SSE disconnects.
- Security: keep existing safeCategory/safeName checks. SSE endpoint no auth needed for local dev.
- Alternative: WebSocket — but SSE simpler for one-way broadcast. Don't add ws deps unless needed. Keep vanilla Node http.
- Also add `GET /api/live-config` or version/etag support to avoid re-fetching same? Could use If-None-Match.
- Keep file watcher optional: if editor edits file directly on disk (not via API, e.g. external IDE), server could watch assets dir via fs.watch and broadcast. Nice to have but not required for MVP — only API PUTs need broadcast.

### Client Config Layer (`src/config/config.js`)

Current: _cache per logical name, fetch candidates, clone. No live.

Needed new architecture:

- `ConfigLive` or `LiveConfigManager` class:
  - owns current cache (reuse _caches)
  - subscribe to SSE: `new EventSource('/api/watch')` (or '/api/assets/watch' to stay under /api/assets prefix? Better /api/watch)
  - on message `asset-updated`, fetch new asset via `getAsset` or `getConfig` logical? Invalidate cache for that logical name (reverse lookup from path to logical names using CONFIG_PATHS)
  - dispatch `CustomEvent` on window: `dungeoneers-config-live-updated` with detail { logicalName, category, name, data }
  - also expose `onLiveUpdate(logicalName|category/name|* , callback)` registration.
  - debounce handling: if many rapid PUTs, coalesce.
  - provide `enableLive() / disableLive()` and auto-reconnect logic.
  - should work in both game.html and editor.html contexts (editor also might want to know external edit?).
  - also consider BroadcastChannel fallback: `new BroadcastChannel('dungeoneers-live-edit')` — when editor does live tweak it posts message immediately without waiting server SSE. Game tab listens. This gives sub-100ms latency even if server PUT still pending. Server SSE remains source of truth for persistence across reloads.
  - Need polling fallback: setInterval re-fetch asset list or check etag if EventSource not supported.

- Keep backward compat: existing `getConfig`, `getAsset` still work sync cache first, but now cache may be invalidated externally, so they should expose `invalidateCache` usage already exists. Use it.

- Add utility `getLiveConfigManager()` singleton.

### Editor (`src/editor.js`)

Current: generic tree, visual form building number inputs with range sliders for 0..1, color picker for [R,G,B], save via PUT.

Needed for live-edit:

- Add topbar UI:
  - Toggle: `Live Edit` [ON/OFF] — checkbox. When ON, any `oninput` change triggers live broadcast + debounced PUT.
  - Toggle: `Auto Save` [ON/OFF] — if ON, live edit auto persists; if OFF, live edit is preview only and Save button still required.
  - Status pill showing connection state to SSE / BroadcastChannel.
  - Possibly indicator "Unsaved changes" count.

- When `setByPath` is called (visual editor input), if live enabled:
  - Immediate: post via BroadcastChannel `postMessage({type:'preview', category, name, data: clone(currentData)})`
  - Debounced PUT: schedule `saveAsset` after 350ms idle (use lodash-like debounce custom). Show status "Live syncing..."

- Also when receiving SSE `asset-updated` from other tab (or same tab external edit), reload that asset if not currently dirty? Simple: if current editing same file and has unsaved changes, prompt or merge.

- Keep raw JSON tab in sync: if user edits raw, also trigger live.

- Need to handle performance: deep clone each keystroke expensive; use structuredClone or JSON parse trick but ok for small JSONs.

### Game (`src/core/game.js` + renderers + systems)

Current: Game loads all configs once at init via `getAllRenderConfigs` and merges into single object. Then renderer init gets config. No dynamic updates.

Needed:

- Game subscribes to live config manager: `liveManager.on('*', (event) => { handle live update })`

- Must categorize configs into hot-reloadable vs regen-required:

  - **Instant uniform update (no atlas regen, no map regen):**
    - `lighting`: ambient.level/color/worldMul, sun dir/intensity/color, torchColors palette, maxLights (partial)
    - `fog`: base, squared, color
    - `sprites`, `light-types`: flickerSpeed/Amount, intensity, radius, color, phase variance — just update LightManager instances without re-placement
    - `rendering`, `pbr`, `ao`, `shadows`, `raymarch`, `chamfer`, `corners`: many uniforms are already read each frame via _resolveConfigValue but some are cached; need to make renderer read live and update uniform values without rebuilding FBOs
    - `discovery`, `map`, `player`, `debug`: hud timeout, player moveSpeed/turnSpeed, bob presets

  - **Requires async atlas/procedural rebuild but NOT full map regen:**
    - `materials-proc`: bevelStart, bevelDepth, cornerRound, roundness, groutDepth, normalFactor, heightScale — triggers `generateMaterialAtlases` async and texture upload. Should be queued, not per frame. Show loading indicator.
    - `palette`, `pom`, `chamfer` textures if they affect atlas.

  - **Requires dungeon regen (R):**
    - `generator`: roomCount, zone progression, sprite placement counts/minTorchDist/corridorBias etc. If these change live, we could show HUD "Regen required press R" or auto-regen after debounce. Better to require explicit R to avoid teleporting player, but indicator.

- Implementation pattern for Game:

```js
this._liveUnsub = liveConfigManager.subscribe('*', async ({ logical, data }) => {
  const cfg = this.cfg; // merged
  // update merged cache
  cfg[logical] = data;
  await this._applyLiveConfig(logical, data);
});
```

- `_applyLiveConfig(logical, data)` switch:

  - if fog: this.renderer.updateFog(data) — need method to just update fog uniform cache
  - if lighting: this.renderer.lightManager.updateFromConfig(data) + update torchColors
  - if sprites: LightManager.setFromMap? or update flicker params per sprite without re-placing
  - if materials-proc: trigger async atlas rebuild: `const atl = generateMaterialAtlases(..., data); this.renderer.reuploadAtlases(atl)`
  - if chamfer/corners: update uniform cache in renderer
  - if rendering/pbr/ao etc: this.renderer._resolveToggles(newCfg) or update config reference and next frame will pick up if reading from cfg each frame

- Need to expose `renderer.updateConfig(partialCfg)` that does minimal work.

- Player: `player.setConfig(newCfg)` already exists — call live.

- Discovery: update animationDuration, trail color etc via `discovery.updateConfig` new method.

- Need to ensure light flicker tuning appears instant: the flicker function uses flickerSpeed/Amount per light — these are per-light properties from dungeon.sprites but also could be globally scaled via light-types.json? For task 6, flickerSpeed/Amount stored per sprite instance generated deterministically from config ranges. Live editing range should affect: either existing lights update proportionally, or re-randomize with same seed but new range. Simpler: on generator config live update, show regen indicator, not instant. But for light-types.json archetypes, if torch archetype changes flicker base, apply to all existing lights of that type.

- Also need to support roughness multiplier of chamfers: where is chamfer roughness? config/geometry/chamfer.json contains rough? Should be live uniform.

- Need HUD indicator when live update applied: e.g., small toast "Live: fog updated".

### Optional Advanced: Material Live Rebuild

- Currently `generateMaterialAtlases` uses wall/floor/ceil JSONs + proc config. It builds canvas textures sync but heavy.
- Provide debounced rebuild queue (500ms) so slider drag doesn't rebuild 60 times.
- Use Web Worker? Not needed for MVP but architecture should allow.

### Persistence Semantics

- Decide: live edit == save vs preview.
- Proposed final UX:
  - Toggle `Live Preview` (BroadcastChannel only, no PUT) -> game updates but disk not written. "Save" button persists currentData.
  - Toggle `Live + AutoSave` (BroadcastChannel + debounced PUT) -> tweak immediately visible AND saved to disk, so reload keeps it.
  - Status: if preview-only, show "Unsaved live preview active" warning.
- For initial implementation, implement AutoSave mode (simpler) and keep architecture open for preview-only via BroadcastChannel.

### Testing

- Unit:
  - ConfigLive manager invalidate logic: CONFIG_PATHS reverse lookup
  - Server SSE: broadcast on PUT
  - Game _applyLiveConfig handles known types, no throw on unknown
  - Materials rebuild debounced

- E2E:
  - Open game, open editor in second tab/page, change fog.json via PUT API directly (simulate editor), expect game canvas to change (maybe fog color uniform changes) without reload — check via window.game.cfg.fog or renderer uniform or visual pixel diff after action.
  - Test BroadcastChannel path: editor posts preview, game receives and updates config within 500ms.
  - Existing E2E should still pass with live disabled.

### Security & Performance

- No new deps. Use vanilla EventSource, BroadcastChannel, fetch.
- Debounce PUT to max 2 per second per file.
- SSE clients limited, auto-close on page unload.
- No memory leak: remove listeners on Game dispose.

### Files to Create/Modify

- `src/server/server.js`: add SSE endpoint, client set, broadcast fn, call on PUT, handle fs.watch optional.
- `src/config/config.js`: add ConfigLiveManager, reverse lookup, EventSource, BroadcastChannel, subscription API, singleton.
- `src/config/live-config.js` (NEW): separate module for LiveManager to keep config.js clean — or extend config.js directly.
- `src/core/game.js`: integrate live manager, _applyLiveConfig, HUD toast.
- `src/render/renderer-gpu.js`: add `updateConfig`, `reuploadAtlases`, `updateFog`, `updateLighting`, expose methods to update uniforms without full reinit.
- `src/systems/lights.js`: method `updateFromConfig`, `updateFlickerParams`
- `src/world/materials.js`: maybe export async rebuild helper or keep existing but make it reusable live.
- `src/editor.html` + `src/editor.js`: add live toggle UI, BroadcastChannel, debounced save, status.
- `src/ui/ui.js` or `src/style.css`: live indicator badge in game.html.
- `src/game.html`: add live badge element.
- Tests: `tests/unit/live-config.test.js`, `tests/e2e/live-edit.spec.js`

### Out of Scope

- Multi-user collab editing (last write wins is ok for local dev)
- Undo/redo history (could be future)
- WebSocket full duplex (SSE enough)
- Guarding against rapid atlas rebuild causing flicker — debounce is enough

### Success Criteria

- Designer can have two tabs: editor left, game right. Tweak fog base from 0.06 to 0.12 slider, game fog thickens within <500ms live without pressing R or reload.
- Same for chamfer floorSize, light flickerAmount, etc where applicable instant or <1s with atlas rebuild.
- Toggling Live Edit OFF returns to old Save+R workflow, no regression.
- Server SSE broadcasts correctly, no memory leak.
- No console errors, E2E existing passes, new live-edit E2E proves live update.

### Running Notes

```bash
# Task folder already on main
cd src && npm install
npm start # http://localhost:8000/game.html + editor.html
# Open two tabs chrome:
# http://localhost:8000/editor.html -> assets/config/lighting/fog.json -> toggle Live ON
# http://localhost:8000/game.html -> walk around, drag fog base slider in editor -> see fog change live
# Save button persists
```

This is rough — refine into final spec during task implementation.
