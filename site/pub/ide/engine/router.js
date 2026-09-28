/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module engineRouter
 * @description
 * The single source of truth for engine path routing.
 *
 * Four named profiles:
 *  - `DEV_CORE_PROFILE` — in-core dev mount (`lib/server` plugin serves `/frqtl`, `/fat`).
 *  - `DIST_PROFILE` — flat dist layout, same-origin RELATIVE paths (`sdk/frqtl-sdk/dist`,
 *    served by `/pub_sdk` in dev/prod, or the `.vsix` localhost host).
 *  - `CDN_PROFILE` — the SAME dist layout, resolved to ABSOLUTE jsdelivr URLs
 *    (`https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@<ver>/dist/...`) for static hosting
 *    with no server process at all (ws-artifact-showcase, CEO 2026-07-10). CDN_PROFILE is
 *    a DISTINCT profile object, not a DIST_PROFILE parameterization (locked ruling —
 *    docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md §5.2): DIST_PROFILE's
 *    relative bases are meaningless outside the exact dist/ide/shell/ or
 *    dist/experiments/{id}/ page context they were computed for, whereas CDN_PROFILE's
 *    absolute bases resolve correctly from ANY host page (a claude.ai Artifact iframe has
 *    no such anchor point in the dist tree at all).
 *  - `STATIC_PROFILE` — the SAME dist layout, anchored at the site's `./pub` directory
 *    RELATIVE TO THE DOCUMENT, with the math + notebook lanes co-served in the same tree
 *    (self-contained no-backend site served under ANY path prefix — the DeSciX platform
 *    serves it at /<env>/<app_id>/site/). Like CDN_PROFILE it is a DISTINCT profile (its
 *    math/notebook bases point SAME-ORIGIN, not at the cross-origin jsdelivr egpt-math-sdk
 *    that CDN_PROFILE uses).
 *
 * Profile parity is asserted at module load time: all four profiles MUST cover the same
 * non-private path keys or an error is thrown (prevents dev/dist/cdn/static divergence).
 *
 * @example
 * import { engineRouter } from 'lib/shim';
 * const router = engineRouter({ mode: 'dev-core', engine: 'wasm' });
 * // router.engineScripts() → [{src, attrs?}] ordered list
 * // router.gameScripts()   → [{src}] ordered list
 * // router.bootSrc()       → string (engine-boot.js URL)
 * // router.p5Src()         → string (p5.min.js URL)
 * // router.resolve(relPath)→ string (absolute URL for a frqtl-relative path)
 */

'use strict';

import { GAME_LAYER_SCRIPTS } from './game-layer-manifest.js';

// ── Path profiles ────────────────────────────────────────────────────────────
//
// Each profile maps a frqtl-relative prefix → URL prefix.
// The FIRST matching prefix wins (insertion order).
//
// DEV_CORE_PROFILE uses the lib/server plugin's in-process mounts:
//   /frqtl → lib/frqtl      /fat → lib/fat
//
// DIST_PROFILE uses the flat dist layout inside sdk/frqtl-sdk/dist/
// (mirrors what build.js:254-271 used to hand-synthesize into the html).

var DEV_CORE_PROFILE = {
    'assets/vendor/':         '/frqtl/assets/vendor/',
    'assets/render/':         '/frqtl/assets/render/',
    // External-geometry fixtures (lib/frqtl/assets/models/, e.g. flamingo-draco.glb) —
    // a DISTINCT prefix from assets/vendor/ (a vendored LIBRARY dir) because it is asset
    // DATA a page's own render.mesh call resolves, never library code. Added B4b so the
    // mesh-demo / single-source-interference pages resolve it through the router instead
    // of a hardcoded '/frqtl/assets/models/...' literal (the ONE path authority — see
    // module docstring).
    'assets/models/':         '/frqtl/assets/models/',
    // 'compat/providers/' MUST be listed BEFORE the general 'compat/' key below —
    // resolve() takes the FIRST matching prefix in insertion order, and a more
    // specific prefix must win over a broader one (ws-artifact-showcase Bite A2
    // architect gate 2026-07-10: see CDN_PROFILE's matching key for the full
    // rationale — dev-core's own value here is actually REDUNDANT with falling
    // through to 'compat/' below, since dev serves lib/frqtl/ as a 1:1 tree with
    // no flattening, but it is listed explicitly for 3-way profile-key parity
    // and so this prefix can never silently diverge from 'compat/' by accident).
    'compat/providers/':      '/frqtl/compat/providers/',
    'compat/':                '/frqtl/compat/',
    'objects/':               '/frqtl/objects/',
    'experiments/_shared/':   '/frqtl/experiments/_shared/',
    // General experiments/ key — MUST be listed AFTER 'experiments/_shared/'
    // (first-match-wins: the more specific _shared prefix must win). Without it,
    // resolve('experiments/{id}/index.html') fell through to the '/frqtl/'+relPath
    // default (correct in dev-core by accident, WRONG in dist/cdn/static). Added so
    // every profile can resolve a general experiment-page path, not just _shared/.
    'experiments/':           '/frqtl/experiments/',
    // WASM pkg served from /fat/pkg-web (lib/fat full-dir mount)
    '__wasmPkgUrl':           '/fat/pkg-web/egpt_wasm.js',
    // M1: Math SDK served from SOURCE via vite's transform pipeline (dependency
    // map rule 2: dev consumes source — a /pub_sdk dist route here is the
    // "dev-core route pointing at a dist artifact" anti-pattern).
    // /egpt-src/index.js is a virtual module resolved by fraqtlServe's
    // resolveId/load hooks to sdk/egpt-math-sdk/src/browser/sdk-entry.js;
    // '#egpt-math-canonical' resolves via the config() alias to lib/egpt source.
    // MathView._deriveSdkBase: '/egpt-src/index.js' ends with '/index.js' ✓ —
    // catalog loads from /egpt-src/editor/ (scoped static mounts in mounts.js).
    '__mathSdkUrl':           '/egpt-src/index.js',
    // M4 fix: WASM math bridge served from SOURCE via the scoped /egpt-src/wasm
    // static mount (mounts.js ← egpt-paths.js mathWasmSrcDir, the single path
    // authority). Artifacts are the wasm-pack output of `npm run build:wasm-bridge`
    // (sdk/egpt-math-sdk): glue module + binary. Empty strings here were the M4
    // verification failure — no browser surface could ever register wasm-math.
    // If the bridge isn't built the mount 404s and wasm-math SELECTION fails
    // loud (Runtime._applyBackendSelection names the build command).
    '__mathWasmUrl':          '/egpt-src/wasm/egpt_math_sdk_wasm_bg.wasm',
    '__mathWasmModuleUrl':    '/egpt-src/wasm/egpt_math_sdk_wasm.js',
    // M4: Math backend selection authority — the single source of truth for which
    // MathBackendProvider id is selected at startup. Runtime.ensureMath().then
    // calls MathBackendRegistry.select(mathBackend) if non-empty.
    // 'js-reference' = default (JS canonical). 'wasm-math' = WASM provider.
    // Normalisation: 'wasm' → 'wasm-math' (same alias as ?mathBackend=wasm URL param).
    '__mathBackend':          'js-reference',
    // Curated native notebooks (lib/notebooks/) — dev is the lib/server static
    // mount at /notebooks (mounts.js). The notebook surfaces NEVER derive this
    // base themselves; they receive router.notebookBase threaded in as a prop
    // (same discipline as __mathSdkUrl / monacoBaseUrl). This is the single path
    // authority for the notebook URL space — it closes the N3 carry that had
    // presets.js hardcoding a '/notebooks/' literal (dev-only, 404s in dist).
    '__notebookBase':         '/notebooks',
    // Placed vendor libs (lib/frqtl/assets/vendor/, gitignored artifacts) — the
    // STABLE root-level /vendor alias mounts.js exposes (WS-NOTEBOOK-VENDOR §2a.1).
    // A realm cell's bare-specifier import (`import * as d3 from 'd3'`) resolves via
    // a manifest-generated import-map whose base is THIS value (vendor-importmap.js).
    // Single path authority for the vendor URL space — surfaces NEVER derive '/vendor'
    // themselves; they read router.vendorBase (same discipline as __notebookBase).
    '__vendorBase':           '/vendor',
    // lib/shim contract scripts (ast-schema.js, frame-data/index.js, ...) — mounted
    // at the SAME /lib/shim root every dev-core surface already uses. Added
    // ws-artifact-showcase Bite A2 so the artifact-showcase ESM boot (and any future
    // consumer) can resolve these through the router instead of a hand-derived
    // literal (stack-boot.js still hardcodes '/lib/shim/...' directly — pre-existing,
    // out of scope here; this key exists so NEW consumers never repeat that pattern).
    'shim/':                  '/lib/shim/'
};

