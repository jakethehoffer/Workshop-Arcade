#!/usr/bin/env node
// Browser-backed fixture coverage for the live Pages canvas evidence helper.
//
// `test:live-pages` is intentionally post-deploy-only. This focused local
// fixture keeps the multi-canvas sampling contract covered in CI without
// hitting GitHub Pages.

import { chromium } from 'playwright';
import { collectCanvasEvidence, getCanvasEvidenceFailure } from './live-canvas-evidence.mjs';

const issues = [];

function fail(message) {
  issues.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function byId(evidence, id) {
  return evidence.canvases.find((canvas) => canvas.id === id);
}

async function withFixturePage(browser, html, callback) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await callback(page);
  } finally {
    await page.close();
  }
}

async function checkMixedVisibilityAndPrimary(browser) {
  await withFixturePage(browser, `<!doctype html>
    <meta charset="utf-8">
    <style>
      canvas { display: block; width: 24px; height: 24px; margin: 2px; }
      #hidden { display: none; }
      #zero { width: 0; height: 0; }
    </style>
    <canvas id="hidden" width="20" height="20" aria-hidden="true"></canvas>
    <canvas id="zero" width="20" height="20" aria-label="Zero-size canvas"></canvas>
    <canvas id="blank" width="20" height="20" aria-label="Blank canvas"></canvas>
    <canvas id="painted" class="hero" width="32" height="24" aria-label="Painted canvas"></canvas>`,
  async (page) => {
    await page.evaluate(() => {
      const painted = document.getElementById('painted');
      const context = painted.getContext('2d');
      context.fillStyle = 'rgb(12, 84, 220)';
      context.fillRect(0, 0, painted.width, painted.height);
    });

    const evidence = await collectCanvasEvidence(page);
    assert(evidence.hasCanvas === true, 'mixed fixture: expected hasCanvas true');
    assert(evidence.canvasCount === 4, `mixed fixture: expected 4 canvases, got ${evidence.canvasCount}`);
    assert(evidence.sampledCanvasCount === 2, `mixed fixture: expected 2 sampled canvases, got ${evidence.sampledCanvasCount}`);
    assert(evidence.nonblankCanvasCount === 1, `mixed fixture: expected 1 nonblank canvas, got ${evidence.nonblankCanvasCount}`);
    assert(evidence.nonblank === true, 'mixed fixture: expected aggregate nonblank true');
    assert(evidence.width === 32 && evidence.height === 24, `mixed fixture: expected legacy dimensions from painted canvas, got ${evidence.width}x${evidence.height}`);
    assert(evidence.sampleCount === 35, `mixed fixture: expected 35 legacy samples, got ${evidence.sampleCount}`);
    assert(evidence.coloredSamples > 0, 'mixed fixture: expected colored legacy samples from painted canvas');
    assert(getCanvasEvidenceFailure(evidence) === null, `mixed fixture: unexpected failure ${getCanvasEvidenceFailure(evidence)}`);

    const hidden = byId(evidence, 'hidden');
    const zero = byId(evidence, 'zero');
    const blank = byId(evidence, 'blank');
    const painted = byId(evidence, 'painted');
    assert(hidden && hidden.visible === false && hidden.sampled === false, 'mixed fixture: hidden canvas should be recorded but ignored');
    assert(zero && zero.visible === false && zero.sampled === false, 'mixed fixture: zero-size canvas should be recorded but ignored');
    assert(blank && blank.visible === true && blank.sampled === true && blank.nonblank === false, 'mixed fixture: visible blank canvas should be sampled as blank');
    assert(painted && painted.visible === true && painted.sampled === true && painted.nonblank === true, 'mixed fixture: painted canvas should be sampled as nonblank');
    assert(painted.className === 'hero' && painted.ariaLabel === 'Painted canvas', 'mixed fixture: expected id/class/aria metadata on painted canvas');
  });
}

