# Sewer Track and Structural Surface Features

Status: proposed implementation design
Target renderer: WebGPU grid raycaster at 640x360, nearest-sampled procedural materials, Doom-style palette quantization, modern PBR lighting and SSR
First feature: a straight, walkable sewer channel crossing a room, terminated by opaque round wall grilles

## 1. Decision summary

The sewer track must not be implemented as another channel in the existing material-modifier textures.

It is a connected world feature composed from several independent parts:

1. A **structural modifier** changes the floor's world-space profile.
2. A **lining** chooses how the cut surface inherits or replaces the host floor material.
3. A **liquid fill** occupies the channel independently of its shape.
4. A **wall fixture** composites an opaque round grille into the existing wall using POM and PBR.
5. Existing **material modifiers** such as moss, damage, and wetness may coat compatible resolved surfaces.

The intended pipeline is:

```text
semantic dungeon feature
    -> compiled structural cell data
    -> macro geometry hit
    -> resolved surface role and local coordinates
    -> composite micro-height/POM and material sample
    -> compatible material modifiers
    -> PBR lighting
    -> exact GBuffer surface response
    -> SSR
    -> Doom palette quantization
```

This separates a reusable `channel` shape from `water`, `blood`, `lava`, or no fill. A sewer track and a ritual blood channel can therefore share geometry without becoming special cases of one another.

## 2. Terminology

### Structural modifier

Changes macro geometry measured in world units and may affect traversal. Examples: channel, shallow pit, trench, raised dais.

### Material modifier

Changes a resolved surface's albedo, micro-normal, normalized micro-height, roughness, metalness, AO, or emissive response. Examples: moss, damage, puddle, wetness, blood stain.

### Fixture

A bounded object embedded in a host surface without changing map topology. Examples: opaque sewer grille, drain cover, wall relief, ritual seal. Fixtures may replace part of the host material and contribute composite POM height.

### Fill

A surface or volume placed inside compatible structural geometry. Examples: water, blood, lava, sludge, empty.

### Feature recipe

An authored combination of the above. `sewer_track` is a recipe, not a shader primitive.

## 3. Goals

- Preserve the original floor on the channel shoulders and the original wall outside each grille.
- Make the channel 75% of a tile wide and straight for the first prototype.
- Keep the channel walkable and leave dungeon reachability unchanged.
- Make grilles convincingly recessed and opaque; no ray passes through a wall.
- Reuse the existing PBR, lighting, shadow, palette, and SSR pipeline.
- Turn puddles and channel water into clients of one liquid-surface evaluator.
- Keep the normal no-feature rendering path cheap.
- Keep semantic feature data readable and independent from its GPU packing.
- Allow later recipes such as blood channels, lava channels, dry trenches, and shallow pits.
- Preserve stable, chunky pixel shapes and avoid modern subpixel shimmer.

## 4. Non-goals for the first prototype

- Transparent or refractive water.
- Looking through a grille or tracing geometry behind it.
- Swimming, buoyancy, underwater rendering, or fluid simulation.
- Curved channels, turns, junctions, waterfalls, or variable width along one instance.
- Arbitrary constructive solid geometry.
- Deep pits with overhangs or perfectly vertical interior walls.
- Liquid affecting navigation beyond an optional movement multiplier.
- Dynamic changes to channel topology at runtime.

The data format reserves four-direction connectivity so turns and junctions do not require replacing the feature model later.

## 5. Current renderer constraints

The design accounts for the current implementation rather than assuming a conventional mesh renderer.

- `src/render/shaders-wgsl.js` first performs a two-dimensional DDA wall search, then resolves floor or ceiling projection.
- Floor height is currently a per-cell scalar from `mapTex`; there is no sub-tile structural height query.
- `src/render/shader-lib/scene.wgsl.js` samples the base material, applies chamfers, then calls `applyModifiers`.
- `src/render/shader-lib/pom.wgsl.js` samples a single base height-array layer. A fixture cannot currently participate in POM.
- The raymarch pipeline already binds 16 sampled textures: two maps, twelve material arrays, and two material-modifier maps. Adding a feature texture would exceed the common per-stage baseline.
- The current GBuffer alpha is named and treated as a puddle mask. Its floor normal and puddle mask are reconstructed after shading rather than returned by the actual surface evaluation.
- The current puddle is a material overlay at the host floor plane. Its configured floor depression is not macro geometry.
- Player collision only distinguishes floor and wall cells. Player eye height does not sample a sub-tile floor profile.

