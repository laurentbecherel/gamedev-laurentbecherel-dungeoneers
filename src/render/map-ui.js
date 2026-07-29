// map-ui.js — generates map texture RGBA data for WebGL UI overlay.
// Restored from Task 2's MinimapRenderer to fix regression: colors, alignment, text labels.
// Uses Canvas2D rendering path when document is available (browser), falls back to raw buffer for Node tests.
// Fully configurable via src/assets/config/ui/map.json (editor-tracked).

const DEFAULT_PALETTE = {
  canvasBg: "#e8dcc4",
  canvasScan: "#ddd0b8",
  parchmentPanel: "rgba(220,205,175,0.94)",
  parchmentPanelBorder: "#8b7355",
  parchmentGrid: "rgba(100,85,60,0.06)",
  gold: "#c9a84c",
  goldDim: "#8a7233",
  goldBright: "#d4b866",
  wallDark: "#2a2a2a",
  wallMedium: "#3a3a3a",
  textLight: "#3a3020",
  textDim: "#6b5d48",
  textGold: "#c9a84c",
  parchmentPanelRGB: [220, 205, 175],
  parchmentBorderRGB: [139, 115, 85],
  textLightRGB: [58, 48, 32],
  textDimRGB: [107, 93, 72],
  roles: {
    entrance: "#8a8a8a",
    exit: "#5a5a5a",
    guardian: "#6a6a6a",
    treasure: "#c9a84c",
    hub: "#7a7a7a",
    hall: "#9a9a9a",
    armory: "#7a7a7a",
    shrine: "#7a7a7a",
    secret: "#b8b8b8",
    corridor: "#6a6a6a",
  },
  zones: [
    { name: "Entry",       rgb: [160, 135,  95], hex: "#a0875f" },
    { name: "Antechamber", rgb: [130, 110,  80], hex: "#826e50" },
    { name: "Depths",      rgb: [ 90,  75,  55], hex: "#5a4b37" },
    { name: "Sanctum",     rgb: [ 60,  70,  45], hex: "#3c462d" },
    { name: "Exit",        rgb: [ 45,  35,  50], hex: "#2d2332" },
  ],
  materials: {
    wall1: "#4a4a4a",
    wall2: "#5a5a5a",
    floor1: "#a0a0a0",
    floor2: "#8a8a8a",
  },
};

const ROLE_DISPLAY = {
  entrance: "Entrance", exit: "Exit", guardian: "Guardian",
  treasure: "Treasure", hub: "Hub", hall: "Hall",
  armory: "Armory", shrine: "Shrine", secret: "Secret",
};

