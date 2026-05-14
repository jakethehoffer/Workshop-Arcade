Original prompt: Do this for me

## 2026-05-04 Codex

- Task: rank Workshop Arcade games by rendered quality, improve the weakest three, verify locally and in CI, then push.
- Current focus: gather screenshots and code context before choosing the three files to patch.
- Rendered all 20 games into `test-results/quality-pass/contact-sheet.png`.
- Selected first pass targets: `websites/arena.html` for sparse visuals and no touch movement, `websites/minesweeper.html` for cramped mobile layout, and `websites/brick-breaker.html` for startup/help friction plus pre-gesture audio warnings.
- Implemented the first pass: richer Arena rendering and drag movement, mobile-centered Minesweeper defaults/layout, Brick Breaker audio warning fix and mobile HUD/brick spacing.
- Final local checks passed: catalog validator, game smoke suite for 20 games, `git diff --check` with CRLF warnings only. Updated visual captures showed no console warnings or mobile overflow for the three changed games.
- Suggested next pass: repeat the rendered ranking flow for the next weakest set, likely the text-heavy fact-match variants or the older card/board games with dense mobile controls.

## 2026-05-04 Codex pass 2

- Refreshed current render targets into `test-results/quality-pass-2/contact-sheet.png`.
- Selected pass targets from screenshots: shared fact-match UI, Checkers audio warning, and mismatched Slope Runner catalog metadata.
- Implemented shared fact-match visual upgrade and added `render_game_to_text` / `advanceTime` hooks for automated inspection.
- Verified the pass with rerendered desktop/mobile screenshots, required web-game client runs, catalog validation, full game smoke tests, and `git diff --check`.
- Suggested next pass: polish Chess/Solitaire desktop density and add text-state hooks to more non-canvas games so rendered regressions are easier to diagnose.

## 2026-05-04 Codex pass 3

- Refreshed Chess and Klondike Solitaire desktop/mobile baselines into `test-results/quality-pass-3/before/` and rerendered the edited pass into `test-results/quality-pass-3/after/`.
- Tightened Chess board/sidebar density, mobile stacking, controls, move-history sizing, and added `render_game_to_text` / `advanceTime` diagnostics for board occupancy, move state, check state, flip state, and AI mode.
- Tightened Solitaire header/HUD, desktop board scale, mobile card readability, footer density, and added `render_game_to_text` / `advanceTime` diagnostics for stock/waste, foundations, tableau, moves, draw mode, time, stuck/win state, and last hint/action.
- Verified with the required web-game Playwright client plus direct interaction assertions for Chess move/undo and Solitaire draw/hint/undo/restart. Catalog validation and full game smoke tests passed locally.
- Suggested next pass: continue rendered-quality ranking with the remaining older DOM games that lack first-class diagnostic hooks or have dense mobile control surfaces.

## 2026-05-04 Codex pass 4

- Refreshed the full 20-game desktop/mobile contact sheet into `test-results/quality-pass-4/before/contact-sheet.png`.
- Selected Checkers, Lexica, and 2048 as the next pass targets from current screenshots and hook coverage: Checkers had slight mobile overflow and no diagnostics, Lexica opened with a blocking startup modal and no diagnostics, and 2048 lacked diagnostics plus responsive shell polish.
- Initial implementation: tightened Checkers and 2048 responsive layout, made Lexica show the playable grid immediately, and added `render_game_to_text` / `advanceTime` hooks to all three targets.
- Verified the edited targets with focused desktop/mobile captures in `test-results/quality-pass-4/after/`, the required web-game client, direct Playwright interaction assertions, catalog validation, and the full 20-game smoke suite.
- Suggested next pass: add diagnostics to the remaining games without hooks, then do a smaller mobile control-density pass on any title still close to the overflow limit.

## 2026-05-04 Codex pass 5

- Standardized `render_game_to_text` / `advanceTime` diagnostics across the six older arcade targets: Brick Breaker, Neon Snake, Block Drop, Minesweeper, Maze Chase, and Metro Dash.
- Kept gameplay rules intact while exposing score/state, player or board positions, active hazards/objects, timers, controls, overlays, and audio flags in compact JSON payloads.
- Captured focused before/after desktop and mobile screenshots in `test-results/quality-pass-5/`, ran the required web-game client for all six targets, and verified direct interaction assertions for movement, reveal/flag, launch/drop, and runner/chase state updates.
- Fixed a concrete visual regression caught during inspection: Neon Snake mobile HUD and touch controls now wrap instead of clipping off-screen.
- Local checks passed: catalog validation, full 20-game smoke suite, and `git diff --check`.
- Suggested next pass: decide whether to add hooks to the remaining endless/idle pages or move into a mobile control-density polish pass for the games that still feel cramped.

## 2026-05-05 Codex pass 6

- Implemented the combined endless diagnostics and mobile density pass for Arcade Jump, Sky Hopper, Slope Runner, Idle Tycoon, and Arena.
- Added compact `render_game_to_text` / `advanceTime` coverage to Arcade Jump, Sky Hopper, Slope Runner, and Idle Tycoon, and added the missing `advanceTime` hook to Arena.
- Tightened mobile first-screen density for Arcade Jump, Slope Runner, and Idle Tycoon without changing gameplay rules, saves, audio preferences, or catalog metadata.
- Captured focused before/after desktop and mobile screenshots in `test-results/quality-pass-6/`, ran the required web-game client for all five targets, and verified direct Playwright assertions for movement, flap/pipe spawn, slope steering, idle click/buy/run, and Arena movement/spawn state.
- Local checks passed: catalog validation, full 20-game smoke suite, and `git diff --check`.
- Suggested next pass: run one full catalog screenshot ranking now that diagnostics coverage is broad, then polish any remaining visual weak spots rather than adding more hooks.

## 2026-05-06 Codex pass 7

- Added the durable full-catalog rendered ranking harness as `npm run capture:games`, writing screenshots, `summary.json`, `contact-sheet.html`, and `contact-sheet.png` under `test-results/render-ranking/<timestamp>/`.
- Baseline ranking in `test-results/render-ranking/2026-05-06T13-22-26-356Z/` selected shared fact-match mobile, Idle Tycoon mobile menu density, and 2048 text/control overflow as the top polish targets.
- Tightened shared fact-match mobile density so Guess and round actions land earlier in the first viewport, hid the Idle Tycoon background app while the save menu is open and compacted its mobile menu cards, and separated 2048's control hint from the button row.
- Final capture in `test-results/render-ranking/2026-05-06T13-38-45-182Z/` showed the selected issues cleared from the top ranking with no console/page/network errors or mobile horizontal overflow.
- Verified with the required web-game client for 2048, Hero Fact Match, and Idle Tycoon plus direct Playwright assertions for 2048 moves, fact-match hint/correct guess, and Idle Tycoon slot/click/buy state.
- Local checks passed: `npm run capture:games`, catalog validation, and full 20-game smoke suite.
- Suggested next pass: refine low-priority harness heuristics around intentional stacked-card DOM and then address the real remaining mobile first-action candidates, especially Neon Snake and Lexica, if screenshots still show buried controls.

## 2026-05-06 Codex pass 8

- Ran the fresh full-catalog rendered ranking baseline in `test-results/render-ranking/2026-05-06T13-59-21-859Z/`, then targeted the remaining real mobile first-screen issues plus ranking noise.
- Refined `scripts/capture-games.mjs` so tiny overlay overflow, intentional Solitaire card stacks, Arcade Jump decorative menu clipping, and Lexica's playable "Play Again" reset no longer rank as hard visual issues.
- Improved Neon Snake mobile by adding a visible Start/Pause/Resume/Restart action in the HUD and wrapping the canvas start instructions so they no longer clip on 390px screens.
- Improved Minesweeper mobile by tightening the control grid/footer and sizing the beginner board to the available mobile width while keeping larger-board fit behavior intact.
- Final capture in `test-results/render-ranking/2026-05-06T18-30-22-154Z/` showed all ranked surfaces at score 0 with no console/page/network issues or mobile horizontal overflow.
- Verified with the required web-game client for Snake, Minesweeper, and Lexica plus direct mobile Playwright assertions for Snake start/move, Minesweeper reveal/flag, and Lexica typed guess.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: move from first-screen cleanup to deeper subjective gameplay polish, starting with any zero-score screenshots that still feel sparse or visually dated despite passing the automated rubric.

## 2026-05-06 Codex pass 9

