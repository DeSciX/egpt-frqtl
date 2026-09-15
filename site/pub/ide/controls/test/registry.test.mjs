/* Copyright 2023-2026 by Essam Abadir */

/**
 * registry.test.mjs — `lib/shim/controls/registry.js` (WS gym-controls-as-sugar
 * Bite 1, §2 "Instance addressing" ruling).
 *
 * Covers: register/get/has/enumerate/unregister for BOTH catalogs (objects,
 * controls), FAIL-LOUD on every documented failure mode (invalid name, missing
 * instance, id collision, unknown-id lookup, non-array descriptors, duplicate id
 * within one array, a malformed descriptor propagating from
 * normalizeControlDescriptor), factory isolation (two registries never share
 * state), and a ground-truth check against the REAL SphereEmitter.controls shape
 * (the scalar rows of setupSphereEmitter3D's control.controls, not a
 * synthetic invention) to prove an ALREADY-SHIPPED control array registers
 * cleanly with zero migration.
 *
 * Run: node --test lib/shim/controls/test/registry.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

const { makeControlRegistry } = require(path.join(repoRoot, 'lib/shim/controls/registry.js'));
const REGISTRY_SRC = readFileSync(path.join(repoRoot, 'lib/shim/controls/registry.js'), 'utf8');

function scalarFixture(id) {
    return {
        kind: 'scalar', id: id || 'flow', label: 'flow',
        min: 0, max: 1, step: 1, value: 1,
        fmt: function (v) { return v ? 'on' : 'off'; },
        onChange: function (v) { /* no-op */ }
    };
}

/* ── Objects catalog ─────────────────────────────────────────────────────────── */

describe('registry — objects catalog', function () {
    test('register + get + has + names round-trip', function () {
        const r = makeControlRegistry();
        const instance = { tag: 'a-tube' };
        r.registerObject('tube1', instance, 'Tube');
        assert.strictEqual(r.getObject('tube1'), instance, 'getObject returns the SAME instance reference');
        assert.equal(r.hasObject('tube1'), true);
        assert.equal(r.hasObject('nope'), false);
        assert.deepEqual(r.objectNames(), ['tube1']);
    });

    test('multiple same-kind instances register under distinct names', function () {
        const r = makeControlRegistry();
        r.registerObject('tube1', { n: 1 }, 'Tube');
        r.registerObject('tube2', { n: 2 }, 'Tube');
        assert.deepEqual(r.objectNames().sort(), ['tube1', 'tube2']);
        assert.equal(r.getObject('tube1').n, 1);
        assert.equal(r.getObject('tube2').n, 2);
    });

    test('FAIL-LOUD: invalid name (empty string, non-string, null, undefined)', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.registerObject('', {}), /name must be a non-empty string/);
        assert.throws(() => r.registerObject(null, {}), /name must be a non-empty string/);
        assert.throws(() => r.registerObject(undefined, {}), /name must be a non-empty string/);
        assert.throws(() => r.registerObject(42, {}), /name must be a non-empty string/);
    });

    test('FAIL-LOUD: missing instance (null/undefined)', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.registerObject('x', null), /instance must not be null\/undefined/);
        assert.throws(() => r.registerObject('x', undefined), /instance must not be null\/undefined/);
    });

    test('FAIL-LOUD: id collision on registerObject (never a silent overwrite)', function () {
        const r = makeControlRegistry();
        const first = { tag: 'first' };
        r.registerObject('dup', first, 'Tube');
        assert.throws(() => r.registerObject('dup', { tag: 'second' }, 'Tube'), /id collision/);
        // the FIRST registration survives untouched.
        assert.strictEqual(r.getObject('dup'), first);
    });

    test('FAIL-LOUD: getObject on an unknown name (names the registered set)', function () {
        const r = makeControlRegistry();
        r.registerObject('known', {});
        assert.throws(() => r.getObject('unknown-id'), /no object registered for "unknown-id"/);
    });

    test('unregisterObject frees the name for re-registration', function () {
        const r = makeControlRegistry();
        r.registerObject('x', { v: 1 });
        r.unregisterObject('x');
        assert.equal(r.hasObject('x'), false);
        assert.doesNotThrow(() => r.registerObject('x', { v: 2 }));
        assert.equal(r.getObject('x').v, 2);
    });

    test('FAIL-LOUD: unregisterObject on an unknown name', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.unregisterObject('nope'), /no object registered for "nope"/);
    });

    test('getObjectKind resolves the kind label alongside getObject (bind-execution routing, WS gym-controls-as-sugar)', function () {
        const r = makeControlRegistry();
        r.registerObject('bodyA', { mass: 5 }, 'Frame');
        r.registerObject('lo1', { rect: [0, 0, 10, 10] }, 'LargeObject');
        assert.equal(r.getObjectKind('bodyA'), 'Frame');
        assert.equal(r.getObjectKind('lo1'), 'LargeObject');
    });

    test('getObjectKind returns null when registerObject was called without a kind (never throws for that)', function () {
        const r = makeControlRegistry();
        r.registerObject('anon', { v: 1 });
        assert.strictEqual(r.getObjectKind('anon'), null);
    });

    test('FAIL-LOUD: getObjectKind on an unknown name (mirrors getObject)', function () {
        const r = makeControlRegistry();
        r.registerObject('known', {}, 'Frame');
        assert.throws(() => r.getObjectKind('unknown-id'), /no object registered for "unknown-id"/);
    });
});

