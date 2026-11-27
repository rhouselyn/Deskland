const assert=require('node:assert/strict');
const {World,distance,farm,random}=require('../prototype/pastoral-world.js');
const CropCircles=require('../prototype/pastoral-crop-circle.js');

const night={day:'2026-11-27',minute:90,progress:0,altitude:-32,setting:false};
const seeds=Array.from({length:64},(_,seed)=>CropCircles.pattern(seed,random));
assert.equal(new Set(seeds.map(p=>JSON.stringify(p))).size,seeds.length);
assert.deepEqual(new Set(seeds.map(p=>p.family)),new Set(['rings','spiral','rosette','satellites']));
assert.deepEqual(seeds[5],CropCircles.pattern(5,random));
assert(seeds.every(p=>p.strokes.length>=6&&p.strokes.length<=37&&p.strokes.every(s=>s.points.every(([x,y])=>
  Math.hypot(x,y/CropCircles.squash)<1))));
seeds.forEach((design,seed)=>{
  const patches=CropCircles.workPatches({seed,x:0,y:0,radius:130});
  for(const stroke of design.strokes)for(const [x,y] of stroke.points){
    const gap=Math.min(...patches.map(p=>Math.hypot(p.x-x*130,p.y-y*130)));
    assert(gap+stroke.width*65+.8<CropCircles.patchRadius*.85,'work patches cover the full width of each generated line');
  }
});

function layout(w,icons=[]){w.layout(1600,1000,icons);}
function hold(w){
  w.dayKey=night.day;
  w.village.update=()=>{};
  w.flock.update=()=>{};
  w.nextGame=Infinity;
  for(const a of w.agents)a.next=Infinity;
}
function tick(w,decide=true,fireflies){
  const pending=(w.cropCircles.circle?.patches||[]).filter(p=>p.plantedAt===null);
  w.update(.2,night,()=>false,decide,fireflies);
  for(const patch of pending)if(patch.plantedAt!==null){
    assert(w.agents.some(a=>a.game===CropCircles.game&&Math.hypot(a.x+8-patch.x,a.y+1-patch.y)<=3),
      'a patch can only be planted within reach of a worker actually standing there');
  }
}
function until(w,condition,fireflies){
  for(let i=0;i<1800&&!condition();i++)tick(w,true,fireflies);
  assert(condition(),`condition timed out in ${w.cropCircles.circle?.stage}`);
}

Math.random=random(555);
const empty={free:[1],time:10,width:700,height:500,icons:[],homes:[{door:{x:600,y:400}}],obstacles:[],walkable:()=>true,openLawn:()=>true,path:()=>[{}]};
const manual=new CropCircles();
assert(manual.summon(empty,430,320,170,130,[]),'reverse empty marquees summon at the requested spot');
const requested=manual.circle;
assert.equal(requested.stage,'forming');
assert.equal(requested.x,300);assert.equal(requested.y,225);
assert(requested.radius>=101&&requested.radius<=130);
for(const stage of ['forming','waiting','notice','report','fetch','carry','work']){
  requested.stage=stage;
  assert(!manual.summon(empty,450,330,160,120,[]),'a circle at any stage prevents another landing');
  assert.equal(manual.circle,requested);
}
const scout=manual.visit;
assert(scout&&scout.x===305&&scout.y===225,'a blocked request still sends a saucer to the requested location');
assert.equal(CropCircles.visitFlight(scout,scout.since+1).dots,0);
for(const [age,dots] of [[3,1],[4.2,2],[5.4,3]])
  assert.equal(CropCircles.visitFlight(scout,scout.since+age).dots,dots,'the inspection bubble gains dots one by one');
