(function () {
  "use strict";

  var probeKey = "__workshop_storage_probe__";
  try {
    var nativeStorage = window.localStorage;
    nativeStorage.setItem(probeKey, "1");
    nativeStorage.removeItem(probeKey);
    // Offline player links use the same per-game mirror as the catalog.
    // Ordinary standalone links retain their existing native save space.
    var playerMatch = /^#wa-player=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
    if (window.parent === window && playerMatch && window.location.pathname.endsWith('/' + playerMatch[1] + '.html')) {
      var prefix = 'workshop-arcade:game:' + playerMatch[1] + ':';
      var keys = function () { return Object.keys(nativeStorage).filter(function (key) { return key.indexOf(prefix) === 0; }); };
      Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        get length() { return keys().length; },
        key: function (index) { var key = keys()[index]; return key === undefined ? null : key.slice(prefix.length); },
        getItem: function (key) { return nativeStorage.getItem(prefix + String(key)); },
        setItem: function (key, value) { nativeStorage.setItem(prefix + String(key), String(value)); },
        removeItem: function (key) { nativeStorage.removeItem(prefix + String(key)); },
        clear: function () { keys().forEach(function (key) { nativeStorage.removeItem(key); }); }
      }});
    }
    return;
  } catch (_) {
    // Sandboxed games run with an opaque origin, where the localStorage getter can throw.
  }

  // Frame names seed synchronous reads without putting large saves in URLs.
  var bridge = null;
  try {
    var seedMatch = /[#&]wa-storage=([^&]*)/.exec(window.location.hash || "");
    var namedSeed = window.name.indexOf('wa-storage=') === 0 ? window.name.slice(11) : '';
    if (namedSeed || seedMatch) {
      // Keep old fragments readable for games already open during an update.
      var seed = JSON.parse(namedSeed || decodeURIComponent(seedMatch[1]));
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

  // Batch mirror writes once per task tick.
  var pendingOps = [];
  var flushTimer = 0;

  function flushPending() {
    if (flushTimer) { window.clearTimeout(flushTimer); flushTimer = 0; }
    if (!bridge || !pendingOps.length) return;
    var ops = pendingOps; pendingOps = [];
    try { window.parent.postMessage({ type: "workshop-arcade:storage-ops", v: 1, slug: bridge.slug, ops: ops }, bridge.origin); } catch (_) {}
  }

  // Keep immediate game-initiated reloads current.
  function persistSeed() {
    if (!bridge) return;
    try {
      window.name = 'wa-storage=' + JSON.stringify({ v: 1, origin: bridge.origin, slug: bridge.slug, entries: memory });
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
    // Flush saves made just before teardown.
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushPending(); });
  }
})();

// Shared CSS reduced-motion baseline. Canvas motion stays game-specific.
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
