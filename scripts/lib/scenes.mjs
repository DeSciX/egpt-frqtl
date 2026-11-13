/**
 * scenes.mjs — the one owner of where this app's scenes live as media and how a scene file maps to its object.
 *
 *   APP_ID           the app the scenes are media of
 *   APP_ORIGIN       the app's public origin: its site, and its media under <origin>/assets/ (descix app media-upload)
 *   UPLOAD_PREFIX    the media prefix every scene object and the roster sit under
 *   ROSTER_FILE      the roster's one fixed name
 *   ROSTER_HREF      the roster's absolute URL: STUDIO's <link rel="frqtl-roster" href>, and normalizeRoster's href
 *   sha8Of(bytes)    the first 8 hex of the sha256 of a scene's bytes
 *   sceneObjectOf(name, bytes) → { prefix, path, url }: a scene's content-addressed object
 *   probeUrl(url)    → `url` with a one-off query: the one way this repo's scripts read a media object (a scene or the
 *                    roster). Never STUDIO's cache bucket: a script's read of the live bucket URL would cache what it
 *                    read there (the old roster, before an upload) for the bucket's lifetime.
 *   contentTypeOf(path) → the Content-Type media-upload gives the extension (handbook §9.1: .js and .mjs →
 *                    text/javascript, .json → application/json); any other extension THROWS
 */
import { createHash } from 'node:crypto';

export const APP_ID = 'egpt-frqtl';
export const APP_ORIGIN = 'https://egpt-frqtl.descix.net';
export const UPLOAD_PREFIX = 'scenes';
export const ROSTER_FILE = 'roster.json';
export const ROSTER_HREF = APP_ORIGIN + '/assets/' + UPLOAD_PREFIX + '/' + ROSTER_FILE;

export function sha8Of(bytes) {
    return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
}

export function probeUrl(url) {
    return url + '?probe=' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export function sceneObjectOf(name, bytes) {
    const prefix = UPLOAD_PREFIX + '/' + sha8Of(bytes);
    const path = prefix + '/' + name;
    return { prefix, path, url: APP_ORIGIN + '/assets/' + path };
}

const CONTENT_TYPES = Object.freeze({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' });

export function contentTypeOf(path) {
    const ext = (path.match(/\.[^./]+$/) || [''])[0];
    if (!Object.prototype.hasOwnProperty.call(CONTENT_TYPES, ext)) {
        throw new Error('contentTypeOf: ' + JSON.stringify(path) + ' — a scenes object is .js, .mjs or .json.');
    }
    return CONTENT_TYPES[ext];
}
