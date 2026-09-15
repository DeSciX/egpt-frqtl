/* Copyright 2023-2026 by Essam Abadir */

/**
 * fx-experiment.js — shared driver for the render-effect demo experiments.
 *
 * The render effects (R4/R5: glow, god-rays, smoke puffs, gun-paint) are
 * capability-checked render OPTIONS on the BYO three.js provider (driven via
 * runner.setRenderOption — see lib/frqtl/compat/renderer/providers/three-provider.js).
 * Each fx-* experiment page is identical boilerplate EXCEPT a small config; this
 * module is the single source of that boilerplate (DRY — no per-page copy of the
 * runner / camera-control / boot dance).
 *
 * A page declares `window._egptFx` BEFORE boot, then loads this file as a page-script:
 *   window._egptFx = {
 *     title:          'FX — Glow',
 *     setup:          window.setupParticleWalk3D,   // a setup factory (global)
 *     setupOpts:      {},                            // forwarded to the factory
 *     renderDefaults: { glowIntensity: 2.2, heat: 0.6 },  // applied via setRenderOption after setup;
 *                                                     // ALSO drives which effect sliders this page
 *                                                     // gets (see "RETIRED: controls" below — a page
 *                                                     // no longer separately declares a controls array).
 *     presets:        [ { name:'Comet', render:{...}, orbit:{azimuth,elevation,distance} }, ... ],
 *     cameraPreset:   'down-barrel'                  // OPTIONAL: the experiment's DEFAULT
 *                                                     // camera view (a runner.cameraControl.presets
 *                                                     // name) — applied BEFORE the orbit sliders are
 *                                                     // seeded, so they reflect the actual starting
 *                                                     // view. Unset = current behavior (byte-identical).
 *     loopTicks:      720                             // OPTIONAL: default tick-length for the
 *                                                     // always-present loop control (see below).
 *                                                     // Unset -> 720 (the CEO's default).
 *   };
 *
 * Surfaces it provides:
 *   - In-page control bar (sliders + preset buttons) — visible when viewing the page
 *     directly. Hidden by chrome=canvas (the GYM embeds the canvas only).
 *   - runner.fxPresets = config.presets — the CAPABILITY the GYM (CompareView)
 *     capability-CHECKS to render its own preset row (the page chrome is hidden there).
 *   - runner.fxControls = config.controls — same, for the GYM's effect sliders.
 *   - Per-dim tier MATRIX (FRQTL-MAINT 2026-07-03, CEO in-page per-dim walkthrough
 *     tool): capability-checked on `cfg.renderDefaults.renderTiers` (any renderTiers-
 *     bearing experiment gets it automatically, GENERIC — not page-specific).
 *     Columns = one per declared dim (+Toggle-All); rows = Show Dim (checkbox, the
 *     existing `row.hidden` mechanism) / Count (LIVE, `RenderTiers.groupByLayer`-
 *     derived, engine untouched) / Effect (dropdown mutating that dim's LIVE
 *     RenderTiers row `mode`/`paint`/`label` — a UI onto the ONE per-layer authority,
 *     never a parallel state; see `RenderTiers.buildTierMatrixSpec`). "None" =
 *     the sphere baseline (`paint:'sphere'`, low-poly InstancedMesh, the 2D disk
 *     coloring extended to 3D — see three-provider.js).
 *   - Loop control (ALWAYS present, no cfg opt-in needed — mirrors the always-present
 *     camera-control-if-capable idiom): a checkbox + tick-count input that, when on,
 *     re-runs `runner.setup(setupFn, cfg.setupOpts)` every N ticks — reuses the SAME
 *     reset semantic `EGPTUniverse.init()` already provides (a fresh WASM instance
 *     from the same seed), driven by the pre-existing per-tick `onTick` hook (never
 *     `universe.experimentTickFunctions`, which is NOT cleared by `init()` and would
 *     duplicate on every reset).
 *   - `runner.tierMatrix` / `runner.loopControl` (FRQTL-MAINT 2026-07-03, CEO standing
 *     principle — "the GYM is my ONLY visual-verification surface," so a tool that
 *     exists only on the standalone page is NOT done): the SAME live objects that
 *     drive the in-page DOM above, published on the runner exactly like fxPresets/
 *     fxControls/cameraControl — two renderers of ONE spec, zero parallel state.
 *     `runner.tierMatrix` = the `RenderTiers.buildTierMatrixSpec` result (`null` when
 *     `_buildTierMatrix` built nothing, i.e. non-tiered pages); its `columns[i].
 *     setHidden/effectValue/setEffect` closures mutate the SAME RenderTiers rows the
 *     in-page checkboxes/selects do. `columns[i].count(groups)` needs a per-tick
 *     `frameData` grouping the GYM (a separate window reading the iframe's runner)
 *     has no direct feed for, so `_buildTierMatrix`'s `updateCounts(tickData)` — the
 *     SAME function that fills the in-page Count cells every tick — ALSO stashes the
 *     just-computed counts array on `spec.liveCounts`; the GYM polls that array on
 *     its existing TPS/alive readout cadence (no new per-tick wiring across the
 *     iframe boundary). `runner.loopControl` = the `_buildLoopControl` state object,
 *     extended with `setEnabled(v)`/`setTicks(n)` methods that ALSO update the
 *     in-page checkbox/number-input (two-way sync — the GYM and the standalone page
 *     agree because both mutate/read the SAME object). Capability-checked: absent on
 *     non-tiered pages (`tierMatrix` stays `null`); `loopControl` is always present
 *     (mirrors the always-present in-page control).
 *   - `?soloTier=<label>` deep-link (FRQTL-MAINT 2026-07-03, architect completion —
 *     HOISTED out of the page chrome, its one remaining page-local trap):
 *     capability-checked on `cfg.renderDefaults.renderTiers` exactly like the matrix
 *     above, symmetric with `?seed=` — every renderTiers-bearing experiment gets the
 *     deep-link automatically. Hides every row whose `label` doesn't match, via the
 *     SAME `row.hidden` field. Absent -> byte-identical no-op.
 *
 * Effects are render-only and degrade gracefully: setRenderOption on a p5 runner is a
 * no-op; the three provider reads the option. No renderer-sniffing anywhere — the page
 * capability-checks runner.cameraControl / runner.setRenderOption.
 *
 * ── RETIRED: cfg.controls / runner.fxControls (WS Studio Controls Realignment ────
 *    §7 r2 item 3(b), CEO call C2) ─────────────────────────────────────────────
 *
 * Every fx-* page USED to hand-declare its own `controls: [{key,label,min,max,
 * step}, ...]` array — a bespoke vocabulary that duplicated `lib/shim/controls`'s
 * `scalar` kind shape one file over (the exact schema-mirror-drift class this
 * workstream exists to kill: the SAME shape, re-derived by hand, per page).
 * `_buildControls` (below) now MECHANICALLY derives the effect-slider set from
 * the active provider's `renderCapabilities()` (via
 * `MakeControlsForRenderSurface.makeControlsForRenderSurface`), filtered down
 * to the keys a page actually seeds via its OWN `cfg.renderDefaults` — so the
 * VISIBLE slider set is UNCHANGED per page (same keys, same min/max/step,
 * verified against every value every fx-glow/fx-godrays/fx-smoke page
 * hardcoded
 * before this migration; `CAPABILITY_LABELS` below preserves the SAME short
 * display text). `runner.fxControls` is still published (nothing external
 * reads it today — confirmed dead per `lib/features/ide/CompareView.jsx`'s own
 * "GYM un-hide" comment — but the capability name is kept for back-compat) —
 * its VALUE now comes from the SAME derived list, never a hand-authored one.
 */

