/* 框选记录身份。落点按此刻的屏幕位置计算，地面角色仍用各自的脚底坐标。 */
(function(root){
  'use strict';
  const village=typeof module!=='undefined'&&module.exports?require('./pastoral-village.js'):root.PastoralVillage;
  const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

  function butterflyAt(e,i,age){
    const t=age/e.duration,phase=i*2.4+e.seed,rise=Math.min(1,t*6,(1-t)*5);
    const offset=e.offsets?.[i];
    const x=e.x+Math.cos(phase)*(4+16*t)+Math.sin(age*1.9+phase)*6*rise;
    const y=e.y+Math.sin(phase)*(3+11*t)-rise*(6+5*Math.sin(age*1.45+phase));
    return {x:x+(finite(offset)?offset.x:0),y:y+(finite(offset)?offset.y:0)};
  }

  function bounds(parts){
    const left=Math.min(...parts.map(p=>p.x-p.rx)),right=Math.max(...parts.map(p=>p.x+p.rx));
    const top=Math.min(...parts.map(p=>p.y-p.ry)),bottom=Math.max(...parts.map(p=>p.y+p.ry));
    return {x:(left+right)/2,y:(top+bottom)/2,rx:(right-left)/2,ry:(bottom-top)/2};
  }

  function objects(w,extras={}){
    if(!w.free)return [];
    const list=[],f=w.flock,v=w.village;
    function add(kind,key,p,rx,ry,more={}){
      if(!finite(p)||p.x+rx<0||p.x-rx>w.width||p.y+ry<0||p.y-ry>w.height+52)return;
      list.push({id:key==null?kind:kind+':'+key,kind,key,x:p.x,y:p.y,rx,ry,...more});
    }
    function building(kind,key,parts){
      const b=bounds(parts);
      add(kind,key,b,b.rx,b.ry,{parts});
    }
    for(const h of w.homes){
      building('house',h.id,[
        {x:h.x+66,y:h.y+48,rx:48,ry:33},
        {x:h.table.x,y:h.table.y-4,rx:14,ry:12},
        {x:h.kennel.x,y:h.kennel.y-12,rx:13,ry:12}
      ]);
    }
    if(f.site){
      const {fence,kennel}=f.constructor;
      const pen=f.screen({x:(fence.left+fence.right)/2,y:0}),hut=f.screen(kennel);
      const half=(fence.right-fence.left)/2;
      building('fold',null,[{x:pen.x,y:pen.y-4,rx:f.site.vertical?fence.half:half,ry:(f.site.vertical?half:fence.half)+4},
        {x:hut.x,y:hut.y-7,rx:14,ry:13}]);
      for(let i=0;i<f.fields.length;i++)if(f.field(i))add('field',i,f.screen(f.field(i)),61,37);
      for(const [i,s] of f.sheep.entries()){
        const p=f.screen(s),lamb=s.kind==='lamb';
        add('sheep',i,{x:p.x,y:p.y-(lamb?4:6)},lamb?6:9,lamb?4:6,{base:p});
      }
      const dog=f.screen(f.dog);
      add('collie',null,{x:dog.x,y:dog.y-6-(dog.lift||0)},10,7,{base:dog});
    }
    for(const a of w.agents)if(!a.hidden){
      const human=a.kind==='adult'||a.kind==='child',cow=a.kind==='cow';
      const resting=['lawnRest','skywatch','rest','sleep','sit'].includes(a.state);
      const ry=resting?4:a.kind==='adult'?9:a.kind==='child'||cow?7:5;
      add('actor',a.id,{x:a.x,y:a.y-ry},cow?14:human&&!resting?5:9,ry,{base:a});
    }
    for(const torch of w.torches)add('torch',torch.id,{x:torch.x,y:torch.y-7},3,8,{base:torch});
    for(const b of v.birds)add('sparrow',b.index,village.birdAt(b,w.time),5,4);

    function groupBirds(e,kind,token,sample){
      if(!e)return;
      const age=w.time-e.start;
      if(age<0||age>=e.duration)return;
      for(let i=0;i<e.count;i++){
        const p=sample(e,i,age);
        const small=kind==='butterfly'||kind==='pigeon';
        add(kind,token+':'+i,p,small?3:7,small?3:5,{group:e,index:i});
      }
    }
    const natural=v.event;
    if(natural&&extras.daylight){
      if(natural.type==='migration')groupBirds(village.migrationRoute(w,natural),'migrant','n'+natural.start,village.migrantAt);
      else if(natural.type==='butterflies')groupBirds(natural,'butterfly',natural.start,butterflyAt);
    }
    for(const e of v.migrations)groupBirds(village.migrationRoute(w,e),'migrant','c'+(e.uid??e.start),village.migrantAt);
    if(v.pigeons)groupBirds(v.pigeons,'pigeon',v.pigeons.start,village.pigeonAt);
    if(extras.night)for(const [i,fly] of (extras.fireflies||[]).entries()){
      if(fly&&(extras.includeUnlitFireflies||fly.alpha===undefined||fly.alpha>.05))
        add('firefly',i,fly,3,3,{base:{x:fly.baseX??fly.x,y:fly.baseY??fly.y}});
    }
    for(const c of extras.clouds||[]){
      if(c.seed==null||c.grow<.15||!c.circles?.length)continue;
      const g=c.grow*c.grow*(3-2*c.grow);
      let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
      const circles=c.hitCircles||c.circles.map(([x,y,r])=>({x:c.x+x,y:c.y+y,r:r*g}));
      const visible=circles.filter(p=>p.r>2);
      for(const {x,y,r:radius} of visible){
        l=Math.min(l,x-radius);r=Math.max(r,x+radius);t=Math.min(t,y-radius);b=Math.max(b,y+radius);
      }
      if(r>=l)add('cloud',c.seed,{x:(l+r)/2,y:(t+b)/2},(r-l)/2,(b-t)/2,{base:c,circles:visible});
    }
    return list;
  }

  function pick(list,x1,y1,x2,y2){
    if(![x1,y1,x2,y2].every(Number.isFinite))return [];
    const left=Math.min(x1,x2),top=Math.min(y1,y2),right=Math.max(x1,x2),bottom=Math.max(y1,y2);
    function contains(p){
      return p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom;
    }
    function covers(p){
      // 框一只羊或屋檐鸟时，旁边的大块草场和建筑需要更宽的选框。
      return contains(p)&&right-left>=p.rx*.85&&bottom-top>=p.ry*.85;
    }
    return list.filter(o=>{
      if(o.kind==='cloud')return covers(o)&&o.circles.some(c=>{
        const x=Math.max(left,Math.min(c.x,right)),y=Math.max(top,Math.min(c.y,bottom));
        return Math.hypot(x-c.x,y-c.y)<c.r;
      });
      return o.parts?o.parts.some(covers):o.kind==='field'?covers(o):contains(o);
    }).map(o=>o.id);
  }

  function moveField(w,i,target){
    const f=w.flock;
    if(!f.site)return false;
    let to=f.local(target);
    if(!w.openLawn(target)||!(f.homeRoute[f.cell(to)]>=0)){
      let best=null,gap=Infinity;
      for(const j of f.grass){
        const p=w.cellCenter(j),d=(p.x-target.x)**2+(p.y-target.y)**2;
        if(d<gap&&w.openLawn(p)){best=p;gap=d;}
      }
      if(!best)return false;
      to=f.local(best);
    }
    f.fields[i]=to;
    if(i===f.patch){f.fieldRoute=null;if(f.mode==='graze')f.mode='drive';}
    return true;
  }

  function moveSparrow(w,i,target){
    const b=w.village.birds.find(b=>b.index===i);
    if(!b)return false;
    const old=village.birdAt(b,w.time);
    if(old.z<=1&&b.at==='grass'){
      const p=w.nearestWalkable(target);if(!p)return false;
      b.from=b.to={...p,z:0};b.mode='peck';b.duration=1.4;b.arc=0;
    }else{
      b.from={...target,z:old.z};b.mode='fly';
      const d=Math.hypot(b.to.x-target.x,b.to.y-target.y);
      b.duration=Math.max(.7,d/40);b.arc=Math.min(20,d*.24);
      if(d>1)b.side=b.to.x>=target.x?1:-1;
    }
    b.start=w.time;return true;
  }

  function move(w,extras,ids,target){
    if(!Array.isArray(ids)||!finite(target))return 0;
    const wanted=new Set(ids);
    // 在改房屋或羊圈前保留屏幕坐标，这些操作会重建附属设施和局部坐标系。
    const selected=objects(w,extras).filter(o=>wanted.has(o.id)).map(o=>({...o,base:{x:o.base?.x??o.x,y:o.base?.y??o.y}}));
    if(!selected.length)return 0;
    const xs=selected.map(o=>o.x),ys=selected.map(o=>o.y);
    let dx=target.x-(Math.min(...xs)+Math.max(...xs))/2,dy=target.y-(Math.min(...ys)+Math.max(...ys))/2;
    const houses=selected.filter(o=>o.kind==='house').map(o=>o.key),fold=selected.some(o=>o.kind==='fold');
    let moved=0;
    if(houses.length||fold){
      const anchor=()=>houses.length?w.homes.find(h=>h.id===houses[0]):w.flock.site;
      const {x,y}=anchor();
      if(!w.relocateBuildings(houses,fold,dx,dy))return 0;
      const landed=anchor();
      dx=landed.x-x;dy=landed.y-y;
      moved+=houses.length+Number(fold);
    }
    const current=new Map(objects(w,extras).map(o=>[o.id,o]));
    for(const o of selected){
      if(o.kind==='house'||o.kind==='fold')continue;
      const p={x:o.base.x+dx,y:o.base.y+dy},live=current.get(o.id);
      let ok=false;
      switch(o.kind){
        case 'actor':{
          const a=w.agents.find(a=>a.id===o.key);ok=a&&w.relocateResident(a,p);break;
        }
        case 'sheep':case 'collie':ok=w.flock.relocateMember(o.kind==='collie'?-1:o.key,p);break;
        case 'field':ok=moveField(w,o.key,p);break;
        case 'sparrow':ok=moveSparrow(w,o.key,p);break;
        case 'torch':{
          const t=w.torches.find(t=>t.id===o.key),safe=w.nearestWalkable(p);
          if(!t||!safe)break;
          Object.assign(t,safe,{placed:true});ok=true;
          const adult=w.agents.find(a=>a.task?.type==='torch'&&a.task.id===t.id&&a.task.stage==='place');
          if(adult&&!w.go(adult,t,'torch',80)){w.release(adult);adult.path=[];adult.target=null;adult.until=0;}
          break;
        }
        case 'pigeon':case 'migrant':
          if(live)ok=village.moveFlyingBird(live.group,live.index,w.time-live.group.start,p.x-live.x,p.y-live.y);
          break;
        case 'butterfly':{
          if(!live)break;
          const shifts=live.group.offsets??=[],shift=shifts[live.index];
          shifts[live.index]={x:(finite(shift)?shift.x:0)+p.x-live.x,y:(finite(shift)?shift.y:0)+p.y-live.y};
          ok=true;break;
        }
        case 'firefly':{
          const safe=w.nearestWalkable(p);
          if(safe&&extras.fireflyMoves){extras.fireflyMoves[o.key]=safe;ok=true;}break;
        }
        case 'cloud':{
          const c=(extras.clouds||[]).find(c=>c.seed===o.key);
          if(c){c.x=p.x;c.y=p.y;ok=true;}break;
        }
      }
      if(ok)moved++;
    }
    return moved;
  }

  const api={objects,pick,move,butterflyAt};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PastoralSelection=api;
})(globalThis);
