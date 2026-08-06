/**
 * Player — first-person controller with two movement styles.
 *
 * Grid mode (default, authentic Grimrock): discrete tile-to-tile stepping with
 * smooth lerp (smoothstep), hold-to-repeat, buffered input, 90° cardinal snap.
 *
 * Free roam mode (Doom FPS): analog WASD/ZQSD + QE turn + mouse look via
 * pointer lock, slide collision.
 *
 * Also owns circle collision, view bob figure-8 (vertical sin(phase*2),
 * horizontal sin(phase), roll sin(phase)), and torch point light.
 *
 * Design notes — AZERTY safe:
 * Input is handled via `event.code` (physical position) in systems/input.js,
 * not `event.key`. This file contains no key handling, but documents that
 * forward = KeyW OR KeyZ (covers W QWERTY + Z AZERTY), strafe = KeyA/KeyQ
 * etc. See input.js CODE_MAP for mapping table.
 *
 * Config comes from src/assets/config/gameplay/player.json v2 via setConfig().
 * No hardcoded constants besides fallbacks.
 */

import { sampleWalkSurface } from '../world/structural-features.js';

export class Player {
  constructor(x, y, angle = 0) {
    // Continuous pose
    this.x = x;
    this.y = y;
    this.angle = angle;

    // Config cache
    this._cfg = null;

    // Free mode intent (set via setInput)
    this._forward = 0;
    this._strafe = 0;
    this._turn = 0;
    this._mouseDX = 0;

    // Grid mode state
    this.gridMode = true;
    this.gridTargetX = x;
    this.gridTargetY = y;
    this.gridTargetAngle = angle;
    this.gridFacing = 0; // 0=N (-PI/2),1=E(0),2=S(PI/2),3=W(PI)
    this.moveLerp = 1;
    this.turnLerp = 1;
    this._gridStartX = x;
    this._gridStartY = y;
    this._gridStartAngle = angle;

    // Tunables with fallbacks, overridden via setConfig
    this.moveSpeed = 3.0;
    this.strafeSpeed = 2.8;
    this.turnSpeedKeyboard = 2.2;
    this.mouseSensitivity = 0.0022;
    this.radius = 0.28;
    this.height = 0.5;
    this.groundHeight = 0;
    this._groundHeightReady = false;
    this.gridMoveSpeed = 5.0;
    this.gridTurnSpeed = 6.5;
    this.gridHoldInitialDelay = 0.18;
    this.gridHoldRepeatDelay = 0.06;
    this.gridHoldInitial = 0.18; // alias for input.js compatibility
    this.gridHoldRepeat = 0.06;

    // View bob
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.viewBobEnabled = true;
    this.viewBobOffset = 0;   // vertical Y
    this.viewBobOffsetX = 0;  // horizontal lateral
    this.viewBobRoll = 0;     // roll rad
    this.bobParams = {
      ampY: 0.025,
      ampX: 0.015,
      ampRoll: 0.6 * Math.PI / 180,
      _ampRollDeg: 0.6,
      freq: 9.0,
      speedScale: 1.0,
    };

    // Card angles N/E/S/W
    this._cardAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

    this.updateFacingFromAngle();
  }

  _resolvePlayerCfg() {
    return this._cfg?.playerCfg || this._cfg?.player || this._cfg || {};
  }

  setConfig(cfg) {
    this._cfg = cfg;
    const pc = this._resolvePlayerCfg();

    this.moveSpeed = pc.moveSpeed ?? 3.0;
    this.strafeSpeed = pc.strafeSpeed ?? 2.8;
    this.turnSpeedKeyboard = pc.turnSpeed ?? pc.turnSpeedKeyboard ?? 2.2;
    this.mouseSensitivity = pc.mouseSensitivity ?? 0.0022;
    this.radius = pc.radius ?? pc.collision?.radius ?? 0.28;
    this.height = pc.height ?? 0.5;

    this.gridMode = pc.gridMode ?? true;
    this.gridMoveSpeed = pc.gridMoveSpeed ?? 5.0;
    this.gridTurnSpeed = pc.gridTurnSpeed ?? 6.5;
    this.gridHoldInitialDelay = pc.gridHoldInitialDelay ?? 0.18;
    this.gridHoldRepeatDelay = pc.gridHoldRepeatDelay ?? 0.06;
    this.gridHoldInitial = this.gridHoldInitialDelay;
    this.gridHoldRepeat = this.gridHoldRepeatDelay;

    this.viewBobEnabled = pc.viewBobEnabled ?? true;
    const b = pc.bob || {};
    const deg = b.ampRollDeg ?? this.bobParams._ampRollDeg ?? 0.6;
    this.bobParams = {
      ampY: b.ampY ?? 0.025,
      ampX: b.ampX ?? 0.015,
      ampRoll: (deg * Math.PI / 180),
      _ampRollDeg: deg,
      freq: b.freq ?? 9.0,
      speedScale: b.speedScale ?? 1.0,
    };
  }

