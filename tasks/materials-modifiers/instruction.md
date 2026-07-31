# Materials Modifiers - Dungeoneers Task 9

> Existing PBR materials (brick walls, stone slab floors/ceilings) are procedurally generated but look too clean and uniform across the whole dungeon. We need a **material modifier system** that adds smart variations over base materials: moss, damage, water wetness, puddles, blood, dust. Each modifier dramatically alters albedo, normals, PBR (roughness/metal) and POM (height) based on a compiled noise mask and existing material cues (roughness, height, AO).

## 1. Designer Intent

As a player, I want the dungeon to feel lived-in, aged, and telling a story without adding new geometry or decals as separate meshes.

- **Variations on existing PBR**: Modifiers sit *on top* of the current procedural material atlases. They do not replace materials, they alter them: darken/green-shift albedo for moss, add streaks for water, make puddle reflections, darken cracks for damage, splatter patterns for blood, desaturate for dust.
- **Smart masking**: Where a modifier appears is not random splat everywhere. It uses a **noise function** compiled / evaluated (mask) combined with material cues:
  - Use **AO** (ambient occlusion from grout/cracks) to know where dirt/moss collects.
  - Use **height** (bump from procedural material) to know low vs high points, edges.
  - Use **roughness** variation as seed.
  - Optional: world position / surface orientation / height in world (floor near walls, etc).
- **Six modifiers, each distinct**:
  - **moss**: organic, clumpy, green-yellow albedo shift, highly rough, adds height (spongy), normal perturbed toward lumpy moss, more in AO crevices, damp corners, near roots, walls low parts.
  - **damaged**: cracks, chips, edge wear, blackened albedo in cracks, sharper normal breaks, lower height in chipped areas, rougher, appears along edges, high traffic.
  - **water**: wetness sheen / darkened albedo with streaks, reduced roughness (specular), flattened normal slightly, slight height darkening, vertical streaks on walls, more near water sources, low floors.
  - **puddle**: standing water on floors only - very low roughness -> mirror, albedo darkened + tinted with environment, normal flattened (water surface flat but with ripple), height depressed where puddle sits, edge foam/ripple, only floors, noise-shaped pools.
  - **blood**: splatters, trails, smeared pools, dark red-brown albedo, slightly higher roughness but with dried sheen variation, normal subtly perturbed (dried crust), height slight bump, storytelling placement (combat rooms, corridors, near guardian).
  - **dust**: desaturation, light beige veil, increased roughness, softens normals (blurred), height slightly raised (accumulation) in crevices, more on ceilings, corners, undisturbed rooms.
- **Dungeon story integration**: The generator must spread modifiers intelligently:
  - Random chance per room but weighted by role/story: e.g., moss more in entrance, secret, shrine, near roots deco; blood more in guardian, armory, hub (battle); puddle more in damp zones, low depth; dust more in secret, treasure, undisturbed; damaged more in hubs, exits, high-traffic; water more near entrance (rain seep) or low areas.
  - Per-cell or per-room intensity, with **noise modification** for organic variation (Perlin/FBM hash, seeded by dungeon seed).
  - Not uniform: corridors drier than rooms, corners more accumulation, near walls more moss/puddle.
  - Should serialize into dungeon / generator output so renderer can know per-cell modifier mask.

## 2. Project Structure

This task touches multiple domains:

- **Material generation - CPU side** (`world/materials.js`, `render/renderer-gpu.js` for atlas upload, `assets/config/rendering/materials-proc.json` for base params)
  - Today: genBrickTile / genSlabTile generate albedo, normal, height, rough/metal, ao for ONE material atlas (64x64). All cells use same atlas.
  - Needed: Modifier system that can either:
    - Option A: CPU bakes modifier into atlases (per-material variation, cheaper, but loses world-space organic shapes)
    - Option B: GPU shader evaluates modifier in fragment shader using noise + modifier map texture supplied by generator (per-world-cell variation, storytelling, best.)
    - Option C: Hybrid - CPU base + GPU overlay, with config controlling blend.
  - Proposer should justify choice. Hybrid likely best: keep existing atlases, add modifier map texture (gridW x gridH storing modifier type/intensity) + shader-side noise compiled function + alteration logic for each PBR channel.

