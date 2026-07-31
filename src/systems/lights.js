// Light & LightManager — Task 6
// Unified light handling for environment torches/braziers + player + sun.
// Adapted from mygame prototype but config-aware and deterministic.
// Exposes organic flicker with same factors as world/light-types.js for reuse.

import { getLightingConfig } from '../config/config.js';
import { LIGHT_TYPES, LIGHT_TYPE_IDS, organicFlickerFactor, pulseFactor } from '../world/light-types.js';

export { LIGHT_TYPES, LIGHT_TYPE_IDS, organicFlickerFactor, pulseFactor };

function getLiveLightsCfg() {
  try { return getLightingConfig ? null : null; } catch { return null; }
  // Note: getLightingConfig is async, so this sync helper only reads cache via import timing.
  // For live editing we fallback to sync cache if present. Simpler to return null here.
  // LightManager will try to resolve via passed cfg or window.game.cfg.lighting.
}

export class Light {
  constructor({ type = LIGHT_TYPES.POINT, pos = [0, 0, 0], color = [1, 1, 1], intensity = 1, radius = 5, flickerSpeed = 0, flickerAmount = 0, phase = 0, id = null, dir = [0, 0, -1], coneInner = 0.85, coneOuter = 0.65, pulseSpeed = 0, pulseAmount = 0, noShadow = false, roomIndex = -1, zone = null, role = null, spriteId = null } = {}) {
    this.type = type;
    this.pos = pos.slice();
    this.color = color.slice();
    this.intensity = intensity;
    this.radius = radius;
    this.flickerSpeed = flickerSpeed;
    this.flickerAmount = flickerAmount;
    this.phase = phase;
    this.id = id || `light_${Math.random().toString(36).slice(2, 8)}`;
    this.dir = dir.slice();
    this.coneInner = coneInner;
    this.coneOuter = coneOuter;
    this.pulseSpeed = pulseSpeed;
    this.pulseAmount = pulseAmount;
    this.noShadow = !!noShadow;
    this.roomIndex = roomIndex;
    this.zone = zone;
    this.role = role;
    this.spriteId = spriteId;
  }

  get typeId() { return LIGHT_TYPE_IDS[this.type] ?? 0; }

  static _hash1(p) {
    const v = Math.sin(p * 127.1) * 43758.5453123;
    return v - Math.floor(v);
  }

  static _valueNoise1D(t) {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3.0 - 2.0 * f);
    const a = Light._hash1(i);
    const b = Light._hash1(i + 1.0);
    return (a + (b - a) * u) * 2.0 - 1.0;
  }

  static organicFactor(time, flickerSpeed, flickerAmount, phase) {
    return organicFlickerFactor(time, flickerSpeed, flickerAmount, phase);
  }

  getFlickeredIntensity(time) {
    let factor = 1.0;
    if (this.type === LIGHT_TYPES.PULSE) {
      factor = pulseFactor(time, this.pulseSpeed || this.flickerSpeed, this.pulseAmount || this.flickerAmount, this.phase);
    } else {
      factor = Light.organicFactor(time, this.flickerSpeed, this.flickerAmount, this.phase);
      // For pulse type also apply slow pulse envelope on top to keep crystals feeling magical but not duplicating
      if (this.pulseSpeed) {
        factor *= (1.0 + Math.sin(time * this.pulseSpeed + this.phase) * this.pulseAmount * 0.35);
      }
    }
    return this.intensity * factor;
  }

  getPulseFactor(time) {
    return pulseFactor(time, this.pulseSpeed, this.pulseAmount, this.phase);
  }

  // For GPU upload: compute effective intensity at time, plus type id
  uploadAt(time) {
    return {
      pos: this.pos,
      color: this.color,
      intensity: this.getFlickeredIntensity(time),
      radius: this.radius,
      type: this.type,
      typeId: this.typeId,
      dir: this.dir,
      coneInner: this.coneInner,
      coneOuter: this.coneOuter,
      pulseSpeed: this.pulseSpeed,
      pulseAmount: this.pulseAmount,
      noShadow: this.noShadow,
      id: this.id,
      baseIntensity: this.intensity,
      flickerSpeed: this.flickerSpeed,
      flickerAmount: this.flickerAmount,
      phase: this.phase,
    };
  }
}

