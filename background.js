// Preload background building sprite sets
const CITY_BUILDING_SOURCES = [
  'Assets/BG/CityBuilding1.png',
  'Assets/BG/CityBuilding2.png',
  'Assets/BG/CityBuilding3.png',
  'Assets/BG/CityBuilding4.png',
  'Assets/BG/CityBuilding5.png',
];

const FRONT_BUILDING_SOURCES = [
  'Assets/BG/FrontBuilding1.png',
  'Assets/BG/FrontBuilding2.png',
  'Assets/BG/FrontBuilding3.png',
  'Assets/BG/FrontBuilding4.png',
  'Assets/BG/FrontBuilding5.png',
  'Assets/BG/FrontBuilding6.png',
];

const CITY_BUILDINGS = CITY_BUILDING_SOURCES.map(src => {
  const img = new Image();
  img.src = src;
  return img;
});

const FRONT_BUILDINGS = FRONT_BUILDING_SOURCES.map(src => {
  const img = new Image();
  img.src = src;
  return img;
});

class Background {
  constructor() {
    // Logical scroll positions (unbounded) so we can derive
    // deterministic "random" building layouts per tile.
    this.bgScroll = 0;
    this.mgScroll = 0;
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
    this.bgScroll -= speed * 0.2;
    this.mgScroll -= speed * 0.55;
    this.bgX = this.bgScroll % tileW;
    this.mgX = this.mgScroll % tileW;
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
    const tilesNeeded = Math.ceil(w / tileW) + 2;

    // Far background buildings (city skyline)
    ctx.fillStyle = '#181830';
    for (let r = 0; r < tilesNeeded; r++) {
      const ox = this.bgX + r * tileW;
      const tileIndex = Math.floor(this.bgScroll / tileW) + r;
      this._city(ctx, ox, tileIndex);
    }

    // Midground / front buildings
    ctx.fillStyle = '#101020';
    for (let r = 0; r < tilesNeeded; r++) {
      const ox = this.mgX + r * tileW;
      const tileIndex = Math.floor(this.mgScroll / tileW) + r;
      this._mid(ctx, ox, tileIndex);
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

  // Deterministic pseudo-random generator based on tile index
  _seededRng(seed) {
    let x = (seed | 0) + 0x6d2b79f5;
    return function next() {
      x |= 0;
      x = (x + 0x6d2b79f5) | 0;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _city(ctx, ox, tileIndex) {
    const imgs = CITY_BUILDINGS.filter(img => img.complete && img.naturalWidth > 0);
    if (!imgs.length) {
      // Fallback to simple rectangles if sprites are not ready yet.
      const b = [
        [0, 90, 55],
        [65, 55, 48],
        [120, 100, 65],
        [195, 65, 42],
        [245, 105, 72],
        [325, 48, 52],
        [385, 80, 60],
        [450, 60, 48],
        [508, 88, 70],
        [588, 50, 55],
        [645, 75, 52],
        [705, 95, 75],
      ];
      for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
      return;
    }

    const tileW = 800;
    const rng = this._seededRng(tileIndex);
    let xCursor = -40 + rng() * 60;
    const baseY = 310;

    while (xCursor < tileW + 60) {
      const img = imgs[Math.floor(rng() * imgs.length)];
      const scale = 0.9 + rng() * 0.3; // small variation in height/width
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const drawX = ox + xCursor;
      const drawY = baseY - h;
      ctx.drawImage(img, drawX, drawY, w, h);
      const gap = 10 + rng() * 40;
      xCursor += w + gap;
    }
  }

  _mid(ctx, ox, tileIndex) {
    const imgs = FRONT_BUILDINGS.filter(img => img.complete && img.naturalWidth > 0);
    if (!imgs.length) {
      const b = [
        [10, 42, 28],
        [75, 56, 24],
        [145, 38, 36],
        [215, 50, 26],
        [290, 44, 32],
        [365, 40, 28],
        [430, 52, 24],
        [500, 46, 36],
        [575, 38, 30],
        [640, 54, 26],
        [710, 42, 33],
        [775, 48, 28],
      ];
      for (const [x, h, w] of b) ctx.fillRect(ox + x, 310 - h, w, h);
      return;
    }

    const tileW = 800;
    const rng = this._seededRng(tileIndex * 101);
    let xCursor = -60 + rng() * 80;
    const baseY = 310;

    while (xCursor < tileW + 80) {
      const img = imgs[Math.floor(rng() * imgs.length)];
      const scale = 0.95 + rng() * 0.35;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const drawX = ox + xCursor;
      const drawY = baseY - h;
      ctx.drawImage(img, drawX, drawY, w, h);
      const gap = 20 + rng() * 60;
      xCursor += w + gap;
    }
  }
}