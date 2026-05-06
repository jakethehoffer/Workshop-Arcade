import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "websites", "manifest.json"), "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(repoRoot, "test-results", "render-ranking", stamp);
const shotsDir = path.join(outputRoot, "shots");
const viewports = [
  { name: "desktop", width: 1280, height: 820 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
]);

await mkdir(shotsDir, { recursive: true });

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: !process.env.HEADED });
  const records = [];

  for (const game of manifest) {
    for (const viewport of viewports) {
      records.push(await captureGame(browser, baseUrl, game, viewport));
    }
  }

  const rankedSurfaces = records
    .map((record) => ({ ...record, ranking: rankSurface(record) }))
    .sort((a, b) => b.ranking.score - a.ranking.score || a.slug.localeCompare(b.slug));

  const summary = {
    createdAt: new Date().toISOString(),
    manifestCount: manifest.length,
    outputRoot,
    records,
    rankedSurfaces: rankedSurfaces.map((record) => ({
      slug: record.slug,
      title: record.title,
      viewport: record.viewport,
      screenshot: record.screenshot,
      score: record.ranking.score,
      reasons: record.ranking.reasons,
    })),
  };

  await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeContactSheet(summary);
  await captureContactSheet(browser);

  console.log(`Captured ${records.length} rendered surfaces for ${manifest.length} games.`);
  console.log(`Output: ${outputRoot}`);
  console.log("Top ranked surfaces:");
  for (const surface of summary.rankedSurfaces.slice(0, 10)) {
    const reasonText = surface.reasons.length ? surface.reasons.join("; ") : "no automated issues";
    console.log(` - ${surface.title} ${surface.viewport}: ${surface.score} (${reasonText})`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function captureGame(browserInstance, rootUrl, game, viewport) {
  const label = `${game.slug} ${viewport.name}`;
  const page = await browserInstance.newPage({ viewport });
  const issues = {
    console: [],
    pageErrors: [],
    network: [],
  };

  observePage(page, rootUrl, label, issues);

  const screenshot = `shots/${game.slug}-${viewport.name}.png`;
  const screenshotPath = path.join(outputRoot, screenshot);
  let title = "";
  let metrics = null;
  let hasRenderText = false;
  let hasAdvance = false;
  let renderText = null;
  let renderError = null;

  try {
    await page.goto(new URL(game.url, rootUrl).href, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(900);
    title = await page.title();

    hasAdvance = await page.evaluate(() => typeof window.advanceTime === "function");
    if (hasAdvance) {
      await page.evaluate(() => window.advanceTime(500));
      await page.waitForTimeout(100);
    }

    hasRenderText = await page.evaluate(() => typeof window.render_game_to_text === "function");
    if (hasRenderText) {
      try {
        renderText = await page.evaluate(() => window.render_game_to_text());
      } catch (error) {
        renderError = error instanceof Error ? error.message : String(error);
      }
    }

    metrics = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const bodyText = (document.body?.innerText || "").trim();
      const visibleElements = Array.from(document.querySelectorAll("body *")).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = (element.innerText || element.textContent || "").trim();
        const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
        const visible = Boolean(
          rect.width > 0 &&
          rect.height > 0 &&
          intersectsViewport &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0
        );

        return {
          id: element.id || "",
          className: typeof element.className === "string" ? element.className : "",
          tag: element.tagName.toLowerCase(),
          text,
          visible,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollOverflowX: Math.ceil(element.scrollWidth - element.clientWidth),
          scrollOverflowY: Math.ceil(element.scrollHeight - element.clientHeight),
          overflowXStyle: style.overflowX,
          overflowYStyle: style.overflowY,
          fontSize: Number.parseFloat(style.fontSize || "0"),
        };
      }).filter((item) => item.visible);

      const textElements = visibleElements.filter((item) => item.text.length > 0 && item.tag !== "script" && item.tag !== "style");
      const controls = visibleElements.filter((item) =>
        ["button", "a", "input", "select", "textarea"].includes(item.tag) ||
        /\bbutton\b/i.test(item.text)
      );
      const primaryAction = controls.find((item) => /^(guess|start|play|new|resume|deal|run|begin|tap|launch|restart)\b/i.test(item.text));
      const canvases = Array.from(document.querySelectorAll("canvas")).map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          areaRatio: Number(((rect.width * rect.height) / Math.max(1, viewportWidth * viewportHeight)).toFixed(3)),
        };
      }).filter((item) => item.width > 0 && item.height > 0);
      const overflowingTextElements = textElements
        .filter((item) => {
          const scrollable = /auto|scroll/i.test(`${item.overflowXStyle} ${item.overflowYStyle}`);
          const verticalOverflow = item.scrollOverflowY > Math.max(8, item.fontSize * 0.35);
          const meaningfulText = item.text.length > 20 || /^(h[1-6]|button|input|textarea|select|a|footer|p|span|li)$/i.test(item.tag);
          return meaningfulText && !scrollable && (item.scrollOverflowX > 2 || verticalOverflow);
        })
        .slice(0, 10);

      return {
        viewportWidth,
        viewportHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        overflowX: Math.ceil(document.documentElement.scrollWidth - viewportWidth),
        bodyTextLength: bodyText.length,
        bodyTextPreview: bodyText.slice(0, 220),
        visibleElementCount: visibleElements.length,
        textElementCount: textElements.length,
        controlCount: controls.length,
        primaryAction: primaryAction
          ? { text: primaryAction.text.slice(0, 60), y: primaryAction.y, height: primaryAction.height }
          : null,
        canvasCount: canvases.length,
        largestCanvas: canvases.sort((a, b) => b.areaRatio - a.areaRatio)[0] || null,
        overflowingTextElements,
      };
    });

    await page.screenshot({ path: screenshotPath });
  } catch (error) {
    issues.pageErrors.push(error instanceof Error ? error.message : String(error));
    try {
      await page.screenshot({ path: screenshotPath });
    } catch {
      // A navigation failure can leave the page closed before a screenshot is possible.
    }
  } finally {
    await page.close();
  }

  return {
    slug: game.slug,
    title: game.title,
    url: game.url,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    screenshot,
    documentTitle: title,
    hasRenderText,
    hasAdvance,
    renderText,
    renderError,
    metrics,
    issues,
  };
}

