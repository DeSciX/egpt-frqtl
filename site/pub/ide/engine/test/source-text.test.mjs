/* Copyright 2023-2026 by Essam Abadir */

/**
 * source-text.test.mjs — conformance for `_source-text.mjs::stripJsComments`, the ONE
 * comment-stripper the manifest gates and the sdk node-require closure scan read through.
 *
 * Every case pairs a line that must SURVIVE with a comment that must GO. Two cases are the
 * failure modes of a comment regex that ignores strings (`/*` or `//` inside a string); two are
 * the failure modes of a string-aware stripper that ignores regex literals and JSX (a quote in
 * a regex opening a phantom string; the `/` of `</div>` read as a regex start).
 *
 * Run: node --test lib/shim/engine/test/source-text.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripJsComments } from './_source-text.mjs';

describe('stripJsComments — strings, regex literals and JSX are not comments', () => {
    test('`/*` inside a string does not open a block comment', () => {
        const out = stripJsComments("var glob = 'src/*.js';\nrequire('./kept.js');\n/* gone */");
        assert.match(out, /'src\/\*\.js'/);
        assert.match(out, /require\('\.\/kept\.js'\)/);
        assert.doesNotMatch(out, /gone/);
    });

    test("`//` inside a string ('http://…') does not open a line comment", () => {
        const out = stripJsComments("var u = 'http://example.com'; require('./kept.js'); // gone");
        assert.match(out, /'http:\/\/example\.com'/);
        assert.match(out, /require\('\.\/kept\.js'\)/);
        assert.doesNotMatch(out, /gone/);
    });

    test('a quote inside a regex literal does not open a string', () => {
        const out = stripJsComments("var re = /[\"']/g; // gone\nrequire('./kept.js');");
        assert.match(out, /\/\["'\]\/g/);
        assert.doesNotMatch(out, /gone/);
        assert.match(out, /require\('\.\/kept\.js'\)/);
    });

    test('a JSX closing tag is not a regex: `</div> // comment` loses only the comment', () => {
        const out = stripJsComments("return (<div>hi</div> // gone\n); window.Kept = Kept;");
        assert.match(out, /<div>hi<\/div>/);
        assert.doesNotMatch(out, /gone/);
        assert.match(out, /window\.Kept = Kept;/);
    });

    test('line structure is preserved (a block comment keeps its newlines)', () => {
        const src = "a();\n/* one\ntwo */\nb();";
        const out = stripJsComments(src);
        assert.equal(out.split('\n').length, src.split('\n').length);
        assert.match(out.split('\n')[3], /b\(\);/);
    });
});
