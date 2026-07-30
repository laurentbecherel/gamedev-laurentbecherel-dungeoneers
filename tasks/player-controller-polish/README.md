# Task: player-controller-polish

## Description
Full FPS controller polish on top of Task 3's WebGL2 raycaster (single-material atlas). Brings back the prototype's authentic **Grimrock grid-step mode** as default ON: discrete tile-to-tile stepping with smoothstep lerp `t*t*(3-2*t)`, hold-to-repeat (0.18 initial / 0.06 repeat), buffered input (0.3s FIFO), 90° cardinal snap N/E/S/W. Plus **Doom free-roam**: WASD/ZQSD + QE turn + mouse look via Pointer Lock API (canvas click), slide collision full→X→Y, diagonal clamp to prevent sprint.

**Figure-8 view bob**: vertical `sin(phase*2)*ampY`, horizontal `sin(phase)*ampX`, roll `sin(phase)*ampRoll + strafe*0.5*ampRoll*0.8`, exponential decay `dt*8`, target 0.7 moving grid / min(1,speed/moveSpeed) free, 5 tunable params `ampY,ampX,ampRollDeg,freq,speedScale` + presets subtle/default/heavy/disabled. Bob applied as `u_bobPixels = offsetY * h * 0.8` (screen pixel shift), lateral via right vector, roll via angle.

**AZERTY-safe**: `event.code` only — forward `KeyW|KeyZ|ArrowUp`, back `KeyS|ArrowDown`, strafe left `KeyA` exclusive, strafe right `KeyD`, turn left `KeyQ|ArrowLeft`, turn right `KeyE|ArrowRight`, debug `Digit1-8` not `key==="1"`. Documented in `systems/input.js CODE_MAP`.

**Config**: `assets/config/gameplay/player.json` v2 — all tunables via generic editor persisting to disk. Toggled via G (grid), V/B (bob), P (presets), R (regen), M (map), 1-8 debug, all via `code`.

## Implementation Highlights
- `entities/player.js`: dual state machine, `setPosition` clears intent `_forward/_strafe/_turn/_mouseDX` to avoid drift after regen, `getPosition()` base height only (bob via uniform avoids double), `getAngle()` raw, `getAngleWithRoll()` legacy, light steady no bob, 8-point + precise AABB slide.
- `systems/input.js`: exclusive code map, hold dict f/b/ls/rs/tl/tr, buffer FIFO only if empty, mouseDX only when !gridMode, blur/visibility clear, pointerlockchange/mousemove.
- `core/game.js`: wires Input, code-only shortcuts, HUD, preset cycling `(P)`, bob offsets to renderer.
- `render/renderer-gpu.js`: `u_bobPixels` uniform, lateral shift via right vector, roll added to angle.

## Tests

### Unit (103 total, 100% pass, 30 in player.test.js for Task4)
```
cd src && npm run test:unit
# 103/103 pass (serial --test-concurrency=1 due to random ports)
```

**Task4 player.test.js 30 tests:**
- spawn, forward, wall block, slide, turn, light, config alias
- setPosition resets lerp, bob, AND input intent
- grid default ON, tryMove blocks wall/allows free, lerp progresses/snaps, turn 90deg facing, toggle snaps center+cardinal
- diagonal clamp prevents sprint
- bob disabled zero offsets, enabled figure-8 non-zero, decays idle, setBobParams merges, presets shape valid
- 8-point collision, mouse look free vs ignored grid
- **Enhanced bob:**
  - figure-8: vertical 2x freq horizontal — quarter phase proof
  - presets subtle<default<heavy, disabled zero, applying via setBobParams
  - roll strafe influence
  - getPosition base height without bob
  - getAngle raw, getAngleWithRoll includes roll
  - light does NOT bob
  - setPosition clears intent
  - speedScale affects phase
  - grid bob target 0.7 moving, decays idle

### Playwright E2E (47 total, 100% pass, 8 in game-controller.spec.js for Task4)
```
cd src
npx playwright test tests/e2e/game-controller.spec.js --reporter=list
# 8/8 Task4, 47/47 all
# Config runs on 8005 to avoid manual 8000 collision (see playwright.config.js)
```

