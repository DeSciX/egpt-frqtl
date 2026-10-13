// The one reader of the front page's #proof section and its tiles (frontpage.mjs, frontpage-tiles.mjs).
//
//   proofSection(html) → the <section id="proof"> body, or null
//   proofLinks(html)   → every <a> in it: { classes, href, img, alt, title, tile, cta } (decoded text;
//                        `tile` is the caption's one-line <span>, `alt` the img's alt or null)
//   throughLines(html) → the decoded text of every [data-showcase-throughline] element in #proof
//   tile               → a link whose class list has `tile`

export const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const text = (s) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? decode(m[1]) : null; };

export function proofSection(html) {
  const m = html.match(/<section\b[^>]*\bid="proof"[^>]*>([\s\S]*?)<\/section>/);
  return m ? m[1] : null;
}

export function proofLinks(html) {
  return [...(proofSection(html) || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, body]) => {
    const img = body.match(/<img\b[^>]*>/);
    const b = body.match(/<b>([\s\S]*?)<\/b>/);
    const line = body.match(/<\/b>\s*<span>([\s\S]*?)<\/span>/);
    const cta = body.match(/<i>([\s\S]*?)<\/i>/);
    return {
      classes: (attr(' ' + attrs, 'class') || '').split(/\s+/).filter(Boolean),
      href: attr(' ' + attrs, 'href'),
      img: img ? attr(img[0], 'src') : null,
      alt: img ? attr(img[0], 'alt') : null,
      title: b ? text(b[1]) : null,
      tile: line ? text(line[1]) : null,
      cta: cta ? text(cta[1]) : null,
    };
  });
}

export const isTile = (link) => link.classes.includes('tile');

export function throughLines(html) {
  return [...(proofSection(html) || '').matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-showcase-throughline\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => text(m[2]));
}
