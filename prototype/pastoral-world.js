/* 草原人家：不依赖画布的布局、寻路和居民模拟，浏览器与 Node 测试共用。 */
(function (root) {
  'use strict';
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function random(seed) { let s=seed|0; return () => { s=(s+0x6d2b79f5)|0; let t=Math.imul(s^s>>>15,1|s);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296; }; }
  // 用世界时间排期，桌面、预览和分享在同一时刻看到同一片受光草地。
  const auroraColors=[
    [[.10,.88,.47],[.80,.26,.96]],[[.08,.74,.91],[.95,.30,.66]],
    [[.38,.88,.35],[.52,.33,.99]],[[.10,.86,.74],[.90,.29,.85]]
  ];
  function auroraKey(slot,seed){
    const rnd=random(seed^Math.imul(slot+1,0x51ed270b));
    const [primary,fringe]=auroraColors[Math.floor(rnd()*auroraColors.length)];
    return {primary,fringe,angle:rnd()*Math.PI*2,halfWidth:.42+rnd()*.23,
      rate:.045+rnd()*.075,phase:rnd()*Math.PI*2};
  }
  let lightKeys;
  function auroraLight(time,seed,altitude){
    const dusk=clamp((-altitude-4)/7,0,1);
    if(!dusk)return null;
    // 两段光色在同一条世界时间线上交接；跨午夜、读档和预览都能接上。
    const period=80,slot=Math.floor(time/period),age=time-slot*period,t=age/period;
    if(!lightKeys||lightKeys.slot!==slot||lightKeys.seed!==seed)
      lightKeys={seed,slot,a:auroraKey(slot,seed),b:auroraKey(slot+1,seed)};
    const {a,b}=lightKeys,f=t*t*(3-2*t),mix=(x,y)=>x+(y-x)*f;
    const pa=a.phase+age*a.rate,pb=b.phase+(age-period)*b.rate;
    const bearing=a.angle+f*Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle));
    const swell=p=>.5+.5*Math.sin(p+.55*Math.sin(.7*p));
    return {primary:a.primary.map((v,i)=>mix(v,b.primary[i])),fringe:a.fringe.map((v,i)=>mix(v,b.fringe[i])),
      strength:dusk*dusk*(3-2*dusk)*(.34+.64*mix(swell(pa),swell(pb))),
      dx:Math.cos(bearing),dy:Math.sin(bearing),halfWidth:mix(a.halfWidth,b.halfWidth),
      center:.65*Math.sin(time*2*Math.PI/76+.40*mix(Math.sin(pa*.43),Math.sin(pb*.43))),
      bend:1.6*mix(Math.sin(pa*.61),Math.sin(pb*.61))+1.1*Math.sin(time*.047),
      foldCenter:.56*Math.sin(time*2*Math.PI/97+1.35+.35*mix(Math.cos(pa*.52),Math.cos(pb*.52))),
      foldBend:2.1*Math.sin(time*.074)+mix(Math.sin(pa*.84),Math.sin(pb*.84)),
      foldGain:.78+.22*mix(swell(pa*.73+1.8),swell(pb*.73+1.8))};
  }
  const meteorPeriod=42;
  const meteorColors=[
    [.96,.98,1],    // 白
    [.30,1,.80],    // 青绿
    [.38,.69,1],    // 冰蓝
    [.88,.49,1],    // 粉紫
    [1,.64,.30]     // 琥珀
  ];
  function meteorBatch(slot,seed,bearing,startAt){
    // 八轮里有五次单颗、两次双颗和一次流星雨，两次流星雨之间留几轮间隔。
    const cycle=Math.floor(slot/8),schedule=random(seed^Math.imul(cycle+1,0x2545f491));
    const shower=2+Math.floor(schedule()*4),order=(slot-cycle*8-shower+8)%8;
    const secondDouble=4+Math.floor(schedule()*2);
    const rnd=random(seed^Math.imul(slot+1,0x51ed270b));
    const count=order===0?5+Math.floor(rnd()*3):order===2||order===secondDouble?2:1;
    const colorRandom=random(seed^Math.imul(slot+1,0x3e99aa17));
    const vertical=bearing?bearing.vertical:rnd()<.23,reverse=bearing?bearing.side<0:rnd()<.5;
    const from=reverse?1.08:-.08,to=1-from,slope=bearing?bearing.slope:(rnd()<.5?-1:1)*(.15+rnd()*.31),paths=[];
    let offset=0;
    for(let i=0;i<count;i++){
      if(i)offset+=count===2?2.1+rnd()*2.5:2.6+rnd()*1.1;
      const tilt=bearing?slope:slope+(rnd()-.5)*.14,margin=.035+Math.abs(tilt)/2;
      const center=margin+rnd()*(1-margin*2),a=center-tilt/2,b=center+tilt/2;
      paths.push({start:offset,flight:6.3+rnd()*2.1,linger:3.5+rnd()*1.3,width:.027+rnd()*.013,
        gain:.76+rnd()*.24,color:Math.floor(colorRandom()*meteorColors.length),
        x0:vertical?a:from,y0:vertical?from:a,x1:vertical?b:to,y1:vertical?to:b});
    }
    const room=meteorPeriod-Math.max(...paths.map(p=>p.start+p.flight+p.linger));
    const start=startAt??(slot*meteorPeriod+1+rnd()*(room-2));
    for(const p of paths)p.start+=start;
    return paths;
  }
  const inside = (p,r,pad=0) => p.x>=r.x-pad&&p.x<=r.x+r.w+pad&&p.y>=r.y-pad&&p.y<=r.y+r.h+pad;
  // 米制斜俯视：地面转 15°，镜头俯角 45°。人物、建筑和寻路共用投影。
  const farm={meter:11.3,w:128,h:128,length:7.3,depth:4.45,wall:2.55,ridge:4.05,adult:1.73,child:1.12,cow:2.45,tableX:6.45,tableY:-3.55};
  function farmPoint(h,e,n,z=0){
    return {x:h.x+22+farm.meter*(.965926*e+.258819*n),y:h.y+65+farm.meter*(.183013*e-.683013*n-.707107*z)};
  }
  function blockedByFarm(h,p){
    const x=(p.x-h.x-22)/farm.meter,y=(p.y-h.y-65)/(farm.meter*.707107);
    const e=.965926*x+.258819*y,n=.258819*x-.965926*y;
    return (e>-.25&&e<farm.length+.25&&n>-.25&&n<farm.depth+.25)||
      (Math.abs(e-farm.tableX)<1.05&&Math.abs(n-farm.tableY)<.48)||
      (Math.abs(e-1)<.82&&n>-4.35&&n<-2.75);
  }
  function houseFits(w,p,neighbors){
    const mid={x:p.x+farm.w/2,y:p.y+farm.h/2};
    return p.x>24&&p.y>35&&p.x+farm.w<w.width-24&&p.y+farm.h<w.height-24&&
      !w.obstacles.some(r=>inside(mid,r,Math.max(farm.w,farm.h)/2+8))&&
      !neighbors.some(h=>distance(p,h)<205);
  }
  const lampsDue=s=>s.altitude < -6||(s.setting&&s.altitude<0);
  function mealWindow(s){
    if(s.setting&&s.altitude<8)return s.day+'/supper';
    if(s.progress>.05&&s.progress<.16)return s.day+'/breakfast';
    if(s.progress>.47&&s.progress<.56)return s.day+'/lunch';
    return null;
  }
  const reclining=a=>a.state==='skywatch'||a.state==='lawnRest';
  const lawnTrip=a=>a.state==='toWatch'||a.state==='toRest';
  function reclineAmount(a,time){
    return reclining(a)?clamp(Math.min(a.age,a.until-time)/1.6,0,1):0;
  }
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
  const Flock=typeof module!=='undefined'&&module.exports?require('./pastoral-flock.js'):root.PastoralFlock;
  const Village=typeof module!=='undefined'&&module.exports?require('./pastoral-village.js'):root.PastoralVillage;
  const CropCircles=typeof module!=='undefined'&&module.exports?require('./pastoral-crop-circle.js'):root.PastoralCropCircles;
  class World {
    constructor(seed=12345) { this.seed=seed;this.rng=random(seed);this.homes=[];this.agents=[];this.torches=[];this.games=[];this.flock=new Flock();this.village=new Village();this.cropCircles=new CropCircles();this.time=0;this.revision=0;this.food=new Map();this.dayKey='';this.signature='';this.nextExcursionAt=null; }
    home(id){return this.homes.find(h=>h.id===id);}
    layout(width,height,icons,cloudSize=72,relocation=null) {
      const sig=JSON.stringify([width,height,icons.map(i=>[i.x,i.y,i.w,i.h]),cloudSize]);
      if(sig===this.signature)return false;
      // Remember the arrangement, without writing desktop icon coordinates into the save.
      let keepBuildings=!!relocation;
      if(relocation||Number.isInteger(this.layoutPlacement)){
        let stamp=2166136261;
        for(let i=0;i<sig.length;i++)stamp=Math.imul(stamp^sig.charCodeAt(i),16777619);
        if(relocation)this.layoutPlacement=stamp>>>0;
        keepBuildings=this.layoutPlacement===(stamp>>>0);
      }
      this.signature=sig;this.width=width;this.height=Math.max(100,height-52);this.cell=10;this.cloudSize=cloudSize;
      this.icons=icons.map(({x,y,w,h})=>({x,y,w,h}));
      this.obstacles=icons.map(r=>({x:r.x-14,y:r.y-14,w:r.w+28,h:r.h+28}));
      const houseW=farm.w,houseH=farm.h,homes=[];
      // 先保留仍然安全的家，图标变化时不重排整座村庄。
      const fits=p=>houseFits(this,p,homes);
      for(const h of this.homes)if(fits(h))homes.push(h);
      if(!keepBuildings&&homes.length<3){
        const candidates=[];
        for(let y=55;y<this.height-houseH-24;y+=35)for(let x=35;x<width-houseW-24;x+=35)candidates.push({x,y});
        const anchors=[[.53,.44],[.72,.29],[.64,.67]];
        // 先给受图标影响的原住户找最近的新家，再补空缺的户号。
        const missing=[...this.homes.map(h=>h.id),0,1,2];
        for(const id of new Set(missing)){
          if(homes.some(h=>h.id===id))continue;
          const [fx,fy]=anchors[id];
          const target=this.home(id)||{x:width*fx-houseW/2,y:this.height*fy-houseH/2};
          let best=null,cost=Infinity;
          for(const p of candidates){const d=distance(p,target);if(d<cost&&fits(p)){best=p;cost=d;}}
          if(best)homes.push({...best,id});
        }
      }
      this.homes=homes.sort((a,b)=>a.id-b.id).map(h=>{
        const roof=(e,n,z)=>({...farmPoint(h,e,n,z),z:z*farm.meter*Math.SQRT1_2});
        return {...h,w:houseW,h:houseH,door:farmPoint(h,3.6,-1.25),table:farmPoint(h,farm.tableX,farm.tableY),
          kennel:farmPoint(h,1,-5.15),nest:roof(h.id===1?6.6:1.05,.38,3.02),ridge:roof(3.4,2.22,4.12)};
      });
      this.cols=Math.ceil(width/this.cell);this.rows=Math.ceil(this.height/this.cell);
      this.free=new Uint8Array(this.cols*this.rows);
      for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++){const p={x:(x+.5)*this.cell,y:(y+.5)*this.cell};this.free[y*this.cols+x]=p.x>18&&p.y>18&&p.x<width-18&&p.y<this.height-18&&!this.homes.some(h=>blockedByFarm(h,p));}
      if(!keepBuildings||this.flock.site)this.flock.layout(this,relocation?.site);
      this.yardRoutes=this.free.map((free,i)=>free&&this.iconFree(this.cellCenter(i))?1:0);
      this.roads=[];
      for(let i=1;i<this.homes.length;i++){
        const road=this.countryLane(this.homes[i-1].door,this.homes[i].door);
        if(road.length)this.roads.push(road);
      }
      const old=this.torches;this.torches=this.homes.flatMap(h=>[farmPoint(h,.6,-2.3),farmPoint(h,8.1,-4.6)].map((p,j)=>{
        const id=h.id*2+j,previous=old.find(t=>t.id===id);
        if(previous?.placed&&this.walkable(previous)&&this.iconFree(previous))return {...previous,reserved:null};
        return {...p,id,lit:!!previous?.lit,reserved:null};
      }).filter(p=>this.walkable(p)));
      this.agents=this.agents.filter(a=>this.home(a.home));
      if(this.homes.length)this.populate();
      for(const a of this.agents){
        if(a.game?.startsWith('yard-')&&(!this.walkable(a)||a.path.some(p=>!this.walkable(p)||!this.iconFree(p))))a.game=null;
      }
      this.village.layout(this);
      for(const a of this.agents){
        if(a.game===CropCircles.game){if(!this.walkable(a)){const p=this.nearestWalkable(a);if(p)Object.assign(a,p);}continue;}
        if(a.hidden){Object.assign(a,this.home(a.home).door);continue;}
        if(a.game?.startsWith('yard-'))continue;
        if(a.state==='lookAround'&&a.until>this.time&&this.walkable(a))continue;
        if(relocation){
          if(!this.walkable(a)){const safe=this.nearestWalkable(a);if(safe)Object.assign(a,safe);}
          if(a.task||!a.game&&relocation.homes.has(a.home)){
            this.release(a);a.path=[];a.target=null;a.until=a.next=this.time;
          }else if(a.target){
            a.path=this.path(a,a.target,a.kind==='dog'?this.yardRoutes:this.free);
            if(!a.path.length){a.target=null;a.until=a.next=this.time;}
          }
          continue;
        }
        if(a.kind==='dog'){
          const h=this.home(a.home);
          if(!this.walkable(a)||!this.iconFree(a))Object.assign(a,h.kennel);
          a.path=[];a.target=null;a.until=0;a.next=this.time;
          continue;
        }
        if(reclining(a)&&this.openLawn(a)&&a.until>this.time)continue;
        if(!this.walkable(a)){const p=this.spot();if(p){a.x=p.x;a.y=p.y;}else a.hidden=true;}
        if(lawnTrip(a)&&a.target&&this.openLawn(a.target)&&this.go(a,a.target,a.state))continue;
        if(a.state==='explore'&&a.target&&this.go(a,a.target,'explore',240))continue;
        if(a.state==='exploreRest'&&this.openLawn(a)&&a.until>this.time)continue;
        if(reclining(a)||lawnTrip(a))a.state='idle';
        a.path=[];a.target=null;a.until=0;
      }
      this.cropCircles.layout(this);
      this.separateBodies();if(!relocation)this.games=[];this.revision++;return true;
    }
    relocateBuildings(houseIds,foldSelected,dx,dy){
      if(!this.free||!Number.isFinite(dx)||!Number.isFinite(dy)||!Array.isArray(houseIds))return false;
      const ids=new Set(houseIds),moving=this.homes.filter(h=>ids.has(h.id)),fixed=this.homes.filter(h=>!ids.has(h.id));
      const site=this.flock.site,moveFold=!!(site&&foldSelected),extent=site&&Flock.siteExtent(site);
      if(!moving.length&&!moveFold)return false;
      // Keep the entire selection together, including the gate's approach and clearance around houses.
      let left=-this.width,right=this.width,top=-this.height,bottom=this.height;
      for(const h of moving){
        left=Math.max(left,25-h.x);right=Math.min(right,this.width-25-farm.w-h.x);
        top=Math.max(top,36-h.y);bottom=Math.min(bottom,this.height-25-farm.h-h.y);
      }
      if(moveFold){
        left=Math.max(left,19-site.x-extent.left);right=Math.min(right,this.width-19-site.x-extent.right);
        top=Math.max(top,23-site.y-extent.top);bottom=Math.min(bottom,this.height-19-site.y-extent.bottom);
      }
      const clear=(x,y)=>{
        const shifted=moving.map(h=>({x:h.x+x,y:h.y+y,w:h.w,h:h.h}));
        if(shifted.some(h=>!houseFits(this,h,fixed)))return false;
        if(!site)return true;
        const cx=site.x+(moveFold?x:0),cy=site.y+(moveFold?y:0);
        const overlaps=r=>cx+extent.right>r.x-8&&cx+extent.left<r.x+r.w+8&&
          cy+extent.bottom>r.y-8&&cy+extent.top<r.y+r.h+8;
        return !shifted.some(overlaps)&&(!moveFold||!fixed.some(overlaps)&&!this.obstacles.some(overlaps));
      };
      let x=clamp(dx,left,right),y=clamp(dy,top,bottom);
      if(!clear(x,y)){
        const candidates=(lo,hi,wanted)=>{
          const axis=new Set([lo,hi,0,wanted]);
          for(let v=Math.ceil(lo/this.cell)*this.cell;v<=hi;v+=this.cell)axis.add(v);
          return axis;
        };
        const xs=candidates(left,right,x),ys=candidates(top,bottom,y);
        let best=dx*dx+dy*dy;x=y=0;
        for(const cy of ys)for(const cx of xs){
          const d=(cx-dx)**2+(cy-dy)**2;
          if(d<best&&clear(cx,cy)){x=cx;y=cy;best=d;}
        }
      }
      if(!x&&!y)return false;
      const shifted=p=>({...p,x:p.x+x,y:p.y+y});
      this.homes=this.homes.map(h=>ids.has(h.id)?shifted(h):h);
      for(const b of this.village.birds)if(ids.has(b.index>>1)){
        b.homeX+=x;b.homeY+=y;
        if(b.at==='grass')continue;
        const destination=shifted(b.to);
        if(b.mode==='fly'){
          b.from=Village.birdAt(b,this.time);b.start=this.time;
          b.duration=Math.max(.7,distance(b.from,destination)/40);b.arc=Math.min(20,distance(b.from,destination)*.24);
        }else b.from=shifted(b.from);
        b.to=destination;
      }
      this.signature='';
      return this.layout(this.width,this.height+52,this.icons,this.cloudSize,{homes:ids,site:moveFold?shifted(site):site});
    }
    nearestWalkable(p){
      if(!p||!this.free||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
      if(this.walkable(p)&&this.iconFree(p))return {x:p.x,y:p.y};
      let best=null,gap=Infinity;
      for(let i=0;i<this.free.length;i++)if(this.free[i]){
        const cell=this.cellCenter(i),d=(p.x-cell.x)**2+(p.y-cell.y)**2;
        if(d<gap&&this.walkable(cell)&&this.iconFree(cell)){best=cell;gap=d;}
      }
      return best;
    }
    relocateResident(a,target){
      if(!a||a.hidden||!this.agents.includes(a))return false;
      const p=this.nearestWalkable(target);if(!p)return false;
      const game=a.game;
      if(game?.startsWith('yard-')){
        this.village.plays=this.village.plays.filter(g=>game!=='yard-'+g.home);
        for(const peer of this.agents)if(peer.game===game)this.village.free(this,peer);
      }
      this.release(a);
      Object.assign(a,p,{path:[],target:null,age:0,detourAt:0});
      if(a.kind==='adult'||a.kind==='child'){
        a.state='lookAround';a.lookFrom=a.dir;a.until=this.time+3.2;
      }else{
        a.state=a.kind==='cow'?'watch':'sniff';a.until=this.time+1.4;
      }
      a.next=a.until;return true;
    }
    populate() {
      const add=(kind,home,slot,i)=>{
        if(this.agents.filter(a=>a.kind===kind&&a.home===home).length>slot)return;
        const p=this.spot();if(!p)return;
        // 旧档可能按当时可容纳的户数分配编号，沿用现存居民的身份。
        while(this.agents.some(a=>a.id===kind+'-'+i))i+=12;
        this.agents.push({id:kind+'-'+i,kind,home,x:p.x,y:p.y,dir:0,state:'idle',age:this.rng()*10,hunger:this.rng()*.6,fatigue:this.rng()*.5,social:this.rng(),speed:(kind==='cow'?9:kind==='child'?23:16)*(.8+this.rng()*.4),next:this.rng()*3,until:0,path:[],target:null,hidden:false,style:i%6,friend:i%3,game:null,task:null});
      };
      for(const h of this.homes)for(let slot=0;slot<2;slot++)add('adult',h.id,slot,h.id*2+slot);
      for(let slot=0;slot<2;slot++)for(const h of this.homes){
        if(this.agents.filter(a=>a.kind==='child').length<4)add('child',h.id,slot,h.id+3*slot);
      }
      for(let slot=0;slot<4;slot++)for(const h of this.homes)add('cow',h.id,slot,h.id+3*slot);
      for(const h of this.homes)if(!this.agents.some(a=>a.kind==='dog'&&a.home===h.id)){
        this.agents.push({...h.kennel,id:'dog-'+h.id,kind:'dog',home:h.id,style:h.id,dir:.4,state:'sniff',age:0,
          speed:32,hunger:0,fatigue:0,next:0,until:0,path:[],target:null,hidden:false,game:null,playAt:this.time+5+h.id*11});
      }
    }
    index(p){return Math.floor(p.y/this.cell)*this.cols+Math.floor(p.x/this.cell);}
    cellCenter(i){return {x:(i%this.cols+.5)*this.cell,y:(Math.floor(i/this.cols)+.5)*this.cell};}
    fireflySpots(){
      const rnd=random(this.seed^0x651b),grass=[],flies=[];
      for(let i=0;i<this.free.length;i++)if(this.free[i]&&this.iconFree(this.cellCenter(i)))grass.push(i);
      for(let i=0;i<18&&grass.length;i++){
        let p=this.cellCenter(grass[Math.floor(rnd()*grass.length)]);
        if(i<6&&this.homes.length){
          const door=this.homes[i%this.homes.length].door;
          const near={x:door.x+(rnd()-.5)*90,y:door.y+12+rnd()*42};
          if(this.walkable(near)&&this.iconFree(near))p=near;
        }
        flies.push({...p,phase:rnd()*Math.PI*2});
      }
      return flies;
    }
    walkable(p){return p.x>=18&&p.y>=18&&p.x<this.width-18&&p.y<this.height-18&&!!this.free?.[this.index(p)];}
    iconFree(p){return !this.icons.some(r=>inside(p,r));}
    spot(near=null,radius=Infinity,score=null) {
      let best=null,value=-Infinity;
      for(let i=0;i<100;i++){const p={x:22+this.rng()*Math.max(1,this.width-44),y:22+this.rng()*Math.max(1,this.height-44)};if(!this.walkable(p)||!this.iconFree(p)||near&&distance(p,near)>radius)continue;const v=score?score(p):this.rng();if(v>value){value=v;best=p;}}
      return best;
    }
    path(from,to,grid=this.free,allowIconTarget=false) {
      if(!this.walkable(from)||!this.walkable(to)||!allowIconTarget&&!this.iconFree(to))return [];
      const start=this.index(from),end=this.index(to);
      if(!grid[start]||!grid[end])return [];
      if(start===end)return [{x:to.x,y:to.y}];
      const prev=this.routes(start,grid,end);
      if(prev[end]===-1)return [];
      const out=[{x:to.x,y:to.y}];for(let j=end;j!==start;j=prev[j])out.push(this.cellCenter(j));return out.reverse();
    }
    countryLane(from,to){
      const path=this.path(from,to);
      if(!path.length)return [];
      const lane=[from];
      for(let i=0;i<path.length;){
        const a=lane[lane.length-1];let end=path.length-1;
        for(;end>i;end--){
          const b=path[end],steps=Math.ceil(distance(a,b)/5);let clear=true;
          for(let j=1;j<steps&&clear;j++)clear=this.walkable({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});
          if(clear)break;
        }
        lane.push(path[end]);i=end+1;
      }
      // 共用实际的圆弯路线，选休息地点时也能认出弯内的路面。
      const road=[from];
      for(let i=1;i<lane.length-1;i++){
        const a=road[road.length-1],b=lane[i],c={x:(b.x+lane[i+1].x)/2,y:(b.y+lane[i+1].y)/2};
        const steps=Math.max(1,Math.ceil((distance(a,b)+distance(b,c))/9));
        for(let j=1;j<=steps;j++){
          const t=j/steps,u=1-t;
          road.push({x:u*u*a.x+2*u*t*b.x+t*t*c.x,y:u*u*a.y+2*u*t*b.y+t*t*c.y});
        }
      }
      road.push(to);return road;
    }
    routes(start,free,end=-1){
      const prev=new Int32Array(free.length).fill(-1);
      if(!free[start])return prev;
      const queue=new Int32Array(free.length);queue[0]=start;prev[start]=start;
      let tail=1;
      for(let head=0;head<tail;head++){
        const n=queue[head];if(n===end)break;
        for(const j of [n+1,n-1,n+this.cols,n-this.cols]){
          // 每行两侧原本就留有不可通行的屏幕边缘。
          if(free[j]&&prev[j]===-1){prev[j]=n;queue[tail++]=j;}
        }
      }
      return prev;
    }
    go(a,p,state,duration=30,grid=this.free) {
      if(!p)return false;const path=this.path(a,p,grid,state==='circleCarry'||state==='circlePlant');if(!path.length)return false;
      a.target={x:p.x,y:p.y};a.path=path;a.state=state;a.until=this.time+duration;a.age=0;a.hidden=false;return true;
    }
    detourInYard(a){
      if(!a.target||this.time<(a.detourAt||0))return;
      a.detourAt=this.time+2;
      const grid=this.yardRoutes.slice();
      for(const other of this.agents){
        if(other===a||other.hidden||a.game&&a.game===other.game||distance(a,other)>58)continue;
        const col=Math.floor(other.x/this.cell),row=Math.floor(other.y/this.cell);
        const radius=other.kind==='cow'?14:10;
        for(let y=row-1;y<=row+1;y++)for(let x=col-1;x<=col+1;x++){
          const i=y*this.cols+x;
          if(grid[i]&&distance(this.cellCenter(i),other)<radius)grid[i]=0;
        }
      }
      const start=this.index(a),end=this.index(a.target);
      grid[start]=this.yardRoutes[start];grid[end]=this.yardRoutes[end];
      const path=this.path(a,a.target,grid);
      if(path.length)a.path=path;
    }
    openLawn(p){
      if(!this.walkable(p)||!this.iconFree(p)||this.homes.some(h=>inside(p,h,7)))return false;
      for(const road of this.roads)for(let i=1;i<road.length;i++){
        const a=road[i-1],b=road[i],dx=b.x-a.x,dy=b.y-a.y;
        const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
        if(Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)<16)return false;
      }
      return true;
    }
    visitLawn(a,night){
      if(this.agents.filter(b=>reclining(b)||lawnTrip(b)).length>=(night?2:3))return false;
      const origin=night?this.home(a.home).door:a;
      if(night&&a.hidden){
        if(!this.walkable(origin))return false;
        a.x=origin.x;a.y=origin.y;
      }
      for(let i=0;i<16;i++){
        const angle=this.rng()*Math.PI*2,r=35+this.rng()*100;
        const p={x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r};
        if(!this.openLawn(p)||this.agents.some(b=>b!==a&&!b.hidden&&distance(b.target||b,p)<16))continue;
        if(this.go(a,p,night?'toWatch':'toRest'))return true;
      }
      return false;
    }
    release(a){for(const t of this.torches)if(t.reserved===a.id)t.reserved=null;a.task=null;a.game=null;}
    explore(a){
      if(a.kind!=='adult'||a.fatigue>.3||a.hunger>.45)return false;
      this.nextExcursionAt??=this.time+(12+this.rng()*12)*60;
      if(this.time<this.nextExcursionAt||this.agents.some(b=>['explore','exploreRest'].includes(b.state)))return false;
      const minimum=Math.min(300,Math.hypot(this.width,this.height)*.35);
      for(let i=0;i<8;i++){
        const p=this.spot(null,Infinity,p=>distance(a,p)>=minimum&&this.openLawn(p)?this.rng():-Infinity);
        if(p&&this.go(a,p,'explore',240)){
          this.nextExcursionAt=this.time+(20+this.rng()*20)*60;
          a.fatigue=clamp(a.fatigue+.12,0,1);
          return true;
        }
      }
      this.nextExcursionAt=this.time+120;return false;
    }
    separateBodies(){
      const flock=this.flock,bodies=[];
      const add=(actor,p,member,radius)=>bodies.push({actor,x:p.x,y:p.y,member,radius});
      for(const a of this.agents)if(!a.hidden){
        const radius=a.kind==='cow'?7:a.kind==='adult'?3.6:2.8;
        add(a,a,false,reclining(a)?radius*1.8:radius);
      }
      if(flock.site){
        for(const s of flock.sheep)add(s,flock.screen(s),true,s.kind==='lamb'?3.4:5);
        add(flock.dog,flock.screen(flock.dog),true,4.5);
      }
      const shift=(b,dx,dy)=>{
        const p={x:b.x+dx,y:b.y+dy};
        if(b.member){
          const local=flock.local(p);
          if(!flock.canDisplace(b.actor,local))return false;
          b.actor.x=local.x;b.actor.y=local.y;
        }else{
          if(!this.walkable(p)||reclining(b.actor)&&!this.openLawn(p)||
            (b.actor.kind==='dog'||b.actor.game?.startsWith('yard-'))&&!this.iconFree(p))return false;
          b.actor.x=p.x;b.actor.y=p.y;
        }
        b.x=p.x;b.y=p.y;return true;
      };
      // 按横坐标只检查附近的身体。接触修正不计作行走速度，也不会推着动物穿墙。
      for(let pass=0;pass<6;pass++){
        bodies.sort((a,b)=>a.x-b.x);
        let touched=false;
        for(let i=0;i<bodies.length;i++){
          const a=bodies[i];
          for(let j=i+1;j<bodies.length;j++){
            const b=bodies[j],dx=b.x-a.x,dy=b.y-a.y,min=a.radius+b.radius;
            if(dx>a.radius+7)break;
            if(Math.abs(dy)>=min)continue;
            if(a.member&&b.member&&flock.dog.lift>1&&(a.actor===flock.dog||b.actor===flock.dog))continue;
            const d2=dx*dx+dy*dy;if(d2>=(min-.04)**2)continue;
            const d=Math.sqrt(d2),angle=(i*37+j)*2.4;
            const nx=d>.001?dx/d:Math.cos(angle),ny=d>.001?dy/d:Math.sin(angle);
            const push=(min-d)*.5,px=nx*push,py=ny*push;
            const left=shift(a,-px,-py),right=shift(b,px,py);
            if(!left&&right)shift(b,px,py);
            if(!right&&left)shift(a,-px,-py);
            touched=touched||left||right;
          }
        }
        if(!touched)break;
      }
    }
    update(dt,solar,shade=()=>false,decide=true,fireflies) {
      if(!this.free)return;dt=clamp(dt,0,.25);this.time+=dt;this.solar=solar;
      const night=solar.altitude < -6,evening=solar.setting&&solar.altitude<8;
      if(decide&&this.dayKey!==solar.day){this.dayKey=solar.day;for(const t of this.torches){t.lit=lampsDue(solar);t.reserved=null;}for(const a of this.agents)if(!reclining(a)&&a.state!=='lookAround')a.until=0;}
      for(const a of this.agents){
        const yardGame=a.game?.startsWith('yard-'),yardActor=yardGame||a.kind==='dog',cropActor=a.game===CropCircles.game;
        const canStep=p=>this.walkable(p)&&(!yardActor||this.iconFree(p));
        a.age+=dt;a.hunger=clamp(a.hunger+dt/1800,0,1);a.fatigue=clamp(a.fatigue+dt/2400,0,1);
        if(decide&&a.state==='explore'&&this.time>=a.until){
          a.path=[];a.target=null;a.state='exploreRest';a.until=this.time+15;
        }
        if(a.state==='explore'&&a.path.length)a.fatigue=clamp(a.fatigue+dt/900,0,1);
        if(a.state==='exploreRest')a.fatigue=clamp(a.fatigue-dt/300,0,1);
        if(a.state==='lookAround'){
          if(this.time<a.until){a.dir=a.lookFrom+Math.sin(a.age*2.6)*1.25;continue;}
          a.state='idle';a.next=this.time;delete a.lookFrom;
        }
        if(a.path.length){const p=a.path[0],d=distance(a,p),step=a.speed*(a.state==='petRun'?1.5:1)*dt;a.dir=Math.atan2(p.y-a.y,p.x-a.x);if(d<=step){a.x=p.x;a.y=p.y;a.path.shift();}else{
          const next={x:a.x+Math.cos(a.dir)*step,y:a.y+Math.sin(a.dir)*step};
          const blocked=this.agents.some(b=>b!==a&&(!(yardGame||cropActor)||b.game!==a.game)&&!b.hidden&&distance(next,b)<(a.kind==='cow'?14:9)&&b.id<a.id);
          if(!blocked&&canStep(next)){a.x=next.x;a.y=next.y;}else if(!canStep(next)){a.path=[];a.until=0;}else{
            if(decide&&(yardActor||cropActor))this.detourInYard(a);
            const side={x:a.x-Math.sin(a.dir)*step,y:a.y+Math.cos(a.dir)*step};
            if(canStep(side)&&!this.agents.some(b=>b!==a&&!b.hidden&&distance(side,b)<(a.kind==='cow'?14:9))){a.x=side.x;a.y=side.y;}
          }
        }}else if(a.target&&!cropActor){
          const missed=lawnTrip(a)&&distance(a,a.target)>3;a.target=null;
          if(!yardGame){if(missed){a.state='idle';a.until=0;}else this.arrive(a,solar);}
        }
        if(a.state==='graze'){a.hunger=clamp(a.hunger-dt/90,0,1);const k=Math.floor(a.x/60)+','+Math.floor(a.y/60);this.food.set(k,{time:this.time,value:clamp((this.food.get(k)?.value||0)+dt/80,0,1)});}
        if(reclining(a)||['sleep','rest','shade','sit','home'].includes(a.state))a.fatigue=clamp(a.fatigue-dt/150,0,1);
        if(a.state==='eat')a.hunger=clamp(a.hunger-dt/40,0,1);
        if(yardGame||cropActor)continue;
        if(a.kind==='dog'){
          if(!decide)continue;
          const kennel=this.home(a.home).kennel;
          const goingHome=!Village.daylight(solar)&&a.state!=='toKennel'&&(a.state!=='curl'||distance(a,kennel)>4);
          const waking=Village.daylight(solar)&&a.state==='curl'&&!a.greeted&&distance(a,kennel)<4;
          if((goingHome||waking||this.time>=a.until&&!a.path.length)&&this.time>=a.next){
            a.next=this.time+1;this.village.chooseDog(this,a,solar);
          }
          continue;
        }
        if(decide&&this.time>=a.next){
          a.next=this.time+2+this.rng()*3;
          const indoors=night||evening&&a.kind==='child';
          if(reclining(a)){
            const getUp=a.state==='skywatch' ? !night : indoors;
            if(getUp)a.until=Math.min(a.until,this.time+1.6);
          }else if((indoors&&!a.task&&!['sleep','home','return','toWatch'].includes(a.state))||(!night&&a.state==='toWatch')){
            a.until=0;a.path=[];a.target=null;
          }
          if(this.time>=a.until&&!a.path.length)this.choose(a,solar,shade);
        }
      }
      this.flock.update(dt,solar,this.time,decide);
      this.separateBodies();
      if(decide){this.village.update(this,dt,solar);if(dt>0)this.cropCircles.update(this,dt,fireflies);this.updateGames(solar);if(!night&&!evening&&this.time>(this.nextGame||0)){this.nextGame=this.time+30+this.rng()*45;this.startGame();}}
    }
    arrive(a,solar){
      if(a.kind==='dog'){
        if(a.state==='toKennel')a.state=distance(a,this.home(a.home).kennel)<4?'curl':'sniff';
        else a.state=a.state==='greet'?'wag':a.state==='butterfly'?'tilt':'sniff';
        a.age=0;a.until=this.time+(a.state==='curl'?14:3+this.rng()*5);return;
      }
      if(a.task?.type==='torch'){const t=this.torches.find(t=>t.id===a.task.id);if(t&&a.task.stage==='fetch'){a.task.stage='place';if(this.go(a,t,'torch',80))return;}if(t){t.lit=solar.setting||solar.altitude<-6;t.reserved=null;}a.state='tend';a.until=this.time+3;a.task=null;}
      else if(a.state==='return'){a.state=a.kind==='cow'?'sleep':'home';a.hidden=a.kind!=='cow';a.until=this.time+(a.hidden?40+this.rng()*100:240);}
      else if(a.state==='explore'){a.state='exploreRest';a.age=0;a.until=this.time+35+this.rng()*30;}
      else if(lawnTrip(a)){
        const watch=a.state==='toWatch';
        if(!this.openLawn(a)||watch!==(solar.altitude < -6)){a.state='idle';a.until=0;return;}
        a.state=watch?'skywatch':'lawnRest';a.age=0;a.until=this.time+32+this.rng()*48;
      }
      else if(a.state==='meal'){a.state='eat';a.until=this.time+70;a.lastMeal=mealWindow(solar);}
      else if(a.state==='seekShade'){a.state='shade';a.until=this.time+90;}
      else if(a.state==='gather'){a.state='rest';a.until=this.time+100;}
      else if(a.state==='forage'){a.state='graze';a.until=this.time+30+this.rng()*50;}
      else if(a.state==='join'){a.state='play';a.until=this.time+120;}
      else {a.until=this.time+15+this.rng()*35;}
    }
    mealDue(a,s){
      const meal=mealWindow(s);
      return a.hunger>.6||!!meal&&a.lastMeal!==meal;
    }
    choose(a,s,shade){
      this.release(a);const h=this.home(a.home);if(!h)return;
      const night=s.altitude<-6,evening=s.setting&&s.altitude<8;
      if(night||evening&&a.kind==='child'){
        if(a.hidden&&a.state==='home'){
          if(night&&this.rng()<.25+.42*auroraLight(this.time,this.seed,s.altitude).strength&&this.visitLawn(a,true))return;
          a.until=this.time+42+this.rng()*95;return;
        }
        if(a.kind==='cow'){const p=this.spot(h.door,180);if(!this.go(a,p,'return',240)){a.state='sleep';a.until=this.time+120;}}
        else if(!this.go(a,h.door,'return',240)){a.state='home';a.hidden=true;a.until=this.time+120;}
        return;
      }
      a.hidden=false;
      if(a.state==='exploreRest'){
        if(!this.go(a,h.door,'return',240)){a.until=this.time+10;}
        return;
      }
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
      if(this.mealDue(a,s)){const seat=farmPoint(h,farm.tableX+(a.kind==='child'?-.62:.62),farm.tableY+(Number(a.id.split('-')[1])%2?1.25:-1.25));const occupied=this.agents.some(b=>b!==a&&(b.target&&distance(b.target,seat)<8||b.state==='eat'&&distance(b,seat)<8));if(!occupied&&this.go(a,seat,'meal',90))return;}
      if(!night&&this.explore(a))return;
      if(s.altitude>3&&!evening&&this.rng()<.19+.22*a.fatigue&&this.visitLawn(a,false))return;
      if(a.fatigue>.75){if(a.kind==='child'){this.go(a,h.door,'return',150);return;}if(this.go(a,this.spot(h.door,65),'sit',90))return;}
      if(a.kind==='child'){if(this.rng()<.25&&this.go(a,this.spot(a,150),'kite',50))return;this.go(a,this.spot(h.door,220),'wander',35);return;}
      const activities=['water','sweep','repair','chat','herd','sit'];const activity=activities[Math.floor(this.rng()*activities.length)];
      let p=this.spot(h.door,130);
      if(activity==='herd'){const cows=this.agents.filter(b=>b.kind==='cow'),cow=cows[Math.floor(this.rng()*cows.length)];if(cow)p=this.spot(cow,65);}
      if(activity==='chat'){const friend=this.agents.find(b=>b!==a&&b.kind==='adult'&&!b.hidden&&!b.path.length);if(friend)p=this.spot(friend,40);}
      if(!this.go(a,p,activity,50)){a.state='sit';a.until=this.time+20;}
    }
    startGame(){
      const children=this.agents.filter(a=>a.kind==='child'&&!a.hidden&&!a.game&&!reclining(a)&&!lawnTrip(a)&&!['eat','meal','return','lookAround'].includes(a.state));if(children.length<2)return;
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
    snapshot(){return {version:1,seed:this.seed,width:this.width,height:this.height+52,time:this.time,dayKey:this.dayKey,layoutPlacement:this.layoutPlacement,nextExcursionAt:this.nextExcursionAt,homes:this.homes,agents:this.agents,torches:this.torches,games:this.games,flock:this.flock.snapshot(),village:this.village.snapshot(),cropCircles:this.cropCircles.snapshot()};}
    restore(data){
      if(!data||data.version!==1||!Number.isFinite(data.seed)||!Array.isArray(data.agents)||data.agents.length>32||!Array.isArray(data.homes)||data.homes.length>3||!Array.isArray(data.torches)||data.torches.length>8)return false;
      if(data.agents.some(a=>!a||!['cow','adult','child','dog'].includes(a.kind)||!Number.isFinite(a.x)||!Number.isFinite(a.y)||typeof a.id!=='string'||!Number.isFinite(a.home)))return false;
      if(data.homes.some(h=>!h||!Number.isFinite(h.x)||!Number.isFinite(h.y)))return false;
      const homes=data.homes.map((h,i)=>({...h,id:h.id??i})),ids=new Set(homes.map(h=>h.id));
      if(ids.size!==homes.length||homes.some(h=>!Number.isInteger(h.id)||h.id<0||h.id>=3))return false;
      if(data.agents.some(a=>!ids.has(a.home)||a.kind==='dog'&&a.id!=='dog-'+a.home))return false;
      if(data.torches.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)))return false;
      this.layoutPlacement=Number.isInteger(data.layoutPlacement)?data.layoutPlacement>>>0:undefined;
      this.village=new Village();this.village.restore(data.village);
      this.cropCircles=new CropCircles();this.cropCircles.restore(data.cropCircles);
      if(!this.flock.restore(data.flock))this.flock=new Flock();
      this.seed=data.seed;this.rng=random(data.seed);this.time=Number.isFinite(data.time)?data.time:0;this.dayKey=String(data.dayKey||'');this.homes=homes;
      this.nextExcursionAt=Number.isFinite(data.nextExcursionAt)&&data.nextExcursionAt>=0?data.nextExcursionAt:null;
      this.agents=data.agents.map(a=>({...a,path:Array.isArray(a.path)?a.path.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)):[],
        state:a.state==='circleSmooth'?'circlePlant':a.state,
        age:Number.isFinite(a.age)?Math.max(0,a.age):0,next:0,
        until:(reclining(a)||['explore','exploreRest'].includes(a.state)||a.state==='lookAround'&&Number.isFinite(a.lookFrom))&&Number.isFinite(a.until)?Math.min(a.until,this.time+(a.state==='lookAround'?3.2:a.state==='explore'?240:80)):0,
        playAt:Number.isFinite(a.playAt)?a.playAt:this.time+8,
        game:this.cropCircles.owns(a)||typeof a.game==='string'&&a.game.startsWith('yard-')?a.game:null,task:null,hunger:clamp(+a.hunger||0,0,1),fatigue:clamp(+a.fatigue||0,0,1)}));
      this.torches=data.torches;this.games=[];this.signature='';return true;
    }
  }
  const api={World,random,auroraLight,meteorBatch,meteorPeriod,meteorColors,reclineAmount,clamp,distance,inside,worldDate,farm,farmPoint,lampsDue};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PastoralCore=api;
})(globalThis);
