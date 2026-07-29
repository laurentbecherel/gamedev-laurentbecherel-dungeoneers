// 10-stage procedural dungeon generator — intentional main path with purposeful side branches

import { hash2i, pickWeighted, zoneForDepth, globalDepthForLevel, getTheme } from "./themes.js";
import { GRID_FLOOR, BOUNDARY_WALL_ID, STAIRS_MATERIAL_ID, DECO_COLUMN, DECO_MOSS, DECO_VINES, DECO_ARCH, DECO_BROKEN, DECO_PUDDLE, DECO_ROOTS, DECO_BEAM } from "./atlas.js";
import { generateDungeonItems } from "../items.js";

function makeRng(seed) { let s = seed >>> 0 || 1; return () => { s = Math.imul(s, 1664525) + 1013904223 >>> 0; return s / 0x100000000; }; }

export async function generateDungeon(config, seedOverride = null) {
  const gen = config.generator || {};
  const w = gen.mapW ?? 64, h = gen.mapH ?? 64;
  const roomTarget = gen.roomTarget ?? 14;
  const mainPathRooms = gen.mainPathRooms ?? 8;
  const roomAttempts = gen.roomAttempts ?? 200;
  const loopExtra = gen.loopExtraChance ?? 0.02;
  const linearity = gen.linearity ?? 0.85;
  const sideBranchMaxDepth = gen.sideBranchMaxDepth ?? 1;
  const roomSizeMin = gen.roomSizeMin ?? 6;
  const roomSizeMax = gen.roomSizeMax ?? 14;
  const mainPathRoomSizeBonus = gen.mainPathRoomSizeBonus ?? 2;
  const flattenRadius = gen.flattenStartRadius ?? 2;
  const levelCount = gen.levelCount ?? 1;
  const levelIndex = 0;
  const boundaryWallId = config.boundaryWallId ?? BOUNDARY_WALL_ID;
  const corridorWidthMain = gen.corridorWidthMain ?? gen.corridorWidth ?? 1;
  const corridorWidthSide = gen.corridorWidthSide ?? 1;
  const corridorWMainWeights = gen.corridorWidthMainWeights ?? [0.65, 0.3, 0.05]; // 1,2,3 tile probabilities
  const corridorWSideWeights = gen.corridorWidthSideWeights ?? [0.9, 0.1, 0.0];

  let seed = seedOverride;
  if (seed == null) seed = gen.seed != null ? gen.seed : Math.floor(Date.now() % 1000000);
  seed = seed >>> 0;
  const rng = makeRng(seed);

  const axis = rng() < 0.5 ? 0 : 1; // 0 = west-east, 1 = north-south
  const mainAxisLen = axis === 0 ? w : h;
  const crossLen = axis === 0 ? h : w;

  // --- Stage 1: Intentional main path placement ---
  const rooms = [];
  const mainPathIndices = [];

  // Place main path rooms in sequence along axis
  for (let i = 0; i < mainPathRooms; i++) {
    const progress = i / Math.max(1, mainPathRooms - 1);
    const isMainPathRoom = true;
    const sizeBonus = isMainPathRoom ? mainPathRoomSizeBonus : 0;
    let placed = false;
    // Try progressively smaller room sizes if placement fails
    for (let sizeTry = 0; sizeTry < 3 && !placed; sizeTry++) {
      const sizeReduce = sizeTry * 2;
      const rw = Math.max(4, roomSizeMin + sizeBonus - sizeReduce + Math.floor(rng() * Math.max(1, roomSizeMax - roomSizeMin + 1 - sizeBonus)));
      const rh = Math.max(4, roomSizeMin + sizeBonus - sizeReduce + Math.floor(rng() * Math.max(1, roomSizeMax - roomSizeMin + 1 - sizeBonus)));
      const mainCenter = 2 + progress * (mainAxisLen - Math.max(rw, rh) - 4);
      const crossWander = crossLen * 0.25 * (1 - linearity * 0.3);
      const mainJitter = mainAxisLen * 0.08 * (1 - linearity * 0.5);
      let mainPos = mainCenter + (rng() - 0.5) * mainJitter * 2;
      let crossPos = crossLen/2 + (rng() - 0.5) * crossWander * 2 - Math.max(rw, rh)/2;
      mainPos = Math.max(1, Math.min(mainAxisLen - Math.max(rw, rh) - 1, mainPos));
      crossPos = Math.max(1, Math.min(crossLen - Math.max(rw, rh) - 1, crossPos));
      const rx = axis === 0 ? Math.floor(mainPos) : Math.floor(crossPos);
      const ry = axis === 0 ? Math.floor(crossPos) : Math.floor(mainPos);

      for (let tryN = 0; tryN < 30 && !placed; tryN++) {
        const ox = Math.max(1, Math.min(w - rw - 1, rx + Math.floor((rng()-0.5)*10)));
        const oy = Math.max(1, Math.min(h - rh - 1, ry + Math.floor((rng()-0.5)*10)));
        let overlap = false;
        for (const r of rooms) {
          if (!(ox + rw + 1 <= r.x || r.x + r.w + 1 <= ox || oy + rh + 1 <= r.y || r.y + r.h + 1 <= oy)) { overlap = true; break; }
        }
        if (!overlap) { rooms.push({x:ox, y:oy, w:rw, h:rh, cx:ox+rw/2, cy:oy+rh/2, onMainPath:true, mainIndex:i}); mainPathIndices.push(rooms.length-1); placed=true; }
      }
    }
    if (!placed) {
      // Skip this main path slot rather than throwing — maintain at least 4 rooms total
      if (mainPathIndices.length < 2) throw new Error("Failed to place main path room "+i);
      continue;
    }
  }

  // Place side branch rooms at designated hubs along main path
  const remainingRooms = Math.max(0, roomTarget - mainPathIndices.length);
  const hubCandidates = mainPathIndices.filter((_, idx) => idx > 0 && idx < mainPathIndices.length - 1 && idx % 2 === 1); // every other main room except ends
  const hubsToUse = hubCandidates.slice(0, Math.min(3, hubCandidates.length));
  let sidePlaced = 0;
  for (const hubIdx of hubsToUse) {
    const hub = rooms[hubIdx];
    const sideCount = Math.min(3, remainingRooms - sidePlaced, 1 + Math.floor(rng()*2)); // 1-2 side rooms per hub typically
    for (let s = 0; s < sideCount && sidePlaced < remainingRooms; s++) {
      // Try to place side room near hub, perpendicular to main axis
      const srw = roomSizeMin + Math.floor(rng() * (roomSizeMax - roomSizeMin - 1));
      const srh = roomSizeMin + Math.floor(rng() * (roomSizeMax - roomSizeMin - 1));
      let placed = false;
      for (let attempt = 0; attempt < 20 && !placed; attempt++) {
        const sideDir = rng() < 0.5 ? -1 : 1;
        const dist = 6 + Math.floor(rng() * 6); // 6-11 tiles from hub center
        let sx, sy;
        if (axis === 0) { sx = Math.floor(hub.cx + sideDir * dist - srw/2); sy = Math.floor(hub.cy + (rng()-0.5)*8 - srh/2); }
        else { sy = Math.floor(hub.cy + sideDir * dist - srh/2); sx = Math.floor(hub.cx + (rng()-0.5)*8 - srw/2); }
        sx = Math.max(1, Math.min(w - srw - 1, sx)); sy = Math.max(1, Math.min(h - srh - 1, sy));
        let overlap = false;
        for (const r of rooms) { if (!(sx + srw + 1 <= r.x || r.x + r.w + 1 <= sx || sy + srh + 1 <= r.y || r.y + r.h + 1 <= sy)) { overlap = true; break; } }
        if (!overlap) { rooms.push({x:sx, y:sy, w:srw, h:srh, cx:sx+srw/2, cy:sy+srh/2, onMainPath:false, hubParent:hubIdx, sideDepth:1}); sidePlaced++; placed=true; }
      }
      // Optional depth-2 secret off this side room (rare)
      if (placed && sideBranchMaxDepth >= 2 && rng() < 0.25 && sidePlaced < remainingRooms) {
        const parent = rooms[rooms.length-1];
        const srw2 = roomSizeMin + Math.floor(rng() * 5);
        const srh2 = roomSizeMin + Math.floor(rng() * 5);
        for (let attempt = 0; attempt < 15; attempt++) {
          const ang = rng() * Math.PI * 2;
          const dist = 5 + rng()*4;
          const sx = Math.max(1, Math.min(w-srw2-1, Math.floor(parent.cx + Math.cos(ang)*dist - srw2/2)));
          const sy = Math.max(1, Math.min(h-srh2-1, Math.floor(parent.cy + Math.sin(ang)*dist - srh2/2)));
          let overlap = false;
          for (const r of rooms) { if (!(sx + srw2 + 1 <= r.x || r.x + r.w + 1 <= sx || sy + srh2 + 1 <= r.y || r.y + r.h + 1 <= sy)) { overlap = true; break; } }
          if (!overlap) { rooms.push({x:sx, y:sy, w:srw2, h:srh2, cx:sx+srw2/2, cy:sy+srh2/2, onMainPath:false, hubParent:hubIdx, sideDepth:2}); sidePlaced++; break; }
        }
      }
    }
  }

  if (rooms.length < 4) throw new Error("Failed to place enough rooms");

  // Build graph: connect main path sequentially, then attach side branches to their hubs
  const edges = [];
  // Main path backbone — connect in order
  for (let i = 0; i < mainPathIndices.length - 1; i++) {
    const a = mainPathIndices[i], b = mainPathIndices[i+1];
    const dx = rooms[a].cx - rooms[b].cx, dy = rooms[a].cy - rooms[b].cy;
    edges.push({a, b, w: dx*dx + dy*dy, tag:"main"});
  }
  // Side branches to hubs
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (!r.onMainPath && r.hubParent != null) {
      const dx = r.cx - rooms[r.hubParent].cx, dy = r.cy - rooms[r.hubParent].cy;
      const tag = r.sideDepth === 2 ? "secret" : "side";
      edges.push({a:i, b:r.hubParent, w: dx*dx+dy*dy, tag});
    }
  }
  // Depth-2 to depth-1 parent connection already handled via hubParent chain? Need to find actual parent for depth2
  // Simplification: depth2 rooms connect to nearest depth1 side room
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.sideDepth === 2) {
      let best = -1, bestD = 1e9;
      for (let j = 0; j < rooms.length; j++) {
        const r2 = rooms[j];
        if (r2.sideDepth === 1 && r2.hubParent === r.hubParent) {
          const dx = r.cx - r2.cx, dy = r.cy - r2.cy, d = dx*dx+dy*dy;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
      if (best >= 0) edges.push({a:i, b:best, w:bestD, tag:"secret"});
    }
  }

  // Very sparse extra loops for occasional shortcuts
  const mstSet = new Set(edges.map(e => `${Math.min(e.a,e.b)}-${Math.max(e.a,e.b)}`));
  // Build candidate non-edges for loops
  const loopCandidates = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i+1; j < rooms.length; j++) {
    const key = `${i}-${j}`;
    if (mstSet.has(key)) continue;
    const dx = rooms[i].cx - rooms[j].cx, dy = rooms[i].cy - rooms[j].cy;
    const d2 = dx*dx + dy*dy;
    if (d2 < 400) loopCandidates.push({a:i, b:j, w:d2}); // only nearby rooms
  }
  loopCandidates.sort((x,y)=>x.w-y.w);
  const maxLoops = Math.max(0, Math.floor(rooms.length * 0.15)); // at most ~15% extra edges
  let loopsAdded = 0;
  for (const e of loopCandidates) {
    if (loopsAdded >= maxLoops) break;
    if (rng() < (config.generator || {}).loopExtraChance ?? 0.02) {
      edges.push({...e, tag:"loop"}); loopsAdded++;
    }
  }

  // Build adjacency
  const adj = Array(rooms.length).fill(0).map(()=>[]);
  edges.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });

  // BFS for main path verification (should match our intentional order, but verify)
  function bfs(start) {
    const dist = Array(rooms.length).fill(-1); const prev = Array(rooms.length).fill(-1);
    dist[start]=0; const q=[start];
    while(q.length){ const u=q.shift(); for(const v of adj[u]) if(dist[v]===-1){dist[v]=dist[u]+1;prev[v]=u;q.push(v);} }
    let far=start; for(let i=0;i<rooms.length;i++) if(dist[i]>dist[far]) far=i;
    return {far, dist, prev};
  }
  const entryIdx = mainPathIndices[0];
  const exitIdx = mainPathIndices[mainPathIndices.length-1];
  // Recompute main path via BFS from entry to ensure connectivity
  const bFromEntry = bfs(entryIdx);
  const mainPath = [];
  for(let cur = exitIdx; cur !== -1; cur = bFromEntry.prev[cur]) { mainPath.push(cur); if (cur === entryIdx) break; }
  mainPath.reverse();
  if (mainPath[0] !== entryIdx) { // fallback if BFS failed, use intentional order
    mainPath.length = 0; mainPath.push(...mainPathIndices);
  }

  // --- Stage 2: Role assignment (single level: entry -> exit) ---
  const roleMap = new Map();
  const mainLen2 = mainPath.length;
  mainPath.forEach((ri, idx) => {
    const frac = idx / Math.max(1, mainLen2-1);
    const deg = adj[ri].length;
    let role = "hall";
    if (idx === 0) role = "entrance";
    else if (idx === mainLen2-1) role = "exit";
    else if ((frac >= 0.55 && frac <= 0.7) || (frac >= 0.75 && frac <= 0.9)) role = "guardian";
    else if (Math.abs(frac - 0.3) < 0.1 || Math.abs(frac - 0.5) < 0.1) role = "treasure";
    else if (deg >= 3) role = "hub";
    roleMap.set(ri, role);
  });
  // Side branches by depth
  for (let i = 0; i < rooms.length; i++) if (!roleMap.has(i)) {
    const r = rooms[i];
    const d = r.sideDepth ?? 99;
    if (d === 2) roleMap.set(i, "secret");
    else if (d === 1) roleMap.set(i, rng() < 0.4 ? "treasure" : (rng() < 0.5 ? "armory" : "shrine"));
    else roleMap.set(i, "corridor");
  }

  // Determine stair wall positions for entrance and exit rooms
  // Entrance stair on back wall (opposite main path direction, away from corridor entrance).
  // Exit stair on far wall (along main path direction, away from corridor entrance).
  // Stair must never overlap with corridor doorway — player must traverse room to reach stair.
  function pickStairWall(roomIdx, towardIdx, isEntry) {
    const room = rooms[roomIdx];
    const target = rooms[towardIdx];
    if (!target) return null;
    const dx = target.cx - room.cx;
    const dy = target.cy - room.cy;
    const dirX = isEntry ? -dx : dx;
    const dirY = isEntry ? -dy : dy;

    // Determine which wall edges have corridor connections (doorways) to avoid placing stair there
    function edgeHasCorridor(edge) {
      const checks = [];
      if (edge === "north") for (let x = room.x; x < room.x + room.w; x++) checks.push([x, room.y - 1]);
      if (edge === "south") for (let x = room.x; x < room.x + room.w; x++) checks.push([x, room.y + room.h]);
      if (edge === "west")  for (let y = room.y; y < room.y + room.h; y++) checks.push([room.x - 1, y]);
      if (edge === "east")  for (let y = room.y; y < room.y + room.h; y++) checks.push([room.x + room.w, y]);
      // Heuristic: if any cell along edge is likely to become corridor floor, consider edge occupied.
      // Since corridors not carved yet at this stage, approximate by proximity to target room center.
      // For robustness we rely mainly on direction scoring — corridor will enter from side facing target,
      // stair goes opposite (entry) or same direction as target but on far side (exit), so they naturally separate.
      // Still, heavily penalize edges facing towardIdx for entry (that's corridor side) and away for exit.
      return false; // placeholder — direction scoring handles it via towardIdx choice
    }

    const candidates = [
      {edge:"north", nx:0, ny:-1, x1:room.x+1, y1:room.y-1, x2:room.x+room.w-2, y2:room.y-1},
      {edge:"south", nx:0, ny:1,  x1:room.x+1, y1:room.y+room.h, x2:room.x+room.w-2, y2:room.y+room.h},
      {edge:"west",  nx:-1,ny:0,  x1:room.x-1, y1:room.y+1, x2:room.x-1, y2:room.y+room.h-2},
      {edge:"east",  nx:1, ny:0,  x1:room.x+room.w, y1:room.y+1, x2:room.x+room.w, y2:room.y+room.h-2},
    ];
    // Score by dot product with desired stair direction. For entry, stair opposite to next room.
    // For exit, stair along direction from prev room to exit room (far wall).
    // Strongly weight direction so stair ends up opposite corridor entry.
    let best = candidates[0], bestScore = -Infinity;
    for (const c of candidates) {
      let score = c.nx * dirX + c.ny * dirY;
      // Heavy penalty if this edge faces toward the corridor partner (would overlap doorway)
      const corridorDirX = isEntry ? dx : -dx; // corridor comes from next/prev room direction
      const corridorDirY = isEntry ? dy : -dy;
      const corridorDot = c.nx * corridorDirX + c.ny * corridorDirY;
      if (corridorDot > 0.5) score -= 100; // strongly avoid edge facing corridor source
      score += hash2i(room.x + room.y, roomIdx, seed) * 0.01; // tie-break
      if (score > bestScore) { bestScore = score; best = c; }
    }
    // Clamp to 3-wide centered segment within room edge bounds
    const len = best.edge === "north" || best.edge === "south" ? (best.x2 - best.x1 + 1) : (best.y2 - best.y1 + 1);
    if (len >= 3) {
      const mid = Math.floor(len / 2);
      if (best.edge === "north" || best.edge === "south") {
        best.x1 += mid - 1; best.x2 = best.x1 + 2;
      } else {
        best.y1 += mid - 1; best.y2 = best.y1 + 2;
      }
    }
    return {edge: best.edge, x1: best.x1, y1: best.y1, x2: best.x2, y2: best.y2};
  }
  const entryRoomIdx = mainPath[0];
  const exitRoomIdx = mainPath[mainPath.length - 1];
  const entryNextIdx = mainPath.length > 1 ? mainPath[1] : null;
  const exitPrevIdx = mainPath.length > 1 ? mainPath[mainPath.length - 2] : null;
  const entryStairWall = entryNextIdx != null ? pickStairWall(entryRoomIdx, entryNextIdx, true) : null;
  const exitStairWall = exitPrevIdx != null ? pickStairWall(exitRoomIdx, exitPrevIdx, false) : null;

  // --- Stage 3: BFS depth from entry ---
  const depthArr = Array(rooms.length).fill(-1); depthArr[entryIdx]=0;
  const qd = [entryIdx];
  while(qd.length){ const u=qd.shift(); for(const v of adj[u]) if(depthArr[v]===-1){depthArr[v]=depthArr[u]+1; qd.push(v);} }
  const maxDepth = Math.max(...depthArr.filter(d=>d>=0));

  // --- Stage 4-5: Zone + materials per room ---
  const theme = getTheme("classic");
  rooms.forEach((r, ri) => {
    const localT = maxDepth > 0 ? (depthArr[ri] >= 0 ? depthArr[ri] / maxDepth : 0.5) : 0;
    const globalT = globalDepthForLevel(localT, levelIndex, levelCount);
    const {zone} = zoneForDepth(globalT, "classic");
    r.depth = localT; r.globalDepth = globalT; r.zone = zone.name; r.zoneObj = zone;
    const role = roleMap.get(ri) || "corridor"; r.role = role;
    // Attach stair wall metadata for entrance and exit rooms
    if (ri === entryRoomIdx && entryStairWall) r.stairWall = entryStairWall;
    if (ri === exitRoomIdx && exitStairWall) r.stairWall = exitStairWall;
    const hx = Math.floor(r.cx), hy = Math.floor(r.cy);
    // Task 3: single material only — lock to ID 1 = dungeon_brick / stone_slab / stone_ceiling
    // Even if zones list ID 2, we force 1 to keep atlas 64x64 and avoid CLAMP_TO_EDGE streaks.
    const wallMat = 1;
    const floorMat = 1;
    const ceilMat = 1;
    r.wallMat = wallMat; r.floorMat = floorMat; r.ceilMat = ceilMat;
    const archW = zone.architectureWeights || {dungeon:1};
    const archKeys = Object.keys(archW); const archTotal = archKeys.reduce((s,k)=>s+archW[k],0);
    const ar = hash2i(hx+300, hy+300, seed) * archTotal; let aa=0; r.architecture="dungeon";
    for(const k of archKeys){ aa+=archW[k]; if(ar<aa){r.architecture=k;break;} }
    const vw = zone.vaultWeights || [{type:0,weight:1}];
    const vt = vw.reduce((s,v)=>s+v.weight,0); const vr = hash2i(hx+400,hy+400,seed)*vt; let va=0; r.vaultType=0;
    for(const v of vw){ va+=v.weight; if(vr<va){r.vaultType=v.type;break;} }
    if ((role==="guardian"||role==="treasure") && rng()<0.6) r.vaultType = 1;
    const hz = zone.height || {};
    r.floorBase = ((hz.floorMin||0)+(hz.floorMax||0))/2;
    r.ceilBase = ((hz.ceilMin||1)+(hz.ceilMax||1.2))/2;
  });

  // --- Stage 6: Grid carving ---
  const size = w*h;
  const grid = new Uint8Array(size); grid.fill(boundaryWallId);
  const floorMat = new Uint8Array(size); const ceilMat = new Uint8Array(size);
  const floorHeight = new Float32Array(size); const ceilHeight = new Float32Array(size);
  const deco = new Uint8Array(size);
  const floorToRoom = new Int16Array(size); floorToRoom.fill(-1);
  function idx(x,y){return y*w+x;}
  rooms.forEach((r, ri) => {
    for(let dy=0; dy<r.h; dy++) for(let dx=0; dx<r.w; dx++){
      const x=r.x+dx, y=r.y+dy, i=idx(x,y);
      grid[i]=GRID_FLOOR; floorMat[i]=r.floorMat; ceilMat[i]=r.ceilMat; floorToRoom[i]=ri;
      const j = (hash2i(x,y,seed)-0.5)*0.06;
      floorHeight[i]=r.floorBase + j;
      ceilHeight[i]=r.ceilBase + (hash2i(x+500,y+500,seed)-0.5)*0.08;
    }
  });
  function carveCorridor(x1,y1,x2,y2, width=1){
    const hThenV = rng()<0.5;
    const path=[];
    if(hThenV){ const sx=Math.min(x1,x2), ex=Math.max(x1,x2); for(let x=sx;x<=ex;x++)path.push([x,y1]); const sy=Math.min(y1,y2), ey=Math.max(y1,y2); for(let y=sy;y<=ey;y++)path.push([x2,y]); }
    else { const sy=Math.min(y1,y2), ey=Math.max(y1,y2); for(let y=sy;y<=ey;y++)path.push([x1,y]); const sx=Math.min(x1,x2), ex=Math.max(x1,x2); for(let x=sx;x<=ex;x++)path.push([x,y2]); }
    const r = Math.floor(width/2);
    for(const [px,py] of path){
      for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++){
        const x=px+dx, y=py+dy;
        if(x<=0||y<=0||x>=w-1||y>=h-1)continue;
        const i=idx(x,y); if(grid[i]!==GRID_FLOOR){ grid[i]=GRID_FLOOR; floorToRoom[i]=-2; }
      }
    }
  }
  function pickWidth(weights, base) {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (r < acc) return base + i; }
    return base;
  }
  for(const e of edges){
    const ra=rooms[e.a], rb=rooms[e.b];
    const isMain = e.tag === "main";
    const base = isMain ? corridorWidthMain : corridorWidthSide;
    const weights = isMain ? corridorWMainWeights : corridorWSideWeights;
    const width = pickWidth(weights, base);
    carveCorridor(Math.floor(ra.cx), Math.floor(ra.cy), Math.floor(rb.cx), Math.floor(rb.cy), width);
  }
  for(let x=0;x<w;x++){ grid[idx(x,0)]=boundaryWallId; grid[idx(x,h-1)]=boundaryWallId; }
  for(let y=0;y<h;y++){ grid[idx(0,y)]=boundaryWallId; grid[idx(w-1,y)]=boundaryWallId; }

  // Verify and relocate stair walls if they overlap with actual corridor doorways
  // (pickStairWall ran before corridors were carved, so it could only guess)
  function doorwayEdges(room) {
    const edges = new Set();
    // Check each of the 4 sides for floor cells immediately outside room = doorway
    for (let x = room.x; x < room.x + room.w; x++) {
      if (grid[idx(x, room.y - 1)] === GRID_FLOOR) edges.add("north");
      if (grid[idx(x, room.y + room.h)] === GRID_FLOOR) edges.add("south");
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      if (grid[idx(room.x - 1, y)] === GRID_FLOOR) edges.add("west");
      if (grid[idx(room.x + room.w, y)] === GRID_FLOOR) edges.add("east");
    }
    return edges;
  }
  function relocateStairIfNeeded(roomIdx, towardIdx, isEntry) {
    const room = rooms[roomIdx];
    if (!room.stairWall) return;
    const doors = doorwayEdges(room);
    // If stair edge has a doorway, pick a different edge
    if (doors.has(room.stairWall.edge)) {
      // Re-pick from edges without doorways, preferring original direction intent
      const target = rooms[towardIdx]; if (!target) return;
      const dx = target.cx - room.cx, dy = target.cy - room.cy;
      const dirX = isEntry ? -dx : dx, dirY = isEntry ? -dy : dy;
      const candidates = [
        {edge:"north", nx:0, ny:-1, x1:room.x+1, y1:room.y-1, x2:room.x+room.w-2, y2:room.y-1},
        {edge:"south", nx:0, ny:1,  x1:room.x+1, y1:room.y+room.h, x2:room.x+room.w-2, y2:room.y+room.h},
        {edge:"west",  nx:-1,ny:0,  x1:room.x-1, y1:room.y+1, x2:room.x-1, y2:room.y+room.h-2},
        {edge:"east",  nx:1, ny:0,  x1:room.x+room.w, y1:room.y+1, x2:room.x+room.w, y2:room.y+room.h-2},
      ].filter(c => !doors.has(c.edge));
      if (candidates.length === 0) return; // no alternative, keep original (rare edge case)
      let best = candidates[0], bestScore = -Infinity;
      for (const c of candidates) {
        const score = c.nx * dirX + c.ny * dirY + hash2i(room.x+room.y, roomIdx, seed)*0.01;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      const len = best.edge==="north"||best.edge==="south" ? (best.x2-best.x1+1) : (best.y2-best.y1+1);
      if (len >= 3) { const mid=Math.floor(len/2);
        if (best.edge==="north"||best.edge==="south") { best.x1+=mid-1; best.x2=best.x1+2; }
        else { best.y1+=mid-1; best.y2=best.y1+2; }
      }
      room.stairWall = {edge:best.edge, x1:best.x1, y1:best.y1, x2:best.x2, y2:best.y2};
    }
  }
  if (entryNextIdx != null) relocateStairIfNeeded(entryRoomIdx, entryNextIdx, true);
  if (exitPrevIdx != null) relocateStairIfNeeded(exitRoomIdx, exitPrevIdx, false);

  // --- Stage 7: Wall painting ---
  rooms.forEach(r=>{
    for(let dx=-1; dx<=r.w; dx++) for(let dy=-1; dy<=r.h; dy++){
      if(dx>=0&&dx<r.w&&dy>=0&&dy<r.h) continue;
      const x=r.x+dx, y=r.y+dy; if(x<0||y<0||x>=w||y>=h)continue; const i=idx(x,y);
      if(grid[i]!==GRID_FLOOR) grid[i]=r.wallMat;
    }
    // Paint stair wall segments - Task 3 single material: force 1 to avoid atlas overflow streaks
    if(r.stairWall){
      const sw = r.stairWall;
      const stairMat = 1; // was STAIRS_MATERIAL_ID=2 which caused CLAMP_TO_EDGE streaks at exit
      if (sw.edge === "north" || sw.edge === "south") {
        const y = sw.y1;
        for (let x = sw.x1; x <= sw.x2; x++) { if (x>0 && x<w-1 && y>0 && y<h-1) { const ii=idx(x,y); if(grid[ii]!==GRID_FLOOR) grid[ii]=stairMat; } }
      } else {
        const x = sw.x1;
        for (let y = sw.y1; y <= sw.y2; y++) { if (x>0 && x<w-1 && y>0 && y<h-1) { const ii=idx(x,y); if(grid[ii]!==GRID_FLOOR) grid[ii]=stairMat; } }
      }
    }
  });
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=idx(x,y); if(grid[i]===GRID_FLOOR) continue; if(grid[i]===boundaryWallId) continue;
    let best=1, bestD=999; for(const r of rooms){ const d=Math.abs(x-r.cx)+Math.abs(y-r.cy); if(d<bestD){bestD=d; best=r.wallMat;} } grid[i]=best;
  }
  for(let x=0;x<w;x++){ grid[idx(x,0)]=boundaryWallId; grid[idx(x,h-1)]=boundaryWallId; }
  for(let y=0;y<h;y++){ grid[idx(0,y)]=boundaryWallId; grid[idx(w-1,y)]=boundaryWallId; }

  // --- Stage 8: refine corridor heights ---
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=idx(x,y); if(grid[i]===GRID_FLOOR && floorToRoom[i]===-2){ floorHeight[i]*=0.2; } }

  // --- Stage 9: Deco ---
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=idx(x,y); let d=0;
    if(grid[i]!==GRID_FLOOR){ const hv=hash2i(x,y,seed+10); if(hv<0.08) d|=DECO_COLUMN; else if(hv<0.15) d|=DECO_MOSS; else if(hv<0.18) d|=DECO_VINES; else if(hv<0.22) d|=DECO_ARCH; }
    else { const hv=hash2i(x+1000,y+1000,seed+20); if(hv<0.05) d|=DECO_BROKEN; else if(hv<0.08) d|=DECO_PUDDLE; else if(hv<0.11) d|=DECO_ROOTS; else if(hv<0.14) d|=DECO_BEAM; }
    deco[i]=d;
  }

  // --- Stage 10: Items ---
  const startRoom = rooms[mainPathIndices[0]];
  const startX = startRoom.cx, startY = startRoom.cy;
  for(let dy=-flattenRadius; dy<=flattenRadius; dy++) for(let dx=-flattenRadius; dx<=flattenRadius; dx++){
    const x=Math.floor(startX)+dx, y=Math.floor(startY)+dy; if(x<0||y<0||x>=w||y>=h)continue; const i=idx(x,y); if(grid[i]===GRID_FLOOR) floorHeight[i]=0;
  }
  const dungeon = {w,h,grid,floorHeight,ceilHeight,deco,floorMat,ceilMat,startX,startY,seed,rooms,items:[],lights:[],meta:{}};
  const genItemsCfg = {...config, ...(config.generator||{}), items: (config.generator||{}).items || config.items, torchColors: (config.generator||{}).torchColors || config.torchColors, boundaryWallId: (config.generator||{}).boundaryWallId ?? config.boundaryWallId };
  const {items, lights} = generateDungeonItems(dungeon, genItemsCfg);
  dungeon.items = items; dungeon.lights = lights;
  dungeon.meta = {themeId:"classic", themeName:"Classic Dungeon", levelIndex, levelCount, boundaryWallId,
    zoneSummary: theme.zones.map(z=>z.name), edges: edges.length, rolesSummary: Object.fromEntries([...new Set(rooms.map(r=>r.role))].map(r=>[r, rooms.filter(rr=>rr.role===r).length]))};
  return dungeon;
}
