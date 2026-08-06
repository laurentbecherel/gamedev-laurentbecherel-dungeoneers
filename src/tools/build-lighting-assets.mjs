// Deterministic, editable source for the retro lighting fixture atlases.
// The generated maps deliberately share one coverage/height model so albedo,
// normal, ORM and emissive channels cannot drift out of registration.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));

function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type,'ascii'),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function writePng(path,width,height,rgba){const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++){const row=y*(width*4+1);Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(raw,row+1);}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}

const M={
  ironDark:{c:[25,25,24],h:.18,r:.88,m:.64,ao:.62}, iron:{c:[55,54,50],h:.48,r:.72,m:.74,ao:.78}, ironHi:{c:[104,96,78],h:.78,r:.52,m:.82,ao:.9},
  bronzeDark:{c:[47,33,23],h:.28,r:.82,m:.48,ao:.7}, bronze:{c:[104,70,38],h:.58,r:.66,m:.58,ao:.84}, bronzeHi:{c:[155,111,58],h:.82,r:.48,m:.66,ao:.94},
  woodDark:{c:[42,25,16],h:.25,r:.92,m:.02,ao:.67}, wood:{c:[91,49,25],h:.5,r:.83,m:.02,ao:.83}, woodHi:{c:[145,79,35],h:.69,r:.72,m:.01,ao:.92},
  glassDark:{c:[45,58,54],h:.34,r:.32,m:.04,ao:.78,e:[35,50,37]}, glass:{c:[105,125,90],h:.52,r:.25,m:.02,ao:.94,e:[116,93,42]},
  crystalDark:{c:[31,52,61],h:.3,r:.38,m:.02,ao:.72,e:[24,52,60]}, crystal:{c:[59,110,116],h:.62,r:.22,m:.01,ao:.9,e:[47,104,107]}, crystalHi:{c:[116,166,145],h:.88,r:.14,m:0,ao:1,e:[82,148,132]},
};

function atlasSurface(width,height,cellW=64){
  const n=width*height,rgba=new Uint8Array(n*4),heightMap=new Float32Array(n),rough=new Float32Array(n),metal=new Float32Array(n),ao=new Float32Array(n),emissive=new Uint8Array(n*4),mask=new Uint8Array(n);
  const put=(x,y,mat)=>{x|=0;y|=0;if(x<0||y<0||x>=width||y>=height)return;const i=y*width+x,q=i*4;mask[i]=1;heightMap[i]=mat.h;rough[i]=mat.r;metal[i]=mat.m;ao[i]=mat.ao;rgba.set([mat.c[0],mat.c[1],mat.c[2],255],q);const e=mat.e||[0,0,0];emissive.set([e[0],e[1],e[2],255],q);};
  const rect=(x,y,w,h,mat)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)put(xx,yy,mat);};
  const line=(x0,y0,x1,y1,t,mat)=>{const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=steps;i++){const u=steps?i/steps:0;rect(Math.round(x0+(x1-x0)*u-t/2),Math.round(y0+(y1-y0)*u-t/2),t,t,mat);}};
  const poly=(points,mat)=>{const minY=Math.floor(Math.min(...points.map(p=>p[1]))),maxY=Math.ceil(Math.max(...points.map(p=>p[1])));for(let y=minY;y<=maxY;y++){const hits=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)rect(Math.ceil(hits[i]),y,Math.floor(hits[i+1])-Math.ceil(hits[i])+1,1,mat);}};
  const compile=(normalStrength=2.5)=>{const normal=new Uint8Array(n*4),orm=new Uint8Array(n*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,q=i*4;if(!mask[i])continue;const cell=Math.floor(x/cellW),lo=cell*cellW,hi=lo+cellW-1;const sample=(sx,sy)=>{sx=clamp(sx,lo,hi);sy=clamp(sy,0,height-1);const si=sy*width+sx;return mask[si]?heightMap[si]:heightMap[i];};const dx=(sample(x+1,y)-sample(x-1,y))*normalStrength,dy=(sample(x,y+1)-sample(x,y-1))*normalStrength;const inv=1/Math.hypot(dx,dy,1);normal.set([clamp((-dx*inv*.5+.5)*255),clamp((-dy*inv*.5+.5)*255),clamp(inv*.5*255+127.5),255],q);orm.set([clamp(ao[i]*255),clamp(rough[i]*255),clamp(metal[i]*255),255],q);}return{albedo:rgba,normal,orm,emissive};};
  return{put,rect,line,poly,compile};
}

