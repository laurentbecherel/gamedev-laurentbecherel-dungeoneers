# Live-Edit System — Dungeoneers Task 7

> Right now the designer workflow is: edit a `.json` file in `editor.html` → press Save → switch to `game.html` → press R to regenerate / reload to see the change. This is slow when fine-tuning subtle values like light flickering intensity, fog density, or the roughness and bevel shape of walls.

> Goal: achieve a Unity-like live tuning loop. With two Chrome tabs open side-by-side (Editor on the left, Game on the right), changing a value in the Editor should be visible in the running Game within a short moment, without requiring a full reload. Saving should still persist the value to disk so that a later reload keeps it — unlike Unity play-mode where tweaks are lost unless saved.

## 1. Designer Intent

As a designer I want to:

- Open `editor.html` and `game.html` in two tabs of the same browser (same origin) and keep them both running.
- In the Editor, enable a live-edit mode. While live-edit is enabled, tweaking values like light flicker speed, flicker amount, torch colors, chamfer sizes for floor / ceiling / wall, fog density and color, ambient and sun properties, materials-proc fields that control bevel and roughness, etc, should update the Game view live.
- Understand clearly whether my tweak is only a preview or already persisted to disk. Ideally there is a way to see live preview instantly, and then commit to disk explicitly, or have an auto-save option that debounces writes. You can choose a persistence model that is intuitive and efficient for long-term development, but it must be documented.
- When live-edit is OFF, the old workflow must remain exactly the same: editing requires explicit Save and then pressing R (or reloading) to see changes. No regression for players or for the existing debug toggles (1-8, M, R, G, V/B, P).

The intent is *not* to rebuild the entire dungeon every time a render parameter changes. The system should distinguish which configs can be hot-reloaded instantly, which need a heavier but still live rebuild (for example procedural material atlases), and which fundamentally change level topology and therefore require an explicit regeneration.

## 2. Project Structure

This task touches the existing data-driven architecture in `src/`:

- **Server** — currently a vanilla Node `http` server serving static files and exposing `GET /api/assets` and `GET/PUT /api/assets/<category>/<name>` for JSON persistence. It has no push notification today.
- **Config loader** — `src/config/config.js` holds a cache per logical config name (like `fog`, `lighting`, `chamfer`, etc) mapping to one or more candidate file paths, with helpers `getAsset`, `saveAsset`, `invalidateCache`, `getAllRenderConfigs`.
- **Editor** — `src/editor.html` + `src/editor.js` builds a hierarchical tree from the asset list and renders a visual form (number inputs with sliders, color pickers, toggles). Save does a PUT.
- **Game orchestration** — `src/core/game.js` loads all configs once at startup, merges them, generates the dungeon, creates `GPURenderer`, `Player`, `DiscoveryManager`, `UI`, and drives the loop.
- **Renderer** — `src/render/renderer-gpu.js` builds procedural PBR atlases from material JSONs + proc config, creates GL textures, compiles shaders, and draws each frame reading many values from config (fog, lighting, chamfer, corners, shadows, etc). Currently it assumes config is static after init.
- **Light system** — `src/systems/lights.js` owns sun, ambient, and a list of point lights created from dungeon sprites, with organic flicker logic per light. It can update from a new config but currently only does so at init / on map regen.

You may create new modules inside `src/config/` or elsewhere to keep responsibilities clean, and you will likely need to modify server, config, editor, game, renderer, lights, discovery/player/map UI, plus styles.

## 3. Live-Edit Behavior

### Cross-tab communication

The Editor and Game run in separate tabs. When the Editor tweaks a value, the Game should learn about it quickly without hammering the server with constant polling.

Think about native browser primitives that allow same-origin tabs to talk (for instant preview) and about a server push mechanism so that even a tab that was reloaded later learns that a file changed on disk. If you introduce a server push endpoint, it must coexist with the existing REST API, respect the existing path-traversal safety checks, and clean up connections on close to avoid leaks. No new runtime dependencies should be added — stay on vanilla Node built-ins and standard Web APIs.

### Editor

- The Editor should have a clear UI to turn live-edit on and off, and ideally a separate control for whether live tweaks are persisted automatically or only previewed until explicit Save. Persist the toggles in `localStorage` so the choice survives reload.
- While live is on, changing any field (including raw JSON when valid) should broadcast the current file content to other tabs immediately for preview. If auto-save is on, the same change should be persisted to disk via PUT but debounced / throttled so dragging a slider does not flood the server with dozens of writes per second. Show some status (connecting, connected, syncing, offline, preview-only) so the designer knows the link state.
- If another tab (or an external editor) saves the same file that the current Editor is editing, the Editor should notice. If the current file is not dirty, it can auto-reload; if it is dirty, it should warn and offer to reload rather than silently overwriting.
- The live indicator text and status pill should not require an extra library.

### Game

