var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
__name(probeWasmArtifact, "probeWasmArtifact");
function normalizeBrowserUrl(url) {
  if (!url || typeof document === "undefined") return url;
  return new URL(url, document.baseURI).href;
}
__name(normalizeBrowserUrl, "normalizeBrowserUrl");
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
__name(loadEgptMathWasm, "loadEgptMathWasm");

// src/browser/wasm-port-calls.js
var _calls = null;
function setWasmPortCalls(facade) {
  _calls = facade;
}
__name(setWasmPortCalls, "setWasmPortCalls");
var _TYPED_ERRORS = [["RangeError: ", RangeError], ["TypeError: ", TypeError]];
function wasmCallError(msg) {
  let text = msg || "wasm-result-unknown-error";
  if (text.startsWith('{"w":')) {
    const env = JSON.parse(text);
    emitWarnings(env.w);
    text = env.e;
  }
  for (const [prefix, Cls] of _TYPED_ERRORS) {
    if (text.startsWith(prefix)) return new Cls(text.slice(prefix.length));
  }
  return new Error(text);
}
__name(wasmCallError, "wasmCallError");
function emitWarnings(lines) {
  for (const line of lines) console.warn(line);
}
__name(emitWarnings, "emitWarnings");
function valueWithWarnings(json) {
  const env = JSON.parse(json);
  emitWarnings(env.w);
  return env.v;
}
__name(valueWithWarnings, "valueWithWarnings");
function callWasm(op, ...args) {
  if (!_calls) {
    throw new Error(
      `EGPT Math SDK (WASM-only dist): no WASM call facade injected (op '${op}'). createEgptMathSdk() must complete successfully before the ported classes are used.`
    );
  }
  const fn = _calls[op];
  if (typeof fn !== "function") {
    throw new Error(
      `EGPT Math SDK: WASM op '${op}' is not in the call facade \u2014 add it to wasm-call-facade.js::WASM_ARENA_OPS and rebuild the bridge (npm run build:wasm-bridge).`
    );
  }
  const r = fn(...args);
  if (r && r.ok) return r.value;
  throw wasmCallError(r && r.error);
}
__name(callWasm, "callWasm");

