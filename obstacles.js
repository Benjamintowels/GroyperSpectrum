const OBSTACLE_COLORS = ['green', 'blue', 'black', 'white'];
const SPAWN_X         = 1050; // just off the right edge of 1000px view

const COLORS_MAP = {
  green: '#3d3',
  blue:  '#38f',
  black: '#555',
  white: '#ddd',
};

// Barrel sprites per color (fallbacks to rects if not yet loaded)
const BARREL_SPRITES = {
  green: new Image(),
  blue:  new Image(),
  black: new Image(),
  white: new Image(),
};

BARREL_SPRITES.green.src = 'Assets/Obstacles/BarrelGreen.png';
BARREL_SPRITES.blue .src = 'Assets/Obstacles/BarrelBlue.png';
BARREL_SPRITES.black.src = 'Assets/Obstacles/BarrelBlack.png';
BARREL_SPRITES.white.src = 'Assets/Obstacles/BarrelWhite.png';

const RAIL_HEIGHT       = 8;
const RAIL_Y            = GROUND_Y - P_H;
const SCROLL_SPEED_MULT = 7; // base scroll speed multiplier

const CLEAR_FLASH_DURATION_MS = 400;

function hexToRgb(hex) {
  hex = hex.slice(1);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function brightenHex(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.min(255, Math.round(r * factor))},${Math.min(255, Math.round(g * factor))},${Math.min(255, Math.round(b * factor))})`;
}

class Obstacle {
  constructor(type, color, options = {}) {
    this.type  = type;
    this.color = color;
    this.x     = SPAWN_X;
    this.scored = false;
    this.clearFlashStart = null;  // set when officially cleared (scored) for brighten-tween cue
    this.clearedForMeter = false;  // set true when player clears gate (through) or barrel (jump + color)

    if (type === 'barrel') {
      this.w = 32;
      // Slightly taller than player so barrels over rails always require a jump
      this.h = Math.round(P_H * 1.1);
      this.y = GROUND_Y - this.h;
    }

    if (type === 'ceiling') {
      this.w = 64;
      // If this ceiling overlaps a rail, adjust to rail floor height
      if (options.onRail) {
        this.h = RAIL_Y - P_DUCK_H - 10;
      } else {
        this.h = GROUND_Y - P_DUCK_H - 10;
      }
      this.y = 0;
      this.onRail = options.onRail || false;
    }

    if (type === 'gate') {
      this.w = 20;
      this.h = P_H * 2;
      this.y = GROUND_Y - this.h;
    }

    if (type === 'rail') {
      const minW = 128;
      const maxW = 512;
      this.w = options.w || Math.round(minW + Math.random() * (maxW - minW));
      this.h = RAIL_HEIGHT;
      this.y = RAIL_Y;
    }

    if (type === 'gap') {
      // Twice barrel width (64) or half that (32)
      this.w = Math.random() < 0.5 ? 64 : 32;
      this.h = 50; // visual depth of hole
      this.y = GROUND_Y;
    }
  }

  get left()   { return this.x; }
  get right()  { return this.x + this.w; }
  get top()    { return this.y; }
  get bottom() { return this.y + this.h; }

  update(speed) {
    this.x -= speed;
  }

  draw(ctx) {
    let c = COLORS_MAP[this.color];
    if (this.clearFlashStart != null && this.type !== 'gap') {
      const elapsed = performance.now() - this.clearFlashStart;
      const t = Math.min(1, elapsed / CLEAR_FLASH_DURATION_MS);
      const brightness = 1 + 0.55 * (1 - t) * (1 - t);
      c = brightenHex(c, brightness);
    }

    if (this.type === 'barrel') {
      const img = BARREL_SPRITES[this.color];
      const drawY = this.y + 5; // visual offset only; hitbox unchanged
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, this.x, drawY, this.w, this.h);
      } else {
        // Fallback: original rect-style barrel if image not ready
        ctx.fillStyle = c;
        ctx.fillRect(this.x, drawY, this.w, this.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        [0.33, 0.66].forEach(f => {
          ctx.beginPath();
          ctx.moveTo(this.x, drawY + this.h * f);
          ctx.lineTo(this.x + this.w, drawY + this.h * f);
          ctx.stroke();
        });
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(this.x, drawY, this.w, this.h);
      }
    }

    if (this.type === 'ceiling') {
      ctx.fillStyle = c;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      const n = 4, tw = this.w / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(this.x + i * tw,        this.y + this.h);
        ctx.lineTo(this.x + i * tw + tw/2, this.y + this.h + 12);
        ctx.lineTo(this.x + (i+1) * tw,    this.y + this.h);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }

    if (this.type === 'gate') {
      const pw = 5;
      ctx.fillStyle = c;
      ctx.fillRect(this.x, this.y, pw, this.h);
      ctx.fillRect(this.x + this.w - pw, this.y, pw, this.h);
      ctx.fillRect(this.x, this.y, this.w, 7);
      ctx.fillStyle = c.startsWith('rgb') ? c.replace(')', ', 0.33)').replace('rgb(', 'rgba(') : c + '55';
      ctx.fillRect(this.x + pw, this.y + 7, this.w - pw * 2, this.h - 7);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }

    if (this.type === 'rail') {
      ctx.fillStyle = c;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x, this.y, this.w, 2);
      ctx.fillStyle = COLORS_MAP[this.color];
      ctx.globalAlpha = 0.5;
      const postCount = 4;
      const spacing   = this.w / postCount;
      for (let i = 0; i < postCount; i++) {
        const px = this.x + i * spacing + spacing / 2;
        ctx.fillRect(px - 2, this.y + this.h, 4, GROUND_Y - this.y - this.h);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }

    if (this.type === 'gap') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(this.x + 2, this.y + 2, this.w - 4, this.h - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
    }

    // Debug label
    const label = this.type === 'barrel' ? 'JMP'
                : this.type === 'ceiling' ? 'DUK'
                : this.type === 'gate'    ? 'CLR'
                : this.type === 'gap'     ? 'GAP'
                : 'RAIL';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(this.x + this.w / 2 - 14, this.y - 20, 28, 14);
    ctx.fillStyle = this.type === 'gap' ? '#888' : COLORS_MAP[this.color];
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, this.x + this.w / 2, this.y - 9);
    ctx.textAlign = 'left';
  }

  overlaps(player) {
    const hOv = player.right > this.left + 5 && player.left < this.right - 5;
    if (!hOv) return false;
    if (this.type === 'barrel')  return player.bottom > this.top + 4 && player.top < this.bottom;
    if (this.type === 'ceiling') return player.top < this.bottom + 12 && player.bottom > this.top;
    if (this.type === 'gate')    return player.bottom > this.top + 4 && player.top < this.bottom;
    // Rail: overlap when landing on it (jump + in zone) OR when running into it (on ground + hOv)
    if (this.type === 'rail') {
      const landingOnRail = player.state === 'jump' && player.bottom >= this.top && player.bottom <= this.top + 16;
      const runningIntoRail = (player.state === 'run' || player.state === 'duck') && player.bottom >= GROUND_Y - 2;
      return landingOnRail || runningIntoRail;
    }
    if (this.type === 'gap')     return (player.state === 'run' || player.state === 'duck') && player.bottom >= GROUND_Y - 2;
    return false;
  }

  playerSurvives(player) {
    const colorOk = player.color === this.color;
    if (this.type === 'barrel')  return player.state === 'jump' && colorOk;
    // Allow ceilings to be cleared either while in the dedicated duck state
    // (classic ground/rail duck) or while using the duck-sized hitbox during
    // a fall/cancel (player.isDucking).
    if (this.type === 'ceiling') return (player.state === 'duck' || player.isDucking) && colorOk;
    if (this.type === 'gate') {
      if (player.state === 'jump') return false;
      return colorOk;
    }
    if (this.type === 'rail') return player.state === 'jump' && colorOk;
    if (this.type === 'gap')  return false; // touching gap always kills
    return false;
  }
}

class ObstacleManager {
  constructor() { this.reset(); }

  reset() {
    this.obstacles       = [];
    this.spawnTimer      = 0;
    this.nextInterval    = 0;
    this.obstacleCount   = 0;
    this.difficulty      = 0;
    this.lastRailRight   = -999;  // tracks where the last rail ended
    this.lastRailColor   = null;  // tracks last rail color
    this.activeRailEnd   = -999;  // x position where current rail ends
    this.gateSection       = false; // next 10 spawns are gates only
    this.gateSectionLeft   = 0;
    this.gateSection25Done = false;
    this.gateSection50Done = false;
    this.tutorialMode    = false; // when true, no auto-spawn; use spawnTutorialObstacle from main
    this.dailyMode       = false;
    this.dailyPattern    = null;
    this.dailyPatternIndex = 0;
  }

  generateDailyPattern(seed) {
    const rng = new SeededRandom(seed);
    const types = ['barrel', 'ceiling', 'gate', 'rail', 'gap'];
    const colors = OBSTACLE_COLORS;
    const minMul = 0.7;
    const maxMul = 2.4;
    const pattern = [];
    for (let i = 0; i < 75; i++) {
      const type = rng.pick(types);
      const color = rng.pick(colors);
      const entry = { type, color };
      if (type === 'rail') entry.w = rng.nextInt(128, 512);
      const r = rng.next();
      entry.gapMul = minMul + (maxMul - minMul) * (r * r);
      pattern.push(entry);
    }
    return pattern;
  }

  setDailyPattern(pattern) {
    this.dailyPattern = pattern;
    this.dailyMode = true;
    this.dailyPatternIndex = 0;
    if (pattern && pattern[0]) {
      this.nextInterval = this.interval * pattern[0].gapMul;
    }
  }

  spawnTutorialObstacle(type, color, options = {}) {
    this.obstacles.push(new Obstacle(type, color, options));
    this.obstacleCount++;
  }

  // Spawn interval in "ideal 60fps frames".
  // At max difficulty (10) we keep 120 frames (current tight spacing).
  // At start (0) we use 480 frames, and every +1 difficulty (~5 cleared obstacles)
  // closes the gap slightly.
  get interval() {
    const maxFrames = 480;   // easy start spacing
    const minFrames = 120;   // hardest spacing (what you see now at high diff)
    const steps     = 10;    // difficulty 0..10
    const step      = (maxFrames - minFrames) / steps; // 36
    const frames    = Math.max(minFrames, maxFrames - step * this.difficulty);
    // Divide by speed multiplier so world-space spacing is based on frames.
    return frames / SCROLL_SPEED_MULT;
  }

  // Adds a randomized spread around the base interval so that even at high
  // speed you sometimes get generous gaps and sometimes tighter runs.
  _computeNextInterval() {
    const base   = this.interval;
    const minMul = 0.7;  // never closer than 70% of base
    const maxMul = 2.4;  // allow up to ~2.4x base gap
    const r      = Math.random();
    // Bias slightly toward shorter-than-base but still occasionally long gaps.
    const mul    = minMul + (maxMul - minMul) * (r * r);
    return base * mul;
  }
  // Base scroll speed, scaled up for a much faster game feel
  get speed()    { return SCROLL_SPEED_MULT * Math.min(2.5, 0.8 + this.difficulty * 0.17); }

  // Called when player cashes in a full meter (e.g. ArrowRight). Increases speed level; meter is cleared in main.
  increaseSpeed() {
    this.difficulty = Math.min(10, this.difficulty + 1);
  }

  // Called when player presses Left Arrow; slows scroll by one notch.
  decreaseSpeed() {
    this.difficulty = Math.max(0, this.difficulty - 1);
  }

  // Check if a given x range overlaps an existing rail
  _overlapsRail(x, w) {
    for (const o of this.obstacles) {
      if (o.type !== 'rail') continue;
      if (x < o.right && x + w > o.left) return o;
    }
    return null;
  }

  // How far the last rail's right edge is from spawn point (850)
  _distanceFromLastRail() {
    let rightmost = -999;
    for (const o of this.obstacles) {
      if (o.type === 'rail') rightmost = Math.max(rightmost, o.right);
    }
    return rightmost;
  }

  update(dt, frameCount, score = 0) {
    // Normalize time so logic based on the old \"per-frame\" values
    // stays consistent across refresh rates.
    const frameScale = dt / 16.67;
    if (this.tutorialMode) {
      for (const o of this.obstacles) o.update(this.speed * frameScale);
      this.obstacles = this.obstacles.filter(o => o.x + o.w > -20);
      return;
    }
    if (this.dailyMode) {
      // Daily run: skip gate sections; use pattern for spawns
    } else if (score >= 60) {
      this.gateSection     = false;
      this.gateSectionLeft = 0;
      // When leaving guided sections, reset so random spacing resumes cleanly.
      this.nextInterval    = 0;
    } else if (score >= 50 && !this.gateSection50Done && !this.gateSection && this.gateSectionLeft === 0) {
      this.gateSection       = true;
      this.gateSectionLeft   = 10;
      this.gateSection50Done = true;
      // Start this gate run with clean, even spacing.
      this.spawnTimer        = 0;
      this.nextInterval      = 0;
    } else if (score >= 25 && !this.gateSection25Done && !this.gateSection && this.gateSectionLeft === 0) {
      this.gateSection       = true;
      this.gateSectionLeft   = 10;
      this.gateSection25Done = true;
      this.spawnTimer        = 0;
      this.nextInterval      = 0;
    }

    const inGateRun = !this.dailyMode && this.gateSection && this.gateSectionLeft > 0;

    this.spawnTimer += frameScale;
    if (!inGateRun && !this.nextInterval) this.nextInterval = this._computeNextInterval();

    const threshold = inGateRun ? this.interval : this.nextInterval;

    if (this.spawnTimer >= threshold) {
      this.spawnTimer = 0;

      let type, color, options = {};

      if (this.dailyMode) {
        if (this.dailyPatternIndex >= 75) {
          // All 75 daily obstacles scheduled; stop spawning
        } else {
          const entry = this.dailyPattern[this.dailyPatternIndex];
          this.dailyPatternIndex++;
          type = entry.type;
          color = entry.color;
          if (entry.w != null) options.w = entry.w;
          if (type === 'ceiling') {
            const spawnX = SPAWN_X;
            const ceilingW = 64;
            const rail = this._overlapsRail(spawnX, ceilingW);
            if (rail) {
              color = rail.color;
              options.onRail = true;
            }
          }
          this.obstacles.push(new Obstacle(type, color, options));
          this.obstacleCount++;
          const nextEntry = this.dailyPattern[this.dailyPatternIndex];
          if (nextEntry) this.nextInterval = this.interval * nextEntry.gapMul;
        }
      } else {
        this.nextInterval = this._computeNextInterval();
        const types = ['barrel', 'ceiling', 'gate', 'rail', 'gap'];
        type     = this.gateSection && this.gateSectionLeft > 0
          ? 'gate'
          : types[Math.floor(Math.random() * types.length)];

        const palette = (typeof getActiveColors === 'function')
          ? getActiveColors()
          : OBSTACLE_COLORS;
        color    = palette[Math.floor(Math.random() * palette.length)];

        if (type === 'gate' && this.gateSection && this.gateSectionLeft > 0) {
          this.gateSectionLeft--;
          if (this.gateSectionLeft === 0) this.gateSection = false;
        }

        if (type === 'rail') {
          const minW   = 128;
          const maxW   = 512;
          const railW  = Math.round(minW + Math.random() * (maxW - minW));
          const spawnX = SPAWN_X;
          const overlapRail = this._overlapsRail(spawnX, railW);

          if (overlapRail) {
            const nonRailTypes = ['barrel', 'ceiling', 'gate'];
            type = nonRailTypes[Math.floor(Math.random() * nonRailTypes.length)];
          } else {
            options.w = railW;
          }
        }

        if (type === 'ceiling') {
          const spawnX   = SPAWN_X;
          const ceilingW = 64;
          const rail     = this._overlapsRail(spawnX, ceilingW);

          if (rail) {
            color   = rail.color;
            options = { onRail: true };
          } else {
            const lastRail = [...this.obstacles].reverse().find(o => o.type === 'rail');
            if (lastRail && lastRail.right > -100) {
              this.spawnTimer = Math.floor(((inGateRun ? this.interval : this.nextInterval) || this.interval) * 0.5);
              return;
            }
          }
        }

        this.obstacles.push(new Obstacle(type, color, options));
        this.obstacleCount++;
      }
    }

    for (const o of this.obstacles) o.update(this.speed * frameScale);
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -20);
  }

  draw(ctx) {
    for (const o of this.obstacles) o.draw(ctx);
  }
}