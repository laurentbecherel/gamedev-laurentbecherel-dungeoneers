// Modifier map baking — CPU side, per-cell modifier field
// For Task10 refactor: we bake an empty map now, but design for future 6 modifiers
// (moss, damaged, water, puddle, blood, dust) with role weighting + noise.
// Generator will call this to produce dungeon.modifierMap (Uint8Array w*h*4 etc).

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

// Default role weights for future modifiers (not yet used actively, but spec)
const DEFAULT_ROLE_WEIGHTS = {
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
 * Generate per-cell modifier map.
 * Returns { data: Uint8Array w*h*4, w,h } where RGBA = [moss, water/damage, puddle/blood, dust] for now all zero (disabled until Task9 fully implemented).
 * Optionally encode role-based intensities if config.modifiers.enabled true.
 */
export function generateModifierMap(dungeon, config) {
  const w = dungeon.w, h = dungeon.h;
  const size = w*h;
  const data = new Uint8Array(size*4); // RGBA
  const modCfg = config.materialModifiers || config['material-modifiers'] || config.modifiers || {};
  const enabled = modCfg.enabled ?? false;
  if (!enabled) {
    // Still need to produce a valid texture (all zeros) so shader can sample but early-out
    return { data, w, h, enabled:false };
  }
  const seed = dungeon.seed ?? 1337;
  const globalNoiseScale = modCfg.generator?.noiseScale ?? 0.18;
  const roleWeights = modCfg.generator?.roleWeights || DEFAULT_ROLE_WEIGHTS;
  // Build room index lookup for role
  const roomAt = (x,y) => {
    if (!dungeon.rooms) return null;
    for (let i=0;i<dungeon.rooms.length;i++){ const r=dungeon.rooms[i]; if(x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h) return {room:r, idx:i};}
    return null;
  };
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x;
    // Only floors get puddle, but for stub we encode for all
    const info = roomAt(x,y);
    const role = info?.room?.role || (dungeon.grid[i]===0 ? 'corridor' : 'hall');
    const rw = roleWeights[role] || roleWeights['corridor'];
    // Per-cell noise variation 0..1
    const n = fbm(x*globalNoiseScale, y*globalNoiseScale, seed, 3);
    const n2 = fbm(x*globalNoiseScale*1.7+10, y*globalNoiseScale*1.7+20, seed+101, 2);
    // For each modifier compute intensity = roleWeight * (0.6 + 0.4*noise) with threshold
    const mossI = Math.max(0, rw.moss * (0.5 + 0.5*n) - 0.05);
    const waterI = Math.max(0, ((rw.water ?? 0) + (rw.damaged ?? 0)*0.5) * (0.5 + 0.5*n2) - 0.08);
    const puddleBlood = Math.max(0, ((rw.puddle ?? 0)* (dungeon.floorHeight ? 1 - Math.max(0, Math.min(1, dungeon.floorHeight[i]+0.5)) : 0.5) + (rw.blood ?? 0)* n)*0.9);
    const dustI = Math.max(0, rw.dust * (0.6 + 0.4*n) - 0.04);
    // Encode
    data[i*4] = Math.round(Math.min(1, mossI)*255);
    data[i*4+1] = Math.round(Math.min(1, waterI)*255);
    data[i*4+2] = Math.round(Math.min(1, puddleBlood)*255);
    data[i*4+3] = Math.round(Math.min(1, dustI)*255);
  }
  return { data, w, h, enabled:true };
}

export function uploadModifierMapTexture(gl, modifierMap, filter) {
  const { createTexture } = require ? null : null; // avoid require in ES
  // We'll import dynamically via gl-utils in renderer, not here
  return modifierMap;
}
