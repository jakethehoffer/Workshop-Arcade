import { createServer } from "node:http";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "websites", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];
const startedAt = new Date().toISOString();
const outputRoot = path.join(repoRoot, "test-results", "smoke-games", startedAt.replace(/[:.]/g, "-"));
const categoryCounts = new Map([["All", manifest.length]]);
let currentPhase = {
  label: "startup",
  game: null,
  viewport: null,
  phase: "loading manifest"
};

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

function setPhase(label, phase, extra = {}) {
  currentPhase = {
    label,
    phase,
    game: extra.game || null,
    viewport: extra.viewport || null,
  };
}

async function writeSummary() {
  await mkdir(outputRoot, { recursive: true });
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    manifestCount: manifest.length,
    failureCount: failures.length,
    passed: failures.length === 0,
    lastPhase: currentPhase,
    failures: failures.map((failure) => {
      const split = failure.indexOf(": ");
      return split === -1
        ? { label: "unknown", message: failure }
        : { label: failure.slice(0, split), message: failure.slice(split + 2) };
    }),
  };
  await writeFile(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
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
      const handle = await open(filePath, "r");
      let content;
      try {
        const info = await handle.stat();
        if (!info.isFile()) {
          res.writeHead(404).end("Not found");
          return;
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
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
    if (text.toLowerCase().includes("favicon.ico")) return;
    if (isGitHubApiUrl(locationUrl)) return;
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

function isGitHubApiUrl(value) {
  try {
    return new URL(value).hostname === "api.github.com";
  } catch {
    return false;
  }
}

function recordPageRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    requests.push({
      url: request.url(),
      resourceType: request.resourceType()
    });
  });
  return requests;
}

function localRequestPath(requestUrl, baseUrl) {
  if (!requestUrl.startsWith(baseUrl)) return null;
  const pathname = decodeURIComponent(new URL(requestUrl).pathname);
  return pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
}

function uniqueCoverRequests(requests, baseUrl) {
  const coverSet = new Set(manifest.map((game) => game.cover).filter(Boolean));
  return [...new Set(requests
    .map((request) => localRequestPath(request.url, baseUrl))
    .filter((requestPath) => requestPath && coverSet.has(requestPath)))];
}

async function currentCatalogCoverState(page) {
  return await page.locator(".card").evaluateAll((cards) => cards.map((card) => {
    const img = card.querySelector(".thumb img");
    const rect = card.getBoundingClientRect();
    const src = img?.getAttribute("src") || "";
    const lazySrc = img?.dataset.lazySrc || "";
    const rawCover = lazySrc || src;
    let cover = rawCover;
    try {
      cover = new URL(rawCover, location.href).pathname.replace(/^\/+/, "");
    } catch {
      cover = rawCover;
    }
    return {
      title: card.querySelector(".title")?.textContent?.trim() || "unknown",
      cover,
      visible: rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth,
      eager: img?.loading === "eager" || img?.getAttribute("fetchpriority") === "high",
      placeholder: src.startsWith("data:image/svg+xml")
    };
  }));
}