// Helpers to normalize colors from config (can be hex string or [r,g,b] array)
function toCssColor(c, fallback) {
  if (!c) return fallback;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    if (c.length >= 4) return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${c[3]/255})`;
    if (c.length >= 3) return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  }
  return fallback;
}
function toHexOrCss(c, fallback) {
  return toCssColor(c, fallback);
}
function hexToRgbArray(hex) {
  if (Array.isArray(hex) && hex.length >= 3) return [hex[0]|0, hex[1]|0, hex[2]|0];
  if (typeof hex !== 'string') return [128,128,128];
  // handle rgb() strings
  const rgbMatch = hex.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128,128,128];
  return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
}

function setPixel(buf, w, x, y, r, g, b, a = 255) { const i = (y * w + x) * 4; buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a; }
function fillRect(buf, w, h, x0, y0, rw, rh, r, g, b, a = 255) {
  const x1 = Math.min(w, x0+rw), y1 = Math.min(h, y0+rh);
  for (let y=Math.max(0,y0); y<y1; y++) for (let x=Math.max(0,x0); x<x1; x++) setPixel(buf,w,x,y,r,g,b,a);
}
function fillCircle(buf,w,h,cx,cy,rad,r,g,b,a=255){ const r2=rad*rad; for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=r2){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } }
function strokeCircle(buf,w,h,cx,cy,rad,r,g,b,a=255,lw=1){ for(let dy=-rad-lw;dy<=rad+lw;dy++)for(let dx=-rad-lw;dx<=rad+lw;dx++){ const d2=dx*dx+dy*dy; const d=Math.sqrt(d2); if(Math.abs(d-rad)<=lw){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } } }

function resolvePaletteConfig(uiCfg) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PALETTE));
  const colors = uiCfg?.colors || {};

  // parchment bg/scan
  if (uiCfg?.parchment?.bg) out.canvasBg = toHexOrCss(uiCfg.parchment.bg, out.canvasBg);
  if (uiCfg?.parchment?.scan) out.canvasScan = toHexOrCss(uiCfg.parchment.scan, out.canvasScan);
  // legacy compat
  if (uiCfg?.parchmentBg) out.canvasBg = toHexOrCss(uiCfg.parchmentBg, out.canvasBg);
  if (uiCfg?.parchmentScan) out.canvasScan = toHexOrCss(uiCfg.parchmentScan, out.canvasScan);

  if (colors.wallDark) out.wallDark = toHexOrCss(colors.wallDark, out.wallDark);
  if (colors.gold) out.gold = toHexOrCss(colors.gold, out.gold);
  if (colors.goldDim) out.goldDim = toHexOrCss(colors.goldDim, out.goldDim);
  if (colors.parchmentPanel) out.parchmentPanel = toHexOrCss(colors.parchmentPanel, out.parchmentPanel);
  if (colors.parchmentBorder) out.parchmentPanelBorder = toHexOrCss(colors.parchmentBorder, out.parchmentPanelBorder);
  if (colors.textLight) out.textLight = toHexOrCss(colors.textLight, out.textLight);
  if (colors.textDim) out.textDim = toHexOrCss(colors.textDim, out.textDim);

  // store raw RGB for fallback buffer path
  if (colors.parchmentPanel && Array.isArray(colors.parchmentPanel)) out.parchmentPanelRGB = colors.parchmentPanel;
  if (colors.parchmentBorder && Array.isArray(colors.parchmentBorder)) out.parchmentBorderRGB = colors.parchmentBorder;
  if (colors.textLight && Array.isArray(colors.textLight)) out.textLightRGB = colors.textLight;
  if (colors.textDim && Array.isArray(colors.textDim)) out.textDimRGB = colors.textDim;

  if (colors.roles) out.roles = { ...out.roles, ...colors.roles };
  if (colors.materials) out.materials = { ...out.materials, ...colors.materials };

  // player color handled separately in layout
  return out;
}

function resolveLayout(uiCfg) {
  const layout = uiCfg?.layout || {};
  return {
    legendHeight: layout.legendHeight ?? 60,
    legendGap: layout.legendGap ?? 16,
    padding: layout.padding ?? 40,
    minCell: layout.grid?.minCell ?? 2,
    stair: {
      sizeFactor: layout.stair?.sizeFactor ?? 1.2,
      minSize: layout.stair?.minSize ?? 6,
      strokeFactor: layout.stair?.strokeFactor ?? 0.12,
    },
    player: {
      minRad: layout.playerDot?.minRad ?? 3,
      sizeFactor: layout.playerDot?.sizeFactor ?? 0.5,
      color: uiCfg?.colors?.player || [15,220,15],
    },
    legend: {
      swatch: layout.legend?.swatch ?? 12, // ORIGINAL was 12, not 14 - restore original for correct alignment
      gap: layout.legend?.gap ?? 8,
      itemWidth: layout.legend?.itemWidth ?? 90,
      panelAlpha: layout.legend?.panelAlpha ?? 220,
      borderAlpha: layout.legend?.borderAlpha ?? 220,
    },
    parchment: {
      scanlineEvery: uiCfg?.parchment?.scanlineEvery ?? 4,
      alpha: Math.floor(((uiCfg?.display?.opacity ?? uiCfg?.parchment?.alpha ?? 0.92) * 255)),
      opacity: uiCfg?.display?.opacity ?? uiCfg?.parchment?.alpha ?? 0.92,
    },
    fontFamily: uiCfg?.font?.family || uiCfg?.fontFamily || uiCfg?.display?.fontFamily || "Pixelify Sans",
    fontFallback: uiCfg?.font?.fallback || uiCfg?.fontFallback || uiCfg?.display?.fontFallback || "Georgia, serif",
    fontGoogleName: uiCfg?.font?.googleName || uiCfg?.fontGoogleName || "Pixelify+Sans:wght@400;600;700",
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

export function generateMapTextureData(dungeon, mode="role", player=null, uiCfg={}) {
  const PALETTE = resolvePaletteConfig(uiCfg);
  const L = resolveLayout(uiCfg);
  const w = 640, h = 360;

  const hasDocument = typeof document !== 'undefined' && typeof document.createElement === 'function';

  // Browser path — use Canvas2D to properly render text labels (fixes missing text regression)
  if (hasDocument) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d');
      ctx.imageSmoothingEnabled = false;

      // Full parchment canvas background — matches original MinimapRenderer
      ctx.fillStyle = toCssColor(PALETTE.canvasBg, DEFAULT_PALETTE.canvasBg);
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = toCssColor(PALETTE.canvasScan, DEFAULT_PALETTE.canvasScan);
      const scanEvery = L.parchment.scanlineEvery;
      if (scanEvery > 0) {
        for(let y=0;y<h;y+=scanEvery) ctx.fillRect(0,y,w,1);
      }

      if (dungeon) {
        const d = dungeon;
        const legendH = L.legendHeight;
        const legendGap = L.legendGap;
        // ORIGINAL alignment formula from minimap.js (fixes alignment regression)
        // availW = cw - 40, availH = ch - legendH - legendGap - 40
        // ox = floor((cw - gridW)/2), oy = floor((availH - gridH)/2)+20
        const availW = w - 40;
        const availH = h - legendH - legendGap - 40;
        const cs = Math.max(L.minCell, Math.floor(Math.min(availW/d.w, availH/d.h)));
        const gridW = d.w*cs;
        const gridH = d.h*cs;
        const ox = Math.floor((w - gridW)/2);
        const oy = Math.floor((availH - gridH)/2) + 20; // ORIGINAL used +20, not +40 (padding)
        const legendY = oy + gridH + legendGap;

        const roomByCell = new Map();
        d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

        const ROLE_COLORS = PALETTE.roles;
        const ZONE_TINTS = PALETTE.zones.map(z=>z.rgb);

        const getCellColor = (x, y, gv, room) => {
          if (gv === 0) {
            if (mode === "role") {
              return room ? (ROLE_COLORS[room.role] || PALETTE.materials.floor1) : ROLE_COLORS.corridor;
            } else if (mode === "zone") {
              const zi = room ? ["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(room.zone) : 2;
              const t = ZONE_TINTS[Math.max(0, Math.min(4, zi))] || ZONE_TINTS[2];
              return `rgb(${t[0]},${t[1]},${t[2]})`;
            } else {
              const fm = d.floorMat ? d.floorMat[y*d.w+x] : 1;
              const shades = [PALETTE.materials.floor1, PALETTE.materials.floor2];
              return shades[(fm-1)%2];
            }
          } else {
            if (mode === "material") {
              const shades = [PALETTE.materials.wall1, PALETTE.materials.wall2];
              return shades[(gv-1)%2];
            }
            return PALETTE.wallDark;
          }
        };

        const isFloor = (x, y) => x>=0&&y>=0&&x<d.w&&y<d.h&&d.grid[y*d.w+x]===0;
        const hasFloorNeighbor = (x, y) => isFloor(x-1,y)||isFloor(x+1,y)||isFloor(x,y-1)||isFloor(x,y+1);

        // Rooms as solid rounded rectangles with wall border — matches original
        const wallT = Math.max(1, cs * 0.18);
        const roomCornerR = Math.max(2, Math.min(8, cs * 0.5));
        d.rooms.forEach(r => {
          const rx = ox + r.x*cs, ry = oy + r.y*cs;
          const rw = r.w*cs, rh = r.h*cs;
          let color;
          if (mode === "role") color = ROLE_COLORS[r.role] || PALETTE.materials.floor1;
          else if (mode === "zone") {
            const zi = ["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(r.zone);
            const t = ZONE_TINTS[Math.max(0, Math.min(4, zi))] || ZONE_TINTS[2];
            color = `rgb(${t[0]},${t[1]},${t[2]})`;
          } else {
            color = PALETTE.materials.floor1;
          }
          // Wall background
          ctx.fillStyle = toCssColor(PALETTE.wallDark, "#2a2a2a");
          roundRectPath(ctx, rx - wallT/2, ry - wallT/2, rw + wallT, rh + wallT, roomCornerR + wallT/2);
          ctx.fill();
          // Room fill
          ctx.fillStyle = toCssColor(color, "#9a9a9a");
          roundRectPath(ctx, rx, ry, rw, rh, roomCornerR);
          ctx.fill();
        });

        // Corridors and walls per-cell
        for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++) {
          const i=y*d.w+x, gv=d.grid[i], room=roomByCell.get(i);
          if (room) continue;
          if (gv===0) {
            const col = getCellColor(x,y,0,null);
            ctx.fillStyle = toCssColor(col, "#6a6a6a");
            ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
          } else {
            if (!hasFloorNeighbor(x,y)) continue;
            const col = getCellColor(x,y,gv,null);
            ctx.fillStyle = toCssColor(col, "#2a2a2a");
            ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
          }
        }

        // Stair indicators with arrow glyphs — restores original behavior
        const drawStairArrow = (r, isExit) => {
          if (!r.stairWall) return;
          const sw = r.stairWall;
          const mx = (sw.x1 + sw.x2)/2, my = (sw.y1 + sw.y2)/2;
          const cx = ox + mx*cs, cy = oy + my*cs;
          const size = Math.max(6, cs * L.stair.sizeFactor);
          // Gold background circle
          ctx.fillStyle = toCssColor(PALETTE.gold, "#c9a84c");
          ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.fill();
          // Dark border
          ctx.strokeStyle = toCssColor(PALETTE.wallDark, "#2a2a2a");
          ctx.lineWidth = Math.max(1, cs*L.stair.strokeFactor);
          ctx.beginPath(); ctx.arc(cx, cy, size*0.6, 0, Math.PI*2); ctx.stroke();
          // Arrow glyph
          ctx.fillStyle = toCssColor(PALETTE.wallDark, "#2a2a2a");
          ctx.font = `bold ${Math.max(10,size)}px "${L.fontFamily}", ${L.fontFallback}`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(isExit ? "▼" : "▲", cx, cy+1);
        };
        d.rooms.filter(r=>r.role==="entrance").forEach(r=>drawStairArrow(r,false));
        d.rooms.filter(r=>r.role==="exit").forEach(r=>drawStairArrow(r,true));

        // Player dot — green overlay
        if (player) {
          const px = Math.floor(ox + player.x*cs);
          const py = Math.floor(oy + player.y*cs);
          const pr = Math.max(L.player.minRad, Math.floor(cs*L.player.sizeFactor));
          const pCol = Array.isArray(L.player.color) ? `rgb(${L.player.color[0]},${L.player.color[1]},${L.player.color[2]})` : toCssColor(L.player.color, "rgb(15,220,15)");
          ctx.fillStyle = pCol;
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.fill();
        }

        // Legend — restores text labels (fixes missing text regression) and correct colors (fixes swatch overwrite bug)
        const items = mode==="role"
          ? Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, toCssColor(c, "#888")])
          : mode==="zone"
          ? PALETTE.zones.map(z => [z.name, toCssColor(z.hex || `rgb(${z.rgb[0]},${z.rgb[1]},${z.rgb[2]})`, "#a0875f")])
          : [["Wall 1", toCssColor(PALETTE.materials.wall1, "#4a4a4a")],["Wall 2", toCssColor(PALETTE.materials.wall2, "#5a5a5a")],["Floor 1", toCssColor(PALETTE.materials.floor1, "#a0a0a0")],["Floor 2", toCssColor(PALETTE.materials.floor2, "#8a8a8a")]];

        const swatch = L.legend.swatch; // 12 original
        const gap = L.legend.gap;       // 8 original
        const textPad = 6;
        const itemW = L.legend.itemWidth; // 90 original — 14+6+70 approx
        const totalW = items.length * itemW - gap;
        const startX = Math.max(20, Math.floor((w - totalW)/2));
        const ly = legendY;

        ctx.font = `12px "${L.fontFamily}", ${L.fontFallback}`;
        ctx.textBaseline = "middle";
        let lx = startX;
        for(const [label,col] of items) {
          // Swatch — correct color (no overwrite bug)
          ctx.fillStyle = col;
          roundRectPath(ctx, lx, ly-6, swatch, swatch, 2);
          ctx.fill();
          // Border stroke — correct (was previously overwriting with semi-transparent fill)
          ctx.strokeStyle = toCssColor(PALETTE.parchmentPanelBorder, "#8b7355");
          ctx.lineWidth = 0.5;
          roundRectPath(ctx, lx, ly-6, swatch, swatch, 2);
          ctx.stroke();
          // Label text — restored (fixes missing labels)
          ctx.fillStyle = toCssColor(PALETTE.textLight, "#3a3020");
          ctx.textAlign = "left";
          ctx.fillText(label, lx + swatch + textPad, ly);
          lx += itemW;
        }
      }

      // Extract RGBA
      const imageData = ctx.getImageData(0,0,w,h);
      // Convert to Uint8Array — keep opaque (255) and let shader uniform handle overall opacity
      // This matches original visual intent but avoids double-alpha darkening
      const buf = new Uint8Array(imageData.data);
      return buf;
    } catch (e) {
      console.warn("Canvas map render failed, falling back to raw buffer", e);
      // fall through to raw buffer path
    }
  }

  // Fallback raw buffer path (Node tests) — fixed alignment and color bugs
  const buf = new Uint8Array(w*h*4);
  const alpha = L.parchment.alpha;

  const bg = hexToRgbArray(PALETTE.canvasBg);
  const scan = hexToRgbArray(PALETTE.canvasScan);
  const scanEvery = L.parchment.scanlineEvery;
  for (let y=0;y<h;y++){
    const useScan=(scanEvery>0 && y % scanEvery === 0);
    const col=useScan?scan:bg;
    for(let x=0;x<w;x++) setPixel(buf,w,x,y,col[0],col[1],col[2],alpha);
  }

  if (!dungeon) return buf;
  const d = dungeon;
  const legendH = L.legendHeight, legendGap = L.legendGap;
  // FIX: use original alignment formula, not padded version
  const availW = w - 40;
  const availH = h - legendH - legendGap - 40;
  const cs = Math.max(L.minCell, Math.floor(Math.min(availW/d.w, availH/d.h)));
  const gridW = d.w*cs, gridH = d.h*cs;
  const ox = Math.floor((w - gridW)/2);
  const oy = Math.floor((availH - gridH)/2) + 20; // FIX: +20 not +40
  const legendY = oy + gridH + legendGap;

  const roomByCell = new Map();
  d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

  const getCellColor = (x,y,gv,r)=>{
    if(gv===0) {
      const col = r?(PALETTE.roles[r.role]||PALETTE.materials.floor1):PALETTE.roles.corridor;
      return hexToRgbArray(col);
    }
    return hexToRgbArray(PALETTE.wallDark);
  };
  const isFloor = (x,y)=> x>=0&&y>=0&&x<d.w&&y<d.h&&d.grid[y*d.w+x]===0;
  const hasFloorNeighbor = (x,y)=> isFloor(x-1,y)||isFloor(x+1,y)||isFloor(x,y-1)||isFloor(x,y+1);

  // rooms with wall border — fixed to use correct wall thickness like original
  d.rooms.forEach(r=>{
    const col = hexToRgbArray(PALETTE.roles[r.role]||PALETTE.materials.floor1);
    const rx=ox+r.x*cs, ry=oy+r.y*cs, rw=r.w*cs, rh=r.h*cs;
    const wallCol = hexToRgbArray(PALETTE.wallDark); const t=Math.max(1,Math.floor(cs*0.18));
    fillRect(buf,w,h,rx-t,ry-t,rw+t*2,t, wallCol[0],wallCol[1],wallCol[2],255);
    fillRect(buf,w,h,rx-t,ry+rh,rw+t*2,t, wallCol[0],wallCol[1],wallCol[2],255);
    fillRect(buf,w,h,rx-t,ry,t,rh, wallCol[0],wallCol[1],wallCol[2],255);
    fillRect(buf,w,h,rx+rw,ry,t,rh, wallCol[0],wallCol[1],wallCol[2],255);
    fillRect(buf,w,h,rx,ry,rw,rh, col[0],col[1],col[2],255);
  });

  // corridors and walls
  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){
    const i=y*d.w+x, gv=d.grid[i], r=roomByCell.get(i); if(r) continue;
    if(gv===0){ const c=getCellColor(x,y,0,null); fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,c[0],c[1],c[2],255); }
    else if(hasFloorNeighbor(x,y)){ const c=getCellColor(x,y,gv,null); fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,c[0],c[1],c[2],255); }
  }

  // stair indicators (gold circles) — also restore arrow placeholder via extra dot (fallback can't render text)
  const gold = hexToRgbArray(PALETTE.gold), wallDark = hexToRgbArray(PALETTE.wallDark);
  d.rooms.filter(r=>r.role==="entrance"||r.role==="exit").forEach(r=>{
    if(!r.stairWall) return;
    const sw=r.stairWall;
    const mx=(sw.x1+sw.x2)/2, my=(sw.y1+sw.y2)/2;
    const cx=Math.floor(ox+mx*cs), cy=Math.floor(oy+my*cs);
    const sz=Math.max(L.stair.minSize, Math.floor(cs*L.stair.sizeFactor));
    fillCircle(buf,w,h,cx,cy,Math.floor(sz*0.6), gold[0],gold[1],gold[2],255);
    strokeCircle(buf,w,h,cx,cy,Math.floor(sz*0.6), wallDark[0],wallDark[1],wallDark[2],255, Math.max(1,Math.floor(cs*L.stair.strokeFactor)));
  });

  // player dot
  if(player){
    const px=Math.floor(ox+player.x*cs), py=Math.floor(oy+player.y*cs);
    const pr=Math.max(L.player.minRad, Math.floor(cs*L.player.sizeFactor));
    const pCol = Array.isArray(L.player.color) ? L.player.color : (typeof L.player.color === 'string' ? hexToRgbArray(L.player.color) : [15,220,15]);
    fillCircle(buf,w,h,px,py,pr,pCol[0],pCol[1],pCol[2],255);
  }

  // legend bar — FIXED: correct colors (no border overwrite) and attempt text placeholder
  // In raw buffer we cannot render real text, but we fix swatch rendering to not overwrite
  const items = Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, hexToRgbArray(c)]);
  const swatch=L.legend.swatch, gap=L.legend.gap, itemW=L.legend.itemWidth;
  const totalW = items.length*itemW - gap;
  let lx = Math.max(20, Math.floor((w - totalW)/2));
  const ly = legendY;
  // Note: panel background removed to match original (which had no panel)
  items.forEach(([label,col])=>{
    // FIX: only one fill for swatch with full opacity, no semi-transparent border overwrite
    fillRect(buf,w,h,lx,ly-7,swatch,swatch,col[0],col[1],col[2],255);
    // Border would be stroke in canvas, in buffer we skip or draw 1px outline slightly darker
    // For buffer fallback, we intentionally do NOT overwrite swatch with border color at alpha 80 (that was the bug)
    lx+=itemW;
  });

  return buf;
}