function rankSurface(record) {
  const reasons = [];
  let score = 0;
  const metrics = record.metrics || {};
  const meaningfulOverflow = (metrics.overflowingTextElements || []).filter((item) => !isBenignTextOverflow(record, item));
  const buriedPrimaryAction =
    record.viewport === "mobile" &&
    metrics.primaryAction &&
    metrics.primaryAction.y > metrics.viewportHeight * 0.7 &&
    !isSecondaryResetAction(record);
  const hardIssueCount = record.issues.pageErrors.length + record.issues.network.length;
  const consoleIssueCount = record.issues.console.length;

  if (hardIssueCount) {
    score += 120 + hardIssueCount * 25;
    reasons.push(`${hardIssueCount} page/network issue(s)`);
  }
  if (consoleIssueCount) {
    score += 70 + consoleIssueCount * 10;
    reasons.push(`${consoleIssueCount} console issue(s)`);
  }
  if (!record.documentTitle?.trim()) {
    score += 25;
    reasons.push("missing document title");
  }
  if (!record.hasRenderText) {
    score += 35;
    reasons.push("missing render_game_to_text");
  }
  if (!record.hasAdvance) {
    score += 25;
    reasons.push("missing advanceTime");
  }
  if (record.renderError) {
    score += 30;
    reasons.push("render_game_to_text throws");
  }
  if (metrics.bodyTextLength < 20 && metrics.canvasCount === 0 && metrics.controlCount === 0) {
    score += 80;
    reasons.push("blank or non-interactive body");
  }
  if (record.viewport === "mobile" && metrics.overflowX > 2) {
    score += 75 + Math.min(50, metrics.overflowX);
    reasons.push(`mobile horizontal overflow ${metrics.overflowX}px`);
  }
  if (meaningfulOverflow.length) {
    score += 35;
    reasons.push(`${meaningfulOverflow.length} overflowing text element(s)`);
  }
  if (buriedPrimaryAction) {
    score += 30;
    reasons.push(`primary action buried at y=${metrics.primaryAction.y}`);
  }
  if (record.viewport === "mobile" && !metrics.primaryAction && metrics.bodyTextLength > 900) {
    score += 20;
    reasons.push("dense mobile text with no obvious primary action");
  }
  if (metrics.largestCanvas && metrics.largestCanvas.areaRatio < 0.22 && metrics.bodyTextLength < 350) {
    score += 20;
    reasons.push(`small primary canvas (${Math.round(metrics.largestCanvas.areaRatio * 100)}% viewport)`);
  }
  if (record.viewport === "desktop" && metrics.largestCanvas && metrics.largestCanvas.areaRatio < 0.18 && metrics.bodyTextLength < 250) {
    score += 15;
    reasons.push(`under-filled desktop canvas (${Math.round(metrics.largestCanvas.areaRatio * 100)}% viewport)`);
  }
  if (record.viewport === "mobile" && metrics.visibleElementCount > 130) {
    score += 15;
    reasons.push(`very dense mobile DOM (${metrics.visibleElementCount} visible elements)`);
  }

  return { score, reasons };
}

