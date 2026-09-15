/**
 * factory-retire-tombstone.test.mjs — WS-NOTEBOOK-FACTORY-RETIRE structural guard.
 *
 * The "NO opaque setup loads" invariant is enforced by REMOVAL: after the retirement
 * there is NO code path that loads a setup `<script src>` by name. These tombstones
 * mirror the gallery-import `setupSource` absence checks — they FAIL if the retired
 * opaque-factory machinery is ever resurrected in SOURCE:
 *
 *   - lib/shim/engine/setup-resolver.js no longer exists.
 *   - `resolveSetupFactory` is not exported anywhere in shim source.
 *   - `GraphicsPane.injectSetupFactory` is gone from graphics-render.
 *   - the controller / realm-entry no longer emit a `mode:'factory'` recipe.
 *   - the in-app pane no longer carries the silent `|| 'setupDoubleSlit'` default.
 *
 * Run: node --test lib/shim/notebook/test/factory-retire-tombstone.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

function read(rel) { return readFileSync(path.join(repoRoot, rel), 'utf8'); }

describe('WS-NOTEBOOK-FACTORY-RETIRE — tombstones (opaque setup-factory load is GONE)', function () {

    test('lib/shim/engine/setup-resolver.js no longer exists', function () {
        assert.ok(!existsSync(path.join(repoRoot, 'lib/shim/engine/setup-resolver.js')),
            'the opaque setup-factory <script src> resolver must be deleted, not aliased');
    });

    test('the shim barrel does not re-export resolveSetupFactory', function () {
        const barrel = read('lib/shim/index.js');
        assert.ok(!/resolveSetupFactory/.test(barrel), 'no resolveSetupFactory re-export in the shim barrel');
        assert.ok(!/setup-resolver/.test(barrel), 'no setup-resolver re-export in the shim barrel');
    });

    test('graphics-render no longer defines GraphicsPane.injectSetupFactory or imports the resolver', function () {
        const gfx = read('lib/components/graphics-render/index.js');
        assert.ok(!/prototype\.injectSetupFactory\s*=/.test(gfx),
            'GraphicsPane.injectSetupFactory must be deleted (mountRunner/loadExperiment stay)');
        assert.ok(!/import\s*\{[^}]*resolveSetupFactory[^}]*\}/.test(gfx),
            'no resolveSetupFactory import');
        assert.ok(!/from\s+['"][^'"]*setup-resolver/.test(gfx), 'no setup-resolver import');
        // KEEP confirmations: the mount + direct-setupFn paths survive.
        assert.ok(/prototype\.mountRunner\s*=/.test(gfx), 'GraphicsPane.mountRunner is KEPT');
        assert.ok(/prototype\.loadExperiment\s*=/.test(gfx), 'GraphicsPane.loadExperiment is KEPT');
    });

    test('the realm-frqtl handle no longer routes inject through injectSetupFactory', function () {
        const handle = read('lib/components/notebook-pane/realm-frqtl-handle.js');
        assert.ok(!/injectSetupFactory/.test(handle), 'no injectSetupFactory call in the frqtl handle');
        // KEEP: the host-side mount escape hatch stays the SOLE setup mechanism.
        assert.ok(/_mountRunnerInProcess/.test(handle), 'host-side _mountRunnerInProcess is KEPT');
    });

    test('controller-core + realm-entry are DELETED (WS-VSIX-PHASE2 single-stack cut)', function () {
        // Phase 2 deleted the entire Notebook-API stack (controller-core.js, realm-entry.js).
        // File absence is the strongest tombstone — these patterns cannot exist in files that
        // don't exist.
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/controller-core.js')),
            'controller-core.js must be deleted (Notebook-API stack removed in Phase 2)');
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/realm-entry.js')),
            'realm-entry.js must be deleted (Notebook-API stack removed in Phase 2)');
    });

    test('the in-app pane carries NO silent setupDoubleSlit default and no validateKnob import', function () {
        const pane = read('lib/components/notebook-pane/index.js');
        assert.ok(!/\|\|\s*['"]setupDoubleSlit['"]/.test(pane),
            'the silent `|| "setupDoubleSlit"` default must be deleted');
        assert.ok(!/handle\.inject\(\s*['"]experiment['"]/.test(pane),
            'no inject("experiment") build branch in the pane');
        assert.ok(!/validateAndMap as validateKnob/.test(pane),
            'the pane no longer imports validateKnob (the factory build branch is gone)');
    });
});

describe('WS-NOTEBOOK-SHIM-MANAGED-BUILDER — tombstones (authored runner-building builder GONE)', function () {

    // Strip /* … */ + // comments so tombstone PROSE naming the retired path does not
    // trip the executable-code greps below.
    function stripComments(s) {
        return String(s)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    }

    test('controller-core is DELETED (WS-VSIX-PHASE2 — no authored builder recipe possible)', function () {
        // Phase 2 deleted controller-core.js with the entire Notebook-API stack. File absence is
        // the strongest mode:"builder" tombstone — no controller can emit it if the file is gone.
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/controller-core.js')),
            'controller-core.js must be deleted (Phase 2 single-stack cut)');
    });

    test('realm-entry is DELETED (WS-VSIX-PHASE2 — no authored mode:"builder" branch possible)', function () {
        // Phase 2 deleted realm-entry.js. File absence = strongest tombstone: the authored
        // mode:"builder" branch cannot exist in a file that does not exist.
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/realm-entry.js')),
            'realm-entry.js must be deleted (Phase 2 single-stack cut)');
    });

    test('the in-app pane has NO _resolveBoundRunner runner-resolution path (C13) and imports the setup-builder authority', function () {
        const paneRaw = read('lib/components/notebook-pane/index.js');
        const pane = stripComments(paneRaw);
        // _resolveBoundRunner (the kernel-runner-binding resolver) is DELETED — the runner
        // is never resolved from the kernel store; it is realm-internal (C9/C13).
        assert.ok(!/_resolveBoundRunner/.test(pane),
            '_resolveBoundRunner is deleted (the runner is realm-internal, never a kernel binding)');
        // The pane no longer commits the live runner/handle as a kernel binding for a
        // declared canvas (no commitViewOutputs of the runner handle).
        assert.ok(!/outputs\[rec\.cell\.bind\]\s*=\s*rec\.realm\.handle/.test(pane),
            'the pane no longer commits the live realm handle as a kernel binding');
        // The pane synthesizes via the SOLE authority + reuses Runtime.runCell + the mount seam.
        assert.ok(/synthesizeBuilderSource/.test(paneRaw),
            'the pane imports the synthesizeBuilderSource authority (C8)');
        assert.ok(/_mountRunnerInProcess/.test(pane),
            'the pane reuses the host-side _mountRunnerInProcess mount seam (C6)');
    });

    test('no gallery/double-slit notebook carries an authored frqtl builder cell or a canvas bind=/spec= (C10)', function () {
        const NB_DIR = path.join(repoRoot, 'lib/notebooks');
        const files = readdirSync(NB_DIR).filter((f) =>
            /^gallery-.*\.html$/.test(f) || f === 'double-slit-rosetta-qft.html');
        assert.ok(files.length >= 7, 'expected the 7 canvas notebooks, found ' + files.length);
        for (const f of files) {
            const html = read('lib/notebooks/' + f);
            assert.ok(!/<cell\s+type="js"\s+lane="frqtl"/.test(html),
                f + ' has no authored lane=frqtl js builder cell');
            // a canvas tag carrying bind= or spec= is an unconverted legacy cell.
            const canvasTags = html.match(/<cell\s+type="canvas"[^>]*>/g) || [];
            for (const tag of canvasTags) {
                assert.ok(!/\bbind=/.test(tag), f + ' canvas carries no bind= runner ref: ' + tag);
                assert.ok(!/\bspec=/.test(tag), f + ' canvas carries no spec= (retired): ' + tag);
                assert.ok(/\bsetup=/.test(tag), f + ' canvas declares setup=: ' + tag);
            }
        }
    });
});
