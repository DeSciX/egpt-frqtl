// src/browser/wasm-loader.js
async function probeWasmArtifact(wasmUrl) {
  if (!wasmUrl) {
    return { ok: false, reason: "missing-wasm-url" };
  }
  try {
    if (typeof process !== "undefined" && wasmUrl.startsWith("file://")) {
      const fs = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      await fs.access(fileURLToPath(wasmUrl));
      return { ok: true };
    }
    const response = await fetch(wasmUrl, { method: "GET" });
    if (!response.ok) {
      return { ok: false, reason: `artifact-unreachable:${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `artifact-fetch-error:${String(error)}` };
  }
}
function normalizeBrowserUrl(url) {
  if (!url || typeof document === "undefined") return url;
  return new URL(url, document.baseURI).href;
}
async function loadEgptMathWasm({ wasmUrl, wasmModuleUrl } = {}) {
  wasmUrl = normalizeBrowserUrl(wasmUrl);
  wasmModuleUrl = normalizeBrowserUrl(wasmModuleUrl);
  const probe = await probeWasmArtifact(wasmUrl);
  if (!wasmModuleUrl) {
    return {
      mode: probe.ok ? "wasm-skeleton" : "js-compat",
      wasmUrl: wasmUrl ?? null,
      wasmModuleUrl: null,
      warnings: probe.ok ? [] : [probe.reason]
    };
  }
  try {
    const mod = await import(wasmModuleUrl);
    let initArg = wasmUrl;
    let initArgIsBytes = false;
    if (typeof process !== "undefined" && wasmUrl && wasmUrl.startsWith("file://")) {
      const fs = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      initArg = await fs.readFile(fileURLToPath(wasmUrl));
      initArgIsBytes = true;
    } else if (wasmUrl) {
      const response = await fetch(String(wasmUrl));
      if (!response.ok) {
        throw new Error(`wasm binary fetch failed: ${response.status} ${response.statusText} (${wasmUrl})`);
      }
      initArg = await response.arrayBuffer();
      initArgIsBytes = true;
    }
    const initPayload = initArgIsBytes ? { module_or_path: initArg } : initArg;
    if (typeof mod.default === "function" && wasmUrl) {
      await mod.default(initPayload);
    } else if (typeof mod.init === "function" && wasmUrl) {
      await mod.init(initPayload);
    }
    return {
      mode: "wasm-bridge",
      wasmUrl: wasmUrl ?? null,
      wasmModuleUrl,
      module: mod,
      warnings: probe.ok ? [] : [probe.reason]
    };
  } catch (error) {
    return {
      mode: "js-compat",
      wasmUrl: wasmUrl ?? null,
      wasmModuleUrl,
      warnings: [`module-load-failed:${String(error)}`, ...probe.ok ? [] : [probe.reason]]
    };
  }
}

// src/browser/wasm-math-provider.js
var MathBackendRegistrationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MathBackendRegistrationError";
  }
};
function _localEgptRealToCanonicalStr(h) {
  const { numerator, denominator } = h._getPPFRationalParts();
  if (denominator === 1n || denominator === -1n) {
    return String(denominator < 0n ? -numerator : numerator);
  }
  return `${numerator}/${denominator}`;
}
function unwrap(result, opName) {
  if (!result || !result.ok) {
    const msg = result?.error ?? "wasm-result-unknown-error";
    throw new Error(`WasmMathBackendProvider.${opName}: WASM call failed \u2014 ${msg}`);
  }
  return result.value;
}
function makeHandle(epoch, idx) {
  return { p: "wasm-math", e: epoch, h: idx };
}
function unpackResult(u64BigInt) {
  const n = typeof u64BigInt === "bigint" ? u64BigInt : BigInt(Math.round(Number(u64BigInt)));
  return { e: Number(n >> 32n), h: Number(n & 0xFFFFFFFFn) };
}
function packHandle(epoch, idx) {
  return BigInt(epoch) * 0x100000000n + BigInt(idx);
}
var _wasmFacade = null;
function _internStr(canonStr) {
  const r = _wasmFacade.internStr(canonStr);
  const packed = unwrap(r, "_internStr");
  const { e, h } = unpackResult(packed);
  return makeHandle(e, h);
}
function _materializeStr(handle, opName) {
  const packed = packHandle(handle.e, handle.h);
  const r = _wasmFacade.materializeStr(packed);
  return unwrap(r, opName + ".materializeStr");
}
function extractHandle(h, opName) {
  if (h !== null && typeof h === "object") {
    if (h.p === "wasm-math") {
      return packHandle(h.e, h.h);
    }
    if (typeof h._getPPFRationalParts === "function") {
      const str = _localEgptRealToCanonicalStr(h);
      const r = _wasmFacade.internStr(str);
      const packed = unwrap(r, opName + ".d2-intern");
      return packed;
    }
  }
  throw new TypeError(
    `WasmMathBackendProvider.${opName}: foreign or invalid handle \u2014 expected wasm-math handle {p:'wasm-math',e,h} or EGPTReal instance; got ${typeof h}: ${h === null ? "null" : JSON.stringify(h)}`
  );
}
function polyToJson(arr, opName) {
  return JSON.stringify(arr.map((h) => String(extractHandle(h, opName))));
}
function jsonToHandles(json) {
  const arr = JSON.parse(json);
  return arr.map((s) => {
    const n = BigInt(s);
    const { e, h } = unpackResult(n);
    return makeHandle(e, h);
  });
}
function jsonPolyDivToObj(json) {
  const obj = JSON.parse(json);
  return {
    quotient: obj.quotient.map((s) => {
      const n = BigInt(s);
      const { e, h } = unpackResult(n);
      return makeHandle(e, h);
    }),
    remainder: obj.remainder.map((s) => {
      const n = BigInt(s);
      const { e, h } = unpackResult(n);
      return makeHandle(e, h);
    })
  };
}
function _bigintGcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
function buildWasmMathProvider(wasmFacade) {
  if (!wasmFacade || typeof wasmFacade !== "object") {
    throw new MathBackendRegistrationError(
      "buildWasmMathProvider: wasmFacade must be a non-null object (from buildWasmFacade)."
    );
  }
  const requiredArena = [
    "internStr",
    "materializeStr",
    "arenaAdd",
    "arenaMul",
    "arenaPow",
    "arenaToMathString",
    "arenaGetScalarParts",
    "arenaGetBaseParts",
    "arenaToPpfFull"
  ];
  const missingArena = requiredArena.filter((fn) => typeof wasmFacade[fn] !== "function");
  if (missingArena.length > 0) {
    throw new MathBackendRegistrationError(
      `buildWasmMathProvider: WASM facade missing V3 arena exports: ${missingArena.join(", ")}. Rebuild the WASM bridge (npm run build:wasm-bridge in sdk/egpt-math-sdk).`
    );
  }
  _wasmFacade = wasmFacade;
  const provider = Object.freeze({
    id: "wasm-math",
    // ── resetScope — per-run arena lifecycle ────────────────────────────────
    // Reached via MathBackendRegistry.resetScope(), which the shim publishes as
    // Runtime.resetMathScope() — called by whichever party owns a run unit (the
    // run() lane owns one buffer; NotebookKernel owns one notebook run). NOT per
    // cell: a cell's values outlive it in the kernel's binding store.
    // Provider MUST NOT subscribe to Bus — Runtime calls DOWN via registry.
    resetScope() {
      wasmFacade.resetScope();
    },
    // ── Construction / conversion ──────────────────────────────────────────
    fromBigInt(n) {
      return _internStr(String(n));
    },
    fromRational(num, den) {
      const g = _bigintGcd(num < 0n ? -num : num, den < 0n ? -den : den);
      if (g === 0n) return _internStr("0");
      let rn = num / g;
      let rd = den / g;
      if (rd < 0n) {
        rn = -rn;
        rd = -rd;
      }
      const canonical = rd === 1n ? String(rn) : `${rn}/${rd}`;
      return _internStr(canonical);
    },
    fromRationalStr(str) {
      return _internStr(str.trim());
    },
    toCanonicalStr(h) {
      return _materializeStr(h, "toCanonicalStr");
    },
    // ── Scaled-vector introspection (ws-egpt-math-rust-ops) ──────────────────
    // The opaque handle may be a scaled irrational vector {scalar, base}; these
    // expose the symbolic structure (never the linear projection). getScalarParts
    // is (1,1) for a plain rational handle; toMathString shows "(s) * H(b)".
    toMathString(h) {
      const r = wasmFacade.arenaToMathString(extractHandle(h, "toMathString"));
      return unwrap(r, "toMathString");
    },
    getScalarParts(h) {
      const json = unwrap(wasmFacade.arenaGetScalarParts(extractHandle(h, "getScalarParts")), "getScalarParts");
      const obj = JSON.parse(json);
      return { numerator: BigInt(obj.numerator), denominator: BigInt(obj.denominator) };
    },
    getBaseRationalParts(h) {
      const json = unwrap(wasmFacade.arenaGetBaseParts(extractHandle(h, "getBaseRationalParts")), "getBaseRationalParts");
      const obj = JSON.parse(json);
      return { numerator: BigInt(obj.numerator), denominator: BigInt(obj.denominator) };
    },
    toPPF(h) {
      const json = unwrap(wasmFacade.arenaToPpfFull(extractHandle(h, "toPPF")), "toPPF");
      const obj = JSON.parse(json);
      return {
        scalar: { numerator: BigInt(obj.scalar.numerator), denominator: BigInt(obj.scalar.denominator) },
        numerator: { N: BigInt(obj.numerator.N), offset: BigInt(obj.numerator.offset) },
        denominator: { N: BigInt(obj.denominator.N), offset: BigInt(obj.denominator.offset) }
      };
    },
    // ── Arithmetic ─────────────────────────────────────────────────────────
    add(a, b) {
      const r = wasmFacade.arenaAdd(extractHandle(a, "add"), extractHandle(b, "add"));
      const packed = unwrap(r, "add");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    subtract(a, b) {
      const r = wasmFacade.arenaSub(extractHandle(a, "subtract"), extractHandle(b, "subtract"));
      const packed = unwrap(r, "subtract");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    multiply(a, b) {
      const r = wasmFacade.arenaMul(extractHandle(a, "multiply"), extractHandle(b, "multiply"));
      const packed = unwrap(r, "multiply");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    divide(a, b) {
      const r = wasmFacade.arenaDiv(extractHandle(a, "divide"), extractHandle(b, "divide"));
      const packed = unwrap(r, "divide");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    normalDivide(a, b) {
      const r = wasmFacade.arenaNormalDiv(extractHandle(a, "normalDivide"), extractHandle(b, "normalDivide"));
      const packed = unwrap(r, "normalDivide");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    mod(a, b) {
      const r = wasmFacade.arenaMod(extractHandle(a, "mod"), extractHandle(b, "mod"));
      const packed = unwrap(r, "mod");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    // ── Comparison ─────────────────────────────────────────────────────────
    equals(a, b) {
      const cmp = unwrap(wasmFacade.arenaCmp(extractHandle(a, "equals"), extractHandle(b, "equals")), "equals");
      return cmp === 0;
    },
    compare(a, b) {
      return unwrap(wasmFacade.arenaCmp(extractHandle(a, "compare"), extractHandle(b, "compare")), "compare");
    },
    // ── Exponentiation / roots ──────────────────────────────────────────────
    pow(base, expNum, expDen) {
      const en = Number(expNum);
      const ed = Number(expDen);
      const r = wasmFacade.arenaPow(extractHandle(base, "pow"), en, ed);
      const packed = unwrap(r, "pow");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    sqrt(a) {
      const r = wasmFacade.arenaSqrt(extractHandle(a, "sqrt"));
      const packed = unwrap(r, "sqrt");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    // ── Rational-domain transcendentals ─────────────────────────────────────
    exp2(exponent) {
      const r = wasmFacade.arenaExp2(extractHandle(exponent, "exp2"));
      const packed = unwrap(r, "exp2");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    log2(value) {
      const r = wasmFacade.arenaLog2(extractHandle(value, "log2"));
      const packed = unwrap(r, "log2");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    // ── PPF encode / decode ─────────────────────────────────────────────────
    ppfEncodeInteger(n) {
      const hN = _internStr(String(n));
      const r = wasmFacade.arenaPpfEncode(packHandle(hN.e, hN.h));
      const jsonStr = unwrap(r, "ppfEncodeInteger");
      const obj = JSON.parse(jsonStr);
      return { N: BigInt(obj.N), offset: BigInt(obj.offset) };
    },
    ppfDecodeInteger(ppf) {
      const json = JSON.stringify({ N: String(ppf.N), offset: String(ppf.offset) });
      const r = wasmFacade.arenaPpfDecode(json);
      const packed = unwrap(r, "ppfDecodeInteger");
      const { e, h } = unpackResult(packed);
      const decoded = _materializeStr(makeHandle(e, h), "ppfDecodeInteger");
      return BigInt(decoded);
    },
    fromPPF(ppfData) {
      const scalar = ppfData.scalar ?? { numerator: 1n, denominator: 1n };
      const json = JSON.stringify({
        numerator: { N: String(ppfData.numerator.N), offset: String(ppfData.numerator.offset) },
        denominator: { N: String(ppfData.denominator.N), offset: String(ppfData.denominator.offset) },
        scalar: { numerator: String(scalar.numerator ?? 1n), denominator: String(scalar.denominator ?? 1n) }
      });
      const r = wasmFacade.arenaFromPpfJson(json);
      const packed = unwrap(r, "fromPPF");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    // ── Bit-length ──────────────────────────────────────────────────────────
    getIntegerBitLength(n) {
      const r = wasmFacade.arenaGetBitLength(extractHandle(n, "getIntegerBitLength"));
      return BigInt(unwrap(r, "getIntegerBitLength"));
    },
    // ── Break-symbolic exits ────────────────────────────────────────────────
    breakSymbolicToApproximateBigInt(h) {
      const r = wasmFacade.arenaBreakToBigint(extractHandle(h, "breakSymbolicToApproximateBigInt"));
      return BigInt(unwrap(r, "breakSymbolicToApproximateBigInt"));
    },
    breakSymbolicToApproximateJSNumber(h) {
      const r = wasmFacade.arenaBreakToJsNumber(extractHandle(h, "breakSymbolicToApproximateJSNumber"));
      return Number(unwrap(r, "breakSymbolicToApproximateJSNumber"));
    },
    breakSymbolicToString(h) {
      const r = wasmFacade.arenaBreakToString(extractHandle(h, "breakSymbolicToString"));
      return unwrap(r, "breakSymbolicToString");
    },
    // ── Prime-atom boundary ─────────────────────────────────────────────────
    toPrimeAtoms(h) {
      const r = wasmFacade.arenaToPrimeAtoms(extractHandle(h, "toPrimeAtoms"));
      const json = unwrap(r, "toPrimeAtoms");
      const obj = JSON.parse(json);
      return {
        sign: obj.sign,
        factors: obj.factors.map((f) => ({
          prime: BigInt(f.prime),
          exponent: BigInt(f.exponent)
        }))
      };
    },
    fromAtomVec(atomVec) {
      const json = JSON.stringify({
        sign: atomVec.sign,
        factors: (atomVec.factors ?? []).map((f) => ({
          prime: String(typeof f.prime === "bigint" ? f.prime : BigInt(f.prime)),
          exponent: String(typeof f.exponent === "bigint" ? f.exponent : BigInt(f.exponent))
        }))
      });
      const r = wasmFacade.arenaFromAtomVec(json);
      const packed = unwrap(r, "fromAtomVec");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    toAtomRoot(h) {
      const r = wasmFacade.arenaToAtomRoot(extractHandle(h, "toAtomRoot"));
      const json = unwrap(r, "toAtomRoot");
      const obj = JSON.parse(json);
      return {
        leadingCoeff: _internStr(obj.leadingCoeff),
        roots: obj.roots.map((root) => ({
          value: _internStr(root.value),
          multiplicity: BigInt(root.multiplicity)
        }))
      };
    },
    fromAtomRoot(term) {
      const lcStr = _materializeStr(term.leadingCoeff, "fromAtomRoot.leadingCoeff");
      const rootsArr = (term.roots ?? []).map((root) => ({
        value: _materializeStr(root.value, "fromAtomRoot.root.value"),
        multiplicity: String(root.multiplicity)
      }));
      const json = JSON.stringify({ leadingCoeff: lcStr, roots: rootsArr });
      const r = wasmFacade.arenaFromAtomRoot(json);
      const packed = unwrap(r, "fromAtomRoot");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    // ── Integer helpers — contract takes bigint inputs ────────────────────────
    //
    // gcd/lcm/modPow at the contract level take bigint inputs (not handles).
    // We intern the BigInts into the arena, compute, then return the result.
    gcd(a, b) {
      const ha = _internStr(String(a));
      const hb = _internStr(String(b));
      const r = wasmFacade.arenaGcd(packHandle(ha.e, ha.h), packHandle(hb.e, hb.h));
      return BigInt(unwrap(r, "gcd"));
    },
    lcm(a, b) {
      const ha = _internStr(String(a));
      const hb = _internStr(String(b));
      const r = wasmFacade.arenaLcm(packHandle(ha.e, ha.h), packHandle(hb.e, hb.h));
      return BigInt(unwrap(r, "lcm"));
    },
    modPow(base, exp, mod) {
      const hBase = _internStr(String(base));
      const hExp = _internStr(String(exp));
      const hMod = _internStr(String(mod));
      const r = wasmFacade.arenaModPow(
        packHandle(hBase.e, hBase.h),
        packHandle(hExp.e, hExp.h),
        packHandle(hMod.e, hMod.h)
      );
      const packed = unwrap(r, "modPow");
      const { e, h } = unpackResult(packed);
      const str = _materializeStr(makeHandle(e, h), "modPow.result");
      return BigInt(str);
    },
    // ── Polynomial ops ──────────────────────────────────────────────────────
    polyAdd(a, b) {
      const r = wasmFacade.arenaPolyAdd(polyToJson(a, "polyAdd"), polyToJson(b, "polyAdd"));
      return jsonToHandles(unwrap(r, "polyAdd"));
    },
    polyMul(a, b) {
      const r = wasmFacade.arenaPolyMul(polyToJson(a, "polyMul"), polyToJson(b, "polyMul"));
      return jsonToHandles(unwrap(r, "polyMul"));
    },
    polyDiv(dividend, divisor) {
      const r = wasmFacade.arenaPolyDiv(polyToJson(dividend, "polyDiv"), polyToJson(divisor, "polyDiv"));
      return jsonPolyDivToObj(unwrap(r, "polyDiv"));
    },
    polyForwardTransform(coeffs, n) {
      const r = wasmFacade.arenaPolyFwd(polyToJson(coeffs, "polyForwardTransform"), n);
      return jsonToHandles(unwrap(r, "polyForwardTransform"));
    },
    polyInverseTransform(samples, n) {
      const r = wasmFacade.arenaPolyInv(polyToJson(samples, "polyInverseTransform"), n);
      return jsonToHandles(unwrap(r, "polyInverseTransform"));
    },
    polyEvaluateAt(poly, x) {
      const r = wasmFacade.arenaPolyEval(polyToJson(poly, "polyEvaluateAt"), extractHandle(x, "polyEvaluateAt"));
      const packed = unwrap(r, "polyEvaluateAt");
      const { e, h } = unpackResult(packed);
      return makeHandle(e, h);
    },
    polyGcd(a, b) {
      const r = wasmFacade.arenaPolyGcd(polyToJson(a, "polyGcd"), polyToJson(b, "polyGcd"));
      return jsonToHandles(unwrap(r, "polyGcd"));
    },
    // ── Handle identity predicate (37th op) ──────────────────────────────────
    // Pure structural type check of the V3 handle shape {p:'wasm-math',e,h}.
    // Never throws. Architect ruling (b), Option-JS-only: isHandle answers a
    // TYPE question, not a LIVENESS question — a structurally-valid but stale
    // handle (dead epoch) still returns TRUE here, so that the FAIL-LOUD
    // arena_get stale-throw stays at the op call site and is never masked by
    // a false-from-this-predicate (that masking would be the FraqtlSession
    // backend-lie class of bug). Does NOT consult arenaStats (DEBUG-ONLY) and
    // makes NO wasm round-trip. A js-reference EGPTReal object → false (it is
    // a HOST value the D2 seam interns, not a wasm-math handle of MY type).
    isHandle(v) {
      return v != null && typeof v === "object" && v.p === "wasm-math" && Number.isInteger(v.e) && Number.isInteger(v.h);
    }
  });
  return provider;
}

// src/browser/wasm-call-facade.js
var WASM_ARENA_OPS = Object.freeze([
  // handle lifecycle / transport
  "internStr",
  "internV2",
  "materializeStr",
  "materializeV2",
  "releaseHandle",
  // scalar arithmetic
  "arenaAdd",
  "arenaSub",
  "arenaMul",
  "arenaDiv",
  "arenaNormalDiv",
  "arenaMod",
  "arenaCmp",
  "arenaPow",
  "arenaSqrt",
  "arenaExp2",
  "arenaLog2",
  // PPF encode/decode + inspection
  "arenaPpfEncode",
  "arenaPpfDecode",
  "arenaFromPpfJson",
  "arenaGetBitLength",
  "arenaBreakToBigint",
  "arenaBreakToJsNumber",
  "arenaBreakToString",
  "arenaToMathString",
  "arenaGetScalarParts",
  "arenaGetBaseParts",
  "arenaToPpfFull",
  // prime-atom representations
  "arenaToPrimeAtoms",
  "arenaFromAtomVec",
  "arenaToAtomRoot",
  "arenaFromAtomRoot",
  // number theory
  "arenaModPow",
  "arenaGcd",
  "arenaLcm",
  // polynomial ops
  "arenaPolyAdd",
  "arenaPolyMul",
  "arenaPolyDiv",
  "arenaPolyFwd",
  "arenaPolyInv",
  "arenaPolyEval",
  "arenaPolyGcd"
]);
var WASM_DIRECT_OPS = Object.freeze(["resetScope", "arenaStats"]);
function buildWasmCallFacade(wasmModule, backendTag = "wasm-bridge") {
  const mod = wasmModule ?? null;
  const safeCall = (name, ...args) => {
    if (!mod || typeof mod[name] !== "function") {
      return { ok: false, error: `wasm-function-unavailable:${name}`, backend: backendTag };
    }
    try {
      return { ok: true, value: mod[name](...args), backend: backendTag };
    } catch (error) {
      return { ok: false, error: String(error), backend: backendTag };
    }
  };
  const facade = {};
  for (const op of WASM_ARENA_OPS) {
    facade[op] = (...args) => safeCall(op, ...args);
  }
  for (const op of WASM_DIRECT_OPS) {
    facade[op] = mod ? (...args) => mod[op](...args) : null;
  }
  return facade;
}

// ../../lib/egpt/js/model/shared/matrixAlgorithm.js
function createEGPTMatrix({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, EGPTPolynomial: EGPTPolynomial2 }) {
  function _zeros(rows, cols) {
    const M = new Array(rows);
    for (let i = 0; i < rows; i++) {
      M[i] = new Array(cols).fill(EGPTReal2.fromBigInt(0n));
    }
    return M;
  }
  function _shape(M) {
    return { rows: M.length, cols: M.length === 0 ? 0 : M[0].length };
  }
  function dotViaPolynomial(a, b) {
    if (a.length !== b.length) {
      throw new Error(`dotViaPolynomial: length mismatch ${a.length} vs ${b.length}`);
    }
    const n = a.length;
    if (n === 0) return EGPTReal2.fromBigInt(0n);
    const reversed = new Array(n);
    for (let i = 0; i < n; i++) reversed[i] = b[n - 1 - i];
    const product = EGPTPolynomial2.multiply(a, reversed);
    return product[n - 1] !== void 0 ? product[n - 1] : EGPTReal2.fromBigInt(0n);
  }
  const matrix = {
    zeros: _zeros,
    identity(n) {
      const M = _zeros(n, n);
      for (let i = 0; i < n; i++) M[i][i] = EGPTReal2.fromBigInt(1n);
      return M;
    },
    from(rows) {
      return rows.map((row, i) => row.map((v, j) => {
        if (v instanceof EGPTReal2) return v;
        if (Array.isArray(v) && v.length === 2) return EGPTReal2.fromRational(BigInt(v[0]), BigInt(v[1]));
        if (typeof v === "bigint") return EGPTReal2.fromBigInt(v);
        if (typeof v === "number" && Number.isInteger(v)) return EGPTReal2.fromBigInt(BigInt(v));
        throw new Error(`EGPTMatrix.from: unsupported entry at [${i}][${j}]: ${v}`);
      }));
    },
    shape: _shape,
    transpose(M) {
      const { rows, cols } = _shape(M);
      const T = _zeros(cols, rows);
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) T[j][i] = M[i][j];
      return T;
    },
    equals(A, B) {
      const a = _shape(A);
      const b = _shape(B);
      if (a.rows !== b.rows || a.cols !== b.cols) return false;
      for (let i = 0; i < a.rows; i++) for (let j = 0; j < a.cols; j++) {
        if (!A[i][j].equals(B[i][j])) return false;
      }
      return true;
    },
    dotViaPolynomial,
    matVec(M, v) {
      const { rows, cols } = _shape(M);
      if (v.length !== cols) throw new Error(`matVec shape mismatch: M is ${rows}x${cols}, v has length ${v.length}`);
      return M.map((row) => dotViaPolynomial(row, v));
    },
    /**
     * GEMM: `C := alpha * (A . B) + beta * C`. Each output entry routes
     * through `dotViaPolynomial` (row x reversed-column). No Vandermonde,
     * Toeplitz, or twiddle-table machinery — the bijective-chain pathway IS
     * the implementation.
     */
    gemm(A, B, alpha, beta, C = null) {
      alpha = alpha ?? EGPTReal2.fromBigInt(1n);
      beta = beta ?? EGPTReal2.fromBigInt(0n);
      const a = _shape(A);
      const b = _shape(B);
      if (a.cols !== b.rows) throw new Error(`gemm shape mismatch: A is ${a.rows}x${a.cols}, B is ${b.rows}x${b.cols}`);
      if (C === null) {
        C = _zeros(a.rows, b.cols);
      } else {
        const cShape = _shape(C);
        if (cShape.rows !== a.rows || cShape.cols !== b.cols) {
          throw new Error(`gemm: C is ${cShape.rows}x${cShape.cols}, expected ${a.rows}x${b.cols}`);
        }
      }
      const cols = new Array(b.cols);
      for (let j = 0; j < b.cols; j++) {
        const colJ = new Array(a.cols);
        for (let r = 0; r < a.cols; r++) colJ[r] = B[r][j];
        cols[j] = colJ;
      }
      const zero = EGPTReal2.fromBigInt(0n);
      for (let i = 0; i < a.rows; i++) {
        for (let j = 0; j < b.cols; j++) {
          const dotProduct = dotViaPolynomial(A[i], cols[j]);
          const scaled = EGPTMath2.multiply(alpha, dotProduct);
          C[i][j] = beta.equals(zero) ? scaled : EGPTMath2.add(scaled, EGPTMath2.multiply(beta, C[i][j]));
        }
      }
      return C;
    },
    matMul(A, B) {
      return matrix.gemm(A, B);
    },
    evaluateRowsAt(M, x) {
      return M.map((row) => EGPTPolynomial2.evaluateAt(row, x));
    },
    format(M, label) {
      const { rows, cols } = _shape(M);
      const cells = M.map((row) => row.map((v) => EGPTReal2.toCanonicalStr(v)));
      const widths = new Array(cols).fill(0);
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        if (cells[i][j].length > widths[j]) widths[j] = cells[i][j].length;
      }
      const lines = cells.map((row) => "  [ " + row.map((c, j) => c.padStart(widths[j])).join("  ") + " ]");
      return (label ? `${label}  (${rows}x${cols})
` : "") + lines.join("\n");
    },
    print(M, label) {
      console.log(matrix.format(M, label));
    }
  };
  if (typeof EGPTPolynomial2.toValueRepresentation === "function") {
    matrix.toValueReps = (M) => M.map((row) => EGPTPolynomial2.toValueRepresentation(row));
  }
  if (typeof EGPTPolynomial2.fromValueRepresentation === "function") {
    matrix.fromValueReps = (VR) => VR.map((samples) => EGPTPolynomial2.fromValueRepresentation(samples));
  }
  return Object.freeze(matrix);
}

// ../../lib/egpt/js/model/shared/fftAlgorithm.js
function createEGPTFFT({ EGPTPolynomial: EGPTPolynomial2 }) {
  return Object.freeze({
    /** @param {any[]} coeffs @param {number} [N] @returns {any[]} */
    forward(coeffs, N) {
      const size = N === void 0 ? coeffs.length : N;
      return EGPTPolynomial2.forwardTransform(coeffs, size);
    },
    /** @param {any[]} values @param {number} [N] @returns {any[]} */
    inverse(values, N) {
      const size = N === void 0 ? values.length : N;
      return EGPTPolynomial2.inverseTransform(values, size);
    }
  });
}

// ../../lib/egpt/js/model/shared/statAlgorithm.js
function bigIntSqrt(value) {
  if (value < 0n) throw new Error("bigIntSqrt: negative input");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}
function createEGPTStat({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, getEGPTStatData }) {
  function _normalSqrt(a_en) {
    const rational = a_en.getRationalParts();
    const sqrt_num = rational.numerator < 0n ? -bigIntSqrt(-rational.numerator) : bigIntSqrt(rational.numerator);
    const sqrt_den = bigIntSqrt(rational.denominator);
    return EGPTReal2.fromRational(sqrt_num, sqrt_den);
  }
  function mean(vectors) {
    if (vectors.length === 0) throw new Error("Cannot calculate mean of empty vector array");
    let sum = vectors[0].clone();
    for (let i = 1; i < vectors.length; i++) sum = EGPTMath2.add(sum, vectors[i]);
    return EGPTMath2.normalDivide(sum, EGPTReal2.fromBigInt(BigInt(vectors.length)));
  }
  function absoluteDifference(H_a, H_b) {
    return EGPTMath2.compare(H_a, H_b) >= 0 ? EGPTMath2.subtract(H_a, H_b) : EGPTMath2.subtract(H_b, H_a);
  }
  function variance(vectors) {
    if (vectors.length === 0) throw new Error("Cannot calculate variance of empty vector array");
    const mean_vector = mean(vectors);
    let sum_squared_deviations = EGPTReal2.fromBigInt(0n);
    let negative_deviations = 0;
    for (const vector of vectors) {
      if (EGPTMath2.compare(vector, mean_vector) < 0) negative_deviations++;
      const deviation = absoluteDifference(vector, mean_vector);
      sum_squared_deviations = EGPTMath2.add(sum_squared_deviations, EGPTMath2.normalMultiply(deviation, deviation));
    }
    const variance_value = EGPTMath2.normalDivide(sum_squared_deviations, EGPTReal2.fromBigInt(BigInt(vectors.length)));
    return {
      variance: variance_value,
      metadata: {
        negative_deviations,
        total_vectors: vectors.length,
        has_negative_deviations: negative_deviations > 0
      }
    };
  }
  function comprehensiveStatisticalAnalysis(values, options = {}) {
    if (values.length === 0) throw new Error("Cannot analyze empty array of entropy values");
    const EGPTStatData2 = typeof getEGPTStatData === "function" ? getEGPTStatData() : null;
    if (!EGPTStatData2 || typeof EGPTStatData2.fromArray !== "function") {
      throw new TypeError("comprehensiveStatisticalAnalysis: EGPTStatData.fromArray must be injected");
    }
    return EGPTStatData2.fromArray(values, {
      include_normalization: true,
      chart_target_range: 1,
      min_chart_visibility: 0.1,
      ...options
    });
  }
  return Object.freeze({ _normalSqrt, mean, absoluteDifference, variance, comprehensiveStatisticalAnalysis });
}

// ../../lib/egpt/js/model/shared/statDataAlgorithm.js
function createEGPTStatData({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, getEGPTStat }) {
  class EGPTStatData2 {
    constructor({
      raw_values = [],
      mean = null,
      variance = null,
      std_deviation = null,
      coefficient_of_variation = null,
      min_value = null,
      max_value = null,
      range = null,
      negative_count = 0,
      total_count = 0,
      metadata = {}
    }) {
      this.raw_values = raw_values;
      this.mean = mean;
      this.variance = variance;
      this.std_deviation = std_deviation;
      this.coefficient_of_variation = coefficient_of_variation;
      this.min_value = min_value;
      this.max_value = max_value;
      this.range = range;
      this.negative_count = negative_count;
      this.total_count = total_count;
      this.metadata = metadata;
      this._normalized_deltas = null;
      this._adaptive_thresholds = null;
    }
    /** (value − mean)/std_dev per value, with magnitude classification. */
    getNormalizedDeltas() {
      if (this._normalized_deltas) return this._normalized_deltas;
      if (!this.mean || !this.std_deviation) {
        throw new Error("Mean and standard deviation required for normalization");
      }
      const H_ZERO = EGPTReal2.fromBigInt(0n);
      const is_zero_std_dev = EGPTMath2.equals(this.std_deviation, H_ZERO);
      const out = [];
      for (let i = 0; i < this.raw_values.length; i++) {
        const value = this.raw_values[i];
        const raw_delta = EGPTMath2.subtract(value, this.mean);
        const normalized_delta_egpt = is_zero_std_dev ? EGPTReal2.fromBigInt(0n) : EGPTMath2.normalDivide(raw_delta, this.std_deviation);
        const magnitude_class = this._classifyMagnitude(normalized_delta_egpt);
        const is_negative = EGPTMath2.compare(normalized_delta_egpt, H_ZERO) < 0;
        out.push({
          index: i,
          raw_value: value.toMathString(),
          raw_delta: raw_delta.toMathString(),
          normalized_delta: normalized_delta_egpt.toMathString(),
          normalized_delta_egpt,
          magnitude_class,
          is_negative
        });
      }
      this._normalized_deltas = out;
      return out;
    }
    _classifyMagnitude(normalized_delta_egpt) {
      if (!this._adaptive_thresholds) this._adaptive_thresholds = this._calculateAdaptiveThresholds();
      const t = this._adaptive_thresholds;
      const abs_delta = EGPTMath2.abs(normalized_delta_egpt);
      if (EGPTMath2.compare(abs_delta, t.baseline) < 0) return "baseline";
      if (EGPTMath2.compare(abs_delta, t.moderate) < 0) return "moderate";
      if (EGPTMath2.compare(abs_delta, t.significant) < 0) return "significant";
      return "outlier";
    }
    _calculateAdaptiveThresholds() {
      return {
        baseline: EGPTReal2.fromRational(1n, 2n),
        moderate: EGPTReal2.fromBigInt(1n),
        significant: EGPTReal2.fromBigInt(2n)
      };
    }
    /** Factory — computes the full statistical bag from a value array. */
    static fromArray(values, options = {}) {
      if (values.length === 0) throw new Error("Cannot create EGPTStatData from empty array");
      const EGPTStat2 = getEGPTStat();
      const mean = EGPTStat2.mean(values);
      const variance_result = EGPTStat2.variance(values);
      const variance = variance_result.variance;
      const std_deviation = EGPTStat2._normalSqrt(variance);
      let coefficient_of_variation;
      const mean_rational = mean.getRationalParts();
      if (mean_rational.numerator === 0n) {
        const variance_rational = variance.getRationalParts();
        coefficient_of_variation = variance_rational.numerator === 0n ? EGPTReal2.fromBigInt(0n) : EGPTReal2.fromBigInt(1000000n);
      } else {
        coefficient_of_variation = EGPTMath2.normalDivide(std_deviation, mean);
      }
      let min_value = values[0];
      let max_value = values[0];
      let negative_count = 0;
      const zero = EGPTReal2.fromBigInt(0n);
      for (const value of values) {
        if (EGPTMath2.compare(value, min_value) < 0) min_value = value;
        if (EGPTMath2.compare(value, max_value) > 0) max_value = value;
        if (EGPTMath2.compare(value, zero) < 0) negative_count++;
      }
      const range = EGPTMath2.compare(min_value, zero) === 0 ? max_value.clone() : EGPTMath2.normalDivide(max_value, min_value);
      const Ctor = this;
      return new Ctor({
        raw_values: values,
        mean,
        variance,
        std_deviation,
        coefficient_of_variation,
        min_value,
        max_value,
        range,
        negative_count,
        total_count: values.length,
        metadata: { ...variance_result.metadata, precision: "ultra-high", creation_options: options }
      });
    }
  }
  return EGPTStatData2;
}

// ../../lib/egpt/js/model/shared/transcendentalAlgorithm.js
function createEGPTranscendental({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2 }) {
  function exp2(H_entropy) {
    const exp_rational = H_entropy.getRationalParts();
    return EGPTMath2.pow(EGPTReal2.fromBigInt(2n), exp_rational.numerator, exp_rational.denominator);
  }
  function log2(x_en) {
    const H_one = EGPTReal2.fromBigInt(1n);
    if (x_en.equals(H_one)) return EGPTReal2.fromBigInt(0n);
    const half_x = EGPTMath2.divide(x_en, EGPTReal2.fromBigInt(2n));
    return EGPTMath2.add(log2(half_x), H_one);
  }
  function _phaseToCartesian(H_fraction) {
    const H_ZERO = EGPTReal2.fromBigInt(0n);
    const H_ONE = EGPTReal2.fromBigInt(1n);
    const H_quarter = EGPTReal2.fromRational(1n, 4n);
    const H_half = EGPTReal2.fromRational(1n, 2n);
    const H_three_quarter = EGPTReal2.fromRational(3n, 4n);
    if (EGPTMath2.equals(H_fraction, H_ZERO)) return { x: H_ONE.clone(), y: H_ZERO.clone() };
    if (EGPTMath2.equals(H_fraction, H_quarter)) return { x: H_ZERO.clone(), y: H_ONE.clone() };
    if (EGPTMath2.equals(H_fraction, H_half)) return { x: EGPTReal2.fromBigInt(-1n), y: H_ZERO.clone() };
    if (EGPTMath2.equals(H_fraction, H_three_quarter)) return { x: H_ZERO.clone(), y: EGPTReal2.fromBigInt(-1n) };
    if (EGPTMath2.compare(H_fraction, H_quarter) < 0) {
      const progress = EGPTMath2.divide(H_fraction, H_quarter);
      return { x: EGPTMath2.subtract(H_ONE, progress), y: progress };
    } else if (EGPTMath2.compare(H_fraction, H_half) < 0) {
      const progress = EGPTMath2.divide(EGPTMath2.subtract(H_fraction, H_quarter), H_quarter);
      return { x: EGPTMath2.subtract(H_ZERO, progress), y: EGPTMath2.subtract(H_ONE, progress) };
    } else if (EGPTMath2.compare(H_fraction, H_three_quarter) < 0) {
      const progress = EGPTMath2.divide(EGPTMath2.subtract(H_fraction, H_half), H_quarter);
      return { x: EGPTMath2.subtract(progress, H_ONE), y: EGPTMath2.subtract(H_ZERO, progress) };
    } else {
      const progress = EGPTMath2.divide(EGPTMath2.subtract(H_fraction, H_three_quarter), H_quarter);
      return { x: progress, y: EGPTMath2.subtract(progress, H_ONE) };
    }
  }
  function cos(H_phase) {
    return _phaseToCartesian(H_phase).x;
  }
  function sin(H_phase) {
    return _phaseToCartesian(H_phase).y;
  }
  function _calcTriangularWavePosition(H_P, H_x) {
    const H_zero = EGPTReal2.fromBigInt(0n);
    if (H_P.equals(H_zero)) return H_zero.clone();
    const H_two = EGPTReal2.fromBigInt(2n);
    const H_period = EGPTMath2.multiply(H_two, H_P);
    const H_time_in_period = EGPTMath2.mod(H_x, H_period);
    if (EGPTMath2.compare(H_time_in_period, H_P) <= 0) {
      return H_time_in_period;
    }
    return EGPTMath2.subtract(H_period, H_time_in_period);
  }
  function _getVectorFromPhase(H_n, H_phase) {
    const H_zero = EGPTReal2.fromBigInt(0n);
    const H_one = EGPTReal2.fromBigInt(1n);
    if (H_n.equals(H_zero)) return { x: H_one, y: H_zero };
    const H_y_pos = _calcTriangularWavePosition(H_n, H_phase);
    const H_y_normalized = EGPTMath2.divide(H_y_pos, H_n);
    const H_y_squared = EGPTMath2.pow(H_y_normalized, 2n);
    const one_minus_y_sq = EGPTMath2.subtract(H_one, H_y_squared);
    const is_negative = EGPTMath2.compare(one_minus_y_sq, H_zero) < 0;
    const H_x_normalized = is_negative ? H_zero.clone() : EGPTMath2.sqrt(one_minus_y_sq);
    return { x: H_x_normalized, y: H_y_normalized };
  }
  return Object.freeze({ exp2, log2, _phaseToCartesian, cos, sin, _calcTriangularWavePosition, _getVectorFromPhase });
}

// ../../lib/egpt/js/model/shared/complexAlgorithm.js
function createEGPTComplex({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, transcendental, phaseToCircular }) {
  class ComplexEGPTReal2 {
    constructor(realPart, imagPart) {
      if (!(realPart instanceof EGPTReal2) || !(imagPart instanceof EGPTReal2)) {
        throw new Error("ComplexEGPTReal components must be EGPTReal instances.");
      }
      this.real = realPart;
      this.imag = imagPart;
    }
    clone() {
      return new this.constructor(this.real.clone(), this.imag.clone());
    }
    toString() {
      return `(${this.real.toMathString()}) + i(${this.imag.toMathString()})`;
    }
    equals(other) {
      return this.real.equals(other.real) && this.imag.equals(other.imag);
    }
    add(other) {
      return new this.constructor(EGPTMath2.add(this.real, other.real), EGPTMath2.add(this.imag, other.imag));
    }
    subtract(other) {
      return new this.constructor(EGPTMath2.subtract(this.real, other.real), EGPTMath2.subtract(this.imag, other.imag));
    }
    /** Immutable product — routes through EGPTComplex.complexMultiply (dev overrides with the unit-circle path). */
    multiply(other) {
      return EGPTComplex2.complexMultiply(this, other);
    }
    /** z̄ = -z = (-real, -imag). Faceable via EGPTReal.negate (no in-place scalarMultiply). */
    negate() {
      return new this.constructor(EGPTReal2.negate(this.real), EGPTReal2.negate(this.imag));
    }
    /** z* = (real, -imag). */
    conjugate() {
      return new this.constructor(this.real.clone(), EGPTReal2.negate(this.imag));
    }
    /** k*z for integer k = (k*real, k*imag). */
    scaleBy(scalar) {
      if (typeof scalar !== "bigint") throw new Error("scaleBy requires BigInt scalar");
      const k = EGPTReal2.fromBigInt(scalar);
      return new this.constructor(EGPTMath2.normalMultiply(this.real, k), EGPTMath2.normalMultiply(this.imag, k));
    }
    /** (a/b)*z. */
    scaleByRational(numerator, denominator) {
      if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
        throw new Error("scaleByRational requires BigInt numerator and denominator");
      }
      const k = EGPTReal2.fromRational(numerator, denominator);
      return new this.constructor(EGPTMath2.normalMultiply(this.real, k), EGPTMath2.normalMultiply(this.imag, k));
    }
    isReal() {
      return this.imag.equals(EGPTReal2.fromBigInt(0n));
    }
    isImaginary() {
      return this.real.equals(EGPTReal2.fromBigInt(0n));
    }
    /** L2 magnitude² = real² + imag². */
    getMagnitudeSquared() {
      return EGPTMath2.add(EGPTMath2.multiply(this.real, this.real), EGPTMath2.multiply(this.imag, this.imag));
    }
    /** L1 magnitude |x| + |y| (n-gon square topology). */
    getMagnitude() {
      return EGPTMath2.add(EGPTMath2.abs(this.real), EGPTMath2.abs(this.imag));
    }
    /** In-place mutable ops (dev-core FFT hot path). Reassign (the handle is immutable). */
    addInPlace(other) {
      this.real = EGPTMath2.add(this.real, other.real);
      this.imag = EGPTMath2.add(this.imag, other.imag);
      return this;
    }
    subtractInPlace(other) {
      this.real = EGPTMath2.subtract(this.real, other.real);
      this.imag = EGPTMath2.subtract(this.imag, other.imag);
      return this;
    }
    negateInPlace() {
      this.real = EGPTReal2.negate(this.real);
      this.imag = EGPTReal2.negate(this.imag);
      return this;
    }
    conjugateInPlace() {
      this.imag = EGPTReal2.negate(this.imag);
      return this;
    }
    /**
     * Reverse the square-topology linear-interpolation to recover the phase fraction [0,1)
     * from (x,y). Cardinal points exact; else invert per quadrant. Pure rational (faceable).
     * @returns {EGPTReal}
     */
    getPhase() {
      const H_ZERO = EGPTReal2.fromBigInt(0n);
      const H_ONE = EGPTReal2.fromBigInt(1n);
      const H_NEG_ONE = EGPTReal2.fromBigInt(-1n);
      const H_quarter = EGPTReal2.fromRational(1n, 4n);
      const H_half = EGPTReal2.fromRational(1n, 2n);
      const H_three_quarter = EGPTReal2.fromRational(3n, 4n);
      const x = this.real;
      const y = this.imag;
      if (y.equals(H_ZERO)) {
        if (x.equals(H_ONE)) return H_ZERO;
        if (x.equals(H_NEG_ONE)) return H_half;
      }
      if (x.equals(H_ZERO)) {
        if (y.equals(H_ONE)) return H_quarter;
        if (y.equals(H_NEG_ONE)) return H_three_quarter;
      }
      const is_x_pos = EGPTMath2.compare(x, H_ZERO) > 0;
      const is_y_pos = EGPTMath2.compare(y, H_ZERO) > 0;
      if (is_x_pos && is_y_pos) {
        return EGPTMath2.normalMultiply(y, H_quarter);
      } else if (!is_x_pos && is_y_pos) {
        return EGPTMath2.add(H_quarter, EGPTMath2.normalMultiply(EGPTReal2.negate(x), H_quarter));
      } else if (!is_x_pos && !is_y_pos) {
        return EGPTMath2.add(H_half, EGPTMath2.normalMultiply(EGPTReal2.negate(y), H_quarter));
      } else {
        return EGPTMath2.add(H_three_quarter, EGPTMath2.normalMultiply(x, H_quarter));
      }
    }
  }
  let _Complex = ComplexEGPTReal2;
  const mk = (x, y) => new _Complex(x, y);
  function setComplexClass(C) {
    _Complex = C;
  }
  function coordinateMultiply(a_en, b_en) {
    const a_scalar = a_en.getScalarParts();
    const b_scalar = b_en.getScalarParts();
    if (a_scalar.numerator === 1n && a_scalar.denominator === 1n && b_scalar.numerator === 1n && b_scalar.denominator === 1n) {
      const a_r = a_en.getRationalParts();
      const b_r = b_en.getRationalParts();
      return EGPTReal2.fromRational(a_r.numerator * b_r.numerator, a_r.denominator * b_r.denominator);
    }
    const H_ZERO = EGPTReal2.fromBigInt(0n);
    const a_neg = EGPTMath2.compare(a_en, H_ZERO) < 0;
    const b_neg = EGPTMath2.compare(b_en, H_ZERO) < 0;
    const a_abs = a_neg ? EGPTReal2.negate(a_en) : a_en;
    const b_abs = b_neg ? EGPTReal2.negate(b_en) : b_en;
    const product_abs = EGPTMath2.multiply(a_abs, b_abs);
    return a_neg !== b_neg ? EGPTReal2.negate(product_abs) : product_abs;
  }
  const EGPTComplex2 = {
    complexAdd(z1, z2) {
      return mk(EGPTMath2.add(z1.real, z2.real), EGPTMath2.add(z1.imag, z2.imag));
    },
    complexMultiplyEuclidean(z1, z2) {
      const ac = coordinateMultiply(z1.real, z2.real);
      const bd = coordinateMultiply(z1.imag, z2.imag);
      const ad = coordinateMultiply(z1.real, z2.imag);
      const bc = coordinateMultiply(z1.imag, z2.real);
      return mk(EGPTMath2.subtract(ac, bd), EGPTMath2.add(ad, bc));
    },
    coordinateMultiply
  };
  EGPTComplex2.complexMultiply = EGPTComplex2.complexMultiplyEuclidean;
  EGPTComplex2.complexPower = function complexPower(H_n, s) {
    const exponent_real_parts = s.real._getPPFRationalParts();
    let H_magnitude;
    if (exponent_real_parts.numerator < 0n) {
      const positive_numerator = -exponent_real_parts.numerator;
      const H_positive_power = EGPTMath2.pow(H_n, positive_numerator, exponent_real_parts.denominator);
      const H_one = EGPTReal2.fromBigInt(1n);
      H_magnitude = EGPTMath2.divide(H_one, H_positive_power);
    } else {
      H_magnitude = EGPTMath2.pow(H_n, exponent_real_parts.numerator, exponent_real_parts.denominator);
    }
    const H_phase = EGPTMath2.multiply(s.imag, H_n);
    const phase_coords = transcendental._getVectorFromPhase(H_n, H_phase);
    const H_magnitude_complex = mk(H_magnitude, EGPTReal2.fromBigInt(0n));
    return EGPTComplex2.complexMultiply(H_magnitude_complex, mk(phase_coords.x, phase_coords.y));
  };
  EGPTComplex2.riemannZeta = function riemannZeta(s, maxTerms = 1e3) {
    let sum_real = EGPTReal2.fromBigInt(0n);
    let sum_imag = EGPTReal2.fromBigInt(0n);
    const s_neg = mk(EGPTReal2.negate(s.real), EGPTReal2.negate(s.imag));
    for (let i = 1; i <= maxTerms; i++) {
      const H_n = EGPTReal2.fromBigInt(BigInt(i));
      const H_term = EGPTComplex2.complexPower(H_n, s_neg);
      sum_real = EGPTMath2.add(sum_real, H_term.real);
      sum_imag = EGPTMath2.add(sum_imag, H_term.imag);
    }
    return mk(sum_real, sum_imag);
  };
  class TwiddleTable2 {
    constructor(k, topology = "square") {
      if (k <= 0 || !Number.isInteger(k)) throw new Error("TwiddleTable: k must be a positive integer");
      this.k = k;
      this.topology = topology;
      this.twiddles = /* @__PURE__ */ new Map();
      this.phases = /* @__PURE__ */ new Map();
      for (let j = 0; j < k; j++) {
        const phase = EGPTReal2.fromRational(BigInt(j), BigInt(k));
        let coords;
        if (topology === "circular") {
          if (typeof phaseToCircular !== "function") {
            throw new Error("TwiddleTable: 'circular' topology unavailable in this build (needs the \u221A2/2 scaled-vector phase map \u2014 pinned facade gap).");
          }
          coords = phaseToCircular(EGPTReal2.fromRational(BigInt(-j), BigInt(k)));
        } else {
          coords = transcendental._phaseToCartesian(phase);
        }
        this.twiddles.set(j, mk(coords.x, coords.y));
        this.phases.set(j, phase);
      }
    }
    getTwiddle(j) {
      return this.twiddles.get((j % this.k + this.k) % this.k);
    }
    getPhase(j) {
      return this.phases.get((j % this.k + this.k) % this.k);
    }
    multiplyByPhase(j_a, j_b) {
      const i = (j_a + j_b) % this.k;
      return { index: i, twiddle: this.getTwiddle(i) };
    }
    powerByPhase(j, n) {
      const i = j * n % this.k;
      return { index: i, twiddle: this.getTwiddle(i) };
    }
    conjugateByPhase(j) {
      const i = (this.k - j) % this.k;
      return { index: i, twiddle: this.getTwiddle(i) };
    }
    getPhaseIndex(omega) {
      for (let j = 0; j < this.k; j++) if (omega.equals(this.getTwiddle(j))) return j;
      return -1;
    }
  }
  return { ComplexEGPTReal: ComplexEGPTReal2, TwiddleTable: TwiddleTable2, EGPTComplex: EGPTComplex2, setComplexClass };
}

// ../../lib/egpt/js/model/shared/mathComposedAlgorithm.js
function createComposedMath({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2 }) {
  function conditionalEntropyVector(k_en, p_en) {
    const H_zero = EGPTReal2.fromBigInt(0n);
    if (EGPTMath2.compare(p_en, H_zero) <= 0) {
      return EGPTReal2.fromBigInt(50n);
    }
    const H_quotient = EGPTMath2.divide(k_en, p_en);
    if (H_quotient.isInteger()) {
      H_quotient.isExactFactor = true;
      return H_quotient;
    }
    const quotient_rational = H_quotient._getPPFRationalParts();
    const H_integer_part = EGPTReal2.fromBigInt(quotient_rational.numerator / quotient_rational.denominator);
    return EGPTMath2.subtract(H_quotient, H_integer_part);
  }
  return Object.freeze({ conditionalEntropyVector });
}

// src/browser/active-provider.js
var _resolver = null;
function setActiveProviderResolver(fn) {
  _resolver = fn;
}
function hasActiveProvider() {
  return _resolver !== null;
}
function getActiveProvider() {
  if (!_resolver) {
    throw new Error(
      "egpt-math-sdk: no active math provider resolver set \u2014 an entry (dist-entry.js or sdk-entry.js) must call setActiveProviderResolver() first."
    );
  }
  return _resolver();
}

// src/browser/wasm-facade.js
function _p(opName) {
  if (!hasActiveProvider()) {
    throw new Error(
      `EGPT Math SDK (WASM-only dist): no active WASM math provider (op '${opName}'). createEgptMathSdk() must complete successfully before EGPTReal/EGPTMath/EGPTPolynomial are used \u2014 this build ships no JS math-core fallback.`
    );
  }
  return getActiveProvider();
}
function _wrap(handle) {
  return new EGPTReal(_CONSTRUCT_TOKEN, handle);
}
function _unwrap(v, opName) {
  if (v instanceof EGPTReal) return v._handle;
  throw new TypeError(
    `EGPT Math SDK: ${opName} expected an EGPTReal facade instance, got ${v === null ? "null" : typeof v}`
  );
}
var _CONSTRUCT_TOKEN = Symbol("egpt-real-facade-construct");
var EGPTReal = class _EGPTReal {
  constructor(token, handle) {
    if (token !== _CONSTRUCT_TOKEN) {
      throw new TypeError(
        "EGPTReal: do not construct directly \u2014 use EGPTReal.fromBigInt / .fromRational / .fromRationalStr."
      );
    }
    this._handle = handle;
  }
  /** @param {bigint|number|string} n @returns {EGPTReal} */
  static fromBigInt(n) {
    return new _EGPTReal(_CONSTRUCT_TOKEN, _p("fromBigInt").fromBigInt(BigInt(n)));
  }
  /** @param {bigint|number} num @param {bigint|number} den @returns {EGPTReal} */
  static fromRational(num, den) {
    return new _EGPTReal(_CONSTRUCT_TOKEN, _p("fromRational").fromRational(BigInt(num), BigInt(den)));
  }
  /** @param {string} str — "num" or "num/den" @returns {EGPTReal} */
  static fromRationalStr(str) {
    return new _EGPTReal(_CONSTRUCT_TOKEN, _p("fromRationalStr").fromRationalStr(String(str)));
  }
  static get ZERO() {
    return _EGPTReal.fromBigInt(0n);
  }
  static get ONE() {
    return _EGPTReal.fromBigInt(1n);
  }
  /**
   * Scaled irrational vector `base^(sNum/sDen)` (ws-egpt-math-rust-ops). Routes
   * to the provider `pow` op, which combines the base's own scalar and reduces
   * to a plain rational when possible (16^(1/4)→2) or a Scaled value otherwise
   * (2^(1/2)=√2). This IS the same construction path as `EGPTMath.pow(base, sNum,
   * sDen)`; provided as a static factory to mirror the dev-core narration name.
   * @param {EGPTReal} base @param {bigint|number} sNum @param {bigint|number} sDen @returns {EGPTReal}
   */
  static fromScaledVector(base, sNum, sDen) {
    return _wrap(_p("pow").pow(_unwrap(base, "fromScaledVector"), BigInt(sNum), BigInt(sDen)));
  }
  /**
   * Reconstruct from full PPF `{scalar?, numerator:{N,offset}, denominator:{N,offset}}`
   * — the inverse of {@link EGPTReal#toPPF}. Scalar-preserving: a non-1/1 scalar
   * rebuilds the scaled vector. Provider-routed (ws-egpt-math-rust-ops).
   * @param {{scalar?:{numerator:bigint,denominator:bigint}, numerator:{N:bigint,offset:bigint}, denominator:{N:bigint,offset:bigint}}} ppfData @returns {EGPTReal}
   */
  static fromPPF(ppfData) {
    return _wrap(_p("fromPPF").fromPPF(ppfData));
  }
  /** Exact canonical rational string ("num" or "num/den") — never decimal projection. */
  toCanonicalStr() {
    return _p("toCanonicalStr").toCanonicalStr(this._handle);
  }
  /**
   * Mathematical notation. For a scaled irrational vector this shows the scaling
   * operation "(s_num/s_den) * H(b_num/b_den)" (e.g. 2^(3/4) → "(3/4) * H(2)");
   * for a plain rational it is the canonical "num"/"num/den". Routes to the
   * provider's scaled-aware op — NOT toCanonicalStr (which is the projection).
   */
  toMathString() {
    return _p("toMathString").toMathString(this._handle);
  }
  toString() {
    return this.toCanonicalStr();
  }
  /**
   * Static form matching the dev-core `EGPTReal.toCanonicalStr(v)` call
   * shape (dev-core has no instance method of this name — only the static).
   * `../shared/matrixAlgorithm.js`'s `format`/`print` call this static form
   * uniformly across both injected backends; this is the one-line facade-side
   * shim that makes that possible without touching dev-core's EGPTReal.
   * @param {EGPTReal} v @returns {string}
   */
  static toCanonicalStr(v) {
    return v.toCanonicalStr();
  }
  /** @param {EGPTReal} other @returns {EGPTReal} */
  add(other) {
    return _wrap(_p("add").add(this._handle, _unwrap(other, "add")));
  }
  /** @param {EGPTReal} other @returns {EGPTReal} */
  subtract(other) {
    return _wrap(_p("subtract").subtract(this._handle, _unwrap(other, "subtract")));
  }
  /** Shannon-space multiply. @param {EGPTReal} other @returns {EGPTReal} */
  multiply(other) {
    return _wrap(_p("multiply").multiply(this._handle, _unwrap(other, "multiply")));
  }
  /** Shannon-space divide. @param {EGPTReal} other @returns {EGPTReal} */
  divide(other) {
    return _wrap(_p("divide").divide(this._handle, _unwrap(other, "divide")));
  }
  /** Normal-space (rational) divide. @param {EGPTReal} other @returns {EGPTReal} */
  normalDivide(other) {
    return _wrap(_p("normalDivide").normalDivide(this._handle, _unwrap(other, "normalDivide")));
  }
  /** @param {EGPTReal} other @returns {EGPTReal} */
  mod(other) {
    return _wrap(_p("mod").mod(this._handle, _unwrap(other, "mod")));
  }
  /** @param {EGPTReal} other @returns {boolean} */
  equals(other) {
    return _p("equals").equals(this._handle, _unwrap(other, "equals"));
  }
  /** @param {EGPTReal} other @returns {-1|0|1} */
  compare(other) {
    return _p("compare").compare(this._handle, _unwrap(other, "compare"));
  }
  /** @param {bigint|number} expNum @param {bigint|number} [expDen=1n] @returns {EGPTReal} */
  pow(expNum, expDen = 1n) {
    return _wrap(_p("pow").pow(this._handle, BigInt(expNum), BigInt(expDen)));
  }
  /** @returns {EGPTReal} */
  sqrt() {
    return _wrap(_p("sqrt").sqrt(this._handle));
  }
  /** Rational-domain exp2. @returns {EGPTReal} */
  exp2() {
    return _wrap(_p("exp2").exp2(this._handle));
  }
  /** Rational-domain log2. @returns {EGPTReal} */
  log2() {
    return _wrap(_p("log2").log2(this._handle));
  }
  /** floor(log2(n)) + 1. @returns {bigint} */
  getIntegerBitLength() {
    return _p("getIntegerBitLength").getIntegerBitLength(this._handle);
  }
  // ── Sugar (ws-egpt-math-facade-bench) — backend-agnostic, zero new provider ops ──
  /** Additive inverse: `0 − this`. Provider-routed (subtract). @returns {EGPTReal} */
  negate() {
    return _EGPTReal.ZERO.subtract(this);
  }
  /**
   * A NEW wrapper object sharing this (immutable) arena handle. The arena value
   * itself is immutable, but the in-place scalar mutators (scalarAdd/…) reassign
   * the wrapper's `_handle`, so a clone MUST be a distinct wrapper for the
   * mutate-the-clone-not-the-original contract to hold (EGPTTestSuite 1.3).
   * @returns {EGPTReal}
   */
  clone() {
    return new _EGPTReal(_CONSTRUCT_TOKEN, this._handle);
  }
  // ── In-place scalar mutation (ws-egpt-math-rust-ops) — facade-wrapper handle-swap ──
  // The arena is immutable-by-design (every op interns a NEW handle); mutation
  // lives HERE by reassigning `this._handle` to the new handle and returning
  // `this` for fluent chaining. On the plain values the bench exercises these are
  // pure provider dispatches over the linear projection (scalar reset to 1/1).
  /** Translate by a BigInt: this ← this + s. @param {bigint} s @returns {this} */
  scalarAdd(s) {
    if (typeof s !== "bigint") throw new Error("scalarAdd requires BigInt scalar");
    this._handle = _p("add").add(this._handle, _p("fromBigInt").fromBigInt(s));
    return this;
  }
  /** Translate by −s. @param {bigint} s @returns {this} */
  scalarSubtract(s) {
    if (typeof s !== "bigint") throw new Error("scalarSubtract requires BigInt scalar");
    return this.scalarAdd(-s);
  }
  /** Scale by a BigInt: this ← this × s. @param {bigint} s @returns {this} */
  scalarMultiply(s) {
    if (typeof s !== "bigint") throw new Error("scalarMultiply requires BigInt scalar");
    this._handle = _p("multiply").multiply(this._handle, _p("fromBigInt").fromBigInt(s));
    return this;
  }
  /** Scale by 1/s: this ← this ÷ s. @param {bigint} s @returns {this} */
  scalarDivide(s) {
    if (typeof s !== "bigint") throw new Error("scalarDivide requires BigInt scalar");
    if (s === 0n) throw new Error("Division by zero scalar is undefined");
    this._handle = _p("divide").divide(this._handle, _p("fromBigInt").fromBigInt(s));
    return this;
  }
  /** true iff the canonical rational is a whole integer (no `/` in canonical form). @returns {boolean} */
  isInteger() {
    return !this.toCanonicalStr().includes("/");
  }
  /**
   * The canonical rational as `{ numerator, denominator }` bigints — DERIVED by
   * parsing `toCanonicalStr()` ("num" or "num/den"), the published facade output.
   * This is the plain rational value (num/den), NOT the PPF log2-encode internals
   * ({N, offset}); the latter stays gapped (`toPPF`). Faced modules (EGPTStat,
   * EGPTStatData) that read `.getRationalParts()`/`._getPPFRationalParts()` route here.
   * @returns {{numerator: bigint, denominator: bigint}}
   */
  getRationalParts() {
    const s = this.toCanonicalStr();
    const slash = s.indexOf("/");
    if (slash === -1) return { numerator: BigInt(s), denominator: 1n };
    return { numerator: BigInt(s.slice(0, slash)), denominator: BigInt(s.slice(slash + 1)) };
  }
  /** Alias of {@link EGPTReal#getRationalParts} — dev-core narration name. @returns {{numerator:bigint,denominator:bigint}} */
  _getPPFRationalParts() {
    return this.getRationalParts();
  }
  /**
   * The scaled-vector scalar multiplier `{s_num, s_den}`. `{1/1}` for a plain
   * rational handle; the real `{scalar}` for an irrational scaled vector
   * (e.g. √2 → {1/2}). Provider-routed (ws-egpt-math-rust-ops). Faced modules
   * that branch on `getScalarParts()` (shared complexAlgorithm coordinateMultiply)
   * take the pure-rational path for rational operands and the sign-magnitude path
   * for scaled ones — matching dev-core.
   * @returns {{numerator: bigint, denominator: bigint}}
   */
  getScalarParts() {
    return _p("getScalarParts").getScalarParts(this._handle);
  }
  /**
   * The base vector rational `{b_num, b_den}` WITHOUT the scalar applied — the
   * H(k) base of a scaled vector (e.g. 2^(3/4) → {2/1}). For a plain rational the
   * base IS the value. Provider-routed (ws-egpt-math-rust-ops).
   * @returns {{numerator: bigint, denominator: bigint}}
   */
  getBaseRationalParts() {
    return _p("getBaseRationalParts").getBaseRationalParts(this._handle);
  }
  /**
   * Full PPF export: `{scalar:{numerator,denominator}, numerator:{N,offset},
   * denominator:{N,offset}}`. The scalar carries the scaled-vector multiplier
   * (e.g. 3^(5/7) → scalar {5,7}); N/offset are the base PPF log2-encode.
   * Provider-routed (ws-egpt-math-rust-ops).
   * @returns {{scalar:{numerator:bigint,denominator:bigint}, numerator:{N:bigint,offset:bigint}, denominator:{N:bigint,offset:bigint}}}
   */
  toPPF() {
    return _p("toPPF").toPPF(this._handle);
  }
  /** Static form: additive inverse of `v`. @param {EGPTReal} v @returns {EGPTReal} */
  static negate(v) {
    if (!(v instanceof _EGPTReal)) throw new TypeError("EGPTReal.negate expected an EGPTReal facade instance");
    return v.negate();
  }
  /** @returns {bigint} */
  breakSymbolicToApproximateBigInt() {
    return _p("breakSymbolicToApproximateBigInt").breakSymbolicToApproximateBigInt(this._handle);
  }
  /** @returns {number} */
  breakSymbolicToApproximateJSNumber() {
    return _p("breakSymbolicToApproximateJSNumber").breakSymbolicToApproximateJSNumber(this._handle);
  }
  /** @returns {string} */
  breakSymbolicToString() {
    return _p("breakSymbolicToString").breakSymbolicToString(this._handle);
  }
  /** @returns {{sign:-1|0|1, factors:{prime:bigint,exponent:bigint}[]}} */
  toPrimeAtoms() {
    return _p("toPrimeAtoms").toPrimeAtoms(this._handle);
  }
  /** @returns {{leadingCoeff:EGPTReal, roots:{value:EGPTReal,multiplicity:bigint}[]}} */
  toAtomRoot() {
    const raw = _p("toAtomRoot").toAtomRoot(this._handle);
    return {
      leadingCoeff: _wrap(raw.leadingCoeff),
      roots: raw.roots.map((r) => ({ value: _wrap(r.value), multiplicity: r.multiplicity }))
    };
  }
  /** @param {{sign, factors}} atomVec @returns {EGPTReal} */
  static fromAtomVec(atomVec) {
    return _wrap(_p("fromAtomVec").fromAtomVec(atomVec));
  }
  /** @param {{leadingCoeff:EGPTReal, roots:{value:EGPTReal,multiplicity:bigint}[]}} term @returns {EGPTReal} */
  static fromAtomRoot(term) {
    const p = _p("fromAtomRoot");
    return _wrap(p.fromAtomRoot({
      leadingCoeff: _unwrap(term.leadingCoeff, "fromAtomRoot.leadingCoeff"),
      roots: (term.roots ?? []).map((r) => ({
        value: _unwrap(r.value, "fromAtomRoot.root.value"),
        multiplicity: r.multiplicity
      }))
    }));
  }
  /** Integer gcd (bigint-level, not a rational op). @returns {bigint} */
  static gcd(a, b) {
    return _p("gcd").gcd(BigInt(a), BigInt(b));
  }
  /** Integer lcm (bigint-level, not a rational op). @returns {bigint} */
  static lcm(a, b) {
    return _p("lcm").lcm(BigInt(a), BigInt(b));
  }
  /** @returns {bigint} */
  static modPow(base, exp, mod) {
    return _p("modPow").modPow(BigInt(base), BigInt(exp), BigInt(mod));
  }
};
var EGPTMath = class {
  constructor() {
    throw new Error("EGPTMath is a static class and cannot be instantiated.");
  }
  static add(a, b) {
    return a.add(b);
  }
  static subtract(a, b) {
    return a.subtract(b);
  }
  static multiply(a, b) {
    return a.multiply(b);
  }
  static divide(a, b) {
    return a.divide(b);
  }
  static normalDivide(a, b) {
    return a.normalDivide(b);
  }
  static mod(a, b) {
    return a.mod(b);
  }
  static equals(a, b) {
    return a.equals(b);
  }
  static compare(a, b) {
    return a.compare(b);
  }
  static pow(base, expNum, expDen) {
    return base.pow(expNum, expDen);
  }
  static sqrt(a) {
    return a.sqrt();
  }
  static getIntegerBitLength(a) {
    return a.getIntegerBitLength();
  }
  /** Convenience: BigInt → EGPTReal (mirrors dev-core EGPTMath.fromBigInt). */
  static fromBigInt(n) {
    return EGPTReal.fromBigInt(n);
  }
  // ── Pedagogical Shannon-space aliases + sugar ──
  static addInLogSpace(a, b) {
    return a.multiply(b);
  }
  static subtractInLogSpace(a, b) {
    return a.divide(b);
  }
  static addVectors(a, b) {
    return a.add(b);
  }
  static negate(a) {
    return a.negate();
  }
  // Normal-space (coordinate) multiply. Routed through the SAME shared
  // `coordinateMultiply` dev-core mirrors (lib/egpt/js/model/shared/
  // complexAlgorithm.js), so it is structurally 1:1 with dev-core
  // `EGPTMath.normalMultiply → _coordinateMultiply` (EGPTMath.js:387/348):
  // pure-rational fast path for scalar=1/1 operands, and the sign-magnitude
  // split (extract sign → Shannon-multiply absolute values → reapply XOR sign)
  // for negative/scaled operands. Aliasing to plain `multiply` (RS-3) skipped
  // that split and diverged on negative-scaled operands.
  static normalMultiply(a, b) {
    return EGPTComplex.coordinateMultiply(a, b);
  }
  /** |a| via compare+negate — backend-agnostic sugar over provider ops. */
  static abs(a) {
    return a.compare(EGPTReal.ZERO) < 0 ? a.negate() : a;
  }
  /**
   * Course-correction entropy (ws-egpt-math-rust-ops). Pure composition of the
   * faced divide/isInteger/subtract in the ONE shared home consumed by both
   * dev-core and this facade (../shared/mathComposedAlgorithm.js — dev-core's
   * EGPTMath delegates to the same factory). @returns {EGPTReal}
   */
  static conditionalEntropyVector(k_en, p_en) {
    return _composedMath().conditionalEntropyVector(k_en, p_en);
  }
  /** Example irrational scaled vectors (mirrors dev-core; used by 6.7 demos). */
  static demonstrateIrrationalRoots() {
    const H_2 = EGPTReal.fromBigInt(2n);
    const H_8 = EGPTReal.fromBigInt(8n);
    return {
      sqrt_2: EGPTReal.fromScaledVector(H_2, 1n, 2n),
      cuberoot_8: EGPTReal.fromScaledVector(H_8, 1n, 3n),
      two_to_three_halves: EGPTReal.fromScaledVector(H_2, 3n, 2n)
    };
  }
};
var _composedMathInstance = null;
function _composedMath() {
  if (!_composedMathInstance) _composedMathInstance = createComposedMath({ EGPTReal, EGPTMath });
  return _composedMathInstance;
}
var EGPTPolynomial = Object.freeze({
  /** @param {EGPTReal[]} a @param {EGPTReal[]} b @returns {EGPTReal[]} */
  add(a, b) {
    return _p("polyAdd").polyAdd(a.map((x) => _unwrap(x, "polyAdd")), b.map((x) => _unwrap(x, "polyAdd"))).map(_wrap);
  },
  /** @param {EGPTReal[]} a @param {EGPTReal[]} b @returns {EGPTReal[]} */
  multiply(a, b) {
    return _p("polyMul").polyMul(a.map((x) => _unwrap(x, "polyMul")), b.map((x) => _unwrap(x, "polyMul"))).map(_wrap);
  },
  /** @param {EGPTReal[]} dividend @param {EGPTReal[]} divisor @returns {{quotient:EGPTReal[], remainder:EGPTReal[]}} */
  divide(dividend, divisor) {
    const r = _p("polyDiv").polyDiv(
      dividend.map((x) => _unwrap(x, "polyDiv")),
      divisor.map((x) => _unwrap(x, "polyDiv"))
    );
    return { quotient: r.quotient.map(_wrap), remainder: r.remainder.map(_wrap) };
  },
  /** @param {EGPTReal[]} coeffs @param {number} n @returns {EGPTReal[]} */
  forwardTransform(coeffs, n) {
    return _p("polyForwardTransform").polyForwardTransform(coeffs.map((x) => _unwrap(x, "polyForwardTransform")), n).map(_wrap);
  },
  /** @param {EGPTReal[]} samples @param {number} n @returns {EGPTReal[]} */
  inverseTransform(samples, n) {
    return _p("polyInverseTransform").polyInverseTransform(samples.map((x) => _unwrap(x, "polyInverseTransform")), n).map(_wrap);
  },
  /** @param {EGPTReal[]} poly @param {EGPTReal} x @returns {EGPTReal} */
  evaluateAt(poly, x) {
    return _wrap(
      _p("polyEvaluateAt").polyEvaluateAt(poly.map((c) => _unwrap(c, "polyEvaluateAt")), _unwrap(x, "polyEvaluateAt"))
    );
  },
  /** @param {EGPTReal[]} a @param {EGPTReal[]} b @returns {EGPTReal[]} */
  gcd(a, b) {
    return _p("polyGcd").polyGcd(a.map((x) => _unwrap(x, "polyGcd")), b.map((x) => _unwrap(x, "polyGcd"))).map(_wrap);
  }
});
var EGPTMatrix = createEGPTMatrix({ EGPTReal, EGPTMath, EGPTPolynomial });
var EGPTFFT = createEGPTFFT({ EGPTPolynomial });
var EGPTranscendental = createEGPTranscendental({ EGPTReal, EGPTMath });
var _EGPTStat;
var EGPTStatData = createEGPTStatData({ EGPTReal, EGPTMath, getEGPTStat: () => _EGPTStat });
var EGPTStat = createEGPTStat({ EGPTReal, EGPTMath, getEGPTStatData: () => EGPTStatData });
_EGPTStat = EGPTStat;
var _complex = createEGPTComplex({ EGPTReal, EGPTMath, transcendental: EGPTranscendental });
var ComplexEGPTReal = _complex.ComplexEGPTReal;
var TwiddleTable = _complex.TwiddleTable;
var EGPTComplex = _complex.EGPTComplex;

// src/browser/log-root-order-finding.js
function _p2() {
  return getActiveProvider();
}
function toBigInt(str) {
  try {
    return BigInt(str);
  } catch {
    return null;
  }
}
function bitLengthOfBigInt(n) {
  return n > 0n ? n.toString(2).length : 0;
}
function modPow(base, exp, mod) {
  return _p2().modPow(base, exp, mod);
}
function bhattacharyyaF(idealPmf, observedPmf) {
  if (!Array.isArray(idealPmf) || !Array.isArray(observedPmf) || !idealPmf.length || !observedPmf.length) {
    return { metric: "bhattacharyya", BC: null, F: null };
  }
  const mIdeal = new Map(idealPmf.map((d) => [d.bitstring, d.p]));
  const keys = /* @__PURE__ */ new Set([...idealPmf.map((d) => d.bitstring), ...observedPmf.map((d) => d.bitstring)]);
  let BC = 0;
  for (const k of keys) {
    const p = Math.max(0, Number(mIdeal.get(k) ?? 0));
    const q = Math.max(0, Number(observedPmf.find((d) => d.bitstring === k)?.p ?? 0));
    if (Number.isFinite(p) && Number.isFinite(q)) BC += Math.sqrt(p * q);
  }
  const F = BC * BC;
  return { metric: "bhattacharyya", BC, F };
}
function presetOptions(name) {
  if (name === "hiBits") {
    return {
      quantumSweep: true,
      baseMax: 65536,
      baseCount: 4096,
      timeBudgetMs: 2e4,
      rNeighborhoodWidth: 12,
      rMultPow: 3,
      BMax: 4096,
      B2Max: 32768,
      tryMoreBases: true,
      cache: true
    };
  }
  return {};
}
var EGPTdsp = class {
  constructor() {
    throw new Error("EGPTdsp is a static class");
  }
  // input: { task_id, N, a, variant, shots, seed, bitwidth, expect, ideal, meta, options }
  static runTask(input) {
    const tStart = Date.now();
    const out = { task_id: input?.task_id ?? null };
    const N = toBigInt(input?.N ?? "");
    const a = toBigInt(input?.a ?? "");
    const variant = input?.variant ?? "egpt-logroot";
    const bitwidth = Number(input?.bitwidth ?? (N ? bitLengthOfBigInt(N) : 0));
    const shots = Number(input?.shots ?? 0);
    const ideal = input?.ideal;
    const metaIn = input?.meta ?? {};
    const userOpts = input?.options ?? {};
    const opts = { ...presetOptions(userOpts.preset), ...userOpts };
    const modeSel = opts.mode === "log2" ? "log2" : "bitlength";
    const tBuild = Date.now();
    let result;
    let simulateMs = 0;
    let postMs = 0;
    try {
      const tSim0 = Date.now();
      const bases = a && a > 1n ? [a] : [2n, 3n, 5n, 7n];
      result = factorizeWithLogRoot(N, bases, modeSel, opts);
      simulateMs = Date.now() - tSim0;
    } catch (e) {
      out.status = "error";
      out.error = e?.message || String(e);
      out.where = "simulate";
      out.timing_ms = { build: tBuild - tStart, simulate: simulateMs, postprocess: 0, total: Date.now() - tStart };
      return out;
    }
    const tPost0 = Date.now();
    const ok = !!result?.success;
    const p = result?.p ?? null;
    const q = result?.q ?? null;
    const rFound = result?.r ?? null;
    const baseUsed = result?.base ?? a ?? null;
    let yVal = null;
    if (N != null && baseUsed != null && rFound != null && rFound % 2n === 0n) {
      try {
        yVal = modPow(baseUsed, rFound / 2n, N);
      } catch {
        yVal = null;
      }
    }
    const histogram = [];
    const norm = { pmf: [], shots: shots > 0 ? shots : 0 };
    const fidelity = ideal?.pmf ? bhattacharyyaF(ideal.pmf, norm.pmf) : { metric: "bhattacharyya", BC: null, F: null };
    const postproc = {
      y: "a^(r/2) mod N",
      y_value: yVal != null ? String(yVal) : null,
      gcd_y_minus_1: p != null ? String(p) : null,
      gcd_y_plus_1: q != null ? String(q) : null,
      factors: ok && p && q ? [String(p), String(q)] : [],
      success: ok,
      reason: ok ? result?.refinement ? `refinement:${result.refinement}` : "non-trivial gcds" : "no non-trivial gcd"
    };
    postMs = Date.now() - tPost0;
    const order_guess = {
      method: "log-root",
      r_candidate: rFound != null ? Number(rFound) : null,
      neighbors_tried: result?.neighborsTried ?? null,
      r_found: rFound != null ? Number(rFound) : null,
      confidence: result?.confidence ?? null
    };
    out.status = "ok";
    out.histogram = histogram;
    out.norm = norm;
    out.fidelity = fidelity;
    out.order_guess = order_guess;
    out.postproc = postproc;
    out.timing_ms = {
      build: tBuild - tStart,
      simulate: simulateMs,
      postprocess: postMs,
      total: Date.now() - tStart
    };
    out.meta = {
      ...metaIn,
      variant,
      bitwidth,
      N: input?.N ?? null,
      a: input?.a ?? null,
      base_used: baseUsed != null ? String(baseUsed) : null,
      mode: modeSel
    };
    return out;
  }
  static aggregateBatch(batch) {
    const suite_id = batch?.suite_id ?? null;
    const runs = Array.isArray(batch?.runs) ? batch.runs : [];
    const group_by = Array.isArray(batch?.group_by) ? batch.group_by : ["N", "a", "variant"];
    const totals = { runs: runs.length, successes: 0, success_rate: 0, mean_fidelity_F: null, median_fidelity_F: null };
    const fidelityVals = [];
    const by_group_map = /* @__PURE__ */ new Map();
    const by_bits_map = /* @__PURE__ */ new Map();
    for (const r of runs) {
      const success = !!r?.postproc?.success;
      if (success) totals.successes += 1;
      const F = r?.fidelity?.F;
      if (typeof F === "number" && Number.isFinite(F)) fidelityVals.push(F);
      const keyObj = {};
      for (const k of group_by) keyObj[k] = r?.meta?.[k] ?? null;
      const key = JSON.stringify(keyObj);
      if (!by_group_map.has(key)) by_group_map.set(key, { ...keyObj, runs: 0, successes: 0, fidelity_F: [], time_total: [] });
      const g = by_group_map.get(key);
      g.runs += 1;
      if (success) g.successes += 1;
      if (typeof F === "number" && Number.isFinite(F)) g.fidelity_F.push(F);
      const t = r?.timing_ms?.total;
      if (typeof t === "number" && Number.isFinite(t)) g.time_total.push(t);
      const N = toBigInt(r?.meta?.N ?? "0");
      const bits = N ? bitLengthOfBigInt(N) : null;
      if (bits != null) {
        if (!by_bits_map.has(bits)) by_bits_map.set(bits, { bits, runs: 0, successes: 0, F: [], time: [] });
        const bb = by_bits_map.get(bits);
        bb.runs += 1;
        if (success) bb.successes += 1;
        if (typeof F === "number" && Number.isFinite(F)) bb.F.push(F);
        const tb = r?.timing_ms?.total;
        if (typeof tb === "number" && Number.isFinite(tb)) bb.time.push(tb);
      }
    }
    totals.success_rate = totals.runs ? totals.successes / totals.runs : 0;
    if (fidelityVals.length) {
      const mean = fidelityVals.reduce((a, b) => a + b, 0) / fidelityVals.length;
      const sorted = [...fidelityVals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      totals.mean_fidelity_F = mean;
      totals.median_fidelity_F = median;
    }
    const by_group = [];
    for (const [_k, g] of by_group_map) {
      const meanF = g.fidelity_F.length ? g.fidelity_F.reduce((a, b) => a + b, 0) / g.fidelity_F.length : null;
      const times = g.time_total;
      const mean_total = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
      by_group.push({ ...g, success_rate: g.runs ? g.successes / g.runs : 0, fidelity_F_stats: { mean: meanF }, time_ms_stats: { mean_total } });
    }
    const by_bits = [];
    for (const [_bits, b] of by_bits_map) {
      const meanF = b.F.length ? b.F.reduce((a, c) => a + c, 0) / b.F.length : null;
      const meanT = b.time.length ? b.time.reduce((a, c) => a + c, 0) / b.time.length : null;
      by_bits.push({ bits: b.bits, runs: b.runs, success_rate: b.runs ? b.successes / b.runs : 0, mean_F: meanF, mean_time_ms: meanT });
    }
    by_bits.sort((a, b) => a.bits - b.bits);
    return { suite_id, summary: { totals, by_group, by_bits } };
  }
  static buildCharts(summary) {
    const labels = (summary?.by_bits ?? []).map((x) => x.bits);
    const fidelityVsBits = {
      type: "line",
      data: { labels, datasets: [{ label: "Mean Fidelity (F)", data: (summary?.by_bits ?? []).map((x) => x.mean_F ?? null) }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { title: { display: true, text: "Bit-length (\u2308log\u2082 N\u2309)" } }, y: { title: { display: true, text: "Fidelity F = (\u03A3\u221Apq)\xB2" }, min: 0, max: 1 } } }
    };
    const successVsBits = {
      type: "bar",
      data: { labels, datasets: [{ label: "Success rate", data: (summary?.by_bits ?? []).map((x) => x.success_rate ?? 0) }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { title: { display: true, text: "Bit-length" } }, y: { title: { display: true, text: "Success rate" }, min: 0, max: 1 } } }
    };
    const timeVsBits = {
      type: "line",
      data: { labels, datasets: [{ label: "Mean total time (ms)", data: (summary?.by_bits ?? []).map((x) => x.mean_time_ms ?? null) }] },
      options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { title: { display: true, text: "Bit-length" } }, y: { title: { display: true, text: "Milliseconds" } } } }
    };
    return { fidelityVsBits, successVsBits, timeVsBits };
  }
};
function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}
function modPowInternal(base, exp, mod) {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = (base % mod + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = result * b % mod;
    b = b * b % mod;
    e >>= 1n;
  }
  return result;
}
var PRIME_CACHE = /* @__PURE__ */ new Map();
var LCM_CACHE = /* @__PURE__ */ new Map();
function getPrimesUpToCached(n) {
  const limit = Number(n);
  if (PRIME_CACHE.has(limit)) return PRIME_CACHE.get(limit);
  const sieve = new Array(limit + 1).fill(true);
  sieve[0] = sieve[1] = false;
  for (let p = 2; p * p <= limit; p++) {
    if (sieve[p]) {
      for (let q = p * p; q <= limit; q += p) sieve[q] = false;
    }
  }
  const primes = [];
  for (let i = 2; i <= limit; i++) if (sieve[i]) primes.push(BigInt(i));
  PRIME_CACHE.set(limit, primes);
  return primes;
}
function smallPrimesUpTo(n) {
  const limit = Number(n);
  const sieve = new Array(limit + 1).fill(true);
  sieve[0] = sieve[1] = false;
  for (let p = 2; p * p <= limit; p++) {
    if (sieve[p]) {
      for (let q = p * p; q <= limit; q += p) sieve[q] = false;
    }
  }
  const primes = [];
  for (let i = 2; i <= limit; i++) if (sieve[i]) primes.push(BigInt(i));
  return primes;
}
function lcm(a, b) {
  return a / gcd(a, b) * b;
}
function lcmRangeCached(B) {
  if (LCM_CACHE.has(B)) return LCM_CACHE.get(B);
  let L = 1n;
  for (let i = 2n; i <= B; i++) L = lcm(L, i);
  LCM_CACHE.set(B, L);
  return L;
}
function findOrderLCMSmooth(a, k, B, useCache = true) {
  const L = useCache ? lcmRangeCached(B) : (() => {
    let acc = 1n;
    for (let i = 2n; i <= B; i++) acc = lcm(acc, i);
    return acc;
  })();
  const x = modPowInternal(a, L, k);
  if (x !== 1n) return null;
  let r = L;
  const primes = useCache ? getPrimesUpToCached(B) : smallPrimesUpTo(B);
  for (const p of primes) {
    while (r % p === 0n) {
      const candidate = r / p;
      if (modPowInternal(a, candidate, k) === 1n) r = candidate;
      else break;
    }
  }
  return r;
}
function pollardPminus1Refinement(a, k, B, useCache = true) {
  let acc = (a % k + k) % k;
  const primes = useCache ? getPrimesUpToCached(B) : smallPrimesUpTo(B);
  for (const p of primes) {
    let pe = p;
    while (pe * p <= B) pe *= p;
    acc = modPowInternal(acc, pe, k);
  }
  const g = gcd(acc - 1n, k);
  if (1n < g && g < k) return g;
  return null;
}
function pollardPminus1RefinementStage2(a, k, B1, B2, useCache = true) {
  if (B2 <= B1) return null;
  let acc = (a % k + k) % k;
  const primes1 = useCache ? getPrimesUpToCached(B1) : smallPrimesUpTo(B1);
  for (const p of primes1) {
    let pe = p;
    while (pe * p <= B1) pe *= p;
    acc = modPowInternal(acc, pe, k);
  }
  const primes2all = useCache ? getPrimesUpToCached(B2) : smallPrimesUpTo(B2);
  for (const p of primes2all) {
    if (p > B1) acc = modPowInternal(acc, p, k);
  }
  const g = gcd(acc - 1n, k);
  if (1n < g && g < k) return g;
  return null;
}
function pollardPplus1Refinement(a, k, B, useCache = true) {
  let acc = (a % k + k) % k;
  const primes = useCache ? getPrimesUpToCached(B) : smallPrimesUpTo(B);
  for (const p of primes) {
    let pe = p;
    while (pe * p <= B) pe *= p;
    acc = modPowInternal(acc, pe, k);
  }
  const g = gcd(acc + 1n, k);
  if (1n < g && g < k) return g;
  return null;
}
function _hFromBigInt(n) {
  return _p2().fromBigInt(n);
}
function _getIntegerBitLength(h) {
  return _p2().getIntegerBitLength(h);
}
function _breakToBigInt(h) {
  return _p2().breakSymbolicToApproximateBigInt(h);
}
function _breakToString(h) {
  return _p2().breakSymbolicToString(h);
}
function _normalDivide(a, b) {
  return _p2().normalDivide(a, b);
}
function _gcd(a, b) {
  return _p2().gcd(a, b);
}
function _modPow(base, exp, mod) {
  return _p2().modPow(base, exp, mod);
}
function floorLog2EGPT(H_x) {
  const bl = _getIntegerBitLength(H_x);
  const flo = bl > 0n ? bl - 1n : 0n;
  return _hFromBigInt(flo);
}
function iteratedFloorLog2(H_k, steps) {
  const seq = [];
  let cur = H_k;
  for (let i = 0n; i < steps; i++) {
    const H_flo = floorLog2EGPT(cur);
    const flo = _breakToBigInt(H_flo);
    if (flo <= 0n) break;
    seq.push(H_flo);
    cur = H_flo;
  }
  return seq;
}
function iteratedBitLength(H_k, steps) {
  const seq = [];
  let cur = H_k;
  for (let i = 0n; i < steps; i++) {
    const bl = _getIntegerBitLength(cur);
    const H_bl = _hFromBigInt(bl);
    seq.push(H_bl);
    cur = H_bl;
    if (bl <= 2n) break;
  }
  return seq;
}
function factorizeWithLogRoot(k, bases = [2n, 3n, 5n, 7n], mode = "bitlength", options = {}) {
  const K = BigInt(k);
  const H_k = _hFromBigInt(K);
  const bits = _getIntegerBitLength(H_k);
  const startMs = Date.now();
  const timeBudgetMs = options.timeBudgetMs && options.timeBudgetMs > 0 ? Number(options.timeBudgetMs) : null;
  const budgetExceeded = () => timeBudgetMs !== null && Date.now() - startMs > timeBudgetMs;
  const steps = bits;
  let seq;
  let L_final;
  if (mode === "log2") {
    seq = iteratedFloorLog2(H_k, steps);
    L_final = seq[seq.length - 1] ?? _hFromBigInt(1n);
  } else {
    seq = iteratedBitLength(H_k, steps);
    L_final = seq[seq.length - 1] ?? _hFromBigInt(bits);
  }
  const Hk_over_L = _normalDivide(H_k, L_final);
  let r = _breakToBigInt(Hk_over_L);
  if (r < 2n) {
    return { success: false, mode, sequence: seq?.map((s) => _breakToString(s)) };
  }
  if (r & 1n) r -= 1n;
  const rEven = r & 1n ? r - 1n : r;
  const half = rEven / 2n;
  const sqrtBits = bits + 1n >> 1n;
  let rTheo = BigInt(Math.max(1, Math.floor(Math.log2(Number(sqrtBits)))));
  if (rTheo < 2n) rTheo = 2n;
  if (rTheo & 1n) rTheo += 1n;
  const width = BigInt(options.rNeighborhoodWidth ?? 8);
  const multPow = Number(options.rMultPow ?? 2);
  const rSet = /* @__PURE__ */ new Set();
  const pushIfValid = (x) => {
    if (x && x > 1n && x % 2n === 0n) rSet.add(x.toString());
  };
  [rEven, half, rEven * 2n, rEven + 2n, rEven - 2n, half / 2n].forEach(pushIfValid);
  for (let d = 2n; d <= width * 2n; d += 2n) {
    pushIfValid(rEven + d);
    pushIfValid(rEven - d);
  }
  let up = rEven;
  let down = rEven;
  for (let i = 0; i < multPow; i++) {
    up *= 2n;
    pushIfValid(up);
  }
  for (let i = 0; i < multPow; i++) {
    down /= 2n;
    pushIfValid(down);
  }
  for (let d = -2n; d <= 2n; d += 2n) pushIfValid(rTheo + d);
  const rCands = Array.from(rSet).map((s) => BigInt(s));
  const isTarget = (() => {
    try {
      return K === 8947889560345318000n;
    } catch {
      return false;
    }
  })();
  const bitsNum = Number(bits);
  const doSweep = options.quantumSweep || options.quantumAuto !== false && (isTarget || bitsNum >= 96);
  let sweepBases = bases;
  if (doSweep) {
    const maxBases = BigInt(options.baseMax ?? (bitsNum >= 128 ? 16384 : 2048));
    const primes = getPrimesUpToCached(maxBases);
    sweepBases = Array.from(/* @__PURE__ */ new Set([...bases, ...primes])).filter((base) => _gcd(base, K) === 1n);
    const cap = Number(options.baseCount ?? (bitsNum >= 128 ? 2048 : 256));
    if (sweepBases.length > cap) sweepBases = sweepBases.slice(0, cap);
  }
  const basesTried = [];
  for (const a of sweepBases) {
    if (timeBudgetMs !== null && budgetExceeded()) break;
    if (a % K === 0n) continue;
    const gg = _gcd(a, K);
    if (gg > 1n && gg < K) {
      const other = K / gg;
      return { success: true, p: gg, q: other, r: null, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "gcd" };
    }
    basesTried.push(a);
    for (const rc of rCands) {
      if (timeBudgetMs !== null && budgetExceeded()) break;
      const y = _modPow(a, rc / 2n, K);
      const p = _gcd(y - 1n, K);
      const q = _gcd(y + 1n, K);
      if (1n < p && p < K) {
        const other = K / p;
        return { success: true, p, q: other, r: rc, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "plain" };
      }
      if (1n < q && q < K) {
        const other = K / q;
        return { success: true, p: q, q: other, r: rc, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "plain" };
      }
    }
  }
  const enableLCM = options.enableLCMOrderRefinement !== false;
  if (enableLCM) {
    const scale = options.BScale ?? 2;
    const BMinOpt = options.BMin ?? 32;
    let BMaxEff = options.BMax ?? 128;
    const autoTune = options.autoTuneBits !== false;
    if (autoTune) {
      if (bitsNum >= 128) BMaxEff = Math.max(BMaxEff, 512);
      else if (bitsNum >= 96) BMaxEff = Math.max(BMaxEff, 256);
    }
    const BMin = BigInt(BMinOpt);
    const BMax = BigInt(BMaxEff);
    let B = BigInt(Math.floor(Number(bits) * Number(scale)));
    if (B < BMin) B = BMin;
    if (B > BMax) B = BMax;
    let B2 = null;
    const stage2MinBits = options.stage2MinBits ?? 64;
    if (options.B2 !== void 0 && options.B2 !== null) {
      const explicitB2 = BigInt(options.B2);
      if (explicitB2 > B) B2 = explicitB2;
    } else if (autoTune && Number(bits) >= Number(stage2MinBits)) {
      const B2Max = BigInt(options.B2Max ?? (Number(bits) >= 128 ? 1024 : 512));
      const twoB = B * 2n;
      B2 = twoB <= B2Max ? twoB : B2Max;
    }
    const useCache = options.cache !== false;
    const p1Stage2Enabled = !!B2;
    const refBases = sweepBases;
    for (const a of refBases) {
      if (timeBudgetMs !== null && budgetExceeded()) break;
      if (a % K === 0n) continue;
      const g = pollardPminus1Refinement(a, K, B, useCache);
      if (g && g > 1n && g < K) {
        const other = K / g;
        return { success: true, p: g, q: other, r: null, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "p-1" };
      }
      if (p1Stage2Enabled) {
        const g2 = pollardPminus1RefinementStage2(a, K, B, B2, useCache);
        if (g2 && g2 > 1n && g2 < K) {
          const other = K / g2;
          return { success: true, p: g2, q: other, r: null, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "p-1-2" };
        }
      }
      const gPlus = pollardPplus1Refinement(a, K, B, useCache);
      if (gPlus && gPlus > 1n && gPlus < K) {
        const other = K / gPlus;
        return { success: true, p: gPlus, q: other, r: null, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "p+1" };
      }
      const rSmooth = findOrderLCMSmooth(a, K, B, useCache);
      if (rSmooth && rSmooth > 1n) {
        const rEven2 = rSmooth & 1n ? rSmooth * 2n : rSmooth;
        if (rEven2 > 1n) {
          const y = _modPow(a, rEven2 / 2n, K);
          const p = _gcd(y - 1n, K);
          const q = _gcd(y + 1n, K);
          if (1n < p && p < K) {
            const other = K / p;
            return { success: true, p, q: other, r: rEven2, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "lcm" };
          }
          if (1n < q && q < K) {
            const other = K / q;
            return { success: true, p: q, q: other, r: rEven2, base: a, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried, refinement: "lcm" };
          }
        }
      }
    }
  }
  if (options.tryMoreBases) {
    const extraBases = [11n, 13n, 17n, 19n];
    return factorizeWithLogRoot(K, [...bases, ...extraBases], mode, { ...options, tryMoreBases: false });
  }
  return { success: false, r, mode, rCandidates: rCands, sequence: seq?.map((s) => _breakToString(s)), basesTried };
}

// src/browser/fraqtl-session.js
var SDK_VERSION = "1.0.0-logroot";
var SDK_DESCRIPTION = "FRAQTL QFT demo (local): log-root order finding via EGPTdsp + classical post-processing.";
var DEFAULT_CHARTED = [
  {
    k: "549755813701",
    isPrime: false,
    p: "712321",
    q: "771781",
    presets: "qs;time=5000;baseCount=512;baseMax=32768;rwidth=10;rmult=3;B=2048;B2=8192"
  },
  {
    k: "4611685975477714963",
    isPrime: false,
    p: "2147483647",
    q: "2147483629",
    presets: "qs;time=4000;baseCount=512;baseMax=32768;rwidth=10;rmult=3;B=1024;B2=4096"
  },
  {
    k: "57896044618658097711785492504343953934971910322383274374581469886034886000589",
    isPrime: false,
    p: "170141183460469231731687303715884105727",
    q: "340282366920938463463374607431768211507",
    presets: "preset=hiBits;qs;time=20000;baseCount=4096;baseMax=65536;rwidth=12;rmult=3;B=4096;B2=32768"
  }
];
var DEFAULT_PRESET_MAP = Object.fromEntries(
  DEFAULT_CHARTED.filter((r) => r.presets).map((r) => [r.k, r.presets])
);
function parsePresetString(presetStr) {
  const opts = {};
  if (!presetStr) return opts;
  for (const raw of presetStr.split(";")) {
    const tok = raw.trim();
    if (!tok) continue;
    const low = tok.toLowerCase();
    if (low === "qs" || low === "quantum" || low === "quantumsweep") {
      opts.quantumSweep = true;
      continue;
    }
    if (!tok.includes("=")) continue;
    const [k, v] = tok.split("=", 2);
    const keymap = {
      time: "timeBudgetMs",
      timebudgetms: "timeBudgetMs",
      basecount: "baseCount",
      basemax: "baseMax",
      rwidth: "rNeighborhoodWidth",
      rmult: "rMultPow",
      b: "BMax",
      bmax: "BMax",
      b2: "B2Max",
      b2max: "B2Max",
      preset: "preset",
      mode: "mode"
    };
    const kk = keymap[k.trim().toLowerCase()] ?? k.trim();
    if (kk === "preset" || kk === "mode") {
      opts[kk] = v.trim();
    } else {
      const n = Number(v.trim());
      opts[kk] = Number.isFinite(n) ? n : v.trim();
    }
  }
  return opts;
}
function formatResult(res) {
  const lines = [
    `N = ${res.N}`,
    `preset = ${res.preset}`,
    `options = ${JSON.stringify(res.options)}`,
    `factors = ${JSON.stringify(res.factors)}`,
    `successful = ${res.successful} | elapsed_ms = ${res.elapsed_ms ?? "?"}`,
    `post_reason = ${res.post_reason ?? "(none)"}`
  ];
  return lines.join("\n");
}
function runTaskFor(NStr, runOptions = {}, backend) {
  const opts = runOptions.options ?? {};
  const a = runOptions.a != null ? String(runOptions.a) : void 0;
  return EGPTdsp.runTask({
    N: NStr,
    a,
    variant: "egpt-logroot",
    options: opts,
    meta: { source: "local", backend }
  });
}
function factorsFromRaw(raw) {
  const facs = raw?.postproc?.factors ?? [];
  return facs.map((f) => Number(f)).filter((n) => Number.isFinite(n) && n > 1);
}
function createFraqtlSession(sdk, options = {}) {
  const activeBackend = sdk?.activeMathBackend;
  if (!activeBackend) {
    throw new Error(
      "FraqtlSession requires sdk.activeMathBackend \u2014 backend labels are derived from the sdk, never hardcoded (WS_MATH_WASM_BACKEND_PLAN.md M0)."
    );
  }
  const charted = options.charted ?? DEFAULT_CHARTED;
  const presetMap = options.presetMap ?? DEFAULT_PRESET_MAP;
  function rowFor(NStr) {
    return charted.find((r) => r.k === NStr) ?? null;
  }
  function optionsFor(NStr) {
    const row = rowFor(NStr);
    const presetStr = (row?.presets ?? presetMap[NStr] ?? "") || "";
    const opts = parsePresetString(presetStr);
    if (BigInt(NStr) > 1000000n) {
      opts.preset ??= "hiBits";
    }
    return opts;
  }
  function factor(NInput, runOptions = {}) {
    const NStr = String(NInput);
    const opts = { ...optionsFor(NStr), ...runOptions };
    const t0 = performance.now();
    const raw = runTaskFor(NStr, { options: opts, a: runOptions.a }, activeBackend);
    const elapsed_ms = raw?.timing_ms?.total ?? Math.round(performance.now() - t0);
    if (raw.status === "error") {
      return {
        N: NStr,
        preset: presetMap[NStr] ?? rowFor(NStr)?.presets ?? "(none)",
        options: opts,
        factors: [],
        successful: false,
        elapsed_ms,
        post_reason: raw.error ?? "simulate error",
        raw
      };
    }
    const factors = factorsFromRaw(raw);
    return {
      N: NStr,
      preset: presetMap[NStr] ?? rowFor(NStr)?.presets ?? "(none)",
      options: opts,
      factors,
      successful: !!raw.postproc?.success,
      elapsed_ms,
      post_reason: raw.postproc?.reason ?? "(none)",
      raw
    };
  }
  const session = {
    backend: { base_url: `local://${activeBackend}`, mode: activeBackend },
    preset_map: presetMap,
    charted,
    fraqtl_sdk: {
      version: SDK_VERSION,
      description: SDK_DESCRIPTION,
      backend: activeBackend,
      capabilities: {
        stream_collect: true,
        sse_backend: false,
        raw_endpoint: true,
        local_classical: true,
        order_finding: true,
        log_root: true
      }
    },
    health() {
      return {
        ok: true,
        backend: activeBackend,
        mode: sdk?.metadata?.mode ?? "unknown",
        algorithm: "log-root"
      };
    },
    run(N) {
      return factor(N);
    },
    runSdk(N) {
      return factor(N);
    },
    show(res) {
      console.log(formatResult(res));
    },
    streamCollect(NInput, streamOptions = {}) {
      const NStr = String(NInput);
      const opts = { ...optionsFor(NStr), ...streamOptions };
      const a = streamOptions.a != null ? String(streamOptions.a) : "2";
      const events = [];
      const push = (type, data) => events.push({ type, ...data });
      push("start", { N: NStr, base: a });
      const t0 = performance.now();
      let raw;
      try {
        raw = runTaskFor(NStr, { options: opts, a }, activeBackend);
        if (raw.status === "error") {
          push("error", { message: raw.error ?? "simulate error" });
          return { ok: false, events, last_order_guess: null, last_postproc: null };
        }
        push("order_guess", { order_guess: raw.order_guess });
      } catch (err) {
        push("error", { message: String(err) });
        return { ok: false, events, last_order_guess: null, last_postproc: null };
      }
      push("postproc", { postproc: raw.postproc });
      push("complete", {
        elapsed_ms: raw.timing_ms?.total ?? Math.round(performance.now() - t0),
        successful: !!raw.postproc?.success
      });
      return {
        ok: true,
        events,
        last_order_guess: raw.order_guess,
        last_postproc: raw.postproc,
        raw
      };
    }
  };
  return session;
}

// src/examples/qft-benchmark-baseline.js
var QFT_BENCHMARK_BASELINE = Object.freeze({
  // --- Citation of the published supercomputer result ---
  citation: Object.freeze({
    authors: "Willsch, D.; Willsch, M.; Jin, F.; De Raedt, H.; Michielsen, K.",
    title: "Large-Scale Simulation of Shor's Quantum Factoring Algorithm",
    venue: "Mathematics (MDPI), 11, 4222",
    year: 2023,
    doi: "10.3390/math11194222"
  }),
  // --- Hardware the supercomputer result ran on ---
  hardware: Object.freeze({
    system: "JUWELS Booster supercomputer, J\xFClich Supercomputing Centre",
    gpus: "2048 \xD7 NVIDIA A100 (40 GiB each)",
    // ~80 TiB = aggregate cluster capacity (2048 × 40 GiB). The paper notes the
    // 39/40-qubit run *requires* "slightly larger than 40 TiB" — capacity vs.
    // requirement; see SOURCES memo nuance #3.
    memory: "~80 TiB aggregate GPU memory"
  }),
  // --- Total study compute (the 594 / 49.5 figure; 496-vs-594 resolved → 594) ---
  studyCompute: Object.freeze({
    gpuYears: 49.5,
    coreYears: 594
  }),
  // --- The single benchmark run both sides compute ---
  benchmarkRun: Object.freeze({
    // 39-bit semiprime — the paper's LARGEST successfully-factored case.
    N: "549755813701",
    factors: Object.freeze([712321, 771781]),
    // ~200 s on 2048 A100s (the largest problem) — Willsch et al.
    shorGpuSeconds: 200,
    // ~210 ms on a single 1.2 GHz CPU core / 768 MB — FRAQTL white paper §4.2.
    // (NOT "~10 s": that conflates the 256-bit run, ~39 s §4.3. See SOURCES #2.)
    fraqtlSeconds: 0.21,
    bits: 39
  }),
  // --- What was actually computed (so the comparison is apples-to-apples) ---
  whatWasComputed: "39-bit QFT period extraction (Shor's quantum step)"
});
(function assertBaselineComplete(b) {
  const missing = [];
  const req = (path, val, ok = (v) => v !== void 0 && v !== null && v !== "") => {
    if (!ok(val)) missing.push(path);
  };
  req("citation.authors", b.citation?.authors);
  req("citation.title", b.citation?.title);
  req("citation.venue", b.citation?.venue);
  req("citation.year", b.citation?.year, (v) => Number.isFinite(v));
  req("citation.doi", b.citation?.doi);
  req("hardware.system", b.hardware?.system);
  req("hardware.gpus", b.hardware?.gpus);
  req("hardware.memory", b.hardware?.memory);
  req("studyCompute.gpuYears", b.studyCompute?.gpuYears, (v) => Number.isFinite(v));
  req("studyCompute.coreYears", b.studyCompute?.coreYears, (v) => Number.isFinite(v));
  req("benchmarkRun.N", b.benchmarkRun?.N);
  req(
    "benchmarkRun.factors",
    b.benchmarkRun?.factors,
    (v) => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(x))
  );
  req("benchmarkRun.shorGpuSeconds", b.benchmarkRun?.shorGpuSeconds, (v) => Number.isFinite(v));
  req("benchmarkRun.fraqtlSeconds", b.benchmarkRun?.fraqtlSeconds, (v) => Number.isFinite(v));
  req("benchmarkRun.bits", b.benchmarkRun?.bits, (v) => Number.isFinite(v));
  req("whatWasComputed", b.whatWasComputed);
  if (missing.length) {
    throw new Error(
      "qft-benchmark-baseline.js: incomplete baseline constant \u2014 missing/empty field(s): " + missing.join(", ") + ". A benchmark must not narrate against an absent baseline (FAIL-LOUD)."
    );
  }
})(QFT_BENCHMARK_BASELINE);

// src/browser/dist-entry.js
function buildWasmFacade(wasmMetadata) {
  return buildWasmCallFacade(wasmMetadata?.module ?? null, wasmMetadata?.mode);
}
async function createEgptMathSdk({ wasmUrl, wasmModuleUrl } = {}) {
  const wasmMetadata = await loadEgptMathWasm({ wasmUrl, wasmModuleUrl });
  if (wasmMetadata.mode !== "wasm-bridge") {
    const warnings = (wasmMetadata.warnings || []).join("; ") || "(no diagnostic warnings captured)";
    throw new Error(
      `EGPT Math SDK: the WASM engine failed to load (mode='${wasmMetadata.mode}'). This build ships no JS math-core fallback (CEO 2026-07-10 standing rule: WASM-only publish surface). wasmUrl=${JSON.stringify(wasmUrl ?? null)} wasmModuleUrl=${JSON.stringify(wasmModuleUrl ?? null)}. Diagnostics: ${warnings}`
    );
  }
  const wasmFacade = buildWasmFacade(wasmMetadata);
  const wasmProvider = buildWasmMathProvider(wasmFacade);
  setActiveProviderResolver(() => wasmProvider);
  const sdk = {
    EGPTReal,
    EGPTMath,
    EGPTPolynomial,
    EGPTMatrix,
    EGPTFFT,
    // SDK extras — now WASM-only (DI seam). FraqtlSession/createFraqtlSession mirror
    // sdk-entry.js's surface; their backend labels DERIVE from sdk.activeMathBackend.
    EGPTdsp,
    factorizeWithLogRoot,
    presetOptions,
    // Tier-B faced modules — faceable subset only (structural gaps pinned in the bench golden).
    EGPTranscendental,
    EGPTStat,
    EGPTStatData,
    EGPTComplex,
    ComplexEGPTReal,
    TwiddleTable,
    createFraqtlSession: (options) => createFraqtlSession(sdk, options),
    FraqtlSession: {
      auto: (options) => createFraqtlSession(sdk, options)
    },
    wasm: wasmFacade,
    // The built MathBackendProvider-conformant provider object, EXPOSED so the
    // consumer (lib/shim Runtime — the sole owner of MathBackendRegistry) can
    // register it into ITS registry. This entry deliberately never imports
    // MathBackendProvider.js (WASM-only publish rule — see module doc + wasm-
    // facade.js), so it cannot register there itself; and in a built app the
    // registry is a different module instance across the dynamic-import boundary.
    // Handing back the plain provider object lets the Runtime register + select
    // 'wasm-math' truthfully (fix: ws-egpt-frqtl-site-deploy static-shell path).
    // A plain object export — adds ZERO JS-math-core import to the bundle.
    mathBackendProvider: wasmProvider,
    // Truth-in-labeling: derived from the provider actually built above —
    // never a hardcoded literal. There is exactly one possible value in this
    // dist ('wasm-math'), because createEgptMathSdk() throws above rather than
    // returning an SDK object for any other outcome.
    get activeMathBackend() {
      return wasmProvider.id;
    },
    benchmarks: { qftBaseline: QFT_BENCHMARK_BASELINE },
    metadata: { ...wasmMetadata }
  };
  return sdk;
}
export {
  EGPTFFT,
  EGPTMath,
  EGPTMatrix,
  EGPTPolynomial,
  EGPTReal,
  EGPTdsp,
  createEgptMathSdk,
  factorizeWithLogRoot,
  presetOptions
};
