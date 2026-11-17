const photos = [...document.querySelectorAll('.gallery-item')];
const viewport = document.querySelector('.gallery-viewport');
const scroller = document.querySelector('.gallery-scroll');
const viewer = document.querySelector('.photo-viewer');
const frame = document.querySelector('.photo-frame');
const low = document.querySelector('.photo-low');
const high = document.querySelector('.photo-high');
const caption = document.querySelector('.photo-caption');
const closeButton = document.querySelector('.photo-close');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let language = 'en';
try { language = localStorage.getItem('lang') === 'fr' ? 'fr' : 'en'; } catch {}
let active = -1;
let version = 0;
let animation;
const metadata = JSON.parse(document.querySelector('#page-metadata').textContent);
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = metadata['title_' + language];
  document.querySelector('meta[name="description"]').content = metadata['description_' + language];
  document.querySelectorAll('.translated').forEach(element => { element.textContent = element.dataset[language]; });
  document.querySelectorAll('[data-label-en]').forEach(element => { element.setAttribute('aria-label',element.dataset[language === 'en' ? 'labelEn' : 'labelFr']); });
  document.querySelectorAll('[data-language]').forEach(element => { element.hidden = element.dataset.language !== language; });
  photos.forEach(button => { button.querySelector('img').alt = button.dataset[language === 'en' ? 'altEn' : 'altFr']; });
  if (active >= 0) updateCaption();
}
function updateCaption() {
  caption.textContent = photos[active].dataset[language === 'en' ? 'captionEn' : 'captionFr'];
  high.alt = low.alt = photos[active].querySelector('img').alt;
}
applyLanguage();
document.querySelector('#lang-toggle').onclick = () => {
  language = language === 'en' ? 'fr' : 'en';
  try { localStorage.setItem('lang',language); } catch {}
  applyLanguage();
};
document.querySelectorAll('.menu-link').forEach(button => button.addEventListener('click', () => {
  closePhoto(false);
  document.querySelectorAll('.menu-link').forEach(item => item.classList.toggle('is-active',item === button));
  document.querySelectorAll('.stage-panel').forEach(panel => panel.classList.toggle('is-active',panel.dataset.stage === button.dataset.panel));
}));
function targetRect(image) {
  const width = viewport.clientWidth;
  const height = Math.max(1,viewport.clientHeight - (caption.textContent ? 48 : 0));
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const w = Math.min(width, height * ratio);
  const h = w / ratio;
  return {left:(width-w)/2,top:(height-h)/2,width:w,height:h};
}
function position(rect) { Object.assign(frame.style,Object.fromEntries(Object.entries(rect).map(([key,value]) => [key,`${value}px`]))); }
function animateFrom(rect) {
  animation?.cancel();
  const target = targetRect(low);
  position(target);
  const keyframes = [rect,target].map(box => Object.fromEntries(Object.entries(box).map(([key,value]) => [key,`${value}px`])));
  animation = frame.animate(keyframes,{duration:reducedMotion.matches ? 0 : 440,easing:'cubic-bezier(.2,.75,.2,1)'});
}
function openPhoto(index, expand = true) {
  if (!photos.length) return;
  const token = ++version;
  active = (index + photos.length) % photos.length;
  const button = photos[active];
  const thumb = button.querySelector('img');
  const start = thumb.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  viewer.hidden = false;
  high.classList.remove('is-loaded');
  high.removeAttribute('src');
  low.src = thumb.currentSrc || thumb.src;
  updateCaption();
  viewport.classList.add('is-viewing');
  scroller.inert = true;
  closeButton.focus({preventScroll:true});
  const ready = () => {
    if (token !== version) return;
    const target = targetRect(low);
    if (expand) animateFrom({left:start.left-bounds.left,top:start.top-bounds.top,width:start.width,height:start.height});
    else { animation?.cancel(); position(target); frame.animate([{opacity:0},{opacity:1}],{duration:reducedMotion.matches?0:220}); }
  };
  if (low.complete && low.naturalWidth) ready(); else low.onload = ready;
  const large = new Image();
  large.src = button.dataset.full;
  large.decode().then(() => {
    if (token !== version) return;
    high.src = large.src;
    return high.decode();
  }).then(() => { if (token === version) high.classList.add('is-loaded'); }).catch(() => {});
}
function closePhoto(restoreFocus = true) {
  if (active < 0) return;
  const previous = active;
  active = -1;
  version++;
  animation?.cancel();
  viewer.hidden = true;
  viewport.classList.remove('is-viewing');
  scroller.inert = false;
  if (restoreFocus) photos[previous].focus({preventScroll:true});
}
photos.forEach((button,index) => button.addEventListener('click',() => openPhoto(index)));
closeButton.onclick = () => closePhoto();
viewer.addEventListener('click',event => { if (event.target === viewer) closePhoto(); });
document.addEventListener('keydown',event => {
  if (active < 0 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') closePhoto();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); openPhoto(active + (event.key === 'ArrowRight' ? 1 : -1),false);
  }
});
let touchStart;
viewer.addEventListener('touchstart',event => {
  if (event.touches.length === 1) touchStart = {x:event.touches[0].clientX,y:event.touches[0].clientY};
  else touchStart = null;
},{passive:true});
viewer.addEventListener('touchend',event => {
  if (!touchStart || active < 0) return;
  const dx = event.changedTouches[0].clientX-touchStart.x;
  const dy = event.changedTouches[0].clientY-touchStart.y;
  touchStart = null;
  if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.5) openPhoto(active+(dx<0?1:-1),false);
},{passive:true});
new ResizeObserver(() => { if (active>=0) { animation?.cancel(); position(targetRect(low)); } }).observe(viewport);
