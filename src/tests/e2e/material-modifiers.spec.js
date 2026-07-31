import { test, expect } from '@playwright/test';

test('task9 material modifiers exist and alter PBR', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/game.html');
  await page.waitForSelector('#game-canvas');
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => window._gameDungeon && window._gameDungeon.modifiers);
  // Config fetch via API
  const modCfg = await page.evaluate(async () => {
    const r = await fetch('/api/assets/config/rendering/material-modifiers');
    return r.ok ? await r.json() : null;
  });
  expect(modCfg).not.toBeNull();
  expect(modCfg.version).toBe(1);
  expect(modCfg.enabled).toBe(true);
  const keys = Object.keys(modCfg.modifiers || {});
  expect(keys).toContain('moss');
  expect(keys).toContain('damaged');
  expect(keys).toContain('water');
  expect(keys).toContain('puddle');
  expect(keys).toContain('blood');
  expect(keys).toContain('dust');
  expect(keys.length).toBeGreaterThanOrEqual(6);

  // Shader contains noise compilation and modifiers
  const shaderInfo = await page.evaluate(async () => {
    const r = await fetch('/game.html');
    const html = await r.text();
    // Fetch shaders.js source via import? easier fetch directly
    const s = await fetch('/render/shaders.js');
    const txt = await s.text();
    return {
      hasModHash: txt.includes('modHash'),
      hasModNoise: txt.includes('modNoise'),
      hasModFBM: txt.includes('modFBM'),
      hasApply: txt.includes('applyMaterialModifiers'),
      hasMoss: txt.toLowerCase().includes('moss'),
      hasBlood: txt.toLowerCase().includes('blood'),
      hasPuddle: txt.toLowerCase().includes('puddle'),
      hasAO: txt.includes('ao'),
      hasHeight: txt.includes('height'),
      hasRough: txt.includes('rough'),
      uModEnabled: txt.includes('u_modEnabled'),
      uModTexA: txt.includes('u_modTexA')
    };
  });
  expect(shaderInfo.hasModHash).toBe(true);
  expect(shaderInfo.hasModNoise).toBe(true);
  expect(shaderInfo.hasModFBM).toBe(true);
  expect(shaderInfo.hasApply).toBe(true);
  expect(shaderInfo.uModEnabled).toBe(true);
  expect(shaderInfo.uModTexA).toBe(true);

  // Renderer has modifiersEnabled and toggle
  const rendererInfo = await page.evaluate(() => {
    const r = window._gameRenderer;
    return {
      hasModEnabled: typeof r.modifiersEnabled !== 'undefined',
      hasModTexA: !!r.modTexA,
      hasModTexB: !!r.modTexB,
      modMapSize: r.modMapSize
    };
  });
  expect(rendererInfo.hasModEnabled).toBe(true);
  expect(rendererInfo.hasModTexA).toBe(true);
  expect(rendererInfo.hasModTexB).toBe(true);

  // Generator spreading intelligence
  const genInfo = await page.evaluate(() => {
    const m = window._gameDungeon.modifiers;
    const avgs = m.roomAvgs;
    const mossBest = avgs.reduce((a,b)=> a.avg.moss > b.avg.moss ? a : b);
    const bloodBest = avgs.reduce((a,b)=> a.avg.blood > b.avg.blood ? a : b);
    const dustBest = avgs.reduce((a,b)=> a.avg.dust > b.avg.dust ? a : b);
    return {
      rooms: avgs.length,
      mossBestVal: mossBest.avg.moss,
      bloodBestVal: bloodBest.avg.blood,
      dustBestVal: dustBest.avg.dust,
      bloodRole: bloodBest.role,
      dustRole: dustBest.role
    };
  });
  expect(genInfo.rooms).toBeGreaterThan(4);
  expect(genInfo.mossBestVal).toBeGreaterThan(0.15);
  expect(genInfo.bloodBestVal).toBeGreaterThan(0.10);
  expect(genInfo.dustBestVal).toBeGreaterThan(0.40);
  // blood should be in guardian/armory/hub ideally, dust in treasure/secret/shrine
  console.log('genInfo', genInfo);

  // Toggle Key9
  await page.keyboard.press('Digit9');
  await page.waitForTimeout(600);
  const hud1 = await page.evaluate(() => document.getElementById('game-hud')?.textContent || '');
  console.log('HUD after 9', hud1);
  expect(hud1.toLowerCase()).toContain('modifiers');
  await page.keyboard.press('Digit9');
  await page.waitForTimeout(600);

  // Ensure no console errors
  const serious = errors.filter(e => !e.includes('favicon') && !e.includes('fonts') && !e.includes('Failed to load resource'));
  expect(serious.length).toBe(0);
});
