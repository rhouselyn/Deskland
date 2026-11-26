const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../prototype/pastoral-scene.js'),'utf8');
const methods=source.slice(source.indexOf('  function clearSelection('),source.indexOf('  function drawBird('));
let moved=0,summoned=0;const sent=[];
const context=vm.createContext({selection:null,icons:[{x:100,y:100,w:60,h:80}],W:1000,H:800,
 marks:{replaceChildren(){}},performance:{now:()=>0},lastMarks:0,editRevision:0,lastDraw:0,
 world:{free:true,cropCircles:{summon(){summoned++;return true;}}},PREVIEW:false,extras:()=>({}),save(){},P:{clickEffects:1},paused:false,powerSaving:()=>false,reducedMotion:{matches:false},
 PastoralSelection:{objects:()=>[],pick:()=>['actor:one'],move(){moved++;return 1;}},
 PastoralCore:{inside:(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h},
 pastoralPreviewHosted:false,parent:{postMessage:m=>sent.push(JSON.parse(m))},triggerEvent(){}});
vm.runInContext(methods+'\nmarkSelection=()=>{};',context);
const run=code=>vm.runInContext(code,context);
run('selectBox(200,200,260,260);clickAt(500,400,0)');assert.equal(moved,1,'a pure wallpaper marquee can move objects');
for(const box of [[50,50,220,220],[220,220,50,50],[90,90,110,110]]){
 run('selectBox(200,200,260,260)');
 run(`selectBox(${box.join(',')})`);
 assert.equal(context.selection,null,'mixing icons and wallpaper objects cancels wallpaper movement');
 run('clickAt(500,400,0)');assert.equal(moved,1,'a mixed marquee cannot move a previous wallpaper selection');
}
run('selectBox(160,180,220,220);clickAt(500,400,0)');assert.equal(moved,2,'touching an icon boundary without including it does not cancel');
run('pastoralPreviewHosted=true;selectBox(50,50,220,220);clickAt(500,400,0)');assert.equal(sent.filter(m=>m.t==='moveSelection').length,0,'a hosted preview must not forward mixed selection moves');
run('selectBox(200,200,260,260);clickAt(500,400,0)');assert.equal(sent.filter(m=>m.t==='moveSelection').length,1);
assert.equal(summoned,0,'selecting wallpaper objects never summons a circle');
run('PastoralSelection.pick=()=>[];pastoralPreviewHosted=false;selectBox(200,200,460,400)');
assert.equal(summoned,1,'an empty completed marquee requests a landing');
run('selectBox(50,50,220,220)');
assert.equal(summoned,2,'an empty wallpaper marquee lets the landing model check partial icon overlap');
run('PREVIEW=true;selectBox(200,200,460,400)');
assert.equal(summoned,2,'settings previews cannot independently spawn desktop circles');
console.log('PASS: mixed icon selections preserve Explorer, empty edge overlaps summon, previews do not spawn');
