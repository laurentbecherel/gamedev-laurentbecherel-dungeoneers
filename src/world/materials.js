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

function genBrickTile(size, baseRGB, proc, seed, matRough) {
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
    else { r += varR; g += varR * 0.7; b += varR * 0.5; }
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
    metal[idx] = 0;
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

function genSlabTile(size, baseRGB, proc, seed, isCeil, matRough) {
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
    else { r += varR; g += varR; b += varR; }
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
    metal[idx] = 0;
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
      const roughValRaw = (mat.roughness ?? proc.roughness ?? 0.72);
      const roughVal = Math.round((typeof roughValRaw === 'number' ? roughValRaw : 0.72) * 255);
      const metalVal = Math.round((mat.metal ?? 0) * 255);
      const emissStr = Math.round((mat.emissiveStrength ?? 0) * 255);
      const tile = type === 'brick'
        ? genBrickTile(texSize, base, proc, seed, roughValRaw)
        : genSlabTile(texSize, base, proc, seed, type === 'ceils', roughValRaw);
      const off = mi * layerPix;
      const off4 = off * 4;
      for (let y = 0; y < texSize; y++) for (let x = 0; x < texSize; x++) {
        const si = y * texSize + x;
        const di = off + si;
        const sai = si * 4, dai = off4 + si * 4;
        albedo[dai] = tile.albedo[sai]; albedo[dai+1] = tile.albedo[sai+1]; albedo[dai+2]=tile.albedo[sai+2]; albedo[dai+3]=255;
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
        albedo[dai] = arrData.albedo[sai]; albedo[dai+1]=arrData.albedo[sai+1]; albedo[dai+2]=arrData.albedo[sai+2]; albedo[dai+3]=255;
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
