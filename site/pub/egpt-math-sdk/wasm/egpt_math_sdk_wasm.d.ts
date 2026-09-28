/* tslint:disable */
/* eslint-disable */

export function arenaAdd(a: bigint, b: bigint): bigint;

export function arenaBreakToBigint(n: bigint): string;

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

export function arenaFromAtomRoot(json: string): bigint;

export function arenaFromAtomVec(json: string): bigint;

export function arenaFromPpfJson(json: string): bigint;

export function arenaGcd(a: bigint, b: bigint): string;

export function arenaGetBaseParts(h: bigint): string;

export function arenaGetBitLength(n: bigint): string;

export function arenaGetScalarParts(h: bigint): string;

export function arenaLcm(a: bigint, b: bigint): string;

export function arenaLog2(a: bigint): bigint;

export function arenaMod(a: bigint, b: bigint): bigint;

export function arenaModPow(base: bigint, exp: bigint, modulus: bigint): bigint;

export function arenaMul(a: bigint, b: bigint): bigint;

export function arenaNormalDiv(a: bigint, b: bigint): bigint;

export function arenaPolyAdd(a_json: string, b_json: string): string;

export function arenaPolyDiv(dividend_json: string, divisor_json: string): string;

export function arenaPolyEval(poly_json: string, x: bigint): bigint;

export function arenaPolyFwd(coeffs_json: string, n: number): string;

export function arenaPolyGcd(a_json: string, b_json: string): string;

export function arenaPolyInv(samples_json: string, n: number): string;

export function arenaPolyMul(a_json: string, b_json: string): string;

export function arenaPow(base: bigint, exp_num: number, exp_den: number): bigint;

export function arenaPpfDecode(json: string): bigint;

export function arenaPpfEncode(n: bigint): string;

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

export function poly_add_wasm(a_json: string, b_json: string): string;

export function poly_div_wasm(a_json: string, b_json: string): string;

export function poly_evaluate_at_wasm(poly_json: string, x_json: string): string;

export function poly_forward_transform_wasm(coeffs_json: string, n: number): string;

export function poly_gcd_wasm(a_json: string, b_json: string): string;

export function poly_inverse_transform_wasm(samples_json: string, n: number): string;

export function poly_mul_wasm(a_json: string, b_json: string): string;

/**
 * Mark the slot at `handle` as None (free memory).
 */
export function releaseHandle(handle: bigint): void;

/**
 * Clear the entire arena and increment epoch.
 */
export function resetScope(): void;

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
    readonly arenaFromAtomRoot: (a: number, b: number) => [bigint, number, number];
    readonly arenaFromAtomVec: (a: number, b: number) => [bigint, number, number];
    readonly arenaFromPpfJson: (a: number, b: number) => [bigint, number, number];
    readonly arenaGcd: (a: bigint, b: bigint) => [number, number, number, number];
    readonly arenaGetBaseParts: (a: bigint) => [number, number, number, number];
    readonly arenaGetBitLength: (a: bigint) => [number, number, number, number];
    readonly arenaGetScalarParts: (a: bigint) => [number, number, number, number];
    readonly arenaLcm: (a: bigint, b: bigint) => [number, number, number, number];
    readonly arenaLog2: (a: bigint) => [bigint, number, number];
    readonly arenaMod: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaModPow: (a: bigint, b: bigint, c: bigint) => [bigint, number, number];
    readonly arenaMul: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaNormalDiv: (a: bigint, b: bigint) => [bigint, number, number];
    readonly arenaPolyAdd: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly arenaPolyDiv: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly arenaPolyEval: (a: number, b: number, c: bigint) => [bigint, number, number];
    readonly arenaPolyFwd: (a: number, b: number, c: number) => [number, number, number, number];
    readonly arenaPolyGcd: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly arenaPolyInv: (a: number, b: number, c: number) => [number, number, number, number];
    readonly arenaPolyMul: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly arenaPow: (a: bigint, b: number, c: number) => [bigint, number, number];
    readonly arenaPpfDecode: (a: number, b: number) => [bigint, number, number];
    readonly arenaPpfEncode: (a: bigint) => [number, number, number, number];
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
    readonly bridge_version: () => [number, number];
    readonly poly_add_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_div_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_evaluate_at_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_forward_transform_wasm: (a: number, b: number, c: number) => [number, number, number, number];
    readonly poly_gcd_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly poly_inverse_transform_wasm: (a: number, b: number, c: number) => [number, number, number, number];
    readonly poly_mul_wasm: (a: number, b: number, c: number, d: number) => [number, number, number, number];
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
