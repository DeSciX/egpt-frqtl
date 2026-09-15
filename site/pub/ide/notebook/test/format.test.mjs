/**
 * format.test.mjs — WS-NOTEBOOK-A1 native notebook format round-trip.
 *
 * Proves parse/serialize round-trip the native <frqtl-notebook>/<cell> schema,
 * including markdown body indentation and a literal </cell> inside a body.
 *
 * Run: node --test lib/shim/notebook/test/format.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { parse, serialize, normalize } = await import(
    path.join(repoRoot, 'lib/shim/notebook/format.js')
);

describe('notebook format — parse', function () {

    test('parses root attrs + cells in document order', function () {
        const html = [
            '<frqtl-notebook version="1" title="Double Slit → Rosetta → QFT">',
            '<cell type="markdown">## Intro</cell>',
            '<cell type="js" lane="frqtl" id="c-ds-build" out="dsRun">const dsRun = 1; return { dsRun };</cell>',
            '<cell type="canvas" id="c-ds-canvas" in="dsRun" bind="dsRun"></cell>',
            '<cell type="chart" id="c-ds-chart" in="hist" spec="bar:hist"></cell>',
            '</frqtl-notebook>'
        ].join('\n');

        const nb = parse(html);
        assert.strictEqual(nb.version, '1');
        assert.strictEqual(nb.title, 'Double Slit → Rosetta → QFT');
        assert.strictEqual(nb.cells.length, 4);

        assert.strictEqual(nb.cells[0].type, 'markdown');
        assert.strictEqual(nb.cells[0].body, '## Intro');

        assert.strictEqual(nb.cells[1].type, 'js');
        assert.strictEqual(nb.cells[1].lane, 'frqtl');
        assert.strictEqual(nb.cells[1].id, 'c-ds-build');
        assert.deepStrictEqual(nb.cells[1].out, ['dsRun']);
        assert.deepStrictEqual(nb.cells[1].in, []);

        assert.strictEqual(nb.cells[2].type, 'canvas');
        assert.strictEqual(nb.cells[2].bind, 'dsRun');
        assert.deepStrictEqual(nb.cells[2].in, ['dsRun']);

        assert.strictEqual(nb.cells[3].spec, 'bar:hist');
    });

    test('comma-separated in/out lists split + trim', function () {
        const html = '<frqtl-notebook version="1"><cell type="js" lane="math" id="c" in="a, b ,c" out="x,y">return {x:1,y:2};</cell></frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].in, ['a', 'b', 'c']);
        assert.deepStrictEqual(nb.cells[0].out, ['x', 'y']);
    });

    test('FAIL-LOUD on a missing <frqtl-notebook> root', function () {
        assert.throws(() => parse('<html><body>not a notebook</body></html>'), /no <frqtl-notebook>/);
    });

    test('FAIL-LOUD on a non-string input', function () {
        assert.throws(() => parse({}), /requires an HTML string/);
    });

});

describe('notebook format — serialize + round-trip', function () {

    test('parse(serialize(nb)) deep-equals normalized nb', function () {
        const nb = {
            title: 'My Notebook',
            version: '1',
            cells: [
                { type: 'markdown', lane: '', id: '', name: '', in: [], out: [], bind: '', spec: '', setup: '', shape: '', stage: '', seed: '', render3d: false, renderOptions: {}, cameraPreset: '', produces: [], produceVia: '', produceAfter: '', liveChart: '', liveChartKind: '', realm: '', module: '', subscribe: '', opts: {}, collapsed: false, body: '## Heading\n\nSome **markdown**.' },
                { type: 'module', lane: '', id: '', name: './setups/wave.js', in: [], out: [], bind: '', spec: '', setup: '', shape: '', stage: '', seed: '', render3d: false, renderOptions: {}, cameraPreset: '', produces: [], produceVia: '', produceAfter: '', liveChart: '', liveChartKind: '', realm: '', module: '', subscribe: '', opts: {}, collapsed: false, body: "export function setupWave(frqtl, u, o) { return 1; }" },
                { type: 'js', lane: 'math', id: 'c1', name: '', in: ['hist'], out: ['chain'], bind: '', spec: '', setup: '', shape: '', stage: '', seed: '', render3d: false, renderOptions: {}, cameraPreset: '', produces: [], produceVia: '', produceAfter: '', liveChart: '', liveChartKind: '', realm: '', module: '', subscribe: '', opts: {}, collapsed: false, body: 'const chain = inputs.hist; return { chain };' },
                { type: 'canvas', lane: '', id: 'c2', name: '', in: [], out: [], bind: '', spec: '', setup: './setups/wave.js#setupWave', shape: '', stage: '480x480', seed: '42', render3d: false, renderOptions: {}, cameraPreset: '', produces: [], produceVia: '', produceAfter: '', liveChart: '', liveChartKind: '', realm: '', module: '', subscribe: '', opts: { quanta: 800 }, collapsed: false, body: '' }
            ]
        };
        const round = parse(serialize(nb));
        assert.deepStrictEqual(round, normalize(nb));
        assert.deepStrictEqual(round, nb, 'a clean notebook round-trips identically (incl. module name + canvas opts knob)');
    });

    test('collapsed="true" attribute parses to boolean and round-trips (E2d)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="markdown" collapsed="true">## Folded</cell>' +
            '<cell type="js" lane="math" id="c1">return {};</cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].collapsed, true, 'collapsed="true" → boolean true');
        assert.strictEqual(nb.cells[1].collapsed, false, 'absent collapsed → false');
        // serialize emits collapsed="true" only for the collapsed cell, and the
        // round-trip preserves the boolean (idempotent).
        const out = serialize(nb);
        assert.ok(out.indexOf('collapsed="true"') !== -1, 'collapsed cell serializes the attr');
        const round = parse(out);
        assert.strictEqual(round.cells[0].collapsed, true);
        assert.strictEqual(round.cells[1].collapsed, false);
        assert.deepStrictEqual(parse(serialize(round)), round, 'collapsed state is idempotent');
    });

    test('collapsed=false serializes identically to no collapsed attr (E2d)', function () {
        const a = '<frqtl-notebook version="1"><cell type="js" lane="math" id="c">return {};</cell></frqtl-notebook>';
        const b = '<frqtl-notebook version="1"><cell type="js" lane="math" id="c" collapsed="false">return {};</cell></frqtl-notebook>';
        assert.strictEqual(serialize(parse(a)), serialize(parse(b)), 'collapsed="false" is omitted, equal to absent');
    });

    test('canvas opts attribute parses to a {key:Number} map', function () {
        const html = '<frqtl-notebook version="1"><cell type="canvas" id="c" bind="r" spec="setupWaveInterference" opts="quanta=800"></cell></frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].opts, { quanta: 800 });
        // round-trips back to the same opts attribute
        const round = parse(serialize(nb));
        assert.deepStrictEqual(round.cells[0].opts, { quanta: 800 });
    });

    test('absent opts attribute → empty object', function () {
        const html = '<frqtl-notebook version="1"><cell type="canvas" id="c" bind="r" spec="setupWaveInterference"></cell></frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].opts, {});
    });

    test('canvas setup/stage/seed parse + round-trip (WS-NOTEBOOK-SHIM-MANAGED-BUILDER)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-wave" setup="./setups/wave.js#setupWave" opts="quanta=800" stage="480x480" seed="42"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        const c = nb.cells[0];
        assert.strictEqual(c.setup, './setups/wave.js#setupWave');
        assert.strictEqual(c.stage, '480x480');
        assert.strictEqual(c.seed, '42');
        assert.deepStrictEqual(c.opts, { quanta: 800 });
        // round-trip is idempotent (setup/stage/seed emitted in the fixed attr order)
        const out = serialize(nb);
        // Fixed attr order: setup, stage, seed, then opts (opts stays last, mirroring the
        // pre-existing serialize order — the canvas declaration attrs precede it).
        assert.match(out, /setup="\.\/setups\/wave\.js#setupWave" stage="480x480" seed="42" opts="quanta=800"/);
        const round = parse(out);
        assert.strictEqual(round.cells[0].setup, c.setup);
        assert.strictEqual(round.cells[0].stage, c.stage);
        assert.strictEqual(round.cells[0].seed, c.seed);
        assert.deepStrictEqual(parse(serialize(round)), round, 'setup/stage/seed idempotent');
    });

    test('absent setup/stage/seed → empty strings, omitted on serialize', function () {
        const html = '<frqtl-notebook version="1"><cell type="js" lane="math" id="c">return {};</cell></frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].setup, '');
        assert.strictEqual(nb.cells[0].stage, '');
        assert.strictEqual(nb.cells[0].seed, '');
        const out = serialize(nb);
        assert.ok(!/setup=|stage=|seed=/.test(out), 'empty setup/stage/seed omitted');
    });

    test('canvas render3d="true" parses to boolean and round-trips (WS gym-controls-as-sugar Bite 0 ADDENDUM)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-3d" setup="./setups/x.js#setupX" stage="480x480" seed="42" render3d="true"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].render3d, true);
        const out = serialize(nb);
        assert.match(out, /render3d="true"/);
        assert.deepStrictEqual(parse(serialize(nb)), nb, 'render3d idempotent round-trip');
    });

    test('render3d absent/false → false, omitted on serialize (mirrors collapsed, E2d)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-2d" setup="./setups/x.js#setupX"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].render3d, false);
        const out = serialize(nb);
        assert.ok(!/render3d=/.test(out), 'false render3d omitted (byte-identical to no attr)');
    });

    test('canvas renderOptions="k=v,…" parses to a {key:value} map (string values kept verbatim, WS gym-controls-as-sugar fix-loop #6 Finding B)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-cm3d" setup="./setups/x.js#setupX" render3d="true" renderOptions="shape=cube,colorScheme=roygbiv"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].renderOptions, { shape: 'cube', colorScheme: 'roygbiv' });
        const out = serialize(nb);
        assert.match(out, /renderOptions="shape=cube,colorScheme=roygbiv"/);
        assert.deepStrictEqual(parse(serialize(nb)), nb, 'renderOptions idempotent round-trip');
    });

    test('renderOptions is a SEPARATE key from opts — never folded, both round-trip independently', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-both" setup="./setups/x.js#setupX" opts="quanta=800" renderOptions="shape=box"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].opts, { quanta: 800 });
        assert.deepStrictEqual(nb.cells[0].renderOptions, { shape: 'box' });
        const out = serialize(nb);
        assert.match(out, /opts="quanta=800"/);
        assert.match(out, /renderOptions="shape=box"/);
        assert.deepStrictEqual(parse(serialize(nb)), nb, 'both opts-kind keys round-trip independently');
    });

    test('absent renderOptions → empty object, omitted on serialize', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-2d" setup="./setups/x.js#setupX"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.deepStrictEqual(nb.cells[0].renderOptions, {});
        const out = serialize(nb);
        assert.ok(!/renderOptions=/.test(out), 'empty renderOptions omitted (byte-identical to no attr)');
    });

    test('canvas cameraPreset parses + round-trips (WS gym-controls-as-sugar fix-loop #6 Finding B)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-gun" setup="./setups/x.js#setupX" render3d="true" cameraPreset="down-barrel"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].cameraPreset, 'down-barrel');
        const out = serialize(nb);
        assert.match(out, /cameraPreset="down-barrel"/);
        assert.deepStrictEqual(parse(serialize(nb)), nb, 'cameraPreset idempotent round-trip');
    });

    test('absent cameraPreset → empty string, omitted on serialize', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-2d" setup="./setups/x.js#setupX"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].cameraPreset, '');
        const out = serialize(nb);
        assert.ok(!/cameraPreset=/.test(out), 'empty cameraPreset omitted (byte-identical to no attr)');
    });

    test('canvas produceAfter parses + round-trips (WS-NOTEBOOK-BASELINE FIX B)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-ds" setup="./setups/ds.js#setupDS" stage="480x480" seed="42" produces="hist" produceAfter="400"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        const c = nb.cells[0];
        assert.strictEqual(c.produceAfter, '400', 'produceAfter parsed verbatim as a string (mirrors seed)');
        assert.deepStrictEqual(c.produces, ['hist']);
        // Fixed attr order: produces, produceVia, produceAfter, then opts.
        const out = serialize(nb);
        assert.match(out, /produces="hist" produceAfter="400"/);
        const round = parse(out);
        assert.strictEqual(round.cells[0].produceAfter, '400');
        assert.deepStrictEqual(parse(serialize(round)), round, 'produceAfter idempotent');
    });

    test('absent produceAfter → empty string, omitted on serialize', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#f" produces="hist"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].produceAfter, '');
        const out = serialize(nb);
        assert.ok(!/produceAfter=/.test(out), 'empty produceAfter omitted (idempotent)');
    });

    test('canvas liveChart/liveChartKind parse + round-trip (WS-NOTEBOOK-SAMECELL-LIVE-CHART)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-ds" setup="./setups/ds.js#setupDS" stage="480x480" seed="42" ' +
            'produces="hist" produceAfter="600" liveChart="detectorHistogram" liveChartKind="bar"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        const c = nb.cells[0];
        assert.strictEqual(c.liveChart, 'detectorHistogram', 'liveChart parsed verbatim');
        assert.strictEqual(c.liveChartKind, 'bar', 'liveChartKind parsed verbatim');
        // PURE parse: liveChart commits NOTHING — it does not enter in/out or the topo graph.
        assert.deepStrictEqual(c.in, [], 'liveChart never touches in');
        assert.deepStrictEqual(c.out, ['hist'], 'out is the produces fold only — liveChart is not an output');
        // Fixed serialize order: produces, produceVia, produceAfter, liveChart, liveChartKind, opts.
        const out = serialize(nb);
        assert.match(out, /produceAfter="600" liveChart="detectorHistogram" liveChartKind="bar"/);
        const round = parse(out);
        assert.strictEqual(round.cells[0].liveChart, 'detectorHistogram');
        assert.strictEqual(round.cells[0].liveChartKind, 'bar');
        assert.deepStrictEqual(parse(serialize(round)), round, 'liveChart/liveChartKind idempotent');
    });

    test('liveChart without liveChartKind round-trips (kind omitted, host defaults to bar)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#f" liveChart="detectorHistogram"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].liveChart, 'detectorHistogram');
        assert.strictEqual(nb.cells[0].liveChartKind, '', 'absent kind → empty string (host defaults to bar)');
        const out = serialize(nb);
        assert.match(out, /liveChart="detectorHistogram"/);
        assert.ok(!/liveChartKind=/.test(out), 'empty liveChartKind omitted (idempotent)');
        assert.deepStrictEqual(parse(serialize(nb)), nb, 'liveChart-only canvas idempotent');
    });

    test('absent liveChart/liveChartKind → empty strings, omitted on serialize', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#f" produces="hist"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].liveChart, '');
        assert.strictEqual(nb.cells[0].liveChartKind, '');
        const out = serialize(nb);
        assert.ok(!/liveChart=|liveChartKind=/.test(out), 'empty liveChart/liveChartKind omitted');
    });

    test('preserves multi-line markdown body indentation verbatim', function () {
        const body = '## Title\n  - indented bullet\n    - deeper\n\nplain';
        const nb = { title: '', version: '1', cells: [{ type: 'markdown', lane: '', id: '', in: [], out: [], bind: '', spec: '', body: body }] };
        const round = parse(serialize(nb));
        assert.strictEqual(round.cells[0].body, body);
    });

    test('escapes + restores a literal </cell> inside a body', function () {
        const body = 'Here is a literal close tag in prose: </cell> and more text.';
        const nb = { title: '', version: '1', cells: [{ type: 'markdown', lane: '', id: '', in: [], out: [], bind: '', spec: '', body: body }] };
        const serialized = serialize(nb);
        // The serialized form must NOT contain a bare </cell> in the body region
        // that would split the cell — only the real terminator.
        const round = parse(serialized);
        assert.strictEqual(round.cells.length, 1, 'escaped </cell> did not split the cell');
        assert.strictEqual(round.cells[0].body, body, 'body restored verbatim');
    });

    test('round-trips attribute values needing entity escaping', function () {
        const nb = { title: 'A "quoted" & <angled> title', version: '1', cells: [] };
        const round = parse(serialize(nb));
        assert.strictEqual(round.title, 'A "quoted" & <angled> title');
    });

    test('serialize FAIL-LOUD on a bad notebook object', function () {
        assert.throws(() => serialize(null), /requires a notebook object/);
        assert.throws(() => serialize({ cells: 'nope' }), /cells must be an array/);
    });

});

describe('notebook format — module cell grammar (WS-NOTEBOOK-IMPORT B3)', function () {

    test('parses a <cell type="module" name="…"> with a verbatim ES-module body', function () {
        const body = "export function setupWaveInterference(frqtl, universe, options) {\n" +
            "  const { PointSource } = frqtl;\n" +
            "  return new PointSource(universe);\n}";
        const html = '<frqtl-notebook version="1">' +
            '<cell type="module" name="./setups/wave-interference.js">' + body + '</cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].type, 'module');
        assert.strictEqual(nb.cells[0].name, './setups/wave-interference.js');
        assert.strictEqual(nb.cells[0].body, body, 'module body preserved verbatim (incl. export)');
    });

    test('module name round-trips + normalize is idempotent', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="module" name="./setups/double-slit.js">export const x = 1;</cell>' +
            '<cell type="js" lane="frqtl" id="b" out="dsRun">' +
            "import { x } from './setups/double-slit.js';\nreturn { dsRun: x };</cell>" +
            '</frqtl-notebook>';
        const nb = parse(html);
        const round = parse(serialize(nb));
        assert.deepStrictEqual(round, nb, 'module + importing js round-trip identically');
        assert.deepStrictEqual(normalize(round), round, 'normalize idempotent');
        // the serialized open tag carries the name attribute in fixed order
        assert.ok(serialize(nb).includes('<cell type="module" name="./setups/double-slit.js">'));
    });

    test('name attribute omitted for non-module cells (round-trip idempotent)', function () {
        const html = '<frqtl-notebook version="1"><cell type="js" lane="math" id="c">return {};</cell></frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].name, '', 'non-module cell has empty name');
        assert.ok(!serialize(nb).includes('name='), 'empty name omitted on serialize');
    });

    test('a module body containing import statements round-trips verbatim', function () {
        const body = "import { setupCircuitBasic } from './setupCircuitBasic.js';\n" +
            "export function setupCircuitSAT(frqtl, u, o) { return setupCircuitBasic(frqtl, u, o); }";
        const html = '<frqtl-notebook version="1">' +
            '<cell type="module" name="./setups/setupCircuitSAT.js">' + body + '</cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        assert.strictEqual(nb.cells[0].body, body);
        assert.strictEqual(parse(serialize(nb)).cells[0].body, body);
    });

});

describe('notebook format — view cell (WS-NOTEBOOK-VENDOR-VIEW Phase 2b)', function () {

    test('type="view" with realm/module/subscribe parses + round-trips', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="view" id="v1" realm="frqtl" module="./views/d3.js#render" subscribe="c-other" in="hist" produces="summary"></cell>' +
            '</frqtl-notebook>';
        const nb = parse(html);
        const cell = nb.cells[0];
        assert.strictEqual(cell.type, 'view');
        assert.strictEqual(cell.realm, 'frqtl');
        assert.strictEqual(cell.module, './views/d3.js#render');
        assert.strictEqual(cell.subscribe, 'c-other');
        assert.deepStrictEqual(cell.in, ['hist']);
        // produces folds into out (the ONE producer-discovery authority).
        assert.deepStrictEqual(cell.produces, ['summary']);
        assert.deepStrictEqual(cell.out, ['summary']);
        // round-trip is idempotent.
        const round = parse(serialize(nb));
        assert.deepStrictEqual(round, nb, 'view cell round-trips identically');
        assert.deepStrictEqual(parse(serialize(round)), round, 'view cell normalize is idempotent');
    });

    test('empty view attrs are omitted on serialize (idempotent)', function () {
        // A canvas cell carries NO realm/module/subscribe → they must not appear in the tag.
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#setup"></cell>' +
            '</frqtl-notebook>';
        const out = serialize(parse(html));
        assert.ok(out.indexOf(' module=') === -1, 'no module attr on a canvas');
        assert.ok(out.indexOf(' subscribe=') === -1, 'no subscribe attr on a canvas');
        // realm is empty here too (canvas → type-default realm); not emitted.
        assert.ok(out.indexOf(' realm=') === -1, 'no realm attr when empty');
    });

    test('view attrs serialize AFTER spec, BEFORE setup (fixed order)', function () {
        const nb = {
            title: '', version: '1',
            cells: [{
                type: 'view', lane: '', id: 'v', name: '', in: [], out: [], bind: '', spec: '',
                setup: '', shape: '', stage: '', seed: '', render3d: false, renderOptions: {}, cameraPreset: '', produces: [], produceVia: '', produceAfter: '',
                liveChart: '', liveChartKind: '', realm: 'frqtl', module: './v.js#r', subscribe: '',
                opts: {}, collapsed: false, body: ''
            }]
        };
        const out = serialize(nb);
        const realmIdx = out.indexOf('realm=');
        const moduleIdx = out.indexOf('module=');
        assert.ok(realmIdx !== -1 && moduleIdx !== -1 && realmIdx < moduleIdx, 'realm before module');
        assert.deepStrictEqual(parse(out).cells[0].module, './v.js#r');
    });
});
