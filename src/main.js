import { Game } from "./core/game.js";
import { isWebGL2Supported } from "./render/renderer-gpu.js";

(async () => {
  const canvas = document.getElementById("game-canvas");
  const hud = document.getElementById("game-hud");
  if (!isWebGL2Supported()) {
    hud.textContent = "WebGL2 not supported — please use a modern browser";
    hud.style.display = "block";
    return;
  }
  const game = new Game(canvas);
  try { window.game = game; console.log("Game exposed early in main.js"); } catch(e) {}
  try {
    await game.init();
    // Expose for E2E tests - critical for Task4 bob verification
    try { window.game = game; window._gamePlayer = game.player; window._gameRenderer = game.renderer; } catch(e) { console.warn("expose failed", e); }
    console.log("Game exposed for E2E", !!window.game);
    game.start();
  } catch (e) {
    console.error("Game init failed", e);
    hud.textContent = "Initialization failed — check console";
    hud.style.display = "block";
  }
})();