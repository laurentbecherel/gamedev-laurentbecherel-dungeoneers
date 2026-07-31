# Live-Edit — Task 7

**Goal:** Unity-like live tuning between Editor and Game tabs — tweak JSON, see game update live without reload, but with Save persisting to disk.

This task replaces the slow Save+R loop with a proper long-term live-edit architecture for fine-tuning render and light values (fog, chamfer, flicker, bevel, roughness, etc) while watching the game.

## What was implemented

**Server:**
- Added a server-sent event stream endpoint that keeps connections alive with heartbeat and cleans up on close. On every successful PUT to `/api/assets/<cat>/<name>` it fans out an asset-updated notification to all connected clients.

**Client live manager (`src/config/live-config.js`):**
- Singleton manager handling cross-tab instant preview (same-origin BroadcastChannel with localStorage storage-event fallback) and server push for persisted changes, plus polling fallback if push unavailable.
- Reverse lookup from file path to logical config names using `CONFIG_PATHS`.
- Pattern subscription (`*`, logical name, or file path) with status events (offline / connecting / connected / bc-only / polling).
- Distinguishes preview (BC only, not written) vs persisted (PUT + SSE) with debouncing to avoid flooding.

**Editor (`editor.html` / `editor.js`):**
- Live toggle + Auto Save toggle in toolbar with localStorage persistence and status pill.
- On any valid field change (visual form or raw JSON), immediately broadcasts preview to other tabs; if auto-save enabled, does a debounced PUT and notifies via server.
- Detects external changes to the file currently being edited: auto-reloads if clean, warns with reload button if dirty.

**Game (`core/game.js`):**
- Subscribes to all live updates, routes via tier logic:
  - T1 instant (fog, lighting ambient/sun, chamfer/corners/pbr/ao/shadows/raymarch/rendering/palette/player/discovery/map) → updates merged cfg and renderer / subsystem in place.
  - T2 atlas rebuild (materials-proc and material base mats) → debounced async `generateMaterialAtlases` + `renderer.reuploadAtlases`.
  - T3 regen-required (generator, sprite pools generation) → banner "Regen required — press R", no auto teleport.
- Creates live badge that is **hidden entirely when live is OFF** and only shown when live is active, plus regen banner with R button.
- Regen invalidates all config caches so Save+R still fetches fresh after live is disabled.

**Renderer (`renderer-gpu.js`):**
- New `update*` methods for fog, chamfer, corners, shadows, PBR, AO, raymarch, rendering, POM, lighting, plus generic `updateConfig`.
- `reuploadAtlases()` replaces GL textures safely.

**Lights (`lights.js`):**
- Helpers to update existing lights from new sprite / light-type definitions without replaying placement.

**Other:**
- `discovery.js` `updateConfig()` alias, `ui.js` `updateMapConfig()`, styles for badge and banner.

## Verification

- **Unit:** 63 tests pass (config existence, lighting organic flicker, materials, server countItems/traversal/PUT roundtrip/nested slash, new live-config tier/reverse-lookup/subscribe/bus fallback, live-server SSE health + broadcast).
- **E2E:** 11 live-edit tests serial (SSE health via fetch streaming, editor toggles persistence, game badge visible when ON / hidden when OFF, fog live via PUT+SSE, chamfer live, BC preview-only revert, materials-proc rebuild, generator regen banner, live OFF regression). 35 existing game/editor E2E still pass.
- **Manual:** Two Chrome tabs editor + game side-by-side, enable Live + Auto Save, drag fog base, chamfer floor size, torch flicker — game updates within a few hundred ms (atlas rebuild ~0.5-1s). Disable Live → no update until Save+R, and no badge shown.

## Screenshots
See `screenshots/` folder — editor live controls, game live indicator (only when ON), fog tweak, chamfer tweak, flicker, etc.
