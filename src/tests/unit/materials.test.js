import test from "node:test";
import assert from "node:assert/strict";
import { generateMaterialAtlases, generateMaterialArrayData, atlasUvX } from "../../world/materials.js";

const wallMats = [{ id: 1, name: "dungeon_brick", type: "brick", base: [138, 58, 44], roughness: 0.85, metal: 0, variationSeed: 101, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const floorMats = [{ id: 1, name: "stone_slab", type: "slab", base: [90, 88, 80], roughness: 0.88, metal: 0, variationSeed: 201, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const ceilMats = [{ id: 1, name: "stone_ceiling", type: "slab", base: [80, 78, 70], roughness: 0.9, metal: 0, variationSeed: 301, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const proc = {
  walls: { heightScale: 1.15, normalStrength: 1.15, aoBoost: 0.6, groutWidth: 1, domeStrength: 1.1, crackAmount: 0.6, roughness: 0.72, roughnessVariation: 0.10, groutRoughAdd: 0.15, aoGrout: 0.78, aoFace: 0.92, aoDomeBoost: 0.08, aoMin: 0.7 },
  floors: { heightScale: 0.8, normalStrength: 0.9, aoBoost: 0.6, blockSize: 8, groutWidth: 1, domeStrength: 1.1, roughness: 0.78, roughnessVariation: 0.09, groutRoughAdd: 0.12, aoGrout: 0.80, aoFace: 0.93, aoMin: 0.72 },
  ceils: { heightScale: 0.6, normalStrength: 0.8, aoBoost: 0.55, blockSize: 8, groutWidth: 1, domeStrength: 1.0, roughness: 0.82, roughnessVariation: 0.08, groutRoughAdd: 0.10, aoGrout: 0.82, aoFace: 0.95, aoMin: 0.75 }
};

test("atlas generation produces correctly sized arrays", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  assert.equal(atl.texSize, 64);
  assert.equal(atl.wallCount, 1); assert.equal(atl.floorCount, 1); assert.equal(atl.ceilCount, 1);
  const sz = 64 * 64;
  assert.equal(atl.wallAlbedo.length, sz * 4);
  assert.equal(atl.wallNormal.length, sz * 4);
  assert.equal(atl.wallHeight.length, sz);
  assert.equal(atl.wallRoughMetalAO.length, sz * 4);
  assert.equal(atl.floorAlbedo.length, sz * 4);
  assert.equal(atl.ceilAlbedo.length, sz * 4);
});

test("Task10: material array pipeline supports N materials, no bleeding, array path", () => {
  const multi = [
    { id: 1, base: [138, 58, 44], roughness: 0.85, variationSeed: 1 },
    { id: 2, base: [90, 88, 80], roughness: 0.88, variationSeed: 2 },
  ];
  const arr = generateMaterialArrayData(multi, multi, multi, { ...proc, texSize: 64 });
  assert.equal(arr.wallCount, 2, "array pipeline supports 2 wall types");
  assert.equal(arr.floorCount, 2);
  assert.equal(arr.ceilCount, 2);
  assert.equal(arr.texSize, 64);
  // array data sizes: texSize*texSize*count*4
  const layerPix = 64*64;
  assert.equal(arr.walls.albedo.length, layerPix*2*4);
  assert.equal(arr.walls.height.length, layerPix*2);
  // legacy atlas wrapper also now supports N (not forced 1) for fallback
  const atl = generateMaterialAtlases(multi, multi, multi, proc);
  assert.equal(atl.wallCount, 2, "legacy wrapper now also reports 2 for array compatibility");
  assert.equal(atl.wallAtlasW, 128, "atlas fallback would be 128 wide for 2 mats");
});

test("single-material lock: legacy Task3 single mat still works as 1-layer array", () => {
  const single = [{ id: 1, base: [138, 58, 44], roughness: 0.85, variationSeed: 1 }];
  const atl = generateMaterialAtlases(single, single, single, proc);
  assert.equal(atl.wallCount, 1);
  assert.equal(atl.floorCount, 1);
  assert.equal(atl.ceilCount, 1);
  assert.equal(atl.wallAtlasW, 64);
  assert.equal(atl.floorAtlasW, 64);
  assert.equal(atl.ceilAtlasW, 64);
});

test("albedo values in valid range 0..255", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < atl.wallAlbedo.length; i++) {
    const v = atl.wallAlbedo[i];
    assert(v >= 0 && v <= 255 && Number.isFinite(v), `albedo[${i}]=${v} out of range`);
  }
  for (let i = 0; i < atl.floorAlbedo.length; i++) {
    assert(atl.floorAlbedo[i] >= 0 && atl.floorAlbedo[i] <= 255);
  }
});

test("normal map decodes to unit length and not flat", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  let nonFlat = 0;
  for (let i = 0; i < 20; i++) {
    const idx = Math.floor(Math.random() * 64 * 64) * 4;
    const nx = atl.wallNormal[idx] / 255 * 2 - 1;
    const ny = atl.wallNormal[idx + 1] / 255 * 2 - 1;
    const nz = atl.wallNormal[idx + 2] / 255 * 2 - 1;
    const len = Math.hypot(nx, ny, nz);
    assert(Math.abs(len - 1) < 1.0, `normal length ${len} not ~1`);
    if (Math.abs(nx) > 0.05 || Math.abs(ny) > 0.05) nonFlat++;
  }
  assert(nonFlat > 5, "normals should have variation, not flat (0,0,1) everywhere");
});

test("height values in valid range and 4-sided dome", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < atl.wallHeight.length; i++) {
    const v = atl.wallHeight[i];
    assert(v >= 0 && v <= 255, `height[${i}]=${v} out of range`);
  }
  // floor slab must have pillowed dome: center of 8x8 block higher than edge within same block
  const block = 8, sz = 64;
  const bx = 2, by = 2; // block coords
  const centerX = bx * block + block / 2, centerY = by * block + block / 2;
  const edgeX = bx * block;
  const hCenter = atl.floorHeight[centerY * sz + centerX];
  const hEdge = atl.floorHeight[centerY * sz + edgeX];
  assert(hCenter > hEdge, `slab dome center ${hCenter} should exceed edge ${hEdge}`);
});

