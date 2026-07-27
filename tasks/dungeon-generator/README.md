# Task: dungeon-generator

## Description

Procedural dungeon generation subsystem for Dungeoneers — the second task in the reconstruction sequence, building on foundation-engine's config system, asset API, and editor shell. Implements a deterministic grid-based dungeon generator with MST connectivity, role-based room assignment, 5-zone theme progression, and a top-down 2D minimap renderer with toggleable visualization modes (role / zone / material) complete with legend, scale, and title overlay.

The minimap is the primary visual output of this task — a properly architected `MinimapRenderer` class with clean component separation, not a throwaway sketch. It serves as the foundation for the in-game HUD minimap in later tasks while proving the generator pipeline works end-to-end: config params → deterministic dungeon → visual grid → R-key regen → editor tuning reflected live.

## Avocado vs Claude Performance

TBD — task not yet implemented.

## Trajectory

TBD

## Screenshots

TBD — populate after golden implementation:
- `./screenshots/minimap-roles.png` — minimap in role visualization mode showing entrance, stairs, guardian, treasure, hub, secret color-coded
- `./screenshots/minimap-zones.png` — minimap in zone mode showing 5 theme zones with tint gradient
- `./screenshots/minimap-materials.png` — minimap in material mode showing wall/floor material IDs as distinct shades
- `./screenshots/editor-generator.png` — editor Generator tab with dungeon params and live seed input
