// map-ui.js — parchment minimap with fog-of-war discovery + retro dither + dashed trail
// Icons: entrance, exit, player SAME radius from layout, SAME border from palette.wallDark, no white.

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
  roles: {
    entrance: "#8a8a8a", exit: "#5a5a5a", guardian: "#6a6a6a",
    treasure: "#c9a84c", hub: "#7a7a7a", hall: "#9a9a9a",
    armory: "#7a7a7a", shrine: "#7a7a7a", secret: "#b8b8b8", corridor: "#6a6a6a",
  },
  zones: [
    { name: "Entry", rgb: [160,135,95], hex: "#a0875f" },
    { name: "Antechamber", rgb: [130,110,80], hex: "#826e50" },
    { name: "Depths", rgb: [90,75,55], hex: "#5a4b37" },
    { name: "Sanctum", rgb: [60,70,45], hex: "#3c462d" },
    { name: "Exit", rgb: [45,35,50], hex: "#2d2332" },
  ],
  materials: { wall1: "#4a4a4a", wall2: "#5a5a5a", floor1: "#a0a0a0", floor2: "#8a8a8a" },
};

const ROLE_DISPLAY = { entrance: "Entrance", exit: "Exit", guardian: "Guardian", treasure: "Treasure", hub: "Hub", hall: "Hall", armory: "Armory", shrine: "Shrine", secret: "Secret" };

