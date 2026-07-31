# Live Edit — Task 7 (DRAFT)

Current editor requires Save + R reload to see config changes. This task adds Unity-like live tuning: editor tab tweaks JSON, game tab reflects instantly.

See `instruction.md` for rough draft architecture. Final spec will be refined on branch.

## Intent
- Two tabs workflow: editor.html + game.html side-by-side
- Fine-tune light flicker, roughness multipliers, chamfer sizes, fog, bevelStart/bevelDepth, etc live
- Save semantics: either auto-save on tweak or preview-only + explicit save (hybrid recommended)

## High-level architecture (to implement)
- Server SSE endpoint `/api/watch` broadcasting `asset-updated` on PUT
- Client `LiveConfigManager` with EventSource + BroadcastChannel + polling fallback
- Editor: Live Edit toggle + Auto Save toggle + debounced PUT + instant BroadcastChannel preview
- Game: subscribe to live updates, categorize hot-reloadable (uniforms) vs atlas-rebuild (materials-proc) vs regen-required (generator)
- Renderer methods: `updateFog`, `reuploadAtlases`, `updateConfig`
- LightManager: `updateFromConfig` for flicker live
- HUD indicator for live updates

## Status
- Task folder created on main (rough draft)
- Branch `task7-live-edit` to be created next
