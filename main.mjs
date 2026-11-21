document.documentElement.classList.add('js');
const mobile=matchMedia('(max-width:680px)');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const coarse=matchMedia('(pointer:coarse)');
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('#main-nav');

function setMenu(open,returnFocus=false){
  menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Close':'Menu';
  nav.classList.toggle('is-open',open);
  if(returnFocus)menu.focus();
}
function sizeMenu(){menu.hidden=!mobile.matches;setMenu(false);}
sizeMenu();mobile.addEventListener('change',sizeMenu);
menu.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
nav.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false);});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){e.preventDefault();setMenu(false,true);}
});
document.querySelector('header').addEventListener('focusout',e=>{
  if(e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))setMenu(false);
});
document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()));

for(const card of document.querySelectorAll('[data-card]')){
  const toggle=card.querySelector('.view-toggle');if(!toggle)continue;
  toggle.hidden=false;toggle.addEventListener('click',()=>{
    const active=toggle.getAttribute('aria-pressed')!=='true';
    toggle.setAttribute('aria-pressed',String(active));card.dataset.alt=String(active);
    toggle.textContent=active?'First view':'Change view';
  });
}
for(const block of document.querySelectorAll('[data-gallery]')){
  const views=[...block.querySelectorAll('[data-frame]')];if(views.length<2)continue;
  const controls=block.querySelector('.gallery-controls');controls.hidden=false;let at=0;
  function show(n){
    at=(n+views.length)%views.length;views.forEach((v,i)=>v.hidden=i!==at);
    block.querySelector('[data-gallery-position]').textContent=(at+1)+' / '+views.length;
  }
  block.querySelector('[data-prev]').addEventListener('click',()=>show(at-1));block.querySelector('[data-next]').addEventListener('click',()=>show(at+1));show(0);
}
const chapters=[...document.querySelectorAll('[data-reading-chapter]')];
if(chapters.length){
  const links=[...document.querySelectorAll('[data-chapter-link]')];
  const progress=document.querySelector('#reading-progress');
  const label=document.querySelector('[data-reading-label]');
  const modes=[...document.querySelectorAll('[data-mode-link]')];
  document.querySelector('.reader-progress').hidden=false;let frame=0,last=-1;
  function update(){
    frame=0;const boundary=Math.min(innerHeight*.4,Math.max(140,innerHeight-150));
    let at=0;for(let i=1;i<chapters.length;i++){if(chapters[i].getBoundingClientRect().top>boundary)break;at=i;}
    if(chapters.at(-1).getBoundingClientRect().bottom<=innerHeight)at=chapters.length-1;
    if(last===at)return;last=at;
    links.forEach((a,i)=>{if(i===at)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    progress.value=at+1;label.textContent='Chapter '+(at+1)+' of '+chapters.length;
    for(const m of modes)m.hash=chapters[at].id;
  }
  function request(){if(!frame)frame=requestAnimationFrame(update);}
  window.addEventListener('scroll',request,{passive:true});window.addEventListener('resize',request);window.addEventListener('pageshow',request);
  window.addEventListener('hashchange',request);request();
}

if(!reduced.matches && 'IntersectionObserver' in window){
  const io=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-arriving');io.unobserve(entry.target);}}, {threshold:.3});
  document.querySelectorAll('.section-heading h2,.split-feature h2').forEach(el=>io.observe(el));
}
const portrait=document.querySelector('[data-portrait]');
if(portrait){
  let scene=null,pending=false;
  function eligible(){return !mobile.matches&&!coarse.matches&&!navigator.connection?.saveData;}
  async function load(){
    if(!eligible()){scene?.dispose();scene=null;return;}
    if(scene||pending)return;
    pending=true;
    try{
      const [{createPortrait},{decodeVoxels},r]=await Promise.all([import('./visual/portrait.mjs'),import('./visual/voxels.mjs'),fetch('/alvin-my-universe/assets/alvin.vox')]);
      if(!r.ok)throw Error('Model unavailable');
      const data=decodeVoxels(await r.arrayBuffer());
      if(eligible())scene=createPortrait(portrait,{data,reduced:reduced.matches,onLost:()=>{scene=null;}});
    }catch{
      portrait.dataset.renderer='static';portrait.classList.remove('is-ready');
      portrait.querySelector('canvas').hidden=true;portrait.querySelector('canvas').setAttribute('aria-hidden','true');
      portrait.querySelector('.portrait-controls').hidden=true;portrait.querySelector('.portrait-fallback').removeAttribute('aria-hidden');
    }finally{pending=false;}
  }
  if('requestIdleCallback' in window)requestIdleCallback(load,{timeout:700});else setTimeout(load,50);
  reduced.addEventListener('change',()=>scene?.setReduced(reduced.matches));
  mobile.addEventListener('change',load);coarse.addEventListener('change',load);
}
