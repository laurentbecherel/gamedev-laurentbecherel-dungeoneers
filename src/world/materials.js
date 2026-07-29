// Procedural PBR material atlas generation — CPU side

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

function genBrickTile(size, baseRGB, proc, seed) {
  const hs = proc.heightScale ?? 1.15;
  const ns = proc.normalStrength ?? 1.15;
  const aoB = proc.aoBoost ?? 1.1;
  const gw = proc.groutWidth ?? 1;
  const ds = proc.domeStrength ?? 1.1;
  const ca = proc.crackAmount ?? 0.6;
  const brickW = 8, brickH = 8;
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
    const dx = (ax - cx) / cx, dy = (ly - cy) / cy;
    const dist = Math.hypot(dx, dy);
    const dome = Math.max(0, 1 - dist * dist) * 0.28 * ds;
    const hv = hash2(bx, by, seed);
    const varR = (hv - 0.5) * 28, varH = (hv - 0.5) * 0.12;
    let h = inGrout ? 0.08 : 0.5 + dome + varH;
    let r = baseRGB[0], g = baseRGB[1], b = baseRGB[2];
    if (inGrout) { r *= 0.45; g *= 0.4; b *= 0.35; h = 0.08; }
    else { r += varR; g += varR * 0.7; b += varR * 0.5; }
    const onEdge = ax < 1.5 || ax > brickW - 1.5 || ly < 1.5 || ly > brickH - 1.5;
    if (onEdge && hash2(bx * 3 + 1, by * 5 + 2, seed) > 0.7) h -= 0.14 * ca;
    h = Math.max(0, Math.min(1, (h - 0.5) * hs + 0.5));
    const idx = y * size + x;
    height[idx] = h;
    const aobase = inGrout ? 0.42 : 0.72 + dome * 0.3;
    ao[idx] = Math.max(0, Math.min(1, (aobase - 0.5) * aoB + 0.5));
    const ai = idx * 4;
    albedo[ai] = Math.max(0, Math.min(255, r | 0));
    albedo[ai + 1] = Math.max(0, Math.min(255, g | 0));
    albedo[ai + 2] = Math.max(0, Math.min(255, b | 0));
    albedo[ai + 3] = 255;
    rough[idx] = 217; // 0.85 * 255
    metal[idx] = 0;
    const ei=idx*4; emiss[ei]=0; emiss[ei+1]=0; emiss[ei+2]=0; emiss[ei+3]=255;
  }
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = x > 0 ? x - 1 : 0, xp = x < size - 1 ? x + 1 : size - 1;
    const ym = y > 0 ? y - 1 : 0, yp = y < size - 1 ? y + 1 : size - 1;
    const hL = height[y * size + xm], hR = height[y * size + xp];
    const hU = height[ym * size + x], hD = height[yp * size + x];
    const n = heightToNormal(hL, hR, hU, hD, ns * 2.4);
    const ni = (y * size + x) * 4;
    normal[ni] = n[0]|0; normal[ni+1]=n[1]|0; normal[ni+2]=n[2]|0; normal[ni+3]=255;
  }
  return { albedo, normal, height, rough, metal, ao, emiss };
}

function genSlabTile(size, baseRGB, proc, seed, isCeil) {
  const hs = proc.heightScale ?? 1.15;
  const ns = proc.normalStrength ?? 1.15;
  const aoB = proc.aoBoost ?? 1.1;
  const bs = proc.blockSize ?? 8;
  const gw = proc.groutWidth ?? 1;
  const ds = proc.domeStrength ?? 1.1;
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
    // pillowed dome to give 4-sided bevel per tile (like brick walls)
    const cx = bs / 2, cy = bs / 2;
    const dx = (lx - cx) / cx;
    const dy = (ly - cy) / cy;
    const dist = Math.hypot(dx, dy);
    const dome = Math.max(0, 1 - dist * dist) * 0.22 * ds;
    const hv = hash2(bx, by, seed);
    const varR = (hv - 0.5) * 20, varH = (hv - 0.5) * 0.08;
    let h = inGrout ? 0.28 : 0.5 + dome + varH;
    let r = baseRGB[0], g = baseRGB[1], b = baseRGB[2];
    if (inGrout) { r *= 0.6; g *= 0.6; b *= 0.6; }
    else { r += varR; g += varR; b += varR; }
    h = Math.max(0, Math.min(1, (h - 0.5) * hs + 0.5));
    const idx = y * size + x;
    height[idx] = h;
    const aoBase = inGrout ? 0.42 : 0.72 + dome * 0.35;
    ao[idx] = Math.max(0, Math.min(1, (aoBase - 0.5) * aoB + 0.5));
    const ai = idx * 4;
    albedo[ai] = Math.max(0, Math.min(255, r | 0));
    albedo[ai + 1] = Math.max(0, Math.min(255, g | 0));
    albedo[ai + 2] = Math.max(0, Math.min(255, b | 0));
    albedo[ai + 3] = 255;
    rough[idx] = isCeil ? 230 : 224;
    metal[idx] = 0;
    const ei=idx*4; emiss[ei]=0; emiss[ei+1]=0; emiss[ei+2]=0; emiss[ei+3]=255;
  }
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xm = x > 0 ? x - 1 : 0, xp = x < size - 1 ? x + 1 : size - 1;
    const ym = y > 0 ? y - 1 : 0, yp = y < size - 1 ? y + 1 : size - 1;
    const hL = height[y * size + xm], hR = height[y * size + xp];
    const hU = height[ym * size + x], hD = height[yp * size + x];
    const n = heightToNormal(hL, hR, hU, hD, ns * 2.0);
    const ni = (y * size + x) * 4;
    normal[ni] = n[0]|0; normal[ni+1]=n[1]|0; normal[ni+2]=n[2]|0; normal[ni+3]=255;
  }
  return { albedo, normal, height, rough, metal, ao, emiss };
}

