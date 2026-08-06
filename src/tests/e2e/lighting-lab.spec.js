import { test, expect } from '@playwright/test';

test('Lighting Lab previews four directions, channels and simulation', async ({ page }) => {
  const errors=[];
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text());});
  await page.goto('/editor.html');
  await page.locator('.tree-file',{hasText:'fixtures.json'}).click();
  const lab=page.locator('.lighting-preview');
  await expect(lab).toHaveAttribute('data-preview-ready','true',{timeout:8000});
  await expect(lab.locator('canvas')).toBeVisible();
  for(const label of ['Iron Wall Torch','Standing Iron Brazier','Hanging Cage Lantern','Glowing Crystal Cluster']) await expect(lab.getByRole('button',{name:label,exact:true})).toBeVisible();
  for(const label of ['Front','Right','Back','Left','Final','Albedo','Normal','ORM','Emissive','Shadow']) await expect(lab.getByRole('button',{name:label,exact:true})).toBeVisible();
  await lab.getByRole('button',{name:'Right',exact:true}).click();
  await lab.getByRole('button',{name:'Emissive',exact:true}).click();
  await expect(lab.getByText('4 fixtures valid')).toBeVisible();
  await lab.getByRole('button',{name:'Front',exact:true}).click();
  await lab.getByRole('button',{name:'Final',exact:true}).click();
  await page.waitForTimeout(300);
  await lab.screenshot({path:'../tasks/lighting-sprites/screenshots/screen-lighting-lab.png'});
  await lab.getByRole('button',{name:'Normal',exact:true}).click();
  await lab.screenshot({path:'../tasks/lighting-sprites/screenshots/screen-lighting-lab-normal.png'});
  await lab.getByRole('button',{name:'Distortion',exact:true}).click();
  await lab.screenshot({path:'../tasks/lighting-sprites/screenshots/screen-lighting-lab-distortion.png'});
  await lab.getByRole('button',{name:'Final',exact:true}).click();
  for(const [label,file] of [['Standing Iron Brazier','brazier'],['Hanging Cage Lantern','lantern'],['Glowing Crystal Cluster','crystal']]){
    await lab.getByRole('button',{name:label,exact:true}).click();
    await page.waitForTimeout(120);
    await lab.screenshot({path:`../tasks/lighting-sprites/screenshots/screen-lighting-lab-${file}.png`});
  }
  expect(errors).toEqual([]);
});

test('generated torch light uses the fixture light socket', async ({ page }) => {
  await page.goto('/game.html');
  await page.waitForFunction(()=>window.game?.dungeon?.sprites?.some(s=>s.spriteId==='torch_wall'),null,{timeout:10000});
  const result=await page.evaluate(()=>{
    const s=window.game.dungeon.sprites.find(x=>x.spriteId==='torch_wall');
    const l=window.game.dungeon.lights.find(x=>x.id===s.id);
    return {sprite:[s.x,s.y,s.z],light:l?.pos,wallDir:s.wallDir};
  });
  expect(result.light).toHaveLength(3);
  expect(result.light[2]).toBeGreaterThan(result.sprite[2]+0.35);
  expect(Math.hypot(result.light[0]-result.sprite[0],result.light[1]-result.sprite[1])).toBeGreaterThan(0.1);
});

test('lighting WGSL modules compile when a WebGPU adapter is available', async ({page})=>{
  const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.goto('/game.html');
  const result=await page.evaluate(async()=>{
    if(!navigator.gpu)return{available:false,errors:[]};
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)return{available:false,errors:[]};
    const device=await adapter.requestDevice();
    const shaders=await import('/render/shaders-wgsl.js');
    const sources=[shaders.vsSpriteWgsl,shaders.fsSpriteWgsl,shaders.fsSpriteDistortionWgsl,shaders.fsQuantizeWgsl];
    const errors=[];for(const source of sources){const module=device.createShaderModule({code:source});const info=await module.getCompilationInfo();for(const message of info.messages)if(message.type==='error')errors.push(message.message);}
    device.pushErrorScope('validation');
    const {SpriteGpuRenderer}=await import('/render/sprite-gpu.js');const spriteRenderer=new SpriteGpuRenderer(device);
    const map=device.createTexture({size:{width:2,height:2},format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING});spriteRenderer.setSceneMapTexture(map);await spriteRenderer.init();
    const pipelineError=await device.popErrorScope();if(pipelineError)errors.push(pipelineError.message);
    return{available:true,errors};
  });
  expect(result.errors).toEqual([]);
  expect(consoleErrors.filter(e=>/shader|validation|pipeline/i.test(e))).toEqual([]);
});
