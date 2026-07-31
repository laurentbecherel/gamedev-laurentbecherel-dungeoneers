import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";

function getFreePort(){ return 19001 + Math.floor(Math.random()*20000); }

async function startServer(){
  const { spawn } = await import("child_process");
  const port = getFreePort();
  const base = "http://localhost:"+port;
  const proc = spawn("node", ["server/server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  proc._base = base;
  proc._port = port;
  for(let i=0;i<50;i++){
    try { const r = await fetch(base+"/api/assets"); if(r.ok) break; } catch {}
    await new Promise(r=>setTimeout(r,200));
  }
  return proc;
}

test("SSE endpoint /api/watch returns text/event-stream", async () => {
  const p = await startServer();
  const BASE = p._base;
  try {
    const controller = new AbortController();
    const r = await fetch(BASE+"/api/watch", { signal: controller.signal, headers: { Accept: "text/event-stream" } });
    assert.equal(r.status, 200, "SSE endpoint 200");
    const ct = r.headers.get('content-type') || '';
    assert(ct.includes('text/event-stream'), `content-type should be event-stream got ${ct}`);
    // Read first chunk with timeout
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let got = '';
    const timeout = setTimeout(()=>controller.abort(), 2000);
    try {
      const { value } = await reader.read();
      if (value) got = decoder.decode(value);
    } catch {}
    clearTimeout(timeout);
    controller.abort();
    assert(got.includes('connected') || got.includes(':'), `first SSE chunk should contain connected comment, got ${got.slice(0,100)}`);
  } finally { p.kill(); await new Promise(r=>setTimeout(r,400)); }
});

test("SSE broadcast on PUT /api/assets", async () => {
  const p = await startServer();
  const BASE = p._base;
  try {
    // Start SSE listener in Node (fetch streaming)
    const controller = new AbortController();
    const sseRes = await fetch(BASE+"/api/watch", { signal: controller.signal });
    assert.equal(sseRes.status, 200);
    // Prepare to read stream in background
    let received = null;
    const readPromise = (async () => {
      const reader = sseRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const start = Date.now();
      while(Date.now() - start < 5000){
        try {
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout chunk')), 3000))
          ]);
          if (done) break;
          if (value) {
            buf += decoder.decode(value);
            // look for asset-updated event
            if (buf.includes('asset-updated') && buf.includes('config/lighting/fog')) {
              received = buf;
              break;
            }
          }
        } catch { break; }
      }
    })();

    // Give SSE connection time to establish
    await new Promise(r=>setTimeout(r,400));

    // PUT fog.json to trigger broadcast
    const origFog = await (await fetch(BASE+"/api/assets/config/lighting/fog")).json();
    const testFog = { ...origFog, base: origFog.base + 0.001 };
    const put = await fetch(BASE+"/api/assets/config/lighting/fog", { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(testFog) });
    assert.equal(put.status, 200, "PUT fog should succeed");

    // Wait for SSE to receive
    await Promise.race([readPromise, new Promise(r=>setTimeout(r,4000))]);
    controller.abort();

    // Restore original
    await fetch(BASE+"/api/assets/config/lighting/fog", { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(origFog) });

    // If broadcast implemented, received should contain fog path
    assert(received && received.includes('asset-updated'), `SSE should broadcast asset-updated after PUT, got ${received}`);
    assert(received.includes('fog'), "broadcast should mention fog");
  } finally { p.kill(); await new Promise(r=>setTimeout(r,400)); }
});
