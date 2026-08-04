import { getAssetList, getAsset, saveAsset } from "./config/config.js";
import { getLiveConfigManager } from "./config/live-config.js";

const $ = id => document.getElementById(id);
let current = null, currentData = null, lastSavedData = null, mode = "visual";
const collapsed = new Set();

function clone(o){ try { return JSON.parse(JSON.stringify(o)); } catch { return o; } }
function deepEqual(a,b){ try { return JSON.stringify(a)===JSON.stringify(b); } catch { return false; } }

function status(msg, type = "ok") {
  const el = $("status-area"); if (!el) return; el.innerHTML = `<span class="status-pill ${type}">${msg}</span>`;
  setTimeout(() => { if (el.innerHTML.includes(msg)) el.innerHTML = ""; }, 3500);
}

function getRawDocEntry(fullPath) {
  try {
    const data = currentData;
    if (!data || !data.docs) return null;
    let parts = fullPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    if (parts[0] === 'modifiers') parts = parts.slice(1);
    let cur = data.docs;
    for (let p of parts) {
      if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
      else return null;
    }
    return cur;
  } catch { return null; }
}
function getUiEntry(fullPath) {
  const containers = ['ui', 'ranges', 'schema', 'editor', '_ui', '_schema'];
  for (const cname of containers) {
    try {
      if (!currentData || !currentData[cname]) continue;
      for (const strip of [true, false]) {
        let parts = fullPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
        if (strip && parts[0] === 'modifiers') parts = parts.slice(1);
        let cur = currentData[cname];
        let ok = true;
        for (const p of parts) {
          if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
          else { ok = false; break; }
        }
        if (ok && cur && typeof cur === 'object' && ('min' in cur || 'max' in cur || 'desc' in cur || 'description' in cur || 'type' in cur || 'options' in cur || 'labels' in cur)) {
          return cur;
        }
      }
    } catch {}
  }
  return null;
}
function getSchemaForPath(fullPath) {
  const docEntry = getRawDocEntry(fullPath);
  const uiEntry = getUiEntry(fullPath);
  const merged = {};
  if (typeof docEntry === 'string') {
    merged.desc = docEntry;
  } else if (docEntry && typeof docEntry === 'object') {
    merged.desc = docEntry.desc || docEntry.description || docEntry.text || null;
    if ('min' in docEntry) merged.min = docEntry.min;
    if ('max' in docEntry) merged.max = docEntry.max;
    if ('step' in docEntry) merged.step = docEntry.step;
  }
  if (uiEntry) {
    if (uiEntry.desc || uiEntry.description) merged.desc = merged.desc || uiEntry.desc || uiEntry.description;
    if ('min' in uiEntry) merged.min = uiEntry.min;
    if ('max' in uiEntry) merged.max = uiEntry.max;
    if ('step' in uiEntry) merged.step = uiEntry.step;
  }
  if (!merged.desc && !('min' in merged) && !('max' in merged) && !('step' in merged)) return null;
  return merged;
}
function getDocForPath(fullPath) {
  const schema = getSchemaForPath(fullPath);
  return schema?.desc || null;
}
function formatLabel(s) { return s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function iconFor(name, isFolder) { if (isFolder) return "ph-folder"; const ext = name.split(".").pop(); const m = { json: "ph-file-code", md: "ph-file-text", png: "ph-file-png", jpg: "ph-file-jpg", js: "ph-file-js", css: "ph-file-css", html: "ph-file-html" }; return m[ext] || "ph-file"; }

function debounce(fn, delay){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); }; }

// Live-edit state
const liveManager = getLiveConfigManager();
let autoSaveEnabled = true;
let liveEnabled = false;

function getLiveToggleEls(){
  return { live: $('toggle-live'), auto: $('toggle-autosave'), status: $('live-status') };
}

function updateLiveStatusPill(s) {
  const el = $('live-status'); if (!el) return;
  el.className = 'status-pill';
  const map = {
    'offline': ['offline', 'warn'],
    'connecting': ['connecting...', 'warn'],
    'connected': ['live ✓', 'ok'],
    'bc-only': ['bc only', 'ok'],
    'polling': ['polling', 'warn']
  };
  const [txt, cls] = map[s] || [s, 'warn'];
  el.textContent = txt;
  el.classList.add(cls);
  // title for tooltip
  el.title = `Live manager status: ${s}. Tab ${liveManager.tabId}`;
}

function initLiveUI() {
  const { live, auto, status: statusEl } = getLiveToggleEls();
  if (!live || !auto) return;
  try {
    const lsLive = localStorage.getItem('dungeoneers-live-enabled');
    const lsAuto = localStorage.getItem('dungeoneers-live-autosave');
    liveEnabled = lsLive === null ? true : lsLive === '1'; // default true for editor
    autoSaveEnabled = lsAuto === null ? true : lsAuto === '1';
  } catch {
    liveEnabled = true; autoSaveEnabled = true;
  }
  live.checked = liveEnabled;
  auto.checked = autoSaveEnabled;
  if (liveEnabled) { try { liveManager.enable(); } catch {} } else { try { liveManager.disable(); } catch {} }

  liveManager.onStatus(updateLiveStatusPill);
  updateLiveStatusPill(liveManager.getStatus());

  live.onchange = () => {
    liveEnabled = live.checked;
    try { localStorage.setItem('dungeoneers-live-enabled', liveEnabled ? '1' : '0'); } catch {}
    if (liveEnabled) { liveManager.enable(); status('Live ON', 'ok'); }
    else { liveManager.disable(); status('Live OFF', 'warn'); updateLiveStatusPill('offline'); }
  };
  auto.onchange = () => {
    autoSaveEnabled = auto.checked;
    try { localStorage.setItem('dungeoneers-live-autosave', autoSaveEnabled ? '1' : '0'); } catch {}
    status(autoSaveEnabled ? 'Auto Save ON' : 'Preview only (no disk)', autoSaveEnabled ? 'ok' : 'warn');
  };

  // Subscribe to external changes for current file handling
  liveManager.subscribe('*', async ({ category, name, data, source }) => {
    if (!current) return;
    if (category !== current.category || name !== current.name) return;
    // Ignore if same as currentData (self echo already applied)
    if (deepEqual(data, currentData)) return;
    // If we have unsaved preview pending and source is sse (someone else saved), prompt
    const isDirty = !deepEqual(currentData, lastSavedData);
    if (isDirty) {
      status(`External change ${category}/${name} — reload?`, 'warn');
      // Show small banner? For MVP just status, and add reload button in title?
      const titleEl = $('editor-title');
      if (titleEl && !titleEl.querySelector('.ext-change')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-secondary ext-change';
        btn.textContent = 'Reload external';
        btn.style.marginLeft = '12px';
        btn.onclick = async () => {
          currentData = clone(data);
          lastSavedData = clone(data);
          render();
          status('External reloaded', 'ok');
          btn.remove();
        };
        titleEl.appendChild(btn);
      }
    } else {
      // Auto reload
      currentData = clone(data);
      lastSavedData = clone(data);
      render();
      status(`External update ${name} applied`, 'ok');
    }
  });
}

