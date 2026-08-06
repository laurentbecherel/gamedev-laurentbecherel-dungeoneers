import { test, expect } from '@playwright/test';

test('architecture editor previews every architecture/type with PBR channels', async ({ page }) => {
  await page.goto('/editor.html');
  await page.locator('.tree-file[data-cat="materials"][data-name="architectures"]').click();
  const preview = page.locator('.architecture-preview');
  await expect(preview).toHaveAttribute('data-preview-ready', 'true', { timeout: 10000 });
  await expect(preview.locator('.architecture-preview-group')).toHaveCount(6);
  await expect(preview.locator('.architecture-type-card')).toHaveCount(30);
  await expect(preview.locator('canvas[data-surface]')).toHaveCount(166);
  const firstTexture = await preview.locator('canvas[data-surface]').first().boundingBox();
  expect(firstTexture.width).toBeGreaterThanOrEqual(90);
  await expect(preview).toContainText('timber_planks');
  await expect(preview).toContainText('cellar_fieldstone');
  await expect(preview).toContainText('exposed_cave_earth');
  await expect(preview).toContainText('raw_cave_rock');
  await expect(preview).toContainText('reinforced_dressed_wall');
  await expect(preview).toContainText('packed_grotto_dirt');
  await expect(preview).toContainText('large_limestone_flags');
  await expect(preview).toContainText('wide_timber_boards');
  await preview.locator('button[data-mode="normal"]').click();
  await expect(preview).toHaveAttribute('data-preview-mode', 'normal');
  await preview.locator('button[data-mode="pbr"]').click();
  await preview.locator('input[aria-label="Fake PBR light angle"]').fill('120');
  await expect(preview).toHaveAttribute('data-preview-mode', 'pbr');
});

test('forced grotto renders earthen floor layers from the expanded GPU array', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForFunction(() => window.game?.dungeon?.meta?.architecturePlan && window.game?.renderer?.isReady(), null, { timeout: 20000 });
  await page.evaluate(async () => {
    const game = window.game;
    game._architectureOverrideId = 'natural_grotto';
    await game.regen(game.dungeon.seed);
  });
  await page.waitForFunction(() => window.game?.dungeon?.meta?.architecturePlan?.dominant === 'natural_grotto' && window.game?.renderer?.isReady(), null, { timeout: 20000 });
  const state = await page.evaluate(() => ({
    floorCount: window.game.renderer.materialInfo.floorCount,
    rendererType: window.game.renderer.type,
    floors: [...new Set(window.game.dungeon.rooms.map(room => room.floorMat))],
    walls: [...new Set(window.game.dungeon.rooms.map(room => room.wallMat))],
    ceilings: [...new Set(window.game.dungeon.rooms.map(room => room.ceilMat))],
    allGrotto: window.game.dungeon.rooms.every(room => room.architecture === 'natural_grotto')
  }));
  if (state.rendererType !== 'fallback2d') expect(state.floorCount).toBe(17);
  expect(state.allGrotto).toBe(true);
  expect(state.floors.some(id => [11,12,16].includes(id))).toBe(true);
  expect(state.walls.some(id => id >= 9)).toBe(true);
  expect(state.ceilings.some(id => id >= 9)).toBe(true);
});

test('game toggles rendered PBR view to architecture/type ID grid', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForFunction(() => window.game?.dungeon?.architectureMap && window.game?.renderer?.isReady(), null, { timeout: 20000 });
  const toggle = page.locator('#architecture-debug-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#architecture-debug-canvas')).toBeVisible();
  await expect(page.locator('#architecture-debug-legend')).toContainText('A');
  const state = await page.evaluate(() => ({
    visible: window.game.architectureDebug.visible,
    architectureCells: window.game.dungeon.architectureMap.length,
    typeCells: window.game.dungeon.typeMap.length,
    size: window.game.dungeon.w * window.game.dungeon.h,
    roomIds: window.game.dungeon.rooms.every(room => room.architectureId > 0 && room.typeId > 0)
  }));
  expect(state.visible).toBe(true);
  expect(state.architectureCells).toBe(state.size);
  expect(state.typeCells).toBe(state.size);
  expect(state.roomIds).toBe(true);
  await page.keyboard.press('i');
  await expect(page.locator('#architecture-debug-canvas')).toBeHidden();
});

test('key 1 toggles the in-world 3D construction grid with architecture/type data', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForFunction(() => window.game?.dungeon?.architectureMap && window.game?.renderer?.isReady(), null, { timeout: 20000 });
  await page.keyboard.press('1');
  await expect.poll(() => page.evaluate(() => window.game.renderer.gridDebug)).toBe(1);
  const state = await page.evaluate(() => ({
    architectures: new Set(window.game.dungeon.architectureMap).size,
    types: new Set(window.game.dungeon.typeMap).size,
    hasArchitectureIds: window.game.dungeon.architectureMap.some(id => id > 0),
    hasTypeIds: window.game.dungeon.typeMap.some(id => id > 0),
    overviewVisible: window.game.architectureDebug.visible
  }));
  expect(state.hasArchitectureIds).toBe(true);
  expect(state.hasTypeIds).toBe(true);
  expect(state.overviewVisible).toBe(false);
  await page.keyboard.press('1');
  await expect.poll(() => page.evaluate(() => window.game.renderer.gridDebug)).toBe(0);
});

