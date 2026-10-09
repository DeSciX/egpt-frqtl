/* Copyright 2023-2026 by Essam Abadir */

/**
 * exhibits.js — the SHOWCASE ROSTER ("Impossible things, running") and the run-once card of
 * every scene the showcase player plays.
 *
 * EXHIBITS is the ONE source for the front-page cards, the player's deep links and the player's
 * card (CEO 2026-10-03): nine rows in front-page order, each `{ kind, id, mode, title, hook, what, why }`.
 *   - `kind` is 'rung' (a walk-through rung, lib/shim/registry/walkthrough.js) or 'experiment'
 *     (a canonical experiment page, lib/shim/registry/experiments.js); `id` resolves there.
 *   - `mode` is a rung's declared mode (null for a single-mode rung and for an experiment).
 *   - `title` and `what` are the published front-page tile copy; `hook` and `why` the gallery copy.
 *     A part with no approved text is a DECLARED ABSENCE: null in the row and named in its
 *     `absent` list, validated at load. No placeholder stands in for it.
 *
 *   exhibitFor({ kind, id, modeId? }) → the roster row, or null (declared: the scene has no card)
 *   sceneKey({ kind, id, modeId? })   → the scene's run-once seen-key (the one mode normalizer)
 *   showcaseCard(row)                 → { kind, id, modeId, seenKey, title, paragraphs, is3D, absent }
 *
 * The card is the row's title, `what`, `why` (when present) and, on a 3D scene, JOYSTICK_EXPLAINER
 * (the pads themselves are CameraControls'). It never renders registry prose. The bag's
 * { seenKey, title, paragraphs } is what lib/components/run-once-card renders.
 *
 * Consumers: the SDK showcase player (sdk/frqtl-sdk/src/index.html, via the dist placement in
 * sdk/frqtl-sdk/scripts/lib-dist-placement.js), apps/frqtl_site's gallery (experiment rows), and
 * lib/shim/registry/experiments.js applyExhibitOrdering (fed the experiment rows' ids).
 *
 * WHAT IS NOT HERE: the IDE's first-contact default — a walkthrough rung declared once at
 * lib/shim/registry/walkthrough.js `FIRST_CONTACT_WALKTHROUGH_ID`.
 *
 * @module exhibits
 */

import { EXPERIMENTS, experimentById, experimentIs3D } from '../ide/registry/experiments.js';
import {
    WALKTHROUGH, walkthroughById, walkthroughModes, defaultWalkthroughModeId, walkthroughIs3D, effectiveRenderState
} from '../ide/registry/walkthrough.js';

/** The scene kinds a roster row (and a player deep link) can name. */
export const EXHIBIT_KINDS = Object.freeze(['rung', 'experiment']);

/** The card's copy parts; a row's `absent` lists the ones with no approved text. */
export const EXHIBIT_PARTS = Object.freeze(['hook', 'what', 'why']);

/** The copy parts a run-once CARD shows, in order (a subset of EXHIBIT_PARTS; the hook is not on a card). */
export const CARD_PARTS = Object.freeze(['what', 'why']);

// The authored roster, front-page order. `title` and `what` are the published front-page tile copy
// (egpt-frqtl site/index.html #proof at 5d2f019: each tile's <b> and its sentence), verbatim; this
// table is now their one owner. `hook` and `why` are the GYM rows' existing copy; absent elsewhere.
const ROSTER = [
    {
        kind: 'rung', id: "dse-tunnel-rebuild", mode: "3d",
        title: "Double slit",
        what: "Two slits, one particle at a time. Feynman's “only mystery,” with no amplitudes to add.",
    },
    {
        kind: 'rung', id: "r8-sun",
        title: "A sun",
        what: "Put light in the scene and let light do what light does. No Standard Model; god-rays from particle density.",
    },
    {
        kind: 'rung', id: "cl1d-mirror-route",
        title: "Infinite mirror",
        what: "Ten mirrors in a ring. Light walks the loop. No Fresnel equations.",
    },
    {
        kind: 'rung', id: "r5-fountain-pool",
        title: "A pool",
        what: "One source. Rings. Interference as the geometry of random walks, not a wave.",
    },
    {
        kind: 'experiment', id: "blackbody",
        title: "Blackbody",
        hook: "The Planck curve emerges from collisions — no energy quanta assumed.",
        what: "Particles in a box. The Planck curve appears; no quanta assumed.",
        why: "Classical thermodynamics (the Rayleigh-Jeans law) predicts an ultraviolet catastrophe — infinite energy at high frequencies.",
    },
    {
        kind: 'experiment', id: "circuit-sat",
        title: "Circuit SAT",
        hook: "The circuit finds its own satisfying assignment — no search algorithm runs.",
        what: "A half-adder settles on its own answer. No search algorithm runs.",
        why: "Boolean satisfiability is NP-complete — no polynomial-time algorithm is supposed to exist.",
    },
    {
        kind: 'experiment', id: "big-bang",
        title: "Big Bang",
        hook: "Structure forms from nothing — no gravity law, no cosmological constant.",
        what: "A uniform field. Filaments and voids form. No gravity law, no constant.",
        why: "Large-scale cosmic structure requires gravitational attraction tuned over 13.8 billion years.",
    },
    {
        kind: 'experiment', id: "atomic-model",
        title: "Atomic model",
        hook: "Stable orbits emerge — no electron shells, no quantum numbers.",
        what: "Particles bind and stay bound. Stable orbits without quantum numbers.",
        why: "Stable atomic orbits require quantized energy levels — continuous mechanics predicts spiral decay.",
    },
    {
        kind: 'experiment', id: 'collision-matrix-3d',
        title: "3D Collisions Lab",
        what: "Balls in a box. Contact, momentum, settling. The same engine that makes light makes mechanics; no second physics.",
    },
];

