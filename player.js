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

class Player {
  constructor() { this.reset(); }

  reset() {
    this.color       = 'green';
    this.state       = 'run';
    this.isDucking   = false;
    this.y           = GROUND_Y;
    this.groundY     = GROUND_Y;  // tracks whether grounded or on rail
    this.tweens      = [];
    this.cancelling  = false;
    this.peaking     = false;
    this.activeRail  = null;
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

  update(dt) {
    // If grinding, keep player snapped to rail as it scrolls
    if (this.state === 'grind' && this.activeRail) {
      this.y       = this.activeRail.top;
      this.groundY = this.activeRail.top;
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
  }

  draw(ctx) {
    const h   = this.h;
    const top = this.y - h;

    ctx.fillStyle = COLORS[this.color];
    ctx.fillRect(P_X, top, P_W, h);

    ctx.fillStyle = '#000';
    if (!this.isDucking) ctx.fillRect(P_X + P_W - 13, top + 9, 6, 6);
    else ctx.fillRect(P_X + P_W - 13, top + 5, 6, 4);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(P_X, top, P_W, h);

    // Debug state label
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 9px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(this.state.toUpperCase(), P_X + P_W / 2, top - 6);
    ctx.textAlign   = 'left';
  }
}