# DUNGEONEERS

**Short pitch:** 4-player co-op retro dungeon crawler — 10 minute delves. Classic holy trinity gameplay (Tank / Healer / DPS) as roles, not locked classes — bring any composition, but you need the trinity to survive. Pixel/CRT retro aesthetic, arcade speed.

**Core loop:** Lobby (4p) → Job Board (pick 10-min delve) → Delve (trinity-based combat, retro crawler) → Loot & extraction → Upgrade roles → Repeat. Designed for drop-in/drop-out short sessions.

This repo follows the ADO **GameDev track** task structure: one repo per game
(`gamedev-{game-name}`), a single shared gold source in `src/`, and one folder
per task under `tasks/`.

## Project Structure

```text
gamedev-laurentbecherel-dungeoneers/
├── src/                  Gold game source — the single, shared, buildable game
│                         project (code, scenes, assets, build config). One
│                         source of truth for the whole game; tasks do NOT copy
│                         it. Built with 1P (Avocado) or by hand — never 3P.
├── tasks/                One folder per task (a "todo item" — a larger, complex
│   └── <task-name>/      chunk of work toward the game). Name it descriptively;
│       │                 do not prefix with a date (record the completion date
│       │                 in task.toml / the task README instead).
│       ├── instruction.md    Detailed game task description — the prompt used to
│       │                     reproduce this task's golden feature. No 3P models.
│       ├── task.toml         Task metadata (see the example task's task.toml).
│       ├── screenshots/      Screenshots of the running game for this task.
│       │   └── screen-01.png Referenced from task.toml; capture key states.
│       └── README.md         Task description, Avocado vs Claude comparison,
│                             and trajectory links.
└── README.md             This file — the game-level overview.
```

Notes:

- **`src/`** holds the complete, buildable gold game — not loose scripts, and not
  copied into each task. Tasks reference it and build on top of it.
- **No binaries in the repo.** Per the latest track guidance, only the oracle
  (gold) solution is submitted; there is no reliable way to run peers' binaries,
  so builds are not committed. Share behavior via screenshots and videos instead.
- **Videos** are not stored in the repo; upload them to **PixelCloud** and
  reference the links from each task's `task.toml` and README.

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
| [foundation-engine](./tasks/foundation-engine/) | Index page runtime + editor page + data-driven JSON config structure | — |