export function generateMaterialAtlases(wallMats, floorMats, ceilMats, procConfig) {
  const texSize = 64;
  // Task 3: single material only — 1 wall + 1 floor + 1 ceil = 64-wide atlases.
  // Clamp to 1 to match Task 3 spec and avoid over-allocation.
  const wCount = Math.min(1, wallMats.length || 1);
  const fCount = Math.min(1, floorMats.length || 1);
  const cCount = Math.min(1, ceilMats.length || 1);

  function packAtlas(mats, count, type, proc) {
    const w = texSize * count, h = texSize;
    const albedo = new Uint8Array(w * h * 4);
    const normal = new Uint8Array(w * h * 4);
    const height = new Uint8Array(w * h);
    const roughMetalAO = new Uint8Array(w * h * 4);
    for (let mi = 0; mi < count; mi++) {
      const mat = mats[mi];
      const seed = mat.variationSeed ?? (101 + mi);
      const base = mat.base ?? [128, 128, 128];
      const roughVal = Math.round((mat.roughness ?? 0.85) * 255);
      const metalVal = Math.round((mat.metal ?? 0) * 255);
      const emissStr = Math.round((mat.emissiveStrength ?? 0) * 255);
      const emissCol = mat.emissiveColor ?? [0, 0, 0];
      const tile = type === 'brick' ? genBrickTile(texSize, base, proc, seed)
        : genSlabTile(texSize, base, proc, seed, type === 'ceils');
      const ox = mi * texSize;
      for (let y = 0; y < texSize; y++) for (let x = 0; x < texSize; x++) {
        const si = y * texSize + x;
        const di = y * w + ox + x;
        const sai = si * 4, dai = di * 4;
        albedo[dai] = tile.albedo[sai]; albedo[dai + 1] = tile.albedo[sai + 1];
        albedo[dai + 2] = tile.albedo[sai + 2]; albedo[dai + 3] = 255;
        const sni = si * 4, dni = di * 4;
        normal[dni] = tile.normal[sni]; normal[dni + 1] = tile.normal[sni + 1]; normal[dni + 2] = tile.normal[sni + 2]; normal[dni + 3] = 255;
        height[di] = Math.round(tile.height[si] * 255);
        roughMetalAO[dai] = tile.rough[si] || roughVal;
        roughMetalAO[dai + 1] = tile.metal[si] || metalVal;
        roughMetalAO[dai + 2] = emissStr;
        roughMetalAO[dai + 3] = Math.round(tile.ao[si] * 255);
      }
    }
    return { albedo, normal, height, roughMetalAO, width: w, atlasH: h };
  }

  const wp = procConfig.walls ?? {};
  const fp = procConfig.floors ?? {};
  const cp = procConfig.ceils ?? {};
  const wA = packAtlas(wallMats, wCount, 'brick', wp);
  const fA = packAtlas(floorMats, fCount, 'floors', fp);
  const cA = packAtlas(ceilMats, cCount, 'ceils', cp);

  return {
    wallAlbedo: wA.albedo, wallNormal: wA.normal, wallHeight: wA.height,
    wallRoughMetalAO: wA.roughMetalAO,
    floorAlbedo: fA.albedo, floorNormal: fA.normal, floorHeight: fA.height,
    floorRoughMetalAO: fA.roughMetalAO,
    ceilAlbedo: cA.albedo, ceilNormal: cA.normal, ceilHeight: cA.height,
    ceilRoughMetalAO: cA.roughMetalAO,
    texSize, wallCount: wCount, floorCount: fCount, ceilCount: cCount,
    wallAtlasW: wA.width, wallAtlasH: wA.atlasH, floorAtlasW: fA.width, floorAtlasH: fA.atlasH, ceilAtlasW: cA.width, ceilAtlasH: cA.atlasH,
  };
}

export function atlasUvX(materialId, texSize, atlasWidth) {
  return ((materialId - 1) * texSize) / atlasWidth;
}
