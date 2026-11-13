#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * bin/egpt-math-bench.js — npm `bin` for the packaged EGPT-Math canonical assertion bench.
 *
 * Runs COLD from the installed package against the package's OWN WASM
 * (`dist/wasm/egpt_math_sdk_wasm_bg.wasm` + its wasm-bindgen glue), never a JS math core:
 * it imports `createEgptMathSdk` from the sibling `dist/index.js` and drives the in-package
 * golden (`dist/node/bench/egpt-math-golden.mjs`), whose entries each re-target one of the
 * 157 assertions of the canonical EGPTTestSuite at the published facade.
 *
 * WASM provenance, printed and enforced:
 *   - the sha256 of the wasm binary the run loaded;
 *   - every call into the wasm-bindgen glue is counted, per assertion. The glue is wrapped by
 *     a generated `data:` module (one forwarding function per glue export, enumerated from the
 *     glue itself) and handed to `createEgptMathSdk` as its `wasmModuleUrl` — no file is
 *     written, no public API is involved;
 *   - an assertion that makes ZERO glue calls FAILS, unless its golden entry is marked
 *     `structural` (the golden's `structural` field is the one allow-list). A `structural`
 *     entry that does make a call fails too, so the allow-list cannot go stale silently.
 *
 * Usage:
 *   npx -y -p @descix/egpt-math-sdk@<version> egpt-math-bench --quiet
 *   npx -y -p @descix/egpt-math-sdk@<version> egpt-math-bench --quiet --negative-control
 *
 * Flags:
 *   --quiet             suppress the per-gap listing.
 *   --negative-control  run the same golden against a DELIBERATELY BROKEN provider, in-process
 *                       (the glue's `arenaMul` forwards to `arenaAdd`), plus one injected
 *                       assertion that calls no WASM. It must report RESULT: FAIL.
 *
 * Exit codes:
 *   normal run          0 = RESULT: PASS · 1 = RESULT: FAIL (or the package is incomplete).
 *   --negative-control  1 = RESULT: FAIL with both faults detected (prints `CONTROL: DETECTED`) ·
 *                       2 = a fault went undetected (prints `CONTROL: NOT DETECTED`; the bench is blind).
 *                       It never exits 0. A crash also exits 1, without the DETECTED line.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUIET = process.argv.includes('--quiet');
const NEGATIVE_CONTROL = process.argv.includes('--negative-control');

// The in-process fault the negative control injects: a glue export forwarded to a different one.
const BROKEN_OP = { from: 'arenaMul', to: 'arenaAdd' };
const COUNTER_KEY = Symbol.for('@descix/egpt-math-sdk/egpt-math-bench/wasm-call-counter');
// wasm-bindgen's init pair: loading the module, not a math call — forwarded uncounted.
const GLUE_INIT_EXPORTS = new Set(['default', 'initSync']);

// dist/node/bin/ -> dist/ : the published package root holding index.js + wasm/.
const distDir = resolve(__dirname, '..', '..');
const distIndex = resolve(distDir, 'index.js');
const wasmBinary = resolve(distDir, 'wasm', 'egpt_math_sdk_wasm_bg.wasm');
const wasmModule = resolve(distDir, 'wasm', 'egpt_math_sdk_wasm.js');

function fail(msg) {
  console.error(`EGPT-MATH BENCH: ${msg}`);
  process.exit(1);
}

for (const [label, p] of [['dist/index.js', distIndex], ['dist/wasm/egpt_math_sdk_wasm_bg.wasm', wasmBinary], ['dist/wasm/egpt_math_sdk_wasm.js', wasmModule]]) {
  if (!existsSync(p)) fail(`missing ${label} at ${p} — build the package (npm run build:wasm-bridge && npm run build) before packing.`);
}

const wasmBytes = readFileSync(wasmBinary);
const wasmSha256 = createHash('sha256').update(wasmBytes).digest('hex');

const { createEgptMathSdk } = await import(pathToFileURL(distIndex).href);
const { RUNNABLE, EXPECTED_GAP, TOTAL } = await import(pathToFileURL(resolve(distDir, 'node', 'bench', 'egpt-math-golden.mjs')).href);

// ── Count golden (deterministic): the split must exactly partition the canonical total. ──
if (RUNNABLE.length + EXPECTED_GAP.length !== TOTAL) {
  fail(`golden count drift: ${RUNNABLE.length} runnable + ${EXPECTED_GAP.length} gapped != ${TOTAL} canonical assertions.`);
}

// ── The counting wrapper over the glue (and, under --negative-control, the broken one). ──
const glueUrl = pathToFileURL(wasmModule).href;
const glue = await import(glueUrl);
const counted = Object.keys(glue).filter((name) => !GLUE_INIT_EXPORTS.has(name) && typeof glue[name] === 'function');
for (const name of counted) {
  if (/^class\b/.test(Function.prototype.toString.call(glue[name]))) {
    fail(`glue export '${name}' is a class; the call counter forwards functions only and cannot count it.`);
  }
}
if (NEGATIVE_CONTROL && !(counted.includes(BROKEN_OP.from) && counted.includes(BROKEN_OP.to))) {
  fail(`--negative-control needs glue exports '${BROKEN_OP.from}' and '${BROKEN_OP.to}'; this build lacks one.`);
}
const counter = { calls: 0 };
globalThis[COUNTER_KEY] = counter;
const wrapperSource = [
  `import * as g from ${JSON.stringify(glueUrl)};`,
  `export { default, initSync } from ${JSON.stringify(glueUrl)};`,
  `const C = globalThis[Symbol.for(${JSON.stringify(COUNTER_KEY.description)})];`,
  ...counted.map((name) => {
    const target = NEGATIVE_CONTROL && name === BROKEN_OP.from ? BROKEN_OP.to : name;
    return `export function ${name}(...a) { C.calls += 1; return g.${target}(...a); }`;
  }),
].join('\n');

const sdk = await createEgptMathSdk({
  wasmUrl: pathToFileURL(wasmBinary).href,
  wasmModuleUrl: 'data:text/javascript,' + encodeURIComponent(wrapperSource),
});

if (sdk.activeMathBackend !== 'wasm-math') {
  fail(`expected wasm-math backend, got '${sdk.activeMathBackend}' — this bench runs against WASM only.`);
}

/** Run one entry; its verdict includes the WASM-call rule. */
function runOne(a) {
  const before = counter.calls;
  let ok = false;
  let err = null;
  let info = null;
  try {
    const r = a.run(sdk);
    if (r === true) ok = true;
    else if (r && typeof r === 'object' && typeof r.ok === 'boolean') { ok = r.ok; info = r.info ?? null; }
  } catch (e) {
    err = e && e.message ? e.message : String(e);
  }
  const calls = counter.calls - before;
  let wasmRule = null;
  if (a.structural && calls > 0) wasmRule = `marked structural but made ${calls} WASM calls — remove its 'structural' field`;
  if (!a.structural && calls === 0) wasmRule = 'made ZERO WASM calls (not computed by the WASM engine)';
  if (wasmRule) ok = false;
  return { ok, err: err ?? wasmRule, calls, info };
}

// ── Run the runnable assertions ──
let passed = 0;
let callingWasm = 0;
const failures = [];
const structuralIds = [];
for (const a of RUNNABLE) {
  const r = runOne(a);
  if (a.structural) structuralIds.push(a.id);
  if (r.calls > 0) callingWasm += 1;
  if (r.ok) {
    passed += 1;
    console.log(`PASS ${a.id} ${a.name} [${r.calls} wasm calls]`);
  } else {
    failures.push({ id: a.id, name: a.name, err: r.err });
    console.log(`FAIL ${a.id} ${a.name} [${r.calls} wasm calls]${r.err ? ` — ${r.err}` : ''}`);
  }
  if (r.info) console.log(`INFO ${a.id} ${r.info}`);
}

// ── Gap report (pinned) ──
if (!QUIET) {
  for (const g of EXPECTED_GAP) {
    console.log(`GAP ${g.id} ${g.name} — ${g.reason}`);
  }
}

// ── Negative control: a second, independent fault — an assertion that bypasses WASM. ──
let bypass = null;
if (NEGATIVE_CONTROL) {
  const injected = { id: 'NC.bypass', name: 'injected: returns true without calling WASM', run: () => true };
  bypass = runOne(injected);
  console.log(`${bypass.ok ? 'PASS' : 'FAIL'} ${injected.id} ${injected.name} [${bypass.calls} wasm calls]${bypass.err ? ` — ${bypass.err}` : ''}`);
}

const runnable = RUNNABLE.length;
const gapped = EXPECTED_GAP.length;
const allPass = failures.length === 0 && (!bypass || bypass.ok);
const result = allPass ? 'PASS' : 'FAIL';

console.log(`EGPT-MATH BENCH: wasm sha256 ${wasmSha256} (dist/wasm/egpt_math_sdk_wasm_bg.wasm, ${wasmBytes.length} bytes)`);
console.log(
  `EGPT-MATH BENCH: ${counter.calls} WASM calls | ${callingWasm}/${runnable} assertions call WASM | ` +
  `structural, allow-listed at 0 calls: ${structuralIds.join(', ') || '(none)'}`
);
console.log(
  `EGPT-MATH BENCH: ${TOTAL} canonical assertions | ${runnable} runnable | ${passed}/${runnable} pass | ` +
  `${gapped} structurally-gapped (pinned) → RESULT: ${result}`
);

if (NEGATIVE_CONTROL) {
  const providerCaught = failures.length > 0;
  const bypassCaught = !bypass.ok;
  const detected = providerCaught && bypassCaught;
  console.log(
    `EGPT-MATH BENCH NEGATIVE CONTROL: broken provider (glue ${BROKEN_OP.from} → ${BROKEN_OP.to}) ` +
    `${providerCaught ? `caught by ${failures.length} failing assertion(s): ${failures.map((f) => f.id).join(', ')}` : 'NOT caught'}; ` +
    `WASM-bypass assertion NC.bypass ${bypassCaught ? 'caught' : 'NOT caught'} → CONTROL: ${detected ? 'DETECTED' : 'NOT DETECTED'}`
  );
  process.exit(detected ? 1 : 2);
}

if (!allPass) {
  console.error(`EGPT-MATH BENCH: ${failures.length} runnable assertion(s) failed: ${failures.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
process.exit(0);
