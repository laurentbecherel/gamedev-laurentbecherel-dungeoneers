import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assignArchitecturePlan } from '../../world/dungeon/architecture.js';
import { generateDungeon } from '../../world/dungeon/generator.js';

const asset = async name => JSON.parse(await fs.readFile(path.join(process.cwd(), 'assets', 'materials', `${name}.json`), 'utf8'));

function materialIds(spec) {
  if (typeof spec === 'number') return [spec];
  const values = Array.isArray(spec) ? spec : (spec?.values || spec?.ids || []);
  return values.map(value => typeof value === 'number' ? value : value.id);
}

function sampleRooms(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    x:index * 4, y:2, w:4, h:4, cx:index * 4 + 2, cy:4,
    zone:index < 3 ? 'Entry' : index < 7 ? 'Depths' : 'Exit',
    role:index === 0 ? 'entrance' : index === count - 1 ? 'exit' : index === 6 ? 'guardian' : 'hall',
    onMainPath:true
  }));
}

test('architecture planning is deterministic, contiguous, and bounded', async () => {
  const config = await asset('architectures');
  const a = sampleRooms(); const b = sampleRooms(); const pathIndices = a.map((_, index) => index);
  const planA = assignArchitecturePlan(a, pathIndices, 90210, config);
  const planB = assignArchitecturePlan(b, pathIndices, 90210, config);
  assert.deepEqual(a.map(room => [room.architecture, room.architectureType]), b.map(room => [room.architecture, room.architectureType]));
  assert(planA.architectureCount <= config.selection.maxArchitecturesPerLevel);
  assert(planA.regions.length <= config.selection.maxArchitecturesPerLevel);
  assert.deepEqual(planA.regions, planB.regions);
  for (const room of a) {
    assert(Number.isInteger(room.architectureId) && room.architectureId > 0);
    assert(Number.isInteger(room.typeId) && room.typeId > 0);
    assert(room.architectureMaterials?.wall, 'room resolves architecture/type material triplet');
  }
});

test('type maxConsecutive is enforced even with full persistence', async () => {
  const config = await asset('architectures');
  config.selection.typeAdjacencyPersistence = 1;
  config.types = config.types.map(type => ({ ...type, maxConsecutive: 2 }));
  const rooms = sampleRooms(14); const pathIndices = rooms.map((_, index) => index);
  assignArchitecturePlan(rooms, pathIndices, 44, config);
  let run = 1;
  for (let index = 1; index < rooms.length; index++) {
    run = rooms[index].architectureType === rooms[index - 1].architectureType ? run + 1 : 1;
    assert(run <= 2, `type ${rooms[index].architectureType} repeated ${run} times`);
  }
});

test('zero weights and multipliers remain valid authoring controls', async () => {
  const config = await asset('architectures');
  config.selection.maxArchitecturesPerLevel = 1;
  config.architectures.forEach((architecture, index) => { architecture.weight = index === 0 ? 1 : 0; });
  config.types.forEach(type => { type.baseWeight = type.id === 'plain' ? 1 : 0; });
  config.types.find(type => type.id === 'plain').modifierMultipliers.moss = 0;
  const rooms = sampleRooms(6); assignArchitecturePlan(rooms, rooms.map((_, index) => index), 55, config);
  assert(rooms.every(room => room.architecture === config.architectures[0].id));
  assert(rooms.every(room => room.architectureType === 'plain'));
  assert(rooms.every(room => room.modifierMultipliers.moss === 0));
});

test('forced architecture produces one coherent full-level theme', async () => {
  const config = await asset('architectures');
  config.selection.forcedArchitectureId = 'natural_grotto';
  const rooms = sampleRooms(10);
  const plan = assignArchitecturePlan(rooms, rooms.map((_, index) => index), 912, config);
  assert.equal(plan.forced, true);
  assert.equal(plan.dominant, 'natural_grotto');
  assert.equal(plan.architectureCount, 1);
  assert.equal(plan.regions.length, 1);
  assert(rooms.every(room => room.architecture === 'natural_grotto'));
});

test('architecture material references match available PBR layers', async () => {
  const [config, walls, floors, ceils] = await Promise.all(['architectures','walls','floors','ceils'].map(asset));
  const limits = { wall:walls.materials.length, floor:floors.materials.length, ceil:ceils.materials.length };
  for (const architecture of config.architectures) for (const type of config.types) {
    const mapping = architecture.materials[type.id];
    assert(mapping, `${architecture.id}/${type.id} mapping exists`);
    for (const surface of ['wall','floor','ceil']) {
      for (const id of materialIds(mapping[surface])) {
        assert(id >= 1 && id <= limits[surface], `${architecture.id}/${type.id}/${surface} layer M${id} exists`);
      }
    }
  }
});

