import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

const SRC = process.cwd();
const CONFIG_ROOT = path.join(SRC, "assets", "config");

test("chamfer.json has grid tile chamfer section with subtle defaults", async () => {
  const ch = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "geometry/chamfer.json"), "utf8"));
  assert(ch.enabled === true, "enabled true");
  assert(ch.version === 1, "version 1");
  // old fields still present
  assert(Math.abs(ch.size.floor - 0.30) < 0.05, `old floor ~0.30 got ${ch.size.floor}`);
  assert(Math.abs(ch.size.ceil - 0.24) < 0.05, `old ceil ~0.24 got ${ch.size.ceil}`);
  assert(Math.abs(ch.size.wall - 0.28) < 0.05, `old wall ~0.28 got ${ch.size.wall}`);
  assert(ch.shading.darken >= 0.4 && ch.shading.darken <= 0.7, "old shading.darken 0.4-0.7");
  // new grid
  assert(ch.grid, "grid object exists");
  assert(typeof ch.grid.enabled === "boolean", "grid.enabled bool");
  assert(ch.grid.enabled === true, "grid.enabled true default");
  const floorSize = ch.grid.floorSize;
  const ceilSize = ch.grid.ceilSize;
  assert(typeof floorSize === "number" && floorSize >= 0.02 && floorSize <= 0.12, `grid.floorSize 0.02..0.12 got ${floorSize}`);
  assert(typeof ceilSize === "number" && ceilSize >= 0.02 && ceilSize <= 0.12, `grid.ceilSize 0.02..0.12 got ${ceilSize}`);
  const floorDarken = ch.grid.floorDarken;
  const ceilDarken = ch.grid.ceilDarken;
  assert(typeof floorDarken === "number" && floorDarken >= 0.75 && floorDarken <= 0.98, `grid.floorDarken 0.75..0.98 subtle, got ${floorDarken}`);
  assert(typeof ceilDarken === "number" && ceilDarken >= 0.75 && ceilDarken <= 0.98, `grid.ceilDarken 0.75..0.98 got ${ceilDarken}`);
  // floorDarken should be softer than shading.darken (closer to 1)
  assert(floorDarken > ch.shading.darken, "floor darken softer than wall cove darken");
  assert(ceilDarken > ch.shading.darken, "ceil darken softer than wall cove darken");
  const floorTrim = ch.grid.floorTrim;
  const ceilTrim = ch.grid.ceilTrim;
  assert(typeof floorTrim === "number" && floorTrim >= 0 && floorTrim <= 0.2, `floorTrim 0..0.2 got ${floorTrim}`);
  assert(typeof ceilTrim === "number" && ceilTrim >= 0 && ceilTrim <= 0.2, `ceilTrim 0..0.2 got ${ceilTrim}`);
  const floorRough = ch.grid.floorRoughness ?? ch.grid.floorRough;
  const ceilRough = ch.grid.ceilRoughness ?? ch.grid.ceilRough;
  assert(typeof floorRough === "number" && floorRough >= 0 && floorRough <= 1, `floorRoughness 0..1 got ${floorRough}`);
  assert(typeof ceilRough === "number" && ceilRough >= 0 && ceilRough <= 1, `ceilRoughness 0..1 got ${ceilRough}`);
  const floorBlend = ch.grid.floorBlend;
  const ceilBlend = ch.grid.ceilBlend;
  assert(typeof floorBlend === "number" && floorBlend >= 0 && floorBlend <= 1, `floorBlend 0..1 got ${floorBlend}`);
  assert(typeof ceilBlend === "number" && ceilBlend >= 0 && ceilBlend <= 1, `ceilBlend 0..1 got ${ceilBlend}`);
  // gridRanges
  const gr = ch.gridRanges;
  assert(gr, "gridRanges exists");
  assert(typeof gr.creviceEnd === "number" && typeof gr.creviceSmoothEnd === "number", "gridRanges crevice thresholds");
  assert(gr.creviceEnd < gr.creviceSmoothEnd, "creviceEnd < creviceSmoothEnd");
  assert(typeof gr.trimStart === "number" && typeof gr.trimMid === "number" && typeof gr.trimEnd === "number", "gridRanges trim thresholds");
  assert(gr.trimStart <= gr.trimMid && gr.trimMid <= gr.trimEnd, "trimStart <= trimMid <= trimEnd");
});