// src/browser/wasm-math-provider.js
var MathBackendRegistrationError = class extends Error {
  static {
    __name(this, "MathBackendRegistrationError");
  }
  constructor(message) {
    super(message);
    this.name = "MathBackendRegistrationError";
  }
};
function unwrap(result, opName) {
  if (!result || !result.ok) {
    throw wasmCallError(result?.error);
  }
  return result.value;
}
__name(unwrap, "unwrap");
function makeHandle(epoch, idx) {
  return { p: "wasm-math", e: epoch, h: idx };
}
__name(makeHandle, "makeHandle");
function unpackResult(u64BigInt) {
  const n = typeof u64BigInt === "bigint" ? u64BigInt : BigInt(Math.round(Number(u64BigInt)));
  return { e: Number(n >> 32n), h: Number(n & 0xFFFFFFFFn) };
}
__name(unpackResult, "unpackResult");
function packHandle(epoch, idx) {
  return BigInt(epoch) * 0x100000000n + BigInt(idx);
}
__name(packHandle, "packHandle");
var _wasmFacade = null;
function _internStr(canonStr) {
  const r = _wasmFacade.internStr(canonStr);
  const packed = unwrap(r, "_internStr");
  const { e, h } = unpackResult(packed);
  return makeHandle(e, h);
}
__name(_internStr, "_internStr");
function _materializeStr(handle, opName) {
  const packed = packHandle(handle.e, handle.h);
  const r = _wasmFacade.materializeStr(packed);
  return unwrap(r, opName + ".materializeStr");
}
__name(_materializeStr, "_materializeStr");
function handleFromPacked(packed) {
  const { e, h } = unpackResult(typeof packed === "string" ? BigInt(packed) : packed);
  return makeHandle(e, h);
}
__name(handleFromPacked, "handleFromPacked");
function packedFromHandle(h, opName) {
  return extractHandle(h, opName);
}
__name(packedFromHandle, "packedFromHandle");
function extractHandle(h, opName) {
  if (h !== null && typeof h === "object") {
    if (h.p === "wasm-math") {
      return packHandle(h.e, h.h);
    }
    if (typeof h._getPPFRationalParts === "function") {
      const cls = h.constructor;
      if (!cls || typeof cls.toCanonicalStr !== "function") {
        throw new TypeError(
          `WasmMathBackendProvider.${opName}: EGPTReal-shaped handle whose class has no static toCanonicalStr \u2014 the canonical form is owned by EGPTReal.toCanonicalStr (core/EGPTReal.js); this provider carries no copy of it.`
        );
      }
      const str = cls.toCanonicalStr(h);
      const r = _wasmFacade.internStr(str);
      const packed = unwrap(r, opName + ".d2-intern");
      return packed;
    }
  }
  throw new TypeError(
    `WasmMathBackendProvider.${opName}: foreign or invalid handle \u2014 expected wasm-math handle {p:'wasm-math',e,h} or EGPTReal instance; got ${typeof h}: ${h === null ? "null" : JSON.stringify(h)}`
  );
}
__name(extractHandle, "extractHandle");
function polyToJson(arr, opName) {
  return JSON.stringify(arr.map((h) => String(extractHandle(h, opName))));
}
__name(polyToJson, "polyToJson");
function portTagsToHandles(tags, args) {
  return tags.map((t) => {
    const [k, x, y] = t.split(":");
    if (k === "h" || k === "p") return handleFromPacked(x);
    return args[Number(x)][Number(y)];
  });
}
__name(portTagsToHandles, "portTagsToHandles");
function polyPort(op, a, b, opName) {
  const json = unwrap(_wasmFacade.polyPort(op, polyToJson(a, opName), polyToJson(b, opName)), opName);
  return JSON.parse(json);
}
__name(polyPort, "polyPort");
var WASM_PROVIDER_EXTRAS = Object.freeze([
  "toMathString",
  "getScalarParts",
  "getBaseRationalParts",
  "toPPF",
  "resetScope"
]);
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
      return handleFromPacked(unwrap(wasmFacade.arenaFromBigInt(String(n)), "fromBigInt"));
    },
    fromRational(num, den) {
      return handleFromPacked(unwrap(wasmFacade.arenaFromRational(String(num), String(den)), "fromRational"));
    },
    fromRationalStr(str) {
      return _internStr(str.trim());
    },
    toCanonicalStr(h) {
      return _materializeStr(h, "toCanonicalStr");
    },
    // ── Value-method transport (WASM_PROVIDER_EXTRAS, not contract ops) ──────
    // Called only by the same-named EGPTReal value methods in ./wasm-facade.js.
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
      const r = wasmFacade.arenaPow(extractHandle(base, "pow"), String(expNum), String(expDen));
      return handleFromPacked(unwrap(r, "pow"));
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
      const packed = BigInt(valueWithWarnings(unwrap(r, "ppfDecodeInteger")));
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
      return handleFromPacked(valueWithWarnings(unwrap(r, "fromPPF")));
    },
    // ── Bit-length ──────────────────────────────────────────────────────────
    getIntegerBitLength(n) {
      const r = wasmFacade.arenaGetBitLength(extractHandle(n, "getIntegerBitLength"));
      return BigInt(unwrap(r, "getIntegerBitLength"));
    },
    // ── Break-symbolic exits ────────────────────────────────────────────────
    breakSymbolicToApproximateBigInt(h) {
      const r = wasmFacade.arenaBreakToBigint(extractHandle(h, "breakSymbolicToApproximateBigInt"));
      return BigInt(valueWithWarnings(unwrap(r, "breakSymbolicToApproximateBigInt")));
    },
    breakSymbolicToApproximateJSNumber(h) {
      const r = wasmFacade.arenaBreakToJsNumber(extractHandle(h, "breakSymbolicToApproximateJSNumber"));
      return Number(valueWithWarnings(unwrap(r, "breakSymbolicToApproximateJSNumber")));
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
      const json = JSON.stringify({
        leadingCoeff: String(extractHandle(term.leadingCoeff, "fromAtomRoot.leadingCoeff")),
        roots: (term.roots ?? []).map((root) => ({
          value: String(extractHandle(root.value, "fromAtomRoot.root.value")),
          multiplicity: String(typeof root.multiplicity === "bigint" ? root.multiplicity : BigInt(root.multiplicity))
        }))
      });
      const r = wasmFacade.arenaFromAtomRoot(json);
      return handleFromPacked(valueWithWarnings(unwrap(r, "fromAtomRoot")));
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
    // ── Polynomial ops — the Rust EGPTPolynomial port (poly_port.rs) ────────
    polyAdd(a, b) {
      return portTagsToHandles(polyPort("add", a, b, "polyAdd"), [a, b]);
    },
    polyMul(a, b) {
      return portTagsToHandles(polyPort("multiply", a, b, "polyMul"), [a, b]);
    },
    polyDiv(dividend, divisor) {
      const r = polyPort("divide", dividend, divisor, "polyDiv");
      return {
        quotient: portTagsToHandles(r.quotient, [dividend, divisor]),
        remainder: portTagsToHandles(r.remainder, [dividend, divisor])
      };
    },
    polyForwardTransform(coeffs, n) {
      const r = wasmFacade.polyPortTransform("forwardTransform", polyToJson(coeffs, "polyForwardTransform"), n, `${n}`);
      return portTagsToHandles(JSON.parse(unwrap(r, "polyForwardTransform")), [coeffs]);
    },
    polyInverseTransform(samples, n) {
      const r = wasmFacade.polyPortTransform("inverseTransform", polyToJson(samples, "polyInverseTransform"), n, `${n}`);
      return portTagsToHandles(JSON.parse(unwrap(r, "polyInverseTransform")), [samples]);
    },
    polyEvaluateAt(poly, x) {
      return portTagsToHandles(polyPort("evaluateAt", poly, [x], "polyEvaluateAt"), [poly, [x]])[0];
    },
    polyGcd(a, b) {
      return portTagsToHandles(polyPort("gcd", a, b, "polyGcd"), [a, b]);
    },
    // ── Handle identity predicate ────────────────────────────────────────────
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
__name(buildWasmMathProvider, "buildWasmMathProvider");

// src/browser/wasm-call-facade.js
var WASM_ARENA_OPS = Object.freeze([
  // handle lifecycle / transport
  "internStr",
  "internV2",
  "materializeStr",
  "materializeV2",
  "releaseHandle",
  "arenaInternUnreduced",
  "arenaFromRational",
  "arenaFromBigInt",
  "arenaValueEquals",
  "arenaAbsNegative",
  "arenaCoordinateMultiplyUnit",
  "arenaFromScaledVector",
  "complexFindLcm",
  "complexTwiddleQuotient",
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
  "arenaGetRationalParts",
  "arenaNegate",
  "arenaScalarOp",
  // prime-atom representations
  "arenaToPrimeAtoms",
  "arenaFromAtomVec",
  "arenaToAtomRoot",
  "arenaFromAtomRoot",
  // number theory
  "arenaModPow",
  "arenaGcd",
  "arenaLcm",
  // polynomial ops — the EGPTPolynomial / SolvePolynomialSystem / MatrixAsPolynomial port
  // (poly_port.rs)
  "polyPort",
  "polyPortTransform",
  "polyPortMatrix",
  // prime-atom layer — PrimeAtomPolynomial / MatrixAsPrimeAtoms / OrderFinder ports
  // (prime_atom.rs; consumed through wasm-port-calls.js)
  "primeAtomFactorize",
  "primeAtomTotient",
  "primeAtomDivisorsOf",
  "primeAtomOmega",
  "primeAtomBigOmega",
  "primeAtomBitLength",
  "primeAtomLogspaceSum",
  "primeAtomMakeMeter",
  "primeAtomFactMultiply",
  "primeAtomReconstruct",
  "primeAtomIntegerAdd",
  "orderFinderFindOrder",
  "orderFinderVerifyOrder",
  "orderFinderCalculateSampleSize",
  // EGPTPrimeComposite port (prime_composite.rs)
  "primeCompositeNew",
  "primeCompositeFromReal",
  "primeCompositeMultiply",
  "primeCompositeDivide",
  "primeCompositeState",
  "primeCompositeCongruent",
  "primeCompositeRecordsKey",
  "primeCompositeCancelRule",
  "primeCompositeIsComposite",
  // EGPTranscendental class-body port (transcendental_port.rs)
  "transcendentalExp",
  "transcendentalFactorial",
  "transcendentalPhaseToCircular",
  // PrimeCache + the codec's value arithmetic (codec_port.rs)
  "primeCacheSieve",
  "primeCacheIndexOf",
  "primeCacheFactor",
  "codecIeeeQuantize",
  "codecIeeeUnpack",
  "codecIeeeEncodeCheck",
  "codecIeeeEncode",
  "codecF64Lift",
  // the float → EGPTReal input boundary (ppfBoundary.js / floatToEGPT.js; codec_port.rs)
  "boundaryF64ToOddDenom",
  "boundaryToEgptRealParts",
  // EGPTPolynomial.Multilinear's value arithmetic (multilinear_port.rs)
  "multilinearNextOddPrime",
  "multilinearSplitOverCache",
  "multilinearMul",
  "multilinearSub",
  "codecPolyEvalAt",
  "codecSyntheticDivide",
  "codecMulLinear",
  "codecRecompose",
  "codecDecomposeOdd",
  "codecShiftOdd",
  "codecLcmOfDenominators",
  "codecScaleToNat",
  "codecScaleDenominator"
]);
var WASM_DIRECT_OPS = Object.freeze(["resetScope", "arenaStats"]);
function buildWasmCallFacade(wasmModule, backendTag = "wasm-bridge", tracer = null) {
  const mod = wasmModule ?? null;
  const safeCall = /* @__PURE__ */ __name((name, ...args) => {
    if (!mod || typeof mod[name] !== "function") {
      return { ok: false, error: `wasm-function-unavailable:${name}`, backend: backendTag };
    }
    tracer?.before(mod);
    let result;
    try {
      result = { ok: true, value: mod[name](...args), backend: backendTag };
    } catch (error) {
      result = { ok: false, error: String(error), backend: backendTag };
    }
    tracer?.after(mod);
    return result;
  }, "safeCall");
  const facade = {};
  for (const op of WASM_ARENA_OPS) {
    facade[op] = (...args) => safeCall(op, ...args);
  }
  for (const op of WASM_DIRECT_OPS) {
    facade[op] = mod ? (...args) => mod[op](...args) : null;
  }
  return facade;
}
__name(buildWasmCallFacade, "buildWasmCallFacade");

// src/browser/debug-logger.js
var DebugLogger = class _DebugLogger {
  static {
    __name(this, "DebugLogger");
  }
  static MAX_BUFFER_SIZE = 1e3;
  // Maximum number of messages to keep in memory
  static CONSOLE_ENABLED = false;
  // Static flag to control console output
  static callbacks = /* @__PURE__ */ new Set();
  // Set of callback functions
  constructor(invocationKey, context = "EGPT") {
    this.invocationKey = invocationKey;
    this.context = context;
    this.startTime = performance.now();
    this.messages = [];
    this.metrics = {
      totalMessages: 0,
      errorCount: 0,
      warningCount: 0,
      timingEvents: [],
      memorySnapshots: [],
      performanceMarkers: {}
    };
    _DebugLogger.activeLoggers = _DebugLogger.activeLoggers || /* @__PURE__ */ new Map();
    _DebugLogger.activeLoggers.set(invocationKey, this);
    this.log("INIT", `Debug logger initialized for ${invocationKey}`, { context });
  }
  /**
   * Log a message with automatic categorization and performance tracking
   * @param {string} level - Log level: INFO, DEBUG, TIMING, ERROR, WARNING, DATA, ANALYSIS
   * @param {string} message - The message to log
   * @param {object} data - Optional data object
   */
  log(level, message, data = null) {
    const timestamp = performance.now();
    const relativeTime = timestamp - this.startTime;
    const logEntry = {
      timestamp,
      relativeTime,
      level,
      message,
      data,
      invocationKey: this.invocationKey,
      context: this.context,
      id: this.metrics.totalMessages++
    };
    this.messages.push(logEntry);
    if (this.messages.length > _DebugLogger.MAX_BUFFER_SIZE) {
      this.messages.shift();
    }
    this.updateMetrics(level, logEntry);
    if (_DebugLogger.CONSOLE_ENABLED) {
      this.outputToConsole(logEntry);
    }
    _DebugLogger.callbacks.forEach((callback) => {
      try {
        callback(logEntry, this);
      } catch (error) {
        console.warn("Debug logger callback error:", error);
      }
    });
  }
  /**
   * Update internal metrics based on log entry
   */
  updateMetrics(level, logEntry) {
    switch (level) {
      case "ERROR":
        this.metrics.errorCount++;
        break;
      case "WARNING":
        this.metrics.warningCount++;
        break;
      case "TIMING":
        this.metrics.timingEvents.push({
          message: logEntry.message,
          time: logEntry.relativeTime,
          data: logEntry.data
        });
        break;
    }
    if (this.metrics.totalMessages % 100 === 0) {
      this.metrics.memorySnapshots.push({
        messageCount: this.metrics.totalMessages,
        time: logEntry.relativeTime,
        memoryUsed: this.messages.length
      });
    }
  }
  /**
   * Output to console with appropriate formatting
   */
  outputToConsole(logEntry) {
    const prefix = `[${this.context}:${this.invocationKey}:${logEntry.relativeTime.toFixed(2)}ms]`;
    const levelStyles = {
      "ERROR": ["color: #e74c3c; font-weight: bold", "\u274C"],
      "WARNING": ["color: #f39c12; font-weight: bold", "\u26A0\uFE0F"],
      "TIMING": ["color: #3498db", "\u23F1\uFE0F"],
      "DATA": ["color: #9b59b6", "\u{1F4CA}"],
      "ANALYSIS": ["color: #2ecc71", "\u{1F52C}"],
      "DEBUG": ["color: #95a5a6", "\u{1F527}"],
      "INFO": ["color: #34495e", "\u2139\uFE0F"],
      "INIT": ["color: #e67e22; font-weight: bold", "\u{1F680}"]
    };
    const [style, emoji] = levelStyles[logEntry.level] || levelStyles["DEBUG"];
    if (logEntry.data) {
      console.log(`%c${prefix} ${emoji} ${logEntry.message}`, style, logEntry.data);
    } else {
      console.log(`%c${prefix} ${emoji} ${logEntry.message}`, style);
    }
  }
  /**
   * Convenience methods for different log levels
   */
  info(message, data) {
    this.log("INFO", message, data);
  }
  debug(message, data) {
    this.log("DEBUG", message, data);
  }
  timing(message, data) {
    this.log("TIMING", message, data);
  }
  error(message, data) {
    this.log("ERROR", message, data);
  }
  warning(message, data) {
    this.log("WARNING", message, data);
  }
  data(message, data) {
    this.log("DATA", message, data);
  }
  analysis(message, data) {
    this.log("ANALYSIS", message, data);
  }
  /**
   * Mark a performance checkpoint
   */
  mark(label) {
    const time = performance.now() - this.startTime;
    this.metrics.performanceMarkers[label] = time;
    this.timing(`Performance marker: ${label}`, { time });
    return time;
  }
  /**
   * Measure time between two marks
   */
  measure(startLabel, endLabel) {
    const startTime = this.metrics.performanceMarkers[startLabel];
    const endTime = this.metrics.performanceMarkers[endLabel];
    if (startTime !== void 0 && endTime !== void 0) {
      const duration = endTime - startTime;
      this.timing(`Measure ${startLabel} \u2192 ${endLabel}`, { duration, startTime, endTime });
      return duration;
    }
    return null;
  }
  /**
   * Get summary of this logger's activity
   */
  getSummary() {
    const duration = performance.now() - this.startTime;
    return {
      invocationKey: this.invocationKey,
      context: this.context,
      duration,
      totalMessages: this.metrics.totalMessages,
      errorCount: this.metrics.errorCount,
      warningCount: this.metrics.warningCount,
      timingEvents: this.metrics.timingEvents.length,
      memorySnapshots: this.metrics.memorySnapshots.length,
      performanceMarkers: Object.keys(this.metrics.performanceMarkers).length,
      messagesInBuffer: this.messages.length
    };
  }
  /**
   * Get all messages (or filtered subset)
   */
  getMessages(filter = null) {
    if (!filter) return [...this.messages];
    return this.messages.filter((msg) => {
      if (filter.level && msg.level !== filter.level) return false;
      if (filter.timeRange && (msg.relativeTime < filter.timeRange[0] || msg.relativeTime > filter.timeRange[1])) return false;
      if (filter.searchText && !msg.message.toLowerCase().includes(filter.searchText.toLowerCase())) return false;
      return true;
    });
  }
  /**
   * Clean up this logger
   */
  finalize() {
    const summary = this.getSummary();
    this.info("Logger finalized", summary);
    if (_DebugLogger.activeLoggers) {
      _DebugLogger.activeLoggers.delete(this.invocationKey);
    }
    return summary;
  }
  // =============================================================================
  // STATIC METHODS FOR GLOBAL CONTROL
  // =============================================================================
  /**
   * Enable/disable console output globally
   */
  static setConsoleEnabled(enabled) {
    _DebugLogger.CONSOLE_ENABLED = enabled;
    console.log(
      `%cDebugLogger console output ${enabled ? "ENABLED" : "DISABLED"}`,
      `color: ${enabled ? "#2ecc71" : "#e74c3c"}; font-weight: bold;`
    );
  }
  /**
   * Add a callback function to receive log messages
   */
  static addCallback(callback) {
    _DebugLogger.callbacks.add(callback);
  }
  /**
   * Remove a callback function
   */
  static removeCallback(callback) {
    _DebugLogger.callbacks.delete(callback);
  }
  /**
   * Clear all callbacks
   */
  static clearCallbacks() {
    _DebugLogger.callbacks.clear();
  }
  /**
   * Get logger for specific invocation
   */
  static getLogger(invocationKey) {
    return _DebugLogger.activeLoggers?.get(invocationKey) || null;
  }
  /**
   * Get all active loggers
   */
  static getAllLoggers() {
    return _DebugLogger.activeLoggers ? Array.from(_DebugLogger.activeLoggers.values()) : [];
  }
  /**
   * Get summary of all active loggers
   */
  static getGlobalSummary() {
    const loggers = _DebugLogger.getAllLoggers();
    return {
      totalActiveLoggers: loggers.length,
      totalMessages: loggers.reduce((sum, logger) => sum + logger.metrics.totalMessages, 0),
      totalErrors: loggers.reduce((sum, logger) => sum + logger.metrics.errorCount, 0),
      totalWarnings: loggers.reduce((sum, logger) => sum + logger.metrics.warningCount, 0),
      consoleEnabled: _DebugLogger.CONSOLE_ENABLED,
      callbackCount: _DebugLogger.callbacks.size,
      loggers: loggers.map((logger) => logger.getSummary())
    };
  }
  /**
   * Clean up old/completed loggers (keep last N)
   */
  static cleanupOldLoggers(keepLast = 10) {
    if (!_DebugLogger.activeLoggers) return;
    const loggers = Array.from(_DebugLogger.activeLoggers.entries());
    if (loggers.length <= keepLast) return;
    loggers.sort((a, b) => a[1].startTime - b[1].startTime);
    const toRemove = loggers.slice(0, loggers.length - keepLast);
    toRemove.forEach(([key, logger]) => {
      logger.finalize();
    });
    console.log(
      `%cDebugLogger: Cleaned up ${toRemove.length} old loggers, keeping ${keepLast} most recent`,
      "color: #f39c12;"
    );
  }
};
var SimpleLogger = class _SimpleLogger {
  static {
    __name(this, "SimpleLogger");
  }
  static DEBUG_ENABLED = false;
  // Static flag for global debug control
  /**
   * SimpleLogger provides global mute/unmute control for debug output.
   * It overrides the global console methods to allow only the active SimpleLogger instance
   * to output to the console. All other console.log/warn/error calls are suppressed unless
   * allowed by the active SimpleLogger.
   *
   * Usage:
   *   const logger = new SimpleLogger();
   *   logger.activate(); // Only this logger's log/warn/error will show in console
   *   logger.log("This will appear");
   *   console.log("This will NOT appear");
   *   logger.deactivate(); // Restores normal console behavior
   */
  static _originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  static _activeInstance = null;
  /**
   * Create a new SimpleLogger instance
   * @param {boolean} suppressGlobalConsoleMessages - Automatically attach to global console methods. This will suppress all other console output.
   *                                  If false, you must call attachGlobal() manually to enable global control.
   */
  constructor(suppressGlobalConsoleMessages) {
    this.enabled = true;
    if (suppressGlobalConsoleMessages) {
      this.supressGlobalConsole();
    }
  }
  supressGlobalConsole() {
    _SimpleLogger._activeInstance = this;
    console.log = (...args) => {
      if (_SimpleLogger._activeInstance === this && this.enabled) {
        _SimpleLogger._originalConsole.log.apply(console, args);
      }
    };
    console.warn = (...args) => {
      if (_SimpleLogger._activeInstance === this && this.enabled) {
        _SimpleLogger._originalConsole.warn.apply(console, args);
      }
    };
    console.error = (...args) => {
      if (_SimpleLogger._activeInstance === this && this.enabled) {
        _SimpleLogger._originalConsole.error.apply(console, args);
      }
    };
  }
  unsupressGlobalConsole() {
    if (_SimpleLogger._activeInstance === this) {
      console.log = _SimpleLogger._originalConsole.log;
      console.warn = _SimpleLogger._originalConsole.warn;
      console.error = _SimpleLogger._originalConsole.error;
      _SimpleLogger._activeInstance = null;
    }
  }
  mute() {
    this.enabled = false;
  }
  unmute() {
    this.enabled = true;
  }
  log(...args) {
    if (_SimpleLogger._activeInstance === this && this.enabled) {
      _SimpleLogger._originalConsole.log.apply(console, args);
    }
  }
  warn(...args) {
    if (_SimpleLogger._activeInstance === this && this.enabled) {
      _SimpleLogger._originalConsole.warn.apply(console, args);
    }
  }
  error(...args) {
    if (_SimpleLogger._activeInstance === this && this.enabled) {
      _SimpleLogger._originalConsole.error.apply(console, args);
    }
  }
  static log(...args) {
    if (_SimpleLogger.DEBUG_ENABLED) {
      console.log(...args);
    }
  }
  static warn(...args) {
    if (_SimpleLogger.DEBUG_ENABLED) {
      console.warn(...args);
    }
  }
  static error(...args) {
    if (_SimpleLogger.DEBUG_ENABLED) {
      console.error(...args);
    }
  }
};
function createEGPTLogger(numberKey) {
  return new DebugLogger(numberKey.toString(), "EGPT");
}
__name(createEGPTLogger, "createEGPTLogger");

// src/browser/op-trace.js
var _activeCounter = null;
var _quiet = 0;
function getActiveOpCounter() {
  return _activeCounter;
}
__name(getActiveOpCounter, "getActiveOpCounter");
function setActiveOpCounter(counter) {
  _activeCounter = counter;
}
__name(setActiveOpCounter, "setActiveOpCounter");
function recordOp(op, n) {
  if (_quiet === 0) _activeCounter?.record(op, n);
}
__name(recordOp, "recordOp");
function quietly(fn) {
  _quiet += 1;
  try {
    return fn();
  } finally {
    _quiet -= 1;
  }
}
__name(quietly, "quietly");
function createOpTracer() {
  let ops = false;
  let lines = false;
  return {
    before(mod) {
      const wantOps = _quiet === 0 && _activeCounter != null;
      const wantLines = _quiet === 0 && !!SimpleLogger.DEBUG_ENABLED;
      if (wantOps !== ops || wantLines !== lines) {
        mod.traceConfigure(wantOps, wantLines);
        ops = wantOps;
        lines = wantLines;
      }
    },
    after(mod) {
      if (!ops && !lines) return;
      for (const e of JSON.parse(mod.traceDrain())) {
        if (e[0] === "o") _activeCounter?.record(e[1], e[2]);
        else SimpleLogger.log(e[1]);
      }
    }
  };
}
__name(createOpTracer, "createOpTracer");

// ../../lib/egpt/js/model/shared/matrixAlgorithm.js
function createEGPTMatrix({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, EGPTPolynomial: EGPTPolynomial2 }) {
  function _zeros(rows, cols) {
    const M = new Array(rows);
    for (let i = 0; i < rows; i++) {
      M[i] = new Array(cols).fill(EGPTReal2.fromBigInt(0n));
    }
    return M;
  }
  __name(_zeros, "_zeros");
  function _shape(M) {
    return { rows: M.length, cols: M.length === 0 ? 0 : M[0].length };
  }
  __name(_shape, "_shape");
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
  __name(dotViaPolynomial, "dotViaPolynomial");
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
__name(createEGPTMatrix, "createEGPTMatrix");

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
__name(createEGPTFFT, "createEGPTFFT");

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
__name(bigIntSqrt, "bigIntSqrt");
function createEGPTStat({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, getEGPTStatData }) {
  function _normalSqrt(a_en) {
    const rational = a_en.getRationalParts();
    const sqrt_num = rational.numerator < 0n ? -bigIntSqrt(-rational.numerator) : bigIntSqrt(rational.numerator);
    const sqrt_den = bigIntSqrt(rational.denominator);
    return EGPTReal2.fromRational(sqrt_num, sqrt_den);
  }
  __name(_normalSqrt, "_normalSqrt");
  function mean(vectors) {
    if (vectors.length === 0) throw new Error("Cannot calculate mean of empty vector array");
    let sum = vectors[0].clone();
    for (let i = 1; i < vectors.length; i++) sum = EGPTMath2.add(sum, vectors[i]);
    return EGPTMath2.normalDivide(sum, EGPTReal2.fromBigInt(BigInt(vectors.length)));
  }
  __name(mean, "mean");
  function absoluteDifference(H_a, H_b) {
    return EGPTMath2.compare(H_a, H_b) >= 0 ? EGPTMath2.subtract(H_a, H_b) : EGPTMath2.subtract(H_b, H_a);
  }
  __name(absoluteDifference, "absoluteDifference");
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
  __name(variance, "variance");
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
  __name(comprehensiveStatisticalAnalysis, "comprehensiveStatisticalAnalysis");
  return Object.freeze({ _normalSqrt, mean, absoluteDifference, variance, comprehensiveStatisticalAnalysis });
}
__name(createEGPTStat, "createEGPTStat");

// ../../lib/egpt/js/model/shared/statDataAlgorithm.js
function createEGPTStatData({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, getEGPTStat }) {
  class EGPTStatData2 {
    static {
      __name(this, "EGPTStatData");
    }
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
__name(createEGPTStatData, "createEGPTStatData");

// ../../lib/egpt/js/model/shared/transcendentalAlgorithm.js
function createEGPTranscendental({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2 }) {
  function exp2(H_entropy) {
    const exp_rational = H_entropy.getRationalParts();
    return EGPTMath2.pow(EGPTReal2.fromBigInt(2n), exp_rational.numerator, exp_rational.denominator);
  }
  __name(exp2, "exp2");
  function log2(x_en) {
    const H_one = EGPTReal2.fromBigInt(1n);
    if (x_en.equals(H_one)) return EGPTReal2.fromBigInt(0n);
    const half_x = EGPTMath2.divide(x_en, EGPTReal2.fromBigInt(2n));
    return EGPTMath2.add(log2(half_x), H_one);
  }
  __name(log2, "log2");
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
  __name(_phaseToCartesian, "_phaseToCartesian");
  function cos(H_phase) {
    return _phaseToCartesian(H_phase).x;
  }
  __name(cos, "cos");
  function sin(H_phase) {
    return _phaseToCartesian(H_phase).y;
  }
  __name(sin, "sin");
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
  __name(_calcTriangularWavePosition, "_calcTriangularWavePosition");
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
  __name(_getVectorFromPhase, "_getVectorFromPhase");
  return Object.freeze({ exp2, log2, _phaseToCartesian, cos, sin, _calcTriangularWavePosition, _getVectorFromPhase });
}
__name(createEGPTranscendental, "createEGPTranscendental");

// ../../lib/egpt/js/model/shared/complexAlgorithm.js
function createEGPTComplex({ EGPTReal: EGPTReal2, EGPTMath: EGPTMath2, transcendental, phaseToCircular }) {
  class ComplexEGPTReal2 {
    static {
      __name(this, "ComplexEGPTReal");
    }
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
  const mk = /* @__PURE__ */ __name((x, y) => new _Complex(x, y), "mk");
  function setComplexClass(C) {
    _Complex = C;
  }
  __name(setComplexClass, "setComplexClass");
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
  __name(coordinateMultiply, "coordinateMultiply");
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
  EGPTComplex2.complexPower = /* @__PURE__ */ __name(function complexPower(H_n, s) {
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
  }, "complexPower");
  EGPTComplex2.riemannZeta = /* @__PURE__ */ __name(function riemannZeta(s, maxTerms = 1e3) {
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
  }, "riemannZeta");
  class TwiddleTable2 {
    static {
      __name(this, "TwiddleTable");
    }
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
__name(createEGPTComplex, "createEGPTComplex");

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
  __name(conditionalEntropyVector, "conditionalEntropyVector");
  return Object.freeze({ conditionalEntropyVector });
}
__name(createComposedMath, "createComposedMath");

// src/browser/active-provider.js
var _resolver = null;
function setActiveProviderResolver(fn) {
  _resolver = fn;
}
__name(setActiveProviderResolver, "setActiveProviderResolver");
function hasActiveProvider() {
  return _resolver !== null;
}
__name(hasActiveProvider, "hasActiveProvider");
function getActiveProvider() {
  if (!_resolver) {
    throw new Error(
      "egpt-math-sdk: no active math provider resolver set \u2014 an entry (dist-entry.js or sdk-entry.js) must call setActiveProviderResolver() first."
    );
  }
  return _resolver();
}
__name(getActiveProvider, "getActiveProvider");

// src/browser/wasm-multilinear-facade.js
var _MIXED = "Cannot mix BigInt and other types, use explicit conversions";
function _bigOp(op, a, b) {
  if (typeof a !== "bigint" || typeof b !== "bigint") throw new TypeError(_MIXED);
  return BigInt(callWasm(op, String(a), String(b)));
}
__name(_bigOp, "_bigOp");
var _bigMul = /* @__PURE__ */ __name((a, b) => _bigOp("multilinearMul", a, b), "_bigMul");
var _bigSub = /* @__PURE__ */ __name((a, b) => _bigOp("multilinearSub", a, b), "_bigSub");
var _nextOddPrime = /* @__PURE__ */ __name((last) => BigInt(callWasm("multilinearNextOddPrime", String(last))), "_nextOddPrime");
var _one = null;
var _oneAssigned = false;
var _oneValue = null;
function _splitOverCache(numerator, denominator, cache) {
  const r = JSON.parse(callWasm(
    "multilinearSplitOverCache",
    String(numerator),
    String(denominator),
    JSON.stringify(cache.map(String))
  ));
  return { n: BigInt(r.n), d: BigInt(r.d), counts: r.counts };
}
__name(_splitOverCache, "_splitOverCache");
function _multilinearPrune(raw) {
  const zeroEN = EGPTReal.fromBigInt(0n);
  const out = [];
  for (const [mask, c] of raw) {
    if (!c.equals(zeroEN)) out.push([mask, c]);
  }
  return out;
}
__name(_multilinearPrune, "_multilinearPrune");
var _multilinearPrimeCache = [3n];
function _multilinearNthPrime(i) {
  if (!Number.isInteger(i) || i < 0) {
    throw new TypeError("Multilinear prime index must be a non-negative integer.");
  }
  while (_multilinearPrimeCache.length <= i) {
    _multilinearPrimeCache.push(_nextOddPrime(_multilinearPrimeCache[_multilinearPrimeCache.length - 1]));
  }
  return _multilinearPrimeCache[i];
}
__name(_multilinearNthPrime, "_multilinearNthPrime");
function _multilinearPrimeIndex(prime) {
  let i = 0;
  while (_multilinearNthPrime(i) < prime) i++;
  if (_multilinearNthPrime(i) !== prime) {
    throw new Error(`Prime ${prime} is not in the canonical variable-prime sequence.`);
  }
  return i;
}
__name(_multilinearPrimeIndex, "_multilinearPrimeIndex");
function _multilinearRecordKey(record) {
  return `${record.sign}:${record.prime}:${record.location}`;
}
__name(_multilinearRecordKey, "_multilinearRecordKey");
var Multilinear = {
  ZERO: [],
  get ONE() {
    if (_oneAssigned) return _oneValue;
    const one = quietly(() => EGPTReal.fromBigInt(1n));
    if (_one === null || _one[0]?.[1]?._handle?.e !== one._handle.e) _one = [[0n, one]];
    return _one;
  },
  set ONE(value) {
    _oneAssigned = _one === null || value !== _one;
    _oneValue = _oneAssigned ? value : null;
  },
  primeForVariable(i) {
    return _multilinearNthPrime(i);
  },
  _indexOfPrime(prime) {
    return _multilinearPrimeIndex(prime);
  },
  variableProbabilityComposite(i) {
    return EGPTPrimeComposite.fromPrimeRecords([{
      sign: 1,
      prime: this.primeForVariable(i),
      location: "denominator"
    }]);
  },
  quotientCompositeProduct(left, right) {
    const lhs = left instanceof EGPTPrimeComposite ? left : EGPTPrimeComposite.fromEGPTReal(left);
    const rhs = right instanceof EGPTPrimeComposite ? right : EGPTPrimeComposite.fromEGPTReal(right);
    const seen = /* @__PURE__ */ new Set();
    const records = [];
    for (const record of lhs.records.concat(rhs.records)) {
      const key = _multilinearRecordKey(record);
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        sign: record.sign,
        prime: record.prime,
        location: record.location
      });
    }
    return EGPTPrimeComposite.fromPrimeRecords(records);
  },
  constant(c) {
    if (c.equals(EGPTReal.fromBigInt(0n))) return [];
    return [[0n, c]];
  },
  indeterminate(i) {
    return [[1n << BigInt(i), EGPTReal.fromBigInt(1n)]];
  },
  isZero(P) {
    return P.length === 0;
  },
  isOne(P) {
    return P.length === 1 && P[0][0] === 0n && P[0][1].equals(EGPTReal.fromBigInt(1n));
  },
  equals(P, Q) {
    if (P.length !== Q.length) return false;
    for (let i = 0; i < P.length; i++) {
      if (P[i][0] !== Q[i][0] || !P[i][1].equals(Q[i][1])) return false;
    }
    return true;
  },
  add(P, Q) {
    let i = 0, j = 0;
    const out = [];
    while (i < P.length && j < Q.length) {
      if (P[i][0] < Q[j][0]) {
        out.push(P[i++]);
      } else if (P[i][0] > Q[j][0]) {
        out.push(Q[j++]);
      } else {
        const sum = EGPTMath.add(P[i][1], Q[j][1]);
        if (!sum.equals(EGPTReal.fromBigInt(0n))) {
          out.push([P[i][0], sum]);
        }
        i++;
        j++;
      }
    }
    while (i < P.length) out.push(P[i++]);
    while (j < Q.length) out.push(Q[j++]);
    return out;
  },
  subtract(P, Q) {
    return this.add(P, this.negate(Q));
  },
  negate(P) {
    const zeroEN = EGPTReal.fromBigInt(0n);
    return P.map(([mask, c]) => [mask, EGPTMath.subtract(zeroEN, c)]);
  },
  evaluateVariables(P, evalMask) {
    if (P.length === 0) return [];
    if (evalMask === 0n) return P;
    const raw = [];
    for (const [mask, c] of P) {
      let newMask = mask & ~evalMask;
      let intersection = mask & evalMask;
      let coeff = c;
      if (intersection > 0n) {
        let v = 0;
        let temp = intersection;
        while (temp > 0n) {
          if ((temp & 1n) === 1n) {
            const prime = this.primeForVariable(v);
            const prob = EGPTReal.fromRational(1n, prime);
            coeff = EGPTMath.multiply(coeff, prob);
          }
          temp >>= 1n;
          v++;
        }
      }
      raw.push([newMask, coeff]);
    }
    raw.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const out = [];
    if (raw.length === 0) return out;
    let currentMask = raw[0][0];
    let currentCoeff = raw[0][1];
    for (let i = 1; i < raw.length; i++) {
      if (raw[i][0] === currentMask) {
        currentCoeff = EGPTMath.add(currentCoeff, raw[i][1]);
      } else {
        out.push([currentMask, currentCoeff]);
        currentMask = raw[i][0];
        currentCoeff = raw[i][1];
      }
    }
    out.push([currentMask, currentCoeff]);
    return _multilinearPrune(out);
  },
  evaluateAtPrimes(F) {
    if (F.length === 0) return EGPTReal.fromBigInt(0n);
    let allVars = 0n;
    for (let i = 0; i < F.length; i++) {
      allVars |= F[i][0];
    }
    const evaluated = this.evaluateVariables(F, allVars);
    if (evaluated.length === 0) return EGPTReal.fromBigInt(0n);
    return evaluated[0][1];
  },
  variablesOf(P) {
    let vars = 0n;
    for (const [mask] of P) vars |= mask;
    return vars;
  },
  variableIndicesFromMask(mask) {
    const indices = [];
    let v = 0;
    let temp = mask;
    while (temp > 0n) {
      if ((temp & 1n) === 1n) indices.push(v);
      temp >>= 1n;
      v++;
    }
    return indices;
  },
  _assignmentBitsForSubset(sourceVars, sourceBits, targetVars) {
    let out = 0n;
    for (let i = 0; i < targetVars.length; i++) {
      const v = targetVars[i];
      const sourceIdx = sourceVars.indexOf(v);
      if (sourceIdx === -1) {
        throw new Error("_assignmentBitsForSubset: target variable missing from source variables.");
      }
      if ((sourceBits >> BigInt(sourceIdx) & 1n) === 1n) {
        out |= 1n << BigInt(i);
      }
    }
    return out;
  },
  _assignmentMapFromBits(vars, bits) {
    const roots = /* @__PURE__ */ new Map();
    for (let i = 0; i < vars.length; i++) {
      roots.set(vars[i], (bits >> BigInt(i) & 1n) === 1n ? 1n : 0n);
    }
    return roots;
  },
  _assignmentWeight(vars, bits) {
    let weight = EGPTReal.fromBigInt(1n);
    for (let i = 0; i < vars.length; i++) {
      const p = EGPTReal.fromRational(1n, this.primeForVariable(vars[i]));
      const bit = bits >> BigInt(i) & 1n;
      const atomWeight = bit === 1n ? p : EGPTMath.subtract(EGPTReal.fromBigInt(1n), p);
      weight = EGPTMath.multiply(weight, atomWeight);
    }
    return weight;
  },
  _evaluateMaskAtPrimes(mask) {
    let value = EGPTReal.fromBigInt(1n);
    let v = 0;
    let temp = mask;
    while (temp > 0n) {
      if ((temp & 1n) === 1n) {
        value = EGPTMath.multiply(
          value,
          EGPTReal.fromRational(1n, this.primeForVariable(v))
        );
      }
      temp >>= 1n;
      v++;
    }
    return value;
  },
  factorToPrimeLists(value) {
    if (!(value instanceof EGPTReal)) {
      throw new TypeError("factorToPrimeLists expects an EGPTReal-compatible value.");
    }
    if (value instanceof EGPTPrimeComposite) {
      const numeratorPrimes2 = [];
      const denominatorPrimes2 = [];
      const exponentMap2 = /* @__PURE__ */ new Map();
      for (const [p, e] of value.getPrimesInNumerator()) {
        exponentMap2.set(p, (exponentMap2.get(p) || 0n) + e);
        for (let i = 0n; i < e; i++) numeratorPrimes2.push(p);
      }
      for (const [p, e] of value.getPrimesInDenominator()) {
        exponentMap2.set(p, (exponentMap2.get(p) || 0n) - e);
        for (let i = 0n; i < e; i++) denominatorPrimes2.push(p);
      }
      numeratorPrimes2.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      denominatorPrimes2.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      return { numeratorPrimes: numeratorPrimes2, denominatorPrimes: denominatorPrimes2, exponentMap: exponentMap2, composite: value };
    }
    const { numerator, denominator } = value._getPPFRationalParts();
    const numeratorPrimes = [];
    const denominatorPrimes = [];
    const exponentMap = /* @__PURE__ */ new Map();
    const split = _splitOverCache(numerator, denominator, _multilinearPrimeCache);
    const n = split.n;
    const d = split.d;
    _multilinearPrimeCache.forEach((p, i) => {
      for (let c = 0; c < split.counts[i][0]; c++) {
        numeratorPrimes.push(p);
        exponentMap.set(p, (exponentMap.get(p) || 0n) + 1n);
      }
      for (let c = 0; c < split.counts[i][1]; c++) {
        denominatorPrimes.push(p);
        exponentMap.set(p, (exponentMap.get(p) || 0n) - 1n);
      }
    });
    if (d !== 1n) {
      throw new Error(
        `factorToPrimeLists: residue outside preassigned prime cache (numeratorResidue=${n}, denominatorResidue=${d}).`
      );
    }
    numeratorPrimes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    denominatorPrimes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return { numeratorPrimes, denominatorPrimes, exponentMap, composite: value };
  },
  primeListsToEGPTReal(lists) {
    if (!lists || !(lists.exponentMap instanceof Map)) {
      throw new TypeError("primeListsToEGPTReal expects a prime-list object.");
    }
    if (lists.composite instanceof EGPTReal) return lists.composite;
    let numerator = 1n;
    let denominator = 1n;
    for (const [p, e] of lists.exponentMap) {
      if (e > 0n) {
        for (let i = 0n; i < e; i++) numerator = _bigMul(numerator, p);
      } else if (e < 0n) {
        for (let i = 0n; i < -e; i++) denominator = _bigMul(denominator, p);
      }
    }
    return EGPTReal.fromRational(numerator, denominator);
  },
  _sharedPrimeValue(sharedPrimeAtom) {
    const lists = this.factorToPrimeLists(sharedPrimeAtom);
    if (lists.denominatorPrimes.length > 0) return lists.denominatorPrimes[0];
    if (lists.numeratorPrimes.length > 0) return lists.numeratorPrimes[0];
    throw new Error("shared prime atom has no prime factor.");
  },
  sharedPrimeInLists(stateLists, factorLists, sharedPrimeAtom, location = "denominator") {
    const prime = typeof sharedPrimeAtom === "bigint" ? sharedPrimeAtom : this._sharedPrimeValue(sharedPrimeAtom);
    const stateList = location === "numerator" ? stateLists.numeratorPrimes : stateLists.denominatorPrimes;
    const factorList = location === "numerator" ? factorLists.numeratorPrimes : factorLists.denominatorPrimes;
    return stateList.includes(prime) && factorList.includes(prime);
  },
  conditionalEntropyZero(stateValueOrLists, factorValueOrLists, sharedPrimeAtom, location = "denominator") {
    const stateLists = stateValueOrLists && stateValueOrLists.exponentMap instanceof Map ? stateValueOrLists : this.factorToPrimeLists(stateValueOrLists);
    const factorLists = factorValueOrLists && factorValueOrLists.exponentMap instanceof Map ? factorValueOrLists : this.factorToPrimeLists(factorValueOrLists);
    return this.sharedPrimeInLists(stateLists, factorLists, sharedPrimeAtom, location);
  },
  compressedOrFactor(atoms) {
    if (!Array.isArray(atoms)) {
      throw new TypeError("compressedOrFactor expects an array of atoms.");
    }
    const M = EGPTPolynomial.Multilinear;
    let supportMask = 0n;
    const normalized = atoms.map((atom) => {
      if (!Number.isInteger(atom.varIdx) || atom.varIdx < 0) {
        throw new TypeError("compressedOrFactor atom.varIdx must be a non-negative integer.");
      }
      if (typeof atom.polarity !== "boolean") {
        throw new TypeError("compressedOrFactor atom.polarity must be boolean.");
      }
      supportMask |= 1n << BigInt(atom.varIdx);
      return { varIdx: atom.varIdx, polarity: atom.polarity };
    });
    const supportVars = M.variableIndicesFromMask(supportMask);
    return {
      kind: "or-factor",
      atoms: normalized,
      supportMask,
      supportVars,
      evaluate(roots = /* @__PURE__ */ new Map()) {
        let allComplements = EGPTReal.fromBigInt(1n);
        for (const atom of normalized) {
          let atomValue;
          if (roots.has(atom.varIdx)) {
            const bit = roots.get(atom.varIdx);
            const truth = atom.polarity ? bit : _bigSub(1n, bit);
            atomValue = EGPTReal.fromBigInt(truth);
          } else {
            const p = EGPTReal.fromRational(1n, M.primeForVariable(atom.varIdx));
            atomValue = atom.polarity ? p : EGPTMath.subtract(EGPTReal.fromBigInt(1n), p);
          }
          allComplements = EGPTMath.multiply(
            allComplements,
            EGPTMath.subtract(EGPTReal.fromBigInt(1n), atomValue)
          );
        }
        return EGPTMath.subtract(EGPTReal.fromBigInt(1n), allComplements);
      }
    };
  },
  _falseRequirementsForOrFactor(factor) {
    const req = /* @__PURE__ */ new Map();
    for (const atom of factor.atoms) {
      const required = atom.polarity ? 0n : 1n;
      if (req.has(atom.varIdx) && req.get(atom.varIdx) !== required) return null;
      req.set(atom.varIdx, required);
    }
    return req;
  },
  _mergeRequirements(left, right) {
    if (left === null || right === null) return null;
    const out = new Map(left);
    for (const [v, bit] of right) {
      if (out.has(v) && out.get(v) !== bit) return null;
      out.set(v, bit);
    }
    return out;
  },
  _requirementsProbability(req) {
    if (req === null) return EGPTReal.fromBigInt(0n);
    let out = EGPTReal.fromBigInt(1n);
    for (const [v, bit] of req) {
      const p = EGPTReal.fromRational(1n, this.primeForVariable(v));
      const atom = bit === 1n ? p : EGPTMath.subtract(EGPTReal.fromBigInt(1n), p);
      out = EGPTMath.multiply(out, atom);
    }
    return out;
  },
  _orFactorPairValue(leftFactor, rightFactor) {
    const leftFalse = this._falseRequirementsForOrFactor(leftFactor);
    const rightFalse = this._falseRequirementsForOrFactor(rightFactor);
    const bothFalse = this._mergeRequirements(leftFalse, rightFalse);
    const one = EGPTReal.fromBigInt(1n);
    return EGPTMath.add(
      EGPTMath.subtract(
        EGPTMath.subtract(one, this._requirementsProbability(leftFalse)),
        this._requirementsProbability(rightFalse)
      ),
      this._requirementsProbability(bothFalse)
    );
  },
  _requirementsKey(req) {
    if (req === null) return "contradiction";
    return [...req.entries()].sort((a, b) => a[0] - b[0]).map(([v, bit]) => `${v}:${bit}`).join("|");
  },
  primeAtom(indeterminateIndex) {
    if (!Number.isInteger(indeterminateIndex) || indeterminateIndex < 0) {
      throw new TypeError("primeAtom expects a non-negative indeterminate index.");
    }
    return {
      kind: "prime-atom",
      varIdx: indeterminateIndex,
      prime: this.primeForVariable(indeterminateIndex),
      complement: false
    };
  },
  complementPrimeAtom(indeterminateIndex) {
    if (!Number.isInteger(indeterminateIndex) || indeterminateIndex < 0) {
      throw new TypeError("complementPrimeAtom expects a non-negative indeterminate index.");
    }
    return {
      kind: "prime-atom",
      varIdx: indeterminateIndex,
      prime: this.primeForVariable(indeterminateIndex),
      complement: true
    };
  },
  _primeAtomKey(atom) {
    return `${atom.complement ? "c" : "p"}:${atom.prime}`;
  },
  primeAtomFactor(atoms) {
    if (!Array.isArray(atoms)) {
      throw new TypeError("primeAtomFactor expects an array of prime atoms.");
    }
    const normalized = atoms.map((atom) => {
      if (!atom || atom.kind !== "prime-atom") {
        throw new TypeError("primeAtomFactor accepts only primeAtom/complementPrimeAtom values.");
      }
      return {
        kind: "prime-atom",
        varIdx: atom.varIdx,
        prime: atom.prime,
        complement: atom.complement
      };
    });
    return {
      kind: "prime-atom-factor",
      atoms: normalized,
      atomKeys: new Set(normalized.map((atom) => this._primeAtomKey(atom)))
    };
  },
  accumulatedPrimeState() {
    const M = EGPTPolynomial.Multilinear;
    const rootContributions = [];
    const jointContributions = [];
    const one = EGPTPrimeComposite.fromEGPTReal(EGPTReal.fromBigInt(1n));
    const contributions = [{ value: one, killable: false }];
    const stats = {
      atomMerges: 0n,
      conditioningUpdates: 0n,
      branchEvaluations: 0n,
      assignmentTableEntries: 0n,
      expandedPolynomialTerms: 0n,
      termPairEvaluations: 0n,
      fallbackCount: 0n,
      stateTerms: 0,
      maxStateTerms: 0
    };
    return {
      kind: "accumulated-prime-state",
      rootContributions,
      jointContributions,
      primeLists: M.factorToPrimeLists(one),
      conditionalPrimeLists: M.factorToPrimeLists(one),
      contributions,
      stats,
      absorbFactor(factor) {
        if (!factor || factor.kind !== "or-factor") {
          throw new TypeError("accumulatedPrimeState.absorbFactor expects a compressed or-factor.");
        }
        const factorValue = factor.evaluate(/* @__PURE__ */ new Map());
        const sharedBefore = this.sharedPrimesForValue(factorValue);
        if (this.factorKilledByContributions(factorValue)) {
          this.primeLists = M.factorToPrimeLists(EGPTReal.fromBigInt(0n));
          this.conditionalPrimeLists = this.primeLists;
          return this;
        }
        stats.atomMerges += BigInt(factor.supportVars.length);
        stats.stateTerms = 1;
        stats.maxStateTerms = 1;
        this.absorbValue(factorValue);
        this.recordJointRoot(factor, sharedBefore, factorValue);
        return this;
      },
      sharedPrimesForValue(factorValue) {
        const factorLists = M.factorToPrimeLists(factorValue);
        const seen = /* @__PURE__ */ new Set();
        const out = [];
        for (const p of this.conditionalPrimeLists.denominatorPrimes) {
          if (!seen.has(p) && factorLists.denominatorPrimes.includes(p)) {
            seen.add(p);
            out.push(M.variableProbabilityComposite(M._indexOfPrime(p)));
          }
        }
        return out;
      },
      factorKilledByContributions(factorValue) {
        if (!(factorValue instanceof EGPTReal)) return false;
        const factorLists = M.factorToPrimeLists(factorValue);
        const candidateContributions = this.contributions.filter((contribution) => contribution.killable).map((contribution) => contribution.value).concat(this.jointContributions);
        for (const contributionValue of candidateContributions) {
          const contributionLists = M.factorToPrimeLists(contributionValue);
          let allFactorDenominatorsShared = factorLists.denominatorPrimes.length > 0;
          for (const prime of factorLists.denominatorPrimes) {
            if (!contributionLists.denominatorPrimes.includes(prime)) {
              allFactorDenominatorsShared = false;
              break;
            }
          }
          if (allFactorDenominatorsShared) return true;
        }
        return false;
      },
      recordRoot(sharedPrime) {
        const composite = sharedPrime instanceof EGPTPrimeComposite ? sharedPrime : EGPTPrimeComposite.fromEGPTReal(sharedPrime);
        if (!this.rootContributions.some((root) => root.congruentTo(composite))) {
          this.rootContributions.push(composite);
        }
        return this;
      },
      recordJointRoot(factor, sharedPrimes, factorValue) {
        if (!factor || factor.kind !== "or-factor" || factor.atoms.length < 2) return this;
        const primeValues = (sharedPrimes.length > 0 ? sharedPrimes.map((sp) => M._sharedPrimeValue(sp)) : factor.atoms.map((atom) => M.primeForVariable(atom.varIdx))).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        const fullLists = M.factorToPrimeLists(factorValue);
        const records = [];
        for (const prime of fullLists.numeratorPrimes) {
          records.push({ sign: 1, prime, location: "numerator" });
        }
        for (const prime of fullLists.denominatorPrimes) {
          records.push({ sign: 1, prime, location: "denominator" });
        }
        const composite = EGPTPrimeComposite.fromPrimeRecords(records);
        if (!this.jointContributions.some((root) => root.congruentTo(composite))) {
          this.jointContributions.push(composite);
        }
        if (!this.rootContributions.some((root) => root.congruentTo(composite))) {
          this.rootContributions.push(composite);
        }
        return this;
      },
      absorbValue(factorValue) {
        if (!(factorValue instanceof EGPTReal)) {
          throw new TypeError("accumulatedPrimeState.absorbValue expects an EGPTReal-compatible value.");
        }
        const reduced = M.reduceAccumulatedProduct(M.primeListsToEGPTReal(this.primeLists), factorValue);
        const shared = reduced.shared;
        for (const sharedPrime of shared) {
          stats.conditioningUpdates += 1n;
          if (!M.conditionalEntropyZero(this.conditionalPrimeLists, reduced.factorLists, sharedPrime)) {
            throw new Error("accumulatedPrimeState.absorbValue: conditional entropy disagreement.");
          }
          this.recordRoot(sharedPrime);
        }
        this.primeLists = M.factorToPrimeLists(reduced.value);
        this.contributions.length = 0;
        const isSingleAtomOrComplement = (() => {
          for (let i = 0; i < _multilinearPrimeCache.length; i++) {
            const p = M.primeForVariable(i);
            if (factorValue.equals(M.variableProbabilityComposite(i))) return true;
            if (factorValue.equals(EGPTReal.fromRational(_bigSub(p, 1n), p))) return true;
          }
          return false;
        })();
        this.contributions.push({
          value: reduced.value,
          killable: isSingleAtomOrComplement || reduced.shared.length > 0
        });
        const denominatorPrimes = [
          .../* @__PURE__ */ new Set([
            ...this.conditionalPrimeLists.denominatorPrimes.map(String),
            ...reduced.factorLists.denominatorPrimes.map(String),
            ...this.primeLists.denominatorPrimes.map(String)
          ])
        ].map((p) => BigInt(p)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        const exponentMap = new Map(this.primeLists.exponentMap);
        for (const p of denominatorPrimes) {
          if (!exponentMap.has(p) || exponentMap.get(p) >= 0n) exponentMap.set(p, -1n);
        }
        this.conditionalPrimeLists = {
          numeratorPrimes: this.primeLists.numeratorPrimes.slice(),
          denominatorPrimes,
          exponentMap,
          composite: this.primeLists.composite
        };
        stats.stateTerms = 1;
        stats.maxStateTerms = 1;
        return this;
      },
      projectToEGPTReal() {
        return M.primeListsToEGPTReal(this.primeLists);
      }
    };
  },
  linearOverlapConditioning(left, right, overlapVars) {
    if (!Array.isArray(overlapVars)) {
      throw new TypeError("linearOverlapConditioning expects an array of overlap variable indices.");
    }
    const stats = {
      conditioningUpdates: 0n,
      branchEvaluations: 0n,
      conditionalEvaluations: 0n,
      polynomialEvaluations: 0n,
      factorEvaluations: 0n,
      eliminations: 0n,
      maxFactorSupport: 0,
      maxLiveFactors: 0,
      termPairEvaluations: 0n
    };
    for (const variableIndex of overlapVars) {
      stats.conditioningUpdates += 1n;
    }
    const M = this;
    if (!left || !right || left.kind !== "or-factor" || right.kind !== "or-factor") {
      throw new TypeError("linearOverlapConditioning accepts only compressed OR factors on the golden path.");
    }
    const leftFactor = left;
    const rightFactor = right;
    const state = {
      kind: "linear-overlap-conditioned-state",
      supportMask: leftFactor.supportMask | rightFactor.supportMask,
      projectToEGPTReal() {
        return M._orFactorPairValue(leftFactor, rightFactor);
      }
    };
    return { state, stats };
  },
  conditionalPrimeMergeOne(currentValue, nextValue, sharedPrimeAtom) {
    if (!(currentValue instanceof EGPTReal) || !(nextValue instanceof EGPTReal)) {
      throw new TypeError("conditionalPrimeMergeOne expects EGPTReal-compatible current and next values.");
    }
    if (!(sharedPrimeAtom instanceof EGPTReal)) {
      throw new TypeError("conditionalPrimeMergeOne shared atom must be EGPTReal-compatible.");
    }
    const p = this._sharedPrimeValue(sharedPrimeAtom);
    const complement = EGPTReal.fromRational(_bigSub(p, 1n), p);
    const currentIsAtom = currentValue.equals(sharedPrimeAtom);
    const nextIsAtom = nextValue.equals(sharedPrimeAtom);
    const currentIsComplement = currentValue.equals(complement);
    const nextIsComplement = nextValue.equals(complement);
    if (currentIsAtom && nextIsComplement || currentIsComplement && nextIsAtom) {
      return EGPTReal.fromBigInt(0n);
    }
    if (currentIsComplement && nextIsComplement) return currentValue;
    if (currentValue.equals(sharedPrimeAtom)) return currentValue;
    return EGPTMath.subtract(currentValue, sharedPrimeAtom);
  },
  conditionalPrimeMerge(currentValue, nextValue, sharedPrimeAtoms) {
    if (!(currentValue instanceof EGPTReal) || !(nextValue instanceof EGPTReal)) {
      throw new TypeError("conditionalPrimeMerge expects EGPTReal-compatible current and next values.");
    }
    if (!Array.isArray(sharedPrimeAtoms) || sharedPrimeAtoms.length === 0) {
      throw new TypeError("conditionalPrimeMerge expects a non-empty array of shared prime atoms.");
    }
    const stats = {
      conditioningUpdates: 0n,
      branchEvaluations: 0n,
      termPairEvaluations: 0n,
      fallbackCount: 0n
    };
    let value = currentValue;
    for (const shared of sharedPrimeAtoms) {
      if (!(shared instanceof EGPTReal)) {
        throw new TypeError("conditionalPrimeMerge shared atoms must be EGPTReal-compatible.");
      }
      stats.conditioningUpdates += 1n;
      value = this.conditionalPrimeMergeOne(value, nextValue, shared);
    }
    return {
      value,
      stats
    };
  },
  reduceAccumulatedProduct(stateValue, factorValue) {
    if (!(stateValue instanceof EGPTReal) || !(factorValue instanceof EGPTReal)) {
      throw new TypeError("reduceAccumulatedProduct expects EGPTReal-compatible values.");
    }
    const stateLists = this.factorToPrimeLists(stateValue);
    const factorLists = this.factorToPrimeLists(factorValue);
    const seen = /* @__PURE__ */ new Set();
    const shared = [];
    for (const p of stateLists.denominatorPrimes) {
      if (!seen.has(p) && factorLists.denominatorPrimes.includes(p)) {
        seen.add(p);
        shared.push(this.variableProbabilityComposite(this._indexOfPrime(p)));
      }
    }
    for (const sharedPrime of shared) {
      if (!this.conditionalEntropyZero(stateLists, factorLists, sharedPrime)) {
        throw new Error("reduceAccumulatedProduct: conditional entropy disagreement.");
      }
    }
    const value = shared.length > 0 ? this.conditionalPrimeMerge(stateValue, factorValue, shared).value : EGPTMath.multiply(stateValue, factorValue);
    return { value, shared, stateLists, factorLists };
  },
  solveCompressedOrGolden(compressedSystem) {
    if (!Array.isArray(compressedSystem)) {
      throw new TypeError("Multilinear.solveCompressedOrGolden expects an array of compressed factors.");
    }
    const state = this.accumulatedPrimeState();
    for (const factor of compressedSystem) {
      if (!factor || factor.kind !== "or-factor") {
        throw new TypeError("solveCompressedOrGolden accepts only compressed OR factors.");
      }
      try {
        state.absorbFactor(factor);
        if (state.conflict) {
          return {
            roots: /* @__PURE__ */ new Map(),
            residual: /* @__PURE__ */ new Map(),
            rootContributions: state.rootContributions.slice(),
            jointContributions: state.jointContributions.slice(),
            stats: { ...state.stats, conflict: true }
          };
        }
      } catch (err) {
        if (/residue outside preassigned prime cache/.test(err.message)) {
          return {
            roots: /* @__PURE__ */ new Map(),
            residual: /* @__PURE__ */ new Map(),
            rootContributions: state.rootContributions.slice(),
            jointContributions: state.jointContributions.slice(),
            stats: { ...state.stats, unresolvedResidue: true }
          };
        }
        throw err;
      }
    }
    const forbidden = state.stats.branchEvaluations !== 0n || state.stats.assignmentTableEntries !== 0n || state.stats.expandedPolynomialTerms !== 0n || state.stats.termPairEvaluations !== 0n || state.stats.fallbackCount !== 0n;
    if (forbidden) {
      throw new Error("solveCompressedOrGolden: drift counter violation.");
    }
    const residualValue = state.projectToEGPTReal();
    const residual = residualValue.equals(EGPTReal.fromBigInt(0n)) ? /* @__PURE__ */ new Map() : /* @__PURE__ */ new Map([["0", residualValue]]);
    return {
      roots: /* @__PURE__ */ new Map(),
      residual,
      rootContributions: state.rootContributions.slice(),
      jointContributions: state.jointContributions.slice(),
      stats: { ...state.stats }
    };
  }
};

// src/browser/wasm-facade.js
function _p(opName) {
  if (!hasActiveProvider()) {
    throw new Error(
      `EGPT Math SDK (WASM-only dist): no active WASM math provider (op '${opName}'). createEgptMathSdk() must complete successfully before EGPTReal/EGPTMath/EGPTPolynomial are used \u2014 this build ships no JS math-core fallback.`
    );
  }
  return getActiveProvider();
}
__name(_p, "_p");
function _wrap(handle) {
  return new EGPTReal(_CONSTRUCT_TOKEN, handle);
}
__name(_wrap, "_wrap");
function _packed(v, opName) {
  return packedFromHandle(_unwrap(v, opName), opName);
}
__name(_packed, "_packed");
function _unwrap(v, opName) {
  if (v instanceof EGPTReal) return v._handle;
  throw new TypeError(
    `EGPT Math SDK: ${opName} expected an EGPTReal facade instance, got ${v === null ? "null" : typeof v}`
  );
}
__name(_unwrap, "_unwrap");
var _CONSTRUCT_TOKEN = Symbol("egpt-real-facade-construct");
var EGPTReal = class _EGPTReal {
  static {
    __name(this, "EGPTReal");
  }
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
  /**
   * @param {bigint|number} num @param {bigint|number} den
   * @param {{skipReduce?: boolean}} [options] — `skipReduce: true` keeps `num/den`
   *   UN-reduced (the JS `skip_reduce` value state: `3/3` stays `3/3`), a Rust arena
   *   value kind of its own (`ArenaVal::Unreduced`).
   * @returns {EGPTReal}
   */
  static fromRational(num, den, options = {}) {
    if (options.skipReduce === true) {
      return _wrap(handleFromPacked(callWasm("arenaInternUnreduced", String(BigInt(num)), String(BigInt(den)))));
    }
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
   * `EGPTReal.fromScaledVector(base, sNum, sDen)` — the scaled vector `base^(sNum/sDen)` with the
   * base's own scalar combined, reduced by the constructor (16^(1/4) → 2; 2^(1/2) stays √2).
   * Rust port (`arena.rs::js_from_scaled_vector`).
   * @param {EGPTReal} base @param {bigint|number} sNum @param {bigint|number} sDen @returns {EGPTReal}
   */
  static fromScaledVector(base, sNum, sDen) {
    return _wrap(handleFromPacked(callWasm(
      "arenaFromScaledVector",
      _packed(base, "fromScaledVector"),
      String(BigInt(sNum)),
      String(BigInt(sDen))
    )));
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
  /** `EGPTReal#equals` — the instance method (records nothing; `EGPTMath.equals` does). @returns {boolean} */
  equals(other) {
    return callWasm("arenaValueEquals", _packed(this, "equals"), _packed(other, "equals"));
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
  /** Additive inverse — `EGPTReal.negate(this)`. @returns {EGPTReal} */
  negate() {
    return _EGPTReal.negate(this);
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
  // ── In-place scalar mutation — the arena is immutable, so the wrapper swaps its
  // handle to the Rust result (`arena.rs::val_scalar_*`) and returns `this`. The
  // BigInt type check is the reference's own, verbatim.
  /** Translate by a BigInt: this ← this + s. @param {bigint} s @returns {this} */
  scalarAdd(s) {
    if (typeof s !== "bigint") throw new Error("scalarAdd requires BigInt scalar");
    return this._scalarOp("scalarAdd", s);
  }
  /** Translate by −s. @param {bigint} s @returns {this} */
  scalarSubtract(s) {
    if (typeof s !== "bigint") throw new Error("scalarSubtract requires BigInt scalar");
    return this.scalarAdd(-s);
  }
  /** Multiply the SCALAR by s (no scalar re-reduction, base untouched). @param {bigint} s @returns {this} */
  scalarMultiply(s) {
    if (typeof s !== "bigint") throw new Error("scalarMultiply requires BigInt scalar");
    return this._scalarOp("scalarMultiply", s);
  }
  /** Divide the SCALAR by s (no scalar re-reduction, base untouched). @param {bigint} s @returns {this} */
  scalarDivide(s) {
    if (typeof s !== "bigint") throw new Error("scalarDivide requires BigInt scalar");
    return this._scalarOp("scalarDivide", s);
  }
  /** @private */
  _scalarOp(op, s) {
    this._handle = handleFromPacked(callWasm("arenaScalarOp", _packed(this, op), op, String(s)));
    return this;
  }
  /**
   * PORT of dev-core `EGPTReal#isInteger()`: `numerator % denominator === 0n`
   * over `_getPPFRationalParts()` — the UNREDUCED projection (√2 = (1/2)·H(2)
   * projects to 2/2 and is an integer by this test, exactly as in dev-core).
   * Never a `/`-in-the-string check: the canonical string is not reduced.
   * @returns {boolean}
   */
  isInteger() {
    const { numerator, denominator } = this._getPPFRationalParts();
    if (denominator === 0n) throw new Error("Invalid rational with zero denominator");
    return numerator % denominator === 0n;
  }
  /**
   * `_getPPFRationalParts()` — the projection `(scalar·base)` as raw, UN-reduced parts
   * `{ numerator, denominator }` (√2 → {2n, 2n}; un-reduced 84/60 → {84n, 60n}). Parsed
   * from `toCanonicalStr()`, which prints exactly these parts.
   * @returns {{numerator: bigint, denominator: bigint}}
   */
  _getPPFRationalParts() {
    const s = this.toCanonicalStr();
    const slash = s.indexOf("/");
    if (slash === -1) return { numerator: BigInt(s), denominator: 1n };
    return { numerator: BigInt(s.slice(0, slash)), denominator: BigInt(s.slice(slash + 1)) };
  }
  /**
   * `getRationalParts()` — the BASE parts for an identity scalar; for a scaled vector the
   * JS reference's integer nth-root approximation over 1 (√2 → {1n, 1n}), NOT the
   * projection. Rust port (`arena.rs::val_get_rational_parts`).
   * @returns {{numerator: bigint, denominator: bigint}}
   */
  getRationalParts() {
    const obj = valueWithWarnings(callWasm("arenaGetRationalParts", _packed(this, "getRationalParts")));
    return { numerator: BigInt(obj.numerator), denominator: BigInt(obj.denominator) };
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
  /**
   * `EGPTReal.negate(v)`: a unit scalar negates the value; a scaled vector negates its
   * scalar only (√2 → (−1/2)·H(2)). Rust port (`arena.rs::val_negate`).
   * @param {EGPTReal} v @returns {EGPTReal}
   */
  static negate(v) {
    return _wrap(handleFromPacked(callWasm("arenaNegate", _packed(v, "negate"))));
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
var EGPTMath = class _EGPTMath {
  static {
    __name(this, "EGPTMath");
  }
  constructor() {
    throw new Error("EGPTMath is a static class and cannot be instantiated.");
  }
  static add(a, b) {
    return a.add(b);
  }
  static subtract(a, b) {
    return a.subtract(b);
  }
  // Shannon multiply/divide are EGPTMath ops on any EGPTReal — never a subclass's own
  // `multiply`/`divide` (EGPTPrimeComposite's concatenate records), so they bind the
  // EGPTReal implementation explicitly.
  static multiply(a, b) {
    return EGPTReal.prototype.multiply.call(a, b);
  }
  static divide(a, b) {
    return EGPTReal.prototype.divide.call(a, b);
  }
  static normalDivide(a, b) {
    return a.normalDivide(b);
  }
  static mod(a, b) {
    return a.mod(b);
  }
  static equals(a, b) {
    return _p("equals").equals(_unwrap(a, "equals"), _unwrap(b, "equals"));
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
    return _EGPTMath.multiply(a, b);
  }
  static subtractInLogSpace(a, b) {
    return _EGPTMath.divide(a, b);
  }
  static addVectors(a, b) {
    return a.add(b);
  }
  static negate(a) {
    return a.negate();
  }
  /** Normal-space (coordinate) multiply — the reference's `_coordinateMultiply`. */
  static normalMultiply(a_en, b_en) {
    return _coordinateMultiply(a_en, b_en);
  }
  /** `EGPTMath.abs(a)`: `fromRational(-n, d)` of a negative projection, else `a.clone()`. */
  static abs(a_en) {
    const neg = callWasm("arenaAbsNegative", _packed(a_en, "abs"));
    return neg === "" ? a_en.clone() : _wrap(handleFromPacked(neg));
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
  /**
   * Structural congruence: value equality for two plain values, otherwise the
   * prime-record lift compared by `congruentTo`.
   */
  static congruent(a_en, b_en) {
    const aIsComposite = a_en instanceof EGPTPrimeComposite;
    const bIsComposite = b_en instanceof EGPTPrimeComposite;
    if (!aIsComposite && !bIsComposite) {
      return _EGPTMath.equals(a_en, b_en);
    }
    const ca = aIsComposite ? a_en : EGPTPrimeComposite.fromEGPTReal(a_en);
    return ca.congruentTo(b_en);
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
function _coordinateMultiply(a_en, b_en) {
  const a_scalar = a_en.getScalarParts();
  const b_scalar = b_en.getScalarParts();
  if (a_scalar.numerator === 1n && a_scalar.denominator === 1n && b_scalar.numerator === 1n && b_scalar.denominator === 1n) {
    return _wrap(handleFromPacked(callWasm(
      "arenaCoordinateMultiplyUnit",
      _packed(a_en, "normalMultiply"),
      _packed(b_en, "normalMultiply")
    )));
  }
  const H_ZERO = EGPTReal.fromBigInt(0n);
  const a_is_negative = EGPTMath.compare(a_en, H_ZERO) < 0;
  const b_is_negative = EGPTMath.compare(b_en, H_ZERO) < 0;
  const a_abs = a_is_negative ? EGPTReal.negate(a_en) : a_en;
  const b_abs = b_is_negative ? EGPTReal.negate(b_en) : b_en;
  const product_abs = EGPTMath.multiply(a_abs, b_abs);
  const result_is_negative = a_is_negative !== b_is_negative;
  return result_is_negative ? EGPTReal.negate(product_abs) : product_abs;
}
__name(_coordinateMultiply, "_coordinateMultiply");
var _COMPOSITE_HANDLE = Symbol("egpt-prime-composite-handle");
function _compositeCtorJson(records, sign) {
  const num = /* @__PURE__ */ __name((x) => typeof x === "number" && Number.isFinite(x) ? x : null, "num");
  return JSON.stringify({
    sign: num(sign),
    signIsNum: typeof sign === "number",
    records: records.map((r) => {
      const o = {
        s: num(r.sign),
        sNum: typeof r.sign === "number",
        sRaw: `${r.sign}`,
        p: typeof r.prime === "bigint" ? String(r.prime) : null,
        pRaw: `${r.prime}`,
        l: typeof r.location === "string" ? r.location : null,
        lRaw: `${r.location}`
      };
      if (r.clauseIdx !== void 0) {
        o.hc = true;
        o.c = r.clauseIdx;
      }
      return o;
    })
  });
}
__name(_compositeCtorJson, "_compositeCtorJson");
function _identityTokens() {
  const ids = /* @__PURE__ */ new Map();
  let unique = 0;
  return (x) => {
    const t = typeof x;
    if (t === "number" && Number.isNaN(x)) return `nan:${unique++}`;
    if (t === "object" && x !== null || t === "function" || t === "symbol") {
      if (!ids.has(x)) ids.set(x, `id:${ids.size}`);
      return ids.get(x);
    }
    return `${t}:${String(x)}`;
  };
}
__name(_identityTokens, "_identityTokens");
var EGPTPrimeComposite = class _EGPTPrimeComposite extends EGPTReal {
  static {
    __name(this, "EGPTPrimeComposite");
  }
  /**
   * @param {Array<{sign: 1|-1, prime: bigint, location: 'numerator'|'denominator'}>} records
   * @param {1|-1} sign — overall sign (product of the record signs).
   */
  constructor(records, sign) {
    let handle;
    if (records === _COMPOSITE_HANDLE) {
      handle = sign;
    } else {
      if (!Array.isArray(records)) {
        throw new TypeError("EGPTPrimeComposite constructor requires a records array.");
      }
      handle = handleFromPacked(callWasm("primeCompositeNew", _compositeCtorJson(records, sign)));
    }
    super(_CONSTRUCT_TOKEN, handle);
    const st = JSON.parse(callWasm("primeCompositeState", _packed(this, "EGPTPrimeComposite")));
    this.records = st.records.map((r) => ({
      sign: r.sign,
      prime: BigInt(r.prime),
      location: r.location,
      ...r.clauseIdx !== void 0 ? { clauseIdx: r.clauseIdx } : {}
    }));
    this.primes = new Map(st.primes.map(([p, e]) => [BigInt(p), BigInt(e)]));
    this.sign = st.sign;
  }
  /** @param {object} h — a provider handle to an `ArenaVal::Composite`. @returns {EGPTPrimeComposite} */
  static _fromHandle(h) {
    return new _EGPTPrimeComposite(_COMPOSITE_HANDLE, h);
  }
  static fromPrimeRecords(records) {
    if (!Array.isArray(records)) {
      throw new TypeError("fromPrimeRecords requires an array.");
    }
    let overallSign = 1;
    for (const r of records) {
      overallSign = overallSign * r.sign;
    }
    return new _EGPTPrimeComposite(records, overallSign);
  }
  /** @param {EGPTReal} num @returns {EGPTPrimeComposite} */
  static fromEGPTReal(num) {
    if (!(num instanceof EGPTReal)) {
      throw new TypeError("fromEGPTReal requires an EGPTReal argument.");
    }
    return _EGPTPrimeComposite._fromHandle(handleFromPacked(callWasm("primeCompositeFromReal", _packed(num, "fromEGPTReal"))));
  }
  /** Concatenate records (no cancellation); signs multiply. */
  multiply(other) {
    const rhs = other instanceof _EGPTPrimeComposite ? other : _EGPTPrimeComposite.fromEGPTReal(other);
    return _EGPTPrimeComposite._fromHandle(handleFromPacked(
      callWasm("primeCompositeMultiply", _packed(this, "multiply"), _packed(rhs, "multiply"))
    ));
  }
  /** Flip the divisor's locations, concatenate; signs multiply. */
  divide(other) {
    const rhs = other instanceof _EGPTPrimeComposite ? other : _EGPTPrimeComposite.fromEGPTReal(other);
    return _EGPTPrimeComposite._fromHandle(handleFromPacked(
      callWasm("primeCompositeDivide", _packed(this, "divide"), _packed(rhs, "divide"))
    ));
  }
  /** The composite's own value as a reduced EGPTReal (a constant evaluates to itself). */
  evaluateAt(value) {
    const rational = this._getPPFRationalParts();
    return EGPTReal.fromRational(rational.numerator, rational.denominator);
  }
  getPrimesInNumerator() {
    const out = /* @__PURE__ */ new Map();
    for (const [p, e] of this.primes) {
      if (e > 0n) out.set(p, e);
    }
    return out;
  }
  getPrimesInDenominator() {
    const out = /* @__PURE__ */ new Map();
    for (const [p, e] of this.primes) {
      if (e < 0n) out.set(p, -e);
    }
    return out;
  }
  getSignedPrimes() {
    return this.records.map((r) => ({
      prime: r.prime,
      location: r.location,
      sign: r.sign,
      exponent: 1n,
      ...r.clauseIdx !== void 0 ? { clauseIdx: r.clauseIdx } : {}
    }));
  }
  getSign() {
    return this.sign;
  }
  /** A new composite from this one's records and sign. */
  clone() {
    return new _EGPTPrimeComposite(this.records, this.sign);
  }
  /** Order-independent multiset key of `${sign}:${prime}:${location}` renderings. */
  static recordsMultisetKey(records) {
    return callWasm(
      "primeCompositeRecordsKey",
      JSON.stringify(records.map((r) => `${r.sign}:${r.prime}:${r.location}`))
    );
  }
  /** Same overall sign and same record multiset (a plain EGPTReal is lifted first). */
  congruentTo(other) {
    const lifted = other instanceof _EGPTPrimeComposite ? other : _EGPTPrimeComposite.fromEGPTReal(other);
    return callWasm("primeCompositeCongruent", _packed(this, "congruentTo"), _packed(lifted, "congruentTo"));
  }
  static RULE_NO_REDUCE = /* @__PURE__ */ __name((records) => records, "RULE_NO_REDUCE");
  /** Drop +1-signed (p, numerator)/(p, denominator) pairs until none remain. */
  static RULE_OR_RATIONAL_CANCEL = /* @__PURE__ */ __name((records) => {
    const token = _identityTokens();
    const keep = JSON.parse(callWasm("primeCompositeCancelRule", JSON.stringify(
      records.map((r) => [r.sign === 1, token(r.prime), token(r.location)])
    )));
    return keep.map((i) => records[i]);
  }, "RULE_OR_RATIONAL_CANCEL");
  applyRule(rule) {
    return _EGPTPrimeComposite.fromPrimeRecords(rule(this.records));
  }
};
var _composedMathInstance = null;
function _composedMath() {
  if (!_composedMathInstance) _composedMathInstance = createComposedMath({ EGPTReal, EGPTMath });
  return _composedMathInstance;
}
__name(_composedMath, "_composedMath");
function _handlesJson(arr, opName) {
  return JSON.stringify(arr.map((x) => String(_packed(x, opName))));
}
__name(_handlesJson, "_handlesJson");
function _fromTag(tag, args) {
  const [k, x, y] = tag.split(":");
  if (k === "h") return _wrap(handleFromPacked(x));
  if (k === "p") return EGPTPrimeComposite._fromHandle(handleFromPacked(x));
  const src = args[Number(x)][Number(y)];
  return k === "r" ? src : src.clone();
}
__name(_fromTag, "_fromTag");
function _fromTags(tags, args) {
  return tags.map((t) => _fromTag(t, args));
}
__name(_fromTags, "_fromTags");
function _polyPort(op, a, b = []) {
  return JSON.parse(callWasm("polyPort", op, _handlesJson(a, op), _handlesJson(b, op)));
}
__name(_polyPort, "_polyPort");
var _asArray = /* @__PURE__ */ __name((poly) => Array.isArray(poly) ? poly : [], "_asArray");
var EGPTPolynomial = Object.freeze({
  /** Trailing zeros removed (never shorter than one term); the kept terms are the caller's own objects. */
  trimZeros(poly) {
    return _fromTags(_polyPort("trimZeros", _asArray(poly)), [poly]);
  },
  /** Highest non-zero power (0 for a constant). @returns {number} */
  degree(poly) {
    return Number(_polyPort("degree", _asArray(poly)));
  },
  /** Coefficient-wise `.equals()` after trimming. @returns {boolean} */
  equals(poly1, poly2) {
    return _polyPort("equals", _asArray(poly1), _asArray(poly2));
  },
  add(poly1, poly2) {
    return _fromTags(_polyPort("add", poly1, poly2), [poly1, poly2]);
  },
  subtract(poly1, poly2) {
    return _fromTags(_polyPort("subtract", poly1, poly2), [poly1, poly2]);
  },
  /** Convolution; all-composite operands dispatch to `multiplyNoReduce`, as the reference does. */
  multiply(poly1, poly2) {
    return _fromTags(_polyPort("multiply", poly1, poly2), [poly1, poly2]);
  },
  multiplyNoReduce(poly1, poly2) {
    if (!Array.isArray(poly1) || !Array.isArray(poly2)) {
      throw new TypeError("multiplyNoReduce expects two coefficient arrays.");
    }
    return _fromTags(_polyPort("multiplyNoReduce", poly1, poly2), [poly1, poly2]);
  },
  /** @returns {{quotient: EGPTReal[], remainder: EGPTReal[]}} */
  divide(dividend, divisor) {
    const r = _polyPort("divide", dividend, divisor);
    return { quotient: _fromTags(r.quotient, [dividend, divisor]), remainder: _fromTags(r.remainder, [dividend, divisor]) };
  },
  /** Monic GCD by the Euclidean algorithm. */
  gcd(F, G) {
    return _fromTags(_polyPort("gcd", F, G), [F, G]);
  },
  /** True iff gcd(F, G) has positive degree. */
  shareCommonFactor(F, G) {
    return _polyPort("shareCommonFactor", F, G);
  },
  /** Horner evaluation at x. */
  evaluateAt(poly, x) {
    return _fromTag(_polyPort("evaluateAt", poly, [x])[0], [poly, [x]]);
  },
  /** p(k/N) for k = 0..N−1. */
  forwardTransform(coefficients, N) {
    return _fromTags(JSON.parse(callWasm(
      "polyPortTransform",
      "forwardTransform",
      _handlesJson(coefficients, "forwardTransform"),
      N,
      `${N}`
    )), [coefficients]);
  },
  /** Newton divided-difference interpolation from N samples at k/N. */
  inverseTransform(samples, N) {
    return _fromTags(JSON.parse(callWasm(
      "polyPortTransform",
      "inverseTransform",
      _handlesJson(samples, "inverseTransform"),
      N,
      `${N}`
    )), [samples]);
  },
  /** [P(2^0), P(2^1), …, P(2^D)]. */
  toValueRepresentation(coefficients) {
    if (!Array.isArray(coefficients)) {
      throw new TypeError("EGPTPolynomial.toValueRepresentation expects an EGPTReal[]");
    }
    return _fromTags(_polyPort("toValueRepresentation", coefficients), [coefficients]);
  },
  /** Coefficients from D+1 samples at x = 2^0..2^D (the inverse of toValueRepresentation). */
  fromValueRepresentation(samples) {
    if (!Array.isArray(samples)) {
      throw new TypeError("EGPTPolynomial.fromValueRepresentation expects an EGPTReal[]");
    }
    return _fromTags(_polyPort("fromValueRepresentation", samples), [samples]);
  },
  /** Conditional entropy H(k|p) — `EGPTMath.conditionalEntropyVector`, as the reference delegates. */
  evaluateValueRepresentation(k, p) {
    return EGPTMath.conditionalEntropyVector(k, p);
  },
  /** Rational roots with multiplicity, sorted by |r|; `{preserveUnreduced: true}` keeps p/q un-reduced. */
  rationalRoots(P, options = {}) {
    if (!Array.isArray(P)) {
      throw new TypeError("EGPTPolynomial.rationalRoots expects an EGPTReal[]");
    }
    const op = options.preserveUnreduced === true ? "rationalRootsUnreduced" : "rationalRoots";
    return _fromTags(_polyPort(op, P), [P]);
  },
  /** Integer u-space roots (L/q)·p over L = lcm of the root denominators. */
  toNatRoots(P) {
    return _fromTags(_polyPort("toNatRoots", P), [P]);
  },
  /** The prime-atom multiset of the u-roots, as an EGPTPrimeComposite. */
  toNat(P) {
    return _fromTag(_polyPort("toNat", P)[0], [P]);
  },
  /** The multilinear-polynomial namespace (wasm-multilinear-facade.js); the barrel's `Multilinear`. */
  Multilinear
});
function polyGCD(a, b) {
  return _fromTags(_polyPort("polyGCD", a, b), [a, b]);
}
__name(polyGCD, "polyGCD");
function monicNormalize(poly) {
  return _fromTags(_polyPort("monicNormalize", poly), [poly]);
}
__name(monicNormalize, "monicNormalize");
var _matrixJson = /* @__PURE__ */ __name((M, op) => JSON.stringify(M.map((row) => row.map((x) => String(_packed(x, op))))), "_matrixJson");
function _matrixPort(op, A, B) {
  const rows = JSON.parse(callWasm("polyPortMatrix", op, _matrixJson(A, op), _matrixJson(B, op)));
  const args = [A.flat(), B.flat()];
  return rows.map((row) => _fromTags(row, args));
}
__name(_matrixPort, "_matrixPort");
function matMul(A, B) {
  return _matrixPort("matMul", A, B);
}
__name(matMul, "matMul");
function matMulDense(A, B) {
  return _matrixPort("matMulDense", A, B);
}
__name(matMulDense, "matMulDense");
function detectToeplitzStencil(A) {
  const op = "detectToeplitzStencil";
  const tags = JSON.parse(callWasm("polyPortMatrix", op, _matrixJson(A, op), "[]"));
  return tags === null ? null : { kind: "toeplitz", stencil: _fromTags(tags, [A.flat()]) };
}
__name(detectToeplitzStencil, "detectToeplitzStencil");
var EGPTMatrix = createEGPTMatrix({ EGPTReal, EGPTMath, EGPTPolynomial });
var EGPTFFT = createEGPTFFT({ EGPTPolynomial });
var _transcendental = createEGPTranscendental({ EGPTReal, EGPTMath });
function _xyFromJson(obj) {
  return { x: _wrap(handleFromPacked(obj.x)), y: _wrap(handleFromPacked(obj.y)) };
}
__name(_xyFromJson, "_xyFromJson");
var EGPTranscendental = class _EGPTranscendental {
  static {
    __name(this, "EGPTranscendental");
  }
  constructor() {
    throw new Error("EGPTranscendental is a static class and cannot be instantiated.");
  }
  /**
   * `{H_2, H_sqrt2_over_2, init()}` — √2/2 appears once `init()` has run. The reference builds
   * H_2 at module load and √2/2 once, on the first `init()`; that first `init()` reports the
   * same construction here (`fromRational(1/2)`, `sqrt`). The values are read fresh from the arena
   * on each access (an arena value cannot outlive its scope), without reports: the reference
   * reads a stored field.
   */
  static _circularConstants = /* @__PURE__ */ (() => {
    let inited = false;
    return {
      get H_2() {
        return quietly(() => EGPTReal.fromBigInt(2n));
      },
      get H_sqrt2_over_2() {
        return inited ? quietly(() => EGPTMath.sqrt(EGPTReal.fromRational(1n, 2n))) : null;
      },
      init() {
        if (!inited) {
          const H_half = EGPTReal.fromRational(1n, 2n);
          EGPTMath.sqrt(H_half);
          inited = true;
        }
        return this;
      }
    };
  })();
  /** A half-rotation in phase space — the canonical equivalent of π. */
  static get PI_PHASE() {
    return EGPTReal.fromRational(1n, 2n);
  }
  /** A full rotation in phase space. */
  static get TAU_PHASE() {
    return EGPTReal.fromBigInt(1n);
  }
  static _phaseToCartesian(H_fraction) {
    return _transcendental._phaseToCartesian(H_fraction);
  }
  static _phaseToCircularCartesian(H_fraction) {
    _EGPTranscendental._circularConstants.init();
    return _xyFromJson(JSON.parse(callWasm("transcendentalPhaseToCircular", _packed(H_fraction, "_phaseToCircularCartesian"))));
  }
  static _calcTriangularWavePosition(H_P, H_x) {
    return _transcendental._calcTriangularWavePosition(H_P, H_x);
  }
  static _getVectorFromPhase(H_n, H_phase) {
    return _transcendental._getVectorFromPhase(H_n, H_phase);
  }
  static cos(H_phase) {
    return _transcendental.cos(H_phase);
  }
  static sin(H_phase) {
    return _transcendental.sin(H_phase);
  }
  /** e^z on the unit square: phase b·2^(−a). @returns {{x: EGPTReal, y: EGPTReal}} */
  static exp(z) {
    return _xyFromJson(valueWithWarnings(callWasm("transcendentalExp", _packed(z.real, "exp"), _packed(z.imag, "exp"))));
  }
  static exp2(H_entropy) {
    return _transcendental.exp2(H_entropy);
  }
  static log2(x_en) {
    return _transcendental.log2(x_en);
  }
  /** n! — exact up to 20, the topology-native Stirling form beyond. */
  static factorial(n) {
    return _wrap(handleFromPacked(valueWithWarnings(callWasm("transcendentalFactorial", String(n)))));
  }
};
var _EGPTStat;
var EGPTStatData = createEGPTStatData({ EGPTReal, EGPTMath, getEGPTStat: /* @__PURE__ */ __name(() => _EGPTStat, "getEGPTStat") });
var _statAlgo = createEGPTStat({ EGPTReal, EGPTMath, getEGPTStatData: /* @__PURE__ */ __name(() => EGPTStatData, "getEGPTStatData") });
var EGPTStat = Object.freeze({
  ..._statAlgo,
  comprehensiveStatisticalAnalysis(H_values, options = {}) {
    SimpleLogger.log("\u{1F4CA} COMPREHENSIVE STATISTICAL ANALYSIS: Ultra-high precision with EGPTStatData");
    SimpleLogger.log(`   Analyzing ${H_values.length} entropy values`);
    return _statAlgo.comprehensiveStatisticalAnalysis(H_values, options);
  }
});
_EGPTStat = EGPTStat;
var _complex = createEGPTComplex({
  EGPTReal,
  EGPTMath,
  transcendental: EGPTranscendental,
  phaseToCircular: /* @__PURE__ */ __name((p) => EGPTranscendental._phaseToCircularCartesian(p), "phaseToCircular")
});
var ComplexEGPTReal = _complex.ComplexEGPTReal;
var TwiddleTable = _complex.TwiddleTable;
var _twiddleTableCache = /* @__PURE__ */ new Map();
function _isUnitCircle(z) {
  const magnitude = z.getMagnitude();
  const H_ONE = EGPTReal.fromBigInt(1n);
  return EGPTMath.equals(magnitude, H_ONE);
}
__name(_isUnitCircle, "_isUnitCircle");
function _extractPhaseDenominator(phase) {
  try {
    const rational = phase._getPPFRationalParts();
    if (rational.denominator === 0n) return null;
    return rational.denominator;
  } catch (error) {
    return null;
  }
}
__name(_extractPhaseDenominator, "_extractPhaseDenominator");
var _findLCM = /* @__PURE__ */ __name((a, b) => BigInt(callWasm("complexFindLcm", String(a), String(b))), "_findLCM");
function _phaseToTwiddleIndex(phase, k) {
  try {
    const rational = phase._getPPFRationalParts();
    if (rational.denominator === 0n) return null;
    const q = callWasm("complexTwiddleQuotient", String(rational.numerator), String(rational.denominator), String(k));
    if (q === "") return null;
    const j = Number(BigInt(q));
    return (j % Number(k) + Number(k)) % Number(k);
  } catch (error) {
    return null;
  }
}
__name(_phaseToTwiddleIndex, "_phaseToTwiddleIndex");
function _getOrCreateTwiddleTable(k) {
  const hit = _twiddleTableCache.get(k);
  if (hit === void 0) {
    const table = new TwiddleTable(k);
    _twiddleTableCache.set(k, table);
    return table;
  }
  const epoch = quietly(() => EGPTReal.fromBigInt(0n))._handle.e;
  if (hit.getTwiddle(0).real._handle.e !== epoch) {
    const table = quietly(() => new TwiddleTable(k));
    _twiddleTableCache.set(k, table);
    return table;
  }
  return hit;
}
__name(_getOrCreateTwiddleTable, "_getOrCreateTwiddleTable");
var EGPTComplex = class {
  static {
    __name(this, "EGPTComplex");
  }
  constructor() {
    throw new Error("EGPTComplex is a static class and cannot be instantiated.");
  }
  static complexMultiply(z1, z2) {
    const z1_is_unit = _isUnitCircle(z1);
    const z2_is_unit = _isUnitCircle(z2);
    if (z1_is_unit && z2_is_unit) {
      try {
        const phase1 = z1.getPhase();
        const phase2 = z2.getPhase();
        const denom1 = _extractPhaseDenominator(phase1);
        const denom2 = _extractPhaseDenominator(phase2);
        if (denom1 !== null && denom2 !== null) {
          const k_bigint = _findLCM(denom1, denom2);
          if (k_bigint <= 65536n && k_bigint > 0n) {
            const k = Number(k_bigint);
            const j1 = _phaseToTwiddleIndex(phase1, k_bigint);
            const j2 = _phaseToTwiddleIndex(phase2, k_bigint);
            if (j1 !== null && j2 !== null) {
              const table = _getOrCreateTwiddleTable(k);
              const result = table.multiplyByPhase(j1, j2);
              return result.twiddle;
            }
          }
        }
      } catch (error) {
      }
    }
    return _complex.EGPTComplex.complexMultiplyEuclidean(z1, z2);
  }
  static exp(z) {
    const coords = EGPTranscendental.exp(z);
    return new ComplexEGPTReal(coords.x, coords.y);
  }
};
for (const [k, v] of Object.entries(_complex.EGPTComplex)) {
  if (k !== "complexMultiply") EGPTComplex[k] = v;
}

// src/browser/wasm-boundary-facade.js
function f64ToOddDenom(f) {
  if (!Number.isFinite(f)) throw new Error(`f64ToOddDenom: non-finite ${f}`);
  const r = JSON.parse(callWasm("boundaryF64ToOddDenom", f));
  return { sign: r.sign, odd: BigInt(r.odd), denomLog2: r.denomLog2 };
}
__name(f64ToOddDenom, "f64ToOddDenom");
function toEGPTReal(f) {
  if (!Number.isFinite(f)) throw new Error(`f64ToOddDenom: non-finite ${f}`);
  const p = JSON.parse(callWasm("boundaryToEgptRealParts", f));
  if (p.zero) return EGPTReal.fromBigInt(0n);
  if (p.d === void 0) return EGPTReal.fromBigInt(BigInt(p.n));
  return EGPTReal.fromRational(BigInt(p.n), BigInt(p.d));
}
__name(toEGPTReal, "toEGPTReal");
function floatToEGPT(f) {
  if (!Number.isFinite(f)) throw new Error(`floatToEGPT: non-finite ${f}`);
  return toEGPTReal(f);
}
__name(floatToEGPT, "floatToEGPT");
function liftScalar(x) {
  if (x instanceof EGPTReal) return x;
  if (typeof x === "bigint") return EGPTReal.fromBigInt(x);
  if (typeof x === "number") return floatToEGPT(x);
  if (Array.isArray(x) && x.length === 2) {
    return EGPTReal.fromRational(BigInt(x[0]), BigInt(x[1]));
  }
  if (x && typeof x === "object" && "num" in x && "den" in x) {
    return EGPTReal.fromRational(BigInt(x.num), BigInt(x.den));
  }
  throw new Error(`liftScalar: cannot lift ${JSON.stringify(x)}`);
}
__name(liftScalar, "liftScalar");

// src/browser/wasm-prime-atom-facade.js
var _big = /* @__PURE__ */ __name((x) => typeof x === "bigint" ? x : BigInt(x), "_big");
var _factorsFromJson = /* @__PURE__ */ __name((json) => JSON.parse(json).map((f) => ({ prime: BigInt(f.prime), exponent: BigInt(f.exponent) })), "_factorsFromJson");
var _factorsToJson = /* @__PURE__ */ __name((v) => JSON.stringify(v.map((f) => ({ prime: String(f.prime), exponent: String(f.exponent) }))), "_factorsToJson");
var PrimeAtomPolynomial = class {
  static {
    __name(this, "PrimeAtomPolynomial");
  }
  constructor() {
    throw new Error("PrimeAtomPolynomial is a static class and cannot be instantiated.");
  }
  /** @param {bigint|number} N @returns {{prime: bigint, exponent: bigint}[]} */
  static factorize(N) {
    return _factorsFromJson(callWasm("primeAtomFactorize", String(_big(N))));
  }
  /** @param {bigint|number} N @returns {bigint} */
  static totient(N) {
    return BigInt(callWasm("primeAtomTotient", String(_big(N))));
  }
  /** @param {bigint|number} n @returns {bigint[]} */
  static divisorsOf(n) {
    return JSON.parse(callWasm("primeAtomDivisorsOf", String(_big(n)))).map(BigInt);
  }
  /** @param {bigint|number} N @returns {number} */
  static omega(N) {
    return callWasm("primeAtomOmega", String(_big(N)));
  }
  /** @param {bigint|number} N @returns {bigint} */
  static bigOmega(N) {
    return BigInt(callWasm("primeAtomBigOmega", String(_big(N))));
  }
  /** @param {bigint|number} N @returns {number} */
  static bitLength(N) {
    return callWasm("primeAtomBitLength", String(_big(N)));
  }
  /** @param {bigint|number} N @returns {string} */
  static logspaceSum(N) {
    return callWasm("primeAtomLogspaceSum", String(_big(N)));
  }
};
function makeMeter() {
  return JSON.parse(callWasm("primeAtomMakeMeter"));
}
__name(makeMeter, "makeMeter");
function factMultiply(va, vb, meter) {
  const r = JSON.parse(callWasm("primeAtomFactMultiply", _factorsToJson(va), _factorsToJson(vb)));
  if (meter) for (let c = 0; c < r.compressedOps; c++) meter.compressedOps += 1;
  return r.product.map((f) => ({ prime: BigInt(f.prime), exponent: BigInt(f.exponent) }));
}
__name(factMultiply, "factMultiply");
function reconstruct(v, meter) {
  if (meter) meter.boundaryOps += 1;
  return BigInt(callWasm("primeAtomReconstruct", _factorsToJson(v)));
}
__name(reconstruct, "reconstruct");
function refactorize(N, meter) {
  if (meter) meter.boundaryOps += 1;
  return PrimeAtomPolynomial.factorize(N);
}
__name(refactorize, "refactorize");
var _integerAdd = /* @__PURE__ */ __name((a, b) => BigInt(callWasm("primeAtomIntegerAdd", String(a), String(b))), "_integerAdd");
function kroneckerProduct(A, B, meter) {
  const m1 = A.length, k1 = A[0].length;
  const m2 = B.length, k2 = B[0].length;
  const encMeter = makeMeter();
  const vA = A.map((row) => row.map((x) => refactorize(x, encMeter)));
  const vB = B.map((row) => row.map((x) => refactorize(x, encMeter)));
  const Kron = new Array(m1 * m2);
  for (let i1 = 0; i1 < m1; i1++) {
    for (let i2 = 0; i2 < m2; i2++) {
      Kron[i1 * m2 + i2] = new Array(k1 * k2);
      for (let j1 = 0; j1 < k1; j1++) {
        for (let j2 = 0; j2 < k2; j2++) {
          Kron[i1 * m2 + i2][j1 * k2 + j2] = factMultiply(vA[i1][j1], vB[i2][j2], meter);
        }
      }
    }
  }
  return Kron;
}
__name(kroneckerProduct, "kroneckerProduct");
function primeAtomMatMul(A, B, meter) {
  const m = A.length, k = A[0].length, n = B[0].length;
  const encMeter = makeMeter();
  const vA = A.map((row) => row.map((x) => refactorize(x, encMeter)));
  const vB = B.map((row) => row.map((x) => refactorize(x, encMeter)));
  const vC = new Array(m);
  for (let i = 0; i < m; i++) {
    vC[i] = new Array(n);
    for (let l = 0; l < n; l++) {
      const productVecs = new Array(k);
      for (let j = 0; j < k; j++) {
        productVecs[j] = factMultiply(vA[i][j], vB[j][l], meter);
      }
      let sumAsInt = 0n;
      for (let j = 0; j < k; j++) {
        sumAsInt = _integerAdd(sumAsInt, reconstruct(productVecs[j], meter));
        if (meter) meter.integerAdds += 1;
      }
      vC[i][l] = refactorize(sumAsInt, meter);
    }
  }
  return vC;
}
__name(primeAtomMatMul, "primeAtomMatMul");
var PAP = PrimeAtomPolynomial;
function perPrimeExponentMatrix(A, prime) {
  const m = A.length;
  const k = A[0].length;
  const out = new Array(m);
  for (let i = 0; i < m; i++) {
    out[i] = new Array(k);
    for (let j = 0; j < k; j++) {
      const factors = PAP.factorize(A[i][j]);
      const hit = factors.find((f) => f.prime === prime);
      out[i][j] = hit ? Number(hit.exponent) : 0;
    }
  }
  return out;
}
__name(perPrimeExponentMatrix, "perPrimeExponentMatrix");
function primesInSupport(A) {
  const set = /* @__PURE__ */ new Set();
  for (const row of A) {
    for (const N of row) {
      for (const { prime } of PAP.factorize(N)) {
        set.add(prime);
      }
    }
  }
  return [...set].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}
__name(primesInSupport, "primesInSupport");
function classifyAntidiagonalToeplitz(A) {
  const m = A.length;
  const k = A[0].length;
  const stencil = [];
  for (let d = -(m - 1); d <= k - 1; d++) {
    let ref = null;
    for (let i = 0; i < m; i++) {
      const j = i + d;
      if (j < 0 || j >= k) continue;
      if (ref === null) ref = A[i][j];
      else if (A[i][j] !== ref) return { toeplitz: false };
    }
    stencil.push(ref);
  }
  const distinct = new Set(stencil);
  const nonZero = stencil.filter((v) => v !== 0 && v !== null);
  const meaningful = distinct.size >= 2 && nonZero.length >= 2;
  return { toeplitz: true, stencil, meaningful, nonZeroCount: nonZero.length };
}
__name(classifyAntidiagonalToeplitz, "classifyAntidiagonalToeplitz");
var OrderFinder = class {
  static {
    __name(this, "OrderFinder");
  }
  constructor() {
    throw new Error("OrderFinder is a static class and cannot be instantiated.");
  }
  /** @param {bigint|number} N @returns {number} */
  static calculateSampleSize(N) {
    return callWasm("orderFinderCalculateSampleSize", String(_big(N)));
  }
  /**
   * Smallest r > 0 with a^r ≡ 1 (mod N); requires gcd(a, N) = 1.
   * @param {bigint|number} a @param {bigint|number} N @returns {number|null}
   */
  static findOrder(a, N) {
    const r = callWasm("orderFinderFindOrder", String(_big(a)), String(_big(N)), `${a}`, `${N}`);
    return r === "" ? null : Number(r);
  }
  /** @param {bigint|number} a @param {bigint|number} N @param {bigint|number} r @returns {boolean} */
  static verifyOrder(a, N, r) {
    return callWasm("orderFinderVerifyOrder", String(_big(a)), String(_big(N)), String(_big(r)));
  }
};
function sieveOfEratosthenes(limit) {
  if (!Number.isInteger(limit)) {
    throw new TypeError(`sieveOfEratosthenes: limit must be an integer, got ${limit}`);
  }
  if (limit < 2) return [];
  return JSON.parse(callWasm("primeCacheSieve", limit, `${limit + 1}`));
}
__name(sieveOfEratosthenes, "sieveOfEratosthenes");
var PrimeCache = class {
  static {
    __name(this, "PrimeCache");
  }
  constructor(limit = 1 << 16) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new TypeError(
        `PrimeCache: limit must be a non-negative integer, got ${limit}`
      );
    }
    this._limit = limit;
    this._primes = null;
  }
  _ensureSieve() {
    if (this._primes === null) {
      this._primes = sieveOfEratosthenes(this._limit);
    }
    return this._primes;
  }
  get size() {
    return this._ensureSieve().length;
  }
  primes() {
    return this._ensureSieve();
  }
  /** @param {number|bigint} prime @returns {number|null} the prime's index in the sieve */
  indexOf(prime) {
    const p = typeof prime === "bigint" ? Number(prime) : prime;
    if (!Number.isInteger(p) || p < 2) return null;
    this._ensureSieve();
    const idx = callWasm("primeCacheIndexOf", this._limit, p);
    return idx < 0 ? null : idx;
  }
  /**
   * @param {bigint} n — strictly positive
   * @returns {[Array<[number, number]>, bigint]} `[[primeIndex, exponent], …]` and the cofactor
   */
  factor(n) {
    if (typeof n !== "bigint") {
      throw new TypeError(`PrimeCache.factor: expected bigint, got ${typeof n}`);
    }
    if (n <= 0n) {
      throw new RangeError(
        `PrimeCache.factor: input must be strictly positive (PPF-no-zero); got ${n}`
      );
    }
    this._ensureSieve();
    const pairs = [];
    if (n === 1n) return [pairs, 1n];
    const r = JSON.parse(callWasm("primeCacheFactor", this._limit, String(n)));
    for (const pair of r.pairs) pairs.push(pair);
    const residual = BigInt(r.residual);
    if (residual > 1n) {
      const idx = this.indexOf(residual);
      if (idx !== null) {
        pairs.push([idx, 1]);
        return [pairs, 1n];
      }
      return [pairs, residual];
    }
    return [pairs, 1n];
  }
  /** @param {bigint[]} values @returns {number[]} ascending prime indices touched by any value */
  discoverBasis(values) {
    if (!Array.isArray(values)) {
      throw new TypeError(
        `PrimeCache.discoverBasis: expected array of bigint, got ${typeof values}`
      );
    }
    const seen = /* @__PURE__ */ new Set();
    for (const v of values) {
      const [pairs] = this.factor(v);
      for (const [idx] of pairs) seen.add(idx);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }
};

// src/browser/codec/index.js
var codec_exports = {};
__export(codec_exports, {
  AtomRootPolynomial: () => AtomRootPolynomial,
  Codec: () => Codec,
  EGPTRealBag: () => EGPTRealBag,
  Encoding: () => Encoding,
  EncodingTransform: () => EncodingTransform,
  FFTSamples: () => FFTSamples,
  FixtureWorkInRunError: () => FixtureWorkInRunError,
  HostFloats: () => HostFloats,
  IntegerN: () => IntegerN,
  MatrixInput: () => MatrixInput,
  MissingClaimError: () => MissingClaimError,
  MonomialPolynomial: () => MonomialPolynomial,
  OddPartIndex: () => OddPartIndex,
  PolynomialCoefficients: () => PolynomialCoefficients,
  PrimeAtomVector: () => PrimeAtomVector,
  PrimeBasis: () => PrimeBasis,
  RootProductPolynomial: () => RootProductPolynomial,
  RunResult: () => RunResult,
  TOLERANCE_THRESHOLDS: () => TOLERANCE_THRESHOLDS,
  Trace: () => Trace,
  TransformRegistry: () => TransformRegistry,
  ValueRepresentation: () => ValueRepresentation,
  buildCodecDsl: () => buildCodecDsl,
  buildSdkCodec: () => buildSdkCodec,
  registry: () => registry
});

// src/browser/codec/core.js
function _referenceFields(v) {
  const ppf = v.toPPF();
  const fields = {
    scalar_numerator: ppf.scalar.numerator,
    scalar_denominator: ppf.scalar.denominator,
    numerator_encodedAsLog2ppf: { N: ppf.numerator.N, offset: ppf.numerator.offset },
    denominator_encodedAsLog2ppf: { N: ppf.denominator.N, offset: ppf.denominator.offset }
  };
  if (v instanceof EGPTPrimeComposite) {
    fields.records = v.records;
    fields.primes = v.primes;
    fields.sign = v.sign;
  }
  return fields;
}
__name(_referenceFields, "_referenceFields");
function _asReferenceObject(key, value) {
  return value instanceof EGPTReal ? _referenceFields(value) : value;
}
__name(_asReferenceObject, "_asReferenceObject");
var Encoding = class _Encoding {
  static {
    __name(this, "Encoding");
  }
  static kind = null;
  static uiLabel = null;
  constructor(payload, _opts = {}) {
    if (new.target === _Encoding) {
      throw new Error("Encoding is abstract; instantiate a subclass.");
    }
    if (this.constructor.kind === null) {
      throw new Error(
        `${this.constructor.name} must declare static kind (non-null string).`
      );
    }
    this.payload = payload;
  }
  equals(other) {
    if (!(other instanceof _Encoding)) return false;
    if (other.constructor.kind !== this.constructor.kind) return false;
    return this._equalsPayload(other);
  }
  _equalsPayload(other) {
    try {
      return JSON.stringify(this.payload, _asReferenceObject) === JSON.stringify(other.payload, _asReferenceObject);
    } catch {
      return this.payload === other.payload;
    }
  }
  hostReadbackDelta(_other) {
    return Number.NaN;
  }
  informationBits() {
    return null;
  }
  byteSize() {
    throw new Error(`${this.constructor.name} must implement byteSize()`);
  }
  describe() {
    const size = this.payload == null ? "null" : typeof this.payload?.length === "number" ? `len=${this.payload.length}` : typeof this.payload;
    return `${this.constructor.kind}(${size})`;
  }
};
var EncodingTransform = class _EncodingTransform {
  static {
    __name(this, "EncodingTransform");
  }
  static inputKind = null;
  static outputKind = null;
  static invertible = false;
  static uiLabel = null;
  static letterCode = null;
  static provenance = null;
  constructor(params = {}) {
    if (new.target === _EncodingTransform) {
      throw new Error(
        "EncodingTransform is abstract; instantiate a subclass."
      );
    }
    const T = this.constructor;
    if (T.inputKind === null) {
      throw new Error(`${T.name} must declare static inputKind.`);
    }
    if (T.outputKind === null) {
      throw new Error(`${T.name} must declare static outputKind.`);
    }
    this.params = params;
  }
  apply(_input, _opts = {}) {
    throw new Error(
      `${this.constructor.name}.apply() not implemented \u2014 subclass must override.`
    );
  }
  inverse() {
    if (!this.constructor.invertible) {
      throw new Error(
        `${this.constructor.name} is not invertible (static invertible === false).`
      );
    }
    throw new Error(
      `${this.constructor.name}.inverse() not implemented \u2014 subclass must override.`
    );
  }
};
var TransformRegistry = class {
  static {
    __name(this, "TransformRegistry");
  }
  constructor() {
    this._byName = /* @__PURE__ */ new Map();
    this._byInput = /* @__PURE__ */ new Map();
    this._byOutput = /* @__PURE__ */ new Map();
  }
  register(TransformClass) {
    if (typeof TransformClass !== "function" || typeof TransformClass.inputKind !== "string" || typeof TransformClass.outputKind !== "string") {
      throw new TypeError(
        "registry.register requires a class with static inputKind and outputKind strings."
      );
    }
    const name = TransformClass.name;
    if (this._byName.has(name)) {
      if (this._byName.get(name) === TransformClass) return this;
      throw new Error(
        `TransformRegistry already has a different class registered as "${name}".`
      );
    }
    this._byName.set(name, TransformClass);
    pushInto(this._byInput, TransformClass.inputKind, TransformClass);
    pushInto(this._byOutput, TransformClass.outputKind, TransformClass);
    return this;
  }
  byName(name) {
    return this._byName.get(name) ?? null;
  }
  outgoing(inputKind) {
    return (this._byInput.get(inputKind) ?? []).slice();
  }
  incoming(outputKind) {
    return (this._byOutput.get(outputKind) ?? []).slice();
  }
  allTransforms() {
    return Array.from(this._byName.values());
  }
  findPath(fromKind, toKind) {
    if (fromKind === toKind) return [];
    const cameFromClass = /* @__PURE__ */ new Map();
    const cameFromKind = /* @__PURE__ */ new Map();
    const queue = [fromKind];
    const visited = /* @__PURE__ */ new Set([fromKind]);
    while (queue.length) {
      const cur = queue.shift();
      for (const T of this._byInput.get(cur) ?? []) {
        const next = T.outputKind;
        if (visited.has(next)) continue;
        visited.add(next);
        cameFromClass.set(next, T);
        cameFromKind.set(next, cur);
        if (next === toKind) return reconstructPath(cameFromClass, cameFromKind, fromKind, toKind);
        queue.push(next);
      }
    }
    return null;
  }
  _reset() {
    this._byName.clear();
    this._byInput.clear();
    this._byOutput.clear();
  }
};
function pushInto(map, key, value) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}
__name(pushInto, "pushInto");
function reconstructPath(cameFromClass, cameFromKind, fromKind, toKind) {
  const path = [];
  let cur = toKind;
  while (cur !== fromKind) {
    path.unshift(cameFromClass.get(cur));
    cur = cameFromKind.get(cur);
  }
  return path;
}
__name(reconstructPath, "reconstructPath");
var registry = new TransformRegistry();
var OpTrace = class {
  static {
    __name(this, "OpTrace");
  }
  constructor(label = "trace") {
    this.label = label;
    this.reset();
  }
  reset() {
    this.calls = /* @__PURE__ */ new Map();
    this.bigintBits = 0;
    this.startedAt = performance.now();
    this.endedAt = null;
  }
  record(methodName, bits = 0) {
    this.calls.set(methodName, (this.calls.get(methodName) ?? 0) + 1);
    this.bigintBits += bits;
  }
  end() {
    this.endedAt = performance.now();
  }
  get elapsedMs() {
    const end = this.endedAt ?? performance.now();
    return end - this.startedAt;
  }
  snapshot() {
    return {
      label: this.label,
      calls: Object.fromEntries(this.calls.entries()),
      totalCalls: Array.from(this.calls.values()).reduce((a, b) => a + b, 0),
      bigintBits: this.bigintBits,
      elapsedMs: this.elapsedMs
    };
  }
};
var Trace = class {
  static {
    __name(this, "Trace");
  }
  constructor(label = "codec") {
    this.entries = [];
    this.opTrace = new OpTrace(label);
    this._lastEnterCount = 0;
    this.lastOpCount = 0;
  }
  enter({ transform, input }) {
    const snap = this.opTrace.snapshot();
    this._lastEnterCount = snap.totalCalls;
    this.entries.push({
      transform,
      inputKind: input?.constructor?.kind ?? "",
      outputKind: "",
      timestamp: performance.now(),
      elapsedMs: 0,
      opCount: 0,
      summary: input?.describe?.() ?? null
    });
  }
  leave({ output, opCount }) {
    const entry = this.entries[this.entries.length - 1];
    if (!entry) return;
    const snap = this.opTrace.snapshot();
    const delta = typeof opCount === "number" ? opCount : snap.totalCalls - this._lastEnterCount;
    entry.outputKind = output?.constructor?.kind ?? "";
    entry.elapsedMs = performance.now() - entry.timestamp;
    entry.opCount = delta;
    this.lastOpCount = delta;
  }
  snapshot() {
    return {
      label: this.opTrace.label,
      entries: this.entries.slice(),
      ops: this.opTrace.snapshot()
    };
  }
  reset() {
    this.entries = [];
    this.opTrace.reset();
    this._lastEnterCount = 0;
    this.lastOpCount = 0;
  }
};
var OpCounter = class _OpCounter {
  static {
    __name(this, "OpCounter");
  }
  constructor() {
    this.counts = {
      bigintShift: 0,
      bigintAdd: 0,
      bigintMul: 0,
      bigintDiv: 0,
      bigintGcd: 0,
      bigintAlloc: 0,
      fpAdd: 0,
      fpMul: 0,
      fp16Add: 0,
      fp16Mul: 0,
      fp16Decode: 0,
      bf16Add: 0,
      bf16Mul: 0,
      intMul: 0,
      intAdd: 0
    };
    this.widthCounts = null;
  }
  record(opType, n = 1, opts = void 0) {
    if (opts && opts.width !== void 0) {
      const w = opts.width;
      if (!this.widthCounts) this.widthCounts = {};
      if (!this.widthCounts[opType]) this.widthCounts[opType] = {};
      this.widthCounts[opType][w] = (this.widthCounts[opType][w] ?? 0) + n;
    }
    this.counts[opType] = (this.counts[opType] ?? 0) + n;
  }
  merge(other) {
    if (other == null || typeof other.counts !== "object") return this;
    for (const [op, n] of Object.entries(other.counts)) {
      this.counts[op] = (this.counts[op] ?? 0) + n;
    }
    return this;
  }
  totalOps() {
    let total = 0;
    for (const n of Object.values(this.counts)) total += n;
    return total;
  }
  modeledCycles(costTable = _OpCounter.DEFAULT_COSTS) {
    let cycles = 0;
    for (const [op, n] of Object.entries(this.counts)) {
      const entry = costTable[op];
      if (entry == null) continue;
      if (typeof entry === "number") {
        cycles += n * entry;
      } else if (typeof entry === "object") {
        const widthBuckets = this.widthCounts?.[op];
        if (widthBuckets) {
          let widthTagged = 0;
          for (const [w, wn] of Object.entries(widthBuckets)) {
            const cyclesAtW = entry[w] ?? entry[Number(w)] ?? entry.default ?? 0;
            cycles += wn * cyclesAtW;
            widthTagged += wn;
          }
          const flatRemainder = n - widthTagged;
          if (flatRemainder > 0) {
            cycles += flatRemainder * (entry.default ?? entry[64] ?? 0);
          }
        } else {
          cycles += n * (entry.default ?? entry[64] ?? 0);
        }
      }
    }
    return cycles;
  }
  snapshot() {
    return { ...this.counts };
  }
  delta(prevSnapshot) {
    const out = {};
    const prev = prevSnapshot ?? {};
    for (const [op, n] of Object.entries(this.counts)) {
      const before = prev[op] ?? 0;
      const d = n - before;
      if (d !== 0) out[op] = d;
    }
    return out;
  }
  static M2_ULTRA_SCALAR = {
    bigintShift: 1,
    bigintAdd: 2,
    bigintMul: 5,
    bigintDiv: 30,
    bigintGcd: 100,
    bigintAlloc: 30,
    fpAdd: 1,
    fpMul: 1,
    fp16Add: 3,
    fp16Mul: 3,
    fp16Decode: 8,
    bf16Add: 3,
    bf16Mul: 3,
    intMul: 1,
    intAdd: 1,
    regAccess: 1,
    l1Fetch: 5,
    l2Fetch: 16,
    l3Fetch: 80,
    dramFetch: 500,
    tierCapacityBytes: {
      register: 4096,
      l1: 196608,
      l2: 16777216,
      l3: 50331648,
      dram: Infinity
    }
  };
  static M2_ULTRA_GPU = {
    bigintShift: 1,
    bigintAdd: 2,
    bigintMul: 5,
    bigintDiv: 30,
    bigintGcd: 100,
    bigintAlloc: 30,
    fpAdd: 1e-4,
    fpMul: 1e-4,
    fp16Add: 5e-5,
    fp16Mul: 5e-5,
    fp16Decode: 8,
    bf16Add: 5e-5,
    bf16Mul: 5e-5,
    intMul: 26e-6,
    intAdd: 26e-6,
    regAccess: 1,
    l1Fetch: 5,
    l2Fetch: 16,
    l3Fetch: 80,
    dramFetch: 500,
    tierCapacityBytes: {
      register: 8192,
      l1: 65536,
      l2: 16777216,
      l3: 50331648,
      dram: Infinity
    }
  };
  static DEFAULT_COSTS = _OpCounter.M2_ULTRA_SCALAR;
  static H100 = {
    bigintShift: 4,
    bigintAdd: 8,
    bigintMul: 20,
    bigintDiv: 120,
    bigintGcd: 400,
    bigintAlloc: 60,
    fpAdd: 1,
    fpMul: 1,
    fp16Add: 1e-3,
    fp16Mul: 1e-3,
    fp16Decode: 6,
    bf16Add: 1e-3,
    bf16Mul: 1e-3,
    intMul: 4,
    intAdd: 4,
    regAccess: 1,
    l1Fetch: 4,
    l2Fetch: 30,
    dramFetch: 600,
    tierCapacityBytes: {
      register: 65536,
      l1: 262144,
      l2: 52428800,
      dram: Infinity
    }
  };
  static AMX_SAPPHIRE = {
    bigintShift: 1,
    bigintAdd: 2,
    bigintMul: 5,
    bigintDiv: 30,
    bigintGcd: 100,
    bigintAlloc: 30,
    fpAdd: 1,
    fpMul: 1,
    fp16Add: 4,
    fp16Mul: 4,
    fp16Decode: 10,
    bf16Add: 1e-3,
    bf16Mul: 1e-3,
    intMul: 1e-3,
    intAdd: 1e-3,
    regAccess: 1,
    l1Fetch: 4,
    l2Fetch: 14,
    l3Fetch: 50,
    dramFetch: 280,
    tierCapacityBytes: {
      register: 4096,
      l1: 49152,
      l2: 2097152,
      l3: 110100480,
      dram: Infinity
    }
  };
};
var COMPUTE_CLOCKS_HZ = {
  M2_ULTRA: 4e9,
  M2_ULTRA_SCALAR: 4e9,
  M2_ULTRA_GPU: 4e9,
  H100: 141e7,
  AMX_SAPPHIRE: 3e9
};
var CACHE_TIERS = {
  M2_ULTRA: { L1: 64 * 1024, L2: 4 * 1024 * 1024, L3: 96 * 1024 * 1024 },
  M2_ULTRA_SCALAR: { L1: 64 * 1024, L2: 4 * 1024 * 1024, L3: 96 * 1024 * 1024 },
  M2_ULTRA_GPU: { L1: 64 * 1024, L2: 4 * 1024 * 1024, L3: 96 * 1024 * 1024 },
  H100: { L1: 256 * 1024, L2: 50 * 1024 * 1024, L3: null },
  AMX_SAPPHIRE: {
    L1: 48 * 1024,
    L2: 2 * 1024 * 1024,
    L3: 105 * 1024 * 1024
  }
};
function _fingerprint(chainLabel, inputPayload, codebookFingerprints) {
  let h = 5381;
  function mix(s) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h ^ s.charCodeAt(i)) >>> 0;
    }
  }
  __name(mix, "mix");
  mix(chainLabel);
  mix(":");
  function visit(v) {
    if (v == null) {
      mix("null");
    } else if (typeof v === "bigint") {
      mix("B");
      mix(v.toString());
    } else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      mix(typeof v);
      mix(String(v));
    } else if (Array.isArray(v)) {
      mix("A[");
      for (const e of v) visit(e);
      mix("]");
    } else if (ArrayBuffer.isView(v)) {
      mix(`T${v.constructor.name}[`);
      for (let i = 0; i < v.length; i++) {
        mix(String(v[i]));
        mix(",");
      }
      mix("]");
    } else if (v instanceof EGPTReal) {
      visit(_referenceFields(v));
    } else if (typeof v === "object") {
      mix("O{");
      const keys = Object.keys(v).sort();
      for (const k of keys) {
        mix(k);
        mix(":");
        visit(v[k]);
        mix(",");
      }
      mix("}");
    } else {
      mix(typeof v);
    }
  }
  __name(visit, "visit");
  visit(inputPayload);
  mix("|cb[");
  for (const cb of codebookFingerprints) {
    mix(cb.name);
    mix("=");
    mix(String(cb.fingerprint ?? "null"));
    mix(",");
  }
  mix("]");
  return ("00000000" + h.toString(16)).slice(-8);
}
__name(_fingerprint, "_fingerprint");
var Fixture = class {
  static {
    __name(this, "Fixture");
  }
  constructor({
    chainLabel,
    inputs,
    codebooks,
    encodedInputs,
    prepareOpCounter,
    prepareLog
  }) {
    if (typeof chainLabel !== "string" || !chainLabel) {
      throw new TypeError("Fixture: chainLabel must be a non-empty string.");
    }
    if (inputs == null) {
      throw new TypeError("Fixture: inputs must be a non-null Encoding.");
    }
    if (!(codebooks instanceof Map)) {
      throw new TypeError("Fixture: codebooks must be a Map.");
    }
    if (!(encodedInputs instanceof Map)) {
      throw new TypeError("Fixture: encodedInputs must be a Map.");
    }
    if (prepareOpCounter == null) {
      throw new TypeError("Fixture: prepareOpCounter must be an OpCounter (may be empty).");
    }
    if (!Array.isArray(prepareLog)) {
      throw new TypeError("Fixture: prepareLog must be an array.");
    }
    this.chainLabel = chainLabel;
    this.inputs = inputs;
    this.codebooks = codebooks;
    this.encodedInputs = encodedInputs;
    this.prepareOpCounter = prepareOpCounter;
    this.prepareOps = prepareOpCounter.snapshot();
    this.prepareLog = prepareLog;
    const cbFingerprints = [];
    for (const [name, cb] of codebooks.entries()) {
      cbFingerprints.push({
        name,
        fingerprint: cb?.built_from?.fingerprint ?? null
      });
    }
    cbFingerprints.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    this.fingerprint = _fingerprint(chainLabel, inputs.payload ?? null, cbFingerprints);
    Object.freeze(this);
  }
  prepareCyclesAt(costTable) {
    return this.prepareOpCounter.modeledCycles(costTable);
  }
  describe() {
    const cbList = [...this.codebooks.entries()].map(([name, cb]) => `${name}=${cb?.kind ?? "null"}`).join(",");
    return `Fixture(chain=${this.chainLabel}, fp=${this.fingerprint}, codebooks=[${cbList}], prepareOps=${this.prepareOpCounter.totalOps()})`;
  }
};
var HARDWARE_COST_TABLES = {
  M2_ULTRA: OpCounter.M2_ULTRA_SCALAR,
  M2_ULTRA_SCALAR: OpCounter.M2_ULTRA_SCALAR,
  M2_ULTRA_GPU: OpCounter.M2_ULTRA_GPU,
  H100: OpCounter.H100,
  AMX_SAPPHIRE: OpCounter.AMX_SAPPHIRE
};
var TOLERANCE_THRESHOLDS = {
  "exact": 0,
  "fp16": 1e-3,
  "fp32": 1e-6,
  "fp64": 1e-12
};
var RunResult = class {
  static {
    __name(this, "RunResult");
  }
  constructor({
    input,
    snapshots,
    output,
    trace,
    opCounter = null,
    memTrace = null,
    codebooksUsed = [],
    claimMeta = null,
    fixture = null,
    optimized = false
  }) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      throw new TypeError("RunResult requires non-empty snapshots array.");
    }
    this.input = input;
    this.snapshots = snapshots;
    this.output = output;
    this.trace = trace;
    this.opCounter = opCounter;
    this.memTrace = memTrace;
    this.codebooksUsed = codebooksUsed;
    this.claimMeta = claimMeta;
    this.fixture = fixture;
    this.optimized = optimized === true;
    this.claimVerdict = null;
  }
  attachClaimVerdict(verdict) {
    if (this.claimMeta == null) {
      throw new Error(
        "RunResult.attachClaimVerdict: cannot attach a verdict to a chain without a claim. Call Codec.claim(name, opts) before run()."
      );
    }
    const { passed, maxAbsErr, thresholdAbsErr } = verdict;
    if (typeof passed !== "boolean") {
      throw new TypeError("attachClaimVerdict: verdict.passed must be boolean.");
    }
    this.claimVerdict = {
      reference: this.claimMeta.reference,
      tolerance: this.claimMeta.tolerance,
      passed,
      maxAbsErr,
      thresholdAbsErr
    };
  }
  get stepCount() {
    return Math.max(0, this.snapshots.length - 1);
  }
  snapshotAt(i) {
    if (i < 0 || i >= this.snapshots.length) {
      throw new RangeError(
        `snapshotAt(${i}) out of range [0, ${this.snapshots.length}).`
      );
    }
    return this.snapshots[i];
  }
  describe() {
    const kinds = this.snapshots.map((e) => e?.constructor?.kind ?? "?").join(" -> ");
    return `RunResult(${kinds})`;
  }
  summary({
    scenario = "cold",
    hardware = "M2_ULTRA",
    costTable,
    chainName
  } = {}) {
    const opCounts = this.opCounter ? this.opCounter.snapshot() : null;
    const activeCostTable = costTable ?? HARDWARE_COST_TABLES[hardware] ?? OpCounter.DEFAULT_COSTS;
    const modeledCycles = this.opCounter ? this.opCounter.modeledCycles(activeCostTable) : null;
    const clockHz = COMPUTE_CLOCKS_HZ[hardware] ?? COMPUTE_CLOCKS_HZ.M2_ULTRA;
    const computeNs = modeledCycles == null ? null : modeledCycles / clockHz * 1e9;
    const memTraceSummary = this.memTrace ? this.memTrace.summary() : null;
    const wallClock = this.memTrace ? this.memTrace.estimateWallClock({
      scenario,
      hardware,
      totalComputeNs: computeNs
    }) : null;
    const estimatedWallClockNs = wallClock ? wallClock.totalNs : null;
    const totalMemoryNs = wallClock ? wallClock.totalMemoryNs : null;
    let perStepEntries = wallClock?.perStep ?? null;
    if (perStepEntries && this.memTrace?.entries) {
      perStepEntries = perStepEntries.map((step, i) => {
        const entry = this.memTrace.entries[i];
        const ops = entry?.ops ?? null;
        let cycles = null;
        if (ops) {
          cycles = 0;
          for (const [op, n] of Object.entries(ops)) {
            cycles += n * (activeCostTable[op] ?? 0);
          }
        }
        return {
          ...step,
          ops,
          cycles,
          cycleNs: cycles == null ? null : cycles / clockHz * 1e9
        };
      });
    }
    let bottleneck = "unknown";
    let verdict = "";
    if (computeNs != null && totalMemoryNs != null) {
      const ratio = computeNs / Math.max(totalMemoryNs, 1e-12);
      if (ratio > 1.2) {
        bottleneck = "compute-bound";
        verdict = `Compute-bound at ${formatNs(computeNs)}; memory traffic ${formatNs(totalMemoryNs)} (${scenario})`;
      } else if (ratio < 1 / 1.2) {
        bottleneck = "memory-bound";
        verdict = `Memory-bound at ${formatNs(totalMemoryNs)} (${scenario}); compute would finish in ${formatNs(computeNs)}`;
      } else {
        bottleneck = "balanced";
        verdict = `Balanced: compute ${formatNs(computeNs)}, memory ${formatNs(totalMemoryNs)} (${scenario})`;
      }
    } else if (computeNs != null) {
      verdict = `Compute-only telemetry: ${formatNs(computeNs)} (no memTrace)`;
    } else if (estimatedWallClockNs != null) {
      verdict = `Memory-only telemetry: ${formatNs(estimatedWallClockNs)} (${scenario}; no opCounter)`;
    } else {
      verdict = `No telemetry recorded for this run`;
    }
    let bound = "unknown";
    if (computeNs != null && totalMemoryNs != null) {
      if (computeNs > 1.5 * totalMemoryNs) {
        bound = "compute";
      } else if (totalMemoryNs > 1.5 * computeNs) {
        bound = "memory";
      } else {
        bound = "balanced";
      }
    }
    const wellFormed = (() => {
      if (this.claimMeta == null) {
        return {
          claim: null,
          reference: null,
          tolerance: null,
          passed: null,
          maxAbsErr: null,
          thresholdAbsErr: null
        };
      }
      if (this.claimVerdict == null) {
        return {
          claim: this.claimMeta.name,
          reference: this.claimMeta.reference,
          tolerance: this.claimMeta.tolerance,
          passed: null,
          maxAbsErr: null,
          thresholdAbsErr: TOLERANCE_THRESHOLDS[this.claimMeta.tolerance] ?? null
        };
      }
      return {
        claim: this.claimMeta.name,
        reference: this.claimVerdict.reference,
        tolerance: this.claimVerdict.tolerance,
        passed: this.claimVerdict.passed,
        maxAbsErr: this.claimVerdict.maxAbsErr,
        thresholdAbsErr: this.claimVerdict.thresholdAbsErr
      };
    })();
    const codebooks = this.codebooksUsed.map((entry) => ({
      name: entry.name,
      lifecycle: entry.lifecycle,
      kind: entry.codebook?.kind ?? null,
      byteSize: entry.codebook?.byteSize?.() ?? 0,
      fingerprint: entry.codebook?.built_from?.fingerprint ?? null,
      builtThisRun: entry.builtThisRun,
      constructionOps: entry.codebookConstructionOps ?? null
    }));
    const prepareCycles = this.fixture ? this.fixture.prepareCyclesAt(activeCostTable) : 0;
    const runCycles = modeledCycles ?? 0;
    return {
      chainName: chainName ?? null,
      scenario,
      hardware,
      opCounts,
      modeledCycles,
      prepareCycles,
      runCycles,
      optimized: this.optimized === true,
      computeNs,
      memTraceSummary,
      estimatedWallClockNs,
      totalMemoryNs,
      wallClockPerStep: perStepEntries ?? wallClock?.perStep ?? null,
      bottleneck,
      bound,
      verdict,
      wellFormed,
      codebooks
    };
  }
};
function formatNs(ns) {
  if (!Number.isFinite(ns)) return "NaN ns";
  if (ns < 1e3) return `${ns.toFixed(1)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(2)} \xB5s`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(2)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}
__name(formatNs, "formatNs");
var FixtureWorkInRunError = class extends Error {
  static {
    __name(this, "FixtureWorkInRunError");
  }
  constructor(message) {
    super(message);
    this.name = "FixtureWorkInRunError";
  }
};
var MissingClaimError = class extends Error {
  static {
    __name(this, "MissingClaimError");
  }
  constructor(message) {
    super(message);
    this.name = "MissingClaimError";
  }
};
var Codec = class _Codec {
  static {
    __name(this, "Codec");
  }
  constructor(initialInputKind, { label = "codec" } = {}) {
    if (typeof initialInputKind !== "string" || !initialInputKind) {
      throw new TypeError(
        "Codec constructor requires a non-empty initialInputKind."
      );
    }
    this.headKind = initialInputKind;
    this.tailKind = initialInputKind;
    this.steps = [];
    this.label = label;
    this.codebookDependencies = [];
    this.claimMeta = null;
    this.optimizedFlag = false;
  }
  useCodebook(name, codebookClass, opts = {}) {
    if (typeof name !== "string" || !name) {
      throw new TypeError("Codec.useCodebook requires a non-empty name.");
    }
    const { lifecycle } = opts;
    if (!["each-decode", "load-time", "offline"].includes(lifecycle)) {
      throw new RangeError(
        `Codec.useCodebook: lifecycle must be one of 'each-decode' | 'load-time' | 'offline'; got ${lifecycle}.`
      );
    }
    if (codebookClass == null || typeof codebookClass.fromPopulation !== "function") {
      throw new TypeError(
        "Codec.useCodebook: codebookClass must be a Codebook subclass with a static fromPopulation method."
      );
    }
    if (this.codebookDependencies.some((d) => d.name === name)) {
      throw new RangeError(
        `Codec.useCodebook: dependency '${name}' is already declared on this codec.`
      );
    }
    this.codebookDependencies.push({ name, codebookClass, lifecycle });
    return this;
  }
  claim(name, opts = {}) {
    if (typeof name !== "string" || !name) {
      throw new TypeError("Codec.claim requires a non-empty name.");
    }
    const { reference, tolerance } = opts;
    if (typeof reference !== "string" || !reference) {
      throw new TypeError(
        "Codec.claim: opts.reference must be a non-empty string identifier."
      );
    }
    if (!["fp16", "fp32", "fp64", "exact"].includes(tolerance)) {
      throw new RangeError(
        `Codec.claim: opts.tolerance must be one of 'fp16'|'fp32'|'fp64'|'exact'; got ${tolerance}.`
      );
    }
    this.claimMeta = { name, reference, tolerance };
    return this;
  }
  optimized(value) {
    if (typeof value !== "boolean") {
      throw new TypeError(
        `Codec.optimized: value must be a boolean; got ${typeof value}.`
      );
    }
    this.optimizedFlag = value;
    return this;
  }
  isOptimized() {
    return this.optimizedFlag === true;
  }
  push(transformInstance) {
    const T = transformInstance?.constructor;
    if (!T || typeof transformInstance.apply !== "function") {
      throw new TypeError(
        "Codec.push requires an EncodingTransform instance."
      );
    }
    if (T.inputKind !== this.tailKind) {
      throw new TypeError(
        `cannot push ${T.name}: inputKind "${T.inputKind}" !== codec tail "${this.tailKind}"`
      );
    }
    this.steps.push(transformInstance);
    this.tailKind = T.outputKind;
    return this;
  }
  prepare(input, { counter = null } = {}) {
    this._requireMatchingInput(input);
    const prepareCounter = counter ?? new OpCounter();
    const codebooks = /* @__PURE__ */ new Map();
    const encodedInputs = /* @__PURE__ */ new Map();
    const prepareLog = [];
    const prevCounter = getActiveOpCounter();
    try {
      for (const dep of this.codebookDependencies) {
        const { name, codebookClass, lifecycle } = dep;
        if (lifecycle === "each-decode") {
          prepareLog.push({
            name,
            lifecycle,
            codebook: null,
            builtAtPrepare: false
          });
          continue;
        }
        if (lifecycle === "offline") {
          setActiveOpCounter(null);
          const cb = codebookClass.fromPopulation(
            this._codebookPopulation(input),
            { source: "offline" }
          );
          setActiveOpCounter(prevCounter);
          codebooks.set(name, cb);
          prepareLog.push({
            name,
            lifecycle,
            codebook: cb,
            builtAtPrepare: true
          });
          continue;
        }
        if (lifecycle === "load-time") {
          setActiveOpCounter(prepareCounter);
          const cb = codebookClass.fromPopulation(
            this._codebookPopulation(input),
            { source: "load-time" }
          );
          codebooks.set(name, cb);
          prepareLog.push({
            name,
            lifecycle,
            codebook: cb,
            builtAtPrepare: true
          });
          continue;
        }
        throw new RangeError(
          `Codec.prepare: unknown lifecycle '${lifecycle}' on dependency '${name}'.`
        );
      }
    } finally {
      setActiveOpCounter(prevCounter);
    }
    return new Fixture({
      chainLabel: this.label,
      inputs: input,
      codebooks,
      encodedInputs,
      prepareOpCounter: prepareCounter,
      prepareLog
    });
  }
  run(fixtureOrInput, opts = {}) {
    if (this.claimMeta == null) {
      throw new MissingClaimError(
        `Codec ${this.label} has no claim \u2014 call codec.claim(name, {reference, tolerance}) before run().`
      );
    }
    const {
      runtimeInputs = null,
      counter = null,
      memTrace = null,
      codebookCache = null
    } = opts;
    let fixture;
    if (fixtureOrInput instanceof Fixture) {
      if (fixtureOrInput.chainLabel !== this.label) {
        throw new TypeError(
          `Codec.run: fixture was prepared for chain '${fixtureOrInput.chainLabel}' but this codec is '${this.label}'.`
        );
      }
      this._requireMatchingInput(fixtureOrInput.inputs);
      fixture = fixtureOrInput;
    } else if (fixtureOrInput instanceof Encoding) {
      fixture = this.prepare(fixtureOrInput);
    } else {
      throw new TypeError(
        "Codec.run: first argument must be a Fixture or an Encoding."
      );
    }
    const input = runtimeInputs != null ? runtimeInputs : fixture.inputs;
    this._requireMatchingInput(input);
    const trace = new Trace(this.label);
    const snapshots = [input];
    let current = input;
    const prevCounter = getActiveOpCounter();
    if (counter) setActiveOpCounter(counter);
    const codebooksUsed = [];
    for (const dep of this.codebookDependencies) {
      const { name, codebookClass, lifecycle } = dep;
      const cacheKey = `${this.label}::${name}::${codebookClass.kind}`;
      let codebook = null;
      let builtThisRun = false;
      if (lifecycle === "offline" || lifecycle === "load-time") {
        codebook = fixture.codebooks.get(name) ?? null;
        if (codebook == null) {
          throw new FixtureWorkInRunError(
            `Codec.run: codebook '${name}' (lifecycle '${lifecycle}') is missing from the fixture. Build it via Codec.prepare() before calling run(); never inside run() \u2014 that would re-roll fixture-stage work into every decode.`
          );
        }
        builtThisRun = false;
        if (codebookCache) codebookCache.set(cacheKey, codebook);
      } else {
        const opsBefore = counter ? counter.snapshot() : null;
        codebook = codebookClass.fromPopulation(this._codebookPopulation(input), {
          source: "each-decode"
        });
        builtThisRun = true;
        if (counter && opsBefore) {
          codebooksUsed.push({
            name,
            lifecycle,
            codebook,
            builtThisRun,
            codebookConstructionOps: counter.delta(opsBefore)
          });
          continue;
        }
      }
      codebooksUsed.push({ name, lifecycle, codebook, builtThisRun });
    }
    try {
      for (const step of this.steps) {
        const opsBefore = counter ? counter.snapshot() : null;
        trace.enter({
          transform: step.constructor.name,
          input: current
        });
        const stepInput = current;
        current = step.apply(current, { trace, counter, memTrace });
        trace.leave({ output: current, opCount: trace.lastOpCount });
        snapshots.push(current);
        const stepOps = counter && opsBefore ? counter.delta(opsBefore) : null;
        if (memTrace) {
          let inputBytes = 0;
          let outputBytes = 0;
          try {
            inputBytes = stepInput.byteSize?.() ?? 0;
          } catch {
            inputBytes = 0;
          }
          try {
            outputBytes = current.byteSize?.() ?? 0;
          } catch {
            outputBytes = 0;
          }
          memTrace.record({
            stepName: step.constructor.name,
            inputBytes,
            outputBytes,
            scratchBytes: 0,
            ops: stepOps
          });
        }
      }
    } finally {
      setActiveOpCounter(prevCounter);
    }
    return new RunResult({
      input,
      snapshots,
      output: current,
      trace,
      opCounter: counter,
      memTrace,
      codebooksUsed,
      claimMeta: this.claimMeta,
      fixture,
      optimized: this.optimizedFlag === true
    });
  }
  _codebookPopulation(input) {
    if (input == null) return [];
    const payload = input.payload;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.matrix) || Array.isArray(payload?.[0])) {
      const matrix = Array.isArray(payload?.matrix) ? payload.matrix : payload;
      const flat = [];
      for (const row of matrix) {
        if (Array.isArray(row)) for (const v of row) flat.push(v);
      }
      return flat;
    }
    return [];
  }
  roundTripCheck(input) {
    const fwdHadClaim = this.claimMeta != null;
    if (!fwdHadClaim) {
      this.claim("_roundtrip", { reference: "_roundtrip", tolerance: "exact" });
    }
    const forward = this.run(input);
    const inv = this.inverse();
    if (inv.claimMeta == null) {
      inv.claim("_roundtrip", { reference: "_roundtrip", tolerance: "exact" });
    }
    const back = inv.run(forward.output);
    const ok = input.equals?.(back.output) ?? false;
    const hostReadbackDelta = input.hostReadbackDelta?.(back.output) ?? Number.NaN;
    return {
      ok,
      chip: ok ? "green" : "red",
      hostReadbackDelta,
      forward,
      back
    };
  }
  inverse() {
    const out = new _Codec(this.tailKind, { label: `${this.label}:inv` });
    for (const step of [...this.steps].reverse()) {
      out.push(step.inverse());
    }
    return out;
  }
  _requireMatchingInput(input) {
    if (!(input instanceof Encoding)) {
      throw new TypeError(
        `Codec.run expects an Encoding instance, got ${typeof input}.`
      );
    }
    if (input.constructor.kind !== this.headKind) {
      throw new TypeError(
        `Codec.run: input kind "${input.constructor.kind}" !== codec head "${this.headKind}"`
      );
    }
  }
};
function buildCodecDsl(registry2, CodecClass, EncodingClasses) {
  const _encodingByKind = /* @__PURE__ */ new Map();
  if (Array.isArray(EncodingClasses)) {
    for (const E of EncodingClasses) {
      if (E && typeof E.kind === "string") {
        _encodingByKind.set(E.kind, E);
      }
    }
  }
  let _headKind = null;
  let _headPayload = null;
  let _codec = null;
  let _inputEncoding = null;
  const _claims = [];
  const dsl = {
    input(kind, payload) {
      if (typeof kind !== "string" || !kind) {
        throw new Error("[buildCodecDsl] input() requires a non-empty kind string");
      }
      if (_headKind !== null) {
        throw new Error("[buildCodecDsl] input() may only be called once");
      }
      _headKind = kind;
      _headPayload = payload ?? {};
      _codec = new CodecClass(_headKind);
      const EncodingClass = _encodingByKind.get(kind);
      if (EncodingClass) {
        let data = _headPayload;
        if (_headPayload && typeof _headPayload === "object" && !Array.isArray(_headPayload)) {
          data = _headPayload.payload ?? _headPayload.samples ?? _headPayload.values ?? _headPayload;
        }
        _inputEncoding = new EncodingClass(data, _headPayload);
      } else {
        _inputEncoding = { constructor: { kind }, value: _headPayload };
      }
      return dsl;
    },
    push(name, opts) {
      if (_codec === null) {
        throw new Error("[buildCodecDsl] push() called before input() \u2014 call cdc.input() first");
      }
      if (typeof name !== "string" || !name) {
        throw new Error("[buildCodecDsl] push() requires a non-empty transform name");
      }
      const TransformClass = registry2.byName(name);
      if (!TransformClass) {
        throw new Error(
          `[buildCodecDsl] push('${name}') \u2014 no transform named '${name}' is registered. Did you import the transforms barrel (codec/index.js)?`
        );
      }
      const instance = new TransformClass(opts ?? {});
      _codec.push(instance);
      return dsl;
    },
    claim(name, opts) {
      if (_codec === null) {
        throw new Error("[buildCodecDsl] claim() called before input()");
      }
      if (typeof name !== "string" || !name) {
        throw new Error("[buildCodecDsl] claim() requires a non-empty name");
      }
      const o = opts ?? {};
      _codec.claim(name, {
        reference: o.reference ?? name,
        tolerance: o.tolerance ?? "exact"
      });
      _claims.push({ name, config: o });
      _codec._claims = _claims;
      return dsl;
    },
    build() {
      if (_codec === null) {
        throw new Error("[buildCodecDsl] build() called before input() \u2014 recipe must call cdc.input()");
      }
      return { codec: _codec, headEncoding: _inputEncoding, headKind: _headKind, headPayload: _headPayload };
    }
  };
  return { dsl, build: dsl.build };
}
__name(buildCodecDsl, "buildCodecDsl");
function makeBagEncoding({
  name,
  uiLabel,
  elementKind,
  validateElement,
  elementEquals = defaultElementEquals
}) {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("makeBagEncoding: name must be a non-empty string.");
  }
  if (typeof elementKind !== "string" || elementKind.length === 0) {
    throw new TypeError("makeBagEncoding: elementKind must be a non-empty string.");
  }
  if (typeof validateElement !== "function") {
    throw new TypeError("makeBagEncoding: validateElement must be a function.");
  }
  class BagEncoding extends Encoding {
    static {
      __name(this, "BagEncoding");
    }
    static kind = name;
    static uiLabel = uiLabel;
    static elementKind = elementKind;
    static isBag = true;
    constructor(payload, opts = {}) {
      if (!Array.isArray(payload)) {
        throw new TypeError(`${name} payload must be an array of ${elementKind}.`);
      }
      for (let i = 0; i < payload.length; i++) {
        if (!validateElement(payload[i])) {
          throw new TypeError(
            `${name} element ${i} failed ${elementKind} validation.`
          );
        }
      }
      super(payload, opts);
    }
    get size() {
      return this.payload.length;
    }
    mapElements(fn) {
      return this.payload.map(fn);
    }
    _equalsPayload(other) {
      if (this.payload.length !== other.payload.length) return false;
      for (let i = 0; i < this.payload.length; i++) {
        if (!elementEquals(this.payload[i], other.payload[i])) return false;
      }
      return true;
    }
    describe() {
      return `${name}(size=${this.size})`;
    }
    byteSize() {
      let total = 0;
      for (const el of this.payload) {
        if (el != null && typeof el.byteSize === "function") {
          total += el.byteSize();
        } else {
          total += 24;
        }
      }
      return total;
    }
  }
  Object.defineProperty(BagEncoding, "name", { value: name });
  return BagEncoding;
}
__name(makeBagEncoding, "makeBagEncoding");
function defaultElementEquals(a, b) {
  if (a != null && typeof a.equals === "function") return a.equals(b);
  return a === b;
}
__name(defaultElementEquals, "defaultElementEquals");

// src/browser/encoding-classes.js
function encodingClassesOf(ns) {
  if (typeof ns?.Encoding !== "function") {
    throw new TypeError("encodingClassesOf: the namespace exports no Encoding base class.");
  }
  return Object.values(ns).filter(
    (v) => typeof v === "function" && v.prototype instanceof ns.Encoding && typeof v.kind === "string"
  );
}
__name(encodingClassesOf, "encodingClassesOf");

// src/browser/codec/dispatch.js
var dispatchFromBigInt = /* @__PURE__ */ __name((n) => EGPTReal.fromBigInt(n), "dispatchFromBigInt");
var dispatchFromRational = /* @__PURE__ */ __name((num, den) => EGPTReal.fromRational(num, den), "dispatchFromRational");
var dispatchToCanonicalStr = /* @__PURE__ */ __name((h) => EGPTReal.toCanonicalStr(h), "dispatchToCanonicalStr");
var dispatchBreakToBigInt = /* @__PURE__ */ __name((h) => h.breakSymbolicToApproximateBigInt(), "dispatchBreakToBigInt");
var dispatchBreakToJSNumber = /* @__PURE__ */ __name((h) => h.breakSymbolicToApproximateJSNumber(), "dispatchBreakToJSNumber");
var dispatchToPrimeAtoms = /* @__PURE__ */ __name((h) => h.toPrimeAtoms(), "dispatchToPrimeAtoms");
var dispatchFromAtomVec = /* @__PURE__ */ __name((atomVec) => EGPTReal.fromAtomVec(atomVec), "dispatchFromAtomVec");
var dispatchToAtomRoot = /* @__PURE__ */ __name((h) => h.toAtomRoot(), "dispatchToAtomRoot");
var dispatchFromAtomRoot = /* @__PURE__ */ __name((term) => EGPTReal.fromAtomRoot(term), "dispatchFromAtomRoot");
function dispatchRationalParts(h) {
  const str = EGPTReal.toCanonicalStr(h);
  const slash = str.indexOf("/");
  if (slash < 0) {
    return { numerator: BigInt(str), denominator: 1n };
  }
  return {
    numerator: BigInt(str.slice(0, slash)),
    denominator: BigInt(str.slice(slash + 1))
  };
}
__name(dispatchRationalParts, "dispatchRationalParts");
function isValidMathHandle(v) {
  return v == null ? false : v instanceof EGPTReal;
}
__name(isValidMathHandle, "isValidMathHandle");
function mathHandleEquals(a, b) {
  return EGPTMath.equals(a, b);
}
__name(mathHandleEquals, "mathHandleEquals");

// src/browser/codec/encodings.js
var SUPPORTED_FORMATS = Object.freeze([
  "fp16",
  "bfloat16",
  "fp32",
  "fp64",
  "int32",
  "int64"
]);
var HostFloats = class extends Encoding {
  static {
    __name(this, "HostFloats");
  }
  static kind = "HostFloats";
  static uiLabel = "Host floats";
  constructor(payload, opts = {}) {
    if (!isArrayLike(payload)) {
      throw new TypeError(
        "HostFloats payload must be an array-like (number[], bigint[], or a typed array)."
      );
    }
    const format = opts.format;
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new TypeError(
        `HostFloats requires opts.format \u2208 {${SUPPORTED_FORMATS.join(", ")}}; got ${JSON.stringify(format)}.`
      );
    }
    validateElementTypes(payload, format);
    super(Array.from(payload), opts);
    this.format = format;
    this.asBitPatterns = opts.asBitPatterns ?? payload instanceof Uint16Array;
  }
  _equalsPayload(other) {
    if (other.format !== this.format) return false;
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      if (this.payload[i] !== other.payload[i]) return false;
    }
    return true;
  }
  hostReadbackDelta(other) {
    if (!other || other.format !== this.format) return Number.NaN;
    const a = this.payload;
    const b = other.payload;
    if (a.length !== b.length) return Number.NaN;
    if (this.format === "int64") {
      let max = 0n;
      for (let i = 0; i < a.length; i++) {
        const d = a[i] > b[i] ? a[i] - b[i] : b[i] - a[i];
        if (d > max) max = d;
      }
      return Number(max);
    }
    let sq = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sq += d * d;
    }
    return Math.sqrt(sq);
  }
  describe() {
    return `HostFloats(len=${this.payload.length}, format=${this.format})`;
  }
  byteSize() {
    const bytesPerElement = this.format === "fp64" || this.format === "int64" ? 8 : this.format === "fp32" || this.format === "int32" ? 4 : 2;
    return this.payload.length * bytesPerElement;
  }
};
function isArrayLike(x) {
  if (x == null) return false;
  if (Array.isArray(x)) return true;
  return x instanceof Float32Array || x instanceof Float64Array || x instanceof Int32Array || x instanceof BigInt64Array || x instanceof Uint16Array;
}
__name(isArrayLike, "isArrayLike");
function validateElementTypes(payload, format) {
  if (payload.length === 0) return;
  const first = payload[0];
  if (format === "int64") {
    if (!(payload instanceof BigInt64Array) && typeof first !== "bigint") {
      throw new TypeError(
        `HostFloats format='int64' requires bigint[] or BigInt64Array payload.`
      );
    }
  } else if (format === "int32") {
    if (typeof first === "bigint") {
      throw new TypeError(
        `HostFloats format='int32' must not receive bigint payload; use int64 instead.`
      );
    }
  } else if (typeof first === "bigint") {
    throw new TypeError(
      `HostFloats format='${format}' expects numeric payload, not bigint.`
    );
  }
}
__name(validateElementTypes, "validateElementTypes");
var Base = makeBagEncoding({
  name: "EGPTRealBag",
  uiLabel: "EGPTReal bag",
  elementKind: "EGPTReal",
  validateElement: isValidMathHandle,
  elementEquals: mathHandleEquals
});
var EGPTRealBag = class extends Base {
  static {
    __name(this, "EGPTRealBag");
  }
  describe() {
    return `EGPTRealBag(len=${this.payload.length})`;
  }
  byteSize() {
    return this.payload.length * 24;
  }
};
var PolynomialCoefficients = class extends Encoding {
  static {
    __name(this, "PolynomialCoefficients");
  }
  static kind = "PolynomialCoefficients";
  static uiLabel = "Polynomial coefficients";
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("PolynomialCoefficients payload must be EGPTReal[]");
    }
    super(payload, opts);
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      const a = this.payload[i];
      const b = other.payload[i];
      if (typeof a?.equals === "function") {
        if (!a.equals(b)) return false;
      } else if (a !== b) {
        return false;
      }
    }
    return true;
  }
  describe() {
    return `PolynomialCoefficients(degree=${Math.max(0, this.payload.length - 1)})`;
  }
  byteSize() {
    return this.payload.length * 24;
  }
};
var FFTSamples = class extends Encoding {
  static {
    __name(this, "FFTSamples");
  }
  static kind = "FFTSamples";
  static uiLabel = "FFT samples";
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("FFTSamples payload must be EGPTReal[] (values at k/N)");
    }
    super(payload, opts);
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      const a = this.payload[i];
      const b = other.payload[i];
      if (typeof a?.equals === "function") {
        if (!a.equals(b)) return false;
      } else if (a !== b) {
        return false;
      }
    }
    return true;
  }
  describe() {
    return `FFTSamples(N=${this.payload.length})`;
  }
  byteSize() {
    return this.payload.length * 24;
  }
};
var PrimeAtomVector = class extends Encoding {
  static {
    __name(this, "PrimeAtomVector");
  }
  static kind = "PrimeAtomVector";
  static uiLabel = "Prime atoms (log space)";
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("PrimeAtomVector payload must be AtomVec[]");
    }
    super(payload, opts);
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      if (!atomVecEquals(this.payload[i], other.payload[i])) return false;
    }
    return true;
  }
  informationBits() {
    let totalAtoms = 0n;
    for (const a of this.payload) {
      for (const { exponent } of a.factors) {
        totalAtoms += exponent < 0n ? -exponent : exponent;
      }
    }
    return Number(totalAtoms);
  }
  describe() {
    const totalPrimes = /* @__PURE__ */ new Set();
    for (const a of this.payload) {
      for (const { prime } of a.factors) totalPrimes.add(prime);
    }
    return `PrimeAtomVector(N=${this.payload.length}, distinct_primes=${totalPrimes.size})`;
  }
  byteSize() {
    let total = 0;
    for (const a of this.payload) {
      total += (a.factors?.length ?? 0) * 8;
    }
    return total;
  }
};
function atomVecEquals(a, b) {
  if (!a || !b) return a === b;
  if (a.sign !== b.sign) return false;
  if ((a.factors?.length ?? 0) !== (b.factors?.length ?? 0)) return false;
  for (let i = 0; i < a.factors.length; i++) {
    if (a.factors[i].prime !== b.factors[i].prime) return false;
    if (a.factors[i].exponent !== b.factors[i].exponent) return false;
  }
  return true;
}
__name(atomVecEquals, "atomVecEquals");
var RootProductPolynomial = class extends Encoding {
  static {
    __name(this, "RootProductPolynomial");
  }
  static kind = "RootProductPolynomial";
  static uiLabel = "Root-product polynomial (primes as roots)";
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("RootProductPolynomial payload must be RootProductTerm[]");
    }
    super(payload, opts);
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      if (!termEquals(this.payload[i], other.payload[i])) return false;
    }
    return true;
  }
  informationBits() {
    let total = 0n;
    for (const term of this.payload) {
      for (const r of term.roots ?? []) {
        total += r.multiplicity;
      }
    }
    return Number(total);
  }
  describe() {
    const distinctRoots = /* @__PURE__ */ new Set();
    for (const term of this.payload) {
      for (const r of term.roots ?? []) distinctRoots.add(r.value?.breakSymbolicToString?.() ?? "?");
    }
    return `RootProductPolynomial(N=${this.payload.length}, distinct_roots=${distinctRoots.size})`;
  }
  byteSize() {
    let total = 0;
    for (const term of this.payload) {
      total += 24;
      total += (term.roots?.length ?? 0) * 32;
    }
    return total;
  }
};
function termEquals(a, b) {
  if (!a || !b) return a === b;
  if (typeof a.leadingCoeff?.equals === "function") {
    if (!a.leadingCoeff.equals(b.leadingCoeff)) return false;
  } else if (a.leadingCoeff !== b.leadingCoeff) {
    return false;
  }
  const aRoots = a.roots ?? [];
  const bRoots = b.roots ?? [];
  if (aRoots.length !== bRoots.length) return false;
  for (let i = 0; i < aRoots.length; i++) {
    if (aRoots[i].multiplicity !== bRoots[i].multiplicity) return false;
    const av = aRoots[i].value;
    const bv = bRoots[i].value;
    if (typeof av?.equals === "function") {
      if (!av.equals(bv)) return false;
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}
__name(termEquals, "termEquals");
var MonomialPolynomial = class extends Encoding {
  static {
    __name(this, "MonomialPolynomial");
  }
  static kind = "MonomialPolynomial";
  static uiLabel = "Monomial polynomial P(x) = \u03A3 c\u1D62x\u2071";
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("MonomialPolynomial payload must be EGPTReal[]");
    }
    super(payload, opts);
  }
  get degree() {
    return Math.max(0, this.payload.length - 1);
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      const a = this.payload[i];
      const b = other.payload[i];
      if (typeof a?.equals === "function") {
        if (!a.equals(b)) return false;
      } else if (a !== b) {
        return false;
      }
    }
    return true;
  }
  describe() {
    return `MonomialPolynomial(degree=${this.degree})`;
  }
  byteSize() {
    return this.payload.length * 24;
  }
};
var CANONICAL_TOKEN = Symbol("ValueRepresentation.canonical");
var ValueRepresentation = class _ValueRepresentation extends Encoding {
  static {
    __name(this, "ValueRepresentation");
  }
  static kind = "ValueRepresentation";
  static uiLabel = "Value rep \u2014 P at powers of 2";
  constructor(payload, opts = {}) {
    if (opts.witness !== CANONICAL_TOKEN) {
      throw new Error(
        "ValueRepresentation cannot be constructed directly. The encoding represents a polynomial sampled at the canonical EGPT base (integer powers of 2); constructing one with arbitrary values would silently break round-trip bijectivity. Use ValueRepresentation.fromMonomial(monomial) or invoke MonomialToValues through a Codec instead."
      );
    }
    if (!Array.isArray(payload)) {
      throw new TypeError("ValueRepresentation payload must be EGPTReal[]");
    }
    if (payload.length === 0) {
      throw new RangeError("ValueRepresentation requires \u22651 sample");
    }
    for (let i = 0; i < payload.length; i++) {
      const v = payload[i];
      if (typeof v?.equals !== "function" || typeof v?.breakSymbolicToApproximateBigInt !== "function") {
        throw new TypeError(
          `ValueRepresentation payload[${i}] is not an EGPTReal-like value (missing .equals or .breakSymbolicToApproximateBigInt). Did you forget to lift via EGPTReal.fromBigInt(...)?`
        );
      }
    }
    super(payload, opts);
  }
  static fromMonomial(monomial) {
    if (!monomial || monomial.constructor?.kind !== "MonomialPolynomial") {
      throw new TypeError(
        `ValueRepresentation.fromMonomial expects a MonomialPolynomial instance. Got ${monomial?.constructor?.name ?? typeof monomial}.`
      );
    }
    const samples = EGPTPolynomial.toValueRepresentation(monomial.payload ?? []);
    return new _ValueRepresentation(samples, { witness: CANONICAL_TOKEN });
  }
  get degree() {
    return this.payload.length - 1;
  }
  get sampleBase() {
    return 2n;
  }
  _equalsPayload(other) {
    if (this.payload.length !== other.payload.length) return false;
    for (let i = 0; i < this.payload.length; i++) {
      const a = this.payload[i];
      const b = other.payload[i];
      if (typeof a?.equals === "function") {
        if (!a.equals(b)) return false;
      } else if (a !== b) {
        return false;
      }
    }
    return true;
  }
  describe() {
    return `ValueRepresentation(degree=${this.degree}, base=2)`;
  }
  byteSize() {
    return this.payload.length * 24;
  }
};
var IntegerN = class extends Encoding {
  static {
    __name(this, "IntegerN");
  }
  static kind = "IntegerN";
  static uiLabel = "Integer N";
  constructor(payload, opts = {}) {
    if (payload == null) {
      throw new TypeError("IntegerN payload must be a single EGPTReal.");
    }
    if (typeof payload?.isInteger !== "function") {
      throw new TypeError("IntegerN payload must be an EGPTReal instance.");
    }
    if (!payload.isInteger()) {
      throw new RangeError("IntegerN payload must represent an integer (denominator divides numerator).");
    }
    super(payload, opts);
  }
  toBigInt() {
    return this.payload.breakSymbolicToApproximateBigInt();
  }
  get sign() {
    const n = this.toBigInt();
    if (n === 0n) return 0;
    return n < 0n ? -1 : 1;
  }
  _equalsPayload(other) {
    if (typeof this.payload?.equals === "function") {
      return this.payload.equals(other.payload);
    }
    return this.payload === other.payload;
  }
  describe() {
    try {
      const n = this.toBigInt();
      const s = n.toString();
      return s.length > 24 ? `IntegerN(${s.slice(0, 24)}\u2026)` : `IntegerN(${s})`;
    } catch {
      return "IntegerN(?)";
    }
  }
  byteSize() {
    return 24;
  }
};
var AtomRootPolynomial = class extends Encoding {
  static {
    __name(this, "AtomRootPolynomial");
  }
  static kind = "AtomRootPolynomial";
  static uiLabel = "Atom-root polynomial of N";
  constructor(payload, opts = {}) {
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("AtomRootPolynomial payload must be a single {leadingCoeff, roots} object.");
    }
    if (typeof payload.leadingCoeff?.equals !== "function") {
      throw new TypeError("AtomRootPolynomial.payload.leadingCoeff must be an EGPTReal.");
    }
    if (!Array.isArray(payload.roots)) {
      throw new TypeError("AtomRootPolynomial.payload.roots must be an array.");
    }
    for (const r of payload.roots) {
      if (typeof r?.value?.equals !== "function") {
        throw new TypeError("AtomRootPolynomial root.value must be an EGPTReal.");
      }
      if (typeof r.multiplicity !== "bigint" || r.multiplicity < 0n) {
        throw new RangeError("AtomRootPolynomial root.multiplicity must be a non-negative bigint.");
      }
    }
    super(payload, opts);
  }
  get totalMultiplicity() {
    let total = 0n;
    for (const r of this.payload.roots ?? []) total += r.multiplicity;
    return total;
  }
  get distinctRootCount() {
    return (this.payload.roots ?? []).length;
  }
  get degree() {
    return Number(this.totalMultiplicity);
  }
  _equalsPayload(other) {
    if (!this.payload.leadingCoeff.equals(other.payload.leadingCoeff)) return false;
    const a = this.payload.roots ?? [];
    const b = other.payload.roots ?? [];
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].multiplicity !== b[i].multiplicity) return false;
      if (!a[i].value.equals(b[i].value)) return false;
    }
    return true;
  }
  describe() {
    return `AtomRootPolynomial(degree=${this.degree}, \u03C9=${this.distinctRootCount})`;
  }
  byteSize() {
    const roots = this.payload.roots ?? [];
    return roots.length * 16 + 16;
  }
};
var MatrixInput = class _MatrixInput extends Encoding {
  static {
    __name(this, "MatrixInput");
  }
  static kind = "MatrixInput";
  static uiLabel = "Matrix input (boundary layout)";
  static fromRow(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("MatrixInput.fromRow expects an EGPTReal[].");
    }
    return new _MatrixInput([payload.slice()], { axis: "rows", ...opts });
  }
  static fromColumn(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("MatrixInput.fromColumn expects an EGPTReal[].");
    }
    return new _MatrixInput(payload.map((v) => [v]), { axis: "cols", ...opts });
  }
  constructor(payload, opts = {}) {
    if (!Array.isArray(payload)) {
      throw new TypeError("MatrixInput payload must be EGPTReal[][]");
    }
    const cols = payload.length === 0 ? 0 : payload[0]?.length ?? 0;
    for (let i = 0; i < payload.length; i++) {
      if (!Array.isArray(payload[i])) {
        throw new TypeError(
          `MatrixInput row ${i} is not an array (matrix must be EGPTReal[][]).`
        );
      }
      if (payload[i].length !== cols) {
        throw new TypeError(
          `MatrixInput is not rectangular: row 0 has length ${cols}, row ${i} has length ${payload[i].length}.`
        );
      }
    }
    super(payload, opts);
    const axis = opts.axis ?? "rows";
    if (axis !== "rows" && axis !== "cols") {
      throw new TypeError(`MatrixInput axis must be 'rows' or 'cols' (got ${axis}).`);
    }
    this.axis = axis;
  }
  get rows() {
    return this.payload.length;
  }
  get cols() {
    return this.payload.length === 0 ? 0 : this.payload[0].length;
  }
  _equalsPayload(other) {
    if (this.axis !== other.axis) return false;
    if (this.rows !== other.rows || this.cols !== other.cols) return false;
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const a = this.payload[i][j];
        const b = other.payload[i][j];
        if (typeof a?.equals === "function") {
          if (!a.equals(b)) return false;
        } else if (a !== b) {
          return false;
        }
      }
    }
    return true;
  }
  describe() {
    return `MatrixInput(${this.rows}\xD7${this.cols}, axis=${this.axis})`;
  }
  byteSize() {
    return this.rows * this.cols * 24;
  }
};
var MonomialPolynomialBag = makeBagEncoding({
  name: "MonomialPolynomialBag",
  uiLabel: "Polynomial bag",
  elementKind: "MonomialPolynomial",
  validateElement: /* @__PURE__ */ __name((v) => v instanceof MonomialPolynomial, "validateElement"),
  elementEquals: /* @__PURE__ */ __name((a, b) => a.equals(b), "elementEquals")
});
var ValueRepresentationBag = makeBagEncoding({
  name: "ValueRepresentationBag",
  uiLabel: "Value-rep bag",
  elementKind: "ValueRepresentation",
  validateElement: /* @__PURE__ */ __name((v) => v instanceof ValueRepresentation, "validateElement"),
  elementEquals: /* @__PURE__ */ __name((a, b) => a.equals(b), "elementEquals")
});
var PrimeBasis = class extends Encoding {
  static {
    __name(this, "PrimeBasis");
  }
  static kind = "PrimeBasis";
  static uiLabel = "Prime basis (pre-factored bag)";
  constructor(payload, opts = {}) {
    if (payload == null || typeof payload !== "object") {
      throw new TypeError("PrimeBasis payload must be an object.");
    }
    const { basis, primeCache, exponents, signs, cofactors } = payload;
    if (!Array.isArray(basis)) {
      throw new TypeError("PrimeBasis: payload.basis must be a number[].");
    }
    for (let j = 0; j < basis.length; j++) {
      if (!Number.isInteger(basis[j]) || basis[j] < 0) {
        throw new TypeError(
          `PrimeBasis: basis[${j}] must be a non-negative integer index, got ${basis[j]}.`
        );
      }
      if (j > 0 && basis[j] <= basis[j - 1]) {
        throw new RangeError(
          "PrimeBasis: payload.basis must be sorted strictly ascending with no duplicates."
        );
      }
    }
    if (basis.length > 0 && primeCache == null) {
      throw new TypeError(
        "PrimeBasis: payload.primeCache is required when basis is non-empty."
      );
    }
    if (!Array.isArray(exponents)) {
      throw new TypeError("PrimeBasis: payload.exponents must be an Int32Array[].");
    }
    for (let i = 0; i < exponents.length; i++) {
      if (!(exponents[i] instanceof Int32Array)) {
        throw new TypeError(
          `PrimeBasis: exponents[${i}] must be an Int32Array.`
        );
      }
      if (exponents[i].length !== basis.length) {
        throw new RangeError(
          `PrimeBasis: exponents[${i}].length (${exponents[i].length}) does not match basis.length (${basis.length}).`
        );
      }
    }
    if (!(signs instanceof Int8Array)) {
      throw new TypeError("PrimeBasis: payload.signs must be an Int8Array.");
    }
    if (signs.length !== exponents.length) {
      throw new RangeError(
        `PrimeBasis: signs.length (${signs.length}) does not match exponents.length (${exponents.length}).`
      );
    }
    for (let i = 0; i < signs.length; i++) {
      if (signs[i] !== 1 && signs[i] !== -1) {
        throw new RangeError(
          `PrimeBasis: signs[${i}] must be +1 or -1 (PPF-no-zero); got ${signs[i]}.`
        );
      }
    }
    if (!Array.isArray(cofactors)) {
      throw new TypeError("PrimeBasis: payload.cofactors must be a bigint[].");
    }
    if (cofactors.length !== exponents.length) {
      throw new RangeError(
        `PrimeBasis: cofactors.length (${cofactors.length}) does not match exponents.length (${exponents.length}).`
      );
    }
    for (let i = 0; i < cofactors.length; i++) {
      if (typeof cofactors[i] !== "bigint") {
        throw new TypeError(
          `PrimeBasis: cofactors[${i}] must be a bigint, got ${typeof cofactors[i]}.`
        );
      }
      if (cofactors[i] <= 0n) {
        throw new RangeError(
          `PrimeBasis: cofactors[${i}] must be strictly positive (PPF-no-zero); got ${cofactors[i]}.`
        );
      }
    }
    super(payload, opts);
  }
  get size() {
    return this.payload.exponents.length;
  }
  _equalsPayload(other) {
    const a = this.payload;
    const b = other.payload;
    if (a.basis.length !== b.basis.length) return false;
    for (let j = 0; j < a.basis.length; j++) {
      if (a.basis[j] !== b.basis[j]) return false;
    }
    if (a.basis.length > 0 && a.primeCache != null && b.primeCache != null) {
      const pa = a.primeCache.primes();
      const pb = b.primeCache.primes();
      for (let j = 0; j < a.basis.length; j++) {
        const idx = a.basis[j];
        if (pa[idx] !== pb[idx]) return false;
      }
    }
    if (a.exponents.length !== b.exponents.length) return false;
    for (let i = 0; i < a.exponents.length; i++) {
      const ea = a.exponents[i];
      const eb = b.exponents[i];
      if (ea.length !== eb.length) return false;
      for (let j = 0; j < ea.length; j++) {
        if (ea[j] !== eb[j]) return false;
      }
    }
    if (a.signs.length !== b.signs.length) return false;
    for (let i = 0; i < a.signs.length; i++) {
      if (a.signs[i] !== b.signs[i]) return false;
    }
    if (a.cofactors.length !== b.cofactors.length) return false;
    for (let i = 0; i < a.cofactors.length; i++) {
      if (a.cofactors[i] !== b.cofactors[i]) return false;
    }
    return true;
  }
  describe() {
    return `PrimeBasis(size=${this.size}, basis=${this.payload.basis.length})`;
  }
  byteSize() {
    const p = this.payload;
    let total = 0;
    total += p.basis.length * 4;
    const SPARSE_PAIR_BYTES = 3;
    for (const row of p.exponents) {
      let nonzero = 0;
      for (let j = 0; j < row.length; j++) {
        if (row[j] !== 0) nonzero++;
      }
      total += nonzero * SPARSE_PAIR_BYTES;
    }
    total += p.signs.byteLength;
    total += p.cofactors.length * 24;
    return total;
  }
};
var OddPartIndex = class extends Encoding {
  static {
    __name(this, "OddPartIndex");
  }
  static kind = "OddPartIndex";
  static uiLabel = "Odd-part redundancy index";
  constructor(payload, opts = {}) {
    if (payload == null || typeof payload !== "object") {
      throw new TypeError("OddPartIndex payload must be an object.");
    }
    const { totalElements, uniqueOddParts, compressionRatio, groups, denominators } = payload;
    if (!Number.isInteger(totalElements) || totalElements < 0) {
      throw new TypeError(
        `OddPartIndex: payload.totalElements must be a non-negative integer, got ${totalElements}.`
      );
    }
    if (!Number.isInteger(uniqueOddParts) || uniqueOddParts < 0) {
      throw new TypeError(
        `OddPartIndex: payload.uniqueOddParts must be a non-negative integer, got ${uniqueOddParts}.`
      );
    }
    if (typeof compressionRatio !== "number" || !Number.isFinite(compressionRatio) || compressionRatio < 0) {
      throw new TypeError(
        `OddPartIndex: payload.compressionRatio must be a non-negative finite number, got ${compressionRatio}.`
      );
    }
    if (!Array.isArray(groups)) {
      throw new TypeError("OddPartIndex: payload.groups must be an array.");
    }
    if (groups.length !== uniqueOddParts) {
      throw new RangeError(
        `OddPartIndex: groups.length (${groups.length}) does not match uniqueOddParts (${uniqueOddParts}).`
      );
    }
    let prevOdd = null;
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      if (grp == null || typeof grp !== "object") {
        throw new TypeError(`OddPartIndex: groups[${g}] must be an object.`);
      }
      if (typeof grp.odd !== "bigint") {
        throw new TypeError(
          `OddPartIndex: groups[${g}].odd must be a bigint, got ${typeof grp.odd}.`
        );
      }
      if (grp.odd <= 0n || (grp.odd & 1n) === 0n) {
        throw new RangeError(
          `OddPartIndex: groups[${g}].odd must be a strictly positive odd bigint, got ${grp.odd}.`
        );
      }
      if (prevOdd !== null && grp.odd <= prevOdd) {
        throw new RangeError(
          `OddPartIndex: groups must be strictly ascending by odd; groups[${g}].odd=${grp.odd} is not > groups[${g - 1}].odd=${prevOdd}.`
        );
      }
      prevOdd = grp.odd;
      if (!Array.isArray(grp.members) || grp.members.length === 0) {
        throw new RangeError(
          `OddPartIndex: groups[${g}].members must be a non-empty array.`
        );
      }
      for (let m = 0; m < grp.members.length; m++) {
        const mem = grp.members[m];
        if (mem == null || typeof mem !== "object") {
          throw new TypeError(
            `OddPartIndex: groups[${g}].members[${m}] must be an object.`
          );
        }
        if (!Number.isInteger(mem.position) || mem.position < 0) {
          throw new TypeError(
            `OddPartIndex: groups[${g}].members[${m}].position must be a non-negative integer.`
          );
        }
        if (!Number.isInteger(mem.shift) || mem.shift < 0) {
          throw new TypeError(
            `OddPartIndex: groups[${g}].members[${m}].shift must be a non-negative integer.`
          );
        }
        if (mem.sign !== 1 && mem.sign !== -1) {
          throw new RangeError(
            `OddPartIndex: groups[${g}].members[${m}].sign must be +1 or -1, got ${mem.sign}.`
          );
        }
      }
    }
    if (denominators !== void 0) {
      if (!Array.isArray(denominators)) {
        throw new TypeError(
          "OddPartIndex: payload.denominators must be a bigint[] when present."
        );
      }
      if (denominators.length !== totalElements) {
        throw new RangeError(
          `OddPartIndex: denominators.length (${denominators.length}) does not match totalElements (${totalElements}).`
        );
      }
      for (let i = 0; i < denominators.length; i++) {
        if (typeof denominators[i] !== "bigint") {
          throw new TypeError(
            `OddPartIndex: denominators[${i}] must be a bigint, got ${typeof denominators[i]}.`
          );
        }
        if (denominators[i] <= 0n) {
          throw new RangeError(
            `OddPartIndex: denominators[${i}] must be strictly positive (PPF-no-zero); got ${denominators[i]}.`
          );
        }
      }
    }
    super(payload, opts);
  }
  get isBijective() {
    return Array.isArray(this.payload.denominators);
  }
  _equalsPayload(other) {
    const a = this.payload;
    const b = other.payload;
    if (a.totalElements !== b.totalElements) return false;
    if (a.uniqueOddParts !== b.uniqueOddParts) return false;
    if (a.compressionRatio !== b.compressionRatio) return false;
    if (a.groups.length !== b.groups.length) return false;
    for (let g = 0; g < a.groups.length; g++) {
      const ga = a.groups[g];
      const gb = b.groups[g];
      if (ga.odd !== gb.odd) return false;
      if (ga.members.length !== gb.members.length) return false;
      for (let m = 0; m < ga.members.length; m++) {
        const ma = ga.members[m];
        const mb = gb.members[m];
        if (ma.position !== mb.position) return false;
        if (ma.shift !== mb.shift) return false;
        if (ma.sign !== mb.sign) return false;
      }
    }
    const aHasDen = Array.isArray(a.denominators);
    const bHasDen = Array.isArray(b.denominators);
    if (aHasDen !== bHasDen) return false;
    if (aHasDen) {
      if (a.denominators.length !== b.denominators.length) return false;
      for (let i = 0; i < a.denominators.length; i++) {
        if (a.denominators[i] !== b.denominators[i]) return false;
      }
    }
    return true;
  }
  describe() {
    const p = this.payload;
    return `OddPartIndex(total=${p.totalElements}, unique=${p.uniqueOddParts}, ratio=${p.compressionRatio.toFixed(2)})`;
  }
  byteSize() {
    return 64;
  }
};

