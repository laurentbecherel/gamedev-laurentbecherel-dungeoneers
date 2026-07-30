# Player Controller Polish — Dungeoneers Task 4

> Make movement feel good: bring back grid-step + free-roam dual mode, pointer-lock mouse look, and figure-8 view bob with tunable presets. Task 3 delivered 3D with basic WASD+QE; Task 4 polishes the first-person feel.

**Why two movement modes:** The prototype shipped both and players expect both. Grid mode is authentic to Legend of Grimrock — you step discretely from tile center to tile center with a smooth animation, you can hold a key to keep chaining steps, and you can buffer the next turn while still animating for fluid corridors. Free mode is Doom-style — continuous analog movement with strafe and mouse look, you slide along walls instead of getting stuck. Grid mode should default ON for retro authenticity, but G toggles to free FPS for modern feel.

**Why view bob:** Without bob, first-person feels like a floating security camera. Walking should produce a subtle figure-8 head motion driven by movement — vertical bobs twice as fast as horizontal sway and roll, intensity grows with speed and decays when you stop, leaning slightly into strafe. Small differences in amplitude/frequency drastically change feel, so it must be fully tunable from config and via presets.

**Why layout-agnostic input:** The prototype used `e.key` (logical character). On French AZERTY keyboards, W position produces Z, A position produces Q, numbers 1-8 require Shift and produce symbols. That broke movement and debug toggles. Games should use physical key positions (muscle memory), not characters. This task must fix that.

This task builds on Task 3's player, input, game loop, and player config. No new assets, no renderer rewrite — only wiring bob offsets to the existing camera if possible (at minimum exposing state so renderer/tests can observe difference between bob ON vs OFF).

## 1. Project Structure

You will extend `src/`:

- `entities/player.js` — dual mode (grid + free), view bob
- `systems/input.js` — keyboard + mouse, pointer lock, hold/repeat, buffer, layout-agnostic
- `core/game.js` — wire Input with canvas, G/V/B/P/R/M handling, HUD, pass bob to renderer
- `assets/config/gameplay/player.json` — expanded schema with speeds, sensitivity, grid timings, bob params + presets
- Tests — movement, collision, mode toggle, bob, AZERTY mapping, pointer lock, editor persistence

Existing game canvas is `id="game-canvas"` in `game.html`. Input must bind to that canvas for pointer lock, not just window.

## 2. Player — Free Roam (Doom-style)

Continuous mode should work when grid mode is OFF.

**Intent:**
- QE should turn smoothly, mouse should look when pointer is locked (and be ignored in grid mode).
- Forward/strafe should combine into a movement vector using the player's facing, with diagonal movement clamped so you cannot sprint faster diagonally.
- Collision should feel fair — you have a small radius around you and you slide along walls instead of stopping dead when hitting at an angle.
- Spawning, config loading, and light source should still work as in Task 3, but now config may live under either `player` or `playerCfg` key for backwards compatibility.
- Resetting position (e.g. on regen) should fully reset movement state so you don't carry over intent.

**Config expectations:**
Player config contains movement speeds, turn speed, mouse sensitivity, collision radius, eye height, light properties, grid timings, and bob parameters. Player should read these from config with reasonable fallbacks, not hardcode magic numbers. No hardcoded constants that should be tunable.

## 3. Player — Grid Mode (Grimrock-style, default ON)

**Intent:**
- Movement is discrete tile-to-tile, always landing on tile centers to avoid drift.
- You face only four cardinal directions (N/E/S/W). Turning rotates 90° with smooth interpolation that takes the shortest angle path.
- Pressing movement should start a smooth lerp from your current tile to the target tile center; while that lerp is in progress you cannot start another move (busy rejection).
- Holding a direction should repeat after a short initial delay, then at a faster repeat rate — like holding arrow in a menu.
- If you tap a turn early while still stepping, it should buffer and execute as soon as the step finishes (fluid chaining), with a short timeout so old buffered inputs expire.
- Toggling grid mode ON should snap your target to the nearest tile center and nearest cardinal direction and lerp to it; toggling OFF should keep your current continuous pose.

**Behaviors to preserve:**
- Start position is roughly start tile center +0.5 offset, facing north.
- Strafing moves sideways relative to facing, not turning.
- Grid collision checks target tile validity (inside bounds + walkable), not continuous circle sampling.

