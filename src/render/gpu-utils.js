// WebGPU utilities + dual-mode GL compatibility
// This file is the primary import for the new WebGPU renderer
// For backward compat, it also implements WebGL texture helpers (so legacy fallback still works)

export function isWebGPUSupported() {
  try { return typeof navigator !== 'undefined' && !!navigator.gpu; } catch { return false; }
}
export function isWebGL2Supported() {
  if (isWebGPUSupported()) return true;
  try { const c = typeof document !== 'undefined' ? document.createElement('canvas') : null; return !!(c && c.getContext && c.getContext('webgl2')); } catch { return false; }
}

export async function initWebGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU not supported - navigator.gpu missing');
  let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    console.warn('[WebGPU] high-performance adapter not available, trying fallback adapter (SwiftShader) for headless CI');
    try { adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }); } catch {}
  }
  if (!adapter) throw new Error('WebGPU adapter not available (even fallback)');
  const limits = {};
  try {
    const maxSupported = adapter.limits?.maxSampledTexturesPerShaderStage;
    if (maxSupported && maxSupported >= 32) limits.maxSampledTexturesPerShaderStage = 32;
  } catch {}
  const device = await adapter.requestDevice({
    requiredLimits: Object.keys(limits).length ? limits : undefined
  });
  device.addEventListener?.('uncapturederror', (e) => console.warn('[WebGPU] uncaptured error', e.error));
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Failed to get webgpu context from canvas');
  const format = navigator.gpu.getPreferredCanvasFormat();
  try {
    context.configure({ device, format, alphaMode: 'opaque' });
  } catch (e) {
    console.warn('[WebGPU] context configure fallback', e);
  }
  return { adapter, device, context, format };
}

export function getPreferredFormat() {
  try { if (navigator.gpu) return navigator.gpu.getPreferredCanvasFormat(); } catch {}
  return 'bgra8unorm';
}

function alignUp(v,a){ return Math.ceil(v/a)*a; }

// Legacy GL shader compilation (kept for fallback)
export function createShader(gl, type, source) {
  if (gl && gl.queue) return null;
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  if (gl && gl.queue) return null;
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  if (!vs) return null;
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!fs) { gl.deleteShader(vs); return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function createProgramAsync(gl, vsSource, fsSource) {
  if (gl && gl.queue) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    if (!vs) { reject(new Error('vs compile fail')); return; }
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!fs) { gl.deleteShader(vs); reject(new Error('fs compile fail')); return; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    const ext = gl.getExtension('KHR_parallel_shader_compile');
    gl.linkProgram(prog);
    const check = () => {
      try {
        if (ext) {
          const completed = gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR);
          if (!completed) { setTimeout(check, 16); return; }
        }
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.error('Program link error:', gl.getProgramInfoLog(prog));
          gl.deleteProgram(prog); reject(new Error('link fail'));
        } else { resolve(prog); }
      } catch(e){ reject(e); }
    };
    if (ext) setTimeout(check,0); else check();
  });
}

