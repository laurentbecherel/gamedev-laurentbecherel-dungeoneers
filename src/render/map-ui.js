// map-ui.js — generates map texture RGBA data for WebGL UI overlay.
// Task5 minimap-reveal: fog-of-war discovery with 1-tile peek, retro dither, dashed trail, consistent circle+triangle icons.
// Design system (strict):
// - All icons (entrance, exit, player) are circle + triangle with SAME shape and styling:
//   same radius = max(6, cs*0.9), same border 1px #2a2a2a, same triangle proportions tip r*0.65 base r*0.35 halfWidth r*0.5 scale 0.9 stroke 0.8
// - Color rule: light circles -> dark triangle, dark circles -> gold triangle. No white triangles.
//   Entrance: gold #c9a84c circle + dark #2a2a2a triangle up (-PI/2)
//   Exit: dark #2a2a2a circle + gold #c9a84c triangle down (PI/2)
//   Player: muted retro green #58805c [88,128,92] circle + dark #2a2a2a triangle facing angle (was [15,220,15] neon + white, fixed)
// - Configurable colors via ui/map.json (player) and discovery.json (playerDir now dark), but sizing/border unified in code (no code smell).

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
  if (uiCfg?.parchment?.bg) out.canvasBg = toHexOrCss(uiCfg.parchment.bg, out.canvasBg);
  if (uiCfg?.parchment?.scan) out.canvasScan = toHexOrCss(uiCfg.parchment.scan, out.canvasScan);
  if (uiCfg?.parchmentBg) out.canvasBg = toHexOrCss(uiCfg.parchmentBg, out.canvasBg);
  if (uiCfg?.parchmentScan) out.canvasScan = toHexOrCss(uiCfg.parchmentScan, out.canvasScan);
  if (colors.wallDark) out.wallDark = toHexOrCss(colors.wallDark, out.wallDark);
  if (colors.gold) out.gold = toCssColor(colors.gold, out.gold);
  if (colors.goldDim) out.goldDim = toCssColor(colors.goldDim, out.goldDim);
  if (colors.parchmentPanel) out.parchmentPanel = toCssColor(colors.parchmentPanel, out.parchmentPanel);
  if (colors.parchmentBorder) out.parchmentPanelBorder = toCssColor(colors.parchmentBorder, out.parchmentPanelBorder);
  if (colors.textLight) out.textLight = toCssColor(colors.textLight, out.textLight);
  if (colors.textDim) out.textDim = toCssColor(colors.textDim, out.textDim);
  if (colors.parchmentPanel && Array.isArray(colors.parchmentPanel)) out.parchmentPanelRGB = colors.parchmentPanel;
  if (colors.parchmentBorder && Array.isArray(colors.parchmentBorder)) out.parchmentBorderRGB = colors.parchmentBorder;
  if (colors.textLight && Array.isArray(colors.textLight)) out.textLightRGB = colors.textLight;
  if (colors.textDim && Array.isArray(colors.textDim)) out.textDimRGB = colors.textDim;
  if (colors.roles) out.roles = { ...out.roles, ...colors.roles };
  if (colors.materials) out.materials = { ...out.materials, ...colors.materials };
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
      minRad: layout.playerDot?.minRad ?? 6,
      sizeFactor: layout.playerDot?.sizeFactor ?? 1.0,
      color: uiCfg?.colors?.player || [88, 128, 92],
      dirSize: layout.playerDot?.dirSize ?? 0,
      dirColor: layout.playerDot?.dirColor || [42, 42, 42],
    },
    legend: {
      swatch: layout.legend?.swatch ?? 12,
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
function resolveDiscoveryCfg(discovery, discoveryCfg) {
  const fromInstance = discovery?._cfg || {};
  const fromFile = discoveryCfg || {};
  const reveal = fromFile.reveal || fromInstance.reveal || {};
  const trail = fromFile.trail || fromInstance.trail || {};
  const dither = reveal.dither || fromInstance.reveal?.dither || {};
  const pDirFile = fromFile.playerDir || reveal.playerDir || {};
  const pDirInst = fromInstance.playerDir || fromInstance.reveal?.playerDir || {};
  const playerDir = { ...pDirInst, ...pDirFile };
  return {
    reveal: {
      enabled: reveal.enabled ?? fromInstance.reveal?.enabled ?? true,
      peekDistance: reveal.peekDistance ?? fromInstance.reveal?.peekDistance ?? 1,
      animationDuration: reveal.animationDuration ?? fromInstance.reveal?.animationDuration ?? 400,
      dither: { enabled: dither.enabled ?? true, pattern: dither.pattern ?? "random", bayerSize: dither.bayerSize ?? 4 },
      undiscovered: { hide: reveal.undiscovered?.hide ?? true },
      playerDir: {
        enabled: playerDir.enabled ?? pDirInst.enabled ?? true,
        size: playerDir.size ?? pDirInst.size ?? 0,
        color: playerDir.color ?? pDirInst.color ?? [42, 42, 42],
        opacity: playerDir.opacity ?? pDirInst.opacity ?? 0.95,
      },
    },
    trail: {
      enabled: trail.enabled ?? fromInstance.trail?.enabled ?? true,
      color: trail.color ?? fromInstance.trail?.color ?? [201, 168, 76],
      opacity: trail.opacity ?? fromInstance.trail?.opacity ?? 0.5,
      lineWidth: trail.lineWidth ?? fromInstance.trail?.lineWidth ?? 1.8,
      dash: trail.dash ?? fromInstance.trail?.dash ?? [5, 4],
      cap: trail.cap ?? fromInstance.trail?.cap ?? "butt",
      join: trail.join ?? fromInstance.trail?.join ?? "miter",
      onlyDiscovered: trail.onlyDiscovered ?? fromInstance.trail?.onlyDiscovered ?? true,
    },
    playerDir: {
      enabled: playerDir.enabled ?? pDirInst.enabled ?? true,
      size: playerDir.size ?? pDirInst.size ?? 0,
      color: playerDir.color ?? pDirInst.color ?? [42, 42, 42],
      opacity: playerDir.opacity ?? pDirInst.opacity ?? 0.95,
    },
  };
}
function bayerMatrix4() { return [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]; }
function hash01(x, y, order = 0) { const sin = Math.sin(x * 12.9898 + y * 78.233 + order * 0.037) * 43758.5453; return sin - Math.floor(sin); }
function shouldDrawCell(x, y, discovery, newlySet, animProgress, cfg) {
  if (!discovery) return true;
  const revealEnabled = cfg?.reveal?.enabled;
  if (revealEnabled === false) return true;
  if (!discovery.isDiscovered(x, y)) return false;
  if (animProgress >= 1) return true;
  const key = x + "," + y;
  if (!newlySet.has(key)) return true;
  const pattern = cfg?.reveal?.dither?.pattern || "random";
  if (pattern === "bayer") {
    const b = bayerMatrix4();
    const threshold = b[y & 3][x & 3] / 16;
    return threshold < animProgress;
  } else {
    const order = discovery.getDiscoveryOrder ? discovery.getDiscoveryOrder(x, y) : 0;
    const h = hash01(x, y, order);
    return h < animProgress;
  }
}
function trailColorToCss(color) { if (!color) return "#c9a84c"; if (typeof color === "string") return color; if (Array.isArray(color) && color.length >= 3) return `rgb(${color[0]|0},${color[1]|0},${color[2]|0})`; return "#c9a84c"; }
function getPlayerAngle(player) {
  if (!player) return 0;
  if (typeof player.getAngle === "function") return player.getAngle();
  if (typeof player.angle === "number") return player.angle;
  if (typeof player.gridTargetAngle === "number" && player.gridMode) return player.gridTargetAngle;
  return 0;
}
// Strict consistent design system: SAME radius, SAME border for entrance/exit/player
function getUnifiedIconRadius(cs) {
  // Unified sizing — no more stair minSize 6 vs player minRad 3 inconsistency
  return Math.max(6, Math.floor(cs * 0.9));
}
function drawCircleWithTriangle(ctx, cx, cy, radius, circleFillCss, circleStrokeCss, triangleFillCss, triangleStrokeCss, angle, triangleScale = 0.85) {
  const r = Math.max(1, radius);
  // Unified border: 1px #2a2a2a for all
  const borderColor = "#2a2a2a";
  const borderWidth = 1;
  ctx.save();
  // Circle fill
  ctx.fillStyle = circleFillCss;
  ctx.strokeStyle = circleStrokeCss || borderColor;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Triangle inside — SAME proportions for all icons
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);
  const tipDist = r * 0.55 * triangleScale;
  const baseDist = r * 0.3;
  const baseHalfWidth = r * 0.45;

  const tipX = cx + dirX * tipDist;
  const tipY = cy + dirY * tipDist;
  const blX = cx - dirX * baseDist + perpX * baseHalfWidth;
  const blY = cy - dirY * baseDist + perpY * baseHalfWidth;
  const brX = cx - dirX * baseDist - perpX * baseHalfWidth;
  const brY = cy - dirY * baseDist - perpY * baseHalfWidth;

  ctx.fillStyle = triangleFillCss;
  ctx.strokeStyle = triangleStrokeCss || borderColor;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(blX, blY);
  ctx.lineTo(brX, brY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function generateMapTextureData(dungeon, mode = "role", player = null, uiCfg = {}, discovery = null, animProgress = 1, discoveryCfg = null) {
  if (typeof discovery === "number") { animProgress = discovery; discovery = null; }
  const PALETTE = resolvePaletteConfig(uiCfg);
  const L = resolveLayout(uiCfg);
  const cfg = resolveDiscoveryCfg(discovery, discoveryCfg);
  const w = 640, h = 360;
  const hasDocument = typeof document !== "undefined" && typeof document.createElement === "function";
  const discoveryEnabled = discovery && cfg.reveal.enabled;
  const newlyList = discovery && discovery.getNewlyDiscoveredSinceLastOpen ? discovery.getNewlyDiscoveredSinceLastOpen() : [];
  const newlySet = new Set();
  newlyList.forEach(c => newlySet.add(c.x + "," + c.y));

  if (hasDocument) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = toCssColor(PALETTE.canvasBg, DEFAULT_PALETTE.canvasBg);
      ctx.fillRect(0,0,w,h);
      ctx.fillStyle = toCssColor(PALETTE.canvasScan, DEFAULT_PALETTE.canvasScan);
      const scanEvery = L.parchment.scanlineEvery;
      if (scanEvery > 0) for(let y=0;y<h;y+=scanEvery) ctx.fillRect(0,y,w,1);

      if (dungeon) {
        const d = dungeon;
        const legendH = L.legendHeight;
        const legendGap = L.legendGap;
        const availW = w - 40;
        const availH = h - legendH - legendGap - 40;
        const cs = Math.max(L.minCell, Math.floor(Math.min(availW/d.w, availH/d.h)));
        const gridW = d.w*cs;
        const gridH = d.h*cs;
        const ox = Math.floor((w - gridW)/2);
        const oy = Math.floor((availH - gridH)/2) + 20;
        const legendY = oy + gridH + legendGap;

        const roomByCell = new Map();
        d.rooms.forEach(r=>{ for(let dy=0;dy<r.h;dy++)for(let dx=0;dx<r.w;dx++) roomByCell.set((r.y+dy)*d.w+(r.x+dx), r); });

        const ROLE_COLORS = PALETTE.roles;
        const ZONE_TINTS = PALETTE.zones.map(z=>z.rgb);

        const getCellColor = (x, y, gv, room) => {
          if (gv === 0) {
            if (mode === "role") return room ? (ROLE_COLORS[room.role] || PALETTE.materials.floor1) : ROLE_COLORS.corridor;
            else if (mode === "zone") {
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

        if (discoveryEnabled) {
          for (let y=0;y<d.h;y++) for (let x=0;x<d.w;x++) {
            if (!shouldDrawCell(x,y,discovery,newlySet,animProgress,cfg)) continue;
            const i=y*d.w+x, gv=d.grid[i], room=roomByCell.get(i);
            if (gv===0) {
              const col = getCellColor(x,y,0,room);
              ctx.fillStyle = toCssColor(col, "#6a6a6a");
              ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
            } else {
              if (!hasFloorNeighbor(x,y)) continue;
              const col = getCellColor(x,y,gv,room);
              ctx.fillStyle = toCssColor(col, "#2a2a2a");
              ctx.fillRect(ox+x*cs, oy+y*cs, cs, cs);
            }
          }
        } else {
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
            } else { color = PALETTE.materials.floor1; }
            ctx.fillStyle = toCssColor(PALETTE.wallDark, "#2a2a2a");
            roundRectPath(ctx, rx - wallT/2, ry - wallT/2, rw + wallT, rh + wallT, roomCornerR + wallT/2);
            ctx.fill();
            ctx.fillStyle = toCssColor(color, "#9a9a9a");
            roundRectPath(ctx, rx, ry, rw, rh, roomCornerR);
            ctx.fill();
          });
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
        }

        // Consistent icons: SAME radius, SAME border, SAME triangle shape, NO white
        const unifiedRadius = getUnifiedIconRadius(cs);
        const border = "#2a2a2a";
        const goldCss = toCssColor(PALETTE.gold, "#c9a84c");
        const wallDarkCss = toCssColor(PALETTE.wallDark, "#2a2a2a");
        const playerCircleCss = toCssColor(L.player.color, "rgb(88,128,92)");
        // Player triangle: dark #2a2a2a (not white) — consistent rule: light circles -> dark triangle
        const playerTriCss = toCssColor(cfg.playerDir.color || [42,42,42], "#2a2a2a");

        const drawStairConsistent = (r, isExit) => {
          if (!r.stairWall) return;
          if (discoveryEnabled) {
            const mx = (r.stairWall.x1 + r.stairWall.x2)/2, my = (r.stairWall.y1 + r.stairWall.y2)/2;
            if (!shouldDrawCell(Math.floor(mx), Math.floor(my), discovery, newlySet, animProgress, cfg)) return;
          }
          const sw = r.stairWall;
          const mx = (sw.x1 + sw.x2)/2, my = (sw.y1 + sw.y2)/2;
          const cx = ox + mx*cs, cy = oy + my*cs;
          if (isExit) {
            drawCircleWithTriangle(ctx, cx, cy, unifiedRadius, wallDarkCss, border, goldCss, border, Math.PI/2, 0.85);
          } else {
            drawCircleWithTriangle(ctx, cx, cy, unifiedRadius, goldCss, border, wallDarkCss, border, -Math.PI/2, 0.85);
          }
        };
        d.rooms.filter(r=>r.role==="entrance").forEach(r=>drawStairConsistent(r,false));
        d.rooms.filter(r=>r.role==="exit").forEach(r=>drawStairConsistent(r,true));

        if (cfg.trail.enabled && discovery) {
          const path = discovery.getPath ? discovery.getPath() : [];
          if (path.length > 1) {
            const trailColor = trailColorToCss(cfg.trail.color);
            ctx.save();
            ctx.globalAlpha = cfg.trail.opacity ?? 0.5;
            ctx.strokeStyle = trailColor;
            ctx.lineWidth = cfg.trail.lineWidth ?? 1.8;
            const dash = cfg.trail.dash || [5,4];
            if (ctx.setLineDash) ctx.setLineDash(dash);
            ctx.lineCap = cfg.trail.cap || "butt";
            ctx.lineJoin = cfg.trail.join || "miter";
            ctx.beginPath();
            let started = false;
            for (let i=0;i<path.length-1;i++) {
              const a = path[i], b = path[i+1];
              if (cfg.trail.onlyDiscovered) {
                if (!discovery.isDiscovered(a.x,a.y) || !discovery.isDiscovered(b.x,b.y)) { started = false; continue; }
              }
              const dist = Math.hypot(b.x-a.x, b.y-a.y);
              if (dist > 2) { started = false; continue; }
              const ax = ox + a.x*cs + cs*0.5;
              const ay = oy + a.y*cs + cs*0.5;
              const bx = ox + b.x*cs + cs*0.5;
              const by = oy + b.y*cs + cs*0.5;
              if (!started) { ctx.moveTo(ax,ay); started = true; }
              ctx.lineTo(bx,by);
            }
            ctx.stroke();
            ctx.restore();
          }
        }

        if (player) {
          const px = Math.floor(ox + player.x*cs);
          const py = Math.floor(oy + player.y*cs);
          const ang = getPlayerAngle(player);
          // Player: SAME radius as entrance/exit, SAME border #2a2a2a, muted green circle + dark triangle (no white)
          drawCircleWithTriangle(ctx, px, py, unifiedRadius, playerCircleCss, border, playerTriCss, border, ang, 0.9);
        }

        const items = mode==="role"
          ? Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, toCssColor(c, "#888")])
          : mode==="zone"
          ? PALETTE.zones.map(z => [z.name, toCssColor(z.hex || `rgb(${z.rgb[0]},${z.rgb[1]},${z.rgb[2]})`, "#a0875f")])
          : [["Wall 1", toCssColor(PALETTE.materials.wall1, "#4a4a4a")],["Wall 2", toCssColor(PALETTE.materials.wall2, "#5a5a5a")],["Floor 1", toCssColor(PALETTE.materials.floor1, "#a0a0a0")],["Floor 2", toCssColor(PALETTE.materials.floor2, "#8a8a8a")]];

        const swatch = L.legend.swatch;
        const gap = L.legend.gap;
        const textPad = 6;
        const itemW = L.legend.itemWidth;
        const totalW = items.length * itemW - gap;
        const startX = Math.max(20, Math.floor((w - totalW)/2));
        const ly = legendY;
        ctx.font = `12px "${L.fontFamily}", ${L.fontFallback}`;
        ctx.textBaseline = "middle";
        let lx = startX;
        for(const [label,col] of items) {
          ctx.fillStyle = col;
          roundRectPath(ctx, lx, ly-6, swatch, swatch, 2);
          ctx.fill();
          ctx.strokeStyle = toCssColor(PALETTE.parchmentPanelBorder, "#8b7355");
          ctx.lineWidth = 0.5;
          roundRectPath(ctx, lx, ly-6, swatch, swatch, 2);
          ctx.stroke();
          ctx.fillStyle = toCssColor(PALETTE.textLight, "#3a3020");
          ctx.textAlign = "left";
          ctx.fillText(label, lx + swatch + textPad, ly);
          lx += itemW;
        }
      }

      const imageData = ctx.getImageData(0,0,w,h);
      const buf = new Uint8Array(imageData.data);
      return buf;
    } catch (e) {
      console.warn("Canvas map render failed, falling back to raw buffer", e);
    }
  }

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
  const availW = w - 40;
  const availH = h - legendH - legendGap - 40;
  const cs = Math.max(L.minCell, Math.floor(Math.min(availW/d.w, availH/d.h)));
  const gridW = d.w*cs, gridH = d.h*cs;
  const ox = Math.floor((w - gridW)/2);
  const oy = Math.floor((availH - gridH)/2) + 20;

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

  for(let y=0;y<d.h;y++) for(let x=0;x<d.w;x++){
    if (!shouldDrawCell(x,y,discovery,newlySet,animProgress,cfg)) continue;
    const i=y*d.w+x, gv=d.grid[i], r=roomByCell.get(i);
    if (r) {
      const c=getCellColor(x,y,0,r);
      fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,c[0],c[1],c[2],255);
    } else {
      if(gv===0){ const c=getCellColor(x,y,0,null); fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,c[0],c[1],c[2],255); }
      else if(hasFloorNeighbor(x,y)){ const c=getCellColor(x,y,gv,null); fillRect(buf,w,h,ox+x*cs,oy+y*cs,cs,cs,c[0],c[1],c[2],255); }
    }
  }

  const gold = hexToRgbArray(PALETTE.gold), wallDark = hexToRgbArray(PALETTE.wallDark);
  const playerCol = [88,128,92];
  const playerTriCol = [42,42,42];
  const uniR = Math.max(6, Math.floor(cs * 0.9));
  d.rooms.filter(r=>r.role==="entrance"||r.role==="exit").forEach(r=>{
    if(!r.stairWall) return;
    if (discoveryEnabled) {
      const mx = (r.stairWall.x1 + r.stairWall.x2)/2, my = (r.stairWall.y1 + r.stairWall.y2)/2;
      if (!shouldDrawCell(Math.floor(mx), Math.floor(my), discovery, newlySet, animProgress, cfg)) return;
    }
    const sw=r.stairWall;
    const mx=(sw.x1+sw.x2)/2, my=(sw.y1+sw.y2)/2;
    const cx=Math.floor(ox+mx*cs), cy=Math.floor(oy+my*cs);
    if (r.role==="exit") {
      fillCircle(buf,w,h,cx,cy,uniR, wallDark[0],wallDark[1],wallDark[2],255);
      // triangle down approx
      fillRect(buf,w,h,cx-2,cy,4,3,gold[0],gold[1],gold[2],255);
    } else {
      fillCircle(buf,w,h,cx,cy,uniR, gold[0],gold[1],gold[2],255);
      fillRect(buf,w,h,cx-2,cy-2,4,3,wallDark[0],wallDark[1],wallDark[2],255);
    }
  });

  if(player){
    const px=Math.floor(ox+player.x*cs), py=Math.floor(oy+player.y*cs);
    fillCircle(buf,w,h,px,py,uniR,playerCol[0],playerCol[1],playerCol[2],255);
    const pDir = [42,42,42];
    fillCircle(buf,w,h,px,py,Math.floor(uniR*0.5), pDir[0],pDir[1],pDir[2],230);
  }

  if (cfg.trail.enabled && discovery) {
    const path = discovery.getPath ? discovery.getPath() : [];
    const trailRgb = Array.isArray(cfg.trail.color) ? cfg.trail.color : [201,168,76];
    const trailAlpha = Math.floor((cfg.trail.opacity ?? 0.5) * 255);
    for (let i=0;i<path.length-1;i++) {
      const a = path[i], b = path[i+1];
      if (cfg.trail.onlyDiscovered && (!discovery.isDiscovered(a.x,a.y) || !discovery.isDiscovered(b.x,b.y))) continue;
      if (Math.hypot(b.x-a.x, b.y-a.y) > 2) continue;
      if (!shouldDrawCell(a.x,a.y,discovery,newlySet,animProgress,cfg) && !shouldDrawCell(b.x,b.y,discovery,newlySet,animProgress,cfg)) continue;
      const ax = Math.floor(ox + a.x*cs + cs*0.5), ay = Math.floor(oy + a.y*cs + cs*0.5);
      const bx = Math.floor(ox + b.x*cs + cs*0.5), by = Math.floor(oy + b.y*cs + cs*0.5);
      const steps = Math.max(Math.abs(bx-ax), Math.abs(by-ay));
      for (let s=0;s<=steps;s++) {
        if (cfg.trail.dash && cfg.trail.dash.length===2) {
          const dashLen = cfg.trail.dash[0] + cfg.trail.dash[1];
          if ((s % dashLen) >= cfg.trail.dash[0]) continue;
        }
        const x = Math.floor(ax + (bx-ax)*s/steps);
        const y = Math.floor(ay + (by-ay)*s/steps);
        if (x>=0&&y>=0&&x<w&&y<h) setPixel(buf,w,x,y,trailRgb[0],trailRgb[1],trailRgb[2],trailAlpha);
      }
    }
  }

  const items = Object.entries(PALETTE.roles).filter(([k])=>k!=="corridor").map(([k,c])=>[ROLE_DISPLAY[k]||k, hexToRgbArray(c)]);
  const swatch=L.legend.swatch, gap=L.legend.gap, itemW=L.legend.itemWidth;
  const totalW = items.length*itemW - gap;
  let lx = Math.max(20, Math.floor((w - totalW)/2));
  const ly = oy + gridH + 16;
  items.forEach(([label,col])=>{
    fillRect(buf,w,h,lx,ly-7,swatch,swatch,col[0],col[1],col[2],255);
    lx+=itemW;
  });

  return buf;
}
