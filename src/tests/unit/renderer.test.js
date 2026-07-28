import test from "node:test";
import assert from "node:assert/strict";
import { vsSource, fsSource } from "../../render/shaders.js";
import { createShader, createProgram } from "../../render/gl-utils.js";

test("vertex shader source non-empty with expected GLSL keywords", () => {
  assert(vsSource.length > 50, "vs source exists");
  assert(vsSource.includes("precision") || vsSource.includes("#version"), "has precision or version");
  assert(vsSource.includes("gl_Position"), "sets gl_Position");
  assert(vsSource.includes("a_pos") || vsSource.includes("attribute") || vsSource.includes("in "), "has position input");
});

test("fragment shader source non-empty with raycast keywords", () => {
  assert(fsSource.length > 200, "fs source substantial");
  assert(fsSource.includes("precision"), "has precision");
  assert(fsSource.includes("texelFetch") || fsSource.includes("texture"), "samples texture");
  assert(fsSource.includes("u_playerPos") || fsSource.includes("u_resolution"), "has camera uniforms");
  assert(fsSource.includes("main"), "has main function");
});

test("GL utils handle shader compile errors gracefully", () => {
  // Mock minimal GL object for testing error handling path without real GPU
  let deleted = false;
  const mockGl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => false, // simulate compile failure
    getShaderInfoLog: () => "mock compile error",
    deleteShader: () => { deleted = true; },
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => {},
  };
  const result = createShader(mockGl, mockGl.VERTEX_SHADER, "invalid glsl {{{");
  assert.equal(result, null, "returns null on compile failure");
  assert(deleted, "deletes shader on failure");
});

test("createProgram returns null on bad shader source", () => {
  const mockGl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: () => false, getShaderInfoLog: () => "err", deleteShader: () => {},
    createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => true, getProgramInfoLog: () => "", deleteProgram: () => {},
  };
  const prog = createProgram(mockGl, "bad", "bad");
  assert.equal(prog, null, "returns null when shader compile fails");
});
