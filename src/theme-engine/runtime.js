// Theme engine shared by portal, popup and settings. No remote code or CSS.
// Themes come only from the packaged themes/<id>/ folders (loaded through the
// service worker). The GCC theme baked into default-theme.js is used until they
// load, and whenever the folder is missing or a pack is corrupt.
(() => {
 'use strict';
 const baked = window.GCCX_DEFAULT_THEME;
 const manifest = {defaultTheme: baked.id};
 let builtins = [baked];
 const root = document.documentElement;
 const ownUI = /-extension:$/.test(location.protocol) && /\/(popup|options)\//.test(location.pathname);
 const media = matchMedia('(prefers-color-scheme: dark)');
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 const keys = new Set(Object.keys(baked.light));
 let applied = new Set(), last = {}, stamp = '';
 const aliases = {'--bg':'--x-bg','--surface':'--x-surface','--ink':'--x-ink','--muted':'--x-muted','--faint':'--x-faint','--rule':'--x-rule','--rule-soft':'--x-rule','--accent':'--x-accent','--accent-hover':'--x-accent-hover','--on-accent':'--x-accent-ink','--soft':'--x-accent-soft','--bad':'--x-bad','--sans':'--x-sans','--display':'--x-display','--radius':'--x-radius-control','--speed':'--x-speed'};
 function validHolidayDate(value) {
  if(typeof value!=='string' || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
  return +value.slice(3)<=[31,29,31,30,31,30,31,31,30,31,30,31][+value.slice(0,2)-1];
 }
 function activeHoliday(holiday, date = new Date()) {
  if (!holiday || !validHolidayDate(holiday.start) || !validHolidayDate(holiday.end)) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  const today=parts.month+'-'+parts.day;
  return holiday.start<=holiday.end ? today>=holiday.start && today<=holiday.end : today>=holiday.start || today<=holiday.end;
 }
 function fallbackTheme() { return builtins.find(t=>t.type==='default') || baked; }
 // Only default and custom themes can be picked; holiday themes appear by date.
 function pickable() { return builtins.filter(t=>t.type==='default'||t.type==='custom'); }
 function choose(settings={}, date=new Date()) {
  const selected=pickable().find(t=>t.id===settings.designTheme) || fallbackTheme();
  const holiday=settings.holidayThemes!==false ? builtins.filter(t=>t.type==='holiday' && activeHoliday(t.holiday,date)).sort((a,b)=>(b.holiday.priority||0)-(a.holiday.priority||0)||a.id.localeCompare(b.id))[0] : null;
  return {theme:holiday || selected, selected, holiday:!!holiday};
 }
 function validate(input) {
  if (!input || input.schemaVersion!==1 || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(input.id||'') || typeof input.name!=='string' || !input.name.trim() || input.name.length>80) throw new Error('Use a version 1 theme with an id and a name of up to 80 characters.');
  const theme={schemaVersion:1,id:input.id,name:input.name.trim(),description:String(input.description||'').slice(0,300)};
  for (const mode of ['light','dark']) {
   if (!input[mode] || typeof input[mode]!=='object' || Array.isArray(input[mode])) throw new Error('Include both light and dark token objects.');
   theme[mode]={};
   for (const [key,value] of Object.entries(input[mode])) {
    if(!keys.has(key))throw new Error('Unknown theme token: '+key);
    if(typeof value!=='string' || value.length>200000)throw new Error('Invalid token value: '+key);
    if(key.endsWith('-art')) {
     if(value==='none'){theme[mode][key]=value;continue;}
     const gif=/^url\("data:image\/gif;base64,([A-Za-z0-9+/]+={0,2})"\)$/.exec(value);
     if(gif) {
      if(key!=='--x-header-art')throw new Error('GIFs are supported only for header artwork; static fallbacks must be SVG.');
      let bytes;try{bytes=atob(gif[1]);}catch(_){throw new Error('Invalid GIF encoding.');}
      const width=bytes.charCodeAt(6)+(bytes.charCodeAt(7)<<8),height=bytes.charCodeAt(8)+(bytes.charCodeAt(9)<<8);
      if(bytes.length<14 || bytes.length>131072 || !/^GIF8[79]a$/.test(bytes.slice(0,6)) || bytes.charCodeAt(bytes.length-1)!==0x3b || !width || !height || width>2048 || height>256)throw new Error('Use a valid header GIF under 128 KB and at most 2048 x 256 pixels.');
      theme[mode][key]=value;continue;
     }
     const match=/^url\("data:image\/svg\+xml,([^"\n]+)"\)$/.exec(value);
     if(!match)throw new Error('Artwork must be a self-contained SVG, a supported header GIF data URL, or none. Use themes/build.cjs to package local SVGs.');
     let svg;try{svg=decodeURIComponent(match[1]);}catch(_){throw new Error('Invalid SVG encoding.');}
     if(/<\s*(script|foreignObject|style)|<!|\bon\w+\s*=|\b(?:href|src)\s*=|url\(/i.test(svg))throw new Error('SVG artwork must contain no scripts, links, styles or external resources.');
     const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
     const tags=new Set(['svg','g','rect','path','polygon','polyline','circle','ellipse','line','title','desc']);
     if(doc.querySelector('parsererror') || doc.documentElement.localName!=='svg' || [...doc.querySelectorAll('*')].some(n=>!tags.has(n.localName)))throw new Error('Use a static SVG made of simple shapes.');
     theme[mode][key]=value;continue;
    }
    // Only known tokens, supported CSS values and references to known tokens.
    if(/url\(|expression|[;{}<>\\]/i.test(value))throw new Error('Unsupported CSS in '+key);
    const refs=[...value.matchAll(/var\((--[\w-]+)\)/g)];
    if(refs.some(m=>!keys.has(m[1])))throw new Error('Unknown token reference in '+key);
    let property='color';
    if(/sans|display|serif/.test(key))property='font-family';
    else if(/radius/.test(key))property='border-radius';
    else if(/shadow/.test(key))property='box-shadow';
    else if(key==='--x-speed')property='transition-duration';
    else if(key==='--x-ease')property='transition-timing-function';
    else if(key==='--x-art-rendering')property='image-rendering';
    if(!CSS.supports(property,value))throw new Error('Unsupported '+property+' value for '+key);
    if(['--x-search-bg','--x-search-hover-bg'].includes(key) && !/^#[0-9a-f]{6}$/i.test(value))throw new Error('Search backgrounds must use opaque #RRGGBB colors.');
    theme[mode][key]=value;
   }
  }
  if(!['default','custom','holiday'].includes(input.type))throw new Error('Theme type must be default, custom or holiday.');
  theme.type=input.type;
  if(input.type==='holiday') {
   const valid=validHolidayDate;
   if(!input.holiday||!valid(input.holiday.start)||!valid(input.holiday.end))throw new Error('Holiday themes need start and end dates as MM-DD.');
   theme.holiday={start:input.holiday.start,end:input.holiday.end,priority:Math.max(-100,Math.min(100,Number(input.holiday.priority)||0))};
  }
  return theme;
 }
 function apply(settings=last) {
  last=settings;
  const mode=settings.theme==='dark'||(settings.theme!=='light'&&media.matches)?'dark':'light';
  const result=choose(settings);
  const allowMotion=settings.animateThemes!==false && !reducedMotion.matches;
  const nextStamp=JSON.stringify([!ownUI && settings.enabled===false,mode,result.theme,allowMotion]);
  if(stamp===nextStamp)return;
  stamp=nextStamp;
  for(const key of applied)root.style.removeProperty(key);
  applied=new Set();
  if(!ownUI && settings.enabled===false){delete root.dataset.gccxTheme;delete root.dataset.gccxMotion;root.removeAttribute('data-gccx-animated-art');root.style.removeProperty('color-scheme');return;}
  // Tokens a pack leaves out inherit the baked-in GCC theme.
  const values={...baked[mode],...result.theme[mode]};
  const hasAnimation=/^url\("data:image\/gif;base64,/.test(values['--x-header-art']||'');
  root.toggleAttribute('data-gccx-animated-art',hasAnimation);
  root.dataset.gccxMotion=allowMotion?'animated':'static';
  if(hasAnimation && !allowMotion)values['--x-header-art']=values['--x-header-still-art']||'none';
  for(const [key,value]of Object.entries(values))if(keys.has(key)){root.style.setProperty(key,value);applied.add(key);}
  if(ownUI)for(const [alias,key]of Object.entries(aliases)){root.style.setProperty(alias,`var(${key})`);applied.add(alias);}
  root.style.colorScheme=mode;
  root.dataset.gccxTheme=result.theme.id;
  root.dataset.gccxThemeMode=mode;
  window.dispatchEvent(new CustomEvent('gccx-theme-changed',{detail:{id:result.theme.id,mode,holiday:result.holiday}}));
 }
 // Load the packs from the themes/ folder. Invalid packs are skipped; if no valid
 // default pack is found the baked-in GCC theme stays in use.
 const ready=new Promise(resolve=>{
  try{chrome.runtime.sendMessage({type:'gccx-themes'},res=>{
   void chrome.runtime.lastError;
   const loaded=[];
   for(const pack of (res&&res.packs)||[]){try{loaded.push(validate(pack));}catch(e){console.warn('[themes] skipped '+(pack&&pack.id)+': '+e.message);}}
   if(loaded.length)builtins=loaded;
   if(!builtins.some(t=>t.type==='default'))builtins=[baked,...builtins];
   api.builtins=builtins;
   stamp='';apply();
   window.dispatchEvent(new CustomEvent('gccx-themes-loaded'));
   resolve(builtins);
  });}catch(_){resolve(builtins);}
 });
 const api={choose,apply,validate,activeHoliday,pickable,manifest,builtins,ready};
 window.GCCXThemes=api;
 try{apply(JSON.parse(localStorage.getItem('gccx-settings')||'{}'));}catch(_){apply({});}
 chrome.storage.local.get('settings',r=>apply(r.settings||{}));
 chrome.storage.onChanged.addListener(ch=>{if(ch.settings)apply(ch.settings.newValue||{});});
 media.addEventListener('change',()=>apply());
 reducedMotion.addEventListener('change',()=>apply());
 // Re-evaluate at least once per minute so date/holiday changes don't require a reload.
 setInterval(()=>{if(!document.hidden)apply();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply();});
})();
