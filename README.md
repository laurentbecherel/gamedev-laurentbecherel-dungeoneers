# DUNGEONEERS

**Short pitch:** 4-player co-op retro dungeon crawler — 10 minute delves. Classic holy trinity gameplay (Tank / Healer / DPS) as roles, not locked classes — bring any composition, but you need the trinity to survive. Pixel/CRT retro aesthetic, arcade speed.

**Core loop:** Lobby (4p) → Job Board (pick 10-min delve) → Delve (trinity-based combat, retro crawler) → Loot & extraction → Upgrade roles → Repeat. Designed for drop-in/drop-out short sessions.

This repo follows the ADO **GameDev track** task structure: one repo per game
(`gamedev-{game-name}`), a single shared gold source in `src/`, and one folder
per task under `tasks/`.

## Project Structure

```text
gamedev-laurentbecherel-dungeoneers/
├── src/                  Full self-contained project — client, server, tests, config
│   │                     All code, assets, server, and tests in one folder.
│   ├── index.html        Landing page with links to game and editor
│   ├── game.html         Runtime game entry point
│   ├── editor.html       Editor entry point for live tuning
│   ├── config/           Client-side config API client
│   ├── assets/           JSON data assets (materials, themes, architectures)
│   └── ...               Subsystem folders added incrementally per task
│   ├── server/           Server-side Node.js application (inside src/)
│   ├── server.js         HTTP server + REST API for config and asset CRUD
│   ├── package.json      Dependencies and npm scripts
│   └── config-state.json Runtime persisted config (created on first save)
│   ├── tests/            Playwright E2E test suite (inside src/)
│   ├── playwright.config.js
│   └── e2e/              Playwright end-to-end tests for all pages
├── tasks/                One folder per task (descriptive kebab-case names)
│   └── <task-name>/
│       ├── instruction.md    Detailed task spec — prompt to reproduce feature
│       ├── task.toml         Task metadata
│       ├── README.md         Task description + model comparison + trajectories
│       └── screenshots/      Screenshots of running game for this task
├── README.md             This file — game overview + running instructions
├── TASK_GUIDELINES.md    How to author tasks in GameDev track
├── PROTOTYPE_ANALYSIS.md Exhaustive prototype feature breakdown (2,131 lines)
└── RECONSTRUCTION_PLAN.md 10-task rebuild strategy with dependency DAG
```

Notes:

- **`src/`** holds client-side game code served statically. Tasks build incrementally on top of shared src/.
- **`server/`** provides REST API for reading/writing config and JSON assets — edits persist to disk, not localStorage.
- **`tests/`** contains Playwright E2E test suite validating pages and API functionality.
- **No binaries in repo.** Only source code submitted; share behavior via screenshots and PixelCloud video links.
- **Videos** uploaded to PixelCloud, referenced from task.toml and README — not stored in repo.

## Running the Game

**Prerequisites:** Node.js v18+ installed.

**Install dependencies (first time):**
```bash
cd src && npm install              # installs Playwright for testing (+ Express if used)
npx playwright install   # downloads browser binaries for E2E tests
```

**Start server:**
```bash
cd src && npm start
# Server runs at http://localhost:8000
# Override port:  PORT=3000 cd src && npm start   (Unix)  or  $env:PORT=3000; cd src && npm start  (PowerShell)
```

**Open in browser:**
- Landing page: http://localhost:8000/ — introduction and navigation
- Game: http://localhost:8000/game.html — runtime game experience
- Editor: http://localhost:8000/editor.html — live parameter tuning

**Run tests:**
```bash
cd src && npm test          # Playwright E2E tests headless
cd src && npm run test:ui   # Playwright UI mode for debugging
```

## Engine & Framework

- **Engine / framework:** Custom vanilla JavaScript ES modules + Node.js HTTP server (no game engine framework — pure web platform)
- **License:** MIT (for engine-agnostic custom code — no engine license restrictions apply)

## Dependencies

| Library | Version | Source | License |
| --- | --- | --- | --- |
| Node.js | 18+ | https://nodejs.org | MIT |
| @playwright/test | ^1.40.0 | https://playwright.dev (dev dependency for E2E testing) | Apache-2.0 |