**Task4 E2E:**
1. G toggles grid HUD, V/B toggles bob HUD, P cycles presets HUD
2. head bob observable — `window.game.player.getViewBobState()` exposed for E2E: bobAmount>0, offset non-zero ON, zero OFF while walking
3. presets API — fetch player.json, subtle<default<heavy, disabled zero
4. bob toggle B/V in both grid/free modes, no console errors
5. AZERTY ZQSD works via code mapping, Digit1-8 via code
6. pointer lock click + mouse move + Escape
7. player.json v2 schema via API + editor tree has player
8. CONFIG_PATHS includes player

**How bob is verified as observable:**
Renderer uses `u_bobPixels` shifting fragCoord, lateral via right vector. E2E captures `viewBobOffset` state while holding W: ON produces non-zero offsets, OFF zero. Canvas dataURL length >100 sanity.

## Screenshots
Generated via Playwright 2026-07-30 (actual running game, not mocked):

### Grid Mode ON (Grimrock tile step ZQSD+AE)
![Grid ON](./screenshots/game-grid-on.png)

### Grid Mode OFF (Free FPS WASD+mouse)
![Grid OFF](./screenshots/game-grid-off.png)

### Head Bob OFF while walking (steady)
![Bob OFF](./screenshots/game-bob-off.png)

### Head Bob ON while walking (figure-8 via u_bobPixels)
![Bob ON](./screenshots/game-bob-on.png)

### Mouse Look (pointer lock active after canvas click)
![Mouse Look](./screenshots/game-mouse-look.png)

### Editor showing player.json v2 with bob presets
![Editor Player Config](./screenshots/editor-player-config.png)

To regenerate:
```bash
cd src
npx playwright test tests/e2e/gen-shot.spec.js # we used temporary test, now integrated as manual steps in game-controller.spec.js
# Or use code in generate task:
# await page.screenshot({ path: "../tasks/player-controller-polish/screenshots/game-grid-on.png" })
```

## Video
**Why video?** Head bob figure-8 is best shown as motion, not static screenshot. Task requires video uploaded to PixelCloud, not stored in repo.

**Recorded locally via Playwright video:**
- 640x360 webm, 11s, shows: grid ON tile steps forward/back/strafe/turn, G toggle to free FPS, bob OFF walk steady, V toggle bob ON walk figure-8, P cycles subtle/default/heavy/disabled HUD, canvas click pointer lock + mouse look, R regen.
- Local file (not committed): `src/test-results/record-video-record-Task4-video/video.webm` (320KB) — removed per no-binaries rule, but can be re-recorded:

```bash
cd src
# Create temp test with video: { mode: "on", size: {width:640,height:360}}
# npx playwright test --config=playwright.config.js tests/e2e/record-video.spec.js
# Upload to PixelCloud https://pxl.cl -> get short link
```

**For submission, add to task.toml:**
```toml
videos = ["https://pxl.cl/XXXX", "https://pxl.cl/YYYY"] # full demo + 10s teaser
teaser = "https://pxl.cl/XXXX" # 10s highlight bob ON/OFF
```

And embed in README:
```md
![Demo Video](https://pxl.cl/XXXX)
```

Local generation command used:
```js
test.use({ video: { mode: "on", size: { width:640, height:360 } } });
await page.goto("/game.html");
await page.keyboard.press("KeyW"); // walk
await page.keyboard.press("KeyG"); // grid OFF
await page.keyboard.press("KeyV"); // bob OFF/ON
await page.keyboard.press("KeyP"); // preset cycle
await canvas.click(); // pointer lock
```

## Avocado vs Claude Performance
TBD — draft phase. Expected failure modes: mix roll into yaw (getAngle should be raw), use key not code for AZERTY, missing diagonal clamp, buffer overwrite. All fixed in this task.

## Trajectory
- Unit: 103/103 100% (`npm run test:unit -- --test-concurrency=1`)
- E2E: 47/47 100% on 8005 (`npx playwright test --workers=4`)
- Key fixes: setPosition clears intent, getPosition base height, getAngle raw, game.js code-only, input buffer FIFO, server.test.js random ports to avoid EADDRINUSE from stuck 8000, main.js+game.js expose window.game for E2E bob verification.

## Running
```bash
cd src && npm install
npm start # http://localhost:8000/game.html (manual)
# Playwright uses http://localhost:8005/game.html (auto, see playwright.config.js env.PORT)
# Game loads grid ON. G: toggle grid/free, V/B: bob, P: presets, R: regen, M: map, 1-8: debug (code-based)
```