- Baseline: `test-results/render-ranking/2026-05-06T18-58-06-224Z/` scored all 40 rendered surfaces at zero automated issues, so target selection moved to manual player-feel inspection.
- Selected Block Drop, Metro Dash, and Maze Chase as the weakest subjective surfaces: Block Drop hid play behind its help modal, Metro Dash's first frame felt too sparse, and Maze Chase mobile made the board compete with surrounding UI.
- Implemented the polish pass: Block Drop now shows the board and a compact Play/Help panel immediately, Metro Dash has a wider/brighter runway and stronger title start panel, and Maze Chase has a denser shell with a larger board emphasis.
- Final capture in `test-results/render-ranking/2026-05-06T19-17-24-584Z/` scored all 40 rendered surfaces at zero automated issues and the target desktop/mobile screenshots were manually inspected.
- Verified with the required web-game client for Block Drop, Metro Dash, and Maze Chase plus state inspection showing Block Drop running with occupied cells, Metro Dash playing with distance/coins/obstacle state, and Maze Chase playing with pellet progress.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: after this polish lands, use the fresh final contact sheet to decide whether to keep improving subjective game feel or add any missing reusable assertions to the capture harness.

## 2026-05-07 Codex pass 10

- Extended `npm run capture:games` into an interactive evidence harness: every catalog game now runs a lightweight recipe, captures post-action screenshots, records pre/post `render_game_to_text` state, scores weak interaction evidence, and shows first/post screenshots in the contact sheet.
- Baseline interaction ranking exposed Arcade Jump's post-start dead-state evidence; the recipe was refined and Arcade Jump now starts with the same upward bounce used by normal platform contacts, with diagnostics correctly reporting visible game-over state.
- With all surfaces scoring zero after recipe fixes, applied the fallback visual polish targets: Sky Hopper first screen now fills letterbox space and separates the prompt from the bird, Arena menu now shows live player/enemy/gem preview art, and shared fact-match mobile uses a tighter guess row with unclipped placeholder text.
- Final capture: `test-results/render-ranking/2026-05-07T02-12-31-284Z/`, with all 40 desktop/mobile surfaces at score 0 and interaction state changes confirmed for the polished targets.
- Verified with the required web-game client for Arcade Jump, Sky Hopper, Arena, and Hero Fact Match, plus direct Playwright state assertions for start/flap/move/hint changes.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the interactive contact sheet to choose the next subjective gameplay-feel targets, likely deeper after-action HUD/readability improvements rather than more harness plumbing.

## 2026-05-07 Codex pass 11

- Baseline: `test-results/render-ranking/2026-05-07T04-56-33-715Z/` again scored all 40 surfaces at zero, so target selection came from mobile post-action feel in the interactive contact sheet.
- Improved Neon Snake mobile active play by top-biasing the board, measuring HUD/control reserves in `resize()`, and hiding duplicate bottom Music/Help buttons while preserving HUD controls, D-pad, rules, audio, and diagnostics.
- Improved Idle Tycoon mobile active flow by compacting the title, stats tray, clicker core, meter/facts, and surge card so Ventures, Run All, Hire Managers, and the first venture card appear earlier.
- Improved Klondike Solitaire mobile active play by increasing mobile card height/fan spacing, expanding tableau drop zones, reducing gaps, and shortening footer help copy while preserving DOM cards, draw/undo/hint/restart/autocomplete behavior, saves, and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T05-11-48-271Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and the three target mobile post-action screenshots manually inspected.
- Verified with the required web-game client for Snake, Idle Tycoon, and Solitaire plus direct mobile Playwright assertions for Snake board position/head movement, Idle cash and venture visibility, and Solitaire stock/waste/move/tableau sizing.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: run another subjective pass from the interactive contact sheet focused on desktop active-play feel, especially any game whose post-action state is technically correct but visually static or hard to read.

## 2026-05-07 Codex pass 12

- Baseline: `test-results/render-ranking/2026-05-07T05-38-34-564Z/` scored all 40 surfaces at zero, so desktop active-play targets were selected by visual inspection rather than automated score.
- Selected Sky Hopper, Klondike Solitaire, and 2048 as the weakest desktop post-action feel surfaces: Sky Hopper had inert side letterboxing, Solitaire underused desktop tableau height, and 2048 looked flat compared with newer games.
- Improved Sky Hopper desktop by drawing a wide parallax backdrop in the letterbox margins while keeping the original world-space play lane, physics, controls, audio, and diagnostics unchanged.
- Improved Klondike Solitaire desktop by increasing card size/fan spacing, widening the board, and extending tableau drop zones so the post-draw layout uses the available height while preserving DOM cards and rules.
- Improved 2048 desktop with richer background accents, stronger board depth, larger stage, and tile shadow/highlight rendering without changing movement, scoring, saves, undo, or diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T06-03-36-868Z/`, with all 40 desktop/mobile surfaces at zero automated issues; target desktop screenshots were manually inspected.
- Verified with required web-game clients for Sky Hopper, Solitaire, and 2048 plus direct desktop Playwright assertions for active Sky Hopper state, Solitaire draw/tableau sizing, and 2048 grid changes.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`. A first capture/check attempt hit local timeout/resource noise, then passed on rerun with longer timeout.
- Suggested next pass: use the interactive contact sheet to make a small shared polish pass for non-game menu/status affordances, especially duplicated or low-priority controls that remain visible during active play.

## 2026-05-07 Codex pass 13

- Baseline: `test-results/render-ranking/2026-05-07T20-47-22-791Z/` scored all 40 surfaces at zero, so active-play chrome targets were selected by visual inspection.
- Selected Neon Snake, Brick Breaker, and the shared Fact Match engine because their active-play screens still let status or low-priority controls compete with the actual game/action surface.
- Implemented compact Snake utility pills, split Brick Breaker stats from utility controls, and tightened shared Fact Match header/panel/action density while preserving gameplay, saves, audio, diagnostics, and manifest data.
- Final capture: `test-results/render-ranking/2026-05-07T21-01-59-864Z/`, with all 40 surfaces at zero automated issues; target first/post screenshots were manually inspected.
- Verified with required web-game clients for Snake, Brick Breaker, and Hero Fact Match plus direct full-page Playwright assertions for active state, chrome sizing, no overflow, and fact-match clue/guess behavior.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the contact sheet to pick one deeper gameplay-feel target that is still mechanically correct but could benefit from clearer mid-game feedback or movement readability.

## 2026-05-07 Codex pass 14

- Baseline: `test-results/render-ranking/2026-05-07T21-19-19-247Z/` scored all 40 surfaces at zero; Metro Dash was selected as the mechanically solid game with the weakest mid-game feedback/readability.
- Strengthened Metro Dash lane depth cues, motion streaks, obstacle danger glow, coin pickup rings/score pops, near-miss callouts, crash flash/shake, and feedback diagnostics.
- Final capture: `test-results/render-ranking/2026-05-07T21-32-43-254Z/`, with all 40 surfaces at zero automated issues and the Metro Dash desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for forced coin pickup, near miss, and mobile crash feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: apply the same mid-game feedback lens to another mechanically solid canvas game, likely Slope Runner danger/risk feedback or Arena hit/collection readability.

## 2026-05-08 Codex pass 15

- Baseline: `test-results/render-ranking/2026-05-08T03-46-00-643Z/` scored all 40 surfaces at zero; Slope Runner was selected for mid-game risk feedback because obstacle threat, edge danger, and speed read softly despite solid mechanics.
- Strengthened Slope Runner active play with brighter risk rails, center guide ticks, horizon fog, speed streaks, obstacle warning glow, near-miss particles/ring/`CLOSE` pop, and stronger crash flash/shake.
- Extended diagnostics in `websites/shape-inlay.html`: fixed ball/current-segment reporting to use `config.ballZ`, added `dangerCue`, `dangerObstacle`, `nearMissCount`, `lastNearMissAge`, `crashFlash`, `edgePulse`, and feedback particle counts.
- Final capture: `test-results/render-ranking/2026-05-08T03-56-39-090Z/`, with all 40 surfaces at zero automated issues and Slope Runner desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for danger cue, near miss feedback, mobile crash feedback, no overflow, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: apply the same movement/readability lens to Arena hit/collection feedback, especially active combat/collision clarity.

## 2026-05-08 Codex pass 16

- Baseline: `test-results/render-ranking/2026-05-08T04-23-44-679Z/` scored all 40 surfaces at zero; Arena was selected because active play was mechanically healthy but hit danger, enemy intent, dust pickup, invulnerability, and game-over feedback read quietly.
- Strengthened `websites/arena.html` active play with enemy intent rings/trails, type-specific threat outlines/glow, player danger rings, stronger hit flash/shake, dust pickup rings/particles, clearer `+1 XP` pop text, and a more visible invulnerability aura.
- Extended Arena diagnostics with nearest enemy distance/type, `dangerCue`, pickup and hit ages, pending game-over state, invulnerability time, and compact feedback particle/ring/popup counts while keeping `advanceTime(ms)` on the existing deterministic step path.
- Final capture: `test-results/render-ranking/2026-05-08T04-38-56-153Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Arena desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for danger cue, dust pickup feedback, hit/pending-over feedback, restart flow, no overflow, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game mid-play feedback polish on another mechanically solid title, likely Brick Breaker powerup/collision feedback or Maze Chase pellet/power-state readability.

## 2026-05-08 Codex pass 17

- Baseline: `test-results/render-ranking/2026-05-08T05-04-08-082Z/` scored all 40 surfaces at zero; Brick Breaker was selected because active play worked but ball hits, brick breaks, drops, powerups, and misses still read quietly compared with newer feedback passes.
- Strengthened `websites/brick-breaker.html` with visual-only feedback state for ball trails/launch cues, brick hit flashes, break particles/rings, bomb warning glow, paddle contact rings, powerup auras/collection pops, shield/life-loss flash, and short screen shake.
- Extended Brick Breaker diagnostics with compact `feedback` fields for last hit/break/paddle/powerup/life/shield ages, last powerup type, impact/break/collection counters, particle/ring count, popup count, screen flash, and screen shake.
- Final capture: `test-results/render-ranking/2026-05-08T15-45-11-949Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Brick Breaker desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for brick impact, life-loss feedback, powerup spawn, FIRE collection feedback/effect state, diagnostics updates, and no console/page errors.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue the same single-game feedback approach on Maze Chase pellet/power-state readability, or shift to catalog-level tuning if contact-sheet evidence shows a broader pattern.