function parseRenderState(record) {
  if (!record.renderText || record.renderError) return null;
  try {
    return JSON.parse(record.renderText);
  } catch {
    return null;
  }
}

function isSecondaryResetAction(record) {
  const text = record.metrics?.primaryAction?.text || "";
  if (!/^play again\b/i.test(text)) return false;
  const state = parseRenderState(record);
  if (!state) return false;

  return (
    state.ready === true &&
    (state.finished === false || state.won === false || state.dialogs?.gameOver === false) &&
    state.dialogs?.gameOver !== true
  );
}

function isBenignTextOverflow(record, item) {
  if (!item) return false;
  const metrics = record.metrics || {};
  const tinyOverlayOverflow =
    metrics.overflowX === 0 &&
    item.scrollOverflowX > 0 &&
    item.scrollOverflowX <= 4 &&
    item.scrollOverflowY <= 2 &&
    item.width >= (metrics.viewportWidth || 0) - 4 &&
    item.height >= (metrics.viewportHeight || 0) - 4;

  if (tinyOverlayOverflow) return true;

  if (record.slug === "solitaire" && item.scrollOverflowX <= 2 && item.scrollOverflowY > 0 && looksLikeCardStackText(item.text)) {
    return true;
  }

  if (record.slug === "doodle-jump" && /\bmenu-card\b/.test(item.className || "") && /hidden/i.test(`${item.overflowXStyle} ${item.overflowYStyle}`)) {
    return true;
  }

  return false;
}

function looksLikeCardStackText(text = "") {
  const compact = text.replace(/\s+/g, "");
  return compact.length > 0 && compact.length <= 90 && /^[0-9JQKA\u2660-\u2666]+$/i.test(compact);
}

