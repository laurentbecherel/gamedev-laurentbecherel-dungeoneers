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
    // Never hang forever on "Loading config…" – shader link can take 30-40s on ANGLE after heavy modifiers, so allow 90s
    const timeoutMs = 90000;
    const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('game.init timeout after '+timeoutMs+'ms – likely shader link slow or fetch hung, check console [config] [GL] logs')), timeoutMs));
    await Promise.race([game.init(), timeoutPromise]);
    // Expose for E2E tests - critical for Task4 bob verification + Task6 sprites/lights
    try { window.game = game; window._gamePlayer = game.player; window._gameRenderer = game.renderer; window._gameDungeon = game.dungeon; } catch(e) { console.warn("expose failed", e); }
    console.log("Game exposed for E2E", !!window.game);
    game.start();
  } catch (e) {
    console.error("Game init failed", e);
    const msg = (e && e.message) ? e.message : String(e);
    if(msg.includes('timeout') || msg.includes('not found')){
      hud.textContent = "Init stuck: " + msg + " — is server running on :8000? Check console [config] logs";
    }else{
      hud.textContent = "Initialization failed — check console: " + msg.slice(0,200);
    }
    hud.style.display = "block";
  }
})();