test("shaders.js contains grid tile chamfer logic for floor and ceiling using fract world", async () => {
  const shaderSrc = await fs.readFile(path.join(SRC, "render", "shaders.js"), "utf8");
  // uniforms
  assert(shaderSrc.includes("u_chamferGridEnabled"), "has u_chamferGridEnabled uniform");
  assert(shaderSrc.includes("u_chamferGridFloorSize"), "has floorSize grid uniform");
  assert(shaderSrc.includes("u_chamferGridCeilSize"), "has ceilSize grid uniform");
  assert(shaderSrc.includes("u_chamferGridFloorDarken") && shaderSrc.includes("u_chamferGridCeilDarken"), "has darken grid uniforms");
  assert(shaderSrc.includes("u_chamferGridFloorTrim") && shaderSrc.includes("u_chamferGridCeilTrim"), "has trim grid uniforms");
  // logic using fract of world
  // Should have fract(floorWorld) and fract(ceilWorld)
  assert(shaderSrc.includes("fract(floorWorld)"), "shader uses fract(floorWorld) for grid");
  assert(shaderSrc.includes("fract(ceilWorld)"), "shader uses fract(ceilWorld) for grid");
  // edge distance logic
  assert(/distX.*min.*f\.x.*1\.0.*-.*f\.x/.test(shaderSrc) || shaderSrc.includes("distX = min(f.x"), "has distX edge logic");
  assert(shaderSrc.includes("edgeDist = min(distX, distY)"), "has edgeDist = min(distX,distY)");
  // AO darken for grid
  assert(shaderSrc.includes("grid") && shaderSrc.includes("floorWorld") && shaderSrc.includes("ceilWorld"), "mentions grid with floorWorld/ceilWorld");
  // ensure it checks gridEnabled and chamferEnabled together
  assert(shaderSrc.includes("u_chamferEnabled == 1 && u_chamferGridEnabled == 1"), "checks both enabled flags");
  // ensure it has 4 places (at least 2 floor, 2 ceil) — count occurrences of grid tile comment
  const gridComments = (shaderSrc.match(/grid tile chamfer/g) || []).length;
  assert(gridComments >= 4, `should have grid tile chamfer in 4 places (hit floor/ceil + fallback floor/ceil), got ${gridComments}`);
});

test("renderer-gpu.js uploads grid chamfer uniforms", async () => {
  const rendererSrc = await fs.readFile(path.join(SRC, "render", "renderer-gpu.js"), "utf8");
  assert(rendererSrc.includes("u_chamferGridEnabled"), "has grid enabled uniform location");
  assert(rendererSrc.includes("u_chamferGridFloorSize") && rendererSrc.includes("u_chamferGridCeilSize"), "has floor/ceil size locations");
  assert(rendererSrc.includes("u_chamferGridFloorDarken") && rendererSrc.includes("u_chamferGridCeilDarken"), "has darken uniform uploads");
  assert(rendererSrc.includes("u_chamferGridFloorTrim") && rendererSrc.includes("u_chamferGridCeilTrim"), "has trim uploads");
  assert(rendererSrc.includes("u_chamferGridFloorRough") && rendererSrc.includes("u_chamferGridCeilRough"), "has roughness uploads");
  assert(rendererSrc.includes("u_chamferGridFloorBlend") && rendererSrc.includes("u_chamferGridCeilBlend"), "has blend uploads");
  // ensure it resolves from config path chamfer.grid.*
  assert(rendererSrc.includes("chamfer.grid.floorSize"), "resolves chamfer.grid.floorSize");
  assert(rendererSrc.includes("chamfer.grid.ceilSize"), "resolves chamfer.grid.ceilSize");
  assert(rendererSrc.includes("chamfer.grid.floorDarken"), "resolves floorDarken");
  // ensure it uploads via gl.uniform1f / uniform1i
  assert(rendererSrc.includes("gl.uniform1f(ul.u_chamferGridFloorSize"), "uploads floorSize");
  assert(rendererSrc.includes("gl.uniform1i(ul.u_chamferGridEnabled"), "uploads enabled flag");
});

test("grid chamfer is subtle — defaults not too strong", async () => {
  const ch = JSON.parse(await fs.readFile(path.join(CONFIG_ROOT, "geometry/chamfer.json"), "utf8"));
  // size must be small, not chunky
  assert(ch.grid.floorSize <= 0.09, `floorSize should be <=0.09 for subtle, got ${ch.grid.floorSize}`);
  assert(ch.grid.ceilSize <= 0.08, `ceilSize should be <=0.08 for subtle, got ${ch.grid.ceilSize}`);
  // darken must be >0.8 (faint), not 0.5 (strong)
  assert(ch.grid.floorDarken >= 0.8, `floorDarken should be >=0.8 subtle, got ${ch.grid.floorDarken}`);
  assert(ch.grid.ceilDarken >= 0.8, `ceilDarken should be >=0.8 subtle, got ${ch.grid.ceilDarken}`);
  // trim must be small
  assert(ch.grid.floorTrim <= 0.10, `floorTrim <=0.10 subtle, got ${ch.grid.floorTrim}`);
  assert(ch.grid.ceilTrim <= 0.10, `ceilTrim <=0.10 subtle, got ${ch.grid.ceilTrim}`);
});
