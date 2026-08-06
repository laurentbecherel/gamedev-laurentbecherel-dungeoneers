// LiveConfigManager — Task 7 live-edit system
// Provides cross-tab BroadcastChannel instant preview + SSE persisted broadcast + localStorage fallback + polling fallback
// No new deps, vanilla ES modules.

import { CONFIG_PATHS, getAsset, invalidatePathCache, invalidateCache, setPathCache } from './config.js';

function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch { return o; } }

// Tier classification per architecture plan
const TIER_MAP = {
  // T1 instant uniform (no atlas, no regen) — Task10: material-modifiers also T1 (modifier params UBO live-tunable)
  'fog': 'T1',
  'lighting': 'T1',
  'shadows': 'T1',
  'rendering': 'T1',
  'palette': 'T1',
  'pom': 'T1',
  'pbr': 'T1',
  'ao': 'T1',
  'chamfer': 'T1',
  'corners': 'T1',
  'raymarch': 'T1',
  'player': 'T1',
  'discovery': 'T1',
  'map': 'T1',
  'debug': 'T1',
  'sprites': 'T1',
  'light-types': 'T1',
  'particles': 'T1',
  'material-modifiers': 'T1',
  'ssr': 'T1',
  'liquids': 'T1',
  'main': 'T1',
  // T2 array rebuild
  'materials-proc': 'T2',
  'architectures': 'T3',
  // T3 regen-required (map structure + per-cell mat IDs)
  'generator': 'T3',
  'material-assignments': 'T3',
  'structural-features': 'T3'
};

const PATH_TIER_OVERRIDES = {
  'config/rendering/materials-proc': 'T2',
  'config/materials-proc': 'T2',
  'config/materials/walls': 'T2',
  'config/materials/floors': 'T2',
  'config/materials/ceils': 'T2',
  'materials/walls': 'T2',
  'materials/floors': 'T2',
  'materials/ceils': 'T2',
  'materials/architectures': 'T3',
  'config/gameplay/generator': 'T3',
  'config/generator': 'T3',
  'config/rendering/material-assignments': 'T3',
  'config/material-assignments': 'T3',
  'config/lighting/fog': 'T1',
  'config/fog': 'T1',
  'config/lighting/lighting': 'T1',
  'config/lighting': 'T1',
  'config/lighting/sprites': 'T1',
  'config/lighting/light-types': 'T1',
  'config/geometry/chamfer': 'T1',
  'config/geometry/corners': 'T1',
  'config/geometry/structural-features': 'T3',
  'config/rendering/liquids': 'T1',
  'config/rendering/material-modifiers': 'T1',
  'config/material-modifiers': 'T1',
  'config/rendering/ssr': 'T1',
  'config/ssr': 'T1',
};

export function getTierForLogical(logicalOrPath) {
  if (!logicalOrPath) return 'T1';
  const key = String(logicalOrPath).trim();
  // direct path override
  if (PATH_TIER_OVERRIDES[key]) return PATH_TIER_OVERRIDES[key];
  // check if key contains materials-proc etc
  const lower = key.toLowerCase();
  if (lower.includes('materials-proc') || lower.includes('materials/walls') || lower.includes('materials/floors') || lower.includes('materials/ceils')) return 'T2';
  if (lower.includes('generator')) return 'T3';
  if (lower.includes('architectures')) return 'T3';
  if (lower.includes('materials') && (lower.includes('walls') || lower.includes('floors') || lower.includes('ceils'))) return 'T2';
  // path like config/lighting/fog -> extract last segment as logical?
  const last = key.split('/').pop();
  if (TIER_MAP[last]) return TIER_MAP[last];
  if (TIER_MAP[key]) return TIER_MAP[key];
  return 'T1';
}
export function getTierForPath(category, name) {
  const path = `${category}/${name}`;
  return getTierForLogical(path);
}

// Reverse lookup: path -> [logical]
let _reverseMap = null;
function buildReverseMap() {
  if (_reverseMap) return _reverseMap;
  const map = {};
  for (const [logical, candidates] of Object.entries(CONFIG_PATHS)) {
    for (const p of candidates) {
      if (!map[p]) map[p] = [];
      if (!map[p].includes(logical)) map[p].push(logical);
    }
  }
  _reverseMap = map;
  return map;
}
export function reverseLookupPath(path) {
  const map = buildReverseMap();
  return map[path] ? [...map[path]] : [];
}
export function reverseLookupCategoryName(category, name) {
  return reverseLookupPath(`${category}/${name}`);
}

