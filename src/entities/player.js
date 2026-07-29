// Minimal player controller with WASD movement and slide collision

export class Player {
  constructor(x, y, angle) {
    this.x = x; this.y = y; this.angle = angle;
    this._cfg = null;
  }

  setConfig(cfg) { this._cfg = cfg; }

  setPosition(x, y, angle) { this.x = x; this.y = y; this.angle = angle; }

  _resolvePlayerCfg(){
    // player.json is cfg.playerCfg, but also supports legacy cfg.player
    return this._cfg?.playerCfg || this._cfg?.player || {};
  }
  update(dt, input, dungeon) {
    const cfg = this._resolvePlayerCfg();
    const speed = cfg.moveSpeed ?? 3.0;
    const turnSpeed = cfg.turnSpeed ?? 2.2;
    const radius = cfg.radius ?? cfg.collision?.radius ?? 0.28;

    // turning via QE keys
    this.angle += (input.turn || 0) * turnSpeed * dt;

    // movement vector in world space
    const moveX = (input.forward || 0) * Math.cos(this.angle) - (input.strafe || 0) * Math.sin(this.angle);
    const moveY = (input.forward || 0) * Math.sin(this.angle) + (input.strafe || 0) * Math.cos(this.angle);
    const dx = moveX * speed * dt;
    const dy = moveY * speed * dt;

    // slide collision against dungeon grid
    const check = (x, y) => {
      const w = dungeon.w, h = dungeon.h, grid = dungeon.grid;
      const r = radius;
      const minX = Math.max(0, Math.floor(x - r)), maxX = Math.min(w - 1, Math.floor(x + r));
      const minY = Math.max(0, Math.floor(y - r)), maxY = Math.min(h - 1, Math.floor(y + r));
      for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
        const idx = gy * w + gx;
        if (grid[idx] > 0) { // wall cell
          const cx = Math.max(gx, Math.min(x, gx + 1));
          const cy = Math.max(gy, Math.min(y, gy + 1));
          const ddx = x - cx, ddy = y - cy;
          if (ddx * ddx + ddy * ddy < r * r) return true;
        }
      }
      return false;
    };

    const nx = this.x + dx, ny = this.y + dy;
    if (!check(nx, ny)) { this.x = nx; this.y = ny; }
    else if (!check(this.x + dx, this.y)) { this.x += dx; }
    else if (!check(this.x, this.y + dy)) { this.y += dy; }
  }

  getPosition() {
    const pc = this._resolvePlayerCfg();
    const h = pc.height ?? 0.5;
    return { x: this.x, y: this.y, z: h };
  }

  getAngle() { return this.angle; }

  getLightSource() {
    const pc = this._resolvePlayerCfg();
    const cfg = pc.light ?? {};
    const h = pc.height ?? 0.5;
    const lh = cfg.height ?? 0.15;
    const col = cfg.color ?? [1, 0.85, 0.6];
    return {
      x: this.x, y: this.y, z: h + lh,
      color: col,
      intensity: cfg.intensity ?? 1.2,
      radius: cfg.radius ?? 6.0,
    };
  }
}
