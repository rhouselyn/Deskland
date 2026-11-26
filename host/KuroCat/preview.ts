import {KuroCatEngine} from '../../third_party/KuroCat/src/catEngine';
import {BUILTIN_WEB_CATS as DEFAULT_BUILTIN_CATS} from '../../third_party/KuroCat/website/src/builtinCats';
import {catAudio} from '../../third_party/KuroCat/src/audio';
const cache=new WeakMap<HTMLCanvasElement,KuroCatEngine>();
catAudio.setEnabled(false);
(window as any).DesklandPetPreview={cats:DEFAULT_BUILTIN_CATS,clear(root:Element){
  for(const canvas of root.querySelectorAll('canvas')){cache.get(canvas)?.dispose();cache.delete(canvas);}
},draw(canvas:HTMLCanvasElement,id:string,skin:any){
  let engine=cache.get(canvas);if(!engine){engine=new KuroCatEngine(canvas,{embedded:true});cache.set(canvas,engine);}
  engine.resize();engine.setCatAppearance(id,skin);engine.onAfterRender=()=>engine!.stop();engine.start();
}};