var DIST_PROFILE = {
    'assets/vendor/':         '../../js/lib/',
    'assets/render/':         '../../js/consumers/',
    // External-geometry fixtures — own dist subdir (js/models/), a peer of js/lib
    // (vendor libraries) and js/consumers (renderers): build.js ships
    // lib/frqtl/assets/models/ there verbatim (§4-way parity companion below).
    'assets/models/':         '../../js/models/',
    // 'compat/providers/' MUST precede the general 'compat/' key (first-match-wins
    // prefix order) — ws-artifact-showcase Bite A2 architect gate 2026-07-10.
    // build.js FLATTENS lib/frqtl/compat/providers/{wasm-engine,wasm-load-browser}.js
    // straight into dist/js/compat/ (the 'providers/' segment is dropped, landing
    // them alongside egpt-engine.js) — so this key's target is
    // the IDENTICAL '../../js/compat/' base as 'compat/' itself, not a nested
    // '../../js/compat/providers/' that would match a naive single-prefix resolve.
    // LATENT (not previously exercised): before this fix, DIST_PROFILE had the
    // exact same missing-key bug CDN_PROFILE had (confirmed: resolve('compat/
    // providers/wasm-engine.js') would have produced the WRONG nested path) —
    // but no live consumer ever called DIST_PROFILE.resolve() with a
    // 'compat/providers/...' argument to surface it: the packaged experiment
    // pages' provider paths are rewritten by build.js's OWN regex substitution in
    // rewriteExperimentHtml() (`.replace(/\.\.\/\.\.\/compat\/providers\//g, ...)`,
    // entirely bypassing this router for that specific rewrite), and the dist IDE
    // shell's GraphicsPane.boot() delegates to stack-boot.js (independently
    // dist-incompatible — see .claude/agent-memory/frqtl-impl-server/CANONICAL.md
    // §CRITICAL) rather than calling router.resolve() for engine scripts at all.
    // Fixed here regardless, for correctness and 3-way parity — a future DIST
    // consumer that DOES call resolve('compat/providers/...') must get the right
    // answer, not inherit a bug nothing happened to have exercised yet.
    'compat/providers/':      '../../js/compat/',
    'compat/':                '../../js/compat/',
    'objects/':               '../../js/game/',
    'experiments/_shared/':   '../../experiments/_shared/',
    // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins).
    // From dist/experiments/{id}/index.html, '../../experiments/' == dist/experiments/.
    // Four-way parity companion to DEV_CORE/CDN/STATIC 'experiments/' below.
    'experiments/':           '../../experiments/',
    // WASM pkg URL is overridable via window._egptWasmPkgUrl (rule 5)
    '__wasmPkgUrl':           '__use_window_override',
    // Math SDK path relative to dist/ide/shell/ (where the shell index.html lives).
    // sdk/frqtl-sdk/dist/ide/shell/ → ../../../egpt-math-sdk/index.js
    '__mathSdkUrl':           '../../../egpt-math-sdk/index.js',
    // M4 fix: dist-relative shape matching sdk/egpt-math-sdk/dist/wasm/ (built by
    // scripts/build.mjs), same base as __mathSdkUrl (relative to dist/ide/shell/).
    // wasm-loader normalizes relative URLs against document.baseURI in the browser
    // so the dynamic import resolves page-relative, not bundle-relative.
    '__mathWasmUrl':          '../../../egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm',
    '__mathWasmModuleUrl':    '../../../egpt-math-sdk/wasm/egpt_math_sdk_wasm.js',
    // M4: Math backend default for dist. Same semantics as DEV_CORE_PROFILE.__mathBackend.
    '__mathBackend':          'js-reference',
    // Curated native notebooks relative to dist/ide/shell/ — same base shape as
    // __mathSdkUrl (sdk/frqtl-sdk/dist/ide/shell/ → ../../../egpt-math-sdk/notebooks/).
    // The sdk build copies lib/notebooks/ → dist/notebooks/ (build.mjs copyDirFromAbs).
    '__notebookBase':         '../../../egpt-math-sdk/notebooks',
    // Placed vendor libs in dist — same dist-relative shape as __notebookBase
    // (sdk/frqtl-sdk/dist/ide/shell/ → ../../../egpt-math-sdk/vendor). The sdk build
    // copies the manifest-listed vendor entries into the dist (2a-tail follow-up,
    // §8.1); for 2a the LIVE consumers are dev (apps/ide) + the .vsix localhost host.
    '__vendorBase':           '../../../egpt-math-sdk/vendor',
    // lib/shim contract scripts, relative to dist/experiments/{id}/ (2 levels up to
    // dist/, then into ide/ — copyCommon() copies lib/shim/ → dist/ide/ verbatim).
    // See CDN_PROFILE/DEV_CORE_PROFILE 'shim/' for the parity companions.
    'shim/':                  '../../ide/'
};

