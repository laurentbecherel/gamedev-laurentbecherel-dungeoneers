/**
 * Palette generation for the retro post-processing pass.
 *
 * Pure, deterministic CPU helpers (no WebGL/DOM) that build the colour tables
 * uploaded as textures by the renderer:
 *   - genPalette   → 256-entry RGBA palette for a given style
 *     New layout (doom/default): 2 accent ramps with good banding (brown + natural green,
 *     configurable per level/architecture via opts.accentRamps), then desaturated regulars,
 *     then smooth grayscale.
 *   - genColormap  → per-light-level darkened copies of a palette
 *   - buildRGBToPal→ 32³ RGB→nearest-palette-index lookup table
 */

const PALETTE_SIZE = 256;

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function lerpColor(a, b, t) {
  return [
    Math.floor(a[0] + (b[0] - a[0]) * t),
    Math.floor(a[1] + (b[1] - a[1]) * t),
    Math.floor(a[2] + (b[2] - a[2]) * t)
  ];
}

function genDesaturatedRegulars(count, opts) {
  // opts: { saturation:0.42, saturationVar:0.18, lightnessMin:0.32, lightnessMax:0.84, hueShift:137.5 }
  const satBase = opts?.saturation ?? 0.42;
  const satVar = opts?.saturationVar ?? 0.18;
  const lMin = opts?.lightnessMin ?? 0.32;
  const lMax = opts?.lightnessMax ?? 0.84;
  const hShift = opts?.hueShift ?? 137.5;
  const out = [];
  for (let i = 0; i < count; i++) {
    // golden-angle hue for even distribution, deterministic
    const h = (i * hShift) % 360;
    // saturation: base ± var with simple hash to avoid streaks
    const hash1 = ((i * 37) % 100) / 100; // 0..1
    const s = Math.max(0, Math.min(0.75, satBase + (hash1 - 0.5) * satVar * 2));
    // lightness: sweep through range, with some variation per hue
    const lT = count <= 1 ? 0.5 : (i / (count - 1));
    // use 8 levels with small jitter to avoid perfect ordering
    const level = Math.floor(lT * 8) / 8;
    const jitter = ((i * 13) % 7) / 7 * 0.06 - 0.03;
    const l = Math.max(0.05, Math.min(0.95, lMin + level * (lMax - lMin) + jitter));
    const rgb = hslToRgb(h / 360, s, l);
    out.push(rgb);
  }
  return out;
}

