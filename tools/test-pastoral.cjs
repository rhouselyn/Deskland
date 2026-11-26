const assert=require('node:assert/strict');
const {World,worldDate,farm,farmPoint,lampsDue}=require('../prototype/pastoral-world.js');
const SunCalc=require('../prototype/vendor/suncalc.js');
const icons=Array.from({length:9},(_,i)=>({x:10,y:10+i*85,w:75,h:75}));
const w=new World(73519);
w.layout(1600,1000,icons);
assert.equal(w.homes.length,3);
assert.equal(w.agents.filter(a=>a.kind==='cow').length,12);
assert.equal(w.agents.filter(a=>a.kind==='adult').length,6);
assert.equal(w.agents.filter(a=>a.kind==='child').length,4);
for(const h of w.homes){
  assert(!icons.some(r=>h.x<r.x+r.w&&h.x+farm.w>r.x&&h.y<r.y+r.h&&h.y+farm.h>r.y));
  assert(w.walkable(h.door),'door accessible from the yard');
  assert(!w.walkable(farmPoint(h,3,2)),'house footprint blocks walking');
  for(const e of [-.62,.62])for(const n of [-1.25,1.25]){
    assert(w.path(h.door,farmPoint(h,farm.tableX+e,farm.tableY+n)).length,'path from door to each seat');
  }
  const base=farmPoint(h,2,0),top=z=>base.y-farmPoint(h,2,0,z).y;
  assert(top(farm.child)<top(farm.adult)*.7&&top(farm.adult)<top(2.08),'child, adult and doorway share a scale');
}
const day={altitude:45,setting:false,progress:.3,day:'2026-11-21'};
for(let i=0;i<1000;i++)w.update(.2,day,()=>true);
assert(w.agents.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&w.walkable(a)));
assert(new Set(w.agents.map(a=>a.state)).size>2,'independent behavior');
assert(w.agents.some(a=>a.kind==='cow'&&a.state==='graze'),'grazing');
const before=w.homes.map(h=>[h.x,h.y]);
w.layout(1600,1000,[...icons,{x:1550,y:0,w:40,h:40}]);
assert.deepEqual(w.homes.map(h=>[h.x,h.y]),before,'unaffected houses stay put');
const snapshot=JSON.parse(JSON.stringify(w.snapshot())),restored=new World();
snapshot.homes[0].door={x:snapshot.homes[0].x+76,y:snapshot.homes[0].y+82};
assert(restored.restore(snapshot));restored.layout(1600,1000,icons);
assert.deepEqual(restored.homes[0].door,farmPoint(restored.homes[0],3.6,-1.25),'old saves refresh the door anchor');
assert.deepEqual(restored.agents.map(a=>a.id),w.agents.map(a=>a.id));
assert(!restored.restore({version:1,seed:0,homes:[],agents:[{kind:'cow',x:NaN,y:0}],torches:[]}));
for(const a of w.agents){a.path=[];a.until=0;}
for(let i=0;i<1200;i++)w.update(.2,{...day,altitude:5,setting:true,progress:.95});
assert(w.torches.some(t=>t.lit),'adults light torches');
for(let i=0;i<2400;i++)w.update(.2,{...day,altitude:-15,setting:true,progress:1});
assert(w.agents.filter(a=>a.kind==='child').every(a=>['home','return','toWatch','skywatch'].includes(a.state)),'children return home or go out to watch the aurora');
const lawn=new World(73519);lawn.layout(1280,800,[]);lawn.flock.update=()=>{};
for(const road of lawn.roads)for(let i=1;i<road.length;i++){
  const middle={x:(road[i-1].x+road[i].x)/2,y:(road[i-1].y+road[i].y)/2};
  assert(!lawn.openLawn(middle),'a resident cannot settle onto a village lane');
}
for(const [altitude,state] of [[40,'lawnRest'],[-25,'skywatch']]){
  const kinds=new Set(),finished=new Set();let previous=[],saved=false;
  for(let i=0;i<2200;i++){
    lawn.update(.25,{...day,altitude,setting:altitude<0,progress:.36});
    const resting=lawn.agents.filter(a=>a.state===state);
    assert(resting.length<=(altitude<0?2:3));
    for(const a of resting){kinds.add(a.kind);assert(!a.hidden&&lawn.openLawn(a));}
    for(const a of previous)if(a.state!==state)finished.add(a.kind);
    previous=resting;
    if(!saved&&resting.some(a=>a.age>3&&a.until>lawn.time+4)){
      const resident=resting.find(a=>a.age>3&&a.until>lawn.time+4),copy=new World();
      assert(copy.restore(JSON.parse(JSON.stringify(lawn.snapshot()))));copy.layout(1280,800,[]);
      const same=copy.agents.find(a=>a.id===resident.id);assert.equal(same.state,state);assert.equal(same.until,resident.until);saved=true;
    }
  }
  assert.deepEqual([...kinds].sort(),['adult','child']);assert.deepEqual(finished,kinds);assert(saved);
}
const crowded=new World();crowded.layout(200,180,[{x:0,y:0,w:200,h:180}]);assert.equal(crowded.homes.length,0);assert.equal(crowded.agents.length,0);
{
  const excursion=new World(73519);excursion.layout(1600,1000,[]);
  const walker=excursion.agents.find(a=>a.kind==='adult');
  Object.assign(walker,{hunger:0,fatigue:0,hidden:false});
  assert(!excursion.explore(walker));
  assert(excursion.nextExcursionAt>=excursion.time+12*60&&excursion.nextExcursionAt<=excursion.time+24*60);
  excursion.nextExcursionAt=0;
  assert(excursion.explore(walker));
  assert.equal(walker.state,'explore');
  assert(Math.hypot(walker.x-walker.target.x,walker.y-walker.target.y)>=300);
  assert(excursion.nextExcursionAt>=excursion.time+20*60&&excursion.nextExcursionAt<=excursion.time+40*60);
  const explorerSave=JSON.parse(JSON.stringify(excursion.snapshot()));
  const explorerReload=new World();assert(explorerReload.restore(explorerSave));explorerReload.layout(1600,1000,[]);
  assert.equal(explorerReload.nextExcursionAt,excursion.nextExcursionAt);
  assert.equal(explorerReload.agents.find(a=>a.id===walker.id).state,'explore');
  const second=excursion.agents.find(a=>a.kind==='adult'&&a!==walker);
  Object.assign(second,{hunger:0,fatigue:0});
  excursion.nextExcursionAt=0;
  assert(!excursion.explore(second),'one villager takes a long excursion at a time');
  Object.assign(walker,walker.target,{path:[],target:null});
  excursion.arrive(walker,day);
  assert.equal(walker.state,'exploreRest');
  assert(walker.until>=excursion.time+35&&walker.until<=excursion.time+65);
  excursion.choose(walker,day,()=>false);
  assert.equal(walker.state,'return');
  assert.deepEqual(walker.target,excursion.home(walker.home).door);
  const quadrants=new Set();
  Object.defineProperty(excursion,'cropCircles',{get(){throw Error('excursions must never consult crop circles');}});
  for(let i=0;i<100;i++){
    Object.assign(walker,excursion.nearestWalkable({x:80,y:80}),{state:'idle',path:[],target:null,hunger:0,fatigue:0});
    excursion.nextExcursionAt=0;
    assert(excursion.explore(walker));
    quadrants.add(Number(walker.target.x>=800)+2*Number(walker.target.y>=474));
}
assert.equal(quadrants.size,4,'distant destinations cover all desktop quadrants even when starting in a corner');
Object.assign(walker,{state:'idle',fatigue:.8});
excursion.nextExcursionAt=0;
assert(!excursion.explore(walker),'tired villagers stay near home');
}
const summer=SunCalc.getTimes(new Date('2026-06-21T04:00:00Z'),31.23,121.47),winter=SunCalc.getTimes(new Date('2026-12-21T04:00:00Z'),31.23,121.47);
assert(summer.sunset-summer.sunrise>winter.sunset-winter.sunrise,'seasonal day lengths');
assert(Number.isNaN(+SunCalc.getTimes(new Date('2026-06-21T12:00:00Z'),89,0).sunset),'polar day handled by altitude');
console.log('PASS: population, safe layout, independent behavior, persistent identities, evening tasks, night, crowded screen and solar seasons');

