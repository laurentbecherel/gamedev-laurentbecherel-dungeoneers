// map-ui.js — generates map texture RGBA data for WebGL UI overlay.
// Fully configurable via src/assets/config/map.json (editor-tracked).
// Falls back to hardcoded defaults for backward compatibility.

const DEFAULT_PALETTE = {
  canvasBg: "#e8dcc4",
  canvasScan: "#ddd0b8",
  gold: "#c9a84c",
  goldDim: "#8a7233",
  parchmentPanel: [220, 205, 175],
  parchmentBorder: [139, 115, 85],
  textLight: [58, 48, 32],
  textDim: [107, 93, 72],
  roles: {
    entrance: "#8a8a8a", exit: "#5a5a5a", guardian: "#6a6a6a", treasure: "#c9a84c",
    hub: "#7a7a7a", hall: "#9a9a9a", armory: "#7a7a7a", shrine: "#7a7a7a",
    secret: "#b8b8b8", corridor: "#6a6a6a",
  },
  wallDark: "#2a2a2a",
  materials: { wall1: "#4a4a4a", wall2: "#5a5a5a", floor1: "#a0a0a0", floor2: "#8a8a8a" },
};

const ROLE_DISPLAY = { entrance:"Entrance", exit:"Exit", guardian:"Guardian", treasure:"Treasure", hub:"Hub", hall:"Hall", armory:"Armory", shrine:"Shrine", secret:"Secret" };

function hexToRgb(hex) {
  const m = typeof hex === 'string' ? hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i) : null;
  if (!m) {
    if (Array.isArray(hex) && hex.length >= 3) return [hex[0]|0, hex[1]|0, hex[2]|0];
    return [128, 128, 128];
  }
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function setPixel(buf, w, x, y, r, g, b, a = 255) { const i = (y * w + x) * 4; buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a; }
function fillRect(buf, w, h, x0, y0, rw, rh, r, g, b, a = 255) {
  const x1 = Math.min(w, x0+rw), y1 = Math.min(h, y0+rh);
  for (let y=Math.max(0,y0); y<y1; y++) for (let x=Math.max(0,x0); x<x1; x++) setPixel(buf,w,x,y,r,g,b,a);
}
function fillCircle(buf,w,h,cx,cy,rad,r,g,b,a=255){ const r2=rad*rad; for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=r2){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } }
function strokeCircle(buf,w,h,cx,cy,rad,r,g,b,a=255,lw=1){ for(let dy=-rad-lw;dy<=rad+lw;dy++)for(let dx=-rad-lw;dx<=rad+lw;dx++){ const d2=dx*dx+dy*dy; const d=Math.sqrt(d2); if(Math.abs(d-rad)<=lw){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } } }

function resolvePaletteConfig(uiCfg){
  // uiCfg can be either legacy {parchmentBg,parchmentScan,position,size,opacity} or new map.json
  // new: {display, parchment, colors, layout}
  const out = { ...DEFAULT_PALETTE };
  const colors = uiCfg?.colors || {};
  // colors can override any top-level
  if(colors.wallDark) out.wallDark = colors.wallDark;
  if(colors.gold) out.gold = colors.gold;
  if(colors.goldDim) out.goldDim = colors.goldDim;
  if(colors.parchmentPanel) out.parchmentPanel = colors.parchmentPanel;
  if(colors.parchmentBorder) out.parchmentBorder = colors.parchmentBorder;
  if(colors.textLight) out.textLight = colors.textLight;
  if(colors.textDim) out.textDim = colors.textDim;
  if(colors.roles) out.roles = { ...out.roles, ...colors.roles };
  if(colors.materials) out.materials = { ...out.materials, ...colors.materials };

  // backward compat: uiCfg.parchmentBg etc
  const parchmentBg = uiCfg?.parchment?.bg ?? uiCfg?.parchmentBg;
  const parchmentScan = uiCfg?.parchment?.scan ?? uiCfg?.parchmentScan;
  if(parchmentBg) out.canvasBg = parchmentBg;
  if(parchmentScan) out.canvasScan = parchmentScan;
  // also direct map.parchment override
  if(uiCfg?.parchment?.bg) out.canvasBg = uiCfg.parchment.bg;
  if(uiCfg?.parchment?.scan) out.canvasScan = uiCfg.parchment.scan;

  return out;
}

