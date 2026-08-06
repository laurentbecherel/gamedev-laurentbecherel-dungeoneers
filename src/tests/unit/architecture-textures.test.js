import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateMaterialArrayData } from '../../world/materials.js';

async function json(relativePath) {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), relativePath), 'utf8'));
}

async function bake() {
  const [walls, floors, ceils, proc] = await Promise.all([
    json('assets/materials/walls.json'), json('assets/materials/floors.json'), json('assets/materials/ceils.json'),
    json('assets/config/rendering/materials-proc.json')
  ]);
  return generateMaterialArrayData(walls.materials, floors.materials, ceils.materials, proc);
}

function channel(layerData, size, layerId, packedChannel) {
  const start = (layerId - 1) * size * size * 4 + packedChannel;
  return Array.from({ length:size*size }, (_, index) => layerData[start + index*4]);
}

function heightLayer(layerData, size, layerId) {
  const start = (layerId - 1) * size * size;
  return Array.from(layerData.slice(start, start + size*size));
}

test('retro architecture materials have restrained but readable surface detail', async () => {
  const baked = await bake(); const size = baked.texSize;
  for (const [label, surface, id] of [
    ['brick', baked.walls, 1], ['dark basalt', baked.walls, 4], ['dressed limestone', baked.walls, 5],
    ['cellar fieldstone', baked.walls, 6], ['timber', baked.walls, 7], ['reinforced panels', baked.walls, 8],
    ['cave earth', baked.walls, 9], ['raw cave rock', baked.walls, 10]
  ]) {
    const red = channel(surface.albedo, size, id, 0);
    assert(new Set(red).size >= 8, `${label} needs visible tonal breakup`);
    let calmNeighbours = 0, comparisons = 0;
    for (let y=0; y<size; y++) for (let x=1; x<size; x++) {
      const a=red[y*size+x-1], b=red[y*size+x]; comparisons++;
      if (Math.abs(a-b) <= 24) calmNeighbours++;
    }
    assert(calmNeighbours/comparisons > 0.66, `${label} remains broad-form pixel art, not noisy photography`);
  }
});

test('wood has recessed joints, knots/grain, and sparse metal nails', async () => {
  const baked = await bake(); const size=baked.texSize;
  const heights=heightLayer(baked.walls.height,size,7);
  const metals=channel(baked.walls.roughMetalAO,size,7,1);
  assert(Math.min(...heights) < 45 && Math.max(...heights) > 145, 'boards separate in height/PBR');
  const nails=metals.filter(value => value > 150).length;
  assert(nails >= 4 && nails < size*size*.04, `nails stay sparse (${nails})`);
});

test('cellar fieldstone and reinforced panels have distinct PBR signatures', async () => {
  const baked=await bake(); const size=baked.texSize;
  const rockHeight=heightLayer(baked.walls.height,size,6);
  const rockMetal=channel(baked.walls.roughMetalAO,size,6,1);
  const panelMetal=channel(baked.walls.roughMetalAO,size,8,1);
  const panelRough=channel(baked.walls.roughMetalAO,size,8,0);
  assert(Math.min(...rockHeight)<35 && Math.max(...rockHeight)>135, 'cellar fieldstone has coarse relief and crevices');
  assert(Math.max(...rockMetal)===0, 'natural rock remains non-metallic');
  assert(Math.min(...panelMetal)>35 && Math.max(...panelMetal)>170, 'panels include oxidized metal and bright rivets');
  assert(Math.max(...panelRough)-Math.min(...panelRough)>50, 'scratches/rust alter panel roughness');
});

test('true grotto walls are non-gridded earth and noise-shaped cave rock', async () => {
  const baked=await bake(); const size=baked.texSize;
  assert.equal(baked.wallCount,11);
  assert.equal(baked.ceilCount,10);
  for (const id of [9,10,11]) {
    const metal=channel(baked.walls.roughMetalAO,size,id,1);
    assert.equal(Math.max(...metal),0, `natural grotto wall M${id} is non-metallic`);
  }
  const caveRed=channel(baked.walls.albedo,size,10,0);
  const caveHeight=heightLayer(baked.walls.height,size,10);
  assert(new Set(caveRed).size>=16,'cave rock has broad natural tonal variation');
  assert(Math.max(...caveHeight)-Math.min(...caveHeight)>90,'cave rock has fractured PBR relief');
  const darkByColumn=Array.from({length:size},(_,x)=>Array.from({length:size},(_,y)=>caveRed[y*size+x]).filter(value=>value<45).length);
  assert(Math.max(...darkByColumn)<size*.55,'cave rock has no continuous vertical grout lines');
});

test('floor library includes quiet dirt, stony dirt, gravel, and large-scale paving', async () => {
  const baked=await bake(); const size=baked.texSize;
  assert.equal(baked.floorCount, 17);
  for (const id of [11,12,16]) {
    const metal=channel(baked.floors.roughMetalAO,size,id,1);
    const rough=channel(baked.floors.roughMetalAO,size,id,0);
    assert.equal(Math.max(...metal),0, `earth M${id} remains non-metallic`);
    assert(Math.min(...rough)>175, `earth M${id} remains matte`);
  }
  const packed=heightLayer(baked.floors.height,size,11);
  const gravel=heightLayer(baked.floors.height,size,16);
  assert(Math.max(...packed)-Math.min(...packed)<100, 'packed dirt has restrained relief');
  assert(Math.max(...gravel)>Math.max(...packed), 'loose gravel has stronger embedded-stone relief');
  assert(new Set(channel(baked.floors.albedo,size,9,0)).size>=8, 'large flags retain readable tonal wear');
  assert(new Set(channel(baked.floors.albedo,size,10,0)).size>=8, 'brick paving retains readable tonal wear');
  const caveStone=heightLayer(baked.floors.height,size,17);
  assert(Math.max(...caveStone)-Math.min(...caveStone)>90, 'raw cave floor uses natural fractured relief');
});
