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

function recordGithubApiRequests(page, githubRequests) {
  page.on("request", (request) => {
    const url = request.url();
    if (isGitHubApiUrl(url)) githubRequests.push(url);
  });
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

async function checkCatalogProductShelves(page, githubRequests) {
  await page.waitForTimeout(300);
  if (githubRequests.length) {
    addFailure("catalog", `GitHub API was requested during startup: ${githubRequests.join(", ")}`);
  }

  if (await page.locator("#catalogDiscovery").count()) {
    addFailure("catalog", "redundant Browse shortcut strip should not appear ahead of player shelves");
  }

  const shelfRows = page.locator("#playerShelvesList .queue-row");
  if ((await shelfRows.count()) < 3) {
    addFailure("catalog", "player shelves should list daily, quick-play, and newest lanes");
    return;
  }

  const placement = await page.evaluate(() => {
    const shelves = document.querySelector(".shelves");
    const grid = document.getElementById("grid");
    const shelfRect = shelves?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      shelvesTop: shelfRect ? shelfRect.top : null,
      shelvesBottom: shelfRect ? shelfRect.bottom : null,
      gridTop: gridRect ? gridRect.top : null,
      viewportHeight: window.innerHeight,
    };
  });
  if (placement.shelvesTop === null || placement.gridTop === null) {
    addFailure("catalog", "player shelves or catalog grid missing from layout");
  } else {
    if (!(placement.shelvesTop < placement.gridTop)) {
      addFailure("catalog", `player shelves should appear before the grid, got shelvesTop=${placement.shelvesTop} gridTop=${placement.gridTop}`);
    }
    if (placement.shelvesTop >= placement.viewportHeight) {
      addFailure("catalog", `player shelves should be visible in the first viewport, top=${placement.shelvesTop} viewport=${placement.viewportHeight}`);
    }
  }

  const shelfText = await page.locator("#playerShelvesList").textContent();
  for (const label of ["Today's picks", "Quick plays", "Newest arrivals"]) {
    if (!shelfText || !shelfText.includes(label)) {
      addFailure("catalog", `player shelves missing "${label}"`);
    }
  }

  const directPicks = page.locator("#playerShelvesList [data-shelf-pick][data-slug]");
  const pickCount = await directPicks.count();
  if (pickCount < 9) {
    addFailure("catalog", `player shelves should expose direct game picks, found ${pickCount}`);
  }
  for (const shelf of ["today", "quick", "newest"]) {
    const shelfPickCount = await page.locator(`#playerShelvesList [data-shelf-pick="${shelf}"]`).count();
    if (shelfPickCount < 3) {
      addFailure("catalog", `${shelf} shelf should expose three direct game picks, found ${shelfPickCount}`);
    }
  }
  const todaySlugs = await page.locator('#playerShelvesList [data-shelf-pick="today"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slug")).filter(Boolean));
  if (todaySlugs.length !== 3 || new Set(todaySlugs).size !== todaySlugs.length) {
    addFailure("catalog", `Today shelf should expose three distinct daily picks, found: ${todaySlugs.join(", ")}`);
  }
  const firstVisitSlugs = await page.locator('#playerShelvesList [data-shelf-pick="today"], #playerShelvesList [data-shelf-pick="quick"], #playerShelvesList [data-shelf-pick="newest"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slug")).filter(Boolean));
  if (firstVisitSlugs.length >= 9 && new Set(firstVisitSlugs).size !== firstVisitSlugs.length) {
    addFailure("catalog", `first-visit player shelves repeated direct picks: ${firstVisitSlugs.join(", ")}`);
  }
  if (pickCount > 0) {
    const firstPick = directPicks.first();
    const firstPickSlug = await firstPick.getAttribute("data-slug");
    const firstPickTitle = await firstPick.locator("strong").textContent();
    await firstPick.click();
    await page.waitForSelector("#playerModal:not([hidden])");
    const playerTitle = await page.locator("#playerTitle").textContent();
    if (!firstPickTitle || playerTitle?.trim() !== firstPickTitle.trim()) {
      addFailure("catalog", `direct player shelf pick opened "${playerTitle}" instead of "${firstPickTitle}"`);
    }
    const hash = await page.evaluate(() => location.hash);
    if (!firstPickSlug || hash !== `#play=${encodeURIComponent(firstPickSlug)}`) {
      addFailure("catalog", `direct player shelf pick did not sync #play hash for ${firstPickSlug}: ${hash}`);
    }
    await page.locator("#playerClose").click();
    await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  }

  await page.locator('#playerShelvesList [data-shelf-action="today"]').click();
  await page.waitForTimeout(100);
  if (await page.locator("#sort").inputValue() !== "pop") {
    addFailure("catalog", "Today shelf did not switch to popular sort");
  }

  await page.locator('#playerShelvesList [data-shelf-action="quick"]').click();
  await page.waitForTimeout(100);
  if (await page.locator("#sort").inputValue() !== "pop") {
    addFailure("catalog", "Quick plays shelf did not switch to popular sort");
  }
  await assertTagFilterState(page, "Arcade", "catalog");

  await page.locator('#playerShelvesList [data-shelf-action="newest"]').click();
  await page.waitForTimeout(100);
  if (await page.locator("#sort").inputValue() !== "new") {
    addFailure("catalog", "Newest shelf did not restore newest sort");
  }

  if (!(await page.locator("#suggestImprovementBtn").count())) {
    addFailure("catalog", "missing quiet Suggest improvement action near player shelves");
  }
}

async function checkSessionRailHidden(page, label) {
  const rail = page.locator("#sessionRail");
  if (!(await rail.count())) {
    addFailure(label, "missing Continue playing session rail");
    return;
  }
  const hidden = await rail.evaluate((element) => element.hidden);
  if (!hidden) {
    addFailure(label, "Continue playing session rail should stay hidden without recent or favorite state");
  }
}

async function checkSessionRailPopulated(page, label, { openFirst = false } = {}) {
  const rail = page.locator("#sessionRail");
  if (!(await rail.count())) {
    addFailure(label, "missing Continue playing session rail");
    return;
  }
  const hidden = await rail.evaluate((element) => element.hidden);
  if (hidden) {
    addFailure(label, "Continue playing session rail should appear after recent/favorite state exists");
    return;
  }

  const cards = page.locator("#sessionRailList .session-rail-card");
  const count = await cards.count();
  if (count < 2 || count > 3) {
    addFailure(label, `Continue playing rail expected 2-3 actions, found ${count}`);
  }
  const text = await page.locator("#sessionRailList").textContent();
  for (const expected of ["Resume", "Saved", "Next for you"]) {
    if (!text || !text.includes(expected)) {
      addFailure(label, `Continue playing rail missing "${expected}" action`);
    }
  }
  const slots = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-session-slot")));
  if (new Set(slots).size !== slots.length) {
    addFailure(label, "Continue playing rail repeated a session slot");
  }
  const slugs = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slug")));
  if (new Set(slugs).size !== slugs.length) {
    addFailure(label, "Continue playing rail repeated a game slug");
  }

  if (openFirst && count > 0) {
    const firstTitle = await cards.first().locator("strong").textContent();
    await cards.first().click();
    await page.waitForSelector("#playerModal:not([hidden])");
    const playerTitle = await page.locator("#playerTitle").textContent();
    if (!playerTitle || playerTitle.trim() !== firstTitle?.trim()) {
      addFailure(label, `Continue playing rail opened "${playerTitle}" instead of "${firstTitle}"`);
    }
    const hash = await page.evaluate(() => location.hash);
    if (!hash.startsWith("#play=")) {
      addFailure(label, `Continue playing rail did not sync #play hash: ${hash}`);
    }
    await page.locator("#playerClose").click();
    await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  }
}

async function checkCatalogMobileFirstVisitShelves(browser, baseUrl) {
  setPhase("catalog mobile first visit", "open narrow catalog", { viewport: "mobile" });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }
  });
  observePage(page, baseUrl, "catalog mobile first visit");
  const githubRequests = [];
  recordGithubApiRequests(page, githubRequests);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((count) => document.querySelectorAll(".card").length === count, manifest.length);
  if (githubRequests.length) {
    addFailure("catalog mobile first visit", `GitHub API was requested during startup: ${githubRequests.join(", ")}`);
  }
  await checkSessionRailHidden(page, "catalog mobile first visit");
  const mobilePlacement = await page.evaluate(() => {
    const shelves = document.querySelector(".shelves");
    const grid = document.getElementById("grid");
    const shelfRect = shelves?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      shelvesTop: shelfRect ? shelfRect.top : null,
      gridTop: gridRect ? gridRect.top : null,
      viewportHeight: window.innerHeight,
    };
  });
  if (mobilePlacement.shelvesTop === null || mobilePlacement.gridTop === null) {
    addFailure("catalog mobile first visit", "player shelves or catalog grid missing from mobile layout");
  } else {
    if (!(mobilePlacement.shelvesTop < mobilePlacement.gridTop)) {
      addFailure("catalog mobile first visit", `player shelves should appear before the grid, got shelvesTop=${mobilePlacement.shelvesTop} gridTop=${mobilePlacement.gridTop}`);
    }
    if (mobilePlacement.shelvesTop >= mobilePlacement.viewportHeight) {
      addFailure("catalog mobile first visit", `player shelves should be visible in the first viewport, top=${mobilePlacement.shelvesTop} viewport=${mobilePlacement.viewportHeight}`);
    }
    if (mobilePlacement.gridTop > 1050) {
      addFailure("catalog mobile first visit", `compact player shelves should keep the grid near the first mobile viewport, got gridTop=${mobilePlacement.gridTop}`);
    }
  }
  const directPicks = page.locator("#playerShelvesList [data-shelf-pick][data-slug]");
  const pickCount = await directPicks.count();
  if (pickCount < 9) {
    addFailure("catalog mobile first visit", `player shelves should expose direct game picks, found ${pickCount}`);
  }
  const firstVisitSlugs = await page.locator('#playerShelvesList [data-shelf-pick="today"], #playerShelvesList [data-shelf-pick="quick"], #playerShelvesList [data-shelf-pick="newest"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slug")).filter(Boolean));
  if (firstVisitSlugs.length >= 9 && new Set(firstVisitSlugs).size !== firstVisitSlugs.length) {
    addFailure("catalog mobile first visit", `first-visit player shelves repeated direct picks: ${firstVisitSlugs.join(", ")}`);
  }
  if (pickCount > 0) {
    const firstPick = directPicks.first();
    const firstPickSlug = await firstPick.getAttribute("data-slug");
    const firstPickTitle = await firstPick.locator("strong").textContent();
    await firstPick.click();
    await page.waitForSelector("#playerModal:not([hidden])");
    const playerTitle = await page.locator("#playerTitle").textContent();
    if (!firstPickTitle || playerTitle?.trim() !== firstPickTitle.trim()) {
      addFailure("catalog mobile first visit", `direct player shelf pick opened "${playerTitle}" instead of "${firstPickTitle}"`);
    }
    const hash = await page.evaluate(() => location.hash);
    if (!firstPickSlug || hash !== `#play=${encodeURIComponent(firstPickSlug)}`) {
      addFailure("catalog mobile first visit", `direct player shelf pick did not sync #play hash for ${firstPickSlug}: ${hash}`);
    }
    await page.locator("#playerClose").click();
    await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  }
  const overflow = await page.evaluate(() => Math.ceil(document.documentElement.scrollWidth - document.documentElement.clientWidth));
  if (overflow > 2) {
    addFailure("catalog mobile first visit", `horizontal overflow ${overflow}px`);
  }
  await page.close();
}

