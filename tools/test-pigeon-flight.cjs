const assert=require('node:assert/strict');
const Village=require('../prototype/pastoral-village.js');
const {random,World}=require('../prototype/pastoral-world.js');

const day={altitude:37,setting:false},night={altitude:-15,setting:true};
const world={width:1200,height:820,time:0,homes:[],agents:[],rng:random(77),
  openLawn:p=>p.x>24&&p.x<1176&&p.y>24&&p.y<796};
const village=new Village();
village.pigeonIn=0;
village.update(world,.2,day);
const group=village.pigeons;
assert(group&&group.legs.filter(l=>l.rest>0).length>=2);
assert(group.count>=48&&group.count<=72);
assert(group.duration>=360&&group.duration<900,'the flock stays for several minutes');
const offscreen=p=>p.x<0||p.x>world.width;
let elapsed=0;
for(let i=0;i<group.count;i++)assert(offscreen(Village.pigeonAt(group,i,0)));
for(const l of group.legs){
  if(l.rest){
    for(let i=0;i<group.count;i++){
      const at=elapsed+l.flight+i*group.stagger+2;
      const p=Village.pigeonAt(group,i,at);
      assert(p.grounded&&p.altitude===0&&world.openLawn(p));
      assert.deepEqual(p,Village.pigeonAt(group,i,at+1));
    }
    const facing=new Set();
    for(let t=0;t<l.flight;t+=.1)facing.add(Village.pigeonAt(group,0,elapsed+t).side);
    assert.equal(facing.size,2,'a circling pigeon banks in both directions');
  }
  elapsed+=l.flight+l.rest;
}
for(let i=0;i<group.count;i++)assert(offscreen(Village.pigeonAt(group,i,group.duration+.001)));

