#!/usr/bin/env node
/**
 * Quick page capture — captures any HTML file in the repo via headless browser.
 * Usage: node capture-page.js <relative-path-from-repo-root> <output-png> [--wait=N]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const htmlPath = args.find(a => !a.startsWith('--'));
const outPath = args.find((a, i) => i > 0 && !a.startsWith('--')) || '/tmp/page_capture.png';
const waitArg = args.find(a => a.startsWith('--wait='));
const WAIT = waitArg ? parseInt(waitArg.split('=')[1], 10) : 3;
const widthArg = args.find(a => a.startsWith('--width='));
const WIDTH = widthArg ? parseInt(widthArg.split('=')[1], 10) : 1400;
const HEIGHT = 900;

const REPO_ROOT = path.resolve(__dirname, '../../../..');

if (!htmlPath) { console.error('Usage: node capture-page.js <path> [output.png] [--wait=N]'); process.exit(1); }

var mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };
var server = http.createServer(function (req, res) {
    var url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    var fp = path.join(REPO_ROOT, url);
    if (!fp.startsWith(REPO_ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, function (err, data) {
        if (err) { res.writeHead(404); res.end('Not found: ' + url); return; }
        var ext = path.extname(fp).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

(async () => {
    const puppeteer = require('puppeteer');
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    var port = server.address().port;
    var url = 'http://127.0.0.1:' + port + '/' + htmlPath;
    console.log('Loading: ' + url);

    var browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    var page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Auto-click Play if present
    await page.evaluate(() => {
        var btn = document.getElementById('btn-play') || document.querySelector('button');
        if (btn && /play/i.test(btn.textContent)) btn.click();
        if (typeof loop === 'function') try { loop(); } catch(e) {}
    });

    await new Promise(r => setTimeout(r, WAIT * 1000));
    await page.screenshot({ path: outPath, fullPage: false });
    console.log('Saved: ' + outPath);
    await browser.close();
    server.close();
})();
