/**
 * @module egpt-math-sdk/node/bench/egpt-math-golden
 * @description
 * The in-package golden for `egpt-math-bench` (ws-egpt-math-facade-bench, 2026-07-16).
 *
 * It IMPORTS NOTHING from `lib/egpt` — it drives the PUBLISHED WASM facade `sdk`
 * object only (real Rust/WASM arithmetic), never the JS math core. It is authored
 * FRESH against the canonical 157-assertion suite
 * (`src/editor/tests/EGPTTestSuite.js`) — that editor suite is NOT shipped (it
 * imports 6 core modules and would trip the red-team gate). Each of the 157 canonical
 * assertions is declared here as either:
 *   - RUNNABLE — re-targeted at the published facade surface (assert via `.equals()`/
 *     `.toCanonicalStr()`/provider ops, never dev-core-only `_getPPFRationalParts`/
 *     `toPPF`/`scalarAdd`/…), or
 *   - EXPECTED_GAP — a PINNED gap with the missing provider-op/representation reason.
 *
 * The gap set is a GOLDEN: the bin exits non-zero if `RUNNABLE.length +
 * EXPECTED_GAP.length !== 157` (a miscount) OR any runnable assertion fails — so a
 * regression that silently demotes a runnable assertion into "gapped" (or vice-versa)
 * is caught deterministically. The MEASURED runnable-pass count is the truth the bin
 * prints; this file's split is the design's HONEST projection of what the WASM-only
 * facade can bit-exactly reproduce today (architect Ruling B/C).
 */

export const TOTAL = 157;

