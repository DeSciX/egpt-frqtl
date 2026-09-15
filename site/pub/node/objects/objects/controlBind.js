/* Copyright 2023-2026 by Essam Abadir */

/**
 * controlBind.js — OBJECTS-SIDE execution for a scalar control descriptor's
 * `bind: {object, prop}` (WS gym-controls-as-sugar, FULL CONVERGENCE build,
 * Stage i item 2).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `resolveBind(bind, ctx, channel)` → `{ set(value), get() }`.
 *
 * Arrow ruling (§5 converged): `lib/shim/controls` owns the `bind` DATA SHAPE
 * only (`{object, prop}`, both non-empty strings — `ControlsSchema.BIND_KEYS`).
 * EXECUTION — resolving `bind.object` to a live handle, dispatching by
 * `channel`/object-kind, and routing through the real property accessors — is
 * OBJECTS-SIDE: it lives here, beside the panel/slider/sync sugar that
 * consumes it, never inside the shim.
 *
 * `ctx` shape (all fields optional; the fields actually used depend on
 * `channel` and the resolved object's `kind` — see the per-branch throws
 * below for exactly what is required when):
 *   {
 *     registry:      a makeControlRegistry() instance (lib/shim/controls/registry.js)
 *                    — resolves `bind.object` → { instance, kind } via
 *                    `getObject`/`getObjectKind`. Required for every
 *                    non-render channel.
 *     universe:      the live EGPTUniverse — `setFrameProperty`/`getFrameProperty`
 *                    (Frame kind ONLY — see below). Required for the Frame channel.
 *     renderCapabilityIds: optional `string[]` — the OPT-IN FAIL-LOUD gate for
 *                    render-channel writes (§7 r2 item 1). Typically
 *                    `makeControlsForRenderSurface(...).capabilityIds`.
 *                    Omitted OR EMPTY -> the render branch stays exactly as
 *                    permissive as it always was (an empty list carries no
 *                    declaration information, so it cannot arm an opt-in gate).
 *     runner:        the FrqtlApp. Required for the render channel
 *                    (`runner.setRenderOption`/`getRenderOption` for ordinary
 *                    render options; `runner.setFilterActive`/`isFilterActive`
 *                    for a `filter.<name>` capability — §7 r2 item 2), for the LargeObject/backdrop
 *                    channel (`runner.updateObjectProperty(wrapper, prop, value)` —
 *                    the SAME uniform schema-driven accessor Studio's own Inspector
 *                    calls, per root CLAUDE.md §Object architecture: "Writes go
 *                    through the property accessors ... throw-or-apply, never
 *                    silent-skip". S1 fix (design §2.3.1 / gap-census #3): this
 *                    branch used to call `ctx.universe.updateObjectProperty(handle,
 *                    kind, prop, value)` directly — the Universe-level WASM ABI,
 *                    which schema-validates then SILENTLY NO-OPS every
 *                    `engineVisible:false` prop (color/alpha/collision_type/
 *                    actions/name) because the JS-wrapper mirror those props
 *                    depend on lives in `FrqtlApp`, one layer above,
 *                    which this bypassed. Routing through `ctx.runner` fixes it),
 *                    AND for a `bind.object === 'universe'` bind
 *                    (`runner.setUniverseProperty`/`getUniverseProperty` — S1 fix,
 *                    design §2.3.2 / gap-census #10, the 4th resolveBind dispatch
 *                    branch, see below).
 *     readSnapshot:  optional `(handle, kind, prop) => *|undefined` — the
 *                    LargeObject/backdrop READ path. There is no
 *                    `getObjectProperty` accessor (`updateObjectProperty` is
 *                    write-only); the only read authority for LO state is the
 *                    LAST `TickData.objects[handle]` snapshot (§B2.2:
 *                    `{handle, count, frames}` — `count` is the one scalar
 *                    prop actually marshalled today). Callers that hold the
 *                    last TickData (ControlSync, Stage ii) supply this;
 *                    omitting it makes the LO `get()` a DEFINED SKIP
 *                    (returns undefined) — never a fabricated read. (The
 *                    render channel now HAS a read, via `runner.getRenderOption`/
 *                    `isFilterActive` — §7 r2 item 1 — but degrades to the
 *                    SAME defined-skip discipline when `ctx.runner` lacks
 *                    those methods, e.g. an older runner build.)
 *   }
 *
 * Registration precedent (`registry.js`'s own docstring/tests): a Frame-kind
 * bind target registers the bare QUANTUM_ID (a number — what
 * `setFrameProperty`/`getFrameProperty` key on, e.g. `lane.aQid` from
 * `setupCollisionMatrix.js`); a LargeObject-kind bind target registers the
 * live LO WRAPPER instance (has `.handle`, e.g. a `LargeObject`/`Tube`/
 * `Tube` — `updateObjectProperty` and the TickData snapshot both key on
 * `.handle`, not on the registry name).
 *
 * Two-stage validation (never a bind-local property list): Stage 1 is the
 * shim's shape check (`bind.object`/`bind.prop` are non-empty strings) — DONE
 * before this file ever runs. Stage 2 is the REAL accessor's OWN
 * schema-driven prop validation (`setFrameProperty`/`updateObjectProperty`
 * already consult `ObjectSchema.get(kind)` internally and throw on
 * unknown/readonly props) — `resolveBind`'s `set()` gets this for free by
 * calling the real accessor; it never re-implements a parallel prop list.
 *
 * Kind scope: `resolveBind` dispatches on FOUR things, in this order — render
 * channel (no registry involved) → `bind.object === 'universe'` (reserved
 * sentinel, no registry lookup — see the UNIVERSE branch below) → registry-
 * resolved `kind === 'Frame'` → registry-resolved `kind === 'LargeObject' ||
 * kind === 'backdrop'`. `resolveBind` FAILS LOUD for any OTHER registry-
 * resolved kind (e.g. `Dimension`) rather than silently no-op through
 * `updateObjectProperty`'s own WASM-ABI dispatch gap (`wasm-engine.js` — kinds
 * outside `{LargeObject, backdrop}` pass schema validation then silently
 * no-op there, a pre-existing, out-of-scope gap this file refuses to expose).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * This file adds ZERO physics — it is pure dispatch/routing glue between a
 * declarative `{object, prop}` pair and the property-accessor substrate that
 * already exists. A bind-driven slider produces the IDENTICAL simulation
 * effect as calling the SAME accessor by hand (proven at the demo level —
 * see the collision-matrix Rule-0 oracle for the concrete bind-only control).
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches its objects/objects/
 *    peers — frqtl-controls-panel.js, frqtl-control-slider.js, Tube.js) ───────
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — see Wall.js, LargeObject.js
//    and 24 more siblings). Every declaration below is PRIVATE to this file; the ONLY
//    thing that reaches the shared browser global scope is the explicit window.<NS>
//    assignment at the bottom. Classic <script> tags share ONE global lexical scope,
//    so an unwrapped top-level 'function _label(...)' here would silently OVERWRITE a
//    same-named helper in a sibling script (and vice-versa) — a collision that is
//    invisible to 'node --test' by construction, because Node gives each file its own
//    module scope. Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

/**
 * resolveBind(bind, ctx, channel) → { set(value), get() }
 *
 * @param {{object:string, prop:string}} bind — already shape-validated by
 *   `lib/shim/controls` at descriptor-normalize time (Stage 1).
 * @param {object} ctx — see file docstring.
 * @param {'physics'|'render'} [channel='physics'] — the descriptor's own
 *   `channel` (defaults to the same DEFAULT_CHANNEL the shim applies).
 * @returns {{set:(value:*)=>void, get:()=>*}}
 * @throws {Error} FAIL-LOUD — malformed `bind`, an unregistered `bind.object`,
 *   a missing required `ctx` field for the resolved channel/kind, or a
 *   resolved object kind outside {Frame, LargeObject, backdrop}.
 */
