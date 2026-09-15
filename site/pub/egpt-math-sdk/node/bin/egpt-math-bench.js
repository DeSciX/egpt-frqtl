#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * bin/egpt-math-bench.js — npm `bin` wrapper for the packaged EGPT-Math canonical
 * assertion bench (ws-egpt-math-facade-bench, 2026-07-16).
 *
 * Runs COLD from the packed tarball against the package's OWN `dist` WASM surface
 * (`dist/wasm/egpt_math_sdk_wasm_bg.wasm` + glue), NEVER the JS math core — same
 * WASM-only doctrine every @descix package publishes under (CEO 2026-07-10/16). It imports `createEgptMathSdk` from the built
 * `dist/index.js`, drives the in-package golden
 * (`dist/node/bench/egpt-math-golden.mjs`) against the live wasm-math provider, and
 * prints a deterministic, machine-checkable summary line.
 *
 * The golden declares each of the 157 canonical assertions
 * (`src/editor/tests/EGPTTestSuite.js`) as RUNNABLE (re-targeted at the published
 * facade) or a PINNED structural gap. Exit 0 iff EVERY runnable assertion passes AND
 * `RUNNABLE.length + EXPECTED_GAP.length === 157` (a miscount, or a silent demotion of
 * a runnable assertion into "gapped", FAILS the bin deterministically). Exit 1 on any
 * runnable failure or count drift.
 *
 * Usage (cold, from the published package — the claude.ai one-liner):
 *   npx -y -p @descix/egpt-math-sdk egpt-math-bench --quiet
 *
 * Flags: `--quiet` suppresses the per-gap listing (keeps per-runnable PASS/FAIL + the
 * summary line); default prints the full gap report too.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUIET = process.argv.includes('--quiet');

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

const { createEgptMathSdk } = await import(pathToFileURL(distIndex).href);
const { RUNNABLE, EXPECTED_GAP, TOTAL } = await import(pathToFileURL(resolve(distDir, 'node', 'bench', 'egpt-math-golden.mjs')).href);

// ── Count golden (deterministic): the split must exactly partition the 157. ──
if (RUNNABLE.length + EXPECTED_GAP.length !== TOTAL) {
  fail(`golden count drift: ${RUNNABLE.length} runnable + ${EXPECTED_GAP.length} gapped != ${TOTAL} canonical assertions.`);
}

const sdk = await createEgptMathSdk({
  wasmUrl: pathToFileURL(wasmBinary).href,
  wasmModuleUrl: pathToFileURL(wasmModule).href,
});

if (sdk.activeMathBackend !== 'wasm-math') {
  fail(`expected wasm-math backend, got '${sdk.activeMathBackend}' — this bench runs against WASM only.`);
}

// ── Run the runnable assertions ──
let passed = 0;
const failures = [];
for (const a of RUNNABLE) {
  let ok = false;
  let err = null;
  try {
    ok = a.run(sdk) === true;
  } catch (e) {
    ok = false;
    err = e && e.message ? e.message : String(e);
  }
  if (ok) {
    passed += 1;
    console.log(`PASS ${a.id} ${a.name}`);
  } else {
    failures.push({ id: a.id, name: a.name, err });
    console.log(`FAIL ${a.id} ${a.name}${err ? ` — ${err}` : ''}`);
  }
}

// ── Gap report (pinned) ──
if (!QUIET) {
  for (const g of EXPECTED_GAP) {
    console.log(`GAP ${g.id} ${g.name} — ${g.reason}`);
  }
}

const runnable = RUNNABLE.length;
const gapped = EXPECTED_GAP.length;
const allPass = failures.length === 0;
const result = allPass ? 'PASS' : 'FAIL';

console.log(
  `EGPT-MATH BENCH: ${TOTAL} canonical assertions | ${runnable} runnable | ${passed}/${runnable} pass | ` +
  `${gapped} structurally-gapped (pinned) → RESULT: ${result}`
);

if (!allPass) {
  console.error(`EGPT-MATH BENCH: ${failures.length} runnable assertion(s) failed: ${failures.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
process.exit(0);
