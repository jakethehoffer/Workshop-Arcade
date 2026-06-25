(function () {
  "use strict";

  var probeKey = "__workshop_storage_probe__";
  try {
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return;
  } catch (_) {
    // Sandboxed games run with an opaque origin, where the localStorage getter can throw.
  }

  // The catalog seeds saved entries via a #wa-storage= fragment so reads are
  // correct from the first statement (postMessage can't beat sync startup reads).
  // The fragment is kept (not stripped) and refreshed on every write so a
  // game-initiated location.reload() re-reads current data — the opaque sandboxed
  // frame has no other synchronous store. Without a seed the fallback stays
  // in-memory and posts nothing.
  var bridge = null;
  try {
    var seedMatch = /[#&]wa-storage=([^&]*)/.exec(window.location.hash || "");
    if (seedMatch) {
      var seed = JSON.parse(decodeURIComponent(seedMatch[1]));
      if (seed && seed.v === 1 && typeof seed.origin === "string" && typeof seed.slug === "string") {
        bridge = {
          origin: seed.origin,
          slug: seed.slug,
          entries: seed.entries && typeof seed.entries === "object" ? seed.entries : {}
        };
      }
    }
  } catch (_) {
    bridge = null;
  }

  var memory = Object.create(null);
  if (bridge) {
    for (var seededKey in bridge.entries) {
      if (Object.prototype.hasOwnProperty.call(bridge.entries, seededKey) && typeof bridge.entries[seededKey] === "string") {
        memory[seededKey] = bridge.entries[seededKey];
      }
    }
  }

  // Write-behind: ops are batched per task tick (one message per tick) to the
  // catalog, which persists them across sessions in its own localStorage.
  var pendingOps = [];
  var flushTimer = 0;

  function flushPending() {
    if (flushTimer) { window.clearTimeout(flushTimer); flushTimer = 0; }
    if (!bridge || !pendingOps.length) return;
    var ops = pendingOps; pendingOps = [];
    // A lost batch only costs persistence for those writes.
    try { window.parent.postMessage({ type: "workshop-arcade:storage-ops", v: 1, slug: bridge.slug, ops: ops }, bridge.origin); } catch (_) {}
  }

  // Mirror current memory back into the #wa-storage= fragment synchronously so a
  // game-initiated location.reload() re-reads the latest data on the next load.
  function persistSeed() {
    if (!bridge) return;
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search +
        "#wa-storage=" + encodeURIComponent(JSON.stringify({ v: 1, origin: bridge.origin, slug: bridge.slug, entries: memory })));
    } catch (_) {}
  }

  function queueOp(op) {
    if (!bridge) return;
    pendingOps.push(op);
    persistSeed();
    if (flushTimer) return;
    flushTimer = window.setTimeout(flushPending, 0);
  }

  var fallbackStorage = {
    get length() {
      return Object.keys(memory).length;
    },
    key: function (index) {
      return Object.keys(memory)[index] || null;
    },
    getItem: function (key) {
      key = String(key);
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },
    setItem: function (key, value) {
      key = String(key);
      value = String(value);
      memory[key] = value;
      queueOp({ op: "set", key: key, value: value });
    },
    removeItem: function (key) {
      key = String(key);
      delete memory[key];
      queueOp({ op: "remove", key: key });
    },
    clear: function () {
      memory = Object.create(null);
      queueOp({ op: "clear" });
    }
  };

  try {
    Object.defineProperty(window, "localStorage", {
      value: fallbackStorage,
      configurable: true
    });
  } catch (_) {
    window.workshopStorage = fallbackStorage;
  }

  if (bridge) {
    // Flush synchronously on teardown so a save made right before
    // hide/navigate/close survives the setTimeout(0) batch gap. (The kept-fresh
    // #wa-storage= fragment, not a hello/snapshot round-trip, now recovers a
    // game-initiated reload — the fragment is always at least as fresh as the
    // catalog mirror, so a snapshot reply could only clobber it with older data.)
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushPending(); });
  }
})();

// Accessibility baseline: game pages have no shared stylesheet, so this is the
// one place to apply a prefers-reduced-motion reset across every frozen game —
// collapsing CSS motion only when the user asked for it (JS canvas motion stays
// a per-game concern). Inline <style> is allowed by the game-page CSP.
(function () {
  "use strict";
  try {
    var css =
      "@media (prefers-reduced-motion: reduce){" +
      "*,*::before,*::after{" +
      "animation-duration:0.01ms !important;" +
      "animation-iteration-count:1 !important;" +
      "transition-duration:0.01ms !important;" +
      "scroll-behavior:auto !important}}";
    var style = document.createElement("style");
    style.setAttribute("data-workshop-reduced-motion", "");
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } catch (_) {
    // A missing reduced-motion reset is a graceful degradation, never fatal.
  }
})();
