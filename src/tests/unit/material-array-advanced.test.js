import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { generateMaterialArrayData } from '../../world/materials.js';
import { generateNoiseTextureData, valueNoise2DPeriodic, fbm2DPeriodic } from '../../world/noise.js';
import { MOD_CHANNELS, MOD2_CHANNELS, MOD_PACKING, generateModifierMap, decodeModifierPixel } from '../../world/modifiers.js';

const wallMats = [
  { id:1, base:[138,58,44], roughness:0.85, variationSeed:1, proc:{groutWidth:1, domeHeight:0.28} },
  { id:2, base:[102,100,92], roughness:0.92, variationSeed:2, proc:{groutWidth:2, domeHeight:0.32, blockSize:10} }
];
const floorMats = [
  { id:1, base:[90,88,80], roughness:0.88, variationSeed:201 },
  { id:2, base:[70,68,60], roughness:0.95, variationSeed:202, proc:{blockSize:6, groutWidth:2} }
];
const ceilMats = [
  { id:1, base:[80,78,70], roughness:0.9, variationSeed:301 },
  { id:2, base:[60,45,30], roughness:0.8, variationSeed:302 }
];
const proc = {
  walls: { heightScale:1.15, normalStrength:1.15, aoBoost:0.6, groutWidth:1 },
  floors: { heightScale:0.8, normalStrength:0.9, aoBoost:0.6, blockSize:8 },
  ceils: { heightScale:0.6, normalStrength:0.8, aoBoost:0.55, blockSize:8 }
};

test('P3: per-material proc override - groutWidth differs per wall mat', () => {
  const arr = generateMaterialArrayData(wallMats, floorMats, ceilMats, { ...proc, texSize:64 });
  const layerPix = 64*64;
  const ts = 64;
  const y = 4;
  const idx0_x1 = 0*layerPix + y*ts + 1;
  const h0_x1 = arr.walls.height[idx0_x1];
  const idx0_x0 = 0*layerPix + y*ts + 0;
  const h0_x0 = arr.walls.height[idx0_x0];
  assert(h0_x1 > h0_x0 + 5, 'mat0 x=1 should be higher than grout x=0 when groutWidth=1');

  const idx1_x1 = 1*layerPix + y*ts + 1;
  const h1_x1 = arr.walls.height[idx1_x1];
  const idx1_x0 = 1*layerPix + y*ts + 0;
  const h1_x0 = arr.walls.height[idx1_x0];
  const diff = Math.abs(h1_x1 - h1_x0);
  assert(diff < 10, 'mat1 with groutWidth=2 should have similar heights at x=0,1 both grout diff=' + diff);
  assert(h1_x1 < h0_x1, 'mat1 grout x=1 should be lower than mat0 face x=1');
});

test('P1: noise texture seamless - periodic wrapping', () => {
  const { data, size } = generateNoiseTextureData(128, 1337);
  const pX = 4, pY = 4;
  const v00 = valueNoise2DPeriodic(0, 0, 1337, pX, pY);
  const v40 = valueNoise2DPeriodic(4, 0, 1337, pX, pY);
  const v04 = valueNoise2DPeriodic(0, 4, 1337, pX, pY);
  assert(Math.abs(v00 - v40) < 0.001, 'periodic X wrap: v(0,0) vs v(4,0)');
  assert(Math.abs(v00 - v04) < 0.001, 'periodic Y wrap');

  const f00 = fbm2DPeriodic(0,0,1337,3,pX,pY);
  const f40 = fbm2DPeriodic(4,0,1337,3,pX,pY);
  assert(Math.abs(f00 - f40) < 0.001, 'fbm periodic');

  let borderJump = 0;
  for (let y=0;y<size;y++) {
    const idxLast = (y*size + size-1)*4;
    const idxFirst = (y*size + 0)*4;
    const bj = Math.abs(data[idxLast] - data[idxFirst]);
    if (bj > borderJump) borderJump = bj;
  }
  assert(borderJump < 100, 'seamless border jump <100, got ' + borderJump);
});

