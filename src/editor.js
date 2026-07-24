import { getAssetList, getAsset, saveAsset } from "./config/config.js";

const $ = id => document.getElementById(id);
let current = null, currentData = null, mode = "visual";
const collapsed = new Set();

function status(msg, type = "ok") {
  const el = $("status-area"); el.innerHTML = `<span class="status-pill ${type}">${msg}</span>`;
  setTimeout(() => el.innerHTML = "", 3000);
}
function formatLabel(s) { return s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function iconFor(name, isFolder) { if (isFolder) return "ph-folder"; const ext = name.split(".").pop(); const m = { json: "ph-file-code", md: "ph-file-text", png: "ph-file-png", jpg: "ph-file-jpg", js: "ph-file-js", css: "ph-file-css", html: "ph-file-html" }; return m[ext] || "ph-file"; }

async function init() {
  const list = await getAssetList();
  const tree = $("asset-tree"); tree.innerHTML = "";
  const byCat = {}; list.forEach(a => (byCat[a.category] = byCat[a.category] || []).push(a));

  // Root assets folder node
  const root = document.createElement("div"); root.className = "tree-node";
  const rootHdr = document.createElement("div"); rootHdr.className = "tree-folder";
  rootHdr.innerHTML = `<span class="tree-chevron">▼</span><i class="ph ph-folder tree-icon"></i><span>assets</span>`;
  const rootBody = document.createElement("div"); rootBody.className = "tree-children";
  let rootOpen = true;
  rootHdr.onclick = () => { rootOpen = !rootOpen; rootHdr.querySelector(".tree-chevron").textContent = rootOpen ? "▼" : "▶"; rootBody.style.display = rootOpen ? "" : "none"; };
  root.appendChild(rootHdr); root.appendChild(rootBody); tree.appendChild(root);

  Object.keys(byCat).sort().forEach(cat => {
    const folder = document.createElement("div"); folder.className = "tree-node";
    const hdr = document.createElement("div"); hdr.className = "tree-folder"; hdr.style.paddingLeft = "20px";
    const isCol = collapsed.has(cat);
    hdr.innerHTML = `<span class="tree-chevron">${isCol ? "▶" : "▼"}</span><i class="ph ph-folder tree-icon"></i><span>${formatLabel(cat)}</span>`;
    const body = document.createElement("div"); body.className = "tree-children"; body.style.display = isCol ? "none" : "";
    hdr.onclick = () => { const nowCol = body.style.display !== "none"; body.style.display = nowCol ? "none" : ""; hdr.querySelector(".tree-chevron").textContent = nowCol ? "▶" : "▼"; nowCol ? collapsed.add(cat) : collapsed.delete(cat); };
    folder.appendChild(hdr); folder.appendChild(body);

    byCat[cat].sort((a, b) => a.name.localeCompare(b.name)).forEach(a => {
      const item = document.createElement("div");
      item.className = "tree-file"; item.dataset.cat = a.category; item.dataset.name = a.name;
      item.style.paddingLeft = "40px";
      item.innerHTML = `<i class="ph ${iconFor(a.name + ".json")} tree-icon"></i>${a.name}.json<span style="margin-left:auto;opacity:.35;font-size:11px">${a.itemCount}</span>`;
      item.onclick = e => { e.stopPropagation(); selectAsset(a.category, a.name, item); };
      body.appendChild(item);
    });
    rootBody.appendChild(folder);
  });

  const first = tree.querySelector(".tree-file"); if (first) first.click();
  $("btn-save").onclick = saveCurrent;

  // Resizer
  const resizer = $("sidebar-resizer"), sidebar = $("sidebar");
  let dragging = false;
  resizer.onmousedown = e => { dragging = true; document.body.style.cursor = "col-resize"; e.preventDefault(); };
  document.onmousemove = e => { if (!dragging) return; const w = Math.max(180, Math.min(480, e.clientX)); sidebar.style.width = w + "px"; };
  document.onmouseup = () => { dragging = false; document.body.style.cursor = ""; };
}

async function selectAsset(cat, name, el) {
  document.querySelectorAll(".tree-file").forEach(i => i.classList.remove("active"));
  if (el) el.classList.add("active");
  current = { category: cat, name };
  $("editor-title").textContent = `assets / ${cat} / ${name}.json`;
  currentData = await getAsset(cat, name);
  mode = "visual"; render();
}

function render() {
  const panel = $("editor-panel");
  panel.innerHTML = `<div class="tabs"><button class="tab ${mode==='visual'?'active':''}" id="tab-visual">Visual Editor</button><button class="tab ${mode==='raw'?'active':''}" id="tab-raw">Raw JSON</button></div><div id="tab-content"></div>`;
  $("tab-visual").onclick = () => { syncFromUI(); mode = "visual"; render(); };
  $("tab-raw").onclick = () => { syncFromUI(); mode = "raw"; render(); };
  if (mode === "visual") renderVisual(); else renderRaw();
}
function renderVisual() { const c = $("tab-content"); c.innerHTML = ""; if (!currentData) return; const f = document.createElement("div"); f.className = "form-root"; buildForm(f, currentData, ""); c.appendChild(f); }
function renderRaw() { $("tab-content").innerHTML = `<div class="field-group"><label class="field-label">JSON Definition</label><textarea class="json-editor" id="json-ta" spellcheck="false">${JSON.stringify(currentData, null, 2)}</textarea><div class="field-hint">Edit JSON directly. Must remain valid. Switch back to Visual to see structured view.</div></div>`; }

function buildForm(container, obj, path) {
  if (Array.isArray(obj)) {
    const wrap = document.createElement("div"); wrap.className = "array-wrap";
    obj.forEach((item, i) => {
      const itemEl = document.createElement("div"); itemEl.className = "array-item";
      const header = document.createElement("div"); header.className = "array-header";
      header.innerHTML = `<span class="array-index">#${i}${item.name ? ' · ' + item.name : item.id ? ' · id ' + item.id : ''}</span><button class="btn-icon" data-del="${path}[${i}]">✕</button>`;
      header.querySelector("button").onclick = () => { obj.splice(i, 1); render(); };
      itemEl.appendChild(header); const body = document.createElement("div"); body.className = "array-body";
      buildForm(body, item, `${path}[${i}]`); itemEl.appendChild(body); wrap.appendChild(itemEl);
    });
    const addBtn = document.createElement("button"); addBtn.className = "btn btn-sm btn-secondary"; addBtn.textContent = "+ Add item";
    addBtn.onclick = () => { obj.push({}); render(); }; wrap.appendChild(addBtn); container.appendChild(wrap); return;
  }
  if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const val = obj[key]; const fp = path ? `${path}.${key}` : key;
      const fg = document.createElement("div"); fg.className = "field-group";
      const lbl = document.createElement("label"); lbl.className = "field-label"; lbl.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); fg.appendChild(lbl);
      if (typeof val === "number") {
        const row = document.createElement("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
        const inp = document.createElement("input"); inp.type = "number"; inp.className = "field-input"; inp.value = val; inp.step = "any"; inp.style.flex = "1";
        inp.oninput = () => setByPath(currentData, fp, parseFloat(inp.value) || 0); row.appendChild(inp);
        if (val >= 0 && val <= 1 && key.match(/roughness|metal|chance|weight|strength|opacity|scale|mult/i) || key === "metal") {
          const sl = document.createElement("input"); sl.type = "range"; sl.min = "0"; sl.max = "1"; sl.step = "0.01"; sl.value = val; sl.style.flex = "2";
          sl.oninput = () => { inp.value = sl.value; setByPath(currentData, fp, parseFloat(sl.value)); };
          inp.oninput = () => { sl.value = inp.value; setByPath(currentData, fp, parseFloat(inp.value) || 0); }; row.appendChild(sl);
        }
        fg.appendChild(row);
      } else if (typeof val === "string") {
        const inp = document.createElement("input"); inp.type = "text"; inp.className = "field-input"; inp.value = val;
        inp.oninput = () => setByPath(currentData, fp, inp.value); fg.appendChild(inp);
      } else if (typeof val === "boolean") {
        const tog = document.createElement("label"); tog.className = "toggle";
        tog.innerHTML = `<input type="checkbox" ${val ? "checked" : ""}><span class="toggle-slider"></span><span style="margin-left:8px;font-size:13px;color:var(--text-dim)">${val ? "enabled" : "disabled"}</span>`;
        tog.querySelector("input").onchange = e => { setByPath(currentData, fp, e.target.checked); tog.querySelector("span:last-child").textContent = e.target.checked ? "enabled" : "disabled"; };
        fg.appendChild(tog);
      } else if (val === null) {
        const inp = document.createElement("input"); inp.type = "text"; inp.className = "field-input"; inp.placeholder = "null"; inp.value = "";
        inp.oninput = () => setByPath(currentData, fp, inp.value === "" ? null : inp.value); fg.appendChild(inp);
        const hint = document.createElement("div"); hint.className = "field-hint"; hint.textContent = "Empty = null"; fg.appendChild(hint);
      } else if (Array.isArray(val) && val.length === 3 && val.every(n => typeof n === "number")) {
        const row = document.createElement("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.alignItems = "center";
        const toHex = arr => "#" + arr.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
        const fromHex = hex => { const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : val; };
        const col = document.createElement("input"); col.type = "color"; col.value = toHex(val); col.style.width = "44px"; col.style.height = "36px"; col.style.border = "none"; col.style.borderRadius = "6px"; col.style.cursor = "pointer";
        const nums = document.createElement("div"); nums.style.display = "flex"; nums.style.gap = "4px"; nums.style.flex = "1";
        const inputs = [0, 1, 2].map(i => { const inp = document.createElement("input"); inp.type = "number"; inp.className = "field-input"; inp.value = val[i]; inp.min = "0"; inp.max = "255"; inp.style.width = "0"; inp.style.flex = "1"; return inp; });
        const update = () => { const arr = inputs.map(inp => parseInt(inp.value) || 0); col.value = toHex(arr); setByPath(currentData, fp, arr); };
        col.oninput = () => { const arr = fromHex(col.value); inputs.forEach((inp, i) => inp.value = arr[i]); setByPath(currentData, fp, arr); };
        inputs.forEach(inp => inp.oninput = update); row.appendChild(col); inputs.forEach(inp => nums.appendChild(inp)); row.appendChild(nums); fg.appendChild(row);
      } else if (Array.isArray(val)) { const sub = document.createElement("div"); sub.className = "nested-array"; buildForm(sub, val, fp); fg.appendChild(sub);
      } else if (typeof val === "object") { const sub = document.createElement("div"); sub.className = "nested-object"; buildForm(sub, val, fp); fg.appendChild(sub); }
      container.appendChild(fg);
    }
  }
}
function setByPath(obj, path, value) { const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let cur = obj; for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]; cur[parts[parts.length - 1]] = value; }
function syncFromUI() { if (mode === "raw") { const ta = document.getElementById("json-ta"); if (ta) { try { currentData = JSON.parse(ta.value); } catch (e) { status("Invalid JSON — fix in raw mode", "err"); mode = "raw"; throw e; } } } }
async function saveCurrent() { try { syncFromUI(); } catch { return; } if (!current) return; const ok = await saveAsset(current.category, current.name, currentData); status(ok ? "Saved to disk" : "Save failed", ok ? "ok" : "err"); }
init();