function resolveLayout(uiCfg){
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
      goldDark: layout.stair?.goldDark
    },
    player: {
      minRad: layout.playerDot?.minRad ?? 3,
      sizeFactor: layout.playerDot?.sizeFactor ?? 0.5,
      color: uiCfg?.colors?.player || [15,220,15]
    },
    legend: {
      swatch: layout.legend?.swatch ?? 14,
      gap: layout.legend?.gap ?? 10,
      itemWidth: layout.legend?.itemWidth ?? 90,
      panelAlpha: layout.legend?.panelAlpha ?? 220,
      borderAlpha: layout.legend?.borderAlpha ?? 220
    },
    parchment: {
      scanlineEvery: uiCfg?.parchment?.scanlineEvery ?? 4,
      alpha: Math.floor(((uiCfg?.display?.opacity ?? uiCfg?.parchment?.alpha ?? uiCfg?.opacity ?? 0.88) * 255))
    }
  };
}

export function generateMapTextureData(dungeon, mode="role", player=null, uiCfg={}) {
  const PALETTE = resolvePaletteConfig(uiCfg);
  const L = resolveLayout(uiCfg);
  const w = 640, h = 360;
  const buf = new Uint8Array(w*h*4);
  const alpha = L.parchment.alpha;

  const bg = hexToRgb(PALETTE.canvasBg);
  const scan = hexToRgb(PALETTE.canvasScan);
  const scanEvery = L.parchment.scanlineEvery;
  for (let y=0;y<h;y++){
    const useScan=(scanEvery>0 && y % scanEvery === 0);
    const col=useScan?scan:bg;
    for(let x=0;x<w;x++) setPixel(buf,w,x,y,col[0],col[1],col[2],alpha);
  }

  if (!dungeon) return buf;
  const d = dungeon;
  const legendH = L.legendHeight, legendGap = L.legendGap, pad = L.padding;
  const availW = w - pad*2, availH = h - legendH - legendGap - pad*2;
  const cs = Math.max(L.minCell, Math.floor(Math.min(availW/d.w, availH/d.h)));
  const gridW = d.w*cs, gridH = d.h*cs;
  const ox = Math.floor((w - gridW)/2), oy = Math.floor((availH - gridH)/2) + pad;
  const legendY = oy + gridH + legendGap;

  const roomByCell = new Map();
  d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

  const getCellColor = (x,y,gv,r)=>{
    if(gv===0) return hexToRgb(r?(PALETTE.roles[r.role]||PALETTE.materials.floor1):PALETTE.roles.corridor);
    return hexToRgb(PALETTE.wallDark);
  };
  const isFloor = (x,y)=> x>=0&&y>=0&&x<d.w&&y<d.h&&d.grid[y*d.w+x]===0;
  const hasFloorNeighbor = (x,y)=> isFloor(x-1,y)||isFloor(x+1,y)||isFloor(x,y-1)||isFloor(x,y+1);

  // rooms with wall border
  d.rooms.forEach(r=>{
    const col = hexToRgb(PALETTE.roles[r.role]||PALETTE.materials.floor1);
    const rx=ox+r.x*cs, ry=oy+r.y*cs, rw=r.w*cs, rh=r.h*cs;
    const wallCol = hexToRgb(PALETTE.wallDark); const t=Math.max(1,Math.floor(cs*0.18));
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

  // stair indicators (gold circles)
  const gold = hexToRgb(PALETTE.gold), wallDark = hexToRgb(PALETTE.wallDark);
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
    const pCol = Array.isArray(L.player.color) ? L.player.color : (typeof L.player.color === 'string' ? hexToRgb(L.player.color) : [15,220,15]);
    fillCircle(buf,w,h,px,py,pr,pCol[0],pCol[1],pCol[2],255);
  }

  // legend bar
  const items = Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, hexToRgb(c)]);
  const swatch=L.legend.swatch, gap=L.legend.gap, itemW=L.legend.itemWidth;
  const totalW = items.length*itemW - gap;
  let lx = Math.max(pad, Math.floor((w - totalW)/2));
  const ly = legendY;
  const panelCol = Array.isArray(PALETTE.parchmentPanel) ? PALETTE.parchmentPanel : hexToRgb(PALETTE.parchmentPanel);
  const borderCol = Array.isArray(PALETTE.parchmentBorder) ? PALETTE.parchmentBorder : hexToRgb(PALETTE.parchmentBorder);
  fillRect(buf,w,h,lx-8,ly-16,totalW+16,32, panelCol[0],panelCol[1],panelCol[2], L.legend.panelAlpha);
  fillRect(buf,w,h,lx-8,ly-16,totalW+16,2, borderCol[0],borderCol[1],borderCol[2], L.legend.borderAlpha);
  fillRect(buf,w,h,lx-8,ly+16,totalW+16,2, borderCol[0],borderCol[1],borderCol[2], L.legend.borderAlpha);
  items.forEach(([label,col])=>{
    fillRect(buf,w,h,lx,ly-7,swatch,swatch,col[0],col[1],col[2],255);
    fillRect(buf,w,h,lx,ly-7,swatch,swatch, borderCol[0],borderCol[1],borderCol[2],80);
    lx+=itemW;
  });

  return buf;
}