const games=new World(73519);games.layout(1600,1000,[]);const seen=new Set();
for(let i=0;i<200;i++){games.games=[];for(const a of games.agents){a.game=null;a.hidden=false;a.state='idle';a.path=[];}games.startGame();games.games.forEach(g=>seen.add(g.type));}
assert.equal(seen.size,4,'all four games can reserve a safe field and gather children');
console.log('PASS: tag, ball, train and circle games');

const yards=new World(73519);yards.layout(1600,1000,[]);yards.flock.update=()=>{};
const familyDogs=()=>yards.agents.filter(a=>a.kind==='dog');
assert.deepEqual(familyDogs().map(d=>d.home),[0,1,2]);
assert.equal(yards.village.birds.length,6);
for(const h of yards.homes){
  assert(yards.path(h.door,h.kennel,yards.yardRoutes).length,'each kennel has an accessible entrance');
  assert(!yards.walkable(farmPoint(h,1,-3.5)),'kennel walls block paths');
}
const oldHouseholds=JSON.parse(JSON.stringify(yards.snapshot()));delete oldHouseholds.village;
oldHouseholds.agents=oldHouseholds.agents.filter(a=>a.kind!=='dog');
const legacyYard=new World();assert(legacyYard.restore(oldHouseholds));legacyYard.layout(1600,1000,[]);
assert.equal(legacyYard.agents.length,oldHouseholds.agents.length+3);assert.equal(legacyYard.village.birds.length,6);

