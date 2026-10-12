// The one reader of the front page's #proof section and its tiles (frontpage.mjs, frontpage-tiles.mjs).
//
//   proofSection(html) → the <section id="proof"> body, or null
//   proofLinks(html)   → every <a> in it: { classes, href, img, title, what, cta } (decoded text)
//   tile               → a link whose class list has `tile`

export const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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
    const what = body.match(/<\/b>\s*<span>([\s\S]*?)<\/span>/);
    const cta = body.match(/<i>([\s\S]*?)<\/i>/);
    return {
      classes: (attr(' ' + attrs, 'class') || '').split(/\s+/).filter(Boolean),
      href: attr(' ' + attrs, 'href'),
      img: img ? attr(img[0], 'src') : null,
      title: b ? text(b[1]) : null,
      what: what ? text(what[1]) : null,
      cta: cta ? text(cta[1]) : null,
    };
  });
}

export const isTile = (link) => link.classes.includes('tile');