## 4. View Bob — Figure-8 Path

**Intent:**
- Bob adds walking feel and must be toggleable and tunable.
- Intensity should grow when you start moving and decay when you stop.
- Phase should advance faster when you run, slower when almost idle.
- When enabled while moving, you should see vertical offset, horizontal offset, and roll all varying over time in a figure-8: vertical oscillates twice per horizontal cycle.
- Roll should also lean slightly into the strafe direction when strafing.
- When disabled, all offsets zero.

**Tunable:**
- 5 parameters drive feel: vertical amplitude, horizontal amplitude, roll amplitude (in degrees), frequency, speed scale. They must be editable via config and mergeable via setter.
- Presets: subtle (small), default (medium), heavy (large), disabled (all zero). Subtle is smaller than default, heavy larger than default, disabled zero. Preset names matter, exact numbers are tunable.
- Must expose state for renderer and tests (e.g. method returning enabled/offset/offsetX/roll/phase).

**Renderer integration:**
Game should pass bob offsets to renderer if renderer supports camera translation/roll; otherwise applying offset to eye height is acceptable as long as you can observe canvas pixel change between bob ON vs OFF while walking. Naming is flexible but observable.

## 5. Input — Layout-Agnostic, Hold/Repeat, Buffer, Pointer Lock

**Problem to solve:** Prototype used `e.key.toLowerCase()` (logical character). On AZERTY, physical W key reports Z, A reports Q, numbers require Shift. That broke WASD and 1-8 toggles.

**Intent:**
- Use physical key codes (`event.code` like `KeyW`, `Digit1`) not logical characters (`e.key`).
- Muscle memory is positional — French player expects ZQSD on same finger positions as WASD. Checking code makes ZQSD work natively when you check WASD codes, because physical W position is Z label on AZERTY but code still `KeyW`. For robustness, accept both QWERTY and AZERTY physical positions for forward/strafe where it helps without causing double actions in the same mode.
- Number row debug toggles 1-8 must work without Shift on AZERTY, so use `Digit1`..`Digit8` codes, not character `'1'`. Accept `Numpad1`..`Numpad8` as fallback.
- +/- zoom (if any) should use `Equal`/`Minus`/`NumpadAdd` etc., not `+` character.
- Document in a header comment why code vs key, and your chosen mapping table for QWERTY/AZERTY.

**Behaviors:**
- Track active physical codes in a set, track previous frame for edge detection (just pressed), accumulate mouse delta only when pointer is locked.
- Bindings:
  - Click on canvas requests pointer lock
  - Listen to pointerlockchange to track locked state
  - Mousemove accumulates movement when locked
  - Prevent context menu, Escape exits lock (browser default)
  - Clear pressed set on blur/visibility change to avoid stuck keys
  - Provide helper to check if a code or any of array is down
- Hold-to-repeat for grid mode: timers for each direction, first repeat after initial delay, then faster repeat rate, overridable from player config.
- Buffer for early taps: small timeout (~0.3s) storing next intended action while animating, executed when idle, cleared if wall blocked or expired.
- Update method receives dt, player, map, decides grid vs free based on player state, returns continuous intent in free mode or drives discrete grid moves via player methods in grid mode, resets mouse delta each frame.

E2E tests must press codes (`KeyW`, `Digit1`) not characters.

## 6. Config — player.json Schema Expansion

Version 1 → 2. Must include fields for movement speeds, mouse sensitivity, radius, height, grid mode default, grid move/turn speeds, hold timings, bob enabled flag, bob params (ampY, ampX, ampRollDeg, freq, speedScale, presets map), collision note, light. Loaded via existing config loader. Keep legacy alias support (config may be under `player` or `playerCfg`).

All movement numbers must be read from config with fallbacks, not hardcoded. Presets must be editable without code.

## 7. Game Integration

- Construct Input with canvas element so pointer-lock binding works.
- Update loop drives input.update(dt, player, dungeon) and passes resulting intent to player.
- Handle keys:
  - Existing: R regen, M map, 1-8 debug toggles (must use code)
  - New: G toggles grid mode with HUD message distinguishing Grimrock vs free FPS, V or B toggles bob with HUD, P cycles bob presets with HUD (optional but expected). HUD reuses existing timeout.
