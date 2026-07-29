# Player Controller Polish — Dungeoneers Task 4

> Build the full first-person controller feel: Grid-step + Free-roam dual mode, pointer-lock mouse look, and figure-8 view bob with tunable presets. Task 3 delivered 3D with WASD+QE only; Task 4 makes movement feel good.

**Why two movement modes:** The prototype (`gamedev-laurentbecherel-mygame`) shipped both. Grid mode is authentic Legend of Grimrock — discrete tile-to-tile stepping with smooth lerp, hold-to-repeat for continuous chaining, buffered turn for fluid feel, 90° cardinal snapping. Free mode is Doom — analog WASD strafe + QE turn + mouse look with slide collision. Players (and reviewers) should feel both. Grid mode defaults ON for retro authenticity, but G toggles to free FPS for modern feel.

**Why view bob:** Without bob, first-person feels like a floating camera. Prototype's bob is a figure-8 (vertical sin(phase*2) + horizontal sin(phase) + roll sin(phase)) driven by movement speed, with 5 tunable params + presets. Small differences in amp/freq drastically change feel — must be editor-tunable and testable.

This task builds on Task 3's `src/entities/player.js`, `src/systems/input.js`, and `src/assets/config/gameplay/player.json`. No renderer changes beyond exposing bob offsets to shader via uniforms already present (eye offset). No new assets.

## 1. Project Structure

Extend `src/` with modifications:

```
src/
├── entities/
│   └── player.js               # MODIFIED — dual mode, bob, grid lerp, facing, collision 8-point circle
├── systems/
│   └── input.js                # REWRITTEN — keyboard edge detection, hold timers, buffer, mouse delta, pointer lock
├── core/
│   └── game.js                 # MODIFIED — wire Input(canvas), pointer-lock click handler, G/V key binds, bob offsets to renderer
├── assets/config/gameplay/
│   └── player.json             # MODIFIED — expanded schema (see section 6)
├── config/
│   └── config.js               # VERIFY — already supports player via getPlayerConfig() / getAllRenderConfigs()
├── render/
│   └── shaders.js              # OPTIONAL — apply bob offset if not already (viewBobOffsetX, viewBobOffset, viewBobRoll) as camera translation/roll
└── tests/
    ├── unit/player.test.js     # NEW — movement, collision, deterministic bob, mode toggle
    └── e2e/game.spec.js        # MODIFIED — new keybinds, pointer lock, bob config, movement
```

Existing Task 3 canvas is `id="game-canvas"` in `game.html`. Input must bind to that canvas, not window alone.

## 2. Player — Free Roam Mode (Doom style)

`Player` must support continuous analog movement:

- Resolve config via `_resolvePlayerCfg()` checking `cfg.playerCfg || cfg.player || {}`. Fields: `moveSpeed` 3.0, `strafeSpeed` 2.8, `turnSpeed` 2.2 rad/s for QE, `mouseSensitivity` 0.0022 rad/px, `radius` 0.28, `height` 0.5.
- `setPosition(x,y,angle)` resets both continuous and grid targets, clears lerp, resets bob phase/amount, updates facing.
- `setConfig(cfg)` stores cfg for later `update()` resolve.
- `update(dt,input,dungeon)` when `!gridMode`:
  - QE turn: `angle += turn * turnSpeedKeyboard * dt`
  - Mouse look: `angle += mouseDX * mouseSensitivity` from Input (mouseDX already accumulated per frame)
  - Normalize angle to [-PI, PI]
  - Compute forward/right vectors from angle: fwd = (cos, sin), right = (-sin, cos)
  - move = fwd*forward*moveSpeed + right*strafe*strafeSpeed; clamp diagonal length <=1 to avoid sprint exploit
  - Scale by dt, slide collision: try full move, else X only, else Y only
  - Collision check: circle vs grid with 8 sample points around radius (center + 4 cardinal + 4 diagonal *0.7) testing `grid[iy*w+ix] !== 0` or out of bounds = blocked. Radius configurable.
- Light source: `getLightSource()` returns warm point at eye height `height + light.height`, color/intensity/radius from cfg.

