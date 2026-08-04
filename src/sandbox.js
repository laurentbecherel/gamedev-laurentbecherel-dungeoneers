// Sandbox - Dungeoneers Render Test Lab - same pipeline as game, simple math scenes
// Uses GPURenderer directly with flat-color material override for Playwright validation
// Now includes autonomous math validation via ssr-math.js mirror of GLSL

import { GPURenderer } from './render/renderer-gpu.js';
import { getAllRenderConfigs } from './config/config.js';
import { createTexture, createTexture2DArray } from './render/gl-utils.js';
import { octaEncode, octaDecode, normalize as norm, reflectVec, worldToScreenUV, validatePuddleReflection, computeFresnel } from './render/ssr-math.js';

const canvas = document.getElementById('game-canvas');
const logEl = document.getElementById('log');
const fpsEl = document.getElementById('fps');

function log(msg){ if(logEl){ logEl.textContent = (logEl.textContent + '\n' + msg).slice(-2000); } console.log('[SANDBOX]', msg); }

// Test Scenes - simple grid math, flat colors for easy validation
function makeEmpty(w,h, fill=0){ return new Array(w*h).fill(fill); }

function makeBorderWalls(w,h, wallId=1){
  const grid = makeEmpty(w,h,0);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(x===0||y===0||x===w-1||y===h-1) grid[y*w+x]=wallId;
  }
  return grid;
}

function makeFloorMats(w,h, id=1){ return makeEmpty(w,h,id); }

// FlatColorRoom: 8x8, colored walls via material IDs (we override albedo array with solid colors)
function sceneFlatColorRoom(){
  const w=8,h=8;
  const grid = makeBorderWalls(w,h,1);
  // inner: make 4 wall segments distinct by using different wall mat IDs per side
  // North wall (y=0) -> mat 1 red, South (y=7) -> mat 2 blue, West (x=0) -> mat 3 green, East (x=7) -> mat 4 yellow
  for(let x=0;x<w;x++){ grid[0*w+x]=1; grid[(h-1)*w+x]=2; }
  for(let y=0;y<h;y++){ grid[y*w+0]=3; grid[y*w+(w-1)]=4; }
  // corners keep as 1
  grid[0]=1; grid[w-1]=4; grid[(h-1)*w]=3; grid[h*w-1]=2;

  const floorMat = makeFloorMats(w,h,1);
  const ceilMat = makeFloorMats(w,h,1);
  const floorHeight = makeEmpty(w,h,0.0);
  const ceilHeight = makeEmpty(w,h,1.0);
  // deco: puddle 2x2 center
  const deco = makeEmpty(w,h,0);
  deco[3*w+3]=16; deco[3*w+4]=16; deco[4*w+3]=16; deco[4*w+4]=16;

  // modifier map: puddle B channel 255 in center 2x2
  const mod1Data = new Uint8Array(w*h*4);
  const mod2Data = new Uint8Array(w*h*4);
  for(let i=0;i<w*h;i++){ mod1Data[i*4+0]=0; mod1Data[i*4+1]=0; mod1Data[i*4+2]=0; mod1Data[i*4+3]=0; mod2Data[i*4]=0; mod2Data[i*4+1]=0; mod2Data[i*4+2]=0; mod2Data[i*4+3]=0; }
  // puddle cells
  [[3,3],[3,4],[4,3],[4,4]].forEach(([x,y])=>{ const idx=y*w+x; mod1Data[idx*4+2]=255; });

  return { w,h, grid, floorMat, ceilMat, floorHeight, ceilHeight, deco, mod1Data, mod2Data, player:{x:4.5,y:6.5,angle:-Math.PI/2}, name:'FlatColorRoom', desc:'4 colored walls + gray floor + blue puddle center - test SSR should reflect wall color' };
}

