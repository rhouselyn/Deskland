const assert=require('node:assert/strict');
const {World,random}=require('../prototype/pastoral-world.js');
const Village=require('../prototype/pastoral-village.js');
const selection=require('../prototype/pastoral-selection.js');

const w=new World(317);
w.layout(1600,1000,[{x:12,y:20,w:80,h:75}]);
const extras={daylight:true,night:false,clouds:[{seed:29,grow:1,x:330,y:180,circles:[[5,-3,16]]}],
  fireflies:[],fireflyMoves:[]};
const list=()=>selection.objects(w,extras);
const find=id=>list().find(o=>o.id===id);
function close(p,target){
  assert(p&&Math.hypot(p.x-target.x,p.y-target.y)<1e-6,
    'Expected '+JSON.stringify(p&&{x:p.x,y:p.y})+' at '+JSON.stringify(target));
}
function move(id,x,y){assert.equal(selection.move(w,extras,[id],{x,y}),1);}

for(const kind of ['house','fold','field','actor','sheep','collie','sparrow','torch','cloud'])
  assert(list().some(o=>o.kind===kind),kind);
const ids=list().map(o=>o.id);
assert.equal(new Set(ids).size,ids.length);
const splitCloud={seed:991,grow:1,x:450,y:250,circles:[[-100,0,15],[100,0,15]]};
const cloudList=selection.objects(w,{clouds:[splitCloud]});
assert(!selection.pick(cloudList,390,240,510,260).includes('cloud:991'),'empty space between visible cloud lobes is not selectable');
assert(selection.pick(cloudList,330,230,570,270).includes('cloud:991'),'a marquee covering visible cloud lobes still selects the cloud');
assert(!selection.objects(w,{clouds:[{...splitCloud,grow:.01}]}).some(o=>o.kind==='cloud'),'a barely forming cloud has no invisible selection box');
assert(!selection.objects(w,{night:true,fireflies:[{x:450,y:250,alpha:0}]}).some(o=>o.kind==='firefly'),'an unlit firefly has no invisible selection point');
assert(selection.objects(w,{night:true,fireflies:[{x:450,y:250,alpha:.8}]}).some(o=>o.kind==='firefly'),'a visibly glowing firefly remains selectable');
const sheep=find('sheep:3');
assert(selection.pick(list(),sheep.x+3,sheep.y+3,sheep.x-3,sheep.y-3).includes(sheep.id));
assert(!selection.pick(list(),sheep.x+3,sheep.y+3,sheep.x-3,sheep.y-3).includes('fold'));
assert.equal(selection.move(w,extras,['expired'],{x:400,y:400}),0);
const house=find('house:0'),hut=house.parts[2];
assert(selection.pick(list(),hut.x-10,hut.y-10,hut.x+10,hut.y+10).includes(house.id));
const torch=find('torch:0'),a=find('actor:adult-0'),b=find('actor:child-0');
assert.equal(selection.move(w,extras,[a.id,b.id,b.id],
  {x:(a.x+b.x)/2+3,y:(a.y+b.y)/2+3}),2);
assert.equal(w.agents.find(actor=>actor.id===a.key).state,'lookAround');
assert.equal(w.agents.find(actor=>actor.id===b.key).state,'lookAround');

// A house relayout replaces torch objects. The selected torch still travels exactly once.
const base={x:torch.base.x,y:torch.base.y};
assert.equal(selection.move(w,extras,[house.id,torch.id],
  {x:(house.x+torch.x)/2-90,y:(house.y+torch.y)/2+35}),2);
const dx=find(house.id).x-house.x,dy=find(house.id).y-house.y;
close(find(torch.id).base,{x:base.x+dx,y:base.y+dy});
move(torch.id,220,240);close(find(torch.id),{x:220,y:240});
assert(w.torches.find(t=>t.id===0).placed);
move('field:'+w.flock.patch,290,280);close(find('field:'+w.flock.patch),{x:290,y:280});
move('sheep:0',220,200);close(find('sheep:0'),{x:220,y:200});
move('collie',235,215);close(find('collie'),{x:235,y:215});
move('sparrow:0',260,225);close(find('sparrow:0'),{x:260,y:225});
assert.equal(w.village.birds[0].mode,'fly');
move('cloud:29',270,262);close(find('cloud:29'),{x:270,y:262});

w.village.event={type:'butterflies',x:230,y:255,start:w.time,duration:9,count:3,seed:12};
const butterfly=list().find(o=>o.kind==='butterfly');
move(butterfly.id,310,240);close(find(butterfly.id),{x:310,y:240});
w.village.event=Village.startMigration(w,0,random(19),w.time-5);
const migrant=list().find(o=>o.kind==='migrant');
move(migrant.id,380,225);close(find(migrant.id),{x:380,y:225});
const migration=Village.startMigration(w,1,random(20),w.time-6);migration.uid=16;w.village.migrations=[migration];
const clicked=find('migrant:c16:0');assert(clicked);
move(clicked.id,423,235);close(find(clicked.id),{x:423,y:235});
w.village.pigeons={start:w.time-1,duration:22,count:2,seed:1,side:1,
  legs:[{from:{x:400,y:430,z:10},to:{x:430,y:450,z:0},flight:4,rest:3,radius:18,turns:1}]};
const pigeon=list().find(o=>o.kind==='pigeon');
move(pigeon.id,350,230);close(find(pigeon.id),{x:350,y:230});

extras.night=true;extras.fireflies=[{x:300,y:220,baseX:295,baseY:224,phase:.7}];
move('firefly:0',330,244);close(extras.fireflyMoves[0],{x:325,y:248});
console.log('PASS marquee hit regions, stable IDs, destination offsets, grouped structures, residents, livestock and ambient wildlife');
