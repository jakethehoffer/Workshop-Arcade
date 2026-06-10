const RETRYABLE_TRANSPORT_CODES = new Set([
  "ERR_NO_BUFFER_SPACE",
  "ERR_INSUFFICIENT_RESOURCES",
]);

const CLEAR_STORAGE_SCRIPT = () => {
  try {
    localStorage.clear();
  } catch {}
  try {
    sessionStorage.clear();
  } catch {}
};

export function playwrightTransportErrorCode(error) {
  const text = [
    error?.message,
    error?.stack,
    error?.cause?.message,
    error,
  ].filter(Boolean).join("\n");
  const match = text.match(/\b(?:net::)?(ERR_NO_BUFFER_SPACE|ERR_INSUFFICIENT_RESOURCES)\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function isRetryablePlaywrightTransportError(error) {
  const errorCode = playwrightTransportErrorCode(error);
  return Boolean(errorCode && RETRYABLE_TRANSPORT_CODES.has(errorCode));
}

export async function createIsolatedViewportContext(browser, viewport) {
  const context = await browser.newContext({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });
  await context.addInitScript(CLEAR_STORAGE_SCRIPT);
  return context;
}

export async function runWithPlaywrightTransportRetry({
  harness,
  slug,
  viewport,
  execute,
  recycle,
  onRetry = () => {},
  now = () => new Date().toISOString(),
}) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await execute(attempt);
    } catch (error) {
      const errorCode = playwrightTransportErrorCode(error);
      if (attempt === 2 || !errorCode || !RETRYABLE_TRANSPORT_CODES.has(errorCode)) {
        throw error;
      }

      const retry = {
        harness,
        slug,
        viewport,
        attempt: 2,
        errorCode,
        at: now(),
      };
      await recycle(retry);
      await onRetry(retry);
    }
  }

  throw new Error("Playwright transport retry exhausted unexpectedly");
}