These constraints lead to three foundational changes:

1. Structural cells use a read-only GPU storage buffer, not another sampled texture.
2. Horizontal intersections query a sub-tile macro-height function.
3. Shading returns exact normal, depth, roughness-derived reflection weight, and surface flags to the GBuffer.

## 6. Visual design

### 6.1 Channel profile

The first `stone_channel` profile uses one grid tile as its conceptual footprint:

- Total affected width: `0.75 m`.
- Original-floor shoulder: `0.125 m` on each side.
- Bank width inside the channel: approximately `0.12 m` per side.
- Flat bed width: approximately `0.51 m`.
- Bed depth: approximately `0.20 m` below the host floor.
- Water surface: approximately `0.10 m` below the host floor, producing `0.10 m` of visible water depth.
- Lip height: zero for the first walkable prototype.

The bank is a deliberately short beveled slope rather than a mathematically vertical wall. This keeps the surface single-valued, makes player movement smooth, and remains readable at 640x360. Strong macro normals, AO, material contrast, and a dark liquid edge make it read as a cut channel rather than a soft dent.

Conceptual cross-section:

```text
host shoulder       channel and fill        host shoulder
____________        ~~~~~~~~~~~~~~~~        ____________
            \______ water surface ________/
             \___________________________/
                         bed
|-- 0.125 --|--------- 0.75 ---------|-- 0.125 --|
```

The exact bank and fill widths are profile data, not constants in placement code.

### 6.2 Material preservation

Surface regions are explicit:

- `HOST_SHOULDER`: sample the room's original floor layer unchanged.
- `CHANNEL_BANK`: inherit the host floor or blend toward an optional lining layer.
- `CHANNEL_BED`: use the lining layer, or inherit the host for a carved-floor recipe.
- `LIQUID_SURFACE`: use the selected liquid evaluator.

The sewer preset defaults to a dark stone lining blended with the host on the banks. A ritual channel can instead use `inherit_host` so it looks carved directly into whatever floor the room already owns.

### 6.3 Round sewer grille

The grille remains an opaque wall hit. It creates an illusion of depth through composite POM and PBR:

- Circular diameter around `0.56 m`.
- Center around `0.25 m` above the host floor.
- A near-black, strongly occluded recessed cavity.
- A thick iron rim standing proud of the cavity.
- Five chunky vertical bars clipped to the circle, plus one horizontal brace.
- Rough, partially rusted metal with brighter worn edges.
- Reduced roughness and dark wet staining on the lower portion.
- Original wall material everywhere outside the circular coverage mask.

The grille should be generated at the same 64x64 virtual material resolution as other surfaces. Its smallest important bar or rim is at least 2-3 virtual texels wide. This makes it survive distance, nearest sampling, and palette quantization.

No alpha transparency is used. The dark cavity is an opaque PBR surface behind the raised rim and bars in the fixture height map.

### 6.4 Retro water language

Water should use modern lighting to clarify form without looking like a smooth contemporary shader:

- Dark blue-green or blue-gray base that remains distinguishable in the Doom palette.
- A mostly flat normal with two low-amplitude, world-locked ripple bands.
- Motion quantized to roughly 10-12 updates per second.
- Flow aligned to the channel axis and reversed by instance flow direction.
- Nearest-sampled or quantized world coordinates for stable ripple features.
- SSR sampled at the game's render resolution and palette-quantized with the final scene.
- Reflection broken by a small stable dither and roughness, not blurred into a photoreal mirror.
- A narrow, chunky dark/scum edge where water meets the banks.
- Optional brighter disturbance close to the upstream grille, without continuous fluid simulation.

Water geometry remains flat. Animation changes only its surface response, preventing intersection shimmer.

## 7. Semantic world model

The generator produces readable feature instances before anything is packed for the GPU:

