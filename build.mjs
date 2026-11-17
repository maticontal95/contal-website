import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { marked } from 'marked';
const content = JSON.parse(await readFile('content.json', 'utf8'));
const gallery = JSON.parse(await readFile('gallery.json', 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const bilingual = (en, fr, className = '') => `<span class="translated ${className}" data-en="${escape(en)}" data-fr="${escape(fr)}">${escape(en)}</span>`;
const label = (group, key) => `aria-label="${escape(group[key + '_en'])}" data-label-en="${escape(group[key + '_en'])}" data-label-fr="${escape(group[key + '_fr'])}"`;
const cdn = (source, width) => `/.netlify/images?url=${encodeURIComponent(source)}&w=${width}&fm=webp&q=78`;
function body(section) {
  return ['en', 'fr'].map(lang => `<div data-language="${lang}" ${lang === 'fr' ? 'hidden' : ''}>` + content[section][lang].map(block => {
    const style = ['paragraph', 'initial', 'ornament'].includes(block.style) ? block.style : 'paragraph';
    const text = marked.parseInline(block.text || "");
    return style === 'ornament' ? `<div class="about-ornament">${text}</div>` : `<p class="${style}">${text}</p>`;
  }).join('\n') + '</div>').join('\n');
}
const replacements = {
  title: escape(content.metadata.title_en), description: escape(content.metadata.description_en),
  structured: `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'GeneralContractor',name:content.header.name,url:'https://contal.work',email:content.contact.email,telephone:content.contact.phone}).replaceAll('<','\\u003c')}</script>`,
  brand: escape(content.header.name), subtitle: bilingual(content.header.subtitle_en, content.header.subtitle_fr, 'subtitle'),
  nav_home: bilingual(content.navigation.home_en, content.navigation.home_fr),
  nav_services: bilingual(content.navigation.services_en, content.navigation.services_fr),
  nav_about: bilingual(content.navigation.about_en, content.navigation.about_fr),
  nav_label: label(content.interface,'navigation'), gallery_label: label(content.interface,'gallery'), close_label: label(content.interface,'close'), language_label: label(content.interface,'language'),
  language: bilingual(content.navigation.language_en,content.navigation.language_fr),
  about: body('about'), services: body('services'),
  contact: `${escape(content.contact.license)}<br><a class="email-link" href="mailto:${escape(content.contact.email)}">${escape(content.contact.email)}</a><br><a class="email-link" href="tel:${escape(String(content.contact.phone || '').replace(/[^+\d]/g,''))}">${escape(content.contact.phone)}</a>`,
  photos: gallery.photos.map((photo,index) => {
    const source = '/' + photo.image.replace(/^\//,'');
    if (!source.startsWith('/assets/') || source.includes('..')) throw new Error('Invalid gallery image path');
    return `<button class="gallery-item" type="button" data-full="${escape(cdn(source,1800))}" data-caption-en="${escape(photo.caption_en)}" data-caption-fr="${escape(photo.caption_fr)}" data-alt-en="${escape(photo.alt_en)}" data-alt-fr="${escape(photo.alt_fr)}" aria-label="${escape(content.interface.open_en)} ${index+1}" data-label-en="${escape(content.interface.open_en)} ${index+1}" data-label-fr="${escape(content.interface.open_fr)} ${index+1}"><img src="${escape(cdn(source,480))}" srcset="${escape(cdn(source,320))} 320w, ${escape(cdn(source,480))} 480w, ${escape(cdn(source,800))} 800w" sizes="(max-width: 700px) 46vw, (max-width: 980px) 23vw, 18vw" alt="${escape(photo.alt_en)}" loading="${index<4?'eager':'lazy'}" decoding="async"></button>`;
  }).join('\n')
};
let html = await readFile('template.html','utf8');
html = html.replace(/\{\{(\w+)\}\}/g, (_,key) => {
  if (!(key in replacements)) throw new Error(`Missing template field ${key}`);
  return replacements[key];
});
html = html.replace('</head>',`<script id="page-metadata" type="application/json">${JSON.stringify(content.metadata).replaceAll('<','\\u003c')}</script></head>`);
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for (const file of ['assets','admin','style.css','script.js','favicon.png','robots.txt','sitemap.xml']) await cp(file,`dist/${file}`,{recursive:true});
await writeFile('dist/index.html',html);
console.log(`Built page with ${gallery.photos.length} photographs and bilingual copy.`);
