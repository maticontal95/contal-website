import PhotoSwipe from './vendor/photoswipe/photoswipe.esm.min.js';

const photos = [...document.querySelectorAll('.gallery-item')];
const page = document.querySelector('.page');
const stage = document.querySelector('.stage');
const viewport = document.querySelector('.gallery-viewport');
const scroller = document.querySelector('.gallery-scroll');
const closeLabel = document.querySelector('.photo-close-label');
const metadata = JSON.parse(document.querySelector('#page-metadata').textContent);

// Timings (ms).
const ZOOM_MS = 990;        // photo opening / closing
const ZOOM_EASE = 'cubic-bezier(.2,.75,.2,1)';
const FADE_OUT_MS = 260;    // fade-through-white for text and hero
const FADE_IN_MS = 320;

let pswp = null;           // open PhotoSwipe instance, if any
let language = 'en';
try { language = localStorage.getItem('lang') === 'fr' ? 'fr' : 'en'; } catch {}

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
    updateViewerLanguage();
    fitCopy();
  }, animate);
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
    closeViewer(false);
    document.querySelectorAll('.stage-panel').forEach(panel => panel.classList.toggle('is-active', panel.dataset.stage === button.dataset.panel));
    fitCopy();
  });
}));

/* ---------- Photo viewer (PhotoSwipe, shown inside the hero box) ---------- */

// PhotoSwipe handles opening from the thumbnail, swiping with momentum (including rapid swipes),
// arrow keys, pinch-zoom and closing back to the thumbnail. It is mounted inside the gallery box
// rather than over the whole screen, on a white background, so the grid fades through white as a photo opens.

const CLOSE_SVG = '<svg class="pswp__icn" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4 20 20M20 4 4 20" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="square"/></svg>';

function slideData(button) {
  const thumb = button.querySelector('img');
  const ratio = thumb.naturalWidth && thumb.naturalHeight ? thumb.naturalHeight / thumb.naturalWidth : 4 / 3;
  const width = Number(button.dataset.width) || 1800;
  const height = Number(button.dataset.height) || Math.round(1800 * ratio);
  return {src: button.dataset.full, msrc: thumb.currentSrc || thumb.src, width, height, element: button, thumbCropped: true, alt: thumb.alt};
}
function captionText(index) { return photos[index]?.dataset[language === 'en' ? 'captionEn' : 'captionFr'] || ''; }

// PhotoSwipe turns its open/close animation off when the device asks for reduced motion;
// the site keeps its transitions on for everyone, so that one check is answered "no" while it starts.
function withMotion(create) {
  const original = window.matchMedia;
  window.matchMedia = query => /prefers-reduced-motion/.test(query)
    ? {matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}}
    : original.call(window, query);
  try { return create(); } finally { window.matchMedia = original; }
}