```js
{
  id: 3,
  recipeId: 'sewer_track',
  roomIndex: 7,
  axis: 'north-south',
  flowDirection: 'south',
  geometryProfileId: 'stone_channel',
  liningMaterialId: 'sewer_lining',
  fillId: 'water',
  floorCells: [/* cell indices in order */],
  endpoints: [
    { cellIndex: 412, face: 'south', fixtureId: 'round_sewer_grille' },
    { cellIndex: 972, face: 'north', fixtureId: 'round_sewer_grille' }
  ]
}
```

Recommended dungeon additions:

```js
dungeon.features       // semantic instances for saves, debugging, and gameplay
dungeon.featureCells   // Uint32Array compiled from instances for renderer queries
```

Base `grid`, `floorMat`, and wall material IDs remain unchanged. Disabling features therefore restores the original dungeon surfaces without regenerating material assignments.

## 8. Compiled structural cell representation

Use one `u32` per dungeon cell in a read-only storage buffer:

```text
bits  0..7   feature kind
bits  8..11  NESW connection or affected-face mask
bits 12..19  geometry/fixture profile index
bits 20..27  fill index
bits 28..31  flags
```

Initial kinds:

```text
0  NONE
1  CHANNEL_FLOOR
2  ROUND_GRILLE_WALL
```

Initial flags include `FLOW_REVERSED`, `INHERIT_HOST`, and `DISABLE_COSMETIC_PUDDLE`.

Why a storage buffer:

- It does not consume a seventeenth sampled-texture slot.
- Integer decoding is exact and nearest by definition.
- At typical dungeon sizes it costs only tens of kilobytes.
- It supports 256 kinds, profiles, and fills without constraining the semantic model.
- It can later include an instance-index buffer if per-instance state becomes necessary.

The buffer is compiled by a pure module, proposed as `src/world/structural-features.js`. GPU packing must not leak into generator placement logic.

## 9. Renderer architecture

### 9.1 Separate macro geometry from micro-height

Two height domains must remain distinct:

- `macroHeight`: world-space meters used for ray intersection and walking.
- `microHeight`: normalized material height used by POM.

Existing material modifiers operate in the second domain. A channel operates in the first. The two must never be accumulated into the same scalar.

### 9.2 Ray and hit context

Derive a vertical ray slope once per fragment so any point along the horizontal DDA distance has an exact world Z:

```text
worldXY(t) = playerXY + rayXY * t
worldZ(t)  = eyeZ + raySlopeZ * t
```

Replace projected wall-span reconstruction with a small hit context:

```wgsl
struct HitContext {
  worldPos: vec3<f32>,
  distance: f32,
  geometricNormal: vec3<f32>,
  surfaceKind: u32,
  region: u32,
  hostMaterial: i32,
  featureWord: u32,
  localUV: vec2<f32>,
}
```

This is still a grid raycaster. It does not introduce general mesh traversal.

### 9.3 Horizontal macro-surface query

Add a pure WGSL query:

```wgsl
fn resolveFloorGeometry(worldXY: vec2<f32>, hostHeight: f32) -> FloorGeometry
```

For an ordinary cell it returns the current host height and an up normal. For a channel it:

1. Decodes the connection mask to choose along/across axes.
2. Computes signed distance from the channel center.
3. Evaluates shoulder, bank, bed, and liquid regions.
4. Returns render height, walk height, macro normal, region, edge factor, flow coordinates, and fill ID.

The floor intersection solver iterates the height query a small fixed number of times. Ordinary cells retain the cheap constant-height path. Channel banks use a smooth monotonic profile to avoid fixed-point oscillation.

### 9.4 Wall base near a channel

At a grille endpoint, the wall must visually extend down to the channel bed instead of stopping at the unmodified host floor.

The wall candidate uses its local horizontal coordinate to query the endpoint channel cross-section. The fragment's `worldZ(t)` is tested against that local wall base and the ceiling. Wall UV V should be world-height anchored rather than stretched between a variable floor and ceiling.

This also removes the current approximation where `shadeWallCell` reconstructs world Z from `(1-wallV)*1.15`.