assert(!CropCircles.visitFlight(scout,scout.since+10).visible,'the inspecting saucer leaves');
const scouted=new CropCircles();scouted.restore(JSON.parse(JSON.stringify(manual.snapshot())));
assert.deepEqual(scouted.visit,scout,'previews and reloads preserve the saucer visit');
const corners=new Set(),exits=new Set();
for(let i=0;i<64;i++){
  const route=CropCircles.flightRoute(empty);
  corners.add(Number(route.from.x>0)+2*Number(route.from.y>0));
  exits.add(route.to.x<0?'left':route.to.x>empty.width?'right':route.to.y<0?'top':'bottom');
  const circle={x:300,y:225,radius:101,since:10,route};
  assert.deepEqual([CropCircles.flight(circle,10).x,CropCircles.flight(circle,10).y],[route.from.x,route.from.y]);
  const finish=CropCircles.flight(circle,20);
  assert.deepEqual([finish.x,finish.y],[route.to.x,route.to.y]);
  for(const boundary of [2.8,7.2]){
    const before=CropCircles.flight(circle,10+boundary-1e-5),after=CropCircles.flight(circle,10+boundary+1e-5);
    assert(Math.hypot(before.x-after.x,before.y-after.y)<.02,'flight remains continuous at arrival and departure');
  }
}
assert.equal(corners.size,4);assert.equal(exits.size,4);
manual.circle=null;
assert(!manual.summon(empty,170,130,430,320,[{x:425,y:315,rx:12,ry:12}]),'partial object overlap blocks an otherwise empty selection');
empty.icons=[{x:425,y:315,w:40,h:60}];
assert(manual.summon(empty,170,130,430,320,[]),'a marquee may touch an icon edge');
manual.circle=null;
empty.icons=[{x:100,y:80,w:400,h:300}];
assert(!manual.summon(empty,297,222,303,228,[]),'a marquee entirely inside an icon is blocked');
empty.icons=[{x:250,y:190,w:40,h:60}];
assert(!manual.summon(empty,170,130,430,320,[]),'a fully enclosed icon remains an icon selection');
empty.icons=[{x:300,y:100,w:200,h:250}];
assert(manual.summon(empty,170,130,430,320,[]),'the circle can overlap an icon without being entirely covered');
const iconCircle=manual.circle,originalObjects=manual.objects;
manual.objects=()=>[];manual.update({...empty,time:empty.time+3},3);manual.objects=originalObjects;
assert.equal(manual.circle,iconCircle,'the approach recheck preserves the relaxed icon rule');
manual.circle=null;
empty.icons=[];
assert(!manual.summon(empty,170,130,430,320,[{x:300,y:225,rx:5,ry:9}]),'nearby people and animals prevent a landing');
assert(!manual.summon(empty,NaN,130,430,320,[]));
assert(!manual.summon(empty,300,225,301,226,[]),'a click-sized gesture does not summon');
empty.walkable=()=>false;
assert(!manual.summon(empty,170,130,430,320,[]),'building footprints and blocked terrain prevent a landing');
empty.walkable=()=>true;
empty.openLawn=()=>false;
assert(manual.summon(empty,170,130,430,320,[]),'a narrow lane no longer invalidates the whole empty area');
manual.circle=null;
empty.openLawn=()=>true;
assert(new CropCircles().summon(empty,297,222,303,228,[{kind:'cloud',x:300,y:225,rx:170,ry:80}]),
  'an unselected overhead cloud must not block an empty ground gesture');
assert(manual.summon(empty,297,222,303,228,[]),'small drags use a house-sized circle when the surrounding footprint is clear');
assert.equal(manual.circle.radius,101);
assert(!new CropCircles().summon(empty,55,75,65,85,[]),'an enlarged small selection cannot spill beyond the desktop');

const tight={time:1,width:620,height:232,homes:[{door:{x:115,y:116}}],obstacles:[],openLawn:()=>true,path:()=>[{}]};
const fallback=new CropCircles();
fallback.nextAt=tight.time;
fallback.update(tight,.2);
assert.equal(fallback.circle?.radius,101,'a narrow empty field uses the smallest house-sized formation');

const w=new World(73519);
layout(w);hold(w);
tick(w);
assert(w.cropCircles.nextAt-w.time>=6*3600&&w.cropCircles.nextAt-w.time<=14*3600);

