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
- **MODIFY** `world/dungeon/generator.js` or `world/map.js` facade — expose helper `getRoomAt(x,y)` / room containment if not already exported (add without breaking determinism)
- **MODIFY** `config/config.js` — add `discovery` to `CONFIG_PATHS` mapping `['config/gameplay/discovery', 'config/discovery', 'config/ui/map']` fallback chain, add `getDiscoveryConfig()` + `saveDiscoveryConfig()` accessors, add to `getAllRenderConfigs()` batch so Game merges it
- **MODIFY** `assets/config/ui/map.json` — keep existing parchment colors/layout, but add backward-compat fallback note pointing to new discovery.json as primary (optional, keep visual fields there)
- **MODIFY** `main.js` if needed to expose debug for E2E (optional, like `window.game.discovery`)
- Tests — unit for discovery logic, E2E for minimap hides undiscovered, reveals on explore, animation observable, trail visible

Existing canvas `id="game-canvas"` stays, map overlay stays fullscreen parchment toggled by M (code `KeyM`). No separate minimap corner canvas.

**Architecture quality requirement (no code smell):**
- SOLID: DiscoveryManager pure, single responsibility (state only). MapUI pure rendering (no mutation of discovery). Game is orchestrator (wiring only).
- No god class, no duplicated room containment logic (centralize `getRoomAt` helper, reuse).
- No magic numbers — all numbers (peekDistance=1, animationDuration, dash pattern, opacity, colors, 3x3 radius, corridor BFS radius) come from `discovery.json` with sensible defaults + fallback.
- Small focused methods (<30 lines), clear naming, no long if/else chains — extract helpers (`_revealRoom`, `_revealCorridor`, `_revealPeek`, `_isInRoom`).
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
- 2D boolean `discovered[y][x]` same dims as map, init all `false`
- Per-cell metadata: `discoveryOrder` integer (incremental id when first discovered) or `discoveredAt` timestamp/frame counter, to know what's *new since last map open*
- `path` array: ordered list of distinct grid positions visited `{x,y}` — push when player enters a *new* walkable cell (deduplicate consecutive same cell, but keep order even if revisiting? Trail should show full history including backtrack, so push on change, allow repeats to still draw line, but for *map reveal* you need first-time only — two concerns: `path` is walk history, `discovered` is first-time)
- `lastMapOpenMaxOrder` integer — max `discoveryOrder` that was already animated last time map opened. Initially `0`
- `newlyDiscoveredSinceLastOpen` buffer cache — computed on map open
- `animationStartTime` nullable — set when map opens
- Methods (names free, behavior fixed):
  - `constructor(width,height)` or `reset(width,height)` to init/wipe on generation
  - `reset(map)` — reinit for new floor on R regen
  - `getRoomAt(x,y,dungeon)` helper — returns room containing (x,y) or null (check if x in [room.x, room.x+w-1] and y in [room.y, room.y+h-1])
  - `isDiscovered(x,y)` boolean
  - `markDiscoveredAt(px,py,dungeon)` — core algorithm, idempotent, returns list of *newly* discovered cells this call
  - `addPathPoint(x,y)` — append to trail if moved to new grid cell
  - `onMapOpened(nowMs)` — snapshots current max order, builds list of cells where `order > lastMapOpenMaxOrder` up to now, saves as pending animation set, updates `lastMapOpenMaxOrder = currentMax`, sets `animationStartTime = nowMs`, returns pending list
  - `getAnimationProgress(nowMs,duration)` — returns 0..1 clamped, or 1 if no animation
  - `getPath()` returns copy of trail
  - `getNewlyDiscovered()` for renderer
  - `getAllDiscovered()` or direct grid accessor

**Algorithm — interpretation of "unlock as you enter rooms/corridors, see exits, never beyond, only one tile exit beyond":**

When player stands on walkable tile `(px,py)` (floor):

*If inside a room R = getRoomAt(px,py):*
- Reveal **whole room** interior: all floor cells inside R bounds `(x ≤ fx < x+w, y ≤ fy < y+h)` → discovered. Also reveal perimeter walls: one-tile border around R `(x-1..x+w, y-1..y+h)` where map cell is wall — so room's walls become visible, player understands room shape.
- For **exit peek**: for each tile on R perimeter that is *floor* (door/corridor entrance) i.e. `map[fy][fx]==floor` where `fx/fy` just outside R bounds (adjacent to interior), reveal:
  - that doorway floor tile itself
  - one more tile beyond in same direction away from room center (if floor) — that's the "only one grid square exit beyond" peek. And its immediate surrounding walls (3x3 neighborhood) so peek isn't just a floating pixel — show walls around that 1 tile.