async function checkAllBlankVisible(browser) {
  await withFixturePage(browser, `<!doctype html>
    <meta charset="utf-8">
    <style>canvas { display: block; width: 20px; height: 20px; }</style>
    <canvas id="blank-a" width="20" height="20"></canvas>
    <canvas id="blank-b" width="20" height="20"></canvas>`,
  async (page) => {
    const evidence = await collectCanvasEvidence(page);
    assert(evidence.hasCanvas === true, 'blank fixture: expected hasCanvas true');
    assert(evidence.canvasCount === 2, `blank fixture: expected 2 canvases, got ${evidence.canvasCount}`);
    assert(evidence.sampledCanvasCount === 2, `blank fixture: expected 2 sampled canvases, got ${evidence.sampledCanvasCount}`);
    assert(evidence.nonblankCanvasCount === 0, `blank fixture: expected 0 nonblank canvases, got ${evidence.nonblankCanvasCount}`);
    assert(evidence.nonblank === false, 'blank fixture: expected aggregate nonblank false');
    assert(evidence.error === null, `blank fixture: expected no aggregate error, got ${evidence.error}`);
    assert(getCanvasEvidenceFailure(evidence) === 'canvas appears blank', `blank fixture: expected blank failure text, got ${getCanvasEvidenceFailure(evidence)}`);
  });
}

async function checkNoVisibleSampleableCanvas(browser) {
  await withFixturePage(browser, `<!doctype html>
    <meta charset="utf-8">
    <style>
      #hidden { display: none; }
      #zero { width: 0; height: 0; }
    </style>
    <canvas id="hidden" width="20" height="20"></canvas>
    <canvas id="zero" width="20" height="20"></canvas>`,
  async (page) => {
    const evidence = await collectCanvasEvidence(page);
    assert(evidence.hasCanvas === true, 'not-visible fixture: expected hasCanvas true');
    assert(evidence.canvasCount === 2, `not-visible fixture: expected 2 canvases, got ${evidence.canvasCount}`);
    assert(evidence.sampledCanvasCount === 0, `not-visible fixture: expected 0 sampled canvases, got ${evidence.sampledCanvasCount}`);
    assert(evidence.nonblank === false, 'not-visible fixture: expected aggregate nonblank false');
    assert(evidence.error === 'no visible sampleable canvas could be evaluated', `not-visible fixture: unexpected error ${evidence.error}`);
    assert(getCanvasEvidenceFailure(evidence) === 'canvas evidence failed: no visible sampleable canvas could be evaluated', `not-visible fixture: unexpected failure ${getCanvasEvidenceFailure(evidence)}`);
  });
}

async function checkNoCanvas(browser) {
  await withFixturePage(browser, '<!doctype html><meta charset="utf-8"><main>No canvas here.</main>', async (page) => {
    const evidence = await collectCanvasEvidence(page);
    assert(evidence.hasCanvas === false, 'no-canvas fixture: expected hasCanvas false');
    assert(evidence.canvasCount === 0, `no-canvas fixture: expected 0 canvases, got ${evidence.canvasCount}`);
    assert(evidence.nonblank === null, `no-canvas fixture: expected nonblank null, got ${evidence.nonblank}`);
    assert(getCanvasEvidenceFailure(evidence) === null, `no-canvas fixture: unexpected failure ${getCanvasEvidenceFailure(evidence)}`);
  });
}

let browser;
try {
  browser = await chromium.launch({ headless: !process.env.HEADED });
  await checkMixedVisibilityAndPrimary(browser);
  await checkAllBlankVisible(browser);
  await checkNoVisibleSampleableCanvas(browser);
  await checkNoCanvas(browser);
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
}

if (issues.length) {
  console.error(`Live canvas evidence fixture check failed with ${issues.length} issue${issues.length === 1 ? '' : 's'}:`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Live canvas evidence fixture check passed: multi-canvas aggregation, visibility filtering, blank/error paths, and legacy primary fields are covered.');
