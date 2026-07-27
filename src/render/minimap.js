// MinimapRenderer — top-down 2D dungeon visualization with toggleable modes
//
// Color palette: light parchment adventurer's map — ink on aged paper
// Parchment background with greystyle dungeon structure.
// Gold accent #c9a84c for key highlights only (treasure, labels).
// Role colors are grayscale values with distinct lightness so corridors and rooms
// are clearly separated against the parchment base.

const PALETTE = {
  // Canvas background — parchment throughout
  canvasBg: "#e8dcc4",        // warm light parchment base for entire canvas
  canvasScan: "#ddd0b8",      // subtle texture overlay

  // Parchment panel for legend/scale
  parchmentPanel: "rgba(220,205,175,0.94)", // slightly darker parchment for UI panels
  parchmentPanelBorder: "#8b7355", // aged leather brown border
  parchmentGrid: "rgba(100,85,60,0.06)", // subtle grid lines in ink brown

  // Site accent
  gold: "#c9a84c",
  goldDim: "#8a7233",
  goldBright: "#d4b866",

  // Role mode — grayscale ink palette on light parchment
  // Lighter = room floor, darker = corridors, darkest = walls
  roles: {
    entrance: "#8a8a8a",   // light gray — starting point stands out
    exit: "#5a5a5a",       // medium-dark gray — goal
    guardian: "#6a6a6a",   // medium gray — notable encounter
    treasure: "#c9a84c",   // site gold — hero accent, only colored element
    hub: "#7a7a7a",        // light-medium gray — junction
    hall: "#9a9a9a",       // light gray — ordinary room
    armory: "#7a7a7a",     // same as hub — side branch
    shrine: "#7a7a7a",     // same as hub — side branch
    secret: "#b8b8b8",     // very light gray — nearly blends with parchment
    corridor: "#6a6a6a",   // medium gray — corridors darker than rooms, lighter than walls
  },

  // Zone mode — warm-to-cool temperature shift, but adapted for light parchment
  zones: [
    { name: "Entry",       rgb: [160, 135,  95], hex: "#a0875f" },
    { name: "Antechamber", rgb: [130, 110,  80], hex: "#826e50" },
    { name: "Depths",      rgb: [ 90,  75,  55], hex: "#5a4b37" },
    { name: "Sanctum",     rgb: [ 60,  70,  45], hex: "#3c462d" },
    { name: "Exit",        rgb: [ 45,  35,  50], hex: "#2d2332" },
  ],

  // Material mode — ink grays for stone and wood
  materials: {
    wall1: "#4a4a4a",
    wall2: "#5a5a5a",
    floor1: "#a0a0a0",
    floor2: "#8a8a8a",
  },

  // Walls in role/zone mode — dark ink on parchment
  wallDark: "#2a2a2a",
  wallMedium: "#3a3a3a",

  // Text and UI — dark ink on parchment
  textLight: "#3a3020",
  textDim: "#6b5d48",
  textGold: "#c9a84c",
};

const ROLE_COLORS = PALETTE.roles;
// Legend display names — proper full names, no abbreviations
const ROLE_DISPLAY = {
  entrance: "Entrance", exit: "Exit", guardian: "Guardian",
  treasure: "Treasure", hub: "Hub", hall: "Hall",
  armory: "Armory", shrine: "Shrine", secret: "Secret",
};
const ZONE_TINTS = PALETTE.zones.map(z => z.rgb);

export class MinimapRenderer {
  constructor(canvas, dungeonMap=null, options={}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dungeon = dungeonMap;
    this.mode = "role"; // 'role' | 'zone' | 'material'
    this.zoom = 1;
    this.panX = 0; this.panY = 0;
    this.cellSize = 5;
    this.legendGap = 16;    // gap between grid and legend below
    this.fontFamily = options.fontFamily || "Georgia";
    this.fontFallback = options.fontFallback || "serif";
  }
  setDungeonMap(dm){ this.dungeon=dm; this.render(); }
  setMode(m){ this.mode=m; this.render(); }
  setZoom(z){ this.zoom=Math.max(0.5,Math.min(3,z)); this.render(); }
  setPanOffset(dx,dy){ this.panX=dx; this.panY=dy; this.render(); }
  setFont(family, fallback="serif"){ this.fontFamily=family||"Georgia"; this.fontFallback=fallback||"serif"; this.render(); }
  _font(weight="", size=12){ return `${weight} ${size}px "${this.fontFamily}", ${this.fontFallback}`; }

