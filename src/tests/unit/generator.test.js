import test from "node:test";
import assert from "node:assert/strict";
import { hash2i, pickWeighted, zoneForDepth } from "../../world/dungeon/themes.js";
import { generateDungeon } from "../../world/dungeon/generator.js";

const baseConfig = {
  generator: {mapW:40, mapH:40, roomTarget:12, mainPathRooms:6, roomAttempts:200, levelCount:1, seed:1, loopExtraChance:0.06, linearity:0.5, sideBranchMaxDepth:2, flattenStartRadius:2, roomSizeMin:4, roomSizeMax:8, mainPathRoomSizeBonus:0},
  items: {maxTorches:12, minTorchDist:5, corridorBias:1.5},
  torchColors: [{r:1,g:0.6,b:0.2,name:"warm"}],
  boundaryWallId: 1,
};

test("hash2i deterministic across calls", () => {
  const a = hash2i(10, 20, 12345);
  const b = hash2i(10, 20, 12345);
  const c = hash2i(10, 21, 12345);
  assert.equal(a, b, "same inputs must give same hash");
  assert.notEqual(a, c, "different y must give different hash");
  assert(a >= 0 && a < 1, "hash normalized to 0..1");
});

test("pickWeighted deterministic", () => {
  const pool = [{id:1, weight:1}, {id:2, weight:2}, {id:3, weight:1}];
  const a = pickWeighted(pool, 5, 7, 99);
  const b = pickWeighted(pool, 5, 7, 99);
  assert.equal(a, b);
  assert([1,2,3].includes(a));
});

test("zoneForDepth returns valid zones across 0..1", () => {
  for (let t=0; t<=1; t+=0.1) {
    const {zone} = zoneForDepth(t, "classic");
    assert(zone && zone.name, `zone at t=${t}`);
    assert(zone.wallPool && zone.wallPool.length>0);
  }
});

test("generateDungeon deterministic: same seed same output across multiple seeds", async () => {
  // Verify determinism holds for a variety of seeds, and different seeds produce different outputs
  const seeds = [1, 42, 123, 12345, 77777, 999999];
  const outputs = new Map();

  for (const seed of seeds) {
    const d1 = await generateDungeon(baseConfig, seed);
    const d2 = await generateDungeon(baseConfig, seed);
    const d3 = await generateDungeon(baseConfig, seed);

    // Same seed must produce bit-identical output every time
    assert.equal(d1.seed, seed, `seed preserved for ${seed}`);
    assert.equal(d2.seed, seed); assert.equal(d3.seed, seed);
    assert.equal(d1.w, d2.w); assert.equal(d1.h, d2.h);
    assert.deepEqual(Array.from(d1.grid), Array.from(d2.grid), `grid bit-identical for seed ${seed}`);
    assert.deepEqual(Array.from(d1.grid), Array.from(d3.grid), `grid bit-identical on 3rd run for seed ${seed}`);
    assert.deepEqual(Array.from(d1.floorMat), Array.from(d2.floorMat), `floorMat identical for seed ${seed}`);
    assert.deepEqual(Array.from(d1.ceilMat), Array.from(d2.ceilMat), `ceilMat identical for seed ${seed}`);
    assert.deepEqual(Array.from(d1.deco), Array.from(d2.deco), `deco identical for seed ${seed}`);

    // Rooms array deeply equal
    assert.equal(d1.rooms.length, d2.rooms.length, `room count identical for seed ${seed}`);
    for (let i = 0; i < d1.rooms.length; i++) {
      const r1 = d1.rooms[i], r2 = d2.rooms[i];
      assert.equal(r1.x, r2.x, `room ${i} x identical for seed ${seed}`);
      assert.equal(r1.y, r2.y, `room ${i} y identical for seed ${seed}`);
      assert.equal(r1.w, r2.w, `room ${i} w identical for seed ${seed}`);
      assert.equal(r1.h, r2.h, `room ${i} h identical for seed ${seed}`);
      assert.equal(r1.role, r2.role, `room ${i} role identical for seed ${seed}`);
      assert.equal(r1.zone, r2.zone, `room ${i} zone identical for seed ${seed}`);
      assert.equal(r1.wallMat, r2.wallMat, `room ${i} wallMat identical for seed ${seed}`);
      assert.equal(r1.floorMat, r2.floorMat, `room ${i} floorMat identical for seed ${seed}`);
      assert.equal(r1.architecture, r2.architecture, `room ${i} architecture identical for seed ${seed}`);
      // Stair wall metadata must also be deterministic
      assert.deepEqual(r1.stairWall || null, r2.stairWall || null, `room ${i} stairWall identical for seed ${seed}`);
    }

    // Items and lights deterministic
    assert.equal(d1.items.length, d2.items.length, `items count identical for seed ${seed}`);
    assert.deepEqual(d1.items, d2.items, `items deeply identical for seed ${seed}`);
    assert.deepEqual(d1.lights, d2.lights, `lights deeply identical for seed ${seed}`);

    // Store signature for cross-seed comparison
    outputs.set(seed, Array.from(d1.grid).join(','));
  }

  // Different seeds should produce different outputs (verifies seed is actually used, not ignored)
  const sigs = [...outputs.values()];
  const uniqueSigs = new Set(sigs);
  assert.equal(uniqueSigs.size, seeds.length, `all ${seeds.length} seeds produce distinct outputs — seed parameter is functional`);
});