- **Shader - GLSL** (`render/shaders.js`)
  - Fragment shader already has procedural material sampling, PBR lighting loop, POM, chamfer, corners.
  - Add modifier logic after material fetch, before lighting: sample modifier map, evaluate noise mask (FBM / hash) per modifier, compute blend factor using AO/height/roughness cues, then alter albedo, normal, roughness, metal, height for POM shadowing (or at least albedo darkening implies height).
  - Each modifier alters channels differently - document nicely.

- **Generator** (`world/dungeon/generator.js`, `assets/config/gameplay/generator.json`)
  - Extend to emit modifier placements: per cell or per room modifier counts / intensities.
  - Use seeded rng + hash2i / noise for organic spread, story-weighted.
  - Add config for modifier chances per role/zone.

- **Config system** (`config/config.js`, new JSON `assets/config/rendering/material-modifiers.json` or `assets/config/materials/modifiers.json`)
  - Single source of truth for modifier parameters: colors, roughness delta, height delta, AO influence weights, noise scale, threshold, PBR tweaks.
  - Must be live-editable (Task 7) - Tier1 instant shader uniforms if GPU path, or reload atlases if CPU path (at least document).
  - Map logical name `material-modifiers` in CONFIG_PATHS.

- **Renderer plumbing** (`render/renderer-gpu.js`)
  - Upload new uniforms / textures for modifiers.
  - Handle modifier map texture (grid-sized, e.g., RGBA or multiple channels) creation from generator output.
  - Respect debug toggles (keys 1-8 already) - maybe add new toggle or reuse.

- **No new runtime deps**

## 3. Material Modifier Behavior (Detailed)

### Mask generation - noise function

- Need a noise function that can be **compiled** - meaning built as GLSL function in shader (or CPU equivalent) with controls: scale, octaves, seed, threshold.
- Suggested: FBM of value noise / hash noise (existing hash2 already in materials.js and shader has hash), with 3-4 octaves, per modifier different scale.
- Mask = noise(worldPos.xz * scale + seed) * intensityFromGenerator * cueFactor(AO/height/rough).
- cueFactor: e.g., moss prefers high AO dark crevices + low height (grout) => cue = lerp based on ao < threshold or height low. Damaged prefers edges/high variation. Blood splatter uses layered noise + radial streak. Etc.
- Each modifier should have independent noise params so they look distinct.

### Per-modifier alterations (guidance, not prescription - be creative but physically plausible)

**Common pipeline after mask:**
```
base = sampleAtlas(uvLocal)
mask = computeMask(worldPos, ao, height, rough, noiseParams)
if mask > thresh:
  albedo = mix(base.albedo, modifier.albedoColor or modified, mask * colorStrength)
  normal = perturb or blend base.normal with modifier.normal (moss lumpy, water flat, dust softened)
  roughness = base.rough + delta * mask (moss +0.4 rougher, water -0.5 glossier, puddle ~0.05 mirror, dust +0.25, etc)
  metal = optionally tweak (blood slightly metallic? no, keep 0)
  height = base.height + delta * mask for POM (puddle -depressed -0.15, moss +bumpy +0.2, dust +accum, damaged -chipped)
  ao = optionally darken or tweak
```

**Moss**
- Albedo: lerp to moss green (0.2,0.45,0.15) with yellow variance, preserve shading
- Normal: add low freq lump, strength ~0.6
- Rough: base +0.35 (very rough)
- Height: +0.15 to +0.25 bumpy using noise
- Where: walls low (y ~0), grout AO dark, near DECO_MOSS/ROOTS, entrance/secret/shrine, random clusters

**Damaged**
- Albedo: darken crevices black, occasional brick discoloration / desat
- Normal: sharp fracture, edge wear - perturb strongly near damage
- Rough: +0.15 var
- Height: carve out -0.1 to -0.25 chips
- Where: hubs, exit, high traffic edges, near DECO_BROKEN

