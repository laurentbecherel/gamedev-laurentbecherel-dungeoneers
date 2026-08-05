// Dungeon grid to GPU texture upload – pure WebGPU (no WebGL2)
import { createTexture, updateTexture } from './gpu-utils.js';

function generateMapData(dungeon) {
  const w = dungeon.w, h = dungeon.h;
  const data = new Uint8Array(w * h * 4);
  const dataMat = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const di = i * 4;
    const cell = dungeon.grid[i];
    data[di] = cell;
    let fh = dungeon.floorHeight ? dungeon.floorHeight[i] : 0.0;
    let g = Math.floor((fh + 0.5) * 255); if (g < 0) g = 0; if (g > 255) g = 255;
    let ch = dungeon.ceilHeight ? dungeon.ceilHeight[i] : 1.0;
    let b = Math.floor((ch - 0.7) * 255); if (b < 0) b = 0; if (b > 255) b = 255;
    let dc = dungeon.deco ? dungeon.deco[i] : 0;
    data[di + 1] = g; data[di + 2] = b; data[di + 3] = dc;
    let fm = dungeon.floorMat ? dungeon.floorMat[i] : 1;
    let cm = dungeon.ceilMat ? dungeon.ceilMat[i] : 1;
    dataMat[di] = fm; dataMat[di + 1] = cm; dataMat[di + 2] = 0; dataMat[di + 3] = 0;
  }
  return { w, h, data, dataMat };
}

export function uploadMapTexture(device, dungeon) {
  const { w, h, data, dataMat } = generateMapData(dungeon);
  const mapTex = createTexture(device, w, h, data);
  const matTex = createTexture(device, w, h, dataMat);
  return { mapTex, matTex, data, dataMat, w, h };
}

export function updateMapTexture(device, tex, matTex, dungeon) {
  const { w, h, data, dataMat } = generateMapData(dungeon);
  updateTexture(device, tex, w, h, data);
  updateTexture(device, matTex, w, h, dataMat);
}

export function _generateForTest(dungeon) { return generateMapData(dungeon); }
