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

  var memory = Object.create(null);
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
      memory[String(key)] = String(value);
    },
    removeItem: function (key) {
      delete memory[String(key)];
    },
    clear: function () {
      memory = Object.create(null);
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
})();
