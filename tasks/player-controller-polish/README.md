# Task: player-controller-polish

## Description
Full FPS controller feel polished on top of Task 3's 3D renderer. Brings back the prototype's authentic Grimrock grid-step mode (discrete tile lerp + hold-to-repeat + buffered turn + cardinal snap) as default ON, plus Doom free-roam WASD+QE+mouse look with slide collision, and figure-8 view bob (vertical sin(phase*2) + horizontal sin(phase) + roll) with 5 tunable params + presets (subtle/default/heavy/disabled). Mouse look uses Pointer Lock API via canvas click. Grid mode toggled via G, bob via V/B, all tunable in `assets/config/gameplay/player.json` via generic editor persisting to disk.

## Avocado vs Claude Performance
TBD — draft phase.

## Trajectory
TBD

## Screenshots
TBD — expected: grid ON vs OFF HUD, bob ON vs OFF while walking, mouse look active, editor showing expanded player.json.