const ROW_KEYS = ['kind', 'id', 'mode', 'title', 'hook', 'what', 'why'];

function rungOrThrow(id) {
    const rung = walkthroughById(id);
    if (!rung) {
        throw new Error('[exhibits] unknown walk-through rung "' + id + '" — declared rungs: [' +
            WALKTHROUGH.map((r) => r.id).join(', ') + '].');
    }
    return rung;
}

function experimentOrThrow(id) {
    const entry = experimentById(id);
    if (!entry) {
        throw new Error('[exhibits] unknown experiment "' + id + '" — declared experiments: [' +
            EXPERIMENTS.map((e) => e.id).join(', ') + ']. Add it to lib/shim/registry/experiments.js first.');
    }
    return entry;
}

/** A rung's effective mode: the declared one (validated), or null for a single-mode rung. */
function rungMode(rung, modeId) {
    const eff = (modeId !== undefined && modeId !== null) ? modeId : defaultWalkthroughModeId(rung);
    effectiveRenderState(rung, eff);   // FAIL-LOUD on an undeclared mode (its contract)
    return walkthroughModes(rung).length > 1 ? eff : null;
}

function text(v, where) {
    if (v === undefined || v === null) { return null; }
    if (typeof v !== 'string' || v.trim() === '') {
        throw new Error('[exhibits] ' + where + ' must be non-empty text or absent (got ' + JSON.stringify(v) + ').');
    }
    return v;
}

/**
 * assertRoster — the load-time validator: every row's kind and id resolve in their registry, a
 * rung's mode is declared, an experiment carries none, no scene repeats, no unknown field, every
 * row has a title, and copy is non-empty text or absent. Exported so a test can show each refusal
 * on a planted roster. @returns the normalized, frozen rows (with `absent` and `order`).
 */
export function assertRoster(rows) {
    const seen = new Set();
    return Object.freeze(rows.map((row, order) => {
        Object.keys(row).forEach((k) => {
            if (ROW_KEYS.indexOf(k) === -1) {
                throw new Error('[exhibits] row ' + order + ' has unknown field "' + k + '" — fields: ' + ROW_KEYS.join(', ') + '.');
            }
        });
        if (EXHIBIT_KINDS.indexOf(row.kind) === -1) {
            throw new Error('[exhibits] row ' + order + ' kind ' + JSON.stringify(row.kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
        }
        let mode = null;
        if (row.kind === 'rung') {
            mode = rungMode(rungOrThrow(row.id), row.mode);
        } else {
            experimentOrThrow(row.id);
            if (row.mode !== undefined) {
                throw new Error('[exhibits] experiment row "' + row.id + '" names a mode — only a rung has modes.');
            }
        }
        const title = text(row.title, row.id + '.title');
        if (title === null) { throw new Error('[exhibits] row "' + row.id + '" has no title — every card is titled.'); }
        const key = row.kind + ':' + row.id + ':' + mode;
        if (seen.has(key)) { throw new Error('[exhibits] row ' + key + ' appears twice.'); }
        seen.add(key);
        const out = {
            kind: row.kind, id: row.id, mode, order, title,
            hook: text(row.hook, row.id + '.hook'),
            what: text(row.what, row.id + '.what'),
            why: text(row.why, row.id + '.why'),
        };
        out.absent = Object.freeze(EXHIBIT_PARTS.filter((p) => out[p] === null));
        return Object.freeze(out);
    }));
}

/** The showcase roster, validated and normalized at load. */
export const EXHIBITS = assertRoster(ROSTER);

/** The roster rows of one kind, in roster order (throws on an unknown kind). */
export function exhibitsOfKind(kind) {
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] exhibitsOfKind: unknown kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    return EXHIBITS.filter((e) => e.kind === kind);
}

/**
 * The roster row for a scene, or null when the scene is not on the roster. A null is a DECLARED
 * outcome the caller records (the player plays such a scene with no card: 'not-offered-no-roster-row').
 * The scene itself must exist: an unknown kind, id or mode throws.
 * @param {{kind: 'rung'|'experiment', id: string, modeId?: string|null}} scene
 */
export function exhibitFor(scene) {
    const kind = scene && scene.kind;
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] unknown scene kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    let mode = null;
    if (kind === 'rung') { mode = rungMode(rungOrThrow(scene.id), scene.modeId); } else { experimentOrThrow(scene.id); }
    for (let i = 0; i < EXHIBITS.length; i++) {
        const e = EXHIBITS[i];
        if (e.kind === kind && e.id === scene.id && e.mode === mode) { return e; }
    }
    return null;
}