## 2026-05-08 Codex pass 18

- Baseline: `test-results/render-ranking/2026-05-08T16-09-54-898Z/` scored all 40 surfaces at zero; Maze Chase was selected because pellet consumption, power state, ghost danger, ghost-eat feedback, and life loss still read flatter than the recent Arena/Brick Breaker feedback passes.
- Strengthened `websites/maze-chase.html` with visual-only feedback state for pellet sparkles, score/status pops, power-pellet board/player pulses, frightened ghost auras, harmful ghost threat rings, fruit/ghost-eat rings, life-loss flash, and short screen shake.
- Extended Maze Chase diagnostics with `dangerCue`, `nearestGhost`, compact event ages/counters, feedback particle/ring counts, popup count, `screenFlash`, and `screenShake`, while keeping `advanceTime(ms)` deterministic for feedback timers and non-playing settle states.
- Final capture: `test-results/render-ranking/2026-05-08T16-24-40-362Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Maze Chase desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client for Maze Chase plus direct Playwright checks for pellet feedback and harmful collision/life-loss feedback; the focused client state also confirmed power-pellet and ghost-eat diagnostics.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game mid-play feedback polish on Tetris line/lock/clear readability or Minesweeper reveal/flag feedback, depending on the next contact-sheet review.

## 2026-05-10 Codex pass 19

- Baseline: `test-results/render-ranking/2026-05-11T01-08-06-609Z/` scored all 40 surfaces at zero; Block Drop was selected because mobile Hold/Next chrome overlapped the spawn lane and active play feedback for lock, hard drop, line clear, and top-out was too quiet.
- Fixed `websites/tetris.html` mobile spawn-lane readability by increasing the mobile top reserve and reducing bottom reserve so Hold/Next end above the canvas without shrinking the board below current readability.
- Added visual-only feedback state for movement/rotation/drop/lock, hard-drop trails, lock-warning outlines, row flashes, line-clear/level/top-out pops, particles, screen flash, and screen shake.
- Refactored line clearing to return original cleared row indexes, then extended diagnostics with compact feedback ages, counters, last clear rows/count/label, lock warning, particle/popup counts, screen flash, and screen shake.
- Final capture: `test-results/render-ranking/2026-05-11T01-20-10-698Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Block Drop desktop/mobile post-action screenshots manually inspected.
- Verified with the required web-game client plus direct Playwright checks for mobile non-overlap/no overflow, hard-drop/lock feedback, a bounded bot-produced real line clear, and top-out/game-over feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue single-game feedback polish on Minesweeper reveal/flag/chord feedback, or review the latest contact sheet for another mechanically solid game whose mid-play events still read quietly.

## 2026-05-11 Codex pass 20

- Baseline: `test-results/render-ranking/2026-05-11T05-58-18-676Z/` scored all 40 surfaces at zero; Minesweeper was selected because reveals, flags, chord attempts, mine hits, and wins still read quietly compared with the newer feedback-polished games.
- Strengthened `websites/minesweeper.html` with visual-only reveal waves, flag rings, chord success/bump cues, mine-hit flash/shake, win pulse, compact particles, and short pop labels while preserving board rules, first-click safety, timer, difficulty controls, audio preferences, and layout.
- Extended Minesweeper diagnostics with compact feedback ages, counters, last affected cells, active particle/ring/popup counts, screen flash color, and screen shake; `advanceTime(ms)` now steps feedback deterministically and redraws without audio or preference side effects.
- Final capture: `test-results/render-ranking/2026-05-11T06-12-30-008Z/`, with all 40 desktop/mobile surfaces still at zero automated issues and Minesweeper desktop/mobile post-action screenshots manually inspected.
- Verified with the required develop-web-game client plus direct Playwright checks for reveal, flag, chord-bump, mine-hit/game-over, restart, and deterministic custom-board win feedback.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: review the latest interactive contact sheet for remaining mechanically solid games whose short-lived feedback is hard to see in the broad capture, or add a targeted capture recipe that records immediate event-feedback frames.

## 2026-05-11 Codex pass 21

- Baseline: `test-results/render-ranking/2026-05-11T15-15-31-676Z/`; the catalog was clean but the broad capture did not preserve short-lived event feedback.
- Extended `scripts/capture-games.mjs` to capture first, immediate event, and settled post-action screenshots, write `eventScreenshot`, `eventState`, `eventSignals`, and `feedbackActive` into `summary.json`, and render all three evidence frames in the contact sheet.
- Updated interaction scoring so hard failures still lead, while state-changing actions without event-frame feedback diagnostics receive a low-grade ranking signal. Refined the Metro Dash recipe after the final harness exposed a deterministic recipe-caused game-over.
- Polished `websites/checkers.html` with last-move from/to highlights, move trail, capture burst/ring, crown pulse, move/capture pops, and compact feedback diagnostics.
- Polished `websites/chess.html` with stronger from/to highlights, move arrow, capture/check pulse, label pops, deterministic `advanceTime(ms)` feedback stepping, and compact feedback diagnostics.
- Final capture: `test-results/render-ranking/2026-05-11T15-40-39-439Z/`; Checkers and Chess desktop/mobile score zero with active feedback metadata. The top remaining low-grade signals are 2048, fact-match clue actions, Arcade Jump, and Sky Hopper missing event-frame feedback diagnostics.
- Verified with the required develop-web-game client for Chess/Checkers plus direct Playwright capture paths for Chess `e2-e4 d7-d5 e4xd5` and Checkers `c3-d4 b6-c5 d4xb6`, confirming diagnostics, screenshots, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: use the new event-frame ranking to add compact feedback diagnostics to the low-score deterministic targets, starting with 2048 tile slide/merge feedback or shared Fact Match clue/action feedback.

## 2026-05-11 Codex pass 22

- Baseline: `test-results/render-ranking/2026-05-11T17-42-36-367Z/`; no hard failures, with 2048 and shared Fact Match pages ranking only for missing event-frame feedback diagnostics.
- Added compact 2048 feedback diagnostics for move direction, moved tile count, merge count, score gained, largest merged tile, spawned tile, merge targets, event age, active pops, and event counters; added small visual merge/spawn/score cues without changing rules, undo, saves, random spawn behavior, or layout.
- Added shared Fact Match feedback diagnostics and non-layout-shifting clue/result pulse cues for clue reveal, guess submit, correct/wrong guess, reveal, and new round across all four fact-match games.
- Refined only the Sky Hopper and Slope Runner capture recipes after final captures showed recipe-caused settled-frame game-over false positives; global scoring stayed unchanged.
- Final capture: `test-results/render-ranking/2026-05-11T18-15-36-967Z/`; 2048 and all Fact Match desktop/mobile surfaces score zero with active event feedback metadata.
- Verified with required develop-web-game clients for 2048 and Hero Fact Match plus direct Playwright checks for 2048 merge/spawn feedback and all four Fact Match clue feedback paths, including Hero wrong-guess feedback and mobile no-overflow checks.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, `node --check scripts/capture-games.mjs`, and `git diff --check`.
- Suggested next pass: continue clearing low-grade event-feedback signals for Arcade Jump and Sky Hopper first, then Idle Tycoon, Metro Dash, and Slope Runner if the event-frame contact sheet still shows quiet but correct interactions.

## 2026-05-11 Codex pass 23

