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
      interaction: record.interaction
        ? {
            name: record.interaction.name,
            eventScreenshot: record.interaction.eventScreenshot,
            screenshot: record.interaction.screenshot,
            score: record.interaction.score,
            changed: record.interaction.changed,
            eventSignals: record.interaction.eventSignals,
            signals: record.interaction.signals,
            feedbackActive: record.interaction.feedbackActive,
            reasons: record.interaction.reasons,
          }
        : null,
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
  let interaction = null;

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
    interaction = await runInteraction(page, game, viewport, renderText, issues);
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
    interaction,
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
  const interaction = record.interaction;

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
  if (!interaction) {
    score += 20;
    reasons.push("missing interaction recipe");
  } else if (interaction.score > 0) {
    score += interaction.score;
    reasons.push(...interaction.reasons);
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

async function runInteraction(page, game, viewport, preRenderText, issues) {
  const recipe = getInteractionRecipe(game.slug);
  const eventScreenshot = `shots/${game.slug}-${viewport.name}-event.png`;
  const eventScreenshotPath = path.join(outputRoot, eventScreenshot);
  const screenshot = `shots/${game.slug}-${viewport.name}-after.png`;
  const screenshotPath = path.join(outputRoot, screenshot);
  const issueStart = snapshotIssues(issues);
  const preState = parseRenderText(preRenderText);
  let eventRenderText = null;
  let eventState = null;
  let eventSignals = [];
  let feedbackActive = { active: false, keys: [] };
  let postRenderText = null;
  let postState = null;
  let error = null;
  let hasRenderText = false;

  try {
    if (!recipe) {
      throw new Error(`No interaction recipe for ${game.slug}`);
    }

    await recipe.run(page, { game, viewport, preState });
    hasRenderText = await page.evaluate(() => typeof window.render_game_to_text === "function");
    if (hasRenderText) {
      eventRenderText = await page.evaluate(() => window.render_game_to_text());
      eventState = parseRenderText(eventRenderText);
      eventSignals = summarizeStateChange(preState, eventState);
      feedbackActive = extractFeedbackActive(eventState);
    }

    await page.screenshot({ path: eventScreenshotPath });
    await settlePage(page, recipe.settleMs ?? 350);

    if (hasRenderText) {
      postRenderText = await page.evaluate(() => window.render_game_to_text());
      postState = parseRenderText(postRenderText);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  try {
    await page.screenshot({ path: screenshotPath });
  } catch (caught) {
    if (!error) error = caught instanceof Error ? caught.message : String(caught);
  }

  const newIssues = diffIssues(issues, issueStart);
  const signals = summarizeStateChange(preState, postState);
  const scoreResult = scoreInteraction({
    recipe,
    error,
    hasRenderText,
    preState,
    eventState,
    postState,
    eventSignals,
    signals,
    feedbackActive,
    issues: newIssues,
  });

  return {
    name: recipe?.name || "missing recipe",
    available: Boolean(recipe),
    eventScreenshot,
    screenshot,
    preState,
    eventState,
    postState,
    preRenderText,
    eventRenderText,
    postRenderText,
    changed: signals.length > 0,
    eventSignals,
    signals,
    feedbackActive,
    issues: newIssues,
    error,
    score: scoreResult.score,
    reasons: scoreResult.reasons,
  };
}

function getInteractionRecipe(slug) {
  const recipes = {
    "brick-breaker": {
      name: "start and launch ball",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startGameBtn");
        await pressAndAdvance(page, "Space", 900);
        await holdKeyAdvance(page, "ArrowRight", 450);
      },
    },
    checkers: {
      name: "make opening checker move",
      run: async (page) => {
        await clickBoardDomCell(page, 5, 0);
        await settlePage(page, 80);
        await clickBoardDomCell(page, 4, 1);
        await settlePage(page, 700);
      },
    },
    "2048": {
      name: "slide tiles",
      run: async (page) => {
        await pressAndAdvance(page, "ArrowLeft", 120);
        await pressAndAdvance(page, "ArrowUp", 120);
        await pressAndAdvance(page, "ArrowRight", 240);
      },
    },
    chess: {
      name: "play e2 to e4",
      run: async (page) => {
        await clickChessSquare(page, "e2");
        await settlePage(page, 90);
        await clickChessSquare(page, "e4");
        await settlePage(page, 450);
      },
    },
    "doodle-jump": {
      name: "start and steer",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await pressAndAdvance(page, "ArrowRight", 40);
      },
    },
    "flappy-bird": {
      name: "start and flap",
      expectsStart: true,
      settleMs: 120,
      run: async (page) => {
        await pressAndAdvance(page, "Space", 60);
      },
    },
    snake: {
      name: "start and turn",
      expectsStart: true,
      run: async (page) => {
        await pressAndAdvance(page, "Space", 200);
        await pressAndAdvance(page, "ArrowDown", 180);
      },
    },
    tetris: {
      name: "start, rotate, and drop",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#playBtn");
        await pressAndAdvance(page, "ArrowLeft", 80);
        await pressAndAdvance(page, "ArrowUp", 80);
        await pressAndAdvance(page, "Space", 450);
      },
    },
    "maze-chase": {
      name: "start and move",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#start-btn");
        await holdKeyAdvance(page, "ArrowLeft", 900);
        await holdKeyAdvance(page, "ArrowUp", 700);
      },
    },
    "memory-match": {
      name: "flip a matching pair",
      run: async (page) => {
        // Find the first matching pair from the live deck, click them in order.
        const pair = await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function") return null;
          const snap = JSON.parse(window.render_game_to_text());
          const byIcon = {};
          for (const c of snap.cards) {
            (byIcon[c.icon] = byIcon[c.icon] || []).push(c.id);
          }
          const found = Object.values(byIcon).find((ids) => ids.length >= 2);
          return found ? [found[0], found[1]] : null;
        });
        if (pair) {
          await clickSelectorIfVisible(page, `button[data-id="${pair[0]}"]`);
          await settlePage(page, 150);
          await clickSelectorIfVisible(page, `button[data-id="${pair[1]}"]`);
        }
        await settlePage(page, 250);
      },
    },
    minesweeper: {
      name: "reveal a center cell",
      run: async (page) => {
        await clickCanvasAt(page, "#game", 0.5, 0.55);
        await settlePage(page, 250);
      },
    },
    "reflex-spark": {
      name: "arm a round and tap on green",
      run: async (page) => {
        // First tap starts the round (waiting phase).
        await clickSelectorIfVisible(page, "#stage");
        await settlePage(page, 120);
        // Skip the random wait period deterministically via advanceTime so the
        // stage transitions to the green "ready" state without real-time waiting.
        await page.evaluate(() => { if (typeof window.advanceTime === "function") window.advanceTime(4500); });
        await settlePage(page, 60);
        // Second tap measures the reaction.
        await clickSelectorIfVisible(page, "#stage");
        await settlePage(page, 200);
      },
    },
    solitaire: {
      name: "draw from stock",
      run: async (page) => {
        await clickSelectorIfVisible(page, "#stock");
        await settlePage(page, 250);
      },
    },
    wordle: {
      name: "enter a guess prefix",
      run: async (page) => {
        await page.keyboard.type("arise", { delay: 15 });
        await settlePage(page, 250);
      },
    },
    "shape-inlay": {
      name: "start and steer",
      expectsStart: true,
      settleMs: 140,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await holdKeyAdvance(page, "ArrowRight", 80);
      },
    },
    "idle-tycoon": {
      name: "select slot and click earn",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, ".slot-card");
        await settlePage(page, 250);
        await clickSelectorIfVisible(page, "#clicker");
        await settlePage(page, 550);
      },
    },
    "metro-dash": {
      name: "start and dodge",
      expectsStart: true,
      settleMs: 140,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await pressAndAdvance(page, "ArrowRight", 100);
        await pressAndAdvance(page, "ArrowUp", 80);
      },
    },
    arena: {
      name: "start and move",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await holdKeyAdvance(page, "ArrowRight", 120);
        await holdKeyAdvance(page, "ArrowDown", 80);
      },
    },
    "hero-fact-match": {
      name: "request another clue",
      run: async (page) => {
        await clickSelectorIfVisible(page, "#hintBtn");
        await settlePage(page, 200);
      },
    },
    "night-shift-fact-match": {
      name: "request another clue",
      run: async (page) => {
        await clickSelectorIfVisible(page, "#hintBtn");
        await settlePage(page, 200);
      },
    },
    "arena-legend-guesser": {
      name: "request another clue",
      run: async (page) => {
        await clickSelectorIfVisible(page, "#hintBtn");
        await settlePage(page, 200);
      },
    },
    "cosmic-fact-match": {
      name: "request another clue",
      run: async (page) => {
        await clickSelectorIfVisible(page, "#hintBtn");
        await settlePage(page, 200);
      },
    },
  };

  return recipes[slug] || null;
}

