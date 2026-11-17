const photos = [...document.querySelectorAll('.gallery-item')];
const page = document.querySelector('.page');
const stage = document.querySelector('.stage');
const viewport = document.querySelector('.gallery-viewport');
const scroller = document.querySelector('.gallery-scroll');
const viewer = document.querySelector('.photo-viewer');
const frame = document.querySelector('.photo-frame');
const low = document.querySelector('.photo-low');
const high = document.querySelector('.photo-high');
const caption = document.querySelector('.photo-caption');
const closeButton = document.querySelector('.photo-close');
const metadata = JSON.parse(document.querySelector('#page-metadata').textContent);

// Timings (ms).
const ZOOM_MS = 990;        // photo opening / closing (was 660)
const ZOOM_EASE = 'cubic-bezier(.2,.75,.2,1)';
const SLIDE_MS = 560;       // arrow-key slide between photos
const SLIDE_EASE = 'cubic-bezier(.45,.05,.25,1)';
const FADE_OUT_MS = 260;    // fade-through-white for text and hero
const FADE_IN_MS = 320;

let language = 'en';
try { language = localStorage.getItem('lang') === 'fr' ? 'fr' : 'en'; } catch {}
let active = -1;
let version = 0;
let animation;

/* ---------- Fade through white (language switch and section tabs) ---------- */

let fadeAnimations = [];
let pendingUpdate = null;
let fadeToken = 0;
function underlyingOpacity(element) { return parseFloat(getComputedStyle(element).opacity) || 1; }
// Fades every target to white, applies the update, then fades everything back in together.
function fadeThrough(targets, update, animate = true) {
  // A transition already in progress is completed at once before starting the next one.
  const current = new Map(fadeAnimations.map(item => [item.element, underlyingOpacity(item.element)]));
  fadeAnimations.forEach(item => item.animation.cancel());
  fadeAnimations = [];
  if (pendingUpdate) { const previous = pendingUpdate; pendingUpdate = null; previous(); }
  const token = ++fadeToken;
  if (!animate) { update(); return; }
  pendingUpdate = update;
  fadeAnimations = targets.map(element => {
    const from = current.has(element) ? current.get(element) : underlyingOpacity(element);
    return {element, animation: element.animate([{opacity: from}, {opacity: 0}], {duration: FADE_OUT_MS, easing: 'ease-in', fill: 'forwards'})};
  });
  Promise.all(fadeAnimations.map(item => item.animation.finished)).then(() => {
    if (token !== fadeToken) return;
    const run = pendingUpdate; pendingUpdate = null; run?.();
    const outgoing = fadeAnimations;
    fadeAnimations = targets.filter(element => element.isConnected).map(element => {
      const old = outgoing.find(item => item.element === element);
      old?.animation.cancel();
      const to = underlyingOpacity(element);
      return {element, animation: element.animate([{opacity: 0}, {opacity: to}], {duration: FADE_IN_MS, easing: 'ease-out'})};
    });
    outgoing.forEach(item => item.animation.cancel());
    return Promise.all(fadeAnimations.map(item => item.animation.finished)).then(() => { if (token === fadeToken) fadeAnimations = []; });
  }).catch(() => {});
}

// Prepares a bilingual label for a fade. Returns the element to fade and the text update.
// In the subtitle only the letters that differ fade (the e/é in Renovation).
function prepareTranslation(element, nextText) {
  const oldText = element.textContent;
  if (oldText === nextText) return null;
  if (!element.classList.contains('subtitle')) return {target: element, update: () => { element.textContent = nextText; }};
  let start = 0;
  while (start < oldText.length && start < nextText.length && oldText[start] === nextText[start]) start++;
  let end = 0;
  while (end < oldText.length - start && end < nextText.length - start && oldText[oldText.length - 1 - end] === nextText[nextText.length - 1 - end]) end++;
  const changed = document.createElement('span');
  changed.className = 'changed-letters';
  changed.textContent = oldText.slice(start, oldText.length - end);
  element.replaceChildren(document.createTextNode(oldText.slice(0, start)), changed, document.createTextNode(end ? oldText.slice(-end) : ''));
  return {target: changed, update: () => { changed.textContent = nextText.slice(start, nextText.length - end); }};
}

