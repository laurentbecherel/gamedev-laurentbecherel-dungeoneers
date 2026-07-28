// Keyboard input state tracker

export class Input {
  constructor() {
    this.pressed = new Set();
    this._onDown = (e) => this.pressed.add(e.key.toLowerCase());
    this._onUp = (e) => this.pressed.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
  }

  update() {
    const p = this.pressed;
    const forward = (p.has('w') ? 1 : 0) - (p.has('s') ? 1 : 0);
    const strafe = (p.has('d') ? 1 : 0) - (p.has('a') ? 1 : 0);
    const turn = (p.has('e') ? 1 : 0) - (p.has('q') ? 1 : 0);
    return { forward, strafe, turn };
  }

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }
}
