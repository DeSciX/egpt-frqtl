/* tslint:disable */
/* eslint-disable */

export function arenaAdd(a: bigint, b: bigint): bigint;

export function arenaBreakToBigint(n: bigint): string;

/**
 * → `{"v": <number>, "w": [...]}`. Non-finite results cross as the strings the JS
 * `Number` renders ("NaN", "Infinity", "-Infinity"), which JSON cannot hold as numbers.
 */
export function arenaBreakToJsNumber(n: bigint): string;

/**
 * PORT of `EGPTReal#breakSymbolicToString()` (core/EGPTReal.js), which returns
 * `this.toMathString()` — the symbolic "(s) * H(b)" form for a scaled vector,
 * "num[/den]" for a rational. Never the projection.
 */
export function arenaBreakToString(n: bigint): string;

export function arenaCmp(a: bigint, b: bigint): number;

export function arenaDiv(a: bigint, b: bigint): bigint;

export function arenaExp2(a: bigint): bigint;

/**
 * PORT of `EGPTReal.fromAtomRoot(term)`: `lc = leadingCoeff.breakSymbolicToApproximateBigInt()`
 * (0 → 0), then `lc · Π p^m` with each root `p = value.breakSymbolicToApproximateBigInt()` — so a
 * non-integer coefficient or root truncates with the reference's own warning lines — and a
 * negative root is the reference's RangeError. `json` = `{"leadingCoeff":"<packed>","roots":
 * [{"value":"<packed>","multiplicity":"<decimal>"}]}` (the JS already applied `BigInt(multiplicity)`).
 * Returns the `{"v": "<packed>", "w": [...]}` warnings envelope.
 */
export function arenaFromAtomRoot(json: string): string;

export function arenaFromAtomVec(json: string): bigint;

/**
 * → `{"v": "<handle>", "w": [...]}`; a zero denominator warns (if non-canonical) then throws.
 */
export function arenaFromPpfJson(json: string): string;

export function arenaFromRational(num: string, den: string): bigint;

export function arenaGcd(a: bigint, b: bigint): string;

export function arenaGetBaseParts(h: bigint): string;

export function arenaGetBitLength(n: bigint): string;

export function arenaGetRationalParts(h: bigint): string;

export function arenaGetScalarParts(h: bigint): string;

export function arenaInternUnreduced(num: string, den: string): bigint;

export function arenaLcm(a: bigint, b: bigint): string;

export function arenaLog2(a: bigint): bigint;

export function arenaMod(a: bigint, b: bigint): bigint;

export function arenaModPow(base: bigint, exp: bigint, modulus: bigint): bigint;

export function arenaMul(a: bigint, b: bigint): bigint;

export function arenaNegate(h: bigint): bigint;

export function arenaNormalDiv(a: bigint, b: bigint): bigint;

/**
 * `EGPTMath.pow` with BigInt exponents (decimal strings — never narrowed to i32).
 */
export function arenaPow(base: bigint, exp_num: string, exp_den: string): bigint;

/**
 * The JS reference's PPF integer decode → `{"v": "<handle>", "w": [...]}` (comments on
 * exports ship in the wasm-bindgen glue, so the core-internal name stays out of it).
 */
export function arenaPpfDecode(json: string): string;

export function arenaPpfEncode(n: bigint): string;

export function arenaScalarOp(h: bigint, op: string, s: string): bigint;

export function arenaSqrt(a: bigint): bigint;

/**
 * Returns arena stats as JSON: {"len": N, "capacity": N, "epoch": N}
 */
export function arenaStats(): string;

export function arenaSub(a: bigint, b: bigint): bigint;

export function arenaToAtomRoot(n: bigint): string;

export function arenaToMathString(h: bigint): string;

export function arenaToPpfFull(h: bigint): string;

export function arenaToPrimeAtoms(n: bigint): string;

export function bridge_version(): string;

/**
 * → `{"shift":k,"odd":"…"}`.
 */
export function codecDecomposeOdd(n: string): string;

export function codecF64Lift(f: number): string;

export function codecIeeeEncode(num: string, den: string, format: string, policy: string, policy_json: string): number;

export function codecIeeeEncodeCheck(format: string, policy: string, policy_json: string): void;

