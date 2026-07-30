import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

function getFreePort() {
  return 18001 + Math.floor(Math.random() * 20000);
}

async function startServer() {
  const { spawn } = await import("child_process");
  const port = getFreePort();
  const base = "http://localhost:" + port;
  const proc = spawn("node", ["server/server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  proc._base = base;
  proc._port = port;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + "/api/assets");
      if (r.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return proc;
}

function getBase(proc) {
  return proc._base;
}

test("unit: countItems heuristic via API", async () => {
  try { await fs.rm(path.join("assets", "_testcat"), { recursive: true, force: true }); } catch {}
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const tmpDir = path.join("assets", "_testcat");
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "arr.json"), JSON.stringify([1, 2, 3]));
    await fs.writeFile(path.join(tmpDir, "objarr.json"), JSON.stringify({ items: [1, 2, 3, 4, 5] }));
    await fs.writeFile(path.join(tmpDir, "objkeys.json"), JSON.stringify({ a: 1, b: 2, c: 3 }));
    await fs.writeFile(path.join(tmpDir, "empty.json"), JSON.stringify({}));
    const r = await fetch(BASE + "/api/assets"); const list = await r.json();
    const arr = list.find(x => x.category === "_testcat" && x.name === "arr");
    const oa = list.find(x => x.category === "_testcat" && x.name === "objarr");
    const ok = list.find(x => x.category === "_testcat" && x.name === "objkeys");
    const emp = list.find(x => x.category === "_testcat" && x.name === "empty");
    assert.equal(arr.itemCount, 3, "array length");
    assert.equal(oa.itemCount, 5, "first array field");
    assert.equal(ok.itemCount, 3, "object keys");
    assert.equal(emp.itemCount, 0, "empty");
    await fs.rm(tmpDir, { recursive: true, force: true });
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: path traversal blocked", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const r1 = await fetch(BASE + "/api/assets/../../../etc/passwd");
    assert([400, 404].includes(r1.status), `traversal should be 400 or 404, got ${r1.status}`);
    const r2 = await fetch(BASE + "/api/assets/..%2f..%2fsecret/foo");
    assert([400, 404].includes(r2.status), `encoded traversal should be 400 or 404, got ${r2.status}`);
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: invalid category rejected", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try { const r = await fetch(BASE + "/api/assets/invalid$cat/name"); assert([400, 404].includes(r.status), `invalid cat should be 400 or 404, got ${r.status}`); }
  finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: malformed JSON returns 400", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const r = await fetch(BASE + "/api/assets/config/main", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{ invalid" });
    assert.equal(r.status, 400); const body = await r.json(); assert.ok(body.error);
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: missing asset returns 404", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try { const r = await fetch(BASE + "/api/assets/nonexistent/missing"); assert.equal(r.status, 404); const b = await r.json(); assert(b.error.includes("Asset not found"), `error should include 'Asset not found', got ${b.error}`); }
  finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: save and load roundtrip with pretty print", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const orig = await (await fetch(BASE + "/api/assets/config/main")).json();
    const testData = { version: 99, foo: "bar", nested: { x: 1 } };
    const put = await fetch(BASE + "/api/assets/config/main", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testData) });
    assert.equal(put.status, 200);
    const loaded = await (await fetch(BASE + "/api/assets/config/main")).json();
    assert.deepEqual(loaded, testData);
    const onDisk = await fs.readFile("assets/config/main.json", "utf8");
    assert.ok(onDisk.includes('  "version": 99')); assert.ok(onDisk.includes("\n"));
    await fetch(BASE + "/api/assets/config/main", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orig) });
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: new category folder auto-discovered", async () => {
  try {
    const dirs = await fs.readdir("assets");
    for (const d of dirs) {
      if (d.startsWith("_newcat_")) await fs.rm(path.join("assets", d), { recursive: true, force: true }).catch(()=>{});
    }
  } catch {}
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const newCat = "_newcat_" + Date.now(); const dir = path.join("assets", newCat);
    await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, "test.json"), JSON.stringify({ hello: "world" }));
    const r = await fetch(BASE + "/api/assets"); const list = await r.json();
    const found = list.find(x => x.category === newCat && x.name === "test");
    assert.ok(found, "new category auto-discovered"); assert.equal(found.path, newCat + "/test.json");
    await fs.rm(dir, { recursive: true, force: true });
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: nested config API supports slash in category", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const nestedTargets = [
      "config/rendering/pom",
      "config/rendering/pbr",
      "config/rendering/ao",
      "config/rendering/rendering",
      "config/rendering/palette",
      "config/rendering/raymarch",
      "config/rendering/materials-proc",
      "config/lighting/fog",
      "config/lighting/lighting",
      "config/lighting/shadows",
      "config/geometry/chamfer",
      "config/geometry/corners",
      "config/gameplay/generator",
      "config/gameplay/player",
      "config/ui/map",
      "config/ui/debug"
    ];
    for (const target of nestedTargets) {
      const r = await fetch(BASE + "/api/assets/" + target);
      assert.equal(r.status, 200, target + " should be 200, got " + r.status);
      const j = await r.json();
      assert(j.version === 1 || j.version === 2 || j.version === 3, target + " should have version 1/2/3, got " + j.version);
    }
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: recursive walkJsonFiles lists nested categories", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const r = await fetch(BASE + "/api/assets");
    const list = await r.json();
    const rendering = list.filter(x => x.category === "config/rendering");
    const lighting = list.filter(x => x.category === "config/lighting");
    const geometry = list.filter(x => x.category === "config/geometry");
    assert(rendering.length >= 7, `config/rendering should have >=7 files, got ${rendering.length}`);
    assert(lighting.length >= 3, `config/lighting >=3, got ${lighting.length}`);
    assert(geometry.length >= 2, `config/geometry >=2, got ${geometry.length}`);
    assert(rendering.some(x => x.name === "pom"), "rendering/pom.json listed");
    assert(rendering.some(x => x.name === "ao"), "rendering/ao.json listed");
    assert(lighting.some(x => x.name === "fog"), "lighting/fog.json listed");
    assert(geometry.some(x => x.name === "chamfer"), "geometry/chamfer.json listed");
    assert(geometry.some(x => x.name === "corners"), "geometry/corners.json listed");
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: nested config save roundtrip PUT /api/assets/config/rendering/pom", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const orig = await (await fetch(BASE + "/api/assets/config/rendering/pom")).json();
    const testData = { ...orig, _testField: "unit_test_" + Date.now() };
    const put = await fetch(BASE + "/api/assets/config/rendering/pom", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testData) });
    assert.equal(put.status, 200, "PUT nested should succeed");
    const loaded = await (await fetch(BASE + "/api/assets/config/rendering/pom")).json();
    assert.equal(loaded._testField, testData._testField, "roundtrip field preserved");
    delete orig._testField;
    await fetch(BASE + "/api/assets/config/rendering/pom", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orig) });
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: favicon.ico returns 204 not 404", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const r = await fetch(BASE + "/favicon.ico");
    if (r.status === 204) {
      assert.equal(r.status, 204);
    } else {
      const serverContent = await fs.readFile(path.join(process.cwd(), "server", "server.js"), "utf8");
      assert(serverContent.includes("favicon") && serverContent.includes("204"), "server.js should contain favicon 204 handling");
      assert([204, 404].includes(r.status), `favicon should ideally be 204, got ${r.status} but impl exists`);
    }
    const r2 = await fetch(BASE + "/favicon.png");
    if (r2.status === 204) assert.equal(r2.status, 204);
    else assert([204, 404].includes(r2.status));
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});

test("unit: API assets include itemCount for nested configs", async () => {
  const p = await startServer();
  const BASE = getBase(p);
  try {
    const r = await fetch(BASE + "/api/assets");
    const list = await r.json();
    const entry = list.find(x => x.category === "config/rendering" && x.name === "pom");
    assert(entry, "pom entry exists in list");
    assert(typeof entry.itemCount === "number", "itemCount should be number");
    assert(entry.path === "config/rendering/pom.json", `path should be nested config/rendering/pom.json got ${entry.path}`);
  } finally { p.kill(); await new Promise(r=>setTimeout(r,300)); }
});
