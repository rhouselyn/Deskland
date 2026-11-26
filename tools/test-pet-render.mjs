import assert from 'node:assert/strict';
const port=process.argv[2]||'9235';
const pages=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());
const page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost'));
assert(page,'pet WebView is loaded from bundled resources');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
const result=await new Promise((resolve,reject)=>{
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);}};
 socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(()=>{const c=document.getElementById('pet-canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=3;i<d.length;i+=4)if(d[i]>64)pixels++;return {width:c.width,height:c.height,pixels};})()`,returnByValue:true}}));
});
assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
const metrics=result.result.value;assert(metrics.width>1&&metrics.height>1&&metrics.pixels>1000,JSON.stringify(metrics));
console.log('PASS: native WebView canvas has visible rendered pixels',JSON.stringify(metrics));
const animation=await new Promise((resolve,reject)=>{
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===2){if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);}};
 socket.send(JSON.stringify({id:2,method:'Runtime.evaluate',params:{expression:`(async()=>{
  const ctx=document.getElementById('pet-canvas').getContext('2d'),clear=ctx.clearRect;
  let count=0;ctx.clearRect=function(...args){count++;return clear.apply(this,args);};
  const pause=v=>window.__TAURI_INTERNALS__.invoke('plugin:event|emit',{event:'deskland-paused',payload:v});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try{
   for(let i=0;i<12;i++)await pause(false);
   await wait(150);count=0;await wait(1000);const frames=count;
   await pause(true);await wait(100);count=0;await wait(250);
   return {frames,pausedFrames:count};
  }finally{ctx.clearRect=clear;await pause(false);}
 })()`,awaitPromise:true,returnByValue:true}}));
});
socket.close();
assert(!animation.exceptionDetails,JSON.stringify(animation.exceptionDetails));
const frames=animation.result.value;
console.log('Native animation sample:',JSON.stringify(frames));
assert(frames.frames>0&&frames.frames<=35,'settings updates must keep the renderer at 30fps');
assert.equal(frames.pausedFrames,0,'pause must stop every render loop');
console.log('PASS: real renderer remains capped after repeated settings updates and stops when paused');