*No runtime dependencies beyond Node.js built-in modules (http, fs, path, url). Express optional — if used, add to table above with exact version.*

## Assets & Attribution

| Asset / Folder | Type | Source | License / Attribution |
| --- | --- | --- | --- |
| `src/assets/materials/*.json` | material definitions | original (authored) | internal-use |
| `src/assets/themes/*.json` | theme definitions | original (authored) | internal-use |
| `src/assets/sprites/` | sprites | TBD — to be generated procedurally or authored | TBD |

*Foundation task uses only JSON data assets (original authored). No third-party art, audio, fonts, or models in foundation scope. Sprite assets to be added in Task 8.*

No third-party tokens, proprietary code, or IP appear in the code, assets, or the model-visible environment; all third-party material is attributed above.

## Building & Running

**Prerequisites:** Node.js v18 or higher installed. Modern browser with ES module support (Chrome, Firefox, Safari, Edge).

```bash
# Clone repository
git clone https://github.com/laurentbecherel/gamedev-laurentbecherel-dungeoneers.git
cd gamedev-laurentbecherel-dungeoneers

# Install dependencies (first time only)
cd src && npm install              # installs Playwright for testing
npx playwright install   # downloads browser binaries for E2E tests

# Start server
cd src && npm start
# Server runs at http://localhost:8000
# Override port:  PORT=3000 cd src && npm start   (Unix/macOS)
#                  $env:PORT=3000; cd src && npm start   (PowerShell on Windows)
```

**Open in browser:**
- Landing page: http://localhost:8000/ — introduction and navigation hub
- Game: http://localhost:8000/game.html — runtime game experience
- Editor: http://localhost:8000/editor.html — live parameter editor

**Run tests:**
```bash
cd src && npm test          # Playwright E2E tests headless
cd src && npm run test:ui   # Playwright UI mode for interactive debugging
npx playwright show-report   # View HTML test report after run
```

## Core Features

- **4-Player Co-op:** Drop-in/out, built for 4 but trinity scales (1 Tank / 1 Heal / 2 DPS flex)
- **Holy Trinity Gameplay:** Tank controls aggro & mitigation, Healer manages mana/positioning, DPS executes mechanics — distinct, interdependent roles
- **Short Delves:** 8-12 min missions, procedural-lite hand-authored chunks — perfect for lunch break runs
- **Retro Dungeon Crawler:** First-person grid or top-down pixel with CRT/phosphor vector aesthetic, chunky pixels, arcade feel
- **Job Board Loop:** Pick contracts, clear, extract with loot — no 2-hour raids

## Gold Version

- Built with muse-spark-1.1-aai2 (Avocado) — see each task's
  `task.toml` for the exact `avocado-model` and `harness` used.

## Tasks