/* ---------- Hero copy always fits the fixed hero box ---------- */

function fitCopy() {
  document.querySelectorAll('.stage-services, .stage-about').forEach(panel => {
    const content = panel.querySelector('.about-content');
    const box = panel.querySelector('.about-box');
    content.style.setProperty('--fit', 1);
    if (!panel.classList.contains('is-active')) return;
    const available = box.clientHeight;
    if (content.offsetHeight <= available) return;
    // Largest text size (down to half) at which the copy fits.
    let low = 0.5, high = 1;
    for (let step = 0; step < 8; step++) {
      const middle = (low + high) / 2;
      content.style.setProperty('--fit', middle.toFixed(4));
      if (content.offsetHeight <= available) low = middle; else high = middle;
    }
    content.style.setProperty('--fit', low.toFixed(4));
  });
}
new ResizeObserver(() => fitCopy()).observe(stage);
document.fonts?.ready.then(fitCopy);

function applyLanguage(animate = false) {
  document.documentElement.lang = language;
  document.title = metadata['title_' + language];
  document.querySelector('meta[name="description"]').content = metadata['description_' + language];
  document.querySelectorAll('[data-label-en]').forEach(element => { element.setAttribute('aria-label', element.dataset[language === 'en' ? 'labelEn' : 'labelFr']); });
  // Complete any half-finished fade first so labels hold their final text before diffing.
  if (pendingUpdate) fadeThrough([], () => {}, false);
  const labels = [...document.querySelectorAll('.translated')].map(element => prepareTranslation(element, element.dataset[language])).filter(Boolean);
  fadeThrough([...labels.map(item => item.target), stage], () => {
    labels.forEach(item => item.update());
    document.querySelectorAll('[data-language]').forEach(element => { element.hidden = element.dataset.language !== language; });
    photos.forEach(button => { button.querySelector('img').alt = button.dataset[language === 'en' ? 'altEn' : 'altFr']; });
    if (active >= 0) updateCaption();
    fitCopy();
  }, animate);
}
function updateCaption() {
  caption.textContent = photos[active].dataset[language === 'en' ? 'captionEn' : 'captionFr'];
  high.alt = low.alt = photos[active].querySelector('img').alt;
}
applyLanguage();
document.querySelector('#lang-toggle').addEventListener('click', () => {
  language = language === 'en' ? 'fr' : 'en';
  try { localStorage.setItem('lang', language); } catch {}
  applyLanguage(true);
});
document.querySelectorAll('.menu-link').forEach(button => button.addEventListener('click', () => {
  if (button.classList.contains('is-active')) return;
  document.querySelectorAll('.menu-link').forEach(item => item.classList.toggle('is-active', item === button));
  fadeThrough([stage], () => {
    closePhoto(false);
    document.querySelectorAll('.stage-panel').forEach(panel => panel.classList.toggle('is-active', panel.dataset.stage === button.dataset.panel));
    fitCopy();
  });
}));

/* ---------- Photo viewer ---------- */