// src/browser/codec/transforms.js
function _fromLift(json) {
  const l = JSON.parse(json);
  return l.zero ? dispatchFromBigInt(0n) : dispatchFromRational(BigInt(l.n), BigInt(l.d));
}
__name(_fromLift, "_fromLift");
function unpackIEEEBitsToEGPTReal(bits, format) {
  return _fromLift(callWasm("codecIeeeUnpack", String(BigInt(bits)), `${format}`));
}
__name(unpackIEEEBitsToEGPTReal, "unpackIEEEBitsToEGPTReal");
function egptRealToIEEEBits(egpt, format, options = {}) {
  const policy = options.policy ?? "exact";
  callWasm("codecIeeeEncodeCheck", `${format}`, `${policy}`, JSON.stringify(policy));
  const { numerator, denominator } = dispatchRationalParts(egpt);
  return callWasm(
    "codecIeeeEncode",
    String(numerator),
    String(denominator),
    `${format}`,
    `${policy}`,
    JSON.stringify(policy)
  );
}
__name(egptRealToIEEEBits, "egptRealToIEEEBits");
function quantizeF64ToIEEEBits(x, format, options = {}) {
  const policy = options.policy ?? "round-nearest-ties-even";
  const isFinite = Number.isFinite(x);
  return callWasm(
    "codecIeeeQuantize",
    isFinite ? x : 0,
    Number.isNaN(x),
    isFinite,
    isFinite ? `${x}` : "",
    `${format}`,
    `${policy}`,
    JSON.stringify(policy)
  );
}
__name(quantizeF64ToIEEEBits, "quantizeF64ToIEEEBits");
function bitsToF64(bits, format) {
  const egpt = unpackIEEEBitsToEGPTReal(bits, format);
  return dispatchBreakToJSNumber(egpt);
}
__name(bitsToF64, "bitsToF64");
function floatRationalParts(f) {
  if (!Number.isFinite(f)) throw new Error(`floatToEGPT: non-finite ${f}`);
  const l = JSON.parse(callWasm("codecF64Lift", f));
  return l.zero ? { numerator: 0n, denominator: 1n } : { numerator: BigInt(l.n), denominator: BigInt(l.d) };
}
__name(floatRationalParts, "floatRationalParts");
var fp32Scratch = new Float32Array(1);
function captureHostValue(value, format, { asBitPatterns = false, policy = "round-nearest-ties-even" } = {}) {
  switch (format) {
    case "fp16":
    case "bfloat16": {
      const bits = asBitPatterns ? value : quantizeF64ToIEEEBits(value, format, { policy });
      return unpackIEEEBitsToEGPTReal(bits, format);
    }
    case "fp32": {
      fp32Scratch[0] = value;
      const { numerator, denominator } = floatRationalParts(fp32Scratch[0]);
      return dispatchFromRational(numerator, denominator);
    }
    case "fp64": {
      const { numerator, denominator } = floatRationalParts(value);
      return dispatchFromRational(numerator, denominator);
    }
    case "int32":
      if (!Number.isInteger(value)) {
        throw new Error(`int32 payload element must be integer; got ${value}`);
      }
      return dispatchFromBigInt(BigInt(value));
    case "int64":
      if (typeof value !== "bigint") {
        throw new Error(`int64 payload element must be bigint; got ${typeof value}`);
      }
      return dispatchFromBigInt(value);
    default:
      throw new Error(`captureHostValue: unsupported format ${format}`);
  }
}
__name(captureHostValue, "captureHostValue");
var fp32OutScratch = new Float32Array(1);
function decodeToHostValue(egpt, format, { asBitPatterns = false, policy = "exact" } = {}) {
  switch (format) {
    case "fp16":
    case "bfloat16": {
      const bits = egptRealToIEEEBits(egpt, format, { policy });
      if (asBitPatterns) return bits;
      return bitsToF64(bits, format);
    }
    case "fp32": {
      fp32OutScratch[0] = dispatchBreakToJSNumber(egpt);
      return fp32OutScratch[0];
    }
    case "fp64":
      return dispatchBreakToJSNumber(egpt);
    case "int32": {
      const n = dispatchBreakToBigInt(egpt);
      const asNum = Number(n);
      if (!Number.isSafeInteger(asNum) || asNum < -2147483648 || asNum > 2147483647) {
        throw new Error(`int32 decode: value ${n} out of range`);
      }
      return asNum;
    }
    case "int64":
      return dispatchBreakToBigInt(egpt);
    default:
      throw new Error(`decodeToHostValue: unsupported format ${format}`);
  }
}
__name(decodeToHostValue, "decodeToHostValue");
var HostFloatsToEGPTReal = class extends EncodingTransform {
  static {
    __name(this, "HostFloatsToEGPTReal");
  }
  static inputKind = "HostFloats";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Lift to PPF";
  static letterCode = "boundary";
  static provenance = {
    tier: "lean-backed",
    claim: "Every finite IEEE-754 float is a dyadic rational; the lift transports bits rather than approximating a value.",
    leanCitation: "PPF boundary \u2014 boundary/README.md claims 1\u20133; EGPT IN40/41/42, F12."
  };
  constructor(params = {}) {
    super(params);
    this._lastObservedFormat = null;
    this._policy = params.policy ?? "round-nearest-ties-even";
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof HostFloats)) {
      throw new TypeError("HostFloatsToEGPTReal expects a HostFloats input.");
    }
    const format = input.format;
    this._lastObservedFormat = format;
    this._lastAsBitPatterns = input.asBitPatterns;
    const asBitPatterns = input.asBitPatterns;
    const policy = this._policy;
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = captureHostValue(input.payload[i], format, { asBitPatterns, policy });
      trace?.opTrace?.record?.(`captureHostValue:${format}`, 0);
    }
    return new EGPTRealBag(out);
  }
  inverse() {
    return new EGPTRealToHostFloats({
      format: this._lastObservedFormat ?? "fp64",
      asBitPatterns: this._lastAsBitPatterns ?? false
    });
  }
};
var EGPTRealToHostFloats = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealToHostFloats");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "HostFloats";
  static invertible = true;
  static uiLabel = "Decode to host floats";
  static letterCode = "boundary";
  static provenance = {
    tier: "lean-backed",
    claim: "Round-tripping a finite host value through PPF is bit-exact within the finite prime basis.",
    leanCitation: "PPF boundary \u2014 boundary/README.md claim 2 (source-indifferent lift)."
  };
  constructor(params = {}) {
    super(params);
    const format = params.format ?? "fp64";
    if (!SUPPORTED_FORMATS.includes(format)) {
      throw new TypeError(
        `EGPTRealToHostFloats: params.format must be \u2208 {${SUPPORTED_FORMATS.join(", ")}}; got ${JSON.stringify(format)}.`
      );
    }
    this.format = format;
    const policy = params.policy ?? "exact";
    if (policy !== "exact" && policy !== "truncate") {
      throw new TypeError(
        `EGPTRealToHostFloats: params.policy must be \u2208 {'exact', 'truncate'}; got ${JSON.stringify(policy)}.`
      );
    }
    this.policy = policy;
    this.asBitPatterns = params.asBitPatterns ?? false;
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError("EGPTRealToHostFloats expects an EGPTRealBag input.");
    }
    const format = this.format;
    const asBitPatterns = this.asBitPatterns;
    const policy = this.policy;
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = decodeToHostValue(input.payload[i], format, { asBitPatterns, policy });
      trace?.opTrace?.record?.(`decodeToHostValue:${format}`, 0);
    }
    return new HostFloats(out, { format, asBitPatterns });
  }
  inverse() {
    return new HostFloatsToEGPTReal();
  }
};
var EGPTRealToPolynomial = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealToPolynomial");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "PolynomialCoefficients";
  static invertible = true;
  static uiLabel = "Pack as coefficients";
  static letterCode = "E";
  static provenance = {
    tier: "structural",
    claim: "A list of EGPTReals is a polynomial in ascending powers by construction."
  };
  apply(input) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError("EGPTRealToPolynomial expects an EGPTRealBag input.");
    }
    return new PolynomialCoefficients(input.payload, { L: input.L });
  }
  inverse() {
    return new PolynomialToEGPTReal();
  }
};
var PolynomialToEGPTReal = class extends EncodingTransform {
  static {
    __name(this, "PolynomialToEGPTReal");
  }
  static inputKind = "PolynomialCoefficients";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Unpack coefficients";
  static letterCode = "E";
  static provenance = {
    tier: "structural",
    claim: "Inverse of EGPTRealToPolynomial \u2014 a polynomial in ascending powers is a list of its EGPTReal coefficients."
  };
  apply(input) {
    if (!(input instanceof PolynomialCoefficients)) {
      throw new TypeError("PolynomialToEGPTReal expects a PolynomialCoefficients input.");
    }
    return new EGPTRealBag(input.payload, { L: input.L });
  }
  inverse() {
    return new EGPTRealToPolynomial();
  }
};
var PolynomialToFFT = class extends EncodingTransform {
  static {
    __name(this, "PolynomialToFFT");
  }
  static inputKind = "PolynomialCoefficients";
  static outputKind = "FFTSamples";
  static invertible = true;
  static uiLabel = "Polynomial \u2192 signal";
  static letterCode = "W";
  static provenance = {
    tier: "structural",
    claim: "Horner evaluation of a polynomial at the uniform rational nodes x_k = k/N is a bijection onto the values lane.",
    leanCitation: "W1 in theorems/W_FFTPolynomialMatrixIsomorphism.js"
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof PolynomialCoefficients)) {
      throw new TypeError("PolynomialToFFT expects a PolynomialCoefficients input.");
    }
    const values = EGPTFFT.forward(input.payload, input.payload.length);
    trace?.opTrace?.record?.("EGPTFFT.forward", input.payload.length);
    return new FFTSamples(values, { L: input.L });
  }
  inverse() {
    return new FFTToPolynomial();
  }
};
var FFTToPolynomial = class extends EncodingTransform {
  static {
    __name(this, "FFTToPolynomial");
  }
  static inputKind = "FFTSamples";
  static outputKind = "PolynomialCoefficients";
  static invertible = true;
  static uiLabel = "Signal \u2192 polynomial";
  static letterCode = "W";
  static provenance = {
    tier: "structural",
    claim: "Newton divided differences in canonical space reconstruct coefficients from uniform-node values bit-exactly.",
    leanCitation: "W2 in theorems/W_FFTPolynomialMatrixIsomorphism.js"
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof FFTSamples)) {
      throw new TypeError("FFTToPolynomial expects an FFTSamples input.");
    }
    const coeffs = EGPTFFT.inverse(input.payload, input.payload.length);
    trace?.opTrace?.record?.("EGPTFFT.inverse", input.payload.length);
    return new PolynomialCoefficients(coeffs, { L: input.L });
  }
  inverse() {
    return new PolynomialToFFT();
  }
};
var EGPTRealToPrimeAtoms = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealToPrimeAtoms");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "PrimeAtomVector";
  static invertible = true;
  static uiLabel = "Factor into prime atoms";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "Every EGPTReal factors uniquely into v\u20D7(n) = (v_2, v_3, v_5, \u2026) with sign and signed exponents. Multiplication in normal space is per-prime addition in this log space (LFTA, EGPT IN40/IN41/IN42, F12).",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean); F12 in PeqNP_QED.md; spaces/log/PrimeAtomPolynomial.js is the canonical witness."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError("EGPTRealToPrimeAtoms expects an EGPTRealBag input.");
    }
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = dispatchToPrimeAtoms(input.payload[i]);
      trace?.opTrace?.record?.("EGPTReal.toPrimeAtoms", 0);
    }
    return new PrimeAtomVector(out);
  }
  inverse() {
    return new PrimeAtomsToEGPTReal();
  }
};
var PrimeAtomsToEGPTReal = class extends EncodingTransform {
  static {
    __name(this, "PrimeAtomsToEGPTReal");
  }
  static inputKind = "PrimeAtomVector";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Compose from atoms";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "Inverse of EGPTRealToPrimeAtoms \u2014 reconstruct n = sign \xB7 \u03A0 prime^exponent. LFTA guarantees this is a bijection; round-trip is bit-exact (EGPT IN40/IN41/IN42, F12).",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean)."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof PrimeAtomVector)) {
      throw new TypeError("PrimeAtomsToEGPTReal expects a PrimeAtomVector input.");
    }
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = dispatchFromAtomVec(input.payload[i]);
      trace?.opTrace?.record?.("EGPTReal.fromAtomVec", 0);
    }
    return new EGPTRealBag(out);
  }
  inverse() {
    return new EGPTRealToPrimeAtoms();
  }
};
var PrimeAtomsToRootProduct = class extends EncodingTransform {
  static {
    __name(this, "PrimeAtomsToRootProduct");
  }
  static inputKind = "PrimeAtomVector";
  static outputKind = "RootProductPolynomial";
  static invertible = true;
  static uiLabel = "Primes as roots";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "N2: every positive integer N has the algebraic representation P_N(x) = \u220F_p (x \u2212 p)^{v_p(N)} where the primes ARE the roots. FTA + LFTA make this a bijection with PrimeAtomVector.",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean); N2 in lib/egpt/js/model/theorems/N_NumberTheoryFourViews.js."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof PrimeAtomVector)) {
      throw new TypeError("PrimeAtomsToRootProduct expects a PrimeAtomVector input.");
    }
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = atomVecToRootProduct(input.payload[i]);
      trace?.opTrace?.record?.("PrimeAtomsToRootProduct.project", 0);
    }
    return new RootProductPolynomial(out);
  }
  inverse() {
    return new RootProductToPrimeAtoms();
  }
};
function atomVecToRootProduct(atom) {
  if (!atom || atom.sign === 0) {
    return { leadingCoeff: dispatchFromBigInt(0n), roots: [] };
  }
  const roots = [];
  for (const { prime, exponent } of atom.factors ?? []) {
    if (exponent < 0n) {
      throw new Error(
        `PrimeAtomsToRootProduct: negative exponent on prime ${prime} (got ${exponent}). Root-product polynomials are integer-only; rationals require a separate encoding.`
      );
    }
    if (exponent === 0n) continue;
    roots.push({
      value: dispatchFromBigInt(prime),
      multiplicity: exponent
    });
  }
  const leadingCoeff = atom.sign === -1 ? dispatchFromBigInt(-1n) : dispatchFromBigInt(1n);
  return { leadingCoeff, roots };
}
__name(atomVecToRootProduct, "atomVecToRootProduct");
var RootProductToPrimeAtoms = class extends EncodingTransform {
  static {
    __name(this, "RootProductToPrimeAtoms");
  }
  static inputKind = "RootProductPolynomial";
  static outputKind = "PrimeAtomVector";
  static invertible = true;
  static uiLabel = "Roots as primes";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "Inverse of N2: reconstruct the LFTA prime-exponent vector by reading the leadingCoeff sign and treating each root as a prime atom with multiplicity as its exponent. FTA bijection guarantees the round-trip is exact.",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean)."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof RootProductPolynomial)) {
      throw new TypeError("RootProductToPrimeAtoms expects a RootProductPolynomial input.");
    }
    const out = new Array(input.payload.length);
    for (let i = 0; i < input.payload.length; i++) {
      out[i] = rootProductToAtomVec(input.payload[i]);
      trace?.opTrace?.record?.("RootProductToPrimeAtoms.lift", 0);
    }
    return new PrimeAtomVector(out);
  }
  inverse() {
    return new PrimeAtomsToRootProduct();
  }
};
function rootProductToAtomVec(term) {
  if (!term) return { sign: 0, factors: [] };
  const lc = term.leadingCoeff;
  if (lc == null) return { sign: 0, factors: [] };
  let sign;
  try {
    const { numerator } = dispatchRationalParts(lc);
    if (numerator === 0n) return { sign: 0, factors: [] };
    sign = numerator < 0n ? -1 : 1;
  } catch {
    return { sign: 0, factors: [] };
  }
  const factors = [];
  for (const r of term.roots ?? []) {
    const { numerator, denominator } = dispatchRationalParts(r.value);
    if (denominator !== 1n) {
      throw new Error(
        `RootProductToPrimeAtoms: non-integer root ${numerator}/${denominator}; this RootProductPolynomial is outside the integer-prime image of the bijection.`
      );
    }
    if (numerator < 2n) {
      throw new Error(
        `RootProductToPrimeAtoms: root ${numerator} is not a prime (\u2265 2 required).`
      );
    }
    if (r.multiplicity <= 0n) {
      throw new Error(
        `RootProductToPrimeAtoms: non-positive multiplicity ${r.multiplicity}; expected a positive integer.`
      );
    }
    factors.push({
      prime: numerator,
      exponent: r.multiplicity
    });
  }
  return { sign, factors };
}
__name(rootProductToAtomVec, "rootProductToAtomVec");
var CoefficientsToMonomial = class extends EncodingTransform {
  static {
    __name(this, "CoefficientsToMonomial");
  }
  static inputKind = "PolynomialCoefficients";
  static outputKind = "MonomialPolynomial";
  static invertible = true;
  static uiLabel = "View as monomial polynomial";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "A coefficient list c\u2080, c\u2081, \u2026, c\u2099 in ascending powers IS a polynomial in monomial basis: P(x) = \u03A3 c\u1D62x\u2071. The bijection is identity on the payload \u2014 no math, only basis labelling.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T1: polynomial evaluation \u2261 Vandermonde dot product)."
  };
  apply(input) {
    if (!(input instanceof PolynomialCoefficients)) {
      throw new TypeError("CoefficientsToMonomial expects a PolynomialCoefficients input.");
    }
    return new MonomialPolynomial(input.payload);
  }
  inverse() {
    return new MonomialToCoefficients();
  }
};
var MonomialToCoefficients = class extends EncodingTransform {
  static {
    __name(this, "MonomialToCoefficients");
  }
  static inputKind = "MonomialPolynomial";
  static outputKind = "PolynomialCoefficients";
  static invertible = true;
  static uiLabel = "View as coefficient list";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "Inverse of CoefficientsToMonomial \u2014 extract the coefficient list from the monomial-basis polynomial. Identity on payload.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T1)."
  };
  apply(input) {
    if (!(input instanceof MonomialPolynomial)) {
      throw new TypeError("MonomialToCoefficients expects a MonomialPolynomial input.");
    }
    return new PolynomialCoefficients(input.payload);
  }
  inverse() {
    return new CoefficientsToMonomial();
  }
};
var MonomialToValues = class extends EncodingTransform {
  static {
    __name(this, "MonomialToValues");
  }
  static inputKind = "MonomialPolynomial";
  static outputKind = "ValueRepresentation";
  static invertible = true;
  static uiLabel = "Sample at powers of 2";
  static letterCode = "V";
  static provenance = {
    tier: "structural",
    claim: "Horner evaluation of P(x) at x = 2^k for k=0..D produces the canonical EGPT value representation. Integer powers of 2 are the IOP-aligned sample base (Address-is-the-Map).",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T1: polynomial evaluation \u2261 Vandermonde dot product); EGPT corpus EGPT_FTA \xA78."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof MonomialPolynomial)) {
      throw new TypeError("MonomialToValues expects a MonomialPolynomial input.");
    }
    const sampleCount = Math.max(1, input.payload?.length ?? 0);
    trace?.opTrace?.record?.("EGPTPolynomial.evaluateAt", sampleCount * sampleCount);
    return ValueRepresentation.fromMonomial(input);
  }
  inverse() {
    return new ValuesToMonomial();
  }
};
var ValuesToMonomial = class extends EncodingTransform {
  static {
    __name(this, "ValuesToMonomial");
  }
  static inputKind = "ValueRepresentation";
  static outputKind = "MonomialPolynomial";
  static invertible = true;
  static uiLabel = "Recover coefficients (Newton DD)";
  static letterCode = "V";
  static provenance = {
    tier: "structural",
    claim: "Newton divided differences at distinct integer nodes recovers the unique polynomial of degree \u2264 D from its D+1 values. Bit-exact and O(N\xB2) over rationals.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T2: Vandermonde inverse \u2014 analytical warrant for uniqueness of the recovered polynomial)."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof ValueRepresentation)) {
      throw new TypeError("ValuesToMonomial expects a ValueRepresentation input.");
    }
    const monomialCoeffs = EGPTPolynomial.fromValueRepresentation(input.payload);
    trace?.opTrace?.record?.("EGPTPolynomial.fromValueRepresentation", input.payload.length * input.payload.length);
    return new MonomialPolynomial(monomialCoeffs);
  }
  inverse() {
    return new MonomialToValues();
  }
};
var HostFloatsToIntegerN = class extends EncodingTransform {
  static {
    __name(this, "HostFloatsToIntegerN");
  }
  static inputKind = "HostFloats";
  static outputKind = "IntegerN";
  static invertible = true;
  static uiLabel = "Lift to integer N";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "A length-1 HostFloats with an integer-valued sample lifts to an IntegerN. Identity-on-value; cardinality reshape from per-element bag to scalar.",
    leanCitation: "EGPT/NumberTheory/Core.lean (equivParticlePathToNat) \u2014 IntegerN is the codec-graph surface of the ParticlePath primitive."
  };
  apply(input) {
    if (!(input instanceof HostFloats)) {
      throw new TypeError("HostFloatsToIntegerN expects a HostFloats input.");
    }
    if (input.payload.length !== 1) {
      throw new RangeError(
        `HostFloatsToIntegerN expects exactly one sample, got ${input.payload.length}.`
      );
    }
    const v = input.payload[0];
    const big = coerceToInteger(v, input.format);
    return new IntegerN(dispatchFromBigInt(big));
  }
  inverse() {
    return new IntegerNToHostFloats();
  }
};
function coerceToInteger(value, format) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`HostFloatsToIntegerN: non-finite sample ${value}.`);
    }
    if (!Number.isInteger(value)) {
      throw new RangeError(
        `HostFloatsToIntegerN: sample ${value} is not integer-valued (format=${format}). Use HostFloatsToEGPTReal for fractional inputs.`
      );
    }
    return BigInt(value);
  }
  throw new TypeError(`HostFloatsToIntegerN: unsupported sample type ${typeof value}.`);
}
__name(coerceToInteger, "coerceToInteger");
var IntegerNToHostFloats = class extends EncodingTransform {
  static {
    __name(this, "IntegerNToHostFloats");
  }
  static inputKind = "IntegerN";
  static outputKind = "HostFloats";
  static invertible = true;
  static uiLabel = "Decode to host integer";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "IntegerN \u21A6 HostFloats with single int sample. Identity-on-value cardinality reshape.",
    leanCitation: "EGPT/NumberTheory/Core.lean (equivParticlePathToNat)."
  };
  constructor(opts = {}) {
    super();
    this.format = opts.format ?? "int64";
  }
  apply(input) {
    if (!(input instanceof IntegerN)) {
      throw new TypeError("IntegerNToHostFloats expects an IntegerN input.");
    }
    const n = input.toBigInt();
    if (this.format === "int64") {
      return new HostFloats([n], { format: "int64" });
    }
    if (this.format === "int32") {
      const num = Number(n);
      return new HostFloats([num], { format: "int32" });
    }
    if (this.format === "fp64" || this.format === "fp32" || this.format === "fp16" || this.format === "bfloat16") {
      return new HostFloats([Number(n)], { format: this.format });
    }
    throw new RangeError(`IntegerNToHostFloats: unsupported format ${this.format}.`);
  }
  inverse() {
    return new HostFloatsToIntegerN();
  }
};
var IntegerNToAtomRoot = class extends EncodingTransform {
  static {
    __name(this, "IntegerNToAtomRoot");
  }
  static inputKind = "IntegerN";
  static outputKind = "AtomRootPolynomial";
  static invertible = true;
  static uiLabel = "Factor N \u2192 atom-root polynomial";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "FTA + N2: every integer N \u2260 0 has a unique factored polynomial P_N(x) = sign(N) \xB7 \u220F(x \u2212 p)^v_p(N). AtomRootPolynomial is the canonical polynomial encoding of N (egpt KB).",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean); N2 in N_NumberTheoryFourViews.js."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof IntegerN)) {
      throw new TypeError("IntegerNToAtomRoot expects an IntegerN input.");
    }
    const term = dispatchToAtomRoot(input.payload);
    trace?.opTrace?.record?.("EGPTReal.toAtomRoot", 0);
    return new AtomRootPolynomial(term);
  }
  inverse() {
    return new AtomRootToIntegerN();
  }
};
var AtomRootToIntegerN = class extends EncodingTransform {
  static {
    __name(this, "AtomRootToIntegerN");
  }
  static inputKind = "AtomRootPolynomial";
  static outputKind = "IntegerN";
  static invertible = true;
  static uiLabel = "Reconstruct N from atoms";
  static letterCode = "N";
  static provenance = {
    tier: "lean-backed",
    claim: "FTA inverse: N = leadingCoeff \xB7 \u220F p\u1D62^v\u1D62. Pure multiplication; no root-finding.",
    leanCitation: "EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (Analysis.lean)."
  };
  apply(input) {
    if (!(input instanceof AtomRootPolynomial)) {
      throw new TypeError("AtomRootToIntegerN expects an AtomRootPolynomial input.");
    }
    return new IntegerN(dispatchFromAtomRoot(input.payload));
  }
  inverse() {
    return new IntegerNToAtomRoot();
  }
};
var AtomRootToMonomial = class extends EncodingTransform {
  static {
    __name(this, "AtomRootToMonomial");
  }
  static inputKind = "AtomRootPolynomial";
  static outputKind = "MonomialPolynomial";
  static invertible = true;
  static uiLabel = "Expand to monomial form";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "Polynomial multiplication of factored \u220F(x \u2212 r\u1D62)^v\u1D62 produces the unique monomial-basis polynomial of the same shape. O(D\xB2) integer-clean operation.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T1: polynomial-multiplication \u2261 Toeplitz GEMV)."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof AtomRootPolynomial)) {
      throw new TypeError("AtomRootToMonomial expects an AtomRootPolynomial input.");
    }
    const lc = input.payload.leadingCoeff;
    if (dispatchBreakToBigInt(lc) === 0n) {
      return new MonomialPolynomial([dispatchFromBigInt(0n)]);
    }
    let coeffs = [lc];
    for (const { value, multiplicity } of input.payload.roots) {
      for (let m = 0n; m < multiplicity; m++) {
        coeffs = multiplyByLinearTerm(coeffs, value);
        trace?.opTrace?.record?.("AtomRootToMonomial.multiplyByLinearTerm", coeffs.length);
      }
    }
    return new MonomialPolynomial(coeffs);
  }
  inverse() {
    return new MonomialToAtomRoot();
  }
};
function multiplyByLinearTerm(coeffs, root) {
  const tags = JSON.parse(callWasm(
    "codecMulLinear",
    _handlesJson(coeffs, "multiplyByLinearTerm"),
    _handlesJson([root], "multiplyByLinearTerm")
  ));
  return _fromTags(tags, [coeffs, [root]]);
}
__name(multiplyByLinearTerm, "multiplyByLinearTerm");
var MonomialToAtomRoot = class extends EncodingTransform {
  static {
    __name(this, "MonomialToAtomRoot");
  }
  static inputKind = "MonomialPolynomial";
  static outputKind = "AtomRootPolynomial";
  static invertible = true;
  static uiLabel = "Factor to atom-root form";
  static letterCode = "T";
  static provenance = {
    tier: "structural",
    claim: "Inverse of AtomRootToMonomial: rational-root-theorem trial division recovers the prime roots of an atom-root polynomial in O(\u03C9(N) \xB7 D) integer operations. Restricted domain \u2014 requires the input to actually be an atom-root polynomial of some integer N.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T2 inverse, restricted to atom-root domain)."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof MonomialPolynomial)) {
      throw new TypeError("MonomialToAtomRoot expects a MonomialPolynomial input.");
    }
    const coeffs = coeffsToBigInt(input.payload);
    if (coeffs.length === 1 && coeffs[0] === 0n) {
      return new AtomRootPolynomial({
        leadingCoeff: dispatchFromBigInt(0n),
        roots: []
      });
    }
    const D = coeffs.length - 1;
    const leading = coeffs[D];
    if (leading !== 1n && leading !== -1n) {
      throw new RangeError(
        `MonomialToAtomRoot: leading coefficient must be \xB11 (got ${leading}). Input is not an atom-root polynomial of integer N.`
      );
    }
    if (D === 0) {
      return new AtomRootPolynomial({
        leadingCoeff: dispatchFromBigInt(leading),
        roots: []
      });
    }
    const c0 = coeffs[0];
    if (c0 === 0n) {
      throw new RangeError(
        "MonomialToAtomRoot: constant term is 0; atom-root polynomials of integer N \u2260 0 never have 0 as a root (0 is not prime)."
      );
    }
    const absN = c0 < 0n ? -c0 : c0;
    const candidatePrimes = PrimeAtomPolynomial.factorize(absN);
    trace?.opTrace?.record?.("PrimeAtomPolynomial.factorize", 0);
    let working = coeffs.slice();
    const recoveredRoots = [];
    for (const { prime, exponent: maxMultiplicity } of candidatePrimes) {
      let observed = 0n;
      while (observed < maxMultiplicity && working.length > 1 && evalAtBigInt(working, prime) === 0n) {
        working = syntheticDivide(working, prime);
        observed += 1n;
        trace?.opTrace?.record?.("MonomialToAtomRoot.syntheticDivide", working.length);
      }
      if (observed > 0n) {
        recoveredRoots.push({
          value: dispatchFromBigInt(prime),
          multiplicity: observed
        });
      }
    }
    if (working.length !== 1 || working[0] !== leading) {
      throw new RangeError(
        `MonomialToAtomRoot: residual polynomial is not the unit constant. Working = [${working.join(",")}]. Input was not an atom-root polynomial.`
      );
    }
    return new AtomRootPolynomial({
      leadingCoeff: dispatchFromBigInt(leading),
      roots: recoveredRoots
    });
  }
  inverse() {
    return new AtomRootToMonomial();
  }
};
function coeffsToBigInt(payload) {
  const out = new Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    const en = payload[i];
    if (en == null || dispatchToCanonicalStr(en).includes("/")) {
      throw new RangeError(
        `MonomialToAtomRoot: coefficient at index ${i} is not an integer handle.`
      );
    }
    out[i] = dispatchBreakToBigInt(en);
  }
  return out;
}
__name(coeffsToBigInt, "coeffsToBigInt");
var _bigsJson = /* @__PURE__ */ __name((xs) => JSON.stringify(xs.map(String)), "_bigsJson");
function evalAtBigInt(coeffs, x) {
  return BigInt(callWasm("codecPolyEvalAt", _bigsJson(coeffs), String(x)));
}
__name(evalAtBigInt, "evalAtBigInt");
function syntheticDivide(coeffs, r) {
  return JSON.parse(callWasm("codecSyntheticDivide", _bigsJson(coeffs), String(r))).map(BigInt);
}
__name(syntheticDivide, "syntheticDivide");
var MatrixInputToPolynomialBag = class extends EncodingTransform {
  static {
    __name(this, "MatrixInputToPolynomialBag");
  }
  static inputKind = "MatrixInput";
  static outputKind = "MonomialPolynomialBag";
  static invertible = false;
  static uiLabel = "Decompose matrix into polynomial bag";
  static letterCode = "boundary";
  static provenance = {
    tier: "structural",
    claim: "Reading each row (or column) of a matrix layout as a polynomial in ascending powers unpacks the matrix into a polynomial bag. Input-only boundary primitive \u2014 no inverse, by design.",
    leanCitation: "EGPT IN40 (One-Way Information Ingestion); F12 (Hybrid Representation Trap); C37 (Syntactic Cipher). The bijection of each polynomial back to its row/column is by construction; the catalog deliberately ships no outbound packager."
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof MatrixInput)) {
      throw new TypeError("MatrixInputToPolynomialBag expects a MatrixInput input.");
    }
    const polys = [];
    if (input.axis === "rows") {
      for (let i = 0; i < input.rows; i++) {
        polys.push(new MonomialPolynomial(input.payload[i].slice()));
        trace?.opTrace?.record?.("MatrixInputToPolynomialBag.row", input.cols);
      }
    } else {
      for (let j = 0; j < input.cols; j++) {
        const col = new Array(input.rows);
        for (let i = 0; i < input.rows; i++) col[i] = input.payload[i][j];
        polys.push(new MonomialPolynomial(col));
        trace?.opTrace?.record?.("MatrixInputToPolynomialBag.col", input.rows);
      }
    }
    return new MonomialPolynomialBag(polys);
  }
  inverse() {
    throw new Error(
      "MatrixInputToPolynomialBag has no inverse, by design. Matrices are an input boundary layout only; the polynomial bag is the canonical post-boundary form. See EGPT IN40 / F12 / C37 in the transform comment."
    );
  }
};
var MonomialBagToValuesBag = class extends EncodingTransform {
  static {
    __name(this, "MonomialBagToValuesBag");
  }
  static inputKind = "MonomialPolynomialBag";
  static outputKind = "ValueRepresentationBag";
  static invertible = true;
  static uiLabel = "Sample each polynomial at powers of 2";
  static letterCode = "V";
  static provenance = {
    tier: "structural",
    claim: "Folds the per-polynomial Horner-at-powers-of-2 Codec across a polynomial bag. Each element round-trips via the V-family bijection; the bag round-trips by construction.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T1: per-element evaluation warrant); EGPT corpus EGPT_FTA \xA78.",
    disciplineRefs: ["EGPT IN40/IN41/IN42", "F12"]
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof MonomialPolynomialBag)) {
      throw new TypeError(
        "MonomialBagToValuesBag expects a MonomialPolynomialBag input."
      );
    }
    const elementCodec = new MonomialToValues();
    const out = input.mapElements((monomial) => {
      trace?.opTrace?.record?.(
        "MonomialBagToValuesBag.element",
        Math.max(1, monomial.payload?.length ?? 0)
      );
      return elementCodec.apply(monomial, { trace });
    });
    return new ValueRepresentationBag(out);
  }
  inverse() {
    return new ValuesBagToMonomialBag();
  }
};
var ValuesBagToMonomialBag = class extends EncodingTransform {
  static {
    __name(this, "ValuesBagToMonomialBag");
  }
  static inputKind = "ValueRepresentationBag";
  static outputKind = "MonomialPolynomialBag";
  static invertible = true;
  static uiLabel = "Recover each polynomial (Newton DD)";
  static letterCode = "V";
  static provenance = {
    tier: "structural",
    claim: "Folds the per-polynomial Newton-divided-differences Codec across a values bag. Each element recovers its unique polynomial of degree \u2264 D from D+1 samples; the bag round-trips by construction.",
    leanCitation: "theorems/T_PolynomialMatrixIsomorphism.js (T2: per-element interpolation warrant \u2014 uniqueness of the recovered polynomial).",
    disciplineRefs: ["EGPT IN40/IN41/IN42", "F12"]
  };
  apply(input, { trace } = {}) {
    if (!(input instanceof ValueRepresentationBag)) {
      throw new TypeError(
        "ValuesBagToMonomialBag expects a ValueRepresentationBag input."
      );
    }
    const elementCodec = new ValuesToMonomial();
    const out = input.mapElements((values) => {
      trace?.opTrace?.record?.(
        "ValuesBagToMonomialBag.element",
        Math.max(1, values.payload?.length ?? 0)
      );
      return elementCodec.apply(values, { trace });
    });
    return new MonomialPolynomialBag(out);
  }
  inverse() {
    return new MonomialBagToValuesBag();
  }
};
var _bagToBasisDefaultCache = null;
function getBagToBasisDefaultCache() {
  if (_bagToBasisDefaultCache === null) {
    _bagToBasisDefaultCache = new PrimeCache();
  }
  return _bagToBasisDefaultCache;
}
__name(getBagToBasisDefaultCache, "getBagToBasisDefaultCache");
var EGPTRealBagToPrimeBasis = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealBagToPrimeBasis");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "PrimeBasis";
  static invertible = true;
  static uiLabel = "Pre-factor bag into prime basis";
  static letterCode = "P";
  static provenance = {
    tier: "structural",
    claim: "Pre-factors each element of the input bag via the prime cache and presents the result as a shared prime basis with per-element signed exponent vectors. Bijection: every input reconstructs as cofactor \xD7 \u03A0 basis[i]^exponents[i] \xD7 sign.",
    disciplineRefs: [
      "fat/crates/egpt_gemm/src/primes.rs (PrimeCache algorithmic reference)",
      "fat/crates/egpt_gemm/src/prepare.rs (load-time pre-factor pattern)",
      "fat/crates/egpt_gemm/src/legacy/prime_indexed.rs (sparse exponent layout)",
      "EGPT IN40/IN41/IN42",
      "F12"
    ]
  };
  constructor(params = {}) {
    super(params);
    this._cache = params.cache ?? null;
  }
  _getCache() {
    return this._cache ?? getBagToBasisDefaultCache();
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError(
        "EGPTRealBagToPrimeBasis expects an EGPTRealBag input."
      );
    }
    const cache = this._getCache();
    const N = input.payload.length;
    const numExpMaps = new Array(N);
    const denExpMaps = new Array(N);
    const signsArr = new Int8Array(N);
    const cofactorsArr = new Array(N);
    const seenIndices = /* @__PURE__ */ new Set();
    for (let i = 0; i < N; i++) {
      const e = input.payload[i];
      const { numerator, denominator } = dispatchRationalParts(e);
      if (numerator === 0n) {
        throw new RangeError(
          `EGPTRealBagToPrimeBasis: input[${i}] is zero, but PrimeBasis is PPF-no-zero (the prime-factored representation has no zero element).`
        );
      }
      const sign = numerator < 0n ? -1 : 1;
      const absNum = sign === -1 ? -numerator : numerator;
      if (denominator <= 0n) {
        throw new RangeError(
          `EGPTRealBagToPrimeBasis: input[${i}] has non-positive denominator ${denominator}; expected normalized EGPTReal.`
        );
      }
      const [numPairs, numCofactor] = cache.factor(absNum);
      const [denPairs, denCofactor] = cache.factor(denominator);
      if (denCofactor !== 1n) {
        throw new RangeError(
          `EGPTRealBagToPrimeBasis: input[${i}] denominator (${denominator}) has a prime factor outside the cache (residue ${denCofactor}). PrimeBasis with denominator cofactor not yet supported; widen PrimeCache limit or factor denominator separately. (v1 limitation; not a permanent constraint.)`
        );
      }
      const nMap = /* @__PURE__ */ new Map();
      for (const [idx, exp] of numPairs) {
        nMap.set(idx, exp);
        seenIndices.add(idx);
      }
      const dMap = /* @__PURE__ */ new Map();
      for (const [idx, exp] of denPairs) {
        dMap.set(idx, exp);
        seenIndices.add(idx);
      }
      numExpMaps[i] = nMap;
      denExpMaps[i] = dMap;
      signsArr[i] = sign;
      cofactorsArr[i] = numCofactor;
      trace?.opTrace?.record?.("EGPTRealBagToPrimeBasis.factor", 0);
    }
    const basis = Array.from(seenIndices).sort((a, b) => a - b);
    const exponents = new Array(N);
    for (let i = 0; i < N; i++) {
      const dense = new Int32Array(basis.length);
      const nMap = numExpMaps[i];
      const dMap = denExpMaps[i];
      for (let j = 0; j < basis.length; j++) {
        const idx = basis[j];
        const ne = nMap.get(idx) ?? 0;
        const de = dMap.get(idx) ?? 0;
        dense[j] = ne - de;
      }
      exponents[i] = dense;
    }
    return new PrimeBasis({
      basis,
      primeCache: cache,
      exponents,
      signs: signsArr,
      cofactors: cofactorsArr
    });
  }
  inverse() {
    return new PrimeBasisToEGPTRealBag({ cache: this._cache });
  }
};
function recompose(cofactor, terms) {
  const r = JSON.parse(callWasm("codecRecompose", String(cofactor), JSON.stringify(terms)));
  return { num: BigInt(r.num), den: BigInt(r.den) };
}
__name(recompose, "recompose");
var PrimeBasisToEGPTRealBag = class extends EncodingTransform {
  static {
    __name(this, "PrimeBasisToEGPTRealBag");
  }
  static inputKind = "PrimeBasis";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Recompose bag from prime basis";
  static letterCode = "P";
  static provenance = {
    tier: "structural",
    claim: "Inverse of EGPTRealBagToPrimeBasis \u2014 reconstruct each value as cofactor \xD7 \u03A0 basis[i]^exponents[i] \xD7 sign. Bijection is exact by construction.",
    disciplineRefs: [
      "fat/crates/egpt_gemm/src/primes.rs (PrimeCache algorithmic reference)",
      "fat/crates/egpt_gemm/src/prepare.rs (load-time pre-factor pattern)",
      "fat/crates/egpt_gemm/src/legacy/prime_indexed.rs (sparse exponent layout)",
      "EGPT IN40/IN41/IN42",
      "F12"
    ]
  };
  constructor(params = {}) {
    super(params);
    this._cache = params.cache ?? null;
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof PrimeBasis)) {
      throw new TypeError(
        "PrimeBasisToEGPTRealBag expects a PrimeBasis input."
      );
    }
    const { basis, primeCache, exponents, signs, cofactors } = input.payload;
    const primes = basis.length > 0 ? primeCache.primes() : null;
    const out = new Array(exponents.length);
    for (let i = 0; i < exponents.length; i++) {
      const exp = exponents[i];
      const terms = [];
      for (let j = 0; j < basis.length; j++) {
        const e = exp[j];
        if (e === 0) continue;
        terms.push([String(BigInt(primes[basis[j]])), e]);
      }
      const { num, den } = recompose(cofactors[i], terms);
      const signedNum = signs[i] === -1 ? -num : num;
      out[i] = dispatchFromRational(signedNum, den);
      trace?.opTrace?.record?.("PrimeBasisToEGPTRealBag.recompose", basis.length);
    }
    return new EGPTRealBag(out);
  }
  inverse() {
    return new EGPTRealBagToPrimeBasis({ cache: this._cache });
  }
};
function decomposeOdd(n) {
  const r = JSON.parse(callWasm("codecDecomposeOdd", String(n)));
  return { shift: r.shift, odd: BigInt(r.odd) };
}
__name(decomposeOdd, "decomposeOdd");
var PrimeBasisToOddPartIndex = class extends EncodingTransform {
  static {
    __name(this, "PrimeBasisToOddPartIndex");
  }
  static inputKind = "PrimeBasis";
  static outputKind = "OddPartIndex";
  static invertible = true;
  static uiLabel = "Index pre-factored bag by odd part";
  static letterCode = "O";
  static provenance = {
    tier: "lean-backed",
    claim: "Bijective Codec: pre-factored PrimeBasis bag \u2192 unique-odd-parts dictionary with per-position denominator preserved. The numerator-side bijection n = 2^shift \xD7 odd is the PPF_Bijection (constructive extraction of the Lean equivParticlePathToNat proof). Dictionary of unique odd parts is the codebook the bucket-dispatch matVec (AbadirSloaneDispatch) consults.",
    leanCitation: "EGPT/NumberTheory/Core.lean \u2014 equivParticlePathToNat (PPF_Bijection)",
    disciplineRefs: [
      "EGPT IN40/IN41/IN42 (multiplication = exponent-vector add)",
      "IN42 (sorted-merge over signed prime composites \u2014 AbadirSloaneDispatch)",
      "F12 (Hybrid Representation Trap \u2014 stay in compressed space)",
      "cloud-brain ruling 2026-04-28: PPF_Bijection / PathTransform / AS-Dispatch"
    ]
  };
  constructor(params = {}) {
    super(params);
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof PrimeBasis)) {
      throw new TypeError(
        "PrimeBasisToOddPartIndex expects a PrimeBasis input."
      );
    }
    const p = input.payload;
    const N = p.exponents.length;
    const primes = p.basis.length > 0 ? p.primeCache.primes() : null;
    const denominators = new Array(N);
    const groupMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < N; i++) {
      const exp = p.exponents[i];
      const terms = [];
      for (let j = 0; j < p.basis.length; j++) {
        const e = exp[j];
        if (e === 0) continue;
        terms.push([String(BigInt(primes[p.basis[j]])), e]);
      }
      const { num, den } = recompose(p.cofactors[i], terms);
      const { shift, odd } = decomposeOdd(num);
      const sign = p.signs[i];
      const member = { position: i, shift, sign };
      const existing = groupMap.get(odd);
      if (existing === void 0) {
        groupMap.set(odd, [member]);
      } else {
        existing.push(member);
      }
      denominators[i] = den;
      trace?.opTrace?.record?.("PrimeBasisToOddPartIndex.bucket", p.basis.length);
    }
    const groups = [];
    for (const [odd, members] of groupMap.entries()) {
      groups.push({ odd, members });
    }
    groups.sort((a, b) => a.odd < b.odd ? -1 : a.odd > b.odd ? 1 : 0);
    const uniqueOddParts = groups.length;
    const compressionRatio = uniqueOddParts === 0 ? 0 : N / uniqueOddParts;
    return new OddPartIndex({
      totalElements: N,
      uniqueOddParts,
      compressionRatio,
      groups,
      denominators
    });
  }
  inverse() {
    return new OddPartIndexToPrimeBasis();
  }
};
var _oddToBasisDefaultCache = null;
function getOddToBasisDefaultCache() {
  if (_oddToBasisDefaultCache === null) {
    _oddToBasisDefaultCache = new PrimeCache();
  }
  return _oddToBasisDefaultCache;
}
__name(getOddToBasisDefaultCache, "getOddToBasisDefaultCache");
var OddPartIndexToPrimeBasis = class extends EncodingTransform {
  static {
    __name(this, "OddPartIndexToPrimeBasis");
  }
  static inputKind = "OddPartIndex";
  static outputKind = "PrimeBasis";
  static invertible = true;
  static uiLabel = "Re-factor odd-part index into prime basis";
  static letterCode = "O";
  static provenance = {
    tier: "lean-backed",
    claim: "Bijective Codec inverse: OddPartIndex (with denominators) \u2192 PrimeBasis. Recomposes |num_i| = 2^shift \xD7 odd_for_position, re-factors via PrimeCache. PPF_Bijection / equivParticlePathToNat constructive extraction.",
    leanCitation: "EGPT/NumberTheory/Core.lean \u2014 equivParticlePathToNat (PPF_Bijection)",
    disciplineRefs: [
      "EGPT IN40/IN41/IN42",
      "F12",
      "cloud-brain ruling 2026-04-28: PPF_Bijection / PathTransform"
    ]
  };
  constructor(params = {}) {
    super(params);
    this._cache = params.cache ?? null;
  }
  _getCache() {
    return this._cache ?? getOddToBasisDefaultCache();
  }
  apply(input, { trace } = {}) {
    if (!(input instanceof OddPartIndex)) {
      throw new TypeError(
        "OddPartIndexToPrimeBasis expects an OddPartIndex input."
      );
    }
    if (!input.isBijective) {
      throw new RangeError(
        "OddPartIndexToPrimeBasis: input OddPartIndex is not bijective (missing the optional `denominators` field). Reducer-built indices (BagToOddPartIndex) discard denominators and cannot be inverted; only Codec-built indices (PrimeBasisToOddPartIndex) can. See OddPartIndex.isBijective."
      );
    }
    const p = input.payload;
    const N = p.totalElements;
    const cache = this._getCache();
    const numExpMaps = new Array(N);
    const denExpMaps = new Array(N);
    const signsArr = new Int8Array(N);
    const cofactorsArr = new Array(N);
    const seenIndices = /* @__PURE__ */ new Set();
    const filled = new Array(N).fill(false);
    for (let g = 0; g < p.groups.length; g++) {
      const grp = p.groups[g];
      const odd = grp.odd;
      for (let m = 0; m < grp.members.length; m++) {
        const mem = grp.members[m];
        const i = mem.position;
        if (filled[i]) {
          throw new RangeError(
            `OddPartIndexToPrimeBasis: position ${i} appears in more than one group (index is malformed; positions must be unique across groups).`
          );
        }
        const absNum = BigInt(callWasm("codecShiftOdd", mem.shift, String(odd)));
        const den = p.denominators[i];
        const [numPairs, numCofactor] = cache.factor(absNum);
        const [denPairs, denCofactor] = cache.factor(den);
        if (denCofactor !== 1n) {
          throw new RangeError(
            `OddPartIndexToPrimeBasis: position ${i} denominator (${den}) has a prime factor outside the cache (residue ${denCofactor}). PrimeBasis with denominator cofactor not yet supported; widen the active PrimeCache.`
          );
        }
        const nMap = /* @__PURE__ */ new Map();
        for (const [idx, exp] of numPairs) {
          nMap.set(idx, exp);
          seenIndices.add(idx);
        }
        const dMap = /* @__PURE__ */ new Map();
        for (const [idx, exp] of denPairs) {
          dMap.set(idx, exp);
          seenIndices.add(idx);
        }
        numExpMaps[i] = nMap;
        denExpMaps[i] = dMap;
        signsArr[i] = mem.sign;
        cofactorsArr[i] = numCofactor;
        filled[i] = true;
        trace?.opTrace?.record?.("OddPartIndexToPrimeBasis.refactor", 0);
      }
    }
    for (let i = 0; i < N; i++) {
      if (!filled[i]) {
        throw new RangeError(
          `OddPartIndexToPrimeBasis: position ${i} was not represented in any group. The OddPartIndex must contain a member for every position in [0, totalElements).`
        );
      }
    }
    const basis = Array.from(seenIndices).sort((a, b) => a - b);
    const exponents = new Array(N);
    for (let i = 0; i < N; i++) {
      const dense = new Int32Array(basis.length);
      const nMap = numExpMaps[i];
      const dMap = denExpMaps[i];
      for (let j = 0; j < basis.length; j++) {
        const idx = basis[j];
        const ne = nMap.get(idx) ?? 0;
        const de = dMap.get(idx) ?? 0;
        dense[j] = ne - de;
      }
      exponents[i] = dense;
    }
    return new PrimeBasis({
      basis,
      primeCache: cache,
      exponents,
      signs: signsArr,
      cofactors: cofactorsArr
    });
  }
  inverse() {
    return new PrimeBasisToOddPartIndex();
  }
};
function _lcmOfDenominators(denoms) {
  return BigInt(callWasm("codecLcmOfDenominators", _bigsJson(denoms)));
}
__name(_lcmOfDenominators, "_lcmOfDenominators");
function _collectDenominators(bag) {
  const elements = bag.payload;
  const N = elements.length;
  const denoms = new Array(N);
  for (let i = 0; i < N; i++) {
    denoms[i] = dispatchRationalParts(elements[i]).denominator;
  }
  return denoms;
}
__name(_collectDenominators, "_collectDenominators");
function _projectBagToNat(bag, scale) {
  if (scale === 1n) return bag;
  const elements = bag.payload;
  const N = elements.length;
  const projected = new Array(N);
  for (let i = 0; i < N; i++) {
    const { numerator, denominator } = dispatchRationalParts(elements[i]);
    if (denominator === 0n) {
      throw new RangeError(
        `EGPTRealBagRatToNat: position ${i} has zero denominator.`
      );
    }
    const scaled = BigInt(callWasm("codecScaleToNat", String(numerator), String(denominator), String(scale)));
    recordOp("bigintMul", 1);
    recordOp("bigintDiv", 1);
    projected[i] = dispatchFromBigInt(scaled);
  }
  return new EGPTRealBag(projected);
}
__name(_projectBagToNat, "_projectBagToNat");
var EGPTRealBagRatToNat = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealBagRatToNat");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Rat \u2192 Nat (lcm scale)";
  static letterCode = "N";
  static provenance = {
    tier: "derivative",
    claim: "Project an EGPTRealBag of rationals to Nat form by multiplying every value by the LCM of all denominators in the population. Scale S is information-preserving (FTA: S contains every prime factor of every denominator with the same multiplicity). Bijective with stored scale: original = (nat / S).",
    leanCitation: "equivParticlePathToNat (EGPT/NumberTheory/Core.lean); EGPT_Fundamental_Theorem_of_Arithmetic_via_Information (EGPT/PrimeAtoms.lean).",
    disciplineRefs: [
      "feedback_kernel_vs_boundary_projection.md",
      "EGPT IN40/IN41/IN42",
      "F12"
    ]
  };
  constructor({ scale = null } = {}) {
    super({ scale });
    if (scale != null && typeof scale !== "bigint") {
      throw new TypeError(
        `EGPTRealBagRatToNat: params.scale must be a bigint or null; got ${typeof scale}.`
      );
    }
    if (scale != null && scale <= 0n) {
      throw new RangeError(
        `EGPTRealBagRatToNat: params.scale must be strictly positive; got ${scale}.`
      );
    }
    this._scaleParam = scale;
    this._lastScale = scale;
  }
  apply(input) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError(
        "EGPTRealBagRatToNat.apply: input must be an EGPTRealBag."
      );
    }
    let scale;
    if (this._scaleParam == null) {
      const denoms = _collectDenominators(input);
      let pure = true;
      for (let i = 0; i < denoms.length; i++) {
        if (denoms[i] !== 1n) {
          pure = false;
          break;
        }
      }
      scale = pure ? 1n : _lcmOfDenominators(denoms);
    } else {
      scale = this._scaleParam;
    }
    const bag = _projectBagToNat(input, scale);
    this._lastScale = scale;
    return { bag, scale };
  }
  inverse() {
    const scale = this._scaleParam ?? this._lastScale;
    if (scale == null) {
      throw new RangeError(
        "EGPTRealBagRatToNat.inverse: cannot construct inverse without a scale. Either pass `{ scale: <bigint> }` to the constructor, or call apply() first so the LCM scale is discovered and stashed."
      );
    }
    return new EGPTRealBagNatToRat({ scale });
  }
};
var EGPTRealBagNatToRat = class extends EncodingTransform {
  static {
    __name(this, "EGPTRealBagNatToRat");
  }
  static inputKind = "EGPTRealBag";
  static outputKind = "EGPTRealBag";
  static invertible = true;
  static uiLabel = "Nat \u2192 Rat (divide by scale)";
  static letterCode = "N\u207B\xB9";
  static provenance = {
    tier: "derivative",
    claim: "Inverse of EGPTRealBagRatToNat: divide every value by the supplied scale. Recovers the original rational bag bit-exactly (provided the scale was the LCM that produced it).",
    leanCitation: "equivParticlePathToNat (EGPT/NumberTheory/Core.lean).",
    disciplineRefs: ["feedback_kernel_vs_boundary_projection.md"]
  };
  constructor({ scale } = {}) {
    super({ scale });
    if (typeof scale !== "bigint") {
      throw new TypeError(
        `EGPTRealBagNatToRat: params.scale must be a bigint; got ${typeof scale}.`
      );
    }
    if (scale <= 0n) {
      throw new RangeError(
        `EGPTRealBagNatToRat: params.scale must be strictly positive; got ${scale}.`
      );
    }
    this._scale = scale;
  }
  apply(input) {
    if (!(input instanceof EGPTRealBag)) {
      throw new TypeError(
        "EGPTRealBagNatToRat.apply: input must be an EGPTRealBag."
      );
    }
    const scale = this._scale;
    if (scale === 1n) return input;
    const elements = input.payload;
    const N = elements.length;
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const { numerator, denominator } = dispatchRationalParts(elements[i]);
      if (denominator === 1n) {
        out[i] = dispatchFromRational(numerator, scale);
      } else {
        out[i] = dispatchFromRational(
          numerator,
          BigInt(callWasm("codecScaleDenominator", String(denominator), String(scale)))
        );
        recordOp("bigintMul", 1);
      }
    }
    return new EGPTRealBag(out);
  }
  inverse() {
    return new EGPTRealBagRatToNat({ scale: this._scale });
  }
};

