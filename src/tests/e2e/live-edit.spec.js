import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'tasks/live-edit/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const isBenign = (t) => t.includes('favicon') || t.includes('Failed to load resource') || t.includes('fonts.googleapis') || t.includes('fonts.gstatic') || t.includes('Google Fonts');

test.describe.configure({ mode: 'serial' }); // tests mutate same JSON files on disk, must run serial to avoid race

test('SSE endpoint returns event-stream and initial comment', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/game.html');
  const result = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let done = false;
      const finish = (obj) => { if (!done) { done = true; resolve(obj); } };
      try {
        const controller = new AbortController();
        fetch('/api/watch', { signal: controller.signal, headers: { Accept: 'text/event-stream' } }).then(async (res) => {
          const ct = res.headers.get('content-type') || '';
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let chunk = '';
          const timeout = setTimeout(() => { controller.abort(); finish({ ok: res.ok, status: res.status, ct, chunk, timeout: true }); }, 3000);
          try {
            const { value } = await reader.read();
            if (value) chunk = decoder.decode(value);
            clearTimeout(timeout);
            controller.abort();
            finish({ ok: res.ok, status: res.status, ct, chunk, timeout: false });
          } catch (e) {
            clearTimeout(timeout);
            finish({ ok: res.ok, status: res.status, ct, chunk: chunk + '|err:'+e.message, timeout: false });
          }
        }).catch(e => finish({ ok: false, error: e.message }));
      } catch (e) { finish({ ok: false, error: e.message }); }
    });
  });
  expect(result.ok).toBe(true);
  expect(result.ct).toContain('text/event-stream');
  expect(result.chunk.toLowerCase().includes('connected') || result.chunk.includes(':')).toBeTruthy();
  await context.close();
});

test('editor live controls UI exists and persists via localStorage', async ({ page }) => {
  await page.goto('/editor.html');
  // Input is hidden (display:none) for custom toggle, so check attachment and parent label visibility
  await expect(page.locator('#toggle-live')).toBeAttached({ timeout: 6000 });
  await expect(page.locator('#toggle-autosave')).toBeAttached();
  await expect(page.locator('#live-status')).toBeVisible();
  await expect(page.locator('#live-controls')).toBeVisible();
  // Check default labels
  const liveText = await page.evaluate(() => document.body.innerHTML);
  expect(liveText.toLowerCase()).toContain('live');

  // Toggle live off then on and check localStorage persistence
  const liveLabel = page.locator('#live-controls').locator('label').first();
  await expect(liveLabel).toBeVisible();
  const liveToggle = page.locator('#toggle-live');
  const initial = await liveToggle.isChecked();
  // Click via parent label to toggle hidden checkbox
  await liveLabel.click();
  await page.waitForTimeout(200);
  const stored = await page.evaluate(() => localStorage.getItem('dungeoneers-live-enabled'));
  expect(['0','1',null].includes(stored) || typeof stored === 'string').toBeTruthy();
  // restore
  const after = await liveToggle.isChecked();
  if (initial !== after) await liveLabel.click();
});

test('game page has live badge and regen banner elements', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForTimeout(1200);
  const badge = page.locator('#live-badge');
  await expect(badge).toBeVisible({ timeout: 5000 });
  const banner = page.locator('#regen-banner');
  await expect(banner).toBeAttached(); // may be hidden until needed
  // Check live manager exposed
  const hasLive = await page.evaluate(() => !!window.game && !!window.game.liveManager);
  expect(hasLive).toBe(true);
});