- Do **not** reveal beyond that 1 tile — even if corridor continues, it stays hidden until player actually steps into it.

*If in corridor (no room containing px,py):*
- Reveal **3x3** around `(px,py)` including diagonal walls — so corridor walls visible locally.
- Reveal corridor path along walkable corridor limited:
  - Option that satisfies spec: BFS/line trace along floor tiles that are *not inside any room* starting from `(px,py)`, limited to a small radius (e.g. distance 4 or until hitting a room entrance) in each cardinal direction, but stop expanding once encountering a tile that is adjacent to a room (room entrance). At room entrance, apply same 1-tile peek into room (reveal 1 floor tile inside room + surrounding walls) but not whole room.
  - This means walking corridor you gradually uncover corridor, and when you reach a doorway you peek 1 tile into next room, enticing but not spoiling.
- Overall: corridor discovery is incremental stepwise, not whole corridor at once, but each step reveals locally.

Edge cases:
- Starting room: on spawn, call markDiscoveredAt for start pos → only entrance room + 1 tile peeks visible, not whole floor.
- R regen resets discovery.
- Revisiting rooms does not re-animate old cells, only new ones.
- Walkable check: respect bounds and `isWalkable` from dungeon, don't go out of map.
- Performance: 40x40 tiny, no need to optimize, but avoid O(n²) per frame brute scanning whole grid if possible — use room bounds iteration + small BFS.

Determinism: discovery order must be deterministic given same walk path, but path itself is input driven — no randomness in algorithm itself, only `Math.random()` allowed in *rendering* dither.

## 3. Fog-of-War Rendering — `render/map-ui.js`

Current `MinimapRenderer` draws entire map: rooms, corridors, walls, legend.

New behavior:

- Before drawing a room/corridor tile/wall segment, check `discovery.isDiscovered(gridX,gridY)` (or for walls, check if *any* adjacent floor is discovered? Simpler: only draw if discovered flag true for that cell).
- Undiscovered cells: **hidden** — render only parchment background (`#e8dcc4` / `#ddd0b8` scan), no room geometry. No legend entry hiding — legend stays but rooms not drawn appear as parchment.
- Discovered: normal parchment style (rounded rooms, colors, etc as today).
- You may want visual differentiation between *current room* vs *previously discovered* — optional subtle brightness: e.g. current room full opacity, older rooms 0.75 opacity. Not required but retro-friendly.
- Map must never show undiscovered topology — test must verify that at spawn only ~1 room visible, floor coverage < 25% of total walkable.
- Keep existing features: `calcLayout`, swatch fix, legend labels, stair arrows ▲▼, Pixelify Sans font loading via `document.fonts.load`. Must continue working when filtered.

## 4. Retro Reveal Animation — When Opening Map

**Intent:** When you press M, newly discovered areas since last map open "draw" with dithering.

- `Game` handles M toggle: on transition `showMap false→true`, call `discovery.onMapOpened(performance.now())` capturing pending new cells.
- `Game` loop while `showMap` true computes `animProgress = discovery.getAnimationProgress(now, config.reveal.animationDuration)` and passes to `UI.drawMap` / `renderMapUI`.
- `map-ui.js` draw routine: for each pending new cell, draw conditionally based on progress.
  - Retro dither approach (pick one):
    - **Random threshold:** for each new cell, generate random (or deterministic hash `hash2i(x,y)+frame`) 0..1, if `rand < progress` draw, else skip — produces popping dots filling.
    - **Bayer 4x4 matrix threshold:** threshold matrix for ordered dither look, compare `(x%4, y%4)` matrix value /16 < progress.
    - **Checker interleaved:** draw cells where `(x+y+frame)%2` pattern expanding.
  - Must be visibly retro, not smooth fade. At least "dotted appearing" rather than alpha blend.
  - Even after animation completes (`progress=1`), all newly discovered stay visible until map closed.
- Configurable duration: `map.json reveal.animationDuration` ms, e.g. 350-600ms.
- If player closes map mid-animation, animation resets? Acceptable to snap to 1 on close, or continue from start next open for remaining cells. Simplest: on close, mark animation finished (progress=1) so next open only animates newer cells.
- Optional: path trail since last open could also animate growing — but spec says map draws part you've discovered, trail is separate persistent. You may animate trail too, but keep trail fully visible.

