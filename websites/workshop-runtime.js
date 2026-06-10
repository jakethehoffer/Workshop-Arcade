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

  // The catalog player seeds saved entries through a #wa-storage= fragment so
  // reads are correct from the first script statement (postMessage alone
  // cannot beat synchronous startup reads). Without a seed — direct loads,
  // foreign embeds, test harnesses — the fallback stays purely in-memory and
  // never posts messages anywhere.
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

  // Write-behind: ops are batched per task tick so a game saving every frame
  // sends one message per tick, not one per setItem call.
  var dirty = false;
  var pendingOps = [];
  var flushTimer = 0;

  function queueOp(op) {
    if (!bridge) return;
    dirty = true;
    pendingOps.push(op);
    if (flushTimer) return;
    flushTimer = window.setTimeout(function () {
      flushTimer = 0;
      var ops = pendingOps;
      pendingOps = [];
      try {
        window.parent.postMessage({ type: "workshop-arcade:storage-ops", v: 1, slug: bridge.slug, ops: ops }, bridge.origin);
      } catch (_) {
        // A lost batch only costs persistence for those writes.
      }
    }, 0);
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
    // The catalog answers the hello below with a fresh snapshot. That only
    // matters when the frame reloaded with a stale seed fragment; it is
    // ignored once the game has written anything this session.
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
  }
})();