function ellipse(s,cx,cy,rx,ry,mat){for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1)s.put(x,y,mat);}}
function mirrorX(points,ox,mirror){return points.map(([x,y])=>[ox+(mirror?64-x:x),y]);}

function drawTorch(s,ox,view){const side=view==='right'||view==='left',mirror=view==='left';if(!side){
  // Broad shield backplate, curled support and fire cup: readable as a wall
  // sconce even before its effect layers are composited.
  s.poly([[ox+24,39],[ox+27,35],[ox+37,35],[ox+40,39],[ox+39,53],[ox+32,58],[ox+25,53]],M.ironDark);
  s.poly([[ox+27,40],[ox+29,38],[ox+35,38],[ox+37,40],[ox+36,51],[ox+32,54],[ox+28,51]],M.iron);
  s.rect(ox+30,39,3,12,M.ironHi);s.put(ox+31,55,M.ironHi);
  s.line(ox+32,41,ox+24,32,5,M.ironDark);s.line(ox+25,33,ox+32,28,5,M.ironDark);s.line(ox+31,40,ox+25,33,2,M.ironHi);s.line(ox+26,32,ox+32,28,2,M.iron);
  s.poly([[ox+18,23],[ox+46,23],[ox+42,32],[ox+22,32]],M.ironDark);s.poly([[ox+21,22],[ox+43,22],[ox+40,28],[ox+24,28]],M.bronze);
  s.rect(ox+25,22,12,3,M.bronzeHi);s.rect(ox+29,18,6,5,M.ironDark);
}else{const p=pts=>mirrorX(pts,ox,mirror);
  s.poly(p([[18,38],[27,35],[31,39],[30,54],[24,58],[19,53]]),M.ironDark);s.poly(p([[21,40],[27,38],[28,41],[27,52],[24,54],[21,51]]),M.iron);s.line(...p([[25,43],[40,31]]).flat(),6,M.ironDark);s.line(...p([[26,41],[41,29]]).flat(),2,M.ironHi);
  s.poly(p([[34,22],[55,22],[51,31],[38,31]]),M.ironDark);s.poly(p([[37,21],[53,21],[50,27],[40,27]]),M.bronze);s.rect(ox+(mirror?13:40),20,9,3,M.bronzeHi);s.rect(ox+(mirror?15:44),17,5,4,M.ironDark);
}}

function drawBrazier(s,ox,view){const side=view==='right'||view==='left',mirror=view==='left';if(!side){ellipse(s,ox+32,27,17,6,M.ironDark);ellipse(s,ox+32,25,15,4,M.bronze);s.rect(ox+19,25,26,6,M.bronzeDark);s.rect(ox+23,25,18,3,M.bronzeHi);s.line(ox+24,31,ox+19,57,4,M.ironDark);s.line(ox+40,31,ox+45,57,4,M.ironDark);s.line(ox+32,31,ox+32,55,4,M.iron);s.line(ox+18,57,ox+25,57,3,M.ironHi);s.line(ox+39,57,ox+47,57,3,M.ironHi);s.line(ox+28,55,ox+36,55,3,M.ironHi);}else{const p=pts=>mirrorX(pts,ox,mirror);s.poly(p([[17,23],[49,23],[43,31],[22,31]]),M.ironDark);s.poly(p([[20,22],[48,22],[43,27],[23,27]]),M.bronze);s.line(...p([[27,30],[23,57]]).flat(),4,M.ironDark);s.line(...p([[40,30],[44,57]]).flat(),4,M.iron);s.line(...p([[22,57],[29,57]]).flat(),3,M.ironHi);s.line(...p([[40,57],[47,57]]).flat(),3,M.ironHi);}}