async function checkCatalogFirstLoadResources(page, baseUrl, requests, githubRequests, label) {
  await page.waitForTimeout(500);

  if (githubRequests.length) {
    addFailure(label, `GitHub API was requested during startup: ${githubRequests.join(", ")}`);
  }

  const initialState = await currentCatalogCoverState(page);
  const allowedInitialCovers = new Set(initialState
    .filter((cover) => cover.visible || cover.eager)
    .map((cover) => cover.cover)
    .filter(Boolean));
  const initialCoverRequests = uniqueCoverRequests(requests, baseUrl);
  const earlyBelowFoldCovers = initialCoverRequests.filter((cover) => !allowedInitialCovers.has(cover));
  if (earlyBelowFoldCovers.length) {
    addFailure(label, `below-fold covers loaded before scroll: ${earlyBelowFoldCovers.join(", ")}`);
  }

  const missingEagerCovers = initialState
    .filter((cover) => cover.eager && cover.cover && !initialCoverRequests.includes(cover.cover))
    .map((cover) => cover.cover);
  if (missingEagerCovers.length) {
    addFailure(label, `eager first-viewport covers did not request on startup: ${missingEagerCovers.join(", ")}`);
  }

  const firstDeferredCover = page.locator(".card img[data-lazy-src]").first();
  if (await firstDeferredCover.count()) {
    await firstDeferredCover.scrollIntoViewIfNeeded();
  } else {
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight));
  }
  await page.waitForTimeout(700);
  const afterScrollCoverRequests = uniqueCoverRequests(requests, baseUrl);
  const newCoverRequests = afterScrollCoverRequests.filter((cover) => !initialCoverRequests.includes(cover));
  if (newCoverRequests.length === 0 && afterScrollCoverRequests.length < manifest.length) {
    addFailure(label, "scrolling the catalog did not trigger any deferred below-fold cover requests");
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
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

async function checkDiscoveryActions(page) {
  const discovery = page.locator("#catalogDiscovery");
  if (!(await discovery.count())) {
    addFailure("catalog", "missing catalog discovery actions");
    return;
  }

  const newest = page.locator('#catalogDiscovery [data-view="new"]');
  const popular = page.locator('#catalogDiscovery [data-view="pop"]');
  if (!(await newest.count()) || !(await popular.count())) {
    addFailure("catalog", "catalog discovery is missing Newest or Popular quick view");
    return;
  }

  await popular.click();
  await page.waitForTimeout(100);
  if (await page.locator("#sort").inputValue() !== "pop") {
    addFailure("catalog", "Popular discovery action did not sync the sort dropdown");
  }

  await newest.click();
  await page.waitForTimeout(100);
  if (await page.locator("#sort").inputValue() !== "new") {
    addFailure("catalog", "Newest discovery action did not restore newest sort");
  }
}

async function installCatalogGithubApiStub(page, githubRequests) {
  await page.route("https://api.github.com/**", async (route) => {
    const url = route.request().url();
    githubRequests.push(url);
    let body = [];
    if (/\/issues\?/i.test(url)) {
      body = [{
        number: 901,
        title: "Mock workshop request",
        html_url: "https://github.com/jakethehoffer/Workshop-Arcade/issues/901",
        created_at: "2026-05-23T00:00:00Z"
      }];
    } else if (/\/commits\?/i.test(url)) {
      body = [{
        sha: "abcdef1234567890",
        html_url: "https://github.com/jakethehoffer/Workshop-Arcade/commit/abcdef1234567890",
        commit: {
          message: "Mock catalog update\n\nBody",
          author: { date: "2026-05-23T00:00:00Z" },
          committer: { date: "2026-05-23T00:00:00Z" }
        }
      }];
    }
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(body)
    });
  });
}

async function checkCatalogGithubDeferral(page, githubRequests) {
  await page.waitForTimeout(300);
  if (githubRequests.length) {
    addFailure("catalog", `GitHub API was requested during startup: ${githubRequests.join(", ")}`);
  }

  const refreshQueue = page.locator("#refreshQueueBtn");
  const loadUpdates = page.locator("#loadUpdatesBtn");
  if (!(await refreshQueue.count())) {
    addFailure("catalog", "missing Refresh Queue control for user-triggered issue loading");
    return;
  }
  if (!(await loadUpdates.count())) {
    addFailure("catalog", "missing Load Updates control for user-triggered commit loading");
    return;
  }

  await refreshQueue.click();
  await page.waitForFunction(() => (document.getElementById("queueStatus")?.textContent || "").includes("open request"));
  const issueRequests = githubRequests.filter((url) => /\/issues\?/i.test(url));
  if (issueRequests.length !== 1) {
    addFailure("catalog", `Refresh Queue should make exactly one issue API request, found ${issueRequests.length}`);
  }

  const beforeUpdates = githubRequests.length;
  await loadUpdates.click();
  await page.waitForFunction(() => (document.getElementById("updatesStatus")?.textContent || "").includes("recent update"));
  const updateRequests = githubRequests.slice(beforeUpdates).filter((url) => /\/commits\?/i.test(url));
  if (updateRequests.length !== 1) {
    addFailure("catalog", `Load Updates should make exactly one commit API request, found ${updateRequests.length}`);
  }
}

