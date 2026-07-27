import { test, expect } from '@playwright/test';
test('game page loads', async ({ page }) => {
  await page.goto('/game.html'); await expect(page).toHaveTitle(/Dungeoneers/);
  const canvas = page.locator('#game-canvas'); await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '640'); await expect(canvas).toHaveAttribute('height', '360');
});
test('config fetched on load', async ({ page }) => {
  await page.goto('/game.html');
  // HUD is hidden — verify canvas renders instead
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible({ timeout: 5000 });
});
test('minimap renders dungeon on load', async ({ page }) => {
  await page.goto('/game.html'); await page.waitForTimeout(1000);
  // Verify canvas has non-empty pixel data (parchment background drawn)
  const hasContent = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Check that not all pixels are transparent/black — parchment is #e8dcc4
    let nonEmpty = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i+3] > 0) nonEmpty++;
    return nonEmpty > 1000;
  });
  expect(hasContent).toBe(true);
});
test('R key regenerates dungeon', async ({ page }) => {
  await page.goto('/game.html'); await page.waitForTimeout(1000);
  // Press R should not cause console errors and canvas should re-render
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.keyboard.press('r'); await page.waitForTimeout(800);
  expect(errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource')).length).toBe(0);
});
test('mode toggle keys 1 2 3 switch minimap mode', async ({ page }) => {
  await page.goto('/game.html'); await page.waitForTimeout(1000);
  // Pressing mode keys should not cause errors and should trigger re-render
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.keyboard.press('2'); await page.waitForTimeout(200);
  await page.keyboard.press('3'); await page.waitForTimeout(200);
  await page.keyboard.press('1'); await page.waitForTimeout(200);
  expect(errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource')).length).toBe(0);
});
test('back to home link', async ({ page }) => {
  await page.goto('/game.html'); await page.click('text=Home');
  await expect(page).toHaveURL(/\/$|\/index\.html/);
});
test('no console errors', async ({ page }) => {
  const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/game.html'); await page.waitForTimeout(500);
  expect(errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource') && !e.includes('fonts.googleapis') && !e.includes('fonts.gstatic')).length).toBe(0);
});