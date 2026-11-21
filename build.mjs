import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { marked } from 'marked';
const content = JSON.parse(await readFile('content.json', 'utf8'));
const gallery = JSON.parse(await readFile('gallery.json', 'utf8'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const bilingual = (en, fr, className = '') => `<span class="translated ${className}" data-en="${escape(en)}" data-fr="${escape(fr)}">${escape(en)}</span>`;
const label = (group, key) => `aria-label="${escape(group[key + '_en'])}" data-label-en="${escape(group[key + '_en'])}" data-label-fr="${escape(group[key + '_fr'])}"`;
// Reads an image's displayed width and height from its file header (JPEG with EXIF rotation, PNG, WebP),
// so the photo viewer knows each photo's shape before it loads.
function imageSize(buffer) {
  try {
    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buffer.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return {width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3)};
      if (chunk === 'VP8L') { const bits = buffer.readUInt32LE(21); return {width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1}; }
      if (chunk === 'VP8 ') return {width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff};
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2, orientation = 1;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker === 0xe1 && buffer.toString('ascii', offset + 4, offset + 8) === 'Exif') {
          const tiff = offset + 10;
          const little = buffer.toString('ascii', tiff, tiff + 2) === 'II';
          const u16 = at => little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
          const u32 = at => little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
          const directory = tiff + u32(tiff + 4);
          for (let entry = 0; entry < u16(directory); entry++) {
            const at = directory + 2 + entry * 12;
            if (u16(at) === 0x0112) orientation = u16(at + 8);
          }
        }
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          const height = buffer.readUInt16BE(offset + 5), width = buffer.readUInt16BE(offset + 7);
          return orientation >= 5 ? {width: height, height: width} : {width, height};
        }
        offset += 2 + length;
      }
    }
  } catch {}
  return null;
}
const cdn = (source, width) => `/.netlify/images?url=${encodeURIComponent(source)}&w=${width}&fm=webp&q=78`;
// "word^2" in the About text becomes a footnote mark that opens figure 2.
const figureCount = (content.figures || []).length;
const figureRefs = (html, lang) => html.replace(/\^(\d+)/g, (match, number) => {
  if (Number(number) < 1 || Number(number) > figureCount) return match;
  const label = `${content.interface?.['figure_' + lang] || 'Figure'} ${number}`;
  return `<sup class="fig-ref"><button type="button" data-note="${number}" aria-label="${escape(label)}">${number}</button></sup>`;
});
function body(section) {
  return ['en', 'fr'].map(lang => `<div data-language="${lang}" ${lang === 'fr' ? 'hidden' : ''}>` + content[section][lang].map(block => {
    const style = ['paragraph', 'initial', 'ornament'].includes(block.style) ? block.style : 'paragraph';
    const text = figureRefs(marked.parseInline(block.text || ""), lang);
    return style === 'ornament' ? `<div class="about-ornament">${text}</div>` : `<p class="${style}">${text}</p>`;
  }).join('\n') + '</div>').join('\n');
}
async function sizeAttributes(image) {
  const size = await readFile(image.replace(/^\//,'')).then(imageSize).catch(() => null);
  if (!size) return '';
  const scale = 1800 / size.width;
  return `data-width="${Math.round(size.width * scale)}" data-height="${Math.round(size.height * scale)}" `;
}
function assetPath(image) {
  const source = '/' + String(image || '').replace(/^\//,'');
  if (!source.startsWith('/assets/') || source.includes('..')) throw new Error('Invalid image path');
  return source;
}
// Numbered plates of photos shown beside the About text (margin on desktop, a small row on phones).
async function figuresHtml() {
  const notes = content.figures || [];
  const plates = await Promise.all(notes.map(async (note, noteIndex) => {
    const number = noteIndex + 1;
    const thumbs = await Promise.all((note.photos || []).map(async photo => {
      const source = assetPath(photo.image);
      return `<button class="figure-thumb" type="button" data-note="${number}" ${await sizeAttributes(source)}data-full="${escape(cdn(source,1800))}" data-caption-en="${escape(number + '\u2002' + (note.caption_en || ''))}" data-caption-fr="${escape(number + '\u2002' + (note.caption_fr || ''))}" data-alt-en="${escape(photo.alt_en)}" data-alt-fr="${escape(photo.alt_fr)}" aria-label="${escape(content.interface?.figure_en || 'Figure')} ${number}" data-label-en="${escape(content.interface?.figure_en || 'Figure')} ${number}" data-label-fr="${escape(content.interface?.figure_fr || 'Figure')} ${number}"><img src="${escape(cdn(source,320))}" srcset="${escape(cdn(source,160))} 160w, ${escape(cdn(source,320))} 320w" sizes="120px" alt="${escape(photo.alt_en)}" loading="lazy" decoding="async"></button>`;
    }));
    return `<figure class="figure-plate" data-note="${number}"><div class="figure-thumbs">${thumbs.join('')}</div><figcaption><span class="figure-number">${number}</span>${bilingual(note.caption_en, note.caption_fr, 'figure-caption')}</figcaption></figure>`;
  }));
  return `<aside class="about-figures" ${label(content.interface, 'figures')}><div class="about-figures-inner">${plates.join('')}</div></aside>`;
}
const sizes = await Promise.all(gallery.photos.map(photo => readFile(photo.image.replace(/^\//,'')).then(imageSize).catch(() => null)));
const replacements = {
  figures: await figuresHtml(),
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
    const size = sizes[index];
    // The viewer only needs each photo's shape; a nominal 1800px width lets small originals fill the hero too.
    const scale = size ? 1800 / size.width : 0;
    const dimensions = size ? `data-width="${Math.round(size.width * scale)}" data-height="${Math.round(size.height * scale)}" ` : '';
    return `<button class="gallery-item" type="button" ${dimensions}data-full="${escape(cdn(source,1800))}" data-caption-en="${escape(photo.caption_en)}" data-caption-fr="${escape(photo.caption_fr)}" data-alt-en="${escape(photo.alt_en)}" data-alt-fr="${escape(photo.alt_fr)}" aria-label="${escape(content.interface.open_en)} ${index+1}" data-label-en="${escape(content.interface.open_en)} ${index+1}" data-label-fr="${escape(content.interface.open_fr)} ${index+1}"><img src="${escape(cdn(source,480))}" srcset="${escape(cdn(source,320))} 320w, ${escape(cdn(source,480))} 480w, ${escape(cdn(source,800))} 800w" sizes="(max-width: 700px) 46vw, (max-width: 980px) 23vw, 18vw" alt="${escape(photo.alt_en)}" loading="${index<4?'eager':'lazy'}" decoding="async"></button>`;
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
for (const file of ['assets','admin','vendor','style.css','script.js','favicon.png','robots.txt','sitemap.xml']) await cp(file,`dist/${file}`,{recursive:true});
await writeFile('dist/index.html',html);
console.log(`Built page with ${gallery.photos.length} photographs and bilingual copy.`);
