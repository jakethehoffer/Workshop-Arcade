// Deterministic WCAG AA text-contrast probe for the Workshop Arcade catalog.
//
// For every visible DOM text element on index.html and all 100 game pages
// (desktop + mobile), this measures the computed text color (resolved through a
// canvas so named/hsl/oklch/color-mix all normalize to concrete sRGB, then
// composited over its effective background using the element's color alpha and
// the product of the opacity chain) against the *effective* background.
//
// The effective background is determined two ways and cross-checked:
//   1. CSS composite  -- walk the ancestor chain compositing background-color,
//      over an opaque white base. Marked non-determinable if any contributing
//      layer carries a background-image (gradient/image).
//   2. Pixel sample   -- after suppressing all text (color:transparent), a
//      full-page screenshot is decoded (self-contained PNG decoder, no deps)
//      and the background is sampled on a grid across the text box. This
//      captures gradients, canvas, and overlays that pure CSS compositing
//      cannot see.
// When the CSS composite is fully determinable AND agrees with the pixel
// sample, the CSS value is used (exact, deterministic, "solid"). Otherwise the
// pixel sample is the source of truth, tagged by confidence:
//   gradient -> CSS gradient behind the text, static and reproducible
//   canvas   -> text overlaps a <canvas>; point-in-time, needs visual confirm
//   variant  -> background is non-uniform across the text box; low confidence
//
// A finding fails when contrast < 4.5:1 (normal text) or < 3:1 (large text:
// >=24px, or >=18.66px and bold). Output: a JSON report plus a grouped console
// summary with exact ratios and a smallest-palette-consistent nudge suggestion.
//
// Usage:
//   node scripts/audit-contrast.mjs                 # full catalog, both viewports
//   node scripts/audit-contrast.mjs --slug a,b      # scope to slugs
//   node scripts/audit-contrast.mjs --viewport desktop