- Pointer lock is handled in Input; game loop should not break when locked.
- Pass bob offsets to renderer if possible.

Main.js remains tiny bootstrap; game owns wiring. For E2E verification, exposing game instance on window is acceptable (helps test bob state).

## 8. Editor Integration

player.json appears under assets → config → gameplay → player.json in hierarchical editor tree from Task 3 recursive walk. Generic visual/raw JSON editor suffices. Editor can edit new fields, save via PUT, persist to disk, game reloads on R regen.

## 9. Tests

**Unit (player.test.js):**
- Deterministic spawn, forward moves, wall blocks, slide along wall, turn rotates.
- Grid: move blocks wall/allows free, lerp progresses and snaps to center, turn updates facing, toggle snaps nearest center+cardinal.
- Free: diagonal clamp, mouse look changes angle in free but ignored in grid.
- Bob: disabled zero offsets, enabled moving non-zero, decays idle, merges, presets shape valid, figure-8 relation, roll strafe influence, base height vs bob, raw angle vs roll, light steady, clear intent on setPosition, speedScale affects phase, grid bob target moving vs idle.
- Collision: circle detects near wall, not far.
- Config alias.

**E2E (game-controller.spec.js):**
- Page loads no console errors, canvas visible WebGL2
- WASD/ZQSD movement changes canvas or player state, QE turn changes, G toggles grid/free HUD, V/B toggles bob HUD + observable state change, P cycles presets, R regen, M map, 1-8 debug (code presses)
- Pointer lock: click canvas → no JS error, mouse move rotates in free mode
- Editor: player.json appears, editable, persists via API, schema valid
- Tests use code presses (Digit1, KeyW, KeyZ) not characters, proving AZERTY safety

All npm run test:unit + test:e2e must pass.

## 10. Acceptance

- Player supports dual mode: grid default ON, free OFF, with lerp to center/cardinal, busy rejection, hold repeat, buffer, slide collision, mode snap, view bob figure-8 tunable + presets + toggle + state getter, no hardcoded movement numbers
- Input tracks physical codes, not logical chars, mouse delta only when locked, pointer lock on canvas click, isDown helper, hold timers overridable, buffer timeout, update implements grid edge→immediate + buffer→hold-repeat + free continuous normalized + mouseDX, clears on blur
- Layout agnostic: movement uses code so ZQSD works on AZERTY, debug Digit1-8 works without Shift, G/V/B/R/M via code. Header comment explains code vs key and mapping table
- player.json v2 with required fields, loaded via getAllRenderConfigs, legacy alias support
- Game wires Input(canvas), handles G grid toggle and V/B bob toggle with HUD, passes bob to renderer observable, keys use code
- Mouse look: click requests pointer lock no error, rotates in free only, ESC exits
- No console errors, WebGL2 works, R/M/1-8 preserved AZERTY-safe
- No hardcoded movement numbers, ES modules only, no emoji, no new deps
- Tests pass covering spawn, grid move/block/lerp/facing, free slide, toggle snap, bob enabled/figure-8/decay/presets, collision, alias, and E2E ZQSD, G/V, pointer lock, editor persistence using code presses

## 11. Out of Scope

- RPG loop, inventory, sprites, jumping/crouching bob, gamepad, touch joystick, full rebind UI (code-based mapping documented is enough), custom editor tabs, rendering beyond bob offset, audio sync, multiplayer. Text inputs in editor still use key — only gameplay shortcuts must use code.

## 12. Running

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Grid ON default: WASD tile step, QE 90° turn. G toggles free FPS, click locks pointer for mouse look.
# V/B toggles bob, P cycles presets, R regen, M map, 1-8 debug (code-based, AZERTY safe)
# Editor: http://localhost:8000/editor.html -> assets -> config -> gameplay -> player.json
```

Screenshots / Video for README (author-only, not required for solver — optional for final task presentation):
- These are to help the README and submission teaser, not part of acceptance criteria. Solver does NOT need to produce them.
- Suggested captures if you do: grid ON vs OFF HUD, bob ON vs OFF while walking, mouse look active, editor showing player.json v2.

In `task.toml` screenshots and videos are for the catalog only; E2E and unit tests are the true acceptance.

