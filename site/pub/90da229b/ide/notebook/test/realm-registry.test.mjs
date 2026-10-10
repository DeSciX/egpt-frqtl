/**
 * realm-registry.test.mjs — WS-NOTEBOOK-REALM Step 1 registry authority.
 *
 * register/get/has/names + FAIL-LOUD on unknown name and bad descriptor. The
 * registry is the ONE realm-pre-load authority (the fourth BYO pluggable surface).
 *
 * Run: node --test lib/shim/notebook/test/realm-registry.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const Registry = await import(path.join(repoRoot, 'lib/shim/notebook/realm-registry.js'));

describe('realm-registry', () => {
    beforeEach(() => { Registry._resetForTest(); });

    test('register + get round-trips a descriptor', () => {
        const desc = { boot() { return {}; } };
        Registry.register('frqtl', desc);
        assert.equal(Registry.get('frqtl'), desc);
        assert.equal(Registry.has('frqtl'), true);
        assert.deepEqual(Registry.names(), ['frqtl']);
    });

    test('get FAILS LOUD on an unknown name (never a silent blank)', () => {
        Registry.register('chart', { boot() {} });
        assert.throws(() => Registry.get('frqtl'), /no realm registered for "frqtl"/);
        // The error names what IS registered, to aid the author.
        assert.throws(() => Registry.get('nope'), /Registered: \[chart\]/);
    });

    test('register FAILS LOUD on an invalid name', () => {
        assert.throws(() => Registry.register('', { boot() {} }), /invalid realm name/);
        assert.throws(() => Registry.register('Frqtl', { boot() {} }), /invalid realm name/);
        assert.throws(() => Registry.register('1frqtl', { boot() {} }), /invalid realm name/);
    });

    test('register FAILS LOUD on a descriptor missing boot()', () => {
        assert.throws(() => Registry.register('frqtl', {}), /must have a boot/);
        assert.throws(() => Registry.register('frqtl', { boot: 'no' }), /must have a boot/);
        assert.throws(() => Registry.register('frqtl', null), /must have a boot/);
    });

    test('has is non-throwing for an unknown name', () => {
        assert.equal(Registry.has('ghost'), false);
    });

    test('a BYO/custom realm registers like a blessed one (fourth pluggable surface)', () => {
        const custom = { boot(hostEl, transport) { return { hostEl, transport }; } };
        Registry.register('my-byo-realm', custom);
        assert.equal(Registry.get('my-byo-realm'), custom);
        assert.equal(Registry.has('my-byo-realm'), true);
    });
});
