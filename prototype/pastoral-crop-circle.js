/* 草原人家的怪圈图案与村民协作。 */
(function(root){
  'use strict';
  const selection=typeof module!=='undefined'&&module.exports?require('./pastoral-selection.js'):root.PastoralSelection;
  const game='crop-circle',squash=.69,approach=2.8,carve=4.4,departure=2.2;
  const minRadius=101,maxRadius=130;
  const fullTurn=Math.PI*2;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const human=a=>a.kind==='adult'||a.kind==='child';
  const atTarget=a=>a.target&&distance(a,a.target)<7;
  const limit=t=>Math.max(0,Math.min(1,t));
  const stages=['forming','waiting','notice','report','fetch','carry','work'];
  const growthSeconds=5,patchRadius=14;

  function flightRoute(w){
    const corner=Math.floor(Math.random()*4),edge=Math.floor(Math.random()*4);
    const width=w.width,height=w.height+52,pad=96;
    const from={x:corner%2?width+pad:-pad,y:corner<2?-pad:height+pad};
    const to=edge<2?{x:edge?width+pad:-pad,y:Math.random()*height}:
      {x:Math.random()*width,y:edge===2?-pad:height+pad};
    return {from,to};
  }

  function restoredRoute(route){
    if(!route||![route.from?.x,route.from?.y,route.to?.x,route.to?.y].every(Number.isFinite))return null;
    return {from:{x:route.from.x,y:route.from.y},to:{x:route.to.x,y:route.to.y}};
  }

  function travel(from,to,fraction){
    const t=limit(fraction),ease=t*t*(3-2*t);
    return {x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease};
  }

  function workPatches(c){
    const core=typeof module!=='undefined'&&module.exports?require('./pastoral-world.js'):root.PastoralCore;
    const patches=[];
    for(const stroke of pattern(c.seed,core.random).strokes){
      let previous=null,remaining=0;
      for(const [x,y] of stroke.points){
        const point={x:c.x+x*c.radius,y:c.y+y*c.radius};
        if(previous){
          const length=distance(previous,point);
          for(let d=remaining;d<=length;d+=8){
            const t=length?d/length:0,p={x:previous.x+(point.x-previous.x)*t,y:previous.y+(point.y-previous.y)*t};
            if(!patches.some(other=>distance(other,p)<6))patches.push({...p,worked:0,plantedAt:null,worker:null});
          }
          remaining=(remaining-length)%8;
          if(remaining<0)remaining+=8;
        }
        previous=point;
      }
    }
    return patches;
  }

  function pattern(seed,rng){
    const random=rng(seed),turn=random()*fullTurn,cos=Math.cos(turn),sin=Math.sin(turn);
    const families=['rings','spiral','rosette','satellites'],family=families[Math.floor(random()*families.length)];
    const twist=(random()<.5?-1:1)*(.45+random()*.8),strokes=[];
    const polar=(r,a)=>[r*Math.cos(a),r*Math.sin(a)];
    function stroke(points,width){
      strokes.push({width,points:points.map(([x,y])=>[x*cos-y*sin,(x*sin+y*cos)*squash])});
    }
    function trace(steps,width,point){
      stroke(Array.from({length:steps+1},(_,i)=>point(i*fullTurn/steps)),width);
    }
    function ring(r,width,x=0,y=0){
      trace(Math.max(16,Math.ceil(r*190)),width,a=>[x+r*Math.cos(a),y+r*Math.sin(a)]);
    }
    ring(.95+random()*.014,.042+random()*.012);
    const hub=.17+random()*.09;
    ring(hub,.035);
    const count=family==='spiral'?3+Math.floor(random()*3):family==='rings'?6+Math.floor(random()*4):4+Math.floor(random()*3);
    const detail=random();
    if(family==='rings')ring(.46+detail*.07,.03);
    if(family==='satellites')ring(.34+detail*.04,.031);
    for(let i=0;i<count;i++){
      const a=i*fullTurn/count;
      if(family==='rings'){
        const span=(.20+detail*.13)*fullTurn/count;
        const tip=.81+detail*.041;
        stroke([polar(tip,a),polar(.72,a+span),polar(.58,a),polar(.72,a-span),polar(tip,a)],.037);
      }else if(family==='spiral'){
        const beads=5+Number(detail>.62);
        for(let j=0;j<beads;j++){
          const t=j/(beads-1),[x,y]=polar(.34+.50*t,a+twist*t);
          ring(.055-.01*detail-.021*t,.023,x,y);
        }
      }else if(family==='rosette'){
        const skew=twist*.32,angle=a+skew;
        const [x,y]=polar(.53,a),ux=Math.cos(angle),uy=Math.sin(angle),minor=.125+detail*.058;
        trace(78,.042,t=>{
          const u=.29*Math.cos(t),v=minor*Math.sin(t);
          return [x+u*ux-v*uy,y+u*uy+v*ux];
        });
      }else{
        const [x,y]=polar(.62,a),[xx,yy]=polar(.77,a+Math.PI/count);
        ring(.131+detail*.041,.042,x,y);
        ring(.046+detail*.012,.026,xx,yy);
      }
    }
    return {family,strokes};
  }

  function flight(c,time){
    const age=Math.max(0,time-c.since),trace=limit((age-approach)/carve);
    const start={x:c.x-c.radius,y:c.y-18},end={x:c.x+c.radius,y:c.y-18};
    const route=c.route||{from:{x:-96,y:-96},to:{x:c.x+c.radius+400,y:-96}};
    let point={x:c.x+c.radius*(2*trace-1),y:c.y-18};
    if(age<approach)point=travel(route.from,start,age/approach);
    if(age>=approach+carve)point=travel(end,route.to,(age-approach-carve)/departure);
    return {...point,trace,groundY:point.y+18,altitude:18,
      beam:age>=approach&&age<approach+carve?1:0,visible:age<approach+carve+departure};
  }

  function visitFlight(visit,time){
    const age=Math.max(0,time-visit.since);
    const looking=age>=approach&&age<approach+4.2;
    const angle=limit((age-approach)/4.2)*fullTurn;
    const center={x:visit.x,y:visit.y-23};
    const route=visit.route||{from:{x:-96,y:-96},to:{x:visit.x+400,y:-96}};
    let point={x:visit.x+Math.sin(angle)*9,y:center.y-4*(1-Math.cos(angle))};
    if(age<approach)point=travel(route.from,center,age/approach);
    if(age>=approach+4.2)point=travel(center,route.to,(age-approach-4.2)/departure);
    return {...point,groundY:point.y+23,altitude:23,beam:0,visible:age<approach+4.2+departure,
      dots:looking?Math.min(3,1+Math.floor((age-approach)/1.1)):0};
  }

  function insideFootprint(c,p,padding=0){
    const dx=Math.max(0,Math.abs(p.x-c.x)-(p.rx??0)),dy=Math.max(0,Math.abs(p.y-c.y)-(p.ry??0));
    return (dx/(c.radius+padding))**2+(dy/(c.radius*squash+padding))**2<=1;
  }

  function cleared(w,c,objects){
    const margin=c.manual?4:41,rx=c.radius+margin,ry=c.radius*squash+margin;
    if(c.x-rx<0||c.x+rx>w.width||c.y-ry<0||c.y+ry>w.height)return false;
    if(objects.some(o=>insideFootprint(c,o,c.manual?8:23)))return false;
    if(c.manual){
      if(w.icons.some(r=>r.x<=c.x-c.radius&&r.x+r.w>=c.x+c.radius&&
        r.y<=c.y-c.radius*squash&&r.y+r.h>=c.y+c.radius*squash))return false;
    }else if(w.obstacles.some(r=>insideFootprint(c,{x:r.x+r.w/2,y:r.y+r.h/2,rx:r.w/2,ry:r.h/2},8)))return false;
    const terrain=p=>c.manual?w.walkable(p):w.openLawn(p);
    const steps=Math.ceil(c.radius/12);
    for(let x=-steps;x<=steps;x++){
      const ySteps=Math.floor(Math.sqrt(steps*steps-x*x));
      for(let y=-ySteps;y<=ySteps;y++){
        if(!terrain({x:c.x+x*c.radius/steps,y:c.y+y*c.radius*squash/steps}))return false;
      }
    }
    // 外环也单独检查，避免采样网格在斜边漏掉小路。
    for(let i=0;i<72;i++){
      const a=i*fullTurn/72;
      if(!terrain({x:c.x+Math.cos(a)*c.radius,y:c.y+Math.sin(a)*c.radius*squash}))return false;
    }
    return true;
  }

  function findSite(w,objects){
    const homes=w.homes;
    if(!homes.length)return null;
    for(let i=0;i<120;i++){
      const home=homes[i%homes.length],angle=Math.random()*fullTurn;
      const radius=110+Math.random()*(maxRadius-110),offset=radius+61+Math.random()*142;
      const c={x:home.door.x+Math.cos(angle)*offset,y:home.door.y+Math.sin(angle)*offset,radius};
      if(cleared(w,c,objects)&&w.path(home.door,c).length)return c;
    }
    // 图标密集时，遍历小片空地，仍用大于房屋的尺寸。
    const reach=410,step=20,marginX=minRadius+41,marginY=minRadius*squash+41;
    for(const {door} of homes){
      const left=Math.max(marginX,door.x-reach),top=Math.max(marginY,door.y-reach);
      const x1=Math.min(w.width-marginX,door.x+reach),y1=Math.min(w.height-marginY,door.y+reach);
      if(left>x1||top>y1)continue;
      const x0=left+Math.random()*Math.min(step,x1-left),y0=top+Math.random()*Math.min(step,y1-top);
      for(let y=y0;y<=y1;y+=step){
        for(let x=x0;x<=x1;x+=step){
          const c={x,y,radius:minRadius};
          if(distance(door,c)<=reach&&cleared(w,c,objects)&&w.path(door,c).length)return c;
        }
      }
    }
    return null;
  }

  function sendCrew(w,crew,spots,state){
    for(const a of crew){
      const i=spots.findIndex(p=>w.go(a,p,state,120));
      if(i<0)return false;
      spots.splice(i,1);
    }
    return true;
  }

  class CropCircles{
    constructor(){this.circle=null;this.nextAt=null;this.visit=null;}

    summon(w,x,y,x2,y2,objects){
      if(!w.free||![x,y,x2,y2].every(Number.isFinite))return false;
      const left=Math.min(x,x2),right=Math.max(x,x2),top=Math.min(y,y2),bottom=Math.max(y,y2);
      if(left<0||top<0||right>w.width||bottom>w.height||right-left<4||bottom-top<4)return false;
      this.visit={x:(left+right)/2,y:(top+bottom)/2,since:w.time,route:flightRoute(w)};
      if(this.circle)return false;
      const overlaps=o=>o.x<right&&o.x+o.w>left&&o.y<bottom&&o.y+o.h>top;
      const ground=objects.filter(o=>!['cloud','field'].includes(o.kind));
      if(w.icons.some(r=>(left>=r.x&&right<=r.x+r.w&&top>=r.y&&bottom<=r.y+r.h)||
        (r.x>=left&&r.x+r.w<=right&&r.y>=top&&r.y+r.h<=bottom))||
        ground.some(o=>overlaps({x:o.x-o.rx,y:o.y-o.ry,w:o.rx*2,h:o.ry*2})))return false;
      const preferred=Math.max(minRadius,Math.min(maxRadius,(right-left)/2-4,(bottom-top)/(2*squash)-4));
      for(let radius=preferred;radius>=minRadius;radius=Math.max(minRadius,radius-4)){
        const site={x:(left+right)/2,y:(top+bottom)/2,radius,manual:true};
        if(cleared(w,site,ground)&&w.homes.some(h=>w.path(h.door,site,w.free,true).length)){
          this.circle={...site,seed:Math.floor(Math.random()*0x100000000),stage:'forming',since:w.time,crew:[],progress:0,retryAt:0,route:this.visit.route};
          this.visit=null;
          return true;
        }
        if(radius===minRadius)break;
      }
      return false;
    }

    stage(w,stage){Object.assign(this.circle,{stage,since:w.time,readyAt:null});}

    release(w){
      for(const a of w.agents)if(a.game===game){
        w.release(a);
        Object.assign(a,{state:'idle',hidden:false,path:[],target:null,until:0,next:w.time});
      }
    }

    retry(w){
      for(const p of this.circle.patches||[])p.worker=null;
      this.release(w);
      this.stage(w,'waiting');
      Object.assign(this.circle,{crew:[],retryAt:w.time+20});
    }

    update(w,dt,fireflies){
      if(this.visit&&!visitFlight(this.visit,w.time).visible)this.visit=null;
      const c=this.circle;
      if(!c){
        // 用实际推进的世界时间排期，固定光照、午夜或暂停都不补触发。
        this.nextAt??=w.time+(6+Math.random()*8)*3600;
        if(w.time<this.nextAt)return;
        this.nextAt=w.time+45;
        const site=findSite(w,this.objects(w,fireflies));
        if(site)this.circle={...site,seed:Math.floor(Math.random()*0x100000000),stage:'forming',since:w.time,crew:[],progress:0,retryAt:0,route:flightRoute(w)};
        return;
      }
      const elapsed=w.time-c.since;
      if(c.stage==='forming'){
        const objects=this.objects(w,fireflies).filter(o=>!c.manual||o.kind!=='field');
        if(elapsed>=approach&&elapsed-dt<approach&&!cleared(w,c,objects)){
          const pose=flight(c,w.time);
          this.visit={x:pose.x,y:pose.y+23,since:w.time-approach,route:c.route};this.circle=null;return;
        }
        if(elapsed>=approach+carve+departure)this.stage(w,'waiting');
        return;
      }
      if(c.stage==='waiting'){
        if(w.time<c.retryAt)return;
        const remembered=w.agents.find(a=>a.id===c.finder&&human(a)&&!a.game&&!a.task&&a.state!=='lookAround');
        if(remembered){
          if(w.go(remembered,w.home(remembered.home).door,'circleReport',120)){
            remembered.game=game;
            c.crew=[remembered.id];
            this.stage(w,'report');
            return;
          }
          c.finder=null;
        }
        const finder=w.agents.find(a=>human(a)&&!a.hidden&&!a.game&&!a.task&&
          (a.path.length||a.state==='lookAround'&&a.age>=1.2)&&insideFootprint(c,a,37));
        if(!finder)return;
        Object.assign(finder,{game,state:'circleNotice',path:[],target:null,dir:Math.atan2(c.y-finder.y,c.x-finder.x)});
        c.finder=finder.id;
        c.crew=[finder.id];
        this.stage(w,'notice');
        return;
      }

      const crew=c.crew.map(id=>w.agents.find(a=>a.id===id&&a.game===game));
      if(!crew.length||crew.some(a=>!a)){this.retry(w);return;}
      const travelTimeout=Math.max(120,Math.hypot(w.width,w.height)/Math.min(...crew.map(a=>Math.max(1,a.speed)))+90);
      if(elapsed>travelTimeout&&c.stage!=='work'){this.retry(w);return;}
      const [finder]=crew,door=w.home(finder.home).door;
      if(c.stage==='notice'&&elapsed>=2.2){
        if(w.go(finder,door,'circleReport',120))this.stage(w,'report');
        else this.retry(w);
      }else if(c.stage==='report'&&atTarget(finder)){
        c.readyAt??=w.time+1.2;
        if(w.time<c.readyAt)return;
        const helpers=w.agents.filter(a=>a.kind==='adult'&&!a.game&&!a.task&&a.state!=='lookAround')
          .sort((a,b)=>distance(a,door)-distance(b,door)).slice(0,2);
        if(!helpers.length)return;
        for(const a of helpers)a.game=game;
        if(!helpers.every(a=>w.go(a,door,'circleFetch',120))){this.retry(w);return;}
        c.crew.push(...helpers.map(a=>a.id));
        finder.state='circleFetch';
        this.stage(w,'fetch');
      }else if(c.stage==='fetch'){
        for(const a of crew)if(a.state!=='circleInside'){
          if((!a.target||distance(a.target,door)>1)&&!w.go(a,door,'circleFetch',120)){this.retry(w);return;}
          if(atTarget(a))Object.assign(a,door,{state:'circleInside',hidden:true,path:[]});
        }
        if(!crew.every(a=>a.state==='circleInside'))return;
        c.readyAt??=w.time+2;
        if(w.time<c.readyAt)return;
        const spots=[[-.50,0],[.50,0],[0,.44],[0,-.44],[0,0],[-.3,.36],[.3,-.36]]
          .map(([x,y])=>({x:c.x+x*c.radius,y:c.y+y*c.radius}));
        if(sendCrew(w,crew,spots,'circleCarry'))this.stage(w,'carry');
        else this.retry(w);
      }else if(c.stage==='carry'&&crew.every(atTarget)){
        c.patches??=workPatches(c);
        for(const a of crew){a.state='circleCarry';a.path=[];a.target=null;}
        this.stage(w,'work');
        c.lastWorkedAt=w.time;
      }else if(c.stage==='work'){
        c.patches??=workPatches(c);
        c.lastWorkedAt=Number.isFinite(c.lastWorkedAt)?c.lastWorkedAt:w.time;
        if(w.time-c.lastWorkedAt>120){this.retry(w);return;}
        for(const a of crew){
          let patch=c.patches.find(p=>p.worker===a.id&&p.plantedAt===null);
          if(!patch){
            const available=c.patches.filter(p=>p.plantedAt===null&&!p.worker&&
              !c.patches.some(q=>q.worker&&distance(p,q)<18)).sort((p,q)=>distance(a,p)-distance(a,q));
            patch=available.find(p=>w.go(a,{x:p.x-8,y:p.y-1},'circleCarry',120));
            if(patch)patch.worker=a.id;
            else{
              a.state='circleCarry';
              if(available.length){this.retry(w);return;}
              continue;
            }
          }
          const reach=Math.hypot(a.x+8-patch.x,a.y+1-patch.y);
          if(a.path.length||reach>3){
            a.state='circleCarry';
            if(!a.path.length&&!w.go(a,{x:patch.x-8,y:patch.y-1},'circleCarry',120)){this.retry(w);return;}
            continue;
          }
          a.state='circlePlant';a.dir=0;a.path=[];
          c.lastWorkedAt=w.time;
          patch.worked=Math.min(1,patch.worked+dt/1.1);
          if(patch.worked>=1){
            patch.plantedAt=w.time;patch.worker=null;
            a.state='circleCarry';a.target=null;
          }
        }
        c.progress=c.patches.filter(p=>p.plantedAt!==null).length/c.patches.length;
        if(c.patches.every(p=>p.plantedAt!==null&&w.time-p.plantedAt>=growthSeconds)){
          this.release(w);this.circle=null;this.nextAt=null;
        }
      }
    }

    objects(w,fireflies){
      const flies=fireflies?.()||[];
      return selection.objects(w,{daylight:true,night:flies.length>0,fireflies:flies,includeUnlitFireflies:true});
    }

    layout(w){
      if(this.visit&&!this.visit.route)this.visit.route=flightRoute(w);
      const c=this.circle;
      if(!c)return;
      if(c.stage==='forming'&&!c.route)c.route=flightRoute(w);
      if(c.stage==='report'||c.stage==='fetch'){
        const finder=w.agents.find(a=>a.id===c.crew[0]&&a.game===game);
        if(!finder?.target||distance(finder.target,w.home(finder.home).door)>1){this.retry(w);return;}
      }
      for(const a of w.agents)if(a.game===game&&a.target){
        const fieldWork=c.stage==='carry'||c.stage==='work';
        if(!w.walkable(a.target)||!fieldWork&&!w.iconFree(a.target)){this.retry(w);return;}
        if(a.state==='circleInside'){Object.assign(a,a.target,{path:[]});continue;}
        a.path=atTarget(a)?[]:w.path(a,a.target,w.free,fieldWork);
        if(!a.path.length&&!atTarget(a)){this.retry(w);return;}
      }
    }

    owns(a){return !!this.circle&&this.circle.crew.includes(a.id)&&a.game===game&&human(a);}

    snapshot(){return {circle:this.circle,nextAt:this.nextAt,visit:this.visit};}

    restore(data){
      this.nextAt=Number.isFinite(data?.nextAt)&&data.nextAt>=0?data.nextAt:null;
      const visit=data?.visit;
      this.visit=visit&&[visit.x,visit.y,visit.since].every(Number.isFinite)?
        {x:visit.x,y:visit.y,since:visit.since,route:restoredRoute(visit.route)}:null;
      const c=data?.circle;
      if(c&&[c.x,c.y,c.radius,c.since,c.progress,c.retryAt].every(Number.isFinite)&&
        (c.radius>=minRadius&&c.radius<=maxRadius||c.radius>=41&&c.radius<=56)&&
        c.progress>=0&&c.progress<1&&Number.isInteger(c.seed)&&stages.includes(c.stage)&&Array.isArray(c.crew)&&
        c.crew.length<=3&&c.crew.every(id=>typeof id==='string')&&new Set(c.crew).size===c.crew.length){
        this.circle={...c,readyAt:Number.isFinite(c.readyAt)?c.readyAt:null,route:restoredRoute(c.route)};
        if(Array.isArray(c.patches)){
          this.circle.patches=workPatches(c);
          this.circle.patches.forEach((p,i)=>{
            const saved=c.patches[i];
            if(!saved||distance(p,saved)>.01)return;
            p.worked=Number.isFinite(saved.worked)?limit(saved.worked):0;
            p.plantedAt=Number.isFinite(saved.plantedAt)?saved.plantedAt:null;
            p.worker=c.crew.includes(saved.worker)?saved.worker:null;
          });
        }else if(c.progress>0){
          this.circle.patches=workPatches(c);
          this.circle.patches.slice(0,Math.floor(c.progress*this.circle.patches.length)).forEach(p=>{p.worked=1;p.plantedAt=c.since-growthSeconds;});
        }
      }
    }
  }

  Object.assign(CropCircles,{game,squash,pattern,flight,visitFlight,growthSeconds,patchRadius,workPatches,flightRoute});
  if(typeof module!=='undefined'&&module.exports)module.exports=CropCircles;else root.PastoralCropCircles=CropCircles;
})(globalThis);
