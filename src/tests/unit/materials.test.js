import test from "node:test";
import assert from "node:assert/strict";
import { generateMaterialAtlases, atlasUvX } from "../../world/materials.js";

const wallMats = [{ id: 1, name: "dungeon_brick", type: "brick", base: [138, 58, 44], roughness: 0.85, metal: 0, variationSeed: 101, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const floorMats = [{ id: 1, name: "stone_slab", type: "slab", base: [90, 88, 80], roughness: 0.88, metal: 0, variationSeed: 201, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const ceilMats = [{ id: 1, name: "stone_ceiling", type: "slab", base: [80, 78, 70], roughness: 0.9, metal: 0, variationSeed: 301, emissiveColor: [0, 0, 0], emissiveStrength: 0 }];
const proc = { walls: { heightScale: 1.15, normalStrength: 1.15, aoBoost: 1.1, groutWidth: 1, domeStrength: 1.1, crackAmount: 0.6 }, floors: { heightScale: 1.15, normalStrength: 1.15, aoBoost: 1.1, blockSize: 8, groutWidth: 1, microOffset: 0.12 }, ceils: { heightScale: 1, normalStrength: 1.1, aoBoost: 1 } };

test("atlas generation produces correctly sized arrays", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  assert.equal(atl.texSize, 64);
  assert.equal(atl.wallCount, 1); assert.equal(atl.floorCount, 1); assert.equal(atl.ceilCount, 1);
  const sz = 64 * 64;
  assert.equal(atl.wallAlbedo.length, sz * 4);
  assert.equal(atl.wallNormal.length, sz * 4);
  assert.equal(atl.wallHeight.length, sz);
  assert.equal(atl.wallRoughMetal.length, sz * 4);
  assert.equal(atl.wallAO.length, sz);
  assert.equal(atl.wallEmissive.length, sz * 4);
});

test("albedo values in valid range", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < atl.wallAlbedo.length; i++) {
    const v = atl.wallAlbedo[i];
    assert(v >= 0 && v <= 255 && Number.isFinite(v), `albedo[${i}]=${v} out of range`);
  }
});

test("normal map decodes to unit length", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < 10; i++) {
    const idx = Math.floor(Math.random() * 64 * 64) * 4;
    const nx = atl.wallNormal[idx] / 255 * 2 - 1;
    const ny = atl.wallNormal[idx + 1] / 255 * 2 - 1;
    const nz = atl.wallNormal[idx + 2] / 255 * 2 - 1;
    const len = Math.hypot(nx, ny, nz);
    assert(Math.abs(len - 1) < 0.5, `normal length ${len} not ~1`);
  }
});

test("height values in valid range", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  for (let i = 0; i < atl.wallHeight.length; i++) {
    const v = atl.wallHeight[i];
    assert(v >= 0 && v <= 255, `height[${i}]=${v} out of range`);
  }
});

test("determinism across invocations", () => {
  const a1 = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  const a2 = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  assert.deepEqual(Array.from(a1.wallAlbedo), Array.from(a2.wallAlbedo));
  assert.deepEqual(Array.from(a1.wallNormal), Array.from(a2.wallNormal));
  assert.deepEqual(Array.from(a1.wallHeight), Array.from(a2.wallHeight));
});

test("brick pattern recognizable via height difference", () => {
  const atl = generateMaterialAtlases(wallMats, floorMats, ceilMats, proc);
  // brick center should be higher than mortar groove
  // sample approximate brick center at (4,4) within 8x8 brick cell, and groove at (0,4)
  const hCenter = atl.wallHeight[4 * 64 + 4];
  const hGroove = atl.wallHeight[4 * 64 + 0];
  assert(hCenter > hGroove + 20, `brick center height ${hCenter} should exceed groove ${hGroove} significantly`);
});

test("atlasUvX computes correct UV offset", () => {
  assert.equal(atlasUvX(1, 64, 64), 0);
  assert.equal(atlasUvX(2, 64, 128), 0.5);
});
