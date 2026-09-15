/**
 * coverage-baseline.mjs — WS-CODE-SINGLE-RUN P5.
 *
 * Runs every catalog entry against js-reference AND wasm-math backends.
 * Outputs per-entry: pass/fail per backend, MATCH/DIVERGENCE, first diff line.
 * Raw observed results only — no interpretation.
 *
 * Usage: node lib/shim/runtime/test/coverage-baseline.mjs
 *
 * Prerequisites:
 *   - npm run build:wasm-bridge in sdk/egpt-math-sdk (produces generated/egpt_math_wasm/)
 *   - The sdk dist should have examples (sdk/egpt-math-sdk/dist/editor/examples/)
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── DOM stubs (DebugLogger + others need document) ──────────────────────────
var _noop = function () {};
var _noEl = { setAttribute: _noop, style: {}, appendChild: _noop, src: '' };
globalThis.document = {
    readyState: 'complete',
    addEventListener: _noop, removeEventListener: _noop,
    getElementById: function () { return null; },
    createElement: function () { return Object.assign({}, _noEl); },
    head: { appendChild: _noop },
    body: { appendChild: _noop }
};
globalThis.window   = globalThis;
globalThis.window._egptWhenEngineReady = null;
globalThis.window._egptMathSdkUrl      = '';

// ── Load backends ────────────────────────────────────────────────────────────

const {
    MathBackendRegistry,
    JsReferenceMathBackendProvider,
} = await import(path.join(repoRoot, 'lib/egpt/js/model/backend/MathBackendProvider.js'));

const { buildWasmMathProvider } = await import(
    path.join(repoRoot, 'sdk/egpt-math-sdk/src/browser/wasm-math-provider.js')
);

// Load the wasm binary
const WASM_JS_PATH  = path.join(repoRoot, 'sdk/egpt-math-sdk/src/browser/generated/egpt_math_wasm/egpt_math_sdk_wasm.js');
const WASM_BIN_PATH = path.join(repoRoot, 'sdk/egpt-math-sdk/src/browser/generated/egpt_math_wasm/egpt_math_sdk_wasm_bg.wasm');

const wasmModule = await import(WASM_JS_PATH);
const wasmBinary = await readFile(WASM_BIN_PATH);
if (typeof wasmModule.default === 'function') {
    await wasmModule.default(wasmBinary);
} else if (typeof wasmModule.init === 'function') {
    await wasmModule.init(wasmBinary);
}

// Build wasm-math provider facade (mirrors parity.test.mjs)
const mod = wasmModule;
const safeCall = (name, ...args) => {
    if (typeof mod[name] !== 'function') {
        return { ok: false, error: `wasm-function-unavailable:${name}`, backend: 'wasm-bridge' };
    }
    try {
        return { ok: true, value: mod[name](...args), backend: 'wasm-bridge' };
    } catch (err) {
        return { ok: false, error: String(err), backend: 'wasm-bridge' };
    }
};

const { buildWasmMathProviderFromFacade } = await (async () => {
    // buildWasmMathProvider takes the wasm facade — same call as parity.test.mjs
    return { buildWasmMathProviderFromFacade: buildWasmMathProvider };
})();

// Use the exact same facade shape as parity.test.mjs (required by buildWasmMathProvider)
const wasmFacade = {
    addRational: (a, b) => safeCall('add_rational', a, b),
    subRational: (a, b) => safeCall('sub_rational', a, b),
    mulRational: (a, b) => safeCall('mul_rational', a, b),
    divRational: (a, b) => safeCall('div_rational', a, b),
    modRational: (a, b) => safeCall('mod_rational', a, b),
    cmpRational: (a, b) => safeCall('cmp_rational', a, b),
    powRational: (base, expNum, expDen) => safeCall('pow_rational', base, expNum, expDen),
    sqrtRational: (value) => safeCall('sqrt_rational', value),
    exp2Rational: (value) => safeCall('exp2_rational', value),
    log2Rational: (value) => safeCall('log2_rational', value),
    ppfEncodeInteger: (value) => safeCall('ppf_encode_integer', value),
    ppfDecodeInteger: (componentJson) => safeCall('ppf_decode_integer', componentJson),
    realFromRationalJson: (num, den) => safeCall('egpt_real_from_rational_json', num, den),
    polyAdd: (a, b) => safeCall('poly_add_wasm', a, b),
    polyMul: (a, b) => safeCall('poly_mul_wasm', a, b),
    polyDiv: (a, b) => safeCall('poly_div_wasm', a, b),
    polyForwardTransform: (coeffs, n) => safeCall('poly_forward_transform_wasm', coeffs, n),
    polyInverseTransform: (samples, n) => safeCall('poly_inverse_transform_wasm', samples, n),
    polyEvaluateAt: (poly, x) => safeCall('poly_evaluate_at_wasm', poly, x),
    polyGcd: (a, b) => safeCall('poly_gcd_wasm', a, b),
    getIntegerBitLength: (value) => safeCall('get_integer_bit_length', value),
    breakSymbolicToBigint: (value) => safeCall('break_symbolic_to_bigint', value),
    breakSymbolicToJsNumber: (value) => safeCall('break_symbolic_to_js_number', value),
    breakSymbolicToString: (value) => safeCall('break_symbolic_to_string', value),
    toPrimeAtomsJson: (value) => safeCall('to_prime_atoms_json', value),
    fromAtomVecJson: (json) => safeCall('from_atom_vec_json', json),
    toAtomRootJson: (value) => safeCall('to_atom_root_json', value),
    fromAtomRootJson: (json) => safeCall('from_atom_root_json', json),
    gcdBigint: (a, b) => safeCall('gcd_bigint', a, b),
    lcmBigint: (a, b) => safeCall('lcm_bigint', a, b),
    modPow: (base, exp, modulus) => safeCall('mod_pow', base, exp, modulus),
    fromPpfJson: (ppfJson) => safeCall('from_ppf_json', ppfJson),
    // M5.2: V2 binary transport (required by buildWasmMathProvider V2-C4 check)
    modPowV2: (base, exp, modulus) => safeCall('mod_pow_v2', base, exp, modulus),
    gcdV2: (a, b) => safeCall('gcd_v2', a, b),
    lcmV2: (a, b) => safeCall('lcm_v2', a, b),
};

const wasmProvider = buildWasmMathProviderFromFacade(wasmFacade);
MathBackendRegistry.register(wasmProvider);

// ── Load catalog ─────────────────────────────────────────────────────────────

const manifestPath = path.join(repoRoot, 'sdk/egpt-math-sdk/src/editor/examples-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
const examples = manifest.examples || [];

// ── Run engine ───────────────────────────────────────────────────────────────

// Capture console output from a single run of an example under a given backend.
// Returns { lines, ok, error }.

async function runEntry(entryObj, backendId) {
    // Resolve the source path from the manifest entry's path (relative to dist/editor/)
    const editorBase = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/editor/');
    const entryPath  = entryObj.path;
    // paths like './examples/foo.js' or '../theorems/E_EntropyLogBijection.js'
    const examplePath = path.resolve(editorBase, entryPath);
    let source;
    try {
        source = await readFile(examplePath, 'utf-8');
    } catch (e) {
        return { lines: [], ok: false, error: 'source-not-found: ' + e.message };
    }

    // Select the backend
    try { MathBackendRegistry.select(backendId); } catch (e) {
        return { lines: [], ok: false, error: 'backend-unavailable: ' + e.message };
    }

    // Run via the SDK pattern: import the module — but we can only do it in Node
    // if we handle the ES module imports. The example suites import from '../../index.js'
    // (relative to dist/editor/) — we rewrite those to the absolute SDK path.
    const sdkIndexPath = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/index.js');
    const sdkIndexUrl  = new URL('file://' + sdkIndexPath).toString();
    const testFwPath   = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/editor/shims/test-framework.js');
    const testFwUrl    = new URL('file://' + testFwPath).toString();

    const rewritten = source.replace(/from\s+(['"])([^'"]+)\1/g, function (match, q, specifier) {
        if (/^(https?:|blob:|data:|file:)/.test(specifier)) return match;
        if (specifier === 'node:test')   return `from 'node:test'`;
        if (specifier === 'node:assert') return `from 'node:assert'`;
        if (specifier === './EGPTTestSuite.js') return `from ${q}${testFwUrl}${q}`;
        if (/\/index\.js$/.test(specifier) ||
            specifier.indexOf('/core/') !== -1 ||
            specifier.indexOf('/stat/') !== -1) {
            return `from ${q}${sdkIndexUrl}${q}`;
        }
        // relative — resolve against dist/editor/
        const base = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/editor/');
        const abs  = path.resolve(base, specifier);
        return `from ${q}${new URL('file://' + abs).toString()}${q}`;
    });

    const lines = [];
    const origLog = console.log;
    console.log = function () {
        var parts = Array.prototype.map.call(arguments, function (a) {
            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch (e) { return String(a); }
        });
        lines.push(parts.join(' '));
        origLog.apply(console, arguments);
    };

    let ok = true;
    let errorMsg = null;
    try {
        const { createRequire } = await import('node:module');
        // Write temp file
        const { writeFile, unlink } = await import('node:fs/promises');
        const tmpPath = path.join(repoRoot, '_coverage_tmp_' + entryObj.id + '_' + backendId.replace(/-/g,'_') + '.mjs');
        await writeFile(tmpPath, rewritten, 'utf-8');
        try {
            const mod = await import(new URL('file://' + tmpPath).toString() + '?_ts=' + Date.now());
            if (typeof mod.run === 'function') {
                // Build a minimal SDK object for the run() call
                const { EGPTReal, EGPTMath, EGPTPolynomial, EGPTFFT, EGPTPrimeComposite } =
                    await import(sdkIndexUrl);
                const sdk = { EGPTReal, EGPTMath, EGPTPolynomial, EGPTFFT, EGPTPrimeComposite,
                               activeMathBackend: backendId };
                await mod.run(sdk);
            }
        } finally {
            await unlink(tmpPath).catch(() => {});
        }
    } catch (e) {
        ok = false;
        errorMsg = e && e.message ? e.message : String(e);
        lines.push('ERROR: ' + errorMsg);
    } finally {
        console.log = origLog;
    }

    return { lines, ok, error: errorMsg };
}

// ── Run all entries ───────────────────────────────────────────────────────────

const BACKENDS = ['js-reference', 'wasm-math'];
const results = [];

for (const entry of examples) {
    process.stdout.write('Running ' + entry.id + ' ... ');

    const jsResult   = await runEntry(entry, 'js-reference');
    const wasmResult = await runEntry(entry, 'wasm-math');

    // Normalize backend stamps (same logic as BenchView)
    const ids = ['js-reference', 'wasm-math'];
    function normalizeStamps(lines) {
        return lines.map(function (l) {
            var out = l;
            ids.forEach(function (id) { if (out.indexOf(id) !== -1) out = out.split(id).join('«backend»'); });
            return out;
        });
    }
    const jsNorm   = normalizeStamps(jsResult.lines);
    const wasmNorm = normalizeStamps(wasmResult.lines);

    // Compare
    let verdict, firstDiff = null;
    if (!jsResult.ok && !wasmResult.ok) {
        verdict = 'BOTH_FAILED';
    } else if (!jsResult.ok) {
        verdict = 'JS_FAILED';
    } else if (!wasmResult.ok) {
        verdict = 'WASM_FAILED';
    } else {
        // Both ran; compare outputs
        const maxLen = Math.max(jsNorm.length, wasmNorm.length);
        let matched = true;
        for (let i = 0; i < maxLen; i++) {
            const jl = jsNorm[i] !== undefined ? jsNorm[i] : '<missing>';
            const wl = wasmNorm[i] !== undefined ? wasmNorm[i] : '<missing>';
            if (jl !== wl) {
                matched = false;
                firstDiff = { line: i, js: jl, wasm: wl };
                break;
            }
        }
        verdict = matched ? 'MATCH' : 'DIVERGENCE';
    }

    process.stdout.write(verdict + '\n');

    results.push({
        id:         entry.id,
        title:      entry.title,
        group:      entry.group,
        js_ok:      jsResult.ok,
        wasm_ok:    wasmResult.ok,
        verdict:    verdict,
        first_diff: firstDiff,
        js_error:   jsResult.error,
        wasm_error: wasmResult.error,
    });
}

// ── Write results ─────────────────────────────────────────────────────────────

const counts = { MATCH: 0, DIVERGENCE: 0, BOTH_FAILED: 0, JS_FAILED: 0, WASM_FAILED: 0 };
results.forEach(function (r) { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });

console.log('\n--- SUMMARY ---');
console.log('Total entries:', results.length);
Object.keys(counts).forEach(function (k) { if (counts[k]) console.log(k + ':', counts[k]); });

// Output JSON for the PM baseline artifact
const { writeFile } = await import('node:fs/promises');
const outPath = path.join(repoRoot, '_coverage_baseline_raw.json');
await writeFile(outPath, JSON.stringify({ generated: new Date().toISOString(), counts, results }, null, 2), 'utf-8');
console.log('\nRaw results written to:', outPath);