- Baseline: `test-results/render-ranking/2026-05-11T18-15-36-967Z/`; no hard failures, with Arcade Jump and Sky Hopper ranking only for missing immediate event-frame feedback diagnostics.
- Added Arcade Jump feedback diagnostics and visual-only canvas cues for run start, steering input, bounce/landing, double-jump, powerup pickup, enemy/shield hits, shield rescue, and game over while preserving physics, scoring, saves, audio preferences, layout, and metadata.
- Added Sky Hopper feedback diagnostics and visual-only cues for start, flap, pipe score, hit/game-over, active cue count, nearest pipe, and danger cue without changing flap physics, scoring, saves, audio preferences, layout, or metadata.
- Fixed an Arcade Jump deterministic test-hook edge where `advanceTime()` could make the following RAF delta negative and feed a negative cue radius into canvas drawing.
- Final capture: `test-results/render-ranking/2026-05-11T21-37-54-450Z/`; Arcade Jump and Sky Hopper desktop/mobile now score zero with active event-feedback metadata.
- Verified with focused desktop/mobile Playwright clients for Arcade Jump start/steer/double-jump and Sky Hopper start/flap, confirming feedback diagnostics, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue clearing low-grade event-frame diagnostics for Idle Tycoon, Metro Dash, Slope Runner, Neon Snake, and Klondike Solitaire, choosing the first target after inspecting the latest contact sheet for actual player-feel impact.

## 2026-05-12 Codex pass 24

- Baseline: `test-results/render-ranking/2026-05-12T04-35-05-286Z/`; the remaining 12 rendered surfaces were the six planned targets at desktop/mobile, each ranking only for missing immediate event-frame feedback diagnostics.
- Added compact event-feedback diagnostics to `websites/idle-tycoon.html`, `websites/metro-dash.html`, `websites/shape-inlay.html`, `websites/snake.html`, `websites/solitare.html`, and `websites/wordle.html` for slot/click, runner actions, steer/start, snake turns, stock draw/recycle, and Lexica text input.
- Reused existing visual systems for small non-layout-shifting cues: clicker cash feedback, runner action rings/pops, Slope start/steer cues, a Snake head ring, Solitaire stock/waste pile pulse, and a Lexica active-row input pulse.
- Final capture: `test-results/render-ranking/2026-05-12T04-47-50-314Z/`; all 40 rendered surfaces now score zero, with the six target groups exposing active `feedback` metadata in the immediate event frame.
- Verified with the develop-web-game client for Snake, Metro Dash, Slope Runner, and Solitaire plus direct Playwright coverage for all six targets, confirming feedback counters/state changes, no new console/page errors, and no gameplay regressions in the scripted flows.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: treat the zero-score contact sheet as a qualitative review tool and pick any remaining improvement by actual player feel rather than diagnostic debt; the automated event-frame closure backlog is cleared.

## 2026-05-13 Codex pass 25

- Baseline: `test-results/render-ranking/2026-05-13T15-23-19-108Z/`; all 40 surfaces scored zero, so this pass targeted qualitative mobile scanability in the four shared Fact Match games.
- Polished `websites/fact-match-engine.js` mobile layout: tighter hero/subtitle, compact stat pills, clearer clue hierarchy, stronger Guess affordance, quieter secondary actions, and denser answer-bank rows/filter styling.
- Added small shared answer-bank affordances and diagnostics for `visibleBankCount`, `filterText`, and `lastBankPick` while preserving datasets, scoring, local best score, event feedback, metadata, and static-site behavior.
- Final capture: `test-results/render-ranking/2026-05-13T15-41-15-855Z/`; all 40 surfaces still score zero, and all Fact Match desktop/mobile surfaces have zero overflow and active interaction feedback.
- Verified with the required develop-web-game client for Hero Fact Match, direct Playwright shared-engine smoke across all four Fact Match pages, catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: keep using the zero-score contact sheet for qualitative selection; likely targets are remaining player-feel refinements in mobile board/card density or first-screen clarity rather than diagnostics.

## 2026-05-13 Codex pass 26

- Baseline: `test-results/render-ranking/2026-05-14T01-22-47-834Z/`; all 40 surfaces scored zero, so this pass targeted qualitative Klondike Solitaire mobile touch readability.
- Polished `websites/solitare.html` mobile CSS by enlarging the 390px card footprint, rank/suit/pip text, fan spacing, and tableau drop-zone height while preserving horizontal fit and desktop stability.
- Tightened mobile header/footer density and added stronger non-layout-shifting touch feedback for active cards, stock/waste presses, hints, and valid/invalid drop targets.
- Extended Klondike diagnostics with a compact `layout` object reporting viewport, mobile mode, card size, fan spacing, board width, and horizontal overflow for focused mobile assertions.
- Final capture: `test-results/render-ranking/2026-05-14T01-33-44-852Z/`; all 40 surfaces still score zero, and Klondike mobile renders larger 51x80 cards with zero overflow.
- Verified with the required develop-web-game client for Solitaire stock draw plus direct mobile Playwright checks for stock draw, hint, a legal drag when available, undo/restart, no clipped card text, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score review; likely choose another mobile board/card interaction surface only if actual contact-sheet evidence shows player friction.

## 2026-05-14 Codex pass 27

- Baseline: `test-results/render-ranking/2026-05-14T03-00-17-317Z/`; all 40 surfaces scored zero, so this pass targeted qualitative 2048 visual cohesion and touch feel.
- Restyled `websites/2048.html` into the darker Workshop Arcade visual language with higher-contrast page chrome, score badges, buttons, help/overlay panels, board cells, tile shadows, and more distinct high-value tile colors.
- Improved mobile first/play screens by compacting controls and making the board fill 370px at the 390px viewport with zero horizontal overflow.
- Strengthened canvas feedback for merge rings, spawn outlines, score/direction pops, tile glow, and board press affordance while preserving 2048 rules, random spawns, scoring, undo, overlays, saves, keyboard/swipe controls, and existing event diagnostics.
- Extended 2048 diagnostics with a compact `layout` object for viewport, mobile mode, board/canvas sizes, canvas pixel size, and horizontal overflow.
- Final capture: `test-results/render-ranking/2026-05-14T03-23-38-360Z/`; all 40 surfaces score zero, with 2048 desktop/mobile manually inspected.
- Verified with the required develop-web-game client for 2048 plus direct desktop/mobile Playwright checks for bounded merge feedback, undo, help open/close, overlay restart usability, board sizing, no offscreen controls, and no overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score contact-sheet review, likely targeting another page whose visual style still feels less integrated than the newest feedback-polished games.

## 2026-05-14 Codex pass 28

- Baseline: `test-results/render-ranking/2026-05-14T03-37-10-570Z/`; all automated scores were clean, so this pass targeted qualitative Sky Hopper visual cohesion and active-flight readability.
- Restyled `websites/flappy-bird.html` toward the newer Workshop Arcade feel with a darker teal sky shell, richer world gradient, layered cloud/hill/ground treatment, stronger pipe contrast, and a more distinct bird silhouette.
- Strengthened visual-only feedback for flaps, score events, pipe danger, speed streaks, hit flash, and screen shake while preserving flap physics, pipe timing, scoring, collision rules, saves, audio preferences, controls, metadata, and static-site behavior.
- Added compact Sky Hopper diagnostics for layout, nearest gap, screen flash/shake, and danger feedback; also gated gameplay input while the help overlay is open so Space/tap cannot start play behind the help card.
- Final capture: `test-results/render-ranking/2026-05-14T03-53-42-495Z/`; 40 ranked surfaces, max score 0, with Sky Hopper desktop/mobile manually inspected.
- Verified with the required develop-web-game client for Sky Hopper plus direct desktop/mobile Playwright checks for active pipes, danger feedback, help gating, restart flow, crash feedback, no console/page errors, and no horizontal overflow.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games`, and `git diff --check`.
- Suggested next pass: continue qualitative zero-score review; likely pick a remaining older game whose visual style or active-play feedback still feels less cohesive than the newest polished titles.

## 2026-05-14 Claude pass 29

- Baseline: `test-results/render-ranking/2026-05-14T04-13-10-622Z/`; all 40 surfaces scored zero, but the Idle Tycoon main menu still felt jarring next to the polished 2048/Sky Hopper aesthetic (bright yellow Sound/Music toggles, oversized Impact section headings).
- Polished `websites/idle-tycoon.html` menu cohesion: tightened the menu card chrome with a teal-tinted dark gradient and inset highlight, retyped `.menu-section h2` (Save Files/Options) as compact uppercase teal labels matching the eyebrow style, and rebuilt `.menu-toggle` so the active state shows a teal accent edge and an On/Off status pill instead of a full bright-yellow fill.
- Preserved Idle Tycoon save data, audio preferences, tutorial toggle behavior, ventures/economy logic, in-game HUD, mobile layout breakpoints, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-21-32-728Z/`; 40 ranked surfaces, max score 0, with Idle Tycoon desktop/mobile menu manually inspected and the in-game post-action screenshot unchanged.
- Verified with Claude Preview running the page and inspecting `.menu-toggle.active` computed styles to confirm the new teal accent edge and On pill, plus the smaller uppercase teal h2 typography on Save Files/Options.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include older menu surfaces like Chess/Checkers controls or Lexica's start state.

## 2026-05-14 Claude pass 30

