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
 * Not a `*.test.mjs` file — it carries no tests and is imported by the gates.
 */

/**
 * Remove block and line comments from JS/JSX source.
 *
 * @param {string} src — raw file text
 * @returns {string} the same text with `/* … *\/` and `// …` removed (line
 *   structure preserved, so line-anchored patterns still behave).
 */
export function stripJsComments(src) {
    return String(src)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
}