const GAP = 24;
let slideAnimations = [];
let closing = false;
let sliding = false;
let queue = [];
let drag = null;
let neighbor = null;
let ignoreClickUntil = 0;
const cssRect = rect => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, `${value}px`]));
function position(rect, element = frame) { Object.assign(element.style, cssRect(rect)); }
function relativeRect(element) {
  const rect = element.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  return {left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height};
}
function targetRect(image) {
  const width = viewport.clientWidth;
  const height = Math.max(1, viewport.clientHeight - (caption.textContent ? 48 : 0));
  const ratio = image.naturalWidth / image.naturalHeight || 1;
  const w = Math.min(width, height * ratio);
  const h = w / ratio;
  return {left: (width - w) / 2, top: (height - h) / 2, width: w, height: h};
}
const wrap = index => (index + photos.length) % photos.length;
const preloaded = new Map();
function preload(index) {
  const source = photos[wrap(index)].dataset.full;
  if (!preloaded.has(source)) { const image = new Image(); image.decoding = 'async'; image.src = source; preloaded.set(source, image); }
  return preloaded.get(source);
}
function loadLarge(button, token) {
  const image = preload(photos.indexOf(button));
  const show = async () => {
    if (token !== version) return;
    high.src = image.src;
    try { await high.decode(); } catch {}
    if (token === version) high.classList.add('is-loaded');
  };
  if (image.complete && image.naturalWidth) show(); else image.decode().then(show).catch(() => {});
}
function setPhoto(index, instant = false) {
  active = wrap(index);
  const token = ++version;
  const button = photos[active];
  const thumb = button.querySelector('img');
  high.classList.toggle('no-fade', instant);
  high.classList.remove('is-loaded');
  high.removeAttribute('src');
  low.src = thumb.currentSrc || thumb.src;
  updateCaption();
  loadLarge(button, token);
  preload(active + 1); preload(active - 1);
  return token;
}
function openPhoto(index) {
  if (!photos.length || closing || active >= 0) return;
  const token = setPhoto(index);
  const start = relativeRect(photos[active]);
  viewer.hidden = false;
  position(start);
  // Force a style flush so the gallery and close button fade from their resting state.
  void viewer.offsetWidth;
  viewport.classList.add('is-viewing');
  document.body.classList.add('photo-open');
  scroller.inert = true;
  if (document.activeElement === photos[active] && photos[active].matches(':focus-visible')) closeButton.focus({preventScroll: true});
  const ready = () => {
    if (token !== version) return;
    const target = targetRect(low);
    position(target);
    animation = frame.animate([cssRect(start), cssRect(target)], {duration: ZOOM_MS, easing: ZOOM_EASE});
  };
  if (low.complete && low.naturalWidth) ready(); else low.onload = ready;
}
function finishClose(previous, restoreFocus) {
  viewer.hidden = true;
  viewer.classList.remove('is-closing');
  active = -1;
  closing = false;
  scroller.inert = false;
  photos[previous].style.visibility = '';
  if (restoreFocus) photos[previous].focus({preventScroll: true, focusVisible: false});
}
function closePhoto(animate = true) {
  if (active < 0 || closing) return;
  closing = true;
  queue = [];
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
  if (!animate) { viewport.classList.add('no-transition'); requestAnimationFrame(() => requestAnimationFrame(() => viewport.classList.remove('no-transition'))); }
  viewport.classList.remove('is-viewing');
  document.body.classList.remove('photo-open');
  viewer.classList.add('is-closing');
  caption.textContent = '';
  position(target);
  // The reverse of the opening: the photo shrinks back into its thumbnail as the gallery fades back in.
  animation = frame.animate([cssRect(start), cssRect(target)], {duration: animate ? ZOOM_MS : 0, easing: ZOOM_EASE});
  const restoreFocus = animate && viewer.contains(document.activeElement);
  animation.finished.then(() => finishClose(previous, restoreFocus)).catch(() => finishClose(previous, restoreFocus));
}

