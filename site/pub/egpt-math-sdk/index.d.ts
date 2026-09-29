export type EgptMathSdkInitOptions = {
  wasmUrl?: string;
  wasmModuleUrl?: string;
};

export declare class EGPTReal {
  static fromBigInt(n: bigint | number | string): EGPTReal;
  static fromRational(num: bigint | number, den: bigint | number): EGPTReal;
  static fromRationalStr(str: string): EGPTReal;
  static readonly ZERO: EGPTReal;
  static readonly ONE: EGPTReal;
  static fromAtomVec(atomVec: { sign: -1 | 0 | 1; factors: { prime: bigint; exponent: bigint }[] }): EGPTReal;
  static fromAtomRoot(term: { leadingCoeff: EGPTReal; roots: { value: EGPTReal; multiplicity: bigint }[] }): EGPTReal;
  static gcd(a: bigint | number, b: bigint | number): bigint;
  static lcm(a: bigint | number, b: bigint | number): bigint;
  static modPow(base: bigint | number, exp: bigint | number, mod: bigint | number): bigint;

  toCanonicalStr(): string;
  toMathString(): string;
  toString(): string;
  add(other: EGPTReal): EGPTReal;
  subtract(other: EGPTReal): EGPTReal;
  multiply(other: EGPTReal): EGPTReal;
  divide(other: EGPTReal): EGPTReal;
  normalDivide(other: EGPTReal): EGPTReal;
  mod(other: EGPTReal): EGPTReal;
  equals(other: EGPTReal): boolean;
  compare(other: EGPTReal): -1 | 0 | 1;
  pow(expNum: bigint | number, expDen?: bigint | number): EGPTReal;
  sqrt(): EGPTReal;
  exp2(): EGPTReal;
  log2(): EGPTReal;
  getIntegerBitLength(): bigint;
  breakSymbolicToApproximateBigInt(): bigint;
  breakSymbolicToApproximateJSNumber(): number;
  breakSymbolicToString(): string;
  toPrimeAtoms(): { sign: -1 | 0 | 1; factors: { prime: bigint; exponent: bigint }[] };
  toAtomRoot(): { leadingCoeff: EGPTReal; roots: { value: EGPTReal; multiplicity: bigint }[] };
}

export declare const EGPTMath: {
  add(a: EGPTReal, b: EGPTReal): EGPTReal;
  subtract(a: EGPTReal, b: EGPTReal): EGPTReal;
  multiply(a: EGPTReal, b: EGPTReal): EGPTReal;
  divide(a: EGPTReal, b: EGPTReal): EGPTReal;
  normalDivide(a: EGPTReal, b: EGPTReal): EGPTReal;
  mod(a: EGPTReal, b: EGPTReal): EGPTReal;
  equals(a: EGPTReal, b: EGPTReal): boolean;
  compare(a: EGPTReal, b: EGPTReal): -1 | 0 | 1;
  pow(base: EGPTReal, expNum: bigint | number, expDen?: bigint | number): EGPTReal;
  sqrt(a: EGPTReal): EGPTReal;
  getIntegerBitLength(a: EGPTReal): bigint;
};

export declare const EGPTPolynomial: {
  add(a: EGPTReal[], b: EGPTReal[]): EGPTReal[];
  multiply(a: EGPTReal[], b: EGPTReal[]): EGPTReal[];
  divide(dividend: EGPTReal[], divisor: EGPTReal[]): { quotient: EGPTReal[]; remainder: EGPTReal[] };
  forwardTransform(coeffs: EGPTReal[], n: number): EGPTReal[];
  inverseTransform(samples: EGPTReal[], n: number): EGPTReal[];
  evaluateAt(poly: EGPTReal[], x: EGPTReal): EGPTReal;
  gcd(a: EGPTReal[], b: EGPTReal[]): EGPTReal[];
};

export declare const EGPTMatrix: {
  zeros(rows: number, cols: number): EGPTReal[][];
  identity(n: number): EGPTReal[][];
  from(rows: Array<Array<unknown>>): EGPTReal[][];
  shape(M: EGPTReal[][]): { rows: number; cols: number };
  transpose(M: EGPTReal[][]): EGPTReal[][];
  equals(A: EGPTReal[][], B: EGPTReal[][]): boolean;
  dotViaPolynomial(a: EGPTReal[], b: EGPTReal[]): EGPTReal;
  matVec(M: EGPTReal[][], v: EGPTReal[]): EGPTReal[];
  gemm(A: EGPTReal[][], B: EGPTReal[][], alpha?: EGPTReal, beta?: EGPTReal, C?: EGPTReal[][] | null): EGPTReal[][];
  matMul(A: EGPTReal[][], B: EGPTReal[][]): EGPTReal[][];
  evaluateRowsAt(M: EGPTReal[][], x: EGPTReal): EGPTReal[];
  format(M: EGPTReal[][], label?: string): string;
  print(M: EGPTReal[][], label?: string): void;
  // toValueReps/fromValueReps are NOT part of this facade — see wasm-facade.js
  // module doc (the correct op isn't in the provider's REQUIRED_OPS).
};

export declare const EGPTFFT: {
  forward(coeffs: EGPTReal[], n?: number): EGPTReal[];
  inverse(values: EGPTReal[], n?: number): EGPTReal[];
};

export type EgptMathSdk = {
  EGPTReal: typeof EGPTReal;
  EGPTMath: typeof EGPTMath;
  EGPTPolynomial: typeof EGPTPolynomial;
  EGPTMatrix: typeof EGPTMatrix;
  EGPTFFT: typeof EGPTFFT;
  wasm: Record<string, (...args: unknown[]) => unknown>;
  activeMathBackend: string;
  benchmarks: { qftBaseline: Record<string, unknown> };
  metadata: Record<string, unknown>;
};

export declare function createEgptMathSdk(options?: EgptMathSdkInitOptions): Promise<EgptMathSdk>;
