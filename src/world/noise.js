// Procedural noise texture baker — tiling noise for organic modifier masks
// CPU side generation, baked once, used as tiling repeat texture in shader.
// Simple value noise FBM, deterministic, seeded.

function hash2i(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 700001) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

function valueNoise2D(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smoothstep(xf), v = smoothstep(yf);
  const h00 = hash2i(xi, yi, seed);
  const h10 = hash2i(xi + 1, yi, seed);
  const h01 = hash2i(xi, yi + 1, seed);
  const h11 = hash2i(xi + 1, yi + 1, seed);
  const x1 = lerp(h00, h10, u);
  const x2 = lerp(h01, h11, u);
  return lerp(x1, x2, v);
}

function fbm2D(x, y, seed, octaves = 3) {
  let val = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    val += valueNoise2D(x * freq, y * freq, seed + o * 13) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return norm > 0 ? val / norm : 0;
}

/**
 * Generate tiling noise texture.
 * @param {number} size - width/height (square)
 * @param {number} seed - global seed
 * @returns {{data: Uint8Array, size: number}} RGBA texture
 *  R = low-freq organic blobs (large), G = medium freq, B = high freq detail, A = warped mix
 */
export function generateNoiseTextureData(size = 128, seed = 1337) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // normalized 0..4 tiling domain so texture repeats every size
      const nx = (x / size) * 4.0;
      const ny = (y / size) * 4.0;
      // Low freq large blobs
      const l = fbm2D(nx * 0.7, ny * 0.7, seed, 3);
      // Medium freq
      const m = fbm2D(nx * 1.8, ny * 1.8, seed + 101, 3);
      // High freq detail
      const h = fbm2D(nx * 4.2, ny * 4.2, seed + 202, 2);
      // Warp for extra organic
      const warp = valueNoise2D(nx * 0.5 + l * 1.5, ny * 0.5 + m * 0.5, seed + 303);
      // Additional ridge for puddle-like shapes
      const ridge = 1.0 - Math.abs(2.0 * l - 1.0);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round(l * 255);
      data[idx + 1] = Math.round(m * 255);
      data[idx + 2] = Math.round(h * 255);
      data[idx + 3] = Math.round(((l * 0.4 + m * 0.3 + warp * 0.3) * 0.7 + ridge * 0.3) * 255);
    }
  }
  return { data, size };
}

/**
 * Generate single-channel value noise used for CPU modifier mask (optional).
 */
export function generateValueNoiseField(width, height, seed, scale = 0.18, octaves = 3) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    out[y * width + x] = fbm2D(x * scale, y * scale, seed, octaves);
  }
  return out;
}