// The neighbouring photo sits just off-screen beside the current one and moves with it like a film strip.
function prepareNeighbor(direction) {
  neighbor?.remove();
  neighbor = document.createElement('div');
  neighbor.className = 'photo-frame photo-neighbor';
  neighbor.setAttribute('aria-hidden', 'true');
  neighbor.dataset.direction = direction;
  const index = wrap(active + direction);
  const thumb = photos[index].querySelector('img');
  const lowImage = new Image();
  lowImage.src = thumb.currentSrc || thumb.src;
  lowImage.alt = '';
  const full = preload(index);
  const highImage = new Image();
  highImage.className = 'photo-high';
  highImage.alt = '';
  const showHigh = () => { highImage.src = full.src; highImage.classList.add('is-loaded', 'no-fade'); };
  if (full.complete && full.naturalWidth) showHigh(); else full.addEventListener('load', showHigh, {once: true});
  neighbor.append(lowImage, highImage);
  viewer.insertBefore(neighbor, caption);
  const item = neighbor;
  const place = () => { if (item === neighbor) { position(targetRect(lowImage), item); if (drag) moveStrip(drag.dx); } };
  place(); lowImage.onload = place;
  return neighbor;
}
function stripDistance(direction) {
  const width = viewport.clientWidth;
  const current = frame.offsetWidth;
  const next = neighbor ? neighbor.offsetWidth : current;
  // Far enough that each photo is fully off-screen at either end of the slide.
  return width / 2 + Math.max(current, next) / 2 + GAP;
}
function moveStrip(dx) {
  if (!neighbor) return;
  const direction = Number(neighbor.dataset.direction);
  frame.style.transform = `translateX(${dx}px)`;
  neighbor.style.transform = `translateX(${dx + direction * stripDistance(direction)}px)`;
}
function clearNeighbor() {
  neighbor?.remove(); neighbor = null;
  frame.style.transform = '';
}
// After a slide, swap the incoming photo into the main frame underneath the neighbour, then drop the neighbour.
async function completeSlide(direction, incoming, token, cleanup) {
  if (token !== version || closing) return;
  const incomingHigh = incoming.querySelector('.photo-high');
  setPhoto(active + direction, true);
  position(targetRect(incoming.querySelector('img')));
  if (incomingHigh.classList.contains('is-loaded')) { high.src = incomingHigh.src; high.classList.add('is-loaded'); }
  try { await Promise.all([low.decode(), high.getAttribute('src') ? high.decode() : null]); } catch {}
  cleanup?.();
  slideAnimations = [];
  if (closing) return;
  clearNeighbor();
  requestAnimationFrame(() => high.classList.remove('no-fade'));
  sliding = false;
  if (queue.length) navigate(queue.shift());
}

// Arrow keys: an even glide from rest to rest.
async function navigate(direction) {
  if (active < 0 || closing || photos.length < 2) return;
  if (sliding) { if (queue.length < 3) queue.push(direction); return; }
  sliding = true;
  animation?.finish();
  const token = version;
  if (!neighbor || Number(neighbor.dataset.direction) !== direction) prepareNeighbor(direction);
  const incoming = neighbor;
  const distance = stripDistance(direction);
  const options = {duration: SLIDE_MS, easing: SLIDE_EASE, fill: 'forwards'};
  frame.style.transform = incoming.style.transform = '';
  const outgoingAnimation = frame.animate([{transform: 'translateX(0)'}, {transform: `translateX(${-direction * distance}px)`}], options);
  const incomingAnimation = incoming.animate([{transform: `translateX(${direction * distance}px)`}, {transform: 'translateX(0)'}], options);
  slideAnimations = [outgoingAnimation, incomingAnimation];
  await Promise.all([outgoingAnimation.finished, incomingAnimation.finished]).catch(() => {});
  await completeSlide(direction, incoming, token, () => { outgoingAnimation.cancel(); incomingAnimation.cancel(); });
}

// Swipes: a critically damped spring that starts at exactly the finger's position and speed,
// so the motion stays continuous through the release and eases to rest without a jump.
let springFrame = 0;
function springStrip(from, velocity, to, token) {
  cancelAnimationFrame(springFrame);
  return new Promise(resolve => {
    const x0 = from - to;
    // Stiffness is matched to the release so the strip neither speeds up nor brakes abruptly as the finger
    // lifts: zero initial acceleration where possible, kept within a range that feels neither floaty nor snappy.
    const towards = x0 !== 0 && Math.sign(velocity) === -Math.sign(x0);
    const SPRING = Math.min(0.02, Math.max(0.011, towards ? 2 * Math.abs(velocity) / Math.abs(x0) : 0.011));
    const b = velocity + SPRING * x0;
    const start = performance.now();
    const step = now => {
      if (token !== version || closing) { resolve(false); return; }
      const t = now - start;
      const decay = Math.exp(-SPRING * t);
      const x = (x0 + b * t) * decay;
      const v = (velocity - SPRING * b * t) * decay;
      if (Math.abs(x) < 0.4 && Math.abs(v) < 0.01) { moveStrip(to); resolve(true); return; }
      moveStrip(to + x);
      springFrame = requestAnimationFrame(step);
    };
    springFrame = requestAnimationFrame(step);
  });
}