const lunch=new World(73519);lunch.layout(1440,900,[]);lunch.flock.update=()=>{};
const middayClock={...day,progress:.5};
let afterLunch=false;
for(let i=0;i<5500&&!afterLunch;i++){
  lunch.update(.22,middayClock);
  afterLunch=lunch.village.plays.some(g=>g.stage!=='gather'&&lunch.village.actors(lunch,g).some(a=>a.lastMeal===day.day+'/lunch'));
}
assert(afterLunch,'a villager who finished lunch can play with their dog even with the clock fixed at noon');
const lastStages=new Set(),birdModes=new Set(),dayEvents=new Set(),eventStarts=new Set();
let previousEvent=-Infinity,midPlay=null;
for(let i=0;i<22000;i++){
  yards.update(.18,{...day,progress:.33});
  for(const g of yards.village.plays){
    const actors=yards.village.actors(yards,g);
    assert(actors.every(a=>a.game==='yard-'+g.home&&a.home===g.home));
    if(['give','turn','win','pat'].includes(g.stage))lastStages.add(g.type);
    if(!midPlay&&g.stage==='carry')midPlay=JSON.parse(JSON.stringify(yards.snapshot()));
  }
  yards.village.birds.forEach(b=>birdModes.add(b.mode));
  const event=yards.village.event;
  if(event&&!eventStarts.has(event.start)){
    assert(event.start-previousEvent>=359.9);
    previousEvent=event.start;eventStarts.add(event.start);dayEvents.add(event.type);
  }
}
assert.deepEqual(lastStages,new Set(['fetch','tug','chase','recall']));
assert.deepEqual(dayEvents,new Set(['migration','butterflies']));
const Village=require('../prototype/pastoral-village.js'),{random}=require('../prototype/pastoral-world.js');
const sky=random(527),shapes=new Set(),roosts=[];
for(let i=0;i<180;i++){
  const dir=i%8,at={x:yards.width/2,y:yards.height*.47};
  assert.notEqual(Village.nextHeading(dir,sky),dir);
  const e=Village.migration(yards,at,dir,sky,0);
  shapes.add(e.shape);
  if(!e.rest)continue;
  roosts.push(e);
  const landing=e.stop/e.speed;
  for(let b=0;b<e.count;b++){
    const settled=Village.migrantAt(e,b,landing+2);
    const later=Village.migrantAt(e,b,landing+7);
    assert(settled.grounded&&later.grounded&&yards.openLawn(settled));
    assert.deepEqual([settled.x,settled.y],[later.x,later.y]);
    const air=Village.migrantAt(e,b,landing+e.rest+5),next=Village.migrantAt(e,b,landing+e.rest+6);
    assert(!air.grounded&&air.altitude>25&&Math.sign(next.x-air.x)===e.side);
  }
}
assert.equal(shapes.size,3);assert(roosts.length>0&&roosts.length<180);
const relocate=roosts[0],arrival=relocate.stop/relocate.speed;
Village.recheckRoost({openLawn:()=>false},relocate,arrival+4);
assert(Math.abs(relocate.rest-4)<1e-8,'moving an icon onto resting birds advances their departure');
assert(!Village.migrantAt(relocate,0,arrival+7).grounded);
const noGrass=Village.migration({width:900,openLawn:()=>false},{x:450,y:350},1,()=>0,0);
assert.equal(noGrass.rest,0,'no safe patch means a flyover');
console.log('PASS: migration formations, clear landing sites, resting, icon relocation and departure');
for(const mode of ['preen','fly','peck','hop','weave'])assert(birdModes.has(mode));
const mirror=new World();assert(midPlay&&mirror.restore(midPlay));mirror.layout(1600,1000,[]);
const carry=mirror.village.plays.find(g=>g.stage==='carry');
assert(carry&&mirror.village.actors(mirror,carry).every(a=>a.game==='yard-'+carry.home));
assert.deepEqual(mirror.village.birds,midPlay.village.birds);
const affected=mirror.homes[carry.home];
mirror.layout(1600,1000,[{x:affected.x,y:affected.y,w:100,h:100}]);
assert(!mirror.village.plays.includes(carry));
assert(mirror.village.birds.every(b=>b.homeX===mirror.homes[b.index>>1].x));
const remaining=yards.village.eventIn;
for(let i=0;i<1600;i++)yards.update(.17,{...day,altitude:-18,setting:true});
assert.equal(yards.village.plays.length,0);assert.equal(yards.village.event,null);
assert.equal(yards.village.eventIn,remaining,'night never consumes daytime cooldown');
assert(familyDogs().every(d=>d.state==='curl'&&Math.hypot(d.x-yards.homes[d.home].kennel.x,d.y-yards.homes[d.home].kennel.y)<4));
assert(yards.village.birds.every(b=>b.mode==='sleep'&&b.at==='nest'));
console.log('PASS: family dogs, four completed dog games, roof birds, rare events, night, relocation, preview and legacy households');

