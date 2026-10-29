/**
 * descix.mjs — the one way this repo's scripts run the published DeSciX CLI.
 *
 *   CLI_PACKAGE         the pinned CLI (CLAUDE.md: never a dependency, always this npx form)
 *   PROD_BANNER         the first line every call must print: the workspace's PROD origin, chosen by env.apiUrl
 *   descix(args, cwd)   → { stdout, stderr }: runs `npx -y -p <CLI_PACKAGE> descix <args>` in `cwd` (a checkout with a
 *                       PROD workspace and wallet). THROWS on a non-zero exit, or a first stderr line (where the CLI
 *                       prints its origin) that is not PROD_BANNER.
 *   jsonOf(stdout, what) → the JSON object the CLI printed after its banner, sliced from the first "{" (by shape,
 *                       never by line offset). THROWS naming `what` when there is none.
 */
import { spawnSync } from 'node:child_process';

export const CLI_PACKAGE = '@descix/cli@4.3.1';
export const PROD_BANNER = 'env: prod (.descix/workspace.json env.apiUrl) https://descix.net';

export function descix(args, cwd) {
    if (process.env.DESCIX_API_URL !== undefined) {
        throw new Error('descix: DESCIX_API_URL is set in this environment; it overrides every workspace — unset it.');
    }
    const r = spawnSync('npx', ['-y', '-p', CLI_PACKAGE, 'descix', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stderr || '') + (r.stdout || '');
    const first = (r.stderr || '').split('\n', 1)[0];   // the CLI prints its origin banner on stderr
    if (first !== PROD_BANNER) {
        throw new Error('descix ' + args[0] + ' ' + (args[1] || '') + ' (cwd ' + cwd + '): the first line is ' + JSON.stringify(first) +
            ', not the PROD banner ' + JSON.stringify(PROD_BANNER) + ' — stop: run it from the app checkout. Output: ' + out.slice(0, 2000));
    }
    if (r.status !== 0) {
        throw new Error('descix ' + args.slice(0, 2).join(' ') + ' exited ' + r.status + ': ' + out.slice(0, 4000));
    }
    return { stdout: r.stdout || '', stderr: r.stderr || '' };
}

export function jsonOf(stdout, what) {
    const at = stdout.indexOf('{');
    if (at === -1) { throw new Error(what + ': the CLI printed no JSON object: ' + stdout.slice(0, 2000)); }
    try { return JSON.parse(stdout.slice(at)); }
    catch (e) { throw new Error(what + ': the CLI output after the first "{" is not JSON (' + e.message + '): ' + stdout.slice(at, at + 2000)); }
}
