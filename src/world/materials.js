// Procedural PBR material generation — CPU side — Texture2DArray-ready
// Task10 rethink: materials baked as array layers, not horizontal atlas strips.
// Each material type is one layer in a sampler2DArray (no bleeding, trivial to add type).
// Generator can assign per-cell material IDs via map/mats textures.

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 700001) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

function heightToNormal(hL, hR, hU, hD, strength) {
  const dx = (hR - hL) * strength;
  const dy = (hD - hU) * strength;
  const nx = -dx, ny = -dy, nz = 1.0;
  const len = Math.hypot(nx, ny, nz); const ilen = len > 0.0001 ? 1/len : 1;
  return [(nx * ilen * 0.5 + 0.5) * 255, (ny * ilen * 0.5 + 0.5) * 255, (nz * ilen * 0.5 + 0.5) * 255];
}

function genBrickTile(size, baseRGB, proc, seed, matRough, matMetal = 0) {
  const hs = proc.heightScale ?? 1.15;
  const ns = proc.normalStrength ?? 1.15;
  const aoB = proc.aoBoost ?? proc.aoStrength ?? 0.6;
  const aoGrout = proc.aoGrout ?? 0.78;
  const aoFace = proc.aoFace ?? 0.92;
  const aoDomeAdd = proc.aoDomeBoost ?? proc.domeAOBoost ?? proc.domeAdd ?? 0.08;
  const aoMin = proc.aoMin ?? 0.70;
  const gw = proc.groutWidth ?? 1;
  const ds = proc.domeStrength ?? 1.1;
  const ca = proc.crackAmount ?? 0.6;
  const baseRough = matRough ?? proc.roughness ?? 0.72;
  const roughVar = proc.roughnessVariation ?? proc.roughVar ?? 0.10;
  const groutRoughAdd = proc.groutRoughAdd ?? 0.15;
  const domeH = proc.domeHeight ?? 0.28;
  const bevelStart = proc.bevelStart ?? 0.42;
  const bevelDepth = proc.bevelDepth ?? 0.22;
  const cornerRound = proc.cornerRound ?? 0.5;
  const roundness = proc.roundness ?? 0.06;
  const groutDepth = proc.groutDepth ?? 0.08;
  const nf = proc.normalFactor ?? 1.6;
  const brickW = Math.max(4, proc.brickWidth ?? proc.blockSize ?? 8);
  const brickH = Math.max(4, proc.brickHeight ?? proc.blockSize ?? 8);
  const albedo = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const ao = new Float32Array(size * size);
  const rough = new Uint8Array(size * size);
  const metal = new Uint8Array(size * size);
  const emiss = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bx = Math.floor(x / brickW), by = Math.floor(y / brickH);
    const lx = x % brickW, ly = y % brickH;
    const offset = (by & 1) ? brickW / 2 : 0;
    const ax = (x + offset) % brickW;
    const inGrout = ax < gw || ax >= brickW - gw || ly < gw || ly >= brickH - gw;
    const cx = brickW / 2, cy = brickH / 2;
    const dx = (ax - cx + 0.5) / cx, dy = (ly - cy + 0.5) / cy;
    const cheby = Math.max(Math.abs(dx), Math.abs(dy));
    const eucl = Math.min(1, Math.hypot(dx, dy));
    const ap = cheby * (1 - cornerRound) + eucl * cornerRound;
    let bt = Math.max(0, (ap - bevelStart) / (1 - bevelStart)); bt = Math.min(1, bt);
    const bevel = bt * bt * (3 - 2 * bt);
    const dome = (1 - bevel) * domeH * ds;
    const round = (1 - ap * ap) * roundness;
    const hv = hash2(bx, by, seed);
    const varR = (hv - 0.5) * 28, varH = (hv - 0.5) * 0.12;
    let h = inGrout ? groutDepth : 0.5 + varH + round - bevel * bevelDepth;
    let r = baseRGB[0], g = baseRGB[1], b = baseRGB[2];
    if (inGrout) { r *= 0.45; g *= 0.4; b *= 0.35; h = groutDepth; }
    else {
      r += varR; g += varR * 0.7; b += varR * 0.5;
      // A few single/paired texels break pristine faces without turning the
      // material into photographic noise. These survive nearest filtering.
      const fleck = hash2(x, y, seed + 2711);
      if (fleck > (proc.fleckThreshold ?? 0.965)) { r -= 13; g -= 11; b -= 9; h -= 0.025; }
    }
    const onEdge = ax < 1.5 || ax > brickW - 1.5 || ly < 1.5 || ly > brickH - 1.5;
    if (onEdge && hash2(bx * 3 + 1, by * 5 + 2, seed) > 0.7) h -= 0.14 * ca;
    h = Math.max(0, Math.min(1, (h - 0.5) * hs + 0.5));
    const idx = y * size + x;
    height[idx] = h;
    const perBrickAOJitter = (hv - 0.5) * 0.04;
    const microAO = (hash2(x + 17, y + 29, seed + 7) - 0.5) * 0.04;
    const aobase = inGrout ? aoGrout : aoFace + dome * aoDomeAdd + perBrickAOJitter + microAO * 0.5;
    ao[idx] = Math.max(aoMin, Math.min(1, (aobase - 0.5) * aoB + 0.5));
    const ai = idx * 4;
    albedo[ai] = Math.max(0, Math.min(255, r | 0));
    albedo[ai + 1] = Math.max(0, Math.min(255, g | 0));
    albedo[ai + 2] = Math.max(0, Math.min(255, b | 0));
    albedo[ai + 3] = 255;
    const perBrickRoughJitter = (hv - 0.5) * roughVar;
    const microRough = (hash2(x, y, seed + 1337) - 0.5) * 0.06;
    const microRough2 = (hash2(x * 2, y * 3, seed + 101) - 0.5) * 0.03;
    const edgeRough = onEdge ? 0.03 : 0;
    let roughV;
    if (inGrout) roughV = baseRough + groutRoughAdd + microRough * 0.6 + edgeRough;
    else roughV = baseRough + perBrickRoughJitter + microRough + microRough2 - dome * 0.18 + edgeRough;
    roughV = Math.max(0.2, Math.min(0.95, roughV));
    rough[idx] = Math.round(roughV * 255);
    metal[idx] = Math.round(Math.max(0, Math.min(1, matMetal)) * 255);
    const ei=idx*4; emiss[ei]=0; emiss[ei+1]=0; emiss[ei+2]=0; emiss[ei+3]=255;
  }
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = x > 0 ? x - 1 : 0, xp = x < size - 1 ? x + 1 : size - 1;
    const ym = y > 0 ? y - 1 : 0, yp = y < size - 1 ? y + 1 : size - 1;
    const hL = height[y * size + xm], hR = height[y * size + xp];
    const hU = height[ym * size + x], hD = height[yp * size + x];
    const n = heightToNormal(hL, hR, hU, hD, ns * nf);
    const ni = (y * size + x) * 4;
    normal[ni] = n[0]|0; normal[ni+1]=n[1]|0; normal[ni+2]=n[2]|0; normal[ni+3]=255;
  }
  return { albedo, normal, height, rough, metal, ao, emiss };
}