export function codecIeeeQuantize(x: number, is_nan: boolean, is_finite: boolean, x_disp: string, format: string, policy: string, policy_json: string): number;

export function codecIeeeUnpack(bits: string, format: string): string;

export function codecLcmOfDenominators(denoms_json: string): string;

export function codecMulLinear(coeffs_json: string, root_json: string): string;

export function codecPolyEvalAt(coeffs_json: string, x: string): string;

/**
 * `terms_json` = `[["p", e], …]` → `{"num":"…","den":"…"}`.
 */
export function codecRecompose(cofactor: string, terms_json: string): string;

/**
 * `EGPTRealBagNatToRat.apply`'s `denominator * scale`.
 */
export function codecScaleDenominator(den: string, scale: string): string;

/**
 * `_projectBagToNat`'s per-element `(numerator * scale) / denominator` (truncating, as JS BigInt `/`).
 */
export function codecScaleToNat(num: string, den: string, scale: string): string;

/**
 * `(1n << BigInt(shift)) * odd`.
 */
export function codecShiftOdd(shift: number, odd: string): string;

export function codecSyntheticDivide(coeffs_json: string, r: string): string;

/**
 * Intern a canonical string ("num" or "num/den") into the arena.
 */
export function internStr(canonical_str: string): bigint;

/**
 * Intern a V2 binary integer ([sign_byte, ...le_magnitude]) into the arena.
 */
export function internV2(bytes: Uint8Array): bigint;

/**
 * Materialize the value at `handle` as the JS reference's canonical string —
 * byte-for-byte `EGPTReal.toCanonicalStr(h)`: the UNREDUCED linear projection
 * (see `ArenaVal::js_canonical_str`).
 */
export function materializeStr(handle: bigint): string;

/**
 * Materialize the value at `handle` as a V2 binary of the numerator integer.
 */
export function materializeV2(handle: bigint): Uint8Array;

export function orderFinderCalculateSampleSize(n: string): number;

/**
 * `OrderFinder.findOrder` → decimal string, or "" for the JS `null`.
 */
export function orderFinderFindOrder(a: string, n: string, a_disp: string, n_disp: string): string;

export function orderFinderVerifyOrder(a: string, n: string, r: string): boolean;

/**
 * One export for the vector-in/vector-out statics: `op` names the JS method.
 */
export function polyPort(op: string, a_json: string, b_json: string): string;

/**
 * `matMul(A, B)` over JSON matrices of handles; tags index the row-major flattening.
 */
export function polyPortMatMul(a_json: string, b_json: string): string;

/**
 * `forwardTransform(coeffs, N)` / `inverseTransform(samples, N)` — N is the JS number;
 * `n_disp` its `${N}` for the length message.
 */
export function polyPortTransform(op: string, a_json: string, n: number, n_disp: string): string;

export function poly_add_wasm(a_json: string, b_json: string): string;

export function poly_div_wasm(a_json: string, b_json: string): string;

export function poly_evaluate_at_wasm(poly_json: string, x_json: string): string;

export function poly_forward_transform_wasm(coeffs_json: string, n: number): string;

export function poly_gcd_wasm(a_json: string, b_json: string): string;

export function poly_inverse_transform_wasm(samples_json: string, n: number): string;

export function poly_mul_wasm(a_json: string, b_json: string): string;

export function primeAtomBigOmega(n: string): string;

export function primeAtomBitLength(n: string): number;

export function primeAtomDivisorsOf(n: string): string;

/**
 * `factMultiply` → `{"product":[…], "compressedOps":k}`.
 */
export function primeAtomFactMultiply(va_json: string, vb_json: string): string;

export function primeAtomFactorize(n: string): string;

export function primeAtomLogspaceSum(n: string): string;

/**
 * `makeMeter()` — the meter's keys (zero-valued), as a JSON object.
 */
export function primeAtomMakeMeter(): string;

export function primeAtomOmega(n: string): number;

export function primeAtomReconstruct(v_json: string): string;

export function primeAtomTotient(n: string): string;

/**
 * → `{"pairs":[[idx,exp],…],"residual":"…"}`.
 */
export function primeCacheFactor(limit: number, n: string): string;

export function primeCacheIndexOf(limit: number, p: number): number;

export function primeCacheSieve(limit: number, limit_disp: string): string;

