(function () {
  "use strict";

  var config = window.FACT_MATCH_CONFIG;
  if (!config || !Array.isArray(config.items) || !config.items.length) {
    document.body.textContent = "Fact match configuration is missing.";
    return;
  }

  var storageKey = "fact-match:" + config.id + ":best";
  var state = {
    answer: null,
    cluesShown: 3,
    streak: 0,
    best: Number(localStorage.getItem(storageKey) || 0),
    revealed: false
  };

  var style = document.createElement("style");
  style.textContent = `
    :root{color-scheme:dark;--bg:#071018;--panel:#0d1827;--ink:#ecf7ff;--muted:#9bb4c7;--accent:#50f0c8;--line:#1c3146;--warn:#f7c66a}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,#163250 0,#071018 48%,#04070c 100%);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
    button,input{font:inherit}
    .shell{width:min(1080px,100%);margin:0 auto;padding:22px;display:grid;gap:16px}
    .hero{display:grid;gap:8px}
    h1{margin:0;font-size:clamp(30px,6vw,56px);line-height:.95}
    .sub{margin:0;color:var(--muted);max-width:720px;line-height:1.45}
    .board{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}
    .panel{background:rgba(13,24,39,.92);border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.32);padding:16px}
    .stats{display:flex;gap:10px;flex-wrap:wrap}
    .pill{border:1px solid var(--line);background:#091321;border-radius:999px;padding:8px 11px;color:var(--muted);font-weight:700}
    .pill strong{color:var(--ink)}
    .clues{display:grid;gap:10px;margin:16px 0}
    .clue{border:1px solid var(--line);border-radius:12px;background:#081321;padding:12px}
    .clue span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;font-weight:800}
    .guess{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:12px}
    input{min-width:0;border:1px solid var(--line);border-radius:12px;background:#050b13;color:var(--ink);padding:12px;outline:0}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(80,240,200,.18)}
    button{border:1px solid var(--line);border-radius:12px;background:#102033;color:var(--ink);font-weight:800;padding:11px 13px;cursor:pointer}
    button.primary{background:linear-gradient(180deg,#5cf2cc,#26cbb6);color:#042524;border:0}
    button:hover{border-color:#335f82}
    .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    .result{min-height:26px;margin-top:12px;color:var(--warn);font-weight:800}
    .bank-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
    .bank{display:grid;gap:8px;max-height:470px;overflow:auto;padding-right:4px}
    .bank button{text-align:left;background:#07111d;border-radius:10px;padding:9px 10px;font-weight:700}
    .bank small{display:block;color:var(--muted);font-weight:600;margin-top:3px}
    @media (max-width:820px){.shell{padding:14px}.board{grid-template-columns:1fr}.guess{grid-template-columns:1fr}.bank{max-height:260px}}
  `;
  document.head.appendChild(style);

  document.body.innerHTML = `
    <main class="shell">
      <section class="hero">
        <h1>${escapeHtml(config.title)}</h1>
        <p class="sub">${escapeHtml(config.subtitle || "")}</p>
      </section>
      <section class="board">
        <div class="panel">
          <div class="stats">
            <div class="pill">Streak: <strong id="streak">0</strong></div>
            <div class="pill">Best: <strong id="best">${state.best}</strong></div>
            <div class="pill">Clues: <strong id="clueCount">3</strong></div>
          </div>
          <div class="clues" id="clues"></div>
          <div class="guess">
            <input id="guess" autocomplete="off" placeholder="Type a name or pick from the bank" />
            <button class="primary" id="guessBtn" type="button">Guess</button>
          </div>
          <div class="actions">
            <button id="hintBtn" type="button">More Clues</button>
            <button id="newBtn" type="button">New Round</button>
            <button id="revealBtn" type="button">Reveal</button>
          </div>
          <div class="result" id="result" aria-live="polite"></div>
        </div>
        <aside class="panel">
          <div class="bank-head">
            <strong>Answer Bank</strong>
            <small id="bankCount"></small>
          </div>
          <input id="filter" autocomplete="off" placeholder="Filter names" />
          <div class="bank" id="bank"></div>
        </aside>
      </section>
    </main>
  `;

  var els = {
    clues: document.getElementById("clues"),
    clueCount: document.getElementById("clueCount"),
    guess: document.getElementById("guess"),
    guessBtn: document.getElementById("guessBtn"),
    hintBtn: document.getElementById("hintBtn"),
    newBtn: document.getElementById("newBtn"),
    revealBtn: document.getElementById("revealBtn"),
    result: document.getElementById("result"),
    streak: document.getElementById("streak"),
    best: document.getElementById("best"),
    filter: document.getElementById("filter"),
    bank: document.getElementById("bank"),
    bankCount: document.getElementById("bankCount")
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalize(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function pickAnswer() {
    state.answer = config.items[Math.floor(Math.random() * config.items.length)];
    state.cluesShown = Math.min(3, config.fields.length);
    state.revealed = false;
    els.guess.value = "";
    els.result.textContent = "";
    renderClues();
    renderBank();
    els.guess.focus();
  }

  function renderClues() {
    els.clues.innerHTML = "";
    els.clueCount.textContent = state.cluesShown;
    config.fields.slice(0, state.cluesShown).forEach(function (field) {
      var row = document.createElement("div");
      row.className = "clue";
      row.innerHTML = "<span>" + escapeHtml(field.label) + "</span>" + escapeHtml(state.answer[field.key]);
      els.clues.appendChild(row);
    });
  }

  function renderBank() {
    var filter = normalize(els.filter.value);
    var items = config.items.filter(function (item) {
      return !filter || normalize(item.name).includes(filter) || normalize(item.role || "").includes(filter);
    });
    els.bankCount.textContent = items.length + "/" + config.items.length;
    els.bank.innerHTML = "";
    items.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.innerHTML = escapeHtml(item.name) + "<small>" + escapeHtml(item.role || item.origin || "") + "</small>";
      button.addEventListener("click", function () {
        els.guess.value = item.name;
        submitGuess();
      });
      els.bank.appendChild(button);
    });
  }

  function submitGuess() {
    if (state.revealed) return;
    var guessed = normalize(els.guess.value);
    if (!guessed) {
      els.result.textContent = "Enter a guess first.";
      return;
    }
    if (guessed === normalize(state.answer.name)) {
      state.streak += 1;
      if (state.streak > state.best) {
        state.best = state.streak;
        localStorage.setItem(storageKey, String(state.best));
      }
      els.result.textContent = "Correct: " + state.answer.name;
      updateStats();
      setTimeout(pickAnswer, 900);
    } else {
      state.streak = 0;
      els.result.textContent = "Not it. Try another clue or a bank pick.";
      updateStats();
    }
  }

  function updateStats() {
    els.streak.textContent = state.streak;
    els.best.textContent = state.best;
  }

  els.guessBtn.addEventListener("click", submitGuess);
  els.guess.addEventListener("keydown", function (event) {
    if (event.key === "Enter") submitGuess();
  });
  els.hintBtn.addEventListener("click", function () {
    if (state.cluesShown < config.fields.length) {
      state.cluesShown += 1;
      renderClues();
    }
  });
  els.newBtn.addEventListener("click", pickAnswer);
  els.revealBtn.addEventListener("click", function () {
    state.revealed = true;
    state.streak = 0;
    els.result.textContent = "Answer: " + state.answer.name;
    updateStats();
  });
  els.filter.addEventListener("input", renderBank);

  updateStats();
  pickAnswer();
})();