function genSlabTile(size, baseRGB, proc, seed, isCeil, matRough, matMetal = 0) {
  const hs = proc.heightScale ?? 1.15;
  const ns = proc.normalStrength ?? 1.15;
  const aoB = proc.aoBoost ?? proc.aoStrength ?? 0.6;
  const aoGrout = proc.aoGrout ?? 0.78;
  const aoFace = proc.aoFace ?? (isCeil ? 0.94 : 0.92);
  const aoDomeAdd = proc.aoDomeBoost ?? proc.domeAOBoost ?? 0.08;
  const aoMin = proc.aoMin ?? 0.70;
  const bs = proc.blockSize ?? 8;
  const gw = proc.groutWidth ?? 1;
  const ds = proc.domeStrength ?? 1.1;
  const domeH = proc.domeHeight ?? 0.22;
  const bevelStart = proc.bevelStart ?? 0.48;
  const bevelDepth = proc.bevelDepth ?? 0.16;
  const cornerRound = proc.cornerRound ?? 0.5;
  const roundness = proc.roundness ?? 0.05;
  const groutDepth = proc.groutDepth ?? 0.08;
  const nf = proc.normalFactor ?? 1.4;
  const baseRough = matRough ?? proc.roughness ?? (isCeil ? 0.82 : 0.78);
  const roughVar = proc.roughnessVariation ?? proc.roughVar ?? 0.09;
  const groutRoughAdd = proc.groutRoughAdd ?? 0.12;
  const albedo = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const ao = new Float32Array(size * size);
  const rough = new Uint8Array(size * size);
  const metal = new Uint8Array(size * size);
  const emiss = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bx = Math.floor(x / bs), by = Math.floor(y / bs);
    const lx = x % bs, ly = y % bs;
    const inGrout = lx < gw || lx >= bs - gw || ly < gw || ly >= bs - gw;
    const cx = bs / 2, cy = bs / 2;
    const dx = (lx - cx + 0.5) / cx;
    const dy = (ly - cy + 0.5) / cy;
    const cheby = Math.max(Math.abs(dx), Math.abs(dy));
    const eucl = Math.min(1, Math.hypot(dx, dy));
    const ap = cheby * (1 - cornerRound) + eucl * cornerRound;
    let bt = Math.max(0, (ap - bevelStart) / (1 - bevelStart)); bt = Math.min(1, bt);
    const bevel = bt * bt * (3 - 2 * bt);
    const dome = (1 - bevel) * domeH * ds;
    const round = (1 - ap * ap) * roundness;
    const hv = hash2(bx, by, seed);
    const varR = (hv - 0.5) * 20, varH = (hv - 0.5) * 0.08;
    let h = inGrout ? groutDepth : 0.5 + varH + round - bevel * bevelDepth;
    let r = baseRGB[0], g = baseRGB[1], b = baseRGB[2];
    if (inGrout) { r *= 0.6; g *= 0.6; b *= 0.6; }
    else {
      r += varR; g += varR; b += varR;
      const crackSeed = hash2(bx, by, seed + 401);
      const crackX = Math.floor((ly * (0.35 + crackSeed * 0.4) + crackSeed * bs) % bs);
      const hairline = crackSeed > (proc.crackThreshold ?? 0.86) && Math.abs(lx - crackX) < 0.7 && ly > 1;
      const fleck = hash2(x, y, seed + 2801) > (proc.fleckThreshold ?? 0.975);
      if (hairline) { r -= 18; g -= 18; b -= 17; h -= 0.055; }
      else if (fleck) { r -= 10; g -= 10; b -= 9; h -= 0.018; }
    }
    h = Math.max(0, Math.min(1, (h - 0.5) * hs + 0.5));
    const idx = y * size + x;
    height[idx] = h;
    const perBlockAOJitter = (hv - 0.5) * 0.03;
    const microAO = (hash2(x + 11, y + 19, seed + 13) - 0.5) * 0.04;
    const aoBase = inGrout ? aoGrout : aoFace + dome * aoDomeAdd + perBlockAOJitter + microAO * 0.5;
    ao[idx] = Math.max(aoMin, Math.min(1, (aoBase - 0.5) * aoB + 0.5));
    const ai = idx * 4;
    albedo[ai] = Math.max(0, Math.min(255, r | 0));
    albedo[ai + 1] = Math.max(0, Math.min(255, g | 0));
    albedo[ai + 2] = Math.max(0, Math.min(255, b | 0));
    albedo[ai + 3] = 255;
    const perBlockRoughJitter = (hv - 0.5) * roughVar;
    const microRough = (hash2(x, y, seed + 2041) - 0.5) * 0.07;
    let roughV;
    if (inGrout) roughV = baseRough + groutRoughAdd + microRough * 0.5;
    else {
      const edgeDist = Math.max(Math.abs(dx), Math.abs(dy));
      roughV = baseRough + perBlockRoughJitter + microRough + edgeDist * 0.08 - dome * 0.15;
    }
    roughV = Math.max(0.25, Math.min(0.95, roughV));
    rough[idx] = Math.round(roughV * 255);
    metal[idx] = Math.round(Math.max(0, Math.min(1, matMetal)) * 255);
    const ei=idx*4; emiss[ei]=0; emiss[ei+1]=0; emiss[ei+2]=0; emiss[ei+3]=255;
  }
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = x > 0 ? x - 1 : 0, xp = x < size - 1 ? x + 1 : size - 1;
    const ym = y > 0 ? y - 1 : 0, yp = y < size - 1 ? y + 1 : size - 1;
    const hL = height[y * size + xm], hR = height[y * size + xp];
    const hU = height[ym * size + x], hD = height[yp * size + x];
    const n = heightToNormal(hL, hR, hU, hD, ns * nf);
    const ni = (y * size + x) * 4;
    normal[ni] = n[0]|0; normal[ni+1]=n[1]|0; normal[ni+2]=n[2]|0; normal[ni+3]=255;
  }
  return { albedo, normal, height, rough, metal, ao, emiss };
}

