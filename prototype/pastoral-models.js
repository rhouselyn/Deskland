// 米制小模型在局部画布上绘制；精灵缓存由场景管理。
const PastoralModels=(()=>{
  const {farm,farmPoint,random}=PastoralCore;
  const origin={x:0,y:0},plan=(e,n,z=0)=>farmPoint(origin,e,n,z);
  const panes=[1.35,5.95];
  function polygon(c,points,color){
    c.fillStyle=color;c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))c.lineTo(p.x,p.y);
    c.closePath();c.fill();
  }
  function stroke(c,a,b,color,width){
    c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
  }
  function dot(c,p,rx,ry,color){
    c.fillStyle=color;c.beginPath();c.ellipse(p.x,p.y,rx,ry,0,0,Math.PI*2);c.fill();
  }
  function face(c,corners,color){polygon(c,corners.map(v=>plan(...v)),color);}
  const ground=(c,e,n,w,d,z,color)=>face(c,[[e,n,z],[e+w,n,z],[e+w,n+d,z],[e,n+d,z]],color);
  const front=(c,e,n,z,w,height,color)=>face(c,[[e,n,z],[e+w,n,z],[e+w,n,z+height],[e,n,z+height]],color);
  const rail=(c,a,b,color,width)=>stroke(c,plan(...a),plan(...b),color,width);
  function yard(c,style){
    const rnd=random(2081+style);
    // 墙脚常年少见天空。把这层软阴影烘进院子精灵，与投向地面的月影叠加。
    c.save();c.shadowColor='rgba(17,28,39,.54)';c.shadowBlur=16;
    ground(c,0,0,farm.length,farm.depth,0,'#34434b');c.restore();
    // 石板只铺在门口和桌下，院子的草色与周围草原连续。
    ground(c,4.65,-5.3,3.7,3.15,0,'#b9aa81');
    for(let i=0;i<65;i++){
      const p=plan(4.7+rnd()*3.55,-5.22+rnd()*2.94);
      dot(c,p,.35+rnd()*.55,.35,i%3?'#d1c4a0':'#978b71');
    }
    for(let i=0;i<5;i++)ground(c,3.25+Math.sin(i)*.12,-.45-i*.54,.87,.35,.01,i%2?'#b8a68a':'#d2c4a2');
    {
      const e=2.04;
      ground(c,e,-4.85,.76,2.6,.02,'#775c40');
      for(let j=0;j<6;j++){
        const p=plan(e+.37,-4.62+j*.39,.08);
        dot(c,p,2.7,1.7,'#385b46');dot(c,{x:p.x-.6,y:p.y-.8},1.9,1.1,style===1?'#b6bd64':'#8aaa65');
      }
    }
    for(const side of [-.23,8.55]){
      for(const z of [.3,.62])rail(c,[side,-4.95,z],[side,-1.7,z],'#ab8c63',1.4);
      for(const n of [-4.95,-3.3,-1.7])rail(c,[side,n,0],[side,n,.84],'#7e6d53',2);
    }
    for(let i=0;i<22;i++){
      const e=.35+rnd()*2.3,n=-.17-rnd()*.67;
      dot(c,plan(e,n,.23),2.1,1.4,'#566f48');
      dot(c,plan(e,n,.39),.87,.73,i%3?'#fff3c7':'#d97c60');
    }
  }
  function kennel(c,style){
    const left=.18,right=1.82,frontN=-4.35,back=-2.75,wall=.82,peak=1.49;
    const [roof,,light,edge]=roofs[style%3];
    dot(c,plan(1.14,-3.66),11.3,6.1,'#59472e52');
    face(c,[[left,frontN,0],[right,frontN,0],[right,frontN,wall],[1,frontN,peak],[left,frontN,wall]],'#e7bd86');
    face(c,[[right,frontN,0],[right,back,0],[right,back,wall],[right,frontN,wall]],'#99714f');
    for(let n=frontN+.25;n<back;n+=.35)rail(c,[right,n,.08],[right,n,.74],'#775943',.48);
    const door=plan(1,frontN,.02);
    c.fillStyle='#4c3b33';c.beginPath();c.arc(door.x,door.y-3.5,3.6,Math.PI,0);c.lineTo(door.x+3.6,door.y+.8);c.lineTo(door.x-3.6,door.y-.4);c.fill();
    for(const [e,color] of [[left-.13,light],[right+.13,roof]]){
      face(c,[[e,frontN-.14,wall],[1,frontN-.14,peak+.12],[1,back+.13,peak+.12],[e,back+.13,wall]],color);
      rail(c,[e,frontN-.14,wall],[1,frontN-.14,peak+.12],edge,1.15);
    }
    const bowl=plan(2.15,-4.92);dot(c,bowl,2.6,1.4,'#78614e');dot(c,{x:bowl.x,y:bowl.y-.6},2.15,.84,'#b5d8d1');
  }
  function nest(c,style){
    const p=plan(style===1?6.6:1.05,.38,3.02),{x,y}=p;
    dot(c,{x,y:y+1.4},6.1,2.8,'#70503a');dot(c,p,5.4,2.1,'#bc965e');dot(c,p,3.8,1.25,'#53402f');
    for(let i=0;i<7;i++){
      const dx=i*1.55-4.8,dy=1.8-Math.abs(dx)*.22;
      stroke(c,{x:x+dx-1.8,y:y+dy+.7},{x:x+dx+1.8,y:y+dy-.5},i%2?'#dab27b':'#967146',.75);
    }
  }
  function table(c){
    const e=farm.tableX,n=farm.tableY;
    for(const dx of [-.79,.79])for(const dn of [-.32,.32])rail(c,[e+dx,n+dn,0],[e+dx,n+dn,.76],'#614d3c',1.6);
    for(const dn of [.82,-.82]){
      for(const dx of [-.74,.74])rail(c,[e+dx,n+dn,0],[e+dx,n+dn,.42],'#695340',1.5);
      ground(c,e-.99,n+dn-.15,1.98,.3,.44,'#ae8258');
    }
    front(c,e-1,n-.43,.65,2,.12,'#795338');
    ground(c,e-1,n-.43,2,.86,.77,'#c39866');
    ground(c,e-.38,n-.44,.73,.88,.78,'#8aafaa');
    for(const dx of [-.65,.65])dot(c,plan(e+dx,n,.79),1.55,1.04,'#fff3d7');
    dot(c,plan(e,n,.89),1.45,1.27,'#be6b45');
  }
  const roofs=[['#bd6149','#6d3836','#e78662','#f3bb8a'],['#576f7b','#354950','#89a6a7','#bdd0bd'],['#a9663e','#694b35','#ce8f51','#edbc7c']];
  function cottage(c,style,lit){
    const {length:l,depth:d,wall:w,ridge:r}=farm,[tile,dark,light,edge]=roofs[style%3];
    front(c,0,0,0,l,w,'#f0daba');
    face(c,[[l,0,0],[l,d,0],[l,d,w],[l,d/2,r],[l,0,w]],'#bbac92');
    front(c,0,0,0,l,.28,'#a89a86');
    front(c,0,0,w-.25,l,.25,'#b79b80');
    front(c,3.09,-.01,0,1.02,2.08,'#80634d');front(c,3.18,-.025,.04,.84,1.95,'#3d6463');
    front(c,3.29,-.04,1.04,.63,.79,'#90b1a8');
    dot(c,plan(3.87,-.05,.84),.73,.73,'#efd698');
    for(const [i,e] of panes.entries()){
      const on=(lit&(1<<i))!==0;
      front(c,e-.59,-.015,.81,1.18,1.23,'#806e58');
      front(c,e-.51,-.03,.9,1.02,1.02,on?'#ffcb68':'#517b86');
      front(c,e-.47,-.04,1.51,.92,.36,on?'#fff1a4':'#a9ceca');
      front(c,e-.035,-.05,.9,.07,1.04,'#efe1bf');front(c,e-.51,-.05,1.38,1.02,.08,'#efe1bf');
      for(const dx of [-.9,.6])front(c,e+dx,-.055,.84,.29,1.16,'#4e776c');
      ground(c,e-.68,-.2,1.36,.23,.8,'#c1a581');
    }
    ground(c,2.97,-.5,1.27,.5,.12,'#c8bba7');
    const x0=-.36,x1=l+.36,n0=-.35,n1=d+.35,rn=d/2;
    face(c,[[x0,n1,w],[x1,n1,w],[x1,rn,r],[x0,rn,r]],tile);
    for(let i=1;i<=4;i++){
      const t=i/4,n=rn+(n1-rn)*t,z=r+(w-r)*t;
      rail(c,[x0,n,z],[x1,n,z],dark,.7);
    }
    const roofPlane=[[x0,n0,w],[x1,n0,w],[x1,rn,r],[x0,rn,r]];
    const a=plan(0,rn,r),b=plan(0,n0,w),wash=c.createLinearGradient(a.x,a.y,b.x,b.y);
    wash.addColorStop(0,light);wash.addColorStop(.72,tile);wash.addColorStop(1,dark);
    face(c,roofPlane,wash);
    const height=n=>w+(r-w)*(n-n0)/(rn-n0);
    const rnd=random(40+style);
    for(let row=0;row<7;row++){
      const n=n0+row*(rn-n0)/7,nn=n+(rn-n0)/7;
      rail(c,[x0,n,height(n)],[x1,n,height(n)],dark,.49);
      for(let e=x0+(row%2?.24:0);e<x1-.04;e+=.46){
        if(rnd()<.29)face(c,[[e,n,height(n)],[Math.min(e+.42,x1),n,height(n)],[Math.min(e+.42,x1),nn,height(nn)],[e,nn,height(nn)]],rnd()<.5?'#ffebbe32':'#382b3226');
        rail(c,[e,n,height(n)],[e,nn,height(nn)],'#482f352e',.52);
      }
    }
    rail(c,[x0,n0,w],[x1,n0,w],dark,1.6);rail(c,[x0,rn,r],[x1,rn,r],edge,1.7);
    rail(c,[x1,rn,r],[x1,n0,w],light,1.2);
    // 烟囱的三个面和顶端炉口，在小尺寸下也能读出高度。
    const ce=style===1?1.35:5.7,cn=rn-.65,cz=height(cn)-.1;
    front(c,ce,cn,cz,.53,1.18,'#ba9274');
    face(c,[[ce+.53,cn,cz],[ce+.53,cn+.56,cz],[ce+.53,cn+.56,cz+1.18],[ce+.53,cn,cz+1.18]],'#866958');
    ground(c,ce-.08,cn-.07,.7,.7,cz+1.2,'#d6bea0');ground(c,ce+.06,cn+.06,.42,.43,cz+1.21,'#524747');
    if(style%3===0){
      // 有门廊的红瓦屋；矮柱落在门阶两侧，入口保持通畅。
      for(const e of [2.82,4.39])rail(c,[e,-.69,0],[e,-.69,2.12],'#927958',1.2);
      face(c,[[2.65,-.84,2.13],[4.56,-.84,2.13],[4.56,.035,2.44],[2.65,.035,2.44]],'#77958c');
      rail(c,[2.65,-.84,2.13],[4.56,-.84,2.13],'#e2d0aa',1);
    }else if(style%3===1){
      const e=4.6,n=.48,z=height(n);
      front(c,e,n,z,1.05,.58,'#dfcbae');
      front(c,e+.19,n-.02,z+.1,.69,.37,'#57818b');
      face(c,[[e,n,z+.57],[e+1.05,n,z+.57],[e+.525,n,z+1.1]],'#ead7b7');
      face(c,[[e-.12,n-.14,z+.54],[e+.525,n-.14,z+1.18],[e+.525,n+.83,z+1.18],[e-.12,n+.83,z+.54]],'#8ea4a4');
      face(c,[[e+1.17,n-.14,z+.54],[e+.525,n-.14,z+1.18],[e+.525,n+.83,z+1.18],[e+1.17,n+.83,z+.54]],'#53696e');
    }else{
      for(const e of panes){
        front(c,e-.58,-.18,.65,1.16,.22,'#945d44');
        for(let i=0;i<6;i++){const p=plan(e-.45+i*.18,-.2,.92+Math.sin(i)*.07);dot(c,p,1.5,1.14,'#628253');dot(c,p,.75,.7,i%2?'#f7b276':'#ed8872');}
      }
    }
  }
  // 动物的长轴跟随地面行进方向，朝屏幕纵向走时会自然缩短。
  function actorProject(heading){
    const angle=heading*Math.PI/4,azimuth=Math.atan2(Math.sin(angle)/Math.SQRT1_2,Math.cos(angle));
    const cs=Math.cos(azimuth),sn=Math.sin(azimuth),m=farm.meter;
    return (x,y,z)=>({x:20+m*(x*cs-y*sn),y:22+m*Math.SQRT1_2*(x*sn+y*cs-z)});
  }
  // 椭球经正交投影后的轮廓。牛身、肩胛、头部在八个朝向使用同一套骨架。
  function oval(c,p,x,y,z,rx,ry,rz,color){
    const o=p(x,y,z),axes=[p(x+rx,y,z),p(x,y+ry,z),p(x,y,z+rz)];
    let xx=0,xy=0,yy=0;
    for(const a of axes){const dx=a.x-o.x,dy=a.y-o.y;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
    const sum=(xx+yy)/2,d=Math.hypot((xx-yy)/2,xy);
    c.fillStyle=color;c.beginPath();c.ellipse(o.x,o.y,Math.sqrt(sum+d),Math.sqrt(Math.max(.001,sum-d)),.5*Math.atan2(2*xy,xx-yy),0,Math.PI*2);c.fill();
  }
  const coats=[['#f4ebd8','#4b423b'],['#b87849','#f2d2a1'],['#f5efe2','#383c41'],['#975a3d','#694237'],['#e8d3a8','#a98359'],['#f2e2c8','#685145']];
  function cow(c,style,heading,step,pose){
    const p=actorProject(heading),[base,mark]=coats[style%6],rest=pose==='rest',graze=pose==='graze';
    const theta=Math.atan2(Math.sin(heading*Math.PI/4)/Math.SQRT1_2,Math.cos(heading*Math.PI/4));
    const spine=rest?.58:1.04,near=Math.cos(theta)>=0?1:-1;
    const leg=(x,y,i)=>{
      const stride=Math.sin(step*Math.PI/2+i*Math.PI)*.16+(y>0?.045:-.045);
      const knee=p(x+(rest?.27:stride*.45),y,rest?.12:.39),hoof=p(x+(rest?.48:stride),y,rest?.09:.065);
      stroke(c,p(x,y,spine-.12),knee,base,2.15);stroke(c,knee,hoof,'#bea58c',1.55);dot(c,hoof,1.06,.72,'#473f3c');
    };
    for(const side of [-near,near])for(const [i,x] of [-.66,.52].entries())leg(x,side*.31,i+(side===near?1:0));
    const tail=p(-1.01,.12,spine+.12),tip=p(-1.19,.22+.07*step,spine-.43);
    stroke(c,tail,tip,mark,.95);dot(c,tip,1,1.55,mark);
    const withers=p(-.08,0,spine+.43),belly=p(-.08,0,spine-.43);
    const hide=c.createLinearGradient(withers.x,withers.y,belly.x,belly.y+1.2);
    hide.addColorStop(0,base);hide.addColorStop(.65,base);hide.addColorStop(1,['#c2ae97','#955f40','#beae9d','#784e39','#b5a184','#c3ae93'][style%6]);
    oval(c,p,-.09,0,spine,.96,.37,.435,hide);
    oval(c,p,.59,0,spine+.035,.43,.34,.43,hide);
    // 斑块贴在椭球表面，绕过背线的部分随朝向消隐。
    const spots=[[-.53,.71,.29,.53],[.12,1.12,.38,.62],[.54,.48,.23,.54],[-.22,-.65,.34,.62],[.44,-1.04,.27,.58]];
    for(const [cx,phi,rx,span] of spots){
      const pts=[];
      for(let i=0;i<20;i++){
        const a=i*Math.PI/10,v=Math.min(.96,Math.max(-.96,cx+rx*Math.cos(a)*(1+.14*Math.sin(3*a+style)))),cross=Math.sqrt(1-v*v);
        const f=phi+span*Math.sin(a)*(1+.12*Math.cos(3*a+style));
        const y=cross*Math.sin(f),z=cross*Math.cos(f);
        // 只画朝向镜头的表面。
        if(v*Math.sin(theta)/.96+y*Math.cos(theta)/.37+z/.435>0)pts.push(p(-.09+v*.96,y*.37,spine+z*.435));
      }
      if(pts.length>2)polygon(c,pts,mark);
    }
    const neck=graze?.59:spine+.13,head=graze?.36:rest?.75:1.19,fx=farm.cow/2-.09;
    stroke(c,p(.62,0,spine+.02),p(fx-.09,0,neck),base,5.8);
    oval(c,p,fx,0,head,.29,.204,.25,mark);
    oval(c,p,fx+.09,0,head+.12,.095,.115,.084,base);
    for(const side of [-1,1]){
      oval(c,p,fx-.09,side*.24,head+.13,.13,.15,.067,mark);
      stroke(c,p(fx-.065,side*.13,head+.19),p(fx-.12,side*.215,head+.34),'#dcc59b',.87);
    }
    oval(c,p,fx+.19,0,head-.105,.155,.168,.115,'#cdad95');
    dot(c,p(fx+.09,near*.17,head+.065),.59,.59,'#302e31');
    dot(c,p(fx+.29,near*.095,head-.09),.43,.38,'#715b50');
  }
  const shirts=['#416e89','#b96143','#ba914a','#538275','#835a75','#818959'];
  const kids=['#f76b4e','#32a3b5','#ffc84c','#ca6996'];
  function person(c,style,heading,step,pose,child){
    const crouch=['crouch','pet','pull'].includes(pose);
    const p=actorProject(heading),h=child?farm.child:farm.adult,seat=crouch?.64:pose==='sit'?.76:1;
    const lean=typeof pose==='number'?pose/4:0,angle=lean*1.49,cs=Math.cos(angle),sn=Math.sin(angle);
    const point=(x,y,z)=>p((x*cs+(.48-z)*sn)*h,y*h,(z*seat*cs+(x+.10)*sn)*h);
    const limb=(a,b,color,w)=>stroke(c,point(...a),point(...b),color,w);
    const shirt=child?kids[style%4]:shirts[style%6],denim=child?'#435976':'#444f56',skin=['#e4ba8e','#cc986e','#edc79d'][style%3];
    const stride=Math.sin(step*Math.PI/2)*(child?.21:.14),near=Math.cos(heading*Math.PI/4)>=0?1:-1;
    for(const side of [-near,near]){
      const toe=crouch||pose==='sit'?.22:side*stride,foot=point(toe,side*.075,.045);
      const knee=[(toe+.09)*.54+(side===near?.09:.025)*lean,side*.082,.27];
      limb([0,side*.07,.51],knee,denim,child?1.46:2.1);
      limb(knee,[toe,side*.075,.09],child?'#d5a77e':'#4b5860',child?1.17:1.76);
      dot(c,foot,child?.95:1.22,.78,'#493f38');
    }
    oval(c,point,0,0,.57,.136,.16,.22,shirt);
    if(child){oval(c,point,-.113,0,.61,.091,.137,.147,'#edaa50');oval(c,point,.074,0,.64,.081,.152,.037,'#ffdda6');}
    else {oval(c,point,.092,0,.55,.065,.134,.16,'#596c70');limb([.10,-.095,.72],[.11,-.085,.57],'#52676a',.8);}
    for(const side of [-near,near]){
      const hand=[pose==='tool'?.23:-side*stride+.075*lean,side*(.17-.08*lean),pose==='tool'?.6:.40+(side===near?.18:.44)*lean];
      if(crouch){hand[0]=pose==='pull'?.33:.24;hand[2]=pose==='pet'?.28:.43;}
      if((pose==='throw'||pose==='beckon'||pose==='look')&&side===near){
        hand[0]=pose==='throw'?.32:.12;hand[2]=pose==='beckon'?.99:.9;
      }
      const elbow=[hand[0]*.65,side*(.17+.095*lean),.54+.12*lean];
      limb([0,side*.13,.72],elbow,shirt,child?1.49:2.1);
      limb(elbow,hand,skin,child?1.12:1.52);
    }
    oval(c,point,.015,0,.87,child?.156:.112,child?.15:.106,child?.14:.127,skin);
    if(child){
      oval(c,point,-.015,0,.95,.15,.154,.074,style%2?'#704b3e':shirt);
      if(style%2)for(const side of [-1,1])dot(c,point(-.08,side*.145,.85),1.1,1.3,'#704b3e');
      else oval(c,point,.14,0,.94,.117,.135,.019,shirt);
    }else if(style%3!==1){
      oval(c,point,0,0,.976,.177,.155,.026,'#e0c188');
      oval(c,point,-.014,0,1.005,.115,.10,.059,'#ad8758');
    }else oval(c,point,-.019,0,.956,.123,.12,.076,'#61463b');
  }
  function sheep(c,heading,step,pose,lamb,style){
    const p0=actorProject(heading),scale=lamb?.64:1;
    const p=(x,y,z)=>p0(x*scale,y*scale,z*scale);
    const down=pose==='rest',graze=pose==='graze',z=down?.37:.68;
    const feet=['#564d45','#756858','#5c5046'][style];
    for(const side of [-1,1])for(const [j,x] of [-.38,.32].entries()){
      const swing=Math.sin((step+j*2+(side+1))*Math.PI/2)*.12;
      const hoof=p(x+(down?.19:swing),side*.16,.045);
      stroke(c,p(x,side*.16,z-.12),hoof,feet,lamb?1.13:1.45);
    }
    const fleece=['#faf0d8','#e9dfcb','#fff6e4'][style];
    oval(c,p,-.07,0,z,.58,.29,.31,'#c4bba8');
    for(const [x,y,d] of [[-.38,-.10,.22],[-.13,-.09,.29],[.14,-.09,.26],[.31,0,.2],[-.34,.12,.24],[-.05,.12,.31],[.18,.12,.23]]){
      oval(c,p,x,y,z+.085,d,.19,.225,fleece);
    }
    const head=graze?.29:down?.59:.83,fx=graze?.69:.57;
    stroke(c,p(.35,0,z+.02),p(fx,0,head),feet,2.7*scale);
    oval(c,p,fx,0,head,.20,.126,.17,feet);
    oval(c,p,fx-.04,0,head+.12,.15,.14,.095,fleece);
    for(const side of [-1,1])oval(c,p,fx-.047,side*.16,head+.041,.12,.11,.043,feet);
    oval(c,p,fx+.12,0,head-.07,.11,.11,.076,lamb?'#ad9186':'#655751');
    oval(c,p,-.60,0,z-.08,.10,.12,.13,fleece);
  }
  function collie(c,heading,step,pose){
    const p=actorProject(heading),rest=pose==='rest',crouch=pose==='work',bound=pose==='bound';
    const gait=Math.sin(step*Math.PI/2),z=rest?.25:crouch?.40:bound?.52+.06*Math.abs(gait):.49;
    const black='#30343b',white='#f4ead7',stride=gait*(bound?.34:.21);
    for(const side of [-1,1])for(const [i,x] of [-.39,.29].entries()){
      const foot=p(x+(rest?.2:stride*side*(i===0?-1:1)),side*.12,.035);
      const knee=p(x+(i===0?-.10:.06),side*.125,z*.48);
      stroke(c,p(x,side*.12,z),knee,black,1.5);stroke(c,knee,foot,white,1.13);
    }
    const tail=p(-.91,.04,z+.16+Math.cos(step*Math.PI/2)*.08);
    stroke(c,p(-.42,0,z+.05),p(-.74,.03,z+.01),black,2.5);
    stroke(c,p(-.74,.03,z+.01),tail,white,1.8);
    oval(c,p,-.09,0,z,.48,.177,.20,black);oval(c,p,.28,0,z+.07,.20,.198,.228,white);
    const neck=z+(crouch?.10:.20);
    oval(c,p,.48,0,neck,.215,.15,.17,black);oval(c,p,.655,0,neck-.055,.16,.093,.078,white);
    oval(c,p,.766,0,neck-.03,.05,.071,.046,black);
    for(const side of [-1,1])polygon(c,[p(.34,.085*side,neck+.10),p(.36,.17*side,neck+.32),p(.51,.12*side,neck+.12)],black);
    stroke(c,p(.48,0,neck+.15),p(.62,0,neck+.055),white,.95);
  }
  const dogCoats=[['#bf7839','#fff0c9','#77432d'],['#59463e','#cf915c','#352f31'],['#f3debc','#895239','#684a3b']];
  function yardDog(c,style,heading,step,pose){
    const p=actorProject(heading),[coat,bib,ear]=dogCoats[style%3];
    const gait=Math.sin(step*Math.PI/2),sleep=pose==='curl',low=['sniff','pull','stretch'].includes(pose);
    const z=sleep?.20:.42,neck=sleep?.29:low?.36:pose==='tilt'?.78:.70;
    for(const side of [-1,1])for(const [i,x] of [-.32,.27].entries()){
      const toe=x+(sleep?.16:gait*.19*side*(i?1:-1))+(low&&i?.17:0);
      stroke(c,p(x,side*.14,z),p(toe,side*.15,.045),i?bib:ear,1.55);
    }
    oval(c,p,-.07,0,z,.48,.205,.218,coat);
    if(style===2)oval(c,p,-.22,-.05,z+.11,.26,.16,.13,ear);
    const wag=pose==='wag'?gait*.29:gait*.07;
    const tip=p(sleep?.04:-.69,sleep?.24:wag+.14,sleep?.21:low?.47:.86);
    const bend=p(sleep?-.44:-.72,.12+wag*.35,sleep?.24:.54);
    stroke(c,p(-.46,0,z),bend,coat,2.6);stroke(c,bend,tip,bib,1.85);
    const headX=sleep?.31:low?.58:.44;
    oval(c,p,.28,0,z+.065,.20,.18,.21,bib);
    oval(c,p,headX,0,neck,.23,.168,.19,coat);
    for(const side of [-1,1])oval(c,p,headX-.12,.15*side,neck+.03,.105,.075,.185,ear);
    oval(c,p,headX+.16,.015,neck-.057,.16,.12,.10,bib);
    dot(c,p(headX+.285,0,neck-.03),.73,.61,'#393332');
    dot(c,p(headX+.105,Math.cos(heading*Math.PI/4)>=0?.13:-.13,neck+.045),.51,.57,'#302e2c');
    if(!sleep)stroke(c,p(.34,-.12,z+.16),p(.36,.14,z+.17),['#457e81','#bc6c51','#64829b'][style%3],1.1);
  }
  function sparrow(c,mode,frame,twig){
    const fly=mode==='fly',sleep=mode==='sleep',preen=sleep||mode==='preen'&&frame===2;
    const peck=(mode==='peck'||mode==='weave')&&frame%2===1;
    const p=(x,y)=>({x:8+x,y:9+y+(sleep?.6:0)});
    polygon(c,[p(-1,-1),p(-5.9,-2.7),p(-4.6,-.4),p(-1,.3)],'#665346');
    dot(c,p(0,-.85),2.85,1.65,'#cda578');dot(c,p(-.65,-1.4),2.14,1.25,'#816650');
    const head=p(preen?-.5:2,peck?.1:sleep?-1.65:-2.35);
    dot(c,head,1.5,1.5,'#705445');dot(c,{x:head.x+.73,y:head.y+.33},.74,.58,'#f4ddae');
    polygon(c,[{x:head.x+1,y:head.y-.3},{x:head.x+2.9,y:head.y+.15},{x:head.x+1,y:head.y+.6}],'#453d34');
    if(fly){const tip=[-5,-2,2,-2][frame];polygon(c,[p(1,-1),p(-2,tip-1.5),p(-4.5,tip-2.4),p(-2,-.25)],'#544a42');}
    else {stroke(c,p(-.4,.2),p(-.7,1.1),'#69513a',.65);stroke(c,p(1,.2),p(1.4,1),'#69513a',.65);}
    if(twig||mode==='weave')stroke(c,p(3.5,-2.6),p(6.5,-.8),'#cbae69',.72);
  }
  function pasture(c,index,wear){
    const rnd=random(305+index);
    for(let i=0;i<135;i++){
      const angle=rnd()*Math.PI*2,r=Math.sqrt(rnd()),x=66+Math.cos(angle)*r*61,y=43+Math.sin(angle)*r*37;
      const length=(1+rnd()*2.4)*(1-wear*.23);
      stroke(c,{x:x-1,y:y+.4},{x,y:y-length},i%3?'#5a80539c':'#b4ba6e9c',.76);
      if(i%8===0&&i/135>wear*.22)dot(c,{x,y:y-length},.86,.66,'#efe0a6');
    }
  }
  function fold(c,part,closed,site){
    const f=PastoralFlock.fence,k=PastoralFlock.kennel;
    const at=(x,y)=>PastoralFlock.offset(site,x,y);
    const rail=(x,y,xx,yy,col,w)=>stroke(c,{x,y},{x:xx,y:yy},col,w);
    const post=(x,y)=>{rail(x+1,y,x+4,y+2,'#6a5e513b',1.6);rail(x,y,x,y-8.4,'#705b47',2.25);dot(c,{x,y:y-8.4},1.34,.76,'#d9bc8c');};
    const side=(x,y,xx,yy)=>{
      for(const h of [3,6.5])rail(x,y-h,xx,yy-h,'#a98760',1.55);
      const n=Math.ceil(Math.hypot(xx-x,yy-y)/17);
      for(let i=0;i<=n;i++)post(x+(xx-x)*i/n,y+(yy-y)*i/n);
    };
    if(part==='ground'){
      c.save();
      if(site.vertical)c.transform(0,site.sign,1,0,0,0);else c.scale(site.sign,1);
      const rnd=random(867);
      for(let i=0;i<615;i++){
        const x=f.left+2+rnd()*(f.right-f.left-4),y=-f.half+2+rnd()*(2*f.half-4);
        rail(x,y,x+1.1+rnd()*2.2,y-.6,i%3?'#bcaa6d70':'#e2cc8f9c',.77);
      }
      c.fillStyle='#796854';c.fillRect(f.left+6,-f.half+4,19,5);
      c.fillStyle='#9cb9ad';c.fillRect(f.left+7,-f.half+4.7,17,2.6);
      c.restore();
    }else if(typeof part==='number'){
      const [x,y,xx,yy]=PastoralFlock.rails[part],a=at(x,y),b=at(xx,yy);side(a.x,a.y,b.x,b.y);
    }else if(part==='gate'){
      const start=at(f.right,-f.opening),end=closed?at(f.right,f.opening):at(f.right+f.opening*1.55,-f.opening+8);
      for(const h of [2.4,7])rail(start.x,start.y-h,end.x,end.y-h,'#b99973',1.35);
      rail(start.x,start.y-2.4,end.x,end.y-7,'#856d53',1.1);
      rail(end.x,end.y-7,end.x,end.y-1.6,'#715c49',1.25);
    }else{
      const base=at(k.x,k.y),x=base.x-12,y=base.y-4;
      polygon(c,[{x:x-2,y},{x:x+13,y:y+2},{x:x+24,y:y-3},{x:x+8,y:y-6}],'#806c514d');
      polygon(c,[{x,y},{x:x+14,y:y+2},{x:x+14,y:y-6},{x:x+7,y:y-12},{x,y:y-8}],'#d9ad79');
      polygon(c,[{x:x+14,y:y+2},{x:x+23,y:y-3},{x:x+23,y:y-10},{x:x+14,y:y-6}],'#a07855');
      c.fillStyle='#503f37';c.beginPath();c.arc(x+7,y-3,3.5,Math.PI,0);c.lineTo(x+10.5,y+.8);c.lineTo(x+3.5,y);c.fill();
      polygon(c,[{x:x-2,y:y-7},{x:x+7,y:y-14},{x:x+17,y:y-18},{x:x+7,y:y-11}],'#87a09a');
      polygon(c,[{x:x+7,y:y-14},{x:x+16,y:y-6},{x:x+25,y:y-11},{x:x+17,y:y-18}],'#577b77');
    }
  }
  return {yard,kennel,nest,table,cottage,panes,cow,person,sheep,collie,yardDog,sparrow,fold,pasture,polygon,stroke,dot};
})();
