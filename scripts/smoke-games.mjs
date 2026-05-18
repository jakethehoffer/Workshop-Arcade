import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "websites", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];
const categoryCounts = new Map([["All", manifest.length]]);

for (const game of manifest) {
  for (const tag of game.tags || []) {
    categoryCounts.set(tag, (categoryCounts.get(tag) || 0) + 1);
  }
}

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
  [".ogg", "audio/ogg"],
  [".webmanifest", "application/manifest+json"]
]);

function addFailure(label, message) {
  failures.push(`${label}: ${message}`);
}

function countForCategory(category) {
  return categoryCounts.get(category) || 0;
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

async function getFilterChips(page) {
  return await page.locator("#filters .chip").evaluateAll((chips) => chips.map((chip) => ({
    category: chip.dataset.category || "",
    count: Number(chip.dataset.count || Number.NaN),
    text: (chip.textContent || "").replace(/\s+/g, " ").trim(),
    active: chip.getAttribute("data-active"),
    pressed: chip.getAttribute("aria-pressed")
  })));
}

async function assertActiveCategory(page, category, label) {
  const chips = await getFilterChips(page);
  const target = chips.find((chip) => chip.category === category);
  if (!target) {
    addFailure(label, `missing active category chip for ${category}`);
    return;
  }
  if (target.active !== "true" || target.pressed !== "true") {
    addFailure(label, `category ${category} is not active after tag selection`);
  }

  for (const chip of chips) {
    if (chip.category !== category && (chip.active === "true" || chip.pressed === "true")) {
      addFailure(label, `category ${chip.category} is active while ${category} should be active`);
    }
  }
}

async function assertVisibleCardsMatchCategory(page, category, label) {
  if (category === "All" || category === "Recently") return;
  const mismatches = await page.locator(".card").evaluateAll((cards, selectedCategory) => cards
    .map((card) => ({
      title: card.querySelector(".title")?.textContent?.trim() || "unknown",
      tags: [...card.querySelectorAll(".tag")].map((tag) => tag.dataset.category || tag.textContent?.trim() || "")
    }))
    .filter((card) => !card.tags.includes(selectedCategory)), category);
  if (mismatches.length) {
    addFailure(label, `cards without ${category} tag after filtering: ${mismatches.map((card) => card.title).join(", ")}`);
  }
}

async function assertTagFilterState(page, category, label) {
  await assertActiveCategory(page, category, label);
  const modalOpen = await page.locator("#playerModal").evaluate((modal) => !modal.hidden);
  if (modalOpen) {
    addFailure(label, "card tag opened the player modal");
  }
  const visibleCount = await page.locator(".card").count();
  const expectedCount = countForCategory(category);
  if (visibleCount !== expectedCount) {
    addFailure(label, `expected ${expectedCount} cards for ${category}, found ${visibleCount}`);
  }
  await assertVisibleCardsMatchCategory(page, category, label);
}

async function checkFilterChips(page) {
  const chips = await getFilterChips(page);
  for (const [category, expectedCount] of categoryCounts) {
    const chip = chips.find((candidate) => candidate.category === category);
    if (!chip) {
      addFailure("catalog", `missing ${category} filter chip with data-category`);
      continue;
    }
    if (chip.count !== expectedCount) {
      addFailure("catalog", `${category} filter chip expected count ${expectedCount}, found ${chip.count}`);
    }
    if (!new RegExp(`(^|\\D)${expectedCount}(\\D|$)`).test(chip.text)) {
      addFailure("catalog", `${category} filter chip text is missing count ${expectedCount}: ${chip.text}`);
    }
  }
  const allChip = chips.find((chip) => chip.category === "All");
  if (!allChip || allChip.active !== "true" || allChip.pressed !== "true") {
    addFailure("catalog", "All filter chip is not active by default");
  }
}

async function checkCardTagFiltering(page) {
  const firstTag = page.locator(".card .tag").first();
  const tagMeta = await firstTag.evaluate((tag) => ({
    tagName: tag.tagName,
    type: tag.getAttribute("type"),
    category: tag.dataset.category || "",
    text: (tag.textContent || "").trim(),
    tabIndex: tag.tabIndex
  }));
  const category = tagMeta.category || tagMeta.text;

  if (tagMeta.tagName !== "BUTTON" || tagMeta.type !== "button") {
    addFailure("catalog", `card tag should be a button, found ${tagMeta.tagName.toLowerCase()}`);
  }
  if (!tagMeta.category) {
    addFailure("catalog", `card tag is missing data-category: ${tagMeta.text}`);
  }
  if (tagMeta.tabIndex < 0) {
    addFailure("catalog", `card tag is not keyboard focusable: ${tagMeta.text}`);
  }

  await firstTag.click();
  await page.waitForTimeout(100);
  await assertTagFilterState(page, category, "catalog");

  const allChip = page.locator('#filters .chip[data-category="All"]');
  if (await allChip.count()) {
    await allChip.click();
    await page.waitForTimeout(100);
    await assertActiveCategory(page, "All", "catalog");
  } else {
    addFailure("catalog", "cannot reset card-tag test because All chip is missing data-category");
  }

  const keyboardTag = page.locator(".card .tag").first();
  const keyboardCategory = await keyboardTag.evaluate((tag) => tag.dataset.category || (tag.textContent || "").trim());
  await keyboardTag.focus();
  const focused = await keyboardTag.evaluate((tag) => document.activeElement === tag);
  if (!focused) {
    addFailure("catalog", `card tag cannot receive keyboard focus: ${keyboardCategory}`);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  await assertTagFilterState(page, keyboardCategory, "catalog");
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

  await checkFilterChips(page);
  await checkCardTagFiltering(page);

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
  // Stub window.open so we capture the catalog-generated URL exactly, instead
  // of racing GitHub's unauthenticated-login redirect on a real popup.
  await page.evaluate(() => {
    window.__lastIssueUrl = null;
    window.open = (url) => {
      window.__lastIssueUrl = String(url || "");
      return { focus() {}, close() {} };
    };
  });
  await page.locator("#openIssueBtn").click();
  const issueUrl = await page.evaluate(() => window.__lastIssueUrl);
  if (!issueUrl || !issueUrl.startsWith("https://github.com/jakethehoffer/Workshop-Arcade/issues/new")) {
    addFailure("catalog", `unexpected issue URL: ${issueUrl}`);
  }
  if (!issueUrl || !issueUrl.includes("template=workshop-request.md") || !issueUrl.includes("workshop-request")) {
    addFailure("catalog", `issue URL is missing template or label: ${issueUrl}`);
  }
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
    await page.locator("#playerClose").click();
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

  const diagnostics = await page.evaluate(() => {
    const result = {
      hasRender: typeof window.render_game_to_text === "function",
      hasAdvance: typeof window.advanceTime === "function",
      parseable: false,
      textType: null,
      error: null
    };
    if (!result.hasRender) return result;
    try {
      const text = window.render_game_to_text();
      result.textType = typeof text;
      JSON.parse(String(text));
      result.parseable = true;
    } catch (error) {
      result.error = error && error.message ? error.message : String(error);
    }
    return result;
  });
  if (!diagnostics.hasRender) {
    addFailure(label, "missing render_game_to_text() diagnostic hook");
  }
  if (!diagnostics.hasAdvance) {
    addFailure(label, "missing advanceTime(ms) deterministic hook");
  }
  if (diagnostics.hasRender && (!diagnostics.parseable || diagnostics.textType !== "string")) {
    addFailure(label, `render_game_to_text() must return parseable JSON string (${diagnostics.error || diagnostics.textType})`);
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
