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

**Task 1: foundation-engine** ← FIRST TO BUILD
- index.html runtime page + editor.html editor page
- config/ with central config.js (defaults + localStorage + versioned migration + live getters)
- assets/ JSON structure (materials/walls.json, floors.json, ceils.json, architectures.json, themes/themes.json)
- Minimal main.js bootstrap + editor.js UI shell
- Data-driven pipeline: JSON assets loadable/editable, editor writes to localStorage, game reads on boot
- Empty render placeholder (canvas clears, no game yet)
- Deliverable: two HTML pages, config system working, editor can edit JSON-like values, persists to localStorage

**Task 2: dungeon-generator**
- world/dungeon/ generator.js: rooms → corridors → theme zones → carve → paint
- world/materials.js procedural texture atlas stub
- world/map.js façade
- Deterministic seed, JSON-configurable params
- Deliverable: generator produces walkable grid map, editor shows params, game can regen with R key

**Task 3: renderer-gpu-core**
- render/renderer-gpu.js WebGL2 setup, column raycaster skeleton
- render/shaders.js GLSL, render/gl-utils.js, render/palette.js
- Basic wall/floor/ceiling rendering, no POM yet
- Deliverable: first-person view of generated dungeon, navigable

**Task 4: player-controller**
- entities/player.js FPS controller (WASD + mouse, grid mode toggle)
- systems/input.js
- Collision, view bob params in config
- Deliverable: walk around dungeon, editor tunes movement

**Task 5: materials-pbr-system**
- Procedural PBR texture generation (albedo/normal/height/AO/roughness/metal)
- JSON material definitions with architecture shapes, story tags, emissive
- POM parallax mapping
- Deliverable: rich material visuals, editor edits materials live

**Task 6: lighting-particles**
- systems/lights.js (torch flicker, sun, ambient, fog)
- systems/particles.js (torch flame/smoke)
- Light types JSON registry
- Deliverable: atmospheric torch-lit dungeon

**Task 7: editor-complete**
- editor/tabs/ for each subsystem (materials, generator, lights, player, renderer, themes, architectures)
- Live preview, JSON export/import
- Deliverable: full editor parity with prototype

**Task 8: characters-sprites**
- entities/characters.js billboard sprites
- render/sprite-gpu.js PBR billboard shader
- Sprite atlas + PBR params in config
- Shadow projection system
- Deliverable: NPCs in dungeon with torch shadows

**Task 9: rpg-trinity-loop**
- rpg/classes.js Tank/Healer/DPS roles
- rpg/equipment.js, boons.js, run.js
- Wire into game loop: aggro, threat, heal, DPS mechanics
- Deliverable: trinity gameplay functional

**Task 10: ui-hud-polish**
- ui/ui.js HUD minimap + stats
- Main menu, pause, results screens
- CRT post-processing aesthetic toggle
- Deliverable: complete game shell

---

## Next Steps

1. Create barebone repo structure for gamedev-laurentbecherel-dungeoneers
2. Initialize git repo (GitHub, not sapling)
3. Commit empty structure
4. Start Task 1 implementation: foundation-engine
