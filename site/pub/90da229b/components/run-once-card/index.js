/* Copyright 2023-2026 by Essam Abadir */

/**
 * run-once-card — the explainer a viewer sees ONCE: on first entry to a surface, dismissed by
 * Continue, never shown to that viewer again.
 *
 * Plain ESM + DOM (no React): FraqtlIde mounts it per tab, and a page with no framework can
 * mount it per scene. The content is a bag; this module owns only the card, its seen-state and
 * the record of what it decided.
 *
 *   openRunOnceCard(hostEl, { seenKey, title, paragraphs, onContinue? })
 *     → { ready: Promise<{ row, shows, detail? }>, close() }
 *   recordRunOnceNotOffered(hostEl, seenKey, row, reason) → { close() }   (a host that does not offer it)
 *
 *   paragraphs: Array<Array<string | { text, href: string|null, em?: true }>> — `em` renders the
 *   text emphasized (inside the link when it has one); a null href renders its
 *   text unlinked (a link not yet known). Text is always set as text, never parsed as HTML.
 *
 * SEEN-STATE goes through THE storage seam (lib/shim/storage getProvider(), namespace
 * RUN_ONCE_NAMESPACE). A provider may answer synchronously (localStorage) or with a promise
 * (the .vsix transport); both are awaited. Seeing the card is a convenience, so a viewer whose
 * storage is unavailable still sees it every time — a declared row of RUN_ONCE_OUTCOMES, never a
 * bare catch: the row and what failed are written on the host element
 * (data-run-once-key / data-run-once-outcome / data-run-once-detail).
 */

import { getProvider } from '../../ide/storage/index.js';

/** The storage namespace every run-once card's seen-state lives in. */
export const RUN_ONCE_NAMESPACE = 'explainers';

/** The closed table of decisions. `shows` is whether the card renders in that row. */
export const RUN_ONCE_OUTCOMES = Object.freeze([
    { id: 'shown-first-visit', shows: true,
      means: 'storage answered and holds no seen record for this key: the card shows; Continue writes the record' },
    { id: 'suppressed-seen', shows: false,
      means: 'storage holds a seen record for this key: the card does not show' },
    { id: 'storage-unavailable-shown', shows: true,
      means: 'no storage provider, or the provider threw on read or on the Continue write: the card shows and ' +
             'nothing is remembered; data-run-once-detail names what failed' },
    { id: 'not-offered-audience', shows: false, notOffered: true,
      means: 'the host does not offer this card to its audience: nothing is read, written or shown; ' +
             'data-run-once-detail names the audience (recordRunOnceNotOffered)' },
    { id: 'not-offered-no-roster-row', shows: false, notOffered: true,
      means: 'the scene has no showcase-roster row, so it has no card: nothing is read, written or shown; ' +
             'data-run-once-detail names the scene (recordRunOnceNotOffered)' },
].map(Object.freeze));

const ROWS = new Map(RUN_ONCE_OUTCOMES.map((r) => [r.id, r]));

/** The value written when a viewer dismisses a card (any stored value means "seen"). */
export function seenRecord() {
    return { seenAt: new Date().toISOString() };
}

function messageOf(e) {
    return (e && e.message) ? String(e.message) : String(e);
}

function decision(id, detail) {
    const row = ROWS.get(id);
    if (!row) { throw new Error(`run-once-card: '${id}' is not a RUN_ONCE_OUTCOMES row`); }
    return detail === undefined ? { row: id, shows: row.shows } : { row: id, shows: row.shows, detail };
}

function assertKey(seenKey) {
    if (typeof seenKey !== 'string' || seenKey === '') {
        throw new TypeError(`run-once-card: seenKey must be a non-empty string (got ${JSON.stringify(seenKey)})`);
    }
}

/**
 * Decide whether the card for `seenKey` shows, from the storage seam.
 * @param {string} seenKey
 * @returns {Promise<{row: string, shows: boolean, detail?: string}>}
 */
export async function decideRunOnce(seenKey) {
    assertKey(seenKey);
    let provider;
    try {
        provider = getProvider();
    } catch (e) {
        return decision('storage-unavailable-shown', `no storage provider: ${messageOf(e)}`);
    }
    let stored;
    try {
        stored = await provider.get(RUN_ONCE_NAMESPACE, seenKey);
    } catch (e) {
        return decision('storage-unavailable-shown', `read failed: ${messageOf(e)}`);
    }
    return (stored === null || stored === undefined) ? decision('shown-first-visit') : decision('suppressed-seen');
}