// CrossTabBus wrapper
class CrossTabBus {
  constructor(channelName) {
    this.name = channelName;
    this.listeners = new Set();
    this.bc = null;
    this._onStorage = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel(channelName);
        this.bc.onmessage = (ev) => {
          const data = ev.data;
          this.listeners.forEach(cb => { try { cb(data); } catch {} });
        };
      }
    } catch {
      this.bc = null;
    }
    if (!this.bc && typeof window !== 'undefined') {
      this._onStorage = (e) => {
        if (e.key === channelName && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            // ignore internal _ls noise? still dispatch
            this.listeners.forEach(cb => { try { cb(data); } catch {} });
          } catch {}
        }
      };
      try { window.addEventListener('storage', this._onStorage); } catch {}
    }
  }
  post(data) {
    try {
      if (this.bc) {
        this.bc.postMessage(data);
      } else if (typeof localStorage !== 'undefined') {
        // Use random suffix to force storage event even if same content? add _rand
        const payload = { ...data, _lsRand: Math.random(), _lsTs: Date.now() };
        localStorage.setItem(this.name, JSON.stringify(payload));
      }
    } catch {}
    // Also dispatch window event for same-tab? Not needed but for debugging
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dungeoneers-crosstab', { detail: data }));
      }
    } catch {}
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  close() {
    try { if (this.bc) this.bc.close(); } catch {}
    this.listeners.clear();
    if (this._onStorage && typeof window !== 'undefined') {
      try { window.removeEventListener('storage', this._onStorage); } catch {}
    }
  }
}

const BC_CHANNEL = 'dungeoneers-live-edit';