export function getOrganicFlickerFactor(time, speed, amount, phase) {
  return Light.organicFactor(time, speed, amount, phase);
}

export class LightManager {
  constructor(cfg = null) {
    this.lights = [];
    // Resolve sun from cfg or defaults
    // cfg may be merged lighting config: { ambient, sun, player }
    const amb = cfg?.ambient || (cfg?.lighting?.ambient) || null;
    const sun = cfg?.sun || (cfg?.lighting?.sun) || null;
    const ambientLevel = amb?.level ?? cfg?.ambient?.level ?? 0.36;
    const sunDirRaw = sun?.dir ?? [-0.55, -0.45, -0.7];
    const sunIntensity = sun?.intensity ?? 1.5;
    const sunColor = sun?.color ?? [1, 1, 1];
    const ambientColor = amb?.color ?? [1, 1, 1];

    const lx = sunDirRaw[0], ly = sunDirRaw[1], lz = sunDirRaw[2];
    const len = Math.hypot(lx, ly, lz) || 1;

    this.sun = new Light({
      type: LIGHT_TYPES.DIRECTIONAL,
      pos: [lx / len, ly / len, lz / len],
      color: sunColor,
      intensity: sunIntensity,
      id: 'sun',
    });
    this.sun.dir = { x: lx / len, y: ly / len, z: lz / len };
    this.ambient = ambientLevel;
    this.ambientColor = ambientColor;
    this.maxLights = cfg?.maxLights ?? cfg?.sprites?.maxLights ?? 12;
  }

  setConfig(cfg) {
    // Update sun/ambient from new config
    const amb = cfg?.ambient || cfg?.lighting?.ambient || null;
    const sun = cfg?.sun || cfg?.lighting?.sun || null;
    if (amb) {
      this.ambient = amb.level ?? this.ambient;
      this.ambientColor = amb.color || this.ambientColor;
    }
    if (sun) {
      const sd = sun.dir || this.sun.pos;
      const len = Math.hypot(sd[0], sd[1], sd[2]) || 1;
      this.sun.pos = [sd[0] / len, sd[1] / len, sd[2] / len];
      this.sun.dir = { x: sd[0] / len, y: sd[1] / len, z: sd[2] / len };
      this.sun.intensity = sun.intensity ?? this.sun.intensity;
      this.sun.color = sun.color ? sun.color.slice() : this.sun.color;
    }
    this.maxLights = cfg?.maxLights ?? cfg?.sprites?.maxLights ?? this.maxLights;
  }

  // Live-edit: update from light-types archetypes
  updateFromLightTypes(lightTypesCfg) {
    if (!lightTypesCfg || !lightTypesCfg.types) return;
    // Build map id->type def for quick lookup
    const byType = new Map();
    for (const t of lightTypesCfg.types) {
      if (t.id) byType.set(t.id, t);
      if (t.type) byType.set(t.type, t);
    }
    // For demo, we won't override per-light typeId, but we can update global multipliers if present
    // Future: if lightTypes contains flicker global scale, apply.
    // For now no-op but keep for extensibility
  }

