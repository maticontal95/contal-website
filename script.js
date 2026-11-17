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
const textTransitions = new WeakMap();
function translateText(element, nextText, animate) {
  const previous = textTransitions.get(element);
  previous?.animation?.cancel();
  if (previous) element.textContent = previous.target;
  const oldText = element.textContent;
  if (!animate || reducedMotion.matches || oldText === nextText) { element.textContent = nextText; return; }
  let start = 0;
  while (start < oldText.length && start < nextText.length && oldText[start] === nextText[start]) start++;
  let end = 0;
  while (end < oldText.length-start && end < nextText.length-start && oldText[oldText.length-1-end] === nextText[nextText.length-1-end]) end++;
  // Keep shared letters stationary in the subtitle. Other labels fade as a whole.
  if (!element.classList.contains('subtitle')) { start=0; end=0; }
  const changed = document.createElement('span');
  changed.textContent = oldText.slice(start,oldText.length-end);
  element.replaceChildren(document.createTextNode(oldText.slice(0,start)),changed,document.createTextNode(end?oldText.slice(-end):''));
  const state = {target:nextText,animation:changed.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'})};
  textTransitions.set(element,state);
  state.animation.finished.then(() => {
    if (textTransitions.get(element) !== state) return;
    changed.textContent = nextText.slice(start,nextText.length-end);
    state.animation.cancel();
    state.animation = changed.animate([{opacity:0},{opacity:1}],{duration:180});
    return state.animation.finished;
  }).then(() => {
    if (textTransitions.get(element) === state) { element.textContent=nextText; textTransitions.delete(element); }
  }).catch(() => {});
}
function applyLanguage(animate = false) {
  document.documentElement.lang = language;
  document.title = metadata['title_' + language];
  document.querySelector('meta[name="description"]').content = metadata['description_' + language];
  document.querySelectorAll('.translated').forEach(element => { translateText(element, element.dataset[language], animate); });
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
  applyLanguage(true);
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
let slideAnimations = [];
let closing = false;
let sliding = false;
let drag = null;
let neighbor = null;
let ignoreClickUntil = 0;
const duration = () => reducedMotion.matches ? 0 : 660;
const cssRect = rect => Object.fromEntries(Object.entries(rect).map(([key,value]) => [key,`${value}px`]));
function position(rect, element = frame) { Object.assign(element.style,cssRect(rect)); }
function relativeRect(element) {
  const rect = element.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  return {left:rect.left-bounds.left,top:rect.top-bounds.top,width:rect.width,height:rect.height};
}
function clearNeighbor() {
  neighbor?.remove(); neighbor = null;
  frame.style.transform = '';
}
function loadLarge(button, token) {
  const image = new Image();
  image.src = button.dataset.full;
  image.decode().then(async () => {
    if (token !== version) return;
    high.src = image.src;
    await high.decode();
    if (token === version) high.classList.add('is-loaded');
  }).catch(() => {});
}
function setPhoto(index) {
  active = (index + photos.length) % photos.length;
  const token = ++version;
  const button = photos[active];
  const thumb = button.querySelector('img');
  high.classList.remove('is-loaded');
  high.removeAttribute('src');
  low.src = thumb.currentSrc || thumb.src;
  updateCaption();
  loadLarge(button,token);
  return token;
}
function openPhoto(index) {
  if (!photos.length || closing || active >= 0) return;
  const token = setPhoto(index);
  const start = relativeRect(photos[active]);
  viewer.hidden = false;
  position(start);
  viewport.classList.add('is-viewing');
  scroller.inert = true;
  // Preserve keyboard access without forcing a pointer-triggered focus outline.
  if (document.activeElement === photos[active] && photos[active].matches(':focus-visible')) closeButton.focus({preventScroll:true});
  const ready = () => {
    if (token !== version) return;
    const target = targetRect(low);
    position(target);
    animation = frame.animate([cssRect(start),cssRect(target)],{duration:duration(),easing:'cubic-bezier(.2,.75,.2,1)'});
  };
  if (low.complete && low.naturalWidth) ready(); else low.onload = ready;
}
function finishClose(previous,restoreFocus) {
  viewer.hidden = true;
  active = -1;
  closing = false;
  scroller.inert = false;
  photos[previous].style.visibility = '';
  if (restoreFocus) photos[previous].focus({preventScroll:true});
}
function closePhoto(restoreFocus = true) {
  if (active < 0 || closing) return;
  closing = true;
  const previous = active;
  const start = relativeRect(frame);
  version++;
  animation?.cancel();
  slideAnimations.forEach(item => item.cancel());
  slideAnimations = [];
  sliding = false;
  drag = null;
  clearNeighbor();
  // Bring a navigated-to thumbnail into view before returning the photo to it.
  const button = photos[previous];
  const top = button.offsetTop;
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  if (top + button.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + button.offsetHeight - scroller.clientHeight;
  const target = relativeRect(button);
  button.style.visibility = 'hidden';
  viewport.classList.remove('is-viewing');
  caption.textContent = '';
  position(target);
  animation = frame.animate([cssRect(start),cssRect(target)],{duration:restoreFocus ? duration() : 0,easing:'cubic-bezier(.2,.75,.2,1)'});
  animation.finished.then(() => finishClose(previous,restoreFocus)).catch(() => finishClose(previous,restoreFocus));
}
function prepareNeighbor(direction) {
  neighbor?.remove();
  neighbor = document.createElement('div');
  neighbor.className = 'photo-frame photo-neighbor';
  neighbor.setAttribute('aria-hidden','true');
  const thumb = photos[(active+direction+photos.length)%photos.length].querySelector('img');
  const image = new Image();
  image.src = thumb.currentSrc || thumb.src;
  image.alt = '';
  neighbor.append(image);
  viewer.insertBefore(neighbor,caption);
  const place = () => { if (image.parentElement === neighbor) position(targetRect(image),neighbor); };
  place(); image.onload = place;
  return neighbor;
}
async function navigate(direction, offset = 0) {
  if (active < 0 || closing || sliding || photos.length < 2) return;
  sliding = true;
  animation?.finish();
  const token = version;
  if (!neighbor) prepareNeighbor(direction);
  const incoming = neighbor;
  const distance = viewport.clientWidth;
  const options = {duration:reducedMotion.matches?0:400,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'};
  const outgoingAnimation = frame.animate([{transform:`translateX(${offset}px)`},{transform:`translateX(${-direction*distance}px)`}],options);
  const incomingAnimation = incoming.animate([{transform:`translateX(${offset+direction*distance}px)`},{transform:'translateX(0)'}],options);
  slideAnimations = [outgoingAnimation,incomingAnimation];
  await Promise.all([outgoingAnimation.finished,incomingAnimation.finished]).catch(() => {});
  if (token === version && !closing) {
    setPhoto(active+direction);
    position(targetRect(incoming.querySelector('img')));
    clearNeighbor();
    sliding = false;
  }
  outgoingAnimation.cancel(); incomingAnimation.cancel();
}
photos.forEach((button,index) => button.addEventListener('click',event => {event.stopPropagation();openPhoto(index);}));
closeButton.onclick = event => {event.stopPropagation();closePhoto();};
document.addEventListener('click',event => {
  if (active < 0 || closing || Date.now() < ignoreClickUntil) return;
  if (event.target.closest('button,a,input,textarea,select,.photo-caption')) return;
  const rect = frame.getBoundingClientRect();
  const insidePhoto = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!insidePhoto) closePhoto();
});
document.addEventListener('keydown',event => {
  if (active < 0 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') closePhoto();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); navigate(event.key === 'ArrowRight' ? 1 : -1);
  }
});
viewer.addEventListener('touchstart',event => {
  if (event.touches.length !== 1 || closing || sliding || event.target.closest('button')) {drag=null;return;}
  animation?.finish();
  drag = {x:event.touches[0].clientX,y:event.touches[0].clientY,dx:0,direction:0};
},{passive:true});
viewer.addEventListener('touchmove',event => {
  if (!drag || event.touches.length !== 1) return;
  const dx = event.touches[0].clientX-drag.x;
  const dy = event.touches[0].clientY-drag.y;
  if (!drag.direction && Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>10) {drag=null;return;}
  if (Math.abs(dx)<8 && !drag.direction) return;
  event.preventDefault();
  const direction = dx<0?1:-1;
  if (direction !== drag.direction) prepareNeighbor(direction);
  drag.direction = direction; drag.dx = dx;
  frame.style.transform = `translateX(${dx}px)`;
  neighbor.style.transform = `translateX(${dx+direction*viewport.clientWidth}px)`;
},{passive:false});
function releaseDrag(cancelled = false) {
  if (!drag) return;
  const {dx,direction} = drag;
  drag = null;
  if (!direction) return;
  ignoreClickUntil = Date.now()+500;
  if (!cancelled && Math.abs(dx)>45) navigate(direction,dx);
  else {
    const options={duration:reducedMotion.matches?0:220,easing:'ease-out'};
    frame.animate([{transform:`translateX(${dx}px)`},{transform:'translateX(0)'}],options);
    clearNeighbor();
  }
}
viewer.addEventListener('touchend',() => releaseDrag(),{passive:true});
viewer.addEventListener('touchcancel',() => releaseDrag(true),{passive:true});
new ResizeObserver(() => { if (active>=0 && !closing && !sliding && !drag) { animation?.cancel(); position(targetRect(low)); } }).observe(viewport);
