#!/usr/bin/env node
// The site upload, through the published CLI in the app checkout (scripts/lib/descix.mjs refuses any first line but
// the PROD banner).
//
//   node scripts/site-upload.mjs --checkout <dir> --dry-run    prints the upload list and "Would remove from the server"
//   node scripts/site-upload.mjs --checkout <dir>              uploads; exit 0 only on the receipt's
//                                                              "Site uploaded successfully!"
//
// A failed or unconfirmed upload may still have landed (a 504 at confirm has confirmed before): measure served ==
// built (scripts/served-equals-built.mjs) before any retry.
import { resolve } from 'node:path';
import { descix } from './lib/descix.mjs';
import { APP_ID } from './lib/scenes.mjs';

const i = process.argv.indexOf('--checkout');
if (i === -1 || !process.argv[i + 1]) { console.error('usage: node scripts/site-upload.mjs --checkout <dir> [--dry-run]'); process.exit(2); }
const CHECKOUT = resolve(process.argv[i + 1]);
const DRY = process.argv.includes('--dry-run');
const SUCCESS = 'Site uploaded successfully!';

let out;
try {
    const r = descix(['site', 'upload', '-a', APP_ID, ...(DRY ? ['--dry-run'] : [])], CHECKOUT);
    out = r.stderr + r.stdout;
} catch (e) {
    console.log('FAIL  site upload' + (DRY ? ' --dry-run' : '') + ': ' + e.message);
    if (!DRY) console.log('      measure before any retry: node scripts/served-equals-built.mjs');
    process.exit(1);
}
process.stdout.write(out);
if (!DRY && !out.includes(SUCCESS)) {
    console.log('FAIL  site upload: the receipt does not end "' + SUCCESS + '" — measure served == built before any retry');
    process.exit(1);
}