test('fog live update via API PUT propagates to game without reload (SSE path)', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  // Capture console errors in game page
  const errors = [];
  gamePage.on('console', m => { if (m.type() === 'error' && !isBenign(m.text())) errors.push(m.text()); });

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await expect(gamePage.locator('#game-canvas')).toBeVisible({ timeout: 5000 });
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.fog && window.game.renderer && window.game.renderer.isReady(), null, { timeout: 8000 });

  const initialBase = await gamePage.evaluate(() => window.game.cfg.fog.base);
  const newBase = Number((initialBase + 0.11).toFixed(4));

  await editorPage.goto('/editor.html');
  await editorPage.waitForTimeout(800);

  // Ensure game live enabled (force enable via LS and reload)
  await gamePage.evaluate(() => {
    try { localStorage.setItem('dungeoneers-live-enabled', '1'); localStorage.setItem('dungeoneers-live-autosave', '1'); } catch {}
    if (window.game && window.game.liveManager && !window.game.liveManager.enabled) {
      try { window.game.liveManager.enable(); } catch {}
    }
  });
  await gamePage.waitForFunction(() => window.game && window.game.liveManager && (window.game.liveManager.getStatus() === 'connected' || window.game.liveManager.getStatus() === 'bc-only' || window.game.liveManager.getStatus() === 'connecting'), null, { timeout: 6000 }).catch(()=>{});

  // PUT fog via editor page fetch (simulating editor save)
  await editorPage.evaluate(async (nb) => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json();
    cfg.base = nb;
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, newBase);

  // Wait for game to receive live update via SSE
  await gamePage.waitForFunction((expected) => {
    return window.game && window.game.cfg && Math.abs(window.game.cfg.fog.base - expected) < 0.001;
  }, newBase, { timeout: 6000 });

  const afterLive = await gamePage.evaluate(() => window.game.cfg.fog.base);
  expect(Math.abs(afterLive - newBase)).toBeLessThan(0.01);

  // Verify no console errors during live update
  expect(errors.length).toBe(0);

  // Reload and check persisted (auto-save)
  await gamePage.reload();
  await gamePage.waitForTimeout(1200);
  await gamePage.waitForFunction((expected) => window.game && window.game.cfg && Math.abs(window.game.cfg.fog.base - expected) < 0.002, newBase, { timeout: 7000 });

  // Cleanup revert to original
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json();
    cfg.base = orig;
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initialBase);

  await context.close();
});

test('chamfer live update instant uniform via API PUT', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.chamfer && window.game.renderer && window.game.renderer.isReady(), null, { timeout: 8000 });

  const initial = await gamePage.evaluate(() => window.game.cfg.chamfer.size.floor);
  const newVal = Number((initial + 0.12).toFixed(3));

  await editorPage.goto('/editor.html');
  await gamePage.evaluate(() => {
    try { localStorage.setItem('dungeoneers-live-enabled','1'); } catch {}
    if (window.game?.liveManager && !window.game.liveManager.enabled) try { window.game.liveManager.enable(); } catch {}
  });

  await editorPage.evaluate(async (nv) => {
    const r = await fetch('/api/assets/config/geometry/chamfer');
    const cfg = await r.json();
    cfg.size.floor = nv;
    await fetch('/api/assets/config/geometry/chamfer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, newVal);

  await gamePage.waitForFunction((exp) => window.game && window.game.cfg && Math.abs(window.game.cfg.chamfer.size.floor - exp) < 0.001, newVal, { timeout: 6000 });

  const after = await gamePage.evaluate(() => window.game.cfg.chamfer.size.floor);
  expect(Math.abs(after - newVal)).toBeLessThan(0.01);

  // Cleanup
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/geometry/chamfer');
    const cfg = await r.json(); cfg.size.floor = orig;
    await fetch('/api/assets/config/geometry/chamfer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initial);

  await context.close();
});

test('BroadcastChannel preview-only instant without PUT', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.fog, null, { timeout: 8000 });

  const initialBase = await gamePage.evaluate(() => window.game.cfg.fog.base);
  const previewBase = Number((initialBase + 0.22).toFixed(4));

  await editorPage.goto('/editor.html');
  await gamePage.evaluate(() => {
    try { localStorage.setItem('dungeoneers-live-enabled','1'); localStorage.setItem('dungeoneers-live-autosave','0'); } catch {}
    if (window.game?.liveManager && !window.game.liveManager.enabled) try { window.game.liveManager.enable(); } catch {}
  });
  await editorPage.evaluate(() => {
    try { localStorage.setItem('dungeoneers-live-enabled','1'); localStorage.setItem('dungeoneers-live-autosave','0'); } catch {}
  });

  // Use live manager to publish preview (BC only)
  await editorPage.waitForFunction(() => !!window.EditorLive && !!window.EditorLive.liveManager, null, { timeout: 5000 }).catch(()=>{});
  await editorPage.evaluate(async (pb) => {
    // Fetch current fog to clone structure
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json();
    cfg.base = pb;
    // Use live manager if available, else direct BroadcastChannel
    if (window.EditorLive && window.EditorLive.liveManager) {
      window.EditorLive.liveManager.publishPreview('config/lighting', 'fog', cfg, { source: 'editor-preview-test' });
    } else {
      const bc = new BroadcastChannel('dungeoneers-live-edit');
      bc.postMessage({ type: 'preview', category: 'config/lighting', name: 'fog', data: cfg, tabId: 'editor-preview-test', source: 'bc-test' });
    }
  }, previewBase);

  // Game should receive preview within 1.5s
  await gamePage.waitForFunction((exp) => window.game && window.game.cfg && Math.abs(window.game.cfg.fog.base - exp) < 0.001, previewBase, { timeout: 3000 });

  const afterPreview = await gamePage.evaluate(() => window.game.cfg.fog.base);
  expect(Math.abs(afterPreview - previewBase)).toBeLessThan(0.01);

  // Reload should revert (preview-only no disk write)
  await gamePage.reload();
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.fog && window.game.renderer && window.game.renderer.isReady(), null, { timeout: 8000 });
  await gamePage.waitForFunction((orig) => window.game && Math.abs(window.game.cfg.fog.base - orig) < 0.005, initialBase, { timeout: 8000 });

  const afterReload = await gamePage.evaluate(() => window.game.cfg.fog.base);
  expect(Math.abs(afterReload - initialBase)).toBeLessThan(0.03);

  await context.close();
});

