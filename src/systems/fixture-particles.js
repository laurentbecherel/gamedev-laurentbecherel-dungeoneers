import { ParticleEmitter, ParticleSystem } from './particles.js';
import { getFixtureDefinition, resolveSocketWorld } from './fixtures.js';

function hashString(value) {
  let h=2166136261;
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function seeded(seed){let s=seed>>>0||1;return()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
function merge(base,preset){return {...base,...preset,velocity:preset?.velocity||base?.velocity,color:preset?.color||base?.color};}

// Visual-only fixture particles. Gameplay remains deterministic because these
// emitters own seeded RNG streams and never feed back into world generation.
export class FixtureParticleSystem {
  constructor(instances, fixturesConfig, particlesConfig, maxParticles = 256) {
    this.system=new ParticleSystem(); this.maxParticles=maxParticles; this.instances=instances;
    for(const instance of instances){
      const def=getFixtureDefinition(fixturesConfig,instance.spriteId);
      if(!def?.sockets)continue;
      const preset=particlesConfig?.presets?.[instance.spriteId]||{};
      for(const type of ['smoke','spark']){
        const socketName=type==='spark'?'sparks':'smoke';
        if(!def.sockets[socketName])continue;
        const cfg=merge(particlesConfig?.[type]||{},preset[type]||{});
        if(cfg.enabled===false || !(cfg.rate>0))continue;
        const pos=resolveSocketWorld(instance,def,socketName);
        const em=new ParticleEmitter({...cfg,pos,type,id:`${instance.id}:${type}`,rng:seeded(hashString(`${instance.id}:${type}`)),spriteId:cfg.spriteId||`fx_${type}`});
        this.system.addEmitter(em);
      }
    }
  }
  update(dt,time){
    this.system.update(dt,time);
    let excess=this.system.count()-this.maxParticles;
    if(excess>0)for(const em of this.system.emitters){const take=Math.min(excess,em.particles.length);if(take){em.particles.splice(0,take);excess-=take;}if(excess<=0)break;}
  }
  getRenderSprites(){
    const out=[];
    for(const em of this.system.emitters)for(const p of em.particles){
      const life=Math.max(0,1-p.age/p.life);
      out.push({id:`${em.id}:${p.age}`,spriteId:p.spriteId,x:p.x,y:p.y,z:p.z,worldHeight:p.size,worldWidth:p.type==='spark'?p.size*.45:p.size,alpha:p.alpha*life,frame:p.type==='smoke'?Math.min(7,Math.floor((p.age/p.life)*8)):0,visible:true,isParticle:true});
    }
    return out;
  }
  count(){return this.system.count();}
}
