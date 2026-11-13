# scenes — the showcase scenes and their roster

The FRQTL scenes STUDIO and GYM list are sketch files: one ES module each, `export default function
buildExperiment(exp)`, importing only `@descix/frqtl-web/...` rows of the pinned package's
`FRQTL_WEB_SPECIFIERS`. They are app media of `egpt-frqtl`, uploaded with `descix app media-upload`, never part of
`site/` or of an npm package. STUDIO reads the roster from the absolute media URL
`https://egpt-frqtl.descix.net/assets/scenes/roster.json` and resolves each row's `source` against it.

## What lives here

| Path | What it is |
|---|---|
| `src/<name>.js` | the editable source of every scene |
| `roster.json` | the roster, in the contract of the pinned `@descix/frqtl-web/registry` (`ROSTER_KEYS`, `normalizeRoster`): scene rows (`id`, `title`, `group`, `source`, `prose`, `renderState`, `modes`), `firstContact`, and the showcase (cards, intro, invite, through-line) |
| `unlisted.json` | optional: `{ "<name>.js": "<reason>" }` for each scene file no roster row uses (none today, so the file is absent) |

## Content addressing

- A scene is uploaded once, at `scenes/<sha8>/<name>.js`, where `<sha8>` is the first 8 hex digits of the sha256 of
  its bytes. A changed scene is a new path; a path is never uploaded twice, so a served scene is never stale.
- `scenes/roster.json` is the one fixed name.
- Each row's `source` is `<sha8>/<name>.js`, relative to the roster's URL. Several rows may share one file.

## Adding or changing a scene

1. Edit or add `src/<name>.js`.
2. Run `npm run scene-check`. Each stale `source` is refused with its new path: write that path into the row (or
   add a row for a new scene, or an `unlisted.json` entry with a reason).
3. Run it again until it prints `scene-check: PASS`. It then prints the planned upload list, every
   `scenes/<sha8>/<name>.js` the roster uses and `scenes/roster.json`, with the total bytes.

4. Upload: `node scripts/upload-scenes.mjs --checkout <the app checkout>` (the checkout holds the PROD workspace and
   wallet; the CLI runs there). It runs scene-check with `--quota`, uploads each scene object the media does not serve
   yet (a served one with the same bytes is skipped, never re-uploaded; one with other bytes is refused), then the
   roster, and reads every object back: 200, `access-control-allow-origin: *`, the content type, the same sha256.
   `--dry-run` uploads nothing and exits 1 if anything would upload.
   A scene addition or edit ends here: no site upload and no npm version. STUDIO reads the roster through a 5-minute
   cache bucket (`?b=`), so a new row shows within about 5 minutes.

## What scene-check refuses

`node scripts/scene-check.mjs [--root <dir>] [--quota [--checkout <dir>]]` (no browser) exits 1 and prints every refusal:

- a scene that does not parse as an ES module, or that has a dynamic `import()`;
- an import the pinned package's linker (`@descix/frqtl-web/project` `linkProject`) does not admit;
- a named import that the installed pinned dist does not export. The refusal names the scene, the line, the import
  and the pinned version, and says "bump the pin to a version that exports it";
- a pin in `package.json` that is not the installed version;
- a roster the pinned `normalizeRoster` (`@descix/frqtl-web/registry`) refuses at the roster's URL;
- a `source` that is not `<sha8>/<name>.js`, names no file in `src/`, or carries a sha8 the file no longer has;
- a scene file with no row and no `unlisted.json` entry, an `unlisted.json` entry with no file, no reason, or a row.

`--quota [--checkout <dir>]` mints an upload token for the planned objects (`get_asset_upload_token`, through
`descix mcp execute`, run in the checkout that holds the PROD workspace and wallet; minting signs PUT URLs and uploads
nothing), prints `used_bytes` and `projected_bytes` from its `storage` field, and refuses when `used_bytes` is above
150 MB of the 200 MB media quota (app media has no list or delete verb yet; the DeSciX platform has them as a
proposal). A storage field it cannot read, or a CLI whose first line is not the PROD banner, stops it.

`scripts/test/scene-check.test.mjs` (in `npm test`) plants each refusal in a temporary copy of `scenes/`.
