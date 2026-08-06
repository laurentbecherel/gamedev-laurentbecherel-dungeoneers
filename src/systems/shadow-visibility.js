// CPU reference for the grid visibility used by light-shadow debugging and
// the future cached polar visibility texture. It mirrors the shader's 2D DDA
// rules and is deliberately renderer-independent for tests and editor tools.

export function traceGridDistance(grid, width, height, origin, direction, maxDistance = 20) {
  const dx=direction[0],dy=direction[1];
  const len=Math.hypot(dx,dy)||1,rx=dx/len,ry=dy/len;
  let mx=Math.floor(origin[0]),my=Math.floor(origin[1]);
  const ddx=Math.abs(1/(Math.abs(rx)<1e-9?1e-9:rx)),ddy=Math.abs(1/(Math.abs(ry)<1e-9?1e-9:ry));
  const sx=rx<0?-1:1,sy=ry<0?-1:1;
  let sdx=(rx<0?origin[0]-mx:mx+1-origin[0])*ddx;
  let sdy=(ry<0?origin[1]-my:my+1-origin[1])*ddy;
  for(let i=0;i<128;i++){
    let traveled;
    if(sdx<sdy){traveled=sdx;sdx+=ddx;mx+=sx;}else{traveled=sdy;sdy+=ddy;my+=sy;}
    if(traveled>maxDistance)return maxDistance;
    if(mx<0||my<0||mx>=width||my>=height)return Math.min(traveled,maxDistance);
    if(grid[my*width+mx]!==0)return Math.min(traveled,maxDistance);
  }
  return maxDistance;
}

export function buildPolarVisibility(grid,width,height,origin,samples=256,maxDistance=20){
  const out=new Float32Array(samples);
  for(let i=0;i<samples;i++){const a=i/samples*Math.PI*2;out[i]=traceGridDistance(grid,width,height,origin,[Math.cos(a),Math.sin(a)],maxDistance);}
  return out;
}

export function samplePolarVisibility(distances,angle){
  const n=distances.length;let u=(angle/(Math.PI*2)%1+1)%1*n;const a=Math.floor(u)%n,b=(a+1)%n,t=u-Math.floor(u);return distances[a]*(1-t)+distances[b]*t;
}