/**
 * Remember that the viewer dismissed `seenKey`. Returns the decision that now stands: the
 * caller's own when the write landed, `storage-unavailable-shown` when it could not.
 * @param {string} seenKey
 * @param {{row: string}} shown  the decision under which the card was shown
 */
export async function markRunOnceSeen(seenKey, shown) {
    assertKey(seenKey);
    if (shown.row === 'storage-unavailable-shown') { return shown; }
    try {
        await getProvider().put(RUN_ONCE_NAMESPACE, seenKey, seenRecord());
    } catch (e) {
        return decision('storage-unavailable-shown', `write failed: ${messageOf(e)}`);
    }
    return shown;
}

function record(hostEl, seenKey, d) {
    hostEl.dataset.runOnceKey = seenKey;
    hostEl.dataset.runOnceOutcome = d.row;
    if (d.detail === undefined) { delete hostEl.dataset.runOnceDetail; } else { hostEl.dataset.runOnceDetail = d.detail; }
}

function clearRecord(hostEl) {
    delete hostEl.dataset.runOnceKey;
    delete hostEl.dataset.runOnceOutcome;
    delete hostEl.dataset.runOnceDetail;
}

function assertSpec(hostEl, spec) {
    if (!hostEl || !hostEl.dataset || !hostEl.ownerDocument) {
        throw new TypeError('run-once-card: hostEl must be a DOM element');
    }
    if (!spec || typeof spec !== 'object') { throw new TypeError('run-once-card: spec bag required'); }
    assertKey(spec.seenKey);
    if (typeof spec.title !== 'string' || spec.title === '') {
        throw new TypeError(`run-once-card: title must be a non-empty string (${spec.seenKey})`);
    }
    if (!Array.isArray(spec.paragraphs) || spec.paragraphs.length === 0) {
        throw new TypeError(`run-once-card: paragraphs must be a non-empty array (${spec.seenKey})`);
    }
    spec.paragraphs.forEach((para) => {
        if (!Array.isArray(para)) { throw new TypeError(`run-once-card: a paragraph is not a segment array (${spec.seenKey})`); }
        para.forEach((seg) => {
            if (typeof seg === 'string') { return; }
            if (!seg || typeof seg.text !== 'string' || !Object.prototype.hasOwnProperty.call(seg, 'href') ||
                (seg.href !== null && typeof seg.href !== 'string') ||
                (Object.prototype.hasOwnProperty.call(seg, 'em') && seg.em !== true)) {
                throw new TypeError(`run-once-card: segment ${JSON.stringify(seg)} is neither a string nor { text, href: string|null, em?: true } (${spec.seenKey})`);
            }
        });
    });
    if (spec.onContinue !== undefined && typeof spec.onContinue !== 'function') {
        throw new TypeError(`run-once-card: onContinue must be a function when given (${spec.seenKey})`);
    }
}

