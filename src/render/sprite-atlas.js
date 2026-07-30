// Sprite atlas registry + WebGL texture loader — Task 6
// Central registry for PBR billboard sprites (torches, braziers, etc).
// Each sprite ID -> SpriteMeta describing atlas layout + PBR paths + sizing + material.
// Textures uploaded on demand and cached per GL context via WeakMap so multiple
// canvases don't clash. Placeholder magenta / neutral normal / neutral ORM keep
// rendering alive even when PNGs missing (no artist assets yet).

const registry = new Map(); // id -> meta
const glCaches = new WeakMap(); // gl -> Map(id -> entry)

export function registerSprite(id, meta) {
  registry.set(id, { id, ...meta });
}

export function getSprite(id) {
  return registry.get(id) || null;
}

export function listSprites() {
  return Array.from(registry.keys());
}

export function hasSprite(id) {
  return registry.has(id);
}

function getGLCache(gl) {
  let m = glCaches.get(gl);
  if (!m) { m = new Map(); glCaches.set(gl, m); }
  return m;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function createGLTex(gl, img, filter = gl.LINEAR) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  return tex;
}

function placeholderTex(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const px = new Uint8Array([255, 0, 255, 255]); // magenta = missing
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return tex;
}

function neutralNormalTex(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const px = new Uint8Array([128, 128, 255, 255]); // neutral normal facing +Z
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return tex;
}