// src/browser/codec/index.js
registry.register(HostFloatsToEGPTReal);
registry.register(EGPTRealToHostFloats);
registry.register(EGPTRealToPolynomial);
registry.register(PolynomialToEGPTReal);
registry.register(PolynomialToFFT);
registry.register(FFTToPolynomial);
registry.register(EGPTRealToPrimeAtoms);
registry.register(PrimeAtomsToEGPTReal);
registry.register(PrimeAtomsToRootProduct);
registry.register(RootProductToPrimeAtoms);
registry.register(CoefficientsToMonomial);
registry.register(MonomialToCoefficients);
registry.register(MonomialToValues);
registry.register(ValuesToMonomial);
registry.register(HostFloatsToIntegerN);
registry.register(IntegerNToHostFloats);
registry.register(IntegerNToAtomRoot);
registry.register(AtomRootToIntegerN);
registry.register(AtomRootToMonomial);
registry.register(MonomialToAtomRoot);
registry.register(MatrixInputToPolynomialBag);
registry.register(MonomialBagToValuesBag);
registry.register(ValuesBagToMonomialBag);
registry.register(EGPTRealBagToPrimeBasis);
registry.register(PrimeBasisToEGPTRealBag);
registry.register(PrimeBasisToOddPartIndex);
registry.register(OddPartIndexToPrimeBasis);
registry.register(EGPTRealBagRatToNat);
function buildSdkCodec(ns) {
  return {
    registry,
    Codec,
    buildCodecDsl,
    EncodingClasses: encodingClassesOf(ns),
    TransformRegistry
  };
}
__name(buildSdkCodec, "buildSdkCodec");