// Debounced save for live mode
const debouncedLiveSave = debounce(async () => {
  if (!current || !currentData) return;
  if (!liveEnabled || !autoSaveEnabled) return;
  try {
    const el = $('live-status');
    if (el) { el.textContent = 'syncing...'; el.className = 'status-pill warn'; }
    const ok = await saveAsset(current.category, current.name, currentData);
    if (ok) {
      lastSavedData = clone(currentData);
      status('Live saved', 'ok');
      liveManager.publishAssetUpdated(current.category, current.name);
      // status pill will go back to connected via SSE echo or after save
      setTimeout(() => updateLiveStatusPill(liveManager.getStatus()), 500);
    } else {
      status('Live save failed', 'err');
      updateLiveStatusPill(liveManager.getStatus());
    }
  } catch (e) {
    status('Live save error', 'err');
    updateLiveStatusPill(liveManager.getStatus());
  }
}, 350);

function triggerLiveChange() {
  if (!liveEnabled || !current || !currentData) return;
  // Broadcast via BC instant
  try {
    liveManager.publishPreview(current.category, current.name, currentData, { source: 'editor' });
    // update path cache in memory for fast immediate? liveManager already does setPathCache for receivers, but not for editor's own getAsset? we have currentData already
  } catch (e) { console.warn('live preview failed', e); }
  if (autoSaveEnabled) {
    debouncedLiveSave();
  } else {
    status('Preview (unsaved)', 'warn');
  }
}

async function init() {
  initLiveUI();
  const list = await getAssetList();
  const tree = $("asset-tree"); if (!tree) return; tree.innerHTML = "";

  const root = { name: 'assets', children: new Map(), files: [] };
  for(const a of list){
    const parts = a.category.split('/');
    let cur = root;
    for(const part of parts){
      if(!cur.children.has(part)){
        cur.children.set(part, { name: part, children: new Map(), files: [], fullPath: (cur.fullPath ? cur.fullPath + '/' + part : part) });
      }
      cur = cur.children.get(part);
      if(!cur.fullPath) cur.fullPath = parts.slice(0, parts.indexOf(part)+1).join('/');
    }
    cur.files.push(a);
  }

  const rootEl = document.createElement("div"); rootEl.className = "tree-node";
  const rootHdr = document.createElement("div"); rootHdr.className = "tree-folder";
  rootHdr.innerHTML = `<span class="tree-chevron">▼</span><i class="ph ph-folder tree-icon"></i><span>assets</span>`;
  const rootBody = document.createElement("div"); rootBody.className = "tree-children";
  let rootOpen = true;
  rootHdr.onclick = () => { rootOpen = !rootOpen; rootHdr.querySelector(".tree-chevron").textContent = rootOpen ? "▼" : "▶"; rootBody.style.display = rootOpen ? "" : "none"; };
  rootEl.appendChild(rootHdr); rootEl.appendChild(rootBody); tree.appendChild(rootEl);

  function renderFolder(node, container, depth){
    const sortedFolders = [...node.children.values()].sort((a,b)=>a.name.localeCompare(b.name));
    for(const child of sortedFolders){
      const catPath = child.fullPath;
      const folder = document.createElement("div"); folder.className = "tree-node";
      const hdr = document.createElement("div"); hdr.className = "tree-folder";
      hdr.style.paddingLeft = (20 + depth*12) + "px";
      const isCol = collapsed.has(catPath);
      hdr.innerHTML = `<span class="tree-chevron">${isCol ? "▶" : "▼"}</span><i class="ph ph-folder tree-icon"></i><span>${formatLabel(child.name)}</span>`;
      const body = document.createElement("div"); body.className = "tree-children"; body.style.display = isCol ? "none" : "";
      hdr.onclick = () => {
        const nowCol = body.style.display !== "none";
        body.style.display = nowCol ? "none" : "";
        hdr.querySelector(".tree-chevron").textContent = nowCol ? "▶" : "▼";
        nowCol ? collapsed.add(catPath) : collapsed.delete(catPath);
      };
      folder.appendChild(hdr); folder.appendChild(body);
      renderFolder(child, body, depth+1);
      child.files.sort((a,b)=>a.name.localeCompare(b.name)).forEach(a => {
        const item = document.createElement("div");
        item.className = "tree-file"; item.dataset.cat = a.category; item.dataset.name = a.name;
        item.style.paddingLeft = (40 + depth*12) + "px";
        item.innerHTML = `<i class="ph ${iconFor(a.name + ".json")} tree-icon"></i>${a.name}.json<span style="margin-left:auto;opacity:.35;font-size:11px">${a.itemCount}</span>`;
        item.onclick = e => { e.stopPropagation(); selectAsset(a.category, a.name, item); };
        body.appendChild(item);
      });
      container.appendChild(folder);
    }
  }

  renderFolder(root, rootBody, 0);

  const first = tree.querySelector(".tree-file"); if (first) first.click();
  const btnSave = $("btn-save");
  if (btnSave) btnSave.onclick = saveCurrent;

  const resizer = $("sidebar-resizer"), sidebar = $("sidebar");
  let dragging = false;
  if (resizer && sidebar) {
    resizer.onmousedown = e => { dragging = true; document.body.style.cursor = "col-resize"; e.preventDefault(); };
    document.onmousemove = e => { if (!dragging) return; const w = Math.max(180, Math.min(480, e.clientX)); sidebar.style.width = w + "px"; };
    document.onmouseup = () => { dragging = false; document.body.style.cursor = ""; };
  }

  try { window.EditorLive = { liveManager, getCurrent: ()=>({current, currentData}), triggerLiveChange }; } catch {}
}