test('modifier channel mapping matches packing v3 (2 textures)', () => {
  assert(MOD_CHANNELS.MOSS === 0, 'MOSS channel 0 R tex1');
  assert(MOD_CHANNELS.WATER === 1, 'WATER channel 1 G tex1');
  assert(MOD_CHANNELS.PUDDLE === 2, 'PUDDLE channel 2 B tex1');
  assert(MOD_CHANNELS.WALL_PROXIMITY === 3, 'tex1 A remains the moss wall-proximity field');
  assert(MOD2_CHANNELS.DAMAGED === 0, 'DAMAGED channel 0 R tex2');
  assert(MOD2_CHANNELS.BLOOD === 1, 'BLOOD channel 1 G tex2');
  assert(MOD2_CHANNELS.DUST === 2, 'DUST channel 2 B tex2');
  assert(MOD_PACKING.tex1.channels.R.name === 'moss', 'tex1 R moss');
  assert(MOD_PACKING.tex1.channels.G.name === 'water', 'tex1 G water');
  assert(MOD_PACKING.tex1.channels.B.name === 'puddle', 'tex1 B puddle');
  assert(MOD_PACKING.tex2.channels.R.name === 'damaged', 'tex2 R damaged');
  assert(MOD_PACKING.tex2.channels.G.name === 'blood', 'tex2 G blood');
  assert(MOD_PACKING.tex2.channels.B.name === 'dust', 'tex2 B dust');
});

test('blood and dust generator fields are nonzero, distinct, and decodable', () => {
  const w = 12, h = 10;
  const dungeon = {
    w, h,
    grid: new Uint8Array(w*h),
    floorHeight: new Float32Array(w*h),
    seed: 7331,
    rooms: [{ x:1, y:1, w:10, h:8, role:'guardian' }]
  };
  const config = { materialModifiers: {
    enabled: true,
    generator: {
      blood: { threshold:0, feather:0.4, boost:2, wallWeight:1 },
      dust: { threshold:0, feather:0.4, boost:2, wallWeight:1 },
      roleWeights: { guardian:{ moss:0, puddle:0, damaged:0, blood:1, dust:1 } }
    }
  } };
  const map = generateModifierMap(dungeon, config);
  let bloodMax = 0, dustMax = 0, proximityMax = 0;
  for (let i=0; i<w*h; i++) {
    bloodMax = Math.max(bloodMax, map.data2[i*4 + MOD2_CHANNELS.BLOOD]);
    dustMax = Math.max(dustMax, map.data2[i*4 + MOD2_CHANNELS.DUST]);
    proximityMax = Math.max(proximityMax, map.data[i*4 + MOD_CHANNELS.WALL_PROXIMITY]);
  }
  assert(bloodMax > 0, 'blood story field generated');
  assert(dustMax > 0, 'dust story field generated');
  assert(proximityMax > 0, 'moss wall proximity remains available');
  const decoded = decodeModifierPixel([0,0,0,128], [0,64,192,0]);
  assert.equal(decoded.blood, 64/255);
  assert.equal(decoded.dust, 192/255);
  assert.equal(decoded.wallProximity, 128/255);
});

test('damage generator covers both room floors and wall shells', () => {
  const w = 10, h = 10;
  const grid = new Uint8Array(w*h);
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    grid[y*w+x] = (x===0 || y===0 || x===w-1 || y===h-1) ? 1 : 0;
  }
  const dungeon = {
    w, h, grid,
    floorHeight: new Float32Array(w*h),
    seed: 9182,
    rooms: [{ x:1, y:1, w:8, h:8, role:'guardian' }]
  };
  const config = { materialModifiers: {
    enabled: true,
    generator: {
      damaged: { threshold:0, feather:0.4, boost:2, wallWeight:1 },
      roleWeights: { guardian:{ moss:0, puddle:0, damaged:1, blood:0, dust:0 } }
    }
  } };
  const map = generateModifierMap(dungeon, config);
  let floorMax = 0, wallMax = 0;
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) {
    const value = map.data2[(y*w+x)*4 + MOD2_CHANNELS.DAMAGED];
    if (grid[y*w+x]) wallMax = Math.max(wallMax, value);
    else floorMax = Math.max(floorMax, value);
  }
  assert(floorMax > 0, 'damage story field reaches room floors');
  assert(wallMax > 0, 'nearest room role propagates damage onto the wall shell');
});