- Baseline: `test-results/render-ranking/2026-05-14T04-21-32-728Z/`; all 40 surfaces scored zero, but the Chess right sidebar still used plain native checkboxes and a flat status box that felt disconnected from the polished board and the rest of the catalog.
- Polished `websites/chess.html` sidebar visual cohesion: gave `.side` a teal-tinted border and inset highlight, retyped non-leading `.side h2` (Move History) as a compact uppercase teal label while keeping the leading Chess heading prominent, grouped the vsComputer/depth/auto-flip controls inside a `.mode` card with custom-styled toggle-pill checkboxes, refined `.status` into a teal-edged status card, and gave the action buttons a richer gradient pill style.
- Tightened the mobile breakpoint (.wrap gap, .side padding, .mode padding, status/button density, and a smaller leading h2) so the primary Restart Game action stays above the fold on a 390px viewport.
- Preserved chess gameplay rules, move history, AI depth options, auto-flip behavior, undo/restart/help/flip wiring, saves, and existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-35-01-621Z/`; 40 ranked surfaces, max score 0, with Chess desktop/mobile sidebar manually inspected.
- Verified with Claude Preview load of `/websites/chess.html` and direct DOM/style inspection of the new toggle, status card, and move-history heading.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; likely Checkers top bar/controls polish or Lexica's empty start state, depending on the next contact-sheet review.

## 2026-05-14 Claude pass 31

- Baseline: `test-results/render-ranking/2026-05-14T04-35-01-621Z/`; all 40 surfaces scored zero, but Lexica's desktop view still felt empty - the board and keyboard floated in vast horizontal whitespace with a plain bare-bones header and a buried bottom-left status line.
- Polished `websites/wordle.html` visual cohesion: added an ambient teal radial backdrop, gave the page header a Workshop Arcade eyebrow with a tighter LEXICA title, wrapped the board and keyboard in a centered `.play-card` panel with a teal-tinted gradient border and a "Daily Word - 5 Letters - 6 Tries" status row, upgraded `.key` and `.pill` and `.btn` chrome with subtle gradients/shadows/hover states, and tuned the mobile breakpoint for the new card so the board, keyboard, and footer still fit a 390px viewport.
- Preserved Lexica gameplay rules, strict dictionary validation, hard mode, sound toggle, hotkeys (1/2/3, Esc, Ctrl+Enter, Ctrl+Backspace), board states/animations, key/tile coloring logic, dialogs (help/start/over), saves, and existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-45-25-341Z/`; 40 ranked surfaces, max score 0, with Lexica desktop and mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Checkers top bar/controls polish or any older game still missing eyebrow/card-frame chrome (Arena/Brick Breaker first screens).

## 2026-05-14 Claude pass 32

- Baseline: `test-results/render-ranking/2026-05-14T04-45-25-341Z/`; all 40 surfaces scored zero, but Checkers' top bar still mixed a dated "Checkers — Singleplayer & Two-Player" emoji title with a flat single-row controls strip that had no visual hierarchy.
- Polished `websites/checkers.html` header cohesion: added an ambient teal/indigo radial backdrop, replaced the title row with a Workshop Arcade eyebrow + CHECKERS title plus a right-aligned Singleplayer/Two-Player segmented toggle with a teal active state, split the action buttons into grouped panels (New Game/Undo/Flip and Sound/Help), gave the AI Strength label a small uppercase treatment, and upgraded `.btn`/`.seg`/`.select` chrome with gradients and teal hover/pressed accents.
- Tuned the mobile breakpoint so the new grouped controls collapse cleanly: tighter brand, smaller title, condensed control groups, and a compact AI Strength row.
- Preserved Checkers gameplay rules, AI difficulty selection, sound toggle, undo/restart/flip/help wiring, modal dialogs, mandatory-capture cues, animations, saves, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-53-35-976Z/`; 40 ranked surfaces, max score 0, with Checkers desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Brick Breaker top bar HUD or older games still missing eyebrow/card-frame chrome.

## 2026-05-14 Claude pass 33

- Baseline: `test-results/render-ranking/2026-05-14T04-53-35-976Z/`; all 40 surfaces scored zero, but Brick Breaker's in-game HUD still used flat single-line "Score: 0" pills and basic flat utility buttons that did not match the polished paddle/brick palette.
- Polished `websites/brick-breaker.html` HUD chrome: restructured the `.pill` stat cards into an eyebrow-style uppercase label-on-top + tabular-numeric value-below layout with teal-tinted gradient borders, refreshed the base button and utility-strip buttons with matching gradient/shadow chrome and a teal hover border, and tuned mobile pill sizing so the new structure stays compact on a 390px viewport.
- Preserved Brick Breaker gameplay rules, score/level/lives/best wiring, powerups and curses, audio toggles, pause/restart/help controls, start/legend overlay, and all existing visual-only feedback and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T04-59-32-807Z/`; 40 ranked surfaces, max score 0, with Brick Breaker desktop/mobile HUD manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Neon Snake start-screen polish or another older game still lacking branded chrome.

## 2026-05-14 Claude pass 34

- Baseline: `test-results/render-ranking/2026-05-14T04-59-32-807Z/`; all 40 surfaces scored zero, but Neon Snake's first screen had no title at all and only flat single-line pills atop an unframed playing area.
- Polished `websites/snake.html` first-screen visual cohesion: added a fixed Workshop Arcade + NEON SNAKE brand mark in the top-left, refreshed `.pill` chrome with a teal-tinted gradient and tabular-numeric numbers for Score/Best, gave the dynamic status pill a teal-accent color, retuned the mobile primary start button into an uppercase teal CTA, gave the canvas a subtle teal-tinted rounded border, and added an ambient teal/indigo radial backdrop to fill the desktop empty space.
- Tuned the mobile breakpoint to hide the brand mark (the centered HUD already crowds the small viewport) and tightened status-pill sizing.
- Preserved Neon Snake gameplay rules, scoring, best-score persistence, audio toggle, help/restart wiring, mobile controls, status text updates, and all existing diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-09-17-954Z/`; 40 ranked surfaces, max score 0, with Neon Snake desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; candidates include Block Drop HUD chrome cohesion or remaining games lacking branded eyebrow chrome.

## 2026-05-14 Claude pass 35

- Baseline: `test-results/render-ranking/2026-05-14T05-09-17-954Z/`; all 40 surfaces scored zero, but Block Drop's centered HUD still used flat single-line "Score: 0" pills with no brand identity outside the centered start overlay.
- Polished `websites/tetris.html` HUD visual cohesion: added a fixed Workshop Arcade + BLOCK DROP brand mark in the top-left (hidden on mobile), refreshed `.hud .pill` chrome with a cyan-tinted gradient/border and tabular-numeric numbers, gave the dynamic `#status` pill a cyan-accent color, upgraded `.btn` chrome with matching gradient/shadow/hover treatment, gave the canvas a cyan rounded border, and added an ambient cyan/teal radial backdrop to fill the empty desktop space.
- Preserved Block Drop gameplay rules, score/lines/level/best wiring, hold/next preview canvases, status text updates, start panel overlay, audio toggle, reset/help wiring, mobile bottom controls, and all existing visual-only feedback and diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-36-57-253Z/`; 40 ranked surfaces, max score 0, with Block Drop desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; candidates include Minesweeper top bar cohesion or remaining games still lacking branded eyebrow chrome.

## 2026-05-14 Claude pass 36

- Baseline: `test-results/render-ranking/2026-05-14T05-36-57-253Z/`; all 40 surfaces scored zero, but Minesweeper's top bar was still one cramped row of emoji controls with no brand identity, floating LED dots that lived outside their toggle buttons, and inconsistent pill/button chrome.
- Polished `websites/minesweeper.html` header cohesion: added a Workshop Arcade + MINESWEEPER brand on the left, grouped the right-side controls into stat, action, flag-mode, and toggle clusters via a new `.control-group` chrome, refreshed `.pill`/`.btn`/`select` chrome with matching teal-tinted gradients and shadows, embedded the SFX/Music status LEDs as inline dots inside their toggle buttons via a new `.led-inline` element and `.is-on` button state, and added a subtle teal/red-pink ambient backdrop.
- Updated `toggleSfx`, `toggleMusic`, and `updateFlagButton` JS to keep the new `.is-on` button class and `.led on/off` state in sync without touching audio, save data, or gameplay paths.
- Rebuilt the mobile breakpoint so the brand stacks above a 3-column grid of grouped controls without overflow on a 390px viewport.
- Preserved Minesweeper gameplay rules, board generation, custom difficulty controls, flag mode, audio state, help overlay, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-50-04-323Z/`; 40 ranked surfaces, max score 0, with Minesweeper desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Metro Dash menu chrome or any older first-screen still missing branded eyebrow framing.

## 2026-05-14 Claude pass 37

