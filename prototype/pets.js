'use strict';
const petDefaults={engine:47,enabled:1,breed:'ragdoll',scale:53,badges:1,through:1,topmost:1,x:-99999,y:-99999,layout:'65',orientation:'cat',sound:0,privacy:1,mcp:0,paused:0};
let petState={v:{...petDefaults},running:false,total:0,kpm:0,cats:null,error:''};
let desklandSection='themes',petCardSignature='';
const escapePet=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function petCatalog(){return Array.isArray(petState.cats)&&petState.cats.length?petState.cats:window.DesklandPetPreview?.cats||[];}
function petName(cat){const key='petName_'+cat.id.replace(/-/g,'_'),name=t(key);return name===key?cat.name:name;}
function showDesklandSection(section){
  desklandSection=section==='pets'?'pets':'themes';document.getElementById('themesView').hidden=desklandSection!=='themes';document.getElementById('petsView').hidden=desklandSection!=='pets';
  for(const name of ['themes','pets']){const tab=document.getElementById(name+'Tab');tab.classList.toggle('active',name===desklandSection);tab.setAttribute('aria-pressed',String(name===desklandSection));}
  if(desklandSection==='themes')layoutPreview();else renderPets();
}
function drawPetPreviews(){
  requestAnimationFrame(()=>{if(desklandSection!=='pets')return;const cats=petCatalog();for(const el of document.querySelectorAll('[data-pet-breed]'))window.DesklandPetPreview?.draw(el.querySelector('canvas'),el.dataset.petBreed,cats.find(c=>c.id===el.dataset.petBreed));});
}
function renderPetCards(force=false){
  const cats=petCatalog(),signature=JSON.stringify(cats)+lang;
  if(!force&&signature===petCardSignature)return false;petCardSignature=signature;
  window.DesklandPetPreview?.clear(document.getElementById('petList'));
  document.getElementById('petList').innerHTML=cats.map(cat=>`<button class="pet-option" data-pet-breed="${escapePet(cat.id)}" aria-pressed="false"><span class="pet-art"><canvas aria-label="${escapePet(petName(cat))}" role="img"></canvas></span><span class="pet-copy"><strong>${escapePet(petName(cat))}</strong><small>${t('petChoose')}</small></span></button>`).join('');
  drawPetPreviews();return true;
}
function renderPets(){
  if(!renderPetCards())drawPetPreviews();
  const select=(key,label,values)=>`<div class="pet-field"><label>${t(label)}<select data-pet-key="${key}" aria-label="${t(label)}">${values.map(([v,l])=>`<option value="${v}">${t(l)}</option>`).join('')}</select></label></div>`;
  document.getElementById('petControls').innerHTML=select('layout','petLayout',[['65','petLayout65'],['108','petLayout108']])+select('orientation','petOrientation',[['cat','petFacingCat'],['viewer','petFacingViewer']])+`<div class="pet-field"><label for="petScale">${t('petSize')}<output id="petScaleValue"></output></label><input id="petScale" data-pet-key="scale" type="range" min="20" max="150" step="1"></div>`+
    ['topmost','through','badges','sound','privacy','paused','mcp'].map(key=>`<div class="pet-field"><label class="switch-row"><span>${t('pet_'+key)}</span><input type="checkbox" data-pet-key="${key}"><i class="switch"></i></label></div>`).join('')+
    `<div class="pet-actions"><button class="ghost-btn" id="petCopyMcp">${t('petCopyMcp')}</button><button class="ghost-btn" id="petEditSkin">${t('petEditSkin')}</button><button class="ghost-btn" id="petAdmin" title="${t('petAdminHint')}">${t('petAdmin')}</button></div><details class="pet-editor" id="petSkinEditor"><summary>${t('petSkinJson')}</summary><p class="hint">${t('petSkinHint')}</p><textarea id="petSkinJson" spellcheck="false" aria-label="${t('petSkinJson')}"></textarea><div class="pet-actions"><button class="ghost-btn" id="petSaveSkin">${t('petSaveSkin')}</button><button class="ghost-btn" id="petDeleteSkin">${t('petDeleteSkin')}</button></div></details>`;
  updatePetControls();
}
function updatePetControls(){
  const v=petState.v;document.getElementById('petEnabled').checked=v.enabled===1;document.getElementById('petEnabled').setAttribute('aria-label',t('petEnabled'));
  for(const el of document.querySelectorAll('[data-pet-key]')){if(el===document.activeElement)continue;if(el.type==='checkbox')el.checked=v[el.dataset.petKey]===1;else el.value=v[el.dataset.petKey];}
  document.getElementById('petScaleValue').textContent=v.scale+'%';
  for(const el of document.querySelectorAll('[data-pet-breed]')){const chosen=el.dataset.petBreed===v.breed;el.classList.toggle('selected',chosen);el.setAttribute('aria-pressed',String(chosen));el.querySelector('small').textContent=t(chosen?'petChosen':'petChoose');}
  document.getElementById('petStatus').textContent=!host?t('petBrowser'):petState.error?t('petError'):v.enabled!==1?t('petOff'):v.paused===1?t('petPaused'):petState.running?t('petRunning'):t('petStarting');
  document.getElementById('petStats').textContent=t('petStats',{total:petState.total,kpm:petState.kpm});
  for(const name of ['petDemo','petPosition','petEditSkin','petSaveSkin','petDeleteSkin']){const el=document.getElementById(name);if(el)el.disabled=!!host&&!petState.running||name==='petEditSkin'&&v.breed==='dafeiyu';}
}
function receivePet(message){petState={...petState,...message,v:{...petDefaults,...message.v}};renderPetCards();updatePetControls();}
function setPet(key,value){petState.v[key]=value;updatePetControls();send({t:'petSet',key,value});}
document.getElementById('themesTab').addEventListener('click',()=>showDesklandSection('themes'));
document.getElementById('petsTab').addEventListener('click',()=>showDesklandSection('pets'));
document.getElementById('petEnabled').addEventListener('change',e=>setPet('enabled',Number(e.target.checked)));
document.getElementById('petList').addEventListener('click',e=>{const option=e.target.closest('[data-pet-breed]');if(option)setPet('breed',option.dataset.petBreed);});
document.getElementById('petControls').addEventListener('input',e=>{const key=e.target.dataset.petKey;if(key)setPet(key,e.target.type==='checkbox'?Number(e.target.checked):e.target.type==='range'?+e.target.value:e.target.value);});
document.getElementById('petControls').addEventListener('click',e=>{
  if(e.target.id==='petAdmin')send({t:'petAdmin'});
  if(e.target.id==='petCopyMcp'){send({t:'petCopyMcp'});e.target.textContent=t('petCopied');}
  if(e.target.id==='petEditSkin'){
    const base=petCatalog().find(c=>c.id===petState.v.breed);if(!base)return;
    const skin={...base,id:base.builtin?'my-'+base.id:base.id,name:base.builtin?t('petCustomName'):base.name,builtin:false};
    document.getElementById('petSkinJson').value=JSON.stringify(skin,null,2);document.getElementById('petSkinEditor').open=true;
  }
  if(e.target.id==='petSaveSkin'){try{send({t:'petSkin',v:JSON.parse(document.getElementById('petSkinJson').value)});}catch{alert(t('petInvalidJson'));}}
  if(e.target.id==='petDeleteSkin')send({t:'petDeleteSkin',id:petState.v.breed});
});
document.getElementById('petDemo').addEventListener('click',()=>send({t:'petAction',action:'demo'}));
document.getElementById('petPosition').addEventListener('click',()=>send({t:'petAction',action:'position'}));
document.getElementById('petReset').addEventListener('click',()=>{petState.v={...petDefaults};updatePetControls();send({t:'petReset'});});
