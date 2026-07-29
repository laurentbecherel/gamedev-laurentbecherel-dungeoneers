import { test, expect } from '@playwright/test';
test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Dungeoneers/);
  await expect(page.locator('h1')).toContainText('DUNGEONEERS');
  await expect(page.locator('text=Play Game')).toBeVisible();
  await expect(page.locator('text=Open Editor')).toBeVisible();
});
test('Play Game link navigates', async ({ page }) => {
  await page.goto('/'); await page.click('text=Play Game');
  await expect(page).toHaveURL(/game\.html/);
});
test('Open Editor link navigates', async ({ page }) => {
  await page.goto('/'); await page.click('text=Open Editor');
  await expect(page).toHaveURL(/editor\.html/);
});
test('no console errors', async ({ page }) => {
  const errors=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/'); await page.waitForTimeout(500);
  // Filter out external resource failures (fonts, favicon, CDN) which are environment-dependent
  const relevant = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('Failed to load resource') &&
    !e.includes('fonts.googleapis') &&
    !e.includes('fonts.gstatic') &&
    !e.includes('net::ERR') &&
    !e.includes('404')
  );
  expect(relevant.length).toBe(0);
});