**Water / Wetness**
- Albedo: darken -0.15, slight blue tint, vertical streaks
- Normal: blend toward flat (smooth wet) 0.3 mix or add streak normal
- Rough: -0.4 to -0.5 (glossy wet)
- Height: slight -0.03 darkening only, or leave
- Where: walls low third, near puddles, entrance (rain), low floors, random drip trails

**Puddle**
- Floors only
- Albedo: darken 0.6, slight reflect tint, edge brighter (foam/edge mix)
- Rough: ~0.05-0.12 very glossy mirror, Fresnel boost
- Normal: flat water normal (0,0,1) mix heavily, slight ripple via noise
- Height: depress -0.12 to -0.2, defines pool shape
- Where: floor depressions (floorHeight low), corners, near walls, damp zones, uses large noise blobs for pool shape, cannot be everywhere - thresholded

**Blood**
- Albedo: blood red-brown (0.45,0.05,0.08) with pattern: splatter radial + streak drag, mix over base
- Normal: slight crust bump (small)
- Rough: +0.05 to +0.18 varied (dried blood rougher) but fresh spots slightly glossy - optional var
- Height: +0.02 to +0.08 crust
- Where: guardian, armory, hub, corridors near guardian, storytelling: more around center of rooms, trails toward exit, noise splatter

**Dust**
- Albedo: lerp toward dusty beige (0.65,0.6,0.5) + desaturate base 0.3
- Normal: soften - lerp toward (0,0,1) or blur via less strength, 0.4 flat mix
- Rough: +0.20 to +0.35 dusty
- Height: +0.05 accumulation in crevices (use AO * mask)
- Where: ceilings heavily, undisturbed rooms (treasure, secret), high corners, away from puddles/water

### Generator spreading logic (intelligence)

- Per-room modifier profile: each room gets a base intensity for each modifier (0..1) seeded + role-weighted.
  Example weights (tune):
  - entrance: moss 0.3, dust 0.2, water 0.4, puddle 0.2
  - guardian: blood 0.8, damaged 0.6, dust 0.1
  - treasure/secret: dust 0.7, moss 0.15, damaged 0.1
  - shrine: moss 0.5, dust 0.4, water 0.2
  - hub: damaged 0.4, blood 0.3, dust 0.2
  - corridor: dust 0.15, damaged 0.2, water 0.15
  - armory: blood 0.5, dust 0.3, damaged 0.3
  - exit: damaged 0.5, water 0.3
- Global depth modulates: deeper = more dust? or less water? Designer chooses but document.
- Per-cell variation: take room base * noise(cellX, cellY, seed + modifierIndex) + distance-to-wall factor, etc.
- Avoid over-stacking all modifiers max everywhere - clamp sum or pick top 1-2 per cell (or blend up to 2).
- Store per cell as e.g., UInt8 modifierMask bitmask + intensity float, or separate textures.
- Ensure determinism: same seed => same modifiers.
- Must be viewable in editor or debug overlay.

### Config JSON shape proposal (example)

```json
{
  "version": 1,
  "enabled": true,
  "modifiers": {
    "moss": { "enabled": true, "albedo": [0.18,0.42,0.15], "roughAdd": 0.35, "heightAdd": 0.18, "normalStrength": 0.6, "colorStrength": 0.85, "noiseScale": 0.35, "noiseOctaves": 3, "threshold": 0.42, "aoWeight": 0.7, "heightWeight": -0.5 },
    "damaged": { "...": "..." },
    "water": { "...": "..." },
    "puddle": { "floorsOnly": true, "roughTarget": 0.08, "heightDepress": -0.15, "...": "..." },
    "blood": { "...": "..." },
    "dust": { "...": "..." }
  },
  "generator": {
    "globalSeedInfluence": 0.3,
    "perRoomJitter": 0.4,
    "noiseScale": 0.18,
    "roleWeights": { "entrance": { "moss":0.3 }, "...": "..." },
    "distanceToWallFactor": { "moss": 0.3, "puddle": 0.5 },
    "maxModifiersPerCell": 2,
    "blendMode": "top2_normalized"
  },
  "debugToggle": "Key 9 or existing"
}
```

## 4. Architecture Quality

