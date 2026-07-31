// Backward compat shim — delegates to new sprites.js Task 6
// Old tasks expected items.js with generateDungeonItems.
// Now generate sprites + lights with richer logic.

import { generateDungeonSprites, generateDungeonItems as gen } from "./sprites.js";

export function generateDungeonItems(dungeon, config) {
  // Preserve old API shape plus new sprites field for newer consumers
  return gen(dungeon, config);
}

// Also export new name
export { generateDungeonSprites };
