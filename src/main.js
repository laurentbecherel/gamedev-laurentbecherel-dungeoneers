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
  try {
    await game.init();
    game.start();
  } catch (e) {
    console.error("Game init failed", e);
    hud.textContent = "Initialization failed — check console";
    hud.style.display = "block";
  }
})();