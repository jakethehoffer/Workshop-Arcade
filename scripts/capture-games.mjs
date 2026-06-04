import { createServer } from "node:http";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { collectEvidenceProvenance, formatEvidenceProvenance } from "./evidence-provenance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const STRICT = args.has("--ci");
const CHECK_RECIPES = args.has("--check-recipes");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "websites", "manifest.json"), "utf8"));
const startedAt = new Date().toISOString();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(repoRoot, "test-results", "render-ranking", stamp);
const shotsDir = path.join(outputRoot, "shots");
const viewports = [
  { name: "desktop", width: 1280, height: 820 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];
const expectedSurfaceCount = manifest.length * viewports.length;
const records = [];
let lastPhase = phaseSnapshot("initializing");

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

if (CHECK_RECIPES) {
  await checkCaptureRecipes();
  process.exit(0);
}

await mkdir(shotsDir, { recursive: true });

let server;
let browser;
try {
  setPhase("starting server");
  const serverInfo = await startServer();
  server = serverInfo.server;
  const baseUrl = serverInfo.baseUrl;

  setPhase("launching browser");
  browser = await chromium.launch({ headless: !process.env.HEADED });

  for (const game of manifest) {
    for (const viewport of viewports) {
      setPhase("capturing surface", game, viewport);
      records.push(await captureGame(browser, baseUrl, game, viewport));
      setPhase("surface captured", game, viewport);
    }
  }

  setPhase("ranking surfaces");
  const rankedRecords = rankRecords();
  const failingRecords = rankedRecords.filter((record) => record.ranking.score > 0);
  const status = failingRecords.length ? "ranked-issues" : "passed";
  let summary = await writeRunSummary({ status, passed: failingRecords.length === 0, error: null });
  setPhase("writing contact sheet");
  await writeContactSheet(summary);
  setPhase("capturing contact sheet");
  await captureContactSheet(browser);
  setPhase("completed");
  summary = await writeRunSummary({ status, passed: failingRecords.length === 0, error: null });
  await writeContactSheet(summary);
  const failures = summary.rankedSurfaces.filter((surface) => surface.score > 0);

  console.log(`Captured ${records.length} rendered surfaces for ${manifest.length} games.`);
  console.log(`Output: ${outputRoot}`);
  console.log(`Max render score: ${summary.rankedSurfaces[0]?.score ?? 0}`);
  console.log("Top ranked surfaces:");
  for (const surface of summary.rankedSurfaces.slice(0, 10)) {
    const reasonText = surface.reasons.length ? surface.reasons.join("; ") : "no automated issues";
    console.log(` - ${surface.title} ${surface.viewport}: ${surface.score} (${reasonText})`);
  }

  if (STRICT) {
    if (failures.length) {
      console.error("\nCI rendered-quality gate failed:");
      for (const surface of failures) {
        const reasonText = surface.reasons.length ? surface.reasons.join("; ") : "no automated issues";
        console.error(`- ${surface.title} ${surface.viewport}: ${surface.score} (${reasonText})`);
      }
      process.exitCode = 1;
    } else {
      console.log("CI rendered-quality gate passed.");
    }
  }
} catch (error) {
  markFailedPhase();
  const serializedError = serializeError(error);
  const summary = await writeRunSummary({ status: "failed", passed: false, error: serializedError });
  if (records.length > 0) {
    try {
      await writeContactSheet(summary);
    } catch (contactSheetError) {
      console.error(`Unable to write partial contact sheet: ${serializeError(contactSheetError).message}`);
    }
  }
  console.error("\nRendered-quality capture failed before completing all surfaces.");
  console.error(serializedError.message);
  console.error(`Summary: ${path.join(outputRoot, "summary.json")}`);
  if (records.length > 0) {
    console.error(`Partial contact sheet: ${path.join(outputRoot, "contact-sheet.html")}`);
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

function phaseSnapshot(phase, game = null, viewport = null) {
  return {
    phase,
    game: game
      ? {
          slug: game.slug,
          title: game.title,
          url: game.url,
        }
      : null,
    viewport: viewport?.name || null,
    expectedSurfaceCount,
    capturedSurfaceCount: records.length,
    at: new Date().toISOString(),
  };
}

function setPhase(phase, game = null, viewport = null) {
  lastPhase = phaseSnapshot(phase, game, viewport);
}

function markFailedPhase() {
  lastPhase = {
    ...lastPhase,
    status: "failed",
    failedAt: new Date().toISOString(),
    capturedSurfaceCount: records.length,
  };
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack ? String(error.stack).split("\n").slice(0, 12).join("\n") : null,
  };
}

function rankRecords() {
  return records
    .map((record) => ({ ...record, ranking: rankSurface(record) }))
    .sort((a, b) => b.ranking.score - a.ranking.score || a.slug.localeCompare(b.slug));
}

async function writeRunSummary({ status, passed, error }) {
  const rankedSurfaces = rankRecords();
  const summary = {
    createdAt: startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    status,
    error,
    expectedSurfaceCount,
    capturedSurfaceCount: records.length,
    lastPhase,
    provenance: await collectEvidenceProvenance(repoRoot),
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
  return summary;
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
          disabled: Boolean(element.disabled),
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
      // Prefer the visually-styled .primary CTA (the catalog convention for "this is the main button"),
      // but only when it's actually actionable. A disabled .primary button (e.g. Prism Relay's
      // "Next Stage" before the stage is solved) is a future affordance, not the current primary
      // action — fall through to the verb-regex match in that case so the scorer measures the
      // button the player is meant to press right now.
      const isPrimaryStyled = (item) => /(^|\s)primary(\s|$)/i.test(item.className || "");
      // `next` is intentionally omitted: most "Next <thing>" buttons are disabled until a stage
      // is solved, so picking them up as the current primary would be misleading.
      const verbRegex = /^(guess|start|play|new|resume|deal|run|begin|tap|launch|restart|shoot|fire|throw|submit|spin|attack|continue)\b/i;
      const primaryAction =
        controls.find((item) => isPrimaryStyled(item) && !item.disabled) ||
        controls.find((item) => !item.disabled && verbRegex.test(item.text));
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
  let finalScreenshot = screenshot;
  let shouldCaptureFinalScreenshot = true;
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
    if (recipe.freezePostAtEvent) {
      postRenderText = eventRenderText;
      postState = eventState;
      finalScreenshot = eventScreenshot;
      shouldCaptureFinalScreenshot = false;
    } else {
      await settlePage(page, recipe.settleMs ?? 350);

      if (hasRenderText) {
        postRenderText = await page.evaluate(() => window.render_game_to_text());
        postState = parseRenderText(postRenderText);
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  try {
    if (shouldCaptureFinalScreenshot) {
      await page.screenshot({ path: screenshotPath });
    }
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
    screenshot: finalScreenshot,
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
    "chrome-convoy": {
      name: "start, hold the lane, and gun the first rival",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(1700);   // approach the first rival (spawns centered, aligned with the player)
          window.advanceTime(300);    // first rival now near the top of the lane
          document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.advanceTime(650);    // tracer intercepts the aligned rival -> gun-kill
          document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.advanceTime(150);
        });
      },
    },
    "brick-breaker": {
      name: "start and launch ball",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startGameBtn");
        await pressAndAdvance(page, "Space", 900);
        await holdKeyAdvance(page, "ArrowRight", 450);
        const reachedHitFeedback = await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return false;
          const readState = () => {
            try {
              return JSON.parse(window.render_game_to_text());
            } catch {
              return null;
            }
          };
          const hasHitFeedback = (state) => Boolean(
            state &&
            Number(state.score) > 0 &&
            state.feedback &&
            (
              (state.feedback.lastBrickHitAge !== null && state.feedback.lastBrickHitAge <= 1.25) ||
              (state.feedback.lastBrickBreakAge !== null && state.feedback.lastBrickBreakAge <= 1.25) ||
              (state.feedback.lastTactileAge !== null && state.feedback.lastTactileAge <= 1.25)
            )
          );
          for (let elapsed = 0; elapsed <= 5000; elapsed += 80) {
            const state = readState();
            if (hasHitFeedback(state)) return true;
            if (elapsed < 5000) window.advanceTime(80);
          }
          return false;
        });
        if (!reachedHitFeedback) throw new Error("Brick Breaker capture did not reach brick feedback state");
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
      freezePostAtEvent: true,
      settleMs: 0,
      run: async (page) => {
        await pressAndAdvance(page, "Space", 20);
      },
    },
    snake: {
      name: "start and turn",
      expectsStart: true,
      settleMs: 0,
      run: async (page) => {
        await pressAndAdvance(page, "Space", 20);
        await pressAndAdvance(page, "ArrowDown", 20);
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
    "echo-mimic": {
      name: "watch sequence and repeat",
      run: async (page) => {
        // Start a round and skip the sequence playback via advanceTime, then
        // tap the single pad shown to capture a "correct" event frame.
        await clickSelectorIfVisible(page, "#startBtn");
        await settlePage(page, 60);
        await page.evaluate(() => { if (typeof window.advanceTime === "function") window.advanceTime(3000); });
        await settlePage(page, 60);
        // Read the first sequence index and click the matching pad.
        const idx = await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function") return null;
          const snap = JSON.parse(window.render_game_to_text());
          return (snap && snap.sequence && snap.sequence.length) ? snap.sequence[0] : null;
        });
        if (idx !== null){
          await clickSelectorIfVisible(page, `button.pad[data-index="${idx}"]`);
        }
        await settlePage(page, 200);
      },
    },
    "paddle-pulse": {
      name: "start rally and move paddle",
      expectsStart: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await page.evaluate(() => { if (typeof window.advanceTime === "function") window.advanceTime(1280); });
        await pressAndAdvance(page, "ArrowDown", 160);
        await settlePage(page, 120);
      },
    },
    "rhythm-circuit": {
      name: "hit first pulse note",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
        });
        const next = await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function") return null;
          const snap = JSON.parse(window.render_game_to_text());
          return snap.nextNote || null;
        });
        if (next) {
          await page.evaluate((amount) => {
            if (typeof window.advanceTime === "function") {
              window.advanceTime(Math.max(0, amount));
            }
          }, next.dueInMs);
          await page.evaluate((key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
            if (typeof window.advanceTime === "function") {
              window.advanceTime(16);
            }
          }, next.key.toLowerCase());
        }
      },
    },
    "circuit-putt": {
      name: "start and putt",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
        });
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function") return;
          const snap = JSON.parse(window.render_game_to_text());
          const canvas = document.querySelector("#game");
          if (!canvas || !snap?.ball || !snap?.cup) return;
          const rect = canvas.getBoundingClientRect();
          const toClient = (x, y) => ({
            x: rect.left + (x / 900) * rect.width,
            y: rect.top + (y / 560) * rect.height
          });
          const dx = snap.cup.x - snap.ball.x;
          const dy = snap.cup.y - snap.ball.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          const drag = 118;
          const start = toClient(snap.ball.x, snap.ball.y);
          const end = toClient(snap.ball.x - (dx / len) * drag, snap.ball.y - (dy / len) * drag);
          const dispatch = (type, point, buttons) => {
            canvas.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 8,
              pointerType: "mouse",
              isPrimary: true,
              button: 0,
              buttons,
              clientX: point.x,
              clientY: point.y
            }));
          };
          dispatch("pointerdown", start, 1);
          dispatch("pointermove", end, 1);
          dispatch("pointerup", end, 0);
          if (typeof window.advanceTime === "function") {
            window.advanceTime(260);
          }
        });
      },
    },
    "neon-drift": {
      name: "start and boost",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
        });
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const held = new Set();
          const normalize = (angle) => {
            while (angle > Math.PI) angle -= Math.PI * 2;
            while (angle < -Math.PI) angle += Math.PI * 2;
            return angle;
          };
          const setKey = (key, on) => {
            if (held.has(key) === on) return;
            held[on ? "add" : "delete"](key);
            document.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", {
              key,
              code: key === " " ? "Space" : key,
              bubbles: true
            }));
          };
          for (let i = 0; i < 115; i += 1) {
            const snap = JSON.parse(window.render_game_to_text());
            const target = snap.checkpoint;
            const desired = Math.atan2(target.y - snap.car.y, target.x - snap.car.x);
            const delta = normalize(desired - snap.car.angle);
            setKey("ArrowUp", true);
            setKey("ArrowLeft", delta < -0.12);
            setKey("ArrowRight", delta > 0.12);
            setKey(" ", Math.abs(delta) < 0.25 && snap.boost.amount > 0.08);
            window.advanceTime(1000 / 60);
          }
          for (const key of held) {
            document.dispatchEvent(new KeyboardEvent("keyup", {
              key,
              code: key === " " ? "Space" : key,
              bubbles: true
            }));
          }
        });
      },
    },
    "signal-siege": {
      name: "build tower and start wave",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const canvas = document.querySelector("#game");
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const point = {
            x: rect.left + (250 / 900) * rect.width,
            y: rect.top + (170 / 560) * rect.height
          };
          canvas.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            pointerId: 9,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: point.x,
            clientY: point.y
          }));
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", bubbles: true }));
          document.dispatchEvent(new KeyboardEvent("keyup", { key: "s", code: "KeyS", bubbles: true }));
          if (typeof window.advanceTime === "function") {
            window.advanceTime(3600);
          }
        });
      },
    },
    "pinball-foundry": {
      name: "launch, flip, and chase a target hit",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const key = (type, value, code = value) => {
            document.dispatchEvent(new KeyboardEvent(type, { key: value, code, bubbles: true }));
          };
          key("keydown", " ", "Space");
          window.advanceTime(900);
          key("keyup", " ", "Space");
          let flipped = false;
          for (let i = 0; i < 220; i += 1) {
            const snap = JSON.parse(window.render_game_to_text());
            if (!flipped && snap.ball.y > 690 && snap.ball.y < 885 && Math.abs(snap.ball.vy) > 120) {
              const left = snap.ball.x < 360;
              key("keydown", left ? "ArrowLeft" : "ArrowRight", left ? "ArrowLeft" : "ArrowRight");
              window.advanceTime(120);
              key("keyup", left ? "ArrowLeft" : "ArrowRight", left ? "ArrowLeft" : "ArrowRight");
              flipped = true;
            }
            if (
              snap.mode === "playing" &&
              (snap.score > 0 || snap.bumperHits > 0 || snap.litLanes.side.length > 0 || snap.litLanes.rollovers.some(Boolean) || i > 150)
            ) break;
            window.advanceTime(1000 / 60);
          }
          if (!flipped) {
            key("keydown", "ArrowLeft", "ArrowLeft");
            window.advanceTime(120);
            key("keyup", "ArrowLeft", "ArrowLeft");
          }
        });
      },
    },
    "starline-strafe": {
      name: "start, shoot, and dash",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const canvas = document.querySelector("#game");
          if (!canvas || typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(900);
          const rect = canvas.getBoundingClientRect();
          const snap = JSON.parse(window.render_game_to_text());
          const enemy = (snap.enemies && snap.enemies[0]) || { x: 690, y: 260 };
          const toClient = (x, y) => ({
            x: rect.left + (x / 900) * rect.width,
            y: rect.top + (y / 560) * rect.height
          });
          const aim = toClient(enemy.x, enemy.y);
          const dispatchPointer = (type, point, buttons) => {
            canvas.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 12,
              pointerType: "mouse",
              isPrimary: true,
              button: 0,
              buttons,
              clientX: point.x,
              clientY: point.y
            }));
          };
          dispatchPointer("pointerdown", aim, 1);
          for (let i = 0; i < 44; i += 1) {
            window.advanceTime(1000 / 60);
          }
          document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
          window.advanceTime(90);
          document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
          dispatchPointer("pointerup", aim, 0);
        });
      },
    },
    "shadow-switch": {
      name: "open a switch route",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
            window.advanceTime(80);
          };
          for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowRight", " "]) {
            press(key, key === " " ? "Space" : key);
          }
          window.advanceTime(180);
        });
      },
    },
    "deckforge-duel": {
      name: "play cards and end turn",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const key = (value, code = value) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: value, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key: value, code, bubbles: true }));
            window.advanceTime(120);
          };
          key("1", "Digit1");
          key("2", "Digit2");
          key("Enter", "Enter");
          window.advanceTime(650);
        });
      },
    },
    "gemline-cascade": {
      name: "perform first valid gem swap",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const snap = JSON.parse(window.render_game_to_text());
          const swap = snap.firstValidSwap || (snap.validSwaps && snap.validSwaps[0]);
          const canvas = document.querySelector("#game");
          if (!swap || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          const pad = 42;
          const cell = (720 - pad * 2) / 8;
          const point = (cellRef) => ({
            x: rect.left + ((pad + cellRef.c * cell + cell / 2) / 720) * rect.width,
            y: rect.top + ((pad + cellRef.r * cell + cell / 2) / 720) * rect.height
          });
          const tap = (cellRef) => {
            const p = point(cellRef);
            canvas.dispatchEvent(new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              pointerId: 31,
              pointerType: "mouse",
              isPrimary: true,
              button: 0,
              buttons: 1,
              clientX: p.x,
              clientY: p.y
            }));
            window.advanceTime(40);
          };
          tap(swap.from);
          tap(swap.to);
          window.advanceTime(360);
        });
      },
    },
    "dungeon-circuit": {
      name: "move toward first dungeon target",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          document.querySelector("#newBtn")?.click();
          const press = (key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true }));
            window.advanceTime(90);
          };
          for (let i = 0; i < 16; i += 1) {
            const snap = JSON.parse(window.render_game_to_text());
            const target = snap.nextTarget || snap.exit;
            if (!target || !snap.player) break;
            const dx = target.x - snap.player.x;
            const dy = target.y - snap.player.y;
            if (Math.abs(dx) + Math.abs(dy) <= 1) {
              press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp"));
              break;
            }
            press(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp"));
          }
          window.advanceTime(220);
        });
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
      freezePostAtEvent: true,
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
    "packet-pilot": {
      name: "cycle a router and start the packet flow",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#cycleBtn");
        await settlePage(page, 60);
        await clickSelectorIfVisible(page, "#flowBtn");
        await page.evaluate(() => {
          if (typeof window.advanceTime === "function") window.advanceTime(900);
        });
      },
    },
    "typeforge-cipher": {
      name: "start a wave and type the active token",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await clickSelectorIfVisible(page, "#startBtn");
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          window.advanceTime(400);
          const snap = JSON.parse(window.render_game_to_text());
          const text = snap.activeToken?.text || (snap.visibleTokens && snap.visibleTokens[0]?.text) || "";
          for (const ch of text.slice(0, 3)) {
            const key = String(ch);
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
            window.advanceTime(80);
          }
          window.advanceTime(220);
        });
      },
    },
    "stack-tide": {
      name: "start a run and drop the sliding platform onto the tower",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = () => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
          };
          press(); // start the run
          // Advance until the sliding platform is centered over the tower, then drop.
          // Platform base speed is 200 px/s sliding from x=W-2=638 leftward; ground block
          // spans 230..410. After ~1.55s the platform is at x~328, deep inside the
          // overlap window, so dropping here lands a solid stack rather than missing.
          window.advanceTime(1550);
          press();
          window.advanceTime(260);
        });
      },
    },
    "crate-circuit": {
      name: "push a crate one step in the starter room",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
          };
          window.advanceTime(60);
          press("ArrowRight");
          window.advanceTime(120);
          press("ArrowRight");
          window.advanceTime(220);
        });
      },
    },
    "prism-relay": {
      name: "rotate the cursor tile to redirect the beam",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          window.advanceTime(60);
          press(" ", "Space");
          window.advanceTime(220);
        });
      },
    },
    "vector-pool": {
      name: "fire a shot from the cue ball",
      freezePostAtEvent: true,
      run: async (page, { preState } = {}) => {
        const beforeScore = Number(preState?.score) || 0;
        const clicked = await clickSelectorIfVisible(page, "#shootBtn");
        if (!clicked) throw new Error("Vector Pool capture could not click Shoot");
        const reachedState = await page.evaluate((scoreBeforeShot) => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return null;
          const readState = () => {
            try {
              return JSON.parse(window.render_game_to_text());
            } catch (_) {
              return null;
            }
          };
          const vectorPoolScored = (state) => Boolean(
            state &&
            state.mode !== "rolling" &&
            Number(state.score) > scoreBeforeShot &&
            Array.isArray(state.balls) &&
            state.balls.some((ball) => ball && ball.potted === true) &&
            state.feedbackActive === true
          );
          for (let elapsed = 0; elapsed <= 6400; elapsed += 80) {
            const state = readState();
            if (vectorPoolScored(state)) return state;
            if (elapsed < 6400) window.advanceTime(80);
          }
          return null;
        }, beforeScore);
        if (!reachedState) throw new Error("Vector Pool capture did not reach scored pocket feedback state");
      },
    },
    "gridline-tactics": {
      name: "move a unit into the first mission lane",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          window.advanceTime(60);
          press("ArrowRight");
          window.advanceTime(90);
          press("Enter");
          window.advanceTime(260);
        });
      },
    },
    "service-shift": {
      name: "prepare and serve the first order",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          window.advanceTime(640);
          const snap = JSON.parse(window.render_game_to_text());
          const order = snap.orders[0];
          const stationIndex = order
            ? Math.max(0, snap.stations.findIndex((station) => station.name === order.station || station.id === order.station))
            : 0;
          press(String(stationIndex + 1));
          window.advanceTime(80);
          press(" ", "Space");
          window.advanceTime(3300);
          press(" ", "Space");
          window.advanceTime(320);
        });
      },
    },
    "letter-foundry": {
      name: "forge the starter STONE word",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          for (const key of ["s", "t", "o", "n", "e"]) {
            press(key);
            window.advanceTime(30);
          }
          press("Enter");
          window.advanceTime(320);
        });
      },
    },
    "penalty-circuit": {
      name: "drive a curved penalty shot toward goal",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          press("ArrowRight");
          press("w");
          window.advanceTime(80);
          press(" ", "Space");
          window.advanceTime(820);
        });
      },
    },
    "diamond-derby": {
      name: "time a swing for a home run",
      freezePostAtEvent: true,
      run: async (page) => {
        const reached = await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return null;
          const read = () => {
            try {
              return JSON.parse(window.render_game_to_text());
            } catch (_) {
              return null;
            }
          };
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
          };
          // Reset to a deterministic round 1 / pitch 1 first: real-time idle
          // play before this evaluate can otherwise park the game in a settled
          // fail state where no fresh pitch is ever in flight.
          press("n", "KeyN");
          let swung = false;
          for (let elapsed = 0; elapsed <= 4200; elapsed += 40) {
            const snap = read();
            if (snap) {
              if (!swung && snap.phase === "pitch" && snap.meter && snap.meter.t >= snap.meter.zoneLo) {
                press(" ", "Space");
                swung = true;
              }
              if (snap.phase === "homeRun") return snap;
            }
            window.advanceTime(40);
          }
          return read();
        });
        if (!reached || reached.phase !== "homeRun") {
          throw new Error("Diamond Derby capture did not reach a settled home-run state");
        }
      },
    },
    "beacon-bastion": {
      name: "start, place a ward, pulse, and expose shades",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(260);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
          window.advanceTime(520);
          document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
          document.querySelector("#wardBtn")?.click();
          window.advanceTime(1200);
          document.querySelector("#pulseBtn")?.click();
          window.advanceTime(420);
        });
      },
    },
    "orbit-salvage": {
      name: "launch the rescue skiff past the first gravity well",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(120);
          const key = (type, value, code = value) => {
            window.dispatchEvent(new KeyboardEvent(type, { key: value, code, bubbles: true }));
          };
          key("keydown", "ArrowUp", "ArrowUp");
          window.advanceTime(80);
          key("keyup", "ArrowUp", "ArrowUp");
          key("keydown", " ", "Space");
          key("keyup", " ", "Space");
          window.advanceTime(1100);
        });
      },
    },
    "harbor-switchboard": {
      name: "toggle a harbor route and release traffic",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          document.querySelector('button[data-switch="0"]')?.click();
          window.advanceTime(120);
          document.querySelector("#gateBtn")?.click();
          window.advanceTime(220);
          document.querySelector("#gateBtn")?.click();
          window.advanceTime(1700);
        });
      },
    },
    "relay-choir": {
      name: "edit the sequencer and capture the pulse scan",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
            window.advanceTime(90);
          };
          press("2", "Digit2");
          press(" ", "Space");
          press("ArrowRight", "ArrowRight");
          press("3", "Digit3");
          press(" ", "Space");
          window.advanceTime(360);
        });
      },
    },
    "circuit-draft": {
      name: "install the first drafted engine card",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          document.querySelector('[data-draft="0"]')?.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            pointerId: 42,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: 1
          }));
          window.advanceTime(260);
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
            window.advanceTime(90);
          };
          press("2", "Digit2");
          press("q", "KeyQ");
          press("Enter", "Enter");
          window.advanceTime(220);
        });
      },
    },
    "switchback-rally": {
      name: "commit a corner plan and capture replay",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
            window.advanceTime(90);
          };
          for (let i = 0; i < 5; i += 1) {
            press("Enter", "Enter");
          }
          window.advanceTime(1350);
        });
      },
    },
    "inkline-courier": {
      name: "draw and launch a courier inkline",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const canvas = document.querySelector("canvas");
          if (!canvas) return;
          canvas.focus();
          const press = (key, code = key, shiftKey = false) => {
            const event = { key, code, bubbles: true, cancelable: true, shiftKey };
            canvas.dispatchEvent(new KeyboardEvent("keydown", event));
            canvas.dispatchEvent(new KeyboardEvent("keyup", event));
            window.advanceTime(60);
          };
          press("ArrowRight", "ArrowRight");
          press("ArrowRight", "ArrowRight");
          press(" ", "Space");
          press("ArrowDown", "ArrowDown");
          press("ArrowDown", "ArrowDown");
          press(" ", "Space");
          press("ArrowRight", "ArrowRight", true);
          press("ArrowRight", "ArrowRight", true);
          press(" ", "Space");
          press("Enter", "Enter");
          window.advanceTime(1450);
        });
      },
    },
    "cipher-rooms": {
      name: "inspect room clues and open the first cipher door",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const click = (selector) => document.querySelector(selector)?.click();
          for (let i = 0; i < 3; i += 1) {
            click(`[data-object="${i}"]`);
            window.advanceTime(140);
          }
          for (const digit of ["4", "7", "2"]) {
            document.querySelector(`[data-key="${digit}"]`)?.click();
            window.advanceTime(80);
          }
          document.querySelector("#submitBtn")?.click();
          window.advanceTime(900);
        });
      },
    },
    "patchwork-foundry": {
      name: "place the first foundry plate",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(90);
          };
          press("ArrowLeft", "ArrowLeft");
          press("ArrowUp", "ArrowUp");
          press("q", "KeyQ");
          press("Enter", "Enter");
          window.advanceTime(360);
        });
      },
    },
    "market-minute": {
      name: "buy inventory and advance the trading desk",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          document.querySelector('[data-good="0"]')?.click();
          document.querySelector("#buyBtn")?.click();
          window.advanceTime(140);
          document.querySelector('[data-good="1"]')?.click();
          document.querySelector("#buyBtn")?.click();
          window.advanceTime(140);
          document.querySelector("#endBtn")?.click();
          window.advanceTime(420);
        });
      },
    },
    "bloomkeeper-grid": {
      name: "plant, water, and advance the first garden day",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(80);
          };
          press("Enter", "Enter");
          press("ArrowRight", "ArrowRight");
          press("2", "Digit2");
          press("Enter", "Enter");
          press("ArrowDown", "ArrowDown");
          press("1", "Digit1");
          press("Enter", "Enter");
          press("n", "KeyN");
          window.advanceTime(520);
        });
      },
    },
    "volt-sudoku": {
      name: "request a deterministic hint",
      expectsFeedback: false,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#hintBtn")?.click();
          if (typeof window.advanceTime === "function") window.advanceTime(240);
        });
      },
    },
    "glyphogram-grid": {
      name: "begin draft and mark the first glyph cell",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
          const canvas = document.querySelector("#grid");
          canvas?.focus();
          window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          if (typeof window.advanceTime === "function") window.advanceTime(360);
        });
      },
    },
    "lumen-lander": {
      name: "start descent and burn thrusters",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
          const canvas = document.querySelector("#game");
          canvas?.focus();
          const down = (key, code = key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
          const up = (key, code = key) => window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
          down("ArrowLeft", "ArrowLeft");
          down("ArrowUp", "ArrowUp");
          if (typeof window.advanceTime === "function") window.advanceTime(620);
          up("ArrowLeft", "ArrowLeft");
          up("ArrowUp", "ArrowUp");
          if (typeof window.advanceTime === "function") window.advanceTime(180);
        });
      },
    },
    "wordweave-grid": {
      name: "trace the first target word",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const canvas = document.querySelector("#game");
          canvas?.focus();
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            if (typeof window.advanceTime === "function") window.advanceTime(60);
          };
          press("ArrowLeft", "ArrowLeft");
          press("ArrowLeft", "ArrowLeft");
          press("ArrowUp", "ArrowUp");
          press("ArrowUp", "ArrowUp");
          press("Enter", "Enter");
          for (let i = 0; i < 4; i += 1) press("ArrowDown", "ArrowDown");
          press("Enter", "Enter");
          if (typeof window.advanceTime === "function") window.advanceTime(420);
        });
      },
    },
    "dice-dynamo": {
      name: "lock a die and bank the contract",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector('[data-die="0"]')?.click();
          if (typeof window.advanceTime === "function") window.advanceTime(120);
          document.querySelector("#bankBtn")?.click();
          if (typeof window.advanceTime === "function") window.advanceTime(520);
        });
      },
    },
    "shadow-vault": {
      name: "start the vault route and slip to the first key",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const press = (key, code = key) => {
            const down = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
            const up = new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
            if (typeof window.advanceTime === "function") window.advanceTime(120);
          };
          document.querySelector("#startBtn")?.click();
          for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown"]) press(key, key);
          if (typeof window.advanceTime === "function") window.advanceTime(420);
        });
      },
    },
    "rail-yard-relay": {
      name: "start the yard clock and flip the selected switch",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            if (typeof window.advanceTime === "function") window.advanceTime(120);
          };
          press(" ", "Space");
          if (typeof window.advanceTime === "function") window.advanceTime(820);
        });
      },
    },
    "skyline-sentry": {
      name: "start the sentry and fire into the first lane",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          document.querySelector("#startBtn")?.click();
          const press = (key, code = key) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            if (typeof window.advanceTime === "function") window.advanceTime(120);
          };
          press(" ", "Space");
          press("ArrowDown", "ArrowDown");
          press(" ", "Space");
          if (typeof window.advanceTime === "function") window.advanceTime(900);
        });
      },
    },
    "tempo-forge": {
      name: "toggle a forge step and check the loop",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const press = (key, code = key) => {
            const down = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
            const up = new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
            if (typeof window.advanceTime === "function") window.advanceTime(100);
          };
          press(" ", "Space");
          press("ArrowRight", "ArrowRight");
          press("2", "Digit2");
          document.querySelector("#playBtn")?.click();
          if (typeof window.advanceTime === "function") window.advanceTime(620);
        });
      },
    },
    "gridfront-orders": {
      name: "move the cursor and issue the first grid order",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          const press = (key, code = key) => {
            const down = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
            const up = new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true });
            document.dispatchEvent(down);
            window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(up);
            window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            if (typeof window.advanceTime === "function") window.advanceTime(110);
          };
          press("ArrowRight", "ArrowRight");
          press("ArrowRight", "ArrowRight");
          press("Enter", "Enter");
          if (typeof window.advanceTime === "function") window.advanceTime(520);
        });
      },
    },
    "flux-reversi": {
      name: "place the opening dark disc and let the CPU reply",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(140);
          };
          press("Enter", "Enter");
          window.advanceTime(700);
        });
      },
    },
    "fourfall": {
      name: "drop a disc in the center column and let the CPU reply",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(140);
          };
          press("Enter", "Enter");
          window.advanceTime(800);
        });
      },
    },
    "blackjack": {
      name: "stand, deal, then play another hand",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(130);
          };
          press("s", "KeyS");
          press("Enter", "Enter");
          press("h", "KeyH");
          press("s", "KeyS");
        });
      },
    },
    "clause-courier": {
      name: "swap courier words along the dispatch rail",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(140);
          };
          press("d", "KeyD");
          press("ArrowRight", "ArrowRight");
          press("d", "KeyD");
          press("ArrowRight", "ArrowRight");
          press(" ", "Space");
          window.advanceTime(360);
        });
      },
    },
    "pylon-shift": {
      name: "shift discs across the pylons",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(130);
          };
          press("1", "Digit1");
          press("3", "Digit3");
          press("1", "Digit1");
          press("2", "Digit2");
          press("3", "Digit3");
          press("2", "Digit2");
        });
      },
    },
    "chromalock": {
      name: "build two guesses and read the clues",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(120);
          };
          press("1", "Digit1");
          press("2", "Digit2");
          press("3", "Digit3");
          press("4", "Digit4");
          press("Enter", "Enter");
          press("5", "Digit5");
          press("6", "Digit6");
          press("1", "Digit1");
          press("2", "Digit2");
          press("Enter", "Enter");
        });
      },
    },
    "eclipse-grid": {
      name: "toggle a tile and flip its neighbors",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(140);
          };
          press("ArrowRight", "ArrowRight");
          press("Enter", "Enter");
          window.advanceTime(300);
        });
      },
    },
    "slipsort": {
      name: "slide tiles into the gap",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(120);
          };
          press("ArrowRight", "ArrowRight");
          press("ArrowDown", "ArrowDown");
          press("ArrowLeft", "ArrowLeft");
          press("ArrowUp", "ArrowUp");
          window.advanceTime(260);
        });
      },
    },
    "seedline": {
      name: "sow a pit and let the CPU reply",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true, cancelable: true }));
          document.dispatchEvent(new KeyboardEvent("keyup", { key: "1", code: "Digit1", bubbles: true, cancelable: true }));
          window.advanceTime(900);
        });
      },
    },
    "floodgate": {
      name: "flood the board with a few colors",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(120);
          };
          press("2", "Digit2");
          press("3", "Digit3");
          press("4", "Digit4");
          window.advanceTime(260);
        });
      },
    },
    "last-light": {
      name: "select a peg and jump it into the center",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(110);
          };
          press("Enter", "Enter");
          press("ArrowDown", "ArrowDown");
          press("ArrowDown", "ArrowDown");
          press("Enter", "Enter");
          window.advanceTime(260);
        });
      },
    },
    "breachline": {
      name: "queue synchronized routes and execute two stealth beats",
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.advanceTime !== "function") return;
          const press = (key, code = key) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(120);
          };
          press("ArrowRight", "ArrowRight");
          press("Tab", "Tab");
          press("ArrowRight", "ArrowRight");
          press("Enter", "Enter");
          press("ArrowRight", "ArrowRight");
          press("Tab", "Tab");
          press("ArrowRight", "ArrowRight");
          press("Enter", "Enter");
          window.advanceTime(420);
        });
      },
    },
    "bulwark-burst": {
      name: "start, aim, and burst first drone",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const canvas = document.querySelector("#game");
          if (!canvas) return;
          document.querySelector("#startBtn")?.click();
          window.advanceTime(1400);
          const rect = canvas.getBoundingClientRect();
          for (let i = 0; i < 7; i += 1) {
            const snap = JSON.parse(window.render_game_to_text());
            const target = snap.nearestTarget || { x: 480, y: 40 };
            const point = {
              x: rect.left + (target.x / 960) * rect.width,
              y: rect.top + (target.y / 540) * rect.height
            };
            canvas.dispatchEvent(new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              pointerId: 77 + i,
              pointerType: "mouse",
              isPrimary: true,
              button: 0,
              buttons: 1,
              clientX: point.x,
              clientY: point.y
            }));
            window.advanceTime(330);
          }
          document.querySelector("#pulseBtn")?.click();
          window.advanceTime(220);
        });
      },
    },
    "slipstream-sprint": {
      name: "start, draft, boost, and switch lanes",
      expectsStart: true,
      freezePostAtEvent: true,
      run: async (page) => {
        await page.evaluate(() => {
          if (typeof window.render_game_to_text !== "function" || typeof window.advanceTime !== "function") return;
          const press = (key, code = key, holdMs = 110) => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(holdMs);
            document.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
            window.advanceTime(70);
          };
          document.querySelector("#startBtn")?.click();
          window.advanceTime(260);
          document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          window.advanceTime(620);
          document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          press("ArrowLeft", "ArrowLeft", 90);
          window.advanceTime(460);
          press("ArrowRight", "ArrowRight", 90);
          document.querySelector("#boostBtn")?.click();
          window.advanceTime(480);
        });
      },
    },
  };

  return recipes[slug] || null;
}

