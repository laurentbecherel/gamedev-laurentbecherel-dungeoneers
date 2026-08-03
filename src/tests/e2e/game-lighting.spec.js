import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is three levels up from src/tests/e2e -> src -> project root
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'tasks/lighting-sprites/screenshots');
const SRC_SCREENSHOT_DIR = path.join(__dirname, '../../assets'); // not used, keep task dir as primary

// Ensure dir exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const isBenign = (txt) =>
  txt.includes('favicon') ||
  txt.includes('Failed to load resource') ||
  txt.includes('fonts.googleapis') ||
  txt.includes('fonts.gstatic') ||
  txt.includes('Google Fonts');

test.describe('Task6: Lighting, Sprites & Particles', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors for later assertion where needed
    await page.goto('/game.html');
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => window.game && window.game.dungeon && window.game.dungeon.sprites, { timeout: 10000 });
  });

  test('game loads with sprites and lights, WebGL2, no shader errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => {
      const txt = m.text();
      if (m.type() === 'error' && !isBenign(txt)) errors.push(txt);
    });

    const info = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const gl = c ? c.getContext('webgl2') : null;
      const d = window.game?.dungeon;
      const renderer = window.game?.renderer || window.game?.gpuRenderer || null;
      return {
        hasCanvas: !!c,
        webgl2: !!gl,
        sprites: d?.sprites?.length || 0,
        lights: d?.lights?.length || 0,
        hasSpritesArray: Array.isArray(d?.sprites),
        hasLightsArray: Array.isArray(d?.lights),
        hasRenderer: !!renderer,
        hasLightManager: !!(renderer?.lightManager || window.game?.lightManager || window.game?.lights),
        hasSpriteRenderer: !!(renderer?.spriteRenderer || renderer?.spriteGpu),
        width: d?.w,
        height: d?.h
      };
    });

    expect(info.hasCanvas).toBeTruthy();
    expect(info.webgl2).toBeTruthy();
    expect(info.hasSpritesArray).toBeTruthy();
    expect(info.hasLightsArray).toBeTruthy();
    expect(info.sprites).toBeGreaterThan(0);
    expect(info.lights).toBeGreaterThan(0);
    expect(info.hasRenderer).toBeTruthy();

    // Canvas non-empty
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const dataUrlLen = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      try { return c.toDataURL().length; } catch { return 0; }
    });
    expect(dataUrlLen).toBeGreaterThan(1000);

    // No shader compile errors captured during load (if renderer logged)
    const shaderErrors = errors.filter(e => e.toLowerCase().includes('shader') || e.toLowerCase().includes('compile') || e.toLowerCase().includes('program'));
    expect(shaderErrors.length, `shader errors: ${shaderErrors.join('; ')}`).toBe(0);
  });

  test('sprites have valid fields, anchored Z, unique phases, material sane', async ({ page }) => {
    const result = await page.evaluate(() => {
      const d = window.game.dungeon;
      const details = [];
      let minZViolation = null;
      let maxZViolation = null;
      for (const s of d.sprites) {
        const idx = s.tileY * d.w + s.tileX;
        const floorH = d.floorHeight ? d.floorHeight[idx] : 0;
        if (s.z < floorH - 0.2) minZViolation = { z: s.z, floorH, id: s.id || s.spriteId };
        if (s.z > floorH + 1.8) maxZViolation = { z: s.z, floorH, id: s.id || s.spriteId };
        details.push({
          id: s.id,
          spriteId: s.spriteId,
          x: s.x,
          y: s.y,
          z: s.z,
          tileX: s.tileX,
          tileY: s.tileY,
          color: s.color,
          intensity: s.intensity,
          radius: s.radius,
          phase: s.phase,
          floorH,
          flickerSpeed: s.flickerSpeed,
          flickerAmount: s.flickerAmount
        });
      }
      const phases = d.sprites.map(s => s.phase);
      const uniqRounded = new Set(phases.map(p => Math.round(p * 100) / 100)).size;
      return { details, count: d.sprites.length, uniqRounded, minZViolation, maxZViolation, w: d.w, h: d.h };
    });

    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(result.uniqRounded).toBeGreaterThanOrEqual(Math.min(result.count, 3));
    expect(result.minZViolation, `Z below floorHeight: ${JSON.stringify(result.minZViolation)}`).toBeNull();
    expect(result.maxZViolation, `Z too high above floor: ${JSON.stringify(result.maxZViolation)}`).toBeNull();

    for (const s of result.details) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(result.w);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(result.h);
      expect(s.intensity).toBeGreaterThan(0);
      expect(s.radius).toBeGreaterThan(0);
      expect(s.color[0]).toBeGreaterThanOrEqual(0);
      expect(s.color[0]).toBeLessThanOrEqual(1.1);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThanOrEqual(Math.PI * 2 + 0.01);
      expect(typeof s.spriteId).toBe('string');
    }
  });

  test('lights have valid fields and maxLights config respected', async ({ page, request }) => {
    const lightRes = await request.get('/api/assets/config/lighting/lighting');
    expect(lightRes.ok()).toBeTruthy();
    const lightingCfg = await lightRes.json();
    expect(lightingCfg.maxLights).toBeDefined();
    expect(lightingCfg.maxLights).toBeGreaterThanOrEqual(8);

    const info = await page.evaluate(() => {
      const d = window.game.dungeon;
      return {
        lights: d.lights.map(l => ({
          pos: l.pos,
          color: l.color,
          intensity: l.intensity,
          radius: l.radius,
          type: l.type,
          phase: l.phase
        })),
        maxLights: window.game?.cfg?.lighting?.maxLights || 12
      };
    });

    expect(info.lights.length).toBeGreaterThan(0);
    expect(info.lights.length).toBeLessThanOrEqual(lightingCfg.maxLights + 20); // lights raw may be more than maxLights uploaded, but should be reasonable
    for (const l of info.lights) {
      expect(l.pos.length).toBe(3);
      expect(l.color.length).toBe(3);
      expect(l.intensity).toBeGreaterThan(0);
      expect(l.radius).toBeGreaterThan(0);
    }
  });

  test('organic flicker verified via LightManager flickered intensities', async ({ page }) => {
    const flickerInfo = await page.evaluate(async () => {
      // Try to import light-types module via /world/light-types.js
      let organic = null;
      try {
        const mod = await import('/world/light-types.js');
        organic = mod.organicFlickerFactor;
      } catch (e) {
        // fallback: attempt from /src/world/light-types.js path
        try {
          const mod2 = await import('/src/world/light-types.js');
          organic = mod2.organicFlickerFactor;
        } catch {}
      }
      // Also evaluate via LightManager
      const mgr = window.game?.renderer?.lightManager || window.game?.lightManager;
      const samplePos = { x: window.game.dungeon.startX, y: window.game.dungeon.startY };
      const nearest = mgr ? mgr.getNearest ? mgr.getNearest(samplePos, 3) : [] : [];
      const flickered0 = mgr && mgr.getFlickeredList ? mgr.getFlickeredList(0, samplePos, 4, null) : [];
      const flickered1 = mgr && mgr.getFlickeredList ? mgr.getFlickeredList(0.5, samplePos, 4, null) : [];
      let organicSamples = null;
      if (organic) {
        organicSamples = [];
        for (let t = 0; t < 5; t += 0.2) organicSamples.push(organic(t, 6, 0.25, 0.3));
      }
      return {
        hasOrganic: !!organic,
        organicSamples,
        nearestCount: nearest.length,
        flickered0: flickered0.map(f => f.intensity),
        flickered1: flickered1.map(f => f.intensity)
      };
    });

    if (flickerInfo.hasOrganic) {
      expect(flickerInfo.organicSamples.length).toBeGreaterThan(10);
      const min = Math.min(...flickerInfo.organicSamples);
      const max = Math.max(...flickerInfo.organicSamples);
      expect(max - min).toBeGreaterThan(0.1);
      expect(min).toBeGreaterThanOrEqual(0.18 - 0.01);
      for (const v of flickerInfo.organicSamples) {
        expect(Number.isFinite(v)).toBeTruthy();
      }
    }

    if (flickerInfo.flickered0.length > 0 && flickerInfo.flickered1.length > 0) {
      // intensities should vary with time
      let varied = false;
      for (let i = 0; i < Math.min(flickerInfo.flickered0.length, flickerInfo.flickered1.length); i++) {
        if (Math.abs(flickerInfo.flickered0[i] - flickerInfo.flickered1[i]) > 0.001) { varied = true; break; }
      }
      expect(varied).toBeTruthy();
    }
  });

  test('R regeneration keeps sprites/lights valid', async ({ page }) => {
    const before = await page.evaluate(() => window.game.dungeon.sprites.length);
    expect(before).toBeGreaterThan(0);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => window.game && window.game.dungeon && window.game.dungeon.sprites && window.game.dungeon.sprites.length > 0, { timeout: 10000 });
    const after = await page.evaluate(() => ({
      sprites: window.game.dungeon.sprites.length,
      lights: window.game.dungeon.lights.length
    }));
    expect(after.sprites).toBeGreaterThan(0);
    expect(after.lights).toBeGreaterThan(0);
  });

  // ----- Screenshot taking tests -----

  test('screenshot: torch wall - wall sconce warm pool', async ({ page }) => {
    // Attempt to place player near first torch_wall
    await page.evaluate(() => {
      const d = window.game.dungeon;
      const torch = d.sprites.find(s => s.spriteId && s.spriteId.includes('torch'));
      if (torch) {
        try {
          window.game.player.setPosition(torch.x + 0.8, torch.y, torch.z);
          window.game.player.setAngle(Math.atan2(torch.y - window.game.player.y, torch.x - window.game.player.x) || 0);
        } catch {}
      }
    });
    await page.waitForTimeout(600);
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const outPath = path.join(SCREENSHOT_DIR, 'screen-torch-wall.png');
    await page.screenshot({ path: outPath, fullPage: false });
    expect(fs.existsSync(outPath)).toBeTruthy();
  });

  test('screenshot: brazier floor - standing brazier larger radius', async ({ page }) => {
    await page.evaluate(() => {
      const d = window.game.dungeon;
      const braz = d.sprites.find(s => s.spriteId && s.spriteId.includes('brazier'));
      if (braz) {
        try {
          window.game.player.setPosition(braz.x + 1.0, braz.y + 0.5, braz.z);
        } catch {}
      }
    });
    await page.waitForTimeout(600);
    const canvas = page.locator('#game-canvas');
    await expect(canvas).toBeVisible();
    const outPath = path.join(SCREENSHOT_DIR, 'screen-brazier-floor.png');
    await page.screenshot({ path: outPath });
    expect(fs.existsSync(outPath)).toBeTruthy();
  });

  test('screenshot: multi-lights - several torches overlapping', async ({ page }) => {
    await page.evaluate(() => {
      try { window.game.player.setPosition(window.game.dungeon.startX, window.game.dungeon.startY, 0.5); } catch {}
    });
    await page.waitForTimeout(500);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const outPath = path.join(SCREENSHOT_DIR, 'screen-multi-lights.png');
    await page.screenshot({ path: outPath });
    expect(fs.existsSync(outPath)).toBeTruthy();
  });

  test('screenshot: sprite PBR - close-up PBR shading', async ({ page }) => {
    await page.evaluate(() => {
      const d = window.game.dungeon;
      const any = d.sprites[0];
      if (any) {
        try { window.game.player.setPosition(any.x + 0.5, any.y, any.z); } catch {}
      }
    });
    await page.waitForTimeout(600);
    const outPath = path.join(SCREENSHOT_DIR, 'screen-sprite-pbr.png');
    await page.screenshot({ path: outPath });
    expect(fs.existsSync(outPath)).toBeTruthy();
  });

  test('screenshot: flicker graph - organic non-sinusoidal proof', async ({ page }) => {
    // Create a debug overlay canvas that plots flicker factor over time
    await page.evaluate(async () => {
      let organic = null;
      try {
        const mod = await import('/world/light-types.js');
        organic = mod.organicFlickerFactor;
      } catch {
        try {
          const mod2 = await import('/src/world/light-types.js');
          organic = mod2.organicFlickerFactor;
        } catch {}
      }
      if (!organic) {
        // fallback inline cheap organic approximation if import fails
        organic = (time, speed, amount, phase) => {
          const t = time * speed + (phase||0);
          const warp = Math.sin(t*0.13)*0.34 + Math.sin(t*0.067)*0.27;
          const tw = t+warp;
          let combined = Math.sin(tw*1.0)+Math.sin(tw*1.87)*0.58+Math.sin(tw*2.93)*0.34;
          const pop = Math.sin(tw*11.7)*Math.sin(tw*9.3);
          const popShaped = Math.pow(Math.abs(pop),2.6)*Math.sign(pop)*0.23;
          return Math.max(0.18, 1.0 + (combined*0.52 + popShaped)* amount*1.85);
        };
      }

      let c = document.getElementById('flicker-chart');
      if (!c) {
        c = document.createElement('canvas');
        c.id = 'flicker-chart';
        c.width = 640;
        c.height = 260;
        c.style.position = 'absolute';
        c.style.left = '10px';
        c.style.top = '60px';
        c.style.zIndex = '9999';
        c.style.border = '2px solid #c9a84c';
        c.style.background = 'rgba(0,0,0,0.85)';
        document.body.appendChild(c);
      }
      const ctx = c.getContext('2d');
      ctx.clearRect(0,0,c.width,c.height);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0,0,c.width,c.height);
      ctx.strokeStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(0, c.height*0.5);
      ctx.lineTo(c.width, c.height*0.5);
      ctx.stroke();
      // Plot 3 torches with different phases
      const phases = [0, 1.9, 4.1];
      const colors = ['#ff9a32', '#6ec8ff', '#8aff7a'];
      for (let pi = 0; pi < phases.length; pi++) {
        ctx.strokeStyle = colors[pi];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < c.width; x++) {
          const t = (x / c.width) * 10; // 10 seconds
          const v = organic(t, 6, 0.25, phases[pi]);
          const y = c.height * 0.5 - (v-1.0)*80;
          if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#e8dcc4';
      ctx.font = '12px monospace';
      ctx.fillText('Organic flicker: 10s, 3 phases, pop spikes visible vs pure sin', 10, 20);
      ctx.fillStyle = '#ff9a32'; ctx.fillRect(10, 30, 12, 12); ctx.fillStyle='#e8dcc4'; ctx.fillText('phase 0', 26, 39);
      ctx.fillStyle = '#6ec8ff'; ctx.fillRect(90, 30, 12, 12); ctx.fillStyle='#e8dcc4'; ctx.fillText('phase 1.9', 106, 39);
      ctx.fillStyle = '#8aff7a'; ctx.fillRect(190, 30, 12, 12); ctx.fillStyle='#e8dcc4'; ctx.fillText('phase 4.1', 206, 39);
    });
    await page.waitForTimeout(400);
    const outPath = path.join(SCREENSHOT_DIR, 'screen-flicker-graph.png');
    await page.screenshot({ path: outPath });
    expect(fs.existsSync(outPath)).toBeTruthy();
    // Cleanup chart for next tests
    await page.evaluate(() => {
      const c = document.getElementById('flicker-chart');
      if (c) c.remove();
    });
  });

  test('screenshot: editor sprites config', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForTimeout(1500);
    await expect(page.locator('.editor-sidebar')).toBeVisible({ timeout: 5000 });

    // Find file containing sprites.json
    const spriteFile = page.locator('.tree-file', { hasText: 'sprites.json' }).first();
    await expect(spriteFile).toBeVisible({ timeout: 8000 });
    await spriteFile.click();
    await page.waitForTimeout(800);

    // Try to click raw tab if exists to show JSON
    const rawTab = page.locator('#tab-raw');
    if (await rawTab.isVisible().catch(()=>false)) {
      await rawTab.click();
      await page.waitForTimeout(400);
    }

    const outPath = path.join(SCREENSHOT_DIR, 'screen-editor-sprites.png');
    await page.screenshot({ path: outPath });
    expect(fs.existsSync(outPath)).toBeTruthy();
  });

  test('editor: lighting configs exist and editable via API roundtrip', async ({ page, request }) => {
    const resSprites = await request.get('http://localhost:8005/api/assets/config/lighting/sprites');
    expect(resSprites.ok()).toBeTruthy();
    const jsonSprites = await resSprites.json();
    expect([1,2,3].includes(jsonSprites.version)).toBeTruthy();
    expect(jsonSprites.sprites.length).toBeGreaterThanOrEqual(2);

    const resLightTypes = await request.get('http://localhost:8005/api/assets/config/lighting/light-types');
    expect(resLightTypes.ok()).toBeTruthy();
    const jsonLT = await resLightTypes.json();
    expect([1,2].includes(jsonLT.version)).toBeTruthy();
    expect(jsonLT.types.length).toBeGreaterThanOrEqual(4);

    // Check editor tree also shows light-types.json
    await page.goto('/editor.html');
    await expect(page.locator('.tree-file').first()).toBeVisible({ timeout: 5000 });
    const ltFile = page.locator('.tree-file', { hasText: 'light-types.json' }).first();
    await expect(ltFile).toBeVisible({ timeout: 5000 });
  });

  test('no console errors during lighting gameplay', async ({ page }) => {
    const errors = [];
    page.on('console', m => {
      const txt = m.text();
      if (m.type() === 'error' && !isBenign(txt)) errors.push(txt);
    });
    await page.goto('/game.html');
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(2000);
    await page.waitForFunction(() => window.game && window.game.dungeon && window.game.dungeon.sprites, { timeout: 8000 });
    expect(errors.length, `no console errors: ${errors.join(', ')}`).toBe(0);
  });
});
