// Common geometry helpers – WGSL port of common.glsl.js
// Uses global bindings: mapTex: texture_2d<f32>, frame.mapSize, frame.playerPos, etc.
// Assumes frame uniform struct contains mapSize, playerPos

export const wgslCommon = `
// ----- common helpers -----

fn isWallCell(c: vec2<i32>) -> bool {
  if (c.x < 0 || c.y < 0 || c.x >= i32(frame.mapSize.x) || c.y >= i32(frame.mapSize.y)) {
    return false;
  }
  let m: vec4<f32> = textureLoad(mapTex, c, 0);
  return (m.r * 255.0 > 0.5);
}

struct NearestWallResult {
  dist: f32,
  normal: vec3<f32>,
}

fn nearestWallDistAndNormal(world: vec2<f32>) -> NearestWallResult {
  let cell = vec2<i32>(vec2<i32>(floor(world)));
  let f = fract(world);
  let dE: f32 = 1.0 - f.x;
  let nE = vec3<f32>(-1.0, 0.0, 0.0);
  let eWall = isWallCell(cell + vec2<i32>(1,0));
  let dW: f32 = f.x;
  let nW = vec3<f32>(1.0, 0.0, 0.0);
  let wWall = isWallCell(cell + vec2<i32>(-1,0));
  let dN: f32 = 1.0 - f.y;
  let nN = vec3<f32>(0.0, -1.0, 0.0);
  let nWall = isWallCell(cell + vec2<i32>(0,1));
  let dS: f32 = f.y;
  let nS = vec3<f32>(0.0, 1.0, 0.0);
  let sWall = isWallCell(cell + vec2<i32>(0,-1));

  var best: f32 = 100.0;
  var bestN = vec3<f32>(0.0, 0.0, 0.0);
  if (eWall && dE < best) { best = dE; bestN = nE; }
  if (wWall && dW < best) { best = dW; bestN = nW; }
  if (nWall && dN < best) { best = dN; bestN = nN; }
  if (sWall && dS < best) { best = dS; bestN = nS; }

  if (best > 0.35) {
    let neWall = isWallCell(cell + vec2<i32>(1,1));
    let nwWall = isWallCell(cell + vec2<i32>(-1,1));
    let seWall = isWallCell(cell + vec2<i32>(1,-1));
    let swWall = isWallCell(cell + vec2<i32>(-1,-1));
    let toNE = vec2<f32>(1.0 - f.x, 1.0 - f.y);
    let dNE = length(toNE);
    let toNW = vec2<f32>(-f.x, 1.0 - f.y);
    let dNW = length(toNW);
    let toSE = vec2<f32>(1.0 - f.x, -f.y);
    let dSE = length(toSE);
    let toSW = vec2<f32>(-f.x, -f.y);
    let dSW = length(toSW);

    var nNE: vec3<f32>;
    if (dNE > 0.0001) { nNE = vec3<f32>(normalize(-toNE), 0.0); } else { nNE = vec3<f32>(-0.707, -0.707, 0.0); }
    var nNW: vec3<f32>;
    if (dNW > 0.0001) { nNW = vec3<f32>(normalize(-toNW), 0.0); } else { nNW = vec3<f32>(0.707, -0.707, 0.0); }
    var nSE: vec3<f32>;
    if (dSE > 0.0001) { nSE = vec3<f32>(normalize(-toSE), 0.0); } else { nSE = vec3<f32>(-0.707, 0.707, 0.0); }
    var nSW: vec3<f32>;
    if (dSW > 0.0001) { nSW = vec3<f32>(normalize(-toSW), 0.0); } else { nSW = vec3<f32>(0.707, 0.707, 0.0); }

    if (neWall && dNE < best) { best = dNE; bestN = nNE; }
    if (nwWall && dNW < best) { best = dNW; bestN = nNW; }
    if (seWall && dSE < best) { best = dSE; bestN = nSE; }
    if (swWall && dSW < best) { best = dSW; bestN = nSW; }
  }

  // Blend close normals
  {
    let eps: f32 = 0.10;
    var accum = vec3<f32>(0.0, 0.0, 0.0);
    var cnt: i32 = 0;
    if (eWall && abs(dE - best) <= eps) { accum += nE; cnt += 1; }
    if (wWall && abs(dW - best) <= eps) { accum += nW; cnt += 1; }
    if (nWall && abs(dN - best) <= eps) { accum += nN; cnt += 1; }
    if (sWall && abs(dS - best) <= eps) { accum += nS; cnt += 1; }
    if (cnt > 1) {
      let len: f32 = length(accum);
      if (len > 0.35) { bestN = normalize(accum); }
    }
  }

  return NearestWallResult(best, bestN);
}

fn isOuterConvex(W: vec2<i32>, E: vec2<i32>, W2: vec2<i32>, D: vec2<i32>) -> bool {
  return !isWallCell(E) && !isWallCell(W2) && !isWallCell(D);
}
fn isInnerConcave(W: vec2<i32>, E: vec2<i32>, W2: vec2<i32>, D: vec2<i32>) -> bool {
  return !isWallCell(E) && isWallCell(W2) && isWallCell(D);
}

struct RayCircleHitResult {
  hit: bool,
  t0: f32,
  t1: f32,
}

fn rayCircleHit(O: vec2<f32>, Dir: vec2<f32>, C: vec2<f32>, r: f32) -> RayCircleHitResult {
  let oc = O - C;
  let a = dot(Dir, Dir);
  let b = 2.0 * dot(oc, Dir);
  let c_ = dot(oc, oc) - r * r;
  let disc = b * b - 4.0 * a * c_;
  if (disc < 0.0) {
    return RayCircleHitResult(false, 0.0, 0.0);
  }
  let sd = sqrt(disc);
  let t0 = (-b - sd) / (2.0 * a);
  let t1 = (-b + sd) / (2.0 * a);
  return RayCircleHitResult(true, t0, t1);
}

struct WallHitResult {
  hit: bool,
  t: f32,
  hp: vec2<f32>,
  n: vec2<f32>,
  rounded: bool,
}

fn resolveWallHit(W: vec2<i32>, side: i32, stepDir: vec2<i32>, ray: vec2<f32>, cornerR: f32,
                    cornerEnabled: i32, cornerInner: i32) -> WallHitResult {
  var perp: f32;
  if (side == 0) {
    perp = (f32(W.x) - frame.playerPos.x + (1.0 - f32(stepDir.x)) * 0.5) / ray.x;
  } else {
    perp = (f32(W.y) - frame.playerPos.y + (1.0 - f32(stepDir.y)) * 0.5) / ray.y;
  }
  var outT = perp;
  var outHp = frame.playerPos + ray * perp;
  var outN: vec2<f32>;
  if (side == 0) { outN = vec2<f32>(f32(-stepDir.x), 0.0); }
  else { outN = vec2<f32>(0.0, f32(-stepDir.y)); }
  var outRounded = false;

  if (cornerEnabled != 1 || cornerR <= 0.01) {
    return WallHitResult(true, outT, outHp, outN, outRounded);
  }

  for (var k: i32 = 0; k < 2; k++) {
    let off: i32 = select(1, -1, k == 0);
    var P: vec2<f32>;
    var interiorDir: vec2<f32>;
    var roomDir: vec2<f32>;
    var coordAlong: f32;
    var cornerCoord: f32;
    var E: vec2<i32>;
    var W2: vec2<i32>;
    var D: vec2<i32>;

    if (side == 0) {
      cornerCoord = f32(W.y) + select(1.0, 0.0, k == 0);
      coordAlong = outHp.y;
      P = vec2<f32>(f32(W.x) + select(0.0, 1.0, stepDir.x > 0), cornerCoord);
      interiorDir = vec2<f32>(f32(stepDir.x), f32(-off));
      roomDir = vec2<f32>(f32(-stepDir.x), f32(-off));
      E = vec2<i32>(W.x - stepDir.x, W.y);
      W2 = vec2<i32>(W.x, W.y + off);
      D = vec2<i32>(W.x - stepDir.x, W.y + off);
    } else {
      cornerCoord = f32(W.x) + select(1.0, 0.0, k == 0);
      coordAlong = outHp.x;
      P = vec2<f32>(cornerCoord, f32(W.y) + select(0.0, 1.0, stepDir.y > 0));
      interiorDir = vec2<f32>(f32(-off), f32(stepDir.y));
      roomDir = vec2<f32>(f32(-off), f32(-stepDir.y));
      E = vec2<i32>(W.x, W.y - stepDir.y);
      W2 = vec2<i32>(W.x + off, W.y);
      D = vec2<i32>(W.x + off, W.y - stepDir.y);
    }

    let outer = isOuterConvex(W, E, W2, D);
    let inner = (cornerInner == 1) && isInnerConcave(W, E, W2, D);
    if (!outer && !inner) { continue; }

    if (outer) {
      if (abs(coordAlong - cornerCoord) >= cornerR) { continue; }
      let C = P + interiorDir * cornerR;
      let hit = rayCircleHit(frame.playerPos, ray, C, cornerR);
      if (hit.hit) {
        for (var r: i32 = 0; r < 2; r++) {
          var t: f32 = select(hit.t1, hit.t0, r == 0);
          if (t <= 0.01) { continue; }
          let q = frame.playerPos + ray * t;
          let offP = q - C;
          if (offP.x * interiorDir.x > 0.0 || offP.y * interiorDir.y > 0.0) { continue; }
          return WallHitResult(true, t, q, normalize(offP), true);
        }
      }
      return WallHitResult(false, 0.0, vec2<f32>(0.0), vec2<f32>(0.0), false);
    } else {
      let C = P + roomDir * cornerR;
      let hit = rayCircleHit(frame.playerPos, ray, C, cornerR);
      if (hit.hit) {
        for (var r: i32 = 0; r < 2; r++) {
          var t: f32 = select(hit.t1, hit.t0, r == 0);
          if (t <= 0.01 || t >= perp) { continue; }
          let q = frame.playerPos + ray * t;
          let offP = q - C;
          if (offP.x * roomDir.x > 0.0 || offP.y * roomDir.y > 0.0) { continue; }
          return WallHitResult(true, t, q, normalize(-offP), true);
        }
      }
    }
  }

  return WallHitResult(true, outT, outHp, outN, outRounded);
}
`;
