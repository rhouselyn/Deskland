const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../prototype/meadow-scene.js'),'utf8');
const start=source.indexOf('function prepareGrassInk('),end=source.indexOf('\nconst f32',start);
assert(start>=0,'static grass strokes must be cached');
let allocations=0,paints=0;
const gl=new Proxy({createTexture:()=>({}),createFramebuffer:()=>({}),texImage2D(){allocations++;},drawArrays(){paints++;}},
 {get:(o,k)=>k in o?o[k]:()=>{}});
const context=vm.createContext({gl,FS:'#version 300 es',cv:{width:1440,height:900,_scale:1.25},seed:42,noiseTex:{},program:()=>({p:{},U:{}})});
vm.runInContext('let grassInkTexture=null,grassInkFramebuffer=null,grassInkProgram=null,grassInkKey="";'+source.slice(start,end),context);
vm.runInContext('for(let i=0;i<120;i++)prepareGrassInk()',context);
assert.equal(allocations,1);assert.equal(paints,1,'steady animation must reuse static grass');
vm.runInContext('seed++;prepareGrassInk()',context);assert.equal(paints,2,'new seed repaints');
vm.runInContext('cv.width++;prepareGrassInk()',context);assert.equal(paints,3,'new physical size repaints');
vm.runInContext('cv._scale=1.1;prepareGrassInk()',context);assert.equal(paints,4,'fractional display scale repaints');
console.log('PASS: static grass paints once; seed, physical dimensions and fractional scale invalidate it');
