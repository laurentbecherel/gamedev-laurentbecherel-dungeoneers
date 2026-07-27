import { getConfig, getGeneratorConfig } from "./config/config.js";
import { generateDungeon } from "./world/dungeon/index.js";
import { MinimapRenderer } from "./render/minimap.js";

(async () => {
  const canvas = document.getElementById("game-canvas");
  const hud = document.getElementById("game-hud");

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / 640, vh / 360);
    canvas.style.width = Math.floor(640 * scale) + "px";
    canvas.style.height = Math.floor(360 * scale) + "px";
  }
  window.addEventListener("resize", resize); resize();

  let cfg, minimap, dungeon, currentMode = "role";

  function updateHud() {
    if (hud) hud.style.display = "none";
  }

  async function loadMinimapFont(minimapCfg) {
    if (!minimapCfg?.fontGoogleName) return;
    let link = document.getElementById('minimap-font');
    if (!link) {
      link = document.createElement('link');
      link.id = 'minimap-font';
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${minimapCfg.fontGoogleName}&display=swap`;
      document.head.appendChild(link);
      // Wait for stylesheet to load before attempting font load
      await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 800); });
    }
    // Wait for font to load — load multiple weights/sizes used in canvas
    const family = minimapCfg.fontFamily || 'Georgia';
    const q = `"${family}"`;
    try {
      await Promise.all([
        document.fonts.load(`12px ${q}`),
        document.fonts.load(`bold 12px ${q}`),
        document.fonts.load(`10px ${q}`),
        document.fonts.load(`bold 16px ${q}`),
      ]);
      await document.fonts.ready;
      // Extra tick to ensure canvas picks it up on first render
      await new Promise(r => setTimeout(r, 50));
    } catch {}
  }

  async function regen(seedOverride = null) {
    try {
      const baseCfg = await getConfig();
      const genCfg = await getGeneratorConfig();
      cfg = {...baseCfg, generator: genCfg, items: genCfg.items, torchColors: genCfg.torchColors, boundaryWallId: genCfg.boundaryWallId};
      // Load minimap font dynamically from config and wait for it
      await loadMinimapFont(baseCfg.minimap);
      dungeon = await generateDungeon(cfg, seedOverride);
      console.log("Dungeon generated:", dungeon.seed, dungeon.w+"x"+dungeon.h, dungeon.rooms.length+" rooms", dungeon.meta.rolesSummary);
      const fontFamily = baseCfg.minimap?.fontFamily || "Georgia";
      const fontFallback = baseCfg.minimap?.fontFallback || "serif";
      if (!minimap) minimap = new MinimapRenderer(canvas, dungeon, { fontFamily, fontFallback });
      else { minimap.setFont(fontFamily, fontFallback); minimap.setDungeonMap(dungeon); }
      minimap.setMode(currentMode);
      updateHud();
    } catch (e) {
      console.error("Generation failed", e);
      hud.textContent = "Generation failed — check console";
    }
  }

  await regen();

  window.addEventListener("keydown", async (e) => {
    if (e.key === "r" || e.key === "R") { await regen(null); }
    else if (e.key === "1") { currentMode = "role"; minimap?.setMode("role"); updateHud(); }
    else if (e.key === "2") { currentMode = "zone"; minimap?.setMode("zone"); updateHud(); }
    else if (e.key === "3") { currentMode = "material"; minimap?.setMode("material"); updateHud(); }
    else if (e.key === "+" || e.key === "=") { minimap?.setZoom((minimap.zoom||1)*1.2); updateHud(); }
    else if (e.key === "-" || e.key === "_") { minimap?.setZoom((minimap.zoom||1)/1.2); updateHud(); }
  });
})();