  updateFromSpritesConfig(spritesCfg) {
    if (!spritesCfg || !spritesCfg.sprites) return;
    const byId = new Map(spritesCfg.sprites.map(s => [s.id, s]));
    for (const L of this.lights) {
      const def = byId.get(L.spriteId);
      if (!def) continue;
      const lp = def.lightProfile;
      if (!lp) continue;
      if (lp.color) L.color = lp.color.slice();
      if (lp.intensity) {
        const avg = typeof lp.intensity === 'number' ? lp.intensity : (lp.intensity.min + lp.intensity.max) / 2;
        L.intensity = avg;
      }
      if (lp.radius) {
        const avg = typeof lp.radius === 'number' ? lp.radius : (lp.radius.min + lp.radius.max) / 2;
        L.radius = avg;
      }
      if (lp.flicker) {
        if (lp.flicker.speedMin !== undefined) L.flickerSpeed = (lp.flicker.speedMin + lp.flicker.speedMax) / 2;
        if (lp.flicker.amountMin !== undefined) L.flickerAmount = (lp.flicker.amountMin + lp.flicker.amountMax) / 2;
      }
    }
  }

  updateFlickerForAll(speedMul = 1, amountMul = 1) {
    for (const L of this.lights) {
      L.flickerSpeed *= speedMul;
      L.flickerAmount *= amountMul;
    }
  }

  setFromMap(map) {
    // map.lights from sprites.js or items.js
    const src = map.lights || (map.sprites ? map.sprites.filter(s => s.emitsLight !== false).map(it => ({
      pos: [it.x, it.y, it.z],
      color: it.color || it.lightColor || [1, 0.6, 0.2],
      intensity: it.intensity ?? 3.5,
      radius: it.radius ?? 9,
      flickerSpeed: it.flickerSpeed ?? 6,
      flickerAmount: it.flickerAmount ?? 0.18,
      phase: it.phase ?? 0,
      id: it.id,
      type: it.lightType || it.type || 'flicker',
      dir: it.dir || [0, 0, -1],
      coneInner: it.coneInner ?? 0.85,
      coneOuter: it.coneOuter ?? 0.65,
      pulseSpeed: it.pulseSpeed ?? 0,
      pulseAmount: it.pulseAmount ?? 0,
      noShadow: !!it.noShadow,
      roomIndex: it.roomIndex ?? -1,
      zone: it.zone || null,
      role: it.role || null,
      spriteId: it.spriteId || it.type || null,
    })) : []);

    this.lights = src.map(l => new Light({
      type: l.type || LIGHT_TYPES.POINT,
      pos: l.pos,
      color: l.color,
      intensity: l.intensity,
      radius: l.radius,
      flickerSpeed: l.flickerSpeed,
      flickerAmount: l.flickerAmount,
      phase: l.phase,
      id: l.id,
      dir: l.dir,
      coneInner: l.coneInner,
      coneOuter: l.coneOuter,
      pulseSpeed: l.pulseSpeed,
      pulseAmount: l.pulseAmount,
      noShadow: l.noShadow,
      roomIndex: l.roomIndex ?? -1,
      zone: l.zone || null,
      role: l.role || null,
      spriteId: l.spriteId || null,
    }));
  }

  add(light) { this.lights.push(light); return light; }
  clear() { this.lights = []; }

  getNearest(pos, maxCount = 8, includePlayerLight = null) {
    let all = this.lights;
    if (includePlayerLight) all = [...all, includePlayerLight];
    if (all.length <= maxCount) return all;
    return all.map(L => {
      const dx = L.pos[0] - pos.x, dy = L.pos[1] - pos.y;
      return { L, d2: dx * dx + dy * dy };
    }).sort((a, b) => a.d2 - b.d2).slice(0, maxCount).map(o => o.L);
  }

  getFlickeredList(time, cameraPos, maxCount = null, playerLight = null) {
    const max = maxCount ?? this.maxLights ?? 12;
    const nearest = this.getNearest(cameraPos, Math.max(1, max - (playerLight ? 1 : 0)), null);
    const withPlayer = playerLight ? [playerLight, ...nearest] : nearest;
    const sliced = withPlayer.slice(0, max);
    return sliced.map(L => L.uploadAt(time));
  }

  getAll() { return [this.sun, ...this.lights]; }
  getPoints() { return this.lights; }
  count() { return this.lights.length; }
}