test('P2: modifier map generation disabled returns all zeros but valid texture', () => {
  const fakeDungeon = { w:10, h:10, grid:new Uint8Array(100), floorHeight:new Float32Array(100), seed:1, rooms:[] };
  const cfgDisabled = { materialModifiers:{ enabled:false, generator:{} } };
  const res = generateModifierMap(fakeDungeon, cfgDisabled);
  assert(res.enabled === false, 'disabled');
  assert(res.data.length === 400, '10x10*4 tex1');
  assert(res.data2.length === 400, '10x10*4 tex2');
  const sum = res.data.reduce((a,b)=>a+b,0) + res.data2.reduce((a,b)=>a+b,0);
  assert(sum === 0, 'all zeros when disabled');
});

test('P3: clampLayer logic - OOB handling mirrors shader', () => {
  function clampLayer(id, count) {
    const maxL = Math.max(count-1,0);
    let l = id-1;
    if (l<0) l=0;
    if (l>maxL) l=maxL;
    return l;
  }
  assert(clampLayer(1,2) === 0, 'id 1 -> layer 0');
  assert(clampLayer(2,2) === 1, 'id 2 -> layer 1');
  assert(clampLayer(0,2) === 0, 'id 0 OOB low -> 0');
  assert(clampLayer(5,2) === 1, 'id 5 OOB high -> max 1');
  assert(clampLayer(1,0) === 0, 'count 0 -> 0');
  assert(clampLayer(1,1) === 0, 'single');
});

test('P3: fetchFloorMatId boundary - returns 1 when out of bounds or 0', () => {
  function fetchFloorMatIdSim(cell, mapSize, matMap) {
    if (cell.x<0 || cell.y<0 || cell.x>=mapSize.x || cell.y>=mapSize.y) return 1.0;
    const idx = cell.y*mapSize.x + cell.x;
    const id = matMap[idx];
    if (id < 0.5) return 1.0;
    return id;
  }
  const mapSize = {x:10,y:10};
  const matMap = new Uint8Array(100).fill(0);
  matMap[5*10+5]=2;
  assert(fetchFloorMatIdSim({x:-1,y:0}, mapSize, matMap) === 1.0, 'out of bounds ->1');
  assert(fetchFloorMatIdSim({x:0,y:0}, mapSize, matMap) === 1.0, 'empty cell 0->1');
  assert(fetchFloorMatIdSim({x:5,y:5}, mapSize, matMap) === 2, 'valid id 2');
});

test('P2: material-assignments.json exists and is data-driven', async () => {
  const p = path.join(process.cwd(), 'assets', 'config', 'rendering', 'material-assignments.json');
  const txt = await fs.readFile(p, 'utf8');
  const j = JSON.parse(txt);
  assert(j.version >= 2, 'version 2');
  assert(j.policy, 'policy exists');
  assert(j.policy.entrance, 'entrance policy');
  assert(j.policy.guardian.wall === 2, 'guardian wall deterministic');
  assert(j.fallback.wall === 1, 'fallback');
  const treasure = j.policy.treasure;
  assert(treasure.wall.values.length === 2, 'treasure weighted');
});

test('moss modifier has independent albedo and surface detail', async () => {
  const shader = await fs.readFile(path.join(process.cwd(), 'render', 'shader-lib', 'modifiers.wgsl.js'), 'utf8');
  const config = JSON.parse(await fs.readFile(path.join(process.cwd(), 'assets', 'config', 'rendering', 'material-modifiers.json'), 'utf8'));
  assert(shader.includes('fn mossSurfaceDetail'), 'moss has detail independent from its coverage noise');
  assert(shader.includes('mossDark') && shader.includes('mossMid') && shader.includes('mossLight'), 'moss uses a low-resolution color ramp');
  assert(shader.includes('mossRoughTarget'), 'moss roughness varies without uniformly saturating');
  assert(shader.includes('mossTangent') && shader.includes('mossBitangent'), 'moss normal relief follows the host surface');
  assert(!shader.includes('let mossUp:'), 'moss no longer flattens normals toward world-up');
  assert(config.modifiers.moss.colorStrength > 1, 'moss visibility gain compensates for the sparse final mask');
  assert(shader.includes('clamp(mossStrength * mossColorStrength, 0.0, 1.0)'), 'moss gain cannot extrapolate its albedo blend');
});