/* ── Controls catalog ─────────────────────────────────────────────────────────── */

describe('registry — controls catalog', function () {
    test('registerControls normalizes and returns the descriptor array; getControls round-trips', function () {
        const r = makeControlRegistry();
        const out = r.registerControls('emitter1', [scalarFixture('flow'), scalarFixture('burst')]);
        assert.equal(out.length, 2);
        assert.equal(out[0].channel, 'physics', 'normalized entries carry the resolved channel');
        assert.deepEqual(r.getControls('emitter1'), out);
        assert.equal(r.hasControls('emitter1'), true);
        assert.deepEqual(r.controlNames(), ['emitter1']);
    });

    test('registerControls never mutates the input array/objects (fresh normalized copies)', function () {
        const r = makeControlRegistry();
        const input = [scalarFixture('flow')];
        const out = r.registerControls('e', input);
        assert.notStrictEqual(out[0], input[0], 'each entry is normalizeControlDescriptor\'s fresh bag');
        assert.equal(input[0].channel, undefined, 'the caller\'s original descriptor is untouched');
    });

    test('FAIL-LOUD: invalid name', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.registerControls('', [scalarFixture()]), /name must be a non-empty string/);
    });

    test('FAIL-LOUD: id collision on registerControls (never a silent overwrite)', function () {
        const r = makeControlRegistry();
        r.registerControls('e', [scalarFixture('a')]);
        assert.throws(() => r.registerControls('e', [scalarFixture('b')]), /id collision/);
        // the FIRST registration survives untouched.
        assert.equal(r.getControls('e').length, 1);
        assert.equal(r.getControls('e')[0].id, 'a');
    });

    test('FAIL-LOUD: descriptors must be an array', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.registerControls('e', scalarFixture()), /descriptors must be an array/);
        assert.throws(() => r.registerControls('e', null), /descriptors must be an array/);
    });

    test('FAIL-LOUD: duplicate control id WITHIN one array', function () {
        const r = makeControlRegistry();
        assert.throws(
            () => r.registerControls('e', [scalarFixture('same'), scalarFixture('same')]),
            /duplicate control id "same"/
        );
        // Nothing partial committed on a failed call.
        assert.equal(r.hasControls('e'), false);
    });

    test('FAIL-LOUD: a malformed descriptor propagates from normalizeControlDescriptor', function () {
        const r = makeControlRegistry();
        // Deleting onChange (with no bind present, WS gym-controls-as-sugar
        // binds+ControlSync FINAL design) is now the "neither write path
        // declared" case — still a malformed descriptor, still propagates.
        const bad = scalarFixture('x'); delete bad.onChange;
        assert.throws(() => r.registerControls('e', [bad]), /"onChange" or "bind" is required/);
        assert.equal(r.hasControls('e'), false);
    });

    test('FAIL-LOUD: getControls on an unknown name', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.getControls('nope'), /no controls registered for "nope"/);
    });

    test('unregisterControls frees the name for re-registration', function () {
        const r = makeControlRegistry();
        r.registerControls('e', [scalarFixture('a')]);
        r.unregisterControls('e');
        assert.equal(r.hasControls('e'), false);
        assert.doesNotThrow(() => r.registerControls('e', [scalarFixture('b')]));
    });

    test('FAIL-LOUD: unregisterControls on an unknown name', function () {
        const r = makeControlRegistry();
        assert.throws(() => r.unregisterControls('nope'), /no controls registered for "nope"/);
    });

    test('allControls() returns a snapshot map of every registered name', function () {
        const r = makeControlRegistry();
        r.registerControls('e1', [scalarFixture('a')]);
        r.registerControls('e2', [scalarFixture('b')]);
        const all = r.allControls();
        assert.deepEqual(Object.keys(all).sort(), ['e1', 'e2']);
        assert.equal(all.e1[0].id, 'a');
        assert.equal(all.e2[0].id, 'b');
    });
});

/* ── Factory isolation (NOT a singleton) ─────────────────────────────────────── */

describe('registry — factory isolation (multiple same-kind instances per page)', function () {
    test('two makeControlRegistry() instances never share state', function () {
        const rA = makeControlRegistry();
        const rB = makeControlRegistry();
        rA.registerObject('tube', { owner: 'A' });
        // The SAME name in a DIFFERENT registry instance must NOT collide — this is
        // the exact scenario the module docstring calls out (two independent
        // experiment runners, e.g. Physics Compare's JS-vs-WASM side-by-side, each
        // naming their own Tube "tube").
        assert.doesNotThrow(() => rB.registerObject('tube', { owner: 'B' }));
        assert.equal(rA.getObject('tube').owner, 'A');
        assert.equal(rB.getObject('tube').owner, 'B');
        assert.deepEqual(rA.objectNames(), ['tube']);
        assert.deepEqual(rB.objectNames(), ['tube']);
    });
});