function drawLantern(s,ox,view){const side=view==='right'||view==='left',mirror=view==='left',cx=side?(mirror?29:35):32;s.line(cx+ox,2,cx+ox,15,2,M.iron);s.line(cx+ox,4,cx+ox+(side?(mirror?-5:5):5),9,2,M.ironHi);s.poly([[cx+ox-8,17],[cx+ox+8,17],[cx+ox+11,23],[cx+ox-11,23]],M.ironDark);s.rect(cx+ox-8,22,16,25,M.glassDark);s.rect(cx+ox-5,24,10,21,M.glass);s.rect(cx+ox-3,26,4,17,M.glass);s.line(cx+ox-8,22,cx+ox-8,47,3,M.iron);s.line(cx+ox+8,22,cx+ox+8,47,3,M.ironDark);s.line(cx+ox,22,cx+ox,47,2,M.ironHi);s.poly([[cx+ox-11,47],[cx+ox+11,47],[cx+ox+7,53],[cx+ox-7,53]],M.ironDark);s.rect(cx+ox-6,47,12,4,M.iron);}

function drawCrystal(s,ox,view){const shift=view==='right'?2:view==='left'?-2:0;s.poly([[ox+16+shift,56],[ox+22+shift,31],[ox+28+shift,18],[ox+34+shift,34],[ox+31+shift,56]],M.crystalDark);s.poly([[ox+27+shift,56],[ox+33+shift,20],[ox+38+shift,9],[ox+43+shift,29],[ox+40+shift,56]],M.crystal);s.poly([[ox+35+shift,56],[ox+43+shift,35],[ox+50+shift,25],[ox+49+shift,50],[ox+45+shift,56]],M.crystalDark);s.poly([[ox+35+shift,21],[ox+38+shift,11],[ox+40+shift,29],[ox+37+shift,48]],M.crystalHi);s.line(ox+18,57,ox+49,57,3,M.ironDark);}

function writeFixture(id,draw,normalStrength=2.5){const s=atlasSurface(256,64);['back','right','front','left'].forEach((view,i)=>draw(s,i*64,view));const maps=s.compile(normalStrength),dir=resolve(ROOT,`assets/sprites/${id.replace(/_.*/, '')}`);for(const [channel,pixels]of Object.entries(maps))writePng(resolve(dir,`${id}_${channel}.png`),256,64,pixels);}

function rgbaSurface(w,h){const p=new Uint8Array(w*h*4);return{p,put(x,y,c){x|=0;y|=0;if(x>=0&&y>=0&&x<w&&y<h)p.set(c,(y*w+x)*4);}};}
function neutralMaps(albedo,w,h,{rough=.8,metal=0,emissive=null}={}){const normal=new Uint8Array(w*h*4),orm=new Uint8Array(w*h*4),e=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){const q=i*4,a=albedo[q+3];if(!a)continue;normal.set([128,128,255,a],q);orm.set([255,rough*255,metal*255,a],q);const ec=emissive?.(q)||[0,0,0];e.set([ec[0],ec[1],ec[2],a],q);}return{normal,orm,emissive:e};}

