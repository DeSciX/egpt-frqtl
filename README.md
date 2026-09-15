# egpt-frqtl — PROD app

The DeSciX PROD home for the FRQTL IDE. Self-contained by design: no cross-site linking, and no
FRAQTL-monorepo-only route survives in the bundle. **PROD is deliberately not a mirror of DEV.**

## Layout

```
site/index.html      the IDE entry
site/app-assets/*    hashed React chunks (vite owns this namespace)
site/pub/*           engine, vendor, experiments, ide, notebooks, math SDK
```

The two namespaces are **disjoint**. Serving the sdk dist at root collides with the IDE's own
`index.html`.

## Provenance of the bundle in `site/`

| | |
|---|---|
| Built from | FRAQTL `main` @ `79647e003f176aba3bd0c98bbf6b8ef156d05fb7` |
| Build tree state | 3 tracked modifications, all `.claude/agent-memory/*/MEMORY.md`; **zero build inputs dirty** |
| Recipe | `make static-deploy` (assembled by `scripts/assemble-static-deploy.mjs`) |
| Static flag | `VITE_FRQTL_STATIC=1` — baked at build time, never a URL param |
| Files | 706 |
| Bundle tree sha256 | `c157b92e5049242b0dc85eb707ab5da75166647d956a467a63063a1ff9dd1c17` |

`BUNDLE_TREE_SHA256` is the sha256 of the sorted `path + sha256` listing of every file under
`site/`, so it changes if any file's content or path changes:

```
cd site && find . -type f | sort | xargs shasum -a 256 | shasum -a 256
```

## How this bundle was verified before it landed here

`scripts/verify-static-deploy.sh` served the assembled bundle on a **dumb static file server**
(`python3 -m http.server` — no vite, no SPA rewrite, because the deploy target is a GCS bucket)
and ran four browser tests, all passing:

- `/` opens CODE view, zero asset 404s, import-map present
- `/?preset=ide&notebook=frqtl-qft-benchmark` — QFT opens, every math cell runs OK on `wasm-math`, zero 404s
- `/?preset=author` opens STUDIO, default experiment iframe under `/pub`, zero 404s
- `/?preset=compare` folds to CODE (public audience gate)

The assembler runs its own negative controls: `pub/js/compat/js-engine.js` and `pub/js/EGPTfrqtl.js`
must be **absent** and were reported CLEAN.

## Two traps this repo exists to stop repeating

1. **Never upload `apps/ide/dist/`.** It is half a site — no `/pub` payload, and a bare `vite build`
   leaves it in DEV-CORE mode with every engine/monaco/notebook/math URL resolving at `/frqtl/…`
   and `/egpt-src/…`, which nothing serves on a backend-less host. Nothing in the built bytes
   announces which mode they are. That is how the wrong bundle reached PROD and served a dead shell.
2. **A stale `.deploy-static/` looks exactly like a fresh one.** The assembly directory is
   gitignored and survives between builds; check file dates, not the directory's.

## Publishing

`.descix/manifests/site.json` is an explicit **allowlist**. Site URLs are non-expiring and
unsigned, so the publish set is enumerated rather than inherited. SiteWalker traps: an empty
`include` matches everything, `exclude` is tested **before** `include`, and directory excludes name
the bare directory with no glob suffix.