async function selectAsset(cat, name, el) {
  document.querySelectorAll(".tree-file").forEach(i => i.classList.remove("active"));
  if (el) el.classList.add("active");
  current = { category: cat, name };
  const titleEl = $("editor-title");
  if (titleEl) titleEl.textContent = `assets / ${cat} / ${name}.json`;
  currentData = await getAsset(cat, name);
  lastSavedData = clone(currentData);
  mode = "visual"; render();
  // Clean external change button
  const title = $('editor-title');
  if (title) { const ext = title.querySelector('.ext-change'); if (ext) ext.remove(); }
}

function render() {
  const panel = $("editor-panel"); if (!panel) return;
  panel.innerHTML = `<div class="tabs"><button class="tab ${mode==='visual'?'active':''}" id="tab-visual">Visual Editor</button><button class="tab ${mode==='raw'?'active':''}" id="tab-raw">Raw JSON</button></div><div id="tab-content"></div>`;
  const tabV = $("tab-visual"), tabR = $("tab-raw");
  if (tabV) tabV.onclick = () => { syncFromUI(); mode = "visual"; render(); };
  if (tabR) tabR.onclick = () => { syncFromUI(); mode = "raw"; render(); };
  if (mode === "visual") renderVisual(); else renderRaw();
}
function isPaletteConfig() {
  return current && current.name === 'palette' && current.category && current.category.includes('rendering');
}

function renderVisual() {
  const c = $("tab-content"); if (!c) return; c.innerHTML = ""; if (!currentData) return;
  if (isPaletteConfig()) {
    const custom = buildPaletteEditor();
    c.appendChild(custom);
  }
  const f = document.createElement("div"); f.className = "form-root"; buildForm(f, currentData, ""); c.appendChild(f);
}

// ===== PALETTE EDITOR COMPONENT =====
const PALETTE_STYLES = {
  doom: { id: 0, name: "Doom-like brown ramp + 216 colors", description: "First 48 entries brown gradient" },
  smooth256: { id: 1, name: "Smooth 216 cube + gray", description: "6x6x6 color cube" },
  truecolor: { id: 2, name: "Truecolor bypass", description: "No quantization" },
  grayscale: { id: 3, name: "Grayscale", description: "Luma weights 0.299/0.587/0.114" },
  sepia: { id: 4, name: "Sepia", description: "Warm luma 1.2/0.9/0.6" }
};