| Task | Description | Completed |
| --- | --- | --- |
| [foundation-engine](./tasks/foundation-engine/) | Landing page + game page + editor page + Node.js server with REST API + test suite (Playwright E2E) + data-driven JSON config with API persistence | 2026-07-27 |
| [dungeon-generator](./tasks/dungeon-generator/) | Procedural dungeon generator with intentional linear topology, room roles, 5-zone theme progression, parchment minimap renderer with 3 visualization modes | 2026-07-27 |
| [renderer-3d](./tasks/renderer-3d/) | **Complete Edition — merges old Tasks 3+5+6 + advanced geometry.** WebGL2 first-person raycaster with procedural PBR atlases (brick 4-sided normals, textured roughness, softened AO), POM centered ref 0.5 + grazing clamp, dynamic lighting player torch + sun with shadow raymarch bias snapped dominant axis + DDA 64, exponential fog dedicated presets, chamfer fake-geometry bevels floor/ceil/vertical + trim highlight, true intruding rounded corners via ray-circle outer+inner, palette quantization Doom 256 + LUT banding, debug suite 1-8 toggles + PBR debug 0..8 modes, parchment map overlay Pixelify Sans restored fullscreen, Game init retry 5x, 16 dedicated nested configs recursive API, 127 tests passing | 2026-07-29 |
| [player-controller-polish](./tasks/player-controller-polish/) | Dual-mode player controller: grid step (Grimrock ZQSD+AE) + free FPS WASD+mouse pointer-lock, figure-8 view bob with presets (subtle/default/heavy/disabled) cycling via P, AZERTY-safe codes, configurable via player.json v2 | 2026-07-30 |
| [minimap-reveal](./tasks/minimap-reveal/) | Minimap fog-of-war discovery: spawn reveals only entrance room + 1-tile doorway peek, room enter reveals whole room + perimeter + 1-tile peek, corridor BFS radius 4 incremental + 1-tile peek into rooms, retro dither animation (random/Bayer) on M open ~400ms, dashed transparent trail (muted green) clipped to discovered, persistent across toggles, reset on R | 2026-07-30 |
| [lighting-sprites](./tasks/lighting-sprites/) | Environmental lighting + PBR billboard sprites + particles: deterministic seeded placement wall/floor anchoring, min distance, max cap, Z anchored to floorHeight, unique phases, color/intensity/radius variation, zone/role pools; light system types/ids, organic flicker multi-octave drift+pop clamped, LightManager nearest sorted, MAX_LIGHTS array shader loop, sprite registry WeakMap atlas placeholder magenta/neutral, back-to-front blend, PBR same lights/fog/rim; material & TBN correctness now testable — wall tangent matches wallU flip (side==0 && ray.x>0), ceiling TBN right-handed vec3(x,-y,-z), flat plateau+beveled rim via Chebyshev→Euclidean cornerRound 0.5 smoothstep bevelStart 0.42/0.48 bevelDepth 0.22/0.16 roundness 0.06/0.05 groutDepth 0.08 normalFactor 1.6/1.4 heightScale 1.15, 6 Playwright screenshots proving torch-wall/brazier/multi/flicker-graph/PBR/editor | 2026-07-31 |
| [live-edit](./tasks/live-edit/) | Live-edit system with SSE + BroadcastChannel + tiered hot-reload: Tier1 instant shader uniforms (fog, lighting, shadows, chamfer, corners, palette, pom, pbr, ao, player, discovery, map, debug, sprites), Tier2 atlas rebuild (materials-proc), Tier3 regen-required (generator), editor recursive JSON walk, PUT persistence, cross-tab BroadcastChannel instant preview, localStorage fallback, polling fallback, Live badge offline/connected/bc-only, regen banner | 2026-07-31 |
| [grid-tile-chamfers](./tasks/grid-tile-chamfers/) | Grid tile chamfers for floor and ceiling: shows ONE TILE as 1x1 dungeon cell via fract(floorWorld) distance to edge, darkened bevel AO + normal tilt + trim highlight + roughness tweak, corner handling slightly darker not bright crosses, configurable via chamfer.json grid section (enabled, floorSize0.07 ceilSize0.06 darken0.88, trim, blend, ranges smoothstep), Tier1 live-edit via Task7, global chamfer toggle Key7 disables all, purely visual, PBR/fog/shadows/corners/POM still work | 2026-07-31 |
| [materials-modifiers](./tasks/materials-modifiers/) | Materials modifiers system: 6 distinct modifiers (moss, damaged, water, puddle, blood, dust) altering albedo, normals, PBR rough/metal, POM height dramatically; compiled noise function modHash/modNoise/modFBM (value noise + FBM 3 octaves) decides mask plus AO/height/roughness cues (moss loves AO dark crevices low height wall bottom, puddle floor depressions blob noise 0.12, water vertical streaks noise(worldPos.z*8), blood radial splatter+drag, dust crevices ceiling boost 1.35); generator spreads intelligently via roleWeights (entrance moss0.32 water0.42, guardian blood0.86 damaged0.62, treasure/secret dust0.7-0.78, shrine moss0.52, hub damaged0.4 blood0.3, exit damaged0.5 water0.3) + jitter + distanceToWall + depthFactor + top2 normalization deterministic seeded 40x40 map packed 2 RGBA textures units 14/15; config material-modifiers.json live-editable Tier1, shader applyMaterialModifiers in 5 paths (wall + floor/ceil hit & fallback) after chamfer/grid before pbrShade, toggle Key9; 7 screenshots proof | 2026-07-31 |

