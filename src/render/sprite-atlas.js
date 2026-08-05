// Sprite atlas registry – pure WebGPU (no WebGL2) – migrated per user request
// Procedural fallbacks via Canvas2D -> GPUTexture

const registry = new Map();
const gpuCaches = new WeakMap(); // device -> Map(id -> entry)

export function registerSprite(id, meta) { registry.set(id, { id, ...meta }); }
export function getSprite(id) { return registry.get(id) || null; }
export function listSprites() { return Array.from(registry.keys()); }
export function hasSprite(id) { return registry.has(id); }

function getGPUCache(device) {
  let m = gpuCaches.get(device);
  if (!m) { m = new Map(); gpuCaches.set(device, m); }
  return m;
}

async function loadImageBitmap(src) {
  try {
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    return bmp;
  } catch { return null; }
}

function alignUp(v,a){ return Math.ceil(v/a)*a; }

function createGPUTextureFromColor(device, r,g,b,a, label) {
  const tex = device.createTexture({ size:{width:1,height:1}, format:'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST, label: label||'colorTex' });
  const data = new Uint8Array([r,g,b,a]);
  const bpr=256; const padded=new Uint8Array(256); padded.set(data,0);
  device.queue.writeTexture({ texture: tex }, padded, { bytesPerRow:bpr, rowsPerImage:1 }, { width:1,height:1 });
  return tex;
}

function createGPUTextureFromCanvas(device, canvas, label) {
  const w=canvas.width,h=canvas.height;
  const tex = device.createTexture({ size:{width:w,height:h}, format:'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST, label: label||'canvasTex' });
  try {
    const ctx=canvas.getContext('2d');
    const imgData=ctx.getImageData(0,0,w,h);
    const bpr=alignUp(w*4,256);
    const padded=new Uint8Array(bpr*h);
    for(let y=0;y<h;y++) padded.set(imgData.data.subarray(y*w*4,(y+1)*w*4), y*bpr);
    device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h });
  } catch {
    const bpr=256; const padded=new Uint8Array(256); padded.set([255,0,255,255],0);
    device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:1 }, { width:1,height:1 });
  }
  return tex;
}

function proceduralTorchCanvas() {
  if (typeof document==='undefined') return null;
  const c=document.createElement('canvas'); c.width=64;c.height=64;
  const ctx=c.getContext('2d'); if(!ctx) return null;
  ctx.clearRect(0,0,64,64);
  const grad=ctx.createLinearGradient(0,64,0,0);
  grad.addColorStop(0,'#22160a'); grad.addColorStop(0.35,'#4a2510'); grad.addColorStop(0.55,'#a65d20'); grad.addColorStop(0.75,'#ff8c21'); grad.addColorStop(1,'#ffe9a8');
  ctx.fillStyle=grad; ctx.fillRect(18,4,28,48);
  ctx.fillStyle='rgba(255,255,200,0.35)';
  for(let i=0;i<16;i++){ const x=20+Math.random()*24; const y=6+Math.random()*28; ctx.fillRect(x,y,2,2); }
  return c;
}
function proceduralCanvasForType(type){
  if (typeof document==='undefined') return null;
  const c=document.createElement('canvas'); c.width=64;c.height=64;
  const ctx=c.getContext('2d'); if(!ctx) return null;
  ctx.clearRect(0,0,64,64);
  if (type==='brazier'){ const grad=ctx.createLinearGradient(0,64,0,0); grad.addColorStop(0,'#0d0d0d'); grad.addColorStop(0.25,'#2a1a0f'); grad.addColorStop(0.5,'#6b3a18'); grad.addColorStop(0.75,'#d86a18'); grad.addColorStop(0.9,'#ff9a32'); grad.addColorStop(1,'#ffdd88'); ctx.fillStyle=grad; ctx.fillRect(10,6,44,44); }
  else if (type==='crystal'){ const grad=ctx.createLinearGradient(0,64,0,0); grad.addColorStop(0,'#0a1230'); grad.addColorStop(0.35,'#2a1e6a'); grad.addColorStop(0.65,'#6a4fde'); grad.addColorStop(0.85,'#8ec8ff'); grad.addColorStop(1,'#d0f0ff'); ctx.fillStyle=grad; ctx.beginPath(); ctx.moveTo(32,4); ctx.lineTo(50,28); ctx.lineTo(44,56); ctx.lineTo(20,56); ctx.lineTo(14,28); ctx.closePath(); ctx.fill(); }
  else if (type==='lantern'){ const grad=ctx.createLinearGradient(0,64,0,0); grad.addColorStop(0,'#1a160a'); grad.addColorStop(0.3,'#3d3218'); grad.addColorStop(0.6,'#8a6a28'); grad.addColorStop(0.8,'#d4b14a'); grad.addColorStop(1,'#fff2b0'); ctx.fillStyle=grad; ctx.fillRect(18,10,28,42); }
  else return proceduralTorchCanvas();
  return c;
}