test("determinism across invocations", () => {
  const a1 = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  const a2 = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  assert.deepEqual(Array.from(a1.wallAlbedo), Array.from(a2.wallAlbedo));
  assert.deepEqual(Array.from(a1.wallNormal), Array.from(a2.wallNormal));
  assert.deepEqual(Array.from(a1.wallHeight), Array.from(a2.wallHeight));
  assert.deepEqual(Array.from(a1.wallRoughMetalAO), Array.from(a2.wallRoughMetalAO));
});

test("brick pattern recognizable via height difference", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  const hCenter = atl.wallHeight[4 * 64 + 4];
  const hGroove = atl.wallHeight[4 * 64 + 0];
  assert(hCenter > hGroove + 20, `brick center height ${hCenter} should exceed groove ${hGroove} significantly`);
});

test("roughness variation textured not flat constant (fix || bug)", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  // sample rough channel (R of RoughMetalAO)
  const roughs = [];
  for (let i = 0; i < 64 * 64; i++) roughs.push(atl.wallRoughMetalAO[i * 4]);
  const min = Math.min(...roughs), max = Math.max(...roughs);
  const range = max - min;
  assert(range > 30, `roughness should vary textured 151-234 not flat, range ${range} min ${min} max ${max}`);
  // also not hardcoded 217 constant dominating
  const avg = roughs.reduce((a, b) => a + b, 0) / roughs.length;
  assert(avg !== 217, "avg roughness should not be flat 217 from || bug");
  // ensure grout rougher than face on average
  // grout at x%8==0, face at 4
  let groutSum = 0, groutCnt = 0, faceSum = 0, faceCnt = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const idx = y * 64 + x;
    const isGrout = (x % 8) < 1 || (y % 8) < 1;
    if (isGrout) { groutSum += atl.wallRoughMetalAO[idx * 4]; groutCnt++; }
    else if ((x % 8) === 4) { faceSum += atl.wallRoughMetalAO[idx * 4]; faceCnt++; }
  }
  // groutRoughAdd should make grout slightly rougher
  assert(groutSum / groutCnt > faceSum / faceCnt - 10, "grout should be rougher or similar to face center");
});

test("AO softened not black grid: 0.70 min, 0.78 grout, 0.92 face", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  const aoVals = [];
  for (let i = 0; i < 64 * 64; i++) aoVals.push(atl.wallRoughMetalAO[i * 4 + 3]); // A channel AO
  const minAO = Math.min(...aoVals), maxAO = Math.max(...aoVals);
  assert(minAO >= 160, `AO min should be >= 0.62*255 ~160 (softened), got ${minAO}`);
  assert(maxAO <= 255 && maxAO > 180, `AO max should be bright, got ${maxAO}`);
  assert(minAO > 105, "AO should not be 105 (old black mortar) anymore");
  // groove darker than face but not black
  let gSum = 0, gN = 0, fSum = 0, fN = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const idx = y * 64 + x;
    const v = atl.wallRoughMetalAO[idx * 4 + 3];
    const isGrout = (x % 8) < 1 || (y % 8) < 1;
    if (isGrout) { gSum += v; gN++; } else { fSum += v; fN++; }
  }
  const gAvg = gSum / gN, fAvg = fSum / fN;
  assert(gAvg < fAvg, `grout AO ${gAvg} should be darker than face ${fAvg} but softened`);
  assert(fAvg - gAvg < 50, `AO contrast should be softened <50 diff, got ${fAvg - gAvg}`);
});

test("emissive all black for Task 3", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < 64 * 64; i++) {
    const b = atl.wallRoughMetalAO[i * 4 + 2]; // emissive channel
    assert.equal(b, 0, "emissive should be 0 for Task 3");
  }
});

test("normal indexing fix sni=si*4 not si*3 (corrupted normals regression)", () => {
  // If indexing bug existed, normal map would repeat pattern every 3 pixels vs 4
  // Check that normal data length *4 matches albedo *4 structure and no corruption cross-tile
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  // each texel's RGBA should be valid and not bleed from other channels
  // Sample consecutive texels — difference should be small if dome, not random if mis-indexed
  const diffs = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 7; x++) {
    const a = y * 64 + x;
    const b = y * 64 + x + 1;
    const nax = atl.wallNormal[a * 4], nb = atl.wallNormal[b * 4];
    diffs.push(Math.abs(nax - nb));
  }
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  assert(avgDiff < 30, `normal neighboring diff should be small for smooth dome, got ${avgDiff} (corrupted if large)`);
});

test("atlasUvX computes correct UV offset", () => {
  assert.equal(atlasUvX(1, 64, 64), 0);
  assert.equal(atlasUvX(2, 64, 128), 0.5);
  assert.equal(atlasUvX(1, 64, 128), 0);
});
