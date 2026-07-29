import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

const SRC = process.cwd();
const CONFIG_ROOT = path.join(SRC, "assets", "config");

const EXPECTED_FILES = [
  "rendering/rendering.json",
  "rendering/palette.json",
  "rendering/pom.json",
  "rendering/pbr.json",
  "rendering/ao.json",
  "rendering/raymarch.json",
  "rendering/materials-proc.json",
  "lighting/lighting.json",
  "lighting/shadows.json",
  "lighting/fog.json",
  "geometry/chamfer.json",
  "geometry/corners.json",
  "gameplay/generator.json",
  "gameplay/player.json",
  "ui/map.json",
  "ui/debug.json",
  "main.json"
];

test("all 16 dedicated configs + main.json exist on disk", async () => {
  for (const rel of EXPECTED_FILES) {
    const fp = path.join(CONFIG_ROOT, rel);
    const data = await fs.readFile(fp, "utf8").then(JSON.parse).catch(() => null);
    assert(data, `config file exists and is valid JSON: ${rel}`);
  }
});

test("main.json v3 delegates to subfolders with _readme", async () => {
  const main = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "main.json"), "utf8"));
  assert.equal(main.version, 3, "main v3");
  assert(main._readme && main._readme.includes("Dedicated"), "should have _readme about delegation");
  // minimal fallback only
  const keys = Object.keys(main);
  assert(keys.length <= 5, `main.json should be minimal fallback, got keys ${keys}`);
});

test("pom.json has centered reference plane 0.5 + grazing safety clamping + presets", async () => {
  const pom = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "rendering/pom.json"), "utf8"));
  assert.equal(pom.enabled, true);
  assert(pom.strength && typeof pom.strength.wall === 'number' && pom.strength.wall > 0.03, "strength.wall >0.03");
  assert(pom.steps >= 8, "steps >=8");
  assert(pom.clamping, "has clamping");
  assert(pom.clamping.maxOffset <= 0.15 && pom.clamping.maxOffset >= 0.05, "maxOffset 0.05..0.15");
  assert(pom.clamping.minViewZ >= 0.05 && pom.clamping.minViewZ <= 0.15, "minViewZ ~0.08");
  assert(pom.clamping.minEffectiveVz >= 0.1 && pom.clamping.minEffectiveVz <= 0.3, "minEffectiveVz ~0.18");
  assert(pom.fading && pom.fading.fadeStart < pom.fading.fadeEnd, "fadeStart < fadeEnd");
  assert(pom.reference && pom.reference.plane === 0.5, "reference plane 0.5 centered");
  assert(pom.presets && pom.presets.off && pom.presets.default && pom.presets.deep, "presets off/default/deep");
});

test("fog.json exponential squared formula with presets and base 0.06", async () => {
  const fog = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "lighting/fog.json"), "utf8"));
  assert(fog.enabled === true);
  assert(Math.abs(fog.base - 0.06) < 0.02, `fog base should be ~0.06, got ${fog.base}`);
  assert(Math.abs(fog.squared - 0.005) < 0.005, `fog squared ~0.005, got ${fog.squared}`);
  assert(fog.presets && fog.presets.off.base === 0 && fog.presets.heavy.base > 0.1, "presets off/heavy");
  assert(fog.formula && fog.formula.includes("dist"), "formula mentions dist");
});

test("shadows.json bias with dominant-axis snap + factors", async () => {
  const sh = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "lighting/shadows.json"), "utf8"));
  assert(sh.bias.traceNormalOffset >= 0.08 && sh.bias.traceNormalOffset <= 0.15, "traceNormalOffset ~0.10");
  assert(sh.bias.dirOffset >= 0.04 && sh.bias.dirOffset <= 0.1, "dirOffset ~0.06");
  assert(sh.sun.shadowFactor > 0 && sh.sun.shadowFactor < 1, "sun shadowFactor 0..1");
  assert(sh.point.shadowFactor > 0 && sh.point.shadowFactor < sh.sun.shadowFactor + 0.1, "point factor stronger than sun or similar");
  assert(sh.sun.maxDist >= 10, "sun maxDist >=10");
  assert(sh.traceNormal && sh.traceNormal.threshold <= 0.05, "normal threshold <=0.05");
  assert(sh.dda && sh.dda.maxSteps === 64, "DDA 64 steps");
});