  // Position helpers
  setPosition(x, y, angle = this.angle) {
    this.x = x; this.y = y; this.angle = angle;
    this.gridTargetX = x; this.gridTargetY = y; this.gridTargetAngle = angle;
    this._gridStartX = x; this._gridStartY = y; this._gridStartAngle = angle;
    this.moveLerp = 1; this.turnLerp = 1;
    this.bobPhase = 0; this.bobAmount = 0;
    this._forward = 0; this._strafe = 0; this._turn = 0; this._mouseDX = 0;
    this._groundHeightReady = false;
    this.updateFacingFromAngle();
  }
  // Alias for prototype compat
  setPos(x, y, angle) { this.setPosition(x, y, angle); }

  setViewBobEnabled(v) { this.viewBobEnabled = !!v; }
  setBobParams(p) {
    if (!p) return;
    if (p.ampY !== undefined) this.bobParams.ampY = p.ampY;
    if (p.ampX !== undefined) this.bobParams.ampX = p.ampX;
    if (p.ampRollDeg !== undefined) {
      this.bobParams._ampRollDeg = p.ampRollDeg;
      this.bobParams.ampRoll = (p.ampRollDeg * Math.PI / 180);
    } else if (p.ampRoll !== undefined) {
      this.bobParams.ampRoll = p.ampRoll;
      this.bobParams._ampRollDeg = p.ampRoll * 180 / Math.PI;
    }
    if (p.freq !== undefined) this.bobParams.freq = p.freq;
    if (p.speedScale !== undefined) this.bobParams.speedScale = p.speedScale;
  }
  getViewBobState() {
    return {
      enabled: this.viewBobEnabled,
      offset: this.viewBobOffset,
      offsetX: this.viewBobOffsetX,
      roll: this.viewBobRoll,
      phase: this.bobPhase,
      amount: this.bobAmount,
      params: { ...this.bobParams },
    };
  }

