import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { KuroCatEngine } from './catEngine';
import { catAudio } from './audio';
import { DEFAULT_BUILTIN_CATS, type CatSkinConfig } from './catSkins';

const canvas=document.getElementById('pet-canvas') as HTMLCanvasElement;
const engine=new KuroCatEngine(canvas);
let settings:any={},cats:CatSkinConfig[]=[...DEFAULT_BUILTIN_CATS],alt=false,paused=false;
let total=0,times:number[]=[],day=new Date().toDateString();
function sync(){
  engine.showKeyBubbles=settings.showKeyBubbles;
  engine.setCatAppearance(settings.catBreed,cats.find(c=>c.id===settings.catBreed));
  engine.setKeyboardConfig(settings.keyboardLayout,settings.keyboardOrientation);
  engine.setRenderScale(settings.scale||1);catAudio.setEnabled(!!settings.soundEnabled&&!paused);
}
async function start(){
  await listen<any>('kuro-settings',e=>{settings=e.payload;sync();});
  await listen<CatSkinConfig[]>('kuro-cats',e=>{cats=e.payload;sync();});
  await listen<boolean>('kuro-privacy',e=>engine.setPrivacyMode(e.payload));
  await listen<any>('kuro-input',e=>{
    const p=e.payload;
    switch(p.kind){
      case 'keyDown':engine.onKeyDown(p.vk,p.repeat);if(!p.repeat){total++;times.push(Date.now());}break;
      case 'keyUp':engine.onKeyUp(p.vk);break;
      case 'mouseMove':engine.onGlobalMouseMove(p.nx,p.ny);break;
      case 'mouseDown':engine.onMouseDown(p.button);break;
      case 'mouseUp':engine.onMouseUp(p.button);break;
      case 'mouseWheel':engine.onMouseWheel();break;
      case 'privacyTyping':engine.onPrivacyTyping();break;
    }
  });
  await listen<any>('kuro-cursor',e=>{alt=!!e.payload.altOverride;engine.onWindowCursor(e.payload.relX,e.payload.relY,e.payload.overCat);});
  await listen<boolean>('deskland-paused',e=>{paused=e.payload;paused?engine.stop():engine.start();sync();});
  await listen('deskland-demo',()=>{
    [87,65,83,68,32,74,75].forEach((key,i)=>setTimeout(()=>{engine.onKeyDown(key,false);setTimeout(()=>engine.onKeyUp(key),100);},i*140));
  });
  [settings,cats]=await Promise.all([invoke('get_settings'),invoke<CatSkinConfig[]>('get_cats')]);
  sync();engine.start();await invoke('frontend_ready');
  setInterval(()=>{
    if(day!==new Date().toDateString()){day=new Date().toDateString();total=0;times=[];}
    times=times.filter(t=>Date.now()-t<60000);void invoke('stats',{total,kpm:times.length});
  },1000);
}
canvas.addEventListener('mousedown',async e=>{
  if(e.button!==0||(settings.clickThroughLocked&&!alt&&!e.altKey))return;
  await invoke('set_dragging',{dragging:true});
  try{await getCurrentWindow().startDragging();}finally{await invoke('set_dragging',{dragging:false});await invoke('save_window_pos');}
});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(!settings.clickThroughLocked||alt||e.altKey)void invoke('open_settings');});
window.addEventListener('pagehide',()=>engine.dispose());
void start();
