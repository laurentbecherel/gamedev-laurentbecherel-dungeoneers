let _cache = null;
const _caches = {}; // logical name -> data
const _pathCache = {}; // api path -> data (for getAsset fallback cache)

function clone(o){ return JSON.parse(JSON.stringify(o)); }

// Mapping of logical config name -> ordered candidate API paths (without /api/assets/ prefix and without .json)
// First existing wins. This supports both new subfolder layout and old flat layout for backward compat.
// Exported for LiveConfigManager reverse lookup.
export const CONFIG_PATHS = {
  // rendering subsystem
  'rendering':      ['config/rendering/rendering', 'config/rendering', 'config/main'],
  'palette':        ['config/rendering/palette', 'config/palette', 'config/main'],
  'pom':            ['config/rendering/pom', 'config/pom', 'config/rendering/rendering', 'config/main'],
  'pbr':            ['config/rendering/pbr', 'config/pbr', 'config/main'],
  'ao':             ['config/rendering/ao', 'config/ao', 'config/main'],
  'raymarch':       ['config/rendering/raymarch', 'config/raymarch', 'config/main'],
  'materials-proc': ['config/rendering/materials-proc', 'config/materials-proc', 'config/main'],
  'material-assignments': ['config/rendering/material-assignments', 'config/material-assignments', 'config/main'],
  'material-modifiers': ['config/rendering/material-modifiers', 'config/material-modifiers', 'config/main'],
  'material-modifiers.json': ['config/rendering/material-modifiers', 'config/main'],
  'architectures': ['materials/architectures'],
  'ssr': ['config/rendering/ssr', 'config/ssr', 'config/main'],
  'ssr.json': ['config/rendering/ssr', 'config/main'],
  // lighting — Task 6 extended, Task10: 8 lights
  'lighting':       ['config/lighting/lighting', 'config/lighting', 'config/main'],
  'shadows':        ['config/lighting/shadows', 'config/shadows', 'config/main'],
  'fog':            ['config/lighting/fog', 'config/fog', 'config/lighting/fog', 'config/main'],
  'sprites':        ['config/lighting/sprites', 'config/sprites', 'config/main'],
  'light-types':    ['config/lighting/light-types', 'config/light-types', 'config/main'],
  'particles':      ['config/lighting/particles', 'config/particles', 'config/main'],
  // geometry
  'chamfer':        ['config/geometry/chamfer', 'config/chamfer', 'config/main'],
  'corners':        ['config/geometry/corners', 'config/corners', 'config/main'],
  'structural-features': ['config/geometry/structural-features', 'config/structural-features', 'config/main'],
  'liquids':        ['config/rendering/liquids', 'config/liquids', 'config/main'],
  // gameplay
  'generator':      ['config/gameplay/generator', 'config/generator', 'config/main'],
  'player':         ['config/gameplay/player', 'config/player', 'config/main'],
  'discovery':      ['config/gameplay/discovery', 'config/discovery', 'config/ui/map', 'config/main'],
  // ui
  'map':            ['config/ui/map', 'config/map', 'config/main'],
  'debug':          ['config/ui/debug', 'config/debug', 'config/main'],
  // legacy
  'main':           ['config/main']
};

function fetchWithTimeout(url, opts={}, timeoutMs=5000){
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let timer = null;
  if(controller && timeoutMs>0){
    timer = setTimeout(()=>{ try{ controller.abort(); }catch{} }, timeoutMs);
  }
  const fetchOpts = signal ? {...opts, signal} : opts;
  return fetch(url, fetchOpts).finally(()=>{ if(timer) clearTimeout(timer); });
}

async function _fetchFromCandidates(candidates){
  for(const p of candidates){
    const fullName = p.split('/').pop();
    const cat = p.split('/').slice(0,-1).join('/');
    // check pathCache
    if(_pathCache[p]) return { path: p, data: clone(_pathCache[p]) };
    try{
      console.log('[config] fetching candidate', p);
      const r = await fetchWithTimeout('/api/assets/' + p, {}, 5000);
      if(!r.ok){
        console.warn('[config] candidate not ok', p, r.status);
        continue;
      }
      const j = await r.json();
      _pathCache[p] = clone(j);
      console.log('[config] candidate ok', p);
      return { path: p, data: clone(j) };
    }catch(e){
      console.warn('[config] candidate fetch failed', p, e?.name, e?.message);
      continue;
    }
  }
  return null;
}

async function _fetchConfig(logicalName){
  if(_caches[logicalName]) return clone(_caches[logicalName]);
  const candidates = CONFIG_PATHS[logicalName] || ['config/' + logicalName];
  const res = await _fetchFromCandidates(candidates);
  if(!res){
    console.error('getConfig ' + logicalName + ' failed — tried', candidates);
    throw new Error(logicalName + ' not found');
  }
  _caches[logicalName] = clone(res.data);
  // also cache by path for getAsset
  _pathCache[res.path] = clone(res.data);
  return clone(res.data);
}

