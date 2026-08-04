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

export function genPalette(style = 'doom', opts = null) {
  const pal = new Uint8Array(PALETTE_SIZE * 4);
  function set(i, r, g, b) { pal[i * 4] = r; pal[i * 4 + 1] = g; pal[i * 4 + 2] = b; pal[i * 4 + 3] = 255; }
  const o = opts || {};
  const brownRamp = o.brownRamp || o.brownRampConfig || null;
  const customColors = o.customColors || o.overrides || o.paletteOverrides || null;
  const cubeLevels = o.cubeLevels || o.levels || [0, 51, 102, 153, 204, 255];

  if (style === 'grayscale') { for (let i = 0; i < 256; i++) set(i, i, i, i); }
  else if (style === 'sepia') { for (let i = 0; i < 256; i++) { const v = i; set(i, Math.min(255, v * 1.2 | 0), Math.min(255, v * 0.9 | 0), Math.min(255, v * 0.6 | 0)); } }
  else {
    let idx = 0;
    const levels = cubeLevels;
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) { if (idx >= 216) break; set(idx, levels[r], levels[g], levels[b]); idx++; }
    for (; idx < 256; idx++) { const v = Math.floor((idx - 216) * 255 / 39); set(idx, v, v, v); }
    // Doom brown ramp - tweakable via brownRamp { from:[r,g,b], to:[r,g,b], count }
    let rampFrom = [80, 40, 20];
    let rampTo = [200, 100, 50];
    let rampCount = 48;
    if (brownRamp) {
      if (brownRamp.from) rampFrom = brownRamp.from;
      if (brownRamp.start) rampFrom = brownRamp.start;
      if (brownRamp.to) rampTo = brownRamp.to;
      if (brownRamp.end) rampTo = brownRamp.end;
      if (brownRamp.count) rampCount = Math.max(1, Math.min(216, brownRamp.count | 0));
    }
    for (let i = 0; i < rampCount; i++) {
      const t = rampCount <= 1 ? 0 : i / (rampCount - 1);
      set(i,
        Math.floor(rampFrom[0] + t * (rampTo[0] - rampFrom[0])),
        Math.floor(rampFrom[1] + t * (rampTo[1] - rampFrom[1])),
        Math.floor(rampFrom[2] + t * (rampTo[2] - rampFrom[2])));
    }
  }
  // Apply custom per-index overrides (array of [r,g,b] or {index, color} or map)
  if (customColors) {
    if (Array.isArray(customColors)) {
      // array of 256 or sparse array, or [{index, color}]
      for (let i = 0; i < customColors.length; i++) {
        const entry = customColors[i];
        if (!entry) continue;
        if (Array.isArray(entry) && entry.length >= 3 && typeof entry[0] === 'number') {
          // direct color at index i if array-of-colors
          if (i < PALETTE_SIZE) set(i, entry[0] | 0, entry[1] | 0, entry[2] | 0);
        } else if (entry && typeof entry === 'object' && 'index' in entry) {
          const idx = entry.index | 0;
          const col = entry.color || entry.rgb;
          if (idx >= 0 && idx < PALETTE_SIZE && col && col.length >= 3) set(idx, col[0] | 0, col[1] | 0, col[2] | 0);
        }
      }
    } else if (typeof customColors === 'object') {
      // map index -> [r,g,b]
      for (const [k, v] of Object.entries(customColors)) {
        const idx = parseInt(k, 10);
        if (isNaN(idx) || idx < 0 || idx >= PALETTE_SIZE) continue;
        if (Array.isArray(v) && v.length >= 3) set(idx, v[0] | 0, v[1] | 0, v[2] | 0);
      }
    }
  }
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
