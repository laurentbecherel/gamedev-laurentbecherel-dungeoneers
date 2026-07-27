import { test, expect } from "@playwright/test";
test("editor page loads", async ({ page }) => {
  await page.goto("/editor.html"); await expect(page).toHaveTitle(/Editor/);
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  await expect(page.locator("#btn-save")).toBeVisible();
});
test("config displayed", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".field-input").first()).toBeVisible({ timeout: 5000 });
  // Click main.json explicitly (generator.json is now first alphabetically)
  await page.click("text=main.json");
  await page.click("#tab-raw"); await expect(page.locator("#json-ta")).toBeVisible();
  const txt = await page.locator("#json-ta").inputValue();
  expect(txt).toContain("version"); expect(txt).toContain("renderer");
});
test("asset list populated", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  const count = await page.locator(".tree-file").count(); expect(count).toBeGreaterThan(3);
});
test("save config flow", async ({ page }) => {
  await page.goto("/editor.html"); await expect(page.locator(".field-input").first()).toBeVisible({ timeout: 5000 });
  await page.click("text=main.json"); await page.waitForTimeout(200);
  await page.click("#btn-save"); await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 2000 });
});
test("asset edit flow", async ({ page }) => {
  await page.goto("/editor.html"); await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".tree-file", { hasText: "walls.json" }).click(); await page.waitForTimeout(400);
  await page.click("#tab-raw"); await expect(page.locator("#json-ta")).toBeVisible();
  const ta = page.locator("#json-ta"); const orig = await ta.inputValue();
  const data = JSON.parse(orig); const origName = data.materials[0].name;
  data.materials[0].name = "test_temp_" + Date.now(); await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save"); await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 2000 });
  data.materials[0].name = origName; await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save"); await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 2000 });
});
test("no console errors", async ({ page }) => {
  const errors = []; page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/editor.html"); await page.waitForTimeout(800);
  expect(errors.filter(e => !e.includes("favicon") && !e.includes("Failed to load resource") && !e.includes("fonts.googleapis") && !e.includes("fonts.gstatic")).length).toBe(0);
});