function renderCard(hostEl, spec, onContinue) {
    const doc = hostEl.ownerDocument;
    const titleId = 'run-once-title-' + spec.seenKey;

    const overlay = doc.createElement('div');
    overlay.dataset.runOnceCard = spec.seenKey;
    overlay.style.cssText =
        'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
        'padding:12px;box-sizing:border-box;background:rgba(0,0,0,0.6);pointer-events:auto;';

    const panel = doc.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', titleId);
    // A column: the title and the Continue row stay put and only the text scrolls, so a card
    // longer than the screen (a phone, a long prose) still offers Continue on arrival.
    panel.style.cssText =
        'box-sizing:border-box;width:100%;max-width:560px;max-height:100%;overflow:hidden;' +
        'display:flex;flex-direction:column;' +
        'background:#15171c;color:#d8dbe0;border:1px solid #2c313a;border-radius:8px;' +
        'padding:20px 22px 16px;box-shadow:0 12px 40px rgba(0,0,0,0.5);' +
        'font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;';

    const title = doc.createElement('h2');
    title.id = titleId;
    title.textContent = spec.title;
    title.style.cssText =
        'margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8fb8ff;' +
        'flex:none;';
    panel.appendChild(title);

    const body = doc.createElement('div');
    body.style.cssText = 'flex:1 1 auto;min-height:0;overflow:auto;';
    panel.appendChild(body);

    spec.paragraphs.forEach((para) => {
        const p = doc.createElement('p');
        p.style.cssText = 'margin:0 0 12px;';
        para.forEach((seg) => {
            if (typeof seg === 'string') { p.appendChild(doc.createTextNode(seg)); return; }
            let content = doc.createTextNode(seg.text);
            if (seg.em === true) { const em = doc.createElement('em'); em.appendChild(content); content = em; }
            if (seg.href === null) { p.appendChild(content); return; }
            const a = doc.createElement('a');
            a.href = seg.href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.appendChild(content);
            a.style.cssText = 'color:#7cc4ff;';
            p.appendChild(a);
        });
        body.appendChild(p);
    });

    const row = doc.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;margin-top:4px;flex:none;';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.dataset.runOnceContinue = '';
    btn.textContent = 'Continue';
    btn.style.cssText =
        'background:#2d6cdf;color:#fff;border:0;border-radius:5px;padding:8px 18px;' +
        'font:600 13px system-ui,sans-serif;cursor:pointer;';
    btn.addEventListener('click', onContinue);
    row.appendChild(btn);
    panel.appendChild(row);

    overlay.appendChild(panel);
    hostEl.appendChild(overlay);
    btn.focus({ preventScroll: true });
    return overlay;
}

/**
 * Record that the host does not offer the card for `seenKey`: `row` is one of the RUN_ONCE_OUTCOMES
 * rows marked `notOffered` (not-offered-audience, not-offered-no-roster-row), `reason` the detail.
 * Storage is not touched. `close()` clears the record.
 *
 * @param {{dataset: object}} hostEl
 * @param {string} seenKey
 * @param {string} row     a notOffered row id
 * @param {string} reason  e.g. 'audience internal'
 * @returns {{close: function}}
 */
export function recordRunOnceNotOffered(hostEl, seenKey, row, reason) {
    if (!hostEl || !hostEl.dataset) { throw new TypeError('run-once-card: hostEl must be a DOM element'); }
    assertKey(seenKey);
    const r = ROWS.get(row);
    if (!r || r.notOffered !== true) {
        throw new Error(`run-once-card: recordRunOnceNotOffered row ${JSON.stringify(row)} is not a not-offered row — ` +
            RUN_ONCE_OUTCOMES.filter((x) => x.notOffered).map((x) => x.id).join(', ') + '.');
    }
    if (typeof reason !== 'string' || reason === '') {
        throw new TypeError(`run-once-card: recordRunOnceNotOffered needs a non-empty reason (${seenKey})`);
    }
    record(hostEl, seenKey, decision(row, reason));
    return { close() { clearRecord(hostEl); } };
}

/**
 * Decide, record, and (when the row shows) render the card into `hostEl`. `hostEl` is the
 * positioned box the card covers. `close()` removes the card WITHOUT remembering it (the viewer
 * left without dismissing) and clears the record; it also cancels a decision still pending.
 *
 * @param {HTMLElement} hostEl
 * @param {{seenKey: string, title: string, paragraphs: Array, onContinue?: function}} spec
 * @returns {{ready: Promise<{row: string, shows: boolean, detail?: string}>, close: function}}
 */
export function openRunOnceCard(hostEl, spec) {
    assertSpec(hostEl, spec);
    let closed = false;
    let cardEl = null;

    function remove() {
        if (cardEl && cardEl.parentNode) { cardEl.parentNode.removeChild(cardEl); }
        cardEl = null;
    }

    const ready = decideRunOnce(spec.seenKey).then((shown) => {
        if (closed) { return shown; }
        record(hostEl, spec.seenKey, shown);
        if (!shown.shows) { return shown; }
        cardEl = renderCard(hostEl, spec, () => {
            remove();
            markRunOnceSeen(spec.seenKey, shown).then((now) => {
                if (!closed) { record(hostEl, spec.seenKey, now); }
            });
            if (spec.onContinue) { spec.onContinue(); }
        });
        return shown;
    });

    return {
        ready,
        close() {
            closed = true;
            remove();
            clearRecord(hostEl);
        },
    };
}
