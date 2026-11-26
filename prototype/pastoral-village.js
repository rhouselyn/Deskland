// 院落生活使用世界时钟。只有桌面决定下一步，预览按快照中的路径、动作和相位绘制。
(function(root){
  'use strict';
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const copy=p=>({x:p.x,y:p.y});
  const mix=(a,b,t)=>a+(b-a)*t;
  const face=(a,b)=>{a.dir=Math.atan2(b.y-a.y,b.x-a.x);};
  const daylight=s=>s.altitude>0&&!(s.setting&&s.altitude<8);
  const canMigrate=s=>s.altitude>=-6;
  // Eight headings, measured in scene pixels so a wide screen does not flatten the angle.
  function heading(index){
    return {side:index<4?1:-1,slope:[-.46,-.16,.16,.46][index%4]};
  }
  function nextHeading(previous,rng){
    return previous<0?Math.floor(rng()*8):(previous+1+Math.floor(rng()*7))%8;
  }
  function roostOffset(i,seed){
    const angle=seed+i*2.4,r=Math.sqrt(i)*6.5;
    return {x:Math.cos(angle)*r,y:Math.sin(angle)*r*.72};
  }
  function clearLawn(w,e,x,y){
    for(let i=0;i<e.count;i++){
      const o=roostOffset(i,e.seed);
      if(!w.openLawn({x:x+o.x,y:y+o.y}))return false;
    }
    return true;
  }
  function clearRoost(w,e){return clearLawn(w,e,e.x+e.side*e.stop,e.y+e.slope*e.stop);}
  function migration(w,at,direction,rng,start){
    const {side,slope}=heading(direction),speed=55+rng()*28;
    const distance=(side>0?w.width-at.x:at.x)+180;
    const e={type:'migration',start,x:at.x,y:at.y,side,slope,speed,
      seed:rng()*20,count:8+Math.floor(rng()*7),shape:Math.floor(rng()*3),stop:0,rest:0};
    if(rng()<.30){
      for(let i=0;i<12;i++){
        e.stop=distance*(.20+rng()*.50);
        if(clearRoost(w,e)){e.rest=10+rng()*12;break;}
      }
    }
    e.duration=distance/speed+e.rest+2;
    return e;
  }
  function startMigration(w,direction,rng,start){
    const {side,slope}=heading(direction),margin=70;
    const at={x:side>0?-margin:w.width+margin,y:w.height*(.33+rng()*.34)-slope*(w.width/2+margin)};
    return migration(w,at,direction,rng,start);
  }
  function migrationRoute(w,e){
    if(!Number.isFinite(e.x)){
      const span=w.width+280;
      Object.assign(e,{x:e.side>0?-100:w.width+100,y:w.height*(e.lane-.115)+26,
        speed:span/e.duration,slope:w.height*.23/span,shape:0,rest:0,stop:0});
    }
    return e;
  }
  function recheckRoost(w,e,age){
    if(!e?.rest||clearRoost(w,e))return;
    const arrival=e.stop/e.speed;
    // If already on the ground, start taking off from the current pose.
    const rest=age<arrival-2.5?0:Math.min(e.rest,Math.max(.05,age-arrival));
    e.duration-=e.rest-rest;e.rest=rest;
  }
  function migrantPose(e,i,age){
    const t=Math.max(0,age-i*.075),row=Math.ceil(i/2),wing=i%2?1:-1;
    const beat=t*3+i*1.7+e.seed;
    let travel=t*e.speed,fold=0;
    if(e.rest){
      const arrival=e.stop/e.speed,departure=arrival+e.rest;
      const approach=Math.max(0,Math.min(1,(t-arrival+2.5)/2.5));
      const lift=Math.max(0,Math.min(1,(t-departure)/2.5));
      fold=approach*(2-approach)*(1-lift*lift);
      if(t<arrival)travel=e.stop+(travel-e.stop)*(1-approach*.8);
      else travel=e.stop+Math.max(0,t-departure)*e.speed*(.2+.8*lift);
    }
    const back=e.shape===1?i*9:e.shape===2?row*13+(i%2)*5:row*13;
    const across=e.shape===1?i*4.5:e.shape===2?wing*8:wing*row*6;
    const perch=fold?roostOffset(i,e.seed):{x:0,y:0},altitude=26*(1-fold);
    if(fold===1)return {x:e.x+e.side*e.stop+perch.x,y:e.y+e.slope*e.stop+perch.y,
      altitude:0,grounded:true,flap:0};
    return {x:e.x+e.side*travel+mix(-e.side*back,perch.x,fold),
      y:e.y+e.slope*travel+mix(across+Math.sin(beat*.49)*1.6,perch.y,fold)-altitude,
      altitude,grounded:fold>.992,flap:Math.sin(beat*.43)>.3?1:Math.round((1+Math.sin(beat))*1.5)};
  }
  const unit=t=>Math.max(0,Math.min(1,t));
  const ease=t=>t*t*(3-2*t);
  function movedOffset(move,age){
    const t=unit((age-move.age)/move.duration),remaining=1-ease(t);
    return {x:move.x*remaining,y:move.y*remaining,lift:move.lift*remaining+Math.sin(Math.PI*t)*Math.min(22,move.duration*2)};
  }
  function moveFlyingBird(group,i,age,dx,dy){
    if(!group||!Number.isInteger(i)||i<0||i>=group.count||![age,dx,dy].every(Number.isFinite))return false;
    const moves=group.moves??=[],old=moves[i]?movedOffset(moves[i],age):{x:0,y:0,lift:0};
    const x=old.x+dx,y=old.y+dy;
    moves[i]={x,y,lift:old.lift,age,duration:Math.max(2,Math.hypot(x,y)/95)};
    group.duration=Math.max(group.duration,age+moves[i].duration);
    return true;
  }
  function movedPose(e,i,age,p){
    const move=e.moves?.[i];
    if(move&&age<move.age+move.duration){
      const o=movedOffset(move,age);
      p.x+=o.x;p.y+=o.y-o.lift;p.altitude+=o.lift;
      if(o.lift>.15){p.grounded=false;p.flap=Math.floor(age*6+i)%4;}
      if(Math.abs(o.x)>20)p.side=-Math.sign(o.x);
    }
    return p;
  }
  function migrantAt(e,i,age){
    const p=migrantPose(e,i,age);p.side=e.side;return movedPose(e,i,age,p);
  }
  function startPigeons(w,rng=Math.random){
    // 鸽群的完整航线写进快照，取样不消耗居民和家犬的行为随机序列。
    const side=rng()<.5?1:-1;
    const e={type:'pigeons',start:w.time,count:48+Math.floor(rng()*25),stagger:.18,side,seed:rng()*6.28,legs:[],duration:0};
    // 屋顶落脚点只保存一份，各轮航线轮换使用。
    e.roofs=w.homes.map(h=>({id:h.id,x:h.x,y:h.y}));
    e.roosts=[];
    if(w.homes.length){
      const core=root.PastoralCore||(typeof module!=='undefined'?require('./pastoral-world.js'):null);
      for(let slot=0;slot<32&&e.roosts.length<e.count;slot++)for(const h of w.homes){
        if(e.roosts.length>=e.count)break;
        const along=.5+(slot%8)*.88,n=.32+Math.floor(slot/8)*.5,chimney=h.id===1?1.35:5.7;
        if(along>chimney-.2&&along<chimney+.73&&n>core.farm.depth/2-.85)continue;
        const z=core.farm.wall+n/(core.farm.depth/2)*(core.farm.ridge-core.farm.wall);
        const p=core.farmPoint(h,along,n,z),altitude=z*core.farm.meter*Math.SQRT1_2;
        if(w.iconFree&&!w.iconFree(p))continue;
        const round=v=>Math.round(v*100)/100;
        e.roosts.push({x:round(p.x),y:round(p.y+altitude),z:round(altitude)});
      }
    }
    const margin=Math.sqrt(e.count)*6.5+20;
    let from={x:side>0?-margin:w.width+margin,y:w.height*(.25+rng()*.5),z:32};
    const addLeg=(to,rest,turns,radius,roof=false)=>{
      const flight=Math.max(12,dist(from,to)/65)+turns*5.5;
      e.legs.push({from,to,flight,rest,turns,radius,roof,roofShift:Math.floor(rng()*e.count)});
      e.duration+=flight+rest;from=to;
    };
    const stops=8+Math.floor(rng()*3);
    for(let n=0;n<stops;n++){
      let to;
      for(let j=0;j<40;j++){
        const candidate={x:w.width*(.16+rng()*.68),y:w.height*(.18+rng()*.66)};
        if(clearLawn(w,e,candidate.x,candidate.y)){to={...candidate,z:0};break;}
      }
      if(!to){if(!e.legs.length)return null;to={...from};}
      addLeg(to,14+rng()*12,3+Math.floor(rng()*2),90+rng()*65,!!e.roosts.length&&n%3!==1);
    }
    addLeg({x:side>0?w.width+70:-70,y:w.height*(.23+rng()*.54),z:36},0,0,0);
    e.duration+=(e.count-1)*e.stagger;
    return e;
  }
  function pigeonLanding(e,leg,i){
    if(leg.roof&&i<(e.roosts?.length||0))return e.roosts[(i+(leg.roofShift||0))%e.roosts.length];
    const o=roostOffset(i,e.seed);
    return {x:leg.to.x+o.x,y:leg.to.y+o.y,z:leg.to.z};
  }
  function triggerBirds(w,direction,rng=Math.random){
    const v=w.village;
    if(rng()<.5){
      if(v.pigeons)return null;
      const e=startPigeons(w,rng);
      if(e){e.triggered=true;v.pigeons=e;}
      return e;
    }
    if(v.migrations.length>=3)return null;
    const e=startMigration(w,direction,rng,w.time);
    e.uid=Math.floor(rng()*0x100000000);v.migrations.push(e);
    return e;
  }
  function pigeonPose(e,i,age){
    let time=Math.max(0,age-i*(e.stagger??.11));
    let leg=e.legs[0],previous=null;
    for(const next of e.legs){
      leg=next;
      if(time<=leg.flight+leg.rest||leg===e.legs[e.legs.length-1])break;
      time-=leg.flight+leg.rest;
      previous=leg;
    }
    const o=roostOffset(i,e.seed),t=unit(time/leg.flight),to=pigeonLanding(e,leg,i);
    const from=previous?pigeonLanding(e,previous,i):{x:leg.from.x+o.x,y:leg.from.y+o.y,z:leg.from.z};
    if(t===1)return {x:to.x,y:to.y-to.z,altitude:to.z,
      grounded:leg.rest>0,side:e.side,flap:0};
    const transit=leg.turns ? .48 : 1,travel=unit(t/transit),s=ease(travel);
    const wave=Math.sin(t*Math.PI),envelope=wave*wave;
    const orbit=unit((t-.22)/.68),angle=Math.PI*2*leg.turns*e.side;
    const spin=ease(orbit)*angle+e.seed+i*.045;
    const xArc=leg.radius*Math.cos(spin),yArc=leg.radius*.58*Math.sin(spin);
    const speedX=6*travel*(1-travel)*(to.x-from.x)/transit+Math.PI*Math.sin(t*Math.PI*2)*xArc-
      envelope*leg.radius*Math.sin(spin)*6*orbit*(1-orbit)*angle/.68;
    const altitude=mix(from.z,to.z,s)+envelope*(36+7*Math.sin(spin+i));
    return {x:mix(from.x,to.x,s)+envelope*xArc,
      y:mix(from.y,to.y,s)+envelope*yArc-altitude,altitude,
      side:Math.sign(speedX)||e.side,grounded:false,flap:Math.floor(age*6+i)%4};
  }
  function pigeonAt(e,i,age){
    let p;
    if(e.exit&&age>=e.exit.age){
      const t=unit((age-e.exit.age)/e.exit.flight),s=ease(t),a=e.exit.from[i];
      const altitude=mix(a.altitude,36,s)+Math.sin(Math.PI*t)*12;
      p={x:mix(a.x,e.exit.x+e.side*i*2,s),y:a.y+a.altitude-altitude+e.side*16*s,
        altitude,grounded:t===0&&a.grounded,side:e.side,flap:Math.floor(age*6+i)%4};
    }else p=pigeonPose(e,i,age);
    return movedPose(e,i,age,p);
  }
  function departPigeons(w,e){
    const age=w.time-e.start;
    const from=Array.from({length:e.count},(_,i)=>pigeonAt(e,i,age));
    const x=e.side>0?w.width+70:-70,flight=Math.max(4,...from.map(p=>Math.abs(x-p.x)/85));
    e.exit={age,from,x,flight};e.duration=age+flight;delete e.moves;
  }
  function recheckPigeons(w,e){
    if(!e||e.exit)return;
    const age=w.time-e.start;
    if(e.roofs?.some(old=>!w.homes.some(h=>h.id===old.id&&h.x===old.x&&h.y===old.y))||
      e.roosts?.some(p=>w.iconFree&&!w.iconFree({x:p.x,y:p.y-p.z}))){
      departPigeons(w,e);return;
    }
    let end=0;
    for(const leg of e.legs){
      end+=leg.flight+leg.rest;
      if(!leg.rest||age>end+(e.count-1)*(e.stagger??.11)||clearLawn(w,e,leg.to.x,leg.to.y))continue;
      // 草地被图标或房屋占用时，从每只鸽子当前所处的位置提前起飞离场。
      departPigeons(w,e);
      return;
    }
  }
  const games=['fetch','chase','tug','recall'];
  const canPlay=(w,a)=>!a.hidden&&!a.game&&!a.task&&!w.mealDue(a,w.solar)&&a.fatigue<.75&&
    ['idle','sit','wander','chat','watch'].includes(a.state);
  function wait(w,a,state,seconds){
    a.state=state;a.path=[];a.target=null;a.age=0;a.until=w.time+seconds;
  }
  function nearby(w,origin,min,max){
    for(let i=0;i<15;i++){
      const angle=w.rng()*2*Math.PI,r=min+(max-min)*w.rng(),p={x:origin.x+Math.cos(angle)*r,y:origin.y+Math.sin(angle)*r};
      if(w.walkable(p)&&w.iconFree(p))return p;
    }
    return null;
  }
  function arena(w,h,type){
    const a=nearby(w,h.kennel,18,53);
    if(!a)return null;
    // 两端都留出人和狗并排站立的位置，沿途留出追逐、球和布绳的空间。
    for(let i=0;i<12;i++){
      const angle=w.rng()*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle);
      const length=type==='tug'?11:35+w.rng()*20;
      const b={x:a.x+dx*length,y:a.y+dy*length},offset={x:-dy*11,y:dx*11};
      if([0,.2,.4,.6,.8,1].every(t=>[0,1].every(k=>{
        const p={x:mix(a.x,b.x,t)+offset.x*k,y:mix(a.y,b.y,t)+offset.y*k};
        return w.walkable(p)&&w.iconFree(p);
      })))return {a,b,offset};
    }
    return null;
  }
  const beside=(g,p)=>({x:p.x+g.offset.x,y:p.y+g.offset.y});
  function startPlay(w,dog,type){
    const pool=w.agents.filter(a=>a.home===dog.home&&['child','adult'].includes(a.kind)&&canPlay(w,a))
      .sort((a,b)=>dist(a,dog)-dist(b,dog));
    let people=pool.slice(0,1);
    if(type==='chase')people=pool.filter(a=>a.kind==='child').slice(0,1);
    if(type==='tug')people=pool.filter(a=>a.kind==='adult').slice(0,1);
    if(type==='recall')people=['adult','child'].map(kind=>pool.find(a=>a.kind===kind));
    if(!people.length||people.some(a=>!a||dist(a,dog)>285))return null;
    const h=w.home(dog.home),field=arena(w,h,type);
    if(!field)return null;
    const g={...field,type,home:dog.home,homeX:h.x,homeY:h.y,people:people.map(a=>a.id),stage:'gather',since:w.time,end:w.time+55,round:0};
    const actors=[dog,...people],positions=[beside(g,g.a),g.a,g.b];
    const paths=actors.map((a,i)=>w.path(a,positions[i],w.yardRoutes));
    if(paths.some(path=>!path.length))return null;
    actors.forEach((a,i)=>{
      a.game='yard-'+dog.home;a.target=positions[i];a.path=paths[i];a.state='meetDog';a.hidden=false;
    });
    return g;
  }
  function advancePlay(w,g,dog,people){
    const [person,other]=people,elapsed=w.time-g.since;
    const stage=name=>{g.stage=name;g.since=w.time;};
    const move=(a,p)=>w.go(a,p,'petRun',30,w.yardRoutes);
    const arrived=(a,p)=>dist(a,p)<4&&!a.path.length;
    const partner=g.round%2?person:other;
    const end=g.round%2?g.a:g.b;
    if(w.time>=g.end||people.some(a=>a.hidden||a.task||w.mealDue(a,w.solar)||a.fatigue>=.75))return false;
    switch(g.stage){
      case 'gather':
        if(!arrived(dog,beside(g,g.a))||!arrived(person,g.a)||other&&!arrived(other,g.b))break;
        g.end=w.time+24+w.rng()*9;
        stage('invite');face(person,dog);face(dog,person);break;
      case 'invite':
        if(elapsed<2)break;
        if(g.type==='fetch'){face(person,g.b);face(dog,g.b);stage('throw');}
        if(g.type==='chase'){if(!move(person,end))return false;stage('lead');}
        if(g.type==='tug'){face(person,dog);face(dog,person);stage('pull');}
        if(g.type==='recall'){face(partner,dog);if(!move(dog,beside(g,end)))return false;stage('call');}
        break;
      case 'throw':
        if(elapsed>.7){if(!move(dog,g.b))return false;stage('retrieve');}break;
      case 'retrieve':
        if(arrived(dog,g.b)&&elapsed>1.1){if(!move(dog,beside(g,g.a)))return false;stage('carry');}break;
      case 'carry':
        if(arrived(dog,beside(g,g.a))){face(dog,person);face(person,dog);stage('give');}break;
      case 'give':
        if(elapsed>3){if(++g.round>=3)return false;stage('invite');}break;
      case 'lead':
        if(elapsed>.65){if(!move(dog,beside(g,end)))return false;stage('follow');}break;
      case 'follow':
        if(arrived(person,end)&&arrived(dog,beside(g,end))){
          const over={x:end.x+g.offset.x*1.55,y:end.y+g.offset.y*1.55};
          if(w.walkable(over)&&w.iconFree(over))move(dog,over);
          face(person,dog);stage('turn');
        }break;
      case 'turn':
        if(elapsed>1.7&&!dog.path.length){face(dog,person);g.round++;stage('invite');}break;
      case 'pull':
        if(elapsed>10){const back={x:g.a.x+g.offset.x*1.65,y:g.a.y+g.offset.y*1.65};
          if(w.walkable(back)&&w.iconFree(back))move(dog,back);
          stage('win');
        }break;
      case 'win':
        if(!dog.path.length)face(dog,person);
        if(elapsed>4)return false;break;
      case 'call':
        if(arrived(dog,beside(g,end))){face(dog,partner);face(partner,dog);stage('pat');}break;
      case 'pat':
        if(elapsed>2.4){g.round++;stage('invite');}break;
    }
    return true;
  }
  function birdAt(b,time){
    const t=Math.min(1,Math.max(0,(time-b.start)/b.duration));
    const flying=b.mode==='fly',arc=flying?Math.sin(t*Math.PI)*b.arc:0;
    const hop=b.mode==='hop'?Math.abs(Math.sin(t*Math.PI*2))*2.2:0;
    return {x:mix(b.from.x,b.to.x,t),y:mix(b.from.y,b.to.y,t)-arc-hop,
      z:mix(b.from.z,b.to.z,t)+arc+hop};
  }
  function birdAction(w,b,mode,to,duration,at){
    b.from=birdAt(b,w.time);b.to=to;b.mode=mode;b.at=at;b.start=w.time;b.duration=duration;
    b.arc=mode==='fly'?Math.min(20,dist(b.from,to)*.24):0;
    if(Math.abs(to.x-b.from.x)>1)b.side=Math.sign(to.x-b.from.x);
  }
  const perch=(h,key,i)=>({...h[key],x:h[key].x+(i%2?2.1:-2.1)});
  function updateBird(w,b,h,day){
    const i=b.index;
    const fly=(to,at)=>birdAction(w,b,'fly',to,Math.max(.7,dist(birdAt(b,w.time),to)/40),at);
    if(!day&&b.at!=='nest'){b.twig=false;fly(perch(h,'nest',i),'nest');return;}
    if(b.mode==='peck'||b.mode==='hop'){
      if(w.time>=b.alertAt){
        b.alertAt=w.time+.27;
        if(w.agents.some(a=>(a.kind==='dog'||a.kind==='child')&&!a.hidden&&a.path.length&&dist(a,b.to)<25)){
          b.twig=false;fly(perch(h,'ridge',i),'ridge');return;
        }
      }
    }
    if(w.time<b.start+b.duration)return;
    const stay=(mode,seconds)=>birdAction(w,b,mode,b.to,seconds,b.at);
    if(!day){stay('sleep',25);return;}
    if(b.mode==='fly'){
      if(b.at==='grass')stay('peck',2+w.rng()*2);
      else if(b.at==='nest'){stay(b.twig?'weave':'perch',5+w.rng()*8);b.twig=false;}
      else stay('preen',3+w.rng()*6);
    }else if(b.at==='grass'){
      if(b.mode==='hop'||b.hops>=2||w.rng()<.35){
        b.twig=true;fly(perch(h,'nest',i),'nest');
      }else{const p=nearby(w,b.to,3,8);if(p){b.hops++;birdAction(w,b,'hop',{...p,z:0},.72,'grass');}else stay('peck',2);}
    }else if(b.at==='nest'){
      fly(perch(h,'ridge',i),'ridge');
    }else{
      const p=nearby(w,h.kennel,18,58);
      if(p){b.hops=0;fly({...p,z:0},'grass');}else stay('preen',5);
    }
  }
  function validEvent(e){
    return e&&Number.isInteger(e.count)&&e.count>0&&e.count<=14&&Number.isFinite(e.start)&&Number.isFinite(e.duration)&&e.duration>0&&Number.isFinite(e.seed)&&
      (e.type==='migration'&&Math.abs(e.side)===1&&(Number.isFinite(e.lane)||
        point(e)&&Number.isFinite(e.slope)&&Number.isFinite(e.speed)&&e.speed>0&&Number.isFinite(e.stop)&&Number.isFinite(e.rest)&&[0,1,2].includes(e.shape))||
        e.type==='butterflies'&&point(e));
  }
  function validPigeons(e){
    const waypoint=p=>point(p)&&Number.isFinite(p.z);
    return e&&e.type==='pigeons'&&Math.abs(e.side)===1&&Number.isInteger(e.count)&&e.count>0&&e.count<=72&&
      (e.stagger==null||Number.isFinite(e.stagger)&&e.stagger>=0&&e.stagger<=.3)&&
      Number.isFinite(e.start)&&Number.isFinite(e.seed)&&Number.isFinite(e.duration)&&e.duration>0&&
      Array.isArray(e.legs)&&e.legs.length>=3&&e.legs.length<=11&&e.legs.every(l=>l&&waypoint(l.from)&&waypoint(l.to)&&
        [l.flight,l.rest,l.radius,l.turns].every(Number.isFinite)&&l.flight>0&&l.rest>=0&&
        (l.roof==null||typeof l.roof==='boolean')&&(l.roofShift==null||Number.isInteger(l.roofShift)&&l.roofShift>=0&&l.roofShift<e.count))&&
      (e.roofs==null||Array.isArray(e.roofs)&&e.roofs.length<=3&&e.roofs.every(h=>point(h)&&Number.isInteger(h.id)))&&
      (e.roosts==null||Array.isArray(e.roosts)&&e.roosts.length<=e.count&&e.roosts.every(waypoint))&&
      (!e.exit||Number.isFinite(e.exit.age)&&Number.isFinite(e.exit.x)&&Number.isFinite(e.exit.flight)&&e.exit.flight>0&&
        Array.isArray(e.exit.from)&&e.exit.from.length===e.count&&e.exit.from.every(p=>point(p)&&Number.isFinite(p.altitude)));
  }
  function restoreMoves(e){
    if(e?.moves)e.moves=Array.isArray(e.moves)?e.moves.slice(0,e.count).map(m=>point(m)&&
      [m.lift,m.age,m.duration].every(Number.isFinite)&&m.duration>0?m:null):[];
    return e;
  }
  class Village{
    constructor(){
      this.plays=[];this.birds=[];this.event=null;this.eventIn=null;this.butterflyUntil=0;this.lookAt=0;
      this.migrations=[];this.pigeons=null;this.pigeonIn=null;
    }
    layout(w){
      this.birds=w.homes.flatMap(h=>[0,1].map(i=>{
        const index=h.id*2+i,old=this.birds.find(b=>b.index===index);
        if(old&&old.homeX===h.x&&old.homeY===h.y&&(old.at!=='grass'||w.walkable(old.to)&&w.iconFree(old.to)))return old;
        const p=perch(h,'nest',i);
        return {index,homeX:h.x,homeY:h.y,from:p,to:p,mode:'perch',at:'nest',arc:0,side:i?1:-1,start:w.time,duration:2+index*4,alertAt:0,twig:false};
      }));
      this.plays=this.plays.filter(g=>{
        const actors=this.actors(w,g);
        const h=w.home(g.home);
        return h&&h.x===g.homeX&&h.y===g.homeY&&actors&&actors.every(a=>a.game==='yard-'+g.home)&&
          [g.a,g.b,beside(g,g.a),beside(g,g.b)].every(p=>w.walkable(p)&&w.iconFree(p));
      });
      for(const a of w.agents)if(a.game?.startsWith('yard-')&&!this.plays.some(g=>a.game==='yard-'+g.home))this.free(w,a);
      if(this.event?.type==='butterflies'&&!w.openLawn(this.event))this.event=null;
      if(this.event?.type==='migration')recheckRoost(w,migrationRoute(w,this.event),w.time-this.event.start);
      for(const e of this.migrations)recheckRoost(w,migrationRoute(w,e),w.time-e.start);
      recheckPigeons(w,this.pigeons);
    }
    actors(w,g){
      const dog=w.agents.find(a=>a.kind==='dog'&&a.home===g.home),people=g.people.map(id=>w.agents.find(a=>a.id===id&&a.home===g.home));
      return dog&&people.every(a=>a&&['adult','child'].includes(a.kind))?[dog,...people]:null;
    }
    free(w,a){
      a.game=null;wait(w,a,'idle',0);a.next=w.time;
      if(a.kind==='dog')a.playAt=w.time+60+w.rng()*60;
    }
    chooseDog(w,dog,s){
      const h=w.home(dog.home),go=(p,state)=>p&&w.go(dog,p,state,30,w.yardRoutes);
      if(!daylight(s)){
        if(dist(dog,h.kennel)<4){wait(w,dog,'curl',45);return;}
        if(!go(h.kennel,'toKennel'))wait(w,dog,'sniff',4);
        return;
      }
      if(dog.asleep){dog.asleep=false;wait(w,dog,'stretch',2);return;}
      const family=w.agents.filter(a=>a.home===dog.home&&['adult','child'].includes(a.kind)&&!a.hidden);
      if(!dog.greeted&&family.length){
        const closest=family.sort((a,b)=>dist(a,dog)-dist(b,dog))[0];
        if(dist(dog,closest)<150&&go(nearby(w,closest,9,16),'greet')){dog.greeted=true;return;}
      }
      const roll=w.rng();
      if(roll<.2&&family.length&&dist(dog,family[0])<125&&go(nearby(w,family[0],11,21),'greet'))return;
      if(roll<.7&&go(nearby(w,h.kennel,8,65),'roam'))return;
      wait(w,dog,roll>.85?'curl':'sniff',4+w.rng()*9);
    }
    update(w,dt,s){
      if(dt<=0)return;
      const day=daylight(s),migrationLight=canMigrate(s);
      this.plays=this.plays.filter(g=>{
        const actors=this.actors(w,g);
        if(actors&&day&&actors.every(a=>a.game==='yard-'+g.home)&&advancePlay(w,g,actors[0],actors.slice(1)))return true;
        for(const a of actors||[])if(a.game==='yard-'+g.home)this.free(w,a);
        return false;
      });
      for(const d of w.agents)if(d.kind==='dog'){
        if(!day){d.greeted=false;d.asleep=d.state==='curl';continue;}
        if(d.game||d.state==='stretch'||w.time<d.playAt)continue;
        d.playAt=w.time+8+w.rng()*12;
        const first=Math.floor(w.rng()*games.length);
        for(let i=0;i<games.length;i++){
          const g=startPlay(w,d,games[(first+i)%games.length]);
          if(g){this.plays.push(g);break;}
        }
      }
      for(const b of this.birds)updateBird(w,b,w.home(b.index>>1),day);
      if(this.pigeons&&w.time>=this.pigeons.start+this.pigeons.duration)this.pigeons=null;
      if(!day&&this.pigeons&&!this.pigeons.exit)departPigeons(w,this.pigeons);
      for(let i=this.migrations.length-1;i>=0;i--){
        const e=this.migrations[i];
        if(!migrationLight||w.time>=e.start+e.duration)this.migrations.splice(i,1);
      }
      if(day){
        this.pigeonIn??=100+Math.random()*160;
        if(!this.pigeons&&(this.pigeonIn-=dt)<=0){
          this.pigeons=startPigeons(w);
          this.pigeonIn=180+Math.random()*240;
        }
      }else{
        if(this.event?.type==='butterflies')this.event=null;
        this.butterflyUntil=0;
      }
      if(!migrationLight){this.event=null;return;}
      if(this.event&&w.time-this.event.start>=this.event.duration)this.event=null;
      this.eventIn??=360+w.rng()*240;
      this.eventIn-=dt;
      if(this.eventIn<=0){
        this.eventIn=360+w.rng()*240;
        if(w.rng()<.33){
          this.event=startMigration(w,nextHeading(-1,w.rng),w.rng,w.time);
          const child=day&&w.agents.find(a=>a.kind==='child'&&canPlay(w,a));
          if(child)wait(w,child,'birdwatch',9);
        }else if(day)this.butterflyUntil=w.time+25;
      }
      // 惊蝶要等脚步真正经过草地。在这次机会内，每秒看一次附近的孩子和狗。
      if(!day||w.time>=this.butterflyUntil||w.time<this.lookAt)return;
      this.lookAt=w.time+1;
      const walker=w.agents.find(a=>(a.kind==='dog'||a.kind==='child')&&a.path.length&&!a.hidden&&w.openLawn(a));
      if(!walker)return;
      this.butterflyUntil=0;
      this.event={type:'butterflies',...copy(walker),start:w.time,duration:8+w.rng()*4,count:3+Math.floor(w.rng()*3),seed:w.rng()*20};
      // 从实际起飞时刻开始冷却，下一场事件至少间隔六分钟。
      this.eventIn=Math.max(360,this.eventIn);
      if(walker.kind==='dog'&&!walker.game){
        const p=nearby(w,walker,8,15);
        if(p)w.go(walker,p,'butterfly',10,w.yardRoutes);
      }
    }
    snapshot(){return {plays:this.plays,birds:this.birds,event:this.event,eventIn:this.eventIn,butterflyUntil:this.butterflyUntil,
      migrations:this.migrations,pigeons:this.pigeons,pigeonIn:this.pigeonIn};}
    restore(v){
      if(!v)return;
      const bp=p=>point(p)&&Number.isFinite(p.z);
      this.birds=(Array.isArray(v.birds)?v.birds:[]).slice(0,6).filter(b=>b&&Number.isInteger(b.index)&&bp(b.from)&&bp(b.to)&&Number.isFinite(b.start)&&b.duration>0&&Number.isFinite(b.arc));
      this.plays=(Array.isArray(v.plays)?v.plays:[]).slice(0,3).filter(g=>g&&games.includes(g.type)&&point(g.a)&&point(g.b)&&point(g.offset)&&Array.isArray(g.people)&&g.people.length===(g.type==='recall'?2:1)&&Number.isFinite(g.end)&&Number.isFinite(g.since));
      this.event=validEvent(v.event)?restoreMoves(v.event):null;
      this.migrations=(Array.isArray(v.migrations)?v.migrations:[]).slice(0,3).filter(e=>validEvent(e)&&e.type==='migration').map(restoreMoves);
      this.pigeons=validPigeons(v.pigeons)?restoreMoves(v.pigeons):null;
      this.pigeonIn=Number.isFinite(v.pigeonIn)?Math.max(0,Math.min(420,v.pigeonIn)):null;
      this.eventIn=Number.isFinite(v.eventIn)?Math.max(0,Math.min(600,v.eventIn)):null;
      this.butterflyUntil=Number.isFinite(v.butterflyUntil)?v.butterflyUntil:0;
    }
  }
  Village.birdAt=birdAt;Village.daylight=daylight;
  Object.assign(Village,{canMigrate,heading,nextHeading,migration,startMigration,migrationRoute,migrantAt,recheckRoost,pigeonAt,moveFlyingBird,triggerBirds});
  if(typeof module!=='undefined'&&module.exports)module.exports=Village;else root.PastoralVillage=Village;
})(globalThis);