/* ── Ground truth: the REAL SphereEmitter.controls shape registers cleanly ───── */

describe('registry — ground truth against the REAL SphereEmitter.controls shape', function () {
    test('the shipped scalar controls array registers with zero migration', function () {
        // The scalar rows of setupSphereEmitter3D's `control.controls` (the array
        // SphereEmitter.js's `controls` getter returns) — NOT a synthetic invention.
        // producer-conformance.test.mjs binds the SAME producer by REAL construction;
        // this file's subject is the REGISTRY, so the shape is inlined here to keep
        // the registry unit test free of a factory boot.
        const control = { setR: function () {}, setBurstSize: function () {} };
        const burstSize = 40;
        const sphereEmitterControls = [
            {
                id: 'R', label: 'R (radius / blockiness)', min: 2, max: 40, step: 1, value: 24,
                fmt: function (v) { return String(v); },
                onChange: function (v) { control.setR(v); }
            },
            {
                id: 'burstSize', label: 'burst size', min: 1, max: 200, step: 1, value: burstSize,
                fmt: function (v) { return String(v); },
                onChange: function (v) { control.setBurstSize(v); }
            }
        ];
        // These real-world arrays don't declare `kind` (they predate this schema) —
        // registerControls consumes them as-is once a `kind` is stamped on, mirroring
        // how a NEW sugar object built against this contract would author them; the
        // point is the REST of the shape needs no other change.
        const withKind = sphereEmitterControls.map(function (c) {
            return Object.assign({ kind: 'scalar' }, c);
        });
        const r = makeControlRegistry();
        const out = r.registerControls('sphereEmitter1', withKind);
        assert.equal(out.length, 2);
        assert.equal(out[0].id, 'R');
        assert.equal(out[1].id, 'burstSize');
        // Physics-channel default applies (the emitter drives a capability
        // accessor, never setRenderOption).
        assert.equal(out[0].channel, 'physics');
        assert.equal(out[1].channel, 'physics');
    });
});

/* ── ControlsSchema availability guard (architect gate, mirrors actionCompiler.js
 * _getAstSchema()/OvenBox.js _getAstSchema()) ──────────────────────────────────
 *
 * In Node, `require('./index.js')` at module load time either succeeds (index.js
 * is a sibling file that always exists in this repo) or throws immediately at
 * require-time — there is no way to reach a "ControlsSchema missing" state via a
 * normal `require()` of registry.js. The failure mode this guard defends against
 * is BROWSER-ONLY: a page that loads registry.js's <script> tag before (or
 * without) index.js's own <script> tag. We reproduce that exact environment with
 * `vm.runInNewContext` (the SAME technique realm-frqtl-renderer-session.test.mjs
 * uses to exercise render-boot.js's real source against a faked global scope) —
 * a FRESH global context with a bare `window` object and NO `module`/`require`,
 * so registry.js's own dual-environment branch takes the browser path for real. */

describe('registry — ControlsSchema availability guard (architect gate)', function () {
    test('FAIL-LOUD: a named contract error (not a raw TypeError) when window.ControlsSchema is absent', function () {
        // Simulate a plain <script> load with NO index.js script tag having run yet:
        // a bare `window` global (self-referential, mirroring the browser's own
        // `window === globalThis`), no `module`/`require` in scope (a fresh vm context
        // has neither unless the sandbox object defines them).
        const sandbox = {};
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(REGISTRY_SRC, sandbox, { filename: 'registry.js (browser sim, no schema loaded)' });

        assert.equal(typeof sandbox.ControlRegistry, 'object',
            'registry.js still installs window.ControlRegistry (only ControlsSchema resolution is deferred)');
        const registry = sandbox.ControlRegistry.makeControlRegistry();

        assert.throws(
            () => registry.registerControls('e', [scalarFixture('a')]),
            /\[controls\/registry\] ControlsSchema not available\. In the browser, ensure/,
            'must throw the NAMED contract error, not a raw "Cannot read properties of ' +
            'null/undefined" TypeError from calling normalizeControlDescriptor on a missing module'
        );
    });

    test('the SAME sandbox registers cleanly once window.ControlsSchema is published (mirrors the real load order)', function () {
        const SCHEMA_SRC = readFileSync(path.join(repoRoot, 'lib/shim/controls/index.js'), 'utf8');
        const sandbox = {};
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        // index.js's <script> tag loads FIRST (the correct page order) — publishes
        // window.ControlsSchema — THEN registry.js loads and finds it via the lazy
        // window fallback in _getControlsSchema().
        vm.runInContext(SCHEMA_SRC, sandbox, { filename: 'index.js (browser sim)' });
        vm.runInContext(REGISTRY_SRC, sandbox, { filename: 'registry.js (browser sim)' });

        const registry = sandbox.ControlRegistry.makeControlRegistry();
        assert.doesNotThrow(() => registry.registerControls('e', [scalarFixture('a')]));
        assert.equal(registry.getControls('e')[0].channel, 'physics');
    });
});