function buildFlame(){const frames=12,cell=48,w=frames*cell,h=48,a=rgbaSurface(w,h),phase=[0,.5,1.1,1.7,2.2,2.9,3.5,4.2,4.8,5.3,5.9,6.5];for(let f=0;f<frames;f++){const ox=f*cell,p=phase[f];for(let y=5;y<44;y++)for(let x=5;x<43;x++){const yn=(43-y)/38,center=24+Math.sin(p+yn*5.1)*2.2+Math.sin(p*.7+yn*9)*.8,width=2.4+Math.sin(yn*Math.PI)*9.3*(1-yn*.18),d=Math.abs(x-center)/width;if(d>=1)continue;let c;if(d<.27&&yn<.72)c=[244,169,55,255];else if(d<.61)c=[226,103,27,255];else c=[157,48,18,230];if(yn>.78&&d<.4)c=[205,76,23,245];a.put(ox+x,y,c);}}
  const maps=neutralMaps(a.p,w,h,{rough:.9,emissive:q=>[Math.round(a.p[q]*.72),Math.round(a.p[q+1]*.66),Math.round(a.p[q+2]*.55)]}),dir=resolve(ROOT,'assets/sprites/effects');writePng(resolve(dir,'flame_small_albedo.png'),w,h,a.p);writePng(resolve(dir,'flame_small_normal.png'),w,h,maps.normal);writePng(resolve(dir,'flame_small_orm.png'),w,h,maps.orm);writePng(resolve(dir,'flame_small_emissive.png'),w,h,maps.emissive);
}

function buildSmoke(){const frames=8,cell=32,w=frames*cell,h=32,a=rgbaSurface(w,h);for(let f=0;f<frames;f++){const ox=f*cell;for(let y=2;y<31;y++)for(let x=2;x<30;x++){const t=f/7,dx=(x-(16+Math.sin(f*1.7)*2))/(7+t*4),dy=(y-(20-t*5))/(10+t*3),warp=Math.sin(x*.8+f)*.12+Math.sin(y*.57-f*.6)*.11,d=dx*dx+dy*dy+warp;if(d<.78){const alpha=clamp((.78-d)*92,0,72);a.put(ox+x,y,[67,62,56,alpha]);}}}const maps=neutralMaps(a.p,w,h,{rough:.98}),dir=resolve(ROOT,'assets/sprites/effects');for(const [name,p]of Object.entries({albedo:a.p,normal:maps.normal,orm:maps.orm,emissive:maps.emissive}))writePng(resolve(dir,`smoke_puff_${name}.png`),w,h,p);}

function buildSpark(){const a=rgbaSurface(8,8);for(const [x,y,c]of[[3,1,[201,91,26,180]],[3,2,[235,139,38,240]],[3,3,[244,178,61,255]],[4,3,[226,112,28,255]],[3,4,[213,92,24,220]],[2,3,[195,70,20,190]]])a.put(x,y,c);const maps=neutralMaps(a.p,8,8,{rough:.8,emissive:q=>[a.p[q]*.65,a.p[q+1]*.55,a.p[q+2]*.4]}),dir=resolve(ROOT,'assets/sprites/effects');for(const [name,p]of Object.entries({albedo:a.p,normal:maps.normal,orm:maps.orm,emissive:maps.emissive}))writePng(resolve(dir,`spark_${name}.png`),8,8,p);}

function buildHeat(){const frames=8,cell=32,w=frames*cell,h=32,s=rgbaSurface(w,h);for(let f=0;f<frames;f++)for(let y=1;y<31;y++)for(let x=2;x<30;x++){const nx=(x-16)/14,ny=(y-16)/15,d=nx*nx+ny*ny;if(d>=1)continue;const strength=(1-d)*(.55+.45*Math.sin((x+y)*.42+f*.9));const dx=Math.sin(y*.57+f*.8)*strength,dy=Math.cos(x*.49-f*.65)*strength;s.put(f*cell+x,y,[clamp(128+dx*108),clamp(128+dy*108),clamp(strength*255),clamp((1-d)*210)]);}writePng(resolve(ROOT,'assets/sprites/effects/heat_haze_distortion.png'),w,h,s.p);}

writeFixture('torch_wall',drawTorch,3.2);
writeFixture('brazier_floor',drawBrazier,3.0);
writeFixture('lantern_hanging',drawLantern,2.6);
writeFixture('crystal_small',drawCrystal,3.6);
buildFlame();buildSmoke();buildSpark();buildHeat();
console.log('Lighting assets rebuilt: 4 fixtures, flame, smoke, sparks and heat distortion.');