function normalMapFromHeight(size, height, strength) {
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = x > 0 ? x - 1 : 0, xp = x < size - 1 ? x + 1 : size - 1;
    const ym = y > 0 ? y - 1 : 0, yp = y < size - 1 ? y + 1 : size - 1;
    const n = heightToNormal(height[y*size+xm], height[y*size+xp], height[ym*size+x], height[yp*size+x], strength);
    const i = (y * size + x) * 4;
    normal[i] = n[0] | 0; normal[i+1] = n[1] | 0; normal[i+2] = n[2] | 0; normal[i+3] = 255;
  }
  return normal;
}

// Purpose-built, deliberately low-frequency patterns. Details are quantized
// to one or two texels so they read as authored pixel art after palette lookup.
function genWoodTile(size, baseRGB, proc, seed, matRough, matMetal = 0) {
  const albedo = new Uint8Array(size*size*4), height = new Float32Array(size*size);
  const ao = new Float32Array(size*size), rough = new Uint8Array(size*size), metal = new Uint8Array(size*size), emiss = new Uint8Array(size*size*4);
  const vertical = proc.direction === 'vertical';
  const plankWidth = Math.max(5, proc.plankWidth ?? 8), boardLength = Math.max(16, proc.boardLength ?? 32);
  const seamWidth = Math.max(1, proc.groutWidth ?? 1), knotChance = proc.knotChance ?? 0.18;
  const roughBase = matRough ?? 0.84;
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const across = vertical ? x : y, along = vertical ? y : x;
    const plank = Math.floor(across/plankWidth), localAcross = across%plankWidth;
    const jointOffset = (plank&1) ? Math.floor(boardLength*.5) : 0;
    const localAlong = (along+jointOffset)%boardLength;
    const seam = localAcross<seamWidth || localAlong<seamWidth;
    const boardTone = (hash2(plank, Math.floor((along+jointOffset)/boardLength), seed)-.5)*30;
    const grainCell = Math.floor(along/2);
    const grain = (hash2(grainCell, plank, seed+53)-.5)*10 + ((grainCell+plank*3)%7===0 ? -7 : 0);
    const knotSeed = hash2(plank, Math.floor((along+jointOffset)/boardLength), seed+79);
    const knotCenter = 5 + Math.floor(knotSeed*Math.max(5,boardLength-10));
    const knotDist = Math.hypot(localAlong-knotCenter, localAcross-plankWidth*.5);
    const knot = knotSeed < knotChance && knotDist < 2.2;
    const nail = !seam && (localAlong===2 || localAlong===boardLength-2) && (localAcross===2 || localAcross===plankWidth-2);
    let r=baseRGB[0]+boardTone+grain, g=baseRGB[1]+boardTone*.72+grain*.55, b=baseRGB[2]+boardTone*.42+grain*.28;
    let h=0.53 + (hash2(grainCell,plank,seed+97)-.5)*.035, a=.91, rv=roughBase + (hash2(x,y,seed+103)-.5)*.08, mv=matMetal;
    if(seam){r*=.38;g*=.34;b*=.3;h=.12;a=.68;rv=Math.min(.98,roughBase+.12);mv=0;}
    else if(knot){r-=26;g-=18;b-=10;h-=.07;rv=Math.min(.98,rv+.08);}
    else if(nail){r=48;g=45;b=39;h=.62;rv=.58;mv=.72;}
    const i=y*size+x, q=i*4; height[i]=Math.max(0,Math.min(1,h)); ao[i]=a; rough[i]=Math.round(Math.max(.25,Math.min(.98,rv))*255); metal[i]=Math.round(Math.max(0,Math.min(1,mv))*255);
    albedo[q]=Math.max(0,Math.min(255,r)); albedo[q+1]=Math.max(0,Math.min(255,g)); albedo[q+2]=Math.max(0,Math.min(255,b)); albedo[q+3]=255; emiss[q+3]=255;
  }
  return {albedo,normal:normalMapFromHeight(size,height,proc.normalStrength??1.15),height,rough,metal,ao,emiss};
}

