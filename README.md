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
