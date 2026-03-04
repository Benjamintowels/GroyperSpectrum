const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = 1000;
canvas.height = 400;
const VIEW_W  = canvas.width;
const VIEW_H  = canvas.height;

// Game modes (easy to extend with new entries)
const MODES = {
  endless: {
    id: 'endless',
    label: 'Endless Mode',
    description: 'Full 4-color chaos, ramps up forever.',
    colors: ['green', 'blue', 'black', 'white'],
    keyMap: [
      ['KeyA', 'green'],
      ['KeyS', 'blue'],
      ['KeyD', 'black'],
      ['KeyF', 'white'],
    ],
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure Mode',
    description: 'Starts with only green/blue — friendlier ramp.',
    // For now: single-color training wheels — always green,
    // no color swapping and only green obstacles.
    colors: ['green'],
    keyMap: [],
  },
  race: {
    id: 'race',
    label: 'Race Mode',
    description: 'Clear 75 obstacles as fast as you can. Any clear counts.',
    colors: ['green', 'blue', 'black', 'white'],
    keyMap: [
      ['KeyA', 'green'],
      ['KeyS', 'blue'],
      ['KeyD', 'black'],
      ['KeyF', 'white'],
    ],
  },
};

let currentMode = 'endless';

function getActiveMode() {
  return MODES[currentMode] || MODES.endless;
}

// Used by player / obstacles so new modes only touch this config
function getActiveColors() {
  return getActiveMode().colors;
}

function getActiveColorKeyMap() {
  return getActiveMode().keyMap;
}

const keysDown = new Set();
const touchKeys = new Map(); // touchId -> keyCode (for mobile)
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
function isKeyDown(code) {
  return keysDown.has(code) || [...touchKeys.values()].includes(code);
}
window.addEventListener('keydown', e => { keysDown.add(e.code); e.preventDefault(); });
window.addEventListener('keyup',   e => keysDown.delete(e.code));

// Touch layout: right = up/down, left = diamond (4 colors)
const TOUCH = {
  rightX: 520,
  splitY: 200,
  diamondCenter: { x: 160, y: 200 },
  diamondRadius: 80,
  buttonRadius: 44,
  colorKeys: [
    { x: 0, y: -1, code: 'KeyA' },
    { x: 1, y: 0, code: 'KeyS' },
    { x: 0, y: 1, code: 'KeyD' },
    { x: -1, y: 0, code: 'KeyF' },
  ],
};
function getTouchPos(t, rect) {
  if (!rect) rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
}
function getTouchKey(x, y) {
  if (x >= TOUCH.rightX)
    return y < TOUCH.splitY ? 'ArrowUp' : 'ArrowDown';
  const c = TOUCH.diamondCenter;
  const r = TOUCH.diamondRadius;
  let best = null, bestD = Infinity;
  TOUCH.colorKeys.forEach(({ x: dx, y: dy, code }) => {
    const px = c.x + dx * r, py = c.y + dy * r;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < TOUCH.buttonRadius ** 2 && d < bestD) { bestD = d; best = code; }
  });
  return best;
}

function getModeButtons() {
  const btnW     = 260;
  const btnH     = 48;
  const spacing  = 16;
  const startY   = 110;
  const centerX  = VIEW_W / 2 - btnW / 2;
  const buttons  = [];
  const entries  = [MODES.endless, MODES.adventure, MODES.race];
  for (let i = 0; i < entries.length; i++) {
    const m = entries[i];
    buttons.push({
      modeId: m.id,
      label:  m.label,
      desc:   m.description,
      x:      centerX,
      y:      startY + i * (btnH + spacing),
      w:      btnW,
      h:      btnH,
    });
  }
  return buttons;
}

function hitTestModeButton(x, y) {
  for (const b of getModeButtons()) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.modeId;
  }
  return null;
}

