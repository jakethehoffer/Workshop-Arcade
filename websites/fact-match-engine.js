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
    :root{color-scheme:dark;--bg:#071018;--panel:#0d1827;--panel-strong:#111f33;--ink:#ecf7ff;--muted:#9bb4c7;--accent:#50f0c8;--accent-2:#f7c66a;--line:#1c3146;--warn:#f7c66a}
    *{box-sizing:border-box}
    html,body{min-height:100%}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 0,#24476d 0,#0a1726 35%,#05080e 76%),linear-gradient(135deg,rgba(80,240,200,.08),rgba(247,198,106,.06));color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
    button,input{font:inherit}
    .shell{width:min(1180px,100%);min-height:100vh;margin:0 auto;padding:clamp(18px,3vw,34px);display:grid;grid-template-rows:auto minmax(0,1fr);gap:18px;align-content:center}
    .hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end}
    .eyebrow{color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase}
    h1{margin:5px 0 0;font-size:clamp(36px,6vw,72px);line-height:1;text-shadow:0 10px 34px rgba(80,240,200,.16);overflow-wrap:anywhere}
    .sub{margin:8px 0 0;color:var(--muted);max-width:720px;line-height:1.45;font-size:clamp(15px,2vw,18px)}
    .round-card{align-self:stretch;display:grid;gap:4px;align-content:center;min-width:180px;border:1px solid rgba(80,240,200,.24);border-radius:18px;background:rgba(5,11,19,.62);padding:14px 16px;box-shadow:0 16px 40px rgba(0,0,0,.26)}
    .round-card span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:900}
    .round-card strong{font-size:28px;color:var(--accent-2)}
    .board{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:18px;align-items:stretch}
    .panel{background:linear-gradient(180deg,rgba(17,31,51,.94),rgba(9,19,33,.94));border:1px solid var(--line);border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.03);padding:18px}
    .play-panel{display:grid;grid-template-rows:auto 1fr auto auto;min-height:510px}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .pill{border:1px solid var(--line);background:#091321;border-radius:14px;padding:10px 12px;color:var(--muted);font-weight:800}
    .pill strong{display:block;color:var(--ink);font-size:24px;line-height:1.1;margin-top:2px}
    .clues{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0;align-content:start}
    .clue{border:1px solid rgba(80,240,200,.14);border-radius:16px;background:linear-gradient(180deg,#0c1828,#081321);padding:15px;min-height:104px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
    .clue:first-child{grid-column:1/-1;background:linear-gradient(135deg,rgba(80,240,200,.12),rgba(247,198,106,.08)),#0a1727}
    .clue span{display:block;color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;font-weight:900}
    .guess{display:grid;grid-template-columns:minmax(0,1fr) 128px;gap:10px;margin-top:12px}
    input{min-width:0;border:1px solid var(--line);border-radius:14px;background:#050b13;color:var(--ink);padding:13px 14px;outline:0}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(80,240,200,.18)}
    button{border:1px solid var(--line);border-radius:14px;background:#102033;color:var(--ink);font-weight:900;padding:12px 14px;cursor:pointer}
    button.primary{background:linear-gradient(180deg,#5cf2cc,#26cbb6);color:#042524;border:0}
    button:hover{border-color:#335f82}
    .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
    .result{min-height:30px;margin-top:12px;color:var(--warn);font-weight:900}
    .bank-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
    .bank-head strong{font-size:18px}
    .bank{display:grid;gap:8px;max-height:536px;overflow:auto;padding-right:4px}
    .bank button{text-align:left;background:#07111d;border-radius:12px;padding:10px 11px;font-weight:800}
    .bank small{display:block;color:var(--muted);font-weight:600;margin-top:4px}
    @media (max-width:820px){
      .shell{padding:12px;gap:12px;align-content:start}
      .hero{grid-template-columns:1fr}
      .eyebrow{font-size:10px;letter-spacing:.18em}
      h1{font-size:clamp(30px,9vw,42px);line-height:1.02}
      .sub{font-size:14px;line-height:1.35;margin-top:5px}
      .round-card{display:none}
      .board{grid-template-columns:1fr}
      .panel{padding:14px;border-radius:16px}
      .play-panel{min-height:auto}
      .clues{grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
      .clue{min-height:auto;padding:10px;border-radius:12px;font-size:14px;line-height:1.25}
      .clue span{font-size:10px;margin-bottom:5px}
      .guess{grid-template-columns:minmax(0,1fr) 92px;gap:8px;margin-top:8px}
      input{padding:10px 11px;border-radius:12px}
      button{padding:10px 11px;border-radius:12px}
      .actions{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .bank{max-height:260px}
      .bank button{padding:9px 10px}
      .stats{grid-template-columns:repeat(3,1fr)}
      .pill{padding:9px}
      .pill strong{font-size:20px}
    }
    @media (max-width:420px){
      h1{font-size:clamp(30px,10vw,40px)}
      .panel{padding:12px}
      .actions{grid-template-columns:repeat(3,minmax(0,1fr))}
      .actions button{font-size:12px;padding:9px 7px}
      .stats{gap:7px}
    }
  `;
  document.head.appendChild(style);

  document.body.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div>
          <div class="eyebrow">Workshop Arcade Dossier</div>
          <h1>${escapeHtml(config.title)}</h1>
          <p class="sub">${escapeHtml(config.subtitle || "")}</p>
        </div>
        <div class="round-card">
          <span>Current Case</span>
          <strong id="caseNumber">01</strong>
        </div>
      </section>
      <section class="board">
        <div class="panel play-panel">
          <div class="stats">
            <div class="pill">Streak <strong id="streak">0</strong></div>
            <div class="pill">Best <strong id="best">${state.best}</strong></div>
            <div class="pill">Clues <strong id="clueCount">3</strong></div>
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
  els.caseNumber = document.getElementById("caseNumber");

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
    state.round = (state.round || 0) + 1;
    els.guess.value = "";
    els.result.textContent = "";
    if (els.caseNumber) els.caseNumber.textContent = String(state.round).padStart(2, "0");
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

  window.render_game_to_text = function () {
    return JSON.stringify({
      game: config.title,
      mode: state.revealed ? "revealed" : "guessing",
      round: state.round || 1,
      streak: state.streak,
      best: state.best,
      cluesShown: state.cluesShown,
      visibleClues: config.fields.slice(0, state.cluesShown).map(function (field) {
        return { label: field.label, value: state.answer[field.key] };
      }),
      answer: state.answer ? state.answer.name : null,
      result: els.result.textContent,
      bankCount: config.items.length
    });
  };

  window.advanceTime = function () {
    return window.render_game_to_text();
  };

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
