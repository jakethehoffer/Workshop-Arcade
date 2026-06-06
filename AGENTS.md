# Codex Workspace Instructions

These instructions apply to this repository and its child paths.

## Startup Run Action

At the start of any Codex chat or project work in this workspace, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.ai-sync\ai-sync.ps1" -Action start -Agent codex
```

Read `.ai-sync/state.md` and `.ai-sync/handoff.md` before making assumptions about prior work. If `.ai-sync/claude-context.md` exists, read it as imported Claude Code context.

## Workshop Arcade Runbook

Before implementation work, read `CLAUDE.md` for the shared Workshop Arcade agent runbook. It records the current catalog state, direct-main/no-PR convention, new-game footprint, service-worker revision rule, and verification/evidence gates used by both Claude and Codex.

## Shared Handoff

Before finishing meaningful work, update the shared state:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.ai-sync\ai-sync.ps1" -Action handoff -Agent codex -Summary "<what changed>" -FilesChanged "<files>" -TestsRun "<commands and outcomes>" -Blockers "<blockers or none>" -NextSteps "<next useful steps>"
```

Keep sync notes concise and durable. Record decisions, changed files, tests, blockers, and next steps. Do not store secrets, credentials, API keys, full raw transcripts, or large command outputs.

## Completion Alert

Before sending any final response in this workspace, trigger the completion sound as the last tool action:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\.codex\codex-alert\notify-codex-finished.ps1" -Async
```

If the alert script is unavailable or fails, continue with the final response and mention the failure only when relevant to the current task.