async function checkCatalogMobileContainment(browser, baseUrl) {
  setPhase("catalog mobile", "open narrow catalog", { viewport: "mobile" });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }
  });
  observePage(page, baseUrl, "catalog mobile");
  const githubRequests = [];
  const requests = recordPageRequests(page);
  recordGithubApiRequests(page, githubRequests);
  await page.addInitScript(({ recentSlug, favoriteSlug }) => {
    try {
      if (window.top !== window) return;
      localStorage.setItem("workshop-arcade:recentPlays:v1", JSON.stringify([recentSlug]));
      localStorage.setItem("workshop-arcade:favorites:v1", JSON.stringify([favoriteSlug]));
    } catch {}
  }, {
    recentSlug: manifest[0]?.slug,
    favoriteSlug: manifest[1]?.slug || manifest[0]?.slug,
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((count) => document.querySelectorAll(".card").length === count, manifest.length);
  await checkCatalogFirstLoadResources(page, baseUrl, requests, githubRequests, "catalog mobile");
  await checkSessionRailPopulated(page, "catalog mobile");
  const mobilePlacement = await page.evaluate(() => {
    const rail = document.getElementById("sessionRail");
    const shelves = document.querySelector(".shelves");
    const grid = document.getElementById("grid");
    const railRect = rail?.getBoundingClientRect();
    const shelfRect = shelves?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      railBottom: railRect && !rail.hidden ? railRect.bottom : null,
      shelvesTop: shelfRect ? shelfRect.top : null,
      shelvesBottom: shelfRect ? shelfRect.bottom : null,
      gridTop: gridRect ? gridRect.top : null,
    };
  });
  if (mobilePlacement.shelvesTop === null || mobilePlacement.gridTop === null) {
    addFailure("catalog mobile", "player shelves or catalog grid missing from mobile layout");
  } else if (!(mobilePlacement.shelvesTop < mobilePlacement.gridTop)) {
    addFailure("catalog mobile", `player shelves should appear before the grid, got shelvesTop=${mobilePlacement.shelvesTop} gridTop=${mobilePlacement.gridTop}`);
  }
  if (mobilePlacement.railBottom !== null && mobilePlacement.shelvesTop !== null && mobilePlacement.railBottom > mobilePlacement.shelvesTop + 2) {
    addFailure("catalog mobile", `Continue rail should appear before player shelves, railBottom=${mobilePlacement.railBottom} shelvesTop=${mobilePlacement.shelvesTop}`);
  }

  const directPicks = page.locator("#playerShelvesList [data-shelf-pick][data-slug]");
  const pickCount = await directPicks.count();
  if (pickCount < 9) {
    addFailure("catalog mobile", `player shelves should expose direct game picks after seeded session state, found ${pickCount}`);
  }
  const todayPick = page.locator('#playerShelvesList [data-shelf-pick="today"]').first();
  if (await todayPick.count()) {
    const pickSlug = await todayPick.getAttribute("data-slug");
    const pickTitle = await todayPick.locator("strong").textContent();
    await todayPick.click();
    await page.waitForSelector("#playerModal:not([hidden])");
    const playerTitle = await page.locator("#playerTitle").textContent();
    if (!pickTitle || playerTitle?.trim() !== pickTitle.trim()) {
      addFailure("catalog mobile", `seeded direct shelf pick opened "${playerTitle}" instead of "${pickTitle}"`);
    }
    const hash = await page.evaluate(() => location.hash);
    if (!pickSlug || hash !== `#play=${encodeURIComponent(pickSlug)}`) {
      addFailure("catalog mobile", `seeded direct shelf pick did not sync #play hash for ${pickSlug}: ${hash}`);
    }
    await page.locator("#playerClose").click();
    await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  } else {
    addFailure("catalog mobile", "missing Today direct shelf pick after seeded session state");
  }

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
  recordGithubApiRequests(page, githubRequests);
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
  setPhase("catalog", "check first-visit session rail");
  await checkSessionRailHidden(page, "catalog");
  setPhase("catalog", "check player product shelves");
  await checkCatalogProductShelves(page, githubRequests);

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

  setPhase("catalog", "check player session controls");
  for (const selector of ["#playerSave", "#playerNext", "#playerMore", "#playerRelatedPanel", "#playerRelatedList"]) {
    if (!(await page.locator(selector).count())) {
      addFailure("catalog", `missing player session control ${selector}`);
    }
  }

  const initialSaveState = await page.locator("#playerSave").getAttribute("aria-pressed");
  await page.locator("#playerSave").click();
  await page.waitForTimeout(100);
  let savedState = await page.locator("#playerSave").getAttribute("aria-pressed");
  if (savedState === initialSaveState) {
    addFailure("catalog", "player Save control did not toggle aria-pressed");
  }
  if (savedState !== "true") {
    await page.locator("#playerSave").click();
    await page.waitForTimeout(100);
    savedState = await page.locator("#playerSave").getAttribute("aria-pressed");
  }
  if (savedState !== "true") {
    addFailure("catalog", "player Save control could not save the active game");
  }

  await page.locator("#playerMore").click();
  await page.waitForFunction(() => !document.getElementById("playerRelatedPanel").hidden);
  const moreExpanded = await page.locator("#playerMore").getAttribute("aria-expanded");
  if (moreExpanded !== "true") {
    addFailure("catalog", "player More control did not update aria-expanded");
  }
  const relatedCount = await page.locator("#playerRelatedList .related-game").count();
  if (relatedCount < 1 || relatedCount > 4) {
    addFailure("catalog", `related-games panel expected 1-4 choices, found ${relatedCount}`);
  }
  const currentTitle = await page.locator("#playerTitle").textContent();
  const relatedTitles = await page.locator("#playerRelatedList .related-game strong").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));
  if (relatedTitles.includes(currentTitle?.trim())) {
    addFailure("catalog", "related-games panel included the active game");
  }
  if (relatedCount > 0) {
    await page.locator("#playerRelatedList .related-game").first().click();
    await page.waitForTimeout(200);
    const relatedTitle = await page.locator("#playerTitle").textContent();
    if (!relatedTitle || relatedTitle.trim() === currentTitle?.trim()) {
      addFailure("catalog", "clicking a related game did not open a different player session");
    }
    const relatedHash = await page.evaluate(() => location.hash);
    if (!relatedHash.startsWith("#play=")) {
      addFailure("catalog", `related game did not sync #play hash: ${relatedHash}`);
    }
    const panelClosed = await page.locator("#playerRelatedPanel").evaluate((panel) => panel.hidden);
    if (!panelClosed) {
      addFailure("catalog", "related panel stayed open after launching a related game");
    }

    await page.locator("#playerNext").click();
    await page.waitForTimeout(200);
    const nextTitle = await page.locator("#playerTitle").textContent();
    if (!nextTitle || nextTitle.trim() === relatedTitle?.trim()) {
      addFailure("catalog", "player Next control did not advance to a different game");
    }
  }

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("playerModal").hidden);
  setPhase("catalog", "check populated session rail");
  await checkSessionRailPopulated(page, "catalog", { openFirst: true });

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
  await checkCatalogMobileFirstVisitShelves(browser, baseUrl);
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
