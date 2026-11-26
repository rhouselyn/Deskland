/* 羊只感知附近的羊、牧犬和围栏。草场目的地属于牧犬。 */
(function(root){
  'use strict';
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const center=group=>({x:group.reduce((v,s)=>v+s.x,0)/group.length,y:group.reduce((v,s)=>v+s.y,0)/group.length});
  const unit=(x,y)=>{const d=Math.hypot(x,y)||1;return {x:x/d,y:y/d};};
  const fence={left:-106,right:53,half:54,opening:29};
  const rails=[[fence.left,-fence.half,fence.right,-fence.half],[fence.left,-fence.half,fence.left,fence.half],
    [fence.right,-fence.half,fence.right,-fence.opening],[fence.right,fence.opening,fence.right,fence.half],[fence.left,fence.half,fence.right,fence.half]];
  const kennel={x:fence.right+23,y:fence.half+2},stage={x:fence.right+57,y:0};
  const inFold=p=>p.x>=fence.left&&p.x<=fence.right&&Math.abs(p.y)<=fence.half;
  const count=80,wanderCooldown=160,grazeSeconds=150;
  function sample(key,salt){
    let n=Math.imul(key+1,0x9e3779b1)^Math.imul(salt+1,0x85ebca77);
    n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);
    return ((n^(n>>>15))>>>0)/4294967296;
  }
  function patchOffset(i,cycle){
    const angle=sample(i,cycle*2)*Math.PI*2,r=Math.pow(sample(i,cycle*2+1),.65);
    return {x:Math.cos(angle)*r,y:Math.sin(angle)*r};
  }
  const spread=Array.from({length:count},(_,i)=>patchOffset(i,0));
  const beds=[];
  for(let i=0;i<count;i++){
    let best,gap=-1;
    for(let attempt=0;attempt<48;attempt++){
      const p={x:fence.left+10+sample(i,attempt*2)*(fence.right-fence.left-20),
        y:(sample(i,attempt*2+1)*2-1)*(fence.half-9)};
      const nearest=Math.min(...beds.map(q=>distance(p,q)));
      if(nearest>gap){best=p;gap=nearest;}
      if(nearest>11)break;
    }
    beds.push(best);
  }
  const penCenter=center(beds);
  const newSheep=i=>({...beds[i],vx:0,vy:0,dir:i*.79,kind:i%3===2?'lamb':'sheep',style:i%3,state:'rest'});
  const sizes=[[138,68],[360,108],[255,82],[185,64],[245,55],[185,52]];
  function offset(p,x,y){return p.vertical?{x:y,y:p.sign*x}:{x:p.sign*x,y};}
  const corners=[fence.left-8,fence.right+10].flatMap(x=>[-1,1].map(side=>({x,y:side*(fence.half+6)})))
    .concat([{x:fence.right+14,y:0},{x:fence.right-12,y:0}]);
  function clearLine(a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    if(dx)for(const x of [fence.left,fence.right]){
      const t=(x-a.x)/dx,y=a.y+t*dy;
      if(t>0&&t<1&&Math.abs(y)<=fence.half+1&&(x===fence.left||Math.abs(y)>=fence.opening-3))return false;
    }
    if(dy)for(const y of [-fence.half,fence.half]){
      const t=(y-a.y)/dy,x=a.x+t*dx;if(t>0&&t<1&&x>=fence.left-1&&x<=fence.right+1)return false;
    }
    return true;
  }
  const links=corners.map(a=>corners.map(b=>clearLine(a,b)?distance(a,b):Infinity));
  function nextCorner(a,b){
    if(clearLine(a,b))return b;
    const costs=corners.map(p=>clearLine(a,p)?distance(a,p):Infinity),first=corners.slice(),used=new Set();
    let best=Infinity,next=b;
    for(let k=0;k<corners.length;k++){
      let i=-1;for(let j=0;j<corners.length;j++)if(!used.has(j)&&costs[j]<(i<0?Infinity:costs[i]))i=j;
      if(i<0||costs[i]>=best)break;used.add(i);
      const total=costs[i]+distance(corners[i],b);
      if(total<best&&clearLine(corners[i],b)){best=total;next=first[i];}
      for(let j=0;j<corners.length;j++)if(costs[i]+links[i][j]<costs[j]){costs[j]=costs[i]+links[i][j];first[j]=first[i];}
    }
    return next;
  }
  const modes=['folded','leaving','drive','graze','return','enter'];
  const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  function siteExtent(shape){
    const a=offset(shape,fence.left-12,-68),b=offset(shape,138,68);
    return {left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)};
  }
  function availableSite(shape,w,preferred){
    const {left,right,top,bottom}=siteExtent(shape);
    const x0=19-left,x1=w.width-19-right,y0=23-top,y1=w.height-19-bottom;
    if(x0>x1||y0>y1)return null;
    const avoid=[...w.obstacles,...w.homes].map(r=>({
      l:r.x-right-8,r:r.x+r.w-left+8,t:r.y-bottom-8,b:r.y+r.h-top+8
    })).sort((a,b)=>a.l-b.l);
    // 合法中心落在屏幕边、障碍边或理想中心。按行合并禁用区间，窄缝也能精确放置。
    const tx=clamp(preferred.x,x0,x1),ty=clamp(preferred.y,y0,y1);
    const rows=new Set([ty,y0,y1]);for(const r of avoid){rows.add(clamp(r.t,y0,y1));rows.add(clamp(r.b,y0,y1));}
    let best=null,cost=Infinity;
    for(const y of rows){
      const dy=(y-preferred.y)**2;if(dy>=cost)continue;
      const consider=(lo,hi)=>{
        if(lo>hi)return;
        const x=clamp(tx,lo,hi),d=(x-preferred.x)**2+dy;
        if(d<cost){cost=d;best={...shape,x,y};}
      };
      let start=x0;
      for(const r of avoid){
        if(y<=r.t||y>=r.b||r.r<=start||r.l>x1)continue;
        consider(start,Math.min(r.l,x1));start=Math.max(start,r.r);
      }
      consider(start,x1);
      if(!cost)break;
    }
    return best;
  }
  function findSite(w,old){
    if(!w.homes.length)return null;
    if(old){
      const same=availableSite(old,w,old);
      if(same&&same.x===old.x&&same.y===old.y)return same;
    }
    const target={x:w.width*.34,y:w.height*.53};
    let best=null,cost=Infinity;
    for(const vertical of [false,true])for(const sign of [1,-1]){
      const p=availableSite({reach:138,span:68,vertical,sign},w,target);
      if(p&&distance(p,target)<cost){best=p;cost=distance(p,target);}
    }
    return best;
  }
  class Flock{
    constructor(){
      this.idle=[];this.site=null;this.sheep=[];this.dog=null;this.mode='folded';this.patch=0;this.round=0;
      this.nextSwitch=0;this.nextWander=0;this.stray=-1;this.collect=-1;this.wear=[0,0,0];this.fields=[null,null,null];
      this.displaced=new Set();this.escorting=false;
    }
    layout(w,preferred=this.site){
      const previous=this.site,site=findSite(w,preferred);
      this.world=w;
      if(!site){this.site=null;return;}
      this.site=site;
      if(!this.sheep.length){
        this.sheep=Array.from({length:count},(_,i)=>newSheep(i));
        this.dog={...kennel,vx:0,vy:0,dir:Math.PI,lift:0,kind:'collie',style:0,state:'rest'};
      }
      this.ground=w.free.slice();
      const lanes=this.ground.slice();
      for(let i=0;i<lanes.length;i++)if(lanes[i]){
        const p=w.cellCenter(i),a=this.local(p);
        if(w.homes.some(h=>p.x>h.x-4&&p.x<h.x+h.w+4&&p.y>h.y-4&&p.y<h.y+h.h+4))this.ground[i]=lanes[i]=0;
        if((Math.abs(a.x-fence.left)<7||Math.abs(a.x-fence.right)<7&&Math.abs(a.y)>fence.opening-6)&&Math.abs(a.y)<fence.half+7||
          Math.abs(Math.abs(a.y)-fence.half)<7&&a.x>fence.left-7&&a.x<fence.right+7||
          Math.abs(a.x-kennel.x)<15&&Math.abs(a.y-kennel.y)<11)lanes[i]=0;
      }
      this.lanes=lanes;this.homeRoute=w.routes(this.cell({x:0,y:0}),lanes);
      this.grass=[];
      for(let i=0;i<lanes.length;i++)if(this.homeRoute[i]>=0&&!inFold(this.local(w.cellCenter(i))))this.grass.push(i);
      const moved=previous&&(previous.x!==site.x||previous.y!==site.y||previous.vertical!==site.vertical||previous.sign!==site.sign);
      const keepWorldPosition=a=>{
        const p=offset(previous,a.x,a.y);
        return this.local({x:previous.x+p.x,y:previous.y+p.y});
      };
      for(const a of [...this.sheep,this.dog]){
        if(moved&&!inFold(a))Object.assign(a,keepWorldPosition(a));
        if(!inFold(a)&&!(a===this.dog&&distance(a,kennel)<16)&&!(this.homeRoute[this.cell(a)]>=0))Object.assign(a,this.nearest(a));
        else if(!this.ground[this.cell(a)])Object.assign(a,this.nearest(a));
      }
      if(moved){
        this.fields=this.fields.map(p=>p&&keepWorldPosition(p));
        if(this.herd&&!inFold(this.herd))this.herd=keepWorldPosition(this.herd);
      }
      this.fields=this.fields.map(p=>p&&this.homeRoute[this.cell(p)]>=0&&w.iconFree(this.screen(p))?p:null);
      this.fieldRoute=null;this.dogRoute=null;this.groupRoute=null;this.backTarget=null;this.flankSide=0;
      if(moved)this.previewDog=null;
      if(this.herd&&!(this.homeRoute[this.cell(this.herd)]>=0))this.herd=null;
      if(!this.field()){
        this.chooseField(center(this.sheep));
        if(this.mode==='graze'){this.mode='drive';this.collect=this.stray=-1;}
      }
      const extent=Math.max(-fence.left+6,kennel.x+14);
      for(let row=Math.max(0,Math.floor((site.y-extent)/w.cell));row<Math.min(w.rows,(site.y+extent)/w.cell+1);row++){
        for(let col=Math.max(0,Math.floor((site.x-extent)/w.cell));col<Math.min(w.cols,(site.x+extent)/w.cell+1);col++){
          const dx=(col+.5)*w.cell-site.x,dy=(row+.5)*w.cell-site.y;
          const x=(site.vertical?dy:dx)*site.sign,y=site.vertical?dx:dy;
          if(x>fence.left-5&&x<fence.right+5&&Math.abs(y)<fence.half+5||Math.abs(x-kennel.x)<13&&Math.abs(y-kennel.y)<10)w.free[row*w.cols+col]=0;
        }
      }
    }
    get gateClosed(){return this.mode==='folded'&&!inFold(this.dog);}
    idleAt(i,time){
      const period=39+sample(i,201)*29,clock=time/period+sample(i,202),cycle=Math.floor(clock);
      let spot=this.idle[i];
      if(!spot||spot.cycle!==cycle){
        spot={...patchOffset(i,cycle+5),cycle,
          penX:fence.left+8+sample(i,cycle*2+417)*(fence.right-fence.left-16),
          penY:(sample(i,cycle*2+418)*2-1)*(fence.half-8)};
        this.idle[i]=spot;
      }
      spot.phase=clock-cycle;
      return spot;
    }
    field(i=this.patch){return this.fields[i];}
    local(p){
      const s=this.site,dx=p.x-s.x,dy=p.y-s.y;
      return {x:(s.vertical?dy:dx)*s.sign,y:s.vertical?dx:dy};
    }
    cell(a){
      const s=this.site,p=offset(s,a.x,a.y),x=s.x+p.x,y=s.y+p.y,w=this.world;
      return x<0||y<0||x>=w.width||y>=w.height?-1:Math.floor(y/w.cell)*w.cols+Math.floor(x/w.cell);
    }
    nearest(a){
      let best=stage,cost=Infinity;
      for(const i of this.grass){
        const p=this.local(this.world.cellCenter(i)),d=(p.x-a.x)**2+(p.y-a.y)**2;
        if(d<cost){best=p;cost=d;}
      }
      return best;
    }
    chooseField(from){
      const w=this.world,minDistance=Math.hypot(w.width,w.height)*.36;
      let best=null,far=-1,eligible=0,rank=-1;
      // 等概率抽取够远的可达草地；狭小布局退回到能走到的最远处。
      for(const i of this.grass){
        const screen=w.cellCenter(i);if(!w.iconFree(screen))continue;
        const p=this.local(screen),d=distance(p,from);
        const room=Math.min(screen.x,w.width-screen.x,screen.y,w.height-screen.y);
        const priority=(d>=minDistance?2:0)+(room>=Math.min(135,w.height*.18,w.width*.18)?1:0);
        if(priority<rank)continue;
        if(priority>rank){rank=priority;far=-1;eligible=0;}
        if(d>=minDistance){if(w.rng()*++eligible<1)best=p;}
        else if(d>far){best=p;far=d;}
      }
      this.fields[this.patch]=best;this.wear[this.patch]=0;this.fieldRoute=null;
    }
    clear(a,b,land=this.ground){
      if(!clearLine(a,b))return false;
      const n=Math.max(1,Math.ceil(distance(a,b)/7));
      for(let j=1;j<=n;j++)if(!land[this.cell({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n})])return false;
      return true;
    }
    waypoint(a,target,route){
      let i=this.cell(a);
      if(!route)return nextCorner(a,target);
      if(!(route[i]>=0)){
        let best=null,cost=Infinity;
        for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){
          const j=i+y*this.world.cols+x;if(!(route[j]>=0))continue;
          const p=this.local(this.world.cellCenter(j)),d=distance(a,p);
          if(d<cost&&this.clear(a,p)){best=p;cost=d;}
        }
        if(best)return best;
        return nextCorner(a,target);
      }
      const land=this.lanes;
      if(this.clear(a,target,land))return target;
      let best=this.local(this.world.cellCenter(i));
      for(let n=0;n<5&&route[i]!==i;n++){
        i=route[i];const p=this.local(this.world.cellCenter(i));
        if(!this.clear(a,p,land))break;best=p;
      }
      return best;
    }
    screen(a){
      const p=offset(this.site,a.x,a.y),v=offset(this.site,Math.cos(a.dir||0),Math.sin(a.dir||0));
      return {...a,x:this.site.x+p.x,y:this.site.y+p.y,dir:Math.atan2(v.y,v.x)};
    }
    relocateMember(index,p){
      if(!this.site||!finitePoint(p)||!Number.isInteger(index)||index< -1||index>=this.sheep.length)return false;
      const a=index===-1?this.dog:this.sheep[index];
      let to=this.local(p);
      if(!(this.homeRoute[this.cell(to)]>=0)||!this.world.iconFree(p)){
        let best=-1,gap=Infinity;
        for(let i=0;i<this.homeRoute.length;i++)if(this.homeRoute[i]>=0){
          const cell=this.world.cellCenter(i),d=(cell.x-p.x)**2+(cell.y-p.y)**2;
          if(d<gap&&this.world.iconFree(cell)){best=i;gap=d;}
        }
        if(best<0)return false;
        to=this.local(this.world.cellCenter(best));
      }
      Object.assign(a,to,{vx:0,vy:0});
      if(index===-1){
        a.lift=0;this.previewDog=this.dogRoute=this.backTarget=null;
      }else{
        const herd=this.herd||penCenter;
        this.displaced.delete(index);
        if(inFold(a)!==inFold(herd)||distance(a,herd)>130)this.displaced.add(index);
        if(this.collect===index){this.collect=-1;this.escorting=false;}
        if(this.stray===index)this.stray=-1;
        a.state='rest';
      }
      return true;
    }
    findDisplaced(){
      if(!this.displaced.size)return;
      this.stray=-1;
      if(!this.displaced.has(this.collect)){
        let gap=Infinity;
        for(const i of this.displaced){
          const d=distance(this.dog,this.sheep[i]);
          if(d<gap){this.collect=i;gap=d;}
        }
        this.escorting=false;
      }
      const s=this.sheep[this.collect];
      if(!this.escorting&&distance(this.dog,s)<46&&this.clear(this.dog,s)){
        this.escorting=true;
        // The dog can bring a group back together when it finds them in the same clearing.
        for(const i of this.displaced)if(i!==this.collect&&distance(s,this.sheep[i])<75&&this.clear(s,this.sheep[i]))this.displaced.delete(i);
      }
      const penned=inFold(this.herd),together=inFold(s)===penned&&distance(s,this.herd)<(penned?48:120);
      if(together){
        this.displaced.delete(this.collect);this.collect=-1;this.escorting=false;
      }
    }
    canDisplace(a,p){
      return inFold(a)===inFold(p)&&this.ground[this.cell(p)]&&clearLine(a,p);
    }
    move(a,vx,vy,dt){
      const wasInside=inFold(a);
      let x=a.x+vx*dt,y=a.y+vy*dt;
      const settling=wasInside&&(this.mode==='folded'||this.mode==='enter');
      const atKennel=a.kind==='collie'&&a.state==='rest'&&distance(a,kennel)<35;
      const land=!settling&&!atKennel&&this.lanes[this.cell(a)]?this.lanes:this.ground;
      if(!land[this.cell({x,y})]){
        if(land[this.cell({x,y:a.y})])y=a.y;
        else if(land[this.cell({x:a.x,y})])x=a.x;
        else{x=a.x;y=a.y;}
      }
      // 穿越围栏只能走右侧的门。碰到门边的羊会沿栅栏挪向缺口。
      if(wasInside!==inFold({x,y})){
        const through=(!settling||a.kind==='collie')&&!this.gateClosed&&(a.x-fence.right)*(x-fence.right)<=0&&Math.abs(y)<fence.opening-2;
        if(!through){
          if(wasInside){x=clamp(x,fence.left+.2,fence.right-.2);y=clamp(y,-fence.half+.2,fence.half-.2);}
          else if(a.x>fence.right)x=Math.max(x,fence.right+.2);
          else if(a.x<fence.left)x=Math.min(x,fence.left-.2);
          else y=Math.sign(a.y)*(fence.half+.2);
          if(Math.abs(x-fence.right)<2&&Math.abs(y)>fence.opening-3)y-=Math.sign(y)*Math.min(Math.abs(y),Math.abs(vx)*dt*.8);
        }
      }
      a.vx=(x-a.x)/dt;a.vy=(y-a.y)/dt;a.x=x;a.y=y;
      if(a.kind!=='collie'&&Math.hypot(a.vx,a.vy)>3){
        const turn=Math.atan2(a.vy,a.vx)-a.dir;
        const facing=a.dir+clamp(Math.atan2(Math.sin(turn),Math.cos(turn)),-dt*3.2,dt*3.2);
        a.dir=Math.atan2(Math.sin(facing),Math.cos(facing));
      }
    }
    backShortcut(target){
      const dog=this.dog,d=distance(dog,target);
      if(d<12||dog.state==='rest')return false;
      if(this.backTarget&&distance(target,this.backTarget)<45)return this.clear(dog,target,this.lanes);
      if(d<32)return false;
      // 两只成年羊的背落在同一小段直线上才抄近路，孤零零的一只羊照常避让。
      const h=unit(target.x-dog.x,target.y-dog.y),hits=[];
      for(const s of this.sheep){
        if(s.kind!=='sheep')continue;
        const x=s.x-dog.x,y=s.y-dog.y,along=x*h.x+y*h.y;
        if(along<0||along>Math.min(d-7,155)||Math.abs(x*h.y-y*h.x)>10)continue;
        if(hits.some(other=>Math.abs(other-along)<30))return this.clear(dog,target,this.lanes);
        hits.push(along);
      }
      return false;
    }
    turnDog(angle,dt){
      const dog=this.dog,delta=angle-dog.dir;
      let turn=Math.atan2(Math.sin(delta),Math.cos(delta));
      if(Math.abs(turn)>3.03&&this.turnSide)turn=this.turnSide*Math.abs(turn);
      if(Math.abs(turn)>.05)this.turnSide=Math.sign(turn);
      dog.dir+=clamp(turn,-6.4*dt,6.4*dt);
      dog.dir=Math.atan2(Math.sin(dog.dir),Math.cos(dog.dir));
    }
    runDog(target,state,dt,groupCenter){
      const dog=this.dog;dog.state=state;let aim=target;
      const crossing=this.backShortcut(target);
      this.backTarget=crossing?target:null;
      if(!crossing&&groupCenter&&distance(dog,groupCenter)<150&&distance(target,groupCenter)>75){
        const a=unit(dog.x-groupCenter.x,dog.y-groupCenter.y),b=unit(target.x-groupCenter.x,target.y-groupCenter.y);
        if(a.x*b.x+a.y*b.y<.25){
          const turn=this.flankSide||Math.sign(a.x*b.y-a.y*b.x)||1;this.flankSide=turn;
          aim={x:groupCenter.x+(a.x-a.y*turn)*101,y:groupCenter.y+(a.y+a.x*turn)*101};
        }else this.flankSide=0;
      }else this.flankSide=0;
      const bedding=state==='rest'&&distance(dog,kennel)<35;
      if(!this.clear(dog,aim,bedding?this.ground:this.lanes)){
        if(!this.dogRoute||distance(aim,this.dogRoute.aim)>20){
          const to=this.homeRoute[this.cell(aim)]>=0?aim:this.nearest(aim);
          this.dogRoute={aim,to,route:this.world.routes(this.cell(to),this.lanes)};
        }
        aim=this.waypoint(dog,this.dogRoute.to,this.dogRoute.route);
      }
      const d=distance(dog,aim),stop=state==='rest'?.45:aim===target?2.5:.6;
      const h=unit(aim.x-dog.x,aim.y-dog.y);
      let v=0;
      if(d>stop){
        const angle=Math.atan2(h.y,h.x);this.turnDog(angle,dt);
        if(Math.cos(angle-dog.dir)>.85)v=Math.min(67,Math.hypot(dog.vx,dog.vy)+240*dt,d/dt,5+4*d);
      }
      this.move(dog,h.x*v,h.y*v,dt);
      if(crossing||dog.lift){
        let height=0;
        if(crossing&&(v>5||dog.lift))for(const s of this.sheep){
          if(s.kind!=='sheep')continue;
          const support=clamp((20-distance(s,dog))/12,0,1);
          height=Math.max(height,(s.state==='rest'?5:8)*support);
        }
        dog.lift+=clamp(height-dog.lift,-36*dt,46*dt);
      }
    }
    // 群体的移动受边牧的实际站位推动。它换边时先收住压力，绕到后侧再推进。
    driveHerd(target,route,groupCenter,time,dt){
      const herd=this.herd,dog=this.dog,ahead=this.waypoint(herd,target,route);
      const h=unit(ahead.x-herd.x,ahead.y-herd.y);
      const gate=inFold(herd)||distance(herd,{x:fence.right,y:0})<65;
      const swing=Math.sin(time*.36)*(gate?.32:.72),radius=gate?42:134;
      const sweep=Math.sin(swing)*radius,rear=Math.cos(swing)*radius;
      let behind,room=false;
      for(const scale of [1,.7,.4,.2]){
        behind={x:herd.x-(h.x*rear+h.y*sweep)*scale,y:herd.y-(h.y*rear-h.x*sweep)*scale};
        if(this.homeRoute[this.cell(behind)]>=0&&this.clear(herd,behind)){room=scale>=.4;break;}
      }
      if(!this.lastPush||time-this.lastPush.time>3){
        if(this.lastPush&&distance(herd,this.lastPush.at)<9)this.leadUntil=time+5;
        this.lastPush={time,at:{...herd}};
      }
      // 墙角和窄门没有绕到队尾的空间，犬先穿过缺口，群头跟着实际走过去的犬转弯。
      const lead=!room||time<this.leadUntil;
      const dx=herd.x-dog.x,dy=herd.y-dog.y;
      const pressing=dx*h.x+dy*h.y>3&&Math.hypot(dx,dy)<193;
      if(lead){
        const stride=Math.min(60,distance(herd,ahead));
        this.runDog({x:herd.x+h.x*stride,y:herd.y+h.y*stride},'lead',dt);
      }else this.runDog(behind,pressing?'drive':'flank',dt,gate?null:herd);
      let away=unit(herd.x-dog.x,herd.y-dog.y);
      let pressure=dog.state==='drive'?clamp((205-distance(dog,herd))/55,0,1):0;
      if(dog.state==='lead'&&-dx*h.x-dy*h.y>2&&this.clear(herd,dog,this.lanes)){
        away={x:-away.x,y:-away.y};pressure=clamp(distance(dog,herd)/14,0,1);
      }
      const pace=dog.lift>1?0:23*pressure*clamp((150-distance(groupCenter,herd))/52,0,1);
      const vx=away.x*pace,vy=away.y*pace;
      const step={x:herd.x+vx*dt,y:herd.y+vy*dt};
      const previousX=herd.x,previousY=herd.y;
      if(this.clear(herd,step,this.lanes)){herd.x=step.x;herd.y=step.y;}
      else{
        const x={x:step.x,y:herd.y},y={x:herd.x,y:step.y};
        if(this.clear(herd,x,this.lanes))herd.x=x.x;
        else if(this.clear(herd,y,this.lanes))herd.y=y.y;
      }
      return {x:(herd.x-previousX)/dt,y:(herd.y-previousY)/dt};
    }
    stepSheep(s,i,t,dt,drift,radius){
      const feeding=this.mode==='graze',spreadRadius=feeding?radius*1.25:radius;
      const idle=feeding?this.idleAt(i,t):null;
      if(feeding&&i!==this.stray&&i!==this.collect&&distance(s,this.herd)<spreadRadius+26&&idle.phase<.22){
        s.vx=s.vy=0;s.state='rest';return;
      }
      const spacing=inFold(s)?15:feeding?29:27;
      let repelX=0,repelY=0,alignX=0,alignY=0,neighbors=0;
      for(let j=0;j<count;j++){
        if(i===j||j===this.stray)continue;
        const peer=this.sheep[j],dx=s.x-peer.x,dy=s.y-peer.y,d2=dx*dx+dy*dy;
        if(this.mode==='enter'&&inFold(peer))continue;
        if(d2>75*75)continue;
        const weight=s.kind==='lamb'&&j===i-1?2.8:1;
        alignX+=peer.vx*weight;alignY+=peer.vy*weight;neighbors+=weight;
        if(d2>=spacing*spacing)continue;
        const d=Math.sqrt(d2);
        if(d>.01){
          const force=(spacing-d)/d;
          repelX+=dx*force;repelY+=dy*force;
        }else{
          // 老存档可能有完全重合的羊，给双方相反的分离方向。
          const sign=i<j?1:-1,angle=(i+j)*2.4;
          repelX+=sign*Math.cos(angle)*spacing;repelY+=sign*Math.sin(angle)*spacing;
        }
      }
      const herd=this.herd,area=idle||spread[i],phase=t*.15+i*2.17;
      let offsetX=area.x*spreadRadius,offsetY=area.y*spreadRadius;
      if(this.mode==='leaving'){
        const open=clamp((herd.x-fence.right)/50,0,1);
        offsetX=offsetX*open+(beds[i].x-penCenter.x)*(1-open);
        offsetY=offsetY*open+(beds[i].y-penCenter.y)*(1-open);
      }
      let spot=herd;
      for(const scale of [1,.65,.3]){
        const p={x:herd.x+offsetX*scale,y:herd.y+offsetY*scale};
        if(this.clear(herd,p,this.lanes)){spot=p;break;}
      }
      const far=distance(s,spot),free=this.clear(s,spot,this.lanes);
      const toward=free?spot:this.waypoint(s,herd,this.groupRoute.route);
      const h=unit(toward.x-s.x,toward.y-s.y);
      const pull=free?clamp((far-(feeding?30:13))*.50,0,feeding&&distance(s,herd)<spreadRadius+30?7:19):29;
      const response=.55+.28*(.5+.5*Math.sin(phase))+.25*clamp(1-distance(s,this.dog)/150,0,1);
      const wander=feeding?1.6:3.5;
      let vx=repelX*1.8+h.x*pull+drift.x*response+Math.cos(phase)*wander;
      let vy=repelY*1.8+h.y*pull+drift.y*response+Math.sin(phase*.79)*wander;
      if(neighbors){vx+=alignX/neighbors*.15;vy+=alignY/neighbors*.15;}
      if(this.dog.lift<=1&&['drive','collect'].includes(this.dog.state)){
        const dx=s.x-this.dog.x,dy=s.y-this.dog.y,d=Math.max(1,Math.hypot(dx,dy));
        const push=Math.max(0,1-d/76)*(this.dog.state==='collect'&&i!==this.collect?5:23);
        vx+=dx/d*push;vy+=dy/d*push;
      }
      if(this.stray===i){vx+=Math.cos(this.wanderAngle)*26;vy+=Math.sin(this.wanderAngle)*26;}
      const speed=Math.hypot(vx,vy),limit=s.kind==='lamb'?34:31;
      if(speed>limit){vx*=limit/speed;vy*=limit/speed;}
      if(feeding&&speed<1.9){vx=0;vy=0;}
      const blend=1-Math.exp(-dt*2.8);
      this.move(s,s.vx+(vx-s.vx)*blend,s.vy+(vy-s.vy)*blend,dt);
      const moving=Math.hypot(s.vx,s.vy)>(s.state==='walk'?2.8:4.8);
      s.state=this.stray===i?'wander':moving?'walk':'graze';
    }
    update(dt,solar,time,decide){
      if(!this.site||!this.ground||dt<=0)return;
      if(!decide){
        for(const a of this.sheep)this.move(a,a.vx,a.vy,dt);
        // 预览追到最近收到的犬位就停下，避免外推越过转弯处、下次同步时倒退。
        const target=this.previewDog;
        if(target){
          if(distance(this.dog,target)>2.5)this.runDog(target,target.state,dt);
          else{
            this.dog.vx=this.dog.vy=0;this.dog.state=target.state;
            this.turnDog(target.dir,dt);
            this.dog.lift+=clamp(target.lift-this.dog.lift,-36*dt,46*dt);
          }
        }
        return;
      }
      const minute=solar.minute??720,out=minute>=420&&minute<1080;
      if(out&&['folded','return','enter'].includes(this.mode)){this.mode='leaving';this.collect=-1;}
      if(!out&&!['folded','return','enter'].includes(this.mode)){this.mode='return';this.stray=this.collect=-1;}
      if(!out&&this.mode==='folded'&&this.displaced.size&&this.sheep.some(s=>!inFold(s))){
        this.mode='enter';this.herd={...penCenter};
      }
      const field=this.field();
      if(!field)return;
      if(!this.fieldRoute)this.fieldRoute=this.world.routes(this.cell(field),this.lanes);
      const c=center(this.sheep);
      if(!this.herd)this.herd=this.homeRoute[this.cell(c)]>=0?c:this.nearest(c);
      if(this.mode==='leaving'&&(this.herd.x>fence.right+50||this.sheep.every(s=>!inFold(s))))this.mode='drive';
      if(this.mode==='return'&&inFold(this.herd))this.mode='enter';
      if(!out&&this.sheep.every(inFold))this.mode='folded';
      if(this.mode==='folded'){
        this.displaced.clear();this.escorting=false;
        this.sheep.forEach((s,i)=>this.settle(s,i,dt,time));
        this.runDog(kennel,'rest',dt);this.herd=null;return;
      }
      if(this.mode==='drive'&&distance(this.herd,field)<32&&distance(c,field)<96&&this.world.iconFree(this.screen(this.herd))){
        this.mode='graze';this.herd={...field};this.nextSwitch=time+grazeSeconds;this.nextWander=time+20;
      }
      this.findDisplaced();
      if(this.mode==='graze'){
        this.wear[this.patch]=Math.min(1,this.wear[this.patch]+dt/grazeSeconds);
        if(time>=this.nextSwitch&&this.collect<0&&this.stray<0){
          this.patch=(this.patch+1)%3;this.chooseField(field);this.mode='drive';return;
        }
        if(time>=this.nextWander&&this.stray<0&&this.collect<0){
          this.stray=(this.round*7+2)%count;this.round++;
          const h=unit(-c.x,-c.y);this.wanderAngle=Math.atan2(h.y,h.x)+Math.sin(this.round*2.3)*.6;
          this.nextWander=time+wanderCooldown;
        }
        if(this.stray>=0&&time>=this.nextWander-wanderCooldown+8)this.collect=this.stray;
      }
      for(let i=0;i<3;i++)if(i!==this.patch)this.wear[i]=Math.max(0,this.wear[i]-dt/260);
      const grazing=this.mode==='graze';
      let drift={x:0,y:0};
      if(this.displaced.has(this.collect)){
        const s=this.sheep[this.collect];
        this.runDog({x:s.x,y:s.y},'collect',dt);
      }else if(this.collect>=0){
        const stray=this.sheep[this.collect],h=unit(stray.x-c.x,stray.y-c.y);
        this.runDog({x:stray.x+h.x*26,y:stray.y+h.y*26},'collect',dt);
        if(distance(this.dog,stray)<48)this.stray=-1;
        if(this.stray<0&&distance(stray,c)<135)this.collect=-1;
      }else if(this.mode==='enter'&&this.herd.x<15&&inFold(this.herd)){
        const last=this.sheep.filter(s=>!inFold(s)),tail=center(last);
        const ahead=this.waypoint(tail,this.herd,this.homeRoute),h=unit(ahead.x-tail.x,ahead.y-tail.y);
        this.runDog({x:tail.x-h.x*36,y:tail.y-h.y*36},'collect',dt);
      }else if(grazing){
        this.runDog({x:c.x-52,y:c.y+104},'watch',dt);
      }else{
        const target=this.mode==='leaving'?stage:out?field:{x:0,y:0};
        const route=this.mode==='leaving'?null:out?this.fieldRoute:this.homeRoute;
        drift=this.driveHerd(target,route,c,time,dt);
      }
      const herd=this.herd;
      if(!this.groupRoute||distance(herd,this.groupRoute.at)>26){
        this.groupRoute={at:{...herd},route:this.world.routes(this.cell(herd),this.lanes)};
      }
      const gateDistance=distance(herd,{x:fence.right,y:0});
      const radius=inFold(herd)?22:clamp(gateDistance*.70,25,125);
      for(let i=0;i<count;i++){
        const s=this.sheep[i];
        if(this.displaced.has(i)){
          if(i!==this.collect||!this.escorting||distance(s,this.dog)>65){s.state='rest';s.vx=s.vy=0;continue;}
          const next=this.waypoint(s,herd,this.groupRoute.route);
          const h=unit(next.x-s.x,next.y-s.y),speed=Math.min(21,distance(s,next)/dt);
          this.move(s,h.x*speed,h.y*speed,dt);s.state='walk';continue;
        }
        if((!out||this.mode==='leaving'&&this.dog.state==='rest')&&inFold(s)){this.settle(s,i,dt,time);continue;}
        if(this.mode==='enter'&&inFold(herd)){
          // 圈门口与狗窝之间的拐角要逐格通过，避免横向避让把最后两只羊顶在栅栏上。
          const cell=this.cell(s),next=this.homeRoute[cell];
          const toward=next>=0?this.local(this.world.cellCenter(next)):this.waypoint(s,herd,this.homeRoute);
          const h=unit(toward.x-s.x,toward.y-s.y),speed=Math.min(18,distance(s,toward)/dt);
          this.move(s,h.x*speed,h.y*speed,dt);s.state='walk';continue;
        }
        this.stepSheep(s,i,time,dt,drift,radius);
      }
    }
    settle(s,i,dt,time){
      const idle=this.idleAt(i,time);
      const inDoorway=this.mode==='enter'&&s.x>fence.right-24&&Math.abs(s.y)<fence.opening;
      if(!inDoorway&&idle.phase<.57){s.vx=s.vy=0;s.state='rest';return;}
      let dx=idle.penX-s.x,dy=idle.penY-s.y;
      if(inDoorway)dx=Math.min(-18,dx);
      const d=Math.hypot(dx,dy),v=Math.min(inDoorway?9:3.8,d/dt),h=unit(dx,dy);
      let vx=h.x*v,vy=h.y*v;
      for(const peer of this.sheep){
        const x=s.x-peer.x,y=s.y-peer.y,r2=x*x+y*y;
        if(r2<.01||r2>=17*17)continue;
        const room=17/Math.sqrt(r2)-1;
        vx+=x*room;vy+=y*room;
      }
      const limit=Math.min(1,(inDoorway?9:4.5)/(Math.hypot(vx,vy)||1));
      this.move(s,vx*limit,vy*limit,dt);s.state=Math.hypot(s.vx,s.vy)>1?'walk':'graze';
    }
    snapshot(){
      const {site,sheep,dog,mode,patch,round,nextSwitch,nextWander,stray,collect,wear,wanderAngle}=this;
      return site?{site,sheep,dog,mode,herd:this.herd||null,fields:this.fields,patch,round,nextSwitch,nextWander,stray,collect,wear,wanderAngle:wanderAngle||0,
        displaced:[...this.displaced],escorting:this.escorting}:null;
    }
    restore(s){
      const actor=a=>finitePoint(a)&&[a.vx,a.vy,a.dir].every(Number.isFinite)&&Math.hypot(a.vx,a.vy)<85;
      if(!s||!finitePoint(s.site)||![1,-1].includes(s.site.sign)||!sizes.some(([r,h])=>r===s.site.reach&&h===s.site.span)||
        !Array.isArray(s.sheep)||![11,30,count].includes(s.sheep.length)||!s.sheep.every(actor)||!actor(s.dog)||!modes.includes(s.mode)||
        ![0,1,2].includes(s.patch)||![s.stray,s.collect].every(v=>Number.isInteger(v)&&v>=-1&&v<s.sheep.length)||
        !Number.isSafeInteger(s.round)||s.round<0||![s.nextSwitch,s.nextWander,s.wanderAngle].every(Number.isFinite)||
        s.herd!=null&&!finitePoint(s.herd)||
        s.fields!==undefined&&(!Array.isArray(s.fields)||s.fields.length!==3||!s.fields.every(p=>p===null||finitePoint(p)))||
        !Array.isArray(s.wear)||s.wear.length!==3||!s.wear.every(Number.isFinite))return false;
      const copy=(a,kind,style)=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,dir:a.dir,kind,style,state:String(a.state||'rest').slice(0,12)});
      this.herd=s.herd?{x:s.herd.x,y:s.herd.y}:null;this.groupRoute=null;
      this.fields=(s.fields||[null,null,null]).map(p=>p&&{x:p.x,y:p.y});this.fieldRoute=null;
      this.site={x:s.site.x,y:s.site.y,reach:s.site.reach,span:s.site.span,sign:s.site.sign,vertical:s.site.vertical===true};
      this.sheep=s.sheep.map((a,i)=>copy(a,i%3===2?'lamb':'sheep',i%3));this.dog=copy(s.dog,'collie',0);
      this.dog.lift=Number.isFinite(s.dog.lift)?clamp(s.dog.lift,0,8):0;
      this.backTarget=null;this.flankSide=0;this.turnSide=0;this.dogRoute=null;this.previewDog=null;
      // 旧存档中的羊和边牧留在原地。新增成员在羊圈休息，放牧中则加入现有队伍。
      for(let i=this.sheep.length;i<count;i++){
        const a=newSheep(i),peer=this.sheep[i%s.sheep.length];
        if(['graze','drive','return'].includes(s.mode)&&!inFold(peer)){
          a.x=clamp(peer.x+Math.cos(i*2.4)*13,fence.right+2,s.site.reach-22);
          a.y=clamp(peer.y+Math.sin(i*2.4)*13,22-s.site.span,s.site.span-22);a.state='walk';
        }
        this.sheep.push(a);
      }
      for(const key of ['mode','patch','round','nextSwitch','nextWander','stray','collect','wanderAngle'])this[key]=s[key];
      this.displaced=new Set(Array.isArray(s.displaced)?s.displaced.slice(0,count).filter(i=>Number.isInteger(i)&&i>=0&&i<s.sheep.length):[]);
      this.escorting=this.displaced.has(this.collect)&&s.escorting===true;
      this.wear=s.wear.map(v=>clamp(v,0,1));return true;
    }
  }
  Flock.fence=fence;Flock.kennel=kennel;Flock.offset=offset;Flock.rails=rails;Flock.siteExtent=siteExtent;
  if(typeof module!=='undefined'&&module.exports)module.exports=Flock;else root.PastoralFlock=Flock;
})(globalThis);
