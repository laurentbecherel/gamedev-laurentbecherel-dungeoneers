import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";

const BASE = "http://localhost:8001";

async function startServer() {
  const { spawn } = await import("child_process");
  const proc = spawn("node", ["server/server.js"], { env: { ...process.env, PORT: "8001" }, stdio: "ignore" });
  for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/api/assets"); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
  return proc;
}

test("unit: countItems heuristic via API", async () => {
  const p = await startServer();
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
  } finally { p.kill(); }
});

test("unit: path traversal blocked", async () => {
  const p = await startServer();
  try {
    const r1 = await fetch(BASE + "/api/assets/../../../etc/passwd");
    assert.equal(r1.status, 404);
    const r2 = await fetch(BASE + "/api/assets/..%2f..%2fsecret/foo");
    assert.equal(r2.status, 404);
  } finally { p.kill(); }
});

test("unit: invalid category rejected", async () => {
  const p = await startServer();
  try { const r = await fetch(BASE + "/api/assets/invalid$cat/name"); assert.equal(r.status, 404); }
  finally { p.kill(); }
});

test("unit: malformed JSON returns 400", async () => {
  const p = await startServer();
  try {
    const r = await fetch(BASE + "/api/assets/config/main", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{ invalid" });
    assert.equal(r.status, 400); const body = await r.json(); assert.ok(body.error);
  } finally { p.kill(); }
});

test("unit: missing asset returns 404", async () => {
  const p = await startServer();
  try { const r = await fetch(BASE + "/api/assets/nonexistent/missing"); assert.equal(r.status, 404); const b = await r.json(); assert.equal(b.error, "Asset not found"); }
  finally { p.kill(); }
});

test("unit: save and load roundtrip with pretty print", async () => {
  const p = await startServer();
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
  } finally { p.kill(); }
});

test("unit: new category folder auto-discovered", async () => {
  const p = await startServer();
  try {
    const newCat = "_newcat_" + Date.now(); const dir = path.join("assets", newCat);
    await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, "test.json"), JSON.stringify({ hello: "world" }));
    const r = await fetch(BASE + "/api/assets"); const list = await r.json();
    const found = list.find(x => x.category === newCat && x.name === "test");
    assert.ok(found, "new category auto-discovered"); assert.equal(found.path, newCat + "/test.json");
    await fs.rm(dir, { recursive: true, force: true });
  } finally { p.kill(); }
});
