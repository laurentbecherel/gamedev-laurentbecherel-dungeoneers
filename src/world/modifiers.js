// Modifier map baking — CPU side, per-cell modifier field
// v11 Full: 2 textures for lossless 6-channel separation + UBO for params
// Design: 6 logical modifiers (moss, damaged, water, puddle, blood, dust) -> 2 RGBA8 textures

export const MOD_CHANNELS = {
  MOSS: 0,        // R – moss growth
  WATER: 1,       // G – water wetness
  PUDDLE: 2,      // B – floor puddle
  DUST: 3         // A – dust
};

export const MOD2_CHANNELS = {
  DAMAGED: 0,     // R – damaged cracks
  BLOOD: 1,       // G – blood splatter
  UNUSED_A: 2,
  UNUSED_B: 3
};

export const MODIFIER_NAMES = ['moss', 'damaged', 'water', 'puddle', 'blood', 'dust'];

// v2 packing: 2 textures lossless
// Tex1: R=moss, G=water, B=puddle, A=dust
// Tex2: R=damaged, G=blood
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
  },
  legacyV1: 'v1 packed water+damage in G and puddle+blood in B for single texture compat'
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

// Default role weights for modifiers
export const DEFAULT_ROLE_WEIGHTS = {
  entrance:{ moss:0.3, dust:0.2, water:0.4, puddle:0.2, blood:0.05, damaged:0.15 },
  exit:{ moss:0.1, dust:0.2, water:0.3, puddle:0.1, blood:0.15, damaged:0.5 },
  guardian:{ moss:0.05, dust:0.1, water:0.1, puddle:0.05, blood:0.8, damaged:0.6 },
  treasure:{ moss:0.15, dust:0.7, water:0.05, puddle:0.02, blood:0.05, damaged:0.1 },
  secret:{ moss:0.2, dust:0.75, water:0.1, puddle:0.05, blood:0.02, damaged:0.05 },
  shrine:{ moss:0.5, dust:0.4, water:0.2, puddle:0.1, blood:0.05, damaged:0.1 },
  hub:{ moss:0.1, dust:0.2, water:0.15, puddle:0.08, blood:0.3, damaged:0.4 },
  armory:{ moss:0.05, dust:0.3, water:0.08, puddle:0.05, blood:0.5, damaged:0.3 },
  hall:{ moss:0.1, dust:0.2, water:0.1, puddle:0.05, blood:0.1, damaged:0.15 },
  corridor:{ moss:0.05, dust:0.15, water:0.15, puddle:0.05, blood:0.08, damaged:0.2 },
};

/**
 * Generate per-cell modifier maps – v2 with 2 textures lossless.
 * Returns { data, data2, w,h }
 * data = RGBA moss,water,puddle,dust
 * data2 = RG damaged,blood
 */
export function generateModifierMap(dungeon, config) {
  const w = dungeon.w, h = dungeon.h;
  const size = w*h;
  const data = new Uint8Array(size*4); // tex1
  const data2 = new Uint8Array(size*4); // tex2
  const modCfg = config.materialModifiers || config['material-modifiers'] || config.modifiers || {};
  const enabled = modCfg.enabled ?? false;
  if (!enabled) {
    return { data, data2, w, h, enabled:false, packing: MOD_PACKING };
  }
  const seed = dungeon.seed ?? 1337;
  const globalNoiseScale = modCfg.generator?.noiseScale ?? 0.18;
  const roleWeights = modCfg.generator?.roleWeights || DEFAULT_ROLE_WEIGHTS;

  const roomGrid = new Int16Array(size).fill(-1);
  if (dungeon.rooms) {
    for (let ri=0; ri<dungeon.rooms.length; ri++) {
      const r = dungeon.rooms[ri];
      for (let yy=r.y; yy<r.y+r.h; yy++) for (let xx=r.x; xx<r.x+r.w; xx++) {
        if (xx>=0 && yy>=0 && xx<w && yy<h) roomGrid[yy*w+xx]=ri;
      }
    }
  }

  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    const ri = roomGrid[i];
    const role = (ri>=0 ? dungeon.rooms[ri]?.role : null) || (dungeon.grid[i]===0 ? 'corridor' : 'hall');
    const rw = roleWeights[role] || roleWeights['corridor'];
    const n = fbm(x*globalNoiseScale, y*globalNoiseScale, seed, 3);
    const n2 = fbm(x*globalNoiseScale*1.7+10, y*globalNoiseScale*1.7+20, seed+101, 2);

    const mossI = Math.max(0, rw.moss * (0.5 + 0.5*n) - 0.05);
    const waterI = Math.max(0, (rw.water ?? 0) * (0.5 + 0.5*n2) - 0.06);
    const fh = dungeon.floorHeight ? dungeon.floorHeight[i] : 0;
    const lowFloorFactor = 1 - Math.max(0, Math.min(1, fh + 0.5));
    const puddleI = Math.max(0, (rw.puddle ?? 0) * lowFloorFactor * (0.6 + 0.4*n) - 0.04);
    const dustI = Math.max(0, rw.dust * (0.6 + 0.4*n) - 0.04);
    const damagedI = Math.max(0, (rw.damaged ?? 0) * (0.5 + 0.5*n2) - 0.05);
    const bloodI = Math.max(0, (rw.blood ?? 0) * n - 0.03);

    data[i*4 + MOD_CHANNELS.MOSS] = Math.round(Math.min(1, mossI)*255);
    data[i*4 + MOD_CHANNELS.WATER] = Math.round(Math.min(1, waterI)*255);
    data[i*4 + MOD_CHANNELS.PUDDLE] = Math.round(Math.min(1, puddleI)*255);
    data[i*4 + MOD_CHANNELS.DUST] = Math.round(Math.min(1, dustI)*255);

    data2[i*4 + MOD2_CHANNELS.DAMAGED] = Math.round(Math.min(1, damagedI)*255);
    data2[i*4 + MOD2_CHANNELS.BLOOD] = Math.round(Math.min(1, bloodI)*255);
    // unused channels stay 0
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
