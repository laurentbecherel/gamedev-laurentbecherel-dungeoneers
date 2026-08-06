import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPolarVisibility, samplePolarVisibility, traceGridDistance } from '../../systems/shadow-visibility.js';

test('grid trace stops at wall and passes through doorway',()=>{
  const g=new Uint8Array(8*6);for(let y=0;y<6;y++)if(y!==3)g[y*8+4]=1;
  const blocked=traceGridDistance(g,8,6,[2.5,2.5],[1,0],10);
  const open=traceGridDistance(g,8,6,[2.5,3.5],[1,0],10);
  assert.ok(blocked>1&&blocked<2);
  assert.ok(open>5);
});

test('polar visibility is deterministic and interpolates wrapped angles',()=>{
  const g=new Uint8Array(8*8);for(let y=0;y<8;y++)g[y*8+6]=1;
  const a=buildPolarVisibility(g,8,8,[3.5,3.5],64,12),b=buildPolarVisibility(g,8,8,[3.5,3.5],64,12);
  assert.deepEqual([...a],[...b]);
  assert.ok(samplePolarVisibility(a,0)<samplePolarVisibility(a,Math.PI));
  assert.ok(Math.abs(samplePolarVisibility(a,-0.001)-samplePolarVisibility(a,Math.PI*2-0.001))<1e-5);
});
