/**
 * Palette generation for the retro post-processing pass.
 *
 * Pure, deterministic CPU helpers (no WebGL/DOM) that build the colour tables
 * uploaded as textures by the renderer:
 *   - genPalette   → 256-entry RGBA palette for a given style
 *   - genColormap  → per-light-level darkened copies of a palette
 *   - buildRGBToPal→ 32³ RGB→nearest-palette-index lookup table
 */

const PALETTE_SIZE = 256;

export function genPalette(style = 'doom') {
  const pal = new Uint8Array(PALETTE_SIZE * 4);
  function set(i, r, g, b) { pal[i * 4] = r; pal[i * 4 + 1] = g; pal[i * 4 + 2] = b; pal[i * 4 + 3] = 255; }
  if (style === 'grayscale') { for (let i = 0; i < 256; i++) set(i, i, i, i); return pal; }
  if (style === 'sepia') { for (let i = 0; i < 256; i++) { const v = i; set(i, Math.min(255, v * 1.2 | 0), Math.min(255, v * 0.9 | 0), Math.min(255, v * 0.6 | 0)); } return pal; }
  let idx = 0; const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) { if (idx >= 216) break; set(idx, levels[r], levels[g], levels[b]); idx++; }
  for (; idx < 256; idx++) { const v = Math.floor((idx - 216) * 255 / 39); set(idx, v, v, v); }
  for (let i = 0; i < 48; i++) { const t = i / 47; set(i, Math.floor(80 + t * 120), Math.floor(40 + t * 60), Math.floor(20 + t * 30)); }
  return pal;
}

export function genColormap(palette, levels = 32) {
  const cm = new Uint8Array(levels * PALETTE_SIZE * 4);
  for (let l = 0; l < levels; l++) {
    const factor = 1 - l / (levels - 0.5);
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const r = palette[i * 4] * factor | 0;
      const g = palette[i * 4 + 1] * factor | 0;
      const b = palette[i * 4 + 2] * factor | 0;
      const o = (l * PALETTE_SIZE + i) * 4;
      cm[o] = r; cm[o + 1] = g; cm[o + 2] = b; cm[o + 3] = 255;
    }
  }
  return cm;
}

export function buildRGBToPal(palette) {
  const lut = new Uint8Array(32 * 32 * 32);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const rr = r * 8 + 4, gg = g * 8 + 4, bb = b * 8 + 4;
    let best = 0, bestd = 1e9;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const pr = palette[i * 4], pg = palette[i * 4 + 1], pb = palette[i * 4 + 2];
      const dr = rr - pr, dg = gg - pg, db = bb - pb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestd) { bestd = d; best = i; }
    }
    lut[(r << 10) | (g << 5) | b] = best;
  }
  return lut;
}
