import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "websites", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"]
]);

function addFailure(label, message) {
  failures.push(`${label}: ${message}`);
}

function isIgnoredLocalUrl(url) {
  try {
    return new URL(url).pathname === "/favicon.ico";
  } catch {
    return false;
  }
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const decoded = decodeURIComponent(url.pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(repoRoot, relative);
  if (!resolved.startsWith(repoRoot + path.sep) && resolved !== repoRoot) {
    return null;
  }
  return resolved;
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const filePath = resolveRequestPath(req.url || "/");
      if (!filePath) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const info = await stat(filePath);
      if (!info.isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const content = await readFile(filePath);
      res.writeHead(200, {
        "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "cache-control": "no-store"
      });
      res.end(content);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function observePage(page, baseUrl, label) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const locationUrl = message.location()?.url || "";
    if (/favicon\.ico/i.test(text)) return;
    if (/api\.github\.com/i.test(text) || /api\.github\.com/i.test(locationUrl)) return;
    addFailure(label, `console error: ${text}`);
  });
  page.on("pageerror", (error) => {
    addFailure(label, `page error: ${error.message}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(baseUrl) || isIgnoredLocalUrl(url)) return;
    if (response.status() >= 400) {
      addFailure(label, `HTTP ${response.status()} for ${url}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith(baseUrl) || isIgnoredLocalUrl(url)) return;
    const failure = request.failure();
    if (failure && /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure.errorText || "")) return;
    addFailure(label, `request failed: ${url}`);
  });
}

async function checkCatalog(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  observePage(page, baseUrl, "catalog");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((count) => document.querySelectorAll(".card").length === count, manifest.length);

  const cardCount = await page.locator(".card").count();
  if (cardCount !== manifest.length) {
    addFailure("catalog", `expected ${manifest.length} cards, found ${cardCount}`);
  }

  const sandbox = await page.locator("#playerFrame").getAttribute("sandbox");
  if (sandbox !== "allow-scripts allow-forms allow-pointer-lock") {
    addFailure("catalog", `unexpected player sandbox: ${sandbox}`);
  }

  await page.locator(".card .play").first().click();
  await page.waitForSelector("#playerModal:not([hidden])");
  const frameSrc = await page.locator("#playerFrame").getAttribute("src");
  if (!frameSrc || !frameSrc.startsWith("websites/")) {
    addFailure("catalog", `player iframe did not receive a game URL: ${frameSrc}`);
  }

  const externalHref = await page.locator("#playerExternalLink").evaluate((link) => link.href);
  if (!externalHref || !externalHref.startsWith("http://127.0.0.1")) {
    addFailure("catalog", `external game link is not absolute: ${externalHref}`);
  }

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("playerModal").hidden);

  await page.locator("#submitGameBtn").click();
  await page.waitForSelector("#workshopModal:not([hidden])");
  await page.locator("#workshopGoal").fill("Smoke-test the issue generation flow.");
  await page.locator("#workshopForm button[type='submit']").click();
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#openIssueBtn").click();
  const popup = await popupPromise;
  const issueUrl = popup.url();
  if (!issueUrl.startsWith("https://github.com/jakethehoffer/Workshop-Arcade/issues/new")) {
    addFailure("catalog", `unexpected issue URL: ${issueUrl}`);
  }
  if (!issueUrl.includes("template=workshop-request.md") || !issueUrl.includes("workshop-request")) {
    addFailure("catalog", `issue URL is missing template or label: ${issueUrl}`);
  }
  await popup.close();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("workshopModal").hidden);

  for (const game of manifest) {
    await page.evaluate((slug) => {
      location.hash = `play=${encodeURIComponent(slug)}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, game.slug);
    await page.waitForSelector("#playerModal:not([hidden])");
    await page.waitForTimeout(500);
    const title = await page.locator("#playerTitle").textContent();
    if (title !== game.title) {
      addFailure("catalog", `sandbox opened '${title}' for '${game.title}'`);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  }
  await page.close();
}

async function checkGame(browser, baseUrl, game, viewport, labelSuffix) {
  const label = `${game.id} ${labelSuffix}`;
  const page = await browser.newPage({ viewport });
  observePage(page, baseUrl, label);
  await page.goto(new URL(game.url, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(900);

  const title = await page.title();
  if (!title.trim()) {
    addFailure(label, "document title is empty");
  }

  const hasContent = await page.evaluate(() => {
    const textLength = (document.body?.innerText || "").trim().length;
    const interactiveCount = document.querySelectorAll("canvas,button,input,select,textarea,[role='button']").length;
    const visibleBox = document.body && document.body.getBoundingClientRect().width > 0 && document.body.getBoundingClientRect().height > 0;
    return Boolean(visibleBox && (textLength > 20 || interactiveCount > 0));
  });
  if (!hasContent) {
    addFailure(label, "page appears blank or non-interactive");
  }

  if (labelSuffix === "mobile") {
    const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (overflow > 2) {
      addFailure(label, `horizontal overflow ${overflow}px`);
    }
  }

  await page.close();
}

const { server, baseUrl } = await startServer();
let browser;
try {
  browser = await chromium.launch({ headless: !process.env.HEADED });
  await checkCatalog(browser, baseUrl);
  for (const game of manifest) {
    await checkGame(browser, baseUrl, game, { width: 1280, height: 800 }, "desktop");
    await checkGame(browser, baseUrl, game, { width: 390, height: 844, isMobile: true, hasTouch: true }, "mobile");
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error("Game smoke tests failed:");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log(`Game smoke tests passed for ${manifest.length} games.`);