// Even with suitable terrain, a living creature in every candidate area prevents a landing.
const swarm=[];
for(let y=20;y<w.height;y+=45)for(let x=20;x<w.width;x+=45)swarm.push({x,y});
w.cropCircles.nextAt=w.time;
tick(w,true,()=>swarm);
assert.equal(w.cropCircles.circle,null);
assert(w.cropCircles.nextAt>w.time);

w.cropCircles.nextAt=w.time;
until(w,()=>w.cropCircles.circle!==null);
const interrupted=w.cropCircles.circle;
assert.equal(interrupted.stage,'forming','the saucer may arrive in the middle of the night');
assert.equal(CropCircles.flight(interrupted,w.time).trace,0);
for(const {strokes} of seeds){
  const outer=strokes[0].points;
  const width=(Math.max(...outer.map(p=>p[0]))-Math.min(...outer.map(p=>p[0])))*interrupted.radius;
  const height=(Math.max(...outer.map(p=>p[1]))-Math.min(...outer.map(p=>p[1])))*interrupted.radius;
  assert(width>farm.w*1.48&&height>farm.h,'the visible outer ring is larger than a house');
}
const intruder={x:interrupted.x+interrupted.radius+15,y:interrupted.y};
until(w,()=>w.cropCircles.circle===null,()=>[intruder]);
assert(w.time-interrupted.since<4,'an animal entering the landing area during approach aborts the visit');

w.cropCircles.nextAt=w.time;
until(w,()=>w.cropCircles.circle?.stage==='waiting');
const initial=w.cropCircles.circle;
const human=w.agents.find(a=>a.kind==='child');
const cow=w.agents.find(a=>a.kind==='cow');
assert(w.go(cow,initial,'forage',120));
until(w,()=>distance(cow,initial)<10);
assert.equal(w.cropCircles.circle,initial);
assert.equal(initial.stage,'waiting','passing animals leave the circle undiscovered');
w.cropCircles.nextAt=w.time-1000;
for(let i=0;i<1000;i++)tick(w);
assert.equal(w.cropCircles.circle,initial,'a pending spawn never replaces the undiscovered circle');

const saved=JSON.parse(JSON.stringify(w.snapshot()));
const resumed=new World();
assert(resumed.restore(saved));
layout(resumed);hold(resumed);
assert.deepEqual(resumed.cropCircles.circle,{...initial,readyAt:null});
const walker=resumed.agents.find(a=>a.id===human.id);
Object.assign(walker,{x:initial.x,y:initial.y,hidden:false});
assert(resumed.go(walker,resumed.nearestWalkable({x:initial.x+35,y:initial.y-6}),'wander'));
until(resumed,()=>resumed.cropCircles.circle.stage==='notice');
const legacy=new World();
assert(legacy.restore({...saved,cropCircles:{...saved.cropCircles,circle:{...initial,radius:48}}}));
assert.equal(legacy.cropCircles.circle.radius,48,'a crop circle already in the save can finish its lifecycle');
assert(w.relocateResident(human,initial));
for(let i=0;i<5;i++)tick(w);
assert.equal(initial.stage,'waiting','a relocated resident first looks around');
for(let i=0;i<3;i++)tick(w,false);
assert.equal(initial.stage,'waiting','a read-only preview does not make decisions');
until(w,()=>initial.stage==='notice');
assert.deepEqual(initial.crew,[human.id]);
until(w,()=>initial.stage==='report');
assert.deepEqual(human.target,w.home(human.home).door);
initial.since=w.time-121;tick(w);
assert.equal(initial.stage,'report','a distant discovery allows enough time to walk across the desktop and report');
initial.since=w.time;
until(w,()=>initial.stage==='fetch');
assert.equal(initial.crew.length,3);
const movedHelper=w.agents.find(a=>a.id===initial.crew[1]);
assert(w.relocateResident(movedHelper,w.home(movedHelper.home).door));
tick(w);
assert.equal(initial.stage,'waiting');
until(w,()=>initial.stage==='report');
assert.deepEqual(initial.crew,[human.id],'the finder remembers the circle when the crew is interrupted');
until(w,()=>initial.crew.length===3&&initial.crew.every(id=>w.agents.find(a=>a.id===id).state==='circleInside'));
const toolRoom=new World();
assert(toolRoom.restore(JSON.parse(JSON.stringify(w.snapshot()))));
layout(toolRoom,[{x:35,y:40,w:40,h:60}]);hold(toolRoom);
const toolCrew=toolRoom.agents.filter(a=>initial.crew.includes(a.id));
assert(toolCrew.every(a=>a.hidden&&distance(a,toolRoom.home(human.home).door)<1),'the crew goes inside the reporting house for tools');
until(toolRoom,()=>toolRoom.cropCircles.circle.stage==='carry');
assert(toolCrew.every(a=>!a.hidden&&a.state==='circleCarry'));
until(w,()=>initial.stage==='carry');
assert(w.agents.filter(a=>initial.crew.includes(a.id)).every(a=>a.state==='circleCarry'));
until(w,()=>initial.stage==='work');
until(w,()=>initial.progress>.2);

