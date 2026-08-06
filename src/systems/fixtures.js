// Shared fixture math used by generation, the WebGPU renderer and the editor.
// Keeping direction/frame/socket resolution here prevents preview/runtime drift.

const TAU = Math.PI * 2;
const WALL_INWARD_YAW = { N: Math.PI / 2, E: Math.PI, S: -Math.PI / 2, W: 0 };

export function normalizeAngle(angle) {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  if (a > Math.PI) a -= TAU;
  return a;
}

export function getFixtureDefinition(fixturesConfig, id) {
  return fixturesConfig?.fixtures?.find(f => f.id === id)
    || fixturesConfig?.effects?.find(f => f.id === id)
    || null;
}

function renderMeta(defOrMeta) { return defOrMeta?.render || defOrMeta || {}; }

export function getFixturePlacement(defOrMeta) {
  return defOrMeta?.placement || renderMeta(defOrMeta)?.placement || {};
}

// Sprite instance z is the bottom of its billboard. Resolve that bottom from
// an architectural contact point instead of a category-wide magic offset.
export function resolveFixtureBaseZ(defOrMeta, floorHeight = 0, wallHeight = 1) {
  const placement = getFixturePlacement(defOrMeta);
  const render = renderMeta(defOrMeta);
  const height = render?.worldHeight ?? defOrMeta?.material?.worldHeight ?? 0;
  const pivotFromTop = render?.pivot?.[1] ?? 1;
  const pivotAboveBottom = height * (1 - pivotFromTop);
  const clearance = placement.clearance ?? 0;
  switch (placement.anchor) {
    case 'floor': return floorHeight + clearance - pivotAboveBottom;
    case 'ceiling': return floorHeight + wallHeight - clearance - pivotAboveBottom;
    case 'wall': return floorHeight + (placement.baseZ ?? 0.24);
    default: return floorHeight + (placement.baseZ ?? clearance);
  }
}

// Candidate positions are tile centres and the wall plane is 0.5 units away.
// A small positive inset keeps a wall fixture just in front of that plane.
export function resolveFixtureWallOffset(defOrMeta, fallback = 0.35) {
  const placement = getFixturePlacement(defOrMeta);
  if (Number.isFinite(placement.wallInset)) return Math.max(0, 0.5 - placement.wallInset);
  if (Number.isFinite(placement.wallOffset)) return placement.wallOffset;
  return fallback;
}

export function getFixtureFacingYaw(instance, defOrMeta = null) {
  if (Number.isFinite(instance?.yaw)) return normalizeAngle(instance.yaw);
  const orientation = defOrMeta?.orientation || renderMeta(defOrMeta)?.orientation || {};
  if ((orientation.source === 'wallDir' || instance?.wallDir) && WALL_INWARD_YAW[instance?.wallDir] !== undefined) {
    const inward = WALL_INWARD_YAW[instance.wallDir];
    return normalizeAngle(orientation.facesAwayFromWall === false ? inward + Math.PI : inward);
  }
  return 0;
}

export function resolveFourWayView(instance, defOrMeta, camera) {
  const facing = getFixtureFacingYaw(instance, defOrMeta);
  const viewer = Math.atan2((camera?.y ?? 0) - instance.y, (camera?.x ?? 0) - instance.x);
  const rel = normalizeAngle(viewer - facing);
  if (rel >= -Math.PI / 4 && rel < Math.PI / 4) return 'front';
  if (rel >= Math.PI / 4 && rel < Math.PI * 3 / 4) return 'right';
  if (rel <= -Math.PI / 4 && rel > -Math.PI * 3 / 4) return 'left';
  return 'back';
}

export function resolveSpriteFrame(instance, defOrMeta, camera, time = 0) {
  const r = renderMeta(defOrMeta);
  if (Number.isFinite(instance?.frame)) return Math.max(0, instance.frame | 0) % Math.max(1, r.count || r.atlas?.count || 1);
  const mode = r.renderMode || r.mode;
  if (mode === 'directionalBillboard4') {
    const view = resolveFourWayView(instance, defOrMeta, camera);
    return (r.views?.[view] ?? 0) | 0;
  }
  const count = Math.max(1, r.count || r.atlas?.count || 1);
  const fps = r.fps || 0;
  if (fps > 0 && count > 1) {
    // Fixture phase is radians over a complete flipbook cycle, matching the
    // light system. Converting through frame count prevents every flame from
    // landing on nearly the same first frame.
    const phaseSeconds = instance?.animationPhase ?? ((instance?.phase || 0) / TAU) * count / fps;
    return Math.floor(Math.max(0, time + phaseSeconds) * fps) % count;
  }
  return 0;
}

export function resolveSocketWorld(instance, defOrMeta, socketName) {
  const socket = defOrMeta?.sockets?.[socketName] || renderMeta(defOrMeta)?.sockets?.[socketName];
  const local = socket?.local || [0, 0, 0]; // forward, right, up
  const yaw = getFixtureFacingYaw(instance, defOrMeta);
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const rx = -fy, ry = fx;
  return [
    instance.x + fx * local[0] + rx * local[1],
    instance.y + fy * local[0] + ry * local[1],
    (instance.z || 0) + local[2],
  ];
}

export function expandFixtureLayers(instance, defOrMeta) {
  const layers = defOrMeta?.layers || renderMeta(defOrMeta)?.layers || [];
  return layers.map((layer, index) => {
    const pos = resolveSocketWorld(instance, defOrMeta, layer.socket);
    return {
      id: `${instance.id || instance.spriteId}:layer:${layer.id || index}`,
      parentFixtureId: instance.id || null,
      spriteId: layer.spriteId,
      x: pos[0], y: pos[1], z: pos[2],
      scale: layer.scale ?? 1,
      phase: layer.phaseFromInstance ? (instance.phase || 0) : (layer.phase || 0),
      visible: instance.visible !== false,
      alpha: layer.alpha ?? 1,
      renderLayer: layer.renderLayer || 'color',
      isEffectLayer: true,
    };
  });
}

export function validateFixtureManifest(config) {
  const errors = [];
  const all = [...(config?.fixtures || []), ...(config?.effects || [])];
  const ids = new Set(all.map(d => d.id));
  for (const def of all) {
    const r = def.render || {};
    if (!def.id) errors.push('Fixture/effect is missing id');
    if (r.mode === 'distortionBillboard') {
      if (!r.distortion) errors.push(`${def.id}: missing distortion`);
    } else {
      for (const channel of ['albedo','normal','orm']) if (!r[channel]) errors.push(`${def.id}: missing ${channel}`);
    }
    if (!r.atlas || r.atlas.count < 1) errors.push(`${def.id}: invalid atlas`);
    if (r.mode === 'directionalBillboard4') {
      for (const view of ['front','right','back','left']) if (!Number.isInteger(r.views?.[view])) errors.push(`${def.id}: missing ${view} view`);
    }
    if (config?.fixtures?.includes(def)) {
      const anchor = getFixturePlacement(def).anchor;
      if (!['floor','ceiling','wall'].includes(anchor)) errors.push(`${def.id}: missing architectural placement anchor`);
    }
    for (const layer of def.layers || []) {
      if (!ids.has(layer.spriteId)) errors.push(`${def.id}: unknown layer sprite ${layer.spriteId}`);
      if (!def.sockets?.[layer.socket]) errors.push(`${def.id}: unknown layer socket ${layer.socket}`);
    }
  }
  return errors;
}
