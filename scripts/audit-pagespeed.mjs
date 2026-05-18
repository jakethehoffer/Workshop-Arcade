#!/usr/bin/env node
// Local Playwright-based performance + SEO + best-practices audit of the
// Workshop Arcade catalog and all manifest-listed games. Measures the
// metrics Lighthouse cares about most (paint timing, transfer weight, request
// count, console errors, meta tag completeness) without needing an external
// service or a 50MB lighthouse dep. Produces a markdown report under
// test-results/lighthouse-baseline/<ts>/report.md.
//
// Optional: set WORKSHOP_ARCADE_URL to audit a different deployment.
// Default: the live GitHub Pages site for this repo.

import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const STRICT = args.has("--ci");
const SITE = normalizeBaseUrl(process.env.WORKSHOP_ARCADE_URL || "https://jakethehoffer.github.io/Workshop-Arcade");

// Catalog grows by ~1 request + ~3-5 KB per new game cover. At the 40-game
// footprint the catalog is at 267.1 KB / 44 requests — right at the request cap
// with zero headroom, so the next new game must arrive with a refreshed budget
// here (and the docs-drift check will require matching bumps in
// docs/performance-baseline.md + ARCHITECTURE.md).
const BUDGETS = {
  Catalog: { transferKb: 280, requests: 44 },
  "Idle Tycoon": { transferKb: 225, requests: 8 },
  Lexica: { transferKb: 300, requests: 8 },
  default: { transferKb: 150, requests: 8 },
};

function fmtKb(n) { return (n / 1024).toFixed(1) + " KB"; }
function fmtMs(n) { return n == null ? "—" : Math.round(n) + " ms"; }
function status(value, thresholds) {
  if (value == null) return "—";
  const [good, ok] = thresholds;
  if (value <= good) return "🟢";
  if (value <= ok) return "🟡";
  return "🔴";
}
function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}
function targetUrl(path) {
  return SITE + path;
}
function budgetFor(label) {
  return BUDGETS[label] || BUDGETS.default;
}
function budgetSummary() {
  return [
    ["Catalog", BUDGETS.Catalog],
    ["Lexica", BUDGETS.Lexica],
    ["Idle Tycoon", BUDGETS["Idle Tycoon"]],
    ["Other manifest games", BUDGETS.default],
  ]
    .map(([label, budget]) => label + " ≤" + budget.transferKb + "KB / ≤" + budget.requests + " requests")
    .join("; ");
}
function slugifyLabel(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}
async function loadTargets() {
  const manifestPath = join(repoRoot, "websites", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!Array.isArray(manifest)) {
    throw new Error("Expected websites/manifest.json to contain an array");
  }

  return [
    { label: "Catalog", path: "/" },
    ...manifest.map((game, index) => {
      if (!game || typeof game.title !== "string" || !game.title.trim()) {
        throw new Error("Manifest entry " + index + " is missing title");
      }
      if (typeof game.url !== "string" || !game.url.trim()) {
        throw new Error("Manifest entry " + game.title + " is missing url");
      }

      const title = game.title.trim();
      const gameUrl = game.url.trim();
      return {
        label: title,
        path: "/" + gameUrl.replace(/^\/+/, ""),
      };
    }),
  ];
}
function auditIssues(result) {
  const issues = [];

  if (result.error) {
    issues.push("failed to load target: " + result.error);
    return issues;
  }

  const badResponses = result.badResponses || [];
  for (const response of badResponses) {
    issues.push("HTTP " + response.status + " from " + response.url);
  }

  for (const error of result.consoleErrors) {
    issues.push("console error: " + error);
  }
  for (const error of result.pageErrors) {
    issues.push("page error: " + error);
  }

  const meta = result.meta;
  const requiredMeta = [
    ["title", meta.hasTitle],
    ["description", meta.hasDescription],
    ["viewport", meta.hasViewport],
    ["html lang", meta.hasLang],
    ["canonical", meta.hasCanonical],
    ["og:title", meta.hasOgTitle],
    ["og:description", meta.hasOgDescription],
    ["og:image", meta.hasOgImage],
    ["og:url", meta.hasOgUrl],
    ["twitter:card", meta.hasTwitterCard],
    ["theme-color", meta.hasThemeColor],
  ];
  for (const [name, ok] of requiredMeta) {
    if (!ok) issues.push("missing " + name);
  }
  if (meta.imgWithoutAlt > 0) {
    issues.push(meta.imgWithoutAlt + " image(s) missing alt text");
  }

  const budget = budgetFor(result.label);
  const transferBudget = budget.transferKb * 1024;
  if (result.totalBytes > transferBudget) {
    issues.push("transfer " + fmtKb(result.totalBytes) + " exceeds " + budget.transferKb + " KB budget");
  }
  if (result.requestCount > budget.requests) {
    issues.push("request count " + result.requestCount + " exceeds " + budget.requests + " budget");
  }

  return issues;
}

