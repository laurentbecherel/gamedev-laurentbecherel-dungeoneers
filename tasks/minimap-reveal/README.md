# Task: minimap-reveal

## Description

Adds fog-of-war discovery to the parchment minimap. Instead of spoiling the whole floor on spawn, the map starts almost empty and reveals rooms/corridors as the player physically enters them. When inside a room you see the whole room + its exits, but only 1 tile peek beyond each doorway — never beyond. Walking corridors reveals them incrementally with a 1-tile peek into the next room.

When opening the map (M), newly discovered areas since last open animate in with a retro dithering pop — random/Bayer dots filling over ~400ms, not smooth fade — so you see progress since last check.

A transparent dashed trail (retro gold, low opacity) shows the full walk history across the floor, giving orientation without overwhelming parchment style.

This is the first real exploration mechanic — turning the map from a debug viewer into a gameplay system.

## Why

- **Tension:** Full map removes curiosity. Discovery makes finding stairs/exits earned.
- **Retro feel:** Old dungeon crawlers (Grimrock, Eye of the Beholder) hid automap behind exploration. Dither draw-in reinforces CRT/plotter aesthetic.
- **Orientation:** In 40x40 maze with 1-tile peek, you get lost. Dashed trail solves navigation without giving away topology.

## Implementation (to be filled after gold build)

**Planned modules — clean architecture, no code smell, data-driven via JSON:**
- `world/discovery.js` — `DiscoveryManager` pure logic, single responsibility: holds `discovered[][]`, `discoveryOrder`, `path[]`, `lastMapOpenMaxOrder`, animation timing. Methods `getRoomAt()`, `markDiscoveredAt()`, `addPathPoint()`, `onMapOpened()`, `getAnimationProgress()`. No rendering, no DOM, no globals, deterministic, inject config for peekDistance/radius. Small helpers `_revealRoom/_revealPeek/_revealCorridor`. Node-testable.
- `assets/config/gameplay/discovery.json` — **NEW dedicated file**, editor-tracked via server recursive walk, editable via generic editor without code. Contains `reveal {peekDistance=1, corridorRevealRadius, animationDuration 400, dither {pattern}}` + `trail {color [201,168,76], opacity 0.5, lineWidth, dash [5,4], onlyDiscovered}` + `_readme`. No magic numbers hardcoded in JS.
- `render/map-ui.js` — fog masking + dither animation (`rand < progress` or Bayer) + dashed trail `setLineDash` at 0.5 alpha. Pure rendering, receives discovery + progress, never mutates discovery. Extracted helpers `drawDiscoveredRooms/drawDithering/drawTrail`.
- `core/game.js` — orchestration only: owns DiscoveryManager, reset on init/regen, `_updateDiscovery()` on grid move, M toggle drives `onMapOpened()`. No discovery algorithm inside Game.
- `config/config.js` — add `CONFIG_PATHS['discovery'] = ['config/gameplay/discovery', 'config/discovery']` + `getDiscoveryConfig()` + include in `getAllRenderConfigs()`.
- `assets/config/ui/map.json` — keeps parchment visuals, adds fallback note pointing to new `discovery.json` as primary for backward compat.

**Gold build notes TBD after implementation — commits on branch `task-minimap-reveal`.**

## Avocado vs Claude Performance

TBD — run after gold branch ready, comparing one-shot `instruction.md` runs.

Expected delta: Both need to reason about room containment vs corridor BFS + 1-tile peek invariant. Avocado likely handles pure logic + render masking; failure modes: forgetting to reset on R, leaking undiscovered via 3x3 around peek, animating old cells repeatedly, path drawing across map gaps, not exposing `window.game.discovery` for E2E.

## Trajectory

- Base commit: `93f5769` chore(task4): update commit-hash to beda542 complete edition
- Branch: `task-minimap-reveal`
- Tests: unit `discovery.test.js` + e2e `game-reveal.spec.js`
- Build steps TBD

## Screenshots

To be captured via Playwright after gold build (actual game, not mockups):

- `./screenshots/map-initial-reveal.png` — spawn, M opened, only entrance room + 1 tile peek visible (<30% floor)
- `./screenshots/map-corridor-peek.png` — in room, doorway shows 1 tile into corridor, tile 2 hidden
- `./screenshots/map-room-reveal.png` — after entering second room, two rooms + connecting corridor visible
- `./screenshots/map-dither-animation.png` — mid animation progress 0.4-0.6, dotted filling
- `./screenshots/map-path-trail.png` — dashed transparent gold trail showing walked path
- `./screenshots/map-full-explored.png` — after exploring most of floor, trail covering maze, parchment fully drawn

How to regenerate:
```js
await page.goto("/game.html");
await page.keyboard.press("KeyM"); // open map initial
await page.screenshot({ path: "../tasks/minimap-reveal/screenshots/map-initial-reveal.png" });
await page.keyboard.press("KeyM"); // close
await page.keyboard.press("KeyW"); // walk
// ... walk into corridor/new room
await page.keyboard.press("KeyM");
await page.screenshot({ path: "../tasks/minimap-reveal/screenshots/map-room-reveal.png" });
```

## Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# M = map reveal (only start room), WASD walk to reveal rooms (1 tile peek beyond doors)
# M again = retro dither draw-in for new areas since last open
# Trail = dashed transparent line persists, R = reset
# Editor: http://localhost:8000/editor.html -> assets -> config -> gameplay -> discovery.json -> reveal.peekDistance, animationDuration, trail.opacity/dash/color
# Also: assets -> config -> ui -> map.json -> parchment colors still tunable
```
