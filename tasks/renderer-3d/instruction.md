# First-Person 3D Renderer — Dungeoneers Task 3

> **Task renumbering note:** This task merges the original Task 3 (renderer-gpu-core), Task 5 (materials-pbr-system), and Task 6 (lighting-particles) into a single coherent deliverable.

Build the first-person 3D rendering subsystem for Dungeoneers, transforming the top-down 2D minimap into an immersive WebGL2 raycast renderer with procedural PBR materials, dynamic lighting, shadow raymarching, and player navigation.

**Why this task matters:** Tasks 1 and 2 proved the data pipeline works. Task 3 is where Dungeoneers becomes a first-person dungeon crawler. The game page switches from 2D minimap to 3D first-person view. WASD moves you through corridors, walls rise with brick texture and POM depth, your character light illuminates surroundings with PBR response and shadows, fog swallows distant corridors. Minimap remains as M-key overlay.

**Why raycaster not rasterizer:** Dungeoneers uses grid-based raycasting like Doom (1993) as creative choice. We are recreating that architecture — grid map, DDA walk, per-pixel raycast — on GPU via WebGL2 fragment shader with modern PBR lighting layered on top. Retro-futuristic: what Doom would look like with a GPU but keeping raycast architecture.

**Why PBR in this task:** A raycaster with flat colors does not prove the pipeline. Hard parts are lighting integration — material atlas sampling, PBR BRDF, shadow raymarching, fog, POM. Building together as one coherent shader is natural. We simplify: 1 wall + 1 floor + 1 ceiling material only, 1 player point light only, no palette quantization yet.

**Why procedural PBR atlases:** Agent-built games cannot rely on artist textures. Procedural generation from JSON keeps pipeline code-driven and version-controllable.

## Requirements

### 1. Project Structure
Extend src/ with: render/renderer-gpu.js, render/shaders.js, render/gl-utils.js, render/map-upload.js, world/materials.js, entities/player.js, entities/index.js, systems/input.js. Modify assets/config/main.json, config/config.js, main.js, game.html. Add tests/unit/materials.test.js, player.test.js, renderer.test.js. Modify tests/e2e/game.spec.js.

### 2. Procedural PBR Material Atlas Generation
Implement world/materials.js generating PBR atlases at runtime via CPU. Use first material from each JSON file (ID 1 wall dungeon_brick, ID 1 floor stone_slab, ID 1 ceiling stone_ceiling). Generate 6 maps per material: albedo with procedural pattern (brick running bond with mortar grooves and dome bulge, slab with beveled edges), height field driving normal and POM, normal map from height gradient via Sobel, roughMetal packing roughness in R metal in G emissive in B, AO darkening crevices, emissive all black for Task 3. Atlas 64x64 per material, 18 total WebGL textures. Export generateMaterialAtlases() and atlasUvX(). Add materialProc section to main.json editable via generic editor.

### 3. WebGL2 Renderer — GPURenderer Class
Implement render/renderer-gpu.js with GPURenderer class: constructor(canvasEl) throws if no WebGL2, async init(dungeonMap, config), render(dungeonMap, player, timeSeconds), resize(), rebuildMaterials(), uploadMap(), isReady(). Export isWebGL2Supported(). Init gets WebGL2 context, compiles shaders, creates fullscreen quad VAO, generates and uploads atlases with NEAREST filter. Render per frame clears binds shader sets uniforms binds textures draws fullscreen quad.

### 4. GLSL Shaders — DDA Raycaster with PBR
Implement render/shaders.js. Vertex shader fullscreen quad. Fragment shader ~300-400 lines with uniforms for camera map material atlases lighting ambient fog POM time. Per fragment: compute ray direction from screen UV via FOV and player angle. DDA grid walk up to 64 steps sampling mapTex via texelFetch break on wall hit. Wall shading: wall UV, POM parallax offset via 8-step raymarch into height map, sample albedo normal roughness metal AO emissive atlases, PBR lighting ambient plus player point light with attenuation and shadow raymarch plus diffuse NdotL and specular Cook-Torrance plus AO plus emissive, fog via smoothstep, wall side darkening 0.85. Floor/ceiling via ray-plane intersection perspective UV POM sample atlases PBR fog. Optional fixed-point UV truncation if authentic true.