export function getSpriteFallbackType(id){
  if (id.includes('brazier')) return 'brazier';
  if (id.includes('crystal')) return 'crystal';
  if (id.includes('lantern')) return 'lantern';
  return 'torch';
}

export async function loadSpriteGL(device, id) {
  const cache=getGPUCache(device);
  if (cache.has(id)) return cache.get(id);
  const meta=registry.get(id);
  if(!meta){ console.warn(`[sprite-atlas WebGPU] not registered: ${id}`); return null; }
  const fallbackType=getSpriteFallbackType(id);
  const canvas=proceduralCanvasForType(fallbackType)||proceduralTorchCanvas();
  const albedoTex=canvas?createGPUTextureFromCanvas(device, canvas, `albedo_${id}`):createGPUTextureFromColor(device,255,0,255,255,`placeholder_${id}`);
  const normalTex=createGPUTextureFromColor(device,128,128,255,255,`normal_${id}`);
  const ormTex=createGPUTextureFromColor(device,255,217,0,255,`orm_${id}`);
  const entry={ albedo:albedoTex, normal:normalTex, orm:ormTex, height:normalTex, meta, loaded:false, albedoView:albedoTex.createView(), normalView:normalTex.createView(), ormView:ormTex.createView() };
  cache.set(id, entry);
  const tryLoadPath = async (paths)=>{
    if(!paths) return null;
    const list=Array.isArray(paths)?paths:[paths];
    for(const src of list){ const bmp=await loadImageBitmap(src); if(bmp) return bmp; }
    return null;
  };
  try {
    const albedoBmp=await tryLoadPath(meta.path);
    if(albedoBmp){ const tex=device.createTexture({ size:{width:albedoBmp.width,height:albedoBmp.height}, format:'rgba8unorm', usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT, label:`albedo_${id}_real` }); device.queue.copyExternalImageToTexture({ source:albedoBmp }, { texture:tex }, { width:albedoBmp.width, height:albedoBmp.height }); try{ entry.albedo.destroy(); }catch{} entry.albedo=tex; entry.albedoView=tex.createView(); }
    const normalBmp=await tryLoadPath(meta.normalPath);
    if(normalBmp){ const tex=device.createTexture({ size:{width:normalBmp.width,height:normalBmp.height}, format:'rgba8unorm', usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT, label:`normal_${id}_real` }); device.queue.copyExternalImageToTexture({ source:normalBmp }, { texture:tex }, { width:normalBmp.width, height:normalBmp.height }); try{ entry.normal.destroy(); }catch{} entry.normal=tex; entry.normalView=tex.createView(); }
    const ormBmp=await tryLoadPath(meta.ormPath||meta.roughMetalPath);
    if(ormBmp){ const tex=device.createTexture({ size:{width:ormBmp.width,height:ormBmp.height}, format:'rgba8unorm', usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT, label:`orm_${id}_real` }); device.queue.copyExternalImageToTexture({ source:ormBmp }, { texture:tex }, { width:ormBmp.width, height:ormBmp.height }); try{ entry.orm.destroy(); }catch{} entry.orm=tex; entry.ormView=tex.createView(); }
    entry.loaded=true;
  } catch(e){ console.warn(`[sprite-atlas WebGPU] failed load ${id}`, e); }
  return entry;
}

export function getSpriteTextures(device, id){
  const m=gpuCaches.get(device);
  return m ? (m.get(id)||null) : null;
}

export async function preloadSpritesGL(device, ids){
  await Promise.all(ids.map(id=>loadSpriteGL(device,id).catch(()=>null)));
}

export function clearSpriteCache(device){
  const m=gpuCaches.get(device);
  if(!m) return;
  for(const entry of m.values()){ try{ entry.albedo?.destroy(); }catch{} try{ entry.normal?.destroy(); }catch{} try{ entry.orm?.destroy(); }catch{} }
  m.clear();
}