export function createTexture(glOrDevice, width, height, data, filter, wrap) {
  const isGPU = glOrDevice && glOrDevice.queue && typeof glOrDevice.createTexture==='function';
  if (isGPU) {
    const device = glOrDevice;
    const w=width,h=height;
    const layerPixels=w*h;
    const fmt = data && data.length===layerPixels ? 'r8unorm' : 'rgba8unorm';
    const tex = device.createTexture({
      size:{ width:w,height:h },
      format:fmt,
      usage: GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,
      label:`tex_${w}x${h}_${fmt}`
    });
    if (data) {
      const bpr = fmt==='r8unorm' ? alignUp(w,256) : alignUp(w*4,256);
      if (fmt==='r8unorm'){
        const padded=new Uint8Array(bpr*h);
        for(let y=0;y<h;y++) padded.set(data.subarray(y*w,(y+1)*w), y*bpr);
        device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h });
      } else {
        let src=data;
        if (data.length===w*h*3){ const out=new Uint8Array(w*h*4); for(let i=0;i<w*h;i++){ out[i*4]=data[i*3]; out[i*4+1]=data[i*3+1]; out[i*4+2]=data[i*3+2]; out[i*4+3]=255; } src=out; }
        if (bpr===w*4){ device.queue.writeTexture({ texture:tex }, src, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h }); }
        else { const padded=new Uint8Array(bpr*h); for(let y=0;y<h;y++) padded.set(src.subarray(y*w*4,(y+1)*w*4), y*bpr); device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h }); }
      }
    }
    return tex;
  }
  const gl = glOrDevice;
  if (filter===undefined) filter=gl.NEAREST;
  if (wrap===undefined) wrap=gl.CLAMP_TO_EDGE;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const size=width*height;
  let format=gl.RGBA, srcFormat=gl.RGBA;
  if (data.length===size){ format=gl.R8; srcFormat=gl.RED; }
  else if (data.length===size*3){ format=gl.RGB8; srcFormat=gl.RGB; }
  gl.texImage2D(gl.TEXTURE_2D,0,format,width,height,0,srcFormat,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);
  return tex;
}

export function updateTexture(glOrDevice, tex, width, height, data){
  const isGPU = glOrDevice && glOrDevice.queue;
  if (isGPU){
    const device=glOrDevice;
    const bpr = data.length===width*height ? alignUp(width,256) : alignUp(width*4,256);
    const padded=new Uint8Array(bpr*height);
    if (data.length===width*height){ for(let y=0;y<height;y++) padded.set(data.subarray(y*width,(y+1)*width), y*bpr); device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:height }, { width, height }); }
    else { let src=data; if (data.length===width*height*3){ const out=new Uint8Array(width*height*4); for(let i=0;i<width*height;i++){ out[i*4]=data[i*3]; out[i*4+1]=data[i*3+1]; out[i*4+2]=data[i*3+2]; out[i*4+3]=255; } src=out; } for(let y=0;y<height;y++) padded.set(src.subarray(y*width*4,(y+1)*width*4), y*bpr); device.queue.writeTexture({ texture:tex }, padded, { bytesPerRow:bpr, rowsPerImage:height }, { width, height }); }
    return;
  }
  const gl=glOrDevice;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const size=width*height;
  let srcFormat=gl.RGBA;
  if (data.length===size) srcFormat=gl.RED;
  else if (data.length===size*3) srcFormat=gl.RGB;
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,srcFormat,gl.UNSIGNED_BYTE,data);
}