/**
 * `RULE_OR_RATIONAL_CANCEL` over `[[signIsOne, primeToken, locationToken], …]` → surviving indices.
 */
export function primeCompositeCancelRule(recs_json: string): string;

export function primeCompositeCongruent(a: bigint, b: bigint): boolean;

export function primeCompositeDivide(a: bigint, b: bigint): bigint;

export function primeCompositeFromReal(h: bigint): bigint;

export function primeCompositeIsComposite(h: bigint): boolean;

export function primeCompositeMultiply(a: bigint, b: bigint): bigint;

export function primeCompositeNew(json: string): bigint;

/**
 * `recordsMultisetKey` over a JSON array of the `${sign}:${prime}:${location}` strings.
 */
export function primeCompositeRecordsKey(parts_json: string): string;

export function primeCompositeState(h: bigint): string;

/**
 * Mark the slot at `handle` as None (free memory).
 */
export function releaseHandle(handle: bigint): void;

/**
 * Clear the entire arena and increment epoch.
 */
export function resetScope(): void;

/**
 * `EGPTranscendental.exp({real, imag})` → `{"v": {"x": "<h>", "y": "<h>"}, "w": [...]}`.
 */
export function transcendentalExp(re: bigint, im: bigint): string;

/**
 * `EGPTranscendental.factorial(n)` → `{"v": "<h>", "w": [...]}`.
 */
export function transcendentalFactorial(n: string): string;

/**
 * `EGPTranscendental._phaseToCircularCartesian(H)` → `{"x": "<h>", "y": "<h>"}`.
 */
