// WebGL2 shader compilation utilities

export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    const typeName = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
    console.error('Shader compile error (' + typeName + '):', log);
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createProgram(gl, vsSource, fsSource) {
  const t0 = (typeof performance!=='undefined'?performance.now():Date.now());
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
  const dt = (typeof performance!=='undefined'?performance.now():Date.now()) - t0;
  if (dt > 80) console.warn('[GL] Program linked sync in ' + dt.toFixed(1) + 'ms (consider async)');
  return prog;
}

export function createProgramAsync(gl, vsSource, fsSource) {
  return new Promise((resolve, reject) => {
    const t0 = (typeof performance!=='undefined'?performance.now():Date.now());
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
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.error('Program link error:', gl.getProgramInfoLog(prog));
          gl.deleteProgram(prog);
          reject(new Error('link fail'));
        } else {
          const dt = (typeof performance!=='undefined'?performance.now():Date.now()) - t0;
          console.log('[GL] Program linked ' + (ext?'async':'sync') + ' in ' + dt.toFixed(1) + 'ms');
          resolve(prog);
        }
      } catch (e) { reject(e); }
    };
    if (ext) setTimeout(check, 0); else check();
  });
}

export function createTexture(gl, width, height, data, filter, wrap) {
  if (filter === undefined) filter = gl.NEAREST;
  if (wrap === undefined) wrap = gl.CLAMP_TO_EDGE;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const size = width * height;
  let format = gl.RGBA, srcFormat = gl.RGBA;
  if (data.length === size) { format = gl.R8; srcFormat = gl.RED; }
  else if (data.length === size * 3) { format = gl.RGB8; srcFormat = gl.RGB; }
  // else RGBA (size*4) is default
  gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, srcFormat, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

export function updateTexture(gl, tex, width, height, data) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const size = width * height;
  let srcFormat = gl.RGBA;
  if (data.length === size) srcFormat = gl.RED;
  else if (data.length === size * 3) srcFormat = gl.RGB;
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, srcFormat, gl.UNSIGNED_BYTE, data);
}

export function createTexture2DArray(gl, width, height, depth, data, filter, wrap) {
  if (filter === undefined) filter = gl.NEAREST;
  if (wrap === undefined) wrap = gl.CLAMP_TO_EDGE;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const layerPixels = width * height;
  let internalFormat, format;
  // Detect channel count: data.length == layerPixels*depth => R8, ==*4 => RGBA8
  if (data.length === layerPixels * depth) {
    internalFormat = gl.R8; format = gl.RED;
  } else if (data.length === layerPixels * depth * 3) {
    internalFormat = gl.RGB8; format = gl.RGB;
  } else {
    internalFormat = gl.RGBA8; format = gl.RGBA;
  }
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, internalFormat, width, height, depth, 0, format, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return tex;
}

export function updateTexture2DArray(gl, tex, width, height, depth, data) {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  const layerPixels = width * height;
  let format = gl.RGBA;
  if (data.length === layerPixels * depth) format = gl.RED;
  else if (data.length === layerPixels * depth * 3) format = gl.RGB;
  gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, width, height, depth, format, gl.UNSIGNED_BYTE, data);
}

export function isTexture2DArraySupported(gl) {
  try {
    if (!gl.texImage3D) return false;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.deleteTexture(tex);
    return gl.getError() === gl.NO_ERROR;
  } catch { return false; }
}

// UBO helpers – Full UBO implementation v11
export function createUniformBuffer(gl, sizeBytes, usage) {
  if (!gl.createBuffer) return null;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
  gl.bufferData(gl.UNIFORM_BUFFER, sizeBytes, usage || gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  return buf;
}
export function updateUniformBuffer(gl, buffer, data, offset = 0) {
  if (!buffer) return;
  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  if (offset === 0) gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
  else gl.bufferSubData(gl.UNIFORM_BUFFER, offset, data);
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);
}
export function bindUniformBlock(gl, program, blockName, bindingPoint) {
  const idx = gl.getUniformBlockIndex(program, blockName);
  if (idx === gl.INVALID_INDEX) return -1;
  gl.uniformBlockBinding(program, idx, bindingPoint);
  return idx;
}
export function bindUniformBufferBase(gl, bindingPoint, buffer) {
  gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, buffer);
}
