// Shader parity harness — proves fsSource refactors are pixel-identical.
// Usage:
//   node tools/shader-parity.mjs baseline <out.json>
//   node tools/shader-parity.mjs after <out.json> <baseline.json>   (captures + diffs, exits 1 on any diff)
//
// Determinism: forces a fixed dungeon seed via game.regen(seed), sets explicit
// player poses, and renders at a FROZEN time so flicker/pulse/bob are identical
// across runs. Captures canvas pixels synchronously right after each manual
// render() call, so the RAF loop can't interleave a different frame.

import { chromium } from '@playwright/test';
import fs from 'fs';

const MODE = process.argv[2];
const OUT = process.argv[3];
const BASELINE = process.argv[4];
const BASE_URL = process.env.PARITY_URL || 'http://localhost:8011';
const SEED = 424242;
const FROZEN_T = 2.5;

if (!['baseline', 'after'].includes(MODE) || !OUT) {
  console.error('usage: node tools/shader-parity.mjs <baseline|after> <out.json> [baseline.json]');
  process.exit(2);
}

const LIGHTS_MODE = process.env.LIGHTS_FROM_TEX == null ? null : (process.env.LIGHTS_FROM_TEX === '1');
const COVE_MODE = process.env.COVE_FIELD == null ? null : parseInt(process.env.COVE_FIELD, 10);

const capture = async (page) => {
  return await page.evaluate(async ({ seed, T, lightsMode, coveMode }) => {
    const g = window.game;
    const canvas = document.getElementById('game-canvas');
    const r = () => window._gameRenderer;
    // Deterministic dungeon + camera
    await g.regen(seed);
    if (lightsMode !== null && typeof r().setLightsFromTex === 'function') r().setLightsFromTex(lightsMode);
    if (coveMode !== null && typeof r().setCoveField === 'function') r().setCoveField(coveMode);
    const d = window._gameDungeon;
    const p = window._gamePlayer;
    const sx = Math.floor(d.startX) + 0.5;
    const sy = Math.floor(d.startY) + 0.5;

    const frames = {};
    const shot = (name) => {
      r().render(d, p, T);                 // manual, frozen-time render
      frames[name] = canvas.toDataURL('image/png'); // capture same sync tick
    };
    const setPose = (a) => { p.setPosition(sx, sy, a); };

    // --- Group A: angle sweep, default render state ---
    const N = 16;
    for (let i = 0; i < N; i++) {
      setPose((i / N) * Math.PI * 2 - Math.PI / 2);
      shot('sweep_' + i);
    }

    // helpers to drive toggle state to a target using the toggle return values
    const drive = (fn, target) => { for (let k = 0; k < 3 && r()[fn]() !== target; k++) {} };
    const setPbrDbg = (target) => { for (let k = 0; k < 10 && r().cyclePBRDebug() !== target; k++) {} };

    // --- Group B: branch variants at two angles ---
    for (const ai of [3, 9]) {
      setPose((ai / N) * Math.PI * 2 - Math.PI / 2);
      const tag = 'a' + ai + '_';

      drive('toggleChamfer', false); shot(tag + 'chamferOff'); drive('toggleChamfer', true);
      drive('togglePOM', false);     shot(tag + 'pomOff');     drive('togglePOM', true);
      drive('togglePBR', false);     shot(tag + 'pbrOff');     drive('togglePBR', true);
      drive('toggleGridDebug', true); shot(tag + 'gridDebug'); drive('toggleGridDebug', false);
      for (const m of [1, 3, 4, 5, 7, 8]) { setPbrDbg(m); shot(tag + 'pbrDbg' + m); }
      setPbrDbg(0);
    }
    return frames;
  }, { seed: SEED, T: FROZEN_T, lightsMode: LIGHTS_MODE, coveMode: COVE_MODE });
};

const diff = async (page, baselineFrames, afterFrames) => {
  return await page.evaluate(async ({ baselineFrames, afterFrames }) => {
    const load = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const cv = document.createElement('canvas');
    const out = [];
    for (const key of Object.keys(baselineFrames)) {
      if (!(key in afterFrames)) { out.push({ key, missing: true }); continue; }
      if (baselineFrames[key] === afterFrames[key]) { out.push({ key, diffPixels: 0, maxDelta: 0, exact: true }); continue; }
      const [a, b] = await Promise.all([load(baselineFrames[key]), load(afterFrames[key])]);
      cv.width = a.width; cv.height = a.height;
      const ctx = cv.getContext('2d');
      ctx.drawImage(a, 0, 0); const pa = ctx.getImageData(0, 0, a.width, a.height).data;
      ctx.drawImage(b, 0, 0); const pb = ctx.getImageData(0, 0, b.width, b.height).data;
      let diffPixels = 0, maxDelta = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const dr = Math.abs(pa[i] - pb[i]), dg = Math.abs(pa[i + 1] - pb[i + 1]), db = Math.abs(pa[i + 2] - pb[i + 2]);
        const dm = Math.max(dr, dg, db);
        if (dm > 0) diffPixels++;
        if (dm > maxDelta) maxDelta = dm;
      }
      out.push({ key, diffPixels, maxDelta, exact: false });
    }
    return out;
  }, { baselineFrames, afterFrames });
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE_URL + '/game.html');
  await page.waitForFunction(() => window.game && window._gameRenderer && window._gameDungeon && window._gamePlayer, { timeout: 15000 });
  await page.waitForTimeout(500);

  const frames = await capture(page);
  fs.writeFileSync(OUT, JSON.stringify(frames));
  console.log(`captured ${Object.keys(frames).length} frames -> ${OUT}`);

  const shaderErr = errors.filter((e) => /shader|compile|program|WebGL/i.test(e));
  if (shaderErr.length) { console.error('SHADER/GL ERRORS:\n' + shaderErr.join('\n')); }

  let exitCode = shaderErr.length ? 1 : 0;
  if (MODE === 'after') {
    if (!BASELINE || !fs.existsSync(BASELINE)) { console.error('baseline json missing'); await browser.close(); process.exit(2); }
    const baselineFrames = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const results = await diff(page, baselineFrames, frames);
    const bad = results.filter((r) => r.missing || r.diffPixels > 0);
    for (const r of results) {
      if (r.missing) console.log(`  MISSING  ${r.key}`);
      else if (r.diffPixels > 0) console.log(`  DIFF     ${r.key}  pixels=${r.diffPixels} maxDelta=${r.maxDelta}`);
    }
    console.log(`\nparity: ${results.length - bad.length}/${results.length} frames identical`);
    if (bad.length) { console.error(`REGRESSION: ${bad.length} frame(s) differ`); exitCode = 1; }
    else console.log('PASS: all frames pixel-identical');
  }
  await browser.close();
  process.exit(exitCode);
})();