  render(){
    const ctx=this.ctx; const {width:w, height:h} = this.canvas;
    // Full parchment canvas background
    ctx.fillStyle=PALETTE.canvasBg; ctx.fillRect(0,0,w,h);
    ctx.fillStyle=PALETTE.canvasScan; for(let y=0;y<h;y+=4) ctx.fillRect(0,y,w,1);
    if(!this.dungeon){ return; }
    this._calcLayout();
    this._renderGrid(ctx);
    this._renderLegend(ctx);
  }

  _calcLayout(){
    const d=this.dungeon; const cw=this.canvas.width, ch=this.canvas.height;
    // Centered grid with legend below — no scale, no title
    const legendH = 60; // approximate legend height below grid
    const availW = cw - 40;
    const availH = ch - legendH - this.legendGap - 40;
    this.cellSize = Math.floor(Math.min(availW/d.w, availH/d.h) * this.zoom);
    this.gridW = d.w * this.cellSize;
    this.gridH = d.h * this.cellSize;
    // Center grid horizontally and vertically in available space
    this.ox = Math.floor((cw - this.gridW) / 2) + this.panX;
    this.oy = Math.floor((availH - this.gridH) / 2) + 20 + this.panY;
    // Legend centered below grid
    this.legendY = this.oy + this.gridH + this.legendGap;
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  _renderGrid(ctx){
    const d=this.dungeon, cs=this.cellSize, ox=this.ox, oy=this.oy;
    const roomByCell = new Map();
    d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

    const boundaryId = d.meta?.boundaryWallId ?? 1;

    // Helper to get color for a cell in current mode
    const getCellColor = (x, y, gv, r) => {
      if (gv === 0) { // floor
        if (this.mode === "role") {
          return r ? (ROLE_COLORS[r.role] || PALETTE.materials.floor1) : PALETTE.roles.corridor;
        } else if (this.mode === "zone") {
          const zi = r ? ["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(r.zone) : 2;
          const t = ZONE_TINTS[Math.max(0,Math.min(4,zi))]||ZONE_TINTS[2];
          return `rgb(${t[0]},${t[1]},${t[2]})`;
        } else { // material
          const fm = d.floorMat[y*d.w+x]||1;
          const shades=[PALETTE.materials.floor1, PALETTE.materials.floor2];
          return shades[(fm-1)%2];
        }
      } else { // wall
        if (this.mode === "material") {
          const shades=[PALETTE.materials.wall1, PALETTE.materials.wall2];
          return shades[(gv-1)%2];
        }
        return PALETTE.wallDark;
      }
    };

    // Draw rooms as solid rounded rectangles with filled wall border — no gaps at corners
    const wallT = Math.max(1, cs * 0.18); // wall thickness
    const roomCornerR = Math.max(2, Math.min(8, cs * 0.5));
    d.rooms.forEach(r => {
      const rx = ox + r.x * cs, ry = oy + r.y * cs;
      const rw = r.w * cs, rh = r.h * cs;
      let color;
      if (this.mode === "role") color = ROLE_COLORS[r.role] || PALETTE.materials.floor1;
      else if (this.mode === "zone") {
        const zi = ["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(r.zone);
        const t = ZONE_TINTS[Math.max(0,Math.min(4,zi))]||ZONE_TINTS[2];
        color = `rgb(${t[0]},${t[1]},${t[2]})`;
      } else {
        color = PALETTE.materials.floor1;
      }
      // Wall background — slightly larger rounded rect in dark ink
      ctx.fillStyle = PALETTE.wallDark;
      this._roundRect(ctx, rx - wallT/2, ry - wallT/2, rw + wallT, rh + wallT, roomCornerR + wallT/2);
      ctx.fill();
      // Room fill — inset rounded rect
      ctx.fillStyle = color;
      this._roundRect(ctx, rx, ry, rw, rh, roomCornerR);
      ctx.fill();
    });

    // Draw corridors and walls per-cell — walls only if adjacent to floor
    // Map border walls ARE drawn (so rooms at edge have visible walls)
    const isFloor = (x, y) => {
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
      return d.grid[y*d.w + x] === 0;
    };
    const hasFloorNeighbor = (x, y) => {
      return isFloor(x-1,y) || isFloor(x+1,y) || isFloor(x,y-1) || isFloor(x,y+1);
    };

    for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){

      const i=y*d.w+x; const gv=d.grid[i];
      const r = roomByCell.get(i);
      if (r) continue; // room already drawn

      if (gv === 0) {
        // Corridor floor — draw as solid rect (no gaps between cells for continuous look)
        const color = getCellColor(x, y, 0, null);
        ctx.fillStyle = color;
        ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
      } else {
        // Wall cell — only draw if adjacent to a floor (room or corridor)
        // Otherwise it's empty space, leave as parchment
        if (!hasFloorNeighbor(x, y)) continue;
        const color = getCellColor(x, y, gv, null);
        ctx.fillStyle = color;
        ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
      }
    }

    // Stair indicators — single clear marker at stair wall position, no room center clutter
    // Entrance: upward triangle in gold, Exit: downward triangle in gold — highly visible on parchment
    const drawStairArrow = (r, isExit) => {
      if (!r.stairWall) return;
      const sw = r.stairWall;
      const mx = (sw.x1 + sw.x2) / 2, my = (sw.y1 + sw.y2) / 2;
      const cx = ox + mx * cs, cy = oy + my * cs;
      const size = Math.max(6, cs * 1.2);
      // Gold background circle for visibility
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.fill();
      // Dark ink border around circle
      ctx.strokeStyle = PALETTE.wallDark; ctx.lineWidth = Math.max(1, cs*0.12);
      ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.stroke();
      // Arrow glyph in dark ink
      ctx.fillStyle = PALETTE.wallDark;
      ctx.font = this._font("bold", Math.max(10, size));
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(isExit ? "▼" : "▲", cx, cy + 1);
    }
    d.rooms.filter(r=>r.role==="entrance").forEach(r=>drawStairArrow(r,false));
    d.rooms.filter(r=>r.role==="exit").forEach(r=>drawStairArrow(r,true));
  }

  _renderLegend(ctx){
    // Legend centered below grid — horizontal layout, proper full role names
    const items = this.mode==="role"
      ? Object.entries(ROLE_COLORS).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k,c])
      : this.mode==="zone"
      ? PALETTE.zones.map(z => [z.name, z.hex])
      : [["Wall 1",PALETTE.materials.wall1],["Wall 2",PALETTE.materials.wall2],["Floor 1",PALETTE.materials.floor1],["Floor 2",PALETTE.materials.floor2]];

    const swatch = 12, gap = 8, textPad = 6;
    const itemW = 14 + textPad + 70; // swatch + text approx
    const totalW = items.length * itemW - gap;
    const startX = Math.max(20, Math.floor((this.canvas.width - totalW) / 2));
    const y = this.legendY;

    ctx.font=this._font("", 12); ctx.textBaseline="middle";
    let x = startX;
    for(const [label,col] of items){
      // swatch
      ctx.fillStyle = col;
      this._roundRect(ctx, x, y-6, swatch, swatch, 2); ctx.fill();
      ctx.strokeStyle = PALETTE.parchmentPanelBorder; ctx.lineWidth = 0.5;
      this._roundRect(ctx, x, y-6, swatch, swatch, 2); ctx.stroke();
      // label
      ctx.fillStyle = PALETTE.textLight; ctx.textAlign = "left";
      ctx.fillText(label, x + swatch + textPad, y);
      x += itemW;
    }
  }

  _darken(hex, f){ const m=hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if(!m)return hex;
    const r=Math.floor(parseInt(m[1],16)*f),g=Math.floor(parseInt(m[2],16)*f),b=Math.floor(parseInt(m[3],16)*f);
    return `rgb(${r},${g},${b})`; }
}
