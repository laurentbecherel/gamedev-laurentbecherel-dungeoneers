# Task: foundation-engine

## Description

Foundational engine setup for Dungeoneers — establishing the barebones full-stack architecture that all subsequent features build upon. This task delivers a Node.js server with REST API serving static client files and providing config/asset CRUD endpoints persisting to disk, a landing page introducing the game, a game page placeholder with canvas rendering, an editor page for live parameter tuning via API, a data-driven JSON asset structure with defined schemas, and a Playwright end-to-end test suite validating all pages and API functionality.

This is Task 1 of the Dungeoneers reconstruction — the scaffolding upon which dungeon generation, rendering, gameplay, and RPG systems will be built incrementally in subsequent tasks.

See [instruction.md](./instruction.md) for the full specification used to build this feature.

## Avocado vs Claude Performance

TBD — task not yet implemented. Once golden feature is built, one-shot the instruction.md with BOTH Avocado (1P) and Claude (3P) separately and record findings here. Do NOT commit any code from these one-shots — this section is for researchers to compare model capabilities.

| Evaluation | Claude | Avocado | Track opportunity |
| --- | --- | --- | --- |
| TBD | TBD | TBD | TBD |

## Human-Tuned Areas

TBD — to be filled post-implementation. Document nuanced hand-tuned pieces here so reviewers can judge human craft vs model output. Examples relevant to foundation task:
- Server API design choices (endpoint structure, error handling approach, persistence strategy)
- Config schema organization and field naming
- Landing page visual design and copy tone
- Test coverage decisions (which flows to test E2E vs unit)

## Screenshots

TBD — capture key states once implemented:
- Landing page showing title, tagline, navigation buttons
- Game page showing placeholder canvas render
- Editor page showing config display and asset editor UI
- API test demonstrating successful config save roundtrip

Screenshots referenced from [task.toml](./task.toml).

## Videos

Do not commit video files. Upload to **PixelCloud** and reference links here and in task.toml (`videos`, `teaser` — teaser is ~10 sec highlight).

- Gameplay: TBD
- Teaser: TBD

## Trajectories

TBD — add paste link to trajectory used when building this task's golden feature (Avocado / manual — never 3P). Skip if built entirely by hand.

- Gold build trajectory: TBD

## Tag reference

`task.toml` uses controlled vocabularies. Pick from these lists:

**game-tags:** Arcade/action · Puzzle/board/card · Simulation/management · RPG/adventure/story · Sports/racing/vehicle · Casual/avatar/decor · Educational/serious · 3D/VR scene-like · Interactive scene/cinematic · Other game/unclear

**tech-stack-tags:** Web JS/DOM · Vanilla JS canvas · React/TS canvas · Three.js/WebGL · Phaser 3 · Pixi.js · Godot · Unity/Roblox/native game engine · Unspecified/other
*Note: Dungeoneers uses vanilla-js, nodejs, html5, rest-api, playwright — some map to controlled vocab, some are descriptive extensions.*

**assets-used:** Primitives · ImportedAssets
*Note: Dungeoneers uses primitives and procedural — both fit controlled vocab as descriptive extensions.*
