const assert=require('node:assert/strict');
const {World}=require('../prototype/pastoral-world.js');
const Flock=require('../prototype/pastoral-flock.js');

function runRelocation(minute){
  let world=new World(73519);
  world.layout(1280,800,[]);
  let flock=world.flock;
  const inside=s=>s.x>=Flock.fence.left&&s.x<=Flock.fence.right&&Math.abs(s.y)<=Flock.fence.half;
  if(minute===720){
    const field=flock.local({x:300,y:160});
    flock.mode='graze';flock.fields[flock.patch]=field;flock.herd={...field};
    for(const [i,s] of flock.sheep.entries())Object.assign(s,{x:field.x+(i%10-5)*10,y:field.y+(Math.floor(i/10)-3)*10});
    Object.assign(flock.dog,{x:field.x,y:field.y+80});
    flock.nextSwitch=flock.nextWander=10000;
  }
  const ids=[2,7,15],destinations=[{x:1020,y:155},{x:1040,y:160},{x:1060,y:635}];
  for(const [j,id] of ids.entries()){
    assert(flock.relocateMember(id,destinations[j]));
    const p=flock.screen(flock.sheep[id]);
    assert(Math.hypot(p.x-destinations[j].x,p.y-destinations[j].y)<2);
  }
  assert.equal(flock.displaced.size,ids.length);
  let t=0;
  const step=()=>{
    t+=.15;flock.update(.15,{minute},t,true);world.separateBodies();
  };
  step();
  assert.equal(flock.dog.state,'collect');
  assert.equal(flock.sheep[15].state,'rest','the distant sheep waits until found');
  while(!flock.escorting&&t<150)step();
  assert(flock.escorting);
  const saved=JSON.parse(JSON.stringify(world.snapshot()));
  world=new World();assert(world.restore(saved));world.layout(1280,800,[]);flock=world.flock;
  assert.deepEqual([...flock.displaced],saved.flock.displaced);assert(flock.escorting);
  while(flock.displaced.size&&t<450)step();
  assert.equal(flock.displaced.size,0,'collie recovers both displaced groups');
  for(let i=0;i<300;i++)step();
  if(minute===720){
    assert.equal(flock.dog.state,'watch');
    assert(ids.every(i=>Math.hypot(flock.sheep[i].x-flock.herd.x,flock.sheep[i].y-flock.herd.y)<180));
  }else{
    assert(flock.sheep.every(inside));assert(flock.gateClosed);assert.equal(flock.dog.state,'rest');
  }
  const p={x:940,y:120};
  assert(flock.relocateMember(-1,p));
  assert.deepEqual([flock.screen(flock.dog).x,flock.screen(flock.dog).y],[p.x,p.y]);
  assert.equal(flock.dog.lift,0);
  assert(!flock.relocateMember(80,p));assert(!flock.relocateMember(0,{x:NaN,y:0}));
}
runRelocation(720);
runRelocation(60);
console.log('PASS: displaced sheep, day and night rescue, separated groups, resume, collie relocation');

{
  const width=1500,height=950,world=new World(73519);
  world.layout(width,height,[]);
  const coords=p=>[p.x,p.y],positions=world.homes.map(coords);
  const family=world.agents.map(a=>[a.id,a.home]);
  const first=world.home(0),resident=world.agents.find(a=>a.home===0&&a.kind==='adult');
  resident.hidden=true;resident.state='home';
  world.layout(width,height,[{x:first.x+49,y:first.y+30,w:52,h:65}]);
  assert.notDeepEqual(coords(world.home(0)),positions[0]);
  assert.deepEqual(coords(resident),coords(world.home(0).door));
  for(const id of [1,2])assert.deepEqual(coords(world.home(id)),positions[id]);
  assert.deepEqual(world.agents.map(a=>[a.id,a.home]),family);
  const h=world.home(1),x=h.x-40,y=h.y-40,r=h.x+h.w+40,b=h.y+h.h+40;
  const mask=[{x:0,y:0,w:x,h:height},{x:r,y:0,w:width-r,h:height},
    {x,y:0,w:r-x,h:y},{x,y:b,w:r-x,h:height-b}];
  world.layout(width,height,mask);
  assert.deepEqual(world.homes.map(h=>h.id),[1]);
  assert.deepEqual(coords(world.home(1)),positions[1]);
  assert.equal(world.home(0),undefined);
  assert.deepEqual(world.torches.map(t=>t.id),[2,3]);
  assert.deepEqual(world.village.birds.map(b=>b.index),[2,3]);
  assert(world.agents.every(a=>a.home===1));
  for(const [id] of family.filter(([,home])=>home===1))assert(world.agents.some(a=>a.id===id));
  const snapshot=JSON.parse(JSON.stringify(world.snapshot())),restored=new World();
  assert(restored.restore(snapshot));restored.layout(width,height,mask);
  assert.deepEqual(restored.agents.map(a=>[a.id,a.home]),world.agents.map(a=>[a.id,a.home]));
  for(const altitude of [35,-15])for(let i=0;i<25;i++)restored.update(.25,{altitude,setting:altitude<0,minute:altitude<0?60:720,day:'day',progress:.4});
  restored.layout(width,height,[]);
  assert.deepEqual(restored.homes.map(h=>h.id),[0,1,2]);
  for(const a of world.agents)assert(restored.agents.some(b=>b.id===a.id&&b.home===a.home));
  const legacy=JSON.parse(JSON.stringify(restored.snapshot()));for(const h of legacy.homes)delete h.id;
  const old=new World();assert(old.restore(legacy));old.layout(width,height,[]);
  assert.deepEqual(old.homes.map(h=>h.id),[0,1,2]);
  assert.deepEqual(old.agents.map(a=>[a.id,a.home]),restored.agents.map(a=>[a.id,a.home]));
}
console.log('PASS: household identity, displaced sleeping residents, sparse house IDs, birds, torches and legacy saves');
