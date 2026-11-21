// 昼夜配色与太阳数据由桌面、预览和时间滑杆共用。
(function(root){
  'use strict';
  const sun=typeof module!=='undefined'&&module.exports?require('./vendor/suncalc.js'):root.SunCalc;
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const colors=['grassLight','grassMid','grassDeep','ink','shadow','cloudHi','cloudBody','cloudShade','ambient','accent'];
  const rows={
    night:['#387c96','#255875','#1b3e65','#183955','#61769c','#c1e5ff','#6388bd','#40558d','#819dce','#345f9f',1,.42],
    dawn:['#94aca0','#658e91','#526b86','#39536b','#8276a0','#ffd3bb','#c3b3d6','#8985b3','#ccbedb','#ae9fce',.55,.56],
    sunrise:['#e0dc73','#98bf51','#608d4b','#53663a','#8b7d9e','#fff2ba','#ffcf9f','#d291a7','#ffe6b8','#efba65',.05,.84],
    morning:['#c0df65','#81c14c','#519744','#315d31','#688b6a','#fffdea','#f4f5e8','#bacfdb','#fffdf1','#a6cf5d',0,.94],
    noon:['#b9df5a','#71bb45','#3e944b','#2a5f36','#517d6f','#fffff3','#eef5ed','#b1ccd9','#fffef7','#65b94b',0,1],
    afternoon:['#dcda6c','#a0bd50','#6e9545','#596f36','#7b826b','#fff3cc','#ffe5ba','#cfbabb','#fff0c9','#d3c664',0,.94],
    sunset:['#efbd76','#b0a658','#788951','#66533f','#927395','#fff0b9','#ffa18f','#c775a0','#ffb8a0','#ec8b75',.16,.84],
    blue:['#5488b2','#3a6698','#354b83','#2d3e69','#7773a4','#f4bdd8','#8a91cf','#6068a4','#b1b4e6','#7b87c6',.74,.52]
  };
  const palettes=Object.fromEntries(Object.entries(rows).map(([key,row])=>[key,{...Object.fromEntries(colors.map((name,i)=>[name,rgb(row[i])])),night:row[10],shade:row[11],phase:key}]));
  function blend(out,target,amount){
    for(const key of colors){out[key] ||= [...target[key]];for(let i=0;i<3;i++)out[key][i]+=(target[key][i]-out[key][i])*amount;}
    for(const key of ['night','shade'])out[key]=(out[key]??target[key])+(target[key]-(out[key]??target[key]))*amount;
    out.phase=target.phase;return out;
  }
  function palette(altitude,setting,progress=.5){
    const points=altitude>=12?[[0,'morning'],[.25,'morning'],[.46,'noon'],[.56,'noon'],[.82,'afternoon'],[1,'afternoon']]:setting?[[-90,'night'],[-10,'night'],[-6,'blue'],[-2,'blue'],[2,'sunset'],[8,'sunset'],[12,'afternoon']]:[[-90,'night'],[-10,'night'],[-6,'dawn'],[-1,'sunrise'],[4,'sunrise'],[12,'morning']];
    const v=altitude>=12?progress:altitude;
    let i=1;while(i<points.length-1&&v>points[i][0])i++;
    const [a,ka]=points[i-1],[b,kb]=points[i],t=Math.max(0,Math.min(1,(v-a)/(b-a))),s=t*t*(3-2*t);
    const out=blend({},palettes[ka],1);blend(out,palettes[kb],s);out.phase=s<.5?ka:kb;
    // 高纬度正午的太阳也可能很低，跨过日间阈值时保持调色连续。
    if(altitude>8&&altitude<12){const t=(altitude-8)/4,target=palette(12,setting,progress),phase=out.phase;blend(out,target,t*t*(3-2*t));if(t<.5)out.phase=phase;}
    return out;
  }
  function solar(date,location){
    const valid=location&&Number.isFinite(location.lat)&&Number.isFinite(location.lon)&&Math.abs(location.lat)<=90&&Math.abs(location.lon)<=180;
    if(!valid)return {altitude:40,azimuth:0,setting:false,progress:.5,day:'unlocated',light:[-.6,-.8],shadow:[115,156],located:false,palette:palette(40,false,.5)};
    const p=sun.getPosition(date,location.lat,location.lon),next=sun.getPosition(new Date(+date+60000),location.lat,location.lon);
    const altitude=p.altitude*180/Math.PI,setting=next.altitude<p.altitude;
    // 以地点当天的中午求晨昏，避免接近午夜时取到相邻的太阳日。
    const zone=location.zone||Intl.DateTimeFormat().resolvedOptions().timeZone;
    let formatter;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
    const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const day=parts.year+'-'+parts.month+'-'+parts.day,minute=Number(parts.hour)*60+Number(parts.minute);
    const noon=new Date(+date+(720-minute)*60000),times=sun.getTimes(noon,location.lat,location.lon),rise=+times.sunrise,set=+times.sunset;
    const progress=Number.isFinite(rise)&&Number.isFinite(set)?Math.max(0,Math.min(1,(date-rise)/(set-rise))):minute/1440;
    const paint=palette(altitude,setting,progress),dx=Math.sin(p.azimuth),dy=-Math.cos(p.azimuth),length=Math.min(190,38/Math.max(.18,Math.sin(Math.max(.05,p.altitude))));
    const moon=paint.night;
    return {altitude,azimuth:p.azimuth,setting,progress,day,minute,light:[dx*(1-moon)-.6*moon,dy*(1-moon)-.8*moon],shadow:[-dx*length*(1-moon)+40*moon,-dy*length*(1-moon)+54*moon],located:true,palette:paint,sunrise:Number.isFinite(rise)?rise:null,sunset:Number.isFinite(set)?set:null,noon:+times.solarNoon,dawn:Number.isFinite(+times.dawn)?+times.dawn:null,dusk:Number.isFinite(+times.dusk)?+times.dusk:null};
  }
  const api={palette,blend,solar};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PastoralLight=api;
})(globalThis);