## 3. Player — Grid Mode (Grimrock style, default ON)

Authentic stepped movement:

- State: `gridMode` bool default true, `gridTargetX/Y`, `gridTargetAngle`, `gridFacing` 0-3 (N/E/S/W, 0=N = -PI/2, 1=E=0, 2=S=PI/2, 3=W=PI with wrap handling), `moveLerp` 0-1, `turnLerp` 0-1, `_gridStartX/Y/Angle`, `gridMoveSpeed` 5.0 lerp/s, `gridTurnSpeed` 6.5 lerp/s, `gridHoldInitialDelay` 0.18s, `gridHoldRepeatDelay` 0.06s.
- `setGridMode(on)`: when ON, snap target to nearest tile center + nearest cardinal angle, set `moveLerp=0 turnLerp=0` to lerp to snapped pose; when OFF, keep current continuous pose, set lerp=1.
- Discrete commands:
  - `tryGridMoveWithMap(dir, map)` dir 0=F 1=B 2=StrafeL 3=StrafeR relative to `gridFacing`. Compute desired tile from `gridTargetX/Y` + dirVec. Block if out of bounds or `grid[ty*w+tx] !== 0`. Else set `_gridStartX/Y = x/y`, target += vec, `moveLerp=0`, return true. Must reject if already animating (`moveLerp<1 || turnLerp<1`).
  - `tryGridTurn(delta)` delta -1 left +1 right: set `_gridStartAngle=angle`, update `gridFacing = (facing+delta+4)&3`, target angle = cardAngles[facing], `turnLerp=0`.
- `update()` when `gridMode`:
  - Lerp position toward target using smoothstep `t*t*(3-2*t)`, angle via shortest-angle lerp handling wrap.
  - When lerp reaches 1, snap exact to target.
  - Moving flag true while lerp <1 — drives bob.
  - Ignore continuous `_forward/_strafe/_turn` in grid mode; they are handled via discrete methods by Input.
  - `updateFacingFromAngle()` to keep facing in sync after snap.

Edge cases: cardAngles = [-PI/2, 0, PI/2, PI] (N/E/S/W). Normalize angle after update. Choosing nearest cardinal on mode switch must use angular distance modulo 2PI.

### 3b. Authentic Feel Details

- Spawn at `start+0.5, angle -PI/2` (facing north) like Task 3.
- Grid targets must always stay on tile centers (x.y = floor+0.5) to avoid half-tile drift.
- Strafing left/right in grid mode moves sideways relative to facing, not turning.
- Collision in grid mode checks target tile only, not circle sampling — simpler discrete validity.

## 4. View Bobbing — Figure-8 Path

Bob adds walking feel; must be toggleable and tunable.

- State: `bobPhase`, `bobAmount` 0-1, `viewBobEnabled` bool, `viewBobOffset` vertical, `viewBobOffsetX` horizontal, `viewBobRoll` radians, `bobParams` = { `ampY` 0.025 m vertical, `ampX` 0.015 m horizontal, `ampRoll` rad from deg `ampRollDeg` 0.6°, `freq` 9.0 Hz walk cycle, `speedScale` 1.0 } plus storing raw deg for editor round-trip `_ampRollDeg`.
- Update logic:
  - Target bob = `min(1, speed/moveSpeed)` in free mode, or fixed 0.7 when moving in grid mode else 0.
  - `bobAmount += (target - bobAmount)*dt*8` exponential decay for landing.
  - If `bobAmount>0.01`, `bobPhase += dt * freq * speedScale * (0.5 + bobAmount)` — slower when almost idle, faster when running.
  - If enabled: `offsetY = sin(phase*2)*ampY*amount`, `offsetX = sin(phase)*ampX*amount`, `roll = sin(phase)*ampRoll*amount + strafe*0.5*ampRoll*0.8` (strafe influence leans into strafe).
  - Else zeros.