const instant=new Date('2026-11-21T16:30:00Z');
assert.equal(worldDate(instant,{realTime:1}),instant,'real time is unchanged');
assert.equal(worldDate(instant,{realTime:0,fixedTime:720},'Asia/Shanghai').toISOString(),'2026-11-22T04:00:00.000Z','fixed time uses the selected location calendar day');
assert.equal(worldDate(new Date(+instant+60000),{realTime:0,fixedTime:720},'Asia/Shanghai').getTime(),worldDate(instant,{realTime:0,fixedTime:720},'Asia/Shanghai').getTime(),'fixed clock does not advance');
assert.equal(worldDate(instant,{realTime:0,fixedTime:0},'Asia/Shanghai').toISOString(),'2026-11-21T16:00:00.000Z','midnight');
assert.equal(worldDate(instant,{realTime:0,fixedTime:1439},'Asia/Shanghai').toISOString(),'2026-11-22T15:59:00.000Z','last minute');
assert.equal(worldDate(new Date('2026-03-08T12:00:00Z'),{realTime:0,fixedTime:150},'America/New_York').toISOString(),'2026-03-08T07:30:00.000Z','DST gap moves forward');
assert.equal(worldDate(new Date('2026-11-01T12:00:00Z'),{realTime:0,fixedTime:90},'America/New_York').toISOString(),'2026-11-01T05:30:00.000Z','DST repeated hour is deterministic');
assert(Number.isFinite(+worldDate(instant,{realTime:0,fixedTime:NaN},'bad-zone')),'invalid persisted settings have a safe fallback');
console.log('PASS: fixed/real clock, location date, midnight, end of day and daylight saving transitions');

const Light=require('../prototype/pastoral-light.js');
for(const setting of [false,true])for(let altitude=-90;altitude<=90;altitude+=.5){
 const p=Light.palette(altitude,setting,.5);
 for(const value of Object.values(p))if(Array.isArray(value))assert(value.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'valid palette');
}
const midday=Light.palette(40,false,.5),evening=Light.palette(3,true,.95),nightPaint=Light.palette(-20,true,1);
const morning=Light.palette(30,false,.32);
assert.deepEqual(morning.grassMid,[84/255,182/255,78/255],'the former emerald noon is retained in the morning');
assert(morning.highSun===0&&midday.highSun===1&&midday.grassLight[0]>morning.grassLight[0]+.15,'bright overhead light peaks at noon');
assert(lampsDue({altitude:-3,setting:true})&&!lampsDue({altitude:3,setting:true}),'blue-hour seek lights the village and leaves time for dusk torch tasks');
assert.equal(new Set([[-6,false,0],[2,false,0],[25,false,.2],[40,false,.5],[25,true,.8],[3,true,.95],[-4,true,1],[-18,true,1]].map(args=>Light.palette(...args).phase)).size,8,'all eight visual phases are reachable');
assert(midday.grassMid[1]>midday.grassMid[0],'green midday');
assert(evening.cloudBody[0]>evening.cloudBody[1],'coral sunset');
assert(nightPaint.grassMid[2]>nightPaint.grassMid[0]&&nightPaint.ambient[0]>.4,'readable blue night');
const daylightEdge=Light.palette(11.999,false,.5);assert(Math.max(...daylightEdge.grassMid.map((v,i)=>Math.abs(v-Light.palette(12,false,.5).grassMid[i])))<.001,'high-latitude noon stays continuous');
const image=Light.blend({},midday,1),initial=image.grassMid[0];Light.blend(image,nightPaint,.3);assert(image.grassMid[0]<initial&&image.grassMid[0]>nightPaint.grassMid[0],'smooth transition');
const site={lat:31.23,lon:121.47,zone:'Asia/Shanghai'};
const sunriseDay=Light.solar(new Date('2026-11-21T04:00:00Z'),site);
assert.equal(sunriseDay.day,'2026-11-21');assert(Number.isFinite(sunriseDay.sunrise)&&Number.isFinite(sunriseDay.sunset));
const arctic=Light.solar(new Date('2026-06-21T12:00:00Z'),{lat:89,lon:0,zone:'UTC'});assert.equal(arctic.sunset,null);assert(arctic.palette.grassMid.every(Number.isFinite));
console.log('PASS: vivid daytime, coral sunset, readable moonlight, continuous transitions and local solar events');

