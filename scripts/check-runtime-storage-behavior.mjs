#!/usr/bin/env node
// Browser-backed storage fallback probe.
//
// Sandboxed game iframes run with opaque origins, so their localStorage getter
// can throw before gameplay code has a chance to save settings or scores.
// workshop-runtime.js patches in an in-memory Storage-compatible fallback.
// This probe proves that the fallback actually behaves inside the same
// `sandbox="allow-scripts"` shape the catalog player uses.

import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);
const issues = [];

function fail(message) {
  issues.push(message);
}

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(repoRoot, relative);
  return target.startsWith(repoRoot) ? target : null;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const filePath = resolveRequestPath(request.url || '/');
      if (!filePath) {
        response.writeHead(404).end('Not found');
        return;
      }
      const handle = await open(filePath, 'r');
      let content;
      try {
        if (!(await handle.stat()).isFile()) {
          response.writeHead(404).end('Not found');
          return;
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });

  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}/` };
}

let server;
let browser;
try {
  const started = await startServer();
  server = started.server;
  const baseUrl = started.baseUrl;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => fail(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') fail(`console error: ${message.text()}`);
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate((url) => {
    const iframe = document.createElement('iframe');
    iframe.id = 'storageProbeFrame';
    iframe.sandbox = 'allow-scripts';
    iframe.src = url;
    document.body.appendChild(iframe);
  }, new URL('websites/echo-mimic.html', baseUrl).href);

  const frameHandle = await page.locator('#storageProbeFrame').elementHandle();
  const frame = await frameHandle?.contentFrame();
  if (!frame) {
    fail('opaque sandbox frame did not load');
  } else {
    await frame.waitForFunction(() => typeof window.render_game_to_text === 'function');
    const result = await frame.evaluate(() => {
      const storage = window.localStorage;
      storage.clear();
      storage.setItem('alpha', 42);
      storage.setItem('beta', 'ok');
      const beforeRemove = {
        length: storage.length,
        alpha: storage.getItem('alpha'),
        key0: storage.key(0),
        missing: storage.getItem('missing'),
      };
      storage.removeItem('alpha');
      const afterRemove = {
        length: storage.length,
        alpha: storage.getItem('alpha'),
        beta: storage.getItem('beta'),
      };
      storage.clear();
      return {
        beforeRemove,
        afterRemove,
        clearedLength: storage.length,
        diagnosticType: typeof window.render_game_to_text(),
      };
    });

    if (result.beforeRemove.length !== 2 || result.beforeRemove.alpha !== '42') {
      fail(`set/get fallback mismatch: ${JSON.stringify(result.beforeRemove)}`);
    }
    if (result.beforeRemove.missing !== null || typeof result.beforeRemove.key0 !== 'string') {
      fail(`Storage-compatible missing/key fallback mismatch: ${JSON.stringify(result.beforeRemove)}`);
    }
    if (result.afterRemove.length !== 1 || result.afterRemove.alpha !== null || result.afterRemove.beta !== 'ok') {
      fail(`remove fallback mismatch: ${JSON.stringify(result.afterRemove)}`);
    }
    if (result.clearedLength !== 0 || result.diagnosticType !== 'string') {
      fail(`clear or diagnostic fallback mismatch: ${JSON.stringify(result)}`);
    }
  }
  await page.close();
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (issues.length) {
  console.error(`Runtime storage behavior check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Runtime storage behavior check passed inside an opaque sandboxed game frame.');