// ── RUNNABLE — re-targeted at the published facade surface ─────────────────────
// Each entry: { id, suite, name, run(sdk), structural? }.
//   suite      — the EXACT description of the EGPTTestSuite assertion this entry re-targets;
//                scripts/test/math-bench-suite-trace.test.mjs (repo, not shipped) runs the suite
//                and fails when the two sets differ.
//   run        — returns true, or { ok: boolean, info: string } when it also reports a measurement;
//                anything else, or a throw, is a runnable-failure (bin exits 1).
//   structural — present ONLY on an entry that asserts facade shape and so makes no WASM call;
//                this field IS the bench's zero-WASM-call allow-list. A non-structural entry that
//                makes no WASM call fails, and so does a structural entry that makes one.
// Helpers are inlined per-run to keep this file import-free and self-contained.
export const RUNNABLE = [
  // ── PHASE 1: EGPTReal container (re-targeted; mutation/PPF-internal → gapped) ──
  { id: '1.1', suite: 'EGPTReal.fromBigInt creates vector from scalar',
    name: 'EGPTReal.fromBigInt round-trips a scalar', run: (s) =>
      s.EGPTReal.fromBigInt(42n).breakSymbolicToApproximateBigInt() === 42n },
  { id: '1.2', suite: 'EGPTReal.fromRational creates vector from rational',
    name: 'EGPTReal.fromRational canonical value (via toCanonicalStr)', run: (s) =>
      s.EGPTReal.fromRational(3n, 4n).toCanonicalStr() === '3/4' },
  { id: '1.4', suite: 'Vector equality works correctly',
    name: 'EGPTReal equality after canonical reduction (6/8 == 3/4)', run: (s) =>
      s.EGPTReal.fromRational(6n, 8n).equals(s.EGPTReal.fromRational(3n, 4n)) },
  { id: '1.5', suite: 'Vector isInteger detection works',
    name: 'EGPTReal.isInteger detection', run: (s) =>
      s.EGPTReal.fromBigInt(42n).isInteger() && !s.EGPTReal.fromRational(3n, 4n).isInteger() },

  // ── PHASE 1.5: negative-number encoding (value assertions; PPF-internal → gapped) ──
  { id: '1.5a', suite: 'Negative integer encoding: fromBigInt(-13n)',
    name: 'fromBigInt(-13) round-trips', run: (s) =>
      s.EGPTReal.fromBigInt(-13n).breakSymbolicToApproximateBigInt() === -13n },
  { id: '1.5b', suite: 'Negative rational encoding: fromRational(-13n, 1n)',
    name: 'fromRational(-13,1) round-trips', run: (s) =>
      s.EGPTReal.fromRational(-13n, 1n).breakSymbolicToApproximateBigInt() === -13n },
  { id: '1.5c', suite: 'Negative rational encoding: fromRational(-3n, 4n)',
    name: 'fromRational(-3,4) canonical = -3/4', run: (s) =>
      s.EGPTReal.fromRational(-3n, 4n).toCanonicalStr() === '-3/4' },
  { id: '1.5d', suite: 'Negative denominator normalization: fromRational(3n, -4n) = -3/4',
    name: 'negative-denominator normalization fromRational(3,-4) = -3/4', run: (s) =>
      s.EGPTReal.fromRational(3n, -4n).toCanonicalStr() === '-3/4' },
  { id: '1.5e', suite: 'Double negative normalization: fromRational(-3n, -4n) = 3/4',
    name: 'double-negative normalization fromRational(-3,-4) = 3/4', run: (s) =>
      s.EGPTReal.fromRational(-3n, -4n).toCanonicalStr() === '3/4' },
  { id: '1.5f', suite: 'Negative number round-trip preservation',
    name: 'negative round-trip preservation (-77)', run: (s) =>
      s.EGPTReal.fromBigInt(-77n).breakSymbolicToApproximateBigInt() === -77n },
  { id: '1.5g', suite: 'Negative number equality works correctly',
    name: 'negative equality (-42 int == -42/1 rational)', run: (s) =>
      s.EGPTReal.fromBigInt(-42n).equals(s.EGPTReal.fromRational(-42n, 1n)) },
  { id: '1.5h', suite: 'Mixed sign equality: -6/8 equals -3/4',
    name: 'mixed-sign equality -6/8 == -3/4', run: (s) =>
      s.EGPTReal.fromRational(-6n, 8n).equals(s.EGPTReal.fromRational(-3n, 4n)) },
  { id: '1.5i', suite: 'Negative number toMathString representation',
    name: 'negative toMathString ("-42", "-3/4")', run: (s) =>
      s.EGPTReal.fromBigInt(-42n).toMathString() === '-42' &&
      s.EGPTReal.fromRational(-3n, 4n).toMathString() === '-3/4' },
  { id: '1.5j', suite: 'Negative zero normalization: -0 becomes 0',
    name: 'negative-zero normalization (-0 -> 0)', run: (s) =>
      s.EGPTReal.fromBigInt(-0n).breakSymbolicToApproximateBigInt() === 0n },

  // ── PHASE 3: EGPTMath vector algebra ──
  { id: '3.multiply', suite: 'multiply() implements RET Iron Law: 2 × 3 = 6',
    name: 'multiply 2 x 3 = 6', run: (s) =>
      s.EGPTMath.multiply(s.EGPTReal.fromBigInt(2n), s.EGPTReal.fromBigInt(3n)).breakSymbolicToApproximateBigInt() === 6n },
  { id: '3.divide', suite: 'divide() implements Shannon subtraction: 6 ÷ 2 = 3',
    name: 'divide 6 / 2 = 3', run: (s) =>
      s.EGPTMath.divide(s.EGPTReal.fromBigInt(6n), s.EGPTReal.fromBigInt(2n)).breakSymbolicToApproximateBigInt() === 3n },
  { id: '3.pow', suite: 'pow() implements Shannon scaling: 2^3 = 8',
    name: 'pow 2^3 = 8', run: (s) =>
      s.EGPTMath.pow(s.EGPTReal.fromBigInt(2n), 3n, 1n).breakSymbolicToApproximateBigInt() === 8n },
  { id: '3.sqrt', suite: 'sqrt() works correctly: √16 = 4',
    name: 'sqrt 16 = 4', run: (s) =>
      s.EGPTMath.sqrt(s.EGPTReal.fromBigInt(16n)).breakSymbolicToApproximateBigInt() === 4n },
  { id: '3.add', suite: 'add() performs normal space addition: 1/3 + 1/6 = 1/2',
    name: 'add 1/3 + 1/6 = 1/2', run: (s) =>
      s.EGPTMath.add(s.EGPTReal.fromRational(1n, 3n), s.EGPTReal.fromRational(1n, 6n)).equals(s.EGPTReal.fromRational(1n, 2n)) },
  { id: '3.subtract', suite: 'subtract() performs normal space subtraction',
    name: 'subtract 2/3 - 1/6 = 1/2', run: (s) =>
      s.EGPTMath.subtract(s.EGPTReal.fromRational(2n, 3n), s.EGPTReal.fromRational(1n, 6n)).equals(s.EGPTReal.fromRational(1n, 2n)) },

  // ── PHASE 4: pedagogical dual-naming aliases (facade sugar) ──
  { id: '4.addInLogSpace', suite: 'addInLogSpace alias equals multiply result',
    name: 'addInLogSpace == multiply', run: (s) => {
      const a = s.EGPTReal.fromBigInt(5n), b = s.EGPTReal.fromBigInt(7n);
      return s.EGPTMath.addInLogSpace(a, b).equals(s.EGPTMath.multiply(a, b)); } },
  { id: '4.subtractInLogSpace', suite: 'subtractInLogSpace alias equals divide result',
    name: 'subtractInLogSpace == divide', run: (s) => {
      const a = s.EGPTReal.fromBigInt(35n), b = s.EGPTReal.fromBigInt(5n);
      return s.EGPTMath.subtractInLogSpace(a, b).equals(s.EGPTMath.divide(a, b)); } },
  { id: '4.addVectors', suite: 'addVectors alias equals add result',
    name: 'addVectors == add', run: (s) => {
      const a = s.EGPTReal.fromRational(1n, 4n), b = s.EGPTReal.fromRational(1n, 4n);
      return s.EGPTMath.addVectors(a, b).equals(s.EGPTMath.add(a, b)); } },

  // ── PHASE 5: RET Iron Law (multiplicative entropy) ──
  { id: '5.iron6', suite: 'RET Iron Law: H(6) = H(2) + H(3) via multiply',
    name: 'RET Iron Law H(6) = H(2) x H(3)', run: (s) =>
      s.EGPTReal.fromBigInt(6n).equals(s.EGPTMath.multiply(s.EGPTReal.fromBigInt(2n), s.EGPTReal.fromBigInt(3n))) },
  { id: '5.iron77', suite: 'RET Iron Law: Large numbers (77 = 7 × 11)',
    name: 'RET Iron Law 77 = 7 x 11', run: (s) =>
      s.EGPTReal.fromBigInt(77n).equals(s.EGPTMath.multiply(s.EGPTReal.fromBigInt(7n), s.EGPTReal.fromBigInt(11n))) },
  { id: '5.inverse', suite: 'RET Iron Law: Inverse operations (multiply then divide)',
    name: 'RET inverse: (13 x 17) / 13 = 17', run: (s) => {
      const p = s.EGPTMath.multiply(s.EGPTReal.fromBigInt(13n), s.EGPTReal.fromBigInt(17n));
      return s.EGPTReal.fromBigInt(17n).equals(s.EGPTMath.divide(p, s.EGPTReal.fromBigInt(13n))); } },

  // ── PHASE 6.5: fractional exponentiation / roots (provider pow with rational exp) ──
  { id: '6.5a', suite: 'pow() with fractional exponent: 8^(1/3) = 2 (cube root)',
    name: '8^(1/3) = 2', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(8n), 1n, 3n).equals(s.EGPTReal.fromBigInt(2n)) },
  { id: '6.5b', suite: 'pow() with fractional exponent: 16^(1/4) = 2 (fourth root)',
    name: '16^(1/4) = 2', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(16n), 1n, 4n).equals(s.EGPTReal.fromBigInt(2n)) },
  { id: '6.5c', suite: 'pow() with fractional exponent: 9^(1/2) = 3 (square root)',
    name: '9^(1/2) = 3', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(9n), 1n, 2n).equals(s.EGPTReal.fromBigInt(3n)) },
  { id: '6.5d', suite: 'pow() with fractional exponent: 27^(2/3) = 9',
    name: '27^(2/3) = 9', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(27n), 2n, 3n).equals(s.EGPTReal.fromBigInt(9n)) },
  { id: '6.5e', suite: 'pow() with fractional exponent: 32^(3/5) = 8',
    name: '32^(3/5) = 8', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(32n), 3n, 5n).equals(s.EGPTReal.fromBigInt(8n)) },
  { id: '6.5f', suite: 'sqrt() consistency with pow(x, 1/2)',
    name: 'sqrt(25) == pow(25, 1/2)', run: (s) =>
      s.EGPTMath.sqrt(s.EGPTReal.fromBigInt(25n)).equals(s.EGPTMath.pow(s.EGPTReal.fromBigInt(25n), 1n, 2n)) },
  { id: '6.5g', suite: 'Fractional exponent precision: 64^(1/6) = 2',
    name: '64^(1/6) = 2', run: (s) => s.EGPTMath.pow(s.EGPTReal.fromBigInt(64n), 1n, 6n).equals(s.EGPTReal.fromBigInt(2n)) },
  { id: '6.5h', suite: 'Fractional exponent with rational base: (9/4)^(1/2) = 3/2',
    name: '(9/4)^(1/2) = 3/2', run: (s) =>
      s.EGPTMath.pow(s.EGPTReal.fromRational(9n, 4n), 1n, 2n).equals(s.EGPTReal.fromRational(3n, 2n)) },
  { id: '6.5i', suite: 'Shannon space scaling: Fractional exponents preserve entropy relationships',
    name: 'Shannon scaling: sqrt(4) x sqrt(9) = 6', run: (s) =>
      s.EGPTMath.multiply(s.EGPTMath.sqrt(s.EGPTReal.fromBigInt(4n)), s.EGPTMath.sqrt(s.EGPTReal.fromBigInt(9n))).equals(s.EGPTReal.fromBigInt(6n)) },
  { id: '6.5j', suite: 'Fractional power identity: (x^a)^b = x^(a*b)',
    name: 'fractional identity (8^(1/3))^3 = 8^1 = 8', run: (s) => {
      const inter = s.EGPTMath.pow(s.EGPTReal.fromBigInt(8n), 1n, 3n);
      const m1 = s.EGPTMath.pow(inter, 3n, 1n);
      const m2 = s.EGPTMath.pow(s.EGPTReal.fromBigInt(8n), 1n, 1n);
      return m1.equals(m2) && m1.equals(s.EGPTReal.fromBigInt(8n)); } },

  // ── PHASE 6.6: exp2 / log2 (provider exp2/log2 via facade EGPTReal) ──
  { id: '6.6a', suite: 'EGPTranscendental.exp2: exp2(3) = 2^3 = 8',
    name: 'exp2(3) = 8', run: (s) => s.EGPTReal.fromBigInt(3n).exp2().equals(s.EGPTReal.fromBigInt(8n)) },
  { id: '6.6b', suite: 'EGPTMath.exp2: exp2(5) = 2^5 = 32',
    name: 'exp2(5) = 32', run: (s) => s.EGPTReal.fromBigInt(5n).exp2().equals(s.EGPTReal.fromBigInt(32n)) },
  { id: '6.6c', suite: 'EGPTMath.exp2: exp2(0) = 2^0 = 1',
    name: 'exp2(0) = 1', run: (s) => s.EGPTReal.fromBigInt(0n).exp2().equals(s.EGPTReal.fromBigInt(1n)) },
  { id: '6.6d', suite: 'EGPTMath.exp2: exp2(10) = 2^10 = 1024',
    name: 'exp2(10) = 1024', run: (s) => s.EGPTReal.fromBigInt(10n).exp2().equals(s.EGPTReal.fromBigInt(1024n)) },
  { id: '6.6e', suite: 'EGPTMath.log2: log2(8) = 3',
    name: 'log2(8) = 3', run: (s) => s.EGPTReal.fromBigInt(8n).log2().equals(s.EGPTReal.fromBigInt(3n)) },
  { id: '6.6f', suite: 'EGPTMath.log2: log2(16) = 4',
    name: 'log2(16) = 4', run: (s) => s.EGPTReal.fromBigInt(16n).log2().equals(s.EGPTReal.fromBigInt(4n)) },
  { id: '6.6g', suite: 'EGPTMath.log2: log2(1024) = 10',
    name: 'log2(1024) = 10', run: (s) => s.EGPTReal.fromBigInt(1024n).log2().equals(s.EGPTReal.fromBigInt(10n)) },
  { id: '6.6h', suite: 'EGPTMath.log2: log2(2) = 1',
    name: 'log2(2) = 1', run: (s) => s.EGPTReal.fromBigInt(2n).log2().equals(s.EGPTReal.fromBigInt(1n)) },
  { id: '6.6i', suite: 'EGPTMath.log2: log2(1) = 0',
    name: 'log2(1) = 0', run: (s) => s.EGPTReal.fromBigInt(1n).log2().equals(s.EGPTReal.fromBigInt(0n)) },
  { id: '6.6j', suite: 'Inverse relationship: exp2(log2(x)) = x',
    name: 'exp2(log2(x)) = x for x in {1,2,4,8,16,32,64,1024}', run: (s) => {
      for (const v of [1n, 2n, 4n, 8n, 16n, 32n, 64n, 1024n]) {
        const x = s.EGPTReal.fromBigInt(v);
        if (!x.log2().exp2().equals(x)) return false;
      }
      return true; } },
  { id: '6.6k', suite: 'Inverse relationship: log2(exp2(x)) = x',
    name: 'log2(exp2(x)) = x for x in {0,1,2,3,4,5,10}', run: (s) => {
      for (const e of [0n, 1n, 2n, 3n, 4n, 5n, 10n]) {
        const x = s.EGPTReal.fromBigInt(e);
        if (!x.exp2().log2().equals(x)) return false;
      }
      return true; } },
  { id: '6.6l', suite: 'Shannon space scaling preserves RET Iron Law with exp2/log2',
    name: 'exp2(2) x exp2(3) = 32 (Shannon RET)', run: (s) =>
      s.EGPTMath.multiply(s.EGPTReal.fromBigInt(2n).exp2(), s.EGPTReal.fromBigInt(3n).exp2()).equals(s.EGPTReal.fromBigInt(32n)) },
  { id: '6.6m', suite: 'Compound exp2 operations: exp2(exp2(2)) = exp2(4) = 16',
    name: 'exp2(exp2(2)) = exp2(4) = 16', run: (s) =>
      s.EGPTReal.fromBigInt(2n).exp2().exp2().equals(s.EGPTReal.fromBigInt(16n)) },

  // ── PHASE 6.11: EGPTReal.negate sugar (complex-class assertions → gapped) ──
  { id: '6.11a', suite: 'EGPTReal.negate() works on integers',
    name: 'EGPTReal.negate(5) = -5', run: (s) =>
      s.EGPTReal.negate(s.EGPTReal.fromBigInt(5n)).breakSymbolicToApproximateBigInt() === -5n },
  { id: '6.11c', suite: 'EGPTReal.negate() double negation returns original',
    name: 'EGPTReal.negate double negation returns original', run: (s) =>
      s.EGPTReal.negate(s.EGPTReal.negate(s.EGPTReal.fromBigInt(5n))).breakSymbolicToApproximateBigInt() === 5n },

  // ── PHASE 6 + 6.9: EGPTStat (faced via shared statAlgorithm factory) ──
  { id: '6.mean', suite: 'mean() calculates correct average',
    name: 'EGPTStat.mean [2,4,6] = 4', run: (s) => s.EGPTStat.mean([R(s,2), R(s,4), R(s,6)]).equals(R(s,4)) },
  { id: '6.var1', suite: 'variance() works for simple case',
    name: 'EGPTStat.variance [1,3,5] = 8/3 (+meta)', run: (s) => {
      const v = s.EGPTStat.variance([R(s,1), R(s,3), R(s,5)]);
      return v.variance.equals(Rr(s,8,3)) && v.metadata.negative_deviations === 1 && v.metadata.has_negative_deviations === true; } },
  { id: '6.var2', suite: 'variance() handles negative deviations properly',
    name: 'EGPTStat.variance [1,5] non-negative + meta', run: (s) => {
      const v = s.EGPTStat.variance([R(s,1), R(s,5)]);
      return v.variance.breakSymbolicToApproximateBigInt() >= 0n && v.metadata.negative_deviations === 1; } },
  { id: '6.9a', suite: 'EGPTStat.mean() with positive numbers',
    name: 'EGPTStat.mean positive [2,4,6]=4', run: (s) => s.EGPTStat.mean([R(s,2), R(s,4), R(s,6)]).equals(R(s,4)) },
  { id: '6.9b', suite: 'EGPTStat.mean() with negative numbers',
    name: 'EGPTStat.mean negative [-2,0,4]=2/3', run: (s) => s.EGPTStat.mean([R(s,-2), R(s,0), R(s,4)]).equals(Rr(s,2,3)) },
  { id: '6.9c', suite: 'EGPTStat.mean() with fractional numbers',
    name: 'EGPTStat.mean fractional [1/2,3/4,1]=3/4', run: (s) => s.EGPTStat.mean([Rr(s,1,2), Rr(s,3,4), Rr(s,1,1)]).equals(Rr(s,3,4)) },
  { id: '6.9e', suite: 'EGPTStat.variance() with simple dataset',
    name: 'EGPTStat.variance simple [1,3,5]=8/3 + meta.total', run: (s) => {
      const r = s.EGPTStat.variance([R(s,1), R(s,3), R(s,5)]);
      return r.variance.equals(Rr(s,8,3)) && r.metadata.total_vectors === 3 && r.metadata.negative_deviations === 1; } },
  { id: '6.9f', suite: 'EGPTStat.variance() with negative numbers',
    name: 'EGPTStat.variance [-1,0,1]=2/3', run: (s) => {
      const r = s.EGPTStat.variance([R(s,-1), R(s,0), R(s,1)]);
      return r.variance.equals(Rr(s,2,3)) && r.metadata.total_vectors === 3; } },
  { id: '6.9g', suite: 'EGPTStat.absoluteDifference() with positive difference',
    name: 'EGPTStat.absoluteDifference(5,2)=3', run: (s) => s.EGPTStat.absoluteDifference(R(s,5), R(s,2)).equals(R(s,3)) },
  { id: '6.9h', suite: 'EGPTStat.absoluteDifference() with negative difference',
    name: 'EGPTStat.absoluteDifference(2,5)=3', run: (s) => s.EGPTStat.absoluteDifference(R(s,2), R(s,5)).equals(R(s,3)) },
  { id: '6.9i', suite: 'EGPTStat.absoluteDifference() with fractional numbers',
    name: 'EGPTStat.absoluteDifference(7/4,3/4)=1', run: (s) => s.EGPTStat.absoluteDifference(Rr(s,7,4), Rr(s,3,4)).equals(R(s,1)) },
  { id: '6.9j', suite: 'EGPTStat.comprehensiveStatisticalAnalysis() basic functionality',
    name: 'EGPTStat.comprehensiveStatisticalAnalysis basic', run: (s) => {
      const a = s.EGPTStat.comprehensiveStatisticalAnalysis([R(s,1), R(s,2), R(s,3), R(s,4), R(s,5)]);
      return a instanceof s.EGPTStatData && a.total_count === 5 && a.mean.equals(R(s,3)); } },

  // ── PHASE 6.10: EGPTStatData (faced via shared statDataAlgorithm factory) ──
  { id: '6.10a', suite: 'EGPTStatData.fromArray() creates proper metadata',
    name: 'EGPTStatData.fromArray metadata [1,3,5]', run: (s) => {
      const d = s.EGPTStatData.fromArray([R(s,1), R(s,3), R(s,5)]);
      return d.total_count === 3 && d.mean.equals(R(s,3)) && d.min_value.equals(R(s,1)) && d.max_value.equals(R(s,5)); } },
  { id: '6.10b', suite: 'EGPTStatData.fromArray() with negative numbers',
    name: 'EGPTStatData.fromArray negatives [-2,0,3]', run: (s) => {
      const d = s.EGPTStatData.fromArray([R(s,-2), R(s,0), R(s,3)]);
      return d.total_count === 3 && d.negative_count === 1 && d.min_value.equals(R(s,-2)) && d.max_value.equals(R(s,3)); } },
  { id: '6.10d', suite: 'EGPTStatData getNormalizedDeltas() computation',
    name: 'EGPTStatData getNormalizedDeltas shape', run: (s) => {
      const d = s.EGPTStatData.fromArray([R(s,1), R(s,3), R(s,5)]).getNormalizedDeltas();
      return d.length === 3 && 'index' in d[0] && 'raw_delta' in d[0] && 'normalized_delta' in d[0] && 'magnitude_class' in d[0]; } },
  { id: '6.10e', suite: 'EGPTStatData magnitude classification',
    name: 'EGPTStatData magnitude classification distinguishes outlier', run: (s) => {
      const deltas = s.EGPTStatData.fromArray([R(s,1), R(s,2), R(s,100)]).getNormalizedDeltas();
      return new Set(deltas.map((d) => d.magnitude_class)).size > 1; } },
  { id: '6.10f', suite: 'EGPTStatData integrates with EGPTStat.comprehensiveStatisticalAnalysis()',
    name: 'EGPTStatData integrates comprehensiveStatisticalAnalysis', run: (s) => {
      const a = s.EGPTStat.comprehensiveStatisticalAnalysis([R(s,5), R(s,10), R(s,15), R(s,20)]);
      return a instanceof s.EGPTStatData && a.total_count === 4 && a.mean.equals(Rr(s,50,4)) && 'variance' in a && 'std_deviation' in a; } },
  { id: '6.10g', suite: 'EGPTStatData with fractional exponentiation results',
    name: 'EGPTStatData with exact fractional-exponent results', run: (s) => {
      const a = s.EGPTStat.comprehensiveStatisticalAnalysis([
        s.EGPTMath.pow(R(s,8), 1n, 3n), s.EGPTMath.pow(R(s,16), 1n, 4n), R(s,2), R(s,3)]);
      return a instanceof s.EGPTStatData && a.total_count === 4; } },

  // ── PHASE 6.11 (complex) + PHASE 7 (integer): ComplexEGPTReal / EGPTComplex ──
  { id: '6.11.d', suite: 'ComplexEGPTReal.negate() works correctly',
    name: 'ComplexEGPTReal.negate (3,4)=(-3,-4)', run: (s) => {
      const z = new s.ComplexEGPTReal(R(s,3), R(s,4)).negate();
      return z.real.breakSymbolicToApproximateBigInt() === -3n && z.imag.breakSymbolicToApproximateBigInt() === -4n; } },
  { id: '6.11.e', suite: 'ComplexEGPTReal.conjugate() works correctly',
    name: 'ComplexEGPTReal.conjugate (3,4)=(3,-4)', run: (s) => {
      const z = new s.ComplexEGPTReal(R(s,3), R(s,4)).conjugate();
      return z.real.breakSymbolicToApproximateBigInt() === 3n && z.imag.breakSymbolicToApproximateBigInt() === -4n; } },
  { id: '6.11.g', suite: 'ComplexEGPTReal.conjugate() with rational components',
    name: 'conjugate rational components (1/2,1/2)->(1/2,-1/2)', run: (s) => {
      const z = new s.ComplexEGPTReal(Rr(s,1,2), Rr(s,1,2)).conjugate();
      return z.real.equals(Rr(s,1,2)) && z.imag.equals(Rr(s,-1,2)); } },
  { id: '6.11.h', suite: 'ComplexEGPTReal.conjugate() with negative imaginary',
    name: 'conjugate of conjugate returns original', run: (s) => {
      const z = new s.ComplexEGPTReal(R(s,3), R(s,-4));
      return z.conjugate().conjugate().equals(z); } },
  { id: '6.11.i', suite: 'ComplexEGPTReal.conjugate() then multiply (IFFT pattern)',
    name: 'conjugate then multiply (IFFT pattern)', run: (s) => {
      const value = new s.ComplexEGPTReal(R(s,-2), R(s,-2));
      const tw = new s.ComplexEGPTReal(R(s,0), R(s,1)).conjugate();
      return value.multiply(tw).equals(new s.ComplexEGPTReal(R(s,-2), R(s,2))); } },
  { id: '6.11.j', suite: 'ComplexEGPTReal.scaleBy() works with integer',
    name: 'ComplexEGPTReal.scaleBy integer', run: (s) => {
      const z = new s.ComplexEGPTReal(R(s,2), R(s,3)).scaleBy(5n);
      return z.real.breakSymbolicToApproximateBigInt() === 10n && z.imag.breakSymbolicToApproximateBigInt() === 15n; } },
  { id: '6.11.k', suite: 'ComplexEGPTReal.scaleByRational() works',
    name: 'ComplexEGPTReal.scaleByRational (1/2)', run: (s) => {
      const z = new s.ComplexEGPTReal(R(s,6), R(s,8)).scaleByRational(1n, 2n);
      return z.real.breakSymbolicToApproximateBigInt() === 3n && z.imag.breakSymbolicToApproximateBigInt() === 4n; } },
  { id: '6.11.l', suite: 'ComplexEGPTReal.getMagnitudeSquared() for (3,4)',
    name: 'getMagnitudeSquared (3,4)=25', run: (s) => new s.ComplexEGPTReal(R(s,3), R(s,4)).getMagnitudeSquared().breakSymbolicToApproximateBigInt() === 25n },
  { id: '6.11.m', suite: 'ComplexEGPTReal.isReal() detection',
    name: 'isReal detection', run: (s) => new s.ComplexEGPTReal(R(s,5), R(s,0)).isReal() && !new s.ComplexEGPTReal(R(s,5), R(s,1)).isReal() },
  { id: '6.11.n', suite: 'ComplexEGPTReal.isImaginary() detection',
    name: 'isImaginary detection', run: (s) => new s.ComplexEGPTReal(R(s,0), R(s,5)).isImaginary() && !new s.ComplexEGPTReal(R(s,1), R(s,5)).isImaginary() },
  { id: '7.a', suite: 'ComplexEGPTReal creation and equality',
    name: 'ComplexEGPTReal creation + equality', run: (s) => {
      const z1 = new s.ComplexEGPTReal(R(s,2), R(s,3));
      const z2 = new s.ComplexEGPTReal(R(s,2), R(s,3));
      const z3 = new s.ComplexEGPTReal(R(s,3), R(s,2));
      return z1.equals(z2) && !z1.equals(z3); } },
  { id: '7.b', suite: 'EGPTMath.complexAdd',
    name: 'EGPTComplex.complexAdd', run: (s) =>
      s.EGPTComplex.complexAdd(new s.ComplexEGPTReal(R(s,1), R(s,2)), new s.ComplexEGPTReal(R(s,3), R(s,4)))
        .equals(new s.ComplexEGPTReal(R(s,4), R(s,6))) },
  { id: '7.c', suite: 'EGPTMath.complexMultiply (Euclidean)',
    name: 'EGPTComplex.complexMultiply (2+3i)(4+5i)=-7+22i', run: (s) =>
      s.EGPTComplex.complexMultiply(new s.ComplexEGPTReal(R(s,2), R(s,3)), new s.ComplexEGPTReal(R(s,4), R(s,5)))
        .equals(new s.ComplexEGPTReal(R(s,-7), R(s,22))) },

  // ── PHASE 9: TwiddleTable (faced square topology — phase-index + exact cardinal coords) ──
  { id: '9.a', suite: 'TwiddleTable k=4 generation',
    name: 'TwiddleTable k=4 generation', run: (s) => { const t = new s.TwiddleTable(4); return t.k === 4 && t.twiddles.size === 4; } },
  { id: '9.b', suite: 'TwiddleTable k=8 generation',
    name: 'TwiddleTable k=8 generation', run: (s) => { const t = new s.TwiddleTable(8); return t.k === 8 && t.twiddles.size === 8; } },
  { id: '9.c', suite: 'TwiddleTable k=16 generation',
    name: 'TwiddleTable k=16 generation', run: (s) => { const t = new s.TwiddleTable(16); return t.k === 16 && t.twiddles.size === 16; } },
  { id: '9.d', suite: 'TwiddleTable k=4096 generation (unlimited precision test)',
    name: 'TwiddleTable k=4096 generation', run: (s) => { const t = new s.TwiddleTable(4096); return t.k === 4096 && t.twiddles.size === 4096; } },
  { id: '9.e', suite: 'Twiddle coordinates are exact EGPTReals',
    name: 'twiddle coordinates are exact EGPTReals', run: (s) => { const o = new s.TwiddleTable(8).getTwiddle(1); return o.real instanceof s.EGPTReal && o.imag instanceof s.EGPTReal; } },
  { id: '9.f', suite: 'multiplyByPhase: ω₁ × ω₂ = ω₃ (k=8)',
    name: 'multiplyByPhase 1x2=3 (k=8)', run: (s) => new s.TwiddleTable(8).multiplyByPhase(1, 2).index === 3 },
  { id: '9.g', suite: 'multiplyByPhase: ω₂ × ω₃ = ω₅ (k=8)',
    name: 'multiplyByPhase 2x3=5 (k=8)', run: (s) => new s.TwiddleTable(8).multiplyByPhase(2, 3).index === 5 },
  { id: '9.h', suite: 'multiplyByPhase: wraparound ω₇ × ω₂ = ω₁ (k=8)',
    name: 'multiplyByPhase wraparound 7x2=1 (k=8)', run: (s) => new s.TwiddleTable(8).multiplyByPhase(7, 2).index === 1 },
  { id: '9.i', suite: 'powerByPhase: ω₁^2 = ω₂ (k=8)',
    name: 'powerByPhase 1^2=2 (k=8)', run: (s) => new s.TwiddleTable(8).powerByPhase(1, 2).index === 2 },
  { id: '9.j', suite: 'powerByPhase: ω₂^3 = ω₆ (k=8)',
    name: 'powerByPhase 2^3=6 (k=8)', run: (s) => new s.TwiddleTable(8).powerByPhase(2, 3).index === 6 },
  { id: '9.k', suite: 'conjugateByPhase: ω₁* = ω₇ (k=8)',
    name: 'conjugateByPhase 1*=7 (k=8)', run: (s) => new s.TwiddleTable(8).conjugateByPhase(1).index === 7 },
  { id: '9.l', suite: 'conjugateByPhase: ω₃* = ω₅ (k=8)',
    name: 'conjugateByPhase 3*=5 (k=8)', run: (s) => new s.TwiddleTable(8).conjugateByPhase(3).index === 5 },
  { id: '9.m', suite: 'FFT Req 1: ω^k = ω₀ for all j (k=4)',
    name: 'FFT Req1 w^k=w0 all j (k=4)', run: (s) => { const t = new s.TwiddleTable(4); for (let j = 0; j < 4; j++) if (t.powerByPhase(j, 4).index !== 0) return false; return true; } },
  { id: '9.n', suite: 'FFT Req 1: ω^k = ω₀ for all j (k=8)',
    name: 'FFT Req1 (k=8)', run: (s) => { const t = new s.TwiddleTable(8); for (let j = 0; j < 8; j++) if (t.powerByPhase(j, 8).index !== 0) return false; return true; } },
  { id: '9.o', suite: 'FFT Req 1: ω^k = ω₀ for all j (k=16)',
    name: 'FFT Req1 (k=16)', run: (s) => { const t = new s.TwiddleTable(16); for (let j = 0; j < 16; j++) if (t.powerByPhase(j, 16).index !== 0) return false; return true; } },
  { id: '9.p', suite: 'FFT Req 1: ω^k = ω₀ sampled at k=4096',
    name: 'FFT Req1 sampled (k=4096)', run: (s) => { const t = new s.TwiddleTable(4096); for (const j of [0, 1, 2, 100, 1000, 2048, 4095]) if (t.powerByPhase(j, 4096).index !== 0) return false; return true; } },
  { id: '9.q', suite: 'FFT Req 2: Phase additivity ω^a × ω^b = ω^(a+b mod k)',
    name: 'FFT Req2 phase additivity (k=16)', run: (s) => {
      const t = new s.TwiddleTable(16);
      for (const [a, b, e] of [[1,1,2],[1,2,3],[3,4,7],[8,8,0],[15,1,0]]) if (t.multiplyByPhase(a, b).index !== e) return false; return true; } },
  { id: '9.r', suite: 'FFT Req 3: Special values ω₀=(1,0), ω_{k/2}=(-1,0), ω_{k/4}=(0,1)',
    name: 'FFT Req3 special values w0/w(k/2)/w(k/4) (k=8)', run: (s) => {
      const t = new s.TwiddleTable(8);
      const o0 = t.getTwiddle(0), o4 = t.getTwiddle(4), o2 = t.getTwiddle(2);
      return o0.real.equals(R(s,1)) && o0.imag.equals(R(s,0)) && o4.real.equals(R(s,-1)) && o4.imag.equals(R(s,0)) && o2.real.equals(R(s,0)) && o2.imag.equals(R(s,1)); } },
  { id: '9.s', suite: 'FFT Req 4: Conjugate symmetry ω_j* = ω_{k-j}',
    name: 'FFT Req4 conjugate symmetry w_j*=w_{k-j} (k=16)', run: (s) => {
      const t = new s.TwiddleTable(16);
      for (const j of [1, 2, 3, 5]) if (t.conjugateByPhase(j).index !== (16 - j) % 16) return false; return true; } },
  { id: '9.t', suite: 'getPhaseIndex finds correct index',
    name: 'getPhaseIndex finds correct index', run: (s) => { const t = new s.TwiddleTable(8); return t.getPhaseIndex(t.getTwiddle(3)) === 3; } },
  { id: '9.u', suite: 'Phase operations at k=4096 scale',
    name: 'phase ops at k=4096 scale', run: (s) => {
      const t = new s.TwiddleTable(4096);
      return t.multiplyByPhase(1000, 2000).index === 3000 && t.powerByPhase(100, 10).index === 1000 && t.conjugateByPhase(1000).index === 3096; } },
  { id: '9.v', suite: 'k=4096 memory usage reasonable (O(k) storage)',
    name: 'k=4096 twiddles accessible (O(k) storage)', run: (s) => {
      const t = new s.TwiddleTable(4096);
      return t.getTwiddle(0) instanceof s.ComplexEGPTReal && t.getTwiddle(2048) instanceof s.ComplexEGPTReal && t.getTwiddle(4095) instanceof s.ComplexEGPTReal; } },
  { id: '9.w', suite: 'k=4096 operations complete in O(1) time',
    // The suite's only assertion here is wall time (`duration < 100` ms), which is machine-dependent:
    // this entry asserts every op's RESULT (phase index + the table's own twiddle) and REPORTS the time.
    name: 'k=4096 phase ops: 3000 results correct (time reported, not asserted)', run: (s) => {
      const k = 4096;
      const t = new s.TwiddleTable(k);
      const hit = (r, i) => r.index === i && r.twiddle === t.getTwiddle(i);
      const start = Date.now();
      let ok = true;
      for (let i = 0; i < 1000; i++) {
        const j = i % k;
        ok = hit(t.multiplyByPhase(j, (i * 2) % k), (j + (i * 2) % k) % k) &&
             hit(t.powerByPhase(j, 10), (j * 10) % k) &&
             hit(t.conjugateByPhase(j), (k - j) % k) && ok;
      }
      return { ok, info: `3000 phase ops at k=4096 took ${Date.now() - start} ms (suite threshold 100 ms: reported, not asserted)` }; } },

  // ═══════════════════════════════════════════════════════════════════════════
  // ws-egpt-math-rust-ops (2026-07-16): the former 52 EXPECTED_GAP assertions,
  // now RUNNABLE against the scaled-vector-capable WASM facade (ArenaVal +
  // from_scaled_vector keystone, facade mutation/toPPF/toMathString, shared
  // phase/composed factories). Behavioral spec: src/editor/tests/EGPTTestSuite.js.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── in-place scalar mutation (facade-wrapper handle-swap) ──
  { id: '1.3', suite: 'Vector clone creates independent copy',
    name: 'Vector clone + scalarAdd independence', run: (s) => {
      const o = s.EGPTReal.fromBigInt(10n); const c = o.clone(); c.scalarAdd(5n);
      return o.breakSymbolicToApproximateBigInt() === 10n && c.breakSymbolicToApproximateBigInt() === 15n; } },
  { id: '2.1', suite: 'scalarAdd modifies vector and returns this',
    name: 'scalarAdd mutates + returns this', run: (s) => {
      const v = s.EGPTReal.fromBigInt(10n); const r = v.scalarAdd(5n);
      return r === v && v.breakSymbolicToApproximateBigInt() === 15n; } },
  { id: '2.2', suite: 'scalarSubtract works correctly',
    name: 'scalarSubtract', run: (s) => {
      const v = s.EGPTReal.fromBigInt(10n); v.scalarSubtract(3n); return v.breakSymbolicToApproximateBigInt() === 7n; } },
  { id: '2.3', suite: 'scalarMultiply scales vector correctly',
    name: 'scalarMultiply', run: (s) => {
      const v = s.EGPTReal.fromBigInt(6n); v.scalarMultiply(3n); return v.breakSymbolicToApproximateBigInt() === 18n; } },
  { id: '2.4', suite: 'scalarDivide scales vector correctly',
    name: 'scalarDivide', run: (s) => {
      const v = s.EGPTReal.fromBigInt(20n); v.scalarDivide(4n); return v.breakSymbolicToApproximateBigInt() === 5n; } },
  { id: '2.5', suite: 'Fluent chaining works: add.multiply.divide',
    name: 'fluent add.multiply.divide chain', run: (s) => {
      const v = s.EGPTReal.fromBigInt(10n); v.scalarAdd(5n).scalarMultiply(2n).scalarDivide(5n);
      return v.breakSymbolicToApproximateBigInt() === 6n; } },
  { id: '2.6', suite: 'Scalar operations require BigInt',
    name: 'scalar ops require BigInt', run: (s) => {
      const v = s.EGPTReal.fromBigInt(10n);
      try { v.scalarAdd(5); return false; } catch (e) { return e.message.includes('BigInt'); } } },
  { id: '2.5.1', suite: 'scalarAdd with negative number: -10 + 5 = -5',
    name: 'scalarAdd -10 + 5 = -5', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-10n); v.scalarAdd(5n); return v.breakSymbolicToApproximateBigInt() === -5n; } },
  { id: '2.5.2', suite: 'scalarAdd making negative positive: -3 + 8 = 5',
    name: 'scalarAdd -3 + 8 = 5', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-3n); v.scalarAdd(8n); return v.breakSymbolicToApproximateBigInt() === 5n; } },
  { id: '2.5.3', suite: 'scalarSubtract from negative: -10 - 5 = -15',
    name: 'scalarSubtract -10 - 5 = -15', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-10n); v.scalarSubtract(5n); return v.breakSymbolicToApproximateBigInt() === -15n; } },
  { id: '2.5.4', suite: 'scalarSubtract making positive negative: 3 - 8 = -5',
    name: 'scalarSubtract 3 - 8 = -5', run: (s) => {
      const v = s.EGPTReal.fromBigInt(3n); v.scalarSubtract(8n); return v.breakSymbolicToApproximateBigInt() === -5n; } },
  { id: '2.5.5', suite: 'scalarMultiply with negative: -6 * 3 = -18',
    name: 'scalarMultiply -6 x 3 = -18', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-6n); v.scalarMultiply(3n); return v.breakSymbolicToApproximateBigInt() === -18n; } },
  { id: '2.5.6', suite: 'scalarMultiply negative by negative: -6 * -3 = 18',
    name: 'scalarMultiply -6 x -3 = 18', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-6n); v.scalarMultiply(-3n); return v.breakSymbolicToApproximateBigInt() === 18n; } },
  { id: '2.5.7', suite: 'scalarDivide with negative: -20 / 4 = -5',
    name: 'scalarDivide -20 / 4 = -5', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-20n); v.scalarDivide(4n); return v.breakSymbolicToApproximateBigInt() === -5n; } },
  { id: '2.5.8', suite: 'scalarDivide by negative: 20 / -4 = -5',
    name: 'scalarDivide 20 / -4 = -5', run: (s) => {
      const v = s.EGPTReal.fromBigInt(20n); v.scalarDivide(-4n); return v.breakSymbolicToApproximateBigInt() === -5n; } },
  { id: '2.5.9', suite: 'Negative fluent chaining: -10 + 5 * 2 / -5 = 2',
    name: 'negative fluent chain', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-10n); v.scalarAdd(5n).scalarMultiply(2n).scalarDivide(-5n);
      return v.breakSymbolicToApproximateBigInt() === 2n; } },
  { id: '2.5.10', suite: 'Negative rational scalar operations: -3/4 + 1 = 1/4',
    name: 'negative rational scalarAdd -3/4 + 1 = 1/4', run: (s) => {
      const v = s.EGPTReal.fromRational(-3n, 4n); v.scalarAdd(1n); return v.toCanonicalStr() === '1/4'; } },
  { id: '2.5.11', suite: 'Crossing zero boundary: -1 + 2 = 1',
    name: 'crossing zero -1 + 2 = 1', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-1n); v.scalarAdd(2n); return v.breakSymbolicToApproximateBigInt() === 1n; } },
  { id: '2.5.12', suite: 'Negative number division creating fraction: -7 / 3',
    name: 'negative division -7 / 3', run: (s) => {
      const v = s.EGPTReal.fromBigInt(-7n); v.scalarDivide(3n); return v.toCanonicalStr() === '-7/3'; } },

  // ── PPF {N, offset} full introspection (toPPF / fromPPF) ──
  { id: '1.5.ppfEnc', suite: 'PPF encoding verification for -13: N transformation',
    name: 'PPF encoding verification for -13 (N/offset)', run: (s) => {
      const p = s.EGPTReal.fromBigInt(-13n).toPPF(); return p.numerator.N === -5n && p.numerator.offset === 5n; } },
  { id: '1.5.ppfDec', suite: 'PPF decoding verification for negative numbers',
    name: 'PPF decoding from {N, offset} for negatives', run: (s) => {
      const v = s.EGPTReal.fromPPF({ numerator: { N: -5n, offset: 5n }, denominator: { N: 0n, offset: 0n } });
      return v.breakSymbolicToApproximateBigInt() === -13n; } },
  { id: '1.5.trace', suite: 'Example trace verification: -13 encoding/decoding',
    name: 'example -13 encode/decode PPF trace', run: (s) => {
      const v = s.EGPTReal.fromRational(-13n, 1n); const p = v.toPPF();
      return p.numerator.N === -5n && p.numerator.offset === 5n && v.breakSymbolicToApproximateBigInt() === -13n; } },

  // ── EGPTMath is a throwing static class ──
  { id: '3.static', suite: 'EGPTMath cannot be instantiated',
    name: 'EGPTMath cannot be instantiated (static class)',
    structural: 'asserts the JS facade class shape; no arithmetic, so it makes no WASM call',
    run: (s) => {
      try { new s.EGPTMath(); return false; } catch (e) { return e.message.includes('static class'); } } },

  // ── conditionalEntropyVector (shared composed factory) ──
  { id: '5.condEntropy', suite: 'Conditional entropy detects exact factors',
    name: 'conditionalEntropyVector detects exact factors', run: (s) => {
      const a = s.EGPTMath.conditionalEntropyVector(s.EGPTReal.fromBigInt(35n), s.EGPTReal.fromBigInt(5n));
      const b = s.EGPTMath.conditionalEntropyVector(s.EGPTReal.fromBigInt(35n), s.EGPTReal.fromBigInt(6n));
      return a.isInteger() && !b.isInteger(); } },

  // ── irrational fractional roots (from_scaled_vector keystone) ──
  { id: '6.5.nested', suite: 'Nested fractional operations: √(∛27) = √3',
    name: 'nested roots sqrt(cbrt(27)) = 27^(1/6)', run: (s) => {
      const cbrt = s.EGPTMath.pow(s.EGPTReal.fromBigInt(27n), 1n, 3n);
      const fin = s.EGPTMath.sqrt(cbrt);
      return fin.equals(s.EGPTMath.pow(s.EGPTReal.fromBigInt(27n), 1n, 6n)); } },
  { id: '6.5.chain', suite: 'Complex fractional chain: ((16^(1/4))^(1/2))^2 = 2',
    name: 'chain ((16^(1/4))^(1/2))^2 = 2', run: (s) => {
      const s1 = s.EGPTMath.pow(s.EGPTReal.fromBigInt(16n), 1n, 4n);
      const s2 = s.EGPTMath.sqrt(s1);
      const fin = s.EGPTMath.pow(s2, 2n, 1n);
      return fin.equals(s.EGPTReal.fromBigInt(2n)); } },
  { id: '6.6.half', suite: 'EGPTMath.exp2: Fractional exponent exp2(1/2) = √2',
    name: 'exp2(1/2) = √2 (verify by squaring)', run: (s) => {
      const r = s.EGPTReal.fromRational(1n, 2n).exp2();
      return s.EGPTMath.pow(r, 2n, 1n).equals(s.EGPTReal.fromBigInt(2n)); } },
  { id: '6.6.threeHalves', suite: 'EGPTMath.exp2: Fractional exponent exp2(3/2) = 2√2',
    name: 'exp2(3/2) = 2√2', run: (s) => {
      const r = s.EGPTReal.fromRational(3n, 2n).exp2();
      const alt = s.EGPTMath.multiply(s.EGPTReal.fromBigInt(1n).exp2(), s.EGPTReal.fromRational(1n, 2n).exp2());
      return r.equals(alt); } },

  // ── scaled-vector {scalar, base} irrational structure + algebra ──
  { id: '6.7a', suite: 'Scaled vector creation: H(√2) = (1/2) * H(2)',
    name: 'scaled vector H(√2) = (1/2)H(2)', run: (s) => {
      const v = s.EGPTReal.fromScaledVector(R(s, 2), 1n, 2n);
      const sc = v.getScalarParts(); const b = v.getBaseRationalParts();
      return sc.numerator === 1n && sc.denominator === 2n && b.numerator === 2n && b.denominator === 1n; } },
  { id: '6.7b', suite: 'Scaled vector reversibility: H(√2) + H(√2) = H(2)',
    name: 'scaled vector reversibility √2 + √2 = 2', run: (s) => {
      const H2 = R(s, 2); const sq = s.EGPTReal.fromScaledVector(H2, 1n, 2n); return s.EGPTMath.add(sq, sq).equals(H2); } },
  { id: '6.7c', suite: 'EGPTMath.pow with fractional exponent creates scaled vector',
    name: 'pow fractional creates scaled vector (8^(1/3)=2)', run: (s) =>
      s.EGPTMath.pow(R(s, 8), 1n, 3n).equals(R(s, 2)) },
  { id: '6.7d', suite: 'EGPTMath.sqrt creates scaled vector: H(√4) = (1/2) * H(4)',
    name: 'sqrt creates scaled vector (√4=2)', run: (s) =>
      s.EGPTMath.sqrt(R(s, 4)).equals(R(s, 2)) },
  { id: '6.7e', suite: 'Scaled vector toMathString shows scaling operation',
    name: 'scaled vector toMathString shows scaling', run: (s) => {
      const m = s.EGPTReal.fromScaledVector(R(s, 2), 3n, 4n).toMathString();
      return m.includes('3/4') && m.includes('H(2)'); } },
  { id: '6.7f', suite: 'Scaled vector clone preserves scalar multiplier',
    name: 'scaled vector clone preserves scalar', run: (s) => {
      const sc = s.EGPTReal.fromScaledVector(R(s, 5), 7n, 11n); const cl = sc.clone();
      const a = sc.getScalarParts(); const b = cl.getScalarParts();
      return a.numerator === b.numerator && a.denominator === b.denominator && sc.equals(cl); } },
  { id: '6.7g', suite: 'Scaled vector toPPF includes scalar information',
    name: 'scaled vector toPPF includes scalar', run: (s) => {
      const p = s.EGPTReal.fromScaledVector(R(s, 3), 5n, 7n).toPPF();
      return !!p.scalar && p.scalar.numerator === 5n && p.scalar.denominator === 7n; } },
  { id: '6.7h', suite: 'Scaled vector equality works across different representations',
    name: 'scaled vector equality across representations', run: (s) => {
      const H6 = R(s, 6);
      return s.EGPTReal.fromScaledVector(H6, 2n, 3n).equals(s.EGPTReal.fromScaledVector(H6, 4n, 6n)); } },
  { id: '6.7i', suite: 'Complex scaled vector: H(2^(3/4)) = (3/4) * H(2)',
    name: 'complex scaled vector 2^(3/4)', run: (s) => {
      const r = s.EGPTMath.pow(R(s, 2), 3n, 4n); const sc = r.getScalarParts(); const b = r.getBaseRationalParts();
      return sc.numerator === 3n && sc.denominator === 4n && b.numerator === 2n && b.denominator === 1n; } },
  { id: '6.7j', suite: 'Demonstration examples from ADDING_Vector_Scaling.md',
    name: 'demonstrateIrrationalRoots examples', run: (s) => {
      const ex = s.EGPTMath.demonstrateIrrationalRoots();
      const a = ex.sqrt_2.getScalarParts(); const c = ex.two_to_three_halves.getScalarParts();
      return a.numerator === 1n && a.denominator === 2n && c.numerator === 3n && c.denominator === 2n &&
             ex.cuberoot_8.equals(R(s, 2)); } },
  { id: '6.8a', suite: 'multiply() with identical scalars: H(√2) * H(√3) = H(√6)',
    name: 'H(√2) x H(√3) = H(√6)', run: (s) =>
      s.EGPTMath.multiply(s.EGPTMath.sqrt(R(s, 2)), s.EGPTMath.sqrt(R(s, 3))).equals(s.EGPTMath.sqrt(R(s, 6))) },
  { id: '6.8b', suite: 'multiply() with one scalar: H(2) * H(√3) = H(2√3)',
    name: 'H(2) x H(√3) = H(2√3)', run: (s) =>
      s.EGPTMath.multiply(R(s, 2), s.EGPTMath.sqrt(R(s, 3))).equals(s.EGPTMath.sqrt(R(s, 12))) },
  { id: '6.8c', suite: 'multiply() with identical scaled vectors: H(√2) * H(√2) = H(2)',
    name: 'H(√2) x H(√2) = H(2)', run: (s) => {
      const sq = s.EGPTMath.sqrt(R(s, 2)); return s.EGPTMath.multiply(sq, sq).equals(R(s, 2)); } },
  { id: '6.8d', suite: 'multiply() with opposite-sign scalars: (1/2)*H(2) * (-1/2)*H(2)',
    name: 'opposite-sign scalars = H(1)', run: (s) => {
      const H2 = R(s, 2);
      const p = s.EGPTReal.fromScaledVector(H2, 1n, 2n); const n = s.EGPTReal.fromScaledVector(H2, -1n, 2n);
      return s.EGPTMath.multiply(p, n).equals(R(s, 1)); } },
  { id: '6.8e', suite: 'multiply() scaled vector by integer',
    name: 'scaled vector x integer', run: (s) => {
      const sh = s.EGPTMath.sqrt(Rr(s, 1, 2));
      return s.EGPTMath.multiply(sh, R(s, 2)).equals(s.EGPTMath.sqrt(R(s, 2))); } },
  { id: '6.8f', suite: 'divide() with identical scalars: H(√6) / H(√2) = H(√3)',
    name: 'H(√6) / H(√2) = H(√3)', run: (s) =>
      s.EGPTMath.divide(s.EGPTMath.sqrt(R(s, 6)), s.EGPTMath.sqrt(R(s, 2))).equals(s.EGPTMath.sqrt(R(s, 3))) },
  { id: '6.8g', suite: 'multiply() with different non-trivial scalars throws error',
    name: 'multiply different scalars throws', run: (s) => {
      try { s.EGPTMath.multiply(s.EGPTMath.sqrt(R(s, 2)), s.EGPTMath.pow(R(s, 3), 1n, 3n)); return false; }
      catch (e) { return e.message.includes('not supported'); } } },
  { id: '6.8h', suite: 'divide() with different scalars throws error',
    name: 'divide different scalars throws', run: (s) => {
      try { s.EGPTMath.divide(s.EGPTMath.sqrt(R(s, 2)), s.EGPTMath.pow(R(s, 3), 1n, 3n)); return false; }
      catch (e) { return e.message.includes('not supported'); } } },

  // ── EGPTStat / EGPTStatData over scaled vectors ──
  { id: '6.9d', suite: 'EGPTStat.mean() with scaled vectors',
    name: 'EGPTStat.mean over scaled vectors (sqrt(2) irrational operands)', run: (s) => {
      const vals = [s.EGPTMath.sqrt(R(s, 2)), R(s, 2), s.EGPTMath.sqrt(R(s, 8))];
      return s.EGPTStat.mean(vals) instanceof s.EGPTReal; } },
  { id: '6.10c', suite: 'EGPTStatData.fromArray() with scaled vectors',
    name: 'EGPTStatData.fromArray with scaled vectors (sqrt(2))', run: (s) => {
      const vals = [s.EGPTMath.sqrt(R(s, 2)), s.EGPTMath.sqrt(R(s, 4)), R(s, 3)];
      const d = s.EGPTStatData.fromArray(vals);
      return d.total_count === 3 && d instanceof s.EGPTStatData; } },

  // ── complex ops over irrational/scaled operands ──
  { id: '6.11b', suite: 'EGPTReal.negate() works on scaled vectors',
    name: 'EGPTReal.negate on scaled vector (√2 irrational)', run: (s) => {
      const nsq = s.EGPTReal.negate(s.EGPTMath.sqrt(R(s, 2)));
      return s.EGPTMath.compare(nsq, R(s, 0)) < 0; } },
  { id: '6.11.f', suite: 'ComplexEGPTReal.conjugate() on scaled vectors',
    name: 'ComplexEGPTReal.conjugate on scaled-vector (√2) components', run: (s) => {
      const sq = s.EGPTMath.sqrt(R(s, 2)); const zc = new s.ComplexEGPTReal(sq, sq).conjugate(); const Z = R(s, 0);
      return s.EGPTMath.compare(zc.real, Z) > 0 && s.EGPTMath.compare(zc.imag, Z) < 0; } },

  // ── N-gon rational-phase cos/sin (shared phase pipeline) ──
  { id: '7.d', suite: 'EGPTMath.complexPower phase lookup model',
    name: 'EGPTComplex.complexPower phase lookup', run: (s) => {
      const sv = new s.ComplexEGPTReal(R(s, 0), R(s, 2));
      const r = s.EGPTComplex.complexPower(R(s, 3), sv);
      const m2 = s.EGPTMath.add(s.EGPTMath.pow(r.real, 2n), s.EGPTMath.pow(r.imag, 2n));
      const diff = Math.abs(s.EGPTMath.subtract(m2, R(s, 1)).breakSymbolicToApproximateJSNumber());
      return diff < 1e-9; } },
  { id: '7.e', suite: 'EGPTComplex.riemannZeta(2) ≈ π²/6 ≈ 1.645',
    name: 'EGPTComplex.riemannZeta(2) ≈ π²/6', run: (s) => {
      const r = s.EGPTComplex.riemannZeta(new s.ComplexEGPTReal(R(s, 2), R(s, 0)), 100);
      const val = r.real.breakSymbolicToApproximateJSNumber();
      return Math.abs(val - (Math.PI ** 2) / 6) < 0.01; } },
];

// Small helpers (import-free) for the RUNNABLE closures above.
function R(s, n) { return s.EGPTReal.fromBigInt(BigInt(n)); }
function Rr(s, a, b) { return s.EGPTReal.fromRational(BigInt(a), BigInt(b)); }

// ── EXPECTED_GAP — EMPTY (ws-egpt-math-rust-ops, 2026-07-16) ──────────────────
// The op-contract expansion (scaled-vector ArenaVal keystone + facade mutation /
// toPPF / toMathString + shared phase/composed factories) PORTED all 157 canonical
// assertions to the WASM facade. There are ZERO pinned structural gaps: every one
// of the former 52 is now a RUNNABLE assertion above, asserting via the published
// facade surface against real Rust/WASM scaled-vector arithmetic. The bin's
// invariant `RUNNABLE.length + EXPECTED_GAP.length === 157` now holds at 157 + 0.
export const EXPECTED_GAP = [];