const Flock=require('../prototype/pastoral-flock.js');
const pasture=new World(73519);pasture.layout(1280,800,icons);
const flock=pasture.flock,atHome=s=>s.x>=Flock.fence.left&&s.x<=Flock.fence.right&&Math.abs(s.y)<=Flock.fence.half;
assert.equal(pasture.fireflySpots().length,18);
assert(pasture.fireflySpots().every(p=>pasture.walkable(p)));
assert.deepEqual(crowded.fireflySpots(),[]);
assert(flock.site&&flock.sheep.filter(s=>s.kind==='lamb').length===26&&flock.sheep.length===80);
assert((Flock.fence.right-Flock.fence.left)*Flock.fence.half*2>2*86*56&&flock.sheep.every(atHome),'larger pen fits all eighty');
assert(!pasture.walkable(flock.screen({x:0,y:0})), 'ordinary villagers walk around the pen');
function resume(snapshot){
  const copy=new World();assert(copy.restore(JSON.parse(JSON.stringify(snapshot))));copy.layout(1280,800,icons);return copy;
}
const parked=resume(pasture.snapshot()).flock;
parked.runDog=()=>{};
for(let i=0;i<200;i++)parked.update(.1,{minute:420},i*.1,true);
assert(parked.sheep.every(s=>s.x<60),'sheep wait for their collie');
// 同一群羊在开阔地面对同一只犬，换一块目的草场不应改变它们的即时反应。
function fixedCollie(side,fieldOffset){
  const f=resume(pasture.snapshot()).flock;
  const origin=f.local({x:315,y:165});
  for(const [i,s] of f.sheep.entries()){
    s.x=origin.x+(i%10-4.5)*17;s.y=origin.y+(Math.floor(i/10)-3.5)*16;s.vx=s.vy=0;
  }
  Object.assign(f.dog,{x:origin.x+side*87,y:origin.y,state:'drive'});
  f.mode='drive';f.fields[f.patch]={x:origin.x+fieldOffset,y:origin.y+155};f.fieldRoute=null;
  f.runDog=()=>{};
  for(let i=0;i<30;i++)f.update(1/30,{minute:720},i/30,true);
  return f.sheep.reduce((sum,s)=>sum+(s.x-origin.x)/80,0);
}
const fromLeft=fixedCollie(-1,170),fromRight=fixedCollie(1,170);
assert(fromLeft>2&&fromRight< -2,'the flock yields to the actual side of the collie');
assert(Math.abs(fixedCollie(-1,-170)-fromLeft)<.2,'sheep have no advance knowledge of the next pasture');
const backingWorld=resume(pasture.snapshot()),backing=backingWorld.flock,dog=backing.dog;
const onLane=x=>backing.local({x,y:165}),goal=onLane(350);
Object.assign(dog,onLane(240),{dir:Math.PI,vx:0,vy:0,state:'collect'});
Object.assign(backing.sheep[0],onLane(270));
assert(!backing.backShortcut(goal),'a single sheep does not trigger a back run');
for(const [i,x] of [[1,283],[3,295],[4,310]])Object.assign(backing.sheep[i],onLane(x),{state:'walk'});
let crossedOnBack=false;
for(let i=0;i<150;i++){
  backing.runDog(goal,'collect',1/30);backingWorld.separateBodies();
  const facing=dog.vx*Math.cos(dog.dir)+dog.vy*Math.sin(dog.dir);
  assert(facing>=.84*Math.hypot(dog.vx,dog.vy),'collie turns before running in a new direction');
  if(dog.lift>4&&Math.hypot(dog.x-backing.sheep[3].x,dog.y-backing.sheep[3].y)<5){
    crossedOnBack=true;assert.equal(resume(backingWorld.snapshot()).flock.dog.lift,dog.lift);
  }
}
assert(crossedOnBack&&dog.lift===0&&Math.hypot(dog.x-goal.x,dog.y-goal.y)<3,'collie crosses real backs and lands at the other side');
function medianGap(group){
  const nearest=group.map(s=>Math.min(...group.filter(peer=>peer!==s).map(peer=>Math.hypot(peer.x-s.x,peer.y-s.y))));
  return nearest.sort((a,b)=>a-b)[Math.floor(nearest.length/2)];
}
const packedWorld=resume(pasture.snapshot()),packed=packedWorld.flock;
const clearing=packed.local({x:315,y:165});packed.mode='graze';packed.fields[packed.patch]=clearing;packed.nextSwitch=packed.nextWander=500;
for(const s of packed.sheep)Object.assign(s,clearing);
for(let i=0;i<1200;i++){packed.update(1/30,{minute:720},i/30,true);packedWorld.separateBodies();}
assert(medianGap(packed.sheep)>18,'even an overlapping saved flock spreads out on open grass without a reset');
function exerciseFlock(dt){
  const w=resume(pasture.snapshot()),f=w.flock;
  f.update(dt,{minute:419},0,true);assert.equal(f.mode,'folded');
  const patches=[];let strayed=false,rejoined=false,collecting=false,checkedSpacing=false;
  let t=0;
  for(;t<640;t+=dt){
    const before=f.sheep[0].dir;
    f.update(dt,{minute:420},t,true);w.separateBodies();
    assert(Math.cos(f.sheep[0].dir-before)>=Math.cos(3.2*dt)-1e-9,'heading cannot snap around between frames');
    if(f.mode==='graze'&&patches.at(-1)!==f.field())patches.push(f.field());
    if(f.mode==='graze'&&!checkedSpacing&&f.nextSwitch-t<77){
      assert(medianGap(f.sheep)>20,'grazing sheep keep room between their bodies');
      checkedSpacing=true;
    }
    if(f.stray>=0)strayed=true;
    if(strayed&&f.dog.state==='collect')collecting=true;
    if(collecting&&f.stray<0&&f.collect<0&&f.dog.state==='watch')rejoined=true;
    for(const a of [...f.sheep,f.dog])assert(f.ground[f.cell(a)],'the journey stays on physical ground');
  }
  assert(patches.length>=3,'herd actually arrives and grazes at successive destinations');
  for(let i=1;i<patches.length;i++)assert(Math.hypot(patches[i].x-patches[i-1].x,patches[i].y-patches[i-1].y)>=.36*Math.hypot(w.width,w.height));
  assert(checkedSpacing&&strayed&&rejoined,'collie retrieves a stray and resumes watching a spread-out flock');
  const saved=JSON.parse(JSON.stringify(w.snapshot())),copy=resume(saved).flock;
  assert.deepEqual(copy.snapshot(),saved.flock,'the destinations and flock resume in place');
  copy.update(dt,{minute:1080},t,false);assert.equal(copy.mode,saved.flock.mode,'read-only preview does not issue orders');
  for(;t<850;t+=dt){f.update(dt,{minute:1080},t,true);w.separateBodies();}
  assert.equal(f.mode,'folded');assert(f.sheep.every(atHome));assert.equal(f.dog.state,'rest');
  assert(Math.hypot(f.dog.x-Flock.kennel.x,f.dog.y-Flock.kennel.y)<1,'collie returns to its kennel');
}
exerciseFlock(.25);exerciseFlock(1/30);
const oldWorld=JSON.parse(JSON.stringify(pasture.snapshot()));delete oldWorld.flock;
oldWorld.agents=oldWorld.agents.filter(a=>a.kind!=='cow'||Number(a.id.slice(4))<8);
const upgraded=new World();assert(upgraded.restore(oldWorld));upgraded.layout(1280,800,icons);
assert.equal(upgraded.agents.filter(a=>a.kind==='cow').length,12);assert.equal(upgraded.flock.sheep.length,80);
const legacy=JSON.parse(JSON.stringify(flock.snapshot()));legacy.sheep=legacy.sheep.slice(0,11);legacy.mode='graze';
delete legacy.dog.lift;
legacy.sheep.forEach((s,i)=>{s.x=140+i;s.y=12;});
const expanded=new Flock();assert(expanded.restore(legacy));assert.equal(expanded.sheep.length,80);
assert.deepEqual(expanded.sheep.slice(0,11),legacy.sheep);assert.deepEqual(expanded.dog,{...legacy.dog,lift:0});
assert(expanded.sheep.slice(11).every(s=>!atHome(s))&&expanded.mode==='graze','new sheep join a grazing legacy flock');
assert(oldWorld.agents.every(a=>upgraded.agents.some(b=>b.id===a.id)));
const oldSite={...flock.site};
pasture.layout(1280,800,[...icons,{x:oldSite.x-20,y:oldSite.y-20,w:40,h:40}]);
assert(pasture.flock.site&&Math.hypot(pasture.flock.site.x-oldSite.x,pasture.flock.site.y-oldSite.y)>40,'icon move relocates the pen');
assert.equal(crowded.flock.site,null);
const narrowWorld=new World();narrowWorld.layout(730,1200,[{x:0,y:0,w:205,h:1200},{x:430,y:0,w:300,h:1200}]);
const narrow=narrowWorld.flock;
assert(narrow.site&&narrow.site.vertical,'a narrow aisle between icon columns supports a full flock');
for(const a of [...narrow.sheep,narrow.dog]){const p=narrow.screen(a);assert(p.x>205&&p.x<430);}
const divided=new World(102);divided.layout(1280,800,[{x:460,y:0,w:65,h:800}]);
const side=divided.flock.site.x<460;let crossed=false;
assert(divided.path({x:430,y:100},{x:550,y:100}).some(p=>!divided.iconFree(p)),'animals can cross icons');
assert.equal(divided.path({x:430,y:100},{x:490,y:100}).length,0,'an individual destination cannot be in an icon');
for(let i=0;i<30;i++){
  divided.flock.chooseField(divided.flock.field());
  const destination=divided.flock.screen(divided.flock.field());
  assert(divided.iconFree(destination));if((destination.x<460)!==side)crossed=true;
}
assert(crossed,'an unbroken column of icons allows pastures on both sides');
const crossing=divided.flock,underIcon={x:490,y:100};
const walker=crossing.sheep[0],start=crossing.local({x:435,y:100}),end=crossing.local(underIcon);
Object.assign(walker,start);crossing.move(walker,end.x-start.x,end.y-start.y,1);
assert(!divided.iconFree(crossing.screen(walker)),'a sheep can physically enter an icon');
const contact=resume(pasture.snapshot()),mixed=contact.flock;
const people=contact.agents.filter(a=>!a.hidden);
const cow=people.find(a=>a.kind==='cow'),adult=people.find(a=>a.kind==='adult');
const same={x:295,y:165},local=mixed.local(same);
Object.assign(mixed.sheep[0],local);Object.assign(mixed.dog,local);
Object.assign(cow,same);Object.assign(adult,same);
for(let i=0;i<6;i++)contact.separateBodies();
const bodies=[mixed.screen(mixed.sheep[0]),mixed.screen(mixed.dog),cow,adult];
for(let i=0;i<bodies.length;i++)for(let j=0;j<i;j++)
  assert(Math.hypot(bodies[i].x-bodies[j].x,bodies[i].y-bodies[j].y)>7,'different species keep a physical core');
