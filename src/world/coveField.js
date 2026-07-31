// Cove field bake — precomputes distance-to-nearest-wall + wall normal (xy) per
// supersampled grid texel, mirroring the shader's nearestWallDistAndNormal()
// exactly. Lets the floor/ceiling cove chamfer replace an 8-neighbour per-fragment
// scan with a single texture sample. Rebuilt only when the dungeon changes.
//
// Output: Float32Array (RGBA per texel) — R = distance, G = normal.x, B = normal.y,
// A = 1. Texel (tx,ty) is baked at its centre world position ((tx+0.5)/S,(ty+0.5)/S).

export const COVE_SUPERSAMPLE = 16; // texels per world cell

// Port of shaders.js nearestWallDistAndNormal(). `isWall(cx,cy)` must match the
// shader's isWallCell (grid cell > 0, out-of-bounds = false).
function nearestWallDistAndNormal(wx, wy, isWall, out) {
  const cx = Math.floor(wx), cy = Math.floor(wy);
  const fx = wx - cx, fy = wy - cy;

  // Orthogonal
  const dE = 1.0 - fx, eWall = isWall(cx + 1, cy);
  const dW = fx,       wWall = isWall(cx - 1, cy);
  const dN = 1.0 - fy, nWall = isWall(cx, cy + 1);
  const dS = fy,       sWall = isWall(cx, cy - 1);
  const nE = [-1, 0], nW = [1, 0], nN = [0, -1], nS = [0, 1];

  // Diagonal
  const neWall = isWall(cx + 1, cy + 1);
  const nwWall = isWall(cx - 1, cy + 1);
  const seWall = isWall(cx + 1, cy - 1);
  const swWall = isWall(cx - 1, cy - 1);

  const toNE = [1.0 - fx, 1.0 - fy], dNE = Math.hypot(toNE[0], toNE[1]);
  const toNW = [-fx, 1.0 - fy],      dNW = Math.hypot(toNW[0], toNW[1]);
  const toSE = [1.0 - fx, -fy],      dSE = Math.hypot(toSE[0], toSE[1]);
  const toSW = [-fx, -fy],           dSW = Math.hypot(toSW[0], toSW[1]);
  const norm = (v, fb) => { const l = Math.hypot(v[0], v[1]); return l > 0.0001 ? [-v[0] / l, -v[1] / l] : fb; };
  const nNE = norm(toNE, [-0.707, -0.707]);
  const nNW = norm(toNW, [0.707, -0.707]);
  const nSE = norm(toSE, [-0.707, 0.707]);
  const nSW = norm(toSW, [0.707, 0.707]);

  let best = 100.0, bestN = [0, 0];
  if (eWall && dE < best) { best = dE; bestN = nE; }
  if (wWall && dW < best) { best = dW; bestN = nW; }
  if (nWall && dN < best) { best = dN; bestN = nN; }
  if (sWall && dS < best) { best = dS; bestN = nS; }
  if (neWall && dNE < best) { best = dNE; bestN = nNE; }
  if (nwWall && dNW < best) { best = dNW; bestN = nNW; }
  if (seWall && dSE < best) { best = dSE; bestN = nSE; }
  if (swWall && dSW < best) { best = dSW; bestN = nSW; }

  // Blend normals of every wall within eps of best (inner corners / end caps).
  const eps = 0.10;
  let ax = 0, ay = 0, cnt = 0;
  const acc = (cond, d, n) => { if (cond && Math.abs(d - best) <= eps) { ax += n[0]; ay += n[1]; cnt++; } };
  acc(eWall, dE, nE); acc(wWall, dW, nW); acc(nWall, dN, nN); acc(sWall, dS, nS);
  acc(neWall, dNE, nNE); acc(nwWall, dNW, nNW); acc(seWall, dSE, nSE); acc(swWall, dSW, nSW);
  if (cnt > 1) {
    const len = Math.hypot(ax, ay);
    if (len > 0.35) { bestN = [ax / len, ay / len]; }
  }

  out[0] = best; out[1] = bestN[0]; out[2] = bestN[1];
}

export function bakeCoveField(dungeon, S = COVE_SUPERSAMPLE) {
  const w = dungeon.w, h = dungeon.h;
  const grid = dungeon.grid;
  const isWall = (cx, cy) => (cx >= 0 && cy >= 0 && cx < w && cy < h && grid[cy * w + cx] > 0);
  const W = w * S, H = h * S;
  const data = new Float32Array(W * H * 4);
  const out = [0, 0, 0];
  for (let ty = 0; ty < H; ty++) {
    const wy = (ty + 0.5) / S;
    for (let tx = 0; tx < W; tx++) {
      const wx = (tx + 0.5) / S;
      nearestWallDistAndNormal(wx, wy, isWall, out);
      const di = (ty * W + tx) * 4;
      data[di] = out[0]; data[di + 1] = out[1]; data[di + 2] = out[2]; data[di + 3] = 1.0;
    }
  }
  return { data, W, H, S };
}
