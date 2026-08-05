// gl-utils.js – WebGPU migration shim – no WebGL2 (user requested pure WebGPU)
// All implementation moved to gpu-utils.js, this file re-exports for backward compat

// Explicit re-exports to avoid duplicate identifier error with export * + named exports
export {
  isWebGPUSupported,
  isWebGL2Supported,
  initWebGPU,
  getPreferredFormat,
  createTexture,
  updateTexture,
  createTexture2DArray,
  updateTexture2DArray,
  isTexture2DArraySupported,
  createUniformBuffer,
  updateUniformBuffer,
  updateUniformBufferDirect,
  bindUniformBlock,
  bindUniformBufferBase,
  createSampler,
  createRenderTarget,
  checkShaderCompilation,
  createFullscreenTrianglePipeline,
  createShader,
  createProgram,
  createProgramAsync
} from './gpu-utils.js';