test("ao.json affect sun/point/ambient with softened material factors", async () => {
  const ao = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "rendering/ao.json"), "utf8"));
  assert(ao.affect && ao.affect.sun < 0.5 && ao.affect.point < 0.6, "sun/point affect low to avoid black mortar");
  assert(ao.affect.ambient === 1 || ao.affect.ambient >= 0.9, "ambient affect ~1.0");
  assert(ao.material.groutFactor >= 0.7 && ao.material.groutFactor <= 0.85, "groutFactor 0.78 soft");
  assert(ao.material.faceFactor >= 0.9, "faceFactor >=0.9");
  assert(ao.material.min >= 0.65, "ao.min >=0.65 softened");
});

test("pbr.json has emissive, F0, clamp, debug modes 0..8", async () => {
  const pbr = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "rendering/pbr.json"), "utf8"));
  assert(pbr.enabled === true);
  assert(pbr.roughness.clampMin >= 0.1 && pbr.roughness.clampMax <= 1.0);
  assert(pbr.emissive && typeof pbr.emissive.albedoMul === 'number');
  assert(pbr.fresnel.f0Dielectric === 0.04, "F0 dielectric 0.04");
  assert(pbr.debug && pbr.debug.modes.length === 9, "9 debug modes OFF..Emissive");
  assert(pbr.debug.modes[0] === "OFF" && pbr.debug.modes[1] === "Albedo");
});

test("chamfer.json visible defaults floor 0.30 ceil 0.24 wall 0.28 + shading ranges", async () => {
  const ch = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "geometry/chamfer.json"), "utf8"));
  assert(ch.enabled === true);
  assert(Math.abs(ch.size.floor - 0.30) < 0.05, `floor ~0.30 got ${ch.size.floor}`);
  assert(Math.abs(ch.size.ceil - 0.24) < 0.05);
  assert(Math.abs(ch.size.wall - 0.28) < 0.05);
  assert(ch.shading.darken >= 0.4 && ch.shading.darken <= 0.7, "darken 0.55");
  assert(typeof ch.shading.roundCorners === 'boolean', "roundCorners bool");
  assert(ch.trim && typeof ch.trim.floorStrength === 'number', "trim strengths");
  assert(ch.ranges && ch.ranges.creviceEnd < ch.ranges.creviceSmoothEnd, "ranges creviceEnd < smoothEnd");
  assert(ch.debugToggle === "Key 7");
});

test("corners.json intruding rounded corners radius 0.15 mode 2 all outer+inner + search bands", async () => {
  const co = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "geometry/corners.json"), "utf8"));
  assert(co.enabled === true);
  assert(Math.abs(co.radius - 0.15) < 0.05, `radius ~0.15 got ${co.radius}`);
  assert(co.clamp && co.clamp.min <= 0.02 && co.clamp.max >= 0.45, "clamp 0.02..0.45");
  assert(co.mode === 2, "mode 2 = round all outer+inner default");
  assert(co.modes && co.modes["0"].includes("bevel") && co.modes["2"].includes("round all"));
  assert(co.inner === true, "inner true");
  assert(co.search && co.search.bandNear === 0.08 && co.search.bandFarFactor === 2, "search bands");
  assert(co.search.bandFarExtra === 0.15 && co.search.sectorThreshold === 0.02);
  assert(co.shading.normalMix >= 0.8 && co.shading.normalMix <= 1.0, "normalMix ~0.92");
  assert(co.shading.albedoBoost >= 0 && co.shading.roughnessMul < 1, "albedoBoost + roughnessMul");
  assert(co.debugToggle === "Key 8");
});

test("rendering.json fov + eye + surface + toggles", async () => {
  const r = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "rendering/rendering.json"), "utf8"));
  assert(r.fov === 1.0 || r.fov >= 0.8, "fov ~1.0");
  assert(r.eye && typeof r.eye.height === 'number' && r.eye.height === 0.5, "eye height 0.5");
  assert(r.surface.floorAlbedoMul === 0.7 && r.surface.ceilAlbedoMul === 0.8 && r.surface.wallDarkenSide === 0.85);
  assert(r.toggles && r.toggles.chamferDefault === true && r.toggles.cornerDefault === true, "toggles include chamfer/corner default true");
});

