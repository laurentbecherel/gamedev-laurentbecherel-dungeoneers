// shaders.js – WebGPU migration – now re-exports WGSL (no WebGL2)
// Legacy GLSL import path preserved for unit tests compatibility – but underlying is WGSL
// Original GLSL sources moved to shaders-legacy-glsl.js (not served)

export * from './shaders-wgsl.js';

// Keep glsl* names for backward compat tests that check for modular imports – alias to wgsl equivalents
import { wgslCommon } from './shader-lib/common.wgsl.js';
import { wgslMaterial } from './shader-lib/material.wgsl.js';
import { wgslPom } from './shader-lib/pom.wgsl.js';
import { wgslRaymarch } from './shader-lib/raymarch.wgsl.js';
import { wgslPbr } from './shader-lib/pbr.wgsl.js';
import { wgslChamfer } from './shader-lib/chamfer.wgsl.js';
import { wgslGridChamfer } from './shader-lib/grid-chamfer.wgsl.js';
import { wgslModifiers } from './shader-lib/modifiers.wgsl.js';
import { wgslScene } from './shader-lib/scene.wgsl.js';
import { wgslSSR } from './shader-lib/ssr.wgsl.js';

export const glslCommon = wgslCommon;
export const glslMaterial = wgslMaterial;
export const glslPom = wgslPom;
export const glslRaymarch = wgslRaymarch;
export const glslPbr = wgslPbr;
export const glslChamfer = wgslChamfer;
export const glslGridChamfer = wgslGridChamfer;
export const glslModifiers = wgslModifiers;
export const glslScene = wgslScene;
export const glslSSR = wgslSSR;
