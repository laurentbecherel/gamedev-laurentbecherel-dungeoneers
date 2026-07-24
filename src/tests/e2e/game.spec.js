import { test, expect } from '@playwright/test';
test('game page loads', async ({ page }) => {
  await page.goto('/game.html'); await expect(page).toHaveTitle(/Dungeoneers/);
  const canvas = page.locator('#game-canvas'); await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '640'); await expect(canvas).toHaveAttribute('height', '360');
});
test('config fetched on load', async ({ page }) => {
  await page.goto('/game.html'); await expect(page.locator('#game-hud')).not.toContainText('Loading', { timeout: 5000 });
  const txt = await page.locator('#game-hud').textContent(); expect(txt.length).toBeGreaterThan(0);
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