async function auditUrl(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on("response", async (resp) => {
    try {
      const body = await resp.body();
      requests.push({ url: resp.url(), status: resp.status(), bytes: body.length, type: resp.headers()["content-type"] || "" });
    } catch {
      requests.push({ url: resp.url(), status: resp.status(), bytes: 0, type: "" });
    }
  });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => { pageErrors.push(e.message); });

  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  // give it a beat to let LCP / inline scripts settle
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint");
    const get = (name) => paint.find((p) => p.name === name)?.startTime ?? null;
    return {
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
      loadEvent: nav ? nav.loadEventEnd - nav.startTime : null,
      firstPaint: get("first-paint"),
      firstContentfulPaint: get("first-contentful-paint"),
      transferSize: nav ? nav.transferSize : null,
      encodedBodySize: nav ? nav.encodedBodySize : null,
    };
  });

  // Meta-tag completeness check (the SEO/social slice).
  const meta = await page.evaluate(() => {
    const $$ = (sel) => document.querySelectorAll(sel);
    const head = document.head;
    const pick = (sel) => head.querySelector(sel);
    return {
      hasTitle: document.title.trim().length > 0,
      hasDescription: !!pick('meta[name="description"]'),
      hasViewport: !!pick('meta[name="viewport"]'),
      hasLang: !!document.documentElement.lang,
      hasCanonical: !!pick('link[rel="canonical"]'),
      hasOgTitle: !!pick('meta[property="og:title"]'),
      hasOgDescription: !!pick('meta[property="og:description"]'),
      hasOgImage: !!pick('meta[property="og:image"]'),
      hasOgUrl: !!pick('meta[property="og:url"]'),
      hasTwitterCard: !!pick('meta[name="twitter:card"]'),
      hasThemeColor: !!pick('meta[name="theme-color"]'),
      imgWithoutAlt: Array.from($$("img")).filter((i) => !i.hasAttribute("alt")).length,
    };
  });

  await context.close();

  const totalBytes = requests.reduce((s, r) => s + r.bytes, 0);
  const sorted = [...requests].sort((a, b) => b.bytes - a.bytes);
  const largest = sorted[0];
  const badResponses = requests
    .filter((r) => r.status >= 400)
    .map((r) => ({ url: r.url, status: r.status, bytes: r.bytes, type: r.type }));

  return {
    url,
    metrics,
    meta,
    totalBytes,
    requestCount: requests.length,
    largestResource: largest ? { url: largest.url, bytes: largest.bytes, type: largest.type, status: largest.status } : null,
    badResponses,
    consoleErrors,
    pageErrors,
  };
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(repoRoot, "test-results", "lighthouse-baseline", ts);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  const targets = await loadTargets();
  for (const t of targets) {
    const url = targetUrl(t.path);
    process.stdout.write("Auditing " + t.label + " ... ");
    try {
      const r = await auditUrl(browser, url);
      console.log(
        "FCP=" + fmtMs(r.metrics.firstContentfulPaint) +
        " Load=" + fmtMs(r.metrics.loadEvent) +
        " Bytes=" + fmtKb(r.totalBytes) +
        " Requests=" + r.requestCount +
        " ConsoleErr=" + r.consoleErrors.length +
        " PageErr=" + r.pageErrors.length
      );
      await writeFile(join(outDir, slugifyLabel(t.label) + ".raw.json"), JSON.stringify(r, null, 2));
      results.push({ label: t.label, ...r });
    } catch (err) {
      console.error("FAILED:", err.message);
      results.push({ label: t.label, url, error: err.message });
    }
  }
  await browser.close();

  // Markdown report.
  const lines = [];
  lines.push("# Workshop Arcade Performance & SEO Baseline");
  lines.push("");
  lines.push("Captured " + ts + " against " + SITE + " (chromium @ 1280×800, network idle).");
  lines.push("");
  lines.push("## Headline metrics");
  lines.push("");
  lines.push("| Page | FCP | DOMContentLoaded | Load | Transfer | Requests | Errors |");
  lines.push("|------|-----|------------------|------|----------|----------|--------|");
  for (const r of results) {
    if (r.error) {
      lines.push("| " + r.label + " | error: " + r.error + " | | | | | |");
      continue;
    }
    const fcpEmoji = status(r.metrics.firstContentfulPaint, [1800, 3000]);
    const loadEmoji = status(r.metrics.loadEvent, [2500, 4000]);
    const totalEmoji = status(r.totalBytes / 1024, [200, 500]);
    lines.push(
      "| " + r.label + " | " + fcpEmoji + " " + fmtMs(r.metrics.firstContentfulPaint) +
      " | " + fmtMs(r.metrics.domContentLoaded) +
      " | " + loadEmoji + " " + fmtMs(r.metrics.loadEvent) +
      " | " + totalEmoji + " " + fmtKb(r.totalBytes) +
      " | " + r.requestCount +
      " | " + (r.consoleErrors.length + r.pageErrors.length) +
      " |"
    );
  }
  lines.push("");
  lines.push("FCP thresholds: 🟢 ≤1800ms, 🟡 ≤3000ms (Lighthouse mobile). Load: 🟢 ≤2500ms, 🟡 ≤4000ms. Transfer: 🟢 ≤200KB, 🟡 ≤500KB.");
  lines.push("CI budgets: " + budgetSummary() + ".");
  lines.push("");

  // Meta-tag completeness matrix.
  lines.push("## Meta tag completeness");
  lines.push("");
  lines.push("| Page | title | description | viewport | lang | canonical | og:title | og:desc | og:image | og:url | twitter:card | theme-color | img missing alt |");
  lines.push("|------|-------|-------------|----------|------|-----------|----------|---------|----------|--------|--------------|-------------|-----------------|");
  for (const r of results) {
    if (r.error) continue;
    const tick = (b) => b ? "✓" : "✗";
    const m = r.meta;
    lines.push("| " + r.label + " | " + tick(m.hasTitle) + " | " + tick(m.hasDescription) + " | " + tick(m.hasViewport) + " | " + tick(m.hasLang) + " | " + tick(m.hasCanonical) + " | " + tick(m.hasOgTitle) + " | " + tick(m.hasOgDescription) + " | " + tick(m.hasOgImage) + " | " + tick(m.hasOgUrl) + " | " + tick(m.hasTwitterCard) + " | " + tick(m.hasThemeColor) + " | " + m.imgWithoutAlt + " |");
  }
  lines.push("");

  // Largest resource per page (catches oversized covers / assets).
  lines.push("## Largest resource per page");
  lines.push("");
  for (const r of results) {
    if (r.error || !r.largestResource) continue;
    lines.push("- **" + r.label + "**: " + fmtKb(r.largestResource.bytes) + " — `" + r.largestResource.url.replace(SITE, "") + "` (" + (r.largestResource.type || "?") + ")");
  }
  lines.push("");

  // Error rollup.
  const errored = results.filter((r) => !r.error && (r.consoleErrors.length || r.pageErrors.length));
  if (errored.length) {
    lines.push("## Console / page errors");
    lines.push("");
    for (const r of errored) {
      lines.push("### " + r.label);
      for (const e of r.consoleErrors) lines.push("- console: " + e);
      for (const e of r.pageErrors) lines.push("- page: " + e);
      lines.push("");
    }
  } else {
    lines.push("No console or page errors across audited URLs.");
    lines.push("");
  }

  if (STRICT) {
    lines.push("## CI strict checks");
    lines.push("");
    let issueCount = 0;
    for (const r of results) {
      const issues = auditIssues(r);
      if (!issues.length) {
        lines.push("- **" + r.label + "**: passed");
        continue;
      }

      lines.push("- **" + r.label + "**:");
      for (const issue of issues) {
        lines.push("  - " + issue);
        issueCount += 1;
      }
    }
    lines.push("");

    if (issueCount > 0) {
      lines.push("CI strict audit failed with " + issueCount + " issue(s).");
      lines.push("");
    } else {
      lines.push("CI strict audit passed.");
      lines.push("");
    }
  }

  const reportPath = join(outDir, "report.md");
  await writeFile(reportPath, lines.join("\n") + "\n");
  console.log("\nReport: " + reportPath);
  console.log(lines.join("\n"));

  if (STRICT) {
    const failures = results.flatMap((r) => auditIssues(r).map((issue) => r.label + ": " + issue));
    if (failures.length) {
      console.error("\nCI strict audit failed:");
      for (const failure of failures) {
        console.error("- " + failure);
      }
      process.exit(1);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
