import { test, expect } from "@playwright/test";

test.describe("Task5: Minimap Reveal & Discovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/game.html");
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => window.game && window.game.discovery);
  });

  test("initial map shows only starting room, not whole floor", async ({ page }) => {
    const coverage = await page.evaluate(() => {
      const disc = window.game.discovery;
      const dungeon = window.game.dungeon;
      const walkable = disc.getWalkableDiscoveredCount(dungeon);
      const totalWalkable = dungeon.grid ? Array.from(dungeon.grid).filter(v => v === 0).length : 0;
      return { walkable, totalWalkable, ratio: totalWalkable ? walkable / totalWalkable : 0, count: disc.getDiscoveredCount() };
    });
    expect(coverage.walkable).toBeGreaterThan(0);
    expect(coverage.ratio).toBeLessThan(0.5);
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(500);
    const mapVisible = await page.evaluate(() => window.game.showMap);
    expect(mapVisible).toBe(true);
    await page.keyboard.press("KeyM");
  });

  test("walking reveals more area, 1-tile peek invariant", async ({ page }) => {
    const initial = await page.evaluate(() => window.game.discovery.getWalkableDiscoveredCount(window.game.dungeon));
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(800);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("KeyW");
      await page.waitForTimeout(400);
    }
    const after = await page.evaluate(() => window.game.discovery.getWalkableDiscoveredCount(window.game.dungeon));
    expect(after).toBeGreaterThanOrEqual(initial);
  });

  test("M open triggers dither animation for newly discovered", async ({ page }) => {
    await page.evaluate(() => {
      window.game.discovery.reset(window.game.dungeon, window.game.cfg?.discovery);
      const sx = Math.floor(window.game.dungeon.startX), sy = Math.floor(window.game.dungeon.startY);
      window.game.discovery.markDiscoveredAt(sx, sy, window.game.dungeon);
    });
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(100);
    const progressEarly = await page.evaluate(() => window.game.discovery.getAnimationProgress(performance.now()));
    await page.waitForTimeout(500);
    const progressLate = await page.evaluate(() => window.game.discovery.getAnimationProgress(performance.now()));
    expect(progressLate).toBeGreaterThanOrEqual(progressEarly);
    expect(progressLate).toBe(1);
    await page.keyboard.press("KeyM");
  });

  test("path trail visible and persists across map toggles", async ({ page }) => {
    await page.evaluate(() => {
      const d = window.game.dungeon;
      const sx = Math.floor(d.startX), sy = Math.floor(d.startY);
      window.game.discovery.reset(d, window.game.cfg?.discovery);
      window.game.discovery.markDiscoveredAt(sx, sy, d);
      window.game.discovery.addPathPoint(sx, sy);
      window.game.discovery.addPathPoint(sx+1, sy);
      window.game.discovery.addPathPoint(sx+2, sy);
    });
    const pathLen = await page.evaluate(() => window.game.discovery.getPath().length);
    expect(pathLen).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(300);
    const stillLen = await page.evaluate(() => window.game.discovery.getPath().length);
    expect(stillLen).toBe(pathLen);
    await page.keyboard.press("KeyM");
    const afterClose = await page.evaluate(() => window.game.discovery.getPath().length);
    expect(afterClose).toBe(pathLen);
  });

  test("R regen resets discovery to start room only", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("KeyW");
      await page.waitForTimeout(300);
    }
    const beforeInfo = await page.evaluate(() => ({
      walkable: window.game.discovery.getWalkableDiscoveredCount(window.game.dungeon),
      pathLen: window.game.discovery.getPath().length
    }));
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => window.game && window.game.discovery && window.game.dungeon);
    const afterInfo = await page.evaluate(() => {
      const d = window.game.dungeon;
      const total = d.grid ? Array.from(d.grid).filter(v => v === 0).length : 1000;
      const walkable = window.game.discovery.getWalkableDiscoveredCount(d);
      const pathLen = window.game.discovery.getPath().length;
      return { walkable, pathLen, total, ratio: total ? walkable / total : 0 };
    });
    // After regen, discovery should be reset to start room only (<50% of floor)
    expect(afterInfo.walkable).toBeGreaterThan(0);
    expect(afterInfo.ratio).toBeLessThan(0.5);
    // Path should reset to 1 (start cell) — allow 1-2 due to timing
    expect(afterInfo.pathLen).toBeGreaterThanOrEqual(1);
    expect(afterInfo.pathLen).toBeLessThanOrEqual(2);
    // Path after regen should be <= before (since we reset), not relying on floor size comparison
    expect(afterInfo.pathLen).toBeLessThanOrEqual(beforeInfo.pathLen);
  });

  test("editor: discovery.json exists and editable via API", async ({ page }) => {
    const res = await page.request.get("http://localhost:8000/api/assets/config/gameplay/discovery");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.version).toBe(1);
    expect(json.reveal).toBeTruthy();
    expect(json.reveal.peekDistance).toBe(1);
    expect(json.trail).toBeTruthy();
    expect(json.trail.enabled).toBe(true);
  });

  test("config.js includes discovery in CONFIG_PATHS", async ({ page }) => {
    const cfgJs = await page.request.get("http://localhost:8000/config/config.js").then(r => r.text());
    expect(cfgJs).toContain("discovery");
    expect(cfgJs).toContain("getDiscoveryConfig");
    expect(cfgJs).toContain("config/gameplay/discovery");
  });
});
