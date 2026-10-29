/**
 * Controls for scripts/scene-check.mjs: the clean scenes/ passes, and each plant — made in a temporary copy of
 * scenes/, never in the tree — is refused with the message that names it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(REPO, 'scripts', 'scene-check.mjs');
const PIN = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).devDependencies['@descix/frqtl-web'];

function run(root, extra = []) {
    const r = spawnSync(process.execPath, [CHECK, ...(root ? ['--root', root] : []), ...extra], { encoding: 'utf8' });
    return { rc: r.status, out: r.stdout + r.stderr };
}

/** A copy of scenes/ under a fresh directory, planted by `plant(scenesDir)`. */
function planted(plant) {
    const root = mkdtempSync(join(tmpdir(), 'scene-check-'));
    cpSync(join(REPO, 'scenes'), join(root, 'scenes'), { recursive: true });
    plant(join(root, 'scenes'));
    return root;
}

const sha8 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 8);

test('the clean tree passes and prints the upload list', () => {
    const r = run(null);
    assert.equal(r.rc, 0, r.out);
    assert.match(r.out, /scene-check: PASS/);
    assert.match(r.out, new RegExp('scenes/' + sha8(join(REPO, 'scenes/src/wave.js')) + '/wave\\.js'));
    assert.match(r.out, /scenes\/roster\.json/);
});

test('an import of a name the pinned dist lacks is refused naming scene, import, pin and the bump', () => {
    const root = planted((dir) => {
        const f = join(dir, 'src', 'wave.js');
        const t = readFileSync(f, 'utf8');
        const planted = t.replace("import { SphereEmitter } from '@descix/frqtl-web/parts';",
            "import { SphereEmitter, NoSuchPart } from '@descix/frqtl-web/parts';");
        assert.notEqual(planted, t, 'the plant must change wave.js');
        writeFileSync(f, planted);
        const roster = join(dir, 'roster.json');
        writeFileSync(roster, readFileSync(roster, 'utf8').split(/"[0-9a-f]{8}\/wave\.js"/).join('"' + sha8(f) + '/wave.js"'));
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.match(r.out, /scene wave\.js: line \d+ imports \{ NoSuchPart \} from "@descix\/frqtl-web\/parts"/);
        assert.ok(r.out.includes('pinned @descix/frqtl-web ' + PIN + ': bump the pin to a version that exports it'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a specifier outside the pinned table is refused by the linker, naming the scene and the pin', () => {
    const root = planted((dir) => {
        const f = join(dir, 'src', 'wave.js');
        writeFileSync(f, "import { x } from '@descix/frqtl-web/no-such-module.js';\n" + readFileSync(f, 'utf8'));
        const roster = join(dir, 'roster.json');
        writeFileSync(roster, readFileSync(roster, 'utf8').split(/"[0-9a-f]{8}\/wave\.js"/).join('"' + sha8(f) + '/wave.js"'));
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.match(r.out, /scene wave\.js: the linker refuses it: \[link\] "wave\.js" imports "@descix\/frqtl-web\/no-such-module\.js"/);
        assert.ok(r.out.includes('bump the pin to a version that exports it'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a scene byte change without a roster update is refused naming the stale path', () => {
    let stale = null;
    const root = planted((dir) => {
        const f = join(dir, 'src', 'sun.js');
        stale = JSON.parse(readFileSync(join(dir, 'roster.json'), 'utf8')).rows.find((r) => r.id === 'r8-sun').source;
        writeFileSync(f, readFileSync(f, 'utf8') + '\n');
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.ok(r.out.includes('roster row r8-sun: source ' + stale + ' is stale'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a roster row with no file is refused', () => {
    const root = planted((dir) => {
        const p = join(dir, 'roster.json');
        const j = JSON.parse(readFileSync(p, 'utf8'));
        j.rows.push({ id: 'ghost', title: 'Ghost', group: 'Light Lab', source: '0123abcd/ghost.js' });
        writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.ok(r.out.includes('roster row ghost: source 0123abcd/ghost.js names ghost.js, which is not in scenes/src/'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a scene with no row and no unlisted entry is refused', () => {
    const root = planted((dir) => {
        writeFileSync(join(dir, 'src', 'stray.js'), readFileSync(join(dir, 'src', 'wave.js')));
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.ok(r.out.includes('scene stray.js has no roster row and no entry in scenes/unlisted.json'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a roster the pinned normalizeRoster refuses is refused with its message', () => {
    const root = planted((dir) => {
        const p = join(dir, 'roster.json');
        const j = JSON.parse(readFileSync(p, 'utf8'));
        j.rows[0].is3D = true;
        writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
    });
    try {
        const r = run(root);
        assert.equal(r.rc, 1, r.out);
        assert.ok(r.out.includes('roster: @descix/frqtl-web ' + PIN + ' normalizeRoster refuses scenes/roster.json: [roster] roster.rows[0] has no key "is3D"'), r.out);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--quota from a checkout without the PROD workspace is refused naming the banner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scene-check-quota-'));
    try {
        const r = run(null, ['--quota', '--checkout', dir]);
        assert.notEqual(r.rc, 0, r.out);
        assert.ok(r.out.includes('not the PROD banner'), r.out);
        assert.doesNotMatch(r.out, /used_bytes: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the quota refusal starts above 150 MiB; its text states the threshold and the token\'s limit by value', async () => {
    const { quotaRefusalOf, QUOTA_LIMIT_BYTES } = await import(CHECK);
    assert.equal(QUOTA_LIMIT_BYTES, 150 * 1024 * 1024);
    // A limit other than the platform's 200 MB, so a typed "200 MB" cannot pass for the limit read from the token.
    const LIMIT = 300 * 1024 * 1024;
    assert.equal(quotaRefusalOf(QUOTA_LIMIT_BYTES, LIMIT), null);
    const why = quotaRefusalOf(QUOTA_LIMIT_BYTES + 1, LIMIT);
    assert.ok(why.includes('is above 157286400 (150 MB) of the 300 MB media quota'), why);
    assert.match(quotaRefusalOf(undefined, LIMIT), /non-negative integer/);
    assert.match(quotaRefusalOf(0.5, LIMIT), /non-negative integer/);
    assert.match(quotaRefusalOf(0, undefined), /limit_bytes must be a positive integer/);
});