- **ES modules only**, no external deps.
- **Clean separation**: generator emits data, config holds tuning, renderer uploads, shader does alteration. No monolith spaghetti.
- **Config-driven**: No magic numbers in JS/GLSL. All tweakable numbers from JSON with fallbacks.
- **Performance**: Modifier map texture size = grid W x H (40x40 typical) trivial. Shader cost: 6 noise evals could be heavy - reuse noise or limit octaves, LUT, or branch early if modifier intensity 0 for that cell. Must stay 60fps.
- **Live-edit**: Tie to Task 7 Tier1 if shader uniforms, confirm editor tree shows new JSON.
- **Tiered config**: If many modifiers, uniforms list grows; consider packing but keep readable.
- **No regressions**: Existing PBR, POM, chamfer, corners, lighting, sprites, fog, map still work. Toggle off must give original look.
- **Robustness**: If config missing, fallbacks safe. If generator old save without modifiers, render still works.
- **Documentation**: Brief in-code comments on noise compilation and modifier alteration logic.

## 5. Acceptance Criteria

- [ ] Base PBR materials still render when modifiers disabled (toggle).
- [ ] At least 6 modifiers exist: moss, damaged, water, puddle, blood, dust.
- [ ] Each modifier alters **all** channels to some degree: albedo, normal, PBR (rough/metal), POM height - visibly distinct per modifier (not just color tint).
- [ ] Mask generation uses compiled noise function (value/hash FBM, not just random) plus material cues (AO, height, roughness) to decide placement - shader code should show this.
- [ ] Dungeon generator spreads modifiers intelligently: room role weighting + random chance + noise variation; deterministic seeded; not uniform everywhere.
- [ ] New config JSON file for modifiers exists, versioned, editor-discoverable, live-editable Tier1 for shader params.
- [ ] Renderer uploads modifier map texture (grid-sized) and uniforms; fallback safe; no WebGL errors.
- [ ] Visual proof via Playwright screenshots: e.g., mossy corridor, bloody guardian room, puddle floor, dusty secret room, water streaks, damaged hub - at least 4 distinct modifier appearances captured.
- [ ] Editor shows new config and can PUT persist.
- [ ] No shader compile errors, performance still acceptable.

## 6. Out of Scope

- Changing base material atlas gen logic fundamentally (keep genBrickTile/slab).
- New geometry decals as meshes.
- Changing dungeon generation beyond modifier spread.
- Audio, gameplay stats, inventory.
- Hot-reloading GLSL source (only uniform config live).
- High-res material variants (keep 64x64 atlases for perf, unless needed for proof).

## 7. Running / Verification

```bash
cd src && npm install
npm start # http://localhost:8000/game.html
# Walk dungeon, seed deterministic:
# Entrance should show moss/water near walls
# Guardian room should show blood/damage
# Secret/treasure dusty, low traffic
# Floors with puddles mirror-like dark spots, edge foam
# Toggle modifiers off via debug key / config enabled false -> clean look returns
# Editor: http://localhost:8000/editor.html -> assets / config / ... / material-modifiers.json tweak values live
# Screenshots via Playwright capturing each modifier standing in appropriate room
```

## 8. Notes & Inspiration

- Reference mygame procurement: that prototype had flat colors no modifiers.
- Real games: Doom 2016 material layers, Dishonored dust/water edge wear, Resident Evil blood storytelling, Dead Space damage.
- Noise compilation: if doing shader-side, write function `float modNoise(vec3 worldPos, float scale, float seed)` returning 0..1 using hash/fract/sin approx. Use FBM loop 3 octaves. Compile per modifier with different seeds/scales.
- For AO/height cue: floor/ceiling/wall sampled material already has ao/height/rough texture fetched before modifier. Use those as inputs.
- Optimization: Early out if `u_modifiersEnabled==0` or cell intensity 0; sample modifier map once; branch per modifier only if intensity >0.02.
- Consider packing modifiers into RGBA texture: R=moss, G=damaged/water, B=puddle/blood, A=dust, etc or two textures. Simpler: one float per cell encoded as 4 modifiers via channels plus second texture for remaining 2.
- Storytelling polish: blood trails from guardian toward entrance? Could use vector noise drag.