function neutralORMTex(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // ORM: R=AO 1, G=rough 0.85, B=metal 0
  const px = new Uint8Array([255, 217, 0, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return tex;
}

// Procedural fallback: generate small torch flame texture on canvas when PNGs missing
// This not requires external assets and gives visible flame instead of pure magenta.
function proceduralTorchAlbedo(gl) {
  try {
    if (typeof document === 'undefined') return placeholderTex(gl);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return placeholderTex(gl);
    // Gradient flame: bottom dark wood, top bright flame
    ctx.clearRect(0, 0, 64, 64);
    const grad = ctx.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, '#22160a');
    grad.addColorStop(0.35, '#4a2510');
    grad.addColorStop(0.55, '#a65d20');
    grad.addColorStop(0.75, '#ff8c21');
    grad.addColorStop(1, '#ffe9a8');
    ctx.fillStyle = grad;
    ctx.fillRect(18, 4, 28, 48);
    // Add little sparkle noise
    ctx.fillStyle = 'rgba(255,255,200,0.35)';
    for (let i = 0; i < 16; i++) {
      const x = 20 + Math.random() * 24;
      const y = 6 + Math.random() * 28;
      ctx.fillRect(x, y, 2, 2);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return tex;
  } catch {
    return placeholderTex(gl);
  }
}

function proceduralAlbedoForType(gl, type) {
  try {
    if (type === 'torch') return proceduralTorchAlbedo(gl);
    if (typeof document === 'undefined') return placeholderTex(gl);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return placeholderTex(gl);
    ctx.clearRect(0, 0, 64, 64);

    if (type === 'brazier') {
      const grad = ctx.createLinearGradient(0, 64, 0, 0);
      grad.addColorStop(0, '#0d0d0d');
      grad.addColorStop(0.25, '#2a1a0f');
      grad.addColorStop(0.5, '#6b3a18');
      grad.addColorStop(0.75, '#d86a18');
      grad.addColorStop(0.9, '#ff9a32');
      grad.addColorStop(1, '#ffdd88');
      ctx.fillStyle = grad;
      ctx.fillRect(10, 6, 44, 44);
      ctx.fillStyle = 'rgba(255,220,120,0.3)';
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(14 + Math.random() * 36, 8 + Math.random() * 24, 2, 2);
      }
    } else if (type === 'crystal') {
      const grad = ctx.createLinearGradient(0, 64, 0, 0);
      grad.addColorStop(0, '#0a1230');
      grad.addColorStop(0.35, '#2a1e6a');
      grad.addColorStop(0.65, '#6a4fde');
      grad.addColorStop(0.85, '#8ec8ff');
      grad.addColorStop(1, '#d0f0ff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(32, 4);
      ctx.lineTo(50, 28);
      ctx.lineTo(44, 56);
      ctx.lineTo(20, 56);
      ctx.lineTo(14, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(180,220,255,0.5)';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(22 + Math.random() * 20, 12 + Math.random() * 28, 2, 2);
      }
    } else if (type === 'lantern') {
      const grad = ctx.createLinearGradient(0, 64, 0, 0);
      grad.addColorStop(0, '#1a160a');
      grad.addColorStop(0.3, '#3d3218');
      grad.addColorStop(0.6, '#8a6a28');
      grad.addColorStop(0.8, '#d4b14a');
      grad.addColorStop(1, '#fff2b0');
      ctx.fillStyle = grad;
      ctx.fillRect(18, 10, 28, 42);
      ctx.strokeStyle = '#2a2210';
      ctx.lineWidth = 2;
      ctx.strokeRect(18, 10, 28, 42);
    } else {
      return proceduralTorchAlbedo(gl);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return tex;
  } catch {
    return placeholderTex(gl);
  }
}

export function getSpriteFallbackType(id) {
  if (id.includes('brazier')) return 'brazier';
  if (id.includes('crystal')) return 'crystal';
  if (id.includes('lantern')) return 'lantern';
  return 'torch';
}

/**
 * Load and upload PBR textures for sprite ID. Idempotent, cached per GL.
 * Never throws to break render; falls back to procedural/placeholder.
 */
export async function loadSpriteGL(gl, id) {
  const cache = getGLCache(gl);
  if (cache.has(id)) return cache.get(id);

  const meta = registry.get(id);
  if (!meta) {
    console.warn(`[sprite-atlas] not registered: ${id}`);
    return null;
  }

  const entry = { albedo: null, normal: null, orm: null, height: null, meta, loaded: false };
  cache.set(id, entry);

  // Placeholders immediately so rendering works before async load — now procedural for all types, no magenta unless truly missing
  const fallbackType = getSpriteFallbackType(id);
  entry.albedo = proceduralAlbedoForType(gl, fallbackType);
  entry.normal = neutralNormalTex(gl);
  entry.orm = neutralORMTex(gl);
  entry.height = neutralNormalTex(gl);

  const tryLoad = async (paths) => {
    if (!paths) return null;
    const list = Array.isArray(paths) ? paths : [paths];
    for (const src of list) {
      try { return await loadImage(src); } catch {}
    }
    return null;
  };

  try {
    const albedoImg = await tryLoad(meta.path);
    if (albedoImg) {
      try { gl.deleteTexture(entry.albedo); } catch {}
      entry.albedo = createGLTex(gl, albedoImg, gl.LINEAR);
    }
    const normalImg = await tryLoad(meta.normalPath);
    if (normalImg) {
      try { gl.deleteTexture(entry.normal); } catch {}
      entry.normal = createGLTex(gl, normalImg, gl.LINEAR);
    }
    const ormImg = await tryLoad(meta.ormPath || meta.roughMetalPath);
    if (ormImg) {
      try { gl.deleteTexture(entry.orm); } catch {}
      entry.orm = createGLTex(gl, ormImg, gl.LINEAR);
    }
    const heightImg = await tryLoad(meta.heightPath);
    if (heightImg) {
      try { gl.deleteTexture(entry.height); } catch {}
      entry.height = createGLTex(gl, heightImg, gl.LINEAR);
    }
    entry.loaded = true;
  } catch (e) {
    console.warn(`[sprite-atlas] failed to load ${id}`, e);
  }
  return entry;
}

export function getSpriteTextures(gl, id) {
  const m = glCaches.get(gl);
  return m ? (m.get(id) || null) : null;
}

export async function preloadSpritesGL(gl, ids) {
  const ps = ids.map(id => loadSpriteGL(gl, id).catch(() => null));
  await Promise.all(ps);
}

export function clearSpriteCache(gl) {
  const m = glCaches.get(gl);
  if (!m) return;
  for (const entry of m.values()) {
    try {
      if (entry.albedo) gl.deleteTexture(entry.albedo);
      if (entry.normal) gl.deleteTexture(entry.normal);
      if (entry.orm) gl.deleteTexture(entry.orm);
      if (entry.height) gl.deleteTexture(entry.height);
    } catch {}
  }
  m.clear();
}
