// SSR Math - JS mirror of glslSSR for unit testing (pure math, no GL)
// Used by tests/unit/ssr.test.js and by sandbox.js auto-sweep validation
// Mirrors: octaEncode/Decode, reflect, worldToScreenUV, depth, fresnel, etc.

export function octaEncode(n){
  let [x,y,z] = n;
  const invL1 = 1.0 / (Math.abs(x)+Math.abs(y)+Math.abs(z));
  x *= invL1; y *= invL1; z *= invL1;
  let encX = x, encY = y;
  if (z < 0) {
    const sx = x >= 0 ? 1 : -1;
    const sy = y >= 0 ? 1 : -1;
    encX = (1 - Math.abs(y)) * sx;
    encY = (1 - Math.abs(x)) * sy;
  }
  return [encX*0.5+0.5, encY*0.5+0.5];
}

export function octaDecode(enc){
  let [ex, ey] = enc;
  let fx = ex*2-1, fy = ey*2-1;
  let nx = fx, ny = fy, nz = 1 - Math.abs(fx) - Math.abs(fy);
  const t = Math.max(0, -nz);
  nx += nx >= 0 ? -t : t;
  ny += ny >= 0 ? -t : t;
  const len = Math.hypot(nx,ny,nz);
  if (len < 0.0001) return [0,0,1];
  return [nx/len, ny/len, nz/len];
}

export function reflectVec(I, N){
  const d = I[0]*N[0]+I[1]*N[1]+I[2]*N[2];
  return [I[0]-2*d*N[0], I[1]-2*d*N[1], I[2]-2*d*N[2]];
}

export function normalize(v){
  const len = Math.hypot(v[0],v[1],v[2]);
  if (len < 0.0001) return [0,0,1];
  return [v[0]/len, v[1]/len, v[2]/len];
}

// world -> screen UV for raycast camera - matches glsl worldToScreenUVSSR fixed Y sign + bob + aspect
// resolution = [w,h] or {x,y}, bobPixels same as u_bobPixels (screen-space vertical shift)
// Matches main: v_uv = 0.5 - (eyeZ - worldZ)*(resX/resY)*0.5/(tan*perp) + bob/resY
export function worldToScreenUV(worldPos, camPos, eyeZ, playerAngle, planeLen, resolution, bobPixels=0){
  const dx = worldPos[0] - camPos[0];
  const dy = worldPos[1] - camPos[1];
  const dirX = Math.cos(playerAngle);
  const dirY = Math.sin(playerAngle);
  const rightX = -dirY;
  const rightY = dirX;
  let forwardDist = dx*dirX + dy*dirY;
  const rightDist = dx*rightX + dy*rightY;
  if (forwardDist < 0.06) forwardDist = 0.06;
  const cameraX = rightDist / forwardDist / Math.max(0.0001, planeLen);
  const uvX = cameraX*0.5 + 0.5;
  const fovFactor = 1.0 / Math.max(0.0001, planeLen);
  const resX = Array.isArray(resolution) ? resolution[0] : (resolution.x ?? resolution.width ?? 640);
  const resY = Array.isArray(resolution) ? resolution[1] : (resolution.y ?? resolution.height ?? 360);
  const aspect = resX / Math.max(1, resY);
  const yShift = (eyeZ - worldPos[2]) / forwardDist * fovFactor * 0.5 * aspect;
  const uvY_noBob = 0.5 - yShift;
  const uvY = uvY_noBob + bobPixels / Math.max(1, resY);
  return { uv:[uvX, uvY], uvNoBob:[uvX, uvY_noBob], forwardDist, cameraX, rightDist };
}

export function computeFresnel(NdotV, power, fMin, fMax){
  const f = fMin + (fMax - fMin) * Math.pow(1 - NdotV, power);
  return Math.max(0, Math.min(1, f));
}

export function computeEdgeFade(uv, start, end){
  const d = Math.max(Math.abs(uv[0]-0.5), Math.abs(uv[1]-0.5))*2;
  if (d <= start) return 1.0;
  if (d >= end) return 0.0;
  return 1 - (d - start)/(end - start);
}

export function computeDistanceFade(dist, start, end){
  if (dist <= start) return 1.0;
  if (dist >= end) return 0.0;
  return 1 - (dist - start)/(end - start);
}

// Simple expected color for flatColorRoom scene
export function expectedWallColor(side, stepDir){
  // side 0 = x, side 1 = y, stepDir -1/1
  if (side===0) {
    return stepDir.x < 0 ? [255,64,64] : [0,255,255]; // east/west?
  } else {
    return stepDir.y < 0 ? [64,255,64] : [255,255,64];
  }
}

// Validate SSR reflection should see opposite wall
export function validatePuddleReflection(playerPos, playerAngle, puddlePos, wallPos, planeLen){
  // V = eye - puddle
  const eye = [playerPos[0], playerPos[1], 0.5];
  const V = normalize([eye[0]-puddlePos[0], eye[1]-puddlePos[1], eye[2]-puddlePos[2]]);
  const N = [0,0,1];
  const R = reflectVec([-V[0], -V[1], -V[2]], N);
  // reflected ray from puddle + R*t should hit near wallPos
  // Simple check: does ray from puddle in direction R come close to wall?
  const toWall = [wallPos[0]-puddlePos[0], wallPos[1]-puddlePos[1], wallPos[2]-puddlePos[2]];
  const dotRW = R[0]*toWall[0] + R[1]*toWall[1] + R[2]*toWall[2];
  const lenW = Math.hypot(toWall[0], toWall[1], toWall[2]);
  const lenR = Math.hypot(R[0],R[1],R[2]);
  const cosAngle = dotRW / (lenW*lenR);
  return { V, N, R, toWall, cosAngle, shouldHit: cosAngle > 0.7 };
}
