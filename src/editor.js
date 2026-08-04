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
        if (ok && cur && typeof cur === 'object' && ('min' in cur || 'max' in cur || 'desc' in cur || 'description' in cur)) {
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
function renderVisual() { const c = $("tab-content"); if (!c) return; c.innerHTML = ""; if (!currentData) return; const f = document.createElement("div"); f.className = "form-root"; buildForm(f, currentData, ""); c.appendChild(f); }
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
        const inp = document.createElement("input"); inp.type = "text"; inp.className = "field-input"; inp.value = val;
        inp.oninput = () => { setByPath(currentData, fp, inp.value); triggerLiveChange(); }; fg.appendChild(inp);
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