## 5. Path Trail — Dashed Transparent Retro Line

- Store walk history in discovery: every time player grid position changes (enters new cell), push `{x,y}`. Include starting cell.
- Trail length may grow up to number of walkable cells (~200-300). Acceptable to keep all.
- Rendering:
  - After drawing discovered rooms/walls, draw trail as polyline connecting `path` in order of visit.
  - Convert grid coords to canvas coords via same transform used for rooms: use existing `calcLayout` or `worldToCanvas` logic.
  - Style retro: `ctx.setLineDash([4,4])` or `[6,3]` dashed, `lineWidth` ~1.5-2px, `strokeStyle` from config (e.g. `#c9a84c` gold or `#8b5e3c` or player green `#2ecc71` but muted), `globalAlpha` 0.45-0.6 transparent to not overwhelm.
  - `lineCap = 'butt'` or `'round'` retro, `lineJoin = 'miter'`.
  - Draw with `beginPath()`, `moveTo(first)`, `lineTo(next)` sequentially. If path has gaps due to teleport/regen, break path (moveTo) when distance >2 tiles (avoids line across map).
  - Trail visible only where discovered? Either draw full trail regardless (simpler) but with transparency, or clip to discovered cells — spec says "see the path you've made, so again, in a retro style, dashed line that indicate all our path in the floor. Have it be transparent to not visually overwhelm." So draw full trail on parchment, but it's okay if trail goes over undiscovered? Better to draw only over discovered to avoid leaking undiscovered topology. So draw trail segments where both endpoints are discovered.
  - Keep trail when map closed/reopened (persistent), reset on R regen.
- Config:
  ```json
  "trail": {
    "enabled": true,
    "color": [201,168,76],
    "opacity": 0.5,
    "lineWidth": 1.8,
    "dash": [5,4],
    "pathCap": "butt"
  },
  "reveal": {
    "enabled": true,
    "peekDistance": 1,
    "animationDuration": 400,
    "dither": { "enabled": true, "pattern": "random", "dotSize": 2 },
    "undiscovered": { "hide": true },
    "currentRoomBoost": 0.15
  }
  ```
  Keep backward compatible: if missing, use sensible defaults.

## 6. Config & Game Integration

**`assets/config/gameplay/discovery.json` (NEW — primary, editor-editable):**
- Dedicated file, must appear under `assets / config / gameplay / discovery.json` in hierarchical editor tree (server recursive walk already supports nested).
- Schema (all fields tunable without code change):
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
- Exact numbers are configurable, but defaults must satisfy spec: peekDistance 1, animation 350-600ms, dash [5,4] approx, opacity 0.45-0.6.
- `config.js` must expose it via `CONFIG_PATHS['discovery'] = ['config/gameplay/discovery', 'config/discovery', 'config/ui/map']` and `getDiscoveryConfig()`.

**`assets/config/ui/map.json` (existing — keep backward compat):**
- Keep existing fields: font family, parchment bg/scan, colors wallDark/gold/player/roles, layout legendHeight/gap/padding/grid minCell, stair sizeFactor.
- May still contain `reveal`/`trail` as fallback for old saves, but new `discovery.json` is primary. Add `note` field pointing to new file.
- Editor must be able to edit both new and old files via generic visual editor (already supports nested).

**`core/game.js`:**
- Own `DiscoveryManager` instance: `this.discovery = new DiscoveryManager(mapW,mapH)` after map generation, or `new DiscoveryManager(dungeon)` signature free.
- On `init()` and `regen()` after generating dungeon, call `discovery.reset(dungeon)` and `discovery.markDiscoveredAt(startX,startY,dungeon)` and `discovery.addPathPoint(startX,startY)` to show starting room only.
- In game loop `_loop(dt)` after `player.update`, detect if player grid cell changed (compare player.getPosition floor vs last). If changed:
  - `const newly = discovery.markDiscoveredAt(newX,newY,dungeon)`
  - `discovery.addPathPoint(newX,newY)`
- M toggle handling: when `showMap` becomes true, `const pending = discovery.onMapOpened(performance.now())` (or `Date.now()`), store animation start, expose progress to UI. When false→true animation start; true→false snap to done.
- Pass to `ui.drawMap(dungeon, player, discovery, animProgress)` and `renderMapUI` or equivalent — signatures flexible, but discovery must be supplied.
- HUD message on discover new room optional: `_showHud('New area discovered')` when newly list non-empty and includes room-sized reveal.
- Preserve existing keys: R regen, M map, 1-8 debug, G grid, V/B bob, P presets.