// ── CDN_PROFILE (jsdelivr static hosting — ws-artifact-showcase Bite A1) ────────
//
// Pinned-version constants — the "one constant" the packet's absolute jsdelivr
// bases resolve from (docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md
// §3b). These are hardcoded (not read from package.json — this module runs in
// the browser, no fs access) and MUST be bumped alongside each npm publish;
// lib/shim/engine/test/router.test.mjs asserts them against the two
// package.json#version fields so a forgotten bump fails `make verify`, not a
// silent stale-CDN-URL bug.
var CDN_SDK_VERSION = '0.2.0';       // sdk/frqtl-sdk/package.json#version (0.2.0 is the node/browser PARITY CORE: exports["."] carries a `node` condition — import/require — and a `default` browser condition resolving ONE symbol contract, `./boot` is added, and `./node` is REMOVED; that removal is what makes it a breaking bump. Bumped with the npm publish)
var CDN_MATH_SDK_VERSION = '0.1.3';  // sdk/egpt-math-sdk/package.json#version (0.1.3 scaled-vector op-contract — ws-egpt-math-rust-ops 2026-07-16: bench 157/157, 0 gaps)

var CDN_BASE = 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@' + CDN_SDK_VERSION + '/dist';
var CDN_MATH_BASE = 'https://cdn.jsdelivr.net/npm/@descix/egpt-math-sdk@' + CDN_MATH_SDK_VERSION + '/dist';

