(function () {
  "use strict";

  var config = window.FACT_MATCH_CONFIG;
  if (!config || !Array.isArray(config.items) || !config.items.length) {
    document.body.textContent = "Fact match configuration is missing.";
    return;
  }

  var streakStorageKey = "fact-match:" + config.id + ":best";
  var shiftStorageKey = "fact-match:" + config.id + ":best-shift";
  var soundStorageKey = "fact-match:" + config.id + ":sound";
  function safeGet(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be unavailable in private contexts; gameplay should continue.
    }
  }
  function safeNumber(raw) {
    var n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  var CASES_PER_SHIFT = Math.min(8, config.items.length);
  var CASE_START_VALUE = 100;
  var CLUE_COST = 15;
  var WRONG_COST = 20;
  var MIN_CASE_VALUE = 25;
  var STREAK_BONUS_STEP = 10;
  var STREAK_BONUS_CAP = 50;

  function maxShiftScore() {
    var total = 0;
    for (var i = 0; i < CASES_PER_SHIFT; i += 1) {
      total += CASE_START_VALUE + Math.min(STREAK_BONUS_CAP, i * STREAK_BONUS_STEP);
    }
    return total;
  }
  var MAX_SHIFT_SCORE = maxShiftScore();

  function rankFor(score) {
    var ratio = MAX_SHIFT_SCORE > 0 ? score / MAX_SHIFT_SCORE : 0;
    if (ratio >= 0.85) return "S";
    if (ratio >= 0.7) return "A";
    if (ratio >= 0.5) return "B";
    if (ratio >= 0.3) return "C";
    return "D";
  }
  var RANK_LINES = {
    S: "Flawless shift. The whole precinct is talking.",
    A: "Sharp work, detective. Barely a clue wasted.",
    B: "Solid casework. A few files ran long.",
    C: "Rough shift. The board needs another look.",
    D: "The cases got away tonight. Run it back."
  };

  var state = {
    deck: [],
    caseIndex: 0,
    answer: null,
    cluesShown: 3,
    caseValue: CASE_START_VALUE,
    shiftScore: 0,
    streak: 0,
    bestStreak: safeNumber(safeGet(streakStorageKey, "0")),
    bestShift: safeNumber(safeGet(shiftStorageKey, "0")),
    solvedCount: 0,
    missedCount: 0,
    wrongGuessTotal: 0,
    cluesBoughtTotal: 0,
    eliminated: [],
    revealed: false,
    resolving: false,
    shiftOver: false,
    shiftCount: 1,
    round: 0,
    rank: null,
    newBestShift: false,
    visibleBankCount: 0,
    lastBankPick: null,
    lastGain: 0
  };
  var pendingAdvance = { timer: 0, remaining: 0, fire: null };
  var audio = {
    enabled: safeGet(soundStorageKey, "true") !== "false",
    ctx: null,
    lastSound: null,
    soundCount: 0,
    mutedEventCount: 0
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
    skipCount: 0,
    eliminateCount: 0,
    newRoundCount: 0,
    shiftOverCount: 0,
    cluesAdded: 0,
    resultState: null
  };
  var status = {
    lastStatus: "Ready.",
    lastStatusAt: null,
    statusCount: 0,
    lastInput: "init",
    lastInputAt: null,
    inputCount: 0,
    lastFeedback: "ready",
    lastFeedbackAt: null
  };
  var motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function prefersReducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

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
    .round-card strong{font-size:28px;color:var(--accent-2);font-variant-numeric:tabular-nums}
    .board{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:14px;align-items:stretch}
    .panel{background:linear-gradient(180deg,rgba(17,31,51,.94),rgba(9,19,33,.94));border:1px solid var(--line);border-radius:16px;box-shadow:0 22px 70px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.03);padding:16px}
    .play-panel{display:grid;grid-template-rows:auto auto 1fr auto auto;min-height:470px;position:relative;overflow:hidden}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .pill{border:1px solid var(--line);background:#091321;border-radius:12px;padding:8px 10px;color:var(--muted);font-weight:800}
    .pill strong{display:block;color:var(--ink);font-size:22px;line-height:1.05;margin-top:1px;font-variant-numeric:tabular-nums}
    .pill.value strong{color:var(--accent)}
    .howto{margin:8px 0 0;color:var(--muted);font-size:12.5px;line-height:1.35;font-weight:600}
    .howto b{color:var(--accent);font-weight:900}
    .clues{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0;align-content:start}
    .clue{border:1px solid rgba(80,240,200,.14);border-radius:14px;background:linear-gradient(180deg,#0c1828,#081321);padding:12px;min-height:88px;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
    .clue:first-child{grid-column:1/-1;background:linear-gradient(135deg,rgba(80,240,200,.12),rgba(247,198,106,.08)),#0a1727}
    .clue span{display:block;color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;font-weight:900}
    .guess{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:9px;margin-top:10px}
    input{min-width:0;border:1px solid var(--line);border-radius:12px;background:#050b13;color:var(--ink);padding:11px 12px;outline:0}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(80,240,200,.18)}
    button{border:1px solid var(--line);border-radius:12px;background:#102033;color:var(--ink);font-weight:900;padding:10px 12px;cursor:pointer}
    button.primary{background:linear-gradient(180deg,#5cf2cc,#26cbb6);color:#042524;border:0}
    button:hover{border-color:#335f82}
    button:disabled{opacity:.55;cursor:default}
    .actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}
    .actions button{background:rgba(16,32,51,.72);color:#cfe3f3;padding:9px 10px;font-size:14px}
    .result{min-height:26px;margin-top:10px;color:var(--warn);font-weight:900}
    .result.gain{color:var(--accent)}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .shell:fullscreen{width:100%;min-height:100vh;overflow:auto;background:radial-gradient(circle at 18% 0,#24476d 0,#0a1726 35%,#05080e 76%)}
    .shell:-webkit-full-screen{width:100%;min-height:100vh;overflow:auto;background:radial-gradient(circle at 18% 0,#24476d 0,#0a1726 35%,#05080e 76%)}
    .result.feedback-pulse{animation:feedbackPulse .68s ease-out both}
    .clue.feedback-new{animation:cluePulse .7s ease-out both}
    .play-panel.shake{animation:panelShake .4s ease-out both}
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
    @keyframes panelShake{
      0%,100%{transform:translateX(0)}
      20%{transform:translateX(-7px)}
      40%{transform:translateX(6px)}
      60%{transform:translateX(-4px)}
      80%{transform:translateX(2px)}
    }
    .stamp{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%) rotate(-8deg) scale(1);padding:10px 22px;border-radius:12px;border:3px solid var(--accent);color:var(--accent);font-size:clamp(26px,3.4vw,40px);font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(5,16,14,.82);box-shadow:0 0 34px rgba(80,240,200,.3);pointer-events:none;z-index:3;animation:stampIn .5s cubic-bezier(.2,1.6,.4,1) both}
    .stamp.miss{border-color:var(--accent-2);color:var(--accent-2);box-shadow:0 0 34px rgba(247,198,106,.28);background:rgba(24,16,4,.82)}
    @keyframes stampIn{
      0%{opacity:0;transform:translate(-50%,-50%) rotate(-8deg) scale(2.1)}
      60%{opacity:1;transform:translate(-50%,-50%) rotate(-8deg) scale(.96)}
      100%{opacity:1;transform:translate(-50%,-50%) rotate(-8deg) scale(1)}
    }
    .burst{position:absolute;top:44%;left:50%;width:0;height:0;pointer-events:none;z-index:2}
    .burst i{position:absolute;width:8px;height:8px;border-radius:2px;background:var(--accent);animation:burstFly .72s ease-out both}
    .burst i:nth-child(3n){background:var(--accent-2);border-radius:50%}
    .burst i:nth-child(4n){width:5px;height:5px}
    @keyframes burstFly{
      0%{opacity:1;transform:translate(0,0) rotate(0)}
      100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(260deg)}
    }
    .summary{position:absolute;inset:0;z-index:4;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;background:linear-gradient(180deg,rgba(9,19,33,.97),rgba(5,11,19,.97));border-radius:16px;padding:18px}
    .summary.open{display:flex}
    .summary .rank-letter{font-size:clamp(64px,9vw,110px);font-weight:900;line-height:1;color:var(--accent);text-shadow:0 0 44px rgba(80,240,200,.45);animation:stampIn .6s cubic-bezier(.2,1.6,.4,1) both}
    .summary.rank-low .rank-letter{color:var(--accent-2);text-shadow:0 0 44px rgba(247,198,106,.4)}
    .summary h2{margin:0;font-size:clamp(20px,2.6vw,28px)}
    .summary .score-line{font-size:clamp(30px,4vw,44px);font-weight:900;color:var(--ink);font-variant-numeric:tabular-nums}
    .summary .score-line small{display:block;font-size:13px;color:var(--muted);font-weight:800;letter-spacing:.1em;text-transform:uppercase}
    .summary .tally{display:flex;gap:14px;color:var(--muted);font-weight:800;font-size:14px;flex-wrap:wrap;justify-content:center}
    .summary .tally b{color:var(--ink);font-variant-numeric:tabular-nums}
    .summary .best-note{color:var(--accent);font-weight:900;min-height:20px}
    .summary .quip{color:var(--muted);font-weight:600;max-width:420px}
    .summary button{margin-top:4px;padding:12px 26px;font-size:16px}
    .bank-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
    .bank-head strong{font-size:18px}
    .bank{display:grid;gap:8px;max-height:500px;overflow:auto;padding-right:4px}
    .bank button{text-align:left;background:#07111d;border-radius:12px;padding:9px 10px;font-weight:800;transition:border-color .12s ease,background .12s ease,transform .12s ease,box-shadow .12s ease}
    .bank button:active{transform:translateY(1px);background:#0e1d2f}
    .bank button.bank-picked{border-color:rgba(80,240,200,.75);box-shadow:0 0 0 2px rgba(80,240,200,.14),0 0 18px rgba(80,240,200,.12)}
    .bank button.bank-out{background:#050b13;border-color:rgba(28,49,70,.7)}
    .bank button.bank-out strong,.bank button.bank-out .bank-name{text-decoration:line-through}
    .bank button.bank-out::after{content:"ruled out";display:block;color:var(--accent-2);font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-top:3px}
    .bank small{display:block;color:var(--muted);font-weight:600;margin-top:4px}
    @media (prefers-reduced-motion: reduce){
      .result.feedback-pulse,.clue.feedback-new,.play-panel.shake,.stamp,.summary .rank-letter{animation:none}
      .burst{display:none}
      .bank button{transition:none}
    }
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
      .stats{grid-template-columns:repeat(4,1fr);gap:6px}
      .pill{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;border-radius:10px;font-size:10px}
      .pill strong{font-size:16px;margin:0}
      .howto{font-size:11.5px;margin-top:6px}
      .clues{grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
      .clue{min-height:auto;padding:8px;border-radius:11px;font-size:13px;line-height:1.2}
      .clue:first-child{border-color:rgba(80,240,200,.34);font-size:14px}
      .clue span{font-size:9px;margin-bottom:4px;letter-spacing:.1em}
      .guess{grid-template-columns:minmax(0,1fr) 98px;gap:8px;margin-top:7px}
      #guessBtn{min-height:44px;font-size:15px;box-shadow:0 8px 18px rgba(38,203,182,.16)}
      input{padding:10px;border-radius:11px}
      button{padding:9px 10px;border-radius:11px}
      .actions{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:7px}
      .actions button{font-size:12px;padding:7px 6px;background:rgba(9,19,33,.76);color:#9fb8cb;border-color:rgba(80,240,200,.14)}
      .result{min-height:22px;margin-top:7px;font-size:13px}
      .stamp{font-size:clamp(22px,6.4vw,30px);padding:8px 16px}
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
      .actions{grid-template-columns:repeat(2,minmax(0,1fr))}
      .actions button{font-size:11px;padding:7px 5px}
      .stats{grid-template-columns:repeat(2,1fr);gap:5px}
      .pill{padding:6px 7px;font-size:10px}
      .pill strong{font-size:16px}
      .howto{font-size:11px}
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
          <span>Case File</span>
          <strong id="caseNumber">01/${String(CASES_PER_SHIFT).padStart(2, "0")}</strong>
        </div>
      </section>
      <section class="board">
        <div class="panel play-panel">
          <div class="stats">
            <div class="pill">Shift Score <strong id="shiftScore">0</strong></div>
            <div class="pill value">Case Value <strong id="caseValue">${CASE_START_VALUE}</strong></div>
            <div class="pill">Streak <strong id="streak">0</strong></div>
            <div class="pill">Best Shift <strong id="best">${state.bestShift}</strong></div>
          </div>
          <p class="howto">Name the suspect from the clues. Extra clues cost <b>-${CLUE_COST}</b>, wrong picks cost <b>-${WRONG_COST}</b> and get ruled out. Chain solves for streak bonuses across ${CASES_PER_SHIFT} cases.</p>
          <div class="clues" id="clues"></div>
          <div class="guess">
            <input id="guess" autocomplete="off" placeholder="Type or pick from bank" aria-label="Type your guess" />
            <button class="primary" id="guessBtn" type="button">Guess</button>
          </div>
      <div class="actions">
        <button id="hintBtn" type="button" title="Reveal another clue for -${CLUE_COST} case value (H)">More Clues <span id="clueCount">3</span>/${config.fields.length}</button>
        <button id="newBtn" type="button" title="Skip this case for zero points">Skip Case</button>
        <button id="revealBtn" type="button" title="Show the answer for zero points">Reveal</button>
        <button id="soundBtn" type="button">Sound On</button>
        <button id="fullscreenBtn" type="button" aria-pressed="false" title="Enter fullscreen (F)">Fullscreen</button>
      </div>
          <div class="result" id="result"></div>
          <div class="sr-only" id="statusLine" role="status" aria-live="polite">Ready.</div>
          <div class="summary" id="summary" role="region" aria-label="Shift summary">
            <div class="rank-letter" id="rankLetter">S</div>
            <h2>Shift Complete</h2>
            <div class="score-line"><span id="finalScore">0</span><small>of ${MAX_SHIFT_SCORE} possible</small></div>
            <div class="tally">
              <span>Solved <b id="tallySolved">0</b></span>
              <span>Missed <b id="tallyMissed">0</b></span>
              <span>Extra clues <b id="tallyClues">0</b></span>
              <span>Wrong picks <b id="tallyWrong">0</b></span>
            </div>
            <div class="best-note" id="bestNote"></div>
            <p class="quip" id="rankQuip"></p>
            <button class="primary" id="newShiftBtn" type="button">Start New Shift</button>
          </div>
        </div>
        <aside class="panel bank-panel">
          <div class="bank-head">
            <strong>Answer Bank</strong>
            <small id="bankCount"></small>
          </div>
          <input id="filter" autocomplete="off" placeholder="Filter names" aria-label="Filter answer bank" />
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
    soundBtn: document.getElementById("soundBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    result: document.getElementById("result"),
    statusLine: document.getElementById("statusLine"),
    shiftScore: document.getElementById("shiftScore"),
    caseValue: document.getElementById("caseValue"),
    streak: document.getElementById("streak"),
    best: document.getElementById("best"),
    filter: document.getElementById("filter"),
    bank: document.getElementById("bank"),
    bankCount: document.getElementById("bankCount"),
    summary: document.getElementById("summary"),
    rankLetter: document.getElementById("rankLetter"),
    finalScore: document.getElementById("finalScore"),
    tallySolved: document.getElementById("tallySolved"),
    tallyMissed: document.getElementById("tallyMissed"),
    tallyClues: document.getElementById("tallyClues"),
    tallyWrong: document.getElementById("tallyWrong"),
    bestNote: document.getElementById("bestNote"),
    rankQuip: document.getElementById("rankQuip"),
    newShiftBtn: document.getElementById("newShiftBtn")
  };
  els.caseNumber = document.getElementById("caseNumber");
  els.shell = document.querySelector(".shell");
  els.playPanel = document.querySelector(".play-panel");

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalize(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function updateSoundButton() {
    if (!els.soundBtn) return;
    els.soundBtn.textContent = audio.enabled ? "Sound On" : "Sound Off";
    els.soundBtn.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
  }

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function ageSeconds(timestamp) {
    return timestamp === null ? null : Math.max(0, (nowMs() - timestamp) / 1000);
  }

  function recordInput(input) {
    status.lastInput = input;
    status.lastInputAt = nowMs();
    status.inputCount += 1;
  }

  function noteStatus(message, feedbackType) {
    status.lastStatus = message || "";
    status.lastStatusAt = nowMs();
    status.statusCount += 1;
    if (feedbackType) {
      status.lastFeedback = feedbackType;
      status.lastFeedbackAt = status.lastStatusAt;
    }
    if (els.statusLine) {
      els.statusLine.textContent = status.lastStatus || "Ready.";
    }
  }

  function setResult(message, feedbackType, isGain) {
    els.result.textContent = message;
    els.result.classList.toggle("gain", !!isGain);
    noteStatus(message, feedbackType);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function fullscreenSupported() {
    var target = els.shell || document.documentElement;
    var canRequest = !!(target && (target.requestFullscreen || target.webkitRequestFullscreen));
    var canExit = !!(document.exitFullscreen || document.webkitExitFullscreen);
    return canRequest && canExit && document.fullscreenEnabled !== false && document.webkitFullscreenEnabled !== false;
  }

  function fullscreenActive() {
    return fullscreenElement() === (els.shell || document.documentElement);
  }

  function syncFullscreenButton() {
    if (!els.fullscreenBtn) return;
    var supported = fullscreenSupported();
    var active = fullscreenActive();
    els.fullscreenBtn.disabled = !supported;
    els.fullscreenBtn.textContent = active ? "Exit Full" : "Fullscreen";
    els.fullscreenBtn.setAttribute("aria-pressed", active ? "true" : "false");
    els.fullscreenBtn.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    els.fullscreenBtn.title = supported ? (active ? "Exit fullscreen (F)" : "Enter fullscreen (F)") : "Fullscreen unavailable";
  }

  function requestFullscreenChange(action, target) {
    try {
      var result = action.call(target);
      if (result && typeof result.catch === "function") {
        result.catch(syncFullscreenButton);
      }
    } catch (error) {
      syncFullscreenButton();
    }
  }

  function toggleFullscreen() {
    if (!fullscreenSupported()) {
      noteStatus("Fullscreen is unavailable in this browser.", "fullscreen-unavailable");
      return;
    }
    var action;
    if (fullscreenActive()) {
      action = document.exitFullscreen || document.webkitExitFullscreen;
      requestFullscreenChange(action, document);
      noteStatus("Exited fullscreen.", "fullscreen-exit");
    } else {
      var target = els.shell || document.documentElement;
      action = target.requestFullscreen || target.webkitRequestFullscreen;
      requestFullscreenChange(action, target);
      noteStatus("Entered fullscreen.", "fullscreen-enter");
    }
    syncFullscreenButton();
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  }

  function ensureAudioContext() {
    if (!audio.enabled) return null;
    if (!audio.ctx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audio.ctx = new AudioContext();
    }
    if (audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }
    return audio.ctx;
  }

  function playSound(type) {
    if (!audio.enabled) {
      audio.lastSound = "muted:" + type;
      audio.mutedEventCount += 1;
      return;
    }
    var ctx = ensureAudioContext();
    if (!ctx) return;

    var palette = {
      "clue-reveal": [523, 660],
      correct: [523, 659, 784, 1046],
      wrong: [220, 165],
      eliminate: [196, 147],
      reveal: [330, 247, 196],
      skip: [294, 220],
      "new-round": [392, 523],
      "shift-over": [523, 659, 784, 880, 1046],
      "empty-guess": [196]
    };
    var tones = palette[type] || [440];
    var step = type === "shift-over" ? 0.09 : 0.055;
    var now = ctx.currentTime;
    tones.forEach(function (freq, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, now + index * step);
      gain.gain.setValueAtTime(0.0001, now + index * step);
      gain.gain.exponentialRampToValueAtTime(0.045, now + index * step + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * step + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + index * step);
      osc.stop(now + index * step + 0.15);
    });
    audio.lastSound = type;
    audio.soundCount += 1;
  }

  function shuffledDeck() {
    var pool = config.items.slice();
    for (var i = pool.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = pool[i];
      pool[i] = pool[j];
      pool[j] = swap;
    }
    return pool.slice(0, CASES_PER_SHIFT);
  }

  function clearPendingAdvance() {
    if (pendingAdvance.timer) {
      clearTimeout(pendingAdvance.timer);
    }
    pendingAdvance.timer = 0;
    pendingAdvance.remaining = 0;
    pendingAdvance.fire = null;
  }

  function scheduleAdvance(delayMs, fire) {
    clearPendingAdvance();
    pendingAdvance.remaining = delayMs;
    pendingAdvance.fire = fire;
    pendingAdvance.timer = setTimeout(function () {
      var pendingFire = pendingAdvance.fire;
      clearPendingAdvance();
      if (pendingFire) pendingFire();
    }, delayMs);
  }

  function clearStamp() {
    var existing = els.playPanel.querySelectorAll(".stamp, .burst");
    Array.prototype.forEach.call(existing, function (node) {
      node.remove();
    });
  }

  function showStamp(text, isMiss) {
    clearStamp();
    var stamp = document.createElement("div");
    stamp.className = "stamp" + (isMiss ? " miss" : "");
    stamp.textContent = text;
    els.playPanel.appendChild(stamp);
  }

  function spawnBurst() {
    if (prefersReducedMotion()) return;
    var burst = document.createElement("div");
    burst.className = "burst";
    for (var i = 0; i < 14; i += 1) {
      var bit = document.createElement("i");
      var angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
      var distance = 60 + Math.random() * 90;
      bit.style.setProperty("--dx", Math.cos(angle) * distance + "px");
      bit.style.setProperty("--dy", Math.sin(angle) * distance - 20 + "px");
      bit.style.animationDelay = (Math.random() * 0.08) + "s";
      burst.appendChild(bit);
    }
    els.playPanel.appendChild(burst);
    setTimeout(function () {
      burst.remove();
    }, 900);
  }

  function shakePanel() {
    if (prefersReducedMotion()) return;
    els.playPanel.classList.remove("shake");
    void els.playPanel.offsetWidth;
    els.playPanel.classList.add("shake");
  }

  function startShift(options) {
    options = options || {};
    clearPendingAdvance();
    clearStamp();
    state.deck = shuffledDeck();
    state.caseIndex = 0;
    state.shiftScore = 0;
    state.streak = 0;
    state.solvedCount = 0;
    state.missedCount = 0;
    state.wrongGuessTotal = 0;
    state.cluesBoughtTotal = 0;
    state.shiftOver = false;
    state.rank = null;
    state.newBestShift = false;
    if (options.countShift !== false) state.shiftCount += 1;
    els.summary.classList.remove("open");
    els.newBtn.textContent = "Skip Case";
    nextCase({ record: options.record });
  }

  function nextCase(options) {
    options = options || {};
    clearPendingAdvance();
    clearStamp();
    state.answer = state.deck[state.caseIndex];
    state.caseIndex += 1;
    state.round += 1;
    state.cluesShown = Math.min(3, config.fields.length);
    state.caseValue = CASE_START_VALUE;
    state.revealed = false;
    state.resolving = false;
    state.eliminated = [];
    state.lastBankPick = null;
    state.lastGain = 0;
    els.guess.value = "";
    els.result.textContent = "";
    els.result.classList.remove("gain");
    if (els.caseNumber) {
      els.caseNumber.textContent = String(state.caseIndex).padStart(2, "0") + "/" + String(CASES_PER_SHIFT).padStart(2, "0");
    }
    renderClues();
    renderBank();
    updateStats();
    els.guess.focus();
    if (options.record !== false) {
      setResult("Case " + String(state.caseIndex).padStart(2, "0") + "/" + String(CASES_PER_SHIFT).padStart(2, "0") + " open.", "new-round");
      recordFeedback("new-round", { resultState: "new-round" });
    }
  }

  function finishShift() {
    clearPendingAdvance();
    clearStamp();
    state.shiftOver = true;
    state.resolving = false;
    state.rank = rankFor(state.shiftScore);
    state.newBestShift = state.shiftScore > state.bestShift;
    if (state.newBestShift) {
      state.bestShift = state.shiftScore;
      safeSet(shiftStorageKey, String(state.bestShift));
    }
    els.rankLetter.textContent = state.rank;
    els.summary.classList.toggle("rank-low", state.rank === "C" || state.rank === "D");
    els.finalScore.textContent = state.shiftScore;
    els.tallySolved.textContent = state.solvedCount;
    els.tallyMissed.textContent = state.missedCount;
    els.tallyClues.textContent = state.cluesBoughtTotal;
    els.tallyWrong.textContent = state.wrongGuessTotal;
    els.bestNote.textContent = state.newBestShift ? "New best shift!" : "Best shift: " + state.bestShift;
    els.rankQuip.textContent = RANK_LINES[state.rank] || "";
    els.summary.classList.add("open");
    els.newBtn.textContent = "New Shift";
    updateStats();
    setResult("Shift complete. Rank " + state.rank + " with " + state.shiftScore + " points.", "shift-over");
    recordFeedback("shift-over", { resultState: "shift-over" });
    els.newShiftBtn.focus();
  }

  function resolveCaseMiss(kind, message) {
    clearPendingAdvance();
    state.revealed = true;
    state.resolving = true;
    state.streak = 0;
    state.missedCount += 1;
    setResult(message, kind);
    updateStats();
    showStamp("Missed", true);
    recordFeedback(kind, { resultState: kind });
    scheduleAdvance(1300, function () {
      if (state.caseIndex >= CASES_PER_SHIFT) {
        finishShift();
      } else {
        nextCase({ record: true });
      }
    });
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

  function isEliminated(name) {
    return state.eliminated.indexOf(name) !== -1;
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
      var out = isEliminated(item.name);
      button.innerHTML = "<span class=\"bank-name\">" + escapeHtml(item.name) + "</span><small>" + escapeHtml(item.role || item.origin || "") + "</small>";
      if (out) {
        button.classList.add("bank-out");
        button.disabled = true;
        button.setAttribute("aria-label", item.name + " (ruled out)");
      }
      if (state.lastBankPick === item.name && !out) {
        button.classList.add("bank-picked");
      }
      button.addEventListener("click", function () {
        recordInput("bank:" + item.name);
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
    return ageSeconds(feedback.lastEventAt);
  }

  function activeCueCount() {
    var age = feedbackAge();
    return age !== null && age < 1.25 ? 1 : 0;
  }

  function recordFeedback(type, details) {
    details = details || {};
    feedback.lastEvent = type;
    feedback.lastEventAt = nowMs();
    feedback.eventCount += 1;
    feedback.resultState = details.resultState || type;
    status.lastFeedback = details.feedback || type;
    status.lastFeedbackAt = feedback.lastEventAt;
    playSound(type);
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
      feedback.eliminateCount += details.eliminated ? 1 : 0;
    } else if (type === "empty-guess") {
      feedback.guessSubmitCount += 1;
    } else if (type === "reveal") {
      feedback.revealCount += 1;
    } else if (type === "skip") {
      feedback.skipCount += 1;
    } else if (type === "new-round") {
      feedback.newRoundCount += 1;
    } else if (type === "shift-over") {
      feedback.shiftOverCount += 1;
    }
    pulseElement(els.result, "feedback-pulse");
  }

  function submitGuess() {
    if (state.shiftOver) {
      setResult("Shift complete. Start a new shift to keep playing.", "shift-locked");
      return;
    }
    if (state.revealed || state.resolving) return;
    var guessed = normalize(els.guess.value);
    if (!guessed) {
      setResult("Enter a guess first.", "empty");
      recordFeedback("empty-guess", { resultState: "empty" });
      return;
    }
    if (guessed === normalize(state.answer.name)) {
      // Lock out re-entry during the advance delay so spamming Enter or a
      // bank pick can't re-score the same correct answer and inflate the shift.
      state.resolving = true;
      state.streak += 1;
      if (state.streak > state.bestStreak) {
        state.bestStreak = state.streak;
        safeSet(streakStorageKey, String(state.bestStreak));
      }
      var bonus = Math.min(STREAK_BONUS_CAP, (state.streak - 1) * STREAK_BONUS_STEP);
      var gained = state.caseValue + bonus;
      state.lastGain = gained;
      state.shiftScore += gained;
      state.solvedCount += 1;
      setResult("Solved: " + state.answer.name + " +" + gained + (bonus ? " (streak +" + bonus + ")" : ""), "correct", true);
      updateStats();
      showStamp("Solved +" + gained, false);
      spawnBurst();
      recordFeedback("correct", { resultState: "correct" });
      scheduleAdvance(950, function () {
        if (state.caseIndex >= CASES_PER_SHIFT) {
          finishShift();
        } else {
          nextCase({ record: true });
        }
      });
      return;
    }
    var matched = null;
    for (var i = 0; i < config.items.length; i += 1) {
      if (normalize(config.items[i].name) === guessed) {
        matched = config.items[i];
        break;
      }
    }
    if (!matched) {
      setResult("No file under that name. Check the answer bank.", "unknown-name");
      recordFeedback("empty-guess", { resultState: "unknown-name" });
      return;
    }
    if (isEliminated(matched.name)) {
      setResult(matched.name + " is already ruled out.", "already-out");
      recordFeedback("empty-guess", { resultState: "already-out" });
      return;
    }
    state.eliminated.push(matched.name);
    state.wrongGuessTotal += 1;
    state.caseValue = Math.max(MIN_CASE_VALUE, state.caseValue - WRONG_COST);
    setResult("Not " + matched.name + ". Ruled out. Case value -" + WRONG_COST + ".", "wrong");
    updateStats();
    renderBank();
    shakePanel();
    recordFeedback("wrong", { resultState: "wrong", eliminated: true });
  }

  function updateStats() {
    els.shiftScore.textContent = state.shiftScore;
    els.caseValue.textContent = state.shiftOver ? 0 : state.caseValue;
    els.streak.textContent = state.streak;
    els.best.textContent = state.bestShift;
  }

  window.render_game_to_text = function () {
    return JSON.stringify({
      game: config.title,
      mode: state.shiftOver ? "shift-over" : state.revealed ? "revealed" : "guessing",
      round: state.round || 1,
      streak: state.streak,
      best: state.bestShift,
      bestStreak: state.bestStreak,
      cluesShown: state.cluesShown,
      visibleClues: config.fields.slice(0, state.cluesShown).map(function (field) {
        return { label: field.label, value: state.answer ? state.answer[field.key] : null };
      }),
      answer: state.answer ? state.answer.name : null,
      result: els.result.textContent,
      bankCount: config.items.length,
      visibleBankCount: state.visibleBankCount,
      filterText: els.filter.value,
      lastBankPick: state.lastBankPick,
      soundEnabled: audio.enabled,
      lastSound: audio.lastSound,
      lastStatus: status.lastStatus,
      lastInput: status.lastInput,
      lastFeedback: status.lastFeedback,
      shift: {
        caseIndex: state.caseIndex,
        casesPerShift: CASES_PER_SHIFT,
        score: state.shiftScore,
        caseValue: state.caseValue,
        maxScore: MAX_SHIFT_SCORE,
        bestShift: state.bestShift,
        solved: state.solvedCount,
        missed: state.missedCount,
        wrongGuesses: state.wrongGuessTotal,
        extraClues: state.cluesBoughtTotal,
        eliminated: state.eliminated.slice(),
        lastGain: state.lastGain,
        shiftCount: state.shiftCount,
        over: state.shiftOver,
        rank: state.rank,
        newBestShift: state.newBestShift
      },
      fullscreen: {
        supported: fullscreenSupported(),
        active: fullscreenActive(),
        shortcut: "F",
        buttonPressed: els.fullscreenBtn ? els.fullscreenBtn.getAttribute("aria-pressed") === "true" : false,
        label: els.fullscreenBtn ? els.fullscreenBtn.textContent : null,
        title: els.fullscreenBtn ? els.fullscreenBtn.title : null
      },
      status: {
        lastStatus: status.lastStatus,
        lastStatusAge: ageSeconds(status.lastStatusAt) === null ? null : Number(ageSeconds(status.lastStatusAt).toFixed(2)),
        statusCount: status.statusCount,
        lastInput: status.lastInput,
        lastInputAge: ageSeconds(status.lastInputAt) === null ? null : Number(ageSeconds(status.lastInputAt).toFixed(2)),
        inputCount: status.inputCount,
        lastFeedback: status.lastFeedback,
        lastFeedbackAge: ageSeconds(status.lastFeedbackAt) === null ? null : Number(ageSeconds(status.lastFeedbackAt).toFixed(2))
      },
      audio: {
        soundEnabled: audio.enabled,
        lastSound: audio.lastSound,
        soundCount: audio.soundCount,
        mutedEventCount: audio.mutedEventCount,
        contextState: audio.ctx ? audio.ctx.state : "none"
      },
      feedback: {
        lastEvent: feedback.lastEvent,
        eventAge: feedbackAge() === null ? null : Number(feedbackAge().toFixed(2)),
        eventCount: feedback.eventCount,
        clueRevealCount: feedback.clueRevealCount,
        guessSubmitCount: feedback.guessSubmitCount,
        correctCount: feedback.correctCount,
        wrongCount: feedback.wrongCount,
        revealCount: feedback.revealCount,
        skipCount: feedback.skipCount,
        eliminateCount: feedback.eliminateCount,
        newRoundCount: feedback.newRoundCount,
        shiftOverCount: feedback.shiftOverCount,
        cluesAdded: feedback.cluesAdded,
        resultState: feedback.resultState,
        activeCueCount: activeCueCount()
      }
    });
  };

  window.advanceTime = function (ms) {
    var delta = Number(ms);
    if (Number.isFinite(delta) && delta > 0 && pendingAdvance.fire) {
      pendingAdvance.remaining -= delta;
      if (pendingAdvance.remaining <= 0) {
        var fire = pendingAdvance.fire;
        clearPendingAdvance();
        fire();
      }
    }
    return window.render_game_to_text();
  };

  els.guessBtn.addEventListener("click", function () {
    recordInput("button:guess");
    submitGuess();
  });
  els.guess.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      recordInput("keyboard:enter");
      submitGuess();
    }
  });
  els.hintBtn.addEventListener("click", function () {
    recordInput("button:hint");
    if (state.shiftOver || state.resolving) return;
    if (state.cluesShown < config.fields.length) {
      state.cluesShown += 1;
      state.cluesBoughtTotal += 1;
      state.caseValue = Math.max(MIN_CASE_VALUE, state.caseValue - CLUE_COST);
      renderClues();
      updateStats();
      setResult("Clue added. Case value -" + CLUE_COST + ".", "clue");
      recordFeedback("clue-reveal", { cluesAdded: 1, resultState: "clue" });
    } else {
      setResult("All clues are showing.", "max-clues");
      recordFeedback("clue-reveal", { cluesAdded: 0, resultState: "max-clues" });
    }
  });
  els.newBtn.addEventListener("click", function () {
    recordInput("button:new-round");
    if (state.shiftOver) {
      startShift({ record: true });
      return;
    }
    if (state.resolving) return;
    resolveCaseMiss("skip", "Skipped. It was " + state.answer.name + ".");
  });
  els.revealBtn.addEventListener("click", function () {
    recordInput("button:reveal");
    if (state.shiftOver || state.resolving) return;
    resolveCaseMiss("reveal", "Answer: " + state.answer.name + ". No points this case.");
  });
  els.newShiftBtn.addEventListener("click", function () {
    recordInput("button:new-shift");
    startShift({ record: true });
    els.guess.focus();
  });
  els.soundBtn.addEventListener("click", function () {
    recordInput("button:sound");
    audio.enabled = !audio.enabled;
    safeSet(soundStorageKey, audio.enabled ? "true" : "false");
    updateSoundButton();
    if (audio.enabled) {
      noteStatus("Sound on.", "sound-on");
      playSound("new-round");
    } else {
      audio.lastSound = "muted";
      audio.mutedEventCount += 1;
      noteStatus("Sound off.", "sound-off");
    }
  });
  els.fullscreenBtn.addEventListener("click", function () {
    recordInput("button:fullscreen");
    toggleFullscreen();
  });
  els.filter.addEventListener("input", function () {
    recordInput("filter:bank");
    noteStatus("Bank filtered.", "filter");
    renderBank();
  });
  document.addEventListener("keydown", function (event) {
    var key = String(event.key || "").toLowerCase();
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTypingTarget(event.target)) return;
    if (key === "f") {
      event.preventDefault();
      recordInput("keyboard:f");
      toggleFullscreen();
    } else if (key === "h") {
      event.preventDefault();
      recordInput("keyboard:h");
      els.hintBtn.click();
    }
  });
  document.addEventListener("fullscreenchange", syncFullscreenButton);
  document.addEventListener("webkitfullscreenchange", syncFullscreenButton);

  updateSoundButton();
  syncFullscreenButton();
  startShift({ record: false, countShift: false });
})();
