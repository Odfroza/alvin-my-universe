import {enableContact} from './contact-client.mjs';
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
const form=document.querySelector('[data-contact]');
if(form) enableContact(form);

// Pointer previews are temporary. Explicit selections persist after the
// pointer leaves. Touch and keyboard users can step through every view.
function viewSwitcher(count, render, surface) {
  let selected = 0;
  let visible = -1;
  function show(index, commit = false) {
    if (commit || index !== visible) {
      visible = index;
      render(index, selected);
    }
  }
  function step(delta) {
    selected = (selected + delta + count) % count;
    show(selected, true);
  }
  if (surface) {
    const hover = matchMedia('(any-hover:hover)');
    const detail = surface.hasAttribute('data-hover-views');
    function preview(event) {
      if (event.pointerType === 'touch' || !hover.matches || (count === 2 && reduced.matches)) return;
      if (detail && !event.target.closest('.gallery-surface')) { show(selected); return; }
      const bounds = surface.getBoundingClientRect();
      const fraction = (event.clientX - bounds.left) / Math.max(1, bounds.width);
      // Studio previews its second frame on entry. A third frame, when
      // supplied, occupies the rightmost third of the same artwork.
      const offset = count > 2 && fraction > 2/3 ? 2 : 1;
      show(count === 2 ? 1 : (selected + offset) % count);
    }
    surface.addEventListener('pointerenter', preview);
    surface.addEventListener('pointermove', preview);
    surface.addEventListener('pointerleave', () => show(selected));
    if (surface.matches('a')) {
      surface.addEventListener('focus', () => {
        if (surface.matches(':focus-visible') && (count > 2 || (hover.matches && !reduced.matches))) {
          show(count === 2 ? 1 : (selected+1) % count);
        }
      });
      surface.addEventListener('blur', () => show(selected));
    }
  }
  show(0);
  return step;
}
for (const card of document.querySelectorAll('[data-card]')) {
  const toggle = card.querySelector('.view-toggle');
  if (!toggle) continue;
  const images = [...card.querySelectorAll('.card-image')];
  const title = card.querySelector('h3').textContent;
  const next = viewSwitcher(images.length, (at, selected) => {
    images.forEach((img,i) => {
      img.classList.toggle('is-current', i === at);
      img.setAttribute('aria-hidden',String(i !== at));
    });
    if (images.length === 2) toggle.setAttribute('aria-pressed', String(selected === 1));
    toggle.textContent = images.length === 2 && selected === 1 ? 'First view' : 'Change view';
    toggle.setAttribute('aria-label',`Change view of ${title}, showing ${at+1} of ${images.length}`);
  }, card.querySelector('.art-link'));
  toggle.hidden = false;
  toggle.addEventListener('click', () => next(1));
}
for (const block of document.querySelectorAll('[data-gallery]')) {
  const views = [...block.querySelectorAll('[data-frame]')];
  if (views.length < 2) continue;
  const position = block.querySelector('[data-gallery-position]');
  const step = viewSwitcher(views.length, at => {
    views.forEach((v,i) => v.hidden = i !== at);
    position.textContent = (at+1)+' / '+views.length;
  }, block.querySelector('[data-hover-views]'));
  block.querySelector('.gallery-controls').hidden = false;
  block.querySelector('[data-prev]').addEventListener('click', () => step(-1));
  block.querySelector('[data-next]').addEventListener('click', () => step(1));
}
const chapters=[...document.querySelectorAll('[data-reading-chapter]')];
if(chapters.length){
  const links=[...document.querySelectorAll('[data-chapter-link]')];
  const index=document.querySelector('.chapter-index');
  const progress=document.querySelector('#reading-progress');
  const label=document.querySelector('[data-reading-label]');
  const compactLabel=document.querySelector('[data-mobile-location]');
  const modes=[...document.querySelectorAll('[data-mode-link]')];
  const progressBox=document.querySelector('.reader-progress');
  const unit=progressBox.dataset.unit || 'chapter';
  progressBox.hidden=false;
  function sizeIndex(){index.open=!mobile.matches;}
  sizeIndex();mobile.addEventListener('change',sizeIndex);
  index.addEventListener('click',event=>{
    if(mobile.matches && event.target.closest('[data-chapter-link]')) index.open=false;
  });
  let frame=0;
  function update(){
    frame=0;
    const boundary=mobile.matches ? 165 : Math.max(145,Math.min(innerHeight*.32,260));
    let at=0;
    for(let i=1;i<chapters.length;i++){if(chapters[i].getBoundingClientRect().top>boundary)break;at=i;}
    if(chapters.at(-1).getBoundingClientRect().bottom<=innerHeight && scrollY>0) at=chapters.length-1;
    links.forEach((a,i)=>{if(i===at)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    const display=unit.charAt(0).toUpperCase()+unit.slice(1)+' '+(at+1)+' of '+chapters.length;
    progress.value=at+1;label.textContent=display;compactLabel.textContent=display;
    const reached=chapters[0].getBoundingClientRect().top<=boundary || chapters.some(c=>'#'+c.id===location.hash);
    for(const mode of modes) mode.hash=reached ? chapters[at].id : '';
  }
  function request(){if(!frame)frame=requestAnimationFrame(update);}
  window.addEventListener('scroll',request,{passive:true});window.addEventListener('resize',request);
  window.addEventListener('pageshow',request);window.addEventListener('hashchange',request);request();
}

const teaser=document.querySelector('[data-pattern-teaser]');
if(teaser){
  const list=teaser.querySelector('[data-pattern-list]');
  const current=teaser.querySelector('[data-pattern-current]');
  const button=teaser.querySelector('[data-pattern-pause]');
  const names=[...list.children].map(li=>li.textContent);
  let at=0,paused=false,timer=0,visible=true;
  function show(){
    current.textContent=names[at];
    current.animate?.([{opacity:.25},{opacity:1}],{duration:350});
  }
  function sync(){
    clearInterval(timer);
    const motion=!reduced.matches;
    list.classList.toggle('visually-hidden',motion);current.hidden=!motion;button.hidden=!motion;
    current.textContent=names[at];
    button.textContent=paused?'Resume rotation':'Pause rotation';button.setAttribute('aria-pressed',String(paused));
    if(motion && !paused && !document.hidden && visible) timer=setInterval(()=>{at=(at+1)%names.length;show();},4200);
  }
  button.addEventListener('click',()=>{paused=!paused;sync();});
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  if('IntersectionObserver' in window){
    new IntersectionObserver(([item])=>{visible=item.isIntersecting;sync();}).observe(teaser);
  }
  sync();
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
      const [{createPortrait},{decodeVoxels},r]=await Promise.all([import('./visual/portrait.mjs'),import('./visual/voxels.mjs'),fetch(new URL('./assets/alvin.vox',import.meta.url))]);
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


// Keep previous About depth bookmarks usable after introducing the full reading route.
if(location.hash==='#about-full' && document.querySelector('#about-short')){
  location.replace(document.querySelector('.mode-switch a:last-child').href.split('#')[0]+'#about-full');
}