async function checkCaptureRecipes() {
  const missing = [];
  const invalid = [];
  const contractIssues = [];
  const duplicateSlugs = new Set();
  const seen = new Set();

  for (const game of manifest) {
    if (seen.has(game.slug)) duplicateSlugs.add(game.slug);
    seen.add(game.slug);
    const recipe = getInteractionRecipe(game.slug);
    if (!recipe) {
      missing.push(game.slug);
      continue;
    }
    if (typeof recipe.name !== "string" || recipe.name.trim().length === 0 || typeof recipe.run !== "function") {
      invalid.push(game.slug);
    }
  }

  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  for (const snippet of [
    'import { collectEvidenceProvenance, formatEvidenceProvenance } from "./evidence-provenance.mjs";',
    "provenance: await collectEvidenceProvenance(repoRoot)",
    "formatEvidenceProvenance(summary.provenance)",
    "passed,",
    "status,",
    "error,",
    "expectedSurfaceCount,",
    "capturedSurfaceCount: records.length",
    "lastPhase,",
    "markFailedPhase()",
    "Rendered-quality capture failed before completing all surfaces.",
    "await writeRunSummary({ status: \"failed\", passed: false, error: serializedError })",
    "if (records.length > 0) {",
    'path.join(outputRoot, "summary.json")',
    'path.join(outputRoot, "contact-sheet.html")',
    '"vector-pool": {',
    "const vectorPoolScored =",
    'state.mode !== "rolling"',
    "Number(state.score) > scoreBeforeShot",
    "state.balls.some((ball) => ball && ball.potted === true)",
    "state.feedbackActive === true",
    "window.advanceTime(80)",
    "Vector Pool capture did not reach scored pocket feedback state",
  ]) {
    if (!source.includes(snippet)) {
      contractIssues.push(`missing capture contract snippet: ${snippet}`);
    }
  }

  if (missing.length || invalid.length || duplicateSlugs.size || contractIssues.length) {
    if (missing.length) console.error(`Missing capture recipes: ${missing.join(", ")}`);
    if (invalid.length) console.error(`Invalid capture recipes: ${invalid.join(", ")}`);
    if (duplicateSlugs.size) console.error(`Duplicate manifest slugs: ${Array.from(duplicateSlugs).join(", ")}`);
    for (const issue of contractIssues) console.error(issue);
    process.exit(1);
  }

  console.log(`Capture recipe preflight passed for ${manifest.length} manifest games with render evidence provenance wiring.`);
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
  if (state.feedbackActive === true) keys.push("feedbackActive");
  const roots = [];
  if (state.feedback !== undefined) roots.push(["feedback", state.feedback]);
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
  const lifecycle = String(state.mode || state.state || state.phase || "").toLowerCase();
  const status = String(state.status || "").toLowerCase();
  return state.gameOver === true ||
    /game[- ]?over|crashed|dead|lost/.test(lifecycle) ||
    /game[- ]?over|crashed|dead|you lost|run lost/.test(status);
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
  const clicked = await locator.evaluate((element) => {
    if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
      return false;
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    const PointerCtor = window.PointerEvent;
    if (PointerCtor) {
      element.dispatchEvent(new PointerCtor("pointerdown", {
        ...init,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }));
    }
    element.dispatchEvent(new MouseEvent("mousedown", init));
    if (PointerCtor) {
      element.dispatchEvent(new PointerCtor("pointerup", {
        ...init,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }));
    }
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.dispatchEvent(new MouseEvent("click", init));
    return true;
  });
  if (!clicked) return false;
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

  // Original case: "Play Again" sitting under the fold post-game-over is a true
  // secondary action — the run ended, this button restarts, not drives play.
  if (/^play again\b/i.test(text)) {
    const state = parseRenderState(record);
    if (!state) return false;
    return (
      state.ready === true &&
      (state.finished === false || state.won === false || state.dialogs?.gameOver === false) &&
      state.dialogs?.gameOver !== true
    );
  }

  // Canvas-dominated games (Pinball Foundry, deep maze games, etc.) often style
  // a "Reset" or "Restart" button as the visually-primary CTA because there's
  // no other meaningful button — but the *real* primary surface is the canvas,
  // and Reset is a meta-control the player reaches for after a run ends. When
  // the canvas covers a meaningful fraction of the viewport, treat reset-style
  // primaries as secondary so a tall canvas doesn't get penalised for parking
  // its only button below the 70% threshold.
  const canvasAreaRatio = Number(record.metrics?.largestCanvas?.areaRatio) || 0;
  if (canvasAreaRatio >= 0.35 && /^(reset|restart|new game|new run)\b/i.test(text)) {
    return true;
  }

  if (record.slug === "volt-sudoku" && /^restart\b/i.test(text)) {
    const state = parseRenderState(record);
    if (state?.mode === "playing" && Number(state.stage?.blanks) > 0) return true;
  }

  return false;
}

