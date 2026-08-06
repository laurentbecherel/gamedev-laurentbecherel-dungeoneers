import { test, expect } from '@playwright/test';

test('sewer track compiles into floor channels, opaque grille endpoints, and GPU feature data', async ({ page }) => {
  const shaderErrors = [];
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && /shader|compile|validation/i.test(text)) shaderErrors.push(text);
  });

  await page.goto('/game.html');
  await page.waitForFunction(() => window.game?.renderer?.ready && window.game?.dungeon?.featureCells, null, { timeout: 10000 });

  const runtime = await page.evaluate(() => {
    const { dungeon, renderer, player } = window.game;
    const feature = dungeon.features?.[0];
    if (!feature) return { featureCount: 0 };

    const kinds = Array.from(dungeon.featureCells, word => word & 0xff);
    const midpoint = feature.floorCells[Math.floor(feature.floorCells.length / 2)];
    const x = midpoint % dungeon.w;
    const y = Math.floor(midpoint / dungeon.w);
    player.setPosition(x + 0.5, y + 0.5, feature.axis === 'east-west' ? 0 : Math.PI * 0.5);

    return {
      featureCount: dungeon.features.length,
      floorCellCount: feature.floorCells.length,
      channelCellCount: kinds.filter(kind => kind === 1).length,
      grilleCellCount: kinds.filter(kind => kind === 2).length,
      endpointWallsOpaque: feature.endpoints.every(endpoint => dungeon.grid[endpoint.cellIndex] > 0),
      gpuActive: !!renderer.device,
      featureBufferPresent: !!renderer.buffers?.featureCells,
      featureUniformPresent: !!renderer.buffers?.featureUniform,
      grilleLayer: renderer.featureMaterialLayers?.grille,
      liningLayer: renderer.featureMaterialLayers?.lining,
    };
  });

  await page.waitForTimeout(250);
  const playerGround = await page.evaluate(() => window.game.player.groundHeight);

  expect(runtime.featureCount).toBe(1);
  expect(runtime.floorCellCount).toBeGreaterThanOrEqual(5);
  expect(runtime.channelCellCount).toBe(runtime.floorCellCount);
  expect(runtime.grilleCellCount).toBe(2);
  expect(runtime.endpointWallsOpaque).toBe(true);
  if (runtime.gpuActive) {
    expect(runtime.featureBufferPresent).toBe(true);
    expect(runtime.featureUniformPresent).toBe(true);
    expect(runtime.grilleLayer).toBeGreaterThan(0);
    expect(runtime.liningLayer).toBeGreaterThan(0);
  }
  expect(playerGround).toBeLessThan(-0.1);

  await page.keyboard.press('k');
  await expect.poll(() => page.evaluate(() => window.game.renderer.pbrDebugMode)).toBe(8);
  await page.keyboard.press('Shift+k');
  await page.waitForTimeout(250);
  const focus = await page.evaluate(() => {
    const game = window.game;
    const feature = game.dungeon.features[0];
    const mid = feature.floorCells[Math.floor(feature.floorCells.length * 0.5)];
    const tx = (mid % game.dungeon.w) + 0.5;
    const ty = Math.floor(mid / game.dungeon.w) + 0.5;
    return {
      mode: game.renderer.pbrDebugMode,
      distance: Math.hypot(game.player.x - tx, game.player.y - ty),
    };
  });
  expect(focus.mode).toBe(8);
  expect(focus.distance).toBeLessThanOrEqual(2.1);
  expect(shaderErrors, shaderErrors.join('\n')).toEqual([]);
});