### 9.5 Surface-frame normals

Channel banks need a tangent frame derived from their macro normal. Base or lining normal maps are transformed through this frame, then cosmetic modifiers operate on the resulting world normal.

The liquid surface uses a flat macro normal plus its quantized ripple normal. It does not inherit the bank or floor normal map.

### 9.6 Composite POM

POM must sample the same micro-height composition as final shading:

```wgsl
fn sampleCompositeMicroHeight(ctx: SurfaceContext, uv: vec2<f32>) -> f32
fn sampleCompositeSurface(ctx: SurfaceContext, uv: vec2<f32>) -> SurfaceSample
```

For an ordinary surface these functions sample one base array layer and preserve current behavior. For a wall fixture they sample both:

- the host wall layer; and
- the fixture material layer.

Fixture albedo alpha is its coverage mask. Inside coverage, fixture height, normal, albedo, and RMA replace or blend with the host. Outside coverage, the original wall sample remains exact.

This requires a specialized composite POM loop but no additional sampled texture. The fixture is stored as a non-assignable layer in the existing wall material arrays.

### 9.7 Material layers used by features

Add material metadata such as:

```json
{
  "name": "round_sewer_grille",
  "type": "round_grille_fixture",
  "assignable": false,
  "tag": "fixture"
}
```

and:

```json
{
  "name": "sewer_lining",
  "type": "channel_stone",
  "assignable": false,
  "tag": "lining"
}
```

`assignable:false` prevents room material selection from choosing these layers as ordinary walls or floors. They still reuse the existing wall/floor albedo, normal, height, and RMA arrays.

## 10. Generalized liquid surface

### 10.1 One evaluator, two placement modes

Create one liquid evaluator used by:

- puddles: masked material overlays at the host floor plane; and
- structural fills: explicit macro surfaces inside channels or pits.

Conceptual API:

```wgsl
fn evaluateLiquidSurface(
  liquidId: u32,
  worldPos: vec3<f32>,
  flowDir: vec2<f32>,
  coverage: f32,
  edgeFactor: f32,
  underlyingAlbedo: vec3<f32>,
  shallowDepth: f32
) -> LiquidSample
```

`LiquidSample` contains albedo, world normal, roughness, metalness, AO, emissive, and reflection weight.

Puddle noise remains responsible for puddle coverage. Once coverage is known, puddles stop owning a separate hard-coded water shading implementation.

### 10.2 GBuffer contract

Shading functions should return a richer result:

```wgsl
struct ShadeResult {
  color: vec3<f32>,
  worldNormal: vec3<f32>,
  linearDepth: f32,
  reflectionWeight: f32,
  surfaceFlags: u32,
}
```

The raymarch pass writes the actual resolved values:

```text
GBuffer R,G  octahedral world normal
GBuffer B    linear depth / configured depth range
GBuffer A    reflection weight
```

GBuffer A is no longer semantically a `puddleMask`. The SSR pass consumes `reflectionWeight`, which already incorporates liquid coverage and roughness suitability.

This removes the current duplicate puddle-mask and flat-normal reconstruction at the end of `fsRaymarchWgsl`.

### 10.3 SSR migration

Keep the existing screen-space reflection pass and sprite-aware scene texture. Generalize names and gates:

```text
puddleMask          -> reflectionWeight
minPuddleMask       -> minReflectionWeight
puddleMaskInfluence -> reflectionWeightInfluence
puddleOnly          -> reflectiveSurfacesOnly
```

Compatibility aliases may load existing `ssr.json` keys during migration.

Water receives a high reflection weight. Fresh blood may receive a modest value. Dried blood and lava receive little or none. Non-liquid polished materials can use the same contract later without pretending to be puddles.

### 10.4 First liquid profiles

Only water must be production-ready in the first prototype, but the interface should support:

| Fill | Roughness | Reflection | Emission | Motion |
|---|---:|---:|---:|---|
| water | low | high | none | flowing ripples |
| blood | medium | low-medium | none | slow viscous flow |
| lava | medium | none | high | stepped cellular drift |
| sludge | high | low | optional | very slow drift |