function resolveBind(bind, ctx, channel) {
    if (!bind || typeof bind !== 'object' || typeof bind.prop !== 'string' || !bind.prop ||
        typeof bind.object !== 'string' || !bind.object) {
        throw new Error('[controlBind] resolveBind requires bind = {object, prop} (both non-empty ' +
            'strings) — got ' + JSON.stringify(bind) + '. (FAIL-LOUD — this should already have been ' +
            'caught by lib/shim/controls at normalize time; resolveBind re-checks defensively, never ' +
            'as the primary gate.)');
    }
    ctx = ctx || {};
    var ch = channel || 'physics';

    // ── RENDER CHANNEL (WS Studio Controls Realignment §7 r2 — updated) ──────
    // `bind.object` is carried for shape uniformity only (the shim's BIND_KEYS
    // contract does not vary by channel) and is not consulted here; the render
    // option/capability NAME is `bind.prop` (e.g. 'colorScheme', 'shape',
    // 'godrays', 'filter.water').
    //
    // TWO write/read primitives share this one channel (§7 r2 item 2, the
    // ratified filter re-model — "the render surface's write primitive is the
    // RendererProvider CONTRACT... not literally setRenderOption"):
    //   - `bind.prop` starting with `filter.` (a MULTI-SLOT name-keyed toggle —
    //     `Filters.water`/`Filters.bloom`) routes through
    //     `runner.setFilterActive(name, bool)` / `runner.isFilterActive(name)`
    //     — the provider's REQUIRED `filter()`/`removeFilter()` methods, NEVER
    //     tunneled through `setRenderOption` (which cannot express "2 filters
    //     concurrently active").
    //   - every OTHER `bind.prop` routes through the PERMISSIVE
    //     `runner.setRenderOption(prop, value)` (unchanged — a blanket write
    //     validation there would break existing ad-hoc callers) and its new
    //     validated read counterpart `runner.getRenderOption(prop)` (the
    //     "getRenderOption absent" gap this closes — a render control can now
    //     genuinely RECONCILE, not just write-and-forget).
    //
    // Optional FAIL-LOUD gate (§7 r2 item 1, "the factory boundary"): when the
    // caller's `ctx` carries `renderCapabilityIds` (an array of declared
    // capability names — `makeControlsForRenderSurface`'s own return value's
    // `capabilityIds`, threaded in by whatever host registered its output), a
    // write to a `bind.prop` NOT in that list throws — never a silent
    // undeclared-key write. Omitting `ctx.renderCapabilityIds` keeps this
    // branch exactly as permissive as it always was (opt-in gate, not a
    // retrofit requirement on every existing render-channel bind).
    //
    // An EMPTY list carries NO declaration information and therefore does not
    // arm the gate — it is the same state as "omitted". This is what the
    // opt-in wording means and what every host's own fallback comment already
    // assumes ("capabilityIds stays [] -> the gate becomes a no-op"): a
    // provider that declares no capabilities, or a host whose generation step
    // failed, must degrade to the PERMISSIVE pre-gate behavior — never to
    // "reject every render write", which is how a single generation failure
    // would otherwise black out an entire experiment's render state.
    if (ch === 'render') {
        var isFilterBind = bind.prop.indexOf('filter.') === 0;
        var filterName = isFilterBind ? bind.prop.slice('filter.'.length) : null;
        function _assertDeclared() {
            if (ctx.renderCapabilityIds && ctx.renderCapabilityIds.length > 0 &&
                    ctx.renderCapabilityIds.indexOf(bind.prop) === -1) {
                throw new Error('[controlBind] render-channel write to "' + bind.prop + '" is not a ' +
                    'member of ctx.renderCapabilityIds ([' + ctx.renderCapabilityIds.join(', ') +
                    ']) — undeclared render-capability write. (FAIL-LOUD — §7 r2 item 1, "the factory ' +
                    'boundary": a generated render control never names an undeclared capability; a ' +
                    'hand-written bind reaching this throw is either stale or mistyped.)');
            }
        }
        return {
            set: function (value) {
                if (!ctx.runner) {
                    throw new Error('[controlBind] render-channel bind on prop "' + bind.prop +
                        '" requires ctx.runner (an FrqtlApp). (FAIL-LOUD.)');
                }
                _assertDeclared();
                if (isFilterBind) {
                    if (typeof ctx.runner.setFilterActive !== 'function') {
                        throw new Error('[controlBind] filter-channel bind on "' + bind.prop +
                            '" requires ctx.runner.setFilterActive (an FrqtlApp build predating ' +
                            'the §7 r2 filter accessor pair). (FAIL-LOUD.)');
                    }
                    ctx.runner.setFilterActive(filterName, !!value);
                    return;
                }
                if (typeof ctx.runner.setRenderOption !== 'function') {
                    throw new Error('[controlBind] render-channel bind on prop "' + bind.prop +
                        '" requires ctx.runner (an FrqtlApp with setRenderOption). (FAIL-LOUD.)');
                }
                ctx.runner.setRenderOption(bind.prop, value);
            },
            get: function () {
                if (!ctx.runner) { return undefined; } // defined skip — no runner, no read authority
                if (isFilterBind) {
                    return (typeof ctx.runner.isFilterActive === 'function')
                        ? (ctx.runner.isFilterActive(filterName) ? 1 : 0)
                        : undefined; // defined skip — older runner build, no filter-state accessor
                }
                if (typeof ctx.runner.getRenderOption === 'function') {
                    // Propagates getRenderOption's own FAIL-LOUD (undeclared key) — same
                    // discipline as the Frame/LargeObject branches below (they never
                    // swallow their accessor's throw either; the caller — e.g.
                    // frqtl-controls-panel.js's listControls — already wraps a bind's
                    // get() in a try/catch/console.warn for exactly this reason).
                    return ctx.runner.getRenderOption(bind.prop);
                }
                return undefined; // defined skip — older runner build, no getRenderOption
            }
        };
    }

    // ── UNIVERSE — a bare property on the live universe singleton (S1 fix, ─────
    //    design §2.3.2 / gap-census #10: Wave Interference's primary physics
    //    knob, wavelengthScale, is a UNIVERSE-level global, not a Frame/
    //    LargeObject prop — the 3-way {render, Frame, LargeObject/backdrop}
    //    dispatch below had no branch for it at all.
    //
    //    `bind.object === 'universe'` is a RESERVED SENTINEL, checked BEFORE any
    //    registry lookup: the universe is a singleton (exactly one per experiment
    //    page), reached directly through ctx.runner — it is never named/registered
    //    via registry.registerObject (there is nothing to look up a "universe"
    //    object BY NAME for). Any OTHER string is resolved via the registry, same
    //    as every other kind.
    if (bind.object === 'universe') {
        return {
            set: function (value) {
                if (!ctx.runner || typeof ctx.runner.setUniverseProperty !== 'function') {
                    throw new Error('[controlBind] universe bind on "' + bind.prop +
                        '" requires ctx.runner (an FrqtlApp with setUniverseProperty). ' +
                        '(FAIL-LOUD.)');
                }
                // Validated accessor — throws on an unknown/readonly Universe field
                // (ObjectSchema.get('Universe')) rather than a bare, unvalidated
                // ctx.universe[bind.prop] = value (the bind-local-property-list
                // anti-pattern this fix exists to close off).
                ctx.runner.setUniverseProperty(bind.prop, value);
            },
            // Universe reads are LIVE — same discipline as the Frame branch (no
            // tick/snapshot dependency, unlike the LargeObject/backdrop branch).
            get: function () {
                if (!ctx.runner || typeof ctx.runner.getUniverseProperty !== 'function') {
                    throw new Error('[controlBind] universe bind on "' + bind.prop +
                        '" requires ctx.runner (an FrqtlApp with getUniverseProperty). ' +
                        '(FAIL-LOUD.)');
                }
                return ctx.runner.getUniverseProperty(bind.prop);
            }
        };
    }

    // ── PHYSICS CHANNEL — resolve bind.object via the registry ──────────────
    if (!ctx.registry || typeof ctx.registry.getObject !== 'function' ||
        typeof ctx.registry.getObjectKind !== 'function') {
        throw new Error('[controlBind] physics-channel bind on "' + bind.object + '.' + bind.prop +
            '" requires ctx.registry (a makeControlRegistry() instance with getObject/getObjectKind). ' +
            '(FAIL-LOUD.)');
    }
    var registered = ctx.registry.getObject(bind.object);   // FAIL-LOUD on unknown name (registry's own guard)
    var kind = ctx.registry.getObjectKind(bind.object);

    if (kind === 'Frame') {
        // Frame-kind registration precedent: the registered instance IS the
        // quantum_id (a number) — what setFrameProperty/getFrameProperty key on.
        var qid = registered;
        return {
            set: function (value) {
                if (!ctx.universe || typeof ctx.universe.setFrameProperty !== 'function') {
                    throw new Error('[controlBind] Frame bind on "' + bind.object + '.' + bind.prop +
                        '" requires ctx.universe (setFrameProperty). (FAIL-LOUD.)');
                }
                ctx.universe.setFrameProperty(qid, bind.prop, value);
            },
            // Frame reads are LIVE — getFrameProperty has no tick dependency
            // (unlike the LO snapshot path below).
            get: function () {
                if (!ctx.universe || typeof ctx.universe.getFrameProperty !== 'function') {
                    throw new Error('[controlBind] Frame bind on "' + bind.object + '.' + bind.prop +
                        '" requires ctx.universe (getFrameProperty). (FAIL-LOUD.)');
                }
                return ctx.universe.getFrameProperty(qid, bind.prop);
            }
        };
    }

    if (kind === 'LargeObject' || kind === 'backdrop') {
        // LargeObject-kind registration precedent: the registered instance is
        // the live wrapper (`.handle` is the engine-side handle
        // TickData.objects[] keys on). `wrapper` is what `set()` below needs
        // (FrqtlApp.updateObjectProperty takes the WRAPPER, not a bare
        // handle — it reads `lo._schemaKind`/`lo.rect`/etc. to decide the
        // engineVisible:false render-only mirror vs the engine-visible
        // universe-delegation path). `handle` (extracted for `get()`'s
        // TickData-snapshot lookup, which DOES key on the bare handle) still
        // accepts a bare-number registration for back-compat with a caller
        // that registered a handle directly instead of a wrapper.
        var wrapper = registered;
        var handle = (registered && typeof registered === 'object' && registered.handle !== undefined)
            ? registered.handle
            : registered;
        return {
            set: function (value) {
                // S1 fix (design §2.3.1 / gap-census #3, HIGH RISK): route through
                // ctx.runner.updateObjectProperty(wrapper, prop, value) — the SAME
                // Runner-level accessor Studio's Inspector already calls
                // (`AuthorView.jsx` commit()) — NEVER ctx.universe.updateObjectProperty
                // directly. The Universe-level WASM ABI schema-validates then
                // SILENTLY NO-OPS every engineVisible:false prop (color/alpha/
                // collision_type/actions/name) because those props are mirrored
                // onto the JS wrapper one layer above (FrqtlApp), which the
                // old universe-direct call bypassed entirely — a bind-only control
                // on those props "succeeded" (no throw) and did nothing.
                if (!ctx.runner || typeof ctx.runner.updateObjectProperty !== 'function') {
                    throw new Error('[controlBind] LargeObject bind on "' + bind.object + '.' + bind.prop +
                        '" requires ctx.runner (an FrqtlApp with updateObjectProperty). (FAIL-LOUD.)');
                }
                // The SAME canonical accessor op-programs' compiled `program` field is
                // itself installed through (actionCompiler.js) — schema-validated,
                // throw-or-apply, never a parallel prop list. FrqtlApp's own
                // schema lookup throws TypeError on an unknown/readonly prop for
                // wrapper's kind — that throw propagates from here unmodified.
                ctx.runner.updateObjectProperty(wrapper, bind.prop, value);
            },
            // No `getObjectProperty` accessor exists — the sole read authority is the
            // LAST TickData.objects[handle] snapshot, supplied by the caller
            // (ControlSync) via ctx.readSnapshot. Absent → a DEFINED SKIP (undefined),
            // never a fabricated read (same discipline as the render channel).
            get: function () {
                if (typeof ctx.readSnapshot !== 'function') { return undefined; }
                return ctx.readSnapshot(handle, kind, bind.prop);
            }
        };
    }

    throw new Error('[controlBind] bind.object "' + bind.object + '" resolved to kind "' + kind +
        '" — bind execution only supports {Frame, LargeObject, backdrop} (updateObjectProperty\'s ' +
        'own WASM-ABI dispatch has no real branch for any other kind — it would validate then ' +
        'silently no-op, which this file refuses to do). (FAIL-LOUD.)');
}

// ── Export ────────────────────────────────────────────────────────────────────

var ControlBind = { resolveBind: resolveBind };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlBind;
} else if (typeof window !== 'undefined') {
    window.ControlBind = ControlBind;
}

})();
