// SpriteEntity — base class for anything rendered as a PBR billboard sprite.
// Characters, torches, braziers, props all extend this. Holds world position,
// spriteId (looked up in sprite atlas registry), scale, visibility, time, frame.
// Renderer only needs this interface to draw.

export class SpriteEntity {
  /**
   * @param {Object} opts
   * @param {number} opts.x World X
   * @param {number} opts.y World Y
   * @param {number} [opts.z=0] World Z base (floor height anchored)
   * @param {string} opts.spriteId Registered sprite ID from atlas registry
   * @param {number} [opts.scale=1]
   * @param {boolean} [opts.visible=true]
   * @param {string} [opts.id] Unique id, auto if missing
   */
  constructor({ x, y, z = 0, spriteId, scale = 1.0, visible = true, id = null } = {}) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.spriteId = spriteId;
    this.scale = scale;
    this.visible = visible;
    this.time = 0;
    this.frame = 0;
    this.id = id || `spr_${Math.random().toString(36).slice(2, 9)}`;
    this.emitsLight = false;
    this.lightId = null;
  }

  update(dt) {
    this.time += dt;
  }

  distanceTo(x, y) {
    const dx = this.x - x;
    const dy = this.y - y;
    return Math.hypot(dx, dy);
  }

  getSpriteId() {
    return this.spriteId;
  }

  getFrame() {
    return this.frame | 0;
  }

  getWorldHeight(meta) {
    return (meta?.worldHeight || 0.5) * this.scale;
  }

  getWorldWidth(meta) {
    const h = this.getWorldHeight(meta);
    const factor = meta?.worldWidthFactor ?? 0.5;
    return h * factor;
  }

  toJSON() {
    return { id: this.id, x: this.x, y: this.y, z: this.z, spriteId: this.spriteId, scale: this.scale, visible: this.visible, emitsLight: this.emitsLight, lightId: this.lightId };
  }
}

// TorchSprite — wall-mounted or floor brazier with attached Light + Emitters metadata
// Does not own ParticleEmitter instances directly in generator stage (pure data), but
// game layer may instantiate emitters from this description.

export class TorchSprite extends SpriteEntity {
  constructor(opts) {
    super(opts);
    this.emitsLight = true;
    this.wallDir = opts.wallDir || null; // 'N','S','E','W' for wall torches
    this.tileX = opts.tileX;
    this.tileY = opts.tileY;
    this.floorH = opts.floorH || 0;
    this.roomIndex = opts.roomIndex ?? -1;
    this.zone = opts.zone || null;
    this.role = opts.role || null;
    this.color = (opts.color || [1, 0.6, 0.2]).slice();
    this.intensity = opts.intensity ?? 4;
    this.radius = opts.radius ?? 10;
    this.flickerSpeed = opts.flickerSpeed ?? 6;
    this.flickerAmount = opts.flickerAmount ?? 0.18;
    this.phase = opts.phase ?? 0;
    this.flameSize = opts.flameSize ?? 0.22;
    this.lightType = opts.lightType || 'flicker';
    this.dir = opts.dir || [0, 0, -1];
    this.coneInner = opts.coneInner ?? 0.85;
    this.coneOuter = opts.coneOuter ?? 0.65;
    this.pulseSpeed = opts.pulseSpeed ?? 0;
    this.pulseAmount = opts.pulseAmount ?? 0;
    this.noShadow = !!opts.noShadow;
    this.lightId = opts.lightId || this.id;
  }

  // Convert to Light-compatible plain object
  toLightDesc() {
    return {
      id: this.lightId || this.id,
      pos: [this.x, this.y, this.z],
      color: this.color.slice(),
      intensity: this.intensity,
      radius: this.radius,
      flickerSpeed: this.flickerSpeed,
      flickerAmount: this.flickerAmount,
      phase: this.phase,
      type: this.lightType,
      dir: this.dir.slice(),
      coneInner: this.coneInner,
      coneOuter: this.coneOuter,
      pulseSpeed: this.pulseSpeed,
      pulseAmount: this.pulseAmount,
      noShadow: this.noShadow,
      spriteId: this.spriteId,
    };
  }
}
