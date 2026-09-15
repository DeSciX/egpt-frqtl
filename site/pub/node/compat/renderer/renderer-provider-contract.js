/* Copyright 2023-2026 by Essam Abadir */

/**
 * renderer-provider-contract.js — the CODE OWNER of the `RendererProvider` method lists.
 *
 * `RendererProvider` is duck-typed: a BYO renderer is a plain object from a
 * `makeProvider()` factory, registered through the boot-fixed display slot. Nothing is
 * imported to implement it — which is exactly why the METHOD LISTS need one owner. Before
 * this module they existed only as prose in `docs/internal/engine/RENDERER_CONTRACT.md` §1
 * and as scattered `typeof provider.X === 'function'` checks in the hosts; a BYO author
 * checking their own object had to hand-copy the list, which is the schema-mirror
 * anti-pattern with the doc as the mirror. THIS FILE is now the owner; the doc cites it.
 *
 * The two lists are transcribed from RENDERER_CONTRACT.md §1 / §1a. A method's SEMANTICS
 * stay in that document — this module owns only the NAMES and the required/optional split,
 * because that is the only part a program can check.
 *
 * ── THE REQUIRED/OPTIONAL SPLIT IS LOAD-BEARING ─────────────────────────────
 *
 * An absent OPTIONAL capability is NEVER an error (RENDERER_CONTRACT §1a, "absent ⇒
 * hidden, never an error"): a provider that omits `getCameraControl` simply gets no camera
 * strip. Hosts capability-check per method — they never renderer-sniff. So
 * `validateRendererProvider` reports optionals as CAPABILITIES, never as failures, and its
 * `ok` is decided by the REQUIRED nine alone.
 *
 * ── IT IS A VALIDATOR, NOT A GATE ───────────────────────────────────────────
 *
 * `validateRendererProvider` NEVER THROWS — not even on a non-object. It returns a report;
 * the CALLER decides whether a missing method is fatal in its context (a host that boots a
 * provider fails loud; an authoring tool that lints one shows a list). A validator that
 * threw would force every caller to wrap it in try/catch to ask a question.
 *
 * @example
 *   const { validateRendererProvider } = require('@descix/frqtl-sdk');
 *   const report = validateRendererProvider(myProvider);
 *   if (!report.ok) throw new Error('BYO renderer missing: ' + report.missing.join(', '));
 *   // report.capabilities → e.g. ['renderCapabilities', 'captureStill']
 */

(function () {
    'use strict';

    /**
     * The nine REQUIRED methods. Every renderer — built-in or BYO — must implement
     * exactly these; nothing above the shim calls anything else on a renderer.
     * @type {string[]}
     */
    var RENDERER_PROVIDER_REQUIRED = [
        'init',          // create canvas/context (+ scene/buffers)
        'setSize',       // resize the drawing surface
        'start',         // may be a NO-OP (the RAF loop is FrqtlApp's)
        'stop',
        'destroy',       // tear down; release GL resources
        'renderTick',    // draw ONE frame from pure data
        'filter',        // queue/apply a post-process pass
        'removeFilter',  // remove a queued pass by name
        'raw'            // the underlying backend object (escape hatch)
    ];

    /**
     * The five OPTIONAL capabilities. Absent ⇒ the corresponding host UI is hidden.
     * NEVER an error.
     * @type {string[]}
     */
    var RENDERER_PROVIDER_OPTIONAL = [
        'renderCapabilities',  // FieldDescriptor[] — this provider's own render knobs
        'getCameraControl',    // the orbit/pose sugar handle
        'screenToWorld',       // unproject a canvas point to a world point
        'captureStill',        // the `composite` stage tap
        'projection'           // the scene's camera intrinsics (rides the SceneRecord)
    ];

    /**
     * Check a candidate against the frozen `RendererProvider` contract.
     *
     * @param {object} provider - the object a `makeProvider()` factory returned.
     * @returns {{ok: boolean, missing: string[], capabilities: string[]}}
     *   `ok`           — true iff EVERY required name is a function.
     *   `missing`      — the required names that are not functions (in contract order).
     *   `capabilities` — the optional names that ARE functions (in contract order).
     *   A non-object argument reports every required name missing and no capabilities —
     *   it does not throw.
     */
    function validateRendererProvider(provider) {
        var isObject = (provider !== null && (typeof provider === 'object' || typeof provider === 'function'));
        if (!isObject) {
            return { ok: false, missing: RENDERER_PROVIDER_REQUIRED.slice(), capabilities: [] };
        }
        var missing = RENDERER_PROVIDER_REQUIRED.filter(function (name) {
            return typeof provider[name] !== 'function';
        });
        var capabilities = RENDERER_PROVIDER_OPTIONAL.filter(function (name) {
            return typeof provider[name] === 'function';
        });
        return { ok: missing.length === 0, missing: missing, capabilities: capabilities };
    }

    var contract = {
        RENDERER_PROVIDER_REQUIRED: RENDERER_PROVIDER_REQUIRED,
        RENDERER_PROVIDER_OPTIONAL: RENDERER_PROVIDER_OPTIONAL,
        validateRendererProvider: validateRendererProvider
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = contract;
    } else if (typeof window !== 'undefined') {
        window.RendererProviderContract = contract;
        window.RENDERER_PROVIDER_REQUIRED = RENDERER_PROVIDER_REQUIRED;
        window.RENDERER_PROVIDER_OPTIONAL = RENDERER_PROVIDER_OPTIONAL;
        window.validateRendererProvider = validateRendererProvider;
    }

})();
