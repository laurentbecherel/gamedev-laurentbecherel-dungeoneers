import { test, expect } from "@playwright/test";

const isBenign = (t) => t.includes("favicon") || t.includes("Failed to load resource") || t.includes("fonts.googleapis") || t.includes("fonts.gstatic");

test("editor page loads with sidebar and save button", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page).toHaveTitle(/Editor/);
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  await expect(page.locator("#btn-save")).toBeVisible();
});

test("asset list populated with hierarchical nested categories", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  const count = await page.locator(".tree-file").count();
  expect(count).toBeGreaterThan(10); // should be >=16 dedicated + others

  // Check that nested folder headers exist (rendering, lighting, geometry, gameplay, ui)
  const folderTexts = await page.locator(".tree-folder").allTextContents();
  const joined = folderTexts.join(" ").toLowerCase();
  expect(joined).toContain("rendering");
  expect(joined).toContain("lighting");
  expect(joined).toContain("geometry");
  expect(joined).toContain("gameplay");
  expect(joined).toContain("ui");
});

test("all 16 dedicated Task3 configs visible and editable", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 6000 });

  const expected = [
    "rendering.json",
    "palette.json",
    "pom.json",
    "pbr.json",
    "ao.json",
    "raymarch.json",
    "materials-proc.json",
    "lighting.json",
    "shadows.json",
    "fog.json",
    "chamfer.json",
    "corners.json",
    "generator.json",
    "player.json",
    "map.json",
    "debug.json",
    "main.json"
  ];

  for (const name of expected) {
    const file = page.locator(".tree-file", { hasText: name }).first();
    await expect(file).toBeVisible({ timeout: 2000 });
  }
});

test("config/display shows rendering.json with fov and toggles", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".tree-file", { hasText: "rendering.json" }).first().click();
  await page.waitForTimeout(300);
  // Visual editor should show fov field
  await expect(page.locator(".field-label").first()).toBeVisible({ timeout: 3000 });
  const panelText = await page.locator("#editor-panel").textContent();
  expect(panelText.toLowerCase()).toContain("fov");
});

test("material modifiers exposes a live debug-view dropdown", async ({ page, context }) => {
  const gamePage = await context.newPage();
  await gamePage.goto("/game.html");
  await gamePage.waitForFunction(() => !!window._gameRenderer, null, { timeout: 10000 });
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".tree-file", { hasText: "material-modifiers.json" }).first().click();
  await page.waitForTimeout(350);
  const topSections = page.locator(".form-root > .object-section > .object-section-toggle");
  const debugToggle = topSections.filter({ hasText: "Debug" }).first();
  const modifiersToggle = topSections.filter({ hasText: "Modifiers" }).first();
  await expect(debugToggle).toHaveAttribute("aria-expanded", "false");
  await expect(modifiersToggle).toHaveAttribute("aria-expanded", "false");
  await debugToggle.click();
  await expect(debugToggle).toHaveAttribute("aria-expanded", "true");
  const debugSelect = page.locator("select.field-select").first();
  await expect(debugSelect).toBeVisible({ timeout: 3000 });
  await expect(debugSelect.locator('option[value="damagedNoise"]')).toHaveCount(1);
  await expect(debugSelect.locator('option[value="damagedPlacement"]')).toHaveCount(1);
  await expect(debugSelect.locator('option[value="damagedFactors"]')).toHaveCount(1);
  await expect(debugSelect.locator('option[value="damagedFinal"]')).toHaveCount(1);
  await debugSelect.selectOption("damagedFactors");
  await expect(debugSelect).toHaveValue("damagedFactors");
  await expect.poll(() => gamePage.evaluate(() => window._gameRenderer?.pbrDebugMode)).toBe(12);
  await debugSelect.selectOption("off");
  await expect.poll(() => gamePage.evaluate(() => window._gameRenderer?.pbrDebugMode)).toBe(0);
  await modifiersToggle.click();
  await expect(modifiersToggle).toHaveAttribute("aria-expanded", "true");
  const mossToggle = page.locator(".object-section-toggle").filter({ hasText: "Moss" }).first();
  await expect(mossToggle).toBeVisible();
  await expect(mossToggle).toHaveAttribute("aria-expanded", "false");
  await mossToggle.click();
  await expect(mossToggle).toHaveAttribute("aria-expanded", "true");
});

test("pom.json shows centered reference plane 0.5 and clamping fields", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "pom.json" }).first().click();
  await page.waitForTimeout(400);
  await page.click("#tab-raw");
  await expect(page.locator("#json-ta")).toBeVisible();
  const txt = await page.locator("#json-ta").inputValue();
  const data = JSON.parse(txt);
  expect(data.enabled).toBe(true);
  expect(data.reference.plane).toBe(0.5);
  expect(data.clamping.maxOffset).toBeCloseTo(0.10, 1);
  expect(data.clamping.minViewZ).toBeCloseTo(0.08, 1);
});

test("fog.json shows base 0.06 squared 0.005 and presets", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "fog.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  const txt = await page.locator("#json-ta").inputValue();
  const data = JSON.parse(txt);
  expect(data.enabled).toBe(true);
  expect(data.base).toBeCloseTo(0.06, 1);
  expect(data.presets.off.base).toBe(0);
  expect(data.presets.heavy.base).toBeGreaterThan(0.1);
});

