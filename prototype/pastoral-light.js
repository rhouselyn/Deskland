// 昼夜配色与太阳数据由桌面、预览和时间滑杆共用。
(function(root){
  'use strict';
  const defaults={location:{lat:22.6,lon:114.0,zone:'Asia/Shanghai'},seed:435975,
    realTime:0,fixedTime:1049,batterySaver:1,pauseWhenCovered:0,transparentTaskbar:1,
    sigma:40,cover:.3,flow:1,adaptive:1,showIconClouds:0,iconLighting:1,clickEffects:1,
    meteorWidth:.4,meteorBrightness:4.15,auroraWidth:1.4,auroraBrightness:1.2};
  const sun=typeof module!=='undefined'&&module.exports?require('./vendor/suncalc.js'):root.SunCalc;
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const colors=['grassLight','grassMid','grassDeep','ink','shadow','cloudHi','cloudBody','cloudShade','ambient','accent'];
  const rows={
    // 草地高光、中色、暗部、草纹、投影环境色；云边、云体、背光；村庄光色、色带；夜光、阴影、斜射光。
    night:['#395562','#263e4e','#233341','#192b36','#393362','#afd8dc','#5975a8','#3e396a','#809ac3','#294f86',1,.71,.14],
    dawn:['#9dceb1','#598f9e','#58649b','#405e79','#666498','#ffd0a6','#c6a8dc','#907bbb','#dfc7df','#c59ecb',.49,.69,.61],
    sunrise:['#f4e579','#98be54','#5f916b','#536c48','#76688e','#fff0a2','#ffc582','#d08da5','#ffe5b0','#f7bd65',.06,.9,.86],
    morning:['#b6e65c','#54b64e','#238451','#275e3c','#377555','#fffef2','#f1f5e5','#a9ced3','#fffbea','#59bf60',0,.94,.04],
    noon:['#f3f384','#a3d455','#378d59','#426d38','#396e66','#fffff8','#fffde7','#9dbfc9','#fff6dc','#d5e668',0,1,.02],
    afternoon:['#e9d76f','#a2b84c','#648d52','#716a37','#82715b','#fff2cb','#ffe2ac','#c7adb0','#ffe5bf','#d4be62',0,.85,.48],
    sunset:['#ff905b','#b19e4d','#62835b','#704e48','#834c75','#ffd493','#ff695c','#a64575','#ffb595','#ee7960',.21,.95,1],
    blue:['#548aab','#386a9b','#444780','#303f71','#514583','#ffafd1','#818bcd','#4e5296','#bfc3ef','#777fb9',.76,.8,.51]
  };
  const palettes=Object.fromEntries(Object.entries(rows).map(([key,row])=>[key,{...Object.fromEntries(colors.map((name,i)=>[name,rgb(row[i])])),night:row[10],shade:row[11],rake:row[12],highSun:key==='noon'?1:0,phase:key}]));
  function blend(out,target,amount){
    for(const key of colors){out[key] ||= [...target[key]];for(let i=0;i<3;i++)out[key][i]+=(target[key][i]-out[key][i])*amount;}
    for(const key of ['night','shade','rake','highSun'])out[key]=(out[key]??target[key])+(target[key]-(out[key]??target[key]))*amount;
    out.phase=target.phase;return out;
  }
  function palette(altitude,setting,progress=.5){
    const points=altitude>=12?[[0,'morning'],[.36,'morning'],[.47,'noon'],[.55,'noon'],[.82,'afternoon'],[1,'afternoon']]:setting?[[-90,'night'],[-10,'night'],[-6,'blue'],[-2,'blue'],[2,'sunset'],[8,'sunset'],[12,'afternoon']]:[[-90,'night'],[-10,'night'],[-6,'dawn'],[-1,'sunrise'],[4,'sunrise'],[12,'morning']];
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
    if(!valid)return {altitude:40,azimuth:0,setting:false,progress:.5,day:'unlocated',minute:date.getHours()*60+date.getMinutes(),light:[-.6,-.8],shadow:[26,35],located:false,palette:palette(40,false,.5)};
    const p=sun.getPosition(date,location.lat,location.lon),next=sun.getPosition(new Date(+date+60000),location.lat,location.lon);
    const altitude=p.altitude*180/Math.PI,setting=next.altitude<p.altitude;
    // 以地点当天的中午求晨昏，避免接近午夜时取到相邻的太阳日。
    const zone=location.zone||Intl.DateTimeFormat().resolvedOptions().timeZone;
    let formatter;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
    const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const day=parts.year+'-'+parts.month+'-'+parts.day,minute=Number(parts.hour)*60+Number(parts.minute);
    const noon=new Date(+date+(720-minute)*60000),times=sun.getTimes(noon,location.lat,location.lon),rise=+times.sunrise,set=+times.sunset;
    const progress=Number.isFinite(rise)&&Number.isFinite(set)?Math.max(0,Math.min(1,(date-rise)/(set-rise))):minute/1440;
    const paint=palette(altitude,setting,progress),dx=Math.sin(p.azimuth),dy=-Math.cos(p.azimuth),length=Math.min(190,38/Math.max(.18,Math.sin(Math.max(.05,p.altitude))))*(1-.27*paint.highSun);
    const moon=paint.night;
    return {altitude,azimuth:p.azimuth,setting,progress,day,minute,light:[dx*(1-moon)-.6*moon,dy*(1-moon)-.8*moon],shadow:[-dx*length*(1-moon)+40*moon,-dy*length*(1-moon)+54*moon],located:true,palette:paint,sunrise:Number.isFinite(rise)?rise:null,sunset:Number.isFinite(set)?set:null,noon:+times.solarNoon,dawn:Number.isFinite(+times.dawn)?+times.dawn:null,dusk:Number.isFinite(+times.dusk)?+times.dusk:null};
  }
  const api={defaults,palette,blend,solar};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PastoralLight=api;
})(globalThis);