test('each architecture owns a varied but coherent floor family', async () => {
  const config = await asset('architectures');
  for (const architecture of config.architectures) {
    const ids = new Set(config.types.flatMap(type => materialIds(architecture.materials[type.id].floor)));
    assert(ids.size >= 5, `${architecture.id} exposes enough floor variation (${ids.size})`);
  }
  const grotto = config.architectures.find(item => item.id === 'natural_grotto');
  const grottoPlain = materialIds(grotto.materials.plain.floor);
  assert(grottoPlain.includes(11) && grottoPlain.includes(12) && grottoPlain.includes(16) && grottoPlain.includes(17), 'plain grotto prioritizes dirt, gravel, and raw cave stone');
  assert(materialIds(grotto.materials.plain.wall).every(id => id >= 9), 'true grotto plain walls use earth and unworked cave rock');
  const cellar = config.architectures.find(item => item.id === 'mossy_cellar');
  assert(cellar && materialIds(cellar.materials.plain.wall).every(id => id <= 8), 'former grotto is preserved as constructed Mossy Cellar');
});

test('generated dungeon exposes architecture/type maps and palette story', async () => {
  const architectures = await asset('architectures');
  const config = {
    architectures,
    generator:{mapW:40,mapH:40,roomTarget:12,mainPathRooms:6,roomAttempts:200,roomSizeMin:4,roomSizeMax:8,mainPathRoomSizeBonus:0,linearity:.7,sideBranchMaxDepth:1},
    items:{maxTorches:0}, boundaryWallId:1
  };
  const dungeon = await generateDungeon(config, 1234);
  assert.equal(dungeon.architectureMap.length, dungeon.w * dungeon.h);
  assert.equal(dungeon.typeMap.length, dungeon.w * dungeon.h);
  assert(dungeon.meta.architecturePlan.enabled);
  assert.equal(dungeon.meta.paletteAccents.length, 2);
  assert(dungeon.rooms.every(room => room.architectureId && room.typeId));
  assert(dungeon.rooms.every(room => room.wallMat >= 1 && room.wallMat <= 11));
  assert(dungeon.rooms.every(room => room.floorMat >= 1 && room.floorMat <= 24));
  assert(dungeon.rooms.every(room => room.ceilMat >= 1 && room.ceilMat <= 10));
});

test('forced grotto resolves multiple earthen floor variants across rooms', async () => {
  const architectures = await asset('architectures');
  architectures.selection.forcedArchitectureId = 'natural_grotto';
  const config = {
    architectures,
    generator:{mapW:48,mapH:48,roomTarget:18,mainPathRooms:9,roomAttempts:300,roomSizeMin:4,roomSizeMax:8,mainPathRoomSizeBonus:0,linearity:.7,sideBranchMaxDepth:1},
    items:{maxTorches:0}, boundaryWallId:1
  };
  const floors = new Set();
  for (const seed of [31, 67, 109]) {
    const dungeon = await generateDungeon(config, seed);
    dungeon.rooms.forEach(room => floors.add(room.floorMat));
    assert(dungeon.rooms.every(room => room.architecture === 'natural_grotto'));
    assert(dungeon.rooms.some(room => room.wallMat >= 9), 'generated grotto resolves exposed earth or noise-shaped rock walls');
    assert(dungeon.rooms.some(room => room.ceilMat >= 9), 'generated grotto resolves raw cave ceilings');
  }
  assert([...floors].some(id => [11,12,16].includes(id)), 'grotto generation selects earthen surfaces');
  assert(floors.size >= 4, `grotto rooms vary their floors (${[...floors].join(', ')})`);
});

test('3D construction debug shader renders architecture, type, and material IDs', async () => {
  const [sceneShader, renderer] = await Promise.all([
    fs.readFile(path.join(process.cwd(), 'render', 'shader-lib', 'scene.wgsl.js'), 'utf8'),
    fs.readFile(path.join(process.cwd(), 'render', 'renderer-gpu.js'), 'utf8')
  ]);
  assert(sceneShader.includes('DEBUG_GLYPHS') && sceneShader.includes('debugConstructionSurface'));
  assert(sceneShader.includes('debugTextLine(uv, 10u, ids.x') && sceneShader.includes('debugTextLine(uv, 11u, ids.y'));
  assert(sceneShader.includes('debugTextLine(uv, 12u, materialId'), 'surface material ID is printed');
  assert(sceneShader.includes('frame.gridDebug != 0'), 'key 1 flag selects the 3D diagnostic surface path');
  assert(renderer.includes('dungeon.architectureMap?.[i]') && renderer.includes('dungeon.typeMap?.[i]'), 'architecture/type maps upload to the GPU material map');
});