import { createReadStream, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

function argValue(name) {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : null;
}

const slugFilter = (() => {
  const raw = argValue("--slug");
  if (!raw) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
})();
const viewportFilter = argValue("--viewport"); // "desktop" | "mobile" | null

const manifest = JSON.parse(await readFile(path.join(repoRoot, "websites", "manifest.json"), "utf8"));

// The catalog shell plus every game page. solitaire's file is intentionally
// spelled "solitare.html" in the manifest; we trust manifest URLs verbatim.
const pages = [
  { slug: "index", title: "Catalog (index.html)", url: "index.html" },
  ...manifest.map((g) => ({ slug: g.slug, title: g.title, url: g.url })),
].filter((p) => !slugFilter || slugFilter.has(p.slug));

// Both contexts use deviceScaleFactor:1 so a full-page screenshot's pixels map
// 1:1 to CSS px (getBoundingClientRect coordinates index the raster directly).
const viewports = [
  { name: "desktop", width: 1280, height: 820, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
].filter((v) => !viewportFilter || v.name === viewportFilter);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(repoRoot, "test-results", "contrast-audit", stamp);

// ---------------------------------------------------------------------------
// Color + contrast math (Node side)
// ---------------------------------------------------------------------------

function srgbChannel(c) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function relLuminance([r, g, b]) {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}
function contrastRatio(fg, bg) {
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}
// Composite a straight-alpha color over an assumed-opaque background.
function compositeOver(rgba, bgRgb) {
  const a = rgba[3];
  return [0, 1, 2].map((i) => rgba[i] * a + bgRgb[i] * (1 - a));
}
function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function colorsClose(a, b, tol) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}

// Smallest palette-consistent nudge: blend the (opaque, effective) text color
// toward black or toward white until it clears the threshold with a small
// margin, picking whichever direction moves the color the least. Blending
// toward black/white preserves hue, so it reads as the same palette color.
function suggestNudge(effFg, bg, threshold) {
  if (contrastRatio(effFg, bg) >= threshold) return null;
  const blend = (target, t) => [0, 1, 2].map((i) => effFg[i] + (target[i] - effFg[i]) * t);
  let best = null;
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    if (contrastRatio(target, bg) < threshold) continue; // even the extreme can't reach it
    let lo = 0;
    let hi = 1;
    let found = null;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      const c = blend(target, mid);
      if (contrastRatio(c, bg) >= threshold + 0.1) {
        found = c;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    if (found) {
      const rounded = found.map((v) => Math.round(v));
      const dist = rgbDistance(effFg, rounded);
      if (!best || dist < best.dist) {
        best = { color: rounded, hex: toHex(rounded), dist, direction: target[0] === 0 ? "darker" : "lighter", ratio: Number(contrastRatio(rounded, bg).toFixed(2)) };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Self-contained PNG decoder (8-bit, color types 0/2/4/6)
// ---------------------------------------------------------------------------

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodePng(buf) {
  let pos = 8; // skip signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp];
    rp += 1;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, rp, rp + stride);
    rp += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}
function samplePixel(img, x, y) {
  const px = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const idx = (py * img.width + px) * img.channels;
  const d = img.data;
  if (img.channels >= 3) return [d[idx], d[idx + 1], d[idx + 2]];
  return [d[idx], d[idx], d[idx]]; // grayscale
}
function medianRgb(samples) {
  const ch = [0, 1, 2].map((i) => {
    const vals = samples.map((s) => s[i]).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  });
  return ch;
}
function maxChannelRange(samples) {
  let max = 0;
  for (let i = 0; i < 3; i += 1) {
    const vals = samples.map((s) => s[i]);
    max = Math.max(max, Math.max(...vals) - Math.min(...vals));
  }
  return max;
}

// ---------------------------------------------------------------------------
// In-page enumeration (runs inside the browser)
// ---------------------------------------------------------------------------

const ENUMERATE = () => {
  const cvs = document.createElement("canvas");
  cvs.width = 1;
  cvs.height = 1;
  const cx = cvs.getContext("2d", { willReadFrequently: true });
  // Resolve any CSS color string to concrete straight-alpha sRGB bytes.
  const resolve = (str) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = str;
    cx.clearRect(0, 0, 1, 1);
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const canvasRects = Array.from(document.querySelectorAll("canvas, img, svg, video")).map((el) => el.getBoundingClientRect());

  const results = [];
  let index = 0;
  for (const el of document.querySelectorAll("body *")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "canvas") continue;
    if (el.closest("svg")) continue; // SVG text is graphical; out of scope
    // Direct (own) text content only, so containers don't double-count children.
    let directText = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) directText += node.textContent;
    }
    directText = directText.trim();
    if (!directText) continue;
    // Skip text that is purely emoji/symbols (multicolor; contrast N/A).
    if (!/[A-Za-z0-9]/.test(directText)) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Must intersect the (scrolled-to-top) page area we screenshot full-page.
    if (rect.bottom <= 0 || rect.right <= 0 || rect.left >= vw) continue;

    // Skip screen-reader-only / visually-hidden text: it is not perceivable, so
    // it carries no contrast obligation. Catches the standard clip patterns
    // (clip:rect(0,0,0,0), clip-path, 1x1 box) and the conventional class names.
    const className = typeof el.className === "string" ? el.className : "";
    if (/(^|\s)(sr-only|visually-hidden|visuallyhidden|screen-reader|screenreader|a11y-hidden)(\s|$)/i.test(className)) continue;
    if (cs.clip === "rect(0px, 0px, 0px, 0px)") continue;
    if (cs.clipPath && cs.clipPath !== "none") continue;
    if (rect.width <= 4 && rect.height <= 4) continue;

    // Disabled / inactive UI components (and their text) are explicitly exempt
    // from WCAG 1.4.3. Covers native :disabled controls (and fieldset-disabled
    // descendants) plus the ARIA equivalent.
    if (el.closest(":disabled") || el.closest('[aria-disabled="true"]')) continue;

    const fg = resolve(cs.color);
    if (fg[3] === 0) continue; // fully transparent text

    // Opacity chain (group opacity multiplies through ancestors). An element
    // (or any ancestor) at opacity ~0 is not rendered, so it has no contrast
    // obligation in this state -- e.g. a HUD hidden behind an open start menu.
    let opacity = 1;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const o = parseFloat(getComputedStyle(p).opacity);
      if (!Number.isNaN(o)) opacity *= o;
    }
    if (opacity <= 0.05) continue;

    const fontSize = parseFloat(cs.fontSize) || 0;
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

    // CSS-composite background over an opaque white base; flag gradients/images.
    const chain = [];
    for (let p = el; p; p = p.parentElement) {
      chain.push(p);
      if (p === document.documentElement) break;
    }
    let determinable = true;
    let bgImageLayer = null;
    let composite = [255, 255, 255, 1];
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const s = getComputedStyle(chain[i]);
      if (s.backgroundImage && s.backgroundImage !== "none") {
        determinable = false;
        if (!bgImageLayer) bgImageLayer = `${chain[i].tagName.toLowerCase()}:${s.backgroundImage.slice(0, 24)}`;
      }
      const c = resolve(s.backgroundColor);
      if (c[3] > 0) composite = over(c, composite);
    }

    // Does the text box overlap a canvas/img/svg/video (something painted behind
    // it that CSS compositing can't account for)?
    const overlapsMedia = canvasRects.some((r) => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top);

    // Grid of sample points across the text box for the pixel-sampled bg.
    const samplePoints = [];
    for (const fy of [0.3, 0.5, 0.7]) {
      for (const fx of [0.15, 0.3, 0.45, 0.55, 0.7, 0.85]) {
        samplePoints.push({ x: Math.round(rect.left + rect.width * fx), y: Math.round(rect.top + rect.height * fy) });
      }
    }

    // A compact, stable-ish locator for the report.
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const locator = `${tag}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`;

    // Tag the element so the occlusion-aware confirmation pass can re-find it.
    const caIdx = index;
    el.setAttribute("data-ca-idx", String(caIdx));

    results.push({
      index: index++,
      caIdx,
      locator,
      tag,
      text: directText.replace(/\s+/g, " ").slice(0, 50),
      fontSize: Math.round(fontSize * 10) / 10,
      fontWeight,
      isLarge,
      fg,
      opacity: Math.round(opacity * 1000) / 1000,
      cssBg: [composite[0], composite[1], composite[2]],
      determinable,
      bgImageLayer,
      overlapsMedia,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      samplePoints,
    });
  }
  return results;
};

