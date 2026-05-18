---
name: Workshop improvement request
about: Request an AI-assisted improvement to a Workshop Arcade game.
title: "Workshop: "
labels: "workshop-request, enhancement"
---

## Game

<!-- Example: Metro Dash -->

## Upgrade request

<!-- Describe the gameplay, visual, mobile, accessibility, or performance change. -->

## Focus areas

- [ ] Gameplay balance
- [ ] Visual polish
- [ ] Mobile controls
- [ ] Accessibility
- [ ] Performance
- [ ] Bug fixes

## Acceptance checks

- [ ] The catalog loads without broken game links or missing covers.
- [ ] The game follows `docs/game-contract.md`.
- [ ] The game starts, restarts, and handles its main controls.
- [ ] Text and controls do not overlap on desktop or mobile.
- [ ] `scripts/validate-catalog.ps1 -Fix` has been run when catalog metadata changed.
- [ ] `scripts/validate-catalog.ps1` passes before publishing.
- [ ] `npm test` passes before publishing.
- [ ] `npm run test:games` passes before publishing.
- [ ] `npm run capture:games:ci` passes before publishing.
- [ ] `npm run audit:perf:ci` passes before publishing.
