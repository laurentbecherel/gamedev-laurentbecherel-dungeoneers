import { getConfig } from "./config/config.js";

(async () => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("game-hud");

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / 640, vh / 360);
    canvas.style.width = Math.floor(640 * scale) + "px";
    canvas.style.height = Math.floor(360 * scale) + "px";
  }
  window.addEventListener("resize", resize); resize();

  function drawPlaceholder() {
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#1a1a1a";
    for (let y = 0; y < 360; y += 4) ctx.fillRect(0, y, 640, 1);
    ctx.fillStyle = "#c9a84c"; ctx.font = "bold 28px Inter, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("DUNGEONEERS", 320, 155);
    ctx.fillStyle = "#6b6760"; ctx.font = "14px Inter, sans-serif";
    ctx.fillText("Foundation Engine — No gameplay yet", 320, 185);
    ctx.fillStyle = "#3a3a3a"; ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.fillText("640 × 360 internal resolution · scaled to viewport", 320, 215);
  }
  drawPlaceholder();

  try {
    const cfg = await getConfig();
    console.log("Config loaded:", cfg);
    hud.textContent = `v${cfg.version} · ${cfg.renderer.resolution} · speed ${cfg.player.moveSpeed} · map ${cfg.generator.mapW}×${cfg.generator.mapH}`;
  } catch (e) {
    hud.textContent = "Config unavailable — using defaults";
    console.warn(e);
  }
})();