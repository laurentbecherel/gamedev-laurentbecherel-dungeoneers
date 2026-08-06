
// Modifier map baking - CPU side, per-cell modifier field
// v13 puddle precise: smaller organic pools, higher threshold, linear smooth, noise cloud mask not just cells

export const MOD_CHANNELS = {
  MOSS: 0,
  WATER: 1,
  PUDDLE: 2,
  // Internal environment field used by moss. Dust moved to texture 2 so the
  // two signals no longer alias each other.
  WALL_PROXIMITY: 3
};

export const MOD2_CHANNELS = {
  DAMAGED: 0,
  BLOOD: 1,
  DUST: 2,
  UNUSED_B: 3
};

export const MODIFIER_NAMES = ['moss', 'damaged', 'water', 'puddle', 'blood', 'dust'];

export const MOD_PACKING = {
  version: 3,
  textures: 2,
  tex1: {
    name: 'u_modifierMap',
    unit: 15,
    channels: {
      R: { name: 'moss', logical: ['moss'], channel: 0 },
      G: { name: 'water', logical: ['water'], channel: 1 },
      B: { name: 'puddle', logical: ['puddle'], channel: 2, floorOnly: true },
      A: { name: 'wallProximity', logical: [], channel: 3, internal: true }
    }
  },
  tex2: {
    name: 'u_modifierMap2',
    unit: 16,
    channels: {
      R: { name: 'damaged', logical: ['damaged'], channel: 0 },
      G: { name: 'blood', logical: ['blood'], channel: 1 },
      B: { name: 'dust', logical: ['dust'], channel: 2 },
      A: { name: 'unused', logical: [], channel: 3 }
    }
  }
};

function hash2i(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 700001) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

function smooth(t){ return t*t*(3-2*t); }
function lerp(a,b,t){ return a+(b-a)*t; }
function fbm(x,y,seed,octaves=3){
  let v=0, amp=0.5, freq=1, norm=0;
  for(let o=0;o<octaves;o++){
    const xi=Math.floor(x*freq), yi=Math.floor(y*freq);
    const xf=(x*freq)-xi, yf=(y*freq)-yi;
    const u=smooth(xf), vv=smooth(yf);
    const h00=hash2i(xi,yi,seed+o*13), h10=hash2i(xi+1,yi,seed+o*13), h01=hash2i(xi,yi+1,seed+o*13), h11=hash2i(xi+1,yi+1,seed+o*13);
    const x1=lerp(h00,h10,u), x2=lerp(h01,h11,u), n=lerp(x1,x2,vv);
    v+=n*amp; norm+=amp; amp*=0.5; freq*=2;
  }
  return norm>0?v/norm:0;
}

export const DEFAULT_ROLE_WEIGHTS = {
  entrance:{ moss:0.28, dust:0.08, water:0.0, puddle:0.75, blood:0.05, damaged:0.0 },
  exit:{ moss:0.15, dust:0.12, water:0.0, puddle:0.75, blood:0.20, damaged:0.0 },
  guardian:{ moss:0.07, dust:0.04, water:0.0, puddle:0.65, blood:0.75, damaged:0.0 },
  treasure:{ moss:0.12, dust:0.55, water:0.0, puddle:0.70, blood:0.08, damaged:0.0 },
  secret:{ moss:0.35, dust:0.78, water:0.0, puddle:0.70, blood:0.04, damaged:0.0 },
  shrine:{ moss:0.42, dust:0.35, water:0.0, puddle:0.75, blood:0.18, damaged:0.0 },
  hub:{ moss:0.16, dust:0.10, water:0.0, puddle:0.70, blood:0.32, damaged:0.0 },
  armory:{ moss:0.08, dust:0.32, water:0.0, puddle:0.65, blood:0.42, damaged:0.0 },
  hall:{ moss:0.18, dust:0.20, water:0.0, puddle:0.70, blood:0.16, damaged:0.0 },
  corridor:{ moss:0.13, dust:0.14, water:0.0, puddle:0.60, blood:0.08, damaged:0.0 },
};

