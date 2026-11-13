// No script in this repo reads the roster at STUDIO's cache bucket URL: only STUDIO itself does (the pinned
// registry's bucketed request writer). A script's read of the live bucket would cache what it read at that URL for
// the bucket's lifetime; scripts read media through scripts/lib/scenes.mjs probeUrl.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUCKET_WRITER = 'rosterRequest' + 'Url';   // split, so this file is not a use of it
const SELF = 'test/no-bucket-reads.test.mjs';

/** Every scripts/ file (relative to `scriptsDir`) naming the bucket writer, but this test. */
function bucketReads(scriptsDir) {
    const hits = [];
    (function walk(rel) {
        for (const d of readdirSync(join(scriptsDir, rel), { withFileTypes: true })) {
            const r = rel ? rel + '/' + d.name : d.name;
            if (d.isDirectory()) { if (d.name !== 'node_modules') walk(r); continue; }
            if (r === SELF || !/\.(mjs|js|sh|html)$/.test(d.name)) continue;
            if (readFileSync(join(scriptsDir, r), 'utf8').includes(BUCKET_WRITER)) hits.push(r);
        }
    })('');
    return hits;
}

test('no script names the roster bucket writer', () => {
    assert.deepEqual(bucketReads(join(REPO, 'scripts')), []);
});

test('a planted use of the bucket writer is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-bucket-reads-'));
    try {
        cpSync(join(REPO, 'scripts'), join(dir, 'scripts'), { recursive: true });
        const f = join(dir, 'scripts', 'ship.sh');
        writeFileSync(f, readFileSync(f, 'utf8') + '\n# const url = ' + BUCKET_WRITER + '(ROSTER_HREF, Date.now());\n');
        assert.deepEqual(bucketReads(join(dir, 'scripts')), ['ship.sh']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
