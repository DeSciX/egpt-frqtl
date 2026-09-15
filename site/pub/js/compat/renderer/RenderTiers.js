/* Copyright 2023-2026 by Essam Abadir */

/**
 * RenderTiers — the ONE per-layer-range render-tier table authority (FRQTL-MAINT
 * 2026-07-02, CEO ruling (i)).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * A PURE, dependency-injected decision function (mirrors `RenderShape.js`/
 * `RenderMesh.js`'s "one decode authority, no per-provider re-implementation" pattern)
 * that turns a per-experiment `renderTiers` table (a PROVIDER RENDER OPTION —
 * `setRenderOption` space, exactly like the pre-existing `flashLayerMax`/
 * `smokeLayerMin` — NOT a frame-data/`string_map` render-intent key; confirmed before
 * adding this that the vocab owner, `lib/shim/frame-data`, is not involved) into a
 * concrete per-frame appearance decision. `three-provider.js` is the ONLY consumer
 * today; extracted to its own file (not inlined in the render loop) so the table
 * logic is unit-testable in plain Node without a THREE.js/WebGL context.
 *
 * A `renderTiers` table is an array of rows:
 *   { layerMin?: number,      // inclusive lower bound, default 0
 *     layerMax?: number,      // exclusive upper bound, default Infinity
 *     mode: 'additive-white' | 'chroma' | 'greyscale',
 *     colorScheme?: string,   // only consulted for mode:'chroma' (default: the
 *                             // frame's own render.colorScheme / the experiment's
 *                             // opts.colorScheme)
 *     alphaFloor?: number,    // passed straight to LightColor.getAlphaFromIntensity's
 *                             // (v01, floor) — the "extend, don't bypass" alpha source
 *     minMass?: number,       // visibility gate: frame.mass < minMass -> TRUE
 *                             // invisible (alpha=0 outright, NOT a floor tweak)
 *     hidden?: boolean,       // FRQTL-MAINT (2026-07-02, L3): per-layer manual toggle —
 *                             // true -> TRUE invisible (alpha=0 outright), same
 *                             // mechanism family as minMass, just author-driven instead
 *                             // of mass-driven. The per-layer isolation knob (see
 *                             // buildVisibilityControls below) mutates this field live.
 *     paint?: 'crisp'|'soft'|'sphere', // FRQTL-MAINT (2026-07-02, geometry-aware effects
 *                             // — CEO "smoke design SETTLED"
 *                             // ruling). 'crisp' = paint like a photograph and let the eye
 *                             // average (the pre-existing point-sprite look); 'soft' =
 *                             // paint an averaged, box-extent-scaled, fullness-alpha'd blob
 *                             // to compensate for low sampling resolution (the pre-existing
 *                             // smoke-puff shader branch, three-provider.js QUANTA_VERT/FRAG
 *                             // `aSmoke`/`uSmoke` gate — REUSED verbatim, zero new shader
 *                             // math). 'sphere' (FRQTL-MAINT 2026-07-03, CEO in-page
 *                             // per-dim matrix drawing — the Effect="None" BASELINE):
 *                             // instanced low-poly 3D spheres sized by the frame's OWN box
 *                             // (`frame.rect.w`), colored via the SAME `rgb`/`mode:'chroma'`
 *                             // path the 2D disks already use ("the 2D coloring extended
 *                             // to 3D") — a THREE.InstancedMesh in the provider (mirrors the
 *                             // existing cube-shape InstancedMesh precedent), not a
 *                             // ShaderMaterial Points bucket; see three-provider.js's
 *                             // `_buildSphereInstancedMesh`. Defaults to 'soft' for
 *                             // `mode:'greyscale'` rows and 'crisp' for every other mode
 *                             // when omitted (never a computed default for 'sphere' — it
 *                             // is only ever reached via an explicit `row.paint='sphere'`,
 *                             // e.g. the Effect-dropdown's "None" option), so an
 *                             // un-authored `paint` field stays BYTE-IDENTICAL to
 *                             // pre-'sphere' behavior (the old `isSmoke:
 *                             // mode==='greyscale'` rule).
 *                             // No parent/leaf distinction anywhere: a frame is painted
 *                             // per its OWN dim's row using its OWN box size + fullness
 *                             // ("Dim 4 is smoke and Dim 5 is smoke — just different
 *                             // sizes"); FRQTL has NO fields — averaging exists ONLY at
 *                             // this paint boundary, a per-dim authoring choice, not a
 *                             // physics computation.
 *     label?: string }        // optional, human label for buildVisibilityControls'/
 *                             // buildTierMatrixSpec's generated descriptors (defaults to
 *                             // "L<layerMin>")
 *
 * Rows are matched by FIRST MATCH WINS (the first row whose [layerMin,layerMax) range
 * contains the frame's layer). A layer with no matching row is NOT an error — it is a
 * graceful default ('chroma', the experiment's own colorScheme) — an unauthored tier
 * is not a broken invariant.
 *
 * @param {Array<Object>} tiers - The renderTiers table (see above).
 * @param {number} layer - The frame's dimension/layer.
 * @returns {Object|null} The matching row, or null if none matches.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * RenderTiers adds ZERO physics — it is a pure render-intent DECODE (the "engine emits
 * primitives; renderer derives" rule): `layer`/`fullness`/`mass` are all already-emitted
 * FrameData fields; this module only decides HOW to paint them. §1's Dim->visual
 * mapping: Dim 0 = additive-white god-flash; low dims = chroma
 * (plasma/fire, air gated invisible below a mass floor); high dims = greyscale +
 * alpha-by-density (smoke/haze) — `resolveTierAppearance` below is the single function
 * that turns any `(tiers, frame)` pair into that mapping.
 */

