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

export function createTexture(gl, width, height, data, filter) {
  if (filter === undefined) filter = gl.NEAREST;
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