function scoreInteraction({ recipe, error, hasRenderText, preState, eventState, postState, eventSignals, signals, feedbackActive, issues }) {
  const reasons = [];
  let score = 0;
  const hardIssueCount = issues.pageErrors.length + issues.network.length;
  const consoleIssueCount = issues.console.length;

  if (!recipe) {
    return { score: 20, reasons: ["missing interaction recipe"] };
  }
  if (hardIssueCount) {
    score += 120 + hardIssueCount * 25;
    reasons.push(`${hardIssueCount} interaction page/network issue(s)`);
  }
  if (consoleIssueCount) {
    score += 70 + consoleIssueCount * 10;
    reasons.push(`${consoleIssueCount} interaction console issue(s)`);
  }
  if (error) {
    score += 80;
    reasons.push(`interaction failed: ${error}`);
  }
  if (!hasRenderText || !postState) {
    score += 35;
    reasons.push("missing post-action render state");
  }
  if (preState && postState && signals.length === 0) {
    score += 45;
    reasons.push("no state change after action");
  }
  if (preState && eventState && eventSignals.length === 0 && signals.length > 0) {
    score += 10;
    reasons.push("event frame has no immediate state change");
  }
  if (eventSignals.length > 0 && recipe.expectsFeedback !== false && !feedbackActive.active) {
    score += 8;
    reasons.push("event frame lacks feedback diagnostic signal");
  }
  if (recipe.expectsStart && postState && isGameOverLike(postState)) {
    score += 35;
    reasons.push("post-action reached game-over state");
  }
  if (recipe.expectsStart && postState && isStillMenuLike(postState)) {
    score += 35;
    reasons.push("post-action still menu or ready state");
  }

  return { score, reasons };
}

