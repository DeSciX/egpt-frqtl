/* Copyright 2023-2026 by Essam Abadir */

/**
 * _source-text.mjs — the ONE comment-stripper for the boot-phase manifest gates.
 *
 * The three manifest parity tests (game-layer, renderer-layer, shim-contract) all
 * match patterns against raw source text. Prose and commented-out code must never
 * satisfy those matches: a commented `// window.Foo = Foo;` left behind mid-archival
 * would otherwise register `Foo` as installed, and a commented `_u('…')` row would
 * count toward a phase roster it no longer loads.
 *
 * Not a `*.test.mjs` file — it is imported by the gates. Its conformance test is
 * `source-text.test.mjs`. The sdk node-require closure scan
 * (`sdk/frqtl-sdk/scripts/node-require-closure.mjs`) reads through it too.
 */

/**
 * Remove block and line comments from JS/JSX source, leaving string, template and regex
 * literals intact (a `/*` or `//` inside one is text, not a comment) and treating `</` as
 * a JSX closing tag rather than a regex start.
 *
 * @param {string} src — raw file text
 * @returns {string} the same text with every comment character replaced by a space
 *   (newlines kept, so line-anchored patterns and line counts still behave).
 */
export function stripJsComments(src) {
    src = String(src);
    let out = '';
    let i = 0;
    const n = src.length;
    let lastSig = '';                 // last significant (non-space) char emitted
    while (i < n) {
        const c = src[i];
        const d = src[i + 1];
        if (c === '/' && d === '*') {
            const end = src.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            out += src.slice(i, stop).replace(/[^\n]/g, ' ');
            i = stop;
            continue;
        }
        if (c === '/' && d === '/') {
            while (i < n && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        if (c === '\'' || c === '"' || c === '`') {
            let j = i + 1;
            while (j < n && src[j] !== c && (c === '`' || src[j] !== '\n')) {
                if (src[j] === '\\') j++;
                j++;
            }
            out += src.slice(i, j + 1);
            i = j + 1;
            lastSig = c;
            continue;
        }
        if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%>~^'.includes(lastSig))) {
            // regex literal — copy through its closing slash (respecting classes/escapes).
            // `<` is deliberately NOT a regex-start context: `</div>` is a JSX closing tag.
            let j = i + 1;
            let inClass = false;
            while (j < n && src[j] !== '\n') {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === '[') inClass = true;
                else if (src[j] === ']') inClass = false;
                else if (src[j] === '/' && !inClass) break;
                j++;
            }
            out += src.slice(i, j + 1);
            i = j + 1;
            lastSig = '/';
            continue;
        }
        out += c;
        if (!/\s/.test(c)) lastSig = c;
        i++;
    }
    return out;
}