const midWork=new World();
assert(midWork.restore(JSON.parse(JSON.stringify(w.snapshot()))));
layout(midWork,[{x:35,y:40,w:40,h:60}]);hold(midWork);
const circle=midWork.cropCircles.circle,progress=circle.progress;
midWork.update(0,night);
assert.equal(circle.progress,progress,'paused redraws do not advance the job');
tick(midWork,false);
assert.equal(circle.progress,progress,'preview does not flatten the circle independently');
assert.deepEqual(circle.patches,initial.patches,'reload preserves each worked patch, seed time and worker assignment');
assert(midWork.agents.filter(a=>circle.crew.includes(a.id)).every(a=>['circlePlant','circleCarry'].includes(a.state)&&a.game===CropCircles.game));
assert(circle.patches.some(p=>p.plantedAt!==null)&&circle.patches.some(p=>p.plantedAt===null),'unvisited lines remain bare while planted patches recover');
const underIcon=new World();
assert(underIcon.restore(JSON.parse(JSON.stringify(midWork.snapshot()))));
const coveredPatch=underIcon.cropCircles.circle.patches.find(p=>p.plantedAt===null);
layout(underIcon,[{x:coveredPatch.x-15,y:coveredPatch.y-10,w:28,h:24}]);hold(underIcon);
assert.equal(underIcon.cropCircles.circle.stage,'work','moving an icon over a working circle preserves the job');
until(underIcon,()=>underIcon.cropCircles.circle===null);
assert(!underIcon.agents.some(a=>a.game===CropCircles.game),'villagers can finish lines partly beneath desktop icons');
const interruptedWork=new World();
assert(interruptedWork.restore(JSON.parse(JSON.stringify(midWork.snapshot()))));
layout(interruptedWork);hold(interruptedWork);
const planting=interruptedWork.cropCircles.circle;
const plantedTimes=planting.patches.map(p=>p.plantedAt);
const helper=interruptedWork.agents.find(a=>a.id===planting.crew[1]);
assert(interruptedWork.relocateResident(helper,interruptedWork.home(helper.home).door));
tick(interruptedWork);
assert.equal(planting.stage,'waiting');
assert.deepEqual(planting.patches.map(p=>p.plantedAt),plantedTimes,'interruption keeps planted ground intact');
assert(planting.patches.every(p=>p.worker===null),'retry releases every patch reservation');
until(midWork,()=>midWork.cropCircles.circle===null);
assert(!midWork.agents.some(a=>a.game===CropCircles.game));
tick(midWork);
assert(midWork.cropCircles.nextAt>midWork.time+5*3600);
console.log('PASS: unique crop circles, empty landing sites, night arrival, one pending circle, local discovery, crew and tools, save, icon layout, pause and preview');
