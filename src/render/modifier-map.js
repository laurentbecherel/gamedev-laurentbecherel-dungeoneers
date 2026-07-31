import { packModifierTextures } from "../world/modifiers.js";

function createTex(gl, w, h, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return tex;
}

// New packed single texture to reduce sampler count from 16->15 (fixes link error on ANGLE)
export function createModifierTextures(gl, modData) {
  const w = modData?.w ?? 1;
  const h = modData?.h ?? 1;
  if (!modData || !modData.moss) {
    const dummy = new Uint8Array([0,0,0,0]);
    const tex = createTex(gl, 1, 2, new Uint8Array([0,0,0,0, 0,0,0,255]));
    return { tex, texA: tex, texB: tex, w, h, packedH: 2 };
  }
  const packed = packModifierTextures(modData);
  const packedH = packed.h * 2;
  const merged = new Uint8Array(packed.w * packedH * 4);
  // top half = texA (moss/damaged/water/puddle)
  merged.set(packed.texA, 0);
  // bottom half = texB (blood/dust)
  merged.set(packed.texB, packed.w * packed.h * 4);
  const tex = createTex(gl, packed.w, packedH, merged);
  // For backwards compat return same tex as A and B
  return { tex, texA: tex, texB: tex, w: packed.w, h: packed.h, packedH };
}

export function createModifierTexturesLegacy(gl, modData) {
  return createModifierTextures(gl, modData);
}

export function updateModifierTextures(gl, texA, texB, modData) {
  // texA and texB may be same texture (packed), handle both cases
  if (!modData || !modData.moss) return;
  const packed = packModifierTextures(modData);
  const packedH = packed.h * 2;
  const merged = new Uint8Array(packed.w * packedH * 4);
  merged.set(packed.texA, 0);
  merged.set(packed.texB, packed.w * packed.h * 4);
  // If texA == texB (single packed texture), update it as one
  if (texA === texB) {
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed.w, packedH, 0, gl.RGBA, gl.UNSIGNED_BYTE, merged);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed.w, packed.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed.texA);
    if (texB) {
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed.w, packed.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed.texB);
    }
  }
}

export function updateModifierTexturesSingle(gl, tex, modData) {
  if (!modData || !modData.moss) return;
  const packed = packModifierTextures(modData);
  const packedH = packed.h * 2;
  const merged = new Uint8Array(packed.w * packedH * 4);
  merged.set(packed.texA, 0);
  merged.set(packed.texB, packed.w * packed.h * 4);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed.w, packedH, 0, gl.RGBA, gl.UNSIGNED_BYTE, merged);
}