**`world/discovery.js`:**
- Pure logic, no Canvas2D/WebGL dependency, testable in Node (check `isBrowser()` pattern if needed but should work in Node). Deterministic.
- Export `class DiscoveryManager` and helper `getRoomAt`.

**`render/map-ui.js`:**
- Modify `drawMap(dungeon, player, discovery, animProgress)` or `drawMinimap` equivalent:
  - Signature change acceptable but keep backward compat for tests — if discovery null/undefined, fallback to old behavior (draw all) so existing E2E not broken until updated.
  - Implement fog masking, dither animation using `animProgress` and `discovery.getNewlyDiscovered()` or `discoveryOrder > lastMapOpenMaxOrder`.
  - Implement trail drawing after rooms.

## 7. Editor Integration + Config Architecture

**Editor configurability (required):**
- New file `assets/config/gameplay/discovery.json` must be auto-discovered by `server.js:33 walkJsonFiles` recursive scan — no server code change beyond existing slash-allowed `safeCategory`. It appears as `assets / config / gameplay / discovery.json` in sidebar tree.
- Generic visual editor `editor.js:111 buildForm` already renders nested JSON with color pickers for `[R,G,B]`, range sliders for 0..1, toggles — must work for new file without custom tab.
- Save via `PUT /api/assets/config/gameplay/discovery` persists to disk, survives page reload and R regen (since Game reloads via `getAllRenderConfigs`).
- All magic numbers removed from JS — read from `getDiscoveryConfig()` with fallback defaults if file missing.

**Architecture no code smell (enforced):**
- `world/discovery.js`: no import of `map-ui.js`, `game.js`, `config.js` (pure). Constructor takes width/height or dungeon + config object injection. No canvas, no global.
- `render/map-ui.js`: receives `(dungeon, player, discovery, animProgress, trailConfig)` — reads but never mutates discovery. Extract `drawDiscoveredRooms()`, `drawDithering()`, `drawTrail()` helpers.
- `core/game.js`: owns instances, wiring only. Discovery algorithm not inlined in Game loop — delegate to `discovery.markDiscoveredAt()`. No duplicated `getRoomAt` logic — call shared helper from `world/map.js` or `discovery.js`.
- `config/config.js`: single source for config paths, add `discovery` logical name, no hardcoded paths elsewhere.
- No long methods: `_loop` stays readable, discovery update extracted to `_updateDiscovery()` private method.
- No hidden side effects: `markDiscoveredAt` returns newly discovered list, does not trigger HUD directly — Game decides HUD.

No custom editor tab required; generic suffices. Dedicated JSON file proves settings are data-driven.

## 8. Tests

**Unit — `tests/unit/discovery.test.js` or `world/discovery.test.js` importable in Node:**

- Discovery starts all false, after spawn marks start room only, coverage < 30% walkable, not whole map
- Marking inside same room idempotent (second call returns empty newly list)
- Entering new room reveals that room's full interior + perimeter, but not other rooms beyond 1 tile peek
- Corridor case: starting in corridor, 3x3 revealed, stepping along corridor reveals more corridor but does not reveal entire connected room beyond 1 tile peek until entering room
- Exit peek invariant: when inside room, adjacent corridor tile 1 away is discovered, tile 2 away is NOT (never beyond)
- Path tracking: moving to new cells appends to path, revisiting same cell does not duplicate consecutive, path length grows monotonically or stays
- Reset clears discovery and path
- Animation: `onMapOpened()` captures pending, `lastMapOpenMaxOrder` advances, subsequent `onMapOpened()` without new discovery returns empty, progress 0..1 clamped, after duration returns 1
- Edge: out of bounds, wall cells not marked as discovered via path? Walls on perimeter should become discovered when room discovered, but pure wall map outside dungeon remains undiscovered.

**E2E — `tests/e2e/game-reveal.spec.js` (Playwright):**

- Game loads, M opens map, initial visible rooms < 30% floor area — no full spoil. Check via `window.game.discovery` API or canvas pixel sampling: count parchment vs room color pixels in map canvas.
- Walk forward (W) into corridor then new room (use `KeyW` hold), close/open map, newly discovered area larger than before.
- Map opening animation observable: if using `window.game` expose `discovery.getAnimationProgress()` or canvas `dataURL` changes within 500ms after M open (dither filling). Could capture two screenshots within duration and diff pixels.
- Path trail visible: after walking, M open, canvas shows dashed line pixels distinct color (gold/player). Can check via `window.game.discovery.getPath().length > 1` and optionally canvas `getImageData` contains trail color with alpha.
- Trail persists across map toggles.
- R regen resets discovery: after R, M map shows only start room again, path length reset to 1.
- No console errors, map still shows legend, parchment colors, stair arrows.