- Figure-8: vertical oscillates twice per horizontal cycle (frequency 2:1).
- Renderer integration: `core/game.js` should pass bob offsets to renderer if renderer supports camera translate/roll, or apply as simple position offset to eye height for verification. At minimum expose via `getViewBobState()` for renderer/tests. Task 3 renderer already handles eye height; applying `viewBobOffset` to player Z and `viewBobOffsetX` as lateral shift and `viewBobRoll` as small roll or screen tilt is acceptable — naming free but must be observable in 3D (canvas pixels change when bob enabled vs disabled).

### Presets

Config must include `bob.presets` map:

```json
"presets": {
  "subtle": { "ampY":0.012, "ampX":0.008, "ampRollDeg":0.3, "freq":7.5 },
  "default": { "ampY":0.025, "ampX":0.015, "ampRollDeg":0.6, "freq":9.0 },
  "heavy": { "ampY":0.045, "ampX":0.028, "ampRollDeg":1.2, "freq":10.5 },
  "disabled": { "ampY":0, "ampX":0, "ampRollDeg":0, "freq":0 }
}
```

Editor loads generic JSON, so presets are editable without code. Player must have `setBobParams(p)` merging and `setViewBobEnabled(v)`.

## 5. Input System — Keyboard + Mouse + Hold/Repeat + Buffer

Rewrite `systems/input.js` to match prototype `mygame/src/systems/input.js`:

- Constructor takes `canvas` element for pointer-lock binding.
- Tracks `keys` map code->bool, `prevKeys` for `justPressed`, `mouseDX/DY` accumulated while pointerLocked.
- Bindings:
  - `click` on canvas -> `canvas.requestPointerLock()`
  - `pointerlockchange` -> update `pointerLocked` bool
  - `mousemove` -> if locked, accumulate movementX/Y
  - `contextmenu` preventDefault, `Escape` exits pointer lock.
  - `keydown/keyup` listening to `code` (KeyW/A/S/D/Q/E + ArrowUp/Down/Left/Right).
- Hold-to-repeat for grid mode:
  - `_hold = {f,b,ls,rs,tl,tr}` timers seconds key held.
  - `_holdInitial` 0.18s first repeat, `_holdRepeat` 0.06s subsequent, overridable from player config `gridHoldInitialDelay/Repeat`.
  - `_buffer = {type, age}` with timeout 0.3s for buffered next action when tapped early before lerp ends — gives fluid chaining.
- `update(dt, player, map)`:
  - Determine gridMode from `player.gridMode` (not DOM element). Optionally still support legacy checkbox id gridMode if present.
  - Consume `mouseDX` reset to 0 each frame.
  - If gridMode:
    - Compute down states: W/ArrowUp=F, S/ArrowDown=B, A=LS, D=RS, Q/ArrowLeft=TL, E/ArrowRight=TR. Compute justPressed via edge.
    - Immediate edge actions: on justPressed, try corresponding `player.tryGridMoveWithMap` / `tryGridTurn`. If succeeds set hold=0 clear buffer act=true. If fails because busy (lerp<1), queue buffer.
    - Increment hold timers for down keys.
    - Expire buffer after 0.3s.
    - If idle (moveLerp>=1 && turnLerp>=1) and buffer exists, try buffered action, reset its hold timer, clear buffer on success, clear if wall-blocked.
    - If idle and no buffer and no edge act, try hold repeat: if down duration >= holdInitial, attempt move/turn, on success set timer to `initial - repeat` to cadence tile-by-tile.
    - Call `player.setInput(0,0,0,0)` then `player.update(dt,map)`.
  - Else free mode:
    - forward = (W/Up)-(S/Down), strafe = D-A, turn = E-Q (+ arrows fallback).
    - Normalize forward+strafe diagonal <=1.
    - `player.setInput(forward, strafe, turn, mouseDX)` then `player.update(dt,map)`.
  - Store prevKeys copy for next edge detection.

## 6. Config — player.json Schema Expansion

`src/assets/config/gameplay/player.json` version 1 -> 2:

```json
{
  "version": 2,
  "moveSpeed": 3.0,
  "strafeSpeed": 2.8,
  "turnSpeed": 2.2,
  "mouseSensitivity": 0.0022,
  "radius": 0.28,
  "height": 0.5,
  "gridMode": true,
  "gridMoveSpeed": 5.0,
  "gridTurnSpeed": 6.5,
  "gridHoldInitialDelay": 0.18,
  "gridHoldRepeatDelay": 0.06,
  "viewBobEnabled": true,
  "bob": {
    "ampY": 0.025,
    "ampX": 0.015,
    "ampRollDeg": 0.6,
    "freq": 9.0,
    "speedScale": 1.0,
    "presets": { "...": "... as above ..." }
  },
  "collision": { "slide": true, "radius": 0.28, "note": "circle 8-point vs AABB" },
  "light": { "intensity":1.8, "radius":4.5, "color":[1,0.9,0.7], "height":0.45 }
}
```

Fields must be read via `getPlayerConfig()` / `getAllRenderConfigs()` in Game. No hardcoded movement constants in player.js — all from config with fallback defaults. Keep legacy alias `_resolvePlayerCfg()` checking `playerCfg || player`.

## 7. Game Integration + Controls

`core/game.js`:

- Construct `Input` with canvas arg: `new Input(this.canvas)`.
- Update loop: `const inp = this.input.update(dt, this.player, this.dungeon)` or keep old call shape but pass map/player.
- Key handling in `_onKeyDown`:
  - Existing: R regen, M map, 1-8 debug toggles.
  - NEW:
    - G toggles grid mode: `player.setGridMode(!player.gridMode)` HUD "Grid mode: ON (Grimrock tile step) / OFF (free FPS)"
    - V or B toggles view bob: `player.setViewBobEnabled(!player.viewBobEnabled)` HUD "View bob: ON/OFF"
    - P cycles bob presets (optional): apply preset to bobParams and HUD "Bob preset: default"
  - Ensure HUD messages reuse existing `_showHud` with timeout from debug config.
- Pointer lock: canvas click already handled in Input; no extra Game change needed except ensuring Game loop not breaking when pointer locked.
- Pass bob offsets to renderer if possible: renderer may read `player.viewBobOffset`, `viewBobOffsetX`, `viewBobRoll` to adjust eye position/roll uniform. If Task 3 renderer doesn't support roll, adding lateral Y/X offset to camera pos is acceptable; must produce visible difference between bob on/off when walking.

`main.js` remains tiny bootstrap; Game owns all wiring.

## 8. Editor Integration

`player.json` appears under `assets → config → gameplay → player.json` in existing hierarchical editor tree (Task 3 recursive walk). No custom editor tab needed — generic Visual/Raw JSON editor suffices. Verify editor can edit new fields, save via PUT `/api/assets/config/gameplay/player`, persist to disk, and game reloads config on R regen (already does `getAllRenderConfigs()`).

## 9. Tests

**Unit at `src/tests/unit/player.test.js` (Node built-in runner):**

- Deterministic spawn: same seed start position angle = -PI/2.
- Grid mode: `tryGridMoveWithMap` blocks wall, allows free tile, updates target to center, lerp progresses 0->1 over dt, final position snapped, angle cardinal snapping, facing 0-3 correct.
- Free mode: forward moves +X when angle 0, slide collision tries X then Y, radius respected, diagonal clamping.
- Mode toggle: `setGridMode(true)` snaps to nearest center+cardinal, `false` keeps continuous.
- View bob: `viewBobEnabled` false => zero offsets; true + moving => offsets non-zero, figure-8 relation (phase*2 vs phase), amount decays when idle, `setBobParams` merges, presets shape valid.
- Collision: 8-point circle detects wall when near, not when far.
- Config resolution: `playerCfg` vs `player` alias returns same.

**E2E at `src/tests/e2e/game.spec.js` + `game-controller.spec.js` new: **

- Page loads no console errors, canvas WebGL2.
- WASD changes canvas pixels (movement), QE changes pixels (turn).
- G toggles grid/free and HUD shows mode text.
- V/B toggles bob and HUD.
- R regenerates, M map still works, 1-8 debug still works.
- Pointer lock: click canvas -> pointerLocked true (browser permission stub acceptable, at least no JS error), mouse movement changes angle in free mode.
- Editor: `player.json` appears in tree, editable, persists via API `GET/PUT /api/assets/config/gameplay/player` returns expected schema.

