import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Live-edit: SSE client set and broadcast helper
const sseClients = new Set();

function broadcastAssetUpdate(category, name) {
  const payload = JSON.stringify({
    type: 'asset-updated',
    category,
    name,
    path: `${category}/${name}`,
    timestamp: Date.now()
  });
  const msg = `event: asset-updated\ndata: ${payload}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(msg);
    } catch {
      try { sseClients.delete(res); } catch {}
    }
  }
}

const PORT = process.env.PORT || 8000;
const SRC_DIR = path.join(__dirname, '..');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');

async function loadAssetFile(category, name) {
  // category may include subfolders: config/rendering, config/lighting etc
  const fp = path.join(ASSETS_DIR, category, name + '.json');
  const normalized = path.normalize(fp);
  if (!normalized.startsWith(path.normalize(ASSETS_DIR))) return null;
  try { return JSON.parse(await fs.readFile(normalized, 'utf8')); } catch { return null; }
}
async function _saveAssetFileImpl(category, name, data) {
  const fp = path.join(ASSETS_DIR, category, name + '.json');
  const normalized = path.normalize(fp);
  if (!normalized.startsWith(path.normalize(ASSETS_DIR))) throw new Error('Path traversal');
  await fs.mkdir(path.dirname(normalized), { recursive: true });
  await fs.writeFile(normalized, JSON.stringify(data, null, 2), 'utf8');
}

async function saveAssetFile(category, name, data) {
  _assetListCache = null;
  return _saveAssetFileImpl(category, name, data);
}


function countItems(data) {
  if (!data || typeof data !== 'object') return 0;
  if (Array.isArray(data)) return data.length;
  for (const v of Object.values(data)) if (Array.isArray(v)) return v.length;
  return Object.keys(data).length;
}
async function walkJsonFiles(dir, baseRel) {
  // Recursive scan returning [{fullPath, relCategory, name}]
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = await walkJsonFiles(fp, path.join(baseRel, ent.name));
      out.push(...sub);
    } else if (ent.isFile() && ent.name.endsWith('.json')) {
      const name = ent.name.slice(0, -5);
      const category = baseRel; // e.g. config/rendering
      out.push({ fullPath: fp, relCategory: category, name, fileName: ent.name });
    }
  }
  return out;
}
let _assetListCache = null;
let _assetListCacheTime = 0;
const ASSET_CACHE_TTL_MS = 5000;

async function listAssets() {
  const now = Date.now();
  if (_assetListCache && (now - _assetListCacheTime) < ASSET_CACHE_TTL_MS) return _assetListCache;
  const out = [];
  try {
    const all = await walkJsonFiles(ASSETS_DIR, '');
    const promises = all.map(async (entry) => {
      const rel = entry.relCategory.replace(/\\/g, '/');
      if (!rel) return null;
      const lower = rel.toLowerCase();
      if (lower.includes('node_modules') || rel.startsWith('.') || lower.includes('screenshot')) return null;
      return {
        category: rel,
        name: entry.name,
        path: rel + '/' + entry.name + '.json',
        fullPath: rel + '/' + entry.fileName,
        itemCount: 0
      };
    });
    const resolved = await Promise.all(promises);
    for (const r of resolved) if (r) out.push(r);
    _assetListCache = out;
    _assetListCacheTime = now;
  } catch (e) {
    console.error('listAssets error', e);
  }
  return out;
}


function ctype(fp) { const e = path.extname(fp).toLowerCase(); const m = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }; return m[e] || 'application/octet-stream'; }
function safeSegment(s) { return /^[a-zA-Z0-9_-]+$/.test(s); }
function safeCategory(catPath) {
  // catPath may contain slashes, each segment must be safe
  if (!catPath) return false;
  const parts = catPath.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(safeSegment);
}
function safeName(name) { return safeSegment(name); }

function handleWatch(req, res) {
  // SSE endpoint for live-edit: GET /api/watch or /api/assets/watch
  if (req.method !== 'GET') {
    if (!res.headersSent) { res.writeHead(405, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Method not allowed' })); }
    return true;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Accel-Buffering': 'no'
  });
  // Send initial connected comment
  try { res.write(`: connected ${Date.now()}\n\n`); } catch {}
  sseClients.add(res);
  const hb = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch { clearInterval(hb); try { sseClients.delete(res); } catch {} }
  }, 25000);
  const cleanup = () => { clearInterval(hb); try { sseClients.delete(res); } catch {} };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
  return true;
}

async function handleApi(req, res, pathname) {
  // SSE watch endpoint
  if (pathname === '/api/watch' || pathname === '/api/assets/watch') {
    return handleWatch(req, res);
  }
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
  let jb = null; if (body) { try { jb = JSON.parse(body); } catch { if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); } return true; } }

  if (pathname === '/api/assets' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await listAssets())); return true;
  }
  // New: support /api/assets/<category path>/<name> where category may include slashes
  // e.g. /api/assets/config/rendering/pom, /api/assets/materials/walls
  const apiPrefix = '/api/assets/';
  if (pathname.startsWith(apiPrefix)) {
    const rest = pathname.slice(apiPrefix.length); // e.g. config/rendering/pom
    const parts = rest.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const name = parts[parts.length - 1];
      const cat = parts.slice(0, -1).join('/');
      if (!safeCategory(cat) || !safeName(name)) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid category or name: ' + cat + '/' + name })); return true;
      }
      if (req.method === 'GET') {
        const data = await loadAssetFile(cat, name);
        if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Asset not found: ' + cat + '/' + name })); return true; }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); return true;
      }
      if (req.method === 'PUT') {
        if (!jb) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Body required' })); return true; }
        await saveAssetFile(cat, name, jb);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true }));
        // Live-edit: broadcast after response (don't block)
        try { broadcastAssetUpdate(cat, name); } catch (e) { console.warn('SSE broadcast failed', e); }
        return true;
      }
    }
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + req.headers.host); const pathname = url.pathname;
    // Favicon is requested by browsers automatically — return 204 to avoid console 404 noise
    if (pathname === '/favicon.ico' || pathname === '/favicon.png') {
      if (!res.headersSent) { res.writeHead(204); res.end(); }
      return;
    }
    if (pathname.startsWith('/api/')) { const h = await handleApi(req, res, pathname); if (h) return; if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); } return; }
    let fp = path.join(SRC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1)); const sp = path.normalize(fp);
    if (!sp.startsWith(path.normalize(SRC_DIR))) { if (!res.headersSent) { res.writeHead(403); res.end('Forbidden'); } return; }
    try { const st = await fs.stat(sp); fp = st.isDirectory() ? path.join(sp, 'index.html') : sp; } catch { fp = sp; }
    try { const data = await fs.readFile(fp); if (!res.headersSent) { res.writeHead(200, { 'Content-Type': ctype(fp) }); res.end(data); } } catch { if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); } }
  } catch (e) { console.error('Server error:', e); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Internal server error' })); } }
});

// --- Robust startup with EADDRINUSE handling ---
function parsePort(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 65535 ? n : null;
}
const DEFAULT_PORT = 8000;
let initialPort = parsePort(PORT) ?? DEFAULT_PORT;
let attemptedPort = initialPort;

function printAddrInUseHelp(port, err) {
  console.error(`\n[server] Port ${port} already in use (EADDRINUSE).`);
  console.error(`[server] Another Dungeoneers server or process is listening on ${port}.`);
  console.error(`[server] Fix options:`);
  console.error(`  PowerShell: $env:PORT=8001; npm start`);
  console.error(`  Bash/Unix:  PORT=8001 npm start`);
  console.error(`  Or find & kill:`);
  console.error(`    Windows: netstat -ano | findstr :${port}  -> taskkill /PID <pid> /F`);
  console.error(`    Unix:    lsof -i :${port}  -> kill <pid>`);
  if (err) console.error(`[server] Original error: ${err.message}`);
}

async function tryListen(port, maxRetries = 10) {
  // Attach error handler BEFORE listen to avoid unhandled 'error' event (Node throws if no listener)
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('error', onError);
      if (err && err.code === 'EADDRINUSE') {
        printAddrInUseHelp(port, err);
        // If user explicitly set PORT env, don't auto-try next ports - respect explicit choice but exit cleanly
        const userSetPort = process.env.PORT != null && String(process.env.PORT).trim() !== '';
        if (userSetPort) {
          console.error(`[server] PORT env was explicitly set to ${port}, not auto-retrying. Use a different PORT or free ${port}.`);
          reject(err);
          return;
        }
        if (port - initialPort < maxRetries) {
          const next = port + 1;
          console.warn(`[server] Trying next port ${next}...`);
          tryListen(next, maxRetries).then(resolve).catch(reject);
        } else {
          console.error(`[server] All ports ${initialPort}..${port} are busy. Free a port or set PORT env.`);
          reject(err);
        }
      } else if (err && err.code === 'EACCES') {
        console.error(`[server] Permission denied for port ${port} (EACCES). Try a higher port >=1024.`);
        reject(err);
      } else {
        console.error(`[server] Failed to start:`, err);
        reject(err);
      }
    };

    server.once('error', onError);

    server.listen(port, () => {
      server.off('error', onError);
      attemptedPort = port;
      console.log(`Dungeoneers server running at http://localhost:${port}`);
      if (port !== initialPort) {
        console.log(`[server] Note: default ${initialPort} was busy, using ${port} instead.`);
        console.log(`[server] Update browser URL to http://localhost:${port}/game.html`);
      }
      resolve(port);
    });
  });
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[server] Received ${signal}, shutting down...`);
  // Close SSE clients
  for (const res of [...sseClients]) {
    try { res.end(); } catch {}
  }
  sseClients.clear();
  try {
    server.close(() => {
      console.log('[server] Closed.');
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
  // Force exit if close hangs
  setTimeout(() => { console.warn('[server] Force exit after timeout'); process.exit(0); }, 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => { console.error('[server] uncaughtException', e); shutdown('uncaughtException'); });
process.on('unhandledRejection', (e) => { console.error('[server] unhandledRejection', e); });

tryListen(initialPort).catch(() => { process.exit(1); });

