const FALLBACK_COLORS = ['#9b5a3c', '#39444c', '#a89a75', '#536b4c', '#80613f', '#765b77', '#4f7072', '#777777'];

function architectureColor(id) {
  return FALLBACK_COLORS[Math.max(0, (id || 1) - 1) % FALLBACK_COLORS.length];
}
export class ArchitectureDebugOverlay {
  constructor(host, canvas) {
    this.host = host;
    this.gameCanvas = canvas;
    this.visible = false;
    this.dungeon = null;
    this.player = null;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'architecture-debug-canvas';
    this.canvas.width = 960;
    this.canvas.height = 720;
    this.canvas.setAttribute('aria-label', 'Architecture and room type ID grid');
    this.canvas.hidden = true;
    host.appendChild(this.canvas);
    this.legend = document.createElement('aside');
    this.legend.id = 'architecture-debug-legend';
    this.legend.className = 'architecture-debug-legend';
    this.legend.hidden = true;
    host.appendChild(this.legend);
  }

  setDungeon(dungeon) {
    this.dungeon = dungeon;
    if (this.visible) this.draw(this.player);
  }

  setVisible(value) {
    this.visible = !!value;
    this.canvas.hidden = !this.visible;
    this.legend.hidden = !this.visible;
    this.gameCanvas.classList.toggle('architecture-debug-hidden', this.visible);
    this.host.classList.toggle('showing-architecture-debug', this.visible);
    if (this.visible) this.draw(this.player);
    return this.visible;
  }

  toggle() { return this.setVisible(!this.visible); }

  draw(player = null) {
    this.player = player || this.player;
    const dungeon = this.dungeon;
    if (!this.visible || !dungeon) return;
    const ctx = this.canvas.getContext('2d');
    const width = this.canvas.width, height = this.canvas.height;
    ctx.fillStyle = '#090c0b'; ctx.fillRect(0, 0, width, height);
    const margin = 34;
    const cell = Math.max(5, Math.floor(Math.min((width - margin * 2) / dungeon.w, (height - margin * 2) / dungeon.h)));
    const mapW = cell * dungeon.w, mapH = cell * dungeon.h;
    const ox = Math.floor((width - mapW) / 2), oy = Math.floor((height - mapH) / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fontSize = Math.max(5, Math.min(9, Math.floor(cell * 0.42)));
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    for (let y = 0; y < dungeon.h; y++) for (let x = 0; x < dungeon.w; x++) {
      const index = y * dungeon.w + x;
      const architectureId = dungeon.architectureMap?.[index] || 1;
      const typeId = dungeon.typeMap?.[index] || 1;
      const isFloor = dungeon.grid[index] === 0;
      ctx.globalAlpha = isFloor ? 0.94 : 0.34;
      ctx.fillStyle = architectureColor(architectureId);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isFloor ? 'rgba(228,235,229,.22)' : 'rgba(0,0,0,.38)';
      ctx.strokeRect(ox + x * cell + .5, oy + y * cell + .5, cell - 1, cell - 1);
      if (isFloor && cell >= 12) {
        ctx.fillStyle = '#f0f2ed';
        ctx.fillText(`A${architectureId}`, ox + x * cell + cell / 2, oy + y * cell + cell * .34);
        ctx.fillStyle = '#c0c9c2';
        ctx.fillText(`T${typeId}`, ox + x * cell + cell / 2, oy + y * cell + cell * .70);
      }
    }
    if (this.player) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff3ba'; ctx.strokeStyle = '#171a18'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox + this.player.x * cell, oy + this.player.y * cell, Math.max(3, cell * .28), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    const plan = dungeon.meta?.architecturePlan;
    const architectures = plan?.architectures || [];
    const types = plan?.types || [];
    this.legend.innerHTML = `<strong>CONSTRUCTION IDS</strong><span>Architecture / room type · I to return</span>` +
      `<div class="architecture-legend-list">${architectures.map(item => `<i style="--legend:${architectureColor(item.numericId)}"></i><b>A${item.numericId}</b> ${item.name}`).join('')}</div>` +
      `<div class="architecture-legend-types">${types.map(item => `<span><b>T${item.numericId}</b> ${item.name}</span>`).join('')}</div>`;
  }
}
