/* 本主题的画布合成、太阳和宿主连接。模拟只由桌面实例推进，预览只读快照。 */
let pastoralScene=null;
let pastoralSettings={...PastoralLight.defaults};
const pastoralSolar = PastoralLight.solar;
function createPastoralScene() {
  const world=new PastoralCore.World(73519),layer=document.createElement('canvas'),ctx=layer.getContext('2d');
  const lights=document.createElement('canvas'),lc=lights.getContext('2d'),cache=new Map();
  let cacheBytes=0;
  const lampLayer=document.createElement('canvas'),lampContext=lampLayer.getContext('2d');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let fireflies=[],fireflyMoves=[],flyRevision=-1;
  const flockGaits=[];
  let meteorBursts=[],meteorPaths=[],lastClick=-Infinity,lastSpawn=-Infinity,clickHeading=-1,vertical=false;
  let selection=null,lastMarks=-Infinity,editRevision=0,lastEventTick=performance.now();
  const marks=document.getElementById('selectionMarks');
  const texture=gl.createTexture(),lightTexture=gl.createTexture(),cropTexture=gl.createTexture(),airTexture=gl.createTexture();
  const cropRect=new Float32Array(4),cropTiming=new Float32Array(2);
  const airRect=new Float32Array(4),airLayer=document.createElement('canvas'),airContext=airLayer.getContext('2d');
  function setup(t){gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));}
  setup(texture);setup(lightTexture);setup(cropTexture);setup(airTexture);
  const textureSizes=new Map();
  function uploadCanvas(t,c){
    gl.bindTexture(gl.TEXTURE_2D,t);
    const size=textureSizes.get(t);
    if(size&&size[0]===c.width&&size[1]===c.height)
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,c);
    else{
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
      textureSizes.set(t,[c.width,c.height]);
    }
  }
  let location=pastoralSettings.location||null,solar=pastoralSolar(new Date(),location),lastDraw=-Infinity,lastSun=-Infinity,lastSend=0,lastSave=-Infinity,snapshotReceived=false,layoutAt=0,signature='',loaded=false,override=null;
  const clock={realTime:pastoralSettings.realTime===0?0:1,fixedTime:Number.isFinite(pastoralSettings.fixedTime)?pastoralSettings.fixedTime:720};
  let reschedule=false;
  const paint=PastoralLight.blend({},solar.palette,1);
  const host=window.chrome?.webview,authoritative=!PREVIEW;
  function send(m){if(host&&WALL)host.postMessage(m);}
  function snapshot(){
    const clouds=skyClouds.map(({x,y,seed,grow,dying})=>({x,y,seed,grow,dying:!!dying}));
    return {...world.snapshot(),clouds,meteorBursts,fireflyMoves,editRevision};
  }
  function rebuildMeteorPaths(){
    meteorPaths=meteorBursts.flatMap(b=>{
      const paths=PastoralCore.meteorBatch(b.slot,b.seed,{...PastoralVillage.heading(b.direction),vertical:b.vertical},b.start);
      b.end=Math.max(...paths.map(p=>p.start+p.flight+p.linger));
      return paths;
    });
  }
  function pruneMeteors(){
    if(meteorBursts.some(b=>world.time>=b.end||solar.altitude>=-6)){
      meteorBursts=meteorBursts.filter(b=>world.time<b.end&&solar.altitude< -6);
      rebuildMeteorPaths();
    }
  }
  function syncPreviewGesture(now){
    if(!paused)return;
    // While the wallpaper is covered, the preview keeps playing. Preserve the ages of
    // its click-triggered flyovers across edits without advancing the sleeping village.
    const elapsed=Math.max(0,now-lastEventTick)/1000;
    lastEventTick=now;
    for(const e of world.village.migrations)e.start-=elapsed;
    if(world.village.pigeons)world.village.pigeons.start-=elapsed;
    world.village.migrations=world.village.migrations.filter(e=>world.time<e.start+e.duration);
    if(meteorBursts.length){
      for(const b of meteorBursts)b.start-=elapsed;
      rebuildMeteorPaths();pruneMeteors();
    }
  }
  function restoreScenery(s){
    editRevision=Number.isSafeInteger(s.editRevision)?s.editRevision:0;
    const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
    fireflyMoves=(Array.isArray(s.fireflyMoves)?s.fireflyMoves:[]).slice(0,18).map(p=>validPoint(p)?{x:p.x,y:p.y}:null);
    const bursts=(Array.isArray(s.meteorBursts)?s.meteorBursts:[]).slice(0,3).filter(b=>b&&
      Number.isFinite(b.start)&&Number.isInteger(b.seed)&&Number.isInteger(b.slot)&&
      Number.isInteger(b.direction)&&b.direction>=0&&b.direction<8&&typeof b.vertical==='boolean');
    if(JSON.stringify(bursts)!==JSON.stringify(meteorBursts)){meteorBursts=bursts;rebuildMeteorPaths();}
    if(Array.isArray(s.clouds)){
      const previous=new Map(skyClouds.map(c=>[c.seed,c]));
      const next=s.clouds.slice(0,24).filter(c=>validPoint(c)&&Number.isInteger(c.seed)&&
        Number.isFinite(c.grow)&&c.grow>=0&&c.grow<=1).map(c=>{
          const cloud=previous.get(c.seed)||makeSkyCloud(c.x,c.seed);
          Object.assign(cloud,{x:c.x,y:c.y,grow:c.grow,dying:!!c.dying});return cloud;
        });
      skyClouds.splice(0,skyClouds.length,...next);
    }
  }
  function receive(m){
    if(m.t==='reset'){clock.realTime=PastoralLight.defaults.realTime;clock.fixedTime=PastoralLight.defaults.fixedTime;lastSun=-Infinity;override=null;reschedule=true;}
    if(m.t==='settings'&&m.v){
      if(m.v.clickEffects===0){
        if(world.village.pigeons?.triggered)world.village.pigeons=null;
        world.village.migrations.length=0;meteorBursts=[];meteorPaths=[];lastClick=lastSpawn=lastDraw=-Infinity;clickHeading=-1;
      }
      for(const key of ['realTime','fixedTime']){const v=m.v[key];if((key==='realTime'?(v===0||v===1):Number.isInteger(v)&&v>=0&&v<=1439)&&clock[key]!==v){clock[key]=v;lastSun=-Infinity;override=null;reschedule=true;}}
    }
    if(m.t==='world'&&m.v&&(PREVIEW||!loaded)){
      const old=world.signature,site=world.flock.site,incoming=m.v.flock?.site,previousDog=world.flock.dog,oldEdit=editRevision;
      const samePen=site&&incoming&&['x','y','sign','vertical'].every(k=>site[k]===incoming[k]);
      const sameLayout=PREVIEW&&world.free&&(samePen||!site&&!incoming)&&
        world.homes.length===m.v.homes?.length&&world.homes.every((h,i)=>{const other=m.v.homes[i];return other&&h.id===(other.id??i)&&h.x===other.x&&h.y===other.y;});
      if(world.restore(m.v)){
        restoreScenery(m.v);
        if(sameLayout&&oldEdit===editRevision&&snapshotReceived&&previousDog&&world.flock.dog&&PastoralCore.distance(previousDog,world.flock.dog)<100){
          world.flock.previewDog=world.flock.dog;world.flock.dog=previousDog;
        }
        snapshotReceived=true;loaded=true;lastDraw=-Infinity;
        if(PREVIEW)reschedule=false;
        if(sameLayout)world.signature=old;
        else{signature='';layoutAt=-1;}
      }
    }
    if(m.t==='settings'&&m.v?.location){const p=m.v.location;if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180){location=p;lastSun=-Infinity;}}
    if(m.t==='worldReset'&&authoritative){clearSelection();meteorBursts=[];meteorPaths=[];fireflyMoves=[];world.homes=[];world.agents=[];world.torches=[];world.games=[];world.flock=new PastoralFlock();world.village=new PastoralVillage();world.cropCircles=new PastoralCropCircles();world.signature='';signature='';loaded=true;}
  }
  if(PREVIEW)addEventListener('message',e=>{if(e.source===parent){try{receive(typeof e.data==='string'?JSON.parse(e.data):e.data);}catch{}}});
  else if(host){host.addEventListener('message',e=>{try{receive(JSON.parse(e.data));}catch{}});send('world-load');}
  else {try{const raw=localStorage.getItem('deskland-pastoral-demo');if(raw){const s=JSON.parse(raw);if(world.restore(s))restoreScenery(s);}}catch{}}
  function shade(p){
    const x=p.x-solar.shadow[0],y=p.y-solar.shadow[1];
    const gx=Math.floor(x/CELL_G)+4,gy=Math.floor(y/CELL_G)+4;
    if(circBuf&&gx>=0&&gy>=0&&gx<cgW&&gy<cgH){for(let i=0;i<36;i++){const j=((gy*cgW+gx)*36+i)*4,r=circBuf[j+2];if(r>0&&Math.hypot(x-circBuf[j],y-circBuf[j+1])<r)return true;}}
    return curS(x,y)<0;
  }
  function update(now,dt){
    if(now-lastSun>1000){solar=pastoralSolar(override||PastoralCore.worldDate(new Date(),clock,location?.zone),location);lastSun=now;}
    PastoralLight.blend(paint,solar.palette,dt===0?1:1-Math.exp(-Math.min(dt,.25)*6));
    const sig=JSON.stringify([W,H,P.sigma,icons.map(i=>[i.x,i.y,i.w,i.h])]);
    if(sig!==signature){if(layoutAt===0)layoutAt=now+450;if(dt===0||now>=layoutAt){world.layout(W,H,icons,P.sigma);signature=sig;layoutAt=0;lastDraw=-Infinity;}}
    if(!world.free)return;
    if(dt>0)lastEventTick=now;
    if(meteorBursts.length)pruneMeteors();
    if(reschedule){for(const a of world.agents){if(a.game===PastoralCropCircles.game)continue;world.release(a);a.until=0;a.next=0;a.path=[];a.target=null;}world.games=[];world.village.plays=[];for(const t of world.torches)t.lit=PastoralCore.lampsDue(solar);lastDraw=-Infinity;reschedule=false;}
    // 休眠恢复不补跑所有帧；重新评估作息并补齐已错过的点灯任务。
    if(dt>.09&&world.solar&&Math.abs(world.solar.altitude-solar.altitude)>5){for(const a of world.agents)if(a.game!==PastoralCropCircles.game){a.until=0;a.path=[];}for(const t of world.torches)t.lit=PastoralCore.lampsDue(solar);}
    if(authoritative||!host&&!snapshotReceived)world.update(dt,solar,shade,true,visibleFireflies);
    else world.update(dt,solar,shade,false);
    if(authoritative&&now-lastSend>1000){lastSend=now;send('world-state|'+JSON.stringify(snapshot()));}
    if(authoritative&&now-lastSave>60000){lastSave=now;save();}
  }
  function save(){if(!world.free)return;const raw=JSON.stringify(snapshot());if(host&&WALL)send('world-save|'+raw);else if(!PREVIEW){try{localStorage.setItem('deskland-pastoral-demo',raw);}catch{}}}
  addEventListener('pagehide',save);
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
  function line(c,x,y,xx,yy,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
  function sprite(key,w,h,draw){
    let c=cache.get(key);
    if(c)cache.delete(key);
    else{
      c=document.createElement('canvas');c.width=w*2;c.height=h*2;
      const g=c.getContext('2d');g.scale(2,2);draw(g);cacheBytes+=c.width*c.height*4;
    }
    cache.set(key,c);
    // Keep recent poses, without accumulating every animation state all day.
    while(cacheBytes>32*1024*1024&&cache.size>1){
      const oldest=cache.keys().next().value,image=cache.get(oldest);
      cacheBytes-=image.width*image.height*4;cache.delete(oldest);image.width=image.height=0;
    }
    return c;
  }
  const {farm,farmPoint}=PastoralCore,models=PastoralModels;
  const roadSoil='rgba(224,196,146,.44)';
  let roadPath,roadRevision=-1;
  let circleTile=null;
  function drawCropCircle(scale){
    const c=world.cropCircles.circle;
    if(!c){circleTile=null;cropRect[2]=0;return;}
    const {pattern,flight,squash}=PastoralCropCircles;
    const width=Math.ceil((c.radius+4)*2),height=Math.ceil((c.radius*squash+4)*2);
    if(!circleTile||circleTile.seed!==c.seed||circleTile.radius!==c.radius||circleTile.scale!==scale){
      const image=document.createElement('canvas');image.width=Math.ceil(width*scale);image.height=Math.ceil(height*scale);
      const g=image.getContext('2d');
      g.setTransform(image.width/width,0,0,image.height/height,image.width/2,image.height/2);
      g.lineCap='round';g.lineJoin='round';
      const {strokes}=pattern(c.seed,PastoralCore.random);
      g.strokeStyle='#fff';
      for(const stroke of strokes){
        const path=new Path2D();
        const points=stroke.points.map(([x,y])=>[x*c.radius,y*c.radius]);
        points.forEach(([x,y],i)=>path[i?'lineTo':'moveTo'](x+.63*Math.sin(y*1.37),y+.55*Math.sin(x*1.09)));
        g.lineWidth=stroke.width*c.radius+.7;g.stroke(path);
      }
      // 先合并笔画，交叉点也只铺一层村间小路的土色。
      g.resetTransform();g.globalCompositeOperation='source-in';
      g.fillStyle=roadSoil;g.fillRect(0,0,image.width,image.height);
      const restored=document.createElement('canvas');restored.width=image.width;restored.height=image.height;
      circleTile={seed:c.seed,radius:c.radius,scale,image,restored,growthKey:null};
    }
    const planted=(c.patches||[]).filter(p=>p.plantedAt!==null);
    const {growthSeconds,patchRadius}=PastoralCropCircles;
    const growthKey=planted.map(p=>[p.x,p.y,Math.min(40,Math.floor((world.time-p.plantedAt)/growthSeconds*40))].join('/')).join(',');
    if(circleTile.growthKey!==growthKey){
      circleTile.growthKey=growthKey;
      const {image,restored}=circleTile,g=restored.getContext('2d');
      g.resetTransform();g.globalCompositeOperation='source-over';g.clearRect(0,0,restored.width,restored.height);
      g.drawImage(image,0,0);
      g.setTransform(image.width/width,0,0,image.height/height,image.width/2,image.height/2);
      g.globalCompositeOperation='destination-out';
      for(const p of planted){
        const age=Math.max(0,world.time-p.plantedAt),growth=Math.min(1,age/growthSeconds);
        const x=p.x-c.x,y=p.y-c.y;
        const fade=g.createRadialGradient(x,y,patchRadius*.85,x,y,patchRadius);
        fade.addColorStop(0,`rgba(0,0,0,${growth})`);fade.addColorStop(1,'transparent');
        g.fillStyle=fade;g.fillRect(x-patchRadius,y-patchRadius,patchRadius*2,patchRadius*2);
      }
      gl.activeTexture(gl.TEXTURE13);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);uploadCanvas(cropTexture,restored);
    }
    const pose=c.stage==='forming'?flight(c,world.time):null;
    cropRect[0]=c.x-width/2;cropRect[1]=c.y-height/2;cropRect[2]=width;cropRect[3]=height;
    cropTiming[0]=pose?.trace??1;cropTiming[1]=c.progress;
  }
  function drawAlienGround(pose){
    if(!pose?.visible)return;
    const x=pose.x,y=pose.y,groundY=pose.groundY;
    ellipse(ctx,x,groundY,11,3,'rgba(41,46,60,.19)');
    if(pose.beam>0){
      ctx.globalAlpha=pose.beam;
      models.polygon(ctx,[{x:x-3,y:y+1},{x:x+3,y:y+1},{x:x+8,y:groundY+1},{x:x-8,y:groundY+1}],'#d7f9df6b');
      ellipse(ctx,x,groundY,8,2.8,'#c5f9d69e');
      ctx.globalAlpha=1;
    }
  }
  function drawAlien(g,pose){
    const x=pose.x,y=pose.y;
    const ship=sprite('crop-circle-ship',32,19,g=>{
      ellipse(g,16,11,13,4.4,'#3d5262');ellipse(g,16,9.6,13,3.1,'#9cacb5');
      ellipse(g,16,7,6,3.8,'#d3ece4');ellipse(g,16,7.2,3.6,2.5,'#82bcb7');
      ellipse(g,16.6,7.3,1.65,1.65,'#507d78');ellipse(g,17.2,7,0.5,0.45,'#d1ffda');
      for(const xx of [7,11,16,21,25])ellipse(g,xx,11.3,.95,.6,'#d1ffda');
    });
    g.drawImage(ship,x-16,y-10,32,19);
    if(pose.dots){
      ellipse(g,x,y-23,12,7,'#f3f1dd');
      models.polygon(g,[{x:x-3,y:y-18},{x:x-2,y:y-13},{x:x+3,y:y-18}],'#f3f1dd');
      for(let i=0;i<pose.dots;i++)ellipse(g,x+(i-(pose.dots-1)/2)*4,y-23,1,1,'#52634f');
    }
  }
  function drawAir(scale){
    const {circle,visit}=world.cropCircles,poses=[];
    if(circle?.stage==='forming')poses.push(PastoralCropCircles.flight(circle,world.time));
    if(visit)poses.push(PastoralCropCircles.visitFlight(visit,world.time));
    const visible=poses.filter(p=>p.visible&&p.x>=-36&&p.x<=W+36&&p.y>=-12&&p.y<=H+36);
    if(!visible.length){airRect[2]=0;return poses;}
    const left=Math.min(...visible.map(p=>p.x))-18,top=Math.min(...visible.map(p=>p.y))-32;
    const width=Math.max(...visible.map(p=>p.x))+18-left,height=Math.max(...visible.map(p=>p.y))+12-top;
    const pw=Math.ceil(width*scale-1e-6),ph=Math.ceil(height*scale-1e-6);
    if(airLayer.width!==pw||airLayer.height!==ph){airLayer.width=pw;airLayer.height=ph;}
    airContext.resetTransform();airContext.clearRect(0,0,pw,ph);
    airContext.setTransform(pw/width,0,0,ph/height,-left*pw/width,-top*ph/height);
    for(const pose of visible)drawAlien(airContext,pose);
    airRect.set([left,top,width,height]);
    gl.activeTexture(gl.TEXTURE14);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);uploadCanvas(airTexture,airLayer);
    return poses;
  }
  function drawFarm(key,h,drawModel){
    const im=sprite(key,farm.w,farm.h,drawModel);
    ctx.drawImage(im,h.x,h.y,farm.w,farm.h);
  }
  function playPose(a,g){
    if(a.path.length)return 'stand';
    if(!g)return a.state;
    if(a.kind==='dog'){
      if(g.stage==='pull')return 'pull';
      if(g.stage==='retrieve'||g.stage==='give')return 'sniff';
      return g.stage==='gather'?'stand':'wag';
    }
    if(g.type==='recall'){
      const caller=g.people[g.round%2?0:1];
      if(a.id!==caller)return 'stand';
      return g.stage==='pat'?'pet':g.stage==='gather'?'stand':'beckon';
    }
    if(g.stage==='pull')return 'pull';
    if(g.stage==='throw')return 'throw';
    if(g.stage==='give')return 'pet';
    if(g.stage==='invite'||g.stage==='call')return 'beckon';
    return 'stand';
  }
  function tugOffset(a,g){
    if(g?.stage!=='pull')return {x:0,y:0};
    const pull=(1-Math.cos((world.time-g.since)*2.3))*1.15;
    return {x:-Math.cos(a.dir)*pull,y:-Math.sin(a.dir)*pull*.7};
  }
  function actor(a,now){
    const heading=a.heading??(Math.round(a.dir/(Math.PI/4))+8)%8,child=a.kind==='child';
    if(a.kind==='sheep'||a.kind==='lamb'||a.kind==='collie'){
      const dog=a.kind==='collie',moving=dog?Math.hypot(a.vx,a.vy)>2.7:a.state==='walk'||a.state==='wander';
      const step=moving?a.step:0;
      const pose=a.lift>2?'bound':a.state==='rest'&&!moving?'rest':a.state==='graze'?'graze':dog&&a.state!=='watch'?'work':'stand';
      const im=sprite([a.kind,a.style,heading,step,pose].join('/'),40,32,c=>{
        if(dog)models.collie(c,heading,step,pose);
        else models.sheep(c,heading,step,pose,a.kind==='lamb',a.style);
      });
      ctx.drawImage(im,a.x-20,a.y-22,40,32);return;
    }
    const moving=a.path.length>0,game=a.game&&world.village.plays.find(g=>a.game==='yard-'+g.home);
    const shift=tugOffset(a,game);
    if(a.kind==='dog'){
      const pose=playPose(a,game),step=moving||pose==='wag'||pose==='pull'?Math.floor(world.time*(pose==='wag'?7:5))%4:0;
      const im=sprite(['dog',a.style,heading,step,pose].join('/'),40,32,c=>models.yardDog(c,a.style,heading,step,pose));
      ctx.drawImage(im,a.x+shift.x-20,a.y+shift.y-22,40,32);return;
    }
    const step=moving?Math.floor(now/(child?117:a.kind==='cow'?210:163)+a.style)%4:0;
    let pose='stand';
    if(a.kind==='cow'){
      if(['sleep','rest','shade'].includes(a.state))pose='rest';
      else if(a.state==='graze')pose='graze';
    }else if(!moving&&(a.state==='lawnRest'||a.state==='skywatch'))pose=Math.round(4*PastoralCore.reclineAmount(a,world.time));
    else if(game)pose=playPose(a,game);
    else if(a.state==='birdwatch'||a.state==='lookAround'||a.state==='circleNotice')pose='look';
    else if(!moving&&['sit','eat','exploreRest'].includes(a.state))pose='sit';
    else if(['water','sweep','repair','kite','torch','circleCarry','circlePlant'].includes(a.state))pose='tool';
    const key=[a.kind,a.style,heading,step,pose].join('/');
    const im=sprite(key,40,32,c=>{
      if(a.kind==='cow')models.cow(c,a.style,heading,step,pose);
      else models.person(c,a.style,heading,step,pose,child);
    });
    ctx.drawImage(im,a.x+shift.x-20,a.y+shift.y-22,40,32);
    const side=Math.cos(a.dir)>=0?1:-1,x=a.x+side*3,y=a.y-(child?5:7);
    if(a.state==='kite'){
      const tip={x:x+23+Math.sin(now/1400)*5,y:y-39};
      line(ctx,x,y,tip.x,tip.y,'#766d648c',.6);
      models.polygon(ctx,[{x:tip.x,y:tip.y-4.5},{x:tip.x+4,y:tip.y},{x:tip.x,y:tip.y+6},{x:tip.x-4,y:tip.y}],'#ed8358');
      models.polygon(ctx,[{x:tip.x,y:tip.y-4.5},{x:tip.x+4,y:tip.y},{x:tip.x,y:tip.y+6}],'#ffe1a0');
      line(ctx,tip.x,tip.y+6,tip.x+1.7,tip.y+9,'#ae6654',.7);
    }
    if(a.state==='water'){
      ellipse(ctx,x+side,y,2.3,1.8,'#789990');line(ctx,x+side,y,x+side*4,y-1.4,'#54766d',1);
      if(!moving)for(let j=0;j<3;j++)ellipse(ctx,x+side*(4+j),y+j+Math.sin(now/200),.5,.78,'#c6e4dc');
    }
    if(a.state==='sweep'||a.state==='repair'){
      line(ctx,x,y-2,x+side*2,y+6,'#876849',.94);
      if(a.state==='sweep')ellipse(ctx,x+side*2,y+6,1.7,1.1,'#c49b60');
    }
    if(a.state==='circleCarry'||a.state==='circlePlant'){
      const work=a.state==='circlePlant'&&!moving,swing=work?Math.sin(world.time*4+a.style)*3:0;
      const xx=x+side*(5+swing),yy=y+(work?8:2);
      line(ctx,x-side*2,y-4,xx,yy,'#7e5536',1.3);
      line(ctx,xx-2.1,yy+1,xx+2.1,yy-1,'#d1b18a',1.1);
      for(let j=-2;j<=2;j+=2)line(ctx,xx+j,yy-j*.4,xx+j,yy-j*.4+1.8,'#7b6951',.72);
      if(work)for(let j=0;j<3;j++){
        const t=(world.time*1.6+a.style*.21+j*.13)%1;
        ellipse(ctx,x+side*(1+11*t),a.y+1-4*Math.sin(Math.PI*t),.6,.4,'#c2a974');
      }
    }
    if(a.state==='torch'){line(ctx,x,y+3,x,y-5,'#755236',1.2);ellipse(ctx,x,y-6,1.36,2.3,'#ffcb65');}
  }
  function shadowTip(height){
    return {x:solar.shadow[0]*height*.074,y:solar.shadow[1]*height*.074};
  }
  function farmShadow(h){
    const {length:l,depth:d,ridge,wall}=farm,tip=shadowTip(wall),peak=shadowTip(ridge);
    const base=[[0,0],[l,0],[l,d],[0,d]].map(([e,n])=>farmPoint(h,e,n));
    const points=[...base,...base.map(p=>({x:p.x+tip.x,y:p.y+tip.y})),...[0,l].map(e=>{
      const p=farmPoint(h,e,d/2);return {x:p.x+peak.x,y:p.y+peak.y};
    })].sort((a,b)=>a.x-b.x||a.y-b.y);
    const half=arr=>{const hull=[];for(const p of arr){while(hull.length>=2){
      const a=hull[hull.length-2],b=hull[hull.length-1];
      if((b.x-a.x)*(p.y-a.y)>(b.y-a.y)*(p.x-a.x))break;hull.pop();
    }hull.push(p);}hull.pop();return hull;};
    models.polygon(ctx,[...half(points),...half(points.reverse())],shadowColor);
  }
  let shadowColor='';
  function actorShadow(a){
    if(a.kind==='sheep'||a.kind==='lamb'||a.kind==='collie'||a.kind==='dog'){
      const size=a.kind==='sheep'?1:.65,tip=shadowTip((a.state==='rest'?.32:.74)*size);
      ctx.save();ctx.translate(a.x+tip.x*.6,a.y+tip.y*.6);ctx.rotate(a.dir);
      ellipse(ctx,0,0,6.5*size,2.7*size,shadowColor);ctx.restore();return;
    }
    const cow=a.kind==='cow',child=a.kind==='child',lean=PastoralCore.reclineAmount(a,world.time);
    const height=cow?(['rest','sleep','shade'].includes(a.state)?.55:1.25):(child?farm.child:farm.adult)*(1-.84*lean);
    const tip=shadowTip(height);
    ctx.save();ctx.translate(a.x,a.y);
    if(cow){
      const dx=Math.cos(a.dir),dy=Math.sin(a.dir);
      ellipse(ctx,0,0,3.3,1.85,'rgba(40,41,42,.14)');
      // 前后蹄到躯干的投影相连，转向时牛影也转向。
      for(const offset of [-6,5.5])line(ctx,dx*offset,dy*offset,dx*offset+tip.x*.7,dy*offset+tip.y*.7,shadowColor,1.55);
      ctx.translate(tip.x*.75,tip.y*.75);ctx.rotate(a.dir);
      ellipse(ctx,0,0,dy*dy> .5?7.4:10.8,3.55,shadowColor);
    }else{
      ctx.translate(tip.x/2,tip.y/2);ctx.rotate(Math.atan2(tip.y,tip.x));
      ellipse(ctx,0,0,Math.max(2,Math.hypot(tip.x,tip.y)/2),child?1.15:1.7,shadowColor);
      if(lean>.05){
        ctx.rotate(a.dir-Math.atan2(tip.y,tip.x));
        ellipse(ctx,0,0,(child?6:9)*lean,child?1.5:2.2,shadowColor);
      }
    }
    ctx.restore();
  }
  function windows(h){const evening=solar.altitude<6,bedtime=22*60+10+h.id*17;const late=solar.minute>=bedtime||solar.minute<5*60;return [evening&&(!late||h.id===0),evening&&solar.minute<bedtime-10&&solar.minute>=5*60];}
  function yardProps(g){
    if(g.stage==='gather')return;
    const dog=world.agents.find(a=>a.kind==='dog'&&a.home===g.home);
    const person=world.agents.find(a=>a.id===g.people[0]);
    if(!dog||!person)return;
    const age=world.time-g.since,lean=tugOffset(person,g),pull=tugOffset(dog,g);
    const hand={x:person.x+lean.x+Math.cos(person.dir)*3.8,y:person.y+lean.y+Math.sin(person.dir)*2-(person.kind==='child'?6:9)};
    const mouth={x:dog.x+pull.x+Math.cos(dog.dir)*7,y:dog.y+pull.y+Math.sin(dog.dir)*5-4.4};
    if(g.type==='fetch'){
      let p=hand;
      if(g.stage==='throw'||g.stage==='retrieve'){
        const t=Math.min(1,(age+(g.stage==='retrieve'?.7:0))/1.15);
        p={x:hand.x+(g.b.x-hand.x)*t,y:hand.y+(g.b.y-hand.y)*t-18*Math.sin(Math.PI*t)};
        if(t===1)p.y-=Math.max(0,1-(age-.45)*2)*Math.abs(Math.sin((age-.45)*8))*3;
      }else if(g.stage==='carry')p=mouth;
      else if(g.stage==='give')p={x:(mouth.x+person.x)/2,y:dog.y-1.3};
      ellipse(ctx,p.x,p.y,2.25,2.15,'#aa4b2c');ellipse(ctx,p.x-.32,p.y-.55,1.6,1.25,'#f9a546');
    }else if(g.type==='tug'){
      const pulling=g.stage==='pull',won=g.stage==='win';
      const x1=won?mouth.x-6:hand.x,y1=won?mouth.y+3:hand.y+2;
      const x2=pulling||won?mouth.x:x1+4,y2=pulling||won?mouth.y:y1+4;
      line(ctx,x1,y1,x2,y2,'#b74e48',1.8);
      for(const t of [.18,.55,.87])ellipse(ctx,x1+(x2-x1)*t,y1+(y2-y1)*t,.85,.78,'#ffe0ae');
    }
  }
  function daylightEvent(e,age,shadows){
    const t=age/e.duration;
    if(t<0||t>=1)return;
    if(e.type==='migration'){
      PastoralVillage.migrationRoute(world,e);
      for(let i=0;i<e.count;i++){
        const {x,y,altitude,flap,grounded,side}=PastoralVillage.migrantAt(e,i,age);
        if(shadows){ellipse(ctx,x-altitude*.5,y+altitude+1,4.5,1.4,'rgba(45,56,53,.15)');continue;}
        if(grounded){
          const peck=Math.sin(age*2+i*1.7)>.7;
          const bird=sprite('resting-goose'+peck,18,14,c=>{
            ellipse(c,8,9,4.8,2.4,'#615f54');ellipse(c,7,8.5,3.4,1.4,'#817c69');
            const h=peck?10:4;line(c,11,8,13,h,'#494c49',1.8);
            ellipse(c,13.4,h,1.5,1.2,'#404744');line(c,14,h,16,h+.4,'#c8ad77',.9);
          });
          ctx.save();ctx.translate(x,y);ctx.scale(side,1);ctx.drawImage(bird,-9,-11,18,14);ctx.restore();continue;
        }
        const im=sprite('migrant'+flap,22,22,c=>{
          const tip=[1,3,6,8][flap];
          models.polygon(c,[{x:5,y:11},{x:9,y:9},{x:5,y:tip},{x:11,y:7},{x:13,y:10},{x:18,y:10.4},{x:17,y:11.5},{x:12,y:12},{x:6,y:20-tip},{x:8,y:12}],'#4f5753');
          line(c,12,10.6,16.5,10.5,'#d4cbb1',1.1);
        });
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan(side*e.slope));ctx.scale(side,1);ctx.drawImage(im,-11,-11,22,22);ctx.restore();
      }
    }else if(e.type==='pigeons'){
      // 在米制比例上放大约三成，让成群的白鸽在桌面尺寸下更清晰。
      const scale=farm.meter*.46/14;
      for(let i=0;i<e.count;i++){
        const {x,y,side,flap,grounded,altitude}=PastoralVillage.pigeonAt(e,i,age);
        if(shadows){if(!grounded||altitude<1)ellipse(ctx,x-altitude*.35,y+altitude+.4,3.6*scale,1.3*scale,'rgba(51,54,60,.16)');continue;}
        const pale=i%4!==0,peck=grounded&&Math.sin(age*2.6+i)>.62;
        const im=sprite(['pigeon',pale,grounded?peck?'peck':'rest':flap].join('/'),20,30,c=>{
          c.translate(0,5);
          const body=pale?'#e2dfd3':'#9da9b2',wing=pale?'#c8c6bd':'#798898';
          line(c,3,11,8,10,'#515d6b',2.4);
          if(!grounded){
            const tip=[-3,1,5,8][flap];
            models.polygon(c,[{x:7,y:10},{x:2,y:tip},{x:8,y:tip+1},{x:13,y:10}],wing);
            models.polygon(c,[{x:7,y:10},{x:4,y:19-tip*.4},{x:10,y:14},{x:13,y:10}],body);
          }
          ellipse(c,9,10,4.6,2.6,body);
          if(grounded){ellipse(c,8,9.8,3.4,1.65,wing);line(c,8,12,7.6,13.6,'#986b68',.8);}
          const hy=peck?11:7;ellipse(c,12.6,hy+1.2,1.9,2.2,pale?body:'#648781');
          ellipse(c,14,hy,2,1.7,body);line(c,15.6,hy,17,hy+.5,'#524f4e',.8);
          ellipse(c,14.6,hy-.3,.45,.45,'#333936');
        });
        ctx.save();ctx.translate(x,y);ctx.scale(side,1);ctx.drawImage(im,-10*scale,-16*scale,20*scale,30*scale);ctx.restore();
      }
    }else if(!shadows){
      for(let i=0;i<e.count;i++){
        const phase=i*2.4+e.seed,{x,y}=PastoralSelection.butterflyAt(e,i,age);
        const wing=.55+1.35*Math.abs(Math.sin(age*13+phase));
        ellipse(ctx,x-wing*.65,y-.6,wing,1.65,i%2?'#fff0bd':'#f5be6f');
        ellipse(ctx,x+wing*.65,y+.38,wing,1.25,i%2?'#f5d584':'#e69c5b');ellipse(ctx,x,y,.42,.95,'#715941');
      }
    }
  }
  function drawDayEvents(shadows){
    const {event,pigeons,migrations}=world.village;
    if(event&&(event.type==='migration'?PastoralVillage.canMigrate(solar):PastoralVillage.daylight(solar)))daylightEvent(event,world.time-event.start,shadows);
    if(pigeons)daylightEvent(pigeons,world.time-pigeons.start,shadows);
    for(const e of migrations)daylightEvent(e,world.time-e.start,shadows);
  }
  function triggerEvent(now){
    if(!P.clickEffects||powerSaving()||reducedMotion.matches||!world.free)return;
    if(now-lastClick>=8000){
      clickHeading=PastoralVillage.nextHeading(clickHeading,Math.random);
      vertical=Math.random()<.23;
    }
    lastClick=now;
    const night=solar.altitude< -6;
    if(now-lastSpawn<400||(night&&meteorBursts.length>=3))return;
    lastSpawn=now;
    if(night){
      meteorBursts.push({slot:Math.floor(Math.random()*8),seed:Math.floor(Math.random()*0x100000000),
        start:world.time,direction:clickHeading,vertical});
      rebuildMeteorPaths();
    }else{
      if(!PastoralVillage.triggerBirds(world,clickHeading))return;
    }
    lastDraw=-Infinity;
    if(WALL)send('world-state|'+JSON.stringify(snapshot()));
  }
  function visibleFireflies(){
    if(paint.night<=.4)return [];
    if(flyRevision!==world.revision){flyRevision=world.revision;fireflies=world.fireflySpots();}
    const t=reducedMotion.matches?0:world.time;
    return fireflies.map((f,i)=>{
      const base=fireflyMoves[i]&&world.walkable(fireflyMoves[i])?fireflyMoves[i]:f;
      const p={x:base.x+Math.sin(t/2.7+f.phase)*8,y:base.y+Math.sin(t/3.4+f.phase)*6};
      return {...(world.walkable(p)?p:base),baseX:base.x,baseY:base.y,
        alpha:Math.max(0,Math.sin(t/1.4+f.phase))**2*(paint.night-.4)*1.5};
    });
  }
  function extras(){
    return {night:paint.night>.4,daylight:PastoralVillage.canMigrate(solar),
      fireflies:visibleFireflies(),clouds:skyClouds,fireflyMoves};
  }
  function clearSelection(){selection=null;marks.replaceChildren();}
  function markSelection(now,objects){
    if(!selection?.size||now-lastMarks<125)return;
    lastMarks=now;
    const visible=(objects||PastoralSelection.objects(world,extras())).filter(o=>selection.has(o.id));
    while(marks.children.length>visible.length)marks.lastChild.remove();
    visible.forEach((o,i)=>{
      const el=marks.children[i]||marks.appendChild(document.createElement('i'));
      Object.assign(el.style,{left:(o.x-o.rx-2)+'px',top:(o.y-o.ry-2)+'px',
        width:(o.rx*2+4)+'px',height:(o.ry*2+4)+'px'});
    });
  }
  function selectBox(x,y,x2,y2){
    clearSelection();
    if(![x,y,x2,y2].every(Number.isFinite))return;
    const left=Math.min(x,x2),right=Math.max(x,x2),top=Math.min(y,y2),bottom=Math.max(y,y2);
    const objects=PastoralSelection.objects(world,extras());
    selection=new Set(PastoralSelection.pick(objects,x,y,x2,y2));
    // 混合框选仍交给资源管理器；空白框选允许擦到图标边缘。
    if(selection.size&&icons.some(ic=>ic.x<right&&ic.x+ic.w>left&&ic.y<bottom&&ic.y+ic.h>top)){
      clearSelection();return;
    }
    if(!selection.size&&!PREVIEW){
      world.cropCircles.summon(world,x,y,x2,y2,objects);
      lastDraw=-Infinity;save();
    }
    lastMarks=-Infinity;markSelection(performance.now(),objects);
  }
  function moveSelection(ids,target){
    if(!world.free||!PastoralSelection.move(world,extras(),ids,target))return;
    editRevision++;lastDraw=-Infinity;save();
  }
  function clickAt(x,y,now){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=W||y>=H||icons.some(ic=>PastoralCore.inside({x,y},ic)))return;
    if(selection!==null){
      const ids=Array.from(selection);clearSelection();
      if(ids.length){
        if(pastoralPreviewHosted)parent.postMessage(JSON.stringify({t:'moveSelection',ids,x:x/W,y:y/H}),'*');
        else moveSelection(ids,{x,y});
      }
      return;
    }
    if(!P.clickEffects||paused||powerSaving()||reducedMotion.matches)return;
    if(pastoralPreviewHosted)parent.postMessage(JSON.stringify({t:'triggerEvent'}),'*');
    else triggerEvent(now);
  }
  function drawBird(b,p){
    const rate=b.mode==='fly'?9:b.mode==='peck'?2:1;
    const frame=Math.floor(world.time*rate+b.index)%4;
    const im=sprite(['sparrow',b.mode,frame,b.twig].join('/'),16,16,c=>models.sparrow(c,b.mode,frame,b.twig));
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(b.side,1);ctx.drawImage(im,-8,-9,16,16);ctx.restore();
  }
  function draw(now){
    if(!world.free)return;
    const ambientTime=reducedMotion.matches?0:now;
    const scale=cv._scale,box=cv.getBoundingClientRect(),pw=Math.round(box.width*scale),ph=Math.round(box.height*scale);
    const airPoses=drawAir(scale);
    if(layer.width!==pw||layer.height!==ph){layer.width=pw;layer.height=ph;lastDraw=-Infinity;}
    // 局部精灵预绘入缓存，世界层 15Hz 上传；草地和云继续以 30fps 绘制。
    if(now-lastDraw<65&&layer.width===pw&&layer.height===ph)return;lastDraw=now;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,W,H);
    shadowColor='rgba('+paint.shadow.map(v=>Math.round(v*118)).join(',')+','+(.19+.19*(1-paint.night))+')';
    if(roadRevision!==world.revision){
      roadRevision=world.revision;roadPath=new Path2D();
      for(const road of world.roads){
        roadPath.moveTo(road[0].x,road[0].y);
        for(let i=1;i<road.length;i++)roadPath.lineTo(road[i].x,road[i].y);
      }
    }
    ctx.strokeStyle=roadSoil;ctx.lineWidth=6.5;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.stroke(roadPath);
    drawCropCircle(scale);
    for(const pose of airPoses)drawAlienGround(pose);
    drawDayEvents(true);
    for(const h of world.homes){drawFarm('yard'+h.id,h,c=>models.yard(c,h.id));farmShadow(h);}
    const items=[];
    const flock=world.flock,site=flock.site;
    if(site){
      for(let i=0;i<3;i++){
        if(!flock.field(i))continue;
        const p=flock.screen(flock.field(i)),wear=Math.min(3,Math.floor(flock.wear[i]*4));
        const patch=sprite('pasture'+i+wear,132,86,c=>models.pasture(c,i,wear));
        ctx.drawImage(patch,p.x-66,p.y-43,132,86);
      }
      const depth=(x,y)=>PastoralFlock.offset(site,x,y).y;
      const {fence,kennel}=PastoralFlock;
      for(const [part,z] of [['ground',-125],['gate',depth(fence.right,0)],['kennel',depth(kennel.x,kennel.y)-4]])
        items.push({type:'fold',part,y:site.y+z});
      PastoralFlock.rails.forEach(([x,y,xx,yy],part)=>{
        items.push({type:'fold',part,y:site.y+Math.max(depth(x,y),depth(xx,yy))});
      });
      for(const [i,animal] of [...flock.sheep,flock.dog].entries()){
        const a=flock.screen(animal),octant=Math.PI/4;
        const gait=flockGaits[i]??={x:a.x,y:a.y,phase:(i*.618)%4,heading:Math.round(a.dir/octant)};
        // 八向精灵越过分界线一小段才换面；脚步按实际位移推进，停下来就停步。
        if(Math.cos(a.dir-gait.heading*octant)<Math.cos(octant*.64))gait.heading=Math.round(a.dir/octant);
        gait.phase=(gait.phase+Math.min(10,Math.hypot(a.x-gait.x,a.y-gait.y))/(a.kind==='collie'?5:3.5))%4;
        gait.x=a.x;gait.y=a.y;a.heading=(gait.heading+8)%8;a.step=Math.floor(gait.phase);
        actorShadow(a);
        const lift=a.lift||0,depth=a.y+lift;
        a.y-=lift;items.push({type:'actor',y:depth,a});
      }
    }
    for(const h of world.homes){
      items.push({y:farmPoint(h,farm.length/2,0).y,h,type:'house'},{y:h.table.y,h,type:'table'});
      items.push({y:farmPoint(h,1,-4.35).y,h,type:'kennel'});
    }
    for(const bird of world.village.birds){
      const p=PastoralVillage.birdAt(bird,world.time),h=world.home(bird.index>>1);
      if(!h)continue;
      const roofDepth=farmPoint(h,farm.length/2,0).y+.1;
      const y=p.z>1?Math.max(p.y+p.z,roofDepth):p.y;
      if(bird.at==='grass'&&p.z<15)ellipse(ctx,p.x,p.y+p.z+.7,1.9,.8,'rgba(48,43,36,.17)');
      items.push({type:'bird',y,bird,p});
    }
    for(const a of world.agents)if(!a.hidden){actorShadow(a);items.push({y:a.y,a,type:'actor'});}
    for(const t of world.torches)items.push({y:t.y,t,type:'torch'});
    items.sort((a,b)=>a.y-b.y);
    for(const item of items){
      const {h,t}=item;
      if(item.type==='actor')actor(item.a,now);
      else if(item.type==='bird')drawBird(item.bird,item.p);
      else if(item.type==='kennel')drawFarm('kennel'+h.id,h,c=>models.kennel(c,h.id));
      else if(item.type==='fold'){
        const closed=item.part==='gate'&&flock.gateClosed;
        const key=['fold',item.part,closed,site.sign,site.vertical].join('/');
        const im=sprite(key,240,248,c=>{c.translate(120,128);models.fold(c,item.part,closed,site);});
        ctx.drawImage(im,site.x-120,site.y-128,240,248);
      }
      else if(item.type==='house'){
        const [left,right]=windows(h),lit=Number(left)+2*Number(right);
        drawFarm('cottage'+h.id+'-'+lit,h,c=>{models.cottage(c,h.id,lit);models.nest(c,h.id);});
      }else if(item.type==='table')drawFarm('table',h,models.table);
      else{
        line(ctx,t.x,t.y,t.x,t.y-12,'#674b38',1.65);
        if(t.lit){const f=Math.sin(ambientTime/105+t.id)*.8;ellipse(ctx,t.x,t.y-14,2.35,3.4+f,'#ff913b');ellipse(ctx,t.x,t.y-14,1.14,1.94,'#fff0ae');}
      }
    }
    for(const game of world.village.plays)yardProps(game);
    drawDayEvents(false);
    markSelection(now);
    for(const g of world.games){
      const t=world.time-g.start,members=world.agents.filter(a=>a.game===g.id);
      if(!members.length||members.some(a=>a.state==='join'))continue;
      if(g.type==='ball'){
        const i=Math.floor(t/2)%members.length,a=members[i],b=members[(i+1)%members.length],f=t/2%1;
        ellipse(ctx,a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f-4-Math.sin(f*Math.PI)*9,1.65,1.65,'#d96d41');
      }
      if(g.type==='circle')ellipse(ctx,g.x,g.y,6,3,'rgba(133,112,68,.18)');
    }
    const flies=visibleFireflies();
    for(const f of flies){ctx.globalAlpha=f.alpha;ellipse(ctx,f.x,f.y,1.5,1.5,'#e4f4a1');}ctx.globalAlpha=1;
    gl.activeTexture(gl.TEXTURE9);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);uploadCanvas(texture,layer);
    const lightHeight=Math.max(1,Math.round(384*H/W));
    if(lights.width!==384||lights.height!==lightHeight){lights.width=384;lights.height=lightHeight;}
    const k=lights.width/W;lc.setTransform(k,0,0,k,0,0);lc.clearRect(0,0,W,H);
    if(lampLayer.width!==lights.width||lampLayer.height!==lights.height){lampLayer.width=lights.width;lampLayer.height=lights.height;}
    const glow=(x,y,r,strength,color=[255,180,67],occlude=true)=>{
      const c=lampContext;c.setTransform(k,0,0,k,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,W,H);
      const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${color},${strength})`);g.addColorStop(.24,`rgba(${color},${strength*.63})`);g.addColorStop(1,`rgba(${color},0)`);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
      if(occlude){
        c.globalCompositeOperation='destination-out';
        for(const h of world.homes){
          if(Math.hypot(x-h.door.x,y-h.door.y)>r+135)continue;
          const points=[[0,0],[farm.length,0],[farm.length,farm.depth],[0,farm.depth]].map(([e,n])=>farmPoint(h,e,n));
          models.polygon(c,points,'#000');
          const extend=p=>{const s=r*3/(Math.hypot(p.x-x,p.y-y)||1);return {x:p.x+(p.x-x)*s,y:p.y+(p.y-y)*s};};
          for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];models.polygon(c,[a,b,extend(b),extend(a)],'#000');}
        }
      }
      lc.drawImage(lampLayer,0,0,W,H);
    };
    for(const t of world.torches)if(t.lit){glow(t.x,t.y,62,.9+Math.sin(ambientTime/180+t.id)*.05);glow(t.x,t.y-14,5,1,[255,222,126],false);}
    for(const h of world.homes)windows(h).forEach((on,i)=>{
      if(on){const e=models.panes[i],glass=farmPoint(h,e,0,1.45),sill=farmPoint(h,e,-.38);
        glow(sill.x,sill.y,33,.47);glow(glass.x,glass.y,6,.85,[255,216,116],false);}
    });
    // 虫光只占几个像素，直接画进光照层，省去每只虫一次全层清空和合成。
    for(const f of flies)if(f.alpha>.05){
      const g=lc.createRadialGradient(f.x,f.y,0,f.x,f.y,8);
      g.addColorStop(0,'rgba(191,243,131,'+f.alpha+')');g.addColorStop(1,'rgba(191,243,131,0)');
      lc.fillStyle=g;lc.fillRect(f.x-8,f.y-8,16,16);
    }
    gl.activeTexture(gl.TEXTURE10);uploadCanvas(lightTexture,lights);
  }
  function aurora(){
    if(!P.auroraBrightness)return null;
    const light=PastoralCore.auroraLight(reducedMotion.matches?0:world.time,world.seed,solar.altitude);
    if(light){
      light.strength*=P.auroraBrightness;
      light.halfWidth*=P.auroraWidth;
    }
    return light;
  }
  // 一张缓存的光斑供单颗、双颗和流星雨共用；各颗的余光可以叠加。
  const meteorPeak=.62;
  function meteorFootprint(tint){
    const c=document.createElement('canvas');c.width=256;c.height=64;
    const g=c.getContext('2d'),pixels=g.createImageData(c.width,c.height);
    for(let x=0;x<c.width;x++){
      const along=(x+.5)/c.width;
      const fromPeak=(along-meteorPeak)/(along<meteorPeak?meteorPeak:1-meteorPeak);
      const lengthFade=.5+.5*Math.cos(Math.PI*fromPeak);
      for(let y=0;y<c.height;y++){
        const cross=(y+.5)/c.height*2-1,i=(y*c.width+x)*4;
        // 地面漫反射是一片宽光晕，两端和两侧都平滑淡出。
        const glow=.13*lengthFade*(.5+.5*Math.cos(Math.PI*cross));
        for(let ch=0;ch<3;ch++)pixels.data[i+ch]=255*glow*tint[ch];
        pixels.data[i+3]=255;
      }
    }
    g.putImageData(pixels,0,0);return {canvas:c,pixels:pixels.data};
  }
  const meteorTexture=gl.createTexture();setup(meteorTexture);
  const mask=document.createElement('canvas'),maskCtx=mask.getContext('2d',{alpha:false});
  mask.width=0;
  const footprints=[];
  let meteorSlot,meteorSeed,paths;
  const activeTrails=[];
  // Sample the same cached footprint the meadow uses, in the moving trail's local coordinates.
  function meteorAt(x,y){
    let light=null;
    for(const trail of activeTrails){
      const dx=x-trail.x,dy=y-trail.y;
      const u=meteorPeak*(1+(dx*trail.cos+dy*trail.sin)/trail.tail);
      const v=.5*(1+(-dx*trail.sin+dy*trail.cos)/trail.radius);
      if(u<0||u>=1||v<0||v>=1)continue;
      const {canvas,pixels}=trail.footprint;
      const i=4*(Math.floor(v*canvas.height)*canvas.width+Math.floor(u*canvas.width));
      if(!light)light=[0,0,0];
      for(let ch=0;ch<3;ch++)light[ch]=Math.min(.18,light[ch]+pixels[i+ch]*trail.gain/255);
    }
    return light?.map(channel=>channel*P.meteorBrightness);
  }
  let trial=null;
  function tryMeteor(now){
    const icon=icons.find(ic=>ic.x>=0&&ic.x<W*.5&&ic.y>=0&&ic.y<H*.8);
    const y=icon?Math.max(.07,(icon.y+icon.h*.3)/H):.36;
    const color=Math.floor(Math.random()*PastoralCore.meteorColors.length);
    trial={start:now/1000,flight:4,linger:2,width:.033,gain:.9,color,x0:-.1,y0:y,x1:1.1,y1:y+.18};
    return now+6000;
  }
  function drawMeteorLight(w,h){
    gl.activeTexture(gl.TEXTURE11);gl.bindTexture(gl.TEXTURE_2D,meteorTexture);
    activeTrails.length=0;
    const trialTime=trial?performance.now()/1000:0;
    if(trial&&trialTime>=trial.start+trial.flight+trial.linger){trial=null;meteorTrialUntil=0;}
    if(!P.meteorBrightness||(!trial&&(reducedMotion.matches||solar.altitude>=-6)))return false;
    const time=trial?trialTime:world.time;
    let visiblePaths;
    if(trial) visiblePaths=[trial];
    else {
      const slot=Math.floor(time/PastoralCore.meteorPeriod),seed=world.seed;
      if(slot!==meteorSlot||seed!==meteorSeed){
        paths=PastoralCore.meteorBatch(slot,seed);meteorSlot=slot;meteorSeed=seed;
      }
      visiblePaths=meteorPaths.length?paths.concat(meteorPaths):paths;
      if(!visiblePaths.some(p=>time>=p.start&&time<p.start+p.flight+p.linger))return false;
    }
    const scale=Math.min(cv._scale,768/Math.max(w,h)),mw=Math.max(1,Math.round(w*scale)),mh=Math.max(1,Math.round(h*scale));
    if(mask.width!==mw||mask.height!==mh){
      mask.width=mw;mask.height=mh;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,mw,mh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    maskCtx.setTransform(1,0,0,1,0,0);maskCtx.clearRect(0,0,mw,mh);
    maskCtx.globalCompositeOperation='lighter';
    for(const p of visiblePaths){
      const age=time-p.start;
      if(age<0||age>=p.flight+p.linger)continue;
      const dx=(p.x1-p.x0)*w,dy=(p.y1-p.y0)*h,len=Math.hypot(dx,dy),progress=age/p.flight;
      const tail=len*p.linger/p.flight,r=Math.min(w,h)*p.width*8.5*P.meteorWidth;
      maskCtx.setTransform(mw/w,0,0,mh/h,0,0);
      const x=p.x0*w+dx*progress,y=p.y0*h+dy*progress;
      maskCtx.translate(x,y);maskCtx.rotate(Math.atan2(dy,dx));
      const footprint=footprints[p.color] ||= meteorFootprint(PastoralCore.meteorColors[p.color]);
      // 宽光晕在亮点进入画面前就可能扫到边缘，整片光先从零渐亮。
      const remaining=p.flight+p.linger-age;
      const gain=p.gain*sstep(0,1.25,age)*sstep(0,.8,remaining);
      activeTrails.push({x,y,cos:dx/len,sin:dy/len,tail,radius:r,footprint,gain});
      maskCtx.globalAlpha=gain;maskCtx.drawImage(footprint.canvas,-tail,-r,tail/meteorPeak,2*r);
    }
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,mask);
    return true;
  }
  return {world,update,draw,receive,clickAt,selectBox,clearSelection,moveSelection,triggerEvent,syncPreviewGesture,aurora,tryMeteor,drawMeteorLight,meteorAt,get meteorActive(){return activeTrails.length>0;},get solar(){return solar;},get paint(){return paint;},get location(){return location;},texture,lightTexture,cropTexture,cropRect,cropTiming,airTexture,airRect,shade,save,setTime(date){override=date;lastSun=-Infinity;},cache};
}
function preparePastoral(now,dt){if(!pastoralScene)pastoralScene=createPastoralScene();pastoralScene.update(now,dt);}

// 与草地着色器使用相同的光带坐标，图标只需每半秒采样一次。
let hadMeteorLight=false,lastIconLightAt=-Infinity,lastLightMessage=null,iconLayoutRevision=0;
function iconTint(x,y,aurora,paint){
  let glow=[0,0,0];
  if(aurora){
    const a=aurora,w=cv.width/cv._scale,h=cv.height/cv._scale;
    const along=((2*x-w)*a.dx+(2*y-h)*a.dy)/(w*Math.abs(a.dx)+h*Math.abs(a.dy));
    const across=-(x/w-.5)*a.dy+(y/h-.5)*a.dx;
    const wash=1-sstep(0,a.halfWidth,Math.abs(along-a.center+.26*Math.sin(6*across+a.bend)));
    const curl=Math.sin(10*across+a.foldBend);
    const offset=along-a.foldCenter-.46*across+.23*curl+.08*Math.sin(17*across-a.foldBend+curl);
    const fold=1-sstep(0,a.halfWidth*(.49+.14*curl),Math.abs(offset));
    glow=a.primary.map((c,i)=>{
      const wide=c*(.022+.978*wash),edge=a.fringe[i]*a.foldGain*fold;
      return Math.min(1,(wide+edge-wide*edge)*a.strength);
    });
  }
  const peak=Math.max(...glow),alpha=.12+.18*paint.night+.14*paint.rake+.18*peak;
  const rgb=paint.cloudBody.map((c,i)=>Math.round(255*Math.min(1,c*(1-.48*paint.night)*(1-peak)+glow[i])));
  const trail=pastoralScene.meteorAt(x,y);
  const intensity=trail?Math.max(...trail):0;
  if(intensity<=0)return [...rgb,Math.round(255*alpha)];
  // Compose the meteor over the ambient tint, then send the host one RGBA overlay.
  const flash=.76*intensity,combined=flash+alpha*(1-flash);
  return [...rgb.map((v,i)=>Math.round((255*trail[i]/intensity*flash+v*alpha*(1-flash))/combined)),Math.round(255*combined)];
}
function updateIconLight(now,aurora){
  const active=pastoralScene.meteorActive;
  if(active===hadMeteorLight && now>=lastIconLightAt && now-lastIconLightAt<(active?80:500))return;
  hadMeteorLight=active;
  lastIconLightAt=now;
  const native=WALL&&!PREVIEW,host=native&&window.chrome?.webview;
  const colors=[];
  for(let i=0;i<icons.length;i++){
    const ic=icons[i],tint=P.iconLighting?iconTint(ic.x+ic.w/2,ic.y+ic.h*.3,aurora,pastoralScene.paint):null;
    if(native){
      if(tint)colors.push(tint.map(v=>v.toString(16).padStart(2,'0')).join(''));
    }else{
      const glyph=PREVIEW?document.getElementById('ghosts')?.children[i]?.firstChild:ic.el?.querySelector('.glyph svg');
      if(!glyph)continue;
      if(PREVIEW)glyph.style.backgroundColor=tint?'rgb('+tint.slice(0,3).map(c=>Math.round(250+(c-250)*tint[3]/255)).join(',')+')':'';
      else if(tint){
        let filter=glyph.querySelector('filter');
        if(!filter){
          filter=document.createElementNS(glyph.namespaceURI,'filter');
          filter.id='icon-light-'+(++iconFilterId);
          filter.setAttribute('color-interpolation-filters','sRGB');
          const matrix=document.createElementNS(glyph.namespaceURI,'feColorMatrix');
          filter.append(matrix);glyph.prepend(filter);
        }
        const a=tint[3]/255,k=1-a;
        filter.firstChild.setAttribute('values',k+' 0 0 0 '+tint[0]/255*a+' 0 '+k+' 0 0 '+tint[1]/255*a+' 0 0 '+k+' 0 '+tint[2]/255*a+' 0 0 0 1 0');
        glyph.style.filter='url(#'+filter.id+')';
      }else glyph.style.filter='';
    }
  }
  if(host){
    const message='icon-light|'+iconLayoutRevision+'|'+colors.join(',');
    if(message!==lastLightMessage){host.postMessage(message);lastLightMessage=message;}
  }
}
let iconFilterId=0;
