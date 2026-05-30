export async function collectCanvasEvidence(page) {
  return await page.evaluate(collectCanvasEvidenceFromDocument);
}

export function getCanvasEvidenceFailure(evidence) {
  if (!evidence) return 'canvas evidence unavailable';
  if (evidence.error) return `canvas evidence failed: ${evidence.error}`;
  if (evidence.hasCanvas && !evidence.nonblank) return 'canvas appears blank';
  return null;
}

function collectCanvasEvidenceFromDocument() {
  const canvases = [...document.querySelectorAll('canvas')];

  function metadata(canvas, index) {
    const rect = canvas.getBoundingClientRect();
    const style = window.getComputedStyle(canvas);
    const visible = rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0;

    return {
      index,
      id: canvas.id || null,
      className: typeof canvas.className === 'string' ? canvas.className || null : null,
      ariaLabel: canvas.getAttribute('aria-label'),
      ariaHidden: canvas.getAttribute('aria-hidden'),
      role: canvas.getAttribute('role'),
      width: canvas.width,
      height: canvas.height,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      visible,
      sampled: false,
      nonblank: null,
      sampleCount: 0,
      uniqueSamples: 0,
      coloredSamples: 0,
      error: null,
    };
  }

  function sampleCanvas(canvas, entry) {
    if (!entry.visible || entry.width <= 0 || entry.height <= 0) return entry;

    const context = canvas.getContext('2d');
    if (!context) {
      entry.error = '2d context unavailable';
      return entry;
    }

    const samples = new Set();
    let coloredSamples = 0;
    let sampleCount = 0;

    try {
      for (let row = 1; row <= 5; row += 1) {
        for (let column = 1; column <= 7; column += 1) {
          const x = Math.max(0, Math.min(entry.width - 1, Math.floor((entry.width * column) / 8)));
          const y = Math.max(0, Math.min(entry.height - 1, Math.floor((entry.height * row) / 6)));
          const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
          samples.add(`${red},${green},${blue},${alpha}`);
          if (alpha > 0 && red + green + blue > 16) coloredSamples += 1;
          sampleCount += 1;
        }
      }
    } catch (error) {
      entry.sampleCount = sampleCount;
      entry.uniqueSamples = samples.size;
      entry.coloredSamples = coloredSamples;
      entry.error = error instanceof Error ? error.message : String(error);
      return entry;
    }

    entry.sampled = true;
    entry.sampleCount = sampleCount;
    entry.uniqueSamples = samples.size;
    entry.coloredSamples = coloredSamples;
    entry.nonblank = samples.size > 1 || coloredSamples > 0;
    return entry;
  }

  const canvasEvidence = canvases.map((canvas, index) => sampleCanvas(canvas, metadata(canvas, index)));
  const sampledCanvases = canvasEvidence.filter((canvas) => canvas.sampled);
  const nonblankCanvases = sampledCanvases.filter((canvas) => canvas.nonblank);
  const primary = nonblankCanvases[0] || sampledCanvases[0] || canvasEvidence[0] || null;
  const aggregateError = canvasEvidence.length && !sampledCanvases.length
    ? 'no visible sampleable canvas could be evaluated'
    : null;

  if (!primary) {
    return {
      hasCanvas: false,
      canvasCount: 0,
      sampledCanvasCount: 0,
      nonblankCanvasCount: 0,
      nonblank: null,
      width: 0,
      height: 0,
      sampleCount: 0,
      uniqueSamples: 0,
      coloredSamples: 0,
      error: null,
      canvases: [],
    };
  }

  return {
    hasCanvas: canvasEvidence.length > 0,
    canvasCount: canvasEvidence.length,
    sampledCanvasCount: sampledCanvases.length,
    nonblankCanvasCount: nonblankCanvases.length,
    nonblank: sampledCanvases.length ? nonblankCanvases.length > 0 : false,
    width: primary.width,
    height: primary.height,
    sampleCount: primary.sampleCount,
    uniqueSamples: primary.uniqueSamples,
    coloredSamples: primary.coloredSamples,
    error: aggregateError,
    canvases: canvasEvidence,
  };
}