function toCssColor(c, fallback) {
  if (!c) return fallback;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    if (c.length >= 4) return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${c[3]/255})`;
    if (c.length >= 3) return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
  }
  return fallback;
}
function toHexOrCss(c, fallback) { return toCssColor(c, fallback); }

function hexToRgbArray(hex) {
  if (Array.isArray(hex) && hex.length >= 3) return [hex[0]|0, hex[1]|0, hex[2]|0];
  if (typeof hex !== "string") return [128,128,128];
  const rgbMatch = hex.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128,128,128];
  return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
}

function setPixel(buf, w, x, y, r, g, b, a=255){ const i=(y*w+x)*4; buf[i]=r; buf[i+1]=g; buf[i+2]=b; buf[i+3]=a; }
function fillRect(buf, w, h, x0, y0, rw, rh, r, g, b, a=255){
  const x1=Math.min(w,x0+rw), y1=Math.min(h,y0+rh);
  for(let y=Math.max(0,y0);y<y1;y++) for(let x=Math.max(0,x0);x<x1;x++) setPixel(buf,w,x,y,r,g,b,a);
}
function fillCircle(buf,w,h,cx,cy,rad,r,g,b,a=255){
  const r2=rad*rad;
  for(let dy=-rad;dy<=rad;dy++) for(let dx=-rad;dx<=rad;dx++) if(dx*dx+dy*dy<=r2){
    const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a);
  }
}
function strokeCircle(buf,w,h,cx,cy,rad,r,g,b,a=255,lw=1){
  for(let dy=-rad-lw;dy<=rad+lw;dy++) for(let dx=-rad-lw;dx<=rad+lw;dx++){
    const d2=dx*dx+dy*dy; const d=Math.sqrt(d2);
    if(Math.abs(d-rad)<=lw){ const x=cx+dx,y=cy+dy; if(x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,r,g,b,a); }
  }
}

function resolvePaletteConfig(uiCfg){
  const out = JSON.parse(JSON.stringify(DEFAULT_PALETTE));
  const colors = uiCfg?.colors || {};
  if (uiCfg?.parchment?.bg) out.canvasBg = toHexOrCss(uiCfg.parchment.bg, out.canvasBg);
  if (uiCfg?.parchment?.scan) out.canvasScan = toHexOrCss(uiCfg.parchment.scan, out.canvasScan);
  if (colors.wallDark) out.wallDark = toHexOrCss(colors.wallDark, out.wallDark);
  if (colors.gold) out.gold = toCssColor(colors.gold, out.gold);
  if (colors.goldDim) out.goldDim = toCssColor(colors.goldDim, out.goldDim);
  if (colors.parchmentPanel) out.parchmentPanel = toCssColor(colors.parchmentPanel, out.parchmentPanel);
  if (colors.parchmentBorder) out.parchmentPanelBorder = toCssColor(colors.parchmentBorder, out.parchmentPanelBorder);
  if (colors.textLight) out.textLight = toCssColor(colors.textLight, out.textLight);
  if (colors.textDim) out.textDim = toCssColor(colors.textDim, out.textDim);
  return out;
}

function resolveLayout(uiCfg){
  const layout = uiCfg?.layout || {};
  return {
    legendHeight: layout.legendHeight ?? 60,
    legendGap: layout.legendGap ?? 16,
    padding: layout.padding ?? 40,
    minCell: layout.grid?.minCell ?? 2,
    stair: { sizeFactor: layout.stair?.sizeFactor ?? 1.2, minSize: layout.stair?.minSize ?? 6, strokeFactor: layout.stair?.strokeFactor ?? 0.12 },
    player: { minRad: layout.playerDot?.minRad ?? 6, sizeFactor: layout.playerDot?.sizeFactor ?? 1.0, color: uiCfg?.colors?.player || [88,128,92], dirColor: uiCfg?.colors?.playerDir || [42,42,42] },
    legend: { swatch: layout.legend?.swatch ?? 12, gap: layout.legend?.gap ?? 8, itemWidth: layout.legend?.itemWidth ?? 90 },
    parchment: { scanlineEvery: uiCfg?.parchment?.scanlineEvery ?? 4, alpha: Math.floor(((uiCfg?.display?.opacity ?? uiCfg?.parchment?.alpha ?? 0.92)*255)), opacity: uiCfg?.display?.opacity ?? uiCfg?.parchment?.alpha ?? 0.92 },
    fontFamily: uiCfg?.font?.family || "Pixelify Sans",
    fontFallback: uiCfg?.font?.fallback || "Georgia, serif",
    fontGoogleName: uiCfg?.font?.googleName || "Pixelify+Sans:wght@400;600;700",
  };
}

function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath();
}

function resolveDiscoveryCfg(discovery, discoveryCfg){
  const inst = discovery?._cfg || {};
  const file = discoveryCfg || {};
  const revealFile = file.reveal || {};
  const revealInst = inst.reveal || {};
  const reveal = { ...revealInst, ...revealFile };
  const trail = { ...(inst.trail||{}), ...(file.trail||{}) };
  const ditherFile = revealFile.dither || {};
  const ditherInst = revealInst.dither || {};
  const dither = { ...ditherInst, ...ditherFile };
  const playerDir = { ...(inst.playerDir||{}), ...(file.playerDir||{}) };
  return {
    reveal: {
      enabled: reveal.enabled ?? true,
      peekDistance: reveal.peekDistance ?? 1,
      animationDuration: reveal.animationDuration ?? 400,
      dither: { enabled: dither.enabled ?? true, pattern: dither.pattern ?? "random", bayerSize: dither.bayerSize ?? 4, dotSize: dither.dotSize ?? 2 },
      undiscovered: { hide: true },
      oldRoomOpacity: reveal.oldRoomOpacity ?? 0.85,
    },
    trail: {
      enabled: trail.enabled ?? true,
      color: trail.color ?? [88,128,92],
      opacity: trail.opacity ?? 0.45,
      lineWidth: trail.lineWidth ?? 2.0,
      dash: trail.dash ?? [5,4],
      cap: trail.cap ?? "butt",
      join: trail.join ?? "miter",
      onlyDiscovered: trail.onlyDiscovered ?? true,
    },
    playerDir: {
      enabled: playerDir.enabled ?? true,
      size: playerDir.size ?? 0,
      color: playerDir.color ?? [42,42,42],
      opacity: playerDir.opacity ?? 0.95,
    }
  };
}

function bayerMatrix4(){ return [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]; }
function hash01(x, y, order=0){ const s=Math.sin(x*12.9898+y*78.233+order*0.037)*43758.5453; return s-Math.floor(s); }

function shouldDrawCell(x, y, discovery, newlySet, animProgress, cfg){
  if (!discovery) return true;
  if (cfg?.reveal?.enabled === false) return true;
  if (!discovery.isDiscovered(x,y)) return false;
  if (animProgress >= 1) return true;
  if (!newlySet.has(x+","+y)) return true;
  const pattern = cfg?.reveal?.dither?.pattern || "random";
  const bayerSize = cfg?.reveal?.dither?.bayerSize ?? 4;
  if (pattern === "bayer") {
    const m = bayerMatrix4();
    const denom = bayerSize*bayerSize || 16;
    return m[y & 3][x & 3] / denom < animProgress;
  }
  const order = discovery.getDiscoveryOrder ? discovery.getDiscoveryOrder(x,y) : 0;
  return hash01(x,y,order) < animProgress;
}

function trailColorToCss(color){
  if (!color) return "#58805c";
  if (typeof color === "string") return color;
  if (Array.isArray(color)) return `rgb(${color[0]|0},${color[1]|0},${color[2]|0})`;
  return "#58805c";
}

function getPlayerAngle(player){
  if (!player) return 0;
  if (typeof player.getAngle === "function") return player.getAngle();
  if (typeof player.angle === "number") return player.angle;
  if (typeof player.gridTargetAngle === "number" && player.gridMode) return player.gridTargetAngle;
  return 0;
}

function getUnifiedIconRadius(cs, layout){
  const minRad = layout?.player?.minRad ?? 6;
  const factor = layout?.player?.sizeFactor ?? 0.9;
  return Math.max(minRad, Math.floor(cs * factor));
}

function drawCircleWithTriangle(ctx, cx, cy, radius, circleFillCss, borderCss, triFillCss, triBorderCss, angle, scale=0.85){
  const r = Math.max(1, radius);
  ctx.save();
  ctx.fillStyle = circleFillCss;
  ctx.strokeStyle = borderCss;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
  const dirX=Math.cos(angle), dirY=Math.sin(angle);
  const perpX=-Math.sin(angle), perpY=Math.cos(angle);
  const tipDist=r*0.55*scale, baseDist=r*0.3, baseHalf=r*0.45;
  const tipX=cx+dirX*tipDist, tipY=cy+dirY*tipDist;
  const blX=cx-dirX*baseDist+perpX*baseHalf, blY=cy-dirY*baseDist+perpY*baseHalf;
  const brX=cx-dirX*baseDist-perpX*baseHalf, brY=cy-dirY*baseDist-perpY*baseHalf;
  ctx.fillStyle=triFillCss; ctx.strokeStyle=triBorderCss||borderCss; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(tipX,tipY); ctx.lineTo(blX,blY); ctx.lineTo(brX,brY); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function calcGridLayout(w, h, dungeon, layout){
  const legendH=layout.legendHeight, legendGap=layout.legendGap;
  const availW=w-40, availH=h-legendH-legendGap-40;
  const cs=Math.max(layout.minCell, Math.floor(Math.min(availW/dungeon.w, availH/dungeon.h)));
  const gridW=dungeon.w*cs, gridH=dungeon.h*cs;
  const ox=Math.floor((w-gridW)/2), oy=Math.floor((availH-gridH)/2)+20;
  const legendY=oy+gridH+legendGap;
  return { cs, gridW, gridH, ox, oy, legendY, availW, availH };
}
function buildRoomCellMap(dungeon){
  const m=new Map();
  dungeon.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++) for(let dx=0;dx<r.w;dx++) m.set((r.y+dy)*dungeon.w+(r.x+dx), r); });
  return m;
}
function isFloorAt(dungeon, x, y){ return x>=0&&y>=0&&x<dungeon.w&&y<dungeon.h&&dungeon.grid[y*dungeon.w+x]===0; }
function hasFloorNeighbor(dungeon, x, y){ return isFloorAt(dungeon,x-1,y)||isFloorAt(dungeon,x+1,y)||isFloorAt(dungeon,x,y-1)||isFloorAt(dungeon,x,y+1); }
function getCellCssColor(x, y, gv, room, mode, dungeon, palette){
  const ROLE_COLORS=palette.roles;
  const ZONE_TINTS=palette.zones.map(z=>z.rgb);
  if (gv===0){
    if (mode==="role") return room ? (ROLE_COLORS[room.role]||palette.materials.floor1) : ROLE_COLORS.corridor;
    if (mode==="zone"){
      const zi=room ? ["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(room.zone) : 2;
      const t=ZONE_TINTS[Math.max(0,Math.min(4,zi))]||ZONE_TINTS[2];
      return `rgb(${t[0]},${t[1]},${t[2]})`;
    }
    const fm=dungeon.floorMat ? dungeon.floorMat[y*dungeon.w+x] : 1;
    const shades=[palette.materials.floor1, palette.materials.floor2];
    return shades[(fm-1)%2];
  }
  if (mode==="material"){
    const shades=[palette.materials.wall1, palette.materials.wall2];
    return shades[(gv-1)%2];
  }
  return palette.wallDark;
}
function getCellRgb(room, palette, gv){
  const col = room ? (palette.roles[room.role]||palette.materials.floor1) : palette.roles.corridor;
  if (gv===0) return hexToRgbArray(col);
  return hexToRgbArray(palette.wallDark);
}

function drawParchmentBg(ctx, w, h, palette, layout){
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle=toCssColor(palette.canvasBg, DEFAULT_PALETTE.canvasBg);
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle=toCssColor(palette.canvasScan, DEFAULT_PALETTE.canvasScan);
  const every=layout.parchment.scanlineEvery;
  if (every>0) for(let y=0;y<h;y+=every) ctx.fillRect(0,y,w,1);
}

function drawDiscoveredCells(ctx, dungeon, mode, roomByCell, ox, oy, cs, discovery, newlySet, animProgress, discCfg, palette){
  for(let y=0;y<dungeon.h;y++) for(let x=0;x<dungeon.w;x++){
    if (!shouldDrawCell(x,y,discovery,newlySet,animProgress,discCfg)) continue;
    const i=y*dungeon.w+x, gv=dungeon.grid[i], room=roomByCell.get(i);
    if (gv===0){
      ctx.fillStyle=toCssColor(getCellCssColor(x,y,0,room,mode,dungeon,palette), "#6a6a6a");
      ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
    } else {
      if (!hasFloorNeighbor(dungeon,x,y)) continue;
      ctx.fillStyle=toCssColor(getCellCssColor(x,y,gv,room,mode,dungeon,palette), "#2a2a2a");
      ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
    }
  }
}

function drawRoomsRounded(ctx, dungeon, mode, ox, oy, cs, palette){
  const ROLE_COLORS=palette.roles;
  const ZONE_TINTS=palette.zones.map(z=>z.rgb);
  const wallT=Math.max(1, cs*0.18), cornerR=Math.max(2, Math.min(8, cs*0.5));
  dungeon.rooms.forEach(r=>{
    const rx=ox+r.x*cs, ry=oy+r.y*cs, rw=r.w*cs, rh=r.h*cs;
    let color;
    if (mode==="role") color=ROLE_COLORS[r.role]||palette.materials.floor1;
    else if (mode==="zone"){
      const zi=["Entry","Antechamber","Depths","Sanctum","Exit"].indexOf(r.zone);
      const t=ZONE_TINTS[Math.max(0,Math.min(4,zi))]||ZONE_TINTS[2];
      color=`rgb(${t[0]},${t[1]},${t[2]})`;
    } else color=palette.materials.floor1;
    ctx.fillStyle=toCssColor(palette.wallDark, "#2a2a2a");
    roundRectPath(ctx, rx-wallT/2, ry-wallT/2, rw+wallT, rh+wallT, cornerR+wallT/2); ctx.fill();
    ctx.fillStyle=toCssColor(color, "#9a9a9a");
    roundRectPath(ctx, rx, ry, rw, rh, cornerR); ctx.fill();
  });
  for(let y=0;y<dungeon.h;y++) for(let x=0;x<dungeon.w;x++){
    const i=y*dungeon.w+x, gv=dungeon.grid[i];
    const hasRoom = dungeon.rooms.some(r=> x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h);
    if (hasRoom) continue;
    if (gv===0){
      ctx.fillStyle=toCssColor(getCellCssColor(x,y,0,null,mode,dungeon,palette), "#6a6a6a");
      ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
    } else {
      if (!hasFloorNeighbor(dungeon,x,y)) continue;
      ctx.fillStyle=toCssColor(getCellCssColor(x,y,gv,null,mode,dungeon,palette), "#2a2a2a");
      ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
    }
  }
}

function drawStairsCanvas(ctx, dungeon, ox, oy, cs, radius, borderCss, palette, discovery, newlySet, animProgress, discCfg){
  const discEnabled = discovery && discCfg.reveal.enabled;
  const goldCss=toCssColor(palette.gold, "#c9a84c");
  const wallCss=toCssColor(palette.wallDark, palette.wallDark);
  const drawOne=(r,isExit)=>{
    if (!r.stairWall) return;
    if (discEnabled){
      const mx=(r.stairWall.x1+r.stairWall.x2)/2, my=(r.stairWall.y1+r.stairWall.y2)/2;
      if (!shouldDrawCell(Math.floor(mx),Math.floor(my),discovery,newlySet,animProgress,discCfg)) return;
    }
    const mx=(r.stairWall.x1+r.stairWall.x2)/2, my=(r.stairWall.y1+r.stairWall.y2)/2;
    const cx=ox+mx*cs, cy=oy+my*cs;
    const angle=isExit ? Math.PI/2 : -Math.PI/2;
    drawCircleWithTriangle(ctx,cx,cy,radius,goldCss,borderCss,wallCss,borderCss,angle,0.85);
  };
  dungeon.rooms.filter(r=>r.role==="entrance").forEach(r=>drawOne(r,false));
  dungeon.rooms.filter(r=>r.role==="exit").forEach(r=>drawOne(r,true));
}

function drawTrailCanvas(ctx, ox, oy, cs, discovery, discCfg){
  if (!discCfg.trail.enabled || !discovery) return;
  const path=discovery.getPath ? discovery.getPath() : [];
  if (path.length<2) return;
  const trailColor=trailColorToCss(discCfg.trail.color);
  ctx.save();
  ctx.globalAlpha=discCfg.trail.opacity ?? 0.45;
  ctx.strokeStyle=trailColor;
  ctx.lineWidth=discCfg.trail.lineWidth ?? 2.0;
  const dash=discCfg.trail.dash || [5,4];
  if (ctx.setLineDash) ctx.setLineDash(dash);
  ctx.lineCap=discCfg.trail.cap || "butt";
  ctx.lineJoin=discCfg.trail.join || "miter";
  ctx.beginPath();
  let started=false;
  for(let i=0;i<path.length-1;i++){
    const a=path[i], b=path[i+1];
    if (discCfg.trail.onlyDiscovered){
      if (!discovery.isDiscovered(a.x,a.y) || !discovery.isDiscovered(b.x,b.y)){ started=false; continue; }
    }
    if (Math.hypot(b.x-a.x, b.y-a.y)>2){ started=false; continue; }
    const ax=ox+a.x*cs+cs*0.5, ay=oy+a.y*cs+cs*0.5;
    const bx=ox+b.x*cs+cs*0.5, by=oy+b.y*cs+cs*0.5;
    if (!started){ ctx.moveTo(ax,ay); started=true; }
    ctx.lineTo(bx,by);
  }
  ctx.stroke(); ctx.restore();
}

function drawPlayerCanvas(ctx, player, ox, oy, cs, radius, borderCss, layout){
  if (!player) return;
  const px=Math.floor(ox+player.x*cs), py=Math.floor(oy+player.y*cs);
  const ang=getPlayerAngle(player);
  const playerCircle=toCssColor(layout.player.color, "rgb(88,128,92)");
  const playerTri=toCssColor(layout.player.dirColor || [42,42,42], "#2a2a2a");
  drawCircleWithTriangle(ctx,px,py,radius,playerCircle,borderCss,playerTri,borderCss,ang,0.9);
}

function drawLegendCanvas(ctx, w, mode, palette, layout, legendY){
  const items = mode==="role" ? Object.entries(palette.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, toCssColor(c,"#888")])
    : mode==="zone" ? palette.zones.map(z=>[z.name, toCssColor(z.hex || `rgb(${z.rgb[0]},${z.rgb[1]},${z.rgb[2]})`, "#a0875f")])
    : [["Wall 1", toCssColor(palette.materials.wall1,"#4a4a4a")],["Wall 2", toCssColor(palette.materials.wall2,"#5a5a5a")],["Floor 1", toCssColor(palette.materials.floor1,"#a0a0a0")],["Floor 2", toCssColor(palette.materials.floor2,"#8a8a8a")]];
  const swatch=layout.legend.swatch, gap=layout.legend.gap, textPad=6, itemW=layout.legend.itemWidth;
  const totalW=items.length*itemW-gap;
  const startX=Math.max(20, Math.floor((w-totalW)/2));
  ctx.font=`12px "${layout.fontFamily}", ${layout.fontFallback}`;
  ctx.textBaseline="middle";
  let lx=startX;
  for(const [label,col] of items){
    ctx.fillStyle=col; roundRectPath(ctx,lx,legendY-6,swatch,swatch,2); ctx.fill();
    ctx.strokeStyle=toCssColor(palette.parchmentPanelBorder,"#8b7355"); ctx.lineWidth=0.5;
    roundRectPath(ctx,lx,legendY-6,swatch,swatch,2); ctx.stroke();
    ctx.fillStyle=toCssColor(palette.textLight,"#3a3020"); ctx.textAlign="left"; ctx.fillText(label,lx+swatch+textPad,legendY);
    lx+=itemW;
  }
}

function drawCellsToBuffer(buf, w, h, dungeon, ox, oy, cs, discovery, newlySet, animProgress, discCfg, palette){
  const roomByCell=buildRoomCellMap(dungeon);
  for(let y=0;y<dungeon.h;y++) for(let x=0;x<dungeon.w;x++){
    if (!shouldDrawCell(x,y,discovery,newlySet,animProgress,discCfg)) continue;
    const i=y*dungeon.w+x, gv=dungeon.grid[i], room=roomByCell.get(i);
    const rgb=getCellRgb(room,palette,gv);
    if (gv===0) fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,rgb[0],rgb[1],rgb[2],255);
    else if (hasFloorNeighbor(dungeon,x,y)) fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,rgb[0],rgb[1],rgb[2],255);
  }
}

export function generateMapTextureData(dungeon, mode="role", player=null, uiCfg={}, discovery=null, animProgress=1, discoveryCfg=null){
  if (typeof discovery==="number"){ animProgress=discovery; discovery=null; }
  const PALETTE=resolvePaletteConfig(uiCfg);
  const L=resolveLayout(uiCfg);
  const cfg=resolveDiscoveryCfg(discovery, discoveryCfg);
  const TEX_W=640, TEX_H=360;
  const hasDocument = typeof document!=="undefined" && typeof document.createElement==="function";
  const newlyList = discovery?.getNewlyDiscoveredSinceLastOpen ? discovery.getNewlyDiscoveredSinceLastOpen() : [];
  const newlySet=new Set(); newlyList.forEach(c=>newlySet.add(c.x+","+c.y));

  if (hasDocument){
    try{
      const canvas=document.createElement("canvas"); canvas.width=TEX_W; canvas.height=TEX_H;
      const ctx=canvas.getContext("2d"); if (!ctx) throw new Error("no 2d");
      drawParchmentBg(ctx,TEX_W,TEX_H,PALETTE,L);
      if (dungeon){
        const { cs, ox, oy, legendY } = calcGridLayout(TEX_W,TEX_H,dungeon,L);
        const roomByCell=buildRoomCellMap(dungeon);
        const discEnabled = discovery && cfg.reveal.enabled;
        const iconRadius=getUnifiedIconRadius(cs, L);
        const borderForIcons=toCssColor(PALETTE.wallDark, "#2a2a2a");
        if (discEnabled) drawDiscoveredCells(ctx,dungeon,mode,roomByCell,ox,oy,cs,discovery,newlySet,animProgress,cfg,PALETTE);
        else drawRoomsRounded(ctx,dungeon,mode,ox,oy,cs,PALETTE);
        drawStairsCanvas(ctx,dungeon,ox,oy,cs,iconRadius,borderForIcons,PALETTE,discovery,newlySet,animProgress,cfg);
        drawTrailCanvas(ctx,ox,oy,cs,discovery,cfg);
        drawPlayerCanvas(ctx,player,ox,oy,cs,iconRadius,borderForIcons,L);
        drawLegendCanvas(ctx,TEX_W,mode,PALETTE,L,legendY);
      }
      return new Uint8Array(ctx.getImageData(0,0,TEX_W,TEX_H).data);
    }catch(e){ console.warn("Canvas map render failed, falling back", e); }
  }

  const buf=new Uint8Array(TEX_W*TEX_H*4);
  const alpha=L.parchment.alpha;
  const bg=hexToRgbArray(PALETTE.canvasBg), scan=hexToRgbArray(PALETTE.canvasScan);
  const scanEvery=L.parchment.scanlineEvery;
  for(let y=0;y<TEX_H;y++){
    const useScan=(scanEvery>0 && y%scanEvery===0);
    const col=useScan?scan:bg;
    for(let x=0;x<TEX_W;x++) setPixel(buf,TEX_W,x,y,col[0],col[1],col[2],alpha);
  }
  if (!dungeon) return buf;
  const { cs, ox, oy } = calcGridLayout(TEX_W,TEX_H,dungeon,L);
  drawCellsToBuffer(buf,TEX_W,TEX_H,dungeon,ox,oy,cs,discovery,newlySet,animProgress,cfg,PALETTE);
  const gold=hexToRgbArray(PALETTE.gold), wallDark=hexToRgbArray(PALETTE.wallDark);
  const playerCol=hexToRgbArray(toCssColor(L.player.color, "rgb(88,128,92)"));
  const uniR=getUnifiedIconRadius(cs, L);
  dungeon.rooms.filter(r=>r.role==="entrance"||r.role==="exit").forEach(r=>{
    if(!r.stairWall) return;
    const discEnabled = discovery && cfg.reveal.enabled;
    if (discEnabled){
      const mx=(r.stairWall.x1+r.stairWall.x2)/2, my=(r.stairWall.y1+r.stairWall.y2)/2;
      if (!shouldDrawCell(Math.floor(mx),Math.floor(my),discovery,newlySet,animProgress,cfg)) return;
    }
    const sw=r.stairWall; const mx=(sw.x1+sw.x2)/2, my=(sw.y1+sw.y2)/2;
    const cx=Math.floor(ox+mx*cs), cy=Math.floor(oy+my*cs);
    fillCircle(buf,TEX_W,TEX_H,cx,cy,uniR,gold[0],gold[1],gold[2],255);
    strokeCircle(buf,TEX_W,TEX_H,cx,cy,uniR,wallDark[0],wallDark[1],wallDark[2],255,1);
  });
  if(player){
    const px=Math.floor(ox+player.x*cs), py=Math.floor(oy+player.y*cs);
    fillCircle(buf,TEX_W,TEX_H,px,py,uniR,playerCol[0],playerCol[1],playerCol[2],255);
    strokeCircle(buf,TEX_W,TEX_H,px,py,uniR,42,42,42,255,1);
  }
  if (cfg.trail.enabled && discovery){
    const path=discovery.getPath ? discovery.getPath() : [];
    const trailRgb=Array.isArray(cfg.trail.color) ? cfg.trail.color : [88,128,92];
    const trailAlpha=Math.floor((cfg.trail.opacity ?? 0.45)*255);
    for(let i=0;i<path.length-1;i++){
      const a=path[i], b=path[i+1];
      if (cfg.trail.onlyDiscovered && (!discovery.isDiscovered(a.x,a.y) || !discovery.isDiscovered(b.x,b.y))) continue;
      if (Math.hypot(b.x-a.x,b.y-a.y)>2) continue;
      const ax=Math.floor(ox+a.x*cs+cs*0.5), ay=Math.floor(oy+a.y*cs+cs*0.5);
      const bx=Math.floor(ox+b.x*cs+cs*0.5), by=Math.floor(oy+b.y*cs+cs*0.5);
      const steps=Math.max(Math.abs(bx-ax), Math.abs(by-ay));
      for(let s=0;s<=steps;s++){
        if (cfg.trail.dash && (s % (cfg.trail.dash[0]+cfg.trail.dash[1])) >= cfg.trail.dash[0]) continue;
        const x=Math.floor(ax+(bx-ax)*s/steps), y=Math.floor(ay+(by-ay)*s/steps);
        if(x>=0&&y>=0&&x<TEX_W&&y<TEX_H) setPixel(buf,TEX_W,x,y,trailRgb[0],trailRgb[1],trailRgb[2],trailAlpha);
      }
    }
  }
  return buf;
}