async function checkCatalogMobileContainment(browser, baseUrl) {
  setPhase("catalog mobile", "open narrow catalog", { viewport: "mobile" });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }
  });
  observePage(page, baseUrl, "catalog mobile");
  const githubRequests = [];
  const requests = recordPageRequests(page);
  await installCatalogGithubApiStub(page, githubRequests);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((count) => document.querySelectorAll(".card").length === count, manifest.length);
  await checkCatalogFirstLoadResources(page, baseUrl, requests, githubRequests, "catalog mobile");

  const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
  if (overflow > 2) {
    addFailure("catalog mobile", `horizontal overflow ${overflow}px`);
  }
  await page.close();
}

async function checkCatalog(browser, baseUrl) {
  setPhase("catalog", "open catalog");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  observePage(page, baseUrl, "catalog");
  const githubRequests = [];
  const requests = recordPageRequests(page);
  await installCatalogGithubApiStub(page, githubRequests);
  setPhase("catalog", "navigate catalog");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  setPhase("catalog", "wait for cards");
  await page.waitForFunction((count) => document.querySelectorAll(".card").length === count, manifest.length);

  const cardCount = await page.locator(".card").count();
  if (cardCount !== manifest.length) {
    addFailure("catalog", `expected ${manifest.length} cards, found ${cardCount}`);
  }

  setPhase("catalog", "check first-load resources");
  await checkCatalogFirstLoadResources(page, baseUrl, requests, githubRequests, "catalog");
  setPhase("catalog", "check filter chips");
  await checkFilterChips(page);
  setPhase("catalog", "check card tag filtering");
  await checkCardTagFiltering(page);
  setPhase("catalog", "check discovery actions");
  await checkDiscoveryActions(page);
  setPhase("catalog", "check GitHub API deferral");
  await checkCatalogGithubDeferral(page, githubRequests);

  const sandbox = await page.locator("#playerFrame").getAttribute("sandbox");
  if (sandbox !== "allow-scripts allow-forms allow-pointer-lock") {
    addFailure("catalog", `unexpected player sandbox: ${sandbox}`);
  }

  setPhase("catalog", "open first game in player");
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

  setPhase("catalog", "workshop issue URL flow");
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
    setPhase("catalog", `deep link ${game.slug}`, { game: game.slug });
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
  await checkCatalogMobileContainment(browser, baseUrl);
}

async function checkGame(browser, baseUrl, game, viewport, labelSuffix) {
  const label = `${game.id} ${labelSuffix}`;
  setPhase(label, "open page", { game: game.slug || game.id, viewport: labelSuffix });
  const page = await browser.newPage({ viewport });
  observePage(page, baseUrl, label);
  setPhase(label, "navigate page", { game: game.slug || game.id, viewport: labelSuffix });
  await page.goto(new URL(game.url, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(900);

  setPhase(label, "check title/content", { game: game.slug || game.id, viewport: labelSuffix });
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

  setPhase(label, "check diagnostics", { game: game.slug || game.id, viewport: labelSuffix });
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
    setPhase(label, "check mobile overflow", { game: game.slug || game.id, viewport: labelSuffix });
    const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (overflow > 2) {
      addFailure(label, `horizontal overflow ${overflow}px`);
    }
  }

  await page.close();
}

let server;
let baseUrl;
let browser;
try {
  setPhase("runner", "start server");
  ({ server, baseUrl } = await startServer());
  setPhase("runner", "launch browser");
  browser = await chromium.launch({ headless: !process.env.HEADED });
  await checkCatalog(browser, baseUrl);
  for (const game of manifest) {
    await checkGame(browser, baseUrl, game, { width: 1280, height: 800 }, "desktop");
    await checkGame(browser, baseUrl, game, { width: 390, height: 844, isMobile: true, hasTouch: true }, "mobile");
  }
} catch (error) {
  addFailure("runner", error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

const summary = await writeSummary();
console.log(`Smoke summary: ${path.join(outputRoot, "summary.json")}`);

if (summary.failureCount) {
  console.error("Game smoke tests failed:");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log(`Game smoke tests passed for ${manifest.length} games.`);
