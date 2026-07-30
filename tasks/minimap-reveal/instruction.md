# Minimap Reveal & Discovery — Dungeoneers Task 5

> Transform the minimap from a spoiler (whole floor revealed) into a discovery system. Player uncovers the dungeon as they explore rooms and corridors, sees exits but never beyond — only 1 tile peek past a doorway. Opening the map retro-animates newly discovered areas with dithering, and a transparent dashed trail shows the path you've taken.

**Why discovery:** Showing the whole map on spawn kills tension and exploration. Retro crawlers (Grimrock, Eye of the Beholder, early Might & Magic) hid the automap behind exploration — finding the exit felt earned.

**Why retro draw animation:** When you press M, seeing your recent exploration *draw itself* with a crunchy dither pop reinforces progress since last check. Not smooth lerp — think 1-bit dither fill, like an old plotter or CRT revealing pixels.

**Why path trail:** Without full map, players get lost. A subtle dashed line of where you've walked (semi-transparent, retro) gives orientation without overwhelming parchment style.

This task builds on Task 3/4's `world/dungeon/generator.js`, `render/map-ui.js`, `core/game.js`, `entities/player.js`, and `assets/config/ui/map.json`. No new deps, no renderer rewrite, ES modules only.

## 1. Project Structure

You will create/extend `src/`:

- **NEW** `world/discovery.js` — `DiscoveryManager` class owning fog-of-war state (pure logic, no rendering, no DOM, Node-testable, single responsibility)
- **NEW** `assets/config/gameplay/discovery.json` — dedicated, editor-tracked JSON file containing all tunable params for reveal + trail (see §5). Must be discovered by server recursive walk `assets/config/gameplay/` and editable via generic editor without code. This satisfies "settings configurable via editor as .json file" — do not hardcode magic numbers in JS.
- **MODIFY** `render/map-ui.js` — support fog-of-war masking + dither reveal animation + dashed path trail (Canvas2D parchment renderer). No discovery state mutation here, only receives DiscoveryManager + progress.
- **MODIFY** `core/game.js` — own DiscoveryManager, update on player grid move, drive map-open animation timer, pass discovery + animation progress to UI. Orchestration only, no discovery algorithm inside Game.
- **MODIFY** `world/dungeon/generator.js` or `world/map.js` facade — ensure room containment query is available shared (avoid duplication, add without breaking determinism)
- **MODIFY** `config/config.js` — expose discovery config via logical name with primary file `config/gameplay/discovery` and fallbacks for backward compatibility, e.g. `config/discovery`, `config/ui/map`; add accessors like `getDiscoveryConfig()` and include in batch loader so Game merges it
- **MODIFY** `assets/config/ui/map.json` — keep existing parchment colors/layout, but may note that new `discovery.json` is primary for reveal/trail (keep visual fields there)
- **MODIFY** `main.js` if needed to expose debug for E2E (optional, like `window.game.discovery`)
- Tests — unit for discovery logic, E2E for minimap hides undiscovered, reveals on explore, animation observable, trail visible

Existing canvas `id="game-canvas"` stays, map overlay stays fullscreen parchment toggled by M (code `KeyM`). No separate minimap corner canvas.

**Architecture quality requirement (no code smell):**
- SOLID: DiscoveryManager pure, single responsibility (state only). MapUI pure rendering (no mutation of discovery). Game is orchestrator (wiring only).
- No god class, no duplicated room containment logic — centralize room containment helper and reuse from one module.
- No magic numbers — all tunable numbers for reveal + trail (examples: peek distance 1, animation duration, dash pattern, opacity, colors, corridor radius) should come from `discovery.json` with sensible defaults + fallback, not hardcoded in JS.
- Small focused methods, clear naming, avoid long condition chains — extract helpers for distinct responsibilities like room reveal, corridor reveal, peek handling.
- Idempotent discovery, no out-of-bounds writes, no direct `dungeon.grid[y][x]` mutation outside manager.
- Deterministic logic, no `Math.random()` in discovery (only in rendering dither, optionally seeded hash).
- Config via dependency injection: Game passes config to DiscoveryManager and MapUI, not global import.