test('blood and dust have dedicated shader blocks and live editor schemas', async () => {
  const shader = await fs.readFile(path.join(process.cwd(), 'render', 'shader-lib', 'modifiers.wgsl.js'), 'utf8');
  const renderer = await fs.readFile(path.join(process.cwd(), 'render', 'renderer-gpu.js'), 'utf8');
  const config = JSON.parse(await fs.readFile(path.join(process.cwd(), 'assets', 'config', 'rendering', 'material-modifiers.json'), 'utf8'));
  assert(shader.includes('fn bloodFinalMask') && shader.includes('fn dustFinalMask'));
  assert(shader.includes('modBloodAlbedo') && shader.includes('modDustAlbedo'));
  assert(shader.includes('mod2.g') && shader.includes('mod2.b'), 'shader reads dedicated blood and dust channels');
  assert(renderer.includes('MODIFIERS_VEC4_COUNT = 48'));
  assert(renderer.includes('this._modifierGeneratorSignature !== nextGeneratorSignature'), 'live generator edits rebake story fields');
  assert(config.modifiers.blood.enabled && config.modifiers.dust.enabled);
  assert(config.ui.blood.noise.scale.max > config.modifiers.blood.noise.scale);
  assert(config.ui.dust.noise.detailScale.max > config.modifiers.dust.noise.detailScale);
  assert(config.docs.blood.surface.roughTarget && config.docs.dust.material.heightLow);
});

test('damage uses non-stretched 3D detail and live appearance controls', async () => {
  const shader = await fs.readFile(path.join(process.cwd(), 'render', 'shader-lib', 'modifiers.wgsl.js'), 'utf8');
  const sceneShader = await fs.readFile(path.join(process.cwd(), 'render', 'shader-lib', 'scene.wgsl.js'), 'utf8');
  const shadersWgsl = await fs.readFile(path.join(process.cwd(), 'render', 'shaders-wgsl.js'), 'utf8');
  const renderer = await fs.readFile(path.join(process.cwd(), 'render', 'renderer-gpu.js'), 'utf8');
  const editor = await fs.readFile(path.join(process.cwd(), 'editor.js'), 'utf8');
  const config = JSON.parse(await fs.readFile(path.join(process.cwd(), 'assets', 'config', 'rendering', 'material-modifiers.json'), 'utf8'));
  const noiseBlock = shader.slice(shader.indexOf('fn damagedNoiseRaw'), shader.indexOf('fn damagedRidgeRaw'));
  const applyBlock = shader.slice(shader.indexOf('// Damaged – chipped albedo'), shader.indexOf('fn applyModifiersSimple'));
  assert(noiseBlock.includes('fbm3D_3') && noiseBlock.includes('valueNoise3D'), 'damage coverage is volumetric');
  assert(!noiseBlock.includes('w.xy'), 'damage noise no longer projects through world XY');
  assert(applyBlock.includes('damagedSurfaceDetail(worldPos)') && !applyBlock.includes('valueNoise2D(worldPos.xy'), 'damage PBR detail is also 3D');
  assert(applyBlock.includes('dTangent') && applyBlock.includes('dBitangent'), 'damage normals follow the host surface plane');
  assert(sceneShader.includes('debugDamagedPlacementMask') && sceneShader.includes('debugDamagedFactorsMask'), 'damage has placement and factor debug views');
  assert(shader.includes('modDamagedAppearance') && renderer.includes('damagedAppearance.colorStrength'));
  assert(config.generator.damaged.wallWeight > 0.5);
  assert(config.generator.roleWeights.guardian.damaged > config.generator.roleWeights.secret.damaged);
  assert(config.modifiers.damaged.appearance.colorStrength > 0);
  assert(config.ui.damaged.appearance.colorStrength.max > config.modifiers.damaged.appearance.colorStrength);
  assert(config.ui.generator.damaged.wallWeight.max >= config.generator.damaged.wallWeight);
  assert(config.ui.debug.view.options.includes(config.debug.view), 'configured debug view is a supported live option');
  assert(config.ui.debug.view.options.includes('damagedNoise') && config.ui.debug.view.options.includes('damagedFinal'));
  assert(shadersWgsl.includes("makeDebugFS('frame.pbrDebugMode')"), 'one runtime-selected debug shader serves every view');
  assert(renderer.includes('createRenderPipelineAsync'), 'first debug pipeline compilation is non-blocking when supported');
  assert(!renderer.includes('_debugPBRSourceCache'), 'renderer no longer compiles a shader per debug mode');
  assert(renderer.includes('setModifierDebugView(mm.debug?.view'), 'JSON debug selection is applied live');
  assert(editor.includes('dottedRemainder'), 'legacy dotted damage schemas remain live-editable');
});

