export const wgslRaymarch = `
fn traceRaySun(origin: vec2<f32>, dir: vec2<f32>, maxDist: f32) -> bool {
  var mapPos: vec2<f32> = floor(origin);
  let deltaDist: vec2<f32> = vec2<f32>(abs(1.0 / dir.x), abs(1.0 / dir.y));
  var stepDir: vec2<i32> = vec2<i32>(select(-1, 1, dir.x >= 0.0), select(-1, 1, dir.y >= 0.0));
  var sideDist: vec2<f32>;
  if (dir.x < 0.0) {
    sideDist.x = (origin.x - mapPos.x) * deltaDist.x;
  } else {
    sideDist.x = (mapPos.x + 1.0 - origin.x) * deltaDist.x;
  }
  if (dir.y < 0.0) {
    sideDist.y = (origin.y - mapPos.y) * deltaDist.y;
  } else {
    sideDist.y = (mapPos.y + 1.0 - origin.y) * deltaDist.y;
  }

  var traveled: f32 = 0.0;
  for (var i: i32 = 0; i < 64; i++) {
    var side: i32;
    if (sideDist.x < sideDist.y) {
      sideDist.x += deltaDist.x;
      mapPos.x += f32(stepDir.x);
      traveled = sideDist.x - deltaDist.x;
      side = 0;
    } else {
      sideDist.y += deltaDist.y;
      mapPos.y += f32(stepDir.y);
      traveled = sideDist.y - deltaDist.y;
      side = 1;
    }
    if (traveled > maxDist) { return false; }
    let c: vec2<i32> = vec2<i32>(i32(mapPos.x), i32(mapPos.y));
    if (c.x < 0 || c.y < 0 || c.x >= i32(frame.mapSize.x) || c.y >= i32(frame.mapSize.y)) {
      continue;
    }
    let ms: vec4<f32> = textureLoad(mapTex, c, 0);
    if (ms.r * 255.0 > 0.5) {
      return true;
    }
  }
  return false;
}

fn traceRayPoint(origin: vec2<f32>, dir: vec2<f32>, maxDist: f32) -> bool {
  var mapPos: vec2<f32> = floor(origin);
  let deltaDist: vec2<f32> = vec2<f32>(abs(1.0 / dir.x), abs(1.0 / dir.y));
  var stepDir: vec2<i32> = vec2<i32>(select(-1, 1, dir.x >= 0.0), select(-1, 1, dir.y >= 0.0));
  var sideDist: vec2<f32>;
  if (dir.x < 0.0) {
    sideDist.x = (origin.x - mapPos.x) * deltaDist.x;
  } else {
    sideDist.x = (mapPos.x + 1.0 - origin.x) * deltaDist.x;
  }
  if (dir.y < 0.0) {
    sideDist.y = (origin.y - mapPos.y) * deltaDist.y;
  } else {
    sideDist.y = (mapPos.y + 1.0 - origin.y) * deltaDist.y;
  }

  var traveled: f32 = 0.0;
  for (var i: i32 = 0; i < 32; i++) {
    var side: i32;
    if (sideDist.x < sideDist.y) {
      sideDist.x += deltaDist.x;
      mapPos.x += f32(stepDir.x);
      traveled = sideDist.x - deltaDist.x;
      side = 0;
    } else {
      sideDist.y += deltaDist.y;
      mapPos.y += f32(stepDir.y);
      traveled = sideDist.y - deltaDist.y;
      side = 1;
    }
    if (traveled > maxDist) { return false; }
    let c: vec2<i32> = vec2<i32>(i32(mapPos.x), i32(mapPos.y));
    if (c.x < 0 || c.y < 0 || c.x >= i32(frame.mapSize.x) || c.y >= i32(frame.mapSize.y)) {
      continue;
    }
    let ms: vec4<f32> = textureLoad(mapTex, c, 0);
    if (ms.r * 255.0 > 0.5) {
      return true;
    }
  }
  return false;
}

fn traceRay(origin: vec2<f32>, dir: vec2<f32>, maxDist: f32) -> bool {
  return traceRayPoint(origin, dir, maxDist);
}
`;
