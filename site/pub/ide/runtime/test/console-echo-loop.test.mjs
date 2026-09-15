/**
 * console-echo-loop.test.mjs — regression test for the console echo loop
 * (WS-CODE-SINGLE-RUN verification gate, signal #2).
 *
 * Contract under guard: observers NEVER re-emit into the stream they observe.
 *
 * The Runtime math lane tees console.log into Bus 'console:write' for the
 * duration of a run.  ConsolePane OBSERVES 'console:write' and mirrors each
 * line to the native console for dev tooling.  If that mirror goes through
 * the LIVE window.console (which the tee has replaced), the pane's formatted
 * line ('[ConsolePane][info] …') is captured by the tee and re-emitted into
 * 'console:write' — every observer (MathView output area, the pane itself)
 * then shows a doubled, prefix-bearing duplicate line.
 *
 * Fix under guard: lib/components/console-output/index.js stashes the genuine
 * native console functions at module load (before any run can install a tee)
 * and mirrors exclusively through the stash.
 *
 * Run: node --test lib/shim/runtime/test/console-echo-loop.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── Minimal DOM stubs so the component module loads in Node ─────────────────

function makeStubEl(tag) {
    var el = {
        tagName: String(tag || 'div').toUpperCase(),
        children: [],
        attrs: {},
        style: {},
        className: '',
        innerHTML: '',
        textContent: '',
        scrollHeight: 0, scrollTop: 0, clientHeight: 0,
        appendChild: function (c) { el.children.push(c); return c; },
        removeChild: function (c) {
            var i = el.children.indexOf(c);
            if (i >= 0) { el.children.splice(i, 1); }
            return c;
        },
        setAttribute: function (k, v) { el.attrs[k] = String(v); },
        getAttribute: function (k) { return (k in el.attrs) ? el.attrs[k] : null; },
        addEventListener: function () {},
        removeEventListener: function () {},
        classList: {
            add: function (c) {
                if ((' ' + el.className + ' ').indexOf(' ' + c + ' ') === -1) {
                    el.className = (el.className ? el.className + ' ' : '') + c;
                }
            },
            remove: function (c) {
                el.className = (' ' + el.className + ' ')
                    .replace(' ' + c + ' ', ' ').trim();
            },
            contains: function (c) {
                return (' ' + el.className + ' ').indexOf(' ' + c + ' ') !== -1;
            }
        },
        querySelectorAll: function (sel) {
            // class-selector-only support, recursive
            var cls = String(sel).replace(/^\./, '');
            var out = [];
            (function walk(node) {
                node.children.forEach(function (c) {
                    if (c.classList && c.classList.contains(cls)) { out.push(c); }
                    if (c.children) { walk(c); }
                });
            })(el);
            return out;
        },
        get firstChild() { return el.children[0] || null; }
    };
    return el;
}

globalThis.document = {
    readyState: 'complete',
    addEventListener: function () {},
    removeEventListener: function () {},
    createElement: makeStubEl,
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    head: makeStubEl('head'),
    body: makeStubEl('body')
};
globalThis.window = globalThis;

// ── Import Bus + ConsolePane (the import order matters: the component must
//    stash the native console BEFORE the test installs its tee) ──────────────

const { Bus }         = await import(path.join(repoRoot, 'lib/shim/bus.js'));
const { ConsolePane } = await import(path.join(repoRoot, 'lib/components/console-output/index.js'));

// ── The test ─────────────────────────────────────────────────────────────────

test('ConsolePane mirror never re-enters console:write while console.log is teed', function () {
    var pane = new ConsolePane({ mountEl: makeStubEl('div') });
    pane.subscribe(Bus);

    // Install a runtime-style tee (mirrors lib/shim/runtime/index.js _runMath):
    // console.log → Bus 'console:write', with the same reentrancy guard.
    var origLog = console.log;
    var inTee = false;
    console.log = function () {
        if (inTee) { origLog.apply(console, arguments); return; }
        inTee = true;
        try {
            var parts = [];
            for (var i = 0; i < arguments.length; i++) { parts.push(String(arguments[i])); }
            Bus.emit('console:write', { level: 'info', text: parts.join(' ') });
        } finally {
            inTee = false;
        }
        origLog.apply(console, arguments);
    };

    var seen = [];
    function onWrite(p) { seen.push(String(p && p.text)); }
    Bus.on('console:write', onWrite);

    try {
        // A direct console:write (e.g. Runtime _consoleObj.print of the run
        // trailer) while the tee is installed — the pre-fix echo trigger.
        Bus.emit('console:write', { level: 'info', text: 'hello-tee-test' });
    } finally {
        console.log = origLog;
        Bus.off('console:write', onWrite);
        if (pane._busHandlers) {
            Bus.off('console:write', pane._busHandlers.write);
            Bus.off('console:clear', pane._busHandlers.clear);
            Bus.off('run:result',    pane._busHandlers.result);
            Bus.off('engine:error',  pane._busHandlers.engErr);
        }
    }

    var echoed = seen.filter(function (t) { return t.indexOf('[ConsolePane]') !== -1; });
    assert.equal(echoed.length, 0,
        'ConsolePane formatted line re-entered console:write (echo loop): ' + JSON.stringify(echoed));
    assert.deepEqual(seen, ['hello-tee-test'],
        'exactly the original line should pass through the stream once');
});