function openPhoto(index) {
  if (pswp) return;
  const instance = withMotion(() => new PhotoSwipe({
    dataSource: photos.map(slideData),
    index,
    appendToEl: viewport,
    mainClass: 'pswp--inline',
    getViewportSizeFn: () => ({x: viewport.clientWidth, y: viewport.clientHeight}),
    padding: {top: 0, bottom: 0, left: 0, right: 0},
    bgOpacity: 1,
    spacing: 0.06,
    loop: true,
    showHideAnimationType: 'zoom',
    showAnimationDuration: ZOOM_MS,
    hideAnimationDuration: ZOOM_MS,
    easing: ZOOM_EASE,
    initialZoomLevel: 'fit',
    secondaryZoomLevel: 2,
    maxZoomLevel: 3,
    imageClickAction: false,
    bgClickAction: 'close',
    doubleTapAction: false,
    // A tap on the white area around the photo closes it; a tap on the photo does nothing.
    tapAction: (point, event) => { if (!event.target.closest('.pswp__img')) instance.close(); },
    wheelToZoom: false,
    trapFocus: false,
    returnFocus: false,
    zoom: false,
    counter: false,
    arrowPrev: false,
    arrowNext: false,
    close: true,
    closeSVG: CLOSE_SVG,
    closeTitle: closeLabel.getAttribute('aria-label'),
    errorMsg: '',
  }));
  pswp = instance;
  const placeInHero = () => {
    // Pointer positions are measured relative to the hero box rather than the page.
    const rect = viewport.getBoundingClientRect();
    instance.offset.x = rect.left + window.scrollX;
    instance.offset.y = rect.top + window.scrollY;
  };
  instance.on('gettingData', placeInHero);
  instance.on('updateScrollOffset', placeInHero);
  instance.on('resize', placeInHero);
  // Opening and closing zoom to the thumbnail's position inside the hero box.
  instance.addFilter('thumbBounds', bounds => {
    if (!bounds) return bounds;
    const rect = viewport.getBoundingClientRect();
    return {...bounds, x: bounds.x - rect.left, y: bounds.y - rect.top};
  });
  instance.on('uiRegister', () => {
    instance.ui.registerElement({
      name: 'caption', order: 9, isButton: false, appendTo: 'root', className: 'photo-caption',
      onInit: (element, photoswipe) => {
        const update = () => { element.textContent = captionText(photoswipe.currIndex); element.hidden = !element.textContent; };
        photoswipe.on('change', update); update();
      }
    });
  });
  instance.on('close', () => {
    // Bring the thumbnail into view so the photo can shrink back into it.
    const button = photos[instance.currIndex];
    const top = button.offsetTop;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    if (top + button.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + button.offsetHeight - scroller.clientHeight;
    document.body.classList.remove('photo-open');
  });
  instance.on('destroy', () => { if (pswp === instance) pswp = null; document.body.classList.remove('photo-open'); });
  document.body.classList.add('photo-open');
  instance.init();
}
// Instant close, used while the hero is faded out for a tab change.
function closeViewer(animate = true) {
  if (!pswp) return;
  if (animate) pswp.close(); else pswp.destroy();
}
function updateViewerLanguage() {
  if (!pswp) return;
  pswp.element?.querySelector('.pswp__button--close')?.setAttribute('title', closeLabel.getAttribute('aria-label'));
  pswp.element?.querySelector('.pswp__button--close')?.setAttribute('aria-label', closeLabel.getAttribute('aria-label'));
  const caption = pswp.element?.querySelector('.photo-caption');
  if (caption) { caption.textContent = captionText(pswp.currIndex); caption.hidden = !caption.textContent; }
}

photos.forEach((button, index) => button.addEventListener('click', event => {
  event.preventDefault();
  // Opened by mouse or touch: drop focus from the thumbnail so no focus ring shows on it behind the photo.
  const byKeyboard = event.detail === 0;
  if (!byKeyboard) button.blur();
  openPhoto(index);
  if (byKeyboard && pswp) pswp.on('destroy', () => photos[index].focus({preventScroll: true}));
}));

// Clicking or tapping anywhere on the page outside the photo closes it. The listener sits on .page as
// well as the document because iPhone Safari does not send taps on plain areas to a document listener.
function closeFromOutside(event) {
  if (!pswp || pswp.isDestroying) return;
  if (pswp.element?.contains(event.target)) return;
  if (event.target.closest('button,a,input,textarea,select,label')) return;
  pswp.close();
}
// Mouse: an ordinary click. Touch: a tap is detected from the pointer itself (finger down and up without
// moving), because mobile browsers do not reliably send a click for taps on plain areas of the page.
page.addEventListener('click', event => { if (!event.pointerType || event.pointerType === 'mouse') closeFromOutside(event); });
document.addEventListener('click', event => { if (!event.pointerType || event.pointerType === 'mouse') closeFromOutside(event); });
let touchTap = null;
document.addEventListener('pointerdown', event => {
  touchTap = event.pointerType === 'mouse' ? null : {id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now()};
}, true);
document.addEventListener('pointerup', event => {
  const start = touchTap;
  touchTap = null;
  if (!start || start.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10 || performance.now() - start.time > 600) return;
  closeFromOutside(event);
}, true);
