# Task 6: Lighting, Sprites & Particles — Dungeoneers

## Description

This task transforms Dungeoneers from a single-player-torch void into a breathing, populated dungeon where environmental lights — wall torches, standing braziers, hanging lanterns, occasional crystal glows — are placed as part of generation, each owning a point light with organic, non-sinusoidal flicker and a PBR billboard sprite that responds to the same lighting as walls.

Why it matters:

- **Game feel:** Wayfinding via inconsistent warm pools, not map markers. Seeing a distant glow down a dark corridor and walking toward it is classic crawler tension.
- **Visual quality:** The raycaster task locked materials to ID 1; without multi-lights the scene looks flat. Many lights with shadow raymarch show off PBR brick roughness variation and chamfer/corner shading.
- **Technical:** Requires upgrading the shader from single light to `MAX_LIGHTS` array (Doom-engine pattern, baked size), implementing organic flicker that does not look like `sin(time)`, and adding the sprite infrastructure already proven in `mygame` prototype (atlas registry + WeakMap GL cache + GPU instanced quads).
- **Data-driven future:** Sprite pools per zone/role/theme. Today we ship torch_wall + brazier_floor; tomorrow designers add theme-specific variants (mossy lantern for Sanctum, crystalline pulse for Exit) via JSON only, without code. This task establishes the registry + weighted-pool architecture.

## Avocado vs Claude Performance

- Avocado tends to succeed if instructed to reference `mygame`'s `sprite-atlas.js`, `sprite-gpu.js`, `lights.js`, and `particles.js` for structure, then adapt to dungeoneers' nested config layout.
- Common failure modes observed in prototypes:
  - Shader single-light -> multi-light change produces uniform mismatch (missing `u_numLights` or array size not matching `MAX_LIGHTS` exported constant)
  - Flicker implemented as bare `sin(time*6)` => looks mechanical, fails visual acceptance
  - Sprites floating because Z not anchored to `floorHeight`
  - Determinism broken by using `Math.random()` in generator instead of seeded RNG
  - Placeholder textures missing causes black quads or WebGL errors

Gold implementation keeps shader compile-safe, uses flicker organic factor with value-noise + warp + multi-octave + pop shaping, phases per torch, and anchors Z.

## Trajectory

- Branch: `task6-lighting-sprites`
- Gold commit: TBD
- Instruction: `./instruction.md`
- Reference prototype: `C:/aai/gamedev-laurentbecherel-mygame` (sprite-atlas, sprite-gpu, lights, particles, items, scene)

## Screenshots

- `screen-torch-wall.png` — wall sconce in corridor, warm pool, flame billboard lit
- `screen-brazier-floor.png` — standing brazier in treasure room, larger radius
- `screen-multi-lights.png` — several torches overlapping, no single-light flatness
- `screen-flicker-graph.png` — debug overlay of intensity over time showing non-sinusoidal pops
- `screen-sprite-pbr.png` — sprite debug: albedo / normal / ORM response to nearby light
- `screen-editor-sprites.png` — editor tree showing `config/lighting/sprites.json` and `light-types.json` editable

## Running

```
cd src && npm install && npm start
# http://localhost:8000/game.html
# Walk near torches, observe non-repeating flicker
# R regenerates, M map toggle, 1..8 debug still work
# Editor http://localhost:8000/editor.html -> lighting/sprites.json tweak
```