function scenePuddleMirror(){
  const w=8,h=8;
  const grid = makeBorderWalls(w,h,1);
  // Make back wall (south) red (mat 1) which should be behind player, so puddle reflects it when looking north?
  // Player at (4,6.5) looking north (-PI/2), puddle at (4,4), red wall at north (y=0) should be reflected?
  // Let's make north wall mat 1 red distinct
  for(let x=0;x<w;x++) grid[0*w+x]=1;
  // south wall blue mat 2 behind player
  for(let x=0;x<w;x++) grid[(h-1)*w+x]=2;
  // sides green/yellow
  for(let y=0;y<h;y++){ grid[y*w+0]=3; grid[y*w+(w-1)]=4; }

  const floorMat = makeFloorMats(w,h,1);
  const ceilMat = makeFloorMats(w,h,1);
  const floorHeight = makeEmpty(w,h,0.0);
  const ceilHeight = makeEmpty(w,h,1.0);
  const deco = makeEmpty(w,h,0);
  deco[3*w+3]=16; deco[3*w+4]=16; deco[4*w+3]=16; deco[4*w+4]=16;
  const mod1Data = new Uint8Array(w*h*4);
  const mod2Data = new Uint8Array(w*h*4);
  for(let i=0;i<w*h;i++){ mod1Data[i*4+2]=0; }
  [[3,3],[3,4],[4,3],[4,4]].forEach(([x,y])=>{ mod1Data[(y*w+x)*4+2]=255; });

  return { w,h, grid, floorMat, ceilMat, floorHeight, ceilHeight, deco, mod1Data, mod2Data, player:{x:4.5,y:6.5,angle:-Math.PI/2}, name:'PuddleMirror', desc:'Red north wall should reflect in center puddle' };
}

function sceneCorridorDepth(){
  const w=4,h=20;
  const grid = makeEmpty(w,h,0);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(x===0||x===w-1) grid[y*w+x]=1; }
  // cap ends
  for(let x=0;x<w;x++){ grid[0*w+x]=1; grid[(h-1)*w+x]=1; }
  const floorMat = makeFloorMats(w,h,1);
  const ceilMat = makeFloorMats(w,h,1);
  const floorHeight = makeEmpty(w,h,0.0);
  const ceilHeight = makeEmpty(w,h,1.0);
  const deco = makeEmpty(w,h,0);
  const mod1Data = new Uint8Array(w*h*4);
  const mod2Data = new Uint8Array(w*h*4);
  return { w,h, grid, floorMat, ceilMat, floorHeight, ceilHeight, deco, mod1Data, mod2Data, player:{x:2,y:18,angle:-Math.PI/2}, name:'CorridorDepth', desc:'20 cells long, depth should go black near to white far' };
}

function sceneNormalCheck(){
  const w=8,h=8;
  const grid = makeBorderWalls(w,h,1);
  const floorMat = makeFloorMats(w,h,1);
  const ceilMat = makeFloorMats(w,h,1);
  const floorHeight = makeEmpty(w,h,0.0);
  const ceilHeight = makeEmpty(w,h,1.0);
  const deco = makeEmpty(w,h,0);
  const mod1Data = new Uint8Array(w*h*4);
  const mod2Data = new Uint8Array(w*h*4);
  return { w,h, grid, floorMat, ceilMat, floorHeight, ceilHeight, deco, mod1Data, mod2Data, player:{x:4.5,y:4.5,angle:0}, name:'NormalCheck', desc:'Empty 8x8 - test 1/3 floor blue, 1/3 wall red/green, 1/3 ceil olive' };
}

function sceneSpriteReflect(){
  const base = scenePuddleMirror();
  base.name='SpriteReflect';
  base.desc='Torch + monster in front of puddle, SSR should show them';
  base.sprites = [
    { x:4.5, y:2.5, z:0.3, spriteId:'torch_wall', type:'torch_wall', frame:0, scale:1, alpha:1, visible:true },
    { x:4.5, y:3.0, z:0.0, spriteId:'zombie', type:'zombie', frame:0, scale:1.2, alpha:1, visible:true },
  ];
  return base;
}

const SCENES = {
  flatColorRoom: sceneFlatColorRoom,
  puddleMirror: scenePuddleMirror,
  corridorDepth: sceneCorridorDepth,
  normalCheck: sceneNormalCheck,
  spriteReflect: sceneSpriteReflect,
};

let currentSceneKey = 'flatColorRoom';
let currentScene = SCENES[currentSceneKey]();
let renderer = null;
let configs = null;
let player = null;
let lastTime = 0;
let frame = 0;
let fps = 0;
let lastFpsTime = performance.now();

function makePlayer(x,y,angle){
  return {
    x, y, angle,
    _cfg: configs,
    getPosition(){ return { x:this.x, y:this.y }; },
    getRawAngle(){ return this.angle; },
    getLightSource(){ return { x:this.x, y:this.y, z:0.5, radius:12, intensity:0.0, color:[0,0,0], type:3, flicker:false, pulse:false }; },
    viewBobOffset:0, viewBobOffsetX:0, viewBobRoll:0, viewBobOffsetY:0,
    angle,
  };
}