Puddles use the water profile with zero flow and their existing organic coverage mask.

## 11. Composition with material modifiers

Resolved surfaces carry compatibility flags rather than relying only on `isFloorSurface`:

```text
ALLOW_MOSS
ALLOW_DAMAGE
ALLOW_WETNESS
ALLOW_PUDDLE
IS_HOST
IS_LINING
IS_FIXTURE
IS_LIQUID
```

Initial rules:

- Host shoulders: current modifier behavior.
- Channel banks and bed: moss, damage, and wetness allowed.
- Grille metal: wetness and selected damage/rust allowed; moss optional near the lower rim.
- Liquid: no moss, damage, or cosmetic puddle overlay.
- Feature cells disable generated puddles where the structural fill already occupies the channel.

Composition order:

```text
host or lining sample
    -> fixture replacement where applicable
    -> structural edge treatment
    -> compatible environmental material modifiers
    -> liquid replacement where the liquid is the visible macro surface
    -> lighting
```

The implementation may evaluate the liquid earlier for hit classification, but its final PBR sample remains isolated from solid-surface modifiers.

## 12. Player traversal and gameplay queries

The feature is walkable because it does not change `dungeon.grid` or pathfinding connectivity.

Add a CPU-side query based on the same profile data:

```js
sampleWalkSurface(dungeon, x, y) -> {
  height,
  normal,
  featureKind,
  fillId,
  liquidDepth
}
```

The player stands on the bed or bank, not on the liquid render plane. Eye Z becomes:

```text
smoothed ground height + configured eye height
```

Both free movement and grid movement use the query. Grid mode naturally moves through the channel center and visibly dips into it. Ground-height smoothing should be short enough to communicate the step but avoid one-frame camera snapping.

Collision remains the current wall-cell collision for the first prototype. Optional later behavior can use `fillId` and `liquidDepth` for movement drag, footsteps, splashes, particles, or sound.

Items and floor-anchored sprites should initially avoid channel cells. Later they should use `sampleWalkSurface` instead of the per-cell `floorHeight` scalar.

## 13. Generator placement

Placement occurs after rooms and corridors exist and after room roles are known, but before feature buffers and decoration placement are finalized.

First-prototype algorithm:

1. Find eligible rooms with an interior span of at least five tiles.
2. Exclude the entrance, exit, stair walls, spawn-safe cells, and rooms whose door arrangement would make the result visually confusing.
3. Prefer a hub, hall, guardian, or sufficiently large shrine.
4. Select the longer room axis, with a deterministic seeded tie-break.
5. Select a central or slightly off-center row/column that does not overlap a doorway.
6. Mark every interior floor cell across the room with the straight channel connection mask.
7. Mark the two perimeter wall cells as grille fixtures facing into the room.
8. Choose a deterministic flow direction along the axis.
9. Reserve the floor cells from incompatible puddle placement and ordinary prop placement.
10. Validate that both wall endpoints and every intervening cell are coherent; otherwise discard the candidate.

The prototype should guarantee one sewer track in a deterministic showcase mode. Once visually validated, normal generation can use role weights and a per-level maximum.

The line does not carve wall cells and therefore cannot create map leaks.

## 14. Proposed configuration

### `assets/config/geometry/structural-features.json`

```json
{
  "version": 1,
  "enabled": true,
  "profiles": {
    "stone_channel": {
      "type": "channel",
      "width": 0.75,
      "depth": 0.20,
      "bankWidth": 0.12,
      "waterDepth": 0.10,
      "lipHeight": 0.0,
      "walkable": true,
      "liningMode": "blend_host",
      "liningMaterial": "sewer_lining",
      "liningStrength": 0.7
    }
  },
  "fixtures": {
    "round_sewer_grille": {
      "material": "round_sewer_grille",
      "diameter": 0.56,
      "centerHeight": 0.25,
      "pomStrength": 0.09,
      "wetLowerFraction": 0.35
    }
  },
  "recipes": {
    "sewer_track": {
      "geometry": "stone_channel",
      "fill": "water",
      "endFixture": "round_sewer_grille"
    },
    "ritual_blood_channel": {
      "geometry": "stone_channel",
      "liningMode": "inherit_host",
      "fill": "blood",
      "endFixture": "round_sewer_grille"
    }
  },
  "generator": {
    "prototypeGuarantee": 1,
    "maxPerLevel": 1,
    "minRoomSpan": 5,
    "preferredRoles": ["hub", "hall", "guardian", "shrine"],
    "excludedRoles": ["entrance", "exit"]
  }
}
```