Use `KeyM` code presses for map toggle, `KeyW` etc. Expose `window.game.discovery` for test verification like Task 4 exposed `window.game.player`.

## 9. Acceptance Criteria

- [ ] `DiscoveryManager` exists, pure, Node-testable, owns discovered grid, discoveryOrder, path, lastMapOpenMaxOrder, animation timing — no rendering, no DOM, single responsibility
- [ ] **Code architecture good, no code smell:** No god class, no duplicated room logic, no magic numbers (all from `discovery.json`), small focused methods `_revealRoom/_revealPeek/_revealCorridor`, no direct grid mutation outside manager, no global state, dependency injection via config, deterministic (no Math.random in logic)
- [ ] **Dedicated JSON file** `assets/config/gameplay/discovery.json` exists, editor-tracked via recursive walk, editable via generic visual editor, persists via PUT `/api/assets/...`, contains `reveal` (enabled, peekDistance=1, corridorRevealRadius, animationDuration 350-600ms, dither pattern) and `trail` (enabled, color [201,168,76], opacity 0.45-0.6, lineWidth, dash [5,4]) with sensible defaults + `_readme`. `config.js` adds `CONFIG_PATHS['discovery']` + `getDiscoveryConfig()` + included in `getAllRenderConfigs()`
- [ ] Spawn reveals only starting room + 1 tile peek, not whole floor — unit test proves <30% walkable discovered at spawn
- [ ] Entering new room reveals entire room interior + perimeter walls + 1 tile peek at each doorway, but not beyond (2 tiles away hidden) — unit proves peekDistance=1 invariant from config
- [ ] Corridor walking reveals 3x3 plus incremental corridor along direction (configurable radius) + 1 tile peek into adjacent rooms, not whole room until entered
- [ ] `render/map-ui.js` draws only discovered cells, undiscovered stays parchment, newly discovered since last map open animates with retro dithering (random or Bayer) over configured duration when M opens — no mutation of discovery, extracted `drawDiscoveredRooms/drawDithering/drawTrail` helpers
- [ ] Path trail drawn as dashed transparent line (retro) showing walk history from `discovery.json` settings, not overwhelming, respects `onlyDiscovered` flag, persists across map toggles, resets on R
- [ ] `core/game.js` wires discovery: owns instance, reset on init/regen, mark on player move via `_updateDiscovery()`, path add, M toggle drives `onMapOpened()` + anim progress passed to UI, HUD optional on new area — orchestration only, no algorithm inside Game
- [ ] No full map spoiler — E2E verifies initial map coverage limited and grows after exploration
- [ ] No console errors, WebGL2 still works, existing keys R/G/V/B/P/M/1-8 preserved, AZERTY-safe codes
- [ ] Tests: unit 100% for discovery logic (room, corridor, peek invariant, idempotent, path, reset, animation), e2e 47+ existing still pass + new reveal specs pass
- [ ] ES modules only, no new runtime deps, no emoji in code, all settings from JSON not hardcoded

## 10. Out of Scope for This Task

- Multiple floors / persistent discovery across floors (reset on R is fine for now; later Task can persist across levels)
- Auto-map rotation with player facing
- Minimap corner overlay mode (we stay fullscreen M overlay)
- Full fog-of-war shading in 3D first-person view (only minimap, not 3D scene)
- Minimap panning / zooming UI
- Enemy / item icons on minimap (future characters task)
- Saving discovery to disk / localStorage (in-memory per run is enough)
- Custom editor tabs (generic editor support is enough for this task)
- Audio

## 11. Running Instructions

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Spawn: M opens map — only entrance room + 1 tile peek visible, rest is parchment
# Walk: WASD (or ZQSD AZERTY) tile steps or free FPS after G, each new room/corridor reveals
# Map: Press M again to close, walk more, press M — new areas dither in retro pop over ~400ms (tunable)
# Trail: Dashed transparent gold line shows path since spawn, follows discovered corridors
# R regenerates floor, resets discovery to start room only
# Editor: http://localhost:8000/editor.html → assets → config → gameplay → discovery.json → tweak reveal.peekDistance, animationDuration, trail.opacity/dash/color
# Also: assets → config → ui → map.json → parchment colors still tunable, backward compat fallback to discovery.json primary
```