function createFlatColorAtlases(gl){
  // Override material arrays with solid flat colors for easy math
  // Wall: 1=red north, 2=blue south, 3=green west, 4=yellow east, 5=white
  const texSize = 4;
  const wallCount = 6;
  const floorCount = 3;
  const ceilCount = 3;
  const makeSolidArray = (colors, count) => {
    // colors: array of [r,g,b] per layer, length count, layer 0 may be black
    const depth = count;
    const data = new Uint8Array(texSize*texSize*depth*4);
    for(let l=0;l<depth;l++){
      const col = colors[l] || [0,0,0];
      for(let y=0;y<texSize;y++) for(let x=0;x<texSize;x++){
        const idx = (l*texSize*texSize + y*texSize + x)*4;
        data[idx]=col[0]; data[idx+1]=col[1]; data[idx+2]=col[2]; data[idx+3]=255;
      }
    }
    return createTexture2DArray(gl, texSize, texSize, depth, data, gl.NEAREST, gl.CLAMP_TO_EDGE);
  };
  const makeFlatNormalArray = (count) => {
    const depth = count;
    const data = new Uint8Array(texSize*texSize*depth*4);
    for(let l=0;l<depth;l++) for(let y=0;y<texSize;y++) for(let x=0;x<texSize;x++){
      const idx=(l*texSize*texSize + y*texSize + x)*4;
      data[idx]=128; data[idx+1]=128; data[idx+2]=255; data[idx+3]=255; // flat normal (0,0,1)
    }
    return createTexture2DArray(gl, texSize, texSize, depth, data, gl.NEAREST, gl.CLAMP_TO_EDGE);
  };
  const makeMidHeight = (count) => {
    const depth=count;
    const data = new Uint8Array(texSize*texSize*depth);
    data.fill(128);
    return createTexture2DArray(gl, texSize, texSize, depth, data, gl.NEAREST, gl.CLAMP_TO_EDGE);
  };
  const makeRoughMetal = (count, rough=0.7, metal=0.0) => {
    const depth=count;
    const data = new Uint8Array(texSize*texSize*depth*4);
    for(let l=0;l<depth;l++) for(let i=0;i<texSize*texSize;i++){
      const idx=(l*texSize*texSize + i)*4;
      data[idx]=Math.floor(0.5*255); // ao
      data[idx+1]=Math.floor(rough*255);
      data[idx+2]=Math.floor(metal*255);
      data[idx+3]=255;
    }
    return createTexture2DArray(gl, texSize, texSize, depth, data, gl.NEAREST, gl.CLAMP_TO_EDGE);
  };

  const wallColors = [
    [0,0,0],
    [255,64,64],   // 1 north red
    [64,64,255],   // 2 south blue
    [64,255,64],   // 3 west green
    [255,255,64],  // 4 east yellow
    [255,255,255], // 5 white
  ];
  const floorColors = [
    [0,0,0],
    [80,80,80],    // 1 dark gray floor
    [64,96,200],   // 2 blue puddle floor
  ];
  const ceilColors = [
    [0,0,0],
    [100,100,100], // 1 light gray ceil
    [60,60,60],
  ];

  return {
    wa: makeSolidArray(wallColors, wallCount),
    wn: makeFlatNormalArray(wallCount),
    wh: makeMidHeight(wallCount),
    wrma: makeRoughMetal(wallCount, 0.75, 0.0),
    fa: makeSolidArray(floorColors, floorCount),
    fn: makeFlatNormalArray(floorCount),
    fh: makeMidHeight(floorCount),
    frma: makeRoughMetal(floorCount, 0.85, 0.0),
    ca: makeSolidArray(ceilColors, ceilCount),
    cn: makeFlatNormalArray(ceilCount),
    ch: makeMidHeight(ceilCount),
    crma: makeRoughMetal(ceilCount, 0.9, 0.0),
  };
}