(function () {
    'use strict';

    // MakeControlsForRenderSurface contract (WS Studio Controls Realignment §7 r2
    // item 3(b) — the RETIRED cfg.controls replacement). Same named FAIL-LOUD-guard
    // convention as _getPageParams below.
    function _getRenderSurfaceFactory() {
        if (typeof window !== 'undefined' && window.MakeControlsForRenderSurface) {
            return window.MakeControlsForRenderSurface;
        }
        throw new Error(
            '[fx-experiment] MakeControlsForRenderSurface not available. ' +
            'Ensure lib/frqtl/objects/objects/makeControlsForRenderSurface.js is loaded before ' +
            'fx-experiment.js (stack-boot.js\'s GAME array).'
        );
    }

    // Short display labels for a handful of render capabilities whose fx-*
    // page sliders historically showed a terser word than the
    // capability's own name (§7 r2 item 3(b) retirement note above — COSMETIC
    // TEXT ONLY, not a second shape/bounds vocabulary; the shape/bounds
    // themselves come exclusively from renderCapabilities() now). One entry,
    // 'smoke' -> 'smoke', is the ONE deliberate, documented cosmetic delta:
    // fx-smoke's single slider previously said "puff" for this same capability —
    // every other page already said "smoke" for it, so this migration
    // standardizes on that shared label rather than inventing a THIRD per-page
    // label table.
    var CAPABILITY_LABELS = {
        godrays: 'rays',
        smoke: 'smoke',
        glowIntensity: 'glow',
        heat: 'heat',
        godrayDensity: 'spread'
    };

    // PageParams contract (WS gym-controls-as-sugar Bite 3 item 0/2): the URL param
    // KEY NAMES this file reads (`seed`, `soloTier`) are single-sourced from
    // lib/shim/page-params/index.js, live-imported via window.PageParams (installed
    // early in stack-boot.js's ENGINE array — guaranteed present before this file,
    // a data-page-scripts entry loaded LAST in the boot sequence, ever executes).
    // Mirrors actionCompiler.js's/OvenBox.js's _getAstSchema() guard: a named
    // FAIL-LOUD error (not a raw TypeError) if the contract script is missing.
    function _getPageParams() {
        if (typeof window !== 'undefined' && window.PageParams) { return window.PageParams; }
        throw new Error(
            '[fx-experiment] PageParams not available. ' +
            'Ensure lib/shim/page-params/index.js is loaded before fx-experiment.js ' +
            '(stack-boot.js\'s ENGINE array).'
        );
    }

    // Deterministic seed passthrough (CEO tool-prep bite, 2026-07-02): ?seed=<n> on the
    // PAGE URL overrides the FrqtlApp seed passed to the canonical seeding
    // surface (`FrqtlApp({seed})` -> `EGPTUniverse` constructor's `seed` param,
    // `lib/frqtl/objects/FrqtlApp.js:78,120` / `lib/frqtl/compat/providers/
    // wasm-engine.js:218,230,383`) — the SAME `URLSearchParams(window.location.search)`
    // idiom `engine-boot.js` already uses for `?engine=` (reused, not invented). Absent
    // or non-numeric `?seed=` -> falls back to 42, the EXISTING hardcoded default below
    // — byte-identical for every fx-* page that doesn't pass the param. This lives here
    // (not inside a setup factory) because the universe is CONSTRUCTED by
    // `new FrqtlApp(...)` — with its seed already baked in — BEFORE any setup
    // factory (e.g. `setupFxSmoke`) ever runs; a setup factory receives an
    // ALREADY-SEEDED universe and has no seeding surface of its own to reuse.
    function _readSeedFromUrl() {
        var raw = new URLSearchParams(window.location.search).get(_getPageParams().KEYS.SEED);
        if (raw === null) { return 42; }
        var n = parseInt(raw, 10);
        return isNaN(n) ? 42 : n;
    }

    // ?soloTier=<label> deep-link (FRQTL-MAINT 2026-07-03, architect completion on the
    // in-page per-dim matrix bite — HOISTED here out of the page chrome, its one
    // remaining page-local trap, so the SAME 2D-parity meta-goal the matrix/sphere/loop
    // controls already satisfy also covers this knob: any renderTiers-bearing
    // experiment gets the deep-link automatically, symmetric with `?seed=` above).
    // Capability-checked EXACTLY like `_buildTierMatrix` (`cfg.renderDefaults.
    // renderTiers` must be a real array) — reuses `row.hidden` verbatim (the SAME
    // field `_buildTierMatrix`'s Show-Dim checkboxes and the matrix's Effect dropdowns
    // read/mutate — zero new render machinery, zero parallel state): hides every row
    // whose `label` does NOT match `?soloTier=`. Called EARLY in `window.setup()`
    // (before `_buildTierMatrix` builds the Show-Dim checkboxes' initial `checked`
    // state from `row.hidden`) so the matrix ALSO seeds correctly reflecting the
    // solo'd state — same requirement the page-local IIFE version satisfied by running
    // synchronously before `director`/the old flat toggle row. Absent (or
    // non-matching) `?soloTier=` -> every row's `hidden` stays unset -> byte-identical
    // to normal all-tiers behavior for every fx-* page, tiered or not. SEMANTICS ARE
    // BYTE-IDENTICAL to the removed page-local copy — only the reading LOCATION moved
    // (apps/ide/test/walkthrough-dims.mjs, the one existing consumer, needs no change:
    // it drives `?soloTier=` purely via the URL, never reaching into page-local DOM).
    function _applySoloTierFromUrl(cfg) {
        if (!cfg.renderDefaults || !Array.isArray(cfg.renderDefaults.renderTiers)) { return; }
        var soloTier = new URLSearchParams(window.location.search).get(_getPageParams().KEYS.SOLO_TIER);
        if (!soloTier) { return; }
        cfg.renderDefaults.renderTiers.forEach(function (row) {
            row.hidden = (row.label !== soloTier);
        });
    }

    // Applies a {render:{...}, orbit:{...}} preset to the runner.
    function _applyPreset(runner, preset) {
        if (!preset) { return; }
        if (preset.render && runner.setRenderOption) {
            for (var k in preset.render) {
                if (Object.prototype.hasOwnProperty.call(preset.render, k)) {
                    runner.setRenderOption(k, preset.render[k]);
                }
            }
        }
        if (preset.orbit && runner.cameraControl) {
            runner.cameraControl.setOrbit(preset.orbit);
        }
    }

    // Derives this page's effect-slider descriptor list from renderCapabilities()
    // (WS Studio Controls Realignment §7 r2 item 3(b) retirement — see the file
    // docstring's "RETIRED: cfg.controls" section). Filters the FULL provider
    // capability list down to the `scalar`-kind entries whose bind.prop is a key
    // this page ALREADY seeds via `cfg.renderDefaults` — so each page keeps
    // EXACTLY the slider set it always had (no page gains an unrequested godrays/
    // heat/smoke slider it never declared). Returns `[]` (never throws) when the
    // renderer declares no capabilities or the page has no renderDefaults.
    function _deriveEffectControls(runner, cfg) {
        var declaredKeys = cfg.renderDefaults ? Object.keys(cfg.renderDefaults) : [];
        if (!declaredKeys.length) { return []; }
        var renderSurface = _getRenderSurfaceFactory().makeControlsForRenderSurface({ runner: runner });
        return renderSurface.controls.filter(function (c) {
            return c.kind === 'scalar' && c.bind && declaredKeys.indexOf(c.bind.prop) !== -1;
        });
    }

    // Builds the in-page effect control bar (sliders + preset buttons) into the
    // existing .experiment-controls element. No-op pieces if the bits are absent.
    // Returns the derived effect-control list (published as runner.fxControls by
    // window.setup below — see the file docstring's retirement note).
    function _buildControls(runner, cfg) {
        var effectControls = _deriveEffectControls(runner, cfg);

        var bar = document.querySelector('.experiment-controls');
        if (!bar) { return effectControls; }

        // Effect sliders — one per derived control, seeded from renderDefaults.
        effectControls.forEach(function (d) {
            var key = d.bind.prop;
            var wrap = document.createElement('label');
            wrap.title = key;
            var startVal = (cfg.renderDefaults && typeof cfg.renderDefaults[key] === 'number')
                ? cfg.renderDefaults[key] : d.value;
            var labelText = CAPABILITY_LABELS[key] || key;
            wrap.appendChild(document.createTextNode(labelText + ' '));
            var input = document.createElement('input');
            input.type = 'range';
            input.min = d.min; input.max = d.max; input.step = d.step;
            input.value = startVal;
            var val = document.createElement('span');
            val.className = 'val'; val.textContent = startVal;
            input.addEventListener('input', function () {
                var v = Number(input.value);
                val.textContent = v;
                if (runner.setRenderOption) { runner.setRenderOption(key, v); }
            });
            wrap.appendChild(input); wrap.appendChild(val);
            bar.appendChild(wrap);
        });

        // Preset buttons (from cfg.presets) → apply + reflect into the sliders.
        if (cfg.presets && cfg.presets.length) {
            var presetWrap = document.createElement('span');
            presetWrap.appendChild(document.createTextNode('preset: '));
            cfg.presets.forEach(function (p) {
                var btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'cam-preset'; btn.textContent = p.name;
                btn.addEventListener('click', function () {
                    _applyPreset(runner, p);
                    // Reflect the preset's render values back into the effect sliders.
                    var inputs = bar.querySelectorAll('input[type="range"]');
                    effectControls.forEach(function (d, i) {
                        var key = d.bind.prop;
                        if (p.render && typeof p.render[key] === 'number' && inputs[i]) {
                            inputs[i].value = p.render[key];
                            var sib = inputs[i].nextSibling;
                            if (sib && sib.className === 'val') { sib.textContent = p.render[key]; }
                        }
                    });
                });
                presetWrap.appendChild(btn);
            });
            bar.appendChild(presetWrap);
        }

        return effectControls;
    }

    // ── Per-dim tier MATRIX (CEO in-page walkthrough tool, 2026-07-03) ────────────
    // GENERIC surface: driven entirely by `cfg.renderDefaults.renderTiers` (any
    // renderTiers-bearing experiment picks this up automatically — no page-
    // specific code; the META-GOAL is "any 2D experiment picks this up trivially when
    // it gains z") + `RenderTiers.buildTierMatrixSpec` (the pure data descriptor — see
    // RenderTiers.js; this function is ONLY the DOM/wiring layer on top of it, per the
    // architect's "RenderTiers stays the ONE per-layer authority" guardrail — every
    // mutation here calls straight into the spec's closures over the SAME row objects,
    // never a parallel state). Capability-checked: absent/empty renderTiers -> returns
    // null, zero DOM added, byte-identical for every non-tiered fx-* page
    // (fx-smoke, fx-godrays, fx-glow).
    //
    // Replaces the OLD flat `RenderTiers.buildVisibilityControls` toggle row (still a
    // valid, separate utility in RenderTiers.js for any other future consumer — NOT
    // deleted) with the CEO's drawn matrix: columns = one per declared dim (+Toggle-All),
    // rows = Show Dim / Count / Effect. Returns `{ spec, updateCounts }` — `spec` is the
    // SAME live `RenderTiers.buildTierMatrixSpec` object the caller publishes as
    // `runner.tierMatrix` (the GYM capability); `updateCounts(tickData)` is invoked once
    // per tick (Count is LIVE, engine-untouched — re-derived from `tickData.frameData`
    // via the EXISTING `RenderTiers.groupByLayer`) and ALSO stashes the computed counts
    // on `spec.liveCounts` so the GYM (a separate window with no per-tick feed into the
    // iframe) can poll them on its own readout cadence. Returns `null` if no matrix was
    // built (non-tiered page).
    function _buildTierMatrix(cfg) {
        if (!cfg.renderDefaults || !Array.isArray(cfg.renderDefaults.renderTiers) ||
            typeof RenderTiers === 'undefined' || typeof RenderTiers.buildTierMatrixSpec !== 'function') {
            return null;
        }
        var spec = RenderTiers.buildTierMatrixSpec(cfg.renderDefaults.renderTiers);
        if (!spec.columns.length) { return null; }

        var host = document.querySelector('.experiment-container') || document.body;

        var wrap = document.createElement('div');
        wrap.className = 'tier-matrix';
        wrap.style.cssText = 'flex:0 0 auto; padding:6px 12px; background:#0d0d0d; ' +
            'border-top:1px solid #2a2a2a; overflow-x:auto;';

        var table = document.createElement('table');
        table.style.cssText = 'border-collapse:collapse; font-size:11px; color:#ccc;';

        function th(text) {
            var el = document.createElement('th');
            el.textContent = text;
            el.style.cssText = 'padding:2px 8px; color:#7ec8e3; text-align:center; white-space:nowrap;';
            return el;
        }
        function labelTd(text) {
            var el = document.createElement('td');
            el.textContent = text;
            el.style.cssText = 'padding:2px 8px; color:#aaa; white-space:nowrap;';
            return el;
        }

        // Header: row-label corner + one column per dim + Toggle-All.
        var headRow = document.createElement('tr');
        headRow.appendChild(document.createElement('th'));
        spec.columns.forEach(function (c) { headRow.appendChild(th(c.label)); });
        headRow.appendChild(th('All'));
        table.appendChild(headRow);

        // Row 1 — Show Dim (checkboxes; the EXISTING row.hidden mechanism, presented as
        // what these always really were — binary checkboxes aligned to dim levels).
        var showRow = document.createElement('tr');
        showRow.appendChild(labelTd('Show Dim'));
        var checkboxes = spec.columns.map(function (c) {
            var td = document.createElement('td'); td.style.textAlign = 'center';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !c.isHidden();
            cb.addEventListener('change', function () { c.setHidden(!cb.checked); });
            td.appendChild(cb);
            showRow.appendChild(td);
            return cb;
        });
        var allTd = document.createElement('td'); allTd.style.textAlign = 'center'; allTd.style.whiteSpace = 'nowrap';
        var onBtn  = document.createElement('button'); onBtn.type  = 'button'; onBtn.className  = 'cam-preset'; onBtn.textContent  = 'ON';
        var offBtn = document.createElement('button'); offBtn.type = 'button'; offBtn.className = 'cam-preset'; offBtn.textContent = 'OFF';
        onBtn.addEventListener('click',  function () { spec.setAllHidden(false); checkboxes.forEach(function (cb) { cb.checked = true;  }); });
        offBtn.addEventListener('click', function () { spec.setAllHidden(true);  checkboxes.forEach(function (cb) { cb.checked = false; }); });
        allTd.appendChild(onBtn); allTd.appendChild(offBtn);
        showRow.appendChild(allTd);
        table.appendChild(showRow);

        // Row 2 — Count (LIVE per-dim frame count; filled in by updateCounts() each tick).
        var countRow = document.createElement('tr');
        countRow.appendChild(labelTd('Count'));
        var countCells = spec.columns.map(function () {
            var td = document.createElement('td'); td.style.textAlign = 'center'; td.textContent = '0';
            countRow.appendChild(td);
            return td;
        });
        countRow.appendChild(document.createElement('td'));   // All column — blank for Count
        table.appendChild(countRow);

        // Row 3 — Effect (per-dim dropdown; mutates mode/paint/label on the SAME
        // RenderTiers row — "the matrix is a UI onto the RenderTiers table," no parallel
        // state). "None" = the sphere baseline (paint:'sphere').
        var effectRow = document.createElement('tr');
        effectRow.appendChild(labelTd('Effect'));
        spec.columns.forEach(function (c) {
            var td = document.createElement('td');
            var select = document.createElement('select');
            select.style.cssText = 'background:#1a1a1a; color:#ddd; border:1px solid #2a2a2a; font-size:11px;';
            spec.effectOptions.forEach(function (opt) {
                var o = document.createElement('option');
                o.value = opt.value; o.textContent = opt.label;
                select.appendChild(o);
            });
            select.value = c.effectValue();
            select.addEventListener('change', function () { c.setEffect(select.value); });
            td.appendChild(select);
            effectRow.appendChild(td);
        });
        effectRow.appendChild(document.createElement('td'));   // All column — blank for Effect
        table.appendChild(effectRow);

        wrap.appendChild(table);
        host.appendChild(wrap);

        function updateCounts(tickData) {
            var groups = (tickData && tickData.frameData) ? RenderTiers.groupByLayer(tickData.frameData) : {};
            var counts = spec.columns.map(function (c) { return c.count(groups); });
            counts.forEach(function (v, i) { countCells[i].textContent = String(v); });
            // GYM capability read (lib/features/ide/CompareView.jsx) — a separate window
            // has no per-tick feed into this iframe, so it polls this array instead.
            spec.liveCounts = counts;
        }

        return { spec: spec, updateCounts: updateCounts };
    }

    // ── Loop control (CEO in-page walkthrough tool, 2026-07-03) ───────────────────
    // "Re-run the simulation every X ticks (default 720), continuous — fixed seed
    // implies identical replay flipbook." GENERIC (every fx-* page gets it, not just
    // one page — capability-free, no cfg opt-in needed, mirrors the always-present
    // camera-control-if-capable idiom). Reuses the SAME reset semantic the GYM's own
    // "Reset" button relies on at bottom: `runner.setup(setupFn, opts)` re-runs the
    // setup factory, which calls `universe.init(...)` again — `EGPTUniverse.init()`
    // constructs a FRESH WASM instance from the SAME `_params.seed` each time
    // (`wasm-engine.js:308-409`, esp. `this._wasm = new _WasmUniverse(config)` at
    // line ~393) — an in-place, page-level restart with NO reload/hash-change (the
    // GYM's own Reset button instead bumps a React key to remount the WHOLE iframe —
    // a heavier, page-external mechanism; this loop control reuses the UNDERLYING
    // reset semantic `runner.setup()` already provides, not that outer mechanism,
    // since a tick-driven in-page loop can't remount its own iframe from the inside).
    // Registered via the ALREADY-EXISTING per-tick `onTick` callback (a page-level,
    // FrqtlApp-construction-time hook — chosen over `universe.
    // experimentTickFunctions.push(...)` specifically because THAT array is never
    // cleared by `init()`, so pushing a loop tick-fn there would duplicate on every
    // reset; `onTick` is registered exactly ONCE, at FrqtlApp construction,
    // and survives re-`setup()` calls cleanly).
    function _buildLoopControl(cfg) {
        var bar = document.querySelector('.experiment-controls');
        var cb = null;         // set below IF the in-page control bar exists
        var numInput = null;
        var state = { enabled: false, ticks: (typeof cfg.loopTicks === 'number' && cfg.loopTicks > 0) ? cfg.loopTicks : 720 };
        // GYM capability methods (lib/features/ide/CompareView.jsx, chrome=canvas hides
        // this in-page control bar there): mutate the SAME `state` object the onTick
        // hook reads AND mirror into the in-page DOM when present — two-way sync, so
        // the GYM and the standalone page never disagree about the live loop state.
        state.setEnabled = function (v) {
            state.enabled = !!v;
            if (cb) { cb.checked = state.enabled; }
        };
        state.setTicks = function (n) {
            if (typeof n === 'number' && n > 0) {
                state.ticks = n;
                if (numInput) { numInput.value = n; }
            }
        };
        if (!bar) { return state; }

        var wrap = document.createElement('label');
        wrap.title = 'loop';
        wrap.appendChild(document.createTextNode('loop '));
        cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.addEventListener('change', function () { state.enabled = cb.checked; });
        wrap.appendChild(cb);
        numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = '1';
        numInput.style.cssText = 'width:60px; margin-left:4px;';
        numInput.value = state.ticks;
        numInput.addEventListener('change', function () {
            var n = parseInt(numInput.value, 10);
            if (!isNaN(n) && n > 0) { state.ticks = n; }
        });
        wrap.appendChild(numInput);
        bar.appendChild(wrap);

        return state;
    }

    // Wires the camera orbit sliders + presets + layer toggles IF the page declares them
    // (same id contract as particle-walk-3d) AND the active provider exposes cameraControl.
    function _wireCamera(runner) {
        var cam = runner.cameraControl;
        var host = document.getElementById('camera-controls');
        if (!cam || !host) { return; }
        host.style.display = 'inline-flex';
        var o = cam.getOrbit();
        function _set(id, v) { var el = document.getElementById(id); if (el) { el.textContent = v; } }
        var azEl = document.getElementById('cam-azimuth');
        var elEl = document.getElementById('cam-elevation');
        var diEl = document.getElementById('cam-distance');
        if (azEl) { azEl.value = Math.round(o.azimuth);   _set('cam-azimuth-val', azEl.value); }
        if (elEl) { elEl.value = Math.round(o.elevation); _set('cam-elevation-val', elEl.value); }
        if (diEl) { diEl.value = Math.round(o.distance);  _set('cam-distance-val', diEl.value); }
        function _wire(inputEl, labelId, key) {
            if (!inputEl) { return; }
            inputEl.addEventListener('input', function () {
                var v = parseInt(inputEl.value, 10);
                _set(labelId, v);
                var spec = {}; spec[key] = v; cam.setOrbit(spec);
            });
        }
        _wire(azEl, 'cam-azimuth-val', 'azimuth');
        _wire(elEl, 'cam-elevation-val', 'elevation');
        _wire(diEl, 'cam-distance-val', 'distance');
        function _sync() {
            var n = cam.getOrbit();
            if (azEl) { azEl.value = Math.round(n.azimuth);   _set('cam-azimuth-val', azEl.value); }
            if (elEl) { elEl.value = Math.round(n.elevation); _set('cam-elevation-val', elEl.value); }
            if (diEl) { diEl.value = Math.round(n.distance);  _set('cam-distance-val', diEl.value); }
        }
        (cam.presets || []).forEach(function (name) {
            var btn = document.getElementById('cam-preset-' + name);
            if (btn) { btn.addEventListener('click', function () { cam.setPreset(name); _sync(); }); }
        });
    }

    // ── window.setup — invoked by the boot dance once engine + renderer are live ──
    window.setup = function () {
        var cfg = window._egptFx || {};
        // ?soloTier= deep-link — applied FIRST, before anything (esp. _buildTierMatrix,
        // later) reads cfg.renderDefaults.renderTiers, so the matrix's Show-Dim
        // checkboxes seed correctly reflecting the solo'd state.
        _applySoloTierFromUrl(cfg);
        // Resolve the setup factory. Pages name it by STRING (`setup:'setupFxSmoke'`) because
        // the inline config runs before the factory's async page-script has loaded — a direct
        // global reference would be undefined at parse time. A function is also accepted.
        var setupFn = (typeof cfg.setup === 'function') ? cfg.setup
                    : (typeof cfg.setup === 'string') ? window[cfg.setup] : null;
        if (!setupFn) {
            throw new Error('[fx-experiment] window._egptFx.setup must name a loaded setup factory (got "'
                + cfg.setup + '") — FAIL LOUD.');
        }

        var metrics = (typeof ExperimentMetrics !== 'undefined') ? null : null;
        var tick = 0;

        // Tick-based cinematic scheduler. Beats are keyed to the SIMULATION tick (which only
        // advances while the runner is actually running) — NOT wall-clock setTimeout. This keeps
        // a director's timeline aligned with the sim: it can't run ahead during a paused load
        // (e.g. the GYM starts paused) or while the user switches camera views, so the emitter
        // never gets cut before the user hits Run. `schedule(atTick, fn)` is passed to the director.
        var _beats = [];
        function schedule(atTick, fn) { _beats.push({ at: atTick, fn: fn, fired: false }); }

        // Filled in AFTER runner.setup() below (both need cfg.renderDefaults.renderTiers /
        // the built DOM to exist first) — declared here so the onTick closure can see them.
        var updateTierCounts = null;   // set by _buildTierMatrix(cfg); null on non-tiered pages
        var loopState = null;          // set by _buildLoopControl(cfg) — {enabled, ticks}

        var runner = new FrqtlApp({
            canvasParentId: 'canvas-wrapper',
            canvasW: 600,
            canvasH: 600,
            seed: _readSeedFromUrl(),
            onTick: function (tickData) {
                tick++;
                // Fire any cinematic beats now due (tick-based, not wall-clock).
                for (var b = 0; b < _beats.length; b++) {
                    if (!_beats[b].fired && tick >= _beats[b].at) {
                        _beats[b].fired = true;
                        try { _beats[b].fn(); } catch (e) { console.error('[fx-experiment] beat threw:', e); }
                    }
                }
                if (metrics) {
                    var frames = (tickData && tickData.frameData) ? tickData.frameData : [];
                    metrics.update({ 'Active Quanta': frames.length, 'Tick': tick });
                }
                // Per-dim matrix Count row — LIVE, re-derived from this tick's frameData
                // (engine untouched; RenderTiers.groupByLayer already does the grouping).
                if (updateTierCounts) { updateTierCounts(tickData); }
                // Loop control: "re-run the simulation every X ticks, continuous" — fixed
                // seed means every loop iteration replays the IDENTICAL physics stream.
                // Checked LAST so this tick's beats/metrics/counts still reflect the run
                // that just completed before the reset takes effect on the NEXT tick.
                if (loopState && loopState.enabled && tick >= loopState.ticks) {
                    tick = 0;
                    _beats.forEach(function (bt) { bt.fired = false; });
                    runner.setup(setupFn, cfg.setupOpts || {});
                }
            }
        });

        runner.createCanvas();
        runner.setup(setupFn, cfg.setupOpts || {});

        // Metrics panel (optional — only if the page included experiment-metrics.js).
        if (typeof ExperimentMetrics !== 'undefined' && document.getElementById('metrics-panel')) {
            metrics = new ExperimentMetrics('metrics-panel', [
                { name: 'Active Quanta', expected: null, format: function (v) { return String(Math.round(v)); } },
                { name: 'Tick',          expected: null, format: function (v) { return String(v); } }
            ]);
        }

        // Apply the effect's render defaults (capability-checked; no-op on p5).
        if (cfg.renderDefaults && runner.setRenderOption) {
            for (var k in cfg.renderDefaults) {
                if (Object.prototype.hasOwnProperty.call(cfg.renderDefaults, k)) {
                    runner.setRenderOption(k, cfg.renderDefaults[k]);
                }
            }
        }

        // Expose presets so the GYM (CompareView) — which hides the page chrome —
        // can render its own preset row by capability-CHECKING the runner.
        runner.fxPresets  = cfg.presets  || [];

        // Optional per-experiment DEFAULT camera view (CEO 2026-07-02 review —
        // "down-barrel = the DEFAULT view"). Declared ONCE on window._egptFx.cameraPreset
        // (a preset name from runner.cameraControl.presets, e.g. 'down-barrel') — applied
        // BEFORE _wireCamera() seeds the orbit sliders, so the sliders reflect the ACTUAL
        // starting view rather than the renderer's generic fallback orbit. Capability-checked
        // (no-op in 2D / when unset) — every existing fx-* page that doesn't declare this
        // field is byte-identical (still opens on the renderer's generic default orbit).
        if (cfg.cameraPreset && runner.cameraControl && typeof runner.cameraControl.setPreset === 'function') {
            runner.cameraControl.setPreset(cfg.cameraPreset);
        }

        _wireCamera(runner);
        // fxControls is now published from the SAME derived list _buildControls
        // renders sliders from — never a hand-authored cfg.controls array (§7 r2
        // item 3(b) retirement; see the file docstring).
        runner.fxControls = _buildControls(runner, cfg);
        // Per-dim matrix (capability-checked — null/no-op on non-tiered pages) + the
        // generic loop control (every fx-* page gets it — CEO in-page walkthrough tool).
        var tierMatrixBuild = _buildTierMatrix(cfg);   // null or { spec, updateCounts }
        updateTierCounts = tierMatrixBuild ? tierMatrixBuild.updateCounts : null;
        loopState = _buildLoopControl(cfg);

        // Publish the SAME live spec/state objects as runner capabilities — the GYM
        // (CompareView, chrome=canvas hides the DOM built above) capability-checks
        // these exactly like fxPresets/fxControls/cameraControl (FRQTL-MAINT
        // 2026-07-03, CEO standing principle: "the GYM is my ONLY visual-verification
        // surface"). `tierMatrix` stays absent (undefined) on non-tiered pages — the
        // GYM's matrix strip stays hidden, byte-identical for fx-smoke,
        // fx-godrays, fx-glow. `loopControl` is always present.
        if (tierMatrixBuild) { runner.tierMatrix = tierMatrixBuild.spec; }
        runner.loopControl = loopState;

        // 3D experiments default to a VIEWING cadence (capped TPS → smooth FPS).
        if (runner.cameraControl) { runner.setRateLimits({ fpsLimit: 0, tpsLimit: 120 }); }

        runner.start();
        if (typeof frameRate === 'function') { frameRate(60); }
        window._frqtlApp = runner;   // realm hook (same as the canonical pages)

        // OPTIONAL director — a cinematic timeline. Called once AFTER start with the runner +
        // the setup factory's return handles (runner.setupResult: { emitter, … }).
        // It schedules the beats (setRenderOption changes, emitter stop, LO reveal) over time.
        // Opt-in for a cinematic experiment; absent on the plain fx-* demos.
        if (typeof cfg.director === 'function') {
            // director(runner, handles, schedule): schedule(atTick, fn) for one-shot tick-based beats
            // (robust to the GYM's paused-then-Run model), NOT setTimeout. Continuous per-tick control
            // (e.g. an emission ramp) belongs in the SETUP factory as an experimentTickFunctions
            // tick-fn — the same contract Blackbody's thermostat + the Bullet use.
            try { cfg.director(runner, runner.setupResult, schedule); }
            catch (e) { console.error('[fx-experiment] director threw:', e); }
        }
    };

    // ── Boot dance — wait for engine AND renderer, then branch on the resolved renderer ──
    // Mirrors particle-walk-3d: _egptWhenRendererReady fires before FrqtlApp is
    // defined, so for the (synchronous, vendored) three.js path we poll until the GAME
    // layer is present before calling setup().
    window._egptWhenEngineReady(function () {
        window._egptWhenRendererReady(function () {
            var r = window._egptRenderer || 'p5';
            if (r === 'p5') {
                var s = document.createElement('script');
                s.src = '../../assets/vendor/p5.min.js';
                document.body.appendChild(s);
            } else {
                (function whenRunnerReady() {
                    if (typeof window.FrqtlApp !== 'undefined') { window.setup(); }
                    else { setTimeout(whenRunnerReady, 20); }
                })();
            }
        });
    });

})();
