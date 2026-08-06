import { test, expect } from '@playwright/test';
test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Dungeoneers/);
  await expect(page.locator('h1')).toContainText('Clock out');
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
test('Art Direction link opens the standalone design document', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-grid a[href="/art-direction/"]').click();
  await expect(page).toHaveURL(/\/art-direction\/$/);
  await expect(page).toHaveTitle(/Dungeoneers — Art Direction/);
  await expect(page.locator('h1')).toContainText('Ancient pixels');
  await expect(page.locator('img')).toHaveCount(3);
  await page.locator('.header-home').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('h1')).toContainText('Clock out');
});
test('Gameplay Target link opens the target game-loop document', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-grid a[href="/gameplay-direction/"]').click();
  await expect(page).toHaveURL(/\/gameplay-direction\/$/);
  await expect(page).toHaveTitle(/Dungeoneers — Gameplay & Game Loop/);
  await expect(page.locator('h1')).toContainText('Four players');
  await expect(page.locator('text=Not yet implemented')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(2);
});
test('Combat Bible link opens the class and ability specification', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-grid a[href="/combat-bible/"]').click();
  await expect(page).toHaveURL(/\/combat-bible\/$/);
  await expect(page).toHaveTitle(/Dungeoneers — Combat & Ability Bible/);
  await expect(page.locator('h1')).toContainText('Eight variants');
  await expect(page.locator('.class-section')).toHaveCount(8);
  await expect(page.locator('.ability-grid article')).toHaveCount(40);
  await expect(page.locator('img')).toHaveCount(2);
  await page.locator('.header-home').click();
  await expect(page).toHaveURL(/\/$/);
});
test('Design navigation consolidates documents under one section', async ({ page }) => {
  await page.goto('/');
  const globalNav = page.locator('#main-nav');
  await expect(globalNav.getByRole('link', { name: 'Design', exact: true })).toBeVisible();
  await expect(globalNav.getByRole('link', { name: 'Art', exact: true })).toHaveCount(0);
  await expect(globalNav.getByRole('link', { name: 'Game loop', exact: true })).toHaveCount(0);
  await globalNav.getByRole('link', { name: 'Design', exact: true }).click();

  const designNav = page.locator('.document-nav');
  await expect(designNav.getByRole('link')).toHaveCount(3);
  await expect(designNav.getByRole('link', { name: 'Art direction' })).toHaveAttribute('aria-current', 'page');
  await designNav.getByRole('link', { name: 'Game loop' }).click();
  await expect(page).toHaveURL(/\/gameplay-direction\/$/);
  await expect(page.locator('.document-nav').getByRole('link', { name: 'Game loop' })).toHaveAttribute('aria-current', 'page');
  await page.locator('.document-nav').getByRole('link', { name: 'Combat bible' }).click();
  await expect(page).toHaveURL(/\/combat-bible\/$/);
  await expect(page.locator('.document-nav').getByRole('link', { name: 'Combat bible' })).toHaveAttribute('aria-current', 'page');
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
