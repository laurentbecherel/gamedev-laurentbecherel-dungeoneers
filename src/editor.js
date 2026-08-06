import { getAssetList, getAsset, saveAsset } from "./config/config.js";
import { getLiveConfigManager } from "./config/live-config.js";
import { buildArchitecturePreview } from "./editor-architecture-preview.js";

const $ = id => document.getElementById(id);
let current = null, currentData = null, lastSavedData = null, mode = "visual";
const collapsed = new Set();
const expandedFormSections = new Set();

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
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (cur && typeof cur === 'object' && p in cur) {
            cur = cur[p];
          } else if (cur && typeof cur === 'object') {
            // Older configs used compact schema keys such as "noise.scale".
            // Resolve the remaining path as one key so those controls retain
            // their declared ranges while nested schemas remain supported.
            const dottedRemainder = parts.slice(i).join('.');
            if (dottedRemainder in cur) { cur = cur[dottedRemainder]; i = parts.length; }
            else { ok = false; break; }
          } else { ok = false; break; }
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
  panel.classList.toggle('architecture-editor-active', isArchitectureConfig());
  panel.innerHTML = `<div class="tabs"><button class="tab ${mode==='visual'?'active':''}" id="tab-visual">Visual Editor</button><button class="tab ${mode==='raw'?'active':''}" id="tab-raw">Raw JSON</button></div><div id="tab-content"></div>`;
  const tabV = $("tab-visual"), tabR = $("tab-raw");
  if (tabV) tabV.onclick = () => { syncFromUI(); mode = "visual"; render(); };
  if (tabR) tabR.onclick = () => { syncFromUI(); mode = "raw"; render(); };
  if (mode === "visual") renderVisual(); else renderRaw();
}
function isPaletteConfig() {
  return current && current.name === 'palette' && current.category && current.category.includes('rendering');
}
function isArchitectureConfig() {
  return current && current.name === 'architectures' && current.category === 'materials';
}

function renderVisual() {
  const c = $("tab-content"); if (!c) return; c.innerHTML = ""; if (!currentData) return;
  if (isArchitectureConfig()) {
    const mount = document.createElement('div'); mount.className = 'architecture-preview-mount'; c.appendChild(mount);
    buildArchitecturePreview(currentData).then(preview => { if (mount.isConnected) mount.replaceChildren(preview); });
  }
  if (isPaletteConfig()) {
    const custom = buildPaletteEditor();
    c.appendChild(custom);
  }
  const f = document.createElement("div"); f.className = "form-root"; buildForm(f, currentData, ""); c.appendChild(f);
}

// ===== PALETTE EDITOR COMPONENT =====
const PALETTE_STYLES = {
  doom: { id: 0, name: "Brown + Natural Green accents + desaturated + gray", description: "32 brown + 32 green accent ramps, 128 desaturated regulars, 64 gray" },
  smooth256: { id: 1, name: "Smooth 216 cube + gray", description: "6x6x6 color cube (saturated)" },
  truecolor: { id: 2, name: "Truecolor bypass", description: "No quantization" },
  grayscale: { id: 3, name: "Grayscale", description: "Luma weights 0.299/0.587/0.114" },
  sepia: { id: 4, name: "Sepia", description: "Warm luma 1.2/0.9/0.6" }
};