function genNaturalRockTile(size, baseRGB, proc, seed, matRough, matMetal = 0) {
  const albedo = new Uint8Array(size*size*4), height = new Float32Array(size*size);
  const ao = new Float32Array(size*size), rough = new Uint8Array(size*size), metal = new Uint8Array(size*size), emiss = new Uint8Array(size*size*4);
  const cell = Math.max(7, proc.blockSize ?? 10), seamWidth = Math.max(1, proc.groutWidth ?? 2), roughBase=matRough??.96;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    // Both axes wander by a few whole texels. The course is still readable at
    // low resolution, but no longer resolves as a perfect bathroom-tile grid.
    const coarseCol=Math.floor(x/cell), yWarp=Math.floor((hash2(coarseCol,0,seed+19)-.5)*4), wy=y+yWarp;
    const row=Math.floor(wy/cell), rowWarp=Math.floor((hash2(row,0,seed)-.5)*5), wx=x+rowWarp;
    const col=Math.floor(wx/cell), lx=((wx%cell)+cell)%cell, ly=((wy%cell)+cell)%cell;
    const edgeWarp=Math.floor((hash2(col,row,seed+31)-.5)*2);
    const edge=Math.min(lx,cell-1-lx,ly+edgeWarp,cell-1-ly-edgeWarp);
    const cornerChip=(lx+ly < 2+(hash2(col,row,seed+37)>.55?1:0)) || ((cell-1-lx)+(cell-1-ly) < 2);
    const seam=edge<seamWidth || cornerChip;
    const stone=hash2(col,row,seed+47), speck=hash2(x,y,seed+67);
    const dx=(lx-cell*.5)/(cell*.5),dy=(ly-cell*.5)/(cell*.5),dome=Math.max(0,1-Math.hypot(dx,dy)*.62);
    let tone=(stone-.5)*34+(speck>.965?-13:0),r=baseRGB[0]+tone,g=baseRGB[1]+tone*.92,b=baseRGB[2]+tone*.72;
    let h=.39+dome*.22+(stone-.5)*.08,a=.88,rv=roughBase+(speck-.5)*.035;
    if(seam){r*=.48;g*=.5;b*=.45;h=.09;a=.62;rv=.98;}
    const i=y*size+x,q=i*4;height[i]=Math.max(0,Math.min(1,h));ao[i]=a;rough[i]=Math.round(Math.max(.35,Math.min(.99,rv))*255);metal[i]=Math.round(matMetal*255);
    albedo[q]=Math.max(0,Math.min(255,r));albedo[q+1]=Math.max(0,Math.min(255,g));albedo[q+2]=Math.max(0,Math.min(255,b));albedo[q+3]=255;emiss[q+3]=255;
  }
  return {albedo,normal:normalMapFromHeight(size,height,proc.normalStrength??1.45),height,rough,metal,ao,emiss};
}

