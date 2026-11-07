// Theme picker plus the holiday and animation toggles. Themes come only from the
// packaged themes/ folder; there are no user-made or imported themes.
(async () => {
 'use strict';
 const engine=window.GCCXThemes;
 const select=document.querySelector('[data-theme-select]');
 if(!select || !engine)return;
 const holiday=document.getElementById('holiday-themes');
 const animation=document.getElementById('animate-themes');
 const active=document.getElementById('theme-active');
 let settings=(await chrome.storage.local.get('settings')).settings || {};
 async function save(patch){const latest=(await chrome.storage.local.get('settings')).settings || {};settings={...latest,...patch};await chrome.storage.local.set({settings});render();}
 function render(){
  const pickable=engine.pickable();
  select.replaceChildren(...pickable.map(t=>new Option(t.name,t.id)));
  select.value=pickable.some(t=>t.id===settings.designTheme)?settings.designTheme:engine.manifest.defaultTheme;
  if(holiday)holiday.checked=settings.holidayThemes!==false;
  if(animation)animation.checked=settings.animateThemes!==false;
  const chosen=engine.choose(settings);
  if(active)active.textContent=chosen.holiday ? `${chosen.theme.name} is active automatically for the holiday season. Your saved choice is ${chosen.selected.name}.` : `Showing ${chosen.theme.name}.`;
 }
 select.addEventListener('change',()=>save({designTheme:select.value}));
 holiday?.addEventListener('change',()=>save({holidayThemes:holiday.checked}));
 animation?.addEventListener('change',()=>save({animateThemes:animation.checked}));
 chrome.storage.onChanged.addListener(ch=>{if(ch.settings){settings=ch.settings.newValue||{};render();}});
 window.addEventListener('gccx-themes-loaded',render);
 render();
})();
