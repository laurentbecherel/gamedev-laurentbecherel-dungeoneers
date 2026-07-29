/**
 * Input — keyboard & mouse handling driving the Player.
 *
 * AZERTY-safe: Uses event.code (physical position), NOT event.key.
 * Grimrock mapping kept, but exclusive codes to avoid Q/A overlap:
 *   Code | QWERTY label | AZERTY label | Action (Grimrock)
 *   KeyW | W            | Z            | Forward (ZQSD Z)
 *   KeyZ | Z            | W            | Forward courtesy (W label AZERTY)
 *   KeyS | S            | S            | Back
 *   KeyA | A            | Q            | Strafe Left (Q label AZERTY) — EXCLUSIVE
 *   KeyD | D            | D            | Strafe Right
 *   KeyQ | Q            | A            | Turn Left (A label AZERTY) — EXCLUSIVE
 *   KeyE | E            | E            | Turn Right
 *   Digit1-8 | 1-8 | &é"'(-è_ç | Debug toggles via code (no Shift needed)
 *
 * This fixes "Q and A do both the same thing" — previously strafeLeftAlt included KeyQ,
 * causing overlap. Now each physical key has exactly one action.
 * Middle of grid: handled in player.js — gridTarget always floor+0.5 (center), lerp snaps.
 */

