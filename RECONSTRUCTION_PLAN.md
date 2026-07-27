# Dungeoneers Reconstruction Plan

## Prototype Analysis (gamedev-laurentbecherel-mygame)

The existing prototype is a browser-based first-person dungeon crawler with:

**Architecture:**
- Pure ES modules, no build step, WebGL2 renderer
- `index.html` (game) + `editor.html` (tuning UI)
- Data-driven config in `config/config.js` + JSON assets in `src/assets/`
- localStorage persistence with versioned migration
- Dungeon generator: grid-based rooms → theme zones → BSP-like carve → paint materials
- Renderer: Doom-style column raycaster (DDA grid walk), palette + colormap, POM parallax, torch lighting

**Key subsystems identified:**
1. **Foundation / Config Engine** - central config.js, localStorage, JSON asset loader, editor UI writing to localStorage
2. **World Generation** - dungeon generator (rooms, corridors, themes, materials atlas)
3. **Materials System** - procedural texture atlases (albedo/normal/height/AO/roughness), PBR materials, JSON-driven
4. **Renderer GPU** - WebGL2 column raycaster, shaders, palette, POM, lights, particles
5. **Entities** - player controller (grid + free FPS), characters/NPC billboards, sprite PBR
6. **RPG Layer** - classes, boons, equipment, run loop (not yet wired to renderer)
7. **Editor** - live tuning UI with tabs for each subsystem

**What worked well in prototype:**
- Data-driven JSON assets editable via editor
- Central config with versioned migration
- Modular ES module structure by concern
- Editor <-> game via localStorage live updates

**What to improve in reconstruction:**
- Clearer task boundaries per feature
- Start with minimal foundation, build up incrementally
- Better separation: runtime game vs editor page from day 1
- Formalize JSON schema for assets
- Task structure matching ADO GameDev track spec

---

## Reconstructed Game: gamedev-laurentbecherel-dungeoneers

### Target Structure
```
gamedev-laurentbecherel-dungeoneers/
├── src/                  # gold game source, buildable
│   ├── index.html        # runtime game entry
│   ├── editor.html       # editor entry
│   ├── main.js
│   ├── editor.js
│   ├── config/
│   ├── world/
│   ├── render/
│   ├── entities/
│   ├── systems/
│   ├── ui/
│   ├── rpg/
│   ├── assets/           # JSON-driven materials, themes, architectures
│   └── style.css
├── README.md             # game description
└── tasks/                # one folder per feature task
    └── <task-name>/
        ├── instruction.md
        ├── task.toml
        ├── README.md
        └── screenshots/
```

### Proposed Task Breakdown (feature by feature)

> **Renumbering — 2026-07-27:** Original Tasks 3 (renderer-gpu-core), 5 (materials-pbr-system), and 6 (lighting-particles) merged into new Task 3 (renderer-3d) as a single coherent first-person rendering deliverable. Subsequent tasks renumbered accordingly. Original numbering preserved in parentheses below for reference.

**Task 1: foundation-engine** ← DONE
- Node.js server with unified asset REST API persisting JSON to disk
- index.html landing page + game.html + editor.html with shared design system
- config/ client module with asset API client, caching, CustomEvent dispatch
- assets/ JSON structure (materials, themes, architectures, config)
- editor with folder tree explorer + generic Visual/Raw JSON dual-mode editor
- Playwright E2E + Node unit test suites
- Deliverable: three HTML pages, config system working, editor edits JSON assets, persists to disk

**Task 2: dungeon-generator** ← DONE
- world/dungeon/generator.js: 10-stage intentional topology generator (main path + side branches, room roles, 5-zone theme progression, stair wall metadata, material assignment, deco flags)
- world/map.js query facade, world/items.js torch placement
- render/minimap.js parchment-style top-down 2D renderer with 3 modes (role/zone/material), legend, keyboard controls
- src/assets/config/generator.json dedicated config asset
- Deterministic seed, JSON-configurable params via generic editor
- Deliverable: generator produces walkable grid map with clear linear main path, game page shows parchment minimap, R regenerates, 1/2/3 switch modes

**Task 3: renderer-3d** ← NEXT — merges old 3 + 5 + 6
- render/renderer-gpu.js — GPURenderer class, WebGL2 context, fullscreen quad, framebuffers
- render/shaders.js — GLSL vertex + fragment with DDA grid walk, PBR BRDF, shadow raymarching, fog, POM parallax
- render/gl-utils.js — shader compile/link helpers with error logging
- render/map-upload.js — dungeon grid → GPU RGBA texture for texelFetch sampling
- world/materials.js — procedural PBR atlas generation (albedo, normal from height, height, roughMetal, AO, emissive) for 1 wall + 1 floor + 1 ceiling material
- entities/player.js — minimal WASD + QE turning with slide collision, emits point light
- systems/input.js — keyboard state tracking
- Config expansion: renderer section (FOV, texture filter), lights section (ambient, fog), player.light section, materialProc section — all editable via generic JSON editor
- Game page: 3D first-person view as default, M toggles minimap overlay, R regenerates, WASD+QE navigate
- Unit tests (materials atlas, player movement/collision, shader validity) + E2E tests (3D render, navigation, minimap toggle)
- Deliverable: walk through dungeon in first-person 3D with PBR materials, dynamic player light with shadows, fog, POM parallax depth, minimap overlay toggle

**Task 4: player-controller-polish** ← old Task 4, expanded scope
- entities/player.js enhancements: mouse look via pointer lock API, view bob with figure-8 path and 5 tunable parameters + presets, optional grid snap movement mode toggle
- systems/input.js extended for mouse delta accumulation
- Config tuning UI via generic editor (view bob presets, movement speeds, mouse sensitivity)
- Deliverable: full FPS controller feel with mouse look and view bob, editor tunes parameters

**Task 5: editor-complete** ← old Task 7
- editor/tabs/ for each subsystem with custom layouts (materials, generator, lights, player, renderer, themes, architectures) — replacing generic JSON form with purpose-built UI per subsystem
- Live preview integration, PBR material debugger page
- Deliverable: full editor parity with prototype, 14 subsystem tabs

**Task 6: characters-sprites** ← old Task 8
- entities/characters.js billboard sprites with directional facing
- render/character-billboard.js CPU sprite mode + render/sprite-gpu.js GPU mode
- Sprite atlas loading with PBR maps (albedo, normal, ORM)
- Shadow projection system (contact shadow + silhouette)
- Deliverable: NPCs in dungeon with torch shadows, G key toggles CPU/GPU sprite mode

**Task 7: rpg-trinity-loop** ← old Task 9
- rpg/classes.js Tank/Healer/DPS roles, rpg/equipment.js, rpg/boons.js, rpg/run.js
- Wire RunManager into game loop replacing debug free-roam
- Floor progression, chest interaction, boon pick UI, camp between floors
- Deliverable: trinity gameplay functional with role-based mechanics

**Task 8: ui-hud-polish** ← old Task 10
- ui/ui.js HUD expansion beyond minimap overlay
- Main menu, pause screen, results screen
- CRT post-processing aesthetic toggle option
- Deliverable: complete game shell with polished UI flow

---

## Next Steps

1. Create barebone repo structure for gamedev-laurentbecherel-dungeoneers
2. Initialize git repo (GitHub, not sapling)
3. Commit empty structure
4. Start Task 1 implementation: foundation-engine