export function generateModifierMap(dungeon, config) {
  const w = dungeon.w, h = dungeon.h;
  const size = w*h;
  const data = new Uint8Array(size*4);
  const data2 = new Uint8Array(size*4);
  const modCfg = config.materialModifiers || config['material-modifiers'] || config.modifiers || {};
  const enabled = modCfg.enabled ?? true;
  if (!enabled) return { data, data2, w, h, enabled:false, packing: MOD_PACKING };

  const seed = dungeon.seed ?? 1337;
  const genCfg = modCfg.generator || {};
  const globalNoiseScale = genCfg.noiseScale ?? 0.22;
  const puddleScaleLarge = genCfg.puddleScaleLarge ?? 0.22;
  const puddleThreshold = genCfg.puddleThreshold ?? 0.55;
  const puddleFeather = genCfg.puddleFeather ?? 0.11;
  const puddleBoost = genCfg.debugPuddleBoost ?? 1.1;
  const damagedThreshold = genCfg.damagedThreshold ?? 0.78;
  const damagedFeather = genCfg.damagedFeather ?? 0.06;
  const damagedBoost = genCfg.damagedBoost ?? 0.85;
  const damagedScaleLarge = genCfg.damagedScaleLarge ?? 0.09;
  const damagedScaleMed = genCfg.damagedScaleMed ?? 0.22;
  const damagedScaleSmall = genCfg.damagedScaleSmall ?? 0.55;
  const damagedScaleCrack = genCfg.damagedScaleCrack ?? 0.16;
  const bloodGen = genCfg.blood || {};
  const bloodScale = bloodGen.scale ?? 0.19;
  const bloodThreshold = bloodGen.threshold ?? 0.50;
  const bloodFeather = bloodGen.feather ?? 0.16;
  const bloodBoost = bloodGen.boost ?? 1.65;
  const bloodWallWeight = bloodGen.wallWeight ?? 0.42;
  const dustGen = genCfg.dust || {};
  const dustScale = dustGen.scale ?? 0.10;
  const dustThreshold = dustGen.threshold ?? 0.34;
  const dustFeather = dustGen.feather ?? 0.24;
  const dustBoost = dustGen.boost ?? 1.35;
  const dustWallWeight = dustGen.wallWeight ?? 0.18;
  const roleWeights = genCfg.roleWeights || DEFAULT_ROLE_WEIGHTS;

  const roomGrid = new Int16Array(size).fill(-1);
  if (dungeon.rooms) {
    for (let ri=0; ri<dungeon.rooms.length; ri++) {
      const r = dungeon.rooms[ri];
      for (let yy=r.y; yy<r.y+r.h; yy++) for (let xx=r.x; xx<r.x+r.w; xx++) {
        if (xx>=0 && yy>=0 && xx<w && yy<h) roomGrid[yy*w+xx]=ri;
      }
    }
  }

  function isWallCell(x,y){
    if(x<0||y<0||x>=w||y>=h) return true;
    const gi = y*w+x;
    return dungeon.grid ? dungeon.grid[gi] !== 0 : false;
  }
  function isNearWall(x,y){
    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
      if(dx===0 && dy===0) continue;
      if(isWallCell(x+dx,y+dy)) return true;
    }
    return false;
  }

  // --- Pre-bake wall distance field for moss env (smooth, feathered) ---
  // Computes distance to nearest wall within radius 4, plus corner boost, then blur for feather
  const maxWallDist = 4.0;
  const wallProxRaw = new Float32Array(size);
  const cornerRaw = new Float32Array(size);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    let minD = maxWallDist + 1.0;
    // 9x9 search radius 4
    for(let dy=-4; dy<=4; dy++){
      for(let dx=-4; dx<=4; dx++){
        const nx=x+dx, ny=y+dy;
        if(isWallCell(nx,ny)){
          const d = Math.sqrt(dx*dx + dy*dy);
          if(d < minD) minD = d;
        }
      }
    }
    // prox 1 near wall, 0 far
    let prox = 1.0 - Math.min(minD / maxWallDist, 1.0);
    // make falloff smoother: smoothstep cubic
    prox = smooth(prox);
    wallProxRaw[i] = prox;

    // corner detection: orthogonal pairs
    let cornerCount = 0;
    if(isWallCell(x, y-1) && isWallCell(x-1, y)) cornerCount++;
    if(isWallCell(x, y-1) && isWallCell(x+1, y)) cornerCount++;
    if(isWallCell(x, y+1) && isWallCell(x-1, y)) cornerCount++;
    if(isWallCell(x, y+1) && isWallCell(x+1, y)) cornerCount++;
    cornerRaw[i] = cornerCount / 4.0; // 0..1
  }
  // blur passes for feathering hard cell edges
  function blurField(src){
    const dst = new Float32Array(size);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      let sum=0, cnt=0;
      for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        sum += src[ny*w+nx];
        cnt++;
      }
      dst[y*w+x] = cnt ? sum / cnt : 0;
    }
    return dst;
  }
  let envField = new Float32Array(size);
  for(let i=0;i<size;i++){
    // base wall proximity + corner boost (tunable: corner up to +0.35)
    envField[i] = Math.min(1.0, wallProxRaw[i] * 1.12 + cornerRaw[i] * 0.35);
  }
  envField = blurField(envField);
  envField = blurField(envField); // second pass extra feather

  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    const isFloor = dungeon.grid ? dungeon.grid[i]===0 : true;
    const ri = roomGrid[i];
    const role = (ri>=0 ? dungeon.rooms[ri]?.role : null) || (isFloor ? 'corridor' : 'hall');
    const rw = roleWeights[role] || roleWeights['corridor'] || DEFAULT_ROLE_WEIGHTS[role] || DEFAULT_ROLE_WEIGHTS.corridor;

    const xc = x + 0.5;
    const yc = y + 0.5;
    const wx = xc * 0.12, wy = yc * 0.12;
    const warpX = fbm(wx, wy, seed+111, 2) * 1.3;
    const warpY = fbm(wx+7.3, wy+3.1, seed+222, 2) * 1.3;
    const largeNoise = fbm((xc + warpX) * puddleScaleLarge, (yc + warpY) * puddleScaleLarge, seed+77, 4);
    const medNoise = fbm((xc + warpX*0.5) * puddleScaleLarge * 2.1 + 11, (yc + warpY*0.5) * puddleScaleLarge * 2.1 + 23, seed+88, 3);
    const smallNoise = fbm(xc * 0.55, yc * 0.55, seed+99, 2);

    const low = puddleThreshold - puddleFeather;
    const high = puddleThreshold + puddleFeather;
    let t = (largeNoise - low) / Math.max(0.0001, high - low);
    t = Math.max(0, Math.min(1, t));
    t = smooth(t);
    let shape = t * (0.45 + 0.55 * medNoise) * (0.75 + 0.25 * smallNoise);

    const fh = dungeon.floorHeight ? dungeon.floorHeight[i] : 0;
    const lowFloorFactor = 1.0 - Math.max(0, Math.min(1, fh + 0.5));
    const floorBoost = 0.55 + 0.45 * lowFloorFactor;
    const nearWall = isNearWall(x,y) ? 1.2 : 1.0;

    const rolePuddle = rw.puddle ?? 0.65;
    const roleMoss = rw.moss ?? 0.0;
    let puddleI = rolePuddle * shape * floorBoost * nearWall;

    const globalN = fbm(xc*globalNoiseScale, yc*globalNoiseScale, seed, 2);
    puddleI *= (0.5 + 0.5 * globalN);
    puddleI *= puddleBoost;
    if(!isFloor) puddleI *= 0.02;
    puddleI = Math.max(0, Math.min(1, puddleI));

    let mossI = 0;
    if (roleMoss > 0.001) {
      const biomeNoise = fbm(xc * 0.18, yc * 0.18, seed+333, 2);
      const largeNoiseM = fbm(xc * 0.07, yc * 0.07, seed+335, 2);
      const wallFactor = isFloor ? (isNearWall(x,y) ? 1.18 : 0.82) : 1.0;
      mossI = roleMoss * (0.45 + 0.55*biomeNoise) * (0.40 + 0.60*largeNoiseM) * wallFactor * (0.50 + 0.50*globalN);
      mossI = Math.max(0, Math.min(1, mossI));
    }

    // Blood is placed by room story, then shaped into irregular cell clusters
    // in the shader. Keep a broad CPU field so splatters can cross tile seams.
    const roleBlood = rw.blood ?? 0.0;
    let bloodI = 0;
    if (roleBlood > 0.001) {
      const bloodLarge = fbm((xc + warpX * 0.45) * bloodScale, (yc + warpY * 0.45) * bloodScale, seed+711, 4);
      const bloodDetail = fbm(xc * bloodScale * 3.7 + 17.0, yc * bloodScale * 3.7 + 9.0, seed+712, 2);
      let bloodShape = (bloodLarge - (bloodThreshold - bloodFeather)) / Math.max(0.0001, bloodFeather * 2.0);
      bloodShape = smooth(Math.max(0, Math.min(1, bloodShape)));
      bloodShape *= 0.62 + 0.38 * bloodDetail;
      const surfaceWeight = isFloor ? 1.0 : bloodWallWeight;
      bloodI = roleBlood * bloodShape * surfaceWeight * bloodBoost;
      bloodI = Math.max(0, Math.min(1, bloodI));
    }

    // Dust uses a much broader, softer field than blood. Material height/AO
    // and upward-facing placement are resolved per pixel in the shader.
    const roleDust = rw.dust ?? 0.0;
    let dustI = 0;
    if (roleDust > 0.001) {
      const dustLarge = fbm((xc + warpX * 0.2) * dustScale, (yc + warpY * 0.2) * dustScale, seed+731, 4);
      const dustFine = fbm(xc * dustScale * 4.2 + 5.0, yc * dustScale * 4.2 + 21.0, seed+732, 2);
      let dustShape = (dustLarge - (dustThreshold - dustFeather)) / Math.max(0.0001, dustFeather * 2.0);
      dustShape = smooth(Math.max(0, Math.min(1, dustShape)));
      dustShape *= 0.78 + 0.22 * dustFine;
      const surfaceWeight = isFloor ? 1.0 : dustWallWeight;
      dustI = roleDust * dustShape * surfaceWeight * dustBoost;
      dustI = Math.max(0, Math.min(1, dustI));
    }

    // Damaged – chaotic scarring: multi-scale warped FBM + ridged cracks + cross scratches
    const roleDamaged = rw.damaged ?? 0.0;
    let damagedI = 0;
    if (roleDamaged > 0.001) {
      // domain warp for chaos
      const wx = fbm(xc * 0.11, yc * 0.11, seed+611, 2) * 1.4;
      const wy = fbm(xc * 0.11 + 7.3, yc * 0.11 + 3.1, seed+612, 2) * 1.4;
      // large chips / gouges
      const largeD = fbm((xc+wx) * damagedScaleLarge, (yc+wy) * damagedScaleLarge, seed+614, 4);
      // medium damage patches
      const medD = fbm((xc+wx*0.6) * damagedScaleMed + 13.1, (yc+wy*0.6) * damagedScaleMed + 7.7, seed+615, 3);
      // fine grit
      const smallD = fbm(xc * damagedScaleSmall, yc * damagedScaleSmall, seed+616, 2);
      // crack / ridge – ridged noise = sharp cracks
      const crackRaw = fbm((xc+wx) * damagedScaleCrack, (yc+wy) * damagedScaleCrack, seed+617, 2);
      let ridge = 1.0 - Math.abs(crackRaw * 2.0 - 1.0);
      ridge = Math.pow(ridge, 2.0); // sharpen
      // cross scratches (anisotropic)
      const scratchA = fbm(xc * 0.75, yc * 0.25, seed+618, 2);
      const scratchB = fbm(xc * 0.25, yc * 0.75, seed+619, 2);
      let scratch = scratchA * scratchB; // cross
      scratch = Math.pow(scratch, 0.7);

      // chaotic combined – weights mirror shader defaults but CPU side for cell biome gating
      let combinedD = largeD * 0.45 + medD * 0.28 + smallD * 0.15 + ridge * 0.38 + scratch * 0.22;
      // per-cell hash jitter for extra chaos
      combinedD += (hash2i(x, y, seed+621) - 0.5) * 0.07;
      combinedD = Math.max(0, Math.min(1, combinedD));

      const lowD = damagedThreshold - damagedFeather;
      const highD = damagedThreshold + damagedFeather;
      let tD = (combinedD - lowD) / Math.max(0.0001, highD - lowD);
      tD = Math.max(0, Math.min(1, tD));
      tD = smooth(tD);
      // shape biased by small detail and ridge emphasis
      const shapeD = tD * (0.55 + 0.45 * smallD) * (0.60 + 0.40 * (ridge * 1.2));

      // damaged on both floors and walls, slightly boosted near walls (battle damage on walls)
      const wallBoostD = isWallCell(x,y) ? 0.15 : (isNearWall(x,y) ? 1.18 : 1.0);
      const globalD = fbm(xc * globalNoiseScale * 1.1, yc * globalNoiseScale * 1.1, seed+622, 2);

      damagedI = roleDamaged * shapeD * wallBoostD * (0.50 + 0.50 * globalD) * damagedBoost;
      // allow floors too, don't zero them like puddle
      damagedI = Math.max(0, Math.min(1, damagedI));
    }

    const envI = envField[i]; // smooth 0..1 wall proximity + corners, feathered via blur + LINEAR tex filtering

    data[i*4 + MOD_CHANNELS.MOSS] = Math.round(mossI*255);
    data[i*4 + MOD_CHANNELS.WATER] = 0;
    data[i*4 + MOD_CHANNELS.PUDDLE] = Math.round(puddleI*255);
    data[i*4 + MOD_CHANNELS.WALL_PROXIMITY] = Math.round(envI*255);
    data2[i*4 + MOD2_CHANNELS.DAMAGED] = Math.round(damagedI*255);
    data2[i*4 + MOD2_CHANNELS.BLOOD] = Math.round(bloodI*255);
    data2[i*4 + MOD2_CHANNELS.DUST] = Math.round(dustI*255);
  }
  return { data, data2, w, h, enabled:true, packing: MOD_PACKING };
}

export function decodeModifierPixel(rgba, rgba2) {
  return {
    moss: rgba[0]/255,
    water: rgba[1]/255,
    puddle: rgba[2]/255,
    wallProximity: rgba[3]/255,
    damaged: (rgba2 ? rgba2[0]/255 : 0),
    blood: (rgba2 ? rgba2[1]/255 : 0),
    dust: (rgba2 ? rgba2[2]/255 : 0)
  };
}