function genPaletteForPreview(style, data) {
  const PAL_SIZE = 256;
  const pal = new Uint8Array(PAL_SIZE * 4);
  function set(i, r, g, b) { pal[i * 4] = r; pal[i * 4 + 1] = g; pal[i * 4 + 2] = b; pal[i * 4 + 3] = 255; }
  const br = data?.brownRamp || { from: [80,40,20], to: [200,100,50], count: 48 };
  const levels = data?.cubeLevels || [0,51,102,153,204,255];
  const custom = data?.customColors || {};

  if (style === 'grayscale') { for (let i=0;i<256;i++) set(i,i,i,i); }
  else if (style === 'sepia') { for (let i=0;i<256;i++){ const v=i; set(i, Math.min(255, v*1.2|0), Math.min(255, v*0.9|0), Math.min(255, v*0.6|0)); } }
  else if (style === 'truecolor') {
    // For preview, truecolor shows a smooth gradient + cube hint
    for (let i=0;i<256;i++){ const r = (i * 2) % 256; const g = (i * 3) % 256; const b = (i * 5) % 256; set(i, r,g,b); }
    // Actually truecolor bypass means no quant, show full hue gradient for preview
    for (let i=0;i<256;i++){ const hue = (i/256)*360; const c = hslToRgb(hue/360, 0.8, 0.5); set(i, c[0], c[1], c[2]); }
  } else {
    let idx=0;
    for (let r=0;r<6;r++) for (let g=0;g<6;g++) for (let b=0;b<6;b++){ if(idx>=216) break; set(idx, levels[r], levels[g], levels[b]); idx++; }
    for (;idx<256;idx++){ const v = Math.floor((idx-216)*255/39); set(idx,v,v,v); }
    let rf = br.from || br.start || [80,40,20];
    let rt = br.to || br.end || [200,100,50];
    let rc = br.count != null ? br.count : 48;
    rc = Math.max(0, Math.min(96, rc|0));
    for (let i=0;i<rc;i++){ const t = rc<=1?0:i/(rc-1); set(i, Math.floor(rf[0]+t*(rt[0]-rf[0])), Math.floor(rf[1]+t*(rt[1]-rf[1])), Math.floor(rf[2]+t*(rt[2]-rf[2]))); }
  }
  // custom overrides
  if (custom && typeof custom === 'object') {
    for (const [k,v] of Object.entries(custom)){
      const idx = parseInt(k,10); if(isNaN(idx)||idx<0||idx>=256) continue;
      if(Array.isArray(v)&&v.length>=3) set(idx, v[0]|0, v[1]|0, v[2]|0);
    }
  }
  return pal;
}
function hslToRgb(h,s,l){
  let r,g,b;
  if(s===0){ r=g=b=l; } else {
    const hue2rgb=(p,q,t)=>{ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
    const q = l<0.5 ? l*(1+s) : l+s-l*s; const p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}
function formatRgb(r,g,b){ return `rgb(${r},${g},${b})`; }

function buildPaletteEditor() {
  const root = document.createElement('div');
  root.className = 'palette-editor-root';
  const styleKeys = Object.keys(currentData.styles || PALETTE_STYLES);
  const currentStyle = currentData.paletteStyle || 'doom';

  // === Header ===
  const header = document.createElement('div');
  header.className = 'palette-header';
  header.innerHTML = `
    <div class="palette-title"><i class="ph ph-palette" style="font-size:20px"></i> Palette Editor — Visual Preview & Tweaks</div>
    <div class="field-hint">Choose a style (enum dropdown), see the 256 colors live, tweak ramp / banding / overrides. Live Edit pushes to Game tab.</div>
  `;
  root.appendChild(header);

  // === Top controls grid ===
  const controlsGrid = document.createElement('div');
  controlsGrid.className = 'palette-controls-grid';
  root.appendChild(controlsGrid);

  // Enum dropdown for paletteStyle
  const styleField = document.createElement('div');
  styleField.className = 'field-group palette-field';
  styleField.innerHTML = `<label class="field-label">Palette Style — ENUM<select></select> (selector)</label>`;
  const sel = document.createElement('select');
  sel.className = 'field-input field-select';
  sel.style.marginTop = '6px';
  styleKeys.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    const meta = (currentData.styles && currentData.styles[k]) || PALETTE_STYLES[k] || { name:k };
    const label = (currentData.ui?.paletteStyle?.labels && currentData.ui.paletteStyle.labels[k]) || meta.name || k;
    opt.textContent = `${k} — ${label}`;
    if (k === currentStyle) opt.selected = true;
    sel.appendChild(opt);
  });
  const descBox = document.createElement('div');
  descBox.className = 'field-hint palette-style-desc';
  const updateDesc = () => {
    const k = sel.value;
    const meta = (currentData.styles && currentData.styles[k]) || PALETTE_STYLES[k] || {};
    descBox.textContent = `${meta.name || ''} — ${meta.description || ''} (id=${meta.id ?? '?'})`;
  };
  updateDesc();
  styleField.appendChild(sel);
  styleField.appendChild(descBox);
  controlsGrid.appendChild(styleField);

  // Authentic toggle
  const authField = document.createElement('div');
  authField.className = 'field-group palette-field';
  authField.innerHTML = `<label class="field-label">Authentic Retro Mode</label>`;
  const tog = document.createElement('label'); tog.className = 'toggle';
  tog.innerHTML = `<input type="checkbox" ${currentData.authentic ? 'checked' : ''}><span class="toggle-slider"></span><span style="margin-left:8px;font-size:13px;color:var(--text-dim)">${currentData.authentic ? 'enabled — quantization + banding' : 'disabled'}</span>`;
  const chk = tog.querySelector('input');
  chk.onchange = e => {
    setByPath(currentData, 'authentic', e.target.checked);
    tog.querySelector('span:last-child').textContent = e.target.checked ? 'enabled — quantization + banding' : 'disabled';
    triggerLiveChange();
    refreshPreviews();
  };
  authField.appendChild(tog);
  controlsGrid.appendChild(authField);

  // BandLevels slider
  const bandField = document.createElement('div');
  bandField.className = 'field-group palette-field';
  const bandMin = currentData.bandClamp?.min ?? 8;
  const bandMax = currentData.bandClamp?.max ?? 64;
  bandField.innerHTML = `<label class="field-label">Band Levels — ${bandMin}..${bandMax} — ${currentData.bandLevels}</label>`;
  const bandRow = document.createElement('div'); bandRow.style.display='flex'; bandRow.style.gap='8px'; bandRow.style.alignItems='center';
  const bandNum = document.createElement('input'); bandNum.type='number'; bandNum.className='field-input'; bandNum.value=currentData.bandLevels; bandNum.min=String(bandMin); bandNum.max=String(bandMax); bandNum.step='1'; bandNum.style.flex='1';
  const bandSl = document.createElement('input'); bandSl.type='range'; bandSl.min=String(bandMin); bandSl.max=String(Math.max(bandMax,128)); bandSl.step='1'; bandSl.value=String(currentData.bandLevels); bandSl.style.flex='2';
  const syncBand = (v) => {
    const iv = Math.round(v);
    setByPath(currentData,'bandLevels',iv);
    bandField.querySelector('label').textContent = `Band Levels — ${currentData.bandClamp?.min ?? 8}..${currentData.bandClamp?.max ?? 64} — ${iv}`;
    triggerLiveChange();
    refreshPreviews();
  };
  bandNum.oninput = () => { bandSl.value = bandNum.value; syncBand(bandNum.value); };
  bandSl.oninput = () => { bandNum.value = bandSl.value; syncBand(bandSl.value); };
  bandRow.appendChild(bandNum); bandRow.appendChild(bandSl);
  bandField.appendChild(bandRow);
  controlsGrid.appendChild(bandField);

  // === Preview Section ===
  const previewWrap = document.createElement('div');
  previewWrap.className = 'palette-preview-wrap';
  previewWrap.innerHTML = `
    <div class="palette-section-title"><i class="ph ph-eye"></i> Chosen Palette Preview — 256 colors</div>
  `;
  root.appendChild(previewWrap);

  const previewTop = document.createElement('div');
  previewTop.className = 'palette-preview-top';
  previewWrap.appendChild(previewTop);

  const gridContainer = document.createElement('div');
  gridContainer.className = 'palette-grid-container';
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  canvas.className = 'palette-canvas-grid';
  canvas.title = 'Click a swatch to tweak it. Hover shows RGB.';
  gridContainer.appendChild(canvas);
  const hoverInfo = document.createElement('div');
  hoverInfo.className = 'palette-hover-info';
  hoverInfo.textContent = 'Hover a swatch — click to edit override';
  gridContainer.appendChild(hoverInfo);
  previewTop.appendChild(gridContainer);

  const sidePreviews = document.createElement('div');
  sidePreviews.className = 'palette-side-previews';
  sidePreviews.innerHTML = `
    <div class="mini-preview"><div class="mini-title">Banding Gradient (simulated)</div><canvas id="banding-canvas" width="256" height="48" class="mini-canvas"></canvas><div class="field-hint">Top = smooth, Bottom = banded with current bandLevels (authentic)</div></div>
    <div class="mini-preview"><div class="mini-title">Light Levels / Colormap (×32 darkening)</div><canvas id="colormap-canvas" width="256" height="160" class="mini-canvas"></canvas><div class="field-hint">Each row is a light level darkening factor</div></div>
    <div class="mini-preview"><div class="mini-title">Brown Ramp (doom only) — tweak below</div><canvas id="ramp-canvas" width="256" height="36" class="mini-canvas"></canvas></div>
  `;
  previewTop.appendChild(sidePreviews);

  // === Brown Ramp tweak section ===
  const rampTweak = document.createElement('div');
  rampTweak.className = 'palette-tweak-section';
  rampTweak.innerHTML = `<div class="palette-section-title"><i class="ph ph-sliders"></i> Tweak Palette — Brown Ramp (doom style)</div>`;
  const rampRow = document.createElement('div'); rampRow.className = 'palette-ramp-row';

  const ensureRamp = () => { if(!currentData.brownRamp) currentData.brownRamp = { from:[80,40,20], to:[200,100,50], count:48 }; };

  const makeColorField = (label, path, def) => {
    ensureRamp();
    const g = document.createElement('div'); g.className='field-group'; g.style.flex='1';
    g.innerHTML = `<label class="field-label">${label}</label>`;
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='center';
    const cur = (()=>{ try{ const parts=path.split('.'); let cur=currentData; for(const p of parts) cur=cur?.[p]; return cur||def; }catch{return def; }})();
    const toHex = arr => '#' + arr.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('');
    const col = document.createElement('input'); col.type='color'; col.value=toHex(cur); col.style.width='44px'; col.style.height='36px'; col.style.border='none'; col.style.borderRadius='6px'; col.style.cursor='pointer';
    const nums = document.createElement('div'); nums.style.display='flex'; nums.style.gap='4px'; nums.style.flex='1';
    const inputs = [0,1,2].map(i=>{ const inp=document.createElement('input'); inp.type='number'; inp.className='field-input'; inp.value=cur[i]; inp.min='0'; inp.max='255'; inp.step='1'; inp.style.flex='1'; return inp; });
    const apply = (arr) => { setByPath(currentData, path, arr); col.value = toHex(arr); triggerLiveChange(); refreshPreviews(); };
    col.oninput = () => { const m=col.value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if(!m) return; const arr=[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]; inputs.forEach((inp,i)=>inp.value=arr[i]); setByPath(currentData, path, arr); triggerLiveChange(); refreshPreviews(); };
    inputs.forEach((inp, idx) => inp.oninput = () => { const arr=inputs.map(x=>parseFloat(x.value)||0); col.value=toHex(arr); setByPath(currentData, path, arr); triggerLiveChange(); refreshPreviews(); });
    row.appendChild(col); inputs.forEach(i=>nums.appendChild(i)); row.appendChild(nums);
    g.appendChild(row); return g;
  };

  rampRow.appendChild(makeColorField('Ramp From (start)', 'brownRamp.from', [80,40,20]));
  rampRow.appendChild(makeColorField('Ramp To (end)', 'brownRamp.to', [200,100,50]));
  rampTweak.appendChild(rampRow);

  // count slider
  const countGroup = document.createElement('div'); countGroup.className='field-group'; countGroup.style.marginTop='12px';
  const rc = currentData.brownRamp?.count ?? 48;
  countGroup.innerHTML = `<label class="field-label">Ramp Count — how many of first entries are brown — ${rc}</label>`;
  const countRow = document.createElement('div'); countRow.style.display='flex'; countRow.style.gap='8px'; countRow.style.alignItems='center';
  const cNum = document.createElement('input'); cNum.type='number'; cNum.className='field-input'; cNum.value=rc; cNum.min='0'; cNum.max='96'; cNum.step='1'; cNum.style.flex='1';
  const cSl = document.createElement('input'); cSl.type='range'; cSl.min='0'; cSl.max='96'; cSl.step='1'; cSl.value=String(rc); cSl.style.flex='2';
  const syncCount = (v)=>{ const iv=Math.max(0,Math.min(96,Math.round(v))); ensureRamp(); setByPath(currentData,'brownRamp.count',iv); countGroup.querySelector('label').textContent=`Ramp Count — how many of first entries are brown — ${iv}`; triggerLiveChange(); refreshPreviews(); };
  cNum.oninput=()=>{ cSl.value=cNum.value; syncCount(cNum.value); };
  cSl.oninput=()=>{ cNum.value=cSl.value; syncCount(cSl.value); };
  countRow.appendChild(cNum); countRow.appendChild(cSl); countGroup.appendChild(countRow);
  rampTweak.appendChild(countGroup);
  root.appendChild(rampTweak);

  // === Custom overrides tweak ===
  const overRoot = document.createElement('div');
  overRoot.className = 'palette-tweak-section';
  overRoot.innerHTML = `<div class="palette-section-title"><i class="ph ph-paint-brush"></i> Tweak Individual Colors — Overrides</div><div class="field-hint">Click any swatch in the grid to edit. Overrides stored in customColors map (index → [R,G,B]). Clear individual or all.</div>`;
  const overActions = document.createElement('div'); overActions.style.display='flex'; overActions.style.gap='8px'; overActions.style.margin='10px 0';
  const clearBtn = document.createElement('button'); clearBtn.className='btn btn-sm btn-secondary'; clearBtn.textContent='Clear All Overrides';
  clearBtn.onclick = ()=>{ setByPath(currentData,'customColors',{}); triggerLiveChange(); refreshPreviews(); status('Overrides cleared','ok'); };
  const exportBtn = document.createElement('button'); exportBtn.className='btn btn-sm btn-secondary'; exportBtn.textContent='Export overrides JSON';
  exportBtn.onclick = ()=>{ const ta = document.createElement('textarea'); ta.className='json-editor'; ta.style.minHeight='100px'; ta.value=JSON.stringify(currentData.customColors||{},null,2); ta.readOnly=true; overRoot.appendChild(ta); ta.select(); };
  overActions.appendChild(clearBtn); overActions.appendChild(exportBtn);
  overRoot.appendChild(overActions);
  const overList = document.createElement('div'); overList.className='palette-overrides-list';
  overRoot.appendChild(overList);
  root.appendChild(overRoot);

  // === Refresh logic ===
  function refreshOverList(){
    overList.innerHTML = '';
    const cc = currentData.customColors || {};
    const keys = Object.keys(cc).sort((a,b)=>parseInt(a)-parseInt(b));
    if(keys.length===0){ overList.innerHTML='<div class="field-hint">No overrides yet — click a swatch above to add one.</div>'; return; }
    keys.forEach(k=>{
      const v = cc[k];
      const row = document.createElement('div'); row.className='override-row';
      const sw = document.createElement('div'); sw.className='override-swatch'; sw.style.background=`rgb(${v[0]},${v[1]},${v[2]})`;
      const label = document.createElement('span'); label.textContent=`#${k} → [${v.join(', ')}]`;
      label.style.fontFamily='var(--font-mono)'; label.style.fontSize='12px'; label.style.flex='1';
      const edit = document.createElement('input'); edit.type='color'; edit.value='#'+v.map(n=>Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,'0')).join(''); edit.style.width='28px'; edit.style.height='22px';
      edit.oninput=()=>{ const m=edit.value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); const arr=[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]; currentData.customColors[k]=arr; sw.style.background=`rgb(${arr.join(',')})`; label.textContent=`#${k} → [${arr.join(', ')}]`; triggerLiveChange(); refreshPreviews(false); };
      const del = document.createElement('button'); del.className='btn-icon'; del.textContent='✕'; del.onclick=()=>{ delete currentData.customColors[k]; triggerLiveChange(); refreshOverList(); refreshPreviews(false); };
      row.appendChild(sw); row.appendChild(label); row.appendChild(edit); row.appendChild(del);
      overList.appendChild(row);
    });
  }

  function drawGrid() {
    const pal = genPaletteForPreview(sel.value, currentData);
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cols = 16, rows = 16;
    const cellW = W/cols, cellH = H/rows;
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<256;i++){
      const r = pal[i*4], g = pal[i*4+1], b = pal[i*4+2];
      const col = i%cols, row = (i/cols)|0;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(col*cellW, row*cellH, cellW, cellH);
    }
    // border
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=0.5;
    for(let c=1;c<cols;c++){ ctx.beginPath(); ctx.moveTo(c*cellW,0); ctx.lineTo(c*cellW,H); ctx.stroke(); }
    for(let r=1;r<rows;r++){ ctx.beginPath(); ctx.moveTo(0,r*cellH); ctx.lineTo(W,r*cellH); ctx.stroke(); }
    return pal;
  }
  function drawBanding() {
    const c = root.querySelector('#banding-canvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    // smooth gradient top half
    const grad = ctx.createLinearGradient(0,0,W,0);
    grad.addColorStop(0,'black'); grad.addColorStop(0.2,'#8B4513'); grad.addColorStop(0.5,'#D2B48C'); grad.addColorStop(0.8,'#87CEEB'); grad.addColorStop(1,'white');
    ctx.fillStyle=grad; ctx.fillRect(0,0,W,H/2);
    // banded bottom half
    const levels = currentData.bandLevels || 32;
    for(let x=0;x<W;x++){
      const t = x/W;
      let r = Math.floor(t*255);
      const banded = currentData.authentic ? Math.floor(r/255*levels)/levels*255 : r;
      ctx.fillStyle=`rgb(${banded|0},${banded|0},${banded|0})`;
      // reuse hue from top? simplify: use grayscale banding visualization with color from gradient approx
      // sample gradient color at x
      const hueT = t;
      const col = hueT<0.2 ? [139,69,19] : hueT<0.5 ? [210,180,140] : hueT<0.8 ? [135,206,235] : [255,255,255];
      // apply banding to luma
      const luma = 0.299*col[0]+0.587*col[1]+0.114*col[2];
      const bl = currentData.authentic ? Math.floor(luma/255*levels)/levels*255 : luma;
      const factor = luma>1 ? bl/luma : 1;
      const rr = Math.min(255, col[0]*factor|0), gg = Math.min(255, col[1]*factor|0), bb = Math.min(255, col[2]*factor|0);
      ctx.fillStyle=`rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x,H/2,1,H/2);
    }
  }
  function drawColormap(pal){
    const c = root.querySelector('#colormap-canvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.width, H=c.height;
    const levels = 8;
    const rowH = H/levels;
    ctx.clearRect(0,0,W,H);
    for(let l=0;l<levels;l++){
      const factor = 1 - l/(levels-0.5);
      for(let i=0;i<256;i++){
        const r = (pal[i*4]*factor)|0, g=(pal[i*4+1]*factor)|0, b=(pal[i*4+2]*factor)|0;
        const x = (i/256)*W;
        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(x, l*rowH, W/256+1, rowH);
      }
    }
  }
  function drawRamp(pal){
    const c = root.querySelector('#ramp-canvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    const rc = currentData.brownRamp?.count ?? 48;
    if(rc<=0){ ctx.fillStyle='#222'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#666'; ctx.font='11px JetBrains Mono'; ctx.fillText('Ramp disabled (count=0)', 8, H/2+3); return; }
    for(let i=0;i<rc;i++){
      const r=pal[i*4], g=pal[i*4+1], b=pal[i*4+2];
      const x = (i/rc)*W;
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillRect(x,0,W/rc+1,H);
    }
  }

  function refreshPreviews(includeList=true){
    const pal = drawGrid();
    drawBanding();
    drawColormap(pal);
    drawRamp(pal);
    if(includeList) refreshOverList();
  }

  // Interactions
  sel.onchange = () => {
    setByPath(currentData,'paletteStyle',sel.value);
    updateDesc();
    triggerLiveChange();
    refreshPreviews();
  };

  // hover & click on grid
  let lastPal = null;
  function getPal(){ return lastPal = genPaletteForPreview(sel.value, currentData); }
  canvas.addEventListener('mousemove', e=>{
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX-rect.left)/rect.width * canvas.width;
    const y = (e.clientY-rect.top)/rect.height * canvas.height;
    const col = Math.floor((x/canvas.width)*16), row = Math.floor((y/canvas.height)*16);
    const idx = row*16+col;
    if(idx<0||idx>=256) return;
    const pal = getPal();
    const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2];
    hoverInfo.innerHTML = `<span class="hover-idx">#${idx}</span> <span class="hover-swatch" style="background:rgb(${r},${g},${b})"></span> rgb(${r},${g},${b}) — hex #${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
  });
  canvas.addEventListener('mouseleave',()=>{ hoverInfo.textContent='Hover a swatch — click to edit override'; });
  canvas.addEventListener('click', e=>{
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX-rect.left)/rect.width * canvas.width;
    const y = (e.clientY-rect.top)/rect.height * canvas.height;
    const col = Math.floor((x/canvas.width)*16), row = Math.floor((y/canvas.height)*16);
    const idx = row*16+col;
    if(idx<0||idx>=256) return;
    const pal = getPal();
    const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2];
    // prompt color picker
    const currentHex = '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    const input = document.createElement('input'); input.type='color'; input.value=currentHex;
    input.style.position='fixed'; input.style.left='-9999px';
    document.body.appendChild(input);
    input.oninput = () => {
      const m=input.value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      if(!m) return;
      const arr=[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)];
      if(!currentData.customColors) currentData.customColors={};
      currentData.customColors[String(idx)] = arr;
      triggerLiveChange();
      refreshPreviews();
    };
    input.onchange = () => { setTimeout(()=>input.remove(),200); };
    input.click();
  });

  // initial draw
  setTimeout(()=>refreshPreviews(), 0);

  return root;
}
function renderRaw() {
  const tc = $("tab-content"); if (!tc) return;
  tc.innerHTML = `<div class="field-group"><label class="field-label">JSON Definition</label><textarea class="json-editor" id="json-ta" spellcheck="false">${JSON.stringify(currentData, null, 2)}</textarea><div class="field-hint">Edit JSON directly. Must remain valid. Switch back to Visual to see structured view. Live Edit will preview on valid JSON if enabled.</div></div>`;
  const ta = document.getElementById('json-ta');
  if (ta) {
    ta.oninput = () => {
      try {
        const parsed = JSON.parse(ta.value);
        currentData = parsed;
        triggerLiveChange();
      } catch {
        // invalid, don't broadcast
      }
    };
  }
}

