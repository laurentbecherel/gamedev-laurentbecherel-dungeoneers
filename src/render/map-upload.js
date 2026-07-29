// Dungeon grid to GPU texture upload — matches prototype packing

import { createTexture, updateTexture } from './gl-utils.js';

export function uploadMapTexture(gl, dungeon) {
  const w = dungeon.w, h = dungeon.h;
  const data = new Uint8Array(w * h * 4);
  const dataMat = new Uint8Array(w * h * 4);
  const hasFH = !!dungeon.floorHeight;
  const hasCH = !!dungeon.ceilHeight;
  const hasDeco = !!dungeon.deco;
  const hasFMat = !!dungeon.floorMat;
  const hasCMat = !!dungeon.ceilMat;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const di = i * 4;
    const cell = dungeon.grid[i];
    data[di] = cell; // R = grid cell type 0=floor, 1+=wall mat ID
    // G = floor height encoded as (fh + 0.5) * 255, matches prototype
    let fh = hasFH ? dungeon.floorHeight[i] : 0.0;
    let g = Math.floor((fh + 0.5) * 255); if (g < 0) g = 0; if (g > 255) g = 255;
    // B = ceiling height encoded as (ch - 0.7) * 255, matches prototype
    let ch = hasCH ? dungeon.ceilHeight[i] : 1.0;
    let b = Math.floor((ch - 0.7) * 255); if (b < 0) b = 0; if (b > 255) b = 255;
    let dc = hasDeco ? dungeon.deco[i] : 0;
    data[di + 1] = g; data[di + 2] = b; data[di + 3] = dc;
    // second texture: floor mat ID in R, ceil mat ID in G
    let fm = hasFMat ? dungeon.floorMat[i] : 1;
    let cm = hasCMat ? dungeon.ceilMat[i] : 1;
    dataMat[di] = fm; dataMat[di + 1] = cm; dataMat[di + 2] = 0; dataMat[di + 3] = 0;
  }
  const mapTex = createTexture(gl, w, h, data, gl.NEAREST);
  const matTex = createTexture(gl, w, h, dataMat, gl.NEAREST);
  return { mapTex, matTex };
}

export function updateMapTexture(gl, tex, matTex, dungeon) {
  const w = dungeon.w, h = dungeon.h;
  const data = new Uint8Array(w * h * 4);
  const dataMat = new Uint8Array(w * h * 4);
  const hasFH = !!dungeon.floorHeight, hasCH = !!dungeon.ceilHeight, hasDeco = !!dungeon.deco;
  const hasFMat = !!dungeon.floorMat, hasCMat = !!dungeon.ceilMat;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, di = i * 4;
    const cell = dungeon.grid[i];
    data[di] = cell;
    let fh = hasFH ? dungeon.floorHeight[i] : 0.0;
    let g = Math.floor((fh + 0.5) * 255); if (g < 0) g = 0; if (g > 255) g = 255;
    let ch = hasCH ? dungeon.ceilHeight[i] : 1.0;
    let b = Math.floor((ch - 0.7) * 255); if (b < 0) b = 0; if (b > 255) b = 255;
    data[di + 1] = g; data[di + 2] = b; data[di + 3] = hasDeco ? dungeon.deco[i] : 0;
    dataMat[di] = hasFMat ? dungeon.floorMat[i] : 1;
    dataMat[di + 1] = hasCMat ? dungeon.ceilMat[i] : 1;
    dataMat[di + 2] = 0; dataMat[di + 3] = 0;
  }
  updateTexture(gl, tex, w, h, data);
  updateTexture(gl, matTex, w, h, dataMat);
}
