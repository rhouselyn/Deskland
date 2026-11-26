// 默认使用城市级参考地点，用户定位与手动修改保存在本机。
let pastoralLocateAttempted=false;
let pastoralBandKey='';
function pastoralSettingsMarkup(){return state.theme==='pastoral'?`<div class="group" id="pastoralSettings"><h3>${t('worldLocation')}</h3><p class="hint" id="pastoralLocationStatus" role="status"></p><button class="ghost-btn" id="worldLocate">${t('worldLocate')}</button><form id="worldLocationForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><label>${t('worldLatitude')}<input id="worldLat" type="number" min="-90" max="90" step="any" required style="width:100%"></label><label>${t('worldLongitude')}<input id="worldLon" type="number" min="-180" max="180" step="any" required style="width:100%"></label><label style="grid-column:1/-1">${t('worldTimezone')}<input id="worldZone" placeholder="Asia/Shanghai" style="width:100%"></label><button class="ghost-btn" type="submit" style="grid-column:1/-1">${t('worldSaveLocation')}</button></form></div>`:'';}
function renderPastoralSettings(){
  syncPastoralClock();
  const el=document.getElementById('pastoralSettings');if(!el)return;
  el.hidden=state.theme!=='pastoral';if(el.hidden)return;
  const loc=valuesOf(themeById('pastoral')).location;
  document.getElementById('pastoralLocationStatus').textContent=loc?t('worldLocationSet',{lat:loc.lat.toFixed(3),lon:loc.lon.toFixed(3)}):t('worldLocationMissing');
  if(loc){document.getElementById('worldLat').value=loc.lat;document.getElementById('worldLon').value=loc.lon;document.getElementById('worldZone').value=loc.zone||Intl.DateTimeFormat().resolvedOptions().timeZone;}
  if(!loc&&!pastoralLocateAttempted){pastoralLocateAttempted=true;setTimeout(locatePastoral,500);}
}
function syncPastoralClock(){
  if(state.theme!=='pastoral')return;
  const slider=document.querySelector('input[data-key="fixedTime"]');if(!slider)return;
  const live=valuesOf(themeById('pastoral')).realTime!==0;
  slider.disabled=live;
  document.getElementById('p-fixedTime').style.opacity=live?'.5':'1';
  document.querySelector('[data-reset="fixedTime"]').disabled=live;
  slider.setAttribute('aria-valuetext',fmt(paramOf('fixedTime'),+slider.value));
  let strip=document.getElementById('worldTimeStrip');
  if(!strip){strip=document.createElement('div');strip.id='worldTimeStrip';strip.innerHTML='<p id="worldTimeStatus" role="status" style="font-size:12px;margin:10px 0 8px"></p><div id="worldTimeBand" style="height:10px;position:relative;border-radius:5px"></div><p id="worldSunTimes" style="font-size:11px;margin:8px 0;opacity:.75"></p>';document.getElementById('p-fixedTime').after(strip);pastoralBandKey='';}
  const loc=valuesOf(themeById('pastoral')).location,now=PastoralCore.worldDate(new Date(),valuesOf(themeById('pastoral')),loc?.zone),solar=PastoralLight.solar(now,loc);
  const minute=solar.minute??now.getHours()*60+now.getMinutes();
  const caption=(live?t('worldTimeLive'):t('worldTimeFixed'))+' · '+fmt(paramOf('fixedTime'),minute)+' · '+t('worldPhase_'+solar.palette.phase);
  const status=document.getElementById('worldTimeStatus');if(status.textContent!==caption)status.textContent=caption;
  const key=JSON.stringify([solar.day,loc,lang]);if(key===pastoralBandKey)return;pastoralBandKey=key;
  const band=document.getElementById('worldTimeBand'),stops=[];
  for(let m=0;m<=1440;m+=60){const date=PastoralCore.worldDate(new Date(),{realTime:0,fixedTime:Math.min(m,1439)},loc?.zone),s=PastoralLight.solar(date,loc);stops.push(`rgb(${s.palette.accent.map(c=>Math.round(c*255))}) ${m/1440*100}%`);}
  band.style.background='linear-gradient(90deg,'+stops.join(',')+')';band.setAttribute('role','img');band.setAttribute('aria-label',t('worldTimeBand'));band.replaceChildren();
  const format=date=>new Intl.DateTimeFormat(lang,{timeZone:loc?.zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  if(solar.located){for(const [name,key] of [['Dawn','dawn'],['Sunrise','sunrise'],['Noon','noon'],['Sunset','sunset'],['Dusk','dusk']]){if(!Number.isFinite(solar[key]))continue;const date=new Date(solar[key]),s=PastoralLight.solar(date,loc),mark=document.createElement('span');mark.style.cssText=`position:absolute;left:${s.minute/1440*100}%;top:-3px;height:16px;width:2px;background:rgba(255,255,255,.85)`;mark.tabIndex=0;mark.title=t('worldMarker'+name)+' '+format(date);mark.setAttribute('aria-label',mark.title);band.appendChild(mark);}}
  document.getElementById('worldSunTimes').textContent=solar.sunrise&&solar.sunset?t('worldMarkerSunrise')+' '+format(new Date(solar.sunrise))+' · '+t('worldMarkerSunset')+' '+format(new Date(solar.sunset)):'';
}
setInterval(()=>{if(state.theme==='pastoral')syncPastoralClock();},15000);
function savePastoralLocation(loc){
  if(!Number.isFinite(loc.lat)||!Number.isFinite(loc.lon)||Math.abs(loc.lat)>90||Math.abs(loc.lon)>180)throw Error(t('worldInvalidLocation'));
  new Intl.DateTimeFormat('en',{timeZone:loc.zone}).format(new Date());
  state.params.pastoral ||= {};state.params.pastoral.location=loc;
  send({t:'set',theme:'pastoral',key:'location',value:loc});
  if(!host)localStorage.setItem('deskland-pastoral-location',JSON.stringify(loc));
  toPreview({t:'settings',v:{location:loc}});renderPastoralSettings();
}
function locatePastoral(){
  const status=document.getElementById('pastoralLocationStatus');status.textContent=t('worldLocating');
  if(!navigator.geolocation){status.textContent=t('worldLocationFailed');return;}
  navigator.geolocation.getCurrentPosition(p=>{
    try{savePastoralLocation({lat:Math.round(p.coords.latitude*1000)/1000,lon:Math.round(p.coords.longitude*1000)/1000,zone:Intl.DateTimeFormat().resolvedOptions().timeZone});}
    catch{status.textContent=t('worldLocationFailed');}
  },()=>{status.textContent=t('worldLocationFailed');},{enableHighAccuracy:false,timeout:25000,maximumAge:3600000});
}
document.addEventListener('click',e=>{if(e.target.id==='worldLocate')locatePastoral();});
document.addEventListener('submit',e=>{
  if(e.target.id!=='worldLocationForm')return;
  e.preventDefault();try{savePastoralLocation({lat:document.getElementById('worldLat').valueAsNumber,lon:document.getElementById('worldLon').valueAsNumber,zone:document.getElementById('worldZone').value.trim()||Intl.DateTimeFormat().resolvedOptions().timeZone});}
  catch{document.getElementById('pastoralLocationStatus').textContent=t('worldInvalidLocation');}
});
