# Live-Edit — Task 7 (Design Final Draft)

**Goal:** Unity-like live tuning between Editor and Game tabs — tweak JSON slider, see game update <500ms without reload, then Save persists.

## Architecture Summary

### Server (`server.js`)
- New SSE endpoint `GET /api/watch` with `text/event-stream`, heartbeat 25s, client Set.
- On PUT `/api/assets/<cat>/<name>`, after write, broadcast `event: asset-updated` JSON `{type, category, name, path, timestamp}` to all SSE clients.
- CORS already enabled, safeCategory checks retained.
- Optional `fs.watch` behind env flag for external file edits.

### Client Live Manager (`src/config/live-config.js` NEW)
- Singleton `LiveConfigManager`:
  - `BroadcastChannel('dungeoneers-live-edit')` for instant <200ms preview (editor→game).
  - `EventSource('/api/watch')` for persisted updates across reloads, multi-window.
  - Fallback to `localStorage` storage event if BC unavailable, plus polling fallback every 5s.
  - Reverse lookup `REVERSE_MAP` from `CONFIG_PATHS` to map path → logical names.
  - Subscribe pattern `*` | logical | `cat/name` → callbacks, returns unsubscribe.
  - `publishPreview(cat,name,data)` → BC post + CustomEvent.
  - `handleSSE` → `getAsset(cat,name)` re-fetch then notify.
- `CrossTabBus` wrapper abstracting BC/localStorage/noop.
- Tier classification `T1 instant` (uniforms), `T2 atlas rebuild` (materials-proc), `T3 regen-required` (generator).

### Editor (`editor.html` + `editor.js`)
- Toolbar adds: Live Edit toggle (localStorage `dungeoneers-live-enabled`), Auto Save toggle (`dungeoneers-live-autosave`), status pill connected/offline/syncing/preview.
- On `setByPath` (oninput): if Live ON → `liveManager.publishPreview` instant + debounced PUT 350ms if AutoSave ON.
- Raw JSON tab also triggers live on valid JSON.
- On external SSE for current file: if dirty show banner "External change — Reload?", else auto-reload.
- Preview-only mode (AutoSave OFF) → BC only, badge "Preview (unsaved)".

### Game (`core/game.js` + `renderer-gpu.js` + `systems/lights.js`)
- Game enables live manager subscriber (always listening, publishing not needed).
- `_applyLiveConfig({logical, category, name, data})` routes via tier table:
  - **T1**: `fog` → `renderer.updateFog`, `lighting` → `lightManager.setConfig`, `sprites/light-types` → update existing lights flicker/intensity/radius/color, `chamfer/corners/pbr/ao/shadows/raymarch/rendering/palette/player/discovery/map/debug` → renderer uniform cache update or direct setter.
  - **T2**: `materials-proc` → debounced 400-600ms queue: fetch walls/floors/ceils mats + new proc → `generateMaterialAtlases` → `renderer.reuploadAtlases(atl)` replacing GL textures, toast HUD.
  - **T3**: `generator`, `sprites.generation pools` → set `_regenRequired=true`, show banner "Regen required (R)", optionally auto-regen if debug flag.
- Renderer new methods: `updateFog`, `updateChamfer`, `updateCorners`, `updatePBR`, `updateAO`, `updateShadows`, `updateRaymarch`, `updateRendering`, `reuploadAtlases`, generic `updateConfig`. Mutable `_cfgCache`.
- LightManager new helpers: `updateFromSpritesConfig`, `updateFromLightTypes`.
- HUD live indicator: `<div id="live-indicator">` green dot when SSE connected.
- `window.game.liveManager` exposed for E2E, `window.game.cfg` mutated live.

### Persistence & Conflict
- AutoSave ON: BC preview + debounced PUT = disk persisted.
- Preview OFF: BC only, unsaved.
- Last-write-wins for PUT.
- External change while dirty → banner prompt.

## Testing Plan (Playwright Two Tabs)

### Unit
- `live-config.test.js`: reverse lookup, subscribe pattern, tier classification, debounce, CrossTabBus fallback.
- `server-live.test.js`: SSE broadcast format, safe checks.
- `game-live-apply.test.js`: `_applyLiveConfig` mutates correct fields, atlas rebuild debounced.

### E2E Multi-Page (`live-edit.spec.js`)
Uses `browser.newContext()` → two pages sharing BC and origin.

- **SSE health check**: `GET /api/watch` returns event-stream header.
- **Editor toggle UI exists & persists**: localStorage after reload.
- **Fog live via API PUT → SSE → game**: 
  1. Game page load, wait `window.game.renderer.isReady()`, capture initial `cfg.fog.base`.
  2. Enable live in game localStorage, reload.
  3. Second page (editor context) does `fetch PUT fog.base +0.12`.
  4. Game `waitForFunction` for `cfg.fog.base` within 5s.
  5. Reload game, assert persisted.
  6. Cleanup revert PUT.
- **BC preview-only instant**: editor page `publishPreview` via `getLiveConfigManager().publishPreview(...)` without PUT, game updates <500ms, reload reverts.
- **Chamfer live uniform**: similar PUT `config/geometry/chamfer` size.floor, game updates `cfg.chamfer.size.floor`.
- **Materials-proc atlas rebuild**: PUT `walls.bevelDepth +0.12`, wait for HUD "materials" toast, verify no WebGL error (check `gl.getError` via evaluate or no console error), canvas non-empty.
- **Generator regen-required banner**: PUT `config/gameplay/generator` (e.g. roomCount), verify banner appears, not auto regen.
- **Debounced PUT count**: intercept `page.route('**\/api/assets/**')` counting PUTs during 10 rapid slider simulations → <=3.
- **Regression live OFF**: toggle OFF, PUT fog, verify game does NOT update until R.
- **No console errors**: `page.on('console')` filtering error, ensure none.

Manual checklist: fog, ambient sun, chamfer floorSize, materials bevelDepth, torch flicker amountMax — all live.

## Phases
0. Server SSE
1. Client Live Manager + tiers
2. Editor UI live toggle + BC + debounced PUT
3. Game T1 hot reload (fog, chamfer, lighting)
4. T2 atlas rebuild
5. T3 regen banner
6. Tests + screenshots + docs

See `instruction.md` for full detailed plan.