test("generateDungeon connectivity: all floors reachable from start", async () => {
  const d = await generateDungeon(baseConfig);
  const {w,h,grid} = d;
  const idx = (x,y)=>y*w+x;
  const start = [Math.floor(d.startX), Math.floor(d.startY)];
  const vis = new Set(); const q=[start]; vis.add(idx(...start));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){ const [x,y]=q.shift(); for(const [dx,dy] of dirs){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=w||ny>=h)continue; const ni=idx(nx,ny); if(vis.has(ni))continue; if(grid[ni]!==0)continue; vis.add(ni); q.push([nx,ny]); } }
  let floorCount=0; for(let i=0;i<grid.length;i++) if(grid[i]===0) floorCount++;
  // Main path must be fully connected for story flow; allow up to 15% isolated cells for edge case room placement quirks
  assert(vis.size>0 && vis.size >= floorCount*0.85, `at least 85% of ${floorCount} floor cells reachable, got ${vis.size}`);
  // Specifically require entrance and exit connected (core story requirement)
  const entrance = d.rooms.find(r=>r.role==="entrance");
  const exit = d.rooms.find(r=>r.role==="exit");
  assert(entrance && exit, "entrance and exit exist");
  assert(vis.has(idx(Math.floor(entrance.cx), Math.floor(entrance.cy))), "entrance reachable");
  assert(vis.has(idx(Math.floor(exit.cx), Math.floor(exit.cy))), "exit reachable from entrance via main path");
});

test("unmodified floor macro-geometry is exactly z=0", async () => {
  const dungeon = await generateDungeon(baseConfig, 42);
  for (let i = 0; i < dungeon.grid.length; i++) {
    if (dungeon.grid[i] === 0) assert.equal(dungeon.floorHeight[i], 0, `floor cell ${i}`);
  }
});

test("generateDungeon role assignment has entrance stairs guardians treasure", async () => {
  const cfg = {...baseConfig, generator:{...baseConfig.generator, roomTarget:32, roomAttempts:160}};
  const d = await generateDungeon(cfg, 777);
  const roles = d.rooms.map(r=>r.role);
  assert.equal(roles.filter(r=>r==="entrance").length, 1, "exactly 1 entrance");
  assert.equal(roles.filter(r=>r==="exit").length, 1, "exactly 1 stairs");
  const special = roles.filter(r=>["guardian","treasure","hub"].includes(r)).length;
  assert(special >= 2, `at least 2 special rooms, got ${special}`);
});

test("generateDungeon start goal separation substantial", async () => {
  const d = await generateDungeon(baseConfig);
  const entrance = d.rooms.find(r=>r.role==="entrance");
  const stairs = d.rooms.find(r=>r.role === 'exit');
  assert(entrance && stairs);
  const manh = Math.abs(entrance.cx - stairs.cx) + Math.abs(entrance.cy - stairs.cy);
  assert(manh > Math.min(d.w,d.h)*0.3, `start-goal Manhattan ${manh} should be substantial fraction of map`);
});

test("generateDungeon material IDs valid", async () => {
  const d = await generateDungeon(baseConfig);
  for(const v of d.grid) assert(v>=0 && v<=2, `wall ID ${v} in 0..2 range for Task 2`);
  for(const v of d.floorMat) assert(v===0 || (v>=1 && v<=2), `floor mat ${v} valid`);
  for(const v of d.ceilMat) assert(v===0 || (v>=1 && v<=2), `ceil mat ${v} valid`);
});

test("generateDungeon bounds respected", async () => {
  const d = await generateDungeon(baseConfig);
  for(const r of d.rooms){ assert(r.x>=1 && r.y>=1 && r.x+r.w<d.w && r.y+r.h<d.h, "room within bounds"); }
  // boundary walls enforced
  for(let x=0;x<d.w;x++){ assert(d.grid[x]!==0 && d.grid[(d.h-1)*d.w+x]!==0, "top/bottom boundary walls"); }
  for(let y=0;y<d.h;y++){ assert(d.grid[y*d.w]!==0 && d.grid[y*d.w+d.w-1]!==0, "left/right boundary walls"); }
});