render/gl-utils.js with createShader createProgram logging errors. render/map-upload.js packing grid to RGBA texture for texelFetch.

### 5. Player Entity with WASD Movement
Implement entities/player.js: constructor(x,y,angle), setPosition(), update(dt, inputState, dungeonMap) with WASD forward/back/strafe and QE turn and slide collision, getPosition(), getAngle(), getLightSource() returning player point light at eye height with warm color from config. Slide collision tries full move then X-only then Y-only. Check 3x3 grid wall cells block if distance < radius 0.28.

systems/input.js keyboard state tracker with Input class update() producing {forward,strafe,turn} from WASD+QE.

### 6. Configuration Expansion
Extend main.json with renderer {resolution, authentic, fov, textureFilter}, player {moveSpeed, turnSpeed, radius, height, light:{intensity,radius,color,height}}, lights {ambient, ambientColor, fogNear, fogFar, fogColor}, materialProc {walls:{...}, floors:{...}, ceils:{...}}. Editable via generic JSON editor.

### 7. Game Page Integration
Update main.js: fetch config, generate dungeon, create GPURenderer init, create Player at start, create Input, RAF loop updating and rendering each frame. Keyboard WASD QE consumed per frame, R regenerates re-uploads map resets player, M toggles minimap overlay corner canvas. Hide old HUD pill. Handle WebGL2 unavailable and shader errors gracefully.

### 8. Tests
Unit: materials.test.js atlas size value ranges normal unit length determinism brick pattern. player.test.js spawn movement wall collision blocking slide collision turning light source. renderer.test.js WebGL2 detection shader source validity GL utils error handling.

E2E updating game.spec.js: page loads no errors, canvas WebGL2 context obtainable, 3D scene renders non-black pixels, WASD moves canvas changes, QE turns canvas changes, M toggles minimap, R regenerates canvas changes, no WebGL errors, back home works. Extend editor E2E for new config fields.

### 9. Acceptance Criteria
- [ ] render/renderer-gpu.js, shaders.js, gl-utils.js, map-upload.js exist with specified APIs
- [ ] world/materials.js generates PBR atlases for 1 wall + 1 floor + 1 ceiling
- [ ] entities/player.js WASD+QE slide collision getLightSource
- [ ] systems/input.js keyboard tracker
- [ ] main.json extended with renderer/lights/player.light/materialProc
- [ ] main.js updated with GPURenderer RAF loop and key handling
- [ ] Game page shows first-person 3D with PBR materials player light shadows fog POM
- [ ] WASD moves QE turns M toggles minimap R regenerates
- [ ] No console errors, WebGL2 unavailable handled, shader errors logged
- [ ] Editor shows new config editable persisting correctly
- [ ] Unit tests pass npm run test:unit, E2E pass npm run test:e2e, full suite passes npm test
- [ ] No emoji Phosphor only pure ES modules

### 10. Out of Scope
Full 16/10/8 material library deferred. Multiple torch lights deferred. Palette quantization deferred. Mouse look view bob grid snap deferred to Task 4. Character sprites deferred to Task 6. Full 14-tab editor deferred to Task 5. Live config sync deferred. Audio mobile performance deferred.

## Deliverables Summary
After this task game.html shows first-person 3D dungeon walkable with WASD+QE. Walls procedural brick with POM depth, floor stone slabs, PBR response to warm player light with shadows and fog. M overlays parchment minimap, R regenerates. Editor tunes renderer FOV light params ambient fog material proc via generic JSON form. Dungeoneers as playable first-person experience.
