const COLORS = {
  green: '#3d3',
  blue:  '#38f',
  black: '#555',
  white: '#ddd',
};

const GROUND_Y    = 310;
const P_W         = 40;
const P_H         = 52;
const P_DUCK_H    = 28;
const P_X         = 110;
const JUMP_HEIGHT = 105;
const JUMP_HALF   = 210;

const SPRITE_FRAME_W = 48;
const SPRITE_FRAME_H = 64;
const ANIM_FRAME_MS  = 80;

const TOAD_FRAMES = { idle: 8, duck: 3, jump: 8, boost: 8 };

const TOAD_SPRITE_PATHS = {
  green: {
    idle:  'Assets/ToadSprites/GreenToadIdle.png',
    duck:  'Assets/ToadSprites/GreenToadDuck.png',
    jump:  'Assets/ToadSprites/GreenToadJump.png',
    boost: 'Assets/ToadSprites/GreenToadBoost.png',
  },
  blue: {
    idle:  'Assets/ToadSprites/BlueToadIdle.png',
    duck:  'Assets/ToadSprites/BlueToadDuck.png',
    jump:  'Assets/ToadSprites/BlueToadJump.png',
    boost: 'Assets/ToadSprites/BlueToadBoost.png',
  },
  black: {
    idle:  'Assets/ToadSprites/BlackToadIdle.png',
    duck:  'Assets/ToadSprites/BlackToadDuck.png',
    jump:  'Assets/ToadSprites/BlackToadJump.png',
    boost: 'Assets/ToadSprites/BlackToadBoost.png',
  },
  white: {
    idle:  'Assets/ToadSprites/WhiteToadIdle.png',
    duck:  'Assets/ToadSprites/WhiteToadDuck.png',
    jump:  'Assets/ToadSprites/WhiteToadJump.png',
    boost: 'Assets/ToadSprites/WhiteToadBoost.png',
  },
};

class Player {
  constructor() {
    this.spriteSheets = {};
    for (const [color, paths] of Object.entries(TOAD_SPRITE_PATHS)) {
      this.spriteSheets[color] = {};
      for (const [anim, path] of Object.entries(paths)) {
        const img = new Image();
        img.src = path;
        this.spriteSheets[color][anim] = { img, frames: TOAD_FRAMES[anim] };
      }
    }
    this.reset();
  }

  reset() {
    this.color       = 'green';
    this.state       = 'run';
    this.isDucking   = false;
    this.y           = GROUND_Y;
    this.groundY     = GROUND_Y;  // tracks whether grounded or on rail
    this.tweens      = [];
    this.cancelling  = false;
    this.peaking     = false;
    this.activeRail    = null;
    this.lurchX        = 0;  // draw-only offset for speed-boost lurch (hitbox stays at P_X)
    this.railLurchX   = 0;  // draw-only offset when ducking on rail (tween forward, then back on stand/leave)
    this.railLurchTween = null;  // { from, to, dur, ease, elapsed } for rail duck lurch
    this.animState     = 'idle';
    this.animFrame     = 0;
    this.animTime      = 0;
    this.duckReversing = false;
    this.boostAnimPlaying = false;
  }

  get h()      { return this.isDucking ? P_DUCK_H : P_H; }
  get top()    { return this.y - this.h; }
  get left()   { return P_X; }
  get right()  { return P_X + P_W; }
  get bottom() { return this.y; }

  handleInput() {
    const map = (typeof getActiveColorKeyMap === 'function')
      ? getActiveColorKeyMap()
      : [['KeyA','green'],['KeyS','blue'],['KeyD','black'],['KeyF','white']];
    for (const [code, col] of map) {
      if (isKeyDown(code) && this.color !== col) {
        // Swapping color on a rail = explode
        if (this.state === 'grind') {
          this.color = col;
          this.explode();
          return;
        }
        this.color = col;
      }
    }

    if (isKeyDown('ArrowUp') && (this.state === 'run' || this.state === 'grind')) this._startJump();

    if (!isKeyDown('ArrowUp') && this.state === 'jump' && !this.peaking && !this.cancelling) {
      this._cutJump();
    }

    const down = isKeyDown('ArrowDown');

    if (down && this.state === 'jump') this._cancelJump();

    if (down && (this.state === 'run' || this.state === 'grind')) {
      this.state = 'duck';
    } else if (!down && this.state === 'duck') {
      this.state = this.groundY === GROUND_Y ? 'run' : 'grind';
    }

    // Hitbox: while holding down or in duck state, stay shrunken
    this.isDucking = down || this.state === 'duck';
  }

