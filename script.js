const toggleButton = document.getElementById("lang-toggle");
const translatableElements = document.querySelectorAll(".i18n");
const translatableHtmlElements = document.querySelectorAll(".i18n-html");

const aboutCache = {};
const pageCache = {};

async function loadFragment(elementId, filename) {
    const key = filename;

    if (!pageCache[key]) {
        const response = await fetch(`assets/${filename}`);
        pageCache[key] = await response.text();
    }

    document.getElementById(elementId).innerHTML = pageCache[key];
}

let currentLang = localStorage.getItem("lang") || "en";

async function switchLanguageContent(lang) {
  translatableElements.forEach((el) => {
    const nextText = el.dataset[lang];
    if (nextText) {
      el.textContent = nextText;
    }
  });

  await Promise.all([
    loadFragment("about-content", `about-${lang}.html`),
    loadFragment("services-content", `services-${lang}.html`)
]);

  document.documentElement.lang = lang;
  toggleButton.textContent = lang === "en" ? "FR" : "EN";
  localStorage.setItem("lang", lang);
}

async function applyLanguage(lang, animate = false) {
  if (!animate) {
    await switchLanguageContent(lang);
    return;
  }

  translatableElements.forEach((el) => el.classList.add("is-fading"));
  translatableHtmlElements.forEach((el) => el.classList.add("is-fading"));

  setTimeout(async () => {
    await switchLanguageContent(lang);

    translatableElements.forEach((el) =>
      el.classList.remove("is-fading")
    );

    translatableHtmlElements.forEach((el) =>
      el.classList.remove("is-fading")
    );
  }, 180);
}

toggleButton.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "fr" : "en";
  applyLanguage(currentLang, true);
});

applyLanguage(currentLang, false);

/* stage toggle: home / about */
const menuLinks = document.querySelectorAll(".menu-link");
const stagePanels = document.querySelectorAll(".stage-panel");

function showPanel(panelName) {
  menuLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.panel === panelName);
  });

  stagePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.stage === panelName);
  });


}

menuLinks.forEach((link) => {
  link.addEventListener("click", () => {
    showPanel(link.dataset.panel);
  });
});
let galleryItems = Array.from(document.querySelectorAll('.gallery-item'));
const lightbox = document.querySelector('.lightbox');
const fullImage = lightbox.querySelector('img');
let photoIndex = 0;
function displayPhoto(index) {
  photoIndex = (index + galleryItems.length) % galleryItems.length;
  const source = galleryItems[photoIndex].querySelector('img');
  fullImage.src = source.src;
  fullImage.alt = source.alt;
  lightbox.querySelector('figcaption').textContent = galleryItems[photoIndex].dataset[currentLang] || '';
}
function bindGallery() {
  galleryItems.forEach((item, index) => {
    item.addEventListener('click', () => {
      displayPhoto(index);
      lightbox.showModal();
      document.body.style.overflow = 'hidden';
    });
  });
}
bindGallery();
async function loadGallery() {
  try {
    const response = await fetch('gallery.json');
    if (!response.ok) throw new Error('Gallery unavailable');
    const data = await response.json();
    if (!Array.isArray(data.photos)) throw new Error('Invalid gallery');
    const items = data.photos.map((photo, index) => {
      const button = document.createElement('button');
      button.className = 'gallery-item';
      button.type = 'button';
      button.setAttribute('aria-label', `Open photograph ${index + 1}`);
      button.dataset.en = photo.caption_en || '';
      button.dataset.fr = photo.caption_fr || '';
      const image = document.createElement('img');
      const url = new URL(photo.image, location.href);
      if (url.origin !== location.origin) throw new Error('Unsupported image source');
      image.src = url.href;
      image.alt = photo['alt_' + currentLang] || '';
      image.loading = 'lazy';
      button.append(image);
      return button;
    });
    document.querySelector('.site-gallery').replaceChildren(...items);
    galleryItems = items;
    bindGallery();
  } catch (error) {
    console.error('Could not load gallery', error);
  }
}
loadGallery();
lightbox.querySelector('.lightbox-close').onclick = () => lightbox.close();
lightbox.querySelector('.lightbox-prev').onclick = () => displayPhoto(photoIndex - 1);
lightbox.querySelector('.lightbox-next').onclick = () => displayPhoto(photoIndex + 1);
lightbox.addEventListener('click', event => {
  if (event.target === lightbox) lightbox.close();
});
lightbox.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') displayPhoto(photoIndex - 1);
  if (event.key === 'ArrowRight') displayPhoto(photoIndex + 1);
});
lightbox.addEventListener('close', () => {
  document.body.style.overflow = '';
  galleryItems[photoIndex].focus();
});