Dimensions and POM/PBR response are live-editable Tier 1 when stored in GPU uniforms. Generator placement and recipe changes are Tier 3 because they require recompiling dungeon feature cells.

### `assets/config/rendering/liquids.json`

```json
{
  "version": 1,
  "enabled": true,
  "liquids": {
    "water": {
      "shallowColor": [42, 65, 72],
      "deepColor": [12, 25, 32],
      "roughness": 0.10,
      "reflectionWeight": 0.9,
      "normalAmplitude": 0.07,
      "rippleScale": 3.0,
      "flowSpeed": 0.08,
      "animationHz": 12,
      "edgeDarkening": 0.35,
      "emissive": [0, 0, 0]
    }
  }
}
```

The current puddle color, roughness, ripple, and reflection fields migrate to the water profile where they represent liquid behavior. Puddle-specific coverage noise stays in `material-modifiers.json`.

## 15. Performance strategy

- Feature buffer lookup is one exact `u32` load only where a surface cell is evaluated.
- `NONE` is an immediate fast path matching current geometry and material behavior.
- No new fullscreen pass is added.
- No seventeenth sampled texture is added.
- Grille fixture layers reuse existing wall material arrays.
- Channel lining layers reuse existing floor material arrays.
- Only feature cells perform macro-profile evaluation and composite material sampling.
- Water reuses the existing SSR pass and GBuffer attachment.
- Ripple animation never changes macro height.
- POM remains bounded by the existing maximum offset and grazing fade.
- Structural profiles use analytic one-dimensional cross-sections, not iterative SDF raymarching.

Performance should be measured at 640x360 in a view dominated by ordinary cells and in a worst-case close view of the channel plus both grilles. The disabled-feature frame must remain visually identical and should have negligible measurable regression.

## 16. Implementation sequence

### Phase A: feature data without visuals

- Add structural feature constants, semantic instance validation, compiler, and bit decoding.
- Add generator placement in guaranteed showcase mode.
- Upload `featureCells` as a read-only storage buffer.
- Add CPU unit tests for deterministic placement, packing, endpoints, and unchanged walkability.
- Add a debug visualization for feature kind, connectivity, region, and fill.

### Phase B: macro channel geometry and player height

- Introduce world-Z ray slope and a horizontal macro-surface query.
- Implement the straight channel cross-section and macro normal.
- Return exact hit position and normal from floor shading.
- Add `sampleWalkSurface` and use it for player ground/eye height.
- Mask incompatible grid chamfer, baseboard, puddle, and prop behavior inside feature regions.

### Phase C: grille fixture and composite POM

- Add non-assignable `sewer_lining` and `round_sewer_grille` material layers.
- Generate the grille's coverage, PBR, and height maps at 64x64.
- Add composite height sampling to wall POM.
- Composite fixture and host wall PBR using the same coverage sampled by POM.
- Extend wall base and world-Z mapping at channel endpoints.

### Phase D: liquid unification

- Extract water response from the current puddle modifier into `evaluateLiquidSurface`.
- Use it for both puddle coverage and explicit channel fill.
- Replace reconstructed GBuffer puddle data with exact `ShadeResult` output.
- Generalize SSR naming and config while accepting old keys as aliases.
- Add axis-aligned, time-quantized channel flow.

### Phase E: composition and polish

- Add compatibility flags for moss, damage, wetness, puddles, fixtures, and liquids.
- Tune palette-safe water colors, metal response, AO, bar thickness, and reflection breakup.
- Add normal generation rules and role-weighted placement after the showcase is approved.
- Add ritual blood-channel config as a composition proof, even if blood liquid rendering remains provisional.

## 17. Proposed file responsibilities