// CDN_PROFILE mirrors DIST_PROFILE's internal dist-relative targets (both profiles
// resolve into the SAME published sdk/frqtl-sdk/dist/ tree — see build.js) but
// expresses each target as an absolute URL anchored at a base (CDN_BASE by
// default) instead of a page-relative '../../' navigation. A non-private key
// here MUST resolve to the identical dist sub-path DIST_PROFILE's matching key
// resolves to (both are the same physical file on disk, served two different
// ways) — the parity test also asserts this dist-subpath equivalence, not just
// key-name parity.
//
// buildCdnProfile(base) — FACTORY, not the profile itself (ws-artifact-showcase
// Bite A2, 2026-07-10, tester finding project_artifact_showcase_rule0_final_fail
// _cdnbase_hardcoded.md): CDN_BASE used to be baked into a MODULE-LEVEL CDN_PROFILE
// object with no override hook. The pre-publish local-CDN-mirror harness could
// override the artifact shell's OWN import-map entry (artifact-shell.js's own
// `opts.base`) but had NO way to redirect the ~30 OTHER script URLs
// `engineRouter({mode:'cdn'})` resolves for the artifact-showcase ESM entry
// (chroma/quadtree/wasm-engine/wasm-load-browser/egpt-engine, every RENDERER +
// GAME script) — those always fell through to the REAL (unpublished, 404ing)
// jsdelivr CDN regardless of what the mirror served. `buildCdnProfile(base)` is
// the SAME profile SHAPE, parameterized on `base` instead of closing over the
// module constant, so `engineRouter({mode:'cdn', base: overrideBase})` can
// redirect EVERY resolved URL, not just one. `CDN_MATH_SDK`/`CDN_MATH_BASE`
// (the sibling egpt-math-sdk package) are DELIBERATELY NOT parameterized here —
// they are a different published package this override has no business
// touching; the math lane is deferred and unexercised by the double-slit
// showcase regardless.
//
// `base` is FOR THE PRE-PUBLISH HARNESS AND TESTS ONLY (sdk/frqtl-sdk/scripts/
// serve-local-cdn-mirror.mjs; lib/shim/engine/test/router.test.mjs). The
// PUBLISHED artifact shell / ESM entry never pass it — `engineRouter({mode:
// 'cdn'})` with no `base` opt is byte-identical to before this change (default
// `CDN_PROFILE = buildCdnProfile(CDN_BASE)` below, same object shape, same
// values).
function buildCdnProfile(base) {
    return {
        'assets/vendor/':         base + '/js/lib/',
        'assets/render/':         base + '/js/consumers/',
        // External-geometry fixtures — same dist subdir as DIST_PROFILE (js/models/),
        // just resolved via this profile's `base`.
        'assets/models/':         base + '/js/models/',
        // 'compat/providers/' MUST precede the general 'compat/' key below —
        // resolve() takes the FIRST matching prefix in insertion order (architect
        // gate, ws-artifact-showcase Bite A2, 2026-07-10 — tester found this
        // 404ing from a real jsdelivr-shaped mirror:
        // router.resolve('compat/providers/wasm-engine.js') naively appended the
        // tail onto the general 'compat/' base, producing
        // '<base>/js/compat/providers/wasm-engine.js' — a path nothing in dist
        // serves). build.js FLATTENS lib/frqtl/compat/providers/{wasm-engine,
        // wasm-load-browser}.js straight into dist/js/compat/ (the
        // 'providers/' segment is dropped — see build.js step 1), landing them
        // alongside egpt-engine.js — so this key's target is the IDENTICAL
        // base + '/js/compat/' as 'compat/' itself, not a nested
        // '.../js/compat/providers/' a naive single-prefix resolve would produce.
        'compat/providers/':      base + '/js/compat/',
        'compat/':                base + '/js/compat/',
        'objects/':               base + '/js/game/',
        'experiments/_shared/':   base + '/experiments/_shared/',
        // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins).
        // Four-way parity companion to DEV_CORE/DIST/STATIC 'experiments/'.
        'experiments/':           base + '/experiments/',
        // WASM pkg URL — absolute jsdelivr URL to the compiled Rust engine + glue.
        // window._egptWasmPkgUrl still overrides FIRST (wasm-load-browser.js:42-43);
        // this is the profile DEFAULT for a host page that sets nothing itself.
        '__wasmPkgUrl':           base + '/fat/pkg-web/egpt_wasm.js',
        // Math SDK / math lane — INTENTIONALLY still anchored at CDN_MATH_BASE
        // (the closed-over module constant), never `base` — see the factory
        // docstring above: this is a different, sibling published package.
        // Wired identically to DIST_PROFILE's shape. DEFERRED (packet §3b): not
        // exercised by the double-slit showcase, but present so a future
        // math-notebook artifact needs no new profile keys, only a version bump
        // once egpt-math-sdk is published.
        '__mathSdkUrl':           CDN_MATH_BASE + '/index.js',
        '__mathWasmUrl':          CDN_MATH_BASE + '/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    CDN_MATH_BASE + '/wasm/egpt_math_sdk_wasm.js',
        '__mathBackend':          'js-reference',
        '__notebookBase':         CDN_MATH_BASE + '/notebooks',
        // Vendor import-map root — frqtl-sdk's OWN dist/vendor/ (manifest-driven
        // copy, build.js copyVendorManifestToDist()). Unlike DIST_PROFILE.__vendorBase
        // (which points at the egpt-math-sdk SIBLING dist, a same-origin /pub_sdk
        // convenience), a CDN host cannot assume a sibling package is co-published
        // — frqtl-sdk must be self-sufficient for its own realm-import-map vendor
        // libs (packet §3b). Uses `base` — THIS package's own dist/vendor/.
        '__vendorBase':           base + '/vendor',
        // lib/shim contract scripts — base + '/ide/...' (copyCommon() copies
        // lib/shim/ → dist/ide/ verbatim; the CDN just serves that same sub-path
        // from jsdelivr instead of a same-origin dist mount). ws-artifact-showcase
        // Bite A2: the artifact ESM boot resolves ast-schema.js / frame-data/
        // index.js through this key rather than hand-deriving a jsdelivr URL.
        'shim/':                  base + '/ide/'
    };
}

// The default CDN profile — the SAME factory, called with the module constant.
// Every existing consumer (the parity assertion below, router.test.mjs,
// build.js's imports) gets a byte-identical object to before this refactor.
var CDN_PROFILE = buildCdnProfile(CDN_BASE);

// ── STATIC_PROFILE (self-contained same-origin static host — ws-egpt-frqtl-site-deploy) ──
//
// The React FraqtlIde deployed as a dumb-static, no-backend, WASM-only site (DeSciX
// CodeSite / any GCS-backed host — no fraqtlServe, no serveLocalhost). The host serves the
// site under a path PREFIX it chooses (/<env>/<app_id>/site/ on the platform, /p/<app_id>/
// under `descix serve`), so the sdk payload's location is known only RELATIVE TO THE
// DOCUMENT: STATIC_SDK_DIR. That literal is the ONE derivation of the static base:
//   - STATIC_PROFILE = buildStaticProfile(STATIC_SDK_DIR) — document-relative values, for
//     consumers that resolve against the document themselves (the build-time import map
//     baked into index.html; import-map addresses resolve against the document URL).
//   - engineRouter({mode:'static'}) = buildStaticProfile(staticSdkBase(document.baseURI)) —
//     the same directory made ABSOLUTE at runtime, because a relative URL handed to
//     import(), an iframe inside an experiment page, or Monaco's loader would resolve
//     against the wrong anchor (the importing module, not the document).
//   - engineRouter({mode:'static', documentRelative:true}) = STATIC_PROFILE itself — the router
//     form of the document-relative values, for a BUILD-TIME consumer that emits URLs the
//     document resolves (the baked import map), so it resolves paths through the SAME
//     first-match resolve() as every other router instead of reading raw profile keys.
// buildStaticProfile(base) mirrors buildCdnProfile's SHAPE but anchors EVERY base —
// engine, vendor, experiments, ide/shim, AND the math + notebook lanes — at that ONE base.
//
// THE DELIBERATE DIVERGENCE FROM CDN_PROFILE (architect design §A.3 / §E flag 4):
// CDN_PROFILE's math + notebook bases are hardwired CROSS-ORIGIN at CDN_MATH_BASE
// (the separately-published jsdelivr egpt-math-sdk package) — reusing `mode:'cdn'`
// with a `base` override would still leave __mathSdkUrl / __notebookBase pointing at
// the unpublished cross-origin jsdelivr URL, breaking the QFT notebook and violating
// same-origin/no-CORS. The static-site semantic is "everything self-contained under
// ONE origin prefix": the math SDK is co-served at `base + '/egpt-math-sdk/...'` and
// the curated notebooks ride the frqtl-sdk dist's OWN copy at `base + '/notebooks'`
// (build.js's new copy step, NOT under egpt-math-sdk). A DISTINCT profile here is the
// correct DRY call — the SAME justification that keeps CDN_PROFILE distinct from
// DIST_PROFILE — not proliferation.
function buildStaticProfile(base) {
    return {
        'assets/vendor/':         base + '/js/lib/',
        'assets/render/':         base + '/js/consumers/',
        // External-geometry fixtures — same dist subdir as DIST_PROFILE (js/models/),
        // just resolved via this profile's `base`.
        'assets/models/':         base + '/js/models/',
        // 'compat/providers/' MUST precede the general 'compat/' key (first-match-wins
        // prefix order) — SAME flattening as DIST/CDN: build.js drops the 'providers/'
        // segment, landing wasm-engine/wasm-load-browser alongside
        // egpt-engine.js in dist/js/compat/. Target is the IDENTICAL base + '/js/compat/'.
        'compat/providers/':      base + '/js/compat/',
        'compat/':                base + '/js/compat/',
        'objects/':               base + '/js/game/',
        'experiments/_shared/':   base + '/experiments/_shared/',
        // General experiments/ key — AFTER 'experiments/_shared/' (first-match-wins).
        // Four-way parity companion to DEV_CORE/DIST/CDN 'experiments/'. On the static
        // host, resolve('experiments/{id}/index.html') → base + '/experiments/{id}/...'.
        'experiments/':           base + '/experiments/',
        // WASM pkg — into the co-served frqtl-sdk dist.
        // window._egptWasmPkgUrl still overrides FIRST (wasm-load-browser.js).
        '__wasmPkgUrl':           base + '/fat/pkg-web/egpt_wasm.js',
        // Math + notebook lanes anchored SAME-ORIGIN into the co-served payload —
        // the deliberate divergence from CDN_PROFILE (which points cross-origin at
        // the separately-published jsdelivr egpt-math-sdk). See the factory docstring.
        '__mathSdkUrl':           base + '/egpt-math-sdk/index.js',
        '__mathWasmUrl':          base + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm',
        '__mathWasmModuleUrl':    base + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm.js',
        '__mathBackend':          'js-reference',
        // Notebooks come from the frqtl-sdk dist's OWN copy (build.js copyDir
        // lib/notebooks → dist/notebooks) — NOT under egpt-math-sdk (architect §A.3/§B.1).
        '__notebookBase':         base + '/notebooks',
        // Vendor import-map root — frqtl-sdk's OWN dist/vendor/ (same as CDN, self-
        // sufficient), just same-origin instead of jsdelivr.
        '__vendorBase':           base + '/vendor',
        // lib/shim contract scripts — copyCommon() copies lib/shim/ → dist/ide/ verbatim.
        'shim/':                  base + '/ide/'
    };
}