// Compacted cave earth is intentionally broad and quiet: large colour patches
// establish soil, while isolated one/two-pixel stones provide the readable
// retro detail. It must not look like another grouted masonry material.
function genPackedDirtTile(size, baseRGB, proc, seed, matRough, matMetal = 0) {
  const albedo=new Uint8Array(size*size*4),height=new Float32Array(size*size),ao=new Float32Array(size*size),rough=new Uint8Array(size*size),metal=new Uint8Array(size*size),emiss=new Uint8Array(size*size*4);
  const patch=Math.max(7,proc.patchSize??10),cellCount=Math.max(4,Math.round(size/patch)),cellSize=size/cellCount;
  const pebbleChance=proc.pebbleChance??.04,largeChance=proc.largePebbleChance??.01,roughBase=matRough??.98;
  const soilNoise=(x,y,salt=0)=>{
    const gx=x/cellSize,gy=y/cellSize,ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;
    const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),wrap=value=>(value%cellCount+cellCount)%cellCount;
    const a=hash2(wrap(ix),wrap(iy),seed+salt),b=hash2(wrap(ix+1),wrap(iy),seed+salt),c=hash2(wrap(ix),wrap(iy+1),seed+salt),d=hash2(wrap(ix+1),wrap(iy+1),seed+salt);
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
  };
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const px=Math.floor(x/cellSize),py=Math.floor(y/cellSize),lx=Math.floor(x-px*cellSize),ly=Math.floor(y-py*cellSize);
    // Quantized smooth value noise makes irregular, seamless soil masses; it
    // avoids both photographic grain and the square grid of a stone material.
    const patchTone=(Math.round(soilNoise(x,y)*6)/6-.5)*26;
    const grit=hash2(x,y,seed+31), pebble=grit>1-pebbleChance;
    const gcx=Math.floor(x/4),gcy=Math.floor(y/4),largeSeed=hash2(gcx,gcy,seed+53);
    const largePebble=largeSeed>1-largeChance && Math.hypot((x%4)-1.5,(y%4)-1.5)<1.45;
    const rutSeed=hash2(px,py,seed+71),rut=(rutSeed<(proc.rutChance??.1)) && ly===2+Math.floor(rutSeed*Math.max(1,patch-4)) && lx>1;
    const compact=hash2(Math.floor(x/3),Math.floor(y/3),seed+89)-.5;
    let tone=patchTone+compact*7,r=baseRGB[0]+tone,g=baseRGB[1]+tone*.82,b=baseRGB[2]+tone*.58;
    let h=.45+patchTone/255+compact*.025,a=.92,rv=roughBase+(grit-.5)*.025;
    if(rut){r-=9;g-=8;b-=6;h-=.055;a=.82;rv=Math.min(.99,rv+.01);}
    if(pebble||largePebble){
      const bright=largePebble?24:15;r+=bright;g+=bright*.92;b+=bright*.72;h+=largePebble?.18:.1;a=.88;rv=Math.max(.72,rv-.08);
    }
    const i=y*size+x,q=i*4;height[i]=Math.max(.18,Math.min(.78,h));ao[i]=a;rough[i]=Math.round(Math.max(.72,Math.min(.995,rv))*255);metal[i]=Math.round(Math.max(0,Math.min(1,matMetal))*255);
    albedo[q]=Math.max(0,Math.min(255,r));albedo[q+1]=Math.max(0,Math.min(255,g));albedo[q+2]=Math.max(0,Math.min(255,b));albedo[q+3]=255;emiss[q+3]=255;
  }
  return {albedo,normal:normalMapFromHeight(size,height,proc.normalStrength??1.1),height,rough,metal,ao,emiss};
}

// True cave rock has no courses, grout, or repeating rectangular cells. Two
// periodic value-noise scales form broad bulges and smaller fracture basins;
// quantization keeps the result authored-looking at the native pixel scale.
function genCaveRockTile(size, baseRGB, proc, seed, matRough, matMetal = 0) {
  const albedo=new Uint8Array(size*size*4),height=new Float32Array(size*size),ao=new Float32Array(size*size),rough=new Uint8Array(size*size),metal=new Uint8Array(size*size),emiss=new Uint8Array(size*size*4);
  const valueNoise=(x,y,cells,salt)=>{
    const gx=x/size*cells,gy=y/size*cells,ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;
    const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),wrap=value=>(value%cells+cells)%cells;
    const a=hash2(wrap(ix),wrap(iy),seed+salt),b=hash2(wrap(ix+1),wrap(iy),seed+salt),c=hash2(wrap(ix),wrap(iy+1),seed+salt),d=hash2(wrap(ix+1),wrap(iy+1),seed+salt);
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
  };
  const macroCells=Math.max(3,proc.macroCells??5),detailCells=Math.max(7,proc.detailCells??11),roughBase=matRough??.98;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const macro=valueNoise(x,y,macroCells,0),detail=valueNoise(x,y,detailCells,73),fracture=valueNoise(x,y,detailCells+4,149);
    const crevice=Math.abs(fracture-.5)<(proc.creviceThreshold??.19)*.075 && detail<.65;
    const inclusion=hash2(x,y,seed+211)>(1-(proc.mineralChance??.008));
    const quantized=Math.round((macro*.72+detail*.28)*9)/9;
    let tone=(quantized-.5)*38+(detail-.5)*10,r=baseRGB[0]+tone,g=baseRGB[1]+tone*.96,b=baseRGB[2]+tone*.82;
    let h=.25+macro*.39+detail*.12,a=.9,rv=roughBase+(detail-.5)*.035;
    if(crevice){r*=.48;g*=.5;b*=.46;h-=.2;a=.58;rv=.995;}
    else if(inclusion){r+=32;g+=29;b+=20;h+=.035;rv=Math.max(.76,rv-.12);}
    h=Math.round(Math.max(.05,Math.min(.88,h))*32)/32;
    const i=y*size+x,q=i*4;height[i]=h;ao[i]=a;rough[i]=Math.round(Math.max(.72,Math.min(.995,rv))*255);metal[i]=Math.round(Math.max(0,Math.min(1,matMetal))*255);
    albedo[q]=Math.max(0,Math.min(255,r));albedo[q+1]=Math.max(0,Math.min(255,g));albedo[q+2]=Math.max(0,Math.min(255,b));albedo[q+3]=255;emiss[q+3]=255;
  }
  return {albedo,normal:normalMapFromHeight(size,height,proc.normalStrength??1.7),height,rough,metal,ao,emiss};
}