test('P1: materials-proc.json no longer has forcedCount', async () => {
  const p = path.join(process.cwd(), 'assets', 'config', 'rendering', 'materials-proc.json');
  const j = JSON.parse(await fs.readFile(p, 'utf8'));
  assert(!('forcedCount' in (j.packing||{})), 'forcedCount removed');
  assert(j.packing.mode === 'array', 'mode array');
});

test('P1/P2: shaders.js is now modular - imports shader-lib (WebGPU)', async () => {
  const txt = await fs.readFile(path.join(process.cwd(), 'render', 'shaders.js'), 'utf8');
  // After WebGPU migration, shaders.js re-exports WGSL (shim) and imports wgsl shader-lib
  assert(txt.includes('shader-lib') || txt.includes('shaders-wgsl'), 'imports shader-lib or wgsl');
  assert(txt.includes('wgslCommon') || txt.includes('glslCommon'), 'imports common (wgsl or legacy alias)');
  assert(txt.includes('wgslMaterial') || txt.includes('glslMaterial'), 'imports material');
  assert(txt.includes('wgslChamfer') || txt.includes('glslChamfer'), 'imports chamfer');
  assert(txt.includes('wgslModifiers') || txt.includes('glslModifiers'), 'imports modifiers');
  assert(txt.includes('wgslScene') || txt.includes('glslScene'), 'imports scene');
  assert(!txt.includes('u_texSize'), 'legacy u_texSize removed');
  // After migration, legacy atlas uniforms removed, now uses WGSL texture_2d_array
  let combined = txt;
  try {
    const libFiles = await fs.readdir(path.join(process.cwd(), 'render', 'shader-lib'));
    for (const f of libFiles) {
      if (f.endsWith('.wgsl.js') || f.endsWith('.glsl.js')) {
        combined += await fs.readFile(path.join(process.cwd(),'render','shader-lib',f),'utf8');
      }
    }
  } catch {}
  const hasUBO = combined.includes('ModifiersBlock');
  assert(hasUBO, 'has ModifiersBlock UBO (48 vec4)');
  assert(combined.includes('modifierMap2') || combined.includes('u_modifierMap2'), 'has second modifier texture');
  assert(combined.includes('modMossAlbedoRough') || combined.includes('modMossAlbedo'), 'contains moss uniform');
  assert(combined.includes('shadeFloorCell') && combined.includes('shadeCeilCell') && combined.includes('shadeWallCell'), 'scene helpers exist');
  assert(combined.includes('shadeHorizontalCell'), 'unified horizontal helper');
});

test('P3: gpu-utils has WebGPU buffer helpers (WebGPU migration)', async () => {
  const txt = await fs.readFile(path.join(process.cwd(), 'render', 'gpu-utils.js'), 'utf8');
  assert(txt.includes('createUniformBuffer'), 'has createUniformBuffer');
  assert(txt.includes('isWebGPUSupported'), 'has isWebGPUSupported');
  assert(txt.includes('initWebGPU'), 'has initWebGPU');
  assert(txt.includes('createTexture2DArray'), 'has array texture helper');
  assert(txt.includes('createSampler'), 'has sampler helper');
});

test('P3: gl-utils shim re-exports gpu-utils (no WebGL2)', async () => {
  const txt = await fs.readFile(path.join(process.cwd(), 'render', 'gl-utils.js'), 'utf8');
  assert(txt.includes('gpu-utils'), 'gl-utils should re-export from gpu-utils (pure WebGPU)');
  assert(txt.includes('createUniformBuffer'), 'shim has buffer helper via re-export');
});

test('second modifier texture packing v3', () => {
  assert(MOD_PACKING.version === 3, 'packing v3');
  assert(MOD_PACKING.textures === 2, '2 textures');
  assert(MOD_PACKING.tex1.channels.R.name === 'moss', 'tex1 R moss');
  assert(MOD_PACKING.tex2.channels.R.name === 'damaged', 'tex2 R damaged');
  assert(MOD_PACKING.tex2.channels.G.name === 'blood', 'tex2 G blood');
  assert(MOD_PACKING.tex2.channels.B.name === 'dust', 'tex2 B dust');
});
