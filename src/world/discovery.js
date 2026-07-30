/**
 * DiscoveryManager — pure fog-of-war for minimap.
 * Single responsibility: owns discovered state, discovery order, path history, animation timing.
 * No Canvas2D, no DOM, no Game import, no config import (config injected), Node-testable.
 */
export function getRoomAt(x, y, dungeon) {
  if (!dungeon || !dungeon.rooms) return null;
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 0; i < dungeon.rooms.length; i++) {
    const r = dungeon.rooms[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  }
  return null;
}
function isWalkable(x, y, dungeon) {
  if (!dungeon) return false;
  const w = dungeon.w, h = dungeon.h;
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const idx = y * w + x;
  const gv = dungeon.grid ? dungeon.grid[idx] : 1;
  return gv === 0;
}
export class DiscoveryManager {
  constructor(dungeon = null, cfg = null) {
    this._orderCounter = 1;
    this._discovered = null;
    this._order = null;
    this._w = 0; this._h = 0;
    this._path = [];
    this._lastGridX = null; this._lastGridY = null;
    this._lastMapOpenMaxOrder = 0;
    this._pendingNewSinceLastOpen = [];
    this._animationStartTime = null;
    this._cfg = null;
    this._resolveCfg(cfg);
    if (dungeon) this.reset(dungeon, cfg);
  }
  _resolveCfg(cfg) {
    const src = cfg || {};
    const reveal = src.reveal || {};
    const trail = src.trail || {};
    const dither = reveal.dither || {};
    const playerDir = src.playerDir || reveal.playerDir || {};
    this._cfg = {
      reveal: {
        enabled: reveal.enabled ?? true,
        peekDistance: reveal.peekDistance ?? 1,
        corridorRevealRadius: reveal.corridorRevealRadius ?? 4,
        corridor3x3: reveal.corridor3x3 ?? true,
        animationDuration: reveal.animationDuration ?? 400,
        dither: { enabled: dither.enabled ?? true, pattern: dither.pattern ?? "random", bayerSize: dither.bayerSize ?? 4, dotSize: dither.dotSize ?? 2 },
        undiscovered: { hide: reveal.undiscovered?.hide ?? true },
        playerDir: {
          enabled: playerDir.enabled ?? true,
          size: playerDir.size ?? 0,
          color: playerDir.color ?? [15, 220, 15],
          opacity: playerDir.opacity ?? 0.95,
        },
      },
      trail: {
        enabled: trail.enabled ?? true,
        opacity: trail.opacity ?? 0.5,
        onlyDiscovered: trail.onlyDiscovered ?? true,
        maxPoints: trail.maxPoints ?? 1024,
        dash: trail.dash ?? [5, 4],
        lineWidth: trail.lineWidth ?? 1.8,
        color: trail.color ?? [201, 168, 76],
      },
      playerDir: {
        enabled: (src.playerDir?.enabled) ?? (reveal.playerDir?.enabled) ?? true,
        size: (src.playerDir?.size) ?? (reveal.playerDir?.size) ?? 0,
        color: (src.playerDir?.color) ?? (reveal.playerDir?.color) ?? [15, 220, 15],
        opacity: (src.playerDir?.opacity) ?? (reveal.playerDir?.opacity) ?? 0.95,
      }
    };
    // normalize playerDir at top level too for UI
    if (!this._cfg.playerDir) this._cfg.playerDir = this._cfg.reveal.playerDir;
  }
  reset(dungeon, cfg = null) {
    if (cfg) this._resolveCfg(cfg);
    const w = dungeon ? dungeon.w : this._w;
    const h = dungeon ? dungeon.h : this._h;
    this._w = w; this._h = h;
    this._discovered = new Uint8Array(w * h);
    this._order = new Int32Array(w * h);
    this._orderCounter = 1;
    this._path = [];
    this._lastGridX = null; this._lastGridY = null;
    this._lastMapOpenMaxOrder = 0;
    this._pendingNewSinceLastOpen = [];
    this._animationStartTime = null;
  }
  _idx(x, y) { return y * this._w + x; }
  _inBounds(x, y) { return x >= 0 && y >= 0 && x < this._w && y < this._h; }
  isDiscovered(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this._inBounds(x, y)) return false;
    return this._discovered[this._idx(x, y)] === 1;
  }
  getDiscoveryOrder(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this._inBounds(x, y)) return 0;
    return this._order[this._idx(x, y)];
  }
  _markCell(x, y, newly) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this._inBounds(x, y)) return false;
    const i = this._idx(x, y);
    if (this._discovered[i] === 1) return false;
    this._discovered[i] = 1;
    this._order[i] = this._orderCounter++;
    if (newly) newly.push({ x, y, order: this._order[i] });
    return true;
  }
  _revealSurroundingWalls(cx, cy, dungeon, newly) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if (!this._inBounds(x, y)) continue;
      const w = dungeon ? dungeon.w : 0;
      const hh = dungeon ? dungeon.h : 0;
      if (x < 0 || y < 0 || x >= w || y >= hh) continue;
      const idx = y * w + x;
      const isFloor = dungeon.grid && dungeon.grid[idx] === 0;
      if (isFloor) {
        if (x === cx && y === cy) continue;
        continue;
      }
      this._markCell(x, y, newly);
    }
  }
  _revealRoom(room, dungeon, newly) {
    if (!room) return;
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (isWalkable(x, y, dungeon)) this._markCell(x, y, newly);
    for (let x = room.x - 1; x <= room.x + room.w; x++) for (let y = room.y - 1; y <= room.y + room.h; y++) {
      const isBorder = x === room.x - 1 || x === room.x + room.w || y === room.y - 1 || y === room.y + room.h;
      if (!isBorder) continue;
      if (!this._inBounds(x, y)) continue;
      this._markCell(x, y, newly);
    }
  }
  _revealPeekForRoom(room, dungeon, newly) {
    const peek = this._cfg.reveal.peekDistance ?? 1;
    if (peek <= 0) return;
    for (let x = room.x; x < room.x + room.w; x++) {
      let y = room.y - 1;
      if (isWalkable(x, y, dungeon)) {
        for (let p = 1; p <= peek; p++) {
          const py = y - p;
          if (!isWalkable(x, py, dungeon)) break;
          if (getRoomAt(x, py, dungeon)) break;
          this._markCell(x, py, newly);
          this._revealSurroundingWalls(x, py, dungeon, newly);
        }
        this._markCell(x, y, newly);
        this._revealSurroundingWalls(x, y, dungeon, newly);
      }
      y = room.y + room.h;
      if (isWalkable(x, y, dungeon)) {
        for (let p = 1; p <= peek; p++) {
          const py = y + p;
          if (!isWalkable(x, py, dungeon)) break;
          if (getRoomAt(x, py, dungeon)) break;
          this._markCell(x, py, newly);
          this._revealSurroundingWalls(x, py, dungeon, newly);
        }
        this._markCell(x, y, newly);
        this._revealSurroundingWalls(x, y, dungeon, newly);
      }
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      let x = room.x - 1;
      if (isWalkable(x, y, dungeon)) {
        for (let p = 1; p <= peek; p++) {
          const px = x - p;
          if (!isWalkable(px, y, dungeon)) break;
          if (getRoomAt(px, y, dungeon)) break;
          this._markCell(px, y, newly);
          this._revealSurroundingWalls(px, y, dungeon, newly);
        }
        this._markCell(x, y, newly);
        this._revealSurroundingWalls(x, y, dungeon, newly);
      }
      x = room.x + room.w;
      if (isWalkable(x, y, dungeon)) {
        for (let p = 1; p <= peek; p++) {
          const px = x + p;
          if (!isWalkable(px, y, dungeon)) break;
          if (getRoomAt(px, y, dungeon)) break;
          this._markCell(px, y, newly);
          this._revealSurroundingWalls(px, y, dungeon, newly);
        }
        this._markCell(x, y, newly);
        this._revealSurroundingWalls(x, y, dungeon, newly);
      }
    }
  }
  _revealCorridorAt(px, py, dungeon, newly) {
    if (this._cfg.reveal.corridor3x3) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this._markCell(px + dx, py + dy, newly); } else { this._markCell(px, py, newly); }
    const radius = this._cfg.reveal.corridorRevealRadius ?? 4;
    const visited = new Set(); const queue = [{ x: px, y: py, d: 0 }]; visited.add(px + "," + py);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d >= radius) continue;
      const neighbors = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx, dy] of neighbors) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const key = nx + "," + ny;
        if (visited.has(key)) continue;
        if (!this._inBounds(nx, ny)) continue;
        if (!isWalkable(nx, ny, dungeon)) continue;
        const roomAt = getRoomAt(nx, ny, dungeon);
        if (roomAt) {
          this._markCell(nx, ny, newly);
          this._revealSurroundingWalls(nx, ny, dungeon, newly);
          visited.add(key);
          continue;
        }
        this._markCell(nx, ny, newly);
        this._revealSurroundingWalls(nx, ny, dungeon, newly);
        visited.add(key);
        queue.push({ x: nx, y: ny, d: cur.d + 1 });
      }
    }
  }
  markDiscoveredAt(px, py, dungeon) {
    if (!dungeon) return [];
    if (this._w !== dungeon.w || this._h !== dungeon.h) this.reset(dungeon);
    px = Math.floor(px); py = Math.floor(py);
    if (!this._inBounds(px, py)) return [];
    const newly = [];
    const room = getRoomAt(px, py, dungeon);
    if (room) { this._revealRoom(room, dungeon, newly); this._revealPeekForRoom(room, dungeon, newly); } else { this._revealCorridorAt(px, py, dungeon, newly); }
    this._markCell(px, py, newly);
    return newly;
  }
  addPathPoint(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this._inBounds(x, y)) return false;
    const maxPoints = this._cfg.trail.maxPoints ?? 1024;
    if (this._path.length === 0) { this._path.push({ x, y }); this._lastGridX = x; this._lastGridY = y; return true; }
    if (this._lastGridX === x && this._lastGridY === y) return false;
    this._path.push({ x, y });
    if (this._path.length > maxPoints) this._path.shift();
    this._lastGridX = x; this._lastGridY = y;
    return true;
  }
  getPath() { return this._path.slice(); }
  getDiscoveredCount() { let c = 0; for (let i = 0; i < this._discovered.length; i++) if (this._discovered[i]) c++; return c; }
  getWalkableDiscoveredCount(dungeon) {
    if (!dungeon) return this.getDiscoveredCount();
    let c = 0; for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) if (this.isDiscovered(x, y) && isWalkable(x, y, dungeon)) c++;
    return c;
  }
  onMapOpened(nowMs) {
    const now = nowMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const pending = [];
    for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) {
      const ord = this.getDiscoveryOrder(x, y);
      if (ord > this._lastMapOpenMaxOrder) pending.push({ x, y, order: ord });
    }
    pending.sort((a, b) => a.order - b.order);
    this._pendingNewSinceLastOpen = pending;
    let maxOrd = this._lastMapOpenMaxOrder;
    for (let i = 0; i < this._order.length; i++) if (this._order[i] > maxOrd) maxOrd = this._order[i];
    this._lastMapOpenMaxOrder = maxOrd;
    this._animationStartTime = now;
    return pending.slice();
  }
  getAnimationProgress(nowMs, duration = null) {
    if (this._animationStartTime == null) return 1;
    const dur = duration ?? this._cfg.reveal.animationDuration ?? 400;
    const now = nowMs ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
    const elapsed = now - this._animationStartTime;
    if (elapsed >= dur) return 1;
    if (elapsed <= 0) return 0;
    return Math.min(1, Math.max(0, elapsed / dur));
  }
  getNewlyDiscoveredSinceLastOpen() { return this._pendingNewSinceLastOpen.slice(); }
  getAllDiscovered() {
    const out = [];
    for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) if (this.isDiscovered(x, y)) out.push({ x, y, order: this.getDiscoveryOrder(x, y) });
    return out;
  }
  setConfig(cfg) { this._resolveCfg(cfg); }
  // Bug fix: when discovery happens while map is open, mark as seen immediately so close+reopen does not re-animate
  setLastOpenMaxToCurrent() {
    let maxOrd = this._lastMapOpenMaxOrder;
    for (let i = 0; i < this._order.length; i++) if (this._order[i] > maxOrd) maxOrd = this._order[i];
    this._lastMapOpenMaxOrder = maxOrd;
  }
  // Live update while map open: merge newly discovered into pending for current dither, but also mark as seen for next open
  addPendingWhileMapOpen(newly) {
    if (!newly || newly.length === 0) return;
    const existing = new Set(this._pendingNewSinceLastOpen.map(function(c){ return c.x + "," + c.y; }));
    for (let i=0;i<newly.length;i++) {
      const cell = newly[i];
      const key = cell.x + "," + cell.y;
      if (!existing.has(key)) {
        this._pendingNewSinceLastOpen.push(cell);
        existing.add(key);
      }
    }
    this.setLastOpenMaxToCurrent();
  }
}
