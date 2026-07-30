// Particles — CPU & GPU particle system for torch flames, smoke, sparks
// Each emitter attached to a scene object (torch/brazier). Adapted from mygame
// systems/particles.js but made config-aware. Deterministic-ish updates but
// uses Math.random for visual variation; generator not affected.

export class Particle {
  constructor(x, y, z, vx, vy, vz, size, color, alpha, life) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.size = size;
    this.baseSize = size;
    this.color = color.slice();
    this.alpha = alpha;
    this.baseAlpha = alpha;
    this.life = life;
    this.age = 0;
  }
  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    // drag
    this.vx *= 0.98;
    this.vy *= 0.98;
    this.vz *= 0.985;
    const t = this.age / this.life;
    if (t > 0.5) this.alpha = this.baseAlpha * (1 - (t - 0.5) * 2);
    this.size = this.baseSize * (1 - t * 0.3);
    return this.age < this.life && this.alpha > 0.01;
  }
}

export class ParticleEmitter {
  constructor({ pos = [0, 0, 0], rate = 10, color = [1, 0.6, 0.2], size = 0.08, life = 1.0, velocity = [0, 0, 0.3], spread = 0.1, type = 'flame', id = null } = {}) {
    this.pos = pos.slice();
    this.rate = rate; // particles per second
    this.color = color.slice();
    this.size = size;
    this.life = life;
    this.velocity = velocity.slice();
    this.spread = spread;
    this.type = type;
    this.accum = 0;
    this.particles = [];
    this.id = id || `em_${Math.random().toString(36).slice(2, 8)}`;
    this.enabled = true;
  }

  update(dt, time, extraPos = null) {
    if (!this.enabled) {
      this.particles = this.particles.filter(pa => pa.update(dt));
      return;
    }
    const p = extraPos || this.pos;
    this.accum += dt * this.rate;
    while (this.accum >= 1) {
      this.accum -= 1;
      this.emit(p, time);
    }
    this.particles = this.particles.filter(pa => pa.update(dt));
  }

  emit(basePos, time) {
    const [bx, by, bz] = basePos;
    const spread = this.spread;
    let vx = (Math.random() - 0.5) * spread + this.velocity[0];
    let vy = (Math.random() - 0.5) * spread + this.velocity[1];
    let vz = this.velocity[2] + (Math.random() - 0.5) * spread * 0.5 + Math.random() * 0.2;

    let color = this.color.slice();
    let size = this.size * (0.7 + Math.random() * 0.6);
    let alpha = 0.7 + Math.random() * 0.3;
    let life = this.life * (0.6 + Math.random() * 0.8);

    if (this.type === 'flame') {
      // Organic flame wobble — inharmonic sines + slow drift + occasional gust
      // Per-emitter phase from position to desync torches
      const idJitter = this.pos[0] * 12.3 + this.pos[1] * 7.1;
      const tW = time * 6.7 + idJitter;
      const warp = Math.sin(tW * 0.13) * 0.3 + Math.sin(tW * 0.067) * 0.2;
      const tw = tW + warp;
      const wobX = Math.sin(tw * 1.0) * 0.04 + Math.sin(tw * 1.87) * 0.022 + Math.sin(tw * 3.9) * 0.011 + Math.sin(tw * 0.31 + idJitter * 0.5) * 0.018;
      const wobY = Math.sin(tw * 1.33 + 0.7) * 0.04 + Math.sin(tw * 2.71 + 1.1) * 0.022 + Math.sin(tw * 0.41 + 1.9) * 0.016;
      const gust = Math.sin(tw * 11.7) * Math.sin(tw * 8.9);
      const gustShaped = Math.pow(Math.abs(gust), 2.5) * Math.sign(gust) * 0.03;
      vx += wobX + gustShaped;
      vy += wobY + gustShaped * 0.6;
      vz += (Math.sin(tw * 2.3) * 0.015 + Math.sin(tw * 5.4) * 0.008);
      const tempPhase = Math.sin(tw * 0.9) * 0.15 + Math.sin(tw * 1.6) * 0.08;
      if (Math.random() < 0.32 + tempPhase * 0.1) { color = [1, 0.9, 0.6]; size *= 1.2; }
      else if (Math.random() < 0.64) { color = [1, 0.6, 0.15]; }
      else { color = [1, 0.35, 0.05]; size *= 0.9; }
    } else if (this.type === 'smoke') {
      vz *= 0.6;
      vx *= 0.5;
      vy *= 0.5;
      color = [0.25, 0.22, 0.2];
      alpha = 0.12 + Math.random() * 0.1;
      size *= 1.8;
      life *= 2.5;
    } else if (this.type === 'spark') {
      // Occasional spark shooting up, small, orange-yellow
      vz = this.velocity[2] + Math.random() * 0.6;
      color = [1, 0.8 + Math.random() * 0.2, 0.2 + Math.random() * 0.3];
      size *= 0.5;
      alpha = 0.9;
    }

    const px = bx + (Math.random() - 0.5) * 0.08;
    const py = by + (Math.random() - 0.5) * 0.08;
    const pz = bz + (Math.random() - 0.5) * 0.05;

    this.particles.push(new Particle(px, py, pz, vx, vy, vz, size, color, alpha, life));
  }

  getParticles() { return this.particles; }
  setEnabled(v) { this.enabled = !!v; }
}

export class ParticleSystem {
  constructor() {
    this.emitters = [];
  }
  addEmitter(em) { this.emitters.push(em); return em; }
  removeEmitter(id) { this.emitters = this.emitters.filter(e => e.id !== id); }
  clear() { this.emitters = []; }
  update(dt, time) {
    for (const em of this.emitters) em.update(dt, time);
  }
  getAllParticles() {
    let all = [];
    for (const em of this.emitters) all = all.concat(em.getParticles());
    return all;
  }
  count() { return this.emitters.reduce((s, e) => s + e.particles.length, 0); }
}