function genMetalPlateTile(size, baseRGB, proc, seed, matRough, matMetal = .55) {
  const albedo=new Uint8Array(size*size*4),height=new Float32Array(size*size),ao=new Float32Array(size*size),rough=new Uint8Array(size*size),metal=new Uint8Array(size*size),emiss=new Uint8Array(size*size*4);
  const plate=Math.max(8,proc.blockSize??12),seamWidth=Math.max(1,proc.groutWidth??1),roughBase=matRough??.58;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const bx=Math.floor(x/plate),by=Math.floor(y/plate),lx=x%plate,ly=y%plate;
    const seam=lx<seamWidth||ly<seamWidth, rivet=!seam&&(lx===2||lx===plate-2)&&(ly===2||ly===plate-2);
    const scratchSeed=hash2(bx,by,seed+111), scratch=scratchSeed>.62&&ly===2+Math.floor(scratchSeed*(plate-4))&&lx>3&&lx<plate-2;
    const rust=hash2(x,y,seed+137)>(proc.rustThreshold??.975);
    const panelTone=(hash2(bx,by,seed)-.5)*18;
    let r=baseRGB[0]+panelTone,g=baseRGB[1]+panelTone,b=baseRGB[2]+panelTone*.9,h=.52,a=.92,rv=roughBase,mv=matMetal;
    if(seam){r*=.34;g*=.34;b*=.32;h=.1;a=.64;rv=Math.min(.96,roughBase+.18);}
    else if(rivet){r+=30;g+=28;b+=24;h=.78;a=.86;rv=Math.max(.32,roughBase-.12);mv=Math.max(.78,mv);}
    else if(scratch){r+=16;g+=15;b+=13;h=.46;rv=Math.min(.92,roughBase+.12);}
    if(rust&&!seam){r+=34;g-=5;b-=13;rv=Math.min(.98,rv+.28);mv*=.48;}
    const i=y*size+x,q=i*4;height[i]=h;ao[i]=a;rough[i]=Math.round(Math.max(.2,Math.min(.98,rv))*255);metal[i]=Math.round(Math.max(0,Math.min(1,mv))*255);
    albedo[q]=Math.max(0,Math.min(255,r));albedo[q+1]=Math.max(0,Math.min(255,g));albedo[q+2]=Math.max(0,Math.min(255,b));albedo[q+3]=255;emiss[q+3]=255;
  }
  return {albedo,normal:normalMapFromHeight(size,height,proc.normalStrength??1.65),height,rough,metal,ao,emiss};
}

// Opaque round sewer grille fixture. Albedo alpha is a coverage mask used to
// composite this layer over the host wall; the dark cavity is intentionally
// opaque and receives very low height/AO behind raised iron bars.
function genRoundGrilleTile(size, baseRGB, proc, seed, matRough) {
  const albedo = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const ao = new Float32Array(size * size);
  const rough = new Uint8Array(size * size);
  const metal = new Uint8Array(size * size);
  const emiss = new Uint8Array(size * size * 4);
  const cx = 0.5;
  const cy = proc.centerV ?? 0.78;
  const radius = (proc.diameter ?? 0.56) * 0.5;
  const rimWidth = proc.rimWidth ?? 0.055;
  const barHalfWidth = proc.barHalfWidth ?? 0.022;
  const braceHalfWidth = proc.braceHalfWidth ?? 0.025;
  const barOffsets = proc.barOffsets || [-0.16, -0.08, 0, 0.08, 0.16];

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Quantized virtual texel centers are deliberate: stable retro silhouettes.
    const u = (x + 0.5) / size;
    const v = (y + 0.5) / size;
    const dx = u - cx, dy = v - cy;
    const d = Math.hypot(dx, dy);
    const inside = d <= radius;
    const rim = inside && d >= radius - rimWidth;
    const inner = d < radius - rimWidth * 0.75;
    let bar = false;
    if (inner) {
      for (const off of barOffsets) {
        if (Math.abs(dx - off) <= barHalfWidth) { bar = true; break; }
      }
      if (Math.abs(dy) <= braceHalfWidth) bar = true;
    }
    const iron = rim || bar;
    const rustNoise = hash2(x, y, seed + 701);
    const idx = y * size + x, ai = idx * 4;
    if (!inside) {
      albedo[ai] = albedo[ai+1] = albedo[ai+2] = 0;
      albedo[ai+3] = 0;
      height[idx] = 0.5;
      ao[idx] = 1;
      rough[idx] = 255;
      metal[idx] = 0;
    } else if (iron) {
      const worn = rim ? 1.08 : 0.92;
      const rust = rustNoise > 0.72 ? 0.30 : 0;
      albedo[ai] = Math.min(255, (baseRGB[0] * worn + 55 * rust) | 0);
      albedo[ai+1] = Math.min(255, (baseRGB[1] * worn + 18 * rust) | 0);
      albedo[ai+2] = Math.min(255, (baseRGB[2] * worn + 6 * rust) | 0);
      albedo[ai+3] = 255;
      height[idx] = rim ? 0.94 : 0.84;
      ao[idx] = rim ? 0.82 : 0.68;
      rough[idx] = Math.round(Math.min(0.9, (matRough ?? 0.48) + rust * 0.45) * 255);
      metal[idx] = Math.round((rust ? 0.55 : 0.86) * 255);
    } else {
      const cavityNoise = hash2(x * 3, y * 5, seed + 919);
      albedo[ai] = 5 + Math.floor(cavityNoise * 5);
      albedo[ai+1] = 7 + Math.floor(cavityNoise * 5);
      albedo[ai+2] = 7 + Math.floor(cavityNoise * 6);
      albedo[ai+3] = 255;
      height[idx] = 0.04 + cavityNoise * 0.025;
      ao[idx] = 0.12 + cavityNoise * 0.06;
      rough[idx] = Math.round(0.96 * 255);
      metal[idx] = 0;
    }
    emiss[ai] = emiss[ai+1] = emiss[ai+2] = 0;
    emiss[ai+3] = 255;
  }

  const normal = new Uint8Array(size * size * 4);
  const ns = proc.normalStrength ?? 2.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = Math.max(0, x - 1), xp = Math.min(size - 1, x + 1);
    const ym = Math.max(0, y - 1), yp = Math.min(size - 1, y + 1);
    const n = heightToNormal(height[y*size+xm], height[y*size+xp], height[ym*size+x], height[yp*size+x], ns);
    const ni = (y * size + x) * 4;
    normal[ni] = n[0] | 0; normal[ni+1] = n[1] | 0; normal[ni+2] = n[2] | 0; normal[ni+3] = 255;
  }
  return { albedo, normal, height, rough, metal, ao, emiss };
}