## 2. Discovery Core Logic — `DiscoveryManager`

**Intent:**
Player spawns in entrance room seeing only that room. As they walk into new rooms/corridors, map unlocks naturally. You always see exits of current room, but never see beyond — only 1 grid square peek past doorway into corridor/room.

**Dungeon representation today:**
- Generated map: 2D grid `40x40` (after Task 4 compact), `0 = floor`, `1 = wall` (check `world/dungeon/generator.js` actual constants)
- `dungeon.rooms` array each `{x,y,w,h,cx,cy}` (x,y inclusive top-left, w,h size)
- `dungeon.grid` or `dungeon.map` — floor/wall array accessible via `dungeon.get(x,y)` or direct 2D access (use existing accessor, don't hardcode field name — inspect file and support both `grid[y][x]` and `map` flat)
- Generator is deterministic seeded; discovery must not affect generation.

**Discovery state:**
- 2D boolean `discovered` same dims as map, init all `false`
- Per-cell metadata: discovery order integer (incremental id when first discovered) or timestamp, to know what's *new since last map open*
- `path` array: ordered list of grid positions visited `{x,y}` — push when player enters a *new* walkable cell (deduplicate consecutive same cell, but keep order even if revisiting? Trail should show full history including backtrack, so push on change, allow repeats to still draw line, but for *map reveal* you need first-time only — two concerns: `path` is walk history, `discovered` is first-time)
- Integer tracking max order already animated last time map opened, initially `0`
- Buffer for newly discovered since last open, computed on map open
- Animation start time nullable — set when map opens
- Methods (names free, behavior fixed):
  - `constructor` / `reset` to init/wipe on generation — signature flexible, e.g. takes dungeon + config
  - `reset(map)` — reinit for new floor on R regen
  - Room containment helper — returns room containing (x,y) or null
  - `isDiscovered(x,y)` boolean
  - Core method to mark discovered at player position — idempotent, returns list of *newly* discovered cells this call
  - Method to append to trail if moved to new grid cell
  - Method on map opened — snapshots current max order, builds list of cells where order > lastMax, saves as pending animation set, updates max, sets start time, returns pending list
  - Method to get animation progress — returns 0..1 clamped, or 1 if no animation
  - `getPath()` returns copy of trail
  - Accessors for newly discovered and all discovered

**Algorithm — interpretation of "unlock as you enter rooms/corridors, see exits, never beyond, only one tile exit beyond":**

When player stands on walkable tile `(px,py)` (floor):

*If inside a room R:*
- Reveal **whole room** interior: all floor cells inside R bounds → discovered. Also reveal perimeter walls: one-tile border around R where map cell is wall — so room's walls become visible.
- For **exit peek**: for each tile on R perimeter that is *floor* (door/corridor entrance) just outside R bounds, reveal:
  - that doorway floor tile itself
  - one more tile beyond in same direction away from room (if floor) — that's the "only one grid square exit beyond" peek. And its immediate surrounding walls (e.g. 3x3 neighborhood) so peek isn't just a floating pixel.
- Do **not** reveal beyond that 1 tile — even if corridor continues, it stays hidden until player actually steps into it.

*If in corridor (no room containing px,py):*
- Reveal locally around player (e.g. 3x3 including diagonal walls) so corridor walls visible.
- Reveal corridor path along walkable corridor limited:
  - One valid approach: BFS/line trace along floor tiles that are *not inside any room* starting from `(px,py)`, limited to a small configurable radius or until hitting a room entrance. At room entrance, apply same 1-tile peek into room (reveal 1 floor tile inside room + surrounding walls) but not whole room.
  - This means walking corridor you gradually uncover corridor, and when you reach a doorway you peek 1 tile into next room, enticing but not spoiling.
- Overall: corridor discovery is incremental stepwise, not whole corridor at once, but each step reveals locally.

Edge cases:
- Starting room: on spawn, mark discovered at start pos → only entrance room + 1 tile peeks visible, not whole floor.
- R regen resets discovery.
- Revisiting rooms does not re-animate old cells, only new ones.
- Walkable check: respect bounds and `isWalkable` from dungeon, don't go out of map.
- Performance: 40x40 tiny, no need to optimize, but avoid O(n²) per frame brute scanning whole grid if possible — use room bounds iteration + small BFS.

Determinism: discovery order must be deterministic given same walk path, but path itself is input driven — no randomness in algorithm itself, only `Math.random()` allowed in *rendering* dither.

## 3. Fog-of-War Rendering — `render/map-ui.js`

Current `MinimapRenderer` draws entire map: rooms, corridors, walls, legend.

New behavior:

- Before drawing a room/corridor tile/wall segment, check if discovered (or for walls, check if adjacent floor discovered — any approach that never leaks undiscovered topology is valid).
- Undiscovered cells: **hidden** — render only parchment background, no room geometry. Legend stays.
- Discovered: normal parchment style.
- Optional subtle brightness for current room vs older rooms — not required but retro-friendly.
- Map must never show undiscovered topology — test verifies that at spawn only ~1 room visible, floor coverage < ~30% of total walkable.
- Keep existing features: layout calc, legend labels, stair arrows, font loading. Must continue working when filtered.

## 4. Retro Reveal Animation — When Opening Map

**Intent:** When you press M, newly discovered areas since last map open "draw" with dithering.

- `Game` handles M toggle: on transition `showMap false→true`, capture pending new cells.
- `Game` loop while `showMap` true computes animation progress from duration and passes to UI.
- `map-ui.js` draw routine: for each pending new cell, draw conditionally based on progress.
  - Retro dither approach (examples, any retro popping look valid):
    - **Random threshold:** for each new cell, deterministic hash of position/order 0..1, if `< progress` draw else skip.
    - **Bayer 4x4 matrix threshold:** ordered dither look.
    - **Checker interleaved:** expanding pattern.
  - Must be visibly retro, not smooth fade. At least "dotted appearing" rather than alpha blend.
  - After animation completes, all newly discovered stay visible until map closed.
- Configurable duration: example 350-600ms is reasonable.
- If player closes map mid-animation, acceptable to snap to done so next open only animates newer cells.

## 5. Path Trail — Dashed Transparent Retro Line

- Store walk history in discovery: every time player grid position changes, push `{x,y}`. Include starting cell.
- Trail length may grow up to number of walkable cells (~200-300). Acceptable to keep all or cap with configurable max.
- Rendering:
  - After drawing discovered rooms/walls, draw trail as polyline connecting `path` in order of visit.
  - Convert grid coords to canvas coords via same transform used for rooms.
  - Style retro: dashed (example `[5,4]` or `[4,4]`), lineWidth ~1.5-2.5px, strokeStyle from config (examples: muted gold, or matching player color but muted), transparent (example opacity 0.45-0.6) to not overwhelm.
  - Break path when distance >2 tiles to avoid line across map on teleport/regen.
  - To avoid leaking undiscovered topology, preferred to draw trail segments only where both endpoints are discovered (either approach acceptable if it doesn't spoil map).
  - Keep trail when map closed/reopened (persistent), reset on R regen.
- Config example (values illustrative, any similar retro values acceptable if configurable):
  ```json
  "trail": {
    "enabled": true,
    "color": [201,168,76],
    "opacity": 0.5,
    "lineWidth": 1.8,
    "dash": [5,4]
  },
  "reveal": {
    "enabled": true,
    "peekDistance": 1,
    "animationDuration": 400,
    "dither": { "enabled": true, "pattern": "random", "dotSize": 2 },
    "undiscovered": { "hide": true }
  }
  ```
  Keep backward compatible: if missing, use sensible defaults.

## 6. Config & Game Integration

**`assets/config/gameplay/discovery.json` (NEW — primary, editor-editable):**
- Dedicated file, must appear under `assets / config / gameplay / discovery.json` in hierarchical editor tree (server recursive walk already supports nested).
- Schema — all fields tunable without code change, example structure:
```json
{
  "_readme": "Minimap discovery/fog-of-war + trail settings. All numbers here, no hardcode in JS.",
  "reveal": {
    "enabled": true,
    "peekDistance": 1,
    "corridorRevealRadius": 4,
    "roomReveal": "entire",
    "animationDuration": 400,
    "dither": { "enabled": true, "pattern": "random", "dotSize": 2, "bayerSize": 4 },
    "undiscovered": { "hide": true },
    "currentRoomBoost": 0.15
  },
  "trail": {
    "enabled": true,
    "color": [201,168,76],
    "opacity": 0.5,
    "lineWidth": 1.8,
    "dash": [5,4],
    "cap": "butt",
    "join": "miter",
    "maxPoints": 1024,
    "onlyDiscovered": true
  },
  "debug": { "logNewRoom": false }
}
```
- Values above are examples — any similar sensible defaults are acceptable if they satisfy intent: e.g. peek distance must be 1 to satisfy "only one tile beyond", animation duration in hundreds of ms, dash approx 5/4, opacity 0.4-0.6, trail color any retro muted color that is configurable.
- `config.js` must expose discovery config via logical name with primary `config/gameplay/discovery` and fallbacks, and provide accessors + batch inclusion.

**`assets/config/ui/map.json` (existing — keep backward compat):**
- Keep existing fields: font family, parchment bg/scan, colors, layout.
- May still contain `reveal`/`trail` as fallback, but new `discovery.json` is primary.

**`core/game.js`:**
- Own DiscoveryManager instance after map generation.
- On `init()` and `regen()` after generating dungeon, initialize discovery for start room only.
- In game loop after player update, detect if player grid cell changed. If changed, mark newly discovered and add path point.
- M toggle handling: when `showMap` becomes true, capture pending newly discovered for animation.
- Pass discovery + animation progress to UI — signatures flexible but discovery must be supplied.
- Preserve existing keys: R regen, M map, 1-8 debug, G grid, V/B bob, P presets.

**`world/discovery.js`:**
- Pure logic, no Canvas2D/WebGL dependency, testable in Node. Deterministic.
- Export DiscoveryManager and room containment helper.

**`render/map-ui.js`:**
- Modify to support fog masking + dither animation + dashed trail
- Signature change acceptable but keep backward compat for tests — if discovery null/undefined, fallback to old behavior (draw all) so existing E2E not broken until updated.
- Should avoid mutating discovery, extract small focused draw helpers.

## 7. Editor Integration + Config Architecture

**Editor configurability (required):**
- New file `assets/config/gameplay/discovery.json` must be auto-discovered by recursive walk and appear as `assets / config / gameplay / discovery.json` in sidebar tree.
- Generic visual editor already renders nested JSON with color pickers for `[R,G,B]`, range sliders for 0..1, toggles — must work for new file without custom tab.
- Save via `PUT /api/assets/config/gameplay/discovery` persists to disk, survives reload and R regen.
- All magic numbers for discovery/trail removed from JS — read from config with fallback defaults if file missing.

**Architecture guidance (no code smell enforced, examples):**
- `world/discovery.js`: no import of rendering or game code (pure). Constructor takes dungeon and/or config via injection. No canvas, no global.
- `render/map-ui.js`: receives discovery + progress — reads but never mutates discovery. Extract focused helpers for distinct render concerns.
- `core/game.js`: owns instances, wiring only. Discovery algorithm not inlined in Game loop — delegate to manager. Avoid duplicated room logic — share helper.
- `config/config.js`: single source for config paths, no hardcoded paths elsewhere.
- Keep loop readable, extract private method for discovery update.
- No hidden side effects: marking discovered returns newly discovered list, does not trigger HUD directly — Game decides HUD.

No custom editor tab required; generic suffices. Dedicated JSON file proves settings are data-driven.

## 8. Tests

**Unit — `tests/unit/discovery.test.js` (Node-testable):**

- Discovery starts all false, after spawn marks start room only, coverage < 30% walkable, not whole map
- Marking inside same room idempotent (second call returns empty newly list)
- Entering new room reveals that room's full interior + perimeter, but not other rooms beyond 1 tile peek
- Corridor case: starting in corridor, small local area revealed, stepping along corridor reveals more corridor but does not reveal entire connected room beyond 1 tile peek until entering room
- Exit peek invariant: when inside room, adjacent corridor tile 1 away is discovered, tile 2 away is NOT (never beyond)
- Path tracking: moving to new cells appends to path, revisiting same cell does not duplicate consecutive
- Reset clears discovery and path
- Animation: capturing pending on map open, advancing max, progress 0..1 clamped
- Edge: out of bounds, wall handling

**E2E — `tests/e2e/game-reveal.spec.js` (Playwright):**

- Game loads, M opens map, initial visible rooms < 30% floor area — no full spoil.
- Walk into corridor then new room, close/open map, newly discovered area larger than before.
- Map opening animation observable within duration.
- Path trail visible after walking, persists across map toggles.
- R regen resets discovery to start room only, path resets.
- No console errors, map still shows legend, parchment colors, stair arrows.

Expose `window.game.discovery` for test verification like Task 4 exposed `window.game.player`.

## 9. Acceptance Criteria

- [ ] `DiscoveryManager` exists, pure, Node-testable, owns discovered state, discovery order, path history, animation timing — no rendering, no DOM, single responsibility
- [ ] **Code architecture good, no code smell:** No god class, no duplicated room containment logic, no magic numbers hard-coded in JS (tunable via `discovery.json` with fallbacks), small focused methods for distinct responsibilities, no direct grid mutation outside manager, no global state, dependency injection via config, deterministic
- [ ] **Dedicated JSON file** `assets/config/gameplay/discovery.json` exists, editor-tracked via recursive walk, editable via generic editor, persists via PUT, contains `reveal` (with peek distance 1, animation duration few hundred ms, dither pattern) and `trail` (enabled, color configurable, opacity ~0.4-0.6, lineWidth, dash) with sensible defaults + `_readme`. `config.js` exposes discovery logical name with accessors + batch inclusion
- [ ] Spawn reveals only starting room + 1 tile peek, not whole floor — coverage limited
- [ ] Entering new room reveals entire room interior + perimeter walls + 1 tile peek at each doorway, but not beyond — peek invariant enforced
- [ ] Corridor walking reveals local area plus incremental corridor + 1 tile peek into adjacent rooms, not whole room until entered
- [ ] `render/map-ui.js` draws only discovered cells, undiscovered stays parchment, newly discovered since last map open animates with retro dithering over configured duration when M opens — no mutation of discovery, focused helpers
- [ ] Path trail drawn as dashed transparent line (retro) showing walk history from `discovery.json` settings, respects `onlyDiscovered` flag, persists across map toggles, resets on R
- [ ] `core/game.js` wires discovery: owns instance, reset on init/regen, mark on player move, path add, M toggle drives animation capture + progress passed to UI — orchestration only
- [ ] No full map spoiler — E2E verifies initial coverage limited and grows after exploration
- [ ] No console errors, WebGL2 still works, existing keys preserved, AZERTY-safe codes
- [ ] Tests: unit for discovery logic, e2e still pass + new reveal specs pass
- [ ] ES modules only, no new runtime deps, no emoji in code, all settings from JSON not hardcoded

## 10. Out of Scope for This Task

- Multiple floors / persistent discovery across floors (reset on R is fine for now)
- Auto-map rotation with player facing
- Minimap corner overlay mode (we stay fullscreen M overlay)
- Full fog-of-war shading in 3D first-person view (only minimap, not 3D scene)
- Minimap panning / zooming UI
- Enemy / item icons on minimap (future)
- Saving discovery to disk / localStorage (in-memory per run is enough)
- Custom editor tabs (generic support is enough)
- Audio

## 11. Running Instructions

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Spawn: M opens map — only entrance room + 1 tile peek visible, rest is parchment
# Walk: WASD (or ZQSD AZERTY) tile steps or free FPS after G, each new room/corridor reveals
# Map: Press M again to close, walk more, press M — new areas dither in retro pop (tunable)
# Trail: Dashed transparent line shows path since spawn, follows discovered corridors
# R regenerates floor, resets discovery to start room only
# Editor: http://localhost:8000/editor.html → assets → config → gameplay → discovery.json → tweak reveal.peekDistance, animationDuration, trail.opacity/dash/color
# Also: assets → config → ui → map.json → parchment colors still tunable
```