export function createTexture2DArray(glOrDevice, width, height, depth, data, filter, wrap){
  const isGPU = glOrDevice && glOrDevice.queue && typeof glOrDevice.createTexture==='function';
  if (isGPU){
    const device=glOrDevice;
    const w=width,h=height,d=depth;
    const layerPixels=w*h;
    let format='rgba8unorm';
    if (data && data.length===layerPixels*d) format='r8unorm';
    let texture;
    try {
      texture=device.createTexture({ size:{ width:w,height:h, depthOrArrayLayers:d }, dimension:'2d', format, usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST, label:`texArray_${w}x${h}x${d}_${format}` });
    } catch {
      format='rgba8unorm';
      texture=device.createTexture({ size:{ width:w,height:h, depthOrArrayLayers:d }, dimension:'2d', format, usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST, label:`texArray_${w}x${h}x${d}_fallback` });
      if (data && data.length===w*h*d){ const expanded=new Uint8Array(w*h*d*4); for(let i=0;i<w*h*d;i++){ expanded[i*4]=data[i]; expanded[i*4+1]=data[i]; expanded[i*4+2]=data[i]; expanded[i*4+3]=255; } data=expanded; }
    }
    const bpr = format==='r8unorm' ? alignUp(w,256) : alignUp(w*4,256);
    for(let l=0;l<d;l++){
      if (format==='r8unorm'){ const slice=data.subarray(l*w*h,(l+1)*w*h); const padded=new Uint8Array(bpr*h); for(let y=0;y<h;y++) padded.set(slice.subarray(y*w,(y+1)*w), y*bpr); device.queue.writeTexture({ texture, origin:{x:0,y:0,z:l} }, padded, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h, depthOrArrayLayers:1 }); }
      else { const slice=data.subarray(l*w*h*4,(l+1)*w*h*4); if (bpr===w*4){ device.queue.writeTexture({ texture, origin:{x:0,y:0,z:l} }, slice, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h, depthOrArrayLayers:1 }); } else { const padded=new Uint8Array(bpr*h); for(let y=0;y<h;y++) padded.set(slice.subarray(y*w*4,(y+1)*w*4), y*bpr); device.queue.writeTexture({ texture, origin:{x:0,y:0,z:l} }, padded, { bytesPerRow:bpr, rowsPerImage:h }, { width:w,height:h, depthOrArrayLayers:1 }); } }
    }
    return texture;
  }
  const gl=glOrDevice;
  if (filter===undefined) filter=gl.NEAREST;
  if (wrap===undefined) wrap=gl.CLAMP_TO_EDGE;
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const layerPixels=width*height;
  let internalFormat, fmt;
  if (data.length===layerPixels*depth){ internalFormat=gl.R8; fmt=gl.RED; }
  else if (data.length===layerPixels*depth*3){ internalFormat=gl.RGB8; fmt=gl.RGB; }
  else { internalFormat=gl.RGBA8; fmt=gl.RGBA; }
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,internalFormat,width,height,depth,0,fmt,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,wrap);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,wrap);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
  return tex;
}

export function updateTexture2DArray(glOrDevice, tex, width, height, depth, data){
  const isGPU = glOrDevice && glOrDevice.queue;
  if (isGPU){
    const device=glOrDevice;
    const bpr = data.length===width*height*depth ? alignUp(width,256) : alignUp(width*4,256);
    for(let l=0;l<depth;l++){
      if (data.length===width*height*depth){ const slice=data.subarray(l*width*height,(l+1)*width*height); const padded=new Uint8Array(bpr*height); for(let y=0;y<height;y++) padded.set(slice.subarray(y*width,(y+1)*width), y*bpr); device.queue.writeTexture({ texture:tex, origin:{x:0,y:0,z:l} }, padded, { bytesPerRow:bpr, rowsPerImage:height }, { width, height, depthOrArrayLayers:1 }); }
      else { let src=data; if (data.length===width*height*depth*3){ const out=new Uint8Array(width*height*depth*4); for(let i=0;i<width*height*depth;i++){ out[i*4]=data[i*3]; out[i*4+1]=data[i*3+1]; out[i*4+2]=data[i*3+2]; out[i*4+3]=255; } src=out; } const slice=src.subarray(l*width*height*4,(l+1)*width*height*4); const padded=new Uint8Array(bpr*height); for(let y=0;y<height;y++) padded.set(slice.subarray(y*width*4,(y+1)*width*4), y*bpr); device.queue.writeTexture({ texture:tex, origin:{x:0,y:0,z:l} }, padded, { bytesPerRow:bpr, rowsPerImage:height }, { width, height, depthOrArrayLayers:1 }); }
    }
    return;
  }
  const gl=glOrDevice;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const layerPixels=width*height;
  let fmt=gl.RGBA;
  if (data.length===layerPixels*depth) fmt=gl.RED;
  else if (data.length===layerPixels*depth*3) fmt=gl.RGB;
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,0,width,height,depth,fmt,gl.UNSIGNED_BYTE,data);
}

