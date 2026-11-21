const assert=require('node:assert/strict');
const {World,inside,worldDate}=require('../prototype/pastoral-world.js');
const SunCalc=require('../prototype/vendor/suncalc.js');
const icons=Array.from({length:9},(_,i)=>({x:10,y:10+i*85,w:75,h:75}));
const w=new World(73519);
w.layout(1600,1000,icons);
assert.equal(w.homes.length,3);
assert.equal(w.agents.filter(a=>a.kind==='cow').length,8);
assert.equal(w.agents.filter(a=>a.kind==='adult').length,6);
assert.equal(w.agents.filter(a=>a.kind==='child').length,4);
for(const h of w.homes)assert(!icons.some(r=>inside({x:h.x+75,y:h.y+72},r,76)));
const day={altitude:45,setting:false,progress:.3,day:'2026-11-21'};
for(let i=0;i<1000;i++)w.update(.2,day,()=>true);
assert(w.agents.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&w.walkable(a)));
assert(new Set(w.agents.map(a=>a.state)).size>2,'independent behavior');
assert(w.agents.some(a=>a.kind==='cow'&&a.state==='graze'),'grazing');
const before=w.homes.map(h=>[h.x,h.y]);
w.layout(1600,1000,[...icons,{x:1550,y:0,w:40,h:40}]);
assert.deepEqual(w.homes.map(h=>[h.x,h.y]),before,'unaffected houses stay put');
const snapshot=JSON.parse(JSON.stringify(w.snapshot())),restored=new World();
assert(restored.restore(snapshot));restored.layout(1600,1000,icons);
assert.deepEqual(restored.agents.map(a=>a.id),w.agents.map(a=>a.id));
assert(!restored.restore({version:1,seed:0,homes:[],agents:[{kind:'cow',x:NaN,y:0}],torches:[]}));
for(const a of w.agents){a.path=[];a.until=0;}
for(let i=0;i<1200;i++)w.update(.2,{...day,altitude:5,setting:true,progress:.95});
assert(w.torches.some(t=>t.lit),'adults light torches');
for(let i=0;i<2400;i++)w.update(.2,{...day,altitude:-15,setting:true,progress:1});
assert(w.agents.filter(a=>a.kind==='child').every(a=>a.state==='home'||a.state==='return'),'children go home');
const crowded=new World();crowded.layout(200,180,[{x:0,y:0,w:200,h:180}]);assert.equal(crowded.homes.length,0);assert.equal(crowded.agents.length,0);
const summer=SunCalc.getTimes(new Date('2026-06-21T04:00:00Z'),31.23,121.47),winter=SunCalc.getTimes(new Date('2026-12-21T04:00:00Z'),31.23,121.47);
assert(summer.sunset-summer.sunrise>winter.sunset-winter.sunrise,'seasonal day lengths');
assert(Number.isNaN(+SunCalc.getTimes(new Date('2026-06-21T12:00:00Z'),89,0).sunset),'polar day handled by altitude');
console.log('PASS: population, safe layout, independent behavior, persistent identities, evening tasks, night, crowded screen and solar seasons');

const games=new World(73519);games.layout(1600,1000,[]);const seen=new Set();
for(let i=0;i<200;i++){games.games=[];for(const a of games.agents){a.game=null;a.hidden=false;a.state='idle';a.path=[];}games.startGame();games.games.forEach(g=>seen.add(g.type));}
assert.equal(seen.size,4,'all four games can reserve a safe field and gather children');
console.log('PASS: tag, ball, train and circle games');

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