const CODE_MAP = {
  forward: ["KeyW", "KeyZ", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  strafeLeft: ["KeyA"],
  strafeRight: ["KeyD"],
  turnLeft: ["KeyQ", "ArrowLeft"],
  turnRight: ["KeyE", "ArrowRight"],
  regen: ["KeyR"],
  map: ["KeyM"],
  gridToggle: ["KeyG"],
  bobToggle: ["KeyV", "KeyB"],
  bobPreset: ["KeyP"],
  debug1: ["Digit1", "Numpad1"],
  debug2: ["Digit2", "Numpad2"],
  debug3: ["Digit3", "Numpad3"],
  debug4: ["Digit4", "Numpad4"],
  debug5: ["Digit5", "Numpad5"],
  debug6: ["Digit6", "Numpad6"],
  debug7: ["Digit7", "Numpad7"],
  debug8: ["Digit8", "Numpad8"],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.pressed = new Set();
    this.prevPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this._hold = { f: 0, b: 0, ls: 0, rs: 0, tl: 0, tr: 0 };
    this._holdInitial = 0.18;
    this._holdRepeat = 0.06;
    this._buffer = null;
    this._bufferTimeout = 0.3;

    this._onKeyDown = (e) => { if (e.code) this.pressed.add(e.code); };
    this._onKeyUp = (e) => { if (e.code) this.pressed.delete(e.code); };
    this._onBlur = () => { this.pressed.clear(); };
    this._onVisibility = () => { if (document.hidden) this.pressed.clear(); };
    this._onClick = () => {
      if (this.canvas && !this.pointerLocked) {
        try { this.canvas.requestPointerLock(); } catch {}
      }
    };
    this._onPointerLockChange = () => {
      if (this.canvas) this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    this._onMouseMove = (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onEsc = (e) => { if (e.code === "Escape") { try { document.exitPointerLock(); } catch {} } };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    document.addEventListener("visibilitychange", this._onVisibility);
    if (this.canvas) {
      this.canvas.addEventListener("click", this._onClick);
      document.addEventListener("pointerlockchange", this._onPointerLockChange);
      document.addEventListener("mousemove", this._onMouseMove);
      this.canvas.addEventListener("contextmenu", this._onContextMenu);
      document.addEventListener("keydown", this._onEsc);
    }
  }

  isCodeDown(codeOrCodes) {
    if (Array.isArray(codeOrCodes)) {
      for (const c of codeOrCodes) if (this.pressed.has(c)) return true;
      return false;
    }
    return this.pressed.has(codeOrCodes);
  }
  isDown(codeOrCodes) { return this.isCodeDown(codeOrCodes); }

  justPressed(codeOrCodes) {
    const check = (c) => this.pressed.has(c) && !this.prevPressed.has(c);
    if (Array.isArray(codeOrCodes)) {
      for (const c of codeOrCodes) if (check(c)) return true;
      return false;
    }
    return check(codeOrCodes);
  }

  update(dt, player, map) {
    if (!player || !map) {
      const forward = (this.isCodeDown(CODE_MAP.forward) ? 1 : 0) - (this.isCodeDown(CODE_MAP.back) ? 1 : 0);
      const strafe = (this.isCodeDown(CODE_MAP.strafeRight) ? 1 : 0) - (this.isCodeDown(CODE_MAP.strafeLeft) ? 1 : 0);
      const turn = (this.isCodeDown(CODE_MAP.turnRight) ? 1 : 0) - (this.isCodeDown(CODE_MAP.turnLeft) ? 1 : 0);
      const md = this.mouseDX; this.mouseDX = 0; this.mouseDY = 0;
      this.prevPressed = new Set(this.pressed);
      return { forward, strafe, turn, mouseDX: md, mouseDY: 0 };
    }

    if (player.gridHoldInitialDelay !== undefined) this._holdInitial = player.gridHoldInitialDelay;
    if (player.gridHoldRepeatDelay !== undefined) this._holdRepeat = player.gridHoldRepeatDelay;
    if (player.gridHoldInitial !== undefined) this._holdInitial = player.gridHoldInitial;
    if (player.gridHoldRepeat !== undefined) this._holdRepeat = player.gridHoldRepeat;

    const mouseDX = this.mouseDX;
    this.mouseDX = 0; this.mouseDY = 0;
    const gridMode = !!player.gridMode;

    if (gridMode) {
      const downF = this.isCodeDown(CODE_MAP.forward);
      const downB = this.isCodeDown(CODE_MAP.back);
      const downLS = this.isCodeDown(CODE_MAP.strafeLeft);
      const downRS = this.isCodeDown(CODE_MAP.strafeRight);
      const downTL = this.isCodeDown(CODE_MAP.turnLeft);
      const downTR = this.isCodeDown(CODE_MAP.turnRight);

      const jpF = this.justPressed(CODE_MAP.forward);
      const jpB = this.justPressed(CODE_MAP.back);
      const jpLS = this.justPressed(CODE_MAP.strafeLeft);
      const jpRS = this.justPressed(CODE_MAP.strafeRight);
      const jpTL = this.justPressed(CODE_MAP.turnLeft);
      const jpTR = this.justPressed(CODE_MAP.turnRight);

      let acted = false;
      const tryImmediate = (type, fn, holdKey) => {
        if (fn()) { acted = true; this._hold[holdKey] = 0; this._buffer = null; return true; }
        if (player.moveLerp < 1 || player.turnLerp < 1) { this._buffer = { type, age: 0 }; }
        return false;
      };

      if (jpF && !acted) tryImmediate("f", () => player.tryGridMoveWithMap(0, map), "f");
      if (jpB && !acted) tryImmediate("b", () => player.tryGridMoveWithMap(1, map), "b");
      if (jpLS && !acted) tryImmediate("ls", () => player.tryGridMoveWithMap(2, map), "ls");
      if (jpRS && !acted) tryImmediate("rs", () => player.tryGridMoveWithMap(3, map), "rs");
      if (jpTL && !acted) tryImmediate("tl", () => player.tryGridTurn(-1), "tl");
      if (jpTR && !acted) tryImmediate("tr", () => player.tryGridTurn(1), "tr");

      this._hold.f = downF ? this._hold.f + dt : 0;
      this._hold.b = downB ? this._hold.b + dt : 0;
      this._hold.ls = downLS ? this._hold.ls + dt : 0;
      this._hold.rs = downRS ? this._hold.rs + dt : 0;
      this._hold.tl = downTL ? this._hold.tl + dt : 0;
      this._hold.tr = downTR ? this._hold.tr + dt : 0;

      if (this._buffer) {
        this._buffer.age += dt;
        if (this._buffer.age > this._bufferTimeout) this._buffer = null;
      }

      const idle = player.moveLerp >= 1 && player.turnLerp >= 1;

      if (idle && !acted && this._buffer) {
        const b = this._buffer.type;
        let ok = false;
        if (b === "f") ok = player.tryGridMoveWithMap(0, map);
        else if (b === "b") ok = player.tryGridMoveWithMap(1, map);
        else if (b === "ls") ok = player.tryGridMoveWithMap(2, map);
        else if (b === "rs") ok = player.tryGridMoveWithMap(3, map);
        else if (b === "tl") ok = player.tryGridTurn(-1);
        else if (b === "tr") ok = player.tryGridTurn(1);
        if (ok) {
          acted = true; this._buffer = null;
          const hkMap = { f: "f", b: "b", ls: "ls", rs: "rs", tl: "tl", tr: "tr" };
          const hk = hkMap[b];
          if (hk) this._hold[hk] = 0;
        } else { this._buffer = null; }
      }

      if (idle && !acted) {
        const tryHold = (down, timerKey, fn) => {
          if (!down) return false;
          const t = this._hold[timerKey];
          if (t < this._holdInitial) return false;
          if (fn()) { this._hold[timerKey] = this._holdInitial - this._holdRepeat; this._buffer = null; return true; }
          else { this._hold[timerKey] = this._holdInitial - this._holdRepeat; return false; }
        };
        if (!acted) acted = tryHold(downF, "f", () => player.tryGridMoveWithMap(0, map));
        if (!acted) acted = tryHold(downB, "b", () => player.tryGridMoveWithMap(1, map));
        if (!acted) acted = tryHold(downLS, "ls", () => player.tryGridMoveWithMap(2, map));
        if (!acted) acted = tryHold(downRS, "rs", () => player.tryGridMoveWithMap(3, map));
        if (!acted) acted = tryHold(downTL, "tl", () => player.tryGridTurn(-1));
        if (!acted) acted = tryHold(downTR, "tr", () => player.tryGridTurn(1));
      }

      player.setInput(0, 0, 0, 0);
      player.update(dt, map);
    } else {
      let forward = 0, strafe = 0, turn = 0;
      if (this.isCodeDown(CODE_MAP.forward)) forward += 1;
      if (this.isCodeDown(CODE_MAP.back)) forward -= 1;
      if (this.isCodeDown(CODE_MAP.strafeLeft)) strafe -= 1;
      if (this.isCodeDown(CODE_MAP.strafeRight)) strafe += 1;
      if (this.isCodeDown(CODE_MAP.turnLeft)) turn -= 1;
      if (this.isCodeDown(CODE_MAP.turnRight)) turn += 1;
      const len = Math.hypot(forward, strafe);
      if (len > 1) { forward /= len; strafe /= len; }
      player.setInput(forward, strafe, turn, mouseDX);
      player.update(dt, map);
    }

    this.prevPressed = new Set(this.pressed);
    return { forward: player._forward, strafe: player._strafe, turn: player._turn, mouseDX: 0 };
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    document.removeEventListener("visibilitychange", this._onVisibility);
    if (this.canvas) {
      this.canvas.removeEventListener("click", this._onClick);
      document.removeEventListener("pointerlockchange", this._onPointerLockChange);
      document.removeEventListener("mousemove", this._onMouseMove);
      this.canvas.removeEventListener("contextmenu", this._onContextMenu);
      document.removeEventListener("keydown", this._onEsc);
    }
  }
}