- The Game is a subscriber: it should listen for live config updates and apply them without requiring a full reload.
- Not all configs have the same cost:
  - **Instant visual params** that are just shader uniforms or light properties: fog, ambient and sun, chamfer trim and shading, corner rounding flags, player movement and bob, discovery trail appearance, map colors, debug HUD. These should be hot-reloadable in place — updating the merged config and telling the renderer or subsystem to use new values next frame.
  - **Material appearance** that affects procedural texture generation (for example bevel start / depth, corner rounding of bricks, grout depth, normal strength, roughness variation, height scale). This needs an asynchronous atlas rebuild and texture upload, but not a dungeon regeneration. Debounce it so rapid slider movement triggers only one rebuild after the user pauses.
  - **Level topology** that changes dungeon layout, room counts, or sprite placement counts and rules. Changing these should *not* teleport the player or rebuild the level implicitly. Instead show a non-intrusive banner that regeneration is required (press R) and clear it after regeneration.
- The Game should give subtle feedback when a live update was applied (for example a short HUD toast). When live-edit is disabled, the Game should show *no* badge or indicator at all — the live UI should be completely absent unless live is active.
- Existing behavior (R regen, M map, 1-8 toggles, grid vs free FPS, view bob presets) must stay working.
- Ensure cache invalidation: after a disk change, a subsequent regen must fetch fresh data from the server, not a stale in-memory cache.

### Renderer, Lights, Materials

- The renderer currently reads many values from config each frame via helper lookups, but some are cached at init. Make it possible to update those values live without reconstructing FBOs or recompiling shaders.
- For material atlas live updates, provide a path to replace GL textures with newly generated atlases (based on current material definitions and proc config) without leaking old textures.
- Light manager should be able to update sun / ambient from a new lighting config, and update existing point lights (intensity, radius, flicker speed/amount, color) from new sprite / light-type definitions without recreating the whole light list or replaying placement.
- Discovery, player, and map UI should be patchable with new config values if their dedicated JSON changed.

## 4. Persistence Semantics

You need to decide and document a model that fits the "Unity but with save" intent:

- One reasonable model: live-edit equals auto-save — every tweak does a debounced PUT, server writes file and notifies other tabs, so persistence is immediate.
- Another: preview-only — live tweaks are broadcast cross-tab but not written until Save is pressed. This allows revert on reload.
- A hybrid is also acceptable: instant preview via cross-tab channel for zero-latency feedback, plus debounced auto-save if the user enabled it, with a visual distinction between preview and saved state.

Whatever you choose, handle conflicts: last-write-wins is acceptable for local development, but avoid losing the designer's unsaved work silently when an external change arrives.

## 5. Architecture Quality

- Keep the codebase ES modules, no new runtime dependencies, no emoji in code.
- Follow existing patterns: config mapping in `config.js` is the single source of truth for file paths; avoid duplicating path logic elsewhere.
- Avoid god classes: keep server concerns (client set, broadcast) in server, cross-tab bus and subscription handling in a dedicated config live module, rendering updates in renderer, light updates in light manager, discovery updates in discovery.
- Avoid magic numbers: all tunable values for live-edit itself (if you introduce timeouts, debounce intervals, heartbeat) should have named constants with sensible defaults.
- Think long-term: the system should easily support future configs added in later tasks without requiring a rewrite.
- No memory leaks: close EventSource, BroadcastChannel, timers on disable / page unload / server request close.

## 6. Acceptance Criteria (intent, not prescribed solution)

- [ ] With two tabs open (Editor + Game), enabling live-edit and changing a fog-related value, a chamfer size, or a light flicker-related value in the Editor is reflected in the Game view within a short time (a few hundred milliseconds for instant params, up to about a second for material rebuilds) without pressing R or reloading the page.
- [ ] When live-edit is disabled, changing a config in the Editor does *not* affect the running Game until Save + R (or reload) is performed — old workflow preserved.
- [ ] When live-edit is enabled, the Game shows some subtle indicator that live is connected; when live is disabled, the Game shows no live indicator at all.
- [ ] A heavy material-related config change (for example a bevel or roundness field) triggers an async rebuild and texture upload without crashing WebGL and without requiring a dungeon regeneration.
- [ ] A generator / topology-related config change does not regenerate the level automatically; instead the Game shows a banner that regeneration is required, and pressing R rebuilds with the new values.
- [ ] No console errors appear during live updates, and existing debug keys and map overlay continue to work.
- [ ] The implementation handles rapid slider dragging efficiently (does not flood the server with unbounded PUTs and does not queue unbounded atlas rebuilds).
- [ ] The server still blocks path traversal and serves assets correctly; any new push endpoint cleans up clients on close and does not leak memory.
- [ ] The solution is built with vanilla JS + browser APIs, no extra runtime dependencies.

## 7. Out of Scope

- Multi-user collaborative editing with conflict resolution beyond last-write-wins and a simple reload prompt.
- Hot-reloading of JS or GLSL shader source code itself.
- Undo / redo history for live edits.
- Persistent preview that survives browser close without ever being saved.
- Audio or gameplay logic changes.

## 8. Running

```bash
cd src && npm install
npm start # http://localhost:8000
# Open two tabs:
# http://localhost:8000/game.html
# http://localhost:8000/editor.html → pick assets/config/lighting/fog.json or geometry/chamfer.json or lighting/sprites.json
# Enable Live (and optionally Auto Save) in editor top bar
# Drag a value in Editor → see Game update live
# Disable Live → drag a value → Game should NOT update until Save + R
```