- Baseline: `test-results/render-ranking/2026-05-14T05-50-04-323Z/`; all 40 surfaces scored zero, but Klondike Solitaire's header still had a plain "Klondike" title, ungrouped buttons, and flat right-aligned status text that did not match the polished card board.
- Polished `websites/solitare.html` header cohesion: replaced the plain `<h1>Klondike</h1>` with a Workshop Arcade + KLONDIKE eyebrow brand, grouped the New Deal/Restart Deal and Undo/Hint/Auto-Complete buttons into `.control-group` chips, retuned the Draw toggle pill with teal-accent chrome, refreshed `button`/`.toggle` chrome with gradients and a teal-accented primary action, restyled the right-aligned `.hud` Playing/Moves/Time entries as teal-tinted status pills with a glowing dot, and added a second teal/green ambient radial blob to fill the header empty space.
- Rebuilt the mobile breakpoint so the brand stacks at the top, control groups stay compact, and the status pills wrap into a full-width row.
- Preserved Klondike Solitaire gameplay rules, deal/restart/undo/hint/auto-complete wiring, draw mode toggle, status text updates, timer, move counter, board layout, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T05-58-45-176Z/`; 40 ranked surfaces, max score 0, with Klondike desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; remaining cohesion candidates include Maze Chase header refresh or older games still using legacy retro chrome.

## 2026-05-14 Claude pass 38

- Baseline: `test-results/render-ranking/2026-05-14T05-58-45-176Z/`; all 40 surfaces scored zero, but Arena's HUD still used flat inline-spaced "Score: 0 | Level: 1 | High: 0" text that did not match the eyebrow/value stat pattern shared by Brick Breaker, Block Drop, and Neon Snake.
- Polished `websites/arena.html` HUD chrome: replaced the inline-margin spans with a Workshop Arcade + ARENA brand mark plus three SCORE/LEVEL/HIGH eyebrow-label stat cards with cyan-tinted gradient borders and tabular-numeric values, moved the mute/pause/help icon buttons into a right-aligned `.hud-actions` cluster, upgraded `.icon-btn` chrome to match (cyan border + hover accent), and hid the brand on the 390px viewport so the HUD stays compact.
- Preserved Arena gameplay rules, score/level/high wiring, audio mute, pause/resume, help overlay, menu/game-over cards, controls, and all existing render_game_to_text/advanceTime diagnostics.
- Final capture: `test-results/render-ranking/2026-05-14T06-06-14-858Z/`; 40 ranked surfaces, max score 0, with Arena desktop/mobile manually inspected.
- Local checks passed: catalog validation, full 20-game smoke suite, and final `npm run capture:games`.
- Suggested next pass: continue qualitative zero-score review; the remaining catalog is now largely cohesive - any further passes should focus on subjective player-feel details rather than chrome.

## 2026-05-14 Claude pass 39

- Stepped back from the per-game polish wave (passes 28-38) and noticed the catalog page itself (`index.html`) had not been touched since the 2026-05-03 hardening pass while every individual game received the new Workshop Arcade brand mark + teal/cyan chrome treatment. The catalog was the visual outlier and the first impression users get.
- Polished `index.html` to match the per-game design language: ambient teal/indigo radial backdrop on the body, eyebrow ("Play & Workshop") + bold "Workshop Arcade" name brand mark with conic-glow dot, refreshed search input/select/chip chrome with teal-tinted gradient borders and active-state glow, restyled cards with teal-tinted gradient borders and lift-on-hover, refreshed Play (gradient teal CTA) and Improve (uppercase chip) buttons, uppercase teal eyebrow on the result count and tag pills, Improvement Queue header rebuilt as eyebrow + title with refreshed row chrome, Workshop modal head rebuilt as eyebrow + title with refreshed card border glow, gradient icon-btn close, and teal-bordered player bar.
- Preserved catalog functionality: 20-game manifest load, search, filter chips, sort, fallback catalog, Workshop modal flow (draft save/load, brief generation, copy/download, GitHub issue URL), Improvement Queue link, player iframe sandbox.
- Added a `<=560px` breakpoint that hides the brand eyebrow and tightens the name so the header stays compact on phones.
- Final capture: `test-results/render-ranking/2026-05-14T06-22-21-972Z/`; all 40 game surfaces still scored 0.
- Local checks passed: catalog validation, full 20-game smoke suite, `git diff --check` clean, DOM inspection at desktop 1265px and mobile 375px confirmed zero horizontal overflow and the new chrome rendered as designed.
- Suggested next pass: with the catalog and individual games now visually coherent, future passes can focus on the Improvement Queue interaction (currently a stub that links to GitHub issues) or on issue-to-PR automation that was deferred earlier in the project history.

## 2026-05-14 Claude pass 40

- Stepped back from chrome polish to look at user-facing behavior gaps. The README claimed "Open `workshop-request` issues appear in the Improvement Queue on the catalog page" but the catalog only rendered one static link to GitHub - the claim was wrong. Repo is currently private so unauthenticated browser fetches cannot read issues, but the implementation should be future-proof for when the repo opens up.
- Replaced `renderIssueQueueSummary()` in `index.html` with a real `loadIssueQueue()` flow: 5min sessionStorage cache, async fetch from `api.github.com/repos/.../issues?state=open&labels=workshop-request`, filter out PRs, render up to 6 issue rows with relative-time subtitles, "+N more" overflow row, and three named state renderers - `renderQueueIssues` (populated), `renderQueueEmpty` (zero open requests with a CTA that opens the Workshop modal), `renderQueueFallback` (fetch error - keeps the existing static link with friendly subtitle).
- Refreshed queue-row styling: dashed border + transparent background for the empty state, teal uppercase "VIEW →"/"NEW →"/"ALL →" action labels, eyebrow-styled `queue-state` status text with tabular numerics.
- Updated README to describe the queue accurately: it links to open workshop-request issues and renders them inline when the repository is public via the GitHub REST API.
- Updated `scripts/smoke-games.mjs` to ignore `api.github.com` console errors (mirrors the existing favicon filter) so the smoke suite stays green when the API is unreachable - matches the project's pattern of filtering expected upstream noise.
- Verified all three queue states in the browser: fallback (current private-repo 404 path), empty (forced via `renderQueueEmpty()` - CTA click opens Workshop modal), and populated (forced via `renderQueueIssues(mockIssues)` with 8 entries - showed "8 open requests" status, 6 issue rows, "+2 more" overflow row, zero horizontal overflow at 1280px desktop and 375px mobile).
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (test-results/render-ranking/2026-05-14T06-39-47-410Z) with all 40 surfaces at score 0, `git diff --check` clean.
- Suggested next pass: if the repo is made public, the queue starts rendering real issues automatically. Otherwise, future passes can target issue-to-PR automation (a workflow that turns workshop-request issues into draft PRs using the brief template) or accessibility audit on the catalog and individual games.

## 2026-05-14 Codex pass 41

- Implemented the catalog accessibility and keyboard-flow pass in `index.html`: added a shared modal focus manager with trigger restore, Tab/Shift+Tab trapping, Escape close, background `aria-hidden`, and scroll locking for the player and Workshop dialogs.
- Improved catalog semantics without changing layout: player and Workshop overlays now expose dialog semantics, filter chips maintain `aria-pressed`, card thumbnails are keyboard-operable Play buttons with clear labels, and the empty Improvement Queue CTA is a real button with an accessible label.
- Preserved existing catalog behavior: manifest load/fallback, search/filter/sort, sandboxed iframe player, `#play=<slug>` deep links, Workshop brief/draft/GitHub issue flow, and live queue cache/fallback behavior.
- Focused Playwright keyboard checks passed at desktop and 390px mobile: Ctrl+/ search focus, filter chip state, thumbnail Enter/Space launch, modal Tab traps, Escape close with focus restore, Workshop keyboard controls, empty queue CTA, no horizontal overflow, and no page errors. The Codex Browser plugin blocked local `file://`/`127.0.0.1` navigation in this session, so focused checks used regular Playwright with the GitHub issue API stubbed to an empty queue.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T12-43-37-273Z`) with all 40 rendered surfaces at score 0, and `git diff --check` with only the existing CRLF warning on `index.html`.
- Suggested next pass: broaden accessibility coverage into individual games, starting with canvas games that need clearer keyboard instructions/fallbacks, or implement the issue-to-PR automation path deferred in earlier planning.

## 2026-05-14 Codex pass 42

- Implemented the Canvas Game Accessibility Baseline Pass across the nine older canvas/action games: Arena, Arcade Jump, Sky Hopper, Metro Dash, Slope Runner, Neon Snake, Maze Chase, Minesweeper, and Block Drop.
- Added labeled focusable primary canvases, visible focus outlines, normalized `button type="button"` and toggle ARIA state, dialog semantics for blocking help/pause/start/game-over overlays, and inline dependency-free focus helpers for Tab traps, Escape close, and trigger focus restoration.
- Converted Arcade Jump's fake clickable utility controls to real buttons while preserving existing IDs/classes and gameplay wiring, and added keydown guards so focused controls keep native Enter/Space behavior instead of leaking into game input.
- Preserved gameplay rules, scoring, saves, audio preferences, diagnostics, manifest metadata, sandboxing, and static-site architecture.
- The in-app Browser plugin still blocked local `127.0.0.1` navigation with `net::ERR_BLOCKED_BY_CLIENT`, so focused browser validation used regular Playwright after the Browser fallback was confirmed.
- Stabilized the catalog smoke harness after CI exposed iframe focus variance from the new focusable game canvases: the manifest player loop now closes the sandbox modal through the explicit Close button instead of relying on Escape being delivered to the parent document.
- Focused Playwright checks passed across all nine touched games at desktop and `390x844`: canvas labels/focus targets, help/pause dialog focus trapping and Escape restore, start/control keyboard activation, no console/page errors, and no mobile horizontal overflow. Representative `develop-web-game` client runs passed for Snake, Block Drop, Metro Dash, Slope Runner, and Arena.
- Local checks passed: catalog validation, full 20-game smoke suite, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T14-44-06-904Z`) with all 40 rendered surfaces at score 0, and `git diff --check` with only CRLF normalization warnings on touched HTML/script files.
- Suggested next pass: add a small static accessibility regression script to CI so canvas labels, button types, and overlay dialog semantics stay covered automatically.