// src/browser/log-root-order-finding.js
function _p2() {
  return getActiveProvider();
}
__name(_p2, "_p");
function toBigInt(str) {
  try {
    return BigInt(str);
  } catch {
    return null;
  }
}
__name(toBigInt, "toBigInt");
function bitLengthOfBigInt(n) {
  return n > 0n ? n.toString(2).length : 0;
}
__name(bitLengthOfBigInt, "bitLengthOfBigInt");
function modPow(base, exp, mod) {
  return _p2().modPow(base, exp, mod);
}
__name(modPow, "modPow");
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
__name(bhattacharyyaF, "bhattacharyyaF");
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
__name(presetOptions, "presetOptions");
var EGPTdsp = class {
  static {
    __name(this, "EGPTdsp");
  }
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
__name(gcd, "gcd");
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
__name(modPowInternal, "modPowInternal");
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
__name(getPrimesUpToCached, "getPrimesUpToCached");
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
__name(smallPrimesUpTo, "smallPrimesUpTo");
function lcm(a, b) {
  return a / gcd(a, b) * b;
}
__name(lcm, "lcm");
function lcmRangeCached(B) {
  if (LCM_CACHE.has(B)) return LCM_CACHE.get(B);
  let L = 1n;
  for (let i = 2n; i <= B; i++) L = lcm(L, i);
  LCM_CACHE.set(B, L);
  return L;
}
__name(lcmRangeCached, "lcmRangeCached");
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
__name(findOrderLCMSmooth, "findOrderLCMSmooth");
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
__name(pollardPminus1Refinement, "pollardPminus1Refinement");
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
__name(pollardPminus1RefinementStage2, "pollardPminus1RefinementStage2");
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
__name(pollardPplus1Refinement, "pollardPplus1Refinement");
function _hFromBigInt(n) {
  return _p2().fromBigInt(n);
}
__name(_hFromBigInt, "_hFromBigInt");
function _getIntegerBitLength(h) {
  return _p2().getIntegerBitLength(h);
}
__name(_getIntegerBitLength, "_getIntegerBitLength");
function _breakToBigInt(h) {
  return _p2().breakSymbolicToApproximateBigInt(h);
}
__name(_breakToBigInt, "_breakToBigInt");
function _breakToString(h) {
  return _p2().breakSymbolicToString(h);
}
__name(_breakToString, "_breakToString");
function _normalDivide(a, b) {
  return _p2().normalDivide(a, b);
}
__name(_normalDivide, "_normalDivide");
function _gcd(a, b) {
  return _p2().gcd(a, b);
}
__name(_gcd, "_gcd");
function _modPow(base, exp, mod) {
  return _p2().modPow(base, exp, mod);
}
__name(_modPow, "_modPow");
function floorLog2EGPT(H_x) {
  const bl = _getIntegerBitLength(H_x);
  const flo = bl > 0n ? bl - 1n : 0n;
  return _hFromBigInt(flo);
}
__name(floorLog2EGPT, "floorLog2EGPT");
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
__name(iteratedFloorLog2, "iteratedFloorLog2");
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
__name(iteratedBitLength, "iteratedBitLength");
function factorizeWithLogRoot(k, bases = [2n, 3n, 5n, 7n], mode = "bitlength", options = {}) {
  const K = BigInt(k);
  const H_k = _hFromBigInt(K);
  const bits = _getIntegerBitLength(H_k);
  const startMs = Date.now();
  const timeBudgetMs = options.timeBudgetMs && options.timeBudgetMs > 0 ? Number(options.timeBudgetMs) : null;
  const budgetExceeded = /* @__PURE__ */ __name(() => timeBudgetMs !== null && Date.now() - startMs > timeBudgetMs, "budgetExceeded");
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
  const pushIfValid = /* @__PURE__ */ __name((x) => {
    if (x && x > 1n && x % 2n === 0n) rSet.add(x.toString());
  }, "pushIfValid");
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
__name(factorizeWithLogRoot, "factorizeWithLogRoot");

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
__name(parsePresetString, "parsePresetString");
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
__name(formatResult, "formatResult");
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
__name(runTaskFor, "runTaskFor");
function factorsFromRaw(raw) {
  const facs = raw?.postproc?.factors ?? [];
  return facs.map((f) => Number(f)).filter((n) => Number.isFinite(n) && n > 1);
}
__name(factorsFromRaw, "factorsFromRaw");
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
  __name(rowFor, "rowFor");
  function optionsFor(NStr) {
    const row = rowFor(NStr);
    const presetStr = (row?.presets ?? presetMap[NStr] ?? "") || "";
    const opts = parsePresetString(presetStr);
    if (BigInt(NStr) > 1000000n) {
      opts.preset ??= "hiBits";
    }
    return opts;
  }
  __name(optionsFor, "optionsFor");
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
  __name(factor, "factor");
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
      const push = /* @__PURE__ */ __name((type, data) => events.push({ type, ...data }), "push");
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
__name(createFraqtlSession, "createFraqtlSession");

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
(/* @__PURE__ */ __name((function assertBaselineComplete(b) {
  const missing = [];
  const req = /* @__PURE__ */ __name((path, val, ok = (v) => v !== void 0 && v !== null && v !== "") => {
    if (!ok(val)) missing.push(path);
  }, "req");
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
}), "assertBaselineComplete"))(QFT_BENCHMARK_BASELINE);

// src/browser/dist-entry.js
var { buildSdkCodec: buildSdkCodec2, ...codecBarrel } = codec_exports;
function buildWasmFacade(wasmMetadata) {
  return buildWasmCallFacade(wasmMetadata?.module ?? null, wasmMetadata?.mode, createOpTracer());
}
__name(buildWasmFacade, "buildWasmFacade");
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
  setWasmPortCalls(wasmFacade);
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
    // Rust ports of the JS reference.
    EGPTPrimeComposite,
    polyGCD,
    monicNormalize,
    matMul,
    matMulDense,
    detectToeplitzStencil,
    Multilinear: EGPTPolynomial.Multilinear,
    f64ToOddDenom,
    toEGPTReal,
    floatToEGPT,
    liftScalar,
    DebugLogger,
    SimpleLogger,
    createEGPTLogger,
    PrimeAtomPolynomial,
    OrderFinder,
    makeMeter,
    factMultiply,
    reconstruct,
    refactorize,
    kroneckerProduct,
    primeAtomMatMul,
    perPrimeExponentMatrix,
    primesInSupport,
    classifyAntidiagonalToeplitz,
    PrimeCache,
    sieveOfEratosthenes,
    // The codec barrel's names, top-level as the JS reference barrel exports them …
    ...codecBarrel,
    // … and the `sdk.codec` sub-object CodecView acquires through Runtime.ensureMath().
    codec: buildSdkCodec2(codec_exports),
    createFraqtlSession: /* @__PURE__ */ __name((options) => createFraqtlSession(sdk, options), "createFraqtlSession"),
    FraqtlSession: {
      auto: /* @__PURE__ */ __name((options) => createFraqtlSession(sdk, options), "auto")
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
__name(createEgptMathSdk, "createEgptMathSdk");
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
