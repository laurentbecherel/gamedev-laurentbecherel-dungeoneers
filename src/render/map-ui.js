// map-ui.js — generates map texture RGBA data for WebGL UI overlay (no 2D canvas).
// Fullscreen parchment map with legend, slightly transparent overlay.

const PALETTE = {
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
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128, 128, 128];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function setPixel(buf, w, x, y, r, g, b, a = 255) { const i = (y * w + x) * 4; buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a; }
function fillRect(buf, w, h, x0, y0, rw, rh, r, g, b, a = 255) {
  const x1 = Math.min(w, x0+rw), y1 = Math.min(h, y0+rh);
  for (let y=Math.max(0,y0); y<y1; y++) for (let x=Math.max(0,x0); x<x1; x++) setPixel(buf,w,x,y,r,g,b,a);
}
function fillCircle(buf,w,h,cx,cy,rad,r,g,b,a=255){ const r2=rad*rad; for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=r2){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } }
function strokeCircle(buf,w,h,cx,cy,rad,r,g,b,a=255,lw=1){ for(let dy=-rad-lw;dy<=rad+lw;dy++)for(let dx=-rad-lw;dx<=rad+lw;dx++){ const d2=dx*dx+dy*dy; const d=Math.sqrt(d2); if(Math.abs(d-rad)<=lw){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); } } }

export function generateMapTextureData(dungeon, mode="role", player=null, uiCfg={}) {
  const w = 640, h = 360;
  const buf = new Uint8Array(w*h*4);
  const alpha = Math.floor((uiCfg.opacity ?? 0.88) * 255);

  // parchment background slightly transparent
  const bg = hexToRgb(uiCfg.parchmentBg || PALETTE.canvasBg);
  const scan = hexToRgb(uiCfg.parchmentScan || PALETTE.canvasScan);
  for (let y=0;y<h;y++){ const useScan=(y%4===0); const col=useScan?scan:bg; for(let x=0;x<w;x++) setPixel(buf,w,x,y,col[0],col[1],col[2],alpha); }

  if (!dungeon) return buf;
  const d = dungeon;
  const legendH = 60, legendGap = 16, pad = 40;
  const availW = w - pad*2, availH = h - legendH - legendGap - pad*2;
  const cs = Math.max(2, Math.floor(Math.min(availW/d.w, availH/d.h)));
  const gridW = d.w*cs, gridH = d.h*cs;
  const ox = Math.floor((w - gridW)/2), oy = Math.floor((availH - gridH)/2) + pad;
  const legendY = oy + gridH + legendGap;

  const roomByCell = new Map();
  d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

  const getCellColor = (x,y,gv,r)=>{ if(gv===0) return hexToRgb(r?(PALETTE.roles[r.role]||PALETTE.materials.floor1):PALETTE.roles.corridor); return hexToRgb(PALETTE.wallDark); };
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
    if(!r.stairWall) return; const sw=r.stairWall; const mx=(sw.x1+sw.x2)/2, my=(sw.y1+sw.y2)/2;
    const cx=Math.floor(ox+mx*cs), cy=Math.floor(oy+my*cs); const sz=Math.max(6,Math.floor(cs*1.2));
    fillCircle(buf,w,h,cx,cy,Math.floor(sz*0.6), gold[0],gold[1],gold[2],255);
    strokeCircle(buf,w,h,cx,cy,Math.floor(sz*0.6), wallDark[0],wallDark[1],wallDark[2],255, Math.max(1,Math.floor(cs*0.12)));
  });

  // player dot (bright green)
  if(player){ const px=Math.floor(ox+player.x*cs), py=Math.floor(oy+player.y*cs); const pr=Math.max(3,Math.floor(cs*0.5)); fillCircle(buf,w,h,px,py,pr,15,220,15,255); }

  // legend bar at bottom — colored swatches (no text in texture, text would need font rasterization; swatches convey roles visually)
  const items = Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, hexToRgb(c)]);
  const swatch=14, gap=10, itemW=90;
  const totalW = items.length*itemW - gap;
  let lx = Math.max(pad, Math.floor((w - totalW)/2));
  const ly = legendY;
  // legend panel background
  const panelCol = PALETTE.parchmentPanel, borderCol = PALETTE.parchmentBorder;
  fillRect(buf,w,h,lx-8,ly-16,totalW+16,32, panelCol[0],panelCol[1],panelCol[2],220);
  // border top and bottom lines
  fillRect(buf,w,h,lx-8,ly-16,totalW+16,2, borderCol[0],borderCol[1],borderCol[2],220);
  fillRect(buf,w,h,lx-8,ly+16,totalW+16,2, borderCol[0],borderCol[1],borderCol[2],220);
  items.forEach(([label,col])=>{ fillRect(buf,w,h,lx,ly-7,swatch,swatch,col[0],col[1],col[2],255); fillRect(buf,w,h,lx,ly-7,swatch,swatch, borderCol[0],borderCol[1],borderCol[2],80); lx+=itemW; });

  return buf;
}