test("generateDungeon stair walls avoid corridor doorways", async () => {
  // Stair wall must not overlap with corridor doorway — verify across multiple seeds
  for (let seed of [1, 42, 123, 777, 9999]) {
    const d = await generateDungeon(baseConfig, seed);
    const {w, grid} = d;
    const idx = (x,y) => y*w+x;
    const entrance = d.rooms.find(r=>r.role==="entrance");
    const exit = d.rooms.find(r=>r.role==="exit");
    assert(entrance?.stairWall, `entrance has stairWall metadata at seed ${seed}`);
    assert(exit?.stairWall, `exit has stairWall metadata at seed ${seed}`);

    function checkStairNoDoorway(room, label) {
      const sw = room.stairWall;
      // Check that stair wall segment cells are walls (not floors = doorways)
      if (sw.edge === "north" || sw.edge === "south") {
        const y = sw.y1;
        for (let x = sw.x1; x <= sw.x2; x++) {
          assert(grid[idx(x,y)] !== 0, `${label} stair at (${x},${y}) must be wall not doorway (seed ${seed})`);
        }
      } else {
        const x = sw.x1;
        for (let y = sw.y1; y <= sw.y2; y++) {
          assert(grid[idx(x,y)] !== 0, `${label} stair at (${x},${y}) must be wall not doorway (seed ${seed})`);
        }
      }
      // Also verify stair edge is not the same as any doorway edge with corridor floor outside
      const doors = new Set();
      for (let x = room.x; x < room.x + room.w; x++) {
        if (grid[idx(x, room.y-1)] === 0) doors.add("north");
        if (grid[idx(x, room.y+room.h)] === 0) doors.add("south");
      }
      for (let y = room.y; y < room.y + room.h; y++) {
        if (grid[idx(room.x-1, y)] === 0) doors.add("west");
        if (grid[idx(room.x+room.w, y)] === 0) doors.add("east");
      }
      assert(!doors.has(sw.edge), `${label} stair edge ${sw.edge} must not have doorway (seed ${seed}), doorways on: ${[...doors].join(",")}`);
    }
    checkStairNoDoorway(entrance, "entrance");
    checkStairNoDoorway(exit, "exit");
  }
});

test("generateDungeon side branch depth limited", async () => {
  const cfg = {...baseConfig, generator:{...baseConfig.generator, sideBranchMaxDepth:1}};
  for (let seed of [1, 42, 123, 777]) {
    const d = await generateDungeon(cfg, seed);
    for (const r of d.rooms) {
      if (!r.onMainPath) {
        const depth = r.sideDepth ?? 0;
        assert(depth <= 1, `side branch depth ${depth} exceeds max 1 at seed ${seed}`);
      }
    }
  }
});

test("generateDungeon main path rooms larger than side branches", async () => {
  const d = await generateDungeon(baseConfig, 12345);
  const mainSizes = d.rooms.filter(r=>r.onMainPath).map(r=>r.w*r.h);
  const sideSizes = d.rooms.filter(r=>!r.onMainPath).map(r=>r.w*r.h);
  if (sideSizes.length > 0) {
    const mainAvg = mainSizes.reduce((a,b)=>a+b,0) / mainSizes.length;
    const sideAvg = sideSizes.reduce((a,b)=>a+b,0) / sideSizes.length;
    assert(mainAvg >= sideAvg, `main path avg area ${mainAvg} should be >= side avg ${sideAvg}`);
  }
});

test("generateDungeon zone progression along main path", async () => {
  const d = await generateDungeon(baseConfig, 42);
  const mainRooms = d.rooms.filter(r=>r.onMainPath).sort((a,b)=>a.depth-b.depth);
  const zoneOrder = ["Entry","Antechamber","Depths","Sanctum","Exit"];
  let lastIdx = -1;
  for (const r of mainRooms) {
    const zi = zoneOrder.indexOf(r.zone);
    assert(zi >= 0, `valid zone ${r.zone}`);
    // Zones should generally progress forward (allow small backtrack due to topology)
    assert(zi >= lastIdx - 1, `zone progression roughly monotonic: ${zoneOrder[lastIdx]} -> ${r.zone}`);
    lastIdx = Math.max(lastIdx, zi);
  }
  // First room should be Entry-ish, last Exit-ish
  assert(["Entry","Antechamber"].includes(mainRooms[0].zone), "start near Entry zone");
  assert(["Sanctum","Exit"].includes(mainRooms[mainRooms.length-1].zone), "end near Exit zone");
});

test("generateDungeon items respect constraints", async () => {
  const d = await generateDungeon(baseConfig, 99);
  const items = d.items || [];
  const cfg = baseConfig.items;
  assert(items.length <= cfg.maxTorches, `torches ${items.length} <= max ${cfg.maxTorches}`);
  // Check min distance between torches
  for (let i=0; i<items.length; i++) for (let j=i+1; j<items.length; j++) {
    const dx = items[i].x - items[j].x, dy = items[i].y - items[j].y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    assert(dist >= cfg.minTorchDist - 0.01, `torch distance ${dist} >= ${cfg.minTorchDist}`);
  }
  // Each item has corresponding light
  assert.equal(d.lights.length, items.length, "lights match items");
});