async function _saveConfig(logicalName, cfg){
  // Save to primary path (first candidate)
  const candidates = CONFIG_PATHS[logicalName] || ['config/' + logicalName];
  const primary = candidates[0];
  const r = await fetch('/api/assets/' + primary, {
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(cfg)
  });
  if(!r.ok) throw new Error(logicalName + ' save failed at ' + primary);
  _caches[logicalName] = clone(cfg);
  _pathCache[primary] = clone(cfg);
  if(logicalName === 'main') _cache = clone(cfg);
  return true;
}

export async function getConfig(){
  if(_cache) return clone(_cache);
  try{
    console.log('[config] fetching config/main');
    const r = await fetchWithTimeout('/api/assets/config/main', {}, 5000);
    if(!r.ok) throw new Error('main not ok '+r.status);
    _cache = await r.json();
    _caches['main'] = clone(_cache);
    _pathCache['config/main'] = clone(_cache);
    console.log('[config] config/main ok');
    return clone(_cache);
  }catch(e){
    console.error('getConfig failed — config asset must exist at src/assets/config/main.json', e?.name, e?.message, e);
    throw e;
  }
}
export function getConfigSync(){
  if(!_cache) throw new Error('Config not loaded yet — call getConfig() first');
  return clone(_cache);
}
export async function saveConfig(cfg){
  const r=await fetch('/api/assets/config/main',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
  if(!r.ok) throw new Error('save failed');
  _cache=clone(cfg);
  _caches['main']=clone(cfg);
  _pathCache['config/main']=clone(cfg);
  window.dispatchEvent(new CustomEvent('dungeoneers-config-saved',{detail:cfg}));
  return true;
}

// Generic accessors
export function getCachedConfig(name){ return _caches[name] ? clone(_caches[name]) : null; }
export async function getRenderingConfig(){ return _fetchConfig('rendering'); }
export async function getPaletteConfig(){ return _fetchConfig('palette'); }
export async function getPomConfig(){ return _fetchConfig('pom'); }
export async function getPbrConfig(){ return _fetchConfig('pbr'); }
export async function getAoConfig(){ return _fetchConfig('ao'); }
export async function getLightingConfig(){ return _fetchConfig('lighting'); }
export async function getShadowsConfig(){ return _fetchConfig('shadows'); }
export async function getChamferConfig(){ return _fetchConfig('chamfer'); }
export async function getCornersConfig(){ return _fetchConfig('corners'); }
export async function getRaymarchConfig(){ return _fetchConfig('raymarch'); }
export async function getMapConfig(){ return _fetchConfig('map'); }
export async function getMaterialsProcConfig(){ return _fetchConfig('materials-proc'); }
export async function getPlayerConfig(){ return _fetchConfig('player'); }
export async function getDebugConfig(){ return _fetchConfig('debug'); }
export async function getDiscoveryConfig(){ return _fetchConfig('discovery'); }
export async function saveDiscoveryConfig(cfg){ return _saveConfig('discovery', cfg); }
export async function getGeneratorConfig(){ return _fetchConfig('generator'); }
export async function saveGeneratorConfig(cfg){ return _saveConfig('generator', cfg); }
export async function getFogConfig(){ return _fetchConfig('fog'); }
export async function getSpritesConfig(){ return _fetchConfig('sprites'); }
export async function getLightTypesConfig(){ return _fetchConfig('light-types'); }
export async function getParticlesConfig(){ return _fetchConfig('particles'); }
export async function getMaterialModifiersConfig(){ return _fetchConfig('material-modifiers'); }
export async function getSSRConfig(){ return _fetchConfig('ssr'); }
export async function getStructuralFeaturesConfig(){ return _fetchConfig('structural-features'); }
export async function getLiquidsConfig(){ return _fetchConfig('liquids'); }
export async function getMaterialAssignmentsConfig(){ return _fetchConfig('material-assignments'); }
export async function getArchitecturesConfig(){ return _fetchConfig('architectures'); }
export async function saveMaterialAssignmentsConfig(cfg){ return _saveConfig('material-assignments', cfg); }
export async function saveSpritesConfig(cfg){ return _saveConfig('sprites', cfg); }
export async function saveLightTypesConfig(cfg){ return _saveConfig('light-types', cfg); }
export async function saveParticlesConfig(cfg){ return _saveConfig('particles', cfg); }
export async function saveMaterialModifiersConfig(cfg){ return _saveConfig('material-modifiers', cfg); }
export async function saveSSRConfig(cfg){ return _saveConfig('ssr', cfg); }
export function getFogConfigSync(){
  const c = _caches['fog'];
  if(!c) throw new Error('Fog config not loaded yet');
  return clone(c);
}
export async function saveFogConfig(cfg){
  const ok = await _saveConfig('fog', cfg);
  window.dispatchEvent(new CustomEvent('dungeoneers-fog-saved',{detail:cfg}));
  return ok;
}

// Batch load all rendering configs at once for Game init
export async function getAllRenderConfigs(){
  const names = ['rendering','palette','pom','pbr','ao','lighting','shadows','chamfer','corners','structural-features','raymarch','fog','generator','map','materials-proc','material-assignments','material-modifiers','architectures','liquids','ssr','player','debug','discovery','sprites','light-types','particles'];
  console.log('[config] getAllRenderConfigs start', names.length, 'configs');
  const promises = names.map(async (n) => {
    try{
      const v = await _fetchConfig(n);
      console.log('[config] loaded', n);
      return v;
    }catch(e){
      console.warn('[config] failed to load', n, e?.message);
      return null;
    }
  });
  // overall timeout: if any fetch hangs forever, we don't want to hang forever – race with 15s timeout
  const timeout = new Promise((_, rej) => setTimeout(()=>rej(new Error('getAllRenderConfigs timeout after 15s')), 15000));
  let results;
  try{
    results = await Promise.race([Promise.all(promises), timeout]);
  }catch(e){
    console.error('[config] getAllRenderConfigs timeout or error', e);
    // return partial nulls
    results = await Promise.all(promises.map(p=>p.catch(()=>null)));
  }
  const out = {};
  names.forEach((n,i)=> out[n]=results[i]);
  console.log('[config] getAllRenderConfigs done, loaded', Object.values(out).filter(Boolean).length, '/', names.length);
  // also legacy flat aliases for convenience
  out['materials-proc'] = out['materials-proc'] || null;
  out['material-assignments'] = out['material-assignments'] || null;
  return out;
}

export async function getAssetList(){ const r=await fetch('/api/assets'); return r.ok?await r.json():[]; }
export async function getAsset(c,n){
  const key = c + '/' + n;
  // check logical cache if c is config and n matches logical name
  if(_caches[n] && (c==='config' || c.startsWith('config/'))) return clone(_caches[n]);
  if(_pathCache[key]) return clone(_pathCache[key]);
  try{
    const r=await fetchWithTimeout('/api/assets/'+c+'/'+n, {}, 5000);
    if(!r.ok) return null;
    const j = await r.json();
    _pathCache[key]=clone(j);
    // if this path corresponds to a logical config, cache it logically too
    for(const [logical, cands] of Object.entries(CONFIG_PATHS)){
      if(cands.includes(key)){
        _caches[logical]=clone(j);
        break;
      }
    }
    if(c==='config' && n==='main') _cache=clone(j);
    return clone(j);
  }catch(e){
    console.warn('[config] getAsset failed', key, e?.name, e?.message);
    return null;
  }
}
export async function saveAsset(c,n,d){
  const key = c + '/' + n;
  const r=await fetch('/api/assets/'+c+'/'+n,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
  if(!r.ok) return false;
  _pathCache[key]=clone(d);
  for(const [logical, cands] of Object.entries(CONFIG_PATHS)){
    if(cands.includes(key) || logical===n){
      _caches[logical]=clone(d);
    }
  }
  if(c==='config' && n==='main') _cache=clone(d);
  return true;
}
export function invalidateCache(name){
  if(name){
    delete _caches[name];
    if(name==='main') _cache=null;
    // clear path caches that correspond
    const cands = CONFIG_PATHS[name] || [];
    for(const p of cands) delete _pathCache[p];
  } else {
    for(const k of Object.keys(_caches)) delete _caches[k];
    for(const k of Object.keys(_pathCache)) delete _pathCache[k];
    _cache=null;
  }
}

// Live-edit helpers — additional invalidation by exact path and cache mutation for preview-only mode
export function invalidatePathCache(category, name){
  const key = category + '/' + name;
  delete _pathCache[key];
}
export function setPathCache(category, name, data){
  const key = category + '/' + name;
  _pathCache[key] = clone(data);
  // also propagate to logical caches if matches candidate
  for(const [logical, cands] of Object.entries(CONFIG_PATHS)){
    if(cands.includes(key)){
      _caches[logical] = clone(data);
    }
  }
  if(category==='config' && name==='main'){
    _cache = clone(data);
    _caches['main'] = clone(data);
  }
}
export function getPathCacheKeys(){ return Object.keys(_pathCache); }
export { _caches as __cachesInternal, _pathCache as __pathCacheInternal } // for live manager debug, not public API but useful for tests
// keep clone util exported for live module? internal only
