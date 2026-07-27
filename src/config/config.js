let _cache = null; let _genCache = null;
function clone(o){return JSON.parse(JSON.stringify(o));}
export async function getConfig(){if(_cache)return clone(_cache);try{const r=await fetch("/api/assets/config/main");if(!r.ok)throw 0;_cache=await r.json();return clone(_cache);}catch(e){console.error("getConfig failed — config asset must exist at src/assets/config/main.json",e);throw e;}}
export function getConfigSync(){if(!_cache)throw new Error("Config not loaded yet — call getConfig() first");return clone(_cache);}
export async function saveConfig(cfg){const r=await fetch("/api/assets/config/main",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)});if(!r.ok)throw new Error("save failed");_cache=clone(cfg);window.dispatchEvent(new CustomEvent("dungeoneers-config-saved",{detail:cfg}));return true;}
export async function getGeneratorConfig(){if(_genCache)return clone(_genCache);try{const r=await fetch("/api/assets/config/generator");if(!r.ok)throw 0;_genCache=await r.json();return clone(_genCache);}catch(e){console.error("getGeneratorConfig failed",e);throw e;}}
export async function saveGeneratorConfig(cfg){const r=await fetch("/api/assets/config/generator",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)});if(!r.ok)throw new Error("save failed");_genCache=clone(cfg);return true;}
export async function getAssetList(){const r=await fetch("/api/assets");return r.ok?await r.json():[];}
export async function getAsset(c,n){const r=await fetch("/api/assets/"+c+"/"+n);return r.ok?await r.json():null;}
export async function saveAsset(c,n,d){const r=await fetch("/api/assets/"+c+"/"+n,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});return r.ok;}