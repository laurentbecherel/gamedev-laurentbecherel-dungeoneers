import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;
const SRC_DIR = path.join(__dirname, '..');
const ASSETS_DIR = path.join(SRC_DIR, 'assets');

async function loadAssetFile(category, name) {
  const fp = path.join(ASSETS_DIR, category, name + '.json');
  try { return JSON.parse(await fs.readFile(fp, 'utf8')); } catch { return null; }
}
async function saveAssetFile(category, name, data) {
  const fp = path.join(ASSETS_DIR, category, name + '.json');
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data, null, 2), 'utf8');
}
function countItems(data) {
  if (!data || typeof data !== 'object') return 0;
  if (Array.isArray(data)) return data.length;
  for (const v of Object.values(data)) if (Array.isArray(v)) return v.length;
  return Object.keys(data).length;
}
async function listAssets() {
  const out = [];
  try {
    const categories = await fs.readdir(ASSETS_DIR, { withFileTypes: true });
    for (const dirent of categories) {
      if (!dirent.isDirectory()) continue;
      const cat = dirent.name; const dir = path.join(ASSETS_DIR, cat);
      try {
        for (const f of await fs.readdir(dir)) {
          if (!f.endsWith('.json')) continue;
          const name = f.slice(0, -5);
          const data = await loadAssetFile(cat, name);
          out.push({ category: cat, name, path: cat + '/' + name + '.json', itemCount: countItems(data) });
        }
      } catch {}
    }
  } catch {}
  return out;
}
function ctype(fp) { const e = path.extname(fp).toLowerCase(); const m = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }; return m[e] || 'application/octet-stream'; }
function safe(s) { return /^[a-zA-Z0-9_-]+$/.test(s); }

async function handleApi(req, res, pathname) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
  let jb = null; if (body) { try { jb = JSON.parse(body); } catch { if (!res.headersSent) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid JSON' })); } return true; } }

  if (pathname === '/api/assets' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(await listAssets())); return true;
  }
  const m = pathname.match(/^\/api\/assets\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const cat = m[1], name = m[2];
    if (!safe(cat) || !safe(name)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid category or name' })); return true; }
    if (req.method === 'GET') {
      const data = await loadAssetFile(cat, name);
      if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Asset not found' })); return true; }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); return true;
    }
    if (req.method === 'PUT') {
      if (!jb) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Body required' })); return true; }
      await saveAssetFile(cat, name, jb);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true })); return true;
    }
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://' + req.headers.host); const pathname = url.pathname;
    if (pathname.startsWith('/api/')) { const h = await handleApi(req, res, pathname); if (h) return; if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); } return; }
    let fp = path.join(SRC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1)); const sp = path.normalize(fp);
    if (!sp.startsWith(path.normalize(SRC_DIR))) { if (!res.headersSent) { res.writeHead(403); res.end('Forbidden'); } return; }
    try { const st = await fs.stat(sp); fp = st.isDirectory() ? path.join(sp, 'index.html') : sp; } catch { fp = sp; }
    try { const data = await fs.readFile(fp); if (!res.headersSent) { res.writeHead(200, { 'Content-Type': ctype(fp) }); res.end(data); } } catch { if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found'); } }
  } catch (e) { console.error('Server error:', e); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Internal server error' })); } }
});
server.listen(PORT, () => console.log('Dungeoneers server running at http://localhost:' + PORT));
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