const click=Village.startMigration(world,2,random(943),0);
assert(offscreen(Village.migrantAt(click,0,0)));
village.migrations.push(click);
for(const [e,pose] of [[group,Village.pigeonAt],[click,Village.migrantAt]]){
  const age=2,i=1,before=pose(e,i,age),neighbor=pose(e,0,age);
  assert(Village.moveFlyingBird(e,i,age,160,-82));
  assert.equal(pose(e,i,age).x,before.x+160);
  assert.equal(pose(e,i,age).y,before.y-82);
  assert.deepEqual(pose(e,0,age),neighbor);
  const later=age+1,moving=pose(e,i,later);
  assert(Village.moveFlyingBird(e,i,later,-73,29));
  const moved=pose(e,i,later);
  assert(Math.hypot(moved.x-moving.x+73,moved.y-moving.y-29)<1e-8);
  const copy={...e,moves:[]};
  assert.deepEqual(pose(e,i,later+e.moves[i].duration+.01),pose(copy,i,later+e.moves[i].duration+.01));
}
const restored=new Village();
restored.restore(JSON.parse(JSON.stringify(village.snapshot())));
assert.deepEqual(Village.pigeonAt(restored.pigeons,1,3.2),Village.pigeonAt(group,1,3.2));
const legacy=JSON.parse(JSON.stringify(group));legacy.count=8;delete legacy.stagger;delete legacy.moves;
delete legacy.roofs;delete legacy.roosts;
legacy.legs=[...legacy.legs.slice(0,2),legacy.legs.at(-1)];
legacy.legs[2].from=legacy.legs[1].to;
for(const leg of legacy.legs){delete leg.roof;delete leg.roofShift;}
legacy.duration=legacy.legs.reduce((sum,leg)=>sum+leg.flight+leg.rest,0)+7*.11;
const oldSave=new Village();oldSave.restore({...village.snapshot(),pigeons:legacy});
assert.deepEqual(oldSave.pigeons,legacy,'previous small flocks keep their original timing when loaded');
assert.deepEqual(Village.pigeonAt(oldSave.pigeons,7,3.2),Village.pigeonAt({...legacy,stagger:.11},7,3.2));
assert.deepEqual(Village.migrantAt(restored.migrations[0],1,3.2),Village.migrantAt(click,1,3.2));
world.time=group.legs[0].flight+2;
const resting=Array.from({length:group.count},(_,i)=>Village.pigeonAt(group,i,world.time));
world.openLawn=()=>false;
village.layout(world);
for(let i=0;i<group.count;i++){
  const takeoff=Village.pigeonAt(group,i,world.time);
  assert.equal(takeoff.x,resting[i].x);assert.equal(takeoff.y,resting[i].y);
}
assert(group.exit&&group.duration===group.exit.age+group.exit.flight);
for(const side of [-1,1]){
  const leaving=JSON.parse(JSON.stringify(group));leaving.side=side;
  leaving.exit.x=side>0?world.width+70:-70;
  for(let i=0;i<leaving.count;i++)assert(offscreen(Village.pigeonAt(leaving,i,leaving.duration+.001)),'every bird in a large flock leaves the screen on either side');
}
world.time=group.duration+.01;
village.update(world,.2,night);
assert.equal(village.pigeons,null);assert.equal(village.migrations.length,0);
const dusk=new Village(),twilight={altitude:-6,setting:true};
world.time=0;world.rng=()=>0;dusk.eventIn=0;dusk.pigeonIn=0;
assert(!Village.daylight(twilight)&&Village.canMigrate(twilight));
dusk.update(world,.2,twilight);
assert.equal(dusk.event?.type,'migration');assert.equal(dusk.pigeons,null);
dusk.migrations.push(Village.startMigration(world,1,world.rng,world.time));
const loadedDusk=new Village();loadedDusk.restore(JSON.parse(JSON.stringify(dusk.snapshot())));
world.time=1;loadedDusk.update(world,.2,twilight);
assert.equal(loadedDusk.event.type,'migration');assert.equal(loadedDusk.migrations.length,1);
loadedDusk.update(world,.2,{altitude:-6.001,setting:true});
assert.equal(loadedDusk.event,null);assert.equal(loadedDusk.migrations.length,0);
const clickedWorld={...world,openLawn:p=>p.x>24&&p.x<1176&&p.y>24&&p.y<796,village:new Village()};
const choices=random(412),types=new Set(),sides=new Set();
for(let i=0;i<40;i++){
  clickedWorld.village.pigeons=null;clickedWorld.village.migrations=[];
  const event=Village.triggerBirds(clickedWorld,0,choices);
  assert(event);types.add(event.type);
  if(event.type==='pigeons'){
    sides.add(event.side);
    assert.equal(Village.triggerBirds(clickedWorld,0,()=>0),null);
    assert.equal(clickedWorld.village.pigeons,event,'extra pigeon clicks preserve the existing flock');
    clickedWorld.village.pigeonIn=0;
    clickedWorld.village.update(clickedWorld,.01,day);
    assert.equal(clickedWorld.village.pigeons,event,'natural arrivals share the same single-flock limit');
  }else assert.equal(event.side,1,'migrating birds retain the click heading');
}
assert.deepEqual(types,new Set(['pigeons','migration']));
assert.equal(sides.size,2,'pigeons choose directions independently of migrating birds');
const roofWorld=new World(77);roofWorld.layout(1440,900,[],40);
const roofRng=random(943);let first=true;
const rooftop=Village.triggerBirds(roofWorld,0,()=>{if(first){first=false;return 0;}return roofRng();});
assert(rooftop?.roosts.length>0);
assert(rooftop.legs.filter(l=>l.roof).length>=4,'the flock repeatedly returns to rooftops');
const perchedAt=rooftop.legs[0].flight+2;
const poses=Array.from({length:rooftop.count},(_,i)=>Village.pigeonAt(rooftop,i,perchedAt));
assert(poses.some(p=>p.grounded&&p.altitude>10)&&poses.some(p=>!p.grounded),'some birds perch while others are still circling');
let clock=0;
for(const leg of rooftop.legs){
  if(leg.roof){
    for(let i=0;i<rooftop.roosts.length;i++){
      const p=Village.pigeonAt(rooftop,i,clock+leg.flight+i*rooftop.stagger+1);
      const spot=rooftop.roosts[(i+leg.roofShift)%rooftop.roosts.length];
      assert(p.grounded&&p.altitude===spot.z&&p.x===spot.x&&p.y===spot.y-spot.z);
    }
  }
  clock+=leg.flight+leg.rest;
  for(const i of [0,rooftop.count-1]){
    const before=Village.pigeonAt(rooftop,i,clock+i*rooftop.stagger-.00001);
    const after=Village.pigeonAt(rooftop,i,clock+i*rooftop.stagger+.00001);
    assert(Math.hypot(before.x-after.x,before.y-after.y)<.01,'takeoff stays continuous between lawn and roof routes');
  }
}
const saved=new Village();saved.restore(JSON.parse(JSON.stringify(roofWorld.village.snapshot())));
assert.deepEqual(saved.pigeons,rooftop,'long roof routes resume from snapshots');
assert(JSON.stringify(roofWorld.snapshot()).length<196608,'the full save fits the native host limit');
roofWorld.time=perchedAt;
const beforeMove=Array.from({length:rooftop.count},(_,i)=>Village.pigeonAt(rooftop,i,perchedAt));
assert(roofWorld.relocateBuildings([roofWorld.homes[0].id],false,60,40));
assert(rooftop.exit,'moving a roof sends its visitors back into flight');
for(let i=0;i<rooftop.count;i++){
  const p=Village.pigeonAt(rooftop,i,perchedAt);
  assert.equal(p.x,beforeMove[i].x);assert.equal(p.y,beforeMove[i].y);
}
console.log('PASS: pigeon circuits, safe stops and departure, offscreen migration, moving individual birds, snapshots, relocation and random click arrivals');