test('H cycles architecture with stable topology and rebuilds its palette', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForFunction(() => window.game?.dungeon?.meta?.architecturePlan && window.game?.renderer?.isReady(), null, { timeout: 20000 });
  await page.evaluate(() => {
    const { dungeon, player, discovery } = window.game;
    let step = null;
    for (let y=1; y<dungeon.h-1 && !step; y++) for (let x=1; x<dungeon.w-1 && !step; x++) {
      if (dungeon.grid[y*dungeon.w+x] !== 0) continue;
      for (const [dx,dy,angle,facing] of [[1,0,0,1],[-1,0,Math.PI,3],[0,1,Math.PI/2,2],[0,-1,-Math.PI/2,0]]) {
        if (dungeon.grid[(y+dy)*dungeon.w+x+dx] === 0) { step={x,y,dx,dy,angle,facing}; break; }
      }
    }
    const sx=step.x+.5, sy=step.y+.5, progress=.2, eased=progress*progress*(3-2*progress);
    player.setPosition(sx,sy,step.angle);
    player.gridMode=true; player.gridFacing=step.facing; player.gridMoveSpeed=.05;
    player._gridStartX=sx; player._gridStartY=sy;
    player.gridTargetX=sx+step.dx; player.gridTargetY=sy+step.dy;
    player.moveLerp=progress; player.x=sx+step.dx*eased; player.y=sy+step.dy*eased;
    player.bobPhase=1.25; player.bobAmount=.6;
    const distant=dungeon.rooms[dungeon.rooms.length-1];
    discovery.markDiscoveredAt(Math.floor(distant.cx),Math.floor(distant.cy),dungeon);
  });
  const before = await page.evaluate(() => ({
    seed: window.game.dungeon.seed,
    dominant: window.game.dungeon.meta.architecturePlan.dominant,
    rooms: window.game.dungeon.rooms.map(room => [room.x, room.y, room.w, room.h, room.role]),
    palette: window.game.renderer.paletteCfgFull?.accentRamps?.map(ramp => ramp.id),
    discovered: window.game.discovery.getAllDiscovered().length,
    player: { x:window.game.player.x, y:window.game.player.y, angle:window.game.player.angle, gridMode:window.game.player.gridMode,
      targetX:window.game.player.gridTargetX, targetY:window.game.player.gridTargetY,
      startX:window.game.player._gridStartX, startY:window.game.player._gridStartY,
      moveLerp:window.game.player.moveLerp, gridMoveSpeed:window.game.player.gridMoveSpeed }
  }));
  await page.keyboard.press('h');
  await page.waitForFunction(previous => {
    const game = window.game;
    return !game?._architectureCycleBusy && game?.dungeon?.meta?.architecturePlan?.forced && game.dungeon.meta.architecturePlan.dominant !== previous;
  }, before.dominant, { timeout: 20000 });
  const after = await page.evaluate(() => ({
    seed: window.game.dungeon.seed,
    dominant: window.game.dungeon.meta.architecturePlan.dominant,
    forced: window.game.dungeon.meta.architecturePlan.forced,
    rooms: window.game.dungeon.rooms.map(room => [room.x, room.y, room.w, room.h, room.role]),
    palette: window.game.renderer.paletteCfgFull?.accentRamps?.map(ramp => ramp.id),
    discovered: window.game.discovery.getAllDiscovered().length,
    player: { x:window.game.player.x, y:window.game.player.y, angle:window.game.player.angle, gridMode:window.game.player.gridMode,
      targetX:window.game.player.gridTargetX, targetY:window.game.player.gridTargetY,
      startX:window.game.player._gridStartX, startY:window.game.player._gridStartY,
      moveLerp:window.game.player.moveLerp, gridMoveSpeed:window.game.player.gridMoveSpeed }
  }));
  expect(after.seed).toBe(before.seed);
  expect(after.rooms).toEqual(before.rooms);
  expect(after.dominant).not.toBe(before.dominant);
  expect(after.forced).toBe(true);
  expect(after.palette).not.toEqual(before.palette);
  expect(after.discovered).toBeGreaterThanOrEqual(before.discovered);
  expect(after.player.gridMode).toBe(true);
  expect(after.player.targetX).toBe(before.player.targetX);
  expect(after.player.targetY).toBe(before.player.targetY);
  expect(after.player.startX).toBe(before.player.startX);
  expect(after.player.startY).toBe(before.player.startY);
  expect(after.player.gridMoveSpeed).toBe(.05);
  expect(after.player.moveLerp).toBeGreaterThanOrEqual(before.player.moveLerp);
  expect(after.player.moveLerp).toBeLessThan(1);

  await page.keyboard.press('Shift+h');
  await page.waitForFunction(() => !window.game?._architectureCycleBusy && window.game?.dungeon?.meta?.architecturePlan?.forced === false, null, { timeout: 20000 });
  expect(await page.evaluate(() => window.game._architectureOverrideId)).toBe(null);
  const resetPlayer = await page.evaluate(() => ({
    gridMode:window.game.player.gridMode, targetX:window.game.player.gridTargetX, targetY:window.game.player.gridTargetY,
    startX:window.game.player._gridStartX, startY:window.game.player._gridStartY,
    moveLerp:window.game.player.moveLerp, gridMoveSpeed:window.game.player.gridMoveSpeed,
    discovered:window.game.discovery.getAllDiscovered().length
  }));
  expect(resetPlayer.gridMode).toBe(true);
  expect(resetPlayer.targetX).toBe(before.player.targetX);
  expect(resetPlayer.targetY).toBe(before.player.targetY);
  expect(resetPlayer.startX).toBe(before.player.startX);
  expect(resetPlayer.startY).toBe(before.player.startY);
  expect(resetPlayer.gridMoveSpeed).toBe(.05);
  expect(resetPlayer.moveLerp).toBeGreaterThan(after.player.moveLerp);
  expect(resetPlayer.moveLerp).toBeLessThan(1);
  expect(resetPlayer.discovered).toBeGreaterThanOrEqual(before.discovered);
});