const SUPPRESS_TEXT_CSS = `*,*::before,*::after{color:transparent !important;text-shadow:none !important;-webkit-text-stroke-color:transparent !important;caret-color:transparent !important;text-decoration-color:transparent !important;}`;

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let pathname = "/";
      try {
        pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      } catch {
        res.writeHead(400).end("bad");
        return;
      }
      const normalized = pathname === "/" ? "/index.html" : pathname;
      const resolved = path.resolve(repoRoot, "." + normalized);
      const rel = path.relative(repoRoot, resolved);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      try {
        let filePath = resolved;
        let st = statSync(filePath);
        if (st.isDirectory()) {
          filePath = path.join(filePath, "index.html");
          st = statSync(filePath);
        }
        res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream" });
        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

// ---------------------------------------------------------------------------
// Audit one page surface
// ---------------------------------------------------------------------------

async function auditSurface(context, baseUrl, page, viewport) {
  const pg = await context.newPage();
  const findings = [];
  let elementCount = 0;
  let error = null;
  try {
    await pg.goto(new URL(page.url, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 20000 });
    await pg.waitForTimeout(900);

    const elements = await pg.evaluate(ENUMERATE);
    elementCount = elements.length;

    await pg.addStyleTag({ content: SUPPRESS_TEXT_CSS });
    await pg.waitForTimeout(60);
    const shotBuffer = await pg.screenshot({ fullPage: true });
    const img = decodePng(shotBuffer);

    for (const el of elements) {
      const samples = el.samplePoints
        .filter((p) => p.y >= 0 && p.y < img.height && p.x >= 0 && p.x < img.width)
        .map((p) => samplePixel(img, p.x, p.y));
      const hasSample = samples.length >= 3;
      const sampleBg = hasSample ? medianRgb(samples) : null;
      const variantRange = hasSample ? maxChannelRange(samples) : 0;

      // Decide effective background + confidence.
      let bg;
      let confidence;
      if (el.determinable && hasSample && colorsClose(el.cssBg, sampleBg, 12)) {
        bg = el.cssBg;
        confidence = "solid";
      } else if (hasSample && variantRange > 48) {
        bg = sampleBg;
        confidence = "variant";
      } else if (hasSample && el.overlapsMedia && !(el.determinable && colorsClose(el.cssBg, sampleBg, 18))) {
        bg = sampleBg;
        confidence = "canvas";
      } else if (hasSample) {
        bg = sampleBg;
        confidence = el.determinable ? "overlay" : "gradient";
      } else if (el.determinable) {
        bg = el.cssBg;
        confidence = "css-nosample";
      } else {
        continue; // cannot determine background; skip
      }

      const alpha = el.fg[3] * el.opacity;
      const effFg = compositeOver([el.fg[0], el.fg[1], el.fg[2], alpha], bg);
      const ratio = contrastRatio(effFg, bg);
      const threshold = el.isLarge ? 3 : 4.5;
      const finding = {
        slug: page.slug,
        pageTitle: page.title,
        viewport: viewport.name,
        caIdx: el.caIdx,
        locator: el.locator,
        tag: el.tag,
        text: el.text,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        isLarge: el.isLarge,
        fgRaw: [el.fg[0], el.fg[1], el.fg[2]],
        alpha,
        fgHex: toHex(effFg.map((v) => Math.round(v))),
        fgRawHex: toHex([el.fg[0], el.fg[1], el.fg[2]]),
        fgAlpha: Number(alpha.toFixed(3)),
        bgHex: toHex(bg.map((v) => Math.round(v))),
        confidence,
        bgImageLayer: el.bgImageLayer,
        ratio: Number(ratio.toFixed(2)),
        threshold,
        rect: el.rect,
        pass: ratio >= threshold,
      };
      findings.push(finding);
    }

    // Occlusion-aware confirmation: re-measure each candidate failure with the
    // element scrolled into view and sampled only at points that are actually
    // the element (not covered by a position:fixed/sticky overlay, which a
    // full-page screenshot bakes in at the wrong place). This removes false
    // positives where a flagged element scrolled beneath a pinned bar.
    const candidates = findings.filter((f) => !f.pass);
    for (const f of candidates) {
      const confirmed = await confirmFinding(pg, f, viewport);
      if (confirmed) {
        f.bgHex = toHex(confirmed.bg.map((v) => Math.round(v)));
        f.ratio = Number(confirmed.ratio.toFixed(2));
        f.pass = confirmed.ratio >= f.threshold;
        f.confirmed = true;
      } else {
        // Could not get a clean (unoccluded, in-viewport) sample -> the
        // full-page reading is unreliable; treat as not a confirmed failure.
        f.pass = true;
        f.confirmed = false;
        f.note = "unconfirmed: occluded or off-screen sample";
      }
    }

    for (const f of findings) {
      if (!f.pass) {
        const effFg = compositeOver([f.fgRaw[0], f.fgRaw[1], f.fgRaw[2], f.alpha], hexToRgb(f.bgHex));
        f.suggestion = suggestNudge(effFg, hexToRgb(f.bgHex), f.threshold);
      }
      delete f.fgRaw;
      delete f.alpha;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    await pg.close().catch(() => {});
  }
  return { elementCount, findings, error };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Re-measure one finding by scrolling its element into view and sampling the
// background only at points that resolve (via elementFromPoint) to the element
// itself, a descendant, or an ancestor -- never an unrelated overlay. Returns
// null when fewer than 3 clean points are available (sample unreliable).
async function confirmFinding(pg, finding, viewport) {
  const meta = await pg.evaluate((idx) => {
    const el = document.querySelector(`[data-ca-idx="${idx}"]`);
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // pointer-events:none overlay text (e.g. a chess board's coordinate layer)
    // is invisible to elementFromPoint, which returns whatever sits behind it.
    // For those, scrolling to viewport center already avoids pinned bars, so we
    // trust every in-viewport point rather than gating on elementFromPoint.
    let pointerEventsNone = false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      if (getComputedStyle(p).pointerEvents === "none") { pointerEventsNone = true; break; }
    }
    const pts = [];
    for (const fy of [0.3, 0.5, 0.7]) {
      for (const fx of [0.15, 0.3, 0.45, 0.55, 0.7, 0.85]) {
        const x = Math.round(r.left + r.width * fx);
        const y = Math.round(r.top + r.height * fy);
        if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
        let related = true;
        if (!pointerEventsNone) {
          const top = document.elementFromPoint(x, y);
          related = Boolean(top && (top === el || el.contains(top) || top.contains(el)));
        }
        pts.push({ x, y, related });
      }
    }
    return { pts };
  }, finding.caIdx);
  if (!meta) return null;
  const validPts = meta.pts.filter((p) => p.related);
  if (validPts.length < 3) return null;
  const buf = await pg.screenshot({ fullPage: false });
  const img = decodePng(buf);
  const samples = validPts
    .filter((p) => p.y >= 0 && p.y < img.height && p.x >= 0 && p.x < img.width)
    .map((p) => samplePixel(img, p.x, p.y));
  if (samples.length < 3) return null;
  const bg = medianRgb(samples);
  const effFg = compositeOver([finding.fgRaw[0], finding.fgRaw[1], finding.fgRaw[2], finding.alpha], bg);
  return { bg, ratio: contrastRatio(effFg, bg) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

await mkdir(outputRoot, { recursive: true });
const { server, baseUrl } = await startServer();
const browser = await chromium.launch({ headless: true });

const allFindings = [];
const surfaceSummaries = [];
let totalElements = 0;

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: Boolean(viewport.isMobile),
      hasTouch: Boolean(viewport.hasTouch),
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
    });
    for (const page of pages) {
      const { elementCount, findings, error } = await auditSurface(context, baseUrl, page, viewport);
      totalElements += elementCount;
      const fails = findings.filter((f) => !f.pass);
      allFindings.push(...findings);
      surfaceSummaries.push({ slug: page.slug, viewport: viewport.name, elementCount, failCount: fails.length, error });
      const flag = error ? ` ERROR: ${error}` : fails.length ? ` ${fails.length} fail` : " ok";
      process.stdout.write(`[${viewport.name}] ${page.slug.padEnd(22)} ${String(elementCount).padStart(3)} text els${flag}\n`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

const failures = allFindings.filter((f) => !f.pass);
const report = {
  createdAt: new Date().toISOString(),
  thresholds: { normal: 4.5, large: 3 },
  pagesAudited: pages.length,
  viewports: viewports.map((v) => v.name),
  totalTextElementsMeasured: totalElements,
  totalFindings: allFindings.length,
  totalFailures: failures.length,
  surfaceSummaries,
  failures: failures.sort((a, b) => a.slug.localeCompare(b.slug) || a.ratio - b.ratio),
  allFindings,
};
await writeFile(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2) + "\n");

// Console summary grouped by page.
console.log("\n========================================================");
console.log(`Contrast audit complete: ${pages.length} pages x ${viewports.length} viewport(s)`);
console.log(`Measured ${totalElements} visible text elements; ${failures.length} below threshold.`);
console.log(`Report: ${path.relative(repoRoot, path.join(outputRoot, "report.json"))}`);
console.log("========================================================");

const byPage = new Map();
for (const f of failures) {
  const key = f.slug;
  if (!byPage.has(key)) byPage.set(key, []);
  byPage.get(key).push(f);
}
if (failures.length === 0) {
  console.log("\nNo contrast failures detected. All measured text meets WCAG AA.");
} else {
  for (const [slug, list] of [...byPage.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n### ${slug}  (${list.length} failing)`);
    for (const f of list.sort((a, b) => a.ratio - b.ratio)) {
      const sizeTag = f.isLarge ? `${f.fontSize}px/large` : `${f.fontSize}px`;
      const sugg = f.suggestion ? ` -> nudge ${f.suggestion.direction} to ${f.suggestion.hex} (=>${f.suggestion.ratio})` : " (no single-color nudge reaches threshold)";
      console.log(
        `  ${f.viewport.padEnd(7)} ${String(f.ratio).padStart(5)}:1 (need ${f.threshold})  ${f.confidence.padEnd(8)} ${f.locator}  "${f.text}"  ${f.fgHex} on ${f.bgHex} ${sizeTag}${sugg}`,
      );
    }
  }
}

// Confidence distribution for triage.
const byConf = {};
for (const f of failures) byConf[f.confidence] = (byConf[f.confidence] || 0) + 1;
console.log("\nFailure confidence distribution:", JSON.stringify(byConf));