async function init(){
  log('Loading configs...');
  try {
    configs = await getAllRenderConfigs();
    log('Configs loaded: ' + Object.keys(configs).join(', '));
  } catch(e){ log('Config load failed ' + e); configs={}; }

  renderer = new GPURenderer(canvas);
  try { window._gameRenderer = renderer; } catch {}
  // init signature is (dungeon, config) - pass empty dungeon, real config second
  await renderer.init({}, configs);
  log('Renderer init ok, useArrayPath=' + renderer.useArrayPath);

  // Override atlases with flat colors for math validation
  try {
    const gl = renderer.gl;
    const flatAtlases = createFlatColorAtlases(gl);
    renderer.atlases = flatAtlases;
    renderer.atlasInfo = { wallCount:6, floorCount:3, ceilCount:3, texSize:4 };
    renderer.materialInfo = { wallCount:6, floorCount:3, ceilCount:3, texSize:4 };
    renderer._cfgCache = configs;
    renderer._ssrCfgCache = configs.ssr;
    log('Flat-color atlases injected: walls RGBY, floor gray/blue');
  } catch(e){ log('Flat atlas override failed: ' + e); }

  // Setup player and scene
  setScene(currentSceneKey);

  // Input for movement
  const keys={};
  window.addEventListener('keydown', e=>{
    keys[e.code]=true;
    const code=e.code;
    if(code==='Digit0') { const v=renderer.toggleSSR(); updateHud(); log('SSR '+(v?'ON':'OFF')); e.preventDefault(); }
    else if(code==='KeyO') { const v=renderer.cycleSSRDebug(); updateHud(); const names=['OFF','PuddleMask','Depth','Normal','HitUV','HitMask','Fresnel','SSR','SSR only']; log('SSR Debug '+(names[v]||v)); e.preventDefault(); }
    else if(code==='Digit9') { const v=renderer.toggleModifiers(); updateHud(); log('Modifiers '+(v?'ON':'OFF')); }
  });
  window.addEventListener('keyup', e=>{ keys[e.code]=false; });

  function updateMove(dt){
    const speed=2.5*dt;
    const rotSpeed=1.8*dt;
    if(keys['KeyW']||keys['ArrowUp']) { player.x+=Math.cos(player.angle)*speed; player.y+=Math.sin(player.angle)*speed; }
    if(keys['KeyS']||keys['ArrowDown']) { player.x-=Math.cos(player.angle)*speed; player.y-=Math.sin(player.angle)*speed; }
    if(keys['KeyA']) { player.x+=Math.cos(player.angle-Math.PI/2)*speed; player.y+=Math.sin(player.angle-Math.PI/2)*speed; }
    if(keys['KeyD']) { player.x+=Math.cos(player.angle+Math.PI/2)*speed; player.y+=Math.sin(player.angle+Math.PI/2)*speed; }
    if(keys['ArrowLeft']) player.angle-=rotSpeed;
    if(keys['ArrowRight']) player.angle+=rotSpeed;
    // Clamp inside dungeon
    const w=currentScene.w, h=currentScene.h;
    player.x=Math.max(1.1, Math.min(w-1.1, player.x));
    player.y=Math.max(1.1, Math.min(h-1.1, player.y));
  }

  function loop(now){
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime)/1000);
    lastTime = now;
    frame++;
    if(now - lastFpsTime > 500){
      fps = Math.round(frame * 1000 / (now - lastFpsTime));
      lastFpsTime = now; frame=0;
      if(fpsEl) fpsEl.textContent = 'FPS: '+fps + ' | ' + currentScene.name;
    }
    updateMove(dt);
    // Build dungeon object for renderer
    const dungeon = {
      w: currentScene.w,
      h: currentScene.h,
      grid: currentScene.grid,
      floorMat: currentScene.floorMat,
      ceilMat: currentScene.ceilMat,
      floorHeight: currentScene.floorHeight,
      ceilHeight: currentScene.ceilHeight,
      deco: currentScene.deco,
      sprites: currentScene.sprites || [],
    };
    // Custom modifier maps if provided
    if (renderer && currentScene.mod1Data) {
      const gl = renderer.gl;
      // update modifier tex
      if (renderer.modifierTex) {
        gl.bindTexture(gl.TEXTURE_2D, renderer.modifierTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, currentScene.w, currentScene.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, currentScene.mod1Data);
      }
      if (currentScene.mod2Data && renderer.modifierTex2) {
        gl.bindTexture(gl.TEXTURE_2D, renderer.modifierTex2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, currentScene.w, currentScene.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, currentScene.mod2Data);
      }
    }
    try {
      renderer.render(dungeon, player, now/1000);
    } catch(e){ log('render failed '+e); console.error(e); }
  }
  requestAnimationFrame(loop);
  log('Loop started');

  // Expose sandbox API for Playwright
  window.sandbox = {
    getScene:()=>currentSceneKey,
    getSceneInfo:()=>currentScene,
    setScene,
    getPlayer:()=>({x:player.x,y:player.y,angle:player.angle}),
    setPlayer:(x,y,a)=>{ player.x=x; player.y=y; if(a!==undefined) player.angle=a; },
    getSSRConfig:()=>configs.ssr,
    setSSREnabled:(v)=>{ renderer.setSSREnabled(v); updateHud(); },
    setSSRDebug:(m)=>{ renderer.setSSRDebugMode(m); updateHud(); },
    toggleSSR:()=>{ const v=renderer.toggleSSR(); updateHud(); return v; },
    cycleDebug:()=>{ const v=renderer.cycleSSRDebug(); updateHud(); return v; },
    getPixel:(x,y)=>{
      const gl=renderer.gl;
      const w=canvas.width, h=canvas.height;
      const px=new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.floor(x), Math.floor(h-1-y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
      return Array.from(px);
    },
    getGBufferPixel:(x,y)=>{
      const gl=renderer.gl;
      const w=canvas.width, h=canvas.height;
      const px=new Uint8Array(4);
      // read from gNormalDepth FBO
      const fbo = renderer.gBufferFBO;
      if(!fbo) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      try { gl.readBuffer(gl.COLOR_ATTACHMENT1); } catch {}
      gl.readPixels(Math.floor(x), Math.floor(h-1-y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return Array.from(px);
    },
    getDepthAt:(x,y)=>{
      const g = window.sandbox.getGBufferPixel(x,y);
      if(!g) return null;
      const depthNorm = g[2]/255;
      const cfg = configs.ssr || {};
      const range = cfg.reprojection?.depthRange ?? 25;
      return depthNorm * range;
    },
    getPuddleMaskAt:(x,y)=>{
      const g = window.sandbox.getGBufferPixel(x,y);
      if(!g) return null;
      return g[3]/255;
    },
    // Math validation (pure JS mirror of GLSL, no GL needed)
    runMathValidation:()=>{
      const results=[];
      const angles = [0, Math.PI/6, Math.PI/4, Math.PI/3, Math.PI/2, -Math.PI/2, Math.PI, -Math.PI/4, 2.1];
      const camPos=[4.5,6.5], puddle=[4.5,4.5,0], northWall=[4.5,0.5,0.5];
      const planeLen=Math.tan(1.0*0.5);
      for(const ang of angles){
        const v = validatePuddleReflection(camPos, ang, puddle, northWall, planeLen);
        const ok = v.cosAngle>0.5;
        results.push({angle:ang.toFixed(2), cosAngle:v.cosAngle.toFixed(3), shouldHit:v.shouldHit, ok});
        log(`Angle ${ang.toFixed(2)} cos=${v.cosAngle.toFixed(3)} hit=${v.shouldHit} ${ok?'PASS':'FAIL'}`);
      }
      // octa roundtrip
      const normals=[[0,0,1],[0,0,-1],[1,0,0],[0,1,0]];
      for(const n of normals){
        const enc=octaEncode(n); const dec=octaDecode(enc);
        const dot=n[0]*dec[0]+n[1]*dec[1]+n[2]*dec[2];
        const ok=dot>0.98;
        results.push({type:'octa', normal:n, enc:enc.map(x=>x.toFixed(3)), dot:dot.toFixed(3), ok});
        log(`Octa ${n} -> ${enc.map(x=>x.toFixed(2))} dot=${dot.toFixed(3)} ${ok?'PASS':'FAIL'}`);
      }
      // projection: floor below horizon, ceil above
      const res=[640,360], eyeZ=0.5;
      const floorProj = worldToScreenUV([4.5,4.5,0], camPos, eyeZ, -Math.PI/2, planeLen, res);
      const ceilProj = worldToScreenUV([4.5,4.5,1.2], camPos, eyeZ, -Math.PI/2, planeLen, res);
      const projOk = floorProj.uv[1]<0.5 && ceilProj.uv[1]>0.5;
      results.push({type:'proj', floorY:floorProj.uv[1].toFixed(3), ceilY:ceilProj.uv[1].toFixed(3), ok:projOk});
      log(`Proj floorY=${floorProj.uv[1].toFixed(3)}<0.5 ceilY=${ceilProj.uv[1].toFixed(3)}>0.5 ${projOk?'PASS':'FAIL'}`);
      return results;
    },
    autoSweepAngles: async ()=>{
      log('Auto-sweep angles for SSR orientation check...');
      const angles=[0, 0.5, 1.0, 1.57, -1.57, 3.14, -0.785, 2.1];
      const results=[];
      for(let i=0;i<angles.length;i++){
        const ang=angles[i];
        window.sandbox.setPlayer(4.5,6.5,ang);
        await new Promise(r=>setTimeout(r,120));
        // sample center bottom pixel (puddle area) for reflection
        const px = window.sandbox.getPixel(320, 280);
        const mask = window.sandbox.getPuddleMaskAt(320,280);
        const depth = window.sandbox.getDepthAt(320,280);
        results.push({angle:ang.toFixed(2), pixel:px, mask:mask?.toFixed(2), depth:depth?.toFixed(2)});
        log(`Sweep ang=${ang.toFixed(2)} px=${px} mask=${mask?.toFixed(2)} depth=${depth?.toFixed(2)}`);
      }
      log('Auto-sweep done, check for orientation weirdness: reflection should stay forward, not random');
      return results;
    },
    runVisualValidation: async ()=>{
      // Playwright-style: check that debug modes change image (not same)
      const modesToTest=[0,1,2,3,8];
      const snapshots=[];
      for(const m of modesToTest){
        window.sandbox.setSSRDebug(m);
        await new Promise(r=>setTimeout(r,150));
        const centerPx = window.sandbox.getPixel(320,180);
        snapshots.push({mode:m, pixel:centerPx});
        log(`Visual mode ${m} centerPx=${centerPx}`);
      }
      window.sandbox.setSSRDebug(0);
      return snapshots;
    },
    log,
  };
  updateHud();
  log('window.sandbox ready - use for Playwright validation');
}

function setScene(key){
  if(!SCENES[key]) { log('Unknown scene '+key); return; }
  currentSceneKey = key;
  currentScene = SCENES[key]();
  player = makePlayer(currentScene.player.x, currentScene.player.y, currentScene.player.angle);
  try { window._player = player; } catch {}
  const btns = document.querySelectorAll('.scene-btn');
  btns.forEach(b=>{ b.classList.toggle('active', b.dataset.scene===key); });
  const valScene = document.getElementById('val-scene');
  if(valScene) valScene.textContent = currentScene.name + ' - ' + currentScene.desc;
  log('Scene set to ' + key + ': ' + currentScene.desc);
  // Reset SSR debug to OFF for clean view unless testing
  // if (window._gameRenderer) window._gameRenderer.setSSRDebugMode(0);
  updateHud();
}

function updateHud(){
  const r = window._gameRenderer || renderer;
  if(!r) return;
  const el = id => document.getElementById(id);
  if(el('val-ssr')) el('val-ssr').textContent = r.ssrEnabled ? 'ON' : 'OFF';
  if(el('val-debug')) {
    const names=['OFF','PuddleMask','Depth','Normal','ReflectionUV','HitMask','Fresnel','SSR','SSR only'];
    el('val-debug').textContent = (names[r.ssrDebugMode]||r.ssrDebugMode) + ' ('+r.ssrDebugMode+')';
  }
  if(el('val-mod')) el('val-mod').textContent = r.modifiersEnabled ? 'ON' : 'OFF';
  if(el('val-pal')) el('val-pal').textContent = r.paletteStyle + (r.authentic?' authentic':'');
}

// Hook scene buttons
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.scene-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ setScene(btn.dataset.scene); });
  });
  document.querySelectorAll('.debug-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const action = btn.dataset.action;
      const r = window._gameRenderer || renderer;
      if(!r && action!=='runMath' && action!=='autoSweep' && action!=='visualCheck') return;
      if(action==='toggleSSR'){ r.toggleSSR(); log('Toggle SSR'); }
      else if(action==='cycleDebug'){ const v=r.cycleSSRDebug(); log('Debug '+v); }
      else if(action==='toggleModifiers'){ r.toggleModifiers(); log('Toggle Mod'); }
      else if(action==='togglePalette'){ r.togglePalette ? r.togglePalette() : null; log('Toggle Palette'); }
      else if(action==='runMath'){ const res = window.sandbox.runMathValidation(); log('Math validation results: '+res.filter(r=>!r.ok).length+' failures'); }
      else if(action==='autoSweep'){ await window.sandbox.autoSweepAngles(); }
      else if(action==='visualCheck'){ await window.sandbox.runVisualValidation(); }
      updateHud();
    });
  });
});

init().catch(e=>{ log('init failed '+e); console.error(e); });