photos.forEach((button, index) => button.addEventListener('click', event => { event.stopPropagation(); openPhoto(index); }));
closeButton.addEventListener('click', event => { event.stopPropagation(); closePhoto(); });

// Clicking or tapping anywhere outside the photo closes it. The listener sits on .page as well as the
// document because iPhone Safari does not send taps on plain areas of the page to a document listener.
function closeFromOutside(event) {
  if (active < 0 || closing || Date.now() < ignoreClickUntil) return;
  if (event.target.closest('button,a,input,textarea,select,label')) return;
  const rect = frame.getBoundingClientRect();
  const insidePhoto = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!insidePhoto) closePhoto();
}
page.addEventListener('click', closeFromOutside);
document.addEventListener('click', closeFromOutside);

document.addEventListener('keydown', event => {
  if (active < 0 || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') closePhoto();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); navigate(event.key === 'ArrowRight' ? 1 : -1);
  }
});

/* Swipe: the current photo follows the finger with its neighbour attached beside it. */
viewer.addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || closing || sliding || event.target.closest('button')) { drag = null; return; }
  animation?.finish();
  const touch = event.touches[0];
  drag = {x: touch.clientX, y: touch.clientY, dx: 0, direction: 0, samples: [{t: performance.now(), x: touch.clientX}]};
}, {passive: true});
viewer.addEventListener('touchmove', event => {
  if (!drag || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - drag.x;
  const dy = touch.clientY - drag.y;
  if (!drag.direction && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { drag = null; return; }
  const now = performance.now();
  drag.samples.push({t: now, x: touch.clientX});
  while (drag.samples.length > 2 && now - drag.samples[0].t > 120) drag.samples.shift();
  if (Math.abs(dx) < 8 && !drag.direction) return;
  event.preventDefault();
  const direction = dx < 0 ? 1 : -1;
  if (direction !== drag.direction) prepareNeighbor(direction);
  drag.direction = direction; drag.dx = dx;
  moveStrip(dx);
}, {passive: false});
// Finger speed (px/ms), averaged over the last ~100 ms so one noisy touch event can't skew it.
function releaseVelocity(samples) {
  const now = performance.now();
  const recent = samples.filter(sample => now - sample.t <= 100);
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent[recent.length - 1];
  return last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
}
async function releaseDrag(cancelled = false) {
  if (!drag) return;
  const {dx, direction, samples} = drag;
  drag = null;
  if (!direction || !neighbor) return;
  ignoreClickUntil = Date.now() + 500;
  const velocity = cancelled ? 0 : releaseVelocity(samples);
  const distance = stripDistance(direction);
  // Where the strip would coast to: decide by projected position, not by where the finger lifted.
  const travelled = -direction * (dx + velocity * 200);
  const advance = !cancelled && photos.length > 1 && travelled > Math.min(distance * 0.3, 100);
  const token = version;
  const incoming = neighbor;
  sliding = true;
  const settled = await springStrip(dx, velocity, advance ? -direction * distance : 0, token);
  if (!settled) return;
  if (advance) { await completeSlide(direction, incoming, token); return; }
  clearNeighbor();
  sliding = false;
}
viewer.addEventListener('touchend', () => releaseDrag(), {passive: true});
viewer.addEventListener('touchcancel', () => releaseDrag(true), {passive: true});
new ResizeObserver(() => { if (active >= 0 && !closing && !sliding && !drag) { animation?.cancel(); position(targetRect(low)); } }).observe(viewport);
