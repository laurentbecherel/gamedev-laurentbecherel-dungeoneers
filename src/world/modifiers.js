
// Modifier map baking - CPU side, per-cell modifier field
// v13 puddle precise: smaller organic pools, higher threshold, linear smooth, noise cloud mask not just cells

export const MOD_CHANNELS = {
  MOSS: 0,
  WATER: 1,
  PUDDLE: 2,
  DUST: 3
};

export const MOD2_CHANNELS = {
  DAMAGED: 0,
  BLOOD: 1,
  UNUSED_A: 2,
  UNUSED_B: 3
};

export const MODIFIER_NAMES = ['moss', 'damaged', 'water', 'puddle', 'blood', 'dust'];

export const MOD_PACKING = {
  version: 2,
  textures: 2,
  tex1: {
    name: 'u_modifierMap',
    unit: 15,
    channels: {
      R: { name: 'moss', logical: ['moss'], channel: 0 },
      G: { name: 'water', logical: ['water'], channel: 1 },
      B: { name: 'puddle', logical: ['puddle'], channel: 2, floorOnly: true },
      A: { name: 'dust', logical: ['dust'], channel: 3 }
    }
  },
  tex2: {
    name: 'u_modifierMap2',
    unit: 16,
    channels: {
      R: { name: 'damaged', logical: ['damaged'], channel: 0 },
      G: { name: 'blood', logical: ['blood'], channel: 1 },
      B: { name: 'unused', logical: [], channel: 2 },
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
  entrance:{ moss:0.28, dust:0.0, water:0.0, puddle:0.75, blood:0.0, damaged:0.0 },
  exit:{ moss:0.15, dust:0.0, water:0.0, puddle:0.75, blood:0.0, damaged:0.0 },
  guardian:{ moss:0.07, dust:0.0, water:0.0, puddle:0.65, blood:0.0, damaged:0.0 },
  treasure:{ moss:0.12, dust:0.0, water:0.0, puddle:0.70, blood:0.0, damaged:0.0 },
  secret:{ moss:0.35, dust:0.0, water:0.0, puddle:0.70, blood:0.0, damaged:0.0 },
  shrine:{ moss:0.42, dust:0.0, water:0.0, puddle:0.75, blood:0.0, damaged:0.0 },
  hub:{ moss:0.16, dust:0.0, water:0.0, puddle:0.70, blood:0.0, damaged:0.0 },
  armory:{ moss:0.08, dust:0.0, water:0.0, puddle:0.65, blood:0.0, damaged:0.0 },
  hall:{ moss:0.18, dust:0.0, water:0.0, puddle:0.70, blood:0.0, damaged:0.0 },
  corridor:{ moss:0.13, dust:0.0, water:0.0, puddle:0.60, blood:0.0, damaged:0.0 },
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

  function isNearWall(x,y){
    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
      if(dx===0 && dy===0) continue;
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=w||ny>=h) return true;
      const gi = ny*w+nx;
      if(dungeon.grid && dungeon.grid[gi] !== 0) return true;
    }
    return false;
  }

  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    const isFloor = dungeon.grid ? dungeon.grid[i]===0 : true;
    const ri = roomGrid[i];
    const role = (ri>=0 ? dungeon.rooms[ri]?.role : null) || (isFloor ? 'corridor' : 'hall');
    const rw = roleWeights[role] || roleWeights['corridor'];

    // Domain-warped FBM for organic cloud mask (map-based) - sample at texel centers (x+0.5) for LINEAR alignment
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

    // Moss: higher freq + more octaves for variation, still CPU once
    let mossI = 0;
    if (roleMoss > 0.001) {
      const mossScale = 0.85; // was 0.35 - higher = more variation, smaller clumps
      const mossLarge = fbm(xc * mossScale, yc * mossScale, seed+333, 4); // was 3 octaves -> 4
      const mossDetail = fbm(xc * mossScale * 2.2 + 17.3, yc * mossScale * 2.2 + 31.7, seed+334, 2) * 0.35;
      let mt = (mossLarge + mossDetail - 0.35) / Math.max(0.0001, 0.26);
      mt = Math.max(0, Math.min(1, mt));
      mt = smooth(mt);
      let mossShape = mt * (0.55 + 0.45 * medNoise);
      const wallFactor = isFloor ? (isNearWall(x,y) ? 1.40 : 0.55) : 1.05;
      mossI = roleMoss * mossShape * wallFactor * (0.40 + 0.60 * globalN);
      mossI = Math.max(0, Math.min(1, mossI));
    }

    data[i*4 + MOD_CHANNELS.MOSS] = Math.round(mossI*255);
    data[i*4 + MOD_CHANNELS.WATER] = 0;
    data[i*4 + MOD_CHANNELS.PUDDLE] = Math.round(puddleI*255);
    data[i*4 + MOD_CHANNELS.DUST] = 0;
    data2[i*4 + MOD2_CHANNELS.DAMAGED] = 0;
    data2[i*4 + MOD2_CHANNELS.BLOOD] = 0;
  }
  return { data, data2, w, h, enabled:true, packing: MOD_PACKING };
}

export function decodeModifierPixel(rgba, rgba2) {
  return {
    moss: rgba[0]/255,
    water: rgba[1]/255,
    puddle: rgba[2]/255,
    dust: rgba[3]/255,
    damaged: (rgba2 ? rgba2[0]/255 : 0),
    blood: (rgba2 ? rgba2[1]/255 : 0)
  };
}