test("map.json Pixelify Sans font + parchment colors + layout", async () => {
  const m = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "ui/map.json"), "utf8"));
  assert(m.font && m.font.family === "Pixelify Sans", "font Pixelify Sans");
  assert(m.font.fallback.includes("Georgia"), "fallback Georgia");
  assert(m.font.googleName.includes("Pixelify"), "googleName contains Pixelify");
  assert(m.display.position === "fullscreen" && m.display.opacity >= 0.9, "display fullscreen opacity 0.92");
  assert(m.parchment.bg === "#e8dcc4" && m.parchment.scan === "#ddd0b8", "parchment colors #e8dcc4 / #ddd0b8");
  assert(m.colors && m.colors.gold === "#c9a84c" && m.colors.roles.treasure === "#c9a84c");
  assert(m.layout.legend.swatch === 12 && m.layout.legend.gap === 8, "legend swatch 12 gap 8");
});

test("debug.json keys 1..8 R M + hud timeout", async () => {
  const d = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "ui/debug.json"), "utf8"));
  const k = d.keys;
  assert(k["1"].toLowerCase().includes("grid") && k["2"].toLowerCase().includes("lighting"));
  assert(k["4"].includes("POM") && k["5"].includes("Fog") && k["6"].includes("PBR debug"));
  assert(k["7"].includes("Chamfer") && k["8"].includes("Corner"));
  assert(k["R"] && k["M"]);
  assert(d.hud.timeoutMs === 1500);
});

test("generator.json robust: roomAttempts 200 + single material boundaries", async () => {
  const g = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "gameplay/generator.json"), "utf8"));
  assert(g.roomAttempts === 200, "roomAttempts 200");
  assert(g.mapW === 64 && g.mapH === 64, "64x64 default");
  assert(g.boundaryWallId === 1, "boundaryWallId 1");
  assert(g.roomTarget >= 10, "roomTarget >=10");
  assert(Array.isArray(g.corridorWidthMainWeights) && g.corridorWidthMainWeights.length === 3, "corridorWidthMainWeights 3");
});

test("lighting.json ambient + sun dir + player torch", async () => {
  const l = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "lighting/lighting.json"), "utf8"));
  assert(l.ambient.level === 0.36 && Array.isArray(l.ambient.color), "ambient level 0.36");
  assert(l.sun.dir.length === 3 && l.sun.intensity === 1.5, "sun dir + intensity 1.5");
  assert(l.player.color[0] === 1 && l.player.color[1] === 0.9 && l.player.intensity === 1.8, "player warm torch");
});

test("config.js CONFIG_PATHS exists and covers all logical names", async () => {
  const cfgJs = await fs.readFile(path.join(SRC, "config", "config.js"), "utf8");
  assert(cfgJs.includes("CONFIG_PATHS"), "has CONFIG_PATHS");
  const logicalNames = ['rendering','palette','pom','pbr','ao','lighting','shadows','fog','chamfer','corners','raymarch','generator','map','materials-proc','player','debug'];
  for (const name of logicalNames) {
    assert(cfgJs.includes(`'${name}'`) || cfgJs.includes(`"${name}"`), `CONFIG_PATHS includes ${name}`);
  }
  assert(cfgJs.includes("getAllRenderConfigs"), "has getAllRenderConfigs batch loader");
  assert(cfgJs.includes("config/rendering/rendering") && cfgJs.includes("config/lighting/fog"), "candidates include nested first");
});

test("server.js walkJsonFiles recursive + safeCategory slash allowed + favicon 204", async () => {
  const serverJs = await fs.readFile(path.join(SRC, "server", "server.js"), "utf8");
  assert(serverJs.includes("walkJsonFiles") && serverJs.includes("isDirectory"), "recursive walk");
  assert(serverJs.includes("safeCategory") && serverJs.includes("split('/')"), "safeCategory allows slash with per-segment check");
  assert(serverJs.includes("/favicon.ico") && serverJs.includes("204"), "favicon 204 handling");
  assert(serverJs.includes("/api/assets/") && serverJs.includes("rest.split"), "supports nested /api/assets/<cat>/<name> where cat includes slashes");
});