  landOnRail(rail) {
    this.tweens     = [];
    this.cancelling = false;
    this.peaking    = false;
    this.activeRail = rail;
    this.groundY    = rail.top;
    this.y          = rail.top;
    this.state      = this.isDucking ? 'duck' : 'grind';
  }

  leaveRail() {
    this.activeRail = null;
    this.groundY    = GROUND_Y;
    const down      = isKeyDown('ArrowDown');
    this._startRailLurchReturn();
    // Small tween to drop back to ground
    this._tween(this.y, GROUND_Y, 180, t => t**2, v => { this.y = v; }, () => {
      this.y     = GROUND_Y;
      this.state = down ? 'duck' : 'run';
    });
    // During the drop, keep duck state if holding down; otherwise use jump.
    this.state = down ? 'duck' : 'jump';
    // Ensure hitbox matches input immediately on leaving the rail
    this.isDucking = down || this.state === 'duck';
  }

  explode() {
    // Placeholder — just reset for now, particles come later
    console.log('EXPLODE');
    this.state = 'dead';
  }

  // Visual only: lurch forward then tween back when player uses speed boost.
  playBoostLurch() {
    if (!this.isDucking) {
      this.boostAnimPlaying = true;
      this.animState        = 'boost';
      this.animFrame        = 0;
      this.animTime         = 0;
    }
    const lurchDist = 28;
    const outDur    = 55;
    const backDur   = 590;
    this._tween(0, lurchDist, outDur, t => 1 - (1 - t) ** 2, v => { this.lurchX = v; }, () => {
      this._tween(lurchDist, 0, backDur, t => t * t, v => { this.lurchX = v; }, null);
    });
  }

  // Rail duck lurch: tween forward (slower than boost) while holding down on rail; return at same rate as boost (590ms).
  _startRailLurchForward() {
    const target = 28;
    const dur    = 420;
    if (this.railLurchX >= target - 1) return;
    if (this.railLurchTween && this.railLurchTween.to === target) return;
    this.railLurchTween = {
      from: this.railLurchX, to: target, dur,
      ease: t => 1 - (1 - t) ** 2,
      elapsed: 0,
    };
  }

  _startRailLurchReturn() {
    const backDur = 590;
    if (this.railLurchX <= 0) {
      this.railLurchTween = null;
      return;
    }
    if (this.railLurchTween && this.railLurchTween.to === 0) return;
    this.railLurchTween = {
      from: this.railLurchX, to: 0, dur: backDur,
      ease: t => t * t,
      elapsed: 0,
    };
  }

  _startJump() {
    this.state      = 'jump';
    this.cancelling = false;
    this.peaking    = false;
    const startY    = this.groundY;
    const peak      = startY - JUMP_HEIGHT;

    // If jumping off rail, leave it
    if (this.activeRail) {
      this.activeRail = null;
      this.groundY    = GROUND_Y;
    }

    this._tween(startY, peak, JUMP_HALF * 1.3, t => 1-(1-t)**3, v => { this.y = v; }, () => {
      this.peaking = true;
      this._tween(peak, GROUND_Y, JUMP_HALF * 1.5, t => t**2, v => { this.y = v; }, () => {
        this.y       = GROUND_Y;
        this.state   = 'run';
        this.peaking = false;
        this.groundY = GROUND_Y;
      });
    });
  }

  _cutJump() {
    this.peaking   = true;
    const currentY = this.y;
    this.tweens    = [];
    this._tween(currentY, GROUND_Y, JUMP_HALF * 1.2, t => t**2, v => { this.y = v; }, () => {
      this.y       = GROUND_Y;
      this.state   = 'run';
      this.peaking = false;
      this.groundY = GROUND_Y;
    });
  }

  _cancelJump() {
    if (this.cancelling) return;
    this.cancelling = true;
    this.tweens     = [];
    // When cancelling a jump, immediately shrink to duck hitbox while in the air.
    this.isDucking  = true;
    this.state      = 'jump'; // keep jump state for barrel logic until we land
    this._tween(this.y, GROUND_Y, 120, t => t**3, v => { this.y = v; }, () => {
      this.y       = GROUND_Y;
      this.state   = 'duck';
      this.groundY = GROUND_Y;
    });
  }

  _tween(from, to, dur, ease, onUpd, onDone) {
    this.tweens.push({ from, to, dur, ease, onUpd, onDone, elapsed: 0 });
  }