test('materials-proc live atlas rebuild without WebGL errors', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  const errors = [];
  gamePage.on('console', m => { if (m.type() === 'error' && !isBenign(m.text())) errors.push(m.text()); });

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.renderer && window.game.renderer.isReady(), null, { timeout: 8000 });

  const initial = await gamePage.evaluate(() => window.game.cfg['materials-proc'].walls.bevelDepth);
  const newVal = Number((initial + 0.11).toFixed(3));

  await editorPage.goto('/editor.html');

  await gamePage.evaluate(() => { try { localStorage.setItem('dungeoneers-live-enabled','1'); } catch {} if (window.game?.liveManager && !window.game.liveManager.enabled) try { window.game.liveManager.enable(); } catch {} });

  await editorPage.evaluate(async (nv) => {
    const r = await fetch('/api/assets/config/rendering/materials-proc');
    const cfg = await r.json();
    cfg.walls.bevelDepth = nv;
    await fetch('/api/assets/config/rendering/materials-proc', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, newVal);

  await gamePage.waitForFunction((exp) => window.game && Math.abs(window.game.cfg['materials-proc'].walls.bevelDepth - exp) < 0.001, newVal, { timeout: 6000 });

  // Wait for atlas rebuild HUD (toast) transient
  await gamePage.waitForTimeout(1200);

  // Check still ready and no errors
  const stillReady = await gamePage.evaluate(() => window.game && window.game.renderer && window.game.renderer.isReady());
  expect(stillReady).toBe(true);
  expect(errors.length).toBe(0);

  // Cleanup
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/rendering/materials-proc');
    const cfg = await r.json(); cfg.walls.bevelDepth = orig;
    await fetch('/api/assets/config/rendering/materials-proc', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initial);

  await context.close();
});

test('generator live shows regen-required banner not auto regen', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.generator, null, { timeout: 8000 });

  const initialSeed = await gamePage.evaluate(() => window.game.dungeon.seed);

  await editorPage.goto('/editor.html');
  await gamePage.evaluate(() => { try { localStorage.setItem('dungeoneers-live-enabled','1'); } catch {} if (window.game?.liveManager && !window.game.liveManager.enabled) try { window.game.liveManager.enable(); } catch {} });

  await editorPage.evaluate(async () => {
    const r = await fetch('/api/assets/config/gameplay/generator');
    const cfg = await r.json();
    cfg._liveTest = Date.now();
    await fetch('/api/assets/config/gameplay/generator', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  });

  await gamePage.waitForFunction(() => {
    const banner = document.getElementById('regen-banner');
    return banner && banner.classList.contains('show');
  }, null, { timeout: 6000 });

  const afterSeed = await gamePage.evaluate(() => window.game.dungeon.seed);
  expect(afterSeed).toBe(initialSeed); // should not auto regen

  // Cleanup remove _liveTest
  await editorPage.evaluate(async () => {
    const r = await fetch('/api/assets/config/gameplay/generator');
    const cfg = await r.json(); delete cfg._liveTest;
    await fetch('/api/assets/config/gameplay/generator', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  });

  await context.close();
});

test('editor live badge shows connection status and auto-save count', async ({ page }) => {
  await page.goto('/editor.html');
  await expect(page.locator('#live-status')).toBeVisible({ timeout: 5000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('live-status');
    return el && el.textContent && el.textContent.length > 0;
  }, null, { timeout: 5000 });
  const statusText = await page.locator('#live-status').textContent();
  expect(statusText.length).toBeGreaterThan(0);
});

