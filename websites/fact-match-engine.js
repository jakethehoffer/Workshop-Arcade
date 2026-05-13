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
    revealed: false,
    visibleBankCount: 0,
    lastBankPick: null
  };
  var feedback = {
    lastEvent: null,
    lastEventAt: null,
    eventCount: 0,
    clueRevealCount: 0,
    guessSubmitCount: 0,
    correctCount: 0,
    wrongCount: 0,
    revealCount: 0,
    newRoundCount: 0,
    cluesAdded: 0,
    resultState: null
  };

  var style = document.createElement("style");
  style.textContent = `
    :root{color-scheme:dark;--bg:#071018;--panel:#0d1827;--panel-strong:#111f33;--ink:#ecf7ff;--muted:#9bb4c7;--accent:#50f0c8;--accent-2:#f7c66a;--line:#1c3146;--warn:#f7c66a}
    *{box-sizing:border-box}
    html,body{min-height:100%}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 0,#24476d 0,#0a1726 35%,#05080e 76%),linear-gradient(135deg,rgba(80,240,200,.08),rgba(247,198,106,.06));color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
    button,input{font:inherit}
    .shell{width:min(1180px,100%);min-height:100vh;margin:0 auto;padding:clamp(14px,2.4vw,26px);display:grid;grid-template-rows:auto minmax(0,1fr);gap:14px;align-content:start}
    .hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}
    .eyebrow{color:var(--accent);font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}
    h1{margin:4px 0 0;font-size:clamp(34px,4.8vw,58px);line-height:1;text-shadow:0 10px 34px rgba(80,240,200,.16);overflow-wrap:anywhere}
    .sub{margin:6px 0 0;color:var(--muted);max-width:720px;line-height:1.38;font-size:clamp(14px,1.7vw,17px)}
    .round-card{align-self:stretch;display:grid;gap:3px;align-content:center;min-width:150px;border:1px solid rgba(80,240,200,.24);border-radius:16px;background:rgba(5,11,19,.62);padding:12px 14px;box-shadow:0 16px 40px rgba(0,0,0,.26)}
    .round-card span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:900}
    .round-card strong{font-size:28px;color:var(--accent-2)}
    .board{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:14px;align-items:stretch}
    .panel{background:linear-gradient(180deg,rgba(17,31,51,.94),rgba(9,19,33,.94));border:1px solid var(--line);border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.03);padding:16px}
    .play-panel{display:grid;grid-template-rows:auto 1fr auto auto;min-height:470px}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .pill{border:1px solid var(--line);background:#091321;border-radius:12px;padding:8px 10px;color:var(--muted);font-weight:800}
    .pill strong{display:block;color:var(--ink);font-size:22px;line-height:1.05;margin-top:1px}
    .clues{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0;align-content:start}
    .clue{border:1px solid rgba(80,240,200,.14);border-radius:14px;background:linear-gradient(180deg,#0c1828,#081321);padding:12px;min-height:88px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
    .clue:first-child{grid-column:1/-1;background:linear-gradient(135deg,rgba(80,240,200,.12),rgba(247,198,106,.08)),#0a1727}
    .clue span{display:block;color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;font-weight:900}
    .guess{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:9px;margin-top:10px}
    input{min-width:0;border:1px solid var(--line);border-radius:12px;background:#050b13;color:var(--ink);padding:11px 12px;outline:0}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(80,240,200,.18)}
    button{border:1px solid var(--line);border-radius:12px;background:#102033;color:var(--ink);font-weight:900;padding:10px 12px;cursor:pointer}
    button.primary{background:linear-gradient(180deg,#5cf2cc,#26cbb6);color:#042524;border:0}
    button:hover{border-color:#335f82}
    .actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
    .actions button{background:rgba(16,32,51,.72);color:#cfe3f3;padding:9px 10px;font-size:14px}
    .result{min-height:26px;margin-top:10px;color:var(--warn);font-weight:900}
    .result.feedback-pulse{animation:feedbackPulse .68s ease-out both}
    .clue.feedback-new{animation:cluePulse .7s ease-out both}
    @keyframes feedbackPulse{
      0%{text-shadow:0 0 0 rgba(80,240,200,0);transform:translateY(0)}
      35%{text-shadow:0 0 18px rgba(80,240,200,.72);transform:translateY(-1px)}
      100%{text-shadow:0 0 0 rgba(80,240,200,0);transform:translateY(0)}
    }
    @keyframes cluePulse{
      0%{box-shadow:0 0 0 rgba(80,240,200,0),inset 0 1px 0 rgba(255,255,255,.03)}
      45%{box-shadow:0 0 24px rgba(80,240,200,.3),inset 0 0 0 2px rgba(80,240,200,.38)}
      100%{box-shadow:0 0 0 rgba(80,240,200,0),inset 0 1px 0 rgba(255,255,255,.03)}
    }
    .bank-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
    .bank-head strong{font-size:18px}
    .bank{display:grid;gap:8px;max-height:500px;overflow:auto;padding-right:4px}
    .bank button{text-align:left;background:#07111d;border-radius:12px;padding:9px 10px;font-weight:800;transition:border-color .12s ease,background .12s ease,transform .12s ease,box-shadow .12s ease}
    .bank button:active{transform:translateY(1px);background:#0e1d2f}
    .bank button.bank-picked{border-color:rgba(80,240,200,.75);box-shadow:0 0 0 2px rgba(80,240,200,.14),0 0 18px rgba(80,240,200,.12)}
    .bank small{display:block;color:var(--muted);font-weight:600;margin-top:4px}
    @media (max-width:820px){
      .shell{padding:9px;gap:8px;align-content:start}
      .hero{grid-template-columns:1fr;gap:4px}
      .eyebrow{font-size:9px;letter-spacing:.16em}
      h1{font-size:clamp(25px,7.6vw,34px);line-height:1.02;margin-top:2px}
      .sub{font-size:13px;line-height:1.28;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .round-card{display:none}
      .board{grid-template-columns:1fr;gap:9px}
      .panel{padding:10px;border-radius:14px}
      .play-panel{min-height:auto}
      .stats{grid-template-columns:repeat(3,1fr);gap:6px}
      .pill{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:10px;font-size:11px}
      .pill strong{font-size:17px;margin:0}
      .clues{grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
      .clue{min-height:auto;padding:8px;border-radius:11px;font-size:13px;line-height:1.2}
      .clue:first-child{border-color:rgba(80,240,200,.34);font-size:14px}
      .clue span{font-size:9px;margin-bottom:4px;letter-spacing:.1em}
      .guess{grid-template-columns:minmax(0,1fr) 98px;gap:8px;margin-top:7px}
      #guessBtn{min-height:44px;font-size:15px;box-shadow:0 8px 18px rgba(38,203,182,.16)}
      input{padding:10px;border-radius:11px}
      button{padding:9px 10px;border-radius:11px}
      .actions{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px}
      .actions button{font-size:12px;padding:7px 6px;background:rgba(9,19,33,.76);color:#9fb8cb;border-color:rgba(80,240,200,.14)}
      .result{min-height:22px;margin-top:7px;font-size:13px}
      .bank-panel{padding:9px 10px}
      .bank-head{margin-bottom:7px}
      .bank-head strong{font-size:16px}
      .bank-head small{font-size:12px;color:var(--accent)}
      #filter{width:100%;margin-bottom:8px;border-color:rgba(80,240,200,.24);background:linear-gradient(180deg,#071321,#050b13)}
      .bank{max-height:min(34vh,250px);gap:6px;padding-right:2px}
      .bank button{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:7px 8px;border-radius:10px;font-size:13px}
      .bank small{margin-top:1px;font-size:11px;line-height:1.15}
    }
    @media (max-width:420px){
      h1{font-size:clamp(24px,8.2vw,32px)}
      .sub{font-size:12px;line-height:1.24}
      .panel{padding:9px}
      .guess{grid-template-columns:minmax(0,1fr) 92px}
      #guess{font-size:14px}
      .actions{grid-template-columns:repeat(3,minmax(0,1fr))}
      .actions button{font-size:11px;padding:7px 5px}
      .stats{gap:5px}
      .pill{padding:6px 7px;font-size:10px}
      .pill strong{font-size:16px}
      .clues{gap:6px}
      .clue{padding:7px}
      .bank{max-height:min(32vh,230px)}
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
            <input id="guess" autocomplete="off" placeholder="Type or pick from bank" />
            <button class="primary" id="guessBtn" type="button">Guess</button>
          </div>
          <div class="actions">
            <button id="hintBtn" type="button">More Clues</button>
            <button id="newBtn" type="button">New Round</button>
            <button id="revealBtn" type="button">Reveal</button>
          </div>
          <div class="result" id="result" aria-live="polite"></div>
        </div>
        <aside class="panel bank-panel">
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

  function pickAnswer(options) {
    options = options || {};
    state.answer = config.items[Math.floor(Math.random() * config.items.length)];
    state.cluesShown = Math.min(3, config.fields.length);
    state.revealed = false;
    state.round = (state.round || 0) + 1;
    state.lastBankPick = null;
    els.guess.value = "";
    els.result.textContent = "";
    if (els.caseNumber) els.caseNumber.textContent = String(state.round).padStart(2, "0");
    renderClues();
    renderBank();
    els.guess.focus();
    if (options.record !== false) {
      recordFeedback("new-round", { resultState: "new-round" });
    }
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
    state.visibleBankCount = items.length;
    els.bankCount.textContent = items.length + "/" + config.items.length;
    els.bank.innerHTML = "";
    items.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.innerHTML = escapeHtml(item.name) + "<small>" + escapeHtml(item.role || item.origin || "") + "</small>";
      if (state.lastBankPick === item.name) {
        button.classList.add("bank-picked");
      }
      button.addEventListener("click", function () {
        state.lastBankPick = item.name;
        Array.prototype.forEach.call(els.bank.querySelectorAll(".bank-picked"), function (picked) {
          picked.classList.remove("bank-picked");
        });
        button.classList.add("bank-picked");
        els.guess.value = item.name;
        submitGuess();
      });
      els.bank.appendChild(button);
    });
  }

  function pulseElement(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function pulseNewestClue() {
    var clues = els.clues.querySelectorAll(".clue");
    pulseElement(clues[clues.length - 1], "feedback-new");
  }

  function feedbackAge() {
    return feedback.lastEventAt === null ? null : Math.max(0, (performance.now() - feedback.lastEventAt) / 1000);
  }

  function activeCueCount() {
    var age = feedbackAge();
    return age !== null && age < 1.25 ? 1 : 0;
  }

  function recordFeedback(type, details) {
    details = details || {};
    feedback.lastEvent = type;
    feedback.lastEventAt = performance.now();
    feedback.eventCount += 1;
    feedback.resultState = details.resultState || type;
    if (type === "clue-reveal") {
      feedback.clueRevealCount += 1;
      feedback.cluesAdded += Number(details.cluesAdded || 0);
      pulseNewestClue();
    } else if (type === "correct") {
      feedback.guessSubmitCount += 1;
      feedback.correctCount += 1;
    } else if (type === "wrong") {
      feedback.guessSubmitCount += 1;
      feedback.wrongCount += 1;
    } else if (type === "empty-guess") {
      feedback.guessSubmitCount += 1;
    } else if (type === "reveal") {
      feedback.revealCount += 1;
    } else if (type === "new-round") {
      feedback.newRoundCount += 1;
    }
    pulseElement(els.result, "feedback-pulse");
  }

  function submitGuess() {
    if (state.revealed) return;
    var guessed = normalize(els.guess.value);
    if (!guessed) {
      els.result.textContent = "Enter a guess first.";
      recordFeedback("empty-guess", { resultState: "empty" });
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
      recordFeedback("correct", { resultState: "correct" });
      setTimeout(function () { pickAnswer({ record: true }); }, 900);
    } else {
      state.streak = 0;
      els.result.textContent = "Not it. Try another clue or a bank pick.";
      updateStats();
      recordFeedback("wrong", { resultState: "wrong" });
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
      bankCount: config.items.length,
      visibleBankCount: state.visibleBankCount,
      filterText: els.filter.value,
      lastBankPick: state.lastBankPick,
      feedback: {
        lastEvent: feedback.lastEvent,
        eventAge: feedbackAge() === null ? null : Number(feedbackAge().toFixed(2)),
        eventCount: feedback.eventCount,
        clueRevealCount: feedback.clueRevealCount,
        guessSubmitCount: feedback.guessSubmitCount,
        correctCount: feedback.correctCount,
        wrongCount: feedback.wrongCount,
        revealCount: feedback.revealCount,
        newRoundCount: feedback.newRoundCount,
        cluesAdded: feedback.cluesAdded,
        resultState: feedback.resultState,
        activeCueCount: activeCueCount()
      }
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
      els.result.textContent = "Clue added.";
      recordFeedback("clue-reveal", { cluesAdded: 1, resultState: "clue" });
    } else {
      els.result.textContent = "All clues are showing.";
      recordFeedback("clue-reveal", { cluesAdded: 0, resultState: "max-clues" });
    }
  });
  els.newBtn.addEventListener("click", function () { pickAnswer({ record: true }); });
  els.revealBtn.addEventListener("click", function () {
    state.revealed = true;
    state.streak = 0;
    els.result.textContent = "Answer: " + state.answer.name;
    updateStats();
    recordFeedback("reveal", { resultState: "revealed" });
  });
  els.filter.addEventListener("input", renderBank);

  updateStats();
  pickAnswer({ record: false });
})();
