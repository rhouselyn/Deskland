/* 草原人家：不依赖画布的布局、寻路和居民模拟，浏览器与 Node 测试共用。 */
(function (root) {
  'use strict';
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function random(seed) { let s=seed|0; return () => { s=(s+0x6d2b79f5)|0; let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296; }; }
  const inside = (p,r,pad=0) => p.x>=r.x-pad&&p.x<=r.x+r.w+pad&&p.y>=r.y-pad&&p.y<=r.y+r.h+pad;
  function worldDate(now,settings={},zone=Intl.DateTimeFormat().resolvedOptions().timeZone) {
    if(settings.realTime!==0)return now;
    const minute=Number.isFinite(settings.fixedTime)?Math.round(clamp(settings.fixedTime,0,1439)):720;
    const options={timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'};
    let formatter;try{formatter=new Intl.DateTimeFormat('en-GB',options);}catch{formatter=new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'});}
    const parts=date=>Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const today=parts(now),target=Date.UTC(today.year,today.month-1,today.day,Math.floor(minute/60),minute%60);
    let guess=target;const seen=[];
    for(let i=0;i<4;i++){
      const p=parts(new Date(guess)),wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
      const next=guess+target-wall;if(next===guess)return new Date(guess);
      // 夏令时跳过的钟点顺延到有效时刻，避免在两个 UTC 偏移之间反复跳动。
      if(seen.includes(next))return new Date(Math.max(next,guess));
      seen.push(guess);guess=next;
    }
    return new Date(guess);
  }
  class World {
    constructor(seed=12345) { this.seed=seed;this.rng=random(seed);this.homes=[];this.agents=[];this.torches=[];this.games=[];this.time=0;this.revision=0;this.food=new Map();this.dayKey='';this.signature=''; }
    layout(width,height,icons,cloudSize=72) {
      const sig=JSON.stringify([width,height,icons.map(i=>[i.x,i.y,i.w,i.h]),cloudSize]);
      if(sig===this.signature)return false;
      this.signature=sig;this.width=width;this.height=Math.max(100,height-52);this.cell=20;
      this.obstacles=icons.map(r=>({x:r.x-14,y:r.y-14,w:r.w+28,h:r.h+28}));
      const houseW=150,houseH=145,homes=[];
      // 先保留仍然安全的家，图标变化时不重排整座村庄。
      const fits=p=>p.x>24&&p.y>35&&p.x+houseW<width-24&&p.y+houseH<this.height-24&&!this.obstacles.some(r=>inside({x:p.x+houseW/2,y:p.y+houseH/2},r,Math.max(houseW,houseH)/2+8))&&!homes.some(h=>distance(p,h)<205);
      for(const h of this.homes)if(fits(h))homes.push(h);
      const candidates=[];
      for(let y=55;y<this.height-houseH-24;y+=35)for(let x=35;x<width-houseW-24;x+=35)candidates.push({x,y,score:Math.abs(x-width*.62)+Math.abs(y-this.height*.48)*.6});
      candidates.sort((a,b)=>a.score-b.score);
      for(const p of candidates)if(homes.length<3&&fits(p))homes.push({x:p.x,y:p.y,id:homes.length});
      this.homes=homes.map((h,i)=>({...h,id:i,w:houseW,h:houseH,door:{x:h.x+76,y:h.y+82},table:{x:h.x+105,y:h.y+120}}));
      this.blocks=[...this.obstacles,...this.homes.map(h=>({x:h.x+8,y:h.y+5,w:130,h:67})),...this.homes.map(h=>({x:h.table.x-22,y:h.table.y-10,w:44,h:20}))];
      this.cols=Math.ceil(width/this.cell);this.rows=Math.ceil(this.height/this.cell);
      this.free=new Uint8Array(this.cols*this.rows);
      for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){const p={x:(x+.5)*this.cell,y:(y+.5)*this.cell};this.free[y*this.cols+x]=p.x>18&&p.y>18&&p.x<width-18&&p.y<this.height-18&&!this.blocks.some(r=>inside(p,r,10));}
      const old=this.torches;this.torches=this.homes.flatMap((h,i)=>[{x:h.x+12,y:h.y+105},{x:h.x+143,y:h.y+136}].filter(p=>this.walkable(p)).map((p,j)=>({...p,id:i*2+j,lit:!!old.find(t=>t.id===i*2+j&&t.lit),reserved:null})));
      const limits={adult:this.homes.length*2,child:Math.min(4,this.homes.length*2),cow:Math.min(8,this.homes.length*3)};
      this.agents=this.agents.filter(a=>Number(a.id.split('-')[1])<limits[a.kind]);
      if(this.homes.length)this.populate();
      for(const a of this.agents){if(!this.walkable(a)){const p=this.spot();if(p){a.x=p.x;a.y=p.y;}else a.hidden=true;}a.path=[];a.target=null;a.until=0;}
      this.games=[];this.revision++;return true;
    }
    populate() {
      const add=(kind,home,i)=>{if(this.agents.some(a=>a.id===kind+'-'+i))return;const p=this.spot();if(!p)return;this.agents.push({id:kind+'-'+i,kind,home,x:p.x,y:p.y,dir:0,state:'idle',age:this.rng()*10,hunger:this.rng()*.6,fatigue:this.rng()*.5,social:this.rng(),speed:(kind==='cow'?9:kind==='child'?23:16)*(.8+this.rng()*.4),next:this.rng()*3,until:0,path:[],target:null,hidden:false,style:i%6,friend:i%3,game:null,task:null});};
      for(let i=0;i<this.homes.length*2;i++)add('adult',Math.floor(i/2),i);
      for(let i=0;i<Math.min(4,this.homes.length*2);i++)add('child',i%this.homes.length,i);
      for(let i=0;i<Math.min(8,this.homes.length*3);i++)add('cow',i%this.homes.length,i);
    }
    index(p){return Math.floor(p.y/this.cell)*this.cols+Math.floor(p.x/this.cell);}
    walkable(p){return p.x>=18&&p.y>=18&&p.x<this.width-18&&p.y<this.height-18&&!!this.free?.[this.index(p)];}
    spot(near=null,radius=Infinity,score=null) {
      let best=null,value=-Infinity;
      for(let i=0;i<100;i++){const p={x:22+this.rng()*Math.max(1,this.width-44),y:22+this.rng()*Math.max(1,this.height-44)};if(!this.walkable(p)||near&&distance(p,near)>radius)continue;const v=score?score(p):this.rng();if(v>value){value=v;best=p;}}
      return best;
    }
    path(from,to) {
      if(!this.walkable(from)||!this.walkable(to))return [];
      const start=this.index(from),end=this.index(to);if(start===end)return [{x:to.x,y:to.y}];
      const q=[start],prev=new Int32Array(this.free.length).fill(-1);prev[start]=start;
      for(let k=0;k<q.length;k++){const n=q[k];if(n===end)break;const x=n%this.cols,y=Math.floor(n/this.cols);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*this.cols+xx;if(xx<0||yy<0||xx>=this.cols||yy>=this.rows||!this.free[j]||prev[j]!==-1)continue;prev[j]=n;q.push(j);}}
      if(prev[end]===-1)return [];
      const out=[{x:to.x,y:to.y}];for(let j=end;j!==start;j=prev[j])out.push({x:(j%this.cols+.5)*this.cell,y:(Math.floor(j/this.cols)+.5)*this.cell});return out.reverse();
    }
    go(a,p,state,duration=30) {
      if(!p)return false;const path=this.path(a,p);if(!path.length)return false;
      a.target={x:p.x,y:p.y};a.path=path;a.state=state;a.until=this.time+duration;a.age=0;a.hidden=false;return true;
    }
    release(a){for(const t of this.torches)if(t.reserved===a.id)t.reserved=null;a.task=null;a.game=null;}
    update(dt,solar,shade=()=>false,decide=true) {
      if(!this.free)return;dt=clamp(dt,0,.25);this.time+=dt;this.solar=solar;
      const night=solar.altitude < -6,evening=solar.setting&&solar.altitude<8;
      if(decide&&this.dayKey!==solar.day){this.dayKey=solar.day;for(const t of this.torches){t.lit=night;t.reserved=null;}for(const a of this.agents)a.until=0;}
      for(const a of this.agents){
        a.age+=dt;a.hunger=clamp(a.hunger+dt/1800,0,1);a.fatigue=clamp(a.fatigue+dt/2400,0,1);
        if(a.path.length){const p=a.path[0],d=distance(a,p),step=a.speed*dt;a.dir=Math.atan2(p.y-a.y,p.x-a.x);if(d<=step){a.x=p.x;a.y=p.y;a.path.shift();}else{
          const next={x:a.x+Math.cos(a.dir)*step,y:a.y+Math.sin(a.dir)*step};
          const blocked=this.agents.some(b=>b!==a&&!b.hidden&&distance(next,b)<(a.kind==='cow'?14:9)&&b.id<a.id);
          if(!blocked&&this.walkable(next)){a.x=next.x;a.y=next.y;}else if(!this.walkable(next)){a.path=[];a.until=0;}else{
            const side={x:a.x-Math.sin(a.dir)*step,y:a.y+Math.cos(a.dir)*step};
            if(this.walkable(side)&&!this.agents.some(b=>b!==a&&!b.hidden&&distance(side,b)<(a.kind==='cow'?14:9))){a.x=side.x;a.y=side.y;}
          }
        }}else if(a.target){a.target=null;this.arrive(a,solar);}
        if(a.state==='graze'){a.hunger=clamp(a.hunger-dt/90,0,1);const k=Math.floor(a.x/60)+','+Math.floor(a.y/60);this.food.set(k,{time:this.time,value:clamp((this.food.get(k)?.value||0)+dt/80,0,1)});}
        if(['sleep','rest','shade','sit','home'].includes(a.state))a.fatigue=clamp(a.fatigue-dt/150,0,1);
        if(a.state==='eat')a.hunger=clamp(a.hunger-dt/40,0,1);
        if(decide&&this.time>=a.next){a.next=this.time+2+this.rng()*3;if((night&&!a.task&&a.state!=='sleep'&&a.state!=='home'&&a.state!=='return')||(evening&&a.kind==='child'&&a.state!=='home'&&a.state!=='return')){a.until=0;a.path=[];}if(this.time>=a.until&&!a.path.length)this.choose(a,solar,shade);}
      }
      if(decide){this.updateGames(solar);if(!night&&!evening&&this.time>(this.nextGame||0)){this.nextGame=this.time+30+this.rng()*45;this.startGame();}}
    }
    arrive(a,solar){
      if(a.task?.type==='torch'){const t=this.torches.find(t=>t.id===a.task.id);if(t&&a.task.stage==='fetch'){a.task.stage='place';if(this.go(a,t,'torch',80))return;}if(t){t.lit=solar.setting||solar.altitude<-6;t.reserved=null;}a.state='tend';a.until=this.time+3;a.task=null;}
      else if(a.state==='return'){a.state=a.kind==='cow'?'sleep':'home';a.hidden=a.kind!=='cow';a.until=this.time+240;}
      else if(a.state==='meal'){a.state='eat';a.until=this.time+70;}
      else if(a.state==='seekShade'){a.state='shade';a.until=this.time+90;}
      else if(a.state==='gather'){a.state='rest';a.until=this.time+100;}
      else if(a.state==='forage'){a.state='graze';a.until=this.time+30+this.rng()*50;}
      else if(a.state==='join'){a.state='play';a.until=this.time+120;}
      else {a.until=this.time+15+this.rng()*35;}
    }
    choose(a,s,shade){
      this.release(a);const h=this.homes[a.home%this.homes.length];if(!h)return;
      const night=s.altitude<-6,evening=s.setting&&s.altitude<8;
      if(night||evening&&a.kind==='child'){
        if(a.kind==='cow'){const p=this.spot(h.door,180);if(!this.go(a,p,'return',240)){a.state='sleep';a.until=this.time+120;}}
        else if(!this.go(a,h.door,'return',240)){a.state='home';a.hidden=true;a.until=this.time+120;}
        return;
      }
      a.hidden=false;
      if(a.kind==='cow'){
        if(evening&&this.go(a,this.spot(h.door,170),'gather',120))return;
        if(a.fatigue>.45&&s.altitude>28){const p=this.spot(a,280,p=>shade(p)?10-this.rng():0);if(p&&shade(p)&&this.go(a,p,'seekShade',150))return;}
        if(a.fatigue>.7){a.state='rest';a.until=this.time+60;return;}
        const friend=this.agents.find(b=>b.kind==='cow'&&b.id!==a.id&&b.friend===a.friend&&b.path.length&&distance(a,b)<230);
        if(friend&&this.rng()<a.social){const p=this.spot(friend.target,65);if(this.go(a,p,'follow',40))return;}
        const nearby=this.agents.find(b=>b.kind==='adult'&&!b.hidden&&distance(a,b)<65);
        if(nearby&&this.rng()<.25){a.state='watch';a.dir=Math.atan2(nearby.y-a.y,nearby.x-a.x);a.until=this.time+8;return;}
        const p=this.spot(a,250,p=>{const v=this.food.get(Math.floor(p.x/60)+','+Math.floor(p.y/60));return 1-(v?Math.max(0,v.value-(this.time-v.time)/1200):0)+this.rng()*.3;});
        if(!this.go(a,p,'forage',80)){a.state='graze';a.until=this.time+25;}return;
      }
      if(a.kind==='adult'){
        const t=this.torches.find(t=>t.lit!==(evening||night)&&!t.reserved);
        if(t){t.reserved=a.id;a.task={type:'torch',id:t.id,stage:'fetch'};if(this.go(a,h.door,'fetch',60))return;t.reserved=null;a.task=null;}
      }
      const phase=s.progress;
      if(a.hunger>.6||phase>.05&&phase<.16||phase>.47&&phase<.56||evening){const seat={x:h.table.x+(a.kind==='child'?-30:30),y:h.table.y+(Number(a.id.split('-')[1])%2?17:-17)};const occupied=this.agents.some(b=>b!==a&&(b.target&&distance(b.target,seat)<12||b.state==='eat'&&distance(b,seat)<12));if(!occupied&&this.go(a,seat,'meal',90))return;}
      if(a.fatigue>.75){if(a.kind==='child'){this.go(a,h.door,'return',150);return;}if(this.go(a,this.spot(h.door,65),'sit',90))return;}
      if(a.kind==='child'){if(this.rng()<.25&&this.go(a,this.spot(a,150),'kite',50))return;this.go(a,this.spot(h.door,220),'wander',35);return;}
      const activities=['water','sweep','repair','chat','herd','sit'];const activity=activities[Math.floor(this.rng()*activities.length)];
      let p=this.spot(h.door,130);
      if(activity==='herd'){const cow=this.agents.filter(b=>b.kind==='cow')[Math.floor(this.rng()*8)];if(cow)p=this.spot(cow,65);}
      if(activity==='chat'){const friend=this.agents.find(b=>b!==a&&b.kind==='adult'&&!b.hidden&&!b.path.length);if(friend)p=this.spot(friend,40);}
      if(!this.go(a,p,activity,50)){a.state='sit';a.until=this.time+20;}
    }
    startGame(){
      const children=this.agents.filter(a=>a.kind==='child'&&!a.hidden&&!a.game&&!['eat','meal','return'].includes(a.state));if(children.length<2)return;
      const p=this.spot(null,Infinity,p=>[[-45,-45],[45,-45],[45,45],[-45,45]].some(([x,y])=>!this.walkable({x:p.x+x,y:p.y+y}))?-Infinity:this.homes.length?-Math.min(...this.homes.map(h=>distance(p,h.door))):0);if(!p)return;
      if([[-45,-45],[45,-45],[45,45],[-45,45]].some(([x,y])=>!this.walkable({x:p.x+x,y:p.y+y})))return;
      const types=['tag','ball','train','circle'],type=types[Math.floor(this.rng()*types.length)],g={id:'game-'+this.time,type,x:p.x,y:p.y,start:this.time,end:this.time+65+this.rng()*55,members:[]};
      for(const a of children.slice(0,4)){const i=g.members.length,angle=i*Math.PI/2;const target={x:p.x+Math.cos(angle)*32,y:p.y+Math.sin(angle)*32};if(this.go(a,target,'join',120)){a.game=g.id;g.members.push(a.id);}}
      if(g.members.length>=2)this.games.push(g);else for(const a of children)if(a.game===g.id){a.game=null;a.until=0;}
    }
    updateGames(s){
      this.games=this.games.filter(g=>{
        const members=this.agents.filter(a=>g.members.includes(a.id)&&a.game===g.id);
        if(this.time>g.end||s.altitude<3&&s.setting||members.length<2){for(const a of members){a.game=null;a.path=[];a.until=this.time;}return false;}
        if(members.some(a=>a.state==='join'))return true;
        members.forEach((a,i)=>{a.state='play';a.until=g.end;if(a.path.length)return;const angle=(this.time-g.start)*.18+i*Math.PI*2/members.length;let p={x:g.x+Math.cos(angle)*38,y:g.y+Math.sin(angle)*32};if(g.type==='circle')return;if(g.type==='ball')p={x:g.x+Math.cos(i*Math.PI*2/members.length)*35,y:g.y+Math.sin(i*Math.PI*2/members.length)*35};if(g.type==='tag'){const chaser=Math.floor((this.time-g.start)/15)%members.length;if(i===chaser){const b=members[(i+1)%members.length];p={x:b.x,y:b.y};}else p={x:g.x+Math.cos(angle)*46,y:g.y+Math.sin(angle)*42};}if(g.type==='train'&&i>1){const leader=members[i-1];p={x:leader.x-Math.cos(leader.dir)*15,y:leader.y-Math.sin(leader.dir)*15};}const path=this.path(a,p);if(path.length){a.target=p;a.path=path;}});return true;
      });
    }
    snapshot(){return {version:1,seed:this.seed,width:this.width,height:this.height+52,time:this.time,dayKey:this.dayKey,homes:this.homes,agents:this.agents,torches:this.torches,games:this.games};}
    restore(data){
      if(!data||data.version!==1||!Number.isFinite(data.seed)||!Array.isArray(data.agents)||data.agents.length>32||!Array.isArray(data.homes)||data.homes.length>3||!Array.isArray(data.torches)||data.torches.length>8)return false;
      if(data.agents.some(a=>!['cow','adult','child'].includes(a.kind)||!Number.isFinite(a.x)||!Number.isFinite(a.y)||typeof a.id!=='string'||!Number.isFinite(a.home)))return false;
      if(data.homes.some(h=>!Number.isFinite(h.x)||!Number.isFinite(h.y)))return false;
      if(data.torches.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)))return false;
      this.seed=data.seed;this.rng=random(data.seed);this.time=Number.isFinite(data.time)?data.time:0;this.dayKey=String(data.dayKey||'');this.homes=data.homes;this.agents=data.agents.map(a=>({...a,path:Array.isArray(a.path)?a.path.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)):[],next:0,until:0,game:null,task:null,hunger:clamp(+a.hunger||0,0,1),fatigue:clamp(+a.fatigue||0,0,1)}));this.torches=data.torches;this.games=[];this.signature='';return true;
    }
  }
  const api={World,random,clamp,distance,inside,worldDate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PastoralCore=api;
})(globalThis);