const penWorld=new World();penWorld.layout(1440,900,[]);
const corner=penWorld.flock;
corner.mode='enter';corner.herd={x:14.7,y:3};
Object.assign(corner.sheep[0],{x:53,y:65});Object.assign(corner.sheep[1],{x:68,y:65});
Object.assign(corner.dog,{x:50,y:90});
for(let i=0;i<450;i++)penWorld.update(.1,{...day,altitude:-20,minute:1320});
assert(corner.gateClosed&&corner.sheep.every(atHome),'the last two sheep clear the kennel corner and the gate closes');
assert(corner.sheep.some(s=>s.state==='rest')&&corner.sheep.some(s=>s.state==='walk'),'some sheep lie down while others move inside the pen');
Object.assign(corner.sheep[0],{x:52,y:0});corner.move(corner.sheep[0],20,0,.2);
assert(atHome(corner.sheep[0]),'the closed gate physically contains the flock');
const oldThirty=JSON.parse(JSON.stringify(flock.snapshot()));oldThirty.sheep.length=30;delete oldThirty.fields;
const migrated=new Flock();assert(migrated.restore(oldThirty));assert.equal(migrated.sheep.length,80);
assert.deepEqual(migrated.sheep.slice(0,30),oldThirty.sheep);
const {meteorBatch,meteorPeriod,auroraLight}=require('../prototype/pastoral-world.js');
const auroras=Array.from({length:960},(_,i)=>auroraLight(i,123,-20));
const strengths=auroras.map(a=>a.strength);
assert(Math.min(...strengths)>=.32&&Math.min(...strengths)<.41&&Math.max(...strengths)>.90,'quiet spells keep a visible glow below the bright swells');
const strong=auroras.filter(a=>a.strength>.65);
assert(strong.some(a=>a.center<-.5)&&strong.some(a=>a.center>.5),'the bright band reaches both sides');
assert(auroras.every((a,i)=>a.halfWidth<.7&&(!i||Math.abs(a.center-auroras[i-1].center)<.09)),'the band stays local and moves gradually');
assert(auroras.every(a=>a.primary[1]-a.primary[0]>.35&&a.fringe[2]-a.fringe[1]>.30),'both layers retain distinct hues during palette transitions');
const separation=auroras.map(a=>a.center-a.foldCenter);
assert(Math.min(...separation)<-.6&&Math.max(...separation)>.6,'the two lights separate and cross paths');
for(const key of ['primary','fringe','halfWidth','center','bend','foldCenter','foldBend','foldGain','strength'])
  assert(new Set(auroras.map(a=>JSON.stringify(a[key]))).size>8);
