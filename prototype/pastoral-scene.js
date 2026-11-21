/* 本主题的画布合成、太阳和宿主连接。模拟只由桌面实例推进，预览只读快照。 */
let pastoralScene=null;
let pastoralSettings={};
const pastoralSolar = PastoralLight.solar;
function createPastoralScene() {
  const world=new PastoralCore.World(73519),layer=document.createElement('canvas'),ctx=layer.getContext('2d');
  const lights=document.createElement('canvas'),lc=lights.getContext('2d'),cache=new Map();
  const lampLayer=document.createElement('canvas'),lampContext=lampLayer.getContext('2d');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let fireflies=[],flyRevision=-1;
  const texture=gl.createTexture(),lightTexture=gl.createTexture();
  function setup(t){gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));}
  setup(texture);setup(lightTexture);
  let location=pastoralSettings.location||null,solar=pastoralSolar(new Date(),location),lastDraw=-Infinity,lastSun=-Infinity,lastSend=0,lastSave=-Infinity,snapshotReceived=false,layoutAt=0,signature='',loaded=false,override=null;
  const clock={realTime:pastoralSettings.realTime===0?0:1,fixedTime:Number.isFinite(pastoralSettings.fixedTime)?pastoralSettings.fixedTime:720};
  let reschedule=false;
  const paint=PastoralLight.blend({},solar.palette,1);
  const host=window.chrome?.webview,authoritative=!PREVIEW;
  function send(m){if(host&&WALL)host.postMessage(m);}
  function receive(m){
    if(m.t==='reset'){clock.realTime=1;clock.fixedTime=720;lastSun=-Infinity;override=null;reschedule=true;}
    if(m.t==='settings'&&m.v){
      for(const key of ['realTime','fixedTime']){const v=m.v[key];if((key==='realTime'?(v===0||v===1):Number.isInteger(v)&&v>=0&&v<=1439)&&clock[key]!==v){clock[key]=v;lastSun=-Infinity;override=null;reschedule=true;}}
    }
    if(m.t==='world'&&m.v){if(PREVIEW||!loaded){const old=world.signature;if(world.restore(m.v)){snapshotReceived=true;loaded=true;if(PREVIEW&&world.free)world.signature=old;else signature='';lastDraw=-Infinity;}}}
    if(m.t==='settings'&&m.v?.location){const p=m.v.location;if(Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180){location=p;lastSun=-Infinity;}}
    if(m.t==='worldReset'&&authoritative){world.homes=[];world.agents=[];world.torches=[];world.games=[];world.signature='';signature='';loaded=true;}
  }
  if(PREVIEW)addEventListener('message',e=>{if(e.source===parent){try{receive(typeof e.data==='string'?JSON.parse(e.data):e.data);}catch{}}});
  else if(host){host.addEventListener('message',e=>{try{receive(JSON.parse(e.data));}catch{}});send('world-load');}
  else {try{const raw=localStorage.getItem('deskland-pastoral-demo');if(raw)world.restore(JSON.parse(raw));}catch{}}
  function shade(p){
    const x=p.x-solar.shadow[0],y=p.y-solar.shadow[1];
    const gx=Math.floor(x/CELL_G)+4,gy=Math.floor(y/CELL_G)+4;
    if(circBuf&&gx>=0&&gy>=0&&gx<cgW&&gy<cgH){for(let i=0;i<36;i++){const j=((gy*cgW+gx)*36+i)*4,r=circBuf[j+2];if(r>0&&Math.hypot(x-circBuf[j],y-circBuf[j+1])<r)return true;}}
    return curS(x,y)<0;
  }
  function update(now,dt){
    if(now-lastSun>1000){solar=pastoralSolar(override||PastoralCore.worldDate(new Date(),clock,location?.zone),location);lastSun=now;}
    PastoralLight.blend(paint,solar.palette,1-Math.exp(-Math.min(dt,.25)*6));
    const sig=JSON.stringify([W,H,P.sigma,icons.map(i=>[i.x,i.y,i.w,i.h])]);
    if(sig!==signature){if(layoutAt===0)layoutAt=now+450;if(now>=layoutAt){world.layout(W,H,icons,P.sigma);signature=sig;layoutAt=0;lastDraw=-Infinity;}}
    if(!world.free)return;
    if(reschedule){for(const a of world.agents){world.release(a);a.until=0;a.next=0;a.path=[];a.target=null;}world.games=[];for(const t of world.torches)t.lit=solar.altitude<-6;lastDraw=-Infinity;reschedule=false;}
    // 休眠恢复不补跑所有帧；重新评估作息并补齐已错过的点灯任务。
    if(dt>.09&&world.solar&&Math.abs(world.solar.altitude-solar.altitude)>5){for(const a of world.agents){a.until=0;a.path=[];}for(const t of world.torches)t.lit=solar.altitude<-6;}
    if(authoritative||!host&&!snapshotReceived)world.update(dt,solar,shade,true);
    else world.update(dt,solar,shade,false);
    if(authoritative&&now-lastSend>1000){lastSend=now;send('world-state|'+JSON.stringify(world.snapshot()));}
    if(authoritative&&now-lastSave>60000){lastSave=now;save();}
  }
  function save(){if(!world.agents.length)return;const raw=JSON.stringify(world.snapshot());if(host&&WALL)send('world-save|'+raw);else if(!PREVIEW){try{localStorage.setItem('deskland-pastoral-demo',raw);}catch{}}}
  addEventListener('pagehide',save);
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
  function line(c,x,y,xx,yy,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
  function sprite(key,w,h,draw){if(!cache.has(key)){const c=document.createElement('canvas');c.width=w*2;c.height=h*2;const g=c.getContext('2d');g.scale(2,2);draw(g);cache.set(key,c);}return cache.get(key);}
  function house(style){return sprite('house'+style,158,153,c=>{
    // 细线、纸色和克制的屋顶色，保持草地原型的插画比例。
    c.fillStyle='#c3b780';c.beginPath();c.ellipse(77,119,74,28,0,0,Math.PI*2);c.fill();
    c.fillStyle=['#e6d9b3','#d8d0b3','#ead9bb'][style%3];c.fillRect(12,34,128,40);c.strokeStyle='#72684f';c.lineWidth=1;c.strokeRect(12,34,128,40);
    c.fillStyle=['#9b5746','#746f55','#a37a4e'][style%3];c.beginPath();c.moveTo(4,38);c.lineTo(29,5);c.lineTo(126,5);c.lineTo(150,38);c.closePath();c.fill();c.stroke();
    for(let y=13;y<38;y+=7)line(c,24-y*.4,y,126+y*.4,y,'#e4bd90',.6);
    c.fillStyle='#8b7964';c.fillRect(109,0,10,19);c.fillStyle='#74604b';c.fillRect(106,0,16,4);
    c.fillStyle='#66513b';c.fillRect(65,48,22,29);line(c,83,61,83,63,'#dbb66a',2);
    for(const x of [27,103]){c.fillStyle='#5f7980';c.fillRect(x,48,17,15);line(c,x+8,48,x+8,63,'#e8debd');line(c,x,55,x+17,55,'#e8debd');}
    c.fillStyle='#b1a67c';c.fillRect(66,77,21,7);
    for(const x of [6,148]){line(c,x,94,x,143,'#a19367',2);for(let y=97;y<145;y+=16)line(c,x-3,y,x+3,y,'#c7bb88',2);}
    c.fillStyle='#89704b';c.fillRect(85,112,43,18);c.strokeStyle='#5d573f';c.strokeRect(85,112,43,18);line(c,90,130,88,139,'#5d573f',3);line(c,123,130,125,139,'#5d573f',3);
    for(const y of [101,138]){line(c,87,y,127,y,'#725c43',4);line(c,92,y,92,y+6,'#725c43',2);line(c,122,y,122,y+6,'#725c43',2);}
    for(let i=0;i<4;i++){c.fillStyle='#796342';c.fillRect(20+i*11,116,9,21);for(let j=0;j<3;j++)ellipse(c,24+i*11,119+j*6,3,2,'#57764a');}
    for(const x of [99,115]){ellipse(c,x,121,5,3,'#eee1be');ellipse(c,x,121,2,1,'#b88150');}
  });}
  function cow(a,now){const moving=a.path.length>0,sleep=['sleep','rest','shade'].includes(a.state),graze=a.state==='graze';const f=moving?Math.floor(now/180)%4:0;return sprite('cow'+a.style+'-'+f+'-'+sleep+'-'+graze,54,43,c=>{
    const colors=['#4e493e','#976a45','#423d36','#a5815c','#bca47a','#56514a'],color=colors[a.style];
    if(!sleep)for(const [x,j] of [[14,0],[23,1],[33,1],[40,0]])line(c,x,25,x+(moving?Math.sin(f*Math.PI/2+j*Math.PI)*3:0),37,'#564e3c',3);
    ellipse(c,27,sleep?29:23,19,sleep?10:12,'#f2e9cc');ellipse(c,21,21,8,7,color);ellipse(c,34,27,7,5,color);ellipse(c,39,18,5,6,color);
    const hy=graze?30:sleep?29:18;ellipse(c,8,hy,9,7,'#e5d8b7');ellipse(c,3,hy+4,5,3,'#bba684');ellipse(c,9,hy-1,1,1,'#312f29');
    line(c,7,hy-6,8,hy-10,'#897b5e',1.5);line(c,12,hy-6,14,hy-9,'#897b5e',1.5);ellipse(c,14,hy-5,5,2,color);
    line(c,45,20,49,28+(f%2),'#665a43',1.4);ellipse(c,49,29+(f%2),2,3,color);
  });}
  function person(a,now){const move=a.path.length>0,f=move?Math.floor(now/160)%4:0,sit=['sit','eat','play'].includes(a.state)&&!move;return sprite('person'+a.kind+a.style+'-'+f+'-'+sit+'-'+a.state,30,43,c=>{
    const child=a.kind==='child',y=child?10:2,shirts=['#717d82','#a5654c','#d3b26d','#66816a','#9a7a83','#8b8262'];
    const foot=sit?38:40,hip=child?32:30;
    line(c,13,hip,12+Math.sin(f*Math.PI/2)*3,foot,'#575948',3);line(c,18,hip,19-Math.sin(f*Math.PI/2)*3,foot,'#575948',3);
    c.fillStyle=shirts[a.style];c.beginPath();c.roundRect(9,y+13,14,child?14:18,4);c.fill();
    ellipse(c,16,y+8,6,7,'#dcc099');ellipse(c,16,y+4,6,3,child?'#76533b':'#6b5840');
    if(!child){ellipse(c,16,y+3,10,2,'#c6b67b');c.fillStyle='#b2a068';c.fillRect(11,y-1,10,4);}
    const arm=a.state==='water'||a.state==='torch'||a.state==='kite'?4:move?Math.sin(f*Math.PI/2)*3:0;
    line(c,10,y+16,6,y+25-arm,'#d4b68c',3);line(c,22,y+16,25,y+25-arm,'#d4b68c',3);
    if(a.state==='water'){c.fillStyle='#7d9690';c.fillRect(22,y+18,7,7);line(c,27,y+19,29,y+14,'#7d9690',2);}
    if(a.state==='sweep'||a.state==='repair')line(c,24,y+20,28,40,'#9d8050',2);
    if(a.state==='torch'){line(c,25,y+25,25,y+5,'#795435',2);ellipse(c,25,y+3,3,5,'#edb45a');}
  });}
  function shadow(x,y,w,h){const sx=solar.shadow[0]*.12,sy=solar.shadow[1]*.12;ctx.save();ctx.translate(x+sx,y+sy);ctx.rotate(Math.atan2(sy,sx));ellipse(ctx,0,0,Math.max(w,Math.hypot(sx,sy)),h,`rgba(28,43,60,${.12+.1*(1-paint.night)})`);ctx.restore();}
  function windows(h){const evening=solar.altitude<6,bedtime=22*60+10+h.id*17;const late=solar.minute>=bedtime||solar.minute<5*60;return [evening&&(!late||h.id===0),evening&&solar.minute<bedtime-10&&solar.minute>=5*60];}
  function draw(now){
    if(!world.free)return;
    const ambientTime=reducedMotion.matches?0:now;
    const scale=cv._scale,box=cv.getBoundingClientRect(),pw=Math.round(box.width*scale),ph=Math.round(box.height*scale);
    if(layer.width!==pw||layer.height!==ph){layer.width=pw;layer.height=ph;lastDraw=-Infinity;}
    // 局部精灵预绘入缓存，世界层 15Hz 上传；草地和云继续以 30fps 绘制。
    if(now-lastDraw<65&&layer.width===pw&&layer.height===ph)return;lastDraw=now;
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(219,210,164,.48)';ctx.lineWidth=12;ctx.lineCap='round';
    for(let i=1;i<world.homes.length;i++){const a=world.homes[i-1].door,b=world.homes[i].door;const path=world.path(a,b);if(path.length){ctx.beginPath();ctx.moveTo(a.x,a.y);for(const p of path)ctx.lineTo(p.x,p.y);ctx.stroke();}}
    const list=[...world.homes.map(h=>({type:'house',y:h.y+80,h})),...world.agents.filter(a=>!a.hidden).map(a=>({type:'agent',y:a.y,a}))].sort((a,b)=>a.y-b.y);
    for(const item of list){if(item.type==='house'){const h=item.h;shadow(h.x+76,h.y+66,60,13);ctx.drawImage(house(h.id),h.x,h.y,158,153);windows(h).forEach((on,i)=>{if(on){ctx.fillStyle='#ffda7a';ctx.fillRect(h.x+(i?104:28),h.y+49,14,12);}});continue;}
      const a=item.a;shadow(a.x,a.y,a.kind==='cow'?19:7,a.kind==='cow'?5:3);
      if(a.kind==='cow'){const im=cow(a,now);ctx.save();ctx.translate(a.x,a.y);if(Math.cos(a.dir)>0)ctx.scale(-1,1);ctx.drawImage(im,-27,-34,54,43);ctx.restore();}
      else {ctx.drawImage(person(a,now),a.x-15,a.y-38,30,43);if(a.state==='water'&&!a.path.length){for(let j=0;j<4;j++)ellipse(ctx,a.x+14+j*2,a.y-7+j*2+Math.sin(now/180)*2,.8,1.6,'#a4c6c0');}if(a.state==='kite'){const kx=a.x+40+Math.sin(now/1300)*12,ky=a.y-86;line(ctx,a.x+9,a.y-15,kx,ky,'#7c7860',.7);ctx.fillStyle='#c67a54';ctx.beginPath();ctx.moveTo(kx,ky-12);ctx.lineTo(kx+9,ky);ctx.lineTo(kx,ky+13);ctx.lineTo(kx-9,ky);ctx.closePath();ctx.fill();}}
    }
    for(const g of world.games){const t=(world.time-g.start),members=world.agents.filter(a=>a.game===g.id);if(members.some(a=>a.state==='join'))continue;if(g.type==='ball'){const a=members[Math.floor(t/2)%members.length],b=members[(Math.floor(t/2)+1)%members.length];if(a&&b){const f=t/2%1;ellipse(ctx,a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f-14-Math.sin(f*Math.PI)*20,3.5,3.5,'#bd6547');}}if(g.type==='circle'){ellipse(ctx,g.x,g.y,10,6,'rgba(133,112,68,.18)');}}
    for(const t of world.torches){line(ctx,t.x,t.y,t.x,t.y-20,'#765336',2);if(t.lit){const f=Math.sin(ambientTime/95+t.id)*1.5;ellipse(ctx,t.x,t.y-24,4+f*.2,7+f,'#e98e3e');ellipse(ctx,t.x,t.y-25,2,4,'#ffe3a0');}}
    if(flyRevision!==world.revision){flyRevision=world.revision;fireflies=[];const rnd=PastoralCore.random(world.seed^0x651b);for(let i=0;i<140&&fireflies.length<9;i++){const p={x:32+rnd()*(W-64),y:32+rnd()*(H-110),phase:rnd()*Math.PI*2};if(world.walkable(p))fireflies.push(p);}}
    const flies=paint.night>.4?fireflies.map(f=>({x:f.x+Math.sin(ambientTime/2700+f.phase)*8,y:f.y+Math.sin(ambientTime/3400+f.phase)*6,alpha:Math.pow(Math.max(0,Math.sin(ambientTime/1400+f.phase)),2)*(paint.night-.4)*1.5})).filter(f=>world.walkable(f)):[];
    for(const f of flies){ctx.globalAlpha=f.alpha;ellipse(ctx,f.x,f.y,1.5,1.5,'#e4f4a1');}ctx.globalAlpha=1;
    gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,layer);
    lights.width=384;lights.height=Math.max(1,Math.round(384*H/W));const k=lights.width/W;lc.setTransform(k,0,0,k,0,0);lc.clearRect(0,0,W,H);
    if(lampLayer.width!==lights.width||lampLayer.height!==lights.height){lampLayer.width=lights.width;lampLayer.height=lights.height;}
    const glow=(x,y,r,strength,color=[255,180,67],occlude=true)=>{
      const c=lampContext;c.setTransform(k,0,0,k,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,W,H);
      const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${color},${strength})`);g.addColorStop(.24,`rgba(${color},${strength*.63})`);g.addColorStop(1,`rgba(${color},0)`);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
      if(occlude){c.globalCompositeOperation='destination-out';c.fillStyle='#000';for(const h of world.homes){const box={x:h.x+12,y:h.y+5,w:128,h:69};if(PastoralCore.inside({x,y},box)||Math.hypot(x-h.x-76,y-h.y-40)>r+110)continue;const points=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];c.fillRect(box.x,box.y,box.w,box.h);for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],extend=p=>{const d=Math.hypot(p[0]-x,p[1]-y)||1;return [p[0]+(p[0]-x)/d*r*3,p[1]+(p[1]-y)/d*r*3];},aa=extend(a),bb=extend(b);c.beginPath();c.moveTo(...a);c.lineTo(...b);c.lineTo(...bb);c.lineTo(...aa);c.closePath();c.fill();}}}
      lc.drawImage(lampLayer,0,0,W,H);
    };
    for(const t of world.torches)if(t.lit){glow(t.x,t.y,112,.9+Math.sin(ambientTime/180+t.id)*.05);glow(t.x,t.y-24,9,1,[255,222,126],false);}
    for(const h of world.homes)windows(h).forEach((on,i)=>{if(on){const x=h.x+(i?111:35);glow(x,h.y+80,60,.48);glow(x,h.y+55,12,.95,[255,216,116],false);}});
    for(const f of flies)if(f.alpha>.05)glow(f.x,f.y,8,f.alpha,[191,243,131],false);
    gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,lightTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,lights);
  }
  return {world,update,draw,receive,get solar(){return solar;},get paint(){return paint;},get location(){return location;},texture,lightTexture,shade,save,setTime(date){override=date;lastSun=-Infinity;},cache};
}
function preparePastoral(now,dt){if(!pastoralScene)pastoralScene=createPastoralScene();pastoralScene.update(now,dt);}