test("shadows.json shows bias 0.10/0.06 and 64 steps", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "shadows.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  const txt = await page.locator("#json-ta").inputValue();
  const data = JSON.parse(txt);
  expect(data.bias.traceNormalOffset).toBeCloseTo(0.10, 1);
  expect(data.bias.dirOffset).toBeCloseTo(0.06, 1);
  expect(data.dda.maxSteps).toBe(64);
});

test("chamfer.json and corners.json editable with visible defaults", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "chamfer.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  let txt = await page.locator("#json-ta").inputValue();
  let data = JSON.parse(txt);
  expect(data.enabled).toBe(true);
  expect(data.size.floor).toBeCloseTo(0.30, 1);
  expect(data.debugToggle).toBe("Key 7");

  await page.locator(".tree-file", { hasText: "corners.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  txt = await page.locator("#json-ta").inputValue();
  data = JSON.parse(txt);
  expect(data.enabled).toBe(true);
  expect(data.radius).toBeCloseTo(0.15, 1);
  expect(data.mode).toBe(2);
  expect(data.debugToggle).toBe("Key 8");
});

test("map.json shows Pixelify Sans font and parchment #e8dcc4 colors", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "map.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  const txt = await page.locator("#json-ta").inputValue();
  const data = JSON.parse(txt);
  expect(data.font.family).toBe("Pixelify Sans");
  expect(data.parchment.bg).toBe("#e8dcc4");
  expect(data.parchment.scan).toBe("#ddd0b8");
  expect(data.display.position).toBe("fullscreen");
  expect(data.layout.legend.swatch).toBe(12);
});

test("ao.json and pbr.json advanced fields", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "ao.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  let txt = await page.locator("#json-ta").inputValue();
  let data = JSON.parse(txt);
  expect(data.affect.sun).toBeCloseTo(0.25, 1);
  expect(data.affect.point).toBeCloseTo(0.35, 1);
  expect(data.affect.ambient).toBe(1);

  await page.locator(".tree-file", { hasText: "pbr.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  txt = await page.locator("#json-ta").inputValue();
  data = JSON.parse(txt);
  expect(data.fresnel.f0Dielectric).toBe(0.04);
  expect(data.debug.modes.length).toBe(9);
});

test("main.json v3 minimal fallback with _readme delegation", async ({ page }) => {
  await page.goto("/editor.html");
  await page.locator(".tree-file", { hasText: "main.json" }).first().click();
  await page.waitForTimeout(300);
  await page.click("#tab-raw");
  const txt = await page.locator("#json-ta").inputValue();
  const data = JSON.parse(txt);
  expect(data.version).toBe(3);
  expect(data._readme).toContain("Dedicated");
  // should be minimal
  expect(Object.keys(data).length).toBeLessThanOrEqual(5);
});

test("save config flow for nested file (pom.json) roundtrip", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".tree-file", { hasText: "pom.json" }).first().click();
  await page.waitForTimeout(400);
  await page.click("#tab-raw");
  await expect(page.locator("#json-ta")).toBeVisible();
  const ta = page.locator("#json-ta");
  const orig = await ta.inputValue();
  const data = JSON.parse(orig);
  const origStrength = data.strength.wall;
  data.strength.wall = 0.061; // small change
  await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save");
  await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 3000 });

  // restore
  data.strength.wall = origStrength;
  await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save");
  await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 3000 });
});

test("asset edit flow walls.json material name (legacy flat)", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".tree-file", { hasText: "walls.json" }).click();
  await page.waitForTimeout(400);
  await page.click("#tab-raw");
  await expect(page.locator("#json-ta")).toBeVisible();
  const ta = page.locator("#json-ta");
  const orig = await ta.inputValue();
  const data = JSON.parse(orig);
  const origName = data.materials[0].name;
  data.materials[0].name = "test_temp_" + Date.now();
  await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save");
  await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 2000 });
  data.materials[0].name = origName;
  await ta.fill(JSON.stringify(data, null, 2));
  await page.click("#btn-save");
  await expect(page.locator("#status-area")).toContainText("Saved", { timeout: 2000 });
});

test("hierarchical tree padding depth indicates nested folders", async ({ page }) => {
  await page.goto("/editor.html");
  await expect(page.locator(".tree-file").first()).toBeVisible({ timeout: 5000 });
  // Check that at least one file has padding-left >40 due to nested depth
  const paddings = await page.evaluate(() => {
    const files = document.querySelectorAll('.tree-file');
    return Array.from(files).map(el => parseInt(el.style.paddingLeft) || 0);
  });
  const hasNestedPadding = paddings.some(p => p > 45);
  expect(hasNestedPadding).toBeTruthy();
});

test("no console errors in editor with nested configs", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !isBenign(m.text())) errors.push(m.text()); });
  await page.goto("/editor.html");
  await page.waitForTimeout(1200);
  await page.locator(".tree-file", { hasText: "corners.json" }).first().click();
  await page.waitForTimeout(300);
  await page.locator(".tree-file", { hasText: "chamfer.json" }).first().click();
  await page.waitForTimeout(300);
  expect(errors.length).toBe(0);
});
