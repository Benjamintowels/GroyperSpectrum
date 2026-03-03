# Groyper Spectrum — Project Notes

## Stack
- Vanilla JS, no frameworks
- HTML5 Canvas, 800x400
- Local dev via `python -m http.server 8000`
- Files: index.html, background.js, player.js, obstacles.js, main.js

## File Responsibilities
- background.js  — parallax scrolling city, ground line, ground stripes
- player.js      — player state machine, jump tweens, color swap, grind, explode
- obstacles.js   — Obstacle class, ObstacleManager spawner, all obstacle types
- main.js        — game loop, collision detection, input, restart

## Shared Constants (defined in player.js, used everywhere)
- GROUND_Y = 310
- P_W = 40, P_H = 52, P_DUCK_H = 28, P_X = 110
- JUMP_HEIGHT = 105, JUMP_HALF = 210
- COLORS = { green, blue, black, white }
- COLORS_MAP = same, used in obstacles.js
- RAIL_HEIGHT = 8, RAIL_Y = GROUND_Y - P_H (defined in obstacles.js)

## Game Rules
- Player is a colored rectangle, fixed X position, background scrolls
- 4 colors: A=green, S=blue, D=black, F=white
- Color swap is instant toggle — pressing current color does nothing
- Arrow Up = jump (floaty, variable height based on how long you hold)
- Arrow Down = duck (on ground), or cancel jump mid-air (slams to ground, lands in duck)
- Releasing up before peak = cuts jump short, falls from current height

## Obstacle Types
| Type    | Required action               | Wrong = explode |
|---------|-------------------------------|-----------------|
| Barrel  | Jump + match color            | yes |
| Ceiling | Duck + match color            | yes |
| Gate    | Match color, duck or neutral  | jump always kills |
| Rail    | Jump onto + match color       | yes |

## Ceiling Special Rules
- If ceiling overlaps an active rail on screen → must match rail color, height adjusts so player can duck while grinding
- If ceiling spawns right after a rail ends → delayed spawn to give player time to land and duck

## Rail Rules
- Variable width: 128px min, 512px max
- Height = RAIL_Y (same as barrel top = GROUND_Y - P_H)
- Player must jump onto rail with matching color to grind
- While grinding: jump and duck work same as on ground
- Swapping color while grinding = explode
- Jump off rail launches from rail height (not ground height)
- Rail end → player drops back to ground via short tween

## Player States
- run     — default, on ground
- jump    — in air, tween-based arc
- duck    — crouching on ground (or on rail)
- grind   — on rail, behaves like run but snapped to rail Y
- dead    — exploded, game over

## Difficulty Ramp (ObstacleManager)
- Ramps every 5 obstacles, max difficulty = 10
- interval = Math.max(120, 360 - difficulty * 24)  ← frames between spawns
- speed    = Math.min(2.5, 0.8 + difficulty * 0.17) ← scroll speed
- Speed and interval are owned by ObstacleManager, background reads obsMgr.speed

## Current Status
- Core loop working: scroll, jump, duck, color swap, all 4 obstacle types
- Collision detection working with console debug logging on death
- Difficulty ramp working
- Rail grind working including jump-off from rail height
- Ceiling/rail overlap detection in progress — still occasional color mismatch bugs
- No sprites yet — all placeholder colored rectangles
- No score display yet
- No start menu or game over screen yet — press R to restart

## Next Steps
1. Fix ceiling/rail color overlap bug reliably
2. Add score display + HUD (color pip indicators)
3. Add explosion particle effect on death
4. Add start menu and game over screen
5. Replace placeholder rectangles with spritesheets
6. Add more complex obstacle patterns using rail + jump combos
7. Telegram Mini App wrapper

## Art Plan (when ready)
- One spritesheet per color (green, blue, black, white)
- Same frame layout across all 4 colors
- States needing animation: run, jump, duck, grind, explode (shared)
- Obstacle sprites: barrel, ceiling, gate, rail (all color variants)
- Background: already coded procedurally, may keep or replace with tilemap