function buildForm(container, obj, path) {
  if (Array.isArray(obj)) {
    const wrap = document.createElement("div"); wrap.className = "array-wrap";
    obj.forEach((item, i) => {
      const itemEl = document.createElement("div"); itemEl.className = "array-item";
      const header = document.createElement("div"); header.className = "array-header";
      header.innerHTML = `<span class="array-index">#${i}${item.name ? ' · ' + item.name : item.id ? ' · id ' + item.id : ''}</span><button class="btn-icon" data-del="${path}[${i}]">✕</button>`;
      header.querySelector("button").onclick = () => { obj.splice(i, 1); render(); triggerLiveChange(); };
      itemEl.appendChild(header); const body = document.createElement("div"); body.className = "array-body";
      buildForm(body, item, `${path}[${i}]`); itemEl.appendChild(body); wrap.appendChild(itemEl);
    });
    const addBtn = document.createElement("button"); addBtn.className = "btn btn-sm btn-secondary"; addBtn.textContent = "+ Add item";
    addBtn.onclick = () => { obj.push({}); render(); triggerLiveChange(); }; wrap.appendChild(addBtn); container.appendChild(wrap); return;
  }
  if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('_')) continue;
      if (key === 'docs' || key === 'ui' || key === 'ranges' || key === 'schema' || key === 'editor') continue;
      const val = obj[key]; const fp = path ? `${path}.${key}` : key;
      // For palette config, brownRamp and customColors are managed by custom visual editor — show hint instead of duplicate nested form at top level
      if (isPaletteConfig() && path === '' && (key === 'brownRamp' || key === 'customColors' || key === 'cubeLevels')) {
        const fg = document.createElement('div'); fg.className='field-group';
        const lbl = document.createElement('label'); lbl.className='field-label'; lbl.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()) + ' — managed above'; fg.appendChild(lbl);
        const hint = document.createElement('div'); hint.className='field-hint'; hint.textContent = key === 'brownRamp' ? 'Tweak via color pickers in visual editor above.' : key === 'customColors' ? 'Overrides edited by clicking swatches above. Also editable below in raw nested list.' : 'Cube levels for smooth256/doom styles — edit below if needed.';
        fg.appendChild(hint);
        if (key !== 'brownRamp') {
          const sub = document.createElement('div'); sub.className='nested-object'; buildForm(sub, val, fp); fg.appendChild(sub);
        } else {
          // for brownRamp we still want to show nested editing as fallback, but collapsed hint
          const sub = document.createElement('div'); sub.className='nested-object'; buildForm(sub, val, fp); fg.appendChild(sub);
        }
        container.appendChild(fg);
        continue;
      }
      const fg = document.createElement("div"); fg.className = "field-group";
      const lbl = document.createElement("label"); lbl.className = "field-label";
      // tooltip from docs
      const docText = getDocForPath(fp);
      if (docText) lbl.title = docText;
      lbl.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); fg.appendChild(lbl);
      if (typeof val === "number") {
        const row = document.createElement("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
        const inp = document.createElement("input"); inp.type = "number"; inp.className = "field-input"; inp.value = val; inp.step = "any"; inp.style.flex = "1";
        const commit = () => { setByPath(currentData, fp, parseFloat(inp.value) || 0); triggerLiveChange(); };
        inp.oninput = () => { setByPath(currentData, fp, parseFloat(inp.value) || 0); triggerLiveChange(); if (sl) sl.value = inp.value; };
        row.appendChild(inp);
        let sl = null;
        // Declarative schema from JSON (ui / docs with min/max) takes precedence over heuristics
        const schema = getSchemaForPath(fp);
        const hasSchemaRange = schema && ('min' in schema || 'max' in schema);
        const lowerKey = key.toLowerCase();
        const showSliderByHeuristic = (val >= 0 && val <= 1 && key.match(/roughness|metal|chance|weight|strength|opacity|scale|mult/i)) || key === "metal" || lowerKey.includes('factor') || lowerKey.includes('amount') || lowerKey.includes('speed');
        const showSlider = hasSchemaRange || showSliderByHeuristic;
        if (showSlider) {
          let minVal = 0, maxVal = 1, stepVal = 0.01;
          if (hasSchemaRange) {
            minVal = schema.min ?? 0;
            maxVal = schema.max ?? (lowerKey.includes('speed') ? 20 : 1);
            stepVal = schema.step ?? (maxVal > 1 ? 0.05 : 0.01);
          } else {
            // generic heuristic fallback (no hardcoded noiseScale — use schema if you need custom range)
            if (lowerKey.includes('speed')) {
              maxVal = 20;
              stepVal = 0.1;
            }
            if (val > 1) {
              maxVal = Math.max(maxVal, Math.max(20, val * 2));
            }
          }
          sl = document.createElement("input");
          sl.type = "range";
          sl.min = String(minVal);
          sl.max = String(maxVal);
          sl.step = String(stepVal);
          sl.value = String(Math.min(Math.max(parseFloat(val), minVal), maxVal));
          sl.style.flex = "2";
          // if current val exceeds declared max, expand max so slider still works (non-destructive)
          if (parseFloat(val) > parseFloat(sl.max)) {
            sl.max = String(Math.max(parseFloat(sl.max), parseFloat(val) * 1.2));
          }
          sl.oninput = () => { inp.value = sl.value; setByPath(currentData, fp, parseFloat(sl.value)); triggerLiveChange(); };
          row.appendChild(sl);
        }
        fg.appendChild(row);
        const docForNum = getDocForPath(fp);
        if (docForNum) {
          const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = docForNum; fg.appendChild(hint);
        }
      } else if (typeof val === "string") {
        // Check if this field has enum ui config (e.g. paletteStyle)
        const uiEntryForEnum = getUiEntry(fp);
        const isEnum = uiEntryForEnum && uiEntryForEnum.type === 'enum' && Array.isArray(uiEntryForEnum.options);
        if (isEnum && !isPaletteConfig()) {
          const sel = document.createElement('select');
          sel.className = 'field-input field-select';
          uiEntryForEnum.options.forEach(optVal => {
            const opt = document.createElement('option');
            opt.value = optVal;
            const labelMap = uiEntryForEnum.labels || {};
            opt.textContent = labelMap[optVal] ? `${optVal} — ${labelMap[optVal]}` : optVal;
            if (optVal === val) opt.selected = true;
            sel.appendChild(opt);
          });
          sel.onchange = () => { setByPath(currentData, fp, sel.value); triggerLiveChange(); };
          fg.appendChild(sel);
        } else if (isPaletteConfig() && fp === 'paletteStyle') {
          // Skip duplicate rendering — custom palette editor already shows enum dropdown
          const hint = document.createElement('div'); hint.className='field-hint'; hint.textContent='Managed by palette visual editor above (enum dropdown).';
          fg.appendChild(hint);
        } else {
          const inp = document.createElement("input"); inp.type = "text"; inp.className = "field-input"; inp.value = val;
          inp.oninput = () => { setByPath(currentData, fp, inp.value); triggerLiveChange(); }; fg.appendChild(inp);
        }
        const docForStr = getDocForPath(fp);
        if (docForStr) { const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = docForStr; fg.appendChild(hint); }
      } else if (typeof val === "boolean") {
        const tog = document.createElement("label"); tog.className = "toggle";
        tog.innerHTML = `<input type="checkbox" ${val ? "checked" : ""}><span class="toggle-slider"></span><span style="margin-left:8px;font-size:13px;color:var(--text-dim)">${val ? "enabled" : "disabled"}</span>`;
        tog.querySelector("input").onchange = e => { setByPath(currentData, fp, e.target.checked); tog.querySelector("span:last-child").textContent = e.target.checked ? "enabled" : "disabled"; triggerLiveChange(); };
        fg.appendChild(tog);
        const docForBool = getDocForPath(fp);
        if (docForBool) { const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = docForBool; fg.appendChild(hint); }
      } else if (val === null) {
        const inp = document.createElement("input"); inp.type = "text"; inp.className = "field-input"; inp.placeholder = "null"; inp.value = "";
        inp.oninput = () => { setByPath(currentData, fp, inp.value === "" ? null : inp.value); triggerLiveChange(); }; fg.appendChild(inp);
        const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = "Empty = null"; fg.appendChild(hint);
      } else if (Array.isArray(val) && val.length === 3 && val.every(n => typeof n === "number")) {
        const row = document.createElement("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
        const isNorm = val.every(n => n >= 0 && n <= 1.5);
        const toHex = arr => "#" + arr.map(n => {
          const v = isNorm ? n * 255 : n;
          return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
        }).join("");
        const fromHex = hex => {
          const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          if (!m) return val;
          const rgb = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
          return isNorm ? rgb.map(v => +(v/255).toFixed(3)) : rgb;
        };
        const col = document.createElement("input"); col.type = "color"; col.value = toHex(val); col.style.width = "44px"; col.style.height = "36px"; col.style.border = "none"; col.style.borderRadius = "6px"; col.style.cursor = "pointer";
        const nums = document.createElement("div"); nums.style.display = "flex"; nums.style.gap = "4px"; nums.style.flex = "1";
        const inputs = [0, 1, 2].map(i => {
          const inp = document.createElement("input");
          inp.type = "number"; inp.className = "field-input"; inp.value = val[i];
          if (isNorm) { inp.min = "0"; inp.max = "1"; inp.step = "0.01"; }
          else { inp.min = "0"; inp.max = "255"; inp.step = "1"; }
          inp.style.width = "0"; inp.style.flex = "1"; return inp;
        });
        const update = () => {
          const arr = inputs.map(inp => parseFloat(inp.value) || 0);
          col.value = toHex(arr); setByPath(currentData, fp, arr); triggerLiveChange();
        };
        col.oninput = () => { const arr = fromHex(col.value); inputs.forEach((inp, i) => inp.value = arr[i]); setByPath(currentData, fp, arr); triggerLiveChange(); };
        inputs.forEach(inp => inp.oninput = update); row.appendChild(col); inputs.forEach(inp => nums.appendChild(inp)); row.appendChild(nums); fg.appendChild(row);
        const docForCol = getDocForPath(fp);
        if (docForCol) { const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = docForCol; fg.appendChild(hint); }
        else if (isNorm) {
          const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = "Normalized 0..1 (HDR friendly)"; fg.appendChild(hint);
        }
      } else if (Array.isArray(val)) { const sub = document.createElement("div"); sub.className = "nested-array"; buildForm(sub, val, fp); fg.appendChild(sub);
      } else if (typeof val === "object") {
        if (key === 'note' || key === 'structure' || key === 'delegation') {
          const hint = document.createElement("div"); hint.className = "field-hint"; hint.style.whiteSpace = "pre-wrap";
          hint.textContent = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
          fg.appendChild(hint);
        } else {
          const sub = document.createElement("div"); sub.className = "nested-object"; buildForm(sub, val, fp); fg.appendChild(sub);
        }
      }
      container.appendChild(fg);
    }
  }
}
function setByPath(obj, path, value) { const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let cur = obj; for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]; if (cur) cur[parts[parts.length - 1]] = value; }
function syncFromUI() { if (mode === "raw") { const ta = document.getElementById("json-ta"); if (ta) { try { currentData = JSON.parse(ta.value); triggerLiveChange(); } catch (e) { status("Invalid JSON — fix in raw mode", "err"); mode = "raw"; throw e; } } } }
async function saveCurrent() { try { syncFromUI(); } catch { return; } if (!current) return; const ok = await saveAsset(current.category, current.name, currentData); if (ok) { lastSavedData = clone(currentData); liveManager.publishAssetUpdated(current.category, current.name); } status(ok ? "Saved to disk" : "Save failed", ok ? "ok" : "err"); }
init();