  setGridMode(on) {
    this.gridMode = !!on;
    if (this.gridMode) {
      // Snap to nearest tile center + cardinal for clean Grimrock feel
      this.gridTargetX = Math.floor(this.x) + 0.5;
      this.gridTargetY = Math.floor(this.y) + 0.5;
      let best = 0, bestD = 1e9;
      for (let i = 0; i < 4; i++) {
        let d = Math.abs(((this.angle - this._cardAngles[i] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < bestD) { bestD = d; best = i; }
      }
      this.gridFacing = best;
      this.gridTargetAngle = this._cardAngles[best];
      this._gridStartX = this.x; this._gridStartY = this.y; this._gridStartAngle = this.angle;
      this.moveLerp = 0; this.turnLerp = 0;
    } else {
      this.moveLerp = 1; this.turnLerp = 1;
    }
  }

  updateFacingFromAngle() {
    let best = 0, bestD = 1e9;
    for (let i = 0; i < 4; i++) {
      let d = Math.abs(((this.angle - this._cardAngles[i] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d < bestD) { bestD = d; best = i; }
    }
    this.gridFacing = best;
  }

  // Collision helpers
  isBlocked(px, py, map) {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
    return map.grid[iy * map.w + ix] !== 0;
  }

  collides(px, py, map) {
    // 8-point circle vs grid AABB
    const r = this.radius;
    const pts = [
      [px, py],
      [px + r, py], [px - r, py], [px, py + r], [px, py - r],
      [px + r * 0.7, py + r * 0.7], [px - r * 0.7, py + r * 0.7],
      [px + r * 0.7, py - r * 0.7], [px - r * 0.7, py - r * 0.7],
    ];
    for (const [x, y] of pts) { if (this.isBlocked(x, y, map)) return true; }
    return false;
  }

  // Legacy circle vs AABB per cell check (used for slide fallback more precise)
  _collidesPrecise(px, py, map) {
    const w = map.w, h = map.h, grid = map.grid;
    const r = this.radius;
    const minX = Math.max(0, Math.floor(px - r)), maxX = Math.min(w - 1, Math.floor(px + r));
    const minY = Math.max(0, Math.floor(py - r)), maxY = Math.min(h - 1, Math.floor(py + r));
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
      const idx = gy * w + gx;
      if (grid[idx] > 0) {
        const cx = Math.max(gx, Math.min(px, gx + 1));
        const cy = Math.max(gy, Math.min(py, gy + 1));
        const ddx = px - cx, ddy = py - cy;
        if (ddx * ddx + ddy * ddy < r * r) return true;
      }
    }
    return false;
  }

  // Input intent
  setInput(forward, strafe, turn, mouseDX) {
    this._forward = forward ?? 0;
    this._strafe = strafe ?? 0;
    this._turn = turn ?? 0;
    this._mouseDX = mouseDX ?? 0;
    // Mouse look only in free mode — in grid mode ignore to keep cardinal snapping pure
    if (this._mouseDX && !this.gridMode) {
      this.angle += this._mouseDX * this.mouseSensitivity;
    }
  }

  // Grid discrete moves
  tryGridMove(dir) {
    // Deprecated compatibility stub — use tryGridMoveWithMap(dir, map)
    // Returns vec for legacy callers expecting direction, logs warning.
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const f = this.gridFacing;
    if (dir === 0) return dirs[f];
    if (dir === 1) return dirs[(f + 2) & 3];
    if (dir === 2) return dirs[(f + 3) & 3];
    return dirs[(f + 1) & 3];
  }

  // Deprecated alias returning bool false to signal missing map — prefer tryGridMoveWithMap
  tryGridMoveLegacy() { return false; }

  tryGridMoveWithMap(dir, map) {
    if (!this.gridMode) return false;
    if (this.moveLerp < 1 || this.turnLerp < 1) return false;
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const f = this.gridFacing;
    let vec = dir === 0 ? dirs[f] : dir === 1 ? dirs[(f + 2) & 3] : dir === 2 ? dirs[(f + 3) & 3] : dirs[(f + 1) & 3];
    const tx = Math.floor(this.gridTargetX) + vec[0];
    const ty = Math.floor(this.gridTargetY) + vec[1];
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
    if (map.grid[ty * map.w + tx] !== 0) return false;
    this._gridStartX = this.x; this._gridStartY = this.y;
    this.gridTargetX += vec[0];
    this.gridTargetY += vec[1];
    this.moveLerp = 0;
    return true;
  }

  tryGridTurn(delta) {
    if (!this.gridMode) return false;
    if (this.moveLerp < 1 || this.turnLerp < 1) return false;
    this._gridStartAngle = this.angle;
    this.gridFacing = (this.gridFacing + delta + 4) & 3;
    this.gridTargetAngle = this._cardAngles[this.gridFacing];
    this.turnLerp = 0;
    return true;
  }

  // Main update — supports both signatures:
  // update(dt, map) when input already via setInput (new Input does this)
  // update(dt, inputObj, map) legacy where inputObj = {forward, strafe, turn, mouseDX}
  update(dt, a, b) {
    let map = null;
    let inputProvided = false;

    if (b && a && typeof a === "object" && (a.forward !== undefined || a.strafe !== undefined || a.turn !== undefined)) {
      // Legacy signature: dt, input, dungeon
      map = b;
      const inp = a;
      this._forward = inp.forward ?? 0;
      this._strafe = inp.strafe ?? 0;
      this._turn = inp.turn ?? 0;
      const md = inp.mouseDX ?? 0;
      if (md && !this.gridMode) this.angle += md * this.mouseSensitivity;
      inputProvided = true;
    } else if (a && a.grid && a.w !== undefined) {
      // New signature: dt, map
      map = a;
    } else if (b === undefined && a === undefined) {
      // no map, skip
    } else if (a && typeof a !== "object") {
      // dt only? ignore
    } else {
      map = a;
    }

    if (!map) {
      // Without map we can only update facing/bob? Return early.
      return;
    }

    if (this.gridMode) {
      let moving = false;
      if (this.moveLerp < 1) {
        this.moveLerp += dt * this.gridMoveSpeed;
        if (this.moveLerp >= 1) { this.moveLerp = 1; this.x = this.gridTargetX; this.y = this.gridTargetY; }
        else {
          const t = this.moveLerp; const st = t * t * (3 - 2 * t);
          this.x = this._gridStartX + (this.gridTargetX - this._gridStartX) * st;
          this.y = this._gridStartY + (this.gridTargetY - this._gridStartY) * st;
          moving = true;
        }
      } else {
        this.x = this.gridTargetX; this.y = this.gridTargetY;
      }

      if (this.turnLerp < 1) {
        this.turnLerp += dt * this.gridTurnSpeed;
        if (this.turnLerp >= 1) { this.turnLerp = 1; this.angle = this.gridTargetAngle; }
        else {
          const t = this.turnLerp; const st = t * t * (3 - 2 * t);
          let sa = this._gridStartAngle; let ea = this.gridTargetAngle;
          let da = ea - sa; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          this.angle = sa + da * st;
          moving = true;
        }
      } else {
        this.angle = this.gridTargetAngle;
      }

      if (this.angle > Math.PI) this.angle -= Math.PI * 2;
      if (this.angle < -Math.PI) this.angle += Math.PI * 2;

      this.updateFacingFromAngle();

      const speedApprox = moving ? this.moveSpeed * 0.6 : 0;
      const targetBob = moving ? 0.7 : 0;
      this.bobAmount += (targetBob - this.bobAmount) * dt * 8;
      const bp = this.bobParams;
      if (this.bobAmount > 0.01) {
        this.bobPhase += dt * bp.freq * bp.speedScale * (0.5 + this.bobAmount);
      }
      if (this.viewBobEnabled) {
        this.viewBobOffset = Math.sin(this.bobPhase * 2) * bp.ampY * this.bobAmount;
        this.viewBobOffsetX = Math.sin(this.bobPhase) * bp.ampX * this.bobAmount;
        this.viewBobRoll = Math.sin(this.bobPhase) * bp.ampRoll * this.bobAmount;
      } else {
        this.viewBobOffset = 0; this.viewBobOffsetX = 0; this.viewBobRoll = 0;
      }
      this._updateGroundHeight(dt, map);
      return;
    }

    // ---- Free roam ----
    if (this._turn !== 0) {
      this.angle += this._turn * this.turnSpeedKeyboard * dt;
    }
    if (this.angle > Math.PI) this.angle -= Math.PI * 2;
    if (this.angle < -Math.PI) this.angle += Math.PI * 2;

    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const fwdX = cos, fwdY = sin;
    const rightX = -sin, rightY = cos;

    // Diagonal clamp: normalize input vector if >1 to avoid sprint exploit (QWERTY + AZERTY same)
    let fwdIn = this._forward, strafeIn = this._strafe;
    const inLen = Math.hypot(fwdIn, strafeIn);
    if (inLen > 1) { fwdIn /= inLen; strafeIn /= inLen; }

    let moveX = fwdX * fwdIn * this.moveSpeed + rightX * strafeIn * this.strafeSpeed;
    let moveY = fwdY * fwdIn * this.moveSpeed + rightY * strafeIn * this.strafeSpeed;
    const speed = Math.hypot(moveX, moveY);
    moveX *= dt; moveY *= dt;

    // Slide collision: try full, then X only, then Y only (precise AABB)
    const newX = this.x + moveX;
    const newY = this.y + moveY;
    const checkFull = this._collidesPrecise(newX, newY, map);
    if (!checkFull) { this.x = newX; this.y = newY; }
    else if (!this._collidesPrecise(this.x + moveX, this.y, map)) { this.x += moveX; }
    else if (!this._collidesPrecise(this.x, this.y + moveY, map)) { this.y += moveY; }

    const targetBob = Math.min(1, speed / (this.moveSpeed || 3.0));
    this.bobAmount += (targetBob - this.bobAmount) * dt * 8;
    const bp = this.bobParams;
    if (this.bobAmount > 0.01) {
      this.bobPhase += dt * bp.freq * bp.speedScale * (0.5 + this.bobAmount);
    }
    if (this.viewBobEnabled) {
      this.viewBobOffset = Math.sin(this.bobPhase * 2) * bp.ampY * this.bobAmount;
      this.viewBobOffsetX = Math.sin(this.bobPhase) * bp.ampX * this.bobAmount;
      const strafeInfluence = this._strafe * 0.5;
      this.viewBobRoll = Math.sin(this.bobPhase) * bp.ampRoll * this.bobAmount + strafeInfluence * bp.ampRoll * 0.8;
    } else {
      this.viewBobOffset = 0; this.viewBobOffsetX = 0; this.viewBobRoll = 0;
    }
    this._updateGroundHeight(dt, map);
  }

  _updateGroundHeight(dt, map) {
    const sample = sampleWalkSurface(map, this.x, this.y);
    const target = Number.isFinite(sample.height) ? sample.height : 0;
    if (!this._groundHeightReady) {
      this.groundHeight = target;
      this._groundHeightReady = true;
      return;
    }
    const blend = 1 - Math.exp(-Math.max(0, dt) * 12);
    this.groundHeight += (target - this.groundHeight) * blend;
  }

  getPosition() {
    const pc = this._resolvePlayerCfg();
    const h = pc.height ?? this.height ?? 0.5;
    // Base height only — vertical bob now handled via u_bobPixels uniform in renderer-gpu.js
    // to avoid double application. Use getViewBobState() for explicit offsets.
    return { x: this.x, y: this.y, z: h + this.groundHeight };
  }

  getAngle() { return this.angle; }
  // Raw angle without roll (for minimap etc) — alias kept for compat, getAngle now returns raw too
  getRawAngle() { return this.angle; }
  // New: angle including roll for callers that explicitly want bob roll in yaw (legacy behavior)
  getAngleWithRoll() { return this.angle + (this.viewBobEnabled ? this.viewBobRoll : 0); }

  getLightSource() {
    const pc = this._resolvePlayerCfg();
    // Merge path: player.json light is primary, but lighting.json player is authoritative fallback / override
    // This fixes dead-code bug where lighting.json player edits never took effect (user reported).
    const lightFromPlayerJson = pc.light ?? {};
    const lightFromLightingJson = this._cfg?.lighting?.player ?? {};
    // Lighting overrides player json so that editor's PLAYER section (lighting/lighting.json) actually works.
    const cfg = { ...lightFromPlayerJson, ...lightFromLightingJson };

    const h = pc.height ?? this.height ?? 0.5;
    const lh = cfg.height ?? lightFromPlayerJson.height ?? 0.45;
    const col = cfg.color ?? lightFromPlayerJson.color ?? [1, 0.9, 0.7];
    const intensity = cfg.intensity ?? lightFromPlayerJson.intensity ?? 1.8;
    const radius = cfg.radius ?? lightFromPlayerJson.radius ?? 4.5;
    const noShadow = cfg.noShadow ?? lightFromPlayerJson.noShadow ?? true;
    const enabled = cfg.enabled ?? lightFromPlayerJson.enabled ?? true;

    // Light does not bob vertically — keeps torch steady while camera bobs via u_bobPixels
    // If disabled, return 0 intensity so renderer still keeps slot but no contribution.
    return {
      x: this.x,
      y: this.y,
      z: this.groundHeight + h + lh,
      color: col,
      intensity: enabled ? intensity : 0,
      radius,
      noShadow: !!noShadow,
      enabled: !!enabled,
    };
  }

  getCardinal() {
    const deg = (this.angle * 180 / Math.PI + 360 + 90) % 360;
    if (deg < 45 || deg >= 315) return "N";
    if (deg < 135) return "E";
    if (deg < 225) return "S";
    return "W";
  }
}