- `src/world/structural-features.js`: semantic validation, packing, decoding, CPU profile query.
- `src/world/dungeon/generator.js`: placement policy and feature instances only.
- `src/render/shader-lib/features.wgsl.js`: packed-cell decoding and macro channel profile.
- `src/render/shader-lib/liquids.wgsl.js`: reusable liquid surface evaluation.
- `src/render/shader-lib/material.wgsl.js`: host/lining/fixture material access.
- `src/render/shader-lib/pom.wgsl.js`: base and composite POM samplers.
- `src/render/shader-lib/scene.wgsl.js`: hit-context shading and exact `ShadeResult`.
- `src/render/shaders-wgsl.js`: ray/hit orchestration and GBuffer contract.
- `src/render/renderer-gpu.js`: structural buffer, profile/liquid uniform packing, bindings, live updates.
- `src/entities/player.js`: ground-height consumption, not profile math.
- `src/assets/config/geometry/structural-features.json`: profiles, fixtures, recipes, placement.
- `src/assets/config/rendering/liquids.json`: liquid PBR, motion, and reflection response.

The old `src/world/modifiers.js` remains responsible for continuous material-modifier fields and should not compile structural features.

## 18. Tests and visual proof

### Unit tests

- Structural word pack/unpack is exact for all connection masks.
- Same seed produces identical feature instances and cell buffers.
- A disabled feature system produces an all-zero structural buffer.
- Sewer placement never changes `grid` walkability.
- Both north-south and east-west profiles are symmetric.
- Channel width is exactly 0.75 at the host-floor boundary.
- Walk height follows shoulder, bank, and bed continuously.
- Both grilles point toward the same channel and use the correct host wall cells.
- Feature materials marked `assignable:false` are never selected for rooms.
- Puddle and channel water call the same liquid-response defaults.

### Shader and renderer tests

- Feature buffer binding validates on the WebGPU baseline.
- Feature-disabled shader output matches the current clean surface path.
- GBuffer normal and depth match the resolved channel water surface.
- Reflection weight is zero on banks and nonzero on configured water.
- The grille's composite height and final PBR use the same coverage mask.
- POM grazing clamps prevent the round fixture from smearing outside its tile.

### Required screenshots

1. Looking across the channel, showing both preserved shoulders, banks, and lowered water.
2. Looking along the channel toward a grille, showing flow direction and alignment.
3. Close grille view on brick, demonstrating preserved host wall, cavity depth, metal bars, and wet lower rim.
4. The same grille on rough stone, proving host independence.
5. Puddle and channel water in one scene, proving shared visual language but different geometry.
6. Modifier composition: moss or damage on a bank/grille without affecting the liquid.
7. Authentic palette on/off comparison to verify the retro result remains intentional.
8. Structural debug view showing feature cells and regions.

## 19. Acceptance criteria

- A straight sewer track crosses one generated room and occupies a one-tile cell band with a 75% channel profile.
- The player can cross, enter, and leave it in grid and free movement modes.
- The camera follows the bed/bank smoothly.
- The original floor is visible on both shoulders.
- The original wall remains visible outside each circular grille.
- Both endpoint grilles are opaque and convincingly recessed through POM/PBR.
- Channel water and puddles share the same liquid evaluator.
- Channel water receives SSR using its actual hit normal, depth, and reflection response.
- Reflections and motion remain stable, chunky, and palette-compatible at 640x360.
- Disabling structural features restores the existing dungeon without changing material assignments.
- Ordinary rooms do not pay for a general geometry raymarch.
- A ritual blood-channel recipe can replace water without changing channel intersection code.

## 20. Deliberate future extension points

- Turns and junctions use the existing NESW mask.
- A shallow pit can use another single-valued macro-height profile.
- A deep pit or overhang can add a new intersection mode without redefining material modifiers or fills.
- Bridges become fixtures or local structural overrides above a channel.
- Lava uses the same fill interface with emissive response and reflection disabled.
- Dynamic fill levels can alter render height while keeping the structural bed unchanged.
- More feature instances can add a separate instance-state buffer without changing cell semantics.
- Unified material arrays could later free more sampled-texture bindings, but they are not required for this prototype.