function hslToRgb(h,s,l){
  let r,g,b;
  if(s===0){ r=g=b=l; } else {
    const hue2rgb=(p,q,t)=>{ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
    const q = l<0.5 ? l*(1+s) : l+s-l*s; const p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}
function lerpColorEditor(a,b,t){
  return [Math.floor(a[0]+(b[0]-a[0])*t), Math.floor(a[1]+(b[1]-a[1])*t), Math.floor(a[2]+(b[2]-a[2])*t)];
}
function genDesaturatedPreview(count, opts){
  const satBase = opts?.saturation ?? 0.42;
  const satVar = opts?.saturationVar ?? 0.18;
  const lMin = opts?.lightnessMin ?? 0.32;
  const lMax = opts?.lightnessMax ?? 0.84;
  const hShift = opts?.hueShift ?? 137.5;
  const out=[];
  for(let i=0;i<count;i++){
    const h=(i*hShift)%360;
    const hash1=((i*37)%100)/100;
    const s=Math.max(0,Math.min(0.75, satBase + (hash1-0.5)*satVar*2));
    const lT = count<=1?0.5:(i/(count-1));
    const level=Math.floor(lT*8)/8;
    const jitter=((i*13)%7)/7*0.06-0.03;
    const l=Math.max(0.05,Math.min(0.95, lMin + level*(lMax-lMin)+jitter));
    out.push(hslToRgb(h/360,s,l));
  }
  return out;
}
function genPaletteForPreview(style, data) {
  const PAL_SIZE = 256;
  const pal = new Uint8Array(PAL_SIZE * 4);
  function set(i, r, g, b) { pal[i * 4] = r; pal[i * 4 + 1] = g; pal[i * 4 + 2] = b; pal[i * 4 + 3] = 255; }
  const custom = data?.customColors || {};
  const levels = data?.cubeLevels || [0,51,102,153,204,255];

  if (style === 'grayscale') { for (let i=0;i<256;i++) set(i,i,i,i); }
  else if (style === 'sepia') { for (let i=0;i<256;i++){ const v=i; set(i, Math.min(255, v*1.2|0), Math.min(255, v*0.9|0), Math.min(255, v*0.6|0)); } }
  else if (style === 'truecolor') {
    for (let i=0;i<256;i++){ const hue = (i/256)*360; const c = hslToRgb(hue/360, 0.8, 0.5); set(i, c[0], c[1], c[2]); }
  } else if (style === 'smooth256') {
    let idx=0;
    for (let r=0;r<6;r++) for (let g=0;g<6;g++) for (let b=0;b<6;b++){ if(idx>=216) break; set(idx, levels[r], levels[g], levels[b]); idx++; }
    for (;idx<256;idx++){ const v = Math.floor((idx-216)*255/39); set(idx,v,v,v); }
  } else {
    // NEW: 2 accent ramps (brown + green) + desaturated regulars + grayscale
    let accentRamps = data?.accentRamps;
    if (!accentRamps) {
      const bSrc = data?.brownRamp || { from:[80,40,20], to:[200,100,50], count:48 };
      const gSrc = data?.greenRamp || { from:[18,48,26], to:[125,185,105], count:32 };
      accentRamps = [
        { id:'brown', from: bSrc.from||bSrc.start||[80,40,20], to: bSrc.to||bSrc.end||[200,100,50], count: bSrc.count??48 },
        { id:'green', from: gSrc.from||gSrc.start||[18,48,26], to: gSrc.to||gSrc.end||[125,185,105], count: gSrc.count??32 }
      ];
    }
    const regularCfg = data?.regularColors || { count:112, saturation:0.42 };
    const grayCfg = data?.grayscale || { count:64, from:0, to:255, gamma:1 };
    let regularCount = regularCfg.count ?? 128;
    let grayCount = (data?.grayscale?.count ?? 64);
    const accentTotal = accentRamps.reduce((s,r)=>s+(r.count|0),0);
    let remaining = PAL_SIZE - accentTotal;
    if (remaining < 0) { regularCount=0; grayCount=PAL_SIZE-accentTotal; }
    else {
      const rgTotal = regularCount + grayCount;
      if (rgTotal > remaining) { const f=remaining/rgTotal; regularCount=Math.floor(regularCount*f); grayCount=remaining-regularCount; }
      else if (rgTotal < remaining) grayCount=remaining-regularCount;
    }
    let idx=0;
    for (const ramp of accentRamps){
      const from=ramp.from||ramp.start, to=ramp.to||ramp.end, cnt=ramp.count|0;
      for(let j=0;j<cnt && idx<256;j++){
        const t = cnt<=1?0:j/(cnt-1);
        const col=lerpColorEditor(from,to,t);
        set(idx,col[0],col[1],col[2]); idx++;
      }
    }
    const regularColors = genDesaturatedPreview(regularCount, regularCfg);
    for(let k=0;k<regularColors.length && idx < PAL_SIZE - grayCount;k++){
      const c=regularColors[k]; set(idx,c[0],c[1],c[2]); idx++;
    }
    const gFrom = grayCfg.from ?? 0, gTo = grayCfg.to ?? 255, gGamma = grayCfg.gamma ?? 1;
    const gCountFinal = PAL_SIZE - idx;
    for(let j=0;j<gCountFinal;j++){
      const t = gCountFinal<=1?0:j/(gCountFinal-1);
      const tG = gGamma===1? t : Math.pow(t,1/gGamma);
      const v = Math.floor(gFrom + tG*(gTo-gFrom));
      set(idx,v,v,v); idx++;
    }
    while(idx<256){ set(idx,idx,idx,idx); idx++; }
  }
  if (custom && typeof custom === 'object') {
    for (const [k,v] of Object.entries(custom)){
      const idx = parseInt(k,10); if(isNaN(idx)||idx<0||idx>=256) continue;
      if(Array.isArray(v)&&v.length>=3) set(idx, v[0]|0, v[1]|0, v[2]|0);
    }
  }
  return pal;
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
    <div class="mini-preview"><div class="mini-title">Banding Gradient (simulated) — accent ramps show banding best</div><canvas id="banding-canvas" width="256" height="48" class="mini-canvas"></canvas><div class="field-hint">Top = smooth 48 brown + 32 green, Bottom = banded with current bandLevels (authentic)</div></div>
    <div class="mini-preview"><div class="mini-title">Light Levels / Colormap (×32 darkening)</div><canvas id="colormap-canvas" width="256" height="160" class="mini-canvas"></canvas><div class="field-hint">Each row is a light level darkening factor</div></div>
    <div class="mini-preview"><div class="mini-title">Accent Ramps — 48 Doom brown (saturated) + natural green — tweak below</div><canvas id="ramp-canvas" width="256" height="36" class="mini-canvas"></canvas><canvas id="ramp-canvas-green" width="256" height="36" class="mini-canvas" style="margin-top:6px"></canvas></div>
    <div class="mini-preview"><div class="mini-title">Regular desaturated + grayscale sections</div><canvas id="regular-canvas" width="256" height="36" class="mini-canvas"></canvas><canvas id="gray-canvas" width="256" height="36" class="mini-canvas" style="margin-top:6px"></canvas><div class="field-hint">112 desaturated regulars (not too saturated) + 64 gray gradient</div></div>
  `;
  previewTop.appendChild(sidePreviews);

  // === Accent Ramps tweak section — 2 configurable colours, keeping classic 48 brown ===
  const rampTweak = document.createElement('div');
  rampTweak.className = 'palette-tweak-section';
  rampTweak.innerHTML = `<div class="palette-section-title"><i class="ph ph-sliders"></i> Tweak Palette — 2 Accents (48 Doom saturated brown/orange + natural green) + desat regulars + gray</div>
    <div class="field-hint">New layout: 48 saturated brown/orange (classic Doom) + 32 natural green with good gradients/banding, 112 desaturated regulars, 64 grayscale. Accents configurable per arch/level later.</div>`;

  const ensureData = () => {
    if (!currentData.accentRamps) currentData.accentRamps = [
      { id:'brown', from:[80,40,20], to:[200,100,50], count:48 },
      { id:'green', from:[18,48,26], to:[125,185,105], count:32 }
    ];
    if (!currentData.brownRamp) currentData.brownRamp = { from: currentData.accentRamps[0].from, to: currentData.accentRamps[0].to, count: currentData.accentRamps[0].count };
    if (!currentData.greenRamp) currentData.greenRamp = { from: currentData.accentRamps[1].from, to: currentData.accentRamps[1].to, count: currentData.accentRamps[1].count };
    if (!currentData.regularColors) currentData.regularColors = { count:112, saturation:0.42, saturationVar:0.18, lightnessMin:0.32, lightnessMax:0.84 };
    if (!currentData.grayscale) currentData.grayscale = { count:64, from:0, to:255, gamma:1 };
  };
  ensureData();

  const makeColorFieldGeneric = (label, path, def, onChangeExtra) => {
    const g = document.createElement('div'); g.className='field-group'; g.style.flex='1';
    g.innerHTML = `<label class="field-label">${label}</label>`;
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='center';
    const cur = (()=>{ try{ const parts=path.split('.'); let cur=currentData; for(const p of parts) cur=cur?.[p]; return cur||def; }catch{return def; }})();
    const toHex = arr => '#' + arr.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('');
    const col = document.createElement('input'); col.type='color'; col.value=toHex(cur); col.style.width='44px'; col.style.height='36px'; col.style.border='none'; col.style.borderRadius='6px'; col.style.cursor='pointer';
    const nums = document.createElement('div'); nums.style.display='flex'; nums.style.gap='4px'; nums.style.flex='1';
    const inputs = [0,1,2].map(i=>{ const inp=document.createElement('input'); inp.type='number'; inp.className='field-input'; inp.value=cur[i]; inp.min='0'; inp.max='255'; inp.step='1'; inp.style.flex='1'; return inp; });
    col.oninput = () => { const m=col.value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if(!m) return; const arr=[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]; inputs.forEach((inp,i)=>inp.value=arr[i]); setByPath(currentData, path, arr); if(onChangeExtra) onChangeExtra(); triggerLiveChange(); refreshPreviews(); };
    inputs.forEach(inp => inp.oninput = () => { const arr=inputs.map(x=>parseFloat(x.value)||0); col.value=toHex(arr); setByPath(currentData, path, arr); if(onChangeExtra) onChangeExtra(); triggerLiveChange(); refreshPreviews(); });
    row.appendChild(col); inputs.forEach(i=>nums.appendChild(i)); row.appendChild(nums);
    g.appendChild(row); return g;
  };

  // Helper to sync brownRamp/greenRamp <-> accentRamps[0/1]
  const syncAccentFromLegacy = (idx) => {
    if (!currentData.accentRamps || !currentData.accentRamps[idx]) return;
    if (idx===0 && currentData.brownRamp) {
      currentData.accentRamps[0].from = currentData.brownRamp.from;
      currentData.accentRamps[0].to = currentData.brownRamp.to;
      currentData.accentRamps[0].count = currentData.brownRamp.count;
    }
    if (idx===1 && currentData.greenRamp) {
      currentData.accentRamps[1].from = currentData.greenRamp.from;
      currentData.accentRamps[1].to = currentData.greenRamp.to;
      currentData.accentRamps[1].count = currentData.greenRamp.count;
    }
  };

  // Brown accent – keep classic 48 saturated doom
  const brownSection = document.createElement('div'); brownSection.style.marginBottom='16px';
  brownSection.innerHTML = `<div class="field-label" style="color:var(--accent)">Accent 1 — Brown (Doom 48 saturated orange/brown) — ${currentData.accentRamps[0].count} entries</div>`;
  const brownRow = document.createElement('div'); brownRow.className='palette-ramp-row';
  brownRow.appendChild(makeColorFieldGeneric('Brown From (dark, sat)', 'brownRamp.from', [80,40,20], ()=>syncAccentFromLegacy(0)));
  brownRow.appendChild(makeColorFieldGeneric('Brown To (light orange)', 'brownRamp.to', [200,100,50], ()=>syncAccentFromLegacy(0)));
  brownSection.appendChild(brownRow);
  const brownCountGroup = document.createElement('div'); brownCountGroup.className='field-group'; brownCountGroup.style.marginTop='8px';
  brownCountGroup.innerHTML = `<label class="field-label">Brown Count — ${currentData.accentRamps[0].count}</label>`;
  const brownCountRow = document.createElement('div'); brownCountRow.style.display='flex'; brownCountRow.style.gap='8px'; brownCountRow.style.alignItems='center';
  const bNum=document.createElement('input'); bNum.type='number'; bNum.className='field-input'; bNum.value=currentData.accentRamps[0].count; bNum.min='0'; bNum.max='64'; bNum.step='1'; bNum.style.flex='1';
  const bSl=document.createElement('input'); bSl.type='range'; bSl.min='0'; bSl.max='64'; bSl.step='1'; bSl.value=String(currentData.accentRamps[0].count); bSl.style.flex='2';
  const syncBrownCount = (v)=>{ const iv=Math.max(0,Math.min(64,Math.round(v))); setByPath(currentData,'brownRamp.count',iv); setByPath(currentData,'accentRamps.0.count',iv); brownCountGroup.querySelector('label').textContent=`Brown Count — ${iv}`; triggerLiveChange(); refreshPreviews(); };
  bNum.oninput=()=>{ bSl.value=bNum.value; syncBrownCount(bNum.value); }; bSl.oninput=()=>{ bNum.value=bSl.value; syncBrownCount(bSl.value); };
  brownCountRow.appendChild(bNum); brownCountRow.appendChild(bSl); brownCountGroup.appendChild(brownCountRow); brownSection.appendChild(brownCountGroup);
  rampTweak.appendChild(brownSection);

  // Green accent
  const greenSection = document.createElement('div'); greenSection.style.marginBottom='16px';
  greenSection.innerHTML = `<div class="field-label" style="color:#7fb069">Accent 2 — Natural Green — ${currentData.accentRamps[1].count} entries</div>`;
  const greenRow = document.createElement('div'); greenRow.className='palette-ramp-row';
  greenRow.appendChild(makeColorFieldGeneric('Green From (dark forest)', 'greenRamp.from', [18,48,26], ()=>syncAccentFromLegacy(1)));
  greenRow.appendChild(makeColorFieldGeneric('Green To (natural sage)', 'greenRamp.to', [125,185,105], ()=>syncAccentFromLegacy(1)));
  greenSection.appendChild(greenRow);
  const greenCountGroup = document.createElement('div'); greenCountGroup.className='field-group'; greenCountGroup.style.marginTop='8px';
  greenCountGroup.innerHTML = `<label class="field-label">Green Count — ${currentData.accentRamps[1].count}</label>`;
  const greenCountRow = document.createElement('div'); greenCountRow.style.display='flex'; greenCountRow.style.gap='8px'; greenCountRow.style.alignItems='center';
  const gNum=document.createElement('input'); gNum.type='number'; gNum.className='field-input'; gNum.value=currentData.accentRamps[1].count; gNum.min='0'; gNum.max='64'; gNum.step='1'; gNum.style.flex='1';
  const gSl=document.createElement('input'); gSl.type='range'; gSl.min='0'; gSl.max='64'; gSl.step='1'; gSl.value=String(currentData.accentRamps[1].count); gSl.style.flex='2';
  const syncGreenCount = (v)=>{ const iv=Math.max(0,Math.min(64,Math.round(v))); setByPath(currentData,'greenRamp.count',iv); setByPath(currentData,'accentRamps.1.count',iv); greenCountGroup.querySelector('label').textContent=`Green Count — ${iv}`; triggerLiveChange(); refreshPreviews(); };
  gNum.oninput=()=>{ gSl.value=gNum.value; syncGreenCount(gNum.value); }; gSl.oninput=()=>{ gNum.value=gSl.value; syncGreenCount(gSl.value); };
  greenCountRow.appendChild(gNum); greenCountRow.appendChild(gSl); greenCountGroup.appendChild(greenCountRow); greenSection.appendChild(greenCountGroup);
  rampTweak.appendChild(greenSection);

  // Regular desaturated controls
  const regSection = document.createElement('div'); regSection.style.marginBottom='16px';
  regSection.innerHTML = `<div class="field-label">Regular Colours — Desaturated variations — count ${currentData.regularColors.count}, sat ${currentData.regularColors.saturation}</div><div class="field-hint">Not too saturated variations — golden-angle hue distribution with low saturation 0.25-0.6</div>`;
  const regRow = document.createElement('div'); regRow.style.display='flex'; regRow.style.gap='12px'; regRow.style.flexWrap='wrap'; regRow.style.marginTop='8px';
  const makeNumSlider = (label, path, min, max, step, def) => {
    const gg=document.createElement('div'); gg.className='field-group'; gg.style.flex='1'; gg.style.minWidth='160px';
    const cur = (()=>{ try{ const parts=path.split('.'); let cur=currentData; for(const p of parts) cur=cur?.[p]; return cur??def; }catch{return def; }})();
    gg.innerHTML=`<label class="field-label">${label} — ${cur}</label>`;
    const row=document.createElement('div'); row.style.display='flex'; row.style.gap='6px'; row.style.alignItems='center';
    const num=document.createElement('input'); num.type='number'; num.className='field-input'; num.value=cur; num.min=String(min); num.max=String(max); num.step=String(step); num.style.flex='1';
    const sl=document.createElement('input'); sl.type='range'; sl.min=String(min); sl.max=String(max); sl.step=String(step); sl.value=String(cur); sl.style.flex='1.5';
    const sync=(v)=>{ setByPath(currentData, path, parseFloat(v)); gg.querySelector('label').textContent=`${label} — ${v}`; triggerLiveChange(); refreshPreviews(); };
    num.oninput=()=>{ sl.value=num.value; sync(num.value); }; sl.oninput=()=>{ num.value=sl.value; sync(sl.value); };
    row.appendChild(num); row.appendChild(sl); gg.appendChild(row); return gg;
  };
  regRow.appendChild(makeNumSlider('Regular Count', 'regularColors.count', 16, 192, 1, 128));
  regRow.appendChild(makeNumSlider('Saturation', 'regularColors.saturation', 0, 1, 0.02, 0.42));
  regRow.appendChild(makeNumSlider('Sat Var', 'regularColors.saturationVar', 0, 0.5, 0.02, 0.18));
  regRow.appendChild(makeNumSlider('Light Min', 'regularColors.lightnessMin', 0, 0.6, 0.02, 0.32));
  regRow.appendChild(makeNumSlider('Light Max', 'regularColors.lightnessMax', 0.4, 1, 0.02, 0.84));
  regSection.appendChild(regRow);
  rampTweak.appendChild(regSection);

  // Gray controls
  const graySection = document.createElement('div');
  graySection.innerHTML = `<div class="field-label">Grayscale — nice gradient — count ${currentData.grayscale.count}</div><div class="field-hint">Smooth gray from black to white, linear or gamma-corrected</div>`;
  const grayRow = document.createElement('div'); grayRow.style.display='flex'; grayRow.style.gap='12px'; grayRow.style.flexWrap='wrap'; grayRow.style.marginTop='8px';
  grayRow.appendChild(makeNumSlider('Gray Count', 'grayscale.count', 16, 128, 1, 64));
  grayRow.appendChild(makeNumSlider('Gray Gamma', 'grayscale.gamma', 0.2, 3, 0.1, 1));
  graySection.appendChild(grayRow);
  rampTweak.appendChild(graySection);

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
    // border + section separators: first 32 brown, next 32 green, next 128 desat, last 64 gray
    ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.lineWidth=0.5;
    for(let c=1;c<cols;c++){ ctx.beginPath(); ctx.moveTo(c*cellW,0); ctx.lineTo(c*cellW,H); ctx.stroke(); }
    for(let r=1;r<rows;r++){ ctx.beginPath(); ctx.moveTo(0,r*cellH); ctx.lineTo(W,r*cellH); ctx.stroke(); }
    // accent section highlight
    ctx.strokeStyle='rgba(201,168,76,0.5)'; ctx.lineWidth=1.5;
    ctx.strokeRect(0,0,W,cellH*4); // 64 = 4 rows of accents
    ctx.strokeStyle='rgba(127,176,105,0.5)';
    ctx.strokeRect(0,cellH*2,W,cellH*2);
    return pal;
  }
  function drawBanding() {
    const c = root.querySelector('#banding-canvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.width, H=c.height;
    ctx.clearRect(0,0,W,H);
    const pal = genPaletteForPreview(sel.value, currentData);
    // Use actual accent ramps for banding demo – brown + green + gray
    const levels = currentData.bandLevels || 32;
    const showBanding = currentData.authentic;
    // top = smooth brown+green gradient (first 64 colors)
    for(let x=0;x<W;x++){
      const idx = Math.floor((x/W)*64);
      const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2];
      ctx.fillStyle=`rgb(${r},${g},${b})`;
      ctx.fillRect(x,0,1,H/2);
    }
    // bottom = banded same but with bandLevels quantization
    for(let x=0;x<W;x++){
      const idx = Math.floor((x/W)*64);
      const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2];
      let rr=r, gg=g, bb=b;
      if (showBanding) {
        const luma = 0.299*r+0.587*g+0.114*b;
        const bl = Math.floor(luma/255*levels)/levels*255;
        const factor = luma>1 ? bl/luma : 1;
        rr = Math.min(255, r*factor|0); gg = Math.min(255, g*factor|0); bb = Math.min(255, b*factor|0);
      }
      ctx.fillStyle=`rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x,H/2,1,H/2);
    }
    // overlay tick marks for bands
    if (showBanding) {
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1;
      for(let i=1;i<levels;i++){
        const x = (i/levels)*W;
        ctx.beginPath(); ctx.moveTo(x,H/2); ctx.lineTo(x,H); ctx.stroke();
      }
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
    // brown ramp
    const c = root.querySelector('#ramp-canvas');
    if(c){
      const ctx = c.getContext('2d'); const W=c.width, H=c.height; ctx.clearRect(0,0,W,H);
      const rc = (currentData.accentRamps?.[0]?.count ?? currentData.brownRamp?.count ?? 32);
      if(rc<=0){ ctx.fillStyle='#222'; ctx.fillRect(0,0,W,H); } else {
        for(let i=0;i<rc;i++){ const r=pal[i*4], g=pal[i*4+1], b=pal[i*4+2]; const x=(i/rc)*W; ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(x,0,W/rc+1,H); }
      }
    }
    // green ramp
    const cg = root.querySelector('#ramp-canvas-green');
    if(cg){
      const ctx = cg.getContext('2d'); const W=cg.width, H=cg.height; ctx.clearRect(0,0,W,H);
      const ramps = currentData.accentRamps || [];
      const second = ramps[1] || currentData.greenRamp || { count:32 };
      const rc = second.count ?? 32;
      const startIdx = (currentData.accentRamps?.[0]?.count ?? currentData.brownRamp?.count ?? 32);
      if(rc<=0){ ctx.fillStyle='#222'; ctx.fillRect(0,0,W,H); } else {
        for(let i=0;i<rc;i++){ const idx=startIdx+i; if(idx>=256) break; const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2]; const x=(i/rc)*W; ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(x,0,W/rc+1,H); }
      }
    }
    // regular desaturated
    const cr = root.querySelector('#regular-canvas');
    if(cr){
      const ctx=cr.getContext('2d'); const W=cr.width, H=cr.height; ctx.clearRect(0,0,W,H);
      const accentTotal = (currentData.accentRamps||[]).reduce((s,r)=>s+(r.count|0),0) || 64;
      const regCount = currentData.regularColors?.count ?? 128;
      for(let i=0;i<regCount;i++){ const idx=accentTotal+i; if(idx>=256) break; const r=pal[idx*4], g=pal[idx*4+1], b=pal[idx*4+2]; const x=(i/regCount)*W; ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(x,0,W/regCount+1,H); }
    }
    // gray
    const cg2 = root.querySelector('#gray-canvas');
    if(cg2){
      const ctx=cg2.getContext('2d'); const W=cg2.width, H=cg2.height; ctx.clearRect(0,0,W,H);
      const accentTotal = (currentData.accentRamps||[]).reduce((s,r)=>s+(r.count|0),0) || 64;
      const regCount = currentData.regularColors?.count ?? 128;
      const grayStart = accentTotal+regCount;
      const grayCount = 256 - grayStart;
      for(let i=0;i<grayCount;i++){ const idx=grayStart+i; const r=pal[idx*4]; const x=(i/grayCount)*W; ctx.fillStyle=`rgb(${r},${r},${r})`; ctx.fillRect(x,0,W/grayCount+1,H); }
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
      // For palette config, accent ramps etc are managed by custom visual editor — show hint but still allow nested editing
      if (isPaletteConfig() && path === '' && (key === 'brownRamp' || key === 'greenRamp' || key === 'accentRamps' || key === 'regularColors' || key === 'customColors' || key === 'cubeLevels' || (key === 'grayscale' && typeof val === 'object' && ('count' in val || 'from' in val)))) {
        const fg = document.createElement('div'); fg.className='field-group';
        const lbl = document.createElement('label'); lbl.className='field-label'; lbl.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()) + ' — managed above (visual editor)'; fg.appendChild(lbl);
        const hint = document.createElement('div'); hint.className='field-hint';
        if (key === 'brownRamp') hint.textContent = 'Legacy brown ramp — synced to accentRamps[0]. Tweak via color pickers above.';
        else if (key === 'greenRamp') hint.textContent = 'Second accent — natural green, synced to accentRamps[1]. Configurable per level/architecture later.';
        else if (key === 'accentRamps') hint.textContent = '2 accent ramps with good banding: brown + natural green, 32+32 entries. Editable above, supports per-arch override later.';
        else if (key === 'regularColors') hint.textContent = '128 desaturated regular colour variations — low saturation 0.25-0.6, golden-angle hue distribution.';
        else if (key === 'grayscale') hint.textContent = '64 smooth grayscale gradient, gamma-correctable.';
        else if (key === 'customColors') hint.textContent = 'Overrides edited by clicking swatches above.';
        else hint.textContent = 'Cube levels for smooth256 style.';
        fg.appendChild(hint);
        const sub = document.createElement('div'); sub.className='nested-object'; buildForm(sub, val, fp); fg.appendChild(sub);
        container.appendChild(fg);
        continue;
      }
      const fg = document.createElement("div"); fg.className = "field-group";
      const isObjectSection = val !== null && typeof val === "object" && !Array.isArray(val);
      if (isObjectSection) {
        fg.classList.add('object-section');
        const assetKey = current ? `${current.category}/${current.name}` : 'unknown';
        const sectionKey = `form:${assetKey}:${fp}`;
        const isExpanded = expandedFormSections.has(sectionKey);
        const displayName = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        const childCount = Object.keys(val).filter(k => !k.startsWith('_') && !['docs','ui','ranges','schema','editor'].includes(k)).length;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'object-section-toggle';
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.setAttribute('aria-controls', `section-${sectionKey.replace(/[^a-z0-9_-]/gi, '-')}`);
        const docText = getDocForPath(fp);
        if (docText) toggle.title = docText;
        const chevron = document.createElement('span'); chevron.className = 'object-section-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '›';
        const title = document.createElement('span'); title.className = 'object-section-title'; title.textContent = displayName;
        const count = document.createElement('span'); count.className = 'object-section-count'; count.textContent = String(childCount);
        toggle.append(chevron, title, count);
        fg.appendChild(toggle);

        const sub = document.createElement('div');
        sub.className = 'nested-object object-section-content';
        sub.id = toggle.getAttribute('aria-controls');
        sub.hidden = !isExpanded;
        buildForm(sub, val, fp);
        fg.appendChild(sub);

        const setExpanded = expanded => {
          if (expanded) expandedFormSections.add(sectionKey); else expandedFormSections.delete(sectionKey);
          toggle.setAttribute('aria-expanded', String(expanded));
          sub.hidden = !expanded;
          fg.classList.toggle('is-expanded', expanded);
        };
        fg.classList.toggle('is-expanded', isExpanded);
        toggle.onclick = () => setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
        toggle.onkeydown = event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); setExpanded(true); }
          else if (event.key === 'ArrowLeft') { event.preventDefault(); setExpanded(false); }
        };
        container.appendChild(fg);
        continue;
      }
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
