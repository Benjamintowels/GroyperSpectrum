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

// Foreground grass strip in front of front buildings
const GRASS_FRONT = new Image();
GRASS_FRONT.src = 'Assets/BG/GrassFront.png';

// Dark wall texture used for the foreground contrast band.
const DARK_WALL = new Image();
DARK_WALL.src = 'Assets/BG/DarkWall.png';

// Vertical baseline for all scrolling bg elements (top of contrast band).
const BG_BASE_Y = 163;
// How far the DarkWall band extends above BG_BASE_Y so it overlaps the grass (removes black strip).
const WALL_OVERLAP_ABOVE = 50;

class Background {
  constructor() {
    // Logical scroll positions (unbounded) so we can derive
    // deterministic "random" building layouts per tile without hops.
    this.bgScroll = 0;
    this.mgScroll = 0;
    this.grassScroll = 0;
    this.wallScroll = 0;
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
    // Scroll forward (positive) and derive tile positions in draw()
    this.bgScroll += speed * 0.2;
    this.mgScroll += speed * 0.55;
    this.grassScroll += speed * 0.8;
    this.wallScroll += speed * 1.0;  // faster than grass so wall reads in front
    this.bgX = 0;
    this.mgX = 0;
    this.fgX = (this.fgX - speed) % tileW;
  }

  draw(ctx, speedLevel) {
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

    // Blur so gameplay elements stand out.
    // Default: 0.3px at speed level 0.
    // Far City buildings: +0.5 blur per speed level.
    // Front buildings:    +0.3 blur per speed level.
    // Dark wall band:     +0.1 blur per speed level.
    const level = typeof speedLevel === 'number' ? Math.max(0, speedLevel) : 0;
    const cityBlur = 0.3 + 0.5 * level;
    const frontBlur = 0.3 + 0.3 * level;
    const wallBlur = 0.3 + 0.1 * level;

    // Far background buildings (city skyline) — tile indices are
    // stable in world space so buildings only leave when fully off-screen.
    ctx.save();
    ctx.filter = `blur(${cityBlur}px)`;
    ctx.fillStyle = '#181830';
    {
      const scroll = this.bgScroll;
      const firstTile = Math.floor((scroll - tileW) / tileW);
      const lastTile = Math.floor((scroll + w) / tileW);
      for (let i = firstTile; i <= lastTile; i++) {
        const ox = i * tileW - scroll;
        // Deterministic gaps so skyline occasionally disappears for a tile.
        const rng = this._seededRng(2000 + i);
        if (rng() < 0.35) continue;
        this._city(ctx, ox, i);
      }
    }
    ctx.restore();

    // Midground / front buildings + foreground grass
    ctx.save();
    ctx.filter = `blur(${frontBlur}px)`;
    ctx.fillStyle = '#101020';
    {
      const scroll = this.mgScroll;
      const firstTile = Math.floor((scroll - tileW) / tileW);
      const lastTile = Math.floor((scroll + w) / tileW);
      for (let i = firstTile; i <= lastTile; i++) {
        const ox = i * tileW - scroll;
        // Deterministic gaps in front-building layer as well.
        const rng = this._seededRng(3000 + i * 7);
        if (rng() < 0.25) continue;
        this._mid(ctx, ox, i);
      }
    }

    // Foreground grass, in front of front buildings but still behind gameplay.
    // Draw as a continuous strip keyed directly to grassScroll so it never pops.
    if (!GRASS_FRONT.complete || !GRASS_FRONT.naturalWidth) {
      // Simple fallback strip if sprite is not yet loaded.
      ctx.fillStyle = '#2a5a2a';
      ctx.fillRect(0, BG_BASE_Y - 8, w, 8);
    } else {
      const scale = 0.2;
      const gw = GRASS_FRONT.naturalWidth * scale;
      const gh = GRASS_FRONT.naturalHeight * scale;
      const baseY = BG_BASE_Y;
      if (gw > 0) {
        const span = gw;
        const offset = -((this.grassScroll % span) + span) % span;
        let x = offset - span;
        while (x < w + span) {
          const drawX = x;
          const drawY = baseY - gh;
          ctx.drawImage(GRASS_FRONT, drawX, drawY, gw, gh);
          x += span;
        }
      }
    }

    ctx.restore();

    // Ground gradually lightens with the sunrise
    const groundDark  = '#1a1a1a';
    const groundLight = '#3a301f';
    ctx.fillStyle = this._lerpColor(groundDark, groundLight, t);
    ctx.fillRect(0, 310, w, 90);

    // High-contrast foreground band behind player/obstacles, in front of grass.
    // Extends above BG_BASE_Y so DarkWall overlaps the grass and no black strip shows.
    const bandTop = BG_BASE_Y - WALL_OVERLAP_ABOVE;
    const bandHeight = 310 - bandTop; // down to ground line (y=310)
    if (DARK_WALL.complete && DARK_WALL.naturalWidth && DARK_WALL.naturalHeight) {
      // Scale DarkWall so its height exactly matches the band; tile and scroll (faster than grass).
      const scale = bandHeight / DARK_WALL.naturalHeight;
      const tileW = DARK_WALL.naturalWidth * scale;
      const tileH = bandHeight;
      if (tileW > 0) {
        ctx.save();
        ctx.filter = `blur(${wallBlur}px)`;
        const offset = -((this.wallScroll % tileW) + tileW) % tileW;
        let x = offset - tileW;
        while (x < w + tileW) {
          ctx.drawImage(
            DARK_WALL,
            0, 0, DARK_WALL.naturalWidth, DARK_WALL.naturalHeight,
            x, bandTop, tileW, tileH
          );
          x += tileW;
        }
        ctx.restore();
      }
    } else {
      // Fallback: solid black band if texture isn't ready yet.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, bandTop, w, bandHeight);
    }

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
      for (const [x, h, w] of b) ctx.fillRect(ox + x, BG_BASE_Y - h, w, h);
      return;
    }