function extractFeedbackActive(state) {
  if (!state || typeof state !== "object") return { active: false, keys: [] };

  const keys = [];
  const roots = [];
  if (state.feedback && typeof state.feedback === "object") roots.push(["feedback", state.feedback]);
  for (const rootKey of ["effects", "particles", "rings", "pops", "popups", "animations", "lastMove", "moveFeedback"]) {
    if (state[rootKey] !== undefined) roots.push([rootKey, state[rootKey]]);
  }

  for (const [rootKey, root] of roots) {
    collectFeedbackSignals(root, rootKey, keys);
  }

  return { active: keys.length > 0, keys: Array.from(new Set(keys)).slice(0, 12) };
}

function collectFeedbackSignals(value, pathKey, keys) {
  if (value === null || value === undefined || keys.length >= 20) return;
  if (typeof value === "number") {
    const path = pathKey.toLowerCase();
    const isAge = /age$/.test(path);
    const isTransient = /(particle|popup|pop|ring|flash|shake|pulse|trail|burst|spark|cue|glow|active|count|last)/i.test(pathKey);
    if ((isAge && value >= 0 && value <= 1.25) || (!isAge && isTransient && value > 0)) {
      keys.push(pathKey);
    }
    return;
  }
  if (typeof value === "boolean") {
    if (value && /(feedback|active|flash|shake|pulse|cue|glow)/i.test(pathKey)) keys.push(pathKey);
    return;
  }
  if (typeof value === "string") {
    if (value && /(feedback|last|move|capture|check|promo|king|type|label)/i.test(pathKey)) keys.push(pathKey);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && /(effect|particle|ring|pop|animation|trail|last|feedback|move)/i.test(pathKey)) keys.push(`${pathKey}.length`);
    value.slice(0, 4).forEach((item, index) => collectFeedbackSignals(item, `${pathKey}[${index}]`, keys));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectFeedbackSignals(child, `${pathKey}.${key}`, keys);
      if (keys.length >= 20) return;
    }
  }
}