export function genPalette(style = 'doom', opts = null) {
  const pal = new Uint8Array(PALETTE_SIZE * 4);
  function set(i, r, g, b) {
    pal[i * 4] = Math.max(0, Math.min(255, r|0));
    pal[i * 4 + 1] = Math.max(0, Math.min(255, g|0));
    pal[i * 4 + 2] = Math.max(0, Math.min(255, b|0));
    pal[i * 4 + 3] = 255;
  }
  const o = opts || {};
  const customColors = o.customColors || o.overrides || o.paletteOverrides || null;
  const cubeLevels = o.cubeLevels || o.levels || [0, 51, 102, 153, 204, 255];

  if (style === 'grayscale') {
    for (let i = 0; i < 256; i++) set(i, i, i, i);
  } else if (style === 'sepia') {
    for (let i = 0; i < 256; i++) {
      const v = i;
      set(i, Math.min(255, v * 1.2 | 0), Math.min(255, v * 0.9 | 0), Math.min(255, v * 0.6 | 0));
    }
  } else if (style === 'smooth256' || style === 'truecolor-legacy') {
    // old saturated cube + gray for reference
    let idx = 0;
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
      if (idx >= 216) break;
      set(idx, cubeLevels[r], cubeLevels[g], cubeLevels[b]); idx++;
    }
    for (; idx < 256; idx++) {
      const v = Math.floor((idx - 216) * 255 / 39);
      set(idx, v, v, v);
    }
  } else if (style === 'truecolor') {
    // For preview / bypass: show hue gradient (renderer bypasses quant when truecolor)
    for (let i = 0; i < 256; i++) {
      const hue = (i / 256) * 360;
      const c = hslToRgb(hue / 360, 0.75, 0.5);
      set(i, c[0], c[1], c[2]);
    }
  } else {
    // === NEW LAYOUT: 2 accent ramps + desaturated regulars + grayscale ===
    // Resolve accent ramps - 2 by default: classic Doom 48 saturated brown + natural green, configurable per arch/level later
    let accentRamps = o.accentRamps || null;
    if (!accentRamps) {
      const brownSrc = o.brownRamp || o.brownRampConfig || null;
      const greenSrc = o.greenRamp || o.greenRampConfig || null;
      // defaults – keep same 48 brown as doom (more saturated brown/orange)
      const defBrown = { id: 'brown', from: [80, 40, 20], to: [200, 100, 50], count: 48 };
      const defGreen = { id: 'green', from: [18, 48, 26], to: [125, 185, 105], count: 32 };
      let b = brownSrc ? {
        id: brownSrc.id || 'brown',
        from: brownSrc.from || brownSrc.start || defBrown.from,
        to: brownSrc.to || brownSrc.end || defBrown.to,
        count: Math.max(0, Math.min(96, brownSrc.count ?? defBrown.count))
      } : defBrown;
      let g = greenSrc ? {
        id: greenSrc.id || 'green',
        from: greenSrc.from || greenSrc.start || defGreen.from,
        to: greenSrc.to || greenSrc.end || defGreen.to,
        count: Math.max(0, Math.min(96, greenSrc.count ?? defGreen.count))
      } : defGreen;
      accentRamps = [b, g];
    }
    // Ensure counts are ints and limit – default to keeping 48 brown
    accentRamps = accentRamps.map((r, idx) => ({
      id: r.id || (idx === 0 ? 'brown' : 'green'),
      from: r.from || r.start || (idx === 0 ? [80, 40, 20] : [18, 48, 26]),
      to: r.to || r.end || (idx === 0 ? [200, 100, 50] : [125, 185, 105]),
      count: Math.max(0, Math.min(96, (r.count|0) || (idx===0 ? 48 : 32)))
    }));
    const regularCfg = o.regularColors || o.regular || { count: 112, saturation: 0.42 };
    const grayCfg = o.grayscale || o.gray || { count: 64, from: 0, to: 255, gamma: 1.0 };
    let regularCount = Math.max(16, Math.min(192, (regularCfg.count|0) || (regularCfg.count ? regularCfg.count|0 : 112)));
    let grayCount = Math.max(16, Math.min(128, (grayCfg.count|0) || (grayCfg.count === 0 ? 0 : 64)));
    // Adjust to fit 256 if sum mismatch
    const accentTotal = accentRamps.reduce((s, r) => s + r.count, 0);
    let remaining = PALETTE_SIZE - accentTotal;
    if (remaining < 0) {
      // Shrink accents proportionally
      const factor = PALETTE_SIZE / accentTotal;
      let cur = 0;
      for (let r of accentRamps) { r.count = Math.max(0, Math.floor(r.count * factor)); cur += r.count; }
      // fill rest to 256 with regular+gray, but if accents already fill all, set others 0
      regularCount = 0; grayCount = PALETTE_SIZE - cur;
      remaining = grayCount;
    } else {
      // Fit regular+gray into remaining, keep ratio
      const rgTotal = regularCount + grayCount;
      if (rgTotal > remaining) {
        const f = remaining / rgTotal;
        regularCount = Math.floor(regularCount * f);
        grayCount = remaining - regularCount;
      } else if (rgTotal < remaining) {
        // Expand gray to fill
        grayCount = remaining - regularCount;
      }
    }

    let idx = 0;
    // 1) Accent ramps – each with good gradient for banding demo
    for (const ramp of accentRamps) {
      const from = ramp.from, to = ramp.to, cnt = ramp.count;
      if (cnt <= 0) continue;
      for (let j = 0; j < cnt; j++) {
        if (idx >= PALETTE_SIZE) break;
        const t = cnt <= 1 ? 0 : j / (cnt - 1);
        // linear lerp, but could add slight ease for nicer perceptual gradient
        const col = lerpColor(from, to, t);
        set(idx, col[0], col[1], col[2]);
        idx++;
      }
    }
    // 2) Regular desaturated variations
    const regularColors = genDesaturatedRegulars(regularCount, regularCfg);
    for (let k = 0; k < regularColors.length && idx < PALETTE_SIZE; k++) {
      const c = regularColors[k];
      // Stop before grayscale start if we need to reserve grayCount
      if (idx >= PALETTE_SIZE - grayCount) break;
      set(idx, c[0], c[1], c[2]);
      idx++;
    }
    // 3) Grayscale – nice smooth gradient
    const gFrom = grayCfg.from ?? 0;
    const gTo = grayCfg.to ?? 255;
    const gGamma = grayCfg.gamma ?? 1.0;
    const gCountFinal = PALETTE_SIZE - idx;
    for (let j = 0; j < gCountFinal; j++) {
      const t = gCountFinal <= 1 ? 0 : j / (gCountFinal - 1);
      const tGamma = gGamma === 1 ? t : Math.pow(t, 1 / gGamma);
      const v = Math.floor(gFrom + tGamma * (gTo - gFrom));
      set(idx, v, v, v);
      idx++;
    }
    // Safety fill if any gaps
    while (idx < PALETTE_SIZE) { set(idx, idx, idx, idx); idx++; }
  }

  // Apply custom per-index overrides (array of [r,g,b] or {index, color} or map)
  if (customColors) {
    if (Array.isArray(customColors)) {
      for (let i = 0; i < customColors.length; i++) {
        const entry = customColors[i];
        if (!entry) continue;
        if (Array.isArray(entry) && entry.length >= 3 && typeof entry[0] === 'number') {
          if (i < PALETTE_SIZE) set(i, entry[0]|0, entry[1]|0, entry[2]|0);
        } else if (entry && typeof entry === 'object' && 'index' in entry) {
          const ii = entry.index|0;
          const col = entry.color || entry.rgb;
          if (ii >= 0 && ii < PALETTE_SIZE && col && col.length >= 3) set(ii, col[0]|0, col[1]|0, col[2]|0);
        }
      }
    } else if (typeof customColors === 'object') {
      for (const [k, v] of Object.entries(customColors)) {
        const ii = parseInt(k, 10);
        if (isNaN(ii) || ii < 0 || ii >= PALETTE_SIZE) continue;
        if (Array.isArray(v) && v.length >= 3) set(ii, v[0]|0, v[1]|0, v[2]|0);
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