/**
 * New core: generate material data as Texture2DArray layers.
 * Each material is one layer (depth) of size texSize x texSize.
 * Returns raw Uint8 arrays suitable for createTexture2DArray.
 */
export function generateMaterialArrayData(wallMats, floorMats, ceilMats, procConfig) {
  const texSize = procConfig.texSize ?? 64;
  const wCount = Math.max(1, wallMats.length || 1);
  const fCount = Math.max(1, floorMats.length || 1);
  const cCount = Math.max(1, ceilMats.length || 1);

  function mergeProc(baseProc, overrideProc) {
    if (!overrideProc) return baseProc;
    // shallow merge with nested micro merging
    const out = { ...baseProc, ...overrideProc };
    if (baseProc.micro || overrideProc.micro) {
      out.micro = { ...(baseProc.micro||{}), ...(overrideProc.micro||{}) };
    }
    if (baseProc.groutDarken && overrideProc.groutDarken) {
      out.groutDarken = { ...baseProc.groutDarken, ...overrideProc.groutDarken };
    } else if (overrideProc.groutDarken) {
      out.groutDarken = overrideProc.groutDarken;
    }
    if (baseProc.brick && overrideProc.brick) {
      out.brick = { ...baseProc.brick, ...overrideProc.brick };
    }
    return out;
  }

  function pickTileType(mat, defaultType) {
    // Data-driven tile generator registry – allows new types without code change if added to registry
    const reg = {
      'brick': (sz, base, pr, sd, rv, mv) => genBrickTile(sz, base, pr, sd, rv, mv),
      'stone_block': (sz, base, pr, sd, rv, mv) => genBrickTile(sz, base, { ...pr, blockSize: pr.blockSize ?? 10 }, sd, rv, mv),
      'slab': (sz, base, pr, sd, rv, mv) => genSlabTile(sz, base, pr, sd, false, rv, mv),
      'cobble': (sz, base, pr, sd, rv, mv) => genSlabTile(sz, base, { ...pr, blockSize: pr.blockSize ?? 6, groutWidth: pr.groutWidth ?? 2 }, sd, true, rv, mv),
      'beams': (sz, base, pr, sd, rv, mv) => genWoodTile(sz, base, { ...pr, plankWidth: pr.plankWidth ?? 10, boardLength: pr.boardLength ?? 32 }, sd, rv, mv),
      'wood_planks': (sz, base, pr, sd, rv, mv) => genWoodTile(sz, base, pr, sd, rv, mv),
      'natural_rock': (sz, base, pr, sd, rv, mv) => genNaturalRockTile(sz, base, pr, sd, rv, mv),
      'packed_dirt': (sz, base, pr, sd, rv, mv) => genPackedDirtTile(sz, base, pr, sd, rv, mv),
      'cave_rock': (sz, base, pr, sd, rv, mv) => genCaveRockTile(sz, base, pr, sd, rv, mv),
      'metal_plate': (sz, base, pr, sd, rv, mv) => genMetalPlateTile(sz, base, pr, sd, rv, mv),
      'channel_stone': (sz, base, pr, sd, rv, mv) => genSlabTile(sz, base, { ...pr, blockSize: pr.blockSize ?? 6, groutWidth: pr.groutWidth ?? 1 }, sd, false, rv, mv),
      'round_grille_fixture': (sz, base, pr, sd, rv) => genRoundGrilleTile(sz, base, pr, sd, rv),
    };
    const fn = reg[mat.type] || (defaultType === 'brick' ? reg['brick'] : reg['slab']);
    return fn;
  }

  function packArray(mats, count, type, proc) {
    const layerPix = texSize * texSize;
    const albedo = new Uint8Array(layerPix * count * 4);
    const normal = new Uint8Array(layerPix * count * 4);
    const height = new Uint8Array(layerPix * count); // R8 per layer
    const roughMetalAO = new Uint8Array(layerPix * count * 4);
    for (let mi = 0; mi < count; mi++) {
      const mat = mats[mi] || mats[0] || { base: [128,128,128], roughness:0.72, metal:0 };
      const seed = mat.variationSeed ?? (101 + mi);
      const base = mat.base ?? [128,128,128];
      // P3: per-material proc override support – mat.proc overrides category proc
      const finalProc = mergeProc(proc, mat.proc || {});
      const roughValRaw = (mat.roughness ?? finalProc.roughness ?? 0.72);
      const roughVal = Math.round((typeof roughValRaw === 'number' ? roughValRaw : 0.72) * 255);
      const metalVal = Math.round((mat.metal ?? 0) * 255);
      const emissStr = Math.round((mat.emissiveStrength ?? 0) * 255);
      const tileGen = pickTileType(mat, type);
      const tile = tileGen(texSize, base, finalProc, seed, roughValRaw, metalVal / 255);
      const off = mi * layerPix;
      const off4 = off * 4;
      for (let y = 0; y < texSize; y++) for (let x = 0; x < texSize; x++) {
        const si = y * texSize + x;
        const di = off + si;
        const sai = si * 4, dai = off4 + si * 4;
        albedo[dai] = tile.albedo[sai]; albedo[dai+1] = tile.albedo[sai+1]; albedo[dai+2]=tile.albedo[sai+2]; albedo[dai+3]=tile.albedo[sai+3] ?? 255;
        normal[dai] = tile.normal[sai]; normal[dai+1]=tile.normal[sai+1]; normal[dai+2]=tile.normal[sai+2]; normal[dai+3]=255;
        height[di] = Math.round(tile.height[si]*255);
        const sr = tile.rough[si];
        roughMetalAO[dai] = (sr !== undefined && sr !== 0) ? sr : roughVal;
        roughMetalAO[dai+1] = (tile.metal[si] !== undefined) ? tile.metal[si] : metalVal;
        roughMetalAO[dai+2] = emissStr;
        roughMetalAO[dai+3] = Math.round(tile.ao[si]*255);
      }
    }
    return { albedo, normal, height, roughMetalAO };
  }

  const wp = procConfig.walls ?? {};
  const fp = procConfig.floors ?? {};
  const cp = procConfig.ceils ?? {};
  const wA = packArray(wallMats, wCount, 'brick', wp);
  const fA = packArray(floorMats, fCount, 'floors', fp);
  const cA = packArray(ceilMats, cCount, 'ceils', cp);

  return {
    texSize,
    wallCount: wCount,
    floorCount: fCount,
    ceilCount: cCount,
    walls: wA,
    floors: fA,
    ceils: cA,
    // legacy alias for downstream code that expects wallAtlasW etc – not used for array path but kept for compat
    wallAtlasW: texSize,
    floorAtlasW: texSize,
    ceilAtlasW: texSize,
  };
}