  _updateAnimation(dt) {
    if (this.boostAnimPlaying && (this.state === 'jump' || this.isDucking)) {
      this.boostAnimPlaying = false;
    }

    let desired = 'idle';
    if (this.boostAnimPlaying) desired = 'boost';
    else if (this.state === 'jump' && this.isDucking) desired = 'duck';
    else if (this.state === 'jump') desired = 'jump';
    else if (this.state === 'duck' || ((this.state === 'run' || this.state === 'grind') && this.isDucking)) desired = 'duck';

    if (this.animState === 'duck' && !this.isDucking && !this.duckReversing) {
      this.duckReversing = true;
    }

    if (desired !== this.animState) {
      if (this.animState === 'duck' && this.duckReversing) {
        // let reverse finish
      } else {
        this.animState = desired;
        this.animFrame = 0;
        this.animTime  = 0;
        if (desired === 'duck') this.duckReversing = false;
      }
    }

    this.animTime += dt;
    while (this.animTime >= ANIM_FRAME_MS) {
      this.animTime -= ANIM_FRAME_MS;
      if (this.animState === 'idle') {
        this.animFrame = (this.animFrame + 1) % 8;
      } else if (this.animState === 'boost') {
        this.animFrame++;
        if (this.animFrame >= 8) {
          this.boostAnimPlaying = false;
          this.animState = 'idle';
          this.animFrame = 0;
        }
      } else if (this.animState === 'jump') {
        this.animFrame++;
        if (this.animFrame >= 8) {
          this.animState = 'idle';
          this.animFrame = 0;
        }
      } else if (this.animState === 'duck') {
        if (this.duckReversing) {
          this.animFrame--;
          if (this.animFrame < 0) {
            this.animFrame = 0;
            this.duckReversing = false;
            this.animState = 'idle';
          }
        } else {
          if (this.animFrame < 2) {
            this.animFrame++;
          } else {
            this.animFrame = this.animFrame === 2 ? 1 : 2;
          }
        }
      }
    }
  }

  update(dt) {
    // If grinding, keep player snapped to rail as it scrolls
    if (this.state === 'grind' && this.activeRail) {
      this.y       = this.activeRail.top;
      this.groundY = this.activeRail.top;
    }

    const duckOnRail = this.state === 'duck' && this.activeRail;
    if (duckOnRail) this._startRailLurchForward();
    else if (this.railLurchX > 0) this._startRailLurchReturn();

    if (this.railLurchTween) {
      const t = this.railLurchTween;
      t.elapsed = Math.min(t.elapsed + dt, t.dur);
      const p = t.elapsed / t.dur;
      this.railLurchX = t.from + (t.to - t.from) * t.ease(p);
      if (t.elapsed >= t.dur) {
        this.railLurchX = t.to;
        this.railLurchTween = null;
      }
    }

    const active = [];
    for (const t of this.tweens) {
      t.elapsed = Math.min(t.elapsed + dt, t.dur);
      const v   = t.from + (t.to - t.from) * t.ease(t.elapsed / t.dur);
      t.onUpd(v);
      if (t.elapsed < t.dur) active.push(t);
      else if (t.onDone) t.onDone();
    }
    this.tweens = active;

    this._updateAnimation(dt);
  }

  draw(ctx) {
    const h   = this.h;
    const top = this.y - h;
    const x   = P_X + this.lurchX + this.railLurchX;

    const byColor = this.spriteSheets[this.color] || this.spriteSheets['green'];
    const sheet   = byColor && byColor[this.animState];
    const img     = sheet && sheet.img;
    if (img && img.complete && img.naturalWidth) {
      const frame = Math.min(this.animFrame, sheet.frames - 1);
      const sx = frame * SPRITE_FRAME_W;
      ctx.drawImage(
        img,
        sx, 0, SPRITE_FRAME_W, SPRITE_FRAME_H,
        x - (SPRITE_FRAME_W - P_W) / 2, this.y - SPRITE_FRAME_H + 7,
        SPRITE_FRAME_W, SPRITE_FRAME_H
      );
    } else {
      ctx.fillStyle = COLORS[this.color];
      ctx.fillRect(x, top, P_W, h);
      ctx.fillStyle = '#000';
      if (!this.isDucking) ctx.fillRect(x + P_W - 13, top + 9, 6, 6);
      else ctx.fillRect(x + P_W - 13, top + 5, 6, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(x, top, P_W, h);
    }

    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 9px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(this.state.toUpperCase(), x + P_W / 2, top - 6);
    ctx.textAlign   = 'left';
  }
}