for(const t of [0,80,160,640]){
  const a=auroraLight(t-.001,123,-20),b=auroraLight(t+.001,123,-20);
  for(const k of ['strength','dx','dy','center','bend','halfWidth','foldCenter','foldBend','foldGain'])assert(Math.abs(a[k]-b[k])<.002,'no jump at a lighting transition');
  for(const key of ['primary','fringe'])assert(Math.max(...a[key].map((v,i)=>Math.abs(v-b[key][i])))<.001);
}
assert.equal(auroraLight(31,123,10),null);
assert(auroraLight(31,123,-4.01).strength<.001,'light fades through twilight');
for(let cycle=-1;cycle<10;cycle++){
  const counts=[];
  for(let i=0;i<8;i++){
    const slot=cycle*8+i,paths=meteorBatch(slot,123);
    assert.deepEqual(paths,meteorBatch(slot,123));counts.push(paths.length);
    const bearing={vertical:i%2===0,side:i%3===0?-1:1,slope:.22},now=123.5;
    const triggered=meteorBatch(slot,123,bearing,now);
    assert.equal(triggered[0].start,now);
    assert.deepEqual(triggered.map(p=>p.color),paths.map(p=>p.color),'a click uses the natural schedule and meteor palette');
    for(const p of triggered){
      const [from,to,across]=bearing.vertical?[p.y0,p.y1,p.x1-p.x0]:[p.x0,p.x1,p.y1-p.y0];
      assert(Math.min(from,to)<0&&Math.max(from,to)>1&&Math.sign(to-from)===bearing.side);
      assert(Math.abs(across-bearing.slope)<1e-8,'shower members follow the shared heading');
      assert(p.width>=.027&&p.width<=.040&&p.flight>=6.3&&p.flight<=8.4&&p.linger>=3.5&&p.linger<=4.8);
    }
    for(const [j,p] of paths.entries()){
      const crosses=(a,b)=>Math.min(a,b)<0&&Math.max(a,b)>1;
      assert(crosses(p.x0,p.x1)||crosses(p.y0,p.y1),'each meteor crosses opposite screen edges');
      assert(p.flight>=6&&p.linger>=3.5);
      assert(p.start>slot*meteorPeriod&&p.start+p.flight+p.linger<(slot+1)*meteorPeriod,'tail fades before the next slot');
      if(j)assert(p.start>paths[j-1].start+2&&p.start<paths[j-1].start+paths[j-1].flight,'shower members overlap and arrive separately');
      assert(auroraLight(p.start+p.flight/2,123,-20).strength>0,'meteors can cross a lit night scene');
    }
  }
  assert.equal(counts.filter(n=>n===1).length,5);assert.equal(counts.filter(n=>n===2).length,2);
  assert.equal(counts.filter(n=>n>=5&&n<=7).length,1);
}
assert.equal(Light.solar(new Date(2026,0,1,7,0),null).minute,420,'clock works before location permission');
console.log('PASS: herd size, dog pressure, turnout, pasture rotation, strays, gate, kennel, preview, relocation and legacy saves');