export function isTexture2DArraySupported(glOrDevice){
  if (glOrDevice && glOrDevice.queue) return true;
  try {
    if (!glOrDevice.texImage3D) return false;
    const tex=glOrDevice.createTexture();
    glOrDevice.bindTexture(glOrDevice.TEXTURE_2D_ARRAY, tex);
    glOrDevice.texImage3D(glOrDevice.TEXTURE_2D_ARRAY,0,glOrDevice.RGBA8,1,1,1,0,glOrDevice.RGBA,glOrDevice.UNSIGNED_BYTE,null);
    glOrDevice.deleteTexture(tex);
    return glOrDevice.getError()===glOrDevice.NO_ERROR;
  } catch { return false; }
}

export function createUniformBuffer(glOrDevice, sizeBytes, usage){
  const isGPU = glOrDevice && glOrDevice.queue && typeof glOrDevice.createBuffer==='function';
  if (isGPU){
    const device=glOrDevice;
    const buf=device.createBuffer({ size: Math.ceil(sizeBytes/16)*16, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST, label:`ubo_${sizeBytes}` });
    return buf;
  }
  if (!glOrDevice.createBuffer) return null;
  const buf=glOrDevice.createBuffer();
  glOrDevice.bindBuffer(glOrDevice.UNIFORM_BUFFER, buf);
  glOrDevice.bufferData(glOrDevice.UNIFORM_BUFFER, sizeBytes, usage||glOrDevice.DYNAMIC_DRAW);
  glOrDevice.bindBuffer(glOrDevice.UNIFORM_BUFFER, null);
  return buf;
}

export function updateUniformBuffer(glOrDevice, buffer, data, offset=0){
  const isGPU = glOrDevice && glOrDevice.queue;
  if (isGPU){ glOrDevice.queue.writeBuffer(buffer, offset, data); return; }
  if (!glOrDevice.bindBuffer) return;
  if (!buffer) return;
  glOrDevice.bindBuffer(glOrDevice.UNIFORM_BUFFER, buffer);
  if (offset===0) glOrDevice.bufferSubData(glOrDevice.UNIFORM_BUFFER,0,data);
  else glOrDevice.bufferSubData(glOrDevice.UNIFORM_BUFFER,offset,data);
  glOrDevice.bindBuffer(glOrDevice.UNIFORM_BUFFER,null);
}

export function bindUniformBlock(gl, program, blockName, bindingPoint){
  if (gl && gl.queue) return 0;
  const idx=gl.getUniformBlockIndex(program, blockName);
  if (idx===gl.INVALID_INDEX) return -1;
  gl.uniformBlockBinding(program, idx, bindingPoint);
  return idx;
}

export function bindUniformBufferBase(gl, bindingPoint, buffer){
  if (gl && gl.queue) return;
  gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);
}

export function createSampler(device, opts={}){
  const { magFilter='nearest', minFilter='nearest', mipmapFilter='nearest', addressModeU='clamp-to-edge', addressModeV='clamp-to-edge', addressModeW='clamp-to-edge' }=opts;
  return device.createSampler({ magFilter, minFilter, mipmapFilter, addressModeU, addressModeV, addressModeW, label:`sampler_${magFilter}_${addressModeU}` });
}

export function createRenderTarget(device, width, height, format='rgba8unorm', label='rt'){
  const texture=device.createTexture({ size:{ width, height }, format, usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING, label });
  return texture;
}

export async function checkShaderCompilation(device, shaderModule, label='shader'){
  try {
    const info=await shaderModule.getCompilationInfo();
    if (info.messages.length>0){
      const errors=info.messages.filter(m=>m.type==='error');
      const warnings=info.messages.filter(m=>m.type==='warning');
      if (warnings.length) console.warn(`[WebGPU] shader ${label} warnings`, warnings);
      if (errors.length){ console.error(`[WebGPU] shader ${label} errors`, errors); throw new Error(`Shader compilation failed ${label}: ${errors.map(e=>e.message).join('\n')}`); }
    }
  } catch(e){ console.warn(`[WebGPU] getCompilationInfo failed for ${label}`, e.message||e); }
}