function startRun(modeId) {
  currentMode = modeId || currentMode || 'endless';
  gameOver    = false;
  startScreen = false;
  frameCount  = 0;
  score       = 0;
  speedMeter  = 0;
  raceCompletedTime = null;
  if (currentMode === 'race') {
    raceStartTime = Date.now();
    raceObstaclesCleared = 0;
  } else {
    raceStartTime = null;
    raceObstaclesCleared = 0;
  }
  keysDown.clear();
  touchKeys.clear();
  player.reset();
  obsMgr.reset();
}
function onTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  if (startScreen) {
    const rect = canvas.getBoundingClientRect();
    if (e.changedTouches.length > 0) {
      const t   = e.changedTouches[0];
      const pos = getTouchPos(t, rect);
      const m   = hitTestModeButton(pos.x, pos.y);
      if (m) startRun(m);
    }
    return;
  }
  if (gameOver) {
    gameOver    = false;
    startScreen = true;
    frameCount  = 0;
    score       = 0;
    speedMeter  = 0;
    keysDown.clear();
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (e.changedTouches.length > 0 && speedMeter >= METER_MAX) {
    const t = e.changedTouches[0];
    const pos = getTouchPos(t, rect);
    if (hitTestMeter(pos.x, pos.y)) {
      trySpeedBoost();
      return;
    }
  }
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const pos = getTouchPos(t, rect);
    const code = getTouchKey(pos.x, pos.y);
    if (code) touchKeys.set(t.identifier, code);
  }
}
function onTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++)
    touchKeys.delete(e.changedTouches[i].identifier);
}
function onTouchCancel(e) {
  for (let i = 0; i < e.changedTouches.length; i++)
    touchKeys.delete(e.changedTouches[i].identifier);
}
canvas.addEventListener('touchstart', onTouchStart, { passive: false });
canvas.addEventListener('touchend', onTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });
canvas.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (startScreen) {
    const m = hitTestModeButton(x, y);
    if (m) startRun(m);
    return;
  }
  if (!gameOver && speedMeter >= METER_MAX && hitTestMeter(x, y)) trySpeedBoost();
});

const bg     = new Background();
const player = new Player();
const obsMgr = new ObstacleManager();

let frameCount  = 0;
let lastTime    = 0;
let gameOver    = false;
let score       = 0;
let highScore   = Number(localStorage.getItem('gs_highscore') || 0);
let raceHighScore = Number(localStorage.getItem('gs_race_highscore') || Infinity); // best = lowest time (seconds)
let startScreen = true;
let raceStartTime = null;       // Date.now() when race started
let raceObstaclesCleared = 0;   // 0..75
let raceCompletedTime = null;  // seconds when finished 75
let speedMeter  = 0;  // 0–5; fills as you pass obstacles; cash in with ArrowRight (or tap meter when full)

const METER_MAX = 5;
const METER_RECT = { x: VIEW_W - 140, y: 14, w: 120, h: 28 };

function trySpeedBoost() {
  if (gameOver || startScreen || speedMeter < METER_MAX) return false;
  speedMeter = 0;
  obsMgr.increaseSpeed();
  player.playBoostLurch();
  return true;
}

function hitTestMeter(x, y) {
  const r = METER_RECT;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function checkCollisions() {
  for (const obs of obsMgr.obstacles) {

    // Rail logic — separate from other obstacles
    if (obs.type === 'rail') {

      // If currently grinding this rail, check if we've reached the end
      if (player.activeRail === obs) {
        if (player.right > obs.right) player.leaveRail();
        continue;
      }

      // Landing on rail
      if (obs.overlaps(player)) {
        if (!obs.playerSurvives(player)) {
          triggerGameOver();
        } else {
          player.landOnRail(obs);
        }
      }
      continue;
    }

    // All other obstacles
    const hOverlap = player.right > obs.left + 5 && player.left < obs.right - 5;
    if (!obs.overlaps(player)) {
      // Barrel: can jump cleanly over (no vertical overlap); still count as cleared if jump + correct color while barrel is in our lane
      if (obs.type === 'barrel' && hOverlap && player.state === 'jump' && player.color === obs.color) obs.clearedForMeter = true;
      continue;
    }
    if (!obs.playerSurvives(player)) triggerGameOver();
    else if (obs.type === 'gate' || obs.type === 'barrel') obs.clearedForMeter = true;
  }

  // Color swap on rail check is handled inside player.handleInput
  if (player.state === 'dead') triggerGameOver();
}

function triggerGameOver() {
  if (gameOver) return;
  gameOver = true;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('gs_highscore', String(highScore));
  }
  console.log('DEAD — player color:', player.color, '| state:', player.state);
}

