# Metro Dash — Design Spec

## Overview
3D-style endless runner game for the Workshop Arcade catalog. Player sprints through a subway tunnel, switching between 3 lanes, jumping over barriers, and sliding under obstacles. Built as a single self-contained HTML file using Canvas 2D with pseudo-3D perspective projection.

## Technical Approach
- **Rendering:** Canvas 2D with manual perspective math (vanishing point projection)
- **Architecture:** Single `websites/metro-dash.html` file, no external dependencies
- **Physics:** dt-normalized (frame-rate independent), matching existing game conventions
- **Storage:** localStorage for high score persistence

## Visual Design
- **Track:** 3-lane metro track with converging perspective lines toward a central vanishing point
- **Player:** Colored character figure running in the selected lane
- **Obstacles:**
  - Trains — wide, block 1-2 lanes, must dodge sideways
  - Barriers — low objects in a single lane, jump over
  - Overhead bars — duck/slide under
- **Collectibles:** Coins on tracks (+10 points each)
- **Environment:** Metro tunnel walls, ceiling lights, track ties for speed/depth cues
- **Palette:** Grays/browns for concrete, yellow safety lines, colored trains, warm lighting

## Gameplay Mechanics
- 3 lanes — left/right to switch (animated horizontal lerp)
- Jump — clears low barriers (eased arc animation)
- Slide — ducks under overhead obstacles (eased crouch animation)
- Speed ramp — game accelerates gradually over time
- Distance score — increases continuously, displayed as meters
- Coin collection — coins worth 10 points each, appear in patterns
- Collision — any obstacle contact triggers game over

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move left | Left / A | Swipe left |
| Move right | Right / D | Swipe right |
| Jump | Up / W / Space | Swipe up |
| Slide | Down / S | Swipe down |
| Pause | P / Esc | Pause button |
| Help | H | Help button |

## Game States
1. **Title** — "Metro Dash" title, high score, "Tap or Space to Start"
2. **Playing** — active gameplay with HUD
3. **Paused** — overlay with resume/restart
4. **Game Over** — final score, high score update, restart prompt

## HUD
- Top-left: coin count with icon
- Top-center: distance (meters)
- Top-right: pause + help buttons

## Obstacle Spawning
- Obstacles spawn at the far end of the track (near vanishing point)
- They grow in size as they approach the player (perspective scaling)
- Spawn rate and speed increase with distance traveled
- Guaranteed safe path: at least one lane is always passable
- Minimum gap between consecutive obstacles to allow reaction time

## Perspective Rendering
- Vanishing point at horizontal center, ~40% from top of canvas
- Track width expands from vanishing point to bottom of canvas
- 3 lanes evenly distributed across track width at any depth
- Objects scale linearly based on their z-position (distance from player)
- Track ties and lane markers provide motion/depth cues

## UI Conventions (matching existing games)
- Fullscreen canvas with `position:fixed; inset:0`
- Help button (top-right, `❓ Help`)
- Help overlay with controls grid and close button
- `overscroll-behavior:none; touch-action:none` for mobile
- Dark-themed help card (matching arcade aesthetic)

## Manifest Entry
```json
{
  "id": "metro-dash",
  "title": "Metro Dash",
  "subtitle": "Sprint through the subway dodging obstacles.",
  "tags": ["Arcade", "Endless", "Action"],
  "slug": "metro-dash",
  "url": "websites/metro-dash.html",
  "cover": "covers/metro-dash.svg",
  "addedAt": "2025-10-08",
  "popularity": 83
}
```

## Cover Image
Generate an SVG cover showing a perspective view of subway tracks receding into a tunnel, with the Metro Dash title. Consistent with existing SVG cover style.