/**
 * How the MOVE/LOOK pads work, shown on every 3D roster scene's card. The claims are
 * CameraControls.js's contract and are exercised in apps/ide/test/sdk-showcase-player.spec.js
 * (MOVE pad and W/A/S/D translate, LOOK pad and the arrow keys rotate; mouse and touch both drive
 * the pads).
 */
export const JOYSTICK_EXPLAINER = Object.freeze([
    Object.freeze([
        'Move and Look: this scene is 3D. Drag the MOVE pad (bottom left) to walk the camera forward, back ' +
        'and sideways, and the LOOK pad (bottom right) to turn it. Both pads take a finger on a phone or ' +
        'the mouse on a desktop; on a keyboard, W/A/S/D move and the arrow keys look.',
    ]),
]);

/**
 * sceneKey — the run-once seen-key of a scene: kind, id and, for a multi-mode rung, its EFFECTIVE
 * mode (the one normalizer, rungMode); never a bare id, so it cannot collide with a tab key.
 * Throws for an unknown kind, id or mode.
 * @param {{kind: 'rung'|'experiment', id: string, modeId?: string|null}} scene
 */
export function sceneKey(scene) {
    const kind = scene && scene.kind;
    if (EXHIBIT_KINDS.indexOf(kind) === -1) {
        throw new Error('[exhibits] unknown scene kind ' + JSON.stringify(kind) + ' — EXHIBIT_KINDS: ' + EXHIBIT_KINDS.join(', ') + '.');
    }
    let mode = null;
    if (kind === 'rung') { mode = rungMode(rungOrThrow(scene.id), scene.modeId); } else { experimentOrThrow(scene.id); }
    return 'scene-' + kind + '-' + scene.id + (mode ? '-' + mode : '');
}

/**
 * The run-once card of a ROSTER row: title, then `what`, then `why` when present, then the
 * JOYSTICK_EXPLAINER on a 3D scene (3D read from walkthroughIs3D / experimentIs3D). Composed from
 * the row only: no registry prose ever. The bag's { seenKey, title, paragraphs } is what
 * lib/components/run-once-card renders.
 * @param {object} row  an element of EXHIBITS (exhibitFor's answer)
 * @throws {Error} a row that is not on the roster.
 */
export function showcaseCard(row) {
    if (EXHIBITS.indexOf(row) === -1) {
        throw new Error('[exhibits] showcaseCard takes a roster row (an EXHIBITS element, e.g. exhibitFor(scene)); got ' +
            JSON.stringify(row && { kind: row.kind, id: row.id }) + '.');
    }
    const is3D = row.kind === 'rung' ? walkthroughIs3D(row.id, row.mode) : experimentIs3D(row.id);
    let paragraphs = CARD_PARTS.filter((p) => row[p] !== null).map((p) => Object.freeze([row[p]]));
    if (is3D) { paragraphs = paragraphs.concat(JOYSTICK_EXPLAINER); }
    if (paragraphs.length === 0) {
        throw new Error('[exhibits] roster row "' + row.id + '" has nothing to show: no what, no why, not 3D.');
    }
    return Object.freeze({
        kind: row.kind, id: row.id, modeId: row.mode,
        seenKey: sceneKey({ kind: row.kind, id: row.id, modeId: row.mode }),
        title: row.title,
        paragraphs: Object.freeze(paragraphs),
        is3D,
        absent: row.absent,
    });
}
