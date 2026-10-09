## DeSciX lane
LANE: app          ENV: PROD (read .descix/workspace.json; `descix whoami` must print prod, chosen by env.apiUrl — never by an environment variable)
SDK: the published @descix/cli and @descix/app-sdk only, as an external developer — the handbook below, never platform source (nothing under Unkamon/DeSciX or any DeSciX_* tree)
INDEX: /Users/essam/Code/Unkamon/CLAUDE.md (imported at the end of this file) — repo map, runbooks, SME pointers, how modes switch
HANDBOOK: 1 `descix tell-me-how "<question>"`  2 the docs shipped inside @descix/cli (agent-assets/) and @descix/app-sdk (README.md)  3 /Users/essam/Code/daita/site/docs  4 the canonical app-developer runbook: /Users/essam/Code/daita/site/docs/app-sdk/app-developer-runbook.md (source DeSciX/V2_docs, rebuilt into the daita dist; live URL pending the PROD docs app)
PLATFORM WALL: when the handbook does not answer — stop, write the question with evidence (command, output, the CLI's origin line), hand it to your orchestrator; the orchestrator asks Sam to open a platform session in Unkamon (DEVPLANE). Never open platform source to answer it.

# egpt-frqtl — the FRQTL IDE and its front page: a PROD app of the egpt community
Public URL https://egpt-frqtl.descix.net/ (frqtl.com 301-forwards to it); app id `egpt-frqtl`, community `egpt`.
One site, one repo: this repo builds and uploads this app; nothing else uploads to it, and no other app's files live here. The front page is generated from the shared template (egpt-courantgroup `site/index.html`) and this app's content block in EGPT-Evidence `site-src/frontpage/egpt-frqtl.json`; only the built OUTPUT lives here.
CLI: `npx descix …` from this root (package.json pins @descix/cli; 1.0.9 is installed). The published 1.0.20 also runs here as `npx -y -p @descix/cli@1.0.20 descix …`. Either prints `env: prod (.descix/workspace.json env.apiUrl) https://descix.net` as its first line (measured 2026-10-09) — read that line on every call.

## Layout
- `site/` is the only directory uploaded. Authored here: `index.html` (front page, full screen via `app-assets/host-view.js`), `share.json` (title, description, icon, og_image, apple_touch_icon), `images/` with `images/share/` (favicon.ico, icon-180.png, share-1200x630.png), `DeSciXAppSDK.js` (vendored). Bundle-derived, written only by `scripts/refresh-site.sh`: `app.html` (the IDE), `app-assets/*`, `pub/*`.
- `.descix/manifests/site.json` is an explicit include allowlist: a new file or directory under `site/` must be added to its `include` or the upload silently leaves it out (that is how share.json was missed once).
- `kb/` (five KBs, one manifest each), `plugin/` (the `frqtl` Claude plugin), `scripts/` (refresh, tests): README.md owns those procedures; read it before touching any of them.
- Nothing in `site/` may use a root-absolute path: PROD serves the bundle under `/prod/egpt-frqtl/site/`, `descix serve` under `/p/egpt-frqtl/`.

## Serve
`npx descix serve` from this root; the app is detected from cwd (the workspace maps `site.static: "site"`, port `env.gateway.port` = 5173). Open the gateway ROOT `https://localhost:5173/` — the App Shell wrapping the app; `/p/egpt-frqtl` is the bare iframe target the shell loads, not a page to hand out. Files are read from disk on every request: rebuild, refresh, no restart.

## Upload
1. `npm test` and `node scripts/test/host-view.mjs --port <n>` pass (README).
2. `npx descix site upload -a egpt-frqtl --dry-run` — read both lists: everything uploaded, and "Would remove from the server".
3. `npx descix site upload -a egpt-frqtl` — a full replace of the served site; the receipt ends `Site uploaded successfully!`.
4. Served == built: `shasum -a 256 site/index.html` equals `curl -fsS https://egpt-frqtl.descix.net/prod/egpt-frqtl/site/index.html | shasum -a 256` (equal on 2026-10-09); repeat for one changed file.
5. Share card: `curl -sS -A 'facebookexternalhit/1.1' https://egpt-frqtl.descix.net/ | grep -o '<title>[^<]*</title>\|property="og:image" content="[^"]*"'` prints this site's title and og:image. The edge caches a share.json MISS for 300 s after the first upload that introduces it; later uploads self-heal.

## Rules
- Never hand-edit `.descix/workspace.json`: `descix app set-site`, `descix app set-localpath`, `descix app unmap` and `descix config …` are its only writers.
- Never run `descix login` (Sam's passkey). Never open or copy `.descix/wallet.json`: a single-holder credential. `Authentication required` is reported to the orchestrator, not repaired.
- No `DESCIX_API_URL` anywhere, no `--env`/`--api-url`: the environment is the workspace file's. A first line naming any other source is a stop.
- One CLI call at a time: two in one workspace race the same credential rotation.
- `app set-listed`, any chain-writing command, any account change: Sam's acts.
- Committed to main means pushed.

## Index
The ecosystem index follows; its own LANE line is Unkamon's (platform), not this repo's.
@../Unkamon/CLAUDE.md