// The static deploy's sdk payload directory, relative to the site's document. The ONLY
// place the static base is spelled; scripts/assemble-static-deploy.mjs places the payload
// there, and every static URL is derived from it.
var STATIC_SDK_DIR = './pub';

/**
 * The static profile's absolute base for a document: STATIC_SDK_DIR resolved against the
 * document's base URI (e.g. 'https://h/prod/app/site/index.html?preset=author' →
 * 'https://h/prod/app/site/pub'). FAILS LOUD without a base URI — a static URL has no
 * meaning until it is anchored to the document that serves the site.
 * @param {string} documentBaseURI
 * @returns {string}
 */
function staticSdkBase(documentBaseURI) {
    if (!documentBaseURI) {
        throw new Error('[engineRouter] mode:"static" resolves against the document — no document.baseURI here. ' +
            'Outside a browser pass opts.documentBaseURI (the URL of the directory serving the static site).');
    }
    return new URL(STATIC_SDK_DIR, documentBaseURI).href;
}

// The document-relative static profile — Same pattern as CDN_PROFILE = buildCdnProfile(CDN_BASE).
var STATIC_PROFILE = buildStaticProfile(STATIC_SDK_DIR);

// Parity assertion: all FOUR profiles must cover identical non-private keys.
// Private keys begin with '__'.
var _assertProfileParity = (function () {
    var devKeys    = Object.keys(DEV_CORE_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var distKeys   = Object.keys(DIST_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var cdnKeys    = Object.keys(CDN_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    var staticKeys = Object.keys(STATIC_PROFILE).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
    if (devKeys.join(',') !== distKeys.join(',') ||
        devKeys.join(',') !== cdnKeys.join(',') ||
        devKeys.join(',') !== staticKeys.join(',')) {
        throw new Error('[engineRouter] Profile parity FAIL: dev/dist/cdn/static profiles have different path keys.\n' +
            'dev:    ' + devKeys.join(', ') + '\n' +
            'dist:   ' + distKeys.join(', ') + '\n' +
            'cdn:    ' + cdnKeys.join(', ') + '\n' +
            'static: ' + staticKeys.join(', '));
    }
    // The vendor base (__vendorBase) is a PRIVATE key but it MUST exist in ALL
    // FOUR profiles (the single path authority for the /vendor URL space — every
    // host resolves a realm import-map base through it). Assert it explicitly so a
    // profile can never half-define it (WS-NOTEBOOK-VENDOR §2a.4).
    if (!DEV_CORE_PROFILE.__vendorBase || !DIST_PROFILE.__vendorBase ||
        !CDN_PROFILE.__vendorBase || !STATIC_PROFILE.__vendorBase) {
        throw new Error('[engineRouter] Profile parity FAIL: __vendorBase must be defined in ALL FOUR profiles.');
    }
    return true;
})();

// ── engineRouter factory ─────────────────────────────────────────────────────

/**
 * @typedef {object} EngineRouter
 * @property {(relPath: string) => string} resolve
 *   Map a frqtl-relative path (e.g. `'compat/egpt-engine.js'`) to an absolute URL
 *   according to the active profile. Returns `''` for paths omitted in dist (rule 5).
 * @property {'wasm'} engine
 *   The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers read this;
 *   never hardcode an engine id above the shim.
 * @property {() => Array<{src:string, attrs?:Object}>} engineScripts
 *   Ordered engine-load script list (chroma → Rectangle → compat).
 * @property {() => Array<{src:string}>} gameScripts
 *   Ordered game-layer script list (object sugar + FrqtlApp).
 * @property {() => string} bootSrc    — URL of `engine-boot.js`.
 * @property {() => string} p5Src      — URL of `p5.min.js`.
 * @property {string} wasmPkgUrl       — WASM package URL (overridable via `window._egptWasmPkgUrl`).
 * @property {string} mathSdkUrl       — egpt-math-sdk bundle URL.
 * @property {string} mathWasmUrl      — WASM math bridge binary URL.
 * @property {string} mathWasmModuleUrl — WASM math bridge glue module URL.
 * @property {string} mathBackend      — active math backend id (`'js-reference'` | `'wasm-math'`).
 * @property {string} notebookBase     — curated-notebook URL base (dev: `/notebooks`).
 * @property {string} vendorBase       — placed-vendor URL base (dev: `/vendor`); the
 *   import-map base for realm bare-specifier imports (vendor-importmap.buildImportMap).
 */

/**
 * Create an engine router for the given mode and engine.
 *
 * @param {object} [opts]
 * @param {'dev-core'|'dist'|'cdn'|'static'} [opts.mode='dev-core']
 *   `'dev-core'` uses the `lib/server` plugin mounts (`/frqtl`, `/fat`).
 *   `'dist'` uses the flat `sdk/frqtl-sdk/dist` layout, same-origin RELATIVE paths.
 *   `'cdn'` uses the SAME dist layout resolved to ABSOLUTE jsdelivr URLs (static
 *   hosting with no server — ws-artifact-showcase).
 *   `'static'` uses the SAME dist layout resolved to ABSOLUTE URLs under the site's
 *   `./pub` directory, anchored at the document (`opts.documentBaseURI`, default
 *   `document.baseURI`), with the math + notebook lanes co-served in the same tree —
 *   so the site works under any path prefix. `opts.base` THROWS in this mode: the static
 *   base is derived, never supplied.
 * @param {'wasm'} [opts.engine='wasm']
 *   Physics engine. FRQTL is WASM-only; an explicit `'js'` throws (archived).
 * @param {string} [opts.wasmPkgUrl]
 *   Override the WASM pkg URL (all modes). Falls back to `window._egptWasmPkgUrl`
 *   then the profile default.
 * @param {string} [opts.mathSdkUrl]
 *   Override the egpt-math-sdk URL. Falls back to `window._egptMathSdkUrl` then
 *   the profile default.
 * @param {string} [opts.mathWasmUrl]
 *   Override the WASM math bridge binary URL.
 * @param {string} [opts.mathWasmModuleUrl]
 *   Override the WASM math bridge glue module URL.
 * @param {string} [opts.mathBackend]
 *   Override the math backend id. `'wasm'` is normalized to `'wasm-math'`. Falls
 *   back to `?mathBackend=` URL param then the profile default (`'js-reference'`).
 * @param {boolean} [opts.documentRelative]
 *   **`mode:'static'` ONLY.** Resolve against STATIC_PROFILE's DOCUMENT-RELATIVE values
 *   (`./pub/...`) instead of anchoring at a document — for a build-time consumer whose output
 *   the document itself resolves (the static import map baked into index.html). Throws with
 *   any other mode, or together with `opts.documentBaseURI`.
 * @param {string} [opts.documentBaseURI]
 *   **`mode:'static'` ONLY.** The document URL the static site is served from (default
 *   `document.baseURI`). Supplied only outside a browser (the deploy assembler, tests) —
 *   e.g. `resolve('assets/vendor/monaco/vs')` with `'https://h/prod/app/site/'` →
 *   `'https://h/prod/app/site/pub/js/lib/monaco/vs'`.
 * @param {string} [opts.base]
 *   **`mode:'cdn'` ONLY.** Override the CDN base every resolved URL is anchored
 *   at (default: the module-level `CDN_BASE`, i.e. the REAL published jsdelivr
 *   URL). FOR THE PRE-PUBLISH LOCAL-CDN-MIRROR HARNESS AND TESTS ONLY
 *   (`sdk/frqtl-sdk/scripts/serve-local-cdn-mirror.mjs`,
 *   `lib/shim/engine/test/router.test.mjs`) — the published artifact shell/ESM
 *   entry never pass this; omitting it is byte-identical to before this option
 *   existed (ws-artifact-showcase Bite A2, 2026-07-10 tester finding: without
 *   this hook, only the artifact shell's OWN import-map entry could be
 *   redirected to a local mirror — every OTHER script the ESM entry resolves
 *   still silently fell through to the real, unpublished CDN). Ignored for
 *   `mode:'dev-core'|'dist'` (no-op — those modes have no CDN_BASE concept).
 * @returns {EngineRouter}
 *
 * @example
 * import { engineRouter } from 'lib/shim';
 *
 * // Dev mode (used by apps/ide and apps/frqtl_site during `vite dev`):
 * const devRouter = engineRouter({ mode: 'dev-core', engine: 'wasm' });
 * console.log(devRouter.mathSdkUrl); // '/egpt-src/index.js'
 *
 * // Dist mode (used by sdk/frqtl-sdk/build.js for the packaged shell):
 * const distRouter = engineRouter({ mode: 'dist', engine: 'wasm' });
 * console.log(distRouter.resolve('compat/egpt-engine.js')); // '../../js/compat/egpt-engine.js'
 *
 * // CDN mode (static hosting — the artifact host shell has no server, no page anchor):
 * const cdnRouter = engineRouter({ mode: 'cdn', engine: 'wasm' });
 * console.log(cdnRouter.wasmPkgUrl);
 * // 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.1.0/dist/fat/pkg-web/egpt_wasm.js'
 *
 * // CDN mode, pre-publish local-mirror override (harness/test ONLY):
 * const mirrorRouter = engineRouter({ mode: 'cdn', engine: 'wasm', base: 'http://127.0.0.1:9999/npm/@descix/frqtl-sdk@0.1.0/dist' });
 * console.log(mirrorRouter.wasmPkgUrl);
 * // 'http://127.0.0.1:9999/npm/@descix/frqtl-sdk@0.1.0/dist/fat/pkg-web/egpt_wasm.js'
 */
export function engineRouter(opts) {
    opts = opts || {};
    var mode     = opts.mode     || 'dev-core';
    var engine   = opts.engine   || 'wasm';
    // FRQTL physics is WASM-only. An explicit 'js' request FAILS LOUD — the JS
    // reference engine is archived (internal/archive/frqtl-js-reference/), not a runtime backend.
    if (engine === 'js') {
        throw new Error('[engineRouter] JS reference engine archived — FRQTL is WASM-only. ' +
            'Remove engine:"js"; the only FRQTL physics engine is the compiled Rust/WASM engine.');
    }
    if (mode === 'static' && opts.base) {
        throw new Error('[engineRouter] mode:"static" takes no opts.base — the static base is derived from the ' +
            'document (STATIC_SDK_DIR against document.baseURI). Remove base:' + JSON.stringify(opts.base) + '.');
    }
    if (opts.documentRelative && mode !== 'static') {
        throw new Error('[engineRouter] opts.documentRelative applies only to mode:"static" (got mode:"' + mode + '").');
    }
    if (opts.documentRelative && opts.documentBaseURI) {
        throw new Error('[engineRouter] opts.documentRelative and opts.documentBaseURI are exclusive — a ' +
            'document-relative router is anchored at no document.');
    }
    var profile  = mode === 'dist'
        ? DIST_PROFILE
        : (mode === 'cdn'
            ? (opts.base ? buildCdnProfile(opts.base) : CDN_PROFILE)
            : (mode === 'static'
                ? (opts.documentRelative
                    ? STATIC_PROFILE
                    : buildStaticProfile(staticSdkBase(opts.documentBaseURI ||
                        (typeof document !== 'undefined' ? document.baseURI : ''))))
                : DEV_CORE_PROFILE));

    // Resolve the WASM pkg URL.
    var wasmPkgUrl = opts.wasmPkgUrl
        || (typeof window !== 'undefined' && window._egptWasmPkgUrl)
        || (profile.__wasmPkgUrl !== '__use_window_override' ? profile.__wasmPkgUrl : '');

    function resolve(relPath) {
        // Check the __distOmit list first: files omitted in dist return '' (signal to skip).
        var omitList = profile.__distOmit;
        if (omitList && Array.isArray(omitList)) {
            for (var oi = 0; oi < omitList.length; oi++) {
                if (relPath === omitList[oi]) { return ''; }
            }
        }
        var keys = Object.keys(profile).filter(function (k) { return k.indexOf('__') !== 0; });
        for (var i = 0; i < keys.length; i++) {
            var prefix = keys[i];
            if (relPath === prefix || relPath.indexOf(prefix) === 0) {
                var replacement = profile[prefix];
                var tail = relPath.slice(prefix.length);
                return replacement + tail;
            }
        }
        // Fallback: the dev-core /frqtl mount serves lib/frqtl 1:1. Every other profile maps a
        // FLATTENED or re-anchored tree, where a root-absolute '/frqtl/' guess is a silent 404
        // — so an unmapped path there fails loud and names the profile key to add.
        if (profile !== DEV_CORE_PROFILE) {
            throw new Error('[engineRouter] mode:"' + mode + '" has no profile prefix for "' + relPath + '". ' +
                'Add the prefix to every profile in lib/shim/engine/router.js (profile parity).');
        }
        return '/frqtl/' + relPath;
    }

    function engineScripts() {
        return [
            { src: resolve('assets/vendor/chroma.min.js') },
            // Rectangle — the sole spatial-rect authority, loaded in the ENGINE phase
            // because the WASM provider wrapper's createUniverse needs window.Rectangle
            // before the game layer runs.
            { src: resolve('objects/geometry/Rectangle.js') },
            { src: resolve('compat/providers/wasm-engine.js') },
            { src: resolve('compat/providers/wasm-load-browser.js') },
            { src: resolve('compat/egpt-engine.js') }
        ];
    }

    function bootSrc() {
        return resolve('experiments/_shared/engine-boot.js');
    }

    function gameScripts() {
        /* Derived from the single authority: lib/shim/engine/game-layer-manifest.js
           GAME_LAYER_SCRIPTS. Setup factories (objects/setup/*.js) are per-surface
           and are NOT loaded globally — each experiment/surface loads only the
           setups it needs via data-page-scripts or an explicit import. */
        return GAME_LAYER_SCRIPTS.map(function (p) { return { src: resolve(p) }; });
    }

    function p5Src() {
        return resolve('assets/vendor/p5.min.js');
    }

    // The browser projection of THIS router's profile — the SAME shape
    // spliceEnginePathMap (lib/shim/engine/experiment-page-map.js) bakes/injects into a
    // served page's window._egptEnginePathMap. One accessor, no profile leak: nothing
    // outside router.js ever touches a raw profile object (ws-stackboot-dev-map SEAM
    // RULING R1).
    function browserPathMap() {
        return buildBrowserPathMap(profile);
    }

    // Idempotent, cross-injector-safe precondition setter for a PROGRAMMATIC host that
    // injects stack-boot.js into a page it already owns (GraphicsPane.boot(),
    // ensureEngineStack()) — the third host class (stack-boot.js's own docstring).
    // Such a host must set window._egptEnginePathMap from ITS OWN router BEFORE the tag
    // executes, same precondition discipline it already applies to
    // _egptWasmPkgUrl/_egptDefaultEngine. Two routers on one page is a HOST BUG, not a
    // silent merge: present + byte-identical → no-op; present + DIFFERENT → throw
    // (naming both this router's mode and the map already on the page); absent → set.
    // Never set-if-absent-only — a stale map from an earlier/different host is exactly
    // the silent-fallback class this whole bite exists to close.
    function ensureBrowserPathMap() {
        if (typeof window === 'undefined') {
            throw new Error('[engineRouter] ensureBrowserPathMap() runs only in a browser (no window here).');
        }
        var map = browserPathMap();
        var json = JSON.stringify(map);
        var existing = window._egptEnginePathMap;
        if (existing !== undefined) {
            if (JSON.stringify(existing) === json) { return map; }   // equal → no-op
            throw new Error(
                '[engineRouter] window._egptEnginePathMap is already set to a DIFFERENT map than ' +
                'mode:"' + mode + '" projects (existing=' + JSON.stringify(existing) + ', this router=' +
                json + '). Two routers/injectors on one page is a host bug — only ONE host may set ' +
                'this page\'s engine path map.'
            );
        }
        window._egptEnginePathMap = map;   // absent → set
        return map;
    }

    // Resolve the math SDK URL:
    // 1. Caller-supplied explicit override always wins.
    // 2. window._egptMathSdkUrl (runtime injection used by dist shell).
    // 3. Profile __mathSdkUrl entry (authoritative default per environment).
    var mathSdkUrl = opts.mathSdkUrl
        || (typeof window !== 'undefined' && window._egptMathSdkUrl)
        || profile.__mathSdkUrl
        || '';

    var mathWasmUrl = opts.mathWasmUrl
        || (typeof window !== 'undefined' && window._egptMathWasmUrl)
        || profile.__mathWasmUrl
        || '';

    var mathWasmModuleUrl = opts.mathWasmModuleUrl
        || (typeof window !== 'undefined' && window._egptMathWasmModuleUrl)
        || profile.__mathWasmModuleUrl
        || '';

    // Resolve the math backend id.
    // URL param ?mathBackend=wasm|js-reference|wasm-math takes the lowest priority
    // (can be overridden by the caller).  'wasm' is a friendly alias for 'wasm-math'.
    // Profile __mathBackend is the environment default; caller opts.mathBackend wins.
    var _urlMathBackend = '';
    if (typeof window !== 'undefined' && typeof URLSearchParams !== 'undefined') {
        try {
            _urlMathBackend = new URLSearchParams(window.location.search).get('mathBackend') || '';
        } catch (_) { /* ignore in non-browser */ }
    }
    var mathBackend = opts.mathBackend
        || _urlMathBackend
        || profile.__mathBackend
        || 'js-reference';
    // Normalise friendly alias: 'wasm' → 'wasm-math'.
    if (mathBackend === 'wasm') { mathBackend = 'wasm-math'; }

    // Notebook URL base (dev=/notebooks, dist=../../../egpt-math-sdk/notebooks).
    // Single path authority for the curated-notebook URL space — surfaces never
    // derive it; FraqtlIde threads it into the notebook browser/pane as a prop.
    var notebookBase = profile.__notebookBase || '/notebooks';

    // Vendor URL base (dev=/vendor, dist=../../../egpt-math-sdk/vendor). Single path
    // authority for the placed-vendor URL space — the notebook surfaces NEVER derive
    // '/vendor'; FraqtlIde + the .vsix realm splice build the import-map base from
    // THIS (vendor-importmap.buildImportMap(manifest, router.vendorBase)).
    var vendorBase = profile.__vendorBase || '/vendor';

    return {
        resolve:           resolve,
        // The physics engine — always 'wasm' (FRQTL is WASM-only). Consumers
        // (e.g. the notebook realm-frqtl descriptor) READ this instead of hardcoding
        // an engine or sniffing an audience flag (the dependency-map rule: never an
        // `if (audience) engine='wasm'` branch above the shim).
        engine:            engine,
        engineScripts:     engineScripts,
        gameScripts:       gameScripts,
        bootSrc:           bootSrc,
        p5Src:             p5Src,
        wasmPkgUrl:        wasmPkgUrl,
        mathSdkUrl:        mathSdkUrl,
        mathWasmUrl:       mathWasmUrl,
        mathWasmModuleUrl: mathWasmModuleUrl,
        mathBackend:       mathBackend,
        notebookBase:      notebookBase,
        vendorBase:        vendorBase,
        browserPathMap:       browserPathMap,
        ensureBrowserPathMap: ensureBrowserPathMap
    };
}

/**
 * Project a router profile to the browser `window._egptEnginePathMap` contract: the
 * PUBLIC (non-`__`) prefix→replacement keys ONLY, in the profile's own insertion order
 * (first-match-wins is order-sensitive — `compat/providers/` MUST precede `compat/`,
 * `experiments/_shared/` MUST precede `experiments/`, and `shim/` MUST be present so
 * stack-boot's `_u('shim/...')` routes correctly).
 *
 * This is the ONE projection every host that serves a classic experiment page consumes —
 * `sdk/frqtl-sdk/build.js` (DIST_PROFILE, baked into the built page at build time) and
 * `lib/server/mounts.js` (DEV_CORE_PROFILE, spliced into the served page at request time,
 * ws-stackboot-dev-map). Both call THIS function on the profile object router.js already
 * owns — never a hand-written literal map — so dev/dist/cdn/static can never drift from
 * the profiles above by a second derivation (the schema-mirror-drift anti-pattern).
 *
 * `lib/frqtl/experiments/_shared/stack-boot.js` `_resolve()` and
 * `lib/components/graphics-render/index.js` `_url()` are the two `window._egptEnginePathMap`
 * READERS; this is the one WRITER-shape they both consume.
 *
 * @param {object} profile - a router profile object (e.g. DEV_CORE_PROFILE, DIST_PROFILE).
 * @returns {object} plain prefix→replacement object (private `__` keys omitted).
 */
export function buildBrowserPathMap(profile) {
    const map = {};
    for (const k of Object.keys(profile)) {
        if (k.indexOf('__') === 0) continue;   // omit private (__wasmPkgUrl, __distOmit, __math*, ...)
        map[k] = profile[k];
    }
    return map;
}

// Export profiles for the sdk build to consume.
export { DEV_CORE_PROFILE, DIST_PROFILE, CDN_PROFILE, STATIC_PROFILE, STATIC_SDK_DIR, CDN_SDK_VERSION, CDN_MATH_SDK_VERSION, CDN_BASE, CDN_MATH_BASE, buildCdnProfile, buildStaticProfile, staticSdkBase };