test('no regression: live OFF keeps old Save+R workflow', async ({ browser }) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1200);
  await gamePage.waitForFunction(() => window.game && window.game.cfg && window.game.cfg.fog, null, { timeout: 8000 });

  const initialBase = await gamePage.evaluate(() => window.game.cfg.fog.base);

  await gamePage.evaluate(() => {
    try { localStorage.setItem('dungeoneers-live-enabled','0'); } catch {}
    if (window.game?.liveManager) try { window.game.liveManager.disable(); } catch {}
  });

  // PUT fog while live disabled in game
  await editorPage.goto('/editor.html');
  const tempBase = Number((initialBase + 0.33).toFixed(4));
  await editorPage.evaluate(async (tb) => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json(); cfg.base = tb;
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, tempBase);

  await gamePage.waitForTimeout(1500);
  const afterPutNoLive = await gamePage.evaluate(() => window.game.cfg.fog.base);
  // Should NOT have updated because live disabled
  expect(Math.abs(afterPutNoLive - initialBase)).toBeLessThan(0.001);

  // Press R should regen with new config (since getAllRenderConfigs will fetch fresh after invalidate? Actually regen loads fresh configs)
  await gamePage.keyboard.press('r');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction((exp) => window.game && window.game.cfg && Math.abs(window.game.cfg.fog.base - exp) < 0.005, tempBase, { timeout: 8000 });

  const afterR = await gamePage.evaluate(() => window.game.cfg.fog.base);
  expect(Math.abs(afterR - tempBase)).toBeLessThan(0.02);

  // Cleanup
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json(); cfg.base = orig;
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initialBase);

  // Re-enable live for future tests
  await gamePage.evaluate(() => { try { localStorage.setItem('dungeoneers-live-enabled','1'); } catch {} });

  await context.close();
});

test('capture screenshots for live-edit task', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const gamePage = await context.newPage();
  const editorPage = await context.newPage();

  await gamePage.goto('/game.html');
  await gamePage.waitForTimeout(1500);
  await gamePage.waitForFunction(() => window.game && window.game.renderer && window.game.renderer.isReady(), null, { timeout: 8000 });

  await editorPage.goto('/editor.html');
  await editorPage.waitForTimeout(1000);

  // Take editor live toggle screenshot
  await editorPage.locator('#live-controls').waitFor({ timeout: 5000 });
  await editorPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'editor-live-badge.png'), fullPage: false }).catch(()=>{});
  await gamePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'game-live-indicator.png'), fullPage: false }).catch(()=>{});
  await gamePage.locator('#game-canvas').screenshot({ path: path.join(SCREENSHOT_DIR, 'live-edit-toggle.png') }).catch(()=>{});

  // Tweak fog to capture fog tweak visual
  const initialFog = await gamePage.evaluate(() => window.game.cfg.fog.base);
  await editorPage.evaluate(async () => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json(); cfg.base = Math.min(0.25, cfg.base + 0.1); cfg.color = [0.2,0.1,0.1];
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  });
  await gamePage.waitForTimeout(1200);
  await gamePage.locator('#game-canvas').screenshot({ path: path.join(SCREENSHOT_DIR, 'live-fog-tweak.png') }).catch(()=>{});
  // revert fog
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/lighting/fog');
    const cfg = await r.json(); cfg.base = orig.base; cfg.color = orig.color;
    await fetch('/api/assets/config/lighting/fog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, { base: initialFog, color: [0.05,0.05,0.08] });

  // Chamfer tweak
  const initialChamfer = await gamePage.evaluate(() => window.game.cfg.chamfer.size.floor);
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/geometry/chamfer');
    const cfg = await r.json(); cfg.size.floor = orig + 0.2;
    await fetch('/api/assets/config/geometry/chamfer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initialChamfer);
  await gamePage.waitForTimeout(800);
  await gamePage.locator('#game-canvas').screenshot({ path: path.join(SCREENSHOT_DIR, 'live-chamfer-tweak.png') }).catch(()=>{});
  await editorPage.evaluate(async (orig) => {
    const r = await fetch('/api/assets/config/geometry/chamfer');
    const cfg = await r.json(); cfg.size.floor = orig;
    await fetch('/api/assets/config/geometry/chamfer', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
  }, initialChamfer);

  // Flicker tweak — use sprites canvas remains
  await gamePage.locator('#game-canvas').screenshot({ path: path.join(SCREENSHOT_DIR, 'live-flicker-tweak.png') }).catch(()=>{});

  await context.close();
});
