class Background {
  constructor() {
    this.bgX = 0;
    this.mgX = 0;
    this.fgX = 0;

    // Sunrise animation state
    this.sunStartTime = performance.now();
    // Duration in ms for sunrise to fully complete (clamped at 1.0)
    this.sunDuration  = 120000; // ~2 minutes
  }

  update(speed) {
    const tileW = 800; // width of one background tile
    this.bgX = (this.bgX - speed * 0.2) % tileW;
    this.mgX = (this.mgX - speed * 0.55) % tileW;
    this.fgX = (this.fgX - speed) % tileW;
  }

  draw(ctx) {
    const w = ctx.canvas ? ctx.canvas.width : 800;

    // Normalized sunrise progress 0..1 based on real time
    const now = performance.now();
    const tRaw = (now - this.sunStartTime) / this.sunDuration;
    const t = Math.max(0, Math.min(1, tRaw));

    // Tween sky from deep night to soft morning
    const skyTopStart    = '#05030b';
    const skyTopEnd      = '#78b8ff';
    const skyBottomStart = '#131325';
    const skyBottomEnd   = '#ffe0a3';

    const skyTop    = this._lerpColor(skyTopStart, skyTopEnd, t);
    const skyBottom = this._lerpColor(skyBottomStart, skyBottomEnd, t);

    const sky = ctx.createLinearGradient(0, 0, 0, 310);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(1, skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, 310);

    // Rising sun behind the skyline
    const sunX = w * 0.22;
    const sunStartY = 340;   // starts just below the horizon
    const sunEndY   = 140;   // ends well above buildings
    const sunY = this._lerp(sunStartY, sunEndY, t);
    const sunRadius = 40;
    const sunColorStart = '#a13a00'; // deep orange
    const sunColorEnd   = '#ffe97a'; // soft yellow
    const sunColor = this._lerpColor(sunColorStart, sunColorEnd, t);

    const sunGradient = ctx.createRadialGradient(
      sunX, sunY, sunRadius * 0.3,
      sunX, sunY, sunRadius * 1.8
    );
    sunGradient.addColorStop(0, sunColor);
    sunGradient.addColorStop(1, 'rgba(255, 233, 122, 0)');

    ctx.save();
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tileW = 800;

    ctx.fillStyle = '#181830';
    for (let r = 0; r < Math.ceil(w / tileW) + 1; r++) {
      this._city(ctx, this.bgX + r * tileW);
    }

    ctx.fillStyle = '#101020';
    for (let r = 0; r < Math.ceil(w / tileW) + 1; r++) {
      this._mid(ctx, this.mgX + r * tileW);
    }

    // Ground gradually lightens with the sunrise
    const groundDark  = '#1a1a1a';
    const groundLight = '#3a301f';
    ctx.fillStyle = this._lerpColor(groundDark, groundLight, t);
    ctx.fillRect(0, 310, w, 90);

    // Track edge line picks up a bit of warmth
    const lineStart = '#2c6b2c';
    const lineEnd   = '#6fd66f';
    ctx.fillStyle = this._lerpColor(lineStart, lineEnd, t);
    ctx.fillRect(0, 310, w, 2);

    ctx.fillStyle = '#222';
    const stripeCount = Math.ceil(w / 62) + 2;
    for (let i = 0; i < stripeCount; i++) {
      const sx = ((this.fgX * 1.3) + i * 62 + w * 2) % w;
      ctx.fillRect(sx, 316, 32, 3);
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _lerpColor(hexA, hexB, t) {
    const a = this._hexToRgb(hexA);
    const b = this._hexToRgb(hexB);
    const r = Math.round(this._lerp(a.r, b.r, t));
    const g = Math.round(this._lerp(a.g, b.g, t));
    const bch = Math.round(this._lerp(a.b, b.b, t));
    return `rgb(${r},${g},${bch})`;
  }

  _hexToRgb(hex) {
    let h = hex.trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return { r, g, b };
  }

  _city(ctx, ox) {
    const b = [
      [0,90,55],[65,55,48],[120,100,65],[195,65,42],
      [245,105,72],[325,48,52],[385,80,60],[450,60,48],
      [508,88,70],[588,50,55],[645,75,52],[705,95,75]
    ];
    for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
  }

  _mid(ctx, ox) {
    const b = [
      [10,42,28],[75,56,24],[145,38,36],[215,50,26],
      [290,44,32],[365,40,28],[430,52,24],[500,46,36],
      [575,38,30],[640,54,26],[710,42,33],[775,48,28]
    ];
    for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
  }
}