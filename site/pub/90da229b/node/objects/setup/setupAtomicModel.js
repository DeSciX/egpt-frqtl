/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupAtomicModel — Atomic Model experiment factory.
 *
 * Builds a three-level Frame hierarchy:
 *   - Quarks: level-0 leaf Frames (1×1 px each, CHARGE.POSITIVE)
 *   - Proton: subatomic Frame (8×8 px at default dimension 3) containing the quarks
 *   - Atom: atom Frame (64×64 px at default dimension 6) containing the proton,
 *     with the electron inserted directly as a child
 *   - Electron: single CHARGE.NEGATIVE leaf Frame placed at the atom perimeter
 *
 * There is no force equation. Confinement is emergent from each Frame's
 * `compress()` phase (Core Axiom §4). The atom Frame is stationary
 * (`is_stationary=true`), acting as the lab/observer rest frame.
 *
 * Uses the standard JS-reference interface (`Frame.makeLeafFrame`,
 * `dimension.addFrame`, `dimension.createFrameFromRect`). The shim's boundary
 * Dimension covers these APIs: the JS engine handles them natively; the WASM
 * engine logs and returns null for APIs not yet implemented in Rust.
 */

(function () {

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.
    var _assertSetupOptions;
    if (typeof module !== 'undefined' && module.exports) {
        _assertSetupOptions = require('./_setupOptions').assertSetupOptions;
    } else {
        _assertSetupOptions = function (n, o, k) { return window.assertSetupOptions(n, o, k); };
    }

    // ── Imports ─────────────────────────────────────────────────────────

    var Frame, Charge, Rectangle;

    if (typeof module !== 'undefined' && module.exports) {
        // WASM-only: Frame/Charge (the WASM boundary classes) and Rectangle come from
        // Node globals the caller installs from the WASM handle BEFORE requiring this
        // factory (conformance/reference-setups.js install(); wasm-load-node.js sets
        // Rectangle). There is no JS reference engine to require.
        Frame     = global.Frame;
        Charge    = global.Charge;
        Rectangle = global.Rectangle;
    } else {
        Frame = window.Frame;
        Charge = window.Charge;
        Rectangle = window.Rectangle;
    }

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create an atomic model experiment.
     *
     * Builds a three-level Frame hierarchy demonstrating the strong force as
     * emergent confinement: quarks (leaf Frames) inside a subatomic (proton) Frame
     * inside an atom Frame. There is no force equation — each Frame makes local
     * greedy choices (Core Axiom §4); confinement is driven by `compress()`
     * attracting children toward the parent center-of-mass.
     *
     * Engine-agnostic: works with the JS reference engine. The WASM engine logs
     * and degrades gracefully for `dimension.createFrameFromRect` / `addFrame`
     * calls not yet implemented in Rust.
     *
     * ## Physics you can drive
     *
     * **`options.quarksPerProton`** is the primary behavioral knob.
     * It sets the proton Frame's initial mass and therefore its oscillation
     * wavelength (Core Axioms §6):
     *
     * | Derived quantity | Formula |
     * |---|---|
     * | Proton mass (t=0) | `quarksPerProton × 1` (each quark has `capacity=1`, `wavelength=1`) |
     * | Proton wavelength (t=0) | `floor(64 / quarksPerProton × 1)` (`capacity = 8² = 64` at `subatomicDimension=3`, `wavelengthScale=1`) |
     * | Total free leaf Frames (steady state) | approximately `quarksPerProton + 1` (quarks + electron) |
     *
     * With `noEscape=true` (the current default), quarks are **confined** inside the
     * proton rect for the lifetime of the run. `Frame.insert` sets each quark's
     * boundary to the parent (proton) rect — a live reference that tracks the proton
     * as it oscillates — so `boundary_check()` wraps the quark back in rather than
     * letting it escape. The proton stays at full mass; the composite structure is
     * stable. The observable effect of `quarksPerProton` is the **proton oscillation
     * frequency** (via the wavelength formula): more quarks → higher mass → shorter
     * wavelength → faster oscillation.
     *
     * Observed sweep (engine = js, seed 42, noEscape=true):
     *
     * | `quarksPerProton` | proton wavelength (t=0) | Stable behavior |
     * |---|---|---|
     * | 4 | 16 | Proton oscillates slowly; quarks remain confined |
     * | 12 | 5 | Proton oscillates faster; tight confined structure |
     * | 24 | 2 | Dense confined nucleus; full proton mass persists |
     * | **48** (default) | **1** | Stable nucleus; maximum quark confinement |
     *
     * Figure + screenshots: `docs/internal/physics-lab/atomic-model-quarksPerProton.md`.
     *
     * **Other dimension parameters** are architectural, not behavioral:
     * - `quarkDimension` sets the pixel size of leaf Frames (`2^level`); default 0 → 1×1.
     * - `subatomicDimension` sets the proton Frame capacity (`(2^level)²`); default 3 → 64.
     * - `atomDimension` sets the atom Frame capacity; default 6 → 4096.
     * Changing these resizes the Frame hierarchy without affecting the
     * mass-→-wavelength relationship per se.
     *
     * **`includeElectron`** adds a single NEGATIVE leaf Frame at the upper-right
     * of the atom rect. The electron participates in the free-quark field;
     * it is not orbitally stable. It is visible in screenshots as the small dot
     * orbiting the atom Frame glyph.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM boundary object).
     *   Not yet `init`'d — this factory calls `universe.init` internally.
     *   The canvas bounds come from `universe.universe_rect` — the universe owns its rect.
     * @param {Object} [options] - Configuration overrides.
     * @param {number} [options.quarksPerProton=48] - Number of leaf Frames (quarks) inserted
     *   into the proton Frame at t=0. Sets proton mass = `quarksPerProton`. The primary
     *   behavioral knob — see "Physics you can drive" above.
     * @param {number} [options.quarkDimension=0] - Dimension level for leaf quark Frames.
     *   Level 0 → 1×1 pixel capacity. Does not change observable behavior unless you also
     *   change `subatomicDimension` to accommodate larger quarks.
     * @param {number} [options.subatomicDimension=3] - Dimension level for the proton Frame.
     *   Level 3 → `mb_w = 8` → `capacity = 64` pixels. Changing this rescales the proton
     *   without changing `quarksPerProton`.
     * @param {number} [options.atomDimension=6] - Dimension level for the atom Frame.
     *   Level 6 → `mb_w = 64` → `capacity = 4096` pixels.
     * @param {boolean} [options.includeElectron=true] - If true, places one NEGATIVE leaf Frame
     *   at `(atomRect.left + 0.75 × atomW, atomRect.top + 0.25 × atomW)` and inserts it
     *   directly into the atom Frame as a child.
     * @returns {{ atom: Frame, proton: Frame, electron: Frame|null, protonQuarks: Frame[],
     *   quarkDim: Dimension, subatomicDim: Dimension, atomDim: Dimension }}
     *
     * @example
     * // Two-cell notebook pattern (declarative-canvas model):
     * // module cell:
     * export function setupAtom(frqtl, universe, opts) {
     *     return setupAtomicModel(universe, {
     *         quarksPerProton: opts.quarksPerProton ?? 48,
     *         includeElectron: opts.includeElectron ?? true
     *     });
     * }
     * // canvas cell: setup="<module>#setupAtom" opts='{"quarksPerProton":48}' stage="600x600" seed="42"
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupAtomicModel.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'atomDimension', 'includeElectron', 'quarkDimension',
        'quarksPerProton', 'subatomicDimension',
    ];

    function setupAtomicModel(universe, options) {
        options = _assertSetupOptions('setupAtomicModel', options, OPTIONS);

        var canvas_rect = universe.universe_rect;
        if (!canvas_rect) {
            throw new Error('setupAtomicModel: universe.universe_rect is not set — the ' +
                'universe owns its rect. Construct it through the ONE construction ' +
                'authority, EGPTUniverse.create({ rect: <Rectangle>, seed: … }).');
        }

        var quarkDimLevel = options.quarkDimension !== undefined ? options.quarkDimension : 0;
        var subatomicDimLevel = options.subatomicDimension !== undefined ? options.subatomicDimension : 3;
        var atomDimLevel = options.atomDimension !== undefined ? options.atomDimension : 6;
        var quarksPerProton = options.quarksPerProton !== undefined ? options.quarksPerProton : 48;
        var includeElectron = options.includeElectron !== undefined ? options.includeElectron : true;

        // Init universe FIRST (resets dimensions), then add our hierarchy dimensions.
        // noEscape=true: quarks are hard-trapped inside the proton rect each tick
        // (Frame.insert sets boundary_rect = parent rect, live-tracking the moving proton).
        universe.init(canvas_rect, quarkDimLevel, { wavelengthScale: 1, noEscape: true, brownianMotion: false });

        var quarkDim = universe.addDimension(quarkDimLevel);
        var subatomicDim = universe.addDimension(subatomicDimLevel);
        var atomDim = universe.addDimension(atomDimLevel);

        var subatomicW = subatomicDim.mb_w; // 2^3 = 8
        var atomW = atomDim.mb_w;           // 2^6 = 64

        // Center the atom on the canvas
        var centerX = Math.round(canvas_rect.w / 2);
        var centerY = Math.round(canvas_rect.h / 2);
        var atomRect = new Rectangle(centerX, centerY, atomW, atomW, null, true);

        // Place the proton frame at the center of the atom
        var protonRect = new Rectangle(centerX, centerY, subatomicW, subatomicW, null, true);

        // Create quarks filling the proton frame in a grid pattern
        var quarkW = Math.max(1, Math.pow(2, quarkDimLevel)); // 1 for level 0
        var protonQuarks = [];
        var placed = 0;
        for (var x = protonRect.left; x < protonRect.left + protonRect.w && placed < quarksPerProton; x += quarkW) {
            for (var y = protonRect.top; y < protonRect.top + protonRect.h && placed < quarksPerProton; y += quarkW) {
                var quark = Frame.makeLeafFrame(x, y, quarkDimLevel, 1, 0, 0, false, Charge.POSITIVE, canvas_rect);
                quark.name = 'quark_' + placed;
                protonQuarks.push(quark);
                placed++;
            }
        }

        // Register quarks in the quark dimension (so they get their own move() calls)
        for (var i = 0; i < protonQuarks.length; i++) {
            quarkDim.addFrame(protonQuarks[i]);
        }

        // Create the proton frame containing the quarks
        var proton = subatomicDim.createFrameFromRect(protonRect, protonQuarks, 0, 0);
        proton.name = 'proton';

        // Optionally add an electron — a single quark outside the proton but inside the atom
        var subatomicFrames = [proton];
        var electron = null;
        if (includeElectron) {
            var electronX = atomRect.left + Math.round(atomW * 0.75);
            var electronY = atomRect.top + Math.round(atomW * 0.25);
            electron = Frame.makeLeafFrame(electronX, electronY, quarkDimLevel, 1, 0, 0, false, Charge.NEGATIVE, canvas_rect);
            electron.name = 'electron';
            quarkDim.addFrame(electron);
        }

        // Build the atom frame containing subatomic particles
        var atomChildFrames = subatomicFrames.slice();
        var atom = atomDim.createFrameFromRect(atomRect, atomChildFrames, 0, 0, true, true);
        atom.name = 'atom';

        // Add the electron directly to the atom's children (not via a subatomic frame)
        if (electron) {
            atom.insert(electron);
        }

        universe.leafQuantaWidth = quarkW;
        universe.brownianMotion = true;

        return {
            atom: atom,
            proton: proton,
            electron: electron,
            protonQuarks: protonQuarks,
            quarkDim: quarkDim,
            subatomicDim: subatomicDim,
            atomDim: atomDim
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupAtomicModel.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupAtomicModel: setupAtomicModel };
    } else {
        window.setupAtomicModel = setupAtomicModel;
    }

})();
