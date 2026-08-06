# Dungeon architecture and room-type system

## Purpose

Architecture and type solve different problems:

- **Architecture** is the construction language and history of a region: brick dungeon, dark dungeon, stone castle, natural grotto, or wooden undercroft. It owns material families, palette accents, age/environment modifiers, decoration tendencies, and architectural preferences.
- **Type** is the local treatment of a room inside that language: plain, sophisticated, colonnade, arcaded, or fortified. It owns room-role preferences, repetition limits, structural intent, and local modifier/deco multipliers.

The generator must produce something that appears built and adapted over time, not a bag of independently rolled rooms.

## Story rules and invariants

1. A level begins with one weighted dominant architecture.
2. The main path can introduce only a configured number of additional architectures (two by default).
3. Architecture changes happen only after a minimum region length, creating contiguous regions.
4. A side branch normally inherits the architecture of its hub. An exception may choose only an architecture already introduced on the main path.
5. Room types are weighted by room role, architecture preference, and architecture-specific role overrides.
6. Type adjacency persistence creates motifs; `maxConsecutive` prevents a motif becoming monotonous.
7. Corridors and wall shells inherit their nearest room. This makes transition boundaries spatially legible.
8. All random choices derive from dungeon seed and room position. Identical configuration and seed produce identical plans.

## Selection pipeline

The topology generator first places rooms, connects them, and assigns depth, zone, and story role. Architecture planning then runs in two passes:

1. Walk the intentional main path and build contiguous architecture regions.
2. Attach side rooms to those regions.
3. Walk the main path again and choose role-aware room types with persistence and repetition control.
4. Choose side-room types, normally inheriting their hub motif.
5. Resolve wall/floor/ceiling material IDs from `architecture.materials[type]`.
6. Bake numeric architecture/type maps for every cell using nearest-room inheritance.

The architecture choice never changes topology. It changes presentation and modifier probability, so alternate architecture sets remain mechanically compatible.

## Configuration contract

The source of truth is `src/assets/materials/architectures.json`.

`selection` contains all level-scale behavior:

- active architecture IDs
- maximum architectures per level
- transition probability and minimum region length
- side-branch architecture/type inheritance probabilities
- type adjacency persistence
- corridor inheritance policy

Each entry in `types` contains:

- stable string and numeric IDs
- base weight and per-role weights
- maximum consecutive uses
- decoration and modifier multipliers
- structural intent such as vault type and metal detailing
- story tags for future encounter/prop systems

Each entry in `architectures` contains:

- stable string and numeric IDs
- base, zone, role, type, and role/type weights
- two palette accent ramps
- material triplets for every type
- modifier multipliers
- absolute decoration chances
- story tags and author-facing description

Numeric IDs are diagnostic/save-data IDs and should remain stable. String IDs are authoring/API identifiers and should not be renamed after content ships.

## Rendering and palette behavior

Each architecture/type resolves actual procedural PBR layers for walls, floors, and ceilings. The material arrays contain albedo, normal, height, roughness, metalness, emissive, and AO data.

The procedural vocabulary stays deliberately chunky: brick and ashlar use sparse face flecks and occasional hairline damage; timber uses quantized grain bands, staggered joints, knots, and rare nails; grotto rock uses wandering courses and chipped corners; reinforced panels use broad plates, rivets, sparse scratches, and rare oxidation. Details occupy one or two texels and broad neighboring areas remain calm, preserving the retro pixel-art read.

The dominant architecture supplies the level palette's two accent ramps. Local architecture material colors preserve readable regional transitions even though palette quantization is level-wide. A future renderer may consume `dungeon.architectureMap` for per-pixel local palette remapping without changing generation data.

Architecture and type multiply story modifier placement (moss, puddles, blood, dust, and damage). Decoration probabilities also respond to the combination: grotto regions grow roots and moss, colonnades place columns, arcades favor arches, and fortified rooms favor beams/metal treatment.

## Editor workflow

Select `assets / materials / architectures.json` in the world editor. Above the generic editable form, the material browser displays every architecture/type combination and all three surfaces.

Preview modes:

- Simulated PBR (default), with movable fake light
- Albedo
- Normal
- Height
- Roughness / metalness / AO packed channels

The preview is generated from the same material definitions and CPU texture baker used by the game. It is not a separately maintained concept image.

Changes to architecture selection require regeneration (T3). Changes to wall/floor/ceiling material definitions rebuild material arrays (T2).

## In-game diagnostics

Press **I** or use the **IDs I** button to replace the rendered view with a top-down construction grid:

- `A#` is the stable architecture numeric ID.
- `T#` is the stable type numeric ID.
- Cell color identifies architecture.
- Dim cells are walls; bright labeled cells are traversable space.
- The player is shown as a pale marker.

This view deliberately bypasses visual texture/PBR judgment. It answers whether the authored construction story is coherent before artists tune individual materials.

Press **H** to cycle through active architectures. The dungeon seed is retained by default, so topology, rooms, and roles stay fixed while materials, palette accents, modifiers, and decoration tendencies change. The selected architecture remains forced for subsequent `R` regenerations. Press **Shift+H** to restore automatic weighted, multi-region architecture selection. The key and seed-retention behavior are configurable in `config/ui/debug.json`.

## Extension rules

- Add a new type only after defining its role weights and material mapping for every active architecture.
- Add a new architecture only after defining all type mappings, palette ramps, modifier/deco behavior, and zone weights.
- Material IDs referenced by architecture mappings must exist within the renderer's eight-layer surface limit.
- Structural-only material layers remain non-assignable and must not be used in architecture mappings.
- Prefer strengthening role/type weights over hard-coded generator exceptions.
- Keep the default architecture count low. A single coherent language with room-level variation should be more common than a multi-architecture level.
