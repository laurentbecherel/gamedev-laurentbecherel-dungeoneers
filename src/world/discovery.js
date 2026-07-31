/**
 * DiscoveryManager � pure fog-of-war for minimap.
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
    const revealSrc = src.reveal || {};
    const trailSrc = src.trail || {};
    const ditherSrc = revealSrc.dither || {};
    const playerDirSrc = src.playerDir || revealSrc.playerDir || {};
    const undiscoveredSrc = revealSrc.undiscovered || {};

    this._cfg = {
      reveal: {
        enabled: revealSrc.enabled ?? true,
        peekDistance: revealSrc.peekDistance ?? 1,
        corridorRevealRadius: revealSrc.corridorRevealRadius ?? 4,
        corridor3x3: revealSrc.corridor3x3 ?? true,
        animationDuration: revealSrc.animationDuration ?? 400,
        roomReveal: revealSrc.roomReveal ?? 'entire',
        dither: {
          enabled: ditherSrc.enabled ?? true,
          pattern: ditherSrc.pattern ?? 'random',
          bayerSize: ditherSrc.bayerSize ?? 4,
          dotSize: ditherSrc.dotSize ?? 2,
        },
        undiscovered: { hide: undiscoveredSrc.hide ?? true },
        oldRoomOpacity: revealSrc.oldRoomOpacity ?? 0.85,
        currentRoomBoost: revealSrc.currentRoomBoost ?? 0.15,
      },
      trail: {
        enabled: trailSrc.enabled ?? true,
        color: trailSrc.color ?? [88, 128, 92],
        opacity: trailSrc.opacity ?? 0.45,
        lineWidth: trailSrc.lineWidth ?? 2.0,
        dash: trailSrc.dash ?? [5, 4],
        cap: trailSrc.cap ?? 'butt',
        join: trailSrc.join ?? 'miter',
        maxPoints: trailSrc.maxPoints ?? 1024,
        onlyDiscovered: trailSrc.onlyDiscovered ?? true,
      },
      playerDir: {
        enabled: playerDirSrc.enabled ?? true,
        size: playerDirSrc.size ?? 0,
        color: playerDirSrc.color ?? [42, 42, 42],
        opacity: playerDirSrc.opacity ?? 0.95,
      },
      debug: {
        logNewRoom: src.debug?.logNewRoom ?? false,
      }
    };
  }

  reset(dungeon, cfg = null) {
    if (cfg) this._resolveCfg(cfg);
    const w = dungeon ? dungeon.w : this._w;
    const h = dungeon ? dungeon.h : this._h;
    if (!w || !h) {
      this._w = w; this._h = h;
      this._discovered = new Uint8Array(0);
      this._order = new Int32Array(0);
      return;
    }
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
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x === cx && y === cy) continue;
        if (!this._inBounds(x, y)) continue;
        if (isWalkable(x, y, dungeon)) continue;
        this._markCell(x, y, newly);
      }
    }
  }

  _revealRoom(room, dungeon, newly) {
    if (!room) return;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (isWalkable(x, y, dungeon)) this._markCell(x, y, newly);
      }
    }
    this._revealRoomBorder(room, newly);
  }

  _revealRoomBorder(room, newly) {
    const x0 = room.x - 1, x1 = room.x + room.w;
    const y0 = room.y - 1, y1 = room.y + room.h;
    for (let x = x0; x <= x1; x++) {
      this._markCell(x, y0, newly);
      this._markCell(x, y1, newly);
    }
    for (let y = y0; y <= y1; y++) {
      this._markCell(x0, y, newly);
      this._markCell(x1, y, newly);
    }
  }

  _revealPeekLine(doorX, doorY, dirX, dirY, peek, dungeon, newly) {
    if (!isWalkable(doorX, doorY, dungeon)) return;
    this._markCell(doorX, doorY, newly);
    this._revealSurroundingWalls(doorX, doorY, dungeon, newly);
    let cx = doorX, cy = doorY;
    for (let p = 1; p <= peek; p++) {
      cx += dirX; cy += dirY;
      if (!isWalkable(cx, cy, dungeon)) break;
      if (getRoomAt(cx, cy, dungeon)) break;
      this._markCell(cx, cy, newly);
      this._revealSurroundingWalls(cx, cy, dungeon, newly);
    }
  }

  _revealPeekForRoom(room, dungeon, newly) {
    const peek = this._cfg.reveal.peekDistance ?? 1;
    if (peek <= 0) return;
    for (let x = room.x; x < room.x + room.w; x++) {
      this._revealPeekLine(x, room.y - 1, 0, -1, peek, dungeon, newly);
      this._revealPeekLine(x, room.y + room.h, 0, 1, peek, dungeon, newly);
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      this._revealPeekLine(room.x - 1, y, -1, 0, peek, dungeon, newly);
      this._revealPeekLine(room.x + room.w, y, 1, 0, peek, dungeon, newly);
    }
  }

  _revealCorridorAt(px, py, dungeon, newly) {
    if (this._cfg.reveal.corridor3x3) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this._markCell(px + dx, py + dy, newly);
    } else {
      this._markCell(px, py, newly);
    }
    this._revealCorridorBFS(px, py, dungeon, newly);
  }

  _revealCorridorBFS(startX, startY, dungeon, newly) {
    const radius = this._cfg.reveal.corridorRevealRadius ?? 4;
    const visited = new Set();
    const queue = [{ x: startX, y: startY, d: 0 }];
    visited.add(startX + ',' + startY);
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d >= radius) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        if (!this._inBounds(nx, ny)) continue;
        if (!isWalkable(nx, ny, dungeon)) continue;
        if (getRoomAt(nx, ny, dungeon)) {
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
    if (room) {
      this._revealRoom(room, dungeon, newly);
      this._revealPeekForRoom(room, dungeon, newly);
    } else {
      this._revealCorridorAt(px, py, dungeon, newly);
    }
    this._markCell(px, py, newly);
    return newly;
  }

  addPathPoint(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this._inBounds(x, y)) return false;
    const maxPoints = this._cfg.trail.maxPoints ?? 1024;
    if (this._path.length === 0) {
      this._path.push({ x, y });
      this._lastGridX = x; this._lastGridY = y;
      return true;
    }
    if (this._lastGridX === x && this._lastGridY === y) return false;
    this._path.push({ x, y });
    if (this._path.length > maxPoints) this._path.shift();
    this._lastGridX = x; this._lastGridY = y;
    return true;
  }

  getPath() { return this._path.slice(); }

  getDiscoveredCount() {
    let c = 0;
    for (let i = 0; i < this._discovered.length; i++) if (this._discovered[i]) c++;
    return c;
  }

  getWalkableDiscoveredCount(dungeon) {
    if (!dungeon) return this.getDiscoveredCount();
    let c = 0;
    for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) {
      if (this.isDiscovered(x, y) && isWalkable(x, y, dungeon)) c++;
    }
    return c;
  }

  onMapOpened(nowMs) {
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const pending = [];
    for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) {
      const ord = this.getDiscoveryOrder(x, y);
      if (ord > this._lastMapOpenMaxOrder) pending.push({ x, y, order: ord });
    }
    pending.sort((a, b) => a.order - b.order);
    this._pendingNewSinceLastOpen = pending;
    this._lastMapOpenMaxOrder = this._getCurrentMaxOrder();
    this._animationStartTime = now;
    return pending.slice();
  }

  _getCurrentMaxOrder() {
    let maxOrd = this._lastMapOpenMaxOrder;
    for (let i = 0; i < this._order.length; i++) if (this._order[i] > maxOrd) maxOrd = this._order[i];
    return maxOrd;
  }

  getAnimationProgress(nowMs, duration = null) {
    if (this._animationStartTime == null) return 1;
    const dur = duration ?? this._cfg.reveal.animationDuration ?? 400;
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
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
  updateConfig(cfg) { this._resolveCfg(cfg); }

  setLastOpenMaxToCurrent() {
    this._lastMapOpenMaxOrder = this._getCurrentMaxOrder();
  }

  addPendingWhileMapOpen(newly) {
    if (!newly || newly.length === 0) return;
    const existing = new Set(this._pendingNewSinceLastOpen.map(c => c.x + ',' + c.y));
    for (const cell of newly) {
      const key = cell.x + ',' + cell.y;
      if (!existing.has(key)) {
        this._pendingNewSinceLastOpen.push(cell);
        existing.add(key);
      }
    }
    this.setLastOpenMaxToCurrent();
  }
}
