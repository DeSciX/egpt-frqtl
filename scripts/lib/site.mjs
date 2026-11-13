/**
 * site.mjs — the one owner of what site/ holds outside the assembly.
 *
 *   SITE_FOREIGN     the top-level site/ entries this repo owns outside the assembly (tracked here, carried across
 *                    every assembly byte-identical): the front page, its images (tile stills included), the shell
 *                    SDK file the front page and STUDIO load, and the share card
 *   hostProvidedOf(html, attr) → the src/href of every element carrying `attr` (the package's HOST_PROVIDED_ATTR):
 *                    the site files STUDIO declares it loads from the host
 */
export const SITE_FOREIGN = Object.freeze(['index.html', 'images', 'DeSciXAppSDK.js', 'share.json']);

export function hostProvidedOf(html, attr) {
    const out = [];
    const tag = new RegExp('<[A-Za-z][^>]*\\s' + attr + '(?=[\\s=/>])[^>]*>', 'g');
    for (const m of html.matchAll(tag)) {
        const ref = m[0].match(/\s(?:src|href)="([^"]*)"/);
        if (!ref) { throw new Error('an element carries ' + attr + ' but names no src or href: ' + m[0]); }
        out.push(ref[1]);
    }
    return out;
}
