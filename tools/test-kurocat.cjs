const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const elements=new Map(),get=id=>{
 if(!elements.has(id))elements.set(id,{hidden:false,checked:false,disabled:false,value:'',textContent:'',innerHTML:'',
  classList:{toggle(){}},setAttribute(){},addEventListener(){}});
 return elements.get(id);
};
const sent=[];
const ctx=vm.createContext({document:{getElementById:get,querySelectorAll:()=>[],activeElement:null},
 window:{},requestAnimationFrame:()=>0,lang:'zh-CN',host:true,t:(key,vars)=>key==='petStats'?`${vars.total}/${vars.kpm}`:key,
 send:m=>sent.push(m),layoutPreview(){}});
vm.runInContext(read('prototype/pets.js'),ctx);
const run=code=>vm.runInContext(code,ctx);
assert.equal(run('petState.v.breed'),'ragdoll');
assert.equal(run('petState.v.scale'),53);
assert.equal(run('petState.v.enabled'),1);
assert.equal(run('petState.v.through'),1);
assert.equal(run('petState.v.sound'),0);
run('renderPets();showDesklandSection("pets");setPet("enabled",1);setPet("breed","calico");setPet("scale",125)');
assert.equal(get('themesView').hidden,true);assert.equal(get('petsView').hidden,false);
assert.deepEqual(sent.map(x=>[x.t,x.key,x.value]),[['petSet','enabled',1],['petSet','breed','calico'],['petSet','scale',125]]);
run('receivePet({v:{enabled:1,breed:"calico",scale:125},running:true,total:123,kpm:45,rawInput:true})');
assert.equal(get('petStatus').textContent,'petRunning');assert.equal(get('petStats').textContent,'123/45');
assert.equal(get('petScaleValue').textContent,'125%');assert.equal(get('petEnabled').checked,true);
run('showDesklandSection("themes")');assert.equal(get('themesView').hidden,false);
let cardWrites=0,cardMarkup=get('petList').innerHTML,clears=0;
Object.defineProperty(get('petList'),'innerHTML',{get:()=>cardMarkup,set:value=>{cardMarkup=value;cardWrites++;}});
ctx.window.DesklandPetPreview={clear(){clears++;}};
run('for(let i=0;i<30;i++){showDesklandSection("pets");showDesklandSection("themes");}');
assert.equal(cardWrites,0,'tab switches reuse existing preview canvases');
run('receivePet({v:{enabled:1},cats:[{id:"black",name:"Black",builtin:true}]})');
assert.equal(cardWrites,1);assert.equal(clears,1,'catalog replacement disposes the previous previews');
const params=JSON.parse(read('prototype/themes.json')).themes.find(t=>t.id==='pastoral').groups.flatMap(g=>g.params);
const pastoral=JSON.parse(read('prototype/themes.json')).themes.find(t=>t.id==='pastoral');
const wallpaperDefaults={...pastoral.defaults,adaptive:1,...Object.fromEntries(params.map(p=>[p.key,p.default]))};
assert.deepEqual(wallpaperDefaults,require('../prototype/pastoral-light.js').defaults,'host, settings and standalone wallpaper share the same preset');
assert(!params.some(p=>p.key==='kurocat'||p.key==='kurocatScale'));
for(const p of ['prototype/pastoral.html','prototype/pastoral-scene.js','prototype/meadow-scene.js'])assert(!/kurocat/i.test(read(p)),p+' no longer owns a pet');
const keys=[...read('prototype/pets.js').matchAll(/t\('(pet\w+|pet_\w+|pets\w*)'/g)].map(x=>x[1]).filter(k=>!['petKeyboard','petEyes','petCoat','pet_','petName_'].includes(k));
for(const lang of ['zh-CN','en']){
 const ui=JSON.parse(read('prototype/i18n/'+lang+'.json')).ui;
 for(const key of keys)assert(ui[key],'translation '+key+' '+lang);
 for(const id of ['black','ragdoll','orange_tabby','calico','tuxedo','siamese','dafeiyu'])assert(ui['petName_'+id]);
}
const bridge=read('third_party/KuroCat/src-tauri/src/deskland.rs');
assert(bridge.includes('WaitForSingleObject')&&bridge.includes('frontend_ready'));
const packaging=read('tools/build-installer.ps1');
for(const name of ['DesklandPet.exe','third_party\\KuroCat','pets.js','pet-preview.js','host\\DesktopPet.cs','node_modules|target'])assert(packaging.includes(name));
for(const p of ['third_party/KuroCat/src/main.ts','third_party/KuroCat/src-tauri/src/lib.rs'])assert(!/check_for_update|install_update|start_background_update_checker/.test(read(p)));
assert(read('third_party/KuroCat/DESKLAND.md').includes('qianyiai/kurocat'));
console.log('PASS: v4.7 pet controls, defaults, status, translations, wallpaper independence, no updater and source packaging');