(function () {
    'use strict';

    // ControlsSchema (lib/shim/controls) — lazy-guarded, same precedent as every
    // other objects/compat file that reaches across the shim boundary
    // (makeControlsForObject.js's own "Imports" note). Used ONLY by
    // buildVisibilityControls (below) to emit a genuinely NORMALIZED contract
    // descriptor instead of a hand-rolled look-alike bag (WS Studio Controls
    // Realignment §7 r2 item 3(a) — "RenderTiers' old experimentControls-shaped
    // generator... migrates to emitting contract descriptors").
    function _getControlsSchema() {
        if (typeof module !== 'undefined' && module.exports) {
            var path = require('path');
            return require(path.resolve(__dirname, '../../../shim/controls/index.js'));
        }
        if (typeof window !== 'undefined' && window.ControlsSchema) { return window.ControlsSchema; }
        throw new Error('RenderTiers.buildVisibilityControls: canonical contract lib/shim/controls ' +
            '(ControlsSchema) is unreachable (load order) — fail-loud, not a fallback.');
    }

    /**
     * Find the first row whose [layerMin,layerMax) range contains `layer`.
     * @param {Array<Object>} tiers
     * @param {number} layer
     * @returns {Object|null}
     */
    function resolveTierRow(tiers, layer) {
        if (!tiers) { return null; }
        for (var i = 0; i < tiers.length; i++) {
            var row = tiers[i];
            var lo = (typeof row.layerMin === 'number') ? row.layerMin : 0;
            var hi = (typeof row.layerMax === 'number') ? row.layerMax : Infinity;
            if (layer >= lo && layer < hi) { return row; }
        }
        return null;
    }

    /**
     * Resolve a frame's full render appearance from the tier table.
     *
     * @param {Array<Object>} tiers - The renderTiers table.
     * @param {Object} frame - `{ layer, fullness, mass, renderColor, frameScheme }`
     *   (already-extracted per-frame values — this function does no FrameData parsing;
     *   the caller does that ONCE per frame regardless of table-driven or legacy path).
     *   `renderColor`: a pre-resolved `[r,g,b]` per-frame override (from `string_map`
     *   `render.color`), or `null`/`undefined` if none.
     * @param {Object} LightColor - The canonical color/alpha authority (injected, not
     *   `require`d here, so this module stays a pure function of its inputs — easily
     *   unit-tested with a minimal fake LightColor if ever needed, though in practice
     *   the real one is always passed).
     * @returns {{
     *   target: 'flash'|'primary',
     *   rgb: Array<number>,     // [r,g,b] 0-255 ints
     *   alpha01: number,        // 0..1
     *   paint: 'crisp'|'soft'|'sphere', // FRQTL-MAINT 2026-07-02/07-03 — the per-dim
     *                           // paint choice (three-provider.js's per-dim-layer
     *                           // builder branches on this: 'crisp'/'soft' -> the
     *                           // ShaderMaterial Points bucket; 'sphere' -> an
     *                           // InstancedMesh of low-poly spheres)
     *   isSmoke: boolean        // DERIVED alias of `paint === 'soft'` (back-compat for
     *                           // any existing `.isSmoke` reader — not a second parallel
     *                           // authority; `paint` is the one source, this just mirrors it)
     * }}
     */
    function resolveTierAppearance(tiers, frame, LightColor) {
        var row = resolveTierRow(tiers, frame.layer);

        // Manual per-layer isolation toggle (FRQTL-MAINT 2026-07-02, L3 — see
        // buildVisibilityControls below): row.hidden forces TRUE invisible, exactly
        // like the minMass gate below, just author/UI-driven instead of mass-driven.
        // Checked FIRST so it overrides additive-white too (an experimenter isolating
        // ONE layer at a time must be able to hide the flash tier as well).
        if (row && row.hidden) {
            return { target: 'primary', rgb: [0, 0, 0], alpha01: 0, paint: 'crisp', isSmoke: false };
        }

        if (row && row.mode === 'additive-white') {
            // §1 Dim 0 "god-flash": additive-white, flash mesh ONLY — a table row
            // renders a frame through EXACTLY one path (unlike the legacy flash+smoke
            // COEXIST composite three-provider.js also supports for back-compat).
            // paint default 'crisp' (CEO ruling: "flash additive-white crisp(+glow)").
            var flashPaint = row.paint || 'crisp';
            return {
                target: 'flash',
                rgb: [255, 255, 255],
                alpha01: LightColor.getAlphaFromIntensity(frame.fullness, row.alphaFloor),
                paint: flashPaint,
                isSmoke: flashPaint === 'soft'
            };
        }

        var mode = row ? row.mode : 'chroma';
        var scheme = (mode === 'greyscale') ? 'greyscale'
            : (row && row.colorScheme) ? row.colorScheme : frame.frameScheme;

        // Visibility gate: frame.mass below row.minMass -> TRUE invisible (alpha=0
        // outright) — NOT a getAlphaFromIntensity floor tweak (see that function's own
        // docstring for why the two are different mechanisms: a floor still produces a
        // dim-but-visible particle for any fullness>0; a mass gate is a hard cutoff).
        var gatedInvisible = !!(row && typeof row.minMass === 'number'
            && typeof frame.mass === 'number' && frame.mass < row.minMass);

        var alpha01 = gatedInvisible ? 0 : LightColor.getAlphaFromIntensity(frame.fullness, row && row.alphaFloor);
        var rgb = frame.renderColor ? frame.renderColor : LightColor.getRgbBySchemeName(scheme, frame.fullness);

        // paint default: 'soft' for greyscale rows (the pre-existing smoke/haze puff
        // look), 'crisp' otherwise (chroma plasma/fire/air) — byte-identical to the old
        // `isSmoke: mode==='greyscale'` rule when a row omits `paint` entirely.
        var paint = row && row.paint ? row.paint : (mode === 'greyscale' ? 'soft' : 'crisp');

        return {
            target: 'primary',
            rgb: rgb,
            alpha01: alpha01,
            paint: paint,
            isSmoke: paint === 'soft'
        };
    }

    /**
     * groupByLayer — pure grouping utility: buckets frameData by its raw numeric
     * `.layer` (dim) field. FRQTL-MAINT (2026-07-02, geometry-aware effects, per-dim
     * render layers — the "smoke design SETTLED" ruling): the per-dim
     * THREE.Points object construction is provider-internal (three-provider.js), but
     * WHICH dims are populated and what frames belong to each is a pure data question,
     * unit-testable without WebGL — this is that pure piece.
     *
     * @param {Array<Object>} frameData - `tickData.frameData` (or any array of objects
     *   with a `.layer` field; frames without one are grouped under dim 0).
     * @returns {Object<number, Array<Object>>} `{ [layer]: frame[] }` — insertion order
     *   within each group preserved (stable, matches the frameData scan order).
     */
    function groupByLayer(frameData) {
        var groups = {};
        (frameData || []).forEach(function (f) {
            var layer = f.layer || 0;
            if (!groups[layer]) { groups[layer] = []; }
            groups[layer].push(f);
        });
        return groups;
    }

    /**
     * buildVisibilityControls — per-layer isolation toggles (FRQTL-MAINT 2026-07-02,
     * L3 — the L3 ruling: "each layer independently
     * drivable... the tester can isolate ONE layer at a time").
     *
     * Returns ONE `runner.experimentControls`-compatible descriptor
     * (`{id,label,min,max,step,value,fmt,onChange}` — the SAME shape
     * `collision-matrix-3d`/`SphereEmitter.controls` already use for
     * physics-object live knobs) per TABLE ROW. `onChange` mutates `row.hidden`
     * DIRECTLY on the row object already stored in `opts.renderTiers` (the SAME array
     * reference the render loop reads every tick) — no `setRenderOption` re-call
     * needed for the toggle to take effect on the next frame; this is the "thinnest
     * possible" wiring the CEO asked for (reuses the existing `.controls` idiom, adds
     * no new control system, no new render option).
     *
     * @param {Array<Object>} tiers - The renderTiers table (rows are mutated in place
     *   by the returned controls' onChange — pass the SAME array object you gave to
     *   `setRenderOption('renderTiers', tiers)` so the toggle is live).
     * @returns {Array<Object>} One NORMALIZED `kind:'scalar'` contract descriptor
     *   per row, in table order (WS Studio Controls Realignment §7 r2 item 3(a) —
     *   this now runs through `lib/shim/controls`'s `normalizeControlDescriptor`
     *   instead of hand-rolling a look-alike bag; every existing consumer field —
     *   `label`/`min`/`max`/`step`/`value`/`fmt`/`onChange` — is UNCHANGED, so this
     *   is a byte-behavior-preserving migration onto the shared vocabulary, not a
     *   shape change). `onChange` still mutates `row.hidden` DIRECTLY — that
     *   mutation IS the correct, sole write mechanism for a plain data row with no
     *   registered accessor of its own (not itself a schema-mirror violation; only
     *   the ENVELOPE around it was previously hand-rolled).
     */
    function buildVisibilityControls(tiers) {
        var normalizeControlDescriptor = _getControlsSchema().normalizeControlDescriptor;
        return (tiers || []).map(function (row, i) {
            var lo = (typeof row.layerMin === 'number') ? row.layerMin : 0;
            var label = row.label || ('L' + lo);
            return normalizeControlDescriptor({
                kind: 'scalar',
                id: 'tierVisible' + i,
                label: label,
                min: 0, max: 1, step: 1,
                value: row.hidden ? 0 : 1,
                fmt: function (v) { return v ? 'on' : 'off'; },
                onChange: function (v) { row.hidden = !v; }
            });
        });
    }

    /**
     * EFFECT_OPTIONS — the canonical per-dim "Effect" dropdown vocabulary (FRQTL-MAINT
     * 2026-07-03, CEO in-page per-dim matrix drawing). Each entry is a NAMED preset that
     * sets exactly `{mode, paint}` on a row — the ONLY two fields (plus `label`) the
     * Effect dropdown mutates (architect G4: RenderTiers stays the ONE per-layer
     * authority; the dropdown is a UI onto it, never a parallel state). `'none'` is the
     * BASELINE (Effect=None): 'chroma' mode (the SAME `LightColor.getRgbBySchemeName`
     * scheme path the flat 2D disks already use) + `paint:'sphere'` (a real 3D
     * primitive) — "the 2D coloring extended to 3D." The remaining options name the §1
     * ladder tiers; several share the SAME {mode,paint} pair (plasma/air/fire are all
     * chroma+crisp; smoke/haze/vapor are all greyscale+soft) — only the LABEL differs,
     * which is intentional: the dropdown's job is picking a RENDER TREATMENT + a display
     * name for `?soloTier=`/Count-row identification, not re-deriving every per-tier
     * nuance (minMass/alphaFloor/colorScheme are NOT touched by the dropdown; a row's
     * existing values there persist across an Effect change).
     */
    var EFFECT_OPTIONS = [
        { value: 'none',   label: 'None',   mode: 'chroma',         paint: 'sphere' },
        { value: 'flash',  label: 'flash',  mode: 'additive-white', paint: 'crisp'  },
        { value: 'plasma', label: 'plasma', mode: 'chroma',         paint: 'crisp'  },
        { value: 'air',    label: 'air',    mode: 'chroma',         paint: 'crisp'  },
        { value: 'fire',   label: 'fire',   mode: 'chroma',         paint: 'crisp'  },
        { value: 'smoke',  label: 'smoke',  mode: 'greyscale',      paint: 'soft'   },
        { value: 'haze',   label: 'haze',   mode: 'greyscale',      paint: 'soft'   },
        { value: 'vapor',  label: 'vapor',  mode: 'greyscale',      paint: 'soft'   }
    ];

    /**
     * Sum a `groupByLayer(frameData)` result over one row's `[layerMin,layerMax)` range
     * — the LIVE per-dim "Count" the matrix's Count row displays. Pure/no-DOM; the
     * caller (three-provider consumer, e.g. fx-experiment.js) re-derives this every tick
     * straight from `tickData.frameData` via `groupByLayer` — the engine emits
     * primitives, the renderer/UI derives (zero engine change, zero new FrameData field).
     *
     * @param {Object} groups - `groupByLayer(frameData)` result, `{ [layer]: frame[] }`.
     * @param {Object} row - A renderTiers row (reads `layerMin`/`layerMax` only).
     * @returns {number} Total alive-frame count across every dim the row's range covers.
     */
    function countForRow(groups, row) {
        var lo = (typeof row.layerMin === 'number') ? row.layerMin : 0;
        var hi = (typeof row.layerMax === 'number') ? row.layerMax : Infinity;
        var total = 0;
        for (var layer in groups) {
            if (!groups.hasOwnProperty(layer)) { continue; }
            var l = Number(layer);
            if (l >= lo && l < hi) { total += groups[layer].length; }
        }
        return total;
    }

    /**
     * buildTierMatrixSpec — the per-dim MATRIX'S pure data descriptor (FRQTL-MAINT
     * 2026-07-03, CEO in-page per-dim matrix drawing: "columns = Dim 0..N (+ Toggle-All);
     * row1 Show Dim; row2 Count; row3 Effect"). Mirrors `buildVisibilityControls`'s
     * "the row.hidden mutation lives here, DOM lives in the page/shared driver" split —
     * this function returns ONE descriptor per table row (one column of the drawn
     * matrix) with mutator closures over the SAME row objects `opts.renderTiers` holds
     * (no parallel state; the matrix IS a UI onto this table). The actual `<table>`/
     * `<select>`/checkbox DOM construction is provider-agnostic and GENERIC (driven
     * purely by this descriptor + a live `groupByLayer` count), so it belongs in the
     * canonical shared driver (`fx-experiment.js`), not any one experiment page.
     *
     * @param {Array<Object>} tiers - The renderTiers table (rows mutated in place).
     * @returns {{
     *   effectOptions: Array<{value,label,mode,paint}>,  // EFFECT_OPTIONS, for dropdown options
     *   columns: Array<{
     *     label: string,               // column header / display label
     *     isHidden: function():boolean,
     *     setHidden: function(boolean):void,
     *     effectValue: function():string,   // current EFFECT_OPTIONS.value match, or 'custom'
     *     setEffect: function(string):void, // applies an EFFECT_OPTIONS entry's {mode,paint,label}
     *     count: function(groups):number    // groups = groupByLayer(frameData) this tick
     *   }>,
     *   setAllHidden: function(boolean):void   // Toggle-All column (CEO drawing item 3)
     * }}
     */
    function buildTierMatrixSpec(tiers) {
        var rows = tiers || [];
        var columns = rows.map(function (row) {
            var lo = (typeof row.layerMin === 'number') ? row.layerMin : 0;
            return {
                label: row.label || ('L' + lo),
                isHidden: function () { return !!row.hidden; },
                setHidden: function (v) { row.hidden = !!v; },
                effectValue: function () {
                    // Several options share the SAME {mode,paint} (plasma/air/fire;
                    // smoke/haze/vapor) — disambiguate with a two-pass match: first
                    // {mode,paint,label} exact (so a round-trip through setEffect()
                    // reports back the value just set, not an earlier same-{mode,paint}
                    // sibling), then {mode,paint} alone as the fallback (an
                    // author-hand-written row that never went through setEffect() still
                    // resolves to a sensible option, not 'custom', when there is one).
                    var effPaint = row.paint || (row.mode === 'greyscale' ? 'soft' : 'crisp');
                    var i, opt;
                    for (i = 0; i < EFFECT_OPTIONS.length; i++) {
                        opt = EFFECT_OPTIONS[i];
                        if (row.mode === opt.mode && effPaint === opt.paint && row.label === opt.label) {
                            return opt.value;
                        }
                    }
                    for (i = 0; i < EFFECT_OPTIONS.length; i++) {
                        opt = EFFECT_OPTIONS[i];
                        if (row.mode === opt.mode && effPaint === opt.paint) {
                            return opt.value;
                        }
                    }
                    return 'custom';
                },
                setEffect: function (value) {
                    for (var j = 0; j < EFFECT_OPTIONS.length; j++) {
                        if (EFFECT_OPTIONS[j].value === value) {
                            row.mode  = EFFECT_OPTIONS[j].mode;
                            row.paint = EFFECT_OPTIONS[j].paint;
                            row.label = EFFECT_OPTIONS[j].label;
                            return;
                        }
                    }
                },
                count: function (groups) { return countForRow(groups, row); }
            };
        });
        return {
            effectOptions: EFFECT_OPTIONS,
            columns: columns,
            setAllHidden: function (v) {
                columns.forEach(function (c) { c.setHidden(v); });
            }
        };
    }

    var RenderTiers = {
        resolveTierRow: resolveTierRow,
        resolveTierAppearance: resolveTierAppearance,
        buildVisibilityControls: buildVisibilityControls,
        groupByLayer: groupByLayer,
        countForRow: countForRow,
        buildTierMatrixSpec: buildTierMatrixSpec,
        EFFECT_OPTIONS: EFFECT_OPTIONS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RenderTiers: RenderTiers };
    } else {
        window.RenderTiers = RenderTiers;
    }

})();