function observePage(page, rootUrl, label, issues) {
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    if (/favicon\.ico/i.test(text)) return;
    issues.console.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(rootUrl) || /\/favicon\.ico$/i.test(new URL(url).pathname)) return;
    if (response.status() >= 400) {
      issues.network.push(`HTTP ${response.status()} ${url}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith(rootUrl) || /\/favicon\.ico$/i.test(new URL(url).pathname)) return;
    const failure = request.failure();
    if (failure && /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure.errorText || "")) return;
    issues.network.push(`request failed: ${label}: ${url}`);
  });
}

async function writeContactSheet(summary) {
  const rows = manifest.map((game) => ({
    game,
    records: viewports.map((viewport) => summary.records.find((record) => record.slug === game.slug && record.viewport === viewport.name)),
  }));

  const topScores = new Map(summary.rankedSurfaces.map((surface) => [`${surface.slug}-${surface.viewport}`, surface]));
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Workshop Arcade Render Ranking ${escapeHtml(stamp)}</title>
<style>
  :root { color-scheme: dark; font-family: Arial, Helvetica, sans-serif; background: #071019; color: #e7eef8; }
  body { margin: 0; padding: 24px; background: #071019; }
  h1 { margin: 0 0 8px; font-size: 26px; }
  .meta { margin: 0 0 24px; color: #a9b7c7; }
  .ranking { display: grid; gap: 8px; margin: 0 0 28px; padding: 0; list-style: none; }
  .ranking li { border: 1px solid #203346; background: #0d1925; border-radius: 8px; padding: 10px 12px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 0 0 18px; break-inside: avoid; }
  .card { border: 1px solid #203346; background: #0d1925; border-radius: 8px; overflow: hidden; }
  .head { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #203346; align-items: start; }
  .name { font-weight: 700; }
  .sub { color: #a9b7c7; font-size: 12px; margin-top: 3px; }
  .score { font-weight: 700; color: #6ee7b7; white-space: nowrap; }
  .score.warn { color: #facc15; }
  .score.bad { color: #fb7185; }
  img { display: block; width: 100%; background: #020617; }
  .details { padding: 9px 12px 12px; color: #b8c5d4; font-size: 12px; line-height: 1.45; min-height: 62px; }
  code { color: #d8b4fe; }
</style>
<body>
  <h1>Workshop Arcade Render Ranking</h1>
  <p class="meta">${escapeHtml(summary.createdAt)} · ${summary.manifestCount} games · desktop 1280x820 · mobile 390x844</p>
  <ol class="ranking">
    ${summary.rankedSurfaces.slice(0, 10).map((surface) => `<li><strong>${escapeHtml(surface.title)} ${escapeHtml(surface.viewport)}</strong> · score ${surface.score}<br>${escapeHtml(surface.reasons.join("; ") || "no automated issues")}</li>`).join("\n    ")}
  </ol>
  ${rows.map(({ game, records }) => `<section class="row">
    ${records.map((record) => {
      const surface = topScores.get(`${record.slug}-${record.viewport}`);
      const scoreClass = surface.score >= 70 ? "bad" : surface.score >= 25 ? "warn" : "";
      return `<article class="card">
        <div class="head">
          <div><div class="name">${escapeHtml(game.title)} · ${escapeHtml(record.viewport)}</div><div class="sub"><code>${escapeHtml(game.slug)}</code> · ${record.width}x${record.height}</div></div>
          <div class="score ${scoreClass}">${surface.score}</div>
        </div>
        <img src="${escapeHtml(record.screenshot)}" alt="${escapeHtml(game.title)} ${escapeHtml(record.viewport)} screenshot">
        <div class="details">${escapeHtml(surface.reasons.join("; ") || "No automated issues.")}
          <br>Text ${record.metrics?.bodyTextLength ?? 0} · controls ${record.metrics?.controlCount ?? 0} · overflow ${record.metrics?.overflowX ?? "n/a"} · hooks ${record.hasRenderText ? "text" : "no text"}/${record.hasAdvance ? "time" : "no time"}
        </div>
      </article>`;
    }).join("\n    ")}
  </section>`).join("\n  ")}
</body>
</html>
`;

  await writeFile(path.join(outputRoot, "contact-sheet.html"), html);
}

async function captureContactSheet(browserInstance) {
  const page = await browserInstance.newPage({ viewport: { width: 1500, height: 1200 } });
  await page.goto(pathToFileURL(path.join(outputRoot, "contact-sheet.html")).href, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: path.join(outputRoot, "contact-sheet.png"), fullPage: true });
  await page.close();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const decoded = decodeURIComponent(url.pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(repoRoot, relative);
  const relativeToRoot = path.relative(repoRoot, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }
  return resolved;
}

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const filePath = resolveRequestPath(request.url || "/");
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      const content = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/` });
    });
  });
}