function isGameOverLike(state) {
  const mode = String(state.mode || state.state || state.phase || state.status || "").toLowerCase();
  return state.gameOver === true || /game[- ]?over|crashed|dead|lost/.test(mode);
}

function isStillMenuLike(state) {
  const mode = String(state.mode || state.state || state.phase || state.status || "").toLowerCase();
  const runningLike =
    state.running === true ||
    state.started === true ||
    state.gameStarted === true ||
    state.playing === true ||
    mode === "playing" ||
    mode === "running" ||
    mode === "play";

  if (runningLike) return false;
  return /menu|title|ready|press .*start|start/.test(mode);
}

function summarizeStateChange(before, after) {
  if (!before || !after) return [];
  const beforeFlat = flattenState(before);
  const afterFlat = flattenState(after);
  const paths = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]))
    .filter((pathKey) => !isNoisyStatePath(pathKey))
    .filter((pathKey) => beforeFlat[pathKey] !== afterFlat[pathKey]);

  const important = paths.filter(isImportantStatePath);
  const selected = (important.length ? important : paths).slice(0, 14);
  return selected.map((pathKey) => ({
    path: pathKey,
    before: beforeFlat[pathKey] ?? null,
    after: afterFlat[pathKey] ?? null,
  }));
}

function flattenState(value, prefix = "", out = {}) {
  if (value === null || typeof value !== "object") {
    out[prefix || "value"] = normalizeStateValue(value);
    return out;
  }

  if (Array.isArray(value)) {
    out[`${prefix}.length`] = value.length;
    if (value.length <= 8 && value.every((item) => item === null || typeof item !== "object")) {
      out[prefix] = normalizeStateValue(value);
    } else {
      value.slice(0, 5).forEach((item, index) => {
        flattenState(item, `${prefix}[${index}]`, out);
      });
    }
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    flattenState(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function normalizeStateValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  return JSON.stringify(value);
}

function isNoisyStatePath(pathKey) {
  return /(^|\.)(frames|time|timeText|timer|timers|lastAction|highScore|best|newBestThisRun|audioReady|musicOn|sound|muted|sfx|settings|event|surge|bankCount|visibleElementCount)(\.|$)/i.test(pathKey);
}

function isImportantStatePath(pathKey) {
  return /(mode|state|phase|running|started|gameStarted|gameOver|won|score|distance|moves|turn|moveCount|stockCount|wasteCount|revealedCount|flagsPlaced|pelletsRemaining|player|bird|ball|head|current|hold|next|occupied|cash|lifetime|cluesShown|streak|result|selected|grid|tiles|pipes|obstacles|platforms|enemies|coins|bodyLength|food|tableau|foundation|currentGuess|rows|lane|action|x|y|velocity)/i.test(pathKey);
}

function parseRenderText(renderText) {
  if (!renderText) return null;
  try {
    return JSON.parse(renderText);
  } catch {
    return { text: String(renderText).slice(0, 500) };
  }
}

function snapshotIssues(issues) {
  return {
    console: issues.console.length,
    pageErrors: issues.pageErrors.length,
    network: issues.network.length,
  };
}

function diffIssues(issues, start) {
  return {
    console: issues.console.slice(start.console),
    pageErrors: issues.pageErrors.slice(start.pageErrors),
    network: issues.network.slice(start.network),
  };
}

async function pressAndAdvance(page, key, ms = 100) {
  await page.keyboard.press(key);
  await settlePage(page, ms);
}

async function holdKeyAdvance(page, key, ms = 300) {
  await page.keyboard.down(key);
  await settlePage(page, ms);
  await page.keyboard.up(key);
  await settlePage(page, 60);
}

async function settlePage(page, ms = 0) {
  const waitMs = Math.max(0, Math.min(2500, Number(ms) || 0));
  const hasAdvance = await page.evaluate(() => typeof window.advanceTime === "function").catch(() => false);
  if (hasAdvance) {
    await page.evaluate((amount) => window.advanceTime(amount), waitMs).catch(() => {});
  }
  await page.waitForTimeout(Math.min(350, waitMs + 50));
}

async function clickSelectorIfVisible(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return false;
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click({ timeout: 1200 });
  await settlePage(page, 80);
  return true;
}

async function clickBoardDomCell(page, row, col) {
  const selector = `#board [data-r="${row}"][data-c="${col}"]`;
  if (await clickSelectorIfVisible(page, selector)) return true;
  return clickCanvasCell(page, "#board, canvas", 8, 8, col, row);
}

async function clickChessSquare(page, square) {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square.slice(1));
  const row = 8 - rank;
  return clickCanvasCell(page, "#board, canvas", 8, 8, file, row);
}

async function clickCanvasCell(page, selector, cols, rows, col, row) {
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not find board for ${selector}`);
  await page.mouse.click(box.x + ((col + 0.5) / cols) * box.width, box.y + ((row + 0.5) / rows) * box.height);
  await settlePage(page, 80);
  return true;
}

async function clickCanvasAt(page, selector, xRatio, yRatio) {
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not find canvas for ${selector}`);
  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
  await settlePage(page, 80);
  return true;
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
  .evidence { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #203346; }
  figure { margin: 0; background: #020617; }
  figcaption { padding: 5px 8px; color: #a9b7c7; font-size: 11px; background: #08111d; border-bottom: 1px solid #203346; }
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
        <div class="evidence">
          <figure>
            <figcaption>First screen</figcaption>
            <img src="${escapeHtml(record.screenshot)}" alt="${escapeHtml(game.title)} ${escapeHtml(record.viewport)} first screenshot">
          </figure>
          <figure>
            <figcaption>Event: ${escapeHtml(record.interaction?.name || "none")}</figcaption>
            ${record.interaction?.eventScreenshot ? `<img src="${escapeHtml(record.interaction.eventScreenshot)}" alt="${escapeHtml(game.title)} ${escapeHtml(record.viewport)} event screenshot">` : ""}
          </figure>
          <figure>
            <figcaption>Settled</figcaption>
            ${record.interaction?.screenshot ? `<img src="${escapeHtml(record.interaction.screenshot)}" alt="${escapeHtml(game.title)} ${escapeHtml(record.viewport)} post-action screenshot">` : ""}
          </figure>
        </div>
        <div class="details">${escapeHtml(surface.reasons.join("; ") || "No automated issues.")}
          <br>Event ${record.interaction?.eventSignals?.length ? escapeHtml(record.interaction.eventSignals.map((signal) => signal.path).join(", ")) : "no immediate signal"} · feedback ${record.interaction?.feedbackActive?.active ? escapeHtml(record.interaction.feedbackActive.keys.join(", ")) : "none"}
          <br>Interaction ${record.interaction?.changed ? "changed" : "unchanged"}${record.interaction?.signals?.length ? ` · ${escapeHtml(record.interaction.signals.map((signal) => signal.path).join(", "))}` : ""}
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