/**
 * Legacy atlas packer – kept for unit tests that check old shape, but now implemented
 * via array data -> atlas conversion (first N layers stitched horizontally) OR directly
 * builds array and also returns horizontal atlas for fallback.
 * For the new pipeline we want array data, but this function preserves old API.
 */
export function generateMaterialAtlases(wallMats, floorMats, ceilMats, procConfig) {
  const texSize = 64;
  // Honor all mats now, not forced 1 – this is the behavioral change.
  // If caller wants old forced-1 behavior, they can pass slice(0,1) as before.
  const wCount = Math.max(1, wallMats.length || 1);
  const fCount = Math.max(1, floorMats.length || 1);
  const cCount = Math.max(1, ceilMats.length || 1);

  // Use new array generator then repack as horizontal atlas for backward compat fallback
  const arr = generateMaterialArrayData(wallMats, floorMats, ceilMats, { ...procConfig, texSize });

  function arrayToAtlas(arrData, count) {
    const w = texSize * count, h = texSize;
    const albedo = new Uint8Array(w * h * 4);
    const normal = new Uint8Array(w * h * 4);
    const height = new Uint8Array(w * h);
    const roughMetalAO = new Uint8Array(w * h * 4);
    const lp = texSize * texSize;
    for (let mi = 0; mi < count; mi++) {
      const off = mi * lp;
      const off4 = off * 4;
      const ox = mi * texSize;
      for (let y = 0; y < texSize; y++) for (let x = 0; x < texSize; x++) {
        const si = off + y * texSize + x;
        const sai = off4 + (y * texSize + x) * 4;
        const di = y * w + ox + x;
        const dai = di * 4;
        albedo[dai] = arrData.albedo[sai]; albedo[dai+1]=arrData.albedo[sai+1]; albedo[dai+2]=arrData.albedo[sai+2]; albedo[dai+3]=arrData.albedo[sai+3];
        normal[dai] = arrData.normal[sai]; normal[dai+1]=arrData.normal[sai+1]; normal[dai+2]=arrData.normal[sai+2]; normal[dai+3]=255;
        height[di] = arrData.height[si];
        roughMetalAO[dai]=arrData.roughMetalAO[sai]; roughMetalAO[dai+1]=arrData.roughMetalAO[sai+1]; roughMetalAO[dai+2]=arrData.roughMetalAO[sai+2]; roughMetalAO[dai+3]=arrData.roughMetalAO[sai+3];
      }
    }
    return { albedo, normal, height, roughMetalAO, width:w, atlasH:h };
  }

  const wA = arrayToAtlas(arr.walls, wCount);
  const fA = arrayToAtlas(arr.floors, fCount);
  const cA = arrayToAtlas(arr.ceils, cCount);

  return {
    // legacy horizontal atlases (fallback path)
    wallAlbedo: wA.albedo, wallNormal: wA.normal, wallHeight: wA.height,
    wallRoughMetalAO: wA.roughMetalAO,
    floorAlbedo: fA.albedo, floorNormal: fA.normal, floorHeight: fA.height,
    floorRoughMetalAO: fA.roughMetalAO,
    ceilAlbedo: cA.albedo, ceilNormal: cA.normal, ceilHeight: cA.height,
    ceilRoughMetalAO: cA.roughMetalAO,
    texSize, wallCount: wCount, floorCount: fCount, ceilCount: cCount,
    wallAtlasW: wA.width, wallAtlasH: wA.atlasH, floorAtlasW: fA.width, floorAtlasH: fA.atlasH, ceilAtlasW: cA.width, ceilAtlasH: cA.atlasH,
    // new array data available on same object for new renderer path
    arrayData: arr,
  };
}

export function atlasUvX(materialId, texSize, atlasWidth) {
  return ((materialId - 1) * texSize) / atlasWidth;
}
