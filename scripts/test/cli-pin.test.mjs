// One CLI pin: scripts/lib/descix.mjs CLI_PACKAGE. Every `@descix/cli@<version>` this repo writes (CLAUDE.md, the
// public overlay, README, kb, scripts) is that one; site/ (generator output), node_modules, the lockfile and .scratch
// are not this repo's words.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLI_PACKAGE } from '../lib/descix.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', 'site', '.scratch', 'package-lock.json']);
const PIN = /@descix\/cli@[0-9A-Za-z.+-]+/g;

/** Every `<file>: <pin>` under `root` naming a CLI version other than CLI_PACKAGE. */
function otherPins(root) {
    const hits = [];
    (function walk(rel) {
        for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
            if (SKIP.has(d.name)) continue;
            const r = rel ? rel + '/' + d.name : d.name;
            if (d.isDirectory()) { walk(r); continue; }
            if (!/\.(md|mjs|js|cjs|sh|json|html)$/.test(d.name)) continue;
            for (const m of readFileSync(join(root, r), 'utf8').match(PIN) || []) {
                if (m !== CLI_PACKAGE) hits.push(r + ': ' + m);
            }
        }
    })('');
    return hits;
}

test('CLI_PACKAGE is a pinned @descix/cli version', () => {
    assert.match(CLI_PACKAGE, /^@descix\/cli@\d+\.\d+\.\d+$/);
});

test('CLAUDE.md names the one pin', () => {
    assert.ok(readFileSync(join(REPO, 'CLAUDE.md'), 'utf8').includes('npx -y -p ' + CLI_PACKAGE + ' descix'),
        'CLAUDE.md does not name `npx -y -p ' + CLI_PACKAGE + ' descix`');
});

test('no other CLI version is named', () => {
    assert.deepEqual(otherPins(REPO), []);
});

test('a planted second pin is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-pin-'));
    try {
        cpSync(join(REPO, 'scripts'), join(dir, 'scripts'), { recursive: true });
        cpSync(join(REPO, 'CLAUDE.md'), join(dir, 'CLAUDE.md'));
        const f = join(dir, 'scripts', 'ship.sh');
        const stale = '@descix/' + 'cli@4.4.0';   // split, so this file is not a pin
        writeFileSync(f, readFileSync(f, 'utf8') + '\n# npx -y -p ' + stale + ' descix app media-upload\n');
        assert.deepEqual(otherPins(dir), ['scripts/ship.sh: ' + stale]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