export class LiveConfigManager {
  constructor() {
    this.enabled = false;
    this.tabId = `tab-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    this.bus = null;
    this.es = null;
    this.status = 'offline'; // offline | connecting | connected | bc-only | polling
    this.listeners = new Map(); // pattern -> Set<cb>
    this.statusListeners = new Set();
    this.retryCount = 0;
    this.sseRetryTimer = null;
    this.pollTimer = null;
    this.lastSSETime = 0;
    this._bcUnsub = null;
    this._pendingUnsaved = new Map(); // path -> data for preview-only tracking
  }

  // Status handling
  _setStatus(s) {
    if (this.status !== s) {
      this.status = s;
      this.statusListeners.forEach(cb => { try { cb(s); } catch {} });
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dungeoneers-live-status', { detail: s }));
      } catch {}
    }
  }
  onStatus(cb) {
    this.statusListeners.add(cb);
    try { cb(this.status); } catch {}
    return () => this.statusListeners.delete(cb);
  }
  getStatus() { return this.status; }

  // Pattern matching for subscribe
  _match(pattern, logicalOrNull, category, name) {
    if (pattern === '*') return true;
    const path = `${category}/${name}`;
    if (pattern === path) return true;
    if (logicalOrNull && pattern === logicalOrNull) return true;
    // also last segment match?
    if (pattern === name) return true;
    // If pattern is logical and logicalOrNull is array? we handle array separately
    if (Array.isArray(logicalOrNull) && logicalOrNull.includes(pattern)) return true;
    return false;
  }

  subscribe(pattern, cb) {
    const pat = pattern || '*';
    if (!this.listeners.has(pat)) this.listeners.set(pat, new Set());
    this.listeners.get(pat).add(cb);
    return () => {
      const set = this.listeners.get(pat);
      if (set) { set.delete(cb); if (set.size === 0) this.listeners.delete(pat); }
    };
  }

  _notify(logicalOrArray, category, name, data, source) {
    const logicalList = Array.isArray(logicalOrArray) ? logicalOrArray : (logicalOrArray ? [logicalOrArray] : []);
    const tier = getTierForPath(category, name);
    const payload = { logical: logicalList[0] || null, logicals: logicalList, category, name, path: `${category}/${name}`, data: clone(data), source, tier, ts: Date.now() };
    // for each pattern in listeners map, check match against any logical or path
    for (const [pattern, cbs] of this.listeners.entries()) {
      let matched = false;
      if (pattern === '*') matched = true;
      else if (pattern === `${category}/${name}`) matched = true;
      else if (pattern === name) matched = true;
      else if (logicalList.includes(pattern)) matched = true;
      else if (logicalList.some(l => this._match(pattern, l, category, name))) matched = true;
      else if (this._match(pattern, null, category, name)) matched = true;
      if (matched) {
        for (const cb of cbs) { try { cb(payload); } catch (e) { console.warn('[Live] listener error', e); } }
      }
    }
    // window event
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dungeoneers-config-live-updated', { detail: payload }));
    } catch {}
  }

  // Setup BroadcastChannel bus
  _setupBus() {
    if (this.bus) { try { this.bus.close(); } catch {} this.bus = null; }
    this.bus = new CrossTabBus(BC_CHANNEL);
    this._bcUnsub = this.bus.on((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.tabId && msg.tabId === this.tabId) return; // ignore self echo
      if (msg.type === 'preview') {
        const { category, name, data, source } = msg;
        if (!category || !name || !data) return;
        // For preview-only mode, do not persist, just apply in memory
        // Still update path cache in memory for fast getAsset? We'll update via setPathCache but track unsaved
        try { setPathCache(category, name, data); } catch {}
        const logicals = reverseLookupCategoryName(category, name);
        this._pendingUnsaved.set(`${category}/${name}`, clone(data));
        this._notify(logicals, category, name, data, source || 'bc-preview');
        this._setStatus('bc-only'); // at least BC works
        if (this.status === 'connected') this._setStatus('connected'); // keep connected if SSE also alive, but bc-only may still be valid; we'll keep connected if ES open
        // If ES is also connected, keep connected status
        if (this.es && this.es.readyState === 1) this._setStatus('connected');
      } else if (msg.type === 'asset-updated') {
        // forwarded from SSE? but we handle SSE directly; still allow bus forwarding for multi-window if SSE fails
        const { category, name } = msg;
        if (!category || !name) return;
        this._handleRemoteFetch(category, name, 'bc-asset-updated');
      }
    });
  }

  async _handleRemoteFetch(category, name, source) {
    // Invalidate both path and logical caches to force fresh fetch (getAsset checks logical cache first for config/*)
    const logicals = reverseLookupCategoryName(category, name);
    try { invalidatePathCache(category, name); } catch {}
    for (const lg of logicals) { try { invalidateCache(lg); } catch {} }
    let data = null;
    // fallback direct fetch to avoid stale logical cache shortcut
    try {
      const r = await fetch(`/api/assets/${category}/${name}`);
      if (r.ok) data = await r.json();
    } catch {}
    if (!data) {
      try { data = await getAsset(category, name); } catch {}
    }
    if (!data) return;
    // Update caches with fresh data
    try { setPathCache(category, name, data); } catch {}
    // Clear unsaved pending if now persisted
    this._pendingUnsaved.delete(`${category}/${name}`);
    this._notify(logicals, category, name, data, source);
  }

  _setupSSE() {
    // Close old
    if (this.es) { try { this.es.close(); } catch {} this.es = null; }
    if (this.sseRetryTimer) { clearTimeout(this.sseRetryTimer); this.sseRetryTimer = null; }
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      this._setStatus('bc-only');
      this._startPolling();
      return;
    }
    try {
      this._setStatus('connecting');
      const es = new EventSource('/api/watch');
      this.es = es;
      es.addEventListener('asset-updated', async (ev) => {
        this.lastSSETime = Date.now();
        this.retryCount = 0;
        this._setStatus('connected');
        let parsed = null;
        try { parsed = JSON.parse(ev.data); } catch { return; }
        const { category, name } = parsed;
        if (!category || !name) return;
        await this._handleRemoteFetch(category, name, 'sse');
      });
      es.onopen = () => { this.retryCount = 0; this._setStatus('connected'); this._stopPolling(); };
      es.onerror = () => {
        // EventSource auto retries, but we track
        this.retryCount++;
        if (this.retryCount > 3) {
          this._setStatus('polling');
          this._startPolling();
          // close and retry after backoff
          try { es.close(); } catch {}
          if (this.enabled) {
            const backoff = Math.min(10000, 1000 * Math.pow(2, this.retryCount));
            this.sseRetryTimer = setTimeout(() => { if (this.enabled) this._setupSSE(); }, backoff);
          }
        } else {
          this._setStatus('connecting');
        }
      };
    } catch (e) {
      console.warn('[Live] SSE setup failed', e);
      this._setStatus('bc-only');
      this._startPolling();
    }
  }

  _startPolling() {
    if (this.pollTimer) return;
    // Simple polling: every 5s re-fetch known cached paths and check diff? For MVP just keep status polling
    // We'll implement diff check by fetching getAsset for each known path that had recent activity? Simpler: fetch asset list? Could compare counts.
    // For fallback we poll each logical that we have ever seen? For now just keep status as polling and rely on BC.
    this.pollTimer = setInterval(async () => {
      // If no activity, do nothing, but if we want to detect external file edits without SSE, we could fetch all
      // Lightweight: fetch /api/assets list and then for each cached path that we have pending? Instead fetch specific recently watched assets
      // We'll attempt to re-establish SSE each polling cycle if not connected
      if (this.status !== 'connected' && this.enabled) {
        // try reconnect SSE occasionally
        if (Date.now() - this.lastSSETime > 15000) this._setupSSE();
      }
    }, 5000);
  }
  _stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('dungeoneers-live-enabled', '1'); } catch {}
    this._setupBus();
    this._setupSSE();
    this._setStatus('connecting');
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dungeoneers-live-enabled', { detail: true })); } catch {}
  }
  disable() {
    this.enabled = false;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('dungeoneers-live-enabled', '0'); } catch {}
    if (this.es) { try { this.es.close(); } catch {} this.es = null; }
    if (this.bus) { try { this.bus.close(); } catch {} this.bus = null; }
    if (this._bcUnsub) { try { this._bcUnsub(); } catch {} this._bcUnsub = null; }
    this._stopPolling();
    if (this.sseRetryTimer) { clearTimeout(this.sseRetryTimer); this.sseRetryTimer = null; }
    this._setStatus('offline');
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dungeoneers-live-enabled', { detail: false })); } catch {}
  }

  publishPreview(category, name, data, extra = {}) {
    if (!this.enabled) return;
    const msg = { type: 'preview', category, name, data: clone(data), tabId: this.tabId, source: extra.source || 'editor', ts: Date.now() };
    // track unsaved
    this._pendingUnsaved.set(`${category}/${name}`, clone(data));
    // post via bus
    if (this.bus) this.bus.post(msg);
    // also notify self? For single-tab testing (same tab publish and subscribe), we want to also notify local listeners? Typically game is different tab, but for tests single tab may want to hear own preview if source is local.
    // We skip self echo via tabId check in bus, but for local same tab we still want notify? We'll notify locally but mark source as local-preview
    // To avoid double notify when bc echoes back, we already ignore self tabId in bus, so we need to optionally notify now for same-tab listeners if needed.
    // For editor→game cross-tab, game receives via BC.
    // For test that does publishPreview and expects game in same context to update (when editor and game are different pages but same bus, different tabId), it'll work.
    // If same tab both publishes and subscribes (e.g., test single page), we should notify after posting.
    if (extra.notifySelf) {
      const logicals = reverseLookupCategoryName(category, name);
      this._notify(logicals, category, name, data, extra.source || 'preview-self');
    }
  }

  publishAssetUpdated(category, name) {
    // Called after PUT success? Server will broadcast via SSE, but we also post via BC for immediate feedback before SSE roundtrip
    const msg = { type: 'asset-updated', category, name, path: `${category}/${name}`, tabId: this.tabId, ts: Date.now(), source: 'editor-save' };
    if (this.bus) this.bus.post(msg);
    this._pendingUnsaved.delete(`${category}/${name}`);
  }

  isPreviewPending(category, name) {
    return this._pendingUnsaved.has(`${category}/${name}`);
  }
  getPendingPreview() { return new Map(this._pendingUnsaved); }
  clearPending() { this._pendingUnsaved.clear(); }

  // Utility for tests
  _getBus() { return this.bus; }
  _getES() { return this.es; }
}

// Singleton
let _instance = null;
export function getLiveConfigManager() {
  if (!_instance) _instance = new LiveConfigManager();
  return _instance;
}
export function resetLiveConfigManagerForTest() {
  if (_instance) { try { _instance.disable(); } catch {} _instance = null; }
}