All `npm run test:unit` + `test:e2e` must pass.

## 10. Acceptance Criteria

- [ ] `src/entities/player.js` implements dual mode: `gridMode`, `gridTargetX/Y/Angle`, `gridFacing`, `moveLerp/turnLerp`, `gridMoveSpeed/TurnSpeed`, `tryGridMoveWithMap` + `tryGridTurn` with wall check blocking and busy rejection, free mode WASD/QE+mouse delta, slide collision 8-point, `setGridMode` snapping, `setPosition` resetting lerp+phase, view bob figure-8 with `ampY/ampX/ampRoll/freq` + `bobAmount` decay + presets + `setViewBobEnabled`/`setBobParams`/`getViewBobState`.
- [ ] `src/systems/input.js` rewrites to accept canvas, tracks keys + prevKeys, `mouseDX/DY` accumulate only when pointerLocked, `pointerLock` click handler, `isDown`/`justPressed`, hold timers `_hold` initial 0.18 repeat 0.06 overridable, buffer `_buffer` age 0.3s timeout for early tap chaining, `update(dt,player,map)` implements grid edge->immediate + buffer->hold-repeat logic and free continuous normalized input plus mouseDX passing.
- [ ] `src/assets/config/gameplay/player.json` version 2 with fields: moveSpeed, strafeSpeed, turnSpeed, mouseSensitivity, radius, height, gridMode, gridMoveSpeed, gridTurnSpeed, gridHoldInitialDelay, gridHoldRepeatDelay, viewBobEnabled, bob{ampY,ampX,ampRollDeg,freq,speedScale,presets{subtle,default,heavy,disabled}}, collision, light. Loaded via `getPlayerConfig()`/`getAllRenderConfigs()`.
- [ ] `src/core/game.js` wires `new Input(canvas)`, `input.update(dt,player,dungeon)`, handles G grid toggle and V/B bob toggle with HUD timeout, passes bob offsets to renderer (at least offset applied, observable canvas change walking ON vs OFF).
- [ ] Mouse look works: click canvas requests pointer lock (no error), mouse movement rotates view in free mode only, ESC exits lock (browser default).
- [ ] No console errors on load, WebGL2 path still works, existing toggles R/M/1-8 preserved.
- [ ] No hardcoded movement numbers in player.js — all resolved from config with fallbacks.
- [ ] Tests pass: `player.test.js` covers spawn, grid move/block/lerp/facing, free slide, mode toggle snap, bob enabled/disabled/figure-8, 8-point collision, config alias. E2E verifies movement, G/V toggles + HUD, pointer-lock click no error, editor persistence.
- [ ] ES modules only, no emoji, no new runtime deps beyond Node built-ins.

## 11. Out of Scope

- Full RPG trinity loop, characters/sprites, inventory — future tasks.
- Chair bobbing head height animation for jumping/crouching — no jump yet.
- Gamepad support, touch joystick.
- Custom editor tabs per subsystem — editor-complete Task 5.
- Rendering changes beyond applying bob offset; POM/chamfer/corner/palette debug remain Task 3.
- Audio footstep sync (could play tick on bob phase in future but not now).
- Multiplayer networking.

## 12. Running Instructions

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Game loads with grid mode ON (Grimrock step). WASD tile step, QE 90° turn.
# G toggles free FPS, then mouse click locks pointer for mouse look, WASD free strafe.
# V toggles view bob, B alternative, P cycles presets if implemented.
# R regenerates dungeon, M map overlay, 1-8 debug toggles (from Task 3).
# Editor: http://localhost:8000/editor.html -> assets -> config -> gameplay -> player.json to tune speeds, sensitivity, bob params, presets.
```

Screenshots to capture (author provides, not solver): game with grid mode HUD, free mode mouse look HUD, view bob ON vs OFF comparison walking, config editor showing expanded player.json, pointer lock active indicator if possible.