function loop(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  if (startScreen) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    bg.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 1.8rem monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TOAD RUNNER', VIEW_W / 2, 70);

    // Mode buttons
    const buttons = getModeButtons();
    ctx.font = 'bold 1rem monospace';
    buttons.forEach(b => {
      const isActive = getActiveMode().id === b.modeId;
      ctx.fillStyle = isActive ? 'rgba(80,180,80,0.9)' : 'rgba(0,0,0,0.75)';
      ctx.strokeStyle = isActive ? '#7f7' : '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 4);
    });

    ctx.font = 'bold 0.8rem monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('PRESS ANY KEY TO START CURRENT MODE', VIEW_W / 2, 190 + buttons.length * 60);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('CONTROLS', 120, 210);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('ASDF — swap colors (varies by mode)', 120, 228);
    ctx.fillText('↑ — jump (hold for height)', 120, 244);
    ctx.fillText('↓ — duck on ground / cancel jump in air', 120, 260);
    ctx.fillText('→ — boost speed when meter is full (5 obstacles)', 120, 276);
    ctx.fillText('← — slow down one notch', 120, 292);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('OBSTACLES', 120, 308);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('Barrel — jump + match color', 120, 326);
    ctx.fillText('Ceiling — duck + match color', 120, 342);
    ctx.fillText('Gate — match color, do not jump', 120, 358);
    ctx.fillText('Rail — jump onto + match color to grind', 120, 374);
    ctx.fillText('Gap — jump over (touch = death)', 120, 390);

    ctx.textAlign = 'left';
    requestAnimationFrame(loop);
    return;
  }

  if (!gameOver) {
    frameCount++;
    player.handleInput();
    player.update(dt);
    obsMgr.update(dt, frameCount, score);
    const frameScale = dt / 16.67;
    bg.update(obsMgr.speed * frameScale);
    checkCollisions();

    // Award points for any obstacle that has fully passed the player; fill speed meter only when cleared correctly (gate: through, barrel: jump+color)
    for (const obs of obsMgr.obstacles) {
      if (!obs.scored && obs.right < player.left) {
        obs.scored = true;
        score++;
        if (currentMode === 'race') {
          raceObstaclesCleared++;
          if (raceObstaclesCleared >= 75) {
            raceCompletedTime = (Date.now() - raceStartTime) / 1000;
            gameOver = true;
            if (raceCompletedTime < raceHighScore) {
              raceHighScore = raceCompletedTime;
              localStorage.setItem('gs_race_highscore', String(raceHighScore));
            }
          }
        }
        const giveMeter = (obs.type !== 'gate' && obs.type !== 'barrel') || obs.clearedForMeter;
        if (speedMeter < METER_MAX && giveMeter) speedMeter++;
      }
    }
  }

  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  bg.draw(ctx);
  obsMgr.draw(ctx);
  player.draw(ctx);

  // Score HUD (or Race HUD when in race mode)
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 16px monospace';
  ctx.textAlign = 'left';
  if (currentMode === 'race') {
    const raceTime = raceCompletedTime != null
      ? raceCompletedTime
      : (raceStartTime != null ? (Date.now() - raceStartTime) / 1000 : 0);
    const mins = Math.floor(raceTime / 60);
    const secs = (raceTime % 60).toFixed(2);
    ctx.fillText(`TIME: ${mins}:${secs.padStart(5, '0')}`, 16, 28);
    ctx.fillText(`OBSTACLES: ${raceObstaclesCleared}/75`, 16, 50);
    if (raceHighScore !== Infinity) {
      const bestM = Math.floor(raceHighScore / 60);
      const bestS = (raceHighScore % 60).toFixed(2);
      ctx.fillText(`RACE BEST: ${bestM}:${bestS.padStart(5, '0')}`, 16, 72);
    }
  } else {
    ctx.fillText(`SCORE: ${score}${score >= 50 ? ' ★' : ''}`, 16, 28);
    ctx.fillText(`BEST:  ${highScore}`, 16, 50);
  }

  // Speed meter (0–5) and speed gauge — only during active play
  if (!startScreen && !gameOver) {
    const r = METER_RECT;
    const full = speedMeter >= METER_MAX;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = full ? '#fc0' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const fillW = (speedMeter / METER_MAX) * (r.w - 4);
    if (fillW > 0) {
      ctx.fillStyle = full ? '#fa0' : '#3a8';
      ctx.fillRect(r.x + 2, r.y + 2, fillW, r.h - 4);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOOST', r.x + r.w / 2, r.y + 10);
    ctx.fillText(full ? '→ TO GO' : `${speedMeter}/${METER_MAX}`, r.x + r.w / 2, r.y + 22);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SPEED ${obsMgr.difficulty + 1}`, r.x, r.y + r.h + 16);
  }

  // Touch control overlay (left diamond = colors, right = up/down) — only on touch devices
  if (!startScreen && isTouchDevice) {
    const c = TOUCH.diamondCenter;
    const r = TOUCH.diamondRadius;
    const br = TOUCH.buttonRadius;
    const colors = ['#3d3', '#38f', '#555', '#ddd'];
    TOUCH.colorKeys.forEach(({ x: dx, y: dy }, i) => {
      const px = c.x + dx * r, py = c.y + dy * r;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(px, py, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = colors[i];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(px, py, br - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(TOUCH.rightX, 0, VIEW_W - TOUCH.rightX, TOUCH.splitY);
    ctx.fillRect(TOUCH.rightX, TOUCH.splitY, VIEW_W - TOUCH.rightX, VIEW_H - TOUCH.splitY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(TOUCH.rightX, 0, VIEW_W - TOUCH.rightX, TOUCH.splitY);
    ctx.strokeRect(TOUCH.rightX, TOUCH.splitY, VIEW_W - TOUCH.rightX, VIEW_H - TOUCH.splitY);
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('↑', TOUCH.rightX + (VIEW_W - TOUCH.rightX) / 2, TOUCH.splitY / 2 + 6);
    ctx.fillText('↓', TOUCH.rightX + (VIEW_W - TOUCH.rightX) / 2, TOUCH.splitY + (VIEW_H - TOUCH.splitY) / 2 + 6);
    ctx.textAlign = 'left';
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    if (currentMode === 'race' && raceCompletedTime != null) {
      ctx.fillStyle = '#4f4';
      ctx.font = 'bold 2.2rem monospace';
      ctx.fillText('COMPLETE', VIEW_W / 2, VIEW_H / 2 - 24);
      const m = Math.floor(raceCompletedTime / 60);
      const s = (raceCompletedTime % 60).toFixed(2);
      ctx.font = 'bold 1.4rem monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Time: ${m}:${s.padStart(5, '0')}`, VIEW_W / 2, VIEW_H / 2 + 12);
      if (raceHighScore !== Infinity) {
        const bm = Math.floor(raceHighScore / 60);
        const bs = (raceHighScore % 60).toFixed(2);
        ctx.font = 'bold 1rem monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(`Race Highscore: ${bm}:${bs.padStart(5, '0')}`, VIEW_W / 2, VIEW_H / 2 + 44);
      }
      ctx.font = 'bold 1rem monospace';
      ctx.fillText('PRESS ANY BUTTON FOR MENU', VIEW_W / 2, VIEW_H / 2 + 76);
    } else {
      ctx.fillStyle = '#f44';
      ctx.font = 'bold 2rem monospace';
      ctx.fillText('PRESS ANY BUTTON FOR MENU', VIEW_W / 2, VIEW_H / 2);
    }
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
  if (startScreen) {
    // Keyboard: start the currently highlighted mode
    startRun(currentMode || 'endless');
    return;
  }
  if (!gameOver && e.code === 'ArrowRight' && trySpeedBoost()) return;
  if (!gameOver && e.code === 'ArrowLeft') obsMgr.decreaseSpeed();
  if (gameOver) {
    gameOver    = false;
    startScreen = true;
    frameCount  = 0;
    score       = 0;
    keysDown.clear();
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
  }
});

requestAnimationFrame(loop);