export function transcendentalPhaseToCircular(h: bigint): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly arenaAdd: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaBreakToBigint: (a: bigint) => [number, number, number, number];
    readonly arenaBreakToJsNumber: (a: bigint) => [number, number, number, number];
    readonly arenaBreakToString: (a: bigint) => [number, number, number, number];
    readonly arenaCmp: (a: bigint, b: bigint) => [number, number, number];
    readonly arenaDiv: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaExp2: (a: bigint) => [bigint, number, number];
    readonly arenaFromAtomRoot: (a: number, b: number) => [number, number, number, number];
    readonly arenaFromAtomVec: (a: number, b: number) => [bigint, number, number];
    readonly arenaFromPpfJson: (a: number, b: number) => [number, number, number, number];
    readonly arenaFromRational: (a: number, b: number, c: number, d: number) => [bigint, number, number];
    readonly arenaGcd: (a: bigint, b: bigint) => [number, number, number, number];
    readonly arenaGetBaseParts: (a: bigint) => [number, number, number, number];
    readonly arenaGetBitLength: (a: bigint) => [number, number, number, number];
    readonly arenaGetRationalParts: (a: bigint) => [number, number, number, number];
    readonly arenaGetScalarParts: (a: bigint) => [number, number, number, number];
    readonly arenaInternUnreduced: (a: number, b: number, c: number, d: number) => [bigint, number, number];
    readonly arenaLcm: (a: bigint, b: bigint) => [number, number, number, number];
    readonly arenaLog2: (a: bigint) => [bigint, number, number];
    readonly arenaMod: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaModPow: (a: bigint, b: bigint, c: bigint) => [bigint, number, number];
    readonly arenaMul: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaNegate: (a: bigint) => [bigint, number, number];
    readonly arenaNormalDiv: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaPow: (a: bigint, b: number, c: number, d: number, e: number) => [bigint, number, number];
    readonly arenaPpfDecode: (a: number, b: number) => [number, number, number, number];
    readonly arenaPpfEncode: (a: bigint) => [number, number, number, number];
    readonly arenaScalarOp: (a: bigint, b: number, c: number, d: number, e: number) => [bigint, number, number];
    readonly arenaSqrt: (a: bigint) => [bigint, number, number];
    readonly arenaStats: () => [number, number];
    readonly arenaSub: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaToAtomRoot: (a: bigint) => [number, number, number, number];
    readonly arenaToPpfFull: (a: bigint) => [number, number, number, number];
    readonly arenaToPrimeAtoms: (a: bigint) => [number, number, number, number];
    readonly internStr: (a: number, b: number) => [bigint, number, number];
    readonly internV2: (a: number, b: number) => [bigint, number, number];
    readonly materializeStr: (a: bigint) => [number, number, number, number];
    readonly materializeV2: (a: bigint) => [number, number, number, number];
    readonly releaseHandle: (a: bigint) => [number, number];
    readonly resetScope: () => void;
    readonly arenaToMathString: (a: bigint) => [number, number, number, number];
    readonly codecDecomposeOdd: (a: number, b: number) => [number, number, number, number];
    readonly codecF64Lift: (a: number) => [number, number];
    readonly codecIeeeEncode: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly codecIeeeEncodeCheck: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly codecIeeeQuantize: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
    readonly codecIeeeUnpack: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly codecLcmOfDenominators: (a: number, b: number) => [number, number, number, number];
    readonly codecMulLinear: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly codecPolyEvalAt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly codecRecompose: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly codecScaleDenominator: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly codecScaleToNat: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly codecShiftOdd: (a: number, b: number, c: number) => [number, number, number, number];
    readonly codecSyntheticDivide: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly primeCacheFactor: (a: number, b: number, c: number) => [number, number, number, number];
    readonly primeCacheIndexOf: (a: number, b: number) => number;
    readonly primeCacheSieve: (a: number, b: number, c: number) => [number, number, number, number];
    readonly polyPort: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly polyPortMatMul: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly polyPortTransform: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly orderFinderCalculateSampleSize: (a: number, b: number) => [number, number, number];
    readonly orderFinderFindOrder: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly orderFinderVerifyOrder: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly primeAtomBigOmega: (a: number, b: number) => [number, number, number, number];
    readonly primeAtomBitLength: (a: number, b: number) => [number, number, number];
    readonly primeAtomDivisorsOf: (a: number, b: number) => [number, number, number, number];
    readonly primeAtomFactMultiply: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly primeAtomFactorize: (a: number, b: number) => [number, number, number, number];
    readonly primeAtomLogspaceSum: (a: number, b: number) => [number, number, number, number];
    readonly primeAtomMakeMeter: () => [number, number];
    readonly primeAtomOmega: (a: number, b: number) => [number, number, number];
    readonly primeAtomReconstruct: (a: number, b: number) => [number, number, number, number];
    readonly primeAtomTotient: (a: number, b: number) => [number, number, number, number];
    readonly bridge_version: () => [number, number];
    readonly poly_add_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_div_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_evaluate_at_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_forward_transform_wasm: (a: number, b: number, c: number) => [number, number, number, number];
    readonly poly_gcd_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_inverse_transform_wasm: (a: number, b: number, c: number) => [number, number, number, number];
    readonly poly_mul_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly transcendentalExp: (a: bigint, b: bigint) => [number, number, number, number];
    readonly transcendentalFactorial: (a: number, b: number) => [number, number, number, number];
    readonly transcendentalPhaseToCircular: (a: bigint) => [number, number, number, number];
    readonly primeCompositeCancelRule: (a: number, b: number) => [number, number, number, number];
    readonly primeCompositeCongruent: (a: bigint, b: bigint) => [number, number, number];
    readonly primeCompositeDivide: (a: bigint, b: bigint) => [bigint, number, number];
    readonly primeCompositeFromReal: (a: bigint) => [bigint, number, number];
    readonly primeCompositeIsComposite: (a: bigint) => [number, number, number];
    readonly primeCompositeMultiply: (a: bigint, b: bigint) => [bigint, number, number];
    readonly primeCompositeNew: (a: number, b: number) => [bigint, number, number];
    readonly primeCompositeRecordsKey: (a: number, b: number) => [number, number, number, number];
    readonly primeCompositeState: (a: bigint) => [number, number, number, number];
    readonly egpt_add: (a: number, b: number) => number;
    readonly egpt_cmp: (a: number, b: number) => number;
    readonly egpt_div: (a: number, b: number) => number;
    readonly egpt_free: (a: number) => void;
    readonly egpt_from_i64: (a: bigint) => number;
    readonly egpt_from_rational_i64: (a: bigint, b: bigint) => number;
    readonly egpt_mul: (a: number, b: number) => number;
    readonly egpt_print: (a: number) => void;
    readonly egpt_string_free: (a: number) => void;
    readonly egpt_sub: (a: number, b: number) => number;
    readonly egpt_to_cstring: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
