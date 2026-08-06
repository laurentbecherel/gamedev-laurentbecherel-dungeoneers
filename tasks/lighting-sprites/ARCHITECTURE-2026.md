# Composed lighting fixtures

## Goal

A light prop is a composed fixture, not one billboard that also pretends to be
its flame. The fixture manifest is the single source of truth for directional
art, material channels, attachment sockets, effect layers and the light
profile. Generation, runtime rendering and the editor use the same socket and
frame-resolution functions.

## Data flow

```text
fixtures.json
  -> sprite registry (render metadata and texture channels)
  -> dungeon generation (fixture base + light socket)
  -> renderer (directional base + animated layers + particles)
  -> Lighting Lab (same view/frame/socket resolution)
```

`systems/fixtures.js` is the boundary shared by those consumers. World-space
sockets use `[forward, right, up]`, with fixture forward derived from
`wallDir`. This removes camera-specific offsets and keeps the flame, smoke and
light together in every orientation.

Fixture placement is architectural rather than categorical. Each composed
fixture declares a `floor`, `ceiling`, or `wall` contact anchor; the dungeon
generator and Lighting Lab resolve the same pivot-aware bottom-edge Z and wall
inset. Hanging fixtures use the generated cell's actual ceiling height. This
keeps feet, chains, wall brackets, particles and light sockets in registration
when sprite dimensions or room heights change.

## Runtime composition

The fixture library contains:

- four-cell wall-torch, brazier, lantern and crystal atlases with albedo,
  height-derived normal, ORM and emissive maps;
- a twelve-frame emissive flame layer attached to the `flame` socket;
- seeded smoke and spark emitters attached to named sockets;
- a point light generated at the `light` socket, rather than at the bottom of
  the base sprite.
- heat-haze layers accumulated into a floating-point displacement target and
  sampled before final world-palette quantization.

Fixture layers and particles are ordinary sprite instances after expansion,
so they reuse atlas batching, occlusion, fog and capacity limits. Visual
particle RNG streams are seeded per fixture and cannot affect dungeon state.

## Light and shadow contract

Flicker/pulse intensity is resolved once on the CPU and the identical value is
uploaded to world and sprite passes. The old second shader sine modulation is
intentionally removed.

World surfaces retain their grid DDA shadow trace. Sprite fragments now bind
the same occupancy map and run a bounded trace toward shadow-casting point
lights, so a billboard behind a wall no longer receives the light through the
wall. `systems/shadow-visibility.js` is a deterministic CPU reference for a
future per-light polar visibility cache and powers the editor's Shadow view.

## Editor contract

Lighting Lab appears for fixtures, sprite, particle and light-type configs. It
provides:

- all four resolved camera views;
- final, albedo, normal, ORM, emissive and shadow channels;
- play/pause and deterministic smoke/spark simulation;
- named socket overlays and manifest validation.

The preview deliberately imports the runtime fixture helpers. A change cannot
silently acquire a second interpretation in editor-only code.

## Next increments

1. Promote the polar visibility reference into a GPU cache (one angular row
   per active shadow-casting light), rebuilt only when a light changes cell or
   the occupancy revision changes. World and sprite shaders then sample the
   same cache.
2. Add socket dragging and particle parameter
   controls to Lighting Lab; edits continue to save through the existing JSON
   editor.

## Performance guards

- 512 expanded sprite instances per frame;
- 256 visual fixture particles by default;
- 32 DDA steps for sprite-to-light shadow checks;
- distance and wall-occlusion culling before sprite submission;
- texture loading and registry entries cached per GPU device.
