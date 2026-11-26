const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const esbuild=require(path.join(root,'third_party/KuroCat/node_modules/esbuild'));
const code=esbuild.buildSync({entryPoints:[path.join(root,'third_party/KuroCat/src/catEngine.ts')],bundle:true,write:false,format:'cjs',loader:{'.png':'dataurl'}}).outputFiles[0].text;
const listeners=new Set(),frames=new Map();let next=0,images=0;
const sandbox={module:{exports:{}},Image:class{constructor(){images++;}},performance:{now:()=>0},
 window:{innerWidth:420,innerHeight:440,devicePixelRatio:1,
  addEventListener:(name,fn)=>{if(name==='resize')listeners.add(fn);},
  removeEventListener:(name,fn)=>{if(name==='resize')listeners.delete(fn);}},
 requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)};
sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
const Engine=sandbox.module.exports.KuroCatEngine;
for(let i=0;i<70;i++){
 const engine=new Engine({clientWidth:220,clientHeight:130,getContext:()=>({})},{embedded:true});
 assert.equal(images,0,'cat previews must not preload unused fish images');
 engine.start();engine.start();assert.equal(frames.size,1);
 assert.equal(typeof engine.dispose,'function','discarded cards need complete engine disposal');
 engine.dispose();engine.dispose();
 assert.equal(listeners.size,0,'discarded preview must release its resize listener');
 assert.equal(frames.size,0,'discarded preview must release its animation callback');
}
const fish=new Engine({getContext:()=>({})});
fish.setCatAppearance('dafeiyu');fish.onPrivacyTyping();fish.onPrivacyTyping();
assert.equal(images,4,'selecting fish loads its four images once');fish.dispose();
console.log('PASS: 70 preview creation/disposal cycles leave no resize listeners or animation callbacks');
