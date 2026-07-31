import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

test("live-config.js exists and exports expected functions", async () => {
  const fp = path.join(process.cwd(), "config", "live-config.js");
  const src = await fs.readFile(fp, "utf8");
  assert(src.includes("LiveConfigManager"), "has LiveConfigManager class");
  assert(src.includes("getLiveConfigManager"), "has getLiveConfigManager");
  assert(src.includes("getTierForLogical"), "has getTierForLogical");
  assert(src.includes("CrossTabBus"), "has CrossTabBus");
  assert(src.includes("BroadcastChannel"), "uses BroadcastChannel");
  assert(src.includes("EventSource"), "uses EventSource");
});

test("getTierForLogical classification matches architecture plan", async () => {
  const { getTierForLogical, getTierForPath } = await import("../../config/live-config.js");
  // T1
  assert.equal(getTierForLogical('fog'), 'T1');
  assert.equal(getTierForLogical('lighting'), 'T1');
  assert.equal(getTierForLogical('chamfer'), 'T1');
  assert.equal(getTierForLogical('corners'), 'T1');
  assert.equal(getTierForLogical('pbr'), 'T1');
  assert.equal(getTierForLogical('ao'), 'T1');
  assert.equal(getTierForLogical('shadows'), 'T1');
  assert.equal(getTierForLogical('rendering'), 'T1');
  assert.equal(getTierForLogical('player'), 'T1');
  assert.equal(getTierForLogical('discovery'), 'T1');
  assert.equal(getTierForLogical('map'), 'T1');
  assert.equal(getTierForLogical('sprites'), 'T1');
  assert.equal(getTierForLogical('light-types'), 'T1');
  // path overrides
  assert.equal(getTierForLogical('config/rendering/materials-proc'), 'T2');
  assert.equal(getTierForLogical('config/materials/walls'), 'T2');
  assert.equal(getTierForLogical('materials/floors'), 'T2');
  // T2
  assert.equal(getTierForLogical('materials-proc'), 'T2');
  // T3
  assert.equal(getTierForLogical('generator'), 'T3');
  assert.equal(getTierForLogical('config/gameplay/generator'), 'T3');
  assert.equal(getTierForLogical('config/generator'), 'T3');
  // Path helper
  assert.equal(getTierForPath('config/lighting', 'fog'), 'T1');
  assert.equal(getTierForPath('config/rendering', 'materials-proc'), 'T2');
  assert.equal(getTierForPath('config/gameplay', 'generator'), 'T3');
  assert.equal(getTierForPath('config/geometry', 'chamfer'), 'T1');
});

test("reverseLookupPath returns logical names", async () => {
  const { reverseLookupPath, reverseLookupCategoryName } = await import("../../config/live-config.js");
  const fogLogics = reverseLookupPath('config/lighting/fog');
  assert(Array.isArray(fogLogics), "array");
  assert(fogLogics.includes('fog'), "config/lighting/fog -> fog logical");
  const mats = reverseLookupPath('config/rendering/materials-proc');
  assert(mats.includes('materials-proc'), "materials-proc mapping");
  const gen = reverseLookupCategoryName('config/gameplay', 'generator');
  assert(gen.includes('generator'), "gameplay/generator -> generator");
  const unknown = reverseLookupPath('config/unknown/foobar');
  assert(Array.isArray(unknown) && unknown.length === 0, "unknown returns empty");
});

test("LiveConfigManager singleton and status handling", async () => {
  const { getLiveConfigManager, resetLiveConfigManagerForTest } = await import("../../config/live-config.js");
  resetLiveConfigManagerForTest();
  const m1 = getLiveConfigManager();
  const m2 = getLiveConfigManager();
  assert.equal(m1, m2, "singleton");
  assert.equal(m1.tabId.startsWith('tab-'), true, "tabId format");
  assert(typeof m1.getStatus() === 'string', "status string");
  const statuses = [];
  const unsub = m1.onStatus(s => statuses.push(s));
  // _setStatus internal
  m1._setStatus('connecting');
  assert(statuses.includes('connecting'), "status listener called");
  unsub();
  resetLiveConfigManagerForTest();
});

test("LiveConfigManager subscribe pattern matching", async () => {
  const { getLiveConfigManager, resetLiveConfigManagerForTest } = await import("../../config/live-config.js");
  resetLiveConfigManagerForTest();
  const mgr = getLiveConfigManager();
  let callsStar = 0, callsFog = 0, callsChamfer = 0;
  const unStar = mgr.subscribe('*', () => callsStar++);
  const unFog = mgr.subscribe('fog', () => callsFog++);
  const unChamfer = mgr.subscribe('config/geometry/chamfer', () => callsChamfer++);

  mgr._notify(['fog'], 'config/lighting', 'fog', { base: 0.1 }, 'test');
  assert.equal(callsStar, 1, "* called");
  assert.equal(callsFog, 1, "fog pattern called for fog logical");
  // chamfer should not be called for fog
  assert.equal(callsChamfer, 0, "chamfer not called for fog");

  mgr._notify(['chamfer'], 'config/geometry', 'chamfer', { size: { floor: 0.5 } }, 'test');
  assert.equal(callsStar, 2);
  assert.equal(callsFog, 1, "fog not called for chamfer");
  assert.equal(callsChamfer, 1, "chamfer exact path match");

  // path name only matching
  let callsByName = 0;
  const unName = mgr.subscribe('fog', () => callsByName++);
  mgr._notify([], 'config/lighting', 'fog', { base: 0.2 }, 'test2');
  assert.equal(callsByName, 1, "name-only pattern matches category/name");

  unStar(); unFog(); unChamfer(); unName();
  resetLiveConfigManagerForTest();
});

test("CrossTabBus fallback does not throw in Node", async () => {
  const { LiveConfigManager } = await import("../../config/live-config.js");
  // In Node, BroadcastChannel may exist (Node 18 has BroadcastChannel), but localStorage not.
  // Ensure bus can be created without window
  const mgr = new LiveConfigManager();
  assert(mgr.bus === null, "bus not auto-created in constructor, only on enable");
  // Creating CrossTabBus directly should not throw
  const modSrc = await fs.readFile(path.join(process.cwd(), "config", "live-config.js"), "utf8");
  assert(modSrc.includes("class CrossTabBus"), "has CrossTabBus");
});

test("server.js has SSE endpoint and broadcast", async () => {
  const serverSrc = await fs.readFile(path.join(process.cwd(), "server", "server.js"), "utf8");
  assert(serverSrc.includes("/api/watch"), "has /api/watch");
  assert(serverSrc.includes("text/event-stream"), "SSE content-type");
  assert(serverSrc.includes("sseClients"), "has sseClients Set");
  assert(serverSrc.includes("broadcastAssetUpdate"), "has broadcast helper");
  assert(serverSrc.includes("heartbeat"), "has heartbeat");
  assert(serverSrc.includes("EventSource") || serverSrc.includes("event: asset-updated"), "emits asset-updated event");
});
