export const DEPTH_OF_FIELD_UNIFORM_BYTES = 64;

const FILTER_PATTERNS = Object.freeze({ nearest: 0, cross5: 1, box9: 2 });
const DEBUG_VIEWS = Object.freeze({ off: 0, depth: 1, factor: 2, blockSize: 3, rejectedSamples: 4 });

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeDepthOfFieldConfig(config = {}, depthRange = 25) {
  const distance = config.distance || {};
  const pixelation = config.pixelation || {};
  const filter = config.filter || {};
  const edge = config.edge || {};
  const debug = config.debug || {};

  const sharpUntil = clamp(finite(distance.sharpUntil, 4), 0, 1000);
  const fullEffectAt = clamp(
    Math.max(finite(distance.fullEffectAt, 20), sharpUntil + 0.25),
    sharpUntil + 0.25,
    1000
  );
  const patternName = Object.hasOwn(FILTER_PATTERNS, filter.pattern) ? filter.pattern : 'cross5';
  const debugName = Object.hasOwn(DEBUG_VIEWS, debug.view) ? debug.view : 'off';

  return {
    enabled: config.enabled !== false,
    sharpUntil,
    fullEffectAt,
    curve: clamp(finite(distance.curve, 1.35), 0.05, 8),
    strength: clamp(finite(pixelation.strength, 1), 0, 1),
    maxBlockPixels: Math.round(clamp(finite(pixelation.maxBlockPixels, 4), 1, 32)),
    referenceHeight: Math.round(clamp(finite(pixelation.referenceHeight, 360), 1, 8192)),
    scaleWithResolution: pixelation.scaleWithResolution !== false,
    filterPattern: FILTER_PATTERNS[patternName],
    filterPatternName: patternName,
    filterStrength: clamp(finite(filter.strength, 0.65), 0, 1),
    filterRadius: clamp(finite(filter.radius, 0.65), 0, 1.5),
    absoluteThreshold: clamp(finite(edge.absoluteThreshold, 0.75), 0.001, 100),
    relativeThreshold: clamp(finite(edge.relativeThreshold, 0.04), 0, 1),
    depthRange: clamp(finite(depthRange, 25), 0.25, 1000),
    debugView: DEBUG_VIEWS[debugName],
    debugViewName: debugName,
  };
}

export function packDepthOfFieldUniforms(config = {}, depthRange = 25) {
  const normalized = normalizeDepthOfFieldConfig(config, depthRange);
  const buffer = new ArrayBuffer(DEPTH_OF_FIELD_UNIFORM_BYTES);
  const view = new DataView(buffer);
  const f32 = (offset, value) => view.setFloat32(offset, value, true);
  const u32 = (offset, value) => view.setUint32(offset, value >>> 0, true);

  f32(0, normalized.sharpUntil);
  f32(4, normalized.fullEffectAt);
  f32(8, normalized.curve);
  f32(12, normalized.strength);
  f32(16, normalized.maxBlockPixels);
  f32(20, normalized.referenceHeight);
  f32(24, normalized.filterStrength);
  f32(28, normalized.filterRadius);
  f32(32, normalized.absoluteThreshold);
  f32(36, normalized.relativeThreshold);
  f32(40, normalized.depthRange);
  f32(44, 0);
  u32(48, normalized.enabled ? 1 : 0);
  u32(52, normalized.filterPattern);
  u32(56, normalized.debugView);
  u32(60, normalized.scaleWithResolution ? 1 : 0);

  return { buffer, normalized };
}

export function depthEffectFactor(distance, config = {}) {
  const normalized = normalizeDepthOfFieldConfig(config);
  const t = clamp((distance - normalized.sharpUntil) / (normalized.fullEffectAt - normalized.sharpUntil), 0, 1);
  const smooth = t * t * (3 - 2 * t);
  return Math.pow(smooth, normalized.curve);
}