    const tileW = 800;
    const rng = this._seededRng(tileIndex);
    let xCursor = -40 + rng() * 60;
    const baseY = BG_BASE_Y;

    while (xCursor < tileW + 60) {
      const img = imgs[Math.floor(rng() * imgs.length)];
      // Smaller scale for far background
      const scale = 0.4 + rng() * 0.25;
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
      for (const [x, h, w] of b) ctx.fillRect(ox + x, BG_BASE_Y - h, w, h);
      return;
    }

    const tileW = 800;
    const rng = this._seededRng(tileIndex * 101);
    let xCursor = -60 + rng() * 80;
    const baseY = BG_BASE_Y;

    while (xCursor < tileW + 80) {
      const img = imgs[Math.floor(rng() * imgs.length)];
      // Slightly larger scale for nearer front buildings
      const scale = 0.6 + rng() * 0.3;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const drawX = ox + xCursor;
      const drawY = baseY - h;
      ctx.drawImage(img, drawX, drawY, w, h);
      const gap = 20 + rng() * 60;
      xCursor += w + gap;
    }
  }

  _grass(ctx, ox, tileIndex) {
    if (!GRASS_FRONT.complete || !GRASS_FRONT.naturalWidth) {
      // Simple fallback strip if sprite is not yet loaded.
      ctx.fillStyle = '#2a5a2a';
      ctx.fillRect(ox, BG_BASE_Y - 8, 800, 8);
      return;
    }

    const tileW = 800;
    // Small deterministic horizontal offset variation per tile to avoid visible tiling seams.
    const rng = this._seededRng(1000 + tileIndex * 13);
    // Fixed vertical position so grass does not "pop" up/down between tiles.
    const baseY = BG_BASE_Y;
    // Scale down grass sprites by 10x.
    const scale = 0.2;
    const w = GRASS_FRONT.naturalWidth * scale;
    const h = GRASS_FRONT.naturalHeight * scale;

    // Repeat grass sprite across the tile width.
    let xCursor = -w + rng() * 40;
    while (xCursor < tileW + w) {
      const drawX = ox + xCursor;
      const drawY = baseY - h;
      ctx.drawImage(GRASS_FRONT, drawX, drawY, w, h);
      xCursor += w;
    }
  }
}