function isBenignTextOverflow(record, item) {
  if (!item) return false;
  const metrics = record.metrics || {};
  if (/\bsr-only\b/.test(item.className || "")) return true;
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
    records: viewports
      .map((viewport) => summary.records.find((record) => record.slug === game.slug && record.viewport === viewport.name))
      .filter(Boolean),
  })).filter((row) => row.records.length > 0);

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
  <p class="meta">${escapeHtml(summary.createdAt)} · ${summary.manifestCount} games · ${escapeHtml(summary.status || "unknown")} · ${summary.capturedSurfaceCount}/${summary.expectedSurfaceCount} surfaces · desktop 1280x820 · mobile 390x844</p>
  <ul class="meta">
    ${formatEvidenceProvenance(summary.provenance).map((line) => `<li>${escapeHtml(line)}</li>`).join("\n    ")}
  </ul>
  <ol class="ranking">
    ${summary.rankedSurfaces.slice(0, 10).map((surface) => `<li><strong>${escapeHtml(surface.title)} ${escapeHtml(surface.viewport)}</strong> · score ${surface.score}<br>${escapeHtml(surface.reasons.join("; ") || "no automated issues")}</li>`).join("\n    ")}
  </ol>
  ${rows.map(({ game, records }) => `<section class="row">
    ${records.map((record) => {
      const surface = topScores.get(`${record.slug}-${record.viewport}`) || { score: 999, reasons: ["missing ranked surface"] };
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
      const handle = await open(filePath, "r");
      let content;
      try {
        const info = await handle.stat();
        if (!info.isFile()) {
          response.writeHead(404).end("Not found");
          return;
        }
        content = await handle.readFile();
      } finally {
        await handle.close();
      }
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
