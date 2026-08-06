// SpriteGpuRenderer – pure WebGPU PBR billboard – no WebGL2 fallback (user requested pure WebGPU)
import { getSprite, getSpriteTextures, loadSpriteGL } from './sprite-atlas.js';
import { resolveSpriteFrame } from '../systems/fixtures.js';

export const MAX_LIGHTS_SPRITE = 8;

export class SpriteGpuRenderer {
  constructor(device) {
    this.device = device;
    this.pipeline = null;
    this.bindGroupLayout0 = null;
    this.bindGroupLayout1 = null;
    this.bindGroupLayout2 = null;
    this.uniformBuffer = null;
    this.lightDataBuffer = null;
    this.sampler = null;
    this.textureFilter = 'nearest';
    this.quadBuffer = null;
    this.instanceBuffer = null;
    this.ready = false;
    this.maxLights = MAX_LIGHTS_SPRITE;
    this.sceneMapView = null;
  }

  async init(externalShaders = null) {
    const device = this.device;
    if (!device) throw new Error('No device');

    let vsSrc = externalShaders?.vsSpriteSrc;
    let fsSrc = externalShaders?.fsSpritePBRSrc;
    let fsDistortionSrc = externalShaders?.fsSpriteDistortionSrc;

    if (!vsSrc || !fsSrc || !fsDistortionSrc) {
      const mod = await import('./shaders-wgsl.js');
      vsSrc = vsSrc || mod.vsSpriteWgsl || mod.vsSpriteSrc;
      fsSrc = fsSrc || mod.fsSpriteWgsl || mod.fsSpritePBRSrc;
      fsDistortionSrc = fsDistortionSrc || mod.fsSpriteDistortionWgsl;
      this.maxLights = externalShaders?.MAX_LIGHTS || mod.MAX_LIGHTS || 8;
    }

    // Separate modules for VS and FS to avoid duplicate struct definitions (previous bug caused redefinition of CameraUniforms)
    const vsModule = device.createShaderModule({ code: vsSrc, label: 'spriteVS' });
    const fsModule = device.createShaderModule({ code: fsSrc, label: 'spriteFS' });
    const fsDistortionModule = device.createShaderModule({ code: fsDistortionSrc, label: 'spriteDistortionFS' });

    this.uniformBuffer = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'spriteCamera' });
    this.lightDataBuffer = device.createBuffer({ size: 640, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'spriteLights' });

    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', label: 'spriteSampler' });
    this.nearestSampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'repeat', addressModeV: 'repeat', label: 'spriteNearest' });
    this.textureFilter = String(externalShaders?.textureFilter ?? 'nearest').toLowerCase() === 'linear' ? 'linear' : 'nearest';

    this.bindGroupLayout0 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
      label: 'sprite_bgl0'
    });
    this.bindGroupLayout1 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
      label: 'sprite_bgl1'
    });
    this.bindGroupLayout2 = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
      label: 'sprite_bgl2'
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout0, this.bindGroupLayout1, this.bindGroupLayout2], label: 'sprite_pl_layout' });

    const quadData = new Float32Array([-1, 0, 1, 0, -1, 1, 1, 0, 1, 1, -1, 1]);
    this.quadBuffer = device.createBuffer({ size: quadData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label: 'quadBuf' });
    device.queue.writeBuffer(this.quadBuffer, 0, quadData.buffer, quadData.byteOffset, quadData.byteLength);
    this.instanceCapacity = 512;
    this.instanceBuffer = device.createBuffer({ size: 13 * 4 * this.instanceCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label: 'instanceBuf' });
    this.distortionInstanceBuffer = device.createBuffer({ size: 13 * 4 * this.instanceCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, label: 'distortionInstanceBuf' });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vsModule,
        entryPoint: 'vs_main',
        buffers: [
          { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 13 * 4, stepMode: 'instance', attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32x2' },
              { shaderLocation: 3, offset: 20, format: 'float32x4' },
              { shaderLocation: 4, offset: 36, format: 'float32' },
              { shaderLocation: 5, offset: 40, format: 'float32' },
              { shaderLocation: 6, offset: 44, format: 'float32' },
              { shaderLocation: 7, offset: 48, format: 'float32' },
            ]
          }
        ]
      },
      fragment: { module: fsModule, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list' },
      label: 'sprite_pipeline'
    });
    this.distortionPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vsModule,
        entryPoint: 'vs_main',
        buffers: [
          { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          { arrayStride: 13 * 4, stepMode: 'instance', attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' }, { shaderLocation: 2, offset: 12, format: 'float32x2' },
            { shaderLocation: 3, offset: 20, format: 'float32x4' }, { shaderLocation: 4, offset: 36, format: 'float32' },
            { shaderLocation: 5, offset: 40, format: 'float32' }, { shaderLocation: 6, offset: 44, format: 'float32' },
            { shaderLocation: 7, offset: 48, format: 'float32' },
          ] }
        ]
      },
      fragment: {
        module: fsDistortionModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba16float', blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        } }]
      },
      primitive: { topology: 'triangle-list' },
      label: 'sprite_distortion_pipeline'
    });

    this.cameraBindGroup = device.createBindGroup({
      layout: this.bindGroupLayout0,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }, { binding: 1, resource: { buffer: this.lightDataBuffer } }],
      label: 'sprite_camera_bg'
    });
    this.samplerBindGroup = device.createBindGroup({
      layout: this.bindGroupLayout2,
      entries: [{ binding: 0, resource: this.textureFilter === 'linear' ? this.sampler : this.nearestSampler }, { binding: 1, resource: this.nearestSampler }],
      label: `sprite_sampler_bg_${this.textureFilter}`
    });

    this.ready = true;
  }

  setTextureFilter(value) {
    this.textureFilter = String(value ?? 'nearest').toLowerCase() === 'linear' ? 'linear' : 'nearest';
    if (!this.device || !this.bindGroupLayout2 || !this.sampler || !this.nearestSampler) return;
    this.samplerBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout2,
      entries: [
        { binding: 0, resource: this.textureFilter === 'linear' ? this.sampler : this.nearestSampler },
        { binding: 1, resource: this.nearestSampler },
      ],
      label: `sprite_sampler_bg_${this.textureFilter}`
    });
  }

  setSceneMapTexture(texture) { this.sceneMapView = texture?.createView?.() || null; }

  async ensureSprites(device, spriteIds) {
    for (const id of spriteIds) { try { await loadSpriteGL(device, id); } catch {} }
  }

  render(sprites, camera, lights = [], time = 0, opts = {}, externalEncoder = null, targetView = null) {
    if (!this.ready || !sprites || sprites.length === 0) return;
    const device = this.device;
    const sorted = sprites.slice().sort((a, b) => {
      const da = (a.x - camera.x) ** 2 + (a.y - camera.y) ** 2;
      const db = (b.x - camera.x) ** 2 + (b.y - camera.y) ** 2;
      return db - da;
    });

    {
      const buf = new ArrayBuffer(256);
      const dv = new DataView(buf);
      const f32 = (off, v) => dv.setFloat32(off, v || 0, true);
      f32(0, camera.resolution?.[0] || 640);
      f32(4, camera.resolution?.[1] || 360);
      f32(8, camera.x || 0);
      f32(12, camera.y || 0);
      f32(16, camera.angle || 0);
      f32(20, camera.planeLen || 1.0);
      f32(24, camera.bobPixels || 0);
      f32(28, camera.eyeZ || 0.5);
      f32(32, time);
      f32(36, camera.horizon ?? 0.5);
      f32(48, opts.sunDir?.x ?? -0.55);
      f32(52, opts.sunDir?.y ?? -0.45);
      f32(56, opts.sunDir?.z ?? -0.7);
      f32(60, opts.sunIntensity ?? 1.5);
      f32(64, (opts.sunColor?.[0] ?? 1));
      f32(68, (opts.sunColor?.[1] ?? 1));
      f32(72, (opts.sunColor?.[2] ?? 1));
      f32(76, opts.ambient ?? 0.36);
      f32(80, opts.fogBase ?? 0.06);
      f32(84, opts.fogSq ?? 0.005);
      f32(88, opts.shadowPointFactor ?? 0.15);
      f32(92, opts.shadowBias ?? 0.06);
      f32(96, opts.mapSize?.[0] ?? 1);
      f32(100, opts.mapSize?.[1] ?? 1);
      device.queue.writeBuffer(this.uniformBuffer, 0, buf);
    }
    {
      const lbuf = new ArrayBuffer(640);
      const f32 = new Float32Array(lbuf);
      f32.fill(0);
      for (let i = 0; i < Math.min(lights.length, 8); i++) {
        const L = lights[i];
        const base = i * 5;
        const b0 = base * 4, b1 = (base + 1) * 4, b2 = (base + 2) * 4, b3 = (base + 3) * 4, b4 = (base + 4) * 4;
        const pos = L.pos || [0, 0, 0];
        f32[b0] = pos[0] || 0; f32[b0 + 1] = pos[1] || 0; f32[b0 + 2] = pos[2] || 0; f32[b0 + 3] = L.intensity || 0;
        const col = L.color || [1, 1, 1];
        f32[b1] = col[0]; f32[b1 + 1] = col[1]; f32[b1 + 2] = col[2]; f32[b1 + 3] = L.radius || 5;
        const dir = L.dir || [0, 0, -1];
        const typeMapS = { point:0, spot:1, flicker:2, pulse:3, emissive:4, ambient:5, steady:6 };
        const typeIdS = L.typeId ?? typeMapS[L.type] ?? 0;
        f32[b2] = dir[0]; f32[b2 + 1] = dir[1]; f32[b2 + 2] = dir[2]; f32[b2 + 3] = typeIdS;
        f32[b3] = L.coneInner ?? 0.85; f32[b3 + 1] = L.coneOuter ?? 0.65; f32[b3 + 2] = L.pulseSpeed ?? 0; f32[b3 + 3] = L.pulseAmount ?? 0;
        f32[b4] = (L.noShadow ? 1 : 0); f32[b4 + 1] = L.flickerSpeed ?? 0; f32[b4 + 2] = L.flickerAmount ?? L.flickerAmt ?? 0; f32[b4 + 3] = L.phase ?? 0;
      }
      device.queue.writeBuffer(this.lightDataBuffer, 0, lbuf);
    }

    if (externalEncoder && targetView) {
      // Pre-build all instance data to avoid writeBuffer inside pass (WebGPU best practice)
      const instances = [];
      const bgs = [];
      for (const s of sorted) {
        if (s.visible === false) continue;
        const texEntry = getSpriteTextures(device, s.spriteId || s.type);
        if (!texEntry || !texEntry.albedo) continue;
        const bg = device.createBindGroup({
          layout: this.bindGroupLayout1,
          entries: [{ binding: 0, resource: texEntry.albedoView }, { binding: 1, resource: texEntry.normalView }, { binding: 2, resource: texEntry.ormView }, { binding: 3, resource: texEntry.emissiveView }, { binding: 4, resource: this.sceneMapView }, { binding: 5, resource: texEntry.distortionView }],
          label: 'sprite_tex_bg'
        });
        const meta = texEntry.meta;
        const frameId = resolveSpriteFrame(s, meta, camera, time);
        const cols = meta?.cols || 1;
        const col = frameId % cols; const row = Math.floor(frameId / cols);
        const atlasW = cols * (meta?.cellW || 64); const atlasH = (meta?.rows || 1) * (meta?.cellH || 64);
        const sx = col * (meta?.cellW || 64) + (meta?.cropX || 0); const sy = row * (meta?.cellH || 64) + (meta?.cropY || 0);
        const u0 = sx / atlasW, v0 = sy / atlasH;
        const u1 = (sx + (meta?.cropW || meta?.cellW || 64)) / atlasW; const v1 = (sy + (meta?.cropH || meta?.cellH || 64)) / atlasH;
        const worldH = s.worldHeight ?? (meta?.worldHeight || 0.58) * (s.scale || 1);
        const worldW = s.worldWidth ?? worldH * (meta?.worldWidthFactor || 0.43);
        const normalStrength = s.material?.normalStrength ?? meta?.material?.normalStrength ?? 2.2;
        const rimStrength = s.material?.rimStrength ?? meta?.material?.rimStrength ?? 1.2;
        const emissiveStrength = s.material?.emissiveStrength ?? meta?.material?.emissiveStrength ?? 0;
        const inst = new Float32Array([s.x, s.y, s.z || 0, worldW, worldH, u0, v0, u1, v1, s.alpha ?? 1, normalStrength, rimStrength, emissiveStrength]);
        if (instances.length >= this.instanceCapacity) break;
        instances.push(inst);
        bgs.push(bg);
      }
      if (instances.length > 0) {
        // Batch write instances into buffer with offsets
        for (let i = 0; i < instances.length; i++) {
          device.queue.writeBuffer(this.instanceBuffer, i * 13 * 4, instances[i].buffer, instances[i].byteOffset, instances[i].byteLength);
        }
      }
      const pass = externalEncoder.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: 'load', storeOp: 'store' }] });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.cameraBindGroup);
      pass.setBindGroup(2, this.samplerBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      for (let i = 0; i < instances.length; i++) {
        pass.setVertexBuffer(1, this.instanceBuffer, i * 13 * 4, 13 * 4);
        pass.setBindGroup(1, bgs[i]);
        pass.draw(6, 1, 0, 0);
      }
      pass.end();
    }
  }

  renderDistortion(sprites, camera, time, encoder, targetView) {
    if (!this.ready || !this.distortionPipeline || !encoder || !targetView) return;
    const instances=[]; const bgs=[];
    for (const s of sprites || []) {
      const texEntry=getSpriteTextures(this.device,s.spriteId||s.type);
      if(!texEntry?.distortionView) continue;
      const meta=texEntry.meta,frameId=resolveSpriteFrame(s,meta,camera,time),cols=meta?.cols||1;
      const col=frameId%cols,row=Math.floor(frameId/cols),atlasW=cols*(meta?.cellW||32),atlasH=(meta?.rows||1)*(meta?.cellH||32);
      const sx=col*(meta?.cellW||32)+(meta?.cropX||0),sy=row*(meta?.cellH||32)+(meta?.cropY||0);
      const u0=sx/atlasW,v0=sy/atlasH,u1=(sx+(meta?.cropW||meta?.cellW||32))/atlasW,v1=(sy+(meta?.cropH||meta?.cellH||32))/atlasH;
      const worldH=s.worldHeight??(meta?.worldHeight||.3)*(s.scale||1),worldW=s.worldWidth??worldH*(meta?.worldWidthFactor||.8);
      const strength=s.material?.distortionStrength??meta?.material?.distortionStrength??0;
      if(strength<=0)continue;
      instances.push(new Float32Array([s.x,s.y,s.z||0,worldW,worldH,u0,v0,u1,v1,s.alpha??1,0,0,strength]));
      bgs.push(this.device.createBindGroup({layout:this.bindGroupLayout1,entries:[
        {binding:0,resource:texEntry.albedoView},{binding:1,resource:texEntry.normalView},{binding:2,resource:texEntry.ormView},
        {binding:3,resource:texEntry.emissiveView},{binding:4,resource:this.sceneMapView},{binding:5,resource:texEntry.distortionView},
      ],label:'sprite_distortion_tex_bg'}));
      if(instances.length>=this.instanceCapacity)break;
    }
    for(let i=0;i<instances.length;i++)this.device.queue.writeBuffer(this.distortionInstanceBuffer,i*13*4,instances[i].buffer,instances[i].byteOffset,instances[i].byteLength);
    const pass=encoder.beginRenderPass({colorAttachments:[{view:targetView,loadOp:'load',storeOp:'store'}]});
    if(instances.length){pass.setPipeline(this.distortionPipeline);pass.setBindGroup(0,this.cameraBindGroup);pass.setBindGroup(2,this.samplerBindGroup);pass.setVertexBuffer(0,this.quadBuffer);for(let i=0;i<instances.length;i++){pass.setVertexBuffer(1,this.distortionInstanceBuffer,i*13*4,13*4);pass.setBindGroup(1,bgs[i]);pass.draw(6,1,0,0);}}
    pass.end();
  }

  setShaderSources(vsSrc, fsSrc, maxLights) {
    if (maxLights) this.maxLights = maxLights;
    try { this.init({ vsSpriteSrc: vsSrc, fsSpritePBRSrc: fsSrc, MAX_LIGHTS: this.maxLights }); } catch (e) { console.warn('[SpriteGpu] setShaderSources failed', e); }
  }
  resize() {}
}