## 2026-05-14 Claude pass 41

- Implemented the static accessibility regression script Codex's last handoff requested. New `scripts/check-accessibility.mjs` is dependency-free (pure-Node regex) and enforces three high-signal rules across `index.html` + every `websites/*.html`:
  1. Every `<canvas>` must declare `aria-label` (or `aria-labelledby`) OR `aria-hidden="true"`.
  2. Every `<iframe>` must declare a non-empty `title` attribute.
  3. Every element with `role="dialog"` or `role="alertdialog"` must declare `aria-modal="true"` and an accessible name via `aria-labelledby` or `aria-label`.
- The script strips `<script>`, `<style>`, and HTML comment bodies (preserving newlines so line numbers stay accurate) before scanning, avoiding false positives from inline templates or JS strings.
- Initial run surfaced 11 real violations: 10 decorative `<canvas class="pu-icon">` legend icons in `websites/brick-breaker.html` (no a11y attrs) and the chess main canvas at `websites/chess.html:299` (no aria-label/tabindex). Fixed brick-breaker by setting `aria-hidden="true"` on all 10 decorative legend canvases (the adjacent table cells already name each powerup) and chess by adding `tabindex="0"` plus `aria-label="Chess board"`. Also brought the chess `#gameOver` and `#helpOverlay` overlays up to the catalog pattern by adding `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` (introduced an `id="chessHelpTitle"` for the help heading) - matches every other game's overlay semantics.
- Wired the new check into the workflow: `npm run test:a11y` runs the script, and `.github/workflows/validate-catalog.yml` calls it between the catalog validator and the game smoke suite. Any future canvas, iframe, or dialog element that drops a required attribute will fail CI.
- Stabilized `scripts/smoke-games.mjs`: the catalog workshop-issue assertion was reading `popup.url()` after clicking "Open Issue", which now races GitHub's unauthenticated-login redirect (the repo went public earlier today). Replaced the popup grab with an in-page `window.open` stub that captures the catalog-generated URL exactly, eliminating the race and testing what we actually care about (the constructed URL, not GitHub's response).
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` (`test-results/render-ranking/2026-05-14T...`) all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: button-type sweep across game pages - many `<button>` elements lack an explicit `type` attribute, so they default to `submit` (currently harmless because they're not inside `<form>` elements but a hygiene/regression risk worth a follow-up).

## 2026-05-14 Claude pass 42

- Stepped back from polish/lint work to audit the Workshop brief itself - the catalog's unique product feature. Every recent improvement (per-game render_game_to_text/advanceTime diagnostics, the npm run capture:games harness, the npm run test:a11y regression check, the Workshop Arcade brand/teal-cyan chrome cohesion pattern, the remote-script/font restrictions) was invisible to whichever AI agent received the generated brief. The brief was the right artifact to upgrade: it's the handoff Workshop Arcade hands to AI tools.
- Upgraded `generateBrief()` in `index.html`. Constraint and acceptance lists were rebuilt:
  - Constraints now include the visual cohesion pattern (Workshop Arcade eyebrow + bold game title brand mark, teal/cyan gradient chrome, ambient backdrop, tabular-numeric stat values), modal/overlay accessibility requirements (role="dialog", aria-modal="true", aria-labelledby, focus trap, Escape close), the remote-script/font restriction, and (for existing games only) preservation of the `window.render_game_to_text` and `window.advanceTime` diagnostic hooks so the capture harness keeps working.
  - Acceptance now references the full validation suite as bullet points: `scripts/validate-catalog.ps1`, `npm run test:a11y`, `npm run test:games`, and `npm run capture:games` (which must score 0 on every rendered surface). De-duped the previous double reference to the catalog validator.
  - The new-game branch correctly omits the diagnostic-hooks line since new games don't have them yet.
- Verified in the browser at desktop. For an existing game (Neon Snake) the brief renders all the new sections including the diagnostic-hooks constraint; for the new-game flow (Tiny Tower) the brief renders constraints+acceptance but skips the diagnostics line.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with the brief now reflecting all established conventions, future Workshop requests handed to AI tools should produce work that lands inside the existing patterns. Open work remains the button-type sweep, or a deeper Workshop modal review (does the saved-drafts flow handle edge cases, are focus areas comprehensive, is the brief title format optimal for a GitHub issue title).

## 2026-05-14 Claude pass 43

- Stepped back to think about user-facing feature gaps. Recent work had been polish (chrome, a11y, brief content); the catalog has 20 games but no way for a returning user to see what they last played. Added a "Recently played" filter chip - small, scoped, real user value, fits the existing chip filter pattern.
- Implementation in `index.html`:
  - New `state.recentPlays` (array of slugs) backed by `localStorage` key `workshop-arcade:recentPlays:v1`. Helpers `loadRecentPlays()` and `pushRecentPlay(slug)` handle parsing, type-validation, dedupe (most-recent-first), and a 10-item cap.
  - `openPlayer(g)` now calls `pushRecentPlay(g.slug)` and re-runs `buildFilters()` so a freshly-played game can populate the Recently chip on return.
  - `buildFilters()` inserts the Recently chip in position 2 (after All) only when `state.recentPlays.length > 0`, so the chip never sits empty.
  - `update()` special-cases `state.category === 'Recently'` to build the list from `state.recentPlays` in order (ignoring the sort dropdown since the implicit order is "most recent first"). The search query still applies on top.
  - `render()` swaps the result-count and empty-state copy when Recently is active: shows "N recently played" or "No recent plays", and the empty-state copy reads "No recently played games yet. Open any game and it will appear here."
- Verified end-to-end in the browser:
  - Pre-play: no Recently chip, normal category list.
  - Play Neon Snake, then Block Drop, return to catalog: Recently chip appears after All; clicking it filters to those 2 games in most-recent-first order ("Block Drop", "Neon Snake"), result count reads "2 recently played".
  - Replay Neon Snake: dedupes so the list becomes ["snake", "tetris"] - Neon Snake jumps to the top.
  - Reload page: chip persists, filtered titles persist.
  - Force-clear plays while Recently is active: result count reads "No recent plays", empty-state copy renders.
  - Mobile (375x812): zero horizontal overflow, all 9 chips wrap cleanly, no console errors.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with recent-play tracking in place, a natural follow-up is a "Continue where you left off" rail above the grid (the most recent game gets a featured card). Or extend persistence to track favorite games (explicit star) - the chip pattern is now proven.

## 2026-05-14 Claude pass 44

- Synced the workshop-request triage workflow with the conventions pass 42 wired into the brief. The triage comment is the other side of that handoff: the brief goes INTO the issue, the triage comment GREETS the implementer. Both should reference the same patterns. The existing triage comment was a 7-step checklist that predated the test:a11y check, the capture:games harness, and the visual cohesion pattern.
- Rewrote `.github/workflows/workshop-request.yml` to:
  - Add an `issue_number` `workflow_dispatch` input so the workflow can be triggered manually against any existing issue (previously workflow_dispatch had no payload to act on).
  - Parse `File:` and `Game:` lines out of the catalog-generated brief body and use them to deep-link the actual game file in the comment (`[`websites/snake.html`](https://github.com/...)`), surfacing the target file inline rather than asking the implementer to find it.
  - Detect the new-game placeholder (`websites/your-game.html`) and add a "pick a real path" note plus a "new games should expose these hooks" variant of the diagnostics line.
  - Restructure the checklist into Read / Implement / Verify sections matching the brief's mental model: Read (game file, contract, diagnostics), Implement (self-contained, visual cohesion, controls, modal a11y, manifest), Verify (validate-catalog, test:a11y, test:games, capture:games — every rendered surface must score 0).
  - Use `'… ' + value + ' …'` string concatenation instead of template literals so backticks inside markdown don't collide with the YAML block-scalar's JS template-literal handling.
- Validated the embedded github-script JS locally by extracting it from the YAML, stripping common indentation, and running it with a mock `context`/`github`/`core` for both an existing-game issue (Neon Snake) and a new-game issue (Tiny Tower). Both rendered the expected comment body with correct labels.
- Local checks passed: catalog validation, npm run test:a11y across 21 HTML files, npm run test:games for 20 games, git diff --check clean.
- Suggested next pass: with the brief, queue, and triage comment all aligned, the next ambitious step toward issue-to-PR automation would be a `workflow_dispatch` action that opens a draft PR with a templated checklist for an implementer, OR a `workflow_dispatch` that runs the catalog/a11y/games suite on the current main and reports the green status as a comment.

## 2026-05-14 Claude pass 45

- Pass 40 made the Improvement Queue render real OPEN issues, but the catalog had no surface for what had been shipped. With both open and closed workshop-request counts currently at zero, the catalog gave new users no signal the project is alive. Added a "Recent Updates" section below the queue that pulls the last 5 commits from GitHub - real, working data immediately, demonstrating active development.
- Added a new `.queue.updates` section in `index.html` matching the existing `.queue` chrome pattern (eyebrow + h2 + status line + row list + "All Commits" action chip). Section starts `hidden` and is unhidden on successful fetch.
- New loader: `loadRecentUpdates()` mirrors `loadIssueQueue()`: 5min sessionStorage cache under `workshop-arcade:recentUpdates:v1`, fetch from `api.github.com/repos/.../commits?per_page=5`, parses the response into `{sha, title (first line), date, html_url}` per commit, renders each as a row with the commit subject as the strong title and `{relativeTime} · {sha.slice(0,7)}` as the subtitle, all linking to the commit diff. Status row shows "N recent updates".
- Graceful degradation: on fetch error the section stays hidden (it's informational, not core); the smoke suite's existing `api.github.com` console-error filter (from pass 41) covers the failure mode too.
- Verified all three states in the browser:
  - Populated: 5 commits rendered, first row "Sync workshop-request triage with brief conventions | 8m ago · 67cfce4 | DIFF →", links to the commit on GitHub.
  - Cached: sessionStorage hit, no re-fetch, same content shown.
  - Forced error (stubbed `window.fetch`): section stays hidden, no error visible to the user.
  - Mobile 375x812: zero horizontal overflow, all 5 rows wrap cleanly.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean.
- Suggested next pass: with both queues now active, a natural follow-up is to make the catalog's "About"/"Contact"/"RSS" footer links functional (currently `href="#"` placeholders), or polish the empty-states cohesion (the Recently empty state is a single `.empty` div outside the queue chrome).

## 2026-05-14 Claude pass 46

- Fixed a real UX bug: the catalog's three footer links (`About`, `Contact`, `RSS`) were `href="#"` placeholders that did nothing when clicked (silently scrolled to top). With the rest of the catalog now polished and functional, three dead links in the footer stood out.
- Updated `index.html` footer:
  - `About` → `https://github.com/jakethehoffer/Workshop-Arcade#readme` (jumps directly to the README on the public repo).
  - `Contact` renamed to `GitHub` → `https://github.com/jakethehoffer/Workshop-Arcade` (the actual contact surface for an open-source project).
  - `RSS` → `https://github.com/jakethehoffer/Workshop-Arcade/commits/main.atom` with a `title="Atom feed of recent commits"` tooltip. This pairs naturally with the Recent Updates section from pass 45.
- All three links use `target="_blank" rel="noopener"` (matches the existing external-link convention used by the Improvement Queue's Open Queue link and the Recent Updates' All Commits link).
- Confirmed the Atom feed is live: `curl -sI` against `commits/main.atom` returned `HTTP/1.1 200 OK` with `Content-Type: application/atom+xml`.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, final `npm run capture:games` all 40 surfaces score 0, `git diff --check` clean. Verified in browser at desktop 1280px and mobile 375px - zero horizontal overflow, no console errors.
- Suggested next pass: with the catalog page now fully functional end-to-end, future moves could include polishing the Recently empty state inside the queue chrome instead of using the standalone `.empty` div, adding a small Atom feed `<link rel="alternate">` to `<head>` for native feed reader discovery, or shifting to documentation drift (README's "Validation And Smoke Tests" section doesn't mention `npm run test:a11y` or `npm run capture:games`).

## 2026-05-14 Claude pass 47

- Aligned the human-facing docs with the conventions passes 41-46 wired into the brief, triage comment, and code. The trio that should reference the same validation set: brief (✓ pass 42), triage comment (✓ pass 44), human docs (until now: drifted). README's "Validation And Smoke Tests", CONTRIBUTING.md's add/update list, and `docs/game-contract.md`'s "Expected Checks" all listed only `validate-catalog -Fix` + `validate-catalog` + `test:games` and missed `test:a11y` (added pass 41) and `capture:games` (added long ago, never made it into docs).
- Updated `README.md` Validation section to:
  - List the full suite: `validate-catalog -Fix`, `validate-catalog`, `npm ci`, `test:a11y`, `test:games`, `capture:games`.
  - Describe what each command checks (validator, a11y rules, smoke flow, rendered-quality harness).
  - Note that CI runs `validate-catalog`, `test:a11y`, and `test:games` on every push, with `capture:games` running locally.
- Updated `CONTRIBUTING.md` add-or-update flow:
  - Step 5 now points at `docs/game-contract.md` for visual cohesion, modal a11y, and diagnostic hooks specifically.
  - Step 6 lists the full validation suite including `test:a11y` and `capture:games`.
  - Workshop Requests section clarified that the catalog UI handles label attachment automatically and the triage workflow deep-links the affected game file.
- Expanded `docs/game-contract.md` to actually document the conventions we built into the codebase:
  - New Accessibility section enumerating the static `test:a11y` rules (canvas labels, iframe titles, dialog roles + modal + accessible name + focus trap + Escape).
  - New Visual Cohesion section describing the Workshop Arcade brand-mark eyebrow, teal/cyan gradient chrome, ambient backdrop, tabular numerics, and mobile breakpoint behavior.
  - New Diagnostic Hooks section documenting `window.render_game_to_text()` and `window.advanceTime(ms)` for the capture harness and develop-web-game client.
  - Expected Checks now lists the full validation suite + requires every captured surface in `capture:games` to score 0.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games, `git diff --check` clean (only CRLF normalization warnings on touched docs).
- Suggested next pass: with brief + triage + human docs now aligned, the natural follow-ups are either smaller polish (Recently empty state inside queue chrome, `<link rel="alternate">` Atom discovery in `<head>`) or moving toward issue-to-PR automation as the next ambitious feature.

## 2026-05-14 Claude pass 48

- Took the long-deferred move that multiple past handoffs suggested: issue-to-PR automation. With the queue + triage + brief + human docs all aligned (passes 40, 42, 44, 47), the catalog loop was the only tier ending with manual work — a user could open an issue and get a triage comment, then had to manually create the branch and open the PR. The new `Workshop Draft PR` workflow closes that loop without needing AI code-gen.
- Added `.github/workflows/workshop-draft-pr.yml`:
  - `workflow_dispatch` only with required `issue_number` input.
  - Permissions: `contents: write` (branch + commit), `pull-requests: write` (PR), `issues: write` (link comment).
  - Validates the input is a positive integer, the issue exists and is open (not a PR or closed), and is labeled `workshop-request`. Each failure path calls `core.setFailed()` with a useful message.
  - Computes branch `codex/workshop-<N>`. Checks for existing branch and existing PR; if both exist, exits as a no-op (idempotent re-run is safe).
  - Otherwise: fetches main's tree SHA via `git.getCommit`, creates the branch ref off main, creates an empty placeholder commit (using the same tree as main), updates the new ref to that commit, opens a draft PR titled `[Workshop #N] <title>` with `Closes #N` plus pointers to the triage checklist and the validation suite, comments back on the issue with the PR link (marker-deduped so re-runs update the existing comment).
- Validated the embedded github-script JS locally against 7 mocked scenarios:
  - Happy path (open issue + label, no existing branch): creates ref + commit + PR + issue comment exactly once each.
  - Closed issue: fails loudly with "Re-open it before scaffolding a draft PR."
  - Missing label: fails with "not labeled workshop-request" hint that triage should attach it.
  - Already a PR (not issue): fails with "#N is a pull request, not an issue."
  - Issue not found (404): fails with "Issue #N not found: Not Found."
  - Branch + PR already exist: zero side effects, exits cleanly.
  - No input: fails with "issue_number must be a positive integer."
- Updated `CONTRIBUTING.md` Workshop Requests section to describe the new workflow: how to run it, what it scaffolds, and that re-running against the same issue is a no-op.
- Local checks passed: catalog validation, `npm run test:a11y` clean across 21 HTML files, `npm run test:games` passed for 20 games.
- Suggested next pass: with the catalog + workshop loop now fully automated (open issue → labels + triage comment → on-demand draft PR), future moves can focus on the smaller polish items (Recently empty state inside queue chrome, `<link rel="alternate">` Atom discovery) or actually exercise the new workflow end-to-end by creating a test workshop-request issue and running the draft-PR workflow against it.
