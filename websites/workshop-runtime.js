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
  // Without a seed the fallback stays in-memory and posts nothing.
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
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (_) {
      // Leaving the fragment in place is harmless.
    }
  }

  // Write-behind: ops are batched per task tick (one message per tick).
  var dirty = false;
  var pendingOps = [];
  var flushTimer = 0;

  function flushPending() {
    if (flushTimer) { window.clearTimeout(flushTimer); flushTimer = 0; }
    if (!bridge || !pendingOps.length) return;
    var ops = pendingOps; pendingOps = [];
    // A lost batch only costs persistence for those writes.
    try { window.parent.postMessage({ type: "workshop-arcade:storage-ops", v: 1, slug: bridge.slug, ops: ops }, bridge.origin); } catch (_) {}
  }

  function queueOp(op) {
    if (!bridge) return;
    dirty = true;
    pendingOps.push(op);
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
    // The catalog answers this hello with a fresh snapshot; only matters on a
    // reload with a stale seed, and is ignored once the game has written.
    window.addEventListener("message", function (event) {
      if (event.source !== window.parent) return;
      if (event.origin !== bridge.origin) return;
      var data = event.data;
      if (!data || data.type !== "workshop-arcade:storage-snapshot" || data.v !== 1) return;
      if (dirty || !data.entries || typeof data.entries !== "object") return;
      var next = Object.create(null);
      for (var key in data.entries) {
        if (Object.prototype.hasOwnProperty.call(data.entries, key) && typeof data.entries[key] === "string") {
          next[key] = data.entries[key];
        }
      }
      memory = next;
    });
    try {
      window.parent.postMessage({ type: "workshop-arcade:storage-hello", v: 1, slug: bridge.slug }, bridge.origin);
    } catch (_) {
      // Without the hello the seed alone still covers the normal open path.
    }
    // Flush synchronously on teardown so a save made right before
    // hide/navigate/close survives the setTimeout(0) batch gap.
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
